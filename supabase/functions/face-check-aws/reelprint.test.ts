import { describe, expect, it } from 'vitest';
import { dhashRGBA, hamming, otherMemberInReel } from './reelprint';

function pic(w: number, h: number, f: (x: number, y: number) => number): Uint8ClampedArray {
  const p = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y), i = (y * w + x) * 4; p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 255; }
  return p;
}

describe('dhashRGBA', () => {
  it('left-to-right brighter picture → all ones; darker → all zeros', () => {
    expect(dhashRGBA(pic(90, 80, (x) => x * 2), 90, 80)).toBe('ffffffffffffffff');
    expect(dhashRGBA(pic(90, 80, (x) => 255 - x * 2), 90, 80)).toBe('0000000000000000');
  });
  it('the same picture at another size (re-encoded / resized) gives (almost) the same hash', () => {
    const f = (x: number, y: number, w: number, h: number) => Math.round(128 + 100 * Math.sin((x / w) * 7) * Math.cos((y / h) * 5));
    const a = dhashRGBA(pic(360, 640, (x, y) => f(x, y, 360, 640)), 360, 640);
    const b = dhashRGBA(pic(720, 1280, (x, y) => f(x, y, 720, 1280)), 720, 1280);
    expect(hamming(a, b)).toBeLessThanOrEqual(2);
  });
  it('different pictures are far apart', () => {
    const a = dhashRGBA(pic(100, 100, (x, y) => (x * y) % 256), 100, 100);
    const b = dhashRGBA(pic(100, 100, (x, y) => ((x + 40) * (y + 7) * 3) % 256), 100, 100);
    expect(hamming(a, b)).toBeGreaterThan(10);
  });
  it('rejects a broken picture', () => { expect(() => dhashRGBA(new Uint8Array(3), 10, 10)).toThrow(); });
});

describe('otherMemberInReel', () => {
  const A = 'aaaaaaaa-0000-0000-0000-000000000000', B = 'bbbbbbbb-0000-0000-0000-000000000000';
  it('another member, author never in it → that member', () => {
    expect(otherMemberInReel(A, [{ at: 'poster', hits: [{ user: B, sim: 99.2 }] }, { at: 'middle', hits: [] }])).toEqual({ user: B, sim: 99.2, at: 'poster' });
  });
  it('author appears too (friends together) → nothing', () => {
    expect(otherMemberInReel(A, [{ at: 'poster', hits: [{ user: B, sim: 99 }] }, { at: 'end', hits: [{ user: A.toUpperCase(), sim: 90 }] }])).toBeNull();
  });
  it('a weak look-alike only → nothing', () => {
    expect(otherMemberInReel(A, [{ at: 'poster', hits: [{ user: B, sim: 88 }] }])).toBeNull();
  });
});
