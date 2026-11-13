import { useSyncExternalStore } from 'react'
/**
 * Kring · Experiences catalogue (K2) — source of truth:
 * scratchpad/lab/kring2/SECTION_A.html, "C · catalogue table" (round 2, approved).
 *
 * 55 legitimate experiences in 10 groups, Bangkok + Pattaya.
 *  - Everything happens in public or at a licensed business. NO alcohol, ever.
 *  - Massage only at a licensed spa (the spa provides the therapist; the local
 *    books, translates and keeps you company).
 *  - Not allowed as experiences (never add): nuru / erotic massage, escorting,
 *    private-room or condo meets, alcohol-led nights.
 *  - ★ `onboardFirst` = easy for a new local AND wanted by travellers.
 *  - `fromThb` is the typical starting price the guest and local agree in chat;
 *    `plusVenue` means the spa/gym/ticket fee is paid on top at the venue.
 *
 * How to change it: edit the EXPERIENCES array below (keep ids stable — pins,
 * bookings and analytics reference them). Add a group in GROUPS first.
 */

export type City = 'bangkok' | 'pattaya'
export type CityLabel = 'Bangkok' | 'Pattaya'

export type ExperienceGroupId =
  | 'eat'
  | 'culture'
  | 'wellness'
  | 'active'
  | 'shopping'
  | 'evenings'
  | 'learn'
  | 'practical'
  | 'sea'
  | 'pretrip'

/** How easy it is for a new local to host it. */
export type LocalEase = 'easy' | 'knowhow' | 'licensed'
/** Expected traveller demand. */
export type Demand = 'high' | 'medium' | 'niche'

/**
 * T3 · who an experience is for (founder 23 Oct): "for travellers", "for Thais on a weekend trip" (a Pattaya local in
 * Bangkok for two days, and the other way round) and "two-way" (people who moved here share what only they can give —
 * English chat, a language exchange, interview practice — and both sides learn). One experience can be for several.
 */
export type Audience = 'travellers' | 'weekend' | 'twoway'

/** Legacy host categories used by MeetFeed/onboarding (`HostType`). */
export type LegacyHostType = 'food' | 'rooftop' | 'cafe' | 'salon' | 'experience' | 'group' | 'shopping' | 'culture'

export interface ExperienceGroup {
  id: ExperienceGroupId
  en: string
  th: string
  emoji: string
  /** Small line under the group name (catalogue tile / table header). */
  noteEn: string
  noteTh: string
  /** Pattaya-only group (lit when the city is Pattaya). */
  pattayaOnly?: boolean
  /** Legacy host types whose locals naturally host this group. */
  hostTypes: LegacyHostType[]
}

export interface Experience {
  id: string
  title: string
  titleTh: string
  group: ExperienceGroupId
  city: City[]
  /** Starts in Bangkok and ends in Pattaya (day-trip buddy). */
  route?: boolean
  /** Online (in-app video) — available whichever city is chosen. */
  online?: boolean
  fromThb: number
  /** Typical duration in hours (0.25 = 15 min). */
  hours: number
  /** Spa / gym / school / ticket fee is paid on top, at the venue. */
  plusVenue?: 'spa' | 'salon' | 'shop' | 'gym' | 'ticket' | 'school'
  ease: LocalEase
  /** Exact wording from the table when it differs from the ease bucket (Certified, School, Bilingual). */
  easeLabel?: string
  demand: Demand
  onboardFirst?: boolean
  emoji: string
  /** Where you meet — always a public place or a licensed business. */
  venueEn: string
  venueTh: string
  included: string[]
  includedTh: string[]
  /** T3 · two-way: shared by people who moved here, both sides learn (hosted only by those who list it) */
  twoWay?: boolean
  /** T3 · who it's for (derived: two-way → ['twoway']; else travellers, + weekend for the WEEKEND_IDS set) */
  audience: Audience[]
}

export const GROUPS: ReadonlyArray<ExperienceGroup> = [
  { id: 'eat', en: 'Eat & drink', th: 'กินดื่ม', emoji: '🍜', noteEn: 'Street food · night markets · cafés · dessert bars', noteTh: 'สตรีทฟู้ด · ตลาดกลางคืน · คาเฟ่ · ร้านของหวาน', hostTypes: ['food', 'cafe'] },
  { id: 'culture', en: 'Culture & temples', th: 'วัด & วัฒนธรรม', emoji: '🛕', noteEn: 'Temples · old town · canals', noteTh: 'วัด · เมืองเก่า · คลอง', hostTypes: ['culture', 'experience'] },
  { id: 'wellness', en: 'Wellness & beauty', th: 'สุขภาพ & ความงาม', emoji: '💆', noteEn: 'Licensed spas · salons · yoga', noteTh: 'สปาที่มีใบอนุญาต · ซาลอน · โยคะ', hostTypes: ['salon'] },
  { id: 'active', en: 'Active', th: 'สายแอคทีฟ', emoji: '🥊', noteEn: 'Muay Thai · cycling · run club', noteTh: 'มวยไทย · ปั่นจักรยาน · วิ่ง', hostTypes: ['experience'] },
  { id: 'shopping', en: 'Shopping & markets', th: 'ช้อป & ตลาด', emoji: '🛍️', noteEn: 'Shopping buddy · floating markets', noteTh: 'ช้อปกับโลคอล · ตลาดน้ำ', hostTypes: ['shopping'] },
  { id: 'evenings', en: 'Evening Views & Night Markets', th: 'ชมวิวพระอาทิตย์ตก & ตลาดกลางคืน', emoji: '🌙', noteEn: 'Sunset viewpoints · night markets · river cruise · live-music cafés', noteTh: 'จุดชมวิวพระอาทิตย์ตก · ตลาดกลางคืน · ล่องเรือ · คาเฟ่ดนตรีสด', hostTypes: ['rooftop', 'cafe', 'group'] },
  { id: 'learn', en: 'Learn', th: 'เรียนรู้', emoji: '🍳', noteEn: 'Cooking class · Thai café · photo walk', noteTh: 'คลาสทำอาหาร · คาเฟ่ภาษาไทย · เดินถ่ายรูป', hostTypes: ['cafe', 'experience'] },
  { id: 'practical', en: 'Practical help', th: 'ช่วยเรื่องจำเป็น', emoji: '🧭', noteEn: 'Airport buddy · SIM · hospital', noteTh: 'รับที่สนามบิน · ซิม · โรงพยาบาล', hostTypes: ['experience', 'shopping'] },
  { id: 'sea', en: 'Pattaya & sea', th: 'พัทยา & ทะเล', emoji: '🏝️', noteEn: 'Koh Larn · Jomtien · viewpoints', noteTh: 'เกาะล้าน · จอมเทียน · จุดชมวิว', pattayaOnly: true, hostTypes: ['experience', 'food'] },
  { id: 'pretrip', en: 'Pre-trip calls', th: 'คอลก่อนเที่ยว', emoji: '📹', noteEn: 'Video planning · price check', noteTh: 'วิดีโอคอลวางแผน · เช็คราคา', hostTypes: ['experience'] },
]

const B: City[] = ['bangkok']
const P: City[] = ['pattaya']
const BP: City[] = ['bangkok', 'pattaya']

type Row = Omit<Experience, 'venueEn' | 'venueTh' | 'included' | 'includedTh' | 'audience'> &
  Partial<Pick<Experience, 'venueEn' | 'venueTh' | 'included' | 'includedTh'>>

