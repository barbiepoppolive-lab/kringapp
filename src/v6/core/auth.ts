/* Real sign-in for Kring v6 through Supabase Auth (REST, no extra library).
   - Email or phone: a 6-digit code (POST /auth/v1/otp, then /auth/v1/verify).
   - Google, Apple, Facebook, Kakao: the provider's page, then back to the app with the session in the URL.
   - Without VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY the app stays in preview mode: nothing leaves the phone.
   The session is kept in localStorage and refreshed before it expires; api.ts gets the access token. */
import { setSession } from './api'

const env = (import.meta.env ?? {}) as Record<string, string | undefined>
const URL_ = env.VITE_SUPABASE_URL?.trim() || ''
const ANON = env.VITE_SUPABASE_ANON_KEY?.trim() || ''
const KEY = 'kring-auth'

export interface AuthUser { id: string; email?: string; phone?: string; provider?: string; name?: string }
interface Session { access_token: string; refresh_token: string; expires_at: number; user: AuthUser }

/** Social sign-ins Supabase supports out of the box (turned on in the Supabase dashboard). Others fall back to phone/email. */
export const OAUTH: Record<string, string> = { Apple: 'apple', Google: 'google', Facebook: 'facebook', Kakao: 'kakao' }

let session: Session | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

export const configured = (): boolean => !!(URL_ && ANON)
/** Preview build (no backend at all). Always false when VITE_SUPABASE_URL is set, even while signed out or if the
    anon key is missing, so preview-only hints and stand-ins can never appear in a live build. */
export const previewOnly = (): boolean => !URL_
export const currentUser = (): AuthUser | null => session?.user ?? null
export const accessToken = (): string => session?.access_token ?? ''
export function onAuth(f: () => void): () => void { listeners.add(f); return () => listeners.delete(f) }

export class AuthError extends Error {}

async function call<T>(path: string, body?: unknown, bearer?: string): Promise<T> {
  const r = await fetch(`${URL_}/auth/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new AuthError(String((j as { msg?: string; error_description?: string; message?: string }).msg
    || (j as { error_description?: string }).error_description || (j as { message?: string }).message || r.status))
  return j as T
}

interface RawUser { id: string; email?: string; phone?: string; app_metadata?: { provider?: string }; user_metadata?: { full_name?: string; name?: string } }
const toUser = (u: RawUser): AuthUser => ({
  id: u.id, email: u.email || undefined, phone: u.phone || undefined,
  provider: u.app_metadata?.provider, name: u.user_metadata?.full_name || u.user_metadata?.name,
})

function save(s: Session | null): void {
  session = s
  setSession(s?.access_token ?? '')
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY) } catch { /* private mode */ }
  clearTimeout(timer)
  if (s) timer = setTimeout(() => { void refresh() }, Math.max(10_000, (s.expires_at - 60) * 1000 - Date.now()))
  listeners.forEach((f) => f())
}

async function fromTokens(access: string, refresh_: string, expiresIn: number): Promise<void> {
  const u = await call<RawUser>('user', undefined, access)
  save({ access_token: access, refresh_token: refresh_, expires_at: Math.floor(Date.now() / 1000) + expiresIn, user: toUser(u) })
}

async function refresh(): Promise<void> {
  if (!session) return
  try {
    const j = await call<{ access_token: string; refresh_token: string; expires_in: number; user: RawUser }>(
      'token?grant_type=refresh_token', { refresh_token: session.refresh_token })
    save({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + j.expires_in, user: toUser(j.user) })
  } catch { save(null) }
}

/** Call once before the app renders: restores the saved session, or picks up the one a social sign-in sent back. */
export async function initAuth(): Promise<void> {
  if (!configured()) return
  const h = new URLSearchParams(location.hash.slice(1))
  if (h.get('access_token')) {
    try {
      await fromTokens(h.get('access_token')!, h.get('refresh_token') || '', Number(h.get('expires_in') || 3600))
    } catch {
      /* show sign-in again */
    } finally {
      try { history.replaceState(null, '', location.pathname + location.search + '#signup') } catch { /* ignore */ }
    }
    return
  }
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Session
      if (s.expires_at * 1000 > Date.now() + 30_000) save(s)
      else { session = s; await refresh() }
    }
  } catch { /* start signed out */ }
}

/** Send a 6-digit code by email or SMS (phone in +66… / +91… form). */
export async function sendCode(to: { email?: string; phone?: string }): Promise<void> {
  await call('otp', { ...to, create_user: true })
}

export async function verifyCode(to: { email?: string; phone?: string }, token: string): Promise<AuthUser> {
  const j = await call<{ access_token: string; refresh_token: string; expires_in: number; user: RawUser }>(
    'verify', { ...to, token, type: to.email ? 'email' : 'sms' })
  save({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + j.expires_in, user: toUser(j.user) })
  return toUser(j.user)
}

/** Leave the app for the provider's sign-in page; initAuth() finishes the job when it comes back. */
export function signInWith(provider: string): boolean {
  const p = OAUTH[provider]
  if (!configured() || !p) return false
  const back = location.origin + location.pathname
  location.href = `${URL_}/auth/v1/authorize?provider=${p}&redirect_to=${encodeURIComponent(back)}`
  return true
}

/** Sign out here, or everywhere (all phones and browsers) with everywhere = true. */
export async function signOut(everywhere = false): Promise<void> {
  const tok = session?.access_token
  save(null)
  if (configured() && tok) { try { await call(`logout?scope=${everywhere ? 'global' : 'local'}`, {}, tok) } catch { /* already gone */ } }
}

/** After the account is deleted on the server, forget the session without calling logout. */
export function forget(): void { save(null) }
