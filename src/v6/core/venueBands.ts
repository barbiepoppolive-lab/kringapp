/* Kring venue bands — LOCKED 29 Oct 2026 (Kring Outreach Standard §2).
   Band 1 · cafés, dessert, casual spots: guest gets a FIXED baht discount on a minimum bill (café picks the tier);
            the venue pays Kring nothing; Kring earns the booking ticket only.
   Band 2 · restaurants, rooftops, cooking / Muay Thai / art studios: guest 15% off; Kring 10% of the FULL bill (before discount).
   Band 3 · dives, cruises, catamarans, attractions: same as band 2; daytime small groups or two guests booking together.
   All bands: rate fixed in writing for 6 months; guests pay the venue at its own till; Kring never holds venue money.
   The server (migration 0016 trigger) is the authority: it recomputes discount and commission on insert.
   This module mirrors it for the counter screen and must stay identical. */

export type VenueBand = 1 | 2 | 3
export type VenueCategory = 'cafe' | 'dessert' | 'casual' | 'restaurant' | 'rooftop' | 'studio' | 'experience'

export const CATEGORY_BAND: Record<VenueCategory, VenueBand> = {
  cafe: 1, dessert: 1, casual: 1, restaurant: 2, rooftop: 2, studio: 2, experience: 3,
}

export interface Band1Tier { discountThb: 200 | 250 | 300; minBillThb: 600 | 800 | 1000 }
export const BAND1_TIERS: readonly Band1Tier[] = [
  { discountThb: 200, minBillThb: 600 },
  { discountThb: 250, minBillThb: 800 },
  { discountThb: 300, minBillThb: 1000 },
] as const

export const BAND23_GUEST_DISCOUNT_RATE = 0.15
export const BAND23_COMMISSION_RATE = 0.1
export const RATE_FIXED_MONTHS = 6

export interface VenueTerms {
  band: VenueBand
  band1?: Band1Tier | null
  /** bands 2/3 only; defaults to the locked 15% */
  guestDiscountRate?: number
  /** bands 2/3 only; defaults to the locked 10%; band 1 is always 0 */
  commissionRate?: number
}

export interface TableBillBreakdown {
  billThb: number
  guestDiscountThb: number
  /** what the venue charges the guest on its own till */
  chargeThb: number
  /** owed to Kring on the monthly Statement; never shown on the counter screen */
  kringCommissionThb: number
  /** band 1: true when the bill reached the minimum; bands 2/3: always true */
  qualifies: boolean
  /** band 1: baht still needed to reach the minimum (0 when it qualifies) */
  shortfallThb: number
}

export function isBand1Tier(x: unknown): x is Band1Tier {
  if (!x || typeof x !== 'object') return false
  const t = x as Band1Tier
  return BAND1_TIERS.some((b) => b.discountThb === t.discountThb && b.minBillThb === t.minBillThb)
}

export function termsForCategory(category: VenueCategory, tier?: Band1Tier | null): VenueTerms {
  const band = CATEGORY_BAND[category]
  if (band === 1) return { band, band1: isBand1Tier(tier) ? tier : BAND1_TIERS[0] }
  return { band, guestDiscountRate: BAND23_GUEST_DISCOUNT_RATE, commissionRate: BAND23_COMMISSION_RATE }
}

/** Mirror of the 0016 server trigger. Bill is the table total BEFORE any Kring discount, in whole baht. */
export function computeTableBill(terms: VenueTerms, billInputThb: number): TableBillBreakdown {
  const billThb = Math.max(0, Math.min(50000, Math.round(Number(billInputThb) || 0)))
  if (terms.band === 1) {
    const tier = isBand1Tier(terms.band1) ? terms.band1 : BAND1_TIERS[0]
    const qualifies = billThb >= tier.minBillThb
    const guestDiscountThb = qualifies ? Math.min(tier.discountThb, billThb) : 0
    return { billThb, guestDiscountThb, chargeThb: billThb - guestDiscountThb, kringCommissionThb: 0, qualifies, shortfallThb: qualifies ? 0 : tier.minBillThb - billThb }
  }
  const dRate = clampRate(terms.guestDiscountRate ?? BAND23_GUEST_DISCOUNT_RATE)
  const cRate = clampRate(terms.commissionRate ?? BAND23_COMMISSION_RATE)
  const guestDiscountThb = Math.round(billThb * dRate)
  return { billThb, guestDiscountThb, chargeThb: billThb - guestDiscountThb, kringCommissionThb: Math.round(billThb * cRate), qualifies: true, shortfallThb: 0 }
}

