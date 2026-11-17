import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  evaluateHealthChecks,
  fallbackAutopilotState,
  reconcileHealthAlerts,
  type HealthWatchReport,
} from './autopilotLogic';

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

let mockHw: HealthWatchReport = {
  at: '2026-11-18T02:30:00Z',
  mode: 'on',
  all_ok: false,
  checks: evaluateHealthChecks({
    availableVouchers: 4, // <= 5 -> FAIL
    rpcMs: 2450,          // >= 2000 -> FAIL
    dbMb: 42.5,
    storageMb: 110.2,
  }),
};

vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return {
    ...actual,
    rpc: vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push({ fn, args });
      if (fn === 'kr8_admin_autopilot_state') return { ...fallbackAutopilotState(), fallback: false, pg_cron_available: true };
      if (fn === 'kr8_admin_health_watch') {
        if (args.p_run) {
          mockHw = {
            at: new Date().toISOString(),
            mode: 'on',
            all_ok: true,
            checks: evaluateHealthChecks({ availableVouchers: 18, rpcMs: 85, dbMb: 42.5, storageMb: 110.2 }),
          };
        }
        return structuredClone(mockHw);
      }
      return {};
    }),
    v5Client: vi.fn(async () => ({
      auth: { getSession: async () => ({ data: {}, error: null }) },
      storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
    })),
  };
});

describe('T-380 M3: Health Watch (8 checks, red alerts, auto-clear when fixed)', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    mockHw = {
      at: '2026-11-18T02:30:00Z',
      mode: 'on',
      all_ok: false,
      checks: evaluateHealthChecks({ availableVouchers: 4, rpcMs: 2450, dbMb: 42.5, storageMb: 110.2 }),
    };
    document.body.innerHTML = '<main id="app"></main>';
  });

  it('evaluates all 8 checks, raises RED alerts on failure, and auto-clears them when fixed', () => {
    const broken = evaluateHealthChecks({
      dbOk: true,
      authOk: true,
      storageOk: true,
      rpcMs: 2300,           // > 2000 ms -> FAIL
      faceCheckOk: true,
      availableVouchers: 5,  // must be > 5 -> FAIL at 5!
      dbMb: 470,             // 94% of 500 MB -> FAIL
      dbLimitMb: 500,
      storageMb: 120,
      storageLimitMb: 1024,
      staleHeartbeats: ['protect'], // stale -> FAIL
    });

    expect(broken.length).toBe(8);
    expect(broken.filter((c) => !c.ok).map((c) => c.key)).toEqual([
      'rpc_speed',
      'voucher_stock',
      'quotas',
      'heartbeats',
    ]);

    const step1 = reconcileHealthAlerts([], broken, '2026-11-18T02:00:00Z');
    expect(step1.raised).toEqual(['rpc_speed', 'voucher_stock', 'quotas', 'heartbeats']);
    expect(step1.alerts.every((a) => a.severity === 'red')).toBe(true);
    expect(step1.alerts.find((a) => a.dedupe_key === 'health:voucher_stock')?.href).toBe('#codes');

    // Now fix all 4 failing conditions -> alerts auto-clear immediately!
    const fixed = evaluateHealthChecks({
      rpcMs: 95,
      availableVouchers: 16,
      dbMb: 48,
      storageMb: 120,
      staleHeartbeats: [],
    });
    expect(fixed.every((c) => c.ok)).toBe(true);

    const step2 = reconcileHealthAlerts(step1.alerts, fixed, '2026-11-18T02:15:00Z');
    expect(step2.cleared.sort()).toEqual(['heartbeats', 'quotas', 'rpc_speed', 'voucher_stock']);
    expect(step2.alerts.length).toBe(0);
  });

  it('renders 8-check Health Watch scorecard on #autopilot and probes live when "Run all 8 checks" is tapped', async () => {
    const { v2Route } = await import('./adminV2');
    expect(v2Route('autopilot')).toBe(true);

    await vi.waitFor(() => expect(document.querySelectorAll('#apHealthGrid .ap-hitem').length).toBe(8));
    expect(document.getElementById('apHealthCard')?.textContent).toContain('Health watch · 6/8 green');
    expect(document.querySelector('[data-hkey="rpc_speed"]')?.className).toContain('bad');
    expect(document.querySelector('[data-hkey="voucher_stock"]')?.className).toContain('bad');

    // Tap "Run all 8 checks" -> recovers to 8/8 green
    (document.getElementById('apHealthRunBtn') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.getElementById('apHealthCard')?.textContent).toContain('Health watch · 8/8 green'));
    expect(rpcCalls.some((c) => c.fn === 'kr8_admin_health_watch' && c.args.p_run === true)).toBe(true);
  });
});
