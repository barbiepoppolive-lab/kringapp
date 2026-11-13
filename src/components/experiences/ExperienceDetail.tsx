import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import HostPhoto from '../ui/HostPhoto'
import { HeartIcon, VerifiedTick } from './LocalCard'
import { experienceTag } from './ExperienceCard'
import { triggerHaptic } from '../../lib/haptics'
import { useBackEntry } from '../../lib/backStack'
import { togglePin } from '../../lib/pins'
import { isSelf } from '../../lib/selfGuard'
import { t as lx } from '../../lib/lexicon'
import {
  durationLabel,
  experiencePhoto,
  getGroup,
  localPriceFor,
  shortTitle,
  shortTitleTh,
  useCity,
  venueFor,
  venueIn,
  type Experience,
  type LocalProfile,
} from '../../lib/experiences'
import './experiences.css'

/**
 * Kring · ExperienceDetail — one page answers what people ask first (K2, round 1 A4).
 *
 * Hero art (parallax, stays put while the sheet scrolls over it) → title → the top local (✓, rating) → four quick
 * facts (from ฿ · time · "Just me" · speaks) → what's included → the public venue → locals who host it (♥ to save,
 * tap to open their profile) → reviews. Bottom bar stays pinned: "Message to plan" (chat) and "Make an offer"
 * (gold) — plus "Ask N at once" when more than one local hosts it (multi-request).
 * Self-guard: your own row has no pin and no request; if you are the only local, the bottom bar shows a quiet ✎ Edit.
 */
export interface DetailLocal {
  id: string
  name: string
  photo: string
  profile: LocalProfile
  pinned: boolean
  live?: boolean
}

export interface ExperienceDetailProps {
  experience: Experience
  locals: DetailLocal[]
  language?: string
  onClose: () => void
  onOpenLocal: (id: string) => void
  /** "Message to plan" → chat with that local */
  onMessage: (local: DetailLocal) => void
  /** "Make an offer" / "Request" → booking sheet for these locals ('single' for one) */
  onRequest: (localIds: string[], mode: 'single' | 'multi') => void
  onEditSelf?: () => void
}

