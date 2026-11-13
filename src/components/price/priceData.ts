/**
 * K4 · Kring Price — the ONE data table behind the Kring Price tab (price-gap hero, honest rows, Price Check).
 *
 * Three numbers per item, never mixed up:
 *   tourist   = the first quote a visitor usually gets (street, hotel desk, airport counter). Struck through in RED.
 *               Every tourist price carries a real, dated source (`touristSource`) — invented "was" prices are illegal
 *               (Thai OCPB, UK ASA) and the founder rule is "real gaps are big enough".
 *   elsewhere = the cheapest like-for-like price we found elsewhere (an app, a box office). Shown small, honestly, even
 *               when it is lower than ours. Comes from pulse/floorPrices.ts where the item exists there, so the trip
 *               savings (FLOOR − OURS, lib/tripSavings.ts) and these rows can never disagree.
 *   kring     = the fair all-in Kring price, the same for every passport. Marigold.
 *
 * "Save ฿X vs tourist price" on a row / the hero = tourist − kring, shown ONLY when the tourist price is solid
 *   (`showsTouristGap`): a dated source that states that figure for that exact thing.
 * "You saved ฿X this trip" = Σ (floor − ours) of what was really booked (useTripSaved) — the same number as Wallet.
 *
 * How to change it: edit KRING_PRICE_ITEMS (keep ids stable — analytics + share links use them). A new tourist price
 * needs `touristSource` with a URL and the date it was looked at; otherwise leave the item out.
 * Price Check rules live in PRICE_RULES below (keywords → usual range + short reason + the Kring alternative).
 */
import { FLOOR_PRICES } from '../pulse/floorPrices'
import { getExperience } from '../../lib/experiences'

export type KringCity = 'bangkok' | 'pattaya'

/** The day the tourist prices below were last looked up (YYYY-MM-DD). Shown as "checked 21 Oct". */
export const PRICES_CHECKED = '2026-10-21'
/** The day the "cheapest elsewhere" floors were recorded (pulse/floorPrices.ts, round-1 board "checked 20 Oct"). */
export const FLOORS_CHECKED = '2026-10-20'

export interface PriceSource {
  /** who published the figure */
  name: string
  url: string
  /** what the source actually says, in a few words */
  note: string
  /** when the source dates the figure (its own "updated" / "prices as of") */
  published: string
  /** when we looked at it */
  checked: string
}

/** What tapping an item does: open a booking flow in this tab, or open the experience in Experiences. */
export type KringAction =
  | { kind: 'ride'; zone: 'airport' | 'city' | 'pattaya' }
  | { kind: 'esim' }
  | { kind: 'experience'; id: string }

export type PriceCategory = 'rides' | 'spa' | 'shows' | 'sim' | 'tours'

export interface KringPriceItem {
  id: string
  cities: KringCity[]
  category: PriceCategory
  emoji: string
  title: { en: string; th: string }
  /** small line under the title (what exactly is compared) */
  sub: { en: string; th: string }
  touristThb: number
  touristSource: PriceSource
  /**
   * FIX1 (founder): the "Save ฿X vs tourist price" chip and the red strike only appear when the tourist price is a
   * figure a source actually states for this exact thing. `false` = rough / converted / not like-for-like → the row
   * shows the Kring price and the cheapest-elsewhere line only, no strike, no chip.
   */
  touristSolid?: boolean
  elsewhere: { thb: number; where: { en: string; th: string }; checked: string } | null
  kringThb: number
  /** Bonus promo credit awarded on booking (non-cashable promo) */
  bonusCoins?: number
  /** "all-in" for fixed services, "from" when the local and guest agree the final price in chat */
  kringNote: 'all-in' | 'from'
  action: KringAction
  /** the item leads the price-gap hero for this city */
  heroIn?: KringCity[]
}

