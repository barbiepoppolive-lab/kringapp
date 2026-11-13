/* A-13 + D-054 · Google Maps Public Meeting-Place Picker Filter, 100m Check-In Radius & 20-Place Bangkok Fixture
   Allowlist: cafe, bakery, restaurant, park, tourist_attraction, museum, art_gallery, place_of_worship,
   shopping_mall, market, grocery_store, train_station, subway_station, transit_station, pier, ferry_terminal,
   gym, library, university, stadium, aquarium, zoo, amusement_park, night_market.
   Hard Blocklist: lodging, hotel, motel, hostel, resort_hotel, guest_house, apartment_complex, condominium,
   any name matching /condo|residence|apartment|hotel|hostel|resort|villa|room/i, bar/night_club without restaurant, spa/massage.
   D-054 Guardrail: Wat Pho / Grand Palace / Wat Arun interiors are strictly blocked as guided activity venues;
   allowed only as exterior meeting-point landmarks with a visible "Meeting point only — no historical/temple guiding on Kring" note. */

export const MAX_BUMP_METERS = 100

const TEMPLE_GUIDING_BLOCK_REGEX =
  /\b(wat\s*pho|wat\s*arun|grand\s*palace|wat\s*phra\s*kaew|emerald\s*buddha|temple\s*tour|temple\s*guide|historical\s*guide|palace\s*tour|ayutthaya\s*ruins|วัดโพธิ์|วัดอรุณ|พระบรมมหาราชวัง|วัดพระแก้ว|ไกด์นำเที่ยววัด)\b/i

function isTempleGuidingBlocked(text: string): boolean {
  return TEMPLE_GUIDING_BLOCK_REGEX.test(String(text || ''))
}

export const TEMPLE_MEETING_POINT_NOTE_EN = 'Meeting point only — no historical/temple guiding on Kring'
export const TEMPLE_MEETING_POINT_NOTE_TH = 'ใช้เป็นจุดนัดพบเท่านั้น — กริ๊งไม่อนุญาตให้นำเที่ยวหรือบรรยายประวัติศาสตร์ในวัด/วัง'

export interface CandidatePlace {
  place_id: string
  name: string
  nameTh?: string
  district: string
  types: string[]
  lat: number
  lng: number
  hours: string
  landmarkOnlyNoGuiding?: boolean
  noGuidingNoteEn?: string
  noGuidingNoteTh?: string
}

export const ALLOWED_PLACE_TYPES = new Set([
  'cafe',
  'bakery',
  'restaurant',
  'park',
  'tourist_attraction',
  'museum',
  'art_gallery',
  'place_of_worship',
  'shopping_mall',
  'market',
  'grocery_store',
  'train_station',
  'subway_station',
  'transit_station',
  'pier',
  'ferry_terminal',
  'gym',
  'library',
  'university',
  'stadium',
  'aquarium',
  'zoo',
  'amusement_park',
  'night_market',
])

export const BLOCKED_PLACE_TYPES = new Set([
  'lodging',
  'hotel',
  'motel',
  'hostel',
  'resort_hotel',
  'guest_house',
  'apartment_complex',
  'condominium',
  'spa',
  'massage',
])

export const BLOCKED_NAME_RE = /\b(condo|condominium|residence|apartment|hotel|hostel|resort|villa|room|massage|spa)\b/i

export const TEMPLE_INTERIOR_GUIDING_RE =
  /\b(wat\s*pho\s*interior|grand\s*palace\s*interior|wat\s*arun\s*interior|emerald\s*buddha\s*hall|guided\s*temple\s*tour)\b/i

export function isTempleLandmarkPlace(place: Pick<CandidatePlace, 'name' | 'nameTh' | 'types'>): boolean {
  const txt = `${place.name} ${place.nameTh || ''}`
  return place.types.includes('place_of_worship') || isTempleGuidingBlocked(txt)
}

/** D-054: Check whether a place can be used as a guided activity venue (Wat Pho / Grand Palace / Wat Arun blocked). */
export function isActivityVenueAllowed(placeOrName: CandidatePlace | string): { allowed: boolean; reason?: string } {
  const name = typeof placeOrName === 'string' ? placeOrName : `${placeOrName.name} ${placeOrName.nameTh || ''}`
  if (isTempleGuidingBlocked(name)) {
    return { allowed: false, reason: 'temple_historical_guiding_blocked_d054' }
  }
  if (typeof placeOrName !== 'string') {
    return isPublicMeetingPlaceAllowed(placeOrName)
  }
  if (BLOCKED_NAME_RE.test(name)) {
    return { allowed: false, reason: 'blocked_name_pattern' }
  }
  return { allowed: true }
}

