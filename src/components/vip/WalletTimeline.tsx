import { useEffect, useMemo, useState } from 'react'
import { effectiveHoldStatus, partnerKey, usePlanStore } from '../../lib/planStore'
import { guestMoneyRows, localMoneyRows, whenLabel } from '../wallet/bookingMoney'
import { tripSavedEntries, TRIP_SAVED_EVENT } from '../../lib/tripSavings'
import { useStarterPack, STARTER_PACK_WORTH_THB } from '../wallet/StarterPack'
import { bkkParts, clockFor, hostShareThb, thb, timeAgo, useTr, useWalletActivity, type Tr, type WalletActivity } from './walletKit'
import '../../styles/wallet.css'

/**
 * NEXT95 · G3 · ROUND5 · KRING FIX2 — the Wallet timeline: the money story in real time order.
 * Traveller: one row per booking (offer → held → released / back) · top-ups · Kring Price bookings · demo credits ·
 *            Starter Pack.
 * Local:     her bookings (held → released, her share) · cash-outs.
 * Gifts (thank-yous sent or received in chat) are their OWN group under the money rows — baht only, never folded
 * into a booking. There are no paid time extensions (founder, fix round 2): a time change is a free "Suggest a change"
 * on the offer card.
 * Grouped by the Bangkok calendar day: "Today", "Yesterday", "Earlier". Nothing is seeded.
 * Sources: walletKit activity (localStorage, 18 h), planStore (the same records the Plans card reads), tripSavings —
 * so the story survives closing the app. Display only: nothing here touches the ledger or a hold.
 */

type Tone = 'gold' | 'green' | 'violet' | 'cyan' | 'neutral'
interface Item {
  id: string
  at: number
  tone: Tone
  title: string
  sub: string
  amount?: string
  amountTone?: 'plus' | 'minus' | 'dim' | 'gold'
  pending?: boolean
  testId?: string
  /** KRING FIX2: a gift / thank-you — its own group, never mixed into booking money */
  gift?: boolean
}

interface LooseGift {
  id?: string
  name?: string
  nameTh?: string
  emoji?: string
  thb?: number
  at?: number
}

const WINDOW_MS = 18 * 60 * 60 * 1000
/** a cash-out still "sending" after this long was confirmed while the app was closed */
const PAYOUT_SETTLE_MS = 60 * 1000

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** The Bangkok calendar day a moment belongs to, and its group. */
function dayKey(at: number): string {
  const d = bkkParts(at)
  return `${d.y}-${d.m}-${d.d}`
}
type Group = 'today' | 'yesterday' | 'earlier'
export function groupFor(at: number, now: number): Group {
  const k = dayKey(at)
  if (k === dayKey(now)) return 'today'
  if (k === dayKey(now - 24 * 3600_000)) return 'yesterday'
  return 'earlier'
}
function groupLabel(g: Group, tr: Tr): string {
  return g === 'today' ? tr('Today', 'วันนี้') : g === 'yesterday' ? tr('Yesterday', 'เมื่อวาน') : tr('Earlier this trip', 'ก่อนหน้านี้')
}

const SAVED_LABEL: Record<string, [string, string]> = {
  esim: ['eSIM 15 GB', 'eSIM 15 GB'],
  'ride:airport': ['Airport cab · fixed', 'แท็กซี่สนามบิน · ราคาตายตัว'],
  'arrival:bag': ['Bag drop', 'ฝากกระเป๋า'],
  'arrival:hotel': ['Hotel · Kring Price', 'โรงแรม · ราคากริ๊ง'],
  'arrival:spa': ['Thai massage 60 min', 'นวดไทย 60 นาที'],
  'arrival:pharm': ['Travel pharmacy kit', 'ชุดยาเดินทาง'],
  'arrival:flower': ['Flowers for your Local', 'ดอกไม้ให้โลคอล'],
  'date:table': ['Restaurant table', 'โต๊ะร้านอาหาร'],
  'date:flower': ['Flowers', 'ดอกไม้'],
  'date:late': ['Late cab home', 'รถกลับที่พัก'],
}
function savedLabel(key: string, th: boolean): string {
  const hit = SAVED_LABEL[key]
  if (hit) return th ? hit[1] : hit[0]
  if (key.startsWith('ride:')) return th ? 'ค่ารถ · ราคากริ๊ง' : 'Ride · Kring Price'
  const tail = key.split(':').pop() ?? key
  return cap(tail)
}

