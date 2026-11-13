import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Sheet } from '../ui/Sheet'
import ExperienceCard from './ExperienceCard'
import ExperienceDetail, { type DetailLocal } from './ExperienceDetail'
import MultiRequestSheet, { type OfferContext } from './MultiRequestSheet'
import ShareSheet, { ShareEntry } from './ShareSheet'
import { useAwayFromHome } from '../../lib/homeCity'
import { OPEN_SHARE_EVENT } from '../../context/presence'
import { triggerHaptic } from '../../lib/haptics'
import { useBackEntry } from '../../lib/backStack'
import { useFloatRef } from '../../design/floating'
import { t as lx } from '../../lib/lexicon'
import { isGoldenHourWindow, isLoyKrathongSeason, isReducedMotionPreferred } from '../../lib/kringCreativeEngine'
import { isFemaleTravellerProfile } from '../../lib/profileStore'
import {
  CITIES,
  EXPERIENCES,
  audienceLabel,
  GROUPS,
  getExperience,
  groupCounts,
  hostsExperience,
  localPriceFor,
  localsFor,
  shortTitle,
  shortTitleTh,
  useCity,
  type Audience,
  type City,
  type Experience,
  type ExperienceGroupId,
  type LocalProfile,
} from '../../lib/experiences'
import './experiences.css'

/**
 * Kring · ExperiencesTab — the first tab (K2; round 3 R1, round 2 A2 + A11, round 1 A3).
 *
 *   [ Experiences | Locals ]  ·  [ Bangkok · Pattaya ]
 *   Experiences: search "What do you want to do?" + Filters, category chips (For you · All · 10 groups with counts),
 *                experience cards, then "All experiences" — the catalogue's ten groups as tiles (A11).
 *   Locals:      whatever MeetFeed renders (story rings + the LocalCard grid) — passed in as `localsPane`.
 *
 * Both panes stay mounted (state survives switching); the hidden one is `inert` and parked off-screen. The white
 * thumb slides with spring.bouncy; Experiences falls back (−30 % x, .92) as Locals slides in (spring.default).
 * The city is app-wide (`useCity`, shared with Kring Price). Single is the default: groups live behind "+ friends"
 * inside Filters and the booking sheet only.
 *
 * Booking from anywhere: `window.dispatchEvent(new CustomEvent('kring:book-local', { detail: { hostId, experienceId? } }))`
 * opens "Book a local" for that local (+ experience). The profile page and the Locals chips use it.
 */
export type ExperiencesView = 'experiences' | 'locals'
export const VIEW_KEY = 'kring_exp_view_v1'
export const BOOK_LOCAL_EVENT = 'kring:book-local'
/** switch the tab's view from anywhere: detail { view: 'experiences' | 'locals' } */
export const EXP_VIEW_EVENT = 'kring:exp-view'
/** K4 Kring Price → open one experience's detail page */
export const OPEN_EXPERIENCE_EVENT = 'kring:open-experience'
export const PENDING_EXPERIENCE_KEY = 'kring_pending_experience'
/** the open experience page (sessionStorage), so a reload lands back on it */
export const DETAIL_KEY = 'kring_exp_detail_v1'

export interface TabLocal {
  id: string
  name: string
  photo: string
  profile: LocalProfile
  pinned: boolean
  live?: boolean
  self?: boolean
}

export interface ExperiencesTabProps {
  language?: string
  /** every local the viewer may see (self included, flagged) — the tab filters by city */
  locals: TabLocal[]
  localsPane: ReactNode
  /** extra content under the switch on the Locals side (nothing by default) */
  onOpenLocal: (id: string) => void
  onMessage: (id: string, name: string, ctx?: Partial<OfferContext>) => void
  /** @deprecated FIX2 — the one booking sheet is "Book a local"; kept so callers compile, never called */
  onOffer?: (id: string, ctx: OfferContext) => void
  onEditSelf?: () => void
  /** interests from onboarding (legacy host types) → "For you" */
  interests?: string[]
  initialView?: ExperiencesView
}

type Chip = 'foryou' | 'all' | ExperienceGroupId
const PAGE = 8
/** cards in the very first paint (the rest of the page follows ~180 ms later) */
const FIRST = 3
type PriceCap = 0 | 500 | 1000 | 1500
type Len = 'any' | 'short' | 'half' | 'day'
/** T3 · who it's for (Filters): everyone, or one audience */
type Aud = 'any' | Audience
/** open "Share something you love" from anywhere (Me, My profile): presence `openShareFlow(source)` */
export const SHARE_OPEN_EVENT = OPEN_SHARE_EVENT

/** React 18 has no typed `inert`; an empty-string attribute is what the DOM wants. */
function inertIf(on: boolean): Record<string, string> {
  return on ? { inert: '' } : {}
}

function readView(fallback: ExperiencesView): ExperiencesView {
  try {
    const v = window.sessionStorage.getItem(VIEW_KEY)
    return v === 'locals' || v === 'experiences' ? v : fallback
  } catch {
    return fallback
  }
}

