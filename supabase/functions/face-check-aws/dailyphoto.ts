// m242 (27 Nov, founder: "a filter that members upload their real pic, subtly"): the daily photo must show a bit of the member.
// Face optional (back, side, outfit, a hand at the spot). Refused: no person at all (a view, food, a meme), a screenshot or poster
// (lots of words), a child, or ONE clear face that is not this member (a photo from the internet, a friend posted as "me").
// A group photo with friends is fine. Pure function, unit-tested; index.ts feeds it the AWS answers.
export type DLabel = { Name?: string; Confidence?: number; Instances?: { BoundingBox?: { Width?: number; Height?: number }; Confidence?: number }[] };
export type DFace = { BoundingBox?: { Width?: number }; Confidence?: number; AgeRange?: { Low?: number; High?: number } };
export type DMatch = { user: string; sim: number };
export type DailyV = 'ok' | 'noperson' | 'text' | 'child' | 'notyou' | 'other';

/** labels that mean a person (or part of one) is in the picture */
const PERSON = /^(person|man|woman|girl|boy|adult|male|female)$/i;   // has boxes: the person must take up real space in the photo
const PART = /^(hand|finger|arm|leg|foot|feet|body part|selfie|portrait|face|head|tattoo|knee|thigh|wrist|palm)$/i;   // a close shot of the member
export const DAILY_PERSON_AREA = 0.03;   // a person box of ≥ 3 % of the photo (not a tiny figure far away or on a poster)
export const DAILY_TEXT_WORDS = 25;
export const DAILY_SELF_MIN = 80;    // this member's own face (Rekognition similarity)
export const DAILY_OTHER_MIN = 95;   // clearly another member

export function dailyPhotoVerdict(uid: string, labels: DLabel[], faces: DFace[], words: number, matches: DMatch[] | null): DailyV {
  if (words >= DAILY_TEXT_WORDS) return 'text';
  const clear = (faces || []).filter((f) => (f.Confidence ?? 0) >= 95 && (f.BoundingBox?.Width ?? 0) >= 0.08)
    .sort((a, b) => (b.BoundingBox?.Width ?? 0) - (a.BoundingBox?.Width ?? 0));
  if (clear.some((f) => typeof f.AgeRange?.High === 'number' && (f.AgeRange.High as number) < 18)) return 'child';
  const big = (l: DLabel) => (l.Instances || []).some((i) => (i.Confidence ?? 0) >= 80 && (i.BoundingBox?.Width ?? 0) * (i.BoundingBox?.Height ?? 0) >= DAILY_PERSON_AREA);
  const person = (labels || []).some((l) => PERSON.test(l.Name || '') && (l.Confidence ?? 0) >= 80 && big(l))
    || (labels || []).some((l) => PART.test(l.Name || '') && (l.Confidence ?? 0) >= 88)
    || clear.length > 0;
  if (!person) return 'noperson';
  // one clear face only (a selfie / portrait): it must be this member. Groups and faceless shots are fine.
  if (clear.length === 1 && matches) {
    const me = uid.toLowerCase();
    if (matches.some((m) => m.user.toLowerCase() === me && m.sim >= DAILY_SELF_MIN)) return 'ok';
    if (matches.some((m) => m.user.toLowerCase() !== me && m.sim >= DAILY_OTHER_MIN)) return 'other';
    return 'notyou';
  }
  return 'ok';
}
