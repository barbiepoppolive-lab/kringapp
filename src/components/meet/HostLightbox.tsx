import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { triggerHaptic } from '../../lib/haptics'
import { useBackEntry } from '../../lib/backStack'
import HostPhoto from '../ui/HostPhoto'
import { HeartIcon, VerifiedTick } from '../experiences/LocalCard'
import { isSelf, openEditProfile } from '../../lib/selfGuard'
import { isPinned, togglePin, usePins } from '../../lib/pins'
import { experienceSoftPhoto, getExperience, localProfile, shortTitle, shortTitleTh, type LocalProfile } from '../../lib/experiences'
import { t as lx } from '../../lib/lexicon'
import '../../styles/meet-motion.css'
import '../experiences/experiences.css'

/**
 * Kring · local profile (K2; round 3 R5 + R1). Was the Atlas B9 photo lightbox — same component, same test ids,
 * now ONE full-screen profile page:
 *   photo (swipe / tap halves / thumbnails, Instagram bars) → name ✓ → "Verified local · ★ 4.9 · Thai · English"
 *   → "Hosts at · Siam Herbal Spa, Ari" (fixed licensed venue) or "Happy to meet at · …" (public area)
 *   → the local's experiences with their own from-price (tap → "Book a local" for that experience)
 *   → languages, reviews → action bar: "Book · from ฿1,100" (→ the one "Book a local" sheet) and 💬.
 * No ages, no hearts, no "date". Self-guard (silent): on your own profile the action bar is simply absent and a
 * quiet "✎ Edit" sits bottom-right; your experience rows have nothing to press; the ✎ replaces the ♥.
 *
 * Callers:
 *  - MeetFeed (Locals / Experiences): passes `hostId`, `profile`, `onRequest`, `onOffer`, `onGift`, `onBook`.
 *  - ClinkGiftSheet (K3): the original props only — Request then calls `onClink` (back to its own send line).
 */
export interface HostLightboxProps {
  open: boolean
  name: string
  /** @deprecated ages are never shown (Kring rule); kept so existing callers compile */
  age?: number
  verified?: boolean
  area?: string
  online?: boolean
  languages: Array<{ flag: string; label: string }>
  vibe?: string
  photos: readonly string[]
  index: number
  onIndex: (next: number) => void
  priceThb: number
  language?: string
  onClose: () => void
  onClink: () => void
  onChat: () => void
  /* ---- Kring profile (optional) ---- */
  hostId?: string
  profile?: LocalProfile
  /** one-tap "Request" (default: a 10-minute request for the local's first experience via requestMany) */
  onRequest?: () => boolean | void
  /** "Offer" → the Offer card / booking sheet (K3) */
  onOffer?: () => void
  /** 🎁 → the gift tray (frozen, unchanged) */
  onGift?: () => void
  /** an experience row → "Book a local" for that experience */
  onBook?: (experienceId: string) => void
  /** ⋯ safety menu (report / block) rendered top-right */
  safetySlot?: ReactNode
}

function reducedMotion(): boolean {
  try {
    return (
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true ||
      document.documentElement.dataset.reduceMotion === 'true'
    )
  } catch {
    return false
  }
}

const baht = (n: number) => `฿${n.toLocaleString('en-US')}`

