import { describe, expect, it, vi } from 'vitest'
import { ChonLedgerStore } from '../lib/chonLedgerEngine'
import {
  DEFAULT_VALIDATED_CONFIG,
  callChonSupabaseRpc,
  getMobileBuildManifest,
  getSupabaseProductionStatus,
  rpcAcceptChonHoldLetsGo,
  rpcClaimDailyRewardFromPot,
  rpcConfirmMeetClinkParty,
  rpcMutualWalkaway,
  rpcOpenHangoutDispute,
  rpcPlaceChonHoldAtomic,
  rpcReleaseChonHold100Percent,
  rpcRequestCashoutWithCircuitBreaker,
  rpcSettleChonHoldOnMeet,
  rpcSpinLuckyGiftPoolBacked,
  validateLivePlatformConfig,
} from '../lib/supabaseProductionWiring'

describe('T-019 & OPT-001/008 — Production Supabase Wiring, Typed RPC Bridge & Red-Line Security', () => {
  it('gracefully falls back to offline_demo_fallback when .env credentials are omitted and switches to live_supabase when present', () => {
    const fallback = getSupabaseProductionStatus({})
    expect(fallback.mode).toBe('offline_demo_fallback')
    expect(fallback.hasForbiddenServiceRoleKey).toBe(false)
    expect(fallback.migrationsReady).toHaveLength(4)
    expect(fallback.rlsTablesProtected).toContain('ledger_entries')

    const live = getSupabaseProductionStatus({
      VITE_SUPABASE_URL: 'https://chon-prod.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon',
    })
    expect(live.mode).toBe('live_supabase')
    expect(live.hasAnonKey).toBe(true)
  })

  it('strictly blocks any service-role key from being exposed in client env (Red Line #5)', () => {
    expect(() =>
      getSupabaseProductionStatus({
        VITE_SUPABASE_SERVICE_ROLE_KEY: 'secret-service-role-key',
      }),
    ).toThrow(/SECURITY VIOLATION/)
  })

  it('validates live DB config splits, floors (฿300 min floor, 80% host split, ฿0 fee >= ฿1,000) and 16% agency cap', () => {
    const valid = validateLivePlatformConfig()
    expect(valid).toEqual(DEFAULT_VALIDATED_CONFIG)

    expect(() => validateLivePlatformConfig({ minHangoutThb: 200 })).toThrow(/below ฿300/)
    expect(() => validateLivePlatformConfig({ hostSharePct: 70, platformMeetSharePct: 30 })).toThrow(
      /at least 80%/,
    )
    expect(() => validateLivePlatformConfig({ agencyOverrideMaxPct: 20 })).toThrow(/cannot exceed 16%/)
  })

  it('returns the mobile PWA & Capacitor build manifest with LAN Wi-Fi URL for phone testing', () => {
    const manifest = getMobileBuildManifest('192.168.1.39', 5173)
    expect(manifest.appId).toBe('app.chon.social')
    expect(manifest.displayMode).toBe('standalone')
    expect(manifest.lanWifiUrl).toBe('http://192.168.1.39:5173')
  })

  it('OPT-001/008: executes typed RPC wrappers via PostgREST in live_supabase mode and deterministic fallback in offline_demo_fallback mode', async () => {
    // 1. Offline demo fallback mode
    const demoHold = await rpcPlaceChonHoldAtomic(
      {
        p_idempotency_key: 'idem_demo_1',
        p_host_id: 'host_ploy',
        p_venue_name: 'Tichuca Rooftop',
        p_offer_thb: 1500,
      },
      { env: {} },
    )
    expect(demoHold.ok).toBe(true)
    expect(demoHold.mode).toBe('offline_demo_fallback')
    expect(demoHold.data?.held_paid_coins).toBe(150000)

    const demoAccept = await rpcAcceptChonHoldLetsGo(
      { p_idempotency_key: 'idem_accept_1', p_hold_id: 'hold_1' },
      { env: {} },
    )
    // OPUS-L1: demo fallback must use the same literal the DB CHECK constraint allows ('ACCEPTED')
    expect(demoAccept.data?.status).toBe('ACCEPTED')

    const demoClink = await rpcConfirmMeetClinkParty(
      {
        p_hold_id: 'hold_1',
        p_device_hash: 'dev_guest',
        p_rotating_pin_hash: 'pin_123',
        p_lat: 13.722,
        p_lng: 100.58,
      },
      { env: {} },
    )
    expect(demoClink.data?.clink_verified).toBe(true)

    const demoSettle = await rpcSettleChonHoldOnMeet(
      {
        p_idempotency_key: 'idem_settle_1',
        p_hold_id: 'hold_1',
        p_guest_device_hash: 'dev_guest',
        p_host_device_hash: 'dev_host',
        p_rotating_pin_hash: 'pin_123',
        p_distance_between_users_m: 12,
        p_distance_to_venue_m: 35,
      },
      { env: {} },
    )
    expect(demoSettle.data?.host_share_pct).toBe(80)

    const demoRefund = await rpcReleaseChonHold100Percent(
      { p_idempotency_key: 'idem_refund_1', p_hold_id: 'hold_2' },
      { env: {} },
    )
    expect(demoRefund.data?.refunded_pct).toBe(100)

    const demoSpin = await rpcSpinLuckyGiftPoolBacked(
      { p_idempotency_key: 'idem_spin_1', p_host_id: 'host_ploy', p_spin_cost_coins: 1000 },
      { env: {} },
    )
    expect(demoSpin.data?.pool_contribution_coins).toBe(800)
    expect(demoSpin.data?.host_credit_coins).toBe(120)
    expect(demoSpin.data?.house_margin_coins).toBe(80)

    const demoCashout = await rpcRequestCashoutWithCircuitBreaker(
      { p_idempotency_key: 'idem_cashout_1', p_gross_thb: 500, p_channel: 'PromptPay' },
      { env: {} },
    )
    expect(demoCashout.data?.fee_thb).toBe(15)
    expect(demoCashout.data?.net_thb).toBe(485)

    // 2. Live Supabase PostgREST mode
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hold_id: 'live_uuid_999', held_paid_coins: 150000, status: 'HELD' }),
    })

    const liveResult = await callChonSupabaseRpc(
      'rpc_place_chon_hold_atomic',
      {
        p_idempotency_key: 'idem_live_1',
        p_host_id: 'host_ploy',
        p_venue_name: 'Octave Rooftop',
        p_offer_thb: 1500,
      },
      {
        env: {
          VITE_SUPABASE_URL: 'https://chon-prod.supabase.co',
          VITE_SUPABASE_ANON_KEY: 'anon_jwt_token',
        },
        accessToken: 'user_session_jwt',
        fetchImpl: mockFetch as unknown as typeof fetch,
      },
    )

    expect(liveResult.ok).toBe(true)
    expect(liveResult.mode).toBe('live_supabase')
    expect(liveResult.endpointUrl).toBe(
      'https://chon-prod.supabase.co/rest/v1/rpc/rpc_place_chon_hold_atomic',
    )
    expect(mockFetch).toHaveBeenCalledWith(
      'https://chon-prod.supabase.co/rest/v1/rpc/rpc_place_chon_hold_atomic',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: 'anon_jwt_token',
          Authorization: 'Bearer user_session_jwt',
        },
      }),
    )
  })

  it('OPT-012 & OPT-013: normalizes scalar PostgREST responses across all 10 RPC wrappers and enforces idempotency payload hash + multi-leg zero-sum settlement', async () => {
    const liveEnv = {
      VITE_SUPABASE_URL: 'https://chon-prod.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon_jwt_token',
    }
    const scalarMock = (val: unknown) =>
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => val,
      }) as unknown as typeof fetch

    const r1 = await rpcPlaceChonHoldAtomic(
      { p_idempotency_key: 'k1', p_host_id: 'h1', p_venue_name: 'Octave', p_offer_thb: 1500 },
      { env: liveEnv, fetchImpl: scalarMock('uuid-hold-1') },
    )
    expect(r1.data).toEqual({ hold_id: 'uuid-hold-1', held_paid_coins: 150000, status: 'HELD' })

    const r2 = await rpcAcceptChonHoldLetsGo(
      { p_idempotency_key: 'k2', p_hold_id: 'uuid-hold-1' },
      { env: liveEnv, fetchImpl: scalarMock('ACCEPTED') },
    )
    expect(r2.data).toEqual({ hold_id: 'uuid-hold-1', status: 'ACCEPTED' })

    const r3 = await rpcConfirmMeetClinkParty(
      { p_hold_id: 'uuid-hold-1', p_device_hash: 'd1', p_rotating_pin_hash: 'p1', p_lat: 13.7, p_lng: 100.5 },
      { env: liveEnv, fetchImpl: scalarMock('CLINK_CONFIRMED') },
    )
    expect(r3.data?.clink_verified).toBe(true)

    const r4 = await rpcSettleChonHoldOnMeet(
      {
        p_idempotency_key: 'k4',
        p_hold_id: 'uuid-hold-1',
        p_guest_device_hash: 'd1',
        p_host_device_hash: 'd2',
        p_rotating_pin_hash: 'p1',
        p_distance_between_users_m: 10,
        p_distance_to_venue_m: 20,
      },
      { env: liveEnv, fetchImpl: scalarMock('SETTLED_ON_MEET') },
    )
    expect(r4.data?.host_share_pct).toBe(80)

    const r5 = await rpcReleaseChonHold100Percent(
      { p_idempotency_key: 'k5', p_hold_id: 'uuid-hold-2' },
      { env: liveEnv, fetchImpl: scalarMock('RELEASED_TO_CHON_WALLET') },
    )
    expect(r5.data?.refunded_pct).toBe(100)

    const r6 = await rpcSpinLuckyGiftPoolBacked(
      { p_idempotency_key: 'k6', p_host_id: 'h1', p_spin_cost_coins: 1000 },
      { env: liveEnv, fetchImpl: scalarMock(5) },
    )
    expect(r6.data?.multiplier).toBe(5)

    const r7 = await rpcRequestCashoutWithCircuitBreaker(
      { p_idempotency_key: 'k7', p_gross_thb: 1200, p_channel: 'PromptPay', p_is_scheduled_monday_payout: true },
      { env: liveEnv, fetchImpl: scalarMock('cashout-uuid-7') },
    )
    expect(r7.data?.fee_thb).toBe(0)
    expect(r7.data?.net_thb).toBe(1200)

    const r8 = await rpcClaimDailyRewardFromPot(
      { p_idempotency_key: 'k8', p_task_id: 'daily_checkin', p_device_hash: 'd1' },
      { env: liveEnv, fetchImpl: scalarMock(15) },
    )
    expect(r8.data?.reward_bonus_coins).toBe(15)

    const r9 = await rpcMutualWalkaway(
      { p_idempotency_key: 'k9', p_hold_id: 'uuid-hold-3' },
      { env: liveEnv, fetchImpl: scalarMock('CANCELLED_MUTUAL_WALKAWAY') },
    )
    expect(r9.data?.status).toBe('CANCELLED_MUTUAL_WALKAWAY')

    const r10 = await rpcOpenHangoutDispute(
      { p_idempotency_key: 'k10', p_hold_id: 'uuid-hold-4', p_reason: 'No show' },
      { env: liveEnv, fetchImpl: scalarMock('dispute-uuid-10') },
    )
    expect(r10.data?.dispute_id).toBe('dispute-uuid-10')

    // OPT-013: Ledger multi-leg zero-sum + idempotency payload conflict rejection
    const store = new ChonLedgerStore()
    store.seedWallet('guest_1', { paidCoins: 500_000, bonusCoins: 0, hostBahtBalance: 0 })
    const hold = store.placeChonRequestHold({
      idempotencyKey: 'hold_key_1',
      guestId: 'guest_1',
      hostId: 'host_ploy',
      offerThb: 1500,
    })
    expect(() =>
      store.placeChonRequestHold({
        idempotencyKey: 'hold_key_1',
        guestId: 'guest_1',
        hostId: 'host_ploy',
        offerThb: 2000,
      }),
    ).toThrow(/Idempotency key conflict/)

    store.settleMeetInPerson({
      idempotencyKey: 'settle_key_1',
      holdId: hold.holdId,
      agencyId: 'agency_1',
      agencyRolling30dVolumeThb: 150_000,
      subScoutId: 'scout_1',
    })
    expect(store.verifyZeroSumInvariant()).toBe(true)
  })
})
