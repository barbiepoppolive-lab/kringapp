/**
 * Weekly prize banner (founder copy pack, WEEKLY_PRIZE_PACK_16NOV §1). Pure logic shared by the banner and its tests.
 *
 * The message is picked from the member's own week (kr8_weekly_ranking → kr8_week_board + kr8_rank_gap, the same numbers as Ranking):
 *   C   · Rings this week and not #1 → "{n} Rings to #{rank}" (n and rank are the server's gap to the next paid rank)
 *   C25 · Rings this week but fewer than 25 → "{n} Rings to 25 and you're in the running for the Top 8"
 *   A   · no Rings yet, Monday to Wednesday (Bangkok) → "A new week has started · Top 8 win TrueMoney"
 *   B   · no Rings yet Thursday to Sunday, or already #1 → "Your Bangkok, for the whole world to see"
 * Copy is the founder's, word for word: Thai first, English under. The Feed ticker only ever shortens it.
 * Nothing is shown before the server answers, after the week closes, or in a week where prizes are off.
 */
import type { KxRanking } from './v5Kx';
import { fmtN, weekEnd } from './kxLogic';

export type PrizeKind = 'A' | 'B' | 'C' | 'C25';
export interface PrizeLine { th: string; en: string }
/** head + sub = the card · short = the Feed ticker · tight = the ticker in the last 6 hours, next to the countdown (shortest) */
export interface PrizeCopy { head: PrizeLine; sub: PrizeLine; short: PrizeLine; tight?: PrizeLine }

/** Tokens: {n} Rings to go · {rank} target rank · {top} #1 prize · {paid} paid ranks (Top 8) · {floor} Rings needed to be paid (25). */
export const PRIZE_COPY: Record<PrizeKind, PrizeCopy> = {
  A: {
    head: { th: 'สัปดาห์ใหม่เริ่มแล้ว · ท็อป {paid} รับ TrueMoney', en: 'A new week has started · Top {paid} win TrueMoney' },
    sub: { th: 'รีลที่ดีที่สุดของคุณ คือรีลที่ได้นับ', en: 'Your best Reel is the one that counts' },
    short: { th: 'ท็อป {paid} รับ TrueMoney', en: 'Top {paid} win TrueMoney' },
  },
  B: {
    head: { th: 'กรุงเทพฯ ในแบบของคุณ ให้คนทั้งโลกเห็น', en: 'Your Bangkok, for the whole world to see' },
    sub: { th: 'ที่ 1 ของสัปดาห์รับ {top} · ดูอันดับ ›', en: '#1 of the week gets {top} · See ranking ›' },
    short: { th: 'ที่ 1 ของสัปดาห์รับ {top}', en: '#1 of the week gets {top}' },
  },
  C: {
    head: { th: 'อีก {n} ริง ขึ้นที่ {rank}', en: '{n} Rings to #{rank}' },
    sub: { th: 'ไลก์และเซฟจากนักเดินทางนับ 2 เท่า ›', en: 'Likes and saves from travellers count double ›' },
    short: { th: 'อีก {n} ริง ขึ้นที่ {rank}', en: '{n} Rings to #{rank}' },
    tight: { th: 'อีก {n} ริง', en: '{n} Rings to #{rank}' },
  },
  C25: {
    head: { th: 'อีก {n} ริง ถึง {floor} ริง พร้อมชิงท็อป {paid}', en: '{n} Rings to {floor} and you’re in the running for the Top {paid}' },
    sub: { th: 'ไลก์และเซฟจากนักเดินทางนับ 2 เท่า ›', en: 'Likes and saves from travellers count double ›' },
    short: { th: 'อีก {n} ริง ถึง {floor} ริง', en: '{n} Rings to {floor}' },
    tight: { th: 'อีก {n} ริง', en: '{n} Rings to {floor}' },
  },
};

/** Words that must never appear in member-facing prize copy (founder rules, EN + TH). */
export const BANNED_WORDS = ['meet', 'guide', 'tour', 'host', 'creator', 'review', 'hidden gem', 'alcohol', 'gift', 'wallet', 'credit', 'lucky', 'draw', 'temple',
  'ลุ้น', 'ทัวร์', 'ไกด์', 'รีวิว', 'ของขวัญ', 'วอลเล็ท', 'เครดิต', 'โชค', 'สุ่ม', 'เหล้า', 'ครีเอเตอร์', 'วัด'];

export interface PrizeVals { n: number; rank: number; top: number; paid: number; floor: number }
export const baht = (n: number) => `฿${fmtN(n)}`;
/** Fills a line. English singular: "1 Ring to #2". */
export function fill(tpl: string, v: Partial<PrizeVals>): string {
  return tpl
    .replace('{n} Rings', v.n === 1 ? '1 Ring' : `${fmtN(v.n ?? 0)} Rings`)
    .replace('{n}', fmtN(v.n ?? 0))
    .replace('{rank}', String(v.rank ?? ''))
    .replace('{top}', baht(v.top ?? 0))
    .replace('{paid}', String(v.paid ?? 8))
    .replace('{floor}', String(v.floor ?? 25));
}

/** What the banner needs from kr8_weekly_ranking. */
export interface WeekIn {
  weekStart: string; rings: number; rank: number | null; gapState: string | null;
  target: { rank: number; need: number; prize: number } | null;
  floor: number; paid: number; top: number; endsAt: number; payoutOn: boolean;
}
export function weekIn(r: KxRanking, now = Date.now()): WeekIn {
  const ends = Date.parse(r.ends_at);
  return {
    weekStart: r.week_start || '',
    rings: Math.max(0, r.gap?.rings ?? r.me?.rings ?? 0),
    rank: r.me?.all_rank ?? r.gap?.rank ?? null,
    gapState: r.gap?.state ?? null,
    target: r.gap?.target ? { rank: r.gap.target.rank, need: r.gap.target.need, prize: r.gap.target.prize } : null,
    floor: r.floor > 0 ? r.floor : 25,
    paid: r.paid_ranks > 0 ? r.paid_ranks : 8,
    top: (r.prizes && r.prizes[0]) || 1500,
    endsAt: Number.isFinite(ends) ? ends : weekEnd(now),
    payoutOn: r.payout_on !== false,
  };
}