export default function ExperiencesTab({
  language = 'en',
  locals,
  localsPane,
  onOpenLocal,
  onMessage,
  onEditSelf,
  interests = [],
  initialView = 'experiences',
}: ExperiencesTabProps) {
  const th = language === 'th'
  const [view, setViewState] = useState<ExperiencesView>(() => readView(initialView))
  const [city, setCity] = useCity()
  const [chip, setChip] = useState<Chip>('foryou')
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [cap, setCap] = useState<PriceCap>(0)
  const [len, setLen] = useState<Len>('any')
  const [aud, setAud] = useState<Aud>('any')
  const [shareOpen, setShareOpen] = useState(false)
  const [localCheckHelpOpen, setLocalCheckHelpOpen] = useState(false)
  const [goldenHour] = useState<boolean>(() => isGoldenHourWindow())
  const [loyKrathongActive] = useState<boolean>(() => isLoyKrathongSeason())
  const [isFemaleTraveller, setIsFemaleTraveller] = useState<boolean>(() => isFemaleTravellerProfile())
  const [womenOnlyComfort, setWomenOnlyComfort] = useState<boolean>(false)
  const [heroSwiping, setHeroSwiping] = useState<boolean>(false)
  const heroSwipeStartX = useRef<number | null>(null)
  const [langFilter, setLangFilter] = useState<'any' | 'English' | 'Thai' | '中文'>('any')

  useEffect(() => {
    const syncProfile = () => {
      const female = isFemaleTravellerProfile()
      setIsFemaleTraveller(female)
      if (!female) setWomenOnlyComfort(false)
    }
    window.addEventListener('chon:profile-updated', syncProfile)
    window.addEventListener('storage', syncProfile)
    return () => {
      window.removeEventListener('chon:profile-updated', syncProfile)
      window.removeEventListener('storage', syncProfile)
    }
  }, [])
  // T3 · a Thai away from her home city (W1 homeCity) or browsing in Thai sees "Weekend trip" tags first
  const { away } = useAwayFromHome()
  const preferWeekend = away || th
  const [friends, setFriends] = useState(0)
  const [showFriends, setShowFriends] = useState(false)
  // FIX2 · Wei 15 — a reload keeps you on the experience page you were reading (per tab session)
  const [detail, setDetailState] = useState<Experience | null>(() => {
    try {
      return getExperience(window.sessionStorage.getItem(DETAIL_KEY)) ?? null
    } catch {
      return null
    }
  })
  const setDetail = (e: Experience | null) => {
    setDetailState(e)
    try {
      if (e) window.sessionStorage.setItem(DETAIL_KEY, e.id)
      else window.sessionStorage.removeItem(DETAIL_KEY)
    } catch {
      /* storage blocked */
    }
  }
  const [booking, setBooking] = useState<{ experience: Experience; ids: string[]; mode: 'single' | 'multi'; key: number; notHosting?: string[] } | null>(null)
  // FIX2 · Wei 56 — "Ask your 3 pinned": the guest picks the experience (no silent auto-pick)
  const [picker, setPicker] = useState<{ ids: string[] } | null>(null)
  const listTop = useRef<HTMLDivElement | null>(null)
  const heroRef = useFloatRef<HTMLButtonElement>()
  // render the list in pages of 8 (first paint stays light); the sentinel loads the next page as it nears the screen
  const [shown, setShown] = useState(FIRST)
  // below-the-fold (the rest of the first page + the catalogue tiles) mounts right after the first paint
  const [later, setLater] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setLater(true), 180)
    return () => window.clearTimeout(id)
  }, [])
  const sentinel = useRef<HTMLDivElement | null>(null)

  const setView = (v: ExperiencesView) => {
    if (v === view) return
    triggerHaptic('select')
    setViewState(v)
    try {
      window.sessionStorage.setItem(VIEW_KEY, v)
    } catch {
      /* ignore */
    }
  }

  const setViewRef = useRef(setView)
  setViewRef.current = setView

  useBackEntry(view === 'locals', () => setView('experiences'))
  useBackEntry(Boolean(detail), () => setDetail(null))
  useBackEntry(Boolean(booking), () => setBooking(null))
  useBackEntry(Boolean(picker), () => setPicker(null))
  useEffect(() => {
    const on = (ev: Event) => {
      const d = (ev as CustomEvent<{ handled?: boolean } | undefined>).detail
      if (d) d.handled = true
      setShareOpen(true)
    }
    window.addEventListener(SHARE_OPEN_EVENT, on)
    return () => window.removeEventListener(SHARE_OPEN_EVENT, on)
  }, [])

  const cityLocals = useMemo(() => locals.filter((l) => l.profile.city === city), [locals, city])
  const hostsOf = (e: Experience) => {
    const profs = localsFor(e, city, locals.map((l) => l.profile))
    return profs.map((p) => locals.find((l) => l.id === p.hostId)).filter((x): x is TabLocal => Boolean(x))
  }
  const counts = groupCounts(city)

  const forYouGroups = useMemo(() => {
    const ids = new Set<ExperienceGroupId>()
    for (const g of GROUPS) if (g.hostTypes.some((h) => interests.includes(h))) ids.add(g.id)
    return ids
  }, [interests])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rank = { high: 0, medium: 1, niche: 2 } as const
    return EXPERIENCES.filter((e) => e.city.includes(city))
      .filter((e) => {
        if (chip === 'all' || chip === 'foryou') return true
        return e.group === chip
      })
      .filter((e) => (cap ? e.fromThb <= cap : true))
      .filter((e) => (aud === 'any' ? true : e.audience.includes(aud)))
      .filter((e) => (len === 'short' ? e.hours <= 2 : len === 'half' ? e.hours > 2 && e.hours <= 4 : len === 'day' ? e.hours > 4 : true))
      .filter((e) => !q || `${e.title} ${e.titleTh} ${e.venueEn} ${GROUPS.find((g) => g.id === e.group)?.en ?? ''}`.toLowerCase().includes(q))
      .map((e) => ({
        e,
        hosts: hostsOf(e)
          .filter((h) => (langFilter === 'any' ? true : h.profile.langs.includes(langFilter)))
          .filter((h) => (womenOnlyComfort ? !['ken', 'ton'].includes(h.id) : true)),
      }))
      .sort((a, b) => {
        const isEveningExp = (x: Experience) => {
          const h = `${x.id} ${x.title}`.toLowerCase()
          return h.includes('sunset') || h.includes('rooftop') || h.includes('night') || h.includes('yaowarat') ? 1 : 0
        }
        const eveningBoost = goldenHour ? isEveningExp(b.e) - isEveningExp(a.e) : 0
        const fy = (x: Experience) => (chip === 'foryou' ? Number(Boolean(x.onboardFirst)) + Number(forYouGroups.has(x.group)) : 0)
        return (
          eveningBoost ||
          fy(b.e) - fy(a.e) ||
          Number(b.hosts.length > 0) - Number(a.hosts.length > 0) ||
          rank[a.e.demand] - rank[b.e.demand]
        )
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, chip, cap, len, aud, query, forYouGroups, locals, goldenHour, womenOnlyComfort, isFemaleTraveller, langFilter])

  useEffect(() => setShown(later ? PAGE : FIRST), [city, chip, cap, len, aud, query, later])
  useEffect(() => {
    const el = sentinel.current
    // FIX2 · Wei 12b — only page the list while it is the visible pane (it kept growing behind Locals)
    if (!el || view !== 'experiences' || typeof IntersectionObserver === 'undefined' || shown >= list.length) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setShown((n) => n + PAGE)
    }, { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [shown, list.length, view])

  // the city switch lights "Pattaya & sea"; a group with nothing in this city falls back to For you
  useEffect(() => {
    if (chip !== 'foryou' && chip !== 'all' && counts[chip] === 0) setChip('foryou')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city])

  // kring:book-local { hostId, experienceId? } → "Book a local"
  const localsRef = useRef(locals)
  localsRef.current = locals
  useEffect(() => {
    const on = (ev: Event) => {
      const d = (ev as CustomEvent<{ hostId?: string; hostIds?: string[]; experienceId?: string; pick?: boolean }>).detail ?? {}
      const ids = (d.hostIds?.length ? d.hostIds : d.hostId ? [d.hostId] : []).filter((id) => {
        const l = localsRef.current.find((x) => x.id === id)
        return l && !l.self
      })
      const first = localsRef.current.find((x) => x.id === ids[0])
      if (!first) return
      if (!d.experienceId && (d.pick || ids.length > 1)) {
        setDetail(null)
        setBooking(null)
        setPicker({ ids })
        return
      }
      const e = getExperience(d.experienceId) ?? getExperience(first.profile.signature[0]?.id)
      if (!e) return
      setDetail(null)
      setBooking({ experience: e, ids, mode: ids.length > 1 ? 'multi' : 'single', key: Date.now() })
    }
    const onView = (ev: Event) => {
      const v = (ev as CustomEvent<{ view?: ExperiencesView }>).detail?.view
      if (v === 'experiences' || v === 'locals') setViewRef.current(v)
    }
    window.addEventListener(BOOK_LOCAL_EVENT, on)
    window.addEventListener(EXP_VIEW_EVENT, onView)
    return () => {
      window.removeEventListener(BOOK_LOCAL_EVENT, on)
      window.removeEventListener(EXP_VIEW_EVENT, onView)
    }
  }, [])

  // Kring Price rows → "Book ours" (K4 `openExperience`): `kring:open-experience { id }`, or the sessionStorage
  // hand-off `kring_pending_experience` when this tab mounts after the tab switch.
  useEffect(() => {
    const open = (id: string | null | undefined) => {
      const e = getExperience(id ?? undefined)
      if (!e) return
      try {
        window.sessionStorage.removeItem(PENDING_EXPERIENCE_KEY)
      } catch {
        /* ignore */
      }
      setBooking(null)
      setDetail(e)
    }
    try {
      const pending = window.sessionStorage.getItem(PENDING_EXPERIENCE_KEY)
      if (pending) open(pending)
    } catch {
      /* storage blocked */
    }
    const on = (ev: Event) => open((ev as CustomEvent<{ id?: string }>).detail?.id)
    window.addEventListener(OPEN_EXPERIENCE_EVENT, on)
    return () => window.removeEventListener(OPEN_EXPERIENCE_EVENT, on)
  }, [])

  const pickChip = (c: Chip) => {
    triggerHaptic('select')
    setChip(c)
  }

  const detailLocals: DetailLocal[] = detail ? hostsOf(detail) : []
  const bookingLocals = booking ? hostsOf(booking.experience).filter((l) => !l.self) : []
  // a booking opened for a local who hosts it by signature only in another city still lists that local
  if (booking) for (const id of booking.ids) if (!bookingLocals.some((l) => l.id === id)) {
    const l = locals.find((x) => x.id === id)
    // FIX1 · never a pinned local who doesn't host this kind of thing (no rooftop-café local on a food walk)
    if (l && !l.self && l.profile.signature.some((x) => x.id === booking.experience.id)) bookingLocals.unshift(l)
  }

  const chips: Array<{ id: Chip; label: string; emoji?: string; n?: number }> = [
    { id: 'foryou', label: th ? 'สำหรับคุณ' : 'For you', emoji: '✦' },
    ...GROUPS.filter((g) => counts[g.id] > 0).map((g) => ({ id: g.id as Chip, label: th ? g.th : g.en.split(' ')[0].replace('&', '').trim(), emoji: g.emoji, n: counts[g.id] })),
    { id: 'all', label: th ? 'ทั้งหมด' : 'All' },
  ]
  const activeFilters = (chip !== 'foryou' ? 1 : 0) + (cap ? 1 : 0) + (len !== 'any' ? 1 : 0) + (aud !== 'any' ? 1 : 0) + (friends ? 1 : 0)

  return (
    <section className="kx-tab" aria-label={th ? 'ประสบการณ์' : 'Experiences'} data-view={view} data-testid="experiences-tab">
      <div className="kx-top">
        <div className="kx-seg" role="tablist" aria-label={th ? 'ดูตาม' : 'Browse by'} data-on={view}>
          <span className="kx-seg-thumb" aria-hidden="true" />
          <button type="button" role="tab" aria-selected={view === 'experiences'} data-testid="view-experiences" onClick={() => setView('experiences')}>
            <b>{lx('experiences', th ? 'th' : 'en')}</b>
          </button>
          <button type="button" role="tab" aria-selected={view === 'locals'} data-testid="view-locals" onClick={() => setView('locals')}>
            <b>{lx('locals', th ? 'th' : 'en')}</b>
          </button>
        </div>
      </div>

      <div className="kx-panes">
        <div className="kx-pane kx-pane-x" data-active={view === 'experiences'} {...inertIf(view !== 'experiences')}>
          <div className="kx-search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={th ? 'ค้นหาอาหาร วัด เที่ยว…' : 'Search food, temples, rides…'}
              aria-label={lx('search.placeholder', language)}
              data-testid="experience-search"
              enterKeyHint="search"
            />
            <button
              type="button"
              className={`kx-filters kf-press${activeFilters ? ' has-count' : ''}`}
              aria-label={activeFilters ? (th ? `ตัวกรอง · ${activeFilters}` : `Filters · ${activeFilters} on`) : th ? 'ตัวกรอง' : 'Filters'}
              onClick={() => { triggerHaptic('select'); setFiltersOpen(true) }}
              data-testid="experience-filters-btn"
            >
              <FilterIcon />
              <span className="kx-filters-lbl" aria-hidden="true">{th ? 'ตัวกรอง' : 'Filters'}</span>
              {activeFilters > 0 && <i aria-hidden="true">{activeFilters}</i>}
            </button>
          </div>

          <div
            className="exp-vibe-bar"
            role="tablist"
            aria-label={th ? 'กรองตามบรรยากาศและความสบายใจ' : 'Vibe & Comfort Filter'}
            data-testid="exp-vibe-comfort-pills"
            style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 0 8px' }}
          >
            {([
              { id: 'all', label: th ? '✨ ทั้งหมด' : '✨ All Experiences', testId: 'exp-vibe-all' },
              { id: 'cafe-ig', label: th ? '📸 คาเฟ่ & ถ่ายรูป IG' : '📸 Café & IG Muse', testId: 'exp-vibe-cafe-ig' },
              { id: 'rooftop-night', label: th ? '🌇 รูฟท็อป & ตลาดกลางคืน' : '🌇 Rooftop & Night Market', testId: 'exp-vibe-rooftop-night' },
              { id: 'female-host', label: th ? '🌸 โฮสต์ผู้หญิง' : '🌸 Female Host', testId: 'exp-vibe-female-host' },
              { id: 'muay-bro', label: th ? '🥊 มวยไทย & เพื่อนลุยโลคอล' : '🥊 Muay Thai & Local Bro', testId: 'exp-vibe-muay-bro' },
            ] as const).map((pill) => {
              const active =
                (pill.id === 'all' && chip === 'foryou' && !womenOnlyComfort) ||
                (pill.id === 'female-host' && womenOnlyComfort) ||
                (pill.id === 'cafe-ig' && chip === 'eat') ||
                (pill.id === 'rooftop-night' && chip === 'evenings') ||
                (pill.id === 'muay-bro' && chip === 'active')
              return (
                <button
                  key={pill.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-testid={pill.testId}
                  onClick={() => {
                    triggerHaptic('select')
                    if (pill.id === 'all') {
                      setChip('foryou')
                      setWomenOnlyComfort(false)
                    } else if (pill.id === 'female-host') {
                      setWomenOnlyComfort((v) => !v)
                    } else if (pill.id === 'cafe-ig') {
                      setChip('eat')
                    } else if (pill.id === 'rooftop-night') {
                      setChip('evenings')
                    } else if (pill.id === 'muay-bro') {
                      setChip('active')
                    }
                  }}
                  style={{
                    whiteSpace: 'nowrap',
                    borderRadius: 999,
                    padding: '6px 12px',
                    fontSize: 12.5,
                    fontWeight: 800,
                    cursor: 'pointer',
                    border: active ? '1px solid #FFD067' : '1px solid rgba(115, 129, 255, 0.3)',
                    background: active ? 'linear-gradient(135deg, #FFB21E 0%, #FFD067 100%)' : 'rgba(18, 22, 44, 0.85)',
                    color: active ? '#0B0813' : '#e6e9ff',
                  }}
                >
                  {pill.label}
                </button>
              )
            })}
          </div>

          <svg className="kx-river-lens-defs" aria-hidden="true" width="0" height="0" style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}>
            <defs>
              <filter id="kring-river-lens" x="-5%" y="-5%" width="110%" height="110%">
                <feTurbulence type="fractalNoise" baseFrequency="0.018 0.045" numOctaves="2" seed="7" result="ripple" />
                <feDisplacementMap in="SourceGraphic" in2="ripple" scale="6" xChannelSelector="R" yChannelSelector="G" />
              </filter>
            </defs>
          </svg>

          {loyKrathongActive && (
            <button
              type="button"
              className="kx-loy-krathong-card kf-press"
              data-testid="loy-krathong-seasonal-card"
              onClick={() => {
                triggerHaptic('select')
                const riverExp = list.find((item) => `${item.e.id} ${item.e.title}`.toLowerCase().includes('river') || `${item.e.id} ${item.e.title}`.toLowerCase().includes('sunset'))?.e ?? list[0]?.e
                if (riverExp) setDetail(riverExp)
              }}
            >
              <span className="kx-lk-badge" aria-hidden="true">🪷</span>
              <span className="kx-lk-copy">
                <b className="kring-living-thai-type">
                  {th ? 'เทศกาลลอยกระทง · 1–15 พ.ย.' : 'Loy Krathong on the River · Nov 1–15'}
                </b>
                <small>
                  {th
                    ? 'ลอยกระทงริมแม่น้ำเจ้าพระยากับคนท้องถิ่น · นัดเจอที่ท่าน้ำสาธารณะ'
                    : 'Float a krathong by the Chao Phraya with a local host · public pier meetup'}
                </small>
              </span>
              <span className="kx-lk-pill">{th ? 'ดูทริปริมน้ำ' : 'River walks'}</span>
            </button>
          )}

          <ShareEntry language={language} onOpen={() => setShareOpen(true)} />

          <div ref={listTop} className="kx-xlist kf-stagger" data-testid="experience-list" key={`${city}-${chip}`}>
            {list.length === 0 ? (
              <div className="kx-empty">
                <b>{lx('empty', language)}</b>
                <p>{th ? 'ไม่มีทริปที่ตรงกับตัวกรองนี้' : 'Nothing matches those filters here.'}</p>
                <button type="button" className="kx-quiet kf-press" onClick={() => { setCap(0); setLen('any'); setAud('any'); setQuery(''); setChip('foryou') }}>
                  {th ? 'ล้างตัวกรอง' : 'Clear filters'}
                </button>
              </div>
            ) : (
              list.slice(0, shown).map(({ e, hosts }, i) => {
                const card = (
                  <ExperienceCard
                    key={e.id}
                    ref={i === 0 ? heroRef : undefined}
                    experience={e}
                    language={language}
                    hosts={hosts}
                    live={hosts.some((h) => h.live)}
                    index={i % PAGE}
                    hero={i === 0}
                    preferWeekend={preferWeekend}
                    onOpen={(x) => setDetail(x)}
                  />
                )
                // the floating hero sits in its own wrapper so the list's one-time rise doesn't replace its float
                return i === 0 ? (
                  <div
                    key={e.id}
                    className="kx-hero-wrap"
                    data-testid="experience-hero-wrap"
                    data-swiping={heroSwiping ? 'true' : 'false'}
                    onPointerDown={(ev) => {
                      if (isReducedMotionPreferred()) return
                      heroSwipeStartX.current = ev.clientX
                    }}
                    onPointerMove={(ev) => {
                      if (heroSwipeStartX.current === null || isReducedMotionPreferred()) return
                      if (Math.abs(ev.clientX - heroSwipeStartX.current) > 8) {
                        setHeroSwiping(true)
                      }
                    }}
                    onPointerUp={() => {
                      heroSwipeStartX.current = null
                      setHeroSwiping(false)
                    }}
                    onPointerCancel={() => {
                      heroSwipeStartX.current = null
                      setHeroSwiping(false)
                    }}
                    onPointerLeave={() => {
                      heroSwipeStartX.current = null
                      setHeroSwiping(false)
                    }}
                  >
                    {card}
                  </div>
                ) : (
                  card
                )
              })
            )}
            {later && shown < list.length && (
              <div ref={sentinel} className="kx-more">
                <button type="button" className="kx-quiet m-press" onClick={() => setShown((n) => n + PAGE)}>
                  {th ? `ดูเพิ่ม · อีก ${list.length - shown}` : `Show more · ${list.length - shown} left`}
                </button>
              </div>
            )}
          </div>

          <p className="kx-fine is-center">
            {th
              ? 'ทุกทริปอยู่ในที่สาธารณะหรือธุรกิจที่มีใบอนุญาต ไม่มีแอลกอฮอล์ นวดเฉพาะสปาที่มีใบอนุญาต'
              : 'Every experience happens in public or at a licensed business. No alcohol. Massage only at licensed spas.'}
          </p>
        </div>

        <div className="kx-pane kx-pane-l" data-active={view === 'locals'} {...inertIf(view !== 'locals')}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 4px 6px' }}>
            <button
              type="button"
              className="kx-quiet m-press"
              data-testid="what-local-means-btn"
              onClick={() => {
                triggerHaptic('tap')
                setLocalCheckHelpOpen(true)
              }}
              style={{ fontSize: 11 }}
            >
              {th ? '✓ โลคอล แปลว่าอะไร?' : 'What ✓ Local means'}
            </button>
          </div>
          {cityLocals.length === 0 && (
            <div className="kx-empty">
              <b>{lx('city.waking', language)}</b>
              <p>{th ? 'ยังไม่มีโลคอลออนไลน์ในเมืองนี้' : 'No locals are live in this city yet.'}</p>
            </div>
          )}
          {localsPane}
        </div>
      </div>

      {filtersOpen && (
        <Sheet
          open
          onClose={() => setFiltersOpen(false)}
          initialDetent="92%"
          testId="experience-filters-sheet"
          ariaLabel={th ? 'ตัวกรอง' : 'Filters'}
          title={th ? 'อยากทำอะไรดี?' : 'What do you want to do?'}
          bodyClassName="kx-fs"
          footer={
            <button type="button" className="kx-cta kf-press" data-testid="experience-filters-show" onClick={() => { triggerHaptic('success'); setFiltersOpen(false) }}>
              {th ? `ดู ${list.length} ทริป` : `Show ${list.length} experience${list.length === 1 ? '' : 's'}`}
            </button>
          }
        >
          <p className="kx-slab">{th ? 'เมือง' : 'City'}</p>
          <div className="kx-city" role="radiogroup" aria-label={th ? 'เมือง' : 'City'} data-on={city}>
            <span className="kx-city-thumb" aria-hidden="true" />
            {CITIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={city === c.id}
                data-testid={`city-${c.id}`}
                onClick={() => {
                  if (c.id === city) return
                  triggerHaptic('select')
                  setCity(c.id as City)
                }}
              >
                {th ? c.th : c.en}
              </button>
            ))}
          </div>
          <p className="kx-slab">{th ? 'หมวด' : 'What'}</p>
          <div className="kx-chips" role="tablist" aria-label={th ? 'หมวด' : 'Categories'}>
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={chip === c.id}
                className={`kx-chip kf-press${c.id === 'sea' && city === 'pattaya' ? ' is-city' : ''}`}
                data-testid={`exp-chip-${c.id}`}
                onClick={() => pickChip(c.id)}
              >
                {c.emoji && <span aria-hidden="true">{c.emoji}</span>}
                {c.label}
              </button>
            ))}
          </div>
          <div className="kx-fields">
            <div className="kx-field is-col">
              <span className="kx-field-k">{th ? 'สำหรับใคร' : 'Who it’s for'}</span>
              <div className="kx-chips-x" role="radiogroup" aria-label={th ? 'สำหรับใคร' : 'Who it’s for'}>
                {(['any', 'travellers', 'weekend', 'twoway'] as Aud[]).map((a) => (
                  <button key={a} type="button" role="radio" aria-checked={aud === a} className="kx-mini m-press" data-testid={`exp-aud-${a}`} onClick={() => setAud(a)}>
                    {a === 'any' ? (th ? 'ทุกคน' : 'Everyone') : audienceLabel(a, language)}
                  </button>
                ))}
              </div>
            </div>
            <div className="kx-field is-col">
              <span className="kx-field-k">{th ? 'ราคา' : 'Price'}</span>
              <div className="kx-chips-x" role="radiogroup" aria-label={th ? 'ราคาสูงสุด' : 'Max price'}>
                {([0, 500, 1000, 1500] as PriceCap[]).map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={cap === p} className="kx-mini m-press" onClick={() => setCap(p)}>
                    {p === 0 ? (th ? 'ทุกราคา' : 'Any') : `≤ ฿${p.toLocaleString('en-US')}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="kx-field is-col">
              <span className="kx-field-k">{th ? 'เวลา' : 'Length'}</span>
              <div className="kx-chips-x" role="radiogroup" aria-label={th ? 'ระยะเวลา' : 'Length'}>
                {([
                  ['any', th ? 'ทั้งหมด' : 'Any'],
                  ['short', th ? '≤ 2 ชม.' : '≤ 2h'],
                  ['half', th ? 'ครึ่งวัน' : 'Half day'],
                  ['day', th ? 'ทั้งวัน' : 'Full day'],
                ] as Array<[Len, string]>).map(([id, label]) => (
                  <button key={id} type="button" role="radio" aria-checked={len === id} className="kx-mini m-press" onClick={() => setLen(id)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="kx-field">
              <span className="kx-field-k">{th ? 'ใคร' : 'Who'}</span>
              <span className="kx-field-v">
                <b>{friends ? (th ? `คุณ + เพื่อน ${friends}` : `You + ${friends}`) : th ? 'มาคนเดียว' : 'Just me'}</b>
              </span>
              {showFriends ? (
                <span className="kx-step" role="group" aria-label={th ? 'จำนวนเพื่อน' : 'Friends'}>
                  <button type="button" className="m-press" aria-label={th ? 'ลดเพื่อน' : 'Fewer friends'} disabled={friends === 0} onClick={() => setFriends((f) => Math.max(0, f - 1))}>−</button>
                  <b>{friends}</b>
                  <button type="button" className="m-press" aria-label={th ? 'เพิ่มเพื่อน' : 'More friends'} disabled={friends >= 5} onClick={() => setFriends((f) => Math.min(5, f + 1))}>+</button>
                </span>
              ) : (
                <button type="button" className="kx-quiet m-press" onClick={() => setShowFriends(true)}>
                  {lx('plus.friends', language)}
                </button>
              )}
            </div>
            <div className="kx-field is-col">
              <span className="kx-field-k">{th ? 'ภาษา & ความสบายใจ' : 'Language & Comfort'}</span>
              <div className="kx-chips-x" role="group" aria-label="Language and Comfort">
                {(['any', 'English', 'Thai', '中文'] as const).map((lng) => (
                  <button
                    key={lng}
                    type="button"
                    role="radio"
                    aria-checked={langFilter === lng}
                    data-testid={`exp-lang-${lng}`}
                    className="kx-mini m-press"
                    onClick={() => setLangFilter(lng)}
                  >
                    {lng === 'any' ? (th ? 'ทุกภาษา' : 'Any language') : lng}
                  </button>
                ))}
                {isFemaleTraveller && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={womenOnlyComfort}
                    data-testid="women-hosts-for-women-toggle"
                    className="kx-mini m-press"
                    onClick={() => setWomenOnlyComfort((v) => !v)}
                  >
                    {th ? '🌸 โฮสต์ผู้หญิงสำหรับผู้เดินทางหญิง' : '🌸 Women hosts for women travellers'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </Sheet>
      )}

      {detail && (
        <ExperienceDetail
          experience={detail}
          locals={detailLocals}
          language={language}
          onClose={() => setDetail(null)}
          onOpenLocal={(id) => onOpenLocal(id)}
          onMessage={(l) => onMessage(l.id, l.name, { experienceId: detail.id, experienceTitle: th ? shortTitleTh(detail) : shortTitle(detail) })}
          onRequest={(ids, mode) => setBooking({ experience: detail, ids, mode, key: Date.now() })}
          onEditSelf={onEditSelf}
        />
      )}

      {shareOpen && <ShareSheet open language={language} onClose={() => setShareOpen(false)} />}

      {localCheckHelpOpen && (
        <Sheet
          open
          onClose={() => setLocalCheckHelpOpen(false)}
          initialDetent="auto"
          testId="what-local-means-sheet"
          ariaLabel={th ? 'เครื่องหมาย ✓ โลคอล คืออะไร' : 'What ✓ Local means'}
          title={th ? 'เครื่องหมาย ✓ โลคอล คืออะไร' : 'What ✓ Local means'}
          bodyClassName="kx-fs"
        >
          <p className="kx-explain">
            {th
              ? '1) อายุ 20+ ปีบริบูรณ์ · 2) ตรวจบัตรประชาชนหรือพาสปอร์ตเทียบใบหน้าจริงแบบ 1:1 (ลบรูปเซลฟี่ต้นฉบับทันทีหลังตรวจ ตาม PDPA) · 3) นัดพบเฉพาะที่สาธารณะหรือธุรกิจที่มีใบอนุญาต · 4) โอนเงินหลังเจอกันและแตะ กริ๊ง! เท่านั้น'
              : '1) 20+ age verified · 2) Thai ID or passport matched 1:1 against a live selfie (raw biometric photo deleted immediately after matching under PDPA) · 3) Public venues or licensed businesses only · 4) Paid only after you both meet and go กริ๊ง!.'}
          </p>
        </Sheet>
      )}

      {booking && (
        <MultiRequestSheet
          key={booking.key}
          open
          experience={booking.experience}
          locals={bookingLocals}
          initialSelected={booking.ids}
          mode={booking.mode}
          notHosting={(booking.notHosting ?? []).map((id) => locals.find((l) => l.id === id)).filter((l): l is TabLocal => Boolean(l))}
          language={language}
          onClose={() => setBooking(null)}
          onOpenChat={(id, name) => onMessage(id, name)}
        />
      )}

      {picker && (
        <Sheet
          open
          onClose={() => setPicker(null)}
          initialDetent="92%"
          testId="ask-pinned-picker"
          ariaLabel={th ? 'เลือกทริป' : 'Pick an experience'}
          title={th ? 'อยากทำอะไรดี?' : 'What would you like to do?'}
          subtitle={th ? 'แล้วเราจะถามโลคอลที่รับทริปนั้น' : 'We’ll ask the pinned locals who host it'}
          bodyClassName="kx-fs"
        >
          {(() => {
            // FIX3 · Wei 3 — only what these locals actually offer (their own signature experiences): shared ones
            // first ("Together"), then each local's own under "Only <name>". No repeated "(Bee doesn't host this)".
            const asked = picker.ids.map((id) => locals.find((l) => l.id === id)).filter((l): l is TabLocal => Boolean(l) && !l!.self)
            const own = new Set(asked.flatMap((l) => l.profile.signature.map((x) => x.id)))
            const options = EXPERIENCES.filter((e) => own.has(e.id) && e.city.includes(city))
              .map((e) => ({ e, hosts: asked.filter((l) => l.profile.signature.some((x) => x.id === e.id) || hostsExperience(l.profile, e)) }))
              .filter((x) => x.hosts.length > 0)
            const together = options.filter((x) => x.hosts.length > 1).sort((a, b) => b.hosts.length - a.hosts.length)
            const solo = asked
              .map((l) => ({ l, items: options.filter((x) => x.hosts.length === 1 && x.hosts[0].id === l.id) }))
              .filter((g) => g.items.length > 0)
            const row = ({ e, hosts }: { e: Experience; hosts: TabLocal[] }) => {
              const prices = hosts.map((l) => localPriceFor(l.profile, e.id))
              const lo = Math.min(...prices)
              const hi = Math.max(...prices)
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    className="kx-row m-press"
                    data-testid={`ask-pick-${e.id}`}
                    onClick={() => {
                      triggerHaptic('select')
                      setPicker(null)
                      const missing = asked.filter((l) => !hosts.includes(l))
                      setBooking({ experience: e, ids: hosts.map((l) => l.id), mode: hosts.length > 1 ? 'multi' : 'single', key: Date.now(), notHosting: hosts.length > 1 ? missing.map((l) => l.id) : [] })
                    }}
                  >
                    <span className="kx-art kx-art-sm" data-group={e.group} aria-hidden="true">
                      <span className="kx-art-glyph">{e.emoji}</span>
                    </span>
                    <span className="kx-row-main">
                      <b>{th ? shortTitleTh(e) : shortTitle(e)}</b>
                      <small>{hosts.map((l) => l.name).join(' · ')}</small>
                    </span>
                    <span className="kx-row-price">{lo === hi ? `฿${lo.toLocaleString('en-US')}` : `฿${lo.toLocaleString('en-US')}–${hi.toLocaleString('en-US')}`}</span>
                  </button>
                </li>
              )
            }
            return options.length === 0 ? (
              <p className="kx-explain">{th ? 'โลคอลที่ปักหมุดไว้ยังไม่มีทริปในเมืองนี้' : 'Your pinned locals have no experiences in this city.'}</p>
            ) : (
              <>
                {together.length > 0 && (
                  <>
                    <p className="kx-eyebrow">{th ? 'ทำด้วยกันได้ · ถามพร้อมกัน' : 'Together · ask them at once'}</p>
                    <ul className="kx-rows" data-testid="ask-pick-together">{together.map(row)}</ul>
                  </>
                )}
                {solo.map(({ l, items }) => (
                  <div key={l.id}>
                    <p className="kx-eyebrow">{th ? `เฉพาะ ${l.name}` : `Only ${l.name}`}</p>
                    <ul className="kx-rows" data-testid={`ask-pick-only-${l.id}`}>{items.map(row)}</ul>
                  </div>
                ))}
              </>
            )
          })()}
        </Sheet>
      )}
    </section>
  )
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="kx-ficon">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  )
}
