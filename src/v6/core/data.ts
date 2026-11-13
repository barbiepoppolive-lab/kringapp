/* Words, data and small helpers for Kring v6. Ported 1:1 from the approved prototype. */
import strings from '../i18n/strings.json'
import { S, update, type Lang, type Booking } from './store'
import { currentUser } from './auth'
import { KR6_PRODUCTS, getRequiredTicketTier, isLaunchTicketEligible, launchTicketComesBack, launchTicketUsed, passDaysLeft, resolveBookingTicketQuote } from './ticketsAndRails'

export interface PayMethod { id?: 'apple' | 'google' | 'card' | 'promptpay'; n: string; s: string }
export interface LangMeta {
  native: string; hello: string; locale: string; cc: string; phone: string; name: string; nameTh: string; g: string; langTh: string
  diet: string[]; pay: PayMethod[]; login: string[][]
}
export const L = strings.langs as unknown as Record<Lang, LangMeta>
export const T = strings.t as unknown as Record<Lang, Record<string, string>>
export const LANGS: Lang[] = ['en', 'zh', 'ko', 'hi', 'ru', 'ms', 'th']

export function t(k: string, v: Record<string, string | number> = {}): string {
  let s = T[S.lang]?.[k] ?? T.en[k] ?? k
  s = s.replace(/\{(\w+)\}/g, (_, x: string) => String(v[x] ?? ''))
  if (k === 'm1' || k === 'm1g' || k === 'confirmedAt') s = s.replace(/18:00/g, bTime())
  return s
}
export const me = (): LangMeta => L[S.lang]

/** First Thai consonant for Thai names, first letter otherwise (avatars). */
export const ini = (s: string): string => {
  const m = s.match(/[ก-ฮ]/)
  return /^[฀-๿]/.test(s) && m ? m[0] : Array.from(s)[0] || ''
}

