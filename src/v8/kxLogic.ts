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

// ───────────── Rings ─────────────
import { RINGS } from './rewardsConfig';
export const RINGS_PER_BAHT = RINGS.rings_per_baht;
export const CLAIM_AMOUNTS = [100, 300, 500] as const;
export type ClaimAmount = (typeof CLAIM_AMOUNTS)[number];
export const BRANDS = ['grab', 'shopeepay', 'truemoney'] as const;
export type Brand = (typeof BRANDS)[number];
export const BRAND_NAME: Record<Brand, string> = { grab: 'Grab', shopeepay: 'ShopeePay', truemoney: 'TrueMoney' };
/** Defaults for display only; the server config (kr8_rings_config) pays. See rewardsConfig.RINGS. */
export const EARN = { reelPlace: RINGS.reel_place, friend: RINGS.friend, friendWelcome: RINGS.friend_welcome, checkin: RINGS.checkin, react: RINGS.react } as const;
export const WEEKLY_PRIZES = [RINGS.weekly_1, RINGS.weekly_2, RINGS.weekly_3, ...Array(7).fill(RINGS.weekly_4_10)] as readonly number[];

export const ringsFor = (amount: number) => amount * RINGS_PER_BAHT;
export const bahtFor = (rings: number) => Math.floor(Math.max(0, rings) / RINGS_PER_BAHT);
/** What the member actually gets: TrueMoney keeps 25%, so ฿100 → ฿75. Grab and ShopeePay are full value. */
export const valueFor = (brand: Brand, amount: number) => (brand === 'truemoney' ? Math.floor((amount * 3) / 4) : amount);
export const canClaim = (balance: number, amount: number) => balance >= ringsFor(amount);
export const weeklyPrize = (rank: number) => (rank >= 1 && rank <= 10 ? WEEKLY_PRIZES[rank - 1] : 0);

/** Client-side guard before the one-tap claim (the server checks the same thing under a lock). */
export function claimCheck(balance: number, amount: number, brand: string): 'ok' | 'LOW_BALANCE' | 'BAD_REWARD' {
  if (!(CLAIM_AMOUNTS as readonly number[]).includes(amount) || !(BRANDS as readonly string[]).includes(brand)) return 'BAD_REWARD';
  return canClaim(balance, amount) ? 'ok' : 'LOW_BALANCE';
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

// ───────────── weekly league ─────────────
export interface ScoreRow { id: string; rings: number; lastAt: number; memberNo: number }
/** Same order as kr8_week_ranked: Rings ↓, then whoever reached that total first, then the older member number. Ranks are unique. */
export function rankRows<T extends ScoreRow>(rows: T[]): (T & { rank: number })[] {
  return rows
    .filter((r) => r.rings > 0)
    .slice()
    .sort((a, b) => b.rings - a.rings || a.lastAt - b.lastAt || a.memberNo - b.memberNo)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
/** Rings still needed to enter the top 10 (0 when already in it). */
export function toTop10(myRings: number, myRank: number | null, tenthRings: number | null): number {
  if (myRank !== null && myRank <= 10) return 0;
  if (tenthRings === null) return Math.max(1, 1 - myRings);
  return Math.max(1, tenthRings - myRings + 1);
}
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
