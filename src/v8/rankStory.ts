/**
 * board-1 (18 Nov): "Share my rank" — a story-ready picture of the member's own weekly rank (1080×1920 PNG, Instagram / TikTok / LINE stories).
 * Founder: members were screenshotting the board (other members' faces and names, dark boxes). This card shows ONLY the member:
 * their Reel's poster full-bleed (else their photo, else a Kring dusk gradient), their photo in a ring, "#1 this week", their Rings,
 * the prize of their rank only when they qualify, the Kring wordmark, kringapp.com and their own invite code (+ a QR of their ?ref link,
 * so a friend who joins is credited to them). One language: Thai mode = Thai only, every other mode = English only.
 * Kring Light: no opaque boxes; text sits on the picture with soft shade, thin borders, generous space.
 * The top 250 px and the bottom 300 px stay free for the Instagram / TikTok story controls.
 * Canvas only, no new dependencies (qrcode-generator is already in the app).
 */
import qrcode from 'qrcode-generator';

export const STORY_W = 1080;
export const STORY_H = 1920;
/** Instagram's story header (progress bar + name) and reply bar cover about this much. Nothing important is drawn there. */
export const SAFE_TOP = 250;
export const SAFE_BOTTOM = 300;

export interface RankStory {
  lang: string;
  rank: number;
  rings: number;
  /** ฿ of the member's rank, only when they qualify for it (server gap.prize_now); 0 = no prize line */
  prize: number;
  name: string;
  photo: string | null;
  poster: string | null;
  /** invite code, e.g. k00037 ('' = none) */
  code: string;
  /** the member's invite link (?ref=code), drawn as a QR */
  link: string;
}

const fmt = (n: number) => Math.max(0, Math.round(n)).toLocaleString('en-US');
export const isThai = (lang: string) => lang === 'th';

/** Every word on the card, one language only (tested: no English in Thai mode, no Thai in English mode). */
export function storyText(s: Pick<RankStory, 'lang' | 'rank' | 'rings' | 'prize' | 'code'>) {
  const th = isThai(s.lang);
  return {
    brand: th ? 'กริ๊ง!' : 'Kring',
    kicker: th ? 'อันดับประจำสัปดาห์' : 'WEEKLY RANKING',
    rank: `#${s.rank}`,
    week: th ? 'ของสัปดาห์นี้' : 'this week',
    rings: th ? `${fmt(s.rings)} ริง` : s.rings === 1 ? '1 Ring' : `${fmt(s.rings)} Rings`,
    prize: s.prize > 0 ? (th ? `รางวัล ฿${fmt(s.prize)}` : `฿${fmt(s.prize)} prize`) : '',
    join: th ? 'มาเล่นกริ๊งด้วยกัน' : 'Join me on Kring',
    site: 'kringapp.com',
    code: s.code ? (th ? `โค้ดชวนเพื่อน ${s.code}` : `Invite code ${s.code}`) : '',
  };
}

/** The board button and its spoken label, one language. */
export const storyButton = (lang: string) => (isThai(lang) ? 'แชร์อันดับ' : 'Share my rank');
export const storyButtonLabel = (lang: string) => (isThai(lang) ? 'แชร์อันดับของฉันเป็นสตอรี่' : 'Share my rank as a story');
export const storyFileName = (rank: number) => `kring-rank-${rank}.png`;

const EN_FONT = "'Bricolage Grotesque', 'Plus Jakarta Sans', 'Kring Thai Looped', 'Anuphan', system-ui, sans-serif";
const TH_FONT = "'Kring Thai Looped', 'Anuphan', 'Bricolage Grotesque', system-ui, sans-serif";

function loadImg(src: string, cors: boolean): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const i = new Image();
    if (cors && !/^(data|blob):/.test(src)) i.crossOrigin = 'anonymous';
    i.onload = () => ok(i);
    i.onerror = () => ok(null);
    window.setTimeout(() => ok(null), 6000);
    i.src = src;
  });
}

