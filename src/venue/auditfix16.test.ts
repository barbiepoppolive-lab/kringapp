import { describe, expect, it } from 'vitest';
import { lineMessage } from './adminHelpers';
import { reviewNoteText } from '../v8/kxLogic';

describe('audit 16 Nov fixes (pure parts)', () => {
  it('P3-3 partner welcome: no "คุณคุณ", no Thai name in the English half', () => {
    const m = lineMessage({ name: 'Baan Ari', contact: 'คุณสมชาย', link: '' });
    expect(m).toContain('สวัสดีครับ คุณสมชาย');
    expect(m).not.toContain('คุณคุณ');
    expect(m).toContain('Hello! Welcome to Kring, Baan Ari');
    const m2 = lineMessage({ name: 'Baan Ari', contact: 'คุณสมชาย Somchai', link: '' });
    expect(m2).toContain('Hello Somchai! Welcome');
    const m3 = lineMessage({ name: 'Lumpini Gym', contact: 'Khun Nok', link: '' });
    expect(m3).toContain('สวัสดีครับ คุณNok');
    expect(m3).toContain('Hello Nok!');
  });
  it('P2-3 hidden Reel reason: Thai phones get the Thai line, others the English', () => {
    const note = 'หมุดสถานที่ไม่ตรงกับรีล\nThe pinned place doesn’t match the Reel.';
    expect(reviewNoteText(note, 'th')).toBe('หมุดสถานที่ไม่ตรงกับรีล');
    expect(reviewNoteText(note, 'en')).toBe('The pinned place doesn’t match the Reel.');
    expect(reviewNoteText('typed by hand', 'th')).toBe('typed by hand');
    expect(reviewNoteText(null, 'en')).toBe('');
  });
});
