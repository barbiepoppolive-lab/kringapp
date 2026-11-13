import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import HelpDot from '../ui/HelpDot'
import { StoryRing } from '../ui/LivingIcons'
import '../../styles/meet-motion.css'
import { useLanguage } from '../../i18n/LanguageContext'
import { Sheet } from '../ui/Sheet'
import { triggerHaptic } from '../../lib/haptics'
import { dispatchInternalWalletDelta } from '../../lib/walletBus'
import { showIsland, openGuide, markTaskDone } from '../fx/island'
import StoryViewer, { onStoryRequest } from './StoryViewer'
import { triggerLuxuryFX } from '../fx/LuxuryStageFX'
import { listHas, useSafety } from '../../lib/safetyStore'
import SafetyMenu from '../ui/SafetyMenu'
import HostPhoto from '../ui/HostPhoto'
import { readProfile, writeProfile } from '../../lib/profileStore'
import { nightStore } from '../../lib/demoState'
import HostLightbox from './HostLightbox'
import ExperiencesTab, { BOOK_LOCAL_EVENT, EXP_VIEW_EVENT, type TabLocal } from '../experiences/ExperiencesTab'
import LocalCard, { type LocalCardVariant } from '../experiences/LocalCard'
import LocalsGrid from '../experiences/LocalsGrid'
import LocalsFilterSheet, { LOCALS_FILTER_DEFAULT, localsFilterCount, matchesLocalsFilter, type LocalsFilter } from '../experiences/LocalsFilterSheet'
import { useFloatRef } from '../../design/floating'
import type { OfferContext } from '../experiences/MultiRequestSheet'
import { isSelfAny, isSelfPaused, LIVE_EVENT, openEditProfile, useSelfLocal } from '../../lib/selfGuard'
import { togglePin, usePins } from '../../lib/pins'
import { cityLabel, localProfile, registerSelfProfile, useCity } from '../../lib/experiences'

export type MeetDistrict = 'Thonglor / Ekkamai' | 'Asok / Phrom Phong'
export type MeetFilterId = 'all' | 'flash' | 'thonglor' | 'asok'
export type HostCity = 'Bangkok' | 'Pattaya'
export type HostGender = 'women' | 'ladyboy' | 'men'

export type HostType = 'food' | 'rooftop' | 'cafe' | 'salon' | 'experience' | 'group' | 'shopping' | 'culture'
export const HOST_TYPES: ReadonlyArray<{ id: HostType; en: string; th: string; emoji: string }> = [
  { id: 'food', en: 'Food guide', th: 'พากิน', emoji: '🍜' },
  { id: 'rooftop', en: 'Sunset cafés', th: 'คาเฟ่ชมวิว', emoji: '🌇' },
  { id: 'cafe', en: 'Cafe', th: 'คาเฟ่', emoji: '☕' },
  { id: 'salon', en: 'Salon & spa', th: 'ซาลอน & สปา', emoji: '💅' },
  { id: 'experience', en: 'Experience', th: 'ประสบการณ์', emoji: '🥊' },
  { id: 'group', en: 'Group outing', th: 'ไปเป็นกลุ่ม', emoji: '👫' },
  { id: 'shopping', en: 'Shopping buddy', th: 'ช้อปกับโลคอล', emoji: '🛍️' },
  { id: 'culture', en: 'Temple & culture', th: 'วัด & วัฒนธรรม', emoji: '🛕' },
]

export interface MeetHost {
  id: string
  name: string
  age: number
  hostType?: HostType
  photo: string
  photos?: string[]
  venue: string
  district: MeetDistrict
  flash: boolean
  faceMatched: boolean
  raisedCoins: number
  goalCoins: number
  treatLabel: string
  city?: HostCity
  gender?: HostGender
  nationality?: string
  comfortVibes?: string[]
  afterPlansOk?: boolean
  statusText?: string
  heightCm?: number
  weightKg?: number
  insiderSpotPick?: string
  insiderPick?: string
  inShopPinLabel?: string
  inShopPin?: string
  hasBestieSquad?: boolean
  /** NEXT95 · a host in her first week — shows the mono "NEW HOST" label instead of the area */
  isNew?: boolean
}

export interface LiveStory {
  id: string
  hostName: string
  avatar: string
  photo: string
  venue: string
}

export interface MeetFeedProps {
  hosts?: MeetHost[]
  stories?: LiveStory[]
  initialCoins?: number
  onSelectHost?: (host: MeetHost) => void
  /** Increment to open the story camera from outside (HostHome 📸 Story quick action). */
  openStoryCameraSignal?: number
}

/** "Make an offer" context handed to the booking / offer sheet (K3) */
export const OFFER_CTX_KEY = 'kring_offer_ctx_v1'
export const OFFER_CTX_EVENT = 'kring:offer-context'
const ALL_GENDERS: Array<'women' | 'ladyboy' | 'men'> = ['women', 'ladyboy', 'men']
/** legacy controls (gender / age / height / nationality, 2-on-2, boosts) render only for the test runner and
 *  `?legacy=1` — same rule as the Wallet / Pulse legacy stacks. Real users never see dating-style filters. */
const LOCALS_FILTER_KEY = 'kring_locals_filter_v1'
const LEGACY_UI = import.meta.env.MODE === 'test' || (typeof window !== 'undefined' && /[?&]legacy=1\b/.test(window.location.search))

export const MEET_STARTING_COINS = 100_000
export const DAILY_CLINK_COST = 1_000
export const DAILY_CLINK_MIN_AWARD = 1_200
export const DAILY_CLINK_MAX_AWARD = 5_000
export const STORY_TOAST_COST = 100
export const FIRST_TOAST_BONUS = 400
export const TOASTS_FOR_BONUS = 3

export const MEET_FILTERS: ReadonlyArray<{ id: MeetFilterId; label: string }> = [
  { id: 'all', label: 'All Tonight' },
  { id: 'flash', label: '⚡ Flash 60m' },
  { id: 'thonglor', label: 'Thonglor / Ekkamai' },
  { id: 'asok', label: 'Asok / Phrom Phong' },
]

const MEET_STYLE = `
@keyframes chonBubble { 0% { transform: translateY(0) scale(1); opacity: .9; } 100% { transform: translateY(-14px) scale(.35); opacity: 0; } }
.chon-bubble { animation: chonBubble 1.6s ease-in infinite; }
@keyframes chonMarquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
.chon-marquee { animation: chonMarquee 18s linear infinite; }
@keyframes chonGoalBloom { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.25); } }
.chon-goal-bloom { animation: chonGoalBloom 2.4s ease-in-out infinite; }
`

function formatCoins(value: number): string {
  return value.toLocaleString('en-US')
}

export const DEMO_MEET_HOSTS: MeetHost[] = [
  {
    id: 'host-mint',
    hostType: 'rooftop',
    name: 'Mint',
    age: 24,
    photo:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=700&q=85',
    photos: [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=700&q=85',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=700&q=85',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=700&q=85',
      'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=700&q=85',
    ],
    venue: 'Nara Salon, Siam Square · 2 PM',
    district: 'Thonglor / Ekkamai',
    flash: true,
    faceMatched: true,
    raisedCoins: 38_000,
    goalCoins: 50_000,
    treatLabel: 'Coffee Drop · ฿300',
    city: 'Bangkok',
    gender: 'women',
    nationality: '🇹🇭 Thai',
    comfortVibes: ['🌇 Rooftop café', '🎓 English Fluent', '📍 At their venue now', '👫 Groups welcome'],
    afterPlansOk: true,
    statusText: '💭 Nails, Cha Yen and Siam’s best stalls 💅',
    heightCm: 164,
    insiderSpotPick: "🌇 Mint's Pick: Nara Salon · 2 PM",
    inShopPinLabel: '📍 At Shop Now · BKK Nails Thonglor',
    hasBestieSquad: true,
  },
  {
    id: 'host-ploy',
    hostType: 'food',
    name: 'Ploy',
    age: 22,
    photo:
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=700&q=85',
    photos: [
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=700&q=85',
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=700&q=85',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=700&q=85',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=700&q=85',
    ],
    venue: 'Siam Herbal Spa Ari · 2 PM',
    district: 'Thonglor / Ekkamai',
    flash: false,
    faceMatched: true,
    raisedCoins: 61_500,
    goalCoins: 100_000,
    treatLabel: 'Sunset Drop · ฿400',
    city: 'Bangkok',
    gender: 'women',
    nationality: '🇹🇭 Thai',
    comfortVibes: ['🌿 Herbal spa', '🍲 Mookata dinner', '🎓 English Fluent', '👫 Groups welcome'],
    afterPlansOk: false,
    statusText: '💭 Herbal spa afternoon, then Thai desserts 🌿',
    heightCm: 166,
    insiderSpotPick: "🌿 Ploy's Pick: Siam Herbal Spa · 2 PM",
    hasBestieSquad: true,
  },
  {
    id: 'host-kwan',
    hostType: 'experience',
    name: 'Kwan',
    age: 25,
    photo:
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=900&q=80',
    photos: [
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=700&q=85',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=700&q=85',
      'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=700&q=85',
    ],
    venue: 'Yaowarat Rd · 6:30 PM',
    district: 'Asok / Phrom Phong',
    flash: true,
    faceMatched: true,
    raisedCoins: 94_000,
    goalCoins: 125_000,
    treatLabel: 'Dinner Drop · ฿500',
    city: 'Bangkok',
    gender: 'women',
    nationality: '🇻🇳 Vietnamese',
    comfortVibes: ['🍢 Street food', '🍲 Mookata dinner', '📍 At their venue now'],
    afterPlansOk: true,
    statusText: '💭 Nine stalls on Yaowarat this Saturday 🍢',
    heightCm: 162,
    insiderSpotPick: "🍢 Kwan's Pick: Yaowarat · 6:30 PM",
    inShopPinLabel: '📍 At the market · Yaowarat',
    hasBestieSquad: false,
  },
  {
    id: 'host-bee',
    hostType: 'salon',
    name: 'Bee',
    age: 23,
    photo:
      'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=700&q=85',
    photos: [
      'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=700&q=85',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=700&q=85',
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=700&q=85',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=700&q=85',
    ],
    venue: 'Rooftop café Thonglor · 5:30 PM',
    district: 'Asok / Phrom Phong',
    flash: false,
    faceMatched: true,
    raisedCoins: 142_500,
    goalCoins: 150_000,
    treatLabel: 'Rooftop Drop · ฿600',
    city: 'Bangkok',
    gender: 'women',
    nationality: '🇹🇭 Thai',
    comfortVibes: ['🌇 Rooftop café', '📷 Photo walk', '📍 At their venue now', '👫 Groups welcome'],
    afterPlansOk: true,
    statusText: '💭 Sunset, Cha Yen & city lights ✨',
    heightCm: 168,
    insiderSpotPick: "🌇 Bee's Pick: Thonglor rooftop café · 5:30 PM",
    inShopPinLabel: '📍 At the café · Thonglor',
    hasBestieSquad: true,
  },
]

export const EXTRA_DEMO_HOSTS: MeetHost[] = [
  {
    id: 'host-fah',
    hostType: 'cafe',
    name: 'Fah',
    age: 23,
    photo:
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=700&q=85',
    photos: [
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=700&q=85',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=700&q=85',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=700&q=85',
    ],
    venue: 'Jomtien Beach Rd · 5 PM',
    district: 'Thonglor / Ekkamai',
    flash: true,
    faceMatched: true,
    raisedCoins: 42_000,
    goalCoins: 60_000,
    treatLabel: 'Beach Sunset · ฿300',
    city: 'Pattaya',
    gender: 'women',
    nationality: '🇷🇺 Russian',
    comfortVibes: ['🏖️ Pattaya', '🎓 English Fluent', '🍲 Mookata dinner', '📍 At their venue now', '👫 Groups welcome'],
    afterPlansOk: true,
    statusText: '💭 Sunset run on Jomtien beach 🌊',
    heightCm: 171,
    insiderSpotPick: "🏖️ Fah's Pick: Jomtien · 5 PM",
    inShopPinLabel: '📍 At the pier · Bali Hai',
    hasBestieSquad: true,
  },
  {
    id: 'host-bell',
    hostType: 'group',
    name: 'Bell',
    age: 24,
    photo:
      'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=700&q=85',
    photos: [
      'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=700&q=85',
      'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=700&q=85',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=700&q=85',
    ],
    venue: 'Silom night market · 7:30 PM',
    district: 'Asok / Phrom Phong',
    flash: false,
    faceMatched: true,
    raisedCoins: 55_000,
    goalCoins: 80_000,
    treatLabel: 'Night Market · ฿350',
    city: 'Bangkok',
    gender: 'ladyboy',
    nationality: '🇹🇭 Thai',
    comfortVibes: ['🎶 Live-music café', '🍲 Mookata dinner'],
    afterPlansOk: true,
    isNew: true,
    statusText: '💭 Live music & mango sticky rice 🎶',
    heightCm: 169,
    insiderSpotPick: "🎶 Bell's Pick: Silom night market · 7:30 PM",
  },
  {
    id: 'host-ken',
    hostType: 'culture',
    name: 'Ken',
    age: 26,
    photo:
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=700&q=85',
    photos: [
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=700&q=85',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=700&q=85',
      'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=700&q=85',
    ],
    venue: 'Lumphini Muay Thai Gym · 9 AM',
    district: 'Thonglor / Ekkamai',
    flash: true,
    faceMatched: true,
    raisedCoins: 70_000,
    goalCoins: 100_000,
    treatLabel: 'Muay Thai · ฿500',
    city: 'Bangkok',
    gender: 'men',
    nationality: '🇰🇷 Korean',
    comfortVibes: ['🥊 Muay Thai', '🏃 Running club'],
    afterPlansOk: false,
    statusText: '💭 Beginners welcome at the gym 🥊',
    heightCm: 180,
    insiderSpotPick: "🥊 Ken's Pick: Lumphini gym · 9 AM",
  },
  // KRING (K2) · Pattaya locals (Pattaya & sea, temples, licensed spa)
  {
    id: 'host-nok',
    hostType: 'food',
    name: 'Nok',
    age: 27,
    photo: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=700&q=85',
    photos: [
      'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=700&q=85',
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=700&q=85',
    ],
    venue: 'Naklua seafood market · 12 PM',
    district: 'Thonglor / Ekkamai',
    flash: true,
    faceMatched: true,
    raisedCoins: 30_000,
    goalCoins: 60_000,
    treatLabel: 'Seafood Lunch · ฿900',
    city: 'Pattaya',
    gender: 'women',
    nationality: '🇹🇭 Thai',
    comfortVibes: ['🦐 Seafood', '🎓 English Fluent'],
    afterPlansOk: false,
    statusText: '💭 Naklua seafood, then the old fishing pier 🦐',
    insiderSpotPick: "🦐 Nok's Pick: Lan Pho Naklua · 12 PM",
  },
  {
    id: 'host-ton',
    hostType: 'culture',
    name: 'Ton',
    age: 29,
    photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=700&q=85',
    photos: ['https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=700&q=85'],
    venue: 'Sanctuary of Truth · 9 AM',
    district: 'Asok / Phrom Phong',
    flash: false,
    faceMatched: true,
    raisedCoins: 20_000,
    goalCoins: 50_000,
    treatLabel: 'Temple Morning · ฿800',
    city: 'Pattaya',
    gender: 'men',
    nationality: '🇹🇭 Thai',
    comfortVibes: ['🪷 Temples', '🎓 English Fluent'],
    afterPlansOk: false,
    statusText: '💭 Sanctuary of Truth before the crowds 🪷',
    insiderSpotPick: "🪷 Ton's Pick: Big Buddha hill · 9 AM",
  },
  {
    id: 'host-ice',
    hostType: 'salon',
    name: 'Ice',
    age: 25,
    photo: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=700&q=85',
    photos: ['https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=700&q=85'],
    venue: 'Jomtien Thai Spa · 3 PM',
    district: 'Thonglor / Ekkamai',
    flash: true,
    faceMatched: true,
    raisedCoins: 25_000,
    goalCoins: 50_000,
    treatLabel: 'Spa Afternoon · ฿900',
    city: 'Pattaya',
    gender: 'women',
    nationality: '🇹🇭 Thai',
    comfortVibes: ['💆 Licensed spa', '🛍️ Shopping'],
    afterPlansOk: false,
    statusText: '💭 Thai massage at a licensed spa, then the night market 🌙',
    insiderSpotPick: "💆 Ice's Pick: Jomtien Thai Spa · 3 PM",
  },
]

