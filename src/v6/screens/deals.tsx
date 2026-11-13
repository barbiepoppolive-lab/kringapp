/* Deals: the Kring Cinema (tours + packages + vouchers rails), the booking sheet, vouchers list and voucher. Ported from the prototype. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { S, update, useS } from '../core/store'
import { PassEntry } from './booking'
import { t, ph, bl, baht, fx, dayFmt, rand, RM, TOURS, PACKS, VOUCH, packCompare, type Tour, type Pack, type Voucher } from '../core/data'
import { KR6_DEALS_SOURCES_27OCT, type DealSourceRecord } from '../core/dealsConfig'
import { tourInfo, tourBy, tourMeet, payee } from '../core/tourInfo'
import { register, go, toast } from '../core/router'
import { bell, buzz, chime, tick } from '../core/sound'
import { I, Ic, Tabs, Sheet } from '../ui/kit'
import { venueOf, venueAddr, venueAllDay, mapsUrl, randomSeed, codeFrom } from '../core/voucherInfo'

type Kind = 'tour' | 'pack'
type Item = Tour | Pack
const isPack = (it: Item): it is Pack => 'inc' in it

function Credits({ it, i, onBook }: { it: Tour; i: number; onBook: (i: number) => void }) {
  return (
    <>
      <span className="eyebrow">{t('hrs', { h: it.h })} · ★ 4.9</span><h2 className="ct">{t(it.k)}</h2>
      <span className="licl"><Ic p={I.shield} s={14} />{t('licensed')}</span>
      {tourInfo(it.k) && <span className="small" style={{ fontWeight: 700 }}>{tourBy(it.k)}</span>}
      {tourInfo(it.k) && <span className="small" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><Ic p={I.pin} s={14} />{tourMeet(it.k)} · {t('city_' + tourInfo(it.k)!.city)} · {tourInfo(it.k)!.times.join(' / ')}</span>}
      <div className="crow" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="col" style={{ gap: 3, minWidth: 0 }}>
          <span className="row" style={{ gap: 8 }}><span className="strike" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}><span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{t('wasW')} </span>{t('walkIn')} {baht(it.walk)}</span><span className="savec" style={{ whiteSpace: 'nowrap' }}>{t('save', { p: baht(it.walk - it.price) })}</span></span>
          <span className="num" style={{ fontSize: 28, color: 'var(--gold2)' }}>{baht(it.price)}</span>
          {fx(it.price) && <span className="small num" data-tour-fx={i}>≈ {fx(it.price)} {t('perPerson')}</span>}
        </div>
        <span className="grow" />
        <button type="button" className="btn gold cbook" data-book={'t' + i} onClick={() => onBook(i)}>{t('bookTour')}</button>
      </div>
    </>
  )
}

/* Partner deals: partner name, a translated shelf label, a verified price (both numbers, dated source) and a plain disclosure.
   No "credit"/rebate badges, no internal notes, no off-peak pitch. */
const PNAME: Record<string, string> = { AIRALO: 'Airalo', SAILY: 'Saily', WELCOME_PICKUPS: 'Welcome Pickups', '12GO': '12Go', KIWITAXI: 'Kiwitaxi', CIVITATIS: 'Civitatis',
  KLOOK: 'Klook', AGODA: 'Agoda', BOOKING_COM: 'Booking.com', GETYOURGUIDE: 'GetYourGuide', TRIP_COM: 'Trip.com', GOWABI: 'GoWabi', HDMALL: 'HDmall', EATIGO: 'Eatigo',
  MCAIRPORT: 'Grab × Mastercard', GRAB_TRAVEL_PASS: 'Grab Travel Pass', KTC_KLOOK: 'KTC × Klook', FLINTSTONES_TAXI_PATTAYA: 'Flintstones Taxi Pattaya',
  PT_TAXI_PATTAYA: 'P.T. Taxi Pattaya', NAMS_LADY_DRIVERS: "Nam's Taxis (women drivers)", MUVMI_EV_TUKTUK: 'MuvMi EV tuk-tuk' }
