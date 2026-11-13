/**
 * Ticket T-019 & OPT-001 — Production Supabase Live Wiring, Typed PostgREST RPC Bridge,
 * Live `config` Sync & Mobile Packaging Descriptor
 * Enforces AGENTS.md Red Line #5: Zero service-role keys in client code; all splits/floors live in DB `config`.
 */

export interface SupabaseProductionStatus {
  mode: 'live_supabase' | 'offline_demo_fallback'
  supabaseUrl: string | null
  hasAnonKey: boolean
  hasForbiddenServiceRoleKey: boolean
  rlsTablesProtected: string[]
  migrationsReady: string[]
}

export interface ValidatedPlatformConfig {
  hostSharePct: number
  platformMeetSharePct: number
  minHangoutThb: number
  freeCashoutThresholdThb: number
  sub1000CashoutFeeThb: number
  luckyRtpPct: number
  luckyHostSharePct: number
  luckyPlatformSharePct: number
  agencyOverrideTiersPct: [number, number, number, number]
  agencyOverrideMaxPct?: number
  subScoutOverridePct: number
}

export interface MobileBuildManifest {
  appId: string
  appName: string
  themeColor: string
  displayMode: 'standalone'
  lanWifiUrl: string
  migrationsCount: number
}

export const DEFAULT_VALIDATED_CONFIG: ValidatedPlatformConfig = {
  hostSharePct: 80,
  platformMeetSharePct: 20,
  minHangoutThb: 300,
  freeCashoutThresholdThb: 1000,
  sub1000CashoutFeeThb: 15,
  luckyRtpPct: 96,
  luckyHostSharePct: 12,
  luckyPlatformSharePct: 8,
  agencyOverrideTiersPct: [8, 12, 16, 20],
  agencyOverrideMaxPct: 16,
  subScoutOverridePct: 4,
}

export function getSupabaseProductionStatus(
  env: Record<string, string | undefined> = {},
): SupabaseProductionStatus {
  const url = env.VITE_SUPABASE_URL?.trim() || null
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() || null
  const forbiddenServiceKey = Boolean(
    env.SUPABASE_SERVICE_ROLE_KEY ||
      env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
      env.SUPABASE_SECRET_KEY ||
      env.VITE_SUPABASE_SECRET_KEY ||
      anonKey?.startsWith('sb_secret_'),
  )

  if (forbiddenServiceKey) {
    throw new Error(
      'SECURITY VIOLATION (Red Line #5): Service-role key must never be exposed in client environment variables.',
    )
  }

  return {
    mode: url && anonKey ? 'live_supabase' : 'offline_demo_fallback',
    supabaseUrl: url,
    hasAnonKey: Boolean(anonKey),
    hasForbiddenServiceRoleKey: false,
    rlsTablesProtected: [
      'users',
      'profiles',
      'host_profiles',
      'wallets',
      'escrow_holds',
      'escrow_hold_secrets',
      'ledger_entries',
      'treat_envelopes',
      'host_cashouts',
      'host_payout_accounts',
      'lucky_pool_vault',
      'public_venues',
      'idempotency_locks',
      'chats',
      'reviews_double_blind',
      'agencies',
      'config',
      'payment_webhook_events',
      'meet_handshakes',
      'daily_device_task_claims',
    ],
    migrationsReady: [
      '0001_init_chon_schema.sql',
      '0002_phase2_lucky_pool_and_gifts.sql',
      '0003_double_entry_ledger_and_holds.sql',
      '0004_atomic_ledger_rpcs_and_anti_fraud.sql',
    ],
  }
}

