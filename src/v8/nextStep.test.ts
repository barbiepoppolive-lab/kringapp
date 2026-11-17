import { beforeEach, describe, expect, it } from 'vitest';
import { HIDE_MS, hideNextStep, nextStepHidden, pickNextStep, shortNote, type NextStepInput } from './nextStep';
import { nextStepCopy } from './V5NextStep';
import { V5_L } from './v5Strings';
import type { KxClaim, KxPrize } from './v5Kx';

const prize = (o: Partial<KxPrize> = {}): KxPrize => ({ id: 'p1', kind: 'founding', week: null, rank: null, founding_no: 7, amount: 100, rings: null, status: 'won', claim_id: null, created_at: '2026-11-16', ...o });
const claim = (o: Partial<KxClaim> = {}): KxClaim => ({ id: 'c1', brand: 'grab' as KxClaim['brand'], amount: 100, status: 'pending', value: null, code: null, activation_url: null, used_at: null,
  created_at: '2026-11-16', assigned_at: null, kind: 'founding', week: null, rank: null, founding_no: 7, ...o });
const reel = (status: 'approved' | 'pending' | 'hidden', created_at: string, note: string | null = null) => ({ status, created_at, note });
const base = (o: Partial<NextStepInput> = {}): NextStepInput => ({ hasCard: true, reels: [], prizes: [], claims: [], verified: false, foundingLeft: 12, foundingThb: 100, rings: 18, floor: 25, ...o });

describe('next step: order', () => {
  it('1. no card: nothing (onboarding handles it)', () => { expect(pickNextStep(base({ hasCard: false }))).toBeNull(); });
  it('waits for the Reels to load', () => { expect(pickNextStep(base({ reels: null }))).toBeNull(); });
  it('2. no Reel yet: post the first Reel for ฿100', () => {
    const s = pickNextStep(base())!;
    expect(s).toMatchObject({ kind: 'reel', amount: 100, dismissible: true });
    expect(nextStepCopy(s)).toMatchObject({ th: 'โพสต์รีลแรก รับ ฿100', en: 'Post your first Reel, get ฿100' });
  });
  it('2. no Founding seats left: no amount promised', () => {
    const s = pickNextStep(base({ foundingLeft: 0 }))!;
    expect(s.kind).toBe('reel'); expect(s.amount).toBeUndefined();
    expect(nextStepCopy(s).en).toBe('Post your first Reel');
  });
  it('2 wins even before rewards load', () => { expect(pickNextStep(base({ prizes: null, claims: null }))!.kind).toBe('reel'); });
  it('3. latest Reel hidden with a note: try again + the note', () => {
    const s = pickNextStep(base({ reels: [reel('approved', '2026-11-10'), reel('hidden', '2026-11-15', '  Too dark —\n film in daylight ')] }))!;
    expect(s).toMatchObject({ kind: 'retry', note: 'Too dark — film in daylight', dismissible: true });
    expect(nextStepCopy(s)).toMatchObject({ th: 'ลองโพสต์ใหม่อีกครั้ง', en: 'Try again', btnEn: 'Post again' });
  });
  it('3. a hidden Reel without a note does not ask to try again', () => {
    expect(pickNextStep(base({ reels: [reel('hidden', '2026-11-15')] }))!.kind).toBe('climb');
  });
  it('3. only the LATEST Reel counts', () => {
    expect(pickNextStep(base({ reels: [reel('hidden', '2026-11-10', 'blurry'), reel('approved', '2026-11-15')] }))!.kind).toBe('climb');
  });
  it('3. long notes are kept short', () => { expect(shortNote('a'.repeat(200)).length).toBe(90); });
  it('4. latest Reel pending: info only, no button', () => {
    const s = pickNextStep(base({ reels: [reel('pending', '2026-11-16')], prizes: [prize()] }))!;
    expect(s.kind).toBe('pending'); expect(nextStepCopy(s).btnEn).toBeUndefined();
  });
  it('after the Reel steps, waits for rewards', () => { expect(pickNextStep(base({ reels: [reel('approved', '2026-11-16')], prizes: null }))).toBeNull(); });
  it('5. Founding prize won, not claimed: claim it (not dismissible)', () => {
    const p = prize({ amount: 100 });
    const s = pickNextStep(base({ reels: [reel('approved', '2026-11-16')], prizes: [p], claims: [claim()] }))!;
    expect(s).toMatchObject({ kind: 'claim', prize: p, amount: 100, dismissible: false });
    expect(nextStepCopy(s)).toMatchObject({ th: 'รับ ฿100 ของคุณ', en: 'Claim your ฿100' });
  });
  it('5. a weekly or already-claimed prize is not step 5', () => {
    const s = pickNextStep(base({ reels: [reel('approved', '2026-11-16')], prizes: [prize({ kind: 'weekly' }), prize({ status: 'claimed' })], verified: true }))!;
    expect(s.kind).toBe('climb');
  });
  it('6. claim held and not verified: verify (not dismissible)', () => {
    const s = pickNextStep(base({ reels: [reel('approved', '2026-11-16')], prizes: [prize({ status: 'claimed' })], claims: [claim({ status: 'pending' })] }))!;
    expect(s).toMatchObject({ kind: 'verify', dismissible: false });
    expect(nextStepCopy(s).th).toBe('ยืนยันใบหน้าเพื่อรับโค้ด');
  });
  it('6. skipped when verified, when the face check is already waiting, or when the code arrived', () => {
    const r = [reel('approved', '2026-11-16')];
    expect(pickNextStep(base({ reels: r, claims: [claim()], verified: true }))!.kind).toBe('climb');
    expect(pickNextStep(base({ reels: r, claims: [claim()], verifyPending: true }))!.kind).toBe('climb');
    expect(pickNextStep(base({ reels: r, claims: [claim({ status: 'assigned' })] }))!.kind).toBe('climb');
  });
  it('7. everything done: climb, with Rings and the gap to 25', () => {
    expect(pickNextStep(base({ reels: [reel('approved', '2026-11-16')], rings: 18, verified: true }))).toMatchObject({ kind: 'climb', rings: 18, floor: 25, gap: 7, dismissible: true });
    expect(pickNextStep(base({ reels: [reel('approved', '2026-11-16')], rings: 40, floor: null }))).toMatchObject({ gap: 0, floor: 25 });
  });
});

