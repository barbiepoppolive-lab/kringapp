/**
 * 21 Nov (founder): the time of every post, Instagram-style and short: "now", "5m", "3h", "2d", then "21 Nov" after 7 days.
 * Thai mode: "เมื่อกี้", "5 นาที", "3 ชม.", "2 วัน", "21 พ.ย.". Dates are Bangkok days. One language: the app's language
 * (<html lang> is set by the app; th = Thai, anything else = English).
 */
const BKK = 7 * 3600_000;
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const EN_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TH_DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const EN_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type TimeLang = 'th' | 'en';
export function appTimeLang(): TimeLang {
  try { return /^th/i.test(document.documentElement.lang || '') ? 'th' : 'en'; } catch { return 'en'; }
}
const ms = (iso: string | number) => (typeof iso === 'number' ? iso : Date.parse(iso));
/** Bangkok calendar day as yyyy-mm-dd */
export const bkkDay = (t: number) => new Date(t + BKK).toISOString().slice(0, 10);

function bkkDate(t: number, lang: TimeLang, now: number): string {
  const d = new Date(t + BKK), n = new Date(now + BKK);
  const sameYear = d.getUTCFullYear() === n.getUTCFullYear();
  if (lang === 'th') return `${d.getUTCDate()} ${TH_MON[d.getUTCMonth()]}${sameYear ? '' : ` ${String(d.getUTCFullYear() + 543).slice(2)}`}`;
  return `${d.getUTCDate()} ${EN_MON[d.getUTCMonth()]}${sameYear ? '' : ` ${d.getUTCFullYear()}`}`;
}

/** short relative time of a post: now · 5m · 3h · 2d · 21 Nov (Thai forms in Thai mode) */
export function postAgo(iso: string | number | null | undefined, lang: TimeLang = appTimeLang(), now = Date.now()): string {
  const t = iso == null ? NaN : ms(iso);
  if (!Number.isFinite(t)) return '';
  const m = Math.max(0, Math.floor((now - t) / 60000));
  const th = lang === 'th';
  if (m < 1) return th ? 'เมื่อกี้' : 'now';
  if (m < 60) return th ? `${m} นาที` : `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return th ? `${h} ชม.` : `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return th ? `${d} วัน` : `${d}d`;
  return bkkDate(t, lang, now);
}

/** chat day separator: Today · Yesterday · Sat 21 Nov (วันนี้ · เมื่อวาน · ส. 21 พ.ย.) */
export function dayLabel(iso: string | number, lang: TimeLang = appTimeLang(), now = Date.now()): string {
  const t = ms(iso);
  if (!Number.isFinite(t)) return '';
  const th = lang === 'th';
  if (bkkDay(t) === bkkDay(now)) return th ? 'วันนี้' : 'Today';
  if (bkkDay(t) === bkkDay(now - 86400_000)) return th ? 'เมื่อวาน' : 'Yesterday';
  const dow = new Date(t + BKK).getUTCDay();
  return `${(th ? TH_DOW : EN_DOW)[dow]} ${bkkDate(t, lang, now)}`;
}

/** clock time in Bangkok, 24 h: 14:05 */
export function bkkClock(iso: string | number): string {
  const t = ms(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t + BKK);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
