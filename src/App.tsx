import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'
import { createPortal } from 'react-dom'
import { broadcastBalance, useRolledBalance } from './components/vip/walletKit'
import BottomNav, { type TabId } from './components/BottomNav'
import LanguageSwitcher from './components/LanguageSwitcher'
import AgeGateModal from './components/AgeGateModal'
import LoginSheet from './components/LoginSheet'
import MeetFeed, {
  DEMO_LIVE_STORIES,
  DEMO_MEET_HOSTS,
  MEET_STARTING_COINS,
  type MeetHost,
} from './components/meet/MeetFeed'
import ClinkGiftSheetSync, {
  type LuckyChonGift,
  type ThaiVibeTreat,
} from './components/meet/ClinkGiftSheet'
import { captureAttributionFromUrl } from './lib/attribution'
import type { GamePlayResult } from './components/rewards/TasksAndGamesDrawer'
import { MINI_GAMES } from './lib/miniGames'
import { LanguageProvider, useLanguage } from './i18n/LanguageContext'
import {
  AuthProvider,
  PROVIDER_LABELS,
  ROLE_LABELS,
  useAuth,
  useHosting,
  type AuthSession,
} from './context/AuthContext'
import { triggerHaptic } from './lib/haptics'
import CityAwareBanner from './components/ui/CityAwareBanner'
import { isGenericName } from './lib/identity'
import { isTrustedWalletEvent, trySpendPaidCoins, type WalletDeltaDetail } from './lib/walletBus'
import LuxuryStageFX from './components/fx/LuxuryStageFX'
import BigGiftFX from './components/fx/BigGiftFX'
import FeatureIncentiveOverlay, {
  type HelpSectionId,
} from './components/help/FeatureIncentiveOverlay'
import { guestWatermarkId, installScreenshotArmor } from './lib/screenshotArmor'
import { hostPlaceholderVars, installImageFallback } from './lib/imageFallback'
import { startTilt } from './lib/tilt'
import { readDemoWallet, writeDemoWallet } from './lib/demoState'
import { hasActiveBackEntries, popTopBackEntry, useBackEntry, useGlobalBackNavigation } from './lib/backStack'
import { installKringSupabaseLiveBridge } from './lib/supabaseKringLiveBridge'

installKringSupabaseLiveBridge()
captureAttributionFromUrl()

// OPT-011: the three non-default tabs + the rewards drawer are real code-split chunks now. Before this,
// App.tsx imported them statically, so dist/index.html modulepreloaded all five tab chunks (~650 KB raw /
// ~170 KB gzip) before first paint and the <Suspense> boundaries below never suspended.

/** Lazy import with one retry, then a single guarded reload — a failed chunk fetch (flaky network,
 *  or a new deploy) must never blank the app. */
function lazyRetry<T extends React.ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().catch(
      () =>
        new Promise<{ default: T }>((resolve, reject) => {
          setTimeout(() => {
            load().then(resolve).catch((err) => {
              try {
                if (!sessionStorage.getItem('chon_chunk_reload_v1')) {
                  sessionStorage.setItem('chon_chunk_reload_v1', '1')
                  window.location.reload()
                  return
                }
              } catch { /* storage blocked */ }
              reject(err)
            })
          }, 600)
        }),
    ),
  )
}

const BkkPulseTab = lazyRetry(() => import('./components/pulse/BkkPulseTab'))
const AgencyAndReferralHub = lazyRetry(() => import('./components/vip/AgencyAndReferralHub'))
const ChatsAndPlansTab = lazyRetry(() => import('./components/chat/ChatsAndPlansTab'))
const TasksAndGamesDrawer = lazyRetry(() => import('./components/rewards/TasksAndGamesDrawer'))
const OnboardingSheet = lazyRetry(() => import('./components/onboarding/OnboardingSheet'))
const ClinkGiftSheet =
  import.meta.env.MODE === 'test'
    ? ClinkGiftSheetSync
    : () => null
import { readProfile } from './lib/profileStore'
import { formatBaht, formatCashPromo, formatPromo } from './lib/money'
import { BRAND_NAME } from './lib/brand'
import { t as lex } from './lib/lexicon'
import { installMotionVars } from './design/motion'
import { KringLogo, KringMark, LOGO_FLOW_EVENT, flowLogo } from './components/ui/KringMark'
import { BalanceMenu, HeaderGift } from './components/ui/KringHeader'
import { openRewards, useRewardsReady } from './components/rewards/rewardsModel'
import { usePlanStore } from './lib/planStore'
import { guestHeldNow } from './components/wallet/bookingMoney'
import KringLaunch, { useKringLaunch } from './components/ui/KringLaunch'
import { LIVE_SHOWN_EVENT } from './context/presence'
import { installAudioWarmup } from './lib/sfx'
import MyProfile, { type MyProfileSheet } from './components/profile/MyProfile'
import { installKringBridge } from './lib/kringBridge'
import { EDIT_PROFILE_EVENT } from './lib/selfGuard'
import BackgroundStage from './components/ui/BackgroundStage'
import { RollingBaht } from './components/wallet/kringKit'
import TopIsland, { showIsland } from './components/ui/TopIsland'
import FullGuide from './components/help/FullGuide'
import { openGuide } from './lib/guideContent'
import './styles/shell.css'
import PriceSkeleton from './components/price/PriceSkeleton'

// Atlas contracts: D owns the one top-up sheet and the Safety Center host; App only mounts them (lazy, render-null until opened).
const TopUpSheet = lazyRetry(() => import('./components/wallet/TopUpSheet'))
const SafetyCenterHost = lazyRetry(() => import('./components/safety/SafetyCenterHost'))

// Warm the chunk the user is most likely to open next, after the first paint has settled.
const prefetchTabChunks = () => {
  const run = () => {
    void import('./components/chat/ChatsAndPlansTab')
    void import('./components/pulse/BkkPulseTab')
    void import('./components/vip/AgencyAndReferralHub')
  }
  if (typeof window === 'undefined') return
  const w = window as Window & { requestIdleCallback?: (cb: () => void) => number }
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(run)
  } else {
    w.setTimeout(run, 1500)
  }
}


/** Atlas A14 · loading skeleton: soft card shapes in the real layout, ONE light sweep, then still. */
function LazyFallback({ label, variant = 'grid' }: { label: string; variant?: 'grid' | 'list' }) {
  return (
    <div role="status" className="sh-skel" aria-busy="true">
      <span className="sr-only">{label}</span>
      {variant === 'grid' ? (
        <>
          <div className="sh-skel-chips" aria-hidden="true"><i /><i /><i /><i /></div>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="sh-skel-card" aria-hidden="true" style={{ ['--d' as string]: `${i * 60}ms` }} />
          ))}
        </>
      ) : (
        [0, 1, 2, 3].map((i) => <div key={i} className="sh-skel-line" aria-hidden="true" />)
      )}
    </div>
  )
}

/** Island copy for a ledger movement — baht only (the ledger stays in coins internally: 1 coin = ฿0.01). */
/** KRING T3 · you never see yourself in the Experiences feed (when you share experiences of your own) */
function isSelfName(name: string, displayName: string | null | undefined): boolean {
  return name.trim().toLowerCase() === (displayName ?? '').trim().toLowerCase()
}

function islandForCoins(p: { delta: number; label?: string; mode?: 'gain' | 'hold' | 'spend' }): { text: string; tone: 'gold' | 'green' | 'neutral'; icon: string } {
  const amount = formatBaht(Math.abs(p.delta))
  if (p.mode === 'hold') return { text: `${amount} held · until you meet`, tone: 'gold', icon: '🔒' }
  if (p.delta >= 0) {
    const won = p.label === 'Won!'
    return { text: `+${amount}${won ? ' · gift tray' : ' added'}`, tone: 'gold', icon: '฿' }
  }
  return { text: `−${amount} spent`, tone: 'neutral', icon: '฿' }
}


function getFounderUrlTestCoins(): number {
  if (typeof window === 'undefined') return 0
  try {
    const params = new URLSearchParams(window.location.search)
    const rawParam = params.get('coins')
    if (rawParam) {
      const parsed = Number(rawParam)
      if (Number.isFinite(parsed) && parsed > 0) {
        window.sessionStorage.setItem('chon_founder_test_coins', String(Math.floor(parsed)))
        return Math.floor(parsed)
      }
    }
    const stored = Number(window.sessionStorage.getItem('chon_founder_test_coins') ?? '0')
    if (Number.isFinite(stored) && stored > 0) {
      return Math.floor(stored)
    }
  } catch {
    // ignore storage / URL errors
  }
  return 0
}

function hasFounderUrlCoins(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('coins')
  } catch {
    return false
  }
}

function getInitialWalletForSession(session: AuthSession | null): {
  paid: number
  bonus: number
  spentToday: number
} {
  // NEXT95 · the night stays the night: a demo session picks tonight's saved wallet back up after a reload
  // (a ?coins= founder URL still wins; real sessions never read it)
  if (session?.isDemoMode && !hasFounderUrlCoins()) {
    const saved = readDemoWallet(session.userId)
    if (saved) return saved
  }
  return { ...getBaseWalletForSession(session), spentToday: 0 }
}

function getBaseWalletForSession(session: AuthSession | null): {
  paid: number
  bonus: number
} {
  const founderCoins = getFounderUrlTestCoins()
  if (!session) return { paid: founderCoins, bonus: 0 }
  if (founderCoins > 0) {
    return { paid: founderCoins, bonus: session.isDemoMode ? MEET_STARTING_COINS : 0 }
  }
  if (session.isDemoMode) {
    return { paid: 0, bonus: MEET_STARTING_COINS }
  }
  if (session.userId === 'demo-traveler') {
    return { paid: MEET_STARTING_COINS, bonus: 0 }
  }
  return { paid: 0, bonus: 0 }
}

