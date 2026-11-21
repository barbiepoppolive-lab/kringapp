import { describe, expect, it } from 'vitest';
import { bkkClock, dayLabel, postAgo } from './postTime';

const now = Date.parse('2026-11-21T12:00:00Z');   // 19:00 Bangkok
const ago = (min: number) => now - min * 60_000;
describe('post times (21 Nov)', () => {
  it('English: now · 5m · 3h · 2d · 21 Nov', () => {
    expect([0.5, 5, 180, 2 * 1440, 6 * 1440 + 1400].map((m) => postAgo(ago(m), 'en', now))).toEqual(['now', '5m', '3h', '2d', '6d']);
    expect(postAgo(Date.parse('2026-11-10T20:00:00Z'), 'en', now)).toBe('11 Nov');   // 03:00 Bangkok on 11 Nov
    expect(postAgo(Date.parse('2025-12-30T05:00:00Z'), 'en', now)).toBe('30 Dec 2025');
  });
  it('Thai: เมื่อกี้ · 5 นาที · 3 ชม. · 2 วัน · 21 พ.ย.', () => {
    expect([0.5, 5, 180, 2 * 1440].map((m) => postAgo(ago(m), 'th', now))).toEqual(['เมื่อกี้', '5 นาที', '3 ชม.', '2 วัน']);
    expect(postAgo(Date.parse('2026-11-01T01:00:00Z'), 'th', now)).toBe('1 พ.ย.');
    expect(postAgo(Date.parse('2025-12-30T05:00:00Z'), 'th', now)).toBe('30 ธ.ค. 68');
  });
  it('day separators and clock use Bangkok time', () => {
    expect(dayLabel(ago(60), 'en', now)).toBe('Today');
    expect(dayLabel(Date.parse('2026-11-20T16:30:00Z'), 'en', now)).toBe('Yesterday');   // 23:30 Bangkok 20 Nov
    expect(dayLabel(Date.parse('2026-11-20T17:30:00Z'), 'th', now)).toBe('วันนี้');        // 00:30 Bangkok 21 Nov
    expect(dayLabel(Date.parse('2026-11-18T05:00:00Z'), 'en', now)).toBe('Wed 18 Nov');
    expect(dayLabel(Date.parse('2026-11-18T05:00:00Z'), 'th', now)).toBe('พ. 18 พ.ย.');
    expect(bkkClock('2026-11-21T07:05:00Z')).toBe('14:05');
    expect(postAgo(null, 'en', now)).toBe('');
  });
});
