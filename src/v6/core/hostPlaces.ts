/* Meeting places a host can pick when creating an activity (all open public places), plus Kring partner
   cafés / venues. Names are the ones guests see on the activity, so each has a Thai and an English name.
   No hotels, rooms, homes, condos or temple interiors. A pier next to a temple is a meeting landmark only. */
import { TREAT_THE_TABLE_VENUES } from './ticketsAndRails'
import type { VenueTerms } from './venueBands'

export type HostPlaceKind = 'station' | 'park' | 'mall' | 'market' | 'pier' | 'arts' | 'campus' | 'street' | 'landmark' | 'venue'
export interface HostPlace { id: string; th: string; en: string; area: string; areaTh: string; kind: HostPlaceKind }

/** Public meeting places across Bangkok and Pattaya (Thai + English names). */
export const HOST_PLACES: HostPlace[] = [
  // Yaowarat / Chinatown / Talat Noi
  { id: 'mrt-wat-mangkon-1', th: 'MRT วัดมังกร ทางออก 1', en: 'MRT Wat Mangkon, exit 1', area: 'Yaowarat · Chinatown', areaTh: 'เยาวราช', kind: 'station' },
  { id: 'odeon-circle', th: 'ซุ้มประตูเฉลิมพระเกียรติ วงเวียนโอเดียน', en: 'Chinatown Gate, Odeon Circle', area: 'Yaowarat · Chinatown', areaTh: 'เยาวราช', kind: 'landmark' },
  { id: 'mrt-hua-lamphong-1', th: 'MRT หัวลำโพง ทางออก 1', en: 'MRT Hua Lamphong, exit 1', area: 'Yaowarat · Chinatown', areaTh: 'เยาวราช', kind: 'station' },
  { id: 'talat-noi-river-city', th: 'ริเวอร์ซิตี้ แบงค็อก ทางเข้าหลัก (ตลาดน้อย)', en: 'River City Bangkok, main entrance (Talat Noi)', area: 'Talat Noi', areaTh: 'ตลาดน้อย', kind: 'arts' },
  // Samyan / Chula / Banthat Thong
  { id: 'samyan-mitrtown', th: 'สามย่านมิตรทาวน์ ทางเข้าหลัก', en: 'Samyan Mitrtown, main entrance', area: 'Samyan', areaTh: 'สามย่าน', kind: 'mall' },
  { id: 'mrt-sam-yan-2', th: 'MRT สามย่าน ทางออก 2', en: 'MRT Sam Yan, exit 2', area: 'Samyan', areaTh: 'สามย่าน', kind: 'station' },
  { id: 'chamchuri-square', th: 'จามจุรีสแควร์ ชั้น G', en: 'Chamchuri Square, ground floor', area: 'Samyan', areaTh: 'สามย่าน', kind: 'mall' },
  { id: 'chula-centenary-park', th: 'สวนจุฬา 100 ปี (บรรทัดทอง)', en: 'Chula Centenary Park (Banthat Thong)', area: 'Chula · Banthat Thong', areaTh: 'จุฬาฯ · บรรทัดทอง', kind: 'park' },
  { id: 'chula-sala-phra-kieo', th: 'จุฬาลงกรณ์มหาวิทยาลัย หน้าศาลาพระเกี้ยว', en: 'Chulalongkorn University, Sala Phra Kieo', area: 'Chula · Banthat Thong', areaTh: 'จุฬาฯ · บรรทัดทอง', kind: 'campus' },
  // Siam / Pathum Wan
  { id: 'bacc', th: 'หอศิลปวัฒนธรรมแห่งกรุงเทพมหานคร (BACC)', en: 'Bangkok Art & Culture Centre (BACC)', area: 'Siam', areaTh: 'สยาม', kind: 'arts' },
  { id: 'siam-paragon', th: 'สยามพารากอน ทางเข้าหลัก (BTS สยาม)', en: 'Siam Paragon, main entrance (BTS Siam)', area: 'Siam', areaTh: 'สยาม', kind: 'mall' },
  { id: 'lido-connect', th: 'ลิโด้ คอนเนคท์ สยามสแควร์', en: 'Lido Connect, Siam Square', area: 'Siam', areaTh: 'สยาม', kind: 'arts' },
  { id: 'mbk-center', th: 'เอ็ม บี เค เซ็นเตอร์ ทางเชื่อม BTS สนามกีฬาแห่งชาติ', en: 'MBK Center, BTS National Stadium skywalk', area: 'Siam', areaTh: 'สยาม', kind: 'mall' },
  // Ari / north
  { id: 'bts-ari-3', th: 'BTS อารีย์ ทางออก 3', en: 'BTS Ari, exit 3', area: 'Ari', areaTh: 'อารีย์', kind: 'station' },
  { id: 'la-villa-ari', th: 'ลา วิลล่า อารีย์', en: 'La Villa Ari', area: 'Ari', areaTh: 'อารีย์', kind: 'mall' },
  { id: 'victory-monument', th: 'อนุสาวรีย์ชัยสมรภูมิ (ทางเชื่อม BTS)', en: 'Victory Monument (BTS skywalk)', area: 'Victory Monument', areaTh: 'อนุสาวรีย์ชัยฯ', kind: 'landmark' },
  { id: 'chatuchak-gate-1', th: 'ตลาดนัดจตุจักร ประตู 1', en: 'Chatuchak Weekend Market, gate 1', area: 'Chatuchak', areaTh: 'จตุจักร', kind: 'market' },
  { id: 'mrt-kamphaeng-phet-2', th: 'MRT กำแพงเพชร ทางออก 2', en: 'MRT Kamphaeng Phet, exit 2', area: 'Chatuchak', areaTh: 'จตุจักร', kind: 'station' },
  { id: 'or-tor-kor', th: 'ตลาด อ.ต.ก.', en: 'Or Tor Kor Market', area: 'Chatuchak', areaTh: 'จตุจักร', kind: 'market' },
  // Silom / Lumpini / Bang Rak
  { id: 'bts-sala-daeng', th: 'BTS ศาลาแดง (ทางเชื่อมสีลมคอมเพล็กซ์)', en: 'BTS Sala Daeng (Silom Complex skywalk)', area: 'Silom', areaTh: 'สีลม', kind: 'station' },
  { id: 'lumpini-gate-1', th: 'สวนลุมพินี ประตู 1', en: 'Lumpini Park, gate 1', area: 'Silom · Lumpini', areaTh: 'สีลม · ลุมพินี', kind: 'park' },
  { id: 'lumpini-rama6', th: 'สวนลุมพินี ประตูพระบรมราชานุสาวรีย์ ร.6', en: 'Lumpini Park, King Rama VI statue gate', area: 'Silom · Lumpini', areaTh: 'สีลม · ลุมพินี', kind: 'park' },
  { id: 'grand-postal-tcdc', th: 'อาคารไปรษณีย์กลาง บางรัก (TCDC)', en: 'Grand Postal Building, Bang Rak (TCDC)', area: 'Charoen Krung', areaTh: 'เจริญกรุง', kind: 'arts' },
  { id: 'warehouse-30', th: 'วาเรเฮ้าส์ 30 เจริญกรุง', en: 'Warehouse 30, Charoen Krung', area: 'Charoen Krung', areaTh: 'เจริญกรุง', kind: 'arts' },
  // Sukhumvit
  { id: 'terminal-21-asok', th: 'เทอร์มินอล 21 อโศก ทางเข้าหลัก', en: 'Terminal 21 Asok, main entrance', area: 'Asok', areaTh: 'อโศก', kind: 'mall' },
  { id: 'benjakitti-park', th: 'สวนป่าเบญจกิติ ประตูถนนรัชดาภิเษก', en: 'Benjakitti Forest Park, Ratchadaphisek gate', area: 'Asok', areaTh: 'อโศก', kind: 'park' },
  { id: 'benchasiri-park', th: 'สวนเบญจสิริ (BTS พร้อมพงษ์)', en: 'Benchasiri Park (BTS Phrom Phong)', area: 'Phrom Phong', areaTh: 'พร้อมพงษ์', kind: 'park' },
  { id: 'bts-thong-lo-3', th: 'BTS ทองหล่อ ทางออก 3', en: 'BTS Thong Lo, exit 3', area: 'Thonglor', areaTh: 'ทองหล่อ', kind: 'station' },
  { id: 'the-commons-thonglor', th: 'เดอะ คอมมอนส์ ทองหล่อ ซอย 17', en: 'The Commons, Thonglor Soi 17', area: 'Thonglor', areaTh: 'ทองหล่อ', kind: 'mall' },
  { id: 'jodd-fairs-rama9', th: 'จ๊อดแฟร์ พระราม 9 ทางเข้าหลัก', en: 'Jodd Fairs Rama 9, main arch', area: 'Rama 9', areaTh: 'พระราม 9', kind: 'market' },
  // Old town / river
  { id: 'mrt-sanam-chai-1', th: 'MRT สนามไชย ทางออก 1', en: 'MRT Sanam Chai, exit 1', area: 'Old Town', areaTh: 'เมืองเก่า', kind: 'station' },
  { id: 'tha-tien-pier', th: 'ท่าเรือท่าเตียน', en: 'Tha Tien Pier', area: 'Old Town', areaTh: 'เมืองเก่า', kind: 'pier' },
  { id: 'pak-khlong-talat', th: 'ปากคลองตลาด (ตลาดดอกไม้)', en: 'Pak Khlong Talat flower market', area: 'Old Town', areaTh: 'เมืองเก่า', kind: 'market' },
  { id: 'santichaiprakan-park', th: 'สวนสันติชัยปราการ (ป้อมพระสุเมรุ)', en: 'Santichaiprakan Park (Phra Sumen Fort)', area: 'Banglamphu', areaTh: 'บางลำพู', kind: 'park' },
  { id: 'khao-san-chakrabongse', th: 'ถนนข้าวสาร ฝั่งถนนจักรพงษ์', en: 'Khao San Road, Chakrabongse Road end', area: 'Banglamphu', areaTh: 'บางลำพู', kind: 'street' },
  { id: 'iconsiam-pier-1', th: 'ริเวอร์พาร์ค ไอคอนสยาม ท่าที่ 1', en: 'ICONSIAM River Park, pier 1', area: 'Khlong San', areaTh: 'คลองสาน', kind: 'pier' },
  { id: 'sathorn-pier', th: 'ท่าเรือสาทร (BTS สะพานตากสิน ทางออก 2)', en: 'Sathorn Pier (BTS Saphan Taksin, exit 2)', area: 'Sathorn', areaTh: 'สาทร', kind: 'pier' },
  // Pattaya
  { id: 'central-pattaya-beach', th: 'เซ็นทรัล พัทยา ฝั่งถนนเลียบหาด', en: 'Central Pattaya, Beach Road side', area: 'Pattaya', areaTh: 'พัทยา', kind: 'mall' },
  { id: 'terminal-21-pattaya', th: 'เทอร์มินอล 21 พัทยา ทางเข้าหลัก', en: 'Terminal 21 Pattaya, main entrance', area: 'Pattaya', areaTh: 'พัทยา', kind: 'mall' },
  { id: 'bali-hai-pier', th: 'ท่าเรือแหลมบาลีฮาย', en: 'Bali Hai Pier', area: 'Pattaya', areaTh: 'พัทยา', kind: 'pier' },
]

