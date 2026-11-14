/**
 * Card · Rings · Ranking · Places (feat/card-rewards-rank-places): pure logic shared by the screens and the tests.
 * The server (migration 0044) is the source of truth for every Ring; these mirror its rules for display only.
 */

// ───────────── handles (Instagram / TikTok) ─────────────
export type Social = 'ig' | 'tt';
export type HandleResult = { ok: true; handle: string | null } | { ok: false; error: 'BAD_HANDLE' | 'WRONG_SITE' };

/**
 * "@mint.bkk", "mint.bkk", "instagram.com/mint.bkk/", "https://www.instagram.com/mint.bkk?igsh=…",
 * "tiktok.com/@mintwalks", "https://vm.tiktok.com/…" (short links have no name in them → error).
 * Letters, numbers, "." and "_" only. Empty input = unlink (null).
 */
export function parseHandle(kind: Social, raw: string): HandleResult {
  let v = (raw || '').trim();
  if (!v) return { ok: true, handle: null };
  const otherSite = kind === 'ig' ? /tiktok\.com/i : /instagram\.com|instagr\.am/i;
  if (otherSite.test(v)) return { ok: false, error: 'WRONG_SITE' };
  if (kind === 'ig') {
    v = v.replace(/^(https?:\/\/)?((www|m)\.)?(instagram\.com|instagr\.am)\//i, '');
  } else {
    if (/^(https?:\/\/)?(vm|vt)\.tiktok\.com\//i.test(v)) return { ok: false, error: 'BAD_HANDLE' };
    v = v.replace(/^(https?:\/\/)?((www|m)\.)?tiktok\.com\//i, '');
  }
  v = v.replace(/^@/, '').split(/[?#]/)[0].split('/')[0].trim().toLowerCase();
  if (!v) return { ok: false, error: 'BAD_HANDLE' };
  const re = kind === 'ig' ? /^[a-z0-9_.]{1,30}$/ : /^[a-z0-9_.]{2,24}$/;
  if (!re.test(v)) return { ok: false, error: 'BAD_HANDLE' };
  if (kind === 'ig' && (v.startsWith('.') || v.endsWith('.') || v.includes('..'))) return { ok: false, error: 'BAD_HANDLE' };
  return { ok: true, handle: v };
}
export const socialUrl = (kind: Social, h: string) =>
  kind === 'ig' ? `https://www.instagram.com/${encodeURIComponent(h)}/` : `https://www.tiktok.com/@${encodeURIComponent(h)}`;

// ───────────── Rings: the public score (mirror of migration 0047; the server computes the real one) ─────────────
import { RINGS, type RingsRules } from './rewardsConfig';
export const BRANDS = ['grab', 'shopeepay', 'truemoney'] as const;
export type Brand = (typeof BRANDS)[number];
export const BRAND_NAME: Record<Brand, string> = { grab: 'Grab', shopeepay: 'ShopeePay', truemoney: 'TrueMoney' };
/** Ways to get a prize that are switched on (ShopeePay is hidden by a config flag). */
export const claimBrands = (R: Pick<RingsRules, 'shopeepay_on'> = RINGS): Brand[] => (R.shopeepay_on === 1 ? ['grab', 'truemoney', 'shopeepay'] : ['grab', 'truemoney']);
/** What the member actually gets: TrueMoney keeps 25%, so ฿100 → ฿75. Grab and ShopeePay are full value. */
export const valueFor = (brand: Brand, amount: number) => (brand === 'truemoney' ? Math.floor((amount * 3) / 4) : amount);

export interface Actor { id: string; who: 'local' | 'traveller'; cardDone: boolean }
export interface ShareOpen { session: string; device: string; day: string; line?: boolean; robot?: boolean; opener?: string | null }
export interface ReelIn { id: string; author: string; postedAt: number; approved: boolean; hidden?: boolean; places: number; likes: Actor[]; saves: Actor[]; opens: ShareOpen[] }
export interface ReelParts { lLocal: number; lTrav: number; sLocal: number; sTrav: number; opens: number; score: number }

/** One person once: the first row per member id wins; own actions and members without a finished card count 0. */
function countActors(list: Actor[], author: string): [number, number] {
  const seen = new Set<string>();
  let local = 0, trav = 0;
  for (const a of list) {
    if (a.id === author || !a.cardDone || seen.has(a.id)) continue;
    seen.add(a.id);
    if (a.who === 'traveller') trav++; else local++;
  }
  return [local, trav];
}
/**
 * Share-link opens that count: never LINE, never link-preview robots, never the poster's own (their id, or a session/device they used while signed in),
 * one per session and one per device per Bangkok day, and at most `cap` per Reel per day.
 */
export function countOpens(opens: ShareOpen[], author: string, cap: number = RINGS.opens_day_cap): number {
  const mineS = new Set<string>(), mineD = new Set<string>();
  for (const o of opens) if (o.opener === author) { mineS.add(o.session); mineD.add(o.device); }
  const perDay = new Map<string, { s: Set<string>; d: Set<string>; n: number }>();
  for (const o of opens) {
    if (o.line || o.robot) continue;
    const day = perDay.get(o.day) || { s: new Set<string>(), d: new Set<string>(), n: 0 };
    perDay.set(o.day, day);
    if (day.s.has(o.session) || day.d.has(o.device)) continue;      // a repeat that day
    day.s.add(o.session); day.d.add(o.device);
    if (o.opener === author || mineS.has(o.session) || mineD.has(o.device)) continue;   // own opens count 0
    day.n++;
  }
  let total = 0;
  for (const d of perDay.values()) total += Math.min(d.n, cap);
  return total;
}
/** Only approved, non-hidden Reels with at least one place tag score. */
export const reelEligible = (r: Pick<ReelIn, 'approved' | 'hidden' | 'places'>) => r.approved && !r.hidden && r.places >= 1;
export function reelParts(r: ReelIn, R: RingsRules = RINGS): ReelParts {
  if (!reelEligible(r)) return { lLocal: 0, lTrav: 0, sLocal: 0, sTrav: 0, opens: 0, score: 0 };
  const [lLocal, lTrav] = countActors(r.likes, r.author);
  const [sLocal, sTrav] = countActors(r.saves, r.author);
  const opens = countOpens(r.opens, r.author, R.opens_day_cap);
  return { lLocal, lTrav, sLocal, sTrav, opens, score: partsScore({ lLocal, lTrav, sLocal, sTrav, opens }, R) };
}
export const partsScore = (p: Omit<ReelParts, 'score'>, R: RingsRules = RINGS) =>
  p.lLocal * R.like + p.lTrav * R.like * R.traveller_mult + p.sLocal * R.save + p.sTrav * R.save * R.traveller_mult + p.opens * R.open;
/** The lines of the math sheet: [count, each, total] per source. */
export function mathLines(p: Omit<ReelParts, 'score'>, R: Pick<RingsRules, 'like' | 'save' | 'open' | 'traveller_mult'> = RINGS): { key: 'lLocal' | 'lTrav' | 'sLocal' | 'sTrav' | 'opens'; n: number; each: number; total: number }[] {
  const e = { lLocal: R.like, lTrav: R.like * R.traveller_mult, sLocal: R.save, sTrav: R.save * R.traveller_mult, opens: R.open };
  return (['lLocal', 'lTrav', 'sLocal', 'sTrav', 'opens'] as const).map((key) => ({ key, n: p[key], each: e[key], total: p[key] * e[key] }));
}

export interface BoardRow { member: string; rings: number; rank: number; firstAt: number; reels: string[] }
/**
 * Weekly board: a member's score = their best N Reels posted that week (Mon 00:00 – Sun 23:59 Bangkok).
 * Ties: the earlier-posted Reel wins, then the older member number. One row per member, so a person holds one rank only.
 */
export function weekBoard(reels: ReelIn[], weekStart: number, R: RingsRules = RINGS, memberNoOf: (id: string) => number = () => 0): BoardRow[] {
  const end = weekStart + 7 * 86400_000;
  const by = new Map<string, { id: string; at: number; score: number }[]>();
  for (const r of reels) {
    if (r.postedAt < weekStart || r.postedAt >= end) continue;
    const score = reelParts(r, R).score;
    if (score <= 0) continue;
    by.set(r.author, [...(by.get(r.author) || []), { id: r.id, at: r.postedAt, score }]);
  }
  const rows = [...by.entries()].map(([member, list]) => {
    const best = list.sort((a, b) => b.score - a.score || a.at - b.at || (a.id < b.id ? -1 : 1)).slice(0, Math.max(1, R.best_reels));
    return { member, rings: best.reduce((s, x) => s + x.score, 0), firstAt: best[0].at, reels: best.map((x) => x.id) };
  });
  return rows.sort((a, b) => b.rings - a.rings || a.firstAt - b.firstAt || memberNoOf(a.member) - memberNoOf(b.member)).map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Prize ladder from the config: ฿ for a rank (0 = shown with score, no prize). */
export const prizeFor = (rank: number, R: RingsRules = RINGS): number =>
  (rank >= 1 && rank <= 10 ? Math.max(0, (R as unknown as Record<string, number>)[`prize_${rank}`] || 0) : 0);
export const prizeLadder = (R: RingsRules = RINGS) => Array.from({ length: Math.max(3, R.board_size) }, (_, i) => prizeFor(i + 1, R));
export const paidRanks = (R: RingsRules = RINGS) => { let n = 0; for (let k = 1; k <= 10; k++) if (prizeFor(k, R) > 0) n = k; return n; };
export const weeklyTotal = (R: RingsRules = RINGS) => prizeLadder(R).reduce((s, n) => s + n, 0);

export interface Prize { id: string; member: string; kind: 'weekly' | 'founding'; rank?: number; amount: number; status: 'won' | 'claimed' }
/** Week close: one "prize won" per paid rank whose holder passed the floor; nothing in a week with too few posters. Running it twice adds nothing. */
export function closeWeek(board: BoardRow[], R: RingsRules = RINGS, posters = board.length, already: Prize[] = []): Prize[] {
  if (already.length || posters < R.min_posters_for_payout) return already;
  const out: Prize[] = [];
  const held = new Set<string>();
  for (const b of board) {
    const amount = prizeFor(b.rank, R);
    if (amount <= 0 || b.rings < R.min_rings_for_paid_seat || held.has(b.member)) continue;
    held.add(b.member);
    out.push({ id: `w-${b.rank}`, member: b.member, kind: 'weekly', rank: b.rank, amount, status: 'won' });
  }
  return out;
}
export interface Stock { brand: Brand; amount: number; code: string }
export type ClaimOut = { status: 'assigned'; value: number; code: string; stock: Stock[] } | { status: 'pending'; value: number; stock: Stock[] } | { status: 'error'; error: 'BAD_REWARD' | 'NO_PRIZE' };
/** One tap: Grab (full) or TrueMoney (75%). No code of that exact amount in stock → the claim is HELD (pending) and the founder is emailed. */
export function claimPrize(p: Prize | undefined, me: string, brand: string, stock: Stock[], R: RingsRules = RINGS): ClaimOut {
  if (!p || p.member !== me) return { status: 'error', error: 'NO_PRIZE' };
  if (!(claimBrands(R) as string[]).includes(brand)) return { status: 'error', error: 'BAD_REWARD' };
  const b = brand as Brand;
  const i = stock.findIndex((s) => s.brand === b && s.amount === p.amount);
  const value = valueFor(b, p.amount);
  if (i < 0) return { status: 'pending', value, stock };
  return { status: 'assigned', value, code: stock[i].code, stock: stock.filter((_, k) => k !== i) };
}

export type GapState = 'top' | 'paid' | 'floor' | 'board' | 'far' | 'off';
export interface Gap { state: GapState; rank: number | null; rings: number; prizeNow: number; target: { rank: number; need: number; prize: number; open: boolean } | null }
/** The pinned row: Rings to the next paid rank and what it pays (same rule as kr8_rank_gap). */
export function rankGap(board: Pick<BoardRow, 'member' | 'rings' | 'rank'>[], me: string, R: RingsRules = RINGS): Gap {
  const paid = paidRanks(R), flr = R.min_rings_for_paid_seat, top = Math.max(3, R.board_size);
  const mine = board.find((b) => b.member === me);
  const my = mine?.rings ?? 0, rk = mine?.rank ?? null;
  const others = board.length - (mine ? 1 : 0);
  const at = (r: number) => board.find((b) => b.rank === r)?.rings ?? 0;
  const t = (rank: number, need: number, open = false) => ({ rank, need, prize: prizeFor(rank, R), open });
  const prizeNow = rk !== null && rk <= paid && my >= flr ? prizeFor(rk, R) : 0;
  if (rk !== null && rk <= paid && my < flr) return { state: 'floor', rank: rk, rings: my, prizeNow, target: t(rk, flr - my) };
  if (rk === 1) return { state: 'top', rank: 1, rings: my, prizeNow, target: null };
  if (rk !== null && rk <= paid) return { state: 'paid', rank: rk, rings: my, prizeNow, target: t(rk - 1, Math.max(1, at(rk - 1) - my + 1, flr - my)) };
  if (others >= paid) return { state: rk === null ? 'off' : rk <= top ? 'board' : 'far', rank: rk, rings: my, prizeNow, target: t(paid, Math.max(1, at(paid) - my + 1, flr - my)) };
  return { state: 'off', rank: rk, rings: my, prizeNow, target: t(others + 1, Math.max(1, flr - my), true) };
}

// ───────────── levels (lifetime Rings: 0 / 1,000 / 3,000 / 8,000 / 20,000) ─────────────
export const LEVEL_AT = [0, 1000, 3000, 8000, 20000] as const;
export const LEVEL_KEY = ['Local', 'Explorer', 'Local', 'Insider', 'Legend'] as const;
export interface LevelInfo { n: number; key: string; next: number | null; nextKey: string | null; toNext: number; pct: number }
export function levelFor(lifetime: number): LevelInfo {
  const r = Math.max(0, lifetime | 0);
  let n = 1;
  for (let i = LEVEL_AT.length - 1; i >= 0; i--) if (r >= LEVEL_AT[i]) { n = i + 1; break; }
  const next = n < 5 ? LEVEL_AT[n] : null;
  const lo = LEVEL_AT[n - 1];
  return { n, key: LEVEL_KEY[n - 1], next, nextKey: n < 5 ? LEVEL_KEY[n] : null, toNext: next === null ? 0 : next - r,
    pct: next === null ? 100 : Math.round(((r - lo) * 100) / (next - lo)) };
}
export const memberNo = (n: number | null | undefined) => (n ? `#${String(n).padStart(5, '0')}` : '#—');
export const inviteCode = (n: number | null | undefined) => (n ? `k${String(n).padStart(5, '0')}` : '');

// ───────────── weekly league clock ─────────────
/** Next Monday 00:00 Bangkok (UTC+7, no daylight saving) as ms. */
export function weekEnd(now = Date.now()): number {
  const b = new Date(now + 7 * 3600_000);
  const dow = (b.getUTCDay() + 6) % 7;            // Monday = 0
  const mon = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() - dow) - 7 * 3600_000;
  return mon + 7 * 86400_000;
}
/** "2d 14:06" until the week closes. */
export function countdown(now = Date.now(), end = weekEnd(now)): string {
  const m = Math.max(0, Math.floor((end - now) / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return `${d}d ${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// ───────────── places ─────────────
export const BKK_BBOX = { minLat: 13.45, maxLat: 14.05, minLng: 100.25, maxLng: 100.95 };
export const inBangkok = (lat: number, lng: number) => lat >= BKK_BBOX.minLat && lat <= BKK_BBOX.maxLat && lng >= BKK_BBOX.minLng && lng <= BKK_BBOX.maxLng;
export function fmtDist(m: number | null | undefined): string {
  if (m === null || m === undefined || !isFinite(m)) return '';
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}
export function distM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000, r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
/** Up to 2 places; tapping a chosen one removes it, a 3rd is refused (the screen says "2 of 2 · tap ✕ to swap"). */
export function togglePick<T extends { id: string }>(list: T[], p: T, max = 2): { list: T[]; full: boolean } {
  if (list.some((x) => x.id === p.id)) return { list: list.filter((x) => x.id !== p.id), full: false };
  if (list.length >= max) return { list, full: true };
  return { list: [...list, p], full: false };
}

// ───────────── numbers ─────────────
export const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');
export function ago(iso: string | number, now = Date.now()): { n: number; u: 'now' | 'm' | 'h' | 'd' } {
  const m = Math.max(0, Math.round((now - (typeof iso === 'number' ? iso : Date.parse(iso))) / 60000));
  if (m < 1) return { n: 0, u: 'now' };
  if (m < 60) return { n: m, u: 'm' };
  if (m < 1440) return { n: Math.round(m / 60), u: 'h' };
  return { n: Math.round(m / 1440), u: 'd' };
}
