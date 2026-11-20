// Card-photo verdict (pure, unit-tested). See index.ts photoCheck.
export type Fd = { BoundingBox?: { Width?: number }; Confidence?: number; AgeRange?: { Low?: number; High?: number } };
/** 20 Nov (founder): a card photo must show ONE clear face. 'text' = a screenshot / poster (lots of words) even if a face shows.
 *  20 Nov (founder, "why the photo of kid is approved?"): 'child' = the main face's AWS age range tops out under 18. */
export const PHOTO_TEXT_WORDS = 25;
export const PHOTO_CHILD_HIGH = 18;
export type PhotoV = 'ok' | 'none' | 'small' | 'group' | 'text' | 'child';
export function photoVerdictAws(faces: Fd[], words = 0): PhotoV {
  const fs = (faces || []).filter((x) => (x.Confidence ?? 0) >= 90).sort((a, b) => (b.BoundingBox?.Width ?? 0) - (a.BoundingBox?.Width ?? 0));
  const f = fs.map((x) => x.BoundingBox?.Width ?? 0);
  if (!f.length || f[0] > 0.95) return 'none';
  if (f[0] < 0.08) return 'small';
  const hi = fs[0].AgeRange?.High;
  if (typeof hi === 'number' && hi < PHOTO_CHILD_HIGH) return 'child';
  if (f.length > 1 && f[1] >= f[0] * 0.85) return 'group';
  if (words >= PHOTO_TEXT_WORDS) return 'text';
  return 'ok';
}
