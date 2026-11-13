/**
 * KRING VISUAL V2 · Promo entry = B: there are NO promo strips on screens any more. The only way into rewards is the
 * header gift → "Earn reward 555" sheet (`openRewards()` in ./rewardsModel, sheet in ./RewardsSheet).
 * This component is kept as a no-op so an old mount renders nothing; App can drop the mount.
 */
export default function RewardsStrip(_props: {
  done?: number
  doneIds?: readonly string[]
  total?: number
  coins?: number
  streak?: number
  language?: string
}) {
  return null
}
