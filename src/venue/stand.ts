/**
 * Print files for one partner venue: kringapp.com/app/stand.html?v=<slug>[&f=stand|sticker]
 *  · A6 counter stand (105 × 148 mm, 300 dpi) with the venue's own QR → /app/?v=<slug>&src=stand (STAFF SWIPE, D-10NOV-C)
 *  · 10 cm round door sticker with a QR → /app/?place=<slug> (the venue's page in the app)
 * Drawn on a canvas with the app's own fonts (Thai shapes correctly), then wrapped in a PDF by jsPDF. Public page: the
 * owner opens it from the welcome LINE message; it only reads kr8_stand_info (name, area, treat).
 * Copy rules: Thai first with English under it, treat in baht or a free item, no percent, no yellow.
 */
import '../lib/sentry';
import qrcode from 'qrcode-generator';
import '../v8/fonts-v8.css';
import { basePath, el, rpc, tx, type TxPair } from './shared';
import './stand.css';

type Info = { id: string; name: string; name_th: string | null; area: string; practice: boolean; deal_en: string | null; deal_th: string | null; treat_id: string | null };

const DPI = 300;
const mm = (x: number) => Math.round((x / 25.4) * DPI);
const PINK = '#FF4FA3', ORANGE = '#FF8A3D', INK = '#2A1E16', CREAM = '#FFF7EC', BLUE = '#7381FF', DIM = '#7A6A5C';
const TH = "'Anuphan', 'Noto Sans Thai', sans-serif";
const EN = "'Bricolage Grotesque', 'Plus Jakarta Sans', 'Anuphan', sans-serif";

export function standUrl(slug: string, origin = location.origin): string {
  return `${origin}${basePath()}?v=${encodeURIComponent(slug)}&src=stand`;
}
export function placeUrl(slug: string, origin = location.origin): string {
  return `${origin}${basePath()}?place=${encodeURIComponent(slug)}`;
}

