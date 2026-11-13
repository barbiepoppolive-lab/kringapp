/* D-053 · D-054 · D-055 · D-056 · A-09 · A-20
   Core logic for:
   1. 100m Two-Tap Check-In & Settle-at-Check-In State Machine (A-09 + D-054)
   2. 3-Tier Booking Tickets + 7-Day Pass + "Treat the Table" KRV-XXXXXX Venue Vouchers (D-053 + D-055)
   3. Host Stripe Thailand Payment Link + 3-Rail Country Auto-Selector (A-20)
   4. Approved Activity Templates & Temple-Guiding Block (D-054 + D-056) */

export const MAX_BUMP_METERS = 100

export type TicketProductId = 'ticket_standard' | 'ticket_signature' | 'ticket_premier' | 'pass_7day'
export type TicketPaymentProvider = 'dodo' | 'razorpay' | 'cashfree'
export type TicketPurchaseStatus = 'active' | 'used' | 'forfeited' | 'refunded'
export type VoucherStatus = 'reserved' | 'unlocked' | 'redeemed' | 'cancelled'
export type ConfirmedByMode = 'host' | 'slip' | 'cash'
export type HostPayRail = 'personal_qr' | 'merchant_qr' | 'stripe_link' | 'cash'

export interface Kr6ProductSpec {
  id: TicketProductId
  nameEn: string
  nameTh: string
  kind: 'ticket' | 'pass'
  tier: 'standard' | 'signature' | 'premier' | 'pass_7day'
  priceThb: number
  priceInr: number
  minActivityThb: number
  maxActivityThb: number
  passUpgradeThb: number
  passUpgradeInr: number
  bandLabelEn: string
  bandLabelTh: string
  billingBadgeEn: string
  billingBadgeTh: string
}

export const KR6_PRODUCTS: Record<TicketProductId, Kr6ProductSpec> = {
  ticket_standard: {
    id: 'ticket_standard',
    nameEn: 'Standard Booking Ticket',
    nameTh: 'ตั๋วจองนัดพบ มาตรฐาน',
    kind: 'ticket',
    tier: 'standard',
    priceThb: 199,
    priceInr: 520,
    minActivityThb: 0,
    maxActivityThb: 1200,
    passUpgradeThb: 0,
    passUpgradeInr: 0,
    bandLabelEn: 'Host price up to ฿1,000',
    bandLabelTh: 'ราคาโฮสต์ไม่เกิน ฿1,000',
    billingBadgeEn: 'One payment. No subscription.',
    billingBadgeTh: 'จ่ายครั้งเดียว ไม่มีต่ออายุอัตโนมัติ',
  },
  ticket_signature: {
    id: 'ticket_signature',
    nameEn: 'Signature Booking Ticket',
    nameTh: 'ตั๋วจองนัดพบ ซิกเนเจอร์',
    kind: 'ticket',
    tier: 'signature',
    priceThb: 299,
    priceInr: 780,
    minActivityThb: 1201,
    maxActivityThb: 1800,
    passUpgradeThb: 0,
    passUpgradeInr: 0,
    bandLabelEn: 'Host price ฿1,001–฿1,600',
    bandLabelTh: 'ราคาโฮสต์ ฿1,001–฿1,600',
    billingBadgeEn: 'One payment. No subscription.',
    billingBadgeTh: 'จ่ายครั้งเดียว ไม่มีต่ออายุอัตโนมัติ',
  },
  ticket_premier: {
    id: 'ticket_premier',
    nameEn: 'Premier Booking Ticket',
    nameTh: 'ตั๋วจองนัดพบ พรีเมียร์',
    kind: 'ticket',
    tier: 'premier',
    priceThb: 499,
    priceInr: 1300,
    minActivityThb: 1801,
    maxActivityThb: Number.POSITIVE_INFINITY,
    passUpgradeThb: 199,
    passUpgradeInr: 520,
    bandLabelEn: 'Host price above ฿1,600',
    bandLabelTh: 'ราคาโฮสต์มากกว่า ฿1,600',
    billingBadgeEn: 'One payment. No subscription.',
    billingBadgeTh: 'จ่ายครั้งเดียว ไม่มีต่ออายุอัตโนมัติ',
  },
  pass_7day: {
    id: 'pass_7day',
    nameEn: 'Kring 7-Day Pass',
    nameTh: 'พาสกริ๊ง 7 วัน',
    kind: 'pass',
    tier: 'pass_7day',
    priceThb: 590,
    priceInr: 1550,
    minActivityThb: 0,
    maxActivityThb: 1800,
    passUpgradeThb: 0,
    passUpgradeInr: 0,
    bandLabelEn: 'Covers every Standard ticket for 7 days (+฿100 Signature / +฿300 Premier per booking). One payment, never renews.',
    bandLabelTh: 'ครอบคลุมตั๋วมาตรฐาน 7 วัน (อัปเกรดซิกเนเจอร์ +฿100 / พรีเมียร์ +฿300) · จ่ายครั้งเดียว ไม่มีต่ออายุอัตโนมัติ',
    billingBadgeEn: 'One-Time Trip Pass · Never auto-renews',
    billingBadgeTh: 'จ่ายครั้งเดียว ไม่มีต่ออายุอัตโนมัติ',
  },
}

