/* Kring v6 app state. One mutable state object + a version counter so React re-renders on change.
   Mirrors the approved prototype (reference/prototype/app.js `S`). Persisted parts survive reloads. */
import { useSyncExternalStore } from 'react'

export type Lang = 'en' | 'zh' | 'ko' | 'hi' | 'ru' | 'ms' | 'th'
export type Diet = 'nonveg' | 'veg' | 'halal' | 'jain' | 'nobeef' | 'nopork'
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled'
export interface Booking {
  /** server booking id (live builds: the id kr6_request_booking returned); absent in preview builds */
  id?: string
  kind: 'act' | 'tour' | 'pack'
  act?: string
  k?: string
  img?: string
  date: Date
  time: string
  guests: number
  amt: number
  status: BookingStatus
  pay?: number
  done?: boolean
  meeting_place_id?: string
  meeting_lat?: number
  meeting_lng?: number
  meeting_name?: string
  ticket_tier?: 'ticket_standard' | 'ticket_signature' | 'ticket_premier' | 'pass_7day'
  ticket_status?: 'active' | 'used' | 'forfeited' | 'refunded'
  voucher_code?: string
  voucher_status?: 'reserved' | 'unlocked' | 'redeemed' | 'cancelled'
  confirmed_by?: 'host' | 'slip' | 'cash'
  settled_at?: string
  cancelled_reason?: string
  guest_strike_issued?: boolean
  /** host price for this booking, paid to the host at the place (never through Kring); amt is only what was paid to Kring */
  host_amt?: number
  /** what amt paid for: a ticket, a 7-Day Pass bought with this booking, a pass upgrade, covered by a pass, the launch ticket, or waived */
  paid_kind?: 'ticket' | 'pass' | 'upgrade' | 'covered' | 'launch' | 'waived' | 'partner'
  /** booking reference shown to the guest (the same one on #held, Trips, receipt, check-in and the host's phone) */
  ref?: string
  /** Kring ticket amount given back when the booking was cancelled, and when */
  refund_amt?: number
  cancelled_at?: string
  /** when the guest sent the request (ISO): sets the host's answer deadline (data.ts replyBy) and the receipt's paid-at time */
  made_at?: string
  /** a second booking at the same host and time for more people of one group (ref of the first one) */
  extra_of?: string
  /** the free launch ticket this booking used was given back (cancelled before the host confirmed) */
  launch_back?: boolean
}
export interface Notify { bookings: boolean; chat: boolean; reminders: boolean; deals: boolean }
/** The signed-in person's own profile and settings (core/account.ts loads and saves it). */
export interface Profile {
  name: string; country: string; languages: string[]; bio: string
  notify: Notify; emName: string; emPhone: string; promptpay: string
  promptpay_personal?: string; merchant_qr?: string; stripe_payment_link?: string
  bring_friend_first_3?: boolean; is_volunteer?: boolean
  has7DayPass?: boolean
  /** end of the guest's 7-Day Pass (ISO). Set only by a real pass purchase (local demo) or by the server. */
  passUntil?: string | null
  noShowStrikes?: number; bookingSuspended?: boolean
  /** Zone-1 launch: the guest's one free ticket has been used */
  usedLaunchTicket?: boolean
  /** a 7-Day Pass bought on its own (Me / Deals) or with a booking: when, how much, with what, and its receipt ref */
  passPaidAt?: string; passPaidThb?: number; passPayN?: string; passRef?: string
  /** currency the guest picked for the small "≈" hint (a country code; 'TH' = baht only) */
  cur?: string
  /** name / company / tax ID (GSTIN, VAT…) the guest typed for receipts */
  invoiceName?: string
  isLive?: boolean; liveUntil?: string | null
  idVerified: boolean; isHost: boolean; termsAt: string | null
  /** host: sent ID photo + face check for review (preview: set on this phone) */
  idSubmittedAt?: string
  /** host: clear front-facing profile photo (data URL or path), required before publishing an activity */
  hostPhoto?: string
  /** woman host: switch off story replies from guests */
  storyRepliesOff?: boolean
}
export interface GuestRequestItem {
  id: string
  activityWanted: string
  area: string
  requestedTimeLabel: string
  partySize: number
  status: 'open' | 'accepted'
}
export interface OfferCardMessage {
  sender: 'host' | 'guest'
  text: string
  masked: boolean
}
export interface ActivityOfferItem {
  id: string
  guestRequestId: string
  hostName: string
  activityId: string
  activityTitle: string
  meetingPlaceName: string
  proposedTimeLabel: string
  introNote: string
  messages: OfferCardMessage[]
  status: 'pending' | 'accepted'
}
export const EMPTY_PROFILE: Profile = {
  name: '', country: '', languages: [], bio: '', notify: { bookings: true, chat: true, reminders: true, deals: false },
  emName: '', emPhone: '', promptpay: '', promptpay_personal: '', merchant_qr: '',
  stripe_payment_link: '',
  bring_friend_first_3: false, is_volunteer: false, has7DayPass: false, noShowStrikes: 0, bookingSuspended: false,
  idVerified: false, isHost: false, termsAt: null,
}
export interface State {
  lang: Lang
  gender: 'f' | 'm' | 'x' | null
  diet: Diet[]
  sound: boolean
  act: string
  tip: number
  deal: number
  vou: number
  vouFrom: string
  seg: string
  lastTab: number
  from: Record<string, string>
  saved: Record<string, boolean>
  met: boolean
  host: boolean
  req: null | 'acc' | 'dec' | 'no'
  gifts: number[]
  time: string | null
  timeAct: string | null
  guests: number
  pay: number
  bookings: Booking[]
  vu: Record<number, boolean>
  vc: Record<number, number>
  ts: 'm' | 'l' | 'xl'
  cancelled: boolean
  late: number
  away: boolean
  myActs: string[]
  chatX: string[]
  /** Sent chat items per conversation (key = activity id, one host per activity), kept across reloads. */
  chats: Record<string, string[]>
  dayDate: Date
  stars?: number
  code?: boolean
  myCode?: string
  signedIn: boolean
  prof: Profile
  blocked: { id: string; name: string }[]
  reportedClips?: Record<string, boolean>
  liveActivityMap: Record<string, boolean>
  guestRequests: GuestRequestItem[]
  activityOffers: ActivityOfferItem[]
  /** host: answers to guest requests other than the main one (screens/host.tsx owns the shape) */
  hostReqs?: Record<string, unknown>
  /** host: the activity being created, kept across tabs, verification and reloads */
  hostDraft?: Record<string, unknown> | null
  /** host: referral code, made once and kept */
  hostRefCode?: string
  /** venue sign-up sent from this phone (pending until Kring approves it) */
  myVenue?: Record<string, unknown> | null
  /** host: settings of each published activity (title → schedule, bookings at the same time, description, cover) */
  hostActs?: Record<string, unknown>
  /** venue till: Kring booking codes already used for a table bill on this phone (code → venue + time) */
  venueUses?: Record<string, unknown>
  /** venue till: table bills recorded from this phone (newest first) */
  tableBills?: unknown[]
  /** explore city filter: 'bkk' or 'pty' */
  city: 'bkk' | 'pty'
  /** explore When filter: 'any' | 'tonight' | 'tomorrow' | 'weekend' */
  when: 'any' | 'tonight' | 'tomorrow' | 'weekend'
  /** story viewer: which host's story is open (actId) and which item index */
  storyHost: string
  storyIdx: number
  /** stories seen by this user (storyId -> true) */
  seenStories: Record<string, boolean>
  /** stories liked by this user (storyId -> true) */
  likedStories: Record<string, boolean>
  /** poll votes by this user (storyId -> 0 | 1) */
  storyVotes: Record<string, 0 | 1>
  /** hosts whose stories are muted (actId -> true) */
  mutedStories: Record<string, boolean>
  /** stories hidden by this user (storyId -> true) */
  hiddenStories: Record<string, boolean>
  /** story report count per storyId (3 reports hides it for everyone) */
  storyReports: Record<string, number>
  /** host-created stories on this phone */
  myStories: unknown[]
  /** per-host storyRepliesOff override in demo (actId -> boolean) */
  hostStoryRepliesOff: Record<string, boolean>
}