async function fontsReady(t: ReturnType<typeof storyText>, th: boolean) {
  try {
    const f = document.fonts;
    if (!f?.load) return;
    const all = Object.values(t).join(' ');
    await Promise.race([
      Promise.all([f.load(`800 120px ${EN_FONT}`, all), f.load(`500 40px ${EN_FONT}`, all), th ? f.load(`700 60px ${TH_FONT}`, all) : null, th ? f.load(`500 40px ${TH_FONT}`, all) : null]),
      new Promise((ok) => window.setTimeout(ok, 2500)),
    ]);
  } catch { /* draw with what is there */ }
}

type G = CanvasRenderingContext2D;
function cover(g: G, img: HTMLImageElement, x: number, y: number, w: number, h: number, focusY = 0.4) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) * focusY, dw, dh);
}
function pill(g: G, x: number, y: number, w: number, h: number) {
  const r = h / 2;
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function rr(g: G, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
/** the Kring mark: blue + pink interlocked rings */
function rings(g: G, cx: number, cy: number, r: number, lw: number) {
  g.save(); g.lineWidth = lw;
  g.strokeStyle = '#6E9BFF'; g.beginPath(); g.arc(cx - r * 0.62, cy, r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#FF5FCB'; g.beginPath(); g.arc(cx + r * 0.62, cy, r, 0, Math.PI * 2); g.stroke();
  g.restore();
}
const TONE: Record<number, [string, string, string]> = { 1: ['#FFF1B8', '#F7C955', '#C98A12'], 2: ['#EAF2FF', '#9DBBF2', '#4B6FD0'], 3: ['#FFE6DA', '#F2A186', '#B9583C'] };
const tone = (rank: number) => TONE[rank] || ['#FFD3F1', '#FF7FD6', '#B83AA0'];

/** Draws the card. `images: false` = no photos (used when a photo host does not allow canvas export). */
export async function drawRankStory(c: HTMLCanvasElement, s: RankStory, images = true): Promise<void> {
  const W = STORY_W, H = STORY_H, th = isThai(s.lang);
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) throw new Error('no canvas');
  const t = storyText(s);
  await fontsReady(t, th);
  const [poster, photo] = images ? await Promise.all([s.poster ? loadImg(s.poster, true) : null, s.photo ? loadImg(s.photo, true) : null]) : [null, null];
  const F = (w: number, px: number, thai = th) => `${w} ${px}px ${thai ? TH_FONT : EN_FONT}`;

  // 1 · the picture, full-bleed (their Reel), else their photo, else a Bangkok-dusk gradient
  const dusk = g.createLinearGradient(0, 0, W * 0.35, H);
  dusk.addColorStop(0, '#3B2C8F'); dusk.addColorStop(0.45, '#8E4FC9'); dusk.addColorStop(0.8, '#F07AB8'); dusk.addColorStop(1, '#FFB58A');
  g.fillStyle = dusk; g.fillRect(0, 0, W, H);
  const bg = poster || photo;
  if (bg) {
    if (!poster) { g.save(); g.filter = 'blur(28px) saturate(115%)'; cover(g, bg, -60, -60, W + 120, H + 120, 0.3); g.restore(); }
    else cover(g, bg, 0, 0, W, H, 0.42);
  } else {
    // soft light blooms on the gradient so it never looks flat
    for (const [x, y, r, a] of [[880, 420, 520, 0.22], [160, 1500, 640, 0.18]] as const) {
      const b = g.createRadialGradient(x, y, 0, x, y, r); b.addColorStop(0, `rgba(255,255,255,${a})`); b.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = b; g.fillRect(0, 0, W, H);
    }
  }
  // soft shade only where the words sit (top and lower third): the picture stays bright in the middle
  const top = g.createLinearGradient(0, 0, 0, 640);
  top.addColorStop(0, 'rgba(12,8,34,.55)'); top.addColorStop(1, 'rgba(12,8,34,0)');
  g.fillStyle = top; g.fillRect(0, 0, W, 640);
  const low = g.createLinearGradient(0, 860, 0, H);
  low.addColorStop(0, 'rgba(12,8,34,0)'); low.addColorStop(0.42, 'rgba(12,8,34,.5)'); low.addColorStop(1, 'rgba(12,8,34,.78)');
  g.fillStyle = low; g.fillRect(0, 860, W, H - 860);

  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const shadow = (blur: number, a = 0.45) => { g.shadowColor = `rgba(8,4,30,${a})`; g.shadowBlur = blur; g.shadowOffsetY = Math.round(blur / 6); };
  const noShadow = () => { g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0; };

  // 2 · wordmark + kicker, under the story header
  const brandY = SAFE_TOP + 70;
  g.font = F(800, 64, th);
  const bw = g.measureText(t.brand).width, mark = 92, gap = 22, bx = W / 2 - (mark + gap + bw) / 2;
  shadow(18);
  rings(g, bx + mark / 2, brandY - 22, 26, 9);
  g.fillStyle = '#FFFFFF'; g.textAlign = 'left'; g.fillText(t.brand, bx + mark + gap, brandY);
  g.textAlign = 'center';
  g.font = th ? F(600, 40) : F(700, 34);
  g.fillStyle = 'rgba(255,255,255,.88)';
  if (!th && 'letterSpacing' in g) (g as G & { letterSpacing: string }).letterSpacing = '6px';
  g.fillText(t.kicker, W / 2, brandY + 74);
  if ('letterSpacing' in g) (g as G & { letterSpacing: string }).letterSpacing = '0px';
  noShadow();

  // 3 · their photo in a thin metal ring (gold for #1)
  const [c0, c1, c2] = tone(s.rank);
  const cx = W / 2, cy = 660, R = 150;
  const halo = g.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.9);
  halo.addColorStop(0, `${c1}66`); halo.addColorStop(1, `${c1}00`);
  g.fillStyle = halo; g.fillRect(cx - R * 2, cy - R * 2, R * 4, R * 4);
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.closePath(); g.clip();
  if (photo) cover(g, photo, cx - R, cy - R, R * 2, R * 2, 0.25);
  else {
    const f = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R); f.addColorStop(0, '#6E5BD8'); f.addColorStop(1, '#E35FB8');
    g.fillStyle = f; g.fillRect(cx - R, cy - R, R * 2, R * 2);
    g.fillStyle = '#fff'; g.font = F(800, 170, false); g.textBaseline = 'middle'; g.fillText((s.name || '?').charAt(0).toUpperCase(), cx, cy + 6); g.textBaseline = 'alphabetic';
  }
  g.restore();
  const ring = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  ring.addColorStop(0, c0); ring.addColorStop(0.5, c1); ring.addColorStop(1, c2);
  g.lineWidth = 12; g.strokeStyle = ring; g.beginPath(); g.arc(cx, cy, R + 8, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(cx, cy, R + 26, 0, Math.PI * 2); g.stroke();

  // 4 · name, the rank (big), "this week"
  let y = cy + R + 92;
  if (s.name) { shadow(16); g.fillStyle = '#FFFFFF'; g.font = F(800, 60, /[฀-๿]/.test(s.name)); g.fillText(s.name.slice(0, 20), W / 2, y); noShadow(); }
  y += 220;
  g.font = F(800, 230, false);
  const gold = g.createLinearGradient(0, y - 180, 0, y);
  gold.addColorStop(0, '#FFFFFF'); gold.addColorStop(0.35, c0); gold.addColorStop(1, c1);
  shadow(40, 0.5); g.fillStyle = gold; g.fillText(t.rank, W / 2, y); noShadow();
  y += 80;
  shadow(14); g.fillStyle = '#FFFFFF'; g.font = th ? F(700, 58) : F(800, 58); g.fillText(t.week, W / 2, y); noShadow();

  // 5 · Rings (thin-border glass pill) and the prize, only when they qualify
  y += 44;
  g.font = th ? F(700, 44) : F(800, 44);
  const rw = g.measureText(t.rings).width, ph = 84, pw = rw + 72 + 96;
  const px = W / 2 - pw / 2;
  pill(g, px, y, pw, ph); g.fillStyle = 'rgba(255,255,255,.14)'; g.fill();
  g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.55)'; g.stroke();
  rings(g, px + 62, y + ph / 2, 14, 5);
  g.fillStyle = '#FFFFFF'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(t.rings, px + 66 + 50, y + ph / 2 + (th ? 4 : 2));
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  y += ph;
  if (t.prize) {
    y += 76;
    shadow(22, 0.5); g.font = th ? F(700, 54) : F(800, 54); g.fillStyle = '#FFE491'; g.fillText(t.prize, W / 2, y); noShadow();
  }

  // 6 · invite: QR (white tile) + Join me · kringapp.com · code, above the story reply bar
  const by = H - SAFE_BOTTOM;              // last line sits on this baseline
  const q = s.link ? qrcode(0, 'M') : null;
  if (q) { q.addData(s.link); q.make(); }
  g.font = th ? F(700, 48) : F(800, 48);
  const jw = g.measureText(t.join).width;
  g.font = F(800, 52, false); const sw = g.measureText(t.site).width;
  g.font = th ? F(500, 36) : F(500, 34); const cw = t.code ? g.measureText(t.code).width : 0;
  const tw = Math.max(jw, sw, cw), T = q ? 176 : 0, gp = q ? 36 : 0;
  const lx = W / 2 - (T + gp + tw) / 2;
  if (q) {
    const ty = by - T + 12;
    rr(g, lx, ty, T, T, 26); g.fillStyle = '#FFFFFF'; g.fill();
    const n = q.getModuleCount(), pad = 16, cell = (T - pad * 2) / n;
    g.fillStyle = '#16122E';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect(lx + pad + k * cell, ty + pad + r * cell, Math.ceil(cell), Math.ceil(cell));
  }
  const tx = lx + T + gp;
  g.textAlign = q ? 'left' : 'center';
  const ax = q ? tx : W / 2;
  shadow(14);
  g.fillStyle = '#FFFFFF'; g.font = th ? F(700, 48) : F(800, 48); g.fillText(t.join, ax, by - (t.code ? 124 : 70));
  g.fillStyle = '#FFD3F1'; g.font = F(800, 52, false); g.fillText(t.site, ax, by - (t.code ? 58 : 4));
  if (t.code) { g.fillStyle = 'rgba(255,255,255,.86)'; g.font = th ? F(500, 36) : F(500, 34); g.fillText(t.code, ax, by + 2); }
  noShadow();
  g.textAlign = 'center';
}

export async function rankStoryBlob(s: RankStory): Promise<Blob | null> {
  const c = document.createElement('canvas');
  const out = async (images: boolean) => {
    await drawRankStory(c, s, images);
    return new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
  };
  try { return await out(true); }
  catch { try { return await out(false); } catch { return null; } }   // a photo host without CORS taints the canvas: draw without photos
}

export type StoryResult = 'shared' | 'saved' | 'cancelled' | 'failed';
/** The phone's share sheet with the picture (Instagram / TikTok / LINE stories), else a download of the PNG. */
export async function shareRankStory(blob: Blob | null, rank: number): Promise<StoryResult> {
  if (!blob) return 'failed';
  const file = new File([blob], storyFileName(rank), { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (typeof nav.share === 'function' && nav.canShare && nav.canShare({ files: [file] })) {
    try { await nav.share({ files: [file] }); return 'shared'; }
    catch (e) { if ((e as { name?: string })?.name === 'AbortError') return 'cancelled'; /* not allowed (no tap left): save it instead */ }
  }
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return 'saved';
  } catch { return 'failed'; }
}
