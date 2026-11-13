// line-auth core (T-205): LINE Login code → verified LINE id_token → Kring auth user → one-time sign-in token_hash.
// Pure logic: the Deno entry (index.ts) passes in the env, the admin helpers and fetch, so this runs under vitest too.
// Never logs or returns LINE tokens. The app turns token_hash into a normal Supabase session with verifyOtp.

export interface LineEnv {
  channelId: string
  channelSecret: string
  /** exact LINE callback URLs this function accepts (must also be registered on the LINE channel) */
  redirects: string[]
}
export interface LineAdmin {
  findLink(sub: string): Promise<string | null>
  findUserByEmail(email: string): Promise<string | null>
  /** throws Error('EXISTS') when the email is already taken */
  createUser(email: string, meta: { line_sub: string; name: string }): Promise<string>
  saveLink(sub: string, userId: string, name: string, picture: string | null): Promise<void>
  userEmail(userId: string): Promise<string>
  magicLinkHash(email: string): Promise<string>
}
export type LineResult =
  | { status: 200; body: { token_hash: string; name: string; picture: string | null; new_user: boolean } }
  | { status: 400 | 401 | 500; body: { error: string } }

const SUB = /^U[0-9a-f]{32}$/
const fail = (status: 400 | 401 | 500, error: string): LineResult => ({ status, body: { error } })

export function placeholderEmail(sub: string): string {
  return `line_${sub.toLowerCase()}@users.kringapp.com`
}

export async function lineAuth(raw: unknown, env: LineEnv, admin: LineAdmin, fetchFn: typeof fetch): Promise<LineResult> {
  if (!env.channelId || !env.channelSecret) return fail(500, 'LINE_OFF')
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const code = typeof b.code === 'string' ? b.code : ''
  const redirect = typeof b.redirect_uri === 'string' ? b.redirect_uri : ''
  const verifier = typeof b.code_verifier === 'string' ? b.code_verifier : ''
  const nonce = typeof b.nonce === 'string' ? b.nonce : ''
  if (!code || code.length > 512 || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) return fail(400, 'LINE_BAD_REQUEST')
  if (!env.redirects.includes(redirect)) return fail(400, 'LINE_REDIRECT')

  // 1. code → id_token (PKCE)
  let idToken = ''
  try {
    const r = await fetchFn('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: env.channelId,
        client_secret: env.channelSecret, code_verifier: verifier }).toString(),
    })
    const j = (await r.json().catch(() => ({}))) as { id_token?: string }
    if (!r.ok || typeof j.id_token !== 'string') return fail(401, 'LINE_TOKEN')
    idToken = j.id_token
  } catch {
    return fail(401, 'LINE_TOKEN')
  }

  // 2. LINE checks the id_token signature, expiry, audience and our nonce
  let p: { iss?: string; aud?: string; sub?: string; name?: string; picture?: string; email?: string }
  try {
    const r = await fetchFn('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: env.channelId, nonce }).toString(),
    })
    p = (await r.json().catch(() => ({}))) as typeof p
    if (!r.ok) return fail(401, 'LINE_VERIFY')
  } catch {
    return fail(401, 'LINE_VERIFY')
  }
  if (p.iss !== 'https://access.line.me' || p.aud !== env.channelId || typeof p.sub !== 'string' || !SUB.test(p.sub)) return fail(401, 'LINE_VERIFY')
  const sub = p.sub
  const name = (typeof p.name === 'string' ? p.name : '').trim().slice(0, 100)
  const picture = typeof p.picture === 'string' && /^https:\/\//.test(p.picture) && p.picture.length <= 500 ? p.picture : null
  const email = typeof p.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email) ? p.email.trim().toLowerCase() : null

  // 3. LINE account → Kring user: known link, else the same email's account (LINE only shares an email the member
  //    verified with LINE), else a new user (placeholder email when no email was shared)
  try {
    let userId = await admin.findLink(sub)
    let created = false
    if (!userId && email) userId = await admin.findUserByEmail(email)
    if (!userId) {
      const addr = email || placeholderEmail(sub)
      try {
        userId = await admin.createUser(addr, { line_sub: sub, name })
        created = true
      } catch (e) {
        if ((e as Error).message !== 'EXISTS') throw e
        userId = await admin.findUserByEmail(addr)   // a second tap raced us
        if (!userId) throw e
      }
    }
    await admin.saveLink(sub, userId, name, picture)
    const hash = await admin.magicLinkHash(await admin.userEmail(userId))
    return { status: 200, body: { token_hash: hash, name, picture, new_user: created } }
  } catch {
    return fail(500, 'LINE_SERVER')
  }
}