const ACTIVITY_TH: Record<string, string> = {
  'Top up · PromptPay': 'เติมเงิน · พร้อมเพย์',
  'Demo credit': 'เครดิตเดโม',
  'Came back to you': 'เงินคืนเข้ากระเป๋า',
  'Added to your wallet': 'เข้ากระเป๋าแล้ว',
  'Gift sent': 'ส่งของขวัญขอบคุณ',
  Ride: 'ค่ารถ',
  Booking: 'ยอดจอง',
  'Spent in Kring': 'ใช้ในกริ๊ง',
}

function useTripEntries(isDemo: boolean) {
  const [n, setN] = useState(0)
  useEffect(() => {
    const on = () => setN((v) => v + 1)
    window.addEventListener(TRIP_SAVED_EVENT, on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener(TRIP_SAVED_EVENT, on)
      window.removeEventListener('storage', on)
    }
  }, [])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (typeof window === 'undefined' ? [] : tripSavedEntries(isDemo)), [isDemo, n])
}

/** re-render once a minute so "12 min ago", lapsed asks and the Tonight / Today split stay true */
function useMinuteTick() {
  const [, set] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => set((v) => v + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])
}

export default function WalletTimeline({ mode, isDemoMode, coinsPerThb }: { mode: 'traveller' | 'host'; isDemoMode: boolean; coinsPerThb: number }) {
  const tr = useTr()
  const th = tr('en', 'th') === 'th'
  const activity = useWalletActivity()
  const store = usePlanStore()
  const trip = useTripEntries(isDemoMode)
  const pack = useStarterPack()
  const [all, setAll] = useState(false)
  useMinuteTick()
  const now = Date.now()
  const minute = Math.floor(now / 60_000)

  const { items, gifts: giftItems, heldForHerThb } = useMemo(() => {
    const out: Item[] = []
    let earned = 0
    const guestHolds = store.guest ?? {}
    const hostPlans = store.host ?? {}

    if (mode === 'traveller') {
      const holds = Object.values(guestHolds).filter((h) => !h.bookingId)
      const usedActivity = new Set<string>()
      const sameAmount = (a: WalletActivity, thbAmount: number) => Math.round(thbAmount * coinsPerThb) === Math.abs(a.deltaCoins)
      // KRING FIX1 · one money truth: ONE row per booking (offer → held → released / back), whatever hold calls it took
      // (the sheet's hold, the agreed-price top-up of the hold, a difference refunded on accept). Their wallet deltas
      // are folded into the booking so a ฿1,200 booking never shows as −฿200, −฿1,000 and −฿1,200.
      const coveredWho = new Set<string>()
      for (const r of guestMoneyRows(store, now)) {
        coveredWho.add(partnerKey(r.who))
        for (const a of activity) {
          if (usedActivity.has(a.id)) continue
          // planStore names the booking / offer in its money notes; older rows fall back to the time window
          if (a.ref) {
            const inWindow = a.at >= r.window[0] - 60_000 && a.at <= r.window[1]
            if (r.refs.includes(a.ref) || (inWindow && (r.sheetRefs ?? []).includes(a.ref))) usedActivity.add(a.id)
            continue
          }
          if (a.at < r.window[0] || a.at > r.window[1]) continue
          if ((a.deltaCoins < 0 && a.kind === 'clink') || (a.deltaCoins > 0 && a.kind === 'refund')) usedActivity.add(a.id)
        }
        const many = r.kind === 'multi' && r.who !== '1' && /^\d+$/.test(r.who)
        const who = many ? tr(`${r.who} locals`, `โลคอล ${r.who} คน`) : r.who
        const what = r.title ? `${r.title} · ${who}` : tr(`Booking with ${who}`, `ยอดจองกับ ${who}`)
        const when = whenLabel(r.date, r.start, th)
        out.push({
          id: `bk-${r.id}`,
          at: r.heldAt,
          tone: 'gold',
          title: r.kind === 'booking' ? what : many ? tr(`Request to ${who}`, `ขอจอง${who}`) : tr(`Offer to ${who}`, `เสนอราคากับ ${who}`),
          sub:
            r.state === 'held'
              ? [when, tr('held until you meet · back if you don’t', 'พักไว้จนเจอกัน · ไม่ได้เจอ คืนเต็ม')].filter(Boolean).join(' · ')
              : r.state === 'released'
                ? [when, tr('met · released after กริ๊ง!', 'เจอกันแล้ว · โอนหลังกริ๊ง!')].filter(Boolean).join(' · ')
                : r.state === 'offered'
                  ? many
                    ? tr('one hold · the first to accept gets it', 'พักเงินครั้งเดียว · โลคอลคนแรกที่ตอบรับจะได้ทริปนี้')
                    : tr('held while they answer · back if they don’t', 'พักไว้ระหว่างรอตอบ · ไม่ตอบ คืนเต็ม')
                  : tr('not booked · every baht came back', 'ไม่ได้จอง · คืนทุกบาท'),
          amount: `−${thb(r.thb)}`,
          amountTone: r.state === 'refunded' ? 'dim' : 'minus',
          testId: 'wallet-timeline-hold',
        })
        if (r.state === 'released' && r.doneAt) {
          out.push({
            id: `bk-rel-${r.id}`,
            at: r.doneAt,
            tone: 'green',
            title: tr(`Released ${thb(r.thb)} to ${r.who}`, `โอน ${thb(r.thb)} ให้ ${r.who} แล้ว`),
            sub: r.venue ? tr(`กริ๊ง! at ${r.venue}`, `กริ๊ง! ที่ ${r.venue}`) : tr('กริ๊ง! at the venue', 'กริ๊ง! ที่จุดนัด'),
            amount: tr('released', 'โอนแล้ว'),
            amountTone: 'gold',
            testId: 'wallet-timeline-released',
          })
        }
        if (r.state === 'refunded' && (r.backThb ?? 0) > 0) {
          out.push({
            id: `bk-back-${r.id}`,
            at: r.doneAt ?? r.heldAt,
            tone: 'green',
            title: many ? tr('Back from your request', 'เงินคืนจากคำขอจอง') : tr(`Back from ${r.who}`, `เงินคืนจาก ${r.who}`),
            sub: tr('every baht back', 'คืนทุกบาท'),
            amount: `+${thb(r.backThb ?? 0)}`,
            amountTone: 'plus',
          })
        }
      }
      for (const h of holds) {
        // the offer / booking row above already tells this hold's story
        if (coveredWho.has(partnerKey(h.hostName || h.hostId)) && h.status !== 'held') continue
        const status = effectiveHoldStatus(h, now)
        const expired = status === 'expired' && h.status === 'held'
        const live = status === 'held' || status === 'accepted'
        // the hold itself, always (Wei B8: "Held −฿300 · comes back if you don't meet")
        out.push({
          id: `hold-${h.hostId}-${h.heldAt}`,
          at: h.heldAt,
          tone: 'gold',
          title: tr(`Booking with ${h.hostName}`, `ยอดจองกับ ${h.hostName}`),
          sub:
            status === 'accepted'
              ? tr('confirmed · held until you meet · comes back if you don’t meet', 'ยืนยันแล้ว · พักไว้จนเจอกัน · ไม่ได้เจอ คืนเต็ม')
              : live && Object.values(store.offers ?? {}).some((o) => o.holdKey === h.hostId && o.status === 'open')
                ? tr(`offer sent · held until you meet · comes back if you don’t meet`, 'ส่งข้อเสนอแล้ว · พักไว้จนเจอกัน · ไม่ได้เจอ คืนเต็ม')
              : live
                ? tr('held until you meet · comes back if you don’t meet', 'พักไว้จนเจอกัน · ไม่ได้เจอ คืนเต็ม')
                : tr('came back to you', 'คืนเข้ากระเป๋าแล้ว'),
          amount: `−${thb(h.offerThb)}`,
          amountTone: live ? 'minus' : 'dim',
          testId: 'wallet-timeline-hold',
        })
        const debit = activity.find((a) => a.deltaCoins < 0 && !usedActivity.has(a.id) && Math.abs(a.at - h.heldAt) < 20_000 && sameAmount(a, h.offerThb))
        if (debit) usedActivity.add(debit.id)
        if (!live) {
          const refundedAt = (h as { refundedAt?: number }).refundedAt
          const backAt = refundedAt ?? (expired ? h.replyBy : h.updatedAt)
          out.push({
            id: `back-${h.hostId}-${h.heldAt}`,
            at: backAt,
            tone: 'green',
            title: tr(`Back from ${h.hostName}`, `เงินคืนจาก ${h.hostName}`),
            sub: status === 'cancelled' ? tr('plan cancelled · every baht back', 'ยกเลิกแผน · คืนทุกบาท') : tr('no reply in time · every baht back', 'ไม่ตอบทันเวลา · คืนทุกบาท'),
            amount: `+${thb(h.offerThb)}`,
            amountTone: 'plus',
          })
          const credit = activity.find((a) => a.deltaCoins > 0 && !usedActivity.has(a.id) && a.at >= h.heldAt && (a.kind === 'refund' || a.kind === 'reward') && sameAmount(a, h.offerThb))
          if (credit) usedActivity.add(credit.id)
        }
      }
      for (const s of trip) {
        // a completed Kring booking already has its booking + Released rows above
        if (s.key.startsWith('kring:')) continue
        out.push({
          id: `saved-${s.key}`,
          at: s.at,
          tone: 'violet',
          title: savedLabel(s.key, th),
          sub: s.savedThb > 0 ? tr(`booked · ${thb(s.savedThb)} under the tourist price`, `จองแล้ว · ถูกกว่าราคานักท่องเที่ยว ${thb(s.savedThb)}`) : tr('booked · Kring Price', 'จองแล้ว · ราคากริ๊ง'),
          amount: typeof s.paidThb === 'number' ? thb(s.paidThb) : undefined,
          amountTone: 'dim',
          testId: 'wallet-timeline-saved',
        })
      }
      if (pack.state === 'bought' && pack.boughtAt) {
        out.push({
          id: 'starter-pack',
          at: pack.boughtAt + 1,
          tone: 'gold',
          title: tr('Starter Pack', 'แพ็กเริ่มต้น'),
          sub: tr('eSIM 15 GB · cab rebate ฿100 · bag drop', 'eSIM 15 GB · คืนค่าแท็กซี่ ฿100 · ฝากกระเป๋า'),
          amount: tr(`Worth ${thb(STARTER_PACK_WORTH_THB)}`, `มูลค่า ${thb(STARTER_PACK_WORTH_THB)}`),
          amountTone: 'gold',
          testId: 'wallet-timeline-pack',
        })
      }
      for (const a of activity) {
        if (a.kind === 'payout' || usedActivity.has(a.id)) continue
        out.push(activityItem(a))
      }
    } else {
      // KRING FIX1 · her bookings: held until the bump, then Released (her share) the moment the phones go กริ๊ง!
      for (const r of localMoneyRows(store)) {
        const when = whenLabel(r.date, r.start, th)
        const what = r.title ? `${r.title} · ${r.guest}` : r.guest
        if (r.state === 'held') {
          earned += r.receiveThb
          out.push({
            id: `lbk-${r.id}`,
            at: r.at,
            tone: 'gold',
            title: what,
            sub: [when, tr('yours after กริ๊ง!', 'ได้หลังกริ๊ง!')].filter(Boolean).join(' · '),
            amount: `+${thb(r.receiveThb)}`,
            amountTone: 'dim',
            pending: true,
            testId: 'wallet-timeline-booking',
          })
        } else if (r.state === 'released') {
          out.push({
            id: `lbk-rel-${r.id}`,
            at: r.releasedAt ?? r.at,
            tone: 'green',
            title: tr(`Released · ${what}`, `โอนแล้ว · ${what}`),
            sub: r.venue ? tr(`กริ๊ง! at ${r.venue} · ready to withdraw`, `กริ๊ง! ที่ ${r.venue} · พร้อมถอน`) : tr('กริ๊ง! · ready to withdraw', 'กริ๊ง! · พร้อมถอน'),
            amount: `+${thb(r.receiveThb)}`,
            amountTone: 'plus',
            testId: 'wallet-timeline-released',
          })
        }
      }
      for (const p of Object.values(hostPlans)) {
        if (p.state !== 'confirmed') continue
        earned += Math.max(0, Math.round(p.receiveThb ?? 0))
        out.push({
          id: `plan-${p.id}`,
          at: p.updatedAt,
          tone: 'gold',
          title: `${p.guest}${p.flag ? ` ${p.flag}` : ''} · ${p.venue}`,
          sub: tr(`${p.time} · yours after กริ๊ง!`, `${p.time} น. · ได้หลังกริ๊ง!`),
          amount: `+${thb(p.receiveThb)}`,
          amountTone: 'dim',
          pending: true,
        })
      }
      // Ploy B4 · KRING FIX2: a thank-you gift from a guest stays in her wallet — in its own Gifts group, her share, baht
      const gifts = ((store as unknown as { gifts?: Record<string, LooseGift[]> }).gifts ?? {}) as Record<string, LooseGift[]>
      const giftKeys = new Set<string>()
      for (const [key, list] of Object.entries(gifts)) {
        const who = hostPlans[key]?.guest || cap(key)
        for (const g of Array.isArray(list) ? list : []) {
          if (typeof g?.at !== 'number') continue
          giftKeys.add(key)
          const name = th ? (g.nameTh || g.name || '').replace(/ไหว้$/, '').trim() : (g.name || '').replace(/^Wai /, '').trim()
          const thbIn = Math.max(0, Number(g.thb) || 0)
          out.push({
            id: g.id ?? `gift-${key}-${g.at}`,
            at: g.at,
            tone: 'gold',
            title: tr(`Thank-you gift from ${who}`, `ของขวัญขอบคุณจาก ${who}`),
            sub: [name, tr('in your chat', 'ดูในแชท')].filter(Boolean).join(' · '),
            ...(thbIn > 0 ? { amount: `+${thb(hostShareThb(thbIn))}`, amountTone: 'plus' as const } : {}),
            testId: 'wallet-timeline-gift',
            gift: true,
          })
        }
      }
      // older records only marked the moment as seen
      for (const [k, at] of Object.entries(store.seen ?? {})) {
        if (!k.startsWith('gift:') || typeof at !== 'number' || giftKeys.has(k.slice(5))) continue
        const key = k.slice(5)
        const who = hostPlans[key]?.guest || cap(key)
        out.push({
          id: `gift-${key}-${at}`,
          at,
          tone: 'gold',
          title: tr(`Thank-you gift from ${who}`, `ของขวัญขอบคุณจาก ${who}`),
          sub: tr('in your chat', 'ดูในแชท'),
          testId: 'wallet-timeline-gift',
          gift: true,
        })
      }
      for (const a of activity) {
        if (a.kind !== 'payout') continue
        const sent = a.state === 'sent' || now - a.at > PAYOUT_SETTLE_MS
        out.push({
          id: a.id,
          at: a.at,
          tone: sent ? 'green' : 'cyan',
          title: sent ? tr('Sent to PromptPay', 'โอนเข้าพร้อมเพย์แล้ว') : tr('Sending to PromptPay', 'กำลังโอนเข้าพร้อมเพย์'),
          sub: tr(`${a.label} · no fee`, `${a.label} · ไม่มีค่าธรรมเนียม`),
          amount: `−${thb(a.thb ?? 0)}`,
          amountTone: 'minus',
          pending: !sent,
          testId: 'wallet-activity-payout',
        })
      }
    }
    const list = out.filter((i) => now - i.at < WINDOW_MS || i.id.startsWith('saved-')).sort((a, b) => b.at - a.at)
    return { items: list.filter((i) => !i.gift), gifts: list.filter((i) => i.gift), heldForHerThb: earned }

    function activityItem(a: WalletActivity): Item {
      const plus = a.deltaCoins > 0
      if (a.kind === 'gift') {
        // a thank-you sent in chat — baht, its own group, never a booking
        return {
          id: a.id,
          at: a.at,
          tone: 'gold',
          title: a.who ? tr(`Thank-you gift to ${a.who}`, `ของขวัญขอบคุณให้ ${a.who}`) : tr('Thank-you gift', 'ของขวัญขอบคุณ'),
          sub: tr('sent in chat', 'ส่งในแชท'),
          amount: `${plus ? '+' : '−'}${thb(Math.abs(a.deltaCoins) / coinsPerThb)}`,
          amountTone: plus ? 'plus' : 'minus',
          testId: 'wallet-timeline-gift',
          gift: true,
        }
      }
      const tone: Tone = a.kind === 'topup' || a.kind === 'refund' ? 'green' : a.kind === 'clink' ? 'gold' : a.kind === 'demo' ? 'violet' : 'neutral'
      const amount = `${plus ? '+' : '−'}${thb(Math.abs(a.deltaCoins) / coinsPerThb)}`
      if (a.kind === 'release') {
        // a booking she hosted was released to her (demo credit path) — her earnings, landed in this wallet
        return {
          id: a.id,
          at: a.at,
          tone: 'green',
          title: a.who ? tr(`Released to you · ${a.who}`, `โอนเข้าคุณแล้ว · ${a.who}`) : tr('Released to you', 'โอนเข้าคุณแล้ว'),
          sub: tr('you receive · after กริ๊ง!', 'ยอดที่คุณได้รับ · หลังกริ๊ง!'),
          amount,
          amountTone: 'plus',
          testId: 'wallet-timeline-released',
        }
      }
      if (a.kind === 'clink' && !plus) {
        return {
          id: a.id,
          at: a.at,
          tone,
          title: a.who ? tr(`Booking with ${a.who}`, `ยอดจองกับ ${a.who}`) : tr('Booking', 'ยอดจอง'),
          sub: tr('held until you meet · comes back if you don’t meet', 'พักไว้จนเจอกัน · ไม่ได้เจอ คืนเต็ม'),
          amount,
          amountTone: 'minus',
          testId: 'wallet-timeline-hold',
        }
      }
      return {
        id: a.id,
        at: a.at,
        tone,
        title:
          a.kind === 'refund' && a.who
            ? tr(`Back from ${a.who}`, `เงินคืนจาก ${a.who}`)
            : th
              ? ACTIVITY_TH[a.label] ?? a.label
              : a.label,
        sub: a.kind === 'demo' ? tr('demo money · not a real payment', 'เงินทดลอง · ไม่ใช่การจ่ายจริง') : timeAgo(a.at, th),
        amount,
        amountTone: plus ? 'plus' : 'minus',
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, store, trip, pack.state, pack.boughtAt, mode, th, coinsPerThb, minute])

  const shown = all ? items : items.slice(0, 5)
  const shownGifts = all ? giftItems : giftItems.slice(0, 3)
  const more = items.length - shown.length + (giftItems.length - shownGifts.length)
  const groups: Array<{ g: Group; list: Item[] }> = []
  for (const i of shown) {
    const g = groupFor(i.at, now)
    const last = groups[groups.length - 1]
    if (last && last.g === g) last.list.push(i)
    else groups.push({ g, list: [i] })
  }
  const headGroup: Group = groups[0]?.g ?? groupFor(now, now)

  const row = (i: Item) => (
    <li key={i.id} className={`wl-tl-item${i.pending ? ' is-pending' : ''}`} data-testid={i.testId}>
      <span className={`wl-tl-node is-${i.tone}`} aria-hidden="true" />
      <span className="wl-tl-t">
        <b>{i.title}</b>
        <small>
          {!th && i.sub.includes('กริ๊ง!') ? (
            <>
              <span aria-hidden="true">{i.sub.replace(/กริ๊ง!/g, 'Kring!')}</span>
              <span className="sr-only">{i.sub}</span>
            </>
          ) : (
            i.sub
          )}
        </small>
      </span>
      <span className="wl-tl-r">
        {i.amount ? <b className={`is-${i.amountTone ?? 'dim'}`}>{i.amount}</b> : null}
        <time dateTime={new Date(i.at).toISOString()}>{clockFor(new Date(i.at), th)}</time>
      </span>
    </li>
  )

  return (
    <section className="wl-tl" aria-label={groupLabel(headGroup, tr)} data-testid="wallet-timeline" data-group={headGroup}>
      <header className="wl-tl-h">
        <span className="wl-grp">{groupLabel(headGroup, tr)}</span>
        {mode === 'host' && heldForHerThb > 0 ? (
          <span className="wl-tl-sum" data-testid="wallet-timeline-earned">
            {tr(`${thb(heldForHerThb)} after you meet`, `ได้ ${thb(heldForHerThb)} หลังกริ๊ง!`)}
          </span>
        ) : items.length > 0 ? (
          <span className="wl-tl-n">{items.length}</span>
        ) : null}
      </header>
      {items.length === 0 && giftItems.length === 0 ? (
        <div className="wl-tl-empty">
          <span className="wl-tl-node is-neutral" aria-hidden="true" />
          <span className="wl-row-t">
            {mode === 'host' ? (
              <>
                <b>{tr('Nothing yet', 'ยังไม่มีรายการ')}</b>
                <small>{tr('Bookings, thank-you gifts and withdrawals show here', 'การจอง ของขวัญขอบคุณ และการถอนเงิน จะขึ้นที่นี่')}</small>
              </>
            ) : (
              <>
                <b>{tr('Nothing yet', 'ยังไม่มีรายการ')}</b>
                <small>{tr('Bookings, top-ups and money back show here', 'การจอง เติมเงิน และเงินคืน จะขึ้นที่นี่')}</small>
              </>
            )}
          </span>
        </div>
      ) : (
        groups.map((grp, gi) => (
          <div key={`${grp.g}-${gi}`} className="wl-tl-grp" data-group={grp.g}>
            {gi > 0 ? <p className="wl-grp wl-tl-sub">{groupLabel(grp.g, tr)}</p> : null}
            <ol className="wl-tl-list">{grp.list.map(row)}</ol>
          </div>
        ))
      )}
      {shownGifts.length > 0 ? (
        // KRING FIX2 · gifts stay, as their own group: baht thank-yous, never inside a booking's money
        <div className="wl-tl-grp is-gifts" data-group="gifts" data-testid="wallet-timeline-gifts">
          <p className="wl-grp wl-tl-sub">{tr('Gifts · thank-yous', 'ของขวัญขอบคุณ')}</p>
          <ol className="wl-tl-list">{shownGifts.map(row)}</ol>
        </div>
      ) : null}
      {more > 0 || all ? (
        <button type="button" className="wl-link wl-tl-more" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? tr('Show less', 'ย่อ') : tr(`${more} earlier`, `ก่อนหน้านี้อีก ${more}`)}
        </button>
      ) : null}
    </section>
  )
}
