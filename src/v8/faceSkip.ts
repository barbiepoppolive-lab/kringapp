/** face-fixes (19 Nov, founder): no second face scan at prize-claim time for a member who is already verified.
 *  - This phone remembers that the member passed the face check here (localStorage, per account, a flag only: no face data).
 *  - The claim skips the 3-second scan when the member is verified AND (this phone passed, or the team approved the check).
 *  - The claim then goes without a face code. A server that still asks for one answers KR8_FACE_NEEDED, and the claim screen
 *    falls back to the 3-second scan exactly as before, so nothing breaks before the server change is live. */
const KEY = 'kr8_face_passed';

function read(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
/** Called when the face check passes on this phone (instant ✓). */
export function markFacePassed(uid: string | null | undefined): void {
  if (!uid) return;
  try { localStorage.setItem(KEY, JSON.stringify([...read().filter((x) => x !== uid), uid].slice(-5))); } catch { /* private mode */ }
}
/** true when this account passed the face check on this phone. */
export function facePassedHere(uid: string | null | undefined): boolean {
  return !!uid && read().includes(uid);
}
/** Pure: skip the claim-time scan? `approved` = the server says the member is verified (team-approved or instant pass). */
export function skipClaimFace(s: { verified: boolean; passedHere: boolean; approved: boolean }): boolean {
  return s.verified && (s.passedHere || s.approved);
}
