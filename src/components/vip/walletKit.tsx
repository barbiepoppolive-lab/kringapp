import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { triggerHaptic } from '../../lib/haptics'
import { useBackEntry } from '../../lib/backStack'
import { isTrustedWalletEvent, type WalletDeltaDetail } from '../../lib/walletBus'
import { useTripSaved } from '../../lib/tripSavings'
import { handleFromName as romanHandle } from '../../lib/identity'
import { useOptionalAuth } from '../../context/AuthContext'
import { useLanguage } from '../../i18n/LanguageContext'
import { nightOf, nightStore, NIGHT_STORE_EVENT } from '../../lib/demoState'
import Odometer from '../ui/Odometer'
import { readProfile } from '../../lib/profileStore'
import { usePlanStore } from '../../lib/planStore'
import { localReleasedThb } from '../wallet/bookingMoney'
import '../../styles/wallet.css'

/**
 * Atlas build · D · tiny shared kit for Wallet, Safety and Rewards pages.
 * - island()        → the one top island (A's TopIsland listens to `chon:island`)
 * - openGuide()     → the full-screen guide (A's FullGuide listens to `chon:open-guide`)
 * - openTopUp()     → the one top-up sheet (TopUpSheet listens to `chon:open-topup`)
 * - openSafety()    → the one Safety Center (SafetyCenterHost listens to `chon:open-safety`)
 * - WPage           → full-screen page (portal, above the dock, under sheets)
 * - WSwitch         → gold hairline toggle
 * - wallet activity → a display-only log of trusted, accepted wallet deltas (never touches the ledger)
 */

export type IslandTone = 'gold' | 'green' | 'red' | 'neutral'

export function island(text: string, tone: IslandTone = 'neutral', icon?: string, ms?: number) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('chon:island', { detail: { text, tone, icon, ms } }))
}

export type GuideId =
  | 'meet'
  | 'rewards'
  | 'clink'
  | 'gifts'
  | 'chats'
  | 'pulse'
  | 'pulse-coupons'
  | 'wallet'
  | 'host'
  | 'safety'
  | 'extend'
  | 'floor'
  | 'starter'

export function openGuide(id: GuideId, page?: number) {
  if (typeof window === 'undefined') return
  triggerHaptic('tap')
  window.dispatchEvent(new CustomEvent('chon:open-guide', { detail: { id, page } }))
}

export interface TopUpRequest {
  reason?: string
  needThb?: number
  /** where the "Back to …" button returns (label only) */
  backLabel?: string
  /** NEXT95 · G3: a product picked before the sheet opened (the Traveller Starter Pack). Same payment stop-point. */
  pack?: 'starter'
}

export function openTopUp(detail: TopUpRequest = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('chon:open-topup', { detail }))
}

export type SafetySection = 'sos' | 'driver' | 'report' | 'privacy'
export interface SafetyRequest {
  section?: SafetySection
  hostId?: string
  hostName?: string
  venue?: string
}

export function openSafety(detail: SafetyRequest = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('chon:open-safety', { detail }))
}

export function navigateTab(tab: 'meet' | 'pulse' | 'chats' | 'vip') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab } }))
}

export const thb = (n: number) => `฿${Math.round(n).toLocaleString('en-US')}`

