/* Activity detail, Book & pay (booking ticket by host-price band + 7-Day Pass), Request sent. */
import { areaName } from './explore'
import { thArea } from '../core/stories'
import { useEffect, useMemo, useRef, useState } from 'react'
import { S, update, useS, type Booking } from '../core/store'
import { t, act, hostName, aTitle, ph, baht, fx, SL, bTime, dayFmt, langsOf, dietWord, ini, maxPpl, hostTotal, tRange, pplN, atTime, sameDay, kringLine, placeLine, homeCountry, payList, isApplePay, isPromptPay, myPass, launchFreeFor, ticketPreview, overlaps, newRef, refundable, cancelBooking, bkTitle, replyDeadline, replyBy, replyLine, expireUnanswered, noRefundWhy, downloadIcs, CUR_CHOICES, curCountry, curSymbol, type Act } from '../core/data'
import { register, go, toast, needAccount } from '../core/router'
import { api, live } from '../core/api'
import { bell, buzz, tick } from '../core/sound'
import { openChat } from '../core/chatLinks'
import { meetName, meetNameTh, meetAddress, meetMapsUrl } from '../core/places'
import {
  parseHostReferralLink,
  captureAndGetStickyRef,
  getPartnerReconRows,
  recordPartnerReconBooking,
} from '../core/creatorBoard'
import {
  KR6_PRODUCTS,
  resolveBookingTicketQuote,
  passUntilFrom,
  getRequiredTicketTier,
} from '../core/ticketsAndRails'
import { I, Ic, Av, Sheet } from '../ui/kit'
import { DetailHost, ActFacts } from './hostProfile'
import { takePassIntent } from '../core/passIntent'
import { friendApplies } from '../core/hosts'

/** Guests from abroad: most personal Thai QRs can't be scanned by Alipay, WeChat Pay or foreign bank apps (say it before booking). */
const foreignGuest = (): boolean => S.lang !== 'th' && homeCountry() !== 'TH'
/** How many separate bookings one host slot takes (each booking is 1-2 people). */
const slotSpots = (a: Act): number => Math.max(1, a.liveSpotsLeft ?? 2)
/** My open bookings of this activity at this day and start time. */
const mineAt = (a: Act, day: Date, time: string): Booking[] => S.bookings.filter((b) => b.kind === 'act' && b.act === a.id && b.status !== 'cancelled' && !b.done && b.time === time && sameDay(b.date, day))
/** Set by #held "Book another spot": the next Book & pay opens on the same day and time and allows a second booking there. */
let extraSpot: { ref: string; day: Date; time: string; act: string } | null = null

/** "Each booking is for 1-2 people. Coming with more? ..." with the way to partner group tours. */
function GroupHelp({ a, id }: { a: Act; id: string }) {
  return (
    <div className="col small" id={id} style={{ gap: 6 }}>
      <span style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}><span style={{ flex: 'none', marginTop: 1 }}><Ic p={I.users} s={14} /></span><span>{t('groupHelp', { n: maxPpl(a) })}</span></span>
      <button className="chip" data-go="tours" data-how="f" style={{ alignSelf: 'flex-start', height: 'auto', minHeight: 32, whiteSpace: 'normal', fontSize: 12.5 }}>{t('groupLink')}<Ic p={I.chev} s={14} /></button>
    </div>
  )
}

/** Food choices this activity is not tagged for (halal, Jain, vegetarian): the guest should tell the host in chat. */
function dietMiss(a: Act, diet: readonly string[]): string[] {
  return diet.filter((d) => (d === 'halal' && !a.halal) || (d === 'jain' && !a.jain) || (d === 'veg' && !a.veg))
}

function DietChip({ a }: { a: Act }) {
  if (S.diet.includes('halal') && a.halal) return <span className="dchip">{t('halalOk')}</span>
  if (S.diet.includes('jain') && a.jain) return <span className="dchip">{t('jainOk')}</span>
  if (S.diet.includes('veg') && a.veg) return <span className="dchip">{t('vegOk')}</span>
  return null
}

