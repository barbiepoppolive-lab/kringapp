// Item 5 (audit A-04, A-12): public events and demo links.
import { describe, expect, it } from 'vitest';
import { V8_PUBLIC_EVENTS, v8LiveEvents } from './v8Events';

describe('public events (A-04)', () => {
  it('no library / stock photos and no "weekend" wording', () => {
    for (const ev of V8_PUBLIC_EVENTS) {
      expect(ev.bgImage, ev.id).toBeUndefined();
      const all = [ev.whenWhere, ...Object.values(ev.whenWhereByLang), ev.name, ev.tag].join(' ').toLowerCase();
      expect(all.includes('weekend'), ev.id).toBe(false);
    }
  });
  it('dated events disappear after their end date', () => {
    const before = v8LiveEvents('All Bangkok', Date.parse('2026-11-15T12:00:00+07:00')).map((e) => e.id);
    const after = v8LiveEvents('All Bangkok', Date.parse('2026-11-30T12:00:00+07:00')).map((e) => e.id);
    expect(before).toContain('ev-think-fest-ari');
    expect(after).not.toContain('ev-think-fest-ari');
    expect(after).not.toContain('ev-song-wat');
    expect(after).toContain('ev-jodd-fairs');      // ongoing events stay
  });
  it('the area pill filters events too', () => {
    const ari = v8LiveEvents('Ari', Date.parse('2026-11-15T12:00:00+07:00'));
    expect(ari.length).toBeGreaterThan(0);
    expect(ari.every((e) => e.area === 'Ari')).toBe(true);
  });
});

import { V5_AREAS } from './v5Live';
describe('event areas', () => {
  it('every event area is one the server accepts (an "I’m going" post would fail otherwise)', () => {
    for (const ev of V8_PUBLIC_EVENTS) expect(V5_AREAS as readonly string[], ev.id).toContain(ev.area);
  });
});
