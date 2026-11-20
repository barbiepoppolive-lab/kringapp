// fix4 (19 Nov): 4 member-facing bugs seen live on new Thai members' phones.
//   1. card photo: 2 strikes (2nd refused photo is used and marked for the team), smaller faces and clear-main-person groups pass
//   2. face check: slow phones get more time; after a timeout "Do it later" sits next to "Try again"
//   3. camera blocked: one "Open in Chrome / Safari" button + short steps; in Chrome / Safari itself, steps to allow the camera
//   4. Reel upload: every try uses a NEW storage name, so a half-sent first try never blocks a retry ("409 Duplicate")
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import UA from './__fixtures__/inAppUAs.json';
import { PHOTO_STRIKES, photoDecision, photoVerdict } from './v5Face';
import { isDuplicate, putFresh, reelObjectPath, ReelError, retryableUpload } from './v5Reel';
import { CAM_STEPS, camDenied, camFix } from './camGuard';
import { LIMITS_FAST, LIMITS_SLOW, LIVE_MAX_MS, liveStart, liveStepWith, slowPhone } from './verifyLive';
import type { LiveFrame } from './verifyLive';
import { V5_L, KX_L } from './v5Strings';

const samplerMock = vi.hoisted(() => ({ bestSampler: vi.fn() }));
const engineMock = vi.hoisted(() => ({ loadFaceEngine: vi.fn() }));
vi.mock('./v5Mp', async (orig) => ({ ...(await orig<typeof import('./v5Mp')>()), ...samplerMock }));
vi.mock('./faceEngine', async (orig) => ({ ...(await orig<typeof import('./faceEngine')>()), ...engineMock }));
const liveMock = vi.hoisted(() => ({ v5HandoffCreate: vi.fn(async () => 'a'.repeat(64)), v5LogClient: vi.fn(), v5VerifySimple: vi.fn(), v5VerifyInstant: vi.fn(),
  v5CompressImage: vi.fn(async () => 'data:image/jpeg;base64,xx'), v5TakeLinePrefill: vi.fn(() => null) }));
const faceMock = vi.hoisted(() => ({ checkProfilePhoto: vi.fn(async () => 'small') }));
vi.mock('./v5Face', async (orig) => ({ ...(await orig<typeof import('./v5Face')>()), ...faceMock }));
vi.mock('./v5Live', async (orig) => ({ ...(await orig<typeof import('./v5Live')>()), ...liveMock }));
const { V5VerifySheet } = await import('./V5Verify');
const { V5MintSheet } = await import('./V5KxCard');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const U = UA as Record<string, string>;
const UID = '11111111-2222-4333-8444-555555555555';
const SERVER_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp4|webm|mov|jpg)$/;   // kr8_create_reel's own check (0055)

describe('fix4 · 1 card photo: two strikes', () => {
  it('1st refused photo asks for another; the 2nd is used and marked for review', () => {
    expect(PHOTO_STRIKES).toBe(2);
    for (const v of ['none', 'small', 'group'] as const) {
      expect(photoDecision(v, 0)).toEqual({ use: false, review: false });
      expect(photoDecision(v, 1)).toEqual({ use: true, review: true });
      expect(photoDecision(v, 5)).toEqual({ use: true, review: true });
    }
  });
  it('a clear face is used with no review; a check that could not run is used and reviewed (as before)', () => {
    expect(photoDecision('ok', 0)).toEqual({ use: true, review: false });
    expect(photoDecision('ok', 3)).toEqual({ use: true, review: false });
    expect(photoDecision('error', 0)).toEqual({ use: true, review: true });
  });
  it('relaxed: a smaller face passes, and a group photo passes when one face is clearly the biggest', () => {
    expect(photoVerdict([{ w: 40, score: 0.9 }], 384)).toBe('ok');                          // 10 % of the width (was "small")
    expect(photoVerdict([{ w: 25, score: 0.9 }], 384)).toBe('small');                       // 6.5 %: still too small
    expect(photoVerdict([{ w: 120, score: 0.9 }, { w: 95, score: 0.8 }], 384)).toBe('ok');  // 2nd face 79 % (was "group")
    expect(photoVerdict([{ w: 120, score: 0.9 }, { w: 110, score: 0.8 }], 384)).toBe('group');
  });
  it('the friendly line has Thai', () => {
    expect(KX_L.th['Thanks! Your photo is in. Our team will take a quick look.']).toMatch(/[฀-๿]/);
  });
});

