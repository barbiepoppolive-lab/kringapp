import { type ReactNode, useEffect, useRef, useState } from 'react'
import { triggerHaptic } from '../../lib/haptics'
import { t as lex } from '../../lib/lexicon'
import { tripSavedEntries, useTripSaved } from '../../lib/tripSavings'
import { useFloatRef } from '../../design/floating'
import { bahtLabel } from '../pulse/floorPrices'
import { Sheet } from '../ui/Sheet'
import KringPriceHelp from './KringPriceHelp'
import PriceCheck, { type PriceCheckHandle } from './PriceCheck'
import { PRICES_CHECKED, itemsIn, longDate, saveOf, shortDate, showsTouristGap, type KringAction, type KringCity, type KringPriceItem } from './priceData'
import { useKringCity } from './useKringCity'
import '../../styles/kring-price.css'

/**
 * Kring Price tab — V2 visual round (P2 "Fable" column + P3 price wording B, founder-approved).
 *
 *   "Kring Price · ราคากริ๊ง" + "?" + a compact BKK | PTY pill
 *   → photo cards like Experiences: the name + ONE glass chip "Street price ฿X → Kring ฿Y" (the street price struck in
 *     red only when a dated source states it for this exact thing; otherwise just "Kring ฿Y · all-in").
 *     The top card is the screen's one floating hero (V1 Floating utilities). Tap a card → its source, date,
 *     cheapest-elsewhere line and "Book ours".
 *   → the quiet line "Got a different quote? Check it ›" opens Price Check in a sheet (no floating camera button).
 *   → a small row of the other tools (rides, eSIM, bundles, driver card, hold-1155) at the very end.
 * Booking flows stay in BkkPulseTab / PulseFlows / BundleSheet; this component only asks for them via callbacks.
 */
export interface KringPriceTabProps {
  lang: string
  isLocal?: boolean
  onOpenRide: (zone: 'airport' | 'city' | 'pattaya') => void
  onOpenEsim: () => void
  onOpenBundles: () => void
  onOpenDriverCard: () => void
  sosTile: ReactNode
}

/** the approved wording (P3 · B): Street price → Kring price · ราคาทั่วไป → ราคากริ๊ง */
export const PRICE_WORDS = {
  street: { en: lex('price.street', 'en'), th: lex('price.street', 'th') },
  kring: { en: 'Kring', th: 'ราคากริ๊ง' },
  kringPrice: { en: 'Kring price', th: 'ราคากริ๊ง' },
} as const

/** scene photo per price item (local licensed JPEGs, same pipeline as Experiences) */
const PHOTO: Record<string, string> = {
  'airport-car': '/photos/experiences/practical-bangkok.jpg',
  'muay-thai-ringside': '/photos/experiences/muay-thai.jpg',
  'thai-massage-60': '/photos/experiences/thai-spa.jpg',
  'tourist-esim': '/photos/experiences/pretrip-map.jpg',
  'bangkok-pattaya-car': '/photos/experiences/koh-larn-beach.jpg',
}

export function openExperience(id: string) {
  window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'meet' } }))
  try {
    window.sessionStorage.setItem('kring_pending_experience', id)
  } catch {
    // ignore
  }
  window.setTimeout(() => window.dispatchEvent(new CustomEvent('kring:open-experience', { detail: { id } })), 260)
}