export interface TreatTheTableVenue {
  venueId: string
  nameEn: string
  nameTh: string
  district: string
  faceThb: number
  discountThb: number
  priceThb: number
  perkSummaryEn: string
  perkSummaryTh: string
  defaultCode: string
}

// Demo venues for local tests only. Production builds ship none (real venues come from kr8_venues, migration 0023).
const DEMO_TREAT_THE_TABLE_VENUES: TreatTheTableVenue[] = [
  {
    venueId: 'venue_banthat_thong_sweet',
    nameEn: 'Banthat Thong Toast & Thai Tea House',
    nameTh: 'ร้านขนมปังปิ้งและชาไทย บรรทัดทอง',
    district: 'Banthat Thong',
    faceThb: 300,
    discountThb: 60,
    priceThb: 240,
    perkSummaryEn: '฿300 table voucher for ฿240 (save ฿60 · unlocks at check-in)',
    perkSummaryTh: 'คูปองโต๊ะ ฿300 จ่ายเพียง ฿240 (ลด ฿60 · เปิดรหัสเมื่อเช็กอิน)',
    defaultCode: 'KRV-BTT300',
  },
  {
    venueId: 'venue_ari_roastery',
    nameEn: 'Ari Specialty Coffee & Croissant Bar',
    nameTh: 'คาเฟ่คั่วกาแฟและครัวซองต์ อารีย์',
    district: 'Ari',
    faceThb: 250,
    discountThb: 50,
    priceThb: 200,
    perkSummaryEn: '฿250 café table voucher for ฿200 (save ฿50 · unlocks at check-in)',
    perkSummaryTh: 'คูปองคาเฟ่ ฿250 จ่ายเพียง ฿200 (ลด ฿50 · เปิดรหัสเมื่อเช็กอิน)',
    defaultCode: 'KRV-ARI250',
  },
  {
    venueId: 'venue_boardgame_siam',
    nameEn: 'Siam Board-Game & Craft Soda Lounge',
    nameTh: 'บอร์ดเกมคาเฟ่และคราฟต์โซดา สยาม',
    district: 'Siam',
    faceThb: 400,
    discountThb: 80,
    priceThb: 320,
    perkSummaryEn: '฿400 game pass + drinks for ฿320 (save ฿80 · unlocks at check-in)',
    perkSummaryTh: 'คูปองบอร์ดเกม+เครื่องดื่ม ฿400 จ่ายเพียง ฿320 (ลด ฿80 · เปิดรหัสเมื่อเช็กอิน)',
    defaultCode: 'KRV-BGM400',
  },
]

export const TREAT_THE_TABLE_VENUES: TreatTheTableVenue[] = import.meta.env.PROD ? [] : DEMO_TREAT_THE_TABLE_VENUES

export function generateVoucherCode(seed?: string): string {
  if (seed && /^KRV-[A-Z0-9]{6}$/.test(seed)) return seed
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let suffix = ''
  const raw = seed || String(Date.now())
  for (let i = 0; i < 6; i++) {
    const code = raw.charCodeAt(i % raw.length) + i * 17
    suffix += chars[code % chars.length]
  }
  return `KRV-${suffix}`
}

/** Booking ticket tier from the host price (THB). Bands have no gaps: ≤1,000 Standard, 1,001–1,600 Signature, >1,600 Premier. */
export function getRequiredTicketTier(activityPriceThb: number): 'ticket_standard' | 'ticket_signature' | 'ticket_premier' {
  if (activityPriceThb <= KR6_PRODUCTS.ticket_standard.maxActivityThb) return 'ticket_standard'
  if (activityPriceThb <= KR6_PRODUCTS.ticket_signature.maxActivityThb) return 'ticket_signature'
  return 'ticket_premier'
}

/* ---------- 7-Day Pass ownership ---------- */
export const PASS_DAYS = 7
/** Days left on a pass that ends at `passUntil` (0 = no active pass). */
export function passDaysLeft(passUntil?: string | null, now: Date = new Date()): number {
  if (!passUntil) return 0
  const end = Date.parse(passUntil)
  if (!Number.isFinite(end)) return 0
  const ms = end - now.getTime()
  return ms > 0 ? Math.ceil(ms / 864e5) : 0
}
/** End time of a pass bought now. */
export const passUntilFrom = (now: Date = new Date()): string => new Date(now.getTime() + PASS_DAYS * 864e5).toISOString()