/* Guests go to the partner's own site, never to an affiliate-programme or partner-terms page. */
const PURL: Record<string, string> = { AIRALO: 'https://www.airalo.com', SAILY: 'https://saily.com', WELCOME_PICKUPS: 'https://www.welcomepickups.com', '12GO': 'https://12go.asia',
  KIWITAXI: 'https://kiwitaxi.com', CIVITATIS: 'https://www.civitatis.com', KLOOK: 'https://www.klook.com', AGODA: 'https://www.agoda.com', BOOKING_COM: 'https://www.booking.com',
  GETYOURGUIDE: 'https://www.getyourguide.com', TRIP_COM: 'https://www.trip.com', EATIGO: 'https://eatigo.com' }
const partnerUrl = (d: DealSourceRecord): string | null => {
  if (PURL[d.source]) return PURL[d.source]
  const u = d.discountBasis.url
  return u && !/travelpayouts|partner|affiliate|agent\./i.test(u) ? u : null
}
const ESIM = new Set(['AIRALO', 'SAILY'])
const shelfKey = (d: DealSourceRecord): string => d.shelf === 'esim_transfers' ? (ESIM.has(d.source) ? 'sh_esim' : 'sh_ride')
  : ({ activities_tickets: 'sh_tickets', spa: 'sh_spa', health_wellness: 'sh_health', dining_offpeak: 'sh_dining', hotels_plain_link: 'sh_hotels' } as Record<string, string>)[d.shelf] || 'sh_tickets'
const dealPrice = (d: DealSourceRecord): string => { const b = d.discountBasis; return b.url && b.dated && b.gatePriceThb && b.portalPriceThb ? `${baht(b.gatePriceThb)} → ${baht(b.portalPriceThb)}` : '' }

