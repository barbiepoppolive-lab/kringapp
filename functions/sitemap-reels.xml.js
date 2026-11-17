// kringapp.com/sitemap-reels.xml : every public member Reel page (TH + EN, with video data) and the built area pages that have Reels.
import { sitemap, SEC_HEADERS } from './_lib/webreels.js';
export async function onRequestGet({ env }) {
  return new Response(await sitemap(env), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=600, s-maxage=600', ...SEC_HEADERS } });
}
