/**
 * KRING VISUAL V2 · "Earn reward 555" — the rewards model (tickets/…/picks3/REWARDS_MODEL.md).
 *
 * Traveller rewards are PROMO baht (gifts & extras, never bookings, 30-day expiry). Every task pays only after
 * something real happened, and nothing pays before the account's first real กริ๊ง! bump (a released booking).
 * Local rewards (cash with payouts) are NOT built yet — TODO(Argon): server-side payout rules, 7-day hold, fraud
 * checks. The Local tasks are listed as "coming soon" only.
 *
 * Money: this module NEVER writes balances. A claim credits promo through the EXISTING trusted wallet bus
 * (`dispatchInternalWalletDelta({ bonusDelta })`, the same path every promo credit already uses) and only records
 * the claim when App accepted it. Progress is read from real stores (planStore bookings/reviews, pins).
 * TODO(Argon): a server must re-check every claim (one account per person, device / payment-source dedupe, expiry).
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { dispatchInternalWalletDelta } from '../../lib/walletBus'
import { currentViewerId, getPlanStore, subscribePlanStore, type PlanStoreState } from '../../lib/planStore'
import { pinnedIds } from '../../lib/pins'
import { SAFETY_EVENT } from '../../lib/safetyStore'

export type RewardGroup = 'growth' | 'activity'
export type RewardTaskId = 'inv' | 'first' | 'rev' | 'share' | 'pin'
export type LocalTaskId = 'lver' | 'lfirst' | 'l5' | 'lshare' | 'linv'

export interface RewardTask<Id extends string = RewardTaskId> {
  id: Id
  emoji: string
  group: RewardGroup
  /** short row title */
  t: { en: string; th: string }
  /** full task name (detail sheet) */
  ta: { en: string; th: string }
  amtThb: number
  /** times it can pay in a month (lifetime for `once`) */
  cap: number
  once?: boolean
  how: { en: string; th: string }
  paid: { en: string; th: string }
  why: { en: string; th: string }
}