export function validateLivePlatformConfig(
  partial: Partial<ValidatedPlatformConfig> = {},
): ValidatedPlatformConfig {
  const merged: ValidatedPlatformConfig = {
    ...DEFAULT_VALIDATED_CONFIG,
    ...partial,
  }

  if (merged.minHangoutThb < 300) {
    throw new Error('Red Line #2: Minimum Hangout Treat Floor cannot be below ฿300.')
  }
  if (merged.hostSharePct + merged.platformMeetSharePct !== 100) {
    throw new Error('Red Line #2: Host share + Platform meet share must equal 100%.')
  }
  if (merged.hostSharePct < 80) {
    throw new Error('Red Line #3: Host hangout & normal gift share must be at least 80%.')
  }
  if (merged.freeCashoutThresholdThb !== 1000 || merged.sub1000CashoutFeeThb !== 15) {
    throw new Error('Cashout rule: ฿0 fee on >= ฿1,000 and ฿15 flat fee below ฿1,000.')
  }
  if ((merged.agencyOverrideMaxPct ?? 16) > 16) {
    throw new Error('D-038 / BUG-035: Agency override cannot exceed 16% out of the 20% platform share.')
  }

  return merged
}

export function getMobileBuildManifest(lanIp = '192.168.1.39', port = 5173): MobileBuildManifest {
  return {
    appId: 'app.chon.social',
    appName: 'Chon! 🥂',
    themeColor: '#F8FAFC',
    displayMode: 'standalone',
    lanWifiUrl: `http://${lanIp}:${port}`,
    migrationsCount: 5,
  }
}

export type ChonSupabaseRpcName =
  | 'rpc_place_chon_hold_atomic'
  | 'rpc_accept_chon_hold_lets_go'
  | 'rpc_release_chon_hold_100_percent'
  | 'rpc_confirm_meet_clink_party'
  | 'rpc_settle_chon_hold_on_meet'
  | 'rpc_request_cashout_with_circuit_breaker'
  | 'rpc_reverse_failed_cashout'
  | 'rpc_spin_lucky_gift_pool_backed'
  | 'rpc_claim_daily_reward_from_pot'
  | 'rpc_credit_verified_webhook_topup'
  | 'rpc_confirm_settled_card_coins'
  | 'rpc_mutual_walkaway'
  | 'rpc_open_hangout_dispute'
  | 'rpc_process_expired_accepted_holds'

export interface ChonRpcCallOptions<T> {
  env?: Record<string, string | undefined>
  accessToken?: string
  fetchImpl?: typeof fetch
  fallbackData?: T
  normalize?: (raw: unknown) => T
}

export interface ChonRpcResult<T> {
  ok: boolean
  mode: 'live_supabase' | 'offline_demo_fallback'
  rpcName: ChonSupabaseRpcName
  endpointUrl: string | null
  data: T | null
  error: string | null
}

/**
 * OPT-001 & OPT-012: Executes a SECURITY DEFINER Postgres 17 RPC on Supabase via PostgREST
 * (`/rest/v1/rpc/${rpcName}`) when `live_supabase` credentials are configured,
 * normalizing PostgREST scalar returns (UUID / TEXT / BIGINT) into the same typed object shape
 * as `offline_demo_fallback` mode.
 */
