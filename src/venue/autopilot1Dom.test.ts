import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Snapshot } from './adminV2Logic';

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

const mockSnapshot: Snapshot = {
  at: '2026-11-17T12:00:00Z',
  day_start: '2026-11-17T00:00:00+05:30',
  week_start: '2026-11-16T17:00:00Z',
  include_test: false,
  counts: { real: 2, real_today: 1, test: 0, team: 0, ghost: 1, admin: 0, nocard: 0 },
  people: [
    {
      user_id: 'u-good',
      kind: 'real',
      no: 24,
      name: 'Somchai',
      who: 'local',
      area: 'Ari',
      joined_at: '2026-11-15T10:00:00Z',
      last_active_at: '2026-11-17T11:00:00Z',
      ref: null,
      src: null,
      verified: true,
      ig: 'somchai',
      tt: null,
      has_photo: true,
      photo_check: 'ok',
      email_hint: null,
      line: true,
      trust: { score: 82, reasons: ['+30 face verified', '+10 real photo', '+10 approved Reel'] },
      check: { id: 'chk-1', status: 'approved', at: '2026-11-17T08:00:00Z', auto: 'pass', reason: null },
      reels: { live: 1, waiting: 0, hidden: 0, board_off: 0, board_off_reason: null },
      claims: { n: 1, paid: 0, held: 1, thb: 0, first_at: '2026-11-17T11:00:00Z' },
      links: [],
      shared_net: 0,
      refs: 0,
      board: { rank: 1, rings: 45 },
      score: { likes: 10, saves: 5, opens: 4, score: 45 },
    },
    {
      user_id: 'u-shady',
      kind: 'real',
      no: 58,
      name: 'DupTry',
      who: 'local',
      area: 'Silom',
      joined_at: '2026-11-17T10:00:00Z',
      last_active_at: '2026-11-17T10:05:00Z',
      ref: null,
      src: null,
      verified: false,
      ig: null,
      tt: null,
      has_photo: true,
      photo_check: 'ok',
      email_hint: null,
      line: false,
      trust: { score: 18, reasons: ['−40 same face as #24', '−10 same Wi-Fi as a claimer', '−20 claimed within 15 min of joining'] },
      check: { id: 'chk-2', status: 'rejected', at: '2026-11-17T10:02:00Z', auto: 'block', reason: 'same face' },
      reels: { live: 0, waiting: 0, hidden: 0, board_off: 0, board_off_reason: null },
      claims: { n: 1, paid: 0, held: 1, thb: 0, first_at: '2026-11-17T10:06:00Z' },
      links: [],
      shared_net: 1,
      refs: 0,
      board: null,
      score: null,
    },
  ],
  claims: [
    {
      id: 'cl-good',
      user_id: 'u-good',
      no: 24,
      name: 'Somchai',
      brand: 'truemoney',
      amount: 100,
      status: 'pending',
      held: true,
      used: false,
      created_at: '2026-11-17T11:00:00Z',
      assigned_at: null,
      is_test: false,
      hold_reason: null,
      decided: null,
      decided_at: null,
      face_dist: null,
      joined_at: '2026-11-15T10:00:00Z',
      hold_others: null,
      prize: { kind: 'founding', week: null, rank: null },
    },
    {
      id: 'cl-shady',
      user_id: 'u-shady',
      no: 58,
      name: 'DupTry',
      brand: 'truemoney',
      amount: 100,
      status: 'pending',
      held: true,
      used: false,
      created_at: '2026-11-17T10:06:00Z',
      assigned_at: null,
      is_test: false,
      hold_reason: 'linked',
      decided: null,
      decided_at: null,
      face_dist: 0.25,
      joined_at: '2026-11-17T10:00:00Z',
      hold_others: [{ user_id: 'u-good', member_no: 24, first_name: 'Somchai', reasons: ['face'], face_dist: 0.25 }],
      prize: { kind: 'founding', week: null, rank: null },
    },
  ],
  codes: [{ brand: 'truemoney', amount: 100, available: 12, assigned: 3, used: 0 }],
  board: {
    week_start: '2026-11-16T17:00:00Z',
    paid_ranks: 8,
    floor: 25,
    rows: [
      { rank: 1, user_id: 'u-good', rings: 45, prize: 1500, likes: 10, saves: 5, opens: 4, is_new: false, no: 24, name: 'Somchai' },
    ],
  },
  pending: { reels: [], checks: [], reports: 0, places: 0 },
  alerts: [],
  places_auto: [],
  dups_auto: [
    {
      at: '2026-11-17T09:30:00Z',
      dup: 'u-ghost99',
      dup_no: 99,
      dup_name: 'Clone99',
      keep: 'u-good',
      keep_no: 24,
      keep_name: 'Somchai',
      why: 'same_face',
      dup_sim: 0.91,
      voided_reels: 1,
      ledger_void: 10,
      ghost: true,
      undone: false,
    },
  ],
};

vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return {
    ...actual,
    rpc: vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push({ fn, args });
      if (fn === 'kr8_admin_v2_snapshot') return structuredClone(mockSnapshot);
      if (fn === 'kr8_admin_places_auto') return [];
      if (fn === 'kr8_admin_v2_people_extra') return null;
      if (fn === 'kr8_admin_dups_auto') return structuredClone(mockSnapshot.dups_auto);
      if (fn === 'kr8_admin_v2_photos') return {};
      if (fn === 'kr8_admin_v2_face_checks') return [];
      if (fn === 'kr8_admin_v2_member') {
        return {
          user_id: 'u-good',
          kind: 'real',
          trust: { score: 82, reasons: ['+30 face verified', '+10 real photo', '+10 approved Reel'] },
          card: {
            no: 24, name: 'Somchai', photo: null, who: 'local', area: 'Ari', bio: 'Hi', langs: ['TH'], interests: [],
            gender: null, ig: 'somchai', tt: null, verified: true, photo_check: 'ok', ref: null, src: null,
            joined_at: '2026-11-15T10:00:00Z', last_active_at: '2026-11-17T11:00:00Z', age_ok_at: '2026-11-15T10:00:00Z', ghost: false,
          },
          email_hint: 'so…@test.com',
          signed_up_at: '2026-11-15T10:00:00Z',
          last_sign_in_at: '2026-11-17T11:00:00Z',
          line: true,
          consents: { terms_version: 'v5', terms_at: '2026-11-15T10:00:00Z', promo_ok: true, promo_at: null, web_reels: true, web_reels_at: null, log: [] },
          reels: [],
          rings_week: { likes: 10, saves: 5, opens: 4, score: 45 },
          board: { rank: 1, rings: 45 },
          rings_ledger: [],
          results: [],
          claims: [],
          referrals: [],
          links: [],
          checks: [],
          admin_log: [],
        };
      }
      return { ok: true };
    }),
  };
});

describe('T-370 Autopilot Step 1 DOM views', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('renders Robot report on Today, Money Robot verdicts + Undo toast in Needs you, Undo on Handled automatically, trust on People + Member, and no Rings guard on Board', async () => {
    const v2 = await import('./adminV2');
    await v2.loadSnapshot(true);

    // 1. Today -> Robot report card linking to #inbox
    v2.todayView();
    await new Promise((r) => setTimeout(r, 30));
    const robotCard = document.getElementById('v2RobotReport') as HTMLAnchorElement;
    expect(robotCard).toBeTruthy();
    expect(robotCard.getAttribute('href')).toBe('#inbox');
    expect(robotCard.textContent).toContain('Duplicate robot ghosted 1 duplicate account today');
    expect(robotCard.textContent).not.toContain('Rings guard');
    expect(robotCard.textContent).toContain('1 PAY · 1 REFUSE');

    // 2. Needs you -> Money Robot verdicts, clearest first, Pay / Refuse keep Undo toast
    v2.inboxView();
    await new Promise((r) => setTimeout(r, 30));
    const verdicts = [...document.querySelectorAll('.v2verdict')];
    expect(verdicts.length).toBe(2);
    expect(verdicts[0].textContent).toContain('Robot says: REFUSE · trust 18');
    expect(verdicts[0].textContent).toContain('−40 same face as #24');
    expect(verdicts[1].textContent).toContain('Robot says: PAY · trust 82');

    const payBtn = document.getElementById('v2Pay-cl-good') as HTMLButtonElement;
    expect(payBtn).toBeTruthy();
    payBtn.click();
    const undoBtn = document.getElementById('v2Undo') as HTMLButtonElement;
    expect(undoBtn).toBeTruthy();
    undoBtn.click(); // cancels the queued Pay cleanly!

    // 3. Handled automatically -> Duplicate Robot entry with Undo button
    v2.autoView();
    await new Promise((r) => setTimeout(r, 30));
    const dupUndo = document.getElementById('dupUndo-u-ghost99') as HTMLButtonElement;
    expect(dupUndo).toBeTruthy();
    expect(document.getElementById('app')!.textContent).toContain('Duplicate robot ghosted Clone99 #99');
    dupUndo.click();
    expect(document.getElementById('v2Toast')?.textContent).toContain('Duplicate restored');
    (document.getElementById('v2Undo') as HTMLButtonElement)?.click();

    // 4. People + Member 360 -> Trust score chips and breakdown
    v2.peopleView();
    await new Promise((r) => setTimeout(r, 30));
    expect(document.getElementById('v2Grid')?.textContent).toContain('trust 82');
    expect(document.getElementById('v2Grid')?.textContent).toContain('trust 18');

    await v2.memberView('u-good');
    expect(document.getElementById('app')!.textContent).toContain('Trust score');
    expect(document.getElementById('app')!.textContent).toContain('82 / 100');
    expect(document.getElementById('v2MemberTrust')?.textContent).toContain('+30 face verified');

    // 5. Board -> Rings guard removed (18 Nov): no "Rings ignored" line
    v2.boardView();
    await new Promise((r) => setTimeout(r, 30));
    expect(document.getElementById('v2Board')?.textContent).not.toContain('Rings ignored');

    v2.stopV2();
  });
});
