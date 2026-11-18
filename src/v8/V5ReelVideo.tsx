/* Full-screen vertical Reel in the feed: poster first, plays muted + looped only while on screen, tap for sound. */
import { useEffect, useRef, useState } from 'react';
import { rememberSound, soundHintWanted, soundWanted, SOUND_PREF_EVENT } from './reelSound';

/** 16 Nov perf: the Reel next in line may only start downloading once the one on screen is actually playing. */
let somethingPlaying = false;
const PLAYING_EVENT = 'kr8-reel-playing';

/** 17 Nov (T-310): while the face check is open, every Reel behind it stops and drops its video (no media requests: some
 *  phone browsers turned a failed Reel download into a "Download failed" toast, and the playing feed slowed the camera).
 *  A ?open=verify link holds the Reels from the very first paint, until the face check closes. */
let held = typeof location !== 'undefined' && /[?&]open=verify(&|$)/.test(location.search || '');
const HOLD_EVENT = 'kr8-reel-hold';
export function holdReels(on: boolean) {
  if (held === on) return;
  held = on;
  try { window.dispatchEvent(new Event(HOLD_EVENT)); } catch { /* ignore */ }
}
export const reelsHeld = () => held;

/** K-006 (18 Nov): no Reel video downloads before the first screen is painted. The first Reel shows its poster at once; its
 *  MP4 (often 1+ MB) only starts after that poster has loaded (or 4 s at most), so on a slow phone the video no longer fights
 *  the poster, the app code and the first data calls for the network. Every later Reel already waits for one to be playing. */
let mediaOk = typeof window === 'undefined';
const MEDIA_EVENT = 'kr8-reel-media-ok';
function openMedia() {
  if (mediaOk) return;
  mediaOk = true;
  try { window.dispatchEvent(new Event(MEDIA_EVENT)); } catch { /* ignore */ }
}
let mediaGateStarted = false;
function startMediaGate(poster?: string) {
  if (mediaOk || mediaGateStarted) return;
  mediaGateStarted = true;
  const fallback = window.setTimeout(openMedia, 4000);
  const after = () => { window.clearTimeout(fallback); requestAnimationFrame(() => requestAnimationFrame(openMedia)); };
  if (!poster || typeof Image === 'undefined') { after(); return; }
  const img = new Image();
  img.onload = after;
  img.onerror = after;
  img.src = poster;
  if (img.complete && img.naturalWidth) after();
}
/** test helper */
export function _resetReelMediaGate(open = false) { mediaOk = open; mediaGateStarted = false; }

/** Tap anywhere on a Reel slide (except its buttons) toggles sound for this and every later Reel. */
export function toggleReelSound(e: { target: EventTarget | null; currentTarget: EventTarget | null }) {
  const t = e.target as HTMLElement | null;
  if (!t || t.closest('button, a, input, textarea, select')) return;
  const v = (e.currentTarget as HTMLElement | null)?.querySelector('video[data-reel]') as HTMLVideoElement | null;
  if (!v) return;
  const on = v.muted;   // one tap turns sound on for every Reel after it (like the big apps); 17 Nov: remembered across refreshes
  v.muted = !on;
  rememberSound(on);
  v.dispatchEvent(new Event('kr8-sound'));
  if (v.paused) void v.play().catch(() => undefined);
}

