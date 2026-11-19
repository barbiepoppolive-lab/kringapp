/**
 * 0138 (19 Nov, founder): the traveller tag needs a passport check by the Kring team. Pure helpers, no DOM, so vitest checks them.
 * The server is the real guard (kr8_traveller_guard_trg); guardWho mirrors its rules so the tests document them in one place.
 */

export type TravellerReason = 'unclear' | 'not_passport' | 'thai' | 'name' | 'photo' | 'other';
export interface TravellerRequest {
  id: string; status: 'pending' | 'approved' | 'refused' | 'expired';
  reason_code: TravellerReason | null; reason_note: string | null; at: string; decided_at: string | null;
}
export interface TravellerState { who: 'local' | 'traveller'; request: TravellerRequest | null }
export type TravellerView = 'none' | 'pending' | 'approved' | 'refused';

/** What the card / edit screen shows. A card that is already a traveller (approved, or an old demo row) is "approved". */
export function travellerView(s: TravellerState | null | undefined, cardWho?: string | null): TravellerView {
  if (s?.who === 'traveller' || cardWho === 'traveller') return 'approved';
  const st = s?.request?.status;
  return st === 'pending' ? 'pending' : st === 'refused' ? 'refused' : 'none';
}

/** 'other' in a language that isn't English: the team's note is English, so the member sees this line in their language instead
 *  (one language at a time on member screens). */
export const OTHER_KEY = 'Our team needs a different photo of your passport photo page.';
/** The member-facing reason for a refusal (English key, translated by L()). 'other' shows the team's short note as written
 *  only in English mode (english = true); in every other language a standard line in that language. */
export const REASON_KEY: Record<Exclude<TravellerReason, 'other'>, string> = {
  unclear: 'The photo isn’t clear. Take it again in good light, with no glare.',
  not_passport: 'This isn’t a passport photo page.',
  thai: 'Thai passports can’t get the traveller tag. Thai members are Bangkok locals on Kring.',
  name: 'The name isn’t the same as on your card.',
  photo: 'The passport photo doesn’t look like your card photo.',
};
export function reasonText(L: (en: string) => string, r: Pick<TravellerRequest, 'reason_code' | 'reason_note'> | null | undefined, english = true): string {
  if (!r?.reason_code) return '';
  if (r.reason_code === 'other') return (english && (r.reason_note || '').trim()) || L(OTHER_KEY);
  return L(REASON_KEY[r.reason_code]);
}

/** Admin: the refuse choices, in the order the founder sees them (English only). */
export const REFUSE_REASONS: { code: TravellerReason; label: string }[] = [
  { code: 'unclear', label: 'Photo not clear' },
  { code: 'not_passport', label: 'Not a passport photo page' },
  { code: 'thai', label: 'Thai passport' },
  { code: 'name', label: 'Name does not match the card' },
  { code: 'photo', label: 'Face does not match the card photo' },
  { code: 'other', label: 'Other (write a short note)' },
];

/** The card save never asks for 'traveller' by itself any more: it sends what the card already is (the server keeps it anyway). */
export function whoToSave(cardWho: string | null | undefined): 'local' | 'traveller' {
  return cardWho === 'traveller' ? 'traveller' : 'local';
}

/** Mirror of the server guard (0138 kr8_traveller_guard_trg): the value kr8_members.who really ends up with. */
export function guardWho(x: {
  op: 'INSERT' | 'UPDATE'; oldWho?: string | null; newWho: string;
  /** kr8_admin_traveller_decide set the session flag */ adminDecision?: boolean;
  /** a member is signed in (auth.uid() not null) */ signedIn: boolean;
  /** the member has an approved traveller request */ approved?: boolean;
}): string {
  if (x.newWho !== 'traveller') return x.newWho;
  if (x.op === 'UPDATE' && x.oldWho === 'traveller') return 'traveller';
  if (x.adminDecision) return 'traveller';
  if (!x.signedIn) return 'traveller';
  if (x.approved) return 'traveller';
  return x.op === 'UPDATE' ? (x.oldWho || 'local') : 'local';
}

/** Storage path rule (same as the server check): <own user id>/<uuid>.jpg */
export function passportPathOk(uid: string, path: string): boolean {
  return new RegExp(`^${uid.replace(/[^0-9a-f-]/gi, '')}/[0-9a-f-]{36}\\.jpg$`).test(path);
}