export async function callChonSupabaseRpc<T = Record<string, unknown>>(
  rpcName: ChonSupabaseRpcName,
  params: Record<string, unknown>,
  options: ChonRpcCallOptions<T> = {},
): Promise<ChonRpcResult<T>> {
  const metaEnv = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}
  const isUnitTestDefault = !options.env && Boolean(metaEnv.VITEST || metaEnv.MODE === 'test')
  const env = options.env ?? (isUnitTestDefault ? {} : metaEnv)
  const status = getSupabaseProductionStatus(env)

  if (status.mode !== 'live_supabase' || !status.supabaseUrl) {
    return {
      ok: true,
      mode: 'offline_demo_fallback',
      rpcName,
      endpointUrl: null,
      data: (options.fallbackData ?? ({ status: 'DEMO_OK', ...params } as unknown as T)) ?? null,
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
    const response = await fetchFn(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const errText = await response.text()
      return {
        ok: false,
        mode: 'live_supabase',
        rpcName,
        endpointUrl,
        data: null,
        error: errText || `HTTP ${response.status}`,
      }
    }

    const raw = await response.json()
    const data = options.normalize ? options.normalize(raw) : (raw as T)
    return {
      ok: true,
      mode: 'live_supabase',
      rpcName,
      endpointUrl,
      data,
      error: null,
    }
  } catch (err) {
    return {
      ok: false,
      mode: 'live_supabase',
      rpcName,
      endpointUrl,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function rpcPlaceChonHoldAtomic(
  params: {
    p_idempotency_key: string
    p_host_id: string
    p_venue_name: string
    p_offer_thb: number
  },
  options?: ChonRpcCallOptions<{ hold_id: string; held_paid_coins: number; status: string }>,
) {
  if (params.p_offer_thb < 300) {
    throw new Error('Red Line #2: Treat Envelope offer must be at least ฿300.')
  }
  const heldPaidCoins = params.p_offer_thb * 100
  return callChonSupabaseRpc('rpc_place_chon_hold_atomic', params, {
    ...options,
    fallbackData: options?.fallbackData ?? {
      hold_id: `hold_${params.p_idempotency_key}`,
      held_paid_coins: heldPaidCoins,
      status: 'HELD',
    },
    normalize:
      options?.normalize ??
      ((raw) => {
        if (raw && typeof raw === 'object' && 'hold_id' in raw) {
          return raw as { hold_id: string; held_paid_coins: number; status: string }
        }
        return {
          hold_id: String(raw ?? `hold_${params.p_idempotency_key}`),
          held_paid_coins: heldPaidCoins,
          status: 'HELD',
        }
      }),
  })
}

export async function rpcAcceptChonHoldLetsGo(
  params: {
    p_idempotency_key: string
    p_hold_id: string
  },
  options?: ChonRpcCallOptions<{ hold_id: string; status: string }>,
) {
  return callChonSupabaseRpc('rpc_accept_chon_hold_lets_go', params, {
    ...options,
    fallbackData: options?.fallbackData ?? {
      hold_id: params.p_hold_id,
      // OPUS-L1: must mirror `escrow_holds_status_check` in 0005 — the DB literal is 'ACCEPTED'
      status: 'ACCEPTED',
    },
    normalize:
      options?.normalize ??
      ((raw) => {
        if (raw && typeof raw === 'object' && 'status' in raw) {
          return raw as { hold_id: string; status: string }
        }
        return {
          hold_id: params.p_hold_id,
          status: typeof raw === 'string' && raw ? raw : 'ACCEPTED',
        }
      }),
  })
}

export async function rpcConfirmMeetClinkParty(
  params: {
    p_hold_id: string
    p_device_hash: string
    p_rotating_pin_hash: string
    p_lat: number
    p_lng: number
  },
  options?: ChonRpcCallOptions<{ hold_id: string; clink_verified: boolean; status?: string }>,
) {
  return callChonSupabaseRpc('rpc_confirm_meet_clink_party', params, {
    ...options,
    fallbackData: options?.fallbackData ?? {
      hold_id: params.p_hold_id,
      clink_verified: true,
      status: 'CLINK_CONFIRMED',
    },
    normalize:
      options?.normalize ??
      ((raw) => {
        if (raw && typeof raw === 'object' && 'clink_verified' in raw) {
          return raw as { hold_id: string; clink_verified: boolean; status?: string }
        }
        return {
          hold_id: params.p_hold_id,
          clink_verified: Boolean(raw ?? true),
          status: typeof raw === 'string' && raw ? raw : 'CLINK_CONFIRMED',
        }
      }),
  })
}

export async function rpcSettleChonHoldOnMeet(
  params: {
    p_idempotency_key: string
    p_hold_id: string
    p_guest_device_hash: string
    p_host_device_hash: string
    p_rotating_pin_hash: string
    p_distance_between_users_m: number
    p_distance_to_venue_m: number
  },
  options?: ChonRpcCallOptions<{
    hold_id: string
    status: string
    host_share_pct: number
    platform_share_pct: number
  }>,
) {
  return callChonSupabaseRpc('rpc_settle_chon_hold_on_meet', params, {
    ...options,
    fallbackData: options?.fallbackData ?? {
      hold_id: params.p_hold_id,
      status: 'SETTLED_ON_MEET',
      host_share_pct: 80,
      platform_share_pct: 20,
    },
    normalize:
      options?.normalize ??
      ((raw) => {
        if (raw && typeof raw === 'object' && 'host_share_pct' in raw) {
          return raw as {
            hold_id: string
            status: string
            host_share_pct: number
            platform_share_pct: number
          }
        }
        return {
          hold_id: params.p_hold_id,
          status: typeof raw === 'string' && raw ? raw : 'SETTLED_ON_MEET',
          host_share_pct: 80,
          platform_share_pct: 20,
        }
      }),
  })
}

export async function rpcReleaseChonHold100Percent(
  params: {
    p_idempotency_key: string
    p_hold_id: string
  },
  options?: ChonRpcCallOptions<{ hold_id: string; status: string; refunded_pct: number }>,
) {
  return callChonSupabaseRpc('rpc_release_chon_hold_100_percent', params, {
    ...options,
    fallbackData: options?.fallbackData ?? {
      hold_id: params.p_hold_id,
      status: 'RELEASED_TO_CHON_WALLET',
      refunded_pct: 100,
    },
    normalize:
      options?.normalize ??
      ((raw) => {
        if (raw && typeof raw === 'object' && 'refunded_pct' in raw) {
          return raw as { hold_id: string; status: string; refunded_pct: number }
        }
        return {
          hold_id: params.p_hold_id,
          status: typeof raw === 'string' && raw ? raw : 'RELEASED_TO_CHON_WALLET',
          refunded_pct: 100,
        }
      }),
  })
}

export async function rpcSpinLuckyGiftPoolBacked(
  params: {
    p_idempotency_key: string
    p_host_id: string
    p_spin_cost_coins: number
  },
  options?: ChonRpcCallOptions<{
    multiplier: number
    host_credit_coins: number
    pool_contribution_coins: number
    house_margin_coins: number
  }>,
) {
  const hostCreditCoins = Math.floor(params.p_spin_cost_coins * 0.12)
  const poolContributionCoins = Math.floor(params.p_spin_cost_coins * 0.8)
  const houseMarginCoins = params.p_spin_cost_coins - hostCreditCoins - poolContributionCoins
  return callChonSupabaseRpc('rpc_spin_lucky_gift_pool_backed', params, {
    ...options,
    fallbackData: options?.fallbackData ?? {
      multiplier: 1,
      host_credit_coins: hostCreditCoins,
      pool_contribution_coins: poolContributionCoins,
      house_margin_coins: houseMarginCoins,
    },
    normalize:
      options?.normalize ??
      ((raw) => {
        if (raw && typeof raw === 'object' && 'multiplier' in raw) {
          return raw as {
            multiplier: number
            host_credit_coins: number
            pool_contribution_coins: number
            house_margin_coins: number
          }
        }
        return {
          multiplier: Number(raw ?? 1),
          host_credit_coins: hostCreditCoins,
          pool_contribution_coins: poolContributionCoins,
          house_margin_coins: houseMarginCoins,
        }
      }),
  })
}

export async function rpcRequestCashoutWithCircuitBreaker(
  params: {
    p_idempotency_key: string
    p_gross_thb: number
    p_channel: 'PromptPay' | 'KBank' | 'TrueMoney' | 'USDT'
    p_is_scheduled_monday_payout?: boolean
  },
  options?: ChonRpcCallOptions<{
    cashout_id?: string
    gross_thb: number
    fee_thb: number
    net_thb: number
    status: string
  }>,
) {
  const minFloorThb = params.p_is_scheduled_monday_payout ? 500 : 200
  if (params.p_gross_thb < minFloorThb) {
    throw new Error(`Minimum withdrawal floor is ฿${minFloorThb}.`)
  }
  const feeThb = params.p_is_scheduled_monday_payout && params.p_gross_thb >= 500 ? 0 : 15
  const netThb = params.p_gross_thb - feeThb
  return callChonSupabaseRpc('rpc_request_cashout_with_circuit_breaker', params, {
    ...options,
    fallbackData: options?.fallbackData ?? {
      cashout_id: `cashout_${params.p_idempotency_key}`,
      gross_thb: params.p_gross_thb,
      fee_thb: feeThb,
      net_thb: netThb,
      status: 'PENDING_WEBHOOK_VERIFICATION',
    },
    normalize:
      options?.normalize ??
      ((raw) => {
        if (raw && typeof raw === 'object' && 'net_thb' in raw) {
          return raw as {
            cashout_id?: string
            gross_thb: number
            fee_thb: number
            net_thb: number
            status: string
          }
        }
        return {
          cashout_id: String(raw ?? `cashout_${params.p_idempotency_key}`),
          gross_thb: params.p_gross_thb,
          fee_thb: feeThb,
          net_thb: netThb,
          status: 'PENDING_WEBHOOK_VERIFICATION',
        }
      }),
  })
}

export async function rpcClaimDailyRewardFromPot(
  params: {
    p_idempotency_key: string
    p_task_id: string
    p_device_hash: string
  },
  options?: ChonRpcCallOptions<{ task_id: string; reward_bonus_coins: number; status: string }>,
) {
  return callChonSupabaseRpc('rpc_claim_daily_reward_from_pot', params, {
    ...options,
    fallbackData: options?.fallbackData ?? {
      task_id: params.p_task_id,
      reward_bonus_coins: 15,
      status: 'CLAIMED',
    },
    normalize:
      options?.normalize ??
      ((raw) => {
        if (raw && typeof raw === 'object' && 'reward_bonus_coins' in raw) {
          return raw as { task_id: string; reward_bonus_coins: number; status: string }
        }
        return {
          task_id: params.p_task_id,
          reward_bonus_coins: Number(raw ?? 15),
          status: 'CLAIMED',
        }
      }),
  })
}

export async function rpcMutualWalkaway(
  params: {
    p_idempotency_key: string
    p_hold_id: string
    p_reason?: string
  },
  options?: ChonRpcCallOptions<{ hold_id: string; status: string; refunded_pct: number }>,
) {
  return callChonSupabaseRpc('rpc_mutual_walkaway', params, {
    ...options,
    fallbackData: options?.fallbackData ?? {
      hold_id: params.p_hold_id,
      status: 'CANCELLED_MUTUAL_WALKAWAY',
      refunded_pct: 100,
    },
    normalize:
      options?.normalize ??
      ((raw) => {
        if (raw && typeof raw === 'object' && 'status' in raw) {
          return raw as { hold_id: string; status: string; refunded_pct: number }
        }
        return {
          hold_id: params.p_hold_id,
          status: typeof raw === 'string' && raw ? raw : 'CANCELLED_MUTUAL_WALKAWAY',
          refunded_pct: 100,
        }
      }),
  })
}

export async function rpcOpenHangoutDispute(
  params: {
    p_idempotency_key: string
    p_hold_id: string
    p_reason: string
  },
  options?: ChonRpcCallOptions<{ dispute_id: string; hold_id: string; status: string }>,
) {
  return callChonSupabaseRpc('rpc_open_hangout_dispute', params, {
    ...options,
    fallbackData: options?.fallbackData ?? {
      dispute_id: `dispute_${params.p_idempotency_key}`,
      hold_id: params.p_hold_id,
      status: 'DISPUTED',
    },
    normalize:
      options?.normalize ??
      ((raw) => {
        if (raw && typeof raw === 'object' && 'dispute_id' in raw) {
          return raw as { dispute_id: string; hold_id: string; status: string }
        }
        return {
          dispute_id: String(raw ?? `dispute_${params.p_idempotency_key}`),
          hold_id: params.p_hold_id,
          status: 'DISPUTED',
        }
      }),
  })
}
