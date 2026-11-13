import { beforeEach, describe, expect, it } from 'vitest'
import {
  dismissStarterPack,
  nightOf,
  nightStore,
  NIGHT_STORE_EVENT,
  readDemoWallet,
  readStarterPackState,
  starterPackHidden,
  STARTER_PACK_KEY,
  writeDemoWallet,
} from './demoState'
import { hostHue, hostPlaceholderUri, hostPlaceholderVars } from './imageFallback'

beforeEach(() => window.localStorage.clear())

/** A Bangkok wall-clock time, independent of the test runner's TZ. */
const bkk = (local: string) => new Date(`${local}:00+07:00`)

describe('demoState · the night stays the night', () => {
  it('a night runs 06:00 → 06:00 Bangkok, whatever the device timezone', () => {
    expect(nightOf(bkk('2026-10-21T23:30'))).toBe('2026-10-21')
    expect(nightOf(bkk('2026-10-22T01:15'))).toBe('2026-10-21')
    expect(nightOf(bkk('2026-10-22T05:59'))).toBe('2026-10-21')
    expect(nightOf(bkk('2026-10-22T06:00'))).toBe('2026-10-22')
    expect(nightOf(bkk('2026-10-22T07:00'))).toBe('2026-10-22')
  })

  it('restores tonight’s demo wallet for the same demo user only', () => {
    const at = bkk('2026-10-21T22:00')
    writeDemoWallet('demo-traveler', { paid: 50_000, bonus: 99_700, spentToday: 300 }, at)
    expect(readDemoWallet('demo-traveler', bkk('2026-10-22T02:00'))).toEqual({ paid: 50_000, bonus: 99_700, spentToday: 300 })
    expect(readDemoWallet('someone-else', at)).toBeNull()
    // the next night starts fresh
    expect(readDemoWallet('demo-traveler', bkk('2026-10-22T19:00'))).toBeNull()
  })

  it('ignores corrupt or negative snapshots', () => {
    window.localStorage.setItem('chon_demo_night_v1', '{not json')
    expect(readDemoWallet('demo-traveler')).toBeNull()
    writeDemoWallet('demo-traveler', { paid: -1, bonus: 5, spentToday: 0 })
    expect(readDemoWallet('demo-traveler')).toBeNull()
  })
})

describe('nightStore · generic tonight-only persistence', () => {
  it('round-trips any JSON value for the same night and expires at 06:00 Bangkok', () => {
    const at = bkk('2026-10-21T21:00')
    expect(nightStore.get('plans', [] as number[], at)).toEqual([])
    nightStore.set('plans', [{ id: 'p1', held: 300 }], at)
    expect(nightStore.get('plans', [], bkk('2026-10-22T03:00'))).toEqual([{ id: 'p1', held: 300 }])
    expect(nightStore.get('plans', 'none', bkk('2026-10-22T06:30'))).toBe('none')
    // the stale entry is gone after the expired read
    expect(window.localStorage.getItem(nightStore.key('plans'))).toBeNull()
  })

  it('update / remove / clearAll, and change events fire', () => {
    const seen: string[] = []
    const on = (e: Event) => seen.push((e as CustomEvent<{ key: string }>).detail.key)
    window.addEventListener(NIGHT_STORE_EVENT, on)
    expect(nightStore.update('payouts', 0, (n) => n + 240)).toBe(240)
    expect(nightStore.update('payouts', 0, (n) => n + 160)).toBe(400)
    nightStore.remove('payouts')
    expect(nightStore.get('payouts', 0)).toBe(0)
    nightStore.set('a', 1)
    nightStore.set('b', 2)
    window.localStorage.setItem('unrelated', 'x')
    nightStore.clearAll()
    expect(nightStore.get('a', null)).toBeNull()
    expect(window.localStorage.getItem('unrelated')).toBe('x')
    window.removeEventListener(NIGHT_STORE_EVENT, on)
    expect(seen).toEqual(['payouts', 'payouts', 'payouts', 'a', 'b'])
  })

  it('corrupt entries and blocked storage fall back silently', () => {
    window.localStorage.setItem(nightStore.key('story'), '{oops')
    expect(nightStore.get('story', 'fallback')).toBe('fallback')
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceeded')
    }
    try {
      expect(() => nightStore.set('story', { posted: true })).not.toThrow()
    } finally {
      Storage.prototype.setItem = orig
    }
  })
})

describe('demoState · Starter Pack mirror (same record as the wallet sheet)', () => {
  it('is hidden for hosts and after a dismiss; a dismiss never overwrites a purchase', () => {
    expect(starterPackHidden('host', 'u1')).toBe(true)
    expect(starterPackHidden('guest', 'u1')).toBe(false)
    dismissStarterPack('u1')
    expect(readStarterPackState('u1')).toBe('dismissed')
    expect(starterPackHidden('guest', 'u1')).toBe(true)

    window.localStorage.setItem(STARTER_PACK_KEY, JSON.stringify({ u2: { state: 'bought', at: 1 } }))
    dismissStarterPack('u2')
    expect(readStarterPackState('u2')).toBe('bought')
  })
})

describe('imageFallback · real faces, never letters', () => {
  it('draws a host-coloured silhouette (no <text>), stable per host', () => {
    const uri = decodeURIComponent(hostPlaceholderUri('Mint'))
    expect(uri).toMatch(/^data:image\/svg\+xml/)
    expect(uri).not.toMatch(/<text/)
    expect(hostHue('Mint')).toBe(hostHue('Mint 2'))
    expect(hostPlaceholderVars('@mint_bkk')['--hp-h']).toBe(String(hostHue('Mint')))
  })
})
