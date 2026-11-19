import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';

const liveMock = vi.hoisted(() => ({ v5RewardStart: vi.fn(async () => Date.parse('2026-11-17T00:00:00+07:00')) }));
vi.mock('./v5Live', async (orig) => ({ ...(await orig<typeof import('./v5Live')>()), ...liveMock }));

import {
  _resetPrizeSession, BANNED_WORDS, bkkDate, fill, hidePrize, pickPrize, PRIZE_COPY, prizeHidden, raceClock, rankDelta, weekIn, type PrizeKind, type WeekIn,
} from './prizeRace';
import { Odo, phrases, PrizeBanner } from './V5PrizeBanner';
import { foundingDue, MeView } from './V5Me';
import type { KxGap, KxRanking } from './v5Kx';
import type { V5Profile } from './v5Live';

const bkk = (iso: string) => Date.parse(`${iso}+07:00`);
const ENDS = '2026-11-22T17:00:00.000Z';   // Sun 22 Nov 24:00 Bangkok (16 Nov 2026 is a Monday)
const ME = 'u-me';
const seenKey = `kr8_pz_seen_${ME}`;
const ladder = [1500, 900, 600, 500, 400, 250, 150, 100, 0, 0];

function week(rings: number, rank: number | null, gap: Partial<KxGap> | null, extra: Partial<KxRanking> = {}): KxRanking {
  return {
    week_start: '2026-11-15T17:00:00.000Z', ends_at: ENDS, scope: 'all', area: 'Ari', total: 10, paid_ranks: 8, floor: 25, posters: 10, min_posters: 0,
    payout_on: true, open_seats: 0, prizes: ladder, rows: [], me: rank ? { rank, all_rank: rank, rings, prize: ladder[rank - 1] || 0, move: null } : null,
    gap: gap ? { state: 'paid', rank, rings, floor: 25, prize_now: 0, target: null, above: null, behind: null, top10_need: null, ...gap } : null, mine: null, ...extra,
  };
}
const W = (r: KxRanking): WeekIn => weekIn(r);
const C_WEEK = week(46, 3, { state: 'paid', target: { rank: 2, need: 4, prize: 900, open: false } });

/** What a person sees: rolling digits read as their number (aria-label), the hidden 0–9 strips are skipped. */
function seen(n: Node): string {
  if (n.nodeType === 3) return n.textContent || '';
  const e = n as Element;
  if (e.getAttribute?.('aria-hidden') === 'true') return '';
  if (e.getAttribute?.('role') === 'img' && e.getAttribute('aria-label')) return e.getAttribute('aria-label')!;
  return [...n.childNodes].map(seen).join('');
}
const text = (el: Element | null) => (el ? seen(el) : '').replace(/\s+/g, ' ').trim();

beforeEach(() => { localStorage.clear(); _resetPrizeSession(); });
afterEach(() => { vi.useRealTimers(); });

