/**
 * Instant face check (0081, 17 Nov): the pure part, no camera, no models. Fed one LiveFrame per camera frame.
 *
 *   straight → turn A → turn B → blink → done      (A/B = left/right in a random order every time)
 *
 * Liveness = both head turns AND a blink, with the same face tracked the whole time (no gap > LOST_MS, no jump that looks
 * like a different face), all within LIVE_MAX_MS after the straight step. A still photo never turns or blinks → fails.
 * The phone then decides only "fail" (retry) or "send"; the SERVER makes the real decision (pass / review / block).
 */

export interface LiveFrame {
  found: boolean;
  /** faces in view */
  faces: number;
  /** 0.5 = straight; > 0.5 nose towards the image's right (the member's own left); same scale for MediaPipe and face-api */
  yaw: number;
  /** eyes closed 0..1 (MediaPipe blendshapes eyeBlinkLeft/Right averaged); null with the face-api fallback */
  closed: number | null;
  /** eye openness (eye aspect ratio); the face-api fallback's blink signal */
  ear: number;
  /** face width / frame width */
  size: number;
  /** face centre, 0..1 of the frame */
  cx: number;
  cy: number;
  /** mean frame brightness 0..1 (null = not measured this frame) */
  bright: number | null;
  /** ms */
  t: number;
}

export type Turn = 'left' | 'right';
export type LiveStep = 'straight' | 'turn1' | 'turn2' | 'blink' | 'done' | 'failed';
export type Hint = 'face' | 'one' | 'light' | 'closer' | 'back' | 'centre' | 'still' | null;
export type FailWhy = 'timeout' | 'lost' | 'noface' | 'swap' | 'mismatch' | 'still' | 'spoof';

export const SIZE_MIN = 0.2, SIZE_MAX = 0.78, DARK = 0.22, OFF_CENTRE_X = 0.17, OFF_CENTRE_Y = 0.2, JITTER = 0.035;
/** straight step: this many good, steady frames in a row */
export const STRAIGHT_FRAMES = 4;
/** a head turn: yaw this far from the member's own straight yaw, for TURN_FRAMES frames */
export const TURN_DELTA = 0.1, TURN_FRAMES = 2;
/** back to the camera for the blink: yaw within this of the straight yaw */
export const FACING = 0.09;
/** MediaPipe blink: closed above max(BLINK_ON, open level + BLINK_RISE), open again below the "on" level − BLINK_HYST */
export const BLINK_ON = 0.42, BLINK_RISE = 0.25, BLINK_HYST = 0.15;
/** face-api blink (eye aspect ratio, member's own open level): shut below 76 %, open again above 84 % */
export const EAR_SHUT = 0.76, EAR_OPEN = 0.84;
/** no face for longer than this in the turn / blink steps = tracking lost → start again from "look straight" */
export const LOST_MS = 700;
/** a jump of the face centre by more than this (share of the frame) between two frames, or a size change by ×JUMP_SIZE = another face */
export const JUMP = 0.22, JUMP_SIZE = 1.6;
/** turns + blink must be done within this after the straight step (server: verify_live_max_ms 25000) */
export const LIVE_MAX_MS = 15000;
/** the whole check gives up after this (positioning included) */
export const TOTAL_MAX_MS = 40000;
/**
 * fix4 (19 Nov, live: verify_live_fail "timeout" r0 again and again on slower phones): on a slow phone the camera reads only a
 * few frames a second, so the same moves took longer than the limits above. Slow phones (few CPU cores / little memory, or
 * frames that take > SLOW_FRAME_MS to read, or a timeout already on this screen) get more time. The live part stays inside
 * the server's own limit (verify_live_max_ms 25 000).
 */