/* ---- detail ---- */
function Detail() {
  const s = useS()
  const a = act(), h = hostName(a)
  const sc = useRef<HTMLDivElement>(null), hero = useRef<HTMLDivElement>(null), ft = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sc.current; if (!el) return
    const on = () => { const y = el.scrollTop; if (hero.current) hero.current.style.transform = `translateY(${y * 0.35}px)`; ft.current?.classList.toggle('solid', y > 160) }
    el.addEventListener('scroll', on, { passive: true })
    return () => el.removeEventListener('scroll', on)
  }, [])
  const back = ['locals', 'experiences', 'saved'].includes(s.from.detail) ? s.from.detail : 'experiences'
  const vol = !!a.isVolunteer || a.price === 0
  // Same rule as Book & pay: launch ticket, an active 7-Day Pass, or the ticket for this host price.
  const pv = ticketPreview(a)
  const ticket = pv.now
  const free = pv.kind === 'launch' || pv.kind === 'covered'
  const money = pv.kind === 'launch' ? t('payStoryFree', { host: h, price: baht(a.price) })
    : pv.kind === 'covered' ? (vol ? t('passCovered') + '. ' + t('volNothing', { host: h }) : t('payStoryPass', { host: h, price: baht(a.price) }))
      : vol ? t('payStoryVol', { ticket: baht(ticket), host: h }) : t('payStory', { ticket: baht(ticket), host: h, price: baht(a.price) })
  const area = areaName(a) || (s.lang === 'th' ? thArea(a) : (a.liveArea || meetName(a)))
  return (
    <>
      <div className="scroll" ref={sc}>
        <div className="dhero" ref={hero}>
          <img className="kb" src={ph(a.img)} alt="" />
          <span className="xg" />
        </div>
        <div className="dbody rise" style={{ paddingBottom: 148 }}>
          <div className="col" style={{ gap: 6 }}>
            <h1 className="d-h1">{aTitle(a)}</h1>
            <div className="d-sub">{area} · {t('hrs', { h: a.h })} · {langsOf(a)}</div>
          </div>
          <DetailHost a={a} time={tRange(a, bTime())} />
          <button
            type="button"
            id="ask-host"
            onClick={() => openChat(a.id, undefined, true)}
            style={{ alignSelf: 'flex-start', background: 'none', border: 0, padding: '2px 0', color: '#FFD067', fontSize: 15, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {t('askHostLink', { host: h })} →
          </button>
          <DietChip a={a} />
          <GroupHelp a={a} id="detail-group" />
          <span className="small" id="detail-kids" style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}><span style={{ flex: 'none', marginTop: 1 }}><Ic p={I.shield} s={14} /></span><span>{t('kidsRule')}</span></span>
          <div className="glass card col" style={{ gap: 8 }}><span className="eyebrow">{t('meetPoint')} · {t('near100')}</span><div className="row"><span style={{ color: 'var(--gold2)' }}><Ic p={I.pin} s={22} /></span><span className="col grow" style={{ gap: 2 }}><b>{meetName(a)}</b><span className="small">{meetAddress(a)}</span>{s.lang !== 'th' && <span className="small th" lang="th">{meetNameTh(a)}</span>}<a className="lnk small" href={meetMapsUrl(a)} target="_blank" rel="noopener noreferrer">{t('directions')}</a></span><span className="chip" style={{ height: 28, fontSize: 12 }}><Ic p={I.shield} s={13} />{t('pub')}</span></div></div>
          <ActFacts a={a} />
          <div className="glass card col small" id="detail-money" style={{ gap: 4 }}>
            {pv.kind === 'launch' && <span className="chip goldc" id="detail-launch" style={{ alignSelf: 'flex-start', height: 'auto', minHeight: 28, fontSize: 12.5, whiteSpace: 'normal', marginBottom: 4 }}>{t('launchCard')}</span>}
            <span>{money}</span>
            {a.partner ? <span>{t('partnerIncl', { fee: baht(a.partner) })}</span> : null}
            {!vol && foreignGuest() && <span id="detail-foreign-qr" style={{ color: 'var(--gold2)', marginTop: 4 }}>{t('payHostForeign', { host: h })}</span>}
          </div>
          {['river', 'temple', 'market', 'oldtown'].includes(a.id) && <div className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Ic p={I.shield} s={14} />{t('weatherNote')}</div>}
          <div className="tipc"><svg width="40" height="40" viewBox="0 0 64 64" style={{ flex: 'none', fill: 'rgba(255,208,103,.12)', stroke: 'var(--gold2)', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' }}><g className="wai"><path d="M26 54V30c0-6 3-14 6-20 3 6 6 14 6 20v24" /><path d="M24 54h16" /></g></svg><div className="col"><b style={{ color: 'var(--gold2)' }}>{t('thaiTip')}</b><span className="lead" style={{ fontSize: 14 }}>{t('tipBody')}</span></div></div>
        </div>
      </div>
      <div className="topb ftop" ref={ft}><button className="ib" data-go={back} data-how="l" aria-label="Back"><Ic p={I.back} /></button><div className="grow" /><button className="ib" data-heart={a.id} aria-label={t('saveAct', { a: aTitle(a) })} aria-pressed={!!s.saved[a.id]} style={s.saved[a.id] ? { color: 'var(--gold2)' } : undefined}><Ic p={I.heart} /></button></div>
      <div className="bbar glass">
        <div className="col" style={{ gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="price num">{vol ? t('volPrice') : baht(a.price)}</span>
            {!vol && fx(a.price) && <span className="num" style={{ fontSize: 13, fontWeight: 500, color: '#9AA0BF' }}>≈ {fx(a.price)}</span>}
          </div>
          <span style={{ fontSize: 12, color: '#9AA0BF', lineHeight: 1.35 }}>
            {vol ? t('volNothing', { host: h }) : t('paidToHostPlace', { n: maxPpl(a), host: h })}
            <br />
            {free ? (pv.kind === 'launch' ? t('launchFree') : t('passCovered')) : pv.kind === 'upgrade' ? t('passUpgThis', { amt: baht(ticket), tier: tierName(getRequiredTicketTier(hostTotal(a, 1)) as (typeof TIERS)[number]) }) : t('plusTicketNow', { amt: baht(ticket) })}
          </span>
        </div>
        <div className="grow" />
        <button type="button" id="bbar-chat" aria-label={t('askHostLink', { host: h })} onClick={() => openChat(a.id, undefined, true)} style={{ flex: 'none', width: 52, height: 52, borderRadius: 14, background: '#0F1226', color: '#EEF0FA', display: 'grid', placeItems: 'center' }}><Ic p={'<path d="M4 5h16v11H9l-5 4z"/>'} s={22} /></button>
        <button className="btn gold" data-go="book" data-how="b" style={{ width: 'auto', height: 52, padding: '0 22px', borderRadius: 14, fontSize: 16, fontWeight: 700 }}>{t('request')}</button>
      </div>
    </>
  )
}

/* ---- book ---- */
const ONE = '<circle cx="12" cy="8" r="4"/><path d="M5 21c1-4 4-6 7-6s6 2 7 6"/>'
const Approx = ({ n }: { n: number }) => (n > 0 && fx(n) ? <span className="small num" style={{ display: 'block', textAlign: 'right', whiteSpace: 'nowrap' }}>≈ {fx(n)}</span> : null)
const TIERS = ['ticket_standard', 'ticket_signature', 'ticket_premier'] as const
const tierName = (id: (typeof TIERS)[number]): string => t('tk_' + KR6_PRODUCTS[id].tier)
const tierBand = (id: (typeof TIERS)[number]): string => {
  const p = KR6_PRODUCTS[id]
  if (p.minActivityThb <= 0) return t('tierUpTo', { max: baht(p.maxActivityThb) })
  if (!Number.isFinite(p.maxActivityThb)) return t('tierAbove', { min: baht(p.minActivityThb - 1) })
  return t('tierRange', { min: baht(p.minActivityThb), max: baht(p.maxActivityThb) })
}

function Book() {
  const s = useS()
  const a = act(), h = hostName(a)
  // the same range as Trips > Change > another time (14 days)
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); d.setHours(12, 0, 0, 0); return d }), [])
  /** a start time that has already passed (only possible today) */
  const past = (i: number, x: string) => i === 0 && atTime(days[0], x).getTime() <= Date.now()
  // Open on the card's own time today if it is still ahead; otherwise the next slot still ahead today; otherwise tomorrow at the card's time.
  /** "Book another spot" from #held: same day and time, a second booking for more people of the same group */
  const [extra] = useState(() => { const x = extraSpot && extraSpot.act === S.act ? extraSpot : null; extraSpot = null; return x })
  const [sel, setSel] = useState(() => {
    // every booking starts at 1 person, except "book another spot" for the same group: it keeps the first spot's party size
    S.guests = extra ? Math.max(1, S.bookings.find((x) => x.ref === extra.ref)?.guests || 1) : 1
    if (extra) {
      const j = days.findIndex((d) => sameDay(d, extra.day))
      if (j >= 0 && !past(j, extra.time)) { S.time = extra.time; S.timeAct = S.act; S.dayDate = days[j]; return j }
    }
    const card = bTime()
    let i = 0
    if (past(0, card)) {
      const nx = SL(a).find((x) => !past(0, x))
      if (nx) { S.time = nx; S.timeAct = S.act } else i = 1
    }
    S.dayDate = days[i]
    return i
  })
  const time = bTime()
  const [face, setFace] = useState<0 | 1 | 2>(0)
  /** what the overlay says, fixed at the moment Pay is pressed (the booking itself changes the quote right after) */
  const [faceMsg, setFaceMsg] = useState<{ faceId: boolean; text: string }>({ faceId: false, text: '' })
  const [buy7DayPass, setBuy7DayPass] = useState(() => takePassIntent())
  /** the guest chose to add one more booking at a slot they already booked (for the rest of their group) */
  const [moreSpot, setMoreSpot] = useState(!!extra)
  const [curOpen, setCurOpen] = useState(false)
  /** the guest ticked "Yes, book both anyway" for an overlapping booking (asked again whenever the day or time changes) */
  const [both, setBoth] = useState(false)
  /** PromptPay QR step (the QR panel in preview; in a live build, the partner's QR comes on the next screen) */
  const [qr, setQr] = useState(false)
  const daysRef = useRef<HTMLDivElement>(null)
  /** set the moment Pay is pressed: the booking we just made must never count as "already booked" */
  const sent = useRef(false)
  const tm = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => tm.current.forEach(clearTimeout), [])
  const max = maxPpl(a)
  const guests = Math.min(max, Math.max(1, s.guests))
  const stickyRef = captureAndGetStickyRef()
  const refInfo = parseHostReferralLink(typeof window !== 'undefined' ? window.location.search : '')

  // The host price is fixed by the host and read-only here; the ticket tier follows from it.
  const vol = !!a.isVolunteer || a.price === 0
  const hostAmt = hostTotal(a, guests)
  const travellerCountry = homeCountry() || (s.lang === 'hi' ? 'IN' : 'US')
  // A pass counts only when it was really bought (in this app, or reported by the server in live mode).
  const pass = myPass()
  const passDays = pass.daysLeft
  const hasPass = pass.active
  const buyPass = buy7DayPass && !hasPass

  const quote = resolveBookingTicketQuote({
    activityPriceThb: hostAmt,
    isVolunteer: vol,
    buy7DayPass: buyPass,
    hasActive7DayPass: hasPass,
    travellerCountry,
    voucher: null,
    launchFree: launchFreeFor(a),
    hostRewardBalanceThb: a.hostRewardThb || 0,
  })
  const tier = quote.requiredTicketId
  const requiredSpec = KR6_PRODUCTS[tier]
  const waived = refInfo.isHostReferral
  const ticketNow = waived ? 0 : quote.kringChargeNowThb
  const paidKind: NonNullable<Booking['paid_kind']> = waived ? 'waived' : hasPass ? (quote.passUpgradeDiffThb > 0 ? 'upgrade' : 'covered') : buyPass ? 'pass' : quote.launchTicketApplied ? 'launch' : 'ticket'
  const ticketLabel =
    paidKind === 'waived' ? t('refWaived')
      : paidKind === 'covered' ? t('passCovered')
        : paidKind === 'upgrade' ? t('passUpg', { tier: tierName(tier), amt: baht(quote.passUpgradeDiffThb) })
          : paidKind === 'pass' ? (quote.passUpgradeDiffThb > 0 ? t('passPlusUpg', { price: baht(KR6_PRODUCTS.pass_7day.priceThb), tier: tierName(tier), amt: baht(quote.passUpgradeDiffThb) }) : t('passName') + ' · ' + baht(KR6_PRODUCTS.pass_7day.priceThb))
            : paidKind === 'launch' ? t('launchFree')
              : tierName(tier) + ' · ' + tierBand(tier)
  const per = a.priceFor === 'person' ? t('perPerson') : t('perGroup', { n: max })
  const timeOk = !past(sel, time)
  // My bookings already at this activity, day and slot (never the one we are making right now).
  const mine = sent.current ? [] : mineAt(a, days[sel], time)
  /** every spot of this slot is already mine: no further booking */
  const full = mine.length >= slotSpots(a)
  /** already booked here and not (yet) asked for another spot */
  const dup = mine.length > 0 && (!moreSpot || full)
  // Another open booking at an overlapping time (any activity, also ฿0 bookings with the pass); my own spots at this same slot don't count.
  const clash = sent.current || dup ? [] : overlaps(days[sel], time, a.h).filter((b) => !mine.includes(b) && !(b.act === a.id && b.time === time && sameDay(new Date(b.date), days[sel])))
  /** an overlap stops Pay until the guest changes the time or confirms both bookings once */
  const clashStop = clash.length > 0 && !both
  useEffect(() => { setBoth(false) }, [sel, time])
  // keep the chosen day in view in the scrolling day strip
  useEffect(() => { const el = daysRef.current?.querySelector<HTMLElement>('button[aria-pressed="true"]'); el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }) }, [sel])
  const pickDay = (i: number) => {
    S.dayDate = days[i]; setSel(i); tick(0.5, 0.08)
    if (past(i, time)) { const nx = SL(a).find((x) => !past(i, x)); if (nx) update((st) => { st.time = nx; st.timeAct = st.act }) }
  }
  const pays = payList()
  const pi = Math.min(s.pay, pays.length - 1)
  const method = pays[pi]

  // Face ID belongs to Apple Pay only; a card or QR payment just says it is confirming, a ฿0 booking just sends the request.
  const faceId = ticketNow > 0 && isApplePay(method)
  const faceText = ticketNow <= 0 ? t('reqSending') : faceId ? t('confirmFace') : t('payWorking', { m: method?.n || '' })
  const pay = async (qrDone = false) => {
    if (face || dup || !timeOk || clashStop || sent.current) return
    // PromptPay QR is a step of its own: never skip straight to "paid"
    if (!qrDone && ticketNow > 0 && isPromptPay(method)) { setQr(true); tick(0.6, 0.06); return }
    setQr(false)
    if (quote.launchTicketApplied && !waived) {
      const claimed = await api.claimLaunchTicket(a.liveArea || a.place || '').catch(() => false)
      if (!claimed) {
        update((st) => { st.prof.usedLaunchTicket = true })
        toast(t('launchUsed'))
        return
      }
    }
    sent.current = true
    setFaceMsg({ faceId, text: faceText })
    setFace(1)
    const day = days[sel]
    const startISO = atTime(day, time).toISOString()
    const payMethod = method?.n || 'card'
    let ref = newRef()
    while (S.bookings.some((b) => b.ref === ref)) ref = newRef()
    void api.requestBooking(a.id, startISO, guests, payMethod, 'local-' + Date.now()).catch(() => {})
    const firstRef = mine[0]?.ref
    update((st) => {
      st.req = null; st.met = false; st.gifts = []; st.cancelled = false; st.time = time; st.timeAct = st.act; st.guests = guests; st.dayDate = day
      // Local demo only: in live mode the pass comes from the server profile.
      if (buyPass && !live()) st.prof.passUntil = passUntilFrom()
      if (buyPass) { st.prof.passPaidAt = new Date().toISOString(); st.prof.passPaidThb = KR6_PRODUCTS.pass_7day.priceThb; st.prof.passPayN = payMethod; st.prof.passRef = ref }
      if (quote.launchTicketApplied && !waived) st.prof.usedLaunchTicket = true
      st.bookings.unshift({
        kind: 'act',
        act: a.id,
        date: new Date(day),
        time,
        guests,
        amt: ticketNow,
        host_amt: hostAmt,
        paid_kind: paidKind,
        ref,
        status: 'pending',
        pay: st.pay,
        ticket_tier: buyPass || hasPass ? 'pass_7day' : tier,
        ticket_status: 'active',
        made_at: new Date().toISOString(),
        ...(firstRef ? { extra_of: firstRef } : {}),
      })
    })
    if (stickyRef.refCode) {
      recordPartnerReconBooking({
        txId: stickyRef.txId || 'TT-' + Date.now().toString(36).toUpperCase(),
        bookingId: ref,
        partnerRef: stickyRef.refCode,
        activityTitle: aTitle(a),
        ticketTier: requiredSpec.nameEn,
        ticketPriceThb: ticketNow,
        affiliateRatePct: 15,
        affiliateCommissionThb: Number((ticketNow * 0.15).toFixed(2)),
        hostPayAtPlaceThb: quote.hostPayAtMeetupThb,
        status: 'confirmed',
        createdAt: new Date().toISOString(),
      })
    }
    tm.current.push(setTimeout(() => { setFace(2); tick(0.9, 0.15); buzz(20) }, 1100))
    tm.current.push(setTimeout(() => go('held', 'f'), 1750))
  }
  const payLabel = ticketNow <= 0 ? t('sendFree') : buyPass ? t('holdPass', { amt: baht(ticketNow) }) : t('hold', { amt: baht(ticketNow) })
  const singleAmt = !buyPass ? ticketNow : launchFreeFor(a) ? 0 : requiredSpec.priceThb
  // Before paying: when the host must answer, and what cancelling gives back before / after the host confirms.
  const replyAt = replyDeadline(atTime(days[sel], time), new Date())
  const refundPre = paidKind === 'pass' ? Math.max(0, ticketNow - KR6_PRODUCTS.pass_7day.priceThb) : paidKind === 'covered' || paidKind === 'launch' || paidKind === 'waived' ? 0 : ticketNow
  const passKept = paidKind === 'pass' || paidKind === 'covered' || paidKind === 'upgrade'
  const cxBefore = refundPre > 0 ? t('cxBefore', { host: h }) : paidKind === 'pass' ? t('cxBeforePass', { host: h }) : t('cxBefore0', { host: h })
  const cur = curCountry(), curSym = curSymbol()
  return (
    <>
      <div className="topb">
        <button className="ib" data-go="detail" data-how="l" aria-label="Close"><Ic p={I.close} /></button>
        <div className="col grow">
          <b>{aTitle(a)}</b>
          <span className="small">{t('with', { host: h })}</span>
        </div>
      </div>
      <div className="scroll"><div className="pad rise" style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 200 }}>
        {(vol || a.bringFriendFirst3) && <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {vol && <span className="pill gold" id="checkout-volunteer-badge">{t('volBadge')}</span>}
          {friendApplies(a) && <span className="small" id="checkout-first-timer-badge" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Ic p={I.users} s={14} />{t('friendNote')}</span>}
        </div>}

        <div className="col" style={{ gap: 10 }}><span className="eyebrow">{t('when')}</span>
          <b id="book-when" aria-live="polite" style={{ fontSize: 20, lineHeight: 1.25 }}>{dayFmt(days[sel], { weekday: 'long', day: 'numeric', month: 'long' })} · <span className="num">{tRange(a, time)}</span></b>
          <div className="days" ref={daysRef}><span className="ind" style={{ transform: `translateX(${sel * 100}%)` }} />{days.map((d, i) => {
            const none = SL(a).every((x) => past(i, x))
            return <button key={i} className={i === sel ? 'on' : ''} data-day={i} aria-pressed={i === sel} disabled={none} style={none ? { opacity: 0.35 } : undefined} onClick={() => pickDay(i)}>{i === 0 ? t('today') : dayFmt(d, { weekday: 'short' })}<b>{d.getDate()}</b></button>
          })}</div>
          <div className="chips">{SL(a).map((x) => {
            const gone = past(sel, x)
            return <button key={x} className={`chip num ${x === time ? 'on' : ''}`} data-t={x} aria-pressed={x === time} disabled={gone} style={{ fontSize: 13, ...(gone ? { opacity: 0.35 } : {}) }} onClick={() => { update((st) => { st.time = x; st.timeAct = st.act }); tick(0.6, 0.08) }}>{tRange(a, x)}</button>
          })}</div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', rowGap: 8 }}><div className="col grow" style={{ minWidth: 120 }}><span className="eyebrow">{t('people')}</span><span className="small">{t('maxN', { n: max })}</span></div>
          <div className="ppl" style={{ gridTemplateColumns: `repeat(${max}, 1fr)`, width: Math.min(300, 75 * max) }}><span className="ind" style={{ width: `calc((100% - 8px) / ${max})`, transform: `translateX(${(guests - 1) * 100}%)` }} />
            {Array.from({ length: max }, (_, k) => k + 1).map((n) => <button key={n} data-n={n} aria-pressed={guests === n} aria-label={pplN(n)} onClick={() => { update((st) => { st.guests = n }); tick(0.6, 0.07) }}><Ic p={n === 1 ? ONE : I.users} s={16} />{n}</button>)}</div></div>
        {moreSpot && mine.length > 0 && !full && <div className="glass card small" id="extra-spot-note" style={{ padding: '10px 14px', border: '1px solid rgba(255,208,103,.45)' }}>{t('extraSpotNote', { host: h, time: tRange(a, time), n: mine.length })}</div>}
        <GroupHelp a={a} id="book-group" />

        {/* Kring ticket or 7-Day Pass: one explicit choice, above the price box and far from the Pay bar */}
        {!waived && (hasPass
          ? <div className="col" id="pass-card" style={{ gap: 6 }}>
            <span className="chip goldc" id="pass-active" style={{ alignSelf: 'flex-start', height: 'auto', minHeight: 30, fontSize: 12.5, whiteSpace: 'normal' }}>{t('passActive', { n: passDays })}{pass.until ? ' · ' + t('passUntil', { d: dayFmt(pass.until, { weekday: 'short', day: 'numeric', month: 'short' }) }) : ''}</span>
          </div>
          : <div className="col" id="pass-card" style={{ gap: 8 }}>
            <span className="eyebrow" id="ticket-choice-h">{t('ticketChoice')}</span>
            <div className="col" role="radiogroup" aria-labelledby="ticket-choice-h" style={{ gap: 8 }}>
              <button type="button" role="radio" aria-checked={!buyPass} className={`pm ${!buyPass ? 'on' : ''}`} id="ticket-single" onClick={() => { setBuy7DayPass(false); tick(0.6, 0.05) }}>
                <span className="rad" /><span className="col grow" style={{ gap: 2, minWidth: 0 }}><b>{t('singleTicket')}</b><span className="small">{launchFreeFor(a) ? t('launchFree') : tierName(tier)}</span></span><span className="num" style={{ flex: 'none' }}>{baht(singleAmt)}</span>
              </button>
              <button type="button" role="radio" aria-checked={buyPass} className={`pm ${buyPass ? 'on' : ''}`} id="pass-7day-toggle" onClick={() => { setBuy7DayPass(true); tick(0.6, 0.05) }}>
                <span className="rad" /><span className="col grow" style={{ gap: 2, minWidth: 0 }}><b>{t('passName')} · <span className="num">{baht(KR6_PRODUCTS.pass_7day.priceThb)}</span></b>{requiredSpec.passUpgradeThb > 0 && <span className="small" id="pass-upg-line" style={{ color: 'var(--gold2)' }}>{t('passUpgThis', { amt: baht(requiredSpec.passUpgradeThb), tier: tierName(tier) })}</span>}<span className="small">{t('passWhat')}</span></span><span className="col" style={{ flex: 'none', alignItems: 'flex-end', gap: 0 }}><span className="num">{baht(KR6_PRODUCTS.pass_7day.priceThb)}</span>{requiredSpec.passUpgradeThb > 0 && <span className="small num" style={{ whiteSpace: 'nowrap' }}>+ {baht(requiredSpec.passUpgradeThb)}</span>}</span>
              </button>
            </div>
          </div>)}

        {/* What you pay: Kring ticket today / host at the place / what that covers */}
        <div className="glass card col" id="checkout-summary-card" style={{ gap: 0 }}>
          <div className="line" id="line-ticket">
            <span className="col" style={{ gap: 1, minWidth: 0 }}><b style={{ color: '#fff' }}>{t('bkTicketToday')}</b><span className="small">{ticketLabel}</span></span>
            <span className="col" style={{ gap: 0, flex: 'none' }}><span className="num" id="checkout-ticket-now-amt" style={{ color: 'var(--gold2)', textAlign: 'right' }}>{baht(ticketNow)}</span><Approx n={ticketNow} /></span>
          </div>
          <div className="line" id="line-host">
            <span className="col" style={{ gap: 1, minWidth: 0 }}><b style={{ color: '#fff' }}>{t('bkHostAtPlace', { host: h })}</b><span className="small">{vol ? t('volNothing', { host: h }) : t('bkQrCash') + ' · ' + per}</span></span>
            <span className="col" style={{ gap: 0, flex: 'none' }}><span className="num" id="checkout-host-at-checkin-amt" style={{ textAlign: 'right' }}>{baht(hostAmt)}</span><Approx n={hostAmt} /></span>
          </div>
          <div className="hr" />
          <span className="small" id="line-covers" style={{ paddingTop: 6 }}><b style={{ color: '#fff' }}>{t('bkCovers')}</b> {t('bkCoversT')} {vol ? '' : t('bkCoversH', { host: h })}{a.partner ? ' ' + t('partnerIncl', { fee: baht(a.partner) }) : ''}</span>
          {quote.hostRewardAppliedThb > 0 && !waived && <span className="small" id="checkout-host-reward-swap" style={{ paddingTop: 6 }}>{t('rewardSwap', { ticket: baht(ticketNow), amt: baht(quote.hostRewardAppliedThb), host: h, price: baht(quote.hostPayAtMeetupThb) })}</span>}
        </div>
        <span className="small" id="pay-story" style={{ fontSize: 13 }}>{vol ? t('payStoryVol', { ticket: baht(ticketNow), host: h }) : t('payStory', { ticket: baht(ticketNow), host: h, price: baht(hostAmt) })}</span>
        {!vol && foreignGuest() && <span className="small" id="book-foreign-qr" style={{ fontSize: 13, color: 'var(--gold2)' }}>{t('payHostForeign', { host: h })}</span>}
        {s.lang !== 'th' && <div className="col small" id="cur-pick" style={{ gap: 8 }}>
          {!cur || curOpen
            ? <><span>{t('curAsk')}</span>
              <div className="chips" role="group" aria-label={t('curAsk')} style={{ flexWrap: 'wrap' }}>{CUR_CHOICES.map(([c, sym]) => { const on = cur === c || (!CUR_CHOICES.some(([x]) => x === cur) && sym === curSym); return <button key={c} type="button" className={`chip num ${on ? 'on' : ''}`} aria-pressed={on} data-cur={c} style={{ height: 34, fontSize: 13 }} onClick={() => { update((st) => { st.prof.cur = c }); setCurOpen(false); tick(0.6, 0.05) }}>{sym}</button> })}
                <button type="button" className={`chip ${cur === 'TH' ? 'on' : ''}`} aria-pressed={cur === 'TH'} data-cur="TH" style={{ height: 34, fontSize: 13 }} onClick={() => { update((st) => { st.prof.cur = 'TH' }); setCurOpen(false); tick(0.6, 0.05) }}>{t('curNone')}</button></div></>
            : <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="grow">{curSym ? t('curShown', { c: curSym }) : t('curNone')}</span><button type="button" className="chip" id="cur-change" style={{ height: 30, fontSize: 12 }} onClick={() => setCurOpen(true)}>{t('edit')}</button></span>}
        </div>}
        {!waived && <details id="tier-how"><summary className="small" style={{ cursor: 'pointer' }}>{t('tierHow')}</summary>
          <div className="col" style={{ gap: 4, marginTop: 8 }}>{TIERS.map((tid) => (
            <div key={tid} data-tier-row={tid} className="line" style={{ padding: '4px 0', fontWeight: tid === tier ? 700 : 400 }}><span>{tierName(tid)} · <span className="small">{tierBand(tid)}</span></span><span className="num">{baht(KR6_PRODUCTS[tid].priceThb)}</span></div>
          ))}<span className="small">{t('tierNote')}</span></div>
        </details>}

        {s.diet.length > 0 && <div className="row small" id="book-diet" style={{ gap: 8 }}>{dietMiss(a, s.diet).length ? <b aria-hidden="true" style={{ color: 'var(--gold2)', flex: 'none', width: 16, textAlign: 'center' }}>!</b> : <span className="ok"><Ic p={I.check} s={16} sw={3} /></span>}<span className="grow">{t('yourDiet', { d: s.diet.map(dietWord).join(', ') })}{dietMiss(a, s.diet).length ? <><br /><span data-diet-ask style={{ color: 'var(--gold2)' }}>{t('dietAskHost', { host: h, d: dietMiss(a, s.diet).map(dietWord).join(', ') })}</span></> : null}</span><button className="chip" style={{ height: 30, fontSize: 12 }} data-go="signup" data-how="b">{t('edit')}</button></div>}
        <button className="more" data-go="experiences" data-how="f"><Ic p={I.search} s={18} /><span className="grow">{t('moreOpts')}</span><Ic p={I.chev} s={16} /></button>
        {ticketNow > 0 && <div className="col" style={{ gap: 8 }}><span className="eyebrow">{t('payWith')}</span>{pays.map((p, i) => (
          <button key={p.n} className={`pm ${i === pi ? 'on' : ''}`} data-pi={i} aria-pressed={i === pi} onClick={() => { update((st) => { st.pay = i }); tick(0.5, 0.08) }}><span className="rad" /><span className="col grow" style={{ gap: 1 }}><b>{p.n}</b><span className="small">{p.s}</span></span>{i === 0 && <span className="chip goldc" style={{ height: 24, fontSize: 11, padding: '0 9px' }}>{t('popular')}</span>}</button>))}<span className="small" id="pay-no-cn">{t('payNoCnYet')}</span></div>}
        <div className="small ok" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Ic p={I.check} s={14} />{t('hostCant', { host: h })}</div>
        <div className="cterms col" id="book-terms" style={{ gap: 6 }}>
          <span id="book-reply-by"><b style={{ color: '#fff' }}>{replyLine(h, replyAt, refundPre, passKept ? t('passStays') : '')}</b></span>
          <span id="book-cx-before">{cxBefore}</span>
          {refundPre > 0 && <span><b style={{ color: '#fff' }}>{t('rulesTitle')}</b> · {t('cxAfter', { host: h })} {t('cancelNote')}</span>}
        </div>
      </div></div>
      <div className="footer">
        {dup && <div className="glass card col small" id="dup-slot" role="alert" style={{ gap: 8, padding: '10px 14px', border: '1px solid rgba(255,208,103,.45)' }}><span>{full ? t('slotFull') : t('dupSlotMore')}</span>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>{!full && <button className="chip goldc" id="more-spot" style={{ height: 32, fontSize: 12.5 }} onClick={() => { setMoreSpot(true); tick(0.7, 0.06) }}>{t('anotherSpot')}</button>}<button className="chip" style={{ height: 32, fontSize: 12 }} data-go="trips" data-how="r">{t('t_trips')}</button></div></div>}
        {clash.length > 0 && <div className="glass card col small" id="overlap-warn" role="status" style={{ gap: 8, padding: '10px 14px', border: '1px solid rgba(255,208,103,.45)' }}>
          <span style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}><span className="grow" style={{ minWidth: 0, flex: '1 1 160px' }}>{t('overlapWarn', { title: bkTitle(clash[0]), time: clash[0].time ? dayFmt(clash[0].date, { weekday: 'short', day: 'numeric' }) + ' ' + clash[0].time : '' })}</span><button className="chip" style={{ height: 30, fontSize: 12 }} data-go="trips" data-how="r">{t('t_trips')}</button></span>
          <label id="overlap-both" style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontWeight: 700, color: '#fff' }}><input type="checkbox" checked={both} onChange={(e) => { setBoth(e.target.checked); tick(0.6, 0.05) }} style={{ width: 20, height: 20, flex: 'none', accentColor: 'var(--gold2)' }} /><span>{t('overlapBoth')}</span></label>
        </div>}
        <button className="btn gold" id="pay" disabled={dup || !timeOk || clashStop} onClick={() => { void pay() }}>{payLabel}</button>
      </div>
      <div className="face" hidden={!face}><div className="fbox glass" role="status" aria-live="assertive">{faceMsg.faceId
        ? <div className={`fid ${face === 2 ? 'ok' : ''}`}>
          <svg viewBox="0 0 86 86" width="86" height="86" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M4 22V12a8 8 0 0 1 8-8h10M64 4h10a8 8 0 0 1 8 8v10M82 64v10a8 8 0 0 1-8 8H64M22 82H12a8 8 0 0 1-8-8V64" />
            <g>{face === 2 ? <path d="M26 44l12 12 22-24" stroke="#4CD39A" strokeWidth="5" /> : <path d="M30 32v6M56 32v6M43 34v14h-4M33 60c6 5 14 5 20 0" />}</g></svg>
          <span className="scan" /></div>
        : face === 2 ? <span className="ok" aria-hidden="true"><Ic p={I.check} s={56} sw={3} /></span> : <span className="spin" aria-hidden="true" style={{ width: 48, height: 48 }} />}
        <span>{face === 2 ? t('heldTitle') : faceMsg.text}</span></div></div>
      <Sheet open={qr} onClose={() => setQr(false)} label={t('qrTitle', { amt: baht(ticketNow) })}>
        <b style={{ fontSize: 18 }} id="qr-title">{t('qrTitle', { amt: baht(ticketNow) })}</b>
        {live()
          ? <span className="small" id="qr-live">{t('qrLive', { amt: baht(ticketNow) })}</span>
          : <div className="col" id="qr-preview" style={{ gap: 8, alignItems: 'center', textAlign: 'center' }}>
            <SampleQr />
            <b>{t('qrScan')}</b>
            <span className="small">{t('qrPreview')}</span>
          </div>}
        <button className="btn gold" id="qr-go" onClick={() => { void pay(true) }}>{live() ? t('cont') : t('qrPreviewGo')}</button>
        <button className="btn ghost" id="qr-other" onClick={() => setQr(false)}>{t('qrOther')}</button>
      </Sheet>
    </>
  )
}

