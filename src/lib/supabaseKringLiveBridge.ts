/**
 * Kring V4.3 Real-World Supabase Live Bridge (`src/lib/supabaseKringLiveBridge.ts`)
 * Connects Kring's client stores (`profileStore.ts`, `planStore.ts`, `BumpCheckIn.tsx`,
 * `One-Account Three-Roles`, and `Kring Price` passes) directly to Postgres 17 + PostgREST (`/rest/v1/rpc/...`).
 *
 * Security & Test Determinism Guardrails:
 * 1. Strictly uses `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (never a service-role key — Red Line #5).
 * 2. Automatically no-ops during Vitest unit tests (`import.meta.env.VITEST`) unless explicitly invoked
 *    with `options.env`, preserving 100% deterministic offline unit-test execution.
 */

import { getSupabaseProductionStatus } from './supabaseProductionWiring'
import { readPhotos, readProfile } from './profileStore'

export type KringLiveRpcName =
  | 'rpc_kring_sync_profile'
  | 'rpc_kring_upsert_offer'
  | 'rpc_kring_confirm_booking_hold'
  | 'rpc_kring_bump_release'
  | 'rpc_kring_refund_booking_100_pct'

export interface KringLiveRpcOptions {
  env?: Record<string, string | undefined>
  accessToken?: string
  fetchImpl?: typeof fetch
}

export interface KringLiveRpcResponse<T = Record<string, unknown>> {
  ok: boolean
  mode: 'live_supabase' | 'offline_demo_fallback'
  rpcName: KringLiveRpcName
  data: T | null
  error: string | null
}

const DEVICE_USER_UUID_KEY = 'kring_supabase_user_uuid_v1'

/** Deterministic or persisted UUID v4 for this device/user in Supabase */
export function getOrCreateKringUserUuid(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_USER_UUID_KEY)
    if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) {
      return existing
    }
    const uuid =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : '44444444-4444-4444-8444-' + Date.now().toString(16).padStart(12, '0').slice(-12)
    window.localStorage.setItem(DEVICE_USER_UUID_KEY, uuid)
    return uuid
  } catch {
    return '44444444-4444-4444-8444-000000000001'
  }
}

