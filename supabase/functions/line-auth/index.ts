// Supabase Edge Function: line-auth (T-205). Sign up / sign in with LINE. Logic in core.ts.
// Two bodies: { code, redirect_uri, code_verifier, nonce } (LINE web login) or { liff_id_token } (LIFF, inside the LINE app).
// Secrets (Edge Function secrets, never in the repo): LINE_LOGIN_CHANNEL_ID, LINE_LOGIN_CHANNEL_SECRET
// (+ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY, which Supabase provides). Deploy: see DEPLOY.md.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { lineAuth, type LineAdmin } from './core.ts'

const ORIGINS = ['https://kringapp.com', 'https://www.kringapp.com', 'http://localhost:4173', 'http://localhost:5173']
const REDIRECTS = ORIGINS.map((o) => `${o}/app/line-callback.html`)

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
})

const admin: LineAdmin = {
  async findLink(sub) {
    const { data, error } = await db.from('kr8_line_links').select('user_id').eq('line_sub', sub).maybeSingle()
    if (error) throw new Error('DB')
    return data?.user_id ?? null
  },
  async findUserByEmail(email) {
    const { data, error } = await db.rpc('kr8_line_user_by_email', { p_email: email })
    if (error) throw new Error('DB')
    return (data as string | null) ?? null
  },
  async createUser(email, meta) {
    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name: meta.name }, app_metadata: { line_sub: meta.line_sub } })
    if (error) throw new Error(/already|exists|registered/i.test(error.message) ? 'EXISTS' : 'AUTH')
    return data.user.id
  },
  async saveLink(sub, userId, name, picture) {
    const { error } = await db.from('kr8_line_links').upsert({ line_sub: sub, user_id: userId, display_name: name || null, picture_url: picture, last_login_at: new Date().toISOString() })
    if (error) throw new Error('DB')
  },
  async userEmail(userId) {
    const { data, error } = await db.auth.admin.getUserById(userId)
    if (error || !data.user.email) throw new Error('AUTH')
    return data.user.email
  },
  async linkOfUser(userId) {
    const { data, error } = await db.from('kr8_line_links').select('line_sub').eq('user_id', userId).maybeSingle()
    if (error) throw new Error('DB')
    return data?.line_sub ?? null
  },
  async noteTaken(userId, otherUserId) {
    await db.rpc('kr8_note_line_taken', { p_user: userId, p_other: otherUserId })
  },
  async magicLinkHash(email) {
    const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email })   // generates only, sends no email
    if (error || !data.properties?.hashed_token) throw new Error('AUTH')
    return data.properties.hashed_token
  },
}

Deno.serve(async (req) => {
  const h = cors(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'METHOD' }), { status: 405, headers: { ...h, 'Content-Type': 'application/json' } })
  const body = await req.json().catch(() => null)
  // 0066 link mode: who is signed in comes from the request's own session token (checked by Supabase Auth), never from the body
  let caller: string | null = null
  if (body && (body as Record<string, unknown>).link === true) {
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const { data } = jwt ? await db.auth.getUser(jwt) : { data: { user: null } }
    caller = data?.user?.id ?? null
  }
  const r = await lineAuth(body, {
    channelId: Deno.env.get('LINE_LOGIN_CHANNEL_ID') ?? '',
    channelSecret: Deno.env.get('LINE_LOGIN_CHANNEL_SECRET') ?? '',
    redirects: REDIRECTS,
  }, admin, fetch, caller)
  if (r.status !== 200) console.warn('line-auth', r.body.error)   // error code only, never tokens
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { ...h, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
})
