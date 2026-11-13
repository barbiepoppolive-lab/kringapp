/* Street address / landmark line for every meeting place, and the Google Maps link that finds the exact spot
   (station + exit, pier, gate), not just the area. Used by #detail, #held, Trips, #onway, check-in and chat.
   Addresses are public street lines (road, landmark, district) in English and Thai; the Thai line is the one to show
   a taxi or Grab driver. Keys are the HOST_PLACES ids (core/hostPlaces.ts) so a host-picked place gets the same line. */
import { S, type Booking } from './store'
import { t, plc, type Act } from './data'
import { HOST_PLACES } from './hostPlaces'

export interface PlaceAddr {
  /** street / landmark line in English (also used for the Maps search) */
  en: string
  /** the same line in Thai (for drivers, and for Thai viewers) */
  th: string
  /** English name used for the Maps search (station + exit, pier, gate) */
  q: string
  /** what to look for on arrival */
  kind?: 'station' | 'pier' | 'gate' | 'walk'
}

/** Addresses by HOST_PLACES id (Bangkok + Pattaya public places). */
export const PLACE_ADDR: Record<string, PlaceAddr> = {
  'mrt-wat-mangkon-1': { en: 'Charoen Krung Rd, next to Wat Mangkon Kamalawat, Samphanthawong', th: 'ถนนเจริญกรุง ข้างวัดมังกรกมลาวาส เขตสัมพันธวงศ์', q: 'MRT Wat Mangkon Exit 1', kind: 'station' },
  'odeon-circle': { en: 'Odeon Circle, where Yaowarat Rd meets Charoen Krung Rd, Samphanthawong', th: 'วงเวียนโอเดียน ปากถนนเยาวราช ตัดถนนเจริญกรุง เขตสัมพันธวงศ์', q: 'Chinatown Gate Odeon Circle' },
  'mrt-hua-lamphong-1': { en: 'Rama IV Rd, by Hua Lamphong railway station, Pathum Wan', th: 'ถนนพระรามที่ 4 ใกล้สถานีรถไฟหัวลำโพง เขตปทุมวัน', q: 'MRT Hua Lamphong Exit 1', kind: 'station' },
  'talat-noi-river-city': { en: '23 Trok Rong Nam Khaeng, Yotha Rd, Talat Noi, Samphanthawong', th: '23 ตรอกโรงน้ำแข็ง ถนนโยธา แขวงตลาดน้อย เขตสัมพันธวงศ์', q: 'River City Bangkok' },
  'samyan-mitrtown': { en: '944 Rama IV Rd, Wang Mai, Pathum Wan', th: '944 ถนนพระรามที่ 4 แขวงวังใหม่ เขตปทุมวัน', q: 'Samyan Mitrtown' },
  'mrt-sam-yan-2': { en: 'Rama IV Rd at Sam Yan junction (Samyan Mitrtown side), Pathum Wan', th: 'ถนนพระรามที่ 4 แยกสามย่าน (ฝั่งสามย่านมิตรทาวน์) เขตปทุมวัน', q: 'MRT Sam Yan Exit 2', kind: 'station' },
  'chamchuri-square': { en: '319 Phaya Thai Rd at Sam Yan junction, Pathum Wan', th: '319 ถนนพญาไท แยกสามย่าน เขตปทุมวัน', q: 'Chamchuri Square' },
  'chula-centenary-park': { en: 'Banthat Thong Rd, Wang Mai, Pathum Wan', th: 'ถนนบรรทัดทอง แขวงวังใหม่ เขตปทุมวัน', q: 'Chulalongkorn University Centenary Park' },
  'chula-sala-phra-kieo': { en: 'Chulalongkorn University main campus, off Phaya Thai Rd, Pathum Wan', th: 'จุฬาลงกรณ์มหาวิทยาลัย ฝั่งถนนพญาไท เขตปทุมวัน', q: 'Sala Phra Kieo Chulalongkorn University' },
  'bacc': { en: '939 Rama I Rd, Pathum Wan (BTS National Stadium skywalk)', th: '939 ถนนพระรามที่ 1 เขตปทุมวัน (ทางเชื่อม BTS สนามกีฬาแห่งชาติ)', q: 'Bangkok Art and Culture Centre' },
  'siam-paragon': { en: '991 Rama I Rd, Pathum Wan (BTS Siam)', th: '991 ถนนพระรามที่ 1 เขตปทุมวัน (BTS สยาม)', q: 'Siam Paragon main entrance' },
  'lido-connect': { en: 'Rama I Rd, Siam Square, Pathum Wan', th: 'ถนนพระรามที่ 1 สยามสแควร์ เขตปทุมวัน', q: 'Lido Connect Siam Square' },
  'mbk-center': { en: '444 Phaya Thai Rd at Pathum Wan junction, Pathum Wan', th: '444 ถนนพญาไท แยกปทุมวัน เขตปทุมวัน', q: 'MBK Center' },
  'bts-ari-3': { en: 'Phahonyothin Rd, near Soi Ari (Phahonyothin 7), Phaya Thai', th: 'ถนนพหลโยธิน ใกล้ซอยอารีย์ (พหลโยธิน 7) เขตพญาไท', q: 'BTS Ari Exit 3', kind: 'station' },
  'la-villa-ari': { en: '356 Phahonyothin Rd, Phaya Thai', th: '356 ถนนพหลโยธิน เขตพญาไท', q: 'La Villa Ari' },
  'victory-monument': { en: 'Victory Monument roundabout, Phahonyothin Rd, Ratchathewi', th: 'วงเวียนอนุสาวรีย์ชัยสมรภูมิ ถนนพหลโยธิน เขตราชเทวี', q: 'Victory Monument BTS skywalk' },
  'chatuchak-gate-1': { en: 'Kamphaeng Phet 2 Rd, Chatuchak (BTS Mo Chit / MRT Chatuchak Park)', th: 'ถนนกำแพงเพชร 2 เขตจตุจักร (BTS หมอชิต / MRT สวนจตุจักร)', q: 'Chatuchak Weekend Market Gate 1', kind: 'gate' },
  'mrt-kamphaeng-phet-2': { en: 'Kamphaeng Phet 2 Rd, Chatuchak (market side)', th: 'ถนนกำแพงเพชร 2 เขตจตุจักร (ฝั่งตลาดนัดจตุจักร)', q: 'MRT Kamphaeng Phet Exit 2', kind: 'station' },
  'or-tor-kor': { en: 'Kamphaeng Phet Rd, Chatuchak (MRT Kamphaeng Phet)', th: 'ถนนกำแพงเพชร เขตจตุจักร (MRT กำแพงเพชร)', q: 'Or Tor Kor Market' },
  'bts-sala-daeng': { en: 'Silom Rd at Rama IV Rd, Silom Complex skywalk, Bang Rak', th: 'ถนนสีลม แยกศาลาแดง ทางเชื่อมสีลมคอมเพล็กซ์ เขตบางรัก', q: 'BTS Sala Daeng Silom Complex', kind: 'station' },
  'lumpini-gate-1': { en: 'Rama IV Rd, Lumphini, Pathum Wan', th: 'ถนนพระรามที่ 4 แขวงลุมพินี เขตปทุมวัน', q: 'Lumphini Park Gate 1', kind: 'gate' },
  'lumpini-rama6': { en: 'Corner of Rama IV Rd and Ratchadamri Rd (MRT Silom), Pathum Wan', th: 'มุมถนนพระรามที่ 4 ตัดถนนราชดำริ (MRT สีลม) เขตปทุมวัน', q: 'King Rama VI Monument Lumphini Park', kind: 'gate' },
  'grand-postal-tcdc': { en: '1160 Charoen Krung Rd, Bang Rak', th: '1160 ถนนเจริญกรุง เขตบางรัก', q: 'Grand Postal Building TCDC' },
  'warehouse-30': { en: '48 Charoen Krung Soi 30, Bang Rak', th: '48 ซอยเจริญกรุง 30 เขตบางรัก', q: 'Warehouse 30 Charoen Krung' },
  'terminal-21-asok': { en: '88 Sukhumvit Soi 19, at BTS Asok / MRT Sukhumvit, Watthana', th: '88 สุขุมวิท ซอย 19 (BTS อโศก / MRT สุขุมวิท) เขตวัฒนา', q: 'Terminal 21 Asok' },
  'benjakitti-park': { en: 'Ratchadaphisek Rd, Khlong Toei (MRT Queen Sirikit National Convention Centre)', th: 'ถนนรัชดาภิเษก เขตคลองเตย (MRT ศูนย์การประชุมแห่งชาติสิริกิติ์)', q: 'Benjakitti Forest Park', kind: 'gate' },
  'benchasiri-park': { en: 'Sukhumvit Rd between Soi 22 and Soi 24, Khlong Toei (BTS Phrom Phong)', th: 'ถนนสุขุมวิท ระหว่างซอย 22 และ 24 เขตคลองเตย (BTS พร้อมพงษ์)', q: 'Benchasiri Park' },
  'bts-thong-lo-3': { en: 'Sukhumvit Rd at Soi 55 (Thong Lo), Watthana', th: 'ถนนสุขุมวิท ปากซอยทองหล่อ (สุขุมวิท 55) เขตวัฒนา', q: 'BTS Thong Lo Exit 3', kind: 'station' },
  'the-commons-thonglor': { en: '335 Thong Lo Soi 17, Watthana', th: '335 ซอยทองหล่อ 17 เขตวัฒนา', q: 'The Commons Thonglor' },
  'jodd-fairs-rama9': { en: 'Rama IX Rd, behind Central Rama 9 (MRT Phra Ram 9), Huai Khwang', th: 'ถนนพระราม 9 หลังเซ็นทรัล พระราม 9 (MRT พระราม 9) เขตห้วยขวาง', q: 'Jodd Fairs Rama 9' },
  'mrt-sanam-chai-1': { en: 'Sanam Chai Rd, next to Museum Siam, Phra Nakhon', th: 'ถนนสนามไชย ข้างมิวเซียมสยาม เขตพระนคร', q: 'MRT Sanam Chai Exit 1', kind: 'station' },
  'tha-tien-pier': { en: 'Maha Rat Rd, behind Wat Pho, Phra Nakhon (Chao Phraya Express pier N8)', th: 'ถนนมหาราช หลังวัดโพธิ์ เขตพระนคร (ท่าเรือ N8)', q: 'Tha Tien Pier', kind: 'pier' },
  'pak-khlong-talat': { en: 'Chak Phet Rd, by Memorial Bridge, Phra Nakhon', th: 'ถนนจักรเพชร เชิงสะพานพุทธ เขตพระนคร', q: 'Pak Khlong Talat flower market' },
  'santichaiprakan-park': { en: 'Phra Athit Rd, Banglamphu, Phra Nakhon', th: 'ถนนพระอาทิตย์ บางลำพู เขตพระนคร', q: 'Santichaiprakan Park' },
  'khao-san-chakrabongse': { en: 'Khao San Rd at Chakrabongse Rd, Phra Nakhon', th: 'ถนนข้าวสาร ตัดถนนจักรพงษ์ เขตพระนคร', q: 'Khao San Road Chakrabongse Road' },
  'iconsiam-pier-1': { en: '299 Charoen Nakhon Rd, Khlong San (ICONSIAM river side)', th: '299 ถนนเจริญนคร เขตคลองสาน (ฝั่งริมแม่น้ำ ไอคอนสยาม)', q: 'ICONSIAM pier', kind: 'pier' },
  'sathorn-pier': { en: 'Under Taksin Bridge, Charoen Krung Rd (BTS Saphan Taksin exit 2)', th: 'ใต้สะพานตากสิน ถนนเจริญกรุง (BTS สะพานตากสิน ทางออก 2)', q: 'Sathorn Pier', kind: 'pier' },
  'central-pattaya-beach': { en: 'Pattaya Beach Rd (Pattaya Sai 1), Pattaya City', th: 'ถนนเลียบชายหาดพัทยา (พัทยาสาย 1) เมืองพัทยา', q: 'Central Pattaya Beach Road' },
  'terminal-21-pattaya': { en: 'North Pattaya Rd (Pattaya Nua), Pattaya City', th: 'ถนนพัทยาเหนือ เมืองพัทยา', q: 'Terminal 21 Pattaya' },
  'bali-hai-pier': { en: 'South end of Walking Street, South Pattaya', th: 'สุดถนนวอล์กกิ้งสตรีท พัทยาใต้', q: 'Bali Hai Pier Pattaya', kind: 'pier' },
}

