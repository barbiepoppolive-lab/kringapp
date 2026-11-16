// line-auth core (T-205): LINE Login code → verified LINE id_token → Kring auth user → one-time sign-in token_hash.
// LIFF (one-tap inside the LINE app): the app sends { liff_id_token } from liff.getIDToken(); LINE's verify endpoint checks
// it against the same LINE Login channel the LIFF app belongs to, then the same user lookup / creation / token_hash runs.
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
  /** 0066 link mode: the LINE linked to this Kring user now, if any */
  linkOfUser?(userId: string): Promise<string | null>
  /** 0066 link mode: this LINE already belongs to another Kring account (stored as an admin-only "same LINE" link) */
  noteTaken?(userId: string, otherUserId: string): Promise<void>
}
export type LineResult =
  | { status: 200; body: { token_hash: string; name: string; picture: string | null; new_user: boolean; /** 0066 link mode: no sign-in, token_hash is '' */ linked?: true } }
  | { status: 400 | 401 | 409 | 500; body: { error: string } }

const SUB = /^U[0-9a-f]{32}$/
const fail = (status: 400 | 401 | 409 | 500, error: string): LineResult => ({ status, body: { error } })

export function placeholderEmail(sub: string): string {
  return `line_${sub.toLowerCase()}@users.kringapp.com`
}

type LineClaims = { iss?: string; aud?: string; sub?: string; name?: string; picture?: string; email?: string }
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/

/** LINE checks the id_token signature, expiry and audience (and our nonce when one was sent). */
async function verifyIdToken(idToken: string, channelId: string, nonce: string | null, fetchFn: typeof fetch): Promise<LineClaims | null> {
  try {
    const form: Record<string, string> = { id_token: idToken, client_id: channelId }
    if (nonce) form.nonce = nonce
    const r = await fetchFn('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    })
    const p = (await r.json().catch(() => ({}))) as LineClaims
    if (!r.ok) return null
    if (p.iss !== 'https://access.line.me' || p.aud !== channelId || typeof p.sub !== 'string' || !SUB.test(p.sub)) return null
    return p
  } catch {
    return null
  }
}

/**
 * caller (0066 link mode): the Kring user id from the request's own session token, checked by index.ts.
 * Body { link: true, ... } adds the LINE account to that user instead of signing in: no new account, no token_hash.
 */
export async function lineAuth(raw: unknown, env: LineEnv, admin: LineAdmin, fetchFn: typeof fetch, caller: string | null = null): Promise<LineResult> {
  if (!env.channelId) return fail(500, 'LINE_OFF')
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const link = b.link === true
  if (link && !caller) return fail(401, 'LINE_SIGN_IN')
  const done = (p: LineClaims) => (link ? linkTo(p, caller as string, admin) : signIn(p, admin))
  // LIFF path: the LINE app already signed the member in; no code, no secret, no redirect
  if ('liff_id_token' in b) {
    const t = typeof b.liff_id_token === 'string' ? b.liff_id_token : ''
    if (!t || t.length > 4096 || !JWT.test(t)) return fail(400, 'LINE_BAD_REQUEST')
    const p = await verifyIdToken(t, env.channelId, null, fetchFn)
    if (!p) return fail(401, 'LINE_VERIFY')
    return done(p)
  }
  if (!env.channelSecret) return fail(500, 'LINE_OFF')
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
  const p = await verifyIdToken(idToken, env.channelId, nonce, fetchFn)
  if (!p) return fail(401, 'LINE_VERIFY')
  return done(p)
}

/** 0066: LINE → the signed-in Kring user. Never creates an account and never moves a LINE from one account to another. */
async function linkTo(p: LineClaims, userId: string, admin: LineAdmin): Promise<LineResult> {
  const sub = p.sub as string
  const name = (typeof p.name === 'string' ? p.name : '').trim().slice(0, 100)
  const picture = typeof p.picture === 'string' && /^https:\/\//.test(p.picture) && p.picture.length <= 500 ? p.picture : null
  try {
    const owner = await admin.findLink(sub)
    if (owner && owner !== userId) {
      await admin.noteTaken?.(userId, owner).catch(() => undefined)
      return fail(409, 'LINE_TAKEN')
    }
    const mine = admin.linkOfUser ? await admin.linkOfUser(userId) : null
    if (mine && mine !== sub) return fail(409, 'LINE_OTHER')
    await admin.saveLink(sub, userId, name, picture)
    return { status: 200, body: { token_hash: '', name, picture, new_user: false, linked: true } }
  } catch {
    return fail(500, 'LINE_SERVER')
  }
}

/** Verified LINE claims → Kring user → one-time token_hash (shared by the web-login and LIFF paths). */
async function signIn(p: LineClaims, admin: LineAdmin): Promise<LineResult> {
  const sub = p.sub as string
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
