/**
 * Week-close celebration (founder 22 Nov, v2 "premium"): Bangkok night skyline, real firework physics (rockets rise from
 * the skyline, gold/champagne bursts with trails + glitter), a gold Kring-rings seal to tap (unlocks sound), then the reveal:
 * photo in a gold laurel, rank, "Champion of the week". Winners → "Claim my prize" (existing claim flow) + "Share to my story"
 * (story image, no baht). Everyone else (first open after the close): fireworks + this week's Top 3.
 * One language at a time; sound synthesised in celebrateSound.ts; reduced-motion respected.
 */
import { useEffect, useRef, useState } from 'react';
import './celebrate.css';
import { bell, boom, fanfare, isMuted, setMuted, sparkle, unlockAudio, whoosh } from './celebrateSound';

export interface CelebTop { rank: number; name: string; photo: string | null; rings: number }
export interface CelebProps {
  lang: string;
  mode: 'winner' | 'all';
  week: string;
  rank?: number | null;
  rings?: number | null;
  name?: string;
  photo?: string | null;
  top3?: CelebTop[];
  inviteCode?: string;
  shareLink?: string;
  onPrize?: () => void;
  onShare?: (blob: Blob | null) => void;
  onClose: () => void;
}

const GOLD = '#ffd36b'; const PINK = '#ff6be1'; const BLUE = '#6f8cff';
const PALETTES = [['#ffe7a3', '#ffd36b', '#ffb347'], ['#ffffff', '#fff3c4', '#ffd36b'], ['#ffd36b', '#ff6be1', '#fff3c4'], ['#ffd36b', '#6f8cff', '#ffffff']];
const SKY = () => `${(import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/app/'}media/board/skyline.jpg`;
const th = (lang: string) => lang === 'th';
const T = (lang: string, t: string, e: string) => (th(lang) ? t : e);
const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