export interface Act {
  id: string; cat: string; th: string; titleEn?: string; img: string; host: string; hostTh: string; f: 0 | 1; price: number; street: number; h: number
  rating: number; rev: number; place: string; placeTh: string; langs: string[]; veg?: 1; halal?: 1; jain?: 1; partner?: number
  isVolunteer?: boolean; bringFriendFirst3?: boolean
  /** most people one booking can bring (default 2); 'group' = the host price is for the whole booking, 'person' = per person */
  maxPpl?: number; priceFor?: 'group' | 'person'
  isLive?: boolean; isLiveActivity?: boolean; liveArea?: string; liveAreaTh?: string; liveStartTime?: string; liveSpotsLeft?: number; storyPlaceKind?: 'cafe' | 'market' | 'park'
  /** host's unspent leaderboard reward in baht (paid through the ticket-to-host swap at her next booking) */
  hostRewardThb?: number
  /** real start_times from public.kr6_activities when loaded from the database */
  slots?: string[]
  meetLat?: number; meetLng?: number; hostPhotoUrl?: string
}
export const DEMO_ACTS: Act[] = [
  { id: 'eat', cat: 'eat', th: 'เดินกินเยาวราช', img: 'yaowarat-food', host: 'Nicha', hostTh: 'ณิชา', f: 1, price: 1000, street: 1600, h: 3, rating: 4.9, rev: 128, place: 'MRT Wat Mangkon|exit|1', placeTh: 'MRT วัดมังกร ทางออก 1', langs: ['TH', 'EN'], veg: 1, bringFriendFirst3: true, isLiveActivity: true, liveArea: 'Yaowarat', liveStartTime: '18:00', liveSpotsLeft: 2, storyPlaceKind: 'market' },
  { id: 'muay', cat: 'muay', th: 'มวยไทยมือใหม่', img: 'muay-thai', host: 'Beam', hostTh: 'บีม', f: 0, price: 900, street: 1500, h: 1.5, rating: 4.8, rev: 57, place: 'Lumpini Park|gate|1', placeTh: 'สวนลุมพินี ประตู 1', langs: ['TH', 'EN', 'RU'], isLiveActivity: false, liveArea: 'Lumpini', liveStartTime: '17:00', liveSpotsLeft: 2, storyPlaceKind: 'park' },
  { id: 'market', cat: 'market', th: 'ตลาดดอกไม้ปากคลอง', img: 'flower-market', host: 'Mint', hostTh: 'มิ้นท์', f: 1, price: 600, street: 900, h: 2, rating: 4.8, rev: 64, place: 'MRT Sanam Chai|exit|1', placeTh: 'MRT สนามไชย ทางออก 1', langs: ['TH', 'EN'], veg: 1, bringFriendFirst3: true, isLiveActivity: true, liveArea: 'Pak Khlong', liveStartTime: '16:30', liveSpotsLeft: 2, storyPlaceKind: 'market' },
  { id: 'river', cat: 'river', th: 'บางกระเจ้า ล่องเรือปั่นจักรยาน', img: 'cycling-park', host: 'Golf', hostTh: 'กอล์ฟ', f: 0, price: 1100, street: 1700, h: 3, rating: 4.7, rev: 73, place: 'Khlong Toei|pier', placeTh: 'ท่าเรือคลองเตย', partner: 220, langs: ['TH', 'EN'], isLiveActivity: false, liveArea: 'Bang Krachao', liveStartTime: '15:00', liveSpotsLeft: 2, storyPlaceKind: 'park' },
  { id: 'temple', cat: 'river', th: 'เดินถ่ายรูปพระอาทิตย์ตกริมน้ำ ท่าเตียน', img: 'wat-arun-temple', host: 'Nok', hostTh: 'นก', f: 1, price: 700, street: 1100, h: 2, rating: 4.9, rev: 91, place: 'Tha Tien|pier', placeTh: 'ท่าเรือท่าเตียน', langs: ['TH', 'EN'], bringFriendFirst3: true, isLiveActivity: true, liveArea: 'Tha Tien', liveStartTime: '17:00', liveSpotsLeft: 2, storyPlaceKind: 'park' },
  { id: 'oldtown', cat: 'eat', th: 'เดินเล่นตลาดน้อย', img: 'talat-noi-oldtown', host: 'Ken', hostTh: 'เคน', f: 0, price: 0, street: 800, h: 2, rating: 4.8, rev: 49, place: 'Marine Dept.|pier', placeTh: 'ท่าเรือกรมเจ้าท่า', langs: ['TH', 'EN', 'HI'], isVolunteer: true, isLiveActivity: true, liveArea: 'Talad Noi', liveStartTime: '16:00', liveSpotsLeft: 2, storyPlaceKind: 'cafe' },
  { id: 'night', cat: 'eat', th: 'ชิมตลาดกลางคืน', img: 'night-market', host: 'Kwan', hostTh: 'ขวัญ', f: 1, price: 700, street: 1100, h: 2, rating: 4.8, rev: 86, place: 'MRT Huai Khwang|exit|2', placeTh: 'MRT ห้วยขวาง ทางออก 2', langs: ['TH', 'EN', 'ZH'], veg: 1, isLiveActivity: false, liveArea: 'Huai Khwang', liveStartTime: '19:00', liveSpotsLeft: 2, storyPlaceKind: 'market' },
  { id: 'cafe', cat: 'eat', th: 'คาเฟ่และขนมไทย', img: 'cafe-desserts', host: 'Bank', hostTh: 'แบงก์', f: 0, price: 500, street: 800, h: 2, rating: 4.9, rev: 38, place: 'BTS Ari|exit|3', placeTh: 'BTS อารีย์ ทางออก 3', langs: ['TH', 'EN'], halal: 1, veg: 1, jain: 1, isLiveActivity: true, liveArea: 'Ari', liveStartTime: '16:00', liveSpotsLeft: 2, storyPlaceKind: 'cafe' },
  { id: 'cook', cat: 'cook', th: 'คลาสแกงเขียวหวาน', img: 'cooking-class', host: 'Fon', hostTh: 'ฝน', f: 1, price: 1400, street: 1800, h: 3, rating: 5.0, rev: 42, place: 'Silom|kitchen', placeTh: 'ครัวพาร์ทเนอร์ สีลม', partner: 240, langs: ['TH', 'EN', 'KO'], halal: 1, veg: 1, jain: 1, bringFriendFirst3: true, isLiveActivity: false, liveArea: 'Silom', liveStartTime: '16:00', liveSpotsLeft: 2, storyPlaceKind: 'cafe' },
]
/** True in production builds (never in Vitest / dev). In production builds, demo ACTS are never shown. */
export const isProdBuild = (): boolean => Boolean(import.meta.env?.PROD && !import.meta.env?.VITEST)
export const getInitialActivities = (prod = isProdBuild()): Act[] => (prod ? [] : [...DEMO_ACTS])
export const ACTS: Act[] = getInitialActivities()
export const SLOTS: Record<string, string[]> = { eat: ['17:00', '18:30', '19:30'], muay: ['07:00', '16:00', '18:00'], market: ['05:30', '06:30', '08:00'], river: ['07:30', '09:00', '14:00'], temple: ['15:30', '16:30', '17:00'], oldtown: ['09:00', '15:00', '16:00'], night: ['18:00', '19:00', '20:00'], cafe: ['10:00', '13:00', '15:00'], cook: ['09:30', '13:00', '16:00'] }
export const SL = (a: Act): string[] => (a?.slots && a.slots.length ? a.slots : SLOTS[a?.id] || ['17:00', '18:00', '19:00'])
export const act = (): Act => ACTS.find((a) => a.id === S.act) || ACTS[0] || DEMO_ACTS[0]
export function bTime(): string { const a = act(); const slots = SL(a); return S.time && S.timeAct === S.act ? S.time : (slots[1] || slots[0] || '18:00') }
/** Most people per booking for this activity (default 2). */
export const maxPpl = (a: Act): number => Math.max(1, a.maxPpl || 2)
/** Host price for this booking: per-person prices multiply by the party size, group prices do not. */
export const hostTotal = (a: Act, guests: number): number => (a.isVolunteer || a.price === 0 ? 0 : a.priceFor === 'person' ? a.price * Math.max(1, guests) : a.price)
/** "18:30" + 3 h -> "21:30" (wraps past midnight). */
export function endT(start: string, h: number): string {
  const [hh, mm] = start.split(':').map(Number)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return start
  const m = (hh * 60 + mm + Math.round(h * 60)) % 1440
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
}
/** "18:30–21:30" for an activity starting at `start`. */
export const tRange = (a: Act, start: string): string => start + '–' + endT(start, a.h)
/** "1 person" / "2 people" in the viewer's language. */
export const pplN = (n: number): string => t(n === 1 ? 'ppl1' : 'pplN', { n })
/** A Date for day `d` at "HH:MM". */
export function atTime(d: Date, hhmm: string): Date { const x = new Date(d); const [hh, mm] = hhmm.split(':').map(Number); x.setHours(hh || 0, mm || 0, 0, 0); return x }
export const sameDay = (a: Date, b: Date): boolean => { const x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate() }