describe('0162 · card photo on the Make-your-card screen (20 Nov: a photo without one clear face is never used)', () => {
  it('every refused photo: "Use a clear photo of your face 🙂" + Take a selfie now / Choose another photo; the photo is never put on the card', async () => {
    liveMock.v5LogClient.mockClear();
    faceMock.checkProfilePhoto.mockResolvedValue('none');
    const L = (s: string) => s;
    const { container } = render(<V5MintSheet L={L} Lf={(s) => s} card={null} uiLang="en" onSaved={() => undefined} onClose={() => undefined} toast={() => undefined} onAfter={() => undefined} />);
    const pick = async () => {
      const input = container.querySelector<HTMLInputElement>('#v5Photo')!;
      await act(async () => { fireEvent.change(input, { target: { files: [new File(['x'], 'saw.jpg', { type: 'image/jpeg' })] } }); });
      await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
    };
    for (const n of [1, 2, 3]) {
      await pick();
      expect(container.querySelector('#kxPhotoNeed p')?.textContent).toBe('Use a clear photo of your face 🙂');
      expect(container.querySelector('#kxPhotoSelfie')?.textContent).toContain('Take a selfie now');
      expect(container.querySelector('#kxPhotoSelfie input')?.getAttribute('capture')).toBe('user');
      expect(container.querySelector('#kxPhotoGallery')?.textContent).toContain('Choose another photo');
      expect(container.querySelector('#kxPhotoReview')).toBeNull();
      expect(container.querySelector<HTMLElement>('.kx-n2')?.style.backgroundImage || '').not.toContain('data:image/jpeg;base64,xx');
      expect(liveMock.v5LogClient).toHaveBeenCalledWith('card_photo_no', 'none', `try${n}`);
    }
    // a screenshot ('text') is refused the same way
    faceMock.checkProfilePhoto.mockResolvedValue('text');
    await pick();
    expect(container.querySelector('#kxPhotoNeed p')?.textContent).toBe('Use a clear photo of your face 🙂');
  });
});

describe('fix4 · 4 Reel upload: a fresh storage name on every try', () => {
  it('names are new each time and match the server’s path rule', () => {
    const a = reelObjectPath(UID, 'mp4'), b = reelObjectPath(UID, 'mp4'), c = reelObjectPath(UID, 'jpg');
    expect(a).not.toBe(b);
    for (const p of [a, b, c]) { expect(p.startsWith(UID + '/')).toBe(true); expect(p).toMatch(SERVER_PATH); }
  });
  it('"409 Duplicate" (sent as HTTP 400 by storage) counts as a duplicate and is retried', () => {
    const dup = new ReelError('UPLOAD', 400, '409 Duplicate The resource already exists');
    expect(isDuplicate(dup)).toBe(true);
    expect(retryableUpload(dup)).toBe(true);
    expect(retryableUpload(new ReelError('UPLOAD', 0))).toBe(true);
    expect(retryableUpload(new ReelError('UPLOAD', 503))).toBe(true);
    expect(retryableUpload(new ReelError('UPLOAD', 400, '400 InvalidJWT'))).toBe(false);
    expect(retryableUpload(new ReelError('UPLOAD', 413, 'Payload too large'))).toBe(false);
  });
  it('the live case: try 1 drops (UPLOAD:0), try 2 would hit the half-sent name — but uses a new one and lands', async () => {
    const landed = new Set<string>();
    const tried: string[] = [];
    let n = 0;
    const put = async (p: string) => {
      tried.push(p);
      if (landed.has(p)) throw new ReelError('UPLOAD', 400, '409 Duplicate The resource already exists');
      landed.add(p);   // the bytes reached storage…
      if (n++ === 0) throw new ReelError('UPLOAD', 0);   // …but the phone lost the answer
    };
    const path = await putFresh(put, () => reelObjectPath(UID, 'mp4'), 3, 0);
    expect(tried).toHaveLength(2);
    expect(tried[0]).not.toBe(tried[1]);
    expect(path).toBe(tried[1]);
    expect(path).toMatch(SERVER_PATH);
  });
  it('gives up at once on a real "no", after 3 tries on a bad connection', async () => {
    const no = vi.fn(async () => { throw new ReelError('UPLOAD', 401, 'InvalidJWT'); });
    await expect(putFresh(no, () => reelObjectPath(UID, 'mp4'), 3, 0)).rejects.toMatchObject({ status: 401 });
    expect(no).toHaveBeenCalledTimes(1);
    const off = vi.fn(async () => { throw new ReelError('UPLOAD', 0); });
    await expect(putFresh(off, () => reelObjectPath(UID, 'mp4'), 3, 0)).rejects.toMatchObject({ status: 0 });
    expect(off).toHaveBeenCalledTimes(3);
    expect(new Set(off.mock.calls.map((c) => (c as unknown as string[])[0])).size).toBe(3);
  });
});