const ROWS: Row[] = [
  // ── Eat & drink · no alcohol, ever ────────────────────────────────────────
  { id: 'street-food-walk', title: 'Street-food walk (Yaowarat, Samphanthawong)', titleTh: 'เดินกินสตรีทฟู้ด (เยาวราช สัมพันธวงศ์)', group: 'eat', city: B, fromThb: 1200, hours: 3, ease: 'easy', demand: 'high', onboardFirst: true, emoji: '🍢', venueEn: 'Yaowarat Rd, Chinatown', venueTh: 'ถนนเยาวราช' },
  { id: 'night-market-tasting', title: 'Night-market tasting', titleTh: 'ชิมตลาดกลางคืน', group: 'eat', city: BP, fromThb: 700, hours: 2, ease: 'easy', demand: 'high', onboardFirst: true, emoji: '🏮', venueEn: 'Jodd Fairs night market, Rama 9', venueTh: 'จ๊อดแฟร์ พระราม 9' },
  { id: 'cafe-hop-desserts', title: 'Café hop & Thai desserts', titleTh: 'คาเฟ่ฮอปปิ้ง & ขนมไทย', group: 'eat', city: B, fromThb: 600, hours: 2, ease: 'easy', demand: 'high', onboardFirst: true, emoji: '🍧', venueEn: 'Ari · Thonglor cafés', venueTh: 'คาเฟ่อารีย์ · ทองหล่อ' },
  { id: 'local-breakfast', title: 'Breakfast like a local (jok, patongko, kopi)', titleTh: 'มื้อเช้าแบบคนไทย (โจ๊ก ปาท่องโก๋ โกปี๊)', group: 'eat', city: B, fromThb: 500, hours: 1.5, ease: 'easy', demand: 'medium', emoji: '🥣', venueEn: 'Talat Noi breakfast stalls', venueTh: 'ร้านเช้าย่านตลาดน้อย' },
  { id: 'mookata-dinner', title: 'Mookata / Thai BBQ group dinner', titleTh: 'หมูกระทะ / บาร์บีคิวไทย', group: 'eat', city: BP, fromThb: 800, hours: 2.5, ease: 'easy', demand: 'medium', emoji: '🔥', venueEn: 'Mookata restaurant, Ratchada night market', venueTh: 'ร้านหมูกระทะ ตลาดนัดรัชดา' },
  { id: 'isan-food-night', title: 'Isan food night (som tam, larb, sticky rice)', titleTh: 'คืนอาหารอีสาน (ส้มตำ ลาบ ข้าวเหนียว)', group: 'eat', city: B, fromThb: 700, hours: 2, ease: 'easy', demand: 'medium', emoji: '🌶️', venueEn: 'Isan restaurant, Victory Monument', venueTh: 'ร้านอีสาน อนุสาวรีย์ชัยฯ' },
  { id: 'cha-yen-fruit', title: 'Cha Yen, Thai tea & fruit tasting', titleTh: 'ชิมชาเย็น ชาไทย & ผลไม้', group: 'eat', city: BP, fromThb: 400, hours: 1, ease: 'easy', demand: 'medium', emoji: '🧋', venueEn: 'Or Tor Kor market, Chatuchak', venueTh: 'ตลาด อ.ต.ก. จตุจักร' },
  { id: 'naklua-seafood-lunch', title: 'Seafood market lunch (Naklua)', titleTh: 'มื้อกลางวันตลาดซีฟู้ด (นาเกลือ)', group: 'eat', city: P, fromThb: 900, hours: 2, ease: 'easy', demand: 'high', emoji: '🦐', venueEn: 'Lan Pho Naklua market', venueTh: 'ตลาดลานโพธิ์ นาเกลือ' },

  // ── Culture & temples ─────────────────────────────────────────────────────
  { id: 'temple-cafe-morning', title: 'Temple & café morning', titleTh: 'เช้าไหว้พระ & คาเฟ่', group: 'culture', city: B, fromThb: 900, hours: 3, ease: 'easy', demand: 'high', onboardFirst: true, emoji: '🛕', venueEn: 'Wat Arun · riverside café', venueTh: 'วัดอรุณ · คาเฟ่ริมน้ำ' },
  { id: 'grand-palace-companion', title: 'Grand Palace & big-temple companion (dress code, tickets, queues)', titleTh: 'เที่ยววัดพระแก้วกับโลคอล (การแต่งกาย ตั๋ว คิว)', group: 'culture', city: B, fromThb: 1000, hours: 3, ease: 'knowhow', demand: 'high', emoji: '👑', venueEn: 'Grand Palace main gate', venueTh: 'ประตูหน้าพระบรมมหาราชวัง' },
  { id: 'old-town-walk', title: 'Old-town walk (Rattanakosin, Talat Noi)', titleTh: 'เดินเมืองเก่า (รัตนโกสินทร์ ตลาดน้อย)', group: 'culture', city: B, fromThb: 1000, hours: 3, ease: 'knowhow', demand: 'high', emoji: '🏛️', venueEn: 'Talat Noi · Rattanakosin', venueTh: 'ตลาดน้อย · เกาะรัตนโกสินทร์' },
  { id: 'canal-longtail', title: 'Canal long-tail boat & riverside community', titleTh: 'นั่งเรือหางยาวเที่ยวคลอง & ชุมชนริมน้ำ', group: 'culture', city: B, fromThb: 1200, hours: 3, ease: 'knowhow', demand: 'high', emoji: '🛶', venueEn: 'Tha Chang pier', venueTh: 'ท่าช้าง' },
  { id: 'merit-making', title: 'Morning merit-making & temple etiquette', titleTh: 'ตักบาตรตอนเช้า & มารยาทในวัด', group: 'culture', city: B, fromThb: 500, hours: 1.5, ease: 'easy', demand: 'medium', emoji: '🙏', venueEn: 'Wat Saket (Golden Mount) gate', venueTh: 'ประตูวัดสระเกศ (ภูเขาทอง)' },
  { id: 'flower-amulet-market', title: 'Flower & amulet market walk', titleTh: 'เดินตลาดดอกไม้ & ตลาดพระ', group: 'culture', city: B, fromThb: 600, hours: 2, ease: 'easy', demand: 'niche', emoji: '🌼', venueEn: 'Pak Khlong Talat', venueTh: 'ปากคลองตลาด' },
  { id: 'sanctuary-big-buddha', title: 'Sanctuary of Truth & Big Buddha hill', titleTh: 'ปราสาทสัจธรรม & เขาพระใหญ่', group: 'culture', city: P, fromThb: 800, hours: 3, ease: 'easy', demand: 'medium', emoji: '🪷', venueEn: 'Sanctuary of Truth entrance', venueTh: 'ทางเข้าปราสาทสัจธรรม' },

  // ── Wellness & beauty · licensed spas only ────────────────────────────────
  { id: 'thai-massage-spa', title: 'Thai massage at a licensed spa (booking, translation, company)', titleTh: 'นวดไทยที่สปามีใบอนุญาต (จอง แปล อยู่ด้วยตลอด)', group: 'wellness', city: BP, fromThb: 900, hours: 2, plusVenue: 'spa', ease: 'licensed', demand: 'high', emoji: '💆', venueEn: 'Licensed spa lobby, Sukhumvit Soi 24', venueTh: 'ล็อบบี้สปามีใบอนุญาต สุขุมวิท 24' },
  { id: 'foot-massage', title: 'Foot massage after the market', titleTh: 'นวดเท้าหลังเดินตลาด', group: 'wellness', city: BP, fromThb: 500, hours: 1, plusVenue: 'spa', ease: 'licensed', demand: 'high', emoji: '🦶', venueEn: 'Licensed foot-massage shop, Silom Soi 4', venueTh: 'ร้านนวดเท้ามีใบอนุญาต สีลมซอย 4' },
  { id: 'spa-day', title: 'Oil or herbal-compress massage · spa day', titleTh: 'นวดน้ำมันหรือประคบสมุนไพร · วันสปา', group: 'wellness', city: BP, fromThb: 1500, hours: 3, plusVenue: 'spa', ease: 'licensed', demand: 'medium', emoji: '🌿', venueEn: 'Licensed day spa, Ari', venueTh: 'เดย์สปามีใบอนุญาต อารีย์' },
  { id: 'salon-nails', title: 'Salon, hair & nails afternoon', titleTh: 'บ่ายทำผม ทำเล็บที่ซาลอน', group: 'wellness', city: BP, fromThb: 700, hours: 2, plusVenue: 'salon', ease: 'easy', demand: 'high', onboardFirst: true, emoji: '💅', venueEn: 'Siam Paragon beauty floor (4F), Siam', venueTh: 'ชั้นบิวตี้ สยามพารากอน (ชั้น 4) สยาม' },
  { id: 'barber-shave', title: 'Barber & hot-towel shave', titleTh: 'ตัดผม & โกนหนวดผ้าร้อน', group: 'wellness', city: B, fromThb: 400, hours: 1, plusVenue: 'shop', ease: 'easy', demand: 'medium', emoji: '💈', venueEn: 'Barber shop, Charoen Krung Rd', venueTh: 'ร้านตัดผมชาย ถนนเจริญกรุง' },
  { id: 'park-yoga', title: 'Park yoga & morning stretch', titleTh: 'โยคะในสวน & ยืดเส้นตอนเช้า', group: 'wellness', city: BP, fromThb: 400, hours: 1, ease: 'licensed', easeLabel: 'Certified', demand: 'medium', emoji: '🧘', venueEn: 'Lumphini Park lawn', venueTh: 'สนามหญ้าสวนลุมพินี' },

  // ── Active ────────────────────────────────────────────────────────────────
  { id: 'muay-thai-beginner', title: 'Muay Thai beginner session at a licensed gym', titleTh: 'มวยไทยมือใหม่ที่ยิมมีใบอนุญาต', group: 'active', city: BP, fromThb: 1000, hours: 2, plusVenue: 'gym', ease: 'licensed', demand: 'high', emoji: '🥊', venueEn: 'Licensed Muay Thai gym, Lumphini', venueTh: 'ค่ายมวยมีใบอนุญาต ลุมพินี' },
  { id: 'running-club', title: 'Running club in the park (Lumphini, Benjakitti)', titleTh: 'วิ่งในสวน (ลุมพินี เบญจกิติ)', group: 'active', city: B, fromThb: 300, hours: 1, ease: 'easy', demand: 'medium', onboardFirst: true, emoji: '🏃', venueEn: 'Benjakitti Park', venueTh: 'สวนเบญจกิติ' },
  { id: 'bang-krachao-cycling', title: 'Bang Krachao cycling (the green lung)', titleTh: 'ปั่นจักรยานบางกระเจ้า (ปอดกรุงเทพฯ)', group: 'active', city: B, fromThb: 1200, hours: 4, ease: 'knowhow', demand: 'high', emoji: '🚲', venueEn: 'Bang Na Nok pier', venueTh: 'ท่าเรือบางนานอก' },
  { id: 'badminton-futsal', title: 'Badminton or futsal pick-up game', titleTh: 'แบดมินตันหรือฟุตซอลขาจร', group: 'active', city: B, fromThb: 300, hours: 1.5, ease: 'easy', demand: 'niche', emoji: '🏸', venueEn: 'Indoor sports hall, Thai-Japanese Stadium, Din Daeng', venueTh: 'สนามกีฬาในร่ม ศูนย์เยาวชนไทย-ญี่ปุ่น ดินแดง' },
  { id: 'kayak-sup', title: 'Kayak or paddle board with a licensed operator', titleTh: 'พายคายัคหรือซัพบอร์ดกับผู้ให้บริการที่มีใบอนุญาต', group: 'active', city: P, fromThb: 900, hours: 2, ease: 'licensed', demand: 'medium', emoji: '🛶', venueEn: 'Licensed watersports desk, Jomtien', venueTh: 'จุดให้บริการกีฬาทางน้ำ จอมเทียน' },

  // ── Shopping & markets ────────────────────────────────────────────────────
  { id: 'shopping-buddy', title: 'Shopping buddy (malls, sizes, fair bargaining)', titleTh: 'ช้อปกับโลคอล (ห้าง ไซซ์ ต่อราคาอย่างแฟร์)', group: 'shopping', city: BP, fromThb: 800, hours: 3, ease: 'easy', demand: 'high', onboardFirst: true, emoji: '🛍️', venueEn: 'Siam · Terminal 21', venueTh: 'สยาม · เทอร์มินอล 21' },
  { id: 'chatuchak-guide', title: 'Weekend market companion (Chatuchak)', titleTh: 'เพื่อนเดินตลาดนัดจตุจักร', group: 'shopping', city: B, fromThb: 800, hours: 3, ease: 'easy', demand: 'high', onboardFirst: true, emoji: '🧺', venueEn: 'Chatuchak gate 1', venueTh: 'จตุจักร ประตู 1' },
  { id: 'floating-market', title: 'Floating market morning', titleTh: 'เช้าตลาดน้ำ', group: 'shopping', city: BP, fromThb: 1500, hours: 4, ease: 'easy', demand: 'high', emoji: '🛶', venueEn: 'Khlong Lat Mayom floating market entrance', venueTh: 'ทางเข้าตลาดน้ำคลองลัดมะยม' },
  { id: 'fabric-tailor', title: 'Fabric market & tailor visit', titleTh: 'ตลาดผ้า & ร้านตัดสูท', group: 'shopping', city: B, fromThb: 700, hours: 2, ease: 'knowhow', demand: 'medium', emoji: '🧵', venueEn: 'Phahurat fabric market', venueTh: 'ตลาดผ้าพาหุรัด' },
  { id: 'vintage-thrift', title: 'Vintage & thrift crawl', titleTh: 'ตะลุยร้านวินเทจ & มือสอง', group: 'shopping', city: B, fromThb: 600, hours: 2, ease: 'easy', demand: 'niche', emoji: '👕', venueEn: 'Chatuchak vintage zone', venueTh: 'โซนวินเทจ จตุจักร' },

  // ── Evenings out · food, music, river, no alcohol ─────────────────────────
  { id: 'night-market-live-music', title: 'Night market & live-music café', titleTh: 'ตลาดกลางคืน & คาเฟ่ดนตรีสด', group: 'evenings', city: BP, fromThb: 800, hours: 3, ease: 'easy', demand: 'high', onboardFirst: true, emoji: '🎶', venueEn: 'Patpong night market · live-music café, Silom', venueTh: 'ตลาดกลางคืนพัฒน์พงศ์ · คาเฟ่ดนตรีสด สีลม' },
  { id: 'chao-phraya-sunset', title: 'Chao Phraya sunset by public boat', titleTh: 'ชมพระอาทิตย์ตกเจ้าพระยาด้วยเรือโดยสาร', group: 'evenings', city: B, fromThb: 900, hours: 2, ease: 'easy', demand: 'high', emoji: '🌅', venueEn: 'Sathorn pier', venueTh: 'ท่าเรือสาทร' },
  { id: 'sunset-viewpoint-snacks', title: 'Sunset viewpoint café with Thai snacks & Cha Yen', titleTh: 'ชมพระอาทิตย์ตกที่ระเบียงคาเฟ่ กับขนมไทย & ชาเย็น', group: 'evenings', city: BP, fromThb: 850, hours: 2, ease: 'easy', demand: 'high', emoji: '🌇', venueEn: 'Riverside café terrace, Charoen Krung', venueTh: 'ระเบียงคาเฟ่ริมน้ำ เจริญกรุง' },
  { id: 'muay-thai-stadium', title: 'Muay Thai stadium night', titleTh: 'คืนดูมวยที่สนาม', group: 'evenings', city: B, fromThb: 900, hours: 3, plusVenue: 'ticket', ease: 'knowhow', demand: 'medium', emoji: '🏟️', venueEn: 'Rajadamnern Stadium', venueTh: 'สนามมวยราชดำเนิน' },
  { id: 'board-game-dessert', title: 'Board-game or dessert café night', titleTh: 'คืนบอร์ดเกมหรือคาเฟ่ขนมหวาน', group: 'evenings', city: B, fromThb: 500, hours: 2, ease: 'easy', demand: 'niche', emoji: '🎲', venueEn: 'Board-game café, Siam Square', venueTh: 'คาเฟ่บอร์ดเกม สยามสแควร์' },

  // ── Learn ─────────────────────────────────────────────────────────────────
  { id: 'thai-language-cafe', title: 'Thai language café (practise both ways)', titleTh: 'คาเฟ่ภาษาไทย (ฝึกด้วยกันทั้งสองภาษา)', group: 'learn', city: BP, fromThb: 300, hours: 1, ease: 'easy', demand: 'high', onboardFirst: true, emoji: '🗣️', venueEn: 'Quiet café, Ari', venueTh: 'คาเฟ่เงียบ ๆ อารีย์' },
  { id: 'cooking-class', title: 'Thai cooking class at a cooking school', titleTh: 'คลาสทำอาหารไทยที่โรงเรียนสอนทำอาหาร', group: 'learn', city: BP, fromThb: 1500, hours: 3, plusVenue: 'school', ease: 'licensed', easeLabel: 'School', demand: 'high', emoji: '🍳', venueEn: 'Cooking school, Silom', venueTh: 'โรงเรียนสอนทำอาหาร สีลม' },
  { id: 'photo-walk', title: 'Photo walk (street art, golden hour)', titleTh: 'เดินถ่ายรูป (สตรีทอาร์ต แสงทอง)', group: 'learn', city: B, fromThb: 800, hours: 2, ease: 'knowhow', demand: 'high', emoji: '📷', venueEn: 'Charoen Krung street art', venueTh: 'สตรีทอาร์ตเจริญกรุง' },
  { id: 'read-thai-menu', title: 'Read a Thai menu in an hour', titleTh: 'อ่านเมนูไทยให้เป็นใน 1 ชั่วโมง', group: 'learn', city: BP, fromThb: 400, hours: 1, ease: 'easy', demand: 'medium', emoji: '📜', venueEn: 'Local restaurant, Banglamphu', venueTh: 'ร้านอาหารท้องถิ่น บางลำพู' },
  // ── T3 · Two-way: people who moved here share what only they can give; Thais and travellers both join ──────
  { id: 'english-chat-coffee', title: 'English chat over coffee (practise both ways)', titleTh: 'ฝึกคุยภาษาอังกฤษที่ร้านกาแฟ (ฝึกด้วยกันสองทาง)', group: 'learn', city: BP, fromThb: 300, hours: 1.5, ease: 'easy', demand: 'high', twoWay: true, emoji: '☕', venueEn: 'Café near Siam BTS', venueTh: 'คาเฟ่ใกล้ BTS สยาม' },
  { id: 'language-exchange-kr-jp', title: 'Korean or Japanese ↔ Thai language exchange', titleTh: 'แลกภาษาเกาหลีหรือญี่ปุ่น ↔ ไทย', group: 'learn', city: B, fromThb: 300, hours: 1.5, ease: 'easy', demand: 'medium', twoWay: true, emoji: '🔁', venueEn: 'TK Park library café, CentralWorld', venueTh: 'คาเฟ่ห้องสมุด TK Park เซ็นทรัลเวิลด์' },
  { id: 'interview-practice-english', title: 'Job-interview & CV practice in English', titleTh: 'ฝึกสัมภาษณ์งาน + CV ภาษาอังกฤษ', group: 'learn', city: BP, fromThb: 500, hours: 1.5, ease: 'easy', demand: 'medium', twoWay: true, emoji: '💼', venueEn: 'Co-working café, Silom', venueTh: 'คาเฟ่โคเวิร์กกิ้ง สีลม' },
  { id: 'home-dish-abroad', title: 'A home dish from abroad (cook together at a cooking studio)', titleTh: 'ทำอาหารบ้าน ๆ จากต่างประเทศ (ทำด้วยกันที่สตูดิโอทำอาหาร)', group: 'learn', city: B, fromThb: 700, hours: 2.5, plusVenue: 'school', ease: 'licensed', easeLabel: 'Studio', demand: 'medium', twoWay: true, emoji: '🍝', venueEn: 'Rentable cooking studio, Ari', venueTh: 'สตูดิโอทำอาหารให้เช่า อารีย์' },
  { id: 'study-abroad-qa', title: 'Study-abroad Q&A (applications, life there)', titleTh: 'ถาม-ตอบเรียนต่อต่างประเทศ (การสมัคร ชีวิตที่นั่น)', group: 'learn', city: BP, fromThb: 400, hours: 1, ease: 'easy', demand: 'medium', twoWay: true, emoji: '🎓', venueEn: 'Library café, Samyan Mitrtown', venueTh: 'คาเฟ่ห้องสมุด สามย่านมิตรทาวน์' },
  { id: 'garland-fruit-carving', title: 'Garland (malai) or fruit-carving workshop', titleTh: 'เวิร์กช็อปร้อยมาลัยหรือแกะสลักผลไม้', group: 'learn', city: B, fromThb: 700, hours: 2, ease: 'knowhow', demand: 'niche', emoji: '💐', venueEn: 'Community workshop, Pak Khlong Talat', venueTh: 'เวิร์กช็อปชุมชน ปากคลองตลาด' },

  // ── Practical help · daytime, public places ───────────────────────────────
  { id: 'airport-buddy', title: 'Airport pickup buddy (arrivals, meter taxi or train, SIM)', titleTh: 'โลคอลรับที่สนามบิน (ขาเข้า แท็กซี่มิเตอร์หรือรถไฟ ซิม)', group: 'practical', city: B, fromThb: 700, hours: 2, ease: 'easy', demand: 'high', onboardFirst: true, emoji: '🛬', venueEn: 'Suvarnabhumi arrivals, gate 3', venueTh: 'สุวรรณภูมิ ขาเข้า ประตู 3' },
  { id: 'sim-banking-help', title: 'SIM, e-wallet & banking set-up help', titleTh: 'ช่วยตั้งค่าซิม อีวอลเล็ท & ธนาคาร', group: 'practical', city: BP, fromThb: 400, hours: 1, ease: 'easy', demand: 'high', onboardFirst: true, emoji: '📱', venueEn: 'MBK Center service counter (2F)', venueTh: 'เคาน์เตอร์บริการ MBK (ชั้น 2)' },
  { id: 'transit-coaching', title: 'BTS, MRT & boats coaching', titleTh: 'สอนนั่ง BTS MRT & เรือ', group: 'practical', city: B, fromThb: 300, hours: 1, ease: 'easy', demand: 'medium', emoji: '🚇', venueEn: 'Siam BTS station', venueTh: 'สถานี BTS สยาม' },
  { id: 'hospital-buddy', title: 'Hospital & pharmacy translation buddy', titleTh: 'โลคอลช่วยแปลที่โรงพยาบาล & ร้านยา', group: 'practical', city: BP, fromThb: 800, hours: 2, ease: 'knowhow', easeLabel: 'Bilingual', demand: 'high', emoji: '🏥', venueEn: 'Bumrungrad Hospital main lobby', venueTh: 'ล็อบบี้โรงพยาบาลบำรุงราษฎร์' },
  { id: 'immigration-companion', title: 'Immigration-office companion (queue, forms, translation)', titleTh: 'โลคอลพาไปตรวจคนเข้าเมือง (คิว แบบฟอร์ม แปล)', group: 'practical', city: BP, fromThb: 900, hours: 3, ease: 'knowhow', demand: 'medium', emoji: '🛂', venueEn: 'Immigration office, Chaeng Watthana', venueTh: 'สำนักงานตรวจคนเข้าเมือง แจ้งวัฒนะ' },
  { id: 'apartment-viewing', title: 'Apartment-viewing buddy (daytime, the agent present, never a meeting place)', titleTh: 'โลคอลพาดูคอนโด (กลางวัน มีเอเจนต์อยู่ด้วย ไม่ใช่ที่นัดเจอ)', group: 'practical', city: BP, fromThb: 700, hours: 2, ease: 'knowhow', demand: 'medium', emoji: '🏢', venueEn: 'The building’s lobby, with the agent present', venueTh: 'ล็อบบี้อาคาร มีเอเจนต์อยู่ด้วย' },

  // ── Pattaya & sea ─────────────────────────────────────────────────────────
  { id: 'koh-larn-day', title: 'Koh Larn island day (ferry, beach, seafood)', titleTh: 'เที่ยวเกาะล้านทั้งวัน (เรือ ชายหาด ซีฟู้ด)', group: 'sea', city: P, fromThb: 1500, hours: 6, ease: 'easy', demand: 'high', emoji: '🏝️', venueEn: 'Bali Hai pier', venueTh: 'ท่าเรือแหลมบาลีฮาย' },
  { id: 'jomtien-run', title: 'Jomtien beach morning or sunset run', titleTh: 'วิ่งชายหาดจอมเทียนเช้าหรือเย็น', group: 'sea', city: P, fromThb: 500, hours: 1.5, ease: 'easy', demand: 'medium', onboardFirst: true, emoji: '🌊', venueEn: 'Jomtien Beach Rd', venueTh: 'ถนนหาดจอมเทียน' },
  { id: 'naklua-viewpoint-pier', title: 'Viewpoint & old Naklua fishing pier', titleTh: 'จุดชมวิว & สะพานปลานาเกลือ', group: 'sea', city: P, fromThb: 600, hours: 2, ease: 'easy', demand: 'medium', emoji: '🎣', venueEn: 'Pattaya viewpoint (Khao Pattaya)', venueTh: 'จุดชมวิวเขาพัทยา' },
  { id: 'bkk-pattaya-daytrip', title: 'Bangkok → Pattaya day-trip buddy (bus or van)', titleTh: 'โลคอลพาเที่ยวกรุงเทพฯ → พัทยา แบบไปกลับ (รถบัสหรือรถตู้)', group: 'sea', city: BP, route: true, fromThb: 2000, hours: 10, ease: 'knowhow', demand: 'medium', emoji: '🚌', venueEn: 'Ekkamai bus terminal', venueTh: 'สถานีขนส่งเอกมัย' },

  // ── Pre-trip · online, in-app video ───────────────────────────────────────
  { id: 'video-trip-planning', title: 'Video-call trip planning (30 min)', titleTh: 'วิดีโอคอลวางแผนเที่ยว (30 นาที)', group: 'pretrip', city: BP, online: true, fromThb: 300, hours: 0.5, ease: 'easy', demand: 'high', onboardFirst: true, emoji: '📹', venueEn: 'In-app video call', venueTh: 'วิดีโอคอลในแอป' },
  { id: 'quote-check', title: 'Quote check before you book (taxi, tour, tailor)', titleTh: 'เช็คราคาก่อนจอง (แท็กซี่ ทัวร์ ร้านตัดสูท)', group: 'pretrip', city: BP, online: true, fromThb: 150, hours: 0.25, ease: 'easy', demand: 'medium', emoji: '🔎', venueEn: 'In-app video call', venueTh: 'วิดีโอคอลในแอป' },
  { id: 'arrival-day-plan', title: 'Arrival-day plan & route pack', titleTh: 'แผนวันแรกถึง & เส้นทาง', group: 'pretrip', city: BP, online: true, fromThb: 400, hours: 0.75, ease: 'easy', demand: 'medium', emoji: '🗺️', venueEn: 'In-app video call', venueTh: 'วิดีโอคอลในแอป' },
]

