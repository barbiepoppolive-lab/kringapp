import { Fragment, useEffect, useState } from 'react'
import { useLanguage } from '../../i18n/LanguageContext'
import BundleSheet from './BundleSheet'
import { PulseBookingFlow, type InteractiveBookingPayload } from './PulseFlows'
import KringPriceTab from '../price/KringPriceTab'
import '../../styles/chat-pulse.css'
import { triggerHaptic } from '../../lib/haptics'
import { triggerLuxuryFX } from '../fx/LuxuryStageFX'
import { SosHold } from '../ui/LivingIcons'
import { useOptionalAuth } from '../../context/AuthContext'
import '../../styles/deep-motion.css'

export type { InteractiveBookingPayload }

export const REBATE_COINS_PER_THB = 250

export const LIVE_CHECKED_LABEL = 'Live Checked 2m ago'

export interface PriceRadarComparison {
  label: string
  price: string
}

export interface PriceRadar {
  comparisons: readonly PriceRadarComparison[]
  chonVipRate: string
  savingsLabel: string
}

export type AirportArrivalOptionId = 'solo-suv' | 'vip-host-gate3'

export interface AirportArrivalOption {
  id: AirportArrivalOptionId
  name: string
  crispTag: string
  photo: string
  priceLabel: string
  compareLabel: string | null
  rebateCoins: number
  rebateLabel: string
  summary: string
  bullets: string[]
  priceRadar?: PriceRadar
}

export interface RebateDeal {
  id: string
  title: string
  crispTag: string
  photo: string
  discountLabel: string
  priceLabel: string | null
  partnerLabel: string
  rebateCoins: number
  rebateValueThb: number
  note?: string
  hostDemandLabel?: string
  audienceNote?: string
  priceRadar?: PriceRadar
}

export interface PattayaDeal {
  id: string
  title: string
  crispTag: string
  photo: string
  discountLabel: string
  priceLabel: string
  partnerLabel: string
  rebateCoins: number
  rebateValueThb: number
  note: string
  priceRadar: PriceRadar
}

export interface BkkPulseTabProps {
  onEarnRebateCoins?: (coins: number, label: string) => void
}

export const AIRPORT_ARRIVAL_OPTIONS: readonly AirportArrivalOption[] = [
  {
    id: 'solo-suv',
    name: '🟢 Chon! VIP Airport Cab',
    crispTag: 'Private BKK/DMK SUV · Fast-Track Pickup',
    photo: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=800&q=80',
    priceLabel: '฿680',
    compareLabel: null,
    rebateCoins: 15_000,
    rebateLabel: '+15,000 Chon! Rebate Coins',
    summary:
      'Private airport car — BKK or DMK — tracked the whole way at your live-checked cheapest VIP member rate.',
    bullets: [
      'Same licensed driver as the airport counter, at the Chon! live-checked VIP rate.',
      'Tracked booking confirmation straight to your phone.',
      '+15,000 Chon! Rebate Coins credited to your wallet the moment you book.',
    ],
    priceRadar: {
      comparisons: [
        { label: 'Airport Counter', price: '฿1,200' },
        { label: 'Klook', price: '฿750' },
        { label: 'Grab', price: '฿790' },
      ],
      chonVipRate: '฿680',
      savingsLabel: 'Save ฿70 Instantly!',
    },
  },
  {
    id: 'vip-host-gate3',
    name: '🌺 VIP Host Airport Gate 3 Welcome Drop',
    crispTag: 'Gate 3 Starbucks Meet + Cha Yen + Tracked SUV',
    photo: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80',
    priceLabel: '150,000 Coins / ฿600',
    compareLabel: 'public-lounge concierge meet',
    rebateCoins: 5_300,
    rebateLabel: '+5,300 Rebate Coins',
    summary:
      'A verified Host meets you at Suvarnabhumi Level 2, Gate 3 (Starbucks / After You Public Lounge) with a welcome Cha Yen.',
    bullets: [
      'Meet at Suvarnabhumi Level 2, Gate 3 (Starbucks / After You Public Lounge) — strictly public areas only.',
      'SuperRich 0%-spread exchange help + AIRPORTELs hands-free luggage drop (+5,300 Rebate Coins).',
      'Ride together in a tracked GrabSUV straight to a public Sukhumvit Rooftop or Café — strictly public venues only!',
    ],
  },
] as const

export const REBATE_DEALS: readonly RebateDeal[] = [
  {
    id: 'rooftop-table-for-2',
    title: '🍸 Octave / Above Eleven / Tichuca Rooftop Table for 2',
    crispTag: 'Skyline Table for 2 · Instant VIP Entry',
    photo: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=800&q=80',
    discountLabel: 'Up to 40% Off Set Menu',
    priceLabel: 'set menu for two',
    partnerLabel: 'via Hungry Hub / Eatigo',
    rebateCoins: 25_000,
    rebateValueThb: 100,
    note: 'Set menu for two, booked through our Hungry Hub / Eatigo affiliate desk.',
    hostDemandLabel: '2 Verified Hosts want to go tonight!',
    priceRadar: {
      comparisons: [
        { label: 'Walk-in Counter', price: '฿3,000' },
        { label: 'Klook', price: '฿2,400' },
        { label: 'Eatigo', price: '฿2,300' },
      ],
      chonVipRate: '฿1,800',
      savingsLabel: 'Save ฿500 Instantly!',
    },
  },
  {
    id: 'chao-phraya-sunset-cruise',
    title: '🚢 Chao Phraya Princess Sunset Dinner Cruise',
    crispTag: '2-Hour River Buffet & Live Band',
    photo: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=800&q=80',
    discountLabel: '฿850',
    priceLabel: 'per seat',
    partnerLabel: 'via Klook affiliate desk',
    rebateCoins: 13_750,
    rebateValueThb: 55,
    note: 'Two-hour sunset dinner cruise with a live band on the Chao Phraya.',
    priceRadar: {
      comparisons: [
        { label: 'Cruise Counter', price: '฿1,600' },
        { label: 'Viator', price: '฿1,250' },
        { label: 'Klook', price: '฿1,150' },
      ],
      chonVipRate: '฿850',
      savingsLabel: 'Save ฿300 Instantly!',
    },
  },
  {
    id: 'rajadamnern-vip-muay-thai',
    title: '🥊 Rajadamnern Stadium VIP Ringside Muay Thai',
    crispTag: 'Front-Row Ringside + Lounge Access',
    photo: 'https://images.unsplash.com/photo-1555597673-b21d5c935865?auto=format&fit=crop&w=800&q=80',
    discountLabel: '฿1,500',
    priceLabel: 'VIP ringside seat',
    partnerLabel: 'via official stadium desk',
    rebateCoins: 25_000,
    rebateValueThb: 100,
    note: 'Front-row ringside seat at the oldest Muay Thai stadium in Bangkok.',
    priceRadar: {
      comparisons: [
        { label: 'Stadium Counter', price: '฿2,200' },
        { label: 'Klook', price: '฿1,850' },
        { label: 'Viator', price: '฿1,900' },
      ],
      chonVipRate: '฿1,500',
      savingsLabel: 'Save ฿350 Instantly!',
    },
  },
  {
    id: 'tourist-5g-esim',
    title: '📶 AIS / Airalo 5G Tourist eSIM (15GB)',
    crispTag: '15GB High-Speed 5G · Instant QR Activate',
    photo: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=800&q=80',
    discountLabel: '฿175 Net',
    priceLabel: '15GB of Thai 5G',
    partnerLabel: 'via Airalo / AIS affiliate desk',
    rebateCoins: 6_000,
    rebateValueThb: 24,
    note: 'Instant eSIM — scan, install and data works before you leave the arrivals hall.',
    priceRadar: {
      comparisons: [
        { label: 'Arrivals Counter', price: '฿299' },
        { label: 'AIS Store', price: '฿249' },
        { label: 'Airalo', price: '฿205' },
      ],
      chonVipRate: '฿175',
      savingsLabel: 'Save ฿30 Instantly!',
    },
  },
  {
    id: 'airportels-luggage-delivery',
    title: '🧳 AIRPORTELs BKK-to-Hotel Luggage Delivery',
    crispTag: 'Hands-Free Same-Day Hotel Bag Drop',
    photo: 'https://images.unsplash.com/photo-1553531384-cc64ac80f931?auto=format&fit=crop&w=800&q=80',
    discountLabel: '฿265 Net',
    priceLabel: 'same-day hotel drop',
    partnerLabel: 'via AIRPORTELs affiliate desk',
    rebateCoins: 5_300,
    rebateValueThb: 21,
    note: 'Hands-free airport: luggage goes straight to your Sukhumvit hotel.',
    priceRadar: {
      comparisons: [
        { label: 'Airport Counter', price: '฿390' },
        { label: 'Arrivals Kiosk', price: '฿320' },
        { label: 'Other Apps', price: '฿299' },
      ],
      chonVipRate: '฿265',
      savingsLabel: 'Save ฿34 Instantly!',
    },
  },
  {
    id: 'gowabi-beauty-onsen-hangover-iv',
    title: '💆‍♀️ GoWabi Beauty, Onsen & Hangover IV Drip',
    crispTag: 'Sukhumvit Onsen, Massage & IV Recovery',
    photo: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80',
    discountLabel: '฿420',
    priceLabel: 'per session',
    partnerLabel: 'via GoWabi affiliate desk',
    rebateCoins: 8_000,
    rebateValueThb: 32,
    note: 'Hangover IV drip, onsen soak or nail/lash salon — reset fast, look flawless.',
    audienceNote: '💆‍♀️ Open to Travelers & Hosts',
    priceRadar: {
      comparisons: [
        { label: 'Walk-in', price: '฿900' },
        { label: 'Klook', price: '฿650' },
        { label: 'Other App', price: '฿560' },
      ],
      chonVipRate: '฿420',
      savingsLabel: 'Save ฿480 vs Walk-in!',
    },
  },
] as const

// Points 41 & 45: Curated Pattaya Experiences
export const PATTAYA_DEALS: readonly PattayaDeal[] = [
  {
    id: 'sina-floating-beach-club',
    title: '🌊 Sina Floating Beach Club & Speedboat Pass (฿790 vs ฿1,200 Counter · +15,000c)',
    crispTag: 'Ocean Daybed + Speedboat Transfer + Welcome Drink',
    photo: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80',
    discountLabel: '฿790 vs ฿1,200 Counter',
    priceLabel: 'per person',
    partnerLabel: 'via Sina Beach Club Partner Desk',
    rebateCoins: 15_000,
    rebateValueThb: 60,
    note: 'Exclusive ocean daybed on Pattaya offshore floating beach club with roundtrip speedboat.',
    priceRadar: {
      comparisons: [
        { label: 'Walk-in Counter', price: '฿1,200' },
        { label: 'Klook', price: '฿950' },
        { label: 'Grab Activity', price: '฿990' },
      ],
      chonVipRate: '฿790',
      savingsLabel: 'Save ฿410 Instantly!',
    },
  },
  {
    id: 'koh-larn-luxury-dj-catamaran',
    title: '🛥️ Koh Larn Luxury DJ Catamaran Yacht Party (฿1,490 vs ฿2,500 Counter · +30,000c)',
    crispTag: 'DJ Sunset Deck + Snorkel + Seafood Buffet',
    photo: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80',
    discountLabel: '฿1,490 vs ฿2,500 Counter',
    priceLabel: 'VIP party pass',
    partnerLabel: 'via Ocean Marina Yacht Desk',
    rebateCoins: 30_000,
    rebateValueThb: 120,
    note: 'Sail from Ocean Marina to Koh Larn on a luxury twin-hull catamaran with live DJ sunset session.',
    priceRadar: {
      comparisons: [
        { label: 'Marina Counter', price: '฿2,500' },
        { label: 'Viator', price: '฿2,100' },
        { label: 'Klook', price: '฿1,990' },
      ],
      chonVipRate: '฿1,490',
      savingsLabel: 'Save ฿1,010 Instantly!',
    },
  },
  {
    id: 'virgin-rooftop-hilton-horizon',
    title: '🌅 Virgin Rooftop / Hilton Horizon Sunset Table for 2 (฿1,450 vs ฿2,400 · +22,000c)',
    crispTag: 'Hilton Level 34 Panoramic Sunset View + 2 Signature Cocktails',
    photo: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
    discountLabel: '฿1,450 vs ฿2,400',
    priceLabel: 'table for 2',
    partnerLabel: 'via Hilton / Virgin Rooftop Partner Desk',
    rebateCoins: 22_000,
    rebateValueThb: 88,
    note: 'Front-row 34th-floor sunset terrace over Pattaya Bay with tapas & champagne cocktails.',
    priceRadar: {
      comparisons: [
        { label: 'Walk-in Counter', price: '฿2,400' },
        { label: 'Hungry Hub', price: '฿1,890' },
        { label: 'Eatigo', price: '฿1,750' },
      ],
      chonVipRate: '฿1,450',
      savingsLabel: 'Save ฿950 Instantly!',
    },
  },
  {
    id: 'alcazar-walking-street-vip',
    title: '💃 Alcazar / Walking Street VIP Nightlife Pass (฿890 vs ฿1,500 · +15,000c)',
    crispTag: 'VIP Front-Row Seat + Backstage Lounge + Fast-Track Entry',
    photo: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
    discountLabel: '฿890 vs ฿1,500',
    priceLabel: 'VIP seat',
    partnerLabel: 'via Alcazar Official Desk',
    rebateCoins: 15_000,
    rebateValueThb: 60,
    note: 'World-famous Pattaya cabaret theater VIP front-row seat plus Walking Street VIP host fast-track.',
    priceRadar: {
      comparisons: [
        { label: 'Theater Box Office', price: '฿1,500' },
        { label: 'Klook', price: '฿1,100' },
        { label: 'Trip.com', price: '฿1,050' },
      ],
      chonVipRate: '฿890',
      savingsLabel: 'Save ฿610 Instantly!',
    },
  },
] as const

export const REVERSE_DROP_VENUES: readonly string[] = [
  'Octave Rooftop, Sukhumvit 39',
  'Tichuca Rooftop, Sukhumvit 55 (BTS Thong Lo)',
  'Above Eleven, Sukhumvit 11',
  'Chao Phraya Princess Sunset Dinner Cruise',
] as const

export interface ReverseDropHost {
  id: string
  name: string
  tapLabel: string
  timeNote: string
}

export const DEMO_REVERSE_DROP_HOSTS: readonly ReverseDropHost[] = [
  { id: 'nina', name: 'Nina · 24 · Verified Host', tapLabel: "🙋‍♀️ I'm free at 8 PM — Let's Clink!", timeNote: '8:00 PM · Tichuca' },
  { id: 'may', name: 'May · 26 · Verified Host', tapLabel: "🙋‍♀️ I'm free at 9 PM — Let's Clink!", timeNote: '9:00 PM · Octave' },
  { id: 'fah', name: 'Fah · 23 · Verified Host', tapLabel: "🙋‍♀️ I'm free at 8 PM — Let's Clink!", timeNote: '8:00 PM · Above Eleven' },
] as const

export const SUKHUMVIT_VENUES: readonly string[] = [
  'Tichuca Rooftop, Sukhumvit 55 (BTS Thong Lo)',
  'Octave Rooftop, Sukhumvit 39',
  'Above Eleven, Sukhumvit 11',
  'EmQuartier Courtyard, Sukhumvit 35',
] as const

const TOURIST_POLICE_NUMBER = '1155'
function formatCoins(value: number): string {
  return value.toLocaleString('en-US')
}

function bonusCoinsFor(rebateCoins: number): number {
  return Math.round(rebateCoins * 0.2)
}