function weekText(lang: string, wk: string): string {
  try {
    const d = new Date(`${wk}T00:00:00+07:00`); const e = new Date(d.getTime() + 6 * 864e5);
    const f = (x: Date) => x.toLocaleDateString(th(lang) ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
    return `${f(d)} – ${f(e)}`;
  } catch { return wk; }
}

/* ---------- firework engine (canvas, additive light, trails) ---------- */
interface P { x: number; y: number; px: number; py: number; vx: number; vy: number; a: number; da: number; c: string; w: number; glitter: boolean; rocket?: { ty: number; pal: string[] } }
class Fx {
  cv: HTMLCanvasElement; g: CanvasRenderingContext2D; ps: P[] = []; raf = 0; w = 0; h = 0; dpr = 1;
  constructor(cv: HTMLCanvasElement) {
    this.cv = cv; this.g = cv.getContext('2d')!; this.resize();
    const loop = () => { this.step(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  resize() { this.dpr = Math.min(2, window.devicePixelRatio || 1); this.w = this.cv.clientWidth; this.h = this.cv.clientHeight; this.cv.width = this.w * this.dpr; this.cv.height = this.h * this.dpr; }
  stop() { cancelAnimationFrame(this.raf); this.ps = []; }
  launch(xr = 0.18 + Math.random() * 0.64, tyr = 0.12 + Math.random() * 0.26, pal = PALETTES[Math.floor(Math.random() * PALETTES.length)]) {
    const x = xr * this.w, y = this.h * 0.8;
    this.ps.push({ x, y, px: x, py: y, vx: (Math.random() - 0.5) * 0.8, vy: -(this.h * 0.0135 + Math.random() * 2), a: 1, da: 0, c: '#fff3c4', w: 2.2, glitter: false, rocket: { ty: tyr * this.h, pal } });
    whoosh(0, 0.6, 0.16);
  }
  burst(x: number, y: number, pal: string[]) {
    const n = reduced() ? 50 : 150; const sp = 3.2 + Math.random() * 1.8;
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.05; const s = sp * (0.55 + Math.random() * 0.5);
      this.ps.push({ x, y, px: x, py: y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, a: 1, da: 0.008 + Math.random() * 0.008, c: pal[i % pal.length], w: 1.6 + Math.random(), glitter: Math.random() < 0.35 });
    }
    this.ps.push({ x, y, px: x, py: y, vx: 0, vy: 0, a: 1, da: 0.08, c: '#ffffff', w: 26, glitter: false });
    boom(0, 0.45);
  }
  step() {
    const g = this.g; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, this.w, this.h);
    g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    const next: P[] = [];
    for (const p of this.ps) {
      p.px = p.x; p.py = p.y;
      if (p.rocket) {
        p.x += p.vx; p.y += p.vy; p.vy *= 0.985;
        if (p.y <= p.rocket.ty || p.vy > -1.2) { this.burst(p.x, p.y, p.rocket.pal); continue; }
      } else { p.vx *= 0.975; p.vy = p.vy * 0.975 + 0.045; p.x += p.vx; p.y += p.vy; p.a -= p.da; }
      if (p.a <= 0) continue;
      const flick = p.glitter && p.a < 0.6 ? (Math.random() < 0.5 ? 0.2 : 1) : 1;
      if (p.w > 20) {
        const rg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.w * 2); rg.addColorStop(0, `rgba(255,250,230,${p.a})`); rg.addColorStop(1, 'rgba(255,220,150,0)');
        g.fillStyle = rg; g.fillRect(p.x - p.w * 2, p.y - p.w * 2, p.w * 4, p.w * 4);
      } else {
        g.strokeStyle = p.c; g.globalAlpha = Math.max(0, p.a) * flick; g.lineWidth = p.w;
        g.beginPath(); g.moveTo(p.px - p.vx * 3, p.py - p.vy * 3); g.lineTo(p.x, p.y); g.stroke(); g.globalAlpha = 1;
      }
      next.push(p);
    }
    this.ps = next;
  }
}

/* ---------- pieces ---------- */
export function KringRings({ size = 140, gold = false, className = '' }: { size?: number; gold?: boolean; className?: string }) {
  return (
    <svg className={`cb-rings ${className}`} width={size} height={size * 0.62} viewBox="0 0 200 124" aria-hidden="true">
      <defs>
        <linearGradient id="cbGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff3c4" /><stop offset=".45" stopColor="#ffd36b" /><stop offset="1" stopColor="#c98a2b" /></linearGradient>
        <filter id="cbGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <circle className="r1" cx="72" cy="62" r="46" fill="none" stroke={gold ? 'url(#cbGold)' : BLUE} strokeWidth="11" filter="url(#cbGlow)" />
      <circle className="r2" cx="128" cy="62" r="46" fill="none" stroke={gold ? 'url(#cbGold)' : PINK} strokeWidth="11" filter="url(#cbGlow)" />
    </svg>
  );
}

/** Gold laurel wreath (two leafy arcs) around the winner's photo. */
function Laurel({ size }: { size: number }) {
  const leaves: JSX.Element[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const t = 0.18 + i * 0.085; const ang = Math.PI / 2 + side * (Math.PI * t * 1.05);
      const cx = 100 + Math.cos(ang) * 84, cy = 100 + Math.sin(ang) * 84;
      const rot = (ang * 180) / Math.PI + (side > 0 ? -60 : 60) + 90;
      leaves.push(<ellipse key={`${side}${i}`} cx={cx} cy={cy} rx="7" ry="16" transform={`rotate(${rot} ${cx} ${cy})`} fill="url(#cbLeaf)" />);
    }
  }
  return (
    <svg className="cb-laurel" width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <defs><linearGradient id="cbLeaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff3c4" /><stop offset=".5" stopColor="#ffd36b" /><stop offset="1" stopColor="#b9781f" /></linearGradient></defs>
      {leaves}
    </svg>
  );
}

function Avatar({ photo, name, size, laurel }: { photo: string | null | undefined; name: string; size: number; laurel?: boolean }) {
  const box = size * (laurel ? 1.5 : 1);
  return (
    <div className={`cb-avw${laurel ? ' laurel' : ''}`} style={{ width: box, height: box }}>
      {laurel ? <Laurel size={box} /> : null}
      <div className={`cb-av${laurel ? ' gold' : ''}`} style={{ width: size, height: size }}>
        {photo ? <img src={photo} alt="" /> : <span>{(name || '?').slice(0, 1).toUpperCase()}</span>}
      </div>
    </div>
  );
}

function TickUp({ to, dur = 1500 }: { to: number; dur?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const p = Math.min(1, (t - t0) / dur); setV(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, dur]);
  return <>{v.toLocaleString('en-US')}</>;
}

const loadImg = (src: string | null | undefined) => new Promise<HTMLImageElement | null>((res) => {
  if (!src) { res(null); return; }
  const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src;
});

/** Share story 1080×1920: skyline, gold light, laurel + photo, rank. Never baht. */
export async function winStory(o: { lang: string; week: string; rank: number; rings: number; name: string; photo: string | null; code?: string }): Promise<Blob | null> {
  try {
    const W = 1080, H = 1920; const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); if (!g) return null;
    g.fillStyle = '#07060d'; g.fillRect(0, 0, W, H);
    const sky = await loadImg(SKY());
    if (sky) { const s = Math.max(W / sky.width, (H * 0.6) / sky.height); const iw = sky.width * s, ih = sky.height * s; g.drawImage(sky, (W - iw) / 2, H - ih, iw, ih); }
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#07060d'); gr.addColorStop(0.42, 'rgba(12,8,24,.95)'); gr.addColorStop(0.72, 'rgba(12,8,24,.45)'); gr.addColorStop(1, 'rgba(7,6,13,.88)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W / 2, 700, 10, W / 2, 700, 620); glow.addColorStop(0, 'rgba(255,211,107,.4)'); glow.addColorStop(1, 'rgba(255,211,107,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    const spark = (cx: number, cy: number, r: number, col: string) => {
      for (let i = 0; i < 64; i++) { const a = (Math.PI * 2 * i) / 64; const l = r * (0.6 + Math.random() * 0.4); g.strokeStyle = col; g.globalAlpha = 0.25 + Math.random() * 0.5; g.lineWidth = 3;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * l * 0.55, cy + Math.sin(a) * l * 0.55); g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); g.stroke(); }
    };
    spark(210, 300, 170, GOLD); spark(880, 430, 150, '#fff3c4'); spark(870, 1090, 110, PINK); spark(190, 1050, 90, '#fff3c4');
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const ring = (cx: number) => { g.save(); g.shadowColor = GOLD; g.shadowBlur = 24; g.strokeStyle = GOLD; g.lineWidth = 12; g.beginPath(); g.arc(cx, 230, 44, 0, Math.PI * 2); g.stroke(); g.restore(); };
    ring(W / 2 - 27); ring(W / 2 + 27);
    const font = (w: number, s: number) => `${w} ${s}px "Unbounded","Noto Sans Thai","Anuphan",sans-serif`;
    g.textAlign = 'center'; g.fillStyle = 'rgba(255,211,107,.9)'; g.font = font(600, 30);
    g.fillText(T(o.lang, `ผลประจำสัปดาห์ · ${weekText(o.lang, o.week)}`, `WEEK OF ${weekText(o.lang, o.week).toUpperCase()}`), W / 2, 340);
    const cy = 700, R = 175;
    for (const side of [-1, 1]) for (let i = 0; i < 11; i++) {
      const t = 0.16 + i * 0.072; const ang = Math.PI / 2 + side * (Math.PI * t * 1.05);
      const x = W / 2 + Math.cos(ang) * (R + 70), y = cy + Math.sin(ang) * (R + 70);
      g.save(); g.translate(x, y); g.rotate(ang + (side > 0 ? -1.05 : 1.05) + Math.PI / 2);
      const lg = g.createLinearGradient(-12, -30, 12, 30); lg.addColorStop(0, '#fff3c4'); lg.addColorStop(0.5, GOLD); lg.addColorStop(1, '#b9781f');
      g.fillStyle = lg; g.beginPath(); g.ellipse(0, 0, 13, 32, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
    g.save(); g.shadowColor = GOLD; g.shadowBlur = 50; g.strokeStyle = GOLD; g.lineWidth = 10; g.beginPath(); g.arc(W / 2, cy, R + 8, 0, Math.PI * 2); g.stroke(); g.restore();
    g.save(); g.beginPath(); g.arc(W / 2, cy, R, 0, Math.PI * 2); g.clip(); g.fillStyle = '#2a1640'; g.fillRect(0, 0, W, H);
    const im = await loadImg(o.photo);
    if (im) { const s = Math.max((2 * R) / im.width, (2 * R) / im.height); g.drawImage(im, W / 2 - (im.width * s) / 2, cy - (im.height * s) / 2, im.width * s, im.height * s); }
    g.restore();
    const rg = g.createLinearGradient(0, 1000, 0, 1180); rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.55, GOLD); rg.addColorStop(1, '#ff9f43');
    g.fillStyle = rg; g.font = font(800, 170); g.shadowColor = 'rgba(255,107,225,.45)'; g.shadowBlur = 40;
    g.fillText(`#${o.rank}`, W / 2, 1170); g.shadowBlur = 0;
    g.fillStyle = GOLD; g.font = font(700, 46);
    g.fillText(o.rank === 1 ? T(o.lang, 'แชมป์ประจำสัปดาห์', 'CHAMPION OF THE WEEK') : T(o.lang, `ท็อป ${o.rank} ประจำสัปดาห์`, `TOP ${o.rank} OF THE WEEK`), W / 2, 1255);
    g.fillStyle = '#fff'; g.font = font(700, 60); g.fillText(o.name || 'Kring Local', W / 2, 1350);
    g.fillStyle = 'rgba(255,255,255,.78)'; g.font = font(500, 36);
    g.fillText(T(o.lang, `${o.rings.toLocaleString('en-US')} ริง · Kring Local กรุงเทพฯ`, `${o.rings.toLocaleString('en-US')} Rings · Bangkok Kring Local`), W / 2, 1410);
    g.fillStyle = '#fff'; g.font = font(800, 44); g.fillText('kringapp.com', W / 2, 1700);
    if (o.code) { g.fillStyle = 'rgba(255,255,255,.75)'; g.font = font(500, 32); g.fillText(T(o.lang, `มาเล่นด้วยกัน · โค้ด ${o.code}`, `Join me · code ${o.code}`), W / 2, 1752); }
    return await new Promise<Blob | null>((res) => cv.toBlob((b) => res(b), 'image/png'));
  } catch { return null; }
}