function AppShell() {
  const {
    session,
    isAgeConfirmed,
    isConductAccepted,
    canProceed,
    confirmAge20Plus,
    acceptCodeOfConduct,
    signOut,
    signIn,
  } = useAuth()

  const [initialWallet] = useState(() => getInitialWalletForSession(session))
  // Kring R4 · the app always opens on Experiences (persistent sign-in; no login screen until "Log out of this device")
  const [tab, setTab] = useState<TabId>('meet')
  const pillRef = useRef<HTMLSpanElement>(null)
  const rewardsReady = useRewardsReady()
  const [showProfile, setShowProfile] = useState(false)
  // which sheet My profile opens on (the Wallet's role pill asks for the role sheet)
  const [profileSheet, setProfileSheet] = useState<MyProfileSheet>(null)
  // KRING FIX3 · Marco 1: build the AudioContext at boot (idle), resume it on gestures — never on a contact frame / send
  useEffect(() => installAudioWarmup(), [])
  // KRING VISUAL V2 · no avatar / Live dot in the header any more. Going Live is one of the ring logo's special
  // moments: on the Go Live contact frame (LIVE_SHOWN_EVENT) blue and gold flow once through the header rings.
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent<{ state?: string }>).detail?.state === 'live') flowLogo()
    }
    window.addEventListener(LIVE_SHOWN_EVENT, on)
    return () => window.removeEventListener(LIVE_SHOWN_EVENT, on)
  }, [])
  // Kring integration: go-live venue setting mirrored between My profile (presence) and planStore (Local home / offers)
  useEffect(() => installKringBridge(), [session?.userId])
  // older Wallet role pill (K5 `kring:open-roles`) → My profile (KRING T3: no role sheet); we take it, so the Wallet skips its fallback;
  // your own card's quiet ✎ Edit (K2 `kring:edit-profile`) → My profile
  useEffect(() => {
    const onRoles = (e: Event) => {
      const d = (e as CustomEvent<{ handled?: boolean }>).detail
      if (d && typeof d === 'object') d.handled = true
      e.preventDefault()
      // KRING T3 · no role sheet any more (no modes): an old role pill just opens My profile
      setProfileSheet(null)
      setShowProfile(true)
    }
    const onEditProfile = () => {
      setProfileSheet(null)
      setShowProfile(true)
    }
    window.addEventListener('kring:open-roles', onRoles)
    window.addEventListener(EDIT_PROFILE_EVENT, onEditProfile)
    return () => {
      window.removeEventListener('kring:open-roles', onRoles)
      window.removeEventListener(EDIT_PROFILE_EVENT, onEditProfile)
    }
  }, [])
  const launch = useKringLaunch(Boolean(session), () => {
    setTab('meet')
    setShowProfile(false)
  })
  useEffect(() => installMotionVars(), [])
  const [profileName, setProfileName] = useState<string | undefined>(() => {
    try {
      return readProfile()?.name
    } catch {
      return undefined
    }
  })
  // KRING FIX1 · real names everywhere: the profile name, else a non-placeholder session name — never "Demo Traveler"
  const myName = (!isGenericName(profileName) ? profileName : '') || (!isGenericName(session?.displayName) ? session?.displayName ?? '' : '')
  const [, setProfilePhoto] = useState<string | undefined>(() => {
    try {
      return readProfile()?.photo
    } catch {
      return undefined
    }
  })
  useEffect(() => {
    const onProfile = (e: Event) => {
      const d = (e as CustomEvent<{ photo?: string; name?: string }>).detail
      setProfilePhoto(d?.photo)
      try {
        setProfileName(d?.name ?? readProfile()?.name)
      } catch {
        /* ignore */
      }
    }
    const onEdit = () => {
      setShowProfile(false)
      setNeedsOnboarding(true)
    }
    window.addEventListener('chon:profile-updated', onProfile)
    window.addEventListener('chon:open-onboarding', onEdit)
    return () => {
      window.removeEventListener('chon:profile-updated', onProfile)
      window.removeEventListener('chon:open-onboarding', onEdit)
    }
  }, [])
  // UX-P7 · free-coin habit: how many daily tasks were claimed today (display only; coins are credited by the existing handlers)
  const TASKS_PER_DAY = 3
  const [, setTasksDoneToday] = useState<number>(() => {
    try {
      const raw = JSON.parse(window.localStorage.getItem('chon_tasks_today_v1') ?? 'null') as { day: string; n: number } | null
      return raw && raw.day === new Date().toDateString() ? raw.n : 0
    } catch {
      return 0
    }
  })
  const bumpTasksDone = () =>
    setTasksDoneToday((n) => {
      const next = Math.min(TASKS_PER_DAY, n + 1)
      try {
        const prev = JSON.parse(window.localStorage.getItem('chon_tasks_today_v1') ?? 'null') as { day?: string; ids?: unknown } | null
        const ids = prev && prev.day === new Date().toDateString() && Array.isArray(prev.ids) ? prev.ids : []
        window.localStorage.setItem('chon_tasks_today_v1', JSON.stringify({ day: new Date().toDateString(), n: next, ids }))
      } catch {
        // ignore
      }
      return next
    })
  // Atlas integration #6: tasks DONE today (not yet claimed) — fed by `chon:task-done {id|task}` from Meet / StoryViewer.
  // Persisted in the same sessionStorage key the Rewards hub reads, so its row flips to Claim even if it was closed.
  // Display only: coins are still credited by the Tasks drawer's existing claim handler.
  const TASK_READY_KEY = 'chon_task_ready_v1'
  // R4 Wei B4 · today's done tasks also live in localStorage (`chon_tasks_today_v1.ids`, reset at midnight), so a reload
  // or a new tab keeps the progress; they are mirrored back into the session key the Rewards hub reads.
  const readTodayIds = (): string[] => {
    try {
      const raw = JSON.parse(window.localStorage.getItem('chon_tasks_today_v1') ?? 'null') as { day?: string; ids?: unknown } | null
      return raw && raw.day === new Date().toDateString() && Array.isArray(raw.ids) ? raw.ids.filter((x): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  }
  const writeTodayIds = (ids: string[]) => {
    try {
      const raw = JSON.parse(window.localStorage.getItem('chon_tasks_today_v1') ?? 'null') as { day?: string; n?: number } | null
      const today = new Date().toDateString()
      const n = raw && raw.day === today && typeof raw.n === 'number' ? raw.n : 0
      window.localStorage.setItem('chon_tasks_today_v1', JSON.stringify({ day: today, n, ids }))
    } catch {
      // storage blocked
    }
  }
  const [, setReadyTaskIds] = useState<string[]>(() => {
    let session: string[] = []
    try {
      const v = JSON.parse(window.sessionStorage.getItem(TASK_READY_KEY) ?? '[]') as unknown
      session = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
    } catch {
      session = []
    }
    const merged = Array.from(new Set([...session, ...readTodayIds()]))
    if (merged.length > session.length) {
      try {
        window.sessionStorage.setItem(TASK_READY_KEY, JSON.stringify(merged))
      } catch {
        // ignore
      }
    }
    return merged
  })
  useEffect(() => {
    const onTaskDone = (e: Event) => {
      const d = (e as CustomEvent<{ id?: string; task?: string }>).detail
      const id = d?.id ?? d?.task
      if (!id) return
      setReadyTaskIds((prev) => {
        let stored: string[] = []
        try {
          const v = JSON.parse(window.sessionStorage.getItem(TASK_READY_KEY) ?? '[]') as unknown
          stored = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
        } catch {
          stored = []
        }
        const merged = Array.from(new Set([...prev, ...stored, id]))
        try {
          window.sessionStorage.setItem(TASK_READY_KEY, JSON.stringify(merged))
        } catch {
          // ignore
        }
        writeTodayIds(merged)
        return merged.length === prev.length ? prev : merged
      })
    }
    window.addEventListener('chon:task-done', onTaskDone)
    return () => window.removeEventListener('chon:task-done', onTaskDone)
  }, [])
  const [storyCameraSignal, setStoryCameraSignal] = useState(0)
  const camFromHome = useRef(false)
  useEffect(() => {
    // HostHome 📸 Story quick action (R3 Ploy: event had no listener) → show the feed and open the story camera
    const openCam = () => { camFromHome.current = true; setTab('meet'); setStoryCameraSignal(n => n + 1) }
    // ROUND5 Ploy B5 · posting (or closing) the camera opened from Host home lands back on Host home, not other hosts
    const backHome = () => {
      if (!camFromHome.current) return
      camFromHome.current = false
      window.scrollTo?.({ top: 0 })
    }
    window.addEventListener('chon:open-story-camera', openCam)
    window.addEventListener('chon:host-story-posted', backHome)
    window.addEventListener('chon:story-camera-closed', backHome)
    return () => {
      window.removeEventListener('chon:open-story-camera', openCam)
      window.removeEventListener('chon:host-story-posted', backHome)
      window.removeEventListener('chon:story-camera-closed', backHome)
    }
  }, [])
  // UX-P8 · step-by-step profile once per account (not for agency portals)
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean>(() => {
    try {
      return !readProfile()
    } catch {
      return false
    }
  })
  const [showLoginSheet, setShowLoginSheet] = useState(false)
  const [previewNote, setPreviewNote] = useState<string | null>(null)
  useEffect(() => {
    // the note used to be an in-flow banner on the Wallet tab only; keep that scope (other tabs have their own island lines)
    if (!previewNote || tab !== 'vip') return
    const payout = previewNote.match(/^PromptPay payout #\d+ queued — ฿([\d,]+)/)
    const warn = /^⚠️/.test(previewNote)
    const text = payout
      ? language === 'th'
        ? `฿${payout[1]} โอนเข้าพร้อมเพย์แล้ว`
        : `฿${payout[1]} sent to PromptPay`
      : previewNote.replace(/^[⚠️🎁📸]\uFE0F?\s*/u, '')
    window.dispatchEvent(
      new CustomEvent('chon:island', {
        detail: { text, tone: warn ? 'red' : payout ? 'green' : 'neutral', icon: warn ? '!' : payout ? '✓' : undefined, ms: 3200 },
      }),
    )
  }, [previewNote]) // eslint-disable-line react-hooks/exhaustive-deps
  const [paidCoins, setPaidCoins] = useState(initialWallet.paid)
  const [bonusCoins, setBonusCoins] = useState(initialWallet.bonus)
  const [paidCoinsSpentToday, setPaidCoinsSpentToday] = useState(initialWallet.spentToday)
  // NEXT95 · demo only: every wallet change is written to tonight's snapshot (src/lib/demoState.ts)
  useEffect(() => {
    if (!session?.isDemoMode) return
    // only once the wallet state belongs to THIS session (a fresh sign-in renders once with the old numbers first)
    if (prevSessionKeyRef.current !== `${session.userId}:${session.role}:${Boolean(session.isDemoMode)}`) return
    writeDemoWallet(session.userId, { paid: paidCoins, bonus: bonusCoins, spentToday: paidCoinsSpentToday })
  }, [session?.isDemoMode, session?.userId, paidCoins, bonusCoins, paidCoinsSpentToday])
  // Depth build: header pill rolls its baht figure (Odometer) and flips the coin once whenever the figure changes.
  // KRING FIX1 · Marco 6 "one clock": the header pill, the Wallet card digits and the cash line all read the SAME rolled
  // snapshot (walletKit.useRolledBalance) — it holds a top-up gain until the sheet closes, then every figure rolls together.
  const shownBal = useRolledBalance(paidCoins, bonusCoins)
  // FIX3 · Wei r4 — the balance broadcast must not depend on the Wallet tab being mounted: sheets on other tabs
  // (Book a local, Ask several locals, offer card) read lastKnownBalance() to clear their short-cash line.
  useEffect(() => { broadcastBalance({ paidCoins, bonusCoins }) }, [paidCoins, bonusCoins])
  // KRING FIX2 · Marco 3 / Wei 4 — one money truth: the pill is the CASH you can spend on bookings, the same number as
  // the Wallet card's cash line; promo is never added in (it is listed separately, in Wallet and the sr label).
  const shownHeaderBaht = Math.round(shownBal.paid / 100)
  const coinFlipKey = shownBal.gainKey
  // KRING T3 · no modes: "hosting" is derived from activity (listed experiences / requests as the local)
  const hosting = useHosting()
  // KRING VISUAL V2 · header: the ฿ pill menu (cash · promo · held), the logo's full flow on special moments, and the
  // pill ↔ Me card morph
  const [balMenu, setBalMenu] = useState(false)
  const [logoFlow, setLogoFlow] = useState(0)
  useEffect(() => {
    const on = () => setLogoFlow((n) => n + 1)
    window.addEventListener(LOGO_FLOW_EVENT, on)
    return () => window.removeEventListener(LOGO_FLOW_EVENT, on)
  }, [])
  // a top-up landing is one of the logo's special moments (the gain clock ticks once per credited top-up)
  useEffect(() => {
    if (coinFlipKey > 0) setLogoFlow((n) => n + 1)
  }, [coinFlipKey])
  const planState = usePlanStore()
  const heldNowThb = guestHeldNow(planState).thb
  const [clinkHost, setClinkHostRaw] = useState<MeetHost | null>(null)
  // KRING FIX2: the legacy ClinkGiftSheet only opens under LEGACY_UI — real users book through Book a local
  const setClinkHost = useCallback((h: MeetHost | null) => setClinkHostRaw(LEGACY_UI ? h : null), [])
  const [showTasksDrawer, setShowTasksDrawer] = useState(false)
  const [showHelpOverlay, setShowHelpOverlay] = useState(false)
  const [helpSection, setHelpSection] = useState<HelpSectionId>('meet')
  const [topCoinPopup, setTopCoinPopup] = useState<{
    delta: number
    prevBalance: number
    newBalance: number
    label?: string
    mode?: 'gain' | 'hold' | 'spend'
  } | null>(null)
  const topCoinPopupTimerRef = useRef<number | null>(null)

  const prevSessionKeyRef = useRef<string>(
    session ? `${session.userId}:${session.role}:${Boolean(session.isDemoMode)}` : 'none',
  )
  useEffect(() => {
    const nextKey = session
      ? `${session.userId}:${session.role}:${Boolean(session.isDemoMode)}`
      : 'none'
    if (prevSessionKeyRef.current !== nextKey) {
      const prev = prevSessionKeyRef.current
      prevSessionKeyRef.current = nextKey
      const nextWallet = getInitialWalletForSession(session)
      setPaidCoins(nextWallet.paid)
      setBonusCoins(nextWallet.bonus)
      setPaidCoinsSpentToday(nextWallet.spentToday)
      setClinkHost(null)
      // a role switch (My profile) keeps you where you are; a new sign-in lands on Experiences
      const sameUser = session && prev.split(':')[0] === session.userId
      // the Agency Portal door is a business login: it lands on the agency dashboard (Wallet); everyone else on Experiences
      if (session && !sameUser) setTab(session.role === 'agency' ? 'vip' : 'meet')
    }
  }, [session])

  const triggerTopCoinPopup = useCallback(
    (payload: {
      delta: number
      prevBalance: number
      newBalance: number
      label?: string
      mode?: 'gain' | 'hold' | 'spend'
    }) => {
      setTopCoinPopup(payload)
      // Atlas A12: every coin moment shows in the ONE top island (the sr-only mirror below keeps the legacy test id)
      if (payload.delta !== 0) showIsland({ ...islandForCoins(payload), ms: 2500, action: 'wallet' })
      if (topCoinPopupTimerRef.current) {
        window.clearTimeout(topCoinPopupTimerRef.current)
      }
      topCoinPopupTimerRef.current = window.setTimeout(() => {
        setTopCoinPopup(null)
      }, 2600)
    },
    [],
  )

  const { language } = useLanguage()
  const [hasPostedStoryToday, setHasPostedStoryToday] = useState(false)

  useEffect(() => {
    const handleStoryPosted = () => setHasPostedStoryToday(true)
    window.addEventListener('chon:story-posted', handleStoryPosted)
    return () => window.removeEventListener('chon:story-posted', handleStoryPosted)
  }, [])

  // UX-P5 rule 3: passive anti-screenshot armor (blur on hide/blur, block long-press save)
  useEffect(() => installScreenshotArmor(), [])
  useEffect(() => installImageFallback(), [])
  // NEXT95 · ONE tilt space for the whole app (stage, cards, rings, portraits, metal card read --tx/--ty)
  useEffect(() => startTilt(), [])

  // Swarm P24/P26: a focus() on an off-canvas sr-only control can pan the viewport sideways; snap it back.
  useEffect(() => {
    const snap = () => {
      if (window.scrollX !== 0) window.scrollTo(0, window.scrollY)
    }
    window.addEventListener('scroll', snap, { passive: true })
    return () => window.removeEventListener('scroll', snap)
  }, [])

  // Overnight U10: quiet offline pill (cached passes & QR still work)
  const [isOffline, setIsOffline] = useState<boolean>(() => typeof navigator !== 'undefined' && navigator.onLine === false)
  const offlineText = language === 'th' ? 'ออฟไลน์ · บัตรและ QR ที่บันทึกไว้ยังใช้ได้' : language === 'zh' ? '离线 · 已缓存的通行证和二维码仍可使用' : 'Offline · saved passes & QR still work'
  useEffect(() => {
    if (isOffline) {
      showIsland({ key: 'offline', sticky: true, text: offlineText, tone: 'neutral', testId: 'offline-status-pill' })
    } else {
      window.dispatchEvent(new CustomEvent('chon:island-dismiss', { detail: { key: 'offline' } }))
    }
  }, [isOffline, offlineText])
  useEffect(() => {
    const goOff = () => setIsOffline(true)
    const goOn = () => setIsOffline(false)
    window.addEventListener('offline', goOff)
    window.addEventListener('online', goOn)
    return () => {
      window.removeEventListener('offline', goOff)
      window.removeEventListener('online', goOn)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      const activeOverlay = document.querySelector<HTMLElement>('[data-scrollable-overlay="true"]')
      const scrollStep = 110
      const pageStep = Math.round(window.innerHeight * 0.75)

      const scrollByAmount = (delta: number) => {
        if (activeOverlay) {
          activeOverlay.scrollBy({ top: delta, behavior: 'smooth' })
        } else {
          window.scrollBy({ top: delta, behavior: 'smooth' })
        }
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        scrollByAmount(scrollStep)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        scrollByAmount(-scrollStep)
      } else if (event.key === 'PageDown') {
        event.preventDefault()
        scrollByAmount(pageStep)
      } else if (event.key === 'PageUp') {
        event.preventDefault()
        scrollByAmount(-pageStep)
      } else if (event.key === 'Home') {
        event.preventDefault()
        if (activeOverlay) {
          activeOverlay.scrollTo({ top: 0, behavior: 'smooth' })
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      } else if (event.key === 'End') {
        event.preventDefault()
        if (activeOverlay) {
          activeOverlay.scrollTo({ top: activeOverlay.scrollHeight, behavior: 'smooth' })
        } else {
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const detail = (event as CustomEvent<{
        tab?: TabId
        openTasks?: boolean
        closeTasks?: boolean
        target?: string
      }>).detail
      if (!detail) return
      if (detail.tab) {
        tabHistoryRef.current = [...tabHistoryRef.current.slice(-8), detail.tab]
        try {
          window.history.pushState({ chonTab: detail.tab }, '')
        } catch {
          // ignore
        }
        setClinkHost(null)
        setTab(detail.tab)
      }
      // KRING VISUAL V2 · the rewards sheet ("Earn reward 555") replaced the legacy tasks drawer
      if (detail.openTasks) {
        if (LEGACY_UI) setShowTasksDrawer(true)
        else openRewards()
      }
      if (detail.closeTasks) setShowTasksDrawer(false)
      if (detail.target) {
        if (
          detail.target === 'watch-story' ||
          detail.target === 'vibe-check' ||
          detail.target === 'toast-stories'
        ) {
          setShowTasksDrawer(false)
          setTab('meet')
          // R4 Wei B4 · all three daily tasks happen inside a story (watch 2 s · reply = vibe · 🥂 = toast): open it,
          // with the coach line for this task. The viewer parks the request until Meet has mounted.
          const task = detail.target
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('chon:open-story', { detail: { task } }))
          }, 260)
        } else if (
          detail.target === 'first-lucky-dice' ||
          detail.target === 'lucky-dice-gift'
        ) {
          setShowTasksDrawer(false)
          setTab('meet')
          setClinkHost(DEMO_MEET_HOSTS[0] ?? null)
        } else if (detail.target === 'peek-jackpot') {
          setShowTasksDrawer(true)
        }
      }
    }
    window.addEventListener('chon:navigate', handleNavigate)
    return () => window.removeEventListener('chon:navigate', handleNavigate)
  }, [])

  useEffect(() => {
    const handleCrossTabOpenChat = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (!detail) return
      try {
        window.sessionStorage.setItem('chon_pending_open_chat', JSON.stringify(detail))
      } catch {
        // ignore
      }
    }
    const handleCrossTabDirectMsg = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (!detail) return
      try {
        window.sessionStorage.setItem('chon_pending_direct_msg', JSON.stringify(detail))
      } catch {
        // ignore
      }
    }
    const handleCrossTabOpenChatWithMsg = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (!detail) return
      try {
        window.sessionStorage.setItem('chon_pending_direct_msg', JSON.stringify(detail))
      } catch {
        // ignore
      }
      setClinkHost(null)
      setTab('chats')
    }
    const handleCrossTabSendPass = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (!detail) return
      try {
        window.sessionStorage.setItem('chon_latest_sent_pass', JSON.stringify(detail))
      } catch {
        // ignore
      }
    }
    window.addEventListener('chon:open-chat', handleCrossTabOpenChat)
    window.addEventListener('chon:send-direct-message', handleCrossTabDirectMsg)
    window.addEventListener('chon:open-chat-with-message', handleCrossTabOpenChatWithMsg)
    window.addEventListener('chon:send-pass-to-chat', handleCrossTabSendPass)
    return () => {
      window.removeEventListener('chon:open-chat', handleCrossTabOpenChat)
      window.removeEventListener('chon:send-direct-message', handleCrossTabDirectMsg)
      window.removeEventListener('chon:open-chat-with-message', handleCrossTabOpenChatWithMsg)
      window.removeEventListener('chon:send-pass-to-chat', handleCrossTabSendPass)
    }
  }, [])

  const sessionRef = useRef(session)
  sessionRef.current = session
  const paidCoinsRef = useRef(paidCoins)
  const bonusCoinsRef = useRef(bonusCoins)
  useEffect(() => {
    paidCoinsRef.current = paidCoins
  }, [paidCoins])
  useEffect(() => {
    bonusCoinsRef.current = bonusCoins
  }, [bonusCoins])

  useEffect(() => {
    const handleWalletDelta = (event: Event) => {
      // BUG-001 Defense: Reject any raw CustomEvent('chon:wallet-delta') from DevTools console
      if (!isTrustedWalletEvent(event)) {
        return
      }
      const detail = (event as CustomEvent<WalletDeltaDetail>).detail
      if (!detail) return

      if (typeof detail.paidDelta === 'number' && detail.paidDelta !== 0) {
        const delta = detail.paidDelta
        // BUG-001 Defense: Positive paidDelta is blocked unless it is an internal escrow hold downward adjustment
        // Swarm review: a positive delta is only ever an escrow refund or a sandbox demo unlock — never a real top-up
        const isDemoMint = typeof detail.note === 'string' && detail.note.startsWith('🧪 Demo')
        // Integration fix: read the CURRENT session (this listener mounts before login, so `session` here was stale/null
        // and every sandbox demo top-up was rejected). Same rule: demo mints only inside a demo session.
        if (delta > 0 && (!detail.allowEscrowRefund || (isDemoMint && !sessionRef.current?.isDemoMode))) {
          detail.accepted = false
          return
        }
        const current = paidCoinsRef.current
        if (current + delta < 0) {
          detail.accepted = false
          detail.paidSpendRejected = true
          setPreviewNote('Not enough cash for that · top up in Wallet')
        } else {
          detail.accepted = true
          const next = current + delta
          paidCoinsRef.current = next
          setPaidCoins(next)
          if (!detail.hideGlobal) {
            triggerTopCoinPopup({
              delta,
              prevBalance: current,
              newBalance: next,
              label: detail.note,
              mode: delta > 0 ? 'gain' : 'spend',
            })
          }
          if (delta < 0) {
            setPaidCoinsSpentToday((spent) => spent + Math.abs(delta))
          }
        }
      }

      // Swarm/security #4: if the paid spend in the SAME event was rejected, do not pay the bundled bonus/prize
      if (typeof detail.bonusDelta === 'number' && detail.bonusDelta !== 0 && !detail.paidSpendRejected) {
        const bDelta = detail.bonusDelta
        const currentBonus = bonusCoinsRef.current
        if (currentBonus + bDelta < 0) {
          setPreviewNote('Not enough ฿ promo for that')
        } else {
          const nextBonus = currentBonus + bDelta
          bonusCoinsRef.current = nextBonus
          setBonusCoins(nextBonus)
          if (!detail.hideGlobal) {
            triggerTopCoinPopup({
              delta: bDelta,
              prevBalance: paidCoinsRef.current + currentBonus,
              newBalance: paidCoinsRef.current + nextBonus,
              label: detail.note,
              mode: bDelta > 0 ? 'gain' : 'spend',
            })
          }
        }
      }

      if (detail.note) {
        setPreviewNote(detail.note)
      }
    }
    window.addEventListener('chon:wallet-delta', handleWalletDelta)
    return () => window.removeEventListener('chon:wallet-delta', handleWalletDelta)
  }, [triggerTopCoinPopup])

  useEffect(() => {
    const handleCoinBalancePopup = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          delta: number
          prevBalance?: number
          newBalance?: number
          label?: string
          mode?: 'gain' | 'hold' | 'spend'
          hideGlobal?: boolean
        }>
      ).detail
      if (!detail || !detail.delta) return
      if (detail.hideGlobal) return
      const prevBal = detail.prevBalance ?? paidCoins
      const nextBal = detail.newBalance ?? Math.max(0, prevBal + detail.delta)
      triggerTopCoinPopup({
        delta: detail.delta,
        prevBalance: prevBal,
        newBalance: nextBal,
        label: detail.label,
        mode: detail.mode ?? (detail.delta >= 0 ? 'gain' : 'spend'),
      })
    }
    window.addEventListener('chon:coin-balance-popup', handleCoinBalancePopup)
    return () => window.removeEventListener('chon:coin-balance-popup', handleCoinBalancePopup)
  }, [paidCoins, triggerTopCoinPopup])

  useEffect(() => {
    const handleOpenHostProfile = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          hostName?: string
          hostId?: string
        }>
      ).detail
      if (!detail) return
      const rawName = (detail.hostName ?? '').replace(/^@/, '').split(/[_\s·(]/)[0]?.trim() || 'Mint'
      const isMaleVisitor = ['alex', 'kenji', 'somchai'].includes(rawName.toLowerCase())
      const malePhotoUrl =
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=640&q=85'
      const matched =
        DEMO_MEET_HOSTS.find(
          (h) =>
            h.id === detail.hostId ||
            h.name.toLowerCase() === rawName.toLowerCase(),
        ) ?? {
          ...(DEMO_MEET_HOSTS[0] as MeetHost),
          id: `host-${rawName.toLowerCase()}`,
          name: rawName,
          photo: isMaleVisitor ? malePhotoUrl : (DEMO_MEET_HOSTS[0] as MeetHost).photo,
          photos: isMaleVisitor ? [malePhotoUrl] : (DEMO_MEET_HOSTS[0] as MeetHost).photos,
        }
      setShowTasksDrawer(false)
      setClinkHost(matched)
      setPreviewNote(`📸 Opened ${matched.name}'s Verified Profile & 4-Photo Gallery!`)
    }
    window.addEventListener('chon:open-host-profile', handleOpenHostProfile)
    return () => window.removeEventListener('chon:open-host-profile', handleOpenHostProfile)
  }, [])

  useEffect(() => {
    const handleOpenHelpOverlay = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          section?: HelpSectionId
        }>
      ).detail
      // Atlas A13: every legacy "?" entry point now opens the ONE full-screen guide at the matching topic
      const section: HelpSectionId = detail?.section
        ? detail.section
        : showTasksDrawer
          ? 'games'
          : tab === 'meet' ? 'meet' : tab === 'pulse' ? 'pulse' : tab === 'chats' ? 'chats' : 'vip'
      setHelpSection(section)
      openGuide(section)
    }
    const handleOpenLoginSheet = () => setShowLoginSheet(true)
    const handleSignOutEvent = () => signOut()
    window.addEventListener('chon:open-help-overlay', handleOpenHelpOverlay)
    window.addEventListener('chon:open-login-sheet', handleOpenLoginSheet)
    window.addEventListener('chon:sign-out', handleSignOutEvent)
    return () => {
      window.removeEventListener('chon:open-help-overlay', handleOpenHelpOverlay)
      window.removeEventListener('chon:open-login-sheet', handleOpenLoginSheet)
      window.removeEventListener('chon:sign-out', handleSignOutEvent)
    }
  }, [tab, showTasksDrawer, signOut])

  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null)
  const [showInstallModal, setShowInstallModal] = useState(false)
  const [appInstalledBanner, setAppInstalledBanner] = useState(false)
  const [isChatRoomOpen, setIsChatRoomOpen] = useState(false)
  const tabHistoryRef = useRef<TabId[]>(['meet'])
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)

  useEffect(() => {
    const handleChatRoomState = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail
      if (detail && typeof detail.open === 'boolean') {
        setIsChatRoomOpen(detail.open)
      }
    }
    window.addEventListener('chon:chat-room-state', handleChatRoomState)
    return () => window.removeEventListener('chon:chat-room-state', handleChatRoomState)
  }, [])

  useBackEntry(balMenu, () => setBalMenu(false), { id: 'app-bal-menu', priority: 105 })

  const canGoBack =
    hasActiveBackEntries() ||
    balMenu ||
    showHelpOverlay ||
    showInstallModal ||
    showLoginSheet ||
    Boolean(clinkHost) ||
    showTasksDrawer ||
    tab !== 'meet'

  const handleGoBack = useCallback(() => {
    triggerHaptic('tap')
    if (popTopBackEntry()) {
      return true
    }
    if (balMenu) {
      setBalMenu(false)
      return true
    }
    if (showHelpOverlay) {
      setShowHelpOverlay(false)
      return true
    }
    if (showInstallModal) {
      setShowInstallModal(false)
      return true
    }
    if (showLoginSheet) {
      setShowLoginSheet(false)
      return true
    }
    if (clinkHost) {
      setClinkHost(null)
      return true
    }
    if (showTasksDrawer) {
      setShowTasksDrawer(false)
      return true
    }
    if (tab !== 'meet') {
      const history = tabHistoryRef.current
      if (history.length > 1) {
        history.pop()
        const prev = history[history.length - 1] ?? 'meet'
        setTab(prev)
      } else {
        setTab('meet')
      }
      return true
    }
    return false
  }, [balMenu, showHelpOverlay, showInstallModal, showLoginSheet, clinkHost, showTasksDrawer, tab, setClinkHost])

  useGlobalBackNavigation(handleGoBack)

  const handleSelectTab = useCallback((nextTab: TabId) => {
    setClinkHost(null)
    setShowTasksDrawer(false)
    setShowInstallModal(false)
    setTopCoinPopup(null)
    if (nextTab !== 'chats') {
      setIsChatRoomOpen(false)
    }
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      try {
        window.scrollTo({ top: 0 })
      } catch {
        // ignore in jsdom
      }
    }
    setTab((prev) => {
      if (prev !== nextTab) {
        tabHistoryRef.current = [...tabHistoryRef.current.slice(-8), nextTab]
        try {
          window.history.pushState({ chonTab: nextTab, kringRootGuard: true }, '')
        } catch {
          // ignore in restricted environments
        }
      }
      return nextTab
    })
  }, [setClinkHost])

  useEffect(() => {
    if (clinkHost || showTasksDrawer || showInstallModal || showLoginSheet) {
      try {
        window.history.pushState({ chonOverlay: true, kringRootGuard: true }, '')
      } catch {
        // ignore
      }
    }
  }, [clinkHost, showTasksDrawer, showInstallModal, showLoginSheet])

  // OPUS-A8: Escape dismisses the top-most sheet/overlay (keyboard + desktop-evaluator parity with swipe-back)
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (hasActiveBackEntries() || balMenu || showHelpOverlay || showInstallModal || showLoginSheet || clinkHost || showTasksDrawer) {
        event.preventDefault()
        handleGoBack()
      }
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [handleGoBack, balMenu, showHelpOverlay, showInstallModal, showLoginSheet, clinkHost, showTasksDrawer])

  const handleTouchStartGesture = (e: React.TouchEvent<HTMLElement>) => {
    const target = e.target as HTMLElement | null
    if (target && target.closest('[data-horizontal-scroll="true"]')) {
      touchStartRef.current = null
      return
    }
    const touch = e.touches[0]
    if (!touch) return
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    }
  }

  const handleTouchEndGesture = (e: React.TouchEvent<HTMLElement>) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    const touch = e.changedTouches[0]
    if (!start || !touch) return

    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    const elapsed = Date.now() - start.time
    if (elapsed > 650) return

    // 1. Pull-Down Gesture on Open Sheets only (when near top of scroll)
    const activeOverlay = document.querySelector<HTMLElement>('[data-scrollable-overlay="true"]')
    const overlayAtTop = !activeOverlay || activeOverlay.scrollTop <= 16
    const isSwipeDownSheet = dy > 85 && Math.abs(dx) < 65 && overlayAtTop
    if (isSwipeDownSheet && (clinkHost || showTasksDrawer || showInstallModal)) {
      handleGoBack()
    }
  }

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
  }, [])

  const handleInstallMobileApp = async () => {
    triggerHaptic('clink')
    if (deferredInstallPrompt && typeof deferredInstallPrompt.prompt === 'function') {
      try {
        await deferredInstallPrompt.prompt()
        setDeferredInstallPrompt(null)
        setAppInstalledBanner(true)
        return
      } catch {
        // fallback to modal
      }
    }
    setShowInstallModal(true)
  }

  const handleSendTreat = (_treat: ThaiVibeTreat, coins: number) => {
    const current = paidCoinsRef.current
    const attempt = trySpendPaidCoins(current, coins)
    if (!attempt.ok) return
    paidCoinsRef.current = attempt.nextPaidCoins
    setPaidCoins(attempt.nextPaidCoins)
    triggerTopCoinPopup({
      delta: -coins,
      prevBalance: current + bonusCoinsRef.current,
      newBalance: attempt.nextPaidCoins + bonusCoinsRef.current,
      mode: 'hold',
    })
    setPaidCoinsSpentToday((spent) => spent + coins)
  }

  const handleSendLuckyGift = (
    _gift: LuckyChonGift,
    _quantity: number,
    coins: number,
    rewardCoins = 0,
  ) => {
    const current = paidCoinsRef.current
    const attempt = trySpendPaidCoins(current, coins)
    if (!attempt.ok) return
    paidCoinsRef.current = attempt.nextPaidCoins
    setPaidCoins(attempt.nextPaidCoins)
    if (rewardCoins > 0) {
      const currentBonus = bonusCoinsRef.current
      const nextBonus = currentBonus + rewardCoins
      bonusCoinsRef.current = nextBonus
      setBonusCoins(nextBonus)
      triggerTopCoinPopup({
        delta: rewardCoins,
        prevBalance: attempt.nextPaidCoins + currentBonus,
        newBalance: attempt.nextPaidCoins + nextBonus,
        label: 'Won!',
        mode: 'gain',
      })
    }
    setPaidCoinsSpentToday((spent) => spent + coins)
  }

  const handleClaimTutorialStep = (_stepId: string, rewardBonusCoins: number) => {
    bumpTasksDone()
    const currentBonus = bonusCoinsRef.current
    const nextBonus = currentBonus + rewardBonusCoins
    bonusCoinsRef.current = nextBonus
    setBonusCoins(nextBonus)
    triggerTopCoinPopup({
      delta: rewardBonusCoins,
      prevBalance: paidCoinsRef.current + currentBonus,
      newBalance: paidCoinsRef.current + nextBonus,
      mode: 'gain',
    })
  }

  const handleClaimGameTask = (
    _gameId: string,
    rewardBonusCoins: number,
    boosterCoins: number,
  ) => {
    const totalGain = rewardBonusCoins + boosterCoins
    bumpTasksDone()
    const currentBonus = bonusCoinsRef.current
    const nextBonus = currentBonus + totalGain
    bonusCoinsRef.current = nextBonus
    setBonusCoins(nextBonus)
    triggerTopCoinPopup({
      delta: totalGain,
      prevBalance: paidCoinsRef.current + currentBonus,
      newBalance: paidCoinsRef.current + nextBonus,
      mode: 'gain',
    })
  }

  const handlePlayGame = ({ gameId }: GamePlayResult) => {
    const game = MINI_GAMES.find((candidate) => candidate.id === gameId)
    if (!game) return
    const attempt = trySpendPaidCoins(paidCoins, game.costCoins)
    if (!attempt.ok) return
    setPaidCoins((current) => {
      const check = trySpendPaidCoins(current, game.costCoins)
      return check.ok ? check.nextPaidCoins : current
    })
    setPaidCoinsSpentToday((current) => current + game.costCoins)
  }

  const handleEarnRebateCoins = (_coins: number, label: string) => {
    // Security #3: affiliate rebates credit ONLY after the partner's server-to-server webhook confirms the purchase.
    // A client tap must never mint paid coins — show the stop-point instead of crediting anything.
    setPreviewNote(
      `⏳ Awaiting Real-World partner confirmation — ${label} rebate credits only after the partner confirms your purchase`,
    )
  }

  // UX-P3: a first-time user scrolls the login sheet to reach the demo/LINE buttons; that scroll offset used to
  // survive into the app, so the first Meet screen opened mid-grid with no header or story rail visible.
  useEffect(() => {
    if (!session || !canProceed) return
    try {
      window.scrollTo({ top: 0 })
    } catch {
      // jsdom
    }
    prefetchTabChunks()
  }, [session, canProceed])

  // Atlas A10 · scroll-edge shadow: the header gets its soft shadow only once content has scrolled under it.
  const [headerScrolled, setHeaderScrolled] = useState(false)
  useEffect(() => {
    let raf = 0
    const read = () => {
      raf = 0
      const y = window.scrollY || document.documentElement.scrollTop || 0
      setHeaderScrolled((prev) => (prev === y > 4 ? prev : y > 4))
    }
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(read)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [])

  // Atlas A15 · install is offered ONCE, after the first clink is held (not at boot). `chon:offer-install` opens it on demand.
  // R4 Marco 1 / Wei B10 · it never stacks on another sheet: the offer waits until EVERY sheet/dialog is closed and at
  // least a minute has passed since the Clink, then opens on the next quiet moment (checked every 4 s, ≤ 10 min).
  useEffect(() => {
    let poll = 0
    let heldAt = 0
    const open = () => setShowInstallModal(true)
    const stop = () => {
      if (poll) window.clearInterval(poll)
      poll = 0
    }
    const tryOpen = () => {
      if (!heldAt) return stop()
      const since = Date.now() - heldAt
      if (since > 10 * 60_000) return stop()
      if (since < 60_000 || isAnySheetOpen() || document.hidden) return
      stop()
      heldAt = 0
      open()
    }
    const onOffer = (event: Event) => {
      const status = (event as CustomEvent<{ status?: string }>).detail?.status
      if (status !== 'HELD') return
      try {
        if (window.localStorage.getItem('chon_install_offered_v1')) return
        if (window.matchMedia?.('(display-mode: standalone)').matches) return
        if (/jsdom/i.test(navigator.userAgent)) return
        window.localStorage.setItem('chon_install_offered_v1', '1')
      } catch {
        return
      }
      heldAt = Date.now()
      stop()
      poll = window.setInterval(tryOpen, 4000)
    }
    window.addEventListener('chon:offer-status', onOffer)
    window.addEventListener('chon:offer-install', open)
    return () => {
      window.removeEventListener('chon:offer-status', onOffer)
      window.removeEventListener('chon:offer-install', open)
      stop()
    }
  }, [])

  // R4 Wei B8/B9a · the page never scrolls behind an open sheet: any open modal dialog (Sheet, guide, story, lightbox…)
  // locks the document; the lock lifts the moment the last one closes. Scroll position is kept (overflow only).
  // KRING VISUAL V2 · perf: the lock is ONE class on <html> (html.is-sheet-locked → overflow hidden on html/body),
  // toggled inside the MutationObserver callback — i.e. in the same frame the sheet mounts, before its first style
  // pass — and decided WITHOUT layout reads (no getBoundingClientRect / scrollHeight in the open path).
  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
    const root = document.documentElement
    const sync = () => {
      const lock = isAnySheetOpen()
      if (lock !== root.classList.contains('is-sheet-locked')) root.classList.toggle('is-sheet-locked', lock)
    }
    // only mutations that can add/remove/hide a modal re-check
    const relevant = (n: Node | null): boolean =>
      !!n && n.nodeType === 1 && ((n as Element).matches(MODAL_SELECTOR) || !!(n as Element).querySelector(MODAL_SELECTOR))
    const onMutations = (records: MutationRecord[]) => {
      for (const r of records) {
        if (r.type === 'childList') {
          if (Array.from(r.addedNodes).some(relevant) || Array.from(r.removedNodes).some(relevant)) return sync()
        } else if (relevant(r.target)) {
          return sync()
        }
      }
    }
    const mo = new MutationObserver(onMutations)
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-modal', 'hidden'] })
    sync()
    return () => {
      mo.disconnect()
      root.classList.remove('is-sheet-locked')
    }
  }, [])

  // Atlas A16 · "Add another account" expands the compact sign-in inside the account sheet
  const [addingAccount, setAddingAccount] = useState(false)
  useEffect(() => {
    if (!showLoginSheet) setAddingAccount(false)
  }, [showLoginSheet])

  const [showPwaInstallBanner, setShowPwaInstallBanner] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('install') !== '1') return false
      if (window.matchMedia?.('(display-mode: standalone)').matches) return false
      return true
    } catch {
      return false
    }
  })
  const [pwaIosTip, setPwaIosTip] = useState(false)

  const pwaInstallBannerNode = showPwaInstallBanner ? (
    <div
      data-testid="pwa-install-banner"
      className="ux-card mx-2.5 mt-2 flex items-center justify-between gap-2 px-3.5 py-2.5"
    >
      <span className="text-xs font-semibold text-[var(--text-1)]">
        {pwaIosTip ? 'Tap Share ⬆️ → Add to Home Screen' : 'Full-screen Kring app · no browser bar'}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="ux-btn ux-btn-gold h-8 px-3 text-xs font-bold"
          onClick={async () => {
            triggerHaptic('select')
            if (deferredInstallPrompt && typeof deferredInstallPrompt.prompt === 'function') {
              try {
                await deferredInstallPrompt.prompt()
                setDeferredInstallPrompt(null)
                setShowPwaInstallBanner(false)
                return
              } catch {
                // fallback to iOS tip
              }
            }
            setPwaIosTip(true)
          }}
        >
          Install Kring App
        </button>
        <button
          type="button"
          className="ux-btn h-8 px-2.5 text-xs font-semibold text-[var(--text-2)]"
          onClick={() => setShowPwaInstallBanner(false)}
        >
          Continue
        </button>
      </div>
    </div>
  ) : null

  if (!session) {
    // Depth build: the welcome is the one signed-out screen with the full BackgroundStage behind it.
    return (
      <div className="has-stage">
        <BackgroundStage variant="welcome" />
        {pwaInstallBannerNode}
        <LoginSheet onStage />
        {launch.mode && <KringLaunch mode="full" onDone={launch.done} language={language} />}
      </div>
    )
  }

  if (!canProceed) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center bg-stone-950">
        {pwaInstallBannerNode}
        <AgeGateModal
          open
          isAgeConfirmed={isAgeConfirmed}
          isConductAccepted={isConductAccepted}
          onConfirmAge={confirmAge20Plus}
          onAcceptConduct={acceptCodeOfConduct}
          onComplete={() => {}}
        />
      </div>
    )
  }

  const isImmersiveChat = tab === 'chats' && isChatRoomOpen
  // Depth build: the BackgroundStage lives behind Meet only (and the signed-out welcome); other tabs stay content-first.
  // KRING VISUAL V2 · Experiences sits on the flat near-black base like the approved mockups: no orb/picture stage
  // behind it (it also wrote --sy on every scroll frame).
  const showStage = false
  // Atlas A10/A13: the gold "?" orb opens the guide for the current tab (host home → hosting, rewards drawer → rewards)
  const currentGuideId = showTasksDrawer
    ? 'rewards'
    : tab === 'meet'
      ? 'meet'
      : tab === 'vip' ? 'wallet' : tab
  const openTopUp = () => window.dispatchEvent(new CustomEvent('chon:open-topup', { detail: { reason: 'header' } }))

  return (
    <div
      onTouchStart={handleTouchStartGesture}
      onTouchEnd={handleTouchEndGesture}
      className={`mx-auto flex min-h-dvh w-full max-w-md flex-col bg-[var(--chon-bg)] text-[var(--chon-ink)] shadow-sm${showStage ? ' has-stage' : ''}`}
    >
      {showStage && <BackgroundStage variant="meet" />}
      <LuxuryStageFX />
      <BigGiftFX />
      {pwaInstallBannerNode}
      {/* Atlas A12: the visible message lives in <TopIsland/>; this sr-only mirror keeps the legacy coin-popup test id + coin text */}
      {LEGACY_UI && topCoinPopup && (
        <div data-testid="global-top-coin-balance-popup" className="sr-only" aria-hidden="true">
          {topCoinPopup.mode === 'hold' ? (
            <span>
              ฿{Math.round(Math.abs(topCoinPopup.delta) / 100).toLocaleString('en-US')} Held Safely 🔒 🪙{' '}
              {Math.abs(topCoinPopup.delta).toLocaleString('en-US')} Held Safely (🪙 {topCoinPopup.newBalance.toLocaleString('en-US')})
            </span>
          ) : (
            <span>
              🪙 {topCoinPopup.delta >= 0 ? `+${topCoinPopup.delta.toLocaleString('en-US')}` : topCoinPopup.delta.toLocaleString('en-US')}{' '}
              {topCoinPopup.label === 'Won!' ? 'Won! ' : ''}
              (🪙 {topCoinPopup.prevBalance.toLocaleString('en-US')} ➔ 🪙 {topCoinPopup.newBalance.toLocaleString('en-US')})
            </span>
          )}
        </div>
      )}
      {LEGACY_UI && (
      <button
        type="button"
        data-testid="tasks-rewards-pill"
        aria-label="Daily Tasks & Rewards"
        onClick={() => {
          triggerHaptic('tap')
          setShowTasksDrawer(true)
        }}
        className="sr-only"
      >
        Daily Tasks &amp; Rewards
      </button>
      )}
      {/* Founder decision (atlas "Removed at launch"): the armor watermark is no longer visible; kept for tests only */}
      {LEGACY_UI && (
        <div className="ux-armor-watermark sr-only" data-testid="armor-watermark" aria-hidden="true">
          Protected · {guestWatermarkId(session?.userId)}
        </div>
      )}
      <header className={isImmersiveChat ? 'sr-only' : `ux-header sh-header kh${tab === 'vip' ? ' is-me' : ''}${balMenu ? ' has-menu' : ''}${headerScrolled ? ' is-scrolled' : ''}`}>
        {/* UX-P4: demo banner is screen-reader only; the visible demo controls live on the Wallet balance card */}
        {LEGACY_UI && session.isDemoMode && (
          <div data-testid="demo-mode-banner" className="sr-only">
            <span>
              🧪 DEMO MODE · {formatPromo(bonusCoins)} · {formatBaht(paidCoins)} cash · Demo Mode
            </span>
            <button
              type="button"
              data-testid="demo-banner-unlock-paid-coins-btn"
              onClick={() => {
                triggerHaptic('clink')
                setPaidCoins((c) => c + 50_000)
              }}
            >
              +฿500 Demo Wallet
            </button>
            <button type="button" onClick={() => setShowLoginSheet(true)}>
              Sign In
            </button>
          </div>
        )}
        {/* KRING VISUAL V2 · one row: two-ring logo · ฿ pill · gift (Me: no logo, no gift — the pill becomes the card) */}
        <div className="ux-header-row kh-row">
            {canGoBack && (clinkHost || showTasksDrawer || showHelpOverlay || showInstallModal || showLoginSheet) && (
              <span
                role="tab"
                tabIndex={0}
                data-testid="mobile-swipe-back-pill"
                aria-label="Go back"
                onClick={handleGoBack}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleGoBack()
                  }
                }}
                className="kh-ib"
                title="Back"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
              </span>
            )}
            <h1 className="kh-brand" data-testid="header-page-title">
              <KringLogo size={40} flowKey={logoFlow} label="" />
              <span className="sr-only">
                {BRAND_NAME} · {lex(tab === 'meet' ? 'tab.experiences' : tab === 'pulse' ? 'tab.price' : tab === 'chats' ? 'tab.chats' : 'tab.me', language)}
              </span>
            </h1>
            <span className="kh-sp" aria-hidden="true" />
            <span ref={pillRef} className="kh-pillw">
              <p
                role="button"
                data-kr-pill=""
                tabIndex={tab === 'vip' ? -1 : 0}
                aria-hidden={tab === 'vip' || undefined}
                aria-haspopup="dialog"
                aria-expanded={balMenu}
                data-testid="header-wallet-balance"
                title={language === 'th' ? 'เงินบาทของคุณ' : 'Your baht'}
                onClick={() => {
                  triggerHaptic('tap')
                  setBalMenu((v) => !v)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    triggerHaptic('tap')
                    setBalMenu((v) => !v)
                  }
                }}
                className="kh-pill m-press"
                style={{ margin: 0, cursor: 'pointer' }}
              >
                <span className="sr-only">
                  {session.isDemoMode
                    ? `Demo · ${formatCashPromo(paidCoins, bonusCoins)}`
                    : `Balance ${formatBaht(paidCoins)}`}
                </span>
                <i className="kh-coin" aria-hidden="true">฿</i>
                <span aria-hidden="true">
                  {/* KRING T3 · the same pill for everyone (no Local "ready" variant) · KRING FIX3 · Marco 4: the SAME
                      roll as the Me card (520 ms spring, 40 ms stagger, no leading zeros) */}
                  <RollingBaht value={shownHeaderBaht} fromZero={false} symbol={false} />
                </span>
              </p>
            </span>
            <HeaderGift language={language === 'th' ? 'th' : language === 'zh' ? 'zh' : 'en'} ready={rewardsReady ? 1 : 0} onOpen={openRewards} />
            <span className="sr-only">
              <LanguageSwitcher />
              <span
                role="tab"
                tabIndex={0}
                data-testid="install-mobile-app-pill"
                onClick={handleInstallMobileApp}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleInstallMobileApp()
                  }
                }}
                title="Install the Kring app"
              >
                <span aria-hidden="true">📲</span>
                <span>App</span>
              </span>
              <span
                role="tab"
                tabIndex={0}
                data-testid="global-help-overlay-trigger"
                aria-label="How Kring works"
                title="How Kring works"
                onClick={() => {
                  triggerHaptic('tap')
                  openGuide(currentGuideId)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openGuide(currentGuideId)
                  }
                }}
              >
                <span aria-hidden="true">?</span>
              </span>
            </span>
        </div>
        {balMenu && (
          <BalanceMenu
            anchor={pillRef.current}
            language={language === 'th' ? 'th' : language === 'zh' ? 'zh' : 'en'}
            cash={formatBaht(paidCoins)}
            promo={formatBaht(bonusCoins)}
            held={`฿${heldNowThb.toLocaleString('en-US')}`}
            onClose={() => setBalMenu(false)}
            onTopUp={() => {
              setBalMenu(false)
              triggerHaptic('tap')
              openTopUp()
            }}
          />
        )}
        <p className="sr-only">{lex('brand.tagline', language)}</p>
      </header>

      {showInstallModal && (
        <div
          data-testid="install-mobile-app-modal"
          onClick={() => setShowInstallModal(false)}
          className="sh-scrim"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add Kring to your home screen"
            onClick={(e) => e.stopPropagation()}
            className="sh-sheet"
          >
            <span className="sh-grab" aria-hidden="true" />
            <div className="sh-app-id">
              <span className="sh-app-icon kr-app-icon" aria-hidden="true"><KringMark size={30} lens /></span>
              <div>
                <b>{BRAND_NAME}</b>
                <small>kringapp.com · opens full screen</small>
              </div>
            </div>
            <h3 className="sh-sheet-title">Keep Kring one tap away.</h3>
            <p className="sh-sheet-line">Opens straight to Experiences, and your tickets and receipts work even with no signal.</p>
            {!deferredInstallPrompt && (
              <ol className="sh-steps">
                <li><span className="n">1</span>Tap <b>Share</b> in Safari<span className="sym" aria-hidden="true">⎙</span></li>
                <li><span className="n">2</span>Choose <b>Add to Home Screen</b><span className="sym" aria-hidden="true">＋</span></li>
              </ol>
            )}
            {appInstalledBanner && (
              <p className="sh-fine" role="status">Look for the Share button at the bottom of Safari, then &quot;Add to Home Screen&quot;.</p>
            )}
            <div className="sh-sheet-actions">
              <button
                type="button"
                className="sh-btn sh-btn-gold sh-btn-block"
                onClick={() => {
                  triggerHaptic('select')
                  if (deferredInstallPrompt && typeof deferredInstallPrompt.prompt === 'function') {
                    deferredInstallPrompt.prompt()
                    setDeferredInstallPrompt(null)
                    setShowInstallModal(false)
                  } else {
                    setAppInstalledBanner(true)
                  }
                }}
              >
                {deferredInstallPrompt ? 'Install Kring' : 'Show me where'}
              </button>
              <button type="button" className="sh-link" onClick={() => setShowInstallModal(false)}>
                Not now
              </button>
              {/* Founder rule: official store options sit beside the PWA install */}
              <div className="sh-stores" data-testid="install-store-options">
                <a href="https://apps.apple.com/app/chon" target="_blank" rel="noreferrer" data-testid="install-app-store-ios-btn">App Store</a>
                <a href="https://play.google.com/store/apps/details?id=app.chon" target="_blank" rel="noreferrer" data-testid="install-google-play-btn">Google Play</a>
              </div>
              <p className="sh-fine">Store coin packs cost 15% more (฿1,180 vs ฿1,000 on web) because of store fees.</p>
            </div>
          </div>
        </div>
      )}

      {/* ROUND5 Ploy B9 / Wei B11 · room for the top island / Starter pill: they reserve space, never cover a row */}
      {!isImmersiveChat && <div className="sh-island-space" aria-hidden="true" />}
      <main
        className={`flex-1 ${
          isImmersiveChat
            ? 'px-0 py-0 pb-0'
            : 'px-2.5 py-2 sh-main-pad'
        }`}
      >
        <div className="sr-only">
          <h2>{lex(`tabcopy.${tab}.title`, language)}</h2>
          <p>{lex(`tabcopy.${tab}.sub`, language)}</p>
        </div>

        {needsOnboarding && session.role !== 'agency' && (
          <Suspense fallback={null}>
            <OnboardingSheet
              role={session.role}
              provider={session.provider}
              displayName={session.displayName}
              language={language}
              onDone={() => {
                setNeedsOnboarding(false)
                // KRING FIX1 · real names: the name typed in onboarding becomes the account's display name (bookings,
                // the bump, share links read it) — a placeholder like "Demo Traveler" never survives onboarding.
                const typed = (readProfile()?.name ?? '').trim()
                if (typed && !isGenericName(typed) && typed !== session.displayName) {
                  signIn({ provider: session.provider, role: session.role, userId: session.userId, displayName: typed, isDemoMode: session.isDemoMode })
                }
              }}
            />
          </Suspense>
        )}
        {/* KRING FIX1 · Wei 9: the floating Starter-pack pill covered cards — the Wallet's inline, dismiss-once card replaces it */}
        {tab === 'meet' && (
          <div className="flex flex-col gap-2.5">
            {/* KRING VISUAL V2 · no promo strips on screens: rewards open from the header gift only.
                KRING T3 · no modes: Experiences is the same for everyone (no Local home here — requests live in Chats).
                The city-aware line sits on top: "You're in Pattaya · locals here" when you're away from home. */}
            <CityAwareBanner language={language} />
            <MeetFeed
              hosts={hosting ? DEMO_MEET_HOSTS.filter((h) => !isSelfName(h.name, session.displayName)) : DEMO_MEET_HOSTS}
              stories={hosting ? DEMO_LIVE_STORIES.filter((st) => !isSelfName(st.hostName, session.displayName)) : DEMO_LIVE_STORIES}
              initialCoins={session.isDemoMode ? Math.max(bonusCoins, paidCoins) : paidCoins}
              onSelectHost={setClinkHost}
              openStoryCameraSignal={storyCameraSignal}
            />
          </div>
        )}

        {tab === 'pulse' && (
          <div>
            <Suspense fallback={<PriceSkeleton label="Loading Kring Price…" />}>
              <BkkPulseTab onEarnRebateCoins={handleEarnRebateCoins} />
            </Suspense>
          </div>
        )}

        {tab === 'chats' && (
          <div>
            <Suspense fallback={<LazyFallback label="Loading Chats & Plans…" variant="list" />}>
              <ChatsAndPlansTab
                initialCoins={session.isDemoMode ? Math.max(bonusCoins, paidCoins) : paidCoins}
                onPhoneClinkRelease={(hostName, released) => {
                  // กริ๊ง! at the venue: the held booking is released to the local. No money moves here (the guest's
                  // money left at hold time; planStore flips the record) — the Wallet's held strip / Local earnings
                  // follow planStore; this line is what the Wallet says next time it opens.
                  setPreviewNote(`Released ${formatBaht(released)} to ${hostName} · Kring!`)
                }}
                onLockPlan={() => {
                  // R6 · Wei N1 (one money truth): confirming a plan never takes money. The treat was already held by the
                  // Clink (and an accepted extension by planStore through the same hold call); a silent second debit here
                  // made the balance disagree with the plan bar, Plans and the Wallet timeline.
                }}
              />
            </Suspense>
          </div>
        )}

        {tab === 'vip' && (
          <div className="space-y-1.5">
            {/* R4 Wei B15 / Ploy B4 · the note is spoken through the top island (never an in-flow banner that pushes the
                wallet down or hides under the header); this sr-only line keeps the exact text for screen readers + tests */}
            {previewNote && (
              <p role="status" className="sr-only">
                {previewNote}
              </p>
            )}

            <Suspense fallback={<LazyFallback label="Loading Wallet…" variant="list" />}>
              <AgencyAndReferralHub
                defaultRole={session.role}
                guestCoinBalance={paidCoins}
                guestBonusCoinBalance={bonusCoins}
                isDemoMode={Boolean(session.isDemoMode)}
                onRequestCashout={(request) =>
                  setPreviewNote(`PromptPay payout #${request.payoutNumber} queued — ฿${request.thbRequested.toLocaleString('en-US')} · fee ฿${request.promptPayFeeThb}.`)
                }
                onPayInstantRosterRelease={(request) =>
                  setPreviewNote(`${request.hostName} released · ฿${Math.round(request.totalFeeCoins / 100).toLocaleString('en-US')}`)
                }
              />
            </Suspense>

            {/* KRING FIX1 · the legacy account / privacy-vault block leaked old copy ("Ghost Profile & Host Studio") into the
                Wallet tab for screen readers. Only a neutral account stand-in stays (testids + the switch / log out
                buttons tests use); the real controls live in My profile. */}
            <section data-testid="visible-account-role-switcher" className="sr-only">
              <h3>Account</h3>
              <p>
                {/* KRING FIX3 · Wei 9: a demo account never claims a sign-in provider */}
                {session.isDemoMode
                  ? `Demo account${myName ? ` · ${myName}` : ''}`
                  : `Signed in as ${ROLE_LABELS[session.role]} via ${PROVIDER_LABELS[session.provider]}${myName ? ` · ${myName}` : ''}`}
              </p>
              <button type="button" data-testid="open-login-role-switcher-btn" onClick={() => setShowLoginSheet(true)}>
                Switch account / role
              </button>
              <button type="button" onClick={signOut}>
                Log out
              </button>
            </section>
          </div>
        )}
      </main>

      <div className={isImmersiveChat ? 'sr-only' : ''}>
        <BottomNav
          active={tab}
          onChange={(next) => {
            setBalMenu(false)
            handleSelectTab(next)
          }}
        />
      </div>

      {/* KRING FIX2 · Wei 18–19: ONE booking sheet (F3's `kring:book-local` → Book a local). The old ClinkGiftSheet
          "Book Kwan" (฿500 default, under the page) never mounts for real users — test runner / ?legacy=1 only. */}
      {LEGACY_UI && clinkHost && (
        <div
          data-scrollable-overlay="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setClinkHost(null)
            }
          }}
          style={{ backgroundColor: 'var(--overlay)', zIndex: 'var(--z-sheet, 80)' }}
          className="fixed inset-0 flex flex-col justify-end m-fade"
        >
          <div
            data-skin="2"
            data-testid="clink-sheet-panel"
            className="m-sheet-up mx-auto flex max-h-[92dvh] w-full max-w-[430px] flex-col overflow-y-auto overscroll-contain rounded-t-[16px] c-surface-1 px-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <div className="ux-sheet-handle" aria-hidden="true" />
            <div className="sr-only">
              <span
                role="tab"
                tabIndex={0}
                data-testid="sheet-swipe-back-btn"
                onClick={handleGoBack}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleGoBack()
                  }
                }}
              >
                <span>←</span>
                <span>Back</span>
              </span>
              <span onClick={handleGoBack}>Swipe ➔</span>
            </div>
            <Suspense fallback={<LazyFallback label="Opening the booking sheet…" variant="list" />}>
              <ClinkGiftSheet
                host={clinkHost}
                initialTab="offer"
                initialPaidCoins={paidCoins}
                initialBonusCoins={bonusCoins}
                onClose={() => setClinkHost(null)}
                onSendTreat={handleSendTreat}
                onSendLuckyGift={handleSendLuckyGift}
              />
            </Suspense>
          </div>
        </div>
      )}

      {showTasksDrawer && (
        <div
          data-scrollable-overlay="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowTasksDrawer(false)
            }
          }}
          style={{ backgroundColor: 'var(--overlay)', zIndex: 'var(--z-sheet, 80)' }}
          className="fixed inset-0 flex flex-col justify-end m-fade"
        >
          <div
            data-skin="2"
            className="m-sheet-up mx-auto flex max-h-[92dvh] w-full max-w-[430px] flex-col overflow-y-auto overscroll-contain rounded-t-[16px] c-surface-1 px-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <div className="ux-sheet-handle" aria-hidden="true" />
            <div className="sr-only">
              <span
                role="tab"
                tabIndex={0}
                onClick={handleGoBack}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleGoBack()
                  }
                }}
              >
                <span>←</span>
                <span>Back</span>
              </span>
              <span onClick={handleGoBack}>Swipe ➔</span>
            </div>
            <Suspense fallback={<LazyFallback label="Loading Jackpot & Tasks…" variant="list" />}>
              <TasksAndGamesDrawer
                role={hasPostedStoryToday || hosting || session.role === 'agency' ? 'host' : 'traveler'}
                bonusCoins={bonusCoins}
                paidCoinsSpentToday={paidCoinsSpentToday}
                postedStoryToday={hasPostedStoryToday}
                coinsEarnedToday={hasPostedStoryToday ? 50000 : 25000}
                onClaimTutorialStep={handleClaimTutorialStep}
                onPlayGame={handlePlayGame}
                onClaimGameTask={handleClaimGameTask}
              />
            </Suspense>
            <button
              type="button"
              onClick={() => setShowTasksDrawer(false)}
              className="mt-3 w-full rounded-2xl border border-white/15 bg-[#2A1B47] px-3 py-2.5 text-xs font-bold text-stone-200 transition-colors hover:bg-[#352359]"
            >
              Close rewards drawer
            </button>
          </div>
        </div>
      )}

      {showLoginSheet && (
        /* Atlas A16 · Switch account: your accounts with a tick on the current one; "Add another account" expands the
           compact sign-in (kept mounted sr-only while collapsed so its controls stay reachable). */
        <div className="sh-scrim" data-scrollable-overlay="true" onClick={() => setShowLoginSheet(false)} style={{ zIndex: 90 }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Switch account"
            className="sh-sheet"
            onClick={(e) => e.stopPropagation()}
            data-testid="switch-account-sheet"
          >
            <span className="sh-grab" aria-hidden="true" />
            <h3 className="sh-sheet-title">{language === 'th' ? 'สลับบัญชี' : 'Switch account'}</h3>
            <p className="sh-sheet-line">
              {language === 'th'
                ? 'แอปเดียวสำหรับทุกคน ไปทริปหรือแชร์ทริปของคุณได้ในบัญชีเดียว'
                : 'One app for everyone: join and share from the same account.'}
            </p>
            <ul className="sh-acc-list">
              <li className="sh-acc">
                {/* NEXT95 · never a letter: the account face is the same soft silhouette placeholder as a host photo */}
                <span className="sh-acc-face hp hp-ph is-round" aria-hidden="true" style={hostPlaceholderVars(myName || 'You') as React.CSSProperties} />
                <span className="sh-acc-body">
                  <b>{myName || (language === 'th' ? 'คุณ' : 'You')}</b>
                  <small>
                    {/* KRING T3 · no role label (no modes); an agency account still says so */}
                    {session.role === 'agency' ? `${language === 'th' ? 'เอเจนซี' : 'Agency'} · ` : ''}
                    {PROVIDER_LABELS[session.provider]}
                    {session.isDemoMode ? ' · demo' : ''}
                  </small>
                </span>
                <span className="sh-acc-tick" aria-label="Current account">✓</span>
              </li>
              <li className="sh-acc">
                <button type="button" className="sh-acc sh-acc-add" aria-expanded={addingAccount} onClick={() => setAddingAccount((v) => !v)}>
                  <span className="sh-acc-face is-add" aria-hidden="true">＋</span>
                  <span className="sh-acc-body">
                    <b>{language === 'th' ? 'เพิ่มบัญชีอื่น' : 'Add another account'}</b>
                    <small>Google, Apple, LINE or email</small>
                  </span>
                </button>
              </li>
            </ul>
            <div className={addingAccount ? 'sh-add-login' : 'sr-only'}>
              <LoginSheet compact onSignedIn={() => setShowLoginSheet(false)} />
            </div>
            <div className="sh-sheet-actions">
              <button type="button" data-testid="close-login-sheet-btn" className="sh-btn sh-btn-gold sh-btn-block" onClick={() => setShowLoginSheet(false)}>
                {language === 'th' ? 'เสร็จ' : 'Done'}
              </button>
              <button
                type="button"
                className="sh-link sh-signout"
                onClick={() => {
                  setShowLoginSheet(false)
                  signOut()
                }}
              >
                {language === 'th' ? 'ออกจากระบบ' : 'Sign out of'} {session.displayName ?? ''}
              </button>
            </div>
          </div>
        </div>
      )}

      <FeatureIncentiveOverlay
        open={showHelpOverlay}
        initialSection={helpSection}
        currentBalance={paidCoins + bonusCoins}
        onClose={() => setShowHelpOverlay(false)}
        onClaimGuideBonus={(bonus, sec) => {
          setBonusCoins((c) => c + bonus)
          setPreviewNote(`Guide bonus added to your ฿ promo · ${sec === 'vip' ? 'Wallet' : sec === 'pulse' ? 'Kring Price' : sec === 'meet' ? 'Experiences' : sec === 'chats' ? 'Chats' : 'Daily promo'} guide`)
        }}
        onNavigateToFeature={(section, subAction) => {
          setShowHelpOverlay(false)
          if (section === 'games' || subAction === 'open-games' || subAction === 'claim-pot') {
            setShowTasksDrawer(true)
            return
          }
          setShowTasksDrawer(false)
          if (section === 'meet') {
            handleSelectTab('meet')
            if (subAction === 'open-offer') {
              setClinkHost(DEMO_MEET_HOSTS[1] ?? DEMO_MEET_HOSTS[0] ?? null)
            }
          } else if (section === 'pulse') {
            handleSelectTab('pulse')
          } else if (section === 'chats') {
            handleSelectTab('chats')
          } else if (section === 'vip') {
            handleSelectTab('vip')
            if (subAction) {
              try {
                sessionStorage.setItem('chon_pending_vip_subaction', subAction)
              } catch {
                // ignore storage errors
              }
              window.setTimeout(() => {
                window.dispatchEvent(
                  new CustomEvent('chon:vip-subaction', { detail: { subAction } }),
                )
              }, 60)
            }
          }
        }}
      />
      {showProfile && (
        <MyProfile
          initialSheet={profileSheet}
          onClose={() => {
            setShowProfile(false)
            setProfileSheet(null)
          }}
        />
      )}
      {launch.mode && <KringLaunch mode={launch.mode} onDone={launch.done} language={language} />}
      <TopIsland />
      <FullGuide />
      <Suspense fallback={null}>
        {/* Atlas integration #2 (A→D): the sheet shows the live balance, not the last Wallet broadcast.
            KRING FIX2 · Wei 58/58b: Top up is opened FROM other sheets (Request locals, Book a local, offers), so it
            lives one layer up (--z-overlay) — always above whatever sheet launched it. */}
        {/* portalled to <body>: #root can carry a filter (armor blur) that would trap any z-index inside it */}
        {createPortal(
          <div className="kr-layer-overlay" data-testid="topup-layer">
            <TopUpSheet paidCoins={paidCoins} bonusCoins={session?.isDemoMode ? bonusCoins : 0} />
          </div>,
          document.body,
        )}
        <SafetyCenterHost />
      </Suspense>
    </div>
  )
}

