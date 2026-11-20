/**
 * 17 Nov (real-phone audit): Reel sound is remembered. Phone browsers block sound until the member taps once, so:
 *  - never tapped yet  → Reels start muted and show a clear "Tap for sound" hint
 *  - tapped sound on   → later Reels (and after a refresh) try to start with sound; if the browser refuses, they play muted
 *  - tapped sound off  → Reels start muted, no hint
 * Storage can be blocked (private mode, in-app browsers): every read/write is wrapped and falls back to "never tapped".
 */
const KEY = 'kr8-sound';
export const SOUND_PREF_EVENT = 'kr8-sound-pref';

let mem: string | null = null;   // this page's copy, used when storage is blocked
function read(): string | null {
  try { const v = window.localStorage.getItem(KEY); if (v === '1' || v === '0') return v; } catch { /* blocked */ }
  return mem;
}
/** true = the member last chose sound on. */
export function soundWanted(): boolean { return read() === '1'; }
/** true = the member has never tapped for sound (show the hint). */
export function soundNeverTapped(): boolean { const v = read(); return v !== '1' && v !== '0'; }
/** true = show "Tap for sound" while a Reel is muted: never tapped yet, or sound was on but this browser refused to start it. */
export function soundHintWanted(): boolean { return read() !== '0'; }
/** Remember the member's choice and tell every Reel on the page (hides the hint). */
export function rememberSound(on: boolean): void {
  mem = on ? '1' : '0';
  try { window.localStorage.setItem(KEY, mem); } catch { /* storage blocked: this page still remembers */ }
  try { window.dispatchEvent(new Event(SOUND_PREF_EVENT)); } catch { /* no window */ }
}
/**
 * 20 Nov (founder): sound turns ON after the member's FIRST tap anywhere in the app (browsers only allow sound after a tap), then
 * stays on for every Reel and is remembered. Reels still start muted before that tap, with "Tap for sound 🔊". A tap on a Reel
 * itself toggles sound there (that tap is the first tap), and the mute button's choice is remembered as before.
 * Runs after the tap's own handlers (bubble phase on window), so a tap that already chose sound on or off is left alone.
 */
let armed = false;
export function armFirstTapSound(): () => void {
  if (armed || typeof window === 'undefined') return () => undefined;
  armed = true;
  const on = () => {
    if (soundNeverTapped()) rememberSound(true);   // SOUND_PREF_EVENT: the Reel on screen unmutes inside this tap
    off();
  };
  const off = () => {
    window.removeEventListener('click', on);
    window.removeEventListener('keydown', on);
    armed = false;
  };
  window.addEventListener('click', on);
  window.addEventListener('keydown', on);
  return off;
}
/** tests only */
export const _resetSound = () => { mem = null; };
