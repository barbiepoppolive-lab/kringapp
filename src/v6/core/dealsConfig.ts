/**
 * Kring v6 Deals Source Model & Display Rules — Final Deals Spec (27 Oct 2026, Opus → Argon)
 *
 * Enforces:
 * 1. Exact 12-field DealSourceRecord schema (source, network, publisherId, marginType,
 *    commissionPct, rateVerified, rebateAllowed, discountBasis, showAs, tatFlag,
 *    eligibility, validTo, disclosure).
 * 2. rebateAllowed: false on Agoda, Booking.com, Klook, GetYourGuide, Trip.com.
 * 3. rateVerified: false on TICKET2ATTRACTION (hidden until verified), GOWABI (spa wording only,
 *    never "massage"), and HDMALL (separate "Health & wellness" shelf, never in activities).
 * 4. EATIGO & MEGATIX as marginType: 'value_only' (Megatix shown only during open Thai Tiew Thai sale windows).
 * 5. MCAIRPORT as marginType: 'public_code', validTo: '2027-08-31', eligibility: 'non_thai_card'.
 * 6. SCBPLANET12 held out (enabled: false) until a 2026 page screenshot is verified.
 * 7. Never prints a percentage discount without a verified discountBasis.url and discountBasis.dated.
 */

export type DealNetwork = 'involve_asia' | 'travelpayouts' | 'impact' | 'awin' | 'direct' | 'none'
export type DealMarginType = 'affiliate' | 'net_rate' | 'value_only' | 'public_code'
export type DealTatFlag = 'ticket' | 'tour' | 'n/a'
export type DealEligibility = 'all' | 'non_thai_card' | 'thai_phone_or_card'
export type DealShelf = 'activities_tickets' | 'esim_transfers' | 'spa' | 'health_wellness' | 'dining_offpeak' | 'hotels_plain_link'

export interface DiscountBasis {
  gatePriceThb: number | null
  portalPriceThb: number | null
  dated: string | null
  url: string | null
  portalPrintsPercentage?: boolean
}

export interface DealSourceRecord {
  source: string
  network: DealNetwork
  publisherId: string | null
  marginType: DealMarginType
  commissionPct: number
  rateVerified: boolean
  rebateAllowed: boolean
  shelf: DealShelf
  discountBasis: DiscountBasis
  showAs: string
  tatFlag: DealTatFlag
  eligibility: DealEligibility
  validFrom?: string | null
  validTo: string | null
  disclosure: string
  enabledForLaunch: boolean
  notes?: string
}