/** The prototype's openBook(): dates, time + seats (or flight number for packs), guests per person, total, pay → done view. */
function BookSheet({ it, kind, onClose }: { it: Item; kind: Kind; onClose: () => void }) {
  const wk = it.k === 'pk2'
  // honest comparison: a tour's street price, a package's real separate total (0 = no saving shown)
  const cmp = isPack(it) ? packCompare(it) : it.walk
  const ds = useMemo(() => [0, 1, 2].map((i) => { const d = new Date(); if (wk) d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7) + i * 7); else d.setDate(d.getDate() + i + 1); return d }), [wk])
  const maxG = kind === 'pack' ? 4 : 8
  const times = kind === 'pack' ? [] : tourInfo(it.k)?.times || ((it as Tour).h >= 6 ? ['07:30'] : ['08:00', '13:00', '16:30'])
  const [g, setG] = useState(1), [di, setDi] = useState(0), [ti, setTi] = useState(0), [done, setDone] = useState(false), [flight, setFlight] = useState('')
  useEffect(() => { tick(0.6, 0.08) }, [])
  // Escape closes the sheet straight away, wherever the focus is
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  const step = (n: number) => { const v = Math.max(1, Math.min(maxG, g + n)); setG(v); tick(0.5 + v * 0.05, 0.05) }
  const paid = () => {
    update((st) => { st.bookings.unshift({ kind, k: it.k, img: it.img, date: ds[di], time: times[ti] || '', guests: g, amt: it.price * g, status: 'confirmed', paid_kind: 'partner' }) })
    // Kring never takes the tour money: open the partner's own checkout when it has one; otherwise the guest pays at the partner's counter
    const url = tourInfo(it.k)?.payUrl; if (url) window.open(url, '_blank', 'noopener')
    setDone(true); chime(); buzz([20, 30, 20])
  }
  if (done) return (
    <><div className="scrim" onClick={onClose} />
      <div className="donev"><svg className="chk" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" /><path d="M38 62l15 15 30-32" /></svg><b style={{ fontSize: 20 }}>{t('tourReserved')}</b><span className="small">{t(it.k)} · {g} × {baht(it.price)}</span><span className="small" style={{ textAlign: 'center', maxWidth: 300 }}>{t(tourInfo(it.k)?.payUrl ? 'tourPayOnline' : 'tourPayCounter', { co: payee(it.k), amt: baht(it.price * g) })}</span>
        <button className="btn gold" data-go="trips" data-how="r" style={{ width: 220 }}>{t('seeTrips')}</button><button className="btn ghost" style={{ width: 220 }} onClick={onClose}>{t('done')}</button></div></>
  )
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="bsheet glass" role="dialog" aria-modal="true" aria-label={t(it.k)} style={{ paddingTop: 18 }}><div className="handle" />
        <button type="button" className="ib" id="tour-sheet-close" aria-label={t('closeW')} onClick={onClose} style={{ position: 'absolute', top: 10, right: 10 }}><Ic p={I.close} s={18} /></button>
        <div className="row" style={{ paddingRight: 40 }}><img src={ph(it.img)} alt="" style={{ width: 96, aspectRatio: '16/9', borderRadius: 12, objectFit: 'cover', flex: 'none' }} /><div className="col"><b style={{ fontSize: 17 }}>{t(it.k)}</b><span className="licl"><Ic p={I.shield} s={14} />{t('licensed')}</span>{tourInfo(it.k) && <span className="small">{tourBy(it.k)}<br />{tourMeet(it.k)} · {t('city_' + tourInfo(it.k)!.city)}</span>}</div></div>
        {isPack(it) && <div className="incs">{it.inc.map((k) => <span key={k}><Ic p={I.check} s={12} sw={3} />{t(k)}</span>)}</div>}
        <div className="chips" role="group" aria-label={t('dateW')}>{ds.map((d, i) => <button key={i} type="button" className={`chip ${i === di ? 'on' : ''}`} aria-pressed={i === di} data-dd={i} onClick={() => { setDi(i); tick(0.5, 0.05) }}>{dayFmt(d, { weekday: 'short', day: 'numeric', month: 'short' })}{wk ? ' – ' + dayFmt(new Date(d.getTime() + 864e5), { weekday: 'short' }) : ''}</button>)}</div>
        {times.length
          ? <div className="chips" role="group" aria-label={t('timeW')}>{times.map((x, i) => <button key={x} type="button" className={`chip num ${i === ti ? 'on' : ''}`} aria-pressed={i === ti} data-tt={i} onClick={() => { setTi(i); tick(0.5, 0.05) }}>{x}</button>)}</div>
          : <label className="inp glass" style={{ height: 48 }}><input type="text" placeholder={t('flightNo')} aria-label={t('flightNo')} style={{ textTransform: 'uppercase' }} value={flight} onChange={(e) => setFlight(e.target.value.slice(0, 10))} /></label>}
        <div className="row"><span className="col grow" style={{ gap: 0 }}><span className="eyebrow">{t('guests')}</span><span className="small">{baht(it.price)} {t('perPerson')}</span></span>
          <div className="row" style={{ gap: 10 }}><button className="ib" data-g="-1" aria-label="−" onClick={() => step(-1)}>−</button><b className="num" id="gn" style={{ fontSize: 20, minWidth: 22, textAlign: 'center' }}>{g}</b><button className="ib" data-g="1" aria-label="+" onClick={() => step(1)}>+</button></div></div>
        <div className="line" style={{ fontSize: 17 }}><span style={{ color: '#fff', fontWeight: 700 }}>{t('total')}</span><span className="col" style={{ alignItems: 'flex-end', gap: 0 }}>{cmp > it.price && <span className="strike" style={{ fontSize: 12 }}>{baht(cmp * g)}</span>}<span className="num" style={{ color: 'var(--gold2)' }} id="gt">{baht(it.price * g)}</span>{fx(it.price) && <span className="small">≈ {fx(it.price * g)}</span>}</span></div>
        <span className="small" id="tour-direct">{t('tourDirect', { co: payee(it.k) })}</span>
        <button className="btn gold" data-paid="1" onClick={paid}><span>{t('tourReserve', { co: payee(it.k) })}</span></button>
      </div>
    </>
  )
}

function VMini({ v, i }: { v: Voucher; i: number }) {
  return (
    <button className="ticket mini" data-v={i} onClick={() => { S.vou = i; S.vouFrom = 'tours'; go('voucher', 'r') }}>
      <span className="stub">{v.img ? <img src={ph(v.img)} alt="" /> : <Ic p={I[v.ic!]} s={28} />}</span>
      <span className="vbody"><b>{t(v.k)}</b><span className="row" style={{ gap: 6, marginTop: 'auto' }}><span className="strike" style={{ fontSize: 12 }}>{baht(v.walk)}</span><span className="num" style={{ color: 'var(--gold2)', fontSize: 16 }}>{baht(v.price)}</span></span></span>
      <span className="off">−{Math.round((1 - v.price / v.walk) * 100)}%</span><span className="foil" style={{ animationDelay: `-${i * 0.8}s` }} />
    </button>
  )
}