/** Places only the demo activities use (not in the host list). */
const EXTRA_ADDR: Record<string, PlaceAddr> = {
  'khlong-toei-nok-pier': { en: 'Wat Khlong Toei Nok pier, off Sunthon Kosa Rd, Khlong Toei', th: 'ท่าเรือวัดคลองเตยนอก ถนนสุนทรโกษา เขตคลองเตย', q: 'Wat Khlong Toei Nok pier', kind: 'pier' },
  'marine-dept-pier': { en: 'Marine Department, Yotha Rd, Talat Noi (Chao Phraya Express pier N4)', th: 'กรมเจ้าท่า ถนนโยธา แขวงตลาดน้อย (ท่าเรือ N4)', q: 'Marine Department Pier N4 Bangkok', kind: 'pier' },
  'mrt-huai-khwang-2': { en: 'Ratchadaphisek Rd at Huai Khwang junction, Huai Khwang', th: 'ถนนรัชดาภิเษก แยกห้วยขวาง เขตห้วยขวาง', q: 'MRT Huai Khwang Exit 2', kind: 'station' },
}

/** Each demo activity's meeting point. The cooking class meets at a public BTS skywalk and walks to the kitchen. */
const ACT_PLACE: Record<string, string> = {
  eat: 'mrt-wat-mangkon-1',
  muay: 'lumpini-gate-1',
  market: 'mrt-sanam-chai-1',
  river: 'khlong-toei-nok-pier',
  temple: 'tha-tien-pier',
  oldtown: 'marine-dept-pier',
  night: 'mrt-huai-khwang-2',
  cafe: 'bts-ari-3',
  cook: 'bts-sala-daeng',
}
/** Activities whose meeting point is not the activity place: the host walks the guest there. */
const WALK_FROM: Record<string, true> = { cook: true }