const S = {
  aotLimo: {
    name: 'The Thailand Life · airport taxi guide',
    url: 'https://www.thethailandlife.com/airport-taxi-guide',
    note: 'AOT Limousine counter, sedan: ฿1,100–1,800 by hotel zone',
    published: '2022-07-19',
    checked: PRICES_CHECKED,
  },
  pattayaAsk: {
    name: 'The Thailand Life · airport taxi guide',
    url: 'https://www.thethailandlife.com/airport-taxi-guide',
    note: 'Drivers often ask ฿2,000 fixed to Pattaya (meter ≈ ฿1,100)',
    published: '2022-07-19',
    checked: PRICES_CHECKED,
  },
  rajadamnern: {
    name: 'Muay Thai Stadiums · Rajadamnern seating guide',
    url: 'https://muaythaistadiums.com/rajadamnern-stadium-seating-guide/',
    note: 'Box office: ringside ฿2,500 · club ฿1,800 · 3rd class ฿1,000',
    published: '2026-07-15',
    checked: PRICES_CHECKED,
  },
  hotelSpa: {
    name: 'LatestCost · massage price guide 2026',
    url: 'https://latestcost.com/massage-costs-thailand-practical-price/',
    note: 'Hotel spa 60 min: US$40–60 (≈ ฿1,300 at the low end)',
    published: '2026-02-16',
    checked: PRICES_CHECKED,
  },
  simCounter: {
    name: 'Travel SIM Asia · Thailand SIM prices',
    url: 'https://travelsimasia.com/blogs/thailand-guides/best-esim-thailand-1-month',
    note: 'Airport counter tourist SIM, 8 days: ฿499 (AIS · True · dtac)',
    published: '2026-10-10',
    checked: PRICES_CHECKED,
  },
} satisfies Record<string, PriceSource>

const floor = (key: keyof typeof FLOOR_PRICES) => {
  const f = FLOOR_PRICES[key]
  return { thb: f.floorThb, where: { en: f.source.en, th: f.source.th }, checked: FLOORS_CHECKED }
}

export const KRING_PRICE_ITEMS: readonly KringPriceItem[] = [
  {
    id: 'airport-car',
    cities: ['bangkok'],
    category: 'rides',
    emoji: '🚕',
    title: { en: 'Airport → Sukhumvit', th: 'สนามบิน → สุขุมวิท' },
    sub: { en: 'Private car · tolls + waiting incl.', th: 'รถส่วนตัว · รวมทางด่วน + รอรับ' },
    touristThb: 1100,
    touristSource: S.aotLimo,
    elsewhere: floor('cab:airport'),
    kringThb: FLOOR_PRICES['cab:airport'].oursThb,
    bonusCoins: FLOOR_PRICES['cab:airport'].bonusCoins,
    kringNote: 'all-in',
    action: { kind: 'ride', zone: 'airport' },
    heroIn: ['bangkok'],
  },
  {
    id: 'muay-thai-ringside',
    cities: ['bangkok'],
    category: 'shows',
    emoji: '🥊',
    title: { en: 'Muay Thai · ringside', th: 'มวยไทย · ริงไซด์' },
    sub: { en: 'Rajadamnern Stadium · one seat', th: 'เวทีราชดำเนิน · 1 ที่นั่ง' },
    touristThb: 2500,
    touristSource: S.rajadamnern,
    elsewhere: { thb: 1800, where: { en: 'Klook app', th: 'แอป Klook' }, checked: FLOORS_CHECKED },
    kringThb: 1720,
    bonusCoins: 25_000,
    kringNote: 'all-in',
    action: { kind: 'experience', id: 'muay-thai-stadium' },
  },
  {
    id: 'thai-massage-60',
    cities: ['bangkok', 'pattaya'],
    category: 'spa',
    emoji: '💆',
    title: { en: 'Thai massage · 60 min', th: 'นวดไทย · 60 นาที' },
    sub: { en: 'Licensed spa only', th: 'สปาที่มีใบอนุญาตเท่านั้น' },
    touristThb: 1300,
    touristSource: S.hotelSpa,
    // a hotel-spa US$40–60 range converted to baht — not a quote for a licensed-shop Thai massage → no chip, no strike
    touristSolid: false,
    elsewhere: floor('spa'),
    kringThb: FLOOR_PRICES.spa.oursThb,
    bonusCoins: FLOOR_PRICES.spa.bonusCoins,
    kringNote: 'all-in',
    action: { kind: 'experience', id: 'thai-massage-spa' },
  },
  {
    id: 'tourist-esim',
    cities: ['bangkok', 'pattaya'],
    category: 'sim',
    emoji: '📶',
    title: { en: 'Tourist eSIM · 8 days', th: 'eSIM นักท่องเที่ยว · 8 วัน' },
    sub: { en: 'Counter: unlimited · ours: 15 GB 5G', th: 'เคาน์เตอร์: ไม่จำกัด · ของเรา: 15 GB 5G' },
    touristThb: 499,
    touristSource: S.simCounter,
    elsewhere: floor('esim:8d'),
    kringThb: FLOOR_PRICES['esim:8d'].oursThb,
    bonusCoins: FLOOR_PRICES['esim:8d'].bonusCoins,
    kringNote: 'all-in',
    action: { kind: 'esim' },
  },
  {
    id: 'bangkok-pattaya-car',
    cities: ['pattaya', 'bangkok'],
    category: 'rides',
    emoji: '🛣️',
    title: { en: 'Airport → Pattaya', th: 'สนามบิน → พัทยา' },
    sub: { en: 'Private car · ~90 min · tolls incl.', th: 'รถส่วนตัว · ~90 นาที · รวมทางด่วน' },
    touristThb: 2000,
    touristSource: S.pattayaAsk,
    elsewhere: floor('ride:pattaya:comfort'),
    kringThb: FLOOR_PRICES['ride:pattaya:comfort'].oursThb,
    bonusCoins: FLOOR_PRICES['ride:pattaya:comfort'].bonusCoins,
    kringNote: 'all-in',
    action: { kind: 'ride', zone: 'pattaya' },
    heroIn: ['pattaya'],
  },
]