export interface BookingTicketQuote {
  requiredTicketId: 'ticket_standard' | 'ticket_signature' | 'ticket_premier'
  selectedProductId: TicketProductId
  hasActivePass: boolean
  isVolunteerActivity: boolean
  hostPayAtMeetupThb: number
  kringChargeNowThb: number
  kringChargeNowInr: number
  passUpgradeDiffThb: number
  passUpgradeDiffInr: number
  voucherAddOnThb: number
  totalCheckoutNowThb: number
  totalCheckoutNowInr: number
  provider: TicketPaymentProvider
  /** Zone-1 launch: first Kring ticket free (single ticket only, never a pass) */
  launchTicketApplied: boolean
  /** Ticket-to-host swap: part of the host's leaderboard reward taken off Kring's ticket and paid to the host at check-in */
  hostRewardAppliedThb: number
  /** reward left over for the host's next booking (when it exceeded this ticket) */
  hostRewardCarryThb: number
}

export function resolveBookingTicketQuote(opts: {
  activityPriceThb: number
  isVolunteer?: boolean
  buy7DayPass?: boolean
  hasActive7DayPass?: boolean
  travellerCountry?: string
  voucher?: TreatTheTableVenue | null
  /** true when the guest is eligible for the Zone-1 free launch ticket (see isLaunchTicketEligible) */
  launchFree?: boolean
  /** host's unspent leaderboard reward balance in baht (Mechanism 1, locked 29 Oct) */
  hostRewardBalanceThb?: number
}): BookingTicketQuote {
  const isVolunteer = !!opts.isVolunteer || opts.activityPriceThb === 0
  // The host price is fixed by the host; the guest never changes it. The ticket tier follows from it.
  const hostPayAtMeetupThb = isVolunteer ? 0 : Math.max(0, Math.round(opts.activityPriceThb))
  const requiredTicketId = getRequiredTicketTier(hostPayAtMeetupThb)
  const tierSpec = KR6_PRODUCTS[requiredTicketId]
  const passSpec = KR6_PRODUCTS.pass_7day
  const country = (opts.travellerCountry || 'US').toUpperCase()
  const provider: TicketPaymentProvider = country === 'IN' ? 'razorpay' : 'dodo'

  const hasActivePass = !!opts.hasActive7DayPass
  const buyPass = !!opts.buy7DayPass && !hasActivePass

  let selectedProductId: TicketProductId = requiredTicketId
  let kringChargeNowThb = tierSpec.priceThb
  let kringChargeNowInr = tierSpec.priceInr
  let passUpgradeDiffThb = 0
  let passUpgradeDiffInr = 0

  if (hasActivePass) {
    selectedProductId = 'pass_7day'
    passUpgradeDiffThb = tierSpec.passUpgradeThb
    passUpgradeDiffInr = tierSpec.passUpgradeInr
    kringChargeNowThb = passUpgradeDiffThb
    kringChargeNowInr = passUpgradeDiffInr
  } else if (buyPass) {
    selectedProductId = 'pass_7day'
    passUpgradeDiffThb = tierSpec.passUpgradeThb
    passUpgradeDiffInr = tierSpec.passUpgradeInr
    kringChargeNowThb = passSpec.priceThb + passUpgradeDiffThb
    kringChargeNowInr = passSpec.priceInr + passUpgradeDiffInr
  }

  // Zone-1 launch: the first single ticket is free. Never applies to a 7-Day Pass purchase or upgrade.
  const launchTicketApplied = !!opts.launchFree && !hasActivePass && !buyPass && !isVolunteer
  if (launchTicketApplied) { kringChargeNowThb = 0; kringChargeNowInr = 0 }

  // Ticket-to-host swap: Kring takes less on its own ticket; the guest pays that amount to the host at check-in.
  // Same total for the guest; Kring sends no money anywhere; capped at what is left of the ticket.
  const swap = isVolunteer
    ? { ticketThb: kringChargeNowThb, payHostThb: hostPayAtMeetupThb, rewardAppliedThb: 0, rewardCarryThb: Math.max(0, Math.round(opts.hostRewardBalanceThb || 0)) }
    : applyTicketRewardSwap(kringChargeNowThb, hostPayAtMeetupThb, opts.hostRewardBalanceThb || 0)
  if (swap.rewardAppliedThb > 0 && kringChargeNowThb > 0) {
    kringChargeNowInr = Math.round((kringChargeNowInr * swap.ticketThb) / kringChargeNowThb)
  }
  kringChargeNowThb = swap.ticketThb
  const hostPayWithRewardThb = swap.payHostThb

  const voucherAddOnThb = opts.voucher ? opts.voucher.priceThb : 0
  const voucherAddOnInr = Math.round(voucherAddOnThb * 2.6)

  return {
    requiredTicketId,
    selectedProductId,
    hasActivePass,
    isVolunteerActivity: isVolunteer,
    hostPayAtMeetupThb: hostPayWithRewardThb,
    kringChargeNowThb,
    kringChargeNowInr,
    passUpgradeDiffThb,
    passUpgradeDiffInr,
    voucherAddOnThb,
    totalCheckoutNowThb: kringChargeNowThb + voucherAddOnThb,
    totalCheckoutNowInr: kringChargeNowInr + voucherAddOnInr,
    provider,
    launchTicketApplied,
    hostRewardAppliedThb: swap.rewardAppliedThb,
    hostRewardCarryThb: swap.rewardCarryThb,
  }
}

