/**
 * Reel trim step (16 Nov): a picked clip over 60 s (up to ~10 min) opens this screen instead of "too long".
 * Preview loops only the chosen part; a strip of pictures with a draggable 60 s window; the handles shorten it to 5–60 s.
 * "Use this part" hands the window back; only that part is cut and uploaded (prepareReel).
 */
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import './go.css';
import type { ReelInfo } from './v5Reel';
import { clock, initialWindow, loopTarget, moveWindow, msToPct, normalize, pxToMs, setEnd, setStart, thumbTimes, windowMs, type TrimWindow } from './reelTrim';

type Tx = (en: string) => string;
const IcBack = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>;
const IcCut = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M8.6 7.6 20 18M8.6 16.4 20 6" /></svg>;

const THUMBS = 8;

/** A muted <video> that plays only [startMs, endMs) of the file, on a loop (used on the trim screen and the compose preview). */
export function WindowVideo(props: { src: string; win?: TrimWindow; paused?: boolean; at?: number; poster?: string; className?: string; id?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const { win } = props;
  useEffect(() => {
    const v = ref.current;
    if (!v || !win) return;
    let raf = 0;
    const tick = () => {
      const t = loopTarget(v.currentTime * 1000, win);
      if (t !== null && !props.paused) { try { v.currentTime = t / 1000; } catch { /* not seekable yet */ } }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [win?.startMs, win?.endMs, props.paused]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (props.paused) { v.pause(); if (props.at !== undefined) { try { v.currentTime = props.at / 1000; } catch { /* ignore */ } } }
    else { try { void Promise.resolve(v.play()).catch(() => undefined); } catch { /* jsdom / old WebView */ } }
  }, [props.paused, props.at]);
  return <video ref={ref} id={props.id} className={props.className} src={props.src} poster={props.poster} muted playsInline autoPlay loop={!win} preload="auto"
    onLoadedMetadata={(e) => { if (win) { try { e.currentTarget.currentTime = win.startMs / 1000; } catch { /* ignore */ } } }} />;
}

/** Strip pictures: <video> frames first (seek + draw), WebCodecs for clips the <video> cannot draw. Object URLs, '' = none. */
async function stripThumbs(info: ReelInfo, fullMs: number, dead: () => boolean): Promise<string[]> {
  const times = thumbTimes(fullMs, THUMBS);
  const out = times.map(() => '');
  if (info.decodable !== false && typeof document !== 'undefined') {
    try {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = info.url;
      await new Promise<void>((ok, bad) => { v.onloadeddata = () => ok(); v.onerror = () => bad(new Error('x')); setTimeout(() => bad(new Error('t')), 8000); });
      const c = document.createElement('canvas'); c.width = 72; c.height = 128;
      const ctx = c.getContext('2d');
      for (let i = 0; i < times.length && ctx && !dead(); i++) {
        await new Promise<void>((r) => { v.onseeked = () => r(); v.currentTime = times[i] / 1000; setTimeout(r, 2500); });
        if (v.readyState < 2) continue;
        const s = Math.max(c.width / v.videoWidth, c.height / v.videoHeight);
        ctx.drawImage(v, (c.width - v.videoWidth * s) / 2, (c.height - v.videoHeight * s) / 2, v.videoWidth * s, v.videoHeight * s);
        const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.6));
        if (b) out[i] = URL.createObjectURL(b);
      }
      v.removeAttribute('src'); try { v.load(); } catch { /* ignore */ }
    } catch { /* WebCodecs below */ }
  }
  if (!dead() && out.every((u) => !u)) {
    const got = await import('./reelTranscode').then((m) => m.thumbsOf(info.file, times, 72, 128)).catch(() => []);
    got.forEach((b, i) => { if (b) out[i] = URL.createObjectURL(b); });
  }
  return out;
}

type Drag = { mode: 'move' | 'start' | 'end'; x: number; w: TrimWindow } | null;

