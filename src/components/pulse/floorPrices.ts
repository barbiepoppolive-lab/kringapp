/**
 * NEXT95 · G2 — "Floor price" vs "Our price", ONE table for every Pulse surface (deal rows, Tonight tickets, the
 * Arrival kit, the bundle sheet and the booking flows), so the same item never shows two different numbers.
 *
 *   floor  = the lowest price we found ELSEWHERE today (a partner app, a 7-Eleven / airport counter, the street)
 *   ours   = the Chonn! price
 *   save   = floor − ours  (the honest saving: against the best alternative, not against the tourist walk-in)
 *   walkIn = the tourist walk-in price, shown only as a secondary struck line where it exists
 *
 * The trip total ("You saved ฿706 this trip", tripSavings.ts) stays measured against walk-in prices, as before; the
 * two are labelled differently on screen ("vs walk-in" / "save" next to the floor). Display data only — no coins,
 * no ledger.
 */

export interface FloorPrice {
  floorThb: number
  /** where the floor was found, e.g. "Klook app" */
  source: { en: string; th: string }
  oursThb: number
  walkInThb?: number
  /** Bonus promo credit awarded on partner confirmation (non-cashable promo) */
  bonusCoins?: number
}

const src = (en: string, th: string) => ({ en, th })

export const FLOOR_PRICES: Record<string, FloorPrice> = {
  // Arrival kit + eSIM flow + bundle (the same eSIM everywhere: Airalo app ฿195 is the cheapest elsewhere)
  'esim:8d': { floorThb: 195, source: src('Airalo app', 'แอป Airalo'), oursThb: 185, walkInThb: 499, bonusCoins: 5_000 },
  'esim:15d': { floorThb: 349, source: src('Airalo app', 'แอป Airalo'), oursThb: 329, walkInThb: 699, bonusCoins: 8_000 },
  'cab:airport': { floorThb: 700, source: src('Klook app', 'แอป Klook'), oursThb: 665, walkInThb: 1200, bonusCoins: 15_000 },
  bag: { floorThb: 120, source: src('Bounce app', 'แอป Bounce'), oursThb: 105, walkInThb: 200, bonusCoins: 3_000 },
  // rides (C15) — floor = the cheapest app fare we saw for the same zone tonight; walk-in = the street price
  'ride:city:comfort': { floorThb: 220, source: src('Grab', 'Grab'), oursThb: 199, walkInThb: 350, bonusCoins: 3_000 },
  'ride:city:xl': { floorThb: 320, source: src('Grab', 'Grab'), oursThb: 295, walkInThb: 450, bonusCoins: 5_000 },
  'ride:city:tuk': { floorThb: 200, source: src('street, agreed price', 'ตกลงราคาข้างทาง'), oursThb: 165, walkInThb: 300, bonusCoins: 3_000 },
  'ride:airport:comfort': { floorThb: 700, source: src('Klook app', 'แอป Klook'), oursThb: 665, walkInThb: 1200, bonusCoins: 15_000 },
  'ride:airport:xl': { floorThb: 990, source: src('Klook app', 'แอป Klook'), oursThb: 930, walkInThb: 1500, bonusCoins: 20_000 },
  'ride:pattaya:comfort': { floorThb: 1350, source: src('Klook app', 'แอป Klook'), oursThb: 1285, walkInThb: 2000, bonusCoins: 30_000 },
  'ride:pattaya:xl': { floorThb: 1990, source: src('Klook app', 'แอป Klook'), oursThb: 1850, walkInThb: 2600, bonusCoins: 35_000 },
  // bundle sheet extras
  hotel: { floorThb: 1590, source: src('Agoda', 'Agoda'), oursThb: 1550, walkInThb: 2200, bonusCoins: 20_000 },
  spa: { floorThb: 400, source: src('GoWabi app', 'แอป GoWabi'), oursThb: 385, walkInThb: 600, bonusCoins: 10_000 },
  pharm: { floorThb: 990, source: src('HDmall app', 'แอป HDmall'), oursThb: 940, walkInThb: 1200, bonusCoins: 15_000 },
  flower: { floorThb: 320, source: src('Pak Khlong market + delivery', 'ปากคลองตลาด + ค่าส่ง'), oursThb: 289, walkInThb: 400, bonusCoins: 5_000 },
  table: { floorThb: 300, source: src('Chope app (cover)', 'แอป Chope (ค่าเข้า)'), oursThb: 0, walkInThb: 600, bonusCoins: 0 },
  late: { floorThb: 190, source: src('Bolt', 'Bolt'), oursThb: 175, walkInThb: 300, bonusCoins: 3_000 },
  // affiliate deals whose partner-app price is not the honest floor
  'aff:wise-revolut': { floorThb: 220, source: src('Thai ATM fee', 'ค่ากดตู้ ATM ไทย'), oursThb: 0, walkInThb: 220, bonusCoins: 5_000 },
}

