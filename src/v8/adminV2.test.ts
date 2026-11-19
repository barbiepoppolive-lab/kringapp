import { describe, expect, it } from 'vitest';
import {
  ago, both, buildInbox, claimChip, filterPeople, linkGroups, lookalikeWords, money, personFlags, referrers, summary,
  type Claim, type Person, type Snapshot,
} from '../venue/adminV2Logic';

// Shaped like the LIVE data on 17 Nov (read-only audit): 18 real members, Kring Team, 12 demo rows, 10 codes out / 10 left,
// #30↔#53↔#58 and #50↔#56↔#57 look-alike groups, Otop (#16) with 2 claims, Eyes (#50) off the board.
const NOW = Date.parse('2026-11-17T10:00:00Z');
const day0 = '2026-11-16T18:30:00Z';   // India midnight 17 Nov
let n = 0;
function person(no: number, o: Partial<Person> = {}): Person {
  return { user_id: 'u' + no, kind: 'real', no, name: 'M' + no, who: 'local', area: 'Ari', joined_at: '2026-11-16T10:00:00Z', last_active_at: null, ref: null, src: null,
    verified: false, ig: null, tt: null, has_photo: true, photo_check: null, email_hint: null, line: false, check: null,
    reels: { live: 1, waiting: 0, hidden: 0, board_off: 0, board_off_reason: null }, claims: { n: 0, paid: 0, held: 0, thb: 0, first_at: null },
    links: [], shared_net: 0, refs: 0, board: null, score: null, ...o };
}
function claim(no: number, o: Partial<Claim> = {}): Claim {
  return { id: 'c' + (++n), user_id: 'u' + no, no, name: 'M' + no, brand: 'truemoney', amount: 100, status: 'assigned', held: false, used: false,
    created_at: '2026-11-16T14:00:00Z', assigned_at: '2026-11-16T14:00:00Z', is_test: false, hold_reason: null, decided: null, decided_at: null,
    face_dist: null, joined_at: '2026-11-16T13:50:00Z', hold_others: null, prize: null, ...o };
}
// 19 Nov: look-alikes are AWS now (face_maybe / face-api distances are the retired engine and are dropped). The old distances map to
// AWS similarities: < 0.40 → 98 % (same face), otherwise 86 % (looks alike).
const L = (no: number, reason = 'face', dist: number | null = 0.48) => (reason === 'face'
  ? { user_id: 'u' + no, no, name: 'M' + no, reason, dist: null, aws_sim: dist == null ? null : dist < 0.4 ? 98 : 86, at: '2026-11-17T08:00:00Z' }
  : { user_id: 'u' + no, no, name: 'M' + no, reason, dist, at: '2026-11-17T08:00:00Z' });

function snap(): Snapshot {
  const people: Person[] = [
    person(30, { verified: true, joined_at: '2026-11-16T14:41:00Z', links: [L(53, 'face', 0.486)] }),
    person(53, { joined_at: '2026-11-16T21:18:00Z', check: { id: 'v53', status: 'rejected', at: '2026-11-16T21:40:00Z', auto: null, reason: 'Only one account allowed per individual' },
      reels: { live: 2, waiting: 0, hidden: 1, board_off: 0, board_off_reason: null }, links: [L(30, 'face', 0.486), L(58, 'face', 0.386)] }),
    person(58, { joined_at: '2026-11-17T09:23:00Z', ref: null, check: { id: 'v58', status: 'rejected', at: '2026-11-17T09:27:00Z', auto: 'block', reason: 'One verified account allowed per person' }, links: [L(53, 'face', 0.386)] }),
    person(50, { ref: 'eiko', joined_at: '2026-11-16T20:17:00Z', reels: { live: 1, waiting: 0, hidden: 1, board_off: 1, board_off_reason: 'Eiko self-referral' }, links: [L(56, 'face', 0.485), L(57, 'face', 0.497)] }),
    person(56, { ref: 'pich', verified: true, joined_at: '2026-11-17T06:41:00Z', links: [L(50, 'face', 0.485), L(57, 'face_maybe', 0.507)] }),
    person(57, { ref: 'pich', joined_at: '2026-11-17T08:48:00Z', links: [L(50, 'face', 0.497), L(56, 'face_maybe', 0.507)], claims: { n: 1, paid: 1, held: 0, thb: 100, first_at: null } }),
    person(16, { ref: 'pich', joined_at: '2026-11-15T14:22:00Z', claims: { n: 2, paid: 2, held: 0, thb: 200, first_at: null } }),
    person(14, { ref: 'pich', has_photo: false }),
    person(44, { kind: 'team', name: 'Kring Team' }),
    ...Array.from({ length: 12 }, (_, i) => person(i + 1, { kind: 'test' })),
    person(0, { kind: 'nocard', no: null, name: '', email_hint: 'ab…@gmail.com', user_id: 'nocard1', reels: null, claims: null }),
  ];
  return {
    at: new Date(NOW).toISOString(), day_start: day0, week_start: '2026-11-15T17:00:00Z', include_test: false,
    counts: { real: 18, real_today: 4, test: 12, team: 1, ghost: 0, admin: 3, nocard: 1 },
    people,
    claims: [claim(16, { joined_at: '2026-11-15T14:22:00Z', created_at: '2026-11-15T14:49:00Z' }), claim(16, { used: true, created_at: '2026-11-16T06:23:00Z' }),
      claim(57, { joined_at: '2026-11-17T08:48:00Z', created_at: '2026-11-17T09:02:00Z', hold_reason: 'linked', decided: 'paid' }),
      claim(50, { joined_at: '2026-11-16T20:17:00Z', created_at: '2026-11-16T20:24:00Z', used: true }), claim(3, { is_test: true })],
    codes: [{ brand: 'truemoney', amount: 100, available: 10, assigned: 10, used: 0 }],
    board: { week_start: '2026-11-15T17:00:00Z', paid_ranks: 8, floor: 25, rows: [] },
    pending: { reels: [], checks: [], reports: 0, places: 0 }, alerts: [],
  };
}