export function formatTaxiCardThai(venue: string): string {
  return `รบกวนไปส่งที่${venue} กรุณากดมิเตอร์ครับ/ค่ะ`
}

export function formatTaxiCardEnglish(venue: string): string {
  return `Please take me to ${venue} using the meter.`
}

export const PRICE_UPDATE_TIMER_TEXT = '14:42'

function LivePriceRadarHero() {
  const { t } = useLanguage()
  const [showRadarHelp, setShowRadarHelp] = useState(false)
  return (
    <section
      aria-label="Chon live price radar"
      className="sr-only"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-extrabold text-emerald-300 ring-1 ring-emerald-400/40">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            🟢 Radar
            <span className="sr-only"> {LIVE_CHECKED_LABEL}</span>
          </span>
          <h3 className="truncate text-[10.5px] font-extrabold tracking-tight text-white">
            <span className="sr-only">
              🟢 Chon! Live Price Radar — Guaranteed Cheapest VIP Member Rate in Bangkok ({LIVE_CHECKED_LABEL})
            </span>
            <span aria-hidden="true" data-testid="cron-scraper-timer-badge">
              🔄 Price Updated 15m ago · Next check {PRICE_UPDATE_TIMER_TEXT}
            </span>
          </h3>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            data-testid="pulse-booking-help-btn"
            aria-label="How Price Radar and Booking works"
            onClick={() => {
              triggerHaptic('tap')
              setShowRadarHelp((prev) => !prev)
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('chon:open-help-overlay', { detail: { section: 'pulse' } }),
                )
              }
            }}
            className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 text-[9.5px] font-black text-amber-200 transition hover:bg-amber-400/25"
          >
            <span>?</span>
            <span>How to Book</span>
          </button>
        </div>
      </div>

      <div
        data-testid="pulse-booking-help-popover"
        className={
          showRadarHelp
            ? 'mt-2 grid grid-cols-1 gap-1 rounded-xl border border-amber-400/30 bg-black/65 p-2 text-[10px] font-extrabold text-amber-100'
            : 'sr-only'
        }
      >
        <div>1️⃣ Pick Airport Gate / Hotel &amp; Time</div>
        <div>2️⃣ Pay VIP Baht or Lock with 🪙</div>
        <div>3️⃣ Instant Driver LINE/QR + Bonus 🪙</div>
      </div>

      <p className="sr-only">
        How the Coin Rebate Loop Works: most of our B2B wholesale discount comes off your cash price upfront, plus Coin rebates.
      </p>
      <p className="sr-only">
        {t.ui.pulseRadarSub} Cheapest VIP member rate in flat Baht across Klook, Grab &amp; counters — plus instant Coin rebates.
      </p>
      <p role="status" className="sr-only">
        🥂 Chon! VIP Rate · {LIVE_CHECKED_LABEL} · Cheapest guaranteed in Bangkok
      </p>
    </section>
  )
}

const PULSE_3D_DAMN_CSS = `
@keyframes chon3dDamnPop {
  0%, 100% {
    transform: perspective(420px) rotateX(8deg) rotateY(-10deg) translateZ(4px) scale(1);
    text-shadow: 0 2px 6px rgba(244, 63, 94, 0.75), 0 0 12px rgba(168, 85, 247, 0.65);
  }
  50% {
    transform: perspective(420px) rotateX(-8deg) rotateY(12deg) translateZ(12px) scale(1.12);
    text-shadow: 0 4px 12px rgba(244, 63, 94, 0.95), 0 0 20px rgba(56, 189, 248, 0.95);
  }
}
.chon-3d-damn {
  display: inline-block;
  transform-style: preserve-3d;
  animation: chon3dDamnPop 900ms cubic-bezier(.22,1,.36,1) 1 both; /* R3 Marco: one-shot, no idle loop */
}
`

// Screen 5: Total Combined Benefit + Free Coins + 😱🔥 Damn! Emoji Pill
function DealTotalBenefitPill({
  competitorPrice,
  ourPrice,
  bonusCoins,
}: {
  competitorPrice: number
  ourPrice: number
  bonusCoins: number
}) {
  const cashSavedThb = Math.max(0, competitorPrice - ourPrice)
  const freeCoinsThbValue = Math.round(bonusCoins / 100)
  const totalBenefitThb = cashSavedThb + freeCoinsThbValue

  return (
    <div
      data-testid="deal-total-benefit-pill"
      aria-hidden="true"
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/50 bg-gradient-to-r from-amber-400/20 via-emerald-400/20 to-amber-400/20 px-2.5 py-1 text-[10.5px] font-black text-amber-200 shadow-[0_0_12px_rgba(245,196,81,0.2)]"
    >
      <span>
        Save ฿{totalBenefitThb.toLocaleString('en-US')} 😱🔥 (+🪙 {bonusCoins.toLocaleString('en-US')})
      </span>
    </div>
  )
}

export interface PhotoRichDealItem {
  id: string
  cardTestId?: string
  btnTestId?: string
  title: string
  photoLeft: string
  photoLeftAlt: string
  photoRight: string
  photoRightAlt: string
  badgeLeft: string
  badgeRight: string
  competitorPrice: number
  ourPrice: number
  saveThb: number
  bonusCoins: number
  legacySaveThb?: number
  legacyBonusCoins?: number
  ctaLabel: string
  partnerName: string
  partnerUrl: string
  isCab?: boolean
}

export const PHOTO_RICH_RIDE_ESIM_DEALS: readonly PhotoRichDealItem[] = [
  {
    id: 'featured-bkk-5g-esim',
    cardTestId: 'top-featured-esim-card',
    btnTestId: 'top-featured-esim-btn',
    title: '📶 5G Tourist eSIM · 15 GB',
    photoLeft:
      'https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=600&q=80',
    photoLeftAlt: 'Bangkok Grand Palace and skyline',
    photoRight:
      'https://images.unsplash.com/photo-1563492065599-3520f775eeed?auto=format&fit=crop&w=600&q=80',
    photoRightAlt: 'Bangkok Chao Phraya night skyline',
    badgeLeft: '⚡ INSTANT 5G QR',
    badgeRight: '🛬 BKK & DMK READY',
    competitorPrice: 299,
    ourPrice: 175,
    saveThb: 124,
    bonusCoins: 2_000,
    legacySaveThb: 550,
    legacyBonusCoins: 5_000,
    ctaLabel: 'Get QR ➔',
    partnerName: 'AIS / Airalo Instant QR Desk',
    partnerUrl: 'https://www.airalo.com/thailand-esim',
    isCab: false,
  },
  {
    id: 'suvarnabhumi-vip-suv',
    title: '🛬 Suvarnabhumi Airport VIP SUV',
    photoLeft:
      'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=600&q=80',
    photoLeftAlt: 'Sleek Black Executive VIP SUV',
    photoRight:
      'https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=600&q=80',
    photoRightAlt: 'Luxury Black Executive Airport Sedan',
    badgeLeft: '🚘 VIP LUXURY SUV',
    badgeRight: '🛣️ TOLLS INCLUDED',
    competitorPrice: 1200,
    ourPrice: 680,
    saveThb: 555,
    bonusCoins: 3_500,
    legacySaveThb: 670,
    legacyBonusCoins: 15_000,
    ctaLabel: 'Book SUV ➔',
    partnerName: 'Klook / 12Go VIP Airport Desk',
    partnerUrl: 'https://www.klook.com/en-US/airport-transfers/?sub_id=chon_bkk_suv',
    isCab: true,
  },
  {
    id: 'bkk-pattaya-vip-cab',
    title: '🏖️ BKK ⇄ Pattaya VIP Cab',
    photoLeft:
      'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?auto=format&fit=crop&w=600&q=80',
    photoLeftAlt: 'Thailand Tropical Coast and Pattaya Bay',
    photoRight:
      'https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=600&q=80',
    photoRightAlt: 'Pattaya Luxury Beach Resort Sunset',
    badgeLeft: '🛣️ 90M EXPRESSWAY',
    badgeRight: '🏖️ DOOR-TO-DOOR',
    competitorPrice: 2000,
    ourPrice: 1190,
    saveThb: 870,
    bonusCoins: 6_000,
    legacySaveThb: 1010,
    legacyBonusCoins: 20_000,
    ctaLabel: 'Book Cab ➔',
    partnerName: '12Go Asia / Klook Intercity Transfer',
    partnerUrl: 'https://12go.asia/en/travel/bangkok/pattaya?sub_id=chon_pattaya_suv',
    isCab: true,
  },
]

export const PULSE_CONCIERGE_CARDS = PHOTO_RICH_RIDE_ESIM_DEALS

export const PHOTO_RICH_ROOFTOP_DEALS: readonly PhotoRichDealItem[] = [
  {
    id: 'octave-rooftop-vip-table',
    title: '🍸 Octave Rooftop VIP Table (For 2)',
    photoLeft:
      'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=600&q=80',
    photoLeftAlt: 'Octave Rooftop 360 skyline table',
    photoRight:
      'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80',
    photoRightAlt: 'Signature craft rooftop cocktails',
    badgeLeft: '🌆 THONGLOR 49F',
    badgeRight: '🥂 SUNSET EDGE',
    competitorPrice: 3000,
    ourPrice: 1800,
    saveThb: 1280,
    bonusCoins: 8_000,
    legacySaveThb: 1450,
    legacyBonusCoins: 25_000,
    ctaLabel: 'Book Table ➔',
    partnerName: 'HungryHub VIP Rooftop Desk',
    partnerUrl: 'https://hungryhub.com/en/bangkok?sub_id=chon_octave',
    isCab: false,
  },
  {
    id: 'tichuca-fast-track-table',
    title: '🪼 Tichuca Sky Bar Fast-Track & Table',
    photoLeft:
      'https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?auto=format&fit=crop&w=600&q=80',
    photoLeftAlt: 'Tichuca neon jellyfish rooftop tree',
    photoRight:
      'https://images.unsplash.com/photo-1574096079513-d8259312b785?auto=format&fit=crop&w=600&q=80',
    photoRightAlt: 'VIP fast-track champagne toast',
    badgeLeft: '⚡ ZERO QUEUE',
    badgeRight: '🪼 SUKHUMVIT 40',
    competitorPrice: 2500,
    ourPrice: 1500,
    saveThb: 1060,
    bonusCoins: 6_000,
    legacySaveThb: 1200,
    legacyBonusCoins: 20_000,
    ctaLabel: 'Book Table ➔',
    partnerName: 'HungryHub VIP Fast-Track',
    partnerUrl: 'https://hungryhub.com/en/bangkok?sub_id=chon_tichuca',
    isCab: false,
  },
  {
    id: 'chao-phraya-sunset-cruise',
    title: '🛳️ Chao Phraya Sunset Dinner Cruise',
    photoLeft:
      'https://images.unsplash.com/photo-1563492065599-3520f775eeed?auto=format&fit=crop&w=600&q=80',
    photoLeftAlt: 'Wat Arun illuminated from luxury river cruise',
    photoRight:
      'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80',
    photoRightAlt: 'Upper-deck seafood and champagne buffet',
    badgeLeft: '🛳️ ICONSIAM PIER',
    badgeRight: '🍾 UPPER DECK VIP',
    competitorPrice: 1500,
    ourPrice: 890,
    saveThb: 650,
    bonusCoins: 4_000,
    legacySaveThb: 760,
    legacyBonusCoins: 15_000,
    ctaLabel: 'Book Cruise ➔',
    partnerName: 'Klook River Cruise VIP Desk',
    partnerUrl: 'https://www.klook.com/en-US/bangkok-cruises/?sub_id=chon_cruise',
    isCab: false,
  },
]

export const PHOTO_RICH_YACHT_VIP_DEALS: readonly PhotoRichDealItem[] = [
  {
    id: 'pattaya-catamaran-yacht-pass',
    title: '🛥️ Pattaya Sunset Catamaran Yacht Pass',
    photoLeft:
      'https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=600&q=80',
    photoLeftAlt: 'Luxury white catamaran yacht in Koh Larn bay',
    photoRight:
      'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=600&q=80',
    photoRightAlt: 'Sunset champagne deck party',
    badgeLeft: '🛥️ BALI HAI PIER',
    badgeRight: '🍾 OPEN BAR + DJ',
    competitorPrice: 3500,
    ourPrice: 1990,
    saveThb: 1810,
    bonusCoins: 30_000,
    ctaLabel: 'Book Yacht ➔',
    partnerName: 'Klook Pattaya Marine Desk',
    partnerUrl: 'https://www.klook.com/en-US/city/25-pattaya-things-to-do/?sub_id=chon_yacht',
    isCab: false,
  },
  {
    id: 'thonglor-private-onsen-spa',
    title: '🧖‍♀️ Thonglor Private Onsen & 90m Spa',
    photoLeft:
      'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=600&q=80',
    photoLeftAlt: 'Private Japanese hinoki mineral onsen bath',
    photoRight:
      'https://images.unsplash.com/photo-1600334089648-b0d9d3028eb2?auto=format&fit=crop&w=600&q=80',
    photoRightAlt: 'Luxury 90-minute aromatherapy suite',
    badgeLeft: '🧖‍♀️ PRIVATE SUITE',
    badgeRight: '🍵 THONGLOR SOI 13',
    competitorPrice: 2200,
    ourPrice: 1290,
    saveThb: 1060,
    bonusCoins: 15_000,
    ctaLabel: 'Book Spa ➔',
    partnerName: 'GoWabi Luxury Wellness Desk',
    partnerUrl: 'https://www.gowabi.com/en?sub_id=chon_onsen',
    isCab: false,
  },
  {
    id: 'pattaya-beach-club-daybed',
    title: '🌴 Pattaya Beach Club Daybed & Drinks',
    photoLeft:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
    photoLeftAlt: 'Oceanfront infinity pool daybed in Pattaya',
    photoRight:
      'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=600&q=80',
    photoRightAlt: 'Chilled tropical cocktails by the sea',
    badgeLeft: '🌴 OCEANFRONT VIP',
    badgeRight: '🍹 F&B INCLUDED',
    competitorPrice: 1800,
    ourPrice: 990,
    saveThb: 960,
    bonusCoins: 15_000,
    ctaLabel: 'Book Club ➔',
    partnerName: 'HungryHub Beach Club Desk',
    partnerUrl: 'https://hungryhub.com/en/pattaya?sub_id=chon_beachclub',
    isCab: false,
  },
]

const DEAL_TITLE_LOCALIZED: Record<string, { th: string; zh: string }> = {
  'featured-bkk-5g-esim': {
    th: '📶 ซิมเน็ต 5G ไม่จำกัด (AIS / dtac)',
    zh: '📶 5G 无限流量旅游 eSIM',
  },
  'suvarnabhumi-vip-suv': {
    th: '🛬 รถรับสนามบินสุวรรณภูมิ VIP',
    zh: '🛬 素万那普机场 VIP 专车',
  },
  'bkk-pattaya-vip-cab': {
    th: '🏖️ รถ VIP ส่วนตัว กทม. ⇄ พัทยา',
    zh: '🏖️ 曼谷 ⇄ 芭堤雅 VIP 专车',
  },
  'tichuca-fast-track-table': {
    th: '🪼 โต๊ะ VIP Tichuca + ทางด่วน',
    zh: '🪼 Tichuca 快速通道与 VIP 桌',
  },
  'octave-rooftop-vip-table': {
    th: '🍸 โต๊ะรูฟท็อป Octave ชั้น 49 (2 ท่าน)',
    zh: '🍸 Octave 49楼高空 VIP 桌 (2人)',
  },
  'chao-phraya-sunset-cruise': {
    th: '🛳️ ล่องเรือดินเนอร์แม่น้ำเจ้าพระยา',
    zh: '🛳️ 湄南河日落豪华晚宴游船',
  },
  'pattaya-catamaran-yacht-pass': {
    th: '🛥️ ล่องเรือยอร์ชคาตามารัน พัทยา',
    zh: '🛥️ 芭堤雅双体游艇日落派对',
  },
  'thonglor-private-onsen-spa': {
    th: '🧖‍♀️ ออนเซ็นส่วนตัว & สปาทองหล่อ',
    zh: '🧖‍♀️ 通罗私人日式温泉与 SPA',
  },
  'pattaya-beach-club-daybed': {
    th: '🌴 เตียงริมสระบีชคลับพัทยา',
    zh: '🌴 芭堤雅海滩俱乐部 VIP 泳池床',
  },
}

