import { describe, expect, it } from 'vitest';
import {
  buildInbox,
  buildRobotReport,
  dupAutoText,
  moneyRobotVerdict,
  personTrust,
  trustChip,
  type Claim,
  type Person,
  type Snapshot,
} from './adminV2Logic';

function mkPerson(over: Partial<Person> = {}): Person {
  return {
    user_id: 'u-1',
    kind: 'real',
    no: 24,
    name: 'Somchai',
    who: 'local',
    area: 'Ari',
    joined_at: '2026-11-15T10:00:00Z',
    last_active_at: '2026-11-17T10:00:00Z',
    ref: null,
    src: null,
    verified: true,
    ig: 'somchai',
    tt: null,
    has_photo: true,
    photo_check: 'ok',
    email_hint: null,
    line: false,
    check: { id: 'chk-1', status: 'approved', at: '2026-11-17T08:00:00Z', auto: 'pass', reason: null },
    reels: { live: 1, waiting: 0, hidden: 0, board_off: 0, board_off_reason: null },
    claims: { n: 0, paid: 0, held: 0, thb: 0, first_at: null },
    links: [],
    shared_net: 0,
    refs: 0,
    board: null,
    score: null,
    ...over,
  };
}

function mkClaim(over: Partial<Claim> = {}): Claim {
  return {
    id: 'cl-1',
    user_id: 'u-1',
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
    ...over,
  };
}

function mkSnapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    at: '2026-11-17T12:00:00Z',
    day_start: '2026-11-17T00:00:00+05:30',
    week_start: '2026-11-16T17:00:00Z',
    include_test: false,
    counts: { real: 2, real_today: 1, test: 0, team: 0, ghost: 1, admin: 0, nocard: 0 },
    people: [],
    claims: [],
    codes: [{ brand: 'truemoney', amount: 100, available: 10, assigned: 2, used: 0 }],
    board: { week_start: '2026-11-16T17:00:00Z', paid_ranks: 8, floor: 25, rows: [] },
    pending: { reels: [], checks: [], reports: 0, places: 0 },
    alerts: [],
    places_auto: [],
    dups_auto: [],
    ...over,
  };
}

