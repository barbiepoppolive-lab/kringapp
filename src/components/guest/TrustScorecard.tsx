import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

export const MAX_HOLD_MS = 8000

export interface TrustBadge {
  id: string
  label: string
  value: string
  verified: boolean
}

export interface GhostPhoto {
  id: string
  fileName: string
  watermark: string
  similarity: number
}

export interface GuestTrustProfile {
  guestId: string
  ghostAlias: string
  age: number
  faceVerified: boolean
  punctualityRating: number
  wealthTier: string
  treatEnvelopeLocked: boolean
  photo: GhostPhoto | null
  extraBadges?: TrustBadge[]
}

export interface TrustScorecardProps {
  profile: GuestTrustProfile
  holdDurationMs?: number
}

export function buildTrustBadges(profile: GuestTrustProfile): TrustBadge[] {
  const standardBadges: TrustBadge[] = [
    {
      id: 'face-verified',
      label: 'Face / Passport Verified',
      value: profile.faceVerified ? '1-Face verified' : 'Verification pending',
      verified: profile.faceVerified,
    },
    {
      id: 'age',
      label: 'Age',
      value: `${profile.age} (20+ confirmed)`,
      verified: profile.age >= 20,
    },
    {
      id: 'punctuality',
      label: 'Punctuality',
      value: profile.punctualityRating > 0 ? `★ ${profile.punctualityRating.toFixed(1)}` : 'No experiences yet',
      verified: profile.punctualityRating > 0,
    },
    {
      id: 'wealth-tier',
      label: 'VIP Wealth Tier',
      value: profile.wealthTier,
      verified: true,
    },
    {
      id: 'treat-envelope',
      label: 'Booking',
      value: profile.treatEnvelopeLocked ? 'Held until you meet' : 'Not held yet',
      verified: profile.treatEnvelopeLocked,
    },
  ]

  return [...standardBadges, ...(profile.extraBadges ?? [])]
}

export const DEMO_GHOST_PROFILE: GuestTrustProfile = {
  guestId: 'ghost-guest-8842',
  ghostAlias: 'Ken · Osaka · 3rd trip to Bangkok',
  age: 29,
  faceVerified: true,
  punctualityRating: 4.9,
  wealthTier: 'Gold Front-Row VIP',
  treatEnvelopeLocked: true,
  photo: {
    id: 'ghost-photo-1',
    fileName: 'ghost-preview.jpg',
    watermark: 'Verified Ghost #ghost-guest-8842 · 1-on-1 public venue only',
    similarity: 0.93,
  },
}

export default function TrustScorecard({ profile, holdDurationMs = MAX_HOLD_MS }: TrustScorecardProps) {
  const [isHolding, setIsHolding] = useState(false)
  const holdTimer = useRef<number | null>(null)

  const badges = buildTrustBadges(profile)
  const verifiedCount = badges.filter((badge) => badge.verified).length

  function clearHoldTimer() {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }

  function startHold() {
    clearHoldTimer()
    setIsHolding(true)
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null
      setIsHolding(false)
    }, holdDurationMs)
  }

  function stopHold() {
    clearHoldTimer()
    setIsHolding(false)
  }

  useEffect(() => clearHoldTimer, [])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === ' ' || event.key === 'Enter' || event.key === 'Spacebar') {
      event.preventDefault()
      startHold()
    }
  }

  function handleKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === ' ' || event.key === 'Enter' || event.key === 'Spacebar') {
      event.preventDefault()
      stopHold()
    }
  }

  return (
    <section className="mx-auto w-full max-w-md space-y-4 rounded-3xl border border-stone-800 bg-stone-900 p-5 shadow-2xl">
      <header>
        <h2 className="text-lg font-extrabold tracking-tight">
          Verified Ghost Profile <span className="text-amber-400">🛡️</span>
        </h2>
        <p className="mt-1 text-xs text-stone-400">
          Guests never get a public browse profile. This trust card is visible only to you once they join
          your Guest List — nothing here is public.
        </p>      </header>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-700 bg-stone-950 p-3">
        <div>
          <p className="text-sm font-bold text-stone-100">{profile.ghostAlias}</p>
          <p className="text-[11px] text-stone-500">Ghost ID #{profile.guestId}</p>
        </div>
        <span className="rounded-full border border-emerald-800 bg-emerald-950/60 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
          {verifiedCount}/{badges.length} verified
        </span>
      </div>

      <ul aria-label="Trust badges" className="space-y-2">
        {badges.map((badge) => (
          <li
            key={badge.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-stone-700 bg-stone-950 p-3"
          >
            <span className="flex items-center gap-2 text-xs font-medium text-stone-300">
              <span aria-hidden="true">{badge.verified ? '✅' : '⏳'}</span>
              {badge.label}
            </span>
            <span
              className={`text-xs font-semibold ${badge.verified ? 'text-emerald-300' : 'text-stone-500'}`}
            >
              {badge.value}
            </span>
          </li>
        ))}
      </ul>

      <div>
        <h3 className="text-sm font-bold text-stone-200">Watermarked photo — hold to view</h3>
        <p className="mt-1 text-xs text-stone-400">
          Press and hold to peek at the photo this guest shares with you. Every view is watermarked with
          their Ghost ID, so a screenshot can always be traced back.
        </p>

        {profile.photo === null ? (
          <p className="mt-3 rounded-xl border border-dashed border-stone-700 p-4 text-center text-xs text-stone-500">
            No ghost photo shared yet — the booking isn’t held yet.
          </p>
        ) : (
          <>
            <button
              type="button"
              aria-label={`Hold to view the watermarked photo of ${profile.ghostAlias}`}
              aria-pressed={isHolding}
              onPointerDown={startHold}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onBlur={stopHold}
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              className={`mt-3 w-full rounded-2xl border p-4 text-xs font-bold transition-colors ${
                isHolding
                  ? 'border-amber-400 bg-amber-400/10 text-amber-200'
                  : 'border-stone-700 bg-stone-950 text-stone-300 hover:border-amber-400'
              }`}
            >
              {isHolding ? 'Viewing — release to hide' : 'Hold to view photo'}
            </button>

            {isHolding && (
              <div className="mt-3 space-y-2">
                <div
                  role="img"
                  aria-label={`Watermarked photo preview of ${profile.ghostAlias}`}
                  className="relative flex h-40 items-center justify-center overflow-hidden rounded-2xl border border-amber-800/60 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950"
                >
                  <span className="text-3xl" aria-hidden="true">
                    📷
                  </span>
                  <span className="pointer-events-none absolute inset-x-0 top-2 text-center text-[10px] font-bold uppercase tracking-widest text-amber-300/70">
                    {profile.photo.watermark}
                  </span>
                  <span className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[10px] text-stone-400">
                    {profile.photo.fileName} · {Math.round(profile.photo.similarity * 100)}% face match ·
                    no screenshots
                  </span>
                </div>
                <p role="status" className="text-center text-[11px] text-stone-500">
                  Watermark stays on the file — release the button to hide it again.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
