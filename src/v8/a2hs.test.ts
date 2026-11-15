// T-206: install prompt only after the first value, never on first open, 7-day dismiss, in-app browsers redirected.
import { beforeEach, describe, expect, it } from 'vitest';
import { BIP_WAIT_MS, browserFamily, installState, manualStep, A2HS_SNOOZE_MS, a2hsAfter, a2hsDismissed, a2hsFirstValue, a2hsShouldShow, a2hsVariant, a2hsVisit, bkkDay, externalBrowserUrl, inAppBrowser } from './A2HS';

const T0 = Date.parse('2026-11-11T10:00:00+07:00');

describe('install prompt trigger', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  it('never on first open: nothing to show until a trigger', () => {
    expect(a2hsShouldShow({}, T0, false)).toBe(false);
  });
  it('first save, hello or Reel makes it due; only the first one counts', () => {
    const s1 = a2hsAfter({}, 'hello', T0);
    expect(s1).toMatchObject({ due: T0, by: 'hello' });
    expect(a2hsAfter(s1, 'reel', T0 + 5000)).toBe(s1);
    expect(a2hsShouldShow(s1, T0 + 1, false)).toBe(true);
  });
  it('J: a claim always re-arms it; first approved Reel counts once', () => {
    const d = a2hsDismissed(a2hsAfter({}, 'reel_approved', T0), T0 + 1);
    expect(a2hsAfter(d, 'reel_approved', T0 + 2)).toBe(d);
    expect(a2hsAfter(d, 'claim', T0 + 2).due).toBe(T0 + 2);
  });
  it('never inside the installed app, never while something is open, once per session', () => {
    expect(a2hsShouldShow({ due: T0 }, T0 + 1, true)).toBe(false);
    expect(a2hsShouldShow({ due: T0 }, T0 + 1, false, { blocked: true })).toBe(false);
    expect(a2hsShouldShow({ due: T0 }, T0 + 1, false, { shownThisSession: true })).toBe(false);
  });
  it('"Later" hides it for 3 days and needs a new trigger after that', () => {
    expect(A2HS_SNOOZE_MS).toBe(3 * 864e5);
    const d = a2hsDismissed({ due: T0, by: 'save' }, T0 + 10);
    expect(a2hsShouldShow(d, T0 + 10 + A2HS_SNOOZE_MS + 1, false)).toBe(false);
    const again = a2hsAfter(d, 'claim', T0 + 10 + A2HS_SNOOZE_MS - 5);
    expect(a2hsShouldShow(again, T0 + 10 + A2HS_SNOOZE_MS - 1, false)).toBe(false);
    expect(a2hsShouldShow(again, T0 + 10 + A2HS_SNOOZE_MS + 1, false)).toBe(true);
  });
  it('J5: second visit on a different Bangkok day, never on the first', () => {
    const s1 = a2hsVisit({}, T0);
    expect(s1.due).toBeUndefined();
    expect(a2hsVisit(s1, T0 + 3600_000).due).toBeUndefined();          // same day
    expect(a2hsVisit(s1, T0 + 864e5).by).toBe('second_day');
    expect(bkkDay(Date.parse('2026-11-15T17:30:00Z'))).toBe('2026-11-16'); // 00:30 in Bangkok
  });
  it('variant: in-app first, then Android prompt, iPhone steps, other menu', () => {
    expect(a2hsVariant('Mozilla/5.0 (iPhone) Safari Line/14.1.0', true)).toBe('inapp-line');
    expect(a2hsVariant('Mozilla/5.0 (Linux; Android 14) Chrome/131 Mobile', true)).toBe('android');
    expect(a2hsVariant('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1', false)).toBe('ios');
    expect(a2hsVariant('Mozilla/5.0 (Linux; Android 14) SamsungBrowser/25 Mobile', false)).toBe('menu');
  });
  it('a2hsFirstValue stores the first trigger once and tells the sheet', () => {
    let pings = 0;
    const on = () => { pings++; };
    window.addEventListener('kr8-a2hs', on);
    a2hsFirstValue('save');
    a2hsFirstValue('reel');
    window.removeEventListener('kr8-a2hs', on);
    expect(JSON.parse(localStorage.getItem('kr8_a2hs')!).by).toBe('save');
    expect(pings).toBe(1);
  });
});

describe('in-app browsers', () => {
  it('detects LINE, Instagram, Facebook, TikTok and Android webviews; not Chrome or Safari', () => {
    expect(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari Line/14.1.0')).toBe('line');
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 14; wv) Instagram 300.0.0')).toBe('other');
    expect(inAppBrowser('Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/440.0]')).toBe('other');
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 13; SM-A536E; wv) AppleWebKit/537.36 Version/4.0 Chrome/119 Mobile Safari/537.36 musical_ly_2023')).toBe('other');
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36')).toBeNull();
    expect(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBeNull();
  });
  it('LINE "open in browser" link keeps the page and adds openExternalBrowser=1', () => {
    expect(externalBrowserUrl('https://kringapp.com/app/?ref=pich#deals')).toBe('https://kringapp.com/app/?ref=pich&openExternalBrowser=1#deals');
  });
});

describe('16 Nov: one-tap install even when the browser offer arrives late', () => {
  it('Preparing… until the offer comes (up to 8 s), then one tap; manual only after the wait', () => {
    expect(installState(false, 0, false)).toBe('preparing');
    expect(installState(true, 300, false)).toBe('ready');
    expect(installState(true, 20000, false)).toBe('ready');
    expect(installState(false, BIP_WAIT_MS + 1, false)).toBe('manual');
    expect(installState(true, 0, true)).toBe('installed');
  });
  it('browser families (Brave needs navigator.brave; Samsung has its own menu)', () => {
    expect(browserFamily('Mozilla/5.0 (Linux; Android 14) SamsungBrowser/25.0 Chrome/121 Mobile')).toBe('samsung');
    expect(browserFamily('Mozilla/5.0 (Linux; Android 14) Chrome/131 Mobile', true)).toBe('brave');
    expect(browserFamily('Mozilla/5.0 (Linux; Android 14) Chrome/131 Mobile OPR/86')).toBe('opera');
    expect(browserFamily('Mozilla/5.0 (Linux; Android 14) Chrome/131 Mobile')).toBe('chrome');
    expect(manualStep('samsung')).toContain('Home screen');
  });
});
