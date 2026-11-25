/**
 * m213 session measurement: one tiny server call every 30 s while Kring is on screen (paused while the tab/app is hidden).
 * The server (kr8_session_beat) keeps one row per visit and adds up visible seconds; it ignores beats closer than 20 s
 * and gaps over 90 s, so a sleeping phone never inflates the time. Never throws, never shows anything.
 */
import { v5Client } from './v5Live';

export const BEAT_MS = 30_000;

/** A random id per page load (8–40 letters, digits, dashes: what the server accepts). */
export function newSid(): string {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch { /* old browser */ }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

let sid = '';
export const sessionId = () => (sid ||= newSid());

async function beat(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try { const c = await v5Client(); await c.rpc('kr8_session_beat', { p_sid: sessionId() }); } catch { /* measurement only */ }
}

/** Start beating for the signed-in member. Returns a stop function. `send` is injectable for tests. */
export function startSessionBeat(send: () => Promise<void> = beat, doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): () => void {
  if (!doc) return () => undefined;
  let last = 0;
  const tick = () => {
    if (doc.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - last < BEAT_MS - 2_000) return;   // a visibility flip right after a beat does not double up
    last = now;
    void send();
  };
  tick();
  const id = setInterval(tick, BEAT_MS);
  const onVis = () => { if (doc.visibilityState === 'visible') tick(); };
  doc.addEventListener('visibilitychange', onVis);
  return () => { clearInterval(id); doc.removeEventListener('visibilitychange', onVis); };
}