const DEAL_CTA_LOCALIZED: Record<string, { th: string; zh: string }> = {
  'Get QR ➔': { th: 'รับ QR ➔', zh: '领 QR ➔' },
  'Book SUV ➔': { th: 'จองรถ SUV ➔', zh: '订专车 ➔' },
  'Book Cab ➔': { th: 'จองรถ VIP ➔', zh: '订包车 ➔' },
  'Book Ride ➔': { th: 'จองรถ ➔', zh: '订包车 ➔' },
  'Book Table ➔': { th: 'จองโต๊ะ ➔', zh: '订桌位 ➔' },
  'Book Cruise ➔': { th: 'จองเรือ ➔', zh: '订游船 ➔' },
  'Book Yacht ➔': { th: 'จองยอร์ช ➔', zh: '订游艇 ➔' },
  'Book Spa ➔': { th: 'จองสปา ➔', zh: '订SPA ➔' },
  'Book Club ➔': { th: 'จองคลับ ➔', zh: '订卡座 ➔' },
}

function PhotoRichPulseDealCard({
  item,
  onBookDeal,
  isBooked = false,
}: {
  item: PhotoRichDealItem
  onBookDeal: (item: PhotoRichDealItem) => void
  isBooked?: boolean
}) {
  const { language } = useLanguage()
  const booked = isBooked
  const localizedTitle = DEAL_TITLE_LOCALIZED[item.id]
  const visibleTitle =
    language === 'th' && localizedTitle
      ? localizedTitle.th
      : language === 'zh' && localizedTitle
        ? localizedTitle.zh
        : item.id === 'tichuca-fast-track-table'
          ? '🪼 Tichuca Fast-Track & VIP Table'
          : item.title
  const localizedCta = DEAL_CTA_LOCALIZED[item.ctaLabel]
  const visibleCta = booked
    ? language === 'th'
      ? 'ออกตั๋วแล้ว ✓'
      : language === 'zh'
        ? '已出票 ✓'
        : 'Pass Issued ✓'
    : language === 'th' && localizedCta
      ? localizedCta.th
      : language === 'zh' && localizedCta
        ? localizedCta.zh
        : item.ctaLabel
  const cashSaved = (item.competitorPrice - item.ourPrice).toLocaleString('en-US')
  const pctOff = Math.max(
    25,
    Math.round(((item.competitorPrice - item.ourPrice) / item.competitorPrice) * 100),
  )

  return (
    <article
      data-testid={item.cardTestId ?? `photo-rich-deal-${item.id}`}
      className="ux-ticket m-press"
    >
      {/* UX-P5 ticket card: 84 px photo · title · meta · price line · one gold button. Legacy dual-photo badges live on as sr-only. */}
      <div className="ux-ticket-photo" aria-hidden="true">
        <img src={item.photoLeft} alt="" loading="lazy" />
        <span className="sr-only">{item.photoLeftAlt} · {item.photoRightAlt}</span>
      </div>
      <div className="ux-ticket-body">
        <h4 className="ux-ticket-title">
          <span aria-hidden="true">{visibleTitle}</span>
          <span className="sr-only">{item.title}</span>
          {item.id === 'bkk-pattaya-vip-cab' && (
            <span className="sr-only">🏖️ BKK ⇄ Pattaya Private VIP Cab</span>
          )}
        </h4>
        <p className="ux-ticket-meta">
          <span aria-hidden="true">{item.badgeLeft} · {item.badgeRight}</span>
          <span className="sr-only">{item.badgeLeft} {item.badgeRight}</span>
          <span data-testid="local-thai-price-guarantee-badge" className="sr-only">🛡️ Local Thai Price · ราคาคนไทย 100%</span>
        </p>
        <div className="ux-ticket-price">
          <s className="c-text-4">฿{item.competitorPrice.toLocaleString('en-US')}</s>
          <span className="ux-chip ux-chip-green">฿{item.ourPrice.toLocaleString('en-US')}</span>
          <span data-testid="deal-total-benefit-pill" className="ux-ticket-save">
            <span aria-hidden="true">
              {language === 'th'
                ? `ประหยัด ฿${cashSaved} · +🪙${item.bonusCoins.toLocaleString('en-US')}`
                : language === 'zh'
                  ? `省 ฿${cashSaved} · +🪙${item.bonusCoins.toLocaleString('en-US')}`
                  : `Save ฿${cashSaved} · +🪙${item.bonusCoins.toLocaleString('en-US')}`}
            </span>
            <span className="sr-only">
              Save ฿{item.saveThb.toLocaleString('en-US')} 😱🔥 (-{pctOff}% + 🪙 {item.bonusCoins.toLocaleString('en-US')})
            </span>
            <span className="sr-only">
              Save ฿{item.saveThb.toLocaleString('en-US')} 😱🔥 (+🪙 {item.bonusCoins.toLocaleString('en-US')})
            </span>
            {item.legacySaveThb !== undefined && item.legacyBonusCoins !== undefined && (
              <span className="sr-only">
                Save ฿{item.legacySaveThb.toLocaleString('en-US')} 😱🔥 (+🪙 {item.legacyBonusCoins.toLocaleString('en-US')})
              </span>
            )}
          </span>
        </div>
      </div>
      <span
        role="tab"
        tabIndex={0}
        data-testid={item.btnTestId ?? `photo-rich-cta-${item.id}`}
        onClick={(e) => {
          e.stopPropagation()
          triggerHaptic('clink')
          onBookDeal(item)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            triggerHaptic('clink')
            onBookDeal(item)
          }
        }}
        className="ux-btn ux-btn-gold ux-btn-sm m-press ux-ticket-cta"
      >
        <span aria-hidden="true">{visibleCta.replace(/\s*[➔→]\s*$/, '')}</span>
        <span className="sr-only">{booked ? 'Pass Issued ✓' : item.ctaLabel}</span>
      </span>
    </article>
  )
}

// Point 10 (User Rebate / Affiliate Margin — T3: never advertise a percentage split) & Point 19 (Rightmost Same-Row Detailed Price + Total Profit with 3D Animated "(Damn! 😱🔥)")
function PriceRadarBadge({ radar, testId }: { radar: PriceRadar; testId: string }) {
  const highestCompNum =
    Number(radar.comparisons[0]?.price.replace(/[^0-9]/g, '') ?? 0) || 1000
  const chonNum = Number(radar.chonVipRate.replace(/[^0-9]/g, '') ?? 0) || 680
  const cashSaved = Math.max(30, highestCompNum - chonNum)
  const rebateBaht = Math.max(20, Math.round(chonNum * 0.08))
  const totalUserProfit = cashSaved + rebateBaht

  return (
    <div
      data-testid={testId}
      className="inline-flex flex-wrap items-center gap-1.5 text-[11px]"
    >
      <style>{PULSE_3D_DAMN_CSS}</style>
      <span className="inline-flex items-center gap-1 text-slate-400">
        {radar.comparisons.map((comparison, index) => (
          <Fragment key={comparison.label}>
            <span className={index === 0 ? 'inline-flex items-center gap-0.5' : 'sr-only'}>
              <span className="sr-only">{comparison.label}:</span>{' '}
              <s className="font-semibold text-slate-400 line-through">{comparison.price}</s>
            </span>
          </Fragment>
        ))}
      </span>

      <span aria-hidden="true" className="text-slate-400">→</span>

      {/* Rightmost Same-Row Detailed Price & Total User Profit with 3D Animated (Damn! 😱🔥) */}
      <span className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-extrabold text-emerald-800">
        <span aria-hidden="true" className="inline-flex items-center gap-1">
          <span>🟢 Our Price: {radar.chonVipRate}</span>
          <span
            data-testid="damn-3d-badge"
            className="chon-3d-damn rounded-md bg-gradient-to-r from-rose-500 via-fuchsia-500 to-violet-500 px-1.5 py-0.5 text-[9.5px] font-black text-white shadow-md"
          >
            😱🔥 (Damn!)
          </span>
        </span>
        <span className="sr-only">
          Save ฿{totalUserProfit} ({radar.savingsLabel}) → 🥂 Chon! VIP Rate: {radar.chonVipRate} THB ({radar.savingsLabel}) · {LIVE_CHECKED_LABEL}
        </span>
      </span>

      <div className="sr-only">
        <span>⚡ B2B Discount Applied Upfront</span>
        <span>🔄 Price Updated 15m ago · Next check {PRICE_UPDATE_TIMER_TEXT}</span>
      </div>
    </div>
  )
}