const INCLUDED_BY_GROUP: Record<ExperienceGroupId, { en: string[]; th: string[] }> = {
  eat: { en: ['A verified local who knows the stalls', 'Ordering & translation', 'Fair prices, no tourist menu'], th: ['โลคอลยืนยันตัวตนที่รู้จักร้าน', 'ช่วยสั่ง & แปล', 'ราคากันเอง ไม่ใช่เมนูนักท่องเที่ยว'] },
  culture: { en: ['A verified local companion', 'Dress code & etiquette tips', 'Tickets & queues sorted'], th: ['โลคอลยืนยันตัวตน', 'แนะนำการแต่งกาย & มารยาท', 'ช่วยเรื่องตั๋ว & คิว'] },
  wellness: { en: ['Booking at a licensed venue', 'Translation with the staff', 'Company before & after'], th: ['จองร้านที่มีใบอนุญาต', 'ช่วยแปลกับพนักงาน', 'อยู่ด้วยทั้งก่อน & หลัง'] },
  active: { en: ['A verified local who does it weekly', 'Route or class sorted', 'Water & cool-down spot'], th: ['โลคอลที่เล่นประจำ', 'จัดเส้นทางหรือคลาสให้', 'น้ำดื่ม & จุดพัก'] },
  shopping: { en: ['Sizes, stalls & fair bargaining', 'Translation', 'Carry-bag help'], th: ['ไซซ์ ร้าน & ต่อราคาอย่างแฟร์', 'ช่วยแปล', 'ช่วยถือของ'] },
  evenings: { en: ['A verified local', 'Public venues only', 'Ride home on route'], th: ['โลคอลยืนยันตัวตน', 'สถานที่สาธารณะเท่านั้น', 'ช่วยเรียกรถกลับ'] },
  learn: { en: ['A patient local teacher', 'Materials at the venue', 'Notes to keep'], th: ['โลคอลสอนใจเย็น', 'อุปกรณ์ที่สถานที่', 'โน้ตเก็บไว้ทบทวน'] },
  practical: { en: ['Daytime, public places', 'Forms & translation', 'Fair-price checks'], th: ['กลางวัน ที่สาธารณะ', 'แบบฟอร์ม & การแปล', 'เช็คราคาให้แฟร์'] },
  sea: { en: ['Ferry or route sorted', 'Seafood at local prices', 'Safe beach spots'], th: ['จัดเรือหรือเส้นทาง', 'ซีฟู้ดราคาโลคอล', 'จุดเล่นน้ำที่ปลอดภัย'] },
  pretrip: { en: ['In-app video, contacts masked', 'A written plan after', 'Kring Price checks'], th: ['วิดีโอคอลในแอป ปิดเบอร์ติดต่อ', 'สรุปแผนเป็นข้อความ', 'เช็คราคากริ๊ง'] },
}