/** Places the chat place-picker can set on a booking (placesFilter fixture ids) mapped to the same addresses. */
const FIXTURE_ALIAS: Record<string, string> = {
  ChIJ_wat_mangkon_mrt: 'mrt-wat-mangkon-1',
  ChIJ_lumpini_park: 'lumpini-rama6',
  ChIJ_bacc_siam: 'bacc',
  ChIJ_iconsiam_pier: 'iconsiam-pier-1',
  ChIJ_or_tor_kor: 'or-tor-kor',
  ChIJ_jodd_fairs: 'jodd-fairs-rama9',
  ChIJ_chula_centenary_park: 'chula-centenary-park',
}

const ALL: Record<string, PlaceAddr> = { ...PLACE_ADDR, ...EXTRA_ADDR }

/** The meeting place key for an activity / booking, or '' when Kring has no address for it. */
export function meetKey(a: Act, b?: Booking | null): string {
  if (b?.meeting_place_id) {
    const id = FIXTURE_ALIAS[b.meeting_place_id] || b.meeting_place_id
    if (ALL[id]) return id
  }
  if (b?.meeting_name) {
    // a place agreed in chat or picked by the host: find it by its Thai or English name
    const n = b.meeting_name.trim().toLowerCase()
    const hp = HOST_PLACES.find((p) => p.en.toLowerCase() === n || p.th === b.meeting_name)
    if (hp && ALL[hp.id]) return hp.id
    return ''
  }
  return ACT_PLACE[a.id] || ''
}

