import { useLayoutEffect, useRef, useState, type CSSProperties, type ImgHTMLAttributes } from 'react'
import { hostPlaceholderVars } from '../../lib/imageFallback'
import './host-photo.css'

/**
 * NEXT95 · HostPhoto — the ONE way to show a host's face. (V2 visual round: colourful fallbacks, never a letter or a
 * brown block.)
 *
 * The wrapper (`.hp.hp-v2`) paints a vivid per-host gradient (hue from the name) and a dark head-and-shoulders
 * silhouette with a soft coloured rim (inline SVG, like the approved mockups). Pass `scene` (any photo URL — e.g. the
 * local's signature experience photo) and the placeholder becomes that scene, blurred and tinted in the host's colour,
 * with the silhouette in front: a "photo card" even before / without the real photo. The real `<img>` sits on top at
 * opacity 0 and crossfades in once decoded; if it fails, the placeholder simply stays. Reduced motion → it appears.
 *
 *   <HostPhoto src={host.photo} name={host.name} alt="Mint photo" className="kx-lc-frame" scene="/photos/…jpg" />
 *   <HostPhoto src={avatar} name="Mint" round className="cp-av" />            // chat avatars
 *
 * Exactly one `<img>` is rendered (tests that look for `getByRole('img')` inside a card keep working); the wrapper is
 * a plain span. All extra props go to the `<img>` (data-testid, onClick, draggable, loading, style…).
 */
export interface HostPhotoProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  src?: string | null
  /** host name — seeds the placeholder colour (also used as `data-fallback-name`) */
  name: string
  alt?: string
  /** class on the wrapper (sizing / positioning lives here) */
  className?: string
  /** class on the <img> */
  imgClassName?: string
  round?: boolean
  /** style on the wrapper */
  frameStyle?: CSSProperties
  /** optional scene photo behind the silhouette (blurred + tinted) while / if the real photo isn't there */
  scene?: string
}

/** two silhouettes (short / long hair), picked per name so a grid never repeats one shape. Dark fill + a thin rim
 *  of the host colour on the head and shoulders, like the approved mockups. */
function Silhouette({ long }: { long: boolean }) {
  return (
    <svg className="hp-sil" viewBox="0 0 100 100" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
      <g className="hp-sil-fill">
        {long && <path d="M31 46c0-14 8-24 19-24s19 10 19 24c0 9-2 15-1 21-6 3-12 4-18 4s-12-1-18-4c1-6-1-12-1-21z" />}
        <circle cx="50" cy="42" r="17" />
        <path d="M43 55h14v14H43z" />
        <path d="M6 100c2-20 18-31 44-31s42 11 44 31z" />
      </g>
      <g className="hp-sil-rim">
        {long ? <path d="M31.5 44c0-13 8-22 18.5-22s18.5 9 18.5 22" /> : <path d="M34 38a16.5 16.5 0 0132 0" />}
        <path d="M8 100c2-19 18-30 42-30s40 11 42 30" />
      </g>
    </svg>
  )
}

export default function HostPhoto({
  src,
  name,
  alt = '',
  className = '',
  imgClassName = '',
  round = false,
  frameStyle,
  scene,
  onLoad,
  onError,
  ...imgProps
}: HostPhotoProps) {
  const ref = useRef<HTMLImageElement | null>(null)
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>(src ? 'loading' : 'failed')

  // a new src starts over; an image the browser already has (cache / instant decode) shows with no fade
  useLayoutEffect(() => {
    if (!src) {
      setState('failed')
      return
    }
    const img = ref.current
    if (img && img.complete && img.naturalWidth > 0) setState('loaded')
    else setState('loading')
  }, [src])

  let sum = 0
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i)
  const long = sum % 2 === 0
  return (
    <span
      className={`hp hp-v2${round ? ' is-round' : ''}${scene ? ' has-scene' : ''} is-${state} ${className}`.trim()}
      style={{ ...(hostPlaceholderVars(name) as CSSProperties), ...frameStyle }}
      data-fallback-name={name}
    >
      {state !== 'loaded' && (
        <>
          {scene && <span className="hp-scene" aria-hidden="true" style={{ backgroundImage: `url("${scene}")` }} />}
          <Silhouette long={long} />
        </>
      )}
      {src ? (
        <img
          ref={ref}
          src={src}
          alt={alt}
          decoding="async"
          data-no-fallback=""
          {...imgProps}
          className={`hp-img ${imgClassName}`.trim()}
          onLoad={(e) => {
            setState('loaded')
            onLoad?.(e)
          }}
          onError={(e) => {
            setState('failed')
            onError?.(e)
          }}
        />
      ) : null}
    </span>
  )
}