describe('fix4 · 2 face check on slow phones', () => {
  const fr = (t: number, o: Partial<LiveFrame> = {}): LiveFrame => ({ found: true, faces: 1, yaw: 0.5, closed: 0.05, ear: 0.3, size: 0.4, cx: 0.5, cy: 0.5, bright: 0.5, t, ...o });
  it('spots slow phones by hardware hints or slow frames', () => {
    expect(slowPhone({ hardwareConcurrency: 4 })).toBe(true);
    expect(slowPhone({ deviceMemory: 2, hardwareConcurrency: 8 })).toBe(true);
    expect(slowPhone({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe(false);
    expect(slowPhone({ hardwareConcurrency: 8 }, 200)).toBe(true);
    expect(slowPhone(null)).toBe(false);
  });
  it('slow limits give more time but stay inside the server’s 25 s live limit', () => {
    expect(LIMITS_SLOW.total).toBeGreaterThan(LIMITS_FAST.total);
    expect(LIMITS_SLOW.live).toBeGreaterThan(LIVE_MAX_MS);
    expect(LIMITS_SLOW.live).toBeLessThanOrEqual(25000);
    // still lining up after 50 s: a timeout on fast limits, still going on slow ones
    const s0 = liveStepWith(liveStart(), fr(1000, { cx: 0.9 }), LIMITS_FAST);
    expect(liveStepWith(s0, fr(51000, { cx: 0.9 }), LIMITS_FAST).fail).toBe('timeout');
    expect(liveStepWith(s0, fr(51000, { cx: 0.9 }), LIMITS_SLOW).step).toBe('straight');
  });

  const timedOut = async (mode?: 'signup' | 'me' | 'claim') => {
    const track = { stop: vi.fn() };
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
      hardwareConcurrency: 8, mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) } });
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(640);
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockReturnValue(undefined);
    // a face that never lines up (off-centre), and the clock jumps past every limit: the check times out
    let t = 1000;
    samplerMock.bestSampler.mockResolvedValue({ engine: 'mediapipe', close: vi.fn(), read: vi.fn(async () => fr((t += 100000), { cx: 0.9 })) });
    engineMock.loadFaceEngine.mockReturnValue(new Promise(() => undefined));
    liveMock.v5VerifyInstant.mockResolvedValue({ result: 'fail', tries_left: 2 });
    try { localStorage.setItem('kr8_face_consent', 'face-2026-11-18'); } catch { /* ignore */ }
    const L = (s: string) => s;
    const r = render(<V5VerifySheet L={L} mode={mode} photo="https://x/p.jpg" onClose={() => undefined} onSent={() => undefined} onAddPhoto={() => undefined} errText={() => 'err'} />);
    for (let k = 0; k < 20 && !r.container.querySelector('#verifyFail'); k++) await act(async () => { await new Promise((ok) => setTimeout(ok, 50)); });
    return r;
  };
  it('after a timeout: "Try again" and "Do it later" with a short no-rush line (never a dead end)', async () => {
    const { container } = await timedOut('signup');
    expect(container.querySelector('#verifyFail')).not.toBeNull();
    expect(container.querySelector('#verifyRetry')?.textContent).toBe('Try again · 2 left today');
    expect(container.querySelector('#verifyLaterFail')?.textContent).toBe('Do it later');
    expect(container.querySelector('#verifyLaterNote')?.textContent).toBe('No rush. You only need this to claim a prize.');
    expect(liveMock.v5LogClient).toHaveBeenCalledWith('verify_live_fail', 'timeout', 'r0');
    expect(V5_L.th['Do it later']).toBe('ไว้ทีหลัง');
    expect(V5_L.th['No rush. You only need this to claim a prize.']).toMatch(/[\u0E00-\u0E7F]/);
  });
  it('prize-claim mode keeps "Not now" (the check is required there)', async () => {
    const { container, getByText } = await timedOut('claim');
    expect(container.querySelector('#verifyFail')).not.toBeNull();
    expect(container.querySelector('#verifyLaterFail')).toBeNull();
    expect(getByText('Not now')).toBeTruthy();
  });
});

