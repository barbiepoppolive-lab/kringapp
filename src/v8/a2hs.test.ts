// T-206: install prompt only after the first value, never on first open, 7-day dismiss, in-app browsers redirected.
import { beforeEach, describe, expect, it } from 'vitest';
import { A2HS_SNOOZE_MS, a2hsAfter, a2hsDismissed, a2hsFirstValue, a2hsShouldShow, externalBrowserUrl, inAppBrowser } from './A2HS';

const T0 = Date.parse('2026-11-11T10:00:00+07:00');

describe('install prompt trigger', () => {
  beforeEach(() => localStorage.clear());
  it('never on first open: nothing to show until a first-value action', () => {
    expect(a2hsShouldShow({}, T0, false)).toBe(false);
  });
  it('first save, hello or Reel makes it due; only the first one counts', () => {
    const s1 = a2hsAfter({}, 'hello', T0);
    expect(s1).toEqual({ due: T0, by: 'hello' });
    expect(a2hsAfter(s1, 'reel', T0 + 5000)).toBe(s1);
    expect(a2hsShouldShow(s1, T0 + 1, false)).toBe(true);
  });
  it('never inside the installed app', () => {
    expect(a2hsShouldShow({ due: T0 }, T0 + 1, true)).toBe(false);
  });
  it('dismiss hides it for 7 days, then it may show again', () => {
    const d = a2hsDismissed({ due: T0, by: 'save' }, T0 + 10);
    expect(a2hsShouldShow(d, T0 + 10 + A2HS_SNOOZE_MS - 1, false)).toBe(false);
    expect(a2hsShouldShow(d, T0 + 10 + A2HS_SNOOZE_MS + 1, false)).toBe(true);
  });
  it('a2hsFirstValue stores the first trigger once and tells the banner', () => {
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