export const TRAVELLER_TASKS: RewardTask[] = [
  {
    id: 'inv', emoji: '💌', group: 'growth', amtThb: 100, cap: 2,
    t: { en: 'Invite a friend', th: 'ชวนเพื่อน' },
    ta: { en: 'Invite a friend · you both get ฿100', th: 'ชวนเพื่อน · ได้คนละ ฿100' },
    how: { en: 'Send your link. Your friend signs up and books a local.', th: 'ส่งลิงก์ของคุณ เพื่อนสมัครแล้วจองโลคอล' },
    paid: { en: 'When their first experience ends with the Kring! bump. You both get ฿100 promo.', th: 'เมื่อทริปแรกของเพื่อนจบด้วยการกริ๊ง! ได้โปรคนละ ฿100' },
    why: { en: 'A new traveller who has already booked once. We pay for a real customer, not a sign-up.', th: 'นักเดินทางใหม่ที่จองจริงแล้ว เราจ่ายให้ลูกค้าจริง ไม่ใช่แค่การสมัคร' },
  },
  {
    id: 'first', emoji: '🎟️', group: 'activity', amtThb: 100, cap: 1, once: true,
    t: { en: 'First experience', th: 'ทริปแรก' },
    ta: { en: 'Finish your first experience', th: 'จบทริปแรกของคุณ' },
    how: { en: 'Book any local and meet. Bump phones at the venue.', th: 'จองโลคอลคนไหนก็ได้ แล้วไปเจอกัน กริ๊ง! มือถือที่จุดนัด' },
    paid: { en: 'Right after the bump releases the booking.', th: 'ทันทีหลังกริ๊ง! ปล่อยยอดจอง' },
    why: { en: 'The first trip is where people drop off. After one trip, people book again.', th: 'ทริปแรกคือจุดที่คนหายไป เที่ยวครั้งแรกแล้วมักจองอีก' },
  },
  {
    id: 'rev', emoji: '⭐', group: 'activity', amtThb: 25, cap: 3,
    t: { en: 'Review a trip', th: 'รีวิวทริป' },
    ta: { en: 'Review a finished trip', th: 'รีวิวทริปที่จบแล้ว' },
    how: { en: 'Review your local after a finished trip. Any score counts, low or high.', th: 'ให้คะแนนโลคอลหลังทริปจบ ให้กี่ดาวก็นับ' },
    paid: { en: 'As soon as the review is posted.', th: 'ทันทีที่โพสต์รีวิว' },
    why: { en: 'Reviews help the next traveller choose. We pay for honesty, not for 5 stars.', th: 'รีวิวช่วยคนต่อไปเลือก เราจ่ายให้ความจริงใจ ไม่ใช่ 5 ดาว' },
  },
  {
    id: 'share', emoji: '📣', group: 'growth', amtThb: 20, cap: 4,
    t: { en: 'Share a price or bump', th: 'แชร์ราคาหรือกริ๊ง!' },
    ta: { en: 'Share a Price Check or your bump card', th: 'แชร์ผลเช็กราคาหรือการ์ดกริ๊ง!' },
    how: { en: 'Share a Price Check result or your Kring! card to a chat or group.', th: 'แชร์ผลเช็กราคาหรือการ์ดกริ๊ง! ไปที่แชทหรือกลุ่ม' },
    paid: { en: 'When someone new opens the link. Once a week.', th: 'เมื่อมีคนใหม่เปิดลิงก์ สัปดาห์ละครั้ง' },
    why: { en: 'Real price stories bring people in for free. The card shows Kring and links back to us.', th: 'เรื่องราคาจริงพาคนมาฟรี การ์ดมีลิงก์กลับมากริ๊ง' },
  },
  {
    id: 'pin', emoji: '♡', group: 'activity', amtThb: 20, cap: 1, once: true,
    t: { en: 'Save 3 locals', th: 'เซฟโลคอล 3 คน' },
    ta: { en: 'Save 3 locals you like', th: 'เซฟโลคอลที่ชอบ 3 คน' },
    how: { en: 'Tap the heart on three locals.', th: 'แตะหัวใจที่โลคอล 3 คน' },
    paid: { en: 'When the third local is saved.', th: 'เมื่อเซฟคนที่สาม' },
    why: { en: 'People who save locals come back to book them. Once only.', th: 'คนที่เซฟโลคอลมักกลับมาจอง ครั้งเดียว' },
  },
]