/* ---------------- language + role (Round 4 · Ploy B9/B12) ---------------- */
export type Tr = (en: string, th: string, zh?: string) => string
/** `tr('Settings', 'ตั้งค่า')` — picks the app language; Chinese falls back to English unless given. */
export function useTr(): Tr {
  const { language } = useLanguage()
  return useCallback((en: string, th: string, zh?: string) => (language === 'th' ? th : language === 'zh' && zh ? zh : en), [language])
}
export function useIsThai(): boolean {
  return useLanguage().language === 'th'
}
/** true when the signed-in account is a host (or an agency, which also earns rather than spends). */
export function useIsHostRole(): boolean {
  const auth = useOptionalAuth()
  const role = auth?.session?.role
  return role === 'host' || role === 'agency'
}
/** Kring runs on Bangkok time whatever the phone's zone (a traveller's phone may still be on home time). */
export const BKK_TZ = 'Asia/Bangkok'
/** Bangkok wall-clock parts of a moment (UTC+7, no DST). */
export function bkkParts(at: number | Date): { y: number; m: number; d: number; h: number; min: number; dow: number } {
  const t = new Date((typeof at === 'number' ? at : at.getTime()) + 7 * 3600_000)
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), h: t.getUTCHours(), min: t.getUTCMinutes(), dow: t.getUTCDay() }
}
/** "20:30 น." in Thai, "8:30 PM" in English — always Bangkok time. */
export function clockFor(d: Date, th: boolean): string {
  const { h, min } = bkkParts(d)
  if (th) return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')} น.`
  return `${h % 12 === 0 ? 12 : h % 12}:${String(min).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** Generic stand-ins a demo / social sign-in leaves in `displayName` — never shown as a person's name. */
const GENERIC_NAMES = /^(demo\b.*|traveller|traveler|guest|user|you|me|local|host)$/i

/**
 * KRING FIX1 · real names everywhere: the name the person typed in onboarding (profile) first, then the session's
 * display name (an email handle like "ploy.host" becomes "Ploy"), never "Demo Traveler".
 */
export function realName(sessionName?: string | null): string {
  let fromProfile = ''
  try {
    fromProfile = (readProfile()?.name ?? '').trim()
  } catch {
    fromProfile = ''
  }
  if (fromProfile && !GENERIC_NAMES.test(fromProfile)) return fromProfile
  const raw = (sessionName ?? '').trim()
  if (!raw || GENERIC_NAMES.test(raw)) return ''
  // "ploy.host" / "ploy_k" (an email handle) → "Ploy"
  if (!/\s/.test(raw) && /[._\d]/.test(raw)) {
    const head = raw.split(/[._\d]/).find(Boolean) ?? ''
    return head ? head.charAt(0).toUpperCase() + head.slice(1) : ''
  }
  return raw
}

/** The signed-in person's full real name (re-renders when onboarding / Edit profile saves). */
export function useRealName(): string {
  const auth = useOptionalAuth()
  const sessionName = auth?.session?.displayName
  const [n, setN] = useState(() => (typeof window === 'undefined' ? '' : realName(sessionName)))
  useEffect(() => {
    const on = () => setN(realName(sessionName))
    on()
    window.addEventListener('chon:profile-updated', on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener('chon:profile-updated', on)
      window.removeEventListener('storage', on)
    }
  }, [sessionName])
  return n
}

/** First name of the signed-in person (profile name first; never a hard-coded demo name). */
export function useFirstName(fallback = 'there'): string {
  const full = useRealName()
  const first = full.split(/\s+/)[0]
  return first || fallback
}

/** "kring.app/@ploy" from a real name. Thai names keep their letters (the link still works as a Unicode path). */
export function handleFromName(name: string): string {
  const latin = name.toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (latin) return latin
  // KRING FIX2 · Ploy 9: never a Thai handle in a URL (kring.app/@พลอย breaks in LINE) — romanise it (พลอย → ploy)
  return romanHandle(name) || 'you'
}

/* ---------------- storage helpers ---------------- */
export function readJSON<T>(key: string, fallback: T, storage: 'local' | 'session' = 'local'): T {
  try {
    const s = storage === 'local' ? window.localStorage : window.sessionStorage
    const raw = s.getItem(key)
    return raw ? ({ ...(fallback as object), ...(JSON.parse(raw) as object) } as T) : fallback
  } catch {
    return fallback
  }
}
export function writeJSON(key: string, value: unknown, storage: 'local' | 'session' = 'local') {
  try {
    const s = storage === 'local' ? window.localStorage : window.sessionStorage
    s.setItem(key, JSON.stringify(value))
  } catch {
    // storage may be unavailable (private mode)
  }
}

/** Persisted small object state (privacy toggles, emergency contact …). */
export function useStoredState<T extends object>(key: string, initial: T): [T, (patch: Partial<T>) => void] {
  const [state, setState] = useState<T>(() => readJSON<T>(key, initial))
  const update = (patch: Partial<T>) => {
    setState((prev) => {
      const next = { ...prev, ...patch }
      writeJSON(key, next)
      return next
    })
  }
  return [state, update]
}

/* ---------------- trip savings (written by Pulse bookings via `chon:trip-saved`) ---------------- */
export { TRIP_SAVED_KEY } from '../../lib/tripSavings'
/** Wei B16: the ONE trip-savings figure (lib/tripSavings) — Pulse, Wallet and Top-up read the same total. */
export function useTripSavedThb(isDemo = false): number {
  return useTripSaved(isDemo)
}

/* ---------------- wallet activity (display-only) ---------------- */
export interface WalletActivity {
  id: string
  kind: 'topup' | 'demo' | 'refund' | 'clink' | 'gift' | 'ride' | 'reward' | 'spend' | 'payout' | 'release'
  label: string
  /** KRING FIX1: the offer / multi-request / booking id a planStore money note names ("Kring booking hold · Kwan · of-…") */
  ref?: string
  /** ROUND5: who a hold / refund was for (from the Clink's `chon:offer-status`) */
  who?: string
  /** payout rows carry baht (host earnings are not wallet coins) */
  thb?: number
  /** payout rows: 'sending' until the bank confirms, then 'sent' */
  state?: 'sending' | 'sent'
  deltaCoins: number
  at: number
}
const ACTIVITY_KEY = 'chon_wallet_activity_v1'
const ACTIVITY_EVENT = 'chon:wallet-activity'

/** NEXT95 · "the night stays the night": the display log lives in localStorage and keeps the last 18 hours. */
export const ACTIVITY_WINDOW_MS = 18 * 60 * 60 * 1000
function parseActivity(raw: string | null): WalletActivity[] {
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as WalletActivity[]).filter((a) => a && typeof a.at === 'number') : []
  } catch {
    return []
  }
}
export function readActivity(now = Date.now()): WalletActivity[] {
  try {
    let list = parseActivity(window.localStorage.getItem(ACTIVITY_KEY))
    // one-time move from the old per-tab log (sessionStorage) so nothing recorded earlier tonight is lost
    const legacy = parseActivity(window.sessionStorage.getItem(ACTIVITY_KEY))
    if (legacy.length) {
      const ids = new Set(list.map((a) => a.id))
      list = [...list, ...legacy.filter((a) => !ids.has(a.id))].sort((a, b) => b.at - a.at)
      window.sessionStorage.removeItem(ACTIVITY_KEY)
      writeJSON(ACTIVITY_KEY, list.slice(0, 30))
    }
    return list.filter((a) => now - a.at < ACTIVITY_WINDOW_MS)
  } catch {
    return []
  }
}

/**
 * ROUND5 · Wei B8: the last `chon:offer-status` (HELD / CANCELLED / EXPIRED) seen on this page. The Clink sheet dispatches
 * it in the same tap as the hold's debit (which carries no note), so the recorder can name a hold "Held for Mint" instead
 * of the generic "Spent in Chonn!". Display only.
 */
let lastOffer: { status: string; hostName: string; thb: number; at: number } | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('chon:offer-status', (e: Event) => {
    const d = (e as CustomEvent<{ status?: string; hostName?: string; offerBaht?: number }>).detail
    if (!d?.status) return
    lastOffer = { status: d.status, hostName: d.hostName ?? '', thb: Math.max(0, Number(d.offerBaht) || 0), at: Date.now() }
  })
}

/** "Kring booking hold · Kwan · of-abc-1" → { kind, who: 'Kwan', ref: 'of-abc-1' } (planStore's kringMoneyNote) */
export function parseKringNote(note: string | undefined): { kind: 'hold' | 'refund' | 'released'; who: string; ref: string } | null {
  const parts = (note ?? '').split(' · ').map((x) => x.trim())
  const m = /^Kring booking (hold|refund|released)\b/i.exec(parts[0] ?? '')
  if (!m) return null
  return { kind: m[1].toLowerCase() as 'hold' | 'refund' | 'released', who: parts[1] ?? '', ref: parts[2] ?? '' }
}

function classify(detail: WalletDeltaDetail, delta: number): Pick<WalletActivity, 'kind' | 'label' | 'who' | 'ref'> {
  const kn = parseKringNote(detail.note)
  if (kn) {
    if (kn.kind === 'released') return { kind: 'release', label: 'Released to you', who: kn.who || undefined, ref: kn.ref || undefined }
    if (kn.kind === 'refund' || delta > 0) return { kind: 'refund', label: 'Came back to you', who: kn.who || undefined, ref: kn.ref || undefined }
    return { kind: 'clink', label: 'Booking', who: kn.who || undefined, ref: kn.ref || undefined }
  }
  const n = (detail.note ?? '').toLowerCase()
  const offer = lastOffer && Date.now() - lastOffer.at < 2500 ? lastOffer : null
  if (delta > 0) {
    // a demo button that conjures money is a demo credit, never a "PromptPay top-up"
    const pp = n.includes('promptpay') || n.includes('พร้อมเพย์')
    if (n.includes('unlock') || ((n.includes('demo') || n.includes('เดโม')) && !pp)) return { kind: 'demo', label: 'Demo credit' }
    if (n.includes('top') || n.includes('เติมเงิน') || pp) return { kind: 'topup', label: 'Top up · PromptPay' }
    if (n.includes('refund') || n.includes('back') || n.includes('cancel') || (!n && detail.allowEscrowRefund))
      return { kind: 'refund', label: 'Came back to you', who: offer && offer.status !== 'HELD' ? offer.hostName : undefined }
    return { kind: 'reward', label: 'Added to your wallet' }
  }
  if (!n && offer && offer.status === 'HELD') return { kind: 'clink', label: 'Booking', who: offer.hostName }
  if (n.includes('gift') || n.includes('rose') || n.includes('lucky')) return { kind: 'gift', label: 'Gift sent' }
  if (n.includes('ride') || n.includes('cab') || n.includes('tuk')) return { kind: 'ride', label: 'Ride' }
  if (n.includes('clink') || n.includes('treat') || n.includes('envelope') || n.includes('hold') || n.includes('offer'))
    return { kind: 'clink', label: 'Booking' }
  return { kind: 'spend', label: 'Spent in Kring' }
}

/** Mounted once (inside TopUpSheet, which App always mounts): records trusted + accepted paid deltas. */
export function useWalletActivityRecorder(onGain?: (deltaCoins: number) => void) {
  const gainRef = useRef(onGain)
  gainRef.current = onGain
  useEffect(() => {
    const onDelta = (event: Event) => {
      if (!isTrustedWalletEvent(event)) return
      const detail = (event as CustomEvent<WalletDeltaDetail>).detail
      if (!detail || typeof detail.paidDelta !== 'number' || detail.paidDelta === 0) return
      // App's ledger handler may run after this listener: read `accepted` once every listener has run.
      window.setTimeout(() => {
        if (detail.accepted === false) return
        const delta = detail.paidDelta as number
        const { kind, label, who, ref } = classify(detail, delta)
        const entry: WalletActivity = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind, label, who, ref, deltaCoins: delta, at: Date.now() }
        const next = [entry, ...readActivity()].slice(0, 30)
        writeJSON(ACTIVITY_KEY, next)
        window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT))
        if (delta > 0) gainRef.current?.(delta)
      }, 0)
    }
    window.addEventListener('chon:wallet-delta', onDelta)
    return () => window.removeEventListener('chon:wallet-delta', onDelta)
  }, [])
}

/** Display-only: a host cash-out row ("Sent to PromptPay −฿500"). Never touches the ledger. */
export function logPayoutActivity(amountThb: number, to: string): WalletActivity {
  const entry: WalletActivity = {
    id: `po-${Date.now()}`,
    kind: 'payout',
    label: to,
    deltaCoins: 0,
    thb: amountThb,
    state: 'sending',
    at: Date.now(),
  }
  writeJSON(ACTIVITY_KEY, [entry, ...readActivity()].slice(0, 30))
  window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT))
  return entry
}
export function markPayoutSent(id: string) {
  const list = readActivity().map((a) => (a.id === id ? { ...a, state: 'sent' as const } : a))
  writeJSON(ACTIVITY_KEY, list)
  window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT))
}

/* ---------------- host payouts (display-only) ---------------- */
/**
 * ROUND5 · Ploy B1: in a DEMO session a cash-out lasts for the night (nightStore, localStorage, 06:00 → 06:00 Bangkok),
 * so closing and reopening the app never brings the ฿500 back next to "−฿500 sent" (a double withdraw).
 * Real sessions keep the per-tab record they always had (their balance is the server's).
 */
const PAYOUT_KEY = 'chon_host_payouts_v1'
/** nightStore key (→ `chon_night_v1:host-payouts`) */
export const PAYOUT_NIGHT_KEY = 'host-payouts'
export const PAYOUT_EVENT = 'chon:host-payout'
export interface HostPayouts {
  /** baht already sent out of the "ready" figure (tonight in demo, this tab otherwise) */
  paidOutThb: number
  /** night key (06:00 → 06:00 Bangkok) of the last cash-out — one free cash-out a night */
  lastDay: string
}
const EMPTY_PAYOUTS: HostPayouts = { paidOutThb: 0, lastDay: '' }
const cleanPayouts = (v: Partial<HostPayouts> | null | undefined): HostPayouts => ({
  paidOutThb: typeof v?.paidOutThb === 'number' && Number.isFinite(v.paidOutThb) && v.paidOutThb > 0 ? Math.round(v.paidOutThb) : 0,
  lastDay: typeof v?.lastDay === 'string' ? v.lastDay : '',
})
export function readHostPayouts(isDemo = false): HostPayouts {
  if (typeof window === 'undefined') return EMPTY_PAYOUTS
  if (isDemo) {
    const night = nightStore.get<HostPayouts | null>(PAYOUT_NIGHT_KEY, null)
    if (night) return cleanPayouts(night)
    // a cash-out made in this tab before the move to nightStore still counts tonight
    const legacy = cleanPayouts(readJSON<HostPayouts>(PAYOUT_KEY, EMPTY_PAYOUTS, 'session'))
    if (legacy.paidOutThb > 0) {
      const moved = { ...legacy, lastDay: nightOf() }
      nightStore.set(PAYOUT_NIGHT_KEY, moved)
      return moved
    }
    return EMPTY_PAYOUTS
  }
  return cleanPayouts(readJSON<HostPayouts>(PAYOUT_KEY, EMPTY_PAYOUTS, 'session'))
}
export function recordHostPayout(thbAmount: number, isDemo = false) {
  const prev = readHostPayouts(isDemo)
  const next: HostPayouts = { paidOutThb: prev.paidOutThb + Math.max(0, Math.round(thbAmount)), lastDay: nightOf() }
  if (isDemo) nightStore.set(PAYOUT_NIGHT_KEY, next)
  else writeJSON(PAYOUT_KEY, next, 'session')
  window.dispatchEvent(new CustomEvent(PAYOUT_EVENT, { detail: next }))
}
/** The cash-outs that the visible host balance must subtract. Reads the session's demo flag itself. */
export function useHostPayouts(): HostPayouts & { usedToday: boolean } {
  const isDemo = Boolean(useOptionalAuth()?.session?.isDemoMode)
  const [v, setV] = useState<HostPayouts>(() => readHostPayouts(isDemo))
  useEffect(() => {
    const on = () => setV(readHostPayouts(isDemo))
    on()
    const onNight = (e: Event) => {
      if ((e as CustomEvent<{ key?: string }>).detail?.key === PAYOUT_NIGHT_KEY) on()
    }
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === nightStore.key(PAYOUT_NIGHT_KEY)) on()
    }
    window.addEventListener(PAYOUT_EVENT, on)
    window.addEventListener(NIGHT_STORE_EVENT, onNight)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(PAYOUT_EVENT, on)
      window.removeEventListener(NIGHT_STORE_EVENT, onNight)
      window.removeEventListener('storage', onStorage)
    }
  }, [isDemo])
  return { ...v, usedToday: v.lastDay === nightOf() }
}

/**
 * KRING FIX1 · the Local's "Ready to withdraw" — ONE figure for the Wallet earnings card, the header pill and
 * Local home. = her share of every booking released at the bump (planStore, same record the ticket reads) − what she
 * already cashed out. A demo account with nothing released yet shows the labelled ฿500 demo credit instead (never on
 * top of real releases); real accounts start at ฿0.
 * Display only: the cash-out request still goes through the hub's existing call.
 */
/**
 * KRING FIX2 · Ploy 7/8/35: Ready is ONLY her share of released bookings minus cash-outs — in demo too. No invented
 * start credit (the old ฿500 stand-in read as "฿500 ready" on day one). `isDemo` is kept for callers' signatures.
 */
export function localReadyThb(store: Parameters<typeof localReleasedThb>[0], _isDemo: boolean, paidOutThb: number): number {
  return Math.max(0, localReleasedThb(store) - Math.max(0, paidOutThb))
}
export function useLocalReadyThb(): number {
  const isDemo = Boolean(useOptionalAuth()?.session?.isDemoMode)
  const store = usePlanStore()
  const payouts = useHostPayouts()
  return localReadyThb(store, isDemo, payouts.paidOutThb)
}

/* ---------------- money words shared by Wallet, Top-up and the timeline (ROUND5) ---------------- */
/** Her share: what SHE receives for a guest's ฿X — the planStore rounding, so Plans, Host home and Wallet agree. */
export { HOST_SHARE, hostShareThb } from '../../lib/planStore'

/**
 * ROUND5 · Wei B1 / Kring B6: the ONE balance line style. "฿200 cash · ฿1,000 promo" — promo (bonus) money pays gifts and deals
 * but never a booking hold, so a top-up that asks for ฿300 next to a ฿1,200 total finally makes sense. Baht first, no coins.
 * `roll` rolls both figures with the same odometer timing as the card's big number (Marco B11).
 */
export function BalanceSplit({
  paidCoins,
  bonusCoins,
  coinsPerThb,
  roll = false,
  note = false,
  durationMs = 900,
  className = '',
  testId,
}: {
  paidCoins: number
  bonusCoins: number
  coinsPerThb: number
  roll?: boolean
  /** add "— promo can't pay a Clink" when there is promo money */
  note?: boolean
  durationMs?: number
  className?: string
  testId?: string
}) {
  const tr = useTr()
  const cash = paidCoins / coinsPerThb
  const promo = bonusCoins / coinsPerThb
  const fig = (v: number) => (roll ? <Odometer value={v} durationMs={durationMs} /> : thb(v))
  return (
    <span className={`wl-split ${className}`.trim()} data-testid={testId}>
      {/* Kring B6 · "฿200 cash · ฿800 promo" — baht first, then the word */}
      <b>{fig(cash)}</b> <span className="wl-split-k">{tr('cash', 'เงินสด')}</span>
      {promo > 0 ? (
        <>
          <span className="wl-split-dot" aria-hidden="true">·</span>
          <b className="is-promo">{fig(promo)}</b> <span className="wl-split-k">{tr('promo', 'โปร')}</span>
          {note ? <small className="wl-split-note">{tr('Promo can’t pay a booking', 'เครดิตโปรใช้จองไม่ได้')}</small> : null}
        </>
      ) : null}
    </span>
  )
}

/* Round 4 · Ploy B5: the checklist survives leaving the page (Record opens the story camera on Meet) and reloads. */
export const APPLY_KEY = 'chon_mode_apply_v1'
export interface ApplyState {
  selfie: boolean
  ppDone: boolean
  /** last 4 digits only — never the full number */
  ppLast4: string
  /** the story camera was opened from this checklist */
  storyAsked: boolean
  story: boolean
  wall: boolean
  code: string
  /** reopen the checklist the next time the Wallet mounts (set when we sent them to the camera) */
  resume: '' | 'host' | 'agency'
}
export const APPLY_DEFAULTS: ApplyState = { selfie: false, ppDone: false, ppLast4: '', storyAsked: false, story: false, wall: false, code: '', resume: '' }
export function readApply(): ApplyState {
  return typeof window === 'undefined' ? APPLY_DEFAULTS : readJSON<ApplyState>(APPLY_KEY, APPLY_DEFAULTS)
}
export function writeApply(patch: Partial<ApplyState>): ApplyState {
  const next = { ...readApply(), ...patch }
  writeJSON(APPLY_KEY, next)
  window.dispatchEvent(new CustomEvent('chon:mode-apply'))
  return next
}

/* ---------------- top-up payoff choreography (Marco 2) ---------------- */
/** TopUpSheet sets this while it is open; the Wallet holds its card roll until `chon:topup-done`. */
export const TOPUP_DONE_EVENT = 'chon:topup-done'
export function isTopUpOpen(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean((window as unknown as { __chonTopUpOpen?: boolean }).__chonTopUpOpen)
}
export function setTopUpOpen(open: boolean) {
  if (typeof window === 'undefined') return
  ;(window as unknown as { __chonTopUpOpen?: boolean }).__chonTopUpOpen = open
}

/**
 * KRING FIX1 · Marco 6 — ONE clock for every rolling balance (header pill, the Wallet card's big digits and its
 * "฿cash · ฿promo" line). A module-level snapshot: a debit / hold shows at once; a credit while the top-up sheet is
 * open waits for `chon:topup-done`, then (200 ms) the card glints and (520 ms) EVERY subscriber rolls on the same
 * frame. Components pass the live ledger figures; they all read back the same shown snapshot.
 */
export interface ShownBalance {
  paid: number
  bonus: number
  /** bumps once per credit release (glint + coins fly into the figure) */
  gainKey: number
}
const ROLL_GLINT_MS = 200
const ROLL_SHOW_MS = 520
let shownBal: ShownBalance | null = null
let latestBal: { paid: number; bonus: number } | null = null
let rollPending = false
const balListeners = new Set<() => void>()
const emitBal = () => balListeners.forEach((fn) => fn())
/** fired on the glint frame (WalletHome flies the coins into the figure) */
export const BALANCE_GAIN_EVENT = 'kring:balance-gain'
function feedBalance(paid: number, bonus: number) {
  latestBal = { paid, bonus }
  if (!shownBal) {
    shownBal = { paid, bonus, gainKey: 0 }
    return
  }
  if (shownBal.paid === paid && shownBal.bonus === bonus) {
    rollPending = false
    return
  }
  const up = paid + bonus > shownBal.paid + shownBal.bonus
  if (up && isTopUpOpen()) {
    rollPending = true
    return
  }
  shownBal = { paid, bonus, gainKey: shownBal.gainKey + (up ? 1 : 0) }
  if (up) window.dispatchEvent(new CustomEvent(BALANCE_GAIN_EVENT))
  emitBal()
}
if (typeof window !== 'undefined') {
  window.addEventListener(TOPUP_DONE_EVENT, () => {
    if (!rollPending || !latestBal) return
    rollPending = false
    const quiet = prefersReducedMotion()
    window.setTimeout(() => window.dispatchEvent(new CustomEvent(BALANCE_GAIN_EVENT)), quiet ? 0 : ROLL_GLINT_MS)
    window.setTimeout(() => {
      if (!latestBal || !shownBal) return
      shownBal = { ...latestBal, gainKey: shownBal.gainKey + 1 }
      emitBal()
    }, quiet ? 0 : ROLL_SHOW_MS)
  })
}
/** Feed the live ledger figures; get the one shown snapshot back (same value + same frame for every caller). */
/**
 * KRING FIX2 · one money truth: the baht a balance pill / card / e-slip shows is CASH only (what pays a booking).
 * Promo stays a separate figure everywhere — never added in.
 */
export function cashThbOf(b: { paid: number } | { paidCoins: number }, coinsPerThb = 100): number {
  const coins = 'paid' in b ? b.paid : b.paidCoins
  return Math.round(coins / coinsPerThb)
}
export function useRolledBalance(paidCoins: number, bonusCoins: number): ShownBalance {
  if (!shownBal) shownBal = { paid: paidCoins, bonus: bonusCoins, gainKey: 0 }
  const [, force] = useState(0)
  useEffect(() => {
    const on = () => force((n) => n + 1)
    balListeners.add(on)
    return () => {
      balListeners.delete(on)
    }
  }, [])
  useEffect(() => {
    feedBalance(paidCoins, bonusCoins)
  }, [paidCoins, bonusCoins])
  return shownBal
}
/** tests: forget the shared snapshot */
export function __resetRolledBalance() {
  shownBal = null
  latestBal = null
  rollPending = false
}

export function useWalletActivity(): WalletActivity[] {
  const [list, setList] = useState<WalletActivity[]>(() => (typeof window === 'undefined' ? [] : readActivity()))
  useEffect(() => {
    const on = () => setList(readActivity())
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVITY_KEY) on()
    }
    window.addEventListener(ACTIVITY_EVENT, on)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(ACTIVITY_EVENT, on)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return list
}

export function timeAgo(at: number, th = false): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (s < 60) return th ? 'เมื่อกี้' : 'just now'
  if (s < 3600) return th ? `${Math.round(s / 60)} นาทีที่แล้ว` : `${Math.round(s / 60)} min ago`
  if (s < 86_400) return th ? `${Math.round(s / 3600)} ชม.ที่แล้ว` : `${Math.round(s / 3600)} h ago`
  return new Date(at).toLocaleDateString(th ? 'th-TH' : 'en-GB', { weekday: 'short', timeZone: BKK_TZ })
}

/* ---------------- shared wallet balance broadcast (hub → top-up sheet) ---------------- */
export const BALANCE_EVENT = 'chon:wallet-balance'
export interface BalanceDetail {
  paidCoins: number
  bonusCoins: number
}
export function broadcastBalance(detail: BalanceDetail) {
  if (typeof window === 'undefined') return
  ;(window as unknown as { __chonWalletBalance?: BalanceDetail }).__chonWalletBalance = detail
  window.dispatchEvent(new CustomEvent(BALANCE_EVENT, { detail }))
}
export function lastKnownBalance(): BalanceDetail | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { __chonWalletBalance?: BalanceDetail }).__chonWalletBalance ?? null
}

/* ---------------- UI primitives ---------------- */

/** Full-screen page above the dock (sheets still open on top of it). Portals to <body>. */
export function WPage({
  open,
  title,
  onBack,
  guide,
  right,
  testId,
  tone = 'gold',
  className = '',
  children,
}: {
  open: boolean
  title: ReactNode
  onBack: () => void
  guide?: GuideId
  right?: ReactNode
  testId?: string
  tone?: 'gold' | 'cyan' | 'violet' | 'red'
  className?: string
  children: ReactNode
}) {
  const backRef = useRef(onBack)
  backRef.current = onBack
  useBackEntry(open, () => backRef.current(), { id: testId || 'wpage', priority: 70 })
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      backRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div className={`wl-page is-${tone} ${className}`.trim()} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} data-testid={testId}>
      <header className={`wl-page-head${scrolled ? ' is-scrolled' : ''}`}>
        <button
          type="button"
          className="wl-back m-press"
          aria-label="Back"
          onClick={() => {
            triggerHaptic('tap')
            onBack()
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <h2 className="wl-page-title">{title}</h2>
        <div className="wl-page-right">
          {right}
          {guide ? (
            <button type="button" className="wl-q m-press" aria-label="How this works" onClick={() => openGuide(guide)}>
              ?
            </button>
          ) : null}
        </div>
      </header>
      <div
        className="wl-page-body"
        ref={bodyRef}
        onScroll={(e) => {
          const s = (e.currentTarget as HTMLDivElement).scrollTop > 4
          if (s !== scrolled) setScrolled(s)
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function WSwitch({
  on,
  onChange,
  label,
  testId,
}: {
  on: boolean
  onChange: (next: boolean) => void
  label: string
  testId?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      data-testid={testId}
      className="wl-sw"
      onClick={() => {
        triggerHaptic('select')
        onChange(!on)
      }}
    />
  )
}

/** One hairline row: icon · title + small line · right slot. Renders a button when `onClick` is set. */
export function WRow({
  icon,
  title,
  sub,
  right,
  onClick,
  testId,
  danger = false,
  chevron = false,
}: {
  icon?: ReactNode
  title: ReactNode
  sub?: ReactNode
  right?: ReactNode
  onClick?: () => void
  testId?: string
  danger?: boolean
  chevron?: boolean
}) {
  const inner = (
    <>
      {icon !== undefined ? <span className="wl-row-ic" aria-hidden="true">{icon}</span> : null}
      <span className="wl-row-t">
        <b className={danger ? 'is-danger' : undefined}>{title}</b>
        {sub ? <small>{sub}</small> : null}
      </span>
      {right !== undefined ? <span className="wl-row-r">{right}</span> : null}
      {chevron ? (
        <svg className="wl-chev" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      ) : null}
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        className="wl-row m-press"
        data-testid={testId}
        onClick={() => {
          triggerHaptic('tap')
          onClick()
        }}
      >
        {inner}
      </button>
    )
  }
  return (
    <div className="wl-row" data-testid={testId}>
      {inner}
    </div>
  )
}

/** Copies text; resolves true when the clipboard accepted it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through
  }
  return false
}

export function prefersReducedMotion(): boolean {
  try {
    if (document.documentElement.dataset.reduceMotion === 'true') return true
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
