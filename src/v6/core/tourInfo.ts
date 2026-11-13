/* Tour partner details (area E): who runs each tour, where it starts, which city and the real start times.
   Exposed for Deals (tour cards + booking sheet) and for Trips (area A: tourInfo(b.k) on a tour booking).
   Partner names are demo placeholders: replace with the real licensed partner (and its TAT licence) before launch. */
import { t } from './data'

/** payUrl: the partner's own checkout page. The guest pays the partner there (or at its counter); the money never goes through Kring. */
export interface TourInfo { company: string; meetKey: string; city: 'bkk' | 'pty'; times: string[]; payUrl?: string }
export const TOUR_INFO: Record<string, TourInfo> = {
  tr1: { company: 'Pattaya Bay Cruises', meetKey: 'tm_bali', city: 'pty', times: ['16:30'] },
  tr2: { company: 'Rattanakosin Morning Walks', meetKey: 'tm_tr2', city: 'bkk', times: ['08:00', '08:30'] },
  tr3: { company: 'Koh Larn Island Trips', meetKey: 'tm_bali', city: 'pty', times: ['07:30'] },
  tr4: { company: 'Ringside Bangkok', meetKey: 'tm_tr4', city: 'bkk', times: ['18:00', '19:30'] },
}
export const tourInfo = (k?: string): TourInfo | null => (k && TOUR_INFO[k]) || null
/** "By {company}" */
export const tourBy = (k?: string): string => { const x = tourInfo(k); return x ? t('tourBy', { co: x.company }) : '' }
/** "Meet: {place}, {city}" */
export const tourMeet = (k?: string): string => { const x = tourInfo(k); return x ? t('tourMeet', { p: t(x.meetKey) }) : '' }

/** Who the guest pays for a tour or package: always the partner, never Kring. */
export const payee = (k?: string): string => tourInfo(k)?.company || t('tourPartnerWord')
