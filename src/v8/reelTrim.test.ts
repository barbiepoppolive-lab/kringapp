/**
 * Reel trim (16 Nov): window maths, and checkReel sending 61–600 s clips to the trim step instead of TOO_LONG.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { clock, initialWindow, loopTarget, moveWindow, msToPct, normalize, pxToMs, setEnd, setStart, thumbTimes, TRIM_MAX_MS, TRIM_MIN_MS, windowMs } from './reelTrim';
import { applyTrim, checkReel, ReelError, REEL_MAX_MS } from './v5Reel';
import { V5_L } from './v5Strings';

const FULL = 75_000;
const ok = (w: { startMs: number; endMs: number }, full = FULL) => {
  expect(w.startMs).toBeGreaterThanOrEqual(0);
  expect(w.endMs).toBeLessThanOrEqual(full);
  expect(windowMs(w)).toBeGreaterThanOrEqual(Math.min(TRIM_MIN_MS, full));
  expect(windowMs(w)).toBeLessThanOrEqual(TRIM_MAX_MS);
};

describe('trim window maths', () => {
  it('starts as the first 60 s', () => {
    expect(initialWindow(FULL)).toEqual({ startMs: 0, endMs: 60_000 });
    expect(initialWindow(600_000)).toEqual({ startMs: 0, endMs: 60_000 });
    expect(TRIM_MAX_MS).toBe(REEL_MAX_MS);
  });
  it('moving keeps the length and stops at both ends', () => {
    const w = initialWindow(FULL);
    expect(moveWindow(w, 10_000, FULL)).toEqual({ startMs: 10_000, endMs: 70_000 });
    expect(moveWindow(w, 99_000, FULL)).toEqual({ startMs: 15_000, endMs: 75_000 });
    expect(moveWindow({ startMs: 5000, endMs: 30_000 }, -99_000, FULL)).toEqual({ startMs: 0, endMs: 25_000 });
  });
  it('the start handle shortens to 5 s at least and never past 60 s', () => {
    const w = { startMs: 10_000, endMs: 70_000 };
    expect(setStart(w, 40_000, FULL)).toEqual({ startMs: 40_000, endMs: 70_000 });
    expect(setStart(w, 69_000, FULL)).toEqual({ startMs: 65_000, endMs: 70_000 });   // 5 s minimum
    expect(setStart(w, 0, FULL)).toEqual({ startMs: 10_000, endMs: 70_000 });         // 60 s maximum
    expect(setStart({ startMs: 30_000, endMs: 50_000 }, -5000, FULL)).toEqual({ startMs: 0, endMs: 50_000 });
  });
  it('the end handle shortens to 5 s at least, never past 60 s or the clip end', () => {
    const w = { startMs: 10_000, endMs: 70_000 };
    expect(setEnd(w, 30_000, FULL)).toEqual({ startMs: 10_000, endMs: 30_000 });
    expect(setEnd(w, 11_000, FULL)).toEqual({ startMs: 10_000, endMs: 15_000 });
    expect(setEnd({ startMs: 10_000, endMs: 40_000 }, 99_000, FULL)).toEqual({ startMs: 10_000, endMs: 70_000 });
    expect(setEnd({ startMs: 30_000, endMs: 40_000 }, 99_000, FULL)).toEqual({ startMs: 30_000, endMs: 75_000 });
  });
  it('random drags always give a valid 5–60 s window inside the clip', () => {
    let w = initialWindow(FULL);
    for (let i = 0; i < 2000; i++) {
      const d = (Math.random() - 0.5) * 2 * FULL;
      const k = i % 3;
      w = k === 0 ? moveWindow(w, d, FULL) : k === 1 ? setStart(w, w.startMs + d, FULL) : setEnd(w, w.endMs + d, FULL);
      ok(w);
    }
  });
  it('normalize repairs any window', () => {
    ok(normalize({ startMs: -10, endMs: 999_999 }, FULL));
    ok(normalize({ startMs: 74_000, endMs: 74_500 }, FULL));
    expect(normalize({ startMs: 74_000, endMs: 74_500 }, FULL)).toEqual({ startMs: 70_000, endMs: 75_000 });
  });
  it('clock, strip pixels and thumbnails', () => {
    expect(clock(42_000)).toBe('0:42');
    expect(clock(75_000)).toBe('1:15');
    expect(clock(600_000)).toBe('10:00');
    expect(`${clock(42_000)} / ${clock(75_000)}`).toBe('0:42 / 1:15');
    expect(msToPct(37_500, FULL)).toBe(50);
    expect(pxToMs(100, 300, 75_000)).toBe(25_000);
    expect(thumbTimes(80_000, 8)).toEqual([5000, 15000, 25000, 35000, 45000, 55000, 65000, 75000]);
  });
  it('the preview loops back to the start of the part', () => {
    const w = { startMs: 20_000, endMs: 50_000 };
    expect(loopTarget(30_000, w)).toBeNull();
    expect(loopTarget(50_000, w)).toBe(20_000);
    expect(loopTarget(3_000, w)).toBe(20_000);
  });
});

describe('checkReel + trim', () => {
  const realCreate = document.createElement.bind(document);
  beforeEach(() => {
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'video') Object.defineProperty(el, 'src', { set() { setTimeout(() => (el as HTMLVideoElement).onerror?.(new Event('error') as never), 0); }, get() { return ''; } });
      return el;
    }) as typeof document.createElement);
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:x';
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
  });
  afterEach(() => vi.restoreAllMocks());
  const fx = (n: string) => new File([fs.readFileSync(path.join(__dirname, '__fixtures__', 'reels', n))], n, { type: 'video/mp4' });

  it('61–600 s never throws TOO_LONG: it asks for the trim step', async () => {
    for (const n of ['h264_65s.mp4', 'h264_600s.mp4']) {
      let err: unknown = null;
      const r = await checkReel(fx(n)).catch((e) => { err = e; return null; });
      expect(err, n).toBeNull();
      expect(r?.needsTrim, n).toBe(true);
    }
  });
  it('a ≤ 60 s clip skips the trim step (unchanged)', async () => {
    const r = await checkReel(fx('h264_45s.mp4'));
    expect(r.needsTrim).toBeFalsy();
    expect(r.trim).toBeUndefined();
  });
  it('over 10 min is still too long', async () => {
    const e = await checkReel(fx('h264_660s.mp4')).catch((x) => x);
    expect(e).toBeInstanceOf(ReelError);
    expect((e as ReelError).code).toBe('TOO_LONG');
  });
  it('applyTrim: the Reel becomes the chosen part', async () => {
    const r = await checkReel(fx('h264_65s.mp4'));
    const t = applyTrim(r, { startMs: 4000, endMs: 46_000 });
    expect(t).toMatchObject({ durationMs: 42_000, trim: { startMs: 4000, endMs: 46_000 }, needsTrim: false });
    expect(Math.abs(t.fullMs! - 65_000)).toBeLessThan(300);
    expect(applyTrim(t, { startMs: 0, endMs: 60_000 }).fullMs).toBe(t.fullMs);   // re-trim keeps the whole length
  });
});

describe('trim strings', () => {
  const keys = new Set<string>();
  for (const m of fs.readFileSync(path.join(__dirname, 'V5Trim.tsx'), 'utf8').matchAll(/\bL\(\s*'((?:\\.|[^'])*)'/g)) keys.add(m[1]);
  keys.add('Clip is over 10 minutes · pick a shorter one');
  keys.add('This phone couldn’t cut this clip, so nothing was uploaded. Pick a clip of 60 s or less, or open Kring in Chrome or Safari.');
  it('every visible string has Thai', () => {
    expect(keys.size).toBeGreaterThanOrEqual(6);
    for (const k of keys) expect(V5_L.th[k], k).toBeTruthy();
  });
  it('no banned word', () => {
    const banned = ['meet', 'guide', 'tour', 'host', 'creator', 'reviews', 'hidden gem', 'alcohol', 'gift', 'wallet', 'credit', 'lucky', 'draw', 'temples'];
    for (const k of keys) for (const w of banned) expect(new RegExp(`(^|[^a-z])${w}`, 'i').test(k), `${w} in ${k}`).toBe(false);
  });
});
