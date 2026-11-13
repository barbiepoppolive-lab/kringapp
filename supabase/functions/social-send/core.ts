// social-send core (T-210): one queued reply → rails checked + slot reserved in the DB → posted on Reddit with the
// founder's own account (OAuth refresh token, "submit" scope) → result link stored. Any failure frees the slot again.
// Pure logic: index.ts passes the env, the DB calls (made as the signed-in admin) and fetch, so vitest can run it.

export interface RedditEnv { clientId: string; clientSecret: string; refreshToken: string; userAgent: string }
export interface SocialDb {
  /** kr8_admin_social_prepare(id, 'api'): checks every rail, reserves the slot, returns the exact text */
  prepare(id: string): Promise<{ text: string; thread_url: string }>
  done(id: string, resultUrl: string): Promise<void>
  fail(id: string, error: string): Promise<void>
}
export type SendResult = { status: number; body: { result_url?: string; error?: string } }

/** https://www.reddit.com/r/Bangkok/comments/abc123/title/ → t3_abc123 */
export function threadFullname(url: string): string | null {
  const m = /^https:\/\/(?:www\.|old\.|new\.)?reddit\.com\/r\/[A-Za-z0-9_]{2,21}\/comments\/([a-z0-9]{3,12})(?:\/|$)/.exec(url)
  return m ? `t3_${m[1]}` : null
}

export async function socialSend(raw: unknown, env: RedditEnv, db: SocialDb, fetchFn: typeof fetch): Promise<SendResult> {
  const id = raw && typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string' ? (raw as { id: string }).id : ''
  if (!/^[0-9a-f-]{36}$/.test(id)) return { status: 400, body: { error: 'BAD_REQUEST' } }
  if (!env.clientId || !env.clientSecret || !env.refreshToken) return { status: 503, body: { error: 'REDDIT_OFF' } }   // before any slot is used

  let card: { text: string; thread_url: string }
  try {
    card = await db.prepare(id)
  } catch (e) {
    const code = (String((e as Error)?.message).match(/KR8_[A-Z_]+/) || ['PREPARE'])[0]
    return { status: code === 'KR8_ADMIN_ONLY' ? 403 : 409, body: { error: code } }
  }
  const failWith = async (status: number, error: string): Promise<SendResult> => {
    await db.fail(id, error).catch(() => undefined)
    return { status, body: { error } }
  }
  const thing = threadFullname(card.thread_url)
  if (!thing) return failWith(400, 'BAD_THREAD')

  let token = ''
  try {
    const r = await fetchFn('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(`${env.clientId}:${env.clientSecret}`), 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': env.userAgent },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env.refreshToken }).toString(),
    })
    const j = (await r.json().catch(() => ({}))) as { access_token?: string; scope?: string }
    if (!r.ok || !j.access_token) return failWith(502, `REDDIT_AUTH_${r.status}`)
    if (j.scope && !/\bsubmit\b/.test(j.scope)) return failWith(502, 'REDDIT_NO_SUBMIT_SCOPE')
    token = j.access_token
  } catch {
    return failWith(502, 'REDDIT_AUTH_NETWORK')
  }

  try {
    const r = await fetchFn('https://oauth.reddit.com/api/comment', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': env.userAgent },
      body: new URLSearchParams({ api_type: 'json', thing_id: thing, text: card.text }).toString(),
    })
    const j = (await r.json().catch(() => ({}))) as { json?: { errors?: unknown[][]; data?: { things?: { data?: { permalink?: string } }[] } } }
    const errs = j.json?.errors || []
    const permalink = j.json?.data?.things?.[0]?.data?.permalink
    if (!r.ok || errs.length || !permalink) {
      const first = Array.isArray(errs[0]) ? String(errs[0][0]) : `HTTP_${r.status}`
      return failWith(502, `REDDIT_${first}`.slice(0, 80))
    }
    const url = `https://www.reddit.com${permalink}`
    await db.done(id, url)
    return { status: 200, body: { result_url: url } }
  } catch {
    return failWith(502, 'REDDIT_NETWORK')
  }
}
