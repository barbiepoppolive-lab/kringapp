// Supabase Edge Function: social-send (T-210). Posts one Social-queue reply on Reddit. Flow in core.ts; the rails
// themselves are in the DB (0040) and run as the calling admin, so a non-admin session gets KR8_ADMIN_ONLY.
// Secrets (never in the repo): REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_REFRESH_TOKEN, REDDIT_USERNAME. See DEPLOY.md.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { socialSend, type SocialDb } from './core.ts'

const ORIGINS = ['https://kringapp.com', 'https://www.kringapp.com', 'http://localhost:4173', 'http://localhost:5173']
const cors = (o: string | null) => ({
  'Access-Control-Allow-Origin': o && ORIGINS.includes(o) ? o : ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
})

Deno.serve(async (req) => {
  const h = cors(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h })
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...h, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  if (req.method !== 'POST') return json(405, { error: 'METHOD' })
  const auth = req.headers.get('Authorization') || ''
  if (!/^Bearer\s+\S+/.test(auth)) return json(401, { error: 'SIGN_IN' })
  // the caller's own session: every DB call below goes through kr8_is_admin()
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const calls: SocialDb = {
    async prepare(id) {
      const { data, error } = await db.rpc('kr8_admin_social_prepare', { p_id: id, p_mode: 'api' })
      if (error) throw new Error(error.message)
      return data as { text: string; thread_url: string }
    },
    async done(id, url) {
      const { error } = await db.rpc('kr8_admin_social_done', { p_id: id, p_result_url: url })
      if (error) throw new Error(error.message)
    },
    async fail(id, e) {
      await db.rpc('kr8_admin_social_fail', { p_id: id, p_error: e })
    },
  }
  const r = await socialSend(await req.json().catch(() => null), {
    clientId: Deno.env.get('REDDIT_CLIENT_ID') ?? '',
    clientSecret: Deno.env.get('REDDIT_CLIENT_SECRET') ?? '',
    refreshToken: Deno.env.get('REDDIT_REFRESH_TOKEN') ?? '',
    userAgent: `web:com.kringapp.social:1.0 (by /u/${Deno.env.get('REDDIT_USERNAME') ?? 'unknown'})`,
  }, calls, fetch)
  if (r.status !== 200) console.warn('social-send', r.body.error)   // error code only, never tokens or text
  return json(r.status, r.body)
})
