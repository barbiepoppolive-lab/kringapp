// kringapp.com/og/r/<short>.jpg (1200x630) or -sq.jpg (600x600): the share-link card (see _lib/ogcard.js).
// Falls back to the Kring card. 
import { ogCard } from '../../_lib/ogcard.js';
export async function onRequestGet(ctx) {
  const m = /^([a-z0-9]{6,10})(-sq)?\.(jpg|png)$/.exec(String(ctx.params.file || '').toLowerCase());
  const r = m ? await ogCard(ctx, 'reel', m[1], !!m[2]).catch(() => null) : null;
  return r || Response.redirect(new URL(m && m[2] ? '/assets/home/og-sq.jpg?v=3' : '/assets/home/og.jpg?v=3', ctx.request.url).toString(), 302);
}