/** Name of the meeting place in the viewer's language: the place agreed for this booking, else the activity's
    meeting point (for the cooking class: the BTS skywalk where the host picks guests up, not the kitchen). */
export function meetName(a: Act, b?: Booking | null): string {
  if (b?.meeting_name) return b.meeting_name
  if (WALK_FROM[a.id]) {
    const hp = HOST_PLACES.find((p) => p.id === ACT_PLACE[a.id])
    if (hp) return S.lang === 'th' ? hp.th : hp.en
  }
  return plc(a)
}

/** Thai name of the meeting place, for a driver ('' when the booking's agreed place has no Thai name in Kring). */
export function meetNameTh(a: Act, b?: Booking | null): string {
  if (b?.meeting_name) return HOST_PLACES.find((p) => p.en === b.meeting_name || p.th === b.meeting_name)?.th || ''
  if (WALK_FROM[a.id]) return HOST_PLACES.find((p) => p.id === ACT_PLACE[a.id])?.th || a.placeTh
  return a.placeTh
}

/** Address of a host-picked place (by HOST_PLACES id), or null. For host screens. */
export function placeAddr(id: string): PlaceAddr | null { return ALL[id] || null }

/** Street / landmark line in the viewer's language (Thai for Thai viewers, English otherwise), '' if unknown. */
export function meetAddress(a: Act, b?: Booking | null): string {
  const p = ALL[meetKey(a, b)]
  if (!p) return ''
  return S.lang === 'th' ? p.th : p.en
}