describe('T-370 Autopilot Step 1', () => {
  it('computes 0–100 trust score + plain-English reasons (SQL field or client fallback)', () => {
    const clean = mkPerson();
    const tClean = personTrust(clean);
    expect(tClean.score).toBe(100);
    expect(tClean.reasons).toEqual(expect.arrayContaining(['+30 face verified', '+10 real photo', '+10 approved Reel']));
    expect(trustChip(tClean)).toEqual({ text: 'trust 100', tone: 'g' });

    const shady = mkPerson({
      user_id: 'u-2',
      no: 58,
      verified: false,
      has_photo: false,
      reels: { live: 0, waiting: 0, hidden: 0, board_off: 0, board_off_reason: null },
      joined_at: '2026-11-17T10:00:00Z',
      claims: { n: 1, paid: 0, held: 1, thb: 0, first_at: '2026-11-17T10:08:00Z' },
      shared_net: 1,
      links: [{ user_id: 'u-1', no: 24, name: 'Somchai', reason: 'face', dist: null, sface_sim: 0.88, at: '2026-11-17T10:05:00Z' }],
    });
    const tShady = personTrust(shady);
    expect(tShady.score).toBe(0);
    expect(tShady.reasons).toContain('−40 same face as #24');
    expect(tShady.reasons).toContain('−10 same Wi-Fi as a claimer');
    expect(tShady.reasons).toContain('−20 claimed within 15 min of joining');
    expect(trustChip(tShady)).toEqual({ text: 'trust 0', tone: 'r' });

    // Preserves SQL kr8_trust when present on snapshot person
    const fromSql = mkPerson({ trust: { score: 82, reasons: ['+30 face verified', '+10 real photo', '−15 likes mostly from accounts <24h old'] } });
    expect(personTrust(fromSql)).toEqual({
      score: 82,
      reasons: ['+30 face verified', '+10 real photo', '−15 likes mostly from accounts <24h old'],
    });
  });

  it('Money Robot recommends PAY / WAIT / REFUSE with top 3 reasons and sorts clearest held claims first', () => {
    const pPay = mkPerson({ user_id: 'u-pay', no: 11, trust: { score: 85, reasons: ['+30 face verified', '+10 real photo', '+10 approved Reel'] } });
    const pWait = mkPerson({ user_id: 'u-wait', no: 12, verified: false, trust: { score: 52, reasons: ['+10 real photo', '−20 looks like #9'] } });
    const pRefuse = mkPerson({
      user_id: 'u-refuse',
      no: 13,
      verified: false,
      trust: { score: 15, reasons: ['−40 same face as #24', '−10 same Wi-Fi as a claimer', '−20 claimed within 15 min of joining', '+10 real photo'] },
    });

    const cWait = mkClaim({ id: 'c-wait', user_id: 'u-wait', hold_reason: 'review', created_at: '2026-11-17T08:00:00Z' });
    const cPay = mkClaim({ id: 'c-pay', user_id: 'u-pay', created_at: '2026-11-17T09:00:00Z' });
    const cRefuse = mkClaim({
      id: 'c-refuse',
      user_id: 'u-refuse',
      created_at: '2026-11-17T10:00:00Z',
      hold_others: [{ user_id: 'u-1', member_no: 24, first_name: 'Somchai', reasons: ['face'], face_dist: 0.28 }],
    });

    const snap = mkSnapshot({ people: [pWait, pPay, pRefuse], claims: [cWait, cPay, cRefuse] });
    const vPay = moneyRobotVerdict(cPay, pPay, snap);
    const vWait = moneyRobotVerdict(cWait, pWait, snap);
    const vRefuse = moneyRobotVerdict(cRefuse, pRefuse, snap);

    expect(vPay.call).toBe('PAY');
    expect(vPay.headline).toBe('Robot says: PAY · trust 85');
    expect(vPay.reasons.length).toBeLessThanOrEqual(3);

    expect(vWait.call).toBe('WAIT');
    expect(vWait.headline).toContain('Robot says: WAIT');
    expect(vWait.reasons.length).toBeLessThanOrEqual(3);

    expect(vRefuse.call).toBe('REFUSE');
    expect(vRefuse.headline).toBe('Robot says: REFUSE · trust 15');
    expect(vRefuse.reasons).toEqual(['−40 same face as #24', '−10 same Wi-Fi as a claimer', '−20 claimed within 15 min of joining']);

    // Clearest cases (REFUSE + PAY) sort ahead of grey-zone WAIT even though WAIT arrived earliest!
    const inbox = buildInbox(snap);
    // money cards come first, the claim that has waited longest on top; every held claim is its own card
    const money = inbox.items.filter((i) => i.kind === 'held');
    expect(inbox.items.slice(0, money.length).every((i) => i.kind === 'held')).toBe(true);
    expect(money.map((i) => i.verdict?.call).sort()).toEqual(['PAY', 'REFUSE', 'WAIT']);
    const ats = money.map((i) => Date.parse(i.at));
    expect(ats).toEqual([...ats].sort((a, b) => a - b));
    expect(money.every((i) => i.claims.length === 1 && i.people.length === 1 && /^Pay .+ \(#\d+\) ฿\d+ TrueMoney\?$/.test(i.question))).toBe(true);
  });

  it('lists Duplicate Robot actions under Handled automatically with Undo metadata, keeping 0.50–0.60 look-alikes for founder', () => {
    const pOld = mkPerson({
      user_id: 'u-old',
      no: 30,
      name: 'Nok',
      joined_at: '2026-11-10T00:00:00Z',
      links: [{ user_id: 'u-grey', no: 31, name: 'NokB', reason: 'face', dist: 0.46, sface_sim: 0.54, at: '2026-11-17T09:00:00Z' }],
    });
    const pGrey = mkPerson({
      user_id: 'u-grey',
      no: 31,
      name: 'NokB',
      joined_at: '2026-11-17T09:00:00Z',
      links: [{ user_id: 'u-old', no: 30, name: 'Nok', reason: 'face', dist: 0.46, sface_sim: 0.54, at: '2026-11-17T09:00:00Z' }],
    });

    const snap = mkSnapshot({
      people: [pOld, pGrey],
      dups_auto: [{
        at: '2026-11-17T10:30:00Z',
        dup: 'u-dup99',
        dup_no: 99,
        dup_name: 'Joob2',
        keep: 'u-24',
        keep_no: 24,
        keep_name: 'Joob',
        why: 'same_face',
        dup_sim: 0.89,
        voided_reels: 1,
        ledger_void: 15,
        ghost: true,
        undone: false,
      }],
    });

    const inbox = buildInbox(snap);
    // 0.54 look-alike stays a founder decision in Needs you
    expect(inbox.items.some((i) => i.kind === 'lookalike' && i.question === '#30 and #31 look alike. Same person?')).toBe(true);
    // >= 0.60 auto-ghosted duplicate appears in Handled automatically with undoDup
    const dupRow = inbox.handled.find((h) => h.undoDup === 'u-dup99');
    expect(dupRow).toBeTruthy();
    expect(dupRow?.undone).toBe(false);
    expect(dupAutoText(snap.dups_auto![0])).toContain('Duplicate robot ghosted Joob2 #99 (same face as #24 Joob · 0.89) · voided this week’s Rings');
  });

  it('builds Today Robot Report including duplicates ghosted and held claim verdicts (no Rings guard)', () => {
    const p = mkPerson({ user_id: 'u-1', no: 24, trust: { score: 88, reasons: ['+30 face verified', '+10 real photo', '+10 approved Reel'] } });
    const c = mkClaim({ id: 'c-1', user_id: 'u-1' });
    const snap = mkSnapshot({
      people: [p],
      claims: [c],
      board: {
        week_start: '2026-11-16T17:00:00Z',
        paid_ranks: 8,
        floor: 25,
        rows: [{ rank: 1, user_id: 'u-1', rings: 40, prize: 1500, likes: 10, saves: 5, opens: 3, is_new: false, no: 24, name: 'Somchai' }],
      },
      dups_auto: [{
        at: '2026-11-17T06:00:00Z',
        dup: 'u-dup',
        dup_no: 77,
        dup_name: 'Dup',
        keep: 'u-1',
        keep_no: 24,
        keep_name: 'Somchai',
        why: 'same_device',
        dup_sim: null,
        voided_reels: 1,
        ledger_void: 0,
        ghost: true,
        undone: false,
      }],
    });
    const rep = buildRobotReport(snap);
    expect(rep.lines.join(' ')).toContain('Duplicate robot ghosted 1 duplicate account today');
    expect(rep.lines.join(' ')).not.toContain('Rings guard');
    expect(rep.lines.join(' ')).toContain('Money robot scored 1 held claim for your tap (1 PAY)');
  });

  it('shared Wi-Fi alone counts 0; −10 only next to another warning sign', () => {
    const wifiOnly = mkPerson({ user_id: 'u-w1', no: 70, verified: true, shared_net: 1, links: [],
      joined_at: '2026-11-17T10:00:00Z', claims: { n: 1, paid: 0, held: 1, thb: 0, first_at: '2026-11-17T12:00:00Z' } });
    const t1 = personTrust(wifiOnly);
    expect(t1.reasons.join(' ')).not.toContain('Wi-Fi');
    const wifiFast = mkPerson({ user_id: 'u-w2', no: 71, verified: true, shared_net: 1, links: [],
      joined_at: '2026-11-17T10:00:00Z', claims: { n: 1, paid: 0, held: 1, thb: 0, first_at: '2026-11-17T10:05:00Z' } });
    const t2 = personTrust(wifiFast);
    expect(t2.reasons).toContain('−10 same Wi-Fi as a claimer');
    expect(t2.score).toBe(t1.score - 30);
  });

  it('dry-run sweep rows go to the preview list, not to Handled, and hide nobody from Needs you', () => {
    const keep = mkPerson({ user_id: 'u-k', no: 24 });
    const dup = mkPerson({ user_id: 'u-d', no: 99, verified: false, links: [{ user_id: 'u-k', no: 24, name: 'K', reason: 'face', dist: null, sface_sim: 0.7, at: '2026-11-17T10:05:00Z' }] });
    const snap = mkSnapshot({ people: [keep, dup], claims: [], dups_auto: [{ at: '2026-11-17T06:00:00Z', dup: 'u-d', dup_no: 99, dup_name: 'Dup', keep: 'u-k', keep_no: 24,
      keep_name: 'K', why: 'same_face', dup_sim: 0.7, voided_reels: 0, ledger_void: 0, ghost: false, undone: false, preview: true }] });
    const inbox = buildInbox(snap);
    expect(inbox.preview).toHaveLength(1);
    expect(inbox.preview[0].text).toContain('Would hide Dup #99');
    expect(inbox.handled.some((h) => h.undoDup === 'u-d')).toBe(false);
    expect(buildRobotReport(snap).lines.join(' ')).toContain('Duplicate robot preview: 1');
  });
});