export function V5ReelVideo({ src, poster, label, pending, onViewed, first, soundHint }: { src: string; poster?: string; label: string; pending?: string; onViewed?: () => void; first?: boolean; soundHint?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const viewedRef = useRef(false);
  const onViewedRef = useRef(onViewed);
  onViewedRef.current = onViewed;
  const [muted, setMuted] = useState(() => !soundWanted());
  // 17 Nov: "Tap for sound" stays on the badge until the member taps once (any Reel)
  const [hint, setHint] = useState(soundHintWanted);
  useEffect(() => {
    const off = () => setHint(soundHintWanted());
    window.addEventListener(SOUND_PREF_EVENT, off);
    return () => window.removeEventListener(SOUND_PREF_EVENT, off);
  }, []);
  // M (15 Nov): only the Reel on screen and the one next to it load their video; the rest show their poster and download nothing
  const boxRef = useRef<HTMLDivElement>(null);
  const [nearRaw, setNear] = useState(!!first);   // the first Reel shows its poster on the very first paint (no dark frame)
  const [hold, setHold] = useState(held);
  useEffect(() => {
    const on = () => setHold(held);
    window.addEventListener(HOLD_EVENT, on);
    return () => window.removeEventListener(HOLD_EVENT, on);
  }, []);
  const [media, setMedia] = useState(mediaOk);
  useEffect(() => {
    if (media) return;
    const on = () => setMedia(true);
    window.addEventListener(MEDIA_EVENT, on);
    if (mediaOk) setMedia(true);
    return () => window.removeEventListener(MEDIA_EVENT, on);
  }, [media]);
  const show = nearRaw && !hold;   // poster (and the stage background) as before
  const near = show && media;      // the video itself only once the first screen is painted
  useEffect(() => { if (show && !mediaOk) startMediaGate(poster); }, [show]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [onScreen, setOnScreen] = useState(false);
  const [mayPrefetch, setMayPrefetch] = useState(somethingPlaying);
  useEffect(() => {
    if (mayPrefetch) return;
    const go = () => setMayPrefetch(true);
    window.addEventListener(PLAYING_EVENT, go);
    return () => window.removeEventListener(PLAYING_EVENT, go);
  }, [mayPrefetch]);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '100% 0px 100% 0px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const v = ref.current;
    if (!v || near) return;
    if (v.getAttribute('src')) { v.pause(); v.removeAttribute('src'); try { v.load(); } catch { /* jsdom */ } }   // far away again: stop buffering
  }, [near]);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(
      ([e]) => {
        setOnScreen(e.isIntersecting && e.intersectionRatio >= 0.6);
        if (e.isIntersecting && e.intersectionRatio >= 0.6 && !held) {
          v.muted = !soundWanted();
          setMuted(v.muted);
          void v.play().catch(() => { v.muted = true; setMuted(true); void v.play().catch(() => undefined); });
        } else {
          v.pause();
        }
      },
      { threshold: [0, 0.6] },
    );
    io.observe(v);
    const onSound = () => setMuted(v.muted);
    // a view = 3 seconds actually played on screen (counted once per Reel per day on the server)
    let played = 0; let last = -1;
    const onTime = () => {
      // 16 Nov (founder): a thin progress line at the bottom of the Reel, always above the tab bar
      const bar = barRef.current;
      if (bar && v.duration > 0 && Number.isFinite(v.duration)) bar.style.transform = `scaleX(${Math.min(1, v.currentTime / v.duration)})`;
      if (viewedRef.current) return;
      const t = v.currentTime;
      if (last >= 0 && t > last && t - last < 1) played += t - last;
      last = t;
      if (played >= 3) { viewedRef.current = true; onViewedRef.current?.(); }
    };
    const onPlaying = () => { if (!somethingPlaying) { somethingPlaying = true; window.dispatchEvent(new Event(PLAYING_EVENT)); } };
    v.addEventListener('kr8-sound', onSound);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('playing', onPlaying);
    return () => { io.disconnect(); v.removeEventListener('kr8-sound', onSound); v.removeEventListener('timeupdate', onTime); v.removeEventListener('playing', onPlaying); };
  }, [src, near]);
  return (
    // 17 Nov (K-003): the poster is also the stage's background, so iPhone Safari never shows a blank dark Reel before the first frame
    <div className="bg reel-bg" ref={boxRef} style={show && poster ? { backgroundImage: `url('${poster}')` } : undefined}>
      <video
        ref={ref}
        className="reel-video"
        src={near ? src : undefined}
        poster={show ? poster : undefined}
        muted
        loop
        playsInline
        // on screen: load and play; the next one: only its first bytes, and only after the one on screen is playing; others: nothing
        preload={onScreen ? 'auto' : near && mayPrefetch ? 'metadata' : 'none'}
        aria-label={label}
        data-reel="1"
      />
      {/* polish #13: a small white speaker (no red emoji); a tap on the video toggles sound, a double tap still likes */}
      <span className={`reel-sound${muted && hint && soundHint ? ' has-hint' : ''}`} aria-hidden="true" data-muted={muted ? '1' : '0'}>
        <svg viewBox="0 0 24 24"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />{muted ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M16 9a4.2 4.2 0 0 1 0 6M18.6 6.5a7.8 7.8 0 0 1 0 11" />}</svg>
        {muted && hint && soundHint ? <b className="reel-sound-hint">{soundHint}</b> : null}
      </span>
      {pending ? <span className="reel-pending">{pending}</span> : null}
      <span className="reel-prog" aria-hidden="true"><i ref={barRef} /></span>
    </div>
  );
}
