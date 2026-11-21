import { describe, expect, it } from 'vitest';
import { cleanThai, sendFailReason, splitForTranslation } from './adminHelp';

describe('Help send (21 Nov): long replies translate in pieces, failures read plainly', () => {
  it('splits long English into short pieces, keeps short ones whole', () => {
    expect(splitForTranslation('Hi 🙏 short one.')).toEqual(['Hi 🙏 short one.']);
    const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} explains one more step of the Rewards page.`).join(' ');
    const parts = splitForTranslation(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 320)).toBe(true);
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(long);
    expect(splitForTranslation('Para one.\n\nPara two.')).toEqual(['Para one.', 'Para two.']);
  });
  it('refuses a cut-off or non-Thai translation, strips the tags', () => {
    expect(cleanThai('<thai>สวัสดีครับ</thai>')).toBe('สวัสดีครับ');
    expect(cleanThai('<thai>สวัสดีครับ ต่อไปเรื่อย ๆ')).toBeNull();
    expect(cleanThai('Hello')).toBeNull();
  });
  it('plain reasons', () => {
    expect(sendFailReason(new Error('KR8_ADMIN_ONLY'))).toMatch(/sign-in has expired/);
    expect(sendFailReason(new Error('TypeError: Failed to fetch'))).toMatch(/no internet/);
    expect(sendFailReason(new Error('KR8_BAD_TEXT'))).toMatch(/2,000/);
  });
});
