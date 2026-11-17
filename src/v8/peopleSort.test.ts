import { describe, expect, it } from 'vitest';
import { faceChip, faceStatusWords, liveSteps, type FaceCheck, filterPeople, groupPeople, peopleCounts, peopleHeadline, stepChip, withAdminLogins, type PeopleExtra, type Person, type Snapshot } from '../venue/adminV2Logic';
import { isRealPhoto, photoFirst } from './peopleSort';
import { NEUTRAL_IMG } from './v8Data';

// Mirrors the LIVE mix on 17 Nov (read-only SQL): 18 real members with a card (14 real photo, 4 without), Kring Team #44,
// 14 removed (12 demo + 2 duplicates), 4 sign-ins without a card + the founder's admin sign-in.
const real = [14, 15, 16, 19, 20, 22, 23, 24, 26, 27, 29, 30, 48, 56, 57, 63, 64, 66];
const noPhoto = new Set([14, 22, 23, 26]);
const day0 = '2026-11-16T18:30:00Z';
function person(no: number, o: Partial<Person> = {}): Person {
  return { user_id: 'u' + no, kind: 'real', no, name: 'M' + no, who: 'local', area: 'Ari', joined_at: new Date(Date.parse('2026-11-13T00:00:00Z') + no * 3600_000).toISOString(),
    last_active_at: null, ref: null, src: null, verified: false, ig: null, tt: null, has_photo: !noPhoto.has(no), photo_check: null, email_hint: null, line: false, check: null,
    reels: null, claims: null, links: [], shared_net: 0, refs: 0, board: null, score: null, ...o };
}
const row = (o: Partial<PeopleExtra['rows'][string]> = {}) => ({ real_photo: true, reel: null, won: [], open_claims: 0, check: null, ...o });
function snap(): Snapshot {
  const rows: PeopleExtra['rows'] = Object.fromEntries(real.map((no) => [`u${no}`, row({ real_photo: !noPhoto.has(no) })]));
  rows.u15 = row({ reel: { status: 'pending', note: null, at: '2026-11-17T01:00:00Z' } });
  rows.u16 = row({ reel: { status: 'approved', note: null, at: '2026-11-16T01:00:00Z' } });
  rows.u19 = row({ reel: { status: 'hidden', note: 'Too dark, please film in daylight', at: '2026-11-16T01:00:00Z' } });
  rows.u20 = row({ reel: { status: 'approved', note: null, at: '2026-11-16T01:00:00Z' }, won: [{ kind: 'founding', amount: 100, status: 'won' }] });
  rows.u24 = row({ reel: { status: 'approved', note: null, at: '2026-11-16T01:00:00Z' }, open_claims: 1 });
  rows.u27 = row({ reel: { status: 'approved', note: null, at: '2026-11-16T01:00:00Z' }, won: [{ kind: 'weekly', amount: 1000, status: 'won' }] });
  return {
    at: '2026-11-17T15:00:00Z', day_start: day0, week_start: '2026-11-16T17:00:00Z', include_test: false,
    counts: { real: 18, real_today: 4, test: 12, team: 1, ghost: 2, admin: 1, nocard: 4 },
    people: [...real.map((no) => person(no)), person(44, { kind: 'team', name: 'Kring Team' }),
      ...[1, 2, 3].map((i) => person(900 + i, { kind: 'nocard', no: null, name: '', user_id: 'nc' + i, email_hint: 'ab…@gmail.com', joined_at: `2026-11-1${i}T00:00:00Z` })),
      person(904, { kind: 'nocard', no: null, name: '', user_id: 'nc4', email_hint: 'na…@gmail.com', joined_at: '2026-11-16T20:25:00Z' })],
    claims: [], codes: [], board: { week_start: '', paid_ranks: 8, floor: 25, rows: [] }, pending: { reels: [], checks: [], reports: 0, places: 0 }, alerts: [],
    extra: { counts: { members: 18, with_photo: 14, no_photo: 4, nocard: 5, removed: 14, team: 1 }, rows,
      removed: Array.from({ length: 14 }, (_, i) => ({ user_id: 'g' + i, no: i + 1, name: 'demo', joined_at: '2026-11-10T00:00:00Z', why: i < 12 ? 'demo' : 'removed' })),
      admins: [{ user_id: 'adm', joined_at: '2026-11-16T14:39:00Z', email_hint: 'ba…@gmail.com' }] },
  };
}

describe('admin People · photo first, then no photo, then no card', () => {
  const s = withAdminLogins(snap());
  it('header counts match live and the Today tab (one function)', () => {
    const c = peopleCounts(s);
    expect(peopleHeadline(c)).toBe('18 members · 14 with photo · 5 without a card');
    expect(c.removed).toBe(14);
  });
  it('groups in order, newest first inside each, Kring Team never listed', () => {
    const g = groupPeople(filterPeople(s, 'all'), s);
    expect(g.photo).toHaveLength(14);
    expect(g.photo.map((p) => p.no)).toEqual(real.filter((n) => !noPhoto.has(n)).reverse());
    expect(g.nophoto.map((p) => p.no)).toEqual([26, 23, 22, 14]);
    expect(g.nocard).toHaveLength(5);
    expect(g.nocard.some((p) => p.kind === 'admin')).toBe(true);
    expect(filterPeople(s, 'all', '', '', true).some((p) => p.kind === 'team')).toBe(false);
  });
  it('No card filter keeps the admin sign-in in the group', () => {
    expect(filterPeople(s, 'nocard')).toHaveLength(5);
  });
  it('falls back to has_photo before 0087', () => {
    const old = { ...snap(), extra: undefined };
    expect(peopleHeadline(peopleCounts(old))).toBe('18 members · 14 with photo · 5 without a card');
  });
});

