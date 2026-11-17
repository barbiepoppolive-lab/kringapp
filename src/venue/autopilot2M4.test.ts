import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_VOUCHER_BUY_URL,
  fallbackAutopilotState,
  fallbackHealthWatch,
  fallbackSelfFixStatus,
  planSelfFixRun,
  reconcileSelfFixAlerts,
  type SelfFixStatus,
} from './autopilotLogic';

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const storageRemoved: { bucket: string; paths: string[] }[] = [];

let mockSf: SelfFixStatus = {
  at: '2026-11-18T03:00:00Z',
  mode: 'dry_run',
  pdpa_sla_hours: 12,
  pdpa_queued: 2,
  other_trash_queued: 1,
  pdpa_late: 2,
  oldest_queued_hours: 19.4,
  orphan_candidates: 3,
  stale_threads: 4,
  stale_holds: 1,
  stuck_geo: 1,
  stuck_push: 2,
  available_vouchers: 4,
  restock_warn_at: 5,
  voucher_buy_url: DEFAULT_VOUCHER_BUY_URL,
};

vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return {
    ...actual,
    rpc: vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push({ fn, args });
      if (fn === 'kr8_admin_autopilot_state') {
        return { ...fallbackAutopilotState(), fallback: false, pg_cron_available: true };
      }
      if (fn === 'kr8_admin_health_watch') {
        return fallbackHealthWatch();
      }
      if (fn === 'kr8_admin_self_fix_status') {
        return structuredClone(mockSf);
      }
      if (fn === 'kr8_admin_verify_files_due') {
        return [
          { id: '11111111-1111-1111-1111-111111111111', selfie_path: 'aaaa/selfie1.jpg' },
          { id: '22222222-2222-2222-2222-222222222222', selfie_path: 'bbbb/selfie2.jpg' },
        ];
      }
      if (fn === 'kr8_admin_mark_selfies_deleted') {
        mockSf = { ...mockSf, pdpa_queued: 0, pdpa_late: 0, oldest_queued_hours: 0 };
        return 2;
      }
      if (fn === 'kr8_admin_storage_trash') {
        return [{ id: '33333333-3333-3333-3333-333333333333', bucket: 'kr8-reels', name: 'cccc/orphan.mp4' }];
      }
      if (fn === 'kr8_admin_storage_trash_done') {
        mockSf = { ...mockSf, other_trash_queued: 0 };
        return 1;
      }
      return {};
    }),
    v5Client: vi.fn(async () => ({
      auth: { getSession: async () => ({ data: {}, error: null }) },
      storage: {
        from: (bucket: string) => ({
          list: async () => ({ data: [], error: null }),
          remove: async (paths: string[]) => {
            storageRemoved.push({ bucket, paths });
            return { data: paths, error: null };
          },
        }),
      },
    })),
  };
});

