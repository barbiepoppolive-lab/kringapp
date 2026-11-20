// kr8-og (20 Nov): renders the 1200x630 share-link picture card of a Reel (?r=<short>) or a member (?u=<user id>)
// and stores it in the public bucket kr8-og (r/<short>.png, u/<id>.png). kringapp.com/og/... serves the stored file and calls
// this only the first time. Same look as the in-app share pass (V5ShareCard). Only Reels / members that may be public get a card.
import { ImageResponse } from 'https://deno.land/x/og_edge@0.0.6/mod.ts';
import UPNG from 'npm:upng-js@2.1.0';
import jpeg from 'npm:jpeg-js@0.4.4';

const SUPA = Deno.env.get('SUPABASE_URL')!;
const SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE = 'https://kringapp.com';
const H = { apikey: SVC, Authorization: `Bearer ${SVC}` };
// deno-lint-ignore no-explicit-any
type Any = any;
const h = (type: string, style: Any, children?: Any): Any => ({ type, props: { style, children } });
const img = (src: string, style: Any): Any => ({ type: 'img', props: { src, style } });
const b64 = (buf: ArrayBuffer) => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(a.subarray(i, i + 0x8000))); return btoa(s); };


const ring = h('div', { display: 'flex', position: 'relative', width: 92, height: 56 }, [
  h('div', { position: 'absolute', left: 0, top: 0, width: 56, height: 56, borderRadius: 28, border: '9px solid #5B8CFF' }),
  h('div', { position: 'absolute', left: 34, top: 0, width: 56, height: 56, borderRadius: 28, border: '9px solid #FF4FD8' }),
]);

/** 20 Nov v2 (WhatsApp / LINE / IG / TikTok DMs): picture full-bleed with a soft gradient, everything important CENTRED so a
 *  square crop still shows the Kring pill, the name and the picture. W x H = 1200x630 or 600x600 (?sq=1). */
function layout({ pic, kind, name, line, logo, W, H, th }: Any): Any {
  const sq = W === H;
  const k = sq ? 0.82 : 1;
  const bgPic = pic ? img(pic, { position: 'absolute', left: 0, top: 0, width: W, height: H, objectFit: 'cover' }) : null;
  const face = kind === 'person' && pic
    ? h('div', { display: 'flex', width: 210 * k, height: 210 * k, borderRadius: 105 * k, overflow: 'hidden', border: `${6 * k}px solid #E9C46A`, marginBottom: 16 * k, boxShadow: '0 12px 40px rgba(0,0,0,.5)' },
      [img(pic, { width: 210 * k, height: 210 * k, objectFit: 'cover' })])
    : null;
  return h('div', { display: 'flex', position: 'relative', width: W, height: H, fontFamily: 'Kanit', color: '#fff', background: '#15111f', overflow: 'hidden' }, [
    ...(kind === 'reel' && bgPic ? [bgPic] : []),
    ...(kind === 'person' ? [h('div', { position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex',
      backgroundImage: 'radial-gradient(circle at 25% 20%, #4a2f86 0%, rgba(74,47,134,0) 55%), radial-gradient(circle at 85% 85%, #6a1f5f 0%, rgba(106,31,95,0) 55%), linear-gradient(135deg, #1B1730 0%, #0E0C18 100%)' })] : []),
    h('div', { position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex',
      backgroundImage: kind === 'reel' ? 'linear-gradient(180deg, rgba(10,8,20,.55) 0%, rgba(10,8,20,.05) 32%, rgba(10,8,20,.15) 55%, rgba(10,8,20,.88) 100%)' : 'linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0))' }),
    h('div', { position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: kind === 'reel' ? 'space-between' : 'center', padding: `${34 * k}px ${40 * k}px ${40 * k}px` }, [
      h('div', { display: 'flex', alignItems: 'center', gap: 12 * k, padding: `${7 * k}px ${20 * k}px ${7 * k}px ${7 * k}px`, borderRadius: 999, background: 'rgba(20,16,30,.55)', marginBottom: kind === 'reel' ? 0 : 22 * k },
        [logo ? img(logo, { width: 46 * k, height: 46 * k, borderRadius: 12 * k }) : ring, h('div', { fontSize: 28 * k, fontWeight: 700 }, 'Kring · กริ๊ง!')]),
      h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center' }, [
        ...(face ? [face] : []),
        h('div', { display: 'flex', fontSize: (sq ? 60 : 72) * (kind === 'person' ? 0.95 : 1), fontWeight: 700, lineHeight: 1.08, textAlign: 'center', textShadow: '0 2px 18px rgba(0,0,0,.6)' }, name),
        h('div', { display: 'flex', marginTop: 8 * k, fontSize: 30 * k, fontWeight: 500, color: 'rgba(255,255,255,.88)', textAlign: 'center', textShadow: '0 1px 10px rgba(0,0,0,.7)' }, line),
        h('div', { display: 'flex', alignItems: 'center', marginTop: 18 * k, padding: `${8 * k}px ${24 * k}px`, borderRadius: 999, fontSize: 26 * k, fontWeight: 700, backgroundImage: 'linear-gradient(90deg, #5B8CFF, #FF4FD8)', boxShadow: '0 8px 24px rgba(255,79,216,.45)' },
          kind === 'reel' ? ([img(PLAY, { width: 20 * k, height: 20 * k, marginRight: 10 * k }),
            h('div', { display: 'flex' }, th ? 'ดูบนกริ๊ง!' : 'Watch on Kring')]) : (th ? 'ทักทายบนกริ๊ง!' : 'Say hi on Kring')),
      ]),
    ]),
  ]);
}

