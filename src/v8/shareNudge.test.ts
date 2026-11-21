import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { kxWeekHook, nearPrize } from './V5Me';
import { V5_L } from './v5Strings';

const PRIZES = [1500, 900, 600, 500, 400, 250, 150, 100];
const rows = [167, 136, 126, 32, 27, 25, 25, 16, 15, 15].map((rings, i) => ({ rank: i + 1, all_rank: i + 1, rings, is_me: false, to_line: null }));
const week = (rank: number) => ({ me: { rank, all_rank: rank, rings: rows[rank - 1].rings, prize: PRIZES[rank - 1] || 0 }, rows, paid_ranks: 8, prizes: PRIZES, floor: 25 });

describe('21 Nov soft share nudges', () => {
  it('near: next prize rank within 10 Rings', () => {
    expect(kxWeekHook(week(5)).near).toEqual({ n: 6, prize: 500 });     // 27 → 32+1
    expect(kxWeekHook(week(6)).near).toEqual({ n: 3, prize: 400 });
    expect(kxWeekHook(week(7)).near).toEqual({ n: 1, prize: 250 });     // tie at 25
  });
  it('near: the 25-Ring line (in a seat under 25, or outside the prizes)', () => {
    expect(kxWeekHook(week(8)).near).toEqual({ n: 9, prize: 100 });     // #8 at 16
    expect(kxWeekHook(week(9)).near).toEqual({ n: 10, prize: 100 });    // #9 at 15, #8 seat under 25
  });
  it('no nudge when far, at #1, or off the board', () => {
    expect(kxWeekHook(week(1)).near).toBeNull();
    expect(kxWeekHook(week(4)).near).toBeNull();                         // 32 → 126+1
    expect(nearPrize({ me: { rings: 3 }, rows, prizes: PRIZES }, 20, 0, 8, 25)).toBeNull();   // 22 to the line
    expect(nearPrize({ me: null, rows, prizes: PRIZES }, null, 0, 8, 25)).toBeNull();
  });
  it('Thai strings, one language at a time', () => {
    expect(V5_L.th['Friends who open this push you up 🚀']).toBe('เพื่อนเปิดดูคลิปนี้ ช่วยดันคุณขึ้นกระดาน 🚀');
    expect(V5_L.th['{0} Rings from {1} · one Story could do it']).toBe('อีก {0} ริงได้ {1} · แชร์สตอรี่เดียวก็ถึง');
  });
  it('wired: approval banner, stats sheet Share, Me chip', () => {
    const app = readFileSync('src/v8/KringAppV8.tsx', 'utf8');
    expect(app).toContain('id="postedPush"');
    expect(app).toContain('onShareBest={kxBestReel ?');
    expect(readFileSync('src/v8/V5Go.tsx', 'utf8')).toContain('id="goStatsShare"');
    expect(readFileSync('src/v8/V5Me.tsx', 'utf8')).toContain('id="kxNearShare"');
  });
});
