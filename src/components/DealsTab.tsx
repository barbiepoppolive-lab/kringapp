import { useMemo, useState } from 'react'
import { useLanguage } from '../i18n/LanguageContext'
import { useOptionalAuth } from '../context/AuthContext'
import { triggerHaptic } from '../lib/haptics'
import { playKring } from '../lib/sfx'
import { DEFAULT_PLATFORM_CONFIG } from '../lib/configDefaults'
import {
  KRING_DODO_CATALOG,
  KRING_DODO_TEST_CHECKOUT_URL,
  getDodoProductByThbTier,
} from '../lib/dodoCatalogConfig'

export type DealCityFilter = 'all' | 'bangkok' | 'pattaya'

export type DealCategoryFilter =
  | 'all'
  | 'cruises-yachts'
  | 'rooftops-beach'
  | 'muay-thai'
  | 'waterparks-cabaret'
  | 'onsen-spas'
  | 'food-daytrips'
  | 'transfers-clinics'

export interface TouristDealItem {
  id: string
  city: 'bangkok' | 'pattaya'
  category: Exclude<DealCategoryFilter, 'all'>
  title: string
  titleTh: string
  partnerName: string
  tatOrVenueBadge: string
  kringPriceBaht: number
  walkInPriceBaht: number
  hostBonusBaht: number
  serviceFeeBaht: 25
  emoji: string
  photo: string
  highlights: string[]
  slots: string[]
  seatsLeft: number
  voucherCodePrefix: string
  isRedditVerified?: boolean
  redditVettedBadge?: '🛡️ Community-Vetted · Zero Tout'
  antiScamShieldNote?: string
}

export const DEAL_CITY_PILLS: readonly { id: DealCityFilter; label: string; labelTh: string }[] = [
  { id: 'all', label: '🌴 All Thailand', labelTh: '🌴 ทั้งหมดในไทย' },
  { id: 'bangkok', label: '🏛️ Bangkok', labelTh: '🏛️ กรุงเทพฯ' },
  { id: 'pattaya', label: '🌊 Pattaya & Koh Larn', labelTh: '🌊 พัทยา & เกาะล้าน' },
] as const

export const DEAL_CATEGORY_PILLS: readonly {
  id: DealCategoryFilter
  label: string
  labelTh: string
}[] = [
  { id: 'all', label: '✨ All Deals', labelTh: '✨ ดีลทั้งหมด' },
  { id: 'cruises-yachts', label: '🚢 Cruises & Yachts', labelTh: '🚢 ล่องเรือ & ยอชต์' },
  { id: 'rooftops-beach', label: '🌇 Rooftops & Beach Clubs', labelTh: '🌇 รูฟท็อป & บีชคลับ' },
  { id: 'muay-thai', label: '🥊 Muay Thai VIP', labelTh: '🥊 มวยไทย VIP' },
  { id: 'waterparks-cabaret', label: '🎡 Water Parks & Cabaret', labelTh: '🎡 สวนน้ำ & โชว์' },
  { id: 'onsen-spas', label: '🧖‍♀️ Onsen & Spas', labelTh: '🧖‍♀️ ออนเซ็น & สปา' },
  { id: 'food-daytrips', label: '🍜 Food, Canal & Day Trips', labelTh: '🍜 อาหาร & วันเดย์ทริป' },
  { id: 'transfers-clinics', label: '🚐 Safe VIP Transfers', labelTh: '🚐 รถรับส่ง VIP ปลอดภัย' },
] as const

