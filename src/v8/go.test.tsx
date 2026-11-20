import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { KX_L, V5_L } from './v5Strings';

const kxMock = vi.hoisted(() => ({ kxClaimPrize: vi.fn(), kxRecentClaims: vi.fn(), kxTagCandidates: vi.fn(), kxCoachSeen: vi.fn(), kxCoachState: vi.fn(), kxCoachReset: vi.fn() }));
vi.mock('./v5Kx', async (orig) => ({ ...(await orig<typeof import('./v5Kx')>()), ...kxMock }));
vi.mock('./v5Reel', () => ({ signReelPaths: vi.fn().mockImplementation(async (p: string[]) => Object.fromEntries(p.map((x) => [x, `https://signed/${x}`]))) }));
import { addTag, CAPTION_MAX, GoCoach, GoCompose, GoMeReels, GoProfilePage, GoReelPlayer, GO_TAGS, gridToGo, hashtagsOf, hlTags, PeoplePicker, type GoReel } from './V5Go';
import { COACH_ORDER, coachDue, coachLocal, coachMark, coachPick, coachReplay, coachSync, newCoachState } from './goCoach';
import { ClaimedPage, ClaimPage, isLink } from './V5KxRewards';
import { claimBrands, tmPct, valueFor } from './kxLogic';
import { parseCodes } from '../venue/adminApp';
import { V5SignInSheet } from './V5Sheets';
import { RINGS } from './rewardsConfig';
import type { KxClaim, KxGridReel, KxPrize, KxRewards, KxTagPerson } from './v5Kx';
import type { V5Profile } from './v5Live';

const L = (en: string) => en;
const Lf = (en: string, a: string, b = '') => en.replace('{0}', a).replace('{1}', b);
const TH = (en: string) => V5_L.th[en] || KX_L.th[en] || en;
const THf = (en: string, a: string, b = '') => TH(en).replace('{0}', a).replace('{1}', b);
const person = (n: number, extra: Partial<KxTagPerson> = {}): KxTagPerson => ({ user_id: `u${n}`, first_name: `TEST-P${n}`, photo: null, who: 'local', ...extra });
const grid = (id: string, extra: Partial<KxGridReel> = {}): KxGridReel => ({ id, poster_path: `a/${id}.jpg`, video_path: `a/${id}.mp4`, body: 'Sunday lanes #talatnoi #กรุงเทพ', created_at: '2026-11-12T10:00:00Z',
  status: 'approved', likes: 4, saves: 2, this_week: true, rings: 12, place: { id: 'pl1', name_en: 'Talat Noi', name_th: 'ตลาดน้อย' }, liked: false, saved: false, ...extra });
const profile = (extra: Partial<V5Profile> = {}): V5Profile => ({ user_id: 'u9', first_name: 'TEST-Ploy', photo: null, langs: ['TH', 'EN'], bio: '', area: 'Ari', who: 'local', verified: false, ig_handle: 'ploy.bkk',
  interests: [], member_no: '3', online: false, here: false, mine: false, level: { level: 'anchan', posts: 0, visits: 0, points: 0, next: 'tea', need_points: 3, pct: 0 },
  followers: 12, following: 3, likes: 40, gifts: 0, i_follow: false, follows_me: false, reels: [], ...extra });
const rewards = (extra: Partial<KxRewards> = {}): KxRewards => ({ week: 0, rank: null, lifetime: 0, level: 1, gap: null, ends_at: '2026-11-15T17:00:00Z', member_no: 412,
  founding_no: null, founding_left: 36, floor: 25, rules: { ...RINGS, truemoney_payout_pct: 75 /* a 75% config; live default is 100 */ }, ladder: [1500, 900, 600, 500, 400, 250, 150, 100, 0, 0], streak: 0, checked_in_today: true, prizes: [], claims: [], ...extra });
const prize = (extra: Partial<KxPrize> = {}): KxPrize => ({ id: 'pz1', kind: 'founding', week: null, rank: null, founding_no: 15, amount: 100, rings: null, status: 'won', claim_id: null, created_at: new Date().toISOString(), ...extra });
const claim = (extra: Partial<KxClaim> = {}): KxClaim => ({ id: 'c1', brand: 'truemoney', amount: 100, status: 'assigned', value: 75, code: 'TEST-TM-0001', activation_url: null, used_at: null,
  created_at: new Date().toISOString(), assigned_at: new Date().toISOString(), kind: 'founding', week: null, rank: null, founding_no: 15, ...extra });