/* ---------- Zone-1 launch ticket + leaderboard reward swap (locked 29 Oct 2026) ---------- */

export const LAUNCH_FREE_TICKET = {
  enabled: true,
  /** Zone 1 areas where the first ticket is free during the launch proof */
  zones: ['ari', 'aree', 'banthat thong', 'banthat-thong', 'banthad thong', 'chula', 'chulalongkorn', 'samyan', 'sam yan', 'อารีย์', 'บรรทัดทอง', 'จุฬา', 'จุฬาฯ', 'สามย่าน'] as readonly string[],
  /** Bangkok time; after this the launch ticket stops applying */
  endsIso: '2026-11-30T23:59:59+07:00',
  labelEn: 'Free launch ticket (one per account, Zone 1)',
  labelTh: 'ตั๋วฟรีช่วงเปิดตัว (บัญชีละ 1 ใบ โซน 1)',
} as const

/** First single ticket free for a guest booking an activity in a Zone-1 area, until the end date. */
export function isLaunchTicketEligible(opts: { area?: string | null; usedLaunchTicket?: boolean; now?: Date }): boolean {
  if (!LAUNCH_FREE_TICKET.enabled || opts.usedLaunchTicket) return false
  const now = opts.now ?? new Date()
  if (now.getTime() > Date.parse(LAUNCH_FREE_TICKET.endsIso)) return false
  // whole words only: "Marine Dept." must not count as "Ari"
  const area = ' ' + (opts.area || '').toLowerCase().replace(/[^a-z0-9ก-๙-]+/g, ' ') + ' '
  return LAUNCH_FREE_TICKET.zones.some((z) => (/[ก-๙]/.test(z) ? area.includes(z) : area.includes(' ' + z + ' ') || area.includes(' ' + z.replace(/-/g, ' ') + ' ')))
}

/** The one free launch ticket per account is spent only by a booking that used it (a ticket paid in another zone, or a pass,
 *  never spends it). A launch booking cancelled before the host confirmed it gives the ticket back (launch_back). */
export interface LaunchBookingLike { kind: string; paid_kind?: string; status?: string; launch_back?: boolean }
export function launchTicketUsed(bookings: readonly LaunchBookingLike[]): boolean {
  return bookings.some((b) => b.kind === 'act' && b.paid_kind === 'launch' && !b.launch_back)
}
/** True when cancelling this booking now gives the free launch ticket back: it used the free ticket and the host has not confirmed yet. */
export function launchTicketComesBack(b: LaunchBookingLike): boolean {
  return b.kind === 'act' && b.paid_kind === 'launch' && b.status === 'pending' && !b.launch_back
}

export interface TicketRewardSwap { ticketThb: number; payHostThb: number; rewardAppliedThb: number; rewardCarryThb: number }

/** Mechanism 1: move up to the whole remaining ticket from Kring to the host. Guest total is unchanged. */
export function applyTicketRewardSwap(ticketThb: number, hostPayThb: number, rewardBalanceThb: number): TicketRewardSwap {
  const ticket = Math.max(0, Math.round(ticketThb || 0))
  const reward = Math.max(0, Math.round(rewardBalanceThb || 0))
  const applied = Math.min(ticket, reward)
  return { ticketThb: ticket - applied, payHostThb: Math.max(0, Math.round(hostPayThb || 0)) + applied, rewardAppliedThb: applied, rewardCarryThb: reward - applied }
}


/* ---------- A-20 · Host Payment Rails & Stripe Thailand Link Validation ---------- */

export const STRIPE_PAYMENT_LINK_RE = /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_-]+/

export function isValidStripePaymentLink(url?: string | null): boolean {
  if (!url || !url.trim()) return false
  return STRIPE_PAYMENT_LINK_RE.test(url.trim())
}