/** The Thai address line, for a taxi or Grab driver ('' if unknown). */
export function meetAddressTh(a: Act, b?: Booking | null): string {
  return ALL[meetKey(a, b)]?.th || ''
}

/** One short "what to look for" line (station exit, pier, gate, or the host walks you to the kitchen). */
export function meetHint(a: Act, b?: Booking | null): string {
  const k = meetKey(a, b)
  if (!b?.meeting_name && WALK_FROM[a.id]) return t('meetHintWalk')
  const kind = ALL[k]?.kind
  return kind === 'station' ? t('meetHintStation') : kind === 'pier' ? t('meetHintPier') : kind === 'gate' ? t('meetHintGate') : ''
}

/** Google Maps link that finds the exact meeting spot: the booking's coordinates when it has them, otherwise
    the place name with its exit / pier / gate plus the street line, never just the area. */
export function meetMapsUrl(a: Act, b?: Booking | null): string {
  let q: string
  if (b?.meeting_lat != null && b?.meeting_lng != null) q = `${b.meeting_lat},${b.meeting_lng}`
  else {
    const p = ALL[meetKey(a, b)]
    if (p) q = `${p.q}, ${p.en}, ${/pattaya/i.test(p.en) ? 'Chon Buri' : 'Bangkok'}, Thailand`
    else {
      // unknown place: the full name with its exit / gate / pier number (never only the area)
      const [n, ty, x] = a.place.split('|')
      const full = b?.meeting_name || (ty === 'exit' ? `${n} Exit ${x}` : ty === 'gate' ? `${n} Gate ${x}` : ty === 'pier' ? `${n} Pier` : n)
      q = `${full}, Bangkok, Thailand`
    }
  }
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q)
}

/** Every place Kring has an address for (for tests). */
export const ADDRESSED_PLACE_IDS = (): string[] => Object.keys(ALL)
/* ---------- area search (Explore): "Asok", "Silom", "อารีย์"… finds activities whose meeting point is in or near that area ---------- */

/** Approximate coordinates of the meeting points the activities use (public landmarks, ~100 m accuracy). */
const PLACE_LL: Record<string, [number, number]> = {
  'mrt-wat-mangkon-1': [13.7427, 100.5100],
  'lumpini-gate-1': [13.7303, 100.5412],
  'lumpini-rama6': [13.7312, 100.5379],
  'mrt-sanam-chai-1': [13.7444, 100.4940],
  'khlong-toei-nok-pier': [13.6992, 100.5636],
  'tha-tien-pier': [13.7465, 100.4910],
  'marine-dept-pier': [13.7330, 100.5132],
  'mrt-huai-khwang-2': [13.7785, 100.5735],
  'bts-ari-3': [13.7797, 100.5446],
  'bts-sala-daeng': [13.7286, 100.5343],
}

