/**
 * board-1 (18 Nov, founder brief v2): story share cards that give a member's FRIEND a personal reason to tap into Kring.
 * Three moments × three looks, 1080×1920 PNG, drawn on a canvas (no new dependencies):
 *   help      "Help my clip climb 🙏"            right after a member posts a Reel (their Reel frame + a play button, chip "#7 this week · 4 days left")
 *   challenge "#3 in Bangkok this week. Can you beat me?"   on entering the top 8 / moving up
 *   proof     "I won on Kring this week 🏆"       after a weekly win, with the amount
 *   A cinematic (full-bleed + soft gradient + big type) · B polaroid (the Reel framed on a blurred copy) · C bold sticker (playful badges)
 * Anatomy, never more than five things: the hero photo, one headline, one small chip, a small Kring wordmark, and a clean bottom zone
 * (prize pool line from the live config + kringapp.com + the member's short code, which also works on TikTok where links are not allowed).
 * Never: Ring counts, tables, other members' faces or names. One language per card (Thai mode = Thai only; every other mode = English).
 * Instagram/TikTok story controls cover the top ~250 px and bottom ~300 px: nothing important is drawn there.
 */

export const STORY_W = 1080;
export const STORY_H = 1920;
export const SAFE_TOP = 250;
export const SAFE_BOTTOM = 300;

export type Moment = 'help' | 'challenge' | 'proof';
export type Look = 'A' | 'B' | 'B2' | 'C';
export const MOMENTS: Moment[] = ['help', 'challenge', 'proof'];
export const LOOKS: Look[] = ['B', 'B2'];   // founder picked B (18 Nov): B1 tilted + tape, B2 straight + pin

export interface ShareCard {
  lang: string;
  moment: Moment;
  look: Look;
  /** this week's rank (help / challenge) or the rank that won (proof) */
  rank: number;
  /** whole days left in the week (help / challenge) */
  daysLeft: number;
  /** ฿ won (proof) */
  won: number;
  /** prize pool from the live config (kr8_rings_rules / kr8_weekly_ranking prizes): paid seats and their total */
  paidN: number;
  pool: number;
  /** the member's short invite code, e.g. k00037 ('' = none) */
  code: string;
  /** the member's Reel frame (poster); null = their photo, else a Bangkok-dusk gradient */
  hero: string | null;
  /** where the faces are, 0 = top … 1 = bottom of the photo (crop so the eyes sit near the upper third); default 0.6 */
  focus?: number;
}

const fmt = (n: number) => Math.max(0, Math.round(n)).toLocaleString('en-US');
export const isThai = (lang: string) => lang === 'th';
/** The code people read on a card: the name-style code (NAT44, proposal 0114) when the server has one, else K00037. Links always carry the
 *  k-code (refCode), which every invite-credit rule understands today. */
export const displayCode = (vanity: string | null | undefined, kcode: string): string => (vanity && /^[A-Z]{2,6}[0-9]{1,4}$/.test(vanity) ? vanity : (kcode || '').toUpperCase());

/** Every word on a card, in one language. "\n" = a deliberate line break for the big type. */
export function cardText(c: Pick<ShareCard, 'lang' | 'moment' | 'rank' | 'daysLeft' | 'won' | 'paidN' | 'pool' | 'code'>) {
  const th = isThai(c.lang);
  const d = Math.max(0, Math.floor(c.daysLeft));
  const left = th ? (d <= 0 ? 'วันสุดท้าย' : `เหลือ ${d} วัน`) : d <= 0 ? 'last day' : d === 1 ? '1 day left' : `${d} days left`;
  const headline = c.moment === 'help'
    ? (th ? 'ช่วยดันคลิปฉัน\nขึ้นอันดับหน่อย 🙏' : 'Help my clip\nclimb 🙏')
    : c.moment === 'challenge'
      ? (th ? `อันดับ ${c.rank} ของกรุงเทพฯ\nสัปดาห์นี้\nใครจะแซงฉันได้?` : `#${c.rank} in Bangkok\nthis week.\nCan you beat me?`)
      : (th ? 'ฉันได้รางวัล\nจากกริ๊งสัปดาห์นี้ 🏆' : 'I won on Kring\nthis week 🏆');
  const chip = c.moment === 'help'
    ? (th ? `อันดับ ${c.rank} สัปดาห์นี้ · ${left}` : `#${c.rank} this week · ${left}`)
    : c.moment === 'challenge'
      ? (th ? (d <= 0 ? 'วันสุดท้ายแล้ว ไล่ตามให้ทัน' : `เหลือ ${d} วันให้ไล่ตาม`) : d <= 0 ? 'Last day to catch me' : d === 1 ? '1 day to catch me' : `${d} days to catch me`)
      : (th ? `อันดับ ${c.rank} สัปดาห์นี้` : `#${c.rank} this week`);
  // the polaroid strip has room for two lines: the challenge headline in two
  const strip = c.moment === 'challenge' ? (th ? `อันดับ ${c.rank} ของกรุงเทพฯ\nสัปดาห์นี้ ใครจะแซงฉันได้?` : `#${c.rank} in Bangkok this week.\nCan you beat me?`) : headline;
  return {
    headline,
    strip,
    chip,
    amount: c.moment === 'proof' && c.won > 0 ? `฿${fmt(c.won)}` : '',
    brand: th ? 'กริ๊ง!' : 'Kring',
    pool: c.pool > 0 ? (th ? `${c.paidN} อันดับแรกแบ่ง ฿${fmt(c.pool)} ทุกสัปดาห์` : `Top ${c.paidN} share ฿${fmt(c.pool)} weekly`) : '',
    site: 'kringapp.com',
    code: c.code ? (th ? `โค้ด ${c.code.toUpperCase()}` : `Search Kring · ${c.code.toUpperCase()}`) : (th ? '' : 'Search Kring'),
  };
}

