import { describe, expect, it } from 'vitest';
import { dailyPhotoVerdict } from './dailyphoto';

const U = 'aaaaaaaa-0000-0000-0000-000000000001';
const face = (w: number, high = 30) => ({ Confidence: 99, BoundingBox: { Width: w }, AgeRange: { Low: 20, High: high } });
const person = [{ Name: 'Person', Confidence: 98, Instances: [{ Confidence: 97, BoundingBox: { Width: 0.3, Height: 0.6 } }] }];

describe('m242 daily photo: a bit of the member, face optional', () => {
  it('a view, food or a meme with nobody in it is refused', () => {
    expect(dailyPhotoVerdict(U, [{ Name: 'City', Confidence: 99 }, { Name: 'Food', Confidence: 95 }], [], 0, null)).toBe('noperson');
  });
  it('back / outfit / hand shots (person, no clear face) pass', () => {
    expect(dailyPhotoVerdict(U, person, [], 0, null)).toBe('ok');
    expect(dailyPhotoVerdict(U, [{ Name: 'Hand', Confidence: 90 }], [], 0, null)).toBe('ok');
  });
  it('a tiny far-away figure or a person on a billboard does not count', () => {
    expect(dailyPhotoVerdict(U, [{ Name: 'Person', Confidence: 90, Instances: [{ Confidence: 85, BoundingBox: { Width: 0.05, Height: 0.1 } }] }], [], 0, null)).toBe('noperson');
  });
  it('a screenshot full of words is refused', () => {
    expect(dailyPhotoVerdict(U, person, [face(0.3)], 40, [{ user: U, sim: 99 }])).toBe('text');
  });
  it('a child is refused', () => {
    expect(dailyPhotoVerdict(U, person, [face(0.3, 12)], 0, [])).toBe('child');
  });
  it('one clear face: only this member passes', () => {
    expect(dailyPhotoVerdict(U, person, [face(0.3)], 0, [{ user: U, sim: 97 }])).toBe('ok');
    expect(dailyPhotoVerdict(U, person, [face(0.3)], 0, [])).toBe('notyou');
    expect(dailyPhotoVerdict(U, person, [face(0.3)], 0, [{ user: 'someone-else', sim: 99 }])).toBe('other');
  });
  it('a group with friends is fine', () => {
    expect(dailyPhotoVerdict(U, person, [face(0.2), face(0.18)], 0, [])).toBe('ok');
  });
});
