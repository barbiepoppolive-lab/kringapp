import { describe, expect, it } from 'vitest';
import { cameFromSharedReel, joinTx } from './JoinPrompt';

describe('join prompt (shared-Reel visitors)', () => {
  it('has every app language, all filled, one language per string', () => {
    for (const l of ['en', 'th', 'zh', 'hi', 'ja', 'ko']) {
      const t = joinTx(l);
      for (const v of Object.values(t)) expect(v.trim().length).toBeGreaterThan(1);
      if (l !== 'en') expect(t.h).not.toBe(joinTx('en').h);
    }
    expect(joinTx('th').h).not.toMatch(/[A-Za-z]/);
    expect(joinTx('xx')).toBe(joinTx('en'));
  });
  it('only a shared Reel link counts', () => {
    expect(cameFromSharedReel('?reel=abc&ref=K1')).toBe(true);
    expect(cameFromSharedReel('?post=abc')).toBe(true);
    expect(cameFromSharedReel('?ref=K1')).toBe(false);
    expect(cameFromSharedReel('')).toBe(false);
  });
});
