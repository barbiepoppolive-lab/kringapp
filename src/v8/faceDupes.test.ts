// 0076 duplicate faces (17 Nov: #53 "Pom" = 2nd account of #30 "Pom Thanatp", caught only by the founder's eye):
// card photo face code on the phone, admin Face check banner, face_maybe flag in Same person?, look-alike email, migration shape.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ensureCardPrint, photoKey } from './cardPrint';
import { buildClusters, isLinkReason, isLookalikeMap, linkText, lookalikeBanner, REASON_LABEL, type DupOverview, type FaceLookalikes } from '../venue/dupAdmin';

const memStore = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
const desc = () => new Float32Array(128).fill(0.01);

describe('card photo face code (phone)', () => {
  it('makes and saves the code once per photo', async () => {
    const store = memStore();
    const describe_ = vi.fn(async () => desc());
    const save = vi.fn(async () => true);
    expect(await ensureCardPrint('data:image/jpeg;base64,AAA', { describe: describe_, save, store })).toBe('saved');
    expect(await ensureCardPrint('data:image/jpeg;base64,AAA', { describe: describe_, save, store })).toBe('done-before');
    expect(save).toHaveBeenCalledTimes(1);
    // a new photo = a new code
    expect(await ensureCardPrint('data:image/jpeg;base64,BBB', { describe: describe_, save, store })).toBe('saved');
    expect(save).toHaveBeenCalledTimes(2);
  });
  it('no face → remembered, nothing sent', async () => {
    const store = memStore();
    const save = vi.fn(async () => true);
    expect(await ensureCardPrint('x.jpg', { describe: async () => null, save, store })).toBe('no-face');
    expect(await ensureCardPrint('x.jpg', { describe: async () => null, save, store })).toBe('done-before');
    expect(save).not.toHaveBeenCalled();
  });
  it('a network error or a switched-off server is NOT remembered (tried again next time) and never throws', async () => {
    const store = memStore();
    expect(await ensureCardPrint('y.jpg', { describe: async () => desc(), save: async () => { throw new Error('offline'); }, store })).toBe('error');
    expect(await ensureCardPrint('y.jpg', { describe: async () => desc(), save: async () => false, store })).toBe('off');
    expect(await ensureCardPrint('y.jpg', { describe: async () => desc(), save: async () => true, store })).toBe('saved');
    expect(await ensureCardPrint(null, { describe: async () => desc(), save: async () => true, store })).toBe('no-face');
  });
  it('17 Nov: no card-photo consent (older members) → no face work and nothing sent; asked again next time', async () => {
    const store = memStore();
    const describe_ = vi.fn(async () => desc());
    const save = vi.fn(async () => true);
    expect(await ensureCardPrint('z.jpg', { describe: describe_, save, store, allowed: async () => false })).toBe('off');
    expect(await ensureCardPrint('z.jpg', { describe: describe_, save, store, allowed: async () => { throw new Error('old server'); } })).toBe('off');
    expect(describe_).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(await ensureCardPrint('z.jpg', { describe: describe_, save, store, allowed: async () => true })).toBe('saved');
  });
  it('the memo key is short even for a 50 KB data URL, and ignores ?query', () => {
    const big = 'data:image/jpeg;base64,' + 'A'.repeat(50000);
    expect(photoKey(big).length).toBeLessThan(40);
    expect(photoKey('https://x/a.jpg?t=1')).toBe(photoKey('https://x/a.jpg?t=2'));
    expect(photoKey(big)).not.toBe(photoKey(big + 'B'));
  });
  it('the app runs it after the card photo check passes', () => {
    const app = readFileSync('src/v8/KringAppV8.tsx', 'utf8');
    expect(app).toMatch(/ensureCardPrint\(src, \{ describe: \(u\) => loadImage\(u\)\.then\(faceDescriptor\), save: v5SaveCardPrint, allowed: v5CardPrintOk \}\)/);
    expect(app).toMatch(/if \(ok\) \{ setPhotoFix\(false\); cardPrint\(\); return; \}/);
  });
});