/** Local rewards: shown as "coming soon" only (payouts not built — Argon). */
export const LOCAL_TASKS: RewardTask<LocalTaskId>[] = [
  { id: 'lver', emoji: '🪪', group: 'growth', amtThb: 100, cap: 1, once: true, t: { en: 'Verify ID + list', th: 'ยืนยันตัวตน + ลงทริป' }, ta: { en: 'Verify your ID and list your first experience', th: 'ยืนยันตัวตนและลงทริปแรก' }, how: { en: 'Check your ID once, then list one experience with photos.', th: 'ยืนยันตัวตนครั้งเดียว แล้วลงทริปหนึ่งทริปพร้อมรูป' }, paid: { en: 'With your first payout, after your first booking.', th: 'มากับยอดโอนแรก หลังการจองแรก' }, why: { en: 'Each verified Local adds supply travellers can trust.', th: 'โลคอลที่ยืนยันแล้วทุกคนคือทางเลือกที่ไว้ใจได้' } },
  { id: 'lfirst', emoji: '🤝', group: 'activity', amtThb: 200, cap: 1, once: true, t: { en: 'First booking', th: 'การจองแรก' }, ta: { en: 'Finish your first booking', th: 'จบการจองแรก' }, how: { en: 'Accept a booking and meet. Bump phones at the venue.', th: 'รับจองแล้วไปเจอกัน กริ๊ง! ที่จุดนัด' }, paid: { en: 'Added to that payout.', th: 'รวมในยอดโอนนั้น' }, why: { en: 'A Local who has hosted once usually keeps hosting.', th: 'โลคอลที่พาเที่ยวครั้งแรกแล้วมักพาต่อ' } },
  { id: 'l5', emoji: '🌟', group: 'activity', amtThb: 150, cap: 1, once: true, t: { en: '3 five-star reviews', th: 'รีวิว 5 ดาว 3 ครั้ง' }, ta: { en: 'Get three 5-star reviews', th: 'ได้รีวิว 5 ดาว 3 ครั้ง' }, how: { en: 'Host three different travellers who each give 5 stars.', th: 'พาเที่ยวนักเดินทาง 3 คนที่ให้ 5 ดาว' }, paid: { en: 'After the third review.', th: 'หลังรีวิวที่สาม' }, why: { en: 'Great hosts make travellers come back.', th: 'โลคอลดีๆ ทำให้นักเดินทางกลับมา' } },
  { id: 'lshare', emoji: '🔗', group: 'growth', amtThb: 20, cap: 4, t: { en: 'Share your page', th: 'แชร์หน้าของคุณ' }, ta: { en: 'Share your Kring page', th: 'แชร์หน้ากริ๊งของคุณ' }, how: { en: 'Share your Kring page on Facebook, LINE or IG.', th: 'แชร์หน้ากริ๊งบน Facebook, LINE หรือ IG' }, paid: { en: 'When someone new opens it. Once a week.', th: 'เมื่อมีคนใหม่เปิด สัปดาห์ละครั้ง' }, why: { en: 'Locals bring their own followers to Kring.', th: 'โลคอลพาผู้ติดตามมากริ๊ง' } },
  { id: 'linv', emoji: '🏮', group: 'growth', amtThb: 300, cap: 2, t: { en: 'Invite a Local', th: 'ชวนโลคอล' }, ta: { en: 'Invite a friend to become a Local', th: 'ชวนเพื่อนมาเป็นโลคอล' }, how: { en: 'Invite a friend to host. They verify their ID and list an experience.', th: 'ชวนเพื่อนมาพาเที่ยว เพื่อนยืนยันตัวตนและลงทริป' }, paid: { en: 'After their first experience ends with a bump.', th: 'หลังทริปแรกของเพื่อนจบด้วยกริ๊ง!' }, why: { en: 'More good Locals = more choice = more bookings.', th: 'โลคอลดีมากขึ้น = ทางเลือกมากขึ้น' } },
]

/** Daily check-in: ฿2 a day, ฿8 on day 7 (one streak = ฿20), up to 4 streaks a month = ฿80. */
export const CHECKIN_DAYS = [2, 2, 2, 2, 2, 2, 8] as const
export const CHECKIN_STREAK_THB = CHECKIN_DAYS.reduce((a, b) => a + b, 0)
export const CHECKIN_STREAKS_PER_MONTH = 4
/** The honest monthly maximum for a traveller in their first month: 2×100 + 100 + 3×25 + 4×20 + 20 + 4×20 = ฿555. */
export const MONTH_MAX_THB = TRAVELLER_TASKS.reduce((a, t) => a + t.amtThb * t.cap, 0) + CHECKIN_STREAK_THB * CHECKIN_STREAKS_PER_MONTH
export const LOCAL_MAX_THB = LOCAL_TASKS.reduce((a, t) => a + t.amtThb * t.cap, 0)

export const REWARD_RULES: Array<{ icon: string; en: string; th: string }> = [
  { icon: '🎁', en: 'Promo pays for gifts and extras, not bookings.', th: 'โปรใช้กับของขวัญและของเสริม จองไม่ได้' },
  { icon: '⏳', en: 'Promo expires 30 days after you get it.', th: 'โปรหมดอายุ 30 วันหลังได้รับ' },
  { icon: '🙋', en: 'One account per person (phone number + ID). Rewards between accounts on the same device or payment source are cancelled.', th: 'หนึ่งคนหนึ่งบัญชี (เบอร์โทร + บัตร) รางวัลระหว่างบัญชีในเครื่องเดียวกันหรือช่องทางจ่ายเดียวกันจะถูกยกเลิก' },
  { icon: '🛡️', en: 'Nothing pays before a real Kring! bump (two phones, at the venue). Self-invites and fake trips are removed.', th: 'ไม่มีรางวัลก่อนกริ๊ง!จริง (มือถือสองเครื่อง ที่จุดนัด) ชวนตัวเองหรือทริปปลอมจะถูกลบ' },
]