export const TOURIST_DEALS_CATALOG: readonly TouristDealItem[] = [
  // ==================== BANGKOK DEALS (10) ====================
  {
    id: 'bkk-chao-phraya-dinner-cruise',
    city: 'bangkok',
    category: 'cruises-yachts',
    title: 'Chao Phraya Luxury Dinner Cruise',
    titleTh: 'ล่องเรือดินเนอร์หรูแม่น้ำเจ้าพระยา',
    partnerName: 'Chao Phraya Princess / ICONSIAM Pier Desk',
    tatOrVenueBadge: 'Verified River Partner · ICONSIAM Pier 2',
    kringPriceBaht: 1400,
    walkInPriceBaht: 2000,
    hostBonusBaht: 126,
    serviceFeeBaht: 25,
    emoji: '🚢',
    photo: '/photos/experiences/sunset-wat-arun.jpg',
    highlights: ['2-hour international & seafood buffet', 'Upper-deck skyline table past Wat Arun', 'Live acoustic band & welcome drink'],
    slots: ['19:00', '19:30'],
    seatsLeft: 6,
    voucherCodePrefix: 'KRG-BKK-CRUISE',
  },
  {
    id: 'bkk-rajadamnern-muay-thai-vip',
    city: 'bangkok',
    category: 'muay-thai',
    title: 'Rajadamnern Muay Thai Ringside VIP',
    titleTh: 'มวยไทยราชดำเนิน ที่นั่งริงไซด์ VIP',
    partnerName: 'Rajadamnern Stadium Official Partner Desk',
    tatOrVenueBadge: 'Official Stadium Ticket · Ringside Tier',
    kringPriceBaht: 2500,
    walkInPriceBaht: 3000,
    hostBonusBaht: 188,
    serviceFeeBaht: 25,
    emoji: '🥊',
    photo: '/photos/experiences/muay-thai.jpg',
    highlights: ['Front-row ringside VIP seat', 'Fast-track stadium entry gate', 'Fighter photo op after main event'],
    slots: ['18:00', '19:00'],
    seatsLeft: 4,
    voucherCodePrefix: 'KRG-BKK-MUAY',
  },
  {
    id: 'bkk-wat-arun-riverside-sunset',
    city: 'bangkok',
    category: 'rooftops-beach',
    title: 'Wat Arun Riverside Sunset Set at Sala Rattanakosin / The Deck',
    titleTh: 'เซ็ตดินเนอร์ชมพระอาทิตย์ตกวิววัดอรุณ (ศาลารัตนโกสินทร์ / เดอะเด็ค)',
    partnerName: 'Sala Rattanakosin / The Deck Arun Residence',
    tatOrVenueBadge: 'Verified Meeting Point · Tha Tien Pier',
    kringPriceBaht: 1600,
    walkInPriceBaht: 1900,
    hostBonusBaht: 120,
    serviceFeeBaht: 25,
    emoji: '🌇',
    photo: '/photos/experiences/sunset-wat-arun.jpg',
    highlights: ['Reserved riverfront sunset table for 2', 'Thai sharing set + 2 signature mocktails/craft drinks', 'Direct golden-hour view of Wat Arun spire'],
    slots: ['17:00', '18:00'],
    seatsLeft: 5,
    voucherCodePrefix: 'KRG-BKK-ARUN',
  },
  {
    id: 'bkk-yunomori-onsen-spa-pass',
    city: 'bangkok',
    category: 'onsen-spas',
    title: 'Yunomori Onsen & Thai Spa Pass',
    titleTh: 'บัตรยูโนะโมริ ออนเซ็น แอนด์ สปา (สุขุมวิท 26 / สาทร)',
    partnerName: 'Yunomori Onsen & Spa Sukhumvit 26 / Sathorn',
    tatOrVenueBadge: 'Verified Wellness Partner · Public Onsen & Cafe',
    kringPriceBaht: 1500,
    walkInPriceBaht: 1850,
    hostBonusBaht: 113,
    serviceFeeBaht: 25,
    emoji: '🧖‍♀️',
    photo: '/photos/experiences/thai-spa.jpg',
    highlights: ['All-day mineral onsen bath access', '60-min traditional Thai or aroma massage', 'Yukata robe + garden cafe herbal tea'],
    slots: ['11:00', '14:00', '17:00'],
    seatsLeft: 7,
    voucherCodePrefix: 'KRG-BKK-ONSEN',
  },
  {
    id: 'bkk-michelin-tuktuk-canal-tour',
    city: 'bangkok',
    category: 'food-daytrips',
    title: 'Michelin Night Tuk-Tuk & Canal Tour with KIJSIRAVEJ / Co van Kessel',
    titleTh: 'ทัวร์ตุ๊กตุ๊กสตรีทฟู้ดมิชลิน & ล่องคลอง (KIJSIRAVEJ / Co van Kessel)',
    partnerName: 'KIJSIRAVEJ (TAT 14/03556) · Co van Kessel (TAT 11/10279)',
    tatOrVenueBadge: 'Licensed TAT Tour Partner · 14/03556 & 11/10279',
    kringPriceBaht: 1650,
    walkInPriceBaht: 1950,
    hostBonusBaht: 99,
    serviceFeeBaht: 25,
    emoji: '🛺',
    photo: '/photos/experiences/yaowarat-food.jpg',
    highlights: ['6 Michelin Bib Gourmand tasting stops in Old Town', 'Private electric MuvMi / Tuk-Tuk transfer', 'Flower Market & illuminated temple night walk'],
    slots: ['17:30', '18:30'],
    seatsLeft: 6,
    voucherCodePrefix: 'KRG-BKK-TUKTUK',
  },
  {
    id: 'bkk-silom-maliwan-cooking-class',
    city: 'bangkok',
    category: 'food-daytrips',
    title: 'Silom / Maliwan Thai Cooking Masterclass',
    titleTh: 'คลาสเรียนทำอาหารไทย สีลม / มลิวัลย์ (พร้อมเดินตลาดเช้า)',
    partnerName: 'Silom Thai Cooking School / Maliwan Culinary Studio',
    tatOrVenueBadge: 'Verified Culinary Partner · Silom & Saphan Kwai',
    kringPriceBaht: 1300,
    walkInPriceBaht: 1500,
    hostBonusBaht: 98,
    serviceFeeBaht: 25,
    emoji: '🍲',
    photo: '/photos/experiences/thai-cooking.jpg',
    highlights: ['Guided local fresh market basket tour', 'Cook 4 classic Thai dishes at your own wok station', 'Recipe booklet & digital certificate included'],
    slots: ['09:00', '13:30'],
    seatsLeft: 8,
    voucherCodePrefix: 'KRG-BKK-COOK',
  },
  {
    id: 'bkk-floating-market-maeklong-vip',
    city: 'bangkok',
    category: 'food-daytrips',
    title: 'Floating Market + Maeklong Train VIP Day Trip with Indochina Explorer / Pimdee',
    titleTh: 'วันเดย์ทริปตลาดน้ำดำเนินสะดวก + ตลาดร่มหุบ VIP (Indochina Explorer / Pimdee)',
    partnerName: 'Indochina Explorer / Pimdee Group (TAT 11/12394)',
    tatOrVenueBadge: 'Licensed TAT Tour Partner · 11/12394',
    kringPriceBaht: 1900,
    walkInPriceBaht: 2400,
    hostBonusBaht: 143,
    serviceFeeBaht: 25,
    emoji: '🛶',
    photo: '/photos/experiences/canal-longtail.jpg',
    highlights: ['Private electric paddle boat through Damnoen Saduak canals', 'Front-row viewing of Maeklong Railway folding-umbrella train', 'VIP air-conditioned commuter van + coconut ice cream set'],
    slots: ['07:30', '08:30'],
    seatsLeft: 5,
    voucherCodePrefix: 'KRG-BKK-MARKET',
  },
  {
    id: 'bkk-kbeauty-facial-laser-whitening',
    city: 'bangkok',
    category: 'transfers-clinics',
    title: 'K-Beauty Facial & Laser Whitening',
    titleTh: 'แพ็กเกจทรีตเมนต์หน้าใส K-Beauty & เลเซอร์ไวท์เทนนิ่ง (สยาม / ทองหล่อ)',
    partnerName: 'Siam / Thonglor Licensed Aesthetic Clinic via HDmall',
    tatOrVenueBadge: 'MoPH-Licensed Medical Clinic · Siam & Thonglor',
    kringPriceBaht: 2800,
    walkInPriceBaht: 3900,
    hostBonusBaht: 210,
    serviceFeeBaht: 25,
    emoji: '✨',
    photo: '/photos/experiences/thai-spa.jpg',
    highlights: ['Doctor consultation + skin analysis', 'Aqua Peel + Pico Brightening / LED glow session', 'Zero-downtime tourist recovery kit'],
    slots: ['12:00', '15:00', '17:30'],
    seatsLeft: 4,
    voucherCodePrefix: 'KRG-BKK-KBEAUTY',
  },
  {
    id: 'bkk-bespoke-custom-suit-dress',
    city: 'bangkok',
    category: 'transfers-clinics',
    title: 'Bespoke Custom Suit / Dress Package at Jesse & Sons / Rajawongse',
    titleTh: 'แพ็กเกจตัดสูท / ชุดราตรีสั่งตัดวัดตัว (Jesse & Sons / ราชวงศ์)',
    partnerName: 'Jesse & Sons / Rajawongse Clothier Sukhumvit',
    tatOrVenueBadge: 'Heritage Bespoke Tailor · 24h Express Fitting',
    kringPriceBaht: 4500,
    walkInPriceBaht: 6500,
    hostBonusBaht: 360,
    serviceFeeBaht: 25,
    emoji: '🤵',
    photo: '/photos/experiences/chatuchak-vintage.jpg',
    highlights: ['Italian wool-blend 2-piece suit or custom silk dress', '1-on-1 master measurement + 1 tailored shirt included', 'Hotel delivery across Bangkok within 48 hours'],
    slots: ['11:00', '14:30', '17:00'],
    seatsLeft: 5,
    voucherCodePrefix: 'KRG-BKK-BESPOKE',
  },
  {
    id: 'bkk-suvarnabhumi-fasttrack-nams-lady-driver',
    city: 'bangkok',
    category: 'transfers-clinics',
    title: "Suvarnabhumi BKK Fast-Track + Nam's Lady Driver",
    titleTh: "ฟาสต์แทร็กสนามบินสุวรรณภูมิ + รถรับส่งคนขับผู้หญิง Nam's Lady Driver",
    partnerName: "Nam's Taxi Fleet (Verified Female Drivers) & BKK VIP Concierge",
    tatOrVenueBadge: 'Verified Safe Arrival · Gate 3 Public Meet',
    kringPriceBaht: 1800,
    walkInPriceBaht: 2200,
    hostBonusBaht: 108,
    serviceFeeBaht: 25,
    emoji: '🚐',
    photo: '/photos/experiences/practical-bangkok.jpg',
    highlights: ['Priority Immigration Fast-Track lane at Suvarnabhumi (BKK)', "Private sedan/SUV driven by a verified female driver from Nam's Fleet", 'All expressway tolls + flight delay tracking included'],
    slots: ['09:00', '14:00', '20:00'],
    seatsLeft: 6,
    voucherCodePrefix: 'KRG-BKK-FASTTRACK',
  },

  // ==================== PATTAYA & KOH LARN DEALS (10) ====================
  {
    id: 'pty-koh-larn-luxury-catamaran',
    city: 'pattaya',
    category: 'cruises-yachts',
    title: 'Koh Larn (Coral Island) Luxury Catamaran + Parasailing & Sea-Walker',
    titleTh: 'ล่องเรือคาตามารันหรูเกาะล้าน + พาราเซลลิ่ง & ซีวอล์คเกอร์',
    partnerName: 'Bali Hai Pier Licensed Marine Operator',
    tatOrVenueBadge: 'Licensed Marine Tour · Life Jacket & Insurance Included',
    kringPriceBaht: 1800,
    walkInPriceBaht: 2500,
    hostBonusBaht: 135,
    serviceFeeBaht: 25,
    emoji: '⛵',
    photo: '/photos/experiences/koh-larn-beach.jpg',
    highlights: ['Full-day luxury catamaran cruise from Bali Hai Pier', 'Parasailing + undersea Sea-Walker helmet reef walk', 'Thai seafood lunch on Tawaen Beach + drone photos'],
    slots: ['08:30', '09:30'],
    seatsLeft: 7,
    voucherCodePrefix: 'KRG-PTY-CATAMARAN',
  },
  {
    id: 'pty-sky-gallery-3mermaids-sunset',
    city: 'pattaya',
    category: 'rooftops-beach',
    title: 'The Sky Gallery & 3 Mermaids Pratumnak Cliffside Sunset Set',
    titleTh: 'เซ็ตดินเนอร์ริมผาชมพระอาทิตย์ตก เดอะสกายแกลเลอรี & 3 Mermaids เขาพระตำหนัก',
    partnerName: 'The Sky Gallery / 3 Mermaids Pratumnak Hill',
    tatOrVenueBadge: 'Verified Cliffside Venue · Pratumnak Soi 4',
    kringPriceBaht: 1500,
    walkInPriceBaht: 1900,
    hostBonusBaht: 113,
    serviceFeeBaht: 25,
    emoji: '🌅',
    photo: '/photos/experiences/koh-larn-beach.jpg',
    highlights: ['Reserved cliffside bird-nest / sea-view table for 2', 'Seafood platter + 2 tropical sunset mocktails/cocktails', 'Panoramic view over Koh Larn & Pattaya Bay'],
    slots: ['16:30', '17:30'],
    seatsLeft: 5,
    voucherCodePrefix: 'KRG-PTY-SKYGALLERY',
  },
  {
    id: 'pty-aquaverse-ramayana-waterpark-vip',
    city: 'pattaya',
    category: 'waterparks-cabaret',
    title: 'Columbia Pictures Aquaverse / Ramayana Water Park All-Day VIP',
    titleTh: 'บัตร VIP สวนน้ำโคลัมเบีย พิคเจอร์ส อควาเวิร์ส / รามายณะ เต็มวัน',
    partnerName: 'Columbia Pictures Aquaverse / Ramayana Official Desk',
    tatOrVenueBadge: 'Official Theme Park Pass · Na Jomtien',
    kringPriceBaht: 1350,
    walkInPriceBaht: 1890,
    hostBonusBaht: 101,
    serviceFeeBaht: 25,
    emoji: '🎢',
    photo: '/photos/experiences/koh-larn-beach.jpg',
    highlights: ['All-day unlimited water coaster & wave pool access', 'Private locker + towel + ฿200 food wrist-credit', 'Round-trip shared shuttle from Central Pattaya'],
    slots: ['10:00', '11:00'],
    seatsLeft: 9,
    voucherCodePrefix: 'KRG-PTY-AQUAVERSE',
  },
  {
    id: 'pty-sanctuary-of-truth-tiffanys-vip',
    city: 'pattaya',
    category: 'waterparks-cabaret',
    title: "Sanctuary of Truth + Tiffany's / Alcazar VIP Cabaret Seat",
    titleTh: "ปราสาทสัจธรรม + ที่นั่ง VIP โชว์ทิฟฟานี่ / อัลคาซ่าร์ พัทยา",
    partnerName: "Sanctuary of Truth & Tiffany's Show Pattaya Official Desk",
    tatOrVenueBadge: 'Cultural & Theatre Dual Pass · North Pattaya',
    kringPriceBaht: 1600,
    walkInPriceBaht: 2200,
    hostBonusBaht: 144,
    serviceFeeBaht: 25,
    emoji: '🎭',
    photo: '/photos/experiences/talat-noi-oldtown.jpg',
    highlights: ['Guided entry to the all-teakwood Sanctuary of Truth museum', "VIP Mezzanine/Gold seat at Tiffany's or Alcazar evening show", 'Welcome soft drink + stage photo voucher'],
    slots: ['15:00', '18:00', '19:30'],
    seatsLeft: 6,
    voucherCodePrefix: 'KRG-PTY-SANCTUARY',
  },
  {
    id: 'pty-max-muay-thai-fairtex-session',
    city: 'pattaya',
    category: 'muay-thai',
    title: 'Max Muay Thai Pattaya Ringside VIP + Fairtex 1-on-1 Session',
    titleTh: 'แม็กซ์มวยไทยพัทยา ริงไซด์ VIP + เรียนมวยตัวต่อตัวที่แฟร์เท็กซ์',
    partnerName: 'Max Muay Thai Stadium & Fairtex Training Center North Pattaya',
    tatOrVenueBadge: 'Verified Pro Stadium & Gym Partner',
    kringPriceBaht: 1900,
    walkInPriceBaht: 2500,
    hostBonusBaht: 143,
    serviceFeeBaht: 25,
    emoji: '🥊',
    photo: '/photos/experiences/muay-thai.jpg',
    highlights: ['60-min private pad-work session with a retired Lumpinee champion at Fairtex', 'Hand wraps + gym towel & electrolyte drink included', 'Evening VIP Ringside ticket at Max Muay Thai Stadium'],
    slots: ['15:00', '19:00'],
    seatsLeft: 4,
    voucherCodePrefix: 'KRG-PTY-MAXMUAY',
  },
  {
    id: 'pty-cave-tutu-beach-club-daybed',
    city: 'pattaya',
    category: 'rooftops-beach',
    title: 'Cave Beach Club / Tutu Beach Daybed & Drinks Set',
    titleTh: 'เซ็ตเดย์เบดและเครื่องดื่ม Cave Beach Club / Tutu Beach นาจอมเทียน',
    partnerName: 'Cave Beach Club / Tutu Beach Na Jomtien',
    tatOrVenueBadge: 'Verified Beachfront Cafe · Na Jomtien Soi 10',
    kringPriceBaht: 1400,
    walkInPriceBaht: 1800,
    hostBonusBaht: 105,
    serviceFeeBaht: 25,
    emoji: '🏖️',
    photo: '/photos/experiences/koh-larn-beach.jpg',
    highlights: ['Reserved beachfront beanbag / daybed zone for 2', '฿1,400 full food & drink table credit + priority seating', 'Golden-hour beach photo spots'],
    slots: ['15:30', '17:00'],
    seatsLeft: 6,
    voucherCodePrefix: 'KRG-PTY-CAVEBEACH',
  },
  {
    id: 'pty-easykart-bali-hai-bungy-pass',
    city: 'pattaya',
    category: 'waterparks-cabaret',
    title: 'EasyKart Bali Hai Pier + Tarzan Bungy Thrill Pass',
    titleTh: 'บัตรขับโกคาร์ท EasyKart แหลมบาลีฮาย + บันจี้จัมพ์พัทยา',
    partnerName: 'EasyKart Pattaya Bali Hai & Pattaya Bungy Jump',
    tatOrVenueBadge: 'Verified Adventure Partner · Safety Gear & Insurance',
    kringPriceBaht: 1650,
    walkInPriceBaht: 2100,
    hostBonusBaht: 124,
    serviceFeeBaht: 25,
    emoji: '🏎️',
    photo: '/photos/experiences/practical-bangkok.jpg',
    highlights: ['2 high-speed racing heats on the floodlit Bali Hai track', 'Printed lap-time telemetry sheet + helmet camera clip', 'Combo access to Tarzan Extreme / Bungy viewing deck'],
    slots: ['14:00', '18:00', '20:30'],
    seatsLeft: 8,
    voucherCodePrefix: 'KRG-PTY-EASYKART',
  },
  {
    id: 'pty-yunomori-onsen-oasis-spa',
    city: 'pattaya',
    category: 'onsen-spas',
    title: 'Yunomori Onsen & Oasis Spa Pattaya Package',
    titleTh: 'แพ็กเกจยูโนะโมริ ออนเซ็น แอนด์ โอเอซิส สปา พัทยา (เทพประสิทธิ์)',
    partnerName: 'Yunomori Onsen Thepprasit / Oasis Spa Jomtien',
    tatOrVenueBadge: 'Verified Luxury Spa Partner · Public Onsen',
    kringPriceBaht: 1500,
    walkInPriceBaht: 1900,
    hostBonusBaht: 113,
    serviceFeeBaht: 25,
    emoji: '🌿',
    photo: '/photos/experiences/thai-spa.jpg',
    highlights: ['Full access to 7 Japanese mineral onsen pools & steam rooms', '60-min signature aroma or herbal compress massage', 'Free shuttle drop-off to Jomtien / Central Pattaya'],
    slots: ['11:30', '15:00', '18:00'],
    seatsLeft: 5,
    voucherCodePrefix: 'KRG-PTY-ONSEN',
  },
  {
    id: 'pty-ocean-marina-sunset-yacht',
    city: 'pattaya',
    category: 'cruises-yachts',
    title: 'Ocean Marina Private Sunset Yacht Join-In Cruise (Pattaya Bay)',
    titleTh: 'ล่องเรือยอชต์ชมพระอาทิตย์ตก โอเชี่ยน มารีน่า ยอชต์คลับ พัทยา',
    partnerName: 'Ocean Marina Yacht Club Licensed Charter',
    tatOrVenueBadge: 'Licensed Marina Operator · Na Jomtien',
    kringPriceBaht: 2900,
    walkInPriceBaht: 3800,
    hostBonusBaht: 218,
    serviceFeeBaht: 25,
    emoji: '🛥️',
    photo: '/photos/experiences/koh-larn-beach.jpg',
    highlights: ['4-hour luxury yacht cruise from Ocean Marina to Monkey Island', 'Paddleboards, crystal-kayak & snorkeling gear included', 'Sunset BBQ skewers & tropical fruit platter on deck'],
    slots: ['14:30'],
    seatsLeft: 4,
    voucherCodePrefix: 'KRG-PTY-YACHT',
  },
  {
    id: 'pty-nong-nooch-floating-market-pass',
    city: 'pattaya',
    category: 'food-daytrips',
    title: 'Nong Nooch Tropical Garden VIP + Pattaya Floating Market Pass',
    titleTh: 'บัตร VIP สวนนงนุชพัทยา + ตลาดน้ำ 4 ภาค (พร้อมรถชมวิว)',
    partnerName: 'Nong Nooch Botanical Garden & 4-Regions Floating Market',
    tatOrVenueBadge: 'Verified Cultural Attraction · Sukhumvit KM 163',
    kringPriceBaht: 1200,
    walkInPriceBaht: 1600,
    hostBonusBaht: 90,
    serviceFeeBaht: 25,
    emoji: '🌺',
    photo: '/photos/experiences/canal-longtail.jpg',
    highlights: ['Sightseeing skywalk + open-air tram through Dinosaur Valley', 'Thai cultural show + botanical garden admission', 'Amphibious boat ride at Pattaya 4-Regions Floating Market'],
    slots: ['09:30', '13:30'],
    seatsLeft: 10,
    voucherCodePrefix: 'KRG-PTY-NONGNOOCH',
  },

  // ==================== 8 REDDIT-SWORN ZERO-SCAM LOCAL GEMS (`isRedditVerified: true`) ====================
  {
    id: 'bkk-nams-lady-drivers-pattaya-transfer',
    city: 'bangkok',
    category: 'transfers-clinics',
    title: "Nam's Taxis With Lady Drivers (BKK Airport / Pattaya Safe Female Transfer)",
    titleTh: "รถรับส่งคนขับผู้หญิง Nam's Lady Drivers (สนามบินสุวรรณภูมิ ⇄ กรุงเทพฯ / พัทยา)",
    partnerName: "Nam's Taxis With Lady Drivers (r/ThailandTourism #1 Vetted Fleet)",
    tatOrVenueBadge: '🛡️ Community-Vetted · Zero Tout',
    kringPriceBaht: 1200,
    walkInPriceBaht: 1500,
    hostBonusBaht: 90,
    serviceFeeBaht: 25,
    emoji: '🌸',
    photo: '/photos/experiences/practical-bangkok.jpg',
    highlights: [
      'Polite verified female drivers praised across r/ThailandTourism & r/solotravel',
      'All highway tolls + fuel locked upfront — zero meter games',
      'Door-to-door BKK Airport, Bangkok hotel, or Pattaya transfer',
    ],
    slots: ['08:00', '12:00', '16:00', '20:00'],
    seatsLeft: 5,
    voucherCodePrefix: 'KRG-GEM-NAMSLADY',
    isRedditVerified: true,
    redditVettedBadge: '🛡️ Community-Vetted · Zero Tout',
    antiScamShieldNote: 'Protects solo women & couples against airport curb touts and highway toll padding.',
  },
  {
    id: 'pty-flintstones-private-taxi-transfer',
    city: 'pattaya',
    category: 'transfers-clinics',
    title: 'Flintstones Private Taxi (BKK Airport <-> Pattaya Hotel Door-to-Door)',
    titleTh: 'รถรับส่งส่วนตัว Flintstones Taxi (สนามบินสุวรรณภูมิ ⇄ โรงแรมพัทยา ถึงหน้าล็อบบี้)',
    partnerName: 'Flintstones Taxi Service Pattaya (r/Pattaya Gold-Standard Fleet)',
    tatOrVenueBadge: '🛡️ Community-Vetted · Zero Tout',
    kringPriceBaht: 1200,
    walkInPriceBaht: 1500,
    hostBonusBaht: 90,
    serviceFeeBaht: 25,
    emoji: '🚕',
    photo: '/photos/experiences/practical-bangkok.jpg',
    highlights: [
      'All-in Motorway Route 7 private car with English/German-speaking dispatch',
      'Zero Bali Hai / hotel counter charter markups',
      'Free flight-delay waiting & bottled water onboard',
    ],
    slots: ['09:00', '13:00', '17:00', '21:00'],
    seatsLeft: 6,
    voucherCodePrefix: 'KRG-GEM-FLINTSTONES',
    isRedditVerified: true,
    redditVettedBadge: '🛡️ Community-Vetted · Zero Tout',
    antiScamShieldNote: 'Replaces ฿2,000 hotel lobby taxi counters and Bali Hai charter traps.',
  },
  {
    id: 'bkk-hidden-bangkok-longtail-canal-tour',
    city: 'bangkok',
    category: 'cruises-yachts',
    title: 'Hidden Bangkok Longtail Canal & Big Buddha Khlong Tour (Zero Pier Tout)',
    titleTh: 'ล่องเรือหางยาวคลองฝั่งธนฯ & พระใหญ่วัดปากน้ำ (Hidden Bangkok · ไร้มาเฟียท่าเรือ)',
    partnerName: 'Hidden Bangkok Boat Tours (Thonburi Khlong Specialist)',
    tatOrVenueBadge: '🛡️ Community-Vetted · Zero Tout',
    kringPriceBaht: 1350,
    walkInPriceBaht: 1600,
    hostBonusBaht: 101,
    serviceFeeBaht: 25,
    emoji: '🚤',
    photo: '/photos/experiences/canal-longtail.jpg',
    highlights: [
      'Cushioned longtail boat through quiet Thonburi canals & Wat Paknam Big Buddha',
      'Bypasses Sathorn/Tha Chang ฿3,500 walk-up pier mafia desks completely',
      'Zero souvenir stall kickback stops — cold drinks & local snacks included',
    ],
    slots: ['09:30', '13:30', '16:00'],
    seatsLeft: 6,
    voucherCodePrefix: 'KRG-GEM-HIDDENBKK',
    isRedditVerified: true,
    redditVettedBadge: '🛡️ Community-Vetted · Zero Tout',
    antiScamShieldNote: 'Antidote to the ฿3,500–฿4,500 Sathorn & Damnoen Saduak pier mafia boat rip-off.',
  },
  {
    id: 'bkk-tailor-on-ten-sukhumvit-soi8',
    city: 'bangkok',
    category: 'transfers-clinics',
    title: 'Tailor On Ten Sukhumvit Soi 8 (Bespoke Linen/Cotton Shirt + Suit Credit Voucher — Zero Street Tout)',
    titleTh: 'Tailor On Ten สุขุมวิท ซอย 8 (เชิ้ตลินิน/คอตตอนสั่งตัด + เครดิตตัดสูท · ไร้นายหน้าตุ๊กตุ๊ก)',
    partnerName: 'Tailor On Ten Sukhumvit Soi 8 Villa Showroom',
    tatOrVenueBadge: '🛡️ Community-Vetted · Zero Tout',
    kringPriceBaht: 3200,
    walkInPriceBaht: 3800,
    hostBonusBaht: 240,
    serviceFeeBaht: 25,
    emoji: '👔',
    photo: '/photos/experiences/chatuchak-vintage.jpg',
    highlights: [
      'Western-managed bespoke villa in Sukhumvit Soi 8 with zero street touts',
      'Authentic Italian & Egyptian cotton mills with transparent published pricing',
      'Includes 1 bespoke fitted shirt + ฿1,500 credit toward a full canvas suit',
    ],
    slots: ['11:00', '14:00', '16:30'],
    seatsLeft: 4,
    voucherCodePrefix: 'KRG-GEM-TAILOR10',
    isRedditVerified: true,
    redditVettedBadge: '🛡️ Community-Vetted · Zero Tout',
    antiScamShieldNote: '#1 r/Bangkok antidote to the "Grand Palace is closed" tuk-tuk polyester suit trap.',
  },
  {
    id: 'bkk-perception-blind-massage-sathorn',
    city: 'bangkok',
    category: 'onsen-spas',
    title: 'Perception Blind Massage Sathorn/Silom (90-Min Signature Blind Therapist Recovery)',
    titleTh: 'Perception Blind Massage สาทร ซอย 8 (นวดผ่อนคลาย 90 นาที โดยหมอนวดผู้พิการทางสายตามืออาชีพ)',
    partnerName: 'Perception Blind Massage Sathorn Soi 8 (Social Enterprise)',
    tatOrVenueBadge: '🛡️ Community-Vetted · Zero Tout',
    kringPriceBaht: 950,
    walkInPriceBaht: 1150,
    hostBonusBaht: 72,
    serviceFeeBaht: 25,
    emoji: '🙌',
    photo: '/photos/experiences/thai-spa.jpg',
    highlights: [
      '90-min deep-tissue or traditional Thai recovery by visually impaired master therapists',
      'Boutique architectural sanctuary near BTS Chong Nonsi',
      'Ethical social-impact wellness with zero street-shop upselling',
    ],
    slots: ['11:00', '14:00', '17:00', '19:30'],
    seatsLeft: 5,
    voucherCodePrefix: 'KRG-GEM-PERCEPTION',
    isRedditVerified: true,
    redditVettedBadge: '🛡️ Community-Vetted · Zero Tout',
    antiScamShieldNote: 'Fully legitimate ethical boutique spa — zero sketchy street-tout massage traps.',
  },
  {
    id: 'pty-real-divers-padi-5star-coral-dive',
    city: 'pattaya',
    category: 'cruises-yachts',
    title: 'Real Divers Pattaya (PADI 5-Star 2-Tank Koh Larn & Samae San Coral Dive)',
    titleTh: 'Real Divers พัทยา (ดำน้ำลึก/ตื้น 2 ไดฟ์ เกาะล้าน & แสมสาร มาตรฐาน PADI 5 ดาว)',
    partnerName: 'Real Divers Pattaya (PADI 5-Star IDC Center Jomtien)',
    tatOrVenueBadge: '🛡️ Community-Vetted · Zero Tout',
    kringPriceBaht: 3600,
    walkInPriceBaht: 4200,
    hostBonusBaht: 270,
    serviceFeeBaht: 25,
    emoji: '🤿',
    photo: '/photos/experiences/koh-larn-beach.jpg',
    highlights: [
      '2-tank Coral Island / Samae San boat trip with British & Thai PADI 5-Star instructors',
      'Full scuba/snorkel gear + hot boat lunch + hotel pickup included',
      'Zero beach-chair jet-ski touts or overcrowded cattle barges',
    ],
    slots: ['08:00'],
    seatsLeft: 4,
    voucherCodePrefix: 'KRG-GEM-REALDIVERS',
    isRedditVerified: true,
    redditVettedBadge: '🛡️ Community-Vetted · Zero Tout',
    antiScamShieldNote: 'Bypasses Pattaya Beach jet-ski hull-scratch extortion & 60-second pontoon traps.',
  },
  {
    id: 'pty-thai-sky-adventures-tandem-skydive',
    city: 'pattaya',
    category: 'waterparks-cabaret',
    title: 'Thai Sky Adventures Pattaya (13,000ft Tandem Skydive + Hotel Transfer)',
    titleTh: 'Thai Sky Adventures พัทยา (กระโดดร่มแทนเดม 13,000 ฟุต วิวมหาสมุทร + รถรับส่งโรงแรม)',
    partnerName: 'Thai Sky Adventures Pattaya (USPA-Certified Dropzone)',
    tatOrVenueBadge: '🛡️ Community-Vetted · Zero Tout',
    kringPriceBaht: 9900,
    walkInPriceBaht: 11300,
    hostBonusBaht: 745,
    serviceFeeBaht: 25,
    emoji: '🪂',
    photo: '/photos/experiences/koh-larn-beach.jpg',
    highlights: [
      'Full-altitude 13,000ft tandem skydive over Pattaya Bay & Gulf of Thailand',
      'USPA-certified tandem master + full insurance & certificate',
      'Complimentary round-trip Pattaya hotel pickup & drop-off',
    ],
    slots: ['08:00', '11:00'],
    seatsLeft: 3,
    voucherCodePrefix: 'KRG-GEM-THAISKY',
    isRedditVerified: true,
    redditVettedBadge: '🛡️ Community-Vetted · Zero Tout',
    antiScamShieldNote: 'Official USPA dropzone rate — saves ฿1,400 vs tour-desk markups.',
  },
  {
    id: 'bkk-sense-of-thai-wat-arun-costume',
    city: 'bangkok',
    category: 'food-daytrips',
    title: 'Sense Of Thai Tha Maharaj (Wat Arun Traditional ThaiChakkri Costume Rental)',
    titleTh: 'Sense Of Thai ท่ามหาราช (เช่าชุดไทยจักรีพรีเมียมถ่ายรูปวัดอรุณ · ราคาเดียวไม่มีบวกเพิ่ม)',
    partnerName: 'Sense Of Thai Boutique Studio (Tha Maharaj Pier)',
    tatOrVenueBadge: '🛡️ Community-Vetted · Zero Tout',
    kringPriceBaht: 650,
    walkInPriceBaht: 800,
    hostBonusBaht: 50,
    serviceFeeBaht: 25,
    emoji: '👘',
    photo: '/photos/experiences/sunset-wat-arun.jpg',
    highlights: [
      'Full-day premium silk Thai Chakkri costume + traditional jewelry & umbrella',
      'Air-conditioned Tha Maharaj fitting studio (zero sweaty pier-alley touts)',
      '1-minute ferry hop straight to Wat Arun golden prang',
    ],
    slots: ['09:30', '13:00', '15:30'],
    seatsLeft: 8,
    voucherCodePrefix: 'KRG-GEM-SENSETHAI',
    isRedditVerified: true,
    redditVettedBadge: '🛡️ Community-Vetted · Zero Tout',
    antiScamShieldNote: 'Transparent studio pricing — zero hidden hair/accessory/bag storage upcharges.',
  },
] as const

