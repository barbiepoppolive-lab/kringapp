/** Face check camera guard (17 Nov). Inside an app's built-in browser (LINE / Instagram / Facebook / TikTok / Android
 *  WebView, or a Custom Tab) the camera can be blocked without any error: getUserMedia never answers, or the stream never
 *  sends a frame, and the screen sat on "Getting the camera ready" with a black oval. These pure helpers let the face check
 *  give up after a few seconds and offer "Open in Chrome" (Android intent) or "Copy link" (iPhone / other). */
import { chromeIntent, inAppOf, osOf, targetUrl, type InApp } from './escape';

/** Waits for a promise, but gives up after `ms` (rejects with name 'CamTimeout'). */
export function withTimeout<T>(p: Promise<T>, ms: number, onLate?: (v: T) => void): Promise<T> {
  return new Promise<T>((ok, no) => {
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      const e = new Error('camera did not answer');
      e.name = 'CamTimeout';
      no(e);
    }, ms);
    p.then((v) => { if (done) { onLate?.(v); return; } done = true; clearTimeout(t); ok(v); },
      (e) => { if (done) return; done = true; clearTimeout(t); no(e); });
  });
}

type VideoLike = Pick<HTMLVideoElement, 'videoWidth' | 'readyState'> & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (h: number) => void;
};
/** true as soon as the video shows a real frame (requestVideoFrameCallback, or videoWidth > 0 with data); false after `ms`. */
export function firstFrame(v: VideoLike, ms = 6000, poll = 100): Promise<boolean> {
  return new Promise((ok) => {
    let done = false;
    let h: number | null = null;
    const end = (r: boolean) => {
      if (done) return;
      done = true;
      clearInterval(iv);
      clearTimeout(to);
      if (h !== null) { try { v.cancelVideoFrameCallback?.(h); } catch { /* ignore */ } }
      ok(r);
    };
    const has = () => v.videoWidth > 0 && v.readyState >= 2;
    const iv = setInterval(() => { if (has()) end(true); }, poll);
    const to = setTimeout(() => end(has()), ms);
    try { if (typeof v.requestVideoFrameCallback === 'function') h = v.requestVideoFrameCallback(() => end(true)); } catch { /* ignore */ }
    if (has()) end(true);
  });
}

/** The in-app browser the page is open in (null = a real browser, or a Custom Tab, which looks like Chrome). */
export const inAppBrowser = (ua: string): InApp | null => inAppOf(ua);

export type OpenOut = { kind: 'chrome'; url: string } | { kind: 'copy'; url: string };
/** Where "Open in Chrome" goes: Android → intent:// to Chrome on the same page (with ?open=verify so the face check opens
 *  again, and the one-time sign-in code if we have one); iPhone / other → the plain link to copy into Safari. */
export function openOutside(href: string, ua: string, ho?: string | null): OpenOut {
  const page = new URL(href);
  page.searchParams.set('open', 'verify');
  if (osOf(ua) === 'android') {
    const https = targetUrl(page.toString(), { ho });
    return { kind: 'chrome', url: chromeIntent(https, targetUrl(page.toString(), { esc: true })) };
  }
  return { kind: 'copy', url: targetUrl(page.toString()) };
}

/** Copies text; true when it worked (clipboard API, then the old textarea way). */
export async function copyText(s: string): Promise<boolean> {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(s); return true; } } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = s;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

/** What this browser can run. The face code (onnxruntime-web) needs WebAssembly with SIMD; MediaPipe needs WebAssembly
 *  (GPU via WebGL when there is one). Without wasm + SIMD the check takes the simple path (one selfie → the founder looks). */
export interface EngineSupport { wasm: boolean; simd: boolean; webgl: boolean }
// the smallest valid module that uses a SIMD instruction (the wasm-feature-detect test)
const SIMD_TEST = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
export function engineSupport(): EngineSupport {
  let wasm = false, simd = false, webgl = false;
  try { wasm = typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function'; } catch { /* no */ }
  try { simd = wasm && WebAssembly.validate(SIMD_TEST); } catch { /* no */ }
  try { const c = document.createElement('canvas'); webgl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { /* no */ }
  return { wasm, simd, webgl };
}
/** null = the full check can run here; otherwise why it can't (sent with the simple-path selfie). */
export function simpleWhy(s: EngineSupport): 'no_wasm' | 'no_simd' | null {
  if (!s.wasm) return 'no_wasm';
  if (!s.simd) return 'no_simd';
  return null;
}

/** The video plays but every frame is black (a browser that takes over the <video>, or a dead camera driver): true when all
 *  brightness readings over the window are near 0. A dark room still reads above this (camera noise + auto exposure). */
export const BLACK_LUMA = 0.02;
export function allBlack(lumas: (number | null)[]): boolean {
  const got = lumas.filter((x): x is number => typeof x === 'number');
  return got.length >= 3 && got.every((x) => x < BLACK_LUMA);
}
