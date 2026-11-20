/* 17 Nov "Your next step": the ONE thing a signed-in member should do next to finish the reward funnel, from data the app already loads
   (my Reels with status / note, my prizes and claims, verified). Shown as a slim pill on Feed and a card at the top of Me. */
import type { KxClaim, KxPrize } from './v5Kx';

export type NextStepKind = 'reel' | 'retry' | 'pending' | 'claim' | 'verify' | 'climb';

export interface NextStepInput {
  hasCard: boolean;
  /** my Reels, newest first or in any order (null = not loaded yet) */
  reels: { status: 'approved' | 'pending' | 'hidden'; note?: string | null; created_at: string }[] | null;
  /** my prizes and claims (null = not loaded yet) */
  prizes: KxPrize[] | null;
  claims: KxClaim[] | null;
  verified: boolean;
  /** a face check is already waiting for the team */
  verifyPending?: boolean;
  /** Founding Local: seats left and the amount (the first-Reel line shows the amount only while seats are open) */
  foundingLeft?: number | null;
  foundingThb?: number | null;
  /** 20 Nov (Founding closed): this week's #1 prize, for the "Be Bangkok's face of the week" hook */
  topPrize?: number | null;
  /** this week's Rings and the prize-seat floor (25) */
  rings?: number | null;
  floor?: number | null;
}

export interface NextStep {
  kind: NextStepKind;
  /** steps 5 and 6 stay until done; the rest can be hidden for a day */
  dismissible: boolean;
  amount?: number;
  note?: string;
  prize?: KxPrize;
  rings?: number;
  floor?: number;
  gap?: number;
  /** 20 Nov: #1 weekly prize shown on the first-Reel hook once Founding Local seats are gone */
  top?: number;
}

const NOTE_MAX = 90;
export const shortNote = (s: string): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > NOTE_MAX ? `${t.slice(0, NOTE_MAX - 1).trimEnd()}…` : t;
};

export function pickNextStep(i: NextStepInput): NextStep | null {
  // 1. no card: onboarding handles it
  if (!i.hasCard) return null;
  // wait for the Reels so the pill never flashes the wrong step
  if (!i.reels) return null;
  if (i.reels.length === 0) {
    const open = (i.foundingLeft ?? 0) > 0;
    return { kind: 'reel', dismissible: true, amount: open ? i.foundingThb || 100 : undefined, top: !open && i.topPrize ? i.topPrize : undefined };
  }
  const latest = [...i.reels].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))[0];
  // 3. the latest Reel came back with a note from the team
  if (latest.status === 'hidden' && latest.note && latest.note.trim()) return { kind: 'retry', dismissible: true, note: latest.note.trim() };   // 20 Nov: raw "th\nen" note; the card picks one language, then shortens
  // 4. the latest Reel is waiting for its check
  if (latest.status === 'pending') return { kind: 'pending', dismissible: true };
  if (!i.prizes || !i.claims) return null;
  // 5. Founding prize won, not claimed yet
  const prize = i.prizes.find((p) => p.kind === 'founding' && p.status === 'won');
  if (prize) return { kind: 'claim', dismissible: false, prize, amount: prize.amount };
  // 6. a claim is held for the face check
  if (!i.verified && !i.verifyPending && i.claims.some((c) => c.status === 'pending')) return { kind: 'verify', dismissible: false };
  // 7. everything done: climb this week's board
  const rings = Math.max(0, i.rings ?? 0);
  const floor = i.floor && i.floor > 0 ? i.floor : 25;
  return { kind: 'climb', dismissible: true, rings, floor, gap: Math.max(0, floor - rings) };
}

// ── "hide for a day" (per member, per step; stored on the phone) ──
const KEY = 'kr8_next_hide:';
export const HIDE_MS = 24 * 3600 * 1000;
export function nextStepHidden(uid: string, kind: NextStepKind, now = Date.now()): boolean {
  if (!uid || kind === 'claim' || kind === 'verify') return false;
  try {
    const t = Number(localStorage.getItem(`${KEY}${uid}:${kind}`) || 0);
    return t > 0 && now - t < HIDE_MS;
  } catch { return false; }
}
export function hideNextStep(uid: string, kind: NextStepKind, now = Date.now()): void {
  if (!uid || kind === 'claim' || kind === 'verify') return;
  try { localStorage.setItem(`${KEY}${uid}:${kind}`, String(now)); } catch { /* private mode */ }
}

// ── 0111 (founder 18 Nov): the Me row "Verify your face in 5 seconds" is a gentle nudge, never a gate. × hides it for a week
// (per member, stored on the phone); it comes back after that, and the claim screen always asks when a prize is claimed.
const VKEY = 'kr8_vfy_hide:';
export const VERIFY_HIDE_MS = 7 * 24 * 3600 * 1000;
/** `_tick` only makes React read it again after a hide */
export function verifyRowHidden(uid: string, _tick = 0, now = Date.now()): boolean {
  if (!uid) return false;
  try {
    const t = Number(localStorage.getItem(VKEY + uid) || 0);
    return t > 0 && now - t < VERIFY_HIDE_MS;
  } catch { return false; }
}
export function hideVerifyRow(uid: string, now = Date.now()): void {
  if (!uid) return;
  try { localStorage.setItem(VKEY + uid, String(now)); } catch { /* private mode */ }
}
