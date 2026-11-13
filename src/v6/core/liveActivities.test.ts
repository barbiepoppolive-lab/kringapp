import { describe, expect, it } from 'vitest'
import { DEMO_ACTS, getInitialActivities } from './data'
import { buildHostActivityInsertPayload, mapLiveActivities } from './liveActivities'

describe('OPUS-DEMO-LISTINGS-001: production live activities & zero demo hosts', () => {
  it('never returns demo hosts (Nicha, Beam, Mint) or tour-style rows in production builds', () => {
    const prodActs = getInitialActivities(true)
    expect(prodActs).toEqual([])
    expect(prodActs.some((a) => ['Nicha', 'Beam', 'Mint', 'Ken', 'Golf', 'Ploy'].includes(a.host))).toBe(false)
    expect(prodActs.some((a) => ['eat', 'river', 'temple'].includes(a.id))).toBe(false)
  })

  it('keeps DEMO_ACTS available for Vitest/dev when prod=false', () => {
    const devActs = getInitialActivities(false)
    expect(devActs.length).toBe(DEMO_ACTS.length)
  })

  it('maps only status=live + approved_at activities from verified hosts and computes ratings solely from kr6_reviews', () => {
    const rows = [
      {
        id: 'act-live-1',
        host_id: 'host-verified-1',
        title: 'บอร์ดเกมคาเฟ่สามย่าน · Board game café',
        category: 'eat',
        place_name: 'Samyan Mitrtown · สามย่านมิตรทาวน์',
        place_kind: 'public_square',
        meet_lat: 13.7336,
        meet_lng: 100.5285,
        duration_min: 90,
        price_thb: 600,
        partner_fee_thb: 0,
        start_times: ['18:00', '19:30'],
        days: [false, false, false, false, true, true, true],
        status: 'live',
        approved_at: '2026-11-02T05:00:00Z',
        is_volunteer: false,
        bring_friend_first_3: true,
      },
      {
        id: 'act-pending-review',
        host_id: 'host-verified-1',
        title: 'Pending activity',
        category: 'eat',
        place_name: 'Lumpini Park · สวนลุมพินี',
        place_kind: 'park',
        duration_min: 90,
        price_thb: 800,
        start_times: ['18:00'],
        days: [true, true, true, true, true, true, true],
        status: 'review',
        approved_at: null,
      },
      {
        id: 'act-unverified-host',
        host_id: 'host-unverified-2',
        title: 'Unverified host activity',
        category: 'eat',
        place_name: 'Lumpini Park · สวนลุมพินี',
        place_kind: 'park',
        duration_min: 90,
        price_thb: 800,
        start_times: ['18:00'],
        days: [true, true, true, true, true, true, true],
        status: 'live',
        approved_at: '2026-11-02T05:00:00Z',
      },
    ]

    const profiles = [
      {
        user_id: 'host-verified-1',
        display_name: 'Pim',
        languages: ['Thai', 'English'],
        id_verified: true,
        is_host: true,
      },
      {
        user_id: 'host-unverified-2',
        display_name: 'Fake',
        languages: ['Thai'],
        id_verified: false,
        is_host: true,
      },
    ]

    const noReviews = mapLiveActivities(rows as never, profiles, [])
    expect(noReviews).toHaveLength(1)
    expect(noReviews[0].id).toBe('act-live-1')
    expect(noReviews[0].host).toBe('Pim')
    expect(noReviews[0].rating).toBe(0)
    expect(noReviews[0].rev).toBe(0)
    expect(noReviews[0].bringFriendFirst3).toBe(true)

    const withReviews = mapLiveActivities(rows as never, profiles, [
      { booking_id: 'bk-1', activity_id: 'act-live-1', stars: 5 },
      { booking_id: 'bk-2', activity_id: 'act-live-1', stars: 4 },
    ])
    expect(withReviews[0].rev).toBe(2)
    expect(withReviews[0].rating).toBe(4.5)
  })

  it('writes host-published activities with status=review (pending approval, not live until approved)', () => {
    const payload = buildHostActivityInsertPayload(
      {
        title: 'เดินเล่นสวนเบญจกิติ + ถ่ายรูปฟิล์ม',
        category: 'games',
        placeTh: 'สวนเบญจกิติ (ประตูอโศก)',
        placeEn: 'Benchakitti Park, Asok gate',
        placeKind: 'park',
        durationHours: 1.5,
        priceThb: 700,
        startTimes: ['17:30'],
        days: [false, false, false, false, true, true, true],
        isVolunteer: false,
        bringFriendFirst3: true,
      },
      'host-uuid-123',
    )

    expect(payload.status).toBe('review')
    expect(payload.host_id).toBe('host-uuid-123')
    expect(payload.category).toBe('eat')
    expect(payload.place_kind).toBe('park')
    expect(payload.duration_min).toBe(90)
    expect(payload.price_thb).toBe(700)
    expect(payload.bring_friend_first_3).toBe(true)
  })
})