/** A placeholder QR for the preview build: clearly marked as a sample, it encodes nothing and can't be paid. */
function SampleQr() {
  const n = 21
  const finder = (x: number, y: number) => [[0, 0], [n - 7, 0], [0, n - 7]].some(([fx0, fy0]) => {
    const dx = x - fx0, dy = y - fy0
    if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return false
    return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
  })
  const inFinder = (x: number, y: number) => [[0, 0], [n - 8, 0], [0, n - 8]].some(([fx0, fy0]) => x >= fx0 && x < fx0 + 8 && y >= fy0 && y < fy0 + 8)
  const cells: JSX.Element[] = []
  let h = 0x2f6e2b1
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0
    const on = inFinder(x, y) ? finder(x, y) : (h & 3) === 0 || (h & 7) === 5
    if (on) cells.push(<rect key={x + '-' + y} x={x} y={y} width={1} height={1} />)
  }
  return (
    <div className="sqr" style={{ position: 'relative', width: 176, height: 176, padding: 12, borderRadius: 16, background: '#fff', border: '2px dashed var(--gold2)' }} aria-hidden="true">
      <svg viewBox={`0 0 ${n} ${n}`} width="100%" height="100%" shapeRendering="crispEdges" style={{ fill: '#9aa0bf', display: 'block' }}>{cells}</svg>
      <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%) rotate(-12deg)', background: 'var(--gold2)', color: '#1A1203', fontWeight: 800, fontSize: 13, padding: '3px 10px', borderRadius: 8, letterSpacing: 1 }}>QR</span>
    </div>
  )
}