export function GoTrim(props: { L: Tx; lang: string; reel: ReelInfo; poster?: string; onUse: (w: TrimWindow) => void; onBack: () => void }) {
  const { L, reel } = props;
  const fullMs = reel.fullMs ?? reel.durationMs;
  const [win, setWin] = useState<TrimWindow>(() => normalize(reel.trim ?? initialWindow(fullMs), fullMs));
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [drag, setDrag] = useState<Drag>(null);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dead = false;
    let made: string[] = [];
    void stripThumbs(reel, fullMs, () => dead).then((u) => { made = u; if (dead) u.forEach((x) => x && URL.revokeObjectURL(x)); else setThumbs(u); });
    return () => { dead = true; made.forEach((x) => x && URL.revokeObjectURL(x)); };
  }, [reel.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const down = (mode: 'move' | 'start' | 'end') => (e: RPointerEvent<HTMLElement>) => {
    e.preventDefault(); e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* old WebView */ }
    setDrag({ mode, x: e.clientX, w: win });
  };
  const move = (e: RPointerEvent<HTMLElement>) => {
    if (!drag || !strip.current) return;
    const d = pxToMs(e.clientX - drag.x, strip.current.getBoundingClientRect().width, fullMs);
    setWin(drag.mode === 'move' ? moveWindow(drag.w, d, fullMs) : drag.mode === 'start' ? setStart(drag.w, drag.w.startMs + d, fullMs) : setEnd(drag.w, drag.w.endMs + d, fullMs));
  };
  const up = () => setDrag(null);
  // keyboard: arrows nudge a handle / the window by 1 s
  const key = (mode: 'move' | 'start' | 'end') => (e: React.KeyboardEvent) => {
    const d = e.key === 'ArrowLeft' ? -1000 : e.key === 'ArrowRight' ? 1000 : 0;
    if (!d) return;
    e.preventDefault();
    setWin((w) => (mode === 'move' ? moveWindow(w, d, fullMs) : mode === 'start' ? setStart(w, w.startMs + d, fullMs) : setEnd(w, w.endMs + d, fullMs)));
  };
  const l = msToPct(win.startMs, fullMs), r = 100 - msToPct(win.endMs, fullMs);
  const at = drag ? (drag.mode === 'end' ? win.endMs - 100 : win.startMs) : undefined;
  return (
    <div className="go-page go-compose go-trim" id="goTrim" data-step="trim">
      <div className="go-hdr">
        <button type="button" className="go-bk" id="goTrimBack" aria-label={L('Back')} onClick={props.onBack}><IcBack /></button>
        <h1>{L('Trim your clip')}</h1>
        <span className="go-steps"><i className="on" /><i /></span>
      </div>
      <div className="go-tprev">
        <WindowVideo id="goTrimVideo" src={reel.url} win={win} paused={!!drag} at={at} poster={props.poster || undefined} />
        <span className="go-tlen" id="goTrimLen"><b>{clock(windowMs(win))}</b> / {clock(fullMs)}</span>
      </div>
      <div className="go-tstrip" id="goTrimStrip" ref={strip} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="go-tthumbs">{Array.from({ length: THUMBS }, (_, i) => <i key={i} style={thumbs[i] ? { backgroundImage: `url('${thumbs[i]}')` } : undefined} />)}</div>
        <div className="go-tdim" style={{ left: 0, width: `${l}%` }} />
        <div className="go-tdim" style={{ right: 0, width: `${r}%` }} />
        <div className={`go-twin${drag ? ' drag' : ''}`} id="goTrimWindow" style={{ left: `${l}%`, right: `${r}%` }} role="slider" tabIndex={0}
          aria-valuemin={0} aria-valuemax={Math.round(fullMs / 1000)} aria-valuenow={Math.round(win.startMs / 1000)} aria-valuetext={`${clock(win.startMs)}–${clock(win.endMs)}`}
          aria-label={L('Trim your clip')} onPointerDown={down('move')} onKeyDown={key('move')}>
          <span className="go-th s" id="goTrimStart" role="slider" tabIndex={0} aria-label={L('Start of the part')} aria-valuenow={Math.round(win.startMs / 1000)}
            onPointerDown={down('start')} onKeyDown={key('start')}><i /></span>
          <span className="go-th e" id="goTrimEnd" role="slider" tabIndex={0} aria-label={L('End of the part')} aria-valuenow={Math.round(win.endMs / 1000)}
            onPointerDown={down('end')} onKeyDown={key('end')}><i /></span>
        </div>
      </div>
      <div className="go-tmarks"><span>{clock(win.startMs)}</span><small>{L('Drag to pick up to 60 s')}</small><span>{clock(win.endMs)}</span></div>
      <div className="go-foot"><button type="button" className="go-btn" id="goTrimUse" onClick={() => props.onUse(normalize(win, fullMs))}><IcCut />{L('Use this part')}</button></div>
    </div>
  );
}
