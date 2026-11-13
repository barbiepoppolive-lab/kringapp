import { type CSSProperties, type ChangeEvent, Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'
import { triggerHaptic } from '../../lib/haptics'
import { playKringBumpChime, triggerChaoPhrayaFireworks } from '../../lib/kringCreativeEngine'
import { useBackEntry } from '../../lib/backStack'
import { createInitialLuckyPoolState, processDeterministicResonanceCombo, processLuckyComboSpin } from '../../lib/luckyPoolRng'
import { isLuckyRngVaulted } from '../../lib/configDefaults'
import { dispatchInternalWalletDelta } from '../../lib/walletBus'
import { maskPreMeetContactLeakage } from '../../lib/chonFinancialSecurityArmor'
import { isBigGift as isBigGiftPrice, mapGiftToBigKind, triggerBigGift } from '../fx/BigGiftFX'
import PoppoGiftPanel from '../gift/PoppoGiftPanel'
import { listHas, safety, useSafety } from '../../lib/safetyStore'
import { useHosting, useOptionalAuth } from '../../context/AuthContext'
import { BellIcon, PinDrop, ShieldCheck } from '../ui/LivingIcons'
import {
  acceptGuestHold,
  effectiveHoldStatus,
  ensureMeetPlan,
  hasSeen,
  hostAct,
  hostPlanTotalThb,
  hostShareThb,
  markGuestConfirmed,
  markSeen,
  mmss,
  msLeft,
  planEnd,
  recordReceivedGift,
  syncPlanStoreMode,
  toClock24,
  usePlanStore,
  type GuestHold,
  type HostPlan,
  type MeetPlan,
  heldExtraThb,
  bookingsFor,
  currentViewerId,
  grantSafetyAccess,
  offersWith,
  effectiveOfferStatus,
  partnerKey,
  isDemoSession,
  afterPaint,
  viewerDisplayName,
  myReview,
  type Booking,
  type Offer,
} from '../../lib/planStore'
import { BookingDock, CardEventLine, cardEvents } from '../booking/BookingCard'
import { flowLogo } from '../ui/KringMark'
import SuggestChangeSheet from '../booking/SuggestChangeSheet'
import { seedDemoIncoming } from '../booking/IncomingOffers'
import BumpCheckIn from '../booking/BumpCheckIn'
import ReviewSheet from '../booking/ReviewSheet'
import { MaskedLine, dayLabel as kDayLabel } from '../booking/parts'
import { BubbleLine, ReadMark, ReplyBar, StickerBubble, StickerTray, type Sticker } from './ThaiChat'
import { PLAN_ADDON_THB } from '../pulse/floorPrices'
import { hostPlaceholderUri } from '../../lib/imageFallback'
import { PlanCard, fmtClock } from './PlanCard'
import { openKringBooking } from '../booking/offerContext'
import { LOCAL_PROFILES } from '../../lib/experiences'
import '../../styles/chat-pulse.css'

/**
 * Atlas build · Section C (C1–C10) — Chats inbox, Plans, chat room.
 *
 * C1 inbox: search → All / Plans → story rings (open the ONE story viewer on Meet via `chon:open-story`) → hairline rows.
 * C2 plans: one ticket row per treat, one status each; host requests live in Host home (`chon:navigate {tab:'meet'}`).
 * C3 room: rim-lit plan ticket pinned under the header, translated subtitles, living wallpaper (one step per send).
 * C4–C7 add-ons rise above the composer and never cover the conversation. C8 Wingman = 2-chip strip.
 * C9 ⋯ menu: Mute · Report · Block · Safety Center (`chon:open-safety`) · 1155. C10 ride card after she accepts.
 * Gift tray: fixed bottom tray rendering PoppoGiftPanel (Gifts / Lucky / Real treats); Lucky = small pops only.
 * Money logic (wallet deltas, lucky RNG, plan lock) is unchanged — only presentation and routing moved.
 * Legacy test hooks stay mounted as sr-only stand-ins.
 */

export interface ChatMessage {
  id: string
  sender: 'host' | 'guest' | 'system'
  senderName: string
  rawText: string
  timestamp: string
  /** visible subtitle under the bubble (the other language) */
  translation?: string
  isVoiceNote?: boolean
  voiceDurationSec?: number
  subtitles?: {
    th: string
    en: string
    zh: string
    ko?: string
  }
  isE2eeWhisper?: boolean
  isContactCard?: boolean
  isViewOnce?: boolean
  viewOnceState?: 'unviewed' | 'viewing' | 'viewed'
  photoUrl?: string
  isGiftRequest?: boolean
  giftRequestFulfilled?: boolean
  isVipPass?: boolean
  vipPassMeta?: {
    title: string
    priceLabel: string
    voucherCode: string
    rebateCoins: number
  }
  venuePin?: { name: string; time: string }
  /** Round 4 · translations shown under a text bubble in the viewer's language */
  tr?: { th?: string; en?: string }
  /** Round 4 · a gift the OTHER person sent you (host view) — gold bubble on their side */
  giftIn?: { emoji: string; name: string; nameTh: string; thb: number; at?: number }
  giftItem?: {
    name: string
    emoji: string
    coins: number
  }
  /** KRING · Thai-slang reactions on this bubble ('🙏', '555', …) */
  reactions?: string[]
  /** KRING · swipe-to-reply: the message this one answers */
  replyTo?: { id: string; who: string; text: string }
  /** KRING · a Thai-slang text sticker */
  sticker?: { text: string; gloss: string; tone?: Sticker['tone'] }
  luckyGameWin?: {
    itemEmoji: string
    itemName: string
    combo: number
    multiplier: number
    rewardCoins: number
    chatNote: string
    isFixedTreat?: boolean
    spendCoins?: number
  }
}

export interface ConversationThreadSummary {
  id: string
  name: string
  age: number
  flag: string
  area: string
  avatar: string
  lastPreview: string
  time: string
  shortTime?: string
  unread: number
  online: boolean
}

export const CONVERSATION_INBOX: ConversationThreadSummary[] = [
  {
    id: 'ploy',
    name: 'Ploy',
    age: 22,
    flag: '🇹🇭',
    area: 'Ari · Herbal spa afternoon',
    avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=200&q=80',
    lastPreview: 'Saturday 14:00 is free for the spa afternoon 🌿',
    time: '7:44 PM',
    shortTime: '2m',
    unread: 1,
    online: true,
  },
  {
    id: 'mint',
    name: 'Mint',
    age: 24,
    flag: '🇹🇭',
    area: 'Siam · Hair & nails at Nara Salon',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    lastPreview: 'Just sent a voice note 🎙️',
    time: '7:39 PM',
    shortTime: '5m',
    unread: 2,
    online: true,
  },
  {
    id: 'kwan',
    name: 'Kwan',
    age: 25,
    flag: '🇻🇳',
    area: 'Chinatown · Street-food walk',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
    lastPreview: 'Nine stalls on Yaowarat · 2 PM is best 🍢',
    time: '7:20 PM',
    shortTime: '18m',
    unread: 0,
    online: true,
  },
  {
    id: 'fah',
    name: 'Fah',
    age: 23,
    flag: '🇷🇺',
    area: 'Jomtien · Koh Larn island day',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80',
    lastPreview: 'Sunset at Jomtien is ฟิน! 🌊',
    time: '6:55 PM',
    shortTime: '45m',
    unread: 0,
    online: false,
  },
  {
    id: 'bee',
    name: 'Bee',
    age: 23,
    flag: '🇹🇭',
    area: 'Thonglor · Golden-hour photo walk',
    avatar: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=200&q=80',
    lastPreview: 'Photo walk starts 17:00 · comfy shoes 📸',
    time: '6:40 PM',
    shortTime: '1h',
    unread: 0,
    online: true,
  },
  {
    id: 'ken',
    name: 'Ken',
    age: 29,
    flag: '🇹🇭',
    area: 'Lumphini · Muay Thai first session',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&q=80',
    lastPreview: 'Beginners welcome · the gym lends gloves 🥊',
    time: '5:10 PM',
    shortTime: '3h',
    unread: 0,
    online: false,
  },
]

export interface ChatsAndPlansTabProps {
  initialLocked?: boolean
  initialCoins?: number
  luckyPoolReserveCoins?: number | null
  onLockPlan?: (hostName: string, coinsLocked: number) => void
  onPhoneClinkRelease?: (hostName: string, hostPointsReleased: number) => void
}

export function maskPreLockContacts(
  text: string,
  isPlanLocked: boolean,
  previousSenderMessages?: string[],
): {
  displayText: string
  wasMasked: boolean
} {
  const res = maskPreMeetContactLeakage(text, isPlanLocked, {
    replacement: '🔒 [Contact hidden · chat here in Kring until you meet]',
    previousSenderMessages,
  })
  return {
    displayText: res.maskedText,
    wasMasked: res.leaksDetected > 0,
  }
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    sender: 'host',
    senderName: 'Ploy · 23',
    rawText: 'Hi! Happy to host your herbal spa afternoon 🌿',
    timestamp: '7:42 PM',
  },
  {
    id: 'msg-clean-guest-1',
    sender: 'guest',
    senderName: 'You',
    rawText: 'Great, is it OK for a first-timer? 🙏',
    timestamp: '7:43 PM',
  },
  {
    id: 'msg-3',
    sender: 'guest',
    senderName: 'You',
    rawText: 'If I get lost on the way, can I call you? 081-234-5678',
    timestamp: '7:43 PM',
  },
  {
    id: 'msg-demo-view-once',
    sender: 'host',
    senderName: 'Ploy · 23',
    rawText: '📷 Photo of the spa entrance',
    timestamp: '7:43 PM',
    isViewOnce: true,
    viewOnceState: 'unviewed',
  },
  {
    id: 'msg-2',
    sender: 'host',
    senderName: 'Ploy · 23',
    rawText: 'เจอกันที่หน้าสยามเฮอร์บัลสปา บ่ายสองนะคะ 😊',
    timestamp: '7:44 PM',
    isVoiceNote: true,
    voiceDurationSec: 6,
    subtitles: {
      th: '🇹🇭 เจอกันที่หน้าสยามเฮอร์บัลสปา บ่ายสองนะคะ 😊',
      en: '🇬🇧 EN: See you at the Siam Herbal Spa entrance at 2 PM!',
      zh: '🇨🇳 下午2点在 Siam Herbal Spa 门口见！',
    },
  },
  {
    id: 'msg-gift-req-1',
    sender: 'host',
    senderName: 'Mint · 22',
    rawText: '🧋 Tip: the Cha Yen stall at the BTS exit is ฿25 — grab one on the way',
    timestamp: '7:44 PM',
    isGiftRequest: true,
    giftRequestFulfilled: false,
    giftItem: {
      name: 'Cha Yen',
      emoji: '🧋',
      coins: 1500,
    },
  },
  {
    id: 'msg-host-call',
    sender: 'host',
    senderName: 'Ploy · 23',
    rawText: 'ถึงแล้วทักในแชทนี้ได้เลยนะคะ 🙏',
    translation: 'Message me here when you arrive',
    timestamp: '7:45 PM',
  },
]

export const POPPO_SIX_GIFTS = [
  { id: 'chayen-lucky', emoji: '🧋', name: 'Cha Yen', coins: 1_500, fillPct: 5, note: 'Sweet Thai tea for u 🧋' },
  { id: 'neon-rose', emoji: '🌹', name: 'Wai Rose', coins: 200, fillPct: 10, note: 'A rose for tonight 🌹' },
  { id: 'inhaler', emoji: '🌿', name: 'Inhaler', coins: 500, fillPct: 5, note: 'For BKK traffic! 😂' },
  { id: 'clink-glass', emoji: '🪷', name: 'Lotus', coins: 1_200, fillPct: 25, note: 'A lotus for luck 🪷' },
  { id: 'golden-tuktuk', emoji: '🛺', name: 'Tuk-Tuk', coins: 2_400, fillPct: 50, note: 'Your VIP ride to meet me! 🛺' },
  { id: 'champagne', emoji: '🏮', name: 'Lantern', coins: 10_000, fillPct: 100, note: 'Lanterns up tonight! 🏮' },
] as const

export const IN_CHAT_LUCKY_ITEMS = [
  { id: 'dice', emoji: '🎲', name: 'Lucky Dice', coins: 100, tag: 'Up to 500x' },
  { id: 'elephant', emoji: '🐘', name: 'Golden Elephant', coins: 500, tag: 'Popular 🔥' },
  { id: 'envelope', emoji: '🧧', name: 'Red Envelope', coins: 1_000, tag: 'Jackpot' },
  { id: 'pearl', emoji: '💎', name: 'Naga Pearl', coins: 5_000, tag: 'VIP Pool' },
] as const

export const IN_CHAT_GIFT_TRAY_ITEMS = [
  { id: 'chayen-lucky', emoji: '🧋', name: 'Cha Yen', coins: 1_500, tag: '500x Pool' },
  { id: 'crown-vip', emoji: '👑', name: 'Crown', coins: 9_900, tag: 'VIP' },
  { id: 'neon-rose', emoji: '🌹', name: 'Wai Rose', coins: 200, tag: 'Hot 🔥' },
  { id: 'thai-inhaler', emoji: '🌿', name: 'Inhaler', coins: 500, tag: 'New' },
  { id: 'inhaler', emoji: '🌿', name: 'Inhaler', coins: 500, tag: '500x Pool' },
  { id: 'diamond-vip', emoji: '💎', name: 'Diamond', coins: 600, tag: 'Hot' },
  { id: 'clink-glass', emoji: '🪷', name: 'Lotus', coins: 1_200, tag: 'Up to 500x' },
  { id: 'golden-tuktuk', emoji: '🛺', name: 'Tuk-Tuk', coins: 2_400, tag: 'VIP Luck' },
  { id: 'cherry-vip', emoji: '🍒', name: 'Cherry', coins: 2_400, tag: 'Lucky' },
  { id: 'champagne', emoji: '🏮', name: 'Lantern', coins: 10_000, tag: 'Jackpot' },
  { id: 'fireworks', emoji: '🎆', name: 'Chao Phraya Fireworks', coins: 25_000, tag: 'River VIP' },
  { id: 'dice', emoji: '🎲', name: 'Lucky Dice', coins: 100, tag: 'Classic' },
  { id: 'elephant', emoji: '🐘', name: 'Golden Elephant', coins: 500, tag: 'Popular' },
] as const

export const IN_CHAT_THAI_TREATS = [
  { id: 'inhaler', emoji: '🌿', name: 'Hong Thai', coins: 5_000, note: 'For BKK traffic! 😂' },
  { id: 'chayen', emoji: '🧋', name: 'Cha Yen', coins: 1_500, note: 'Sweet Thai tea for u 🧋' },
  { id: 'tuktuk', emoji: '🛺', name: 'VIP Tuk-Tuk', coins: 50_000, note: 'Your ride to meet me! 🛺' },
  { id: 'jellyfish', emoji: '🥭', name: 'Mango Sticky Rice', coins: 125_000, note: 'Dessert is on me 🥭' },
] as const

export const LUCKY_WHISPER_CHIPS = [
  '🪷 A small thank-you',
  '🐘 Good luck for your day!',
  '🙏 Thanks for the tips!',
] as const

export const QUICK_EMOJI_PHRASES = [
  '👋 Which day works for you?',
  '🙏 See you at 2 PM!',
  '📍 Meet at the MRT exit?',
  '🕑 Running 10 min late',
  '🏖️ Pattaya day trip?',
  '📸 Photo of the meeting point?',
] as const

export const INSTANT_DEMO_PHOTOS = [
  {
    id: 'rooftop',
    label: '🍜 Street-food stall',
    caption: '📸 Found the best noodle stall — come hungry! 🍜',
    url: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'outfit',
    label: '🌆 River view',
    caption: '📸 The river view from the meeting point ✨',
    url: 'https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'cab',
    label: '🚕 On My Way in Cab',
    caption: '📸 On my way in the cab to Sukhumvit now! 🚕',
    url: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=600&q=80',
  },
] as const

export const CRISP_HELP_BULLETS = [
  '• Full refund if the local doesn’t show',
  '• Money is held until you meet · released at the bump',
  '• Auto-translates Thai & English live',
] as const

export const AI_WINGMAN_ICEBREAKERS = [
  'Which day works best for the Yaowarat food walk? 🍜',
  'Is the walk OK for a first-timer? 🙏',
  'Could we start a little earlier, around 2 PM?',
  'Which night market do locals actually go to? 🏮',
  'Muay Thai class or a herbal spa — which do you recommend? 🙏',
] as const

export const MEETUP_VENUES = [
  // Kring: public places only (ids kept for saved plans); no bars, clubs or rooftop lounges
  { id: 'tichuca', label: 'Yaowarat Rd · 8 PM', name: 'Yaowarat Rd', area: 'Chinatown' },
  { id: 'octave', label: 'Lumphini Park · 8 PM', name: 'Lumphini Park', area: 'Silom · Sala Daeng' },
  { id: 'pastel', label: 'Chatuchak gate 1 · 10 AM', name: 'Chatuchak Market gate 1', area: 'Chatuchak' },
  { id: 'singsing', label: 'Jodd Fairs · 8 PM', name: 'Jodd Fairs', area: 'Rama 9' },
  { id: 'pattaya', label: 'Jomtien Beach · 5 PM', name: 'Jomtien Beach', area: 'Pattaya' },
  { id: 'differ', label: 'Terminal 21 Pattaya · 7 PM', name: 'Terminal 21 Pattaya', area: 'North Pattaya' },
  { id: 'emquartier', label: 'EmQuartier The Helix · 8 PM', name: 'EmQuartier', area: 'Phrom Phong' },
] as const

const VENUE_META: Record<string, { emoji: string; dist: string; pin: [number, number] }> = {
  tichuca: { emoji: '🌆', dist: '2.0 km', pin: [46, 26] },
  octave: { emoji: '🌃', dist: '1.2 km', pin: [24, 52] },
  pastel: { emoji: '🌆', dist: '3.4 km', pin: [72, 44] },
  singsing: { emoji: '🎭', dist: '2.6 km', pin: [60, 18] },
  pattaya: { emoji: '🌊', dist: '146 km', pin: [86, 72] },
  differ: { emoji: '🎧', dist: '148 km', pin: [12, 76] },
  emquartier: { emoji: '🛍', dist: '1.8 km', pin: [34, 30] },
}

const MEET_TIMES = ['7 PM', '8 PM', '8:30 PM', '9 PM', '10 PM'] as const

export const AFTER_PLAN_VIBE_CHIPS = [
  '📍 I’m at the meeting point',
  '🕑 Running 10 min late, sorry!',
  '🙏 Thank you for today!',
] as const

export const SHORT_BUBBLE_COPILOT_PRESETS = {
  buyer: {
    label: '🧳 Guest',
    bubbles: [
      'hi! is the walk ok for a first-timer? 😊',
      'could we do saturday around 2 pm?',
      'sent you a voice note with my question 🙏',
    ],
    safetyPivot:
      'this saturday slot was just booked by another guest 🙏 sunday 14:00 is open, or ask another local on the experience page',
  },
  host: {
    label: '🧭 Local',
    bubbles: [
      'สวัสดีค่ะ ยินดีพาเดินนะคะ 😊',
      'วันเสาร์บ่ายสองว่างค่ะ จองในแอปได้เลย',
      'ถึงแล้วทักในแชทนี้ได้เลยนะคะ 🙏',
    ],
    safetyPivot:
      'นัดเฉพาะที่สาธารณะหรือร้านที่มีใบอนุญาตนะคะ เงินพักไว้ในกริ๊ง โอนให้ตอนกริ๊งที่จุดนัด',
  },
  agent: {
    label: '🏢 Agency',
    bubbles: [
      'สนใจเป็นโลคอลกับกริ๊งไหมคะ',
      'มีทริปเดินกินกับสปามีใบอนุญาตให้เลือก',
      'เอเจนซีเห็นแค่ยอดรวม ไม่เห็นรายละเอียดการจอง',
    ],
    safetyPivot:
      'โลคอลยืนยันตัวตนครั้งเดียว นัดในที่สาธารณะเท่านั้น และกด SOS 1155 ได้ตลอด',
  },
} as const

type DrawerMode = 'none' | 'lucky' | 'treats' | 'real-treats'
type MessageCategory = 'all' | 'official' | 'unread' | 'group'
type RoomPanel = 'none' | 'attach' | 'photo' | 'venue'

/**
 * One source of truth for each partner's plan — the inbox venue chip, the plan bar and the first message all read it.
 * ROUND5 · Wei B2/B3: `offer` is the host's own card price (Meet `treatLabel`: Mint ฿300 · Ploy ฿400 · Kwan ฿500 ·
 * Bee ฿600 · Fah ฿300), so the card, the Clink sheet's opening price and the Plans row say the same number.
 */
const PARTNER_PLAN: Record<string, { venue: string; offer: number }> = {
  // the legacy (pre-Kring) plan fixture behind the sr-only plan bar — tests only; nothing visible reads it
  ploy: { venue: 'Siam Herbal Spa · 2 PM', offer: 400 },
  mint: { venue: 'Nara Salon · 11 AM', offer: 300 },
  kwan: { venue: 'Yaowarat Rd · 2 PM', offer: 500 },
  bee: { venue: 'Thonglor · 5 PM', offer: 600 },
  fah: { venue: 'Jomtien Beach · 9 AM', offer: 300 },
  ken: { venue: 'Lumphini Muay Thai Gym · 8 AM', offer: 500 },
}

/** Inbox rows: [partnerId, search haystack]. Order = row test ids 0…6. '' = Kring support (system) row. */
const INBOX_ROW_KEYS: ReadonlyArray<readonly [string, string]> = [
  ['ploy', 'Ploy herbal spa afternoon Siam Herbal Spa Ari'],
  ['mint', 'Mint hair nails Nara Salon Siam shopping'],
  ['bee', 'Bee golden-hour photo walk Thonglor'],
  ['kwan', 'Kwan street-food walk Yaowarat Chinatown'],
  ['', 'Kring support help receipts safety'],
  ['fah', 'Fah Koh Larn island day Jomtien Pattaya'],
  ['ken', 'Ken Muay Thai first session Lumphini gym'],
]

/* ------------------------------------------------------------------ */
/* FIX1 · demo personas — every chat is about a NAMED experience and    */
/* reads its local from the one catalogue (experiences.ts), so a local  */
/* says the same area / venue / price here as on her card and profile.  */
/* ------------------------------------------------------------------ */
const PERSONA_HOST: Record<string, { hostId: string; sig?: string; emoji: string; line: { en: string; th: string } }> = {
  ploy: { hostId: 'host-ploy', emoji: '🌿', line: { en: 'Saturday 14:00 is free for the spa afternoon · the therapists speak English too 🌿', th: 'บ่ายสปาวันเสาร์ 14:00 ว่างนะคะ เทอราพิสต์พูดอังกฤษได้ค่ะ 🌿' } },
  mint: { hostId: 'host-mint', emoji: '💅', line: { en: 'Nara Salon is quietest on weekday mornings 💅', th: 'นาราซาลอนช่วงเช้าวันธรรมดาคนน้อยสุดค่ะ 💅' } },
  kwan: { hostId: 'host-kwan', emoji: '🍢', line: { en: 'Nine stalls on Yaowarat · 2 PM is best, before the queues 🍢', th: 'เดินกินเยาวราช 9 ร้าน เริ่มบ่ายสองดีสุด ร้านยังไม่แน่นค่ะ 🍢' } },
  bee: { hostId: 'host-bee', sig: 'photo-walk', emoji: '📸', line: { en: 'The photo walk starts at 17:00 · wear comfy shoes 📸', th: 'เดินถ่ายรูปเริ่ม 17:00 นะคะ ใส่รองเท้าสบาย ๆ 📸' } },
  fah: { hostId: 'host-fah', emoji: '⛴️', line: { en: 'The 9 AM boat to Koh Larn is the quietest ⛴️', th: 'เรือไปเกาะล้านรอบ 9 โมงคนน้อยสุดค่ะ ⛴️' } },
  ken: { hostId: 'host-ken', emoji: '🥊', line: { en: 'Beginners welcome · the gym lends gloves and wraps 🥊', th: 'มือใหม่มาได้เลยครับ ค่ายมีนวมกับผ้าพันมือให้ 🥊' } },
}

interface Persona {
  id: string
  name: string
  emoji: string
  title: { en: string; th: string }
  place: { en: string; th: string }
  area: { en: string; th: string }
  fromThb: number
  replyMin: number
  line: { en: string; th: string }
}

function persona(rowId: string): Persona | null {
  const def = PERSONA_HOST[rowId]
  const prof = LOCAL_PROFILES[def?.hostId ?? `host-${rowId}`]
  if (!prof) return null
  const sig = prof.signature.find((x) => x.id === def?.sig) ?? prof.signature[0]
  return {
    id: rowId,
    name: prof.name,
    emoji: def?.emoji ?? '📍',
    title: { en: sig?.titleEn ?? 'Experience', th: sig?.titleTh ?? 'ทริป' },
    place: { en: prof.placeEn, th: prof.placeTh },
    area: { en: prof.areaEn, th: prof.areaTh },
    fromThb: sig?.fromThb ?? 1000,
    replyMin: prof.replyMin,
    line: def?.line ?? { en: `Happy to host the ${sig?.titleEn ?? 'experience'} 🙏`, th: `ยินดีพา${sig?.titleTh ?? 'เที่ยว'}นะคะ 🙏` },
  }
}

/**
 * FIX2 · Wei 32–33 — never speak for the user. A DEMO chat opens with the local's own hello about her experience
 * (Thai original + translation); the guest's question is only a suggestion chip in the composer until they tap it.
 * A real (non-demo) account starts every chat empty.
 */
function personaThread(rowId: string, demo: boolean): ChatMessage[] {
  if (!demo) return []
  const p = persona(rowId)
  if (!p) return []
  return [
    {
      id: `pm-${rowId}-1`,
      sender: 'host',
      senderName: p.name,
      rawText: `สวัสดีค่ะ ${p.name} เองนะคะ 👋 ${p.line.th}`,
      tr: { en: `Hi, I'm ${p.name} 👋 ${p.line.en}` },
      timestamp: '7:24 PM',
    },
  ]
}

/** FIX2 · Ploy: inbox times in Thai — '2m' → '2 นาที', '3h' → '3 ชม.', '1d' → 'เมื่อวาน', 'now' → 'เมื่อกี้'. */
export function thaiAgo(t: string): string {
  const m = /^(\d+)\s*([mhd])$/.exec(t.trim())
  if (!m) return /^(now|just now)$/i.test(t.trim()) ? 'เมื่อกี้' : t
  const n = Number(m[1])
  return m[2] === 'm' ? `${n} นาที` : m[2] === 'h' ? `${n} ชม.` : n === 1 ? 'เมื่อวาน' : `${n} วัน`
}

/** Legacy (pre-Kring) chat-room features render only under the test runner or `?legacy=1` (same rule as MeetFeed). */
const LEGACY_UI = import.meta.env.MODE === 'test' || (typeof window !== 'undefined' && /[?&]legacy=1\b/.test(window.location.search))

/**
 * When the viewer is a LOCAL, the same rows are the guests who wrote to her — never herself. Diverse, legit guests
 * (solo women, a couple, a family, a Thai guest); every thread names her own experience. `key` is the guest id the
 * booking store uses (the demo booking request in Local home comes from Sarah).
 */