/* ---- tours: Kring Cinema ---- */
function Tours() {
  useS()
  const F = TOURS
  const [ci, setCi] = useState(0)
  const [bk, setBk] = useState<{ it: Item; kind: Kind } | null>(null)
  const amb = useRef<HTMLDivElement>(null), flow = useRef<HTMLDivElement>(null), A = useRef<HTMLImageElement>(null), B = useRef<HTMLImageElement>(null)
  const bar = useRef<HTMLElement>(null), dust = useRef<HTMLCanvasElement>(null)
  const ctl = useRef({ ci: -1, lastUser: 0, stopped: false, autoAt: 0 })
  const root = useRef<HTMLDivElement>(null)
  /** the tour shown when the person put a finger on the credits: "Choose a day" opens exactly that one */
  const armed = useRef<{ i: number; at: number } | null>(null)
  const sheetOpen = useRef(false)
  sheetOpen.current = !!bk
  useEffect(() => {
    const fl = flow.current!, frames = Array.from(fl.querySelectorAll<HTMLElement>('.frame'))
    const c = ctl.current
    let showA = true, t0 = performance.now(), raf = 0, auto = true
    c.ci = -1; c.stopped = false
    const setActive = (i: number) => {
      if (i === c.ci) return
      c.ci = i; setCi(i)
      const nxt = showA ? B.current! : A.current!, prv = showA ? A.current! : B.current!
      nxt.src = bl(F[i].img); nxt.style.opacity = '1'; prv.style.opacity = '0'; showA = !showA
      if (!auto) { tick(0.45 + i * 0.1, 0.05); buzz(6) }
      auto = false; t0 = performance.now()
    }
    const layout = () => {
      const fr = fl.getBoundingClientRect(), cx = fr.left + fr.width / 2; let best = 0, bd = 1e9
      frames.forEach((f, i) => {
        const r = f.getBoundingClientRect(); const d = (r.left + r.width / 2 - cx) / r.width, ad = Math.min(Math.abs(d), 1.2)
        f.style.transform = `rotateY(${(-d * 16).toFixed(2)}deg) scale(${(1 - ad * 0.1).toFixed(3)})`; f.style.opacity = (1 - ad * 0.5).toFixed(3)
        if (Math.abs(d) < bd) { bd = Math.abs(d); best = i }
      })
      setActive(best)
    }
    const user = () => { c.lastUser = performance.now() }
    // any touch, scroll, key or focus on this screen stops the auto-advance for good: nothing moves while someone is about to tap
    const stop = (e: Event) => { if (e.type === 'focusin' && !(e.target as HTMLElement)?.matches?.('button, a, input')) return; if (c.stopped) return
      c.stopped = true; c.lastUser = performance.now(); if (bar.current) bar.current.style.width = '0%'
      // an auto-slide still moving: settle on the tour shown right now (the one the person is reaching for)
      if (performance.now() - c.autoAt < 1500 && frames[c.ci]) { const f = frames[c.ci]; fl.scrollTo({ left: f.offsetLeft - (fl.clientWidth - f.offsetWidth) / 2, behavior: 'auto' }) }
    }
    fl.addEventListener('scroll', layout, { passive: true })
    const evs = ['pointerdown', 'wheel', 'touchstart'] as const
    evs.forEach((ev) => fl.addEventListener(ev, user, { passive: true }))
    const rootEl = root.current
    const sevs = ['pointerdown', 'touchstart', 'wheel', 'keydown', 'focusin'] as const
    sevs.forEach((ev) => rootEl?.addEventListener(ev, stop, { passive: true }))
    layout()
    const cv = dust.current!, cx = cv.getContext('2d')
    const r = amb.current!.getBoundingClientRect(), W = r.width || 390, H = r.height || 844, DPR = Math.min(2, devicePixelRatio || 1)
    cv.width = W * DPR; cv.height = H * DPR
    const P = Array.from({ length: RM ? 0 : 22 }, () => ({ x: rand(0, W), y: rand(0, H), s: rand(0.6, 2.2), v: rand(4, 16), p: rand(0, 6), g: Math.random() < 0.7 }))
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      const p = Math.min(1, (now - t0) / 6500); if (bar.current && !c.stopped) bar.current.style.width = (p * 100).toFixed(1) + '%'
      if (!RM && !c.stopped && !sheetOpen.current && p >= 1 && now - c.lastUser > 4000) {
        const n = (c.ci + 1) % frames.length; auto = true; c.autoAt = now
        fl.scrollTo({ left: frames[n].offsetLeft - (fl.clientWidth - frames[n].offsetWidth) / 2, behavior: n === 0 ? 'auto' : 'smooth' }); t0 = now
      }
      if (cx) {
        cx.setTransform(DPR, 0, 0, DPR, 0, 0); cx.clearRect(0, 0, W, H)
        for (const d of P) {
          d.y -= d.v * dt; d.x += Math.sin(now / 1800 + d.p) * 0.12; if (d.y < -10) { d.y = H + 10; d.x = rand(0, W) }
          cx.globalAlpha = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(now / 600 + d.p)); cx.fillStyle = d.g ? '#FFD067' : '#9AA4FF'; cx.beginPath(); cx.arc(d.x, d.y, d.s, 0, Math.PI * 2); cx.fill()
        }
        cx.globalAlpha = 1
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); fl.removeEventListener('scroll', layout); evs.forEach((ev) => fl.removeEventListener(ev, user)); sevs.forEach((ev) => rootEl?.removeEventListener(ev, stop)) }
  }, [F])
  const frameClick = (i: number, f: HTMLElement) => {
    const fl = flow.current!
    if (i !== ctl.current.ci) { ctl.current.lastUser = performance.now(); fl.scrollTo({ left: f.offsetLeft - (fl.clientWidth - f.offsetWidth) / 2, behavior: 'smooth' }) }
    else setBk({ it: F[i], kind: 'tour' })
  }
  return (
    <>
      <div className="amb" ref={amb}><img className="ambA" ref={A} src={bl(F[0].img)} alt="" /><img className="ambB" ref={B} src={bl(F[0].img)} alt="" /><span className="ambv" /><canvas className="dust" ref={dust} /><span className="grain" /></div>
      <span className="ctop" />
      <div className="cscroll" ref={root}>
        <div className="ctitle" style={{ paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))', alignItems: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{t('t_deals')}</h1>
          <button
            type="button"
            className="chip"
            id="deals-vouchers-top-btn"
            data-go="vouchers"
            style={{ height: 36, padding: '0 13px', fontSize: 13.5, fontWeight: 600, background: '#0F1226', color: '#FFD067' }}
          >
            <Ic p={I.gift} s={15} /> {t('d_vouch')}
          </button>
        </div>
        <div className="flow" ref={flow}>{F.map((it, i) => (
          <button key={it.k} className={`frame ${i === ci ? 'on' : ''}`} data-i={i} aria-label={t(it.k)} onClick={(e) => frameClick(i, e.currentTarget)}>
            <span className="fimg"><img className="kb2" src={ph(it.img)} alt="" style={{ animationDelay: `-${i * 3}s` }} /></span><span className="fshine" /><span className="fref"><img src={ph(it.img)} alt="" /></span>
          </button>))}</div>
        <div className="fprog"><i ref={bar} /></div><div className="fdots">{F.map((_, i) => <i key={i} className={i === ci ? 'on' : ''} />)}</div>
        <div className="credits" key={ci} onPointerDown={() => { armed.current = { i: ctl.current.ci, at: performance.now() } }}>
          <Credits it={F[ci]} i={ci} onBook={(i) => { const a = armed.current; armed.current = null; setBk({ it: F[a && performance.now() - a.at < 2000 ? a.i : i], kind: 'tour' }) }} /></div>
        <div style={{ padding: '14px 16px 0' }}><PassEntry id="deals-pass" /></div>
        <div className="rail-h"><b>{t('d_packs')}</b><span className="small">{PACKS.length}</span></div>
        <div className="rail">{PACKS.map((p, i) => (
          <button key={p.k} className="pcard2" data-pk={i} onClick={() => setBk({ it: p, kind: 'pack' })}><span className="pimg2"><img src={ph(p.img)} alt="" /><span className="pprice num">{baht(p.price)}</span></span><b>{t(p.k)}</b>{fx(p.price) && <span className="small num" data-pack-fx={i}>≈ {fx(p.price)}</span>}<span className="small">{p.inc.map((k) => t(k)).slice(0, 3).join(' · ')}</span>{packCompare(p) > 0 && <span className="small" style={{ color: 'var(--gold2)', fontWeight: 700 }}>{t('save', { p: baht(packCompare(p) - p.price) })}</span>}</button>))}</div>
        <div className="rail-h"><b>{t('d_vouch')}</b><button className="small" data-go="vouchers" style={{ color: 'var(--gold2)', fontWeight: 700 }}>{t('seeAll')} ›</button></div>
        <div className="rail">{VOUCH.slice(0, 4).map((v, i) => <VMini key={v.k} v={v} i={i} />)}</div>
        <div className="rail-h" style={{ marginTop: 14 }}><h2 style={{ fontSize: 'inherit', fontWeight: 800, margin: 0 }}>{t('partnersH')}</h2><span className="small">{KR6_DEALS_SOURCES_27OCT.filter((d) => d.enabledForLaunch && partnerUrl(d)).length}</span></div>
        <div className="col" style={{ padding: '0 16px', gap: 8 }}>
          {KR6_DEALS_SOURCES_27OCT.filter((d) => d.enabledForLaunch && partnerUrl(d)).map((d) => {
            const nm = PNAME[d.source] || d.source.replace(/_/g, ' ')
            const pr = dealPrice(d)
            return (
              <a key={d.source} href={partnerUrl(d)!} target="_blank" rel="noopener noreferrer sponsored" className="glass row" data-deal-source={d.source}
                style={{ padding: '10px 12px', borderRadius: 14, gap: 10, textDecoration: 'none', color: 'inherit', alignItems: 'flex-start' }}>
                <div className="col grow" style={{ gap: 3 }}>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 13.5, color: '#fff' }}>{nm}</b>
                    <span className="chip" style={{ height: 22, fontSize: 11, padding: '0 8px' }}>{t(shelfKey(d))}</span>
                  </div>
                  {pr && <span className="small" style={{ color: 'var(--gold2)', fontWeight: 600 }}>{pr}</span>}
                  <span className="small" style={{ fontSize: 11, opacity: 0.78 }}>{t('partnerSold', { p: nm })}</span>
                </div>
                <Ic p={I.chev} s={16} />
              </a>
            )
          })}
        </div>
        <p className="small" style={{ padding: '8px 24px 0', textAlign: 'center' }}>{t('voucherNote')}</p>
      </div>
      <Tabs active="tours" />
      {bk && <BookSheet key={bk.it.k} it={bk.it} kind={bk.kind} onClose={() => setBk(null)} />}
    </>
  )
}

