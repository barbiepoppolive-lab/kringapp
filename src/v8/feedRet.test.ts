import { describe, expect, it } from 'vitest';
import { voteLine, VOTE_EVERY, VOTE_PCT_FROM } from './feedRet';
import { KX_L } from './v5Strings';

const en = (s: string) => s;
const th = (s: string) => KX_L.th[s] || s;

describe('feed vote card result line (m212)', () => {
  it('every 4th Reel, % only from 10 other voters', () => {
    expect(VOTE_EVERY).toBe(4);
    expect(VOTE_PCT_FROM).toBe(10);
  });
  it('shows a percentage only when the server sent one from 10+ voters', () => {
    expect(voteLine(en, { others: 13, same: 8, pct: 62 }).main).toBe('You agree with 62% of Bangkok');
    expect(voteLine(th, { others: 13, same: 8, pct: 62 }).main).toBe('คุณคิดเหมือนคนกรุงเทพฯ 62%');
  });
  it('below 10 voters: a count, never a %', () => {
    const l = voteLine(en, { others: 5, same: 1, pct: null });
    expect(l.main).toBe('1 of 5 who voted here picked this too');
    expect(l.main).not.toMatch(/%/);
    expect(voteLine(en, { others: 0, same: 0, pct: null }).main).toBe('You’re the first to vote on this one');
    expect(voteLine(en, { others: 3, same: 0, pct: null }).main).toBe('No one else picked this yet · 3 voted here');
  });
  it('Thai mode is Thai only', () => {
    for (const r of [{ others: 0, same: 0, pct: null }, { others: 3, same: 0, pct: null }, { others: 5, same: 2, pct: null }, { others: 12, same: 6, pct: 50 }]) {
      const l = voteLine(th, r);
      expect(`${l.main} ${l.sub || ''}`).not.toMatch(/[A-Za-z]/);
    }
  });
});
