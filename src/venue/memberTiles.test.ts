import { describe, expect, it } from 'vitest';
import { isMemberTiles, tileList, type MemberTiles } from './memberTiles';

const m = (no: number, verified: boolean, tried: boolean) => ({ user_id: 'u' + no, no, name: 'M' + no, joined_at: '2026-11-20T00:00:00Z', last_active_at: null, verified, tried, status: '' });
const t: MemberTiles = { definition: '', counts: { real: 4, verified: 2, not_verified: 2, tried: 1 }, members: [m(1, true, false), m(2, true, true), m(3, false, true), m(4, false, false)] };

describe('0176 member tiles', () => {
  it('each tile lists exactly the members behind its number', () => {
    expect(isMemberTiles(t)).toBe(true);
    expect(tileList(t, 'real').length).toBe(t.counts.real);
    expect(tileList(t, 'verified').map((x) => x.no)).toEqual([1, 2]);
    expect(tileList(t, 'not_verified').map((x) => x.no)).toEqual([3, 4]);
    expect(tileList(t, 'tried').map((x) => x.no)).toEqual([3]);
  });
});