/** The caption that goes with the picture in the share sheet (plus the link). */
export function cardCaption(lang: string, moment: Moment): string {
  const th = isThai(lang);
  if (moment === 'help') return th ? 'มาช่วยกดหัวใจคลิปเราหน่อย 💜' : 'Come heart my clip 💜';
  if (moment === 'challenge') return th ? 'ใครแซงฉันได้ ลองดู 😏' : 'Think you can beat me? 😏';
  return th ? 'ได้รางวัลจริง! มาเล่นด้วยกันนะ 🏆' : 'I actually won! Come play 🏆';
}
export const linkCopiedToast = (lang: string) => (isThai(lang) ? 'คัดลอกลิงก์แล้ว · ใน IG สตอรี่ ใส่สติกเกอร์ลิงก์แล้ววาง' : 'Link copied · on IG Stories add a Link sticker and paste');
export const storyButton = (lang: string) => (isThai(lang) ? 'แชร์อันดับ' : 'Share my rank');
export const storyButtonLabel = (lang: string) => (isThai(lang) ? 'แชร์อันดับของฉันเป็นสตอรี่' : 'Share my rank as a story');
export const storyFileName = (moment: Moment, rank: number) => `kring-${moment}-${rank}.png`;
/** board: in the paid seats (top N) → challenge; otherwise → help */
export const boardMoment = (rank: number | null | undefined, paidN: number): Moment => (rank && rank <= paidN ? 'challenge' : 'help');

/**
 * The friend's link. The /r/<short> link is preferred (the open is logged and earns the member Rings); it lands on /app/?reel=<id>, which
 * plays the Reel with no sign-in, and liking/saving asks for the one-tap sign-in. Both carry ?ref=<code> (invite credit) and utm_content.
 * NOTE: the website function behind /r/ does not forward ?ref / utm_* to the app yet (see report); until it does, the direct app link keeps them.
 */
export function cardLink(o: { origin: string; base?: string; short?: string | null; reel?: string | null; code: string; moment: Moment }): string {
  const q = new URLSearchParams();
  if (!o.short && o.reel) q.set('reel', o.reel);
  if (o.code) q.set('ref', o.code);
  q.set('utm_source', 'story'); q.set('utm_medium', 'share'); q.set('utm_content', `share-${o.moment}`);
  const path = o.short ? `/r/${o.short}` : (o.base || '/app/').replace(/\/?$/, '/');
  return `${o.origin}${path}?${q.toString()}`;
}

/* ───────────── drawing ───────────── */
const EN = "'Bricolage Grotesque', 'Plus Jakarta Sans', 'Kring Thai Looped', 'Anuphan', 'Noto Color Emoji', system-ui, sans-serif";
const TH = "'Kring Thai Looped', 'Anuphan', 'Bricolage Grotesque', 'Noto Color Emoji', system-ui, sans-serif";
type G = CanvasRenderingContext2D;
type Img = HTMLImageElement;

