/**
 * Admin "Needs you" → Help cases (0097 + T-402 Help AI, 18 Nov 2026). Pure logic, no DOM (tested in adminHelp.test.ts).
 * One case per member whose last message to the Kring Team is unanswered. Promise to members: "the team replies within 1 hour".
 */
export interface HelpMsg {
  id?: number;
  from: 'member' | 'team';
  body: string;
  at: string;
  translation_en?: string | null;
}

export interface HelpUnansweredItem {
  id?: number;
  body: string;
  at?: string;
  translation_en?: string | null;
  suggested_reply?: string | null;
  suggested_reply_en?: string | null;
  model?: string | null;
}

export interface HelpCase {
  thread_id: string; member: string; member_no: number | null; name: string | null; photo: string | null;
  verified: boolean; test: boolean;
  waiting_since: string; last_at: string; unanswered: number;
  question: string; messages: string[]; history: HelpMsg[];
  unanswered_items?: HelpUnansweredItem[];
  suggested_reply?: string | null;
  suggested_reply_en?: string | null;
  ai_model?: string | null;
}
export type HelpUrgency = 'ok' | 'risk' | 'late';

/** at 45 min the case turns red ("1-hour promise at risk"); after 60 min the promise is missed */
export const HELP_RISK_MIN = 45;
export const HELP_PROMISE_MIN = 60;

export const hasThaiText = (s: string) => /[\u0E01-\u0E3E\u0E40-\u0E7F]/.test(s || '');

export const helpWaitMin = (c: Pick<HelpCase, 'waiting_since'>, now = Date.now()) => Math.max(0, Math.floor((now - Date.parse(c.waiting_since)) / 60_000));
export function helpUrgency(c: Pick<HelpCase, 'waiting_since'>, now = Date.now()): HelpUrgency {
  const m = helpWaitMin(c, now);
  return m >= HELP_PROMISE_MIN ? 'late' : m > HELP_RISK_MIN ? 'risk' : 'ok';
}
export function helpWaitLabel(c: Pick<HelpCase, 'waiting_since'>, now = Date.now()): string {
  const m = helpWaitMin(c, now);
  if (m < 1) return 'waiting just now';
  if (m < 60) return `waiting ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `waiting ${h} h ${m % 60} min` : `waiting ${Math.floor(h / 24)} d ${h % 60} h`;
}
export function helpUrgencyText(u: HelpUrgency): string {
  return u === 'late' ? '1-hour promise missed' : u === 'risk' ? '1-hour promise at risk' : 'within the 1-hour promise';
}
/** "[Help] why no Rings?" → "why no Rings?" */
export const helpQuestion = (body: string) => (body || '').replace(/^\s*\[help\]\s*/i, '').trim() || '(no question typed)';
export const isHelpCase = (x: unknown): x is HelpCase =>
  !!x && typeof x === 'object' && typeof (x as HelpCase).member === 'string' && typeof (x as HelpCase).waiting_since === 'string';
/** oldest wait first; test members last */
export function sortHelpCases(list: HelpCase[]): HelpCase[] {
  return [...list].filter(isHelpCase).sort((a, b) => Number(a.test) - Number(b.test) || Date.parse(a.waiting_since) - Date.parse(b.waiting_since));
}
