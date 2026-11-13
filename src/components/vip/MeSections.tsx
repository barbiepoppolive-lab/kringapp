import { useEffect, useRef, useState } from 'react'
import { announceLiveShown, isListingLive, setListingLive, useIdVerified, usePresence, type ListedExperience } from '../../context/presence'
import { getExperience } from '../../lib/experiences'
import { formatBahtValue } from '../../lib/money'
import { usePlanStore } from '../../lib/planStore'
import { playKring } from '../../lib/sfx'
import { triggerHaptic } from '../../lib/haptics'
import { guestMoneyRows, localMoneyRows, localReleasedThb, whenLabel, type GuestMoneyRow, type LocalMoneyRow } from '../wallet/bookingMoney'
import { KringBump } from '../ui/KringMark'
import { openMyProfile } from '../profile/MyProfile'
import ShareSheet from '../experiences/ShareSheet'
import { useTr, useIsThai } from './walletKit'

/**
 * KRING T3 · Me, one app (W4).
 *   • Money in (earned as a host) + money out (spent as a guest) — one wallet, read from the SAME planStore records
 *     as tickets / Chats / the living card (bookingMoney). Display only; amounts, never a percentage.
 *   • Your experiences — every listing with its own Live / Paused switch. Going Live plays the Liquid-light bump
 *     (KringBump, golive beat) in that row; the switch and the header pill flip on the CONTACT frame.
 *   • One Activity list — joining and hosting money together, newest first.
 */