/* ---------------------------------------------------------------------------------------------- */
/* stored state (per account, per device — display/bookkeeping only; the server is the real judge) */
/* ---------------------------------------------------------------------------------------------- */

export const REWARDS_KEY = 'kring_rewards_v1'
export const REWARDS_EVENT = 'kring:rewards'
/** Header gift → this event opens the rewards sheet (RewardsHost listens). */
export const OPEN_REWARDS_EVENT = 'kring:open-rewards'

interface UserRewards {
  /** 'YYYY-MM' (Bangkok) the monthly counters belong to */
  month: string
  /** claims this month per task */
  claimed: Partial<Record<RewardTaskId, number>>
  /** lifetime claims for once-only tasks */
  once: Partial<Record<RewardTaskId, boolean>>
  /** promo earned this month (display) */
  earnedThb: number
  /** check-in: days ticked in the current streak (0–7), the Bangkok date of the last tick */
  ciDays: number
  ciLast?: string
  /** check-in baht ticked but not yet paid (waits for the first bump) */
  ciBankThb: number
  /** streaks finished this month */
  ciStreaks: number
}
type Store = Record<string, UserRewards>

function bkkDate(now = Date.now()): string {
  return new Date(now + 7 * 3600e3).toISOString().slice(0, 10)
}
function bkkMonth(now = Date.now()): string {
  return bkkDate(now).slice(0, 7)
}
function blank(now = Date.now()): UserRewards {
  return { month: bkkMonth(now), claimed: {}, once: {}, earnedThb: 0, ciDays: 0, ciBankThb: 0, ciStreaks: 0 }
}
function readStore(): Store {
  try {
    const raw = window.localStorage.getItem(REWARDS_KEY)
    const v = raw ? (JSON.parse(raw) as unknown) : {}
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Store) : {}
  } catch {
    return {}
  }
}
export function readUserRewards(userId = currentViewerId(), now = Date.now()): UserRewards {
  if (typeof window === 'undefined') return blank(now)
  const u = readStore()[userId]
  if (!u) return blank(now)
  const month = bkkMonth(now)
  // a new month: monthly counters reset, lifetime "once" and the running streak stay
  if (u.month !== month) return { ...blank(now), once: u.once ?? {}, ciDays: u.ciDays ?? 0, ciLast: u.ciLast, ciBankThb: u.ciBankThb ?? 0 }
  return { ...blank(now), ...u }
}
function writeUserRewards(u: UserRewards, userId = currentViewerId()) {
  const all = readStore()
  all[userId] = u
  try {
    window.localStorage.setItem(REWARDS_KEY, JSON.stringify(all))
  } catch {
    // storage blocked: nothing was credited without a record of it being shown either
  }
  version++
  window.dispatchEvent(new CustomEvent(REWARDS_EVENT))
}

/* ---------------------------------------------------------------------------------------------- */
/* progress from real stores                                                                      */
/* ---------------------------------------------------------------------------------------------- */

export interface Facts {
  /** released bookings where I'm the guest (a real bump / venue QR) */
  bumps: number
  /** my reviews of released trips this month */
  reviewsThisMonth: number
  /** locals saved */
  saved: number
}

export function factsFrom(plans: PlanStoreState, viewerId = currentViewerId(), saved = pinnedIds().length, now = Date.now()): Facts {
  const month = bkkMonth(now)
  const mine = Object.values(plans.bookings ?? {}).filter((b) => b.guestId === viewerId && b.status === 'released')
  return {
    bumps: mine.length,
    reviewsThisMonth: mine.filter((b) => b.review && bkkMonth(b.review.at) === month).length,
    saved,
  }
}

