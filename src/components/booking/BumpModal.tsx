import BumpCheckIn, { type BumpCheckInProps } from './BumpCheckIn'

/**
 * Opus MOTION v2 · V2.4 Bump in 3 Acts (`BumpModal.tsx`)
 *
 * - Act 1 (`approach`): Soft haptic tick every 10m (`navigator.vibrate(8)`), bump button unlocks within `<=100m`.
 * - Act 2 (`contact` at `0ms`): `playKring('release')`, `navigator.vibrate(30)` (`30ms` one-shot),
 *   violet `#9B5CFF` overlap flash (`0–120ms`), shockwave ring (`120–600ms`).
 * - Act 3 (`release` `600–1400ms`): Animated gold coin arcs into the host ring, followed by
 *   `"ส่งเงินถึง [Host] แล้ว ฿..."` / `"Released to [Host] ฿..."`, then the `100%` Tip chips
 *   (`฿50 · ฿100 · ฿200 · ฿500`) and `➕ Add Next Activity` (requiring its own bump).
 */
export type BumpModalProps = BumpCheckInProps

export const BUMP_TIP_CHIPS = [50, 100, 200, 500] as const

export const BUMP_ACT_TIMINGS = {
  approachUnlockMeters: 100,
  approachTickStepMeters: 10,
  approachVibrateMs: 8,
  contactVibrateMs: 30,
  violetFlashColor: '#9B5CFF',
  violetFlashWindowMs: [0, 120] as const,
  shockwaveWindowMs: [120, 600] as const,
  releaseCoinArcWindowMs: [600, 1400] as const,
} as const

export function BumpModal(props: BumpModalProps) {
  return <BumpCheckIn {...props} />
}

export default BumpModal