export default function ExperienceDetail({ experience: e, locals, language = 'en', onClose, onOpenLocal, onMessage, onRequest, onEditSelf }: ExperienceDetailProps) {
  const th = language === 'th'
  const [city] = useCity()
  const [closing, setClosing] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const [photoFailed, setPhotoFailed] = useState(false)
  const others = locals.filter((l) => !isSelf(l.id) && !isSelf(l.name))
  const lead = others[0]
  const g = getGroup(e.group)
  const title = th ? shortTitleTh(e) : shortTitle(e)
  const fullTitle = th ? e.titleTh : e.title
  const included = th ? e.includedTh : e.included
  // FIX1 · Wei 9 / Ploy 10 — only reviews OF this experience (a spa review never sits under a food walk)
  const quotes = locals.flatMap((l) => l.profile.quotes.filter((q) => q.exp === e.id).map((q) => ({ ...q, local: l.name }))).slice(0, 3)
  const avg = locals.length ? locals.reduce((s, l) => s + l.profile.rating, 0) / locals.length : 0
  const langs = [...new Set(locals.flatMap((l) => l.profile.langs))]
  const CODE: Record<string, string> = { Thai: 'TH', English: 'EN', '日本語': 'JA', '中文': 'ZH', 'Русский': 'RU', 'Tiếng Việt': 'VI', '한국어': 'KO' }
  const speaks = langs.map((x) => CODE[x] ?? x.slice(0, 2).toUpperCase()).slice(0, 3).join('·') || 'TH·EN'
  const pinnedIds = others.filter((l) => l.pinned).map((l) => l.id)

  const close = () => {
    setClosing(true)
    window.setTimeout(onClose, 220)
  }
  useBackEntry(!closing, close)
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && !document.querySelector('[data-testid="multi-request-sheet"]')) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className={`kx-page kx-xd${closing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-label={title} data-testid="experience-detail">
      <div className="kx-xd-hero" style={{ transform: `translate3d(0, ${Math.min(80, scrollY * 0.3)}px, 0)` } as CSSProperties} aria-hidden="true">
        <span className={`kx-art${photoFailed ? '' : ' has-photo'}`} data-group={e.group}>
          {!photoFailed && (
            <img
              className="kx-art-img"
              src={experiencePhoto(e)}
              alt=""
              loading="eager"
              decoding="async"
              draggable={false}
              onError={() => setPhotoFailed(true)}
            />
          )}
          <span className="kx-art-glyph">{e.emoji}</span>
        </span>
        <span className="kx-xc-fade" />
      </div>
      <header className={`kx-page-top is-float${scrollY > 190 ? ' is-solid' : ''}`}>
        <button type="button" className="kx-back m-press" aria-label={th ? 'กลับ' : 'Back'} onClick={close}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <span className="kx-xc-tag is-static">{g.emoji} {th ? g.th : g.en}</span>
      </header>

      <div className="kx-page-scroll kx-xd-scroll" onScroll={(ev) => setScrollY((ev.currentTarget as HTMLDivElement).scrollTop)}>
        <div className="kx-xd-spacer" aria-hidden="true" />
        <div className="kx-xd-sheet">
          <h2 className="kx-xd-title">{title}</h2>
          {fullTitle !== title && <p className="kx-xd-sub">{fullTitle.slice(title.length).replace(/^\s*\(|\)\s*$/g, '')}</p>}

          {lead && (
            <button type="button" className="kx-xd-host m-press" onClick={() => onOpenLocal(lead.id)}>
              <HostPhoto src={lead.photo} name={lead.name} round className="kx-row-av" />
              <span>
                <b>
                  {lead.name} <VerifiedTick size={14} />
                </b>
                <small>
                  {th ? 'โลคอลตัวจริง' : 'Verified local'} · ★ {lead.profile.rating.toFixed(1)} · {lead.profile.reviews} {th ? 'รีวิว' : 'reviews'}
                </small>
              </span>
              {lead.live && <i className="kx-live-dot" aria-label={th ? 'ออนไลน์อยู่' : 'Live'} />}
            </button>
          )}

          <div className="kx-facts">
            <span>
              <b className="kx-gold">฿{(lead ? localPriceFor(lead.profile, e.id) : e.fromThb).toLocaleString('en-US')}</b>
              <small>{th ? 'เริ่ม' : 'from'}</small>
            </span>
            <span>
              <b>{durationLabel(e.hours, language)}</b>
              <small>{th ? 'เวลา' : 'time'}</small>
            </span>
            <span>
              <b>{th ? 'คนเดียว' : 'Just me'}</b>
              <small>{th ? '+ เพื่อนได้' : '+ friends ok'}</small>
            </span>
            <span>
              <b>{speaks}</b>
              <small>{th ? 'ภาษา' : 'speaks'}</small>
            </span>
          </div>

          <p className="kx-eyebrow">{th ? 'ทำอะไรด้วยกัน' : "What you'll do"}</p>
          <div className="kx-incl">
            {included.map((x) => (
              <span key={x}>{x}</span>
            ))}
            {e.plusVenue && <span className="is-plus">{th ? '+ ค่าสถานที่จ่ายหน้างาน' : `+ ${e.plusVenue} fee paid at the venue`}</span>}
          </div>
          <p
            className="kx-explain"
            data-testid="xd-time-only-note"
            style={{ margin: '6px 0 0', padding: 0, background: 'none', border: 0, boxShadow: 'none', fontSize: 12, opacity: 0.68 }}
          >
            {th ? 'ค่าเวลาโลคอลเท่านั้น · ค่าอาหาร/ตั๋วจ่ายที่ร้าน' : 'Local’s time only · venue bills paid there'}
          </p>

          <div className="kx-venue">
            <span className="kx-venue-ic" aria-hidden="true">📍</span>
            <span>
              <b>
                {e.online ? (th ? 'ออนไลน์' : 'Online') : e.plusVenue ? (th ? 'จุดนัด หรือร้านมีใบอนุญาตของโลคอล' : 'Meeting point, or the local’s own licensed place') : th ? 'ที่สาธารณะ' : 'Public venue'} · {th ? venueIn(e, city).th : venueIn(e, city).en}
              </b>
              <small>
                {e.online
                  ? th ? 'วิดีโอคอลในแอป · ไม่เปิดเผยเบอร์' : 'In-app video · contacts stay masked'
                  : e.plusVenue === 'spa' || e.plusVenue === 'gym' || e.plusVenue === 'school'
                    ? th ? 'ธุรกิจที่มีใบอนุญาต · ห้องต้อนรับสาธารณะ' : 'A licensed business · public reception'
                    : th ? 'ที่สาธารณะ คนพลุกพล่าน ปลอดภัย' : 'A busy, well-lit public meeting point'}
              </small>
            </span>
            <span className="kx-tag-soft">{experienceTag(e, th, city)}</span>
          </div>

          <p className="kx-eyebrow">
            {th ? `โลคอลที่รับทริปนี้ · ${locals.length}` : `Locals who host this · ${locals.length}`}
          </p>
          {locals.length === 0 ? (
            <p className="kx-explain">
              <span aria-hidden="true">🌱</span>
              <span>{th ? 'ยังไม่มีโลคอลในเมืองนี้ ลองสลับเมืองหรือดูทริปอื่นก่อนนะ' : 'No local hosts this here yet. Try the other city, or another experience.'}</span>
            </p>
          ) : (
            <ul className="kx-rows">
              {locals.map((l, i) => {
                const self = isSelf(l.id) || isSelf(l.name)
                return (
                  <li key={l.id}>
                    <div
                      className="kx-row m-press"
                      role="button"
                      tabIndex={0}
                      style={{ '--i': i } as CSSProperties}
                      onClick={() => onOpenLocal(l.id)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') onOpenLocal(l.id)
                      }}
                    >
                      <HostPhoto src={l.photo} name={l.name} round className="kx-row-av" />
                      <span className="kx-row-main">
                        <b>
                          {l.name} <VerifiedTick size={13} />
                        </b>
                        <small>
                          ★ {l.profile.rating.toFixed(1)} · {th ? venueFor(l.profile, e, city).th : venueFor(l.profile, e, city).en}
                        </small>
                      </span>
                      <span className="kx-row-price">฿{localPriceFor(l.profile, e.id).toLocaleString('en-US')}</span>
                    </div>
                    {self ? (
                      <button type="button" className="kx-row-pin m-press" aria-label={th ? 'แก้ไขโปรไฟล์' : 'Edit profile'} onClick={onEditSelf}>
                        ✎
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`kx-row-pin is-heart kf-press${l.pinned ? ' is-on' : ''}`}
                        aria-pressed={l.pinned}
                        aria-label={l.pinned ? (th ? `เอา ${l.name} ออกจากที่บันทึกไว้` : `Unsave ${l.name}`) : th ? `บันทึก ${l.name}` : `Save ${l.name}`}
                        onClick={() => togglePin(l.id, l.name, language)}
                      >
                        <HeartIcon on={l.pinned} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {quotes.length > 0 && (
            <>
              <p className="kx-eyebrow">
                {th ? 'รีวิวทริปนี้' : 'Reviews of this experience'} · ★ {avg.toFixed(1)}
              </p>
              <div className="kx-quotes">
                {quotes.map((q) => (
                  <figure key={`${q.local}-${q.who}`} className="kx-quote">
                    <figcaption>
                      {q.who} · {q.from} · {'★'.repeat(q.stars)} · {th ? 'กับ' : 'with'} {q.local}
                    </figcaption>
                    <blockquote>“{q.text}”</blockquote>
                  </figure>
                ))}
              </div>
            </>
          )}
          <div className="kx-xd-end" aria-hidden="true" />
        </div>
      </div>

      <footer className="kx-page-foot is-row">
        {lead ? (
          <>
            <button type="button" className="kx-cta is-quiet m-press" data-testid="xd-message" onClick={() => { triggerHaptic('tap'); onMessage(lead) }}>
              {lx('message.plan', language)}
            </button>
            <button
              type="button"
              className="kx-cta m-press"
              data-testid="xd-request"
              onClick={() => {
                triggerHaptic('select')
                const pool = pinnedIds.length > 1 ? pinnedIds : [lead.id]
                onRequest(pool, pool.length > 1 ? 'multi' : 'single')
              }}
            >
              {pinnedIds.length > 1 ? (
                <>
                  <b>{th ? `ขอ ${pinnedIds.length} คนที่บันทึกไว้` : `Ask ${pinnedIds.length} saved`}</b>
                  <small>{th ? 'พร้อมกัน · ใครรับก่อนได้เลย' : 'at once · first yes wins'}</small>
                </>
              ) : (
                <>
                  <b>{th ? `จองกับ ${lead.name}` : `Book with ${lead.name}`}</b>
                  <small>
                    {th ? 'เริ่ม' : 'from'} ฿{localPriceFor(lead.profile, e.id).toLocaleString('en-US')}
                  </small>
                </>
              )}
            </button>
          </>
        ) : locals.length > 0 ? (
          <button type="button" className="kx-quiet is-edit m-press" onClick={onEditSelf}>
            {lx('edit', language)}
          </button>
        ) : (
          <button type="button" className="kx-cta is-quiet m-press" onClick={close}>
            {th ? 'ดูทริปอื่น' : 'See other experiences'}
          </button>
        )}
        {lead && others.length > 1 && pinnedIds.length <= 1 && (
          <button type="button" className="kx-askmany m-press" data-testid="xd-ask-many" onClick={() => onRequest(others.map((l) => l.id).slice(0, 4), 'multi')}>
            {th ? `หรือทักหลายคนพร้อมกัน · ใครรับก่อนได้เลย` : `Or ask ${Math.min(4, others.length)} at once · first yes wins`}
          </button>
        )}
        <p className="kx-fine is-center">{th ? 'ราคาและเวลาตกลงกันในแชท' : 'Price & time are agreed in chat'}</p>
      </footer>
    </div>,
    document.body,
  )
}