describe('fix4 · 3 camera blocked', () => {
  const href = 'https://kringapp.com/app/?ref=abc';
  it('LINE / Instagram on Android: one "Open in Chrome" intent + 2 steps', () => {
    for (const k of ['line_android', 'ig_android']) {
      const f = camFix(href, U[k], 'f'.repeat(64));
      expect(f.open?.kind).toBe('chrome');
      expect(f.open?.url).toMatch(/^intent:\/\/kringapp\.com\/app\/\?.*open=verify.*#Intent;scheme=https;package=com\.android\.chrome;/);
      expect(CAM_STEPS[f.steps]).toHaveLength(2);
    }
  });
  it('iPhone: Instagram → Open in Safari (plus Copy link); LINE → the phone’s browser', () => {
    const ig = camFix(href, U.ig_ios);
    expect(ig.open?.kind).toBe('safari');
    expect(ig.open?.url.startsWith('x-safari-https://kringapp.com/app/')).toBe(true);
    expect(ig.copy).toBe('https://kringapp.com/app/?ref=abc&open=verify');
    const line = camFix(href, U.line_ios);
    expect(line.open?.kind).toBe('browser');
    expect(line.open?.url).toContain('openExternalBrowser=1');
  });
  it('already in Chrome / Safari and the member said no: no open button, steps to allow the camera', () => {
    expect(camDenied('NotAllowedError')).toBe(true);
    expect(camDenied('BlackFrames')).toBe(false);
    const android = camFix(href, 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/122 Mobile Safari/537.36');
    expect(android).toEqual({ open: null, copy: null, steps: 'allow_android' });
    expect(camFix(href, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) Version/17.2 Mobile/15E148 Safari/604.1').steps).toBe('allow_ios');
  });
  it('every step has natural Thai', () => {
    for (const steps of Object.values(CAM_STEPS)) for (const t of steps) expect(V5_L.th[t], t).toMatch(/[฀-๿]/);
    expect(V5_L.th['Allow the camera']).toBeTruthy();
  });

  it('NotAllowedError inside Instagram (Android): 1A guide + Copy link + Open in Chrome; never silent', async () => {
    const gum = vi.fn(async () => { const e = new Error('denied'); e.name = 'NotAllowedError'; throw e; });
    vi.stubGlobal('navigator', { ...navigator, userAgent: U.ig_android, mediaDevices: { getUserMedia: gum } });
    try { localStorage.removeItem('kr8_face_consent'); } catch { /* ignore */ }
    const L = (s: string) => s;
    const { container } = render(<V5VerifySheet L={L} photo="https://x/p.jpg" onClose={() => undefined} onSent={() => undefined} onAddPhoto={() => undefined} errText={() => 'err'} />);
    fireEvent.click(container.querySelector('#verifyAgree')!);
    await act(async () => { fireEvent.click(container.querySelector('#verifyStart')!); });
    await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
    // 19 Nov: Instagram / TikTok show the 1A guide (2 pictures + Copy link), keeping the one-tap Open in Chrome on Android
    expect(container.querySelector('#verifyOpenGuide')).not.toBeNull();
    expect(container.querySelector('#verifyCopyLink')).not.toBeNull();
    expect(container.querySelector('#verifyOpenChrome')?.getAttribute('href')).toMatch(/^intent:\/\//);
    expect(liveMock.v5LogClient).toHaveBeenCalledWith('verify_cam_fail', 'NotAllowedError', 'instagram');
  });
  it('NotAllowedError in Chrome itself: 3C carousel with 3 steps and Try again', async () => {
    const gum = vi.fn(async () => { const e = new Error('denied'); e.name = 'NotAllowedError'; throw e; });
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36', mediaDevices: { getUserMedia: gum } });
    try { localStorage.removeItem('kr8_face_consent'); } catch { /* ignore */ }
    const L = (s: string) => s;
    const { container, getByText } = render(<V5VerifySheet L={L} photo="https://x/p.jpg" onClose={() => undefined} onSent={() => undefined} onAddPhoto={() => undefined} errText={() => 'err'} />);
    fireEvent.click(container.querySelector('#verifyAgree')!);
    await act(async () => { fireEvent.click(container.querySelector('#verifyStart')!); });
    await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
    // 19 Nov 3C: 3 swipe cards with the Android Chrome steps
    expect(getByText('Turn on the camera in 3 steps')).toBeTruthy();
    expect(container.querySelectorAll('#verifyCamFix [data-card]')).toHaveLength(3);
    expect(getByText('Tap the lock icon')).toBeTruthy();
    expect(container.querySelector('#verifyOpenChrome')).toBeNull();
    await act(async () => { fireEvent.click(container.querySelector('#verifyCamRetry')!); });
    expect(gum).toHaveBeenCalledTimes(2);
  });
});
