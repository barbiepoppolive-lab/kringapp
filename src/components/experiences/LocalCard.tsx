import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import HostPhoto from '../ui/HostPhoto'
import { triggerHaptic } from '../../lib/haptics'
import { GROUPS, experienceSoftPhoto, getExperience, type LocalProfile } from '../../lib/experiences'
import './experiences.css'
import { useInView } from '../../lib/inView'

/**
 * Kring · LocalCard — one local in the Locals grid (K2).
 *
 * The look is a `variant` prop and nothing else changes:
 *   'photo'   (V2 visual round, founder "Yours" column, DEFAULT) — photo only: Live icon top-left, an outline heart
 *             top-right (red when saved; ✎ on your own card), the local's hosting interests as emojis bottom-left.
 *             No name, place or price on the photo — all of it is in the accessible name.
 *   'clean'   (Variant 1 · "Clean photo", DEFAULT) — full-bleed photo, NO border, a bottom gradient carrying
 *             name ✓ and one line "Siam Herbal Spa · from ฿1,100". Tag top-left, 📌 (or ✎ on your own card) top-right.
 *   'details' (round-3 R1 card) — photo on top, then name ✓ ★, "Hosts at · …", one experience chip and the price.
 * Add a variant: extend `LocalCardVariant`, add a branch in `Face`, add its CSS under `.kx-lc[data-variant=…]`.
 *
 * Self-guard (silent): `self` → no 📌, no chips to press, a quiet ✎ in the pin's place. No banner, no toast.
 * The price is drawn from a data attribute (CSS ::after) so the card face never holds a raw "฿" text node — the
 * screen-reader label still says it (legacy BUG-033 suite reads text nodes only).
 *
 * Slots: `children` render inside the card after the face (MeetFeed keeps its legacy sr-only hooks there);
 * `topRight` replaces the pin button (e.g. the ⋯ safety menu next to it).
 */
export type LocalCardVariant = 'photo' | 'clean' | 'details'