const FX: Partial<Record<Lang, [string, number]>> = { zh: ['¥', 0.21], ko: ['₩', 41], hi: ['₹', 2.55], ru: ['₽', 2.4], ms: ['RM', 0.13], en: ['US$', 0.029] }
/** Display-only conversion by home country (฿ stays the real price). TH: no hint. */
const FXC: Record<string, [string, number] | null> = {
  TH: null, IN: ['₹', 2.55], CN: ['¥', 0.21], HK: ['HK$', 0.23], TW: ['NT$', 0.95], KR: ['₩', 41], JP: ['JP¥', 4.4], RU: ['₽', 2.4], MY: ['RM', 0.13], SG: ['S$', 0.039],
  US: ['US$', 0.029], CA: ['C$', 0.04], AU: ['A$', 0.045], NZ: ['NZ$', 0.05], GB: ['£', 0.023], DE: ['€', 0.027], FR: ['€', 0.027], NL: ['€', 0.027], IT: ['€', 0.027], ES: ['€', 0.027],
  IE: ['€', 0.027], AT: ['€', 0.027], BE: ['€', 0.027], CH: ['CHF', 0.025], AE: ['AED', 0.107], SA: ['SAR', 0.109], ID: ['Rp', 470], PH: ['₱', 1.65], VN: ['₫', 740],
}
/** Currencies a guest can pick on Book & pay ("Show prices also in"), as [country, symbol]. TH = baht only. */
export const CUR_CHOICES: [string, string][] = [['US', 'US$'], ['AU', 'A$'], ['GB', '£'], ['DE', '€'], ['IN', '₹'], ['CN', '¥'], ['TW', 'NT$'], ['HK', 'HK$'], ['KR', '₩'], ['JP', 'JP¥'], ['MY', 'RM'], ['SG', 'S$'], ['AE', 'AED'], ['RU', '₽'], ['ID', 'Rp'], ['CA', 'C$']]
/** The "≈" currency in use: the one the guest picked, else the home country's, else '' (falls back to the language). */
export const curCountry = (): string => (S.prof.cur || homeCountry() || '').toUpperCase()
/** Symbol of the "≈" hint currency now in use ('' = baht only). */
export const curSymbol = (): string => { const c = curCountry(); const f = c ? FXC[c] : FX[S.lang]; return f ? f[0] : '' }
/** Phone country codes (longest first) -> country, for when the profile has no home country yet. */
const DIAL: [string, string][] = [['852', 'HK'], ['886', 'TW'], ['91', 'IN'], ['86', 'CN'], ['82', 'KR'], ['81', 'JP'], ['66', 'TH'], ['65', 'SG'], ['61', 'AU'], ['60', 'MY'], ['64', 'NZ'], ['44', 'GB'], ['49', 'DE'], ['33', 'FR'], ['31', 'NL'], ['39', 'IT'], ['34', 'ES'], ['7', 'RU'], ['1', 'US']]
/** The person's home country: their profile, else their sign-in phone's country code, else '' (unknown). */
export function homeCountry(): string {
  const c = (S.prof.country || '').toUpperCase()
  if (c) return c
  let ph = ''
  try { ph = currentUser()?.phone || '' } catch { /* not signed in */ }
  const d = ph.replace(/\D/g, '')
  const byPhone = d && !ph.trim().startsWith('0') ? DIAL.find(([p]) => d.startsWith(p))?.[1] || '' : ''
  if (byPhone) return byPhone
  // last resort: the phone's own region (en-GB → GB, en-AU → AU, fr-FR → FR), never assumed from the language alone
  try {
    for (const l of (typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [])) {
      const r = (l.split('-')[1] || '').toUpperCase()
      if (r.length === 2 && FXC[r]) return r
    }
  } catch { /* no navigator */ }
  return ''
}
/** Small "≈" hint in the viewer's own currency: from the home country when known, else from the language. */
export const fx = (n: number): string => {
  const hc = curCountry()
  const f = hc ? FXC[hc] : FX[S.lang]
  if (!f) return ''
  const v = n * f[1]
  return f[0] + (v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(v < 10 ? 2 : 0))
}
/** Payment methods for the Kring ticket (founder decision 30 Oct): Apple Pay, Google Pay, card and PromptPay QR, in the
    order that suits the language. Alipay+ / WeChat Pay come later, only once a payment gateway approves them. */
