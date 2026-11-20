/**
 * Ask BKK (20 Nov, founder-approved, migration 0185):
 *  1. "Share this answer" picture card: 1080x1920 story or 1080x1350 post, dark glass Bangkok-night look (same family as
 *     V5ShareCard), with the question, the answer, the answerer's photo / name / BKK Local badge, the Kring pill and the
 *     answer's tracked link kringapp.com/q/<short> (opens from outside count +5 Rings for the answer's author, 0185).
 *  2. Rich replies: big emoji (a message of only 1–3 emoji), a fuller emoji picker, photo check ("Checking photo…" to the author only).
 *  3. Quick reactions 😂 ❤️ 🔥 💯 (no Rings, never on the board).
 * One language at a time: every word goes through L(); a Thai fallback here covers the new words.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import './askRich.css';
import { askTarget, useAskTr } from './askTr';

type LFn = (en: string) => string;

const TH: Record<string, string> = {
  'Ask BKK': 'ถาม BKK', 'BKK Local': 'คนกรุงเทพฯ', 'Answer on Kring': 'มาตอบบนกริ๊ง!', 'Share this answer': 'แชร์คำตอบนี้',
  'Story': 'สตอรี่', 'Post': 'โพสต์', 'Share': 'แชร์', 'Save image': 'บันทึกรูป', 'Link copied': 'คัดลอกลิงก์แล้ว',
  'Link copied · add it as a link sticker': 'คัดลอกลิงก์แล้ว · ใส่เป็นสติกเกอร์ลิงก์ได้เลย', 'Checking photo…': 'กำลังตรวจรูป…',
  'Photo not allowed': 'ใช้รูปนี้ไม่ได้', 'React': 'แสดงความรู้สึก', 'Close': 'ปิด', 'Making your card…': 'กำลังทำการ์ด…',
  'Couldn’t make the card · try again': 'ทำการ์ดไม่สำเร็จ · ลองอีกครั้ง', 'Slow down a little and try again soon.': 'ช้าลงหน่อยนะ แล้วลองใหม่อีกที',
  'Traveller': 'นักท่องเที่ยว',
};
/** L() first (the app's table); new words fall back to the Thai above in Thai mode */
export function tr(L: LFn, en: string): string {
  const v = L(en);
  if (v !== en) return v;
  return askTarget() === 'th' ? TH[en] ?? en : en;
}

// ───────────── reactions ─────────────
export const REACTS = ['😂', '❤️', '🔥', '💯'] as const;
export type React4 = typeof REACTS[number];
export type Reacts = Partial<Record<React4, number>>;
/** tap: same emoji again takes it back, another switches (one per member per item) */
export function nextReact(cur: React4 | null, tap: React4): React4 | null { return cur === tap ? null : tap; }
export function applyReact(counts: Reacts, cur: React4 | null, next: React4 | null): Reacts {
  const o: Reacts = { ...counts };
  if (cur) { o[cur] = Math.max(0, (o[cur] || 0) - 1); if (!o[cur]) delete o[cur]; }
  if (next) o[next] = (o[next] || 0) + 1;
  return o;
}

export const ReactBar: React.FC<{ L: LFn; reacts: Reacts; mine: React4 | null; onReact: (e: React4) => void; open: boolean; setOpen: (o: boolean) => void }> = ({ L, reacts, mine, onReact, open, setOpen }) => {
  const shown = REACTS.filter((e) => (reacts[e] || 0) > 0);
  return (
    <span className="ar-bar">
      {shown.map((e) => (
        <button type="button" key={e} className={`ar-chip${mine === e ? ' on' : ''}`} aria-pressed={mine === e} data-react={e} onClick={() => onReact(e)}>
          <span className="ar-e">{e}</span><b>{reacts[e]}</b>
        </button>
      ))}
      <button type="button" className={`ar-plus${open ? ' on' : ''}`} aria-label={tr(L, 'React')} aria-expanded={open} data-react-open="1" onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M12 3a9 9 0 100 18 9 9 0 000-18zM8.5 14.5s1.2 1.8 3.5 1.8 3.5-1.8 3.5-1.8M9 9.5h.01M15 9.5h.01" /></svg>
        <i aria-hidden="true">+</i>
      </button>
      {open && (
        <span className="ar-pick" role="menu">
          {REACTS.map((e) => (
            <button type="button" key={e} role="menuitemradio" aria-checked={mine === e} className={mine === e ? 'on' : ''} data-react-pick={e}
              onClick={() => { onReact(e); setOpen(false); }}>{e}</button>
          ))}
        </span>
      )}
    </span>
  );
};