export function itemsIn(city: KringCity): KringPriceItem[] {
  return KRING_PRICE_ITEMS.filter((i) => i.cities.includes(city)).sort((a, b) => Number(!!b.heroIn?.includes(city)) - Number(!!a.heroIn?.includes(city)))
}
export function heroFor(city: KringCity): KringPriceItem {
  return KRING_PRICE_ITEMS.find((i) => i.heroIn?.includes(city)) ?? itemsIn(city)[0]
}
export function saveOf(i: Pick<KringPriceItem, 'touristThb' | 'kringThb'>): number {
  return Math.max(0, i.touristThb - i.kringThb)
}
/** The tourist price may be struck + a "Save ฿X vs tourist price" chip shown (solid dated source, real gap). */
export function showsTouristGap(i: Pick<KringPriceItem, 'touristThb' | 'kringThb' | 'touristSolid'>): boolean {
  return i.touristSolid !== false && saveOf(i) > 0
}

/* ------------------------------------------------------------------ */
/* Price Check rules                                                    */
/* ------------------------------------------------------------------ */
export type CheckKind = 'taxi' | 'tuk' | 'massage' | 'muaythai' | 'sim' | 'boat'

export interface PriceRule {
  id: string
  kind: CheckKind
  cities: KringCity[]
  /** matched against the lower-cased quote */
  match: RegExp
  /** the usual price range (per unit when `perHour`) */
  usual: [number, number]
  perHour?: boolean
  reason: { en: string; th: string }
  /** the honest cheap way, linked under the verdict */
  diy: { en: string; th: string }
  /** the Kring alternative offered under the verdict (null = no Kring product for it) */
  kring: { title: { en: string; th: string }; sub: { en: string; th: string }; thb: number; action: KringAction } | null
  sources: { name: string; url: string; published: string }[]
}

const koh = getExperience('koh-larn-day')
const thaiSpa = getExperience('thai-massage-spa')