export function payList(): PayMethod[] {
  return me().pay.slice(0, 4)
}
/** PromptPay QR: the guest scans a QR with a Thai bank app (a step of its own on Book & pay, never skipped). */
export const isPromptPay = (p?: PayMethod): boolean => !!p && (p.id === 'promptpay' || /promptpay|พร้อมเพย์/i.test(p.n))
/** A static legal page (terms, privacy, refund, safety…) in the app's language: Thai for Thai, English for every other language. */
export const legalUrl = (page: string): string => `/${page}.html?lang=${S.lang === 'th' ? 'th' : 'en'}`
/** Face ID belongs to Apple Pay only. */
export const isApplePay = (p?: PayMethod): boolean => !!p && (p.id === 'apple' || /apple pay/i.test(p.n))

/** The guest's 7-Day Pass: active, days left and the end date. Use this anywhere the pass is shown. */
export function myPass(): { active: boolean; daysLeft: number; until: Date | null } {
  const n = passDaysLeft(S.prof.passUntil)
  return { active: n > 0, daysLeft: n, until: n > 0 && S.prof.passUntil ? new Date(S.prof.passUntil) : null }
}
/** Zone-1 launch: one free ticket per account for a Zone-1 activity (same rule as Book & pay). Tickets paid in other zones or a
 *  7-Day Pass do not spend it; while a pass is active the pass covers the booking instead. */
export const launchFreeFor = (a: Act): boolean =>
  !(a.isVolunteer || a.price === 0) && !myPass().active && !launchUsedNow() && isLaunchTicketEligible({ area: a.liveArea || a.place, usedLaunchTicket: false })
