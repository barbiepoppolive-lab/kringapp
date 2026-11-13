import { useState } from 'react'

export type HostTierId = 'new' | 'rising' | 'top_vip'

export interface HostTierStatus {
  tierId: HostTierId
  label: string
  badge: string
  completedHangouts: number
  averageRating: number
  highEnergyPct: number
  nextTierHangoutsNeeded: number
}

export interface DoubleBlindReviewSubmission {
  stars: number
  punctual: boolean
  unhurriedHighEnergy: boolean
  faceVerifiedAccurate: boolean
  comment: string
  submittedAtIso: string
}

export interface DoubleBlindReviewSession {
  hangoutId: string
  hostName: string
  guestHandle: string
  venue: string
  elapsedHours: number
  guestReview: DoubleBlindReviewSubmission | null
  hostReview: DoubleBlindReviewSubmission | null
}

export interface LivePlatformConfig {
  hostSharePct: number
  minHangoutThb: number
  freeCashoutThresholdThb: number
  luckyRtpPct: number
  blindGpsPickupEnabled: boolean
  preWinnerRegexMaskEnabled: boolean
}

export function resolveDoubleBlindVisibility(session: DoubleBlindReviewSession): {
  isUnlocked: boolean
  reason: 'both_submitted' | 'window_48h_expired' | 'waiting_double_blind'
} {
  if (session.guestReview && session.hostReview) {
    return { isUnlocked: true, reason: 'both_submitted' }
  }
  if (session.elapsedHours >= 48) {
    return { isUnlocked: true, reason: 'window_48h_expired' }
  }
  return { isUnlocked: false, reason: 'waiting_double_blind' }
}

export function calculateHostTierProgression(
  completedHangouts: number,
  averageRating: number,
  highEnergyPct: number,
): HostTierStatus {
  if (completedHangouts >= 20 && averageRating >= 4.85 && highEnergyPct >= 95) {
    return {
      tierId: 'top_vip',
      label: 'Top VIP Host',
      badge: '👑 Top VIP Host',
      completedHangouts,
      averageRating,
      highEnergyPct,
      nextTierHangoutsNeeded: 0,
    }
  }
  if (completedHangouts >= 5 && averageRating >= 4.7) {
    return {
      tierId: 'rising',
      label: 'Rising Star',
      badge: '🔥 Rising Star',
      completedHangouts,
      averageRating,
      highEnergyPct,
      nextTierHangoutsNeeded: Math.max(0, 20 - completedHangouts),
    }
  }
  return {
    tierId: 'new',
    label: 'New Host',
    badge: '🌱 New Host',
    completedHangouts,
    averageRating,
    highEnergyPct,
    nextTierHangoutsNeeded: Math.max(0, 5 - completedHangouts),
  }
}