beforeEach(() => {
  localStorage.clear();
  for (const k of Object.values(kxMock)) k.mockReset();
  kxMock.kxRecentClaims.mockResolvedValue([]); kxMock.kxCoachSeen.mockResolvedValue(true); kxMock.kxCoachState.mockResolvedValue([]); kxMock.kxCoachReset.mockResolvedValue(0);
});
afterEach(() => cleanup());

describe('caption hashtags', () => {
  it('finds Thai and English hashtags and colours them in turn', () => {
    expect(hashtagsOf('Sunday #TalatNoi with #กรุงเทพ friends')).toEqual(['#talatnoi', '#กรุงเทพ']);
    const { container } = render(<p>{hlTags('lanes #talatnoi #กรุงเทพ #kringlocal ok')}</p>);
    const tags = [...container.querySelectorAll('span')];
    expect(tags.map((t) => t.textContent)).toEqual(['#talatnoi', '#กรุงเทพ', '#kringlocal']);
    expect(tags.map((t) => t.className)).toEqual(['go-h0', 'go-h1', 'go-h0']);
    expect(container.textContent).toBe('lanes #talatnoi #กรุงเทพ #kringlocal ok');
  });
  it('a caption with markup stays text (no HTML injection)', () => {
    const { container } = render(<p>{hlTags('<img src=x onerror=alert(1)> #ok')}</p>);
    expect(container.querySelector('img')).toBeNull();
  });
  it('quick-add chips: added once, never past the limit', () => {
    expect(addTag('', '#bangkok')).toBe('#bangkok ');
    expect(addTag('Hi', '#bangkok')).toBe('Hi #bangkok ');
    expect(addTag('Hi #Bangkok', '#bangkok')).toBe('Hi #Bangkok');
    expect(addTag('x'.repeat(CAPTION_MAX - 3), '#bangkok')).toBe('x'.repeat(CAPTION_MAX - 3));
    expect(GO_TAGS.length).toBeGreaterThanOrEqual(4);
  });
});

describe('compose: one screen after the clip is picked', () => {
  const base = { L, Lf, lang: 'en', stage: 'idle', progress: 0, problem: '', onAddPlace: vi.fn(), onRemovePlace: vi.fn(), onPeople: vi.fn(), onPick: vi.fn(), onClose: vi.fn() };
  const reel = { file: new File(['x'], 'a.mp4', { type: 'video/mp4' }), url: 'blob:x', durationMs: 14000, width: 720, height: 1280 };
  it('no clip yet: "Pick a clip" with the reassurance line, nothing else', () => {
    render(<GoCompose {...base} reel={null} caption="" onCaption={vi.fn()} places={[]} people={[]} onPost={vi.fn()} />);
    expect(screen.getAllByText('Pick a clip').length).toBeGreaterThan(0);
    expect(screen.getByText(/A clip you already posted on TikTok or IG is fine/)).toBeTruthy();
    expect(document.getElementById('goPlaceRow')).toBeNull();
  });
  it('clip picked: caption, hashtag chips, Add place, Tag people and Post on the same screen; no "Where was this filmed" step', () => {
    const onCaption = vi.fn();
    render(<GoCompose {...base} reel={reel} caption="Sunday lanes" onCaption={onCaption} places={[]} people={[]} onPost={vi.fn()} />);
    expect(document.getElementById('goCaption')).toBeTruthy();
    expect(document.getElementById('goPlaceRow')).toBeTruthy();
    expect(document.getElementById('goPeopleRow')).toBeTruthy();
    expect(document.getElementById('shareNowBtn')!.textContent).toBe('Post');
    expect(document.getElementById('goCompose')!.textContent).not.toMatch(/Where was this filmed/i);
    expect(screen.getByText('Needed for your Reel to count in the ranking')).toBeTruthy();
    fireEvent.click(document.querySelector('[data-tag="#bangkok"]')!);
    expect(onCaption).toHaveBeenCalledWith('Sunday lanes #bangkok ');
  });
  it('Post without a place does not post: the place row asks for one', async () => {
    const onPost = vi.fn();
    render(<GoCompose {...base} reel={reel} caption="" onCaption={vi.fn()} places={[]} people={[]} onPost={onPost} />);
    fireEvent.click(document.getElementById('shareNowBtn')!);
    await waitFor(() => expect(document.getElementById('goPlaceRow')!.className).toContain('need'));
    expect(onPost).not.toHaveBeenCalled();
    expect(document.getElementById('goPlaceHint')!.textContent).toBe('Add a place first. It puts your Reel on the ranking.');
  });
  it('with a place: the chip shows it and Post goes through; tagged people show as @name', () => {
    const onPost = vi.fn();
    render(<GoCompose {...base} reel={reel} caption="" onCaption={vi.fn()} people={[person(1), person(2)]} onPost={onPost}
      places={[{ id: 'pl1', name_en: 'Talat Noi', name_th: 'ตลาดน้อย', area: 'Old Town', kr_area: 'Talad Noi', photo_url: null, lat: 13.7, lng: 100.5 }]} />);
    expect(document.getElementById('goPlaceChip')!.textContent).toBe('Talat Noi');
    expect(document.getElementById('goPeopleRow')!.textContent).toContain('@TEST-P1 @TEST-P2');
    fireEvent.click(document.getElementById('shareNowBtn')!);
    expect(onPost).toHaveBeenCalledTimes(1);
  });
  it('while uploading the button cannot be tapped twice', () => {
    const onPost = vi.fn();
    render(<GoCompose {...base} stage="uploading" progress={0.4} reel={reel} caption="" onCaption={vi.fn()} people={[]} onPost={onPost}
      places={[{ id: 'pl1', name_en: 'Talat Noi', name_th: null, area: 'Old Town', kr_area: 'Bangkok', photo_url: null, lat: 13.7, lng: 100.5 }]} />);
    expect((document.getElementById('shareNowBtn') as HTMLButtonElement).disabled).toBe(true);
    expect(document.getElementById('reelProgress')!.textContent).toBe('Uploading · 40%');
  });
  it('tag people: search, pick, at most 5, Done returns the list', async () => {
    const load = vi.fn().mockResolvedValue([1, 2, 3, 4, 5, 6].map((n) => person(n)));
    const onDone = vi.fn();
    render(<PeoplePicker L={L} picked={[]} load={load} onDone={onDone} onClose={vi.fn()} />);
    await screen.findByText('TEST-P6');
    for (const n of [1, 2, 3, 4, 5, 6]) fireEvent.click(document.querySelector(`[data-person="TEST-P${n}"]`)!);
    expect(document.querySelectorAll('.go-prow.on').length).toBe(5);
    fireEvent.click(document.querySelector('[data-person="TEST-P1"]')!);
    fireEvent.click(document.getElementById('goPeopleDone')!);
    expect(onDone.mock.calls[0][0].map((p: KxTagPerson) => p.user_id)).toEqual(['u2', 'u3', 'u4', 'u5']);
  });
});

