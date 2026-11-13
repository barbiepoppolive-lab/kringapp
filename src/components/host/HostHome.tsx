import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { triggerHaptic } from '../../lib/haptics'
import HelpDot from '../ui/HelpDot'
import Odometer from '../ui/Odometer'
import { Sheet } from '../ui/Sheet'
import { LiveDot } from '../ui/LivingIcons'
import { showIsland } from '../fx/island'
import { syncPlanStoreMode, usePlanStore, currentViewerId, viewerDisplayName, partnerKey } from '../../lib/planStore'
import { hostPlaceholderUri } from '../../lib/imageFallback'
import { HOST_STORY_KEY, type HostStoryNight } from '../meet/MeetFeed'
import { nightStore, NIGHT_STORE_EVENT } from '../../lib/demoState'
import { usePresence, writePresence } from '../../context/presence'
import { openEditProfile } from '../../lib/selfGuard'
import { LOCAL_PROFILES } from '../../lib/experiences'
import { localMoneyRows } from '../wallet/bookingMoney'
import IncomingOffers from '../booking/IncomingOffers'
import '../../styles/meet-motion.css'
import '../../styles/chat-pulse.css'

/**
 * KRING · Local home ("Today") — FIX1.
 *
 * Everything on this page reads the ONE booking store (planStore) — the legacy Chonn request card (Alex · spa ·
 * 20:00 "tonight") is gone:
 *   · Live / Paused is the shared presence (the same switch as My profile). Pausing works here; going Live opens My
 *     profile, where the ID check + "at least one experience" rule lives.
 *   · Today's ring: solid arc = released to you today (her amount for each booking, at the กริ๊ง! bump), faint arc = booked
 *     for today and still held. "This week" = released in the last 7 days; "Upcoming" = everything still held for you.
 *     The numbers move the moment a booking is released (localMoneyRows → planStore).
 *   · Incoming booking requests, today's tickets and the bump: `booking/IncomingOffers` (every request names its
 *     experience; a real account with no requests gets a helpful empty state + a labelled example).
 *   · FIX2: no paid hourly extensions — a time change is a "Suggest a change" (time) on the offer card.
 * Testids kept: host-home, host-online-switch, host-home-earnings, host-ring, host-earn-today, host-goal-line,
 * host-earn-split, host-goal-edit, host-goal-<n>, host-earn-week, host-earn-clearing, host-home-price-link,
 * host-home-story-link, host-home-see-hosts, host-price-sheet, host-price-value, host-price-save, host-ask-<key>.
 */
export interface HostRequest { id: string; guest: string; flag: string; venue: string; time: string; receiveThb: number; noShowThb: number; minutesAgo: number; offerThb?: number; guestNote?: string; avatar?: string; age?: number }

const PRICE_KEY = 'chon_host_price_v1'
/** the local's own daily goal (this device only) */
const GOAL_KEY = 'chon_host_goal_v1'
const GOAL_DEFAULT = 2200
const GOAL_CHIPS = [1500, 2200, 3000, 5000]
const PRICE_FLOOR = 300
const PRICE_CHIPS = [600, 800, 1000, 1200, 1500]

function readGoal(): number {
  try {
    const n = Number(window.localStorage.getItem(GOAL_KEY))
    return Number.isFinite(n) && n >= 500 ? n : GOAL_DEFAULT
  } catch {
    return GOAL_DEFAULT
  }
}

function readPrice(fallback: number): number {
  try {
    const n = Number(window.localStorage.getItem(PRICE_KEY))
    return Number.isFinite(n) && n >= PRICE_FLOOR ? n : fallback
  } catch {
    return fallback
  }
}

/** Bangkok calendar day of a timestamp */
const bkkDayOf = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10)

/** A face, never a letter: per-person placeholder underneath, photo crossfades in when it loads. */
function Face({ name, src, size = 'md' }: { name: string; src?: string; size?: 'md' | 'lg' }) {
  const [ok, setOk] = useState(false)
  const [bad, setBad] = useState(false)
  const ph = useMemo(() => `url("${hostPlaceholderUri(name, true)}")`, [name])
  return (
    <span className={`hh-av hh-face${size === 'lg' ? ' hh-av-lg' : ''}`} aria-hidden="true" style={{ backgroundImage: ph }}>
      {src && !bad ? <img src={src} alt="" loading="lazy" decoding="async" data-no-fallback="" className={ok ? 'is-in' : undefined} onLoad={() => setOk(true)} onError={() => setBad(true)} /> : null}
    </span>
  )
}

