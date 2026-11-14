import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import {
  bahtFor, claimCheck, countdown, inviteCode, levelFor, memberNo, parseHandle, rankRows, ringsFor, socialUrl, toTop10, togglePick, valueFor, weekEnd, weeklyPrize,
} from './kxLogic';
import { KX_AREA_TH, KX_L, V5_L } from './v5Strings';

const kxMock = vi.hoisted(() => ({ kxClaim: vi.fn(), kxRecentClaims: vi.fn(), kxMarkUsed: vi.fn() }));
vi.mock('./v5Kx', async (orig) => ({ ...(await orig<typeof import('./v5Kx')>()), ...kxMock }));
import { ClaimedPage, ClaimPage, RewardsPage } from './V5KxRewards';
import { RINGS, ringsRules } from './rewardsConfig';
import type { KxRewards } from './v5Kx';

const L = (en: string) => en;
const Lf = (en: string, a: string, b = '') => en.replace('{0}', a).replace('{1}', b);
const LT = (en: string) => KX_L.th[en] || en;
const rewards = (balance: number, extra: Partial<KxRewards> = {}): KxRewards => ({ balance, lifetime: balance, week: 0, level: 1, member_no: 412, reel_place_today: false,
  best_likes: 0, friends: 0, claims: [], earned: [], ...extra });
beforeEach(() => { kxMock.kxRecentClaims.mockResolvedValue([]); kxMock.kxClaim.mockReset(); });
afterEach(() => cleanup());

describe('handle parsing (Instagram / TikTok)', () => {
  it('accepts @name, name and pasted profile links, lower-cased', () => {
    expect(parseHandle('ig', '@Mint.BKK')).toEqual({ ok: true, handle: 'mint.bkk' });
    expect(parseHandle('ig', 'https://www.instagram.com/mint.bkk/?igsh=abc123')).toEqual({ ok: true, handle: 'mint.bkk' });
    expect(parseHandle('ig', 'instagram.com/mint_bkk')).toEqual({ ok: true, handle: 'mint_bkk' });
    expect(parseHandle('ig', 'm.instagram.com/mint.bkk/reels/')).toEqual({ ok: true, handle: 'mint.bkk' });
    expect(parseHandle('tt', 'https://www.tiktok.com/@mintwalks?lang=th')).toEqual({ ok: true, handle: 'mintwalks' });
    expect(parseHandle('tt', 'tiktok.com/@mint.walks/video/7300000000')).toEqual({ ok: true, handle: 'mint.walks' });
    expect(parseHandle('tt', '@mintwalks')).toEqual({ ok: true, handle: 'mintwalks' });
    expect(parseHandle('tt', '  ')).toEqual({ ok: true, handle: null });
  });
  it('refuses bad characters, the other site and short links without a name', () => {
    expect(parseHandle('ig', 'mint bkk')).toEqual({ ok: false, error: 'BAD_HANDLE' });
    expect(parseHandle('ig', 'mint-bkk')).toEqual({ ok: false, error: 'BAD_HANDLE' });
    expect(parseHandle('ig', 'mint..bkk')).toEqual({ ok: false, error: 'BAD_HANDLE' });
    expect(parseHandle('ig', 'มิ้นท์')).toEqual({ ok: false, error: 'BAD_HANDLE' });
    expect(parseHandle('ig', 'https://www.tiktok.com/@mintwalks')).toEqual({ ok: false, error: 'WRONG_SITE' });
    expect(parseHandle('tt', 'https://instagram.com/mint.bkk')).toEqual({ ok: false, error: 'WRONG_SITE' });
    expect(parseHandle('tt', 'https://vm.tiktok.com/ZSabc123/')).toEqual({ ok: false, error: 'BAD_HANDLE' });
    expect(parseHandle('tt', 'a')).toEqual({ ok: false, error: 'BAD_HANDLE' });
    expect(parseHandle('tt', 'x'.repeat(25))).toEqual({ ok: false, error: 'BAD_HANDLE' });
  });
  it('pills open the right profile URL', () => {
    expect(socialUrl('ig', 'mint.bkk')).toBe('https://www.instagram.com/mint.bkk/');
    expect(socialUrl('tt', 'mintwalks')).toBe('https://www.tiktok.com/@mintwalks');
  });
});

