// 0066 one person, one account: claim face check, LINE step, week check, LINE link mode, founder alert wording,
// admin Same person? clusters, week flags; 50-user audit P1-4 (new cards default to local).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { lineAuth, type LineAdmin, type LineEnv } from '../../supabase/functions/line-auth/core';
import { buildMail, holdLine, subjectFor } from '../../supabase/functions/notify-reward/mail.ts';
import { buildClusters, istWhen, weekFlags, weekRange, type DupOverview, type WeekRow } from '../venue/dupAdmin';
import { goodFrame, holdNext, HOLD_MS } from './V5ClaimFace';
import type { KxPrize, KxRewards } from './v5Kx';

const kxMock = vi.hoisted(() => ({ kxRanking: vi.fn(async () => ({ week_start: '', ends_at: '', scope: 'all', area: null, total: 0, paid_ranks: 8, floor: 25, posters: 0, min_posters: 0, payout_on: true, open_seats: 8, prizes: [1500, 900, 600, 500, 400, 250, 150, 100], rows: [], me: null, gap: null, mine: null })), kxClaimPrize: vi.fn(), kxRecentClaims: vi.fn(async () => []), kxMarkUsed: vi.fn() }));
vi.mock('./v5Kx', async (orig) => ({ ...(await orig<typeof import('./v5Kx')>()), ...kxMock }));
const liveMock = vi.hoisted(() => ({ v5SignInLine: vi.fn(async () => 'redirect') }));
vi.mock('./v5Live', async (orig) => ({ ...(await orig<typeof import('./v5Live')>()), ...liveMock }));
const { ClaimPage, RewardsPage } = await import('./V5KxRewards');

const L = (s: string) => s;
const Lf = (s: string, a: string, b?: string) => s.replace('{0}', a).replace('{1}', b ?? '');
const prize = (x: Partial<KxPrize> = {}): KxPrize => ({ id: 'pz1', kind: 'founding', week: null, rank: null, founding_no: 7, amount: 100, rings: null, status: 'won', claim_id: null, created_at: '2026-11-16T00:00:00Z', ...x });
const rewards = (x: Partial<KxRewards> = {}): KxRewards => ({ week: 0, rank: null, lifetime: 0, level: 1, gap: null, ends_at: '2026-11-24T00:00:00Z', member_no: 7, founding_no: 7,
  founding_left: 40, floor: 25, rules: { truemoney_payout_pct: 100 }, ladder: [1500, 900, 600, 500, 400, 250, 150, 100, 0, 0], streak: 0, checked_in_today: false, prizes: [], claims: [],
  line_linked: false, claim_needs_line: false, claim_face_check: true, ...x });
const face = (found = true, yaw = 0.5, size = 0.3, centered = true) => ({ found, yaw, ear: 0.3, size, centered });

describe('3-second claim face check', () => {
  it('counts only a clear, centred, straight face, and needs 3 s in a row', () => {
    expect(goodFrame(face())).toBe(true);
    expect(goodFrame(face(false))).toBe(false);
    expect(goodFrame(face(true, 0.7))).toBe(false);
    expect(goodFrame(face(true, 0.5, 0.08))).toBe(false);
    let h = 0;
    for (let i = 0; i < 20; i++) h = holdNext(h, face(), 100);
    expect(h).toBe(2000);
    h = holdNext(h, face(false), 100);
    expect(h).toBe(0);                                         // looked away: start again
    for (let i = 0; i < 40; i++) h = holdNext(h, face(), 100);
    expect(h).toBe(HOLD_MS);
    expect(holdNext(0, face(), 5000)).toBe(400);              // a frozen tab can't jump the timer
  });
});

