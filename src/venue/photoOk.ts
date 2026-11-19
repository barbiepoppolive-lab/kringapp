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