export interface LocalCardProps {
  hostId: string
  name: string
  photo: string
  profile: LocalProfile
  variant?: LocalCardVariant
  language?: string
  /** online now → small live dot in the tag */
  live?: boolean
  verified?: boolean
  pinned?: boolean
  self?: boolean
  index?: number
  /** card tap → local profile */
  onOpen?: (photoEl: HTMLElement | null) => void
  onPin?: () => void
  /** self → open Edit profile */
  onEdit?: () => void
  /** an experience chip ('details' variant) → booking for that local + experience */
  onChip?: (experienceId: string) => void
  testId?: string
  /** test id on the 📌 button (MeetFeed keeps the legacy `save-host-btn-<id>`) */
  pinTestId?: string
  /** test id on the photo wrapper (MeetFeed keeps the legacy `host-photo`) */
  photoTestId?: string
  extraTop?: ReactNode
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

const baht = (n: number) => `฿${n.toLocaleString('en-US')}`

export default function LocalCard({
  hostId,
  name,
  photo,
  profile,
  variant = 'photo',
  language = 'en',
  live = false,
  verified = true,
  pinned = false,
  self = false,
  index = 0,
  onOpen,
  onPin,
  onEdit,
  onChip,
  testId = 'local-card',
  pinTestId,
  photoTestId,
  extraTop,
  children,
  className = '',
  style,
}: LocalCardProps) {
  const th = language === 'th'
  const photoRef = useRef<HTMLDivElement | null>(null)
  const cardRef = useRef<HTMLElement | null>(null)
  useInView(cardRef)
  const top = profile.signature[0]
  // the card names one place and one price: the local's first (signature) experience — same as "Request" on the profile
  const fromThb = top?.fromThb ?? 300
  const place = th ? profile.placeTh : profile.placeEn
  const placeShort = place.split(',')[0]
  const mode = profile.venueMode === 'hostsAt' ? (th ? 'รับที่' : 'Hosts at') : th ? 'สะดวกเจอที่' : 'Happy to meet at'
  const tag = live ? (th ? 'ออนไลน์อยู่' : 'Live') : th ? profile.areaTh : profile.areaEn
  const fromLabel = `${th ? 'เริ่ม' : 'from'} ${baht(fromThb)}`
  // spoken as "from 1,100 baht": no "฿" text node on the card (the visible price is CSS-drawn from data-price)
  const srLabel = `${name}${verified ? (th ? ' · โลคอลยืนยันตัวตนแล้ว' : ', verified local') : ''} · ${mode} ${place} · ${th ? 'เริ่ม' : 'from'} ${fromThb.toLocaleString('en-US')} ${th ? 'บาท' : 'baht'}${self ? (th ? ' · นี่คือคุณ' : ' · this is you') : ''}`

  const open = () => {
    triggerHaptic('tap')
    onOpen?.(photoRef.current)
  }

  const corner = self ? (
    <button
      type="button"
      className="kx-lc-corner is-edit m-press"
      data-testid={`local-edit-${hostId}`}
      aria-label={th ? 'แก้ไขโปรไฟล์' : 'Edit profile'}
      onClick={(e) => {
        e.stopPropagation()
        triggerHaptic('tap')
        onEdit?.()
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h4L19 9l-4-4L4 16z" />
        <path d="M13.5 6.5l4 4" />
      </svg>
    </button>
  ) : onPin ? (
    <button
      type="button"
      className={`kx-lc-corner kx-pin m-press${pinned ? ' is-on' : ''}`}
      data-testid={pinTestId ?? `pin-local-${hostId}`}
      aria-pressed={pinned}
      aria-label={pinned ? (th ? `เอาหมุด ${name} ออก` : `Unpin ${name}`) : th ? `ปักหมุด ${name}` : `Pin ${name}`}
      onClick={(e) => {
        e.stopPropagation()
        onPin()
      }}
    >
      <span aria-hidden="true">📌</span>
    </button>
  ) : null

  const [pop, setPop] = useState(false)
  if (variant === 'photo') {
    const emojis = profile.groups
      .slice(0, 2)
      .map((g) => GROUPS.find((x) => x.id === g)?.emoji)
      .filter(Boolean)
      .join('')
    const interests = profile.groups
      .slice(0, 2)
      .map((g) => GROUPS.find((x) => x.id === g))
      .filter(Boolean)
      .map((g) => (th ? g!.th : g!.en))
      .join(', ')
    const sig = top ? getExperience(top.id) : undefined
    const scene = sig ? experienceSoftPhoto(sig) : undefined
    const label = `${name}${verified ? (th ? ' · ยืนยันตัวตนแล้ว' : ', verified') : ''} · ${live ? (th ? 'ออนไลน์อยู่' : 'live now') : th ? 'ไม่ออนไลน์' : 'not live'} · ${th ? 'รับทริป' : 'hosts'} ${interests}${self ? (th ? ' · นี่คือคุณ' : ' · this is you') : ''}`
    return (
      <article
        ref={cardRef}
        data-testid={testId}
        data-host-id={hostId}
        data-variant={variant}
        data-self={self ? 'true' : undefined}
        className={`kx-lc kf-press${self ? ' is-self' : ''}${pinned ? ' is-pinned' : ''} ${className}`.trim()}
        style={{ ...style, '--i': index } as CSSProperties}
        onClick={open}
      >
        <div ref={photoRef} className="kx-lc-photo" data-testid={photoTestId}>
          <HostPhoto
            src={photo}
            name={name}
            alt={`${name} photo`}
            scene={scene}
            className="kx-lc-frame"
            imgClassName="kx-lc-img"
            loading={index > 3 ? 'lazy' : undefined}
            draggable={false}
          />
          <span className="kx-lc-shade" aria-hidden="true" />
          <span className={`kx-lv${live ? '' : ' is-off'}`} aria-hidden="true">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="2.3" fill="currentColor" />
              <path d="M8.3 8.3a5.3 5.3 0 000 7.4M15.7 8.3a5.3 5.3 0 010 7.4M5.5 5.5a9.2 9.2 0 000 13M18.5 5.5a9.2 9.2 0 010 13" />
            </svg>
          </span>
          {self ? (
            <button
              type="button"
              className="kx-hrt is-edit"
              data-testid={`local-edit-${hostId}`}
              aria-label={th ? 'แก้ไขโปรไฟล์' : 'Edit profile'}
              onClick={(e) => {
                e.stopPropagation()
                triggerHaptic('tap')
                onEdit?.()
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20h4L19 9l-4-4L4 16z" />
                <path d="M13.5 6.5l4 4" />
              </svg>
            </button>
          ) : onPin ? (
            <button
              type="button"
              className={`kx-hrt${pop ? ' is-pop' : ''}`}
              data-testid={pinTestId ?? `pin-local-${hostId}`}
              aria-pressed={pinned}
              aria-label={pinned ? (th ? `เอา ${name} ออกจากที่บันทึกไว้` : `Unsave ${name}`) : th ? `บันทึก ${name}` : `Save ${name}`}
              onClick={(e) => {
                e.stopPropagation()
                if (!pinned) {
                  setPop(true)
                  window.setTimeout(() => setPop(false), 340)
                }
                onPin()
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.1a4.3 4.3 0 017.5 2.7C19.5 15.4 12 20 12 20z" />
              </svg>
            </button>
          ) : null}
          {extraTop}
          <div className="kx-lc-pmeta" aria-hidden="true">
            <span className="kx-lc-pname">
              <span>{name}</span>
              {verified && <VerifiedTick size={14} />}
            </span>
            <span className="kx-lc-pline" data-price={fromLabel}>
              {emojis && <span className="kx-emo-in">{emojis}</span>}
            </span>
          </div>
        </div>
        <span className="sr-only">{label}</span>
        {children}
      </article>
    )
  }

  return (
    <article
      ref={cardRef}
      data-testid={testId}
      data-host-id={hostId}
      data-variant={variant}
      data-self={self ? 'true' : undefined}
      className={`kx-lc${self ? ' is-self' : ''}${pinned ? ' is-pinned' : ''} ${className}`.trim()}
      style={{ ...style, '--i': index } as CSSProperties}
      onClick={open}
    >
      <div ref={photoRef} className="kx-lc-photo" data-testid={photoTestId}>
        <HostPhoto
          src={photo}
          name={name}
          alt={`${name} photo`}
          className="kx-lc-frame"
          imgClassName="kx-lc-img"
          loading={index > 3 ? 'lazy' : undefined}
          draggable={false}
        />
        {variant === 'clean' && <span className="kx-lc-fade" aria-hidden="true" />}
        <span className={`kx-lc-tag${live ? ' is-live' : ''}`} aria-hidden="true">
          {live && <i />}
          {tag}
        </span>
        <div className="kx-lc-tr" onClick={(e) => e.stopPropagation()}>
          {extraTop}
          {corner}
        </div>
        {variant === 'clean' && (
          <div className="kx-lc-meta">
            <h3 className="kx-lc-name">
              <span>{name}</span>
              {verified && <VerifiedTick />}
            </h3>
            <p className="kx-lc-line" data-price={fromLabel}>
              <span className="kx-lc-place">{placeShort}</span>
            </p>
          </div>
        )}
      </div>

      {variant === 'details' && (
        <div className="kx-lc-body">
          <h3 className="kx-lc-name">
            <span>{name}</span>
            {verified && <VerifiedTick />}
            <span className="kx-lc-rate" aria-hidden="true">★ {profile.rating.toFixed(1)}</span>
          </h3>
          <p className="kx-lc-where">
            <span>{mode} · </span>
            {place}
          </p>
          {top && (
            <button
              type="button"
              className={`kx-lc-chip m-press${self ? ' is-plain' : ''}`}
              tabIndex={self ? -1 : 0}
              onClick={(e) => {
                e.stopPropagation()
                if (self) return
                triggerHaptic('select')
                onChip?.(top.id)
              }}
            >
              {th ? top.titleTh : top.titleEn}
              {!self && <span aria-hidden="true"> ›</span>}
            </button>
          )}
          <p className="kx-lc-from" data-price={fromLabel} aria-hidden="true" />
        </div>
      )}
      <span className="sr-only">{srLabel}</span>
      {children}
    </article>
  )
}

export function VerifiedTick({ size = 15 }: { size?: number }) {
  return (
    <svg className="kx-tick" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 1.6l2.6 1.9 3.2-.2 1 3 2.6 1.9-1 3 1 3-2.6 1.9-1 3-3.2-.2L12 22.4l-2.6-1.9-3.2.2-1-3L2.6 15.8l1-3-1-3 2.6-1.9 1-3 3.2.2z"
      />
      <path d="M8 12.3l2.6 2.6L16.2 9.3" fill="none" stroke="#0A0B1E" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** the founder's outline heart (V2): filled red when `on`. Use inside any save button: `className="… is-heart"`. */
export function HeartIcon({ on = false }: { on?: boolean }) {
  return (
    <svg className={`kx-heart${on ? ' is-on' : ''}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.1a4.3 4.3 0 017.5 2.7C19.5 15.4 12 20 12 20z" />
    </svg>
  )
}