/** T3 · also for Thais on a weekend trip (a Pattaya local in Bangkok, a Bangkok office worker in Pattaya). */
const WEEKEND_IDS = new Set<string>([
  'night-market-tasting', 'cafe-hop-desserts', 'mookata-dinner', 'naklua-seafood-lunch', 'old-town-walk', 'canal-longtail',
  'flower-amulet-market', 'sanctuary-big-buddha', 'bang-krachao-cycling', 'kayak-sup', 'running-club', 'chatuchak-guide',
  'floating-market', 'vintage-thrift', 'chao-phraya-sunset', 'sunset-viewpoint-snacks', 'board-game-dessert', 'photo-walk',
  'koh-larn-day', 'jomtien-run', 'naklua-viewpoint-pier', 'bkk-pattaya-daytrip',
])
const INCLUDED_TWO_WAY = {
  en: ['Someone who moved here and lives it', 'Both of you practise and learn', 'Public café or licensed studio'],
  th: ['คนที่ย้ายมาอยู่ไทยและใช้ชีวิตจริง', 'ได้ฝึกและเรียนรู้ทั้งสองฝ่าย', 'คาเฟ่สาธารณะหรือสตูดิโอที่มีใบอนุญาต'],
}

export const EXPERIENCES: Experience[] = ROWS.map((r) => ({
  ...r,
  venueEn: r.venueEn ?? 'Public venue',
  venueTh: r.venueTh ?? 'สถานที่สาธารณะ',
  included: r.included ?? (r.twoWay ? INCLUDED_TWO_WAY.en : INCLUDED_BY_GROUP[r.group].en),
  includedTh: r.includedTh ?? (r.twoWay ? INCLUDED_TWO_WAY.th : INCLUDED_BY_GROUP[r.group].th),
  audience: r.twoWay ? ['twoway'] : WEEKEND_IDS.has(r.id) ? ['travellers', 'weekend'] : ['travellers'],
}))

/** T3 · the audience tag: `short` for cards ("Weekend trip"), long for filters and spoken labels. */
export function audienceLabel(a: Audience, lang: string = 'en', short = false): string {
  const th = lang === 'th'
  if (a === 'twoway') return th ? 'แลกเปลี่ยนกัน' : 'Two-way'
  if (a === 'weekend') return th ? (short ? 'เที่ยวสุดสัปดาห์' : 'สำหรับคนไทยเที่ยวสุดสัปดาห์') : short ? 'Weekend trip' : 'For Thais on a weekend trip'
  return th ? 'สำหรับนักท่องเที่ยว' : 'For travellers'
}
/**
 * The one tag a card shows: two-way first; "weekend trip" when the viewer is a Thai away from her home city (W1's
 * `useAwayFromHome`) or browsing in Thai; else "for travellers".
 */
export function primaryAudience(e: Pick<Experience, 'audience'>, preferWeekend = false): Audience {
  if (e.audience.includes('twoway')) return 'twoway'
  if (preferWeekend && e.audience.includes('weekend')) return 'weekend'
  return e.audience.includes('travellers') ? 'travellers' : e.audience[0] ?? 'travellers'
}

// ── per-city venues ────────────────────────────────────────────────────────
/*
 * FIX1 · Wei 9 — an experience offered in both cities must never show the other city's venue (Bangkok's night market
 * was "Thepprasit market", which is in Pattaya; Pattaya's shopping buddy said "Siam"). `venueEn/venueTh` on a row is the
 * Bangkok venue; PATTAYA_VENUES overrides it in Pattaya. Always read venues through `venueIn(e, city)`.
 */