/** The guest's free launch ticket is spent (a booking used it and it was not given back). */
export const launchUsedNow = (): boolean => !!S.prof.usedLaunchTicket || launchTicketUsed(S.bookings)
/** Give the free launch ticket back when a launch booking is cancelled before the host confirmed (call inside update()). */
function giveLaunchBack(b: Booking): boolean {
  if (!launchTicketComesBack(b)) return false
  b.launch_back = true
  if (!launchTicketUsed(S.bookings)) S.prof.usedLaunchTicket = false
  return true
}
/** What Kring charges now for this activity before any choice on Book & pay (detail page, cards). */
export function ticketPreview(a: Act, guests = 1): { now: number; tierPrice: number; kind: 'ticket' | 'launch' | 'covered' | 'upgrade' } {
  const vol = !!a.isVolunteer || a.price === 0
  const pass = myPass().active
  const q = resolveBookingTicketQuote({ activityPriceThb: hostTotal(a, guests), isVolunteer: vol, hasActive7DayPass: pass, launchFree: launchFreeFor(a), hostRewardBalanceThb: a.hostRewardThb || 0 })
  const tierPrice = KR6_PRODUCTS[getRequiredTicketTier(vol ? 0 : hostTotal(a, guests))].priceThb
  const kind = q.launchTicketApplied ? 'launch' : pass ? (q.passUpgradeDiffThb > 0 ? 'upgrade' : 'covered') : 'ticket'
  return { now: q.kringChargeNowThb, tierPrice, kind }
}
/** Open activity bookings that overlap [start, start + h) on day `d` (any activity), ignoring cancelled and finished ones. */
export function overlaps(d: Date, start: string, h: number, except?: Booking): Booking[] {
  const s0 = atTime(d, start).getTime(), e0 = s0 + h * 36e5
  return S.bookings.filter((b) => {
    if (b === except || b.kind !== 'act' || b.status === 'cancelled' || b.done || !b.time) return false
    const ba = ACTS.find((x) => x.id === b.act)
    const s1 = atTime(new Date(b.date), b.time).getTime(), e1 = s1 + (ba ? ba.h : 2) * 36e5
    return s0 < e1 && s1 < e0
  })
}
/** Sort bookings by when they happen, soonest first. */
export const byStart = (a: Booking, b: Booking): number => atTime(new Date(a.date), a.time || '00:00').getTime() - atTime(new Date(b.date), b.time || '00:00').getTime()
export const ALIAS: Record<string, string> = { eat: 'chinatown 唐人街 차이나타운 yaowarat street food 美食', night: 'night market 夜市 야시장', temple: 'riverside sunset photo walk tha tien 河畔 日落 摄影 강변 노을 사진', market: 'flower market 花市 꽃시장 dawn', muay: 'muay thai boxing 泰拳 무에타이 fitness', river: 'bike cycling boat bang krachao 自行车 자전거', cook: 'cooking class curry 烹饪 쿠킹', cafe: 'cafe dessert 甜品 카페 디저트', oldtown: 'talat noi old town street art 老城' }
export const LN: Record<string, Record<Lang, string>> = { TH: { en: 'Thai', zh: '泰语', ko: '태국어', hi: 'थाई', ru: 'тайский', ms: 'Thai', th: 'ไทย' }, EN: { en: 'English', zh: '英语', ko: '영어', hi: 'अंग्रेज़ी', ru: 'английский', ms: 'Inggeris', th: 'อังกฤษ' }, ZH: { en: 'Chinese', zh: '中文', ko: '중국어', hi: 'चीनी', ru: 'китайский', ms: 'Cina', th: 'จีน' }, KO: { en: 'Korean', zh: '韩语', ko: '한국어', hi: 'कोरियाई', ru: 'корейский', ms: 'Korea', th: 'เกาหลี' }, HI: { en: 'Hindi', zh: '印地语', ko: '힌디어', hi: 'हिन्दी', ru: 'хинди', ms: 'Hindi', th: 'ฮินดี' }, RU: { en: 'Russian', zh: '俄语', ko: '러시아어', hi: 'रूसी', ru: 'русский', ms: 'Rusia', th: 'รัสเซีย' } }
export const MYCODE: Record<Lang, string> = { en: 'EN', zh: 'ZH', ko: 'KO', hi: 'HI', ru: 'RU', ms: 'EN', th: 'TH' }
export const langsOf = (a: Act, max = 9): string => { const l = a.langs.map((c) => LN[c][S.lang]); return l.length > max ? l.slice(0, max).join(' · ') + ' +' + (l.length - max) : l.join(' · ') }
type PF = (n: string, x?: string) => string
const PW: Record<string, Partial<Record<Lang, PF>>> = {
  exit: { en: (n, x) => `${n}, exit ${x}`, zh: (n, x) => `${n} ${x} 号出口`, ko: (n, x) => `${n} ${x}번 출구`, hi: (n, x) => `${n}, निकास ${x}`, ru: (n, x) => `${n}, выход ${x}`, ms: (n, x) => `${n}, pintu keluar ${x}` },
  gate: { en: (n, x) => `${n}, gate ${x}`, zh: (n, x) => `${n} ${x} 号门`, ko: (n, x) => `${n} ${x}번 게이트`, hi: (n, x) => `${n}, गेट ${x}`, ru: (n, x) => `${n}, вход ${x}`, ms: (n, x) => `${n}, pintu ${x}` },
  pier: { en: (n) => `${n} pier`, zh: (n) => `${n} 码头`, ko: (n) => `${n} 선착장`, hi: (n) => `${n} घाट`, ru: (n) => `пристань ${n}`, ms: (n) => `Jeti ${n}` },
  kitchen: { en: (n) => `${n} partner kitchen`, zh: (n) => `${n} 合作厨房`, ko: (n) => `${n} 제휴 키친`, hi: (n) => `${n} पार्टनर किचन`, ru: (n) => `${n}, партнёрская кухня`, ms: (n) => `Dapur rakan kongsi ${n}` },
}
export const plc = (a: Act): string => {
  if (!a) return ''
  if (S.lang === 'th') return a.placeTh
  if (!a.place.includes('|')) return a.place || a.placeTh
  const [n, ty, x] = a.place.split('|')
  return (PW[ty]?.[S.lang] || PW[ty]?.en)?.(n, x) || a.place || a.placeTh
}