describe('weekly prize copy (WEEKLY_PRIZE_PACK_16NOV §1, word for word)', () => {
  const v = { n: 4, rank: 2, top: 1500, paid: 8, floor: 25 };
  it('A · B · C and the under-25 line are the founder’s exact words, Thai first with English under', () => {
    expect(fill(PRIZE_COPY.A.head.th, v)).toBe('สัปดาห์ใหม่เริ่มแล้ว · ท็อป 8 รับ TrueMoney');
    expect(fill(PRIZE_COPY.A.head.en, v)).toBe('A new week has started · Top 8 win TrueMoney');
    expect(fill(PRIZE_COPY.A.sub.th, v)).toBe('รีลที่ดีที่สุดของคุณ คือรีลที่ได้นับ');
    expect(fill(PRIZE_COPY.A.sub.en, v)).toBe('Your best Reel is the one that counts');
    expect(fill(PRIZE_COPY.B.head.th, v)).toBe('กรุงเทพฯ ในแบบของคุณ ให้คนทั้งโลกเห็น');
    expect(fill(PRIZE_COPY.B.head.en, v)).toBe('Your Bangkok, for the whole world to see');
    expect(fill(PRIZE_COPY.B.sub.th, v)).toBe('ที่ 1 ของสัปดาห์รับ ฿1,500 · ดูอันดับ ›');
    expect(fill(PRIZE_COPY.B.sub.en, v)).toBe('#1 of the week gets ฿1,500 · See ranking ›');
    expect(fill(PRIZE_COPY.C.head.th, v)).toBe('อีก 4 ริง ขึ้นที่ 2');
    expect(fill(PRIZE_COPY.C.head.en, v)).toBe('4 Rings to #2');
    expect(fill(PRIZE_COPY.C.sub.th, v)).toBe('ไลก์และเซฟจากนักเดินทางนับ 2 เท่า ›');
    expect(fill(PRIZE_COPY.C.sub.en, v)).toBe('Likes and saves from travellers count double ›');
    expect(fill(PRIZE_COPY.C25.head.th, { ...v, n: 10 })).toBe('อีก 10 ริง ถึง 25 ริง พร้อมชิงท็อป 8');
    expect(fill(PRIZE_COPY.C25.head.en, { ...v, n: 10 })).toBe('10 Rings to 25 and you’re in the running for the Top 8');
  });
  it('the ticker only ever shortens the copy', () => {
    for (const k of Object.keys(PRIZE_COPY) as PrizeKind[]) {
      const c = PRIZE_COPY[k];
      for (const l of [c.short, c.tight].filter(Boolean)) {
        for (const lang of ['th', 'en'] as const) {
          const full = `${fill(c.head[lang], v)} ${fill(c.sub[lang], v)}`;
          expect(full).toContain(fill(l![lang], v).replace(/ ›$/, ''));
        }
      }
    }
  });
  it('one Ring is singular in English', () => {
    expect(fill(PRIZE_COPY.C.head.en, { ...v, n: 1 })).toBe('1 Ring to #2');
  });
  it('no banned word anywhere (English or Thai), including the countdown and the prize label', () => {
    const all: string[] = [];
    for (const c of Object.values(PRIZE_COPY)) for (const l of [c.head, c.sub, c.short, c.tight]) if (l) all.push(fill(l.th, v), fill(l.en, v));
    const clk = raceClock(bkk('2026-11-19T21:05:00'), Date.parse(ENDS));
    all.push(clk.th, clk.en, 'รางวัลที่ 2', '#2 prize', 'ซ่อนวันนี้ · Hide for today');
    for (const s of all) for (const w of BANNED_WORDS) expect(s.toLowerCase().includes(w), `"${w}" in "${s}"`).toBe(false);
  });
});

describe('which message a member sees (picked from their own week)', () => {
  it('no Rings yet: A on Monday to Wednesday, B from Thursday (Bangkok days, not UTC)', () => {
    const zero = W(week(0, null, { state: 'off', rank: null, target: { rank: 8, need: 27, prize: 100, open: false } }));
    expect(pickPrize(zero, bkk('2026-11-16T00:00:00'))?.kind).toBe('A');
    expect(pickPrize(zero, bkk('2026-11-18T23:59:00'))?.kind).toBe('A');
    expect(pickPrize(zero, bkk('2026-11-19T00:00:00'))?.kind).toBe('B');
    expect(pickPrize(zero, bkk('2026-11-22T23:30:00'))?.kind).toBe('B');
    // Thursday 06:00 in Bangkok is still Wednesday 23:00 UTC: the Bangkok day decides
    expect(pickPrize(zero, Date.parse('2026-11-18T23:00:00Z'))?.kind).toBe('B');
    expect(pickPrize(zero, bkk('2026-11-17T09:00:00'))?.stake).toEqual({ rank: 1, prize: 1500 });
  });
  it('C: the server’s gap to the next paid rank, with what it pays and the ring meter', () => {
    const p = pickPrize(W(C_WEEK), bkk('2026-11-19T21:05:00'))!;
    expect(p.kind).toBe('C');
    expect(p.vals).toMatchObject({ n: 4, rank: 2 });
    expect(p.stake).toEqual({ rank: 2, prize: 900 });
    expect(p.progress).toBeCloseTo(46 / 50);
  });
  it('fewer than 25 Rings: the under-25 line, n = Rings to 25', () => {
    const p = pickPrize(W(week(15, 6, { state: 'floor', target: { rank: 6, need: 10, prize: 250, open: false } })), bkk('2026-11-18T12:30:00'))!;
    expect(p.kind).toBe('C25');
    expect(p.vals.n).toBe(10);
    expect(p.progress).toBeCloseTo(15 / 25);
    expect(p.stake).toEqual({ rank: 6, prize: 250 });
  });
  it('#1 gets the pride line (B), any day', () => {
    expect(pickPrize(W(week(131, 1, { state: 'top', target: null })), bkk('2026-11-18T11:00:00'))?.kind).toBe('B');
  });
  it('nothing when prizes are off this week, or once the week has closed', () => {
    expect(pickPrize(W(week(46, 3, C_WEEK.gap, { payout_on: false })), bkk('2026-11-19T21:05:00'))).toBeNull();
    expect(pickPrize(W(C_WEEK), Date.parse(ENDS))).toBeNull();
    expect(pickPrize(null, Date.now())).toBeNull();
  });
});