const PATTAYA_VENUES: Record<string, [string, string]> = {
  'night-market-tasting': ['Thepprasit night market', 'ตลาดนัดเทพประสิทธิ์'],
  'mookata-dinner': ['Busy mookata restaurant, Naklua', 'ร้านหมูกระทะ นาเกลือ'],
  'cha-yen-fruit': ['Naklua fruit market & tea stall', 'ตลาดผลไม้นาเกลือ & ร้านชา'],
  'shopping-buddy': ['Terminal 21 Pattaya · Central Festival', 'เทอร์มินอล 21 พัทยา · เซ็นทรัลเฟสติวัล'],
  'park-yoga': ['Jomtien beach park lawn', 'สนามหญ้าสวนหาดจอมเทียน'],
  'floating-market': ['Pattaya Floating Market entrance', 'ทางเข้าตลาดน้ำสี่ภาค พัทยา'],
  'night-market-live-music': ['Thepprasit night market · live-music café', 'ตลาดนัดเทพประสิทธิ์ · คาเฟ่ดนตรีสด'],
  'sunset-viewpoint-snacks': ['Seaside café terrace, Pratumnak', 'ระเบียงคาเฟ่ริมทะเล พระตำหนัก'],
  'sim-banking-help': ['Mall service counter, Central Pattaya', 'เคาน์เตอร์บริการ เซ็นทรัลพัทยา'],
  'hospital-buddy': ['Hospital main lobby, Pattaya', 'ล็อบบี้โรงพยาบาล พัทยา'],
  'immigration-companion': ['Immigration office, Jomtien Soi 5', 'สำนักงานตรวจคนเข้าเมือง จอมเทียนซอย 5'],
  'thai-massage-spa': ['Licensed spa lobby, Pattaya Second Rd', 'ล็อบบี้สปามีใบอนุญาต ถนนพัทยาสาย 2'],
  'foot-massage': ['Licensed foot-massage shop, Pattaya Beach Rd', 'ร้านนวดเท้ามีใบอนุญาต ถนนเลียบหาดพัทยา'],
  'spa-day': ['Licensed day spa, Pratumnak', 'เดย์สปามีใบอนุญาต พระตำหนัก'],
  'salon-nails': ['Central Festival Pattaya beauty floor', 'ชั้นบิวตี้ เซ็นทรัลเฟสติวัล พัทยา'],
  'muay-thai-beginner': ['Licensed Muay Thai gym, Jomtien', 'ค่ายมวยมีใบอนุญาต จอมเทียน'],
  'cooking-class': ['Cooking school, Naklua', 'โรงเรียนสอนทำอาหาร นาเกลือ'],
  'read-thai-menu': ['Local restaurant, Naklua', 'ร้านอาหารท้องถิ่น นาเกลือ'],
  'thai-language-cafe': ['Quiet café, Jomtien', 'คาเฟ่เงียบ ๆ จอมเทียน'],
  'apartment-viewing': ['The building’s lobby, with the agent present', 'ล็อบบี้อาคาร มีเอเจนต์อยู่ด้วย'],
  'english-chat-coffee': ['Beach-road café, Central Pattaya', 'คาเฟ่ถนนเลียบหาด พัทยากลาง'],
  'interview-practice-english': ['Co-working café, Central Pattaya', 'คาเฟ่โคเวิร์กกิ้ง พัทยากลาง'],
  'study-abroad-qa': ['Quiet café, Jomtien', 'คาเฟ่เงียบ ๆ จอมเทียน'],
}

/** The meeting place of `e` in `city` ({en, th}). */
export function venueIn(e: Pick<Experience, 'id' | 'venueEn' | 'venueTh'>, city: City): { en: string; th: string } {
  const o = city === 'pattaya' ? PATTAYA_VENUES[e.id] : undefined
  return o ? { en: o[0], th: o[1] } : { en: e.venueEn, th: e.venueTh }
}

// ── helpers ────────────────────────────────────────────────────────────────

export const CITIES: ReadonlyArray<{ id: City; en: CityLabel; th: string }> = [
  { id: 'bangkok', en: 'Bangkok', th: 'กรุงเทพฯ' },
  { id: 'pattaya', en: 'Pattaya', th: 'พัทยา' },
]

export function toCity(label: string | undefined | null): City {
  return String(label ?? '').toLowerCase().startsWith('pat') ? 'pattaya' : 'bangkok'
}
export function cityLabel(c: City): CityLabel {
  return c === 'pattaya' ? 'Pattaya' : 'Bangkok'
}

export function getExperience(id: string | undefined | null): Experience | undefined {
  return id ? EXPERIENCES.find((e) => e.id === id) : undefined
}
export function getGroup(id: ExperienceGroupId): ExperienceGroup {
  return GROUPS.find((g) => g.id === id) ?? GROUPS[0]
}

/** Experiences available in a city, ★ onboard-first first, then by demand. */
export function experiencesIn(city: City, group?: ExperienceGroupId | 'all'): Experience[] {
  const rank: Record<Demand, number> = { high: 0, medium: 1, niche: 2 }
  return EXPERIENCES.filter((e) => e.city.includes(city) && (!group || group === 'all' || e.group === group)).sort(
    (a, b) => Number(!!b.onboardFirst) - Number(!!a.onboardFirst) || rank[a.demand] - rank[b.demand],
  )
}

/** Per-group counts for a city (catalogue tiles). */
export function groupCounts(city: City): Record<ExperienceGroupId, number> {
  const out = Object.fromEntries(GROUPS.map((g) => [g.id, 0])) as Record<ExperienceGroupId, number>
  for (const e of EXPERIENCES) if (e.city.includes(city)) out[e.group] += 1
  return out
}

/** Groups that have at least one experience in the city, in catalogue order. */
export function groupsIn(city: City): ExperienceGroup[] {
  const c = groupCounts(city)
  return GROUPS.filter((g) => c[g.id] > 0)
}

export const ONBOARD_FIRST: Experience[] = EXPERIENCES.filter((e) => e.onboardFirst)

/** "~3h" · "30 min" · "~1.5h" — matches the catalogue table. */
export function durationLabel(hours: number, lang: string = 'en'): string {
  const th = lang === 'th'
  if (hours < 1) {
    const m = Math.round(hours * 60)
    return th ? `${m} นาที` : `${m} min`
  }
  return th ? `~${hours} ชม.` : `~${hours}h`
}

/** "from ฿1,200 · ~3h" (card meta line). */
export function priceLine(e: Pick<Experience, 'fromThb' | 'hours' | 'plusVenue'>, lang: string = 'en'): string {
  const th = lang === 'th'
  const p = `฿${e.fromThb.toLocaleString('en-US')}`
  const plus = e.plusVenue ? (th ? ' + ค่าสถานที่' : ` + ${e.plusVenue}`) : ''
  return `${th ? 'เริ่ม' : 'from'} ${p}${plus} · ${durationLabel(e.hours, lang)}`
}

/** Experiences a host of a given legacy type could plausibly host (for profile + matching). */
export function experiencesForHostType(type: LegacyHostType | undefined, city: City): Experience[] {
  if (!type) return experiencesIn(city).slice(0, 3)
  return experiencesIn(city).filter((e) => getGroup(e.group).hostTypes.includes(type))
}

/** Short title (before the parenthesis) for chips and compact cards. */
export function shortTitle(e: Pick<Experience, 'title'>): string {
  return e.title.replace(/\s*\(.*\)\s*$/, '').trim()
}
export function shortTitleTh(e: Pick<Experience, 'titleTh'>): string {
  return e.titleTh.replace(/\s*\(.*\)\s*$/, '').trim()
}

/**
 * Option A · Licensed scene-first photography for every Experience card & detail hero.
 * All files live in `public/photos/experiences/` (compressed <48 KB JPEGs under Unsplash License;
 * see `public/photos/experiences/ATTRIBUTION.md`). Scene leads — food, market, temple, spa interior,
 * Muay Thai ring, park or beach — never a single woman's portrait.
 */
const PHOTO_BY_ID: Readonly<Record<string, string>> = {
  'street-food-walk': '/photos/experiences/yaowarat-food.jpg',
  'night-market-tasting': '/photos/experiences/night-market.jpg',
  'cafe-hop-desserts': '/photos/experiences/cafe-desserts.jpg',
  'local-breakfast': '/photos/experiences/thai-breakfast.jpg',
  'mookata-dinner': '/photos/experiences/mookata-bbq.jpg',
  'isan-food-night': '/photos/experiences/mookata-bbq.jpg',
  'cha-yen-fruit': '/photos/experiences/thai-tea-fruit.jpg',
  'naklua-seafood-lunch': '/photos/experiences/seafood-market.jpg',
  'temple-cafe-morning': '/photos/experiences/wat-arun-temple.jpg',
  'grand-palace-companion': '/photos/experiences/grand-palace.jpg',
  'old-town-walk': '/photos/experiences/talat-noi-oldtown.jpg',
  'canal-longtail': '/photos/experiences/canal-longtail.jpg',
  'merit-making': '/photos/experiences/wat-arun-temple.jpg',
  'flower-amulet-market': '/photos/experiences/flower-market.jpg',
  'sanctuary-big-buddha': '/photos/experiences/grand-palace.jpg',
  'thai-massage-spa': '/photos/experiences/thai-spa.jpg',
  'foot-massage': '/photos/experiences/thai-spa.jpg',
  'spa-day': '/photos/experiences/thai-spa.jpg',
  'salon-nails': '/photos/experiences/salon-park.jpg',
  'barber-shave': '/photos/experiences/talat-noi-oldtown.jpg',
  'park-yoga': '/photos/experiences/salon-park.jpg',
  'muay-thai-beginner': '/photos/experiences/muay-thai.jpg',
  'running-club': '/photos/experiences/cycling-park.jpg',
  'bang-krachao-cycling': '/photos/experiences/cycling-park.jpg',
  'badminton-futsal': '/photos/experiences/muay-thai.jpg',
  'kayak-sup': '/photos/experiences/koh-larn-beach.jpg',
  'shopping-buddy': '/photos/experiences/shopping-market.jpg',
  'chatuchak-guide': '/photos/experiences/shopping-market.jpg',
  'floating-market': '/photos/experiences/canal-longtail.jpg',
  'fabric-tailor': '/photos/experiences/flower-market.jpg',
  'vintage-thrift': '/photos/experiences/talat-noi-oldtown.jpg',
  'night-market-live-music': '/photos/experiences/night-market.jpg',
  'chao-phraya-sunset': '/photos/experiences/chao-phraya-sunset.jpg',
  'sunset-viewpoint-snacks': '/photos/experiences/chao-phraya-sunset.jpg',
  'muay-thai-stadium': '/photos/experiences/muay-thai.jpg',
  'board-game-dessert': '/photos/experiences/cafe-desserts.jpg',
  'thai-language-cafe': '/photos/experiences/cafe-desserts.jpg',
  'cooking-class': '/photos/experiences/cooking-class.jpg',
  'photo-walk': '/photos/experiences/talat-noi-oldtown.jpg',
  'read-thai-menu': '/photos/experiences/thai-breakfast.jpg',
  'garland-fruit-carving': '/photos/experiences/flower-market.jpg',
  'english-chat-coffee': '/photos/experiences/cafe-desserts.jpg',
  'language-exchange-kr-jp': '/photos/experiences/cafe-desserts.jpg',
  'interview-practice-english': '/photos/experiences/practical-bangkok.jpg',
  'home-dish-abroad': '/photos/experiences/cooking-class.jpg',
  'study-abroad-qa': '/photos/experiences/pretrip-map.jpg',
  'airport-buddy': '/photos/experiences/practical-bangkok.jpg',
  'sim-banking-help': '/photos/experiences/practical-bangkok.jpg',
  'transit-coaching': '/photos/experiences/practical-bangkok.jpg',
  'hospital-buddy': '/photos/experiences/practical-bangkok.jpg',
  'immigration-companion': '/photos/experiences/practical-bangkok.jpg',
  'apartment-viewing': '/photos/experiences/practical-bangkok.jpg',
  'koh-larn-day': '/photos/experiences/koh-larn-beach.jpg',
  'jomtien-run': '/photos/experiences/koh-larn-beach.jpg',
  'naklua-viewpoint-pier': '/photos/experiences/chao-phraya-sunset.jpg',
  'bkk-pattaya-daytrip': '/photos/experiences/canal-longtail.jpg',
  'video-trip-planning': '/photos/experiences/pretrip-map.jpg',
  'quote-check': '/photos/experiences/pretrip-map.jpg',
  'arrival-day-plan': '/photos/experiences/pretrip-map.jpg',
}

