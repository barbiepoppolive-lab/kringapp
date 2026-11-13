import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { usePresence, readPresence } from './presence'
import { getPlanStore, usePlanStore, type PlanStoreState } from '../lib/planStore'

/**
 * Kring auth · one account, one app, persistent sign-in per device.
 *
 *  • KRING T3 · no modes: there is no Traveller / Local / Agency switch in the UI. Everyone gets the same header, dock
 *    and 4 tabs; content follows activity. `session.role` is kept for back-compat only (stored sessions, the Agency
 *    Portal door, older tests). "Hosting" is DERIVED (`isHosting` / `useHosting`): you host when you have listed an
 *    experience or have requests / bookings as the local — never because a role was picked.
 *
 *  • Stay signed in (default ON): the session lives in localStorage, so opening Kring lands straight on Experiences
 *    until "Log out of this device" (My profile → Settings). OFF keeps it in sessionStorage (ends when the app closes).
 *  • No role question at sign-in: every new account starts as `guest`. `setRole` stays for back-compat callers only.
 *    The Agency Portal door is a business login and still signs in as Agency.
 *  • The session ends when the password or phone number changes: dispatch `CREDENTIALS_CHANGED_EVENT` (the backend
 *    stop-point does this on a credential change) or call `endSessionForCredentialChange()`.
 *  • A logout in another tab ends this tab's session too (storage event).
 *  • Payouts still ask for the PIN — staying signed in never skips confirming money (wallet owns that).
 */

export type AuthRole = 'guest' | 'host' | 'agency'

export type LoginProvider = 'line' | 'google' | 'agency'

export interface AuthSession {
  userId: string
  provider: LoginProvider
  role: AuthRole
  displayName: string
  ageConfirmedAt: string | null
  conductAcceptedAt: string | null
  isDemoMode?: boolean
  /** when this device signed in (shown as "Signed in on this phone since 21 Oct") */
  signedInAt?: string
}

export interface SignInInput {
  provider: LoginProvider
  role?: AuthRole
  displayName?: string
  userId?: string
  isDemoMode?: boolean
}

/** Kring: no role question at sign-in — LINE / Google / Apple / email all start as Traveller; the Agency Portal is a
 *  separate business door. Switch roles later in My profile. */
export const ROLE_BY_PROVIDER: Record<LoginProvider, AuthRole> = {
  line: 'guest',
  google: 'guest',
  agency: 'agency',
}

export const ROLE_LABELS: Record<AuthRole, string> = {
  guest: 'Traveller',
  host: 'Local',
  agency: 'Agency',
}

export const ROLE_LABELS_TH: Record<AuthRole, string> = {
  guest: 'ผู้จอง',
  host: 'โลคอล',
  agency: 'เอเจนซี',
}

export const PROVIDER_LABELS: Record<LoginProvider, string> = {
  line: 'LINE',
  google: 'Google 1-Tap',
  agency: 'Agency Portal',
}

export const DEMO_TRAVELER_SESSION: AuthSession = {
  userId: 'demo-traveler',
  provider: 'google',
  role: 'guest',
  displayName: 'Demo Traveler',
  ageConfirmedAt: '2026-10-14T00:00:00.000Z',
  conductAcceptedAt: '2026-10-14T00:00:00.000Z',
  isDemoMode: true,
}

export const AUTH_STORAGE_KEY = 'chon_auth_session_v1'
/** '0' = do not stay signed in on this device (session kept in sessionStorage only). Default: stay signed in. */
export const STAY_SIGNED_IN_KEY = 'kring_stay_signed_in_v1'
export const CREDENTIALS_CHANGED_EVENT = 'kring:credentials-changed'

export function readStaySignedIn(): boolean {
  try {
    return window.localStorage.getItem(STAY_SIGNED_IN_KEY) !== '0'
  } catch {
    return true
  }
}

function persistSession(session: AuthSession | null, stay: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY)
    if (!session) return
    ;(stay ? window.localStorage : window.sessionStorage).setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // ignore storage errors
  }
}

interface AuthState {
  session: AuthSession | null
  ageConfirmedAt: string | null
  conductAcceptedAt: string | null
}

export interface AuthContextValue {
  session: AuthSession | null
  role: AuthRole | null
  ageConfirmedAt: string | null
  conductAcceptedAt: string | null
  isAgeConfirmed: boolean
  isConductAccepted: boolean
  isGateComplete: boolean
  canProceed: boolean
  signIn: (input: SignInInput) => void
  confirmAge20Plus: () => void
  acceptCodeOfConduct: () => void
  signOut: () => void
  /** back-compat only (KRING T3: no role switch UI) — prefer `useHosting()` for "does this person host?" */
  setRole: (role: AuthRole) => void
  /** Settings → "Log out of this device" (same as signOut, named for the UI) */
  logOutDevice: () => void
  staySignedIn: boolean
  setStaySignedIn: (stay: boolean) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readStoredSession(): AuthSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY) ?? window.sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthSession
    if (parsed && typeof parsed.userId === 'string' && typeof parsed.role === 'string') {
      return parsed
    }
  } catch {
    // ignore storage errors
  }
  return null
}

function createInitialState(initialSession?: AuthSession | null): AuthState {
  const resolved = initialSession !== undefined ? initialSession : readStoredSession()
  return {
    session: resolved,
    ageConfirmedAt: resolved?.ageConfirmedAt ?? null,
    conductAcceptedAt: resolved?.conductAcceptedAt ?? null,
  }
}

