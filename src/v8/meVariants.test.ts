import { afterEach, describe, expect, it, vi } from 'vitest';
import { meVariantFromUrl, ME_VARIANTS } from './V5MeVariants';

afterEach(() => { vi.unstubAllEnvs(); });

describe('Me tab redesign preview switch (19 Nov)', () => {
  it('no ?mev = the current Me tab', () => {
    expect(meVariantFromUrl('')).toBe(0);
    expect(meVariantFromUrl('?u=abc')).toBe(0);
  });
  it('on a dev / preview build, ?mev=1..4 picks a variant; anything else is ignored', () => {
    vi.stubEnv('DEV', true);
    expect(meVariantFromUrl('?mev=1')).toBe(1);
    expect(meVariantFromUrl('?mev=4')).toBe(4);
    expect(meVariantFromUrl('?mev=5')).toBe(0);
    expect(meVariantFromUrl('?mev=x')).toBe(0);
  });
  it('a production build never reads the switch (members always see the current Me tab)', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_ME_PREVIEW', '');
    expect(meVariantFromUrl('?mev=2')).toBe(0);
    vi.stubEnv('VITE_ME_PREVIEW', '1');
    expect(meVariantFromUrl('?mev=2')).toBe(2);
  });
  it('four named variants', () => {
    expect(ME_VARIANTS.map((v) => v.letter).join('')).toBe('ABCD');
  });
});