export interface PrizePick {
  kind: PrizeKind; vals: PrizeVals;
  /** 0–1: the pink ring of the emblem (Rings so far towards the next step; full when there is no personal step) */
  progress: number;
  /** what the next step pays (shown with the shimmer); null when the copy already says it (B) */
  stake: { rank: number; prize: number } | null;
  rank: number | null; rings: number;
}

/** Bangkok (UTC+7, no daylight saving) calendar day and weekday (Monday = 0). */
export const bkkDate = (now: number) => new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
export const bkkDow = (now: number) => (new Date(now + 7 * 3600_000).getUTCDay() + 6) % 7;

export function pickPrize(w: WeekIn | null, now: number): PrizePick | null {
  if (!w || !w.payoutOn || now >= w.endsAt) return null;
  const vals = (n: number, rank: number): PrizeVals => ({ n, rank, top: w.top, paid: w.paid, floor: w.floor });
  const base = { rank: w.rank, rings: w.rings };
  if (w.rings > 0 && w.rings < w.floor) {
    const n = w.floor - w.rings;
    return { ...base, kind: 'C25', vals: vals(n, w.target?.rank ?? w.paid), progress: w.rings / w.floor,
      stake: w.target && w.target.prize > 0 ? { rank: w.target.rank, prize: w.target.prize } : null };
  }
  if (w.rings > 0 && (w.rank === 1 || w.gapState === 'top')) return { ...base, kind: 'B', vals: vals(0, 1), progress: 1, stake: null };
  if (w.rings > 0 && w.target && w.target.need > 0) {
    const n = w.target.need;
    return { ...base, kind: 'C', vals: vals(n, w.target.rank), progress: Math.min(1, w.rings / (w.rings + n)),
      stake: w.target.prize > 0 ? { rank: w.target.rank, prize: w.target.prize } : null };
  }
  if (w.rings === 0 && bkkDow(now) <= 2) return { ...base, kind: 'A', vals: vals(0, 1), progress: 1, stake: { rank: 1, prize: w.top } };
  return { ...base, kind: 'B', vals: vals(0, 1), progress: 1, stake: null };
}

export interface RaceClock { ms: number; last: boolean; th: string; en: string; frac: number }
const p2 = (n: number) => String(n).padStart(2, '0');
/** Countdown to Sunday 24:00 Bangkok. The last 6 hours count seconds. frac = how much of the week has gone (the ticker's line). */
export function raceClock(now: number, end: number): RaceClock {
  const ms = Math.max(0, end - now);
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const last = ms > 0 && ms <= 6 * 3600_000;
  const hm = `${p2(h)}:${p2(m)}`;
  const t = last ? `${h}:${p2(m)}:${p2(sec)}` : null;
  return {
    ms, last,
    th: `จบใน ${t || (d ? `${d} วัน ${hm}` : hm)}`,
    en: `Ends ${t || (d ? `${d}d ${hm}` : hm)}`,
    frac: Math.min(1, Math.max(0, 1 - ms / (7 * 86400_000))),
  };
}

// ───────────── dismiss for the day · rank change since the member last looked ─────────────
type Store = Pick<Storage, 'getItem' | 'setItem'> | null;
const ls = (): Store => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
const hideKey = (uid: string) => `kr8_pz_hide_${uid || 'guest'}`;
/** Hidden for the rest of this Bangkok day (one tap on ✕ hides the ticker and the card). */
export function prizeHidden(uid: string, now: number, store: Store = ls()): boolean {
  try { return store?.getItem(hideKey(uid)) === bkkDate(now); } catch { return false; }
}
export function hidePrize(uid: string, now: number, store: Store = ls()): void {
  try { store?.setItem(hideKey(uid), bkkDate(now)); } catch { /* private mode */ }
}

export interface SeenRank { week: string; rank: number }
/** Places moved since the member last saw the banner this week (+ = up). null on the first look of a week or with no rank. */
export function rankDelta(prev: SeenRank | null, week: string, rank: number | null): number | null {
  if (!rank || !prev || prev.week !== week || !prev.rank) return null;
  const d = prev.rank - rank;
  return d === 0 ? null : d;
}
const seenKey = (uid: string) => `kr8_pz_seen_${uid || 'guest'}`;
/** The rank seen at the start of this app session (read once per session, so the arrow does not vanish on the next refresh). */
const sessionBase = new Map<string, SeenRank | null>();
export function seenRankAtStart(uid: string, store: Store = ls()): SeenRank | null {
  if (!sessionBase.has(uid)) {
    let v: SeenRank | null = null;
    try { const j = JSON.parse(store?.getItem(seenKey(uid)) || 'null'); if (j && typeof j.week === 'string' && Number.isFinite(j.rank)) v = { week: j.week, rank: j.rank }; } catch { v = null; }
    sessionBase.set(uid, v);
  }
  return sessionBase.get(uid) ?? null;
}
export function rememberRank(uid: string, week: string, rank: number | null, store: Store = ls()): void {
  if (!rank) return;
  try { store?.setItem(seenKey(uid), JSON.stringify({ week, rank })); } catch { /* private mode */ }
}
/** tests only */
export const _resetPrizeSession = () => sessionBase.clear();