export const CHECK_KINDS: Record<KringCity, { id: CheckKind; emoji: string; en: string; th: string }[]> = {
  bangkok: [
    { id: 'taxi', emoji: '🚕', en: 'Taxi', th: 'แท็กซี่' },
    { id: 'tuk', emoji: '🛺', en: 'Tuk-tuk', th: 'ตุ๊กตุ๊ก' },
    { id: 'massage', emoji: '💆', en: 'Massage', th: 'นวด' },
    { id: 'muaythai', emoji: '🥊', en: 'Muay Thai', th: 'มวย' },
    { id: 'sim', emoji: '📶', en: 'SIM', th: 'ซิม' },
  ],
  pattaya: [
    { id: 'boat', emoji: '⛴', en: 'Boat', th: 'เรือ' },
    { id: 'taxi', emoji: '🚕', en: 'Taxi', th: 'แท็กซี่' },
    { id: 'massage', emoji: '💆', en: 'Massage', th: 'นวด' },
    { id: 'sim', emoji: '📶', en: 'SIM', th: 'ซิม' },
  ],
}

const TABIJI = { name: 'tabiji · Bangkok scam guide', url: 'https://tabiji.ai/scams/bangkok/', published: '2026-04' }
const THAIEST = { name: 'THAIest · Bangkok taxi fares', url: 'https://thaiest.com/en/thailand/bangkok/taxi', published: '2026-04-28' }