/** long-press (450 ms) on an answer opens its reaction picker; a scroll / move cancels it */
export function useLongPress(on: () => void, ms = 450) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => { if (t.current) clearTimeout(t.current); t.current = null; start.current = null; };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button, a, input, textarea')) return;
      start.current = { x: e.clientX, y: e.clientY };
      t.current = setTimeout(() => { t.current = null; try { navigator.vibrate?.(12); } catch { /* no vibration */ } on(); }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => { const s = start.current; if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) clear(); },
    onPointerUp: clear, onPointerCancel: clear, onPointerLeave: clear,
    onContextMenu: (e: React.MouseEvent) => { if (start.current || !t.current) e.preventDefault(); },
  };
}

// ───────────── big emoji ─────────────
const PICTO = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{1F3FB}-\u{1F3FF}]|‍|️|⃣|[#*0-9])+$/u;
/** a message that is only 1–3 emoji (no letters, no digits alone) renders big, like WhatsApp */
export function bigEmoji(text: string): boolean {
  const s = (text || '').replace(/\s+/g, '');
  if (!s || s.length > 40 || !PICTO.test(s) || !/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s)) return false;
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (s: string) => Iterable<unknown> } }).Segmenter;
  const n = Seg ? [...new Seg(undefined, { granularity: 'grapheme' }).segment(s)].length : [...s].filter((c) => /\p{Extended_Pictographic}/u.test(c)).length;
  return n >= 1 && n <= 3;
}

// ───────────── emoji picker ─────────────
export const EMOJI_ALL = [
  '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤩', '🥹', '😅', '😭', '😱', '🤯', '🤔', '🙄', '😴', '🤤', '😋', '🥵', '🥶',
  '🙏', '👍', '👌', '👏', '🙌', '💪', '🤝', '✌️', '🫶', '👀', '❤️', '🧡', '💛', '💙', '💜', '🖤', '💯', '🔥', '✨', '🎉',
  '🌅', '🌃', '🌧️', '☀️', '🌴', '🛺', '🚇', '🛵', '🚤', '✈️', '🏮', '🛕', '🏙️', '🌉', '📸', '🎶', '☕', '🧋', '🍜', '🥭',
  '🇹🇭', '🐘', '🐱', '🌸', '💸', '🗺️', '📍', '⏰', '✅', '❌',
];
export const EmojiGrid: React.FC<{ onPick: (e: string) => void }> = ({ onPick }) => (
  <div className="ar-emojis" role="listbox">
    {EMOJI_ALL.map((e) => <button type="button" key={e} role="option" aria-selected={false} onClick={() => onPick(e)}>{e}</button>)}
  </div>
);

// ───────────── photo check (0185 + edge function kr8-ask-photo) ─────────────
export type MediaCheck = 'ok' | 'pending' | 'refused' | null;
export const MediaNote: React.FC<{ L: LFn; check: MediaCheck }> = ({ L, check }) => {
  if (check === 'pending') return <span className="ar-check" data-media-check="pending"><i aria-hidden="true" />{tr(L, 'Checking photo…')}</span>;
  if (check === 'refused') return <span className="ar-check bad" data-media-check="refused">{tr(L, 'Photo not allowed')}</span>;
  return null;
};

// ───────────── live calls ─────────────
const lib = () => import('./v5Live');
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const c = await (await lib()).v5Client();
  const r = await c.rpc(fn, args);
  if (r.error) throw r.error;
  return r.data as T;
}
export const askReact = (answer: string, emoji: React4 | null) => rpc<{ reacts: Reacts; mine: React4 | null }>('kr8_ask_react', { p_answer: answer, p_emoji: emoji });
export const askShareShort = (answer: string) => rpc<string>('kr8_ask_share_link', { p_answer: answer });
/** asks the photo checker; returns the new state ('pending' while AWS is busy, the app asks again on the next open) */
export async function askCheckPhoto(answer: string): Promise<MediaCheck> {
  try {
    const c = await (await lib()).v5Client();
    const { data } = await c.functions.invoke('kr8-ask-photo', { body: { answer } });
    const v = (data as { check?: string } | null)?.check;
    return v === 'ok' || v === 'refused' || v === 'pending' ? v : 'pending';
  } catch { return 'pending'; }
}

