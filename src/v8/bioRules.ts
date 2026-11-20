/**
 * 0183 (20 Nov, founder): the profile bio — one short line (max 80 characters) under the name on Me and on profiles.
 * No phone numbers (Thai digits too), links, @handles or LINE IDs. The same rules run on the server (kr8_bio_ok), so this
 * is only for a friendly message before saving.
 */
export const BIO_MAX = 80;

const LINK = /(https?:\/\/|www\.|line\.me|lin\.ee|[a-z0-9-]+\.(com|net|org|co|th|me|ly|io|app|link|gg|to|cc|info|biz|xyz|site|shop)([^a-z0-9]|$))/i;
const HANDLE = /@[a-z0-9_.-]{3,}/i;
const LINE_IDS = [
  /(^|[^a-z])(line|lineid)\s*(id|ไอดี)\s*[:：=]?\s*\S{3,}/i,
  /(^|[^a-z])line\s*[:：=]\s*\S{3,}/i,
  /(ไลน์|ไลน|ไอดีไลน์|ไอดี\s*ไลน์)\s*(id|ไอดี)?\s*[:：=]?\s*[a-z0-9._-]{3,}/i,
  /(add|แอด|แอ๊ด)\s*(line|ไลน์)\s*[:：=]?\s*\S{3,}/i,
];
const PHONE = /\d([\s.()-]?\d){8,}/;
const thaiDigits = (s: string) => s.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));

export type BioProblem = 'long' | 'phone' | 'link' | 'line' | null;
/** null = fine (an empty bio is fine too: it clears the line) */
export function bioProblem(raw: string): BioProblem {
  const t = (raw || '').trim();
  if (!t) return null;
  if (t.length > BIO_MAX) return 'long';
  if (PHONE.test(thaiDigits(t))) return 'phone';
  if (LINK.test(t)) return 'link';
  if (HANDLE.test(t) || LINE_IDS.some((r) => r.test(t))) return 'line';
  return null;
}
/** the line shown under the bio field (English key; the caller runs it through L) */
export const BIO_MSG: Record<Exclude<BioProblem, null>, string> = {
  long: 'Keep it to 80 characters',
  phone: 'No phone numbers in your bio',
  link: 'No links in your bio',
  line: 'No LINE IDs or @usernames in your bio',
};