export function buildStripeCheckinUrl(stripeLink: string, bookingId: string): string {
  const clean = stripeLink.trim()
  const ref = encodeURIComponent(bookingId || 'KR-BOOKING')
  return clean.includes('?') ? `${clean}&client_reference_id=${ref}` : `${clean}?client_reference_id=${ref}`
}

export interface HostRailsConfig {
  promptpay_personal?: string | null
  merchant_qr?: string | null
  stripe_payment_link?: string | null
}

export interface SelectedCheckinRail {
  rail: HostPayRail
  availableRails: HostPayRail[]
  stripeCheckoutUrl?: string
  wiseRevolutPlanB: boolean
  reason: string
}

const ASIAN_WALLET_COUNTRIES = new Set(['MY', 'ID', 'CN', 'HK', 'MO', 'TW', 'JP', 'KR', 'PH', 'VN'])

/** Auto-choose the check-in payment rail (A-20 + A-09) based on traveller country and host's configured rails. */
export function selectHostCheckinRail(
  travellerCountry: string,
  hostRails: HostRailsConfig,
  bookingId = 'KR-BOOKING-001',
): SelectedCheckinRail {
  const cc = (travellerCountry || 'US').trim().toUpperCase()
  const hasPersonal = !!(hostRails.promptpay_personal && hostRails.promptpay_personal.trim())
  const hasMerchant = !!(hostRails.merchant_qr && hostRails.merchant_qr.trim())
  const hasStripe = isValidStripePaymentLink(hostRails.stripe_payment_link)

  const availableRails: HostPayRail[] = []
  if (hasPersonal) availableRails.push('personal_qr')
  if (hasMerchant) availableRails.push('merchant_qr')
  if (hasStripe) availableRails.push('stripe_link')
  availableRails.push('cash')

  let order: HostPayRail[]
  if (cc === 'TH' || cc === 'SG') {
    order = ['personal_qr', 'merchant_qr', 'stripe_link', 'cash']
  } else if (ASIAN_WALLET_COUNTRIES.has(cc)) {
    order = ['merchant_qr', 'stripe_link', 'personal_qr', 'cash']
  } else {
    // Card-only / Western / Indian (US, GB, AU, DE, IN, etc.)
    order = ['stripe_link', 'merchant_qr', 'personal_qr', 'cash']
  }

  const chosen = order.find((r) => availableRails.includes(r)) || 'cash'
  const stripeCheckoutUrl =
    chosen === 'stripe_link' && hostRails.stripe_payment_link
      ? buildStripeCheckinUrl(hostRails.stripe_payment_link, bookingId)
      : undefined

  return {
    rail: chosen,
    availableRails,
    stripeCheckoutUrl,
    wiseRevolutPlanB: !hasStripe && !ASIAN_WALLET_COUNTRIES.has(cc) && cc !== 'TH' && cc !== 'SG',
    reason: `country=${cc} -> preferred=${order[0]} -> selected=${chosen}`,
  }
}

/** Fixture hosts with 0, 1, 2, and 3 configured rails for A-20 verification tests. */
export const FIXTURE_HOSTS_RAILS: Record<string, HostRailsConfig> = {
  host_0_rails: {
    promptpay_personal: '',
    merchant_qr: '',
    stripe_payment_link: '',
  },
  host_1_rail_personal: {
    promptpay_personal: '0812345678',
    merchant_qr: '',
    stripe_payment_link: '',
  },
  host_2_rails_qr: {
    promptpay_personal: '0812345678',
    merchant_qr: 'KSHOP-TH-TAG30-NICHA-001',
    stripe_payment_link: '',
  },
  host_3_rails_all: {
    promptpay_personal: '0812345678',
    merchant_qr: 'KSHOP-TH-TAG30-NICHA-001',
    stripe_payment_link: 'https://buy.stripe.com/test_kring_nicha_thb',
  },
}

export const FIXTURE_TRAVELLER_COUNTRIES = ['TH', 'SG', 'MY', 'CN', 'US', 'IN', 'RU'] as const

export const MAX_EASYPAY_PERSONAL_QR_THB = 1700

/**
 * TAGTHAi Easy Pay eligibility helper (Khun Noon call 29 Oct 2026):
 * - Scans personal PromptPay QR up to ฿1,700 per transaction.
 * - 0% fee with cash top-up at KBank FX booth; 3.5%–3.6% with linked international card.
 * - ฿0 fee cash withdrawal at KBank ATMs nationwide; pre-register up to 30 days before arrival.
 * - Restricted by passport / issuing bank country ('RU' not supported), NEVER by UI language ('ru').
 */
