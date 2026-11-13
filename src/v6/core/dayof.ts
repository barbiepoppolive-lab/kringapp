/* Day-of helpers (check-in, on the way, bump, rate, safety): always talk about the user's ACTUAL booking,
   never the activity they happen to be browsing. */
import { S, type Booking } from './store'
import { ACTS, act, hostName, bTime, aTitle, atTime, endT, dayFmt, t, bkMoney, type Act } from './data'
import { TREAT_THE_TABLE_VENUES, type TreatTheTableVenue } from './ticketsAndRails'
import { meetMapsUrl, meetAddress, meetAddressTh, meetHint, meetName, meetNameTh } from './places'

export { meetMapsUrl, meetAddress, meetAddressTh, meetHint, meetName, meetNameTh }

export interface DayOf {
  b: Booking | null
  a: Act
  host: string
  time: string
  place: string
  /** what the guest pays the host at the meeting place (0 for a volunteer host) */
  payHost: number
  /** stable for one booking: KR-123456 */
  ref: string
  /** where to meet, in the viewer's language (the booking's agreed place when there is one) */
  meet: string
  /** the same place in Thai, to show a taxi or Grab driver (empty when it would repeat `meet`) */
  meetTh: string
  /** area of the city, e.g. "Yaowarat, Bangkok" */
  area: string
  /** street / landmark line in the viewer's language ('' when Kring has none) */
  addr: string
  /** the Thai street line for a taxi or Grab driver ('' when Kring has none) */
  addrTh: string
  /** what to look for on arrival (exit sign, pier, gate, or "the host walks you to the kitchen") */
  hint: string
  /** Google Maps link that finds the exact spot (coordinates, or place + exit/pier/gate + street), never just the area */
  maps: string
  /** planned end of the activity, "HH:MM" */
  end: string
  /** the host has not confirmed the booking yet */
  pending: boolean
}

/** When the activity is planned to end (start + duration). */
export function dayEnd(b: Booking | null, a: Act): Date | null {
  if (!b) return null
  const s = atTime(b.date, b.time || '09:00')
  return new Date(s.getTime() + (a.h || 0) * 36e5)
}

/** Rating opens only once the activity is over (planned end passed) or the booking is already finished. */
export function activityEnded(b: Booking | null, a: Act, now = Date.now()): boolean {
  if (!b) return false
  if (b.done) return true
  const e = dayEnd(b, a)
  return !!e && now >= e.getTime()
}

/** The booking the day-of screens are about: the open activity booking for the current activity if there is one,
    otherwise the next open activity booking, otherwise the most recent activity booking. */
export function dayBooking(): Booking | null {
  const acts = S.bookings.filter((b) => b.kind === 'act' && b.status !== 'cancelled')
  return acts.find((b) => b.act === S.act && !b.done) || acts.find((b) => !b.done) || acts[0] || null
}

/** Small stable hash -> 6 digits. */
function six(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return String(100000 + ((h >>> 0) % 900000))
}

export function bookingRef(b: Booking | null, a: Act): string {
  // one ref everywhere: the one stored on the booking when it was made (#held, Trips, receipt, check-in, host)
  if (b?.ref) return b.ref
  const day = b ? new Date(b.date).toISOString().slice(0, 10) : new Date(S.dayDate || Date.now()).toISOString().slice(0, 10)
  return 'KR-' + six(`${a.id}|${day}|${b?.time || ''}`)
}

/** The 6-digit code the host's phone shows for this booking (preview mode stands in for the server). */
export function hostCode(ref: string): string { return six('host|' + ref) }

export function dayOf(): DayOf {
  const b = dayBooking()
  const a = (b && ACTS.find((x) => x.id === b.act)) || act()
  const vol = !!a.isVolunteer || a.price === 0
  return {
    b,
    a,
    host: hostName(a),
    time: b?.time || bTime(),
    place: meetName(a, b),
    payHost: vol ? 0 : b ? bkMoney(b).host : Math.max(200, a.price),
    ref: bookingRef(b, a),
    meet: meetName(a, b),
    meetTh: S.lang === 'th' || meetNameTh(a, b) === meetName(a, b) ? '' : meetNameTh(a, b),
    area: (a.liveArea ? a.liveArea + ', ' : '') + 'Bangkok',
    addr: meetAddress(a, b),
    addrTh: S.lang === 'th' ? '' : meetAddressTh(a, b),
    hint: meetHint(a, b),
    maps: meetMapsUrl(a, b),
    end: endT(b?.time || bTime(), a.h),
    pending: !!b && b.status === 'pending',
  }
}

/** Plain-text trip summary the guest sends to their emergency contact (from their own messages app). */
export function tripText(d: DayOf, here?: { lat: number; lng: number } | null): string {
  const day = d.b ? dayFmt(d.b.date, { weekday: 'short', day: 'numeric', month: 'short' }) : ''
  const lines = [
    t('tripMsg', { act: aTitle(d.a), host: d.host, place: d.meet, day, time: d.time + '–' + d.end, ref: d.ref }),
    ...(d.addr ? [d.addr] : []),
    d.maps,
  ]
  if (here) lines.push(t('tripMsgHere') + ' https://www.google.com/maps/search/?api=1&query=' + here.lat.toFixed(5) + ',' + here.lng.toFixed(5))
  return lines.join('\n')
}

/** sms: link to one number with the text filled in (works on iOS and Android). */
export function smsTo(phone: string, body: string): string {
  return 'sms:' + phone.replace(/[^\d+]/g, '') + '?&body=' + encodeURIComponent(body)
}

/** The venue voucher the guest actually bought with this booking, or null. */
export function boughtVoucher(b: Booking | null): { code: string; venue: TreatTheTableVenue | null } | null {
  if (!b || !b.voucher_code) return null
  if (!b.voucher_status || b.voucher_status === 'cancelled') return null
  return { code: b.voucher_code, venue: TREAT_THE_TABLE_VENUES.find((v) => v.defaultCode === b.voucher_code) || null }
}

/** The 6-digit code this guest reads to the host, stable for the booking. */
export function guestCode(ref: string): string { return six('guest|' + ref) }

/** The id the kr6_* RPCs need for this booking: the server id when the booking has one (live), else the activity id
    (preview builds, where the RPCs resolve locally and ignore it). */
export function rpcBookingId(b: Booking | null): string { return b?.id || S.act }

/** One GPS position for check-in (null when the guest says no, there is no GPS, or it takes longer than 8 s). */
export function herePosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((res) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) { res(null); return }
    let done = false
    const fin = (v: { lat: number; lng: number } | null) => { if (!done) { done = true; res(v) } }
    setTimeout(() => fin(null), 9000)
    try {
      navigator.geolocation.getCurrentPosition(
        (p) => fin({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => fin(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      )
    } catch { fin(null) }
  })
}