export type TaskState = 'go' | 'claim' | 'done' | 'locked'
export interface TaskView {
  task: RewardTask
  /** progress shown "n/m" */
  n: number
  m: number
  state: TaskState
  /** units ready to claim now */
  ready: number
}

/** n/m, how many units are ready, and the button state for each traveller task. */
export function taskViews(facts: Facts, u: UserRewards): TaskView[] {
  const unlocked = facts.bumps > 0
  return TRAVELLER_TASKS.map((task) => {
    const claimed = task.once ? (u.once[task.id] ? 1 : 0) : u.claimed[task.id] ?? 0
    let earned = 0
    let n = 0
    let m = task.cap
    if (task.id === 'first') {
      earned = Math.min(1, facts.bumps)
      n = earned
    } else if (task.id === 'rev') {
      earned = Math.min(task.cap, facts.reviewsThisMonth)
      n = earned
    } else if (task.id === 'pin') {
      earned = facts.saved >= 3 ? 1 : 0
      n = Math.min(3, facts.saved)
      m = 3
    } else if (task.id === 'share') {
      // pays when someone NEW opens the link — needs the server (TODO Argon); weekly → one at a time
      n = 0
      m = 1
    } else {
      // invites pay after the friend's first bump — needs the server (TODO Argon)
      n = 0
    }
    const ready = Math.max(0, earned - claimed)
    const done = claimed >= task.cap || (task.once && claimed > 0)
    const state: TaskState = done ? 'done' : ready > 0 ? (unlocked ? 'claim' : 'locked') : 'go'
    return { task, n: done && task.id !== 'pin' ? Math.max(n, claimed) : n, m, state, ready }
  })
}

export interface CheckinView {
  /** index of today's cell (0–6) */
  today: number
  /** days already ticked in this streak (cells < ticked are ✓) */
  ticked: number
  canTick: boolean
  /** baht waiting for the first bump */
  bankThb: number
  streaksLeft: number
}
export function checkinView(u: UserRewards, now = Date.now()): CheckinView {
  const today = bkkDate(now)
  const yesterday = bkkDate(now - 864e5)
  // a missed day restarts the streak; a finished streak starts a new one
  let days = u.ciDays
  if (u.ciLast && u.ciLast !== today && u.ciLast !== yesterday) days = 0
  if (days >= 7 && u.ciLast !== today) days = 0
  const tickedToday = u.ciLast === today
  const streaksLeft = Math.max(0, CHECKIN_STREAKS_PER_MONTH - u.ciStreaks)
  return {
    today: tickedToday ? Math.max(0, days - 1) : Math.min(6, days),
    ticked: days,
    canTick: !tickedToday && streaksLeft > 0,
    bankThb: u.ciBankThb,
    streaksLeft,
  }
}

/* ---------------------------------------------------------------------------------------------- */
/* actions — the ONLY money call is the existing trusted promo credit                             */
/* ---------------------------------------------------------------------------------------------- */

function creditPromo(thb: number, note: string): boolean {
  if (thb <= 0) return false
  return dispatchInternalWalletDelta({ bonusDelta: Math.round(thb * 100), note, hideGlobal: true })
}

export type ClaimResult = { ok: true; thb: number } | { ok: false; reason: 'locked' | 'nothing' | 'rejected' }

/** Claim one ready unit of a task (promo through the wallet bus). */
export function claimTask(id: RewardTaskId, facts: Facts, now = Date.now()): ClaimResult {
  const u = readUserRewards(undefined, now)
  const v = taskViews(facts, u).find((x) => x.task.id === id)
  if (!v || v.ready <= 0 || v.state === 'done') return { ok: false, reason: 'nothing' }
  if (facts.bumps <= 0) return { ok: false, reason: 'locked' }
  const thb = v.task.amtThb
  if (!creditPromo(thb, `Reward · ${v.task.t.en} · promo`)) return { ok: false, reason: 'rejected' }
  const next = { ...u, earnedThb: u.earnedThb + thb }
  if (v.task.once) next.once = { ...u.once, [id]: true }
  next.claimed = { ...u.claimed, [id]: (u.claimed[id] ?? 0) + 1 }
  writeUserRewards(next)
  return { ok: true, thb }
}

