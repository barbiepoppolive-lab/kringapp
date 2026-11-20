// kringapp.com/q/ok : the "a real person saw it" beacon for an Ask BKK answer link (/q/<short>, 0185). Same as /r/ok: the page
// posts once after 2 seconds of VISIBLE time; this re-derives the same network hashes, reads the kr_qsid cookie set by /q/<short>,
// and the SAME database function kr8_share_open_confirm decides (other browser / network, too fast, webdriver, own phone,
// repeats, bursts). Always 204. No IP address is stored, only one-way hashes.
import { ipRange } from '../_lib/opennet.js';
const SUPA = 'https://pedxoxpammnyfnizljyj.supabase.co';
const ANON = 'sb_publishable_SaAf7mILfPPpCeAEvj79bA_Vz8JnCBN';   // public key, the same one the app ships
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const done = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });

export async function onRequestPost({ request, env }) {
  const key = env.SHARE_OPEN_KEY || '';
  if (!key) return done();
  try {
    const url = new URL(request.url);
    const origin = request.headers.get('origin') || '';
    if (origin && origin !== url.origin) return done();
    const raw = await request.text();
    if (raw.length > 600) return done();
    const b = JSON.parse(raw || '{}');
    const open = String(b.o || '');
    if (!/^[0-9a-f-]{36}$/.test(open)) return done();
    const m = /(?:^|;\s*)kr_qsid=([A-Za-z0-9-]{16,64})/.exec(request.headers.get('cookie') || '');
    if (!m) return done();
    const ip = request.headers.get('cf-connecting-ip') || '';
    const net = ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip;
    const device = await sha(`${key}|${net}`);
    const range = await sha(`${key}|range|${ipRange(ip)}`);
    const did = typeof b.d === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(b.d) ? b.d : null;
    const sig = { wd: b.wd === 0 ? '0' : '1', vis: Math.max(0, Math.min(600000, Number(b.v) || 0)), tz: String(b.tz || '').slice(0, 40), sw: Number(b.sw) || 0, tch: b.t ? 1 : 0 };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    await fetch(`${SUPA}/rest/v1/rpc/kr8_share_open_confirm`, {
      method: 'POST', signal: ctl.signal,
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_open: open, p_session: m[1], p_device: device, p_range: range, p_did: did,
        p_ua: (request.headers.get('user-agent') || '').slice(0, 300), p_sig: sig, p_key: key }),
    });
    clearTimeout(timer);
  } catch { /* never an error to the page */ }
  return done();
}
