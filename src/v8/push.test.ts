// 16 Nov dings (push): subscribe flow, when we ask, links from a ding, admin send form, and the words.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parsePushLink, pushAskAfter, pushAskDone, pushAskLater, pushAskShow, pushDisable, pushEnable, pushResync, pushState, pushSupport,
  PUSH_SNOOZE_MS, urlB64ToBytes, type PushDeps, type PushEnv,
} from './push';
import { normAppLink, pushSendArgs } from '../venue/pushAdmin';
import { V5_L } from './v5Strings';
import { PUSH_ASK_LINE, PUSH_IOS_LINE } from './V5Push';

const KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const ANDROID: PushEnv = { ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36', standalone: false, hasSW: true, hasPush: true, hasNotif: true };
const IPHONE_TAB: PushEnv = { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1', standalone: false, hasSW: true, hasPush: false, hasNotif: false };
const IPHONE_APP: PushEnv = { ...IPHONE_TAB, standalone: true, hasPush: true, hasNotif: true };
const LINE: PushEnv = { ...ANDROID, ua: ANDROID.ua + ' Line/14.1.0' };

function fakeSub(endpoint = 'https://fcm.googleapis.com/fcm/send/abc') {
  return { endpoint, toJSON: () => ({ endpoint, keys: { p256dh: KEY, auth: 'tBHItJI5svbpez7KI4CCXg' } }), unsubscribe: vi.fn(async () => true) } as unknown as PushSubscription & { unsubscribe: ReturnType<typeof vi.fn> };
}
function deps(over: Partial<PushDeps> & { perm?: NotificationPermission; answer?: NotificationPermission; existing?: PushSubscription | null } = {}) {
  let perm: NotificationPermission = over.perm ?? 'default';
  let current: PushSubscription | null = over.existing ?? null;
  const mem = new Map<string, string>();
  const pm = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async () => { current = fakeSub(); return current; }),
  };
  const d = {
    key: KEY, env: ANDROID, touch: 0,
    permission: () => perm,
    requestPermission: vi.fn(async () => { perm = over.answer ?? 'granted'; return perm; }),
    registration: vi.fn(async () => ({ pushManager: pm })),
    save: vi.fn(async () => undefined),
    forget: vi.fn(async () => undefined),
    store: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) },
    ...over,
  } as unknown as PushDeps & { requestPermission: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn>; forget: ReturnType<typeof vi.fn> };
  return { d, pm, mem };
}