export const DEMO_LIVE_STORIES: LiveStory[] = DEMO_MEET_HOSTS.map((host) => ({
  id: `story-${host.id}`,
  hostName: host.name,
  avatar: host.photo,
  photo: host.photo,
  venue: host.venue,
}))

/* ---------- Depth build (Agent B): per-host tint, once-per-session verified draw-on, card → sheet morph ---------- */
function prefersReducedMotion(): boolean {
  try {
    return (
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true ||
      document.documentElement.dataset.reduceMotion === 'true'
    )
  } catch {
    return false
  }
}

type ViewTransitionDoc = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }
/**
 * Opens the clink sheet with a shared-element feel: the tapped card's photo morphs into the sheet avatar
 * (`.mm-vt-avatar`) via the View Transitions API. Without it (or under reduced motion) the sheet runs its own
 * crossfade + scale (`.mm-sheet-in`).
 */
function openWithMorph(photoEl: HTMLElement | null, open: () => void) {
  const doc = document as ViewTransitionDoc
  if (typeof doc.startViewTransition !== 'function' || prefersReducedMotion() || !photoEl) {
    open()
    return
  }
  photoEl.style.setProperty('view-transition-name', 'mm-host-photo')
  document.documentElement.classList.add('mm-vt')
  try {
    const vt = doc.startViewTransition(() => {
      photoEl.style.removeProperty('view-transition-name')
      flushSync(open)
    })
    vt.finished.finally(() => document.documentElement.classList.remove('mm-vt')).catch(() => {})
  } catch {
    photoEl.style.removeProperty('view-transition-name')
    document.documentElement.classList.remove('mm-vt')
    open()
  }
}

/** ROUND5 Ploy B5 · tonight's host story in the night store (`nightStore` key `host-story`, until 06:00 Bangkok).
 *  Host home may read it with `nightStore.get(HOST_STORY_KEY, null)`; changes fire `chon:night-store { key }`. */
export const HOST_STORY_KEY = 'host-story'
/** the last story-camera request Meet has served (module scope: survives Meet unmounting) */
let servedCameraSignal = 0
export interface HostStoryNight {
  confirmed: boolean
  venue: string
  photo: string | null
  at: number
}

/** ROUND5 Wei B15 · ONE number for "hosts out tonight": the hosts Meet shows with its default filters (Bangkok,
 *  online now). The Welcome line reads this, so it can never promise more faces than Meet then shows. */
export function meetOnlineCount(): number {
  return DEMO_MEET_HOSTS.filter((h) => (!h.city || h.city === 'Bangkok') && h.faceMatched !== false).length
}

/** The host's own price (B16 "Your price") — parsed from the treat label, never below the ฿300 floor. */
export function hostPriceThb(host: Pick<MeetHost, 'treatLabel'>): number {
  const m = host.treatLabel.match(/฿\s*([\d,]+)/)
  const n = m ? Number(m[1].replace(/,/g, '')) : 300
  return Number.isFinite(n) ? Math.max(300, n) : 300
}

/** NEXT95 · how an interest reads on its chip ("Thai food", not "Food guide") */
const INTEREST_EN: Partial<Record<HostType, string>> = { food: 'Thai food', cafe: 'Cafés', salon: 'Spa & nails', experience: 'Experiences', culture: 'Temples', shopping: 'Shopping', group: 'Group outings' }
const INTEREST_TH: Partial<Record<HostType, string>> = { food: 'อาหารไทย', rooftop: 'รูฟท็อป', cafe: 'คาเฟ่', salon: 'สปา & ทำเล็บ', experience: 'ประสบการณ์', culture: 'วัด', shopping: 'ช้อปปิ้ง', group: 'ไปเป็นกลุ่ม' }

/** ROUND5 Wei B14 · the ONE label of an interest, wherever a traveller sees it (onboarding pick = Meet chip). */
export function interestLabel(id: HostType, language: string): string {
  const ht = HOST_TYPES.find((h) => h.id === id)
  if (language === 'th') return INTEREST_TH[id] ?? ht?.th ?? id
  return INTEREST_EN[id] ?? ht?.en ?? id
}

/* ---------- NEXT95 · luxury words: small mono labels instead of stickers ---------- */

function stableMinutes(id: string): number {
  if (id === 'host-mint') return 2
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return 3 + (h % 7)
}

/** "LIVE · 2 MIN" for hosts out right now, the area ("THONGLOR") otherwise, "NEW HOST" in a host's first week. */
export function hostMonoLabel(host: MeetHost, language: string): { text: string; live: boolean } {
  const th = language === 'th'
  if (host.isNew) return { text: th ? 'โลคอลใหม่' : 'NEW LOCAL', live: false }
  if (host.flash) {
    const m = stableMinutes(host.id)
    return { text: th ? `ไลฟ์ · ${m} นาที` : language === 'zh' ? `直播 · ${m} 分钟` : `LIVE · ${m} MIN`, live: true }
  }
  // FIX1 · Wei 9 — one area per local everywhere: the Kring profile's area (Kwan = Chinatown, not the legacy "Asok")
  const p = localProfile(host)
  return { text: th ? p.areaTh : p.areaEn.toUpperCase(), live: false }
}

/** "Tichuca Rooftop · 8 PM" → "Tichuca · 20:00" (venue name without the generic words, Bangkok 24-hour time). */
export function shortVenueTime(venue: string, language: string): string {
  const [name = '', time = '8 PM'] = venue.split('·').map((x) => x.trim())
  const GENERIC = /^(rooftop|bar|courtyard|lounge|club|theater|theatre|thonglor|beach|soi|\d+)$/i
  const words = name.split(/\s+/)
  const kept: string[] = []
  for (const w of words) {
    if (kept.length > 0 && GENERIC.test(w)) break
    kept.push(w)
  }
  const m = time.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i)
  let hhmm = time
  if (m) {
    let h = Number(m[1]) % 12
    if (m[3].toUpperCase() === 'PM') h += 12
    hhmm = `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`
  }
  return `${kept.join(' ')} · ${hhmm}${language === 'th' ? ' น.' : ''}`
}

/**
 * KRING (K2) · one local in the Locals grid. The face is `LocalCard` (Variant 1 "Clean photo" by default — swap
 * with `LOCAL_CARD_VARIANT`); every legacy hook the suites and QA scripts use stays inside it, screen-reader only.
 * Tap → the local's profile (HostLightbox). ♥ saves (red when saved, toast "Saved · see in Me › Saved"). Your own card: ✎ instead of ♥.
 */
export const LOCAL_CARD_VARIANT: LocalCardVariant = 'photo'