function clampRate(r: number): number { return Number.isFinite(r) ? Math.max(0, Math.min(0.5, r)) : 0 }

/** The one line guests see on a venue (never a commission, never a percentage Kring earns). */
export function guestSavingLabel(terms: VenueTerms, lang: 'en' | 'th' = 'en'): string {
  if (terms.band === 1) {
    const t = isBand1Tier(terms.band1) ? terms.band1 : BAND1_TIERS[0]
    return lang === 'th'
      ? `ลด ฿${t.discountThb} เมื่อบิลถึง ฿${t.minBillThb.toLocaleString('en-US')}`
      : `Save ฿${t.discountThb} on bills from ฿${t.minBillThb.toLocaleString('en-US')}`
  }
  const pct = Math.round(clampRate(terms.guestDiscountRate ?? BAND23_GUEST_DISCOUNT_RATE) * 100)
  return lang === 'th' ? `ลด ${pct}% จากบิลของโต๊ะ` : `${pct}% off your table's bill`
}

/** ISO date (YYYY-MM-DD) the venue's rate is fixed until: same day, 6 calendar months later (clamped to month end). */
export function rateFixedUntil(from: Date = new Date()): string {
  const y = from.getUTCFullYear(), m = from.getUTCMonth() + RATE_FIXED_MONTHS, d = from.getUTCDate()
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const out = new Date(Date.UTC(y, m, Math.min(d, last)))
  return out.toISOString().slice(0, 10)
}

/* ---------- self-serve venue application (/#venue-onboard) ---------- */

export interface VenueApplicationInput {
  venueName: string
  ownerName: string
  lineId?: string
  phone?: string
  category: VenueCategory | ''
  band1Tier?: Band1Tier | null
  city: 'Bangkok' | 'Pattaya' | ''
  district?: string
  mapsUrl: string
  hasShopfrontPhoto: boolean
  referralHostCode?: string
  acceptedTerms: boolean
}

export type VenueApplicationError =
  | 'venueName' | 'ownerName' | 'contact' | 'category' | 'band1Tier' | 'city' | 'mapsUrl' | 'photo' | 'terms' | 'referral'

const MAPS_RE = /^https:\/\/(maps\.app\.goo\.gl\/|goo\.gl\/maps\/|maps\.google\.[a-z.]+\/|www\.google\.[a-z.]+\/maps)/i
export function isGoogleMapsUrl(u: string): boolean { return MAPS_RE.test((u || '').trim()) }

const LINE_ID_RE = /^@?[a-z0-9._-]{3,30}$/i
const PHONE_RE = /^\+?[0-9][0-9 -]{7,15}$/

export function validateVenueApplication(i: VenueApplicationInput): VenueApplicationError[] {
  const e: VenueApplicationError[] = []
  const nm = (i.venueName || '').trim()
  if (nm.length < 2 || nm.length > 120) e.push('venueName')
  const ow = (i.ownerName || '').trim()
  if (ow.length < 2 || ow.length > 80) e.push('ownerName')
  const hasLine = !!i.lineId && LINE_ID_RE.test(i.lineId.trim())
  const hasPhone = !!i.phone && PHONE_RE.test(i.phone.trim())
  if (!hasLine && !hasPhone) e.push('contact')
  if (!i.category || !(i.category in CATEGORY_BAND)) e.push('category')
  else if (CATEGORY_BAND[i.category] === 1 && !isBand1Tier(i.band1Tier)) e.push('band1Tier')
  if (i.city !== 'Bangkok' && i.city !== 'Pattaya') e.push('city')
  if (!isGoogleMapsUrl(i.mapsUrl)) e.push('mapsUrl')
  if (!i.hasShopfrontPhoto) e.push('photo')
  if (i.referralHostCode && !/^[a-z0-9_-]{3,40}$/i.test(i.referralHostCode.trim())) e.push('referral')
  if (!i.acceptedTerms) e.push('terms')
  return e
}
