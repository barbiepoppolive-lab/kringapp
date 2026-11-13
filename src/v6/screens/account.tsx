/* Me · Trips & receipts · Safety. Ported from the approved prototype (reference/prototype/app.js). */
import { meetName, meetAddress } from '../core/places'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { payee, tourMeet, tourBy, tourInfo } from '../core/tourInfo'
import { S, update, useS, type Booking } from '../core/store'
import { t, me, ini, act, ACTS, VOUCH, aTitle, hostName, baht, fx, ph, dayFmt, myBk, bkTitle, bkHost, caseNo, bkMoney, kringLine, placeLine, tRange, pplN, byStart, myPass, refundable, cancelBooking, hostPaid, SL, atTime, sameDay, overlaps, newRef, replyBy, replyLine, expireUnanswered, noRefundWhy, downloadIcs, payList, endT, type Act } from '../core/data'
import { KR6_PRODUCTS, launchTicketComesBack } from '../core/ticketsAndRails'
import { PassEntry } from './booking'
import { register, go, toast } from '../core/router'
import { api } from '../core/api'
import { dayOf, activityEnded, rpcBookingId } from '../core/dayof'
import { TripShareButton } from './meet'
import { bell, tick, buzz, chime } from '../core/sound'
import { I, Ic, Av, Rings, Tabs, Sheet } from '../ui/kit'