// ───────────── the share card ─────────────
export interface CardInput {
  q: string; a: string; name: string; photo: string | null; local: boolean; link: string; size: 'story' | 'post';
  labels: { brand: string; ask: string; local: string; traveller: string; cta: string };
  bg?: string;
}
const FONT = '"RvInter", "Anuphan", "Noto Sans Thai", system-ui, -apple-system, sans-serif';
const loadImg = (src: string) => new Promise<HTMLImageElement | null>((res) => {
  const i = new Image();
  if (!src.startsWith('data:')) i.crossOrigin = 'anonymous';
  const t = setTimeout(() => res(null), 5000);
  i.onload = () => { clearTimeout(t); res(i); };
  i.onerror = () => { clearTimeout(t); res(null); };
  i.src = src;
});
/** splits text into words (Thai has no spaces: Intl.Segmenter word mode, else characters) */
export function words(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
  // split on spaces first, so "5:30," or "BTS-Asok" never break; only Thai runs are cut into words
  const out: string[] = [];
  for (const chunk of text.split(/(\s+)/)) {
    if (Seg && /[\u0E00-\u0E7F]/.test(chunk)) out.push(...[...new Seg('th', { granularity: 'word' }).segment(chunk)].map((s) => s.segment));
    else if (chunk) out.push(chunk);
  }
  return out;
}
/** wraps to maxLines; the last line ends with "…" when text was cut */
export function wrapLines(measure: (s: string) => number, text: string, maxW: number, maxLines: number): string[] {
  const out: string[] = [];
  let line = '';
  const ws = words(text.replace(/\s+/g, ' ').trim());
  let cut = false;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    const next = line + w;
    if (measure(next.trimEnd()) <= maxW || !line.trim()) {
      if (measure(next.trimEnd()) > maxW) {   // one long word: break by characters
        let part = line;
        for (const ch of w) { if (measure(part + ch) > maxW) { out.push(part); part = ''; if (out.length >= maxLines) { cut = true; break; } } part += ch; }
        line = part;
        if (cut) break;
      } else line = next;
    } else {
      out.push(line.trimEnd());
      line = w.trimStart();
      if (out.length >= maxLines) { cut = true; break; }
    }
  }
  if (!cut && line.trim()) { if (out.length < maxLines) out.push(line.trim()); else cut = true; }
  if (cut && out.length) {
    let last = out[out.length - 1].replace(/[\s.,;:!?…]+$/, '');
    while (last && measure(`${last}…`) > maxW) last = last.slice(0, -1).trimEnd();
    out[out.length - 1] = `${last}…`;
  }
  return out;
}
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function cover(g: CanvasRenderingContext2D, im: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / im.width, h / im.height);
  g.drawImage(im, x + (w - im.width * s) / 2, y + (h - im.height * s) / 2, im.width * s, im.height * s);
}