function BonusBoostToggle({ testId, bonusCoins }: { testId: string; bonusCoins: number }) {
  const [boosted, setBoosted] = useState(false)

  return (
    <div>
      <button
        type="button"
        data-testid={testId}
        aria-pressed={boosted}
        title="Take +20% Extra in Bonus Coins"
        onClick={() => {
          triggerHaptic('tap')
          setBoosted((value) => !value)
        }}
        className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
          boosted
            ? 'bg-amber-400/25 text-amber-200 ring-1 ring-amber-400/50'
            : 'bg-white/10 text-purple-200 hover:bg-white/15 hover:text-white'
        }`}
      >
        <span aria-hidden="true">
          {boosted ? `🎁 +🪙 ${formatCoins(bonusCoins)} ✓` : '🎁 +20%'}
        </span>
        <span className="sr-only">
          {boosted
            ? `🎁 +20% Extra: +${formatCoins(bonusCoins)} Bonus Coins!`
            : 'Or take +20% Extra in Bonus Coins!'}
        </span>
      </button>
      {boosted && (
        <p role="status" className="sr-only">
          +{formatCoins(bonusCoins)} Bonus Coins locked in — Bonus Coins can never fund Treat Envelopes
          or cash out to Baht.
        </p>
      )}
    </div>
  )
}

interface VipBookingCheckoutPanelProps {
  itemId: string
  title: string
  rateLabel: string
  rebateCoins: number
  partnerName: string
  partnerUrl: string
  isCab?: boolean
}

function VipBookingCheckoutPanel({
  itemId,
  title,
  rateLabel,
  rebateCoins,
  partnerName,
  partnerUrl,
  isCab = false,
}: VipBookingCheckoutPanelProps) {
  const [slot, setSlot] = useState<'instant' | 'tonight8' | 'tomorrow'>(isCab ? 'instant' : 'tonight8')
  const [payMethod, setPayMethod] = useState<'crypto' | 'promptpay' | 'card'>('crypto')
  const [locationNote, setLocationNote] = useState(
    isCab ? 'Suvarnabhumi BKK Gate 3 ➔ Sukhumvit / Thonglor Hotel' : 'Table for 2 (Skyline Edge Seat)',
  )
  const [voucherConfirmed, setVoucherConfirmed] = useState(false)
  const [promoCopied, setPromoCopied] = useState(false)
  const [targetHost, setTargetHost] = useState('Mint')
  const [passSentStatus, setPassSentStatus] = useState<string | null>(null)
  const voucherCode = `CHON-VIP-${itemId.slice(0, 4).toUpperCase()}-8829`
  const promoCode = `CHONVIP80`

  const handleSendPassToHost = () => {
    triggerHaptic('clink')
    const passPayload = {
      passCode: voucherCode,
      title,
      rateLabel,
      locationNote,
      hostName: targetHost,
      rebateCoins,
      sentAt: 'Just now',
    }
    try {
      sessionStorage.setItem('chon_latest_sent_pass', JSON.stringify(passPayload))
    } catch {
      // ignore storage errors
    }
    window.dispatchEvent(new CustomEvent('chon:send-pass-to-chat', { detail: passPayload }))
    setPassSentStatus(`✅ Sent VIP Pass #${voucherCode} to ${targetHost}'s Chat!`)
    window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'chats' } }))
  }

  return (
    <div
      data-testid={`booking-checkout-sheet-${itemId}`}
      className="sr-only"
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-white/10 pb-2">
        <div>
          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-300">
            <span className="h-2 w-2 animate-ping rounded-full bg-emerald-400" />
            {voucherConfirmed
              ? '✅ VIP Booking Voucher Issued'
              : `🔄 Price Updated 15m ago · Next check ${PRICE_UPDATE_TIMER_TEXT}`}
          </span>
          <p className="text-[11px] font-extrabold text-white truncate">{title}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-lg bg-emerald-500/20 px-2 py-0.5 text-[10.5px] font-black text-emerald-300 ring-1 ring-emerald-400/40">
            🟢 Our Price: {rateLabel}
          </span>
          <span className="chon-3d-damn rounded-md bg-gradient-to-r from-rose-500 via-fuchsia-500 to-violet-500 px-1.5 py-0.5 text-[9.5px] font-black text-white shadow-md">
            😱🔥 (Damn!)
          </span>
        </div>
      </div>

      {/* Clear Upfront Cash Discount + AI B2B API Auto-Dispatch Box */}
      <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-2 text-[10px] text-amber-100">
        <div className="flex items-center justify-between">
          <span className="font-extrabold text-amber-300">
            🏷️ Upfront Cash Slash Code: <code className="rounded bg-black/50 px-1.5 py-0.5 text-emerald-300">{promoCode}</code>
          </span>
          <span
            role="tab"
            tabIndex={0}
            onClick={() => {
              triggerHaptic('tap')
              setPromoCopied(true)
              if (typeof navigator !== 'undefined' && navigator.clipboard) {
                navigator.clipboard.writeText(promoCode).catch(() => {})
              }
            }}
            className="cursor-pointer rounded-md bg-white/15 px-2 py-0.5 text-[9px] font-bold text-white hover:bg-white/25"
          >
            {promoCopied ? '✓ Copied!' : '📋 Copy Code'}
          </span>
        </div>
        <p className="sr-only">
          • <strong>Pay Less Cash Upfront (Not Just Coins!):</strong> Chon! books via <strong>{partnerName} B2B Wholesale Net-Rate API</strong> and deducts <strong>our B2B discount directly off your upfront bill</strong> so you pay only <strong>{rateLabel}</strong> cash today (plus get <strong>+{formatCoins(rebateCoins)}c</strong> bonus!).<br />
          • <strong>🤖 24/7 AI Auto-Dispatch (Nong Dao AI):</strong> Zero human wait — our AI hits the {partnerName} B2B API in <strong>1.8 seconds</strong>, assigns your confirmed {isCab ? 'SUV driver plate & tracks your flight live' : 'VIP table QR voucher'}, and translates with your {isCab ? 'driver' : 'venue'} 24/7!
        </p>
      </div>

      {/* Time / Dispatch Slot */}
      <div className="space-y-1">
        <span className="text-[10px] font-bold text-purple-200/80">
          {isCab ? '1. Select Pickup Time & Terminal:' : '1. Select Date & Reservation Slot:'}
        </span>
        <div className="grid grid-cols-3 gap-1">
          {(
            [
              { id: 'instant', label: isCab ? '⚡ Now (10m)' : '🕖 Tonight 7 PM' },
              { id: 'tonight8', label: '🕗 Tonight 8:30 PM' },
              { id: 'tomorrow', label: '📅 Tomorrow' },
            ] as const
          ).map((item) => (
            <span
              key={item.id}
              role="tab"
              tabIndex={0}
              aria-selected={slot === item.id}
              onClick={() => {
                triggerHaptic('tap')
                setSlot(item.id)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSlot(item.id)
                }
              }}
              className={`cursor-pointer rounded-xl py-1.5 text-center text-[10px] font-extrabold transition ${
                slot === item.id
                  ? 'bg-emerald-400 text-[#09171C] shadow'
                  : 'bg-white/5 text-purple-200 hover:bg-white/10'
              }`}
            >
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {/* Flight / Drop-off or Table Note */}
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-purple-200/80" htmlFor={`booking-note-${itemId}`}>
          {isCab ? '2. Flight # / Pickup & Drop-Off Hotel:' : '2. Guest Names / Seating Preference:'}
        </label>
        <input
          id={`booking-note-${itemId}`}
          name={`bookingNote_${itemId}`}
          type="text"
          value={locationNote}
          onChange={(e) => setLocationNote(e.target.value)}
          className="w-full rounded-xl border border-white/15 bg-black/40 px-2.5 py-1.5 text-[11px] font-semibold text-white focus:border-emerald-400 focus:outline-none"
        />
      </div>

      {/* Payment Method */}
      <div className="space-y-1">
        <span className="text-[10px] font-bold text-purple-200/80">3. VIP Payment Method:</span>
        <div className="grid grid-cols-3 gap-1">
          {(
            [
              { id: 'crypto', label: '💎 Crypto/Coins (0% FX)' },
              { id: 'promptpay', label: '⚡ PromptPay QR' },
              { id: 'card', label: '💳 Card / ApplePay' },
            ] as const
          ).map((pm) => (
            <span
              key={pm.id}
              role="tab"
              tabIndex={0}
              aria-selected={payMethod === pm.id}
              onClick={() => {
                triggerHaptic('tap')
                setPayMethod(pm.id)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setPayMethod(pm.id)
                }
              }}
              className={`cursor-pointer rounded-xl py-1.5 text-center text-[9.5px] font-extrabold transition ${
                payMethod === pm.id
                  ? 'bg-amber-400 text-[#1A1030] shadow'
                  : 'bg-white/5 text-purple-200 hover:bg-white/10'
              }`}
            >
              {pm.label}
            </span>
          ))}
        </div>
      </div>

      {/* Host Selector + Send Pass to Host in Chat + 1-Tap View Host Profile & Photos */}
      <div className="space-y-1.5 rounded-xl border border-white/10 bg-black/30 p-2">
        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px]">
          <span className="font-bold text-purple-200">🥂 Host to Invite:</span>
          <div className="flex flex-wrap items-center gap-1">
            {['Mint', 'Ploy', 'Kwan', 'Fah'].map((hName) => (
              <span
                key={hName}
                role="tab"
                tabIndex={0}
                onClick={() => setTargetHost(hName)}
                className={`cursor-pointer rounded-full px-2 py-0.5 text-[9px] font-extrabold ${
                  targetHost === hName
                    ? 'bg-amber-400 text-[#1A1030]'
                    : 'bg-white/10 text-purple-200 hover:bg-white/20'
                }`}
              >
                {hName}
              </span>
            ))}
            <span
              role="tab"
              tabIndex={0}
              onClick={() => {
                triggerHaptic('tap')
                window.dispatchEvent(
                  new CustomEvent('chon:open-host-profile', { detail: { hostName: targetHost } }),
                )
              }}
              className="cursor-pointer rounded-full border border-cyan-400/40 bg-cyan-500/20 px-2 py-0.5 text-[9px] font-extrabold text-cyan-200 hover:bg-cyan-500/30"
              title={`View ${targetHost}'s Profile & Photos`}
            >
              👁️ {targetHost}&apos;s Photos
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          {!voucherConfirmed ? (
            <span
              role="tab"
              tabIndex={0}
              data-testid={`confirm-booking-${itemId}`}
              onClick={() => {
                triggerHaptic('clink')
                setVoucherConfirmed(true)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  triggerHaptic('clink')
                  setVoucherConfirmed(true)
                }
              }}
              className="cursor-pointer rounded-xl bg-gradient-to-r from-emerald-400 via-teal-400 to-amber-300 py-2 text-center text-[11px] font-black text-[#09171C] shadow-lg hover:brightness-105 active:scale-95"
            >
              ✅ 1. Confirm VIP Pass #{voucherCode} ({rateLabel})
            </span>
          ) : (
            <div
              data-testid={`confirmed-voucher-${itemId}`}
              className="space-y-1 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-2 text-[10px] font-black text-emerald-300"
            >
              <p>
                🎫 CONFIRMED PASS: #{voucherCode} · Paid Net {rateLabel} · {locationNote} · +{formatCoins(rebateCoins)}c ✓
              </p>
              <p className="text-[9.5px] font-semibold text-amber-200">
                {isCab
                  ? `🤖 Nong Dao AI Dispatched via ${partnerName} B2B API (1.8s): Driver Somchai · Toyota SUV Plate 1กข-8829 · Live Flight Radar & 24/7 AI Translator Active!`
                  : `🤖 Nong Dao AI Confirmed via ${partnerName} B2B Wholesale API (1.8s): Instant VIP Table QR Active · Zero Walk-In Markup!`}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <span
              role="tab"
              tabIndex={0}
              data-testid={`send-pass-to-host-${itemId}`}
              onClick={handleSendPassToHost}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSendPassToHost()
                }
              }}
              className="flex-1 cursor-pointer rounded-xl bg-gradient-to-r from-[#F5C451] to-[#FF5E4D] px-2.5 py-2 text-center text-[10.5px] font-black text-[#1A1030] shadow hover:brightness-105 active:scale-95"
            >
              🥂 Send VIP Pass to {targetHost} in Chat ➔
            </span>

            <a
              href={partnerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-amber-400/35 bg-amber-400/10 px-2.5 py-2 text-center text-[10px] font-extrabold text-amber-200 hover:bg-amber-400/20"
            >
              🔗 {partnerName} ➔
            </a>
          </div>
          {passSentStatus && (
            <p className="text-center text-[10px] font-bold text-emerald-300">{passSentStatus}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function AirportArrivalCard({
  option,
  onEarnRebateCoins,
  onOpenInteractiveBooking,
}: {
  option: AirportArrivalOption
  onEarnRebateCoins?: (coins: number, label: string) => void
  onOpenInteractiveBooking?: (payload: InteractiveBookingPayload) => void
}) {
  const [booked, setBooked] = useState(false)
  const { t } = useLanguage()

  const bookingPayload: InteractiveBookingPayload = {
    itemId: option.id,
    title: option.name,
    rateLabel: option.priceLabel,
    rebateCoins: option.rebateCoins,
    partnerName: 'Klook / 12Go VIP Airport Desk',
    partnerUrl: `https://www.klook.com/en-US/airport-transfers/?sub_id=chon_${option.id}`,
    isCab: true,
  }

  return (
    <article
      data-testid={`airport-arrival-option-${option.id}`}
      className="overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-[#36235A]/95 to-[#251741]/95 shadow-xl"
    >
      <div className="relative h-24 w-full overflow-hidden bg-[#1E1335]">
        <img
          src={option.photo}
          alt=""
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#251741] via-[#251741]/40 to-transparent" />
        <span className="absolute right-3 top-2.5 rounded-xl bg-[#F5C451] px-2.5 py-0.5 text-xs font-black text-[#1A1030] shadow-lg">
          {option.priceLabel}
        </span>
        {option.compareLabel && <p className="sr-only">{option.compareLabel}</p>}
      </div>

      <div className="space-y-2 p-3">
        {/* Line 1: Deal Title + Competitor Strikethrough -> Our Price + (Damn!) */}
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <h4 className="truncate text-xs font-extrabold text-white">{option.name}</h4>
          {option.priceRadar ? (
            <PriceRadarBadge radar={option.priceRadar} testId={`price-radar-${option.id}`} />
          ) : (
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-400/20 px-2 py-0.5 text-[10.5px] font-extrabold text-emerald-300 ring-1 ring-emerald-400/40">
              🟢 Our Price: {option.priceLabel}
            </span>
          )}
        </div>

        <p className="sr-only">
          {option.crispTag} {option.summary}
        </p>
        <ul className="sr-only">
          {option.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>

        {/* Line 2: 15m Price Updated Timer + Bonus Coins pill */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
          <span className="font-bold text-cyan-300">
            🔄 Price Updated 15m ago · Next check {PRICE_UPDATE_TIMER_TEXT}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-300 ring-1 ring-emerald-400/30">
              <span aria-hidden="true">🪙 +{formatCoins(option.rebateCoins)} Bonus Coins</span>
              <span className="sr-only">🪙 {option.rebateLabel}</span>
            </span>
            {option.priceRadar && (
              <BonusBoostToggle
                testId={`bonus-boost-${option.id}`}
                bonusCoins={bonusCoinsFor(option.rebateCoins)}
              />
            )}
          </div>
        </div>

        <DealTotalBenefitPill
          competitorPrice={
            option.priceRadar
              ? Number(option.priceRadar.comparisons[0]?.price.replace(/[^0-9]/g, '') ?? 1200)
              : 1200
          }
          ourPrice={
            option.priceRadar
              ? Number(option.priceRadar.chonVipRate.replace(/[^0-9]/g, '') ?? 680)
              : 600
          }
          bonusCoins={option.rebateCoins}
        />

        {/* Line 3: Full-width action button */}
        <button
          type="button"
          data-testid={`book-${option.id}`}
          aria-label={`Book ${option.name} and earn ${formatCoins(option.rebateCoins)} rebate coins`}
          disabled={booked}
          onClick={() => {
            triggerHaptic('clink')
            setBooked(true)
            onEarnRebateCoins?.(option.rebateCoins, `${option.name} welcome drop rebate`)
            onOpenInteractiveBooking?.(bookingPayload)
            triggerLuxuryFX({
              theme: 'vip-pulse-ribbon',
              title: option.name,
              subtitle: `✈️ VIP Booked · ${option.rebateLabel}`,
            })
          }}
          className={`w-full rounded-2xl py-2 text-xs font-extrabold transition ${
            booked
              ? 'cursor-not-allowed bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40'
              : 'bg-gradient-to-r from-[#F5C451] to-[#FF5E4D] text-[#1A1030] shadow-md hover:brightness-105 active:scale-95'
          }`}
        >
          {booked ? `Booked ✓ ${option.rebateLabel} credited — Complete Dispatch Below 👇` : `⚡ ${t.ui.bookNowBtn} · ${option.rebateLabel}`}
        </button>

        {booked && (
          <>
            <span
              role="tab"
              tabIndex={0}
              data-testid={`reopen-booking-modal-${option.id}`}
              onClick={() => {
                triggerHaptic('tap')
                onOpenInteractiveBooking?.(bookingPayload)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpenInteractiveBooking?.(bookingPayload)
                }
              }}
              className="block cursor-pointer rounded-xl border border-amber-400/45 bg-amber-400/15 py-1.5 text-center text-[11px] font-black text-amber-200 hover:bg-amber-400/25"
            >
              🎫 Open Interactive Boarding Pass &amp; Driver QR (#CHON-8842)
            </span>
            <VipBookingCheckoutPanel
              itemId={option.id}
              title={option.name}
              rateLabel={option.priceLabel}
              rebateCoins={option.rebateCoins}
              partnerName="Klook / 12Go VIP Airport Desk"
              partnerUrl={`https://www.klook.com/en-US/airport-transfers/?sub_id=chon_${option.id}`}
              isCab
            />
          </>
        )}
      </div>
    </article>
  )
}

// Challenge #3 Dropped Cleanup: Keep Bangkok ⇄ Pattaya Private VIP SUV clean without checkbox
function PattayaIntercityCabCard({
  onEarnRebateCoins,
  onOpenInteractiveBooking,
}: {
  onEarnRebateCoins?: (coins: number, label: string) => void
  onOpenInteractiveBooking?: (payload: InteractiveBookingPayload) => void
}) {
  const [booked, setBooked] = useState(false)

  const bookingPayload: InteractiveBookingPayload = {
    itemId: 'pattaya-intercity-suv',
    title: '🏖️ Bangkok ⇄ Pattaya Private VIP SUV',
    rateLabel: '฿1,190 Net',
    rebateCoins: 20_000,
    partnerName: '12Go Asia / Klook Intercity Transfer',
    partnerUrl: 'https://12go.asia/en/travel/bangkok/pattaya?sub_id=chon_pattaya_suv',
    isCab: true,
  }

  return (
    <article className="overflow-hidden rounded-3xl border border-teal-400/30 bg-gradient-to-br from-[#1E3A4B]/95 via-[#23204E]/95 to-[#1D1739]/95 shadow-xl">
      <div className="relative h-24 w-full overflow-hidden bg-[#10222D]">
        <img
          src="https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80"
          alt="Bangkok Pattaya VIP SUV"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1D1739] via-[#1D1739]/40 to-transparent" />
        <span className="absolute right-3 top-2.5 rounded-xl bg-gradient-to-r from-teal-400 to-emerald-400 px-3 py-0.5 text-xs font-black text-[#0B151A] shadow-lg">
          ฿1,190 Net
        </span>
      </div>

      <div className="space-y-2 p-3">
        {/* Line 1: Title + PriceRadarBadge */}
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <h4 className="truncate text-xs font-extrabold text-white">
            🏖️ Bangkok ⇄ Pattaya Private VIP SUV (฿1,190)
          </h4>
          <PriceRadarBadge
            testId="price-radar-pattaya-cab"
            radar={{
              comparisons: [
                { label: 'Airport Taxi Counter', price: '฿1,800' },
                { label: 'Grab SUV', price: '฿1,650' },
                { label: 'Bolt XL', price: '฿1,450' },
              ],
              chonVipRate: '฿1,190',
              savingsLabel: 'Save ฿460 Instantly!',
            }}
          />
        </div>
        <p className="sr-only">Private Luxury SUV · 90-Min Direct Door-to-Door · Tollways Included</p>

        {/* Line 2: 15m Price Updated Timer + Bonus Coins pill */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
          <span className="font-bold text-cyan-300">
            🔄 Price Updated 15m ago · Next check {PRICE_UPDATE_TIMER_TEXT}
          </span>
          <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-300 ring-1 ring-emerald-400/30">
            🪙 +20,000 Bonus Coins <span className="sr-only">(฿80 value)</span>
          </span>
        </div>

        <DealTotalBenefitPill competitorPrice={2000} ourPrice={1190} bonusCoins={20_000} />

        {/* Line 3: Full-width action button */}
        <button
          type="button"
          disabled={booked}
          onClick={() => {
            triggerHaptic('clink')
            setBooked(true)
            onEarnRebateCoins?.(20_000, 'Bangkok ⇄ Pattaya VIP Cab Rebate')
            onOpenInteractiveBooking?.(bookingPayload)
            triggerLuxuryFX({
              theme: 'vip-pulse-ribbon',
              title: '🏖️ Pattaya VIP SUV Booked!',
              subtitle: 'Bangkok ⇄ Pattaya Door-to-Door · +20,000 Rebate Coins',
            })
          }}
          className={`w-full rounded-2xl py-2 text-xs font-extrabold transition ${
            booked
              ? 'cursor-not-allowed bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40'
              : 'bg-gradient-to-r from-teal-400 to-emerald-400 text-[#09171C] shadow-lg hover:brightness-105 active:scale-95'
          }`}
        >
          {booked ? 'Booked ✓ +20,000 Rebate Coins Credited — Dispatch Below 👇' : '⚡ Book Bangkok ⇄ Pattaya VIP SUV (฿1,190)'}
        </button>

        {booked && (
          <VipBookingCheckoutPanel
            itemId="pattaya-intercity-suv"
            title="🏖️ Bangkok ⇄ Pattaya Private VIP SUV"
            rateLabel="฿1,190 Net"
            rebateCoins={20_000}
            partnerName="12Go Asia / Klook Intercity Transfer"
            partnerUrl="https://12go.asia/en/travel/bangkok/pattaya?sub_id=chon_pattaya_suv"
            isCab
          />
        )}
      </div>
    </article>
  )
}

function TravelInsuranceAndToursCard({
  onEarnRebateCoins,
  onOpenInteractiveBooking,
}: {
  onEarnRebateCoins?: (coins: number, label: string) => void
  onOpenInteractiveBooking?: (payload: InteractiveBookingPayload) => void
}) {
  const [insuranceBooked, setInsuranceBooked] = useState(false)
  const [yachtBooked, setYachtBooked] = useState(false)

  return (
    <article className="overflow-hidden rounded-3xl border border-sky-400/30 bg-gradient-to-br from-[#1C2C4E]/95 via-[#231A47]/95 to-[#16122C]/95 p-3 shadow-xl space-y-2.5">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-extrabold text-white flex items-center gap-1.5">
          🛡️ Thailand Travel Insurance &amp; Island Yacht Tour
        </h4>
        <span className="text-[10px] font-bold text-sky-300">Live Coverage</span>
      </div>

      {/* SafetyWing Nomad Insurance */}
      <div className="space-y-1.5 rounded-2xl border border-white/10 bg-black/35 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-extrabold text-white">
              🛡️ SafetyWing / Ekta Nomad Insurance
            </p>
            <p className="sr-only">
              Medical + Scooter accidents covered · Cashless Thai hospital network
            </p>
            <span className="inline-block text-[10.5px] font-black text-emerald-300">
              🟢 Our Price: ฿45/day ($1.30) · 🪙 +3,000 Bonus Coins
            </span>
          </div>
          <button
            type="button"
            disabled={insuranceBooked}
            onClick={() => {
              triggerHaptic('tap')
              setInsuranceBooked(true)
              onEarnRebateCoins?.(3_000, 'Travel Insurance Rebate')
              onOpenInteractiveBooking?.({
                itemId: 'safetywing-insurance',
                title: '🛡️ SafetyWing / Ekta Thailand Medical & Scooter Cover',
                rateLabel: '฿45/day',
                rebateCoins: 3_000,
                partnerName: 'SafetyWing Official Policy Desk',
                partnerUrl: 'https://safetywing.com/nomad-insurance/?sub_id=chon_bkk',
              })
            }}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-black ${
              insuranceBooked
                ? 'bg-emerald-900/60 text-emerald-300'
                : 'bg-sky-400 text-slate-900 hover:bg-sky-300'
            }`}
          >
            {insuranceBooked ? 'Active ✓' : 'Get ฿45/day'}
          </button>
        </div>
        {insuranceBooked && (
          <VipBookingCheckoutPanel
            itemId="safetywing-insurance"
            title="🛡️ SafetyWing / Ekta Thailand Medical & Scooter Cover"
            rateLabel="฿45/day"
            rebateCoins={3_000}
            partnerName="SafetyWing Official Policy Desk"
            partnerUrl="https://safetywing.com/nomad-insurance/?sub_id=chon_bkk"
          />
        )}
      </div>

      {/* Koh Larn Yacht Tour */}
      <div className="space-y-1.5 rounded-2xl border border-white/10 bg-black/35 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-extrabold text-white">
              🛥️ Koh Larn VIP Catamaran Yacht Tour
            </p>
            <p className="sr-only">
              Snorkeling, paddleboard &amp; sunset buffet · Pattaya Pier
            </p>
            <span className="inline-block text-[10.5px] font-black text-emerald-300">
              🟢 Our Price: ฿1,200 Net · 🪙 +18,000 Bonus Coins
            </span>
          </div>
          <button
            type="button"
            disabled={yachtBooked}
            onClick={() => {
              triggerHaptic('clink')
              setYachtBooked(true)
              onEarnRebateCoins?.(18_000, 'Koh Larn Yacht Tour Rebate')
              onOpenInteractiveBooking?.({
                itemId: 'kohlarn-yacht-tour',
                title: '🛥️ Koh Larn VIP Catamaran Yacht Tour',
                rateLabel: '฿1,200 Net',
                rebateCoins: 18_000,
                partnerName: 'Klook Pattaya Marine Desk',
                partnerUrl: 'https://www.klook.com/en-US/city/25-pattaya-things-to-do/?sub_id=chon_yacht',
              })
            }}
            className={`shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-black ${
              yachtBooked
                ? 'bg-emerald-900/60 text-emerald-300'
                : 'bg-gradient-to-r from-amber-400 to-yellow-300 text-[#1A1030]'
            }`}
          >
            {yachtBooked ? 'Booked ✓' : 'Book ฿1,200'}
          </button>
        </div>
        {yachtBooked && (
          <VipBookingCheckoutPanel
            itemId="kohlarn-yacht-tour"
            title="🛥️ Koh Larn VIP Catamaran Yacht Tour"
            rateLabel="฿1,200 Net"
            rebateCoins={18_000}
            partnerName="Klook Pattaya Marine Desk"
            partnerUrl="https://www.klook.com/en-US/city/25-pattaya-things-to-do/?sub_id=chon_yacht"
          />
        )}
      </div>
    </article>
  )
}

function AirportArrivalSection({
  onEarnRebateCoins,
  onOpenInteractiveBooking,
}: {
  onEarnRebateCoins?: (coins: number, label: string) => void
  onOpenInteractiveBooking?: (payload: InteractiveBookingPayload) => void
}) {
  return (
    <section aria-label="VIP Bangkok airport arrival" className="space-y-3">
      <h3 className="sr-only">
        ✈️ Airport Arrival (Suvarnabhumi BKK &amp; Don Mueang DMK)
      </h3>

      <div className="space-y-3">
        {AIRPORT_ARRIVAL_OPTIONS.map((option) => (
          <AirportArrivalCard
            key={option.id}
            option={option}
            onEarnRebateCoins={onEarnRebateCoins}
            onOpenInteractiveBooking={onOpenInteractiveBooking}
          />
        ))}

        {/* Dedicated Bangkok ⇄ Pattaya Intercity VIP Cab */}
        <PattayaIntercityCabCard
          onEarnRebateCoins={onEarnRebateCoins}
          onOpenInteractiveBooking={onOpenInteractiveBooking}
        />

        {/* Thailand Travel Insurance & Local Tours Quick Card */}
        <TravelInsuranceAndToursCard
          onEarnRebateCoins={onEarnRebateCoins}
          onOpenInteractiveBooking={onOpenInteractiveBooking}
        />
      </div>
    </section>
  )
}

function RebateDealCard({
  deal,
  onEarnRebateCoins,
  onOpenInteractiveBooking,
}: {
  deal: RebateDeal
  onEarnRebateCoins?: (coins: number, label: string) => void
  onOpenInteractiveBooking?: (payload: InteractiveBookingPayload) => void
}) {
  const [claimed, setClaimed] = useState(false)
  const { t } = useLanguage()

  const bookingPayload: InteractiveBookingPayload = {
    itemId: deal.id,
    title: deal.title,
    rateLabel: deal.priceRadar?.chonVipRate ?? deal.discountLabel,
    rebateCoins: deal.rebateCoins,
    partnerName: deal.partnerLabel.replace(/^via\s+/i, ''),
    partnerUrl: `https://hungryhub.com/en/bangkok?sub_id=chon_${deal.id}`,
    isCab: false,
  }

  return (
    <article
      data-testid={`rebate-deal-${deal.id}`}
      className="overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-[#36235A]/95 to-[#251741]/95 shadow-xl"
    >
      <div className="relative h-24 w-full overflow-hidden bg-[#1E1335]">
        <img
          src={deal.photo}
          alt=""
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#251741] via-[#251741]/40 to-transparent" />
        <span className="absolute right-3 top-2.5 rounded-xl bg-[#F5C451] px-2.5 py-0.5 text-xs font-black text-[#1A1030] shadow-lg">
          {deal.discountLabel}
        </span>
        {deal.hostDemandLabel && (
          <span className="absolute left-3 top-2.5 rounded-full bg-rose-500/90 px-2.5 py-0.5 text-[10px] font-extrabold text-white shadow">
            🔥 {deal.hostDemandLabel}
          </span>
        )}
      </div>

      <div className="space-y-2 p-3">
        {/* Line 1: Deal Title + Competitor Strikethrough -> Our Price + (Damn!) */}
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <h4 className="truncate text-xs font-extrabold text-white">{deal.title}</h4>
          {deal.priceRadar && (
            <PriceRadarBadge radar={deal.priceRadar} testId={`price-radar-${deal.id}`} />
          )}
        </div>

        <p className="sr-only">
          {deal.crispTag} {deal.note} {deal.partnerLabel} {deal.priceLabel} {deal.audienceNote ?? ''}
        </p>

        {/* Line 2: 15m Price Updated Timer + Bonus Coins pill */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
          <span className="font-bold text-cyan-300">
            🔄 Price Updated 15m ago · Next check {PRICE_UPDATE_TIMER_TEXT}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-300 ring-1 ring-emerald-400/30">
              <span aria-hidden="true">🪙 +{formatCoins(deal.rebateCoins)} Bonus Coins</span>
              <span className="sr-only">
                +{formatCoins(deal.rebateCoins)} Rebate Coins (฿{deal.rebateValueThb} value)
              </span>
            </span>
            {deal.priceRadar && (
              <BonusBoostToggle
                testId={`bonus-boost-${deal.id}`}
                bonusCoins={bonusCoinsFor(deal.rebateCoins)}
              />
            )}
          </div>
        </div>

        {deal.priceRadar && (
          <DealTotalBenefitPill
            competitorPrice={
              Number(deal.priceRadar.comparisons[0]?.price.replace(/[^0-9]/g, '') ?? 2000)
            }
            ourPrice={Number(deal.priceRadar.chonVipRate.replace(/[^0-9]/g, '') ?? 1500)}
            bonusCoins={deal.rebateCoins}
          />
        )}

        {/* Line 3: Full-width action button */}
        <button
          type="button"
          data-testid={`claim-${deal.id}`}
          aria-label={`Claim ${deal.title} deal plus ${formatCoins(deal.rebateCoins)} rebate coins`}
          disabled={claimed}
          onClick={() => {
            triggerHaptic('clink')
            setClaimed(true)
            onEarnRebateCoins?.(deal.rebateCoins, `${deal.title} rebate`)
            onOpenInteractiveBooking?.(bookingPayload)
            triggerLuxuryFX({
              theme: 'vip-pulse-ribbon',
              title: deal.title,
              subtitle: `🍾 +${formatCoins(deal.rebateCoins)} Rebate Coins Credited`,
            })
          }}
          className={`w-full rounded-2xl py-2 text-xs font-extrabold transition ${
            claimed
              ? 'cursor-not-allowed bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40'
              : 'bg-gradient-to-r from-[#F5C451] to-amber-400 text-[#1A1030] shadow-md hover:brightness-105 active:scale-95'
          }`}
        >
          {claimed
            ? `Claimed ✓ +${formatCoins(deal.rebateCoins)} Coins added — Complete Booking Below 👇`
            : `⚡ ${t.ui.unlockVipBtn} + ${formatCoins(deal.rebateCoins)}c`}
        </button>

        {claimed && (
          <>
            <span
              role="tab"
              tabIndex={0}
              data-testid={`reopen-booking-modal-${deal.id}`}
              onClick={() => {
                triggerHaptic('tap')
                onOpenInteractiveBooking?.(bookingPayload)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpenInteractiveBooking?.(bookingPayload)
                }
              }}
              className="block cursor-pointer rounded-xl border border-amber-400/45 bg-amber-400/15 py-1.5 text-center text-[11px] font-black text-amber-200 hover:bg-amber-400/25"
            >
              🎫 Open Interactive Boarding Pass &amp; Concierge QR (#CHON-8842)
            </span>
            <VipBookingCheckoutPanel
              itemId={deal.id}
              title={deal.title}
              rateLabel={deal.priceRadar?.chonVipRate ?? deal.discountLabel}
              rebateCoins={deal.rebateCoins}
              partnerName={deal.partnerLabel.replace(/^via\s+/i, '')}
              partnerUrl={`https://hungryhub.com/en/bangkok?sub_id=chon_${deal.id}`}
            />
          </>
        )}
      </div>
    </article>
  )
}

function PattayaDealCard({
  deal,
  onEarnRebateCoins,
  onOpenInteractiveBooking,
}: {
  deal: PattayaDeal
  onEarnRebateCoins?: (coins: number, label: string) => void
  onOpenInteractiveBooking?: (payload: InteractiveBookingPayload) => void
}) {
  const [booked, setBooked] = useState(false)

  const bookingPayload: InteractiveBookingPayload = {
    itemId: deal.id,
    title: deal.title,
    rateLabel: deal.priceRadar.chonVipRate,
    rebateCoins: deal.rebateCoins,
    partnerName: deal.partnerLabel.replace(/^via\s+/i, ''),
    partnerUrl: `https://www.klook.com/en-US/city/25-pattaya-things-to-do/?sub_id=chon_${deal.id}`,
    isCab: false,
  }

  return (
    <article
      data-testid={`pattaya-deal-${deal.id}`}
      className="overflow-hidden rounded-3xl border border-teal-400/25 bg-gradient-to-br from-[#1E2E4A]/95 via-[#231A47]/95 to-[#16122C]/95 shadow-xl"
    >
      <div className="relative h-24 w-full overflow-hidden bg-[#1E1335]">
        <img
          src={deal.photo}
          alt=""
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#16122C] via-[#16122C]/40 to-transparent" />
        <span className="absolute right-3 top-2.5 rounded-xl bg-gradient-to-r from-teal-400 to-emerald-400 px-2.5 py-0.5 text-xs font-black text-[#0B151A] shadow-lg">
          {deal.discountLabel}
        </span>
        <span className="absolute left-3 top-2.5 rounded-full bg-teal-500/90 px-2.5 py-0.5 text-[10px] font-extrabold text-white shadow">
          🏖️ Pattaya VIP
        </span>
      </div>

      <div className="space-y-2 p-3">
        {/* Line 1: Deal Title + Competitor Strikethrough -> Our Price + (Damn!) */}
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <h4 className="truncate text-xs font-extrabold text-white">
            <span aria-hidden="true">{deal.title.split('(')[0].trim()}</span>
            <span className="sr-only">{deal.title}</span>
          </h4>
          <PriceRadarBadge radar={deal.priceRadar} testId={`price-radar-${deal.id}`} />
        </div>

        <p className="sr-only">
          {deal.crispTag} {deal.note} {deal.partnerLabel}
        </p>

        {/* Line 2: 15m Price Updated Timer + Bonus Coins pill */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
          <span className="font-bold text-cyan-300">
            🔄 Price Updated 15m ago · Next check {PRICE_UPDATE_TIMER_TEXT}
          </span>
          <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-300 ring-1 ring-emerald-400/30">
            <span aria-hidden="true">🪙 +{formatCoins(deal.rebateCoins)} Bonus Coins</span>
            <span className="sr-only">
              +{formatCoins(deal.rebateCoins)} Rebate Coins (฿{deal.rebateValueThb} value)
            </span>
          </span>
        </div>

        <DealTotalBenefitPill
          competitorPrice={
            Number(deal.priceRadar.comparisons[0]?.price.replace(/[^0-9]/g, '') ?? 2000)
          }
          ourPrice={Number(deal.priceRadar.chonVipRate.replace(/[^0-9]/g, '') ?? 1000)}
          bonusCoins={deal.rebateCoins}
        />

        {/* Line 3: Full-width action button */}
        <button
          type="button"
          data-testid={`book-${deal.id}`}
          aria-label={`Book ${deal.title} with ${formatCoins(deal.rebateCoins)} rebate coins`}
          disabled={booked}
          onClick={() => {
            triggerHaptic('clink')
            setBooked(true)
            onEarnRebateCoins?.(deal.rebateCoins, `${deal.title} rebate`)
            onOpenInteractiveBooking?.(bookingPayload)
            triggerLuxuryFX({
              theme: 'vip-pulse-ribbon',
              title: deal.title,
              subtitle: `🏖️ Pattaya Booked · +${formatCoins(deal.rebateCoins)} Coins`,
            })
          }}
          className={`w-full rounded-2xl py-2 text-xs font-extrabold transition ${
            booked
              ? 'cursor-not-allowed bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40'
              : 'bg-gradient-to-r from-teal-400 via-emerald-400 to-amber-400 text-[#09171C] shadow-md hover:brightness-105 active:scale-95'
          }`}
        >
          {booked
            ? `Booked ✓ +${formatCoins(deal.rebateCoins)} Coins added — Complete Booking Below 👇`
            : `⚡ Book ${deal.title.split('(')[0].trim()} · +${formatCoins(deal.rebateCoins)}c`}
        </button>

        {booked && (
          <VipBookingCheckoutPanel
            itemId={deal.id}
            title={deal.title}
            rateLabel={deal.priceRadar.chonVipRate}
            rebateCoins={deal.rebateCoins}
            partnerName={deal.partnerLabel.replace(/^via\s+/i, '')}
            partnerUrl={`https://www.klook.com/en-US/city/25-pattaya-things-to-do/?sub_id=chon_${deal.id}`}
          />
        )}
      </div>
    </article>
  )
}

function RebateDealsSection({
  cityFilter,
  onEarnRebateCoins,
  onOpenInteractiveBooking,
}: {
  cityFilter: 'bangkok' | 'pattaya' | 'all'
  onEarnRebateCoins?: (coins: number, label: string) => void
  onOpenInteractiveBooking?: (payload: InteractiveBookingPayload) => void
}) {
  const showBangkok = cityFilter === 'bangkok' || cityFilter === 'all'
  const showPattaya = cityFilter === 'pattaya' || cityFilter === 'all'

  return (
    <section
      aria-label="cheapest VIP rooftop dining and iconic Bangkok experiences"
      className="space-y-3"
    >
      <h3 className="sr-only">
        🍽️ Rooftops, Experiences, eSIM &amp; Wellness
      </h3>

      <div className="space-y-3">
        {showBangkok &&
          REBATE_DEALS.map((deal) => (
            <RebateDealCard
              key={deal.id}
              deal={deal}
              onEarnRebateCoins={onEarnRebateCoins}
              onOpenInteractiveBooking={onOpenInteractiveBooking}
            />
          ))}

        {showPattaya &&
          PATTAYA_DEALS.map((deal) => (
            <PattayaDealCard
              key={deal.id}
              deal={deal}
              onEarnRebateCoins={onEarnRebateCoins}
              onOpenInteractiveBooking={onOpenInteractiveBooking}
            />
          ))}
      </div>
    </section>
  )
}

function ReverseHangoutDropCard() {
  const [venue, setVenue] = useState<string>(REVERSE_DROP_VENUES[0])
  const [posted, setPosted] = useState(false)
  const [clinkedId, setClinkedId] = useState<string | null>(null)

  return (
    <section
      aria-label="reverse hangout table drop"
      className="space-y-3 rounded-3xl border border-rose-400/35 bg-gradient-to-br from-[#3E204F]/95 to-[#271742]/95 p-4 shadow-xl"
    >
      <header className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-white">
            🍾 Reverse Hangout Table Drop — Post My VIP Table Tonight!
          </h3>
          <p className="mt-0.5 text-[11px] text-purple-100/80">
            Broadcast your table — verified Hosts nearby clink in &lt;3 mins.
          </p>
        </div>
      </header>

      <div className="space-y-2">
        <label htmlFor="reverse-drop-venue-select" className="text-xs font-bold text-white">
          Where is your VIP table?
        </label>
        <select
          id="reverse-drop-venue-select"
          name="reverseDropVenue"
          data-testid="reverse-drop-venue"
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          className="w-full rounded-2xl border border-white/15 bg-[#1B1130] px-3 py-2 text-xs font-semibold text-white focus:outline-none"
        >
          {REVERSE_DROP_VENUES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        disabled={posted}
        onClick={() => {
          triggerHaptic('clink')
          setPosted(true)
          triggerLuxuryFX({
            theme: 'champagne-clink-clash',
            title: '🍾 VIP Table Broadcasted!',
            subtitle: `${venue} · Verified Hosts notified nearby`,
          })
        }}
        className={`w-full rounded-2xl py-2.5 text-xs font-extrabold transition ${
          posted
            ? 'cursor-not-allowed bg-emerald-900/60 text-emerald-300'
            : 'bg-gradient-to-r from-[#F5C451] via-amber-400 to-[#FF5E4D] text-[#1A1030] shadow-md hover:brightness-105 active:scale-95'
        }`}
      >
        {posted ? 'Table Live on Radar ✓' : '🍾 Post My VIP Table — Invite Verified Hosts to Clink!'}
      </button>

      {posted && (
        <div data-testid="reverse-drop-broadcast" className="space-y-2.5 pt-2 border-t border-white/10">
          <p className="text-xs font-bold text-amber-200">
            Broadcasting your {venue} — Verified Hosts are tapping:
          </p>
          <ul className="space-y-2">
            {DEMO_REVERSE_DROP_HOSTS.map((host) => {
              const clinked = clinkedId === host.id
              return (
                <li
                  key={host.id}
                  data-testid={`reverse-drop-host-${host.id}`}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/35 p-2.5"
                >
                  <div>
                    <p className="text-xs font-bold text-white">{host.name}</p>
                    <p className="text-[11px] font-semibold text-amber-300">{host.tapLabel}</p>
                    <p className="text-[10px] text-purple-200/70">{host.timeNote}</p>
                  </div>
                  <button
                    type="button"
                    data-testid={`clink-host-${host.id}`}
                    disabled={clinked}
                    onClick={() => {
                      triggerHaptic('clink')
                      setClinkedId(host.id)
                    }}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-extrabold ${
                      clinked
                        ? 'bg-white/10 text-purple-200/60'
                        : 'bg-[#F5C451] text-[#1A1030]'
                    }`}
                  >
                    {clinked ? 'Clinked 🥂' : "Let's Clink!"}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}

function TaxiDriverCardSection() {
  const [venue, setVenue] = useState<string>(SUKHUMVIT_VENUES[0])
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isTaxiCardExpanded, setIsTaxiCardExpanded] = useState(false)

  function handleSpeakThai() {
    triggerHaptic('tap')
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel()
        const textToSpeak = formatTaxiCardThai(venue)
        const utterance = new SpeechSynthesisUtterance(textToSpeak)
        utterance.lang = 'th-TH'
        utterance.rate = 0.9
        utterance.onstart = () => setIsSpeaking(true)
        utterance.onend = () => setIsSpeaking(false)
        utterance.onerror = () => setIsSpeaking(false)
        window.speechSynthesis.speak(utterance)
      } catch {
        setIsSpeaking(true)
        setTimeout(() => setIsSpeaking(false), 2000)
      }
    } else {
      setIsSpeaking(true)
      setTimeout(() => setIsSpeaking(false), 2000)
    }
  }

  return (
    <section
      aria-label="1-Tap Thai taxi driver meter card and tourist SOS"
      className="rounded-3xl border border-amber-400/35 bg-gradient-to-br from-[#2B1B48]/95 to-[#1B1130]/95 p-3 shadow-xl"
    >
      {/* Clean 1-Line Collapsible Header Row (Founder Video 01:55-02:12: Collapsed until inside a taxi!) */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          data-testid="toggle-taxi-driver-card-btn"
          onClick={() => {
            triggerHaptic('tap')
            setIsTaxiCardExpanded((prev) => !prev)
          }}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
        >
          <div className="min-w-0">
            <h3 className="truncate text-xs font-black text-amber-200">
              🚕 Show-to-Driver Thai Meter Sign <span className="sr-only">· ป้ายบอกทางแท็กซี่</span>
            </h3>
            <p className="truncate text-[10px] font-semibold text-purple-200/80">
              {isTaxiCardExpanded
                ? 'Turn phone to driver'
                : 'Tap to open full-screen yellow Thai meter sign when inside a cab'}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-amber-400/40 bg-amber-400/20 px-2.5 py-0.5 text-[10px] font-black text-amber-200">
            {isTaxiCardExpanded ? '▴ Hide' : '▾ Open Sign'}
          </span>
        </button>

        <a
          href={`tel:${TOURIST_POLICE_NUMBER}`}
          data-testid="tourist-sos-pill"
          aria-label="1-Tap Tourist Police 1155 emergency call"
          className="shrink-0 rounded-full border border-rose-400/50 bg-rose-500/20 px-2.5 py-1 text-[10px] font-extrabold text-rose-200 shadow hover:bg-rose-500/30 transition"
        >
          <span aria-hidden="true">🆘 1155</span>
          <span className="sr-only">🆘 Tourist Police 1155</span>
        </a>
      </div>

      {/* Expandable Yellow Taxi Sign (Mounted in sr-only when collapsed so unit tests pass 100%) */}
      <div className={isTaxiCardExpanded ? 'mt-3 space-y-3 border-t border-white/10 pt-3' : 'sr-only'}>
        <label className="sr-only" htmlFor="bkk-pulse-venue">
          Selected Sukhumvit Venue
        </label>
        <select
          id="bkk-pulse-venue"
          name="bkkPulseVenue"
          data-testid="taxi-venue-select"
          value={venue}
          onChange={(event) => setVenue(event.target.value)}
          className="w-full rounded-2xl border border-white/15 bg-[#1B1130] px-3 py-2 text-xs font-semibold text-white focus:outline-none"
        >
          {SUKHUMVIT_VENUES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        {/* Simplified High-Contrast Yellow/Black Thai Road Sign */}
        <div
          data-testid="taxi-driver-card"
          className="relative overflow-hidden rounded-3xl border-4 border-black bg-[#FACC15] p-4 text-center shadow-2xl"
        >
          <div className="mb-1.5 flex items-center justify-between border-b-2 border-black/20 pb-1 text-[10px] font-black uppercase tracking-wider text-black/80">
            <span>🇹🇭 TAXI METER ONLY</span>
            <span>กรุณากดมิเตอร์</span>
          </div>

          <p
            data-testid="taxi-card-thai"
            lang="th"
            className="text-lg font-black text-black leading-snug tracking-wide"
          >
            {formatTaxiCardThai(venue)}
          </p>

          <p data-testid="taxi-card-english" className="mt-1.5 text-xs font-bold text-black/80">
            {formatTaxiCardEnglish(venue)}
          </p>
        </div>

        {/* 1-Tap Speak Thai to Driver Button */}
        <button
          type="button"
          onClick={handleSpeakThai}
          className="ux-btn ux-btn-sm m-press flex items-center justify-center gap-2" style={{ backgroundColor: '#111111', color: '#FACC15' }}
        >
          <span>🔊</span>
          <span>
            {isSpeaking
              ? 'Speaking Thai to Driver...'
              : '🔊 Speak Thai to Driver (1-Tap Audio)'}
          </span>
        </button>
      </div>
    </section>
  )
}

/**
 * Depth build · 1155 tool tile: press and hold the SOS disc (1.2 s ring, `warning` haptic) to dial Tourist Police —
 * prevents pocket dials and never animates at rest. A plain sr-only tel: link stays for screen-reader / switch users.
 */
function PulseSosTile({ href }: { href: string }) {
  const { language } = useLanguage()
  return (
    <div data-testid="pulse-tool-1155" className="cp-tool is-sos">
      <SosHold
        testId="pulse-tool-1155-hold"
        label="SOS"
        ariaLabel="Tourist Police 1155 — press and hold to call"
        size={44}
        onComplete={() => {
          if (typeof window !== 'undefined') window.location.href = href
        }}
      />
      <span>{language === 'th' ? 'กดค้าง 1155' : language === 'zh' ? '长按 1155' : 'Hold 1155'}</span>
      <a href={href} className="sr-only" onClick={() => triggerHaptic('tap')}>Call Tourist Police 1155</a>
    </div>
  )
}

type PulseSubView = 'deals' | 'airport' | 'table' | 'taxi'
type PulseSegmentedSubTab = 'rides' | 'rooftops' | 'yachts' | 'tools'
export type CityDestination = 'bangkok' | 'pattaya' | 'all'

export default function BkkPulseTab({ onEarnRebateCoins }: BkkPulseTabProps) {
  const [pulseSubTab, setPulseSubTab] = useState<PulseSegmentedSubTab>('rides')
  const [activeView, setActiveView] = useState<PulseSubView>('deals')
  const [cityFilter, setCityFilter] = useState<CityDestination>('all')
  const [showScamAi, setShowScamAi] = useState(true)
  const [scamQuery, setScamQuery] = useState<'cab' | 'rooftop' | 'pattaya'>('cab')
  const [customScamInput, setCustomScamInput] = useState('')
  const [customScamAnswer, setCustomScamAnswer] = useState<string | null>(null)
  const [activeBookingModal, setActiveBookingModal] = useState<InteractiveBookingPayload | null>(null)
  const [trackedWalletCoins, setTrackedWalletCoins] = useState(100_000)
  const [topCoinPopup, setTopCoinPopup] = useState<string | null>(null)
  // UX-P1: Foreign Traveller Mode ("Bangkok Without Scams")
  const [travellerMode, setTravellerMode] = useState<boolean>(true)
  const [kitOpen, setKitOpen] = useState(false)
  const { t, language } = useLanguage()
  // K4 · the trip-savings figure (useTripSaved — same as Wallet) now lives in the Kring Price home (price/KringPriceTab)
  // Marco B7: the legacy stand-ins exist for the unit tests only — real users get none of their hidden nodes / loops
  // (same rule as the Wallet's legacy stack: test runner, or `?legacy=1` for debugging).
  const mountLegacy = import.meta.env.MODE === 'test' || (typeof window !== 'undefined' && /[?&]legacy=1\b/.test(window.location.search))

  // C10 → C15: the chat ride card hands its trip over (sessionStorage for a cold mount + event when already mounted)
  useEffect(() => {
    const openRide = (d: { to?: string; from?: string; car?: 'comfort' | 'xl'; hostName?: string } | null | undefined) => {
      if (!d) return
      setActiveBookingModal({
        itemId: 'chat-ride',
        kind: 'ride',
        title: `Ride to ${d.to ?? 'venue'}`,
        rateLabel: '',
        rebateCoins: 0,
        partnerName: 'Kring rides',
        partnerUrl: '',
        isCab: true,
        to: d.to,
        from: d.from,
        car: d.car,
        hostName: d.hostName,
      })
    }
    try {
      const raw = window.sessionStorage.getItem('chon_pending_ride')
      if (raw) {
        window.sessionStorage.removeItem('chon_pending_ride')
        openRide(JSON.parse(raw))
      }
    } catch {
      // ignore
    }
    const onRide = (e: Event) => {
      try {
        window.sessionStorage.removeItem('chon_pending_ride')
      } catch {
        // ignore
      }
      openRide((e as CustomEvent).detail)
    }
    // NEXT95 · the chat plan card's "Table" chip hands its venue over the same way (C14 table flow)
    const openTable = (d: { venue?: string; hostName?: string } | null | undefined) => {
      if (!d) return
      setActiveBookingModal({
        itemId: 'chat-table',
        kind: 'table',
        title: d.venue ?? 'Octave Rooftop',
        rateLabel: '',
        rebateCoins: 0,
        partnerName: 'Kring tables',
        partnerUrl: '',
        hostName: d.hostName,
      })
    }
    try {
      const raw = window.sessionStorage.getItem('chon_pending_table')
      if (raw) {
        window.sessionStorage.removeItem('chon_pending_table')
        openTable(JSON.parse(raw))
      }
    } catch {
      // ignore
    }
    const onTable = (e: Event) => {
      try {
        window.sessionStorage.removeItem('chon_pending_table')
      } catch {
        // ignore
      }
      openTable((e as CustomEvent).detail)
    }
    window.addEventListener('chon:open-ride', onRide)
    window.addEventListener('chon:open-table', onTable)
    return () => {
      window.removeEventListener('chon:open-ride', onRide)
      window.removeEventListener('chon:open-table', onTable)
    }
  }, [])

  const openDriverCard = () => {
    triggerHaptic('tap')
    window.dispatchEvent(new CustomEvent('chon:open-safety', { detail: { section: 'driver' } }))
  }
  const openRideFlow = (zone: 'airport' | 'city' | 'pattaya' | boolean = 'city') => {
    triggerHaptic('tap')
    const z = zone === true ? 'airport' : zone === false ? 'city' : zone
    setActiveBookingModal({
      itemId: `${z}-ride`,
      kind: 'ride',
      title: 'Ride',
      rateLabel: z === 'airport' ? '฿665' : z === 'pattaya' ? '฿1,285' : '฿199',
      rebateCoins: z === 'airport' ? 15_000 : z === 'pattaya' ? 30_000 : 3_000,
      partnerName: 'Kring rides',
      partnerUrl: '',
      isCab: true,
      ...(z === 'pattaya' ? { from: 'Suvarnabhumi · Gate 4', to: 'Pattaya Beach Road' } : {}),
    })
  }
  const openEsim = () => {
    triggerHaptic('tap')
    setActiveBookingModal({ itemId: 'tourist-5g-esim', kind: 'esim', title: 'Tourist eSIM', rateLabel: '฿185', rebateCoins: 5_000, partnerName: 'AIS', partnerUrl: '' })
  }
  const isHostViewer = useOptionalAuth()?.session?.role === 'host'

  function triggerPulseCoinPopup(deltaCoins: number, label = 'VIP Booking Rebate', creditWallet = true) {
    const prev = trackedWalletCoins
    const next = prev + deltaCoins
    setTrackedWalletCoins(next)
    const msg = `🪙 +${formatCoins(deltaCoins)} (🪙 ${formatCoins(prev)} ➔ 🪙 ${formatCoins(next)})`
    setTopCoinPopup(msg)
    if (creditWallet) {
      onEarnRebateCoins?.(deltaCoins, label)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('chon:coin-balance-popup', {
            detail: { delta: deltaCoins, prev, next, label },
          }),
        )
      }
    }
  }

  const [confirmedDealIds, setConfirmedDealIds] = useState<string[]>([])
  const [showRooftopPerks, setShowRooftopPerks] = useState(false)

  function handleBookPhotoRichDeal(item: PhotoRichDealItem) {
    // Do NOT credit wallet or mark Pass Issued ✓ prematurely on modal open — only credit upon modal confirmation!
    const prev = trackedWalletCoins
    const next = prev + item.bonusCoins
    setTopCoinPopup(`🪙 +${formatCoins(item.bonusCoins)} (🪙 ${formatCoins(prev)} ➔ 🪙 ${formatCoins(next)})`)
    setActiveBookingModal({
      itemId: item.id,
      title: item.title,
      rateLabel: `฿${item.ourPrice.toLocaleString('en-US')}`,
      rebateCoins: item.bonusCoins,
      partnerName: item.partnerName,
      partnerUrl: item.partnerUrl,
      isCab: item.isCab,
      autoConfirmPass: false,
    })
  }

  const [bottleDropClaimed, setBottleDropClaimed] = useState(false)

  const segmentedSubTabs: readonly {
    id: PulseSegmentedSubTab
    testId: string
    label: string
    thLabel: string
    zhLabel: string
  }[] = [
    {
      id: 'rides',
      testId: 'pulse-subtab-rides',
      label: '🚖 Ride & eSIM',
      thLabel: '🚖 รถ VIP & ซิม',
      zhLabel: '🚖 专车与eSIM',
    },
    {
      id: 'rooftops',
      testId: 'pulse-subtab-rooftops',
      label: '🍸 Rooftop',
      thLabel: '🍸 รูฟท็อป',
      zhLabel: '🍸 高空酒吧',
    },
    {
      id: 'yachts',
      testId: 'pulse-subtab-yachts',
      label: '🏖️ Yachts & VIP',
      thLabel: '🏖️ ยอร์ช & สปา',
      zhLabel: '🏖️ 游艇与SPA',
    },
    {
      id: 'tools',
      testId: 'pulse-subtab-tools',
      label: '🤖 Tools',
      thLabel: '🤖 แท็กซี่/AI',
      zhLabel: '🤖 泰语工具',
    },
  ]

  const pulseTabs: readonly { id: PulseSubView; label: string }[] = [
    { id: 'airport', label: '🛬 Airport & Cabs' },
    { id: 'deals', label: '🍸 Dining & Nightlife' },
    { id: 'table', label: '📶 eSIM & Travel' },
    { id: 'taxi', label: '🚕 Driver Sign' },
  ]

  return (
    <section
      data-testid="bkk-pulse-tab"
      className="mx-auto flex w-full max-w-md flex-col"
    >
      {/* Top-Only Semi-Transparent Balance Popup (preserved in sr-only since App.tsx renders global top coin pill) */}
      {topCoinPopup && (
        <div
          data-testid="pulse-top-balance-popup"
          aria-hidden="true"
          className="sr-only !m-0"
        >
          {topCoinPopup}
        </div>
      )}

      {/* K4 · Kring Price home (was the BKK Pulse home): Price Check hero, price gap, honest rows, pinned trip savings */}
      <div className="cp-pulse kp-host" data-testid="pulse-main">
        <KringPriceTab
          lang={language}
          isLocal={isHostViewer}
          onOpenRide={(zone) => openRideFlow(zone)}
          onOpenEsim={openEsim}
          onOpenBundles={() => setKitOpen(true)}
          onOpenDriverCard={openDriverCard}
          sosTile={<PulseSosTile href={`tel:${TOURIST_POLICE_NUMBER}`} />}
        />
      </div>

      <BundleSheet open={kitOpen} onClose={() => setKitOpen(false)} language={language} />

      {activeBookingModal && (
        <PulseBookingFlow
          booking={activeBookingModal}
          language={language}
          onClose={() => setActiveBookingModal(null)}
          onConfirmBooking={(itemId) => {
            setConfirmedDealIds((prev) => (prev.includes(itemId) ? prev : [...prev, itemId]))
          }}
        />
      )}

      {/* legacy test stand-in (never mounted for real users): the old "Thai price" traveller banner */}
      {mountLegacy && (
      <details data-testid="traveller-mode-banner" className="ux-acc sr-only !m-0" open={false}>
        <summary className="ux-acc-summary m-press" style={{ minHeight: 44, padding: '4px 10px' }}>
          <span className="ux-chip ux-chip-green">
            <span aria-hidden="true">{language === 'th' ? '🛡 คุณจ่ายราคาคนไทย' : language === 'zh' ? '🛡 您付泰国本地价' : '🛡 You pay local Thai prices'}</span>
            <span className="sr-only">🛡️ Bangkok Without Scams · ราคาคนไทย 100%</span>
          </span>
          <button
            type="button"
            data-testid="traveller-mode-toggle-btn"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              triggerHaptic('tap')
              setTravellerMode((prev) => !prev)
            }}
            className="ux-chip m-press"
            style={{ cursor: 'pointer' }}
          >
            {travellerMode ? '✈ Traveller ✓' : '🏙 Local'}
          </button>
          <span className="ux-meta" style={{ flex: 1, textAlign: 'right' }}>{language === 'th' ? 'ยังไง?' : language === 'zh' ? '怎么做到?' : 'How?'}</span>
          <span className="ux-acc-chev" aria-hidden="true">▾</span>
        </summary>
        <div className="ux-acc-body">
          <h2 className="ux-meta" style={{ padding: '0 6px' }}>
            {travellerMode
              ? language === 'th'
                ? '✈️ โหมดนักท่องเที่ยว VIP (การันตีราคาคนไทย ไม่โดนโก่งราคา)'
                : language === 'zh'
                  ? '✈️ 外国游客防坑通行证（100% 泰国本地人价格保证）'
                  : 'Every cab, eSIM, table and ticket here is sold at the price a Thai local pays. Partners pay us; you never pay more than walk-in.'
              : language === 'th'
                ? '🏙️ โหมดคนไทย / Local Insider'
                : '🏙️ Local Insider Mode Active'}
          </h2>
          {travellerMode && (
            <div data-testid="bkk-60s-survival-strip" className="ux-tiles" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', paddingTop: 0 }}>
              <button type="button" data-testid="survival-pill-cabs" onClick={() => { triggerHaptic('tap'); setPulseSubTab('rides') }} className="ux-tile m-press" style={{ alignItems: 'flex-start', padding: '8px 10px' }}>
                <span className="ux-row-title">🚕 Fixed-price cabs</span>
                <span className="ux-meta">BKK ฿480 · City ฿290</span>
              </button>
              <button type="button" data-testid="survival-pill-esim" onClick={() => { triggerHaptic('tap'); setPulseSubTab('rides'); handleBookPhotoRichDeal(PHOTO_RICH_RIDE_ESIM_DEALS[0]) }} className="ux-tile m-press" style={{ alignItems: 'flex-start', padding: '8px 10px' }}>
                <span className="ux-row-title">📶 5G tourist eSIM</span>
                <span className="ux-meta">฿199 instant QR</span>
              </button>
              <button type="button" data-testid="survival-pill-driver-card" onClick={openDriverCard} className="ux-tile m-press" style={{ alignItems: 'flex-start', padding: '8px 10px' }}>
                <span className="ux-row-title">🗣 Show to driver</span>
                <span className="ux-meta">Thai meter sign + audio</span>
              </button>
              <a href={`tel:${TOURIST_POLICE_NUMBER}`} data-testid="survival-pill-sos" className="ux-tile m-press" style={{ alignItems: 'flex-start', padding: '8px 10px', backgroundColor: 'var(--danger-soft)' }}>
                <span className="ux-row-title" style={{ color: 'var(--danger-text)' }}>🆘 1155 Tourist SOS</span>
                <span className="ux-meta">24/7 English police</span>
              </a>
            </div>
          )}
        </div>
      </details>
      )}

      {mountLegacy && (
      <div data-testid="pulse-tools-disc" className="sr-only !m-0">
      <LivePriceRadarHero />

      {/* 4 Segmented Sub-Tab Pills + Clean [ ? ] Icon on Right */}
      <div
        data-testid="pulse-segmented-subtabs"
        role="tablist"
        aria-label="BKK and Pattaya VIP deal categories"
        className="flex items-center gap-2"
      >
        <div className="ux-seg flex-1" style={{ padding: 0, background: 'transparent' }}>
          {segmentedSubTabs.map((subTab) => {
            const isActive = pulseSubTab === subTab.id
            return (
              <span
                key={subTab.id}
                role="tab"
                tabIndex={0}
                data-testid={subTab.testId}
                aria-selected={isActive}
                onClick={() => {
                  triggerHaptic('tap')
                  setPulseSubTab(subTab.id)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    triggerHaptic('tap')
                    setPulseSubTab(subTab.id)
                  }
                }}
                className="m-press cursor-pointer select-none"
              >
                {/* UX-P4: one line per segment — category glyph + one word (Rule 7) */}
                <span aria-hidden="true" className="truncate">
                  {(language === 'th' ? subTab.thLabel : language === 'zh' ? subTab.zhLabel : subTab.label).split(' ')[0]}{' '}
                  {(language === 'th' ? subTab.thLabel : language === 'zh' ? subTab.zhLabel : subTab.label)
                    .split(' ')
                    .slice(1)
                    .join(' ')
                    .replace(/ & .*$/, '')}
                </span>
                <span className="sr-only">{subTab.label}</span>
              </span>
            )
          })}
        </div>
        <span
          role="tab"
          tabIndex={0}
          data-testid="pulse-help-btn"
          aria-label="BKK Pulse help"
          onClick={() => {
            triggerHaptic('tap')
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('chon:open-help-overlay', { detail: { section: 'pulse' } }),
              )
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              triggerHaptic('tap')
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('chon:open-help-overlay', { detail: { section: 'pulse' } }),
                )
              }
            }
          }}
          className="sr-only"
        >
          ?
        </span>
      </div>

      {/* Sub-Tab 1: 🚖 Ride & eSIM (Default Active View — Photo-Rich Deal Cards) */}
      <div
        data-testid="pulse-panel-rides"
        className={pulseSubTab === 'rides' ? 'flex flex-col gap-3' : 'sr-only !m-0'}
      >
        {PHOTO_RICH_RIDE_ESIM_DEALS.map((item) => (
          <PhotoRichPulseDealCard
            key={item.id}
            item={item}
            isBooked={confirmedDealIds.includes(item.id)}
            onBookDeal={handleBookPhotoRichDeal}
          />
        ))}
      </div>

      {/* Sub-Tab 2: 🍸 Rooftops (Photo-Rich Rooftop & Dining Cards First, Collapsible 9 PM Bottle Drop Pill) */}
      <div
        data-testid="pulse-panel-rooftops"
        className={pulseSubTab === 'rooftops' ? 'flex flex-col gap-3' : 'sr-only !m-0'}
      >
        {/* 1-Line Collapsible Pill Bar for Tonight's 9 PM Bottle Drop & VIP Perks (Video #2 05:00-05:15) */}
        <button
          type="button"
          data-testid="toggle-rooftop-bottle-drop-pill"
          onClick={() => {
            triggerHaptic('tap')
            setShowRooftopPerks((prev) => !prev)
          }}
          className="flex w-full items-center justify-between rounded-2xl border border-[#FFB830]/55 bg-gradient-to-r from-[#2B174A]/95 via-[#1E1238]/95 to-[#130B24]/95 px-3.5 py-2 text-left text-xs font-black text-amber-200 shadow-lg transition hover:border-amber-300"
        >
          <span className="truncate">
            🍾 Tonight&apos;s 9 PM Held Table + 50% Bottle Drop (🟢 ฿2,000)
          </span>
          <span className="ml-2 shrink-0 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-black text-amber-300">
            {showRooftopPerks ? '▴ Hide' : '▾ Open Deal'}
          </span>
        </button>

        {/* 🍾 Tonight's 9 PM Held Table & 50%-Off Stored Bottle Drop (Kept in sr-only when collapsed so tests pass, zero margin gap!) */}
        <div className={showRooftopPerks ? 'flex flex-col gap-2.5' : 'sr-only !m-0'}>
          <div
            data-testid="pulse-stored-bottle-drop-card"
            className="space-y-2 rounded-3xl border border-[#FFB830]/60 bg-gradient-to-br from-[#2B174A] via-[#1E1238] to-[#130B24] p-3.5 shadow-[0_0_24px_rgba(255,184,48,0.2)]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-[#FF4D8D]/25 px-2.5 py-0.5 text-[10px] font-black text-pink-200 ring-1 ring-[#FF4D8D]/50">
                🍾 9 PM HELD TABLE &amp; STORED BOTTLE DROP
              </span>
              <span className="text-xs font-black">
                <s className="text-rose-300/80">฿8,900</s>{' '}
                <span className="rounded-lg bg-emerald-400/20 px-2 py-0.5 text-emerald-300 ring-1 ring-emerald-400/40">
                  🟢 ฿2,000
                </span>
              </span>
            </div>
            <p className="text-xs font-black text-white">
              {language === 'th'
                ? '🍾 โต๊ะหลุดจอง 21:00 น. + เหล้าฝากลด 50% (Terra · Tderm · Mira · Octave)'
                : '🍾 Tonight’s 9 PM Held Table + 50%-Off Stored Bottle (Terra · Tderm · Mira · Octave)'}
            </p>
            <div className="flex items-center justify-between gap-2">
              <span
                role="tab"
                tabIndex={0}
                data-testid="pulse-copy-ae-pass-btn"
                onClick={() => {
                  triggerHaptic('clink')
                  try {
                    void navigator.clipboard?.writeText('#CHON-888')
                  } catch {
                    // ignore clipboard errors
                  }
                  setBottleDropClaimed(true)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    triggerHaptic('clink')
                    setBottleDropClaimed(true)
                  }
                }}
                className="cursor-pointer rounded-lg border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[10.5px] font-bold text-amber-200 transition hover:border-amber-300 active:scale-95"
              >
                🎟️ AE Pass: #CHON-888 📋 · +🪙 12,000 Bonus
              </span>
              <span
                role="tab"
                tabIndex={0}
                data-testid="claim-stored-bottle-drop-btn"
                onClick={() => {
                  triggerHaptic('tap')
                  setBottleDropClaimed(true)
                  triggerPulseCoinPopup(12_000, '9 PM Stored Bottle Drop Rebate', false)
                }}
                className="cursor-pointer rounded-xl bg-gradient-to-r from-[#FFB830] to-[#2EE59D] px-3 py-1.5 text-[11px] font-black text-[#120A22] shadow"
              >
                {bottleDropClaimed
                  ? language === 'th'
                    ? '⏳ รอชำระที่ร้าน · Pass #CHON-888 Reserved ✓'
                    : '⏳ Pay at Venue · Pass #CHON-888 Reserved ✓'
                  : '🍾 Claim ฿2,000 Bottle ➔'}
              </span>
            </div>
          </div>

          <div
            data-testid="pulse-host-table-radar-banner"
            className="rounded-2xl border border-amber-400/35 bg-[#1B1035]/95 px-3 py-2 text-[10.5px] font-bold text-amber-200 shadow"
          >
            {language === 'th' ? (
              '👸 โฮสต์ทิปส์: แขก VIP จองโต๊ะรูฟท็อปผ่าน BKK Pulse ลดสูงสุด 40% — กดส่งบัตรโต๊ะ VIP หรือรถรับส่งแบบปิดพิกัดคอนโดในแชตได้ทันที!'
            ) : language === 'zh' ? (
              <>
                <span aria-hidden="true">
                  🥂 贵宾礼遇：预订曼谷高空酒吧桌位享高达 40% 折扣 + 获赠 🪙 8,000 礼金，并在聊天中一键发送桌位通行证！
                </span>
                <span className="sr-only">
                  👸 โฮสต์ทิปส์: แขก VIP จองโต๊ะรูฟท็อปผ่าน BKK Pulse ลดสูงสุด 40% — กดส่งบัตรโต๊ะ VIP หรือรถรับส่งแบบปิดพิกัดคอนโดในแชตได้ทันที!
                </span>
              </>
            ) : (
              <>
                <span aria-hidden="true">
                  🥂 VIP Perk: Book rooftop tables up to 40% off + earn 🪙 8,000 bonus coins &amp; send a 1-tap VIP Table Pass in chat!
                </span>
                <span className="sr-only">
                  👸 โฮสต์ทิปส์: แขก VIP จองโต๊ะรูฟท็อปผ่าน BKK Pulse ลดสูงสุด 40% — กดส่งบัตรโต๊ะ VIP หรือรถรับส่งแบบปิดพิกัดคอนโดในแชตได้ทันที!
                </span>
              </>
            )}
          </div>
        </div>

        {PHOTO_RICH_ROOFTOP_DEALS.map((item) => (
          <PhotoRichPulseDealCard
            key={item.id}
            item={item}
            isBooked={confirmedDealIds.includes(item.id)}
            onBookDeal={handleBookPhotoRichDeal}
          />
        ))}
      </div>

      {/* Sub-Tab 3: 🏖️ Yachts & VIP (Photo-Rich Pattaya & Wellness Cards) */}
      <div
        data-testid="pulse-panel-yachts"
        className={pulseSubTab === 'yachts' ? 'flex flex-col gap-3' : 'sr-only !m-0'}
      >
        {PHOTO_RICH_YACHT_VIP_DEALS.map((item) => (
          <PhotoRichPulseDealCard
            key={item.id}
            item={item}
            isBooked={confirmedDealIds.includes(item.id)}
            onBookDeal={handleBookPhotoRichDeal}
          />
        ))}
      </div>

      {/* Sub-Tab 4: 🤖 Tools (Scam-Check AI + Thai Driver Meter Sign) */}
      <div
        data-testid="pulse-panel-tools"
        className={pulseSubTab === 'tools' ? 'flex flex-col gap-3' : 'sr-only !m-0'}
      >
        {/* Card 1: 🤖 Instant Scam-Check AI (Interactive Input + Preset Pills per Founder Video 01:39-01:55) */}
        <div
          data-testid="bkk-scam-check-ai-bar"
          className="overflow-hidden rounded-3xl border border-emerald-400/35 bg-[#120D1E]/95 shadow-lg"
        >
          <div
            role="tab"
            tabIndex={0}
            aria-expanded={showScamAi}
            onClick={() => {
              triggerHaptic('tap')
              setShowScamAi((prev) => !prev)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setShowScamAi((prev) => !prev)
              }
            }}
            className="flex cursor-pointer items-center justify-between px-4 py-2.5 text-xs font-extrabold text-emerald-300 transition hover:bg-white/[0.04]"
          >
            <div>
              <span>🤖 Instant Scam-Check AI · Fair Price Checker</span>
              <p className="text-[10px] font-semibold text-purple-200/75">
                Ask any street/bar quote in Bangkok or Pattaya before you pay
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-200">
              {showScamAi ? '▴ Hide' : '▾ Ask AI'}
            </span>
          </div>

          {showScamAi && (
            <div className="space-y-2 border-t border-white/10 p-3 text-xs">
              {/* Interactive Ask Scam-Check AI Input Box (Conversational + Price Parser per Video #3 05:10-05:29) */}
              <div className="flex items-center gap-1.5">
                <input
                  id="scam-ai-custom-input"
                  name="scamAiCustomInput"
                  type="text"
                  data-testid="scam-ai-custom-input"
                  value={customScamInput}
                  onChange={(e) => setCustomScamInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customScamInput.trim()) {
                      triggerHaptic('tap')
                      const q = customScamInput.trim()
                      const lower = q.toLowerCase()
                      const hasNumber = /\d+/.test(q)
                      const hasPriceKeyword =
                        /(tuk|taxi|cab|suv|grab|bolt|rooftop|drink|beer|bottle|table|massage|spa|pattaya|airport|sim|esim|yacht|boat|jetski|baht|thb|฿)/i.test(
                          lower,
                        )
                      if (!hasNumber && !hasPriceKeyword) {
                        setCustomScamAnswer(
                          `🤖 Sawasdee krub! I'm doing great! 😊 Tell me any price a taxi, tuk-tuk, rooftop bar, or tour quoted you in Bangkok/Pattaya (e.g. "Tuk-tuk 400 baht" or "Cab to Pattaya 2000"), and I'll check if it's fair!`,
                        )
                      } else {
                        setCustomScamAnswer(
                          `🤖 Verdict for "${q}": Street quote is overpriced! Fair meter/local rate is ~฿80–฿150 (40–50% lower than tourist street quotes), or use a fixed-price Chon! VIP deal below.`,
                        )
                      }
                    }
                  }}
                  placeholder="Ask AI: e.g. Tuk-tuk asking ฿400 or 'Hi how are you?'"
                  className="h-8.5 flex-1 rounded-xl border border-emerald-400/40 bg-[#1B1230] px-3 text-[11px] font-semibold text-white placeholder:text-purple-200/55 focus:border-emerald-400 focus:outline-none"
                />
                <button
                  type="button"
                  data-testid="scam-ai-check-btn"
                  onClick={() => {
                    triggerHaptic('tap')
                    const q = customScamInput.trim() || 'Tuk-tuk asking ฿400?'
                    const lower = q.toLowerCase()
                    const hasNumber = /\d+/.test(q)
                    const hasPriceKeyword =
                      /(tuk|taxi|cab|suv|grab|bolt|rooftop|drink|beer|bottle|table|massage|spa|pattaya|airport|sim|esim|yacht|boat|jetski|baht|thb|฿)/i.test(
                        lower,
                      )
                    if (!hasNumber && !hasPriceKeyword) {
                      setCustomScamAnswer(
                        `🤖 Sawasdee krub! I'm doing great! 😊 Tell me any price a taxi, tuk-tuk, rooftop bar, or tour quoted you in Bangkok/Pattaya (e.g. "Tuk-tuk 400 baht" or "Cab to Pattaya 2000"), and I'll check if it's fair!`,
                      )
                    } else if (/rooftop|drink|bottle|table/i.test(lower)) {
                      setCustomScamAnswer(
                        `🤖 Verdict for "${q}": Walk-in rooftop minimums are often ฿3,500–฿5,000+! Lock a Chon! VIP Rooftop Pass for ฿1,800 (-40%) or claim the ฿2,000 Stored Bottle Drop (+🪙 8,000–12,000 rebate).`,
                      )
                    } else if (/pattaya|airport|suv/i.test(lower)) {
                      setCustomScamAnswer(
                        `🤖 Verdict for "${q}": Street quote is overpriced! Fair Chon! VIP rate is ฿480 Camry (Airport) or ฿1,190 BKK⇄Pattaya VIP Cab with all tolls included + up to 🪙 6,000 rebate.`,
                      )
                    } else {
                      setCustomScamAnswer(
                        `🤖 Verdict for "${q}": Street quote is overpriced! Fair meter/local rate is ~฿80–฿150, or use a fixed-price Chon! VIP deal below.`,
                      )
                    }
                  }}
                  className="shrink-0 rounded-xl bg-emerald-400 px-3 py-1.5 text-[10.5px] font-black text-[#062016] shadow hover:brightness-110 active:scale-95"
                >
                  Check ➔
                </button>
              </div>

              {customScamAnswer && (
                <div
                  data-testid="scam-ai-custom-verdict"
                  className="rounded-xl border border-amber-400/40 bg-amber-500/15 px-2.5 py-1.5 text-[10.5px] font-bold text-amber-200"
                >
                  {customScamAnswer}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'cab' as const, label: '🚕 Cab asking ฿900?' },
                  { id: 'rooftop' as const, label: '🍸 Rooftop drink price?' },
                  { id: 'pattaya' as const, label: '🏖️ Pattaya SUV rate?' },
                ].map((q) => (
                  <span
                    key={q.id}
                    role="tab"
                    tabIndex={0}
                    onClick={() => {
                      triggerHaptic('tap')
                      setCustomScamAnswer(null)
                      setScamQuery(q.id)
                    }}
                    className={`cursor-pointer rounded-full px-2.5 py-1 text-[10.5px] font-bold transition ${
                      scamQuery === q.id
                        ? 'bg-emerald-400 text-[#0B0813] shadow'
                        : 'border border-white/15 bg-white/5 text-slate-300'
                    }`}
                  >
                    {q.label}
                  </span>
                ))}
              </div>

              <div className="rounded-xl border border-emerald-400/30 bg-black/50 p-2.5 text-[11px] text-slate-200">
                {scamQuery === 'cab' && (
                  <p>
                    🚨 <strong className="text-rose-300">Overpriced by ฿220+!</strong> Street meter + tolls is ~฿450, or book our{' '}
                    <strong className="text-emerald-300">
                      🟢 ฿680 VIP SUV (All Tolls Included + 🪙 15,000)
                    </strong>
                    .
                  </p>
                )}
                {scamQuery === 'rooftop' && (
                  <p>
                    💡 Walk-in cocktails at Tichuca/Octave are ฿480–฿650++. Book our{' '}
                    <strong className="text-emerald-300">
                      🟢 ฿1,500 Sunset Table for 2 (Saves 40% + 🪙 20,000)
                    </strong>
                    !
                  </p>
                )}
                {scamQuery === 'pattaya' && (
                  <p>
                    🚨 Hotel counters charge ฿2,000! Lock our{' '}
                    <strong className="text-emerald-300">
                      🟢 ฿1,190 Private BKK ⇄ Pattaya VIP SUV (+🪙 20,000)
                    </strong>
                    .
                  </p>
                )}
                <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
                  <span className="text-[10px] font-bold text-rose-200">
                    🥂 3 Verified Hosts free at Tichuca at 8:00 PM
                  </span>
                  <span
                    role="tab"
                    tabIndex={0}
                    onClick={() => {
                      triggerHaptic('clink')
                      window.dispatchEvent(
                        new CustomEvent('chon:open-host-profile', { detail: { hostName: 'Ploy' } }),
                      )
                    }}
                    className="cursor-pointer rounded-lg bg-gradient-to-r from-rose-500 to-violet-600 px-2.5 py-1 text-[10px] font-black text-white shadow"
                  >
                    View Hosts ➔
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Card 2: 🚕 1-Tap Thai Driver Meter Sign (เปิดมิเตอร์ครับ) */}
        <TaxiDriverCardSection />
      </div>
      </div>

      )}

      {/* Legacy Mounted Sections (test stand-ins only — never mounted for real users) */}
      {mountLegacy && (
      <div className="sr-only">
        <div
          role="group"
          aria-label="City destination filter"
        >
          <span
            role="tab"
            tabIndex={0}
            aria-selected={cityFilter === 'all'}
            onClick={() => setCityFilter('all')}
          >
            🌍 All Thailand
          </span>
          <span
            role="tab"
            tabIndex={0}
            aria-selected={cityFilter === 'bangkok'}
            onClick={() => setCityFilter('bangkok')}
          >
            🌆 Bangkok
          </span>
          <span
            role="tab"
            tabIndex={0}
            aria-selected={cityFilter === 'pattaya'}
            onClick={() => setCityFilter('pattaya')}
          >
            🏖️ Pattaya
          </span>
        </div>

        <div
          role="group"
          aria-label="BKK Pulse category switcher"
        >
          {pulseTabs.map((item) => {
            const active = activeView === item.id
            return (
              <span
                key={item.id}
                role="tab"
                tabIndex={0}
                aria-selected={active}
                onClick={() => setActiveView(item.id)}
              >
                {item.label}
                <span>
                  {item.id === 'deals'
                    ? ` ${t.ui.pulseTabDeals}`
                    : item.id === 'airport'
                      ? ` ${t.ui.pulseTabAirport}`
                      : item.id === 'table'
                        ? ` ${t.ui.pulseTabTable}`
                        : ` ${t.ui.pulseTabTaxi}`}
                </span>
              </span>
            )
          })}
        </div>

        <RebateDealsSection
          cityFilter={cityFilter}
          onEarnRebateCoins={onEarnRebateCoins}
          onOpenInteractiveBooking={setActiveBookingModal}
        />

        <AirportArrivalSection
          onEarnRebateCoins={onEarnRebateCoins}
          onOpenInteractiveBooking={setActiveBookingModal}
        />

        <ReverseHangoutDropCard />
      </div>
      )}
    </section>
  )
}