const PHOTO_BY_GROUP: Readonly<Record<ExperienceGroupId, string>> = {
  eat: '/photos/experiences/yaowarat-food.jpg',
  culture: '/photos/experiences/wat-arun-temple.jpg',
  wellness: '/photos/experiences/thai-spa.jpg',
  active: '/photos/experiences/muay-thai.jpg',
  shopping: '/photos/experiences/shopping-market.jpg',
  evenings: '/photos/experiences/chao-phraya-sunset.jpg',
  learn: '/photos/experiences/cooking-class.jpg',
  practical: '/photos/experiences/practical-bangkok.jpg',
  sea: '/photos/experiences/koh-larn-beach.jpg',
  pretrip: '/photos/experiences/pretrip-map.jpg',
}

export function experiencePhoto(e: Pick<Experience, 'id' | 'group'>): string {
  return PHOTO_BY_ID[e.id] ?? PHOTO_BY_GROUP[e.group] ?? '/photos/experiences/yaowarat-food.jpg'
}

/**
 * V2 · the same scene as a tiny (40 px wide, ~1 KB) pre-softened JPEG in `public/photos/experiences/soft/`. Scaled up
 * it reads as a blurred backdrop with NO CSS blur filter (cheap to raster on low-end phones). Used behind the
 * silhouette while a local's real photo loads or if it fails.
 */
export function experienceSoftPhoto(e: Pick<Experience, 'id' | 'group'>): string {
  return experiencePhoto(e).replace('/photos/experiences/', '/photos/experiences/soft/')
}

// ── City switch (shared: Experiences + Kring Price) ────────────────────────
/*
 * One city for the whole app. Experiences (K2) and Kring Price (K4) both read/write it:
 *   const [city, setCity] = useCity()      // 'bangkok' | 'pattaya'
 * Persisted in localStorage `kring_city_v1`; every change fires `kring:city` { city } on window.
 * First open: the onboarding profile's city (chon_profile_v1.city), else Bangkok.
 */
export const CITY_KEY = 'kring_city_v1'
export const CITY_EVENT = 'kring:city'

function readCity(): City {
  try {
    const v = window.localStorage.getItem(CITY_KEY)
    if (v === 'bangkok' || v === 'pattaya') return v
    const p = JSON.parse(window.localStorage.getItem('chon_profile_v1') ?? 'null') as { city?: string } | null
    return toCity(p?.city)
  } catch {
    return 'bangkok'
  }
}
let cityNow: City | null = null
export function getCity(): City {
  if (typeof window === 'undefined') return cityNow ?? 'bangkok'
  // Storage is the source of truth (survives tests clearing it / other tabs); memory only when storage is blocked.
  try {
    const v = window.localStorage.getItem(CITY_KEY)
    if (v === 'bangkok' || v === 'pattaya') return (cityNow = v)
  } catch {
    if (cityNow) return cityNow
  }
  return (cityNow = readCity())
}
export function setCity(next: City): void {
  if (next === getCity()) return
  cityNow = next
  try {
    window.localStorage.setItem(CITY_KEY, next)
  } catch {
    /* storage blocked — the in-memory value still switches */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CITY_EVENT, { detail: { city: next } }))
}
function subscribeCity(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const on = (e: Event) => {
    const d = (e as CustomEvent<{ city?: City } | City>).detail
    const c = typeof d === 'string' ? d : d?.city
    if (c === 'bangkok' || c === 'pattaya') cityNow = c
    fn()
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === CITY_KEY) fn()
  }
  window.addEventListener(CITY_EVENT, on)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CITY_EVENT, on)
    window.removeEventListener('storage', onStorage)
  }
}
export function useCity(): [City, (c: City) => void] {
  const c = useSyncExternalStore(subscribeCity, getCity, () => 'bangkok' as City)
  return [c, setCity]
}

// ── Local profiles (how a local shows in Locals, on their profile, and who hosts what) ──
/*
 * Rule (R1): "Hosts at" is for a FIXED licensed venue (spa, salon, gym, school). "Happy to meet at" is for public
 * areas. Cards never show ages, "date", hearts or "meet me". Venue names are placeholders until venues sign up.
 * `signature` = the local's own experiences with their own from-price; `groups` = what else they are happy to host
 * (catalogue groups) at the catalogue price — used to find "locals who host this" for an experience.
 */
export interface LocalExperience {
  id: string
  titleEn: string
  titleTh: string
  fromThb: number
  hours: number
  /** one small line under the title ("licensed spa", "public cafés") */
  noteEn: string
  noteTh: string
}
export interface LocalProfile {
  hostId: string
  name: string
  city: City
  /** small tag on the card photo: "Siam", "Chinatown" */
  areaEn: string
  areaTh: string
  venueMode: 'hostsAt' | 'meetAt'
  placeEn: string
  placeTh: string
  licensed?: 'spa' | 'salon' | 'gym' | 'school'
  signature: LocalExperience[]
  groups: ExperienceGroupId[]
  rating: number
  reviews: number
  /** experiences completed on Kring */
  done: number
  langs: string[]
  replyMin: number
  /** one honest line from the local (profile) */
  bioEn: string
  bioTh: string
  /**
   * recent review snippets (profile + experience detail). `exp` = the catalogue experience the review is about — an
   * experience page only shows reviews of THAT experience (FIX1 · Wei 9: no spa review under a food walk). `party`
   * says who booked (solo / couple / family / group) so the demo reads like real, mixed travellers.
   */
  quotes: Array<{ who: string; from: string; text: string; stars: number; exp: string; party?: 'solo' | 'couple' | 'family' | 'group' }>
}

const sig = (id: string, fromThb: number, titleEn?: string, titleTh?: string, noteEn?: string, noteTh?: string): LocalExperience => {
  const e = getExperience(id)
  return {
    id,
    titleEn: titleEn ?? (e ? shortTitle(e) : id),
    titleTh: titleTh ?? (e ? shortTitleTh(e) : id),
    fromThb,
    hours: e?.hours ?? 2,
    noteEn: noteEn ?? (e?.venueEn ?? 'public venue'),
    noteTh: noteTh ?? (e?.venueTh ?? 'สถานที่สาธารณะ'),
  }
}

