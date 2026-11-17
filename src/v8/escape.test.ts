// 16 Nov: leaving in-app browsers (LINE / FB / IG / Messenger / TikTok) on the same page, with sign-in and ?ref kept.
import { describe, expect, it } from 'vitest';
import UA from './__fixtures__/inAppUAs.json';
import { escapeOnStart, escapePlan, inAppOf, osOf, targetUrl } from './escape';

const HREF = 'https://kringapp.com/app/?ref=pich&src=ig&tab=me#x';
const HO = 'c'.repeat(64);
const decodeFallback = (intent: string) => decodeURIComponent(/S\.browser_fallback_url=([^;]+)/.exec(intent)![1]);

describe('which in-app browser', () => {
  it.each([
    ['line_android', 'line', 'android'], ['line_ios', 'line', 'ios'], ['fb_android', 'facebook', 'android'], ['fb_ios', 'facebook', 'ios'],
    ['ig_android', 'instagram', 'android'], ['ig_ios', 'instagram', 'ios'], ['tiktok_android', 'tiktok', 'android'], ['tiktok_ios', 'tiktok', 'ios'],
    ['messenger_ios', 'messenger', 'ios'],
  ])('%s → %s on %s', (k, app, os) => {
    expect(inAppOf(UA[k as keyof typeof UA])).toBe(app);
    expect(osOf(UA[k as keyof typeof UA])).toBe(os);
  });
  it('real browsers: nothing to do', () => {
    expect(escapePlan(HREF, UA.chrome_android)).toBeNull();
    expect(escapePlan(HREF, UA.safari_ios)).toBeNull();
  });
});

describe('the link each one opens', () => {
  it('LINE (Android + iPhone): same page + openExternalBrowser=1, automatic, with ref/src kept and the hand-off code', () => {
    for (const ua of [UA.line_android, UA.line_ios]) {
      const p = escapePlan(HREF, ua, { ho: HO })!;
      const u = new URL(p.auto!);
      expect(u.origin + u.pathname).toBe('https://kringapp.com/app/');
      expect(u.searchParams.get('openExternalBrowser')).toBe('1');
      expect(u.searchParams.get('ref')).toBe('pich');
      expect(u.searchParams.get('src')).toBe('ig');
      expect(u.searchParams.get('tab')).toBe('me');
      expect(u.searchParams.get('ho')).toBe(HO);
      expect(u.hash).toBe('');
      expect(p.button.url).toBe(p.auto);
    }
  });
  it('LINE LIFF open: no automatic jump (signed in inside LINE on purpose), button still there', () => {
    const p = escapePlan(HREF, UA.line_liff, { liff: true })!;
    expect(p.auto).toBeNull();
    expect(p.button.url).toContain('openExternalBrowser=1');
  });
  it('Android FB / IG / TikTok: intent to Chrome with the same page, fallback back here (kr_esc=1), any-browser option', () => {
    for (const ua of [UA.fb_android, UA.ig_android, UA.tiktok_android]) {
      const p = escapePlan(HREF, ua, { ho: HO })!;
      expect(p.auto).toBe(p.button.url);
      expect(p.button.kind).toBe('chrome');
      expect(p.auto).toBe(`intent://kringapp.com/app/?ref=pich&src=ig&tab=me&ho=${HO}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent('https://kringapp.com/app/?ref=pich&src=ig&tab=me&kr_esc=1')};end`);
      expect(decodeFallback(p.auto!)).not.toContain('ho=');   // a fallback opens in the same in-app browser: no code there
      expect(p.alt).toBe(`intent://kringapp.com/app/?ref=pich&src=ig&tab=me&ho=${HO}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`);
    }
  });
  it('iPhone FB / IG / TikTok / Messenger: x-safari-https behind a tap, plus the ⋯ menu arrow', () => {
    for (const ua of [UA.fb_ios, UA.ig_ios, UA.tiktok_ios, UA.messenger_ios]) {
      const p = escapePlan(HREF, ua)!;
      expect(p.auto).toBeNull();
      expect(p.button).toEqual({ kind: 'safari', url: 'x-safari-https://kringapp.com/app/?ref=pich&src=ig&tab=me' });
      expect(p.menuHint).toBe(true);
    }
  });
  it('keeps the stored recruiter code when the URL has none; drops our own markers', () => {
    expect(targetUrl('https://kringapp.com/app/?kr_esc=1&ho=x&openExternalBrowser=1&dings=1', { ref: 'k00412' })).toBe('https://kringapp.com/app/?ref=k00412');
    expect(targetUrl('http://kringapp.com/app/', { dings: true })).toBe('https://kringapp.com/app/?dings=1');
  });
});

describe('only when it matters, never loops', () => {
  const p = escapePlan(HREF, UA.line_android)!;
  const ios = escapePlan(HREF, UA.ig_ios)!;
  it('first open: LINE reloads in the real browser once (silent); no screen; nothing on later opens', () => {
    expect(escapeOnStart(p, { autoTried: false, firstShown: false, back: false }).kind).toBe('auto');
    expect(escapeOnStart(p, { autoTried: true, firstShown: false, back: false }).kind).toBe('none');
    expect(escapeOnStart(p, { autoTried: false, firstShown: true, back: false }).kind).toBe('none');
  });
  it('T301-020: TikTok / IG / FB cold boot (iPhone + Android): no screen and no jump before the first Reel', () => {
    for (const ua of [UA.ig_ios, UA.tiktok_ios, UA.tiktok_android, UA.fb_android, UA.messenger_ios]) {
      expect(escapeOnStart(escapePlan(HREF, ua), { autoTried: false, firstShown: false, back: false }).kind).toBe('none');
    }
    expect(escapeOnStart(ios, { autoTried: false, firstShown: false, back: false }).kind).toBe('none');
    expect(escapeOnStart(null, { autoTried: false, firstShown: false, back: false }).kind).toBe('none');
  });
  it('Android fallback came back (Chrome missing): the buttons, not another jump', () => {
    expect(escapeOnStart(escapePlan(HREF, UA.fb_android), { autoTried: true, firstShown: true, back: true }).kind).toBe('screen');
  });
});