export interface LiveLimits { total: number; live: number }
export const LIMITS_FAST: LiveLimits = { total: TOTAL_MAX_MS, live: LIVE_MAX_MS };
export const LIMITS_SLOW: LiveLimits = { total: 75000, live: 22000 };
export const SLOW_FRAME_MS = 120;
export function slowPhone(nav: { hardwareConcurrency?: number; deviceMemory?: number } | null | undefined, frameMs = 0): boolean {
  const cores = nav?.hardwareConcurrency || 0, mem = nav?.deviceMemory || 0;
  return (cores > 0 && cores <= 4) || (mem > 0 && mem <= 3) || frameMs > SLOW_FRAME_MS;
}
/** restarts allowed (face lost / swapped) before it counts as a fail */
export const MAX_RESTARTS = 3;

export interface LiveState {
  step: LiveStep;
  order: [Turn, Turn];
  started: number;          // first frame
  straightAt: number;       // straight step passed (the live timer starts)
  good: number;             // frames in a row that count for the current step
  yaw0: number;             // the member's own straight yaw
  openClosed: number;       // MediaPipe: eyes-closed level with open eyes
  openEar: number;          // face-api: eye openness with open eyes
  shut: boolean;
  blinkSeen: boolean;
  turned: { left: boolean; right: boolean };
  last: LiveFrame | null;   // last frame with a face
  restarts: number;
  hint: Hint;
  fail: FailWhy | null;
  doneAt: number;
}

export function randomOrder(rnd: () => number = Math.random): [Turn, Turn] {
  return rnd() < 0.5 ? ['left', 'right'] : ['right', 'left'];
}
export function liveStart(order: [Turn, Turn] = randomOrder()): LiveState {
  return { step: 'straight', order, started: 0, straightAt: 0, good: 0, yaw0: 0.5, openClosed: 0, openEar: 0, shut: false, blinkSeen: false,
    turned: { left: false, right: false }, last: null, restarts: 0, hint: 'face', fail: null, doneAt: 0 };
}

/** The friendly live hint for this frame (null = all good). Order = what to fix first. */
export function frameHint(f: LiveFrame, prev: LiveFrame | null): Hint {
  if (!f.found) return 'face';
  if (f.faces > 1) return 'one';
  if (f.bright !== null && f.bright < DARK) return 'light';
  if (f.size < SIZE_MIN) return 'closer';
  if (f.size > SIZE_MAX) return 'back';
  if (Math.abs(f.cx - 0.5) > OFF_CENTRE_X || Math.abs(f.cy - 0.5) > OFF_CENTRE_Y) return 'centre';
  if (prev && prev.found && Math.hypot(f.cx - prev.cx, f.cy - prev.cy) > JITTER) return 'still';
  return null;
}

/** true when f looks like a different face than prev (jump in place or size): the same person can't move that fast */
export function swapped(prev: LiveFrame | null, f: LiveFrame): boolean {
  if (!prev || !prev.found || !f.found) return false;
  if (f.t - prev.t > 400) return false;   // after a pause the face may have moved for real (the lost-face rule handles gaps)
  const k = f.size / (prev.size || 1);
  return Math.hypot(f.cx - prev.cx, f.cy - prev.cy) > JUMP || k > JUMP_SIZE || k < 1 / JUMP_SIZE;
}

const turnOf = (s: LiveState): Turn | null => (s.step === 'turn1' ? s.order[0] : s.step === 'turn2' ? s.order[1] : null);
export const currentTurn = turnOf;

function restart(s: LiveState, f: LiveFrame, hint: Hint): LiveState {
  const n = { ...liveStart(s.order), started: s.started, restarts: s.restarts + 1, hint, last: f.found ? f : null };
  if (n.restarts > MAX_RESTARTS) return { ...n, step: 'failed', fail: 'lost' };
  return n;
}