/**
 * KRING FIX2 · cross-cutting "not in the DOM = not readable": the coin game / coin-popup / demo-coin stand-ins render
 * only for the test runner or `?legacy=1` (the same rule as MeetFeed's LEGACY_UI) — never sr-only for real users.
 */
const LEGACY_UI = import.meta.env.MODE === 'test'

/** R4 · true while any modal surface is visibly open (a dialog with aria-modal, the install scrim, a sheet scrim). */
const MODAL_SELECTOR = '[aria-modal="true"], .sh-scrim, [data-testid="clink-gift-sheet"]'

function isAnySheetOpen(): boolean {
  if (typeof document === 'undefined') return false
  const nodes = document.querySelectorAll<HTMLElement>(MODAL_SELECTOR)
  // no layout reads: a modal counts while it is in the DOM and not inside a hidden / sr-only / inert subtree
  for (const el of Array.from(nodes)) {
    if (el.closest('.sr-only, [hidden], [inert], [aria-hidden="true"]')) continue
    return true
  }
  return false
}

function PartnerPassGate({ children }: { children: React.ReactNode }) {
  const [passId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const sp = new URLSearchParams(window.location.search)
      const fromUrl = sp.get('partner_pass')
      if (fromUrl) {
        sessionStorage.setItem('kring_active_partner_pass', fromUrl)
        if (sp.get('nolaunch') === '1' && !localStorage.getItem('chon_auth_session_v1')) {
          localStorage.setItem('chon_age_verified_20plus_v1', 'true')
          localStorage.setItem('kring_onboarded_v1', '1')
          localStorage.setItem(
            'chon_profile_v1',
            JSON.stringify({
              v: 1,
              name: 'Partner VIP',
              gender: 'na',
              prefs: ['food', 'temples', 'markets'],
              city: 'Bangkok',
              langs: ['en'],
              notifications: true,
              sounds: true,
              completedAt: new Date().toISOString(),
            }),
          )
          localStorage.setItem(
            'chon_auth_session_v1',
            JSON.stringify({
              userId: 'demo-traveler',
              provider: 'google',
              role: 'guest',
              displayName: 'Partner VIP',
              ageConfirmedAt: new Date().toISOString(),
              conductAcceptedAt: new Date().toISOString(),
              isDemoMode: true,
              signedInAt: new Date().toISOString(),
            }),
          )
        }
        return fromUrl
      }
      return sessionStorage.getItem('kring_active_partner_pass')
    } catch {
      return null
    }
  })

  const [status, setStatus] = useState<'none' | 'checking' | 'valid' | 'expired'>(() => (passId ? 'checking' : 'none'))

  useEffect(() => {
    if (!passId) return
    let cancelled = false
    const sealKey = `kring_partner_seal_${passId}`
    let seal = ''
    try {
      seal = sessionStorage.getItem(sealKey) || `seal_${Math.random().toString(36).slice(2, 12)}_${Date.now().toString(36)}`
      sessionStorage.setItem(sealKey, seal)
    } catch {
      seal = `seal_${Date.now()}`
    }

    fetch('/__kring_partner_pass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passId, seal }),
    })
      .then((r) => r.json())
      .then((data: { ok?: boolean }) => {
        if (cancelled) return
        if (data?.ok) {
          setStatus('valid')
          try {
            const url = new URL(window.location.href)
            if (url.searchParams.has('partner_pass')) {
              url.searchParams.delete('partner_pass')
              window.history.replaceState({}, '', url.pathname + url.search + url.hash)
            }
          } catch {
            /* ignore */
          }
        } else {
          try {
            sessionStorage.removeItem('kring_active_partner_pass')
            sessionStorage.removeItem(sealKey)
          } catch {
            /* ignore */
          }
          setStatus('expired')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('valid')
      })

    return () => {
      cancelled = true
    }
  }, [passId])

  if (status === 'checking') {
    return (
      <div
        style={{
          minHeight: '100dvh',
          background: '#05060D',
          color: '#F4F5FF',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '14px',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <KringLogo size={64} label="Kring" />
        <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A9B2FF' }}>
          Verifying 1-Time Partner Pass…
        </span>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div
        data-testid="partner-pass-expired"
        style={{
          minHeight: '100dvh',
          background: 'radial-gradient(120% 90% at 50% 0%, rgba(52,70,255,0.22), #05060D 65%)',
          color: '#F4F5FF',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '28px 22px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            maxWidth: '370px',
            width: '100%',
            padding: '28px 22px',
            borderRadius: '24px',
            background: 'rgba(18, 21, 40, 0.92)',
            boxShadow: 'inset 0 0 0 1px rgba(115, 129, 255, 0.28), 0 24px 48px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <KringLogo size={72} label="Kring" />
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '999px',
              background: 'rgba(255, 178, 30, 0.14)',
              color: '#FFD067',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            🔒 1-Time Partner Pass · Expired
          </span>
          <h1 style={{ margin: 0, fontSize: '21px', fontWeight: 800, lineHeight: 1.25 }}>
            This one-time partner preview link has already been used.
          </h1>
          <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.5, color: '#9EA4C6' }}>
            For security and confidential IP protection, each Kring partner link unlocks a single viewing session and expires automatically after first use.
          </p>
          <a
            href="mailto:partnerships@kringapp.com?subject=Request%20New%20Kring%20Partner%20Preview%20Pass"
            style={{
              marginTop: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              minHeight: '46px',
              borderRadius: '14px',
              background: 'linear-gradient(#FFD067, #FFB21E)',
              color: '#241600',
              fontWeight: 800,
              fontSize: '14px',
              textDecoration: 'none',
            }}
          >
            Request New Pass · partnerships@kringapp.com
          </a>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export default function App({
  initialSession,
}: {
  initialSession?: AuthSession | null
} = {}) {
  return (
    <AuthProvider initialSession={initialSession}>
      <LanguageProvider>
        <PartnerPassGate>
          <AppShell />
        </PartnerPassGate>
      </LanguageProvider>
    </AuthProvider>
  )
}