describe('claim page (0066)', () => {
  beforeEach(() => { kxMock.kxClaimPrize.mockReset(); liveMock.v5SignInLine.mockClear(); });
  it('Claim opens the face check first, Thai with English under it', () => {
    render(<ClaimPage L={L} Lf={Lf} lang="th" data={rewards()} prize={prize()} onBack={() => undefined} onDone={() => undefined} toast={() => undefined} />);
    fireEvent.click(document.getElementById('kxClaimGo')!);
    const box = document.getElementById('kxClaimFace')!;
    expect(box.textContent).toContain('สแกนหน้า 3 วินาที');
    expect(box.textContent).toContain('3-second face check');
    expect(box.querySelector('[lang="th"] + [lang="en"]')).not.toBeNull();
    expect(kxMock.kxClaimPrize).not.toHaveBeenCalled();
  });
  it('the face screen carries the founder nudge; camera fails → retry or "later", never a claim without the check', () => {
    render(<ClaimPage L={L} Lf={Lf} lang="th" data={rewards()} prize={prize()} onBack={() => undefined} onDone={() => undefined} toast={() => undefined}
      startStep="face" faceDemo={{ stage: 'fail' }} />);
    const box = document.getElementById('kxClaimFace')!;
    expect(box.textContent).toContain('ยืนยันใบหน้าสั้น ๆ เพื่อรับรางวัลของคุณ');
    expect(box.textContent).toContain('Quick face check to claim your reward');
    expect(box.textContent).not.toContain('ranking board');   // 0111: the board never needs the face check
    expect(document.getElementById('kxClaimFaceSkip')).toBeNull();
    expect(document.getElementById('kxClaimFaceRetry')).not.toBeNull();
    fireEvent.click(document.getElementById('kxClaimFaceBack')!);
    expect(document.getElementById('kxClaimFace')).toBeNull();
    expect(kxMock.kxClaimPrize).not.toHaveBeenCalled();
  });
  it('server says FACE_NEEDED → the face check opens', async () => {
    kxMock.kxClaimPrize.mockRejectedValue(Object.assign(new Error('KR8_FACE_NEEDED'), { code: 'FACE_NEEDED' }));
    render(<ClaimPage L={L} Lf={Lf} lang="en" data={rewards({ claim_face_check: undefined })} prize={prize()} onBack={() => undefined} onDone={() => undefined} toast={() => undefined} />);
    fireEvent.click(document.getElementById('kxClaimGo')!);
    await waitFor(() => expect(document.getElementById('kxClaimFace')).not.toBeNull());
  });
  it('before 0066 (no claim_face_check from the server) the claim goes straight through', async () => {
    kxMock.kxClaimPrize.mockResolvedValue({ status: 'pending', claim_id: 'c1', brand: 'grab', amount: 100 });
    render(<ClaimPage L={L} Lf={Lf} lang="en" data={rewards({ claim_face_check: undefined })} prize={prize()} onBack={() => undefined} onDone={() => undefined} toast={() => undefined} />);
    fireEvent.click(document.getElementById('kxClaimGo')!);
    await waitFor(() => expect(kxMock.kxClaimPrize).toHaveBeenCalledWith('pz1', expect.stringMatching(/^(grab|truemoney)$/)));
  });
  it('claim_needs_line and no LINE → "Link LINE to get your prize" step, which starts LINE link mode', () => {
    render(<ClaimPage L={L} Lf={Lf} lang="th" data={rewards({ claim_needs_line: true })} prize={prize()} onBack={() => undefined} onDone={() => undefined} toast={() => undefined} />);
    fireEvent.click(document.getElementById('kxClaimGo')!);
    const st = document.getElementById('kxClaimLine')!;
    expect(st.textContent).toContain('เชื่อม LINE เพื่อรับรางวัล');
    expect(st.textContent).toContain('Link LINE to get your prize');
    fireEvent.click(document.getElementById('kxClaimLinkLine')!);
    expect(liveMock.v5SignInLine).toHaveBeenCalledWith(true);
    expect(kxMock.kxClaimPrize).not.toHaveBeenCalled();
  });
  it('LINE already linked → no LINE step', () => {
    render(<ClaimPage L={L} Lf={Lf} lang="th" data={rewards({ claim_needs_line: true, line_linked: true })} prize={prize()} onBack={() => undefined} onDone={() => undefined} toast={() => undefined} />);
    fireEvent.click(document.getElementById('kxClaimGo')!);
    expect(document.getElementById('kxClaimLine')).toBeNull();
    expect(document.getElementById('kxClaimFace')).not.toBeNull();
  });
  it('weekly prize still being checked: Claim is off and the open time shows, in Thai + English', () => {
    const opens = new Date(Date.now() + 5 * 3600_000).toISOString();
    render(<ClaimPage L={L} Lf={Lf} lang="th" data={rewards()} prize={prize({ kind: 'weekly', rank: 2, week: '2026-11-17', founding_no: null, amount: 900, opens_at: opens })}
      onBack={() => undefined} onDone={() => undefined} toast={() => undefined} />);
    expect((document.getElementById('kxClaimGo') as HTMLButtonElement).disabled).toBe(true);
    expect(document.getElementById('kxClaimWait')!.textContent).toContain('We’re checking this week’s results');
    expect(document.getElementById('kxClaimWait')!.textContent).toContain('กำลังตรวจผล');
  });
  it('the prize list shows "checking · opens …" instead of Claim', () => {
    const opens = new Date(Date.now() + 5 * 3600_000).toISOString();
    render(<RewardsPage L={L} Lf={Lf} lang="th" data={rewards({ prizes: [prize({ kind: 'weekly', rank: 1, week: '2026-11-17', founding_no: null, amount: 1500, opens_at: opens })] })} onBack={() => undefined}
      onClaim={() => undefined} onCode={() => undefined} onHistory={() => undefined} onRanking={() => undefined} onMath={() => undefined} />);
    const card = document.querySelector('[data-prize-id="pz1"]')!;
    expect(card.querySelector('[data-claim-prize]')).toBeNull();
    expect(card.textContent).toContain('Checking results · opens');
  });
});