function loadImg(src: string): Promise<Img | null> {
  return new Promise((ok) => {
    const i = new Image();
    if (!/^(data|blob):/.test(src)) i.crossOrigin = 'anonymous';
    i.onload = () => ok(i); i.onerror = () => ok(null);
    window.setTimeout(() => ok(null), 8000);
    i.src = src;
  });
}
async function fontsReady(text: string, th: boolean) {
  try {
    const f = document.fonts;
    if (!f?.load) return;
    await Promise.race([Promise.all([f.load(`800 120px ${EN}`, text), f.load(`500 40px ${EN}`, text), th ? f.load(`700 90px ${TH}`, text) : null, th ? f.load(`500 40px ${TH}`, text) : null]),
      new Promise((ok) => window.setTimeout(ok, 2500))]);
  } catch { /* draw with what is there */ }
}
function cover(g: G, img: Img, x: number, y: number, w: number, h: number, fy = 0.4) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) * fy, dw, dh);
}
function rr(g: G, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, h / 2, w / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function ringsMark(g: G, cx: number, cy: number, r: number, lw: number) {
  g.save(); g.lineWidth = lw;
  g.strokeStyle = '#6E9BFF'; g.beginPath(); g.arc(cx - r * 0.62, cy, r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#FF5FCB'; g.beginPath(); g.arc(cx + r * 0.62, cy, r, 0, Math.PI * 2); g.stroke();
  g.restore();
}
const shadow = (g: G, blur: number, a = 0.4, y?: number) => { g.shadowColor = `rgba(10,6,30,${a})`; g.shadowBlur = blur; g.shadowOffsetY = y ?? Math.round(blur / 5); };
const noShadow = (g: G) => { g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0; };

/** Thai has no spaces: break at word boundaries (Intl.Segmenter) when a line is too wide; shrink the type until every line fits. */
function fitLines(g: G, text: string, font: (px: number) => string, start: number, maxW: number, min = 48, shrink = 0.72): { lines: string[]; px: number } {
  const seg = (s: string): string[] => {
    try {
      const S = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: 'word' }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
      if (S) return [...new S('th', { granularity: 'word' }).segment(s)].map((x) => x.segment);
    } catch { /* fall through */ }
    return s.split(/(\s+)/);
  };
  // first keep the author's line breaks and only shrink (down to 72% of the size); wrap only if that is not enough
  for (let px = start; px >= Math.max(min, Math.round(start * shrink)); px -= 2) {
    g.font = font(px);
    const ls = text.split('\n');
    if (ls.every((l) => g.measureText(l).width <= maxW)) return { lines: ls, px };
  }
  for (let px = start; px >= min; px -= 4) {
    g.font = font(px);
    const lines: string[] = [];
    for (const para of text.split('\n')) {
      if (g.measureText(para).width <= maxW) { lines.push(para); continue; }
      let cur = '';
      for (const w of seg(para)) {
        const t = cur + w;
        if (cur && g.measureText(t.trim()).width > maxW) { lines.push(cur.trim()); cur = w.trimStart(); } else cur = t;
      }
      if (cur.trim()) lines.push(cur.trim());
    }
    if (lines.every((l) => g.measureText(l).width <= maxW) && (px <= min || lines.length <= text.split('\n').length + 1)) return { lines, px };
  }
  g.font = font(min);
  return { lines: text.split('\n'), px: min };
}

/** small Kring wordmark: the two rings + the name */
function wordmark(g: G, x: number, y: number, text: string, th: boolean, color = '#FFFFFF', align: 'left' | 'center' = 'left', size = 44) {
  g.font = `800 ${size}px ${th ? TH : EN}`;
  const w = g.measureText(text).width, mark = size * 1.45, gap = size * 0.36;
  const x0 = align === 'center' ? x - (mark + gap + w) / 2 : x;
  ringsMark(g, x0 + mark / 2, y - size * 0.34, size * 0.42, size * 0.15);
  g.fillStyle = color; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(text, x0 + mark + gap, y);
}
function chipPill(g: G, x: number, y: number, text: string, th: boolean, o: { fill: string; stroke?: string; color: string; size?: number; align?: 'left' | 'center' }) {
  const size = o.size ?? 38;
  g.font = `${th ? 700 : 800} ${size}px ${th ? TH : EN}`;
  const w = g.measureText(text).width + size * 1.5, h = size * 2.05;
  const x0 = o.align === 'center' ? x - w / 2 : x;
  rr(g, x0, y, w, h, h / 2); g.fillStyle = o.fill; g.fill();
  if (o.stroke) { g.lineWidth = 2.5; g.strokeStyle = o.stroke; g.stroke(); }
  g.fillStyle = o.color; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, x0 + size * 0.75, y + h / 2 + (th ? size * 0.08 : size * 0.04));
  g.textBaseline = 'alphabetic';
  return { w, h };
}
function playButton(g: G, cx: number, cy: number, r: number) {
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.22)'; g.fill();
  g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.75)'; g.stroke();
  g.beginPath(); g.moveTo(cx - r * 0.28, cy - r * 0.42); g.lineTo(cx + r * 0.48, cy); g.lineTo(cx - r * 0.28, cy + r * 0.42); g.closePath();
  g.fillStyle = '#FFFFFF'; shadow(g, 10, 0.3); g.fill(); noShadow(g);
  g.restore();
}
/** the bottom zone, same on every card: prize pool line · kringapp.com · code (inside the story-safe area) */
function bottomZone(g: G, t: ReturnType<typeof cardText>, th: boolean, o: { ink: string; soft: string; accent: string; align: 'left' | 'center'; x: number }) {
  const base = STORY_H - SAFE_BOTTOM;
  g.textAlign = o.align;
  if (t.pool) { g.fillStyle = o.accent; g.font = `${th ? 700 : 800} 48px ${th ? TH : EN}`; g.fillText(t.pool, o.x, base - 150); }
  g.fillStyle = o.ink; g.font = `800 52px ${EN}`; g.fillText(t.site, o.x, base - 80);
  if (t.code) {   // the code big and clear: the label soft, the code itself bold with a little air between the letters
    const m = /^(.*?)([A-Z]{1,6}\d{1,7})$/.exec(t.code);
    const lab = m ? m[1] : t.code, code = m ? m[2] : '';
    g.font = `${th ? 600 : 700} 44px ${th ? TH : EN}`;
    const lw = g.measureText(lab).width;
    g.font = `800 48px ${EN}`;
    const ls = 'letterSpacing' in g;
    if (ls) (g as G & { letterSpacing: string }).letterSpacing = '3px';
    const cw = code ? g.measureText(code).width : 0;
    const x0 = o.align === 'center' ? o.x - (lw + cw) / 2 : o.x;
    g.textAlign = 'left';
    g.fillStyle = '#FFFFFF'; g.fillText(code, x0 + lw, base - 8);
    if (ls) (g as G & { letterSpacing: string }).letterSpacing = '0px';
    g.fillStyle = o.soft; g.font = `${th ? 600 : 700} 44px ${th ? TH : EN}`; g.fillText(lab, x0, base - 8);
  }
  g.textAlign = 'left';
}

function bgFallback(g: G) {
  const d = g.createLinearGradient(0, 0, STORY_W * 0.4, STORY_H);
  d.addColorStop(0, '#3B2C8F'); d.addColorStop(0.45, '#8E4FC9'); d.addColorStop(0.8, '#F07AB8'); d.addColorStop(1, '#FFB58A');
  g.fillStyle = d; g.fillRect(0, 0, STORY_W, STORY_H);
}