/** draws the card; returns the canvas (exported for the harness / tests) */
export async function drawAnswerCard(p: CardInput): Promise<HTMLCanvasElement> {
  const W = 1080, H = p.size === 'story' ? 1920 : 1350, S = p.size === 'story';
  try { await Promise.all([`800 64px ${FONT}`, `600 40px ${FONT}`, `500 40px ${FONT}`].map((f) => document.fonts?.load(f, 'Aกข'))); } catch { /* system font */ }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  // night base + Bangkok skyline, darkened toward the bottom
  g.fillStyle = '#0B0A16'; g.fillRect(0, 0, W, H);
  const bg = p.bg ? await loadImg(p.bg) : null;
  if (bg) {
    g.save();
    try { g.filter = 'blur(3px) saturate(1.15)'; } catch { /* Safari: no filter */ }
    cover(g, bg, -20, -20, W + 40, (S ? H * 0.62 : H * 0.7) + 40);
    g.restore();
  }
  const sh = g.createLinearGradient(0, 0, 0, H);
  sh.addColorStop(0, 'rgba(9,7,22,.42)'); sh.addColorStop(0.28, 'rgba(9,7,22,.52)'); sh.addColorStop(0.55, 'rgba(9,7,22,.86)'); sh.addColorStop(1, 'rgba(8,6,18,.98)');
  g.fillStyle = sh; g.fillRect(0, 0, W, H);
  const glow = (x: number, y: number, r: number, col: string) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); };
  glow(W * 0.92, H * 0.18, 620, 'rgba(255,79,216,.26)');
  glow(W * 0.04, H * 0.78, 700, 'rgba(91,140,255,.24)');

  const pad = 84;
  const glass = (x: number, y: number, w: number, h: number, r: number, a = 0.1) => {
    rr(g, x, y, w, h, r);
    const gl = g.createLinearGradient(x, y, x, y + h); gl.addColorStop(0, `rgba(255,255,255,${a + 0.04})`); gl.addColorStop(1, `rgba(255,255,255,${a * 0.55})`);
    g.fillStyle = gl; g.fill();
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.18)'; g.stroke();
  };
  // ── top: Kring pill + Ask BKK
  let y = S ? 132 : 86;
  g.textBaseline = 'middle';
  g.font = `700 36px ${FONT}`;
  const brandW = 64 + 26 + g.measureText(p.labels.brand).width + 34;
  glass(pad, y - 44, brandW, 88, 44, 0.12);
  g.lineWidth = 7;
  g.strokeStyle = '#5B8CFF'; g.beginPath(); g.arc(pad + 46, y, 19, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#FF4FD8'; g.beginPath(); g.arc(pad + 72, y, 19, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#fff'; g.fillText(p.labels.brand, pad + 112, y + 1);
  g.font = `800 30px ${FONT}`;
  const askW = g.measureText(p.labels.ask).width + 56;
  rr(g, W - pad - askW, y - 32, askW, 64, 32);
  const ag = g.createLinearGradient(W - pad - askW, 0, W - pad, 0); ag.addColorStop(0, 'rgba(91,140,255,.9)'); ag.addColorStop(1, 'rgba(255,79,216,.9)');
  g.fillStyle = ag; g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(p.labels.ask, W - pad - askW / 2, y + 1); g.textAlign = 'left';

  // ── the question
  const top0 = y + 60;
  const qSize = S ? 78 : 62;
  const qLH = /[\u0E00-\u0E7F]/.test(p.q) ? 1.34 : 1.16;   // Thai marks stack above and below: more room between lines
  g.font = `800 ${qSize}px ${FONT}`;
  g.textBaseline = 'alphabetic';
  const qLines = wrapLines((s) => g.measureText(s).width, p.q, W - pad * 2, S ? 5 : 3);
  // measure the answer first so the whole block sits centred between the top row and the call to action
  {
    const aS = S ? 50 : 42, lh = aS * (/[\u0E00-\u0E7F]/.test(p.a) ? 1.46 : 1.38), ipx = S ? 52 : 44, hh = S ? 132 : 112, gap = S ? 76 : 48, bottom = H - (S ? 330 : 230);
    g.font = `500 ${aS}px ${FONT}`;
    const maxA = Math.max(2, Math.min(S ? 9 : 5, Math.floor((bottom - top0 - qLines.length * qSize * qLH - gap - ipx * 2 - hh - (S ? 30 : 22)) / lh)));
    const nA = wrapLines((s) => g.measureText(s).width, p.a, W - (pad - 12) * 2 - ipx * 2, maxA).length;
    const block = qLines.length * qSize * qLH + gap + ipx * 2 + hh + (S ? 30 : 22) + nA * lh;
    y = top0 + Math.max(0, (bottom - top0 - block) / 2) - (S ? 10 : 0);
    g.font = `800 ${qSize}px ${FONT}`;
  }
  g.fillStyle = '#fff';
  g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 24;
  for (const l of qLines) { y += qSize * qLH; g.fillText(l, pad, y); }
  g.shadowBlur = 0; g.shadowColor = 'transparent';

  // ── the answer, on light glass
  y += S ? 76 : 48;
  const cx = pad - 12, cw = W - (pad - 12) * 2, ip = S ? 52 : 44;
  const aSize = S ? 50 : 42, aLH = aSize * (/[\u0E00-\u0E7F]/.test(p.a) ? 1.46 : 1.38);
  const bottomBlock = S ? 300 : 210;
  const headH = S ? 132 : 112;
  g.font = `500 ${aSize}px ${FONT}`;
  const room = H - bottomBlock - y - ip * 2 - headH - (S ? 30 : 22);
  const aLines = wrapLines((s) => g.measureText(s).width, p.a, cw - ip * 2, Math.max(2, Math.min(S ? 9 : 5, Math.floor(room / aLH))));
  const ch = ip * 2 + headH + (S ? 30 : 22) + aLines.length * aLH;
  glass(cx, y, cw, ch, 48, 0.1);
  // quote mark
  g.font = `800 ${S ? 150 : 120}px Georgia, serif`; g.fillStyle = 'rgba(255,79,216,.55)'; g.textBaseline = 'top';
  g.fillText('“', cx + cw - ip - (S ? 64 : 52), y + ip - (S ? 28 : 22));
  // photo with the blue→pink ring
  const av = S ? 112 : 96, ax = cx + ip, ay = y + ip + (headH - av) / 2;
  const ring = g.createLinearGradient(ax, ay, ax + av, ay + av); ring.addColorStop(0, '#5B8CFF'); ring.addColorStop(1, '#FF4FD8');
  g.beginPath(); g.arc(ax + av / 2, ay + av / 2, av / 2 + 6, 0, Math.PI * 2); g.fillStyle = ring; g.fill();
  const ph = p.photo ? await loadImg(p.photo) : null;
  g.save(); g.beginPath(); g.arc(ax + av / 2, ay + av / 2, av / 2, 0, Math.PI * 2); g.clip();
  if (ph) cover(g, ph, ax, ay, av, av);
  else { g.fillStyle = '#3A3355'; g.fillRect(ax, ay, av, av); g.fillStyle = '#fff'; g.font = `700 ${av * 0.45}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText((p.name || '?').charAt(0).toUpperCase(), ax + av / 2, ay + av / 2 + 2); g.textAlign = 'left'; }
  g.restore();
  // name + badge
  const nx = ax + av + (S ? 34 : 28);
  g.textBaseline = 'alphabetic'; g.fillStyle = '#fff'; g.font = `700 ${S ? 46 : 40}px ${FONT}`;
  const nameLine = wrapLines((s) => g.measureText(s).width, p.name || '', cw - (nx - cx) - ip - 80, 1)[0] || '';
  g.fillText(nameLine, nx, y + ip + headH / 2 - (S ? 6 : 4));
  const badge = p.local ? p.labels.local : p.labels.traveller;
  g.font = `700 ${S ? 27 : 24}px ${FONT}`;
  const bw = g.measureText(badge).width + 40, bh = S ? 46 : 40, by = y + ip + headH / 2 + (S ? 10 : 8);
  rr(g, nx, by, bw, bh, bh / 2);
  g.fillStyle = p.local ? 'rgba(233,196,106,.18)' : 'rgba(255,255,255,.12)'; g.fill();
  g.lineWidth = 1.5; g.strokeStyle = p.local ? 'rgba(233,196,106,.55)' : 'rgba(255,255,255,.25)'; g.stroke();
  g.fillStyle = p.local ? '#F3D98B' : 'rgba(255,255,255,.85)'; g.textBaseline = 'middle'; g.fillText(badge, nx + 20, by + bh / 2 + 1);
  // answer text
  g.textBaseline = 'alphabetic'; g.font = `500 ${aSize}px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.95)';
  let ty = y + ip + headH + (S ? 30 : 22);
  for (const l of aLines) { ty += aLH; g.fillText(l, cx + ip, ty - aLH * 0.26); }

  // ── bottom: CTA + link
  const by2 = H - (S ? 236 : 150);
  g.font = `800 ${S ? 40 : 36}px ${FONT}`;
  const ctaW = g.measureText(p.labels.cta).width + 96, ctaH = S ? 96 : 84;
  rr(g, (W - ctaW) / 2, by2 - ctaH / 2, ctaW, ctaH, ctaH / 2);
  const cg = g.createLinearGradient((W - ctaW) / 2, 0, (W + ctaW) / 2, 0); cg.addColorStop(0, '#5B8CFF'); cg.addColorStop(1, '#FF4FD8');
  g.shadowColor = 'rgba(255,79,216,.45)'; g.shadowBlur = 36; g.fillStyle = cg; g.fill(); g.shadowBlur = 0; g.shadowColor = 'transparent';
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.labels.cta, W / 2, by2 + 2);
  g.font = `600 ${S ? 34 : 30}px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.82)';
  g.fillText(p.link.replace(/^https?:\/\//, '').replace(/\?.*$/, ''), W / 2, by2 + ctaH / 2 + (S ? 62 : 50));
  g.textAlign = 'left';
  return c;
}
export async function answerCardBlob(p: CardInput): Promise<Blob | null> {
  const c = await drawAnswerCard(p);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
}

/** phone share sheet with the picture where it can (Web Share files), else download + copy the link */
export async function shareCardFile(blob: Blob, name: string, link: string, text: string): Promise<'shared' | 'downloaded' | 'cancel'> {
  const file = new File([blob], name, { type: 'image/jpeg' });
  try { await navigator.clipboard?.writeText(link); } catch { /* no clipboard permission */ }
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
    try { await nav.share({ files: [file], text: `${text}\n${link}` }); return 'shared'; } catch (e) { return (e as Error)?.name === 'AbortError' ? 'cancel' : 'downloaded'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}

/** the "Share this answer" sheet: live preview of the card, Story 9:16 / Post 4:5, one Share button */
export const AnswerShareSheet: React.FC<{
  L: LFn; q: { id: string; body: string }; a: { id: string; body: string; by: { name: string; photo: string; local: boolean } };
  getLink: () => Promise<string>; onClose: () => void; toast: (m: string) => void; base: string;
}> = ({ L, q, a, getLink, onClose, toast, base }) => {
  const [size, setSize] = useState<'story' | 'post'>('story');
  const [link, setLink] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const qT = useAskTr('q', q.id, q.body) || q.body;   // the sharer's app language (translated when needed)
  const aT = useAskTr('a', a.id, a.body) || a.body;
  const blobRef = useRef<Blob | null>(null);
  useEffect(() => { let gone = false; getLink().then((l) => { if (!gone) setLink(l); }).catch(() => { if (!gone) toast(tr(L, 'Couldn’t make the card · try again')); }); return () => { gone = true; }; }, [getLink, L, toast]);
  const input = useMemo<CardInput | null>(() => (link ? {
    q: qT, a: aT, name: a.by.name, photo: a.by.photo || null, local: a.by.local, link, size, bg: `${base}media/places/rv4-me-sky.jpg`,
    labels: { brand: 'Kring · กริ๊ง!', ask: tr(L, 'Ask BKK'), local: tr(L, 'BKK Local'), traveller: tr(L, 'Traveller'), cta: tr(L, 'Answer on Kring') },
  } : null), [link, size, qT, aT, a.by, base, L]);
  useEffect(() => {
    if (!input) return;
    let gone = false; let made = '';
    answerCardBlob(input).then((b) => { if (gone || !b) return; blobRef.current = b; made = URL.createObjectURL(b); setUrl(made); });
    return () => { gone = true; if (made) URL.revokeObjectURL(made); };
  }, [input]);
  const share = async () => {
    if (!blobRef.current || busy) return;
    setBusy(true);
    const r = await shareCardFile(blobRef.current, `kring-ask-${size}.jpg`, link, qT);
    setBusy(false);
    if (r === 'downloaded') toast(tr(L, 'Link copied · add it as a link sticker'));
    if (r !== 'cancel') onClose();
  };
  return (
    <div className="at-sheet-bg ar-share-bg" role="presentation" onClick={onClose}>
      <div className="ar-share" role="dialog" aria-label={tr(L, 'Share this answer')} onClick={(e) => e.stopPropagation()}>
        <div className="ar-share-top">
          <b>{tr(L, 'Share this answer')}</b>
          <button type="button" className="ar-x" aria-label={tr(L, 'Close')} onClick={onClose}>×</button>
        </div>
        <div className={`ar-prev ${size}`}>{url ? <img src={url} alt="" data-ask-card={size} /> : <span className="ar-making">{tr(L, 'Making your card…')}</span>}</div>
        <div className="ar-sizes" role="radiogroup">
          {(['story', 'post'] as const).map((s) => (
            <button type="button" key={s} role="radio" aria-checked={size === s} className={size === s ? 'on' : ''} data-card-size={s} onClick={() => setSize(s)}>
              <i className={s} aria-hidden="true" />{tr(L, s === 'story' ? 'Story' : 'Post')}
            </button>
          ))}
        </div>
        <button type="button" className="ar-go" data-ask-share-go="1" disabled={!url || busy} onClick={() => void share()}>{tr(L, 'Share')}</button>
      </div>
    </div>
  );
};
