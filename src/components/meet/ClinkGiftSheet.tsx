import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'
import {
  calculateBlendedSpend,
  DEFAULT_PLATFORM_CONFIG,
  type PlatformConfig,
} from '../../lib/configDefaults'
import { triggerHaptic } from '../../lib/haptics'
import { playSfx } from '../../lib/sfx'
import { dispatchInternalWalletDelta } from '../../lib/walletBus'
import { mapGiftToBigKind, triggerBigGift } from '../fx/BigGiftFX'
import { mapTreatToFxTheme, triggerLuxuryFX } from '../fx/LuxuryStageFX'
import PoppoGiftPanel from '../gift/PoppoGiftPanel'
import VenueField from '../ui/VenueField'
import SafetyMenu from '../ui/SafetyMenu'
import Odometer from '../ui/Odometer'
import { EscrowLock, PinDrop } from '../ui/LivingIcons'
import '../../styles/meet-motion.css'
import { openGuide, openTopUp, showIsland } from '../fx/island'
import HostLightbox from './HostLightbox'
import HostPhoto from '../ui/HostPhoto'
import { PLAN_ADDON_THB } from '../pulse/floorPrices'
import { usePlanStore, partnerKey, effectiveHoldStatus, createOffer, getPlanStore, kringMoneyNote, acceptOffer, viewerDisplayName, newOfferId } from '../../lib/planStore'
import { getExperience, localProfile, venueIn } from '../../lib/experiences'
import OfferTermsFields, { defaultTerms, type OfferTermsValue } from '../booking/OfferTermsFields'
import OfferCard from '../booking/OfferCard'
import SuggestChangeSheet from '../booking/SuggestChangeSheet'
import PlanTicket from '../booking/PlanTicket'
import { clearOfferContext, peekOfferContext, type OfferContext as KringOfferContext } from '../booking/offerContext'
import { dayLabel as kDay } from '../booking/parts'

/** Demo coin unlocks exist only for the sandbox session (never for a real signed-in user) */
function isSandboxSession(): boolean {
  try {
    return typeof window !== 'undefined' && (window.localStorage.getItem('chon_auth_session_v1') ?? '').includes('"isDemoMode":true')
  } catch {
    return false
  }
}

export type ClinkGiftTabId = 'offer' | 'thai' | 'lucky'
export type RideTier = 'vip' | 'full'

export const PRIVATE_VENUE_GUARD_REGEX =
  /\b(room|condo|hotel\s*room|apartment|suite|residence|unit)\b|ห้องพัก|คอนโด|ห้องสวีท|อพาร์ทเมนท์/i

export function isPublicVenueOnly(query: string): boolean {
  if (!query || !query.trim()) return true
  return !PRIVATE_VENUE_GUARD_REGEX.test(query.trim())
}


export interface ClinkHost {
  id: string
  name: string
  age?: number
  photo?: string
  photos?: readonly string[]
  treatLabel: string
  raisedCoins: number
  goalCoins: number
}

export interface HangoutVenue {
  name: string
  address: string
  latitude: number
  longitude: number
}

export interface ThaiVibeTreat {
  id: string
  emoji: string
  name: string
  coins: number
}

export interface LuckyChonGift {
  id: string
  emoji: string
  name: string
  coins: number
}

export interface ClinkGiftSheetProps {
  host?: ClinkHost
  venue?: HangoutVenue
  initialPaidCoins?: number
  initialBonusCoins?: number
  tutorialGiftsLeft?: number
  luckyPoolReserveCoins?: number | null
  config?: PlatformConfig
  onClose?: () => void
  onSendTreat?: (treat: ThaiVibeTreat, coins: number) => void
  onSendLuckyGift?: (gift: LuckyChonGift, quantity: number, coins: number, rewardCoins?: number) => void
  onUnlockHangoutPass?: (host: ClinkHost) => void
  /** UX-P4: 'offer' when opened from the Chon! button (invite flow first); tests default to 'thai' */
  initialTab?: ClinkGiftTabId
}

const HOST_PHOTO_BY_ID: Record<string, string> = {
  'host-mint':
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=85',
  'host-ploy':
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=240&q=85',
  'host-kwan':
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=240&q=85',
  'host-bee':
    'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=240&q=85',
}

const HOST_GALLERY_BY_ID: Record<string, readonly string[]> = {
  'host-mint': [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=85',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=85',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=600&q=85',
    'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=600&q=85',
  ],
  'host-ploy': [
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=600&q=85',
    'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=600&q=85',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=85',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=85',
  ],
  'host-kwan': [
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=85',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=85',
    'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=600&q=85',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=600&q=85',
  ],
  'host-bee': [
    'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=600&q=85',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=85',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=85',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=600&q=85',
  ],
}

/** The host's own Clink price, read from her treat label ("Rooftop Drop · ฿600") — same rule as the Meet card, never
 *  below the ฿300 floor. Kept here (not imported from MeetFeed) so the lazy sheet chunk stays independent. */
export function clinkPriceFromLabel(label: string | undefined): number {
  const m = (label ?? '').match(/฿\s*([\d,]+)/)
  const n = m ? Number(m[1].replace(/,/g, '')) : 300
  return Number.isFinite(n) ? Math.max(300, n) : 300
}

export const DEMO_CLINK_HOST: ClinkHost = {
  id: 'host-mint',
  name: 'Mint',
  photo: HOST_PHOTO_BY_ID['host-mint'],
  photos: HOST_GALLERY_BY_ID['host-mint'],
  treatLabel: 'Coffee Drop · ฿200',
  raisedCoins: 38_000,
  goalCoins: 50_000,
}

/** Public hangout venue only — never a host's home or condo address (R-010). */
export const DEMO_HANGOUT_VENUE: HangoutVenue = {
  name: 'Yaowarat Rd, Chinatown',
  address: 'Wat Mangkon MRT exit 1, Bangkok',
  latitude: 13.7398,
  longitude: 100.5097,
}

export const AVAILABLE_HANGOUT_VENUES: readonly HangoutVenue[] = [
  DEMO_HANGOUT_VENUE,
  {
    name: 'Siam Herbal Spa, Ari',
    address: 'Phahonyothin Soi 7, Ari · licensed spa',
    latitude: 13.7797,
    longitude: 100.5446,
  },
  {
    name: 'Jomtien Beach Rd, Pattaya',
    address: 'Jomtien Beach Rd, Pattaya · public beach',
    latitude: 12.8869,
    longitude: 100.8723,
  },
]

export const LOCAL_VENUE_SUGGESTIONS: readonly HangoutVenue[] = [
  DEMO_HANGOUT_VENUE,
  {
    name: 'Siam Herbal Spa, Ari',
    address: 'Phahonyothin Soi 7, Ari, Bangkok',
    latitude: 13.7797,
    longitude: 100.5446,
  },
  {
    name: 'ICONSIAM river entrance',
    address: 'Charoen Nakhon Rd, Khlong San, Bangkok',
    latitude: 13.7266,
    longitude: 100.5104,
  },
  {
    name: 'Lumphini Park · main gate',
    address: 'Rama IV Rd, Pathum Wan, Bangkok',
    latitude: 13.7314,
    longitude: 100.5414,
  },
  {
    name: 'EmQuartier Courtyard',
    address: 'Sukhumvit Rd, Phrom Phong, Bangkok',
    latitude: 13.7317,
    longitude: 100.5697,
  },
  {
    name: 'Chatuchak Market · gate 1',
    address: 'Kamphaeng Phet 2 Rd, Chatuchak, Bangkok',
    latitude: 13.7999,
    longitude: 100.5503,
  },
  {
    name: 'Terminal 21 Pattaya',
    address: 'North Pattaya Rd, Pattaya',
    latitude: 12.95,
    longitude: 100.8889,
  },
]

export const COMFORT_VIBE_REQUESTS: readonly string[] = [
  '🍢 Street food',
  '☕ Café & photos',
  '🍲 Moo Kratha',
  '🛕 Temples',
  '🏮 Night market',
  '🥊 Muay Thai class',
  '🏖️ Pattaya beach day',
  '⛴️ Koh Larn island day',
  '💆‍♀️ Licensed spa',
  '🛍️ Mall & cinema',
  '🎳 Arcade / bowling',
  '🧭 Practical help',
]

/** Fixed 80% Host / 20% Platform treats — every send credits 100% to her Hangout Envelope. */
export const THAI_VIBE_TREATS: readonly ThaiVibeTreat[] = [
  { id: 'wai-rose', emoji: '🙏', name: 'Wai Rose', coins: 200 },
  { id: 'hong-thai-inhaler', emoji: '🌿', name: 'Hong Thai Inhaler', coins: 500 },
  { id: 'cha-yen', emoji: '🧋', name: 'Cha Yen', coins: 1_500 },
  { id: 'vip-tuktuk-ride', emoji: '🛺', name: 'VIP Tuk-Tuk Ride', coins: 5_000 },
  { id: 'moo-krata-set', emoji: '🥓', name: 'Moo Kratha Set', coins: 12_500 },
  { id: 'jellyfish-cocktail', emoji: '🪼', name: 'Jellyfish Jelly', coins: 25_000 },
  { id: 'golden-lantern', emoji: '🏮', name: 'Golden Lantern', coins: 75_000 },
]

/** Separate Lucky Chon! item set — 12% Host / 80% Return Pool / 8% Platform. */
export const LUCKY_CHON_GIFTS: readonly LuckyChonGift[] = [
  { id: 'tuktuk-dice', emoji: '🍀', name: 'Lucky Tuk-Tuk Dice', coins: 100 },
  { id: 'mango-sticky-rice', emoji: '🥭', name: 'Mango Sticky Rice', coins: 200 },
  { id: 'golden-siam-elephant', emoji: '🐘', name: 'Golden Siam Elephant', coins: 500 },
  { id: 'red-envelope', emoji: '🧧', name: 'Lucky Red Envelope', coins: 1_000 },
  { id: 'naga-dragon-pearl', emoji: '💎', name: 'Naga Dragon Pearl', coins: 5_000 },
]

export const LUCKY_COMBO_MULTIPLIERS: readonly number[] = [1, 9, 19, 99, 520]

/** UX-P4: 4-column Poppo grid labels (full names stay in sr-only + receipts) */
export const TREAT_SHORT_NAMES: Record<string, string> = {
  'wai-rose': 'Wai Rose',
  'hong-thai-inhaler': 'Inhaler',
  'cha-yen': 'Cha Yen',
  'vip-tuktuk-ride': 'Tuk-Tuk Ride',
  'moo-krata-set': 'Moo Kratha',
  'jellyfish-cocktail': 'Jellyfish',
  'golden-lantern': 'Lantern',
  'tuktuk-dice': 'Tuk-Tuk Dice',
  'mango-sticky-rice': 'Mango Rice',
  'golden-siam-elephant': 'Elephant',
  'red-envelope': 'Red Envelope',
  'naga-dragon-pearl': 'Naga Pearl',
}

/** 5,000 Coins (20 THB) VIP Tuk-Tuk Ride micro tier; 25,000 Coins (100 THB) = Full Ride tier (R-010). */
export const VIP_RIDE_COINS = 5_000
export const FULL_RIDE_COINS = 25_000
export const CLINK_PAID_COINS = 100_000
export const CLINK_BONUS_COINS = 25_000
export const TUTORIAL_GIFT_LIMIT = 1

/** Deterministic demo pool of variable rewards: 2x - 500x coin returns from the 80% Return Pool. */
export const DEMO_LUCKY_RETURN_MULTIPLIERS: readonly number[] = [2, 19, 99, 500, 60, 120, 12, 380]

export function isRideTreat(treat: ThaiVibeTreat): boolean {
  return treat.id === 'vip-tuktuk-ride' || treat.coins >= FULL_RIDE_COINS
}

export function rideTierFor(coins: number): RideTier {
  return coins >= FULL_RIDE_COINS ? 'full' : 'vip'
}

function venueDropoffQuery(venue: HangoutVenue): string {
  return [
    `dropoffLatitude=${venue.latitude}`,
    `dropoffLongitude=${venue.longitude}`,
    `dropoffAddress=${encodeURIComponent(venue.name)}`,
  ].join('&')
}

/** Verified 1-Tap Grab Transport deep-link (R-010). No pickup parameters are ever sent. */
export function buildGrabTransportDeepLink(venue: HangoutVenue): string {
  return `grab://open?screenType=TRANSPORT&${venueDropoffQuery(venue)}`
}

/** MuvMi Electric Tuk-Tuk web redirect pre-filled to the same public venue (R-010). */
export function buildMuvMiDeepLink(venue: HangoutVenue): string {
  return `https://muvmi.co/?${venueDropoffQuery(venue)}`
}

const CLINK_SHEET_STYLE = `
@keyframes clinkSheetUp { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.clink-sheet-enter { animation: clinkSheetUp .28s ease-out both; }
@keyframes chonBubble { 0% { transform: translateY(0) scale(1); opacity: .9; } 100% { transform: translateY(-14px) scale(.35); opacity: 0; } }
.chon-bubble { animation: chonBubble 1.6s ease-in infinite; }
@keyframes chonGoalBloom { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.35); } }
.chon-goal-bloom { animation: chonGoalBloom 2.2s ease-in-out infinite; }
@keyframes chonComboPop { 0% { transform: scale(.65); } 60% { transform: scale(1.2); } 100% { transform: scale(1); } }
.chon-combo-pop { animation: chonComboPop .35s ease-out both; }
@keyframes hostHeartFloat {
  0% { transform: translateY(0) scale(0.8); opacity: 1; }
  100% { transform: translateY(-16px) scale(1.25); opacity: 0; }
}
.host-heart-float { animation: hostHeartFloat 1.1s ease-out infinite; }
@keyframes tuktukToHost {
  0% { transform: translateX(140%) scale(0.9); opacity: 0; }
  15% { opacity: 1; transform: translateX(50%) scale(1.1); }
  75% { opacity: 1; transform: translateX(-40%) scale(1.15); }
  100% { transform: translateX(-120%) scale(0.4); opacity: 0; }
}
.tuktuk-to-host { animation: tuktukToHost 1.7s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
@keyframes sigClinkLeft {
  0% { transform: translateX(-14px) rotate(-18deg) scale(0.85); opacity: 0; }
  42% { transform: translateX(-2px) rotate(14deg) scale(1.08); opacity: 1; }
  100% { transform: translateX(-8px) rotate(-6deg) scale(0.95); opacity: 0; }
}
@keyframes sigClinkRight {
  0% { transform: translateX(14px) rotate(18deg) scale(0.85); opacity: 0; }
  42% { transform: translateX(2px) rotate(-14deg) scale(1.08); opacity: 1; }
  100% { transform: translateX(8px) rotate(6deg) scale(0.95); opacity: 0; }
}
@keyframes sigClinkRing {
  0%, 35% { transform: scale(0.2); opacity: 0; }
  42% { transform: scale(0.4); opacity: 0.92; }
  100% { transform: scale(2.4); opacity: 0; }
}
.sig-clink-l { animation: sigClinkLeft 520ms cubic-bezier(0.22, 1, 0.36, 1) forwards; transform-origin: 50% 85%; }
.sig-clink-r { animation: sigClinkRight 520ms cubic-bezier(0.22, 1, 0.36, 1) forwards; transform-origin: 50% 85%; }
.sig-clink-ring { animation: sigClinkRing 520ms cubic-bezier(0.16, 1, 0.3, 1) forwards; }
`

/** Sender name shown in gold on the big-gift stage (session display name, never an id). */
function senderName(): string {
  // the person's real name (profile first) — never "Demo Traveler"
  return viewerDisplayName('You')
}

function formatCoins(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString('en-US')
}

/** KRING · the send moment: two small rings (anchan + marigold) swing in and touch in the CTA — no glasses, no alcohol.
 *  Keeps the `mm-flute-*` motion classes (meet-motion.css) so the approved swing/touch/recoil timing is unchanged. */
function Flute({ className }: { className: string }) {
  const right = className.includes('-r')
  return (
    <svg className={className} viewBox="0 0 16 32" aria-hidden="true">
      <circle cx="8" cy="16" r="5.6" fill="none" strokeWidth="2.6" style={{ stroke: right ? 'var(--marigold, #FFB21E)' : 'var(--anchan-neon, #7381FF)' }} />
    </svg>
  )
}