describe('admin Face check banner', () => {
  const look = (x: Partial<FaceLookalikes['matches'][0]> = {}, more: FaceLookalikes['matches'] = []): FaceLookalikes => ({ has_print: true,
    matches: [{ user_id: 'u30', member_no: 30, first_name: 'Pom Thanatp', verified: true, dist: 0.496, strength: 'same', sources: 'verify vs selfie', ...x }, ...more] });
  it('says who it looks like, with the distance', () => {
    const b = lookalikeBanner(look())!;
    expect(b.text).toBe('Looks like #30 Pom Thanatp ✓ — 0.50');
    expect(b.tone).toBe('r');
    expect(b.more).toMatch(/reject if it is the same person/);
  });
  it('amber for a look-alike (card photo), lists the others', () => {
    const b = lookalikeBanner(look({ strength: 'maybe', dist: 0.41, verified: false }, [{ user_id: 'u29', member_no: 29, first_name: 'JERJAM', verified: false, dist: 0.45, strength: 'maybe' }]))!;
    expect(b.text).toBe('Looks like #30 Pom Thanatp — 0.41');
    expect(b.tone).toBe('a');
    expect(b.more).toMatch(/Also close: #29 JERJAM 0\.45/);
  });
  it('nothing when nobody is close or the data is missing', () => {
    expect(lookalikeBanner({ has_print: true, matches: [] })).toBeNull();
    expect(lookalikeBanner(undefined)).toBeNull();
    expect(isLookalikeMap({ a: { has_print: false, matches: [] } })).toBe(true);
    expect(isLookalikeMap([])).toBe(false);
    expect(isLookalikeMap({ a: { nope: 1 } })).toBe(false);
  });
});

describe('Same person? face_maybe', () => {
  it('is a flag, not a link, with its own label and distance', () => {
    expect(isLinkReason('face_maybe')).toBe(false);
    expect(REASON_LABEL.face_maybe).toBe('Faces look alike');
    expect(linkText({ a: 'a', b: 'b', reason: 'face_maybe', detail: { dist: 0.451, sources: 'with a card photo' }, first_at: '', dismissed: false }))
      .toBe('Faces look alike · 0.45 (with a card photo)');
  });
  it('a look-alike pair is a cluster of its own, shown as flag only', () => {
    const m = (id: string, no: number) => ({ user_id: id, member_no: no, first_name: 'M' + no, photo: null, joined_at: `2026-11-1${no % 10}T00:00:00Z`, verified: false, ghost: false,
      is_test: false, line: false, prints: 1, selfie_path: null, reels: 0, prizes: [] });
    const ov: DupOverview = { links: [{ a: 'x', b: 'y', reason: 'face_maybe', detail: { dist: 0.45 }, first_at: '', dismissed: false }], members: [m('x', 15), m('y', 29)], held: [], mutual: [] };
    const c = buildClusters(ov);
    expect(c).toHaveLength(1);
    expect(c[0].reasons).toEqual(['face_maybe']);
    expect(c[0].reasons.some(isLinkReason)).toBe(false);
  });
});

describe('server + email (written, not applied)', () => {
  const sql = readFileSync('supabase/migrations/0076_kr8_face_dupes.sql', 'utf8');
  it('kr8_linked is not changed (a look-alike flag never costs Rings or holds a claim)', () => {
    expect(sql).not.toMatch(/function public\.kr8_linked/);
    expect(sql).toMatch(/check \(reason in \('face', 'face_maybe', 'device', 'network', 'line'\)\)/);
  });
  it('card codes only ever make face_maybe; face check pairs at ≤ face_same_max make face', () => {
    expect(sql).toMatch(/r\.d_check is not null and r\.d_check <= same_max then\s+perform public\.kr8_link_add\(p_user, r\.user_id, 'face'/);
    expect(sql).toMatch(/or r\.d_any <= card_max then\s+perform public\.kr8_link_add\(p_user, r\.user_id, 'face_maybe'/);
  });
  it('member RPCs are granted, team-only helpers are not', () => {
    expect(sql).toMatch(/grant execute on function public\.kr8_save_card_print\(real\[\]\) to authenticated/);
    expect(sql).toMatch(/revoke all on function public\.kr8_face_is_check\(text\), public\.kr8_face_nearest\(uuid, int\)[^;]*from public, anon, authenticated/);
  });
  it('the founder email names both members and the distance', () => {
    const fn = readFileSync('supabase/functions/notify-new-member/index.ts', 'utf8');
    expect(fn).toMatch(/p\.table === "kr8_face_lookalike"/);
    expect(fn).toMatch(/looks like \$\{rec\.other_name\} #\$\{rec\.other_no\} · \$\{Number\(rec\.dist\)\.toFixed\(2\)\}/);
  });
});