export function isPublicMeetingPlaceAllowed(place: CandidatePlace): {
  allowed: boolean
  reason?: string
  landmarkOnlyNoGuiding?: boolean
  noteEn?: string
  noteTh?: string
} {
  if (BLOCKED_NAME_RE.test(place.name)) {
    return { allowed: false, reason: 'blocked_name_pattern' }
  }
  if (TEMPLE_INTERIOR_GUIDING_RE.test(place.name)) {
    return { allowed: false, reason: 'temple_interior_guiding_blocked' }
  }
  for (const t of place.types) {
    if (BLOCKED_PLACE_TYPES.has(t)) {
      return { allowed: false, reason: `blocked_type:${t}` }
    }
  }
  const hasBarOrClub = place.types.includes('bar') || place.types.includes('night_club')
  const hasRestaurant = place.types.includes('restaurant')
  if (hasBarOrClub && !hasRestaurant) {
    return { allowed: false, reason: 'bar_or_nightclub_without_restaurant' }
  }
  const hasAllowedType = place.types.some((t) => ALLOWED_PLACE_TYPES.has(t))
  if (!hasAllowedType) {
    return { allowed: false, reason: 'no_allowed_public_type' }
  }
  const landmarkOnly = isTempleLandmarkPlace(place)
  return {
    allowed: true,
    landmarkOnlyNoGuiding: landmarkOnly,
    noteEn: landmarkOnly ? TEMPLE_MEETING_POINT_NOTE_EN : undefined,
    noteTh: landmarkOnly ? TEMPLE_MEETING_POINT_NOTE_TH : undefined,
  }
}