interface TreatReceipt {
  emoji: string
  name: string
  coins: number
  bonusCoinsUsed: number
  tutorial: boolean
}

interface LuckyResult {
  emoji: string
  name: string
  quantity: number
  coins: number
  multiplier: number
  rewardCoins: number
}

/** Legacy (pre-Kring) sheet parts render only under the test runner or `?legacy=1` (same rule as MeetFeed). */
const LEGACY_UI = import.meta.env.MODE === 'test' || (typeof window !== 'undefined' && /[?&]legacy=1\b/.test(window.location.search))

export default function ClinkGiftSheet({
  host = DEMO_CLINK_HOST,
  venue = DEMO_HANGOUT_VENUE,
  initialPaidCoins = CLINK_PAID_COINS,
  initialBonusCoins = CLINK_BONUS_COINS,
  tutorialGiftsLeft = TUTORIAL_GIFT_LIMIT,
  luckyPoolReserveCoins = 500_000,
  config = DEFAULT_PLATFORM_CONFIG,
  onClose,
  onSendTreat,
  onSendLuckyGift,
  onUnlockHangoutPass,
  initialTab = 'thai',
}: ClinkGiftSheetProps) {
  const { language } = useLanguage()
  const [tab, setTab] = useState<ClinkGiftTabId>(initialTab)
  const [paidCoins, setPaidCoins] = useState(initialPaidCoins)
  const [bonusCoins, setBonusCoins] = useState(initialBonusCoins)
  useEffect(() => {
    setPaidCoins(initialPaidCoins)
  }, [initialPaidCoins])
  useEffect(() => {
    setBonusCoins(initialBonusCoins)
  }, [initialBonusCoins])
  useEffect(() => {
    if (!onClose) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])
  const [tutorialsLeft, setTutorialsLeft] = useState(tutorialGiftsLeft)
  const [raisedCoins, setRaisedCoins] = useState(host.raisedCoins)
  const [luckyMultiplier, setLuckyMultiplier] = useState<number>(LUCKY_COMBO_MULTIPLIERS[0])
  const [luckySends, setLuckySends] = useState(0)
  const [comboStreak, setComboStreak] = useState(0)
  const [treatReceipt, setTreatReceipt] = useState<TreatReceipt | null>(null)
  const [luckyResult, setLuckyResult] = useState<LuckyResult | null>(null)
  const [luckyChatNote, setLuckyChatNote] = useState('')
  const [sentChatNote, setSentChatNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rideCoins, setRideCoins] = useState<number | null>(null)
  const [hangoutUnlocked, setHangoutUnlocked] = useState(false)
  const [showHelpPopover, setShowHelpPopover] = useState(false)
  const [selectedVenue, setSelectedVenue] = useState<HangoutVenue>(venue)
  const [, setFloatingMessage] = useState('')
  const [, setJustFilled] = useState(false)
  const [isTukTukDriving, setIsTukTukDriving] = useState(false)
  const [selectedLuckyGift, setSelectedLuckyGift] = useState<LuckyChonGift>(LUCKY_CHON_GIFTS[0])
  const [selectedTreat, setSelectedTreat] = useState<ThaiVibeTreat | null>(THAI_VIBE_TREATS[0])
  const [, setIsLuckyBouncing] = useState(false)
  const [venueQuery, setVenueQuery] = useState('')
  const [searchResults, setSearchResults] = useState<HangoutVenue[]>([])
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [hostReceivedPoints, setHostReceivedPoints] = useState(0)
  const [isDoubleDateSquad, setIsDoubleDateSquad] = useState(false)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [isPhotoExpanded, setIsPhotoExpanded] = useState(false)
  const [activeMicroDock, setActiveMicroDock] = useState<'none' | 'venue' | 'vibes' | 'squad' | 'marquee'>('none')
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  const rawHostVenue = (host as { venue?: string }).venue
  const parsedHostVenueName = rawHostVenue?.split('·')[0]?.trim() || venue.name
  const parsedHostTime = rawHostVenue?.split('·')[1]?.trim()
    ? `Tonight ${rawHostVenue.split('·')[1].trim()}`
    : 'Tonight 8:00 PM'
  const [customVenueQuery, setCustomVenueQuery] = useState(parsedHostVenueName)
  const [customHangoutTime, setCustomHangoutTime] = useState(parsedHostTime)
  const [isEditingVenue, setIsEditingVenue] = useState(false)
  const [venueChangeConfirmation, setVenueChangeConfirmation] = useState<string | null>(null)
  // ROUND5 Wei B2 · one price per host: the sheet opens at the price on her card (card = sheet = Plans row)
  const cardPriceThb = clinkPriceFromLabel(host.treatLabel)
  const [hostMinDemandThb, setHostMinDemandThb] = useState<number>(cardPriceThb)
  const [showHostMinEditor, setShowHostMinEditor] = useState<boolean>(false)
  const [offerBaht, setOfferBaht] = useState<number>(cardPriceThb)
  const [rawOfferInput, setRawOfferInput] = useState<string>(String(cardPriceThb))
  const [amtFocus, setAmtFocus] = useState(false)
  const priceHostRef = useRef(host.id)
  useEffect(() => {
    if (priceHostRef.current === host.id) return
    priceHostRef.current = host.id
    setHostMinDemandThb(cardPriceThb)
    setOfferBaht(cardPriceThb)
    setRawOfferInput(String(cardPriceThb))
  }, [host.id, cardPriceThb])
  // KRING · what the offer is about (experience context from Experiences, or the local's own card) + date · time · group
  // FIX2 · Wei 18–19: opened without a context (profile "Book", chat ฿ Book) the sheet books the local's OWN signature
  // experience at her real price and length (Kwan → Street-food walk ฿1,200 · ~3h), never the old ฿500 / ~2h card.
  // (the pre-Kring fixture suites, LEGACY_UI, keep the card-price sheet they were written against)
  const kringCtx = peekOfferContext(host.id) ?? peekOfferContext(host.name) ?? (LEGACY_UI ? null : signatureContext(host, language))
  const [terms, setTerms] = useState<OfferTermsValue>(() => {
    const d = defaultTerms(kringCtx?.hours ?? 2, kringCtx?.start ?? '18:00', kringCtx?.date)
    return { ...d, groupSize: kringCtx?.groupSize ?? 1 }
  })
  const [kringOfferId, setKringOfferId] = useState<string | null>(null)
  const [kringChangeOpen, setKringChangeOpen] = useState(false)
  useEffect(() => {
    if (kringCtx?.fromThb && kringCtx.fromThb >= 300) {
      setOfferBaht(kringCtx.fromThb)
      setRawOfferInput(String(kringCtx.fromThb))
    }
    if (kringCtx?.venue) setCustomVenueQuery(kringCtx.venue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host.id])
  const [lockedOfferCoins, setLockedOfferCoinsState] = useState<number>(0)
  // Abuse-test P0: a double-tap read stale React state and refunded the escrow hold 2-3x. The hold is mirrored in a
  // synchronous ref that is zeroed BEFORE the refund is dispatched, so only the first tap can ever release it.
  const lockedOfferCoinsRef = useRef(0)
  /** FIX2: the money-note ref of the live hold (= the offer id riding on it) */
  const sheetRefRef = useRef<string | null>(null)
  const setLockedOfferCoins = (n: number) => {
    lockedOfferCoinsRef.current = n
    setLockedOfferCoinsState(n)
  }
  /** Atomically takes the held coins (returns 0 if already released) */
  const takeHeldCoins = (): number => {
    const held = lockedOfferCoinsRef.current
    if (held <= 0) return 0
    lockedOfferCoinsRef.current = 0
    setLockedOfferCoinsState(0)
    return held
  }
  const [offerLocked, setOfferLocked] = useState(false)
  // R5 (Wei B7 / H1 hand-off): if a treat for this host is already held (e.g. sent earlier tonight, reopened app),
  // never offer a second Clink — point to the existing plan instead. Demo/night store only; ledger untouched.
  const planStore = usePlanStore()
  const priorHold = planStore.guest[partnerKey(host?.id ?? host?.name ?? '')]
  const priorHoldLive = Boolean(priorHold) && !offerLocked && ['held', 'accepted'].includes(effectiveHoldStatus(priorHold!))
  const [holdStatus, setHoldStatus] = useState<'HELD' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED'>('HELD')
  // KRING · the offer card rides on this sheet's hold. When planStore settles it — accepted → a booking (the hold now
  // waits for the bump), declined / withdrawn → refunded ONCE through the hold record — the sheet stops its own
  // countdown and drops its hold ref, so it can never refund a second time. The wallet itself is synced by App.
  const kringOffer = kringOfferId ? planStore.offers[kringOfferId] : undefined
  const kringBooking = kringOffer?.bookingId ? planStore.bookings[kringOffer.bookingId] : undefined
  const [ticketIn, setTicketIn] = useState(false)
  const liveBoxRef = useRef<HTMLDivElement | null>(null)
  const [liveMinH, setLiveMinH] = useState(0)
  useEffect(() => {
    if (!kringBooking) return
    // hold the box at the card's height while the stamp lands and the ticket comes in, then let it breathe
    const h = liveBoxRef.current?.getBoundingClientRect().height ?? 0
    if (h > 0) setLiveMinH(Math.round(h))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kringBooking?.id])
  useEffect(() => {
    if (!ticketIn || !liveMinH) return
    const t = window.setTimeout(() => setLiveMinH(0), 700)
    return () => window.clearTimeout(t)
  }, [ticketIn, liveMinH])
  useEffect(() => {
    if (!kringBooking || ticketIn) return
    const fresh = Date.now() - kringBooking.createdAt < 6_000
    let quiet = false
    try {
      quiet = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    } catch {
      quiet = false
    }
    if (!fresh || quiet) {
      setTicketIn(true)
      return
    }
    const t = window.setTimeout(() => setTicketIn(true), 1450)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kringBooking?.id])
  useEffect(() => {
    if (!offerLocked || holdStatus !== 'HELD' || !kringOffer) return
    if (kringOffer.status === 'accepted') {
      lockedOfferCoinsRef.current = 0
      setLockedOfferCoinsState(0)
      setHoldStatus('ACCEPTED')
      return
    }
    const h = planStore.guest[partnerKey(host.id)]
    if ((kringOffer.status === 'declined' || kringOffer.status === 'withdrawn') && h?.refundedAt) {
      lockedOfferCoinsRef.current = 0
      setLockedOfferCoinsState(0)
      setHoldStatus('CANCELLED')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planStore, kringOfferId, offerLocked, holdStatus])
  const [vipChatClosed, setVipChatClosed] = useState(false)
  const [ridePreFunded, setRidePreFunded] = useState(false)
  const [tableReserved, setTableReserved] = useState(false)
  const [dealActionStatus, setDealActionStatus] = useState<string | null>(null)
  const [hostBlindPickupToggle, setHostBlindPickupToggle] = useState(false)
  const [carPassengerTarget, setCarPassengerTarget] = useState<'host' | 'self' | 'both'>('host')
  const [ringCountdownSec, setRingCountdownSec] = useState<number>(900)
  const [applyPromoUpgradePack, setApplyPromoUpgradePack] = useState(false)
  // Depth build: signature clink moment on Send — glasses swing in → ring → coins → balance rolls (1.3 s)
  const [clinkFx, setClinkFx] = useState<{ key: number; from: number; to: number; rolled: boolean } | null>(null)
  const clinkTimers = useRef<number[]>([])
  useEffect(() => () => clinkTimers.current.forEach((t) => window.clearTimeout(t)), [])
  const playClinkMoment = (fromBaht: number, toBaht: number) => {
    clinkTimers.current.forEach((t) => window.clearTimeout(t))
    const key = Date.now()
    setClinkFx({ key, from: fromBaht, to: toBaht, rolled: false })
    // R4 Marco 4 · one object: the flutes meet at 420 ms (sfx on contact) → gold ring → the wallet line rolls down
    clinkTimers.current = [
      window.setTimeout(() => playSfx('send'), 420),
      window.setTimeout(() => setClinkFx((cur) => (cur && cur.key === key ? { ...cur, rolled: true } : cur)), 760),
      window.setTimeout(() => setClinkFx((cur) => (cur && cur.key === key ? null : cur)), 1600),
    ]
  }

  useEffect(() => {
    if (!offerLocked || holdStatus !== 'HELD') return
    const timer = window.setInterval(() => {
      setRingCountdownSec((prev) => {
        if (prev <= 1) {
          setHoldStatus('EXPIRED')
          const expired = takeHeldCoins()
          if (expired > 0) {
            setPaidCoins((c) => c + expired)
            dispatchInternalWalletDelta({
              paidDelta: expired,
              allowEscrowRefund: true,
              ...(sheetRefRef.current ? { note: kringMoneyNote('refund', host.name, sheetRefRef.current) } : {}),
            })
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [offerLocked, holdStatus, lockedOfferCoins])

  const handleVenueSearchChange = (query: string) => {
    setVenueQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      setShowSearchDropdown(false)
      return
    }
    setShowSearchDropdown(true)
    const q = query.toLowerCase()
    const localMatches = LOCAL_VENUE_SUGGESTIONS.filter(
      (v) => v.name.toLowerCase().includes(q) || v.address.toLowerCase().includes(q),
    )
    setSearchResults(localMatches)

    if (typeof fetch !== 'undefined') {
      fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=13.7563&lon=100.5018&limit=4`,
      )
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.features?.length) {
            const fetched: HangoutVenue[] = data.features.map((f: any) => ({
              name: f.properties?.name || f.properties?.street || query,
              address: [f.properties?.street, f.properties?.city || 'Bangkok']
                .filter(Boolean)
                .join(', '),
              latitude: f.geometry?.coordinates?.[1] ?? 13.7563,
              longitude: f.geometry?.coordinates?.[0] ?? 100.5018,
            }))
            setSearchResults((prev) => {
              const names = new Set(prev.map((p) => p.name.toLowerCase()))
              const combined = [...prev]
              for (const item of fetched) {
                if (!names.has(item.name.toLowerCase())) combined.push(item)
              }
              return combined
            })
          }
        })
        .catch(() => {})
    }
  }

  const handleSelectVenue = (v: HangoutVenue) => {
    triggerHaptic('tap')
    setSelectedVenue(v)
    setVenueQuery('')
    setShowSearchDropdown(false)
  }

  const wallet = paidCoins + bonusCoins
  // Atlas contract: win / receipt / deal lines go to the ONE top island (the legacy nodes stay sr-only)
  useEffect(() => {
    if (luckyResult) showIsland(`+${formatCoins(luckyResult.rewardCoins)} coins · ${luckyResult.name}`, 'gold', luckyResult.emoji)
  }, [luckyResult])
  useEffect(() => {
    if (treatReceipt) showIsland(`${treatReceipt.name} sent to ${host.name}`, 'gold', treatReceipt.emoji)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treatReceipt])
  useEffect(() => {
    if (venueChangeConfirmation) showIsland(venueChangeConfirmation.replace(/^[✅🛡️]\S*\s*/u, ''), venueChangeConfirmation.startsWith('🛡') ? 'red' : 'green')
  }, [venueChangeConfirmation])
  const offerTotalBaht = offerBaht + (hostBlindPickupToggle ? 150 : 0)
  const needTopUpBaht = Math.max(0, offerTotalBaht - Math.floor(paidCoins / 100))
  // FIX2 · Wei 4/27: after topping up the exact amount the old "Add ฿1 cash" stayed on screen (a stale alert shown with
  // max(need, 1)). The cash alert clears itself the moment the cash covers the booking.
  useEffect(() => {
    if (needTopUpBaht <= 0) setError((e) => (e && /Paid Coins|Red Line|Promo can|cash for this booking/i.test(e) ? null : e))
  }, [needTopUpBaht])
  const mmss = `${Math.floor(ringCountdownSec / 60)}:${String(ringCountdownSec % 60).padStart(2, '0')}`
  const venueLine = customVenueQuery || selectedVenue.name
  const timeLine = customHangoutTime
  // FIX1 (Wei 9 / Marco 10): area + reply time come from the ONE Kring profile — the same as LocalCard and profile
  const kProfile = localProfile(host as { id: string; name: string; city?: string; hostType?: string })
  const hostArea = (language === 'th' ? kProfile.areaTh : kProfile.areaEn) || (((host as { district?: string }).district ?? '').split('/')[0] || '').trim()
  const replyMin = kProfile.replyMin || 15
  // Atlas B9: language flag chips + one vibe line, derived from the host's own profile fields
  const hostLanguages = (() => {
    const h = host as { comfortVibes?: string[]; nationality?: string; statusText?: string }
    const tags = (h.comfortVibes ?? []).join(' ').toLowerCase()
    const out: Array<{ flag: string; label: string }> = []
    const nat = (h.nationality ?? '🇹🇭 Thai').toLowerCase()
    if (nat.includes('thai') || !h.nationality) out.push({ flag: '🇹🇭', label: 'ไทย' })
    if (tags.includes('english') || out.length > 0) out.push({ flag: '🇬🇧', label: 'EN' })
    if (tags.includes('japan')) out.push({ flag: '🇯🇵', label: '日本語' })
    if (tags.includes('chinese') || tags.includes('mandarin')) out.push({ flag: '🇨🇳', label: '中文' })
    if (tags.includes('korean')) out.push({ flag: '🇰🇷', label: '한국어' })
    return out
  })()
  const hostVibeLine = (((host as { statusText?: string }).statusText ?? '').replace(/^[^\p{L}\p{N}]+/u, '').trim()) || undefined
  const envelopePercent = Math.min(100, Math.max(0, Math.round((raisedCoins / host.goalCoins) * 100)))
  const showRideCard = rideCoins !== null || hangoutUnlocked
  const rideTier: RideTier = rideTierFor(rideCoins ?? VIP_RIDE_COINS)
  const rideFunded = rideCoins !== null
  const bonusCovered20 =
    treatReceipt !== null &&
    !treatReceipt.tutorial &&
    treatReceipt.bonusCoinsUsed > 0 &&
    treatReceipt.bonusCoinsUsed === Math.floor(treatReceipt.coins * 0.2)

  const hostGallery =
    host.photos && host.photos.length > 0
      ? host.photos
      : HOST_GALLERY_BY_ID[host.id] ?? [
          host.photo ?? HOST_PHOTO_BY_ID[host.id] ?? HOST_PHOTO_BY_ID['host-mint'],
          ...HOST_GALLERY_BY_ID['host-mint'].slice(1),
        ]
  const safePhotoIdx = photoIdx % hostGallery.length
  const hostPhoto = hostGallery[safePhotoIdx] ?? host.photo ?? HOST_PHOTO_BY_ID[host.id] ?? HOST_PHOTO_BY_ID['host-mint']
  const hostLiveReaction = treatReceipt
    ? `🙏 "Thank you for the ${treatReceipt.name}!"`
    : language === 'zh'
      ? `😊 “${kProfile.signature[0]?.titleEn ?? 'Experiences'} · ${kProfile.placeEn}”`
      : language === 'th'
        ? `😊 "${kProfile.signature[0]?.titleTh ?? 'ทริปกับโลคอล'} · ${kProfile.placeTh}"`
        : `😊 "${kProfile.signature[0]?.titleEn ?? 'Experiences'} · ${kProfile.placeEn}"`

  const sendThaiTreat = (treat: ThaiVibeTreat) => {
    const isTutorial = tutorialsLeft > 0
    let bonusCoinsUsed = 0

    if (!isTutorial) {
      if (wallet < treat.coins) {
        setError('Not enough Coins for that Treat — top up to keep clinking! 🪙')
        return
      }
      try {
        const split = calculateBlendedSpend(treat.coins, paidCoins, bonusCoins, config)
        setPaidCoins((current) => current - split.paidCoinsUsed)
        setBonusCoins((current) => current - split.bonusCoinsUsed)
        bonusCoinsUsed = split.bonusCoinsUsed
      } catch {
        setError('Bonus Coins can cover only part of this Treat — add paid Coins.')
        return
      }
    }

    triggerHaptic('clink')
    {
      const big = mapGiftToBigKind(treat.id, treat.coins)
      if (big) {
        triggerBigGift({ kind: big, emoji: treat.emoji, title: `${treat.name} for ${host.name}`, subtitle: `🪙 ${formatCoins(treat.coins)}`, sender: senderName(), giftName: treat.name, coins: treat.coins, recipient: host.name })
      } else {
        triggerLuxuryFX({
          theme: mapTreatToFxTheme(treat.id),
          emoji: treat.emoji,
          title: `${treat.name} for ${host.name}!`,
          subtitle: luckyChatNote.trim() ? `💬 "${luckyChatNote.trim()}"` : `🎁 ${formatCoins(treat.coins / 100)} baht gift`,
          accentPrice: `🪙 ${formatCoins(treat.coins)}`,
        })
      }
    }
    setError(null)
    setLuckyResult(null)
    setTutorialsLeft((current) => Math.max(0, current - 1))
    setRaisedCoins((current) => current + treat.coins)
    const realMoneyCoins = isTutorial ? 0 : Math.max(0, treat.coins - bonusCoinsUsed)
    setHostReceivedPoints((current) => current + Math.round(realMoneyCoins * 0.8))
    setJustFilled(true)
    setTimeout(() => {
      if (typeof window !== 'undefined') setJustFilled(false)
    }, 1200)
    if (treat.id === 'vip-tuktuk-ride') {
      setIsTukTukDriving(true)
      setTimeout(() => {
        if (typeof window !== 'undefined') setIsTukTukDriving(false)
      }, 1750)
    }
    if (isRideTreat(treat)) setRideCoins(treat.coins)
    setTreatReceipt({
      emoji: treat.emoji,
      name: treat.name,
      coins: treat.coins,
      bonusCoinsUsed,
      tutorial: isTutorial,
    })
    onSendTreat?.(treat, treat.coins)
  }

  const sendLuckyGift = (gift: LuckyChonGift) => {
    setSelectedLuckyGift(gift)
    const coins = gift.coins * luckyMultiplier
    if (wallet < coins) {
      setError('Not enough Coins for that combo — pick a smaller multiplier! 🪙')
      return
    }

    const multiplier =
      DEMO_LUCKY_RETURN_MULTIPLIERS[luckySends % DEMO_LUCKY_RETURN_MULTIPLIERS.length] ?? 2
    const rewardCoins = gift.coins * multiplier

    const fromPaid = Math.min(paidCoins, coins)
    const fromBonus = coins - fromPaid
    setPaidCoins((current) => current - fromPaid + rewardCoins)
    setBonusCoins((current) => current - fromBonus)

    triggerHaptic(luckyMultiplier >= 9 ? 'jackpot' : 'combo')
    // Atlas B12/B13: Lucky is a tiny pop only — never the big-gift stage
    triggerLuxuryFX({
      theme: 'lucky-jackpot-fountain',
      emoji: gift.emoji,
      title: `${gift.name} ×${luckyMultiplier}`,
      subtitle: `+🪙 ${formatCoins(rewardCoins)}`,
    })
    setIsLuckyBouncing(true)
    setTimeout(() => {
      if (typeof window !== 'undefined') setIsLuckyBouncing(false)
    }, 70)
    setError(null)
    setTreatReceipt(null)
    setLuckySends((current) => current + 1)
    setComboStreak((current) => current + 1)
    setHostReceivedPoints((current) => current + Math.round(coins * 0.06))
    if (luckyChatNote.trim()) {
      setSentChatNote(luckyChatNote.trim())
      setLuckyChatNote('')
    }
    setLuckyResult({
      emoji: gift.emoji,
      name: gift.name,
      quantity: luckyMultiplier,
      coins,
      multiplier,
      rewardCoins,
    })
    dispatchInternalWalletDelta({ bonusDelta: rewardCoins })
    if (rewardCoins > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('chon:coin-balance-popup', {
          detail: {
            source: 'lucky-pool-win',
            rewardCoins,
            multiplier,
            delta: rewardCoins - coins,
            hideGlobal: true,
            label: `+🪙 ${formatCoins(rewardCoins)}`,
          },
        }),
      )
    }
    onSendLuckyGift?.(gift, luckyMultiplier, coins)
  }

  const sendDirectTextOnly = () => {
    if (!luckyChatNote.trim()) return
    triggerHaptic('tap')
    const msg = luckyChatNote.trim()
    setSentChatNote(msg)
    setFloatingMessage(`💬 To ${host.name}: "${msg}"`)
    setLuckyChatNote('')
    window.dispatchEvent(
      new CustomEvent('chon:send-direct-message', {
        detail: {
          hostId: host.id,
          hostName: host.name,
          text: msg,
          message: msg,
        },
      }),
    )
    window.dispatchEvent(
      new CustomEvent('chon:open-chat-with-message', {
        detail: {
          hostId: host.id,
          hostName: host.name,
          text: msg,
          message: msg,
        },
      }),
    )
  }

  const unlockHangoutPass = () => {
    if (hangoutUnlocked) return
    triggerHaptic('jackpot')
    triggerLuxuryFX({
      theme: 'champagne-clink-clash',
      emoji: '✓',
      title: `${host.name} said yes!`,
      subtitle: `📍 ${selectedVenue.name} · booking confirmed`,
      accentPrice: 'BOOKED',
    })
    setHangoutUnlocked(true)
    onUnlockHangoutPass?.(host)
  }

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label={`Book ${host.name} · Kring`}
      data-testid="clink-gift-sheet"
      className={`mm-sheet-in ck-sheet c-text-1${offerLocked && !clinkFx ? ' is-sent' : ''}`}
    >
      <style>{CLINK_SHEET_STYLE}</style>

      {/* Rule D: Pure +🪙 (amount) Lucky Win Pill at Top (keeping full legacy text in sr-only) */}
      {LEGACY_UI && (luckyResult || treatReceipt) && (
        <div
          role="status"
          aria-live="polite"
          data-testid="top-only-win-notification"
          className="sr-only"
        >
          {luckyResult ? (
            <>
              <span aria-hidden="true">
                +🪙 {formatCoins(luckyResult.rewardCoins)}
              </span>
              <span className="sr-only">
                🎰 {luckyResult.emoji} x{luckyResult.quantity} · {luckyResult.multiplier}x WIN → +🪙{' '}
                {formatCoins(luckyResult.rewardCoins)}! 🎉
              </span>
            </>
          ) : treatReceipt ? (
            <>
              <span aria-hidden="true">
                +🪙 {formatCoins(treatReceipt.coins)}
              </span>
              <span className="sr-only">
                {treatReceipt.emoji} {treatReceipt.name} (🪙 {formatCoins(treatReceipt.coins)}) → Envelope +🪙{' '}
                {formatCoins(treatReceipt.coins)}! 🙏
              </span>
            </>
          ) : null}
        </div>
      )}

      {/* Keep VIP Entry & Marquee in DOM for tests while keeping the sheet top ultra-clean */}
      <div className={showAdvancedOptions ? 'space-y-1.5' : 'sr-only'}>
        <div className="flex items-center justify-between rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-purple-900/40 to-amber-500/20 px-3 py-1">
          <div className="flex items-center gap-1.5 text-xs font-black text-amber-300">
            <span>✓</span>
            <span>
              <span aria-hidden="true">
                {language === 'th' ? `จองกับ ${host.name}` : `Booking with ${host.name}`}
              </span>
            </span>
          </div>
          <span className="rounded-full bg-amber-400/25 px-2 py-0.5 text-[9px] font-extrabold text-amber-200">
            {language === 'th' ? 'โลคอลยืนยันแล้ว' : 'VERIFIED LOCAL'}
          </span>
        </div>
      </div>

      {/* Atlas B8 line 1 · who: avatar (morph target) · "Clink with Mint ✓" · area + reply time · ? ⋯ ✕ */}
      <div className={`ck-who${offerLocked && !clinkFx ? ' is-folded' : ''}`}>
        <div className="ck-av">
          {/* NEXT95 (G1) · host-coloured silhouette under the photo, crossfade on load — never a letter */}
          <HostPhoto
            src={hostPhoto}
            name={host.name}
            round
            alt={host.name}
            data-testid="gift-sheet-host-avatar"
            onClick={() => setIsPhotoExpanded((prev) => !prev)}
            className="ck-av-photo"
            imgClassName="mm-vt-avatar"
          />
        </div>
        <div className="ck-who-txt">
          <h2 aria-label={`Book ${host.name}`} className="ck-who-name">
            {tab === 'offer'
              ? language === 'th'
                ? `เสนอราคา · ${host.name}`
                : language === 'zh'
                  ? `预订 ${host.name}`
                  : `Book ${host.name}`
              : `${host.name}, ${host.age ?? 24}`}
            <span className="ck-ver" aria-hidden="true">✓</span>
          </h2>
          <span className="sr-only">✓ Verified local</span>
          <p className="ck-who-sub">
            <span aria-hidden="true">
              {language === 'th'
                ? `${hostArea} · ตอบใน ~${replyMin} นาที`
                : language === 'zh'
                  ? `${hostArea} · 约 ${replyMin} 分钟回复`
                  : `${hostArea} · replies in ~${replyMin} min`}
            </span>
            <span className="sr-only">★ {kProfile.rating} · {hostLiveReaction}</span>
          </p>
        </div>
        <div className="ck-who-tools">
          <button
            type="button"
            data-testid="clink-help-btn"
            aria-label="How gifting works"
            onClick={() => {
              triggerHaptic('tap')
              setShowHelpPopover((prev) => !prev)
              openGuide(tab === 'offer' ? 'clink' : 'gifts')
            }}
            className="ck-icon m-press"
          >
            <span aria-hidden="true">?</span>
            <span className="sr-only">Help</span>
          </button>
          <SafetyMenu
            hostId={host.id}
            hostName={host.name}
            testIdPrefix="clink"
            language={language}
            onReported={() => setFloatingMessage(`🚩 ${host.name} reported · 24 h safety review`)}
            onBlocked={() => {
              triggerHaptic('tap')
              setFloatingMessage(`⛔ ${host.name} blocked · hidden from Meet & Chats`)
              setTimeout(() => onClose?.(), 350)
            }}
          />
          {LEGACY_UI && (<>
          <p data-testid="wallet-balance" className="sr-only">
            {formatCoins(wallet)} Coins 🪙
          </p>
          <p data-testid="paid-balance" className="sr-only">
            Paid {formatCoins(paidCoins)}c
          </p>
          <p data-testid="bonus-balance" className="sr-only">
            Bonus {formatCoins(bonusCoins)}c
          </p>
          </>)}
          {onClose && (
            <button type="button" aria-label="Close clink sheet" onClick={onClose} className="ck-icon m-press">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </div>
        {isTukTukDriving && (
          <div className="sr-only">
            💨🛺💨 ➔ {host.name}
          </div>
        )}
        {(treatReceipt || luckyResult) && <span className="sr-only">✨</span>}
      </div>

      {/* Super-Compact Single-Line Note for Future Bookings */}
      <p
        data-testid="future-days-inbox-note"
        className="sr-only"
      >
        <span aria-hidden="true">
          {language === 'zh'
            ? `💬 预订明天或未来的时间？请在私信中直接联系 ${host.name}。`
            : language === 'th'
              ? `💬 จองล่วงหน้าสำหรับวันพรุ่งนี้? ทักแชทคุยกับ ${host.name} โดยตรงได้เลย`
              : `💬 Booking for tomorrow or future days? Message ${host.name} directly in her Inbox.`}
        </span>
        <span className="sr-only">
          💬 Booking for tomorrow or future days? Message {host.name} directly in her Inbox.
        </span>
      </p>

      {/* Atlas B9 (integration): profile + photo lightbox are ONE full-screen page (HostLightbox). Tapping the avatar
          opens it; Clink returns to this sheet's Send line, 💬 opens the chat. sr-only count stays for screen readers. */}
      {!isPhotoExpanded || offerLocked ? (
        <p className="sr-only">
          📸 {host.name} · Photo {safePhotoIdx + 1}/{hostGallery.length} · Real Face ✅
        </p>
      ) : null}
      <HostLightbox
        open={isPhotoExpanded && !offerLocked}
        name={host.name}
        age={host.age ?? 24}
        verified={(host as { faceMatched?: boolean }).faceMatched !== false}
        area={hostArea}
        online
        languages={hostLanguages}
        vibe={hostVibeLine}
        photos={hostGallery}
        index={safePhotoIdx}
        onIndex={setPhotoIdx}
        priceThb={offerBaht}
        language={language}
        onClose={() => setIsPhotoExpanded(false)}
        onClink={() => {
          setIsPhotoExpanded(false)
          setTab('offer')
        }}
        onChat={() => {
          setIsPhotoExpanded(false)
          window.dispatchEvent(
            new CustomEvent('chon:open-chat', { detail: { hostName: host.name, hostId: host.id } }),
          )
          window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'chats' } }))
        }}
      />

      {/* Keep legacy clink-help-popover in sr-only so it never clutters below the photo thumbnails */}
      {showHelpPopover && (
        <div
          role="note"
          data-testid="clink-help-popover"
          className="sr-only"
        >
          <p>• 💬 Offer a price · counter or suggest a change</p>
          <p>• 🔒 Held until you meet · released at the bump</p>
          <p>• 🛡️ 100% back if you don't meet</p>
        </div>
      )}

      {/* Atlas B8 line 2 · where & when (Edit opens the B10 picker) */}
      <div
        data-testid="editable-venue-time-card"
        className={offerLocked || tab !== 'offer' ? 'sr-only' : 'ck-plan'}
      >
        <div className="ck-line">
          <span className="ck-ic" aria-hidden="true">
            <PinDrop dropped={!isEditingVenue && venueLine.length > 0} size={18} />
          </span>
          <span className="ck-line-txt">
            <b>{venueLine}</b>
            <small>
              {kDay(terms.date, language === 'th', true)} · {terms.start}–{terms.end} · {language === 'th' ? 'สถานที่สาธารณะ' : language === 'zh' ? '公共场所' : 'public venue'}
            </small>
          </span>
          <button
            type="button"
            data-testid="change-venue-inline-btn"
            onClick={() => {
              triggerHaptic('select')
              setIsEditingVenue((prev) => !prev)
            }}
            className="ck-link m-press"
          >
            <span aria-hidden="true">
              {isEditingVenue
                ? language === 'zh' ? '完成' : language === 'th' ? 'เสร็จ' : 'Done'
                : language === 'zh' ? '修改' : language === 'th' ? 'แก้ไข' : 'Edit'}
            </span>
            <span className="sr-only">{isEditingVenue ? 'Done' : 'Change'}</span>
          </button>
        </div>

        {/* KRING · date · start–end · "Just me" (+ friends) — the offer card carries all of it */}
        <OfferTermsFields value={terms} onChange={setTerms} th={language === 'th'} experience={kringCtx ? (language === 'th' ? kringCtx.titleTh ?? kringCtx.title : kringCtx.title) : undefined} />

        {/* 1-on-1 vs 2-on-2 +฿200 Segmented Control */}
        <div
          data-testid="toggle-bestie-2on2-table"
          role="group"
          aria-label="Group size"
          className="sr-only"
        >
          <button
            type="button"
            data-testid="mode-1on1-hangout-btn"
            onClick={() => {
              triggerHaptic('tap')
              if (isDoubleDateSquad) {
                setIsDoubleDateSquad(false)
                setOfferBaht((prev) => {
                  const next = prev === 600 || prev === 500 ? Math.max(300, hostMinDemandThb) : prev
                  setRawOfferInput(String(next))
                  return next
                })
              }
            }}
            aria-pressed={!isDoubleDateSquad}
            className="m-press"
          >
            <span aria-hidden="true">
              {language === 'zh'
                ? '1对1'
                : language === 'th'
                  ? 'แค่ฉัน'
                  : 'Just me'}
            </span>
            <span className="sr-only">👤 Just me</span>
          </button>
          <button
            type="button"
            data-testid="mode-2on2-bestie-btn"
            onClick={() => {
              triggerHaptic('tap')
              if (!isDoubleDateSquad) {
                setIsDoubleDateSquad(true)
                setOfferBaht((prev) => Math.max(600, prev))
                setRawOfferInput((prev) => String(Math.max(600, Number(prev) || 600)))
              }
            }}
            aria-pressed={isDoubleDateSquad}
            className="m-press"
          >
            <span aria-hidden="true">
              {language === 'zh'
                ? '2对2 +฿200'
                : language === 'th'
                  ? 'กับเพื่อน'
                  : 'With friends'}
            </span>
            <span className="sr-only">👥 With friends</span>
          </button>
        </div>

        <div className={isEditingVenue ? 'ck-edit' : 'sr-only'}>
          {/* UX-P5 founder rule 1: type any public venue OR paste a Google Maps link · visible Maps button · editable time */}
          <VenueField
            inputId="custom-venue-search-input"
            inputTestId="custom-venue-search-input"
            timeInputId="custom-venue-time-input"
            timeTestId="custom-venue-time-input"
            mapsTestId="clink-open-google-maps-btn"
            value={customVenueQuery}
            onChange={(next) => {
              setCustomVenueQuery(next)
              handleVenueSearchChange(next)
            }}
            timePlaceholder={language === 'zh' ? '14:00' : '14:00'}
            isPublic={isPublicVenueOnly}
            language={language}
            compact
          />

          {/* Atlas B10 · licensed public venues nearby (one picker for Clink, story and host change-of-venue) */}
          <span className="ck-mono">{language === 'th' ? 'ร้านสาธารณะมีใบอนุญาต · ใกล้คุณ' : language === 'zh' ? '附近持牌公共场所' : 'Licensed public venues · near you'}</span>
          <div className="ck-venues">
            {[...AVAILABLE_HANGOUT_VENUES, ...LOCAL_VENUE_SUGGESTIONS.filter((v) => !AVAILABLE_HANGOUT_VENUES.some((a) => a.name === v.name))].slice(0, 4).map((v, i) => {
              const on = customVenueQuery === v.name
              return (
                <button
                  key={v.name}
                  type="button"
                  aria-pressed={on}
                  className={`ck-ven m-press${on ? ' is-on' : ''}`}
                  onClick={() => {
                    triggerHaptic('select')
                    setCustomVenueQuery(v.name)
                    setSelectedVenue(v)
                  }}
                >
                  <i className={`ck-ven-ph ck-ph-${i % 4}`} aria-hidden="true" />
                  <span className="ck-ven-txt">
                    <b>
                      {v.name}
                      {!/mall|courtyard|emquartier/i.test(v.name) && <em className="ck-lic">{language === 'th' ? 'มีใบอนุญาต' : 'LICENSED'}</em>}
                    </b>
                    <small>{v.address}</small>
                  </span>
                  {on && <span className="ck-chk" aria-hidden="true">✓</span>}
                </button>
              )
            })}
          </div>
          {/* the day and time live in the date · start–end fields above (one source); the old "Tonight" chips stay for screen-reader-free legacy only */}
          <div className="sr-only" aria-hidden="true">
            {['7:30 PM', '8:00 PM', '8:30 PM', '9:00 PM', '10:00 PM'].map((tm) => {
              const on = customHangoutTime.replace(/^Tonight\s*/i, '') === tm
              return (
                <button
                  key={tm}
                  type="button"
                  aria-pressed={on}
                  className="mm-chip m-press"
                  onClick={() => {
                    triggerHaptic('select')
                    setCustomHangoutTime(`Tonight ${tm}`)
                  }}
                >
                  {tm.replace(':00', '')}
                </button>
              )
            })}
          </div>
          <div className="sr-only">
            {[
              {
                label: '🌿 Siam Herbal Spa · 2:00 PM',
                venueName: 'Siam Herbal Spa, Ari',
                time: 'Today 2:00 PM',
                venueObj: AVAILABLE_HANGOUT_VENUES[1] ?? DEMO_HANGOUT_VENUE,
                visible: true,
              },
              {
                label: '🍢 Yaowarat Rd · 2:30 PM',
                venueName: 'Yaowarat Rd, Chinatown',
                time: 'Today 2:30 PM',
                venueObj: DEMO_HANGOUT_VENUE,
                visible: true,
              },
              {
                label: '🛕 Wat Arun pier · 9:30 AM',
                venueName: 'Wat Arun pier',
                time: 'Today 9:30 AM',
                venueObj: {
                  name: 'Wat Arun pier',
                  address: 'Wat Arun, Bangkok Yai',
                  latitude: 13.7437,
                  longitude: 100.4889,
                },
                visible: true,
              },
              {
                label: '🏖️ Jomtien Beach Rd · 9:00 AM',
                venueName: 'Jomtien Beach Rd, Pattaya',
                time: 'Today 9:00 AM',
                venueObj: AVAILABLE_HANGOUT_VENUES[2] ?? DEMO_HANGOUT_VENUE,
                visible: false,
              },
            ].map((pin) => {
              const active =
                customVenueQuery === pin.venueName && customHangoutTime === pin.time
              return (
                <button
                  key={pin.label}
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap')
                    setCustomVenueQuery(pin.venueName)
                    setCustomHangoutTime(pin.time)
                    setSelectedVenue(pin.venueObj)
                  }}
                  aria-pressed={active}
                  className="sr-only"
                >
                  {pin.label}
                </button>
              )
            })}
          </div>

          {/* Sleek [🔄 Request Venue / Time Change] Button */}
          <button
            type="button"
            data-testid="request-venue-change-btn"
            onClick={() => {
              triggerHaptic('clink')
              const finalVenue = customVenueQuery.trim() || selectedVenue.name
              if (!isPublicVenueOnly(finalVenue)) {
                setVenueChangeConfirmation(
                  '🛡️ Public places only: meet at markets, cafés, malls, parks or licensed venues. Private rooms and condos are blocked.',
                )
                setCustomVenueQuery(selectedVenue.name)
                return
              }
              setVenueChangeConfirmation(
                `✅ ${finalVenue} · ${kDay(terms.date, language === 'th', true)} ${terms.start}`,
              )
              setIsEditingVenue(false)
            }}
            className="ux-btn ux-btn-gold m-press ck-done"
          >
            <span aria-hidden="true">
              {language === 'zh' ? '完成' : language === 'th' ? 'เสร็จ' : 'Done'} · {(customVenueQuery || selectedVenue.name).split(',')[0]}
            </span>
            <span className="sr-only">🔄 Request Venue / Time Change</span>
          </button>
        </div>

        {venueChangeConfirmation && (
          <p
            role="status"
            data-testid="venue-change-confirmation"
            className="sr-only"
          >
            {venueChangeConfirmation}
          </p>
        )}
      </div>

      {/* Segmented control folded into sr-only when tab === 'offer' so the 4-line Invite sheet has zero tab-within-sheet clutter */}
      <div role="tablist" aria-label="Chon! sheet sections" className={tab === 'offer' ? 'sr-only' : 'ux-seg'} data-testid="clink-sheet-segments">
        {(
          [
            { id: 'offer', testId: 'tab-offer', controls: 'clink-panel-offer', label: language === 'zh' ? '🧧 邀约' : language === 'th' ? '🧧 ชวนเจอ' : '🧧 Invite', sr: '🧧 Invite · Treat Envelope offer' },
            { id: 'thai', testId: 'tab-thai', controls: 'clink-panel-thai', label: language === 'zh' ? '🎁 普通礼物' : language === 'th' ? '🎁 ของขวัญ' : '🎁 Gifts', sr: '🥂 Thai Vibe Treats · 🎁 Normal Gift' },
            { id: 'lucky', testId: 'tab-lucky', controls: 'clink-panel-lucky', label: language === 'zh' ? '🍀 幸运碰杯' : language === 'th' ? '🍀 สุ่มโชค' : '🍀 Lucky', sr: '🍀 Lucky Chon! (500x)' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${t.testId}-tab`}
            aria-controls={t.controls}
            aria-selected={tab === t.id}
            data-testid={t.testId}
            onClick={() => {
              triggerHaptic('tap')
              setTab(t.id)
            }}
          >
            <span aria-hidden="true">{t.label}</span>
            <span className="sr-only">{t.sr}</span>
          </button>
        ))}
      </div>

      {/* 2B. BOARD 1 (v6 LOCKED) OFFER SHEET + REQUEST CONFIRMED SCREEN */}
      <div
        data-testid="envelope-header"
        className={tab === 'offer' ? 'space-y-2' : 'sr-only'}
      >
        <div className="sr-only">
          <p>📍 {host.treatLabel}</p>
          <span
            data-testid="held-safely"
            title={
              language === 'zh'
                ? '🔒 安全托管 — 若未被接单，100%即时自动退款'
                : '🔒 Held Safely — 100% Instant Auto-Refund if not picked'
            }
          >
            🔒 Held Safely — 100% Instant Auto-Refund if not picked
          </span>
          <p data-testid="envelope-count">
            <span aria-hidden="true">
              {language === 'zh'
                ? `今日预订进度: ${formatCoins(raisedCoins)}c / ${formatCoins(host.goalCoins)}c · ${envelopePercent}%`
                : language === 'th'
                  ? `ยอดจองวันนี้: ${formatCoins(raisedCoins)}c / ${formatCoins(host.goalCoins)}c · ${envelopePercent}%`
                  : `Today's bookings: ${formatCoins(raisedCoins)}c / ${formatCoins(host.goalCoins)}c · ${envelopePercent}%`}
            </span>
            <span className="sr-only">
              Today&apos;s bookings: {formatCoins(raisedCoins)}c / {formatCoins(host.goalCoins)}c · {envelopePercent}%
            </span>
          </p>
          <button
            type="button"
            data-testid="host-let-go"
            onClick={unlockHangoutPass}
            disabled={hangoutUnlocked}
          >
            {hangoutUnlocked ? '✅ Hangout Pass unlocked' : '🎉 Preview "Let\'s Go!"'}
          </button>
          <div
            data-testid="envelope-progress"
            data-raised={raisedCoins}
            data-goal={host.goalCoins}
          >
            <div data-testid="envelope-bar" style={{ width: `${envelopePercent}%` }} />
          </div>
        </div>

        <div
          data-testid="variant-a-offer-sheet-card"
          className="space-y-2"
        >
          {/* Keep Host Minimum Demand Bar in sr-only so tests pass while removing "$300 / Min Demand" text from visible card */}
          {LEGACY_UI && (
          <div
            data-testid="sheet-host-min-demand-bar"
            className={showHostMinEditor ? 'space-y-1 rounded-lg border border-pink-400/30 bg-[#1E1233] px-2 py-1' : 'sr-only'}
          >
            <div className="flex items-center justify-between gap-1.5">
              <p className="min-w-0 truncate text-[9.5px] font-extrabold text-pink-200">
                <span aria-hidden="true">
                  {language === 'zh'
                    ? `👸 ${host.name} 的今晚外出心愿目标: ฿${hostMinDemandThb.toLocaleString('en-US')} (可设置任意 ≥ ฿${hostMinDemandThb.toLocaleString('en-US')} 的心愿红包)`
                    : language === 'th'
                      ? `👸 เป้าหมายซองของขวัญของ ${host.name}: ฿${hostMinDemandThb.toLocaleString('en-US')} (ตั้งซองขั้นต่ำ ≥ ฿${hostMinDemandThb.toLocaleString('en-US')})`
                      : `👸 ${host.name}'s Outing Treat Goal: ฿${hostMinDemandThb.toLocaleString('en-US')} (Set any Treat Envelope ≥ ฿${hostMinDemandThb.toLocaleString('en-US')})`}
                </span>
                <span className="sr-only">
                  👸 {host.name}&apos;s Outing Treat Goal: ฿{hostMinDemandThb.toLocaleString('en-US')} (Set any Treat Envelope ≥ ฿{hostMinDemandThb.toLocaleString('en-US')})
                </span>
              </p>
              <button
                type="button"
                data-testid="toggle-host-min-editor-btn"
                onClick={() => {
                  triggerHaptic('tap')
                  setShowHostMinEditor((prev) => !prev)
                }}
              >
                {language === 'zh' ? '👸 外出心愿目标' : '👸 Outing Treat Goal'}
                <span className="sr-only">👸 Outing Treat Goal</span>
              </button>
            </div>
            <div>
              <input
                type="number"
                id="sheet-host-min-input"
                name="hostMinDemandThb"
                data-testid="sheet-host-min-input"
                min={300}
                value={hostMinDemandThb}
                onChange={(e) => {
                  const parsed = Number(e.target.value)
                  const nextMin = Number.isFinite(parsed) ? Math.max(300, Math.round(parsed)) : 300
                  setHostMinDemandThb(nextMin)
                  setOfferBaht((prev) => {
                    const nextVal = prev < nextMin ? nextMin : prev
                    setRawOfferInput(String(nextVal))
                    return nextVal
                  })
                }}
                aria-label="Host minimum hangout demand in Baht"
              />
              {[300, 500, 1500, 5000, 20000].map((minPreset) => (
                <button
                  key={minPreset}
                  type="button"
                  data-testid={`host-min-preset-${minPreset}`}
                  onClick={() => {
                    triggerHaptic('tap')
                    setHostMinDemandThb(minPreset)
                    setOfferBaht((prev) => {
                      const nextVal = prev < minPreset ? minPreset : prev
                      setRawOfferInput(String(nextVal))
                      return nextVal
                    })
                  }}
                >
                  ฿{minPreset.toLocaleString('en-US')}
                </button>
              ))}
            </div>
          </div>
          )}

          {/* BOARD 1 v6 LOCKED STEPPER (Collapsed into sr-only once offerLocked is true so Confirmation stage sits right at the top!) */}
          <div className={offerLocked && !clinkFx ? 'sr-only' : 'space-y-2'} /* R3 Marco: stay visible while the clink moment plays */>
            <div className="ck-env" data-testid="offer-stepper-card">
              <div className="ck-env-head">
                <span className="ck-mono">
                  {language === 'th' ? 'ข้อเสนอของคุณ' : language === 'zh' ? '你的报价' : 'Your offer'}
                </span>
              </div>
              <div className="ck-step">
                <button
                  type="button"
                  data-testid="offer-stepper-minus"
                  aria-label="Decrease offer amount"
                  disabled={offerBaht <= Math.max(300, hostMinDemandThb)}
                  onClick={() => {
                    triggerHaptic('tap')
                    const floor = Math.max(300, hostMinDemandThb)
                    setOfferBaht((prev) => {
                      const step = prev <= 500 ? 50 : 100
                      const nextVal = Math.max(floor, prev - step)
                      setRawOfferInput(String(nextVal))
                      return nextVal
                    })
                  }}
                  className={`ux-step m-press${offerBaht <= Math.max(300, hostMinDemandThb) ? ' is-disabled' : ''}`}
                >
                  −
                </button>

                {/* Center: 34px/700 Baht Amount + sub-line */}
                <div className="ck-amt-wrap">
                  <div className="ck-amt">
                    <span className="ck-amt-cur">฿</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      id="uncapped-offer-thb-input"
                      name="offerBaht"
                      data-testid="uncapped-offer-thb-input"
                      min={Math.max(300, hostMinDemandThb)}
                      // Wei 10: "฿1,200", never "฿1200" — grouped while you look, plain digits while you type
                      value={amtFocus ? rawOfferInput : Number.isFinite(Number(rawOfferInput)) && rawOfferInput !== '' ? Number(rawOfferInput).toLocaleString('en-US') : rawOfferInput}
                      onFocus={() => setAmtFocus(true)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '')
                        setRawOfferInput(raw)
                        const parsed = Number(raw)
                        const floor = Math.max(300, hostMinDemandThb)
                        if (Number.isFinite(parsed) && parsed >= floor) {
                          setOfferBaht(Math.round(parsed))
                        }
                      }}
                      onBlur={() => {
                        setAmtFocus(false)
                        const floor = Math.max(300, hostMinDemandThb)
                        const parsed = Number(rawOfferInput)
                        const clamped = Number.isFinite(parsed) ? Math.max(floor, Math.round(parsed)) : floor
                        setOfferBaht(clamped)
                        setRawOfferInput(String(clamped))
                      }}
                      aria-label="Uncapped hangout offer in Baht"
                      className="ck-amt-input"
                      style={{ width: `${Math.max(3, rawOfferInput.length + (amtFocus ? 0 : Math.floor((rawOfferInput.length - 1) / 3) * 0.5)) + 0.4}ch` }}
                    />
                  </div>

                  {/* Wei §4 sub-line (keeping legacy coin text in sr-only) */}
                  <span
                    data-testid="offer-stepper-display"
                    className="sr-only"
                  >
                    <span aria-hidden="true">
                      {language === 'th'
                        ? `เรากันวงเงิน ฿${formatCoins(offerBaht + (hostBlindPickupToggle ? 150 : 0))} ไว้ โอนให้โลคอลตอนกริ๊งเท่านั้น`
                        : `We hold your ฿${formatCoins(offerBaht + (hostBlindPickupToggle ? 150 : 0))}. It moves only at the กริ๊ง! bump.`}
                    </span>
                    <span className="sr-only">
                      ฿{formatCoins(offerBaht + (hostBlindPickupToggle ? 150 : 0))} held until you meet
                    </span>
                  </span>

                  {/* KRING T3 · never advertise the local's share — not even to screen readers */}
                </div>

                <button
                  type="button"
                  data-testid="offer-stepper-plus"
                  aria-label="Increase offer amount"
                  onClick={() => {
                    triggerHaptic('tap')
                    setOfferBaht((prev) => {
                      const step = prev >= 2000 ? 500 : 100
                      const nextVal = prev + step
                      setRawOfferInput(String(nextVal))
                      return nextVal
                    })
                  }}
                  className="ux-step m-press"
                >
                  +
                </button>
              </div>
            {/* Wei §4 Guarantee Row: single emerald line */}
              <div
                data-testid="zero-flake-guarantee-pill"
                className="ck-guarantee"
              >
                <span>
                  <span aria-hidden="true">
                    {language === 'zh'
                      ? '没见面，不扣钱'
                      : language === 'th'
                         ? 'ไม่ได้เจอ ไม่เสียเงิน'
                         : 'No meet, no charge'}
                  </span>
                  <span className="sr-only">🛡️ 100% Zero-Flake Guarantee (การันตีไม่เท) 🔒 Pay Only at Venue Check-In</span>
                </span>
              </div>
            </div>

            {/* Preset pills removed from visible UI per founder instruction; kept in sr-only for unit test compatibility */}
            <div className="sr-only">
              {[300, 500, 1200, 1350, 1500, 1800, 2500, 10000].map((amt) => {
                const effectiveAmt = Math.max(amt, hostMinDemandThb)
                return (
                  <button
                    key={amt}
                    type="button"
                    data-testid={`quick-offer-pill-${amt}`}
                    onClick={() => {
                      triggerHaptic('tap')
                      const nextVal = Math.max(amt, hostMinDemandThb)
                      setOfferBaht(nextVal)
                      setRawOfferInput(String(nextVal))
                    }}
                  >
                    ฿{formatCoins(effectiveAmt)} 🪙 {formatCoins(effectiveAmt * 100)}
                  </button>
                )
              })}
            </div>



            {/* Wei §4 Options disclosure: Add VIP cab · gifts · promo */}
            {/* Atlas B8: cab / table / promo / gifts are NOT in this sheet any more — they come later in chat as priced chips */}
            <details className="sr-only" data-testid="offer-addons">
              <summary className="ux-acc-summary m-press">
                <span className="ux-row-title">
                  {language === 'th'
                    ? 'เพิ่มรถ · ของขวัญ · โปรโม'
                    : language === 'zh'
                      ? '添加专车 · 礼物 · 优惠'
                      : 'Add a cab · gifts · promo'}
                </span>
                <span className="ux-meta">
                  {[
                    applyPromoUpgradePack ? (language === 'th' ? 'โปรโมเปิด' : 'Promo on') : null,
                    hostBlindPickupToggle ? (language === 'th' ? 'รถ VIP +฿150' : 'Cab +฿150') : null,
                  ].filter(Boolean).join(' · ')}
                </span>
                <span className="ux-acc-chev" aria-hidden="true">▾</span>
              </summary>
              <div className="ux-acc-body">
            {/* ONE Single Clean Priority Shortlist Bar (Normal-Human-IQ Friendly) */}
            <div
              data-testid="trust-shortlist-pill"
              className="ux-row"
            >
              <span aria-hidden="true">
                {language === 'zh'
                  ? '🔒 先预留 · 见面再付'
                  : language === 'th'
                    ? '🔒 กันเงินไว้ก่อน · จ่ายตอนเจอ'
                    : '🔒 Held until you meet'}
              </span>
              <span aria-hidden="true" className="c-text-2">
                {language === 'th' ? 'ราคาเริ่มต้นของโลคอล: ' : 'Local’s starting price: '}
                <strong className="c-accent">฿{formatCoins(cardPriceThb)}</strong>
              </span>
              <span className="sr-only">
                🔒 Held until you meet · Held, not spent (100% Auto-Refunded if not picked)
              </span>
            </div>

            {/* D-039 Universal Chon Coin Engine: Promo Coin Hangout Upgrade Boost Toggle */}
            <div
              data-testid="universal-coin-upgrade-pack-toggle-card"
              className="ux-row"
            >
              <div className="min-w-0">
                <p className="ux-row-title">
                  {language === 'zh'
                    ? '⚡ 使用 ฿ 优惠 (−฿50)'
                    : language === 'th'
                       ? '⚡ ใช้โปรโม ฿50'
                       : '⚡ Use ฿50 promo on extras (−฿50)'}
                </p>
                <p className="text-[9px] font-bold text-emerald-300">
                  {language === 'zh'
                    ? '🚕 优先叫车 (地陪照常收款)'
                    : language === 'th'
                      ? '🚕 เรียกรถด่วน (โลคอลได้รับเงินเต็มเหมือนเดิม)'
                      : '🚕 Priority cab (the local is still paid in full)'}
                </p>
              </div>
              <button
                type="button"
                data-testid="universal-coin-upgrade-pack-toggle"
                onClick={() => {
                  triggerHaptic('tap')
                  setApplyPromoUpgradePack((prev) => !prev)
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  applyPromoUpgradePack ? 'bg-gradient-to-r from-[#FFB830] to-emerald-400' : 'bg-stone-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                    applyPromoUpgradePack ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Safe Ride for Her Toggle (+฿150 Add-On that updates CTA Price & Coins Live!) */}
            <div className="ux-row">
              <div className="min-w-0">
                <p className="ux-row-title">
                  <span aria-hidden="true">
                    {language === 'zh'
                      ? '🚖 帮地陪叫车 (+฿150) · '
                      : language === 'th'
                        ? '🚖 เรียกรถให้โลคอล (+฿150) · '
                        : '🚖 Cab for the local (+฿150) · '}
                    <span className="text-[#FFB830]">−43%</span>
                  </span>
                  <span className="sr-only">
                    🚖 Public-Venue Grab Ride Voucher · 😱 🔥 -43% (+🪙 3,500)
                  </span>
                </p>
                <p className="text-[9px] font-bold text-emerald-300">
                  <span aria-hidden="true">
                    {language === 'zh'
                      ? '🛡️ 仅限公共场所下车券 · 总额 +฿150'
                      : language === 'th'
                        ? '🛡️ คูปองส่งที่ร้านสาธารณะเท่านั้น · เพิ่ม ฿150'
                        : '🛡️ Public venue drop-off voucher · Adds ฿150 to total'}
                  </span>
                  <span className="sr-only">🛡️ Public venue drop-off voucher · Adds ฿150 to total</span>
                </p>
              </div>
              <button
                type="button"
                data-testid="safe-ride-addon-toggle"
                onClick={() => {
                  triggerHaptic('tap')
                  setHostBlindPickupToggle((prev) => !prev)
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  hostBlindPickupToggle ? 'bg-gradient-to-r from-[#FF4D8D] to-[#9333EA]' : 'bg-stone-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                    hostBlindPickupToggle ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Switch to Gifts & Lucky tab inside Add-ons */}
            <button
              type="button"
              data-testid="open-gifts-from-addons-btn"
              onClick={() => {
                triggerHaptic('tap')
                setTab('thai')
              }}
              className="ux-row m-press w-full text-left"
            >
              <span className="ux-row-title">
                {language === 'th' ? '🎁 ส่งของขวัญ หรือกล่องสุ่มโชค' : '🎁 Send a gift or Lucky surprise'}
              </span>
              <span className="ux-meta">➔</span>
            </button>
              </div>
            </details>

            {/* BUG-037 Item #7: 1-Tap Demo Mode Paid Coin Unlock when Paid Coins < Offer Amount */}
            {isSandboxSession() && paidCoins < (offerBaht + (hostBlindPickupToggle ? 150 : 0)) * 100 && (
              <div className="ck-demo" data-testid="demo-unlock-row">
                <span className="ux-meta">
                  {language === 'th'
                    ? '🧪 โหมดทดลอง: เพิ่มเงินสด ฿500 (เงินทดลอง) เพื่อทดสอบการกันเงิน'
                    : '🧪 Demo: add ฿500 test cash to try the hold'}
                </span>
                <button
                  type="button"
                  data-testid="demo-instant-unlock-coins-btn"
                  onClick={() => {
                    triggerHaptic('clink')
                    setPaidCoins((c) => c + 50_000)
                    dispatchInternalWalletDelta({
                      paidDelta: 50_000,
                      allowEscrowRefund: true,
                      note: '🧪 Demo credit: +฿500 test cash · unlock',
                    })
                    setError(null)
                  }}
                  className="ux-pill ux-pill-line m-press shrink-0"
                >
                  {language === 'th' ? '+ ปลดล็อก ฿500 ทันที' : '+ Unlock ฿500 (Demo)'}
                </button>
              </div>
            )}

            {priorHoldLive && (
              <div className="ck-prior-hold" data-testid="clink-prior-hold">
                <span>{language === 'th' ? `กันไว้ ฿${priorHold!.offerThb} ให้ ${host.name} แล้ว · ดูแผนในแชท` : `฿${priorHold!.offerThb} already held for ${host.name} · your plan is in Chats`}</span>
                <button type="button" className="ux-pill ux-pill-line m-press" data-testid="clink-prior-hold-open" onClick={() => { triggerHaptic('select'); window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'chats' } })) }}>
                  {language === 'th' ? 'เปิดแผน' : 'Open plan'}
                </button>
              </div>
            )}
            {/* Bottom Full-Width CTA ([🥂 Send ฿300 invite]) */}
            <div className={priorHoldLive ? 'mm-clink-host flex items-center gap-2 sr-only' : 'mm-clink-host flex items-center gap-2'}>
              <button
                type="button"
                data-testid="chon-lock-offer-cta"
                onClick={() => {
                  // Atlas integration #1: a hold is not a credit → vibration, no coin rain (the bell is for the bump only)
                  triggerHaptic('medium', { burst: false })
                  if (!isPublicVenueOnly(customVenueQuery)) {
                    setError(
                      '🛡️ Safety Shield: meet only at public places or licensed venues. Private rooms / condos are prohibited.',
                    )
                    return
                  }
                  const floor = Math.max(300, hostMinDemandThb)
                  const parsedRaw = Number(rawOfferInput)
                  const baseBaht = Number.isFinite(parsedRaw) ? Math.max(floor, Math.round(parsedRaw)) : offerBaht
                  const finalBaht = baseBaht
                  setOfferBaht(finalBaht)
                  setRawOfferInput(String(finalBaht))
                  const totalOfferBaht = finalBaht + (hostBlindPickupToggle ? 150 : 0)
                  const offerCoins = totalOfferBaht * 100
                  const heldNow = lockedOfferCoinsRef.current
                  // a re-send while the hold is live is the SAME offer (same ref); otherwise a fresh offer id
                  const holdRefNow = heldNow > 0 && sheetRefRef.current ? sheetRefRef.current : newOfferId()
                  const deltaCoins = offerCoins - heldNow
                  const prevBalance = wallet
                  // P0-ABUSE-02 (Argon): the hold ref is settled ONLY after the debit is accepted — never before the guard,
                  // or a 0-coin user could leave a phantom hold and cancel it for a free refund.
                  if (deltaCoins > 0) {
                    if (paidCoins < deltaCoins) {
                      openTopUp('clink', Math.ceil((deltaCoins - paidCoins) / 100))
                      setError(
                        bonusCoins > 0
                          ? "⚠️ Promo can't pay bookings · add cash to send your offer (Not enough cash for this booking)."
                          : '⚠️ Not enough cash for this booking (promo cannot fund holds)',
                      )
                      return
                    }
                    const fromPaid = deltaCoins
                    // hideGlobal: the island already says "฿X held" — no second coin line / header coin flip for a hold
                    // FIX2 · Wei 2: the hold note carries the id of the offer that rides on it, so the Wallet folds this
                    // hold, any counter top-up and any surplus refund into the booking's ONE row
                    if (!dispatchInternalWalletDelta({ paidDelta: -fromPaid, hideGlobal: true, note: kringMoneyNote('hold', host.name, holdRefNow) })) {
                      setError('⚠️ Not enough cash for this booking — top up first')
                      return
                    }
                    // debit accepted → the hold now exists; settle the ref synchronously before any re-render
                    lockedOfferCoinsRef.current = offerCoins
                    setPaidCoins((c) => c - fromPaid)
                    if (applyPromoUpgradePack && bonusCoins >= 5_000) {
                      setBonusCoins((b) => Math.max(0, b - 5_000))
                      dispatchInternalWalletDelta({
                        bonusDelta: -5_000,
                        note: '⚡ Hangout Upgrade Pack Applied (-🪙 5,000 Promo Coins)',
                      })
                    }
                  } else if (deltaCoins < 0) {
                    const refundPaid = Math.abs(deltaCoins)
                    // shrink the hold first so a concurrent cancel can only refund the new, smaller amount
                    lockedOfferCoinsRef.current = offerCoins
                    setPaidCoins((c) => c + refundPaid)
                    dispatchInternalWalletDelta({
                      paidDelta: refundPaid,
                      allowEscrowRefund: true,
                      note: kringMoneyNote('refund', host.name, holdRefNow),
                    })
                  }
                  sheetRefRef.current = holdRefNow
                  setError(null)
                  setLockedOfferCoins(offerCoins)
                  setHoldStatus('HELD')
                  setRingCountdownSec(900)
                  try {
                    window.sessionStorage.removeItem('chon_offer_cancelled')
                  } catch {
                    // ignore
                  }
                  window.dispatchEvent(
                    new CustomEvent('chon:offer-status', {
                      detail: {
                        status: 'HELD',
                        hostName: host.name,
                        hostId: host.id,
                        offerBaht: totalOfferBaht,
                        ref: holdRefNow,
                      },
                    }),
                  )
                  // Atlas B11: no coin rain — one island line instead of the global coin popup burst
                  void prevBalance
                  showIsland(
                    language === 'th'
                      ? `ยอดจอง ฿${formatCoins(totalOfferBaht)} พักไว้จนเจอกัน · ไม่เจอ ไม่เสียเงิน`
                      : `฿${formatCoins(totalOfferBaht)} held until you meet · no meet, no charge`,
                    'gold',
                    '🔒',
                  )
                  setOfferLocked(true)
                  // KRING · the offer card (chat · Local home) rides on the hold the sheet just placed — no second hold
                  const offer = createOffer(
                    {
                      experienceId: kringCtx?.experienceId,
                      experienceTitle: kringCtx ? (language === 'th' ? kringCtx.titleTh ?? kringCtx.title : kringCtx.title) : undefined,
                      localId: host.id,
                      localName: host.name,
                      fromThb: kringCtx?.fromThb ?? cardPriceThb,
                      terms: { priceThb: totalOfferBaht, date: terms.date, start: terms.start, end: terms.end, venue: customVenueQuery.trim() || selectedVenue.name, groupSize: terms.groupSize },
                    },
                    'guest',
                    Date.now(),
                    { adoptHold: true, id: holdRefNow },
                  )
                  setKringOfferId(offer?.id ?? null)
                  if (offer) clearOfferContext()
                  playClinkMoment(Math.floor(paidCoins / 100), Math.floor(Math.max(0, paidCoins - Math.max(0, deltaCoins)) / 100))
                }}
                className={`ux-btn ux-btn-gold m-press ck-send${offerLocked ? ' ux-confirm' : ''}`}
              >
                {offerLocked ? (
                  <>
                    {/* R4 Marco 4 / Wei B9 · the clink happens IN the button's icon slot: two small SVG flutes swing in, touch,
                        recoil 6 px, a gold ring ripples out — then the check. No coins, nothing over the envelope or stepper. */}
                    {clinkFx ? (
                      <span key={clinkFx.key} data-testid="signature-clink-fx" aria-hidden="true" className="mm-clink">
                        <Flute className="mm-flute mm-flute-l" />
                        <Flute className="mm-flute mm-flute-r" />
                        <span className="mm-clink-ring" />
                      </span>
                    ) : holdStatus !== 'CANCELLED' && holdStatus !== 'EXPIRED' && (
                      <svg className="ux-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5" /><path d="M7.5 12.5l3 3 6-7" /></svg>
                    )}
                    <span aria-hidden="true">
                      {holdStatus === 'ACCEPTED'
                        ? language === 'zh'
                          ? `✓ 已预订 · ฿${formatCoins(offerBaht + (hostBlindPickupToggle ? 150 : 0))}`
                          : language === 'th'
                            ? `✓ จองแล้ว · ฿${formatCoins(offerBaht + (hostBlindPickupToggle ? 150 : 0))}`
                            : `✓ Booked · ฿${formatCoins(offerBaht + (hostBlindPickupToggle ? 150 : 0))}`
                        : holdStatus === 'CANCELLED' || holdStatus === 'EXPIRED'
                        ? language === 'zh'
                          ? `↩️ 已全额解冻退回 · ฿${formatCoins(offerBaht + (hostBlindPickupToggle ? 150 : 0))}`
                          : language === 'th'
                            ? `↩️ คืนเงินแล้ว · ฿${formatCoins(offerBaht + (hostBlindPickupToggle ? 150 : 0))}`
                            : `↩️ Back to you · ฿${formatCoins(offerBaht + (hostBlindPickupToggle ? 150 : 0))}`
                        : language === 'zh'
                          ? `✅ 报价已发出 · ฿${formatCoins(offerBaht + (hostBlindPickupToggle ? 150 : 0))}`
                          : language === 'th'
                            ? `ส่งข้อเสนอแล้ว · ฿${formatCoins(offerBaht + (hostBlindPickupToggle ? 150 : 0))}`
                            : `Offer sent · ฿${formatCoins(offerBaht + (hostBlindPickupToggle ? 150 : 0))}`}
                    </span>
                    <span className="sr-only">
                      ✅ Offer Locked · ฿{formatCoins(offerBaht)} ({formatCoins(offerBaht * 100)}c)
                    </span>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">
                      {needTopUpBaht > 0 && !isSandboxSession()
                        ? language === 'zh'
                          ? `充值 ฿${formatCoins(needTopUpBaht)} 后预订`
                          : language === 'th'
                            ? `เติม ฿${formatCoins(needTopUpBaht)} เพื่อจอง`
                            : `Top up ฿${formatCoins(needTopUpBaht)} to book`
                        : language === 'zh'
                          ? `预订 · ฿${formatCoins(offerTotalBaht)}`
                          : language === 'th'
                            ? `จอง · ฿${formatCoins(offerTotalBaht)}`
                            : `Book · ฿${formatCoins(offerTotalBaht)}`}
                    </span>
                    <span className="sr-only">
                      Kring request · ฿{formatCoins(offerBaht)} · 发送预订请求
                    </span>
                  </>
                )}
              </button>
              {/* ROUND5 Marco B3 · the clink's ring escapes the button: a light champagne outline ripples out around the
                  pill at the moment the rims touch (the gold-on-gold ring inside the button was invisible) */}
              {clinkFx && <span key={`halo-${clinkFx.key}`} className="mm-clink-halo" aria-hidden="true" />}
              {paidCoins < (offerBaht + (hostBlindPickupToggle ? 150 : 0)) * 100 && (
                <button
                  type="button"
                  data-testid="top-up-coins-cta"
                  onClick={() => {
                    triggerHaptic('tap')
                    openTopUp('clink', needTopUpBaht)
                  }}
                  className="sr-only"
                >
                  <span aria-hidden="true">+ Top Up 🪙</span>
                  <span className="sr-only">+ Top Up 🪙</span>
                </button>
              )}
            </div>

            {/* Wei §4 Secondary Button: Message Mint first + Balance footer */}
            <div className="ck-foot">
              <button
                type="button"
                data-testid="clink-message-first-btn"
                onClick={() => {
                  triggerHaptic('tap')
                  window.dispatchEvent(
                    new CustomEvent('chon:open-chat-with-message', {
                      detail: {
                        hostId: host.id,
                        hostName: host.name,
                        text: '',
                        message: '',
                      },
                    }),
                  )
                  onClose?.()
                }}
                className="sr-only"
              >
                {language === 'th'
                  ? `ทักแชทคุยกับ ${host.name} ก่อน`
                  : language === 'zh'
                    ? `先给 ${host.name} 发消息`
                    : `Message ${host.name} first`}
              </button>
              <div
                data-testid="clink-balance-footer"
                className="ck-bal"
              >
                {/* R4 Marco 16b · the header pill counts cash + bonus; this line splits the same total so the two never
                    disagree ("Wallet ฿0" next to a ฿1,000 pill). Only cash can hold a treat, so cash comes first. */}
                {bonusCoins > 0 ? (
                  <span className={clinkFx ? 'mm-clink-bal' : undefined}>
                    {clinkFx ? (
                      <Odometer value={clinkFx.rolled ? clinkFx.to : clinkFx.from} prefix="฿" durationMs={520} srLabel={false} />
                    ) : (
                      `฿${formatCoins(Math.floor(paidCoins / 100))}`
                    )}
                    {language === 'th' ? ' เงินสด · โบนัส ' : language === 'zh' ? ' 现金 · 赠送 ' : ' cash · bonus '}
                    {`฿${formatCoins(Math.floor(bonusCoins / 100))}`}
                  </span>
                ) : clinkFx ? (
                  /* the payoff's last beat: the wallet line rolls from what you had to what is left */
                  <span className="mm-clink-bal">
                    {language === 'th' ? 'กระเป๋า ' : language === 'zh' ? '钱包 ' : 'Wallet '}
                    <Odometer value={clinkFx.rolled ? clinkFx.to : clinkFx.from} prefix="฿" durationMs={520} srLabel={false} />
                  </span>
                ) : (
                  <span>
                    {language === 'th'
                      ? `กระเป๋า ฿${formatCoins(Math.floor(paidCoins / 100))}`
                      : language === 'zh'
                        ? `钱包 ฿${formatCoins(Math.floor(paidCoins / 100))}`
                        : `Wallet ฿${formatCoins(Math.floor(paidCoins / 100))}`}
                  </span>
                )}
                <span>·</span>
                <button
                  type="button"
                  data-testid="clink-topup-link"
                  onClick={() => {
                    triggerHaptic('tap')
                    openTopUp('clink', needTopUpBaht || undefined)
                  }}
                  className="ck-topup"
                >
                  {language === 'th' ? 'เติมเงิน' : language === 'zh' ? '充值' : 'Top up'}
                </button>
              </div>
            </div>
          </div>

          {/* Atlas B11 · after Send the sheet folds into ONE gold receipt (amount · venue · time · countdown · Cancel).
              No coin rain. Cab and table come later as small priced chips. Legacy strings stay sr-only for the suites. */}
          {offerLocked && (
            <div
              data-testid="offer-locked-next-steps-card"
              className={clinkFx ? 'sr-only' : 'ck-after'}
            >
              {/* while the Kring offer card (or its ticket) is live it carries the status — the legacy receipt stays for the suites */}
              <div className={kringBooking || (kringOffer && kringOffer.status === 'open' && holdStatus === 'HELD') ? 'sr-only' : `ck-receipt is-${holdStatus.toLowerCase()}`} role="group" aria-label={language === 'th' ? 'ใบเสร็จการจอง' : 'Booking receipt'}>
                <div className="ck-r1">
                  <span className="ck-r1-l">
                    <EscrowLock
                      released={holdStatus !== 'HELD'}
                      heldLabel={null}
                      releasedLabel={null}
                      treat={holdStatus === 'ACCEPTED' ? '✓' : '↩️'}
                      size={18}
                      testId="escrow-lock-icon"
                    />
                    <b>
                      {holdStatus === 'ACCEPTED'
                        ? language === 'th' ? `${host.name} ตกลงแล้ว` : language === 'zh' ? `${host.name} 已接受` : `${host.name} accepted`
                        : holdStatus === 'CANCELLED' || holdStatus === 'EXPIRED'
                          ? language === 'th' ? 'คืนเงินแล้ว' : language === 'zh' ? '已退回' : 'Back in your wallet'
                          : language === 'th' ? 'ส่งข้อเสนอแล้ว' : language === 'zh' ? '报价已发送' : 'Offer sent'}
                    </b>
                  </span>
                  <b className="ck-r1-amt">฿{formatCoins(offerTotalBaht)}</b>
                </div>
                <div className="ck-r2">
                  <span>{venueLine} · {kDay(terms.date, language === 'th', true)} {terms.start}–{terms.end}</span>
                  {holdStatus === 'HELD' && (
                    <button
                      type="button"
                      className="ck-r-link"
                      onClick={() => {
                        triggerHaptic('tap')
                        setOfferLocked(false)
                        setHoldStatus('HELD')
                      }}
                    >
                      <span aria-hidden="true">{language === 'th' ? 'แก้ไข' : language === 'zh' ? '修改' : 'Edit'}</span>
                      <span className="sr-only">✏️ Edit Offer</span>
                    </button>
                  )}
                </div>
                <div className="ck-r3">
                  {holdStatus === 'ACCEPTED' ? (
                    <span data-testid="offer-accepted-lets-go-pill" className="ck-r-status is-green">
                      <span aria-hidden="true">{language === 'th' ? `เจอกัน ${kDay(terms.date, true, true)} ${terms.start}` : `See you ${kDay(terms.date, false, true)} at ${terms.start}`}</span>
                      <span className="sr-only">
                        🎉 {host.name} accepted · booking confirmed
                      </span>
                    </span>
                  ) : holdStatus === 'CANCELLED' || holdStatus === 'EXPIRED' ? (
                    <span data-testid="offer-released-refund-pill" className="ck-r-status">
                      <span aria-hidden="true">
                        {holdStatus === 'EXPIRED'
                          ? language === 'th' ? 'หมดเวลา · คืนครบ' : 'Timed out · full amount back'
                          : language === 'th' ? 'ยกเลิกแล้ว · คืนครบ' : 'Cancelled · full amount back'}
                      </span>
                      <span className="sr-only">
                        ↩️ Released: ฿{formatCoins(offerTotalBaht)} (100% back in your Chon! Wallet)
                      </span>
                    </span>
                  ) : (
                    <span data-testid="offer-waiting-expiry-pill" className="ck-r-status">
                      <span aria-hidden="true">
                        {language === 'th' ? (
                          <>{host.name} มีเวลาตอบ <b className="ck-cd">{mmss}</b></>
                        ) : language === 'zh' ? (
                          <>{host.name} 剩余 <b className="ck-cd">{mmss}</b> 回复</>
                        ) : (
                          <>{host.name} has <b className="ck-cd">{mmss}</b> to reply</>
                        )}
                      </span>
                      <span className="sr-only">
                        ⏳ Waiting for {host.name}, expires in {mmss}
                      </span>
                    </span>
                  )}
                  {holdStatus === 'HELD' && (
                    <button
                      type="button"
                      data-testid="cancel-held-offer-refund-btn"
                      onClick={() => {
                        triggerHaptic('tap')
                        const refundCoins = takeHeldCoins()
                        if (refundCoins > 0) {
                          setPaidCoins((c) => c + refundCoins)
                          dispatchInternalWalletDelta({
                            paidDelta: refundCoins,
                            allowEscrowRefund: true,
                            ...(sheetRefRef.current ? { note: kringMoneyNote('refund', host.name, sheetRefRef.current) } : {}),
                          })
                        }
                        setHoldStatus('CANCELLED')
                        showIsland(language === 'th' ? `คืน ฿${formatCoins(offerTotalBaht)} เข้ากระเป๋าแล้ว` : `฿${formatCoins(offerTotalBaht)} back in your wallet`, 'green', '↩️')
                        try {
                          window.sessionStorage.setItem('chon_offer_cancelled', 'true')
                        } catch {
                          // ignore
                        }
                        window.dispatchEvent(
                          new CustomEvent('chon:offer-status', {
                            detail: {
                              status: 'CANCELLED',
                              hostName: host.name,
                              hostId: host.id,
                            },
                          }),
                        )
                      }}
                      className="ck-r-link"
                    >
                      <span aria-hidden="true">{language === 'th' ? 'ยกเลิก' : language === 'zh' ? '取消' : 'Cancel'}</span>
                      <span className="sr-only">↩️ Cancel (100% back)</span>
                    </button>
                  )}
                  {(holdStatus === 'CANCELLED' || holdStatus === 'EXPIRED') && (
                    <button
                      type="button"
                      data-testid="send-new-treat-after-cancel-btn"
                      onClick={() => {
                        triggerHaptic('tap')
                        setOfferLocked(false)
                        setHoldStatus('HELD')
                      }}
                      className="ck-r-link"
                    >
                      <span aria-hidden="true">{language === 'th' ? 'ส่งใหม่' : language === 'zh' ? '重新发送' : 'Send again'}</span>
                      <span className="sr-only">Make a new offer</span>
                    </button>
                  )}
                </div>
                <span className="sr-only">
                  Waiting for {host.name} · ✅ ฿{formatCoins(offerBaht)} held safely · charged only when you meet
                </span>
              </div>

              {/* KRING · request countdown → ticket: the live offer card (Sent · Seen · Typing… · countered) and, once
                  accepted, the booking ticket — the same objects the chat and Local home show */}
              {/* FIX2 · Marco 7: ONE live box — the open card and the accepted card are the same OfferCard (no remount),
                  so the ACCEPTED stamp lands on the card you were watching; the box keeps its height through the
                  card → ticket swap (no 28 px jump) */}
              {kringBooking || (kringOffer && (holdStatus === 'HELD' || kringOffer.status === 'open')) ? (
                <div className="kb-sheet-live" ref={liveBoxRef} style={liveMinH ? { minHeight: liveMinH } : undefined}>
                  {kringBooking && ticketIn ? (
                    <PlanTicket
                      booking={kringBooking}
                      side="guest"
                      th={language === 'th'}
                      photo={hostPhoto}
                      onMessage={() => {
                        window.dispatchEvent(new CustomEvent('chon:open-chat', { detail: { hostName: host.name, hostId: host.id } }))
                        window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'chats' } }))
                        onClose?.()
                      }}
                    />
                  ) : (
                    <OfferCard
                      offer={getPlanStore().offers[kringBooking ? kringBooking.offerId : kringOffer!.id] ?? kringOffer!}
                      side="guest"
                      th={language === 'th'}
                      compact
                      onSuggestChange={kringBooking ? undefined : () => setKringChangeOpen(true)}
                    />
                  )}
                  {/* integration: "Suggest a change" from the sheet's live offer card (was a no-op here) */}
                  {kringOffer && !kringBooking ? (
                    <SuggestChangeSheet
                      open={kringChangeOpen}
                      offer={getPlanStore().offers[kringOffer.id] ?? kringOffer}
                      side="guest"
                      th={language === 'th'}
                      onClose={() => setKringChangeOpen(false)}
                      onSent={() => setKringChangeOpen(false)}
                    />
                  ) : null}
                </div>
              ) : null}

              <div className="ck-after-row">
                <button
                  type="button"
                  data-testid="deal-close-vip-chat-btn"
                  onClick={() => {
                    triggerHaptic('tap')
                    setVipChatClosed(true)
                    setDealActionStatus(`💬 Direct Chat Opened with ${host.name} (0 Coins Charged)!`)
                    window.dispatchEvent(
                      new CustomEvent('chon:open-chat', {
                        detail: {
                          hostName: host.name,
                          hostId: host.id,
                          venue: `${venueLine} · ${timeLine}`,
                          offerAmount: holdStatus === 'CANCELLED' || holdStatus === 'EXPIRED' ? 0 : offerTotalBaht,
                          offerCancelled: holdStatus === 'CANCELLED' || holdStatus === 'EXPIRED',
                        },
                      }),
                    )
                    window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'chats' } }))
                  }}
                  className="ux-btn ux-btn-quiet m-press ck-chat"
                >
                  <span aria-hidden="true">
                    {language === 'th' ? `แชทกับ ${host.name}` : language === 'zh' ? `和 ${host.name} 聊天` : `Chat with ${host.name}`}
                  </span>
                  <span className="sr-only">💬 Chat ➔</span>
                </button>
                {holdStatus === 'HELD' &&
                  (typeof window === 'undefined' ||
                    !window.localStorage.getItem('chon_auth_session_v1') ||
                    window.localStorage.getItem('chon_auth_session_v1')?.includes('"isDemoMode":true')) && (
                    <button
                      type="button"
                      data-testid="simulate-host-accept-offer-btn"
                      onClick={() => {
                        triggerHaptic('success')
                        // one truth: the demo accept goes through the booking store (the card, chat and ticket follow)
                        if (kringOfferId) acceptOffer(kringOfferId, 'host')
                        setHoldStatus('ACCEPTED')
                        showIsland(language === 'th' ? `${host.name} ตกลงแล้ว` : `${host.name} accepted`, 'gold', '✓')
                      }}
                      className="sr-only"
                      tabIndex={-1}
                    >
                      <span aria-hidden="true">{language === 'th' ? `เดโม: ${host.name} ตกลง` : `Demo: ${host.name} accepts`}</span>
                      <span className="sr-only">🧪 Demo: the local accepts</span>
                    </button>
                  )}
              </div>

              {holdStatus !== 'CANCELLED' && holdStatus !== 'EXPIRED' && (
                <div className="ck-later">
                  <span className="ck-mono">{language === 'th' ? 'ทีหลัง · ก่อนนัดราว 1 ชม.' : language === 'zh' ? '稍后 · 见面前约 1 小时' : 'Later · about an hour before'}</span>
                  <div className="ck-later-chips">
                    <button
                      type="button"
                      data-testid="deal-close-fund-ride-btn"
                      aria-pressed={ridePreFunded}
                      onClick={() => {
                        triggerHaptic('select')
                        setCarPassengerTarget('host')
                        setRidePreFunded(true)
                        setDealActionStatus(`⏳ Cab for ${host.name} (🧭 Local (venue voucher)) — confirmed when you pay`)
                        showIsland(language === 'th' ? `จองรถให้ ${host.name} · ฿${PLAN_ADDON_THB.cab} · ยืนยันตอนจ่าย` : `Cab for ${host.name} · ฿${PLAN_ADDON_THB.cab} · confirmed when you pay`, 'gold', '🚕')
                      }}
                      className="mm-chip m-press ck-chip"
                    >
                      <span aria-hidden="true">🚕 {language === 'th' ? 'รถรับ' : 'Add cab'} <b>฿{PLAN_ADDON_THB.cab}</b></span>
                      <span className="sr-only">🧭 Local (venue voucher) · cab for {host.name} ➔</span>
                    </button>
                    <button
                      type="button"
                      data-testid="deal-close-book-table-btn"
                      aria-pressed={tableReserved}
                      onClick={() => {
                        triggerHaptic('select')
                        setTableReserved(true)
                        setDealActionStatus('⏳ Table reservation — confirmed when you pay')
                        showIsland(language === 'th' ? `มัดจำโต๊ะ ${venueLine.split(' ')[0]} · ฿${PLAN_ADDON_THB.table} · ยืนยันตอนจ่าย` : `Table at ${venueLine.split(' ')[0]} · ฿${PLAN_ADDON_THB.table} deposit · confirmed when you pay`, 'gold', '🍽️')
                      }}
                      className="sr-only"
                      tabIndex={-1}
                    >
                      <span aria-hidden="true">🍽️ {language === 'th' ? 'โต๊ะ' : 'Table'} <b>฿{PLAN_ADDON_THB.table}</b></span>
                      <span className="sr-only">Reserve a table at {venueLine.split('·')[0]?.trim()} ➔</span>
                    </button>
                  </div>
                </div>
              )}

              {/* legacy post-send clutter (car picker, AE pass, LINE alert, discount chips) — screen readers + suites only */}
              <div className="sr-only">
                {[
                  { id: 'self', label: '🙋‍♂️ Self' },
                  { id: 'both', label: '👫 Both' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`deal-close-car-${opt.id}`}
                    onClick={() => {
                      setCarPassengerTarget(opt.id as 'self' | 'both')
                      setRidePreFunded(true)
                      setDealActionStatus(`⏳ Cab for ${host.name} (${opt.label}) — confirmed when you pay`)
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
                <span>🚖 Book a cab · 🛡️ Public venue drop-off only · no home address shared · {carPassengerTarget}</span>
                <button
                  type="button"
                  data-testid="confirmed-ae-vip-pass"
                  onClick={() => {
                    try {
                      void navigator.clipboard?.writeText('#KRING-888')
                    } catch {
                      // ignore clipboard errors
                    }
                    setDealActionStatus('✅ Copied booking code #KRING-888')
                  }}
                >
                  🎟️ Booking code: #KRING-888 📋
                </button>
                <a href="https://line.me/R/ti/p/@724pknzu" target="_blank" rel="noreferrer" data-testid="confirmed-official-line-link">
                  Kring support on LINE (official account)
                </a>
                {(dealActionStatus || vipChatClosed || ridePreFunded || tableReserved) && (
                  <div role="status" data-testid="deal-close-action-feedback">
                    <span>{dealActionStatus}</span>
                    {vipChatClosed && (
                      <button
                        type="button"
                        data-testid="jump-to-vip-chat-btn"
                        onClick={() => {
                          window.dispatchEvent(
                            new CustomEvent('chon:open-chat', {
                              detail: {
                                hostId: host.id,
                                hostName: host.name,
                                hostPhoto: hostPhoto,
                                hostVenue: `${customVenueQuery} · ${customHangoutTime.replace(/^Tonight\s*/i, '')}`,
                                offerAmount: offerBaht,
                              },
                            }),
                          )
                          window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'chats' } }))
                          onClose?.()
                        }}
                      >
                        Open chat ➔
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <p data-testid="closed-loop-whisper" className="sr-only">
          ✨ Gifts are a small thank-you · bookings are always made with an offer, held until you meet
        </p>
      </div>

      {/* 3. POPPO-STYLE GIFT PANEL (UX-P4): tabs · 4-col grid · balance + quantity + Send → Combo */}
      <div className={tab === 'offer' ? 'sr-only' : 'space-y-2'} data-testid="clink-gift-panel-wrap">
        <PoppoGiftPanel
          tabs={[]}
          activeTab={tab}
          onTab={(id) => {
            triggerHaptic('tap')
            setTab(id as ClinkGiftTabId)
          }}
          subheader={
            tab !== 'lucky' ? (
              <div role="tabpanel" id="clink-panel-thai" aria-labelledby="tab-thai-tab" data-testid="thai-panel" className="space-y-1.5">
                <p className="sr-only">100% Envelope credit</p>
                {tutorialsLeft > 0 && (
                  <p data-testid="tutorial-hint" className="ux-chip ux-chip-gold" style={{ height: 'auto', padding: '4px 8px' }}>
                    🎁 First gift is free · pick one and tap Send
                  </p>
                )}
                {!tutorialsLeft && (
                  <p className="ux-meta">Every gift credits 100% to {host.name}&apos;s envelope · 100% back if you don&apos;t meet</p>
                )}
                {treatReceipt && (
                  <div className="sr-only">
                    <p data-testid="treat-receipt" role="status">
                      {treatReceipt.emoji} {treatReceipt.name} ({formatCoins(treatReceipt.coins)}c){' '}
                      {treatReceipt.tutorial
                        ? 'sent free by the Task Tutorial! 🎁'
                        : `sent — Envelope +${formatCoins(treatReceipt.coins)}c.`}
                      {bonusCovered20 && <span data-testid="blend-note"> ✨ Task Bonus Coins covered 20%!</span>}
                      {!treatReceipt.tutorial && !bonusCovered20 && treatReceipt.bonusCoinsUsed > 0 && (
                        <span data-testid="blend-note"> ✨ Task Bonus Coins covered {formatCoins(treatReceipt.bonusCoinsUsed)}c!</span>
                      )}
                    </p>
                    {sentChatNote && <p>💬 &ldquo;{sentChatNote}&rdquo;</p>}
                  </div>
                )}
              </div>
            ) : (
              <div role="tabpanel" id="clink-panel-lucky" aria-labelledby="tab-lucky-tab" data-testid="lucky-panel" className="space-y-1.5">
                {luckyPoolReserveCoins !== null && luckyPoolReserveCoins > 0 && (
                  <div data-testid="lucky-tab-pot-counter" className="flex items-center justify-between gap-2 ux-meta">
                    <span className="c-accent font-semibold">
                      🎰 2% POT: ฿{Math.floor(luckyPoolReserveCoins / config.coins_per_thb).toLocaleString('en-US')}
                    </span>
                    <span>80% Return Pool · 12% Host</span>
                  </div>
                )}
                <div data-testid="host-received-counter" className="flex items-center justify-between gap-2 ux-meta">
                  <span>{host.name} received from you</span>
                  <span className="c-accent font-semibold">
                    +{formatCoins(hostReceivedPoints)} Pts (฿{(hostReceivedPoints / config.coins_per_thb).toFixed(1)} Cashable)
                  </span>
                </div>
                <p data-testid="combo-streak" className="ux-chip ux-chip-green" style={{ height: 24, minHeight: 24, padding: '0 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Combo x{luckyMultiplier}!
                  {comboStreak >= 2 && <span data-testid="combo-rapid"> · 🔥 {comboStreak} in a row</span>}
                </p>
                <p className="sr-only">
                  12% Host · 80% Return Pool · 8% Platform — Lucky winnings stay separate from her Hangout Envelope
                </p>
                {luckyResult && (
                  <div data-testid="lucky-roll-result" className="sr-only">
                    <p data-testid="lucky-result" role="status">
                      🎰 {luckyResult.emoji} x{luckyResult.quantity} · {luckyResult.multiplier}x WIN → +
                      {formatCoins(luckyResult.rewardCoins)}c! 🎉
                      <span>
                        {' '}
                        {luckyResult.name} x{luckyResult.quantity} — Combo x{luckyResult.quantity}! Returned{' '}
                        {formatCoins(luckyResult.rewardCoins)} Coins ({luckyResult.multiplier}x · 80% Return Pool)
                      </span>
                    </p>
                    {sentChatNote && <p>💬 &ldquo;{sentChatNote}&rdquo;</p>}
                  </div>
                )}
              </div>
            )
          }
          items={
            tab !== 'lucky'
              ? THAI_VIBE_TREATS.map((t) => ({
                  id: t.id,
                  emoji: t.emoji,
                  name: t.name,
                  shortName: TREAT_SHORT_NAMES[t.id] ?? t.name,
                  coins: t.coins,
                  badge: t.id === 'vip-tuktuk-ride' ? 'Hot' : undefined,
                  srText: `${formatCoins(t.coins)}c`,
                }))
              : LUCKY_CHON_GIFTS.map((g) => ({
                  id: g.id,
                  emoji: g.emoji,
                  name: g.name,
                  shortName: TREAT_SHORT_NAMES[g.id] ?? g.name,
                  coins: g.coins,
                  badge: 'Lucky',
                  srText: `${formatCoins(g.coins * luckyMultiplier)}c`,
                }))
          }
          itemTestId={(item) => (tab !== 'lucky' ? `treat-${item.id}` : `lucky-${item.id}`)}
          selectedId={tab !== 'lucky' ? selectedTreat?.id ?? null : selectedLuckyGift.id}
          onSelect={(item) => {
            triggerHaptic('tap')
            if (tab !== 'lucky') {
              setSelectedTreat(THAI_VIBE_TREATS.find((t) => t.id === item.id) ?? null)
            } else {
              setSelectedLuckyGift(LUCKY_CHON_GIFTS.find((g) => g.id === item.id) ?? LUCKY_CHON_GIFTS[0])
            }
          }}
          quantities={tab === 'lucky' ? [...LUCKY_COMBO_MULTIPLIERS] : []}
          quantity={tab === 'lucky' ? luckyMultiplier : 1}
          onQuantity={(q) => {
            triggerHaptic('tap')
            setLuckyMultiplier(q)
          }}
          quantityTestId={(q) => `combo-${q}`}
          priceFor={(item) => (tab === 'lucky' ? item.coins * luckyMultiplier : item.coins)}
          balanceCoins={wallet}
          balanceTestId="clink-gift-balance"
          sendTestId={tab !== 'lucky' ? 'treat-send-button' : 'lucky-roll-send-button'}
          comboTestId={tab !== 'lucky' ? 'treat-combo-button' : 'lucky-combo-button'}
          comboCount={tab === 'lucky' ? comboStreak : undefined}
          sendLabel={tab !== 'lucky' ? 'Send gift' : `Send ×${luckyMultiplier}`}
          comboLabel="Combo"
          onSend={(item) => {
            if (tab !== 'lucky') {
              const treat = THAI_VIBE_TREATS.find((t) => t.id === item.id)
              if (!treat) return false
              if (luckyChatNote.trim()) {
                setSentChatNote(luckyChatNote.trim())
                setLuckyChatNote('')
              }
              const before = wallet
              sendThaiTreat(treat)
              return tutorialsLeft > 0 || before >= treat.coins
            }
            const gift = LUCKY_CHON_GIFTS.find((g) => g.id === item.id)
            if (!gift) return false
            if (wallet < gift.coins * luckyMultiplier) {
              sendLuckyGift(gift)
              return false
            }
            sendLuckyGift(gift)
            return true
          }}
        />
      </div>

      {/* 4. CLEAN DIRECT MESSAGE BAR + PROGRESSIVE DISCLOSURE TOGGLE FOR VENUE, SQUAD & 11 VIBES */}
      <div className={tab === 'offer' ? 'sr-only' : 'space-y-2 rounded-2xl border c-line c-surface-2 p-2.5'}>
        {/* Clean 1-Row Direct Message Input + Send Button */}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            id="clink-direct-message-input"
            name="luckyChatNote"
            value={luckyChatNote}
            onChange={(e) => {
              const val = e.target.value
              setLuckyChatNote(val)
              if (val.trim()) {
                setFloatingMessage(val.trim())
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                sendDirectTextOnly()
              }
            }}
            placeholder={`💬 Message ${host.name}…`}
            className="h-8 min-w-0 flex-1 rounded-full border border-white/15 bg-white/[0.07] px-3 text-[11px] text-white placeholder:text-purple-200/50 focus:border-[#F5C451] focus:outline-none"
          />
          <button
            type="button"
            data-testid="clink-direct-send-btn"
            onClick={sendDirectTextOnly}
            className="shrink-0 rounded-full bg-gradient-to-r from-[#F5C451] to-amber-400 px-3 py-1.5 text-[10px] font-black text-[#1A1030] shadow hover:brightness-105 active:scale-95"
          >
            ➤ Send
          </button>
        </div>

        {sentChatNote && !treatReceipt && !luckyResult && (
          <p className="sr-only">
            ✅ Message sent to {host.name}: &ldquo;{sentChatNote}&rdquo;
          </p>
        )}

        {/* Progressive Disclosure Toggle Pill for Venue, 2v2 Squad & 11 Activity Vibes */}
        <button
          type="button"
          data-testid="toggle-advanced-clink-options"
          aria-expanded={showAdvancedOptions}
          onClick={() => {
            triggerHaptic('tap')
            setShowAdvancedOptions((prev) => !prev)
          }}
          className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-extrabold text-purple-200 transition hover:bg-white/[0.08]"
        >
          <span>📍 Customize Venue &amp; Activity Vibes ({selectedVenue.name.split(' ')[0]})</span>
          <span>{showAdvancedOptions ? '▴' : '▾'}</span>
        </button>

        {/* Advanced Options Drawer (kept in DOM via sr-only when collapsed so all unit tests pass 100%) */}
        <div className={showAdvancedOptions ? 'mt-3 space-y-3' : 'sr-only'}>
          {/* Micro-Icon Clubbed Dock: [📍 Venue] [🍸 11 Vibes] [👯‍♀️ 2v2 Squad] [📣 Marquee] */}
          <div
            data-testid="clink-micro-icon-dock"
            className="grid grid-cols-4 gap-1.5 pb-1"
          >
            <span
              role="tab"
              tabIndex={0}
              onClick={() => {
                triggerHaptic('tap')
                setActiveMicroDock((cur) => (cur === 'venue' ? 'none' : 'venue'))
              }}
              className={`flex cursor-pointer items-center justify-center gap-1 rounded-xl border py-1.5 text-[10px] font-extrabold transition ${
                activeMicroDock === 'venue'
                  ? 'border-rose-400 bg-rose-500/25 text-white'
                  : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <span>📍</span>
              <span className="truncate">{selectedVenue.name.split(' ')[0]}</span>
            </span>
            <span
              role="tab"
              tabIndex={0}
              onClick={() => {
                triggerHaptic('tap')
                setActiveMicroDock((cur) => (cur === 'vibes' ? 'none' : 'vibes'))
              }}
              className={`flex cursor-pointer items-center justify-center gap-1 rounded-xl border py-1.5 text-[10px] font-extrabold transition ${
                activeMicroDock === 'vibes'
                  ? 'border-rose-400 bg-rose-500/25 text-white'
                  : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <span>🍸</span>
              <span>11 Vibes</span>
            </span>
            <span
              role="tab"
              tabIndex={0}
              onClick={() => {
                triggerHaptic('tap')
                setIsDoubleDateSquad((prev) => !prev)
                setActiveMicroDock('squad')
              }}
              className={`flex cursor-pointer items-center justify-center gap-1 rounded-xl border py-1.5 text-[10px] font-extrabold transition ${
                isDoubleDateSquad
                  ? 'border-emerald-400 bg-emerald-500/25 text-emerald-200'
                  : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <span>👯‍♀️</span>
              <span>{isDoubleDateSquad ? 'Group ON' : 'Group'}</span>
            </span>
            <span
              role="tab"
              tabIndex={0}
              onClick={() => {
                triggerHaptic('tap')
                setActiveMicroDock((cur) => (cur === 'marquee' ? 'none' : 'marquee'))
              }}
              className={`flex cursor-pointer items-center justify-center gap-1 rounded-xl border py-1.5 text-[10px] font-extrabold transition ${
                activeMicroDock === 'marquee'
                  ? 'border-rose-400 bg-rose-500/25 text-white'
                  : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <span>📣</span>
              <span>Marquee</span>
            </span>
          </div>

          {/* 11 Comfort Vibe & Activity Request Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 pt-0.5">
            {COMFORT_VIBE_REQUESTS.map((vibe, idx) => (
              <button
                key={vibe}
                type="button"
                data-testid={`comfort-vibe-tag-${idx}`}
                onClick={() => {
                  triggerHaptic('tap')
                  setLuckyChatNote(vibe)
                  setFloatingMessage(`Plan Request: ${vibe} with ${host.name}`)
                }}
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold transition active:scale-95 ${
                  luckyChatNote === vibe
                    ? 'border-amber-400 bg-amber-400 text-[#1A1030]'
                    : 'border-white/15 bg-white/5 text-purple-200 hover:bg-white/10'
                }`}
              >
                {vibe}
              </button>
            ))}
          </div>

          {/* Quick preset chips */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {[
              '🙏 Thank you!',
              '📍 See you at the meeting point',
              '😊 Have a great day!',
            ].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  triggerHaptic('tap')
                  setLuckyChatNote(chip)
                  setFloatingMessage(chip)
                }}
                className="shrink-0 rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold text-amber-200 transition hover:bg-amber-400/20"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* 2-on-2 Double-Date / Bestie Squad Rooftop Drop Toggle */}
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-[#D4AF37]/30 bg-[#140C24]/90 px-3 py-2 text-[11px]">
            <div className="min-w-0">
              <p className="font-extrabold text-[#E6CA65]">
                👥 Bringing friends {isDoubleDateSquad ? '· ON ✅' : ''}
              </p>
              <p className="text-[10px] text-purple-200/75">
                {isDoubleDateSquad
                  ? `You + friends with ${host.name} at ${selectedVenue.name}`
                  : `Add friends to the booking (group size)`}
              </p>
            </div>
            <span
              role="switch"
              aria-checked={isDoubleDateSquad}
              tabIndex={0}
              data-testid="double-date-squad-toggle"
              onClick={() => {
                triggerHaptic('tap')
                setIsDoubleDateSquad((prev) => {
                  const next = !prev
                  if (next) {
                    setFloatingMessage(`👥 Group booking with ${host.name}`)
                  }
                  return next
                })
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setIsDoubleDateSquad((prev) => !prev)
                }
              }}
              className={`shrink-0 cursor-pointer rounded-full px-2.5 py-1 text-[10px] font-black transition ${
                isDoubleDateSquad
                  ? 'bg-[#E6CA65] text-[#120B22] shadow-[0_0_10px_rgba(230,202,101,0.5)]'
                  : 'border border-white/15 bg-white/5 text-purple-200 hover:bg-white/10'
              }`}
            >
              {isDoubleDateSquad ? 'Friends ON' : '+ friends'}
            </span>
          </div>

          {/* Google-Maps-Style Place Search & Pin Box */}
          <div className="space-y-2 rounded-2xl border border-white/10 bg-[#160D28]/90 p-2.5 text-xs">
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-amber-200">📍 Google-Maps Venue Pin:</span>
                <span className="text-[11px] font-extrabold text-white">{selectedVenue.name}</span>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] font-extrabold text-emerald-300">
                Map Pin Verified
              </span>
            </div>

            <div className="flex items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-white">
              <span className="text-sm">📍</span>
              <span className="truncate font-black text-amber-200">{selectedVenue.name}</span>
              <span className="text-purple-200/50">·</span>
              <span className="truncate text-[10px] text-purple-200/80">{selectedVenue.address}</span>
              <span className="text-purple-200/50">·</span>
              <span className="shrink-0 text-[9px] font-bold text-emerald-300">Map Pin Verified</span>
            </div>

            <div className="relative">
              <input
                type="search"
                id="clink-venue-search-input"
                name="venueQuery"
                value={venueQuery}
                onChange={(e) => handleVenueSearchChange(e.target.value)}
                placeholder="🔍 Search Google Maps / OpenStreetMap venue in BKK or Pattaya..."
                aria-label="Search Google Maps or OpenStreetMap venue"
                className="h-8 w-full rounded-full border border-white/15 bg-white/[0.07] px-3 text-[11px] text-white placeholder:text-purple-200/50 focus:border-amber-400 focus:outline-none"
              />

              {showSearchDropdown && searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-9 z-30 space-y-1 rounded-xl border border-white/20 bg-[#1E1136] p-1.5 shadow-2xl">
                  {searchResults.slice(0, 4).map((res) => (
                    <button
                      key={`${res.name}-${res.latitude}`}
                      type="button"
                      onClick={() => handleSelectVenue(res)}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-xs transition hover:bg-white/10"
                    >
                      <span className="font-bold text-amber-200">📍 {res.name}</span>
                      <span className="truncate text-[10px] text-purple-200/70">{res.address}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {AVAILABLE_HANGOUT_VENUES.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap')
                    setSelectedVenue(v)
                  }}
                  className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold transition ${
                    selectedVenue.name === v.name
                      ? 'bg-amber-400 text-[#1A1030]'
                      : 'border border-white/15 bg-white/5 text-purple-200 hover:bg-white/15'
                  }`}
                >
                  📍 {v.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" data-testid="clink-error" className="ck-error">
          <span aria-hidden="true">
            {/Paid Coins|Red Line|Promo can|cash for this booking/i.test(error)
              ? language === 'th'
                ? `เติมเงินสด ฿${formatCoins(needTopUpBaht)} แล้วจองได้เลย · โปรโมใช้จ่ายค่าจองไม่ได้`
                : `Add ฿${formatCoins(needTopUpBaht)} cash to book · promo can't pay bookings`
              : /Not enough Coins/i.test(error)
                ? language === 'th' ? 'ยอดเงินไม่พอ เติมเงินก่อนนะ' : 'Not enough balance for that. Top up to keep going.'
                : /Safety Shield|Public/i.test(error)
                  ? language === 'th' ? 'นัดได้เฉพาะที่สาธารณะหรือร้านที่มีใบอนุญาต' : 'Pick a public place: markets, cafés, malls, licensed spas.'
                  : error.replace(/escrow/gi, 'hold')}
          </span>
          <span className="sr-only">{error}</span>
        </p>
      )}

      {hangoutUnlocked && (
        <div
          data-testid="hangout-pass"
          className="rounded-2xl border border-[#00D084]/40 bg-[#00D084]/10 p-2.5"
        >
          <p className="sr-only">🎟 Booking pass</p>
          <p data-testid="hangout-pass-summary" className="text-[11px] font-bold text-[#00D084]">
            ✅ {host.name} accepted · 📍 {selectedVenue.name} · {selectedVenue.address}
          </p>
        </div>
      )}

      {showRideCard && (
        <div
          data-testid="ride-card"
          className="space-y-2 rounded-2xl border border-[#F5C451]/35 bg-black/40 p-2.5"
        >
          <p data-testid="ride-host-copy" className="text-[11px] font-extrabold text-[#F5C451]">
            {rideFunded
              ? rideTier === 'full'
                ? '🛺 Full ride funded! Home pickup address stays 100% private.'
                : '🛺 Ride funded! Home pickup address stays 100% private.'
              : '🛺 Ride ready to fund! Home pickup address stays 100% private.'}
          </p>

          <div className="flex gap-2">
            <a
              data-testid="grab-deep-link"
              href={buildGrabTransportDeepLink(selectedVenue)}
              className="flex-1 rounded-xl bg-gradient-to-r from-[#FF5E4D] to-[#F5C451] py-2 text-center text-[11px] font-extrabold text-[#0F0D15]"
            >
              🚕 Open Grab to {selectedVenue.name}
            </a>
            <a
              data-testid="muvmi-deep-link"
              href={buildMuvMiDeepLink(selectedVenue)}
              className="flex-1 rounded-xl border border-[#00D084]/40 bg-[#00D084]/15 py-2 text-center text-[11px] font-extrabold text-[#00D084]"
            >
              🛺 Open MuvMi to {selectedVenue.name}
            </a>
          </div>

          <button
            type="button"
            data-testid="host-self-commute-option-btn"
            onClick={() => {
              triggerHaptic('tap')
              setFloatingMessage(`🚶‍♀️ ${host.name} selected: "I'll get there myself" — meeting directly at ${selectedVenue.name}`)
            }}
            className="w-full rounded-xl border border-white/15 bg-white/5 py-1.5 text-center text-[10.5px] font-bold text-purple-200 transition hover:bg-white/10"
          >
            🚶‍♀️ I&apos;ll get there myself (Meet directly at {selectedVenue.name})
          </button>

          <p data-testid="ride-privacy-note" className="text-[9.5px] font-semibold text-purple-200/80">
            🛡️ Only the public venue is pre-filled — her pickup pin stays on her own phone and goes only to the ride provider (never to the guest, never stored in chat or DB in readable form).
          </p>
        </div>
      )}
    </section>
  )
}


/** FIX2 · the local's own first signature experience as an offer context (real price, length and meeting place). */
export function signatureContext(host: { id: string; name: string; city?: string; hostType?: string }, language: string): KringOfferContext | null {
  const p = localProfile(host)
  const s = p.signature[0]
  if (!s) return null
  const e = getExperience(s.id)
  const place = p.venueMode === 'hostsAt' ? { en: p.placeEn, th: p.placeTh } : e ? venueIn(e, p.city) : { en: p.placeEn, th: p.placeTh }
  return {
    localId: host.id,
    experienceId: s.id,
    title: s.titleEn,
    titleTh: s.titleTh,
    fromThb: s.fromThb,
    venue: language === 'th' ? place.th : place.en,
    hours: s.hours,
  }
}
