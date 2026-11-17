// Unit tests for functions/_lib/webreels.js (public Reel + area pages). Run: npx vitest run tools/webreels.test.mjs
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as W from '../functions/_lib/webreels.js';

const R1 = { short: 'abc2345', name: 'Ploy', caption: 'Sunset run <script>alert(1)</script> @someone.x by the river', area: 'Ari',
  place_en: 'Ari Soi 1 Café', place_th: 'คาเฟ่อารีย์ซอย 1', at: '2026-11-15T10:00:00+00:00', dur: 12400, w: 720, h: 1280, outside: false };
const R2 = { ...R1, short: 'xyz9876', name: 'Tee', caption: '', place_en: null, place_th: null, area: 'Ekkamai' };
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ldOf = (html) => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);

let calls;
function mockRpc(answer) {
  calls = [];
  globalThis.fetch = vi.fn(async (url, init) => {
    calls.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null, headers: init && init.headers });
    const a = typeof answer === 'function' ? answer(String(url), init) : answer;
    if (a instanceof Response) return a;
    return new Response(JSON.stringify(a), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; delete globalThis.caches; });

describe('reel page', () => {
  it('escapes the caption, keeps JSON-LD valid and safe, and has the VideoObject fields Google needs', () => {
    const html = W.reelPage(R1, [R1, R2], 'th');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    const ld = ldOf(html);
    const v = ld['@graph'].find((g) => g['@type'] === 'VideoObject');
    expect(v.name).toBeTruthy();
    expect(v.thumbnailUrl[0]).toBe('https://kringapp.com/reel/abc2345/poster.jpg');
    expect(v.uploadDate).toBe('2026-11-15T10:00:00.000Z');
    expect(v.duration).toBe('PT12S');
    expect(v.contentUrl).toBe('https://kringapp.com/reel/abc2345/video.mp4');
    const bc = ld['@graph'].find((g) => g['@type'] === 'BreadcrumbList');
    expect(bc.itemListElement.map((i) => i.position)).toEqual([1, 2, 3, 4]);
    expect(bc.itemListElement[2].item).toBe('https://kringapp.com/bangkok/ari/');
    // the raw JSON-LD text can't close the script tag
    expect(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]).not.toMatch(/<\//);
    expect(html).toContain('<link href="https://kringapp.com/reel/abc2345" rel="canonical"/>');
    expect(html).toContain('hreflang="en"');
    expect(html).toContain('href="/r/abc2345" rel="nofollow"');
    expect(html).not.toMatch(UUID);
    // the "more" list never repeats the Reel itself
    expect(html.match(/href="\/reel\/abc2345"/g)).toBeNull();
    expect(html).toContain('href="/reel/xyz9876"');
  });
  it('English page uses the English place name and /en/ links', () => {
    const html = W.reelPage(R1, [], 'en');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<h1>Ari Soi 1 Café</h1>');
    expect(html).toContain('Watch in Kring');
    expect(html).toContain('<link href="https://kringapp.com/en/reel/abc2345" rel="canonical"/>');
  });
  it('falls back to the area name when the Reel has no place', () => {
    expect(W.reelPage(R2, [], 'th')).toContain('<h1>เอกมัย</h1>');
    expect(W.reelPage(R2, [], 'en')).toContain('<h1>Ekkamai</h1>');
  });
  it('iso durations', () => {
    expect(W.isoDuration(0)).toBe('PT1S');
    expect(W.isoDuration(60000)).toBe('PT1M');
    expect(W.isoDuration(75400)).toBe('PT1M15S');
  });
});