describe('what this phone can do', () => {
  it('Android Chrome: ok · iPhone Safari tab: add to home screen first · iPhone home-screen app: ok · LINE: open in browser', () => {
    expect(pushSupport(ANDROID)).toBe('ok');
    expect(pushSupport(IPHONE_TAB)).toBe('ios-install');
    expect(pushSupport(IPHONE_APP)).toBe('ok');
    expect(pushSupport(LINE)).toBe('inapp');
    expect(pushSupport({ ...ANDROID, hasPush: false })).toBe('unsupported');
    // iPadOS reports as a Mac with touch
    expect(pushSupport({ ...IPHONE_TAB, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15' }, 5)).toBe('ios-install');
  });
  it('the VAPID key becomes the 65-byte public point', () => {
    const b = urlB64ToBytes(KEY);
    expect(b.length).toBe(65);
    expect(b[0]).toBe(4);
  });
});

describe('subscribe flow', () => {
  it('Turn on: asks the browser once, subscribes with our key, stores the subscription for the member', async () => {
    const { d, pm } = deps();
    expect(await pushState(d)).toBe('off');
    expect(d.requestPermission).not.toHaveBeenCalled();   // reading the state never prompts
    expect(await pushEnable(d)).toBe('on');
    expect(d.requestPermission).toHaveBeenCalledTimes(1);
    expect(pm.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    const key = (pm.subscribe.mock.calls[0] as unknown as [{ applicationServerKey: Uint8Array }])[0].applicationServerKey;
    expect(Array.from(key)).toEqual(Array.from(urlB64ToBytes(KEY)));
    expect(d.save).toHaveBeenCalledWith('https://fcm.googleapis.com/fcm/send/abc', KEY, 'tBHItJI5svbpez7KI4CCXg', ANDROID.ua);
    expect(await pushState(d)).toBe('on');
  });
  it('an existing subscription is re-used (no second subscribe)', async () => {
    const { d, pm } = deps({ perm: 'granted', existing: fakeSub() });
    expect(await pushEnable(d)).toBe('on');
    expect(pm.subscribe).not.toHaveBeenCalled();
    expect(d.requestPermission).not.toHaveBeenCalled();
    expect(d.save).toHaveBeenCalledTimes(1);
  });
  it('blocked: no subscribe, nothing stored', async () => {
    const { d, pm } = deps({ answer: 'denied' });
    expect(await pushEnable(d)).toBe('denied');
    expect(pm.subscribe).not.toHaveBeenCalled();
    expect(d.save).not.toHaveBeenCalled();
    expect(await pushState(d)).toBe('denied');
  });
  it('dismissed prompt (still default) → error, nothing stored', async () => {
    const { d } = deps({ answer: 'default' });
    expect(await pushEnable(d)).toBe('error');
    expect(d.save).not.toHaveBeenCalled();
  });
  it('iPhone Safari tab, LINE, or a build without the key: never prompts', async () => {
    for (const env of [IPHONE_TAB, LINE]) {
      const { d } = deps({ env });
      expect(await pushEnable(d)).toBe('unsupported');
      expect(d.requestPermission).not.toHaveBeenCalled();
    }
    const { d } = deps({ key: '' });
    expect(await pushEnable(d)).toBe('unsupported');
    expect(await pushState(d)).toBe('unsupported');
    expect(await pushState(deps({ env: IPHONE_TAB }).d)).toBe('ios-install');
  });
  it('server refuses (e.g. signed out) → error, not "on"', async () => {
    const { d } = deps({ save: vi.fn(async () => { throw new Error('KR8_SIGN_IN'); }) });
    expect(await pushEnable(d)).toBe('error');
  });
  it('Turn off: the member row goes and the browser subscription is dropped', async () => {
    const sub = fakeSub();
    const { d } = deps({ perm: 'granted', existing: sub });
    await pushDisable(d);
    expect(d.forget).toHaveBeenCalledWith(sub.endpoint);
    expect(sub.unsubscribe).toHaveBeenCalled();
  });
  it('re-sync on start: once a day per member, never prompts, re-subscribes only if turned on here before', async () => {
    const { d, mem } = deps({ perm: 'granted', existing: fakeSub() });
    const now = Date.UTC(2026, 10, 16, 5);
    expect(await pushResync('u1', d, now)).toBe('synced');
    expect(await pushResync('u1', d, now + 3600_000)).toBe('skipped');   // same Bangkok day
    expect(await pushResync('u2', d, now + 3600_000)).toBe('synced');    // another member on this phone
    expect(d.requestPermission).not.toHaveBeenCalled();
    expect(mem.get('kr8_push_on')).toBe('1');
    // permission granted but no subscription and never turned on here → nothing
    const b = deps({ perm: 'granted' });
    expect(await pushResync('u1', b.d, now)).toBe('skipped');
    expect(b.pm.subscribe).not.toHaveBeenCalled();
    // not granted → nothing at all
    const c = deps();
    expect(await pushResync('u1', c.d, now)).toBe('skipped');
    expect(c.d.registration).not.toHaveBeenCalled();
  });
});

describe('when we ask (the small card)', () => {
  const now = 1_800_000_000_000;
  it('never on first load: only after a moment', () => {
    expect(pushAskShow({}, now, 'ok', 'default', { configured: true })).toBe(false);
    const s = pushAskAfter({}, 'minted', now);
    expect(pushAskShow(s, now, 'ok', 'default', { configured: true })).toBe(true);
  });
  it('each moment once; Not now = 14 days; after Turn on never again', () => {
    let s = pushAskAfter({}, 'minted', now);
    s = pushAskLater(s, now);
    expect(pushAskShow(s, now + 1000, 'ok', 'default', { configured: true })).toBe(false);
    expect(pushAskAfter(s, 'minted', now + 1000)).toBe(s);                 // the same moment does not come back
    s = pushAskAfter(s, 'first_reel', now + PUSH_SNOOZE_MS + 1);
    expect(pushAskShow(s, now + PUSH_SNOOZE_MS + 1, 'ok', 'default', { configured: true })).toBe(true);
    s = pushAskDone(s);
    expect(pushAskShow(s, now + PUSH_SNOOZE_MS + 2, 'ok', 'default', { configured: true })).toBe(false);
    expect(pushAskAfter(s, 'first_reel', now)).toBe(s);
  });
  it('not when already decided, blocked by another sheet, unsupported, or no key; iPhone tab gets the home-screen line', () => {
    const s = pushAskAfter({}, 'first_reel', now);
    expect(pushAskShow(s, now, 'ok', 'granted', { configured: true })).toBe(false);
    expect(pushAskShow(s, now, 'ok', 'denied', { configured: true })).toBe(false);
    expect(pushAskShow(s, now, 'ok', 'default', { configured: true, blocked: true })).toBe(false);
    expect(pushAskShow(s, now, 'unsupported', 'default', { configured: true })).toBe(false);
    expect(pushAskShow(s, now, 'inapp', 'default', { configured: true })).toBe(false);
    expect(pushAskShow(s, now, 'ok', 'default', { configured: false })).toBe(false);
    expect(pushAskShow(s, now, 'ios-install', 'denied', { configured: true })).toBe(true);
  });
});

describe('links from a ding', () => {
  it('opens the right place, only inside the app', () => {
    expect(parsePushLink('/app/?tab=me')).toEqual({ tab: 'me' });
    expect(parsePushLink('/app/?tab=me&open=rewards')).toEqual({ tab: 'me', rewards: true });
    expect(parsePushLink('/app/?reel=cccccccc-0000-0000-0000-000000000001')).toEqual({ tab: 'feed', reel: 'cccccccc-0000-0000-0000-000000000001' });
    expect(parsePushLink('/app/?tab=admin')).toEqual({});
    expect(parsePushLink('https://evil.example/app/?tab=me')).toBeNull();
    expect(parsePushLink('/about.html')).toBeNull();
  });
});

describe('admin Send notification', () => {
  it('link typed any way → a path inside the app', () => {
    expect(normAppLink('')).toBeNull();
    expect(normAppLink('?tab=deals')).toBe('/app/?tab=deals');
    expect(normAppLink('tab=me')).toBe('/app/?tab=me');
    expect(normAppLink('/app/?tab=me&open=rewards')).toBe('/app/?tab=me&open=rewards');
    expect(normAppLink('https://kringapp.com/app/?reel=abc')).toBe('/app/?reel=abc');
    expect(normAppLink('kringapp.com/app')).toBe('/app/');
    expect(normAppLink('https://evil.example/app/')).toBe('bad');
    expect(normAppLink('/about.html')).toBe('bad');
    expect(normAppLink('javascript:alert(1)')).toBe('bad');
  });
  it('form → RPC arguments (one member or all, never both)', () => {
    expect(pushSendArgs({ all: false, memberNo: '#16', title: 'สวัสดี · Hi', body: 'ทดสอบ\nTest', link: '?tab=me' }))
      .toEqual({ args: { p_member_no: 16, p_all: false, p_title: 'สวัสดี · Hi', p_body: 'ทดสอบ\nTest', p_url: '/app/?tab=me' } });
    expect(pushSendArgs({ all: true, memberNo: '16', title: 'x', body: 'y', link: '' }))
      .toEqual({ args: { p_member_no: null, p_all: true, p_title: 'x', p_body: 'y', p_url: null } });
    expect(pushSendArgs({ all: false, memberNo: '', title: 'x', body: 'y', link: '' })).toHaveProperty('error');
    expect(pushSendArgs({ all: true, memberNo: '', title: ' ', body: 'y', link: '' })).toHaveProperty('error');
    expect(pushSendArgs({ all: true, memberNo: '', title: 'x', body: 'y', link: 'https://evil.example' })).toHaveProperty('error');
  });
});

describe('words', () => {
  const BANNED = /\b(meet|guide|tour|host|creator|reviews|hidden gem|alcohol|gift|wallet|credit|lucky|draw|temples)\b/i;
  const KEYS = [PUSH_ASK_LINE, PUSH_IOS_LINE, 'Turn on', 'How to add', 'Dings', 'Dings on · กริ๊ง!', 'Dings off',
    'Dings are blocked. Allow notifications for kringapp.com in your browser settings.', 'Could not turn on dings. Try again in Settings.',
    'On · this phone gets dings', 'Blocked in your browser settings', 'Add Kring to your home screen first', 'This browser can’t show dings'];
  it('every new line has Thai, and no banned word in either language', () => {
    expect(PUSH_ASK_LINE).toBe('Get a ding when someone likes your Reel or your reward is ready');
    for (const k of KEYS) {
      const th = V5_L.th[k];
      expect(th, k).toBeTruthy();
      expect(th).toMatch(/[฀-๿]/);
      expect(k).not.toMatch(BANNED);
      expect(th).not.toMatch(BANNED);
    }
  });
});

describe('the card', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); vi.stubEnv('VITE_VAPID_PUBLIC', KEY); });
  afterEach(() => { vi.unstubAllEnvs(); });
  it('shows after a moment, and only [Turn on] calls the browser prompt', async () => {
    const req = vi.fn(async () => 'granted' as NotificationPermission);
    const N = Object.assign(function Notification() { /* stub */ }, { permission: 'default' as NotificationPermission, requestPermission: req });
    vi.stubGlobal('Notification', N);
    vi.stubGlobal('PushManager', function PushManager() { /* stub */ });
    const reg = { active: {}, pushManager: { getSubscription: async () => null, subscribe: vi.fn(async () => fakeSub()) } };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => reg, register: async () => reg, ready: Promise.resolve(reg), addEventListener() {}, removeEventListener() {} } });
    const saved = vi.fn(async () => undefined);
    vi.doMock('./v5Live', () => ({ v5PushSubscribe: saved, v5PushUnsubscribe: vi.fn() }));
    const React = await import('react');
    const { render, screen, fireEvent, act } = await import('@testing-library/react');
    const push = await import('./push');
    const { PushAskCard } = await import('./V5Push');
    const toast = vi.fn();
    const L = (en: string) => V5_L.th[en] || en;
    render(React.createElement(PushAskCard, { L, lang: 'th', toast, onInstallHelp: () => undefined }));
    expect(document.getElementById('pushAsk')).toBeNull();          // first load: nothing
    await act(async () => { push.pushMoment('minted'); });
    expect(document.getElementById('pushAsk')).not.toBeNull();
    expect(screen.getByText(V5_L.th[PUSH_ASK_LINE], { exact: false })).toBeTruthy();
    expect(screen.getByText(PUSH_ASK_LINE)).toBeTruthy();            // English under the Thai line
    expect(req).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(document.getElementById('pushAskOn')!); });
    expect(req).toHaveBeenCalledTimes(1);
    expect(reg.pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(saved).toHaveBeenCalledWith('https://fcm.googleapis.com/fcm/send/abc', KEY, 'tBHItJI5svbpez7KI4CCXg', expect.any(String));
    expect(toast).toHaveBeenCalledWith(V5_L.th['Dings on · กริ๊ง!']);
    expect(document.getElementById('pushAsk')).toBeNull();
    expect(push.pushAskRead().asked).toBe(true);
    vi.unstubAllGlobals();
    vi.doUnmock('./v5Live');
  });
});
