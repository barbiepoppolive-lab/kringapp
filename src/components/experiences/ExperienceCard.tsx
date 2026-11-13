import { forwardRef, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import HostPhoto from '../ui/HostPhoto'
import { triggerHaptic } from '../../lib/haptics'
import { isReducedMotionPreferred } from '../../lib/kringCreativeEngine'
import { audienceLabel, durationLabel, experiencePhoto, primaryAudience, shortTitle, shortTitleTh, venueIn, type City, type Experience } from '../../lib/experiences'
import './experiences.css'

/**
 * Kring · ExperienceCard — one catalogue experience in the Experiences list (V2 visual round · P2 "Fable" column).
 *
 * Full-bleed scene photo (local licensed JPEG; colourful per-group gradient + emoji if it can't load — never a brown
 * block), the experience name + 🔥 when it's popular, and a small stack of the local hosts' faces at the right.
 * No price, place or host text on the photo — prices live in the Book card. Everything else is in the accessible name.
 * Tap → ExperienceDetail. `hero` → the screen's one floating card (V1 Floating utilities: .kf-hero + .kf-spec).
 */
export interface ExperienceCardProps {
  experience: Experience
  language?: string
  /** locals in the current city who host it (faces, max 3 shown) */
  hosts: Array<{ id: string; name: string; photo: string }>
  /** any of those locals online now (spoken only) */
  live?: boolean
  index?: number
  /** the one floating hero of the screen */
  hero?: boolean
  /** T3 · show "Weekend trip" before "For travellers" (a Thai away from home / browsing in Thai) */
  preferWeekend?: boolean
  onOpen: (e: Experience) => void
}

const baht = (n: number) => `฿${n.toLocaleString('en-US')}`

export function experienceTag(e: Experience, th: boolean, city: City = 'bangkok'): string {
  if (e.online) return th ? 'ออนไลน์ · วิดีโอ' : 'Online · video'
  const lic: Record<string, [string, string]> = {
    spa: ['Licensed spa', 'สปามีใบอนุญาต'],
    salon: ['Salon', 'ซาลอน'],
    gym: ['Licensed gym', 'ยิมมีใบอนุญาต'],
    school: ['Cooking school', 'โรงเรียนสอนทำอาหาร'],
  }
  if (e.plusVenue && lic[e.plusVenue]) return th ? lic[e.plusVenue][1] : `✓ ${lic[e.plusVenue][0]}`
  const vv = venueIn(e, city)
  const v = (th ? vv.th : vv.en).split(/[,·]/)[0].trim()
  return v.length > 22 ? `${v.slice(0, 21)}…` : v
}

const clamp10 = (v: number) => Math.max(-10, Math.min(10, v))

const ExperienceCard = forwardRef<HTMLButtonElement, ExperienceCardProps>(function ExperienceCard(
  { experience: e, language = 'en', hosts, live = false, index = 0, hero = false, preferWeekend = false, onOpen },
  ref,
) {
  const th = language === 'th'
  const [photoFailed, setPhotoFailed] = useState(false)
  const localRef = useRef<HTMLButtonElement | null>(null)
  const reducedMotion = isReducedMotionPreferred()
  const title = th ? shortTitleTh(e) : shortTitle(e)
  const n = hosts.length
  const pop = Boolean(e.onboardFirst)
  // T3 · one audience tag per card: Two-way · Weekend trip · For travellers (no split or percentage, ever)
  const aud = primaryAudience(e, preferWeekend)
  const spoken = [
    title,
    audienceLabel(aud, language),
    pop ? (th ? 'ยอดนิยม' : 'popular') : '',
    `${th ? 'เริ่ม' : 'from'} ${baht(e.fromThb)}`,
    durationLabel(e.hours, language),
    n === 0 ? (th ? 'โลคอลกำลังมา' : 'locals joining soon') : th ? `โลคอล ${n} คนรับทริปนี้` : `${n} local${n === 1 ? '' : 's'} host${n === 1 ? 's' : ''} this`,
    live ? (th ? 'มีโลคอลออนไลน์' : 'a local is live now') : '',
  ]
    .filter(Boolean)
    .join(' · ')

  const setRefs = (el: HTMLButtonElement | null) => {
    localRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }

  const handlePointerMove = (ev: ReactPointerEvent<HTMLButtonElement>) => {
    if (reducedMotion || !localRef.current) return
    const rect = localRef.current.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const nx = ((ev.clientX - rect.left) / rect.width - 0.5) * 2
    const ny = ((ev.clientY - rect.top) / rect.height - 0.5) * 2
    const tx = clamp10(nx * 10)
    const ty = clamp10(ny * 10)
    localRef.current.style.setProperty('--tilt-px-x', `${tx.toFixed(2)}px`)
    localRef.current.style.setProperty('--tilt-px-y', `${ty.toFixed(2)}px`)
  }

  const handlePointerLeave = () => {
    if (!localRef.current) return
    localRef.current.style.setProperty('--tilt-px-x', '0px')
    localRef.current.style.setProperty('--tilt-px-y', '0px')
  }

  const openWithTransition = () => {
    triggerHaptic('tap')
    const doc = typeof document !== 'undefined' ? (document as Document & { startViewTransition?: (cb: () => void) => unknown }) : null
    if (!reducedMotion && doc && typeof doc.startViewTransition === 'function') {
      let ran = false
      try {
        doc.startViewTransition(() => {
          ran = true
          onOpen(e)
        })
      } catch {
        // ignore if unsupported in current context
      }
      if (!ran) onOpen(e)
    } else {
      onOpen(e)
    }
  }

  return (
    <button
      ref={setRefs}
      type="button"
      className={`kx-xc kf-press${hero ? ' kf-hero' : ''}`}
      data-testid={`experience-card-${e.id}`}
      data-group={e.group}
      data-look="cinema"
      data-tilt-layers={reducedMotion ? '2' : '3'}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      aria-label={spoken}
      style={{ '--i': index, '--tilt-px-x': '0px', '--tilt-px-y': '0px' } as CSSProperties}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={openWithTransition}
    >
      <span className={`kx-art${photoFailed ? '' : ' has-photo'}`} data-group={e.group} data-tilt-layer="photo" aria-hidden="true">
        {!photoFailed && (
          <img
            className="kx-art-img"
            src={experiencePhoto(e)}
            alt=""
            loading={index < 2 ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            onError={() => setPhotoFailed(true)}
          />
        )}
        <span className="kx-art-glyph">{e.emoji}</span>
      </span>
      <span className="kx-xc-fade" aria-hidden="true" />
      {hero && <span className="kf-spec" aria-hidden="true" />}
      <span className="kx-xc-nm" aria-hidden="true">
        <span className="kx-xc-title kring-living-thai-type" data-tilt-layer="title">
          <span className="kx-aud" data-aud={aud} data-testid={`experience-aud-${e.id}`}>
            {aud === 'twoway' && <span aria-hidden="true">⇄ </span>}
            {audienceLabel(aud, language, true)}
          </span>
          {title}
          {pop && <span className="kx-fire">🔥</span>}
          <span
            className="kx-xc-price-pill"
            data-tilt-layer={reducedMotion ? 'title' : 'price-glass'}
            data-testid={`experience-price-glass-${e.id}`}
            style={{ viewTransitionName: hero ? 'kring-price-glass' : undefined } as CSSProperties}
            onClick={(ev) => {
              ev.stopPropagation()
              openWithTransition()
            }}
          >
            {th ? 'เริ่ม' : 'from'} {baht(e.fromThb)} · {durationLabel(e.hours, language)} · {th ? 'เฉพาะค่ากิจกรรม' : 'activity fee only'}
          </span>
        </span>
        {n > 0 && (
          <span className="kx-faces">
            {hosts.slice(0, 3).map((h) => (
              <HostPhoto key={h.id} src={h.photo} name={h.name} round className="kx-face" loading="lazy" draggable={false} />
            ))}
          </span>
        )}
      </span>
    </button>
  )
})

export default ExperienceCard
