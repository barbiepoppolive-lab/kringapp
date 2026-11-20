// Supabase Edge Function: founder-ghost (20 Nov). Backs the founder's permanent bookmark kringapp.com/app/?me=ghost.
// It can only ever email ONE account: member #117 (the founder's ghost card). The address is looked up in the database
// (kr8_founder_ghost_gate, 0180, service_role only) and never leaves this function.
//   { action: 'send' }                 → Supabase auth emails #117 a sign-in code (/otp, create_user false). Max 3 per 24 h.
//   { action: 'verify', code: '123456' } → checks the code for #117 (/verify). Max 10 tries per 24 h. Returns the session
//                                          (access + refresh token) so the bookmark's own browser stays signed in.
// No secrets of its own: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are provided by Supabase.
// Deploy with JWT verification OFF (the app calls it before anyone is signed in, with the publishable key).

const ORIGINS = ['https://kringapp.com', 'https://www.kringapp.com', 'http://localhost:4173', 'http://localhost:5173']
const RETURN_TO = 'https://kringapp.com/app/?me=ghost'
const URL_ = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? SERVICE

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

/** kr8_founder_ghost_gate: logs the attempt and returns #117's email, or throws 'LIMIT' / 'NO_FOUNDER' / 'DB'. */
async function gate(kind: 'send' | 'verify'): Promise<string> {
  const r = await fetch(`${URL_}/rest/v1/rpc/kr8_founder_ghost_gate`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_kind: kind }),
  })
  const t = await r.text()
  if (!r.ok) {
    const m = t.match(/KR8_([A-Z_]+)/)
    throw new Error(m ? m[1] : 'DB')
  }
  const email = JSON.parse(t)
  if (typeof email !== 'string' || !email.includes('@')) throw new Error('NO_FOUNDER')
  return email
}

Deno.serve(async (req) => {
  const h = { ...cors(req.headers.get('origin')), 'content-type': 'application/json', 'cache-control': 'no-store' }
  const out = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: h })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h })
  if (req.method !== 'POST') return out(405, { error: 'METHOD' })
  let body: { action?: string; code?: string } = {}
  try { body = await req.json() } catch { return out(400, { error: 'BAD' }) }
  try {
    if (body.action === 'send') {
      const email = await gate('send')
      const r = await fetch(`${URL_}/auth/v1/otp?redirect_to=${encodeURIComponent(RETURN_TO)}`, {
        method: 'POST',
        headers: { apikey: ANON, 'content-type': 'application/json' },
        body: JSON.stringify({ email, create_user: false }),
      })
      if (r.status === 429) return out(429, { error: 'RATE' })
      if (!r.ok) return out(502, { error: 'SEND' })
      return out(200, { ok: true })
    }
    if (body.action === 'verify') {
      const code = String(body.code ?? '').trim()
      if (!/^\d{6,10}$/.test(code)) return out(400, { error: 'BAD_CODE' })
      const email = await gate('verify')
      const r = await fetch(`${URL_}/auth/v1/verify`, {
        method: 'POST',
        headers: { apikey: ANON, 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'email', email, token: code }),
      })
      const j = await r.json().catch(() => null) as { access_token?: string; refresh_token?: string } | null
      if (!r.ok || !j?.access_token || !j?.refresh_token) return out(r.status === 429 ? 429 : 401, { error: r.status === 429 ? 'RATE' : 'BAD_CODE' })
      return out(200, { access_token: j.access_token, refresh_token: j.refresh_token })
    }
    return out(400, { error: 'BAD' })
  } catch (e) {
    const code = String((e as Error)?.message || 'DB')
    return out(code === 'LIMIT' ? 429 : 500, { error: code === 'LIMIT' ? 'LIMIT' : 'SERVER' })
  }
})