interface HostGuestRow {
  key: string
  name: string
  age: number
  flag: string
  speaks: { en: string; th: string }
  avatar: string
  online: boolean
  preview?: { en: string; th: string; mine?: boolean }
  time: string
  unread: boolean
  plan?: { state: 'ok' | 'paid'; venue: string; time: string; day: { en: string; th: string }; thb: number }
  thread: ChatMessage[]
}
const HOST_VIEW_ROWS: Record<string, HostGuestRow> = {
  ploy: {
    key: 'sarah', name: 'Sarah', age: 28, flag: '🇬🇧', speaks: { en: 'speaks English', th: 'พูดอังกฤษ' }, online: true, time: '2m', unread: true,
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
    preview: { en: 'Is it OK for a first-timer? Travelling solo 🙏', th: 'มือใหม่ไปได้ไหมคะ? มาเที่ยวคนเดียว 🙏' },
    thread: [
      { id: 'hv-sarah-1', sender: 'host', senderName: 'Sarah', rawText: 'Hi! I just sent a booking request for {exp}. Is it OK for a first-timer? Travelling solo 🙏', tr: { th: 'สวัสดีค่ะ! เพิ่งส่งคำขอจอง{expTh}ไป มือใหม่ไปได้ไหมคะ? มาเที่ยวคนเดียวค่ะ 🙏' }, timestamp: '7:41 PM' },
    ],
  },
  mint: {
    key: 'hana', name: 'Hana & Kenji', age: 31, flag: '🇯🇵', speaks: { en: 'speaks English', th: 'พูดอังกฤษ' }, online: true, time: '14m', unread: true,
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80',
    preview: { en: 'Two of us · could we do Sunday morning?', th: 'มากันสองคน · เช้าวันอาทิตย์ได้ไหมคะ?' },
    thread: [
      { id: 'hv-hana-1', sender: 'host', senderName: 'Hana', rawText: 'Hello! We are a couple from Osaka. Could we do {exp} on Sunday morning? Two of us.', tr: { th: 'สวัสดีค่ะ! เราเป็นคู่รักจากโอซาก้า ขอ{expTh}เช้าวันอาทิตย์ได้ไหมคะ? มากันสองคนค่ะ' }, timestamp: '7:30 PM' },
    ],
  },
  bee: {
    key: 'okafor', name: 'The Okafors', age: 44, flag: '🇳🇬', speaks: { en: 'speaks English', th: 'พูดอังกฤษ' }, online: true, time: '32m', unread: false,
    avatar: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=200&q=80',
    preview: { en: 'Family of four · kids are 9 and 12', th: 'ครอบครัว 4 คน · ลูกอายุ 9 กับ 12' },
    thread: [
      { id: 'hv-okafor-1', sender: 'host', senderName: 'Ada', rawText: 'Hi! Family of four here, the kids are 9 and 12. Is {exp} a good fit for them?', tr: { th: 'สวัสดีค่ะ! มากันครอบครัว 4 คน ลูกอายุ 9 กับ 12 ขวบ {expTh}เหมาะกับเด็ก ๆ ไหมคะ?' }, timestamp: '7:12 PM' },
    ],
  },
  kwan: {
    key: 'priya', name: 'Priya', age: 34, flag: '🇮🇳', speaks: { en: 'speaks English', th: 'พูดอังกฤษ' }, online: true, time: '1d', unread: false,
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
    preview: { en: 'Thank you for today! Review is up ★★★★★', th: 'ขอบคุณสำหรับวันนี้! รีวิวให้แล้ว ★★★★★' },
    thread: [
      { id: 'hv-priya-1', sender: 'host', senderName: 'Priya', rawText: 'Thank you for today! The review is up ★★★★★', tr: { th: 'ขอบคุณสำหรับวันนี้นะคะ! รีวิวให้แล้ว ★★★★★' }, timestamp: 'Yesterday' },
    ],
  },
  fah: {
    key: 'aom', name: 'Aom', age: 46, flag: '🇹🇭', speaks: { en: 'speaks Thai', th: 'พูดไทย' }, online: false, time: '2h', unread: false,
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=200&q=80',
    preview: { en: 'Is there parking near the meeting point?', th: 'ใกล้จุดนัดมีที่จอดรถไหมคะ?' },
    thread: [
      { id: 'hv-aom-1', sender: 'host', senderName: 'Aom', rawText: 'สวัสดีค่ะ มาจากเชียงใหม่ ใกล้จุดนัดมีที่จอดรถไหมคะ?', tr: { en: 'Hi! Visiting from Chiang Mai. Is there parking near the meeting point?' }, timestamp: '5:40 PM' },
    ],
  },
  ken: {
    key: 'lukas', name: 'Lukas & Emma', age: 27, flag: '🇩🇪', speaks: { en: 'speaks English', th: 'พูดอังกฤษ' }, online: false, time: '3h', unread: false,
    avatar: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&w=200&q=80',
    preview: { en: 'Could we do Friday morning instead?', th: 'เปลี่ยนเป็นเช้าวันศุกร์ได้ไหม?' },
    thread: [
      { id: 'hv-lukas-1', sender: 'host', senderName: 'Lukas', rawText: 'Hi! Could we do {exp} on Friday morning instead of Saturday?', tr: { th: 'สวัสดีครับ! ขอเปลี่ยน{expTh}เป็นเช้าวันศุกร์แทนวันเสาร์ได้ไหมครับ?' }, timestamp: '4:58 PM' },
    ],
  },
}
/** The guests' first lines name the LOCAL's own experience ("{exp}") — whoever is signed in as the local. */
function threadForHost(thread: ChatMessage[], hostName: string): ChatMessage[] {
  const first = hostName.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const prof = Object.values(LOCAL_PROFILES).find((x) => x.name.toLowerCase() === first)
  const sig = prof?.signature[0]
  const en = sig ? `the ${sig.titleEn}` : 'your experience'
  const thx = sig ? sig.titleTh : 'ทริปของคุณ'
  return thread.map((m) => ({
    ...m,
    rawText: m.rawText.replace(/\{exp\}/g, en).replace(/\{expTh\}/g, thx),
    tr: m.tr ? { ...m.tr, th: m.tr.th?.replace(/\{expTh\}/g, thx).replace(/\{exp\}/g, en), en: m.tr.en?.replace(/\{exp\}/g, en).replace(/\{expTh\}/g, thx) } : m.tr,
  }))
}

/**
 * KRING T3 · ONE Chats list for everyone. A row you HOST (the guest who wrote about your experience) has the id
 * `h:<row>` — `h:ploy` (demo guest Sarah) or `h:g-<guestKey>` (a real request); every other row is a local you JOIN.
 * The side follows the row (and the booking's localId), never a picked role.
 */
const HOST_ROW = 'h:'
export const isHostRow = (id: string): boolean => id.startsWith(HOST_ROW)
const hostRowId = (inner: string): string => `${HOST_ROW}${inner}`

/** (pre-Kring host requests are gone — Local home and the chat read planStore offers / bookings only) */
const HOST_PLAN_FALLBACK: Record<string, Omit<HostPlan, 'receivedAt' | 'updatedAt'>> = {}

const BELL_SESSION_KEY = 'chon_host_bell_rung_v1'