describe('admin v2 · one wording for look-alikes', () => {
  it('never says "same person" for a borderline distance', () => {
    expect(lookalikeWords(0.386).text).toBe('Same face · 0.39');
    expect(lookalikeWords(0.486).text).toMatch(/^Looks alike/);
    expect(lookalikeWords(0.507).text).toMatch(/^Slightly alike/);
    expect(lookalikeWords(null, 'device').text).toBe('Same phone');
  });
});

describe('admin v2 · Needs you', () => {
  it('one case per card: one look-alike card per PAIR, the older account first', () => {
    const groups = linkGroups(snap().people);
    expect(groups.map((g) => g.map((p) => p.no))).toEqual(expect.arrayContaining([[30, 53, 58], [50, 56, 57]]));
    const { items } = buildInbox(snap());
    const look = items.filter((i) => i.kind === 'lookalike');
    expect(look.map((i) => i.people.map((p) => p.no))).toEqual(expect.arrayContaining([[30, 53], [53, 58], [50, 56], [50, 57]]));
    expect(look.some((i) => i.people[0].no === 56 && i.people[1].no === 57)).toBe(false);   // 19 Nov: face_maybe is the retired engine
    expect(look.every((i) => i.people.length === 2 && i.what.length <= 2)).toBe(true);
    expect(look.find((i) => i.people[0].no === 30)!.question).toBe('#30 and #53 look alike. Same person?');
  });
  it('says what happened in words, never decimals: #53 still has live Reels even though its face check was refused', () => {
    const g = buildInbox(snap()).items.find((i) => i.people[0].no === 30 && i.people[1].no === 53)!;
    expect(g.what.join(' ')).toMatch(/2 live Reels/);
    expect(g.what.join(' ')).toMatch(/face check refused/);
    expect(g.what.join(' ')).toMatch(/Faces look alike · 86% \(AWS\)/);
    expect(g.what.join(' ')).not.toMatch(/0\.\d/);
    const strong = buildInbox(snap()).items.find((i) => i.people[0].no === 53 && i.people[1].no === 58)!;
    expect(strong.what[0]).toBe('Same face · 98% (AWS) — very likely one person');
  });
  it('a held claim inside a look-alike group is its OWN money card, first, linked by "related"', () => {
    const s = snap();
    s.claims.push(claim(58, { status: 'pending', held: true, assigned_at: null, hold_reason: 'linked' }));
    const { items } = buildInbox(s);
    expect(items[0].kind).toBe('held');
    expect(items[0].people.map((p) => p.no)).toEqual([58]);
    expect(items[0].question).toBe('Pay M58 (#58) ฿100 TrueMoney?');
    expect(items[0].claims).toHaveLength(1);
    const pair = items.find((i) => i.kind === 'lookalike' && i.people.some((p) => p.no === 58))!;
    expect(items[0].related).toContain(pair.key);
    expect(pair.related).toContain(items[0].key);
  });
  it('red money first (longest wait on top), then amber, then FYI Reels', () => {
    const s = snap();
    s.claims.push(claim(16, { status: 'pending', held: true, assigned_at: null, created_at: '2026-11-17T08:00:00Z' }),
      claim(30, { status: 'pending', held: true, assigned_at: null, created_at: '2026-11-16T08:00:00Z' }));
    s.pending.reels = [{ id: 'r1', user_id: 'u16', at: '2026-11-15T08:00:00Z', poster_path: null, video_path: null, body: '' }];
    const { items } = buildInbox(s);
    expect(items.map((i) => i.tone)).toEqual([...items.map((i) => i.tone)].sort((a, b) => 'raf'.indexOf(a) - 'raf'.indexOf(b)));
    expect(items.slice(0, 2).map((i) => i.people[0].no)).toEqual([30, 16]);
    expect(items[items.length - 1].kind).toBe('reel');
  });
  it('settled pairs go to Handled automatically, not to the inbox', () => {
    const s = snap();
    for (const p of s.people) if (p.no === 53 || p.no === 58) p.reels = { live: 0, waiting: 0, hidden: 3, board_off: 0, board_off_reason: null };
    const { items, handled } = buildInbox(s);
    expect(items.some((i) => i.people.some((p) => p.no === 58))).toBe(false);
    expect(handled.some((h) => h.text.includes('#30 · #53'))).toBe(true);
    expect(handled.some((h) => h.text.includes('#53 · #58'))).toBe(true);
  });
  it('paid claims are logged as automatic', () => {
    expect(buildInbox(snap()).handled.filter((h) => h.text.includes('paid ฿100 truemoney automatically'))).toHaveLength(3);
  });
});

