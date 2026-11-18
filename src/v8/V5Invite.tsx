import { RingGlyph } from './V5KxCard';
import { inviteHint, inviteHintParts } from './invite';

/** invite-1: ONE quiet line under a share button: "Friends' likes = you climb · +10 ◎◎" (Rings drawn as the Kring icon). */
export function InviteHint({ lang, x, id = 'kxInviteHint' }: { lang: string; x?: number | null; id?: string }) {
  const p = inviteHintParts(lang === 'th' ? 'th' : 'en', x ?? undefined);
  return <p className="kx-ihint" id={id} lang={lang === 'th' ? 'th' : 'en'} aria-label={inviteHint(lang === 'th' ? 'th' : 'en', x ?? undefined)}>{p.lead} <b>{p.amt}</b> <RingGlyph /></p>;
}

