/* 0125 server face check (AWS Rekognition) + 19 Nov face guides 1A · 2B · 3C */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fireEvent, render, screen } from '@testing-library/react';
import { webcrypto } from 'crypto';
import { AWS_LIMITS, cardSimilarity, checkFrame, decide, liveCheck, pickOther, summarize, type AwsFace } from './faceAwsDecide';
import { signV4 } from '../../supabase/functions/face-check-aws/sigv4';
import { AWS_RETRY_TEXT, FACE_AWS_CONSENT_VERSION, frameSize, retryText } from './V5VerifyAws';
import { faceAwsOn } from './V5VerifyPick';
import { CAM_FIX_STEPS, CamFixCarousel, FaceDoneScreen, OpenInBrowserGuide, camFixOs, guideApp } from './faceGuides';
import { V5_L } from './v5Strings';

const face = (yaw: number, o: Partial<AwsFace> = {}): AwsFace => ({ confidence: 99.5, yaw, pitch: 3, brightness: 65, sharpness: 40, eyesOpen: true, eyesConf: 98,
  sunglasses: false, boxW: 0.42, ...o });
const good = { straight: [face(1)], left: [face(24)], right: [face(-22)] };

describe('decision rules (faceAwsDecide)', () => {
  it('the edge function keeps an identical copy', () => {
    const a = readFileSync(resolve(__dirname, 'faceAwsDecide.ts'), 'utf8');
    const b = readFileSync(resolve(__dirname, '../../supabase/functions/face-check-aws/decide.ts'), 'utf8');
    expect(b).toBe(a);
  });
  it('3 good frames with opposite turns are live', () => {
    expect(liveCheck(good)).toEqual({ ok: true, yaw: { straight: 1, left: 24, right: -22 } });
    // either sign works while the direction is not calibrated (yawSign 0)
    expect(liveCheck({ straight: [face(0)], left: [face(-20)], right: [face(19)] }).ok).toBe(true);
  });
  it('friendly retry reasons', () => {
    expect(liveCheck({ ...good, straight: [] })).toEqual({ ok: false, why: 'no_face' });
    expect(liveCheck({ ...good, straight: [face(1), face(3, { boxW: 0.3 })] })).toEqual({ ok: false, why: 'many_faces' });
    expect(checkFrame('straight', [face(1), face(3, { boxW: 0.05 })]).ok).toBe(true);   // a tiny face far behind is fine
    expect(liveCheck({ ...good, straight: [face(1, { brightness: 9 })] })).toEqual({ ok: false, why: 'too_dark' });
    expect(liveCheck({ ...good, straight: [face(1, { sharpness: 2 })] })).toEqual({ ok: false, why: 'too_blurry' });
    expect(liveCheck({ ...good, straight: [face(1, { boxW: 0.08 })] })).toEqual({ ok: false, why: 'too_far' });
    expect(liveCheck({ ...good, straight: [face(1, { eyesOpen: false })] })).toEqual({ ok: false, why: 'eyes_closed' });
    expect(liveCheck({ ...good, straight: [face(1, { sunglasses: true })] })).toEqual({ ok: false, why: 'sunglasses' });
    expect(liveCheck({ ...good, straight: [face(30)] })).toEqual({ ok: false, why: 'look_straight' });
    expect(liveCheck({ ...good, left: [] })).toEqual({ ok: false, why: 'turn_left_missing' });
    expect(liveCheck({ ...good, left: [face(4)] })).toEqual({ ok: false, why: 'turn_left_missing' });
    expect(liveCheck({ ...good, right: [face(4)] })).toEqual({ ok: false, why: 'turn_right_missing' });
  });
  it('a held-up photo (same yaw in all 3) or both turns the same way is not live', () => {
    expect(liveCheck({ straight: [face(2)], left: [face(2)], right: [face(2)] }).ok).toBe(false);
    expect(liveCheck({ straight: [face(0)], left: [face(22)], right: [face(25)] })).toEqual({ ok: false, why: 'turn_right_missing' });
  });
  it('a calibrated sign checks the direction', () => {
    const lim = { ...AWS_LIMITS, yawSign: -1 };
    expect(liveCheck(good, lim)).toEqual({ ok: false, why: 'turn_left_missing' });
    expect(liveCheck({ straight: [face(0)], left: [face(-20)], right: [face(21)] }, lim).ok).toBe(true);
  });
  it('pass / review', () => {
    expect(decide({ card: 97, other: null, autoOn: true })).toEqual({ result: 'pass', reasons: [] });
    expect(decide({ card: 97, other: { user_id: 'b', similarity: 93 }, autoOn: true }).result).toBe('pass');   // under 95: not a look-alike
    expect(decide({ card: 97, other: { user_id: 'b', similarity: 98.2 }, autoOn: true })).toEqual({ result: 'review', reasons: ['aws_same_face'] });
    expect(decide({ card: 62, other: null, autoOn: true })).toEqual({ result: 'review', reasons: ['card_mismatch'] });
    expect(decide({ card: null, other: null, autoOn: true })).toEqual({ result: 'review', reasons: ['no_card_face'] });
    expect(decide({ card: 99, other: null, autoOn: false })).toEqual({ result: 'review', reasons: ['auto_off'] });
    expect(decide({ card: 70, other: { user_id: 'b', similarity: 99 }, autoOn: true }).reasons).toEqual(['aws_same_face', 'card_mismatch']);
  });
  it('reads the raw Rekognition answers', () => {
    const f = summarize({ FaceDetails: [{ Confidence: 99.9, Pose: { Yaw: -12.34, Pitch: 1 }, Quality: { Brightness: 55, Sharpness: 20 }, EyesOpen: { Value: true, Confidence: 99 },
      Sunglasses: { Value: false, Confidence: 99 }, BoundingBox: { Width: 0.4 } }] });
    expect(f[0]).toMatchObject({ confidence: 99.9, yaw: -12.34, brightness: 55, eyesOpen: true, sunglasses: false, boxW: 0.4 });
    expect(summarize(null)).toEqual([]);
    expect(cardSimilarity({ FaceMatches: [{ Similarity: 88.123 }, { Similarity: 99.51 }] })).toBe(99.5);
    expect(cardSimilarity({ FaceMatches: [], UnmatchedFaces: [{}] })).toBe(0);
    expect(cardSimilarity({ FaceMatches: [], UnmatchedFaces: [] })).toBe(null);   // no face in the card photo
    expect(pickOther({ FaceMatches: [{ Similarity: 99.9, Face: { ExternalImageId: 'ME' } }, { Similarity: 96.04, Face: { ExternalImageId: 'other' } }] }, 'me'))
      .toEqual({ user_id: 'other', similarity: 96 });
    expect(pickOther({ FaceMatches: [] }, 'me')).toBe(null);
  });
});