export default function ReviewAndAdminConsole() {
  const [reviewSession, setReviewSession] = useState<DoubleBlindReviewSession>({
    hangoutId: 'hangout-tichuca-8841',
    hostName: 'Mint',
    guestHandle: '@Alex_UK',
    venue: 'Tichuca Rooftop Bar · Bangkok',
    elapsedHours: 6,
    guestReview: {
      stars: 5,
      punctual: true,
      unhurriedHighEnergy: true,
      faceVerifiedAccurate: true,
      comment: 'Amazing rooftop vibes, 100% real photos and super fun energy! 🥂',
      submittedAtIso: '2026-10-17T21:00:00Z',
    },
    hostReview: null,
  })

  const [completedHangouts, setCompletedHangouts] = useState<number>(19)
  const averageRating = 4.95
  const highEnergyPct = 99

  const [config, setConfig] = useState<LivePlatformConfig>({
    hostSharePct: 80,
    minHangoutThb: 300,
    freeCashoutThresholdThb: 1000,
    luckyRtpPct: 80,
    blindGpsPickupEnabled: true,
    preWinnerRegexMaskEnabled: true,
  })
  const [configSavedNotice, setConfigSavedNotice] = useState<string | null>(null)
  const [circuitAlerts, setCircuitAlerts] = useState<
    Array<{
      id: string
      title: string
      detail: string
      status: 'PENDING_REVIEW' | 'FROZEN BY FOUNDER' | 'RESOLVED & SAFE'
    }>
  >([
    {
      id: 'alert-cashout-ploy',
      title: '💸 Flagged PromptPay Cashout · Ploy (฿12,500)',
      detail:
        'Triggered Circuit Breaker: PromptPay number changed 2h ago (<24h cooldown) & exceeds ฿10,000/day auto-cap.',
      status: 'PENDING_REVIEW',
    },
    {
      id: 'alert-lucky-glitch',
      title: '🍀 Lucky Pool Glitch Clamp · 500x Spin Auto-Capped',
      detail:
        'Hard Reserve Clamp stopped a glitched 500x payout from exceeding Pool Reserve. House 8% profit locked safely (฿0 loss).',
      status: 'PENDING_REVIEW',
    },
  ])
  const [revenuePreset, setRevenuePreset] = useState<'pilot' | 'growth' | 'scale'>('pilot')
  const [globalEmergencyFreeze, setGlobalEmergencyFreeze] = useState(false)
  const [subsystems, setSubsystems] = useState({
    promptPay5s: true,
    foreignCards: true,
    usdtWatcher: true,
    luckyJackpots: true,
    hangoutEnvelopes: true,
    dailyTaskPot: true,
  })
  const [dlqReplayed, setDlqReplayed] = useState(false)
  const [snapshotDownloaded, setSnapshotDownloaded] = useState(false)
  const [escrowOverrideStatus, setEscrowOverrideStatus] = useState<string | null>(null)
  const [copiedScoutLeadId, setCopiedScoutLeadId] = useState<string | null>(null)
  const [scoutLeadStatuses, setScoutLeadStatuses] = useState<Record<string, string>>({
    'lead-1': '✅ Joined',
    'lead-2': '💬 Contacted',
    'lead-3': '📩 To Contact',
  })

  const REVENUE_PRESETS = {
    pilot: {
      label: '🌱 Pilot (10 Meets/d)',
      hangoutsNetThb: 70_200,
      luckyNetThb: 66_150,
      treatsNetThb: 15_600,
      pulseNetThb: 22_500,
      feesNetThb: 6_500,
      totalNetThb: 180_950,
      inrDisplay: '₹4,52,375 / mo',
      usdDisplay: '$5,322 / mo',
    },
    growth: {
      label: '🔥 Growth (60 Meets/d)',
      hangoutsNetThb: 421_200,
      luckyNetThb: 441_000,
      treatsNetThb: 93_600,
      pulseNetThb: 135_000,
      feesNetThb: 34_000,
      totalNetThb: 1_124_800,
      inrDisplay: '₹28,12,000 / mo',
      usdDisplay: '$33,082 / mo',
    },
    scale: {
      label: '👑 Scale (300 Meets/d)',
      hangoutsNetThb: 2_340_000,
      luckyNetThb: 2_450_000,
      treatsNetThb: 468_000,
      pulseNetThb: 675_000,
      feesNetThb: 145_000,
      totalNetThb: 6_078_000,
      inrDisplay: '₹1,51,95,000 / mo',
      usdDisplay: '$178,765 / mo',
    },
  } as const
  const activeRev = REVENUE_PRESETS[revenuePreset]

  const visibility = resolveDoubleBlindVisibility(reviewSession)
  const tierStatus = calculateHostTierProgression(
    completedHangouts,
    averageRating,
    highEnergyPct,
  )

  const handleSubmitHostReview = () => {
    setReviewSession((prev) => ({
      ...prev,
      hostReview: {
        stars: 5,
        punctual: true,
        unhurriedHighEnergy: true,
        faceVerifiedAccurate: true,
        comment: 'Polite gentleman, arrived right on time at Tichuca! 🥂✨',
        submittedAtIso: '2026-10-17T22:15:00Z',
      },
    }))
    setCompletedHangouts((prev) => prev + 1)
  }

  const handleExpire48hTimer = () => {
    setReviewSession((prev) => ({
      ...prev,
      elapsedHours: 48,
    }))
  }

  const handleSaveConfig = () => {
    setConfigSavedNotice(
      `✅ Live DB config updated: Host ${config.hostSharePct}% · Min ฿${config.minHangoutThb} · Free PromptPay ≥ ฿${config.freeCashoutThresholdThb} · Lucky RTP ${config.luckyRtpPct}%`,
    )
  }

  return (
    <section
      data-testid="review-and-admin-console"
      className="space-y-3 rounded-3xl border border-amber-400/35 bg-[#160F29] p-3.5 text-xs text-purple-100 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
        <div>
          <h3 className="text-sm font-black text-white">
            🛡️ 48h Double-Blind Review &amp; Founder Live Config
          </h3>
          <p className="text-[10.5px] text-purple-200/75">
            Post-Hangout Trust Engine · Automatic Host Progression · DB Config
          </p>
        </div>
        <span
          data-testid="host-tier-badge"
          className="rounded-full border border-amber-400/60 bg-amber-500/20 px-2.5 py-1 text-[10px] font-black text-amber-200"
        >
          {tierStatus.badge}
        </span>
      </div>

      {/* 1. 48-Hour Double-Blind Review Card */}
      <div
        data-testid="double-blind-review-card"
        className="space-y-2 rounded-2xl border border-white/10 bg-[#1F1538] p-3"
      >
        <div className="flex items-center justify-between">
          <span className="font-extrabold text-amber-300">
            🥂 {reviewSession.hostName} ⇄ {reviewSession.guestHandle} ({reviewSession.venue})
          </span>
          <span
            data-testid="double-blind-status-pill"
            className={`rounded-full px-2 py-0.5 text-[9.5px] font-black ${
              visibility.isUnlocked
                ? 'border border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                : 'border border-amber-400/50 bg-amber-500/20 text-amber-200'
            }`}
          >
            {visibility.isUnlocked
              ? '🔓 Double-Blind Unlocked & Published'
              : `🔒 Hidden (${48 - reviewSession.elapsedHours}h left in 48h Blind Window)`}
          </span>
        </div>

        {!visibility.isUnlocked ? (
          <div className="space-y-2">
            <p
              data-testid="blind-hidden-notice"
              className="rounded-xl border border-amber-400/30 bg-black/30 px-2.5 py-1.5 text-[10.5px] text-amber-100"
            >
              🔒 Guest review is sealed in the 48-hour double-blind vault until {reviewSession.hostName}{' '}
              submits her review or the 48h timer expires.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="submit-host-blind-review-btn"
                onClick={handleSubmitHostReview}
                className="rounded-xl bg-gradient-to-r from-[#FF4D8D] to-[#9333EA] px-3 py-1.5 text-[10.5px] font-black text-white shadow"
              >
                ✍️ Submit {reviewSession.hostName}&apos;s 5★ Review (Unlock Both)
              </button>
              <button
                type="button"
                data-testid="fast-forward-48h-btn"
                onClick={handleExpire48hTimer}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-[10.5px] font-bold text-purple-100"
              >
                ⏩ Simulate 48h Expiry
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div
              data-testid="unlocked-reviews-panel"
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              {reviewSession.guestReview && (
                <div className="rounded-xl border border-emerald-400/30 bg-black/35 p-2">
                  <p className="font-extrabold text-emerald-300">
                    ✈️ Guest ({reviewSession.guestHandle}): {reviewSession.guestReview.stars}★
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-purple-100">
                    &ldquo;{reviewSession.guestReview.comment}&rdquo;
                  </p>
                  <p className="mt-1 text-[9.5px] text-emerald-200/90">
                    ✅ Punctual · ⚡ High-Energy · 🟢 1-Face Matched
                  </p>
                </div>
              )}
              {reviewSession.hostReview ? (
                <div className="rounded-xl border border-pink-400/30 bg-black/35 p-2">
                  <p className="font-extrabold text-pink-300">
                    👸 Host ({reviewSession.hostName}): {reviewSession.hostReview.stars}★
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-purple-100">
                    &ldquo;{reviewSession.hostReview.comment}&rdquo;
                  </p>
                  <p className="mt-1 text-[9.5px] text-pink-200/90">
                    ✅ Gentleman Verified · Zero No-Show
                  </p>
                </div>
              ) : (
                <div
                  data-testid="expired-host-review-notice"
                  className="rounded-xl border border-amber-400/35 bg-amber-500/10 p-2"
                >
                  <p className="font-extrabold text-amber-300">
                    ⏰ 48h Window Expired — Auto-Published
                  </p>
                  <p className="mt-0.5 text-[10px] text-purple-100">
                    Host ({reviewSession.hostName}) did not submit within 48h. Guest review unlocked automatically without retaliation risk.
                  </p>
                </div>
              )}
            </div>
            <button
              type="button"
              data-testid="reset-blind-review-demo-btn"
              onClick={() => {
                setReviewSession({
                  hangoutId: 'hangout-tichuca-8841',
                  hostName: 'Mint',
                  guestHandle: '@Alex_UK',
                  venue: 'Tichuca Rooftop Bar · Bangkok',
                  elapsedHours: 6,
                  guestReview: {
                    stars: 5,
                    punctual: true,
                    unhurriedHighEnergy: true,
                    faceVerifiedAccurate: true,
                    comment:
                      'Amazing rooftop vibes, 100% real photos and super fun energy! 🥂',
                    submittedAtIso: '2026-10-17T21:00:00Z',
                  },
                  hostReview: null,
                })
                setCompletedHangouts(19)
              }}
              className="w-full rounded-xl border border-white/15 bg-white/5 py-1.5 text-[10px] font-extrabold text-purple-200 hover:bg-white/10"
            >
              🔄 Reset 48h Blind Review Demo
            </button>
          </div>
        )}
      </div>

      {/* 2. Automatic Host Tier Progression Card */}
      <div
        data-testid="host-progression-card"
        className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-[#1F1538] p-3"
      >
        <div>
          <p className="font-extrabold text-white">
            📈 Host Auto-Progression: {tierStatus.badge}
          </p>
          <p data-testid="host-progression-stats" className="text-[10.5px] text-purple-200/85">
            {completedHangouts} Verified Hangouts · ⭐ {averageRating.toFixed(2)} · ⚡{' '}
            {highEnergyPct}% High-Energy
          </p>
        </div>
        <span className="rounded-lg border border-white/15 bg-black/35 px-2.5 py-1 text-[10px] font-bold text-amber-200">
          {tierStatus.nextTierHangoutsNeeded === 0
            ? '🏆 Max Tier Reached'
            : `${tierStatus.nextTierHangoutsNeeded} more to 👑 Top VIP`}
        </span>
      </div>

      {/* 3. Founder Fraud, Payout & Lucky Pool Circuit-Breaker Queue */}
      <div
        data-testid="founder-circuit-breaker-queue"
        className="space-y-2 rounded-2xl border border-rose-400/35 bg-[#1F1538] p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <span className="font-extrabold text-rose-200">
            🛡️ Founder Fraud, Payout &amp; Lucky Pool Circuit-Breaker
          </span>
          <span
            data-testid="lucky-pool-solvency-pill"
            className="rounded-full border border-emerald-400/50 bg-emerald-500/15 px-2 py-0.5 text-[9.5px] font-black text-emerald-200"
          >
            🍀 Pool Reserve: 🪙 420,000 · House 8% Locked ✅
          </span>
        </div>

        <div className="space-y-1.5">
          {circuitAlerts.map((alert) => (
            <div
              key={alert.id}
              className="rounded-xl border border-white/10 bg-black/35 p-2 text-[10.5px]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold text-white">{alert.title}</span>
                <span
                  data-testid={`circuit-status-${alert.id}`}
                  className={`rounded-full px-2 py-0.5 text-[9px] font-black ${
                    alert.status === 'FROZEN BY FOUNDER'
                      ? 'border border-rose-400/50 bg-rose-500/20 text-rose-200'
                      : alert.status === 'RESOLVED & SAFE'
                        ? 'border border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                        : 'border border-amber-400/50 bg-amber-500/20 text-amber-200'
                  }`}
                >
                  {alert.status}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-purple-200/85">{alert.detail}</p>
              <div className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  data-testid={`circuit-approve-btn-${alert.id}`}
                  onClick={() =>
                    setCircuitAlerts((prev) =>
                      prev.map((item) =>
                        item.id === alert.id ? { ...item, status: 'RESOLVED & SAFE' } : item,
                      ),
                    )
                  }
                  className="rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-1 text-[9.5px] font-black text-emerald-200"
                >
                  ✅ Approve / Safe
                </button>
                <button
                  type="button"
                  data-testid={`circuit-freeze-btn-${alert.id}`}
                  onClick={() =>
                    setCircuitAlerts((prev) =>
                      prev.map((item) =>
                        item.id === alert.id ? { ...item, status: 'FROZEN BY FOUNDER' } : item,
                      ),
                    )
                  }
                  className="rounded-lg border border-rose-400/40 bg-rose-500/20 px-2.5 py-1 text-[9.5px] font-black text-rose-200"
                >
                  🚨 Freeze Now
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Founder Live DB `config` Table Editor */}
      <div
        data-testid="founder-config-console"
        className="space-y-2 rounded-2xl border border-amber-400/30 bg-[#1F1538] p-3"
      >
        <div className="flex items-center justify-between">
          <span className="font-extrabold text-amber-300">
            ⚙️ Live Database `config` Table (Zero Hardcoded Prices)
          </span>
          <button
            type="button"
            data-testid="save-live-config-btn"
            onClick={handleSaveConfig}
            className="rounded-lg bg-amber-400 px-2.5 py-1 text-[10px] font-black text-[#1A1030]"
          >
            💾 Save `config`
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10.5px]">
          <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-2.5 py-1.5">
            <span>👸 Host Split %</span>
            <input
              aria-label="Host Split Percentage"
              data-testid="config-host-split-input"
              type="number"
              min={50}
              max={95}
              value={config.hostSharePct}
              onChange={(e) => {
                const raw = Number(e.target.value) || 80
                const clamped = Math.min(95, Math.max(50, raw))
                setConfig((prev) => ({
                  ...prev,
                  hostSharePct: clamped,
                  platformMarginPct: Math.max(5, 100 - clamped),
                }))
              }}
              className="w-14 rounded bg-white/10 px-1.5 py-0.5 text-right font-black text-amber-300"
            />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-2.5 py-1.5">
            <span>🥂 Min Floor (฿)</span>
            <input
              aria-label="Minimum Hangout Baht"
              data-testid="config-min-baht-input"
              type="number"
              min={100}
              value={config.minHangoutThb}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  minHangoutThb: Math.max(100, Number(e.target.value) || 300),
                }))
              }
              className="w-16 rounded bg-white/10 px-1.5 py-0.5 text-right font-black text-emerald-300"
            />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-2.5 py-1.5">
            <span>💸 Free Cashout ≥ ฿</span>
            <input
              aria-label="Free Cashout Threshold Baht"
              data-testid="config-free-cashout-input"
              type="number"
              min={100}
              value={config.freeCashoutThresholdThb}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  freeCashoutThresholdThb: Math.max(100, Number(e.target.value) || 1000),
                }))
              }
              className="w-16 rounded bg-white/10 px-1.5 py-0.5 text-right font-black text-cyan-300"
            />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-2.5 py-1.5">
            <span>🍀 Lucky RTP %</span>
            <input
              aria-label="Lucky Gift RTP Percentage"
              data-testid="config-lucky-rtp-input"
              type="number"
              min={70}
              max={99}
              value={config.luckyRtpPct}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  luckyRtpPct: Math.min(99, Math.max(70, Number(e.target.value) || 95)),
                }))
              }
              className="w-14 rounded bg-white/10 px-1.5 py-0.5 text-right font-black text-pink-300"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <button
            type="button"
            data-testid="config-blind-gps-toggle"
            onClick={() =>
              setConfig((prev) => ({
                ...prev,
                blindGpsPickupEnabled: !prev.blindGpsPickupEnabled,
              }))
            }
            className={`flex items-center justify-between rounded-xl border px-2.5 py-1.5 font-extrabold transition ${
              config.blindGpsPickupEnabled
                ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                : 'border-white/10 bg-black/30 text-stone-400'
            }`}
          >
            <span>🚖 Blind-GPS Pickup</span>
            <span>{config.blindGpsPickupEnabled ? 'ON ✓' : 'OFF'}</span>
          </button>
          <button
            type="button"
            data-testid="config-regex-mask-toggle"
            onClick={() =>
              setConfig((prev) => ({
                ...prev,
                preWinnerRegexMaskEnabled: !prev.preWinnerRegexMaskEnabled,
              }))
            }
            className={`flex items-center justify-between rounded-xl border px-2.5 py-1.5 font-extrabold transition ${
              config.preWinnerRegexMaskEnabled
                ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                : 'border-white/10 bg-black/30 text-stone-400'
            }`}
          >
            <span>🛡️ Anti-Leak Mask</span>
            <span>{config.preWinnerRegexMaskEnabled ? 'ON ✓' : 'OFF'}</span>
          </button>
        </div>

        {configSavedNotice && (
          <p
            data-testid="config-saved-notice"
            className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1.5 text-[10px] font-bold text-emerald-200"
          >
            {configSavedNotice}
          </p>
        )}
      </div>

      {/* 5. Founder Real-Time Revenue & Lucky 3.5x Churn Calculator (฿ / ₹ / $) */}
      <div
        data-testid="founder-revenue-calculator-card"
        className="space-y-2 rounded-2xl border border-emerald-400/35 bg-[#1F1538] p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <span className="font-extrabold text-emerald-300">
            💰 Founder Net Profit &amp; Lucky 3.5× Churn Estimator
          </span>
          <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[9.5px] font-black text-amber-200">
            All 5 Streams · 0% Downside Pool
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-[10px]">
          {(
            [
              { id: 'pilot', testId: 'revenue-preset-pilot-btn', label: '🌱 Pilot (10/d)' },
              { id: 'growth', testId: 'revenue-preset-growth-btn', label: '🔥 Growth (60/d)' },
              { id: 'scale', testId: 'revenue-preset-scale-btn', label: '👑 Scale (300/d)' },
            ] as const
          ).map((btn) => (
            <button
              key={btn.id}
              type="button"
              data-testid={btn.testId}
              onClick={() => setRevenuePreset(btn.id)}
              className={`rounded-xl border py-1.5 font-black transition ${
                revenuePreset === btn.id
                  ? 'border-emerald-400 bg-emerald-400 text-[#071915] shadow'
                  : 'border-white/10 bg-black/30 text-purple-100 hover:bg-white/10'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-emerald-400/30 bg-black/40 p-2.5 text-center">
          <p
            data-testid="founder-net-profit-thb"
            className="text-xl font-black text-emerald-300"
          >
            ฿{activeRev.totalNetThb.toLocaleString('en-US')} / mo Net Profit
          </p>
          <p
            data-testid="founder-net-profit-inr-usd"
            className="text-[11px] font-extrabold text-amber-200"
          >
            {activeRev.inrDisplay} · {activeRev.usdDisplay}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-1">
            <span className="text-purple-200/80">🥂 Hangouts (~13%):</span>{' '}
            <span className="font-black text-white">
              ฿{activeRev.hangoutsNetThb.toLocaleString('en-US')}
            </span>
          </div>
          <div className="rounded-lg border border-pink-400/30 bg-black/30 px-2 py-1">
            <span className="text-pink-200">🍀 Lucky 7% × 3.5×:</span>{' '}
            <span className="font-black text-amber-300">
              ฿{activeRev.luckyNetThb.toLocaleString('en-US')}
            </span>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-1">
            <span className="text-purple-200/80">🧋 Chat Treats:</span>{' '}
            <span className="font-black text-white">
              ฿{activeRev.treatsNetThb.toLocaleString('en-US')}
            </span>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-1">
            <span className="text-purple-200/80">⚡ Cabs + Fees:</span>{' '}
            <span className="font-black text-emerald-300">
              ฿{(activeRev.pulseNetThb + activeRev.feesNetThb).toLocaleString('en-US')}
            </span>
          </div>
        </div>
      </div>

      {/* 6. MOD1-17 CFO Margin Protection & MOD1-19 3 Leak Locks (Visual Board 2 Screens 1 & 2) */}
      <div
        data-testid="mod1-cfo-margin-armor-card"
        className="space-y-2.5 rounded-2xl border border-amber-400/40 bg-[#1B1133] p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <span className="font-extrabold text-amber-300">
            🛡️ CFO Margin Armor &amp; Unified 100 🪙 = ฿1 THB
          </span>
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9.5px] font-black text-emerald-300">
            ✅ 2.5× Overpayment Fixed
          </span>
        </div>

        <div className="space-y-1.5 rounded-xl border border-white/10 bg-black/35 p-2.5 text-[10.5px]">
          <p className="font-black text-white">
            📊 ฿1,500 Hangout Split (9%–15% Guaranteed Chon! Margin Floor):
          </p>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[80%] bg-emerald-400" title="Host 80%" />
            <div className="h-full w-[11%] bg-purple-500" title="Agency Cap 5%-10% + Scout 1%" />
            <div className="h-full w-[9%] bg-amber-400" title="Chon! Net Margin Floor 9%-15%" />
          </div>
          <div className="grid grid-cols-3 gap-1 pt-0.5 text-[9.5px] font-bold">
            <span className="text-emerald-300">👸 Host 80% (฿1,200)</span>
            <span className="text-purple-300">👑 Agency Cap 6–11%</span>
            <span className="text-amber-300">🏦 Chon! 9–15% Floor</span>
          </div>
        </div>

        <div
          data-testid="mod1-three-leak-locks-grid"
          className="grid grid-cols-1 gap-1.5 text-[10px]"
        >
          <div className="flex items-center justify-between rounded-xl border border-emerald-400/30 bg-emerald-950/25 px-2.5 py-1.5">
            <span>🔒 Leak 1 (1,000 🪙 Mystery Box):</span>
            <span className="font-black text-emerald-300">80% RTP Pool (+80 🪙 House Locked)</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-emerald-400/30 bg-emerald-950/25 px-2.5 py-1.5">
            <span>🔒 Leak 2 (3× Story Toasts · 300 🪙):</span>
            <span className="font-black text-emerald-300">+15 🪙 Daily Cap (+45 🪙 Net Locked)</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-amber-400/35 bg-amber-950/25 px-2.5 py-1.5">
            <span>🔒 Leak 3 (500 🪙 Starter Chest):</span>
            <span className="font-black text-amber-300">Gated on 1st ฿300 Top-Up (0-Bot Shield)</span>
          </div>
        </div>
      </div>

      {/* 7. MOD1-15 Founder Operations & Manual Kill-Switch Command Center (Visual Board 2 Screen 3) */}
      <div
        data-testid="mod1-founder-killswitch-cockpit"
        className="space-y-2.5 rounded-2xl border border-rose-500/45 bg-[#1E102C] p-3"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-black text-rose-300">
            🛑 Founder Manual Kill-Switch Command Center
          </span>
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9.5px] font-black text-emerald-300">
            🛡️ 100.0% SOLVENT ✅
          </span>
        </div>

        <button
          type="button"
          data-testid="killswitch-global-freeze-btn"
          onClick={() => setGlobalEmergencyFreeze((prev) => !prev)}
          className={`w-full rounded-xl border py-2 text-center text-xs font-black shadow-lg transition ${
            globalEmergencyFreeze
              ? 'border-amber-300 bg-amber-400 text-slate-950'
              : 'border-rose-400/60 bg-gradient-to-r from-rose-600 to-red-600 text-white hover:brightness-110'
          }`}
        >
          {globalEmergencyFreeze
            ? '⏸️ ALL MONEY MOVEMENT FROZEN (1ms Lock Active — Tap to Resume)'
            : '🛑 EMERGENCY FREEZE ALL MONEY MOVEMENT (1ms Global Lock)'}
        </button>

        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          {(
            [
              { key: 'promptPay5s', label: '🏦 5s PromptPay' },
              { key: 'foreignCards', label: '💳 Foreign Cards' },
              { key: 'usdtWatcher', label: '💎 USDT Watcher' },
              { key: 'luckyJackpots', label: '🎰 Lucky Jackpots' },
              { key: 'hangoutEnvelopes', label: '🥂 New Envelopes' },
              { key: 'dailyTaskPot', label: '🎁 1% Task Pot' },
            ] as const
          ).map((sw) => {
            const isLive = !globalEmergencyFreeze && subsystems[sw.key]
            return (
              <button
                key={sw.key}
                type="button"
                data-testid={`killswitch-toggle-${sw.key}`}
                onClick={() =>
                  setSubsystems((prev) => ({ ...prev, [sw.key]: !prev[sw.key] }))
                }
                className={`flex items-center justify-between rounded-xl border px-2.5 py-1.5 font-extrabold transition ${
                  isLive
                    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                    : 'border-rose-400/45 bg-rose-950/50 text-rose-200'
                }`}
              >
                <span>{sw.label}</span>
                <span>{isLive ? '🟢 LIVE' : '⏸️ PAUSED'}</span>
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-1.5 pt-0.5 text-[10px]">
          <button
            type="button"
            data-testid="dlq-replay-webhooks-btn"
            onClick={() => setDlqReplayed(true)}
            className="rounded-xl border border-amber-400/45 bg-amber-500/20 px-2 py-1.5 font-black text-amber-200 hover:bg-amber-500/30"
          >
            {dlqReplayed ? '✅ 2 DLQ Webhooks Credited!' : '🔄 Replay DLQ Webhooks (2)'}
          </button>
          <button
            type="button"
            data-testid="download-encrypted-snapshot-btn"
            onClick={() => setSnapshotDownloaded(true)}
            className="rounded-xl border border-cyan-400/45 bg-cyan-500/20 px-2 py-1.5 font-black text-cyan-200 hover:bg-cyan-500/30"
          >
            {snapshotDownloaded ? '✅ SHA-256 Snapshot Saved!' : '📥 06:00 AM Ledger Backup'}
          </button>
        </div>
      </div>

      {/* 8. MOD1-15 Live Escrow Override + MOD1-07 16,793-Group Scout Outreach CRM (Visual Board 2 Screen 4) */}
      <div
        data-testid="mod1-scout-outreach-crm"
        className="space-y-2.5 rounded-2xl border border-purple-400/40 bg-[#1B1235] p-3"
      >
        <div className="flex items-center justify-between">
          <span className="font-extrabold text-amber-300">
            🥂 Live Escrow Override &amp; 16,793-Group Scout CRM
          </span>
          <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[9.5px] font-black text-purple-200">
            🟢 24 Hosts · ฿36k Held
          </span>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/35 p-2.5 space-y-1.5 text-[10.5px]">
          <div className="flex items-center justify-between font-bold text-white">
            <span>Active Meet: @Alex_UK ⇄ Ploy (Tichuca)</span>
            <span className="text-amber-300">฿1,500 Held</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              data-testid="force-pay-host-btn"
              onClick={() =>
                setEscrowOverrideStatus('✅ Forced 80% Payout (฿1,200) to Ploy PromptPay!')
              }
              className="rounded-lg bg-emerald-500/25 border border-emerald-400/50 py-1.5 text-[10px] font-black text-emerald-200 hover:bg-emerald-500/35"
            >
              ✅ Force Pay Host 80%
            </button>
            <button
              type="button"
              data-testid="force-refund-guest-btn"
              onClick={() =>
                setEscrowOverrideStatus('↩️ Forced 100% Refund (🪙 150,000) to @Alex_UK Wallet!')
              }
              className="rounded-lg bg-rose-500/25 border border-rose-400/50 py-1.5 text-[10px] font-black text-rose-200 hover:bg-rose-500/35"
            >
              ↩️ Force Refund Guest 100%
            </button>
          </div>
          {escrowOverrideStatus && (
            <p className="text-[10px] font-bold text-emerald-300">{escrowOverrideStatus}</p>
          )}
        </div>

        <div className="space-y-1.5 text-[10px]">
          {[
            { id: 'lead-1', name: 'พริตตี้ MC งานกลางคืน BKK (18,400 members)' },
            { id: 'lead-2', name: 'หางาน PR ทองหล่อ-สุขุมวิท (12,900 members)' },
            { id: 'lead-3', name: 'นางแบบ Freelance พัทยา-กทม (9,650 members)' },
          ].map((lead) => (
            <div
              key={lead.id}
              className="flex items-center justify-between gap-1.5 rounded-xl border border-white/10 bg-black/30 px-2.5 py-1.5"
            >
              <span className="truncate font-bold text-purple-100">{lead.name}</span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  data-testid={`copy-scout-vip-link-${lead.id}`}
                  onClick={() => setCopiedScoutLeadId(lead.id)}
                  className="rounded-lg border border-amber-400/45 bg-amber-500/20 px-2 py-0.5 text-[9.5px] font-black text-amber-200"
                >
                  {copiedScoutLeadId === lead.id ? '✅ Copied' : '💬 Copy VIP Link'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setScoutLeadStatuses((prev) => ({
                      ...prev,
                      [lead.id]:
                        prev[lead.id] === '📩 To Contact'
                          ? '💬 Contacted'
                          : prev[lead.id] === '💬 Contacted'
                            ? '✅ Joined'
                            : '🔥 10+ Girls Live',
                    }))
                  }
                  className="rounded-lg bg-emerald-500/20 px-2 py-0.5 text-[9.5px] font-black text-emerald-300"
                >
                  {scoutLeadStatuses[lead.id]}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

