import './price-skeleton.css'

/**
 * FIX1 · Marco 4/5 — the Kring Price loading frame, drawn in the tab's REAL layout (title row · Bangkok/Pattaya
 * switch · "You saved" bar · Price Check card · price-gap hero · 4 service tiles), so nothing jumps when the chunk
 * lands and the hero's laser (which waits until the hero is on screen) is the first thing that moves.
 * ONE light sweep, then still. Tiny on purpose: App.tsx can import it eagerly as the pulse tab's Suspense fallback:
 *   <Suspense fallback={<PriceSkeleton label="Loading Kring Price…" />}>
 */
export default function PriceSkeleton({ label = 'Loading Kring Price…' }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" className="kps" data-testid="kring-price-skeleton">
      <span className="sr-only">{label}</span>
      <i className="kps-title" aria-hidden="true" />
      <i className="kps-city" aria-hidden="true" />
      <i className="kps-saved" aria-hidden="true" />
      <i className="kps-card kps-check" aria-hidden="true" />
      <i className="kps-card kps-hero" aria-hidden="true" />
      <span className="kps-tiles" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
    </div>
  )
}
