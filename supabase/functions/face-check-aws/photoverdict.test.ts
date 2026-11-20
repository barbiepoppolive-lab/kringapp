import { describe, expect, it } from 'vitest';
import { photoVerdictAws, PHOTO_CHILD_HIGH } from './photoverdict';

const face = (w: number, age?: [number, number], conf = 99) => ({ Confidence: conf, BoundingBox: { Width: w }, ...(age ? { AgeRange: { Low: age[0], High: age[1] } } : {}) });

describe('photoVerdictAws (card photo)', () => {
  it('one clear adult face → ok', () => { expect(photoVerdictAws([face(0.4, [24, 32])])).toBe('ok'); });
  it('a small child (#307: 3–7) → child', () => { expect(photoVerdictAws([face(0.3, [3, 7])])).toBe('child'); });
  it('a teen whose range tops out at 17 → child; at 18 → ok', () => {
    expect(photoVerdictAws([face(0.4, [12, 17])])).toBe('child');
    expect(photoVerdictAws([face(0.4, [14, PHOTO_CHILD_HIGH])])).toBe('ok');
  });
  it('the biggest face decides: adult in front, child behind → ok; child in front of an adult → child', () => {
    expect(photoVerdictAws([face(0.1, [4, 8]), face(0.45, [25, 33])])).toBe('ok');
    expect(photoVerdictAws([face(0.15, [26, 34]), face(0.4, [5, 9])])).toBe('child');
  });
  it('no age from AWS → old rules unchanged', () => { expect(photoVerdictAws([face(0.4)])).toBe('ok'); });
  it('keeps none / small / group / text', () => {
    expect(photoVerdictAws([])).toBe('none');
    expect(photoVerdictAws([face(0.4, [20, 28], 50)])).toBe('none');
    expect(photoVerdictAws([face(0.05, [25, 30])])).toBe('small');
    expect(photoVerdictAws([face(0.4, [25, 30]), face(0.38, [24, 31])])).toBe('group');
    expect(photoVerdictAws([face(0.4, [25, 30])], 30)).toBe('text');
  });
  it('a tiny child face still counts as small first (no age message for a far-away face)', () => { expect(photoVerdictAws([face(0.05, [3, 7])])).toBe('small'); });
});
