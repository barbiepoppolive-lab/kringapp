/**
 * Admin "View as member" (18 Nov): pure helpers (no DOM, so vitest checks them). Admin text is English only.
 */

export type Persona = 'visitor' | 'newmember' | 'member';
export type Lang = 'th' | 'en';
export type Size = '390x844' | '360x780';

export const PERSONAS: { key: Persona; label: string; hint: string }[] = [
  { key: 'visitor', label: 'Visitor', hint: 'Signed out' },
  { key: 'newmember', label: 'New member', hint: 'Signed in, no card yet' },
  { key: 'member', label: 'Member', hint: 'Full card' },
];
export const LANGS: { key: Lang; label: string }[] = [{ key: 'th', label: 'Thai' }, { key: 'en', label: 'English' }];
export const SIZES: { key: Size; label: string; w: number; h: number }[] = [
  { key: '390x844', label: 'iPhone 390', w: 390, h: 844 },
  { key: '360x780', label: 'Android 360', w: 360, h: 780 },
];
export const sizeOf = (k: Size) => SIZES.find((s) => s.key === k) || SIZES[0];

/** Snoozes that only nag (install sheet, notification ask, first-open screen); a Member has also seen the coach tips. */
export function seenFlags(persona: Persona, now = Date.now()): Record<string, string> {
  const later = now + 365 * 24 * 3600_000;
  const f: Record<string, string> = {
    kr8_a2hs: JSON.stringify({ snooze: later, done: ['visit2', 'reel', 'claim'] }),
    kr8_push_ask: JSON.stringify({ asked: true, snooze: later }),
    kr8_esc_first: '1',
  };
  if (persona === 'member') f.kr8_coach = JSON.stringify(['save', 'post', 'score', 'share']);
  return f;
}

export interface MirrorSeed { persona: Persona; store: Record<string, string>; session: Record<string, string> }
/**
 * What the framed app gets as its whole storage (index.html reads window.parent.__kr8MirrorSeed). It never touches this browser's
 * real Kring storage. `authKey` must match v5Live's MIRROR_AUTH_KEY.
 */
export function mirrorSeed(persona: Persona, lang: Lang, session: string | null, authKey: string, now = Date.now()): MirrorSeed {
  const store: Record<string, string> = { kr8_lang: lang, ...seenFlags(persona, now) };
  if (persona !== 'visitor' && session) store[authKey] = session;
  return { persona, store, session: { kr8_a2hs_shown: '1' } };
}

/** The framed app's address. A fresh `v` makes the frame load again even when nothing else changed. */
export function frameSrc(appBase: string, lang: Lang, v: number | string = Date.now()): string {
  return `${appBase.replace(/\/?$/, '/')}?mirror=1&lang=${lang}&mv=${v}`;
}

/** A tap on the phone, as 0–1 of the screen width and height (3 decimals), clamped to the screen. */
export function tapPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): { x: number; y: number } {
  const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
  return { x: c((clientX - rect.left) / (rect.width || 1)), y: c((clientY - rect.top) / (rect.height || 1)) };
}

/** Phone-frame scale so the whole phone fits the space (never above 1). */
export function fitScale(phoneW: number, phoneH: number, availW: number, availH: number): number {
  const s = Math.min(1, availW / phoneW, availH / phoneH);
  return Math.max(0.4, Math.round(s * 1000) / 1000);
}

const TAB_NAME: Record<string, string> = { feed: 'Feed', people: 'People', board: 'Board', deals: 'Deals', me: 'Me', ask: 'Ask' };
/** "Board" / "Me · sheet open" / "Make your card": the screen in plain words, from what the frame shows. */
export function screenName(route: string | null | undefined): string {
  if (!route) return 'Unknown screen';
  const tab = /(?:^|\s)tab:([a-z]+)/.exec(route)?.[1];
  const sheet = /(?:^|\s)sheet:([a-z0-9]+)/i.exec(route)?.[1];
  const base = tab ? TAB_NAME[tab] || tab : /no-card/.test(route) ? 'Make your card' : 'App';
  return sheet ? `${base} · ${sheet === 'v5card' ? 'card sheet' : 'sheet open'}` : base;
}

export interface BugSpot {
  id: string; at: string; note: string; persona: Persona; lang: Lang; viewport: Size; route: string | null;
  x: number | null; y: number | null; shot: string | null; status: 'open' | 'fixed' | 'dismissed'; handled_at: string | null;
}
export function isBugSpots(v: unknown): v is BugSpot[] {
  return Array.isArray(v) && v.every((b) => b && typeof b === 'object' && typeof (b as BugSpot).id === 'string' && typeof (b as BugSpot).note === 'string');
}
/** One plain-English line under the bug: "Member · Thai · Android 360 · Board". */
export function bugMeta(b: Pick<BugSpot, 'persona' | 'lang' | 'viewport' | 'route'>): string {
  const p = PERSONAS.find((x) => x.key === b.persona)?.label || b.persona;
  const l = LANGS.find((x) => x.key === b.lang)?.label || b.lang;
  return [p, l, sizeOf(b.viewport).label, screenName(b.route)].join(' · ');
}

/** Words members must never see. Admin labels are exempt, but View-as-member never adds member-facing text. */
export const BANNED_MEMBER_WORDS = ['meet', 'guide', 'tour', 'host', 'creator', 'reviews', 'hidden gem', 'alcohol', 'gift', 'wallet', 'credit',
  'lucky', 'draw', 'temples', 'ลุ้น'];