/* A · cinematic: the Reel full-bleed, soft gradient low, big type */
function lookA(g: G, img: Img | null, c: ShareCard, t: ReturnType<typeof cardText>, th: boolean) {
  const W = STORY_W, H = STORY_H;
  if (img) cover(g, img, 0, 0, W, H, 0.45); else bgFallback(g);
  const top = g.createLinearGradient(0, 0, 0, 520); top.addColorStop(0, 'rgba(14,8,36,.45)'); top.addColorStop(1, 'rgba(14,8,36,0)');
  g.fillStyle = top; g.fillRect(0, 0, W, 520);
  const low = g.createLinearGradient(0, 760, 0, H); low.addColorStop(0, 'rgba(14,8,36,0)'); low.addColorStop(0.45, 'rgba(14,8,36,.5)'); low.addColorStop(1, 'rgba(14,8,36,.82)');
  g.fillStyle = low; g.fillRect(0, 760, W, H - 760);
  const X = 84;
  shadow(g, 14, 0.35); wordmark(g, X, SAFE_TOP + 46, t.brand, th); noShadow(g);
  if (c.moment === 'help') playButton(g, W / 2, 760, 92);
  // headline block grows upward from the bottom zone
  const font = (px: number) => `${th ? 700 : 800} ${px}px ${th ? TH : EN}`;
  const { lines, px } = fitLines(g, t.headline, font, th ? 100 : 112, W - X * 2);
  const lh = px * (th ? 1.32 : 1.08);
  let y = STORY_H - SAFE_BOTTOM - 236 - (t.amount ? 150 : 0);
  const y0 = y - (lines.length - 1) * lh;
  // chip above the headline
  chipPill(g, X, y0 - px - 112, t.chip, th, { fill: 'rgba(255,255,255,.16)', stroke: 'rgba(255,255,255,.6)', color: '#FFFFFF', size: 36 });
  g.font = font(px); g.fillStyle = '#FFFFFF'; g.textAlign = 'left';
  shadow(g, 24, 0.45);
  lines.forEach((l, i) => g.fillText(l, X, y0 + i * lh));
  noShadow(g);
  if (t.amount) {
    y += 150;
    const gold = g.createLinearGradient(0, y - 120, 0, y); gold.addColorStop(0, '#FFF6CF'); gold.addColorStop(1, '#F5C451');
    g.font = `800 150px ${EN}`; shadow(g, 30, 0.45); g.fillStyle = gold; g.fillText(t.amount, X - 6, y); noShadow(g);
  }
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(X, STORY_H - SAFE_BOTTOM - 216, W - X * 2, 2);
  bottomZone(g, t, th, { ink: '#FFFFFF', soft: 'rgba(255,255,255,.82)', accent: '#FFE491', align: 'left', x: X });
}

/* B · polaroid (founder's pick, 18 Nov). Eye path, top to bottom: the face in the photo → the headline on the paper strip →
   the gold ฿ pool → kringapp.com + code. B1 = tilted −3.5° with washi tape; B2 = straight, thick frame, a pin. */