/**
 * Today's check-in. Before the first bump the baht is banked (shown as waiting) and paid with the first claim after
 * a real bump; after it, the day pays at once.
 */
export function checkIn(facts: Facts, now = Date.now()): { ok: boolean; thb: number; banked: boolean } {
  const u = readUserRewards(undefined, now)
  const v = checkinView(u, now)
  if (!v.canTick) return { ok: false, thb: 0, banked: false }
  const dayIdx = v.ticked
  const thb = CHECKIN_DAYS[dayIdx] ?? 2
  const days = dayIdx + 1
  const next: UserRewards = { ...u, ciDays: days, ciLast: bkkDate(now), ciStreaks: u.ciStreaks + (days === 7 ? 1 : 0) }
  if (facts.bumps > 0) {
    const pay = thb + u.ciBankThb
    if (!creditPromo(pay, 'Reward · daily check-in · promo')) return { ok: false, thb: 0, banked: false }
    next.ciBankThb = 0
    next.earnedThb = u.earnedThb + pay
    writeUserRewards(next)
    return { ok: true, thb: pay, banked: false }
  }
  next.ciBankThb = u.ciBankThb + thb
  writeUserRewards(next)
  return { ok: true, thb, banked: true }
}

/** Pay banked check-in baht once the first bump has happened. */
export function claimBanked(facts: Facts, now = Date.now()): ClaimResult {
  const u = readUserRewards(undefined, now)
  if (u.ciBankThb <= 0) return { ok: false, reason: 'nothing' }
  if (facts.bumps <= 0) return { ok: false, reason: 'locked' }
  if (!creditPromo(u.ciBankThb, 'Reward · daily check-in · promo')) return { ok: false, reason: 'rejected' }
  writeUserRewards({ ...u, earnedThb: u.earnedThb + u.ciBankThb, ciBankThb: 0 })
  return { ok: true, thb: u.ciBankThb }
}

/** What is still open this month (the honest "from month two" number). */
export function openMaxThb(u: UserRewards): number {
  const tasks = TRAVELLER_TASKS.reduce((a, t) => {
    const used = t.once ? (u.once[t.id] ? t.cap : 0) : u.claimed[t.id] ?? 0
    return a + t.amtThb * Math.max(0, t.cap - used)
  }, 0)
  return tasks + CHECKIN_STREAK_THB * Math.max(0, CHECKIN_STREAKS_PER_MONTH - u.ciStreaks) + u.earnedThb
}

/* ---------------------------------------------------------------------------------------------- */
/* hooks                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

let version = 0
function subscribeRewards(fn: () => void): () => void {
  const on = () => {
    version++
    fn()
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === REWARDS_KEY || e.key === 'chon_safety_v1') on()
  }
  window.addEventListener(REWARDS_EVENT, fn)
  window.addEventListener(SAFETY_EVENT, on)
  window.addEventListener('storage', onStorage)
  const unPlans = subscribePlanStore(on)
  return () => {
    window.removeEventListener(REWARDS_EVENT, fn)
    window.removeEventListener(SAFETY_EVENT, on)
    window.removeEventListener('storage', onStorage)
    unPlans()
  }
}

/** Everything the sheet needs; re-renders on claims, pins, bookings and reviews. */
export function useRewards() {
  useSyncExternalStore(subscribeRewards, () => version, () => version)
  // the month / day can roll while the app stays open
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  const facts = factsFrom(getPlanStore())
  const u = readUserRewards(undefined, now)
  const tasks = taskViews(facts, u)
  const ci = checkinView(u, now)
  return { facts, u, tasks, ci, now }
}

/** Header gift dot: something is ready to claim (or today's check-in is waiting). */
export function useRewardsReady(): boolean {
  const { tasks, ci, facts } = useRewards()
  return tasks.some((t) => t.state === 'claim') || ci.canTick || (facts.bumps > 0 && ci.bankThb > 0)
}

export function openRewards() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_REWARDS_EVENT))
}
