/**
 * Server face check (AWS Rekognition, 19 Nov): the pure decision rules. No network, no Deno, no DOM, so vitest covers it.
 * The edge function supabase/functions/face-check-aws/ keeps an IDENTICAL copy as decide.ts (a test checks they match);
 * edit this file, then copy it over.
 *
 * 1. liveCheck(): DetectFaces on the 3 frames (look straight · turn left · turn right). Exactly one clear face in each, good light,
 *    sharp enough, eyes open on the straight frame, and the two turns really point in OPPOSITE directions (simple liveness:
 *    a printed photo held up does not change its yaw). Fails give a friendly retry reason.
 * 2. decide(): CompareFaces (straight vs the member's card photo) + SearchFacesByImage (the kring-members collection) →
 *    pass (automatic ✓) or review (the founder decides). Nothing here ever blocks an account on its own.
 */

export type FaceStep = 'straight' | 'left' | 'right';
/** one face from DetectFaces, only the numbers the rules use */
export interface AwsFace {
  confidence: number;          // 0–100
  yaw: number;                 // degrees
  pitch: number;               // degrees
  brightness: number | null;   // Quality.Brightness 0–100
  sharpness: number | null;    // Quality.Sharpness 0–100
  eyesOpen: boolean | null;
  eyesConf: number;
  sunglasses: boolean;
  boxW: number;                // BoundingBox.Width, share of the image width (0–1)
}
export type RetryWhy = 'no_face' | 'many_faces' | 'too_dark' | 'too_blurry' | 'too_far' | 'eyes_closed' | 'sunglasses' | 'look_straight'
  | 'turn_left_missing' | 'turn_right_missing';
export const RETRY_WHYS: readonly RetryWhy[] = ['no_face', 'many_faces', 'too_dark', 'too_blurry', 'too_far', 'eyes_closed', 'sunglasses',
  'look_straight', 'turn_left_missing', 'turn_right_missing'];

