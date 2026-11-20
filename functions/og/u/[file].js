// kringapp.com/og/u/<user id>.jpg (1200x630) or -sq.jpg (600x600): the share-link card (see _lib/ogcard.js).
// Falls back to the Kring card. Face-verified members only.
import { ogCard } from '../../_lib/ogcard.js';
export async function onRequestGet(ctx) {
  const m = /^([0-9a-f-]{36})(-sq)?\.(jpg|png)$/.exec(String(ctx.params.file || '').toLowerCase());
  const r = m ? await ogCard(ctx, 'person', m[1], !!m[2]).catch(() => null) : null;
  return r || Response.redirect(new URL(m && m[2] ? '/assets/home/og-sq.jpg?v=3' : '/assets/home/og.jpg?v=3', ctx.request.url).toString(), 302);
}