export default function HostHome({
  hostName,
  language = 'en',
  onSeeOtherHosts,
}: {
  hostName: string
  language?: string
  /** legacy props (pre-Kring request card / static earnings) — ignored: everything reads planStore now */
  venue?: string
  time?: string
  treatThb?: number
  requests?: HostRequest[]
  earnings?: { today: number; week: number; clearing: number }
  onSeeOtherHosts?: () => void
}) {
  const th = language === 'th'
  const presence = usePresence()
  const online = presence.live
  const me = viewerDisplayName(hostName?.trim() || (th ? 'คุณ' : 'You'))
  // her own catalogue entry (name match) → the experience + meeting point her preview card shows
  const profile = Object.values(LOCAL_PROFILES).find((p) => p.name.toLowerCase() === me.split(/\s+/)[0]?.toLowerCase())
  const sig = profile?.signature[0]
  // FIX2 · Ploy 7: the starting price is what she LISTED (go-live checklist), not an invented ฿1,000
  const listedFrom = (presence.experiences ?? []).reduce((m, x) => (x.priceThb > 0 ? Math.min(m, x.priceThb) : m), Number.POSITIVE_INFINITY)
  const [price, setPrice] = useState<number>(() => readPrice(Number.isFinite(listedFrom) ? listedFrom : sig?.fromThb ?? 1000))
  const [priceOpen, setPriceOpen] = useState(false)
  const [draftPrice, setDraftPrice] = useState(price)
  const now = Date.now()
  const [goal, setGoal] = useState<number>(() => readGoal())
  const [goalOpen, setGoalOpen] = useState(false)
  // today's story (MeetFeed writes it to the night store when she posts)
  const readStory = () => nightStore.get<HostStoryNight | null>(HOST_STORY_KEY, null)
  const [liveStory, setLiveStory] = useState<HostStoryNight | null>(() => readStory())
  useEffect(() => {
    const sync = () => setLiveStory(readStory())
    const onNight = (e: Event) => {
      const key = (e as CustomEvent<{ key?: string }>).detail?.key
      if (!key || key === HOST_STORY_KEY) sync()
    }
    window.addEventListener(NIGHT_STORE_EVENT, onNight)
    window.addEventListener('chon:host-story-posted', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(NIGHT_STORE_EVENT, onNight)
      window.removeEventListener('chon:host-story-posted', sync)
      window.removeEventListener('storage', sync)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const store = usePlanStore()
  useEffect(() => syncPlanStoreMode(), [])

  // ---- money: ONE truth (planStore bookings where she is the local) ----
  const rows = localMoneyRows(store)
  const today = bkkDayOf(now)
  // FIX3 · Ploy: a release counts on the booking's OWN day (a demo-skipped Sunday trip never fills today's goal)
  const earnedToday = rows.filter((r) => r.state === 'released' && r.releasedAt && (r.date || bkkDayOf(r.releasedAt)) === today).reduce((a, r) => a + r.receiveThb, 0)
  const bookedToday = rows.filter((r) => r.state === 'held' && r.date === today).reduce((a, r) => a + r.receiveThb, 0)
  const week = rows.filter((r) => r.state === 'released' && r.releasedAt && now - r.releasedAt < 7 * 86_400_000).reduce((a, r) => a + r.receiveThb, 0)
  const upcoming = rows.filter((r) => r.state === 'held').reduce((a, r) => a + r.receiveThb, 0)
  // FIX3 · Ploy 6: a request waiting for HER answer shows what it would add ("฿800 ถ้าตกลง")
  const ifAccepted = Object.values(store.offers)
    .filter((o) => partnerKey(o.localId) === partnerKey(currentViewerId()) && o.lastBy === 'guest' && o.status === 'open' && now < o.replyBy)
    .reduce((a, o) => a + Math.round(o.terms.priceThb * 0.8), 0)
  const ringThb = earnedToday + bookedToday
  const earnedPct = Math.min(100, Math.round((earnedToday / Math.max(1, goal)) * 100))
  const pct = Math.min(100, Math.round((ringThb / Math.max(1, goal)) * 100))
  // the ring "jumps" once when a release lands while she is looking
  const [jump, setJump] = useState(0)
  const [lastEarned, setLastEarned] = useState(earnedToday)
  useEffect(() => {
    if (earnedToday > lastEarned) setJump((j) => j + 1)
    setLastEarned(earnedToday)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earnedToday])

  const saveGoal = (g: number) => {
    setGoal(g)
    try {
      window.localStorage.setItem(GOAL_KEY, String(g))
    } catch {
      // ignore
    }
    triggerHaptic('select')
  }
  const fmt = (n: number) => `฿${n.toLocaleString('en-US')}`
  const go = (tab: string, extra: Record<string, unknown> = {}) => window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab, ...extra } }))

  const savePrice = () => {
    const next = Math.max(PRICE_FLOOR, draftPrice)
    setPrice(next)
    try {
      window.localStorage.setItem(PRICE_KEY, String(next))
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent('chon:host-price', { detail: { thb: next } }))
    triggerHaptic('success')
    showIsland(th ? `ราคาเริ่มต้นของคุณ ${fmt(next)}` : `Your starting price is ${fmt(next)}`, 'gold', '💰')
    setPriceOpen(false)
  }

  const portal = (node: React.ReactNode) => (typeof document !== 'undefined' ? createPortal(node, document.body) : node)
  const venueLine = profile ? (th ? profile.placeTh : profile.placeEn) : th ? 'จุดนัดสาธารณะ' : 'a public meeting point'

  return (
    <section className="ux-hosthome hh" data-testid="host-home" aria-label={th ? 'หน้าโลคอล · วันนี้' : 'Local home · today'}>
      <div className="hh-top">
        <h2 className="hh-title">{th ? 'วันนี้' : 'Today'}</h2>
        <HelpDot id="host-home" language={language} />
        <span className="hh-grow" />
        <span className={`hh-status${online ? ' is-on' : ''}`}>
          <LiveDot live={online} />
          {online ? (th ? 'ออนไลน์อยู่' : 'Live') : th ? 'พักไว้ก่อน' : 'Paused'}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={online}
          aria-label={th ? 'ออนไลน์อยู่ / พักไว้ก่อน' : 'Live / Paused'}
          className="ux-switch"
          data-testid="host-online-switch"
          onClick={() => {
            if (online) {
              triggerHaptic('warning')
              writePresence({ live: false })
              showIsland(th ? 'พักไว้ก่อน · ไม่แสดงในหน้าโลคอล' : 'Paused · hidden from Locals', 'neutral')
            } else {
              // going Live lives in My profile (ID check + at least one experience)
              triggerHaptic('select')
              openEditProfile()
            }
          }}
        />
      </div>

      {/* today's ring against her own daily goal — released (solid) vs booked for today (faint), never mixed */}
      <div className="hh-earn hh-ringrow" data-testid="host-home-earnings">
        <span
          className="hh-ring"
          style={{ '--hh-p': `${earnedPct}%`, '--hh-q': `${pct}%` } as CSSProperties}
          role="img"
          aria-label={
            th
              ? `วันนี้ ${fmt(ringThb)} · โอนแล้ว ${fmt(earnedToday)} · รวมที่จองวันนี้ ${pct}% ของเป้า ${fmt(goal)}`
              : `Today ${fmt(ringThb)} · released ${fmt(earnedToday)} · ${pct}% of the ${fmt(goal)} goal booked`
          }
          data-testid="host-ring"
          data-earned={earnedToday}
          data-booked={bookedToday}
        >
          {jump ? <span key={jump} className="hh-ring-pop" aria-hidden="true" /> : null}
          <i>
            <b className="hh-odo"><Odometer value={ringThb} prefix="฿" testId="host-earn-today" /></b>
            <small className="hh-ring-cap">{th ? 'วันนี้' : 'today'}</small>
          </i>
        </span>
        <span className="hh-ring-t">
          <span className="hh-mono">{th ? 'รายได้วันนี้' : 'Today so far'}</span>
          <span className="hh-goal" data-testid="host-goal-line">
            {th ? `โอนแล้ว ${fmt(earnedToday)} · ${pct}% ของเป้า` : `Released ${fmt(earnedToday)} · ${pct}% of goal`}
          </span>
          <p className="hh-sub" data-testid="host-earn-split">
            {bookedToday > 0 ? (
              <>
                {th ? 'รอกริ๊ง ' : ''}
                <b className="hh-booked">{fmt(bookedToday)}</b>
                {th ? '' : ' at the bump'}
                {' · '}
              </>
            ) : null}
            {th ? 'เป้าวันนี้ ' : "today's goal "}
            <button type="button" className="hh-goal-btn" data-testid="host-goal-edit" aria-expanded={goalOpen} onClick={() => { triggerHaptic('tap'); setGoalOpen((v) => !v) }}>
              {fmt(goal)} <span aria-hidden="true">✎</span>
            </button>
          </p>
          <p className="hh-sub hh-sub-sm">
            {th ? '7 วันล่าสุด ' : 'Last 7 days '}
            <Odometer value={week} prefix="฿" testId="host-earn-week" />
            {' · '}
            {th ? 'รอกริ๊ง ' : 'upcoming '}
            <Odometer value={upcoming} prefix="฿" testId="host-earn-clearing" />
            {ifAccepted > 0 ? <span className="hh-if" data-testid="host-earn-if-accepted">{th ? ` (+฿${ifAccepted.toLocaleString('en-US')} ถ้าตกลง)` : ` (+฿${ifAccepted.toLocaleString('en-US')} if you accept)`}</span> : null}
          </p>
        </span>
      </div>
      {goalOpen && (
        <div className="hh-goalpick" role="group" aria-label={th ? 'เป้าวันนี้' : 'Daily goal'}>
          {GOAL_CHIPS.map((g) => (
            <button key={g} type="button" aria-pressed={goal === g} className="mm-chip m-press" data-testid={`host-goal-${g}`} onClick={() => { saveGoal(g); setGoalOpen(false) }}>
              {fmt(g)}
            </button>
          ))}
          <span className="hh-goal-step">
            <button type="button" className="ux-step m-press" aria-label={th ? 'ลดเป้า' : 'Lower goal'} disabled={goal <= 500} onClick={() => saveGoal(Math.max(500, goal - 100))}>−</button>
            <button type="button" className="ux-step m-press" aria-label={th ? 'เพิ่มเป้า' : 'Raise goal'} onClick={() => saveGoal(goal + 100)}>+</button>
          </span>
        </div>
      )}

      {/* incoming booking requests (countdown ring → ticket) + today's tickets + the bump + the venue-change setting */}
      <IncomingOffers localId={currentViewerId()} localName={me} th={th} fromThb={price} online={online} showStatus={false} />

      <div className="hh-links">
        <button
          type="button"
          className="hh-link"
          data-testid="host-home-price-link"
          onClick={() => {
            triggerHaptic('tap')
            setDraftPrice(price)
            setPriceOpen(true)
          }}
        >
          <span className="hh-link-t">
            <span>💰 {th ? 'ราคาเริ่มต้นต่อทริป' : 'Your starting price per experience'}</span>
            <small>{th ? 'ทริปเดินกินส่วนใหญ่ ฿800–1,200' : 'Most food walks ask ฿800–1,200'}</small>
          </span>
          <em>{fmt(price)} ›</em>
        </button>
        <button type="button" className="hh-link" data-testid="host-home-story-link" data-live={liveStory ? 'true' : undefined} onClick={() => { triggerHaptic('tap'); window.dispatchEvent(new CustomEvent('chon:open-story-camera')) }}>
          <span>{liveStory ? <>🟢 {th ? 'สตอรี่ออนไลน์อยู่ · ถึง 06:00 น.' : 'Story is live · until 06:00'}</> : <>📸 {th ? 'โพสต์สตอรี่วันนี้' : "Post today's story"}</>}</span>
          <em>›</em>
        </button>
        <button type="button" className="hh-link" onClick={() => { triggerHaptic('tap'); go('vip', { subAction: 'cashout' }) }}>
          <span>🏦 {th ? 'ถอนเข้าพร้อมเพย์' : 'Withdraw to PromptPay'}</span>
          <em>›</em>
        </button>
        <button type="button" className="hh-link" onClick={() => { triggerHaptic('tap'); window.dispatchEvent(new CustomEvent('chon:open-safety', { detail: { section: 'sos' } })) }}>
          <span>🛡️ {th ? 'ความปลอดภัย · SOS 1155' : 'Safety · SOS 1155'}</span>
          <em>›</em>
        </button>
      </div>
      <p className="hh-foot">{th ? 'นัดในที่สาธารณะเท่านั้น · เงินแขกพักไว้ แล้วโอนให้ตอนกริ๊ง' : 'Public places only · the guest’s money is held, then released to you at the bump'}</p>
      {online ? (
        /* FIX2 · Ploy 4 (relay F2): a Local's first tab is this page — show her the card guests see (Locals, her card first) */
        <button
          type="button"
          className="ux-hosthome-link hh-see"
          data-testid="host-home-see-as-guest"
          onClick={() => {
            triggerHaptic('tap')
            onSeeOtherHosts?.()
            window.setTimeout(() => window.dispatchEvent(new CustomEvent('kring:exp-view', { detail: { view: 'locals' } })), 120)
          }}
        >
          {th ? 'ดูโปรไฟล์แบบที่แขกเห็น' : 'See how guests see you'}
        </button>
      ) : null}
      <button type="button" className="ux-hosthome-link hh-see" data-testid="host-home-see-hosts" onClick={() => { triggerHaptic('tap'); onSeeOtherHosts?.() }}>{th ? 'ดูโลคอลคนอื่น' : 'See other locals'}</button>

      {priceOpen &&
        portal(
          <Sheet open onClose={() => setPriceOpen(false)} initialDetent="92%" testId="host-price-sheet" ariaLabel={th ? 'ราคาเริ่มต้นของคุณ' : 'Your starting price'} bodyClassName="hh-sheet">
            <div className="hh-sheet-head">
              <h3>{th ? 'ราคาเริ่มต้นของคุณ' : 'Your starting price'}</h3>
              <HelpDot id="host-home" language={language} />
            </div>
            <p className="hh-sub">{th ? 'ราคาเริ่มต้นต่อทริป · แขกเห็นบนการ์ดของคุณ และเสนอราคา/ต่อรองในแชทได้' : 'Your starting price per experience. Guests see it on your card and can offer or counter in chat.'}</p>
            <div className="hh-step">
              <button type="button" className="ux-step m-press" aria-label={th ? 'ลดราคา' : 'Lower price'} disabled={draftPrice <= PRICE_FLOOR} onClick={() => { triggerHaptic('select'); setDraftPrice((p) => Math.max(PRICE_FLOOR, p - 50)) }}>−</button>
              <b className="hh-big" data-testid="host-price-value">{fmt(draftPrice)}</b>
              <button type="button" className="ux-step m-press" aria-label={th ? 'เพิ่มราคา' : 'Raise price'} onClick={() => { triggerHaptic('select'); setDraftPrice((p) => p + 50) }}>+</button>
            </div>
            <div className="hh-chips">
              {PRICE_CHIPS.map((c) => (
                <button key={c} type="button" aria-pressed={draftPrice === c} className="mm-chip m-press" onClick={() => { triggerHaptic('select'); setDraftPrice(c) }}>{fmt(c)}</button>
              ))}
            </div>
            <p className="hh-hint">{th ? 'ทริปเดินกินส่วนใหญ่ ฿800–1,200 · สปามีใบอนุญาต ฿1,100–1,500' : 'Most food walks ask ฿800–1,200 · licensed spa afternoons ฿1,100–1,500.'}</p>
            <span className="hh-mono">{th ? 'แขกจะเห็น' : 'Guests see'}</span>
            <div className="hh-preview" aria-label={th ? 'ตัวอย่างการ์ด' : 'Card preview'}>
              <Face name={me} />
              <span className="hh-req-who">
                <b>{me} {profile ? <span className="hh-ver" aria-hidden="true">✓</span> : null}</b>
                <small>{sig ? `${th ? sig.titleTh : sig.titleEn} · ` : ''}📍 {venueLine}</small>
              </span>
              <span className="hh-prev-btn">{th ? 'จอง' : 'Book'} · {fmt(draftPrice)}</span>
            </div>
            <button type="button" className="ux-btn ux-btn-gold m-press hh-save" data-testid="host-price-save" onClick={savePrice}>
              {th ? 'บันทึกราคา' : 'Save price'}
            </button>
          </Sheet>,
        )}
    </section>
  )
}
