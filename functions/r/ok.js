// kringapp.com/r/ok : the "a real person saw it" beacon for a share-link open (0182, 20 Nov).
// /r/<short> stores the open as 'pending'. The app (src/v8/openBeacon.ts) posts here once the page has been VISIBLE for 2 seconds.
// This function re-derives the same network hash as /r/<short> from the visitor's IP, reads the same kr_sid cookie, and asks the
// database (kr8_share_open_confirm, needs SHARE_OPEN_KEY) to count it. The database refuses: another browser or network, too fast,
// too late, webdriver/headless, robot names, the Reel owner's own phone (or a linked account's), repeats, and bursts.
// Always answers 204, so a script learns nothing from the reply. No IP address is stored, only one-way hashes.
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
    if (origin && origin !== url.origin) return done();   // only the Kring page itself sends this
    const raw = await request.text();
    if (raw.length > 600) return done();
    const b = JSON.parse(raw || '{}');
    const open = String(b.o || '');
    if (!/^[0-9a-f-]{36}$/.test(open)) return done();
    const m = /(?:^|;\s*)kr_sid=([A-Za-z0-9-]{16,64})/.exec(request.headers.get('cookie') || '');
    if (!m) return done();   // no cookie from the link → cannot be the same browser
    const ip = request.headers.get('cf-connecting-ip') || '';
    const net = ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip;
    const device = await sha(`${key}|${net}`);
    const range = await sha(`${key}|range|${ipRange(ip)}`);
    const did = typeof b.d === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(b.d) ? b.d : null;
    const sig = { wd: b.wd === 0 ? '0' : '1', vis: Math.max(0, Math.min(600000, Number(b.v) || 0)), tz: String(b.tz || '').slice(0, 40),
      sw: Number(b.sw) || 0, tch: b.t ? 1 : 0 };
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