export function AuthProvider({
  children,
  initialSession,
}: {
  children: ReactNode
  initialSession?: AuthSession | null
}) {
  const [state, setState] = useState<AuthState>(() => createInitialState(initialSession))
  const [staySignedIn, setStayState] = useState<boolean>(() => (typeof window === 'undefined' ? true : readStaySignedIn()))

  const confirmAge20Plus = useCallback(() => {
    setState((prev) => {
      if (prev.ageConfirmedAt) return prev
      const now = new Date().toISOString()
      return {
        ...prev,
        ageConfirmedAt: now,
        session: prev.session ? { ...prev.session, ageConfirmedAt: now } : prev.session,
      }
    })
  }, [])

  const acceptCodeOfConduct = useCallback(() => {
    setState((prev) => {
      if (prev.conductAcceptedAt) return prev
      const now = new Date().toISOString()
      return {
        ...prev,
        conductAcceptedAt: now,
        session: prev.session ? { ...prev.session, conductAcceptedAt: now } : prev.session,
      }
    })
  }, [])

  const signIn = useCallback((input: SignInInput) => {
    setState((prev) => {
      const now = new Date().toISOString()
      const ageConfirmedAt = prev.ageConfirmedAt ?? now
      const conductAcceptedAt = prev.conductAcceptedAt ?? now
      const role = input.role ?? ROLE_BY_PROVIDER[input.provider]
      const nextSession: AuthSession = {
        userId: input.userId ?? `${input.provider}-${role}`,
        provider: input.provider,
        role,
        displayName: input.displayName ?? ROLE_LABELS[role],
        ageConfirmedAt,
        conductAcceptedAt,
        isDemoMode: input.isDemoMode ?? false,
        signedInAt: now,
      }
      persistSession(nextSession, typeof window === 'undefined' ? true : readStaySignedIn())

      return {
        ageConfirmedAt,
        conductAcceptedAt,
        session: nextSession,
      }
    })
  }, [])

  const signOut = useCallback(() => {
    persistSession(null, true)
    setState({ session: null, ageConfirmedAt: null, conductAcceptedAt: null })
  }, [])

  const setRole = useCallback((role: AuthRole) => {
    setState((prev) => {
      if (!prev.session || prev.session.role === role) return prev
      const session: AuthSession = { ...prev.session, role }
      persistSession(session, typeof window === 'undefined' ? true : readStaySignedIn())
      return { ...prev, session }
    })
  }, [])

  const setStaySignedIn = useCallback((stay: boolean) => {
    try {
      window.localStorage.setItem(STAY_SIGNED_IN_KEY, stay ? '1' : '0')
    } catch {
      // ignore
    }
    setStayState(stay)
    setState((prev) => {
      persistSession(prev.session, stay)
      return prev
    })
  }, [])

  // The session ends when the password / phone number changes, and when another tab logs out of this device.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onCred = () => signOut()
    const onStorage = (e: StorageEvent) => {
      if (e.key === AUTH_STORAGE_KEY && e.newValue === null && e.storageArea === window.localStorage) {
        setState((prev) => (prev.session ? { session: null, ageConfirmedAt: null, conductAcceptedAt: null } : prev))
      }
    }
    window.addEventListener(CREDENTIALS_CHANGED_EVENT, onCred)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(CREDENTIALS_CHANGED_EVENT, onCred)
      window.removeEventListener('storage', onStorage)
    }
  }, [signOut])

  const value = useMemo<AuthContextValue>(() => {
    const isAgeConfirmed = state.ageConfirmedAt !== null
    const isConductAccepted = state.conductAcceptedAt !== null
    const isGateComplete = isAgeConfirmed && isConductAccepted

    return {
      session: state.session,
      role: state.session?.role ?? null,
      ageConfirmedAt: state.ageConfirmedAt,
      conductAcceptedAt: state.conductAcceptedAt,
      isAgeConfirmed,
      isConductAccepted,
      isGateComplete,
      canProceed: state.session !== null && isGateComplete,
      signIn,
      confirmAge20Plus,
      acceptCodeOfConduct,
      signOut,
      setRole,
      logOutDevice: signOut,
      staySignedIn,
      setStaySignedIn,
    }
  }, [state, signIn, confirmAge20Plus, acceptCodeOfConduct, signOut, setRole, staySignedIn, setStaySignedIn])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Like useAuth but returns null outside an AuthProvider (sections rendered standalone in tests). */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext)
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider')
  }
  return context
}

/** Backend stop-point helper: call after a password or phone-number change to end every session on this device. */
export function endSessionForCredentialChange(): void {
  try {
    window.dispatchEvent(new CustomEvent(CREDENTIALS_CHANGED_EVENT))
  } catch {
    // ignore
  }
}

/**
 * KRING T3 · "hosting" is derived from activity, never from a mode: true when this device has listed at least one
 * experience (presence.experiences), or has requests / plans as the local (planStore.host / hostSettings), or the
 * stored legacy role is `host` (accounts that were Locals before T3 keep their hosting content).
 */
export function isHosting(
  role: AuthRole | null | undefined,
  presence: { experiences?: unknown[]; setup?: boolean } = readPresence(),
  store: Pick<PlanStoreState, 'host' | 'hostSettings'> = getPlanStore(),
): boolean {
  if (role === 'host') return true
  if ((presence.experiences?.length ?? 0) > 0) return true
  return Object.keys(store.host ?? {}).length > 0 || Object.keys(store.hostSettings ?? {}).length > 0
}

export function useHosting(): boolean {
  const auth = useOptionalAuth()
  const presence = usePresence()
  const store = usePlanStore()
  return isHosting(auth?.session?.role, presence, store)
}

/** Agency tools stay reachable (Me › Settings) only for accounts that already have the agency role — no switch UI. */
export function hasAgencyRole(session: Pick<AuthSession, 'role'> | null | undefined): boolean {
  return session?.role === 'agency'
}