function nextSaturday(): Date {
  const d = new Date()
  let k = (6 - d.getDay() + 7) % 7
  if (k === 0) k = 7
  d.setDate(d.getDate() + k)
  d.setHours(18, 0, 0, 0)
  return d
}

const PERSIST_KEY = 'kring-v6'
const PERSISTED: (keyof State)[] = ['lang', 'gender', 'diet', 'sound', 'saved', 'ts', 'signedIn', 'prof', 'blocked', 'bookings', 'gifts', 'vu', 'vc', 'chats', 'act', 'myActs', 'hostReqs', 'hostDraft', 'hostRefCode', 'myVenue', 'hostActs', 'venueUses', 'tableBills', 'city', 'when', 'seenStories', 'likedStories', 'storyVotes', 'mutedStories', 'hiddenStories', 'storyReports', 'myStories', 'hostStoryRepliesOff']

export const S: State = {
  lang: 'en', gender: null, diet: [], sound: true, act: 'eat', tip: 0, deal: 0, vou: 0, vouFrom: 'vouchers', seg: 'exp',
  lastTab: 0, from: {}, saved: {}, met: false, host: false, req: null, gifts: [], time: null, timeAct: null, guests: 1,
  pay: 0, bookings: [], vu: {}, vc: {}, ts: 'm', cancelled: false, late: 0, away: false, myActs: [], chatX: [], chats: {},
  dayDate: nextSaturday(), signedIn: false, prof: { ...EMPTY_PROFILE, notify: { ...EMPTY_PROFILE.notify } }, blocked: [],
  city: 'bkk', when: 'any', storyHost: 'eat', storyIdx: 0, seenStories: {}, likedStories: {}, storyVotes: {}, mutedStories: {}, hiddenStories: {}, storyReports: {}, myStories: [], hostStoryRepliesOff: {},
  liveActivityMap: { eat: true, cafe: true, market: true, temple: true, oldtown: true },
  guestRequests: [
    {
      id: 'gr-yaowarat-1',
      activityWanted: 'street-food walk',
      area: 'Yaowarat',
      requestedTimeLabel: 'today 18:00',
      partySize: 2,
      status: 'open',
    },
    {
      id: 'gr-ari-2',
      activityWanted: 'specialty café walk',
      area: 'Ari',
      requestedTimeLabel: 'today 16:00',
      partySize: 1,
      status: 'open',
    },
  ],
  activityOffers: [
    {
      id: 'of-yaowarat-1',
      guestRequestId: 'gr-yaowarat-1',
      hostName: 'Nicha',
      activityId: 'eat',
      activityTitle: 'Yaowarat street food walk',
      meetingPlaceName: 'MRT Wat Mangkon Exit 1 · Ari Garden Roasters',
      proposedTimeLabel: 'today 18:00',
      introNote: 'Let’s meet at MRT Wat Mangkon Exit 1 at 18:00 for roasted chestnuts & Pad Thai!',
      messages: [
        {
          sender: 'host',
          text: 'See you at MRT Wat Mangkon Exit 1 (public station exit)!',
          masked: false,
        },
      ],
      status: 'pending',
    },
  ],
}