/* ---- vouchers ---- */
function Vouchers() {
  useS()
  const open = (i: number) => { S.vou = i; S.vouFrom = 'vouchers'; go('voucher', 'r') }
  return (
    <>
      <div className="vlist" style={{ paddingTop: 110 }}>{VOUCH.map((v, i) => (
        <button key={v.k} className="ticket" data-v={i} style={{ animation: `riseIn .6s ${i * 0.07}s both` }} onClick={() => open(i)}>
          <span className="stub">{v.img ? <img src={ph(v.img)} alt="" /> : <Ic p={I[v.ic!]} s={34} />}</span>
          <span className="vbody"><b>{t(v.k)}</b><span className="small">{t('validFor', { d: v.days })}</span><span className="row" style={{ gap: 8, marginTop: 'auto' }}><span className="strike" style={{ fontSize: 12.5 }}>{baht(v.walk)}</span><span className="num" style={{ color: 'var(--gold2)', fontSize: 18 }}>{baht(v.price)}</span></span></span>
          <span className="off">−{Math.round((1 - v.price / v.walk) * 100)}%</span><span className="foil" style={{ animationDelay: `-${i * 0.8}s` }} />
        </button>))}
        <p className="small" style={{ textAlign: 'center', margin: '4px 10px 0' }}>{t('voucherNote')}</p></div>
      <div className="vhead"><div className="topb"><button className="ib" data-go="tours" data-how="l" aria-label="Back"><Ic p={I.back} /></button><h1 className="h2 grow">{t('d_vouch')}</h1></div></div>
      <Tabs active="vouchers" />
    </>
  )
}