export interface SearchArea { en: string; th: string; lat: number; lng: number; km: number; words: string[] }
/** Areas a guest may type, with the words for them in the app's languages (whole words; Thai / CJK by substring). */
export const SEARCH_AREAS: SearchArea[] = [
  { en: 'Asok', th: 'อโศก', lat: 13.7370, lng: 100.5603, km: 2.5, words: ['asok', 'asoke', 'อโศก', '阿索克', '아속', 'असोक', 'асок', 'асоке'] },
  { en: 'Sukhumvit', th: 'สุขุมวิท', lat: 13.7330, lng: 100.5650, km: 4, words: ['sukhumvit', 'สุขุมวิท', '素坤逸', '수쿰윗', 'सुखुमवित', 'сукхумвит'] },
  { en: 'Nana', th: 'นานา', lat: 13.7405, lng: 100.5550, km: 2.5, words: ['nana', 'นานา', '娜娜'] },
  { en: 'Phrom Phong', th: 'พร้อมพงษ์', lat: 13.7305, lng: 100.5697, km: 2.5, words: ['phrom phong', 'phromphong', 'พร้อมพงษ์', '澎蓬', '프롬퐁'] },
  { en: 'Thonglor', th: 'ทองหล่อ', lat: 13.7310, lng: 100.5800, km: 2.5, words: ['thonglor', 'thong lo', 'thonglo', 'thong lor', 'ทองหล่อ', '通罗', '通銮', '통로', 'थोंगलोर', 'тхонглор', 'тонглор'] },
  { en: 'Ekkamai', th: 'เอกมัย', lat: 13.7197, lng: 100.5850, km: 2.5, words: ['ekkamai', 'ekamai', 'เอกมัย', '伊卡迈', '에까마이'] },
  { en: 'Silom', th: 'สีลม', lat: 13.7270, lng: 100.5310, km: 2.5, words: ['silom', 'สีลม', '是隆', '실롬', 'सिलोम', 'силом'] },
  { en: 'Sathorn', th: 'สาทร', lat: 13.7200, lng: 100.5290, km: 2.5, words: ['sathorn', 'sathon', 'สาทร', '沙吞', '사톤', 'सातोर्न', 'саторн'] },
  { en: 'Bang Rak', th: 'บางรัก', lat: 13.7270, lng: 100.5200, km: 2.5, words: ['bang rak', 'bangrak', 'charoen krung', 'บางรัก', 'เจริญกรุง', '挽叻', '방락'] },
  { en: 'Lumpini', th: 'ลุมพินี', lat: 13.7310, lng: 100.5410, km: 2.5, words: ['lumpini', 'lumphini', 'ลุมพินี', '伦披尼', '룸피니', 'लुम्पिनी', 'лумпини'] },
  { en: 'Ari', th: 'อารีย์', lat: 13.7797, lng: 100.5446, km: 2.5, words: ['ari', 'aree', 'อารีย์', 'อารี', '阿黎', '아리', 'आरी', 'ари'] },
  { en: 'Victory Monument', th: 'อนุสาวรีย์ชัยฯ', lat: 13.7628, lng: 100.5372, km: 2.5, words: ['victory monument', 'อนุสาวรีย์ชัย', '胜利纪念碑', '전승기념탑'] },
  { en: 'Chatuchak', th: 'จตุจักร', lat: 13.7999, lng: 100.5502, km: 2.5, words: ['chatuchak', 'jatujak', 'mo chit', 'จตุจักร', 'หมอชิต', '乍都乍', '짜뚜짝', 'चतुचक', 'чатучак'] },
  { en: 'Huai Khwang', th: 'ห้วยขวาง', lat: 13.7785, lng: 100.5735, km: 2.5, words: ['huai khwang', 'huaikhwang', 'ratchada', 'ห้วยขวาง', 'รัชดา', '汇权', '拉差达', '후아이쾅', 'हुआई ख्वांग', 'хуайкхванг'] },
  { en: 'Rama 9', th: 'พระราม 9', lat: 13.7570, lng: 100.5650, km: 2.5, words: ['rama 9', 'rama ix', 'พระราม 9', '拉玛九'] },
  { en: 'Siam', th: 'สยาม', lat: 13.7456, lng: 100.5341, km: 2.5, words: ['siam', 'สยาม', '暹罗', '시암', 'सियाम', 'сиам'] },
  { en: 'Pratunam', th: 'ประตูน้ำ', lat: 13.7510, lng: 100.5410, km: 2.5, words: ['pratunam', 'ประตูน้ำ', '水门', '빠뚜남'] },
  { en: 'Samyan', th: 'สามย่าน', lat: 13.7325, lng: 100.5290, km: 2.5, words: ['samyan', 'sam yan', 'สามย่าน', '三燕'] },
  { en: 'Yaowarat', th: 'เยาวราช', lat: 13.7410, lng: 100.5090, km: 2.5, words: ['yaowarat', 'chinatown', 'เยาวราช', 'ไชน่าทาวน์', '唐人街', '耀华力', '차이나타운', '야오와랏', 'चाइनाटाउन', 'яоварат', 'чайнатаун'] },
  { en: 'Talat Noi', th: 'ตลาดน้อย', lat: 13.7330, lng: 100.5130, km: 2.5, words: ['talat noi', 'talad noi', 'ตลาดน้อย', '嗒叻仔', '딸랏노이'] },
  { en: 'Rattanakosin', th: 'รัตนโกสินทร์', lat: 13.7500, lng: 100.4930, km: 2.5, words: ['rattanakosin', 'tha tien', 'sanam chai', 'รัตนโกสินทร์', 'ท่าเตียน', 'สนามไชย', '拉达那哥欣'] },
  { en: 'Khao San', th: 'ข้าวสาร', lat: 13.7590, lng: 100.4970, km: 2.5, words: ['khao san', 'khaosan', 'ข้าวสาร', '考山路', '카오산'] },
  { en: 'Khlong Toei', th: 'คลองเตย', lat: 13.7120, lng: 100.5580, km: 2.5, words: ['khlong toei', 'klong toey', 'khlongtoei', 'คลองเตย', '空堤', '끌렁떠이'] },
  { en: 'Bang Krachao', th: 'บางกระเจ้า', lat: 13.6935, lng: 100.5653, km: 2.5, words: ['bang krachao', 'bangkrachao', 'บางกระเจ้า', '曼加超', '방끄라짜오'] },
]

