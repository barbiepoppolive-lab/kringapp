// kr8-ask-photo rules (pure, unit-tested in src/v8/askRich.test.ts). The SAME automatic checks as card photos and Reels:
//   child  = a clear face whose AWS age range tops out under 18 (PHOTO_CHILD_HIGH, as card photos)
//   nudity = AWS moderation labels (explicit / nudity / sexual / graphic violence / hate symbols)
//   copied = an app / stock / AI watermark read on the picture (same word lists as the Reel copy check)
import { copyHits, type TextDet } from '../face-check-aws/copyscan.ts';

export const ASK_CHILD_HIGH = 18;
export const ASK_MOD_MIN = 60;
const BAD_MOD = /explicit|nudity|sexual|graphic violence|visually disturbing|hate symbol/i;
export interface ModLabel { Name?: string; ParentName?: string; Confidence?: number }
export interface AgeFace { Confidence?: number; AgeRange?: { Low?: number; High?: number } }
export type AskPhotoVerdict = 'ok' | 'child' | 'nudity' | 'copied';

export function askPhotoVerdict(mod: ModLabel[] | null | undefined, faces: AgeFace[] | null | undefined, text: TextDet[] | null | undefined): AskPhotoVerdict {
  if ((mod || []).some((l) => (l.Confidence ?? 0) >= ASK_MOD_MIN && (BAD_MOD.test(l.Name || '') || BAD_MOD.test(l.ParentName || '')))) return 'nudity';
  if ((faces || []).some((f) => (f.Confidence ?? 0) >= 80 && typeof f.AgeRange?.High === 'number' && f.AgeRange.High < ASK_CHILD_HIGH)) return 'child';
  if (copyHits(text, 'photo').some((h) => h.why !== '@handle')) return 'copied';
  return 'ok';
}
