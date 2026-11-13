import { afterEach, describe, expect, it } from 'vitest'
import { S, type Booking } from './store'
import { icsBkk, icsText, launchFreeFor, launchUsedNow, cancelBooking, ACTS, CUR_CHOICES } from './data'
import { isLaunchTicketEligible, isTempleGuidingDesc, launchTicketComesBack, launchTicketUsed } from './ticketsAndRails'
import { maskAppIds } from './guard'

// Node reads TZ again whenever it changes, so each case runs as a phone in that timezone
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
const TZ0 = env.TZ
afterEach(() => { env.TZ = TZ0 })

const bk = (over: Partial<Booking> = {}): Booking => ({ kind: 'act', act: 'cook', date: new Date(2026, 10, 20, 12), time: '13:00', guests: 1, amt: 299, status: 'confirmed', ref: 'KR-123456', ...over })
const line = (ics: string, k: string): string => ics.split('\r\n').find((l) => l.startsWith(k)) || ''

describe('.ics calendar file: Bangkok time, whatever the phone timezone', () => {
  for (const tz of ['Europe/London', 'Asia/Tokyo', 'America/Toronto', 'Asia/Bangkok', 'Pacific/Auckland']) {
    it(`13:00 class booked from ${tz} stays 13:00-16:00 Bangkok time`, () => {
      env.TZ = tz
      // the day the guest picked in the app (local midnight-ish of that phone), at 13:00 Bangkok
      const day = new Date(2026, 10, 20, 12, 0, 0)
      const ics = icsText(bk({ date: day }), 'Silom kitchen', 'note', new Date(Date.UTC(2026, 9, 30, 10)))
      expect(line(ics, 'DTSTART;')).toBe('DTSTART;TZID=Asia/Bangkok:20261120T130000')
      expect(line(ics, 'DTEND;')).toBe('DTEND;TZID=Asia/Bangkok:20261120T160000') // cook class is 3 h
      expect(ics).toContain('BEGIN:VTIMEZONE\r\nTZID:Asia/Bangkok')
      expect(ics).toContain('TZOFFSETTO:+0700')
      expect(line(ics, 'DTSTAMP')).toBe('DTSTAMP:20261030T100000Z')
    })
  }
  it('an evening activity that runs past midnight ends on the next day', () => {
    expect(icsBkk(new Date(2026, 10, 30, 12), '22:30', 150)).toBe('20261201T010000')
  })
})

describe('Zone-1 free launch ticket', () => {
  const cafe = ACTS.find((a) => a.id === 'cafe')! // Ari = Zone 1
  const reset = () => { S.bookings = []; S.prof = { ...S.prof, usedLaunchTicket: false, passPaidAt: undefined, passUntil: null } }
  const now = new Date('2026-11-10T12:00:00+07:00')

  it('is for Zone-1 areas only, until the end of November', () => {
    expect(isLaunchTicketEligible({ area: 'BTS Ari|exit|3', now })).toBe(true)
    expect(isLaunchTicketEligible({ area: 'Marine Dept.|pier', now })).toBe(false)
    expect(isLaunchTicketEligible({ area: 'BTS Ari|exit|3', now: new Date('2026-12-01T00:30:00+07:00') })).toBe(false)
  })

  it('a ticket paid in another zone does not spend it (one free ticket per account, used only by a booking that took it)', () => {
    reset()
    S.bookings = [bk({ act: 'oldtown', paid_kind: 'ticket', amt: 199 }), bk({ act: 'eat', paid_kind: 'ticket', amt: 199 })]
    expect(launchTicketUsed(S.bookings)).toBe(false)
    expect(launchUsedNow()).toBe(false)
    if (Date.now() <= Date.parse('2026-11-30T23:59:59+07:00')) expect(launchFreeFor(cafe)).toBe(true)
  })

  it('a booking that used it spends it', () => {
    reset()
    S.bookings = [bk({ act: 'cafe', paid_kind: 'launch', amt: 0, status: 'confirmed' })]
    expect(launchUsedNow()).toBe(true)
    expect(launchFreeFor(cafe)).toBe(false)
  })

  it('cancelling a pending free-ticket booking before the host replies gives the free ticket back', () => {
    reset()
    const b = bk({ act: 'cafe', paid_kind: 'launch', amt: 0, status: 'pending' })
    S.bookings = [b]
    S.prof.usedLaunchTicket = true
    expect(launchTicketComesBack(b)).toBe(true)
    expect(cancelBooking(b, 0)).toBe(true)
    expect(b.status).toBe('cancelled')
    expect(b.launch_back).toBe(true)
    expect(S.prof.usedLaunchTicket).toBe(false)
    expect(launchUsedNow()).toBe(false)
  })

  it('after the host confirmed, cancelling keeps the free ticket used', () => {
    reset()
    const b = bk({ act: 'cafe', paid_kind: 'launch', amt: 0, status: 'confirmed' })
    S.bookings = [b]
    S.prof.usedLaunchTicket = true
    expect(cancelBooking(b, 0)).toBe(false)
    expect(launchUsedNow()).toBe(true)
  })
})

describe('host description: no temple / history guiding', () => {
  it('blocks guiding phrases', () => {
    for (const d of ['I give a temple tour of the old town', 'History walk around Rattanakosin', 'I will guide you inside the Grand Palace', 'Wat Pho history and stories', 'พาชมวัดและเล่าประวัติ', 'นำเที่ยววัดอรุณ'])
      expect(isTempleGuidingDesc(d), d).toBe(true)
  })
  it('allows a landmark as a meeting point or a view', () => {
    for (const d of ['We meet at Tha Tien pier, with a view of Wat Arun at sunset', 'Street food near Wat Pho, then mango sticky rice', 'เดินกินแถวท่าเตียน'])
      expect(isTempleGuidingDesc(d), d).toBe(false)
  })
})

describe('small R6 fixes', () => {
  it('NT$ is in the currency picker', () => {
    expect(CUR_CHOICES.some(([c, s]) => c === 'TW' && s === 'NT$')).toBe(true)
  })
  it('bare plain-letter handles after a short app name are masked', () => {
    expect(maskAppIds('ig pimwrites')).not.toContain('pimwrites')
    expect(maskAppIds('ไอจี pimwrites')).not.toContain('pimwrites')
    expect(maskAppIds('my line nichabkk.')).not.toContain('nichabkk')
    expect(maskAppIds('I will check ig later today')).toBe('I will check ig later today')
    expect(maskAppIds('Line up at gate 2 please')).toBe('Line up at gate 2 please')
  })
})
