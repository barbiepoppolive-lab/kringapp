import { describe, expect, it } from 'vitest'
import {
  syncKringBookingHoldToSupabase,
  syncKringBumpReleaseToSupabase,
  syncKringOfferToSupabase,
  syncKringProfileToSupabase,
  syncKringRefundToSupabase,
} from './supabaseKringLiveBridge'

const LIVE_ENV = {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
}

describe('Kring V4.3 Real-World Supabase Live Bridge (Postgres 17 + PostgREST)', () => {
  // Talks to the real Supabase project over the network: opt-in only (KRING_LIVE_SUPABASE_TEST=1), never in the offline unit run.
  it.skipIf(!(globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.KRING_LIVE_SUPABASE_TEST)('syncs profile, offer, booking hold, two-phone Kring bump release, and 100% refund against live Supabase', async () => {
    const profileRes = await syncKringProfileToSupabase(
      {
        userId: '44444444-4444-4444-8444-000000000099',
        displayName: 'Ploy Bangkok',
        activeRole: 'local',
        city: 'Bangkok',
        isLive: true,
        allowVenueChange: true,
      },
      { env: LIVE_ENV },
    )
    expect(profileRes.ok).toBe(true)
    expect(profileRes.mode).toBe('live_supabase')

    const offerId = `offer_live_${Date.now()}`
    const offerRes = await syncKringOfferToSupabase(
      {
        offerId,
        localId: 'mint',
        localName: 'Mint',
        venue: 'Wat Arun Riverside Cafe',
        priceThb: 1200,
        startTime: '19:30',
        durationMin: 120,
        groupSize: 1,
        status: 'accepted',
      },
      { env: LIVE_ENV },
    )
    expect(offerRes.ok).toBe(true)
    expect(offerRes.data).toMatchObject({
      offer_id: offerId,
      price_thb: 1200,
      status: 'accepted',
    })

    const bookingId = `bk_live_${Date.now()}`
    const holdRes = await syncKringBookingHoldToSupabase(
      {
        bookingId,
        offerId,
        localId: 'mint',
        localName: 'Mint',
        venue: 'Wat Arun Riverside Cafe',
        heldThb: 1200,
      },
      { env: LIVE_ENV },
    )
    expect(holdRes.ok).toBe(true)
    expect(holdRes.data).toMatchObject({
      booking_id: bookingId,
      held_thb: 1200,
      local_share_thb: 960,
      platform_share_thb: 240,
      status: 'held',
    })

    const bumpRes = await syncKringBumpReleaseToSupabase(
      {
        bookingId,
        bumpMethod: 'bump',
      },
      { env: LIVE_ENV },
    )
    expect(bumpRes.ok).toBe(true)
    expect(bumpRes.data).toMatchObject({
      booking_id: bookingId,
      held_thb: 1200,
      local_share_thb: 960,
      status: 'released',
    })

    // Test 100% full refund on a separate cancelled booking
    const cancelBookingId = `bk_cancel_${Date.now()}`
    await syncKringBookingHoldToSupabase(
      {
        bookingId: cancelBookingId,
        localId: 'ploy',
        localName: 'Ploy',
        venue: 'Thonglor Specialty Coffee',
        heldThb: 650,
      },
      { env: LIVE_ENV },
    )
    const refundRes = await syncKringRefundToSupabase(cancelBookingId, { env: LIVE_ENV })
    expect(refundRes.ok).toBe(true)
    expect(refundRes.data).toMatchObject({
      booking_id: cancelBookingId,
      refunded_thb: 650,
      refunded_pct: 100,
      status: 'refunded',
    })
  })
})