describe('admin v2 · money is real-only and per claim', () => {
  it('codes 10 left / 10 out; Otop has 2 claims; test claim not counted', () => {
    const m = money(snap());
    expect([m.available, m.assigned]).toEqual([10, 10]);
    expect(m.byMember.find((r) => r.p.no === 16)).toMatchObject({ n: 2, thb: 200 });
    expect(m.byMember.some((r) => r.p.no === 3)).toBe(false);
    expect(m.paidAllThb).toBe(400);
  });
  it('status chips say what happened in plain words', () => {
    expect(claimChip(claim(1)).text).toBe('Paid · code sent');
    expect(claimChip(claim(1, { used: true })).text).toBe('Paid · code used');
    expect(claimChip(claim(1, { status: 'pending', held: true })).text).toBe('Held · you decide');
    expect(claimChip(claim(1, { status: 'cancelled' })).text).toBe('Refused');
    expect(claimChip(claim(1, { decided: 'paid' })).text).toBe('Paid by you');
  });
});

describe('admin v2 · People', () => {
  it('real members only by default (no Kring Team, no demo rows), newest first; card-less sign-ups listed', () => {
    const s = snap();
    const all = filterPeople(s, 'all');
    expect(all.some((p) => p.kind === 'team' || p.kind === 'test')).toBe(false);
    expect(all.some((p) => p.kind === 'nocard')).toBe(true);
    expect(all[0].no).toBe(58);
    expect(filterPeople(s, 'all', '', '', true).length).toBe(s.people.length - 1);   // 0087: Kring Team is never listed, even with test rows on
  });
  it('filters: today (India day), flagged, has claims, referrer, search by #no', () => {
    const s = snap();
    expect(filterPeople(s, 'today').map((p) => p.no).sort()).toEqual([50, 53, 56, 57, 58]);
    expect(filterPeople(s, 'claims').map((p) => p.no).sort()).toEqual([16, 57]);
    expect(filterPeople(s, 'flagged').map((p) => p.no)).toEqual(expect.arrayContaining([50, 53]));
    expect(filterPeople(s, 'all', '', 'eiko').map((p) => p.no)).toEqual([50]);
    expect(filterPeople(s, 'all', '#16').map((p) => p.no)).toEqual([16]);
    expect(referrers(s)).toEqual(['eiko', 'pich']);
  });
  it('flags: board off, fast claim, look-alike, no photo', () => {
    const s = snap();
    const f50 = personFlags(s.people.find((p) => p.no === 50)!, s.people, s.claims).map((f) => f.key);
    expect(f50).toEqual(expect.arrayContaining(['lookalike', 'board_off', 'fast_claim', 'unverified_paid']));
    expect(personFlags(s.people.find((p) => p.no === 14)!, s.people, s.claims).map((f) => f.key)).toContain('no_photo');
  });
});

describe('admin v2 · plain-English summary + times', () => {
  it('summarises today in one glance', () => {
    const t = summary(snap()).join(' ');
    expect(t).toMatch(/^5 new members today, via no referrer, eiko, pich\./);
    expect(t).toMatch(/2 members claimed a prize within 15 min of joining/);
    expect(t).toMatch(/4 look-alike pairs to settle/);
    expect(t).toMatch(/10 codes left/);
  });
  it('India time first, Bangkok small', () => {
    expect(both('2026-11-17T09:02:00Z')).toBe('14:32 IST · 16:02 BKK');
    expect(ago('2026-11-17T09:00:00Z', NOW)).toBe('1h ago');
  });
});