describe('next step: hide for a day', () => {
  beforeEach(() => { localStorage.clear(); });
  it('hides one step for 24 h, per member', () => {
    const t = 1_800_000_000_000;
    hideNextStep('u1', 'reel', t);
    expect(nextStepHidden('u1', 'reel', t + 1000)).toBe(true);
    expect(nextStepHidden('u1', 'climb', t + 1000)).toBe(false);
    expect(nextStepHidden('u2', 'reel', t + 1000)).toBe(false);
    expect(nextStepHidden('u1', 'reel', t + HIDE_MS + 1)).toBe(false);
  });
  it('claim and verify can never be hidden', () => {
    hideNextStep('u1', 'claim'); hideNextStep('u1', 'verify');
    expect(nextStepHidden('u1', 'claim')).toBe(false); expect(nextStepHidden('u1', 'verify')).toBe(false);
  });
});

describe('next step: words', () => {
  const kinds = ['reel', 'retry', 'pending', 'claim', 'verify', 'climb'] as const;
  it('every English line has a translation in every language', () => {
    for (const k of kinds) {
      const c = nextStepCopy({ kind: k, dismissible: true, amount: 100 });
      for (const key of [c.key, c.btnEn].filter(Boolean) as string[]) for (const l of ['th']) expect(V5_L[l][key], `${l}: ${key}`).toBeTruthy();
    }
  });
  it('no banned words', () => {
    const all = kinds.map((k) => { const c = nextStepCopy({ kind: k, dismissible: true, amount: 100 }); return [c.th, c.en, c.btnTh, c.btnEn].join(' '); })
      .concat(Object.entries(V5_L.th).filter(([k]) => /next step|Rings ·|board|Hide for a day|checking your Reel|Verify your face|Claim your|get \{0\}/.test(k)).flat()).join(' ').toLowerCase();
    for (const w of ['meet', 'guide', 'tour', 'host', 'creator', 'reviews', 'hidden gem', 'alcohol', 'gift', 'wallet', 'credit', 'lucky', 'draw', 'temple', 'ลุ้น']) expect(all.includes(w), w).toBe(false);
  });
});