export const PRICE_RULES: readonly PriceRule[] = [
  {
    id: 'taxi-airport',
    kind: 'taxi',
    cities: ['bangkok'],
    match: /airport|suvarnabhumi|\bbkk\b|dmk|don mueang|สนามบิน|สุวรรณภูมิ|ดอนเมือง/,
    usual: [300, 400],
    reason: { en: 'metered taxi + ฿50 airport fee + tolls', th: 'แท็กซี่มิเตอร์ + ค่าสนามบิน ฿50 + ทางด่วน' },
    diy: { en: 'How to ride the meter', th: 'วิธีนั่งแท็กซี่แบบกดมิเตอร์' },
    kring: { title: { en: 'Private car, driver waits at Gate 4', th: 'รถส่วนตัว คนขับรอที่ประตู 4' }, sub: { en: 'tolls + waiting incl.', th: 'รวมทางด่วน + รอรับ' }, thb: FLOOR_PRICES['cab:airport'].oursThb, action: { kind: 'ride', zone: 'airport' } },
    sources: [TABIJI, THAIEST],
  },
  {
    id: 'taxi-pattaya',
    kind: 'taxi',
    cities: ['bangkok', 'pattaya'],
    match: /pattaya|พัทยา|jomtien|จอมเทียน/,
    usual: [1200, 1700],
    reason: { en: 'meter ≈ ฿1,100 + tolls, or ฿1,700 agreed up front', th: 'มิเตอร์ราว ฿1,100 + ทางด่วน หรือตกลง ฿1,700 ก่อนออก' },
    diy: { en: 'Agree the price before you leave', th: 'ตกลงราคาก่อนออกเดินทาง' },
    kring: { title: { en: 'Private car to Pattaya', th: 'รถส่วนตัวไปพัทยา' }, sub: { en: '~90 min · tolls incl.', th: '~90 นาที · รวมทางด่วน' }, thb: FLOOR_PRICES['ride:pattaya:comfort'].oursThb, action: { kind: 'ride', zone: 'pattaya' } },
    sources: [THAIEST, { name: 'The Thailand Life · airport taxi guide', url: 'https://www.thethailandlife.com/airport-taxi-guide', published: '2022-07-19' }],
  },
  {
    id: 'taxi-city',
    kind: 'taxi',
    cities: ['bangkok'],
    match: /./,
    usual: [80, 150],
    reason: { en: 'across town on the meter', th: 'ในเมือง กดมิเตอร์' },
    diy: { en: 'Say “meter, please” · กดมิเตอร์ด้วย', th: 'บอก “กดมิเตอร์ด้วย”' },
    kring: { title: { en: 'Fixed-price ride', th: 'รถราคาตายตัว' }, sub: { en: 'door to door · no meter talk', th: 'ถึงหน้าประตู · ไม่ต้องคุยเรื่องมิเตอร์' }, thb: FLOOR_PRICES['ride:city:comfort'].oursThb, action: { kind: 'ride', zone: 'city' } },
    sources: [TABIJI, THAIEST],
  },
  {
    id: 'tuk',
    kind: 'tuk',
    cities: ['bangkok'],
    match: /./,
    usual: [80, 150],
    reason: { en: 'one short hop, agreed before you sit', th: 'ระยะสั้น ตกลงราคาก่อนขึ้น' },
    diy: { en: 'Never accept a “free tour” stop', th: 'อย่ารับ “ทัวร์ฟรี” แวะร้าน' },
    kring: { title: { en: 'Fixed-price tuk-tuk', th: 'ตุ๊กตุ๊กราคาตายตัว' }, sub: { en: 'no shop stops', th: 'ไม่แวะร้าน' }, thb: FLOOR_PRICES['ride:city:tuk'].oursThb, action: { kind: 'ride', zone: 'city' } },
    sources: [TABIJI],
  },
  {
    id: 'massage',
    kind: 'massage',
    cities: ['bangkok', 'pattaya'],
    match: /./,
    usual: [300, 500],
    perHour: true,
    reason: { en: 'per hour at a licensed shop', th: 'ต่อชั่วโมง ที่ร้านมีใบอนุญาต' },
    diy: { en: 'Pattaya beach massage is fixed at ฿300/h', th: 'นวดชายหาดพัทยา ราคามาตรฐาน ฿300/ชม.' },
    kring: { title: { en: 'Thai massage at a licensed spa', th: 'นวดไทยที่สปามีใบอนุญาต' }, sub: { en: '60 min', th: '60 นาที' }, thb: FLOOR_PRICES.spa.oursThb, action: { kind: 'experience', id: thaiSpa?.id ?? 'thai-massage-spa' } },
    sources: [
      { name: 'Pattaya Mail · beach massage standard price', url: 'https://www.pattayamail.com/latestnews/news/new-regulations-implemented-to-improve-pattaya-beach-massage-services-433914', published: '2023-06-17' },
      { name: 'LatestCost · massage price guide 2026', url: 'https://latestcost.com/massage-costs-thailand-practical-price/', published: '2026-02-16' },
    ],
  },
  {
    id: 'muaythai',
    kind: 'muaythai',
    cities: ['bangkok'],
    match: /./,
    usual: [1000, 2500],
    reason: { en: 'box office: 3rd class ฿1,000 · club ฿1,800 · ringside ฿2,500', th: 'หน้าเวที: ชั้น 3 ฿1,000 · คลับ ฿1,800 · ริงไซด์ ฿2,500' },
    diy: { en: 'Buy at the stadium box office', th: 'ซื้อที่ช่องขายตั๋วของเวที' },
    kring: { title: { en: 'Ringside seat at Rajadamnern', th: 'ที่นั่งริงไซด์ ราชดำเนิน' }, sub: { en: 'one seat', th: '1 ที่นั่ง' }, thb: 1720, action: { kind: 'experience', id: 'muay-thai-stadium' } },
    sources: [{ name: 'Muay Thai Stadiums · Rajadamnern seating guide', url: 'https://muaythaistadiums.com/rajadamnern-stadium-seating-guide/', published: '2026-07-15' }],
  },
  {
    id: 'sim',
    kind: 'sim',
    cities: ['bangkok', 'pattaya'],
    match: /./,
    usual: [185, 499],
    reason: { en: 'apps from ฿195 · airport counter ฿499 for 8 days', th: 'แอปเริ่ม ฿195 · เคาน์เตอร์สนามบิน ฿499 / 8 วัน' },
    diy: { en: '7-Eleven sells tourist SIMs too', th: 'เซเว่นก็มีซิมนักท่องเที่ยว' },
    kring: { title: { en: 'Tourist eSIM · 15 GB 5G', th: 'eSIM นักท่องเที่ยว · 15 GB 5G' }, sub: { en: '8 days · QR in the app', th: '8 วัน · QR ในแอป' }, thb: FLOOR_PRICES['esim:8d'].oursThb, action: { kind: 'esim' } },
    sources: [{ name: 'Travel SIM Asia · Thailand SIM prices', url: 'https://travelsimasia.com/blogs/thailand-guides/best-esim-thailand-1-month', published: '2026-10-10' }],
  },
  {
    id: 'boat-koh-larn',
    kind: 'boat',
    cities: ['pattaya'],
    match: /./,
    // FIX1 · "Koh Larn speedboat fare (one way)": a shared speedboat seat is ฿150–300 per person (Pattaya Mail, Aug 2026;
    // Nasha Planeta, Oct 2026). The Kring card below is the catalogue's island DAY (boat both ways + beach + lunch),
    // labelled as such, so the two numbers can never be read as the same thing.
    usual: [150, 300],
    reason: { en: 'Koh Larn speedboat fare (one way) · shared seat · public ferry ฿30–40', th: 'ค่าสปีดโบ๊ทไปเกาะล้าน (เที่ยวเดียว) · ที่นั่งรวม · เรือโดยสาร ฿30–40' },
    diy: { en: 'How to take the public ferry', th: 'วิธีนั่งเรือโดยสารไปเกาะล้าน' },
    kring: koh
      ? { title: { en: 'Koh Larn island day with a local', th: 'เที่ยวเกาะล้านทั้งวันกับโลคอล' }, sub: { en: `~${koh.hours}h · boat both ways, beach, seafood lunch`, th: `~${koh.hours} ชม. · เรือไปกลับ ชายหาด ซีฟู้ดมื้อกลางวัน` }, thb: koh.fromThb, action: { kind: 'experience', id: koh.id } }
      : null,
    sources: [
      { name: 'Pattaya Mail · Koh Larn ferry & speedboat prices 2026', url: 'https://www.pattayamail.com/latestnews/news/how-to-get-from-pattaya-to-koh-larn-ferry-times-prices-and-beach-guide-for-2026-561423', published: '2026-08-16' },
      { name: 'Nasha Planeta · Koh Larn ferries & prices', url: 'https://nashaplaneta.net/asia/thai/koh-larn-kak-dobratsa_en', published: '2026-10-19' },
    ],
  },
]

