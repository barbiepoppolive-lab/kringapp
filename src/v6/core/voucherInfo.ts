/* Where each voucher is used (area E): the venue's name, address (EN + TH) and opening hours, so a guest knows where
   to take the code. Demo placeholders like the tour partners in tourInfo.ts: replace with the real signed venue
   (name, branch address, hours) before launch. The map link is a plain Google Maps search for that address. */
import { S } from './store'

export interface VoucherVenue { name: string; addr: string; addrTh: string; open: string; close: string; mapQ: string }
export const VOUCHER_VENUE: Record<string, VoucherVenue> = {
  v1: { name: 'SkyLink SIM & Travel desk', addr: 'Suvarnabhumi Airport, Arrivals hall (level 2), near Gate 7', addrTh: 'สนามบินสุวรรณภูมิ ชั้น 2 ผู้โดยสารขาเข้า ใกล้ประตู 7', open: '06:00', close: '24:00', mapQ: 'Suvarnabhumi Airport Arrivals Gate 7' },
  v2: { name: 'CityRide Airport Transfers desk', addr: 'Suvarnabhumi Airport, level 1, Gate 4 (public taxi level)', addrTh: 'สนามบินสุวรรณภูมิ ชั้น 1 ประตู 4', open: '00:00', close: '24:00', mapQ: 'Suvarnabhumi Airport Level 1 Gate 4' },
  v3: { name: 'Baan Cha Yen Café', addr: 'Soi Phahon Yothin 7 (Soi Ari 1), Phaya Thai, Bangkok · 3 min from BTS Ari exit 3', addrTh: 'ซอยพหลโยธิน 7 (อารีย์ 1) พญาไท กรุงเทพฯ · เดิน 3 นาทีจาก BTS อารีย์ ทางออก 3', open: '10:00', close: '20:00', mapQ: 'Soi Ari 1 Phahon Yothin 7 Bangkok' },
  v4: { name: 'BagHop luggage desk', addr: 'Suvarnabhumi Airport, Arrivals hall (level 2), near Gate 3', addrTh: 'สนามบินสุวรรณภูมิ ชั้น 2 ผู้โดยสารขาเข้า ใกล้ประตู 3', open: '07:00', close: '22:00', mapQ: 'Suvarnabhumi Airport Arrivals Gate 3' },
  v5: { name: 'Silver Screen Cinema counter', addr: 'Samyan Mitrtown, 5th floor, Rama IV Road, Bangkok · MRT Sam Yan exit 2', addrTh: 'สามย่านมิตรทาวน์ ชั้น 5 ถนนพระราม 4 กรุงเทพฯ · MRT สามย่าน ทางออก 2', open: '10:00', close: '23:00', mapQ: 'Samyan Mitrtown Bangkok' },
}
export const venueOf = (k: string): VoucherVenue | null => VOUCHER_VENUE[k] || null
export const venueAddr = (v: VoucherVenue): string => (S.lang === 'th' ? v.addrTh : v.addr)
export const venueAllDay = (v: VoucherVenue): boolean => v.open === '00:00' && v.close === '24:00'
export const mapsUrl = (v: VoucherVenue): string => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(v.mapQ)

/** A random voucher code seed (never a counter: codes must not be guessable). */
export function randomSeed(): number {
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); if (a[0] > 1e6) return a[0] } catch { /* ignore */ }
  return 1e6 + Math.floor(Math.random() * 4e9)
}
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** "KRING-TEA" + 6 characters drawn from the random seed (xorshift), so neighbouring seeds give unrelated codes. */
export function codeFrom(base: string, seed: number): string {
  let h = (seed ^ 0x9e3779b9) >>> 0 || 1
  let out = ''
  for (let i = 0; i < 6; i++) { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; out += ABC[h % ABC.length] }
  return base.split('-').slice(0, 2).join('-') + '-' + out
}
