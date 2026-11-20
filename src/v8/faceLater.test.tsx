// 0111 (founder 18 Nov) "Do it later": the face check is needed ONLY to claim a prize.
//   · sign-up keeps the check right after the card photo, with a clear "Do it later" (Thai "ไว้ทีหลัง") that never blocks anything
//   · the app's own copy of the 0093 gate is off; the server switch face_gate_on = 0 (migration 0111)
//   · Me shows a gentle, hideable "Verify your face in 3 seconds" row
//   · a prize claim asks for the 3-second check first (and the server answers KR8_VERIFY_FIRST without it)
//   · claims send no photo (0092) and 0111 stops holding them as "no_photo"
//   · invite Rings + recruiter pay count the friend's FIRST APPROVED Reel, not the face check
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import type { KxPrize, KxRewards } from './v5Kx';
import type { V5Profile } from './v5Live';
import { V5_L } from './v5Strings';

const kxMock = vi.hoisted(() => ({ kxClaimPrize: vi.fn(), kxRecentClaims: vi.fn(async () => []), kxMarkUsed: vi.fn() }));
vi.mock('./v5Kx', async (orig) => ({ ...(await orig<typeof import('./v5Kx')>()), ...kxMock }));
const liveMock = vi.hoisted(() => ({ v5SignInLine: vi.fn(async () => 'redirect'), v5HandoffCreate: vi.fn(async () => 'a'.repeat(64)), v5LogClient: vi.fn(), v5VerifySimple: vi.fn() }));
vi.mock('./v5Live', async (orig) => ({ ...(await orig<typeof import('./v5Live')>()), ...liveMock }));
const { ClaimPage } = await import('./V5KxRewards');
const { V5VerifySheet } = await import('./V5Verify');
const { MeView } = await import('./V5Me');
const { hideVerifyRow, verifyRowHidden, VERIFY_HIDE_MS } = await import('./nextStep');

const L = (s: string) => s;
const TH = (s: string) => V5_L.th[s] || s;
const Lf = (s: string, a: string, b?: string) => s.replace('{0}', a).replace('{1}', b ?? '');
const prize = (): KxPrize => ({ id: 'pz1', kind: 'founding', week: null, rank: null, founding_no: 7, amount: 100, rings: null, status: 'won', claim_id: null, created_at: '2026-11-16T00:00:00Z' });
const rewards = (x: Partial<KxRewards> = {}): KxRewards => ({ week: 0, rank: null, lifetime: 0, level: 1, gap: null, ends_at: '2026-11-24T00:00:00Z', member_no: 7, founding_no: 7,
  founding_left: 40, floor: 25, rules: { truemoney_payout_pct: 100 }, ladder: [1500, 900, 600, 500, 400, 250, 150, 100, 0, 0], streak: 0, checked_in_today: false, prizes: [], claims: [],
  line_linked: false, claim_needs_line: false, claim_face_check: true, ...x });
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } kxMock.kxClaimPrize.mockReset(); });
afterEach(() => cleanup());

describe('sign-up: the face check stays, with "Do it later"', () => {
  const sheet = (mode: 'signup' | 'me' | 'claim', l = L, onClose = () => undefined) =>
    render(<V5VerifySheet L={l} photo="https://x/p.jpg" mode={mode} onClose={onClose} onSent={() => undefined} onAddPhoto={() => undefined} errText={() => 'err'} />);
  it('shows a clear "Do it later" that closes without starting the camera', () => {
    const onClose = vi.fn();
    sheet('signup', L, onClose);
    expect(document.getElementById('verifyIntro')!.textContent).toContain('You only need it to claim a prize');
    const later = document.getElementById('verifyLater')!;
    expect(later.textContent).toBe('Do it later');
    fireEvent.click(later);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.getElementById('verifyVideo')).toBeNull();
  });
  it('Thai mode: Thai only, "ไว้ทีหลัง"', () => {
    sheet('signup', TH);
    expect(document.getElementById('verifyLater')!.textContent).toBe('ไว้ทีหลัง');
    expect(document.getElementById('verifyIntro')!.textContent).not.toMatch(/[A-Za-z]{4,}.*claim/);
  });
  it('at a claim the same check is the required step ("Not now" goes back to the prize)', () => {
    sheet('claim');
    expect(document.getElementById('verifyIntro')!.textContent).toContain('One quick step to get your prize');
    expect(document.getElementById('verifyLater')!.textContent).toBe('Not now');
  });
  it('every new string has Thai', () => {
    for (const k of ['Do it later', 'You only need it to claim a prize. Look at the camera, turn a little, blink.', 'One quick step to get your prize',
      'A 3-second face check keeps every prize one person, one account.', 'Verify your face in 3 seconds', 'Be ready to claim your prize the moment you win.', 'Hide'])
      expect(V5_L.th[k], k).toBeTruthy();
  });
});

