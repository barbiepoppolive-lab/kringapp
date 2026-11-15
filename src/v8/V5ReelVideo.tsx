/* Full-screen vertical Reel in the feed: poster first, plays muted + looped only while on screen, tap for sound. */
import { useEffect, useRef, useState } from 'react';

let soundOn = false; // one tap turns sound on for every Reel after it (like the big apps)

/** Tap anywhere on a Reel slide (except its buttons) toggles sound for this and every later Reel. */
export function toggleReelSound(e: { target: EventTarget | null; currentTarget: EventTarget | null }) {
  const t = e.target as HTMLElement | null;
  if (!t || t.closest('button, a, input, textarea, select')) return;
  const v = (e.currentTarget as HTMLElement | null)?.querySelector('video[data-reel]') as HTMLVideoElement | null;
  if (!v) return;
  soundOn = v.muted;
  v.muted = !soundOn;
  v.dispatchEvent(new Event('kr8-sound'));
  if (v.paused) void v.play().catch(() => undefined);
}

export function V5ReelVideo({ src, poster, label, pending, onViewed }: { src: string; poster?: string; label: string; pending?: string; onViewed?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const viewedRef = useRef(false);
  const onViewedRef = useRef(onViewed);
  onViewedRef.current = onViewed;
  const [muted, setMuted] = useState(!soundOn);
  // M (15 Nov): only the Reel on screen and the one next to it load their video; the rest show their poster and download nothing
  const boxRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
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
        if (e.isIntersecting && e.intersectionRatio >= 0.6) {
          v.muted = !soundOn;
          setMuted(!soundOn);
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
      if (viewedRef.current) return;
      const t = v.currentTime;
      if (last >= 0 && t > last && t - last < 1) played += t - last;
      last = t;
      if (played >= 3) { viewedRef.current = true; onViewedRef.current?.(); }
    };
    v.addEventListener('kr8-sound', onSound);
    v.addEventListener('timeupdate', onTime);
    return () => { io.disconnect(); v.removeEventListener('kr8-sound', onSound); v.removeEventListener('timeupdate', onTime); };
  }, [src, near]);
  return (
    <div className="bg reel-bg" ref={boxRef}>
      <video
        ref={ref}
        className="reel-video"
        src={near ? src : undefined}
        poster={poster}
        muted
        loop
        playsInline
        preload={near ? 'auto' : 'none'}
        aria-label={label}
        data-reel="1"
      />
      <span className="reel-sound" aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
      {pending ? <span className="reel-pending">{pending}</span> : null}
    </div>
  );
}