/* ---------- the moment ---------- */
export function Celebrate(p: CelebProps) {
  const { lang } = p;
  const [stage, setStage] = useState<'seal' | 'ignite' | 'reveal'>('seal');
  const [mute, setMute] = useState(isMuted());
  const cvRef = useRef<HTMLCanvasElement>(null);
  const fx = useRef<Fx | null>(null);
  const timers = useRef<number[]>([]);
  const winner = p.mode === 'winner' && !!p.rank;
  const story = useRef<Promise<Blob | null> | null>(null);

  useEffect(() => {
    const on = () => fx.current?.resize();
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('resize', on); timers.current.forEach((t) => window.clearTimeout(t)); fx.current?.stop(); };
  }, []);
  const later = (ms: number, f: () => void) => { timers.current.push(window.setTimeout(f, ms)); };
  const show = (n: number, gap: number, from = 0) => { for (let i = 0; i < n; i++) later(from + i * gap + Math.random() * 180, () => fx.current?.launch()); };

  const open = () => {
    if (stage !== 'seal') return;
    unlockAudio();
    if (cvRef.current && !fx.current) fx.current = new Fx(cvRef.current);
    setStage('ignite');
    bell(0.02, 660, 0.55);
    show(reduced() ? 1 : 3, 260, 350);
    later(1500, () => {
      setStage('reveal');
      if (winner) { fanfare(0.05); bell(0.3, 990, 0.25); }
      show(reduced() ? 2 : 7, 520, 200);
      later(5200, () => show(reduced() ? 1 : 4, 900));
    });
    if (winner && p.rank) story.current = winStory({ lang, week: p.week, rank: p.rank, rings: p.rings || 0, name: p.name || '', photo: p.photo || null, code: p.inviteCode });
  };
  const toggleMute = () => { const m = !mute; setMute(m); setMuted(m); };
  const share = async () => { sparkle(); const b = story.current ? await story.current : null; p.onShare?.(b); };
  const cap = T(lang, `ผลประจำสัปดาห์ · ${weekText(lang, p.week)}`, `WEEK OF ${weekText(lang, p.week).toUpperCase()} · FINAL`);

  return (
    <div className={`cb-wrap st-${stage}${winner ? ' win' : ''}`} id="kxCelebrate" role="dialog" aria-modal="true">
      <div className="cb-sky" style={{ backgroundImage: `url(${SKY()})` }} />
      <div className="cb-shade" />
      <div className="cb-glow" />
      <canvas ref={cvRef} className="cb-fx" />
      <button type="button" className="cb-mute" aria-label={mute ? 'sound on' : 'mute'} onClick={toggleMute}>{mute ? '🔇' : '🔊'}</button>
      {stage === 'reveal' ? <button type="button" className="cb-x" aria-label={T(lang, 'ปิด', 'Close')} onClick={p.onClose}>✕</button> : null}

      {stage !== 'reveal' && (
        <button type="button" className="cb-seal" id="kxCelebGift" onClick={open} aria-label={T(lang, 'แตะเพื่อเปิด', 'Tap to reveal')}>
          <span className="cb-seal-ring"><KringRings size={150} gold /></span>
          <span className="cb-seal-cap">{cap}</span>
          <span className="cb-seal-t">{winner ? T(lang, 'ผลของคุณมาแล้ว', 'Your result is in') : T(lang, 'ประกาศผู้ชนะประจำสัปดาห์', 'This week’s winners')}</span>
          <span className="cb-seal-s">{T(lang, 'แตะเพื่อเปิด', 'Tap to reveal')}</span>
        </button>
      )}

      {stage === 'reveal' && winner && (
        <div className="cb-reveal" id="kxCelebWin" data-rank={p.rank}>
          <p className="cb-cap">{cap}</p>
          <Avatar photo={p.photo} name={p.name || ''} size={128} laurel />
          <h1 className="cb-rank">#{p.rank}</h1>
          <h2 className="cb-title">{p.rank === 1 ? T(lang, 'แชมป์ประจำสัปดาห์', 'Champion of the week') : T(lang, `ท็อป ${p.rank} ประจำสัปดาห์`, `Top ${p.rank} of the week`)}</h2>
          <p className="cb-sub"><b><TickUp to={p.rings || 0} /></b> {T(lang, 'ริง', 'Rings')}<span className="dot">·</span>{p.name}</p>
          <div className="cb-acts">
            <button type="button" className="cb-btn gold" id="kxCelebPrize" onClick={() => { sparkle(); p.onPrize?.(); }}>{T(lang, 'รับรางวัลของฉัน', 'Claim my prize')}</button>
            <button type="button" className="cb-btn glass" id="kxCelebShare" onClick={() => void share()}>{T(lang, 'แชร์ลงสตอรี่', 'Share to my story')}</button>
          </div>
        </div>
      )}

      {stage === 'reveal' && !winner && (
        <div className="cb-reveal all" id="kxCelebAll">
          <p className="cb-cap">{cap}</p>
          <h2 className="cb-title big">{T(lang, 'ยินดีกับผู้ชนะประจำสัปดาห์', 'Congratulations to this week’s winners')}</h2>
          <div className="cb-podium">
            {[2, 1, 3].map((rk) => { const x = (p.top3 || []).find((t) => t.rank === rk); if (!x) return <div key={rk} className="cb-pod empty" />; return (
              <div key={rk} className={`cb-pod p${rk}`}>
                <Avatar photo={x.photo} name={x.name} size={rk === 1 ? 92 : 68} laurel={rk === 1} />
                <span className="cb-pr">#{rk}</span>
                <b>{x.name}</b><small>{x.rings.toLocaleString('en-US')} {T(lang, 'ริง', 'Rings')}</small>
              </div>
            ); })}
          </div>
          <p className="cb-sub">{T(lang, 'สัปดาห์ใหม่เริ่มแล้ว ครั้งหน้าอาจเป็นคุณ', 'A new week has started. Next time it could be you.')}</p>
          <div className="cb-acts"><button type="button" className="cb-btn" id="kxCelebGo" onClick={p.onClose}>{T(lang, 'ไปกันเลย', 'Let’s go')}</button></div>
        </div>
      )}
    </div>
  );
}

/** After a claim: gold rings stream down to the Me tab + "Sent to your Rewards". */
export function RingFly({ lang, onEnd }: { lang: string; onEnd?: () => void }) {
  useEffect(() => { unlockAudio(); sparkle(0.05); const t = window.setTimeout(() => onEnd?.(), 2300); return () => window.clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="cb-fly" id="kxRingFly" aria-live="polite">
      {Array.from({ length: 6 }, (_, i) => <span key={i} className="cb-fly-r" style={{ animationDelay: `${i * 0.09}s`, left: `${40 + (i % 3) * 7}%` }}><KringRings size={42} gold /></span>)}
      <span className="cb-fly-t">{T(lang, 'ส่งเข้าหน้ารางวัลแล้ว ✓', 'Sent to your Rewards ✓')}</span>
    </div>
  );
}