describe('T-380 M4: Self-Fix Robot (safe only, PDPA SLA alert, <=5 voucher buy link, undoable)', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    storageRemoved.length = 0;
    mockSf = {
      at: '2026-11-18T03:00:00Z',
      mode: 'dry_run',
      pdpa_sla_hours: 12,
      pdpa_queued: 2,
      other_trash_queued: 1,
      pdpa_late: 2,
      oldest_queued_hours: 19.4,
      orphan_candidates: 3,
      stale_threads: 4,
      stale_holds: 1,
      stuck_geo: 1,
      stuck_push: 2,
      available_vouchers: 4,
      restock_warn_at: 5,
      voucher_buy_url: DEFAULT_VOUCHER_BUY_URL,
    };
    document.body.innerHTML = '<main id="app"></main>';
  });

  it('defaults self_fix to dry_run and raises RED alert when PDPA deletion is late + restock buy link at <=5 vouchers', () => {
    const def = fallbackSelfFixStatus();
    expect(def.mode).toBe('dry_run');

    const r1 = reconcileSelfFixAlerts([], mockSf, '2026-11-18T03:05:00Z');
    expect(r1.raised).toEqual(expect.arrayContaining(['selffix:pdpa_late', 'selffix:voucher_restock', 'selffix:stale_holds']));

    const pdpaAlert = r1.alerts.find((a) => a.dedupe_key === 'selffix:pdpa_late')!;
    expect(pdpaAlert.severity).toBe('red');
    expect(pdpaAlert.title).toContain('PDPA file deletion overdue');

    const restockAlert = r1.alerts.find((a) => a.dedupe_key === 'selffix:voucher_restock')!;
    expect(restockAlert.severity).toBe('amber');
    expect(restockAlert.body).toContain(DEFAULT_VOUCHER_BUY_URL);
    expect(restockAlert.detail?.buy_url).toBe(DEFAULT_VOUCHER_BUY_URL);

    // Once PDPA deletions finish and vouchers are restocked >5, alerts auto-clear cleanly
    const healthy: SelfFixStatus = {
      ...mockSf,
      pdpa_late: 0,
      pdpa_queued: 0,
      available_vouchers: 14,
      stale_holds: 0,
    };
    const r2 = reconcileSelfFixAlerts(r1.alerts, healthy, '2026-11-18T03:20:00Z');
    expect(r2.cleared).toEqual(expect.arrayContaining(['selffix:pdpa_late', 'selffix:voucher_restock', 'selffix:stale_holds']));
    expect(r2.alerts).toHaveLength(0);
  });

  it('plans DRY-RUN previews vs ON undoable actions, enforces daily_cap, and never auto-pays/refuses held claims', () => {
    const dryPlan = planSelfFixRun(mockSf, 'dry_run', 100, 0);
    expect(dryPlan.skipped).toBe(false);
    expect(dryPlan.actions.every((a) => a.dry_run && a.undo_kind === null)).toBe(true);
    expect(dryPlan.actions.map((a) => a.action)).toEqual([
      'would_expire_stale_thread',
      'would_queue_orphan_file',
      'would_retry_stuck_place_geo',
      'would_retry_stuck_push_outbox',
    ]);
    // Held payouts (stale_holds = 1) are NEVER touched in actions
    expect(dryPlan.actions.some((a) => a.action.includes('hold') || a.action.includes('claim'))).toBe(false);

    const cappedOnPlan = planSelfFixRun(mockSf, 'on', 6, 0);
    expect(cappedOnPlan.capReached).toBe(true);
    const totalActed = cappedOnPlan.actions.reduce((n, a) => n + a.count, 0);
    expect(totalActed).toBe(6); // 4 stale threads + 2 of 3 orphans
    expect(cappedOnPlan.actions[0].undo_kind).toBe('reopen_thread');
    expect(cappedOnPlan.actions[1].undo_kind).toBe('unqueue_trash');

    const offPlan = planSelfFixRun(mockSf, 'off', 100, 0);
    expect(offPlan.skipped).toBe(true);
    expect(offPlan.actions).toHaveLength(0);
  });

  it('renders #apSelfFixCard in English only, exposes supplier buy link, and flushes queued PDPA + media deletions', async () => {
    const { autopilotView } = await import('./adminV2');
    await autopilotView();

    const card = document.getElementById('apSelfFixCard')!;
    expect(card).toBeTruthy();
    expect(card.classList.contains('late')).toBe(true);
    expect(card.textContent).toContain('2 PDPA LATE');
    expect(card.textContent).toContain('Restock vouchers (4 left)');

    const buyLink = document.getElementById('apBuyVouchersLink') as HTMLAnchorElement;
    expect(buyLink.href).toContain('seagm.com/truemoney-wallet-thailand');

    // Admin text must be 100% English (zero Thai characters)
    expect(/[\u0E00-\u0E7F]/.test(document.body.textContent || '')).toBe(false);

    // Flush queued storage deletions -> clears PDPA late badge
    const flushBtn = document.getElementById('apFlushTrashBtn') as HTMLButtonElement;
    flushBtn.click();
    await new Promise((r) => setTimeout(r, 30));

    expect(storageRemoved).toEqual([
      { bucket: 'kr8-verify', paths: ['aaaa/selfie1.jpg', 'bbbb/selfie2.jpg'] },
      { bucket: 'kr8-reels', paths: ['cccc/orphan.mp4'] },
    ]);
    expect(document.getElementById('apSelfFixCard')!.textContent).toContain('PDPA on time');
  });
});