export default function HostLightbox({
  open,
  name,
  verified = true,
  area,
  online = true,
  languages,
  vibe,
  photos,
  index,
  onIndex,
  priceThb,
  language = 'en',
  onClose,
  onClink,
  onChat,
  hostId,
  profile: profileProp,
  onRequest,
  onOffer,
  onGift,
  onBook,
  safetySlot,
}: HostLightboxProps) {
  const th = language === 'th'
  const count = Math.max(1, photos.length)
  const idx = ((index % count) + count) % count
  const [drag, setDrag] = useState(0)
  const [sent, setSent] = useState(false)
  const [closing, setClosing] = useState(false)
  const touch = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null)
  const reduce = useRef(typeof window !== 'undefined' ? reducedMotion() : true).current
  usePins() // re-render when a pin changes
  const id = hostId ?? `host-${name.toLowerCase()}`
  const profile = profileProp ?? localProfile({ id, name })
  const self = isSelf(id) || isSelf(name)
  const pinned = isPinned(id)
  // "Request" asks for the local's first experience, so the button shows that price (R5: "Request · from ฿1,100")
  const fromThb = profile.signature[0]?.fromThb ?? priceThb
  // V2 · while / if her photo isn't there: her signature experience's scene, softened, behind the silhouette
  const sigExp = getExperience(profile.signature[0]?.id)
  const sceneOf = sigExp ? experienceSoftPhoto(sigExp) : undefined

  const go = (dir: 1 | -1) => {
    triggerHaptic('tap')
    onIndex((idx + dir + count) % count)
  }
  const close = () => {
    if (reduce) return onClose()
    setClosing(true)
    window.setTimeout(() => {
      setClosing(false)
      onClose()
    }, 200)
  }
  useBackEntry(open && !closing, close)

  useEffect(() => {
    if (!open) {
      setSent(false)
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') onIndex((idx + 1) % count)
      else if (e.key === 'ArrowLeft') onIndex((idx - 1 + count) % count)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, idx, count, onClose, onIndex])

  if (!open || typeof document === 'undefined') return null

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    if (t) touch.current = { x: t.clientX, y: t.clientY, axis: null }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0]
    const s = touch.current
    if (!t || !s) return
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (!s.axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    if (s.axis === 'x' && !reduce) setDrag(dx)
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current
    const t = e.changedTouches[0]
    touch.current = null
    setDrag(0)
    if (!s || !t) return
    const dx = t.clientX - s.x
    if (s.axis === 'x' && Math.abs(dx) > 48) go(dx < 0 ? 1 : -1)
  }

  // KRING FIX2 · Wei 18–19 / founder: ONE booking sheet, ONE verb. "Book · from ฿X" opens Kring's "Book a local"
  // (onBook → `kring:book-local`) for the local's first experience, where the guest picks the time and the price. The
  // one-tap request and the separate "Offer" (old ClinkGiftSheet) button are gone; `onClink` stays only for callers
  // that pass no `onBook`.
  const request = () => {
    if (sent) return
    triggerHaptic('select')
    const top = profile.signature[0]
    if (onBook && top) {
      onBook(top.id)
      return
    }
    if (onRequest) {
      const ok = onRequest()
      if (ok !== false) {
        setSent(true)
        triggerHaptic('success')
      }
      return
    }
    onClink()
  }

  const langList = profile.langs.length ? profile.langs : languages.map((l) => l.label)
  const place = th ? profile.placeTh : profile.placeEn
  const mode = profile.venueMode === 'hostsAt' ? (th ? 'รับที่' : 'Hosts at') : th ? 'สะดวกเจอที่' : 'Happy to meet at'
  const bio = (th ? profile.bioTh : profile.bioEn) || vibe
  // FIX1 · once the photo has scrolled away the floating top buttons get a solid glass bar (the name never slides
  // under a bare back button)
  const [solidTop, setSolidTop] = useState(false)

  return createPortal(
    <div
      className={`kl-page${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${name} profile and photos`}
      data-testid="full-size-photo-lightbox"
      data-fallback-name={name}
      data-self={self ? 'true' : undefined}
    >
      <div className="kl-scroll" onScroll={(e) => {
        const el = e.currentTarget
        const hero = el.firstElementChild as HTMLElement | null
        const next = el.scrollTop > (hero?.offsetHeight ?? 400) - 140
        if (next !== solidTop) setSolidTop(next)
      }}>
        <div className="kl-hero" data-testid="host-profile-photo-gallery" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <HostPhoto
            key={photos[idx]}
            src={photos[idx]}
            name={name}
            scene={sceneOf}
            alt={`${name} photo ${idx + 1} of ${count}`}
            data-testid="host-profile-large-hero-photo"
            className="kl-hero-frame"
            imgClassName="kl-hero-img"
            style={drag ? { transform: `translateX(${drag}px)` } : undefined}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              go(e.clientX - r.left > r.width / 2 ? 1 : -1)
            }}
          />
          <div className="kl-hero-fade" aria-hidden="true" />
          {count > 1 && (
            <div className="kl-bars" aria-hidden="true">
              {photos.map((p, i) => (
                <i key={`${p}-${i}`} className={i === idx ? 'on' : undefined} />
              ))}
            </div>
          )}
          <span className="sr-only" aria-live="polite">
            {idx + 1} / {count}
          </span>
          <button type="button" className="kl-zone is-l" aria-label="Previous photo" onClick={() => go(-1)} />
          <button type="button" className="kl-zone is-r" aria-label="Next photo" onClick={() => go(1)} />
        </div>

        <div className={`kl-top${solidTop ? ' is-solid' : ''}`}>
          <button
            type="button"
            className="kx-back m-press"
            data-testid="toggle-large-photo-zoom"
            aria-label={th ? 'ปิด' : 'Close photos'}
            onClick={() => {
              triggerHaptic('tap')
              close()
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <span className="kl-top-r">
            {!self && safetySlot}
            {self ? (
              <button type="button" className="kx-lc-corner is-edit m-press" aria-label={th ? 'แก้ไขโปรไฟล์' : 'Edit profile'} onClick={() => { triggerHaptic('tap'); openEditProfile() }}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 20h4L19 9l-4-4L4 16z" />
                  <path d="M13.5 6.5l4 4" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                className={`kx-lc-corner is-heart kf-press${pinned ? ' is-on' : ''}`}
                aria-pressed={pinned}
                data-testid="profile-pin"
                aria-label={pinned ? (th ? `เอา ${name} ออกจากที่บันทึกไว้` : `Unsave ${name}`) : th ? `บันทึก ${name}` : `Save ${name}`}
                onClick={() => togglePin(id, name, language)}
              >
                <HeartIcon on={pinned} />
              </button>
            )}
          </span>
        </div>

        <div className="kl-head">
          <h2 className="kl-name">
            {name}
            {verified ? <VerifiedTick size={22} /> : null}
          </h2>
          <p className="kl-meta">
            {th ? 'โลคอลตัวจริง' : 'Verified local'}{profile.reviews > 0 ? ` · ★ ${profile.rating.toFixed(1)}` : ''} · {langList.slice(0, 2).join(' · ')}
            {online && !self ? <span className="sr-only">{th ? ' · ออนไลน์อยู่' : ' · online now'}</span> : null}
          </p>
          <p className="kl-where">
            <span>{mode} · </span>
            {place || area}
          </p>
          {bio ? <p className="kl-bio">{bio}</p> : null}
        </div>

        <div className="kl-body">
          <p className="kx-eyebrow">{th ? 'ทริปของ' : 'Experiences with'} {name}</p>
          <div className="kl-exps">
            {profile.signature.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`kl-exp m-press${self ? ' is-self' : ''}`}
                style={{ '--i': i } as CSSProperties}
                data-testid={`profile-exp-${s.id}`}
                tabIndex={self ? -1 : 0}
                onClick={() => {
                  if (self) return
                  triggerHaptic('select')
                  if (onBook) onBook(s.id)
                  else onClink()
                }}
              >
                <span>
                  <b>{th ? s.titleTh : s.titleEn}</b>
                  <small>
                    ~{s.hours}h · {th ? s.noteTh : s.noteEn}
                  </small>
                </span>
                <span className="kl-exp-price">
                  {th ? 'เริ่ม' : 'from'} {baht(s.fromThb)}
                </span>
                {!self && <span className="kl-exp-go" aria-hidden="true">›</span>}
              </button>
            ))}
          </div>

          {langList.length > 0 && (
            <div className="kl-langs" aria-label={th ? 'ภาษาที่พูด' : 'Speaks'}>
              {(languages.length ? languages : langList.map((l) => ({ flag: '', label: l }))).map((l) => (
                <span key={l.label} >
                  {l.flag ? <span aria-hidden="true">{l.flag} </span> : null}
                  {l.label}
                </span>
              ))}
            </div>
          )}

          {count > 1 && (
            <div className="kl-thumbs" role="tablist" aria-label={th ? 'รูปภาพ' : 'Photos'}>
              {photos.map((url, i) => (
                <button
                  key={`${url}-${i}`}
                  type="button"
                  role="tab"
                  aria-selected={i === idx}
                  aria-label={`${name} photo ${i + 1}`}
                  data-testid={`host-profile-photo-thumb-${i}`}
                  className={`kl-thumb m-press${i === idx ? ' on' : ''}`}
                  onClick={() => {
                    triggerHaptic('tap')
                    onIndex(i)
                  }}
                >
                  <HostPhoto src={url} name={name} scene={sceneOf} className="kl-thumb-photo" />
                </button>
              ))}
            </div>
          )}

          <p className="kx-eyebrow">
            {profile.reviews > 0 ? <>★ {profile.rating.toFixed(1)} · {profile.reviews} {th ? 'รีวิว' : 'reviews'}</> : th ? 'ใหม่บนกริ๊ง · ยังไม่มีรีวิว' : 'New on Kring · no reviews yet'}
          </p>
          {profile.quotes.length > 0 && (
            <div className="kx-quotes">
              {profile.quotes.map((q) => (
                <figure key={q.who} className="kx-quote">
                  <figcaption>
                    {q.who} · {q.from} · {'★'.repeat(q.stars)}
                    {getExperience(q.exp) ? <> · <span className="kx-quote-on">{th ? shortTitleTh(getExperience(q.exp)!) : shortTitle(getExperience(q.exp)!)}</span></> : null}
                  </figcaption>
                  <blockquote>“{q.text}”</blockquote>
                </figure>
              ))}
            </div>
          )}
        </div>
      </div>

      {self ? (
        <div className="kl-bar is-self">
          <button type="button" className="kx-quiet is-edit m-press" data-testid="profile-edit" onClick={() => { triggerHaptic('tap'); openEditProfile() }}>
            {lx('edit', language)}
          </button>
        </div>
      ) : (
        <div className="kl-bar">
          <button
            type="button"
            className={`kx-cta kl-req m-press${sent ? ' is-sent' : ''}`}
            data-testid="host-lightbox-clink-btn"
            aria-live="polite"
            onClick={request}
          >
            <span>{th ? `${lx('make.offer', 'th')} · เริ่ม ${baht(fromThb)}` : `${lx('make.offer', 'en')} · from ${baht(fromThb)}`}</span>
            <span aria-hidden={!sent}>{th ? '✓ ส่งคำขอแล้ว' : '✓ Request sent'}</span>
          </button>
          {onOffer && !onBook && (
            <button type="button" className="kx-cta is-quiet kl-offer m-press" data-testid="profile-offer" onClick={() => { triggerHaptic('tap'); onOffer() }}>
              {lx('offer', 'en')}
            </button>
          )}
          {onGift && (
            <button type="button" className="kl-sq m-press" data-testid="profile-gift" aria-label={th ? `ส่งของขวัญให้ ${name}` : `Send ${name} a gift`} onClick={() => { triggerHaptic('tap'); onGift() }}>
              🎁
            </button>
          )}
          {!onGift && (
          <button
            type="button"
            className="kl-sq m-press"
            data-testid="host-lightbox-chat-btn"
            aria-label={th ? `แชตกับ ${name}` : `Chat with ${name}`}
            onClick={() => {
              triggerHaptic('tap')
              onChat()
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 5h16v11H9l-5 4z" />
            </svg>
          </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  )
}