describe('data', () => {
  it('asks kr8_web_reels with the anon key, area list and limit; drops rows without a valid short', async () => {
    mockRpc([R1, { ...R1, short: 'BAD!' }]);
    const out = await W.getReels({}, { areas: ['Yaowarat', 'Chinatown'], limit: 5 });
    expect(out).toHaveLength(1);
    expect(calls[0].url).toBe('https://pedxoxpammnyfnizljyj.supabase.co/rest/v1/rpc/kr8_web_reels');
    expect(calls[0].body).toEqual({ p_areas: ['Chinatown', 'Yaowarat'], p_short: null, p_limit: 5 });
    expect(calls[0].headers.apikey).toBe(W.ANON_LIVE);
  });
  it('test database can be swapped in by env; errors give an empty list', async () => {
    mockRpc(new Response('x', { status: 500 }));
    expect(await W.getReels({ WEB_SUPA_URL: 'https://test.example', WEB_SUPA_ANON: 'k' }, {})).toEqual([]);
    expect(calls[0].url).toBe('https://test.example/rest/v1/rpc/kr8_web_reels');
  });
  it('rejects a bad short without calling the database', async () => {
    mockRpc([]);
    expect(await W.getReels({}, { short: '../etc' })).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

const page = (body) => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
const STATIC = '<html><head></head><body><main><section>x</section><div class="end">cta</div></main></body></html>';
const ctx = (path, extra = {}) => {
  const parts = path.replace(/^\/(en\/)?bangkok\/?/, '').split('/').filter(Boolean);
  return { request: new Request(`https://kringapp.com${path}`), params: { path: parts }, env: {}, next: async () => page(STATIC), waitUntil: () => {}, ...extra };
};

describe('area pages', () => {
  it('adds the latest Reels before the closing button of a hand-written page', async () => {
    mockRpc([R1]);
    const res = await W.areaHandler(ctx('/bangkok/ari/'), 'th');
    const html = await res.text();
    expect(html.indexOf('id="reels"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="reels"')).toBeLessThan(html.indexOf('<div class="end">'));
    expect(html).toContain('รีลล่าสุดจากย่านอารีย์');
    expect(res.headers.get('cache-control')).toContain('s-maxage=600');
    expect(calls[0].body.p_areas).toEqual(['Ari']);
  });
  it('leaves a hand-written page unchanged when there are no public Reels', async () => {
    mockRpc([]);
    const html = await (await W.areaHandler(ctx('/bangkok/siam/'), 'th')).text();
    expect(html).toBe(STATIC);
  });
  it('builds Ekkamai; noindex while it has no Reels', async () => {
    mockRpc([]);
    const res = await W.areaHandler(ctx('/en/bangkok/ekkamai/'), 'en');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    expect(await res.text()).toContain('<meta content="noindex" name="robots"/>');
    mockRpc([R2]);
    const res2 = await W.areaHandler(ctx('/bangkok/ekkamai/'), 'th');
    const html = await res2.text();
    expect(res2.headers.get('x-robots-tag')).toBeNull();
    expect(html).not.toContain('noindex');
    expect(html).toContain('/reel/xyz9876/poster.jpg');
    expect(ldOf(html)['@graph'][1]['@type']).toBe('ItemList');
  });
  it('index lists Reels from all of Bangkok and links built areas that have Reels', async () => {
    mockRpc([R1, R2]);
    const html = await (await W.areaHandler(ctx('/bangkok/'), 'th')).text();
    expect(html).toContain('รีลล่าสุดจากกรุงเทพฯ');
    expect(html).toContain('href="/bangkok/ekkamai/"');
    expect(html).not.toContain('href="/bangkok/silom/"');
  });
  it('unknown areas fall through to the static site', async () => {
    mockRpc([]);
    const next = vi.fn(async () => new Response('nf', { status: 404 }));
    const res = await W.areaHandler(ctx('/bangkok/nowhere/', { next }), 'th');
    expect(res.status).toBe(404);
    expect(calls).toHaveLength(0);
  });
  it('Thai and English intros avoid the banned words', () => {
    const banned = /\b(meet|guide|tour|host|creator|reviews|hidden gem|alcohol|gift|wallet|credit|lucky|draw|temples?)\b|ลุ้น/i;
    for (const a of Object.values(W.AREAS)) for (const t of [a.introTh, a.introEn]) if (t) expect(t).not.toMatch(banned);
  });
});

describe('reel route', () => {
  it('404 + noindex when the Reel is not public', async () => {
    mockRpc([]);
    const res = await W.reelHandler({ request: new Request('https://kringapp.com/reel/abc2345'), params: { short: 'abc2345' }, env: {} }, 'th');
    expect(res.status).toBe(404);
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
  });
  it('renders a public Reel', async () => {
    mockRpc([R1]);
    const res = await W.reelHandler({ request: new Request('https://kringapp.com/reel/abc2345'), params: { short: 'abc2345' }, env: {} }, 'th');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('คาเฟ่อารีย์ซอย 1');
    expect(calls[0].body).toEqual({ p_areas: null, p_short: 'abc2345', p_limit: 1 });
  });
});

describe('media', () => {
  beforeEach(() => {
    const store = new Map();
    globalThis.caches = { default: { match: async (r) => store.get(r.url) || undefined, put: async (r, res) => { store.set(r.url, res); } } };
  });
  const mctx = (file, env) => ({ request: new Request(`https://kringapp.com/reel/abc2345/${file}`), params: { short: 'abc2345', file }, env, waitUntil: () => {} });
  it('needs both server secrets', async () => {
    mockRpc({ poster: '11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.jpg' });
    expect((await W.mediaHandler(mctx('poster.jpg', {}))).status).toBe(404);
    expect((await W.mediaHandler(mctx('poster.jpg', { SHARE_OPEN_KEY: 'k' }))).status).toBe(404);
  });
  it('404 when the Reel is not public (database says null), and only poster.jpg / video.mp4 exist', async () => {
    mockRpc(null);
    expect((await W.mediaHandler(mctx('poster.jpg', { SHARE_OPEN_KEY: 'k', SUPABASE_SERVICE_ROLE_KEY: 's' }))).status).toBe(404);
    expect((await W.mediaHandler(mctx('index.html', { SHARE_OPEN_KEY: 'k', SUPABASE_SERVICE_ROLE_KEY: 's' }))).status).toBe(404);
  });
  it('streams the poster without ever showing the storage path', async () => {
    const path = '11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.jpg';
    mockRpc((url) => (url.includes('/rpc/') ? { poster: path, video: null } : new Response('JPEGBYTES', { status: 200, headers: { 'content-type': 'image/jpeg' } })));
    const res = await W.mediaHandler(mctx('poster.jpg', { SHARE_OPEN_KEY: 'k', SUPABASE_SERVICE_ROLE_KEY: 's' }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('JPEGBYTES');
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect([...res.headers.values()].join(' ')).not.toMatch(UUID);
    expect(calls[0].body).toEqual({ p_short: 'abc2345', p_key: 'k' });
    expect(calls[1].url).toBe(`https://pedxoxpammnyfnizljyj.supabase.co/storage/v1/object/authenticated/kr8-reels/${path}`);
  });
});

describe('sitemap', () => {
  it('lists TH + EN Reel pages with video data and built areas with Reels', async () => {
    mockRpc([R1, R2]);
    const xml = await W.sitemap({});
    expect(xml).toContain('<loc>https://kringapp.com/reel/abc2345</loc>');
    expect(xml).toContain('<loc>https://kringapp.com/en/reel/abc2345</loc>');
    expect(xml).toContain('<video:thumbnail_loc>https://kringapp.com/reel/abc2345/poster.jpg</video:thumbnail_loc>');
    expect(xml).toContain('<loc>https://kringapp.com/bangkok/ekkamai/</loc>');
    expect(xml).not.toContain('/bangkok/silom/');
    expect(xml).not.toContain('<script>');
  });
});