/* ---- voucher ---- */
/** Personal code: a random seed per voucher (stored with the voucher state), never a counter or the person's name. */
const vCode = (v: Voucher): string => codeFrom(v.code, S.vc[VOUCH.indexOf(v)] || 0)
function QR({ code }: { code: string }) {
  const N = 25, s = 6
  const cells = useMemo(() => {
    let h = 0; for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0
    const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296 }
    const fin = (x: number, y: number) => (x < 7 && y < 7) || (x >= N - 7 && y < 7) || (x < 7 && y >= N - 7)
    const out: [number, number][] = []
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let on: boolean
      if (fin(x, y)) { const fx2 = x >= N - 7 ? x - (N - 7) : x, fy = y >= N - 7 ? y - (N - 7) : y; on = fx2 === 0 || fx2 === 6 || fy === 0 || fy === 6 || (fx2 >= 2 && fx2 <= 4 && fy >= 2 && fy <= 4) } else on = rnd() < 0.48
      if (on) out.push([x, y])
    }
    return out
  }, [code])
  return <svg className="qr" viewBox={`0 0 ${N * s} ${N * s}`} width="170" height="170" role="img" aria-label="Voucher code">{cells.map(([x, y]) => <rect key={y * N + x} x={x * s} y={y * s} width={s} height={s} fill="#05060D" style={{ animationDelay: `${y * 40 + x * 4}ms` }} />)}</svg>
}
function VoucherScr() {
  const s = useS()
  const vi = VOUCH[s.vou] ? s.vou : 0
  const v = VOUCH[vi]
  const used = !!s.vu[vi]
  // a random seed the first time this voucher is opened (and for codes made by older versions from a counter)
  useEffect(() => { if (!((S.vc[vi] || 0) > 1e6)) update((st) => { st.vc[vi] = randomSeed() }) }, [vi])
  const code = vCode(v)
  const venue = venueOf(v.k)
  const [copied, setCopied] = useState(false)
  const [ask, setAsk] = useState<null | 'use' | 'new'>(null)
  const [undoLeft, setUndoLeft] = useState(0)
  const tmr = useRef<ReturnType<typeof setTimeout>>(undefined)
  const utmr = useRef<ReturnType<typeof setInterval>>(undefined)
  useEffect(() => () => { clearTimeout(tmr.current); clearInterval(utmr.current) }, [])
  const copy = () => {
    try { void navigator.clipboard.writeText(code).catch(() => {}) } catch { /* ignore */ }
    setCopied(true); chime(); buzz(15); clearTimeout(tmr.current); tmr.current = setTimeout(() => setCopied(false), 2200)
  }
  const use = () => {
    setAsk(null); update((st) => { st.vu[vi] = true }); tick(0.6, 0.06)
    // 10 seconds to undo a mistaken tap
    setUndoLeft(10); clearInterval(utmr.current)
    utmr.current = setInterval(() => setUndoLeft((n) => { if (n <= 1) { clearInterval(utmr.current); return 0 } return n - 1 }), 1000)
  }
  const undo = () => { clearInterval(utmr.current); setUndoLeft(0); update((st) => { st.vu[vi] = false }); tick(0.5, 0.05) }
  const bad = () => { setAsk(null); clearInterval(utmr.current); setUndoLeft(0); update((st) => { st.vc[vi] = randomSeed(); st.vu[vi] = false }); toast(t('vNew')); bell(0.2, 1568) }
  const hours = venue ? (venueAllDay(venue) ? t('vOpen24') : t('vHours', { h: venue.open + '–' + venue.close })) : ''
  return (
    <>
      <div className="topb"><button className="ib" data-go={s.vouFrom || 'vouchers'} data-how="l" aria-label="Back"><Ic p={I.back} /></button><div className="grow" /></div>
      <div className="scroll"><div className="vt"><span className="foil" />
        <div className="vtop"><span className="stub" style={{ width: 64, height: 64, borderRadius: 18, border: 0 }}>{v.img ? <img src={ph(v.img)} alt="" /> : <Ic p={I[v.ic!]} s={30} />}</span>
          <div className="col grow"><b style={{ fontSize: 17 }}>{t(v.k)}</b><span className="row" style={{ gap: 8 }}><span className="strike">{baht(v.walk)}</span><span className="num" style={{ color: 'var(--gold2)', fontSize: 20 }}>{baht(v.price)}</span></span></div></div>
        <div className="vperf" />
        <div className="vbot"><QR code={code} /><span className="code" id="code">{code}</span><span className={`chip ${used ? '' : 'goldc'}`} id="vstate" style={{ height: 26, fontSize: 11.5 }}>{used ? t('vUsed') : t('vUnused')}</span><span className="small">{t('showCounter')} · {t('validFor', { d: v.days })}</span></div>
        {/* Money claim: the guest pays the venue at its own till; Kring takes no money for vouchers. */}
        <div style={{ margin: '10px 14px 0', padding: '12px 14px', borderRadius: 12, background: 'rgba(16, 185, 129, 0.16)', border: '1px solid #34d399', fontSize: 13.5, lineHeight: 1.45, fontWeight: 600, color: '#ecfdf5' }}>
          {t('vPayTill', { price: baht(v.price), walk: baht(v.walk) })}
        </div>
        </div>
        <div className="pad col" style={{ gap: 10, marginTop: 16, paddingBottom: 40 }}>
          {venue && (
            <div className="glass card col" id="vvenue" style={{ gap: 6 }}>
              <span className="eyebrow">{t('vWhere')}</span>
              <b style={{ fontSize: 16 }}>{venue.name}</b>
              <span className="row" style={{ gap: 6, alignItems: 'flex-start' }}><span style={{ color: 'var(--gold2)', flex: 'none' }}><Ic p={I.pin} s={16} /></span><span className="small" style={{ color: 'var(--ink2, #C9CDE6)' }}>{venueAddr(venue)}</span></span>
              <span className="row" style={{ gap: 6, alignItems: 'center' }}><span style={{ color: 'var(--gold2)', flex: 'none' }}><Ic p={I.clock} s={16} /></span><span className="small" id="vhours" style={{ color: 'var(--ink2, #C9CDE6)' }}>{hours}</span></span>
              <a className="btn ghost" id="vmap" href={mapsUrl(venue)} target="_blank" rel="noopener noreferrer" style={{ height: 44, textDecoration: 'none', marginTop: 4 }}><Ic p={I.pin} s={16} />{t('vMaps')}</a>
            </div>
          )}
          <button className="btn gold" id="copy" disabled={used} onClick={copy}>{copied ? t('copied') + ' ✓' : t('copyCode')}</button>
          {undoLeft > 0 && (
            <div className="glass card row" id="vundo" role="status" style={{ gap: 10, alignItems: 'center' }}>
              <span className="grow small" style={{ color: '#fff', fontWeight: 700 }}>{t('vUsedNow')}</span>
              <button type="button" className="btn ghost" id="vundo-btn" style={{ width: 'auto', height: 40, padding: '0 16px' }} onClick={undo}>{t('vUndo', { n: undoLeft })}</button>
            </div>
          )}
          <div className="row" style={{ gap: 10 }}><button className="btn ghost" id="vuse" style={{ flex: 1, fontSize: 14 }} disabled={used} onClick={() => setAsk('use')}>{t('vUse')}</button><button className="btn ghost" id="vbad" style={{ flex: 1, fontSize: 14 }} onClick={() => setAsk('new')}>{t('vProblem')}</button></div>
          <p className="small" style={{ textAlign: 'center' }}>{t('voucherNote')}</p></div></div>
      <Sheet open={ask === 'use'} onClose={() => setAsk(null)} label={t('vUseQ')}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{t('vUseQ')}</h2>
        <span className="small">{t('vUseWhy')}</span>
        <button type="button" className="btn gold" id="vuse-yes" onClick={use}>{t('vUseYes')}</button>
        <button type="button" className="btn ghost" onClick={() => setAsk(null)}>{t('vNotYet')}</button>
      </Sheet>
      <Sheet open={ask === 'new'} onClose={() => setAsk(null)} label={t('vNewQ')}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{t('vNewQ')}</h2>
        <span className="small">{t('vNewWhy')}</span>
        <button type="button" className="btn gold" id="vnew-yes" onClick={bad}>{t('vNewYes')}</button>
        <button type="button" className="btn ghost" onClick={() => setAsk(null)}>{t('vNotYet')}</button>
      </Sheet>
    </>
  )
}

register(
  { id: 'tours', flow: 't', title: 'Deals', C: Tours },
  { id: 'vouchers', flow: 't', title: 'Deals · Vouchers', C: Vouchers },
  { id: 'voucher', flow: 't', title: 'Voucher', C: VoucherScr },
)
