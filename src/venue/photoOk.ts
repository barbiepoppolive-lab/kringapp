/**
 * "Photo OK" (0122, 19 Nov 2026). A card photo the phone could not face-check, or a 2nd refused photo that fix4 let through,
 * is saved as photo_check 'unchecked' and shows "Photo needs a look" in admin. One tap on "Photo OK" (admin-only RPC
 * kr8_admin_photo_ok) marks it checked, so it counts as a real photo again for the trust score and the card-complete nudges.
 * There is no admin "hide this photo / ask for a new one" flow yet, so there is no "Not OK" button.
 * Self-contained (no import from adminApp / adminV2) so both admin screens can use it without a circular import.
 */
import { el, rpc } from './shared';

export const PHOTO_OK_RPC = 'kr8_admin_photo_ok';

/** Marks the member's current card photo as checked by eye. Throws KR8_* codes like every admin RPC. */
export async function markPhotoOk(userId: string): Promise<void> {
  await rpc(PHOTO_OK_RPC, { p_user: userId });
}

/**
 * Small secondary "Photo OK" button. On success it turns into a green "✓ Photo OK" label and calls onDone;
 * on failure it says "Not saved" in its title and can be tapped again.
 */
export function photoOkButton(userId: string, onDone?: () => void, cls = 'pill g photo-ok'): HTMLButtonElement {
  const b = el('button', { type: 'button', class: cls, 'data-photo-ok': userId, title: 'The photo is fine: stop flagging it' }, 'Photo OK') as HTMLButtonElement;
  b.onclick = async (e) => {
    e.stopPropagation();
    if (b.disabled) return;
    b.disabled = true; b.textContent = 'Saving…';
    try {
      await markPhotoOk(userId);
      b.textContent = '✓ Photo OK'; b.dataset.done = '1'; b.title = 'Marked as checked';
      onDone?.();
    } catch (err) {
      b.disabled = false; b.textContent = 'Photo OK'; b.title = `Not saved: ${(err as Error).message}. Tap to try again.`;
      b.dataset.error = (err as Error).message;
    }
  };
  return b;
}


/**
 * 0162 (20 Nov): ONE honest photo label per member (it used to show "Photo needs a look" and a green "Photo OK" side by side).
 *  no_face   → red "No face in photo · hidden from People" (automatic; the member got one message)
 *  look      → amber "Photo: check by eye · tap if fine" (the chip itself is the one-tap OK)
 *  unchecked → faint "Photo being checked" (the robot decides within minutes)
 *  ok / null → nothing
 * `kind` picks the class names of the screen it sits in (admin v2 chips or classic pills).
 */
export function photoStateChip(userId: string, state: string | null | undefined, kind: 'v2' | 'pill' = 'pill', onDone?: () => void): HTMLElement | null {
  const c = (tone: string) => (kind === 'v2' ? `v2chip ${tone}` : `pill ${tone}`);
  if (state === 'no_face') return el('span', { class: c('r'), 'data-photo-check': 'no_face', title: 'No face in the card photo: kept out of People until they add a photo of themselves. They got one automatic message.' }, 'No face in photo · hidden from People');
  if (state === 'unchecked') return el('span', { class: c(''), 'data-photo-check': 'unchecked', title: 'The photo robot checks this photo within a few minutes.' }, 'Photo being checked');
  if (state !== 'look') return null;
  const b = el('button', { type: 'button', class: c('a') + ' photo-ok', 'data-photo-ok': userId, 'data-photo-check': 'look', title: 'Unclear photo (no clear face, group or screenshot). Tap if it is fine.' }, 'Photo: check by eye · tap if fine') as HTMLButtonElement;
  b.onclick = async (e) => {
    e.stopPropagation();
    if (b.disabled) return;
    b.disabled = true; b.textContent = 'Saving…';
    try { await markPhotoOk(userId); b.textContent = '✓ Photo OK'; b.dataset.done = '1'; onDone?.(); }
    catch (err) { b.disabled = false; b.textContent = 'Photo: check by eye · tap if fine'; b.title = `Not saved: ${(err as Error).message}. Tap to try again.`; }
  };
  return b;
}
