/** Face check camera guard (17 Nov). Inside an app's built-in browser (LINE / Instagram / Facebook / TikTok / Android
 *  WebView, or a Custom Tab) the camera can be blocked without any error: getUserMedia never answers, or the stream never
 *  sends a frame, and the screen sat on "Getting the camera ready" with a black oval. These pure helpers let the face check
 *  give up after a few seconds and offer "Open in Chrome" (Android intent) or "Copy link" (iPhone / other). */
import { chromeIntent, inAppOf, lineExternal, osOf, safariUrl, targetUrl, type InApp } from './escape';

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

/**
 * fix4 (19 Nov, live: verify_cam_fail NotAllowedError, mostly inside LINE / Instagram): what the "camera blocked" screen offers.
 * - In an app's built-in browser: ONE button that opens this page (face check again) in the real browser, plus 2 short steps.
 *   Android → Chrome (intent), LINE → the phone's browser (openExternalBrowser), iPhone → Safari (x-safari-https, iOS 17+;
 *   the plain link stays as "Copy link" for older iPhones).
 * - Already in Chrome / Safari (the member tapped Block, or the site is blocked): no "open" button (it would open the same
 *   browser); 3 short steps to allow the camera for this site, then Try again.
 */
export type CamSteps = 'inapp_android' | 'inapp_ios' | 'inapp_line' | 'allow_android' | 'allow_ios' | 'allow_other';
export interface CamFix { open: { kind: 'chrome' | 'safari' | 'browser'; url: string } | null; copy: string | null; steps: CamSteps }
/** `denied` = the browser said NotAllowedError / SecurityError (a permission "no"); other reasons (no frames, black frames,
 *  no answer) in a real browser are treated like an in-app browser: try the phone's main browser. */
export const camDenied = (why: string) => why === 'NotAllowedError' || why === 'SecurityError' || why === 'PermissionDeniedError';
export function camFix(href: string, ua: string, ho?: string | null, denied = true): CamFix {
  const page = new URL(href);
  page.searchParams.set('open', 'verify');
  const os = osOf(ua), app = inAppOf(ua);
  const plain = targetUrl(page.toString());
  if (!app && denied) return { open: null, copy: null, steps: os === 'android' ? 'allow_android' : os === 'ios' ? 'allow_ios' : 'allow_other' };
  if (os === 'android') {
    const out = openOutside(href, ua, ho);
    return { open: { kind: 'chrome', url: out.url }, copy: null, steps: 'inapp_android' };
  }
  const https = targetUrl(page.toString(), { ho });
  if (app === 'line') return { open: { kind: 'browser', url: lineExternal(https) }, copy: plain, steps: 'inapp_line' };
  if (!app && os !== 'ios') return { open: null, copy: plain, steps: 'allow_other' };
  if (os === 'ios') return { open: { kind: 'safari', url: safariUrl(https) }, copy: plain, steps: 'inapp_ios' };
  return { open: null, copy: plain, steps: 'inapp_ios' };
}
/** The short steps under the camera-blocked screen (English keys; the screen translates them). */
export const CAM_STEPS: Record<CamSteps, string[]> = {
  inapp_android: ['Tap “Open in Chrome” below', 'When Chrome asks for the camera, tap Allow'],
  inapp_line: ['Tap the button below to open your phone’s browser', 'When it asks for the camera, tap Allow'],
  inapp_ios: ['Tap “Open in Safari” below (or ⋯ → Open in browser)', 'When Safari asks for the camera, tap Allow'],
  allow_android: ['Tap the icon left of the web address', 'Permissions → Camera → Allow', 'Come back and tap Try again'],
  allow_ios: ['Tap “aA” in the address bar', 'Website Settings → Camera → Allow', 'Come back and tap Try again'],
  allow_other: ['Click the icon left of the web address', 'Camera → Allow', 'Come back and click Try again'],
};

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