/* ---------- me ---------- */
function Me() {
  const s = useS()
  // never a demo name ("Emma", "Arjun", "Аня"): the name the person typed at sign-up, or "Guest" before sign-up
  const name = s.prof.name || t('guestW')
  const hasName = !!s.prof.name
  const grid: [string, string, string][] = [['trips', I.ticket, 't_trips'], ['saved', I.heart, 'saved'], ['', I.invite, 'invite'], ['safety', I.shield, 'safety']]
  return (
    <>
      <div className="topb" style={{ paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}><h1 className="h2" style={{ margin: 0 }}>{t('t_me')}</h1><div className="grow" /></div>
      <div className="scroll"><div className="pad col rise" style={{ gap: 14, paddingTop: 14, paddingBottom: 110 }}>
        <button className="mrow" style={{ background: 'none', border: 0, padding: 0 }} id="prof" data-go={hasName || (s.signedIn && s.prof.termsAt) ? 'profile' : 'signup'} data-how="r">
          <Av ch={hasName ? ini(name) : '?'} s={58} /><span className="col grow"><b style={{ fontSize: 20 }}>{name}</b><span className="small">{hasName ? t('editProfile') : s.signedIn && s.prof.termsAt ? t('addName') : t('signUpCta')}</span></span><Ic p={I.chev} s={18} />
        </button>
        <button className="hostcard" data-go="hverify"><span className="sheen" /><span style={{ flex: 'none' }}><Rings w={46} /></span>
          <span className="col grow"><b style={{ fontSize: 17 }}>{t('hostMode')}</b><span className="small" style={{ color: 'var(--ink2)' }}>{t('hostModeSub')}</span></span>
          <span className="sw" style={{ pointerEvents: 'none' }} aria-hidden="true"><input type="checkbox" tabIndex={-1} checked={s.host} readOnly /><i /></span>
        </button>
        <div className="mgrid">{grid.map(([g, ic, k]) => (
          <button key={k} {...(g ? { 'data-go': g, 'data-how': 'r' } : { 'data-toast': k === 'saved' ? 'savedList' : 'inviteCopied' })}><i><Ic p={ic} s={22} /></i>{t(k)}</button>
        ))}</div>
        <PassEntry id="me-pass" />
        <button className="mrow" data-go="lang" data-how="b"><Ic p={I.globe} s={20} /><span className="grow">{me().native}</span><Ic p={I.chev} s={16} /></button>
        <button className="mrow" data-go="vouchers" data-how="f"><Ic p={I.gift} s={20} /><span className="grow">{t('d_vouch')}</span><span className="chip goldc" style={{ height: 26, fontSize: 11 }}>{VOUCH.length}</span></button>
        <button className="mrow" id="sett" data-go="settings" data-how="r"><Ic p={I.gear} s={20} /><span className="grow">{t('settings')}</span><Ic p={I.chev} s={16} /></button>
        {/* café / restaurant owners: their partner-venue sign-up, or their venue's counter once signed up */}
        <button className="lnk small" id="me-venue" data-go={s.myVenue ? 'venue-home' : 'venue-onboard'} data-how="r" style={{ background: 'none', border: 0, color: 'var(--ink2)', textDecoration: 'underline', padding: '6px 4px', alignSelf: 'center', textAlign: 'center' }}>{t(s.myVenue ? 'meVenueHome' : 'meVenue')}</button>
      </div></div>
      <Tabs active="me" />
    </>
  )
}

/* ---------- trips ---------- */
/** Money lines for a booking: what was paid to Kring, and what is paid to the host at the place (never through Kring). */
function MoneyLines({ b }: { b: Booking }) {
  const a = b.kind === 'act' ? ACTS.find((x) => x.id === b.act) || null : null
  if (!a && b.paid_kind === 'partner') return <span className="small">{t('tourPayCounter', { co: payee(b.k), amt: baht(b.amt) })}</span>
  if (!a) return <span className="small num">{baht(b.amt)}</span>
  return <span className="col small" style={{ gap: 1 }}><span>{kringLine(b)}</span><span>{placeLine(b, hostName(a))}</span></span>
}

/** Where a booking happens, for the calendar file and the receipt. */
const whereOf = (b: Booking, a: Act | null): string => (a ? meetName(a, b) + ', ' + meetAddress(a, b) : (tourInfo(b.k) ? t(tourInfo(b.k)!.meetKey) + ' · ' + t('city_' + tourInfo(b.k)!.city) : ''))
/** Download a real .ics calendar file for this booking. */
function addToCal(b: Booking): void {
  const a = b.kind === 'act' ? ACTS.find((x) => x.id === b.act) || null : null
  const note = a ? placeLine(b, hostName(a)) + ' · ' + t('s2') : t('tourPayCounter', { co: payee(b.k), amt: baht(b.amt) })
  const ok = downloadIcs(b, whereOf(b, a), note + (b.ref ? ' · ' + t('bkRef', { ref: b.ref }) : ''))
  toast(ok ? t('addedCal') : t('calFail'), ok ? 'info' : 'err'); tick(0.7, 0.06)
}

/** Spots of one group at the same host and time (the first booking + "book another spot"): [this spot's number, how many]. */
function spotOf(b: Booking): [number, number] {
  const root = b.extra_of || b.ref
  if (!root) return [1, 1]
  const grp = S.bookings.filter((x) => x.status !== 'cancelled' && (x.ref === root || x.extra_of === root))
    .sort((x, y) => (x.extra_of ? 1 : 0) - (y.extra_of ? 1 : 0) || String(x.made_at || '').localeCompare(String(y.made_at || '')))
  return [Math.max(1, grp.indexOf(b) + 1), Math.max(1, grp.length)]
}
/** The activity booked just before this one on the same day, when it ends less than 45 min before this one starts at another place. */
function tightBefore(b: Booking, list: Booking[]): Booking | null {
  const a = b.kind === 'act' ? ACTS.find((x) => x.id === b.act) : undefined
  if (!a || !b.time) return null
  const s0 = atTime(new Date(b.date), b.time).getTime()
  let best: Booking | null = null, bestEnd = 0
  for (const x of list) {
    const xa = x !== b && x.kind === 'act' ? ACTS.find((y) => y.id === x.act) : undefined
    if (!xa || !x.time || xa.place === a.place || !sameDay(new Date(x.date), new Date(b.date))) continue
    const e = atTime(new Date(x.date), x.time).getTime() + xa.h * 36e5
    if (e <= s0 && s0 - e < 45 * 6e4 && e > bestEnd) { best = x; bestEnd = e }
  }
  return best
}

function UpCard({ b, i, onCx, onLate, onRcp, prev }: { b: Booking; i: number; onCx: (i: number) => void; onLate: (i: number) => void; onRcp: (i: number) => void; prev?: Booking | null }) {
  const a = b.kind === 'act' ? ACTS.find((x) => x.id === b.act) || null : null
  const partner = !a && b.paid_kind === 'partner'
  const [spot, spots] = a ? spotOf(b) : [1, 1]
  const pa = prev && prev.kind === 'act' ? ACTS.find((x) => x.id === prev.act) || null : null
  return (
    <div className="glass card col" style={{ gap: 10 }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <img src={ph(a ? a.img : b.img || '')} alt="" style={{ width: 62, height: 62, borderRadius: 16, objectFit: 'cover', flex: 'none' }} />
        <div className="col grow" style={{ minWidth: 0 }}>
          <b>{bkTitle(b)}</b>
          <span className="small">{dayFmt(b.date, { weekday: 'long', day: 'numeric', month: 'short' })}{b.time ? ' · ' + (a ? tRange(a, b.time) : b.time) : ''}{a ? ' · ' + hostName(a) : ''} · {pplN(b.guests)}</span>
          {a && <span className="small" style={{ display: 'flex', gap: 5, alignItems: 'center', color: b.status === 'confirmed' ? '#4CD39A' : 'var(--anchan2)' }}>{b.status === 'confirmed' ? <><Ic p={I.check} s={13} sw={3} />{t('stConfirmed', { host: hostName(a) })}</> : <><span className="live" />{t('waitHost', { host: hostName(a) })}</>}</span>}
          {a && b.status === 'pending' && <span className="small" data-reply-by={i}>{replyLine(hostName(a), replyBy(b), refundable(b), noRefundWhy(b))}</span>}
          {a && (b.ref || spots > 1) && <span className="small" data-bk-ref={i} style={{ opacity: 0.85 }}>{b.ref ? t('bkRef', { ref: b.ref }) : ''}{b.ref && spots > 1 ? ' · ' : ''}{spots > 1 ? <b data-spot={i}>{t('spotOf', { i: spot, n: spots })}</b> : null}</span>}
          {a && pa && prev && <span className="small" data-travel={i} style={{ color: 'var(--gold2)' }}>{t('travelHint', { prev: aTitle(pa), end: endT(prev.time, pa.h), from: meetName(pa), to: meetName(a) })}</span>}
          {partner && <span className="small" data-tour-meet={i}>{tourBy(b.k)} · {tourMeet(b.k)}</span>}
          {partner && b.ref && <span className="small" style={{ opacity: 0.8 }}>{t('tourRef', { ref: b.ref })}</span>}
          <MoneyLines b={b} />
        </div>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="chip" data-cx={i} onClick={() => onCx(i)}>{t('change')}</button>
        {a && <button className="chip" data-day={i} id={'dayplan-' + i} onClick={() => { update((st) => { st.act = a.id }); tick(0.6, 0.06); go('onway', 'f') }}><Ic p={I.pin} s={14} />{t('dayPlan')}</button>}
        {a && activityEnded(b, a) && b.status === 'confirmed' && <button className="chip goldc" id={'rate-' + i} onClick={() => { update((st) => { st.act = a.id }); go('rate', 'f') }}><Ic p={I.star} s={14} />{t('rateNow', { host: hostName(a) })}</button>}
        {a && <button className="chip" data-late={i} onClick={() => onLate(i)}><Ic p={I.clock} s={14} />{t('late')}</button>}
        <button className="chip" data-rcp={i} onClick={() => onRcp(i)}>{partner ? t('tourRcptTitle') : t('receipt')}</button>
        <button className="chip" data-cal={i} onClick={() => addToCal(b)}><Ic p={I.clock} s={14} />{t('addCal')}</button>
      </div>
    </div>
  )
}

function Rules({ h }: { h: string }) {
  const g = 'rgba(76,211,154,.16)', y = 'rgba(255,178,30,.16)', bl = 'rgba(52,70,255,.2)'
  const pill = { minWidth: 44, width: 'auto', padding: '0 6px', whiteSpace: 'nowrap' } as const
  return (
    <>
      <b>{t('rulesTitle')}</b>
      <span className="small">{t('rulesTicket')}</span>
      {([['r1', '100', g, '#4CD39A'], ['r2', '100', g, '#4CD39A'], ['r3', '50', y, '#FFD067'], ['r4', '20', y, '#FFD067']] as const).map(([k, p, bg, c]) => (
        <div key={k} className="rule"><i style={{ background: bg, color: c, ...pill }}>{p}%</i><span>{t(k, { host: h })}</span></div>
      ))}
      <div className="rule"><i style={{ background: bl, color: 'var(--anchan2)', fontSize: 10, ...pill }}>{t('hrs', { h: 2 })}</i><span>{t('protect')}</span></div>
      <div className="rule"><i style={{ background: bl, color: 'var(--anchan2)' }}><Ic p={I.pin} s={14} /></i><span>{t('r5')}</span></div>
      {([['r6', '100'], ['r7', '15′'], ['r8', '✉']] as const).map(([k, p]) => (
        <div key={k} className="rule"><i style={{ background: g, color: '#4CD39A', fontSize: p.length > 3 ? 10 : 11, ...pill }}>{p}{p === '100' ? '%' : ''}</i><span>{t(k)}</span></div>
      ))}
    </>
  )
}

/** Receipt contents (on screen and in the print view). Partner tours: no Kring total, the partner is paid directly. */
function ReceiptBody({ b, inv, print = false }: { b: Booking | 'pass'; inv: string; print?: boolean }) {
  const fmtS = (d: Date) => dayFmt(d, { weekday: 'short', day: 'numeric', month: 'short' })
  const fmtT = (d: Date) => dayFmt(d, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const gold = print ? undefined : { color: 'var(--gold2)' }
  if (b === 'pass') {
    const pass = myPass()
    return <>
      <b style={{ fontSize: 18 }}>{t('receiptTitle')} · {t('passName')}</b>
      <span className="small">{S.prof.passRef ? t('bkRef', { ref: S.prof.passRef }) : ''}{inv ? ' · ' + inv : ''}</span>
      <div className="line"><span>{t('paidKring')} · {t('passName')}</span><span className="num" style={gold}>{baht(S.prof.passPaidThb || KR6_PRODUCTS.pass_7day.priceThb)}</span></div>
      {S.prof.passPaidAt && <span className="small">{t('rcptPaidAt', { d: fmtT(new Date(S.prof.passPaidAt)) })}{S.prof.passPayN ? ' · ' + t('rcptMethod', { m: S.prof.passPayN }) : ''}</span>}
      {pass.until && <span className="small">{t('passUntil', { d: fmtT(pass.until) })}</span>}
      <span className="small">{t('passRefundRule')}</span>
    </>
  }
  const a = b.kind === 'act' ? ACTS.find((x) => x.id === b.act) || null : null
  if (!a && b.paid_kind === 'partner') {
    const ti = tourInfo(b.k)
    return <>
      <b style={{ fontSize: 18 }}>{t('tourRcptTitle')}</b>
      <span className="small">{bkTitle(b)} · {fmtS(b.date)}{b.time ? ' · ' + b.time : ''} · {pplN(b.guests)}</span>
      {b.ref && <span className="small">{t('tourRef', { ref: b.ref })}{inv ? ' · ' + inv : ''}</span>}
      {ti && <span className="small">{tourBy(b.k)}<br />{tourMeet(b.k)} · {t('city_' + ti.city)}</span>}
      <div className="line"><span>{t('tourPayDirect', { co: payee(b.k) })}</span><span className="num" style={gold}>{baht(b.amt)}</span></div>
      <span className="small">{t('tourNoKring')} {t('tourTerms', { co: payee(b.k) })}</span>
    </>
  }
  const rm = bkMoney(b)
  const method = rm.kring > 0 && b.pay !== undefined ? payList()[b.pay]?.n || '' : ''
  return <>
    <b style={{ fontSize: 18 }}>{t('receiptTitle')}</b>
    <span className="small">{bkTitle(b)}{a ? ' · ' + hostName(a) : ''} · {fmtS(b.date)}{b.time ? ' · ' + b.time : ''} · {pplN(b.guests)}{b.ref ? ' · ' + t('bkRef', { ref: b.ref }) : ''}</span>
    {inv && <span className="small">{inv}</span>}
    <div className="line"><span>{a ? kringLine(b) : t('total')}</span><span className="num" style={gold}>{baht(rm.kring)}</span></div>
    {rm.kring > 0 && (b.made_at || method) && <span className="small">{b.made_at ? t('rcptPaidAt', { d: fmtT(new Date(b.made_at)) }) : ''}{b.made_at && method ? ' · ' : ''}{method ? t('rcptMethod', { m: method }) : ''}</span>}
    {rm.kring > 0 && fx(rm.kring) ? <span className="small">{t('fxApprox', { v: fx(rm.kring) })}</span> : null}
    {a && <><div className="hr" /><div className="line"><span>{rm.host > 0 ? t(hostPaid(b) ? 'rcptAct' : 'rcptDue', { host: hostName(a) }) : t('volNothing', { host: hostName(a) })}</span><span className="num">{baht(rm.host)}</span></div></>}
    {a && rm.host > 0 && <span className="small">{t(hostPaid(b) ? 'invNote' : 'invNoteDue', { host: hostName(a) })}</span>}
  </>
}

/** Print view: only the receipt is printed (or saved as PDF from the phone's print dialog). */
function PrintReceipt({ b, inv }: { b: Booking | 'pass'; inv: string }) {
  return createPortal(
    <div id="print-rcpt" lang={document.documentElement.lang}>
      <style>{'#print-rcpt{display:none}@media print{body>*:not(#print-rcpt){display:none!important}html,body{background:#fff!important}#print-rcpt{display:flex!important;flex-direction:column;gap:10px;padding:24px;color:#000;font:14px/1.45 system-ui,sans-serif}#print-rcpt .line{display:flex;justify-content:space-between;gap:12px;border-top:1px solid #ccc;padding-top:8px}#print-rcpt .hr{display:none}#print-rcpt *{color:#000!important}#print-rcpt .small{color:#333!important}}'}</style>
      <b style={{ fontSize: 20 }}>กริ๊ง! Kring</b>
      <ReceiptBody b={b} inv={inv} print />
      <span className="small">kringapp.com</span>
    </div>, document.body)
}

/** "Pick another time instead": a real day + time picker; nothing moves until the guest confirms. */
function MovePicker({ bk, a, onDone }: { bk: Booking; a: Act; onDone: () => void }) {
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); d.setHours(12, 0, 0, 0); return d })
  const [di, setDi] = useState<number | null>(null)
  const [tm, setTm] = useState<string | null>(null)
  const h = hostName(a)
  const isNow = (i: number, x: string) => sameDay(days[i], bk.date) && x === bk.time
  const bad = (i: number, x: string) => atTime(days[i], x).getTime() <= Date.now() + 30 * 6e4 || isNow(i, x) || overlaps(days[i], x, a.h, bk).length > 0
  const ok = di !== null && tm !== null && !bad(di, tm)
  const label = ok ? dayFmt(days[di!], { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + tRange(a, tm!) : ''
  return (
    <div className="col" id="mv-pick" style={{ gap: 10 }}>
      <span className="eyebrow">{t('chooseDay')}</span>
      <div className="chips" role="group" aria-label={t('chooseDay')} style={{ flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 4 }}>{days.map((d, i) => {
        const none = SL(a).every((x) => bad(i, x))
        return <button key={i} type="button" className={`chip ${di === i ? 'on' : ''}`} aria-pressed={di === i} disabled={none} data-mvd={i} style={{ flex: 'none', height: 40, ...(none ? { opacity: 0.35 } : {}) }} onClick={() => { setDi(i); if (tm && bad(i, tm)) setTm(null); tick(0.5, 0.05) }}>{dayFmt(d, { weekday: 'short', day: 'numeric', month: 'short' })}</button>
      })}</div>
      {di !== null && <><span className="eyebrow">{t('timeW')}</span>
        <div className="chips" role="group" aria-label={t('timeW')}>{SL(a).map((x) => <button key={x} type="button" className={`chip num ${tm === x ? 'on' : ''}`} aria-pressed={tm === x} disabled={bad(di, x)} data-mvt={x} style={bad(di, x) ? { opacity: 0.35 } : undefined} onClick={() => { setTm(x); tick(0.5, 0.05) }}>{tRange(a, x)}</button>)}</div></>}
      <span className="small">{t('mvNote', { host: h })}</span>
      <button className="btn gold" id="mv-ok" disabled={!ok} onClick={() => {
        if (!ok) return
        const d = new Date(days[di!])
        update(() => { bk.date = d; bk.time = tm!; bk.status = 'pending'; bk.made_at = new Date().toISOString() })
        onDone(); toast(t('moved', { d: label })); tick(0.8, 0.06); go('trips', 'f', true)
      }}>{ok ? t('mvTo', { d: label }) : t('mvPick')}</button>
    </div>
  )
}

function Trips() {
  const s = useS()
  const up = myBk().sort(byStart)
  const pastBk = s.bookings.filter((b) => b.done && b.status !== 'cancelled').sort((x, y) => byStart(y, x))
  const cxBk = s.bookings.filter((b) => b.status === 'cancelled').sort((x, y) => String(y.cancelled_at || '').localeCompare(String(x.cancelled_at || '')))
  const pass = myPass()
  const [seg, setSeg] = useState(up.length || !(pastBk.length || cxBk.length) ? 0 : 1)
  const [rcp, setRcp] = useState<number | 'pass' | null>(null)
  const [inv, setInvRaw] = useState(() => S.prof.invoiceName || '')
  // the invoice name/company/tax ID shows on the receipt on screen and in print, and is kept for the next receipt
  const setInv = (v: string) => { setInvRaw(v); update((st) => { st.prof.invoiceName = v.trim() || undefined }) }
  const [late, setLate] = useState<number | null>(null)
  const [cx, setCx] = useState<{ i: number; why: string | null; hrs: number; sure: boolean; mv: boolean } | null>(null)
  const back = s.from.trips && !['rate', 'trips'].includes(s.from.trips) ? s.from.trips : 'me'
  useEffect(() => {
    // requests the host did not answer in time are cancelled with the ticket back; every booking gets a reference
    expireUnanswered()
    if (S.bookings.some((b) => !b.ref)) update(() => { for (const b of S.bookings) if (!b.ref) { let r = newRef(); while (S.bookings.some((x) => x.ref === r)) r = newRef(); b.ref = r } })
  }, [])
  const openCx = (i: number) => {
    const bk = S.bookings[i]
    const start = atTime(new Date(bk.date), bk.time || '09:00')
    setCx({ i, why: null, hrs: (start.getTime() - Date.now()) / 36e5, sure: false, mv: false }); tick(0.6, 0.07)
  }
  const bk = cx ? S.bookings[cx.i] : null
  const bka = bk && bk.kind === 'act' ? ACTS.find((x) => x.id === bk.act) || null : null
  const bkPartner = !!bk && !bka && bk.paid_kind === 'partner'
  // the refund policy: 100% when 24 h or more before (or the host has not confirmed yet), 50% later; sick or a cancelled flight under 24 h is reviewed by email
  const pct = (): number => (!bk || !cx ? 100 : bk.status === 'pending' || cx.hrs >= 24 ? 100 : 50)
  const proof = !!cx && pct() < 100 && (cx.why === 'why1' || cx.why === 'why3')
  const full = bk ? refundable(bk) : 0
  const refundAmt = bk ? Math.round(full * pct() / 100) : 0
  const fmtS = (d: Date) => dayFmt(d, { weekday: 'short', day: 'numeric', month: 'short' })
  const rb = rcp === 'pass' ? 'pass' : rcp !== null ? S.bookings[rcp] : null
  // the refund rules name the host only when every upcoming booking is with the same host
  const hosts = [...new Set(up.filter((b) => b.kind === 'act').map((b) => bkHost(b)))]
  const ruleHost = hosts.length === 1 ? hosts[0] : t('hostGeneric')
  const cxText = (x: Booking): string => x.paid_kind === 'partner' ? t('tourCxRec', { d: x.cancelled_at ? fmtS(new Date(x.cancelled_at)) : '' })
    : x.cancelled_reason === 'no_reply' ? t('cxNoReply', { host: bkHost(x), d: x.cancelled_at ? fmtS(new Date(x.cancelled_at)) : '', amt: baht(x.refund_amt || 0) })
      : x.cancelled_at ? t('cxRec', { d: fmtS(new Date(x.cancelled_at)), amt: baht(x.refund_amt || 0) }) : t('cxTag')
  return (
    <>
      <div className="topb"><button className="ib" data-go={back} data-how="l" aria-label="Back"><Ic p={I.back} /></button><h1 className="h2 grow">{t('t_trips')}</h1></div>
      <div className="scroll"><div className="pad col" style={{ gap: 14, paddingBottom: 110 }}>
        {pass.active && pass.until && <div className="glass card row" id="trips-pass" style={{ gap: 12, border: '1px solid rgba(255,208,103,.35)' }}>
          <span style={{ color: 'var(--gold2)', flex: 'none' }}><Ic p={I.ticket} s={22} /></span>
          <span className="col grow" style={{ gap: 2 }}><b>{t('passName')}</b><span className="small">{t('passUntil', { d: dayFmt(pass.until, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })} · {t('passActive', { n: pass.daysLeft })}</span></span>
          {S.prof.passPaidAt && <button className="chip" id="pass-rcpt" style={{ height: 30, fontSize: 11.5, flex: 'none' }} onClick={() => { setRcp('pass'); tick(0.6, 0.07) }}>{t('receipt')}</button>}
        </div>}
        <div className="seg" id="seg"><span className="ind" style={{ transform: `translateX(${seg * 100}%)` }} />
          {[t('upcoming'), t('past')].map((l, i) => <button key={i} data-seg={i} className={seg === i ? 'on' : ''} aria-pressed={seg === i} onClick={() => { setSeg(i); tick(0.5, 0.06) }}>{l}</button>)}
        </div>
        <div id="up" hidden={seg !== 0} className="col rise" style={{ gap: 12 }}>
          {up.length ? up.map((x) => { const i = S.bookings.indexOf(x); return <UpCard key={i} b={x} i={i} prev={tightBefore(x, up)} onCx={openCx} onLate={(j) => { setLate(j); tick(0.6, 0.07) }} onRcp={(j) => { setRcp(j); tick(0.6, 0.07) }} /> })
            : <div className="glass card col" style={{ gap: 10, alignItems: 'center', textAlign: 'center' }}><span className="small">{t('noUp')}</span><button className="btn gold" data-go="experiences" data-how="f">{t('seeAll')}</button></div>}
        </div>
        <div id="past" className="col rise" style={{ gap: 12 }} hidden={seg !== 1}>
          {pastBk.length ? pastBk.map((x) => {
            const i = S.bookings.indexOf(x), xa = x.kind === 'act' ? ACTS.find((y) => y.id === x.act) || null : null
            return (
              <div key={i} className="glass card col rcpt" style={{ gap: 6 }}>
                <div className="row">
                  <img src={ph(xa ? xa.img : x.img || '')} alt="" style={{ width: 52, height: 52, borderRadius: 14, objectFit: 'cover', flex: 'none' }} />
                  <div className="col grow" style={{ minWidth: 0 }}><b>{bkTitle(x)}{xa ? ' · ' + hostName(xa) : ''}</b><span className="small">{dayFmt(x.date, { day: 'numeric', month: 'short' })}{x.time ? ' · ' + x.time : ''}</span></div>
                  <button className="chip" style={{ height: 30, fontSize: 11.5 }} onClick={() => { setRcp(i); tick(0.6, 0.07) }}>{t('receipt')}</button>
                </div>
                <MoneyLines b={x} />
              </div>
            )
          }) : !cxBk.length && <div className="glass card col" style={{ gap: 10, alignItems: 'center', textAlign: 'center' }}><span className="small">{t('noPast')}</span></div>}
          {cxBk.length > 0 && <span className="eyebrow" id="cx-head" style={{ marginTop: 6 }}>{t('cxHead')}</span>}
          {cxBk.map((x) => {
            const i = S.bookings.indexOf(x), xa = x.kind === 'act' ? ACTS.find((y) => y.id === x.act) || null : null
            return (
              <div key={i} className="glass card col" data-cancelled={i} style={{ gap: 6, opacity: 0.85 }}>
                <div className="row">
                  <img src={ph(xa ? xa.img : x.img || '')} alt="" style={{ width: 52, height: 52, borderRadius: 14, objectFit: 'cover', flex: 'none', filter: 'grayscale(.6)' }} />
                  <div className="col grow" style={{ minWidth: 0 }}><b>{bkTitle(x)}{xa ? ' · ' + hostName(xa) : ''}</b><span className="small">{dayFmt(x.date, { weekday: 'short', day: 'numeric', month: 'short' })}{x.time ? ' · ' + x.time : ''}{x.ref ? ' · ' + t('bkRef', { ref: x.ref }) : ''}</span></div>
                  <span className="chip" style={{ height: 26, fontSize: 11, flex: 'none' }}>{t('cxTag')}</span>
                </div>
                <span className="small">{cxText(x)}</span>
              </div>
            )
          })}
        </div>
        <div className="glass card col" style={{ gap: 12 }} id="rules"><Rules h={ruleHost} /></div>
      </div></div>
      <Tabs active="me" />

      <Sheet open={!!rb} onClose={() => setRcp(null)}>
        {rb && <>
          <ReceiptBody b={rb} inv={inv.trim()} />
          <label className="inp glass" style={{ height: 'auto', minHeight: 52, padding: '6px 14px' }}><input value={inv} onChange={(e) => setInv(e.target.value.slice(0, 80))} placeholder={t('invName')} aria-label={t('invName')} style={{ width: '100%', minHeight: 40 }} /></label>
          <button className="btn gold" id="dl" onClick={() => { tick(0.6, 0.06); setTimeout(() => { try { window.print() } catch { toast(t('printFail'), 'err') } }, 50) }}>{t('download')}</button>
          <PrintReceipt b={rb} inv={inv.trim()} />
        </>}
      </Sheet>

      <Sheet open={late !== null} onClose={() => setLate(null)}>
        <b style={{ fontSize: 18 }}>{t('lateQ')}</b>
        <div className="chips">{[5, 10, 15, 20, 30].map((m) => <button key={m} className="chip num" data-m={m} onClick={() => { const b = S.bookings[late!]; setLate(null); toast(t('lateSent', { host: b ? bkHost(b) : '', m })); bell(0.2, 1319) }}>{m} min</button>)}</div>
        <span className="small">{t('graceRule')}</span>
      </Sheet>

      <Sheet open={!!(cx && bk)} onClose={() => setCx(null)}>
        {cx && bk && bkPartner && <>
          <b style={{ fontSize: 18 }}>{t('change')}</b>
          <span className="small">{bkTitle(bk)} · {fmtS(bk.date)}{bk.time ? ' · ' + bk.time : ''}{bk.ref ? ' · ' + t('tourRef', { ref: bk.ref }) : ''}</span>
          <span className="small">{t('tourCxNote', { co: payee(bk.k) })}</span>
          {!cx.sure
            ? <button className="btn ghost" id="cx" onClick={() => { setCx({ ...cx, sure: true }); tick(0.6, 0.06) }}>{t('tourCx')}</button>
            : <button className="btn ghost" id="cx-sure" style={{ borderColor: '#FF7A7A', color: '#FFB3B3' }} onClick={() => { cancelBooking(bk, 0); setCx(null); toast(t('tourCxDone'), 'info'); bell(0.2, 1319); go('trips', 'f', true) }}>{t('tourCxSure')}</button>}
        </>}
        {cx && bk && !bkPartner && <>
          <b style={{ fontSize: 18 }}>{t('change')}</b>
          <span className="small">{bkTitle(bk)} · {fmtS(bk.date)}{bk.time ? ' · ' + bk.time : ''}</span>
          {cx.mv && bka
            ? <MovePicker bk={bk} a={bka} onDone={() => setCx(null)} />
            : <>
              {full > 0 && <><span className="eyebrow">{t('whyQ')}</span>
                <div className="chips" id="whys">{['why1', 'why2', 'why3', 'why4'].map((k) => <button key={k} className={`chip ${cx.why === k ? 'on' : ''}`} aria-pressed={cx.why === k} data-w={k} onClick={() => { setCx({ ...cx, why: k, sure: false }); tick(0.6, 0.06) }}>{t(k)}</button>)}</div>
                <div className="glass card row"><b className="grow" id="rfp">{t('refundPrev', { amt: baht(refundAmt) })}</b><span className="chip goldc" id="rfc" style={{ height: 28 }}>{pct()}%</span></div>
                {bk.kind === 'act' && <span className="small">{t('refundTicketOnly', { host: bkHost(bk) })}{bkMoney(bk).kind === 'pass' ? ' ' + t('passStays') : ''}</span>}
                {proof && <span className="small" id="cx-proof" style={{ color: 'var(--gold2)' }}>{t(cx.why === 'why1' ? 'cxSickNote' : 'cxFlightNote', { ref: bk.ref || '' })}</span>}
                {cx.why === 'why2' && pct() < 100 && <span className="small" id="cx-weather">{t('cxWeatherNote', { host: bkHost(bk) })}</span>}
                <span className="small">{t('refundRule')}</span></>}
              {full <= 0 && <div className="glass card col" id="rfp0" style={{ gap: 4 }}><b>{t('cxAsk0')}</b><span className="small">{launchTicketComesBack(bk) ? t('launchBackNote') : noRefundWhy(bk)} {t('noHostPaid', { host: bkHost(bk) })}</span></div>}
              {bka && <button className="btn gold" id="mv" onClick={() => { setCx({ ...cx, mv: true }); tick(0.7, 0.06) }}>{t('newTime')}</button>}
              {!cx.sure
                ? <button className="btn ghost" id="cx" onClick={() => { setCx({ ...cx, sure: true }); tick(0.6, 0.06) }}>{t('doCancel')}</button>
                : <button className="btn ghost" id="cx-sure" style={{ borderColor: '#FF7A7A', color: '#FFB3B3' }} onClick={() => {
                  const amt = baht(refundAmt)
                  const back = cancelBooking(bk, refundAmt); setCx(null); toast(back ? t('launchBack') : refundAmt > 0 ? t('cancelled', { amt }) : t('cancelled0'), refundAmt > 0 || back ? 'ok' : 'info'); bell(0.2, 1319); go('trips', 'f', true)
                }}>{refundAmt > 0 ? t('cxSure', { amt: baht(refundAmt) }) : t('cxSure0')}</button>}
            </>}
        </>}
      </Sheet>
    </>
  )
}

/* ---------- safety ---------- */
const repList = (): string[] => {
  const l = S.bookings.filter((b) => b.status !== 'cancelled').map((b) => bkTitle(b) + ' · ' + dayFmt(b.date, { day: 'numeric', month: 'short' }))
  if (S.met && !l.length) l.push(aTitle(act()) + ' · ' + hostName(act()))
  return [...new Set(l)].slice(0, 3)
}

const REP_REASONS = ['rep1', 'rep2', 'rep3', 'repHarass', 'repSexual', 'bad4']

function Safety() {
  const s = useS()
  const sos = useRef<HTMLButtonElement>(null)
  const sosDone = useRef(false)
  const [sosT, setSosT] = useState<'sos' | 'sosHolding' | 'sosDone' | 'sosTap'>('sos')
  const [rep, setRep] = useState(false)
  const list = repList()
  const [rb, setRb] = useState<number | null>(list.length === 1 ? 0 : null)
  const [rr, setRr] = useState<string | null>(null)
  const [detail, setDetail] = useState('')
  const hasContact = !!(s.prof.emName.trim() && s.prof.emPhone.trim())
  const back = s.from.safety && s.from.safety !== 'safety' ? s.from.safety : 'me'
  const needBk = list.length > 0
  const canSend = !!rr && (!needBk || rb !== null)

  useEffect(() => {
    const b = sos.current!
    let raf = 0, start = 0, on = false
    const f = (now: number) => {
      if (!on || sosDone.current) return
      const p = Math.min(1, (now - start) / 2000); b.style.setProperty('--p', String(p))
      if (p >= 1) {
        sosDone.current = true; on = false; b.classList.add('done'); setSosT('sosDone'); bell(0.3, 880); buzz([60, 40, 60])
        // the phone itself places the call: Kring has no server that calls anyone
        try { window.location.href = 'tel:1155' } catch { /* ignore */ }
        return
      }
      raf = requestAnimationFrame(f)
    }
    const begin = () => { on = true; start = performance.now(); setSosT('sosHolding'); raf = requestAnimationFrame(f) }
    const pd = (e: PointerEvent) => { e.preventDefault(); if (sosDone.current) return; begin() }
    const up = () => {
      if (sosDone.current || !on) return
      on = false; cancelAnimationFrame(raf); b.style.setProperty('--p', '0')
      // a short tap: explain how SOS works instead of doing nothing
      setSosT(performance.now() - start < 2000 ? 'sosTap' : 'sos'); tick(0.5, 0.05)
    }
    const kd = (e: KeyboardEvent) => { if ((e.key === ' ' || e.key === 'Enter') && !on && !sosDone.current) { e.preventDefault(); begin() } }
    const ku = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') up() }
    b.addEventListener('pointerdown', pd); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up)
    b.addEventListener('keydown', kd); b.addEventListener('keyup', ku); b.addEventListener('blur', up)
    return () => {
      cancelAnimationFrame(raf)
      b.removeEventListener('pointerdown', pd); b.removeEventListener('pointerup', up); b.removeEventListener('pointerleave', up)
      b.removeEventListener('keydown', kd); b.removeEventListener('keyup', ku); b.removeEventListener('blur', up)
    }
  }, [])

  const cancelSos = () => {
    sosDone.current = false
    const b = sos.current
    if (b) { b.classList.remove('done'); b.style.setProperty('--p', '0') }
    setSosT('sos'); toast(t('sosCancelled')); chime()
  }
  const send = () => {
    if (!canSend) return
    const bkLabel = rb !== null && list[rb] ? list[rb] : ''
    const bk = S.bookings.find((x) => x.status !== 'cancelled' && bkTitle(x) + ' · ' + dayFmt(x.date, { day: 'numeric', month: 'short' }) === bkLabel) || dayOf().b
    const why = rr!, text = [bkLabel, detail].filter(Boolean).join(' · ')
    setRep(false); setRr(null); setDetail('')
    bell(0.2, 1568)
    // live: the case number the server gave this report; preview builds make one up on this phone
    void api.report(rpcBookingId(bk), why, text).then((id) => toast(t('repCase', { n: id || caseNo() }))).catch(() => toast(t('authErr')))
  }

  return (
    <>
      <div className="topb"><button className="ib" data-go={back} data-how="l" aria-label="Back"><Ic p={I.back} /></button><h1 className="h2 grow">{t('safety')}</h1></div>
      <div className="scroll"><div className="pad col rise" style={{ gap: 16, paddingBottom: 110 }}>
        <div className="sosw">
          <button className="sosbtn" id="sos" ref={sos} aria-label={t('sos') + ' · ' + t('sosTap')} aria-describedby="sosT"><span>SOS</span></button>
          <b id="sosT" aria-live="assertive" style={{ fontSize: 17 }}>{t(sosT)}</b>
          {sosT === 'sosDone'
            ? <>
              <span className="small" id="sosCall" style={{ lineHeight: 1.5 }}>{t('sosCallHint')}</span>
              {hasContact && <TripShareButton id="sosShare" />}
              <button className="btn ghost" id="sosSafe" style={{ marginTop: 4 }} onClick={cancelSos}>{t('sosSafe')}</button>
            </>
            : <span className="small">{t('sosSub')}</span>}
          <span className="small" style={{ color: 'var(--ink2)' }}>{t('emerg')}</span>
        </div>
        <div className="glass card col" id="liveCard" style={{ gap: 8 }}>
          <b>{t('shareTrip')}</b>
          <span className="small" id="liveSub" style={{ lineHeight: 1.5 }}>{hasContact ? t('shareSub', { name: s.prof.emName.trim() }) : t('shareNeed')}</span>
          <TripShareButton id="liveShare" />
        </div>
        <div className="glass card col" style={{ gap: 14 }}>{([['s1', I.pin], ['s2', I.cash], ['s3', I.id]] as const).map(([k, p]) => <div key={k} className="srow"><i><Ic p={p} s={18} /></i>{t(k)}</div>)}</div>
        <button className="btn ghost" id="rep" onClick={() => setRep(true)}><Ic p={I.flag} s={18} />{t('report')}</button>
      </div></div>
      <Sheet open={rep} onClose={() => setRep(false)}>
        <b style={{ fontSize: 18 }}>{t('reportQ')}</b>
        <span className="eyebrow">{t('pickBooking')}</span>
        <div className="chips" id="rbk">{list.length ? list.map((x, i) => <button key={x} className={`chip ${rb === i ? 'on' : ''}`} aria-pressed={rb === i} data-b={i} onClick={() => setRb(i)}>{x}</button>) : <span className="small" id="noBk">{t('noBooking')}</span>}</div>
        <div className="chips" id="rchips" style={{ flexWrap: 'wrap' }}>{REP_REASONS.map((k) => <button key={k} className={`chip ${rr === k ? 'on' : ''}`} aria-pressed={rr === k} data-r={k} onClick={() => setRr(k)}>{t(k)}</button>)}</div>
        <label className="inp glass" style={{ height: 'auto', minHeight: 52, padding: '10px 14px' }}><textarea rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={t('repDetail')} aria-label={t('repDetail')} style={{ width: '100%', background: 'none', border: 0, color: '#fff', font: 'inherit', resize: 'none', outline: 'none' }} /></label>
        <span className="small">{t('repCheck')}</span>
        {!canSend && <span className="small" id="rsendWhy" style={{ color: 'var(--gold2)' }}>{needBk ? t('repWhyBk') : t('repWhy')}</span>}
        <button className="btn gold" id="rsend" disabled={!canSend} aria-describedby={!canSend ? 'rsendWhy' : undefined} onClick={send}>{t('send')}</button>
      </Sheet>
      <Tabs active="me" />
    </>
  )
}

register(
  { id: 'me', flow: 't', title: 'Me', C: Me },
  { id: 'trips', flow: 't', title: 'Trips & receipts', C: Trips },
  { id: 'safety', flow: 't', title: 'Safety', C: Safety },
)
