import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeVoucherRunway,
  sortRobotAlerts,
  synthesizeMorningBrief,
  type MorningBriefData,
  type RobotAlert,
} from './autopilotLogic';
import type { Snapshot } from './adminV2Logic';

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

const mockSnap: Snapshot = {
  at: '2026-11-18T02:00:00Z',
  day_start: '2026-11-18T00:00:00+05:30',
  week_start: '2026-11-16T17:00:00Z',
  include_test: false,
  counts: { real: 42, real_today: 5, test: 3, team: 1, ghost: 2, admin: 1, nocard: 4 },
  people: [
    {
      user_id: 'u-1',
      kind: 'real',
      no: 580, // intentionally huge member_no so test proves we NEVER use member_no as member count!
      name: 'Nok',
      who: 'local',
      area: 'Ari',
      joined_at: '2026-11-18T01:10:00Z',
      last_active_at: '2026-11-18T01:40:00Z',
      ref: 'pich',
      src: null,
      verified: true,
      ig: 'nok',
      tt: null,
      has_photo: true,
      photo_check: 'ok',
      email_hint: null,
      line: true,
      trust: { score: 90, reasons: ['+30 face verified', '+10 real photo', '+10 approved Reel'] },
      check: { id: 'fc-1', status: 'approved', at: '2026-11-18T01:15:00Z', auto: 'pass', reason: null },
      reels: { live: 2, waiting: 0, hidden: 0, board_off: 0, board_off_reason: null },
      claims: { n: 1, paid: 0, held: 1, thb: 0, first_at: '2026-11-18T01:30:00Z' },
      links: [],
      shared_net: 0,
      refs: 0,
      board: { rank: 1, rings: 35 },
      score: { likes: 10, saves: 5, opens: 2, score: 35 },
    },
  ],
  claims: [
    {
      id: 'cl-held-1',
      user_id: 'u-1',
      no: 580,
      name: 'Nok',
      brand: 'truemoney',
      amount: 600,
      status: 'pending',
      held: true,
      used: false,
      created_at: '2026-11-18T01:30:00Z',
      assigned_at: null,
      is_test: false,
      hold_reason: 'review',
      decided: null,
      decided_at: null,
      face_dist: null,
      joined_at: '2026-11-18T01:10:00Z',
      hold_others: null,
      prize: { kind: 'weekly', week: '2026-11-09', rank: 3 },
    },
    ...Array.from({ length: 14 }, (_, k) => ({
      id: `cl-paid-${k}`,
      user_id: `u-paid-${k}`,
      no: 10 + k,
      name: `Member${k}`,
      brand: 'truemoney',
      amount: 100,
      status: 'assigned' as const,
      held: false,
      used: false,
      created_at: '2026-11-15T10:00:00Z',
      assigned_at: '2026-11-15T10:01:00Z',
      is_test: false,
      hold_reason: null,
      decided: null,
      decided_at: null,
      face_dist: null,
      joined_at: '2026-11-10T10:00:00Z',
      hold_others: null,
      prize: { kind: 'founding', week: null, rank: null },
    })),
  ],
  codes: [{ brand: 'truemoney', amount: 100, available: 4, assigned: 14, used: 0 }],
  board: { week_start: '2026-11-16T17:00:00Z', paid_ranks: 8, floor: 25, rows: [] },
  pending: {
    reels: [{ id: 'r-wait-1', user_id: 'u-1', at: '2026-11-18T01:20:00Z', poster_path: null, video_path: 'v.mp4', body: 'Ari cafe' }],
    checks: [{ id: 'c-wait-1', user_id: 'u-1', at: '2026-11-18T01:22:00Z', auto: 'review', review: ['borderline_match'], selfie_path: null }],
    reports: 2,
    places: 0,
  },
  alerts: [{ kind: 'email', subject: 'Held claim', at: '2026-11-18T01:31:00Z', sent: false, error: 'SMTP_OFF' }],
  places_auto: [],
  dups_auto: [],
};

const mockMorningBriefRpc: MorningBriefData = {
  at: '2026-11-18T02:00:00Z',
  day_start: '2026-11-18T00:00:00+05:30',
  alerts: [
    {
      id: 'a-grey-1',
      dedupe_key: 'fyi:self_fix',
      robot: 'self_fix',
      severity: 'grey',
      title: '2 stale pending threads expired cleanly',
      body: 'Logged with Undo in Autopilot.',
      href: '#autopilot',
      at: '2026-11-18T01:50:00Z',
    },
    {
      id: 'a-red-1',
      dedupe_key: 'health:rpc_slow',
      robot: 'health_watch',
      severity: 'red',
      title: 'Heartbeat stale on protect job (34m ago)',
      body: 'Scheduled 15-min check missed two beats.',
      href: '#autopilot',
      at: '2026-11-18T01:55:00Z',
    },
    {
      id: 'a-amber-1',
      dedupe_key: 'sys:held_claims',
      robot: 'protect',
      severity: 'amber',
      title: '1 held payout (฿600) waiting for your tap',
      body: 'Money Robot scored WAIT — review card below.',
      href: '#inbox',
      at: '2026-11-18T01:30:00Z',
      synthetic: true,
    },
  ],
  brief: {
    new_members: { today: 5, total: 42 },
    face_checks: { today: 6, pass: 4, waiting: 1, refused: 1 },
    posts: { reels_today: 3, reels_waiting: 1, reels_live: 19, asks_today: 1 },
    held_payouts: { count: 1, thb: 600 },
    voucher_stock: { available: 4, burn_7d: 14, daily_burn: 2, days_left: 2 },
    errors: { client_24h: 2, outbox_failed_24h: 1, robot_failed_24h: 0, total: 3 },
    top3_needs_you: [
      { severity: 'red', title: 'Heartbeat stale on protect job (34m ago)', sub: 'Check Autopilot switches.', href: '#autopilot' },
      { severity: 'amber', title: 'Voucher stock low: 4 left (~2d left)', sub: 'Top up TrueMoney / Grab codes.', href: '#codes' },
      { severity: 'amber', title: '1 held payout (฿600) waiting for your tap', sub: 'Money Robot scored WAIT.', href: '#inbox' },
    ],
  },
};

vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return {
    ...actual,
    rpc: vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push({ fn, args });
      if (fn === 'kr8_admin_v2_snapshot') return structuredClone(mockSnap);
      if (fn === 'kr8_admin_morning_brief') return structuredClone(mockMorningBriefRpc);
      if (fn === 'kr8_admin_places_auto') return [];
      if (fn === 'kr8_admin_v2_people_extra') return null;
      if (fn === 'kr8_admin_dups_auto') return [];
      if (fn === 'kr8_admin_v2_photos') return {};
      if (fn === 'kr8_admin_alert_dismiss') return { ok: true };
      return {};
    }),
  };
});

describe('T-380 M2: Alert Centre + Morning Brief', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('calculates 7-day voucher burn DAYS LEFT, sorts red->amber->grey alerts, and uses real member count (never member_no)', () => {
    // 14 burned over 7 days = 2/day; 4 left = 2.0 days left (hot!)
    const r1 = computeVoucherRunway(4, 14);
    expect(r1.daily_burn).toBe(2);
    expect(r1.days_left).toBe(2);
    expect(r1.headline).toBe('2d left');
    expect(r1.hot).toBe(true);

    // 0 burned over 7 days = steady runway
    const r2 = computeVoucherRunway(18, 0);
    expect(r2.days_left).toBeNull();
    expect(r2.headline).toBe('Steady');
    expect(r2.hot).toBe(false);

    // Sort strictly red -> amber -> grey
    const sorted = sortRobotAlerts(mockMorningBriefRpc.alerts as RobotAlert[]);
    expect(sorted.map((a) => a.severity)).toEqual(['red', 'amber', 'grey']);

    // Client fallback uses real count (42 total, 1 today in people array), NEVER member_no 580!
    const synth = synthesizeMorningBrief(mockSnap);
    expect(synth.brief.new_members.total).toBe(42);
    expect(synth.brief.new_members.today).toBe(1);
    expect(synth.brief.new_members.total).not.toBe(580);
    expect(synth.brief.voucher_stock.days_left).toBe(2);
    expect(synth.brief.held_payouts).toEqual({ count: 1, thb: 600 });
    expect(synth.brief.top3_needs_you.length).toBe(3);
  });

  it('renders Morning Brief on Today and prioritised Alert Centre + Undoable Dismiss on Needs you', async () => {
    const v2 = await import('./adminV2');
    await v2.loadSnapshot(true);

    // Today -> Morning brief card
    v2.todayView();
    await new Promise((r) => setTimeout(r, 30));
    const mb = document.getElementById('v2MorningBrief');
    expect(mb).toBeTruthy();
    expect(document.getElementById('mbMembers')?.textContent).toContain('+5');
    expect(document.getElementById('mbMembers')?.textContent).toContain('42 real total');
    expect(document.getElementById('mbMembers')?.textContent).not.toContain('580');
    expect(document.getElementById('mbHeld')?.textContent).toContain('฿600');
    expect(document.getElementById('mbStock')?.textContent).toContain('2d left');
    expect(document.getElementById('mbErrors')?.textContent).toContain('3');
    expect(document.querySelectorAll('#v2BriefTop3 .mb-need').length).toBe(3);

    // Needs you -> Alert Centre at top, ordered red -> amber -> grey, with Dismiss + 5s Undo
    v2.inboxView();
    await new Promise((r) => setTimeout(r, 30));
    const ac = document.getElementById('v2AlertCentre');
    expect(ac).toBeTruthy();
    expect(ac?.textContent).toContain('1 broken · 1 needs decision · 1 FYI');
    const rows = [...document.querySelectorAll('#v2AlertCentre .ac-row')];
    expect(rows.length).toBe(3);
    expect(rows[0].className).toContain('sev-red');
    expect(rows[1].className).toContain('sev-amber');
    expect(rows[2].className).toContain('sev-grey');

    const dismissBtn = document.getElementById('alertDismiss-a-red-1') as HTMLButtonElement;
    expect(dismissBtn).toBeTruthy();
    dismissBtn.click();
    expect(document.getElementById('v2Toast')?.textContent).toContain('Alert dismissed');
    v2.v2Flush();
    await vi.waitFor(() => expect(rpcCalls.some((c) => c.fn === 'kr8_admin_alert_dismiss' && c.args.p_id === 'a-red-1')).toBe(true));
    v2.stopV2();
  });
});