export const KRING_CURATED_DEALS = TOURIST_DEALS_CATALOG

export interface ScamShieldCardItem {
  id: string
  cityScope: 'all' | 'bangkok' | 'pattaya'
  cityBadge: string
  title: string
  titleTh: string
  streetTrapSummary: string
  kringCounterRule: string
  linkedDealId: string
}

export const THAILAND_SCAM_SHIELD_CARDS: readonly ScamShieldCardItem[] = [
  {
    id: 'scam-bkk-grand-palace-suit',
    cityScope: 'bangkok',
    cityBadge: '🏛️ Bangkok',
    title: 'Grand Palace "Closed Today" Tuk-Tuk Suit Trap',
    titleTh: 'กลลวงตุ๊กตุ๊กหน้าวัดพระแก้ว "วันนี้วัดปิด" พาแวะร้านตัดสูทโพลีเอสเตอร์',
    streetTrapSummary:
      'Sidewalk touts in lanyards claim the Grand Palace is closed for a royal ceremony and flag down a ฿20 Tuk-Tuk that detours into high-pressure ฿18,000 polyester suit & gem shops.',
    kringCounterRule:
      'Countered by Kring Verified Hosts & Tailor On Ten / Jesse & Sons (zero street touts, ≤100m Sanam Chai MRT public bump).',
    linkedDealId: 'bkk-tailor-on-ten-sukhumvit-soi8',
  },
  {
    id: 'scam-bkk-sathorn-pier-longtail',
    cityScope: 'bangkok',
    cityBadge: '🏛️ Bangkok',
    title: 'Sathorn Pier ฿3,500 Longtail Mafia vs ฿16 Orange-Flag Boat',
    titleTh: 'ท่าเรือสาทร เรือหางยาวเหมา ฿3,500 เทียบกับเรือด่วนธงส้ม ฿16',
    streetTrapSummary:
      'Private pier desks at Saphan Taksin & Damnoen Saduak quote ฿3,500–฿4,500 per boat or herd tourists into ฿150 Blue-Flag queues while hiding the ฿16 local Orange-Flag boat.',
    kringCounterRule:
      'Countered by Hidden Bangkok Boat Tours (locked ฿1,350 Thonburi khlong longtail) & local hosts who walk you straight to the ฿16 Orange-Flag pier.',
    linkedDealId: 'bkk-hidden-bangkok-longtail-canal-tour',
  },
  {
    id: 'scam-all-thai-atm-dcc-trap',
    cityScope: 'all',
    cityBadge: '🌴 All Thailand',
    title: 'Thai ATM ฿220 Fee + 7-Point DCC Conversion Trap',
    titleTh: 'ค่ากดตู้ ATM ไทย ฿220 + กับดักเรตแปลงสกุลเงิน DCC หน้าตู้',
    streetTrapSummary:
      'Foreign card withdrawals at Thai ATMs charge ฿220–฿250 plus a deceptive "Accept Conversion" screen that adds a 7-point DCC markup (losing ~฿950 per withdrawal).',
    kringCounterRule:
      'Countered by Kring 1-Tap 🇮🇳 UPI · 💬 WeChat/Alipay+ · 🇷🇺 TrueMoney · 💳 Card (+฿25 flat fee). Always press "Continue WITHOUT Conversion" at ATMs.',
    linkedDealId: 'bkk-chao-phraya-dinner-cruise',
  },
  {
    id: 'scam-pty-jetski-hull-scratch',
    cityScope: 'pattaya',
    cityBadge: '🌊 Pattaya',
    title: 'Pattaya & Koh Larn Beach Jet-Ski Hull-Scratch Extortion',
    titleTh: 'กลลวงเจ็ทสกีชายหาดพัทยา/เกาะล้าน เรียกค่าปรับรอยขีดข่วนใต้ท้องเรือ',
    streetTrapSummary:
      'Uninsured beach-chair touts rent jet-skis for ฿1,000, then point to old painted-over hull scratches underneath and demand ฿20,000–฿45,000 for fiberglass repair.',
    kringCounterRule:
      'Countered by Real Divers PADI 5-Star & Ocean Marina Catamarans (vetted insured marine operators, zero beach-chair touts, zero passport holds).',
    linkedDealId: 'pty-real-divers-padi-5star-coral-dive',
  },
  {
    id: 'scam-pty-bali-hai-baht-bus',
    cityScope: 'pattaya',
    cityBadge: '🌊 Pattaya',
    title: 'Bali Hai Pier Baht-Bus "How much?" ฿300 Charter Trap',
    titleTh: 'รถสองแถวพัทยา ห้ามถาม "เท่าไหร่?" (กลลวงเหมาคัน ฿300)',
    streetTrapSummary:
      'Asking a Pattaya songthaew (Baht Bus) driver "How much?" automatically converts the shared ฿10 bus into a ฿300–฿500 private charter.',
    kringCounterRule:
      'Rule: Never ask "How much?" — hop in the back, press buzzer, pay ฿10 coin (or book Flintstones Door-to-Door for ฿1,200).',
    linkedDealId: 'pty-flintstones-private-taxi-transfer',
  },
  {
    id: 'scam-all-solo-female-late-night',
    cityScope: 'all',
    cityBadge: '🌴 All Thailand',
    title: 'Solo Female Late-Night Taxi & Unvetted Bar Anxiety',
    titleTh: 'ความปลอดภัยสำหรับผู้หญิงเดินทางคนเดียว & รถรับส่งคนขับผู้หญิงล้วน',
    streetTrapSummary:
      'Solo women face meter-refusing late-night cabs, aggressive street touts, and anxiety when exploring night markets or rooftops alone.',
    kringCounterRule:
      "Countered by 🌸 Women hosts for women travellers + Nam's Lady Drivers + ≤100m Public GPS Bump.",
    linkedDealId: 'bkk-nams-lady-drivers-pattaya-transfer',
  },
] as const