try {
  const raw = localStorage.getItem(PERSIST_KEY)
  if (raw) {
    const parsed = JSON.parse(raw) as Partial<State>
    if (Array.isArray(parsed.bookings)) {
      parsed.bookings = parsed.bookings.map((b) => ({
        ...b,
        date: b.date instanceof Date ? b.date : new Date(b.date || Date.now()),
      }))
    }
    Object.assign(S, parsed)
  }
  S.prof = { ...EMPTY_PROFILE, ...S.prof, notify: { ...EMPTY_PROFILE.notify, ...(S.prof?.notify || {}) } }
} catch { /* private mode: start fresh */ }

let version = 0
const subs = new Set<() => void>()

/** Wipe all user-specific state and localStorage on sign-out or account deletion. */
export function resetStateOnSignOut(): void {
  try { localStorage.removeItem(PERSIST_KEY) } catch { /* ignore */ }
  update((s) => {
    s.signedIn = false
    s.host = false
    s.gender = null
    s.diet = []
    s.prof = { ...EMPTY_PROFILE, notify: { ...EMPTY_PROFILE.notify } }
    s.bookings = []
    s.saved = {}
    s.blocked = []
    s.gifts = []
    s.vu = {}
    s.vc = {}
    s.chatX = []
    s.chats = {}
    s.myActs = []
    s.hostReqs = {}
    s.hostDraft = null
    s.hostActs = {}
    s.hostRefCode = undefined
    s.met = false
    s.req = null
    s.cancelled = false
    s.late = 0
    s.away = false
    s.seenStories = {}
    s.likedStories = {}
    s.storyVotes = {}
    s.mutedStories = {}
    s.hiddenStories = {}
    s.myStories = []
    s.hostStoryRepliesOff = {}
  })
}

/** Change state (mutate inside fn) and re-render subscribers. */
export function update(fn?: (s: State) => void): void {
  fn?.(S)
  version++
  try {
    const keep: Partial<State> = {}
    for (const k of PERSISTED) (keep as Record<string, unknown>)[k] = S[k]
    localStorage.setItem(PERSIST_KEY, JSON.stringify(keep))
  } catch { /* ignore */ }
  subs.forEach((f) => f())
}

export function subscribe(f: () => void): () => void {
  subs.add(f)
  return () => subs.delete(f)
}

/** Re-render this component whenever state changes; returns the live state object. */
export function useS(): State {
  useSyncExternalStore(subscribe, () => version)
  return S
}