function PriceCard({ item: i, lang, hero, onOpen }: { item: KringPriceItem; lang: string; hero: boolean; onOpen: () => void }) {
  const th = lang === 'th'
  const [failed, setFailed] = useState(false)
  const floatRef = useFloatRef<HTMLButtonElement>()
  const gap = showsTouristGap(i)
  const w = (k: keyof typeof PRICE_WORDS) => (th ? PRICE_WORDS[k].th : PRICE_WORDS[k].en)
  const name = th ? i.title.th : i.title.en
  const spoken = gap
    ? `${name}: ${w('street')} ${bahtLabel(i.touristThb)}, ${w('kringPrice')} ${bahtLabel(i.kringThb)}. ${th ? 'ดูรายละเอียด' : 'Details'}`
    : `${name}: ${w('kringPrice')} ${bahtLabel(i.kringThb)}. ${th ? 'ดูรายละเอียด' : 'Details'}`
  return (
    <button
      ref={hero ? floatRef : undefined}
      type="button"
      className={`kp2-card kf-press${hero ? ' kf-hero' : ''}`}
      data-testid={`kp-row-${i.id}`}
      data-cat={i.category}
      aria-label={spoken}
      onClick={() => {
        triggerHaptic('tap')
        onOpen()
      }}
    >
      <span className="kp2-art" data-cat={i.category} aria-hidden="true">
        {!failed && PHOTO[i.id] && <img src={PHOTO[i.id]} alt="" decoding="async" draggable={false} onError={() => setFailed(true)} />}
        {(failed || !PHOTO[i.id]) && <span className="kp2-glyph">{i.emoji}</span>}
      </span>
      <span className="kp2-fade" aria-hidden="true" />
      {hero && <span className="kf-spec" aria-hidden="true" />}
      <span className="kp2-name" aria-hidden="true">{name}</span>
      <span className="kp2-chip" aria-hidden="true">
        {gap ? (
          <>
            <span>{w('street')}</span>
            <s>{bahtLabel(i.touristThb)}</s>
            <span className="kp2-ar">→</span>
            <span>{w('kring')}</span>
            <b>{bahtLabel(i.kringThb)}</b>
          </>
        ) : (
          <>
            <span>{w('kring')}</span>
            <b>{bahtLabel(i.kringThb)}</b>
            <span className="kp2-note">{i.kringNote === 'all-in' ? (th ? 'รวมทุกอย่าง' : 'all-in') : th ? 'เริ่มต้น' : 'from'}</span>
          </>
        )}
      </span>
    </button>
  )
}

function PriceDetail({ item: i, lang, onBook }: { item: KringPriceItem; lang: string; onBook: () => void }) {
  const th = lang === 'th'
  const gap = showsTouristGap(i)
  return (
    <div className="kp2-detail" data-testid="kp-detail">
      <p className="kp2-sub">{th ? i.sub.th : i.sub.en}</p>
      <div className="kp2-compare">
        {gap && (
          <div className="kp2-col">
            <small>{th ? PRICE_WORDS.street.th : PRICE_WORDS.street.en}</small>
            <s className="kp2-street">{bahtLabel(i.touristThb)}</s>
          </div>
        )}
        {gap && <span className="kp2-ar is-big" aria-hidden="true">→</span>}
        <div className="kp2-col">
          <small>{th ? PRICE_WORDS.kringPrice.th : PRICE_WORDS.kringPrice.en}</small>
          <b className="kp2-kring">{bahtLabel(i.kringThb)}</b>
        </div>
      </div>
      {gap && (
        <span className="kp2-save" data-testid={`kp-row-save-${i.id}`}>
          {th ? `เซฟ ${bahtLabel(saveOf(i))} เทียบราคาทั่วไป` : `Save ${bahtLabel(saveOf(i))} vs street price`}
        </span>
      )}
      {i.elsewhere && (
        <p className="kp2-line" data-testid="kp-detail-elsewhere">
          {th
            ? `ถูกสุดที่อื่น ${bahtLabel(i.elsewhere.thb)} · ${i.elsewhere.where.th} · เช็ค ${shortDate(i.elsewhere.checked, lang)}`
            : `Cheapest elsewhere ${bahtLabel(i.elsewhere.thb)} · ${i.elsewhere.where.en} · checked ${shortDate(i.elsewhere.checked, lang)}`}
        </p>
      )}
      {gap ? (
        <p className="kp2-line">
          {th ? 'ที่มาของราคาทั่วไป: ' : 'Street price source: '}
          <a href={i.touristSource.url} target="_blank" rel="noreferrer">
            {i.touristSource.name} ↗
          </a>
          <br />
          <span className="kp2-dim">
            {i.touristSource.note} · {th ? 'ข้อมูลของแหล่ง' : 'dated'} {longDate(i.touristSource.published, lang)} · {th ? 'เราเช็คเมื่อ' : 'we checked'}{' '}
            {shortDate(i.touristSource.checked, lang)}
          </span>
        </p>
      ) : (
        <p className="kp2-line kp2-dim">
          {th ? 'ยังไม่มีราคาทั่วไปที่เทียบกันได้ตรง ๆ จึงไม่ขีดฆ่า' : 'No like-for-like street price with a dated source yet, so nothing is struck.'}
        </p>
      )}
      <button type="button" className="kp-btn kp-btn-gold kp-btn-block kf-press" data-testid="kp-detail-book" onClick={onBook}>
        {th ? `จองของเรา · ${bahtLabel(i.kringThb)}` : `Book ours · ${bahtLabel(i.kringThb)}`}
      </button>
    </div>
  )
}