describe('prize claim needs the face check', () => {
  const page = (x: { verified?: boolean; verifyPending?: boolean; onVerify?: () => void }) =>
    render(<ClaimPage L={L} Lf={Lf} lang="en" data={rewards()} prize={prize()} onBack={() => undefined} onDone={() => undefined} toast={() => undefined} {...x} />);
  it('not verified: Claim opens the 3-second check first, no claim is sent', () => {
    const onVerify = vi.fn();
    page({ verified: false, onVerify });
    fireEvent.click(document.getElementById('kxClaimGo')!);
    expect(onVerify).toHaveBeenCalledTimes(1);
    expect(document.getElementById('kxClaimVerify')!.textContent).toContain('Verify your face to claim');
    expect((document.getElementById('kxClaimGo') as HTMLButtonElement).disabled).toBe(true);
    expect(document.getElementById('kxClaimFace')).toBeNull();
    expect(kxMock.kxClaimPrize).not.toHaveBeenCalled();
    fireEvent.click(document.getElementById('kxClaimVerifyGo')!);
    expect(onVerify).toHaveBeenCalledTimes(2);
  });
  it('once verified the claim goes on to the 3-second claim face, as before', () => {
    const onVerify = vi.fn();
    const r = page({ verified: false, onVerify });
    fireEvent.click(document.getElementById('kxClaimGo')!);
    r.rerender(<ClaimPage L={L} Lf={Lf} lang="en" data={rewards()} prize={prize()} onBack={() => undefined} onDone={() => undefined} toast={() => undefined} verified onVerify={onVerify} />);
    expect(document.getElementById('kxClaimVerify')).toBeNull();
    fireEvent.click(document.getElementById('kxClaimGo')!);
    expect(document.getElementById('kxClaimFace')).not.toBeNull();
  });
  it('a check already waiting for the team does not block the claim (the server holds it)', () => {
    page({ verified: false, verifyPending: true, onVerify: vi.fn() });
    fireEvent.click(document.getElementById('kxClaimGo')!);
    expect(document.getElementById('kxClaimVerify')).toBeNull();
    expect(document.getElementById('kxClaimFace')).not.toBeNull();
  });
  it('server answers VERIFY_FIRST → the verify step shows', async () => {
    kxMock.kxClaimPrize.mockRejectedValue(Object.assign(new Error('KR8_VERIFY_FIRST'), { code: 'VERIFY_FIRST' }));
    render(<ClaimPage L={L} Lf={Lf} lang="en" data={rewards({ claim_face_check: undefined })} prize={prize()} onBack={() => undefined} onDone={() => undefined} toast={() => undefined}
      onVerify={vi.fn()} />);
    fireEvent.click(document.getElementById('kxClaimGo')!);   // verified not known yet: the server decides
    await waitFor(() => expect(document.getElementById('kxClaimVerify')).not.toBeNull());
    expect(kxMock.kxClaimPrize).toHaveBeenCalledTimes(1);
  });
  it('Argon bug: the claim never uploads a photo (0092) and the server no longer holds it as "no_photo" (0111)', () => {
    const src = read('./V5KxRewards.tsx');
    expect(src).toContain('face && photo && !face');   // deliberate since 0092: no claim photo leaves the phone
    const sql = read('../../supabase/migrations/0111_kr8_face_later.sql');
    expect(sql).toContain("if photo is null and public.kr8_rcfg('claim_needs_photo', 0) = 1 then review := array_append(review, 'no_photo')");
  });
});