const ascii = (w: string): boolean => /^[\x20-\x7e]+$/.test(w)
/** The area a search names, and the query without the area words; null when no area is named. */
export function searchArea(q: string): { area: SearchArea; rest: string } | null {
  const qq = ' ' + q.toLowerCase().replace(/\s+/g, ' ').trim() + ' '
  let best: { area: SearchArea; w: string } | null = null
  for (const area of SEARCH_AREAS) for (const w of area.words) {
    const hit = ascii(w) ? qq.includes(' ' + w + ' ') : qq.includes(w)
    if (hit && (!best || w.length > best.w.length)) best = { area, w }
  }
  if (!best) return null
  const rest = (ascii(best.w) ? qq.replace(' ' + best.w + ' ', ' ') : qq.replace(best.w, ' ')).replace(/\s+/g, ' ').trim()
  return { area: best.area, rest }
}

const kmBetween = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}
/** Distance in km from an area's centre to the activity's meeting point, or null when Kring has no coordinates for it. */
export function kmFromArea(a: Act, area: SearchArea): number | null {
  const ll = PLACE_LL[meetKey(a)]
  return ll ? kmBetween(area.lat, area.lng, ll[0], ll[1]) : null
}
/** The area's name in the viewer's language (Thai for Thai viewers, the English name otherwise). */
export const areaLabel = (area: SearchArea): string => (S.lang === 'th' ? area.th : area.en)
