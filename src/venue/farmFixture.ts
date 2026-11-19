/**
 * Demo data for the Ring-farming check tests and the 390px screenshot (shaped like this week's real case: #19 is #1 with 125 Rings,
 * 12 accounts joined overnight 1:30–6:30 am India time via #19's link or no link, each liked exactly 3 of #19's Reels and nothing else).
 * Test-only: nothing in the app imports this file.
 */
import type { FarmCase, FarmData, FarmGiver } from './farmLogic';

export const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const IPH = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const AND = 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const NAMES = ['Ploy', 'Bank', 'Fern', 'Mook', 'Golf', 'Ice', 'Pim', 'Beam', 'Nam', 'Tong', 'Kwan', 'Boss'];
const VERIFIED = new Set(['Ploy', 'Fern', 'Golf', 'Pim', 'Kwan']);
const POSTED = new Set(['Ploy', 'Bank', 'Fern', 'Golf', 'Pim', 'Nam', 'Kwan']);
const giver = (o: Partial<FarmGiver> & Pick<FarmGiver, 'user_id' | 'no' | 'name' | 'joined_at'>): FarmGiver => ({
  ref_code: null, src_code: null, ref_no: null, ref_name: null, verified: false, has_photo: true, ghost: false, ua: null, ua2: null,
  likes: 3, saves: 0, reels: 3, opens: 0, given_total: 3, people: 1, others: [], own_reels: 0, first_give_at: null, first_give_min: 8,
  by_share: true, by_link: false, by_flag: false, rings_from: 3, one_like: 1, ...o,
});
// 01:30 → 06:30 IST on 18 Nov = 20:00 → 01:00 UTC
const T0 = Date.parse('2026-11-17T20:00:00Z');
export const nutGivers: FarmGiver[] = NAMES.map((name, i) => {
  const joined = new Date(T0 + Math.round((i * 300) / 11) * 60000).toISOString();
  const viaLink = i < 8;
  return giver({
    user_id: U(121 + i), no: 121 + i, name, joined_at: joined, ref_code: viaLink ? 'k00019' : null, ref_no: viaLink ? 19 : null, ref_name: viaLink ? 'Nut' : null,
    verified: VERIFIED.has(name), own_reels: POSTED.has(name) ? 1 : 0, ua: i % 2 ? AND : IPH, first_give_min: [4, 6, 9, 11, 12, 7, 15, 18, 5, 10, 14, 13][i],
    first_give_at: new Date(Date.parse(joined) + 600000).toISOString(), by_link: viaLink,
  });
});
export const nutCase: FarmCase = {
  beneficiary: { user_id: U(19), no: 19, name: 'Nut', joined_at: '2026-11-02T08:00:00Z', verified: true, rank: 1, rings: 125, rings_full: 125, rings_once: 101, rings_none: 89 },
  decision: null, links: [], givers: nutGivers,
};
export const mintCase: FarmCase = {
  beneficiary: { user_id: U(74), no: 74, name: 'Mint', joined_at: '2026-11-17T08:00:00Z', verified: true, rank: 4, rings: 40, rings_full: 40, rings_once: 37, rings_none: 36 },
  decision: null,
  links: [{ a: U(74), b: U(76), reason: 'device' }],
  givers: [giver({ user_id: U(76), no: 76, name: 'Reaper', joined_at: '2026-11-18T05:00:00Z', ua: 'Mozilla/5.0 (Linux; Android 13; SM-A515F) AppleWebKit/537.36 Chrome/119.0 Mobile Safari/537.36',
    likes: 3, saves: 1, reels: 2, given_total: 4, rings_from: 4, by_share: true, by_flag: true, first_give_min: 3 })],
};
export const organicCase: FarmCase = {
  beneficiary: { user_id: U(20), no: 20, name: 'Mai', joined_at: '2026-10-20T08:00:00Z', verified: true, rank: 3, rings: 80, rings_full: 80, rings_once: 78, rings_none: 76 },
  decision: null, links: [],
  givers: [5, 6, 7].map((n, i) => giver({ user_id: U(n), no: n, name: `Old${n}`, joined_at: `2026-10-0${i + 1}T08:00:00Z`, verified: true, own_reels: 3, likes: 2, reels: 2,
    given_total: 6, people: 4, others: [{ no: 30, name: 'Pat', n: 2 }], ua: i ? AND : IPH, first_give_min: 40000, rings_from: 2, by_share: false, by_flag: true })),
};
export const farmData = (cases: FarmCase[] = [nutCase, mintCase]): FarmData => ({
  week_start: '2026-11-15T17:00:00Z', now: '2026-11-19T04:00:00Z', weights: { like: 1, save: 3, traveller_mult: 2 }, paid_ranks: 8,
  board: [{ user_id: U(19), rings: 125, rank: 1 }, { user_id: U(33), rings: 96, rank: 2 }, { user_id: U(20), rings: 80, rank: 3 }, { user_id: U(74), rings: 40, rank: 4 }],
  cases: structuredClone(cases),
});