/* ---- held ---- */
function Held() {
  const s = useS()
  const a = act(), h = hostName(a)
  // the newest open booking of this activity (a second spot for the same group is newer than the first)
  const bk = s.bookings.find((x) => x.kind === 'act' && x.act === a.id && x.status !== 'cancelled' && !x.done)
  const d = bk?.date || s.dayDate || new Date()
  const when = bk?.time || bTime()
  // One status: the booking's own status (the host's answer sets it to confirmed).
  const acc = bk ? bk.status === 'confirmed' : s.req === 'acc'
  const [tin, setTin] = useState(false)
  const [ask, setAsk] = useState(false)
  useEffect(() => {
    if (!acc) return
    const tm = [setTimeout(() => { setTin(true); bell(0.25, 1760) }, 500), setTimeout(() => setTin(false), 4200)]
    return () => tm.forEach(clearTimeout)
  }, [])
  // a request the host does not answer in time is cancelled by itself, with the ticket back
  useEffect(() => { expireUnanswered(); const iv = setInterval(() => expireUnanswered(), 30000); return () => clearInterval(iv) }, [])
  // a request the host has not confirmed yet: the whole refundable ticket comes back
  const back = bk ? refundable(bk) : 0
  const why = bk ? noRefundWhy(bk) : ''
  const by = bk ? replyBy(bk) : null
  const cancel = () => {
    void api.cancel(a.id, 'other').catch(() => {})
    if (bk) cancelBooking(bk, back)
    setAsk(false)
    S.cancelled = true; toast(back > 0 ? t('reqCancelled', { amt: baht(back) }) : t('cancelled0'), back > 0 ? 'ok' : 'info'); bell(0.2, 1319); go('trips', 'f')
  }
  const cal = () => {
    if (!bk) return
    const ok = downloadIcs(bk, meetName(a, bk) + ', ' + meetAddress(a, bk), placeLine(bk, h) + (bk.ref ? ' · ' + t('bkRef', { ref: bk.ref }) : '') + ' · ' + t('s2'))
    toast(ok ? t('addedCal') : t('calFail'), ok ? 'info' : 'err'); tick(0.7, 0.06)
  }
  // one more booking at this same slot, for the rest of a bigger group (only while a spot is free and the slot is ahead)
  const more = !!bk && mineAt(a, d, when).length < slotSpots(a) && atTime(new Date(d), when).getTime() > Date.now()
  const moreSpot = () => { if (!bk) return; extraSpot = { ref: bk.ref || '', day: new Date(d), time: when, act: a.id }; go('book', 'r') }
  return (
    <>
      <div className="topb"><div className="grow" /><button className="ib" data-go="experiences" data-how="f" aria-label="Close"><Ic p={I.close} /></button></div>
      <div className="scroll"><div style={{ paddingBottom: 24 }}>
        <div className="heldv"><svg viewBox="0 0 390 250" width="100%" height="250" aria-hidden="true">
          <circle cx="70" cy="125" r="48" fill="none" stroke="#7381FF" strokeWidth="9" style={{ filter: 'drop-shadow(0 0 10px #3446FF)' }} /><circle cx="320" cy="125" r="48" fill="none" stroke="#FFB21E" strokeWidth="9" style={{ filter: 'drop-shadow(0 0 10px #FFB21E)' }} />
          <path className="dash" d="M122 125H150" stroke="#7381FF" strokeWidth="2.5" /><path className="dash" d="M240 125H268" stroke="#FFB21E" strokeWidth="2.5" />
          <text x="70" y="196" textAnchor="middle" fill="#9AA0BF" fontSize="13" fontWeight="700">{t('you')}</text><text x="320" y="196" textAnchor="middle" fill="#9AA0BF" fontSize="13" fontWeight="700">{h}</text></svg>
          {/* the meeting place between you and the host (no coin: Kring never holds the activity money) */}
          <div className="capsule glass" aria-hidden="true" style={{ color: 'var(--gold2)' }}><Ic p={I.pin} s={34} /></div></div>
        <div className="pad rise col" style={{ gap: 10, textAlign: 'center', alignItems: 'center' }}>
          <h1 className="h1">{acc ? t('stConfirmed', { host: h }) : t('heldTitle')}</h1>
          {!acc && by && <p className="lead" id="held-reply-by">{replyLine(h, by, back, why)}</p>}
          {!acc && bk && <button className="lnk small" id="creq" style={{ background: 'none', border: 0, color: 'var(--ink2)', textDecoration: 'underline', padding: '8px 8px', width: 'auto', maxWidth: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere', textAlign: 'center', justifyContent: 'center' }} onClick={() => { setAsk(true); tick(0.6, 0.06) }}>{back > 0 ? t('cancelReq', { amt: baht(back) }) : t('cancelReq0')}</button>}
          <div className="glass card col" style={{ width: '100%', textAlign: 'left', gap: 8 }}>
            <div className="row"><img src={ph(a.img)} alt="" style={{ width: 58, height: 58, borderRadius: 16, objectFit: 'cover', flex: 'none' }} />
              <div className="col"><b>{aTitle(a)}</b><span className="small" data-k="when">{dayFmt(d, { weekday: 'long', day: 'numeric', month: 'short' })} · {tRange(a, when)} · {pplN(bk?.guests || s.guests)}</span><span className="small">{meetName(a, bk)} · {meetAddress(a, bk)}</span><a className="lnk small" href={meetMapsUrl(a, bk)} target="_blank" rel="noopener noreferrer">{t('directions')}</a></div></div>
            {bk && <div className="col small" id="held-money" style={{ gap: 2 }}><span>{kringLine(bk)}</span><span>{placeLine(bk, h)}</span>{bk.ref && <span style={{ opacity: 0.75 }}>{t('bkRef', { ref: bk.ref })}</span>}</div>}
          </div>
          <span className={`chip ${acc ? 'goldc' : ''}`} role="status" style={{ height: 'auto', minHeight: 30, fontSize: 12.5, whiteSpace: 'normal' }}>{acc ? <><Ic p={I.check} s={14} sw={3} />{t('stConfirmed', { host: h })}</> : <><span className="live" />{t('waitHost', { host: h })}</>}</span>
          {more && <div className="col small" id="held-more" style={{ gap: 6, alignItems: 'center', marginTop: 6 }}><span>{t('moreSpotQ')}</span><button className="chip" id="held-more-btn" style={{ height: 'auto', minHeight: 34, whiteSpace: 'normal' }} onClick={moreSpot}>{t('anotherSpot')}</button></div>}
        </div>
      </div></div>
      <div className="footer dock"><button className="btn gold" id="held-chat" onClick={() => openChat(a.id, bk?.ref)}>{t('msgHost', { host: h })}</button>
        {bk && <button className="btn ghost" id="held-cal" onClick={cal}>{t('addCal')}</button>}</div>
      <Sheet open={ask} onClose={() => setAsk(false)} label={back > 0 ? t('cxAsk', { amt: baht(back) }) : t('cxAsk0')}>
        <b style={{ fontSize: 18 }} id="cx-ask">{back > 0 ? t('cxAsk', { amt: baht(back) }) : t('cxAsk0')}</b>
        {bk && <span className="small">{aTitle(a)} · {dayFmt(d, { weekday: 'short', day: 'numeric', month: 'short' })} · {when}</span>}
        <span className="small">{back > 0 ? t('refundTicketOnly', { host: h }) + (bk && bk.paid_kind === 'pass' ? ' ' + t('passStays') : '') : why + ' ' + t('noHostPaid', { host: h })}</span>
        <button className="btn ghost" id="cx-sure" style={{ borderColor: '#FF7A7A', color: '#FFB3B3' }} onClick={cancel}>{back > 0 ? t('cxSure', { amt: baht(back) }) : t('cxSure0')}</button>
        <button className="btn gold" id="cx-keep" onClick={() => setAsk(false)}>{t('cxKeep')}</button>
      </Sheet>
      {acc && <div className={`toast glass ${tin ? 'in' : ''}`} aria-hidden="true"><Av ch={ini(h)} s={36} /><b className="grow">{t('accepted', { host: h })}</b><span className="ok"><Ic p={I.check} s={20} sw={3} /></span></div>}
    </>
  )
}

/* ---- 7-Day Pass on its own (from Me and Deals, before choosing an activity) ---- */
/** A row that opens the 7-Day Pass page (used on Me and Deals). */
export function PassEntry({ id }: { id: string }) {
  useS()
  const p = myPass()
  return (
    <button className="mrow glass" id={id} data-go="pass" data-how="r" style={{ borderRadius: 16, padding: '12px 14px', border: '1px solid rgba(255,208,103,.35)' }}>
      <span style={{ color: 'var(--gold2)', flex: 'none' }}><Ic p={I.ticket} s={20} /></span>
      <span className="col grow" style={{ gap: 1, textAlign: 'left' }}><b>{t('passName')}{p.active ? '' : ' · ' + baht(KR6_PRODUCTS.pass_7day.priceThb)}</b><span className="small">{p.active && p.until ? t('passUntil', { d: dayFmt(p.until, { weekday: 'short', day: 'numeric', month: 'short' }) }) : t('passEntrySub')}</span></span>
      <Ic p={I.chev} s={16} />
    </button>
  )
}

function PassScr() {
  const s = useS()
  const p = myPass()
  const price = KR6_PRODUCTS.pass_7day.priceThb
  const pays = payList()
  const pi = Math.min(s.pay, pays.length - 1)
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState(false)
  const tm = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(tm.current), [])
  const back = s.from.pass && s.from.pass !== 'pass' && s.from.pass !== 'signup' ? s.from.pass : 'me'
  const endsAt = new Date(passUntilFrom())
  const fmt = (d: Date) => dayFmt(d, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const buy = (qrDone = false) => {
    if (busy || p.active) return
    if (needAccount('pass', 'r')) return
    // PromptPay QR is a step of its own, the same as on Book & pay: never skip straight to "paid"
    if (!qrDone && isPromptPay(pays[pi])) { setQr(true); tick(0.6, 0.06); return }
    setQr(false)
    setBusy(true)
    tm.current = setTimeout(() => {
      let ref = newRef()
      while (S.bookings.some((b) => b.ref === ref) || S.prof.passRef === ref) ref = newRef()
      update((st) => {
        st.prof.passUntil = passUntilFrom()
        st.prof.passPaidAt = new Date().toISOString(); st.prof.passPaidThb = price; st.prof.passPayN = pays[pi]?.n || ''; st.prof.passRef = ref
      })
      setBusy(false); tick(0.9, 0.15); buzz(20)
      const u = myPass().until
      toast(t('passBought', { d: u ? fmt(u) : '' }))
    }, 1100)
  }
  return (
    <>
      <div className="topb"><button className="ib" data-go={back} data-how="l" aria-label="Back"><Ic p={I.back} /></button><h1 className="h2 grow">{t('passName')}</h1></div>
      <div className="scroll"><div className="pad col rise" style={{ gap: 16, paddingBottom: 200 }}>
        <div className="glass card col" id="pass-scr-card" style={{ gap: 8, border: '1px solid rgba(255,208,103,.35)' }}>
          <span className="row" style={{ alignItems: 'baseline' }}><b className="grow" style={{ fontSize: 20 }}>{t('passName')}</b><span className="col" style={{ alignItems: 'flex-end', gap: 0 }}><span className="num" style={{ fontSize: 22, color: 'var(--gold2)' }}>{baht(price)}</span>{fx(price) && <span className="small num">≈ {fx(price)}</span>}</span></span>
          <span className="small">{t('passWhat')}</span>
          {p.active && p.until
            ? <span className="chip goldc" id="pass-scr-active" style={{ alignSelf: 'flex-start', height: 'auto', minHeight: 30, whiteSpace: 'normal' }}>{t('passActive', { n: p.daysLeft })} · {t('passUntil', { d: fmt(p.until) })}</span>
            : <span className="small" id="pass-scr-ends"><b style={{ color: '#fff' }}>{t('passStartsNow', { d: fmt(endsAt) })}</b></span>}
        </div>
        <span className="small">{t('passRefundRule')}</span>
        {!p.active && !live() && <div className="col" style={{ gap: 8 }}><span className="eyebrow">{t('payWith')}</span>{pays.map((m, i) => (
          <button key={m.n} className={`pm ${i === pi ? 'on' : ''}`} data-pi={i} aria-pressed={i === pi} onClick={() => { update((st) => { st.pay = i }); tick(0.5, 0.08) }}><span className="rad" /><span className="col grow" style={{ gap: 1 }}><b>{m.n}</b><span className="small">{m.s}</span></span></button>))}<span className="small" id="pass-no-cn">{t('payNoCnYet')}</span></div>}
        {!p.active && live() && <span className="small" id="pass-scr-live">{t('passLiveNote')}</span>}
        {p.active && <button className="more" data-go="trips" data-how="r"><Ic p={I.ticket} s={18} /><span className="grow">{t('t_trips')} · {t('receipt')}</span><Ic p={I.chev} s={16} /></button>}
      </div></div>
      <div className="footer">
        {p.active || live()
          ? <button className="btn gold" data-go="experiences" data-how="f">{t('seeAll')}</button>
          : <button className="btn gold" id="pass-buy" disabled={busy} onClick={() => buy()}>{busy ? t('payWorking', { m: pays[pi]?.n || '' }) : t('holdPass', { amt: baht(price) })}</button>}
      </div>
      <Sheet open={qr} onClose={() => setQr(false)} label={t('qrTitle', { amt: baht(price) })}>
        <b style={{ fontSize: 18 }} id="qr-title">{t('qrTitle', { amt: baht(price) })}</b>
        <div className="col" id="qr-preview" style={{ gap: 8, alignItems: 'center', textAlign: 'center' }}>
          <SampleQr />
          <b>{t('qrScan')}</b>
          <span className="small">{t('qrPreview')}</span>
        </div>
        <button className="btn gold" id="qr-go" onClick={() => buy(true)}>{t('qrPreviewGo')}</button>
        <button className="btn ghost" id="qr-other" onClick={() => setQr(false)}>{t('qrOther')}</button>
      </Sheet>
    </>
  )
}

/* ---- partner-recon (TAGTHAi / Affiliate Read-Only Reconciliation Dashboard) ---- */
function PartnerRecon() {
  useS()
  const sticky = captureAndGetStickyRef()
  const partnerSlug = sticky.refCode && !sticky.isHostReferral ? sticky.refCode : 'tagthai'
  const rows = getPartnerReconRows(partnerSlug)
  const totalTicketsThb = rows.reduce((sum, r) => sum + r.ticketPriceThb, 0)
  const totalCommissionThb = rows.reduce((sum, r) => sum + r.affiliateCommissionThb, 0)

  return (
    <>
      <div className="topb">
        <button className="ib" data-go="welcome" data-how="l" aria-label="Back">
          <Ic p={I.back} />
        </button>
        <div className="col grow">
          <b id="partner-recon-title">Partner Reconciliation · {partnerSlug.toUpperCase()}</b>
          <span className="small">Sticky Transaction IDs · 15% of Kring Booking Ticket</span>
        </div>
        <span className="pill gold num" id="partner-recon-live-badge">
          Live Read-Only
        </span>
      </div>
      <div className="scroll pad col" style={{ gap: 14, paddingBottom: 80 }}>
        <div className="glass card col" id="partner-recon-summary" style={{ gap: 8, padding: 16 }}>
          <span className="eyebrow">Affiliate Model Summary (Zero Host Money Held by Kring)</span>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div className="col">
              <span className="small">Tracked Bookings</span>
              <b className="num" style={{ fontSize: 20 }} id="partner-recon-count">{rows.length}</b>
            </div>
            <div className="col">
              <span className="small">Kring Tickets Sold (฿199/฿299/฿499)</span>
              <b className="num" style={{ fontSize: 20 }}>฿{totalTicketsThb.toLocaleString()}</b>
            </div>
            <div className="col">
              <span className="small">Partner 15% Commission</span>
              <b className="num" style={{ fontSize: 20, color: 'var(--gold2)' }} id="partner-recon-commission">
                ฿{totalCommissionThb.toFixed(2)}
              </b>
            </div>
          </div>
          <span className="small" style={{ opacity: 0.85 }}>
            Referral link format: <code>https://kringapp.com/app/?ref=tagthai&amp;tx_id=&lt;TAGTHAI_TX_ID&gt;</code>. Guests pay Kring only for the booking ticket (฿199 / ฿299 / ฿499) and pay the host&apos;s activity fee directly at the public meeting place.
          </span>
        </div>

        <div className="col" style={{ gap: 10 }} id="partner-recon-list">
          {rows.map((r) => (
            <div key={r.txId + r.bookingId} className="glass card col" data-tx-id={r.txId} style={{ gap: 6, padding: 14 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <b className="num" style={{ color: 'var(--gold2)', fontSize: 13.5 }}>
                  TX: {r.txId} · {r.bookingId}
                </b>
                <span className="pill gold" style={{ fontSize: 11 }}>
                  {r.status.toUpperCase()}
                </span>
              </div>
              <b style={{ fontSize: 14 }}>{r.activityTitle}</b>
              <div className="row small num" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <span>{r.ticketTier}: ฿{r.ticketPriceThb}</span>
                <span style={{ color: '#4CD39A', fontWeight: 700 }}>
                  15% Affiliate Fee: ฿{r.affiliateCommissionThb.toFixed(2)}
                </span>
                <span>Host fee paid at place: ฿{r.hostPayAtPlaceThb}</span>
              </div>
              <span className="small" style={{ fontSize: 11, opacity: 0.7 }}>
                Recorded: {new Date(r.createdAt).toUTCString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

register(
  { id: 'detail', flow: 't', title: 'Activity', C: Detail },
  { id: 'book', flow: 't', title: 'Book & pay', C: Book },
  { id: 'held', flow: 't', title: 'Request sent', tk: 'heldTitle', C: Held },
  { id: 'pass', flow: 't', title: '7-Day Pass', C: PassScr },
  { id: 'partner-recon', flow: 't', title: 'Partner Reconciliation', C: PartnerRecon },
)