/** Keyword → kind, so typing/pasting a quote picks the chip by itself. */
export function guessKind(text: string, city: KringCity): CheckKind | null {
  const s = text.toLowerCase()
  if (/koh larn|เกาะล้าน|ferry|speedboat|boat|เรือ|island/.test(s)) return city === 'pattaya' || /koh larn|เกาะล้าน/.test(s) ? 'boat' : null
  if (/tuk|ตุ๊ก/.test(s)) return 'tuk'
  if (/massage|spa|นวด|สปา/.test(s)) return 'massage'
  if (/muay|boxing|ringside|มวย|stadium/.test(s)) return 'muaythai'
  if (/sim|esim|ซิม|data/.test(s)) return 'sim'
  if (/taxi|cab|car|grab|bolt|airport|meter|แท็กซี่|รถ|สนามบิน|pattaya|พัทยา/.test(s)) return 'taxi'
  return null
}

/** The baht amount in a pasted quote ("฿1,500", "1500 baht", "1.5k"). Null when there is none. */
export function parseAmount(text: string): number | null {
  const s = text.replace(/(\d),(\d{3})/g, '$1$2')
  const k = s.match(/(\d+(?:\.\d+)?)\s*k\b/i)
  if (k) return Math.round(Number(k[1]) * 1000)
  // a number marked as money wins ("฿1500", "1500 baht", "1500 บาท"); otherwise the largest number in the text
  const marked = s.match(/฿\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:baht|thb|บาท|b\b)/i)
  if (marked) return Number(marked[1] ?? marked[2])
  const all = [...s.matchAll(/\d+(?:\.\d+)?/g)].map((x) => Number(x[0])).filter((n) => n >= 20)
  return all.length ? Math.max(...all) : null
}

/** Hours in the quote ("2h", "2 hours", "90 min", "2 ชม.") — 1 when absent. */
export function parseHours(text: string): number {
  const s = text.toLowerCase()
  const h = s.match(/(\d+(?:\.\d+)?)\s*(?:h\b|hr|hrs|hour|hours|ชม|ชั่วโมง)/)
  if (h) return Math.max(0.5, Number(h[1]))
  const m = s.match(/(\d{2,3})\s*(?:min|mins|minutes|นาที)/)
  if (m) return Math.max(0.5, Number(m[1]) / 60)
  return 1
}

