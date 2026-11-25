/**
 * m214 (25 Nov 2026) first-visit steps + "answered like you". Retention push: new members left within a minute or two.
 *  · kr8_onb_state(): the first-visit steps. m216 (founder 25 Nov): four, in this order: 1 This-or-That vote (no face check)
 *    · 1 Ask BKK answer · 3 Reel likes · first clip; all four give the "Bangkok Local ✓" profile tag (a badge only: no Rings)
 *  · kr8_onb_alike(kind, ref): members who answered the same way (after 2+ answers/votes), for Follow
 * One small store; any like / answer / vote / Reel post fires 'kr8-onb-poke' (v5Live, askThai, v5Tasks) and the store re-reads.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { v5Client } from './v5Live';

export interface OnbState {
  on: boolean; new?: boolean; ends_at?: string; vote?: boolean; ask?: boolean; likes?: number; clip?: boolean;
  done?: boolean; badge?: boolean; answers?: number; streak?: number;
}
export type OnbStep = 'vote' | 'ask' | 'like' | 'clip';
export const ONB_STEPS: OnbStep[] = ['vote', 'ask', 'like', 'clip'];
export const ONB_N = ONB_STEPS.length;
export interface AlikePerson { user_id: string; first_name: string; photo: string | null; verified: boolean; same_votes: number; same_questions: number }
export interface Alike { eligible: boolean; answers: number; people: AlikePerson[] }

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const c = await v5Client();
  const res = await c.rpc(fn, args);
  if (res.error) throw res.error;
  return res.data as T;
}

let cur: OnbState | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
let inflight: Promise<void> | null = null;
let timer = 0;

export function onbRefresh(): Promise<void> {
  if (inflight) return inflight;
  inflight = call<OnbState>('kr8_onb_state')
    .then((s) => { cur = s && typeof s === 'object' ? s : { on: false }; emit(); })
    .catch(() => { /* the steps are a nicety: never an error on screen */ })
    .finally(() => { inflight = null; });
  return inflight;
}
export function onbReset() { cur = null; emit(); }

if (typeof window !== 'undefined') {
  window.addEventListener('kr8-onb-poke', (e) => {
    const fn = (e as CustomEvent<string>).detail;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { if (cur) void onbRefresh(); if (fn === 'kr8_task_vote' || fn === 'kr8_ask_answer') alikeBump(); }, 600);
  });
}

/** The member's step state (null until the first read). `uid` empty = signed out: nothing is read. */
export function useOnb(uid: string): OnbState | null {
  const s = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => cur, () => null);
  useEffect(() => { if (uid) void onbRefresh(); else onbReset(); }, [uid]);
  return uid ? s : null;
}

export const onbStepDone = (s: OnbState, k: OnbStep) =>
  (k === 'vote' ? !!s.vote : k === 'ask' ? !!s.ask : k === 'like' ? (s.likes || 0) >= 3 : !!s.clip);
export const onbCount = (s: OnbState | null) => (s ? ONB_STEPS.filter((k) => onbStepDone(s, k)).length : 0);
export const onbNext = (s: OnbState): OnbStep | null => ONB_STEPS.find((k) => !onbStepDone(s, k)) || null;
/** Shown only in the first 3 days, before all four are done, and until the member hides it. */
export const onbActive = (s: OnbState | null, uid: string) => !!(s && s.on && s.new && !s.done && !onbHidden(uid));

const hideKey = (uid: string) => `kr8_onb_hide_${uid}`;
export function onbHidden(uid: string): boolean { try { return !!uid && localStorage.getItem(hideKey(uid)) === '1'; } catch { return false; } }
export function onbHide(uid: string) { try { localStorage.setItem(hideKey(uid), '1'); } catch { /* private mode */ } emit(); }

// ── "answered like you": every vote / answer bumps a counter so open lists re-read ──
let alikeGen = 0;
const alikeSubs = new Set<() => void>();
function alikeBump() { alikeGen += 1; alikeSubs.forEach((f) => f()); }
export function useAlikeGen(): number {
  return useSyncExternalStore((f) => { alikeSubs.add(f); return () => alikeSubs.delete(f); }, () => alikeGen, () => 0);
}
export const onbAlike = (kind: 'any' | 'vote' | 'ask', ref?: string | null, limit = 12) =>
  call<Alike>('kr8_onb_alike', { p_kind: kind, p_ref: ref || null, p_limit: limit });