function rnd(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let grainTile: HTMLCanvasElement | null = null;
function grain(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const c = document.createElement('canvas'); c.width = c.height = 160;
  const x = c.getContext('2d')!; const im = x.createImageData(160, 160); const r = rnd(7);
  for (let i = 0; i < im.data.length; i += 4) { const v = 110 + r() * 110; im.data[i] = v; im.data[i + 1] = v * 0.97; im.data[i + 2] = v * 0.9; im.data[i + 3] = 16; }
  x.putImageData(im, 0, 0); grainTile = c; return c;
}
/** the glowing backdrop: the same photo, heavily blurred + saturated, a Kring pink→violet wash, a vignette, a few soft bokeh lights */
function glowBg(g: G, img: Img | null, seed: number) {
  const W = STORY_W, H = STORY_H;
  if (img) { g.save(); g.filter = 'blur(54px) saturate(170%) brightness(1.16)'; cover(g, img, -140, -140, W + 280, H + 280, 0.5); g.restore(); } else bgFallback(g);
  const wash = g.createLinearGradient(0, 0, W, H);
  wash.addColorStop(0, 'rgba(255,95,203,.34)'); wash.addColorStop(0.55, 'rgba(150,90,255,.28)'); wash.addColorStop(1, 'rgba(255,120,170,.3)');
  g.save(); g.globalCompositeOperation = 'soft-light'; g.fillStyle = wash; g.fillRect(0, 0, W, H); g.restore();
  g.fillStyle = 'rgba(255,240,250,.06)'; g.fillRect(0, 0, W, H);
  const v = g.createRadialGradient(W / 2, H * 0.44, H * 0.22, W / 2, H * 0.5, H * 0.75);
  v.addColorStop(0, 'rgba(18,8,40,0)'); v.addColorStop(1, 'rgba(30,10,60,.4)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  const low = g.createLinearGradient(0, H - 560, 0, H); low.addColorStop(0, 'rgba(30,10,60,0)'); low.addColorStop(1, 'rgba(30,10,60,.4)');
  g.fillStyle = low; g.fillRect(0, H - 560, W, 560);
  const r = rnd(seed);
  for (let i = 0; i < 11; i++) {   // bokeh: few, soft, mostly at the edges
    const side = r() < 0.5 ? r() * 210 : W - r() * 210, y = 120 + r() * (H - 240), rad = 14 + r() * 46;
    const b = g.createRadialGradient(side, y, 0, side, y, rad);
    b.addColorStop(0, `rgba(255,236,250,${0.16 + r() * 0.2})`); b.addColorStop(1, 'rgba(255,236,250,0)');
    g.fillStyle = b; g.beginPath(); g.arc(side, y, rad, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 5; i++) {   // a few four-point sparkles
    const x = r() < 0.5 ? 50 + r() * 130 : W - 50 - r() * 130, y = 330 + r() * 1150, s = 9 + r() * 12;
    g.save(); g.translate(x, y); g.fillStyle = `rgba(255,255,255,${0.55 + r() * 0.35})`; g.shadowColor = 'rgba(255,200,240,.9)'; g.shadowBlur = 12;
    g.beginPath(); g.moveTo(0, -s); g.quadraticCurveTo(0, 0, s, 0); g.quadraticCurveTo(0, 0, 0, s); g.quadraticCurveTo(0, 0, -s, 0); g.quadraticCurveTo(0, 0, 0, -s); g.fill();
    g.restore();
  }
}
function washiTape(g: G, cx: number, cy: number, w: number, h: number, rot: number) {
  g.save(); g.translate(cx, cy); g.rotate(rot);
  g.beginPath();
  const z = 7, n = Math.round(h / z);
  g.moveTo(-w / 2, -h / 2); g.lineTo(w / 2, -h / 2);
  for (let i = 0; i < n; i++) g.lineTo(w / 2 + (i % 2 ? 0 : 6), -h / 2 + (i + 1) * (h / n));
  g.lineTo(-w / 2, h / 2);
  for (let i = 0; i < n; i++) g.lineTo(-w / 2 - (i % 2 ? 0 : 6), h / 2 - (i + 1) * (h / n));
  g.closePath();
  g.fillStyle = 'rgba(255,176,220,.82)'; shadow(g, 6, 0.12, 2); g.fill(); noShadow(g);
  g.clip();
  g.strokeStyle = 'rgba(255,255,255,.32)'; g.lineWidth = 9;
  for (let x = -w; x < w; x += 26) { g.beginPath(); g.moveTo(x, -h); g.lineTo(x + h * 1.2, h); g.stroke(); }
  g.restore();
}
function pushPin(g: G, cx: number, cy: number) {
  g.save();
  shadow(g, 10, 0.35, 6);
  const b = g.createRadialGradient(cx - 6, cy - 7, 2, cx, cy, 20); b.addColorStop(0, '#FFB3DE'); b.addColorStop(0.5, '#FF4FA8'); b.addColorStop(1, '#B4126A');
  g.fillStyle = b; g.beginPath(); g.arc(cx, cy, 19, 0, Math.PI * 2); g.fill();
  noShadow(g); g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(cx - 6, cy - 7, 5, 0, Math.PI * 2); g.fill();
  g.restore();
}
/** the hand-drawn arrow (card 1): a loose curve from the photo corner to the play button */
function handArrow(g: G, x0: number, y0: number, x1: number, y1: number) {
  g.save(); g.strokeStyle = '#FFFFFF'; g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round'; shadow(g, 10, 0.35, 3);
  const mx = (x0 + x1) / 2 + 70, my = Math.min(y0, y1) - 40;
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
  const a = Math.atan2(y1 - my, x1 - mx), L = 34;
  g.beginPath(); g.moveTo(x1 - L * Math.cos(a - 0.5), y1 - L * Math.sin(a - 0.5)); g.lineTo(x1, y1); g.lineTo(x1 - L * Math.cos(a + 0.55), y1 - L * Math.sin(a + 0.55)); g.stroke();
  g.restore();
}
/** a rubber stamp (card 2): ink rings + "#3", with worn speckles */
function stamp(g: G, cx: number, cy: number, text: string, rot: number) {
  const S = 250, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d')!; const ink = '#E8338F';
  x.strokeStyle = ink; x.fillStyle = ink;
  x.lineWidth = 9; x.beginPath(); x.arc(S / 2, S / 2, 108, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 3; x.beginPath(); x.arc(S / 2, S / 2, 92, 0, Math.PI * 2); x.stroke();
  x.font = `800 ${text.length > 2 ? 96 : 112}px ${EN}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, S / 2, S / 2 + 6);
  const r = rnd(text.length * 31 + 5);
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) { x.globalAlpha = 0.3 + r() * 0.7; x.beginPath(); x.arc(r() * S, r() * S, 0.6 + r() * 2.4, 0, Math.PI * 2); x.fill(); }
  g.save(); g.translate(cx, cy); g.rotate(rot); g.globalAlpha = 0.95;
  g.fillStyle = 'rgba(255,255,255,.88)'; g.beginPath(); g.arc(0, 0, 100, 0, Math.PI * 2); g.fill();   // the paper under the stamp, so it reads on the photo
  g.drawImage(c, -S / 2, -S / 2); g.restore();
}
function confetti(g: G, box: { x: number; y: number; w: number; h: number }, seed: number) {
  const r = rnd(seed), cols = ['#FFD54A', '#FF5FCB', '#7FA8FF', '#FFFFFF', '#B78CFF'];
  let n = 0;
  for (let i = 0; n < 54 && i < 600; i++) {
    const left = r() < 0.5, cx = left ? box.x + 10 : box.x + box.w - 10, cy = box.y + 60;
    const a = (left ? Math.PI * 0.55 : -Math.PI * 0.45) + (r() - 0.5) * Math.PI * 1.1, d = 40 + r() * 230;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 1.4;
    if (x > box.x + 30 && x < box.x + box.w - 30 && y > box.y - 10) continue;   // never over the photo
    if (y < SAFE_TOP + 40 && Math.abs(x - STORY_W / 2) < 220) continue;          // never over the wordmark
    if (x < 14 || x > STORY_W - 14) continue;
    n++;
    g.save(); g.translate(x, y); g.rotate(r() * Math.PI); g.fillStyle = cols[i % cols.length]; g.globalAlpha = 0.95;
    if (i % 3 === 0) { g.beginPath(); g.arc(0, 0, 5 + r() * 4, 0, Math.PI * 2); g.fill(); } else g.fillRect(-9, -4, 18 + r() * 8, 8);
    g.restore();
  }
}
function prizeSticker(g: G, cx: number, cy: number, text: string, rot: number) {
  g.save(); g.translate(cx, cy); g.rotate(rot);
  shadow(g, 22, 0.35, 10); burst(g, 0, 0, 132, 16, '#FFD54A'); noShadow(g);
  const gg = g.createRadialGradient(-30, -40, 10, 0, 0, 120); gg.addColorStop(0, 'rgba(255,255,255,.55)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gg; g.beginPath(); g.arc(0, 0, 112, 0, Math.PI * 2); g.fill();
  g.lineWidth = 5; g.strokeStyle = '#FFFFFF'; g.beginPath(); g.arc(0, 0, 98, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#4A2A00'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${text.length > 6 ? 54 : 62}px ${EN}`; g.fillText(text, 0, 4);
  g.restore();
}
/** the small pool line, with ONLY the ฿ amount highlighted (gold, bolder, a touch larger, soft glow) */
function poolLine(g: G, text: string, th: boolean, cx: number, y: number) {
  const m = /^(.*?)(฿[\d,]+)(.*)$/.exec(text);
  const [a, amt, b] = m ? [m[1], m[2], m[3]] : [text, '', ''];
  const fa = `${th ? 600 : 700} 36px ${th ? TH : EN}`, fb = `800 46px ${EN}`;
  g.font = fa; const wa = g.measureText(a).width, wc = g.measureText(b).width;
  g.font = fb; const wb = g.measureText(amt).width;
  let x = cx - (wa + wb + wc) / 2;
  g.textAlign = 'left';
  shadow(g, 10, 0.45, 2);
  g.font = fa; g.fillStyle = 'rgba(255,255,255,.9)'; g.fillText(a, x, y); x += wa;
  g.font = fb; g.shadowColor = 'rgba(255,190,60,.75)'; g.shadowBlur = 18; g.shadowOffsetY = 0;
  const gold = g.createLinearGradient(0, y - 40, 0, y); gold.addColorStop(0, '#FFF3B8'); gold.addColorStop(1, '#FFC93C');
  g.fillStyle = gold; g.fillText(amt, x, y + 2); x += wb;
  shadow(g, 10, 0.45, 2); g.font = fa; g.fillStyle = 'rgba(255,255,255,.9)'; g.fillText(b, x, y);
  noShadow(g);
}
/** kringapp.com · code, one clean line */
function siteLine(g: G, t: ReturnType<typeof cardText>, th: boolean, cx: number, y: number) {
  const m = /^(.*?)([A-Z]{1,6}\d{1,7})$/.exec(t.code);
  const lab = (m ? m[1] : t.code).replace(/\s*·\s*$/, ' '), code = m ? m[2] : '';
  const fs = `800 44px ${EN}`, fl = `${th ? 600 : 700} 38px ${th ? TH : EN}`, fc = `800 44px ${EN}`, dot = '  ·  ';
  g.font = fs; const w1 = g.measureText(t.site).width, wd = t.code ? g.measureText(dot).width : 0;
  g.font = fl; const w2 = g.measureText(lab).width;
  g.font = fc; const ls = 'letterSpacing' in g; if (ls) (g as G & { letterSpacing: string }).letterSpacing = '3px';
  const w3 = g.measureText(code).width; if (ls) (g as G & { letterSpacing: string }).letterSpacing = '0px';
  let x = cx - (w1 + wd + w2 + w3) / 2;
  g.textAlign = 'left'; shadow(g, 10, 0.45, 2);
  g.font = fs; g.fillStyle = '#FFFFFF'; g.fillText(t.site, x, y); x += w1;
  if (t.code) { g.fillStyle = 'rgba(255,255,255,.6)'; g.fillText(dot, x, y); x += wd; }
  g.font = fl; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(lab, x, y); x += w2;
  g.font = fc; if (ls) (g as G & { letterSpacing: string }).letterSpacing = '3px'; g.fillStyle = '#FFE7F6'; g.fillText(code, x, y);
  if (ls) (g as G & { letterSpacing: string }).letterSpacing = '0px';
  noShadow(g);
}
function lookB(g: G, img: Img | null, c: ShareCard, t: ReturnType<typeof cardText>, th: boolean, v: 1 | 2) {
  const W = STORY_W;
  glowBg(g, img, c.moment.length * 13 + c.rank);
  shadow(g, 12, 0.35); wordmark(g, W / 2, SAFE_TOP + 22, t.brand, th, '#FFFFFF', 'center', 36); noShadow(g);
  // the polaroid: ~80% of the width
  const fw = 864, side = v === 2 ? 46 : 36, topB = v === 2 ? 46 : 36, pw = fw - side * 2, ph = v === 2 ? 800 : 820, strip = v === 2 ? 236 : 236;
  const fh = topB + ph + strip, fx = (W - fw) / 2, fy = SAFE_TOP + 92, rot = v === 2 ? 0 : -0.061;
  const px = fx + side, py = fy + topB, ccx = W / 2, ccy = fy + fh / 2;
  if (c.moment === 'proof') confetti(g, { x: fx, y: fy, w: fw, h: fh }, 11);
  g.save();
  g.translate(ccx, ccy); g.rotate(rot); g.translate(-ccx, -ccy);
  // soft drop shadow + contact shadow, then warm paper with grain
  g.save(); shadow(g, 70, 0.4, 34); rr(g, fx, fy, fw, fh, 10); g.fillStyle = '#FFFBF3'; g.fill(); g.restore();
  g.save(); shadow(g, 6, 0.28, 3); rr(g, fx, fy, fw, fh, 10); g.fillStyle = '#FFFBF3'; g.fill(); g.restore();
  g.save(); rr(g, fx, fy, fw, fh, 10); g.clip(); g.fillStyle = g.createPattern(grain(), 'repeat') as CanvasPattern; g.globalCompositeOperation = 'multiply'; g.fillRect(fx, fy, fw, fh); g.restore();
  // the photo, cropped to the faces (eyes near the upper third)
  g.save(); g.beginPath(); g.rect(px, py, pw, ph); g.clip();
  if (img) cover(g, img, px, py, pw, ph, c.focus ?? 0.6); else { g.fillStyle = '#C9B6F2'; g.fillRect(px, py, pw, ph); }
  const sheen = g.createLinearGradient(px, py, px + pw, py + ph); sheen.addColorStop(0, 'rgba(255,255,255,.08)'); sheen.addColorStop(0.4, 'rgba(255,255,255,0)');
  g.fillStyle = sheen; g.fillRect(px, py, pw, ph);
  g.restore();
  g.strokeStyle = 'rgba(40,20,10,.12)'; g.lineWidth = 2; g.strokeRect(px, py, pw, ph);
  // the headline on the paper strip: big, dark ink, author line breaks (Thai breaks only between words)
  const font = (n: number) => `${th ? 700 : 800} ${n}px ${th ? TH : EN}`;
  const { lines, px: fpx } = fitLines(g, t.strip, font, th ? 74 : 80, pw - 40, 44, 0.6);
  const lh = fpx * (th ? 1.3 : 1.1);
  const sy = py + ph + strip / 2 - ((lines.length - 1) * lh) / 2 + fpx * 0.34;
  g.fillStyle = '#21183A'; g.textAlign = 'center';
  lines.forEach((l, i) => { g.font = font(fpx); g.fillText(l, W / 2, sy + i * lh); });
  g.textAlign = 'left';
  // card accents
  if (c.moment === 'help') {
    const bx = px + pw / 2, by = py + ph * 0.5;
    playButton(g, bx, by, 82);
    handArrow(g, px + pw - 92, py + 120, bx + 104, by - 70);
  }
  if (c.moment === 'challenge') stamp(g, px + pw - 70, py + 78, `#${c.rank}`, 0.2);
  if (c.moment === 'proof' && t.amount) prizeSticker(g, px + pw - 100, py + ph - 150, t.amount, 0.16);
  // the rank chip as a sticker on the photo, top-left
  g.save(); g.translate(px + 26, py + 30); g.rotate(-0.045);
  g.font = `${th ? 700 : 800} 34px ${th ? TH : EN}`;
  const cw = g.measureText(t.chip).width + 52, chh = 66;
  shadow(g, 14, 0.3, 5); rr(g, 0, 0, cw, chh, chh / 2); g.fillStyle = '#FFFFFF'; g.fill(); noShadow(g);
  g.fillStyle = '#21183A'; g.textBaseline = 'middle'; g.fillText(t.chip, 26, chh / 2 + (th ? 3 : 2)); g.textBaseline = 'alphabetic';
  g.restore();
  g.restore();
  if (v === 1) washiTape(g, W / 2 + 6, fy - 4, 230, 62, 0.035); else pushPin(g, W / 2, fy + 22);
  // bottom zone: small pool line (only ฿ highlighted), then kringapp.com · code — inside the safe area
  const base = STORY_H - SAFE_BOTTOM;
  if (t.pool) poolLine(g, t.pool, th, W / 2, base - 74);
  siteLine(g, t, th, W / 2, base - 6);
}

/* C · bold sticker: the Reel full-bleed with playful die-cut stickers (clean, few colours) */
function burst(g: G, cx: number, cy: number, r: number, n: number, fill: string) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = (Math.PI * i) / n - Math.PI / 2, rr2 = i % 2 ? r * 0.84 : r; g.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); }
  g.closePath(); g.fillStyle = fill; g.fill();
}
function lookC(g: G, img: Img | null, c: ShareCard, t: ReturnType<typeof cardText>, th: boolean) {
  const W = STORY_W, H = STORY_H;
  if (img) cover(g, img, 0, 0, W, H, 0.45); else bgFallback(g);
  const low = g.createLinearGradient(0, 1250, 0, H); low.addColorStop(0, 'rgba(20,8,40,0)'); low.addColorStop(1, 'rgba(20,8,40,.8)');
  g.fillStyle = low; g.fillRect(0, 1250, W, H - 1250);
  const top = g.createLinearGradient(0, 0, 0, 420); top.addColorStop(0, 'rgba(20,8,40,.4)'); top.addColorStop(1, 'rgba(20,8,40,0)');
  g.fillStyle = top; g.fillRect(0, 0, W, 420);
  shadow(g, 12, 0.3); wordmark(g, 84, SAFE_TOP + 46, t.brand, th, '#FFFFFF', 'left', 42); noShadow(g);
  // big badge, top right: the emoji / rank / amount on a starburst
  const bx = W - 230, by = SAFE_TOP + 170;
  g.save(); g.translate(bx, by); g.rotate(0.14);
  shadow(g, 24, 0.3, 10);
  const big = c.moment === 'proof' ? t.amount : c.moment === 'challenge' ? `#${c.rank}` : '🙏';
  burst(g, 0, 0, 150, 14, c.moment === 'proof' ? '#FFD84D' : c.moment === 'challenge' ? '#FF5FCB' : '#FFFFFF');
  noShadow(g);
  g.lineWidth = 8; g.strokeStyle = '#FFFFFF'; g.beginPath(); g.arc(0, 0, 112, 0, Math.PI * 2); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `800 ${c.moment === 'proof' ? (big.length > 5 ? 62 : 74) : c.moment === 'challenge' ? 120 : 112}px ${EN}`;
  g.fillStyle = c.moment === 'challenge' ? '#FFFFFF' : '#2A1650';
  g.fillText(big, 0, c.moment === 'help' ? 10 : 8);
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.restore();
  if (c.moment === 'help') playButton(g, W / 2, 900, 88);
  // headline as die-cut white stickers, one per line, alternating tilt
  const font = (px: number) => `${th ? 700 : 800} ${px}px ${th ? TH : EN}`;
  const { lines, px } = fitLines(g, t.headline, font, th ? 80 : 92, W - 240, 44);
  const lh = px * (th ? 1.62 : 1.42);
  const baseY = STORY_H - SAFE_BOTTOM - 285;
  const y0 = baseY - (lines.length - 1) * lh;
  const tones = ['#FFFFFF', '#FFE6F6', '#FFFFFF'];
  lines.forEach((l, i) => {
    g.font = font(px);
    const w = g.measureText(l).width + px * 0.9, h = px * (th ? 1.42 : 1.3);
    const x = 84 + (i % 2 ? 36 : 0), y = y0 + i * lh;
    g.save(); g.translate(x + w / 2, y - h / 2 + px * 0.2); g.rotate(i % 2 ? 0.025 : -0.03); g.translate(-(x + w / 2), -(y - h / 2 + px * 0.2));
    shadow(g, 18, 0.28, 8); rr(g, x, y - h + px * 0.45, w, h, 26); g.fillStyle = tones[i % 3]; g.fill(); noShadow(g);
    g.fillStyle = '#231A3D'; g.fillText(l, x + px * 0.45, y + (th ? px * 0.08 : 0));
    g.restore();
  });
  // the chip: a small coloured sticker above the headline
  g.save(); g.translate(84, y0 - px * 1.25 - 74); g.rotate(-0.04);
  chipPill(g, 0, 0, t.chip, th, { fill: '#7C5CFF', color: '#FFFFFF', size: 34 });
  g.restore();
  bottomZone(g, t, th, { ink: '#FFFFFF', soft: 'rgba(255,255,255,.86)', accent: '#FFE491', align: 'left', x: 84 });
}

/** Draws one card. `images: false` = without the photo (when its host does not allow canvas export). */
export async function drawCard(cv: HTMLCanvasElement, c: ShareCard, images = true): Promise<void> {
  cv.width = STORY_W; cv.height = STORY_H;
  const g = cv.getContext('2d');
  if (!g) throw new Error('no canvas');
  const th = isThai(c.lang);
  const t = cardText(c);
  await fontsReady(Object.values(t).join(' '), th);
  const img = images && c.hero ? await loadImg(c.hero) : null;
  g.textBaseline = 'alphabetic';
  if (c.look === 'B' || c.look === 'B2') lookB(g, img, c, t, th, c.look === 'B2' ? 2 : 1); else if (c.look === 'C') lookC(g, img, c, t, th); else lookA(g, img, c, t, th);
}

export async function cardBlob(c: ShareCard): Promise<Blob | null> {
  const cv = document.createElement('canvas');
  const out = async (images: boolean) => { await drawCard(cv, c, images); return new Promise<Blob | null>((ok) => cv.toBlob(ok, 'image/png')); };
  try { return await out(true); } catch { try { return await out(false); } catch { return null; } }   // a photo host without CORS taints the canvas
}

export type StoryResult = 'shared' | 'saved' | 'cancelled' | 'failed';
/**
 * ONE tap: copy the personal link (Instagram drops links from shared pictures → the member pastes it into a Link sticker) and show the
 * toast, then the phone's own share sheet with the picture + caption + link (Instagram, X, LINE, WhatsApp, Facebook…).
 * No share sheet for files → the picture is downloaded (the link is already copied).
 */
export async function shareCard(blob: Blob | null, o: { name: string; caption: string; link: string; copy: (s: string) => Promise<boolean> | boolean; toast: (s: string) => void; copied: string }): Promise<StoryResult> {
  let copied = false;
  try { copied = !!(await o.copy(o.link)); } catch { copied = false; }
  if (copied) o.toast(o.copied);
  if (!blob) return 'failed';
  const file = new File([blob], o.name, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare) {
    const full: ShareData = { files: [file], text: `${o.caption}\n${o.link}`, url: o.link };
    const data = nav.canShare(full) ? full : nav.canShare({ files: [file] }) ? { files: [file], text: `${o.caption}\n${o.link}` } : null;
    if (data) {
      try { await nav.share(data); return 'shared'; }
      catch (e) { if ((e as { name?: string })?.name === 'AbortError') return 'cancelled'; }
    }
  }
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return 'saved';
  } catch { return 'failed'; }
}
