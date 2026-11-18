/**
 * Admin "Help" panel (0120, 18 Nov 2026). Pure logic, no DOM (tested in helpPanel.test.ts).
 * Every member <-> Kring Team conversation: status, English preview, sorting, filters, quick replies.
 * Founder reads ENGLISH only: every Thai line is shown with its English (kr8_help_ai.translation_en) under it.
 */
import { HELP_RISK_MIN, hasThaiText, helpQuestion, type HelpCase } from './adminHelpLogic';
import { faqAnswer, faqById } from '../v8/helpFaq';

export interface HelpThread {
  thread_id: string; member: string; member_no: number | null; name: string | null; photo: string | null;
  verified: boolean; test: boolean;
  last_at: string; last_from: 'member' | 'team'; last_body: string; last_en: string | null;
  unanswered: number; waiting_since: string | null; team_replied: boolean; total?: number;
}
export interface HelpThreadMsg {
  id?: number; from: 'member' | 'team'; body: string; at: string;
  translation_en?: string | null; suggested_reply?: string | null; suggested_reply_en?: string | null;
  /** shown at once after Send, replaced by the real row on the next load */
  pending?: boolean;
}
export interface HelpFlag { key: string; severity?: string; summary?: string; at?: string }
export interface HelpThreadDetail { member: string; messages: HelpThreadMsg[]; unanswered: number; flags: HelpFlag[] }

export type HelpStatus = 'waiting' | 'replied' | 'answered';
export type HelpFilter = 'waiting' | 'all' | 'today';
export const HELP_FILTERS: { key: HelpFilter; label: string }[] = [
  { key: 'waiting', label: 'Waiting' }, { key: 'all', label: 'All' }, { key: 'today', label: 'Today' },
];
/** the Help panel refreshes itself this often */
export const HELP_POLL_MS = 20_000;

export const isHelpThread = (x: unknown): x is HelpThread =>
  !!x && typeof x === 'object' && typeof (x as HelpThread).member === 'string' && typeof (x as HelpThread).last_at === 'string';
export function isHelpThreadDetail(x: unknown): x is HelpThreadDetail {
  return !!x && typeof x === 'object' && Array.isArray((x as HelpThreadDetail).messages);
}

/** waiting = member wrote and the team never answered; replied = member wrote again after a team answer */
export function helpStatus(t: Pick<HelpThread, 'unanswered' | 'team_replied'>): HelpStatus {
  if (!t.unanswered) return 'answered';
  return t.team_replied ? 'replied' : 'waiting';
}
export const threadWaitMin = (t: Pick<HelpThread, 'waiting_since' | 'unanswered'>, now = Date.now()) =>
  t.unanswered && t.waiting_since ? Math.max(0, Math.floor((now - Date.parse(t.waiting_since)) / 60_000)) : 0;
