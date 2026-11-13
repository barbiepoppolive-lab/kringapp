import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { V5_L, v5ErrText } from './v5Strings';
import { V5Qr } from './V5Sheets';
import { v5Area, V5_AREAS } from './v5Live';

const LANGS = ['th', 'zh', 'hi', 'ja', 'ko'];
// Keys that already live in the older V8/V9 tables (QA_L / V9_L) and are translated there.
const OLDER_TABLE_KEYS = new Set([
  'Sign in to continue',
  'You already sent your one hello to {0}. Full chat opens as soon as they reply.',
  'You have reached your daily limit of 15 hellos today. Try again tomorrow!',
]);

describe('V5 strings', () => {
  it('every language has exactly the same keys, all filled', () => {
    const base = Object.keys(V5_L.th).sort();
    for (const l of LANGS) {
      expect(Object.keys(V5_L[l]).sort()).toEqual(base);
      for (const [k, v] of Object.entries(V5_L[l])) {
        expect(v.trim().length, `${l}: ${k}`).toBeGreaterThan(0);
        if (k.includes('{0}')) expect(v, `${l} keeps {0}: ${k}`).toContain('{0}');
      }
    }
  });
  it('every error message resolves to a translated string', () => {
    for (const code of ['SIGN_IN', 'NO_CARD', 'AGE_CONFIRM', 'BAD_NAME', 'BAD_LANGS', 'BAD_TEXT', 'BAD_PHOTO', 'ALREADY_SAID_HI', 'THEY_SAID_HI', 'ONE_MESSAGE_RULE',
      'DAILY_LIMIT', 'NO_PERSON', 'BLOCKED', 'SLOW_DOWN', 'SOLD_OUT', 'NO_TREAT', 'OFFLINE', 'NETWORK', 'BAD_CODE', 'GOOGLE_OFF', 'WHATEVER']) {
      const [k] = v5ErrText(code, 'Ana');
      expect(OLDER_TABLE_KEYS.has(k) || k in V5_L.th, code + ' → ' + k).toBe(true);
    }
  });
  it('no dating words, host, meet locals, alcohol or temples in any V5 string', () => {
    const all = [...Object.keys(V5_L.th), ...LANGS.flatMap((l) => Object.values(V5_L[l]))].join(' \n ').toLowerCase();
    for (const w of ['dating', ' date ', 'tinder', 'match', ' host', 'meet locals', 'alcohol', 'beer', 'cocktail', 'temple', 'วัด', 'เหล้า', 'เบียร์']) expect(all.includes(w), w).toBe(false);
  });
  it('T-219 new-friends wording: no meet / find someone / go together / single in any V5 string', () => {
    const all = [...Object.keys(V5_L.th), ...LANGS.flatMap((l) => Object.values(V5_L[l]))].join(' \n ').toLowerCase();
    for (const w of ['meet', 'go together', 'go with', 'find someone', 'single', 'หาคน', 'ไปด้วยกัน', 'เจอ', 'นัด']) expect(all.includes(w), w).toBe(false);
  });
});

describe('V5 helpers', () => {
  it('area is always a known neighbourhood, never an address', () => {
    expect(v5Area('Ari')).toBe('Ari');
    expect(v5Area('Soi 5, house 12')).toBe('Bangkok');
    expect(v5Area(null)).toBe('Bangkok');
    expect(V5_AREAS).toContain('Bangkok');
  });
  it('QR pass renders a real QR for the claim code', () => {
    const { container } = render(<V5Qr value="KR-1A2B3C4D" />);
    const svg = container.querySelector('svg[data-qr="KR-1A2B3C4D"]');
    expect(svg).not.toBeNull();
    expect((svg!.querySelector('path')!.getAttribute('d') || '').length).toBeGreaterThan(500);
  });
});