describe('SigV4 (no AWS SDK)', () => {
  const g = globalThis as unknown as { crypto: Crypto };
  if (!g.crypto?.subtle) g.crypto = webcrypto as unknown as Crypto;
  const base = { region: 'us-east-1', service: 'service', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', now: new Date('2015-08-30T12:36:00Z') };
  it('matches AWS’s own test vectors (get-vanilla, post-vanilla)', async () => {
    const get = await signV4({ ...base, method: 'GET', url: 'https://example.amazonaws.com/', headers: {}, body: '' });
    expect(get.authorization).toBe('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
    const post = await signV4({ ...base, method: 'POST', url: 'https://example.amazonaws.com/', headers: {}, body: '' });
    expect(post.authorization).toMatch(/Signature=5da7c1a2acd57cee7505fc6676e4e544621c30862966e37dddb68e92efbe5d6b$/);
    expect(post['x-amz-date']).toBe('20150830T123600Z');
    expect(post.host).toBeUndefined();
  });
});

describe('client: switch, photo size, texts', () => {
  it('only face_aws_on = 1 turns the server check on', () => {
    expect(faceAwsOn({ face_aws_on: 1 })).toBe(true);
    expect(faceAwsOn({ face_aws_on: 0 })).toBe(false);
    expect(faceAwsOn({})).toBe(false);
    expect(faceAwsOn(null)).toBe(false);
  });
  it('photos are at most 480 px wide, same shape', () => {
    expect(frameSize(640, 480)).toEqual({ w: 480, h: 360 });
    expect(frameSize(480, 640)).toEqual({ w: 480, h: 640 });
    expect(frameSize(320, 240)).toEqual({ w: 320, h: 240 });
    expect(frameSize(0, 0)).toEqual({ w: 0, h: 0 });
  });
  it('the consent version is new enough for the database (>= face-2026-11-19a)', () => {
    expect(FACE_AWS_CONSENT_VERSION >= 'face-2026-11-19a').toBe(true);
    expect(FACE_AWS_CONSENT_VERSION).toMatch(/^face-[0-9]{4}-[0-9]{2}-[0-9]{2}[a-z]?$/);
  });
  it('every retry reason has its own line; unknown → the no-face line', () => {
    expect(retryText('too_dark')).toBe('Too dark — face a light');
    expect(retryText('weird')).toBe(AWS_RETRY_TEXT.no_face);
  });
  it('every new member-app line has Thai and the other 4 languages', () => {
    const keys = new Set<string>();
    for (const f of ['V5VerifyAws.tsx', 'faceGuides.tsx']) for (const m of readFileSync(resolve(__dirname, f), 'utf8').matchAll(/\bL\('((?:[^'\\]|\\.)*)'\)/g)) keys.add(m[1]);
    Object.values(AWS_RETRY_TEXT).forEach((k) => keys.add(k));
    Object.values(CAM_FIX_STEPS).flat().forEach((k) => keys.add(k));
    expect(keys.size).toBeGreaterThan(40);
    for (const k of keys) for (const l of ['th', 'zh', 'hi', 'ja', 'ko']) expect(V5_L[l][k], `${l}: ${k}`).toBeTruthy();
    expect(V5_L.th['Checking your face…']).toBe('กำลังตรวจ…');
    expect(V5_L.th['Open in your browser |first']).toBe('เปิดในเบราว์เซอร์|ก่อนนะ');
  });
});

const TH = (en: string) => V5_L.th[en] || en;
describe('1A · 2B · 3C', () => {
  const UA = {
    ig: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0',
    tt: 'Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 musical_ly_2023',
    line: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.3.0',
    safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    chrome: 'Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
  };
  it('1A only for Instagram / TikTok (LINE keeps its own button); 3C picks the phone', () => {
    expect(guideApp(UA.ig)).toBe('instagram');
    expect(guideApp(UA.tt)).toBe('tiktok');
    expect(guideApp(UA.line)).toBe(null);
    expect(guideApp(UA.safari)).toBe(null);
    expect(camFixOs(UA.safari)).toBe('ios');
    expect(camFixOs(UA.chrome)).toBe('android');
  });
  it('1A: two numbered pictures and a Copy link button, all in Thai', () => {
    render(<div className="v8-app-root"><OpenInBrowserGuide L={TH} app="instagram" link="https://kringapp.com/app/?open=verify" onClose={() => undefined} /></div>);
    expect(screen.getByText('แตะ ⋯ มุมขวาบน')).toBeInTheDocument();
    expect(screen.getByText('แตะ “เปิดในเบราว์เซอร์”')).toBeInTheDocument();
    expect(screen.getByText('ก่อนนะ')).toHaveClass('kfg-grad');
    expect(document.getElementById('verifyCopyLink')).toHaveTextContent('คัดลอกลิงก์');
    expect(screen.getByText('แล้ววางใน Safari หรือ Chrome')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Open in|Copy link/);   // one language at a time
  });
  it('2B checking / pending / pass', () => {
    const go = vi.fn();
    const { rerender } = render(<FaceDoneScreen L={TH} state="checking" selfie={null} sent onContinue={go} onClose={() => undefined} />);
    expect(screen.getByText('ไม่ต้องรอหน้านี้ ออกไปเล่นต่อได้เลย')).toBeInTheDocument();
    expect(document.querySelector('.kfg-h2')).toHaveTextContent('กำลังตรวจ…');
    expect(screen.getByText('ตรวจหน้า · ไม่ถึง 1 นาที')).toBeInTheDocument();
    expect(screen.getByText('ผ่านแล้วเราแจ้งเตือนให้')).toBeInTheDocument();
    fireEvent.click(screen.getByText('ใช้ Kring ต่อ'));
    expect(go).toHaveBeenCalled();
    rerender(<FaceDoneScreen L={TH} state="pending" selfie={null} sent onContinue={go} onClose={() => undefined} />);
    expect(screen.getByText('ทีมงานกำลังตรวจ')).toBeInTheDocument();
    expect(screen.getByText('ผ่านแล้วเราแจ้งเตือนให้')).toBeInTheDocument();
    rerender(<FaceDoneScreen L={TH} state="pass" selfie="data:image/jpeg;base64,xx" sent={false} onContinue={go} onClose={() => undefined} />);
    expect(document.querySelector('[data-tick3="pass"] .d')).toHaveTextContent('✓');
    expect(screen.getAllByText('ยืนยันแล้ว ✓').length).toBeGreaterThan(0);
    expect(screen.getByText('ตรวจในมือถือแล้ว')).toBeInTheDocument();   // on-phone pass: no "photo sent" claim
    expect(screen.queryByText('ผ่านแล้วเราแจ้งเตือนให้')).toBeNull();
  });
  it('3C: 3 cards, switch iPhone ↔ Android, Try again', () => {
    const retry = vi.fn();
    render(<CamFixCarousel L={TH} ua={UA.safari} onRetry={retry} onClose={() => undefined} />);
    expect(document.querySelectorAll('[data-card]').length).toBe(3);
    expect(screen.getByText('แตะ aA ข้างลิงก์')).toBeInTheDocument();
    fireEvent.click(document.getElementById('verifyCamFixSwitch')!);
    expect(screen.getByText('แตะรูปแม่กุญแจ')).toBeInTheDocument();
    expect(screen.getByText('เลือก “สิทธิ์”')).toBeInTheDocument();
    fireEvent.click(document.getElementById('verifyCamFixNext')!);
    expect(document.querySelectorAll('.kfg-dots i.on').length).toBe(1);
    fireEvent.click(document.getElementById('verifyCamRetry')!);
    expect(retry).toHaveBeenCalled();
  });
});
