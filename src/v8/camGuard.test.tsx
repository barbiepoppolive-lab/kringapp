// 17 Nov: the face check must never sit on "Getting the camera ready" (founder's Android, in-app browser / phone-maker browser).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import UA from './__fixtures__/inAppUAs.json';
import { allBlack, engineSupport, firstFrame, inAppBrowser, openOutside, simpleWhy, withTimeout } from './camGuard';

const samplerMock = vi.hoisted(() => ({ bestSampler: vi.fn() }));
const engineMock = vi.hoisted(() => ({ loadFaceEngine: vi.fn() }));
const liveMock = vi.hoisted(() => ({ v5HandoffCreate: vi.fn(async () => 'a'.repeat(64)), v5LogClient: vi.fn(), v5VerifySimple: vi.fn() }));
vi.mock('./v5Mp', async (orig) => ({ ...(await orig<typeof import('./v5Mp')>()), ...samplerMock }));
vi.mock('./faceEngine', async (orig) => ({ ...(await orig<typeof import('./faceEngine')>()), ...engineMock }));
vi.mock('./v5Live', async (orig) => ({ ...(await orig<typeof import('./v5Live')>()), ...liveMock }));
import { V5VerifySheet } from './V5Verify';

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('camera guard helpers', () => {
  it('spots in-app browsers (LINE, Instagram, Facebook, TikTok, Android WebView) but not Chrome / Safari', () => {
    for (const k of ['line_android', 'line_ios', 'fb_android', 'fb_ios', 'ig_android', 'ig_ios'] as const) expect(inAppBrowser((UA as Record<string, string>)[k]), k).not.toBeNull();
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 13; SM-A536E Build/TP1A; wv) AppleWebKit/537.36 Version/4.0 Chrome/121 Mobile Safari/537.36')).toBe('webview');
    expect(inAppBrowser(CHROME_ANDROID)).toBeNull();
    expect(inAppBrowser(SAFARI_IOS)).toBeNull();
  });

  it('Android: "Open in Chrome" is an intent:// to the same page in Chrome, opening the face check again', () => {
    const o = openOutside('https://kringapp.com/app/?ref=abc#x', (UA as Record<string, string>).ig_android, 'f'.repeat(64));
    expect(o.kind).toBe('chrome');
    expect(o.url.startsWith('intent://kringapp.com/app/?')).toBe(true);
    expect(o.url).toContain('open=verify');
    expect(o.url).toContain('ref=abc');
    expect(o.url).toContain('ho=' + 'f'.repeat(64));
    expect(o.url).toContain('#Intent;scheme=https;package=com.android.chrome;');
    expect(o.url.endsWith(';end')).toBe(true);
  });

  it('iPhone: a plain https link to copy (no sign-in code in the clipboard)', () => {
    const o = openOutside('https://kringapp.com/app/', (UA as Record<string, string>).ig_ios, 'f'.repeat(64));
    expect(o).toEqual({ kind: 'copy', url: 'https://kringapp.com/app/?open=verify' });
  });

  it('withTimeout gives up on a hanging getUserMedia and stops a late stream', async () => {
    vi.useFakeTimers();
    let late: (v: string) => void = () => undefined;
    const onLate = vi.fn();
    const p = withTimeout(new Promise<string>((ok) => { late = ok; }), 6000, onLate);
    const caught = p.catch((e: Error) => e.name);
    await vi.advanceTimersByTimeAsync(6001);
    expect(await caught).toBe('CamTimeout');
    late('stream');
    await Promise.resolve();
    expect(onLate).toHaveBeenCalledWith('stream');
  });

  it('firstFrame: false when videoWidth stays 0, true once a frame arrives', async () => {
    vi.useFakeTimers();
    const dead = { videoWidth: 0, readyState: 0 };
    const r1 = firstFrame(dead, 6000);
    await vi.advanceTimersByTimeAsync(6001);
    expect(await r1).toBe(false);
    const v = { videoWidth: 0, readyState: 0 };
    const r2 = firstFrame(v, 6000);
    await vi.advanceTimersByTimeAsync(500);
    v.videoWidth = 640; v.readyState = 4;
    await vi.advanceTimersByTimeAsync(200);
    expect(await r2).toBe(true);
  });

  it('black-frame and engine-support checks', () => {
    expect(allBlack([0, 0.001, 0.004, null])).toBe(true);
    expect(allBlack([0, 0.001])).toBe(false);              // too few readings to say
    expect(allBlack([0.01, 0.12, 0.003])).toBe(false);     // a dark room still has some light
    expect(simpleWhy({ wasm: false, simd: false, webgl: true })).toBe('no_wasm');
    expect(simpleWhy({ wasm: true, simd: false, webgl: true })).toBe('no_simd');
    expect(simpleWhy({ wasm: true, simd: true, webgl: false })).toBeNull();
    expect(engineSupport().simd).toBe(true);               // Node has wasm SIMD: the detector module is valid
  });
});

const L = (s: string) => s;
const sheet = () => render(<V5VerifySheet L={L} photo="https://x/p.jpg" onClose={() => undefined} onSent={() => undefined} onAddPhoto={() => undefined} errText={() => 'err'} />);