describe('countdown to Sunday 24:00 Bangkok', () => {
  it('days and minutes, then seconds in the last 6 hours', () => {
    const end = Date.parse(ENDS);
    expect(raceClock(bkk('2026-11-20T09:54:00'), end)).toMatchObject({ th: 'จบใน 2 วัน 14:06', en: 'Ends 2d 14:06', last: false });
    expect(raceClock(bkk('2026-11-22T16:55:00'), end)).toMatchObject({ th: 'จบใน 07:05', en: 'Ends 07:05', last: false });
    expect(raceClock(bkk('2026-11-22T19:12:25'), end)).toMatchObject({ th: 'จบใน 4:47:35', en: 'Ends 4:47:35', last: true });
    expect(raceClock(bkk('2026-11-16T00:00:00'), end).frac).toBeCloseTo(0);
    expect(raceClock(bkk('2026-11-19T12:00:00'), end).frac).toBeCloseTo(0.5);
  });
});

describe('Thai line breaks', () => {
  const ts = (s: string) => phrases(s).map((u) => u.t);
  it('a line breaks only between phrases; numbers stay with their words; no line starts with "·", "›" or a number', () => {
    expect(ts('อีก {n} ริง ขึ้นที่ {rank}')).toEqual(['อีก {n} ริง', 'ขึ้นที่ {rank}']);
    expect(ts('สัปดาห์ใหม่เริ่มแล้ว · ท็อป {paid} รับ TrueMoney')).toEqual(['สัปดาห์ใหม่เริ่มแล้ว ·', 'ท็อป {paid} รับ', 'TrueMoney']);
    expect(phrases('ไลก์และเซฟจากนักเดินทางนับ 2 เท่า ›')).toEqual([{ t: 'ไลก์และเซฟจากนักเดินทาง', wbr: false }, { t: 'นับ 2 เท่า ›', wbr: true }]);
    expect(ts('อีก {n} ริง ถึง {floor} ริง พร้อมชิงท็อป {paid}')).toEqual(['อีก {n} ริง', 'ถึง {floor} ริง', 'พร้อมชิง', 'ท็อป {paid}']);
    expect(ts('กรุงเทพฯ ในแบบของคุณ ให้คนทั้งโลกเห็น')).toEqual(['กรุงเทพฯ', 'ในแบบของคุณ', 'ให้คนทั้งโลกเห็น']);
    for (const c of Object.values(PRIZE_COPY)) for (const l of [c.head, c.sub, c.short]) {
      for (const u of phrases(l.th)) expect(u.t).not.toMatch(/^([·›]|\{n\}|\{rank\}|\{top\}|\d)/);
    }
  });
});

describe('hide for the day · rank change since the last look', () => {
  it('✕ hides until the next Bangkok day', () => {
    const t = bkk('2026-11-19T23:50:00');
    hidePrize(ME, t);
    expect(prizeHidden(ME, t + 5 * 60_000)).toBe(true);
    expect(prizeHidden(ME, bkk('2026-11-20T00:01:00'))).toBe(false);
    expect(bkkDate(Date.parse('2026-11-19T17:30:00Z'))).toBe('2026-11-20');
  });
  it('up 2 since last time this week; nothing on a new week or with no change', () => {
    expect(rankDelta({ week: 'w', rank: 5 }, 'w', 3)).toBe(2);
    expect(rankDelta({ week: 'w', rank: 3 }, 'w', 4)).toBe(-1);
    expect(rankDelta({ week: 'w0', rank: 5 }, 'w', 3)).toBeNull();
    expect(rankDelta({ week: 'w', rank: 3 }, 'w', 3)).toBeNull();
    expect(rankDelta(null, 'w', 3)).toBeNull();
  });
});

async function show(ui: React.ReactElement) {
  const r = render(ui);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return r;
}
function clockAt(ms: number) {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(ms);
}