export interface FaceAwsLimits {
  minConf: number;        // a face counts when DetectFaces is at least this sure
  otherFaceMinW: number;  // a second face this big (share of the width) means "many faces" (tiny faces far behind are ignored)
  minBright: number;
  minSharp: number;
  minBoxW: number;        // the face must fill at least this share of the width
  straightMaxYaw: number;
  straightMaxPitch: number;
  turnMinYaw: number;     // each turn at least this many degrees away from the straight frame
  turnMinGap: number;     // left and right at least this far apart
  /** +1 / -1: the sign Rekognition gives a turn to the member's own LEFT (raw, un-mirrored front-camera frame).
   *  0 = direction not checked (only "the two turns are opposite"). Set once a real test shows the sign. */
  yawSign: number;
  cardMin: number;        // CompareFaces similarity with the own card photo for an automatic ✓
  dupMin: number;         // SearchFacesByImage similarity with ANOTHER member that sends it to the founder
}
export const AWS_LIMITS: FaceAwsLimits = {
  minConf: 90, otherFaceMinW: 0.12, minBright: 20, minSharp: 6, minBoxW: 0.16,
  straightMaxYaw: 15, straightMaxPitch: 25, turnMinYaw: 7, turnMinGap: 14, yawSign: 0,
  cardMin: 80, dupMin: 95,
};

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** raw DetectFaces JSON → the faces we use (sure ones first by size) */
export function summarize(resp: unknown): AwsFace[] {
  const list = (resp as { FaceDetails?: unknown[] } | null)?.FaceDetails;
  if (!Array.isArray(list)) return [];
  return list.map((f) => {
    const d = (f || {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    return {
      confidence: num(d.Confidence) ?? 0,
      yaw: num(d.Pose?.Yaw) ?? 0,
      pitch: num(d.Pose?.Pitch) ?? 0,
      brightness: num(d.Quality?.Brightness),
      sharpness: num(d.Quality?.Sharpness),
      eyesOpen: typeof d.EyesOpen?.Value === 'boolean' ? d.EyesOpen.Value : null,
      eyesConf: num(d.EyesOpen?.Confidence) ?? 0,
      sunglasses: d.Sunglasses?.Value === true && (num(d.Sunglasses?.Confidence) ?? 0) >= 80,
      boxW: num(d.BoundingBox?.Width) ?? 0,
    };
  }).sort((a, b) => b.boxW - a.boxW);
}

export type FrameResult = { ok: true; face: AwsFace } | { ok: false; why: RetryWhy };
/** one frame: exactly one clear face, light, sharpness, size (+ eyes and facing the camera on the straight frame) */
export function checkFrame(step: FaceStep, faces: AwsFace[], lim: FaceAwsLimits = AWS_LIMITS): FrameResult {
  const sure = faces.filter((f) => f.confidence >= lim.minConf);
  if (!sure.length) return { ok: false, why: step === 'straight' ? 'no_face' : step === 'left' ? 'turn_left_missing' : 'turn_right_missing' };
  if (sure.filter((f) => f.boxW >= lim.otherFaceMinW).length > 1) return { ok: false, why: 'many_faces' };
  const f = sure[0];
  if (f.brightness !== null && f.brightness < lim.minBright) return { ok: false, why: 'too_dark' };
  if (f.boxW < lim.minBoxW) return { ok: false, why: 'too_far' };
  if (step === 'straight') {
    if (f.sharpness !== null && f.sharpness < lim.minSharp) return { ok: false, why: 'too_blurry' };
    if (f.sunglasses) return { ok: false, why: 'sunglasses' };
    if (f.eyesOpen === false && f.eyesConf >= 80) return { ok: false, why: 'eyes_closed' };
    if (Math.abs(f.yaw) > lim.straightMaxYaw || Math.abs(f.pitch) > lim.straightMaxPitch) return { ok: false, why: 'look_straight' };
  }
  return { ok: true, face: f };
}

export type LiveResult = { ok: true; yaw: Record<FaceStep, number> } | { ok: false; why: RetryWhy };
/** the 3 frames together: each frame fine, and the two turns real and opposite */
export function liveCheck(frames: Record<FaceStep, AwsFace[]>, lim: FaceAwsLimits = AWS_LIMITS): LiveResult {
  const s = checkFrame('straight', frames.straight, lim);
  if (!s.ok) return s;
  const l = checkFrame('left', frames.left, lim);
  if (!l.ok) return l;
  const r = checkFrame('right', frames.right, lim);
  if (!r.ok) return r;
  const y0 = s.face.yaw, yl = l.face.yaw - y0, yr = r.face.yaw - y0;
  // with a known sign, each turn must go its own way; without one, the two must at least be opposite
  const wantL = lim.yawSign === 0 ? Math.sign(yl) || 1 : lim.yawSign;
  if (Math.abs(yl) < lim.turnMinYaw || (lim.yawSign !== 0 && Math.sign(yl) !== wantL)) return { ok: false, why: 'turn_left_missing' };
  if (Math.abs(yr) < lim.turnMinYaw || Math.sign(yr) !== -wantL) return { ok: false, why: 'turn_right_missing' };
  if (Math.abs(yl - yr) < lim.turnMinGap) return { ok: false, why: 'turn_right_missing' };
  return { ok: true, yaw: { straight: round1(s.face.yaw), left: round1(l.face.yaw), right: round1(r.face.yaw) } };
}
const round1 = (x: number) => Math.round(x * 10) / 10;

/** CompareFaces JSON → best similarity with the card photo; null = no face found in the card photo */
export function cardSimilarity(resp: unknown): number | null {
  const r = (resp || {}) as { FaceMatches?: { Similarity?: number }[]; UnmatchedFaces?: unknown[] };
  const best = (r.FaceMatches || []).map((m) => num(m?.Similarity) ?? 0).sort((a, b) => b - a)[0];
  if (best !== undefined) return round1(best);
  return (r.UnmatchedFaces || []).length ? 0 : null;
}

export interface OtherMatch { user_id: string; similarity: number }
/** SearchFacesByImage JSON → the most similar OTHER member (ExternalImageId = their user id); the member's own faces are skipped */
export function pickOther(resp: unknown, uid: string): OtherMatch | null {
  const list = (resp as { FaceMatches?: { Similarity?: number; Face?: { ExternalImageId?: string } }[] } | null)?.FaceMatches || [];
  let best: OtherMatch | null = null;
  for (const m of list) {
    const id = m?.Face?.ExternalImageId, sim = num(m?.Similarity);
    if (!id || sim === null || id.toLowerCase() === uid.toLowerCase()) continue;
    if (!best || sim > best.similarity) best = { user_id: id, similarity: round1(sim) };
  }
  return best;
}

export type FaceAwsDecision = { result: 'pass'; reasons: [] } | { result: 'review'; reasons: string[] };
/** after a good live check: automatic ✓, or the founder looks (look-alike of another member, card photo not matching, …) */
export function decide(input: { card: number | null; other: OtherMatch | null; autoOn: boolean }, lim: FaceAwsLimits = AWS_LIMITS): FaceAwsDecision & { cardFix: string | null } {
  const reasons: string[] = [];
  if (input.other && input.other.similarity >= lim.dupMin) reasons.push('aws_same_face');
  // 19 Nov (founder): the card photo no longer decides the ✓ (it sent most checks to the founder by hand). A weak / missing
  // card match passes and the member is asked by message to change the card photo (cardFix); only a duplicate face waits.
  const cardFix = input.card === null ? 'no_card_face' : input.card < lim.cardMin ? 'card_mismatch' : null;
  if (!input.autoOn) reasons.push('auto_off');
  return reasons.length ? { result: 'review', reasons, cardFix } : { result: 'pass', reasons: [], cardFix };
}
