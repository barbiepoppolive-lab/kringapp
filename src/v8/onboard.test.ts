import { describe, expect, it } from 'vitest';
import { badgePills, STREAK_MIN } from './badges';
import { onbActive, onbCount, onbNext } from './onboard';

describe('m214 tags', () => {
  it('Bangkok Local ✓ shows from the badge, one language at a time', () => {
    expect(badgePills('en', ['bangkok_local'], null).map((p) => p.text)).toEqual(['Bangkok Local ✓']);
    expect(badgePills('th', ['bangkok_local'], null).map((p) => p.text)).toEqual(['คนกรุงเทพฯ ตัวจริง ✓']);
  });
  it('streak tag only from 2 days', () => {
    expect(STREAK_MIN).toBe(2);
    expect(badgePills('en', [], null, 1)).toEqual([]);
    expect(badgePills('en', [], null, 0)).toEqual([]);
    expect(badgePills('en', [], null, 2).map((p) => `${p.icon} ${p.text}`)).toEqual(['🔥 2 days']);
    expect(badgePills('th', [], null, 5)[0].text).toBe('5 วันติด');
  });
  it('order: week place, Founding Local, Bangkok Local, streak', () => {
    const k = badgePills('en', ['bangkok_local', 'founding_local'], { rank: 2, week: '2026-11-16', week_no: 47 }, 3).map((p) => p.key);
    expect(k).toEqual(['week', 'founding_local', 'bangkok_local', 'streak']);
  });
});

describe('m214 first-visit steps', () => {
  const base = { on: true, new: true, ask: false, likes: 0, clip: false, done: false };
  it('counts and picks the next step in order', () => {
    expect(onbCount(base)).toBe(0);
    expect(onbNext(base)).toBe('ask');
    expect(onbNext({ ...base, ask: true, likes: 2 })).toBe('like');
    expect(onbCount({ ...base, ask: true, likes: 3 })).toBe(2);
    expect(onbNext({ ...base, ask: true, likes: 3 })).toBe('clip');
    expect(onbNext({ ...base, ask: true, likes: 3, clip: true })).toBe(null);
  });
  it('shows only for new members who have not finished', () => {
    expect(onbActive(base, 'u1')).toBe(true);
    expect(onbActive({ ...base, new: false }, 'u1')).toBe(false);
    expect(onbActive({ ...base, done: true }, 'u1')).toBe(false);
    expect(onbActive(null, 'u1')).toBe(false);
  });
});