export const LOCAL_PROFILES: Record<string, LocalProfile> = {
  'host-mint': {
    hostId: 'host-mint', name: 'Mint', city: 'bangkok', areaEn: 'Siam', areaTh: 'สยาม',
    venueMode: 'hostsAt', placeEn: 'Nara Salon, Siam Square', placeTh: 'นาราซาลอน สยามสแควร์', licensed: 'salon',
    signature: [
      sig('salon-nails', 900, 'Hair & nails at Nara Salon', 'ทำผม ทำเล็บที่นาราซาลอน', 'licensed salon', 'ซาลอนมีใบอนุญาต'),
      sig('shopping-buddy', 700, 'Siam shopping buddy', 'ช้อปสยามกับโลคอล', 'malls & markets', 'ห้าง & ตลาด'),
    ],
    groups: ['wellness', 'shopping'], rating: 4.8, reviews: 61, done: 74, langs: ['Thai', 'English'], replyMin: 10,
    bioEn: 'Salon regular and Siam shopper. I know which stalls have real sizes.',
    bioTh: 'ขาประจำซาลอน สายช้อปสยาม รู้ว่าร้านไหนไซซ์ตรง',
    quotes: [
      { who: 'Hana', from: 'Japan', exp: 'salon-nails', party: 'solo', text: 'Best nails of my trip and a fair price, no tourist menu.', stars: 5 },
      { who: 'Léo & Camille', from: 'France', exp: 'shopping-buddy', party: 'couple', text: 'Found both our sizes in ten minutes. Bargained politely for us.', stars: 5 },
    ],
  },
  'host-ploy': {
    hostId: 'host-ploy', name: 'Ploy', city: 'bangkok', areaEn: 'Ari', areaTh: 'อารีย์',
    venueMode: 'hostsAt', placeEn: 'Siam Herbal Spa, Ari', placeTh: 'สยามเฮอร์บัลสปา อารีย์', licensed: 'spa',
    signature: [
      sig('spa-day', 1100, 'Herbal spa afternoon', 'บ่ายสปาสมุนไพร', 'licensed spa', 'สปามีใบอนุญาต'),
      sig('cafe-hop-desserts', 700, 'Ari café & market morning', 'เช้าคาเฟ่ & ตลาดอารีย์', 'public cafés', 'คาเฟ่สาธารณะ'),
    ],
    groups: ['wellness', 'culture'], rating: 4.9, reviews: 118, done: 126, langs: ['Thai', 'English', '日本語'], replyMin: 10,
    bioEn: 'Ari born. Herbal compress, Thai desserts and slow mornings.',
    bioTh: 'เด็กอารีย์ ชอบลูกประคบ ขนมไทย และเช้าชิล ๆ',
    quotes: [
      { who: 'Sarah', from: 'UK', exp: 'spa-day', party: 'solo', text: 'Felt safe the whole time. The spa was spotless.', stars: 5 },
      { who: 'Margaret & Ian', from: 'New Zealand', exp: 'spa-day', party: 'couple', text: 'Our first Thai herbal compress, in our sixties. Ploy translated every step.', stars: 5 },
      { who: 'Aiko', from: 'Japan', exp: 'cafe-hop-desserts', party: 'solo', text: 'Five Ari cafés and the best khanom chan I have had. Slow and lovely.', stars: 5 },
    ],
  },
  'host-kwan': {
    hostId: 'host-kwan', name: 'Kwan', city: 'bangkok', areaEn: 'Chinatown', areaTh: 'เยาวราช',
    venueMode: 'meetAt', placeEn: 'Yaowarat Rd, Chinatown', placeTh: 'ถนนเยาวราช',
    signature: [
      sig('street-food-walk', 1200, 'Street-food walk', 'เดินกินสตรีทฟู้ด', 'nine stalls', '9 ร้าน'),
      sig('night-market-tasting', 700, 'Night-market tasting', 'ชิมตลาดกลางคืน', 'public market', 'ตลาดสาธารณะ'),
    ],
    groups: ['eat', 'culture', 'evenings'], rating: 4.8, reviews: 88, done: 92, langs: ['Thai', 'English', 'Tiếng Việt'], replyMin: 15,
    bioEn: 'I eat my way down Yaowarat every week. Nine stalls, no tourist menus.',
    bioTh: 'ตะลุยกินเยาวราชทุกอาทิตย์ 9 ร้าน ไม่มีเมนูนักท่องเที่ยว',
    quotes: [
      { who: 'Priya', from: 'India', exp: 'street-food-walk', party: 'solo', text: 'Felt safe the whole time. Nine stalls and a perfect pace.', stars: 5 },
      { who: 'The Murphys', from: 'Ireland', exp: 'street-food-walk', party: 'family', text: 'Two kids, nine stalls, zero tourist menus. We paid what locals pay.', stars: 5 },
      { who: 'Tom', from: 'Australia', exp: 'night-market-tasting', party: 'solo', text: 'Knew exactly which stalls to skip. Would book again.', stars: 5 },
    ],
  },
  'host-bee': {
    hostId: 'host-bee', name: 'Bee', city: 'bangkok', areaEn: 'Charoen Krung', areaTh: 'เจริญกรุง',
    venueMode: 'meetAt', placeEn: 'Riverside cafés, Charoen Krung', placeTh: 'คาเฟ่ริมน้ำ เจริญกรุง',
    signature: [
      sig('sunset-viewpoint-snacks', 850, 'Riverside sunset · Thai snacks', 'ชมพระอาทิตย์ตกริมน้ำ · ขนมไทย', 'riverside café terrace', 'ระเบียงคาเฟ่ริมน้ำ'),
      sig('photo-walk', 800, 'Golden-hour photo walk', 'เดินถ่ายรูปแสงทอง', 'street art', 'สตรีทอาร์ต'),
    ],
    groups: ['evenings', 'learn', 'eat'], rating: 4.9, reviews: 54, done: 58, langs: ['Thai', 'English'], replyMin: 10,
    bioEn: 'Riverside sunsets, Cha Yen and the best photo corners on Charoen Krung.',
    bioTh: 'สายพระอาทิตย์ตกริมน้ำ ชาเย็น และมุมถ่ายรูปเจริญกรุง',
    quotes: [
      { who: 'Mia & Jonas', from: 'Germany', exp: 'sunset-viewpoint-snacks', party: 'couple', text: 'The view, the snacks, the Cha Yen. A perfect sunset.', stars: 5 },
      { who: 'Raj', from: 'India', exp: 'photo-walk', party: 'solo', text: 'Knew every corner for the light. Very professional.', stars: 5 },
    ],
  },
  'host-fah': {
    hostId: 'host-fah', name: 'Fah', city: 'pattaya', areaEn: 'Jomtien', areaTh: 'จอมเทียน',
    venueMode: 'meetAt', placeEn: 'Jomtien Beach Rd', placeTh: 'ถนนหาดจอมเทียน',
    signature: [
      sig('koh-larn-day', 1500, 'Koh Larn island day', 'เที่ยวเกาะล้านทั้งวัน', 'ferry & beach', 'เรือ & ชายหาด'),
      sig('jomtien-run', 500, 'Jomtien sunset run', 'วิ่งหาดจอมเทียนตอนเย็น', 'public beach', 'ชายหาดสาธารณะ'),
    ],
    groups: ['sea', 'eat', 'active'], rating: 4.9, reviews: 47, done: 51, langs: ['Thai', 'English', 'Русский'], replyMin: 15,
    bioEn: 'Pattaya local. Ferries, beaches and seafood at local prices.',
    bioTh: 'คนพัทยา เรือ ทะเล ซีฟู้ดราคาโลคอล',
    quotes: [
      { who: 'Anna', from: 'Russia', exp: 'koh-larn-day', party: 'group', text: 'Four of us, Koh Larn without the tour-desk prices. Thank you!', stars: 5 },
      { who: 'Jake', from: 'USA', exp: 'jomtien-run', party: 'solo', text: 'Easy 5 km at sunrise, friendly and on time.', stars: 5 },
    ],
  },
  'host-bell': {
    hostId: 'host-bell', name: 'Bell', city: 'bangkok', areaEn: 'Silom', areaTh: 'สีลม',
    venueMode: 'meetAt', placeEn: 'night markets, Silom', placeTh: 'ตลาดกลางคืน สีลม',
    signature: [
      sig('night-market-live-music', 800, 'Night market & live-music café', 'ตลาดกลางคืน & คาเฟ่ดนตรีสด', 'public café', 'คาเฟ่สาธารณะ'),
      sig('board-game-dessert', 500, 'Dessert café night', 'คืนคาเฟ่ขนมหวาน', 'public café', 'คาเฟ่สาธารณะ'),
    ],
    groups: ['evenings', 'eat', 'learn'], rating: 4.7, reviews: 12, done: 12, langs: ['Thai', 'English'], replyMin: 20,
    bioEn: 'New on Kring. Live music, desserts and Silom’s best night stalls.',
    bioTh: 'มือใหม่บนกริ๊ง ดนตรีสด ขนมหวาน และร้านเด็ดสีลม',
    quotes: [{ who: 'Chloe', from: 'Canada', exp: 'night-market-live-music', party: 'solo', text: 'Great music café and the mango sticky rice!', stars: 5 }],
  },
  'host-ken': {
    hostId: 'host-ken', name: 'Ken', city: 'bangkok', areaEn: 'Lumphini', areaTh: 'ลุมพินี',
    venueMode: 'hostsAt', placeEn: 'Lumphini Muay Thai Gym', placeTh: 'ค่ายมวยลุมพินี', licensed: 'gym',
    signature: [
      sig('muay-thai-beginner', 1000, 'Muay Thai first session', 'มวยไทยครั้งแรก', 'licensed gym', 'ค่ายมวยมีใบอนุญาต'),
      sig('running-club', 300, 'Lumphini running club', 'วิ่งสวนลุมพินี', 'public park', 'สวนสาธารณะ'),
    ],
    groups: ['active', 'evenings'], rating: 4.8, reviews: 39, done: 41, langs: ['Thai', 'English', '한국어'], replyMin: 15,
    bioEn: 'Trains at a licensed gym every morning. Beginners welcome.',
    bioTh: 'ซ้อมที่ค่ายมวยมีใบอนุญาตทุกเช้า มือใหม่ก็มาได้',
    quotes: [
      { who: 'Min-ji', from: 'Korea', exp: 'muay-thai-beginner', party: 'solo', text: 'Patient coach, licensed gym, great workout. First time ever.', stars: 5 },
      { who: 'Diego', from: 'Spain', exp: 'running-club', party: 'solo', text: 'Lumphini at 6 am with the locals. Best start to a day.', stars: 5 },
    ],
  },
}

/** Profile for a host id (or a sensible default built from the catalogue for hosts not listed). */
export function localProfile(host: { id: string; name: string; city?: string; hostType?: string }): LocalProfile {
  const p = LOCAL_PROFILES[host.id]
  if (p) return p
  const city = toCity(host.city)
  const firstGroup = GROUPS.find((g) => g.hostTypes.includes((host.hostType ?? 'food') as LegacyHostType)) ?? GROUPS[0]
  const picks = experiencesIn(city, firstGroup.id).slice(0, 2)
  return {
    hostId: host.id, name: host.name, city, areaEn: cityLabel(city), areaTh: city === 'pattaya' ? 'พัทยา' : 'กรุงเทพฯ',
    venueMode: 'meetAt', placeEn: picks[0] ? venueIn(picks[0], city).en : 'public venues', placeTh: picks[0] ? venueIn(picks[0], city).th : 'สถานที่สาธารณะ',
    signature: picks.map((e) => sig(e.id, e.fromThb)),
    groups: [firstGroup.id], rating: 4.8, reviews: 0, done: 0, langs: ['Thai', 'English'], replyMin: 15,
    bioEn: '', bioTh: '', quotes: [],
  }
}

/**
 * KRING FIX2 · Ploy 4 — your own Local profile, built from what you listed (selfGuard `selfLocalCard()`), registered
 * so `localProfile({ id })` returns it everywhere (card, profile page, Experiences hosts). New: no rating, no reviews.
 */
const LANG_NAMES: Record<string, string> = { th: 'Thai', en: 'English', zh: '中文', ru: 'Русский', ja: '日本語', ko: '한국어', hi: 'हिन्दी', vi: 'Tiếng Việt' }
export function registerSelfProfile(sl: { id: string; name: string; city: string; langs: string[]; experiences: Array<{ id: string; priceThb: number }> }): LocalProfile {
  const city = toCity(sl.city)
  const listed = sl.experiences.map((x) => ({ x, e: getExperience(x.id) })).filter((r): r is { x: { id: string; priceThb: number }; e: Experience } => Boolean(r.e))
  const first = listed[0]?.e
  const place = first ? venueIn(first, city) : { en: 'public venues', th: 'สถานที่สาธารณะ' }
  // T3 · what she typed in "Share something you love" (her own name for it, where she meets) wins over the catalogue
  const det = readListingDetails()
  const p: LocalProfile = {
    hostId: sl.id, name: sl.name, city, areaEn: cityLabel(city), areaTh: city === 'pattaya' ? 'พัทยา' : 'กรุงเทพฯ',
    venueMode: 'meetAt', placeEn: det[first?.id ?? '']?.area || place.en, placeTh: det[first?.id ?? '']?.area || place.th,
    signature: listed.map(({ x, e }) => {
      const d = det[e.id]
      return sig(e.id, x.priceThb, d?.name || undefined, d?.name || undefined, d?.area || venueIn(e, city).en, d?.area || venueIn(e, city).th)
    }),
    groups: [...new Set(listed.map(({ e }) => e.group))],
    rating: 0, reviews: 0, done: 0,
    langs: sl.langs.map((c) => LANG_NAMES[c] ?? c),
    replyMin: 15, bioEn: '', bioTh: '', quotes: [],
  }
  LOCAL_PROFILES[sl.id] = p
  return p
}

// ── T3 · "Share something you love" — what the sheet adds on top of presence's { id, priceThb } listing ──────
/*
 * The listing itself goes through the one existing path: presence `writePresence({ setup, experiences, live })`
 * (src/context/presence.ts). The extra words she typed — her own name for it, her photo, where she meets, usual
 * times, languages — live here per catalogue id (localStorage `kring_listing_details_v1`; a real listing row is a
 * backend stop-point). LISTING_EVENT fires after every save: detail { id }.
 */