export async function callKringLiveRpc<T = Record<string, unknown>>(
  rpcName: KringLiveRpcName,
  params: Record<string, unknown>,
  options: KringLiveRpcOptions = {},
): Promise<KringLiveRpcResponse<T>> {
  const metaEnv = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}
  const isUnitTestDefault = !options.env && Boolean(metaEnv.VITEST || metaEnv.MODE === 'test')
  const env = options.env ?? (isUnitTestDefault ? {} : metaEnv)
  const status = getSupabaseProductionStatus(env)

  if (status.mode !== 'live_supabase' || !status.supabaseUrl) {
    return {
      ok: true,
      mode: 'offline_demo_fallback',
      rpcName,
      data: ({ status: 'DEMO_SYNCED', ...params } as unknown) as T,
      error: null,
    }
  }

  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''
  const endpointUrl = `${status.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${rpcName}`
  const fetchFn = options.fetchImpl ?? fetch
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: anonKey,
  }
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`
  } else if (!anonKey.startsWith('sb_publishable_')) {
    headers.Authorization = `Bearer ${anonKey}`
  }

  try {
    const res = await fetchFn(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    })

    if (!res.ok) {
      const errText = await res.text()
      return {
        ok: false,
        mode: 'live_supabase',
        rpcName,
        data: null,
        error: errText || `HTTP ${res.status}`,
      }
    }

    const data = (await res.json()) as T
    return {
      ok: true,
      mode: 'live_supabase',
      rpcName,
      data,
      error: null,
    }
  } catch (err) {
    return {
      ok: false,
      mode: 'live_supabase',
      rpcName,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function syncKringProfileToSupabase(
  patch: {
    userId?: string
    displayName?: string
    activeRole?: 'traveller' | 'local' | 'agency'
    city?: 'Bangkok' | 'Pattaya'
    isLive?: boolean
    allowVenueChange?: boolean
  } = {},
  options?: KringLiveRpcOptions,
) {
  const prof = typeof window !== 'undefined' ? readProfile() : null
  const photos = typeof window !== 'undefined' ? readPhotos() : []
  const userId = patch.userId ?? (typeof window !== 'undefined' ? getOrCreateKringUserUuid() : '44444444-4444-4444-8444-000000000001')

  return callKringLiveRpc(
    'rpc_kring_sync_profile',
    {
      p_user_id: userId,
      p_display_name: patch.displayName ?? prof?.name ?? 'Kring Member',
      p_active_role: patch.activeRole ?? 'traveller',
      p_city: patch.city ?? prof?.city ?? 'Bangkok',
      p_is_live: patch.isLive ?? true,
      p_allow_venue_change: patch.allowVenueChange ?? true,
      p_photos: photos.map((p) => ({ id: p.id, light: p.light, zoom: p.zoom, x: p.x, y: p.y })),
    },
    options,
  )
}

export async function syncKringOfferToSupabase(
  params: {
    offerId: string
    localId: string
    localName: string
    venue: string
    priceThb: number
    startTime?: string
    durationMin?: number
    groupSize?: number
    status?: 'open' | 'accepted' | 'declined' | 'expired' | 'cancelled'
    lastBy?: 'guest' | 'host'
  },
  options?: KringLiveRpcOptions,
) {
  return callKringLiveRpc(
    'rpc_kring_upsert_offer',
    {
      p_offer_id: params.offerId,
      p_local_id: params.localId,
      p_local_name: params.localName,
      p_venue: params.venue,
      p_price_thb: params.priceThb,
      p_start_time: params.startTime ?? '20:00',
      p_duration_min: params.durationMin ?? 120,
      p_group_size: params.groupSize ?? 1,
      p_status: params.status ?? 'open',
      p_last_by: params.lastBy ?? 'guest',
    },
    options,
  )
}

export async function syncKringBookingHoldToSupabase(
  params: {
    bookingId: string
    offerId?: string
    localId: string
    localName: string
    venue: string
    heldThb: number
    startTime?: string
    durationMin?: number
  },
  options?: KringLiveRpcOptions,
) {
  return callKringLiveRpc(
    'rpc_kring_confirm_booking_hold',
    {
      p_booking_id: params.bookingId,
      p_offer_id: params.offerId ?? '',
      p_local_id: params.localId,
      p_local_name: params.localName,
      p_venue: params.venue,
      p_held_thb: params.heldThb,
      p_start_time: params.startTime ?? '20:00',
      p_duration_min: params.durationMin ?? 120,
    },
    options,
  )
}

export async function syncKringBumpReleaseToSupabase(
  params: {
    bookingId: string
    bumpMethod?: 'bump' | 'qr'
  },
  options?: KringLiveRpcOptions,
) {
  return callKringLiveRpc(
    'rpc_kring_bump_release',
    {
      p_booking_id: params.bookingId,
      p_bump_method: params.bumpMethod ?? 'bump',
    },
    options,
  )
}

export async function syncKringRefundToSupabase(
  bookingId: string,
  options?: KringLiveRpcOptions,
) {
  return callKringLiveRpc(
    'rpc_kring_refund_booking_100_pct',
    {
      p_booking_id: bookingId,
    },
    options,
  )
}

let bridgeInstalled = false

/**
 * Installs non-blocking background listeners on Kring's global event bus so profile edits,
 * booking holds, cancellations, and BumpCheckIn releases automatically persist to Supabase
 * when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured.
 */
export function installKringSupabaseLiveBridge() {
  if (bridgeInstalled || typeof window === 'undefined') return
  const metaEnv = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}
  if (metaEnv.VITEST || metaEnv.MODE === 'test') return

  const status = getSupabaseProductionStatus(metaEnv)
  if (status.mode !== 'live_supabase') return

  bridgeInstalled = true

  // Initial profile heartbeat sync
  void syncKringProfileToSupabase()

  window.addEventListener('chon:profile-updated', () => {
    void syncKringProfileToSupabase()
  })

  window.addEventListener('kring:profile-photos', () => {
    void syncKringProfileToSupabase()
  })

  window.addEventListener('chon:offer-status', (event: Event) => {
    const d = (
      event as CustomEvent<{
        status?: string
        hostName?: string
        hostId?: string
        offerBaht?: number
        venue?: string
        ref?: string
      }>
    ).detail
    if (!d) return
    const bookingId = d.ref || `bk_${d.hostId || d.hostName || 'local'}`
    if (d.status === 'HELD' && typeof d.offerBaht === 'number' && d.offerBaht >= 300) {
      void syncKringBookingHoldToSupabase({
        bookingId,
        offerId: d.ref,
        localId: d.hostId || 'local',
        localName: d.hostName || 'Verified Local',
        venue: d.venue || 'Public Bangkok Venue',
        heldThb: d.offerBaht,
      })
    } else if (d.status === 'CANCELLED' || d.status === 'EXPIRED') {
      void syncKringRefundToSupabase(bookingId)
    }
  })
}