export default function KringPriceTab({ lang, isLocal, onOpenRide, onOpenEsim, onOpenBundles, onOpenDriverCard, sosTile }: KringPriceTabProps) {
  const th = lang === 'th'
  const [city, setCity] = useKringCity()
  const [helpOpen, setHelpOpen] = useState(false)
  const [tipDismissed, setTipDismissed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('kring_deals_tip_dismissed_v1') === '1'
    } catch {
      return false
    }
  })
  const [checkOpen, setCheckOpen] = useState(false)
  const [detail, setDetail] = useState<KringPriceItem | null>(null)
  const saved = useTripSaved(false)
  const bookings = saved > 0 ? tripSavedEntries(false).length : 0
  const checkRef = useRef<PriceCheckHandle>(null)
  const pendingQ = useRef<string | null>(null)
  const items = itemsIn(city)

  const switchCity = (c: KringCity) => {
    if (c === city) return
    triggerHaptic('select')
    setCity(c)
  }

  // a shared check link (kring.app/check?city=…&q=…) opens Price Check with that quote
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      const q = p.get('q') ?? p.get('check')
      const c = p.get('city')
      if (c === 'bangkok' || c === 'pattaya') setCity(c)
      if (q) {
        pendingQ.current = q
        setCheckOpen(true)
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!checkOpen) return
    if (!pendingQ.current) {
      // opened from "Check it ›": the quote field is ready to type in
      const id = window.setTimeout(() => checkRef.current?.focus(), 380)
      return () => window.clearTimeout(id)
    }
    const q = pendingQ.current
    pendingQ.current = null
    const id = window.setTimeout(() => checkRef.current?.run(q), 60)
    return () => window.clearTimeout(id)
  }, [checkOpen])

  const act = (a: KringAction) => {
    setDetail(null)
    setCheckOpen(false)
    if (a.kind === 'ride') onOpenRide(a.zone)
    else if (a.kind === 'esim') onOpenEsim()
    else openExperience(a.id)
  }

  return (
    <div className="kp kp2" data-testid="kring-price">
      <header className="kp2-top">
        <div className="kp2-title">
          <h2>{th ? 'ราคากริ๊ง' : 'Kring Price'}</h2>
        </div>
        <button
          type="button"
          className="kp2-q"
          data-testid="kp-help-btn"
          aria-label={th ? 'ราคากริ๊ง คืออะไร' : 'What is the Kring price?'}
          onClick={() => {
            triggerHaptic('tap')
            setHelpOpen(true)
          }}
        >
          ?
        </button>
        <div className="kp2-city" role="radiogroup" aria-label={th ? 'เมือง' : 'City'} data-testid="kp-city-switch">
          {(['bangkok', 'pattaya'] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={city === c}
              aria-label={c === 'bangkok' ? (th ? 'กรุงเทพฯ' : 'Bangkok') : th ? 'พัทยา' : 'Pattaya'}
              data-testid={`kp-city-${c}`}
              onClick={() => switchCity(c)}
            >
              <span>{c === 'bangkok' ? 'BKK' : 'PTY'}</span>
            </button>
          ))}
        </div>
      </header>

      {!tipDismissed && (
        <div
          className="kp2-tip-banner"
          data-testid="kp-first-visit-tip"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '7px 11px',
            borderRadius: '11px',
            background: 'rgba(115, 129, 255, 0.11)',
            border: '1px solid rgba(115, 129, 255, 0.25)',
            fontSize: '11.5px',
            fontWeight: 600,
            color: '#d8dcff',
          }}
        >
          <span>
            {th
              ? '💡 เทียบราคาทั่วไปกับราคากริ๊ง · พร้อมดีลพาร์ทเนอร์'
              : '💡 Street price vs fair Kring price · plus instant partner perks'}
          </span>
          <button
            type="button"
            aria-label={th ? 'ปิดคำแนะนำ' : 'Dismiss tip'}
            onClick={() => {
              setTipDismissed(true)
              try {
                window.localStorage.setItem('kring_deals_tip_dismissed_v1', '1')
              } catch {
                /* ignore */
              }
            }}
            style={{ background: 'none', border: 0, color: '#9ea4c6', fontSize: '14px', fontWeight: 800, padding: '0 4px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {!isLocal && saved > 0 ? (
        <p className="kp2-saved" data-testid="pulse-savings-hero" role="status">
          {th ? 'ทริปนี้เซฟไป ' : 'You saved '}
          <b>{bahtLabel(saved)}</b>
          {th ? '' : ' this trip'}
          <span data-testid="pulse-savings-baseline">
            {' · '}
            {th ? `${bookings} การจองที่ถูกกว่าแอปอื่นที่ถูกสุด` : `${bookings} ${bookings === 1 ? 'booking' : 'bookings'} below cheapest elsewhere`}
          </span>
        </p>
      ) : null}

      <div key={city} className="kp2-list kf-stagger">
        {items.map((i, idx) =>
          idx === 0 ? (
            <div key={i.id} className="kp2-hero-wrap">
              <PriceCard item={i} lang={lang} hero onOpen={() => setDetail(i)} />
            </div>
          ) : (
            <PriceCard key={i.id} item={i} lang={lang} hero={false} onOpen={() => setDetail(i)} />
          ),
        )}
      </div>

      <button
        type="button"
        className="kp2-check kf-press"
        data-testid="pulse-tool-scam-check"
        onClick={() => {
          triggerHaptic('tap')
          setCheckOpen(true)
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <span>{th ? 'ได้ราคาอื่นมาเหรอ?' : 'Got a different quote?'}</span>
        <b>{th ? 'เช็คเลย ›' : 'Check it ›'}</b>
      </button>

      <p className="kp2-foot">
        {th ? `ราคาทั่วไปมาจากแหล่งจริง พร้อมวันที่ · เช็ค ${shortDate(PRICES_CHECKED, lang)} · ` : `Street prices are real quotes, with source and date · checked ${shortDate(PRICES_CHECKED, lang)} · `}
        <button type="button" className="kp-link" onClick={() => setHelpOpen(true)}>
          {th ? 'ดูที่มา' : 'Sources'}
        </button>
      </p>

      <div className="kp2-tools" role="group" aria-label={th ? 'เครื่องมือ' : 'More from Kring'}>
        <button type="button" className="kp2-tool kf-press" data-testid="pulse-tool-ride" onClick={() => onOpenRide(city === 'pattaya' ? 'pattaya' : 'city')}>
          <i aria-hidden="true">🚕</i>
          <span>{th ? 'เรียกรถ' : 'Rides'}</span>
        </button>
        <button type="button" className="kp2-tool kf-press" data-testid="kp-tool-esim" onClick={onOpenEsim}>
          <i aria-hidden="true">📶</i>
          <span>eSIM</span>
        </button>
        <button type="button" className="kp2-tool kf-press" data-testid="pulse-bundle-row" onClick={() => (triggerHaptic('tap'), onOpenBundles())}>
          <i aria-hidden="true">🧳</i>
          <span>{th ? 'แพ็กเกจ' : 'Bundles'}</span>
        </button>
        <button type="button" className="kp2-tool kf-press" data-testid="pulse-tool-taxi-card" onClick={onOpenDriverCard}>
          <i aria-hidden="true">🪪</i>
          <span>{th ? 'การ์ดคนขับ' : 'Driver card'}</span>
        </button>
      </div>
      <div className="kp2-sos">{sosTile}</div>

      {detail && (
        <Sheet open onClose={() => setDetail(null)} initialDetent="auto" testId="kp-detail-sheet" ariaLabel={th ? detail.title.th : detail.title.en} title={th ? detail.title.th : detail.title.en}>
          <PriceDetail item={detail} lang={lang} onBook={() => act(detail.action)} />
        </Sheet>
      )}

      {checkOpen && (
        <Sheet
          open
          onClose={() => setCheckOpen(false)}
          initialDetent="92%"
          testId="kp-check-sheet"
          ariaLabel={th ? 'เช็คราคา' : 'Price Check'}
          title={th ? 'ได้ราคามาเท่าไหร่?' : 'What were you quoted?'}
        >
          <PriceCheck ref={checkRef} city={city} lang={lang} onCityToggle={() => switchCity(city === 'bangkok' ? 'pattaya' : 'bangkok')} onAction={act} />
        </Sheet>
      )}

      <KringPriceHelp open={helpOpen} onClose={() => setHelpOpen(false)} city={city} lang={lang} />
    </div>
  )
}