export function ruleFor(kind: CheckKind, text: string, city: KringCity): PriceRule | null {
  const s = text.toLowerCase()
  const cands = PRICE_RULES.filter((r) => r.kind === kind && r.cities.includes(city))
  if (kind === 'taxi') {
    const pattaya = cands.find((r) => r.id === 'taxi-pattaya')
    const airport = cands.find((r) => r.id === 'taxi-airport')
    if (pattaya && pattaya.match.test(s) && (city === 'bangkok' || /airport|สนามบิน|bkk|suvarnabhumi|bangkok/.test(s))) return pattaya
    if (airport && airport.match.test(s)) return airport
    if (city === 'pattaya') return pattaya ?? null
    return cands.find((r) => r.id === 'taxi-city') ?? null
  }
  return cands[0] ?? null
}

export type VerdictTone = 'good' | 'ok' | 'high' | 'bad'

export interface Verdict {
  amount: number
  rule: PriceRule
  lo: number
  hi: number
  /** amount ÷ the middle of the usual range */
  times: number
  tone: VerdictTone
  /** needle angle in degrees, 0 = far left (cheap) … 180 = far right (4×+) */
  angle: number
}

/** amount → verdict against the rule's usual range (per hour × hours for massages). */
export function verdictFor(amount: number, rule: PriceRule, text: string): Verdict {
  const hours = rule.perHour ? parseHours(text) : 1
  const lo = Math.round(rule.usual[0] * hours)
  const hi = Math.round(rule.usual[1] * hours)
  const mid = (lo + hi) / 2
  const times = amount / mid
  const tone: VerdictTone = amount <= lo ? 'good' : amount <= hi * 1.1 ? 'ok' : times < 1.8 ? 'high' : 'bad'
  // piecewise: green 0–60°, amber 60–100°, red 100–180°
  const angle =
    amount <= lo
      ? 15 + 30 * Math.max(0, Math.min(1, amount / Math.max(1, lo)))
      : amount <= hi
        ? 45 + 15 * ((amount - lo) / Math.max(1, hi - lo))
        : times < 1.8
          ? 60 + 40 * Math.min(1, (amount - hi) / Math.max(1, mid * 1.8 - hi))
          : 100 + 72 * Math.min(1, (times - 1.8) / 2.6)
  return { amount, rule, lo, hi, times, tone, angle: Math.max(4, Math.min(176, angle)) }
}

/**
 * FIX2 · Wei 8 — where "2×" and "3×" sit on the gauge (same mapping as `verdictFor`'s red section), so a "3× too high"
 * verdict reads between the 3× and 4×+ marks instead of looking pinned at "4×+".
 */
export function gaugeAngleForTimes(times: number): number {
  return Math.max(4, Math.min(176, 100 + 72 * Math.min(1, (times - 1.8) / 2.6)))
}

/** "฿300–400" (one baht sign, commas). */
export function rangeLabel(lo: number, hi: number): string {
  return `฿${lo.toLocaleString('en-US')}–${hi.toLocaleString('en-US')}`
}

/** "4×", "2.5×" — whole numbers from 3× up. */
export function timesLabel(times: number): string {
  return times >= 2.75 ? `${Math.round(times)}×` : `${(Math.round(times * 2) / 2).toString()}×`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
/** '2026-10-21' → '21 Oct' / '21 ต.ค.' ('2026-04' → 'Apr 2026'). */
export function shortDate(iso: string, lang = 'en'): string {
  const [y, m, d] = iso.split('-').map(Number)
  const mon = (lang === 'th' ? MONTHS_TH : MONTHS)[(m || 1) - 1]
  return d ? `${d} ${mon}` : `${mon} ${y}`
}
/** '2026-07-15' → '15 Jul 2026' */
export function longDate(iso: string, lang = 'en'): string {
  const [y, m, d] = iso.split('-').map(Number)
  const mon = (lang === 'th' ? MONTHS_TH : MONTHS)[(m || 1) - 1]
  return d ? `${d} ${mon} ${y}` : `${mon} ${y}`
}