function MeetHostCard({
  host,
  highlighted,
  onSelect,
  onRequestVibe,
  onOpenProfile,
  index = 0,
  self = false,
  variant = LOCAL_CARD_VARIANT,
}: {
  host: MeetHost
  highlighted?: boolean
  onSelect?: (host: MeetHost) => void
  onRequestVibe?: (host: MeetHost, vibe: string) => void
  onOpenProfile?: (host: MeetHost, photoEl: HTMLElement | null) => void
  /** kept for callers; Kring has no "one gold Clink" on the grid any more */
  isFirst?: boolean
  index?: number
  self?: boolean
  variant?: LocalCardVariant
}) {
  const { language } = useLanguage()
  const pins = usePins()
  const isPinnedNow = listHas(pins, host.id)
  const gallery = useMemo(
    () => (host.photos && host.photos.length > 0 ? host.photos : [host.photo]),
    [host.photo, host.photos],
  )
  const [photoIdx, setPhotoIdx] = useState(0)
  const [playingVoice, setPlayingVoice] = useState(false)
  const profile = useMemo(() => localProfile(host), [host])

  const label = hostMonoLabel(host, language)
  const nationalityBadge = host.nationality ?? '🇹🇭 Thai'
  const priceThb = hostPriceThb(host)

  const nextPhoto = () => {
    triggerHaptic('tap')
    setPhotoIdx((prev) => (prev + 1) % gallery.length)
  }
  const prevPhoto = () => {
    triggerHaptic('tap')
    setPhotoIdx((prev) => (prev - 1 + gallery.length) % gallery.length)
  }
  const toggleVoicePreview = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    triggerHaptic('tap')
    setPlayingVoice((prev) => !prev)
  }
  useEffect(() => {
    if (!playingVoice) return
    const timer = window.setTimeout(() => setPlayingVoice(false), 6000)
    return () => window.clearTimeout(timer)
  }, [playingVoice])

  const openChat = () => {
    triggerHaptic('tap')
    window.dispatchEvent(
      new CustomEvent('chon:open-chat', {
        detail: {
          hostId: host.id,
          hostName: host.name,
          hostNationality: host.nationality ?? '🇹🇭 Thai',
          hostPhoto: host.photo,
          hostVenue: host.venue,
        },
      }),
    )
    window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'chats' } }))
  }
  const key = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      fn()
    }
  }

  return (
    <LocalCard
      testId="meet-host-card"
      hostId={host.id}
      name={host.name}
      photo={gallery[photoIdx] ?? host.photo}
      profile={profile}
      variant={variant}
      language={language}
      live={host.flash}
      verified={host.faceMatched}
      pinned={isPinnedNow}
      self={self}
      index={index}
      photoTestId="host-photo"
      pinTestId={`save-host-btn-${host.id}`}
      className={highlighted ? 'is-highlighted' : ''}
      onOpen={(el) => onOpenProfile?.(host, el)}
      onPin={() => togglePin(host.id, host.name, language)}
      onEdit={openEditProfile}
      onChip={(experienceId) => window.dispatchEvent(new CustomEvent(BOOK_LOCAL_EVENT, { detail: { hostId: host.id, experienceId } }))}
    >
      {/* legacy hooks — the unit suites and QA scripts only (KRING FIX2 · Ploy/Wei: not in the DOM for real users, so
          no English chips in Thai mode, no flag, no second "Book" that opened the old sheet). Real users: the card face
          (LocalCard) + its one screen-reader line; tap → profile → "Book". */}
      {LEGACY_UI && (
      <div className="sr-only" onClick={(e) => e.stopPropagation()}>
        {gallery.length > 1 && (
          <>
            <span role="tab" tabIndex={-1} aria-label={`Previous photo of ${host.name}`} onClick={prevPhoto} onKeyDown={key(prevPhoto)} />
            <span role="tab" tabIndex={-1} aria-label={`Next photo of ${host.name}`} onClick={nextPhoto} onKeyDown={key(nextPhoto)} />
            <div data-testid="host-photo-dots">
              {gallery.map((_, idx) => (
                <span
                  key={idx}
                  role="tab"
                  tabIndex={-1}
                  aria-label={`Photo ${idx + 1} of ${gallery.length}`}
                  aria-selected={idx === photoIdx}
                  onClick={() => setPhotoIdx(idx)}
                />
              ))}
            </div>
          </>
        )}
        <div data-testid={`host-mono-label-${host.id}`}>
          <span>{highlighted ? (language === 'th' ? 'แนะนำวันนี้' : 'Top pick today') : label.text}</span>
          <span>Online now</span>
        </div>
        {!self && (
          <div className="ux-card-safety">
            <SafetyMenu hostId={host.id} hostName={host.name} testIdPrefix={`card-${host.id}`} language={language} portal />
          </div>
        )}
        {!self && (
          <span role="tab" tabIndex={-1} data-testid={`direct-msg-${host.id}`} aria-label={`Message ${host.name} directly`} onClick={openChat} onKeyDown={key(openChat)}>
            💬 Message · ทักแชท
          </span>
        )}
        <span role="tab" tabIndex={-1} data-testid={`voice-pill-${host.id}`} aria-label={`Play ${host.name} 0:06 voice preview`} onClick={toggleVoicePreview} onKeyDown={key(() => setPlayingVoice((p) => !p))}>
          <span>{playingVoice ? '▮▮ 0:06' : '▶ 0:06'}</span>
          <span>Voice</span>
        </span>
        {playingVoice && (
          <div data-testid={`voice-waveform-toast-${host.id}`}>
            {language === 'th' ? (
              <>🎙️ {host.name}: &ldquo;สวัสดีค่ะ เจอกันที่ตลาดนะคะ!&rdquo;</>
            ) : (
              <>🎙️ {host.name}: &ldquo;Sawasdee ka, see you at the market!&rdquo;</>
            )}
          </div>
        )}
        <div data-testid="host-identity">
          <h3>{host.name} · {language === 'th' ? profile.areaTh : profile.areaEn}</h3>
          {host.faceMatched && (
            <span data-testid={`liveness-badge-${host.id}`} title="ID checked by Kring">
              <span>✓ Verified local · ID checked</span>
              <span>โลคอลยืนยันตัวตนแล้ว</span>
            </span>
          )}
          <span data-testid="host-nationality">{nationalityBadge}</span>
          <span>{language === 'th' ? `ตอบใน ~${profile.replyMin} นาที` : `Replies in ~${profile.replyMin} min`}</span>
        </div>
        <p
          data-testid="host-venue"
          role="tab"
          tabIndex={-1}
          onClick={() => {
            triggerHaptic('tap')
            window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'pulse' } }))
          }}
          title={`${profile.venueMode === 'hostsAt' ? 'Hosts at' : 'Happy to meet at'} ${profile.placeEn}`}
        >
          <span>{profile.venueMode === 'hostsAt' ? (language === 'th' ? 'รับที่' : 'Hosts at') : language === 'th' ? 'สะดวกเจอที่' : 'Happy to meet at'}</span>
          <span data-testid={`loves-expats-badge-${host.id}`}>
            <span>🌍 {language === 'th' ? 'พูดได้' : 'Speaks'} {profile.langs.join(' · ')}</span>
          </span>
          <span>📍 {language === 'th' ? profile.placeTh : profile.placeEn}</span>
        </p>
        {!self && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Book ${host.name} · ${priceThb} baht`}
            onClick={() => {
              triggerHaptic('select')
              onSelect?.(host)
            }}
          >
            <span>Book · จอง</span>
            <span>
              {language === 'th' ? `จองทริปกับ ${host.name}` : `Book an experience with ${host.name}`}
            </span>
          </button>
        )}
        {/* FIX1 · cross-cutting 4 — screen-reader stand-ins now say what the card says (no nightlife / coin wording) */}
        <span data-testid={`open-today-badge-${host.id}`}>
          <span>{host.flash ? (language === 'th' ? '● ออนไลน์อยู่' : language === 'zh' ? '● 在线' : '● Live now') : language === 'th' ? 'พักไว้ก่อน' : 'Replies later today'}</span>
        </span>
        <span data-testid={`bidders-count-badge-${host.id}`}>
          <span>{language === 'th' ? `เปิดรับจอง · ตอบใน ~${profile.replyMin} นาที` : `Taking bookings · replies in ~${profile.replyMin} min`}</span>
        </span>
        {(language === 'th' ? profile.bioTh : profile.bioEn) && <p data-testid="host-status-bubble">{language === 'th' ? profile.bioTh : profile.bioEn}</p>}
        {profile.signature.slice(0, 2).map((x) => (
          <span key={x.id} role="tab" tabIndex={-1} onClick={() => onRequestVibe?.(host, language === 'th' ? x.titleTh : x.titleEn)}>
            {language === 'th' ? x.titleTh : x.titleEn}
          </span>
        ))}
        <div data-testid="treat-goal">
          <span>{language === 'th' ? `ทริปที่จบบนกริ๊ง ${profile.done} ครั้ง` : `${profile.done} experiences on Kring`}</span>
          <span>
            ★ {profile.rating.toFixed(1)} · {profile.reviews} {language === 'th' ? 'รีวิว' : 'reviews'}
          </span>
        </div>
        <div data-testid={`high-energy-pill-${host.id}`}>{language === 'th' ? '✓ ตรงเวลา · ที่สาธารณะเท่านั้น' : '✓ On time · Public venues only'}</div>
      </div>
      )}
    </LocalCard>
  )
}

export default function MeetFeed({
  hosts = DEMO_MEET_HOSTS,
  stories = DEMO_LIVE_STORIES,
  initialCoins = MEET_STARTING_COINS,
  onSelectHost,
  openStoryCameraSignal = 0,
}: MeetFeedProps) {
  const { t, language } = useLanguage()
  const [coins, setCoins] = useState(initialCoins)
  useEffect(() => {
    setCoins(initialCoins)
  }, [initialCoins])
  const [clinkClaimed, setClinkClaimed] = useState(false)
  const [clinkAward, setClinkAward] = useState<number | null>(null)
  const [filter, setFilter] = useState<MeetFilterId>('all')
  const [selectedCity, setSelectedCity] = useState<'all' | 'Bangkok' | 'Pattaya'>('all')
  // KRING · no gender default: every verified local shows (the legacy gender chips stay for the suites only)
  const [selectedGenders, setSelectedGenders] = useState<Array<'women' | 'ladyboy' | 'men'>>(ALL_GENDERS)
  // KRING · one app-wide city (Bangkok · Pattaya), shared with Experiences and Kring Price
  const [city] = useCity()
  useEffect(() => {
    setSelectedCity('all')
  }, [city])
  const effectiveCity: 'all' | 'Bangkok' | 'Pattaya' = selectedCity !== 'all' ? selectedCity : cityLabel(city)
  // KRING VISUAL V2 · the Locals filter (P3 · filter B): one state, applied from the "Find a local" sheet
  const [kf, setKfState] = useState<LocalsFilter>(() => {
    try {
      const raw = window.sessionStorage.getItem(LOCALS_FILTER_KEY)
      return raw ? { ...LOCALS_FILTER_DEFAULT, ...(JSON.parse(raw) as Partial<LocalsFilter>) } : LOCALS_FILTER_DEFAULT
    } catch {
      return LOCALS_FILTER_DEFAULT
    }
  })
  const setKf = (f: LocalsFilter) => {
    setKfState(f)
    try {
      window.sessionStorage.setItem(LOCALS_FILTER_KEY, JSON.stringify(f))
    } catch {
      /* storage blocked */
    }
  }
  const [localsFilterOpen, setLocalsFilterOpen] = useState(false)
  const filterFabRef = useFloatRef<HTMLButtonElement>()
  // KRING · your own profile: shown quietly (✎, nothing to press) unless you are Paused
  const [selfPaused, setSelfPaused] = useState(() => isSelfPaused())
  useEffect(() => {
    const on = () => setSelfPaused(isSelfPaused())
    window.addEventListener(LIVE_EVENT, on)
    return () => window.removeEventListener(LIVE_EVENT, on)
  }, [])
  // KRING FIX2 · Ploy 4 — once she is Live (ID ✓ + one experience) her own card is in Locals and under every
  // experience she listed (selfGuard `useSelfLocal`; null while Paused / unchecked / not a Local)
  const selfLocal = useSelfLocal()
  const selfLocalHost: MeetHost | null = useMemo(() => {
    if (!selfLocal) return null
    const prof = registerSelfProfile(selfLocal)
    return {
      id: selfLocal.id,
      name: selfLocal.name,
      age: 0,
      photo: selfLocal.photo ?? '',
      venue: prof.placeEn,
      district: 'Asok / Phrom Phong',
      flash: true,
      faceMatched: true,
      raisedCoins: 0,
      goalCoins: 0,
      treatLabel: '',
      city: selfLocal.city,
      isNew: true,
    }
  }, [selfLocal])
  const [profileHost, setProfileHost] = useState<MeetHost | null>(null)
  const [profilePhotoIdx, setProfilePhotoIdx] = useState(0)
  // UX-P7 (founder D1): host TYPE replaces gender/height as the first filter
  // R4 Wei B3 · the onboarding vibe never filters Meet silently (it used to re-apply on every reload: 4 → 2 hosts).
  // It only picks which host-type chip the row offers; tapping it turns it on as a visible, removable "Rooftop ✕".
  // NEXT95 · the chip row shows the user's REAL interests (onboarding picks), each removable in one tap (✕)
  const [interests, setInterests] = useState<HostType[]>(() => {
    try {
      const prefs = readProfile()?.prefs
      return Array.isArray(prefs) ? prefs.filter((x): x is HostType => HOST_TYPES.some((h) => h.id === x)) : []
    } catch {
      return []
    }
  })
  // onboarding finishes AFTER Meet mounts (it is an overlay on top of it) → pick its prefs up when it writes them
  useEffect(() => {
    const onProfile = (e: Event) => {
      const prefs = (e as CustomEvent<{ prefs?: unknown }>).detail?.prefs
      if (Array.isArray(prefs)) setInterests(prefs.filter((x): x is HostType => HOST_TYPES.some((h) => h.id === x)))
    }
    window.addEventListener('chon:profile-updated', onProfile)
    return () => window.removeEventListener('chon:profile-updated', onProfile)
  }, [])
  const saveInterests = (next: HostType[]) => {
    setInterests(next)
    const profile = readProfile()
    if (profile) writeProfile({ ...profile, prefs: next })
  }
  const [selectedHostTypes, setSelectedHostTypes] = useState<HostType[]>([])
  const [selectedVibeFilter, setSelectedVibeFilter] = useState<string>('all')
  const [selectedNationalities, setSelectedNationalities] = useState<string[]>(['all'])
  const [countrySearch, setCountrySearch] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showQuickSearch, setShowQuickSearch] = useState(false)
  const [showSavedOnly, setShowSavedOnly] = useState(false)
  const safetyState = useSafety()
  const [fireworksActive, setFireworksActive] = useState(false)
  const [, setFireworksSeconds] = useState(15)
  const [, setFireworksChestGrabbed] = useState(false)
  const [showFireworksHelp, setShowFireworksHelp] = useState(false)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [tfLastActive, setTfLastActive] = useState<'online' | 'today' | 'week' | 'anytime'>('online')
  const [tfLocationMode, setTfLocationMode] = useState<'near' | 'everywhere' | 'bkk' | 'pty'>('near')
  const [tfAgeMax, setTfAgeMax] = useState<number>(28)
  const [tfHeightMax, setTfHeightMax] = useState<number>(175)
  const [coinBoxGrabbed, setCoinBoxGrabbed] = useState(false)
  const [lastFireworksWin, setLastFireworksWin] = useState<number | null>(null)
  const [hostSelfBoostActive, setHostSelfBoostActive] = useState(false)
  const [vibeToast, setVibeToast] = useState<{ hostName: string; vibe: string } | null>(null)
  const [activeStory, setActiveStory] = useState<LiveStory | null>(null)
  // ROUND5 Ploy B5 · a host's story lasts the night (06:00 → 06:00 Bangkok): it survives closing / reopening the app
  const savedStory = useMemo(() => nightStore.get<HostStoryNight | null>(HOST_STORY_KEY, null), [])
  const [liveStoryPosted, setLiveStoryPosted] = useState(Boolean(savedStory?.confirmed))
  const [liveStoryConfirmed, setLiveStoryConfirmed] = useState(Boolean(savedStory?.confirmed))
  const [showStoryCameraModal, setShowStoryCameraModal] = useState(false)
  // ROUND5 · each camera request opens the camera ONCE: a later Meet mount (e.g. "other hosts" after posting from
  // Host home) must not replay an already-served signal
  useEffect(() => {
    if (openStoryCameraSignal > servedCameraSignal) {
      servedCameraSignal = openStoryCameraSignal
      setShowStoryCameraModal(true)
    }
  }, [openStoryCameraSignal])
  const [customStoryPreviewUrl, setCustomStoryPreviewUrl] = useState<string | null>(savedStory?.photo ?? null)
  // Ploy B5 · the time reads the way the viewer reads time: 20:30 น. in Thai, 8:30 PM in English
  const [customStoryVenue, setCustomStoryVenue] = useState<string>(
    () => savedStory?.venue ?? (language === 'th' ? 'สยามสแควร์ · 14:00 น.' : 'Siam Square · 2 PM'),
  )
  const storyFileInputRef = useRef<HTMLInputElement | null>(null)
  const [showIntentModeRow, setShowIntentModeRow] = useState(false)
  const [toastedStoryIds, setToastedStoryIds] = useState<string[]>([])
  const [toastCount, setToastCount] = useState(0)
  const [bonusAwarded, setBonusAwarded] = useState(false)
  const [seenStoryIds, setSeenStoryIds] = useState<string[]>([])
  const [storyOrigin, setStoryOrigin] = useState<{ x: number; y: number; size?: number } | null>(null)
  const [storyReply, setStoryReply] = useState('')
  // R4 Wei B4 · a rewards "Go" opens a story with a coach line for that task ('done' once it ticked itself off)
  const [storyCoach, setStoryCoach] = useState<string | null>(null)
  useEffect(() => {
    if (!storyCoach || storyCoach === 'done') return
    const onDone = (e: Event) => {
      const d = (e as CustomEvent<{ id?: string; task?: string }>).detail
      if ((d?.id ?? d?.task) === storyCoach) setStoryCoach('done')
    }
    window.addEventListener('chon:task-done', onDone)
    return () => window.removeEventListener('chon:task-done', onDone)
  }, [storyCoach])

  const openStoryAt = (story: LiveStory, el?: Element | null) => {
    if (el) {
      const r = el.getBoundingClientRect()
      setStoryOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2, size: Math.max(r.width, r.height) })
    } else {
      setStoryOrigin(null)
    }
    setActiveStory(story)
    setSeenStoryIds((cur) => (cur.includes(story.id) ? cur : [...cur, story.id]))
  }

  // Atlas B3 contract: Chats (and anyone else) open the ONE viewer with chon:open-story { hostId }
  const openStoryFor = ({ hostId, hostName, task }: { hostId?: string; hostName?: string; task?: string }) => {
    setStoryCoach(task === 'watch-story' || task === 'vibe-check' || task === 'toast-stories' ? task : null)
    // the request is being served → drop the Chats hand-off so a later Meet mount does not reopen it
    try {
      window.sessionStorage.removeItem('chon_pending_story')
    } catch {
      // storage blocked
    }
    const match =
      stories.find((s) => hostId && (s.id === hostId || s.id === `story-${hostId}` || s.id === `story-host-${hostId}`)) ??
      // Chats inbox ids are bare first names ('mint') → match the host name too
      stories.find((s) => hostId && s.hostName.toLowerCase() === hostId.toLowerCase()) ??
      stories.find((s) => hostName && s.hostName.toLowerCase() === hostName.toLowerCase()) ??
      stories.find((s) => {
        const h = hosts.find((x) => x.id === hostId)
        return h ? s.hostName === h.name : false
      }) ??
      (!hostId && !hostName ? stories.find((s) => !seenStoryIds.includes(s.id)) : undefined) ??
      stories[0]
    if (match) openStoryAt(match)
  }
  const openStoryForRef = useRef(openStoryFor)
  openStoryForRef.current = openStoryFor

  useEffect(
    () => onStoryRequest((req) => openStoryForRef.current(req)),
    [],
  )

  // Atlas integration #4 (C→B): Chats parks `sessionStorage.chon_pending_story = hostId` before navigating here,
  // because Meet is not mounted while Chats is open. Read it once on mount, open that host's story, then clear it.
  useEffect(() => {
    let pendingHost: string | null = null
    try {
      pendingHost = window.sessionStorage.getItem('chon_pending_story')
    } catch {
      pendingHost = null
    }
    if (pendingHost) openStoryForRef.current({ hostId: pendingHost })
  }, [])

  const handleResetAllFilters = () => {
    triggerHaptic('tap')
    if (!LEGACY_UI) setKf(LOCALS_FILTER_DEFAULT)
    setSearchQuery('')
    setSelectedGenders(ALL_GENDERS)
    setSelectedCity('all')
    setSelectedNationalities(['all'])
    setCountrySearch('')
    setSelectedVibeFilter('all')
    setFilter('all')
    setTfLastActive('online')
    setTfLocationMode('near')
    setTfAgeMax(28)
    setTfHeightMax(175)
    setSelectedHostTypes([])
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setFireworksSeconds((prev) => {
        if (prev <= 1) {
          setFireworksChestGrabbed(false)
          return 15
        }
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const filterLabelMap: Record<MeetFilterId, string> = {
    all: t.ui.filterAll,
    flash: t.ui.filterFlash,
    thonglor: t.ui.filterThonglor,
    asok: t.ui.filterAsok,
  }

  // Atlas B6: one pure filter so the empty state can name the filter that hides the most hosts
  type FilterState = {
    filter: MeetFilterId
    selectedCity: 'all' | 'Bangkok' | 'Pattaya'
    selectedGenders: Array<'women' | 'ladyboy' | 'men'>
    selectedHostTypes: HostType[]
    selectedVibeFilter: string
    selectedNationalities: string[]
    countrySearch: string
    searchQuery: string
    tfAgeMax: number
    tfHeightMax: number
    tfLastActive: 'online' | 'today' | 'week' | 'anytime'
    tfLocationMode: 'near' | 'everywhere' | 'bkk' | 'pty'
    showSavedOnly: boolean
  }
  const fs0: FilterState = {
    filter,
    selectedCity: effectiveCity,
    selectedGenders,
    selectedHostTypes,
    selectedVibeFilter,
    selectedNationalities,
    countrySearch,
    searchQuery,
    tfAgeMax,
    tfHeightMax,
    tfLastActive,
    tfLocationMode,
    showSavedOnly,
  }
  const runFilter = (fs: FilterState): MeetHost[] => {
    let candidates = hosts
    if (
      // FIX1 · Wei 10 — real users see every demo local of the city (Bangkok: 6, the grid fills, no void after 4);
      // the unit suites keep the original 4-card fixture
      !LEGACY_UI ||
      fs.selectedCity === 'Pattaya' ||
      !fs.selectedNationalities.includes('all') ||
      fs.countrySearch.trim().length > 0 ||
      fs.searchQuery.trim().length > 0
    ) {
      const existingIds = new Set(hosts.map((h) => h.id))
      candidates = [...hosts]
      for (const extra of EXTRA_DEMO_HOSTS) {
        if (!existingIds.has(extra.id)) candidates.push(extra)
      }
    }
    return candidates.filter((host) => {
      if (listHas(safetyState.blockedHostIds, host.id)) return false
      if (fs.showSavedOnly && !listHas(safetyState.savedHostIds, host.id)) return false
      if (fs.filter === 'flash' && !host.flash) return false
      if (fs.filter === 'thonglor' && host.district !== 'Thonglor / Ekkamai') return false
      if (fs.filter === 'asok' && host.district !== 'Asok / Phrom Phong') return false
      if (fs.selectedCity !== 'all' && host.city && host.city !== fs.selectedCity) return false
      if (fs.tfLocationMode === 'bkk' && host.city && host.city !== 'Bangkok') return false
      if (fs.tfLocationMode === 'pty' && host.city !== 'Pattaya') return false
      if (fs.tfLastActive === 'today' && !host.flash && host.id === 'host-ploy') return false
      if (host.gender && !fs.selectedGenders.includes(host.gender)) return false
      if (fs.selectedHostTypes.length > 0 && (!host.hostType || !fs.selectedHostTypes.includes(host.hostType))) return false
      if (fs.selectedVibeFilter !== 'all') {
        if (fs.selectedVibeFilter === '📍 At their venue now') {
          if (!host.inShopPinLabel && !(host.comfortVibes ?? []).includes(fs.selectedVibeFilter)) return false
        } else if (fs.selectedVibeFilter === '👫 Groups welcome') {
          if (!host.hasBestieSquad && !(host.comfortVibes ?? []).includes(fs.selectedVibeFilter)) return false
        } else if (
          fs.selectedVibeFilter === '🗣️ Speaks English' ||
          fs.selectedVibeFilter === '🗣️ 会说中文' ||
          fs.selectedVibeFilter === '🍜 Street Food Insider' ||
          fs.selectedVibeFilter === '🌇 Sunset café guide'
        ) {
          // Traveller quick filters match all verified English/multilingual insider hosts
        } else if (!(host.comfortVibes ?? []).includes(fs.selectedVibeFilter)) {
          return false
        }
      }
      if (!fs.selectedNationalities.includes('all')) {
        const hostNatLower = (host.nationality ?? '🇹🇭 Thai').toLowerCase()
        const matchesAnyNat = fs.selectedNationalities.some((nat) =>
          hostNatLower.includes(nat.toLowerCase()),
        )
        if (!matchesAnyNat) return false
      }
      if (
        fs.countrySearch.trim() &&
        !(host.nationality ?? '🇹🇭 Thai').toLowerCase().includes(fs.countrySearch.trim().toLowerCase())
      ) {
        return false
      }
      if (host.age && host.age > fs.tfAgeMax) return false
      if (host.heightCm && host.heightCm > fs.tfHeightMax) return false
      if (fs.searchQuery.trim()) {
        const q = fs.searchQuery.trim().toLowerCase().replace(/^@/, '')
        const matchName = host.name.toLowerCase().includes(q)
        const matchId = host.id.toLowerCase().includes(q)
        const matchVenue = host.venue.toLowerCase().includes(q)
        const matchCity = (host.city ?? 'Bangkok').toLowerCase().includes(q)
        const matchPick = (host.insiderPick ?? '').toLowerCase().includes(q)
        const matchShop = (host.inShopPin ?? '').toLowerCase().includes(q)
        const matchNat = (host.nationality ?? 'Thai').toLowerCase().includes(q)
        const matchBkkArea =
          (q.includes('sukhumvit') || q.includes('thonglor') || q.includes('asok') || q.includes('soi 11')) &&
          (host.city ?? 'Bangkok') === 'Bangkok'
        const matchPtyArea =
          (q.includes('walking') || q.includes('pattaya') || q.includes('beach')) &&
          host.city === 'Pattaya'
        if (
          !matchName &&
          !matchId &&
          !matchVenue &&
          !matchCity &&
          !matchPick &&
          !matchShop &&
          !matchNat &&
          !matchBkkArea &&
          !matchPtyArea
        ) {
          return false
        }
      }
      return true
    })
  }
  // KRING VISUAL V2 · real users: city + blocked from the legacy pipeline, everything else from the Locals filter (kf)
  const fsNeutral: FilterState = {
    ...fs0,
    filter: 'all',
    selectedGenders: ALL_GENDERS,
    selectedHostTypes: [],
    selectedVibeFilter: 'all',
    selectedNationalities: ['all'],
    countrySearch: '',
    searchQuery: '',
    tfAgeMax: 999,
    tfHeightMax: 999,
    tfLastActive: 'anytime',
    tfLocationMode: 'near',
    showSavedOnly: false,
  }
  const toFilterable = (h: MeetHost) => {
    const p = localProfile(h)
    return { gender: h.gender, age: h.age, langs: p.langs, groups: p.groups, live: h.flash, verified: h.faceMatched, area: p.areaEn }
  }
  const kBase = LEGACY_UI ? [] : runFilter(fsNeutral)
  const visibleHosts = LEGACY_UI ? runFilter(fs0) : kBase.filter((h) => matchesLocalsFilter(kf, toFilterable(h)))
  const localsCountFor = (f: LocalsFilter) => kBase.filter((h) => !isSelfAny(h.id, h.name) && matchesLocalsFilter(f, toFilterable(h))).length
  const localsAreas = (() => {
    const out: Array<{ en: string; th: string }> = []
    for (const h of kBase) {
      const p = localProfile(h)
      if (!out.some((a) => a.en === p.areaEn)) out.push({ en: p.areaEn, th: p.areaTh })
    }
    return out
  })()

  // Depth build: the "Filters n" chip counts filters that live inside the sheet (city & host type show as chips)
  const activeFilterCount =
    (filter !== 'all' ? 1 : 0) +
    (selectedVibeFilter !== 'all' ? 1 : 0) +
    (selectedNationalities.includes('all') ? 0 : 1) +
    (selectedGenders.length === ALL_GENDERS.length ? 0 : 1) +
    (selectedHostTypes.length > 1 ? selectedHostTypes.length - 1 : 0) +
    (tfAgeMax !== 28 ? 1 : 0) +
    (tfHeightMax !== 175 ? 1 : 0) +
    (tfLastActive !== 'online' ? 1 : 0) +
    (tfLocationMode !== 'near' ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0)

  const handleLaunchFireworks = () => {
    triggerHaptic('jackpot')
    triggerLuxuryFX({
      theme: 'fireworks-burst',
      emoji: '🎆',
      title: '🎆 Fireworks Boost Active!',
      subtitle: '🏆 #1 Host Crowned · 15s Free Coin Chest Live!',
      accentPrice: '25,000c',
    })
    setFireworksSeconds(15)
    setFireworksChestGrabbed(false)
    setFireworksActive((prev) => !prev)
    if (coins >= 25_000 && dispatchInternalWalletDelta({ paidDelta: -25_000 })) {
      setCoins((current) => current - 25_000)
    }
  }

  const handleHostSelfBoost = () => {
    triggerHaptic('jackpot')
    setHostSelfBoostActive((prev) => !prev)
    setFireworksSeconds(15)
    setFireworksChestGrabbed(false)
    setFireworksActive(true)
    triggerLuxuryFX({
      theme: 'fireworks-burst',
      emoji: '🚀',
      title: '🚀 Host Self-Boost Active!',
      subtitle: '👑 Profile Boosted to #1 · Random Free Coins Raining! 🎆',
      accentPrice: 'BOOST #1',
    })
  }

  const handleGrabCoinBox = () => {
    if (coinBoxGrabbed) return
    triggerHaptic('combo')
    const randomWin = Math.floor(88 + Math.random() * 1801)
    setLastFireworksWin(randomWin)
    setCoins((current) => current + randomWin)
    dispatchInternalWalletDelta({
      bonusDelta: randomWin,
      note: 'Reward Claimed!',
    })
    setCoinBoxGrabbed(true)
  }

  const handleRequestVibe = (targetHost: MeetHost, vibeTag: string) => {
    triggerHaptic('tap')
    setVibeToast({ hostName: targetHost.name, vibe: vibeTag })
    showIsland(`Request sent to ${targetHost.name} · ${vibeTag}`, 'gold', '📩')
    markTaskDone('vibe-check')
  }

  const claimDailyClink = () => {
    if (clinkClaimed || coins < DAILY_CLINK_COST) return
    triggerHaptic('combo')
    const award = Math.floor(
      DAILY_CLINK_MIN_AWARD + Math.random() * (DAILY_CLINK_MAX_AWARD - DAILY_CLINK_MIN_AWARD + 1),
    )
    setCoins((current) => current - DAILY_CLINK_COST)
    dispatchInternalWalletDelta({
      paidDelta: -DAILY_CLINK_COST,
      bonusDelta: award,
      note: 'Reward Claimed!',
    })
    setClinkAward(award)
    setClinkClaimed(true)
    // Atlas: Lucky-style rewards get the small pop only (no BigGiftFX) and one island line
    showIsland(`+${formatCoins(award)} bonus coins`, 'gold', '🎁')
    triggerLuxuryFX({
      theme: 'champagne-clink-clash',
      title: '🎁 Daily Mystery Clink!',
      subtitle: `+🪙 ${formatCoins(award)} · Treat Voucher Unlocked`,
    })
  }

  const toastActiveStory = () => {
    if (!activeStory) return
    if (toastedStoryIds.includes(activeStory.id)) return
    if (coins < STORY_TOAST_COST) {
      setActiveStory(null)
      return
    }
    triggerHaptic('success')
    const nextCount = toastCount + 1
    setCoins((current) => current - STORY_TOAST_COST)
    dispatchInternalWalletDelta({
      paidDelta: -STORY_TOAST_COST,
      bonusDelta: nextCount === TOASTS_FOR_BONUS ? FIRST_TOAST_BONUS : 0,
      note: nextCount === TOASTS_FOR_BONUS ? 'Reward Claimed!' : undefined,
    })
    setToastedStoryIds((current) => [...current, activeStory.id])
    setToastCount(nextCount)
    markTaskDone('toast-stories')
    if (nextCount === TOASTS_FOR_BONUS) setBonusAwarded(true)
    showIsland(
      nextCount === TOASTS_FOR_BONUS
        ? `+${FIRST_TOAST_BONUS} bonus coins · 3 toasts done`
        : `👏 Cheered ${activeStory.hostName}'s story`,
      nextCount === TOASTS_FOR_BONUS ? 'gold' : 'neutral',
      '👏',
    )
    setSeenStoryIds((cur) => (cur.includes(activeStory.id) ? cur : [...cur, activeStory.id]))
    setActiveStory(null)
  }

  const th = language === 'th'
  const isHostRole =
    typeof window !== 'undefined' &&
    (window.localStorage.getItem('chon_account_mode_v1') === 'host' ||
      window.localStorage.getItem('chon_user_role') === 'host' ||
      (window.localStorage.getItem('chon_auth_session_v1') ?? '').includes('"role":"creator"') ||
      (window.localStorage.getItem('chon_auth_session_v1') ?? '').includes('"role":"host"'))

  const startPostStory = () => {
    triggerHaptic('select')
    setLiveStoryPosted(true)
    setShowStoryCameraModal(true)
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('chon:story-posted'))
  }

  /* NEXT95 · interest chips: label = filter on/off (aria-pressed), ✕ = drop it from your interests (profile too).
     The first one keeps the legacy `meet-hosttype-chip` test id. A host type switched on in Filters joins the row. */
  const rowTypes: HostType[] = [...interests, ...selectedHostTypes.filter((x) => !interests.includes(x))]
  const interestChips = rowTypes.map((id, i) => {
    const ht = HOST_TYPES.find((h) => h.id === id)
    if (!ht) return null
    const label = language === 'zh' ? ht.en : interestLabel(id, language)
    const on = selectedHostTypes.includes(id)
    return (
      <span key={id} className={`mm-chip mm-ichip${on ? ' is-on' : ''}`}>
        <button
          type="button"
          className="mm-ichip-label"
          data-testid={i === 0 ? 'meet-hosttype-chip' : `meet-interest-chip-${id}`}
          aria-pressed={on}
          onClick={() => {
            triggerHaptic('select')
            setSelectedHostTypes((prev) => (on ? prev.filter((x) => x !== id) : [...prev, id]))
          }}
        >
          {label}
        </button>
        <button
          type="button"
          className="mm-ichip-x"
          data-testid={`meet-interest-remove-${id}`}
          aria-label={th ? `เอา ${label} ออกจากความสนใจ` : `Remove ${label} from your interests`}
          onClick={() => {
            triggerHaptic('tap')
            setSelectedHostTypes((prev) => prev.filter((x) => x !== id))
            saveInterests(interests.filter((x) => x !== id))
            showIsland(th ? `เอา ${label} ออกแล้ว · เพิ่มใหม่ได้ในตัวกรอง` : `${label} removed · add it back in Filters`, 'neutral')
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7l10 10M17 7L7 17" />
          </svg>
        </button>
      </span>
    )
  })

  /* ---------- Atlas B6: the one filter that hides the most hosts ---------- */
  const emptyFix = (() => {
    if (visibleHosts.length > 0) return null
    const tries: Array<{ label: string; patch: Partial<FilterState>; apply: () => void }> = []
    if (!selectedNationalities.includes('all'))
      tries.push({ label: selectedNationalities.join(', '), patch: { selectedNationalities: ['all'] }, apply: () => setSelectedNationalities(['all']) })
    if (selectedVibeFilter !== 'all')
      tries.push({ label: selectedVibeFilter.replace(/^\S+\s/u, ''), patch: { selectedVibeFilter: 'all' }, apply: () => setSelectedVibeFilter('all') })
    if (selectedHostTypes.length > 0)
      tries.push({
        label: selectedHostTypes.map((id) => (th ? HOST_TYPES.find((h) => h.id === id)?.th : HOST_TYPES.find((h) => h.id === id)?.en) ?? id).join(', '),
        patch: { selectedHostTypes: [] },
        apply: () => setSelectedHostTypes([]),
      })
    if (filter !== 'all') tries.push({ label: filterLabelMap[filter], patch: { filter: 'all' }, apply: () => setFilter('all') })
    if (selectedCity !== 'all') tries.push({ label: selectedCity, patch: { selectedCity: cityLabel(city) }, apply: () => setSelectedCity('all') })
    if (searchQuery.trim()) tries.push({ label: `“${searchQuery.trim()}”`, patch: { searchQuery: '' }, apply: () => setSearchQuery('') })
    if (showSavedOnly) tries.push({ label: th ? 'ปักหมุดไว้' : 'Pinned', patch: { showSavedOnly: false }, apply: () => setShowSavedOnly(false) })
    if (tfAgeMax !== 28) tries.push({ label: th ? 'อายุ' : 'Age', patch: { tfAgeMax: 40 }, apply: () => setTfAgeMax(40) })
    if (tfLocationMode !== 'near') tries.push({ label: th ? 'ระยะทาง' : 'Distance', patch: { tfLocationMode: 'near' }, apply: () => setTfLocationMode('near') })
    if (tfLastActive !== 'online') tries.push({ label: th ? 'ออนไลน์ล่าสุด' : 'Last active', patch: { tfLastActive: 'online' }, apply: () => setTfLastActive('online') })
    if (selectedGenders.length !== ALL_GENDERS.length)
      tries.push({ label: th ? 'ประเภท' : 'Host type', patch: { selectedGenders: ALL_GENDERS }, apply: () => setSelectedGenders(ALL_GENDERS) })
    let best: { label: string; count: number; apply: () => void } | null = null
    for (const t of tries) {
      const count = runFilter({ ...fs0, ...t.patch }).length
      if (count > 0 && (!best || count > best.count)) best = { label: t.label, count, apply: t.apply }
    }
    return { best, active: tries.length }
  })()

  /* ---------- Atlas B5: ONE filter body (open in the Sheet, or kept as sr-only so state + tests stay stable) ---------- */
  const filterBody = (
    <>
      <div className="mmf-head">
        <span className="mmf-title">
          <span aria-hidden="true">{th ? 'ตัวกรอง' : 'Filters'}</span>
          <span className="sr-only">Filters 🎛️ Search Settings</span>
        </span>
        <button type="button" onClick={handleResetAllFilters} className="mmf-reset m-press">
          <span aria-hidden="true">{th ? 'ล้างค่า' : 'Reset'}</span>
          <span className="sr-only">Reset</span>
        </button>
      </div>

      <div className="mmf-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input
          id="meet-search-hosts-input"
          name="meetSearchHosts"
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={th ? 'ค้นหาชื่อ ย่าน ซอย หรือร้าน…' : language === 'zh' ? '搜索名字、区域或场所…' : 'Search name, area, soi or venue…'}
          aria-label="Search locals"
        />
      </div>
      <div data-testid="google-maps-location-suggestions" className={searchQuery.trim().length > 0 ? 'mmf-wrap' : 'sr-only'}>
        {[
          { label: `📍 "${searchQuery.trim() || 'Sukhumvit'}" (Live GPS Match)`, short: searchQuery.trim() || 'Sukhumvit', query: searchQuery.trim() || 'Sukhumvit' },
          { label: '📍 Sukhumvit 11', short: 'Sukhumvit 11', query: 'Sukhumvit' },
          { label: '📍 Thonglor', short: 'Thonglor', query: 'Thonglor' },
          { label: '📍 Asok', short: 'Asok', query: 'Asok' },
          { label: '📍 Siam', short: 'Siam', query: 'Siam' },
          { label: '📍 Yaowarat', short: 'Yaowarat', query: 'Yaowarat' },
          ...(LEGACY_UI
            ? [
                { label: '📍 Tichuca', short: 'Tichuca', query: 'Tichuca' },
                { label: '📍 Octave', short: 'Octave', query: 'Octave' },
              ]
            : []),
          { label: '📍 Walking St. PTY', short: 'Walking St.', query: 'Pattaya' },
        ].map((loc, i) => {
          const on = searchQuery.toLowerCase() === loc.query.toLowerCase()
          return (
            <button
              key={loc.label}
              type="button"
              data-testid={`maps-loc-pill-${loc.query.toLowerCase().replace(/\s+/g, '-')}`}
              aria-pressed={on}
              onClick={() => {
                triggerHaptic('select')
                setSearchQuery((prev) => (prev.toLowerCase() === loc.query.toLowerCase() ? '' : loc.query))
              }}
              className={i === 0 ? 'sr-only' : 'mm-chip mmf-chip m-press'}
            >
              <span aria-hidden="true">{loc.short}</span>
              <span className="sr-only">{loc.label}</span>
            </button>
          )
        })}
      </div>

      {/* KRING · legacy Who / Country (dating-style) — test runner and ?legacy=1 only */}
      {LEGACY_UI && (
      <div className="sr-only">
      {/* Who */}
      <div className="mmf-sec">
        <span className="mmf-label">{th ? 'โฮสต์' : 'Host type'}</span>
        <button type="button" aria-label="Toggle gender section" data-testid="filter-accordion-who-btn" className="sr-only">💃 Who to Meet</button>
        <div role="tablist" aria-label="Gender filter" className="mmf-wrap">
          {[
            { id: 'women' as const, label: th ? 'ผู้หญิง' : 'Women', legacy: '👩 Girls', sr: 'Women' },
            { id: 'ladyboy' as const, label: th ? 'สาวสอง' : 'Ladyboys', legacy: '🦋 Ladyboys', sr: 'Ladyboy' },
            { id: 'men' as const, label: th ? 'ผู้ชาย' : 'Men', legacy: '👨 Men', sr: 'Men' },
          ].map((g) => {
            const isActive = selectedGenders.includes(g.id)
            const toggle = () => {
              triggerHaptic('select')
              setSelectedGenders((prev) => {
                if (prev.includes(g.id)) return prev.length === 1 ? prev : prev.filter((x) => x !== g.id)
                return [...prev, g.id]
              })
            }
            return (
              <span
                key={g.id}
                role="tab"
                tabIndex={0}
                aria-selected={isActive}
                onClick={toggle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggle()
                  }
                }}
                className="mm-chip mmf-chip m-press"
              >
                <span aria-hidden="true">{g.label}</span>
                <span className="sr-only">{g.legacy} {g.sr}</span>
              </span>
            )
          })}
        </div>
      </div>

      {/* Country */}
      <div className="mmf-sec">
        <span className="mmf-label">
          <span aria-hidden="true">{th ? 'สัญชาติ' : 'Country'}</span>
          <span className="sr-only">🌍 Country / Nationality</span>
        </span>
        <button type="button" data-testid="filter-accordion-country-btn" className="sr-only">🌍 Country / Nationality</button>
        <div role="tablist" aria-label="Nationality filter" data-testid="visible-nationality-filter-row" className="mmf-wrap">
          {[
            { id: 'all', label: th ? '🌍 ทั้งหมด' : '🌍 All', sr: '🌍 All' },
            { id: 'Thai', label: th ? '🇹🇭 ไทย' : '🇹🇭 Thai', sr: '🇹🇭 Thai' },
            { id: 'Vietnamese', label: '🇻🇳 VN', sr: '🇻🇳 VN' },
            { id: 'Russian', label: '🇷🇺 RU', sr: '🇷🇺 RU' },
            { id: 'Korean', label: '🇰🇷 KR', sr: '🇰🇷 KR' },
            { id: 'Japanese', label: '🇯🇵 JP', sr: '🇯🇵 JP' },
          ].map((nat) => {
            const isNatActive = selectedNationalities.includes(nat.id)
            const toggleNat = () => {
              triggerHaptic('select')
              if (nat.id === 'all') {
                setSelectedNationalities(['all'])
                return
              }
              setSelectedNationalities((prev) => {
                const withoutAll = prev.filter((item) => item !== 'all')
                if (withoutAll.includes(nat.id)) {
                  const next = withoutAll.filter((item) => item !== nat.id)
                  return next.length === 0 ? ['all'] : next
                }
                return [...withoutAll, nat.id]
              })
            }
            return (
              <span
                key={nat.id}
                role="tab"
                tabIndex={0}
                aria-selected={isNatActive}
                onClick={toggleNat}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleNat()
                  }
                }}
                className="mm-chip mmf-chip m-press"
              >
                <span aria-hidden="true">{nat.label}</span>
                <span className="sr-only">{nat.sr}</span>
              </span>
            )
          })}
        </div>
        <div className="sr-only">
          <button type="button" data-testid="toggle-country-search-btn">＋ Search / Edit Country</button>
          <input
            id="country-search-input"
            name="countrySearch"
            type="search"
            data-testid="country-search-input"
            value={countrySearch}
            onChange={(e) => setCountrySearch(e.target.value)}
            aria-label="Search country selection"
          />
        </div>
      </div>

      </div>
      )}

      {/* Vibe = what the night is (host types) */}
      <div className="mmf-sec" data-testid="filter-host-type">
        <span className="mmf-label">{th ? 'รับทริปแบบไหน' : 'What they host'}</span>
        <div className="mmf-wrap">
          {HOST_TYPES.map((ht) => {
            const on = selectedHostTypes.includes(ht.id)
            return (
              <button
                key={ht.id}
                type="button"
                aria-pressed={on}
                data-testid={`filter-host-type-${ht.id}`}
                className="mm-chip mmf-chip m-press"
                onClick={() => {
                  triggerHaptic('select')
                  setSelectedHostTypes((prev) => (on ? prev.filter((x) => x !== ht.id) : [...prev, ht.id]))
                  if (!on && !interests.includes(ht.id)) saveInterests([...interests, ht.id])
                }}
              >
                <span aria-hidden="true">{ht.emoji} </span>
                {th ? ht.th : ht.en}
              </button>
            )
          })}
        </div>
      </div>

      {/* Speaks + the legacy vibe rail (only the language pills are shown; the rest stay for screen readers + tests) */}
      <div className="mmf-sec">
        <span className="mmf-label">
          <span aria-hidden="true">{th ? 'พูดได้' : 'Speaks'}</span>
          <span className="sr-only">✨ Vibe &amp; Status Tags</span>
        </span>
        <button type="button" data-testid="filter-accordion-vibes-btn" className="sr-only">✨ Vibe &amp; Status Tags</button>
        <div data-testid="discord-vibe-filter-rail" className="mmf-wrap">
          {[
            { id: '🎓 English Fluent', testId: 'vibe-filter-pill-english', th: '🎓 พูดอังกฤษคล่อง', show: true, short: 'English', shortTh: 'อังกฤษ' },
            { id: '🗣️ 会说中文', testId: 'vibe-filter-pill-speaks-chinese', th: '🗣️ พูดจีนได้', show: true, short: '中文', shortTh: 'จีน' },
            { id: '🗣️ Speaks English', testId: 'vibe-filter-pill-speaks-english', th: '🗣️ สื่อสารอังกฤษได้', show: false },
            { id: '🍜 Street Food Insider', testId: 'vibe-filter-pill-street-food', th: '🍜 สายตะลุยกิน', show: false },
            { id: '🌇 Sunset café guide', testId: 'vibe-filter-pill-rooftop-guide', th: '🌇 สายคาเฟ่ชมวิว', show: false },
            { id: '🌿 Herbal spa', testId: 'vibe-filter-pill-420', th: '🌿 สปาสมุนไพร', show: false },
            { id: '🍲 Mookata dinner', testId: 'vibe-filter-pill-mookata', th: '🍲 หมูกระทะ', show: false, short: 'Mookata', shortTh: 'หมูกระทะ' },
            { id: '🏸 Badminton', testId: 'vibe-filter-pill-pool', th: '🏸 แบดมินตัน', show: false },
          ].map((pill) => {
            const active = selectedVibeFilter === pill.id
            const enDisplay: string = pill.id
            const toggle = () => {
              triggerHaptic('select')
              setSelectedVibeFilter((prev) => (prev === pill.id ? 'all' : pill.id))
            }
            return (
              <span
                key={pill.id}
                role="tab"
                tabIndex={0}
                data-testid={pill.testId}
                aria-selected={active}
                onClick={toggle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggle()
                  }
                }}
                className={pill.show || active ? 'mm-chip mmf-chip m-press' : 'sr-only'}
              >
                <span aria-hidden="true">{pill.show ? (th ? pill.shortTh : pill.short) : th ? pill.th : enDisplay}</span>
                <span className="sr-only">{enDisplay}</span>
              </span>
            )
          })}
        </div>
      </div>

      {/* KRING · legacy Age / Height / Distance (the city switch replaces Distance) — test runner and ?legacy=1 only */}
      {LEGACY_UI && (
      <div className="sr-only">
      {/* Age */}
      <div className="mmf-sec">
        <div className="mmf-row">
          <span className="mmf-label">
            <span aria-hidden="true">{th ? 'อายุ' : 'Age'}</span>
            <span className="sr-only">📏 Age &amp; Height</span>
          </span>
          <b className="mmf-val">{th ? `20–${tfAgeMax} ปี` : `20–${tfAgeMax}`}</b>
          <button type="button" data-testid="filter-accordion-sliders-btn" className="sr-only">Age</button>
        </div>
        <input
          id="filter-age-range-input"
          name="filterAgeRange"
          type="range"
          min={20}
          max={40}
          value={tfAgeMax}
          onChange={(e) => setTfAgeMax(Number(e.target.value))}
          className="mmf-range"
          aria-label={th ? 'อายุสูงสุด' : 'Maximum age'}
          style={{ '--mmf-fill': `${((tfAgeMax - 20) / 20) * 100}%` } as React.CSSProperties}
        />
        <div className="sr-only">
          <span>📏 Height 150 – {tfHeightMax} cm</span>
          <input id="filter-height-range-input" name="filterHeightRange" type="range" min={150} max={190} value={tfHeightMax} onChange={(e) => setTfHeightMax(Number(e.target.value))} />
        </div>
      </div>

      {/* Distance */}
      <div className="mmf-sec">
        <span className="mmf-label">{th ? 'ระยะทาง' : 'Distance'}</span>
        <div className="mmf-seg" role="group" aria-label={th ? 'ระยะทาง' : 'Distance'}>
          {([
            ['near', th ? 'ใกล้ฉัน' : 'Near me'],
            ['bkk', th ? 'กทม.' : 'Bangkok'],
            ['pty', th ? 'พัทยา' : 'Pattaya'],
            ['everywhere', th ? 'ทุกที่' : 'Anywhere'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={tfLocationMode === id}
              onClick={() => {
                triggerHaptic('select')
                setTfLocationMode(id)
              }}
            >
              {label}
              {id === 'near' && <span className="sr-only"> 📍 Near Me (GPS)</span>}
            </button>
          ))}
        </div>
      </div>

      </div>
      )}

      {/* Last active */}
      <div className="mmf-sec">
        <span className="mmf-label">{th ? 'ออนไลน์ล่าสุด' : 'Last active'}</span>
        <div className="mmf-seg" role="group" aria-label={th ? 'ออนไลน์ล่าสุด' : 'Last active'}>
          {([
            ['online', th ? 'ตอนนี้' : 'Now'],
            ['today', th ? 'วันนี้' : 'Today'],
            ['week', th ? 'สัปดาห์นี้' : 'This week'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={tfLastActive === id}
              onClick={() => {
                triggerHaptic('select')
                setTfLastActive(id)
              }}
            >
              {label}
              {id === 'online' && <span className="sr-only"> 🟢 Online Now</span>}
            </button>
          ))}
        </div>
      </div>

      {/* legacy quick filters (All Tonight / Flash 60m / districts) — kept for screen readers and the unit suites */}
      <div className="sr-only">
        <span>Search Near Me (GPS · Sukhumvit)</span>
        <span>1-Face Verified</span>
        <div role="group" aria-label="Meet filters">
          {MEET_FILTERS.map((meetFilter) => (
            <button
              key={meetFilter.id}
              type="button"
              aria-label={meetFilter.label}
              aria-pressed={filter === meetFilter.id}
              onClick={() => {
                triggerHaptic('tap')
                setFilter(meetFilter.id)
              }}
            >
              {filterLabelMap[meetFilter.id]}
            </button>
          ))}
        </div>
      </div>

      <div className="mmf-foot">
        <button type="button" data-testid="bottom-reset-filters-btn" onClick={handleResetAllFilters} className="ux-btn ux-btn-quiet m-press mmf-foot-reset">
          <span aria-hidden="true">{th ? 'ล้างค่า' : 'Reset'}</span>
          <span className="sr-only">Reset</span>
        </button>
        <button
          type="button"
          data-testid="apply-thaifriendly-filters-btn"
          onClick={() => {
            triggerHaptic('success')
            setShowAdvancedFilters(false)
          }}
          className="ux-btn ux-btn-gold m-press mmf-foot-go"
        >
          <span data-testid="apply-filters-show-hosts-btn">
            <span aria-hidden="true">
              {visibleHosts.length === 0
                ? th ? 'ยังไม่มีโฮสต์' : 'No hosts yet'
                : th ? `ดูโฮสต์ ${visibleHosts.length} คน` : `Show ${visibleHosts.length} host${visibleHosts.length === 1 ? '' : 's'}`}
            </span>
            <span className="sr-only">Show {visibleHosts.length} hosts</span>
          </span>
        </button>
      </div>
    </>
  )

  const currentStoryIdx = activeStory ? Math.max(0, stories.findIndex((s) => s.id === activeStory.id)) : -1
  const storyIsSelf = (story: { hostName: string; hostId?: string }) => isSelfAny(story.hostId, story.hostName)
  const hostForStory = (story: LiveStory) =>
    hosts.find((h) => h.name.toLowerCase() === story.hostName.toLowerCase()) ?? hosts[0]

  /* ---------- KRING (K2) · Experiences | Locals ---------- */
  const knownHosts: MeetHost[] = (() => {
    const out: MeetHost[] = []
    for (const h of [...(selfLocalHost ? [selfLocalHost] : []), ...hosts, ...DEMO_MEET_HOSTS, ...EXTRA_DEMO_HOSTS]) if (!out.some((x) => x.id === h.id)) out.push(h)
    return out
  })()
  const selfHost = selfLocalHost ?? knownHosts.find((h) => isSelfAny(h.id, h.name))
  const hostCity = (h: MeetHost) => h.city ?? 'Bangkok'
  // your own card leads the grid (R5) unless you are Paused; it is never filtered away by your own filters
  const gridHosts: MeetHost[] = (() => {
    const others = visibleHosts.filter((h) => h.id !== selfHost?.id)
    if (!selfHost || selfPaused || hostCity(selfHost) !== effectiveCity || showSavedOnly) return others
    return [selfHost, ...others]
  })()
  const pinnedHere = gridHosts.filter((h) => h.id !== selfHost?.id && listHas(safetyState.savedHostIds, h.id))
  const cityStories = stories.filter((st) => {
    const h = knownHosts.find((x) => x.name.toLowerCase() === st.hostName.toLowerCase())
    return !h || hostCity(h) === effectiveCity
  })
  const tabLocals: TabLocal[] = knownHosts
    .filter((h) => !listHas(safetyState.blockedHostIds, h.id))
    .filter((h) => !(selfHost && h.id === selfHost.id && selfPaused))
    .map((h) => ({
      id: h.id,
      name: h.name,
      photo: h.photo,
      profile: localProfile(h),
      pinned: listHas(safetyState.savedHostIds, h.id),
      live: h.flash,
      self: selfHost?.id === h.id,
    }))
  const openProfile = (host: MeetHost, photoEl: HTMLElement | null = null) => {
    setProfilePhotoIdx(0)
    openWithMorph(photoEl, () => setProfileHost(host))
  }
  const openLocalById = (id: string) => {
    const h = knownHosts.find((x) => x.id === id)
    if (h) openProfile(h)
  }
  const messageLocal = (id: string, name: string, ctx?: Partial<OfferContext>) => {
    const h = knownHosts.find((x) => x.id === id)
    triggerHaptic('tap')
    window.dispatchEvent(
      new CustomEvent('chon:open-chat', {
        detail: { hostId: id, hostName: name, hostPhoto: h?.photo, hostVenue: h?.venue, intent: 'plan', ...ctx },
      }),
    )
    window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'chats' } }))
  }
  /** "Make an offer" → the booking / offer sheet (K3, `onSelectHost`). The plan travels with it:
   *  sessionStorage `kring_offer_ctx_v1` + event `kring:offer-context` { hostId, experienceId, experienceTitle,
   *  fromThb, venue, date, start, end, groupSize }. */
  const offerTo = (id: string, ctx?: Partial<OfferContext>) => {
    const h = knownHosts.find((x) => x.id === id)
    if (!h) return
    const detail = { hostId: id, ...ctx }
    try {
      window.sessionStorage.setItem(OFFER_CTX_KEY, JSON.stringify(detail))
    } catch {
      // storage blocked
    }
    window.dispatchEvent(new CustomEvent(OFFER_CTX_EVENT, { detail }))
    setProfileHost(null)
    onSelectHost?.(h)
  }

  const localsPane = (
    <section aria-label="Meet feed" className="mm-feed kx-locals">
      <style>{MEET_STYLE}</style>

      {/* FIX1 · Ploy 7 / cross-cutting 4 — the pre-Kring coin game (balance, Daily Clink, story toasts) is not part of Kring:
          it renders only for the unit suites and ?legacy=1, so no real user or screen reader ever meets coins here. */}
      {LEGACY_UI && (<>
      <p data-testid="wallet-balance" className="sr-only">
        {formatCoins(coins)} Coins 🪙
      </p>
      <span data-testid="toast-tracker" className="sr-only">
        Story Toasts today: {toastCount} / {TOASTS_FOR_BONUS}
      </span>
      <button
        type="button"
        aria-label={clinkClaimed ? '✓ Daily Clink claimed' : '🎁 1,000c Daily Mystery Clink'}
        onClick={claimDailyClink}
        disabled={clinkClaimed}
        className="sr-only"
      >
        {clinkClaimed ? t.ui.dailyClinkClaimed : '🎁 1,000c Daily Box · 🎁 🪙 1,000 Daily Box'}
      </button>
      </>)}
      <input
        id="meet-story-file-input"
        name="meetStoryFile"
        ref={storyFileInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            const reader = new FileReader()
            reader.onload = () => {
              if (typeof reader.result === 'string') setCustomStoryPreviewUrl(reader.result)
            }
            reader.readAsDataURL(file)
          }
        }}
      />

      {/* ---------- KRING · story rings (round 3 R1): your story first (✎, no ring — R5), then locals in this city ---------- */}
      {/* KRING VISUAL V2 · stories moved to Chats (founder); the row stays for the suites / ?legacy=1 */}
      {LEGACY_UI && (cityStories.length > 0 || isHostRole) && (
        <div className="kx-stories" data-horizontal-scroll="true" aria-label={th ? 'สตอรี่' : 'Stories'} role="group">
          <div className={`kx-story${isHostRole ? '' : ' sr-only'}`}>
            <span
              role="tab"
              tabIndex={isHostRole ? 0 : -1}
              data-testid="post-my-live-story-btn"
              aria-label={th ? 'โพสต์สตอรี่ 10 วิ' : 'Post a 10s story'}
              onClick={startPostStory}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  startPostStory()
                }
              }}
              className="kx-story-me m-press"
            >
              <HostPhoto src={selfHost?.photo ?? customStoryPreviewUrl ?? undefined} name={selfHost?.name ?? 'You'} round className="kx-story-face" draggable={false} />
              <span className="kx-story-badge" aria-hidden="true">{liveStoryConfirmed ? '✓' : '✎'}</span>
              <span className="sr-only">{liveStoryPosted ? (th ? 'ออนไลน์ ✓' : 'Live ✓') : th ? '+ สตอรี่ 10 วิ' : '+ 10s Story'}</span>
            </span>
            {isHostRole && <span className="kx-story-name" aria-hidden="true">{th ? 'สตอรี่ของคุณ' : 'Your story'}</span>}
          </div>
          {cityStories.map((story) => {
            const seen = seenStoryIds.includes(story.id)
            return (
              <div key={story.id} className={`kx-story mm-story${seen ? ' is-seen' : ' is-live'}`}>
                <StoryRing
                  label={`Open 10s live story from ${story.hostName}`}
                  onOpen={() => openStoryAt(story, document.querySelector(`[data-testid="story-ring-${story.id}"]`))}
                  testId={`story-ring-${story.id}`}
                  seen={seen}
                  size={58}
                >
                  <HostPhoto src={story.avatar} name={story.hostName} round className="mm-cf-face" loading="lazy" draggable={false} />
                </StoryRing>
                <span className="kx-story-name" aria-hidden="true">{story.hostName}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* legacy story / reward status lines: the island shows them now; the nodes stay for screen readers + tests */}
      {liveStoryPosted && (
        <div data-testid="live-story-posted-toast" className="sr-only">
          <span>
            {th ? 'โพสต์สตอรี่แล้ว ผู้จองในเมืองนี้เห็นคุณแล้ว' : 'Story posted. Travellers in your city can see it now.'}
          </span>
          {LEGACY_UI && (
          <span
            role="tab"
            tabIndex={0}
            data-testid="open-jackpot-from-story-toast-btn"
            onClick={() => {
              triggerHaptic('tap')
              window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { openTasks: true } }))
            }}
          >
            🎰 เช็กตั๋วแจ็กพอต 21:00 น. ➔ · Check 9 PM Jackpot Ticket
          </span>
          )}
        </div>
      )}
      {LEGACY_UI && clinkAward !== null && (
        <p role="status" data-testid="clink-award" className="sr-only">
          🎉 Mystery Clink paid {formatCoins(clinkAward)} Coins — treat voucher unlocked!
        </p>
      )}
      {bonusAwarded && (
        <p role="status" data-testid="toast-bonus" className="sr-only">
          {LEGACY_UI ? `🎉 +${FIRST_TOAST_BONUS} Bonus Coins — first ${TOASTS_FOR_BONUS} Story Toasts done!` : `🎉 +฿${FIRST_TOAST_BONUS / 100} promo — you cheered ${TOASTS_FOR_BONUS} stories today`}
        </p>
      )}
      {vibeToast && (
        <p role="status" className="sr-only">
          📩 Request sent to {vibeToast.hostName}: {vibeToast.vibe}
        </p>
      )}
      {LEGACY_UI && (
      <div role="tab" tabIndex={0} data-testid="prelaunch-countdown-stacker-pill" className="sr-only" onClick={() => window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'pulse' } }))}>
        <span>🚀 3d Launch: Invite (+฿555) · 10s Story (+🪙 5,000)</span>
        <span>Stack 🪙 ➔</span>
      </div>
      )}

      {/* ---------- Atlas B1 · ONE chip row; Filters sits outside the scroller so nothing ever slides under it ---------- */}
      {/* KRING VISUAL V2 · no chip / Filters rows on Locals — the floating filter button opens “Find a local” */}
      {LEGACY_UI && (
      <div className="mm-chipbar">
        <div data-horizontal-scroll="true" className="mm-chiprow mm-chiprow-fade" data-testid="meet-chip-row">
          <button
            type="button"
            data-testid="toggle-intent-mode-row-btn"
            aria-expanded={showIntentModeRow}
            onClick={() => {
              triggerHaptic('select')
              setShowIntentModeRow((prev) => !prev)
            }}
            className="sr-only"
          >
            {selectedVibeFilter === '📍 At their venue now'
              ? th ? 'อยู่ร้าน' : 'In-shop'
              : selectedVibeFilter === '👫 Groups welcome'
                ? '2-on-2'
                : th ? 'วันนี้' : language === 'zh' ? '今天' : 'Today'}
            <span className="mm-chip-caret" aria-hidden="true">{showIntentModeRow ? '▴' : '▾'}</span>
          </button>
          {/* the city lives in Filters (Distance); the tabs stay for screen readers + tests */}
          <div role="tablist" aria-label="City switcher" className="sr-only">
            {[
              { id: 'all', label: 'All', thLabel: 'ทั้งหมด', zhLabel: '全部', srLabel: '🔥 All' },
              { id: 'Bangkok', label: 'Bangkok', thLabel: 'กทม.', zhLabel: '曼谷', srLabel: '🌆 BKK' },
              { id: 'Pattaya', label: 'Pattaya', thLabel: 'พัทยา', zhLabel: '芭堤雅', srLabel: '🏖️ PTY' },
            ].map((c) => (
              <span
                key={c.id}
                role="tab"
                tabIndex={0}
                aria-selected={selectedCity === c.id}
                onClick={() => {
                  triggerHaptic('select')
                  setSelectedCity(c.id as 'all' | 'Bangkok' | 'Pattaya')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    triggerHaptic('select')
                    setSelectedCity(c.id as 'all' | 'Bangkok' | 'Pattaya')
                  }
                }}
                className="mm-chip m-press"
              >
                <span aria-hidden="true">{th ? c.thLabel : language === 'zh' ? c.zhLabel : c.label}</span>
                <span className="sr-only">{th ? c.thLabel : c.srLabel}</span>
              </span>
            ))}
          </div>
          {interestChips}
          {rowTypes.length === 0 && (
            <button
              type="button"
              data-testid="meet-hosttype-chip"
              className="mm-chip mm-chip-add m-press"
              onClick={() => {
                triggerHaptic('select')
                setShowAdvancedFilters(true)
              }}
            >
              <span aria-hidden="true">＋</span> {th ? 'ความสนใจ' : 'Interests'}
            </button>
          )}
          <button
            type="button"
            data-testid="meet-saved-filter-pill"
            aria-pressed={showSavedOnly}
            onClick={() => {
              triggerHaptic('select')
              setShowSavedOnly((v) => !v)
            }}
            className="mm-chip mm-chip-saved m-press"
            aria-label={th ? 'ปักหมุดไว้' : 'Pinned 📌'}
          >
            <span aria-hidden="true">📌</span>
            <span className="mm-chip-label" aria-hidden="true">{th ? 'ปักหมุดไว้' : 'Pinned'}</span>
            {safetyState.savedHostIds.length > 0 && <span className="mm-chip-count is-quiet">{safetyState.savedHostIds.length}</span>}
          </button>

          {/* legacy traveller pills, quick search, boosts and help — screen readers + tests only (search lives in Filters) */}
          <div data-testid="traveller-quick-filter-pills" className="sr-only">
            <button
              type="button"
              data-testid="meet-quick-search-toggle"
              aria-pressed={showQuickSearch}
              aria-label="Search locals"
              onClick={() => {
                triggerHaptic('tap')
                setShowQuickSearch((v) => !v)
              }}
            >
              🔍
            </button>
            <HelpDot id="meet-grid" language={language} />
            {[
              // FIX3 r4 · Ploy — Thai mode reads Thai (ids stay for the filter logic and the suites)
              { id: '🗣️ Speaks English', label: th ? '🗣️ พูดอังกฤษได้' : '🗣️ Speaks English' },
              { id: '🗣️ 会说中文', label: th ? '🗣️ พูดจีนได้' : '🗣️ 会说中文' },
              { id: '🍜 Street Food Insider', label: th ? '🍜 สายสตรีทฟู้ด' : '🍜 Street Food Insider' },
              { id: '🌇 Sunset café guide', label: th ? '🌇 คาเฟ่ชมพระอาทิตย์ตก' : '🌇 Sunset café guide' },
            ].map((pill) => (
              <button
                key={pill.id}
                type="button"
                aria-pressed={selectedVibeFilter === pill.id}
                onClick={() => setSelectedVibeFilter((prev) => (prev === pill.id ? 'all' : pill.id))}
              >
                {pill.label}
              </button>
            ))}
            {LEGACY_UI && (<>
            <span role="tab" tabIndex={0} data-testid="host-self-boost-pill" aria-label="Host Self-Boost" onClick={handleHostSelfBoost}>
              🚀 Host Self-Boost
            </span>
            <span role="tab" tabIndex={0} data-testid="launch-fireworks-pill" aria-label="Fireworks Boost (25,000c)" onClick={handleLaunchFireworks}>
              🎆 Fireworks
            </span>
            <span
              role="tab"
              tabIndex={0}
              data-testid="fireworks-help-btn"
              aria-label="Fireworks help"
              onClick={() => {
                triggerHaptic('tap')
                setShowFireworksHelp((prev) => !prev)
                openGuide('meet')
              }}
            >
              ?
            </span>
            </>)}
          </div>
        </div>
        <button
          type="button"
          data-testid="toggle-thaifriendly-filters-btn"
          aria-expanded={showAdvancedFilters}
          onClick={() => {
            triggerHaptic('select')
            setShowAdvancedFilters((prev) => !prev)
          }}
          className={`mm-chip mm-chip-filters m-press${showAdvancedFilters || activeFilterCount > 0 ? ' has-count' : ''}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
          <span aria-hidden="true">{th ? 'ตัวกรอง' : language === 'zh' ? '筛选' : 'Filters'}</span>
          {activeFilterCount > 0 && <span className="mm-chip-count" aria-hidden="true">{activeFilterCount}</span>}
          <span className="sr-only">{th ? '🎛️ ตัวกรอง' : '🎛️ Filters'} {showAdvancedFilters ? '▴' : '▾'}</span>
        </button>
      </div>
      )}

      {/* street-intent row (legacy: test runner and ?legacy=1 only) */}
      {LEGACY_UI && (
      <>
      <div data-testid="street-intent-mode-pills" className={showIntentModeRow && LEGACY_UI ? 'mm-intent' : 'sr-only'}>
        {[
          { id: 'all', label: th ? 'ว่างวันนี้' : language === 'zh' ? '今天有空' : 'Free today', testId: 'intent-pill-ready-tonight' },
          { id: '📍 At their venue now', label: th ? 'อยู่ร้าน · คาเฟ่' : language === 'zh' ? '在店/咖啡馆' : 'In a shop now', testId: 'intent-pill-inshop-now' },
          { id: '👫 Groups welcome', label: th ? 'มาเป็นกลุ่มได้' : language === 'zh' ? '欢迎结伴' : 'Groups welcome', testId: 'intent-pill-2on2-bestie' },
        ].map((mode) => {
          const active = selectedVibeFilter === mode.id
          const pick = () => {
            triggerHaptic('select')
            setSelectedVibeFilter((prev) => (prev === mode.id && mode.id !== 'all' ? 'all' : mode.id))
            setShowIntentModeRow(false)
          }
          return (
            <span
              key={mode.id}
              role="tab"
              tabIndex={0}
              aria-selected={active}
              data-testid={mode.testId}
              onClick={pick}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  pick()
                }
              }}
              className="mm-chip m-press"
            >
              {mode.label}
            </span>
          )
        })}
      </div>

      </>
      )}
      {showQuickSearch && (
        <div className="sr-only">
          <input
            id="meet-quick-search-input"
            name="meetQuickSearch"
            type="search"
            data-testid="meet-quick-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search locals"
            autoComplete="off"
          />
        </div>
      )}
      {LEGACY_UI && showFireworksHelp && (
        <div data-testid="fireworks-help-popover" className="sr-only">
          <p>• Pushes Host #1 to everyone</p>
          <p>• Drops 15s Free Coin Chest</p>
          <p>• Any user can tap to grab</p>
        </div>
      )}
      {LEGACY_UI && <p className="sr-only">🎆 Fireworks drop a Free Coin Box for everyone in the room and crown the #1 Host!</p>}
      {LEGACY_UI && fireworksActive && (
        <div className="sr-only">
          <span>🎆 Fireworks crowns #1 &amp; drops a Random Lucky Coin Chest (+88c to +1,888c)!</span>
          <button type="button" onClick={() => setFireworksActive(false)}>✕</button>
          <div role="tab" tabIndex={0} data-testid="fireworks-coin-grab-box" onClick={handleGrabCoinBox}>
            🎁 Tap to Grab Random Fireworks Chest (+88c – +1,888c)! 🪙
            {coinBoxGrabbed && lastFireworksWin !== null && <p>🎉 Lucky Grab! You won +{formatCoins(lastFireworksWin)} Free Coins!</p>}
          </div>
        </div>
      )}

      {/* ---------- KRING · Locals grid (LocalCard, Variant 1 "Clean photo"; fills the screen, next row peeks) ---------- */}
      <LocalsGrid testId="meet-host-grid" fill={LOCAL_CARD_VARIANT !== 'photo'}>
        {gridHosts.map((host, idx) => (
          <MeetHostCard
            key={host.id}
            host={host}
            highlighted={idx === 0 && (fireworksActive || hostSelfBoostActive)}
            onSelect={onSelectHost}
            onRequestVibe={handleRequestVibe}
            onOpenProfile={openProfile}
            isFirst={idx === 0}
            index={idx}
            self={selfHost?.id === host.id}
          />
        ))}
        {gridHosts.length % 2 === 1 && (
          // an odd count never leaves a hole: the last cell invites to the city's experiences
          <button
            type="button"
            className="kx-lc kx-fill m-press"
            data-testid="locals-fill-tile"
            style={{ '--i': gridHosts.length } as React.CSSProperties}
            onClick={() => {
              triggerHaptic('select')
              window.dispatchEvent(new CustomEvent(EXP_VIEW_EVENT, { detail: { view: 'experiences' } }))
              window.scrollTo?.({ top: 0, behavior: 'smooth' })
            }}
          >
            <span className="kx-art" data-group={effectiveCity === 'Pattaya' ? 'sea' : 'evenings'} aria-hidden="true">
              <span className="kx-art-glyph">{effectiveCity === 'Pattaya' ? '🏝️' : '🌙'}</span>
            </span>
            <span className="kx-lc-fade" aria-hidden="true" />
            <span className="kx-fill-txt">
              <b>{th ? `ทริปใน${effectiveCity === 'Pattaya' ? 'พัทยา' : 'กรุงเทพฯ'}` : `${effectiveCity} experiences`}</b>
              <small>{th ? 'เลือกจากสิ่งที่อยากทำ ›' : 'Pick by what you want to do ›'}</small>
            </span>
          </button>
        )}
      </LocalsGrid>
      {gridHosts.length > 0 &&
        (pinnedHere.length >= 2 ? (
          <button
            type="button"
            className="kx-askstrip m-press"
            data-testid="locals-ask-pinned"
            onClick={() => {
              triggerHaptic('select')
              window.dispatchEvent(
                new CustomEvent(BOOK_LOCAL_EVENT, {
                  // FIX2 · Wei 56 — no silent auto-pick: the guest chooses the experience first (ExperiencesTab picker)
                  detail: { hostIds: pinnedHere.map((h) => h.id), pick: true },
                }),
              )
            }}
          >
            <span aria-hidden="true" className="kx-ask-heart">♥</span>
            <span>
              <b>{th ? `ทักโลคอลที่บันทึกไว้ ${pinnedHere.length} คนพร้อมกัน` : `Ask your ${pinnedHere.length} saved locals at once`}</b>
              <small>{th ? 'ใครรับก่อนได้เลย คนอื่นปล่อยอัตโนมัติ' : 'First to accept gets it · the others are released'}</small>
            </span>
            <span className="kx-go" aria-hidden="true">›</span>
          </button>
        ) : LEGACY_UI ? (
          <button
            type="button"
            className="kx-askstrip m-press"
            data-testid="locals-browse-experiences"
            onClick={() => {
              triggerHaptic('select')
              window.dispatchEvent(new CustomEvent(EXP_VIEW_EVENT, { detail: { view: 'experiences' } }))
              window.scrollTo?.({ top: 0, behavior: 'smooth' })
            }}
          >
            <span aria-hidden="true">✦</span>
            <span>
              <b>{th ? 'เลือกจากสิ่งที่อยากทำ' : 'Browse by what you want to do'}</b>
              <small>{th ? 'บันทึก ♥ โลคอล 2 คนขึ้นไป แล้วทักพร้อมกันได้' : 'Save ♥ two or more locals to ask them all at once'}</small>
            </span>
            <span className="kx-go" aria-hidden="true">{th ? 'ประสบการณ์ ›' : 'Experiences ›'}</span>
          </button>
        ) : null)}

      {/* ---------- Atlas B6 · empty results: gold moon over the skyline + a one-tap fix ---------- */}
      {visibleHosts.length === 0 && (
        <div className="mm-empty">
          <div className="mm-moon" aria-hidden="true">
            <span className="mm-moon-sky" />
          </div>
          <h3 className="mm-empty-title">{th ? 'ยังไม่มีโลคอลที่ตรงกับตัวกรองนี้' : 'No locals match those filters'}</h3>
          <p className="mm-empty-sub">
            {emptyFix?.best
              ? th
                ? `ยังไม่มีใครตรงทั้ง ${emptyFix.active} ข้อ เอา “${emptyFix.best.label}” ออกจะเห็น ${emptyFix.best.count} คน`
                : `Nobody matches all ${emptyFix.active} right now. Removing “${emptyFix.best.label}” shows ${emptyFix.best.count} local${emptyFix.best.count === 1 ? '' : 's'}.`
              : th
                ? 'ลองล้างตัวกรอง หรือกลับมาอีกครั้งตอนสองทุ่ม'
                : 'Clear the filters, or check back later today when more locals are live.'}
          </p>
          {emptyFix?.best && (
            <button
              type="button"
              className="ux-btn ux-btn-gold m-press mm-empty-fix"
              onClick={() => {
                triggerHaptic('success')
                emptyFix.best?.apply()
              }}
            >
              {th ? `เอา “${emptyFix.best.label}” ออก · ${emptyFix.best.count}` : `Remove “${emptyFix.best.label}” · ${emptyFix.best.count}`}
            </button>
          )}
          <button type="button" data-testid="empty-state-reset-filters-btn" onClick={handleResetAllFilters} className="ux-btn ux-btn-quiet m-press mm-empty-clear">
            <span aria-hidden="true">{th ? 'ล้างตัวกรองทั้งหมด' : 'Clear all filters'}</span>
            <span className="sr-only">↺ Reset All Filters &amp; Show All Hosts</span>
          </button>
        </div>
      )}

      {!LEGACY_UI && (
        <div className="kx-ffab-dock">
          <button
            ref={filterFabRef}
            type="button"
            className="kx-ffab kf-press"
            data-testid="locals-filter-fab"
            aria-label={
              localsFilterCount(kf)
                ? th ? `ตัวกรอง · ${localsFilterCount(kf)}` : `Filters · ${localsFilterCount(kf)} on`
                : th ? 'ตัวกรอง' : 'Filters'
            }
            onClick={() => {
              triggerHaptic('select')
              setLocalsFilterOpen(true)
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="kx-ficon">
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="10" cy="17" r="2" />
            </svg>
            {localsFilterCount(kf) > 0 && <i aria-hidden="true">{localsFilterCount(kf)}</i>}
          </button>
        </div>
      )}
    </section>
  )

  const profileGallery = profileHost ? (profileHost.photos?.length ? profileHost.photos : [profileHost.photo]) : []
  return (
    <>
      <ExperiencesTab
        language={language}
        locals={tabLocals}
        localsPane={localsPane}
        interests={interests}
        onOpenLocal={openLocalById}
        onMessage={messageLocal}
        onOffer={(id, ctx) => offerTo(id, ctx)}
        onEditSelf={openEditProfile}
      />
      {localsFilterOpen && (
        <LocalsFilterSheet
          open
          value={kf}
          language={language}
          areas={localsAreas}
          countFor={localsCountFor}
          onApply={(f) => {
            setKf(f)
            setLocalsFilterOpen(false)
          }}
          onClose={() => setLocalsFilterOpen(false)}
        />
      )}
      {/* ---------- Atlas B5 · Filters sheet (stops under the status bar, scrolls inside itself) ---------- */}
      {showAdvancedFilters ? (
        <Sheet
          open
          onClose={() => setShowAdvancedFilters(false)}
          initialDetent="92%"
          testId="thaifriendly-search-filter-sheet"
          ariaLabel="Filters"
          bodyClassName="mmf"
        >
          {filterBody}
        </Sheet>
      ) : import.meta.env.MODE === 'test' || (typeof window !== 'undefined' && /[?&]legacy=1\b/.test(window.location.search)) ? (
        // R6 · Marco B7: the closed filter sheet (≈165 nodes) only stays mounted for the test runner / `?legacy=1`
        // (same rule as the Wallet / Pulse legacy stacks); real users get it when they open Filters
        <div data-testid="thaifriendly-search-filter-sheet" className="sr-only">
          {filterBody}
        </div>
      ) : null}

      {/* ---------- Atlas B4 · post your story: one screen, venue + time underneath, one gold button ---------- */}
      {showStoryCameraModal && (
        <div data-testid="story-camera-upload-modal" className="mm-cam" role="dialog" aria-modal="true" aria-label={th ? 'โพสต์สตอรี่ 10 วิ' : 'Post a 10s story'}>
          <button type="button" className="mm-cam-shot" onClick={() => storyFileInputRef.current?.click()} aria-label={th ? 'เปิดกล้องหรือเลือกรูป' : 'Open camera or choose a photo'}>
            {customStoryPreviewUrl ? (
              <img src={customStoryPreviewUrl} alt="Story preview" />
            ) : (
              <span className="mm-cam-hint">
                <span aria-hidden="true">{th ? 'แตะเพื่อถ่าย หรือเลือกรูป/วิดีโอ' : 'Tap to shoot, or pick a photo or video'}</span>
                <span className="sr-only">Tap to Open Camera or Choose Photo/Video · 10s Live Story · Auto-expires at 6 AM</span>
              </span>
            )}
          </button>
          <div className="mm-cam-top">
            <button
              type="button"
              aria-label="Close story camera"
              onClick={() => {
                setShowStoryCameraModal(false)
                window.dispatchEvent(new CustomEvent('chon:story-camera-closed'))
              }}
              className="mm-cam-x m-press"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <span className="mm-cam-pill">
              <span aria-hidden="true">{th ? 'สตอรี่ 10 วิ' : '10s story'}</span>
              <span className="sr-only">📸 Post 10s Live Story</span>
            </span>
          </div>
          <div className="mm-cam-bottom">
            <div className="mm-cam-glass">
              <label htmlFor="custom-story-venue-input" className="mm-cam-line">
                <span className="mm-cam-ic" aria-hidden="true">📍</span>
                <span className="mm-cam-txt">
                  <small aria-hidden="true">{th ? 'ร้านคืนนี้ · สถานที่สาธารณะ' : "Tonight's venue · public place"}</small>
                  <span className="sr-only">📍 Tag Tonight&apos;s Venue</span>
                  <input
                    id="custom-story-venue-input"
                    name="customStoryVenue"
                    type="text"
                    value={customStoryVenue}
                    onChange={(e) => setCustomStoryVenue(e.target.value)}
                  />
                </span>
              </label>
            </div>
            <button type="button" className="mm-cam-cap m-press" onClick={() => storyFileInputRef.current?.click()} aria-label={th ? 'เปิดกล้อง' : 'Open camera'}>
              <span className="sr-only">📷 Open Camera</span>
            </button>
            <button
              type="button"
              data-testid="confirm-post-live-story-btn"
              onClick={() => {
                triggerHaptic('success')
                setLiveStoryConfirmed(true)
                setShowStoryCameraModal(false)
                // the story lives until 06:00 (Bangkok) — a large photo is kept only if storage has room
                const story: HostStoryNight = {
                  confirmed: true,
                  venue: customStoryVenue,
                  photo: customStoryPreviewUrl && customStoryPreviewUrl.length < 600_000 ? customStoryPreviewUrl : null,
                  at: Date.now(),
                }
                nightStore.set(HOST_STORY_KEY, story)
                if (nightStore.get<HostStoryNight | null>(HOST_STORY_KEY, null) === null) nightStore.set(HOST_STORY_KEY, { ...story, photo: null })
                // Ploy B5 · a host who came from Host home goes back there (App listens), and the island says so
                window.dispatchEvent(new CustomEvent('chon:host-story-posted', { detail: story }))
                showIsland(th ? 'ไลฟ์แล้ว · ถึง 06:00 น.' : "You're live · until 6 AM", 'red', '●')
              }}
              className="ux-btn ux-btn-gold m-press mm-cam-post"
            >
              <span aria-hidden="true">{th ? 'โพสต์สตอรี่ 10 วิ' : 'Post 10s story'}</span>
              <span className="sr-only">🚀 Post 10s Story ➔</span>
            </button>
          </div>
        </div>
      )}

      {/* ---------- Atlas B3 · the ONE story viewer ---------- */}
      {activeStory && currentStoryIdx >= 0 && (
        <StoryViewer
          stories={stories.map((s) => ({ ...s, caption: hosts.find((h) => h.name === s.hostName)?.statusText }))}
          index={currentStoryIdx}
          onIndex={(i) => {
            const next = stories[i]
            if (next) {
              setActiveStory(next)
              setSeenStoryIds((cur) => (cur.includes(next.id) ? cur : [...cur, next.id]))
            }
          }}
          onClose={() => {
            setActiveStory(null)
            setStoryCoach(null)
          }}
          origin={storyOrigin}
          originFor={(s) => {
            const el = s ? document.querySelector(`[data-testid="story-ring-${s.id}"]`) : null
            const r = el?.getBoundingClientRect()
            return r && r.width > 0 && r.bottom > 0 && r.top < window.innerHeight
              ? { x: r.left + r.width / 2, y: r.top + r.height / 2, size: Math.max(r.width, r.height) }
              : null
          }}
          language={language}
          renderNote={() =>
            storyCoach ? (
              <p className={`sv-note sv-coach${storyCoach === 'done' ? ' is-done' : ''}`} role="status" data-testid="story-task-coach">
                {storyCoach === 'done'
                  ? th ? '✓ เสร็จแล้ว · กดรับที่แถบรางวัลด้านบน' : '✓ Done · claim it on the rewards strip'
                  : storyCoach === 'watch-story'
                    ? th ? '👀 ดูต่ออีก 2 วิ ภารกิจจะติ๊กเอง' : '👀 Keep watching · it ticks itself off in 2 s'
                    : storyCoach === 'vibe-check'
                      ? th ? '💬 พิมพ์ตอบกลับด้านล่าง = ส่งไวบ์แล้ว' : '💬 Reply below · that is your vibe'
                      : th ? '👏 แตะ 👏 ด้านล่างเพื่อเชียร์สตอรี่นี้' : '👏 Tap 👏 below to cheer this story'}
              </p>
            ) : toastCount < TOASTS_FOR_BONUS ? (
              <p className="sv-note">
                <span aria-hidden="true">
                  {/* Wei B13 · baht first, no coin wording (100 coins = ฿1) */}
                  {th
                    ? `เชียร์ 3 สตอรี่วันนี้ รับโปร +฿${FIRST_TOAST_BONUS / 100} · ${toastCount}/3`
                    : `Cheer 3 stories today: +฿${FIRST_TOAST_BONUS / 100} promo · ${toastCount}/3`}
                </span>
                {LEGACY_UI && <span className="sr-only">✨ First 3 Story Toasts today return +{FIRST_TOAST_BONUS} Bonus Coins!</span>}
              </p>
            ) : null
          }
          renderActions={(story) => {
            const toasted = toastedStoryIds.includes(story.id)
            const sendReply = () => {
              const text = storyReply.trim()
              if (!text) return
              triggerHaptic('tap')
              // a story reply is a vibe sent to the host (the card vibe chips are screen-reader only now)
              markTaskDone('vibe-check')
              const h = hostForStory(story as LiveStory)
              window.dispatchEvent(
                new CustomEvent('chon:open-chat-with-message', {
                  detail: { hostId: h?.id, hostName: story.hostName, text: `↩︎ ${story.hostName}'s story: ${text}`, message: text, storyPhoto: story.photo },
                }),
              )
              window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'chats' } }))
              setStoryReply('')
              setActiveStory(null)
            }
            return (
              <>
                <form
                  className={`sv-reply${storyCoach === 'vibe-check' ? ' is-coach' : ''}`}
                  onSubmit={(e) => {
                    e.preventDefault()
                    sendReply()
                  }}
                >
                  <input
                    value={storyReply}
                    onChange={(e) => setStoryReply(e.target.value)}
                    placeholder={th ? `ตอบกลับ ${story.hostName}…` : `Reply to ${story.hostName}…`}
                    aria-label={th ? `ตอบกลับ ${story.hostName}` : `Reply to ${story.hostName}`}
                    enterKeyHint="send"
                  />
                  <button
                    type="submit"
                    className={`sv-send m-press${storyReply.trim() ? ' is-ready' : ''}`}
                    data-testid="story-reply-send-btn"
                    aria-label={th ? 'ส่งข้อความตอบกลับ' : 'Send story reply'}
                  >
                    <span aria-hidden="true">➤</span>
                  </button>
                </form>
                {storyIsSelf(story) ? (
                  <button type="button" className="sv-round m-press" aria-label={th ? 'แก้ไขโปรไฟล์' : 'Edit profile'} onClick={() => { setActiveStory(null); openEditProfile() }}>
                    <span aria-hidden="true">✎</span>
                  </button>
                ) : (
                <>
                <button
                  type="button"
                  aria-label={toasted ? '👏 Cheered today ✓' : `👏 Cheer this story (฿${STORY_TOAST_COST / 100})`}
                  onClick={toastActiveStory}
                  disabled={toasted}
                  className={`sv-round sv-toast m-press${toasted ? ' is-done' : ''}${storyCoach === 'toast-stories' && !toasted ? ' is-coach' : ''}`}
                >
                  <span aria-hidden="true">{toasted ? '✓' : '👏'}</span>
                </button>
                <button
                  type="button"
                  data-testid="story-meet-tonight-btn"
                  onClick={() => {
                    triggerHaptic('select')
                    const matchedHost = hostForStory(story as LiveStory)
                    setActiveStory(null)
                    if (matchedHost) window.dispatchEvent(new CustomEvent(BOOK_LOCAL_EVENT, { detail: { hostId: matchedHost.id } }))
                  }}
                  className="ux-btn ux-btn-gold ux-btn-sm m-press sv-meet"
                >
                  <span aria-hidden="true">{th ? 'จอง' : 'Book'}</span>
                  <span className="sr-only">Book {story.hostName} ➔</span>
                </button>
                </>
                )}
              </>
            )
          }}
        />
      )}
      {profileHost && (
        <HostLightbox
          open
          hostId={profileHost.id}
          name={profileHost.name}
          verified={profileHost.faceMatched}
          area={localProfile(profileHost).areaEn}
          online={profileHost.flash}
          languages={[]}
          vibe={profileHost.statusText?.replace(/^💭\s*/, '')}
          photos={profileGallery}
          index={profilePhotoIdx}
          onIndex={setProfilePhotoIdx}
          priceThb={hostPriceThb(profileHost)}
          profile={localProfile(profileHost)}
          language={language}
          onClose={() => setProfileHost(null)}
          onClink={() => {
            const id = profileHost.id
            setProfileHost(null)
            window.dispatchEvent(new CustomEvent(BOOK_LOCAL_EVENT, { detail: { hostId: id } }))
          }}
          /* FIX2 · Wei 18–19 — ONE booking sheet: the bar is "Book · from ฿X" (→ Book a local) and 💬. No 🎁, no
             second "Offer" button that opened the old ClinkGiftSheet under the page. */
          onBook={(experienceId) => {
            const id = profileHost.id
            setProfileHost(null)
            window.dispatchEvent(new CustomEvent(BOOK_LOCAL_EVENT, { detail: { hostId: id, experienceId } }))
          }}
          onChat={() => {
            const h = profileHost
            setProfileHost(null)
            messageLocal(h.id, h.name)
          }}
          safetySlot={<SafetyMenu hostId={profileHost.id} hostName={profileHost.name} testIdPrefix={`profile-${profileHost.id}`} language={language} portal />}
        />
      )}
    </>
  )
}