export function isTagthaiEasyPaySupported(opts: {
  passportOrCardCountry?: string | null
  amountThb?: number
}): { supported: boolean; withinPersonalQrCap: boolean; maxPersonalQrThb: number } {
  const cc = (opts.passportOrCardCountry || '').trim().toUpperCase()
  const supported = cc !== 'RU'
  const withinPersonalQrCap = (opts.amountThb ?? 0) <= MAX_EASYPAY_PERSONAL_QR_THB
  return {
    supported,
    withinPersonalQrCap,
    maxPersonalQrThb: MAX_EASYPAY_PERSONAL_QR_THB,
  }
}

/* ---------- D-054 + D-056 · Approved Activity Templates & Temple-Guiding Guard ---------- */

export interface ApprovedActivityTemplate {
  id: string
  cat: 'eat' | 'market' | 'muay' | 'cook' | 'river'
  titleTh: string
  titleEn: string
  defaultPlaceTh: string
  defaultPlaceEn: string
  defaultDurationHrs: string
  suggestedPriceThb: number
}

export const APPROVED_ACTIVITY_TEMPLATES: ApprovedActivityTemplate[] = [
  {
    id: 'tpl_banthat_thong',
    cat: 'eat',
    titleTh: 'ตะลุยกินสตรีทฟู้ดบรรทัดทอง',
    titleEn: 'Banthat Thong Street-Food Crawl',
    defaultPlaceTh: 'สวนจุฬา 100 ปี (บรรทัดทอง)',
    defaultPlaceEn: 'Chula Centenary Park (Banthat Thong)',
    defaultDurationHrs: '2',
    suggestedPriceThb: 900,
  },
  {
    id: 'tpl_ari_cafe',
    cat: 'eat',
    titleTh: 'เดินคาเฟ่และถ่ายรูปฟิล์มย่านอารีย์',
    titleEn: 'Ari Café & Film-Photo Walk',
    defaultPlaceTh: 'BTS อารีย์ ทางออก 3',
    defaultPlaceEn: 'BTS Ari Exit 3',
    defaultDurationHrs: '2',
    suggestedPriceThb: 800,
  },
  {
    id: 'tpl_muay_thai',
    cat: 'muay',
    titleTh: 'ซ้อมมวยไทยยิมมาตรฐานกับเพื่อนคนไทย',
    titleEn: 'Muay Thai Gym Session',
    defaultPlaceTh: 'สวนลุมพินี ประตู 1',
    defaultPlaceEn: 'Lumpini Park Gate 1',
    defaultDurationHrs: '1.5',
    suggestedPriceThb: 900,
  },
  {
    id: 'tpl_chatuchak',
    cat: 'market',
    titleTh: 'เดินช้อปตลาดนัดจตุจักรโซนวินเทจ',
    titleEn: 'Chatuchak Market Run',
    defaultPlaceTh: 'MRT กำแพงเพชร ทางออก 2',
    defaultPlaceEn: 'MRT Kamphaeng Phet Exit 2',
    defaultDurationHrs: '2',
    suggestedPriceThb: 800,
  },
  {
    id: 'tpl_pottery_tufting',
    cat: 'cook',
    titleTh: 'เวิร์กชอปปั้นเซรามิกและทอพรม Tufting',
    titleEn: 'Pottery / Tufting Craft Session',
    defaultPlaceTh: 'หอศิลปวัฒนธรรมแห่งกรุงเทพมหานคร (BACC)',
    defaultPlaceEn: 'Bangkok Art & Culture Centre (BACC)',
    defaultDurationHrs: '2',
    suggestedPriceThb: 1200,
  },
  {
    id: 'tpl_board_game',
    cat: 'eat',
    titleTh: 'เล่นบอร์ดเกมคาเฟ่และฝึกพูดภาษาไทย',
    titleEn: 'Board-Game Café Hangout',
    defaultPlaceTh: 'หอศิลปวัฒนธรรมแห่งกรุงเทพมหานคร (BACC)',
    defaultPlaceEn: 'Bangkok Art & Culture Centre (BACC)',
    defaultDurationHrs: '2',
    suggestedPriceThb: 600,
  },
  {
    id: 'tpl_river_sunset',
    cat: 'river',
    titleTh: 'เดินเล่นริมแม่น้ำเจ้าพระยายามเย็น',
    titleEn: 'River Pier Sunset Walk',
    defaultPlaceTh: 'ริเวอร์พาร์ค ไอคอนสยาม ท่าที่ 1',
    defaultPlaceEn: 'ICONSIAM River Park Pier 1',
    defaultDurationHrs: '1.5',
    suggestedPriceThb: 700,
  },
  {
    id: 'tpl_movie_cafe',
    cat: 'eat',
    titleTh: 'ดูหนังรอบเย็นและนั่งคุยคาเฟ่',
    titleEn: 'Movie + Café Hangout',
    defaultPlaceTh: 'หอศิลปวัฒนธรรมแห่งกรุงเทพมหานคร (BACC)',
    defaultPlaceEn: 'Bangkok Art & Culture Centre (BACC)',
    defaultDurationHrs: '3',
    suggestedPriceThb: 800,
  },
  {
    id: 'tpl_song_wat',
    cat: 'eat',
    titleTh: 'เดินคาเฟ่และแกลเลอรีถนนทรงวาด',
    titleEn: 'Song Wat Specialty Coffee & Shophouse Art Walk',
    defaultPlaceTh: 'เพลย์ อาร์ต เฮาส์ (ถนนทรงวาด)',
    defaultPlaceEn: 'Play Art House (Song Wat Road)',
    defaultDurationHrs: '2',
    suggestedPriceThb: 800,
  },
  {
    id: 'tpl_ratchaprasong',
    cat: 'eat',
    titleTh: 'เดินเล่นย่านราชประสงค์และแวะร้านอร่อยซอยลับ',
    titleEn: 'Ratchaprasong Evening Walk & Hidden Alley Bite Crawl',
    defaultPlaceTh: 'ทางเชื่อมสกายวอล์ค เกษรวิลเลจ',
    defaultPlaceEn: 'Gaysorn Village Skywalk Exit',
    defaultDurationHrs: '2',
    suggestedPriceThb: 800,
  },
  {
    id: 'tpl_tha_tien_riverside',
    cat: 'river',
    titleTh: 'เดินถ่ายรูปย่านท่าเตียนและริมแม่น้ำเจ้าพระยายามเย็น',
    titleEn: 'Tha Tien & Chao Phraya Sunset Photo Walk',
    defaultPlaceTh: 'ท่าเรือท่าเตียน (N8)',
    defaultPlaceEn: 'Tha Tien Pier (N8)',
    defaultDurationHrs: '2',
    suggestedPriceThb: 900,
  },
]