/** Kring partner cafés and venues the counter screen knows (locked band terms; server recomputes). */
export interface MeetingPlacePreset {
  id: string
  slug: string
  nameEn: string
  nameTh: string
  districtEn: string
  districtTh: string
  avgTicketThb: number
  /** locked 29 Oct venue band terms (server recomputes on insert) */
  terms: VenueTerms
}
export const MEETING_PLACE_PRESETS: MeetingPlacePreset[] = [
  { id: '00000000-0000-0000-0000-000000001411', slug: 'ari-garden-roasters', nameEn: 'Ari Garden Roasters', nameTh: 'อารีย์ การ์เด้น โรสเตอร์', districtEn: 'Ari · Bangkok', districtTh: 'อารีย์ · กรุงเทพฯ', avgTicketThb: 270, terms: { band: 1, band1: { discountThb: 200, minBillThb: 600 } } },
  { id: '00000000-0000-0000-0000-000000001412', slug: 'talad-noi-river-bistro', nameEn: 'Talad Noi River Bistro', nameTh: 'ตลาดน้อย ริเวอร์ บิสโทร', districtEn: 'Talad Noi · Bangkok', districtTh: 'ตลาดน้อย · กรุงเทพฯ', avgTicketThb: 400, terms: { band: 2 } },
  { id: '00000000-0000-0000-0000-000000001413', slug: 'tha-tien-courtyard-cafe', nameEn: 'Tha Tien Courtyard Café', nameTh: 'ท่าเตียน คอร์ทยาร์ด คาเฟ่', districtEn: 'Old Town · Bangkok', districtTh: 'เมืองเก่า · กรุงเทพฯ', avgTicketThb: 340, terms: { band: 1, band1: { discountThb: 250, minBillThb: 800 } } },
]

/** Partner cafés / venues a host can pick as the meeting place (board-game cafés, coffee bars, bistros). */
export const PARTNER_VENUES: HostPlace[] = [
  ...MEETING_PLACE_PRESETS.map((p): HostPlace => ({ id: 'v-' + p.slug, th: p.nameTh, en: p.nameEn, area: p.districtEn.split(' · ')[0], areaTh: p.districtTh.split(' · ')[0], kind: 'venue' })),
  ...TREAT_THE_TABLE_VENUES.map((v): HostPlace => ({ id: 'v-' + v.venueId, th: v.nameTh, en: v.nameEn, area: v.district, areaTh: v.district, kind: 'venue' })),
]

/** Search places by Thai or English name or area (case-insensitive). */
export function searchHostPlaces(list: HostPlace[], q: string): HostPlace[] {
  const s = q.trim().toLowerCase()
  if (!s) return list
  return list.filter((p) => [p.th, p.en, p.area, p.areaTh].some((x) => x.toLowerCase().includes(s)))
}