describe('line-auth link mode (0066)', () => {
  const SUB = 'U' + '0123456789abcdef'.repeat(2);
  const ENV: LineEnv = { channelId: '2001234567', channelSecret: 's', redirects: ['https://kringapp.com/app/line-callback.html'] };
  const BODY = { link: true, code: 'abc', redirect_uri: ENV.redirects[0], code_verifier: 'v'.repeat(64), nonce: 'n'.repeat(32) };
  const f = (async (url: string) => ({ ok: true, json: async () => (url.endsWith('/token') ? { id_token: 'A.B.C' } : { iss: 'https://access.line.me', aud: ENV.channelId, sub: SUB, name: 'Pim', email: 'pim@line.me' }) })) as unknown as typeof fetch;
  const mk = (links: Record<string, string> = {}) => {
    const calls: string[] = [];
    const admin: LineAdmin = {
      findLink: async (s) => links[s] || null, findUserByEmail: async () => 'someone-else',
      createUser: async () => { calls.push('create'); return 'new'; }, saveLink: async (s, u) => { calls.push(`link:${u}`); links[s] = u; },
      userEmail: async () => 'x@y.z', magicLinkHash: async () => { calls.push('hash'); return 'h'; },
      linkOfUser: async (u) => Object.keys(links).find((k) => links[k] === u) || null, noteTaken: async (u, o) => { calls.push(`taken:${u}:${o}`); },
    };
    return { admin, calls, links };
  };
  it('needs a signed-in caller', async () => {
    expect((await lineAuth(BODY, ENV, mk().admin, f, null)).body).toEqual({ error: 'LINE_SIGN_IN' });
  });
  it('links LINE to the signed-in email account: no new account, no sign-in token, email match ignored', async () => {
    const m = mk();
    const r = await lineAuth(BODY, ENV, m.admin, f, 'email-user');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ linked: true, token_hash: '' });
    expect(m.calls).toEqual(['link:email-user']);
    expect(m.links[SUB]).toBe('email-user');
  });
  it('LINE already on another Kring account → LINE_TAKEN, noted as a same-LINE link, nothing moved', async () => {
    const m = mk({ [SUB]: 'first-account' });
    const r = await lineAuth(BODY, ENV, m.admin, f, 'second-account');
    expect(r).toEqual({ status: 409, body: { error: 'LINE_TAKEN' } });
    expect(m.calls).toEqual(['taken:second-account:first-account']);
    expect(m.links[SUB]).toBe('first-account');
  });
  it('account already has a different LINE → LINE_OTHER', async () => {
    const m = mk({ ['U' + 'f'.repeat(32)]: 'me' });
    expect((await lineAuth(BODY, ENV, m.admin, f, 'me')).body).toEqual({ error: 'LINE_OTHER' });
  });
  it('linking again with the same LINE is fine', async () => {
    const m = mk({ [SUB]: 'me' });
    expect((await lineAuth(BODY, ENV, m.admin, f, 'me')).body).toMatchObject({ linked: true });
  });
});

