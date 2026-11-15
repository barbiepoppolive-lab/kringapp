/**
 * One-time coach marks (spec B6). Each shows once per member: "seen" is kept on the account (kr8_member_coach) so it never
 * repeats after a reinstall, with this phone's storage as the instant copy and the fallback when the server can't be reached.
 * Never two on screen, at most one per session, never over a sheet. "Replay intro" in Me clears both copies.
 */
import { kxCoachReset, kxCoachSeen, kxCoachState } from './v5Kx';

export type CoachKey = 'save' | 'post' | 'score' | 'share';
/** Priority when two are due in the same session (spec: 2, then 3, then 4, then 1). */
export const COACH_ORDER: CoachKey[] = ['post', 'score', 'share', 'save'];
const LS = 'kr8_coach';

export function coachLocal(): string[] {
  try { const j = JSON.parse(localStorage.getItem(LS) || '[]'); return Array.isArray(j) ? j.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
function store(list: string[]) { try { localStorage.setItem(LS, JSON.stringify([...new Set(list)])); } catch { /* private mode */ } }

export interface CoachState { seen: Set<string>; shownThisSession: boolean }
export const newCoachState = (seen: string[] = coachLocal()): CoachState => ({ seen: new Set(seen), shownThisSession: false });

/** May this mark show now? */
export function coachDue(st: CoachState, key: CoachKey, ctx: { sheetOpen: boolean; onScreen: boolean }): boolean {
  return !st.seen.has(key) && !st.shownThisSession && !ctx.sheetOpen && !ctx.onScreen;
}
/** Of the marks whose moment has come, the one to show. */
export function coachPick(st: CoachState, due: CoachKey[]): CoachKey | null {
  if (st.shownThisSession) return null;
  return COACH_ORDER.find((k) => due.includes(k) && !st.seen.has(k)) || null;
}
export function coachMark(st: CoachState, key: CoachKey, signedIn: boolean): void {
  st.seen.add(key);
  st.shownThisSession = true;
  store([...st.seen]);
  if (signedIn) void kxCoachSeen(key);
}
/** Signed in: the account's list wins over the phone's (union, so nothing shows twice). */
export async function coachSync(st: CoachState): Promise<void> {
  try {
    const server = await kxCoachState();
    for (const k of server || []) st.seen.add(k);
    for (const k of st.seen) if (!(server || []).includes(k)) void kxCoachSeen(k);
    store([...st.seen]);
  } catch { /* offline: the phone's copy is used */ }
}
export async function coachReplay(st: CoachState, signedIn: boolean): Promise<void> {
  st.seen.clear();
  st.shownThisSession = false;
  store([]);
  if (signedIn) await kxCoachReset();
}