/** Bundle / kit item ids → the table above (the airport cab in the arrival bundle is the airport ride). */
export function floorForItem(bundle: string, itemId: string): FloorPrice | null {
  if (itemId === 'esim') return FLOOR_PRICES['esim:8d']
  if (itemId === 'cab') return bundle === 'arrival' ? FLOOR_PRICES['cab:airport'] : FLOOR_PRICES.late
  return FLOOR_PRICES[itemId] ?? null
}

export function floorForRide(zone: 'city' | 'airport' | 'pattaya', car: 'comfort' | 'xl' | 'tuk'): FloorPrice | null {
  return FLOOR_PRICES[`ride:${zone}:${car}`] ?? null
}

/** Tonight tickets carry a price radar: the floor is its cheapest comparison, the walk-in its first (counter) row. */
export function floorFromRadar(radar: { comparisons: readonly { label: string; price: string }[]; chonVipRate: string } | undefined): FloorPrice | null {
  if (!radar || radar.comparisons.length === 0) return null
  const num = (p: string) => Number(p.replace(/[^\d.]/g, ''))
  const rows = radar.comparisons.map((c) => ({ label: c.label, thb: num(c.price) })).filter((r) => Number.isFinite(r.thb) && r.thb > 0)
  if (rows.length === 0) return null
  const cheapest = rows.reduce((a, b) => (b.thb < a.thb ? b : a))
  const counter = rows[0]
  const label = /app$/i.test(cheapest.label) ? cheapest.label : `${cheapest.label} app`
  return {
    floorThb: cheapest.thb,
    source: { en: label, th: `แอป ${cheapest.label}` },
    oursThb: num(radar.chonVipRate),
    walkInThb: counter.thb > cheapest.thb ? counter.thb : undefined,
  }
}

/** Affiliate deals: the partner app price after its own coupon is the floor, unless we found something lower. */
export function floorForAffiliate(deal: { id: string; partner: string; partnerAppThb: number; walkInThb: number; rebateCoins: number; finalThb?: number }): FloorPrice {
  const override = FLOOR_PRICES[`aff:${deal.id}`]
  if (override) return override
  if (deal.id === 'esim-199') return FLOOR_PRICES['esim:8d']
  if (deal.id === 'bag-drop-88') return FLOOR_PRICES.bag
  if (deal.id === 'prep-pharmacy') return FLOOR_PRICES.pharm
  const ours = typeof deal.finalThb === 'number' ? deal.finalThb : Math.max(0, deal.partnerAppThb - Math.round(deal.rebateCoins / 100))
  return {
    floorThb: deal.partnerAppThb,
    source: { en: `${deal.partner} app`, th: `แอป ${deal.partner}` },
    oursThb: ours,
    walkInThb: deal.walkInThb,
    bonusCoins: deal.rebateCoins,
  }
}

export function saveThb(p: FloorPrice): number {
  return Math.max(0, Math.round((p.floorThb - p.oursThb) * 100) / 100)
}

/** ฿67.50 keeps its satang, ฿1,450 gets a comma. */
export function bahtLabel(n: number): string {
  return `฿${n % 1 === 0 ? Math.round(n).toLocaleString('en-US') : n.toFixed(2)}`
}

export const FLOOR_SEEN_KEY = 'chon_pulse_floor_seen_v1'

/**
 * ROUND5 · Wei B4 — ONE table for the add-ons a plan offers once she said yes (plan card chips, the Clink receipt,
 * the chat ride tile): the cab is the city Comfort fare the ride flow books, the table is the deposit the table flow
 * holds (it comes off the bill). Display data only.
 */
export const PLAN_ADDON_THB = {
  cab: FLOOR_PRICES['ride:city:comfort'].oursThb,
  cabXl: FLOOR_PRICES['ride:city:xl'].oursThb,
  table: 500,
} as const