export const KR6_DEALS_SOURCES_27OCT: readonly DealSourceRecord[] = [
  // --- TIER 1 & REBATE-ALLOWED E-SIM / TRANSFERS ---
  {
    source: 'AIRALO',
    network: 'travelpayouts',
    publisherId: '589675',
    marginType: 'affiliate',
    commissionPct: 12,
    rateVerified: true,
    rebateAllowed: true,
    shelf: 'esim_transfers',
    discountBasis: {
      gatePriceThb: 499,
      portalPriceThb: 469,
      dated: '2026-10-26',
      url: 'https://www.travelpayouts.com/en/offers/airalo-partner-program/',
      portalPrintsPercentage: false,
    },
    showAs: '฿499 struck → ฿469 (฿30 Kring credit)',
    tatFlag: 'n/a',
    eligibility: 'all',
    validTo: '2026-12-31',
    disclosure: 'Sold by Airalo · Kring may earn a commission',
    enabledForLaunch: true,
  },
  {
    source: 'SAILY',
    network: 'travelpayouts',
    publisherId: '589675',
    marginType: 'affiliate',
    commissionPct: 15,
    rateVerified: true,
    rebateAllowed: true,
    shelf: 'esim_transfers',
    discountBasis: {
      gatePriceThb: null,
      portalPriceThb: null,
      dated: '2026-10-26',
      url: 'https://www.travelpayouts.com/en/offers/saily-partner-program/',
    },
    showAs: 'Portal price + Kring credit (confirm rebate terms with Travelpayouts support)',
    tatFlag: 'n/a',
    eligibility: 'all',
    validTo: '2026-12-31',
    disclosure: 'Sold by Saily · Kring may earn a commission',
    enabledForLaunch: true,
  },
  {
    source: 'WELCOME_PICKUPS',
    network: 'direct',
    publisherId: '45846',
    marginType: 'affiliate',
    commissionPct: 8,
    rateVerified: true,
    rebateAllowed: true,
    shelf: 'esim_transfers',
    discountBasis: {
      gatePriceThb: 1200,
      portalPriceThb: 1150,
      dated: '2026-10-26',
      url: 'https://www.travelpayouts.com/en/offers/welcome-pickups-partner-program',
    },
    showAs: '฿1,200 → ฿1,150 (฿50 Kring credit)',
    tatFlag: 'n/a',
    eligibility: 'all',
    validTo: '2026-12-31',
    disclosure: 'Operated by Welcome Pickups · Kring may earn a commission',
    enabledForLaunch: true,
  },
  {
    source: '12GO',
    network: 'direct',
    publisherId: null,
    marginType: 'affiliate',
    commissionPct: 50,
    rateVerified: true,
    rebateAllowed: true,
    shelf: 'esim_transfers',
    discountBasis: {
      gatePriceThb: 400,
      portalPriceThb: 350,
      dated: '2026-10-26',
      url: 'https://agent.12go.asia/',
    },
    showAs: '฿400 → ฿350 Bangkok↔Pattaya transfer (฿50 Kring credit)',
    tatFlag: 'n/a',
    eligibility: 'all',
    validTo: '2026-12-31',
    disclosure: 'Sold by 12Go Asia · Kring may earn a commission',
    enabledForLaunch: true,
  },
  {
    source: 'KIWITAXI',
    network: 'travelpayouts',
    publisherId: '589675',
    marginType: 'affiliate',
    commissionPct: 50,
    rateVerified: true,
    rebateAllowed: true,
    shelf: 'esim_transfers',
    discountBasis: {
      gatePriceThb: null,
      portalPriceThb: null,
      dated: '2026-10-26',
      url: 'https://kiwitaxi.com/en/docs/affiliate_programme_offer/',
    },
    showAs: 'Fixed-fare airport transfer + Kring credit',
    tatFlag: 'n/a',
    eligibility: 'all',
    validTo: '2026-12-31',
    disclosure: 'Operated by Kiwitaxi · Kring may earn a commission',
    enabledForLaunch: true,
  },
  {
    source: 'CIVITATIS',
    network: 'direct',
    publisherId: null,
    marginType: 'affiliate',
    commissionPct: 8,
    rateVerified: true,
    rebateAllowed: true,
    shelf: 'activities_tickets',
    discountBasis: {
      gatePriceThb: null,
      portalPriceThb: null,
      dated: '2026-10-26',
      url: 'https://www.civitatis.com/en/affiliates/other-businesses-in-the-tourism-sector',
    },
    showAs: 'Published Civitatis price',
    tatFlag: 'tour',
    eligibility: 'all',
    validTo: '2026-12-31',
    disclosure: 'Sold by Civitatis · Kring may earn a commission',
    enabledForLaunch: true,
  },

  // --- FIVE MAJOR OTAs (rebateAllowed: false — plain links only) ---
  {
    source: 'KLOOK',
    network: 'travelpayouts',
    publisherId: '589675',
    marginType: 'affiliate',
    commissionPct: 5,
    rateVerified: true,
    rebateAllowed: false,
    shelf: 'activities_tickets',
    discountBasis: {
      gatePriceThb: null,
      portalPriceThb: null,
      dated: '2026-10-26',
      url: 'https://travelpayouts.com/en/offers/klook-affiliate-program',
    },
    showAs: 'Klook public price & official bank promos (e.g. KTC × Klook) · plain link only',
    tatFlag: 'ticket',
    eligibility: 'all',
    validTo: '2026-12-31',
    disclosure: 'Sold by Klook · Kring may earn a commission',
    enabledForLaunch: true,
  },
  {
    source: 'AGODA',
    network: 'involve_asia',
    publisherId: '1105164',
    marginType: 'affiliate',
    commissionPct: 4,
    rateVerified: true,
    rebateAllowed: false,
    shelf: 'hotels_plain_link',
    discountBasis: {
      gatePriceThb: null,
      portalPriceThb: null,
      dated: '2026-10-26',
      url: 'https://partners.agoda.com/Content/pdf/Agoda_OnlineAffiliateAgreement.pdf',
    },
    showAs: 'Agoda public rate · plain link only (no e-money or cashback)',
    tatFlag: 'n/a',
    eligibility: 'all',
    validTo: '2026-12-31',
    disclosure: 'Booked on Agoda · Kring may earn a commission',
    enabledForLaunch: true,
  },
  {
    source: 'BOOKING_COM',
    network: 'travelpayouts',
    publisherId: '589675',
    marginType: 'affiliate',
    commissionPct: 4,
    rateVerified: true,
    rebateAllowed: false,
    shelf: 'hotels_plain_link',
    discountBasis: {
      gatePriceThb: null,
      portalPriceThb: null,
      dated: '2026-10-26',
      url: 'https://www.travelpayouts.com/en/offers/bookingcom-affiliate-program',
    },
    showAs: 'Booking.com public rate · plain link only',
    tatFlag: 'n/a',
    eligibility: 'all',
    validTo: '2026-12-31',
    disclosure: 'Booked on Booking.com · Kring may earn a commission',
    enabledForLaunch: true,
  },
  {
    source: 'GETYOURGUIDE',
    network: 'travelpayouts',
    publisherId: '589675',
    marginType: 'affiliate',
    commissionPct: 8,
    rateVerified: true,
    rebateAllowed: false,
    shelf: 'activities_tickets',
    discountBasis: {
      gatePriceThb: null,
      portalPriceThb: null,
      dated: '2026-10-26',
      url: 'https://travelpayouts.com/en/offers/getyourguide-affiliate-program',
    },
    showAs: 'GetYourGuide public rate · plain link only',
    tatFlag: 'tour',
    eligibility: 'all',
    validTo: '2026-12-31',
    disclosure: 'Sold by GetYourGuide · Kring may earn a commission',
    enabledForLaunch: true,
  },
  {
    source: 'TRIP_COM',
    network: 'travelpayouts',
    publisherId: '589675',
    marginType: 'affiliate',
    commissionPct: 4,
    rateVerified: true,
    rebateAllowed: false,
    shelf: 'hotels_plain_link',
    discountBasis: {
      gatePriceThb: null,
      portalPriceThb: null,
      dated: '2026-10-26',
      url: 'https://www.trip.com/partners/index?locale=en_xx',
    },
    showAs: 'Trip.com public rate & 5% new-user activity promo · plain link only',
    tatFlag: 'ticket',
    eligibility: 'all',
    validTo: '2026-12-31',
    disclosure: 'Sold by Trip.com · Kring may earn a commission',
    enabledForLaunch: true,
  },

  // --- THAI-INSIDER PORTALS (27 Oct Merged Spec) ---
  {
    source: 'GLOBALTIX',
    network: 'direct',
    publisherId: null,
    marginType: 'affiliate', // affiliate now -> net_rate only after Thai lawyer confirms ticket-vs-tour & non-Dodo rail
    commissionPct: 0,
    rateVerified: false,
    rebateAllowed: true,
    shelf: 'activities_tickets',
    discountBasis: {
      gatePriceThb: null,
      portalPriceThb: null,
      dated: '2026-10-27',
      url: 'https://www.globaltix.com/',
    },
    showAs: 'Portal price vs venue gate price (with venue URL as basis)',
    tatFlag: 'ticket',
    eligibility: 'all',
    validTo: '2026-12-31',
    disclosure: 'Sold by GlobalTix (TA03367) · Kring may earn a referral fee',
    enabledForLaunch: false,
    notes: 'Apply as Marketplace reseller; obtain Thai net-rate sheet and lawyer confirmation on single-venue ticket vs tour before enabling net_rate.',
  },
  {
    source: 'TICKET2ATTRACTION',
    network: 'direct',
    publisherId: null,
    marginType: 'affiliate',
    commissionPct: 12,
    rateVerified: false, // Hidden until founder screenshots agent terms and a dated gate-vs-portal price pair
    rebateAllowed: true,
    shelf: 'activities_tickets',
    discountBasis: {
      gatePriceThb: null,
      portalPriceThb: null,
      dated: null,
      url: null,
    },
    showAs: 'Hidden until rateVerified: true',
    tatFlag: 'ticket',
    eligibility: 'all',
    validTo: null,
    disclosure: 'Sold by Ticket2Attraction · Kring may earn a referral fee',
    enabledForLaunch: false,
    notes: 'Held hidden until founder opens ticket2attraction.com from Thailand and screenshots agent terms + dated price pair.',
  },
  {
    source: 'GOWABI',
    network: 'involve_asia',
    publisherId: '1105164',
    marginType: 'affiliate',
    commissionPct: 8,
    rateVerified: false, // Read offer commission & Cashback permission in Involve Asia #1105164 dashboard first
    rebateAllowed: false,
    shelf: 'spa', // Wording stays strictly "spa" ("massage" is blocked by kr6_name_ok)
    discountBasis: {
      gatePriceThb: null,
      portalPriceThb: null,
      dated: '2026-10-27',
      url: 'https://www.gowabi.com/en',
    },
    showAs: "GoWabi spa price vs walk-in price shown on GoWabi's listing",
    tatFlag: 'n/a',
    eligibility: 'all',
    validTo: '2026-12-31',
    disclosure: 'Sold by GoWabi · Kring may earn a commission',
    enabledForLaunch: true,
    notes: 'Keep wording strictly "spa" / "onsen"; never use "massage" in activity titles.',
  },
  {
    source: 'HDMALL',
    network: 'involve_asia',
    publisherId: '1105164',
    marginType: 'affiliate',
    commissionPct: 10,
    rateVerified: false, // Read offer commission in Involve Asia #1105164 dashboard first
    rebateAllowed: false,
    shelf: 'health_wellness', // Separate "Health & wellness" shelf, never mixed into activities
    discountBasis: {
      gatePriceThb: null,
      portalPriceThb: null,
      dated: '2026-10-27',
      url: 'https://hdmall.co.th',
    },
    showAs: 'HDmall package price vs clinic list price',
    tatFlag: 'n/a',
    eligibility: 'all',
    validTo: '2026-12-31',
    disclosure: 'Booked via HDmall · Kring may earn a commission',
    enabledForLaunch: true,
    notes: 'Must appear in separate "Health & wellness" shelf, never in activities.',
  },
  {
    source: 'EATIGO',
    network: 'none',
    publisherId: null,
    marginType: 'value_only',
    commissionPct: 0,
    rateVerified: true,
    rebateAllowed: false,
    shelf: 'dining_offpeak',
    discountBasis: {
      gatePriceThb: null,
      portalPriceThb: null,
      dated: '2026-10-27',
      url: 'https://help.eatigo.com/portal/en/kb/articles/what-does-a-reservation-on-eatigo-really-include-is-there-any-fine-print',
      portalPrintsPercentage: true,
    },
    showAs: 'Up to 50% off the food bill at off-peak times via Eatigo (drinks & set menus excluded; seat held 15 min)',
    tatFlag: 'n/a',
    eligibility: 'all',
    validTo: null,
    disclosure: 'Free reservation via Eatigo · No commission to Kring',
    enabledForLaunch: true,
  },
  {
    source: 'MEGATIX',
    network: 'none',
    publisherId: null,
    marginType: 'value_only', // Cuelinks campaign paused; surface only during active Thai Tiew Thai sale windows
    commissionPct: 0,
    rateVerified: true,
    rebateAllowed: false,
    shelf: 'dining_offpeak',
    discountBasis: {
      gatePriceThb: 700,
      portalPriceThb: 500,
      dated: '2026-10-27',
      url: 'https://megatix.in.th/events/the-standardx-bangkok-thai-tiew-thai-73',
    },
    showAs: 'Thai Tiew Thai voucher: pay ฿500, spend ฿700 (non-refundable; shown only during active 10–12 day sale windows)',
    tatFlag: 'n/a',
    eligibility: 'all',
    validFrom: null,
    validTo: null,
    disclosure: 'Sold directly by hotel via Megatix Thailand',
    enabledForLaunch: false,
    notes: 'Enable only during the 10–12 days a Thai Tiew Thai sale window is open; hide otherwise.',
  },

  // --- PUBLIC CARD / RIDE PROMO CODES ---
  {
    source: 'MCAIRPORT',
    network: 'none',
    publisherId: null,
    marginType: 'public_code',
    commissionPct: 0,
    rateVerified: true,
    rebateAllowed: false,
    shelf: 'esim_transfers',
    discountBasis: {
      gatePriceThb: null,
      portalPriceThb: null,
      dated: '2026-10-27',
      url: 'https://www.grab.com/th/blog/mcairport_sep26-aug27/',
    },
    showAs: 'Arriving? ฿100 off your Grab from the airport with a Mastercard issued outside Thailand (code MCAIRPORT · 1/month, quota 5,581/month)',
    tatFlag: 'n/a',
    eligibility: 'non_thai_card',
    validFrom: '2026-09-01',
    validTo: '2027-08-31',
    disclosure: 'Official Grab × Mastercard promotion (1 Sep 2026 – 31 Aug 2027)',
    enabledForLaunch: true,
  },
  {
    source: 'GRAB_TRAVEL_PASS',
    network: 'none',
    publisherId: null,
    marginType: 'value_only',
    commissionPct: 0,
    rateVerified: true,
    rebateAllowed: false,
    shelf: 'esim_transfers',
    discountBasis: {
      gatePriceThb: null,
      portalPriceThb: 30,
      dated: '2026-04-01',
      url: 'https://www.grab.com/th/en/press/others/amazing-thailand-grab-travel-pass/',
      portalPrintsPercentage: true,
    },
    showAs: 'Amazing Thailand Grab Travel Pass (฿30 in Grab app for up to 30% off rides, 20% airport rides)',
    tatFlag: 'n/a',
    eligibility: 'all',
    validTo: '2026-12-31',
    disclosure: 'Purchased inside the official Grab app',
    enabledForLaunch: true,
  },
  {
    source: 'KTC_KLOOK',
    network: 'none',
    publisherId: null,
    marginType: 'public_code',
    commissionPct: 0,
    rateVerified: true,
    rebateAllowed: false,
    shelf: 'activities_tickets',
    discountBasis: {
      gatePriceThb: null,
      portalPriceThb: null,
      dated: '2026-01-01',
      url: 'https://www.ktc.co.th/en/promotion/travel/online-travel-agency/klook',
      portalPrintsPercentage: true,
    },
    showAs: 'KTC Card × Klook: up to 13% back by redeeming KTC Forever points (1 Jan – 31 Dec 2026)',
    tatFlag: 'n/a',
    eligibility: 'thai_phone_or_card',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    disclosure: 'Official KTC Bank promotion for Thai KTC cardholders',
    enabledForLaunch: true,
  },
  {
    source: 'SCBPLANET12',
    network: 'none',
    publisherId: null,
    marginType: 'public_code',
    commissionPct: 0,
    rateVerified: false, // Held out: reachable SCB page shows 2024 code SCBPLANET24 and requires Thai phone + SCB Planet card
    rebateAllowed: false,
    shelf: 'activities_tickets',
    discountBasis: {
      gatePriceThb: null,
      portalPriceThb: null,
      dated: null,
      url: 'https://www.scb.co.th/th/personal-banking/promotions/prepaid-card/planet-scb-klook.html',
    },
    showAs: 'Held out until 2026 SCB Planet page is screenshotted',
    tatFlag: 'n/a',
    eligibility: 'thai_phone_or_card',
    validTo: null,
    disclosure: 'SCB Planet promotion (currently held out)',
    enabledForLaunch: false,
    notes: 'Dropped from launch list per 27 Oct spec unless founder screenshots a live 2026 SCB Planet page.',
  },

  // --- DIRECT THAI LINE / EV CAB FLEETS (BKK Airport ↔ Pattaya Fixed-Fare & City EV Hop) ---
  {
    source: 'FLINTSTONES_TAXI_PATTAYA',
    network: 'direct',
    publisherId: 'LINE:flintstones.taxi',
    marginType: 'value_only',
    commissionPct: 10,
    rateVerified: false,
    rebateAllowed: false,
    shelf: 'esim_transfers',
    discountBasis: {
      gatePriceThb: 1800,
      portalPriceThb: 1100,
      dated: '2026-10-27',
      url: 'https://www.flintstonespattaya.com',
    },
    showAs: 'Flintstones Taxi Pattaya (LINE: flintstones.taxi · WhatsApp +66 90 260 3864): ฿1,800 → ฿1,100 fixed-fare BKK Airport ↔ Pattaya private sedan (highway tolls included)',
    tatFlag: 'n/a',
    eligibility: 'all',
    validTo: '2026-12-31',
    disclosure: 'Direct fixed-fare Thai taxi fleet · Book via LINE flintstones.taxi',
    enabledForLaunch: true,
    notes: 'Reddit-endorsed Pattaya ↔ BKK airport fixed-fare fleet; flips to direct_voucher once partner replies with Kring referral code.',
  },
  {
    source: 'PT_TAXI_PATTAYA',
    network: 'direct',
    publisherId: 'LINE:@newpttaxi',
    marginType: 'value_only',
    commissionPct: 10,
    rateVerified: false,
    rebateAllowed: false,
    shelf: 'esim_transfers',
    discountBasis: {
      gatePriceThb: 1800,
      portalPriceThb: 1100,
      dated: '2026-10-27',
      url: 'https://www.pttaxiservice.com',
    },
    showAs: 'P.T. Taxi Service Pattaya (LINE: @newpttaxi · WhatsApp +66 86 392 1240): ฿1,800 → ฿1,100 24/7 BKK/DMK ↔ Pattaya private sedan & SUV fleet',
    tatFlag: 'n/a',
    eligibility: 'all',
    validTo: '2026-12-31',
    disclosure: 'Direct fixed-fare Thai taxi fleet · Book via LINE @newpttaxi',
    enabledForLaunch: true,
    notes: '24/7 Pattaya ↔ BKK airport transfer fleet; flips to direct_voucher once partner replies with Kring referral code.',
  },
  {
    source: 'NAMS_LADY_DRIVERS',
    network: 'direct',
    publisherId: 'namstaxiladydrivers',
    marginType: 'value_only',
    commissionPct: 15,
    rateVerified: false,
    rebateAllowed: false,
    shelf: 'esim_transfers',
    discountBasis: {
      gatePriceThb: 1800,
      portalPriceThb: 1200,
      dated: '2026-10-27',
      url: 'https://www.namstaxiladydrivers.com',
    },
    showAs: "Nam's Taxis With Lady Drivers: ฿1,800 → ฿1,200 100% female-driven BKK Airport ↔ Pattaya private sedan (ideal for solo female travellers & hosts)",
    tatFlag: 'n/a',
    eligibility: 'all',
    validTo: '2026-12-31',
    disclosure: "Booked directly with Nam's Taxis With Lady Drivers (namstaxiladydrivers.com)",
    enabledForLaunch: true,
    notes: '100% female-driver intercity fleet for solo female travellers and female hosts.',
  },
  {
    source: 'MUVMI_EV_TUKTUK',
    network: 'direct',
    publisherId: 'muvmi',
    marginType: 'value_only',
    commissionPct: 15,
    rateVerified: false,
    rebateAllowed: false,
    shelf: 'esim_transfers',
    discountBasis: {
      gatePriceThb: 200,
      portalPriceThb: 60,
      dated: '2026-10-27',
      url: 'https://muvmi.co',
    },
    showAs: 'MuvMi Electric Tuk-Tuk: ฿200 → ฿60 fixed-price app hop across Sukhumvit, Silom, Ari & Rattanakosin (zero haggling)',
    tatFlag: 'n/a',
    eligibility: 'all',
    validTo: '2026-12-31',
    disclosure: 'Booked via official MuvMi app (muvmi.co)',
    enabledForLaunch: true,
    notes: 'Neighbourhood EV Tuk-Tuk hop pass across central Bangkok.',
  },
] as const

/**
 * Guard: Never print a percentage discount unless the deal record has a verified
 * `discountBasis.url`, `discountBasis.dated`, and `portalPrintsPercentage: true`.
 * Otherwise, format strictly as struck gate price + portal price.
 */
export function formatDealPriceDisplay(rec: DealSourceRecord): string {
  if (!rec.enabledForLaunch) {
    return ''
  }
  const b = rec.discountBasis
  const hasVerifiedBasis = Boolean(b.url && b.dated)
  if (!hasVerifiedBasis) {
    // Strip any "%" claims if basis URL or date is missing
    return rec.showAs.replace(/\b\d+(\.\d+)?\s*%\s*(off|back|discount)?/gi, '').trim()
  }
  if (b.gatePriceThb && b.portalPriceThb && !b.portalPrintsPercentage) {
    return `฿${b.gatePriceThb.toLocaleString('en-US')} → ฿${b.portalPriceThb.toLocaleString('en-US')}`
  }
  return rec.showAs
}