describe('Rings math', () => {
  it('10 Rings = ฿1, amounts 100 / 300 / 500', () => {
    expect(ringsFor(100)).toBe(1000);
    expect(ringsFor(300)).toBe(3000);
    expect(ringsFor(500)).toBe(5000);
    expect(bahtFor(1340)).toBe(134);
    expect(bahtFor(9)).toBe(0);
    expect(bahtFor(-50)).toBe(0);
  });
  it('TrueMoney keeps 25%: ฿100 → ฿75; Grab and ShopeePay are full value', () => {
    expect(valueFor('truemoney', 100)).toBe(75);
    expect(valueFor('truemoney', 300)).toBe(225);
    expect(valueFor('truemoney', 500)).toBe(375);
    expect(valueFor('grab', 100)).toBe(100);
    expect(valueFor('shopeepay', 500)).toBe(500);
  });
  it('claim check: not enough Rings, bad amount / brand', () => {
    expect(claimCheck(999, 100, 'grab')).toBe('LOW_BALANCE');
    expect(claimCheck(1000, 100, 'grab')).toBe('ok');
    expect(claimCheck(4999, 500, 'truemoney')).toBe('LOW_BALANCE');
    expect(claimCheck(9000, 200, 'grab')).toBe('BAD_REWARD');
    expect(claimCheck(9000, 100, 'starbucks')).toBe('BAD_REWARD');
  });
  it('levels from lifetime Rings: 0 / 1,000 / 3,000 / 8,000 / 20,000', () => {
    expect(levelFor(0)).toMatchObject({ n: 1, key: 'Local', toNext: 1000, nextKey: 'Explorer' });
    expect(levelFor(999).n).toBe(1);
    expect(levelFor(1000)).toMatchObject({ n: 2, key: 'Explorer', toNext: 2000 });
    expect(levelFor(3000).n).toBe(3);
    expect(levelFor(8000)).toMatchObject({ n: 4, key: 'Insider' });
    expect(levelFor(20000)).toMatchObject({ n: 5, key: 'Legend', next: null, toNext: 0, pct: 100 });
    expect(levelFor(2000).pct).toBe(50);
  });
  it('member number and invite code', () => {
    expect(memberNo(412)).toBe('#00412');
    expect(memberNo(null)).toBe('#—');
    expect(inviteCode(412)).toBe('k00412');
    expect(/^[a-z0-9_-]{3,40}$/.test(inviteCode(412))).toBe(true);   // passes kr8_set_ref
  });
  it('weekly prizes: 5,000 / 3,000 / 2,000 / 500 × 7', () => {
    expect([1, 2, 3, 4, 10, 11].map(weeklyPrize)).toEqual([5000, 3000, 2000, 500, 500, 0]);
  });
});

describe('Rings config (one place, server can override)', () => {
  it('defaults are the founder rules of 14 Nov', () => {
    expect(RINGS).toMatchObject({ checkin: 5, streak_days: 7, streak_bonus: 50, react_goal: 3, react: 10, reel_place: 100, reel_place_week_cap: 3, likes_50: 0, friend: 300, friend_welcome: 100,
      weekly_1: 5000, weekly_2: 3000, weekly_3: 2000, weekly_4_10: 500, rings_per_baht: 10 });
  });
  it('server numbers win, unknown keys are ignored, missing keys keep the default', () => {
    const r = ringsRules({ reel_place: 150, react: 0, nonsense: 9 });
    expect(r.reel_place).toBe(150);
    expect(r.react).toBe(0);
    expect(r.checkin).toBe(5);
    expect((r as Record<string, number>).nonsense).toBeUndefined();
  });
  it('Rewards home shows only: balance card, Today (3 rows max), one invite card, one live line', async () => {
    render(<RewardsPage L={L} Lf={Lf} lang="en" inviteLink="https://kringapp.com/app/?ref=k00412"
      data={rewards(640, { rules: { ...RINGS, reel_place: 120 }, checked_in_today: true, streak: 3, reacts_today: 2, react_done: false, reel_place_week: 1, friends: 2 })}
      onBack={() => undefined} onClaim={() => undefined} onHistory={() => undefined} onPost={() => undefined} onInvite={() => undefined} onReact={() => undefined} />);
    expect(document.querySelectorAll('#kxToday [data-today]').length).toBe(3);
    expect(document.querySelectorAll('.kx-invite').length).toBe(1);
    expect(screen.getByText('Day 3 of 7 streak')).toBeTruthy();
    expect(screen.getByText('2 of 3 today')).toBeTruthy();
    expect(screen.getByText('1 of 3 this week')).toBeTruthy();
    expect(screen.getByText('360 to ฿100')).toBeTruthy();
    expect(document.querySelector('[data-today="reel"]')!.textContent).toContain('+120');   // from the server config
    expect(screen.queryByText('Get 50 likes')).toBeNull();
    expect(screen.queryByText('Weekly top 10')).toBeNull();
  });
});