export const BLOCKED_TEMPLE_GUIDING_RE =
  /(wat\s*pho|grand\s*palace|wat\s*arun|emerald\s*buddha|temple\s*tour|temple\s*guide|historical\s*guide|วัดโพธิ์|พระบรมมหาราชวัง|วัดพระแก้ว|วัดอรุณ|นำเที่ยววัด|ไกด์นำเที่ยว)/i

export function isTempleGuidingBlocked(input: string): boolean {
  if (!input) return false
  return BLOCKED_TEMPLE_GUIDING_RE.test(input)
}

/** Guiding phrases in an activity description (temple / palace / history guiding needs a TAT guide licence).
 *  Naming a landmark as a meeting point or a view ("near Wat Pho", "view of Wat Arun") is fine; guiding it is not. */
export const BLOCKED_GUIDING_DESC_RE =
  /(temple\s*(tour|guide|guiding|visit)|histor(y|ical)\s*(tour|guide|guiding|walk|talk)|guided\s*(tour|visit|walk)|(guide|show|take|tour)\s+(you\s+|guests\s+)?(inside|through|around|into)\s+(the\s+)?(wat|temples?|grand\s*palace|palace)|explain\s+(the\s+)?(history|temple)|tell\s+(you\s+)?(the\s+)?history|นำเที่ยววัด|ไกด์นำเที่ยว|พาเที่ยววัด|นำชมวัด|พาชมวัด|ทัวร์วัด|ไหว้พระ\s*9\s*วัด|เล่าประวัติ|อธิบายประวัติ|ประวัติศาสตร์ของวัด|นำชมพระบรมมหาราชวัง|บรรยายประวัติ|บรรยายเรื่อง(วัด|วัง)|นำชมด้านใน|พาเข้าไปชม|พาชมพระบรมมหาราชวัง)/i

/** The title rule plus guiding phrases: for the free-text description of a host's activity. */
export function isTempleGuidingDesc(input: string): boolean {
  if (!input) return false
  const LM = '(wat\\s*pho|grand\\s*palace|wat\\s*arun|emerald\\s*buddha|วัดโพธิ์|พระบรมมหาราชวัง|วัดพระแก้ว|วัดอรุณ|วัดสุทัศน์|วัดสระเกศ|ภูเขาทอง)'
  const ACT = '(tour|guide|guiding|history|historical|explain|ประวัติ|นำชม|ไกด์|บรรยาย|เล่า|อธิบาย)'
  // a landmark and a guiding action in the same sentence, in either order (Thai often puts the verb first)
  return BLOCKED_GUIDING_DESC_RE.test(input) || new RegExp(`${LM}[^.!?\\n]{0,60}${ACT}|${ACT}[^.!?\\n]{0,60}${LM}`, 'i').test(input)
}

/* ---------- A-09 + D-054 · Settle-at-Check-In State Machine ---------- */