describe('PrizeBanner on screen', () => {
  it('Me card (C): both languages, ฿ for the next rank, rank with "up 2", tap opens the ranking', async () => {
    clockAt(bkk('2026-11-19T21:05:00'));
    localStorage.setItem(seenKey, JSON.stringify({ week: C_WEEK.week_start, rank: 5 }));
    const onOpen = vi.fn();
    await show(<div className="v8-app-root"><PrizeBanner variant="card" uid={ME} week={C_WEEK} onOpen={onOpen} /></div>);
    const card = document.getElementById('kpzCard')!;
    expect(card.dataset.kind).toBe('C');
    expect(text(card.querySelector('.kpz-h.kpz-th'))).toBe('อีก 4 ริง ขึ้นที่ 2');
    expect(text(card.querySelector('.kpz-h.kpz-en'))).toBe('4 Rings to #2');
    expect(text(card.querySelector('.kpz-s.kpz-th'))).toBe('ไลก์และเซฟจากนักเดินทางนับ 2 เท่า ›');
    expect(text(card.querySelector('.kpz-stake .kpz-baht'))).toBe('฿900');
    expect(text(card.querySelector('.kpz-cd .kpz-th'))).toBe('จบใน 3 วัน 02:55');
    expect(text(card.querySelector('.kpz-cd .kpz-en'))).toBe('Ends 3d 02:55');
    expect(card.querySelector('.kpz-rk')!.getAttribute('data-rank')).toBe('3');
    expect(card.querySelector('.kpz-dl.up')!.getAttribute('aria-label')).toBe('Up 2 since you last looked');
    expect(card.querySelector('.kpz-rp')!.getAttribute('data-progress')).toBe('0.92');
    expect(JSON.parse(localStorage.getItem(seenKey)!)).toEqual({ week: C_WEEK.week_start, rank: 3 });
    fireEvent.click(card.querySelector('.kpz-hit')!);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
  it('Rings change → the digits roll to the new number (no remount)', async () => {
    clockAt(bkk('2026-11-19T21:05:00'));
    const r = await show(<div className="v8-app-root"><PrizeBanner variant="card" uid={ME} week={C_WEEK} onOpen={() => undefined} /></div>);
    const odo = () => document.querySelector('.kpz-h.kpz-en .kpz-odo') as HTMLElement;
    const first = odo();
    expect(first.dataset.value).toBe('4');
    const next = week(48, 3, { state: 'paid', target: { rank: 2, need: 2, prize: 900, open: false } });
    r.rerender(<div className="v8-app-root"><PrizeBanner variant="card" uid={ME} week={next} onOpen={() => undefined} /></div>);
    expect(odo()).toBe(first);
    expect(odo().dataset.value).toBe('2');
    expect((odo().querySelector('.kpz-ods') as HTMLElement).style.transform).toBe('translateY(-20%)');
    expect(text(document.querySelector('.kpz-h.kpz-en'))).toBe('2 Rings to #2');
  });
  it('Feed ticker: the short line; in the last 6 hours the shortest line and a live countdown', async () => {
    clockAt(bkk('2026-11-20T19:40:00'));
    const zero = week(0, null, { state: 'off', rank: null, target: { rank: 8, need: 27, prize: 100, open: false } });
    const r = await show(<div className="v8-app-root"><PrizeBanner variant="ticker" uid={ME} week={zero} onOpen={() => undefined} /></div>);
    let t = document.getElementById('kpzTicker')!;
    expect(t.dataset.kind).toBe('B');
    expect(text(t.querySelector('.kpz-th'))).toBe('ที่ 1 ของสัปดาห์รับ ฿1,500');
    expect(text(t.querySelector('.kpz-en'))).toBe('#1 of the week gets ฿1,500');
    expect(t.querySelector('.kpz-tcd')).toBeNull();
    r.unmount();
    clockAt(bkk('2026-11-22T19:12:25'));
    await show(<div className="v8-app-root"><PrizeBanner variant="ticker" uid={ME} week={C_WEEK} onOpen={() => undefined} /></div>);
    t = document.getElementById('kpzTicker')!;
    expect(t.className).toContain('last');
    expect(text(t.querySelector('.kpz-th'))).toBe('อีก 4 ริง');
    expect(text(t.querySelector('.kpz-en'))).toBe('4 Rings to #2');
    expect(t.querySelector('.kpz-tcd')!.textContent).toBe('4:47:35');
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(document.querySelector('.kpz-tcd')!.textContent).toBe('4:47:34');
  });
  it('✕ hides it for the rest of the day (and tells the other surface)', async () => {
    clockAt(bkk('2026-11-19T21:05:00'));
    const onHide = vi.fn();
    await show(<div className="v8-app-root"><PrizeBanner variant="ticker" uid={ME} week={C_WEEK} onOpen={() => undefined} onHide={onHide} /></div>);
    fireEvent.click(document.querySelector('.kpz-x')!);
    expect(document.getElementById('kpzTicker')!.className).toContain('out');
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(document.getElementById('kpzTicker')).toBeNull();
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(`kr8_pz_hide_${ME}`)).toBe('2026-11-19');
    const again = await show(<div className="v8-app-root"><PrizeBanner variant="card" uid={ME} week={C_WEEK} onOpen={() => undefined} /></div>);
    expect(again.container.querySelector('#kpzCard')).toBeNull();
  });
  it('reduce motion: ✕ hides at once (no exit animation)', async () => {
    clockAt(bkk('2026-11-19T21:05:00'));
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      await show(<div className="v8-app-root"><PrizeBanner variant="card" uid={ME} week={C_WEEK} onOpen={() => undefined} /></div>);
      fireEvent.click(document.querySelector('.kpz-x')!);
      expect(document.getElementById('kpzCard')).toBeNull();
    } finally { window.matchMedia = mm; }
  });
  it('shows nothing before the prizes start, or before the week has loaded', async () => {
    clockAt(bkk('2026-11-16T20:00:00'));   // Monday evening, prizes open Tuesday 17 Nov 00:00
    const r = await show(<div className="v8-app-root"><PrizeBanner variant="card" uid={ME} week={week(0, null, null)} onOpen={() => undefined} /></div>);
    expect(r.container.querySelector('.kpz')).toBeNull();
    r.unmount();
    clockAt(bkk('2026-11-19T21:05:00'));
    const r2 = await show(<div className="v8-app-root"><PrizeBanner variant="card" uid={ME} week={null} onOpen={() => undefined} /></div>);
    expect(r2.container.querySelector('.kpz')).toBeNull();
  });
  it('the 0–9 strip sits on the digit', () => {
    render(<Odo value={1205} />);
    const s = [...document.querySelectorAll('.kpz-ods')].map((e) => (e as HTMLElement).style.transform);
    expect(s).toEqual(['translateY(-10%)', 'translateY(-20%)', 'translateY(0%)', 'translateY(-50%)']);
    expect(document.querySelector('.kpz-odo')!.getAttribute('aria-label')).toBe('1,205');
  });
});