describe('weekly ranking order and ties', () => {
  it('Rings ↓, then whoever reached the total first, then the older member number; ranks are unique', () => {
    const rows = rankRows([
      { id: 'late', rings: 500, lastAt: 300, memberNo: 1 },
      { id: 'early', rings: 500, lastAt: 100, memberNo: 9 },
      { id: 'top', rings: 900, lastAt: 999, memberNo: 5 },
      { id: 'sameTimeOld', rings: 200, lastAt: 50, memberNo: 2 },
      { id: 'sameTimeNew', rings: 200, lastAt: 50, memberNo: 7 },
      { id: 'zero', rings: 0, lastAt: 1, memberNo: 3 },
      { id: 'neg', rings: -200, lastAt: 1, memberNo: 4 },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['top', 'early', 'late', 'sameTimeOld', 'sameTimeNew']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });
  it('Rings to the top 10', () => {
    expect(toTop10(2340, 14, 2720)).toBe(381);
    expect(toTop10(3000, 9, 2720)).toBe(0);
    expect(toTop10(0, null, null)).toBe(1);
  });
  it('week ends Monday 00:00 Bangkok; countdown "2d 14:06"', () => {
    const fri = Date.parse('2026-11-13T12:00:00+07:00');
    expect(new Date(weekEnd(fri)).toISOString()).toBe('2026-11-15T17:00:00.000Z');
    expect(countdown(Date.parse('2026-11-14T09:54:00+07:00'), weekEnd(fri))).toBe('1d 14:06');
    expect(weekEnd(Date.parse('2026-11-16T00:00:30+07:00'))).toBe(Date.parse('2026-11-23T00:00:00+07:00'));
  });
});

describe('places: 2 at most', () => {
  it('third pick is refused, tapping a picked one removes it', () => {
    const a = { id: 'a' }, b = { id: 'b' }, c = { id: 'c' };
    let r = togglePick([], a); r = togglePick(r.list, b);
    expect(r.list.map((x) => x.id)).toEqual(['a', 'b']);
    const full = togglePick(r.list, c);
    expect(full.full).toBe(true);
    expect(full.list.map((x) => x.id)).toEqual(['a', 'b']);
    expect(togglePick(r.list, a).list.map((x) => x.id)).toEqual(['b']);
  });
});

describe('Claim screen', () => {
  it('not enough Rings: says how many are missing and never calls the server', async () => {
    const onDone = vi.fn();
    render(<ClaimPage L={L} Lf={Lf} data={rewards(500)} onBack={() => undefined} onDone={onDone} toast={() => undefined} />);
    fireEvent.click(screen.getByText('Claim Grab ฿100'));
    expect(await screen.findByText('You need 500 more Rings for this one.')).toBeTruthy();
    expect(kxMock.kxClaim).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(document.querySelector('[data-amount="300"]')!.className).toContain('lk');
  });
  it('server says LOW_BALANCE (balance changed meanwhile): shown, nothing deducted on screen', async () => {
    kxMock.kxClaim.mockRejectedValue(new Error('KR8_LOW_BALANCE'));
    const onDone = vi.fn();
    render(<ClaimPage L={L} Lf={Lf} data={rewards(1200)} onBack={() => undefined} onDone={onDone} toast={() => undefined} />);
    fireEvent.click(screen.getByText('Claim Grab ฿100'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
  it('TrueMoney shows ฿75 and "TrueMoney keeps 25%" for ฿100', () => {
    render(<ClaimPage L={L} Lf={Lf} data={rewards(1340)} onBack={() => undefined} onDone={() => undefined} toast={() => undefined} />);
    const tm = document.querySelector('[data-brand="truemoney"]')!;
    expect(tm.textContent).toContain('฿75');
    expect(tm.textContent).toContain('TrueMoney keeps 25%');
    fireEvent.click(tm);
    expect(screen.getByText('Claim TrueMoney ฿75')).toBeTruthy();
    expect(document.querySelector('[data-brand="grab"] [data-value]')!.getAttribute('data-value')).toBe('100');
  });
  it('one tap claims with the chosen amount and brand', async () => {
    kxMock.kxClaim.mockResolvedValue({ status: 'assigned', claim_id: 'c1', brand: 'shopeepay', amount: 300, value: 300, code: 'TEST-123', activation_url: null });
    const onDone = vi.fn();
    render(<ClaimPage L={L} Lf={Lf} data={rewards(3400)} onBack={() => undefined} onDone={onDone} toast={() => undefined} />);
    fireEvent.click(document.querySelector('[data-amount="300"]')!);
    fireEvent.click(document.querySelector('[data-brand="shopeepay"]')!);
    fireEvent.click(screen.getByText('Claim ShopeePay ฿300'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(kxMock.kxClaim).toHaveBeenCalledWith(300, 'shopeepay');
  });
  it('no stock: claim is HELD (Rings reserved), "Your code is on the way"', async () => {
    kxMock.kxClaim.mockResolvedValue({ status: 'pending', claim_id: 'p1', brand: 'grab', amount: 100, rings: 1000 });
    const onDone = vi.fn();
    render(<ClaimPage L={L} Lf={Lf} data={rewards(1340)} onBack={() => undefined} onDone={onDone} toast={() => undefined} />);
    fireEvent.click(screen.getByText('Claim Grab ฿100'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' })));
    cleanup();
    const held = rewards(340, { claims: [{ id: 'p1', brand: 'grab', amount: 100, rings: 1000, status: 'pending', value: null, code: null, activation_url: null, used_at: null, created_at: new Date().toISOString(), assigned_at: null }] });
    render(<ClaimedPage L={L} Lf={Lf} lang="en" data={held} focus={null} toast={() => undefined} onClose={() => undefined} onChanged={() => undefined} />);
    expect(screen.getAllByText('Your code is on the way').length).toBeGreaterThan(0);
    expect(screen.getByText('Your Rings are reserved. We’ll let you know here the moment your code is ready.')).toBeTruthy();
    expect(document.querySelector('#kxTicket')).toBeNull();
    expect(document.querySelector('[data-status="pending"]')).toBeTruthy();
  });
  it('claimed: gold ticket with the code, NEW tag, Mark as used flips it to USED', async () => {
    kxMock.kxMarkUsed.mockResolvedValue(true);
    const d = rewards(340, { claims: [{ id: 'c1', brand: 'grab', amount: 100, rings: 1000, status: 'assigned', value: 100, code: 'TEST-GRAB-0001', activation_url: null, used_at: null, created_at: new Date().toISOString(), assigned_at: new Date().toISOString() }],
      earned: [{ reason: 'reel_place', delta: 200, at: new Date(Date.now() - 86400_000).toISOString(), detail: 'Benjakitti Forest Park', detail_th: 'สวนป่าเบญจกิติ' }] });
    render(<ClaimedPage L={L} Lf={Lf} lang="en" data={d} focus="c1" fresh toast={() => undefined} onClose={() => undefined} onChanged={() => undefined} />);
    expect(screen.getByText('Claimed!')).toBeTruthy();
    expect(document.querySelector('#kxCode')!.textContent).toBe('TEST-GRAB-0001');
    expect(screen.getByText('Open Grab')).toBeTruthy();
    expect(screen.getByText('NEW')).toBeTruthy();
    expect(screen.getByText('EARNED')).toBeTruthy();
    expect(screen.getByText('Reel at Benjakitti Forest Park')).toBeTruthy();
    fireEvent.click(document.querySelector('[data-mark="c1"]')!);
    await waitFor(() => expect(screen.getByText('USED')).toBeTruthy());
    expect(kxMock.kxMarkUsed).toHaveBeenCalledWith('c1', true);
  });
});

// ───────── words that must never appear in any new UI string (TH or EN) ─────────
const BANNED_EN = ['rate', 'host', 'guide', 'tour', 'creator', 'gift', 'wallet', 'credit', 'coins', 'launch', 'lucky', 'draw', 'chance', 'reviews', 'stars',
  'hidden gem', 'alcohol', 'temples', 'temple', 'meet', 'dating', 'go together', 'find people to go with', 'beer', 'cocktail'];
const BANNED_TH = ['ไกด์', 'โฮสต์', 'ทัวร์', 'ครีเอเตอร์', 'ของขวัญ', 'กระเป๋าเงิน', 'วอลเล็ท', 'วอลเลท', 'เครดิต', 'เหรียญ', 'เปิดตัว', 'โชค', 'ลุ้น', 'จับฉลาก', 'โอกาส',
  'รีวิว', 'ดาว', 'แอลกอฮอล์', 'เหล้า', 'เบียร์', 'วัด', 'เดท', 'เจอ', 'พบ', 'ไปด้วยกัน', 'หาคนไปด้วย', 'นัด'];
const SRC = ['V5KxCard.tsx', 'V5KxRewards.tsx', 'V5KxRanking.tsx', 'V5KxPlaces.tsx'].map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8'));
const uiKeys = () => {
  const keys = new Set<string>();
  for (const s of SRC) for (const m of s.matchAll(/\bLf?\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) keys.add(m[2].replace(/\\'/g, "'"));
  return [...keys];
};
const wordHit = (text: string, w: string) => new RegExp(`(^|[^a-z])${w.replace(/ /g, '\\s+')}`, 'i').test(text);

describe('banned words', () => {
  it('no banned word in any new string (EN keys, TH values, area names, literal UI text)', () => {
    const en = [...uiKeys(), ...Object.keys(KX_L.th), ...Object.keys(KX_AREA_TH)];
    const th = [...Object.values(KX_L.th), ...Object.values(KX_AREA_TH)];
    for (const t of en) for (const w of BANNED_EN) expect(wordHit(t, w), `"${w}" in "${t}"`).toBe(false);
    for (const t of th) {
      for (const w of BANNED_TH) expect(t.includes(w), `"${w}" in "${t}"`).toBe(false);
      for (const w of BANNED_EN) expect(wordHit(t, w), `"${w}" in "${t}"`).toBe(false);
    }
  });
  it('the scan really catches a banned word', () => {
    expect(wordHit('Grab credit', 'credit')).toBe(true);
    expect(wordHit('Go together', 'go together')).toBe(true);
    expect(wordHit('Separate', 'rate')).toBe(false);
  });
  it('rewards are named by brand + amount ("Grab ฿100"), never "Grab credit"', () => {
    for (const s of SRC) expect(/credit/i.test(s.replace(/photo_credit/g, '').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''))).toBe(false);
  });
  it('every new UI string has Thai', () => {
    const shared = new Set(['Back', 'Close', 'Done', 'Share', 'You', 'Rewards', 'Today', 'My area', 'Open in Maps', 'Link copied', 'First name', 'Saving…', 'Your Kring card',
      'More about you (optional) ›', 'Languages you speak', 'One line about you', 'Your area', 'e.g. Coffee walks, street food, sunset spots', 'I confirm I am 20 or older',
      'Add your first name.', 'Pick at least one language.', 'Please confirm you are 20 or older.', 'Card saved · กริ๊ง!', 'Something went wrong. Try again.',
      'Couldn’t reach Kring. Check your connection and try again.']);
    const missing = uiKeys().filter((k) => !KX_L.th[k] && !(shared.has(k) && V5_L.th[k]));
    expect(missing).toEqual([]);
    expect(LT('Claim {0}')).toBe('กดรับ {0}');
  });
});

describe('admin: paste reward codes', () => {
  it('one per line (or comma), trimmed, deduped, junk dropped', async () => {
    const { parseCodes } = await import('../venue/adminApp');
    expect(parseCodes(' KRG7-Q4MX \nKRG7-Q4MX\n\nAB\nTMN-88K2, SPAY-1234 ;  ')).toEqual(['KRG7-Q4MX', 'TMN-88K2', 'SPAY-1234']);
  });
});
