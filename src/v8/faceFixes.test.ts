// face-fixes (19 Nov): LINE links open outside, live scan hints, no second scan at claim for verified members, face privacy link.
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { lineOut } from './invite';
import { NOFACE_MS, shownHint } from './verifyLive';
import { facePassedHere, markFacePassed, skipClaimFace } from './faceSkip';
import { V5_L } from './v5Strings';

const UA = {
  line: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.3.0',
  ig: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0',
  safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

describe('1 · LINE share links open in the real browser', () => {
  it('adds openExternalBrowser=1 only inside LINE, keeping params and hash', () => {
    expect(lineOut('https://kringapp.com/app/?reel=x&ref=k00184#top', UA.line)).toBe('https://kringapp.com/app/?reel=x&ref=k00184&openExternalBrowser=1#top');
    expect(lineOut('https://kringapp.com/r/abc', UA.line)).toBe('https://kringapp.com/r/abc?openExternalBrowser=1');
    expect(lineOut('https://kringapp.com/r/abc', UA.ig)).toBe('https://kringapp.com/r/abc');
    expect(lineOut('https://kringapp.com/r/abc', UA.safari)).toBe('https://kringapp.com/r/abc');
  });
  it('never doubles it, and leaves LIFF / non-web links alone', () => {
    expect(lineOut('https://kringapp.com/app/?openExternalBrowser=1', UA.line)).toBe('https://kringapp.com/app/?openExternalBrowser=1');
    expect(lineOut('https://liff.line.me/123-abc?ref=k00184', UA.line)).toBe('https://liff.line.me/123-abc?ref=k00184');
    expect(lineOut('mailto:ops@kringapp.com', UA.line)).toBe('mailto:ops@kringapp.com');
    expect(lineOut('', UA.line)).toBe('');
  });
  it('the face check has one LINE "Open in browser" button that reopens the check outside', () => {
    const src = readFileSync('src/v8/V5Verify.tsx', 'utf8');
    expect(src).toMatch(/inApp === 'line' && <button[^>]*id="verifyOpenOutside"/);
  });
});

describe('2 · live hints during the scan', () => {
  it('too dark wins, even before the tracker is ready', () => {
    expect(shownHint({ tracker: null, tracking: false, dark: true, noFaceMs: 0 })).toBe('light');
    expect(shownHint({ tracker: 'face', tracking: true, dark: true, noFaceMs: 5000 })).toBe('light');
  });
  it('no face shows only after ~2 s', () => {
    expect(shownHint({ tracker: 'face', tracking: true, dark: false, noFaceMs: 500 })).toBe(null);
    expect(shownHint({ tracker: 'face', tracking: true, dark: false, noFaceMs: NOFACE_MS })).toBe('face');
  });
  it('moving a lot → hold still; nothing while not tracking', () => {
    expect(shownHint({ tracker: 'still', tracking: true, dark: false, noFaceMs: 0 })).toBe('still');
    expect(shownHint({ tracker: 'still', tracking: false, dark: false, noFaceMs: 0 })).toBe(null);
  });
  it('the new lines have natural Thai', () => {
    for (const k of ['Move your face into the oval', 'Too dark — face a light', 'Hold still', 'How we protect your face']) expect(V5_L.th[k], k).toBeTruthy();
    expect(V5_L.th['How we protect your face']).toBe('เราปกป้องข้อมูลใบหน้าของคุณอย่างไร');
  });
});

describe('3 · no second scan at claim for a verified member', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });
  it('verified AND (passed on this phone OR approved)', () => {
    expect(skipClaimFace({ verified: true, passedHere: true, approved: false })).toBe(true);
    expect(skipClaimFace({ verified: true, passedHere: false, approved: true })).toBe(true);
    expect(skipClaimFace({ verified: true, passedHere: false, approved: false })).toBe(false);
    expect(skipClaimFace({ verified: false, passedHere: true, approved: false })).toBe(false);
  });
  it('the phone remembers a pass per account (a flag, no face data)', () => {
    expect(facePassedHere('u1')).toBe(false);
    markFacePassed('u1');
    expect(facePassedHere('u1')).toBe(true);
    expect(facePassedHere('u2')).toBe(false);
    expect(facePassedHere('')).toBe(false);
  });
  it('the claim falls back to the scan when the server still asks for a face code', () => {
    const src = readFileSync('src/v8/V5KxRewards.tsx', 'utf8');
    expect(src).toMatch(/props\.skipFace && !skipTried\.current/);
    expect(src).toMatch(/c === 'FACE_NEEDED'\) \{[^}]*setStep\('face'\)/);
  });
});

describe('4 · face privacy link + terms section', () => {
  it('the scan screen links to kringapp.com/terms#face in a new tab', () => {
    const src = readFileSync('src/v8/V5Verify.tsx', 'utf8');
    expect(src).toContain("'https://kringapp.com/terms#face'");
    expect(src).toMatch(/id="verifyPrivacy" href=\{FACE_PRIVACY_URL\} target="_blank"/);
  });
  it('terms page has the face section in Thai and English', () => {
    const html = readFileSync('public/terms.html', 'utf8');
    expect(html).toContain('id="face"');
    expect(html).toContain('Face check &amp; your privacy');
    expect(html).toContain('การสแกนใบหน้าและความเป็นส่วนตัวของคุณ');
    expect(html.match(/data-anchor="face"/g)?.length).toBe(2);
  });
});