export interface CheckinSettleState {
  bookingId: string
  isVolunteer: boolean
  priceThb: number
  gpsMeters: number
  bumpConfirmed: boolean
  ticketStatus: TicketPurchaseStatus
  timerRunning: boolean
  voucherStatus: VoucherStatus
  voucherCode: string | null
  settled: boolean
  confirmedBy: ConfirmedByMode | null
  slipUploadOpen: boolean
  slipWindowSec: number
  cancelledUnsettled: boolean
  guestStrikeIssued: boolean
  guestStrikesTotal: number
  guestBookingSuspended: boolean
  hostHoursLost: number
  hostNoShowPerkAwarded: boolean
  reviewAllowed: boolean
}

export function createInitialCheckinSettleState(opts: {
  bookingId?: string
  priceThb: number
  isVolunteer?: boolean
  gpsMeters?: number
  voucherCode?: string | null
  initialGuestStrikes?: number
}): CheckinSettleState {
  const isVolunteer = !!opts.isVolunteer || opts.priceThb === 0
  return {
    bookingId: opts.bookingId || 'KR-BK-001',
    isVolunteer,
    priceThb: isVolunteer ? 0 : opts.priceThb,
    gpsMeters: opts.gpsMeters ?? 24,
    bumpConfirmed: false,
    ticketStatus: 'active',
    timerRunning: false,
    voucherStatus: 'reserved',
    voucherCode: opts.voucherCode ?? 'KRV-BTT300',
    settled: false,
    confirmedBy: null,
    slipUploadOpen: false,
    slipWindowSec: 120,
    cancelledUnsettled: false,
    guestStrikeIssued: false,
    guestStrikesTotal: opts.initialGuestStrikes ?? 0,
    guestBookingSuspended: (opts.initialGuestStrikes ?? 0) >= 2,
    hostHoursLost: 0,
    hostNoShowPerkAwarded: false,
    reviewAllowed: false,
  }
}

/** Step 1 & 2: Two-tap bump confirmed (<= 100m or 6-digit backup code). */
export function applyTwoTapBump(state: CheckinSettleState, viaCode = false): CheckinSettleState {
  if (!viaCode && state.gpsMeters > MAX_BUMP_METERS) {
    throw new Error('TOO_FAR_FROM_MEETING_POINT')
  }
  if (state.isVolunteer || state.priceThb === 0) {
    return {
      ...state,
      bumpConfirmed: true,
      ticketStatus: 'used',
      timerRunning: true,
      voucherStatus: 'unlocked',
      settled: true,
      confirmedBy: 'host',
      reviewAllowed: true,
    }
  }
  return {
    ...state,
    bumpConfirmed: true,
    ticketStatus: 'used',
    timerRunning: false,
    voucherStatus: 'reserved',
    settled: false,
    reviewAllowed: false,
  }
}

/** Step 4a: Host taps "Received ✓" (or slip verified) -> starts timer, unlocks KRV-XXXXXX voucher, enables review. */
export function applyHostReceivedConfirm(
  state: CheckinSettleState,
  confirmedBy: ConfirmedByMode = 'host',
): CheckinSettleState {
  if (!state.bumpConfirmed) throw new Error('BUMP_REQUIRED_FIRST')
  if (state.cancelledUnsettled) throw new Error('MEETUP_ALREADY_CANCELLED')
  return {
    ...state,
    timerRunning: true,
    voucherStatus: 'unlocked',
    settled: true,
    confirmedBy,
    slipUploadOpen: false,
    reviewAllowed: true,
  }
}

/** Step 4b: Host taps "Not received yet" -> opens 2-minute "Show my transfer" slip upload. */
export function applyHostNotReceivedYet(state: CheckinSettleState): CheckinSettleState {
  if (!state.bumpConfirmed) throw new Error('BUMP_REQUIRED_FIRST')
  return {
    ...state,
    slipUploadOpen: true,
    slipWindowSec: 120,
  }
}

/** Step 4c: Host taps "Guest did not settle — cancel meetup" -> forfeits ticket, issues strike, 0 hours lost for host. */
export function applyCancelUnsettledMeetup(state: CheckinSettleState): CheckinSettleState {
  if (!state.bumpConfirmed) throw new Error('BUMP_REQUIRED_FIRST')
  if (state.settled) throw new Error('ALREADY_SETTLED')
  const nextStrikes = state.guestStrikesTotal + 1
  return {
    ...state,
    ticketStatus: 'forfeited',
    timerRunning: false,
    voucherStatus: 'cancelled',
    settled: false,
    slipUploadOpen: false,
    cancelledUnsettled: true,
    guestStrikeIssued: true,
    guestStrikesTotal: nextStrikes,
    guestBookingSuspended: nextStrikes >= 2,
    hostHoursLost: 0,
    hostNoShowPerkAwarded: true,
    reviewAllowed: false,
  }
}