export interface DealsTabProps {
  /** Force initial viewer mode ('tourist' | 'host'); defaults to session role or interactive switch */
  initialViewerMode?: 'tourist' | 'host'
  /** Optional callback when a Host attaches a deal to her Hangout */
  onAttachDealToHangout?: (deal: TouristDealItem) => void
  /** Optional callback when a Tourist completes 1-Tap Pay and flips open the Gold-Foil QR Voucher */
  onIssueGoldVoucher?: (deal: TouristDealItem, voucherCode: string) => void
}

export default function DealsTab({
  initialViewerMode,
  onAttachDealToHangout,
  onIssueGoldVoucher,
}: DealsTabProps) {
  const { language } = useLanguage()
  const auth = useOptionalAuth()
  const th = language === 'th'

  const [cityFilter, setCityFilter] = useState<DealCityFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<DealCategoryFilter>('all')
  const [zeroScamOnly, setZeroScamOnly] = useState<boolean>(false)
  const [scamShieldOpen, setScamShieldOpen] = useState<boolean>(false)
  const [viewerMode, setViewerMode] = useState<'tourist' | 'host'>(
    initialViewerMode ?? (auth?.session?.role === 'host' ? 'host' : 'tourist')
  )
  const [attachedDealIds, setAttachedDealIds] = useState<string[]>([])
  const [selectedDeal, setSelectedDeal] = useState<TouristDealItem | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string>('')
  const [guestCount, setGuestCount] = useState<number>(2)
  const [soloUnlockChoice, setSoloUnlockChoice] = useState<'SINGLE_49_THB' | 'PASS_7D_199_THB'>('SINGLE_49_THB')
  const isThaiLocalUser = th || Boolean((auth?.session as { phone?: string } | null)?.phone?.startsWith('+66'))
  const [issuedVoucher, setIssuedVoucher] = useState<{
    deal: TouristDealItem
    code: string
    slot: string
    guests: number
  } | null>(null)

  const filteredDeals = useMemo(() => {
    return TOURIST_DEALS_CATALOG.filter((deal) => {
      if (cityFilter !== 'all' && deal.city !== cityFilter) return false
      if (categoryFilter !== 'all' && deal.category !== categoryFilter) return false
      if (zeroScamOnly && !deal.isRedditVerified) return false
      return true
    })
  }, [cityFilter, categoryFilter, zeroScamOnly])

  const filteredScamCards = useMemo(() => {
    return THAILAND_SCAM_SHIELD_CARDS.filter((card) => {
      if (cityFilter === 'all') return true
      return card.cityScope === 'all' || card.cityScope === cityFilter
    })
  }, [cityFilter])

  const b2bConfig = DEFAULT_PLATFORM_CONFIG.b2bPartnerEngine
  const coinValidity = DEFAULT_PLATFORM_CONFIG.walletCoinValidity

  const handleOpenDealPick = (deal: TouristDealItem) => {
    triggerHaptic('tap')
    setSelectedDeal(deal)
    setSelectedSlot(deal.slots[0] ?? '18:00')
    setGuestCount(2)
    setIssuedVoucher(null)
  }

  const handleHostAttach = (deal: TouristDealItem) => {
    triggerHaptic('select')
    playKring('release')
    setAttachedDealIds((prev) => (prev.includes(deal.id) ? prev : [...prev, deal.id]))
    onAttachDealToHangout?.(deal)
  }

  const handleOneTapPayVoucher = (deal: TouristDealItem) => {
    triggerHaptic('clink')
    playKring('release')
    const suffix = String((deal.kringPriceBaht + deal.hostBonusBaht) * 7).slice(0, 4)
    const code = `${deal.voucherCodePrefix}-${suffix}`
    setIssuedVoucher({
      deal,
      code,
      slot: selectedSlot || deal.slots[0] || '18:00',
      guests: guestCount,
    })
    onIssueGoldVoucher?.(deal, code)
  }

  return (
    <section
      className="kp kp2"
      data-testid="kring-deals-tab"
      data-look="cinema"
      aria-label={th ? 'ดีลท่องเที่ยวกรุงเทพฯ และพัทยา' : 'Bangkok & Pattaya Verified Tourist Deals'}
    >
      {/* Top Header + Tourist / Host Mode Switch */}
      <header
        className="kp2-top"
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>
            {th ? 'ดีลพาร์ทเนอร์กริ๊ง · กรุงเทพฯ & พัทยา' : 'Kring Verified Deals · BKK & Pattaya'}
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#b8c0e0' }}>
            {th
              ? 'ไม่ต้องกดตู้ ATM — ตู้ ATM ไทยเก็บค่าธรรมเนียม ฿220–250 ต่อครั้ง'
              : 'No ATM needed — Thai ATMs charge ฿220–250 a withdrawal'}
          </p>
        </div>

        <div
          role="group"
          aria-label="Deals viewer mode"
          data-testid="deals-viewer-mode-switch"
          style={{
            display: 'inline-flex',
            borderRadius: 999,
            padding: 3,
            background: 'rgba(52, 70, 255, 0.14)',
            border: '1px solid rgba(115, 129, 255, 0.35)',
          }}
        >
          <button
            type="button"
            data-testid="deals-mode-tourist"
            aria-pressed={viewerMode === 'tourist'}
            onClick={() => {
              triggerHaptic('tap')
              setViewerMode('tourist')
            }}
            style={{
              border: 0,
              borderRadius: 999,
              padding: '5px 11px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              background: viewerMode === 'tourist' ? '#FFB21E' : 'transparent',
              color: viewerMode === 'tourist' ? '#0B0813' : '#d8dcff',
            }}
          >
            {th ? '🧳 มุมมองนักท่องเที่ยว' : '🧳 Tourist View'}
          </button>
          <button
            type="button"
            data-testid="deals-mode-host"
            aria-pressed={viewerMode === 'host'}
            onClick={() => {
              triggerHaptic('tap')
              setViewerMode('host')
            }}
            style={{
              border: 0,
              borderRadius: 999,
              padding: '5px 11px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              background: viewerMode === 'host' ? '#FFB21E' : 'transparent',
              color: viewerMode === 'host' ? '#0B0813' : '#d8dcff',
            }}
          >
            {th ? '🌸 โหมดโฮสต์ (+โบนัสบาท)' : '🌸 Host Add-On View'}
          </button>
        </div>
      </header>

      {/* Multi-City Filter Pills: 🌴 All Thailand | 🏛️ Bangkok | 🌊 Pattaya & Koh Larn */}
      <div
        role="tablist"
        aria-label="Multi-city deal filter"
        data-testid="deals-city-filter"
        style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '8px 0 4px' }}
      >
        {DEAL_CITY_PILLS.map((pill) => {
          const active = cityFilter === pill.id
          return (
            <button
              key={pill.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`deals-city-${pill.id}`}
              onClick={() => {
                triggerHaptic('select')
                setCityFilter(pill.id)
              }}
              style={{
                whiteSpace: 'nowrap',
                borderRadius: 999,
                padding: '7px 14px',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                border: active ? '1px solid #FFD067' : '1px solid rgba(115, 129, 255, 0.28)',
                background: active
                  ? 'linear-gradient(135deg, #FFB21E 0%, #FFD067 100%)'
                  : 'rgba(18, 22, 44, 0.85)',
                color: active ? '#0B0813' : '#e6e9ff',
              }}
            >
              {th ? pill.labelTh : pill.label}
            </button>
          )
        })}

        {/* 1-Tap 🛡️ Zero-Scam Vetted Quick Filter Pill */}
        <button
          type="button"
          aria-pressed={zeroScamOnly}
          data-testid="deals-zero-scam-toggle"
          onClick={() => {
            triggerHaptic('select')
            setZeroScamOnly((prev) => !prev)
          }}
          style={{
            whiteSpace: 'nowrap',
            borderRadius: 999,
            padding: '7px 14px',
            fontSize: 13,
            fontWeight: 800,
            cursor: 'pointer',
            border: zeroScamOnly ? '1px solid #FFD067' : '1px solid rgba(115, 129, 255, 0.45)',
            background: zeroScamOnly
              ? 'linear-gradient(135deg, #FFB21E 0%, #FFD067 100%)'
              : 'rgba(52, 70, 255, 0.22)',
            color: zeroScamOnly ? '#0B0813' : '#FFD067',
          }}
        >
          {th ? '🛡️ คัดกรองไร้โกง (Zero-Scam Vetted)' : '🛡️ Zero-Scam Vetted'}
        </button>
      </div>

      {/* Category Filter Pills */}
      <div
        role="tablist"
        aria-label="Deal category filter"
        data-testid="deals-category-filter"
        style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '4px 0 10px' }}
      >
        {DEAL_CATEGORY_PILLS.map((cat) => {
          const active = categoryFilter === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`deals-cat-${cat.id}`}
              onClick={() => {
                triggerHaptic('tap')
                setCategoryFilter(cat.id)
              }}
              style={{
                whiteSpace: 'nowrap',
                borderRadius: 999,
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                border: active ? '1px solid #7381FF' : '1px solid rgba(255, 255, 255, 0.12)',
                background: active ? 'rgba(52, 70, 255, 0.28)' : 'rgba(255, 255, 255, 0.05)',
                color: active ? '#ffffff' : '#b8c0e0',
              }}
            >
              {th ? cat.labelTh : cat.label}
            </button>
          )
        })}
      </div>

      {/* Collapsible Thailand Scam Shield & Local Street Rules Banner */}
      <div
        data-testid="deals-scam-shield-banner"
        style={{
          marginBottom: 12,
          borderRadius: 16,
          padding: '10px 13px',
          background: 'linear-gradient(135deg, rgba(52, 70, 255, 0.16) 0%, rgba(255, 178, 30, 0.12) 100%)',
          border: '1px solid rgba(255, 208, 103, 0.45)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#FFD067' }}>
              🛡️ Thailand Scam Shield &amp; Local Street Rules
            </div>
            <div style={{ fontSize: 11.5, color: '#d8dcff' }}>
              {th
                ? 'คู่มือป้องกันกลลวงนักท่องเที่ยวในกรุงเทพฯ & พัทยา (คัดกรองจาก Reddit)'
                : 'Reddit-sourced street rules for Bangkok & Pattaya — zero touts, locked Baht prices'}
            </div>
          </div>

          <button
            type="button"
            data-testid="deals-scam-shield-toggle"
            aria-expanded={scamShieldOpen}
            onClick={() => {
              triggerHaptic('tap')
              setScamShieldOpen((prev) => !prev)
            }}
            style={{
              borderRadius: 999,
              padding: '6px 13px',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              border: '1px solid #FFD067',
              background: scamShieldOpen
                ? 'linear-gradient(135deg, #FFB21E 0%, #FFD067 100%)'
                : 'rgba(11, 8, 19, 0.75)',
              color: scamShieldOpen ? '#0B0813' : '#FFD067',
            }}
          >
            🛡️ 6 Street Scams We Block {scamShieldOpen ? '▴' : '▾'}
          </button>
        </div>

        {scamShieldOpen && (
          <div
            data-testid="deals-scam-shield-sheet"
            style={{
              marginTop: 10,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: 8,
            }}
          >
            {filteredScamCards.map((scam, idx) => {
              const linkedDeal = TOURIST_DEALS_CATALOG.find((d) => d.id === scam.linkedDealId)
              return (
                <div
                  key={scam.id}
                  data-testid={`scam-shield-card-${scam.id}`}
                  data-city-scope={scam.cityScope}
                  style={{
                    borderRadius: 12,
                    padding: 10,
                    background: 'rgba(11, 8, 19, 0.88)',
                    border: '1px solid rgba(115, 129, 255, 0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 800,
                        color: '#FFD067',
                        padding: '2px 7px',
                        borderRadius: 999,
                        background: 'rgba(255, 178, 30, 0.15)',
                      }}
                    >
                      #{idx + 1} · {scam.cityBadge}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#ffffff' }}>
                    {th ? scam.titleTh : scam.title}
                  </div>
                  <p style={{ margin: 0, fontSize: 11.5, color: '#fca5a5' }}>
                    ⚠️ {scam.streetTrapSummary}
                  </p>
                  <p style={{ margin: 0, fontSize: 11.5, color: '#86efac', fontWeight: 600 }}>
                    ✅ {scam.kringCounterRule}
                  </p>
                  {linkedDeal && (
                    <button
                      type="button"
                      data-testid={`scam-shield-open-deal-${scam.id}`}
                      onClick={() => handleOpenDealPick(linkedDeal)}
                      style={{
                        marginTop: 4,
                        alignSelf: 'flex-start',
                        borderRadius: 8,
                        padding: '4px 9px',
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: 'pointer',
                        border: '1px solid rgba(255, 208, 103, 0.5)',
                        background: 'rgba(255, 178, 30, 0.16)',
                        color: '#FFD067',
                      }}
                    >
                      Open Vetted Deal · ฿{linkedDeal.kringPriceBaht.toLocaleString('en-US')} →
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Deal Cards Grid */}
      <div
        data-testid="deals-catalog-list"
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        {filteredDeals.map((deal) => {
          const savingsBaht = deal.walkInPriceBaht - deal.kringPriceBaht
          const isAttached = attachedDealIds.includes(deal.id)
          const payNowBookingFeeBaht = Math.round(deal.kringPriceBaht * 0.2)
          const payAtVenueRestBaht = deal.kringPriceBaht - payNowBookingFeeBaht

          return (
            <article
              key={deal.id}
              data-testid={`deal-card-${deal.id}`}
              data-city={deal.city}
              data-category={deal.category}
              data-reddit-verified={deal.isRedditVerified ? 'true' : 'false'}
              style={{
                borderRadius: 18,
                padding: 14,
                background: 'rgba(15, 18, 38, 0.92)',
                border: deal.isRedditVerified
                  ? '1px solid rgba(255, 208, 103, 0.55)'
                  : '1px solid rgba(115, 129, 255, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#FFD067',
                      }}
                    >
                      {deal.city === 'bangkok' ? '🏛️ Bangkok' : '🌊 Pattaya & Koh Larn'} · {deal.tatOrVenueBadge}
                    </span>
                    {deal.isRedditVerified && (
                      <span
                        data-testid={`deal-reddit-badge-${deal.id}`}
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 10.5,
                          fontWeight: 800,
                          background: 'rgba(52, 70, 255, 0.28)',
                          border: '1px solid #7381FF',
                          color: '#FFD067',
                        }}
                      >
                        {deal.redditVettedBadge ?? '🛡️ Community-Vetted · Zero Tout'}
                      </span>
                    )}
                  </div>
                  <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: '#ffffff' }}>
                    {deal.emoji} {th ? deal.titleTh : deal.title}
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ea4c6' }}>
                    {deal.partnerName} · {deal.seatsLeft} {th ? 'ที่นั่งว่างวันนี้' : 'spots left today'}
                  </p>
                  {deal.antiScamShieldNote && (
                    <p
                      data-testid={`deal-antiscam-note-${deal.id}`}
                      style={{ margin: '4px 0 0', fontSize: 11.5, color: '#d8dcff', fontWeight: 600 }}
                    >
                      🛡️ {deal.antiScamShieldNote}
                    </p>
                  )}
                </div>
              </div>

              {/* Strict Baht-Only Price / Host Bonus Display (Zero % symbols on UI!) */}
              {viewerMode === 'tourist' ? (
                <div
                  data-testid={`deal-tourist-pricing-${deal.id}`}
                  style={{
                    borderRadius: 12,
                    padding: '8px 11px',
                    background: 'rgba(52, 70, 255, 0.12)',
                    border: '1px solid rgba(115, 129, 255, 0.28)',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#f4f6ff',
                  }}
                >
                  <span>
                    Kring Price ฿{deal.kringPriceBaht.toLocaleString('en-US')} · Walk-in{' '}
                    <s style={{ color: '#ef4444' }}>฿{deal.walkInPriceBaht.toLocaleString('en-US')}</s> (Save ฿
                    {savingsBaht.toLocaleString('en-US')}) · +฿{deal.serviceFeeBaht} Service Fee
                  </span>
                  <div style={{ fontSize: 11.5, color: '#FFD067', marginTop: 3 }}>
                    Pay ฿{payNowBookingFeeBaht.toLocaleString('en-US')} now to Kring · ฿
                    {payAtVenueRestBaht.toLocaleString('en-US')} at the venue
                  </div>
                </div>
              ) : (
                <div
                  data-testid={`deal-host-bonus-${deal.id}`}
                  style={{
                    borderRadius: 12,
                    padding: '8px 11px',
                    background: 'rgba(255, 178, 30, 0.14)',
                    border: '1px solid rgba(255, 208, 103, 0.45)',
                    fontSize: 13,
                    fontWeight: 800,
                    color: '#FFD067',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  <span>🎁 +฿{deal.hostBonusBaht.toLocaleString('en-US')} Host Bonus on QR Scan</span>
                  <span style={{ fontSize: 11.5, color: '#d8dcff', fontWeight: 600 }}>
                    Guest pays ฿{deal.kringPriceBaht.toLocaleString('en-US')} (Saves ฿
                    {savingsBaht.toLocaleString('en-US')})
                  </span>
                </div>
              )}

              {/* Action Buttons: 1-Tap Pick / ➕ Attach to Hangout */}
              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                {viewerMode === 'host' ? (
                  <button
                    type="button"
                    data-testid={`deal-host-attach-${deal.id}`}
                    onClick={() => handleHostAttach(deal)}
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      padding: '9px 14px',
                      border: 0,
                      fontWeight: 800,
                      fontSize: 13,
                      cursor: 'pointer',
                      background: isAttached
                        ? 'rgba(115, 129, 255, 0.28)'
                        : 'linear-gradient(135deg, #FFB21E 0%, #FFD067 100%)',
                      color: isAttached ? '#ffffff' : '#0B0813',
                    }}
                  >
                    {isAttached
                      ? `✓ Attached (+฿${deal.hostBonusBaht.toLocaleString('en-US')} Bonus)`
                      : `➕ Attach to Hangout · +฿${deal.hostBonusBaht.toLocaleString('en-US')} Bonus`}
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%' }}>
                    <button
                      type="button"
                      data-testid={`deal-meet-local-free-btn-${deal.id}`}
                      onClick={() => {
                        triggerHaptic('select')
                        playKring('release')
                        handleOpenDealPick(deal)
                        onAttachDealToHangout?.(deal)
                      }}
                      style={{
                        flex: '1 1 200px',
                        borderRadius: 12,
                        padding: '9px 12px',
                        border: '1px solid #7381FF',
                        fontWeight: 800,
                        fontSize: 12.5,
                        cursor: 'pointer',
                        background: 'rgba(52, 70, 255, 0.24)',
                        color: '#ffffff',
                      }}
                    >
                      🥂 Meet a Local Here (+Coupon FREE)
                    </button>
                    <button
                      type="button"
                      data-testid={`deal-pick-btn-${deal.id}`}
                      onClick={() => handleOpenDealPick(deal)}
                      style={{
                        flex: '1 1 180px',
                        borderRadius: 12,
                        padding: '9px 14px',
                        border: 0,
                        fontWeight: 800,
                        fontSize: 13,
                        cursor: 'pointer',
                        background: 'linear-gradient(135deg, #FFB21E 0%, #FFD067 100%)',
                        color: '#0B0813',
                      }}
                    >
                      {th
                        ? `🎟️ ใช้คูปองเดี่ยว · ฿${deal.kringPriceBaht.toLocaleString('en-US')}`
                        : `🎟️ Use Coupon Solo · ฿${deal.kringPriceBaht.toLocaleString('en-US')}`}
                    </button>
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {/* 1-Tap Pay & Gold-Foil QR Voucher Flip-In Sheet */}
      {selectedDeal && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="deal-checkout-voucher-sheet"
          data-dodo-product-id={getDodoProductByThbTier(selectedDeal.kringPriceBaht).productId}
          data-dodo-voucher-product-id={KRING_DODO_CATALOG.KRING_DEAL_VOUCHER_PACK.productId}
          data-dodo-checkout-url={KRING_DODO_TEST_CHECKOUT_URL}
          aria-label={selectedDeal.title}
          style={{
            marginTop: 14,
            borderRadius: 20,
            padding: 16,
            background: 'linear-gradient(160deg, #131735 0%, #0B0813 100%)',
            border: '1px solid #FFD067',
          }}
        >
          {!issuedVoucher ? (
            <div data-testid="deal-one-tap-pay-step">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#FFD067' }}>
                  {selectedDeal.emoji} {selectedDeal.title}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedDeal(null)}
                  style={{ background: 'none', border: 0, color: '#9ea4c6', fontSize: 16, cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              <p style={{ fontSize: 12.5, color: '#d8dcff', margin: '6px 0' }}>
                Kring Price ฿{selectedDeal.kringPriceBaht.toLocaleString('en-US')} · Walk-in ฿
                {selectedDeal.walkInPriceBaht.toLocaleString('en-US')} (Save ฿
                {(selectedDeal.walkInPriceBaht - selectedDeal.kringPriceBaht).toLocaleString('en-US')}) · +฿
                {selectedDeal.serviceFeeBaht} Service Fee
              </p>

              {/* Time Slot & Guest Selector */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
                {selectedDeal.slots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    data-testid={`deal-slot-${slot}`}
                    onClick={() => setSelectedSlot(slot)}
                    style={{
                      borderRadius: 999,
                      padding: '4px 11px',
                      fontSize: 12,
                      fontWeight: 700,
                      border: selectedSlot === slot ? '1px solid #FFD067' : '1px solid rgba(255,255,255,0.2)',
                      background: selectedSlot === slot ? '#FFB21E' : 'transparent',
                      color: selectedSlot === slot ? '#0B0813' : '#ffffff',
                      cursor: 'pointer',
                    }}
                  >
                    🕒 {slot}
                  </button>
                ))}
              </div>

              {/* Nationality Pay Pills */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0', fontSize: 11.5, color: '#b8c0e0' }}>
                <span>🇮🇳 UPI</span> · <span>💬 WeChat Pay</span> · <span>🇷🇺 TrueMoney</span> ·{' '}
                <span>🇹🇭 PromptPay</span> ·{' '}
                <span
                  data-testid="deal-dodo-card-pill"
                  data-dodo-product-id={getDodoProductByThbTier(selectedDeal.kringPriceBaht).productId}
                >
                  💳 Card
                </span>
              </div>

              {/* Automated Solo-Founder Split & Open-Bill / Thai Local Conversion Banner */}
              {isThaiLocalUser ? (
                <div
                  data-testid="deal-thai-host-conversion-banner"
                  style={{
                    marginTop: 8,
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: 'rgba(255, 178, 30, 0.16)',
                    border: '1px solid #FFD067',
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: '#FFD067',
                  }}
                >
                  ✨ Already at this café? Earn ฿800–฿1,280 having coffee here with a verified traveller!{' '}
                  <button
                    type="button"
                    data-testid="deal-turn-on-host-mode-btn"
                    onClick={() => setViewerMode('host')}
                    style={{
                      marginLeft: 6,
                      borderRadius: 8,
                      padding: '3px 8px',
                      border: 0,
                      background: '#FFB21E',
                      color: '#0B0813',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    [Turn On Host Mode Here]
                  </button>
                </div>
              ) : (
                <div
                  data-testid="deal-open-bill-pass-options"
                  style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      data-testid="deal-unlock-single-49-btn"
                      onClick={() => setSoloUnlockChoice('SINGLE_49_THB')}
                      style={{
                        borderRadius: 10,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 800,
                        border: soloUnlockChoice === 'SINGLE_49_THB' ? '1px solid #FFD067' : '1px solid rgba(255,255,255,0.2)',
                        background: soloUnlockChoice === 'SINGLE_49_THB' ? 'rgba(255,178,30,0.22)' : 'transparent',
                        color: '#FFD067',
                        cursor: 'pointer',
                      }}
                    >
                      [Unlock This Coupon — ฿49]
                    </button>
                    <button
                      type="button"
                      data-testid="deal-unlock-pass-199-btn"
                      onClick={() => setSoloUnlockChoice('PASS_7D_199_THB')}
                      style={{
                        borderRadius: 10,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 800,
                        border: soloUnlockChoice === 'PASS_7D_199_THB' ? '1px solid #FFD067' : '1px solid rgba(255,255,255,0.2)',
                        background: soloUnlockChoice === 'PASS_7D_199_THB' ? 'rgba(255,178,30,0.22)' : 'transparent',
                        color: '#FFD067',
                        cursor: 'pointer',
                      }}
                    >
                      [7-Day Unlimited Thailand Coupon Pass — ฿199]
                    </button>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#d8dcff', fontWeight: 600 }}>
                    💡 Or get ALL coupons 100% FREE when you book a Local Host!
                  </div>
                  <div
                    data-testid="deal-auto-credit-shield-badge"
                    style={{ fontSize: 11.5, color: '#86efac', fontWeight: 700 }}
                  >
                    🛡️ 100% Auto-Credited to your Kring Wallet if unused.
                  </div>
                </div>
              )}

              <button
                type="button"
                data-testid="deal-one-tap-pay-btn"
                data-dodo-product-id={getDodoProductByThbTier(selectedDeal.kringPriceBaht).productId}
                data-dodo-checkout-url={KRING_DODO_TEST_CHECKOUT_URL}
                onClick={() => handleOneTapPayVoucher(selectedDeal)}
                style={{
                  width: '100%',
                  marginTop: 8,
                  borderRadius: 12,
                  padding: '11px 16px',
                  border: 0,
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: 'pointer',
                  background: 'linear-gradient(135deg, #FFB21E 0%, #FFD067 100%)',
                  color: '#0B0813',
                }}
              >
                1-Tap Pay &amp; Flip Gold-Foil QR Voucher · ฿
                {(selectedDeal.kringPriceBaht + selectedDeal.serviceFeeBaht).toLocaleString('en-US')}
              </button>
            </div>
          ) : (
            <div
              data-testid="deal-gold-foil-voucher-card"
              style={{
                borderRadius: 16,
                padding: 14,
                background: 'linear-gradient(135deg, rgba(255, 178, 30, 0.22) 0%, rgba(155, 92, 255, 0.18) 100%)',
                border: '1px solid #FFD067',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#FFD067' }}>
                  ✨ GOLD-FOIL PARTNER QR VOUCHER · UNUSED
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIssuedVoucher(null)
                    setSelectedDeal(null)
                  }}
                  style={{ background: 'none', border: 0, color: '#ffffff', cursor: 'pointer', fontWeight: 800 }}
                >
                  ✕
                </button>
              </div>
              <h4 style={{ margin: '6px 0 2px', fontSize: 15, fontWeight: 800, color: '#ffffff' }}>
                {issuedVoucher.deal.title}
              </h4>
              <p style={{ margin: 0, fontSize: 12, color: '#d8dcff' }}>
                Slot: {issuedVoucher.slot} · Guests: {issuedVoucher.guests} · Partner:{' '}
                {issuedVoucher.deal.partnerName}
              </p>
              <div
                data-testid="deal-voucher-qr-code"
                style={{
                  marginTop: 10,
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: '#0B0813',
                  border: '1px dashed #FFD067',
                  fontFamily: 'monospace',
                  fontSize: 14,
                  fontWeight: 800,
                  color: '#FFD067',
                  textAlign: 'center',
                }}
              >
                [ QR ] {issuedVoucher.code}
              </div>
              {(() => {
                const deposit10 = Math.round(issuedVoucher.deal.walkInPriceBaht * 0.1)
                const venue80 = Math.round(issuedVoucher.deal.walkInPriceBaht * 0.8)
                const save10 = issuedVoucher.deal.walkInPriceBaht - (deposit10 + venue80)
                return (
                  <div
                    data-testid="deal-hostelworld-split-banner"
                    style={{
                      marginTop: 10,
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: 'rgba(16, 185, 129, 0.16)',
                      border: '1px solid #34d399',
                      fontSize: 22,
                      lineHeight: 1.35,
                      fontWeight: 800,
                      color: '#ecfdf5',
                    }}
                  >
                    <div>
                      ✅ Paid Deposit in Kring: ฿{deposit10.toLocaleString('en-US')} · Pay Only ฿
                      {venue80.toLocaleString('en-US')} (80%) Directly to Venue at Counter (Cash/Card) — You Save ฿
                      {save10.toLocaleString('en-US')}!
                    </div>
                    <div style={{ fontSize: 18, marginTop: 4, color: '#FFD067' }}>
                      ✅ ชำระมัดจำในกริ๊งแล้ว: ฿{deposit10.toLocaleString('en-US')} · จ่ายที่หน้าร้านเพียง ฿
                      {venue80.toLocaleString('en-US')} (80% เงินสด/บัตร) — ประหยัดทันที ฿{save10.toLocaleString('en-US')}!
                    </div>
                  </div>
                )
              })()}
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#86efac', fontWeight: 700 }}>
                🛡️ 100% Auto-Credited to your Kring Wallet if unused.
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#b8c0e0' }}>
                🎁 +฿{issuedVoucher.deal.hostBonusBaht.toLocaleString('en-US')} Host Bonus on QR Scan · Paid Coins valid{' '}
                {coinValidity.paidCoinValidityDays} days · Bonus Coins valid {coinValidity.bonusCoinValidityDays} days
              </p>
            </div>
          )}
        </div>
      )}

      {/* B2B Partner Footer Summary (Baht-Only, Zero %) */}
      <footer
        data-testid="deals-b2b-partner-footer"
        data-dodo-venue-pin-id={KRING_DODO_CATALOG.KRING_B2B_VENUE_PIN_1990_MO.productId}
        data-dodo-featured-slot-id={KRING_DODO_CATALOG.KRING_B2B_FEATURED_SLOT_3990_MO.productId}
        style={{
          marginTop: 14,
          padding: '10px 12px',
          borderRadius: 14,
          background: 'rgba(52, 70, 255, 0.08)',
          border: '1px solid rgba(115, 129, 255, 0.2)',
          fontSize: 11.5,
          color: '#9ea4c6',
        }}
      >
        <span>
          🏛️ Verified Meeting Point Badge: ฿{b2bConfig.verifiedMeetingPointMonthlyBaht.toLocaleString('en-US')}/mo (
          {b2bConfig.foundingTrialDays}-day Founding Trial) · Featured Slot: ฿
          {b2bConfig.featuredSlotMonthlyBaht.toLocaleString('en-US')}/mo · Paid Coins{' '}
          {coinValidity.paidCoinValidityDays}d / Bonus Coins {coinValidity.bonusCoinValidityDays}d
        </span>
      </footer>
    </section>
  )
}