function drawQr(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  const quiet = 2;
  const cell = size / (n + quiet * 2);
  g.fillStyle = '#fff';
  g.fillRect(x, y, size, size);
  g.fillStyle = INK;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (q.isDark(r, c)) g.fillRect(Math.floor(x + (c + quiet) * cell), Math.floor(y + (r + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
  }
}

function rings(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, lw: number) {
  g.lineWidth = lw;
  g.strokeStyle = BLUE; g.beginPath(); g.arc(cx - r * 0.45, cy, r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = PINK; g.beginPath(); g.arc(cx + r * 0.45, cy, r, 0, Math.PI * 2); g.stroke();
}

/** Wraps text to a max width; returns the lines. Thai has no spaces, so break by grapheme when needed. */
function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? Array.from(new (Intl as unknown as { Segmenter: new (l: string, o: object) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter('th', { granularity: 'word' }).segment(text), (s) => s.segment)
    : text.split(/(\s+)/);
  let line = '';
  for (const w of seg) {
    const t = line + w;
    if (g.measureText(t).width > max && line.trim()) { out.push(line.trim()); line = w.trimStart(); } else line = t;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

function lines(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number, maxLines = 3): number {
  const ls = wrap(g, text, max).slice(0, maxLines);
  ls.forEach((l, i) => g.fillText(l, x, y + i * lh));
  return y + ls.length * lh;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** A6 counter stand, 1240 × 1748 px. */
export function drawStand(v: Info, origin = location.origin): HTMLCanvasElement {
  const W = mm(105), H = mm(148);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = CREAM; g.fillRect(0, 0, W, H);
  // top band
  const band = g.createLinearGradient(0, 0, W, 0); band.addColorStop(0, ORANGE); band.addColorStop(1, PINK);
  g.fillStyle = band; g.fillRect(0, 0, W, 250);
  g.save(); g.globalCompositeOperation = 'screen'; rings(g, 120, 125, 46, 16); g.restore();
  g.fillStyle = '#fff'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.font = `800 80px ${EN}`; g.fillText('Kring', 200, 150);
  g.font = `700 44px ${TH}`; g.fillText('กริ๊ง!', 430, 148);
  g.textAlign = 'right'; g.font = `700 34px ${TH}`; g.fillText('พาร์ทเนอร์', W - 60, 112);
  g.font = `600 30px ${EN}`; g.fillText('Partner', W - 60, 154);
  // venue name
  g.textAlign = 'center'; g.fillStyle = INK;
  let y = 340;
  g.font = `800 64px ${TH}`; y = lines(g, v.name_th || v.name, W / 2, y, W - 140, 74, 2);
  if (v.name_th && v.name_th !== v.name) { g.font = `600 40px ${EN}`; g.fillStyle = DIM; y = lines(g, v.name, W / 2, y - 10, W - 140, 48, 1); }
  // scan line
  g.fillStyle = PINK; g.font = `800 52px ${TH}`; g.fillText('สแกนรับสิทธิพิเศษ', W / 2, y + 40);
  g.font = `700 36px ${EN}`; g.fillText('Scan for your treat', W / 2, y + 88);
  // QR card
  const qs = 600, qx = (W - qs) / 2, qy = y + 125;
  g.save(); g.shadowColor = 'rgba(42,30,22,.18)'; g.shadowBlur = 30; g.fillStyle = '#fff'; roundRect(g, qx - 30, qy - 30, qs + 60, qs + 60, 40); g.fill(); g.restore();
  drawQr(g, standUrl(v.id, origin), qx, qy, qs);
  y = qy + qs + 90;
  // treat
  const th = v.deal_th || v.deal_en || '', en = v.deal_en || v.deal_th || '';
  g.fillStyle = INK; g.font = `800 46px ${TH}`; y = lines(g, th, W / 2, y, W - 160, 56, 2);
  if (en !== th) { g.fillStyle = DIM; g.font = `600 32px ${EN}`; y = lines(g, en, W / 2, y, W - 160, 40, 2); }
  // 3 steps
  const steps: TxPair[] = [['สแกน', 'Scan'], ['โชว์ตั๋ว', 'Show ticket'], ['พนักงานสไลด์', 'Staff slide']];
  const sy = H - 230, sw = (W - 120) / 3;
  steps.forEach((s, i) => {
    const cx = 60 + sw * i + sw / 2;
    g.fillStyle = i === 2 ? PINK : ORANGE; g.beginPath(); g.arc(cx, sy, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = `800 38px ${EN}`; g.fillText(String(i + 1), cx, sy + 13);
    g.fillStyle = INK; g.font = `700 32px ${TH}`; g.fillText(s[0], cx, sy + 84);
    g.fillStyle = DIM; g.font = `600 26px ${EN}`; g.fillText(s[1], cx, sy + 118);
  });
  g.fillStyle = DIM; g.font = `500 26px ${TH}`;
  g.fillText('ใช้ได้วันละ 1 ครั้งต่อคน · Once a day per guest · kringapp.com', W / 2, H - 40);
  return c;
}

/** 10 cm round door sticker, 1181 × 1181 px (transparent outside the circle). */
export function drawSticker(v: Info, origin = location.origin): HTMLCanvasElement {
  const S = mm(100);
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d')!;
  const R = S / 2;
  const grad = g.createLinearGradient(0, 0, S, S); grad.addColorStop(0, ORANGE); grad.addColorStop(1, PINK);
  g.fillStyle = grad; g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.fill();
  g.fillStyle = CREAM; g.beginPath(); g.arc(R, R, R - 70, 0, Math.PI * 2); g.fill();
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.save(); g.globalCompositeOperation = 'multiply'; rings(g, R, 215, 40, 14); g.restore();
  g.fillStyle = INK; g.font = `800 64px ${EN}`; g.fillText('Kring partner', R, 330);
  g.fillStyle = PINK; g.font = `700 42px ${TH}`; g.fillText('ร้านพาร์ทเนอร์กริ๊ง!', R, 390);
  const qs = 470; drawQr(g, placeUrl(v.id, origin), R - qs / 2, 425, qs);
  g.fillStyle = INK; g.font = `700 36px ${TH}`; g.fillText('สแกนดูร้านเราในแอป', R, 960);
  g.fillStyle = DIM; g.font = `600 30px ${EN}`; g.fillText('Scan to see us on Kring', R, 1002);
  // white text on the ring: the venue name
  g.fillStyle = '#fff'; g.font = `800 34px ${TH}`;
  const name = (v.name_th || v.name).slice(0, 28);
  g.fillText(name, R, S - 22);
  return c;
}

async function fontsReady() {
  const want = [`800 64px Anuphan`, `700 40px Anuphan`, `600 32px Anuphan`, `500 26px Anuphan`, `800 64px "Bricolage Grotesque"`, `600 30px "Plus Jakarta Sans"`];
  await Promise.all(want.map((f) => document.fonts.load(f, 'กริ๊ง Kring').catch(() => undefined)));
  await document.fonts.ready;
}

async function toPdf(c: HTMLCanvasElement, wMm: number, hMm: number, name: string, cutCircle = false) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: [wMm, hMm], orientation: wMm > hMm ? 'landscape' : 'portrait', compress: true });
  pdf.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, wMm, hMm, undefined, 'FAST');
  if (cutCircle) { pdf.setDrawColor(200, 200, 200); pdf.setLineWidth(0.1); pdf.circle(wMm / 2, hMm / 2, wMm / 2 - 0.05, 'S'); }
  pdf.setProperties({ title: name, creator: 'Kring' });
  pdf.save(name + '.pdf');
}

function png(c: HTMLCanvasElement, name: string) {
  const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = name + '.png'; a.click();
}

const app = document.getElementById('app')!;

async function boot() {
  const q = new URLSearchParams(location.search);
  const slug = (q.get('v') || '').trim();
  const first = q.get('f') === 'sticker' ? 'sticker' : 'stand';
  app.className = 'standpage';
  if (!slug) { app.replaceChildren(el('p', { class: 'err' }, tx(['ไม่พบร้าน · เปิดลิงก์จากข้อความ LINE อีกครั้ง', 'Venue not found · open the link from your LINE message again']))); return; }
  let v: Info | null = null;
  try { v = await rpc<Info | null>('kr8_stand_info', { p_venue: slug }); } catch { v = null; }
  if (!v) { app.replaceChildren(el('p', { class: 'err', id: 'standErr' }, tx(['ไม่พบร้านนี้ หรือร้านยังไม่ได้รับอนุมัติ', 'This venue is not found or not approved yet']))); return; }
  await fontsReady();
  const stand = drawStand(v), sticker = drawSticker(v);
  const base = `kring-${v.id}`;
  const card = (id: string, title: TxPair, sub: TxPair, cv: HTMLCanvasElement, pdf: () => void, pngName: string) => {
    cv.className = 'preview'; cv.id = id + 'Canvas';
    const bPdf = el('button', { class: 'big', id: id + 'Pdf' }, tx(['ดาวน์โหลด PDF (พิมพ์)', 'Download PDF (print)']));
    bPdf.onclick = pdf;
    const bPng = el('button', { class: 'ghost', id: id + 'Png' }, tx(['รูป PNG', 'PNG image']));
    bPng.onclick = () => png(cv, pngName);
    return el('section', { class: 'pcard', id }, el('h2', {}, tx(title)), el('p', { class: 'muted' }, tx(sub)), cv, el('div', { class: 'row' }, bPdf, bPng));
  };
  const s1 = card('stand', ['ป้ายตั้งโต๊ะ A6', 'A6 counter stand'], ['10.5 × 14.8 ซม. · 300 dpi · วางที่เคาน์เตอร์', '10.5 × 14.8 cm · 300 dpi · for the counter'], stand,
    () => void toPdf(stand, 105, 148, base + '-stand-A6'), base + '-stand-A6');
  const s2 = card('sticker', ['สติกเกอร์ประตู กลม 10 ซม.', '10 cm round door sticker'], ['พิมพ์บนสติกเกอร์ แล้วตัดตามเส้นวงกลม', 'Print on sticker paper and cut along the circle'], sticker,
    () => void toPdf(sticker, 100, 100, base + '-door-sticker-10cm', true), base + '-door-sticker-10cm');
  app.replaceChildren(
    el('header', { class: 'top' }, el('b', {}, 'Kring'), el('span', {}, tx(['ไฟล์พิมพ์ของร้าน', 'Print files for your place']))),
    el('h1', {}, v.name_th || v.name), v.name_th && v.name_th !== v.name ? el('p', { class: 'muted' }, v.name) : '',
    v.practice ? el('p', { class: 'note', id: 'practiceTag' }, tx(['ร้านทดลอง · ยังไม่แสดงในแอป แต่สแกนและสไลด์ได้จริง', 'Practice listing · not shown in the app yet, but scanning and sliding work'])) : '',
    el('p', { class: 'muted' }, tx(['ร้านพิมพ์ทั่วไปพิมพ์ได้ หรือพิมพ์เองบนกระดาษ A4 แล้วตัด', 'Any print shop can print these, or print on A4 at home and cut'])),
    ...(first === 'sticker' ? [s2, s1] : [s1, s2]),
  );
  document.documentElement.dataset.ready = '1';
}

void boot();