/** Pure step machine: one frame in, the next state out. */
export function liveStep(s0: LiveState, f: LiveFrame): LiveState { return liveStepWith(s0, f, LIMITS_FAST); }
/** fix4: the same step machine with the time limits of this phone (LIMITS_FAST / LIMITS_SLOW). */
export function liveStepWith(s0: LiveState, f: LiveFrame, lim: LiveLimits): LiveState {
  if (s0.step === 'done' || s0.step === 'failed') return s0;
  const s: LiveState = { ...s0, started: s0.started || f.t };
  // time limits
  if (f.t - s.started > lim.total) return { ...s, step: 'failed', fail: s.step === 'straight' ? (s.last ? 'timeout' : 'noface') : 'timeout' };
  if (s.straightAt && f.t - s.straightAt > lim.live) return { ...s, step: 'failed', fail: s.turned.left || s.turned.right ? 'timeout' : 'still' };

  const hint = frameHint(f, s.last);
  if (!f.found) {
    // lost tracking during the live part → start again (a restart is not a "try")
    if (s.step !== 'straight' && s.last && f.t - s.last.t > LOST_MS) return restart(s, f, 'face');
    return { ...s, hint: 'face', good: s.step === 'straight' ? 0 : s.good };
  }
  if (s.step !== 'straight' && (f.faces > 1 || swapped(s.last, f))) return restart(s, f, f.faces > 1 ? 'one' : 'still');
  const n: LiveState = { ...s, last: f, hint };

  switch (s.step) {
    case 'straight': {
      const ok = hint === null && Math.abs(f.yaw - 0.5) < 0.1 && (f.closed === null || f.closed < 0.5);
      if (!ok) return { ...n, good: 0 };
      n.good = s.good + 1;
      n.yaw0 = s.good ? s.yaw0 * 0.6 + f.yaw * 0.4 : f.yaw;
      if (f.closed !== null) n.openClosed = s.good ? s.openClosed * 0.6 + f.closed * 0.4 : f.closed;
      n.openEar = Math.max(s.openEar * 0.9, f.ear);
      if (n.good >= STRAIGHT_FRAMES) return { ...n, step: 'turn1', good: 0, straightAt: f.t, hint: null };
      return n;
    }
    case 'turn1':
    case 'turn2': {
      n.hint = hint === 'still' ? null : hint;   // moving is the point here
      const want = turnOf(s)!;
      const d = f.yaw - s.yaw0;
      const hit = want === 'left' ? d > TURN_DELTA : d < -TURN_DELTA;
      if (!hit) return { ...n, good: 0 };
      n.good = s.good + 1;
      if (n.good >= TURN_FRAMES) {
        n.turned = { ...s.turned, [want]: true };
        return { ...n, step: s.step === 'turn1' ? 'turn2' : 'blink', good: 0, shut: false };
      }
      return n;
    }
    case 'blink': {
      n.hint = hint === 'still' ? null : hint;
      if (Math.abs(f.yaw - s.yaw0) > FACING * 1.8) return n;   // look back at the camera first
      if (f.closed !== null) {
        const on = Math.max(BLINK_ON, s.openClosed + BLINK_RISE);
        if (f.closed >= on) return { ...n, shut: true };
        if (s.shut && f.closed < on - BLINK_HYST) return { ...n, step: 'done', blinkSeen: true, doneAt: f.t, shut: false };
        if (!s.shut) n.openClosed = Math.min(s.openClosed * 0.9 + f.closed * 0.1, 0.3);
        return n;
      }
      // face-api fallback: eye aspect ratio against the member's own open level
      const open = s.openEar || f.ear;
      if (f.ear < open * EAR_SHUT) return { ...n, shut: true, openEar: open };
      if (s.shut && f.ear > open * EAR_OPEN) return { ...n, step: 'done', blinkSeen: true, doneAt: f.t, shut: false };
      if (!s.shut) n.openEar = f.ear > open ? open * 0.6 + f.ear * 0.4 : open * 0.995 + f.ear * 0.005;
      return n;
    }
    default:
      return n;
  }
}

/** How good a frame is as THE selfie (higher = better): straight, eyes open, big enough, centred. */
export function frontalScore(f: LiveFrame, yaw0 = 0.5): number {
  if (!f.found || f.faces > 1) return -1;
  const eyes = f.closed === null ? 0 : f.closed;
  return 1 - Math.abs(f.yaw - yaw0) * 4 - eyes - Math.abs(f.cx - 0.5) - Math.abs(f.cy - 0.5) - (f.size < SIZE_MIN ? 0.5 : 0) - (f.bright !== null && f.bright < DARK ? 0.3 : 0);
}