describe('founder alert wording (0066)', () => {
  const base = { id: 'c1', brand: 'truemoney', amount_thb: 100, status: 'pending', is_test: false, created_at: '2026-11-16T10:00:00Z', prize_kind: 'founding', founding_no: 14,
    first_name: 'Joobie', member_no: 31, payout_pct: 100 };
  it('held by the network rule says so, names the other member, and is not a stock problem', () => {
    const rec = { ...base, held: true, hold_reason: 'linked', others: [{ first_name: 'Joob', member_no: 1, reasons: ['network'], selfie_path: 'a/b.jpg' }] };
    expect(holdLine(rec)).toBe("Held: same network as another member's claim (Joob #1). Check before paying.");
    const m = buildMail(rec, { truemoney_100: 12 }, {});
    expect(m.text).toContain("Held: same network as another member's claim (Joob #1). Check before paying.");
    expect(m.text).not.toMatch(/no TrueMoney ฿100 code in stock|฿75|Restock/);
    expect(m.text).toContain('TrueMoney ฿100 (full value)');
    expect(m.subject).toBe('Held · same person? Joobie #31 claimed TrueMoney ฿100');
    expect(m.html).toContain('admin.html#dups');
  });
  it('face + network link reads as both', () => {
    expect(holdLine({ ...base, held: true, hold_reason: 'linked', others: [{ first_name: 'Joob', member_no: 1, reasons: ['face', 'network'] }] }))
      .toBe('Held: same face + same network as another member (Joob #1). Check before paying.');
  });
  it('shows both selfies when signed links exist', () => {
    const rec = { ...base, held: true, hold_reason: 'linked', selfie_path: 'me.jpg', others: [{ first_name: 'Joob', member_no: 1, reasons: ['face'], selfie_path: 'joob.jpg' }] };
    const m = buildMail(rec, {}, { 'me.jpg': 'https://x/s1', 'joob.jpg': 'https://x/s2' });
    expect(m.html).toContain('https://x/s1');
    expect(m.html).toContain('https://x/s2');
    expect(m.selfies.map((s) => s.cap)).toEqual(['Joobie #31 (this claim)', 'Joob #1']);
  });
  it('same network only: paid normally, the email shows a flag (no hold wording)', () => {
    const m = buildMail({ ...base, status: 'assigned', held: false, flags: [{ first_name: 'Joob', member_no: 1, reasons: ['network'] }] }, { truemoney_100: 10 }, {});
    expect(m.text).toContain('Flag: Flag only, paid normally: same network as Joob #1');
    expect(m.text).not.toContain('Held');
    expect(m.subject).toMatch(/^Kring prize claimed/);
  });
  it('a real stock-out still says restock', () => {
    expect(subjectFor({ ...base, held: false })).toMatch(/^Restock TrueMoney ฿100/);
  });
});

describe('admin Same person? clusters + week flags', () => {
  const mem = (id: string, no: number, days: number, ghost = false) => ({ user_id: id, member_no: no, first_name: 'M' + no, photo: null, joined_at: new Date(Date.now() - days * 86400_000).toISOString(),
    verified: true, ghost, is_test: false, line: false, prints: 1, selfie_path: null, reels: 1, prizes: [] });
  const ov: DupOverview = {
    members: [mem('a', 1, 20), mem('b', 2, 3), mem('c', 3, 2), mem('d', 4, 9), mem('e', 5, 8)],
    links: [{ a: 'a', b: 'b', reason: 'face', detail: { dist: 0.31 }, first_at: '', dismissed: false },
      { a: 'b', b: 'c', reason: 'device', detail: {}, first_at: '', dismissed: false },
      { a: 'd', b: 'e', reason: 'network', detail: {}, first_at: '', dismissed: true }],
    held: [{ claim_id: 'h1', user_id: 'b', brand: 'truemoney', amount: 100, created_at: '', reason: 'linked', detail: {}, face_dist: null, prize_kind: 'founding', founding_no: 2, week: null, rank: null }],
    mutual: [{ from: 'b', to: 'a', likes: 1, saves: 1 }],
  };
  it('joins linked accounts, oldest first; dismissed links don’t join', () => {
    const c = buildClusters(ov);
    expect(c).toHaveLength(1);
    expect(c[0].members.map((m) => m.user_id)).toEqual(['a', 'b', 'c']);
    expect(c[0].reasons).toEqual(['device', 'face']);
    expect(c[0].held).toHaveLength(1);
    expect(c[0].mutual).toHaveLength(1);
  });
  it('week flags name the linked account', () => {
    const r: WeekRow = { rank: 1, user_id: 'b', first_name: 'B', member_no: 2, photo: null, rings: 90, joined_at: new Date().toISOString(), verified: false, line: false, prints: 0, prize: null,
      links: [{ other: 'a', reason: 'face', other_name: 'Joob', other_no: 1 }, { other: 'a', reason: 'network', other_name: 'Joob', other_no: 1 }] };
    expect(weekFlags(r)).toEqual(['Same face + Same Wi-Fi / network as Joob #1', 'Account under 7 days old']);   // unverified is not a flag (founder 16 Nov)
  });
});