const monthKey = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth()}`
}

/** IN = released to you as a host · OUT = held + paid as a guest (refunds come back off it). */
export function useMoneyInOut(): { inThb: number; outThb: number; guest: GuestMoneyRow[]; local: LocalMoneyRow[] } {
  const plans = usePlanStore()
  const guest = guestMoneyRows(plans)
  const local = localMoneyRows(plans)
  const inThb = localReleasedThb(plans)
  const outThb = guest.filter((r) => r.state === 'held' || r.state === 'released').reduce((a, r) => a + Math.max(0, r.thb - (r.backThb ?? 0)), 0)
  return { inThb, outThb, guest, local }
}

function listingTitle(x: ListedExperience, th: boolean): string {
  const e = getExperience(x.id)
  return (th ? x.titleTh || x.title : x.title || x.titleTh) || (e ? (th ? e.titleTh : e.title) : x.id)
}

const sameTitle = (a: string | undefined, b: string) => Boolean(a) && a!.trim().toLowerCase() === b.trim().toLowerCase()

/* ------------------------------------------------------------------------------------------------ */
/* Your experiences                                                                                 */
/* ------------------------------------------------------------------------------------------------ */

export function YourExperiences({ local }: { local: LocalMoneyRow[] }) {
  const tr = useTr()
  const th = useIsThai()
  const presence = usePresence()
  const verified = useIdVerified()
  const list = presence.experiences ?? []
  // the row whose Go Live bump is playing, and whether its contact frame has fired yet
  const [bump, setBump] = useState<{ id: string; n: number; hit: boolean } | null>(null)
  const clearRef = useRef(0)
  useEffect(() => () => window.clearTimeout(clearRef.current), [])

  // the 3-step "Share something you love" sheet opens right here (Experiences may not be mounted while Me is shown)
  const [shareOpen, setShareOpen] = useState(false)
  const share = () => {
    triggerHaptic('select')
    setShareOpen(true)
  }

  const toggle = (x: ListedExperience) => {
    const on = x.live !== false
    if (on) {
      setListingLive(x.id, false)
      triggerHaptic('heavy', { sound: false })
      announceLiveShown(isListingLive(x.id) ? 'live' : 'paused')
      if (bump?.id === x.id) setBump(null)
      return
    }
    setListingLive(x.id, true)
    if (!verified) {
      // the listing waits for the ID check; it goes Live the moment the check is done
      triggerHaptic('select')
      openMyProfile('verify')
      return
    }
    setBump((b) => ({ id: x.id, n: (b?.n ?? 0) + 1, hit: false }))
    window.clearTimeout(clearRef.current)
    // a bump that never plays (no canvas / hidden tab) still settles
    clearRef.current = window.setTimeout(() => setBump((b) => (b && b.id === x.id ? null : b)), 1800)
  }

  const onContact = (id: string) => {
    setBump((b) => (b && b.id === id ? { ...b, hit: true } : b))
    playKring('golive')
    announceLiveShown('live')
  }

  const now = Date.now()
  return (
    <section className="me6-sec" aria-labelledby="me6-exp-h" data-testid="me-your-experiences">
      {shareOpen && <ShareSheet open language={th ? 'th' : 'en'} onClose={() => setShareOpen(false)} />}
      {list.length ? (
        <>
          <h3 className="me6-sech" id="me6-exp-h">
            {tr('Your experiences', 'ประสบการณ์ของคุณ')}
            <em>{list.length}</em>
          </h3>
          <ul className="me6-lst">
            {list.map((x) => {
              const title = listingTitle(x, th)
              const e = getExperience(x.id)
              const rows = local.filter((r) => r.state !== 'refunded' && (sameTitle(r.title, title) || (e && (sameTitle(r.title, e.title) || sameTitle(r.title, e.titleTh)))))
              const booked = rows.filter((r) => monthKey(r.at) === monthKey(now)).length
              const earned = rows.filter((r) => r.state === 'released').reduce((a, r) => a + r.receiveThb, 0)
              const choice = x.live !== false
              const playing = bump?.id === x.id
              // the word flips on the rings' contact frame (or at once when nothing plays)
              const liveNow = choice && verified && (!playing || bump.hit)
              const waiting = choice && !verified
              const sub = [
                formatBahtValue(x.priceThb),
                waiting
                  ? tr('Live after your ID check', 'ออนไลน์หลังยืนยันตัวตน')
                  : booked
                    ? tr(`${booked} booked this month`, `จองเดือนนี้ ${booked}`)
                    : x.area || tr('no bookings yet', 'ยังไม่มีการจอง'),
                earned > 0 ? tr(`${formatBahtValue(earned)} earned`, `ได้รับ ${formatBahtValue(earned)}`) : '',
              ].filter(Boolean)
              return (
                <li key={x.id} className="me6-li" data-testid={`me-listing-${x.id}`} data-live={liveNow ? 'true' : 'false'}>
                  <span className="me6-th" aria-hidden="true">
                    {x.photo ? <img src={x.photo} alt="" /> : <span>{e?.emoji ?? '✦'}</span>}
                  </span>
                  <span className="me6-m">
                    <b>{title}</b>
                    <small data-testid={`me-listing-sub-${x.id}`}>{sub.join(' · ')}</small>
                  </span>
                  {playing ? (
                    <span className="me6-bump" aria-hidden="true">
                      <KringBump key={bump.n} state="together" playOnMount compact lens="flash" variant="golive" width={64} onContact={() => onContact(x.id)} label="" />
                    </span>
                  ) : null}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={choice}
                    className={`me6-sw${liveNow ? ' is-live' : waiting ? ' is-wait' : ''}`}
                    data-testid={`me-listing-switch-${x.id}`}
                    aria-label={tr(`${title}: ${liveNow ? 'Live' : waiting ? 'waiting for ID check' : 'Paused'}`, `${title}: ${liveNow ? 'ออนไลน์' : waiting ? 'รอยืนยันตัวตน' : 'พักไว้'}`)}
                    onClick={() => toggle(x)}
                  >
                    <span className="me6-sw-t">{liveNow ? tr('Live', 'ออนไลน์') : waiting ? tr('ID check', 'รอยืนยัน') : tr('Paused', 'พักไว้')}</span>
                    <i aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
      <button type="button" className="me6-share kf-press" data-testid="me-share-something" onClick={share}>
        ＋ {tr('Share something you love', 'แชร์สิ่งที่คุณรัก')}
      </button>
    </section>
  )
}

/* ------------------------------------------------------------------------------------------------ */
/* Your trips (as a guest)                                                                          */
/* ------------------------------------------------------------------------------------------------ */

export function YourTrips({ guest }: { guest: GuestMoneyRow[] }) {
  const tr = useTr()
  const th = useIsThai()
  const up = guest.filter((r) => r.state === 'held' && r.kind === 'booking')
  if (!up.length) return null
  return (
    <section className="me6-sec" data-testid="me-your-trips" aria-labelledby="me6-trips-h">
      <h3 className="me6-sech" id="me6-trips-h">
        {tr('Your trips', 'ทริปของคุณ')}
        <em>{tr(`${up.length} upcoming`, `${up.length} ทริปที่จะถึง`)}</em>
      </h3>
      <ul className="me6-lst">
        {up.slice(0, 3).map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className="me6-li is-btn"
              onClick={() => window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'chats' } }))}
            >
              <span className="me6-m">
                <b>{r.title || r.who}</b>
                <small>{[whenLabel(r.date, r.start, th), r.who ? tr(`with ${r.who}`, `กับ ${r.who}`) : ''].filter(Boolean).join(' · ')}</small>
              </span>
              <span className="me6-tag">{tr('Joining', 'ไปเที่ยว')}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ------------------------------------------------------------------------------------------------ */
/* One Activity list                                                                                */
/* ------------------------------------------------------------------------------------------------ */

interface ActRow {
  id: string
  at: number
  dir: 'in' | 'out' | 'wait'
  title: string
  sub: string
  thb: number
}

export function activityRows(guest: GuestMoneyRow[], local: LocalMoneyRow[], tr: (en: string, th: string) => string, th: boolean): ActRow[] {
  const out: ActRow[] = []
  for (const r of local) {
    const title = [r.title, r.guest].filter(Boolean).join(' · ')
    if (r.state === 'released') out.push({ id: `l-${r.id}`, at: r.releasedAt ?? r.at, dir: 'in', title, sub: tr('Earned · released at กริ๊ง!', 'ได้รับแล้ว · โอนตอนกริ๊ง!'), thb: r.receiveThb })
    else if (r.state === 'held') out.push({ id: `l-${r.id}`, at: r.at, dir: 'wait', title, sub: tr(`Yours at กริ๊ง! · ${whenLabel(r.date, r.start, th)}`, `ได้ตอนกริ๊ง! · ${whenLabel(r.date, r.start, th)}`), thb: r.receiveThb })
  }
  for (const r of guest) {
    const title = r.title ? (r.who ? `${r.title} · ${r.who}` : r.title) : r.who
    if (r.state === 'held') out.push({ id: `g-${r.id}`, at: r.heldAt, dir: 'out', title, sub: r.date ? tr(`Held until ${whenLabel(r.date, undefined, false)}`, `พักไว้ถึง ${whenLabel(r.date, undefined, true)}`) : tr('Held until you meet', 'พักไว้จนเจอกัน'), thb: r.thb })
    else if (r.state === 'released') out.push({ id: `g-${r.id}`, at: r.doneAt ?? r.heldAt, dir: 'out', title, sub: tr('Paid at กริ๊ง!', 'จ่ายตอนกริ๊ง!'), thb: Math.max(0, r.thb - (r.backThb ?? 0)) })
    else if (r.state === 'refunded') out.push({ id: `g-${r.id}`, at: r.doneAt ?? r.heldAt, dir: 'in', title, sub: tr('Back to you', 'คืนเข้ากระเป๋า'), thb: r.backThb ?? r.thb })
  }
  return out.sort((a, b) => b.at - a.at)
}

export function ActivityList({ guest, local, onSeeAll }: { guest: GuestMoneyRow[]; local: LocalMoneyRow[]; onSeeAll: () => void }) {
  const tr = useTr()
  const th = useIsThai()
  const rows = activityRows(guest, local, tr, th)
  return (
    <section className="me6-sec" data-testid="me-activity" aria-labelledby="me6-act-h">
      <h3 className="me6-sech" id="me6-act-h">
        {tr('Activity', 'ความเคลื่อนไหว')}
        <button type="button" className="me6-all" data-testid="wallet-home-activity" onClick={onSeeAll}>
          {tr('See all', 'ดูทั้งหมด')}
        </button>
      </h3>
      {rows.length ? (
        <ul className="me6-lst">
          {rows.slice(0, 3).map((r) => (
            <li key={r.id} className="me6-li" data-testid="me-activity-row">
              <span className={`me6-ic is-${r.dir}`} aria-hidden="true">{r.dir === 'out' ? '↑' : '↓'}</span>
              <span className="me6-m">
                <b>{r.title}</b>
                <small>{r.sub}</small>
              </span>
              <span className={`me6-v is-${r.dir}`}>
                {r.dir === 'out' ? '−' : '+'}
                {formatBahtValue(r.thb)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="me6-empty">{tr('Bookings you join and host show here.', 'ทริปที่คุณจองและที่คุณพาเที่ยวจะขึ้นที่นี่')}</p>
      )}
    </section>
  )
}