describe('Reel player', () => {
  const author = { id: 'u9', name: 'TEST-Ploy', photo: null, handle: 'ploy.bkk' };
  const reels = (): GoReel[] => [gridToGo(grid('r1'), author, false), gridToGo(grid('r2', { rings: 7, body: null, place: null }), author, false)];
  const base = { L, Lf, lang: 'en', onClose: vi.fn(), onProfile: vi.fn(), onPlace: vi.fn(), onMath: vi.fn(), onShare: vi.fn() };
  it('17 Nov: My Reel stats opens for the owner only, with views, likes, saves, outside opens and Rings', async () => {
    const mine = [gridToGo(grid('r1', { likes: 12, saves: 4, rings: 40 }), author, true)];
    const onStats = vi.fn().mockResolvedValue({ views: 230, likes: 12, saves: 4, opens: 3, rings: 40, travellers: 2 });
    const { unmount } = render(<GoReelPlayer {...base} reels={mine} onLike={vi.fn()} onSave={vi.fn()} onStats={onStats} />);
    fireEvent.click(document.querySelector('[data-go="stats"]')!);
    expect(onStats).toHaveBeenCalledWith('r1');
    await screen.findByText('230');
    const box = document.getElementById('goReelStats')!;
    for (const t of ['Views', 'Likes', 'Saves', 'Outside opens', 'Rings', '12', '4', '3', '40']) expect(box.textContent).toContain(t);
    fireEvent.click(box.querySelector('.go-stats-x')!);
    expect(document.getElementById('goReelStats')).toBeNull();
    unmount();
    render(<GoReelPlayer {...base} reels={reels()} onLike={vi.fn()} onSave={vi.fn()} onStats={onStats} />);
    expect(document.querySelector('[data-go="stats"]')).toBeNull();   // someone else's Reel: no stats button
  });
  it('shows the place, the caption with hashtags, the Rings score and "with @name"', () => {
    const list = reels(); list[0].people = [person(1), person(2)];
    render(<GoReelPlayer {...base} reels={list} onLike={vi.fn()} onSave={vi.fn()} />);
    const first = document.querySelector('[data-reel-id="r1"]')!;
    expect(first.querySelector('[data-go="place"]')!.textContent).toBe('Talat Noi');
    expect(first.querySelectorAll('.reel-cap .reel-cap-t span').length).toBe(2);
    expect(first.querySelector('[data-go="score"]')!.textContent).toContain('12');
    expect(first.querySelector('[data-go="with"]')!.textContent).toBe('with@TEST-P1@TEST-P2');
    expect(document.querySelectorAll('.go-reel').length).toBe(2);
  });
  it('opened from the ranking: one tap on "View profile" goes to that member', () => {
    const onProfile = vi.fn();
    render(<GoReelPlayer {...base} onProfile={onProfile} reels={reels()} viewProfile={{ id: 'u9', name: 'TEST-Ploy', photo: null }} onLike={vi.fn()} onSave={vi.fn()} />);
    fireEvent.click(document.getElementById('goViewProfile')!);
    expect(onProfile).toHaveBeenCalledWith('u9');
  });
  it('save and like update at once and follow the server answer', async () => {
    const onSave = vi.fn().mockResolvedValue(true); const onLike = vi.fn().mockResolvedValue({ liked: true, likes: 5 });
    render(<GoReelPlayer {...base} reels={reels()} onLike={onLike} onSave={onSave} />);
    const first = document.querySelector('[data-reel-id="r1"]')!;
    fireEvent.click(first.querySelector('[data-go="save"]')!);
    await waitFor(() => expect(first.querySelector('[data-go="save"]')!.getAttribute('aria-pressed')).toBe('true'));
    expect(first.querySelector('[data-go="save"] b')!.textContent).toBe('3');
    fireEvent.click(first.querySelector('[data-go="like"]')!);
    await waitFor(() => expect(first.querySelector('[data-go="like"] b')!.textContent).toBe('5'));
    expect(onSave).toHaveBeenCalledWith('r1');
  });
  it('a refused save goes back to what it was', async () => {
    render(<GoReelPlayer {...base} reels={reels()} onLike={vi.fn()} onSave={vi.fn().mockResolvedValue(null)} />);
    const b = document.querySelector('[data-reel-id="r1"] [data-go="save"]')!;
    fireEvent.click(b);
    await waitFor(() => expect(b.getAttribute('aria-pressed')).toBe('false'));
  });
  it('a Reel still in review shows "in review" and cannot be liked, saved or shared', () => {
    render(<GoReelPlayer {...base} reels={[gridToGo(grid('r3', { status: 'pending' }), author, true)]} onLike={vi.fn()} onSave={vi.fn()} />);
    expect(document.querySelector('.go-score.rv')!.textContent).toBe('in review');
    expect([...document.querySelectorAll<HTMLButtonElement>('.go-rb')].every((b) => b.disabled)).toBe(true);
  });
  it('Back closes the player', () => {
    const onClose = vi.fn();
    render(<GoReelPlayer {...base} onClose={onClose} reels={reels()} onLike={vi.fn()} onSave={vi.fn()} />);
    fireEvent.click(document.getElementById('goPlayerBack')!);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('profile grid and Me tabs', () => {
  const pbase = { L, Lf, lang: 'en', kx: null, busy: false, onBack: vi.fn(), onFollow: vi.fn(), onHi: vi.fn(), onReport: vi.fn(), onBlock: vi.fn(), onShare: vi.fn(), onList: vi.fn(), onMath: vi.fn() };
  it('member profile: counts and a 3-column grid; a tile opens that Reel', () => {
    const onOpen = vi.fn();
    render(<GoProfilePage {...pbase} p={profile()} reels={{ user_id: 'u9', mine: false, best: 'r1', reels: [grid('r1'), grid('r2', { this_week: false }), grid('r3')] }} onOpen={onOpen} />);
    expect(document.querySelectorAll('#goGrid .go-gt').length).toBe(3);
    expect(document.querySelector('.go-cnt')!.textContent).toBe('3Reels12Followers3Following');
    expect(document.querySelectorAll('.go-gw').length).toBe(2);
    fireEvent.click(document.querySelector('[data-go-tile="r2"]')!);
    expect(onOpen).toHaveBeenCalledWith(1);
    expect(document.getElementById('profileFollow')!.textContent).toBe('Follow');
  });
  it('no Reels: says so, no empty grid', () => {
    render(<GoProfilePage {...pbase} p={profile()} reels={{ user_id: 'u9', mine: false, best: null, reels: [] }} onOpen={vi.fn()} />);
    expect(document.getElementById('profileNoReels')).toBeTruthy();
    expect(document.getElementById('goGrid')).toBeNull();
  });
  it('Me: "Reels" tab has my Reels (in review marked) and a New Reel tile; "Saved" tab has the saved ones', () => {
    const onTab = vi.fn(); const onPost = vi.fn(); const onOpenSaved = vi.fn();
    const saved = [{ id: 's1', poster_path: 'b/s1.jpg', video_path: 'b/s1.mp4', likes: 3, name: 'TEST-Fah', saved_at: '2026-11-13T00:00:00Z' }];
    const { rerender } = render(<GoMeReels L={L} Lf={Lf} mine={[grid('r1', { status: 'pending' })]} saved={saved} tab="reels" onTab={onTab} onOpenMine={vi.fn()} onOpenSaved={onOpenSaved} onPost={onPost} onBrowse={vi.fn()} />);
    expect(document.querySelector('.go-gw.rv')!.textContent).toBe('in review');
    expect(document.getElementById('goTabSaved')!.textContent).toBe('Saved Reels · 1');
    fireEvent.click(document.getElementById('goGridAdd')!);
    expect(onPost).toHaveBeenCalled();
    fireEvent.click(document.getElementById('goTabSaved')!);
    expect(onTab).toHaveBeenCalledWith('saved');
    rerender(<GoMeReels L={L} Lf={Lf} mine={[]} saved={saved} tab="saved" onTab={onTab} onOpenMine={vi.fn()} onOpenSaved={onOpenSaved} onPost={onPost} onBrowse={vi.fn()} />);
    fireEvent.click(document.querySelector('#goSavedGrid [data-go-tile="s1"]')!);
    expect(onOpenSaved).toHaveBeenCalledWith(0);
    rerender(<GoMeReels L={L} Lf={Lf} mine={[]} saved={[]} tab="saved" onTab={onTab} onOpenMine={vi.fn()} onOpenSaved={onOpenSaved} onPost={onPost} onBrowse={vi.fn()} />);
    expect(document.getElementById('goSavedEmpty')).toBeTruthy();
  });
});

describe('claim: choose ONE', () => {
  it('TrueMoney only (19 Nov founder decision): one card, no OR, one confirm', () => {
    render(<ClaimPage L={L} Lf={Lf} lang="en" data={rewards()} prize={prize({ kind: 'weekly', rank: 8, founding_no: null, week: '2026-11-09' })} onBack={() => undefined} onDone={() => undefined} toast={() => undefined} />);
    expect(document.getElementById('kxClaimOne')!.textContent).toBe('This prize can be claimed once.');
    expect([...document.querySelectorAll('[role="radio"]')].map((r) => r.getAttribute('data-brand'))).toEqual(['truemoney']);
    expect(document.querySelectorAll('.kx-or').length).toBe(0);
    expect(document.querySelector('[data-brand="grab"]')).toBeNull();
    expect(document.querySelectorAll('#kxClaim .kx-btn').length).toBe(1);
  });
  it('the confirm sends exactly the selected option, once', async () => {
    kxMock.kxClaimPrize.mockResolvedValue({ status: 'assigned', claim_id: 'c1', brand: 'truemoney', amount: 100, value: 75, code: 'TEST-TM', activation_url: null });
    const onDone = vi.fn();
    render(<ClaimPage L={L} Lf={Lf} lang="en" data={rewards()} prize={prize()} onBack={() => undefined} onDone={onDone} toast={() => undefined} />);
    fireEvent.click(document.querySelector('[data-brand="truemoney"]')!);
    fireEvent.click(document.getElementById('kxClaimGo')!);
    fireEvent.click(document.getElementById('kxClaimGo')!);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(kxMock.kxClaimPrize).toHaveBeenCalledTimes(1);
    expect(kxMock.kxClaimPrize).toHaveBeenCalledWith('pz1', 'truemoney');
  });
  it('Founding Local: TrueMoney only (19 Nov, no Grab stock), pre-selected, one confirm', () => {
    render(<ClaimPage L={L} Lf={Lf} lang="en" data={rewards()} prize={prize({ kind: 'founding' })} onBack={() => undefined} onDone={() => undefined} toast={() => undefined} />);
    const radios = [...document.querySelectorAll('[role="radio"]')];
    expect(radios.map((r) => r.getAttribute('data-brand'))).toEqual(['truemoney']);
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(document.querySelectorAll('.kx-or').length).toBe(0);
    expect(document.getElementById('kxClaimGo')!.textContent).toBe('Claim with TrueMoney · ฿75');
  });
  it('weekly prize: TrueMoney only too', () => {
    render(<ClaimPage L={L} Lf={Lf} lang="en" data={rewards()} prize={prize({ kind: 'weekly', rank: 4, amount: 500 })} onBack={() => undefined} onDone={() => undefined} toast={() => undefined} />);
    expect([...document.querySelectorAll('[role="radio"]')].map((r) => r.getAttribute('data-brand'))).toEqual(['truemoney']);
  });
  it('the TrueMoney share comes from the server config: 100 → "TrueMoney ฿100", Full value, no 75% note (weekly prizes too)', () => {
    const full = rewards({ rules: { ...RINGS, truemoney_payout_pct: 100 } });
    render(<ClaimPage L={L} Lf={Lf} lang="en" data={full} prize={prize({ kind: 'founding' })} onBack={() => undefined} onDone={() => undefined} toast={() => undefined} />);
    const tm = document.querySelector('[data-brand="truemoney"]')!;
    expect(tm.textContent).toContain('TrueMoney ฿100');
    expect(tm.textContent).toContain('Full value');
    expect(document.getElementById('kxClaim')!.textContent).not.toMatch(/75|25%|keeps/);
    expect(document.getElementById('kxClaimGo')!.textContent).toBe('Claim with TrueMoney · ฿100');
    cleanup();
    render(<ClaimPage L={L} Lf={Lf} lang="en" data={full} prize={prize({ kind: 'weekly', rank: 1, amount: 1500 })} onBack={() => undefined} onDone={() => undefined} toast={() => undefined} />);
    expect(document.querySelector('[data-brand="truemoney"]')!.textContent).toContain('TrueMoney ฿1,500');
    cleanup();
    render(<ClaimPage L={L} Lf={Lf} lang="en" data={rewards({ rules: { ...RINGS, truemoney_payout_pct: 90 } })} prize={prize({ kind: 'founding' })} onBack={() => undefined} onDone={() => undefined} toast={() => undefined} />);
    expect(document.querySelector('[data-brand="truemoney"]')!.textContent).toContain('TrueMoney ฿90');
    expect(document.querySelector('[data-brand="truemoney"]')!.textContent).toContain('90% of the prize value');
  });
  it('value math: config share, rounded down, never above the prize; a broken config falls back to the default (100, live)', () => {
    expect(valueFor('truemoney', 100)).toBe(100);
    expect(valueFor('truemoney', 250, 75)).toBe(187);
    expect(valueFor('truemoney', 250, 100)).toBe(250);
    expect(valueFor('grab', 250, 75)).toBe(250);
    expect(tmPct({ truemoney_payout_pct: 100 })).toBe(100);
    expect(tmPct({ truemoney_payout_pct: 250 })).toBe(100);
    expect(tmPct({ truemoney_payout_pct: 0 })).toBe(1);
    expect(tmPct(null)).toBe(100);
    expect(tmPct({ truemoney_payout_pct: Number.NaN })).toBe(100);
    expect(claimBrands(RINGS, 'founding')).toEqual(['truemoney']);
    expect(claimBrands(RINGS)).toEqual(['truemoney']);
  });
  it('a TrueMoney voucher that arrives as a LINK: "Redeem into TrueMoney" button opens the link, Copy copies it, the raw link is not printed as a code', () => {
    const link = 'https://gift.truemoney.com/campaign/?v=TESTabc123';
    render(<ClaimedPage L={L} Lf={Lf} lang="en" data={rewards({ claims: [claim({ code: link, value: 100 })] })} focus="c1" toast={() => undefined} onChanged={() => undefined} onClose={() => undefined} />);
    const open = document.getElementById('kxOpenApp') as HTMLAnchorElement;
    expect(open.textContent).toBe('Redeem into TrueMoney');
    expect(open.getAttribute('href')).toBe(link);
    expect(open.getAttribute('rel')).toContain('noopener');
    expect(document.getElementById('kxCode')!.textContent).toBe('Your redeem linkgift.truemoney.com');
    expect(document.getElementById('kxCopy')!.textContent).toBe('Copy link');
    expect(document.querySelector('#kxTicket .amt')!.textContent).toBe('฿100');
    expect(document.querySelector('#kxHistory [data-claim="c1"]')!.textContent).toContain('Claimed with TrueMoney · ฿100');
  });
  it('a normal code still shows as a code; a javascript: or http: "link" is never treated as a link', () => {
    expect(isLink('https://gift.truemoney.com/x')).toBe(true);
    expect(isLink('javascript:alert(1)')).toBe(false);
    expect(isLink('http://insecure.example/x')).toBe(false);
    expect(isLink('12345678901234')).toBe(false);
    expect(isLink('https://a.b/c d')).toBe(false);
    render(<ClaimedPage L={L} Lf={Lf} lang="en" data={rewards({ claims: [claim({ code: '12345678901234' })] })} focus="c1" toast={() => undefined} onChanged={() => undefined} onClose={() => undefined} />);
    expect(document.getElementById('kxCode')!.textContent).toBe('12345678901234');
    expect(document.getElementById('kxOpenApp')!.textContent).toBe('Open TrueMoney');
  });
  it('admin: pasted redeem links are kept whole, one per line; plain codes still split on commas', () => {
    expect(parseCodes('https://gift.truemoney.com/c/?v=a,b;c\nhttps://gift.truemoney.com/c/?v=zz\n')).toEqual(['https://gift.truemoney.com/c/?v=a,b;c', 'https://gift.truemoney.com/c/?v=zz']);
    expect(parseCodes('AAAA-1111, BBBB-2222\nAAAA-1111')).toEqual(['AAAA-1111', 'BBBB-2222']);
  });
  it('history shows only the option that was chosen', () => {
    render(<ClaimedPage L={L} Lf={Lf} lang="en" data={rewards({ claims: [claim()] })} focus="c1" toast={() => undefined} onChanged={() => undefined} onClose={() => undefined} />);
    const row = document.querySelector('#kxHistory [data-claim="c1"]')!;
    expect(row.textContent).toContain('Claimed with TrueMoney · ฿75');
    expect(row.textContent).not.toContain('Grab');
  });
});

describe('one-time coach marks', () => {
  it('each mark shows once; at most one per session; never over a sheet or another mark', () => {
    const st = newCoachState([]);
    expect(coachDue(st, 'save', { sheetOpen: false, onScreen: false })).toBe(true);
    expect(coachDue(st, 'save', { sheetOpen: true, onScreen: false })).toBe(false);
    expect(coachDue(st, 'save', { sheetOpen: false, onScreen: true })).toBe(false);
    coachMark(st, 'save', true);
    expect(kxMock.kxCoachSeen).toHaveBeenCalledWith('save');
    expect(coachDue(st, 'save', { sheetOpen: false, onScreen: false })).toBe(false);
    expect(coachDue(st, 'post', { sheetOpen: false, onScreen: false })).toBe(false);     // one per session
    expect(coachLocal()).toEqual(['save']);
    const next = newCoachState();                                                        // next visit, same phone
    expect(coachDue(next, 'save', { sheetOpen: false, onScreen: false })).toBe(false);
    expect(coachDue(next, 'post', { sheetOpen: false, onScreen: false })).toBe(true);
  });
  it('priority when two are due: post, score, share, then save', () => {
    expect(COACH_ORDER).toEqual(['post', 'score', 'share', 'save']);
    expect(coachPick(newCoachState([]), ['save', 'post'])).toBe('post');
    expect(coachPick(newCoachState(['post']), ['save', 'post'])).toBe('save');
    expect(coachPick(newCoachState([]), ['share', 'score'])).toBe('score');
    expect(coachPick(newCoachState(['post', 'save']), ['save', 'post'])).toBeNull();
  });
  it('signed out: kept on the phone only, the server is not called', () => {
    coachMark(newCoachState([]), 'save', false);
    expect(kxMock.kxCoachSeen).not.toHaveBeenCalled();
    expect(coachLocal()).toEqual(['save']);
  });
  it('new phone: what the account has seen never shows again; a mark seen offline is sent up', async () => {
    kxMock.kxCoachState.mockResolvedValue(['save', 'post']);
    const st = newCoachState(['share']);
    await coachSync(st);
    expect([...st.seen].sort()).toEqual(['post', 'save', 'share']);
    expect(kxMock.kxCoachSeen).toHaveBeenCalledWith('share');
    expect(coachLocal().sort()).toEqual(['post', 'save', 'share']);
  });
  it('server down: the phone copy is used', async () => {
    kxMock.kxCoachState.mockRejectedValue(new Error('offline'));
    const st = newCoachState(['save']);
    await coachSync(st);
    expect([...st.seen]).toEqual(['save']);
  });
  it('"Replay intro" clears both copies so the marks show again', async () => {
    const st = newCoachState(['save', 'post']); st.shownThisSession = true;
    await coachReplay(st, true);
    expect(kxMock.kxCoachReset).toHaveBeenCalled();
    expect(coachLocal()).toEqual([]);
    expect(coachDue(st, 'save', { sheetOpen: false, onScreen: false })).toBe(true);
  });
  it('the bubble: text, "Got it", and one tap anywhere closes it (never blocks)', () => {
    const onDone = vi.fn();
    render(<GoCoach L={L} spot={{ key: 'save', rect: { x: 330, y: 600, w: 46, h: 46 }, text: 'A save gives Ploy 3 Rings. A like gives 1.' }} onDone={onDone} />);
    expect(document.getElementById('goCoach')!.textContent).toBe('A save gives Ploy 3 Rings. A like gives 1.Got it');
    const bub = document.querySelector<HTMLElement>('.go-bub')!;
    expect(parseFloat(bub.style.left)).toBeGreaterThanOrEqual(12);
    fireEvent.click(document.getElementById('goCoach')!);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('sign-in sheet', () => {
  it('shows the ways that really work, all visible at once, and no Apple button (not set up)', () => {
    vi.stubEnv('VITE_GOOGLE_ON', '1');
    render(<V5SignInSheet L={L} Lf={Lf} onClose={() => undefined} />);
    vi.unstubAllEnvs();
    const box = document.getElementById('goSignIn')!;
    expect(box.querySelector('#v5GoogleBtn')!.textContent).toBe('Continue with Google');
    expect(document.getElementById('sh-signin')?.textContent || document.body.textContent).not.toMatch(/Apple/);
    expect(document.getElementById('v5Email') || document.getElementById('v5EmailBtn')).toBeTruthy();
  });
});

// ───────── strings ─────────
const BANNED_EN = ['wallet', 'rate', 'host', 'guide', 'tour', 'creator', 'gift', 'wallet', 'credit', 'coins', 'launch', 'lucky', 'draw', 'chance', 'reviews', 'stars',
  'hidden gem', 'alcohol', 'temples', 'temple', 'meet', 'dating', 'go together', 'find people to go with', 'beer', 'cocktail'];
const BANNED_TH = ['ไกด์', 'โฮสต์', 'ทัวร์', 'ครีเอเตอร์', 'ของขวัญ', 'กระเป๋าเงิน', 'วอลเล็ท', 'วอลเลท', 'เครดิต', 'เหรียญ', 'เปิดตัว', 'โชค', 'ลุ้น', 'จับฉลาก', 'โอกาส',
  'รีวิว', 'ดาว', 'แอลกอฮอล์', 'เหล้า', 'เบียร์', 'วัด', 'เดท', 'เจอ', 'พบ', 'ไปด้วยกัน', 'หาคนไปด้วย', 'นัด'];
const wordHit = (text: string, w: string) => new RegExp(`(^|[^a-z])${w.replace(/ /g, '\\s+')}`, 'i').test(text);
const goKeys = () => {
  const keys = new Set<string>();
  for (const f of ['V5Go.tsx', 'goCoach.ts', 'V5Trim.tsx']) for (const m of fs.readFileSync(path.join(__dirname, f), 'utf8').matchAll(/\bLf?\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) keys.add(m[2].replace(/\\'/g, "'"));
  for (const k of ['People', 'Make new friends in Bangkok. Tap a card to see their Reels.', 'Everyone', 'Travellers', 'Deals', 'Perks at Bangkok places for Kring members, plus trusted partners for travellers.',
    'For Locals', 'For travellers', 'Place perks', 'Show your Kring card', 'Replay intro', 'Intro is on again', 'Choose one. This prize can be claimed once.', 'OR', 'Claim with {0} · {1}',
    'Claimed with {0} · {1}', '{0}% of the prize value', 'Redeem into TrueMoney', 'Your redeem link', 'Copy link', 'Link copied', 'A save gives {0} 3 Rings. A like gives 1.', 'the poster', 'Post your first Reel here', 'Tap to see where your Rings came from',
    'Share to IG or TikTok. Each person who opens the link = +5 Rings.', 'with', 'All']) keys.add(k);
  return [...keys];
};
describe('strings of the go-live screens', () => {
  it('every string has Thai', () => {
    const missing = goKeys().filter((k) => TH(k) === k && /[a-z]{3}/i.test(k) && !['Kring Local', 'Reel'].includes(k));
    expect(missing).toEqual([]);
  });
  it('no banned word in English or Thai (hashtag chips included)', () => {
    for (const k of [...goKeys(), ...GO_TAGS]) {
      for (const w of BANNED_EN) expect(wordHit(k, w), `"${w}" in "${k}"`).toBe(false);
      const th = TH(k);
      for (const w of BANNED_TH) expect(th.includes(w), `"${w}" in "${th}"`).toBe(false);
      for (const w of BANNED_EN) expect(wordHit(th, w), `"${w}" in "${th}"`).toBe(false);
    }
  });
  it('Thai screens: compose and claim read in Thai', () => {
    render(<ClaimPage L={TH} Lf={THf} lang="th" data={rewards()} prize={prize({ kind: 'weekly', rank: 8, founding_no: null, week: '2026-11-09' })} onBack={() => undefined} onDone={() => undefined} toast={() => undefined} />);
    expect(document.getElementById('kxClaimOne')!.textContent).toBe('รางวัลนี้กดรับได้ครั้งเดียว');
    expect(document.getElementById('kxClaimGo')!.textContent).toContain('TrueMoney');
    expect(document.querySelector('.kx-or')).toBeNull();
  });
});