describe('Me: a gentle nudge, never a gate', () => {
  const p = { user_id: 'me', first_name: 'Ploy', photo: null, langs: ['TH'], bio: '', area: 'Ari', who: 'local', verified: false, ig_handle: null, interests: [],
    member_no: '00090', online: true, here: false, mine: true, level: { level: 'tea', posts: 1, visits: 0, points: 5, next: 'pandan', need_points: 10, pct: 30 },
    followers: 0, following: 0, likes: 0, gifts: 0, i_follow: false, follows_me: false,
    reels: [{ id: 'r1', poster_path: 'x.jpg', status: 'approved', created_at: '2026-11-18T00:00:00Z' }] } as unknown as V5Profile;
  const me = (x: { verifyState?: 'none' | 'pending' | 'verified'; verifyHidden?: boolean; onVerifyHide?: () => void; onVerify?: () => void; l?: (s: string) => string }) => render(
    <div className="v8-app-root">
      <MeView L={x.l || L} Lf={Lf as never} p={p} rank={null} posters={{}} savedCount={0} savedImgs={[]} unread={false} verifyState={x.verifyState || 'none'} onTop10={() => undefined}
        onList={() => undefined} onSettings={() => undefined} onActivity={() => undefined} onEdit={() => undefined} onShare={() => undefined} onCode={() => undefined}
        onSaved={() => undefined} onRewards={() => undefined} onReel={() => undefined} onPost={() => undefined} onVerify={x.onVerify || (() => undefined)}
        reelsSlot={<div id="slot" />} verifyHidden={x.verifyHidden} onVerifyHide={x.onVerifyHide} />
    </div>);
  it('shows "Verify your face in 3 seconds" with a prize reason; tap opens the check, × hides it', () => {
    const onVerify = vi.fn(), onVerifyHide = vi.fn();
    me({ onVerify, onVerifyHide });
    const row = document.getElementById('meVerify')!;
    expect(row.textContent).toContain('Verify your face in 3 seconds');
    expect(row.textContent).toContain('claim your prize');
    expect(row.textContent).not.toContain('People reply more');
    fireEvent.click(document.getElementById('meVerifyGo')!);
    expect(onVerify).toHaveBeenCalled();
    fireEvent.click(document.getElementById('meVerifyHide')!);
    expect(onVerifyHide).toHaveBeenCalled();
  });
  it('hidden → gone; verified → gone; pending → shows the waiting line without ×', () => {
    me({ verifyHidden: true, onVerifyHide: () => undefined });
    expect(document.getElementById('meVerify')).toBeNull();
    cleanup();
    me({ verifyState: 'verified' });
    expect(document.getElementById('meVerify')).toBeNull();
    cleanup();
    me({ verifyState: 'pending', verifyHidden: true, onVerifyHide: () => undefined });
    expect(document.getElementById('meVerify')!.textContent).toContain('We’re checking');
    expect(document.getElementById('meVerifyHide')).toBeNull();
  });
  it('Thai mode: Thai only', () => {
    me({ l: TH, onVerifyHide: () => undefined });
    const t = document.getElementById('meVerify')!.textContent || '';
    expect(t).toContain('ยืนยันใบหน้าใน 3 วินาที');
    expect(t).not.toMatch(/Verify|prize/);
  });
  it('× hides it for a week per member, then it comes back', () => {
    const now = Date.parse('2026-11-18T10:00:00Z');
    expect(verifyRowHidden('u1', 0, now)).toBe(false);
    hideVerifyRow('u1', now);
    expect(verifyRowHidden('u1', 0, now + 1000)).toBe(true);
    expect(verifyRowHidden('u2', 0, now + 1000)).toBe(false);
    expect(verifyRowHidden('u1', 0, now + VERIFY_HIDE_MS + 1)).toBe(false);
  });
});