describe('Me tab: the race card sits right under "This week"', () => {
  const L = (s: string) => s;
  const Lf = (s: string, ...a: string[]) => a.reduce((x, v, i) => x.replace(`{${i}}`, v), s);
  const p = { user_id: ME, first_name: 'Ploy', photo: null, langs: ['TH'], bio: '', area: 'Ari', who: 'local', verified: true, ig_handle: 'ploy.bkk', interests: [],
    member_no: '00037', online: true, here: false, mine: true, level: { level: 'tea', posts: 3, visits: 0, points: 15, next: 'pandan', need_points: 10, pct: 60 },
    followers: 1, following: 1, likes: 1, gifts: 0, i_follow: false, follows_me: false, reels: [] } as unknown as V5Profile;
  const kx = { member_no: 37, ig_handle: 'ploy.bkk', tiktok_handle: null, lifetime: 420, level: 1, week: 46, week_rank: 3, founding_no: 12, founding_left: 38, founding_thb: 100, has_reel: true, prizes: 0 };
  const view = (k: typeof kx) => (
    <div className="v8-app-root">
      <MeView L={L} Lf={Lf as never} p={p} rank={null} posters={{}} savedCount={0} savedImgs={[]} unread={false} verifyState="verified" onTop10={() => undefined}
        onList={() => undefined} onSettings={() => undefined} onActivity={() => undefined} onEdit={() => undefined} onShare={() => undefined} onCode={() => undefined}
        onSaved={() => undefined} onRewards={() => undefined} onReel={() => undefined} onPost={() => undefined} onVerify={() => undefined} kx={k} weekRank={3}
        reelsSlot={<div id="slot" />} prizeSlot={<div id="prizeSlotProbe" />} />
    </div>
  );
  it('17 Nov de-clutter: no big prize card on Me; 19 Nov (A): Share card is one tap away in the ⋯ menu', () => {
    render(view(kx));
    expect(document.getElementById('prizeSlotProbe')).toBeNull();
    expect(document.getElementById('meShare')).toBeNull();
    fireEvent.click(document.getElementById('meMore')!);
    expect(document.getElementById('meShare')!.closest('#meMoreList')).toBeTruthy();
  });
  it('one next step at a time: hidden while the Founding "Next step" card shows', () => {
    const fresh = { ...kx, founding_no: null, has_reel: false };
    expect(foundingDue(fresh as never)).toBe(true);
    render(view(fresh as never));
    expect(document.getElementById('kxFounding')).toBeTruthy();
    expect(document.getElementById('prizeSlotProbe')).toBeNull();
  });
});
