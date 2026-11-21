// kringapp.com/sitemap-ask.xml : every public Ask BKK question with at least one visible answer (0192 kr8_ask_public_list), /q/<id>.
import { askSitemap } from './_lib/askpage.js';
import { SEC_HEADERS } from './_lib/webreels.js';
export async function onRequestGet({ env }) {
  return new Response(await askSitemap(env), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=600, s-maxage=600', ...SEC_HEADERS } });
}
