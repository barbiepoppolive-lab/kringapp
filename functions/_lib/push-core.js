// Kring web push core (16 Nov): the ding payload, VAPID (RFC 8292) and payload encryption (RFC 8291, aes128gcm), with WebCrypto only,
// so the same file runs in a Cloudflare Pages Function and in Node 20+ (tests). No secrets in this file: keys come in as arguments.
// Not a route (no onRequest export); imported by functions/api/push.js.

const enc = new TextEncoder();

export const b64u = {
  enc(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str) {
    const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};
const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

// ───────── words ─────────
// Thai first, then English. Never: meet, guide, tour, host, creator, reviews, hidden gem, alcohol, gift, wallet, credit, lucky, draw, temples.
export const BANNED = ['meet', 'guide', 'tour', 'host', 'creator', 'reviews', 'hidden gem', 'alcohol', 'gift', 'wallet', 'credit', 'lucky', 'draw', 'temples'];
export const COPY = {
  verified: { title: 'ยืนยันตัวตนแล้ว ✓ · You’re verified', body: 'การ์ดของคุณมีเครื่องหมายยืนยันแล้ว\nYour card now shows the verified tick' },
  reward: { title: 'รางวัลของคุณพร้อมแล้ว 🎉 · Your reward is ready', body: 'แตะเพื่อดูโค้ดของคุณ\nTap to see your code' },
  reel: { title: 'Reel ของคุณขึ้นฟีดแล้ว · Your Reel is live', body: 'ทุกคนบน กริ๊ง! เห็นแล้ว ไปดูกันเลย\nEveryone on Kring can see it now' },
};
export const bannedIn = (text) => {
  const t = String(text || '').toLowerCase();
  return BANNED.filter((w) => new RegExp(`(^|[^a-z])${w}`, 'i').test(t));
};

const APP = '/app/';
/** Only links inside the app. Anything else opens the app home. */
export function safeUrl(u) {
  const s = String(u || '').trim();
  return /^\/app\/[A-Za-z0-9_./?=&%#~+-]*$/.test(s) && s.length <= 300 ? s : APP;
}

/** One outbox row → the JSON the service worker shows. Small on purpose (push services cap payloads at ~4 kB). */
export function buildPayload(row) {
  const kind = row && row.kind;
  const c = COPY[kind];
  const title = String((kind === 'admin' ? row.title : c && c.title) || 'กริ๊ง! · Kring').slice(0, 80);
  const body = String((kind === 'admin' ? row.body : c && c.body) || '').slice(0, 240);
  return { t: title, b: body, u: safeUrl(row && row.url), k: kind || 'admin', id: row && row.msg != null ? String(row.msg) : undefined, tag: `kr-${kind || 'admin'}-${(row && row.msg) ?? ''}` };
}

// ───────── where we send ─────────
const PUSH_HOSTS = /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;
/** Real browser push services only (same list as kr8_push_endpoint_ok in 0059). `extra` is for local tests only. */
export function endpointOk(url, extra = []) {
  const s = String(url || '');
  if (s.length > 1000) return false;
  return PUSH_HOSTS.test(s) || extra.some((o) => s.startsWith(o + '/'));
}

// ───────── VAPID (RFC 8292) ─────────
const keyCache = new Map();
async function vapidKey(pubB64, privB64) {
  const k = pubB64 + '.' + privB64.slice(0, 6);
  if (keyCache.has(k)) return keyCache.get(k);
  const pub = b64u.dec(pubB64);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC must be a 65-byte uncompressed P-256 point');
  const jwk = { kty: 'EC', crv: 'P-256', x: b64u.enc(pub.slice(1, 33)), y: b64u.enc(pub.slice(33, 65)), d: privB64, ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  keyCache.set(k, key);
  return key;
}
export async function vapidAuth(endpoint, vapid, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const head = b64u.enc(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u.enc(enc.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject || 'mailto:ops@kringapp.com' })));
  const key = await vapidKey(vapid.publicKey, vapid.privateKey);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${claims}`));   // raw r||s (64 bytes) = JOSE
  return `vapid t=${head}.${claims}.${b64u.enc(sig)}, k=${vapid.publicKey}`;
}

// ───────── payload encryption (RFC 8291 + RFC 8188 aes128gcm, one record) ─────────
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
export async function encryptPayload(plain, p256dhB64, authB64, opts = {}) {
  const uaPub = b64u.dec(p256dhB64);
  const authSecret = b64u.dec(authB64);
  if (uaPub.length !== 65 || authSecret.length !== 16) throw new Error('bad subscription keys');
  const ua = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const as = opts.asKeys || (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: ua }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, cat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const data = typeof plain === 'string' ? enc.encode(plain) : plain;
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(data, new Uint8Array([2]))));
  const rs = 4096;
  const header = cat(salt, new Uint8Array([(rs >>> 24) & 255, (rs >>> 16) & 255, (rs >>> 8) & 255, rs & 255, 65]), asPub);
  return cat(header, ct);
}

/** Send one push. → { result: 'sent' | 'gone' | 'retry' | 'failed', http } */
export async function sendPush(row, vapid, opts = {}) {
  const f = opts.fetch || fetch;
  if (!endpointOk(row.endpoint, opts.extraOrigins || [])) return { result: 'gone', http: 0 };   // never call a stranger's address
  let body;
  try { body = await encryptPayload(JSON.stringify(buildPayload(row)), row.p256dh, row.auth); } catch { return { result: 'gone', http: 0 }; }
  let res;
  try {
    res = await f(row.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuth(row.endpoint, vapid),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(opts.ttl ?? 24 * 3600),
        Urgency: 'normal',
      },
      body,
    });
  } catch {
    return { result: 'retry', http: 0 };
  }
  const http = res.status;
  if (http >= 200 && http < 300) return { result: 'sent', http };
  if (http === 404 || http === 410) return { result: 'gone', http };
  if (http === 429 || http >= 500) return { result: 'retry', http };
  return { result: 'failed', http };
}

/** Constant-time string compare (the hook secret). */
export function sameSecret(a, b) {
  const x = enc.encode(String(a || '')), y = enc.encode(String(b || ''));
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0 && x.length > 0;
}

// ───────── LINE dings (Messaging API push from the Kring OA) ─────────
/** The LINE text: title, body, then the link into the app. */
export function lineText(row) {
  const p = buildPayload(row);
  return `${p.t}\n${p.b}\n\nhttps://kringapp.com${p.u}`.slice(0, 1000);
}
/** Same outbox row → the same retry key on every try, so LINE never delivers one ding twice (409 = already sent). */
export const lineRetryKey = (id) => `00000000-0000-4000-8000-${String(Number(id) || 0).padStart(12, '0').slice(-12)}`;
/** → { result: 'sent' | 'notfriend' | 'retry' | 'failed', http } */
export async function sendLine(row, token, opts = {}) {
  const f = opts.fetch || fetch;
  if (!token) return { result: 'failed', http: 0 };
  if (!/^U[0-9a-f]{32}$/.test(String(row.line_to || ''))) return { result: 'failed', http: 0 };
  let res;
  try {
    res = await f('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Line-Retry-Key': lineRetryKey(row.id) },
      body: JSON.stringify({ to: row.line_to, messages: [{ type: 'text', text: lineText(row) }] }),
    });
  } catch {
    return { result: 'retry', http: 0 };
  }
  const http = res.status;
  if (http === 200 || http === 409) return { result: 'sent', http };
  if (http === 400 || http === 403) return { result: 'notfriend', http };   // not a friend of the OA, or blocked it
  if (http === 429 || http >= 500) return { result: 'retry', http };       // 429 also = monthly message limit reached
  return { result: 'failed', http };                                       // 401 = wrong token
}

/** Supabase REST headers: both, like supabase-js does for every key type (legacy JWT service key or the new sb_secret_ key). */
export const sbHeaders = (key) => ({ apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' });
