import { describe, expect, it } from 'vitest'
import { S, type Booking } from './store'
import { ACTS } from './data'
import { HOST_PLACES } from './hostPlaces'
import { meetAddress, meetAddressTh, meetMapsUrl, meetName, placeAddr } from './places'

const q = (url: string): string => decodeURIComponent(url.split('query=')[1] || '')

describe('meeting place addresses', () => {
  it('every demo activity has a street line in English and Thai', () => {
    S.lang = 'en'
    for (const a of ACTS) {
      expect(meetAddress(a), a.id).not.toBe('')
      expect(meetAddressTh(a), a.id).toMatch(/[ก-๙]/)
    }
  })

  it('every host meeting place has an address', () => {
    for (const p of HOST_PLACES) expect(placeAddr(p.id), p.id).not.toBeNull()
  })

  it('Maps searches the exact exit / pier, never only the area', () => {
    const night = ACTS.find((a) => a.id === 'night')!
    expect(q(meetMapsUrl(night))).toContain('MRT Huai Khwang Exit 2')
    const cook = ACTS.find((a) => a.id === 'cook')!
    expect(q(meetMapsUrl(cook))).not.toBe('Silom, Bangkok, Thailand')
    expect(q(meetMapsUrl(cook))).toContain('Sala Daeng')
  })

  it('uses the booking coordinates when the place was agreed in chat', () => {
    const b = { kind: 'act', act: 'eat', date: new Date(), time: '18:00', guests: 1, amt: 199, status: 'confirmed', meeting_lat: 13.74, meeting_lng: 100.51, meeting_name: 'Somewhere' } as Booking
    expect(q(meetMapsUrl(ACTS[0], b))).toBe('13.74,100.51')
    expect(meetName(ACTS[0], b)).toBe('Somewhere')
  })

  it('shows the Thai line to Thai viewers', () => {
    S.lang = 'th'
    expect(meetAddress(ACTS[0])).toMatch(/[ก-๙]/)
    S.lang = 'en'
  })
})

describe('area search', () => {
  it('finds the area word, keeps the rest of the query and ignores words inside other words', async () => {
    const { searchArea } = await import('./places')
    expect(searchArea('Asok')?.area.en).toBe('Asok')
    expect(searchArea('food thong lo')).toMatchObject({ area: { en: 'Thonglor' }, rest: 'food' })
    expect(searchArea('อารีย์')?.area.en).toBe('Ari')
    expect(searchArea('safari')).toBeNull()
    expect(searchArea('iconsiam')).toBeNull()
  })
  it('every demo activity meeting point has coordinates, and nearby areas rank their own activities first', async () => {
    const { searchArea, kmFromArea } = await import('./places')
    for (const a of ACTS) expect(kmFromArea(a, searchArea('silom')!.area), a.id).not.toBeNull()
    const near = (w: string) => { const ar = searchArea(w)!.area; return ACTS.filter((a) => (kmFromArea(a, ar) ?? 99) <= ar.km).map((a) => a.id) }
    expect(near('silom')).toContain('cook')
    expect(near('ari')).toEqual(['cafe'])
    expect(near('yaowarat')).toContain('eat')
    expect(near('asok')).not.toContain('eat')
  })
})