/** 20 Bangkok Places Fixture (10 Allowed Public Places + 10 Blocked Places) per Ticket A-13 + D-054. */
export const BANGKOK_20_PLACES_FIXTURE: CandidatePlace[] = [
  // 10 ALLOWED PUBLIC PLACES
  { place_id: 'ChIJ_wat_mangkon_mrt', name: 'Wat Mangkon MRT Exit 1', nameTh: 'MRT วัดมังกร ทางออก 1', district: 'Yaowarat', types: ['subway_station', 'transit_station'], lat: 13.7422, lng: 100.5096, hours: '06:00–24:00' },
  { place_id: 'ChIJ_sarnies_bkk', name: 'Sarnies Roastery Charoenkrung', nameTh: 'ซาร์นีส์ เจริญกรุง 44', district: 'Charoenkrung', types: ['cafe', 'bakery', 'restaurant'], lat: 13.7219, lng: 100.5147, hours: '08:00–22:00' },
  { place_id: 'ChIJ_lumpini_park', name: 'Lumpini Park King Rama VI Gate', nameTh: 'สวนลุมพินี ประตูพระบรมรูป ร.6', district: 'Silom', types: ['park', 'tourist_attraction'], lat: 13.7307, lng: 100.5418, hours: '04:30–22:00' },
  {
    place_id: 'ChIJ_wat_arun',
    name: 'Tha Tien Pier (Wat Arun Ferry Landmark)',
    nameTh: 'ท่าเรือท่าเตียน (จุดนัดพบข้ามฟากวัดอรุณ)',
    district: 'Phra Nakhon',
    types: ['place_of_worship', 'tourist_attraction', 'pier'],
    lat: 13.7437,
    lng: 100.4888,
    hours: '08:00–18:00',
    landmarkOnlyNoGuiding: true,
    noGuidingNoteEn: TEMPLE_MEETING_POINT_NOTE_EN,
    noGuidingNoteTh: TEMPLE_MEETING_POINT_NOTE_TH,
  },
  { place_id: 'ChIJ_bacc_siam', name: 'Bangkok Art & Culture Centre (BACC)', nameTh: 'หอศิลปวัฒนธรรมแห่งกรุงเทพมหานคร', district: 'Pathum Wan', types: ['art_gallery', 'museum'], lat: 13.7466, lng: 100.5303, hours: '10:00–20:00' },
  { place_id: 'ChIJ_iconsiam_pier', name: 'ICONSIAM River Park Pier 1', nameTh: 'ริเวอร์พาร์ค ไอคอนสยาม ท่าที่ 1', district: 'Khlong San', types: ['shopping_mall', 'pier'], lat: 13.7267, lng: 100.5109, hours: '10:00–22:00' },
  { place_id: 'ChIJ_or_tor_kor', name: 'Or Tor Kor Fresh Market', nameTh: 'ตลาด อ.ต.ก.', district: 'Chatuchak', types: ['market', 'grocery_store'], lat: 13.7975, lng: 100.5477, hours: '06:00–18:00' },
  { place_id: 'ChIJ_rsm_muay_thai', name: 'RSM Muay Thai Academy Thonglor', nameTh: 'อาร์เอสเอ็ม มวยไทย ทองหล่อ', district: 'Thonglor', types: ['gym'], lat: 13.7322, lng: 100.5824, hours: '09:00–21:00' },
  { place_id: 'ChIJ_jodd_fairs', name: 'JODD FAIRS Rama 9 Main Arch', nameTh: 'จ๊อดแฟร์ พระราม 9', district: 'Huai Khwang', types: ['night_market', 'market'], lat: 13.7568, lng: 100.5665, hours: '16:00–24:00' },
  { place_id: 'ChIJ_chula_centenary_park', name: 'Chulalongkorn University Centenary Park', nameTh: 'อุทยาน 100 ปี จุฬาลงกรณ์มหาวิทยาลัย', district: 'Pathum Wan', types: ['park', 'university'], lat: 13.7392, lng: 100.5238, hours: '05:00–22:00' },

  // 10 BLOCKED PLACES (Hotels, Condos, Hostels, Apartments, Bars without restaurant, Spas)
  { place_id: 'ChIJ_blk_hotel_1', name: 'Mandarin Oriental Hotel Lobby', district: 'Bang Rak', types: ['hotel', 'lodging', 'cafe'], lat: 13.7235, lng: 100.5142, hours: '24h' },
  { place_id: 'ChIJ_blk_condo_2', name: 'Ashton Asoke Condominium', district: 'Watthana', types: ['condominium', 'apartment_complex'], lat: 13.7378, lng: 100.5612, hours: '24h' },
  { place_id: 'ChIJ_blk_hostel_3', name: 'Lub d Bangkok Siam Hostel', district: 'Pathum Wan', types: ['hostel', 'lodging'], lat: 13.7469, lng: 100.5284, hours: '24h' },
  { place_id: 'ChIJ_blk_res_4', name: 'Park Origin Thonglor Residence', district: 'Thonglor', types: ['cafe'], lat: 13.7335, lng: 100.5831, hours: '24h' },
  { place_id: 'ChIJ_blk_apt_5', name: 'Sukhumvit Suite Service Apartment', district: 'Nana', types: ['apartment_complex', 'lodging'], lat: 13.7412, lng: 100.5559, hours: '24h' },
  { place_id: 'ChIJ_blk_resort_6', name: 'The Siam Urban Resort', district: 'Dusit', types: ['resort_hotel', 'lodging'], lat: 13.7809, lng: 100.5061, hours: '24h' },
  { place_id: 'ChIJ_blk_villa_7', name: 'Ari Pool Villa Private Room', district: 'Ari', types: ['cafe'], lat: 13.7798, lng: 100.5446, hours: '24h' },
  { place_id: 'ChIJ_blk_bar_8', name: 'Nana Midnight Club & Bar', district: 'Khlong Toei', types: ['bar', 'night_club'], lat: 13.7405, lng: 100.5532, hours: '20:00–02:00' },
  { place_id: 'ChIJ_blk_spa_9', name: 'Siam Thai Massage & Spa Parlour', district: 'Siam', types: ['spa', 'massage'], lat: 13.7455, lng: 100.5335, hours: '10:00–22:00' },
  { place_id: 'ChIJ_blk_guest_10', name: 'Khaosan Cozy Guest House', district: 'Phra Nakhon', types: ['guest_house', 'lodging'], lat: 13.7588, lng: 100.4974, hours: '24h' },
]

export function searchAllowedPublicPlaces(query = ''): {
  allowed: CandidatePlace[]
  blockedMatch: CandidatePlace | null
  templeInteriorBlocked: boolean
} {
  const q = query.trim().toLowerCase()
  const allowed: CandidatePlace[] = []
  let blockedMatch: CandidatePlace | null = null
  const templeInteriorBlocked = TEMPLE_INTERIOR_GUIDING_RE.test(q) || /wat\s*pho\s*inside|grand\s*palace\s*tour/i.test(q)

  for (const p of BANGKOK_20_PLACES_FIXTURE) {
    const matches = !q || p.name.toLowerCase().includes(q) || (p.nameTh || '').toLowerCase().includes(q) || p.district.toLowerCase().includes(q)
    if (!matches) continue
    const check = isPublicMeetingPlaceAllowed(p)
    if (check.allowed) {
      allowed.push({
        ...p,
        landmarkOnlyNoGuiding: p.landmarkOnlyNoGuiding ?? check.landmarkOnlyNoGuiding,
        noGuidingNoteEn: p.noGuidingNoteEn ?? check.noteEn,
        noGuidingNoteTh: p.noGuidingNoteTh ?? check.noteTh,
      })
    } else if (!blockedMatch && q.length >= 2) {
      blockedMatch = p
    }
  }
  return { allowed, blockedMatch, templeInteriorBlocked }
}