describe('face check screen', () => {
  it('in-app browser: a heads-up on the intro screen', () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: (UA as Record<string, string>).ig_android });
    try { localStorage.removeItem('kr8_face_consent'); } catch { /* ignore */ }
    const { container } = sheet();
    expect(container.querySelector('#verifyInApp')?.textContent).toContain('built-in browser');
    // T-392 (PDPA): the consent says when one selfie goes to the team, never "never leaves your phone"
    const consent = container.querySelector('#verifyConsent')!.textContent!;
    expect(consent).not.toContain('never leaves your phone');
    expect(consent).toContain('one selfie goes to our team to look at, and we delete it about 30 days after the review');
  });

  it('getUserMedia blocked → "Camera blocked" with Open in Chrome / Try again / Not now (never stuck on "Getting the camera ready")', async () => {
    const gum = vi.fn(async () => { const e = new Error('denied'); e.name = 'NotAllowedError'; throw e; });
    vi.stubGlobal('navigator', { ...navigator, userAgent: (UA as Record<string, string>).fb_android, mediaDevices: { getUserMedia: gum } });
    samplerMock.bestSampler.mockResolvedValue({ engine: 'mediapipe', read: vi.fn(), close: vi.fn() });
    engineMock.loadFaceEngine.mockReturnValue(new Promise(() => undefined));
    const { container, getByText } = sheet();
    fireEvent.click(container.querySelector('#verifyAgree')!);
    await act(async () => { fireEvent.click(container.querySelector('#verifyStart')!); });
    await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
    expect(container.querySelector('#verifyCamBlocked')).not.toBeNull();
    expect(getByText('Camera blocked')).toBeTruthy();
    expect(getByText('Open this page in Chrome (or Safari) and allow the camera.')).toBeTruthy();
    const a = container.querySelector<HTMLAnchorElement>('#verifyOpenChrome')!;
    expect(a.getAttribute('href')).toMatch(/^intent:\/\/.*#Intent;scheme=https;package=com\.android\.chrome;.*end$/);
    expect(getByText('Not now')).toBeTruthy();
    await act(async () => { fireEvent.click(container.querySelector('#verifyCamRetry')!); });
    expect(gum).toHaveBeenCalledTimes(2);   // "Try again" asks for the camera again
  });

  it('no WebAssembly SIMD → simple path: camera + "Take selfie", the face engine is never loaded', async () => {
    vi.spyOn(WebAssembly, 'validate').mockReturnValue(false);
    const track = { stop: vi.fn() };
    const gum = vi.fn(async () => ({ getTracks: () => [track] }));
    vi.stubGlobal('navigator', { ...navigator, userAgent: CHROME_ANDROID, mediaDevices: { getUserMedia: gum } });
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(640);
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    samplerMock.bestSampler.mockClear(); engineMock.loadFaceEngine.mockClear();
    try { localStorage.setItem('kr8_face_consent', 'x'); } catch { /* ignore */ }
    const { container } = sheet();
    if (container.querySelector('#verifyAgree')) {
      fireEvent.click(container.querySelector('#verifyAgree')!);
      await act(async () => { fireEvent.click(container.querySelector('#verifyStart')!); });
    }
    await act(async () => { await new Promise((ok) => setTimeout(ok, 250)); });
    expect(container.querySelector('#verifySnap')?.textContent).toBe('Take selfie');
    // T-392: before the one selfie is sent, the screen says it goes to the team and is deleted after
    expect(container.querySelector('#verifyPhotoNote')?.textContent).toBe('We’ll send this one photo to our team to check, then delete it.');
    expect(engineMock.loadFaceEngine).not.toHaveBeenCalled();
    expect(samplerMock.bestSampler).not.toHaveBeenCalled();
  });

  it('T-310: the camera starts first: the video plays and "Getting ready… x%" shows while the tracker is still loading', async () => {
    const track = { stop: vi.fn() };
    const gum = vi.fn(async () => ({ getTracks: () => [track] }));
    vi.stubGlobal('navigator', { ...navigator, userAgent: CHROME_ANDROID, mediaDevices: { getUserMedia: gum } });
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(640);
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    samplerMock.bestSampler.mockReturnValue(new Promise(() => undefined));   // the ~40 MB boot never finishes here
    engineMock.loadFaceEngine.mockReturnValue(new Promise(() => undefined));
    const { container } = sheet();
    if (container.querySelector('#verifyAgree')) {
      fireEvent.click(container.querySelector('#verifyAgree')!);
      await act(async () => { fireEvent.click(container.querySelector('#verifyStart')!); });
    }
    await act(async () => { await new Promise((ok) => setTimeout(ok, 250)); });
    expect(gum).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalled();
    expect(container.querySelector('#sh-verify')?.getAttribute('data-stage')).toBe('camera');
    expect(container.querySelector('#verifyReady')?.textContent).toMatch(/^Getting ready… \d+%$/);
    expect(container.querySelector('#verifyStep')?.textContent).toBe('Look straight at the camera');
  });
});

describe('Reels behind the face check (T-310)', () => {
  it('holdReels drops the Reel video and its poster; letting go loads it again', async () => {
    vi.stubGlobal('IntersectionObserver', class { observe() { /* none */ } disconnect() { /* none */ } });
    const { V5ReelVideo, holdReels, _resetReelMediaGate } = await import('./V5ReelVideo');
    _resetReelMediaGate(true);   // K-006: first screen already painted
    const { container } = render(<V5ReelVideo src="https://x/r.mp4" poster="https://x/p.jpg" label="Reel" first />);
    expect(container.querySelector('video')?.getAttribute('src')).toBe('https://x/r.mp4');
    act(() => holdReels(true));
    expect(container.querySelector('video')?.getAttribute('src')).toBeNull();
    act(() => holdReels(false));
    expect(container.querySelector('video')?.getAttribute('src')).toBe('https://x/r.mp4');
  });
});