// ─────────────── the phone's part of the decision ───────────────
// Numbers are SFace cosine similarities (1 = identical, ~0 = unrelated) and MiniFASNet real-face scores (0..1).
// Calibrated 17 Nov on LFW (3,120 same-person + 4,650 different-person pairs) + the app's 12 demo people (see migration 0081).
/** selfie vs own card photo below this = clearly not the card photo → friendly retry, nothing sent (LFW: 1.3 % of real
 *  same-person pairs are this low; they can change the card photo) */
export const MATCH_FAIL = 0.3;
/** frames of the same check must be the same face: below SAME_FAIL = a different face (swap) → fail; below SAME_SURE the server is told */
export const SAME_FAIL = 0.4, SAME_SURE = 0.55;
/** anti-spoof: EVERY checked frame must score at least FAS_MIN as a real face; below FAS_SURE on any frame the server is told */
export const FAS_MIN = 0.5, FAS_SURE = 0.8;

export interface FrameRead { emb: ArrayLike<number> | null; real: number | null }
export type ClientVerdict = { kind: 'fail'; why: FailWhy } | { kind: 'send'; doubt: boolean; same: number | null; realMin: number | null };

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** selfie = the frontal frame that is sent; others = the other frames read during the check (after the turns, after the blink) */
export function clientVerdict(x: { live: LiveState; selfie: FrameRead | null; others: FrameRead[]; match: number | null }): ClientVerdict {
  if (x.live.step !== 'done') return { kind: 'fail', why: x.live.fail || 'timeout' };
  if (!x.selfie?.emb) return { kind: 'fail', why: 'noface' };
  const frames = [x.selfie, ...x.others];
  const reals = frames.map((f) => f.real).filter((r): r is number => r !== null);
  const realMin = reals.length ? Math.min(...reals) : null;
  if (reals.length < 3 || (realMin !== null && realMin < FAS_MIN)) return { kind: 'fail', why: 'spoof' };
  const sims = x.others.filter((f) => f.emb).map((f) => dot(x.selfie!.emb!, f.emb!));
  const same = sims.length ? Math.min(...sims) : null;
  if (same === null || same < SAME_FAIL) return { kind: 'fail', why: 'swap' };
  if (x.match !== null && x.match < MATCH_FAIL) return { kind: 'fail', why: 'mismatch' };
  return { kind: 'send', doubt: same < SAME_SURE || (realMin !== null && realMin < FAS_SURE), same, realMin };
}

/** what goes to kr8_verify_instant as p_check (step results, timing and scores only; the embeddings go separately) */
export function checkPayload(s: LiveState, x: { engine: 'mediapipe' | 'faceapi'; match: number | null; same: number | null; realMin?: number | null; frames?: number;
  doubt?: boolean; fail?: FailWhy; device: string }) {
  const r3 = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 1000) / 1000);
  return {
    live: s.step === 'done' && !x.fail, straight: !!s.straightAt, left: s.turned.left, right: s.turned.right, blink: s.blinkSeen,
    order: `${s.order[0]}-${s.order[1]}`, ms: s.straightAt && s.doneAt ? Math.round(s.doneAt - s.straightAt) : null,
    engine: x.engine, match: r3(x.match), same: r3(x.same), real: r3(x.realMin), frames: x.frames ?? 0, doubt: !!x.doubt,
    ...(x.fail ? { fail: x.fail } : {}), device: x.device,
  };
}

/** 0-1 progress for the ring around the oval */
export function progressOf(s: LiveState): number {
  const base: Record<LiveStep, number> = { straight: 0, turn1: 0.25, turn2: 0.5, blink: 0.75, done: 1, failed: 0 };
  return base[s.step] + (s.step === 'straight' ? Math.min(s.good / STRAIGHT_FRAMES, 1) * 0.25 : 0);
}