describe('week dates (admin Approve week)', () => {
  it('week of Mon 16 Nov closes Mon 23 Nov 00:00 Bangkok; opens by itself 24 h later = Mon 23 Nov 22:30 IST', () => {
    expect(weekRange('2026-11-16')).toBe('16–22 Nov');
    expect(weekRange('2026-11-30')).toBe('30 Nov – 6 Dec');
    expect(istWhen('2026-11-23T17:00:00Z')).toBe('Mon 23 Nov · 22:30 IST');
  });
});

describe('ranking board nudge (unverified still on the board)', () => {
  it('shows the nudge in the app language only (T-301 round 2; tiny, under my photo) only when asked', async () => {
    const { RankingPage } = await import('./V5KxRanking');
    const onVerify = vi.fn();
    const { unmount } = render(<RankingPage L={L} Lf={Lf} lang="th" myArea={null} myPhoto={null} myName="A" myId="me" onBack={() => undefined} onPerson={() => undefined}
      onPost={() => undefined} onShare={() => undefined} needsVerify onVerify={onVerify} />);
    const n = await waitFor(() => { const e = document.getElementById('kxVerifyNudge'); if (!e) throw new Error('no nudge'); return e; });
    expect(n.closest('.rka-meph')).toBeTruthy();
    expect(n.getAttribute('aria-label')).toContain('ยืนยันใบหน้าสั้น ๆ');
    expect(n.getAttribute('aria-label')).not.toContain('Quick face check');
    expect(n.textContent).toBe('ยืนยันหน้า');
    fireEvent.click(n);
    expect(onVerify).toHaveBeenCalled();
    unmount();
    render(<RankingPage L={L} Lf={Lf} lang="th" myArea={null} myPhoto={null} myName="A" myId="me" onBack={() => undefined} onPerson={() => undefined} onPost={() => undefined} onShare={() => undefined} />);
    await waitFor(() => expect(document.getElementById('kxMeRow')).toBeTruthy());
    expect(document.getElementById('kxVerifyNudge')).toBeNull();
  });
});

describe('50-user audit P1-4: a new card is "local" unless the member picks Visiting', () => {
  it('no language-based guess in either card form', () => {
    for (const f of ['src/v8/V5KxCard.tsx', 'src/v8/V5Sheets.tsx']) {
      const src = readFileSync(f, 'utf8');
      // 0138 (19 Nov): the member can no longer pick traveller; the form only sends what the card already is
      expect(src).toMatch(/whoToSave\(card\?\.who\)|card\?\.who === 'traveller' \? 'traveller' : 'local'/);
      expect(src).not.toMatch(/setWho\('traveller'\)/);
      expect(src).not.toMatch(/uiLang === 'th'[^\n]*'traveller'/);
    }
  });
});

describe('banned words in the new member-facing text', () => {
  it('none', () => {
    const src = ['src/v8/V5ClaimFace.tsx', 'src/v8/V5KxRewards.tsx'].map((f) => readFileSync(f, 'utf8')).join('\n');
    const strings = [...src.matchAll(/(?:th|en)=\{?["`]([^"`]+)["`]/g)].map((m) => m[1]);
    expect(strings.length).toBeGreaterThan(10);
    for (const t of strings) for (const w of [/\bmeet/i, /\bguide/i, /\btour/i, /\bhost/i, /\bcreator/i, /\breviews?\b/i, /hidden gem/i, /alcohol/i, /\bgift/i, /wallet/i, /\bcredit/i, /\blucky\b/i, /\bdraw\b/i, /temples?/i, /ลุ้น/])
      expect(w.test(t), `${w} in "${t}"`).toBe(false);
  });
});
