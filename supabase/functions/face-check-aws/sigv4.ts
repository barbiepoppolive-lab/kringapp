// AWS Signature Version 4 for one JSON POST (Rekognition), with fetch + Web Crypto only: no AWS SDK, nothing to download.
// Works in Deno (the edge function) and in Node/vitest (src/v8/faceAws.test.ts checks it against AWS's own test vector).

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
const bytes = (s: string) => enc.encode(s) as unknown as ArrayBuffer;
async function sha256(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', bytes(s)));
}
async function hmac(key: ArrayBuffer, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, bytes(msg));
}
const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export interface SignInput {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  now?: Date;
}

/** the headers to send (lower-case names, without host: fetch sets it), including x-amz-date and authorization */
export async function signV4(i: SignInput): Promise<Record<string, string>> {
  const u = new URL(i.url);
  const amzDate = (i.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(i.headers)) h[k.toLowerCase()] = String(v).trim().replace(/\s+/g, ' ');
  h['host'] = u.host;
  h['x-amz-date'] = amzDate;
  if (i.sessionToken) h['x-amz-security-token'] = i.sessionToken;
  const names = Object.keys(h).sort();
  const query = [...u.searchParams.entries()].map(([k, v]) => [rfc3986(k), rfc3986(v)]).sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`).join('&');
  const path = u.pathname || '/';
  const canonical = [i.method.toUpperCase(), path, query, names.map((k) => `${k}:${h[k]}\n`).join(''), names.join(';'), await sha256(i.body)].join('\n');
  const scope = `${day}/${i.region}/${i.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonical)].join('\n');
  let key = await hmac(bytes('AWS4' + i.secretAccessKey), day);
  key = await hmac(key, i.region);
  key = await hmac(key, i.service);
  key = await hmac(key, 'aws4_request');
  const sig = hex(await hmac(key, toSign));
  const out: Record<string, string> = { ...h };
  delete out['host'];
  out['authorization'] = `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${sig}`;
  return out;
}