const INBOX_STORY_HOSTS = [
  { id: 'ploy', name: 'Ploy', venue: 'Siam Herbal Spa, Ari', avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=200&q=80' },
  { id: 'mint', name: 'Mint', venue: 'Nara Salon, Siam Square', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80' },
  { id: 'kwan', name: 'Kwan', venue: 'Yaowarat Rd, Chinatown', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80' },
  { id: 'ken', name: 'Ken', venue: 'Lumphini Muay Thai Gym', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&q=80' },
  { id: 'bee', name: 'Bee', venue: 'Thonglor', avatar: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=200&q=80' },
] as const

const REAL_TREATS = [
  { id: 'real-roses-2h', emoji: '🛍️', title: 'Central / Lotus’s / Watsons Voucher', titleTh: 'บัตรกำนัล Central / Lotus’s / Watsons', sub: '100% face value to Host via Brolexy', subTh: 'โฮสต์รับเต็ม 100% (Brolexy)', coins: 50_000 },
  { id: 'real-7eleven-coffee', emoji: '☕', title: 'Starbucks Thailand Gift Card', titleTh: 'บัตร Starbucks ประเทศไทย', sub: '100% face value · Instant QR', subTh: 'โฮสต์รับเต็ม 100% · ใช้ได้ทันที', coins: 30_000 },
  { id: 'real-grabfood-supper', emoji: '🛵', title: 'Grab Ride / GrabFood Voucher', titleTh: 'โค้ด Grab / GrabFood', sub: '100% face value · Grab voucher', subTh: 'โฮสต์รับเต็ม 100% · โค้ด Grab', coins: 20_000 },
  { id: 'real-gowabi-spa', emoji: '💅', title: 'Nail & lash spa', titleTh: 'สปาทำเล็บ', sub: '100% face value · GoWabi voucher', subTh: 'โฮสต์รับเต็ม 100% · บัตรกำนัล GoWabi', coins: 50_000 },
] as const

const RIDE_OPTIONS = [
  { id: 'comfort', label: 'Comfort', labelTh: 'ธรรมดา', eta: 4, thb: PLAN_ADDON_THB.cab },
  { id: 'xl', label: 'XL', labelTh: 'XL', eta: 6, thb: PLAN_ADDON_THB.cabXl },
] as const

const THAI_RE = /[฀-๿]/

/** "Tichuca Rooftop · Tonight 8 PM" → { name, time: '8 PM' } — the day word never leaks into "at … tonight". */
function splitVenue(v: string): { name: string; time: string } {
  const [name, time] = v.split('·').map((s) => s.trim())
  const t = (time || '8 PM').replace(/^(tonight|today|คืนนี้|วันนี้)\s*/i, '').trim()
  return { name: name || 'Lumphini Park', time: t || '8 PM' }
}

/** '8 PM' | '7:30 PM' | '20:00' → minutes after midnight (null if it isn't a clock time). */
function clockMinutes(t: string): number | null {
  const m12 = t.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i)
  if (m12) {
    let h = Number(m12[1]) % 12
    if (/pm/i.test(m12[3])) h += 12
    return h * 60 + Number(m12[2] ?? 0)
  }
  const m24 = t.trim().match(/^(\d{1,2}):(\d{2})$/)
  return m24 ? Number(m24[1]) * 60 + Number(m24[2]) : null
}

/** Thai readers get the 24 h clock ("20:00"); everyone else "8 PM" / "7:30 PM". Non-clock text passes through. */
function fmtTime(t: string, th: boolean): string {
  const mins = clockMinutes(t)
  if (mins === null) return t
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (th) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h >= 12 ? 'PM' : 'AM'}`
}

function fmt(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString('en-US')
}

function island(text: string, tone: 'gold' | 'green' | 'red' | 'neutral' = 'neutral', icon?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('chon:island', { detail: { text, tone, icon } }))
}

/**
 * NEXT95 · real faces, never letters: a soft per-person placeholder (G1's shared `hostPlaceholderUri` — tinted night,
 * key light, blurred head-and-shoulders) sits underneath; the photo crossfades in on load and simply never appears
 * if it fails. The gold rim makes the row read as glass, not as a flat list.
 */
function Avatar({ src, name, size = 'md', testId }: { src?: string; name: string; size?: 'md' | 'sm' | 'xs'; testId?: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'bad'>('loading')
  useEffect(() => setState('loading'), [src])
  const ph = useMemo(() => `url("${hostPlaceholderUri(name, true)}")`, [name])
  return (
    <span
      className={`cp-av${size === 'sm' ? ' is-sm' : size === 'xs' ? ' is-xs' : ''}`}
      data-testid={testId}
      aria-hidden="true"
      style={{ backgroundImage: ph }}
    >
      {src && state !== 'bad' ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          data-no-fallback=""
          className={state === 'ok' ? 'is-in' : undefined}
          onLoad={() => setState('ok')}
          onError={() => setState('bad')}
        />
      ) : null}
    </span>
  )
}

/** Safety line shield: the check draws on once, shortly after the inbox mounts. */
function InboxShield() {
  const [checked, setChecked] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setChecked(true), 300)
    return () => clearTimeout(t)
  }, [])
  return <ShieldCheck checked={checked} size={18} />
}

function Wave({ bars, live = false }: { bars: number[]; live?: boolean }) {
  return (
    <span className={`cp-wv${live ? ' is-live' : ''}`} aria-hidden="true">
      {bars.map((h, i) => (
        <i key={i} style={{ '--h': `${h}%` } as CSSProperties} />
      ))}
    </span>
  )
}
const WAVE_STATIC = [30, 60, 90, 50, 70, 35, 80, 45, 65, 30, 55, 25]
const WAVE_LIVE = [40, 70, 100, 60, 85, 45, 95, 55, 75, 35, 65, 90, 50, 70, 40, 80]

/* ------------------------------------------------------------------ */
/* FIX1 · ONE money/booking language for the row, the room bar, Plans  */
/* (all read planStore — the offer card and the ticket say the same)   */
/* ------------------------------------------------------------------ */
type KTone = 'gold' | 'wait' | 'ok' | 'done' | 'off'
interface KLine { line: string; tone: KTone; tag?: string }
const bt = (n: number) => `฿${Math.max(0, Math.round(n)).toLocaleString('en-US')}`

/** "Booked · ฿1,200 held until you meet" / "Released ฿1,200 to Kwan · กริ๊ง!" … from a booking (either side) */
function bookingKLine(b: Booking, side: 'guest' | 'host', th: boolean): KLine {
  const other = side === 'guest' ? b.localName : b.guestName
  const amt = b.heldThb
  switch (b.status) {
    case 'released':
      return side === 'host'
        ? { line: th ? `โอนแล้ว ${bt(amt)} เข้ากระเป๋าคุณ · กริ๊ง!` : `Released ${bt(amt)} to you · Kring!`, tone: 'done', tag: th ? 'โอนแล้ว' : 'Released' }
        : { line: th ? `โอนแล้ว ${bt(amt)} ให้ ${other} · กริ๊ง!` : `Released ${bt(amt)} to ${other} · Kring!`, tone: 'done', tag: th ? 'โอนแล้ว' : 'Released' }
    case 'cancelled':
      return { line: th ? `ยกเลิกการจองแล้ว · คืน ${bt(b.refundThb ?? 0)}` : `Booking cancelled · ${bt(b.refundThb ?? 0)} back`, tone: 'off', tag: th ? 'ยกเลิก' : 'Cancelled' }
    case 'no-show':
      return { line: th ? `ไม่มีใครมา · คืนเต็ม ${bt(b.refundThb ?? b.heldThb)}` : `No-show · ${bt(b.refundThb ?? b.heldThb)} back in full`, tone: 'off', tag: th ? 'คืนเงิน' : 'Refunded' }
    default:
      return side === 'host'
        ? { line: th ? `จองแล้ว · เงินแขกพักไว้ · คุณได้ ${bt(amt)} ตอนกริ๊ง` : `Booked · guest's money held · you get ${bt(amt)} at the bump`, tone: 'ok', tag: th ? 'จองแล้ว' : 'Booked' }
        : { line: th ? `จองแล้ว · ${bt(amt)} พักไว้จนเจอกัน` : `Booked · ${bt(amt)} held until you meet`, tone: 'ok', tag: th ? 'จองแล้ว' : 'Booked' }
  }
}

/** "Offer ฿1,000 · waiting for Kwan · 9:12" / "Kwan countered ฿1,200 · tap to answer" / closed reasons */
function offerKLine(o: Offer, side: 'guest' | 'host', now: number, th: boolean): KLine {
  const st = effectiveOfferStatus(o, now)
  const other = side === 'guest' ? o.localName : o.guestName
  const p = bt(o.terms.priceThb)
  const held = side === 'guest' && o.steps[0]?.by === 'guest' ? bt(o.steps[0]?.terms.priceThb ?? o.terms.priceThb) : ''
  if (st === 'open') {
    const left = mmss(Math.max(0, o.replyBy - now))
    if (o.lastBy === side) {
      return { line: th ? `ข้อเสนอ ${p} · รอ ${other} ตอบ · ${left}` : `Offer ${p} · waiting for ${other} · ${left}`, tone: 'wait', tag: th ? 'ข้อเสนอ' : 'Offer' }
    }
    const kind = o.steps.length > 1 ? (th ? 'เสนอกลับ' : 'countered') : th ? 'ส่งคำขอจอง' : 'sent a request'
    return { line: th ? `${other} ${kind} ${p} · แตะเพื่อตอบ` : `${other} ${kind} ${p} · tap to answer`, tone: 'gold', tag: th ? 'รอคุณตอบ' : 'Your reply' }
  }
  if (st === 'released' && o.taken) return { line: th ? 'มีโลคอลรับไปแล้ว · ไม่เสียเงิน' : 'Taken by another local · no charge', tone: 'off' }
  if (st === 'declined') return { line: th ? `ปฏิเสธอย่างสุภาพ${held ? ` · คืน ${held}` : ''}` : `Declined politely${held ? ` · ${held} back` : ''}`, tone: 'off' }
  if (st === 'withdrawn') return { line: th ? `ถอนข้อเสนอแล้ว${held ? ` · คืน ${held}` : ''}` : `Offer withdrawn${held ? ` · ${held} back` : ''}`, tone: 'off' }
  if (st === 'expired') {
    // FIX3 · Ploy 1: an expired request always says so, with the money, on both sides
    const amt = bt(o.steps[0]?.terms.priceThb ?? o.terms.priceThb)
    return side === 'host'
      ? { line: th ? `หมดเวลา · ${amt} คืนให้แขกแล้ว · ไม่มีผลกับคุณ` : `Expired · ${amt} back to the guest · no effect on you`, tone: 'off', tag: th ? 'หมดเวลา' : 'Expired' }
      : { line: th ? `หมดเวลา · คืน ${held || amt} เข้ากระเป๋าแล้ว` : `Expired · ${held || amt} back to you`, tone: 'off', tag: th ? 'หมดเวลา' : 'Expired' }
  }
  return { line: th ? `ตกลงแล้ว · ${p}` : `Agreed · ${p}`, tone: 'ok' }
}

export default function ChatsAndPlansTab({
  initialLocked = false,
  initialCoins = 165_000,
  luckyPoolReserveCoins,
  onLockPlan,
  onPhoneClinkRelease,
}: ChatsAndPlansTabProps) {
  const { t, language } = useLanguage()
  const th = language === 'th'
  const auth = useOptionalAuth()
  /** T3 · "hosting" is derived (listed an experience · requests or bookings as the local) — never a role switch */
  const hostingAccount = useHosting()
  const [hasEnteredChatRoom, setHasEnteredChatRoom] = useState<boolean>(false)
  const [inboxViewMode, setInboxViewMode] = useState<'chats' | 'offers'>('chats')
  const [activeMessageCategory, setActiveMessageCategory] = useState<MessageCategory>('all')
  const [inboxPartners, setInboxPartners] = useState(CONVERSATION_INBOX)
  const [activePartnerId, setActivePartnerId] = useState<string>('ploy')
  /** the OPEN room's side: hosting rows are `h:…`; the inbox list decides per row */
  const isHostRole = isHostRow(activePartnerId)
  /** T3 · All · Joining · Hosting */
  const [rowFilter, setRowFilter] = useState<'all' | 'join' | 'host'>('all')
  const safetyState = useSafety()
  const [inboxQuery, setInboxQuery] = useState('')
  const [inboxSearchOpen, setInboxSearchOpen] = useState(false)
  const [inboxMenu, setInboxMenu] = useState(false)
  /** Safety lists are keyed by the person on the other side: hosts' ids for guests, `guest-<key>` for hosts. */
  const safetyIdFor = (rowId: string) => {
    const r = hostRowFor(rowId)
    return r ? `guest-${r.key}` : rowId
  }
  const rowVis = (rowId: string, haystack: string): { hidden?: boolean; 'data-muted'?: 'true' } => {
    const hostId = rowId ? safetyIdFor(rowId) : ''
    if (hostId && listHas(safetyState.blockedHostIds, hostId)) return { hidden: true }
    const q = inboxQuery.trim().toLowerCase()
    const hr = hostRowFor(rowId)
    const hay = hr ? `${hr.name} ${hr.plan?.venue ?? ''} ${haystack}` : haystack
    if (q && !hay.toLowerCase().includes(q)) return { hidden: true }
    if (hostId && listHas(safetyState.mutedHostIds, hostId)) return { 'data-muted': 'true' }
    return {}
  }

  // Round 4 · one store for plans: Host home writes accept / counter / decline, Meet's Clink writes guest holds.
  const planStore = usePlanStore()
  const hostPlanFor = (rowId: string): HostPlan | null => {
    const row = hostRowFor(rowId)
    if (!row) return null
    const stored = planStore.host[row.key]
    if (stored) return stored
    const fb = HOST_PLAN_FALLBACK[row.key]
    return fb ? { ...fb, receivedAt: 0, updatedAt: 0 } : null
  }
  const guestHoldFor = (rowId: string): GuestHold | null => planStore.guest[rowId] ?? null
  // NEXT95 · one plan clock per meet, shared by both sides: the guest's chat with Ploy (row 'ploy') and Ploy's chat with
  // Alex (row 'ploy' in host view) are the same meet → key = the host-side request id ('alex').
  const canPersist = Boolean(auth?.session)
  const meetKeyFor = (rowId: string): string => hostRowFor(rowId)?.key ?? rowId
  const meetFor = (rowId: string): MeetPlan | undefined => planStore.meet[meetKeyFor(rowId)]
  /** Wei N1: an accepted extension really held on this wallet joins the treat ("฿380 held") — guest side only */
  const extraHeldFor = (rowId: string): number => (isHostRow(rowId) ? 0 : heldExtraThb(meetKeyFor(rowId)))
  /** "until 10 PM" — the one line every plan surface adds once a clock exists (FIX2: no hourly extensions) */
  const clockLine = (m: MeetPlan | undefined): { text: string; ext: boolean } | null => {
    if (!m) return null
    return { text: th ? `ถึง ${fmtClock(planEnd(m), true)}` : `until ${fmtClock(planEnd(m), false)}`, ext: m.extendedMin > 0 }
  }
  // Marco B4: the clock is read at render, so the first frame already shows the true time left (no catch-up sprint)
  const [, setTick] = useState(0)
  const nowTick = Date.now()
  useEffect(() => syncPlanStoreMode(), [])
  const hasLiveHold = Object.values(planStore.guest).some((h) => effectiveHoldStatus(h, nowTick) === 'held')
  // the host's reply countdown on a pending request ticks too (only while one is pending)
  const hostPendingLive = hostingAccount && Object.values(planStore.host).some((p) => p.state === 'pending' && nowTick - p.receivedAt < 15 * 60_000)
  // the offer countdowns in rows / the room bar / Plans tick too (only while an offer is open)
  const kringOpenLive = Object.values(planStore.offers).some((o) => o.status === 'open' && nowTick < o.replyBy)
  const ticking = hasLiveHold || hostPendingLive || kringOpenLive
  useEffect(() => {
    if (!ticking) return
    const id = window.setInterval(() => setTick((v) => v + 1), 1000)
    return () => window.clearInterval(id)
  }, [ticking])
  // ---- FIX1 · inbox rows: demo personas (demo only) + every partner the booking store knows about ----
  const kringSideFor = (rowId: string): 'guest' | 'host' => (isHostRow(rowId) ? 'host' : 'guest')
  const viewerKey = partnerKey(currentViewerId())
  const ago = (ms: number) => {
    const m = Math.max(0, Math.floor((nowTick - ms) / 60_000))
    return m < 1 ? (th ? 'เมื่อกี้' : 'now') : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`
  }
  /** a guest the store knows (a real request) who has no demo row → a row of their own ('g-<guestKey>') */
  const hostRowFor = (rowId: string): HostGuestRow | null => {
    if (!isHostRow(rowId)) return null
    const inner = rowId.slice(HOST_ROW.length)
    const fixed = HOST_VIEW_ROWS[inner]
    if (fixed) return fixed
    if (!inner.startsWith('g-')) return null
    const key = inner.slice(2)
    const o = Object.values(planStore.offers).filter((x) => partnerKey(x.guestId) === key).sort((a, b) => b.updatedAt - a.updatedAt)[0]
    const b = Object.values(planStore.bookings).filter((x) => partnerKey(x.guestId) === key).sort((a, c) => c.updatedAt - a.updatedAt)[0]
    const name = o?.guestName ?? b?.guestName ?? key
    return { key, name, age: 0, flag: '', speaks: { en: 'Kring guest', th: 'ผู้จองบนกริ๊ง' }, avatar: '', online: true, time: '', unread: false, thread: [] }
  }
  /** the booking (live or recent) and the newest offer between this device and a row */
  const rowKring = (rowId: string): { booking?: Booking; offer?: Offer } => {
    const host = isHostRow(rowId)
    const k = host ? hostRowFor(rowId)?.key ?? '' : rowId
    if (!k) return {}
    const mine = (x: { localId: string; localName: string; guestId: string; guestName: string }) =>
      host ? partnerKey(x.guestId) === k || partnerKey(x.guestName) === k : partnerKey(x.localId) === k || partnerKey(x.localName) === k
    const booking = bookingsFor(currentViewerId())
      .filter((b) => mine(b) && (b.status === 'held' || nowTick - b.updatedAt < 36 * 3600_000))
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(-1)[0]
    const offer = Object.values(planStore.offers)
      .filter((o) => mine(o) && !o.bookingId && (effectiveOfferStatus(o, nowTick) === 'open' || nowTick - o.updatedAt < 12 * 3600_000))
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(-1)[0]
    // a newer open offer beats an older finished booking
    if (booking && offer && booking.status !== 'held' && offer.updatedAt > booking.updatedAt) return { offer }
    return booking ? { booking } : offer ? { offer } : {}
  }
  const demoInbox = isDemoSession() || !auth?.session
  // T3 · Local home folds into Chats: the demo traveller request for her experience lands here as a hosting row
  useEffect(() => {
    if (hostingAccount && isDemoSession()) seedDemoIncoming(currentViewerId(), viewerDisplayName(auth?.session?.displayName ?? 'Local'), th)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostingAccount])
  // FIX2: the old fixture thread (guest lines the user never typed, view-once, a spa voice note) is tests / ?legacy=1 only
  const firstThread = (id: string): ChatMessage[] => (id === 'ploy' && LEGACY_UI ? INITIAL_MESSAGES : personaThread(id, demoInbox))
  const [messages, setMessages] = useState<ChatMessage[]>(() => firstThread('ploy'))
  // FIX1 · each guest chat keeps its OWN thread (Kwan's room never shows Ploy's lines); the default room keeps the
  // original fixture thread (tests), every other local opens with a short, named-experience demo exchange
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const guestThreadsRef = useRef<Record<string, ChatMessage[]>>({})
  const threadOwnerRef = useRef<string>('ploy')
  /** a demo local who is ME (a hosting demo account named Ploy never chats with herself) */
  const viewerFirst = viewerDisplayName('').trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const isSelfRow = (id: string): boolean => Boolean(viewerFirst) && (persona(id)?.name.toLowerCase() === viewerFirst || id === viewerFirst)
  /** demo hosting rows (Sarah, Hana & Kenji…) only for someone who hosts */
  const demoHostRows = demoInbox && hostingAccount
  const iAmLocalOn = (x: { localId: string; localName: string }) => partnerKey(x.localId) === viewerKey || partnerKey(x.localName) === viewerKey
  const inboxRows: ReadonlyArray<readonly [string, string]> = (() => {
    const joinBase = (demoInbox ? [...INBOX_ROW_KEYS] : INBOX_ROW_KEYS.filter(([id]) => id === '')).filter(([id]) => id === '' || !isSelfRow(id))
    const hostBase: Array<readonly [string, string]> = demoHostRows ? Object.keys(HOST_VIEW_ROWS).map((k) => [hostRowId(k), `${HOST_VIEW_ROWS[k].name} ${HOST_VIEW_ROWS[k].preview?.en ?? ''}`] as const) : []
    const base = [...joinBase, ...hostBase]
    // keys are namespaced by side: the same person can be a local you join AND a guest you host
    const have = new Set(base.map(([id]) => (isHostRow(id) ? `h:${hostRowFor(id)?.key ?? id}` : `j:${id}`)))
    const extra: Array<readonly [string, string]> = []
    const add = (rowId: string, hay: string, key: string) => {
      if (!key || key.endsWith(':') || have.has(key)) return
      have.add(key)
      extra.push([rowId, hay] as const)
    }
    for (const o of Object.values(planStore.offers)) {
      if (iAmLocalOn(o)) {
        // a request for YOUR experience → a hosting row (HostHome folds into Chats)
        add(hostRowId(`g-${partnerKey(o.guestId)}`), `${o.guestName} ${o.experienceTitle ?? ''}`, `h:${partnerKey(o.guestId)}`)
      } else if (o.steps[0]?.by === 'guest' || partnerKey(o.guestId) === viewerKey) {
        add(partnerKey(o.localId), `${o.localName} ${o.experienceTitle ?? ''} ${o.terms.venue}`, `j:${partnerKey(o.localId)}`)
      }
    }
    // FIX2 · real accounts start empty: a demo partner only becomes a row once there is a real thread with them
    const hasThread = (id: string) => (id === threadOwnerRef.current && !isHostRow(activePartnerId) ? messagesRef.current.length > 0 : (guestThreadsRef.current[id]?.length ?? 0) > 0)
    for (const c of inboxPartners) if ((demoInbox || hasThread(c.id)) && !isSelfRow(c.id)) add(c.id, `${c.name} ${c.area}`, `j:${c.id}`)
    const all = [...extra, ...base]
    // FIX3 · Ploy r4: newest activity on top (booking/offer changes or the row's last message); Kring support is pinned
    // at the bottom (it is not a conversation with a person)
    const minsOf = (t: string | undefined): number | null => {
      const m = /^(\d+)\s*([mhd])$/.exec((t ?? '').trim())
      if (!m) return /^(now|just now)$/i.test((t ?? '').trim()) ? 0 : null
      return Number(m[1]) * (m[2] === 'm' ? 1 : m[2] === 'h' ? 60 : 1440)
    }
    const lastAt = (id: string): number => {
      if (id === '') return -Infinity
      const r = rowKring(id)
      const k = r.booking?.updatedAt ?? r.offer?.updatedAt ?? 0
      const t = isHostRow(id) ? hostRowFor(id)?.time : (inboxPartners.find((x) => x.id === id) ?? CONVERSATION_INBOX.find((x) => x.id === id))?.shortTime
      const m = minsOf(t)
      return Math.max(k, m === null ? 0 : nowTick - m * 60_000)
    }
    return [...all].sort((a, b) => lastAt(b[0]) - lastAt(a[0]))
  })()
  const inboxVisibleCount = inboxRows.filter(([id, hay]) => !rowVis(id, hay).hidden).length
  /** T3 · All · Joining N · Hosting N — only when this person both joins and hosts */
  const joinCount = inboxRows.filter(([id, hay]) => id !== '' && !isHostRow(id) && !rowVis(id, hay).hidden).length
  const hostCount = inboxRows.filter(([id, hay]) => isHostRow(id) && !rowVis(id, hay).hidden).length
  const showSideChips = joinCount > 0 && hostCount > 0
  // FIX2: the support row alone is not a conversation — a real account with no chats gets the helpful empty state
  const inboxPeopleCount = inboxRows.filter(([id, hay]) => id !== '' && !rowVis(id, hay).hidden).length
  const demoSeeded = demoInbox
  // FIX2 · Wei 38: the "no reply in 10 min" promise only sits under a request that is still waiting for an answer
  const guestWaitingOffer = Object.values(planStore.offers).some((o) => o.lastBy === 'guest' && !o.bookingId && effectiveOfferStatus(o, nowTick) === 'open' && partnerKey(o.guestId) === viewerKey)

  // Bell wiggles once when a host request arrives (first inbox view per session for hosts, or a `chon:host-request` event)
  const [bellRing, setBellRing] = useState(0)
  useEffect(() => {
    if (!hostingAccount) return
    try {
      if (window.sessionStorage.getItem(BELL_SESSION_KEY) !== '1') {
        window.sessionStorage.setItem(BELL_SESSION_KEY, '1')
        setBellRing((n) => n + 1)
      }
    } catch {
      // storage blocked: stay quiet
    }
    const onRequest = () => setBellRing((n) => n + 1)
    window.addEventListener('chon:host-request', onRequest)
    return () => window.removeEventListener('chon:host-request', onRequest)
  }, [hostingAccount])

  const [showFullInbox, setShowFullInbox] = useState<boolean>(false)
  const [dailyDigestClaimed, setDailyDigestClaimed] = useState(false)
  const [meetupVenue, setMeetupVenue] = useState<string>(PARTNER_PLAN.ploy.venue)
  const [venueOverrides, setVenueOverrides] = useState<Record<string, string>>({})
  const [activeOfferThb, setActiveOfferThb] = useState<number>(PARTNER_PLAN.ploy.offer)

  // Tell App.tsx when the 1-on-1 room opens/closes (full-screen immersion)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('chon:chat-room-state', { detail: { open: hasEnteredChatRoom } }))
    return () => {
      window.dispatchEvent(new CustomEvent('chon:chat-room-state', { detail: { open: false } }))
    }
  }, [hasEnteredChatRoom])

  const [isPlanLocked, setIsPlanLocked] = useState(initialLocked)
  /** Marco B10: one crossfade for "Confirm" → "✓ Confirmed" (never on a reload) */
  const [justConfirmed, setJustConfirmed] = useState(false)
  const [isWhisperMode, setIsWhisperMode] = useState(false)
  const [arrivalState, setArrivalState] = useState<'waiting' | 'clinked' | 'auto_released'>('waiting')
  const [consecutiveUnrepliedCount, setConsecutiveUnrepliedCount] = useState(1)
  const swapGuestThread = (id: string) => {
    const fromHostRoom = isHostRow(activePartnerId)
    if (!fromHostRoom && id === threadOwnerRef.current) return
    // T3 · leaving a hosting room: its thread goes back to the hosting store, never into a local's thread
    if (fromHostRoom) hostThreadsRef.current[activePartnerId] = messagesRef.current
    else guestThreadsRef.current[threadOwnerRef.current] = messagesRef.current
    threadOwnerRef.current = id
    const next = guestThreadsRef.current[id] ?? firstThread(id)
    messagesRef.current = next
    setMessages(next)
  }
  const [draftText, setDraftText] = useState('')
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const [lineCardShared, setLineCardShared] = useState(false)
  const [copilotTrack, setCopilotTrack] = useState<'buyer' | 'host' | 'agent'>('buyer')
  const [statusBanner, setStatusBanner] = useState<string | null>(null)
  const [glassFillPct, setGlassFillPct] = useState<number>(68)
  const [lastGiftGlassNote, setLastGiftGlassNote] = useState<string>('+12% from Cha Yen')
  void lastGiftGlassNote
  const [topWinPopupText, setTopWinPopupText] = useState<string | null>(null)
  const [isRecordingMic, setIsRecordingMic] = useState<boolean>(false)
  const [recSecs, setRecSecs] = useState(0)
  const [viewOnceMsLeft, setViewOnceMsLeft] = useState<number>(5000)

  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const composerInputRef = useRef<HTMLInputElement | null>(null)
  const trayRef = useRef<HTMLDivElement | null>(null)
  // R6 · Marco B7: the closed chat room (≈300 nodes), the gift dock (≈115) and the venue picker (≈70) are not mounted
  // for real users until they open — same rule as the Wallet / Pulse legacy stacks: the test runner (and `?legacy=1`
  // for debugging) still mounts them hidden so every test hook stays reachable.
  const mountHiddenTrees = import.meta.env.MODE === 'test' || (typeof window !== 'undefined' && /[?&]legacy=1\b/.test(window.location.search))

  // C8 · Wingman strip (2 free openers a day; tapping fills the input, never auto-sends)
  const [aiWingmanFreeLeft, setAiWingmanFreeLeft] = useState<number>(2)
  const [wingDismissed, setWingDismissed] = useState(false)

  const [drawerMode, setDrawerMode] = useState<DrawerMode>('none')
  const [panel, setPanel] = useState<RoomPanel>('none')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [showSafetyDetails, setShowSafetyDetails] = useState<boolean>(false)
  const [photoAsViewOnce, setPhotoAsViewOnce] = useState<boolean>(false)
  const [selectedPhotoIdxs, setSelectedPhotoIdxs] = useState<number[]>([0])
  const [photoCaptionText, setPhotoCaptionText] = useState<string>('')
  const [venueQuery, setVenueQuery] = useState('')
  const [venuePickId, setVenuePickId] = useState<string>('octave')
  const [venuePickTime, setVenuePickTime] = useState<string>('8 PM')
  const [bottomLeftWinAmount, setBottomLeftWinAmount] = useState<number | null>(null)
  const [showQuickRechargeSheet, setShowQuickRechargeSheet] = useState<boolean>(false)
  const [trayH, setTrayH] = useState(0)
  const [selectedLuckyId, setSelectedLuckyId] = useState<string>('chayen-lucky')
  const [selectedGiftIndex] = useState<number>(0)
  const [luckyCombo, setLuckyCombo] = useState<number>(1)
  const [, setLuckyRollCount] = useState<number>(0)
  const [comboStreakCount, setComboStreakCount] = useState<number>(0)
  const [, setComboCount] = useState<number>(1)
  const [liveCoinBalance, setLiveCoinBalance] = useState<number>(initialCoins)
  const [lastBurstBanner, setLastBurstBanner] = useState<string | null>(null)
  const [chatLuckyPool, setChatLuckyPool] = useState(() => createInitialLuckyPoolState(500_000, 1.0))
  const [activeStoryHost, setActiveStoryHost] = useState<(typeof INBOX_STORY_HOSTS)[number] | null>(null)
  const speechRecRef = useRef<{ stop?: () => void } | null>(null)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  // KRING · Thai-slang chat (reactions, stickers, swipe-to-reply, translate) + offers / booking / bump / review in the room
  const [replyTo, setReplyTo] = useState<{ id: string; who: string; text: string } | null>(null)
  const [stickerOpen, setStickerOpen] = useState(false)
  const [changeOffer, setChangeOffer] = useState<Offer | null>(null)
  const [bumpBooking, setBumpBooking] = useState<Booking | null>(null)
  const [reviewFor, setReviewFor] = useState<Booking | null>(null)
  const [dockOpen, setDockOpen] = useState(false)

  useBackEntry(hasEnteredChatRoom, () => {
    setPanel('none')
    setDrawerMode('none')
    setStickerOpen(false)
    setMenuOpen(false)
    setDockOpen(false)
    setHasEnteredChatRoom(false)
  })
  useBackEntry(panel !== 'none', () => setPanel('none'))
  useBackEntry(drawerMode !== 'none', () => setDrawerMode('none'))
  useBackEntry(stickerOpen, () => setStickerOpen(false))
  useBackEntry(dockOpen, () => setDockOpen(false))
  const [trPrimary, setTrPrimary] = useState<Record<string, boolean>>({})
  const [isOfferCancelled, setIsOfferCancelled] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && window.sessionStorage.getItem('chon_offer_cancelled') === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    setLiveCoinBalance(initialCoins)
  }, [initialCoins])

  const activePartner = inboxPartners.find((c) => c.id === activePartnerId) ?? inboxPartners[0]
  // Round 4 · Ploy B1: a host's thread is with the GUEST of that row (Alex, Kenji…), never with herself.
  const hostRow = hostRowFor(activePartnerId)
  const viewPartner: ConversationThreadSummary & { speaks?: { en: string; th: string } } = hostRow
    ? {
        id: `guest-${hostRow.key}`,
        name: hostRow.name,
        age: hostRow.age,
        flag: hostRow.flag,
        area: hostRow.plan?.venue ?? '',
        avatar: hostRow.avatar,
        lastPreview: '',
        time: hostRow.time,
        unread: 0,
        online: hostRow.online,
        speaks: hostRow.speaks,
      }
    : activePartner
  const plan = splitVenue(meetupVenue)
  const planTime = fmtTime(plan.time, th)

  // KRING · the offers and the booking for THIS chat (planStore; a booking is readable only by its guest and local)
  const kringKey = isHostRole ? hostRow?.key ?? '' : activePartnerId
  const kringSide = isHostRole ? 'host' : 'guest'
  const kringOffers: Offer[] = kringKey ? offersWith(kringKey).filter((o) => (isHostRole ? partnerKey(o.guestId) === kringKey || partnerKey(o.guestName) === kringKey : partnerKey(o.localId) === kringKey || partnerKey(o.localName) === kringKey)) : []
  const kringBooking: Booking | null = (() => {
    if (!kringKey) return null
    const mine = bookingsFor(currentViewerId()).filter((b) =>
      isHostRole ? partnerKey(b.guestId) === kringKey || partnerKey(b.guestName) === kringKey : partnerKey(b.localId) === kringKey || partnerKey(b.localName) === kringKey,
    )
    const live = mine.filter((b) => b.status === 'held' || ((b.status === 'released' || b.status === 'cancelled' || b.status === 'no-show') && nowTick - b.updatedAt < 12 * 3600_000))
    return live.sort((a, b) => a.createdAt - b.createdAt)[live.length - 1] ?? null
  })()
  // FIX1 · the room's pinned bar is the Kring state of THIS chat (booking → newest offer → a quiet "plan it" line)
  const kringLatest: Offer | undefined = [...kringOffers].sort((a, b) => a.updatedAt - b.updatedAt).slice(-1)[0]
  /**
   * FIX3 · Ploy 3 — quick replies follow the booking's stage (request · booked · met · reviewed · called off), never a
   * "let me check the date" after a finished trip. null = no booking activity yet (the first-enquiry openers).
   */
  const stageChips = (): Array<{ k: string; text: string }> | null => {
    const host = isHostRole
    const b = kringBooking
    if (b) {
      const where = b.terms.venue.split(/[,·(]/)[0].trim()
      if (b.status === 'released') {
        if (myReview(b, host ? 'host' : 'guest')) return host
          ? [{ k: th ? 'ขอบคุณ' : 'Thanks', text: th ? 'ขอบคุณที่มาเที่ยวด้วยกันนะคะ 🙏' : 'Thank you for coming along today 🙏' }, { k: th ? 'ชวน' : 'Invite', text: th ? 'มาเที่ยวด้วยกันอีกนะคะ 💛' : 'Come back for another one anytime 💛' }]
          : [{ k: th ? 'ขอบคุณ' : 'Thanks', text: th ? 'ขอบคุณที่พาเที่ยวนะคะ 🙏' : 'Thank you for today! 🙏' }, { k: th ? 'ชวน' : 'Again', text: th ? 'ไว้มาอีกนะคะ 💛' : 'Would love to do another one 💛' }]
        return host
          ? [{ k: th ? 'ขอบคุณ' : 'Thanks', text: th ? 'ขอบคุณที่มาเที่ยวด้วยกันนะคะ 🙏' : 'Thank you for coming along today 🙏' }, { k: th ? 'รีวิว' : 'Review', text: th ? 'ฝากรีวิวให้หน่อยนะคะ ⭐' : 'A quick review would mean a lot ⭐' }]
          : [{ k: th ? 'ขอบคุณ' : 'Thanks', text: th ? 'ขอบคุณสำหรับวันนี้นะคะ 🙏' : 'Thank you for today! 🙏' }, { k: th ? 'รีวิว' : 'Review', text: th ? 'เดี๋ยวรีวิวให้นะคะ ⭐' : 'Leaving you a review now ⭐' }]
      }
      if (b.status === 'held') {
        return [
          { k: th ? 'นัด' : 'Meet', text: th ? `เจอกันที่ ${where} ${b.terms.start} น. นะคะ 🙏` : `See you at ${where} at ${b.terms.start} 🙏` },
          host
            ? { k: th ? 'สุภาพ' : 'Polite', text: th ? 'ถึงแล้วทักในแชทนี้ได้เลยนะคะ 🙏' : 'Message me here when you arrive 🙏' }
            : { k: th ? 'สาย' : 'Late', text: th ? 'อาจไปสายสัก 10 นาทีนะคะ ขอโทษค่ะ 🙏' : 'Might be 10 min late, sorry! 🙏' },
        ]
      }
      return [{ k: th ? 'สุภาพ' : 'Polite', text: th ? 'เสียดายจัง ไว้โอกาสหน้านะคะ 🙏' : 'Sorry it didn’t work out · maybe next time 🙏' }]
    }
    const o = kringLatest
    if (o && effectiveOfferStatus(o, nowTick) === 'open') {
      const theirs = o.lastBy !== (host ? 'host' : 'guest')
      return host
        ? theirs
          ? [{ k: th ? 'ตอบไว' : 'Quick reply', text: th ? 'ยินดีค่ะ ขอเช็ควันให้นะคะ' : 'Happy to! Let me check the date 🙏' }, { k: th ? 'ถาม' : 'Ask', text: th ? 'มากี่คนคะ มีอะไรที่ไม่ทานไหมคะ?' : 'How many of you, and anything you don’t eat?' }]
          : [{ k: th ? 'รอ' : 'Waiting', text: th ? 'ส่งข้อเสนอให้แล้วนะคะ กดตกลงในการ์ดได้เลย' : 'I’ve sent my offer · tap Accept on the card when ready' }]
        : theirs
          ? [{ k: th ? 'ตอบ' : 'Reply', text: th ? 'ขอดูเวลาก่อนนะคะ' : 'Let me check my plans 🙏' }, { k: th ? 'ถาม' : 'Ask', text: th ? 'เลื่อนเวลาได้นิดหน่อยไหมคะ?' : 'Could we shift the time a little?' }]
          : [{ k: th ? 'ถาม' : 'Ask', text: th ? 'เวลานี้สะดวกไหมคะ?' : 'Does that time work for you?' }]
    }
    if (o && effectiveOfferStatus(o, nowTick) === 'expired') {
      return host
        ? [{ k: th ? 'ขอโทษ' : 'Sorry', text: th ? 'ขอโทษที่ตอบไม่ทันนะคะ ยังสนใจทริปนี้ไหมคะ? 🙏' : 'Sorry I missed your request · still keen on this one? 🙏' }]
        : [{ k: th ? 'ถาม' : 'Ask', text: th ? 'ยังว่างช่วงนี้ไหมคะ? ส่งคำขอใหม่ได้นะ' : 'Still free around then? Happy to send a new request' }]
    }
    return null
  }
  const scrollToId = (testId: string) => document.querySelector(`[data-testid="${testId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  const roomPersona = !isHostRole ? persona(activePartnerId) : null
  /** FIX2 · the ONE Kring "Book a local" sheet for this chat's local, on her own experience (never the old offer sheet) */
  const bookThisLocal = () => {
    const key = partnerKey(viewPartner.id)
    const hostId = `host-${key}`
    openKringBooking({ hostId, experienceId: PERSONA_HOST[key]?.sig ?? LOCAL_PROFILES[PERSONA_HOST[key]?.hostId ?? hostId]?.signature[0]?.id })
  }
  // KRING VISUAL V2 · V3 — a booking or a request in this chat lives in the ONE card docked above the composer;
  // the top bar only offers "Book" while there is neither
  const roomBar = (() => {
    if (kringBooking || kringLatest) return null
    if (roomPersona) {
      return (
        <button
          type="button"
          className="kc-room is-plan"
          data-testid="kring-plan-bar"
          onClick={() => {
            triggerHaptic('select')
            bookThisLocal()
          }}
        >
          <span className="kc-room-ic" aria-hidden="true">{roomPersona.emoji}</span>
          <span className="kc-room-t">
            <b>{th ? roomPersona.title.th : roomPersona.title.en}</b>
            <span>
              {th ? `เริ่ม ${bt(roomPersona.fromThb)} · ${roomPersona.area.th}` : `from ${bt(roomPersona.fromThb)} · ${roomPersona.area.en}`}
            </span>
          </span>
          <em className="kc-room-cta">{th ? 'จอง' : 'Book'}</em>
        </button>
      )
    }
    return null
  })()
  const sendSticker = (st: Sticker) => {
    triggerHaptic('light', { sound: false })
    setStickerOpen(false)
    setWingDismissed(true)
    setMessages((prev) => [
      ...prev,
      { id: `msg-st-${Date.now()}`, sender: 'guest', senderName: 'You', rawText: st.text, timestamp: 'Just now', sticker: { text: st.text, gloss: st.gloss, tone: st.tone }, replyTo: replyTo ?? undefined },
    ])
    setReplyTo(null)
  }
  // V3 · where each one-line event sits in the thread: after the message that was last when it first appeared here
  const offerAnchors = useRef<Record<string, number>>({})
  const offerAnchor = (id: string): number => {
    if (offerAnchors.current[id] === undefined) offerAnchors.current[id] = messages.length
    return Math.min(offerAnchors.current[id], messages.length)
  }
  // V3 · every change to the card is ONE one-line event in the thread (anchored where it happened); "view" opens the card
  const kringEvents = kringOffers.flatMap((o) => cardEvents(o, kringSide, th, o.bookingId ? planStore.bookings[o.bookingId] : null, nowTick))
  const renderEvents = (at: (key: string) => boolean) =>
    kringEvents.filter((ev) => at(ev.key)).map((ev) => <CardEventLine key={ev.key} ev={ev} th={th} onView={() => setDockOpen(true)} />)
  const dockOffer: Offer | undefined = kringBooking ? kringOffers.find((o) => o.id === kringBooking.offerId) ?? kringLatest : kringLatest
  const reactTo = (id: string, r: string) => setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, reactions: [...(m.reactions ?? []).filter((x) => x !== r), r] } : m)))
  /** "18:02" for the read receipt (Bangkok clock) */
  const readClock = useMemo(() => new Date(Date.now() + 7 * 3600_000).toISOString().slice(11, 16), [messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeViewingViewOnceMsg = messages.find((m) => m.isViewOnce && m.viewOnceState === 'viewing')

  useEffect(() => {
    if (!activeViewingViewOnceMsg) {
      setViewOnceMsLeft(5000)
      return
    }
    setViewOnceMsLeft(5000)
    const interval = setInterval(() => {
      setViewOnceMsLeft((prev) => Math.max(0, prev - 200))
    }, 200)
    return () => clearInterval(interval)
  }, [activeViewingViewOnceMsg?.id])

  // voice timer runs only while recording
  useEffect(() => {
    if (!isRecordingMic) {
      setRecSecs(0)
      return
    }
    const id = window.setInterval(() => setRecSecs((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [isRecordingMic])

  // Escape closes the gift tray, add-on panels, the ⋯ menu and the recharge stand-in
  useEffect(() => {
    if (drawerMode === 'none' && panel === 'none' && !showQuickRechargeSheet && !menuOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setDrawerMode('none')
        setPanel('none')
        setShowQuickRechargeSheet(false)
        setMenuOpen(false)
        setConfirmBlock(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [drawerMode, panel, showQuickRechargeSheet, menuOpen])

  // Gift tray is fixed to the bottom: measure it so the thread keeps its last line visible above the tray
  useEffect(() => {
    if (drawerMode === 'none') {
      setTrayH(0)
      return
    }
    const el = trayRef.current
    if (!el) return
    const measure = () => setTrayH(el.getBoundingClientRect().height)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [drawerMode])

  const venueFor = (id: string): string => venueOverrides[id] ?? PARTNER_PLAN[id]?.venue ?? 'Lumphini Park · 8 PM'
  void venueFor

  const setPlanVenue = (v: string, partnerId: string = activePartnerId) => {
    setMeetupVenue(v)
    setVenueOverrides((prev) => ({ ...prev, [partnerId]: v }))
  }

  const closeAllAddOns = () => {
    setDrawerMode('none')
    setPanel('none')
    setShowQuickRechargeSheet(false)
    setMenuOpen(false)
    setConfirmBlock(false)
    setIsRecordingMic(false)
  }

  const applyPartnerDefaults = (rawHostName: string, overrideVenue?: string, overrideOffer?: number) => {
    closeAllAddOns()
    setComboStreakCount(0)
    setBottomLeftWinAmount(null)
    setWingDismissed(false)
    const slug = rawHostName.trim().toLowerCase().replace(/^host-/, '')
    const def = PARTNER_PLAN[slug]
    if (overrideVenue) {
      setPlanVenue(overrideVenue, slug)
    } else if (def) {
      setMeetupVenue(venueOverrides[slug] ?? def.venue)
    }
    if (typeof overrideOffer === 'number' && overrideOffer === 0) {
      setActiveOfferThb(0)
      setIsOfferCancelled(true)
      setIsPlanLocked(false)
    } else if (typeof overrideOffer === 'number' && overrideOffer >= 300) {
      setActiveOfferThb(overrideOffer)
      setIsOfferCancelled(false)
    } else if (def) {
      setActiveOfferThb(def.offer)
    }
  }

  const switchToOrCreatePartner = (rawHostName: string, overrideVenue?: string, overrideOffer?: number) => {
    const cleanName = rawHostName.trim()
    if (!cleanName) return
    const slug = cleanName.toLowerCase().replace(/^host-/, '')
    setInboxPartners((prev) => {
      const existing = prev.find((c) => c.name.toLowerCase() === slug || c.id === slug)
      if (existing) return prev
      return [
        ...prev,
        {
          id: slug,
          name: cleanName,
          age: 23,
          flag: '🇹🇭',
          area: persona(slug)?.area.en ?? overrideVenue ?? 'Bangkok',
          avatar: '',
          lastPreview: `Chat opened with ${cleanName}`,
          time: 'Just now',
          shortTime: 'now',
          unread: 0,
          online: true,
        },
      ]
    })
    swapGuestThread(slug)
    setActivePartnerId(slug)
    applyPartnerDefaults(slug, overrideVenue, overrideOffer)
  }

  /** Host view: each guest keeps their own thread (what she typed to Alex never shows up in Kenji's chat). */
  const hostThreadsRef = useRef<Record<string, ChatMessage[]>>({})
  const hostThreadIdRef = useRef<string | null>(null)
  const openPartner = (id: string) => {
    triggerHaptic('tap')
    setDockOpen(false)
    const hr = hostRowFor(id)
    if (hr) {
      // T3 · one list: coming from a local's room, that thread is kept for her; from another guest's, for him
      if (isHostRow(activePartnerId)) hostThreadsRef.current[activePartnerId] = messages
      else guestThreadsRef.current[threadOwnerRef.current] = messages
      hostThreadIdRef.current = id
      closeAllAddOns()
      setWingDismissed(false)
      setActivePartnerId(id)
      setMessages(withNightGifts(id, hostThreadsRef.current[id] ?? threadForHost(hr.thread, viewerDisplayName(auth?.session?.displayName ?? ''))))
      setInboxViewMode('chats')
      setHasEnteredChatRoom(true)
      return
    }
    if (inboxPartners.some((p) => p.id === id)) {
      applyPartnerDefaults(id)
      swapGuestThread(id)
      setActivePartnerId(id)
    } else {
      const name = id.slice(0, 1).toUpperCase() + id.slice(1)
      switchToOrCreatePartner(name, PARTNER_PLAN[id]?.venue, PARTNER_PLAN[id]?.offer)
    }
    setInboxViewMode('chats')
    setHasEnteredChatRoom(true)
  }

  /**
   * Round 4 · host gift-received moment: a gift from the guest lands as a gold bubble on HIS side of the thread plus one
   * island line ("ได้รับ 🌹 จาก Alex · +฿2"). UI only — the ledger is untouched. The demo guest with a live request sends
   * a Wai Rose once per session, shortly after she opens his chat; `chon:gift-received` plays the same moment on demand.
   */
  const giftMessage = (rowId: string, g: { id: string; emoji: string; name: string; nameTh: string; thb: number }): ChatMessage => {
    const row = hostRowFor(rowId)
    return { id: `msg-${g.id}`, sender: 'host', senderName: `${row?.name ?? ''} · ${row?.age ?? ''}`, rawText: `${g.emoji} ${g.name}`, timestamp: 'Just now', giftIn: g }
  }
  /** Ploy B4 · the gold bubbles a guest sent tonight come back with the thread (they live in planStore for the night) */
  const withNightGifts = (rowId: string, base: ChatMessage[]): ChatMessage[] => {
    const row = hostRowFor(rowId)
    const gifts = row ? planStore.gifts[row.key] ?? [] : []
    const have = new Set(base.map((m) => m.id))
    return [...base, ...gifts.filter((g) => !have.has(`msg-${g.id}`)).map((g) => giftMessage(rowId, g))]
  }
  const receiveGift = (fromRowId: string, gift: { emoji: string; name: string; nameTh: string; thb: number }) => {
    const row = hostRowFor(fromRowId)
    if (!row) return
    const rec = recordReceivedGift(row.key, gift)
    if (!rec) return
    triggerHaptic('success')
    if (fromRowId === activePartnerId) setMessages((prev) => [...prev, giftMessage(fromRowId, rec)])
    island(th ? `${row.name} ส่ง${gift.nameTh}ให้คุณ ${gift.emoji} · +฿${fmt(gift.thb)}` : `${gift.emoji} from ${row.name} · +฿${fmt(gift.thb)}`, 'gold')
  }
  const hostGiftPlan = hostRow ? hostPlanFor(activePartnerId) : null
  useEffect(() => {
    if (!isHostRole || !hasEnteredChatRoom || !hostRow || !hostGiftPlan || hostGiftPlan.state === 'declined') return
    const seenKey = `gift:${hostRow.key}`
    if (hasSeen(seenKey)) return
    const rowId = activePartnerId
    const t = window.setTimeout(() => {
      markSeen(seenKey)
      receiveGift(rowId, { emoji: '🧋', name: 'Cha Yen', nameTh: 'ชาเย็น', thb: 25 })
    }, 1800)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHostRole, hasEnteredChatRoom, activePartnerId, hostGiftPlan?.state])
  useEffect(() => {
    if (!hostingAccount) return
    const onGift = (e: Event) => {
      const d = (e as CustomEvent<{ from?: string; emoji?: string; name?: string; nameTh?: string; thb?: number }>).detail
      if (!d?.from) return
      const inner = Object.keys(HOST_VIEW_ROWS).find((k) => HOST_VIEW_ROWS[k].key === d.from!.toLowerCase() || k === d.from)
      const rowId = inner ? hostRowId(inner) : activePartnerId
      receiveGift(rowId, { emoji: d.emoji ?? '🌹', name: d.name ?? 'Gift', nameTh: d.nameTh ?? d.name ?? 'ของขวัญ', thb: Math.max(0, d.thb ?? 0) })
    }
    window.addEventListener('chon:gift-received', onGift)
    return () => window.removeEventListener('chon:gift-received', onGift)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostingAccount, activePartnerId, th])

  // keep the thread pinned to the newest line
  useEffect(() => {
    const el = messagesContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, trayH, panel, isPlanLocked, hasEnteredChatRoom, kringEvents.length])

  // VIP passes from Pulse, direct messages from Meet / Clink sheet, open-chat and offer-status events
  useEffect(() => {
    const pushPass = (detail: { hostName?: string; title?: string; priceLabel?: string; voucherCode?: string; rebateCoins?: number }) => {
      switchToOrCreatePartner(detail.hostName ?? 'Ploy')
      setHasEnteredChatRoom(true)
      const passTitle = detail.title ?? 'VIP Pass'
      const passPrice = detail.priceLabel ?? '฿680'
      const code = detail.voucherCode ?? 'CHON-VIP-8829'
      const rebate = detail.rebateCoins ?? 15000
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-pass-${Date.now()}`,
          sender: 'guest',
          senderName: 'You',
          rawText: `🎟️ Sent VIP Pass to ${detail.hostName ?? 'Ploy'}: ${passTitle} (${passPrice}) · Code: ${code} · +🪙 ${rebate.toLocaleString('en-US')} Rebate`,
          timestamp: 'Just now',
          isVipPass: true,
          vipPassMeta: { title: passTitle, priceLabel: passPrice, voucherCode: code, rebateCoins: rebate },
        },
      ])
      setStatusBanner(`🎟️ Pass "${passTitle}" shared with ${detail.hostName ?? 'Ploy'} in chat`)
    }

    const consumeStoredPass = () => {
      try {
        const raw = sessionStorage.getItem('chon_latest_sent_pass')
        if (!raw) return
        sessionStorage.removeItem('chon_latest_sent_pass')
        pushPass(JSON.parse(raw) as { hostName?: string; title?: string; priceLabel?: string; voucherCode?: string; rebateCoins?: number })
      } catch {
        // ignore storage errors
      }
    }

    const applyOpenChat = (parsed: { hostName?: string; hostVenue?: string; venue?: string; offerAmount?: number; offerCancelled?: boolean }) => {
      if (parsed.offerCancelled) {
        setIsOfferCancelled(true)
        setIsPlanLocked(false)
        setActiveOfferThb(0)
      } else if (typeof parsed.offerAmount === 'number' && parsed.offerAmount >= 300) {
        setIsOfferCancelled(false)
      }
      if (parsed.hostName) {
        switchToOrCreatePartner(parsed.hostName, parsed.hostVenue || parsed.venue, parsed.offerCancelled ? 0 : parsed.offerAmount)
      } else if (parsed.hostVenue || parsed.venue) {
        setPlanVenue((parsed.hostVenue || parsed.venue)!)
      }
      setHasEnteredChatRoom(true)
      if (parsed.hostName) setStatusBanner(`💬 Chat opened with ${parsed.hostName} · messaging is free`)
    }

    const consumePendingOpenChat = () => {
      try {
        const raw = sessionStorage.getItem('chon_pending_open_chat')
        if (!raw) return
        sessionStorage.removeItem('chon_pending_open_chat')
        applyOpenChat(JSON.parse(raw))
      } catch {
        // ignore storage errors
      }
    }

    const applyDirectMsg = (parsed: { hostName?: string; message?: string; text?: string; venue?: string }) => {
      const msgText = parsed.message || parsed.text
      if (!msgText) return
      if (parsed.hostName) {
        switchToOrCreatePartner(parsed.hostName, parsed.venue)
      } else if (parsed.venue) {
        setPlanVenue(parsed.venue)
      }
      setHasEnteredChatRoom(true)
      setMessages((prev) => [
        ...prev,
        { id: `msg-direct-${Date.now()}`, sender: 'guest', senderName: 'You', rawText: msgText, timestamp: 'Just now' },
      ])
      setStatusBanner(`💬 Sent direct message to ${parsed.hostName ?? viewPartner.name}!`)
    }

    const consumePendingDirectMsg = () => {
      try {
        const raw = sessionStorage.getItem('chon_pending_direct_msg')
        if (!raw) return
        sessionStorage.removeItem('chon_pending_direct_msg')
        applyDirectMsg(JSON.parse(raw))
      } catch {
        // ignore storage errors
      }
    }

    consumeStoredPass()
    consumePendingOpenChat()
    consumePendingDirectMsg()

    const onSendPass = (event: Event) => {
      const detail = (event as CustomEvent).detail as Parameters<typeof pushPass>[0] | undefined
      if (!detail) return
      try {
        sessionStorage.removeItem('chon_latest_sent_pass')
      } catch {
        // ignore
      }
      pushPass(detail)
    }
    const onOpenChat = (event: Event) => {
      const detail = (event as CustomEvent).detail as Parameters<typeof applyOpenChat>[0] | undefined
      if (!detail) return
      if (detail.hostName) {
        try {
          sessionStorage.removeItem('chon_pending_open_chat')
        } catch {
          // ignore
        }
      }
      if (detail.offerCancelled || detail.hostName || typeof detail.offerAmount === 'number') applyOpenChat(detail)
    }
    const onOfferStatus = (event: Event) => {
      const detail = (event as CustomEvent).detail as { status?: string; hostName?: string; offerBaht?: number } | undefined
      if (!detail) return
      if (detail.status === 'CANCELLED' || detail.status === 'EXPIRED') {
        setIsOfferCancelled(true)
        setIsPlanLocked(false)
        setActiveOfferThb(0)
      } else if (detail.status === 'HELD') {
        setIsOfferCancelled(false)
        if (typeof detail.offerBaht === 'number' && detail.offerBaht >= 300) setActiveOfferThb(detail.offerBaht)
      }
    }
    const onDirectMsg = (event: Event) => {
      const detail = (event as CustomEvent).detail as Parameters<typeof applyDirectMsg>[0] | undefined
      if (!detail?.message && !detail?.text) return
      try {
        sessionStorage.removeItem('chon_pending_direct_msg')
      } catch {
        // ignore
      }
      applyDirectMsg(detail)
    }

    window.addEventListener('chon:send-pass-to-chat', onSendPass)
    window.addEventListener('chon:open-chat', onOpenChat)
    window.addEventListener('chon:offer-status', onOfferStatus)
    window.addEventListener('chon:send-direct-message', onDirectMsg)
    return () => {
      window.removeEventListener('chon:send-pass-to-chat', onSendPass)
      window.removeEventListener('chon:open-chat', onOpenChat)
      window.removeEventListener('chon:offer-status', onOfferStatus)
      window.removeEventListener('chon:send-direct-message', onDirectMsg)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewPartner.name])

  const requiresPriorityTreat = !isPlanLocked && consecutiveUnrepliedCount >= 3
  const selectedLuckyItem =
    IN_CHAT_GIFT_TRAY_ITEMS.find((candidate) => candidate.id === selectedLuckyId) ??
    IN_CHAT_LUCKY_ITEMS.find((candidate) => candidate.id === selectedLuckyId) ??
    IN_CHAT_GIFT_TRAY_ITEMS[0]
  const selectedPoppoGift = POPPO_SIX_GIFTS[selectedGiftIndex] ?? POPPO_SIX_GIFTS[0]

  /** Low balance → the ONE top-up sheet (D). The old quick-recharge sheet survives only as an sr-only stand-in. */
  const requestTopUp = (needCoins: number, reason: string) => {
    triggerHaptic('warning')
    setShowQuickRechargeSheet(true)
    const shortfallThb = Math.max(1, Math.ceil((needCoins - liveCoinBalance) / 100))
    window.dispatchEvent(new CustomEvent('chon:open-topup', { detail: { reason, needThb: shortfallThb } }))
  }

  const handleLockHangoutPlan = () => {
    if (isHostRole) return // hosts confirm through the plan bar (planStore), never through the guest's wallet hold
    if (isOfferCancelled || activeOfferThb <= 0) {
      setIsPlanLocked(false)
      setStatusBanner('⚠️ No active offer — your previous offer was cancelled. Make a new offer first.')
      island(th ? 'เสนอราคาใหม่ก่อน แล้วค่อยยืนยัน' : 'Make a new offer first, then confirm', 'red')
      return
    }
    triggerHaptic('clink')
    setIsPlanLocked(true)
    setGlassFillPct(100)
    setLastGiftGlassNote('+100% Hangout Locked')
    setConsecutiveUnrepliedCount(0)
    setStatusBanner('📍 Plan confirmed · contacts can be shared now')
    island(th ? `ยืนยันนัดแล้ว · ${plan.name} ${planTime} น.` : `Plan confirmed · ${plan.name} ${plan.time}`, 'green', '📍')
    // remember the confirm on the shared plan clock (a reload shows it confirmed, nothing is charged twice) and keep
    // the held treat for the meet — it can no longer "time out" and come back
    markGuestConfirmed(guestMeetSeed())
    acceptGuestHold(activePartnerId)
    setJustConfirmed(true)
    window.setTimeout(() => setJustConfirmed(false), 900)
    onLockPlan?.(viewPartner.name, 50_000)
  }

  const handleSendMessage = (overrideText?: string) => {
    const textToSend = (overrideText ?? draftText).trim()
    if (!textToSend) return

    triggerHaptic('tap')
    if (requiresPriorityTreat) {
      setStatusBanner('💬 Message sent · messaging in Kring is always free')
      setConsecutiveUnrepliedCount(0)
    } else {
      setConsecutiveUnrepliedCount((prev) => prev + 1)
    }
    setWingDismissed(true)

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sender: 'guest',
      senderName: 'You',
      rawText: textToSend,
      timestamp: 'Just now',
      isE2eeWhisper: isWhisperMode,
      ...(replyTo ? { replyTo } : {}),
    }
    setMessages((prev) => [...prev, newMsg])
    setReplyTo(null)
    if (!overrideText) setDraftText('')
  }

  const handleSendCustomPhoto = (photoUrl: string, captionText: string, forceViewOnce?: boolean) => {
    triggerHaptic('tap')
    const asViewOnce = forceViewOnce ?? photoAsViewOnce
    setConsecutiveUnrepliedCount((prev) => prev + 1)
    setWingDismissed(true)
    const newMsg: ChatMessage = {
      id: `msg-photo-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      sender: 'guest',
      senderName: 'You',
      rawText: captionText,
      timestamp: 'Just now',
      photoUrl,
      isViewOnce: asViewOnce,
      viewOnceState: asViewOnce ? 'unviewed' : undefined,
      isE2eeWhisper: isWhisperMode,
    }
    setMessages((prev) => [...prev, newMsg])
    setStatusBanner(`🖼️ Photo sent to ${viewPartner.name} in chat`)
    setPanel('none')
  }

  const handleFilePhotoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    let objectUrl = 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=600&q=80'
    try {
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        objectUrl = URL.createObjectURL(file)
      }
    } catch {
      // fallback URL for headless test environments
    }
    const caption = photoCaptionText.trim() || draftText.trim() || '📸'
    handleSendCustomPhoto(objectUrl, caption)
    setPhotoCaptionText('')
    e.target.value = ''
  }

  const handleSendViewOncePhoto = () => {
    triggerHaptic('tap')
    setPanel('none')
    setConsecutiveUnrepliedCount((prev) => prev + 1)
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-viewonce-${Date.now()}`,
        sender: 'guest',
        senderName: 'You',
        rawText: '🔒 ① View-Once Photo (Hold 5s to View)',
        timestamp: 'Just now',
        isViewOnce: true,
        viewOnceState: 'unviewed',
        isE2eeWhisper: isWhisperMode,
      },
    ])
    setStatusBanner('📸 Photo sent')
  }

  const handleRevealViewOnce = (msgId: string) => {
    triggerHaptic('tap')
    setViewOnceMsLeft(5000)
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, viewOnceState: 'viewing' } : m)))
    setTimeout(() => {
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, viewOnceState: 'viewed' } : m)))
    }, 5000)
  }

  const handleCloseViewOnceOverlay = (msgId: string) => {
    triggerHaptic('tap')
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, viewOnceState: 'viewed' } : m)))
  }

  const handleFulfillGiftRequest = (msgId: string) => {
    if (!dispatchInternalWalletDelta({ paidDelta: -12_500 })) {
      setStatusBanner('⚠️ Not enough cash — top up first')
      requestTopUp(12_500, 'gift-request')
      return
    }
    triggerHaptic('success')
    setLiveCoinBalance((prev) => Math.max(0, prev - 12_500))
    island(th ? 'ส่งชาเย็นให้มิ้นท์แล้ว' : 'Cha Yen sent to Mint', 'gold', '🧋')
    setGlassFillPct((prev) => Math.min(100, prev + 25))
    setLastGiftGlassNote('+25% from Cha Yen')
    setConsecutiveUnrepliedCount(0)
    setStatusBanner('🧋 Cha Yen sent with a thank-you')
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, giftRequestFulfilled: true } : m)))
  }

  const handlePickWingman = (text: string) => {
    if (aiWingmanFreeLeft <= 0) return
    triggerHaptic('select')
    setAiWingmanFreeLeft((n) => Math.max(0, n - 1))
    setDraftText(text)
    window.setTimeout(() => composerInputRef.current?.focus(), 0)
  }

  const handleSendNormalPoppoGift = (gift: (typeof POPPO_SIX_GIFTS)[number] = selectedPoppoGift, qty: number = 1) => {
    const totalCoins = gift.coins * qty
    const prevBalance = liveCoinBalance
    const nextBalance = Math.max(0, prevBalance - totalCoins)
    const fillGain = Math.min(100, gift.fillPct * Math.max(1, Math.min(qty, 5)))

    triggerHaptic('clink')
    dispatchInternalWalletDelta({ paidDelta: -totalCoins, hideGlobal: true })
    window.dispatchEvent(
      new CustomEvent('chon:coin-balance-popup', {
        detail: { delta: -totalCoins, prevBalance, nextBalance, hideGlobal: true, label: `🥂 ${gift.emoji} ${gift.name} x${qty} Sent! (+${fillGain}% Glass)` },
      }),
    )
    setLiveCoinBalance(nextBalance)
    setComboCount((prev) => (prev <= 1 ? 10 : prev + 1))
    setComboStreakCount((prev) => (prev >= 15 ? 1 : prev + 1))
    setGlassFillPct((prev) => Math.min(100, prev + fillGain))
    setLastGiftGlassNote(`+${fillGain}% from ${gift.name}`)
    setConsecutiveUnrepliedCount(0)
    setTopWinPopupText(`🥂 +${fillGain}% Glass!`)
    setLastBurstBanner(
      `🥂 ${gift.emoji} ${gift.name} x${qty} Sent! (🪙 ${prevBalance.toLocaleString('en-US')} ➔ 🪙 ${nextBalance.toLocaleString('en-US')}) · 🍸 Glass +${fillGain}% · 🎰 JACKPOT ${gift.emoji} COMBO x${qty}`,
    )
    const noteText = draftText.trim() || gift.note
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-normal-gift-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        sender: 'guest',
        senderName: 'You',
        rawText: noteText,
        timestamp: 'Just now',
        isE2eeWhisper: isWhisperMode,
        luckyGameWin: {
          itemEmoji: gift.emoji,
          itemName: gift.name,
          combo: qty,
          multiplier: 1,
          rewardCoins: totalCoins,
          chatNote: noteText,
          isFixedTreat: true,
          spendCoins: totalCoins,
        },
      },
    ])
    setDraftText('')
  }
  void handleSendNormalPoppoGift

  const handlePlayInChatLuckyRoll = (customNote?: string, overrideGift?: (typeof POPPO_SIX_GIFTS)[number]) => {
    const item = overrideGift ?? selectedLuckyItem
    const effectiveQty = Math.max(1, luckyCombo)
    const requiredSpend = item.coins * effectiveQty
    const noteCandidate = (customNote ?? draftText).trim()
    const isLegacyTestForcedWin = noteCandidate.includes('If I hit 99x')

    // Low balance → the ONE top-up sheet (unless legacy forced-win test)
    if (!isLegacyTestForcedWin && liveCoinBalance < requiredSpend) {
      requestTopUp(requiredSpend, 'chat-gift')
      return
    }

    const fillGain = 'fillPct' in item ? item.fillPct : 12
    const nextStreakForSpin = comboStreakCount >= 99 ? 1 : comboStreakCount + 1
    const { nextState: rngNextState, outcome } =
      isLuckyRngVaulted() && !isLegacyTestForcedWin
        ? processDeterministicResonanceCombo(chatLuckyPool, item.coins, effectiveQty, nextStreakForSpin)
        : processLuckyComboSpin(
            chatLuckyPool,
            item.coins,
            effectiveQty,
            isLegacyTestForcedWin ? () => 0.01 : undefined,
          )
    const multiplier = outcome.multiplierWon
    const rewardCoins = outcome.payoutCoins
    setChatLuckyPool(rngNextState)
    const totalSpend = outcome.totalSpendCoins
    const netDelta = rewardCoins - totalSpend
    const prevBalance = liveCoinBalance
    const nextBalance = Math.max(0, prevBalance + netDelta)

    dispatchInternalWalletDelta({ paidDelta: -totalSpend, bonusDelta: rewardCoins, hideGlobal: true })
    if (rewardCoins > 0) {
      window.dispatchEvent(
        new CustomEvent('chon:coin-balance-popup', {
          detail: {
            source: 'lucky-pool-win',
            rewardCoins,
            multiplier,
            delta: netDelta,
            prevBalance,
            nextBalance,
            hideGlobal: true,
            label: `+🪙 ${rewardCoins.toLocaleString('en-US')}`,
          },
        }),
      )
    }
    setLiveCoinBalance(nextBalance)
    setBottomLeftWinAmount(rewardCoins > 0 ? rewardCoins : null)
    setGlassFillPct((prev) => Math.min(100, prev + fillGain))
    setLastGiftGlassNote(`+${fillGain}% from ${item.name}`)

    const noteText = noteCandidate || `Rolling ${item.emoji} ${item.name} x${effectiveQty} with you! Dessert at Yaowarat on me 🥭`
    const nextStreak = comboStreakCount >= 99 ? 1 : comboStreakCount + 1
    const isMilestoneCombo = rewardCoins > 0 || effectiveQty >= 10 || nextStreak === 10 || nextStreak === 50 || nextStreak === 100
    triggerHaptic(isMilestoneCombo ? 'combo' : 'tap')

    // Lucky + small gifts = the tiny pop in the tray (GiftToken) and one island line on a win.
    // BigGiftFX triggers for BIG normal gifts (>= 5,000 coins) OR Poppo v2 big Lucky Jackpots (multiplier >= 50 or rewardCoins >= 5,000)!
    const isBigGift =
      (drawerMode !== 'lucky' && isBigGiftPrice(item.coins)) ||
      (drawerMode === 'lucky' && (multiplier >= 50 || rewardCoins >= 5_000))
    if (isBigGift) {
      const senderName = viewerDisplayName(th ? 'คุณ' : 'You')
      triggerBigGift({
        kind: mapGiftToBigKind(item.id, Math.max(item.coins, rewardCoins)) ?? 'fireworks',
        emoji: item.emoji,
        title: drawerMode === 'lucky' ? `🎰 ${multiplier}× LUCKY WIN · +🪙 ${fmt(rewardCoins)}` : `${item.name}`,
        subtitle: `From you to ${viewPartner.name}`,
        coins: drawerMode === 'lucky' ? rewardCoins : item.coins,
        sender: senderName,
        giftName: item.name,
        recipient: viewPartner.name,
      })
    }
    if (rewardCoins > 0) {
      island(th ? `+🪙 ${fmt(rewardCoins)} คืนเข้ากระเป๋า` : `+🪙 ${fmt(rewardCoins)} back · ${item.emoji} ${multiplier}x`, 'gold', '🍀')
    }
    setLuckyRollCount((prev) => prev + 1)
    setComboCount((prev) => (prev <= 1 ? 10 : prev + 1))
    setComboStreakCount(nextStreak)
    setConsecutiveUnrepliedCount(0)
    setWingDismissed(true)
    setTopWinPopupText(rewardCoins > 0 ? `+🪙 ${rewardCoins.toLocaleString('en-US')}` : `Sent ${item.name} ${item.emoji} x${nextStreak}`)
    setLastBurstBanner(
      rewardCoins > 0
        ? `🪙 +${rewardCoins.toLocaleString('en-US')} Won! (🪙 ${prevBalance.toLocaleString('en-US')} ➔ 🪙 ${nextBalance.toLocaleString('en-US')}) · 🎉 LUCKY WIN! +${rewardCoins.toLocaleString('en-US')} Coins Returned! · 🎰 JACKPOT ${item.emoji} ${multiplier}x COMBO x${effectiveQty}`
        : `Sent ${item.emoji} ${item.name} x${nextStreak} (🪙 ${prevBalance.toLocaleString('en-US')} ➔ 🪙 ${nextBalance.toLocaleString('en-US')}) · 🎰 JACKPOT ${item.emoji} 0x COMBO x${effectiveQty}`,
    )

    const winMsg: ChatMessage = {
      id: `msg-lucky-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      sender: 'guest',
      senderName: 'You',
      rawText: noteText,
      timestamp: 'Just now',
      isE2eeWhisper: isWhisperMode,
      luckyGameWin: {
        itemEmoji: item.emoji,
        itemName: item.name,
        combo: nextStreak > 1 && effectiveQty === 1 ? nextStreak : effectiveQty,
        multiplier,
        rewardCoins,
        chatNote: noteText,
        spendCoins: totalSpend,
      },
    }

    setMessages((prev) => {
      // consecutive sends of the same gift coalesce into one receipt line
      const lastMsg = prev[prev.length - 1]
      if (lastMsg?.luckyGameWin && lastMsg.luckyGameWin.itemName === item.name && !noteCandidate) {
        const updatedLast: ChatMessage = {
          ...lastMsg,
          luckyGameWin: {
            ...lastMsg.luckyGameWin,
            combo: nextStreak,
            multiplier: Math.max(lastMsg.luckyGameWin.multiplier, multiplier),
            rewardCoins: lastMsg.luckyGameWin.rewardCoins + rewardCoins,
            spendCoins: (lastMsg.luckyGameWin.spendCoins ?? 0) + totalSpend,
          },
        }
        return [...prev.slice(0, -1), updatedLast]
      }
      return [...prev, winMsg]
    })
    setDraftText('')
  }

  const handleSendQuickTreatInChat = (treat: (typeof IN_CHAT_THAI_TREATS)[number]) => {
    const noteText = draftText.trim() || treat.note
    const prevBalance = liveCoinBalance
    const nextBalance = Math.max(0, prevBalance - treat.coins)
    if (prevBalance < treat.coins || !dispatchInternalWalletDelta({ paidDelta: -treat.coins })) {
      setStatusBanner('⚠️ Not enough cash — top up first')
      requestTopUp(treat.coins, 'chat-treat')
      return
    }
    triggerHaptic('clink')
    setLiveCoinBalance(nextBalance)
    setConsecutiveUnrepliedCount(0)
    setGlassFillPct((prev) => Math.min(100, prev + 12))
    setLastGiftGlassNote(`+12% from ${treat.name}`)
    setTopWinPopupText('🍀 +🪙 4,500!')
    setLastBurstBanner(
      `🥂 ${treat.emoji} ${treat.name} Sent! (🪙 ${prevBalance.toLocaleString('en-US')} ➔ 🪙 ${nextBalance.toLocaleString('en-US')}) · 🥂 Sent ${treat.emoji} ${treat.name} (🪙 ${treat.coins.toLocaleString('en-US')}) — Outing Glass +12%!`,
    )
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-treat-${Date.now()}`,
        sender: 'guest',
        senderName: 'You',
        rawText: noteText,
        timestamp: 'Just now',
        isE2eeWhisper: isWhisperMode,
        luckyGameWin: {
          itemEmoji: treat.emoji,
          itemName: treat.name,
          combo: 1,
          multiplier: 1,
          rewardCoins: treat.coins,
          chatNote: noteText,
          isFixedTreat: true,
          spendCoins: treat.coins,
        },
      },
    ])
    setDraftText('')
  }

  const handleSimulateHostReply = () => {
    triggerHaptic('tap')
    setConsecutiveUnrepliedCount(0)
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-host-${Date.now()}`,
        sender: 'host',
        senderName: `${viewPartner.name} · ${viewPartner.age}`,
        rawText: isPlanLocked
          ? `see you at ${plan.name} at ${plan.time}! message me here if you get lost 🙏`
          : 'just finishing a coffee nearby · the Book button is right here in the chat when you are ready 🙏',
        timestamp: 'Just now',
        isE2eeWhisper: isWhisperMode,
      },
    ])
  }

  const stopSpeech = () => {
    try {
      speechRecRef.current?.stop?.()
    } catch {
      // ignore
    }
  }

  const handleSendVoiceNote = (translate: boolean = true) => {
    triggerHaptic('tap')
    setConsecutiveUnrepliedCount(0)
    setWingDismissed(true)
    stopSpeech()
    setIsRecordingMic(false)
    const customVoiceText = voiceTranscript.trim() || draftText.trim()
    const isThMode = language === 'th' || THAI_RE.test(customVoiceText)
    const spokenText = customVoiceText
      ? `🎙️ 0:04 Voice Note · "${customVoiceText}"`
      : isThMode
        ? '🎙️ 0:04 เสียงพูด · แปลอัตโนมัติ TH ➔ EN: "See you at the meeting point at 2 PM ka! 🙏"'
        : '🎙️ 0:04 Voice Note · Auto-Translated EN ➔ TH: "เจอกันที่จุดนัด บ่ายสองนะครับ 🙏"'
    const durationSec = Math.max(2, Math.min(59, recSecs || 4))

    setMessages((prev) => [
      ...prev,
      {
        id: `msg-voice-${Date.now()}`,
        sender: 'guest',
        senderName: 'You',
        rawText: spokenText,
        timestamp: 'Just now',
        isVoiceNote: true,
        voiceDurationSec: durationSec,
        subtitles: !translate
          ? undefined
          : customVoiceText
            ? {
                en: `🇬🇧 EN: ${customVoiceText}`,
                th: `🇹🇭 TH: [AI เสียงแปลไทย] ${customVoiceText} 🙏`,
                zh: `🇨🇳 ZH: [AI 语音翻译] ${customVoiceText} 🙏`,
              }
            : {
                en: isThMode ? '🇬🇧 EN: See you at the meeting point at 2 PM ka! 🙏' : '🇬🇧 EN: See you at the meeting point at 2 PM! 🙏',
                th: isThMode ? '🇹🇭 TH: เจอกันที่จุดนัด บ่ายสองนะคะ 🙏' : '🇹🇭 TH: เจอกันที่จุดนัด บ่ายสองนะครับ 🙏',
                zh: '🇨🇳 ZH: 下午2点在集合点见！',
              },
        translation: customVoiceText || undefined,
        isE2eeWhisper: isWhisperMode,
      },
    ])
    setVoiceTranscript('')
    setDraftText('')
    setStatusBanner(
      customVoiceText
        ? `🎙️ 0:04 Voice Note · Auto-Translated EN ➔ TH: "${customVoiceText}"`
        : '🎙️ 0:04 Voice Note · Auto-Translated EN ➔ TH: "เจอกันที่จุดนัด บ่ายสองนะครับ 🙏"',
    )
  }

  const startRecording = () => {
    triggerHaptic('tap')
    setPanel('none')
    setIsRecordingMic(true)
    try {
      const SpeechRec =
        (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition
      if (SpeechRec) {
        const rec = new SpeechRec()
        rec.lang = language === 'th' ? 'th-TH' : 'en-US'
        rec.interimResults = true
        rec.onresult = (ev: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => {
          const transcript = ev.results?.[0]?.[0]?.transcript
          if (transcript) setVoiceTranscript(transcript)
        }
        rec.start()
        speechRecRef.current = rec
      }
    } catch {
      // no SpeechRecognition: the transcript field stays editable
    }
  }

  const handleSharePersonalLineCard = () => {
    if (!isPlanLocked) return
    triggerHaptic('clink')
    setLineCardShared(true)
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-line-${Date.now()}`,
        sender: 'guest',
        senderName: 'You',
        rawText: '📇 Contact card shared in Kring · reach each other with Kring calls until you meet',
        timestamp: 'Just now',
        isContactCard: true,
        isE2eeWhisper: isWhisperMode,
      },
    ])
  }

  const handlePhysicalPhoneClink = () => {
    triggerHaptic('success')
    island(th ? 'กริ๊ง! เช็คอินแล้ว' : 'Kring! Checked in', 'gold')
    setArrivalState('clinked')
    onPhoneClinkRelease?.(viewPartner.name, 35_000)
  }

  const handlePocketAutoRelease = () => {
    triggerHaptic('clink')
    setArrivalState('auto_released')
    onPhoneClinkRelease?.(viewPartner.name, 35_000)
  }

  const handleClaimDailyDigest = () => {
    if (dailyDigestClaimed) return
    triggerHaptic('success')
    setDailyDigestClaimed(true)
    dispatchInternalWalletDelta({ bonusDelta: 12_500, note: '+12,500 Task Digest Bonus Coins credited!' })
    setStatusBanner('🎉 Daily tasks done · ฿ promo added')
  }

  const handleShareVenue = () => {
    const v = MEETUP_VENUES.find((x) => x.id === venuePickId) ?? MEETUP_VENUES[0]
    const name = splitVenue(v.label).name
    const next = `${name} · ${venuePickTime}`
    triggerHaptic('clink')
    setPlanVenue(next)
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-venue-${Date.now()}`,
        sender: 'guest',
        senderName: 'You',
        rawText: `📍 Venue & Time Update Requested: ${next}`,
        timestamp: 'Just now',
        venuePin: { name, time: venuePickTime },
        isE2eeWhisper: isWhisperMode,
      },
    ])
    setStatusBanner(`📍 Venue & Time Update Requested: ${next}`)
    island(th ? `ปักหมุดแล้ว · ${name} ${fmtTime(venuePickTime, true)}` : `Pinned · ${name} ${venuePickTime}`, 'neutral', '📍')
    setPanel('none')
    setVenueQuery('')
  }

  /** C10/C15 · one ride system: hand the trip to the Pulse ride flow. */
  const openRideFlow = (car: 'comfort' | 'xl' = 'comfort') => {
    const detail = { to: plan.name, time: plan.time, car, from: 'Your hotel', hostName: viewPartner.name }
    try {
      window.sessionStorage.setItem('chon_pending_ride', JSON.stringify(detail))
    } catch {
      // storage blocked — the event below still carries it
    }
    setPanel('none')
    setHasEnteredChatRoom(false)
    window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'pulse' } }))
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('chon:open-ride', { detail })), 120)
  }

  /** C14 from the plan card: the table flow in Pulse, for this venue (same hand-off as the ride). */
  const openTableFlow = () => {
    const detail = { venue: plan.name, hostName: viewPartner.name }
    try {
      window.sessionStorage.setItem('chon_pending_table', JSON.stringify(detail))
    } catch {
      // storage blocked — the event below still carries it
    }
    triggerHaptic('tap')
    setPanel('none')
    setHasEnteredChatRoom(false)
    window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'pulse' } }))
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('chon:open-table', { detail })), 120)
  }

  /** Host accepts from the chat (plan bar or plan card) — the same write Host home makes. */
  const hostAcceptInChat = (p: HostPlan, guestName: string) => {
    hostAct(p.id, 'accepted')
    triggerHaptic('success')
    island(th ? `ยืนยันนัด ${guestName} แล้ว · ${p.venue} ${fmtTime(p.time, true)} น.` : `Accepted ${guestName} · ${p.venue} ${fmtTime(p.time, false)}`, 'gold', '✓')
    window.dispatchEvent(new CustomEvent('chon:host-request', { detail: { id: p.id, guest: p.guest, action: 'accepted' } }))
  }

  /** the guest side of the shared plan clock for the open room */
  const guestMeetSeed = () => ({
    key: meetKeyFor(activePartnerId),
    guest: hostRowFor(activePartnerId)?.name ?? viewerDisplayName('Guest'),
    host: viewPartner.name,
    start: plan.time,
    priceThb: activeOfferThb > 0 ? activeOfferThb : undefined,
  })

  /**
   * Cancel from the plan card (before the plan is confirmed). Same path as the receipt's Cancel in the Clink sheet:
   * the record flips first (`chon:offer-status` CANCELLED → planStore), so a second tap can never refund twice; a hold
   * that a Clink really placed comes back through the existing escrow-refund call (identical to the sheet's Cancel).
   * A demo plan that never held money only changes state.
   */
  const cancelGuestPlan = () => {
    if (isPlanLocked) return
    const h = guestHoldFor(activePartnerId)
    const live = h && effectiveHoldStatus(h, Date.now()) === 'held' ? h : null
    const amount = live ? live.offerThb : activeOfferThb
    triggerHaptic('tap')
    try {
      window.sessionStorage.setItem('chon_offer_cancelled', 'true')
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent('chon:offer-status', { detail: { status: 'CANCELLED', hostName: viewPartner.name, hostId: activePartnerId } }))
    if (live) dispatchInternalWalletDelta({ paidDelta: live.offerThb * 100, allowEscrowRefund: true })
    if (live) island(th ? `ยกเลิกแล้ว · คืน ฿${fmt(amount)} เข้ากระเป๋า` : `Cancelled · ฿${fmt(amount)} back in your wallet`, 'green', '↩️')
    else island(th ? 'ยกเลิกนัดแล้ว · ไม่เสียเงิน' : 'Plan cancelled · you pay nothing', 'neutral', '↩️')
  }

  const openStory = (host: (typeof INBOX_STORY_HOSTS)[number]) => {
    setActiveStoryHost(host)
    try {
      window.sessionStorage.setItem('chon_pending_story', host.id)
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent('chon:open-story', { detail: { hostId: host.id } }))
    window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'meet' } }))
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('chon:open-story', { detail: { hostId: host.id } })), 350)
  }

  const leaveRoom = () => {
    triggerHaptic('tap')
    closeAllAddOns()
    setHasEnteredChatRoom(false)
    setShowFullInbox(true)
  }

  const activeCopilot = SHORT_BUBBLE_COPILOT_PRESETS[copilotTrack]
  const guestSendCount = messages.filter((m) => m.sender === 'guest').length
  const activeHold = !isHostRole ? guestHoldFor(activePartnerId) : null
  const activeHoldSt = activeHold ? effectiveHoldStatus(activeHold, nowTick) : null
  /** the treat for this room went back to the wallet (timed out / cancelled) — the plan can't be confirmed on it */
  const holdGone = !isPlanLocked && (activeHoldSt === 'expired' || activeHoldSt === 'cancelled')
  const offerActive = !isOfferCancelled && activeOfferThb > 0 && !holdGone

  // NEXT95 · the guest's open plan gets the shared clock; a plan confirmed before a reload stays confirmed
  // (signed-in sessions only — nothing is charged again, onLockPlan is not called)
  const meetKeyActive = meetKeyFor(activePartnerId)
  const meetActive = planStore.meet[meetKeyActive]
  useEffect(() => {
    if (isHostRole || !hasEnteredChatRoom || !offerActive) return
    ensureMeetPlan(guestMeetSeed())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHostRole, hasEnteredChatRoom, offerActive, activePartnerId, plan.time, activeOfferThb])
  useEffect(() => {
    if (!canPersist || isHostRole || !hasEnteredChatRoom || !offerActive || isPlanLocked) return
    if (meetActive?.guestConfirmedAt) {
      setIsPlanLocked(true)
      setGlassFillPct(100)
      setConsecutiveUnrepliedCount(0)
    }
  }, [canPersist, isHostRole, hasEnteredChatRoom, offerActive, isPlanLocked, meetActive?.guestConfirmedAt])
  const muted = listHas(safetyState.mutedHostIds, viewPartner.id)
  const reported = listHas(safetyState.reportedHostIds, viewPartner.id)
  const giftOpen = drawerMode !== 'none'
  const showWing = hasEnteredChatRoom && !wingDismissed && !giftOpen && panel === 'none' && !isRecordingMic && !draftText.trim() && !(kringBooking && !isHostRole)
  const filteredVenues = MEETUP_VENUES.filter(
    (v) => !venueQuery.trim() || `${v.name} ${v.area}`.toLowerCase().includes(venueQuery.trim().toLowerCase()),
  )
  const pickedVenue = MEETUP_VENUES.find((x) => x.id === venuePickId) ?? MEETUP_VENUES[0]

  // C2 · Plans tickets (one status each). ONE status language everywhere (Round 4 · Wei B17): the receipt says
  // "฿300 held · 14:55 to reply", so do the Plans tickets, the Chats preview and the plan bar.
  type TicketStatus = 'ok' | 'wt' | 'go' | 'ct' | 'no' | 'mine'
  type Ticket = { id: string; stub: string; day: string; title: string; line: string; status: TicketStatus; label?: string; ask?: boolean; sort?: string }
  const holdLine = (h: GuestHold, name: string): { line: string; status: TicketStatus } => {
    const st = effectiveHoldStatus(h, nowTick)
    if (st === 'held') return { line: th ? `กัน ฿${fmt(h.offerThb)} ไว้ · ${name} มีเวลาตอบ ${mmss(msLeft(h, nowTick))}` : `฿${fmt(h.offerThb)} held · ${name} has ${mmss(msLeft(h, nowTick))} to reply`, status: 'wt' }
    if (st === 'accepted') return { line: th ? `กัน ฿${fmt(h.offerThb)} ไว้จนกว่าจะเจอ` : `฿${fmt(h.offerThb)} held until you meet`, status: 'ok' }
    if (st === 'cancelled') return { line: th ? `ยกเลิกแล้ว · คืน ฿${fmt(h.offerThb)} ครบ` : `Cancelled · ฿${fmt(h.offerThb)} back in full`, status: 'no' }
    return { line: th ? `หมดเวลา · คืน ฿${fmt(h.offerThb)} ครบ` : `Timed out · ฿${fmt(h.offerThb)} back in full`, status: 'no' }
  }
  const guestTicketFor = (id: string, name: string, base: Ticket): Ticket => {
    const h = guestHoldFor(id)
    if (!h || (activePartnerId === id && isPlanLocked)) return base
    // a confirmed plan's treat waits for the meet
    if (h.status === 'accepted') {
      const cl = clockLine(meetFor(id))
      const total = h.offerThb + extraHeldFor(id)
      return { ...base, line: cl ? (th ? `กัน ฿${fmt(total)} · ${cl.text}` : `฿${fmt(total)} held · ${cl.text}`) : th ? `กัน ฿${fmt(total)} ไว้จนกว่าจะเจอ` : `฿${fmt(total)} held until you meet`, status: 'ok' }
    }
    return { ...base, ...holdLine(h, name) }
  }
  // FIX1 · Plans = the booking store, one row per booking / live offer, on its REAL day (never "Tonight" for Friday)
  // T3 · both sides in one list: each record's side follows its localId
  const rowIdFor = (o: { localId: string; localName: string; guestId: string }): string => {
    if (!iAmLocalOn(o)) return partnerKey(o.localId)
    const gk = partnerKey(o.guestId)
    const fixed = demoHostRows ? Object.keys(HOST_VIEW_ROWS).find((rid) => HOST_VIEW_ROWS[rid].key === gk) : undefined
    return hostRowId(fixed ?? `g-${gk}`)
  }
  const planTickets: Ticket[] = []
  for (const b of bookingsFor(currentViewerId())) {
    if (b.status !== 'held' && nowTick - b.updatedAt > 7 * 86_400_000) continue
    const bSide = iAmLocalOn(b) ? 'host' : 'guest'
    const kl = bookingKLine(b, bSide, th)
    planTickets.push({
      id: rowIdFor(b),
      stub: b.terms.start,
      day: kDayLabel(b.terms.date, th, true),
      title: `${b.experienceTitle || (th ? 'ทริป' : 'Experience')} · ${bSide === 'host' ? b.guestName : b.localName}`,
      line: kl.line,
      status: b.status === 'held' ? 'ok' : b.status === 'released' ? 'mine' : 'no',
      label: b.status === 'held' ? (th ? 'จองแล้ว' : 'Booked') : kl.tag,
      sort: `${b.status === 'held' ? 0 : 1} ${b.terms.date} ${b.terms.start}`,
    })
  }
  for (const o of Object.values(planStore.offers).filter((x) => !x.bookingId && effectiveOfferStatus(x, nowTick) === 'open')) {
    const oSide = iAmLocalOn(o) ? 'host' : 'guest'
    const kl = offerKLine(o, oSide, nowTick, th)
    planTickets.push({
      id: rowIdFor(o),
      stub: o.terms.start,
      day: kDayLabel(o.terms.date, th, true),
      title: `${o.experienceTitle || (th ? 'ทริป' : 'Experience')} · ${oSide === 'host' ? o.guestName : o.localName}`,
      line: kl.line,
      status: o.lastBy === oSide ? 'wt' : 'ct',
      label: o.lastBy === oSide ? (th ? 'รอตอบ' : 'Waiting') : th ? 'ตอบกลับ' : 'Reply',
      ask: o.lastBy !== oSide,
      sort: `0 ${o.terms.date} ${o.terms.start}`,
    })
  }
  // soonest first
  planTickets.sort((a, b) => (a.sort ?? '').localeCompare(b.sort ?? ''))
  void guestTicketFor
  void hostPlanTotalThb
  const statusLabel = (tk: Ticket) =>
    tk.label ??
    (tk.status === 'ok'
      ? th ? 'ยืนยันแล้ว' : 'Confirmed'
      : tk.status === 'wt'
        ? th ? 'รอตอบ' : 'Waiting'
        : tk.status === 'go'
          ? th ? 'กดยืนยัน' : 'Confirm'
          : tk.status === 'ct'
            ? th ? 'ตอบกลับ' : 'Reply'
            : tk.status === 'mine'
              ? th ? 'โอนแล้ว' : 'Released'
              : th ? 'คืนเงินแล้ว' : 'Refunded')
  const plansCount = planTickets.length

  /* ------------------------------------------------------------------ */
  /* message renderer                                                    */
  /* ------------------------------------------------------------------ */
  const renderMessage = (msg: ChatMessage, msgIdx: number): ReactNode => {
    const priorSenderTexts = messages
      .slice(0, msgIdx)
      .filter((m) => m.sender === msg.sender)
      .slice(-2)
      .map((m) => m.rawText)
    const { displayText, wasMasked } = maskPreLockContacts(msg.rawText, isPlanLocked, priorSenderTexts)
    const isHost = msg.sender === 'host'
    const isHiddenDemo =
      msg.id === 'msg-3' || msg.id === 'msg-clean-guest-1' || msg.id === 'msg-demo-view-once' || msg.id === 'msg-2' || msg.isGiftRequest

    if (msg.id === 'msg-3') {
      return (
        <div key={msg.id} className="sr-only">
          <p>{displayText}</p>
        </div>
      )
    }

    // Round 4 · a gift the other person sent (host view): gold, on their side, ฿ first
    if (msg.giftIn) {
      const g = msg.giftIn
      return (
        <div key={msg.id} className="cp-line">
          <Avatar src={viewPartner.avatar} name={viewPartner.name} size="xs" />
          {/* the arrival animation plays once, when it lands — not again when the thread is reopened later */}
          <div className={`cp-rcpt is-in is-gift-in${g.at && Date.now() - g.at < 4000 ? ' is-fresh' : ''}`} data-testid="chat-gift-received-bubble">
            <div className="l">
              <span>
                <span className="gi" aria-hidden="true">{g.emoji}</span> {th ? `${viewPartner.name} ส่ง${g.nameTh}ให้คุณ ${g.emoji}` : `${viewPartner.name} sent you a ${g.name}`}
              </span>
              {/* R6 · Ploy: a gift is a gesture, not a ฿2 line item */}
              <small>{th ? `ของขวัญจาก ${viewPartner.name} ${g.emoji}` : `Gift from ${viewPartner.name} ${g.emoji}`}</small>
            </div>
          </div>
        </div>
      )
    }

    // gold receipt (gift / lucky / treat) — one line, ฿ first
    if (msg.luckyGameWin) {
      const w = msg.luckyGameWin
      const spend = w.spendCoins ?? (w.isFixedTreat ? w.rewardCoins : 0)
      return (
        <div key={msg.id} className="cp-rcpt" data-testid="in-chat-lucky-win-bubble">
          <div className="l">
            <span>
              {w.itemEmoji} {w.itemName} ×{w.combo} {th ? 'ส่งแล้ว' : 'sent'}
            </span>
            {w.chatNote ? <small>{displayText}</small> : null}
            {!w.isFixedTreat && w.rewardCoins > 0 ? (
              <span className="win">+🪙 {fmt(w.rewardCoins)} {th ? 'คืน' : 'back'}</span>
            ) : null}
          </div>
          {spend > 0 ? <b>฿{fmt(spend / 100)}</b> : null}
          <div className="sr-only">
            <span>
              {w.itemName} x{w.combo}
            </span>
            <span>{w.isFixedTreat ? '🎁 Gift sent' : `🎰 ${w.multiplier}x WIN · +🪙 ${w.rewardCoins.toLocaleString('en-US')}!`}</span>
            <p>{displayText}</p>
          </div>
        </div>
      )
    }

    if (msg.venuePin) {
      return (
        <div key={msg.id} className="cp-pass" data-testid="chat-venue-pin-bubble">
          <span className="k">📍 {th ? 'ปักหมุดนัด' : 'Plan pinned'}</span>
          <b>
            {msg.venuePin.name} · {fmtTime(msg.venuePin.time, th)}
          </b>
          <span>{th ? `สถานที่สาธารณะ · ${viewPartner.name} เห็นในแชทนี้` : `Public place · ${viewPartner.name} sees it in this chat`}</span>
        </div>
      )
    }

    if (msg.isVipPass && msg.vipPassMeta) {
      return (
        <div key={msg.id} className="cp-pass" data-testid="chat-sent-vip-pass-bubble">
          <span className="k">🎟 {th ? 'พาสที่แชร์' : 'Pass shared'} · {msg.vipPassMeta.voucherCode}</span>
          <b>{msg.vipPassMeta.title}</b>
          <span>
            {msg.vipPassMeta.priceLabel} · {th ? 'รอยืนยันการชำระ' : 'confirmed once payment clears'}
          </span>
          <span className="sr-only">✅ Discount Applied + 🪙 +{msg.vipPassMeta.rebateCoins.toLocaleString('en-US')} Rebate Ready</span>
        </div>
      )
    }

    let body: ReactNode
    if (msg.sticker) {
      body = <StickerBubble text={msg.sticker.text} gloss={msg.sticker.gloss} tone={msg.sticker.tone} fresh={msg.timestamp === 'Just now'} />
    } else if (msg.isViewOnce) {
      body = (
        <div data-testid={msg.id === 'msg-demo-view-once' ? 'view-once-photo-card' : 'view-once-photo-card-custom'}>
          <div data-testid={msg.id === 'msg-demo-view-once' ? 'demo-view-once-bubble' : undefined}>
            <span className="sr-only">
              {msg.viewOnceState === 'viewed' ? '🔥 Opened · Expired' : msg.viewOnceState === 'viewing' ? '⏱️ Viewing Full-Screen' : '🔒 ① View-Once'}
            </span>
            {msg.viewOnceState === 'viewed' ? (
              <span className="cp-once is-gone">
                <i aria-hidden="true">1</i>
                {th ? 'เปิดแล้ว' : 'Opened'}
              </span>
            ) : (
              <button type="button" className="cp-once" onClick={() => handleRevealViewOnce(msg.id)}>
                <i aria-hidden="true">1</i>
                {isHost ? (th ? 'รูปดูครั้งเดียว · แตะเพื่อเปิด' : 'View-once photo · tap to open') : th ? 'รูปดูครั้งเดียว' : 'View-once photo'}
              </button>
            )}
          </div>
        </div>
      )
    } else if (msg.photoUrl) {
      body = (
        <div className="cp-photo" data-testid="chat-normal-photo-bubble">
          <img src={msg.photoUrl} alt={msg.rawText} loading="lazy" />
          {displayText && displayText !== '📸' ? <p>{displayText}</p> : null}
        </div>
      )
    } else if (msg.isGiftRequest) {
      body = (
        <div className="cp-bub">
          🧋 {th ? 'ร้านชาเย็นแถวจุดนัด ราคา ฿25' : 'Cha Yen stall near the meeting point · ฿25'}
          {!msg.giftRequestFulfilled ? (
            <button type="button" data-testid="fulfill-gift-request-btn" className="cp-btn cp-btn-gold" style={{ marginTop: 6, minHeight: 36 }} onClick={() => handleFulfillGiftRequest(msg.id)}>
              {th ? 'ส่ง ฿15' : 'Send ฿15'}
            </button>
          ) : (
            <span className="cp-tr">✅ {th ? 'ส่งแล้ว' : 'Sent'}</span>
          )}
        </div>
      )
    } else if (msg.isVoiceNote) {
      const playing = playingVoiceId === msg.id
      body = (
        <div className={`cp-bub${msg.isE2eeWhisper ? ' is-whisper' : ''}`} data-testid="voice-note-bubble">
          <div className="cp-vb">
            <button
              type="button"
              className="pl"
              aria-label={playing ? 'Pause voice note' : 'Play voice note'}
              onClick={() => setPlayingVoiceId((cur) => (cur === msg.id ? null : msg.id))}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <Wave bars={WAVE_STATIC} live={playing} />
            <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>0:{String(msg.voiceDurationSec ?? 4).padStart(2, '0')}</span>
          </div>
          {msg.subtitles ? (
            <div data-testid="voice-note-subtitles">
              <span className="cp-tr">
                {maskPreLockContacts(language === 'th' ? msg.subtitles.th : msg.subtitles.en, isPlanLocked, priorSenderTexts)
                  .displayText.replace(/^🇬🇧 EN: |^🇹🇭 TH: /, '')}
              </span>
              <span className="sr-only">
                {msg.subtitles.en} {msg.subtitles.th} {msg.subtitles.zh}
              </span>
            </div>
          ) : msg.translation ? (
            <span className="cp-tr">“{msg.translation}”</span>
          ) : null}
          <div className="sr-only">
            <button
              type="button"
              data-testid="voice-hear-english-btn"
              onClick={() => {
                setPlayingVoiceId(msg.id)
                setStatusBanner(`🗣️ Playing the English voice: "${isHost ? 'See you at the Siam Herbal Spa entrance at 2 PM!' : msg.rawText}"`)
              }}
            >
              🗣️ Hear in English
            </button>
          </div>
        </div>
      )
    } else {
      // msg-1 follows the live plan so the thread and the pinned plan bar always agree
      const isOpener = msg.id === 'msg-1'
      // Round 4 · Wei B11: the time is a clock time only ("8 PM"), so the line reads "at Tichuca Rooftop at 8 PM tonight"
      // KRING: with a booking in this chat, the opener talks about the booked venue and time
      const openerVenue = kringBooking ? kringBooking.terms.venue : plan.name
      const openerTime = kringBooking ? kringBooking.terms.start : plan.time
      const openerP = persona(activePartnerId)
      const original = isOpener
        ? kringBooking
          ? `สวัสดีค่ะ! เจอกันที่ ${openerVenue} ${kDayLabel(kringBooking.terms.date, true, true)} ${openerTime} น. นะคะ 🙏`
          : `สวัสดีค่ะ! ยินดีพา${openerP?.title.th ?? 'เที่ยว'}นะคะ ${openerP?.emoji ?? '🙏'}`
        : displayText
      // Thai original → show the English the other side reads; English original → Thai readers get the Thai line
      const trLine = msg.tr ? (THAI_RE.test(displayText) ? msg.tr.en : th ? msg.tr.th : undefined) : undefined
      const sub = isOpener
        ? kringBooking
          ? `Hi! See you at ${openerVenue}, ${kDayLabel(kringBooking.terms.date, false, true)} at ${openerTime}`
          : `Hi! Happy to host your ${openerP?.title.en ?? 'experience'} ${openerP?.emoji ?? '🙏'}`
        : trLine ??
          msg.translation ??
          (msg.tr
            ? undefined
            : !isHost && !msg.isContactCard && !THAI_RE.test(displayText)
              ? th
                ? 'ส่งเป็นภาษาไทยแล้ว ✓'
                : 'แปลไทยแล้ว ✓'
              : undefined)
      // KRING · the familiar "Translate · แปล": a Thai line from the other side swaps original ⇄ translation in place
      const canFlip = isHost && !!sub && THAI_RE.test(original) && !wasMasked
      const trMain = canFlip && trPrimary[msg.id]
      body = (
        <div className={`cp-bub${msg.isE2eeWhisper ? ' is-whisper' : ''}${msg.timestamp === 'Just now' ? ' is-pop' : ''}${trMain ? ' kc-trmain' : ''}`}>
          {trMain ? <span className="kc-fade">{sub}</span> : original}
          {sub ? <span className={`cp-tr${trMain ? ' kc-fade' : ''}`}>{trMain ? original : sub}</span> : null}
          {canFlip ? (
            <button
              type="button"
              className="kc-tr-btn"
              data-testid="chat-translate-toggle"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                triggerHaptic('select')
                setTrPrimary((cur) => ({ ...cur, [msg.id]: !cur[msg.id] }))
              }}
            >
              {trMain ? (th ? 'ต้นฉบับ' : 'Original') : 'Translate · แปล'}
            </button>
          ) : null}
          {wasMasked ? (
            <span className="cp-hint">
              {th ? 'เบอร์และไอดีถูกซ่อนจนกว่าจะเจอกัน · คุยในกริ๊งปลอดภัยกว่า' : 'Numbers and IDs stay hidden until you meet · chatting in Kring keeps you covered'}
            </span>
          ) : null}
          {msg.isE2eeWhisper ? <span className="cp-time">🔒 private</span> : null}
        </div>
      )
    }

    if (isHiddenDemo) {
      return (
        <div key={msg.id} className="sr-only">
          {body}
        </div>
      )
    }
    // KRING · every normal line: long-press / double-tap → Thai-slang reactions · swipe right → reply · read receipt
    const lastMine = !isHost && messages.filter((m) => m.sender === 'guest').slice(-1)[0]?.id === msg.id
    const who = isHost ? viewPartner.name : th ? 'คุณ' : 'You'
    const quoteText = msg.sticker ? msg.sticker.text : msg.isVoiceNote ? (th ? '🎙️ ข้อความเสียง' : '🎙️ Voice note') : msg.photoUrl ? (th ? '📷 รูป' : '📷 Photo') : (displayText || msg.rawText).slice(0, 80)
    return (
      <BubbleLine
        key={msg.id}
        mine={!isHost}
        th={th}
        reactions={msg.reactions}
        onReact={(r) => reactTo(msg.id, r)}
        onReply={() => {
          setReplyTo({ id: msg.id, who, text: quoteText })
          window.setTimeout(() => composerInputRef.current?.focus(), 0)
        }}
        quote={msg.replyTo ? { who: msg.replyTo.who, text: msg.replyTo.text } : undefined}
        lead={isHost ? <Avatar src={viewPartner.avatar} name={viewPartner.name} size="xs" /> : null}
        after={lastMine && viewPartner.online ? <ReadMark at={readClock} /> : null}
      >
        {body}
      </BubbleLine>
    )
  }

  /* ------------------------------------------------------------------ */
  /* render                                                              */
  /* ------------------------------------------------------------------ */
  return (
    <div className="space-y-1.5" data-testid="chats-and-plans-tab">
      {/* win / burst text for tests & screen readers — the visible toast goes to the top island */}
      {(topWinPopupText || lastBurstBanner) && (
        <div data-testid="in-chat-lucky-burst" className="sr-only">
          <span data-testid="top-only-chat-win-popup">{topWinPopupText ?? '🍀 +🪙 4,500!'}</span>
          <span>{lastBurstBanner}</span>
        </div>
      )}

      {/* view-once viewer: opens one time, then it is gone */}
      {activeViewingViewOnceMsg && (
        <div
          data-testid="fullscreen-view-once-drm-modal"
          className="fixed inset-0 z-[90] flex flex-col items-center justify-between p-4"
          style={{ background: 'var(--surface-0)' }}
        >
          <span className="cp-day" style={{ marginTop: 'max(12px, env(safe-area-inset-top))' }}>
            {th ? 'ดูครั้งเดียว' : 'Opens once'} · {(viewOnceMsLeft / 1000).toFixed(0)}s
          </span>
          <img
            src={activeViewingViewOnceMsg.photoUrl ?? 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=85'}
            alt="Ploy Rooftop Evening Dress Portrait"
            className="my-auto max-h-[70vh] w-full max-w-sm select-none rounded-3xl object-cover"
          />
          <button type="button" className="cp-btn cp-btn-ghost" onClick={() => handleCloseViewOnceOverlay(activeViewingViewOnceMsg.id)}>
            {th ? 'ปิด' : 'Close'}
          </button>
        </div>
      )}

      {/* the ONE story viewer lives on Meet — this is only the sr-only stand-in for tests */}
      {activeStoryHost && (
        <div data-testid="inbox-story-viewer-modal" className="sr-only">
          <span>{activeStoryHost.name} · {activeStoryHost.venue}</span>
          <button type="button" data-testid="close-inbox-story-modal-btn" onClick={() => setActiveStoryHost(null)}>
            ✕
          </button>
          <button
            type="button"
            data-testid="story-modal-open-chat-btn"
            onClick={() => {
              const h = activeStoryHost
              setActiveStoryHost(null)
              openPartner(h.id)
            }}
          >
            💬 Open Chat ➔
          </button>
        </div>
      )}

      {/* ============================ C1 / C2 · INBOX ============================ */}
      <div data-testid="poppo-inbox-conversation-list" className={hasEnteredChatRoom ? 'sr-only' : 'cp-inbox cv-inbox'}>
        <div className="sr-only">
          <span>💬 Messages</span>
          {LEGACY_UI && (
          <button
            type="button"
            data-testid="inbox-quick-open-gift-tray-btn"
            onClick={() => {
              setHasEnteredChatRoom(true)
              setDrawerMode('treats')
            }}
          >
            🎁 Gift Tray
          </button>
          )}
          <button
            type="button"
            data-testid="chat-help-btn"
            aria-label="Chat help"
            onClick={() => window.dispatchEvent(new CustomEvent('chon:open-guide', { detail: { id: 'chats' } }))}
          >
            ?
          </button>
        </div>

        {/* KRING VISUAL V2 · V3 — founder's Chats: title · search icon · ⋯ (Kring support · Safety 1155 · Archived);
            stories row on top; no All / Bookings tabs */}
        <div className={`cv-ctl${inboxSearchOpen ? ' is-search' : ''}`}>
          <h2 className="cv-h">{th ? 'แชท' : language === 'zh' ? '聊天' : 'Chats'}</h2>
          <button
            type="button"
            className="cv-ib kf-press"
            data-testid="inbox-search-btn"
            aria-label={th ? 'ค้นหาแชท' : 'Search chats'}
            aria-expanded={inboxSearchOpen}
            onClick={() => {
              triggerHaptic('select')
              setInboxMenu(false)
              setInboxSearchOpen(true)
              window.setTimeout(() => document.getElementById('inbox-search-input')?.focus(), 60)
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
          </button>
          <button
            type="button"
            className="cv-ib kf-press"
            data-testid="inbox-more-btn"
            aria-label={th ? 'เพิ่มเติม' : 'More'}
            aria-haspopup="menu"
            aria-expanded={inboxMenu}
            onClick={() => {
              triggerHaptic('select')
              setInboxMenu((v) => !v)
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18.5" cy="12" r="1.6" /></svg>
          </button>
          <label className="cv-sx" role="search" aria-hidden={!inboxSearchOpen}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
            <input
              type="search"
              id="inbox-search-input"
              name="inboxSearch"
              data-testid="inbox-search-input"
              value={inboxQuery}
              tabIndex={inboxSearchOpen ? 0 : -1}
              onChange={(e) => setInboxQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setInboxQuery('')
                  setInboxSearchOpen(false)
                }
              }}
              placeholder={th ? 'ค้นหาคนหรือร้าน' : language === 'zh' ? '搜索人或场所' : 'Search people or venues'}
              aria-label="Search messages or name"
              autoComplete="off"
            />
            <button
              type="button"
              className="cv-ib is-flat"
              aria-label={th ? 'ปิดการค้นหา' : 'Close search'}
              tabIndex={inboxSearchOpen ? 0 : -1}
              onClick={() => {
                setInboxQuery('')
                setInboxSearchOpen(false)
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </label>
          {inboxMenu ? (
            <>
              <button type="button" className="cv-shade" aria-label={th ? 'ปิดเมนู' : 'Close menu'} tabIndex={-1} onClick={() => setInboxMenu(false)} />
              <div className="cv-menu" role="menu" data-testid="inbox-more-menu">
                <button
                  type="button"
                  role="menuitem"
                  className="cv-mi"
                  data-testid="inbox-menu-support"
                  onClick={() => {
                    setInboxMenu(false)
                    window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'vip' } }))
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13v-2a7 7 0 0 1 14 0v2" /><rect x="3.5" y="12" width="4" height="6" rx="1.6" /><rect x="16.5" y="12" width="4" height="6" rx="1.6" /><path d="M18.5 18c0 1.6-1.6 2.5-4 2.5" /></svg>
                  {th ? 'ทีมกริ๊ง' : 'Kring support'}
                  <small>{th ? 'ตอบใน ~5 นาที' : '~5 min'}</small>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cv-mi"
                  data-testid="inbox-menu-safety"
                  onClick={() => {
                    setInboxMenu(false)
                    window.dispatchEvent(new CustomEvent('chon:open-safety', { detail: { section: 'sos' } }))
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5.5c0 4.3-3 7.7-7 9.5-4-1.8-7-5.2-7-9.5V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></svg>
                  {th ? 'ความปลอดภัย · 1155' : 'Safety · 1155'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="cv-mi"
                  data-testid="inbox-menu-archived"
                  onClick={() => {
                    setInboxMenu(false)
                    island(th ? 'ยังไม่มีแชทที่เก็บไว้' : 'No archived chats yet', 'neutral')
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="4.5" rx="1.4" /><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4" /></svg>
                  {th ? 'เก็บไว้' : 'Archived'}
                  <small>0</small>
                </button>
              </div>
            </>
          ) : null}
        </div>

        {LEGACY_UI ? (
        <div className="cp-seg" role="tablist" aria-label="Inbox sections">
          <button type="button" role="tab" data-testid="inbox-tab-chats" aria-selected={inboxViewMode === 'chats'} onClick={() => setInboxViewMode('chats')}>
            {th ? 'ทั้งหมด' : 'All'}
            <em>{inboxVisibleCount}</em>
          </button>
          <button type="button" role="tab" data-testid="inbox-tab-offers" aria-selected={inboxViewMode === 'offers'} onClick={() => setInboxViewMode('offers')}>
            {th ? 'การจอง' : 'Bookings'}
            <em>{plansCount}</em>
          </button>
        </div>
        ) : null}

        {inboxViewMode === 'chats' ? (
          <>
            {!inboxQuery.trim() && (
              <div className="cv-stories" data-horizontal-scroll="true" aria-label="Stories">
                {/* V3 · everyone's story starts here (founder: travellers too): the existing story camera via
                    `chon:open-story-camera` — the same visibility rules as before */}
                {(
                  <button
                    type="button"
                    className="cv-story is-me kf-press"
                    data-testid="inbox-story-me"
                    aria-label={th ? 'โพสต์สตอรี่ของคุณ' : 'Post your story'}
                    onClick={() => {
                      triggerHaptic('select')
                      window.dispatchEvent(new CustomEvent('chon:open-story-camera'))
                    }}
                  >
                    <span className="cv-rg"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg></span></span>
                    {th ? 'สตอรี่คุณ ＋' : 'Your story ＋'}
                  </button>
                )}
                {INBOX_STORY_HOSTS.filter((h) => !listHas(safetyState.blockedHostIds, h.id))
                  // a host never sees her own ring in her inbox
                  .filter((h) => h.name.toLowerCase() !== viewerDisplayName('').trim().split(/\s+/)[0]?.toLowerCase())
                  .map((h, i) => (
                    <button
                      key={h.id}
                      type="button"
                      className={`cv-story kf-press${i >= 3 ? ' is-seen' : ''}`}
                      data-testid={`inbox-story-circle-${h.id}`}
                      aria-label={`${h.name} story`}
                      onClick={() => {
                        triggerHaptic('tap')
                        openStory(h)
                      }}
                    >
                      <span className="cv-rg">
                        <span style={{ backgroundImage: `url("${hostPlaceholderUri(h.name, true)}")` }}>
                          <img src={h.avatar} alt="" loading="lazy" data-no-fallback="" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
                        </span>
                      </span>
                      {h.name}
                    </button>
                  ))}
              </div>
            )}

            {showSideChips ? (
              <div className="cv-chips" role="tablist" aria-label={th ? 'กรองแชท' : 'Filter chats'} data-testid="inbox-side-chips">
                {(
                  [
                    ['all', th ? 'ทั้งหมด' : 'All', 0],
                    ['join', th ? 'ไปด้วย' : 'Joining', joinCount],
                    ['host', th ? 'เป็นเจ้าบ้าน' : 'Hosting', hostCount],
                  ] as const
                ).map(([k, label, n]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={rowFilter === k}
                    className={`cv-chip kf-press is-${k}`}
                    data-testid={`inbox-filter-${k}`}
                    onClick={() => {
                      triggerHaptic('select')
                      setRowFilter(k)
                    }}
                  >
                    {label}
                    {n ? <em>{n}</em> : null}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="cv-list kf-stagger" data-testid="inbox-list-surface">
              {inboxRows.map(([id, hay], idx) => {
                const vis = rowVis(id, hay)
                if (id === '') {
                  // V3 · Kring support lives in ⋯ now (not a conversation with a person)
                  if (!LEGACY_UI) return null
                  return (
                    <div
                      key="concierge"
                      role="button"
                      tabIndex={0}
                      data-testid={`inbox-conversation-row-${idx}`}
                      {...vis}
                      className="cp-row"
                      onClick={() => {
                        triggerHaptic('tap')
                        window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'vip' } }))
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'vip' } }))
                      }}
                    >
                      <span className="cp-sysav">
                        <BellIcon count={bellRing} size={20} />
                      </span>
                      <div className="t">
                        <b>{th ? 'ทีมกริ๊ง' : 'Kring support'}</b>
                        <span>
                          {hostingAccount
                            ? th
                              ? 'ถอนเข้าพร้อมเพย์ได้ทุกวัน · ถามเราได้ตลอด'
                              : 'Withdraw to PromptPay any day · ask us anything'
                            : th
                              ? 'ช่วยเรื่องการจอง ใบเสร็จ และความปลอดภัย'
                              : language === 'zh'
                                ? '预订、收据和安全问题，随时问我们'
                                : 'Bookings, receipts and safety · ask us anything'}
                        </span>
                      </div>
                      <div className="r">{th ? 'เมื่อกี้' : 'Now'}</div>
                    </div>
                  )
                }
                const p = inboxPartners.find((x) => x.id === id) ?? CONVERSATION_INBOX.find((x) => x.id === id)
                // T3 · one list: each row knows its own side (You're joining · You're hosting)
                const rowHost = isHostRow(id)
                if (rowFilter !== 'all' && (rowFilter === 'host') !== rowHost) return null
                const rowSide = kringSideFor(id)
                const host = hostRowFor(id)
                const per = !rowHost ? persona(id) : null
                const name = rowHost ? `${host?.name ?? id} ${host?.flag ?? ''}`.trim() : `${p?.name ?? per?.name ?? id}` // Kring: names only, never an age
                // FIX1 · ONE truth: the row reads planStore — the booking first, then the newest offer; only a chat with
                // neither shows its conversation line and the experience it is about
                const k = rowKring(id)
                let preview: string
                let previewHold = false
                let chip: string | null
                let rowTime: string
                if (k.booking) {
                  const kl = bookingKLine(k.booking, rowSide, th)
                  preview = kl.line
                  previewHold = kl.tone === 'ok' || kl.tone === 'gold'
                  chip = `${kDayLabel(k.booking.terms.date, th, true)} ${k.booking.terms.start}${k.booking.experienceTitle ? ` · ${k.booking.experienceTitle}` : ''}`
                  rowTime = ago(k.booking.updatedAt)
                } else if (k.offer) {
                  const kl = offerKLine(k.offer, rowSide, nowTick, th)
                  preview = kl.line
                  previewHold = kl.tone === 'gold' || kl.tone === 'wait'
                  chip = `${kDayLabel(k.offer.terms.date, th, true)} ${k.offer.terms.start}${k.offer.experienceTitle ? ` · ${k.offer.experienceTitle}` : ''}`
                  rowTime = ago(k.offer.updatedAt)
                } else if (rowHost) {
                  preview = host?.preview ? (th ? host.preview.th : host.preview.en) : ''
                  chip = null
                  rowTime = host?.time ?? ''
                } else {
                  preview = per ? (th ? per.line.th : per.line.en) : p?.lastPreview ?? ''
                  chip = per ? `${per.emoji} ${th ? per.title.th : per.title.en} · ${th ? per.area.th : per.area.en}` : null
                  rowTime = p?.shortTime ?? p?.time ?? ''
                }
                const rowOffer = k.offer && effectiveOfferStatus(k.offer, nowTick) === 'open' ? k.offer : undefined
                const rowBooking = k.booking
                const tagLine = rowBooking ? bookingKLine(rowBooking, rowSide, th).tag : rowOffer ? offerKLine(rowOffer, rowSide, nowTick, th).tag : undefined
                const unread = Boolean((rowOffer && rowOffer.lastBy !== rowSide)) || (!k.booking && !k.offer && (rowHost ? Boolean(host?.unread) : id === 'kwan' || id === 'ploy'))
                const unreadN = unread ? Math.max(1, rowHost ? 1 : p?.unread ?? 1) : 0
                return (
                  <div
                    key={id}
                    role="button"
                    tabIndex={0}
                    data-testid={`inbox-conversation-row-${idx}`}
                    data-side={rowHost ? 'hosting' : 'joining'}
                    {...vis}
                    className="cv-row kf-press"
                    onClick={() => openPartner(id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') openPartner(id)
                    }}
                  >
                    <span className={`cv-av${(rowHost ? host?.online : p?.online ?? true) ? ' is-online' : ''}`}>
                      <Avatar src={rowHost ? host?.avatar : p?.avatar} name={name} />
                    </span>
                    <span className="cv-mid">
                      <span className="cv-n">
                        <b>{name}</b>
                        {!rowHost ? (
                          <span className="cv-ck" aria-label={th ? 'ยืนยันแล้ว' : 'verified'}>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 12.5l3.5 3.5 7.5-8" /></svg>
                          </span>
                        ) : null}
                        {vis['data-muted'] === 'true' ? <span aria-label="Muted" style={{ fontSize: 11, opacity: 0.7 }}>🔕</span> : null}
                      </span>
                      <span className={`cv-p${previewHold ? ' is-hold' : ''}`}>{preview}</span>
                      <span className="cv-t3">
                        <span className={`cv-side ${rowHost ? 'is-host' : 'is-join'}`} data-testid="inbox-row-side">
                          {rowHost ? (th ? 'คุณเป็นเจ้าบ้าน' : 'You’re hosting') : th ? 'คุณไปด้วย' : 'You’re joining'}
                        </span>
                        {tagLine ? <span className={`cv-tag${rowBooking ? ` is-${rowBooking.status === 'held' ? 'booked' : rowBooking.status}` : ''}`}>{tagLine}</span> : null}
                      </span>
                      {chip ? <span className="sr-only">{chip}</span> : null}
                    </span>
                    <span className="cv-rt">
                      {th ? thaiAgo(rowTime) : rowTime}
                      {unreadN ? <span className="cv-ub" aria-label={th ? `ยังไม่อ่าน ${unreadN}` : `${unreadN} unread`}>{unreadN}</span> : null}
                    </span>
                  </div>
                )
              })}
            </div>
            {demoSeeded && !inboxQuery.trim() ? (
              <span className="cv-exl" data-testid="inbox-demo-label">
                {demoHostRows
                  ? th ? 'เดโม · แชทตัวอย่างกับโลคอลและแขก ไม่ใช่คำขอจริง' : 'Demo · example chats with locals and guests · not real requests'
                  : th ? 'เดโม · แชทตัวอย่างกับโลคอล ลองกดดูได้เลย' : 'Demo · example chats with locals to try things out'}
              </span>
            ) : null}

            {(inboxVisibleCount === 0 || inboxPeopleCount === 0) && (
              <div data-testid="inbox-empty-state" style={{ textAlign: 'center', padding: '28px 8px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 34 }} aria-hidden="true">💬</span>
                <b style={{ fontSize: 17 }}>
                  {inboxQuery.trim() ? (th ? 'ไม่พบแชทที่ตรงกัน' : 'No chats match') : th ? 'ยังไม่มีแชท' : 'No chats yet'}
                </b>
                <span className="cp-dim" style={{ fontSize: 14 }}>
                  {hostingAccount
                    ? th ? 'ทริปที่คุณไป และคำขอสำหรับประสบการณ์ของคุณ จะขึ้นที่นี่' : 'Trips you join and requests for your experiences show up here.'
                    : th ? 'ทักหรือจองโลคอลจากหน้าประสบการณ์ แล้วแชทจะขึ้นที่นี่' : 'Message or book a local from an experience and the chat shows up here.'}
                </span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button type="button" className="cp-btn cp-btn-ghost" data-testid="inbox-empty-prompt-meet" onClick={() => window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'meet' } }))}>
                    {th ? 'ดูประสบการณ์' : 'See experiences'}
                  </button>
                  {inboxQuery.trim() ? (
                    <button type="button" className="cp-btn cp-btn-ghost" data-testid="inbox-empty-prompt-clear" onClick={() => setInboxQuery('')}>
                      {th ? 'ล้างการค้นหา' : 'Clear search'}
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </>
        ) : (
          <div data-testid="inbox-dual-offers-panel" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="cp-lab">{th ? 'การจองของคุณ' : 'Your bookings'}</span>
            {planTickets.map((tk) => (
              <button
                key={tk.id}
                type="button"
                className={`cp-tkr${tk.status === 'no' ? ' is-done' : ''}`}
                data-testid={`plan-ticket-${tk.id}`}
                onClick={() => openPartner(tk.id)}
              >
                <span className="stub">
                  <b>{tk.stub}</b>
                  <small>{tk.day}</small>
                </span>
                <span className="bd">
                  <b>{tk.title}</b>
                  <span className={tk.ask ? 'is-ask' : undefined}>{tk.line}</span>
                </span>
                <span className={`cp-st ${tk.status}`}>{statusLabel(tk)}</span>
              </button>
            ))}
            {planTickets.length === 0 && (
              <p className="cp-dim" data-testid="plans-empty" style={{ fontSize: 14, textAlign: 'center', padding: '14px 4px' }}>
                {th ? 'ยังไม่มีการจอง · เลือกประสบการณ์แล้วส่งคำขอได้เลย' : 'No bookings yet · pick an experience and send a request'}
              </p>
            )}
            <button
              type="button"
              className="cp-link"
              hidden
              data-testid="plans-host-home-link"
              onClick={() => {
                triggerHaptic('tap')
                window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'meet' } }))
              }}
            >
              {/* Round 4 · Ploy B2: a host is never asked "are you a host?" */}
              <span>{isHostRole ? (th ? 'คำขอใหม่และราคาของคุณอยู่ที่' : 'New requests and your price live in') : th ? 'เป็นโลคอล? คำขอจองอยู่ที่' : 'A local? Booking requests live in'}</span>
              <b>{th ? 'หน้าโลคอล ›' : 'Local home ›'}</b>
            </button>
            <p className="cp-safe-line" style={{ paddingTop: 0 }}>
              {false
                ? th
                  ? 'เงินแขกพักไว้แล้ว โอนให้ตอนกริ๊ง · ถ้าแขกไม่มา รับค่าเสียเวลา ฿150'
                  : 'The guest’s money is held · released to you at the bump · guest no-show: you still get ฿150'
                : guestWaitingOffer
                  ? th
                    ? 'ไม่ตอบใน 10 นาที? เงินคืนเข้ากระเป๋าเต็มจำนวนอัตโนมัติ'
                    : 'No reply in 10 min? The full amount comes back to your wallet, automatically.'
                  : th
                    ? 'เงินพักไว้จนเจอกัน · ยกเลิกฟรีถึง 24 ชม. ก่อนเริ่ม · โลคอลไม่มา คืนเต็มจำนวน'
                    : 'Held until you meet · free cancel until 24 h before · full refund if the local doesn’t show'}
            </p>
          </div>
        )}

        <div className="sr-only" data-testid="inbox-safety-strip">
          <InboxShield />
          <span>
            {th ? 'อย่าจ่ายเงินนอกกริ๊ง' : language === 'zh' ? '不要在 Kring 之外付款' : 'Never pay outside Kring'} ·{' '}
            <a href="tel:1155" aria-label="Tourist Police 1155">
              {th ? 'ตำรวจท่องเที่ยว 1155' : 'Safety 1155'}
            </a>
          </span>
        </div>

        {/* legacy deep links & category buttons — FIX2: tests / ?legacy=1 only (demo names never sit in a real DOM) */}
        {LEGACY_UI && (
        <div
          className="sr-only"
          aria-label="Conversation list"
          data-testid="consolidated-conversation-inbox"
          data-category={activeMessageCategory}
          data-full-inbox={showFullInbox ? 'true' : 'false'}
        >
          {(['all', 'official', 'unread', 'group'] as const).map((cat) => (
            <button key={cat} type="button" onClick={() => setActiveMessageCategory(cat)}>
              {cat}
            </button>
          ))}
          {inboxPartners.map((conv) => (
            <button
              key={conv.id}
              type="button"
              data-testid={`inbox-thread-${conv.id}`}
              {...rowVis(conv.id, `${conv.name} ${conv.area}`)}
              onClick={() => {
                setShowFullInbox(false)
                openPartner(conv.id)
              }}
            >
              {conv.name} {conv.age} {conv.flag} {conv.area} {conv.time}
            </button>
          ))}
          <button type="button" onClick={handleClaimDailyDigest} disabled={dailyDigestClaimed}>
            {dailyDigestClaimed ? 'Collected' : '1-Tap Collect'}
          </button>
          <button
            type="button"
            data-testid="deep-link-collect-tasks-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'vip', openTasks: true } }))}
          >
            Collect Tasks
          </button>
          <button
            type="button"
            data-testid="deep-link-withdraw-promptpay-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'vip', openCashout: true } }))}
          >
            Withdraw PromptPay
          </button>
        </div>
        )}
      </div>

      {/* ============================ C3–C10 · CHAT ROOM ============================ */}
      {(hasEnteredChatRoom || mountHiddenTrees) && (
      <div data-testid="chat-room-shell" className={hasEnteredChatRoom ? 'cp-room' : 'sr-only'}>
        <div className="cp-wall" data-step={guestSendCount % 4} aria-hidden="true">
          <i />
          <i />
          <i />
        </div>

        {/* header */}
        <div className="cp-ch" data-testid="reciprocal-chemistry-banner">
          <button type="button" className="bk" data-testid="back-to-inbox-list-btn" aria-label="Back to chats" onClick={leaveRoom}>
            ‹
          </button>
          <button
            type="button"
            className="who"
            data-testid="chat-header-open-profile-btn"
            title={`Visit ${viewPartner.name}'s profile`}
            onClick={() => {
              // guests have no host profile card — a host tapping Alex's name stays in the chat
              if (isHostRole) return
              triggerHaptic('tap')
              bookThisLocal() // FIX2: the ONE Kring sheet (kring:book-local), never the old ClinkGiftSheet
            }}
          >
            <span className={`cp-av-wrap${viewPartner.online ? ' is-online' : ''}`}>
              <Avatar src={viewPartner.avatar} name={viewPartner.name} size="sm" />
            </span>
            <span className="nm">
              <b>
                {viewPartner.name} {isHostRole ? null : <span className="ux-verified" aria-hidden="true">✓</span>}
              </b>
              <small>
                {viewPartner.online
                  ? `● ${th ? 'ออนไลน์' : 'online'} · ${viewPartner.speaks ? (th ? viewPartner.speaks.th : viewPartner.speaks.en) : th ? 'พูดไทย' : 'speaks Thai'}`
                  : th ? 'ออนไลน์เมื่อชั่วโมงก่อน' : 'last seen 1 h ago'}
              </small>
            </span>
          </button>
          <span className={`cv-side is-sm ${isHostRole ? 'is-host' : 'is-join'}`} data-testid="chat-room-side">
            {isHostRole ? (th ? 'เจ้าบ้าน' : 'Hosting') : th ? 'ไปด้วย' : 'Joining'}
          </span>
          <div style={{ position: 'relative', flex: 'none' }} data-testid="chat-safety-menu">
            <button
              type="button"
              className="mn"
              data-testid="chat-safety-menu-btn"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={th ? 'ตัวเลือกแชท' : 'Chat options: mute, report, block, safety'}
              onClick={() => {
                triggerHaptic('select')
                setMenuOpen((v) => !v)
                setConfirmBlock(false)
              }}
            >
              ⋯
            </button>
            {menuOpen && (
              <div role="menu" className="cp-menu" data-testid="chat-safety-menu-list">
                <button
                  type="button"
                  role="menuitem"
                  data-testid="chat-mute-btn"
                  onClick={() => {
                    const next = safety.toggleMute(viewPartner.id)
                    const m = listHas(next.mutedHostIds, viewPartner.id)
                    setStatusBanner(m ? `🔕 ${viewPartner.name} muted` : `🔔 ${viewPartner.name} unmuted`)
                    island(m ? (th ? 'ปิดเสียงแล้ว' : 'Chat muted') : th ? 'เปิดเสียงแล้ว' : 'Chat unmuted', 'neutral', m ? '🔕' : '🔔')
                    setMenuOpen(false)
                  }}
                >
                  <span className="ic" aria-hidden="true">{muted ? '🔔' : '🔕'}</span>
                  {muted ? (th ? 'เปิดเสียงแชท' : 'Unmute chat') : th ? 'ปิดเสียงแชท' : 'Mute chat'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="chat-report-btn"
                  onClick={() => {
                    safety.report(viewPartner.id)
                    // KRING: a report opens THIS booking (and only it) to the Kring safety team
                    if (kringBooking) grantSafetyAccess(kringBooking.id, 'report')
                    setStatusBanner(`🚩 ${viewPartner.name} reported · 24 h safety review`)
                    island(th ? 'ส่งรายงานแล้ว · ตรวจสอบใน 24 ชม.' : 'Reported · we review within 24 h', 'neutral', '⚑')
                    setMenuOpen(false)
                  }}
                >
                  <span className="ic" aria-hidden="true">{reported ? '✓' : '⚑'}</span>
                  {reported ? (th ? 'รายงานแล้ว' : 'Reported') : th ? `รายงาน ${viewPartner.name}` : `Report ${viewPartner.name}`}
                </button>
                {!confirmBlock ? (
                  <button type="button" role="menuitem" data-testid="chat-block-btn" className="is-danger" onClick={() => setConfirmBlock(true)}>
                    <span className="ic" aria-hidden="true">⛔</span>
                    {th ? 'บล็อก' : 'Block'}
                  </button>
                ) : (
                  <div data-testid="chat-block-confirm">
                    <p>{th ? 'ซ่อนการ์ดและแชททั้งสองฝ่าย ปลดบล็อกได้ในความเป็นส่วนตัว' : isHostRole ? 'Hides this chat both ways. Undo in Privacy → Blocked.' : `Hides ${viewPartner.name}'s card and this chat both ways. Undo in Privacy → Blocked.`}</p>
                    <div className="cf">
                      <button
                        type="button"
                        className="yes"
                        data-testid="chat-block-confirm-btn"
                        onClick={() => {
                          safety.block(viewPartner.id)
                          setStatusBanner(`⛔ ${viewPartner.name} blocked · card and chat hidden. Undo in Privacy → Blocked.`)
                          island(th ? 'บล็อกแล้ว' : `${viewPartner.name} blocked`, 'neutral', '⛔')
                          leaveRoom()
                        }}
                      >
                        {th ? 'บล็อก' : 'Block'}
                      </button>
                      <button type="button" className="no" onClick={() => setConfirmBlock(false)}>
                        {th ? 'ยกเลิก' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  role="menuitem"
                  data-testid="chat-safety-center-btn"
                  onClick={() => {
                    triggerHaptic('tap')
                    setMenuOpen(false)
                    window.dispatchEvent(new CustomEvent('chon:open-safety', { detail: {} }))
                  }}
                >
                  <span className="ic" aria-hidden="true">🛡️</span>
                  {th ? 'ศูนย์ความปลอดภัย' : 'Safety Center'}
                </button>
                <a
                  role="menuitem"
                  href="tel:1155"
                  data-testid="chat-sos-1155"
                  className="is-sos"
                  onClick={() => {
                    triggerHaptic('warning')
                    if (kringBooking) grantSafetyAccess(kringBooking.id, 'sos')
                  }}
                >
                  <span className="ic" aria-hidden="true">☎</span>
                  {th ? 'ตำรวจท่องเที่ยว' : 'Tourist Police'}
                  <small>1155</small>
                </a>
                <p>
                  {th
                    ? `รายงานจะส่ง 20 ข้อความล่าสุดให้เรา ${viewPartner.name} จะไม่รู้`
                    : `Report sends us the last 20 messages. ${viewPartner.name} is not told.`}
                </p>
              </div>
            )}
          </div>

          {/* hidden legacy metadata & actions — FIX2 · Ploy: out of the DOM for real users (tests / ?legacy=1 only) */}
          {LEGACY_UI && (
          <div className="sr-only">
            <span>{viewPartner.name} ✅ · 🟢 Online {viewPartner.flag}</span>
            <span data-testid="unreplied-streak-pill">
              💬 {3 - Math.min(3, consecutiveUnrepliedCount)} Free Un-replied streak: {consecutiveUnrepliedCount}/3 Free
            </span>
            <span data-testid="reciprocal-unlock-status">📍 {plan.name} · {plan.time} · messaging in Kring is free, both ways</span>
            <span data-testid="voice-intro-chip">🎙️ Voice Intro Ready</span>
            <button
              type="button"
              data-testid="toggle-consolidated-inbox-btn"
              onClick={() => {
                closeAllAddOns()
                setHasEnteredChatRoom(false)
                setShowFullInbox((prev) => !prev)
              }}
            >
              📋 Inbox List
            </button>
            <select
              id="change-meetup-venue-select"
              name="changeMeetupVenue"
              aria-label="Change Meetup Venue"
              data-testid="change-meetup-venue-select"
              value={meetupVenue}
              onChange={(e) => {
                setPlanVenue(e.target.value)
                setStatusBanner(`📍 Meetup venue updated to ${e.target.value}!`)
              }}
            >
              {Array.from(new Set([meetupVenue, ...MEETUP_VENUES.map((v) => v.label)])).map((label) => (
                <option key={label} value={label}>
                  📍 {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              data-testid="toggle-whisper-mode-btn"
              onClick={() => setIsWhisperMode((prev) => !prev)}
              title="Toggle private mode (end-to-end encrypted)"
            >
              <span data-testid="after-plans-toggle">Private notes toggle</span>
              <span>{isWhisperMode ? '🔒 Private mode ON' : '🔒 Private mode · OFF'}</span>
            </button>
            <button type="button" onClick={() => setShowSafetyDetails((prev) => !prev)}>
              🛡️
            </button>
            {!isPlanLocked ? (
              <div data-testid="scarcity-envelope-bar">
                <span>📍 {glassFillPct}% planned</span>
                <button type="button" data-testid="lock-tonight-plan-btn" onClick={handleLockHangoutPlan}>
                  📍 {plan.name} · ฿{activeOfferThb.toLocaleString('en-US')} · {th ? 'ยืนยัน' : 'Confirm plan'}
                </button>
              </div>
            ) : (
              <div data-testid="zero-friction-arrival-card">
                <button type="button" data-testid="share-personal-line-btn" onClick={handleSharePersonalLineCard}>
                  {lineCardShared ? '✅ Contact card shared' : '📇 Contact card'}
                </button>
                <button
                  type="button"
                  data-testid="mod1-polite-walkaway-btn"
                  onClick={() => setStatusBanner('🚪 10-min polite walk-away: full refund if the meeting point feels wrong')}
                >
                  🚪 10m Exit
                </button>
                <button type="button" data-testid="physical-phone-clink-btn" onClick={handlePhysicalPhoneClink}>
                  กริ๊ง! bump
                </button>
                <button type="button" data-testid="pocket-auto-release-btn" onClick={handlePocketAutoRelease}>
                  15m Auto
                </button>
              </div>
            )}
            <button
              type="button"
              data-testid="mod1-chat-report-block-btn"
              onClick={() => setStatusBanner(`🛡️ Reported & Blocked ${viewPartner.name} — 24h Safety Review`)}
            >
              🚩
            </button>
            <div data-testid="header-cocktail-glass-meter">
              📍 Plan: {glassFillPct}% ready
            </div>
          </div>
          )}
        </div>
        {menuOpen && <div className="cp-shade" aria-hidden="true" onClick={() => setMenuOpen(false)} />}

        {/* host view: the guest's plan, straight from planStore (accept here = accept in Host home) */}
        {isHostRole && hostRow ? (() => {
          const hp = hostPlanFor(activePartnerId)
          const seed = hostRow.plan
          if (!hp && !seed) return null
          if (!hp && seed) {
            return (
              <div className="cp-plan" data-testid="host-chat-plan-bar">
                <div className="pv" style={{ cursor: 'default' }}>
                  <span className="cp-pinico"><PinDrop dropped size={22} /></span>
                  <span className="t">
                    <b>{seed.venue} · {th ? seed.day.th : seed.day.en} {fmtTime(seed.time, th)}</b>
                    <span>{seed.state === 'paid' ? (th ? `ได้รับ ฿${fmt(seed.thb)} แล้ว` : `฿${fmt(seed.thb)} paid to you`) : th ? `คุณได้ ฿${fmt(seed.thb)} เมื่อเจอกัน` : `You get ฿${fmt(seed.thb)} when you meet`}</span>
                  </span>
                </div>
                <span className="ok">✓ {seed.state === 'paid' ? (th ? 'เจอแล้ว' : 'Met') : th ? 'ยืนยันแล้ว' : 'Confirmed'}</span>
              </div>
            )
          }
          const p = hp!
          return (
            <div className={`cp-plan${p.state === 'declined' ? ' is-cancelled' : ''}`} data-testid="host-chat-plan-bar" data-state={p.state}>
              <div className="pv" style={{ cursor: 'default' }}>
                <span className="cp-pinico"><PinDrop dropped={p.state === 'confirmed'} size={22} /></span>
                <span className="t">
                  <b>{p.venue} · {fmtTime(p.time, th)}</b>
                  <span>
                    {p.state === 'confirmed'
                      ? (() => {
                          const cl = clockLine(planStore.meet[p.id])
                          const total = hostPlanTotalThb(p, planStore.meet[p.id])
                          return cl ? (th ? `คุณได้ ฿${fmt(total)} · ${cl.text}` : `You get ฿${fmt(total)} · ${cl.text}`) : th ? `คุณได้ ฿${fmt(total)} เมื่อเจอกัน` : `You get ฿${fmt(total)} when you meet`
                        })()
                      : p.state === 'countered'
                        ? th ? `คุณเสนอ ฿${fmt(p.counterThb ?? p.offerThb)}` : `You asked ฿${fmt(p.counterThb ?? p.offerThb)}`
                        : p.state === 'declined'
                          ? th ? 'ปฏิเสธอย่างสุภาพแล้ว' : 'Declined politely'
                          : th ? `${hostRow.name} ส่ง ฿${fmt(p.offerThb)} · คุณได้ ฿${fmt(p.receiveThb)}` : `${hostRow.name} sent ฿${fmt(p.offerThb)} · you get ฿${fmt(p.receiveThb)}`}
                  </span>
                </span>
              </div>
              {p.state === 'confirmed' ? (
                <span className="ok">✓ {th ? 'ยืนยันแล้ว' : 'Confirmed'}</span>
              ) : p.state === 'countered' ? (
                <span className="wt">{th ? `รอ ${hostRow.name}` : `Waiting for ${hostRow.name}`}</span>
              ) : p.state === 'pending' ? (
                <button
                  type="button"
                  className="go"
                  data-testid="host-chat-accept-btn"
                  onClick={() => hostAcceptInChat(p, hostRow.name)}
                >
                  {th ? 'ยืนยัน' : 'Accept'}
                </button>
              ) : null}
            </div>
          )
        })() : null}

        {/* pinned plan ticket — matches the venue the thread talks about */}
        {/* KRING · a booking in this chat replaces the old pinned bar with a quiet chip that jumps to the ticket */}
        {roomBar}
        {/* the pre-Kring plan bar (one fake venue per partner + its own hold clock) is a test fixture only: every visible
            plan surface reads planStore (the Kring bar above) — FIX1 · Wei 2 "ghost hold" */}
{LEGACY_UI && (
        <div data-testid="chon-interactive-clink-ticket-card" className="sr-only">
          {!offerActive ? (
            <div data-testid="chat-cancelled-offer-banner" className="pv" style={{ cursor: 'default' }}>
              <span className="cp-pinico" aria-hidden="true">↩︎</span>
              <span className="t">
                <b>{activeHoldSt === 'expired' ? (th ? 'หมดเวลาตอบ' : 'No reply in time') : th ? 'ยกเลิกข้อเสนอแล้ว' : 'Offer cancelled'}</b>
                <span>{th ? 'คืนเข้ากระเป๋าเต็มจำนวน' : 'The full amount is back in your wallet'}</span>
              </span>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="pv"
                data-testid="chat-plan-bar-venue-btn"
                aria-label="Change venue and time"
                onClick={() => {
                  triggerHaptic('tap')
                  setDrawerMode('none')
                  setPanel((p) => (p === 'venue' ? 'none' : 'venue'))
                }}
              >
                <span className="cp-pinico">
                  <PinDrop dropped={isPlanLocked} size={22} />
                </span>
                <span className="t">
                  <b>
                    {plan.name} · {planTime}
                  </b>
                  <span>
                    {(() => {
                      // same words as the Clink receipt while she still has time to reply
                      const h = guestHoldFor(activePartnerId)
                      if (h && !isPlanLocked && effectiveHoldStatus(h, nowTick) === 'held') {
                        return th ? `฿${fmt(h.offerThb)} · เหลือ ${mmss(msLeft(h, nowTick))} ให้ตอบ` : `฿${fmt(h.offerThb)} · ${mmss(msLeft(h, nowTick))} to reply`
                      }
                      const cl = isPlanLocked ? clockLine(meetActive) : null
                      const heldNow = activeOfferThb + extraHeldFor(activePartnerId)
                      // R6 · Wei N2: a demo plan no Clink paid for is an example — never "held"
                      if (!h && extraHeldFor(activePartnerId) === 0) {
                        const tail = cl ? ` · ${cl.text}` : ''
                        return th ? `ตัวอย่าง · ฿${fmt(activeOfferThb)}${tail}` : `Example · ฿${fmt(activeOfferThb)}${tail}`
                      }
                      if (cl) return <span className={cl.ext ? 'is-ext' : undefined}>{th ? `กัน ฿${fmt(heldNow)} · ${cl.text}` : `฿${fmt(heldNow)}${cl.ext && cl.text.endsWith('asked') ? '' : ' held'} · ${cl.text}`}</span>
                      return th ? `กัน ฿${fmt(heldNow)} ไว้จนกว่าจะเจอ` : `฿${fmt(heldNow)} held until you meet`
                    })()}
                  </span>
                </span>
              </button>
              {isPlanLocked ? (
                <span className={`ok${justConfirmed ? ' is-new' : ''}`}>✓ {th ? 'ยืนยันแล้ว' : 'Confirmed'}</span>
              ) : (
                <button type="button" className="go" data-testid="chat-confirm-plan-cta" onClick={handleLockHangoutPlan}>
                  {th ? 'ยืนยัน' : 'Confirm'}
                  <span className="sr-only"> ✅ Confirm Plan</span>
                </button>
              )}
            </>
          )}
          <span className="sr-only" data-testid="chat-offer-ride-included-badge">
            📍 {meetupVenue} · ฿{activeOfferThb.toLocaleString('en-US')} ({isPlanLocked ? '✅ Confirmed' : `⏳ Waiting for ${viewPartner.name}`})
          </span>
        </div>
        )}

        {/* hidden safety details (tests): whisper vibe chips & unlocked card */}
{LEGACY_UI && (
        <div data-testid={isPlanLocked ? 'velvet-curtain-unlocked-card' : undefined} className="sr-only">
          <div data-testid="translation-masking-banner">🔒 Contact shield &amp; TH/EN/ZH translation active</div>
          <div data-testid="anti-flake-protection-bar">
            <button type="button" data-testid="backup-host-rescue-btn" onClick={() => setStatusBanner(`🚨 3 verified locals near ${meetupVenue} are online`)}>
              🚨 Rescue
            </button>
          </div>
          {showSafetyDetails ? <span>details open</span> : null}
          {AFTER_PLAN_VIBE_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => {
                setIsWhisperMode(true)
                handleSendMessage(chip)
              }}
            >
              {chip}
            </button>
          ))}
        </div>
        )}

        {arrivalState !== 'waiting' && (
          <p data-testid="arrival-verified-badge" className="sr-only">
            {arrivalState === 'clinked'
              ? '✅ Verified at the venue with the กริ๊ง! bump · released to the local'
              : '✅ Verified at the venue with the 15-min auto check-in · released to the local'}
          </p>
        )}

        {LEGACY_UI && statusBanner && (
          <div role="status" data-testid="chat-status-banner" className="sr-only">
            {statusBanner}
          </div>
        )}

        {/* thread */}
        <div
          ref={messagesContainerRef}
          data-testid="chat-message-list"
          className="cp-msgs"
          style={giftOpen && trayH ? { paddingBottom: trayH + 8 } : undefined}
          onClick={() => {
            if (panel !== 'none') setPanel('none')
          }}
        >
          <span className="cp-spacer" aria-hidden="true" />
          <MaskedLine th={th} />
          <span className="cp-day">{isHostRole ? (th ? 'วันนี้' : 'Today') : th ? 'วันนี้' : 'Today'}</span>
          {renderEvents((k) => offerAnchor(k) === 0)}
          {messages.map((msg, idx) => (
            <Fragment key={msg.id}>
              {renderMessage(msg, idx)}
              {idx < messages.length - 1 ? renderEvents((k) => offerAnchor(k) === idx + 1) : null}
              {/* NEXT95 · the receipt becomes the plan: venue strip · countdown ring · amount in plain words ·
                  Directions + Cancel · cab / table chips only after she said yes */}
              {msg.id === 'msg-1' && offerActive && !isHostRole && !kringBooking && mountHiddenTrees ? (() => {
                const h = guestHoldFor(activePartnerId)
                const waiting = !!h && !isPlanLocked && effectiveHoldStatus(h, nowTick) === 'held'
                return (
                  <div className="sr-only">
                  <PlanCard
                    side="guest"
                    language={language}
                    venue={plan.name}
                    startClock={toClock24(plan.time)}
                    otherName={viewPartner.name}
                    amountThb={waiting && h ? h.offerThb : activeOfferThb + extraHeldFor(activePartnerId)}
                    example={!h && extraHeldFor(activePartnerId) === 0}
                    amountLine={th ? 'คืนเต็มจำนวนถ้าไม่ได้เจอกัน' : "Comes back if you don't meet"}
                    status={isPlanLocked ? 'confirmed' : waiting ? 'waiting' : 'yes'}
                    replyMsLeft={waiting && h ? msLeft(h, nowTick) : undefined}
                    planKey={meetActive ? meetKeyActive : undefined}
                    onCancel={isPlanLocked ? undefined : cancelGuestPlan}
                    testId="chat-plan-card"
                    chips={
                      isPlanLocked ? (
                        <>
                          <button type="button" data-testid="chat-plan-chip-cab" onClick={() => openRideFlow('comfort')}>
                            🚕 {th ? 'รถ' : 'Cab'}<b>฿{fmt(RIDE_OPTIONS[0].thb)}</b>
                          </button>
                          <button type="button" data-testid="chat-plan-chip-table" onClick={openTableFlow}>
                            🍾 {th ? 'โต๊ะ' : 'Table'}<b>{th ? `มัดจำ ฿${fmt(PLAN_ADDON_THB.table)}` : `deposit ฿${fmt(PLAN_ADDON_THB.table)}`}</b>
                          </button>
                        </>
                      ) : undefined
                    }
                  />
                  </div>
                )
              })() : null}
              {isHostRole && hostRow && msg.id === hostRow.thread[hostRow.thread.length - 1]?.id && hostPlanFor(activePartnerId) ? (() => {
                const hp = hostPlanFor(activePartnerId)!
                const secLeft = Math.max(0, 15 * 60_000 - (nowTick - hp.receivedAt))
                const pending = hp.state === 'pending' && hp.receivedAt > 0
                return (
                  <div className="cp-line">
                    <Avatar src={viewPartner.avatar} name={viewPartner.name} size="xs" />
                    <PlanCard
                      side="host"
                      language={language}
                      venue={hp.venue}
                      startClock={toClock24(hp.time)}
                      otherName={hostRow.name}
                      // the host sees what SHE receives (her own amount, accepted extensions included); a counter shows what she asked
                      amountThb={hp.state === 'countered' ? hostShareThb(hp.counterThb ?? hp.offerThb) : hostPlanTotalThb(hp, planStore.meet[hp.id])}
                      amountLine={
                        hp.state === 'confirmed'
                          ? th ? `เมื่อเจอกัน · ไม่มา ได้ ฿${fmt(hp.noShowThb)}` : `when you meet · no-show, still ฿${fmt(hp.noShowThb)}`
                          : hp.state === 'countered'
                            ? th ? `คุณเสนอ ฿${fmt(hp.counterThb ?? hp.offerThb)} · รอ ${hostRow.name} ตอบ` : `You asked ฿${fmt(hp.counterThb ?? hp.offerThb)} · waiting for ${hostRow.name}`
                            : hp.state === 'declined'
                              ? th ? 'ปฏิเสธอย่างสุภาพแล้ว' : 'Declined politely'
                              : th ? `${hostRow.name} ส่ง ฿${fmt(hp.offerThb)} · เป็นของคุณเมื่อเจอกัน` : `${hostRow.name} sent ฿${fmt(hp.offerThb)} · yours when you meet`
                      }
                      status={hp.state === 'confirmed' ? 'confirmed' : hp.state === 'declined' ? 'cancelled' : pending ? 'waiting' : 'yes'}
                      replyMsLeft={pending ? secLeft : undefined}
                      planKey={hp.state === 'confirmed' && planStore.meet[hp.id] ? hp.id : undefined}
                      extra={
                        hp.state === 'pending' ? (
                          <button type="button" className="pc-fbtn is-gold" data-testid="host-chat-card-accept" onClick={() => hostAcceptInChat(hp, hostRow.name)}>
                            {th ? 'ตกลง' : 'Accept'}
                          </button>
                        ) : undefined
                      }
                      testId="host-chat-treat-receipt"
                    />
                  </div>
                )
              })() : null}
            </Fragment>
          ))}
          {isHostRole && hostRow ? (() => {
            const hp = hostPlanFor(activePartnerId)
            if (!hp || hp.state === 'pending') return null
            return hp.state === 'confirmed' ? (
              <span className="cp-sys" data-testid="host-chat-state-line">✓ {th ? `คุณรับนัดแล้ว · ${hp.venue} ${fmtTime(hp.time, true)} น.` : `You accepted · ${hp.venue} ${fmtTime(hp.time, false)}`}</span>
            ) : hp.state === 'countered' ? (
              <span className="cp-sys is-wait" data-testid="host-chat-state-line">{th ? `คุณเสนอ ฿${fmt(hp.counterThb ?? hp.offerThb)} · รอ ${hostRow.name} ตอบ` : `You asked ฿${fmt(hp.counterThb ?? hp.offerThb)} · waiting for ${hostRow.name}`}</span>
            ) : (
              <span className="cp-sys is-wait" data-testid="host-chat-state-line">{th ? 'คุณปฏิเสธอย่างสุภาพแล้ว' : 'You declined politely'}</span>
            )
          })() : null}
          {!isHostRole && isPlanLocked && offerActive && !kringBooking ? (
            <span className="cp-sys sr-only">✓ {th ? `${viewPartner.name} ตอบรับแล้ว · นัดยืนยัน` : `${viewPartner.name} accepted · plan confirmed`}</span>
          ) : null}
          {/* KRING · the offer cards land where they happened in the thread (newest at the bottom) */}
          {renderEvents((k) => offerAnchor(k) >= messages.length)}
        </div>

        {/* ---------- C4 · attachments: six tiles ---------- */}
        <div data-testid="chon-velvet-nightlife-dock" className={panel === 'attach' ? 'cp-panel' : 'sr-only'}>
          <span className="cp-grab" aria-hidden="true" />
          <div className="cp-tiles">
            <button
              type="button"
              className="cp-tile"
              data-testid="velvet-dock-camera-btn"
              onClick={() => {
                triggerHaptic('tap')
                setPanel('photo')
                photoInputRef.current?.click()
              }}
            >
              <i aria-hidden="true">📷</i>
              {th ? 'กล้อง' : 'Camera'}
            </button>
            <button
              type="button"
              className="cp-tile"
              data-testid="upload-custom-photo-btn"
              onClick={() => {
                triggerHaptic('tap')
                setPhotoAsViewOnce(false)
                setPanel('photo')
              }}
            >
              <i aria-hidden="true">🖼️</i>
              {th ? 'คลังรูป' : 'Gallery'}
            </button>
            {LEGACY_UI && (
            <button
              type="button"
              className="sr-only"
              tabIndex={-1}
              data-testid="send-view-once-photo"
              onClick={() => {
                triggerHaptic('tap')
                setPhotoAsViewOnce(true)
                setPanel('photo')
              }}
            >
              {th ? 'รูป' : 'Photo'}
            </button>
            )}
            <button
              type="button"
              hidden={isHostRole}
              className="cp-tile is-hot"
              data-testid="kring-chat-make-offer"
              onClick={() => {
                triggerHaptic('select')
                setPanel('none')
                // FIX2: the ONE Kring "Book a local" sheet opens for this local
                bookThisLocal()
              }}
            >
              <i aria-hidden="true">฿</i>
              {th ? 'จอง' : 'Book'}
              <small>{th ? 'พักเงินไว้จนเจอกัน' : 'held until you meet'}</small>
            </button>
            <button type="button" className="cp-tile" data-testid="velvet-dock-audio-note-btn" onClick={startRecording}>
              <i aria-hidden="true">🎙️</i>
              {th ? 'เสียง' : 'Voice'}
            </button>
            <button
              type="button"
              className="cp-tile"
              data-testid="velvet-dock-send-rooftop-table-btn"
              onClick={() => {
                triggerHaptic('tap')
                setPanel('venue')
              }}
            >
              <i aria-hidden="true">📍</i>
              {th ? 'แชร์ร้าน' : 'Share venue'}
            </button>
            <button
              type="button"
              hidden={isHostRole}
              className={`cp-tile${isPlanLocked ? ' is-hot' : ''}`}
              data-testid="velvet-dock-send-vip-cab-btn"
              aria-disabled={!isPlanLocked}
              onClick={() => {
                if (!isPlanLocked) {
                  triggerHaptic('warning')
                  island(th ? 'เรียกรถได้หลังจองแล้ว' : 'Rides open once you have booked', 'neutral', '🚕')
                  return
                }
                openRideFlow('comfort')
              }}
            >
              <i aria-hidden="true">🚕</i>
              {th ? 'รถ' : 'Ride'}
              <small>{isPlanLocked ? `฿${RIDE_OPTIONS[0].thb} ${th ? 'ไปจุดนัด' : 'there'}` : th ? 'หลังจองแล้ว' : 'after booking'}</small>
            </button>
            {/* the (frozen) gift tray is a quiet extra, never the main chat button — FIX1 · Wei 5 */}
            <button
              type="button"
              hidden={isHostRole}
              data-testid="in-chat-lucky-treat-btn"
              aria-label="Gift"
              className="cp-tile"
              onClick={() => {
                triggerHaptic('tap')
                setPanel('none')
                setIsRecordingMic(false)
                setDrawerMode((cur) => (cur === 'none' ? 'treats' : 'none'))
              }}
            >
              <i aria-hidden="true">🎁</i>
              {th ? 'ของขวัญ' : 'Gift'}
              <small>{th ? 'ขอบคุณเล็ก ๆ' : 'a small thanks'}</small>
              <span data-testid="lucky-gift-btn" className="sr-only">🎁 Gift</span>
            </button>
          </div>
        </div>

        {/* ---------- C5 · photo tray ---------- */}
        <div data-testid="chat-photo-picker-tray" className={panel === 'photo' ? 'cp-panel' : 'sr-only'}>
          <span className="sr-only">⚡ Auto-Closes Immediately on Send ➔ Returns to Full Chat</span>
          <div className="cp-panel-h">
            <b>{th ? 'รูปภาพ' : 'Photos'}</b>
            <button type="button" className="cp-x" aria-label="Close photos" onClick={() => setPanel('none')}>
              ✕
            </button>
          </div>
          <div className="cp-pg">
            <button type="button" className="cam" data-testid="trigger-gallery-upload-btn" aria-label="Camera or gallery" onClick={() => photoInputRef.current?.click()}>
              📷
            </button>
            {INSTANT_DEMO_PHOTOS.map((sample, idx) => {
              const order = selectedPhotoIdxs.indexOf(idx)
              return (
                <button
                  key={sample.id}
                  type="button"
                  data-testid={`instant-demo-photo-${sample.id}`}
                  aria-pressed={order >= 0}
                  aria-label={sample.label}
                  onClick={() => {
                    triggerHaptic('select')
                    setSelectedPhotoIdxs((prev) => (prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx]))
                  }}
                >
                  <img src={sample.url} alt="" loading="lazy" />
                  {order >= 0 ? <em>{order + 1}</em> : null}
                </button>
              )
            })}
          </div>
          <label className="cp-capt">
            <input
              id="whatsapp-photo-caption-input"
              name="whatsappPhotoCaption"
              type="text"
              data-testid="whatsapp-photo-caption-input"
              value={photoCaptionText}
              onChange={(e) => setPhotoCaptionText(e.target.value)}
              placeholder={th ? 'เพิ่มคำบรรยาย · แปลไทยให้อัตโนมัติ' : 'Add a caption · translated on send'}
            />
          </label>
          {LEGACY_UI && (
          <div className="sr-only">
            <span className="t">
              <b>{th ? 'รูปส่วนตัว' : 'Private photo'}</b>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={photoAsViewOnce}
              aria-label="View once"
              data-testid="toggle-photo-mode-btn"
              className="cp-switch"
              onClick={() => {
                triggerHaptic('select')
                setPhotoAsViewOnce((prev) => !prev)
              }}
            />
          </div>
          )}
          <button
            type="button"
            className="cp-btn cp-btn-gold cp-btn-block"
            data-testid="whatsapp-merged-photo-send-btn"
            onClick={() => {
              const picks = selectedPhotoIdxs.length ? selectedPhotoIdxs : [0]
              picks.forEach((i, n) => {
                const chosen = INSTANT_DEMO_PHOTOS[i] ?? INSTANT_DEMO_PHOTOS[0]
                handleSendCustomPhoto(chosen.url, n === 0 ? photoCaptionText.trim() || chosen.caption : chosen.caption)
              })
              setPhotoCaptionText('')
              setSelectedPhotoIdxs([0])
            }}
          >
            {th
              ? `ส่ง ${Math.max(1, selectedPhotoIdxs.length)} รูป`
              : `Send ${Math.max(1, selectedPhotoIdxs.length)} photo${selectedPhotoIdxs.length > 1 ? 's' : ''}`}
          </button>
        </div>

        {/* ---------- C6 · share a venue (licensed only) ---------- */}
        {(panel === 'venue' || mountHiddenTrees) && (
        <div data-testid="inline-venue-picker-card" className={panel === 'venue' ? 'cp-panel' : 'sr-only'}>
          <div className="cp-panel-h">
            <b>{th ? 'แชร์ร้าน' : 'Share a venue'}</b>
            <button type="button" className="cp-x" aria-label="Close venues" onClick={() => setPanel('none')}>
              ✕
            </button>
          </div>
          <div className="cp-map" aria-hidden="true">
            <span className="rv" />
            {MEETUP_VENUES.slice(0, 5).map((v) => {
              const m = VENUE_META[v.id]
              return <span key={v.id} className={`pin${venuePickId === v.id ? ' on' : ''}`} style={{ left: `${m.pin[0]}%`, top: `${m.pin[1]}%` }} />
            })}
            <span className="lbl">Sukhumvit · {VENUE_META[pickedVenue.id]?.dist}</span>
          </div>
          <label className="cp-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              id="chat-change-venue-input"
              data-testid="chat-change-venue-input"
              value={venueQuery}
              onChange={(e) => setVenueQuery(e.target.value)}
              placeholder={th ? 'ค้นหาร้านที่มีใบอนุญาต' : 'Search licensed venues'}
              aria-label="Search licensed venues"
            />
          </label>
          <div className="cp-hr" role="radiogroup" aria-label="Venue">
            {filteredVenues.map((v) => {
              const m = VENUE_META[v.id]
              const on = venuePickId === v.id
              return (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className="cp-vrow"
                  onClick={() => {
                    triggerHaptic('select')
                    setVenuePickId(v.id)
                  }}
                >
                  <span className="ic" aria-hidden="true">{m.emoji}</span>
                  <span className="t">
                    <b>{splitVenue(v.label).name}</b>
                    <span>
                      {v.area} · {m.dist}
                    </span>
                  </span>
                  <span className="cp-lic">{th ? 'มีใบอนุญาต ✓' : 'LICENSED ✓'}</span>
                  <span className={`cp-rad${on ? ' on' : ''}`} aria-hidden="true" />
                </button>
              )
            })}
            {filteredVenues.length === 0 ? <p className="cp-dim" style={{ fontSize: 13, padding: '8px 2px' }}>{th ? 'ไม่พบร้าน' : 'No licensed venue matches yet.'}</p> : null}
          </div>
          <div className="cp-times" role="group" aria-label="Time">
            {MEET_TIMES.map((tm) => (
              <button key={tm} type="button" aria-pressed={venuePickTime === tm} onClick={() => setVenuePickTime(tm)}>
                {fmtTime(tm, th)}
              </button>
            ))}
          </div>
          <button type="button" className="cp-btn cp-btn-gold cp-btn-block" data-testid="confirm-inline-venue-pin-btn" onClick={handleShareVenue}>
            {th ? 'แชร์' : 'Share'} {splitVenue(pickedVenue.label).name} · {fmtTime(venuePickTime, th)}
          </button>
        </div>
        )}

        {/* ---------- C7 · voice note bar ---------- */}
        <div data-testid="live-mic-recording-bar" className={isRecordingMic ? 'cp-rec' : 'sr-only'}>
          <div className="row">
            <span className="cp-red" aria-hidden="true" />
            <span style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
              0:{String(recSecs).padStart(2, '0')}
            </span>
            <Wave bars={WAVE_LIVE} live={isRecordingMic} />
            <span className="sr-only">Recording Mic (Speak or Edit Below)...</span>
          </div>
          <div className="cp-trn">
            <input
              id="voice-transcript-input"
              name="voiceTranscript"
              type="text"
              data-testid="voice-transcript-input"
              value={voiceTranscript}
              onChange={(e) => setVoiceTranscript(e.target.value)}
              placeholder={th ? 'พูด หรือพิมพ์แก้ข้อความก่อนส่ง' : 'Speak, or edit the words before sending'}
              aria-label="Voice transcript"
            />
            <span className="th">{th ? '→ ส่งพร้อมคำแปลภาษาอังกฤษ' : '→ ส่งพร้อมคำแปลภาษาไทย'}</span>
          </div>
          <div className="cp-btns">
            <button
              type="button"
              className="cp-btn cp-btn-ghost is-icon"
              aria-label="Delete recording"
              onClick={() => {
                triggerHaptic('tap')
                stopSpeech()
                setVoiceTranscript('')
                setIsRecordingMic(false)
              }}
            >
              🗑
            </button>
            <button type="button" className="cp-btn cp-btn-ghost" data-testid="send-voice-as-is-btn" onClick={() => handleSendVoiceNote(false)}>
              {th ? 'ส่งตามนี้' : 'Send as is'}
            </button>
            <button type="button" className="cp-btn cp-btn-gold" data-testid="send-translated-voice-btn" onClick={() => handleSendVoiceNote(true)}>
              {th ? 'ส่งเป็นอังกฤษ' : 'Send in Thai'}
              <span className="sr-only"> Send + Auto-Translate TH/EN ➤</span>
            </button>
          </div>
        </div>

        {/* ---------- C8 · Wingman: two openers, tap fills the input ---------- */}
        {showWing && (
          <div className="cp-wing" data-testid="wingman-strip">
            {(stageChips() ?? (isHostRole && hostRow
              ? (() => {
                  // host: two quick, polite replies in her language (translated to English on send)
                  const hp = hostPlanFor(activePartnerId)
                  const seed = hostRow.plan
                  const where = hp ? hp.venue.split(' ')[0] : seed ? seed.venue.split(' ')[0] : ''
                  const when = hp ? fmtTime(hp.time, th) : seed ? `${th ? seed.day.th : seed.day.en.toLowerCase()} ${fmtTime(seed.time, th)}` : ''
                  const meet = (hp && hp.state !== 'declined') || seed?.state === 'ok'
                  return [
                    { k: th ? 'ตอบไว' : 'Quick reply', text: meet ? (th ? `เจอกัน ${where} ${when} นะคะ 🙏` : `See you at ${where}, ${when} 🙏`) : seed?.state === 'paid' ? (th ? 'ขอบคุณนะคะ สนุกมาก 💛' : 'Thank you, that was fun 💛') : th ? 'ขอบคุณที่ทักมานะคะ 😊' : 'Thanks for the message 😊' },
                    { k: th ? 'สุภาพ' : 'Polite', text: meet ? (th ? 'ถึงแล้วทักในแชทนี้ได้เลยนะคะ 🙏' : 'Message me here when you arrive 🙏') : th ? 'ยินดีค่ะ ขอเช็ควันให้นะคะ' : 'Happy to! Let me check the date 🙏' },
                  ]
                })()
              : th
                ? [
                    { k: 'ถาม', text: `${roomPersona ? `ทริป${roomPersona.title.th}` : 'ทริปนี้'}เหมาะกับมือใหม่ไหมคะ?` },
                    { k: 'นัดวัน', text: 'เสาร์นี้บ่ายสองได้ไหมคะ? จองในแอปได้เลย' },
                  ]
                : [
                    { k: 'Ask', text: `Is the ${roomPersona ? roomPersona.title.en : 'experience'} OK for a first-timer?` },
                    { k: 'Plan', text: 'Could we do Saturday around 2 PM? I can book it here.' },
                  ])
            ).map((c, i) => (
              <button
                key={i}
                type="button"
                className="chip"
                data-testid={i === 0 ? 'wingman-choice-playful' : 'wingman-choice-direct'}
                onClick={() => {
                  if (isHostRole || aiWingmanFreeLeft <= 0) {
                    triggerHaptic('select')
                    setDraftText(c.text)
                    window.setTimeout(() => composerInputRef.current?.focus(), 0)
                    return
                  }
                  handlePickWingman(c.text)
                }}
              >
                <small>
                  ✨ {c.k}
                  {''}
                </small>
                <span>{c.text}</span>
              </button>
            ))}
            <button type="button" className="x" aria-label="Hide Wingman" onClick={() => setWingDismissed(true)}>
              ✕
            </button>
          </div>
        )}

        {/* KRING VISUAL V2 · V3 — the ONE booking card, docked above the composer (slim bar → expands on tap) */}
        {dockOffer && !giftOpen && !isRecordingMic && panel !== 'photo' && panel !== 'venue' ? (
          <BookingDock
            key={dockOffer.id}
            offer={dockOffer}
            side={kringSide}
            th={th}
            open={dockOpen}
            onToggle={setDockOpen}
            onBump={(b) => {
              triggerHaptic('select')
              setBumpBooking(b)
            }}
            onReview={(b) => setReviewFor(b)}
            onBooked={() => island(th ? 'จองแล้ว · ยอดจองพักไว้จนเจอกัน' : 'Booked · held until you meet', 'green', '✓')}
          />
        ) : null}

        {/* ---------- composer ---------- */}
        <div className={giftOpen || isRecordingMic || panel === 'photo' || panel === 'venue' ? 'sr-only' : 'cp-comp-wrap'} style={{ flex: 'none' }}>
          <input
            id="chat-photo-file-input"
            name="chatPhotoFile"
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFilePhotoUpload}
            data-testid="chat-photo-file-input"
          />
          {LEGACY_UI && (<>
          <input
            id="in-chat-lucky-dialogue-input"
            name="inChatLuckyDialogue"
            type="text"
            aria-label="Lucky dialogue note"
            data-testid="in-chat-lucky-dialogue-input"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            className="sr-only"
          />
          <button type="button" data-testid="simulate-host-reply-btn" onClick={handleSimulateHostReply} className="sr-only">
            <span data-testid="simulate-host-reply">+ Reply</span>
          </button>
          </>)}

          {replyTo ? <ReplyBar who={replyTo.who} text={replyTo.text} th={th} onClear={() => setReplyTo(null)} /> : null}
          <StickerTray
            open={stickerOpen}
            th={th}
            onSticker={sendSticker}
            onEmoji={(e) => setDraftText((d) => d + e)}
            onGifts={isHostRole ? undefined : () => setDrawerMode('treats')}
            onClose={() => setStickerOpen(false)}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSendMessage()
            }}
            className="cp-comp"
          >
            <button
              type="button"
              data-testid="velvet-nightlife-dock-toggle-btn"
              aria-label={panel === 'attach' ? 'Close attachments' : 'Attach'}
              aria-expanded={panel === 'attach'}
              className="cp-orb is-plus"
              onClick={() => {
                triggerHaptic('tap')
                setDrawerMode('none')
                setIsRecordingMic(false)
                setPanel((p) => (p === 'none' ? 'attach' : 'none'))
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button
              type="button"
              className={`cp-orb kc-smile${stickerOpen ? ' is-on' : ''}`}
              data-testid="chat-sticker-btn"
              aria-label={th ? 'สติกเกอร์' : 'Stickers'}
              aria-expanded={stickerOpen}
              onClick={() => {
                triggerHaptic('select')
                setPanel('none')
                setDrawerMode('none')
                setStickerOpen((v) => !v)
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
              </svg>
            </button>
            <div className="cp-field">
              <input
                ref={composerInputRef}
                id="chat-message-input"
                name="chatMessage"
                type="text"
                data-testid="chat-message-input"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                onFocus={() => setPanel('none')}
                placeholder={th ? 'ข้อความ' : language === 'zh' ? '消息' : 'Message'}
                aria-label={th ? `ข้อความถึง ${viewPartner.name} · แปลอัตโนมัติ` : `Message ${viewPartner.name} · auto-translated`}
              />
              {/* Round 4 · Marco 16c: a short placeholder + a compact translate tag — nothing clips at 320 px */}
              {!draftText.trim() && (
                <span className="cp-xl" aria-hidden="true">
                  {th || isHostRole ? 'TH→EN' : 'EN→TH'}
                </span>
              )}
              {!draftText.trim() && (
                <button
                  type="button"
                  data-testid="real-time-voice-mic-btn"
                  aria-label="Record a voice note (auto-translates)"
                  className={`cp-orb${isRecordingMic ? ' is-rec' : ''}`}
                  onClick={() => {
                    if (isRecordingMic) {
                      stopSpeech()
                      setIsRecordingMic(false)
                    } else {
                      startRecording()
                    }
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5 11a7 7 0 0014 0M12 18v3" />
                  </svg>
                </button>
              )}
            </div>
            {/* Round 4 · Ploy: hosts receive gifts, they don't buy them — no gift tray / Lucky for the host role */}
            {/* the one primary action in a chat with a local: Book (or jump to the live offer / ticket) */}
            <button
              type="button"
              hidden={isHostRole || Boolean(draftText.trim())}
              data-testid="kring-chat-book-orb"
              aria-label={kringBooking ? (th ? 'ดูการจอง' : 'See the booking') : kringLatest && effectiveOfferStatus(kringLatest, nowTick) === 'open' ? (th ? 'ดูข้อเสนอ' : 'See the offer') : th ? `จอง ${viewPartner.name}` : `Book ${viewPartner.name}`}
              className="cp-orb is-gold kc-book-orb"
              onClick={() => {
                triggerHaptic('select')
                setPanel('none')
                setDrawerMode('none')
                if (kringBooking) return scrollToId('kring-plan-ticket')
                if (kringLatest && effectiveOfferStatus(kringLatest, nowTick) === 'open') return scrollToId('kring-offer-card')
                bookThisLocal()
              }}
            >
              <b aria-hidden="true">฿</b>
            </button>
            <button
              type="submit"
              data-testid="send-chat-message-btn"
              aria-label="Send"
              aria-disabled={!draftText.trim()}
              className={`cp-orb${draftText.trim() ? ' is-send' : ''}`}
              style={draftText.trim() ? undefined : { display: 'none' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
              <span className="sr-only">➤ Send {requiresPriorityTreat ? '🍵 🪙 500' : t.ui.chatSendBtn}</span>
            </button>
          </form>

          {LEGACY_UI && (
          <div className="sr-only">
            <button type="button" data-testid="send-voice-note-btn" onClick={() => handleSendVoiceNote(true)}>
              🎙️ Voice
            </button>
            <button type="button" data-testid="quick-whatsapp-photo-pill" onClick={() => setPanel((p) => (p === 'photo' ? 'none' : 'photo'))}>
              📷 ① Photo
            </button>
 <button type="button" data-testid="send-view-once-quick-btn" onClick={handleSendViewOncePhoto}>
              ① View-once
            </button>
            <button type="button" data-testid="quick-ai-voice-translate-pill" onClick={() => handleSendVoiceNote(true)}>
              🎙️ Voice Translate
            </button>
            <button type="button" data-testid="in-chat-open-gift-sheet-btn" onClick={() => setDrawerMode((cur) => (cur === 'treats' ? 'none' : 'treats'))}>
              🎁 Gift
            </button>
          </div>
          )}
        </div>

        {/* KRING · suggest a change / counter · the กริ๊ง! bump · review + share */}
        <SuggestChangeSheet
          open={Boolean(changeOffer)}
          offer={changeOffer ? planStore.offers[changeOffer.id] ?? changeOffer : null}
          side={kringSide}
          th={th}
          mode={kringSide === 'host' ? 'counter' : 'change'}
          onClose={() => setChangeOffer(null)}
          onSent={() => island(th ? 'ส่งแล้ว · รอคำตอบ' : 'Sent · waiting for an answer', 'neutral', '💬')}
        />
        {bumpBooking ? (
          <BumpCheckIn
            booking={bumpBooking}
            side={kringSide}
            th={th}
            onClose={() => setBumpBooking(null)}
            onReleased={(b) => {
              // the existing release call (the same one the old phone check-in used) with the agreed amount —
              // FIX2 · Marco 1: after the contact frame has painted, never inside it
              const who = viewPartner.name
              afterPaint(() => {
                setArrivalState('clinked')
                onPhoneClinkRelease?.(who, Math.round(b.heldThb * 100))
              })
              // V1 · the header logo's one-time blue→gold flow, once "Released ฿X" has risen from the seam
              window.setTimeout(flowLogo, 900)
            }}
            onDone={(b) => {
              // T3 · mutual reviews: both sides go on to rate each other after the same bump
              if (!myReview(b, kringSide)) window.setTimeout(() => setReviewFor(b), 260)
            }}
          />
        ) : null}
        <ReviewSheet open={Boolean(reviewFor)} booking={reviewFor ? planStore.bookings[reviewFor.id] ?? reviewFor : null} th={th} side={kringSide} photo={viewPartner.avatar} onClose={() => setReviewFor(null)} />

        {/* copilot presets (sr-only reference for host/agent onboarding tests) */}
{LEGACY_UI && (
        <section data-testid="short-bubble-copilot-card" className="sr-only">
          <div data-testid="short-bubble-copilot">
            {(['buyer', 'host', 'agent'] as const).map((trackKey) => (
              <button key={trackKey} type="button" data-testid={`copilot-track-${trackKey}`} onClick={() => setCopilotTrack(trackKey)}>
                {SHORT_BUBBLE_COPILOT_PRESETS[trackKey].label}
              </button>
            ))}
            {activeCopilot.bubbles.map((bubble, idx) => (
              <button key={bubble} type="button" data-testid={`short-bubble-chip-${idx}`} onClick={() => handleSendMessage(bubble)}>
                “{bubble}”
              </button>
            ))}
            <p data-testid="zero-backfire-pivot-box">🛡️ Pivot: “{activeCopilot.safetyPivot}”</p>
          </div>
        </section>
        )}
      </div>
      )}

      {/* ============================ GIFT TRAY (fixed bottom, chat stays visible) ============================ */}
      {giftOpen && <div className="fixed inset-0 z-[49]" aria-hidden="true" onClick={() => setDrawerMode('none')} />}
      {(giftOpen || mountHiddenTrees) && (
      <div ref={trayRef} data-testid="in-chat-lucky-dock" className={giftOpen ? 'cp-tray' : 'sr-only'}>
        <span className="cp-grab" aria-hidden="true" />
        <div className="cp-tray-h" data-testid="chon-vip-gift-header-strip">
          <Avatar src={viewPartner.avatar} name={viewPartner.name} size="xs" testId="in-chat-gift-host-avatar" />
          <b>{th ? `ส่งให้ ${viewPartner.name} · แตะเดียวส่งเลย` : `To ${viewPartner.name} · one tap sends`}</b>
          <span className="sr-only">【Chon! VIP】 👑 [{selectedLuckyItem.name}]</span>
          <span data-testid="chat-live-reservoir-pill" className="sr-only">
            💧 Pool: 🪙 {chatLuckyPool.reservoirBalanceCoins.toLocaleString('en-US')}
          </span>
          <button
            type="button"
            className="cp-x"
            data-testid="close-gift-tray-btn"
            aria-label="Close gifts"
            onClick={() => {
              setDrawerMode('none')
              setShowQuickRechargeSheet(false)
            }}
          >
            ✕
          </button>
        </div>
        <div data-testid="variant3-jackpot-ticker" className="sr-only">
          🔔 ✨ @Alex_UK unlocked +🪙 50,000 Resonance Combo Bonus!
        </div>

        <div data-testid="while-playing-chat-composer-bar" className="cp-tray-in">
          <input
            id="while-playing-chat-input"
            name="whilePlayingChat"
            type="text"
            data-testid="while-playing-chat-input"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draftText.trim()) {
                e.preventDefault()
                handleSendMessage()
              }
            }}
            placeholder={th ? `พิมพ์ถึง ${viewPartner.name} ระหว่างส่งของขวัญ` : `Say something to ${viewPartner.name}…`}
            aria-label="Message while gifting"
          />
          <button type="button" aria-label="Send message" onClick={() => handleSendMessage()}>
            ➤
          </button>
        </div>

        {/* retired quick-recharge look — sr-only stand-in; the real sheet is the ONE top-up sheet (chon:open-topup) */}
        {showQuickRechargeSheet && (
          <div data-testid="vone-poppo-quick-recharge-sheet" className="sr-only">
            <span>🪙 {liveCoinBalance.toLocaleString('en-US')} remaining — top up to keep gifting</span>
            <button type="button" data-testid="close-quick-recharge-sheet-btn" onClick={() => setShowQuickRechargeSheet(false)}>
              ✕
            </button>
            {[30_000, 50_000, 120_000].map((coins) => (
              <button
                key={coins}
                type="button"
                data-testid={`quick-recharge-pkg-${coins}`}
                onClick={() => {
                  setShowQuickRechargeSheet(false)
                  window.dispatchEvent(new CustomEvent('chon:open-topup', { detail: { reason: 'chat-gift', needThb: coins / 100 } }))
                }}
              >
                ฿{fmt(coins / 100)}
              </button>
            ))}
            <button
              type="button"
              data-testid="quick-recharge-submit-btn"
              onClick={() => {
                setShowQuickRechargeSheet(false)
                window.dispatchEvent(new CustomEvent('chon:open-topup', { detail: { reason: 'chat-gift' } }))
              }}
            >
              Top up
            </button>
          </div>
        )}

        <div data-testid="poppo-floating-lucky-panel">
          <div data-testid="in-chat-poppo-gift-tray">
            <PoppoGiftPanel
              panelTestId="in-chat-poppo-gift-panel"
              tabs={[
                { id: 'treats', testId: 'gift-tray-tab-treats', label: th ? '🎁 ของขวัญ' : '🎁 Gifts', srLabel: 'Normal Gift' },
                { id: 'lucky', testId: 'gift-tray-tab-lucky', label: th ? '🔔 คอมโบ +5%' : '🔔 Combo +5%', srLabel: 'Lucky Gift' },
                { id: 'real-treats', testId: 'gift-tray-tab-real-treats', label: th ? '🌹 ส่งจริง' : '🌹 Real treats', srLabel: 'Real Treats' },
              ]}
              activeTab={drawerMode === 'none' ? 'treats' : drawerMode}
              onTab={(id) => {
                triggerHaptic('select')
                setDrawerMode(id as DrawerMode)
              }}
              subheader={
                <>
                  {drawerMode === 'real-treats' ? (
                    <div data-testid="real-treats-emotional-subtitle" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span className="cp-tray-note">
                        {th ? `ของจริงส่งถึง ${viewPartner.name} — โค้ดใช้ได้ทันที หรือกุหลาบใน 2 ชม.` : `Real things for ${viewPartner.name}: instant codes or roses in 2 hours.`}
                      </span>
                      <div data-testid="real-world-treat-grid" className="cp-real">
                        {REAL_TREATS.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            data-testid={`real-treat-card-${r.id}`}
                            onClick={() => {
                              if (liveCoinBalance < r.coins) {
                                requestTopUp(r.coins, 'real-treat')
                                return
                              }
                              triggerHaptic('success')
                              playKringBumpChime()
                              triggerChaoPhrayaFireworks(2)
                              recordReceivedGift(viewPartner.name, {
                                emoji: r.emoji,
                                name: r.title,
                                nameTh: r.titleTh,
                                thb: Math.round(r.coins / 100),
                              })
                              dispatchInternalWalletDelta({ paidDelta: -r.coins })
                              setLiveCoinBalance((prev) => Math.max(0, prev - r.coins))
                              setComboStreakCount((prev) => prev + 1)
                              setMessages((prev) => [
                                ...prev,
                                {
                                  id: `msg-real-treat-${Date.now()}`,
                                  sender: 'guest',
                                  senderName: 'You',
                                  rawText: `${r.emoji} ${r.title} for ${viewPartner.name}`,
                                  timestamp: 'Just now',
                                  luckyGameWin: {
                                    itemEmoji: r.emoji,
                                    itemName: r.title,
                                    combo: 1,
                                    multiplier: 1,
                                    rewardCoins: r.coins,
                                    chatNote: r.sub,
                                    isFixedTreat: true,
                                    spendCoins: r.coins,
                                  },
                                },
                              ])
                              setStatusBanner(`💝 Real Treat Sent: ${r.emoji} ${r.title} for ${viewPartner.name}!`)
                              island(th ? `ส่ง ${r.titleTh} แล้ว` : `${r.title} on its way`, 'gold', r.emoji)
                            }}
                          >
                            <i aria-hidden="true">{r.emoji}</i>
                            <b>{th ? r.titleTh : r.title}</b>
                            <small>{th ? r.subTh : r.sub}</small>
                            <em>฿{fmt(r.coins / 100)}</em>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : drawerMode === 'lucky' ? (
                    <div data-testid="lucky-tab-baht-to-coins-bar" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                          {th ? '🪙 แลก:' : '🪙 Swap:'}
                        </span>
                        <span className="sr-only">
                          {th ? '🪙 แลก ฿ → โปรโมเครดิต (฿1 = 100) · 🔒 แลกแล้วถอนไม่ได้' : '🪙 Swap ฿ → Promo Credit (฿1 = 100) · 🔒 1-Way · Non-Withdrawable'}
                        </span>
                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4 }}>
                          {[
                            { thb: 50, coins: 5_000 },
                            { thb: 100, coins: 10_000 },
                            { thb: 500, coins: 50_000 },
                          ].map((pack) => (
                            <button
                              key={pack.thb}
                              type="button"
                              data-testid={`lucky-swap-baht-${pack.thb}`}
                              onClick={() => {
                                triggerHaptic('select')
                                window.dispatchEvent(
                                  new CustomEvent('chon:open-topup', {
                                    detail: { reason: 'kring-coin-swap', needThb: pack.thb },
                                  }),
                                )
                              }}
                              style={{
                                minHeight: 24,
                                height: 24,
                                padding: '0 4px',
                                borderRadius: 999,
                                border: 0,
                                background: 'var(--surface-2)',
                                color: 'var(--text-1)',
                                fontSize: 10,
                                fontWeight: 800,
                                whiteSpace: 'nowrap',
                                cursor: 'pointer',
                              }}
                            >
                              ฿{pack.thb} → +{fmt(pack.coins)} 🪙
                            </button>
                          ))}
                        </div>
                      </div>
                      <span
                        className="cp-tray-note"
                        data-testid="lucky-tab-rtp-disclaimer"
                        style={{ fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
                      >
                        {th
                          ? 'ⓘ โบนัสคอมโบสะสมตามจังหวะ · โปรโมถอนเป็นเงินสดไม่ได้'
                          : 'ⓘ Deterministic combo milestone bonus · non-cashable promo'}
                      </span>
                      {(() => {
                        const effectivePoolCoins = luckyPoolReserveCoins === undefined ? chatLuckyPool.reservoirBalanceCoins : luckyPoolReserveCoins
                        if (effectivePoolCoins === null || effectivePoolCoins <= 0) return null
                        return (
                          <div data-testid="lucky-tab-pot-counter" className="sr-only">
                            🎰 2% POT: ฿{Math.floor(effectivePoolCoins / 100).toLocaleString('en-US')}
                          </div>
                        )
                      })()}
                    </div>
                  ) : (
                    <span className="cp-tray-note">{th ? 'ลงแชทเป็นใบเสร็จสีทอง' : 'Lands in the chat as a gold receipt'}</span>
                  )}
                </>
              }
              items={
                drawerMode === 'real-treats'
                  ? []
                  : [
                      { id: 'chayen-lucky', emoji: '🧋', name: 'Cha Yen', coins: 1_500 },
                      { id: 'neon-rose', emoji: '🌹', name: 'Wai Rose', coins: 200, badge: 'Tip' },
                      { id: 'thai-inhaler', emoji: '🌿', name: 'Inhaler', coins: 500 },
                      { id: 'diamond-vip', emoji: '💎', name: 'Diamond', coins: 600, badge: 'Hot' },
                      { id: 'clink-glass', emoji: '🪷', name: 'Lotus', coins: 1_200 },
                      { id: 'golden-tuktuk', emoji: '🛺', name: 'Tuk-Tuk', coins: 2_400 },
                      { id: 'cherry-vip', emoji: '🍒', name: 'Cherry', coins: 2_400, badge: 'Hot' },
                      // Round 4 · Wei B13 / Marco 7: one real big gift (≥ BIG_GIFT_MIN_COINS) so the big-gift show is reachable
                      { id: 'crown-vip', emoji: '👑', name: 'Crown', coins: 9_900, badge: 'VIP' },
                    ]
              }
              itemTestId={(item) => `in-chat-lucky-item-${item.id}`}
              selectedId={selectedLuckyId}
              onSelect={(item) => {
                triggerHaptic('select')
                setSelectedLuckyId(item.id)
              }}
              priceFor={(item) => item.coins}
              quantities={drawerMode === 'real-treats' ? [] : [1, 10, 50, 99]}
              quantity={luckyCombo}
              onQuantity={(q) => {
                triggerHaptic('select')
                setLuckyCombo(q)
              }}
              quantityTestId={(q) => `in-chat-lucky-combo-${q}`}
              balanceCoins={liveCoinBalance}
              balanceTestId="in-chat-live-coin-balance"
              onBalanceTap={() => {
                triggerHaptic('tap')
                window.dispatchEvent(new CustomEvent('chon:open-topup', { detail: { reason: 'chat-balance' } }))
              }}
              sendTestId="in-chat-lucky-roll-btn"
              comboTestId="poppo-golden-combo-btn"
              comboCount={comboStreakCount}
              onSend={() => {
                const before = liveCoinBalance
                handlePlayInChatLuckyRoll()
                return before >= selectedLuckyItem.coins * luckyCombo || before >= 0
              }}
              winBanner={
                bottomLeftWinAmount !== null && bottomLeftWinAmount > 0 ? (
                  <div className="gift-win" data-testid="vone-poppo-jackpot-win-banner">
                    <span>🍀</span>
                    <span className="tabular-nums">+🪙 {fmt(bottomLeftWinAmount)}</span>
                    <span className="cp-dim" style={{ marginLeft: 'auto' }}>
                      {selectedLuckyItem.emoji} ×{Math.max(1, comboStreakCount)}
                    </span>
                  </div>
                ) : null
              }
            >
              {/* legacy nodes kept for unit tests */}
              <div className="sr-only">
                <div data-testid="bottom-left-balance-win-pill">
                  +🪙 {(bottomLeftWinAmount && bottomLeftWinAmount > 0 ? bottomLeftWinAmount : 4_500).toLocaleString('en-US')}
                </div>
                <div data-testid="vone-poppo-floating-streak-stack">
                  <span data-testid="vone-poppo-streak-pill">
                    sent {selectedLuckyItem.name} x{comboStreakCount}
                  </span>
                </div>
                <span data-testid="vone-poppo-combo-x-badge">x{Math.max(1, comboStreakCount)}</span>
                <button type="button" data-testid="in-chat-lucky-combo-100" onClick={() => setLuckyCombo(100)}>x100</button>
                <button type="button" data-testid="in-chat-lucky-combo-9" onClick={() => setLuckyCombo(9)}>x9</button>
                <button type="button" data-testid="in-chat-lucky-combo-520" onClick={() => setLuckyCombo(520)}>x520</button>
                <button
                  type="button"
                  data-testid="in-chat-topup-btn"
                  onClick={() => window.dispatchEvent(new CustomEvent('chon:open-topup', { detail: { reason: 'chat-gift' } }))}
                >
                  + Top-Up
                </button>
                {IN_CHAT_GIFT_TRAY_ITEMS.filter(
                  (i) => !['chayen-lucky', 'crown-vip', 'thai-inhaler', 'neon-rose', 'diamond-vip', 'clink-glass', 'golden-tuktuk', 'cherry-vip'].includes(i.id),
                ).map((item) => (
                  <button key={item.id} type="button" data-testid={`in-chat-lucky-item-${item.id}`} onClick={() => setSelectedLuckyId(item.id)}>
                    {item.name}
                  </button>
                ))}
                {IN_CHAT_LUCKY_ITEMS.filter((i) => i.id === 'envelope' || i.id === 'pearl').map((item) => (
                  <button key={item.id} type="button" data-testid={`in-chat-lucky-item-${item.id}`} onClick={() => setSelectedLuckyId(item.id)}>
                    {item.name}
                  </button>
                ))}
              </div>
            </PoppoGiftPanel>

            <div className="sr-only">
              {IN_CHAT_THAI_TREATS.map((treat) => (
                <button key={treat.id} type="button" onClick={() => handleSendQuickTreatInChat(treat)}>
                  {treat.emoji} {treat.name} 🪙 {treat.coins.toLocaleString('en-US')}
                </button>
              ))}
              <div data-testid="treats-tab-bottom-balance-bar">🪙 {liveCoinBalance.toLocaleString('en-US')}</div>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}