/** "12 min", "1 h 5 min", "2 d 3 h" */
export function durWords(min: number): string {
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h${min % 60 ? ` ${min % 60} min` : ''}` : `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ''}`;
}
/** chip on every row: "Waiting 12 min" (red after 45 min = the 1-hour promise), "Member replied · 5 min", "Answered" */
export function statusChip(t: Pick<HelpThread, 'unanswered' | 'team_replied' | 'waiting_since'>, now = Date.now()): { text: string; tone: 'r' | 'a' | 'g' } {
  const s = helpStatus(t);
  if (s === 'answered') return { text: 'Answered', tone: 'g' };
  const m = threadWaitMin(t, now);
  const tone = m > HELP_RISK_MIN ? 'r' : 'a';
  return s === 'waiting' ? { text: m < 1 ? 'Waiting just now' : `Waiting ${durWords(m)}`, tone } : { text: `Member replied · ${durWords(m)}`, tone };
}
export const isOpen = (t: Pick<HelpThread, 'unanswered'>) => t.unanswered > 0;

/** waiting first (oldest wait first, test members after real ones), then everything else newest first */
export function sortThreads(list: HelpThread[]): HelpThread[] {
  return [...list].filter(isHelpThread).sort((a, b) => {
    const oa = isOpen(a), ob = isOpen(b);
    if (oa !== ob) return oa ? -1 : 1;
    if (oa && ob) return Number(a.test) - Number(b.test) || Date.parse(a.waiting_since || a.last_at) - Date.parse(b.waiting_since || b.last_at);
    return Date.parse(b.last_at) - Date.parse(a.last_at);
  });
}

/** India calendar day (the founder works in IST) */
export const istDay = (iso: string | number) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
export function filterThreads(list: HelpThread[], f: HelpFilter, now = Date.now()): HelpThread[] {
  if (f === 'waiting') return list.filter(isOpen);
  if (f === 'today') { const d = istDay(now); return list.filter((t) => istDay(t.last_at) === d); }
  return list;
}
export const filterCounts = (list: HelpThread[], now = Date.now()) =>
  Object.fromEntries(HELP_FILTERS.map((f) => [f.key, filterThreads(list, f.key, now).length])) as Record<HelpFilter, number>;

/** the text the founder reads: English for Thai lines (translation when there is one), "[Help]" tag removed */
export function englishOf(body: string, tr?: string | null): string {
  const text = helpQuestion(body);
  if (!hasThaiText(text)) return text;
  const en = (tr || '').trim();
  return en || 'Thai message (English is being prepared)';
}
export function previewLine(t: HelpThread): string {
  const who = t.last_from === 'team' ? 'Kring Team: ' : '';
  return who + englishOf(t.last_body, t.last_en);
}

/** "5 min ago", "3 h ago", "yesterday", "16 Nov" (IST) */
export function agoIst(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 24 * 60 && istDay(iso) === istDay(now)) return `${Math.floor(m / 60)} h ago`;
  if (istDay(iso) === istDay(now - 86_400_000)) return 'yesterday';
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
}
export const clockIst = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
export function dayLabel(iso: string, now = Date.now()): string {
  if (istDay(iso) === istDay(now)) return 'Today';
  if (istDay(iso) === istDay(now - 86_400_000)) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
}

/** the newest Sonnet draft for the member's unanswered messages (English for the founder, Thai for the member) */
export function latestDraft(d: Pick<HelpThreadDetail, 'messages'>): { en: string; th: string } | null {
  let lastTeam = -1;
  d.messages.forEach((m, i) => { if (m.from === 'team') lastTeam = i; });
  const waiting = d.messages.slice(lastTeam + 1).filter((m) => m.from === 'member');
  const hit = waiting.slice().reverse().find((m) => (m.suggested_reply_en || '').trim() || (m.suggested_reply || '').trim());
  if (!hit) return null;
  const en = (hit.suggested_reply_en || '').trim();
  const th = (hit.suggested_reply || '').trim();
  return en || !hasThaiText(th) ? { en: en || th, th } : null;
}
export const memberWritesThai = (d: Pick<HelpThreadDetail, 'messages'>) => d.messages.some((m) => m.from === 'member' && hasThaiText(helpQuestion(m.body)));

/** one-tap English replies (sent to the member in Thai). Prize / Rings wording comes from the member Help FAQ, so it matches the app. */
export function quickReplies(rules?: Record<string, number> | null): { id: string; label: string; text: string }[] {
  // rules = live kr8_rings_rules (prize ladder, Rings floor, Founding Local), so the numbers match what members see
  const ans = (id: string, fb: string) => { const f = faqById(id); return f ? faqAnswer(f, false, rules) : fb; };
  return [
    { id: 'thanks', label: 'Thanks, checking', text: 'Thanks for your message! The team is checking this and will reply here soon.' },
    { id: 'prize', label: 'Weekly prize', text: ans('prize_win', 'Every week the top members on the board win a prize.') },
    { id: 'reel', label: 'How to post a Reel', text: 'Tap Post a Reel, choose a short video you filmed yourself, and pin it to the Bangkok place where you filmed it. Most new Reels get a quick check first, then they show in the Feed and on the board.' },
    { id: 'share', label: 'Share for more Rings', text: `Share your Reel link on Instagram, Facebook, TikTok or X. ${ans('rings_what', '')} Opens from LINE and your own opens don’t count.`.replace(/\s+/g, ' ').trim() },
  ];
}

/** before 0120 is applied: build the list from the waiting cases (kr8_admin_help_cases) */
export function threadsFromCases(cases: HelpCase[]): HelpThread[] {
  return cases.map((c) => {
    const last = c.history?.[c.history.length - 1];
    const lastItem = c.unanswered_items?.[c.unanswered_items.length - 1];
    return {
      thread_id: c.thread_id, member: c.member, member_no: c.member_no, name: c.name, photo: c.photo, verified: c.verified, test: c.test,
      last_at: last?.at || c.last_at, last_from: last?.from || 'member', last_body: last?.body || c.question,
      last_en: last?.translation_en ?? lastItem?.translation_en ?? null,
      unanswered: c.unanswered, waiting_since: c.waiting_since, team_replied: (c.history || []).some((h) => h.from === 'team'),
    };
  });
}
export function detailFromCase(c: HelpCase): HelpThreadDetail {
  const ai = new Map((c.unanswered_items || []).filter((i) => i.id != null).map((i) => [i.id!, i]));
  return {
    member: c.member, unanswered: c.unanswered, flags: [],
    messages: (c.history || []).map((h) => {
      const it = h.id != null ? ai.get(h.id) : undefined;
      return { ...h, suggested_reply: it?.suggested_reply ?? null, suggested_reply_en: it?.suggested_reply_en ?? null };
    }).map((m, i, arr) => (i === arr.length - 1 && m.from === 'member' && !m.suggested_reply_en && c.suggested_reply_en
      ? { ...m, suggested_reply: c.suggested_reply ?? null, suggested_reply_en: c.suggested_reply_en } : m)),
  };
}