export interface Tour { k: string; th: string; img: string; walk: number; price: number; h: number }
export interface Pack { k: string; th: string; img: string; walk: number; price: number; inc: string[] }
export interface Voucher { k: string; ic?: string; img?: string; walk: number; price: number; days: number; code: string }
export const TOURS: Tour[] = [{ k: 'tr2', th: 'วังและวัดโพธิ์ยามเช้า', img: 'wat-arun-temple', walk: 1800, price: 1450, h: 4 }, { k: 'tr1', th: 'ล่องเรือชมพระอาทิตย์ตกพัทยา', img: 'chao-phraya-sunset', walk: 1500, price: 1190, h: 2 }, { k: 'tr4', th: 'มวยไทยติดขอบเวที', img: 'muay-thai', walk: 2000, price: 1650, h: 3 }, { k: 'tr3', th: 'เที่ยวเกาะล้าน พัทยา', img: 'koh-larn-beach', walk: 1900, price: 1490, h: 8 }]
/* Packages hold only partner products (transfers, eSIM, licensed tours, partner meals): never a host activity, whose price is
   paid to the host at the place and can't be bundled or discounted by Kring. Packages show a saving only when it is real
   (see packCompare): walk is unused for packages. */
export const PACKS: Pack[] = [{ k: 'pk2', th: 'สุดสัปดาห์เกาะพัทยา', img: 'seafood-market', walk: 0, price: 4590, inc: ['inc_car', 'inc_ferry', 'tr3', 'inc_seafood'] }]
export const VOUCH: Voucher[] = [{ k: 'v1', ic: 'sim', walk: 499, price: 185, days: 8, code: 'KRING-ESIM-7Q4' }, { k: 'v2', ic: 'car', walk: 1200, price: 890, days: 30, code: 'KRING-CAR-2M8' }, { k: 'v3', img: 'cafe-desserts', walk: 260, price: 179, days: 14, code: 'KRING-TEA-5K1' }, { k: 'v4', ic: 'bag', walk: 200, price: 105, days: 30, code: 'KRING-BAG-9D3' }, { k: 'v5', ic: 'film', walk: 260, price: 135, days: 7, code: 'KRING-MOV-4X6' }]
/** What a package's items cost when bought one by one in Kring, or null when an item has no price in the app. */
export function packSeparate(p: Pack): number | null {
  const one: Record<string, () => number | undefined> = {
    inc_car: () => VOUCH.find((v) => v.k === 'v2')?.price,
    inc_esim: () => VOUCH.find((v) => v.k === 'v1')?.price,
  }
  let sum = 0
  for (const k of p.inc) {
    const v = one[k]?.() ?? TOURS.find((x) => x.k === k)?.price
    if (v === undefined) return null
    sum += v
  }
  return sum
}
/** The honest "compare" price for a package: the separate total only when the package really costs less, else 0 (show no saving). */
export const packCompare = (p: Pack): number => { const sep = packSeparate(p); return sep !== null && sep > p.price ? sep : 0 }
export interface Gift { id: string; th: string; k: string; p: number }
export const GIFTS: Gift[] = [{ id: 'garland', th: 'มาลัย', k: 'gm1', p: 19 }, { id: 'tea', th: 'ชาไทย', k: 'gm2', p: 29 }, { id: 'mango', th: 'ข้าวเหนียวมะม่วง', k: 'gm3', p: 39 }, { id: 'lotus', th: 'ดอกบัว', k: 'gm4', p: 59 }, { id: 'krathong', th: 'กระทง', k: 'gm5', p: 99 }, { id: 'lantern', th: 'โคมลอย', k: 'gm6', p: 199 }]
export const DIET_TH: Record<string, string> = { nonveg: 'ทานได้ทุกอย่าง', veg: 'มังสวิรัติ', halal: 'ฮาลาล', jain: 'อาหารเชน (ไม่ใส่หัวหอม กระเทียม)', nobeef: 'ไม่ทานเนื้อวัว', nopork: 'ไม่ทานหมู' }