export interface ListingDetail {
  id: string
  name: string
  /** a small JPEG data URL (≤ ~60 KB) or empty = the catalogue scene photo */
  photo?: string
  area: string
  times: string[]
  langs: string[]
  /** Optional TAT tour-guide licence number if the host is a licensed guide */
  tatLicence?: string
  updatedAt: string
}
export const LISTING_DETAILS_KEY = 'kring_listing_details_v1'
export const LISTING_EVENT = 'kring:listing-saved'

export function readListingDetails(): Record<string, ListingDetail> {
  if (typeof window === 'undefined') return {}
  try {
    const v = JSON.parse(window.localStorage.getItem(LISTING_DETAILS_KEY) ?? '{}') as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, ListingDetail>) : {}
  } catch {
    return {}
  }
}
export function saveListingDetail(d: Omit<ListingDetail, 'updatedAt'>): ListingDetail {
  const next: ListingDetail = { ...d, name: d.name.trim().slice(0, 60), area: d.area.trim().slice(0, 80), updatedAt: new Date().toISOString() }
  const all = { ...readListingDetails(), [d.id]: next }
  try {
    window.localStorage.setItem(LISTING_DETAILS_KEY, JSON.stringify(all))
  } catch {
    // a photo too big for storage: keep the words, drop the photo
    try {
      window.localStorage.setItem(LISTING_DETAILS_KEY, JSON.stringify({ ...all, [d.id]: { ...next, photo: '' } }))
    } catch {
      /* storage blocked */
    }
  }
  try {
    window.dispatchEvent(new CustomEvent(LISTING_EVENT, { detail: { id: d.id } }))
  } catch {
    /* ignore */
  }
  return next
}

/** Lowest trip fee a listing may ask (same floor as the booking card's trip-fee stepper). */
export const MIN_TRIP_FEE = 300
/** "Kring Price for café hops: ฿450–800" — the fair range for this kind of experience, rounded to ฿50. */
export function kringPriceRange(e: Pick<Experience, 'fromThb'>): [number, number] {
  const r = (n: number) => Math.round(n / 50) * 50
  return [Math.max(MIN_TRIP_FEE, r(e.fromThb * 0.75)), Math.max(MIN_TRIP_FEE + 100, r(e.fromThb * 1.4))]
}

/**
 * Alcoholic Beverage Control Act (No. 2) B.E. 2568 (in force 8 Nov 2025) & Tourism Business and Guide Act guardrails:
 * Rejects alcohol-promo keywords and unlicensed tour-guide claims in user-submitted listing titles or meeting places.
 */
export const BANNED_LISTING_WORDS_REGEX =
  /\b(beer|bar ?crawl|pub ?crawl|happy ?hour|free ?drinks?|shots?|cocktails?|wine ?bar|whisk(?:e)?y|vodka|tequila|soju|nightclub|clubbing|drunk|booze|private tour guide|official tour guide|licensed guide service)\b|เหล้า|เบียร์|ชนแก้ว|สายเมา|ทัวร์เถื่อน|บาร์โฮส/i

export function isAllowedListingText(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  return !BANNED_LISTING_WORDS_REGEX.test(t)
}

/**
 * Where you meet must be a public place or a licensed business — never a home, condo, hotel room, "my place", or alcohol bar crawl.
 * Returns false for private residences and alcohol-promo words (EN + TH); everything else is fine (staff review the rest).
 */
export function isPublicPlace(text: string): boolean {
  const t = text.trim()
  if (t.length < 3) return false
  if (BANNED_LISTING_WORDS_REGEX.test(t)) return false
  return !/\b(my (place|home|house|room|condo|apartment)|condo|hotel room|guest ?room|bedroom|private room|apartment \d|room \d+|your (hotel|room|place))\b|บ้านฉัน|บ้านผม|ที่บ้าน|ห้องพัก|ห้องนอน|คอนโด|ห้องส่วนตัว/i.test(t)
}

/**
 * FIX3 · Wei 3 / Marco — where THIS local does THIS experience. Her own licensed venue only when the experience needs
 * that kind of venue and it is one of hers (Mint's salon for hair & nails, Ken's gym for Muay Thai), else the
 * experience's meeting point in her city (Ploy's café hop is at the Ari cafés, never at her spa). Profile, booking
 * sheet and ticket all read this, so they always agree.
 */
export function venueFor(p: LocalProfile | undefined, e: Experience, city: City = p?.city ?? 'bangkok'): { en: string; th: string; own: boolean } {
  const own = Boolean(
    p && p.venueMode === 'hostsAt' && p.licensed && e.plusVenue === p.licensed && p.signature.some((s) => s.id === e.id),
  )
  if (own && p) return { en: p.placeEn, th: p.placeTh, own: true }
  const v = venueIn(e, p?.city ?? city)
  return { ...v, own: false }
}

/** The local's "from" price (cheapest signature experience). */
export function localFromThb(p: LocalProfile): number {
  return p.signature.reduce((m, s) => Math.min(m, s.fromThb), Number.POSITIVE_INFINITY) || 300
}

/** The local's price for an experience: their own signature price, else the catalogue price. */
export function localPriceFor(p: LocalProfile, experienceId: string): number {
  return p.signature.find((s) => s.id === experienceId)?.fromThb ?? getExperience(experienceId)?.fromThb ?? localFromThb(p)
}

/** Can this local host this experience (signature first, then by group)? Online experiences: any local. */
export function hostsExperience(p: LocalProfile, e: Experience): boolean {
  if (p.signature.some((s) => s.id === e.id)) return true
  // T3 · a two-way experience is hosted only by the people who listed it (no Thai photo-walk local on "English chat")
  if (e.twoWay) return false
  if (e.online) return true
  // FIX1 (F1 report: Bee, a rooftop-café local, won a Yaowarat food walk) — a local is offered for another experience
  // only inside a category they actually host something in (one of their own signature experiences is in that group)
  // and only in their city. `groups` alone (a wish list) is not enough.
  if (!e.city.includes(p.city) || !p.groups.includes(e.group)) return false
  return p.signature.some((s) => getExperience(s.id)?.group === e.group)
}

/** Profiles that host an experience in a city (signature hosts first, then best rated). */
export function localsFor(e: Experience, city: City, profiles: readonly LocalProfile[] = Object.values(LOCAL_PROFILES)): LocalProfile[] {
  return profiles
    .filter((p) => (p.city === city || e.online) && hostsExperience(p, e))
    .sort((a, b) => Number(b.signature.some((s) => s.id === e.id)) - Number(a.signature.some((s) => s.id === e.id)) || b.rating - a.rating)
}

// Pattaya locals (demo) — Pattaya & sea, temples, licensed spa
Object.assign(LOCAL_PROFILES, {
  'host-nok': {
    hostId: 'host-nok', name: 'Nok', city: 'pattaya', areaEn: 'Naklua', areaTh: 'นาเกลือ',
    venueMode: 'meetAt', placeEn: 'Lan Pho Naklua market', placeTh: 'ตลาดลานโพธิ์ นาเกลือ',
    signature: [
      sig('naklua-seafood-lunch', 900, 'Naklua seafood lunch', 'มื้อซีฟู้ดนาเกลือ', 'public market', 'ตลาดสาธารณะ'),
      sig('naklua-viewpoint-pier', 600, 'Viewpoint & fishing pier', 'จุดชมวิว & สะพานปลา', 'public viewpoint', 'จุดชมวิวสาธารณะ'),
      sig('sunset-viewpoint-snacks', 750, 'Pattaya bay sunset · Thai snacks', 'ชมพระอาทิตย์ตกอ่าวพัทยา · ขนมไทย', 'seafront café terrace', 'ระเบียงคาเฟ่ริมทะเล'),
    ],
    groups: ['eat', 'sea', 'evenings'], rating: 4.9, reviews: 33, done: 35, langs: ['Thai', 'English'], replyMin: 10,
    bioEn: 'Fishing-family kid from Naklua. I know which boat came in this morning.',
    bioTh: 'ลูกชาวประมงนาเกลือ รู้ว่าเรือลำไหนเข้าเช้านี้',
    quotes: [{ who: 'Sophie & Marc', from: 'France', exp: 'naklua-seafood-lunch', party: 'couple', text: 'Freshest prawns of our lives, at market prices.', stars: 5 }],
  },
  'host-ton': {
    hostId: 'host-ton', name: 'Ton', city: 'pattaya', areaEn: 'Naklua', areaTh: 'นาเกลือ',
    venueMode: 'meetAt', placeEn: 'Sanctuary of Truth entrance', placeTh: 'ทางเข้าปราสาทสัจธรรม',
    signature: [
      sig('sanctuary-big-buddha', 800, 'Sanctuary of Truth & Big Buddha', 'ปราสาทสัจธรรม & พระใหญ่', 'public temples', 'วัด & สถานที่สาธารณะ'),
      sig('floating-market', 1500, 'Floating market morning', 'เช้าตลาดน้ำ', 'public market', 'ตลาดสาธารณะ'),
    ],
    groups: ['culture', 'shopping', 'practical'], rating: 4.8, reviews: 27, done: 29, langs: ['Thai', 'English', '中文'], replyMin: 15,
    bioEn: 'History teacher on weekdays, temple nerd on weekends.',
    bioTh: 'ครูสอนประวัติศาสตร์ วันหยุดชอบพาเที่ยววัด',
    quotes: [{ who: 'Li Na', from: 'China', exp: 'sanctuary-big-buddha', party: 'family', text: 'Explained every carving to my parents in Mandarin. Felt like a private class.', stars: 5 }],
  },
  'host-ice': {
    hostId: 'host-ice', name: 'Ice', city: 'pattaya', areaEn: 'Jomtien', areaTh: 'จอมเทียน',
    venueMode: 'hostsAt', placeEn: 'Jomtien Thai Spa', placeTh: 'จอมเทียนไทยสปา', licensed: 'spa',
    signature: [
      sig('thai-massage-spa', 900, 'Thai massage at Jomtien Thai Spa', 'นวดไทยที่จอมเทียนไทยสปา', 'licensed spa', 'สปามีใบอนุญาต'),
      sig('shopping-buddy', 800, 'Pattaya shopping buddy', 'ช้อปพัทยากับโลคอล', 'malls & markets', 'ห้าง & ตลาด'),
    ],
    groups: ['wellness', 'shopping'], rating: 4.9, reviews: 41, done: 44, langs: ['Thai', 'English', 'Русский'], replyMin: 10,
    bioEn: 'I book the spa, translate with the therapist and wait in the lobby café.',
    bioTh: 'จองสปา แปลกับหมอนวด แล้วรอที่คาเฟ่ล็อบบี้',
    quotes: [{ who: 'Olga', from: 'Russia', exp: 'thai-massage-spa', party: 'solo', text: 'Clean licensed spa and a fair price. Very easy.', stars: 5 }],
  },
} satisfies Record<string, LocalProfile>)
