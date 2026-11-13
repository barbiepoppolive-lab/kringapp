import { beforeEach, describe, expect, it } from 'vitest'
import { checkIn, claimBanked, claimTask, checkinView, MONTH_MAX_THB, openMaxThb, readUserRewards, taskViews, type Facts } from './rewardsModel'

const NOW = Date.UTC(2026, 9, 22, 5)
const none: Facts = { bumps: 0, reviewsThisMonth: 0, saved: 0 }

function credits(): number[] {
  const got: number[] = []
  window.addEventListener('chon:wallet-delta', (e) => got.push((e as CustomEvent<{ bonusDelta?: number }>).detail.bonusDelta ?? 0))
  return got
}

describe('Earn reward 555 · model', () => {
  beforeEach(() => window.localStorage.clear())

  it('the honest monthly maximum is exactly ฿555', () => {
    expect(MONTH_MAX_THB).toBe(555)
    expect(openMaxThb(readUserRewards('me', NOW))).toBe(555)
  })

  it('nothing pays before a real bump: tasks lock, check-in banks', () => {
    const got = credits()
    const f: Facts = { bumps: 0, reviewsThisMonth: 0, saved: 3 }
    const pin = taskViews(f, readUserRewards('me', NOW)).find((t) => t.task.id === 'pin')!
    expect(pin.state).toBe('locked')
    expect(claimTask('pin', f, NOW)).toEqual({ ok: false, reason: 'locked' })
    const r = checkIn(f, NOW)
    expect(r).toMatchObject({ ok: true, thb: 2, banked: true })
    expect(got).toEqual([])
    expect(checkinView(readUserRewards('me', NOW), NOW).canTick).toBe(false) // once a day
  })

  it('after the first bump: first experience + 3 saved locals pay once, as promo through the wallet bus', () => {
    const got = credits()
    const f: Facts = { bumps: 1, reviewsThisMonth: 1, saved: 3 }
    expect(claimTask('first', f, NOW)).toEqual({ ok: true, thb: 100 })
    expect(claimTask('first', f, NOW)).toEqual({ ok: false, reason: 'nothing' })
    expect(claimTask('pin', f, NOW)).toEqual({ ok: true, thb: 20 })
    expect(claimTask('rev', f, NOW)).toEqual({ ok: true, thb: 25 })
    expect(claimTask('rev', f, NOW)).toEqual({ ok: false, reason: 'nothing' })
    // invites / shares need the server (someone new really booked / opened) — never claimable on the client
    expect(claimTask('inv', f, NOW).ok).toBe(false)
    expect(claimTask('share', f, NOW).ok).toBe(false)
    expect(got).toEqual([10_000, 2_000, 2_500])
    const u = readUserRewards('me', NOW)
    expect(u.earnedThb).toBe(145)
    expect(taskViews(f, u).find((t) => t.task.id === 'first')!.state).toBe('done')
  })

  it('banked check-ins pay once the first bump has happened', () => {
    const got = credits()
    checkIn(none, NOW)
    expect(claimBanked(none, NOW)).toEqual({ ok: false, reason: 'locked' })
    expect(claimBanked({ ...none, bumps: 1 }, NOW)).toEqual({ ok: true, thb: 2 })
    expect(got).toEqual([200])
    // next day pays at once (and day 2 is ฿2)
    expect(checkIn({ ...none, bumps: 1 }, NOW + 864e5)).toMatchObject({ ok: true, thb: 2, banked: false })
  })

  it('a rejected credit records nothing', () => {
    const off = (e: Event) => {
      ;(e as CustomEvent<{ accepted?: boolean }>).detail.accepted = false
    }
    window.addEventListener('chon:wallet-delta', off)
    expect(claimTask('first', { bumps: 1, reviewsThisMonth: 0, saved: 0 }, NOW)).toEqual({ ok: false, reason: 'rejected' })
    expect(readUserRewards('me', NOW).earnedThb).toBe(0)
    window.removeEventListener('chon:wallet-delta', off)
  })
})