describe('admin People · step chip (same rules as the member next-step pill)', () => {
  const s = snap();
  const chip = (no: number) => stepChip(s.people.find((p) => p.no === no)!, s)?.text;
  it('words every step', () => {
    expect(chip(14)).toBe('No Reel');
    expect(chip(15)).toBe('Reel pending');
    expect(chip(19)).toBe('Reel rejected');
    expect(chip(20)).toBe('Prize won – not claimed');
    expect(chip(24)).toBe('Claim held – verify face');
    expect(chip(16)).toBe('Done ✓');
    expect(chip(27)).toBe('Prize won – not claimed');   // weekly prize, not only Founding
  });
  it('no chip for no-card rows or before 0087', () => {
    expect(stepChip(s.people.find((p) => p.user_id === 'nc1')!, s)).toBeNull();
    expect(stepChip(s.people[0], { ...s, extra: undefined })).toBeNull();
  });
  it('hidden Reel without a note: rejected only when no live Reel is left; a pending face check still reads held', () => {
    const t = snap();
    t.extra!.rows.u29 = row({ reel: { status: 'hidden', note: null, at: '2026-11-17T01:00:00Z' } });
    t.extra!.rows.u30 = row({ reel: { status: 'hidden', note: null, at: '2026-11-17T01:00:00Z' } });
    t.extra!.rows.u64 = row({ reel: { status: 'approved', note: null, at: '2026-11-17T01:00:00Z' }, open_claims: 1, check: 'pending' });
    const c = (no: number, o: Partial<Person> = {}) => stepChip({ ...t.people.find((p) => p.no === no)!, ...o }, t)?.text;
    expect(c(29)).toBe('Reel rejected');
    expect(c(30, { reels: { live: 1, waiting: 0, hidden: 1, board_off: 0, board_off_reason: null } })).toBe('Done ✓');
    expect(stepChip({ ...person(64) }, t)?.text).toBe('Claim held – verify face');
  });
  it('a verified member with an open claim is Done, not held', () => {
    const p = { ...s.people.find((x) => x.no === 24)!, verified: true };
    expect(stepChip(p, s)?.text).toBe('Done ✓');
  });
});

describe('member People tab · real photo first', () => {
  const big = 'data:image/jpeg;base64,' + 'A'.repeat(300);
  it('only an uploaded photo counts', () => {
    expect(isRealPhoto(big)).toBe(true);
    expect(isRealPhoto('data:image/jpeg;base64,AAAA')).toBe(false);
    expect(isRealPhoto('https://kringapp.com/app/media/demo1.jpg')).toBe(false);
    expect(isRealPhoto(null)).toBe(false);
    expect(isRealPhoto(NEUTRAL_IMG)).toBe(false);   // the placeholder is an svg data URL longer than 200 chars
  });
  it('photos first, server order kept inside each group', () => {
    const ppl = [{ id: 'a', img: 'n' }, { id: 'b', img: big }, { id: 'c', img: 'n' }, { id: 'd', img: big }];
    expect(photoFirst(ppl).map((p) => p.id)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('admin face checks (0089)', () => {
  const ferrie: FaceCheck = { id: 'v64', user_id: 'u64', no: 64, name: 'ferrie', status: 'approved', at: '2026-11-17T14:39:13Z', reviewed_at: '2026-11-17T14:43:12Z', auto: true,
    live: { straight: true, left: true, right: true, blink: false, blink_fallback: true, device: 'iPhone', match: null }, reason: null, selfie_path: 'a/b.jpg',
    selfie_deleted_at: null, verified: true, undo: false, paid: 0 };
  it('words the steps and the status', () => {
    expect(liveSteps(ferrie.live)).toBe('straight ✓ · left ✓ · right ✓ · blink skipped · iPhone');
    expect(faceStatusWords(ferrie)).toBe('Approved automatically');
    expect(faceStatusWords({ ...ferrie, status: 'rejected', undo: true })).toBe('Rejected by you after auto-approval');
    expect(faceStatusWords({ ...ferrie, status: 'pending', auto: false })).toBe('Waiting for review');
    expect(liveSteps(null)).toBe('no live-check data');
  });
  it('card chip: ✓ face / face pending / face refused', () => {
    const p = snap().people[0];
    expect(faceChip({ ...p, verified: true })?.text).toBe('✓ face');
    expect(faceChip({ ...p, check: { id: 'x', status: 'pending', at: '', auto: null, reason: null } })?.text).toBe('face pending');
    expect(faceChip({ ...p, check: { id: 'x', status: 'rejected', at: '', auto: null, reason: null } })?.text).toBe('face refused');
    expect(faceChip(p)?.text).toBe('no face check');
    expect(faceChip({ ...p, kind: 'nocard' })).toBeNull();
  });
});