describe('the app no longer gates being seen / posting / chat on the face check', () => {
  const app = read('./KringAppV8.tsx');
  it('the client copy of the 0093 gate is off and the 6-second face pop-up is gone', () => {
    expect(app).toMatch(/const FACE_GATE_ON = true;/);   // 19 Nov: the gate is back on (founder)
    expect(app).toContain('faceGateRef.current = FACE_GATE_ON &&');
    expect(app).not.toContain("const key = 'kr8_facecheck2_asked:'");
  });
  it('sign-up still opens the check right after the card ("signup" words), and a claim opens it on top of the claim', () => {
    expect(app).toContain("setVerifyMode(wasNew ? 'signup' : 'me')");
    expect(app).toMatch(/sheet === 'claim' && claimVerify && live && v5Card[\s\S]{0,120}mode="claim"/);
  });
});

describe('migration 0111', () => {
  const sql = read('../../supabase/migrations/0111_kr8_face_later.sql');
  const undo = read('../../supabase/undo/0111_kr8_face_later_UNDO.sql');
  it('gate behind face_gate_on (default 0); every 0093 condition kept for the switch', () => {
    expect(sql).toContain("('face_gate_on', 0,");
    expect(sql).toMatch(/select public\.kr8_rcfg\('face_gate_on', 0\) = 1\s+and exists \(select 1 from public\.kr8_members m\s+where m\.user_id = p_user and not m\.verified and not m\.ghost/);
  });
  it('claim: KR8_VERIFY_FIRST unless verified or a check is pending; all 0075 guards still there', () => {
    expect(sql).toContain("raise exception 'KR8_VERIFY_FIRST'");
    expect(sql).toContain("status = 'pending'");
    for (const g of ["'KR8_FACE_NEEDED'", "'KR8_ONE_ACCOUNT'", "'KR8_DEVICE'", "'KR8_WEEK_REVIEW'", "'KR8_NEED_LINE'", "'face_far'", "'face_copy'", "'no_verified_print'", 'kr8_account_links'])
      expect(sql, g).toContain(g);
  });
  it('invites: first approved Reel, cap / kill switch / no self / no circle / ghost / test / same-face kept; trigger on Reel approval', () => {
    expect(sql).toMatch(/p\.kind = 'reel' and p\.status = 'approved' and not coalesce\(p\.hidden, false\)/);
    expect(sql).toContain('not public.kr8_invite_first_reel(p_friend)');
    for (const g of ["kr8_rcfg('invite', 10)", "kr8_rcfg('invite_day_cap', 20)", 'p_inviter <> p_friend', 'kr8_is_test_member(p_friend)', "not coalesce(f.ghost, false)",
      "l.reason in ('face', 'face_maybe', 'device')", 'coalesce(i.ref_set_at, i.created_at) <= coalesce(f.ref_set_at, f.created_at)'])
      expect(sql, g).toContain(g);
    expect(sql).toContain('create trigger kr8_invite_reel_trg after insert or update of status, hidden on public.kr8_posts');
    expect(sql).toContain('create trigger kr8_invite_trg after insert or update of ref_code on public.kr8_members');
  });
  it('does not touch the 0109 board math or 0110 view-as-member', () => {
    for (const f of ['kr8_week_board', 'kr8_score_breakdown', 'kr8_member_rings', 'kr8_my_invites', 'kr8_admin_mirror', 'kr8_people(']) expect(sql, f).not.toContain(`function public.${f}`);
  });
  it('undo puts back 0093 / 0075 / 0109 and removes the Reel trigger', () => {
    expect(undo).toContain('drop trigger if exists kr8_invite_reel_trg on public.kr8_posts;');
    expect(undo).toContain('create trigger kr8_invite_trg after insert or update of verified, ref_code on public.kr8_members');
    const code = undo.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(code).not.toContain('face_gate_on');
    expect(code).not.toContain('claim_needs_verified');
    expect(code).not.toContain('kr8_invite_first_reel(p_friend)');
  });
});
