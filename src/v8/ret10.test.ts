import { describe, expect, it } from 'vitest';
import { bestiePill, fpParts, fpSum, newFacesOrder, poReason, r10Tx, reelOpeners, type FairPlay } from './ret10';

const THAI = /[฀-๿]/;

describe('Retention 10 words: one language per screen', () => {
  it('Thai and English tables have the same keys, Thai has Thai in every line, English has none', () => {
    const en = r10Tx('en') as unknown as Record<string, string>;
    const th = r10Tx('th') as unknown as Record<string, string>;
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
    for (const k of Object.keys(en)) {
      expect(en[k], k).not.toMatch(THAI);
      // brand / app names and pure symbols may stay Latin in Thai
      if (!/^(rings|ring1|b5Tile)$/.test(k) && !/^[+{}0-9 ·%✓]*$/.test(th[k])) expect(th[k], k).toMatch(THAI);
    }
    expect(r10Tx('ja')).toBe(r10Tx('en'));   // other app languages read English, never a Thai/English mix
  });
  it('profile-only reasons: every key has a title + tip in both languages, unknown keys get the general line', () => {
    for (const k of ['dark', 'blurry', 'noperson', 'noplace', 'sideways', 'short', 'sound', 'slowstart', 'home']) {
      const [t, tip] = poReason('th', k);
      expect(t).toMatch(THAI); expect(tip).toMatch(THAI);
      expect(poReason('en', k)[0]).not.toMatch(THAI);
    }
    expect(poReason('en', 'No person')[0]).toBe('Not picked for the main feed');
    expect(poReason('en', null)[0]).toBe('Not picked for the main feed');
  });
});

describe('feature 7: playful openers', () => {
  it('use the Reel’s place, else "here", in the reader’s language', () => {
    expect(reelOpeners('en', 'Jodd Fairs')).toEqual(['What’s the one thing I can’t miss at Jodd Fairs?', 'This or that: Jodd Fairs or somewhere nearby?', 'Two truths and a lie about Jodd Fairs, go!']);
    expect(reelOpeners('en', '')[0]).toBe('What’s the one thing I can’t miss here?');
    expect(reelOpeners('th', 'ตลาดน้อย').every((s) => THAI.test(s) && s.includes('ตลาดน้อย'))).toBe(true);
  });
  it('pass the first-hello safety check (no links, numbers or handles)', async () => {
    const { validateFirstHelloMessage } = await import('./v8Data');
    for (const lang of ['en', 'th']) for (const s of [...reelOpeners(lang, 'Siam'), ...reelOpeners(lang, null)]) expect(validateFirstHelloMessage(s).valid, s).toBe(true);
  });
});

describe('feature 2: New in Bangkok order', () => {
  it('Reels fewest likes first (max 10), first answers after them', () => {
    const at = (h: number) => new Date(Date.UTC(2026, 10, 26, h)).toISOString();
    const items = [
      { k: 'reel', id: 'a', likes: 4, at: at(1) }, { k: 'ans', id: 'x', at: at(9) }, { k: 'reel', id: 'b', likes: 0, at: at(2) },
      ...Array.from({ length: 11 }, (_, i) => ({ k: 'reel', id: `r${i}`, likes: 9, at: at(3) })),
    ];
    const out = newFacesOrder(items);
    expect(out.slice(0, 2).map((x) => x.id)).toEqual(['b', 'a']);
    expect(out.filter((x) => x.k === 'reel').length).toBe(10);
    expect(out[out.length - 1].id).toBe('x');
  });
});

describe('feature 9: fair-play parts add up to the board number', () => {
  const d = (o: Partial<FairPlay> = {}): FairPlay => ({
    user_id: 'u', first_name: 'Ploy', is_me: false, as_of: '', on_board: true, rings: 46, rank: 2, reels_total: 31, reel_count: 2, more_reels: 0,
    likes_verified: { n: 20, visitors: 1, rings: 21, who: [] }, likes_newer: { n: 2, rings: 2, day_cap: 2, who: [] }, saves: { n: 2, rings: 6 },
    opens: { n: 1, rings: 5, by_app: {}, over_cap: 0, not_counted: {}, day_cap: 10 }, rules_adjust: -3, tasks: 15, ask_opens: 0, invites: 0,
    invites_shown: true, lag: 0, weights: { like: 1, save: 3, open: 5, mult: 2 }, days: [], ...o,
  });
  it('likes + saves + opens + fair-play rules + tasks + invites + lag = rings', () => {
    expect(fpSum(d())).toBe(46);
    expect(fpSum(d({ rings: 66, invites: 20 }))).toBe(66);
  });
  it('a paid recruiter has no invite part at all', () => {
    expect(fpParts(d({ invites: 0, invites_shown: false })).some((p) => p.key === 'invites')).toBe(false);
  });
});

describe('feature 8: bestie pill', () => {
  it('names the partner only when the server sends one (lists private → count only)', () => {
    expect(bestiePill('en', { count: 6, partner: { user_id: 'p', first_name: 'Mint' } })).toBe('6 days with Mint');
    expect(bestiePill('en', { count: 6, partner: null })).toBe('Bestie streak · 6 days');
    expect(bestiePill('th', { count: 3, partner: null })).toMatch(THAI);
  });
});