const rpc = async (fn: string, args: Any) => {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  return r.ok ? r.json() : null;
};
const bin = async (u: string, h?: Record<string, string>) => { const r = await fetch(u, { headers: h }); return r.ok ? await r.arrayBuffer() : null; };
const PLAY = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M5 3.2v13.6c0 .8.9 1.3 1.6.9l11-6.8c.6-.4.6-1.3 0-1.7l-11-6.8C5.9 1.9 5 2.4 5 3.2z" fill="#fff"/></svg>');
let fonts: [ArrayBuffer, ArrayBuffer] | null = null;
/** WebP poster → JPEG through Supabase's image renderer (format=origin is not enough, so ask for jpeg via Accept) */
async function webpToJpeg(path: string): Promise<string | null> {
  const r = await fetch(`${SUPA}/storage/v1/render/image/authenticated/kr8-reels/${path}?width=720&quality=80`, { headers: { ...H, Accept: 'image/jpeg' } });
  if (!r.ok) return null;
  const b = await r.arrayBuffer(); const m = new Uint8Array(b.slice(0, 4));
  return m[0] === 0xff && m[1] === 0xd8 ? `data:image/jpeg;base64,${b64(b)}` : null;
}
let logo: string | null = null;

Deno.serve(async (req) => {
  try { return await handle(req); } catch (e) { console.error('kr8-og', e); return new Response(`err ${String((e as Error)?.message || e).slice(0, 300)}`, { status: 500 }); }
});
async function handle(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  if (/^[a-z0-9]{6,10}$/.test((q.get('q') || '').toLowerCase())) return await askCard((q.get('q') || '').toLowerCase(), q.get('sq') === '1');   // 0185
  const r = (q.get('r') || '').toLowerCase(), u = (q.get('u') || '').toLowerCase();
  const sq = q.get('sq') === '1';
  const CW = sq ? 600 : 1200, CH = sq ? 600 : 630;
  const kind = /^[a-z0-9]{6,10}$/.test(r) ? 'reel' : /^[0-9a-f-]{36}$/.test(u) ? 'person' : '';
  if (!kind) return new Response('bad request', { status: 400 });
  const id = kind === 'reel' ? r : u;
  const d = kind === 'reel' ? await rpc('kr8_share_card', { p_short: id, p_key: null }) : await rpc('kr8_profile_card', { p_user: id, p_key: null });
  if (!d || !d.name) return new Response('no card', { status: 404 });
  if (!fonts) {
    const [a, b] = await Promise.all([bin(`${SITE}/assets/og/kanit-700.ttf`), bin(`${SITE}/assets/og/kanit-500.ttf`)]);
    if (!a || !b) return new Response('fonts', { status: 503 });
    fonts = [a, b];
  }
  if (logo === null) { const l = await bin(`${SITE}/icon-192.png`); logo = l ? `data:image/png;base64,${b64(l)}` : ''; }
  let pic: string | null = null;
  if (kind === 'reel' && /^[0-9a-f-]{36}\/[A-Za-z0-9._-]+\.(jpe?g|png|webp)$/i.test(d.poster || '')) {
    const p = await bin(`${SUPA}/storage/v1/object/authenticated/kr8-reels/${d.poster}`, H);
    if (p) {
      const m = new Uint8Array(p.slice(0, 12));
      const type = m[0] === 0x89 ? 'image/png' : m[0] === 0x52 && m[8] === 0x57 ? 'image/webp' : 'image/jpeg';
      // satori can't read WebP: hand it a PNG-free path by skipping the picture (the card still renders) unless it's JPEG/PNG
      if (type !== 'image/webp') pic = `data:${type};base64,${b64(p)}`;
      else pic = await webpToJpeg(d.poster);
    }
  } else if (kind === 'person' && /^data:image\/(jpeg|png|webp);base64,/.test(d.photo || '')) pic = d.photo;
  const place = kind === 'reel' ? (d.place_th || d.place_en || '') : '';
  const area = d.area || 'Bangkok';
  const line = kind === 'reel' ? `${place ? `${place} · ` : ''}${area}` : (area === 'Bangkok' ? 'Bangkok' : `${area} · Bangkok`);
  const res = new ImageResponse(layout({ pic, kind, name: d.name, line, logo: logo || null, W: CW, H: CH, th: false }), {
    width: CW, height: CH,
    fonts: [{ name: 'Kanit', data: fonts[0], weight: 700, style: 'normal' }, { name: 'Kanit', data: fonts[1], weight: 500, style: 'normal' }],
  });
  const png = await res.arrayBuffer();
  // JPEG (~100 KB) instead of PNG (~700 KB): WhatsApp skips big preview images
  const im = UPNG.decode(png);
  const rgba = new Uint8Array(UPNG.toRGBA8(im)[0]);
  const jpg = jpeg.encode({ data: rgba, width: im.width, height: im.height }, 82).data;
  const path = `${kind === 'reel' ? 'r' : 'u'}/${id}${sq ? '-sq' : ''}.jpg`;
  await fetch(`${SUPA}/storage/v1/object/kr8-og/${path}`, { method: 'POST', headers: { ...H, 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'cache-control': '86400' }, body: jpg });
  return new Response(jpg, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' } });
}

// ───────── 0185: Ask BKK answer card (/q/<short>): the question, the answer, the answerer, on a Bangkok-night sky ─────────
const cut = (t: string, n: number) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s; };
let sky: string | null = null;
async function askCard(short: string, sq: boolean): Promise<Response> {
  const d = await rpc('kr8_ask_card', { p_short: short, p_key: null });
  if (!d || !d.q) return new Response('no card', { status: 404 });
  if (!fonts) {
    const [a, b] = await Promise.all([bin(`${SITE}/assets/og/kanit-700.ttf`), bin(`${SITE}/assets/og/kanit-500.ttf`)]);
    if (!a || !b) return new Response('fonts', { status: 503 });
    fonts = [a, b];
  }
  if (logo === null) { const l = await bin(`${SITE}/icon-192.png`); logo = l ? `data:image/png;base64,${b64(l)}` : ''; }
  if (sky === null) { const s = await bin(`${SITE}/app/media/places/rv4-me-sky.jpg`); sky = s ? `data:image/jpeg;base64,${b64(s)}` : ''; }
  const W = sq ? 600 : 1200, H2 = sq ? 600 : 630, k = sq ? 0.56 : 1;
  const face = /^data:image\/(jpeg|png|webp);base64,/.test(d.photo || '') ? d.photo : null;
  const th = /[฀-๿]/.test(d.q || '');
  const node = h('div', { display: 'flex', position: 'relative', width: W, height: H2, fontFamily: 'Kanit', color: '#fff', background: '#0B0A16', overflow: 'hidden' }, [
    ...(sky ? [img(sky, { position: 'absolute', left: 0, top: 0, width: W, height: H2, objectFit: 'cover' })] : []),
    h('div', { position: 'absolute', left: 0, top: 0, width: W, height: H2, display: 'flex',
      backgroundImage: 'linear-gradient(180deg, rgba(9,7,22,.62) 0%, rgba(9,7,22,.8) 50%, rgba(8,6,18,.96) 100%)' }),
    h('div', { position: 'absolute', left: 0, top: 0, width: W, height: H2, display: 'flex',
      backgroundImage: 'radial-gradient(circle at 92% 8%, rgba(255,79,216,.35) 0%, rgba(255,79,216,0) 45%), radial-gradient(circle at 0% 100%, rgba(91,140,255,.32) 0%, rgba(91,140,255,0) 50%)' }),
    h('div', { position: 'absolute', left: 0, top: 0, width: W, height: H2, display: 'flex', flexDirection: 'column', padding: `${40 * k}px ${56 * k}px` }, [
      h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, [
        h('div', { display: 'flex', alignItems: 'center', gap: 12 * k, padding: `${6 * k}px ${20 * k}px ${6 * k}px ${6 * k}px`, borderRadius: 999, background: 'rgba(255,255,255,.12)', border: '1.5px solid rgba(255,255,255,.18)' },
          [logo ? img(logo, { width: 40 * k, height: 40 * k, borderRadius: 10 * k }) : ring, h('div', { fontSize: 24 * k, fontWeight: 700 }, 'Kring · กริ๊ง!')]),
        h('div', { display: 'flex', padding: `${6 * k}px ${18 * k}px`, borderRadius: 999, fontSize: 22 * k, fontWeight: 700, backgroundImage: 'linear-gradient(90deg, #5B8CFF, #FF4FD8)' }, th ? 'ถาม BKK' : 'Ask BKK'),
      ]),
      h('div', { display: 'flex', marginTop: 26 * k, fontSize: sq ? 30 : 46, fontWeight: 700, lineHeight: 1.15, textShadow: '0 2px 16px rgba(0,0,0,.5)' }, cut(d.q, sq ? 80 : 110)),
      h('div', { display: 'flex', flexDirection: 'column', marginTop: 'auto', padding: `${20 * k}px ${24 * k}px`, borderRadius: 26 * k, background: 'rgba(255,255,255,.1)', border: '1.5px solid rgba(255,255,255,.18)' }, [
        h('div', { display: 'flex', alignItems: 'center', gap: 14 * k }, [
          face ? h('div', { display: 'flex', width: 58 * k, height: 58 * k, borderRadius: 29 * k, overflow: 'hidden', border: `${3 * k}px solid #FF4FD8` }, [img(face, { width: 58 * k, height: 58 * k, objectFit: 'cover' })])
            : h('div', { display: 'flex', width: 58 * k, height: 58 * k, borderRadius: 29 * k, background: '#3A3355', alignItems: 'center', justifyContent: 'center', fontSize: 26 * k, fontWeight: 700 }, (d.name || '?').charAt(0)),
          h('div', { display: 'flex', fontSize: 26 * k, fontWeight: 700 }, d.name || ''),
          ...(d.local ? [h('div', { display: 'flex', padding: `${3 * k}px ${12 * k}px`, borderRadius: 999, fontSize: 18 * k, fontWeight: 700, color: '#F3D98B', border: '1.5px solid rgba(233,196,106,.55)', background: 'rgba(233,196,106,.16)' }, th ? 'คนกรุงเทพฯ' : 'BKK Local')] : []),
        ]),
        h('div', { display: 'flex', marginTop: 12 * k, fontSize: 25 * k, fontWeight: 500, lineHeight: 1.35, color: 'rgba(255,255,255,.94)' }, `“${cut(d.a, sq ? 90 : 150)}”`),
      ]),
    ]),
  ]);
  const res = new ImageResponse(node, { width: W, height: H2,
    fonts: [{ name: 'Kanit', data: fonts[0], weight: 700, style: 'normal' }, { name: 'Kanit', data: fonts[1], weight: 500, style: 'normal' }] });
  const png = await res.arrayBuffer();
  const im = UPNG.decode(png);
  const jpg = jpeg.encode({ data: new Uint8Array(UPNG.toRGBA8(im)[0]), width: im.width, height: im.height }, 84).data;
  await fetch(`${SUPA}/storage/v1/object/kr8-og/q/${short}${sq ? '-sq' : ''}.jpg`, { method: 'POST', headers: { ...H, 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'cache-control': '86400' }, body: jpg });
  return new Response(jpg, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' } });
}