export const hostName = (a: Act): string => (S.lang === 'th' ? a.hostTh : a.host)
export const aTitle = (a: Act): string => {
  if (!a) return ''
  if (S.lang === 'th') return a.th
  const k = 'a_' + a.id
  const tr = T[S.lang]?.[k] ?? T.en[k]
  return tr || a.titleEn || a.th
}
export const PLOY = (): string => hostName(act())
export const dietWord = (d: string): string => t('d_' + d)
export const baht = (n: number): string => '฿' + Math.round(n).toLocaleString('en-US')
export const ease = (p: number): number => 1 - Math.pow(1 - p, 3)
const BASE = (import.meta.env.BASE_URL || '/') + 'v6/photos/'
export const ph = (n: string): string => `${BASE}${n}.jpg`
export const bl = (n: string): string => `${BASE}blur/${n}.jpg`
export const dayFmt = (d: Date, o: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat(me().locale, o).format(new Date(d))
export const caseNo = (): string => 'KR-' + (10000 + Math.floor(Math.random() * 89999))
export const myBk = (): Booking[] => S.bookings.filter((b) => b.status !== 'cancelled' && !b.done)
export const rand = (a: number, b: number): number => a + Math.random() * (b - a)
export const pick = <X,>(a: X[]): X => a[(Math.random() * a.length) | 0]
export const RM = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
/** Tier ticket price for a host price (kept here so data.ts has no import cycle). */
const tierPrice = (p: number): number => (p <= 1200 ? 199 : p <= 1800 ? 299 : 499)
/** What a booking cost: kring = paid to Kring in the app, host = paid to the host at the place (never through Kring). */
export function bkMoney(b: Booking): { kring: number; host: number; kind: NonNullable<Booking['paid_kind']> } {
  if (b.paid_kind === 'partner') return { kring: 0, host: 0, kind: 'partner' }
  if (b.kind !== 'act') return { kring: b.amt, host: 0, kind: 'ticket' }
  const a = ACTS.find((x) => x.id === b.act)
  if (b.host_amt !== undefined) return { kring: b.amt, host: b.host_amt, kind: b.paid_kind || 'ticket' }
  // bookings saved by older builds stored ticket + host price as one number: split them again
  const host = a ? hostTotal(a, b.guests) : 0
  return { kring: Math.max(0, Math.min(b.amt, tierPrice(host))), host, kind: 'ticket' }
}
/** "Paid to Kring: …" line for a booking (ticket, pass, upgrade, covered, launch, waived). */
export function kringLine(b: Booking): string {
  const m = bkMoney(b)
  if (m.kind === 'pass') {
    const upg = m.kring - KR6_PRODUCTS.pass_7day.priceThb
    return upg > 0 ? t('paidKring') + ': ' + t('passPlusUpg', { price: baht(KR6_PRODUCTS.pass_7day.priceThb), tier: t('tk_' + KR6_PRODUCTS[getRequiredTicketTier(m.host)].tier), amt: baht(upg) }) : t('paidKringP', { amt: baht(m.kring) })
  }
  if (m.kind === 'covered') return t('paidKringT', { amt: baht(0) }) + ' · ' + t('passCovered')
  if (m.kind === 'launch') return t('paidKringT', { amt: baht(0) }) + ' · ' + t('launchFree')
  if (m.kind === 'upgrade') return t('paidKringU', { amt: baht(m.kring) })
  return t('paidKringT', { amt: baht(m.kring) })
}
/** The host price counts as paid only once the host confirmed it at the place (or the activity is finished). */
export const hostPaid = (b: Booking): boolean => (b.confirmed_by === 'host' && !!b.settled_at) || !!b.done
/** "Pay at the place: ฿Y to {host}" (or "Paid at the place" once the host confirmed it). */
export function placeLine(b: Booking, host: string): string {
  const m = bkMoney(b)
  if (m.host <= 0) return t('volNothing', { host })
  return t(hostPaid(b) ? 'paidPlace' : 'payPlace', { amt: baht(m.host), host })
}
/** What cancelling can give back at most: only the Kring ticket. A 7-Day Pass bought with this booking stays active,
    so only its upgrade part comes back; pass-covered, launch and waived bookings cost nothing to cancel. */
export function refundable(b: Booking): number {
  const m = bkMoney(b)
  return m.kind === 'pass' ? Math.max(0, m.kring - KR6_PRODUCTS.pass_7day.priceThb) : m.kind === 'covered' || m.kind === 'launch' || m.kind === 'waived' ? 0 : m.kring
}
/** Cancel a booking and keep it as a record (Trips shows it under Cancelled with the refund and the date).
 *  Returns true when the free launch ticket came back (cancelled before the host confirmed). */
export function cancelBooking(b: Booking, refund: number): boolean {
  let back = false
  update(() => { back = giveLaunchBack(b); b.status = 'cancelled'; b.refund_amt = Math.max(0, Math.round(refund)); b.cancelled_at = new Date().toISOString() })
  return back
}
/** Why cancelling gives nothing back (pass, covered, launch, waived), or '' when there is a ticket to refund. */
export { giveLaunchBack }
export function noRefundWhy(b: Booking): string {
  if (refundable(b) > 0) return ''
  const m = bkMoney(b)
  if (m.kind === 'pass') { const p = myPass(); return t('cxPassKept', { amt: baht(KR6_PRODUCTS.pass_7day.priceThb), d: p.until ? dayFmt(p.until, { weekday: 'short', day: 'numeric', month: 'short' }) : '' }) }
  if (m.kind === 'covered' || m.kind === 'upgrade') return t('cxCovered')
  return t('cxNothing')
}

/* ---------- the host's answer deadline ---------- */
/** When the host must answer a request: 3 h before the start; for a booking made less than 4 h ahead, within 1 h of booking,
    and never later than 30 min before the start. Unanswered by then: the request is cancelled and the ticket comes back. */
export function replyDeadline(start: Date, made: Date): Date {
  const s = start.getTime(), m = made.getTime()
  let d = s - m < 4 * 36e5 ? Math.min(m + 36e5, s - 30 * 6e4) : s - 3 * 36e5
  if (d <= m) d = Math.min(m + 10 * 6e4, s)
  return new Date(d)
}
export const bkStart = (b: Booking): Date => atTime(new Date(b.date), b.time || '00:00')
/** The answer deadline of a booking request (bookings saved before made_at existed count as booked long ahead). */
export const replyBy = (b: Booking): Date => replyDeadline(bkStart(b), b.made_at ? new Date(b.made_at) : new Date(bkStart(b).getTime() - 864e5))
const hhmm = (d: Date): string => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
/** "18:15" today, else "Sat 31 Oct, 15:00". */
export const whenShort = (d: Date): string => (sameDay(d, new Date()) ? hhmm(d) : dayFmt(d, { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + hhmm(d))
/** "{host} replies by 18:15, otherwise you get 100% back automatically." (or the no-charge version) */
export function replyLine(host: string, by: Date, refund: number, why = ''): string {
  return refund > 0 ? t('replyBy', { host, when: whenShort(by) }) : (t('replyBy0', { host, when: whenShort(by) }) + (why ? ' ' + why : ''))
}
/** Requests the host did not answer by the deadline: cancelled automatically, the whole refundable ticket back. */
export function expireUnanswered(now = Date.now()): void {
  const late = S.bookings.filter((b) => b.kind === 'act' && b.status === 'pending' && !b.done && replyBy(b).getTime() < now)
  if (!late.length) return
  update(() => { for (const b of late) { giveLaunchBack(b); b.status = 'cancelled'; b.refund_amt = refundable(b); b.cancelled_at = new Date(now).toISOString(); b.cancelled_reason = 'no_reply' } })
}

/* ---------- calendar file ---------- */
const icsT = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const icsEsc = (x: string): string => x.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
/** Bangkok wall-clock time for the .ics: the booked day (as picked in the app) + "HH:MM" + minutes, written as a floating
 *  local stamp that goes with TZID=Asia/Bangkok, so the phone's own timezone never shifts it. */
export function icsBkk(day: Date, hhmm: string, addMin = 0): string {
  const [hh, mm] = (hhmm || '00:00').split(':').map(Number)
  const u = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hh || 0, (mm || 0) + addMin))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${u.getUTCFullYear()}${p(u.getUTCMonth() + 1)}${p(u.getUTCDate())}T${p(u.getUTCHours())}${p(u.getUTCMinutes())}00`
}
/** The text of the .ics file for a booking: times pinned to Asia/Bangkok (UTC+7, no daylight saving) with a VTIMEZONE block. */
export function icsText(b: Booking, where: string, note: string, now = new Date()): string {
  const a = b.kind === 'act' ? ACTS.find((x) => x.id === b.act) : undefined
  const day = new Date(b.date), hm = b.time || '00:00'
  const mins = Math.round((a ? a.h : 3) * 60)
  const uid = (b.ref || 'kring-' + icsBkk(day, hm)) + '@kringapp.com'
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kring//Booking//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE', 'TZID:Asia/Bangkok', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0700', 'TZOFFSETTO:+0700', 'TZNAME:ICT', 'END:STANDARD', 'END:VTIMEZONE',
    'BEGIN:VEVENT',
    'UID:' + uid, 'DTSTAMP:' + icsT(now), 'DTSTART;TZID=Asia/Bangkok:' + icsBkk(day, hm), 'DTEND;TZID=Asia/Bangkok:' + icsBkk(day, hm, mins),
    'SUMMARY:' + icsEsc(bkTitle(b) + (a ? ' · ' + hostName(a) : '')), 'LOCATION:' + icsEsc(where), 'DESCRIPTION:' + icsEsc(note),
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(bkTitle(b)), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
}
/** A real .ics file for a booking (activity or partner tour), downloaded to the phone. Returns false when it could not start. */
export function downloadIcs(b: Booking, where: string, note: string): boolean {
  const ics = icsText(b, where, note)
  try {
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const el = document.createElement('a')
    el.href = url; el.download = 'kring-' + (b.ref || 'booking') + '.ics'
    document.body.appendChild(el); el.click(); el.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    return true
  } catch { return false }
}

/** A booking reference for a new booking: KR- and 6 digits. */
export const newRef = (): string => 'KR-' + String(100000 + Math.floor(Math.random() * 900000))

export const bkTitle = (b: Booking): string => (b.kind === 'act' ? aTitle(ACTS.find((x) => x.id === b.act)!) : t(b.k!))
export const bkHost = (b: Booking): string => (b.kind === 'act' ? hostName(ACTS.find((x) => x.id === b.act)!) : '')
/** Thai helper: Thai line with an English gloss line under it (gloss hidden in production unless enabled). */
export const tTh = (th: string, en: string): string => `${th}<span class="gl">${en}</span>`
export const trav = () => ({ n: me().nameTh, l: me().langTh, g: me().g })
