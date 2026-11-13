/* On the way · The bump · Rate & next. Ported from the approved prototype (reference/prototype/app.js). */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { S, update, useS } from '../core/store'
import { t, ini, baht, ease, rand, pick, RM, aTitle } from '../core/data'
import { register, go, toast } from '../core/router'
import { api, live, ApiError, ERR_KEYS } from '../core/api'
import { dayOf, dayBooking, guestCode, hostCode, activityEnded, tripText, smsTo, rpcBookingId, herePosition } from '../core/dayof'
import { previewOnly } from '../core/auth'
import { ac, bell, tick, buzz } from '../core/sound'
import { I, Ic, Av, Sheet } from '../ui/kit'

/* "How late?" sheet body, shared by On the way. */
function LateSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (m: number) => void }) {
  return (
    <Sheet open={open} onClose={onClose}>
      <b style={{ fontSize: 18 }}>{t('lateQ')}</b>
      <div className="chips">{[5, 10, 15, 20, 30].map((m) => <button key={m} className="chip num" onClick={() => onPick(m)}>{m} min</button>)}</div>
      <span className="small">{t('graceRule')}</span>
    </Sheet>
  )
}

/* ---------- send my trip to my emergency contact ----------
   Kring has no live-tracking server, so we never claim one. This opens the guest's own messages app with a text to
   the emergency contact saved in Settings (and nobody else): activity, host, meeting point, time, booking ref, and,
   only if the guest allows it, where they are right now (one position, not tracking). */
export function TripShareSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useS()
  const [busy, setBusy] = useState(false)
  const name = s.prof.emName.trim(), phone = s.prof.emPhone.trim()
  const send = (here: { lat: number; lng: number } | null) => {
    const href = smsTo(phone, tripText(dayOf(), here))
    setBusy(false); onClose()
    try { window.location.href = href } catch { /* ignore */ }
    tick(0.8, 0.06)
  }
  const go2 = (withHere: boolean) => {
    if (!withHere || !('geolocation' in navigator)) { send(null); return }
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      (p) => send({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => { toast(t('tripNoLoc')); send(null) },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  }
  return (
    <Sheet open={open} onClose={onClose}>
      <b style={{ fontSize: 18 }}>{t('tripSendTitle', { name })}</b>
      <span className="small" id="tripSendBody" style={{ lineHeight: 1.5 }}>{t('tripSendBody', { name, phone })}</span>
      <button className="btn gold" id="tripSendHere" disabled={busy} onClick={() => go2(true)}>{busy ? <span className="spin" /> : t('tripSendWithHere')}</button>
      <button className="btn ghost" id="tripSendNoHere" disabled={busy} onClick={() => go2(false)}>{t('tripSendNoHere')}</button>
    </Sheet>
  )
}

/** "Send my trip to {name}" or, without a saved contact, "Add emergency contact". */
export function TripShareButton({ id = 'share' }: { id?: string }) {
  const s = useS()
  const [open, setOpen] = useState(false)
  const hasContact = !!(s.prof.emName.trim() && s.prof.emPhone.trim())
  if (!hasContact) return <button className="btn ghost" id={id} data-go="settings" data-how="r">{t('shareAdd')}</button>
  return (
    <>
      <button className="btn ghost" id={id} onClick={() => { setOpen(true); tick(0.6, 0.06) }}><Ic p={I.send} s={16} />{t('tripSendBtn', { name: s.prof.emName.trim() })}</button>
      <TripShareSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/* ---------- onway ---------- */
function OnWay() {
  useS()
  const d = dayOf()
  const { host: h, time, end, meet, meetTh, area, addr, addrTh, hint, maps, pending, payHost } = d
  const hd = useRef<HTMLSpanElement>(null)
  const [late, setLate] = useState(false)
  useEffect(() => {
    // decorative radar only: we do not claim a live distance to the host
    let raf = 0
    const t0 = performance.now(), ang = -0.9
    const f = (now: number) => {
      const p = Math.min(1, (now - t0) / 8000), e = ease(p), r = 110 - e * 70
      if (hd.current) hd.current.style.transform = `translate(${(Math.cos(ang + e * 0.6) * r).toFixed(1)}px,${(Math.sin(ang + e * 0.6) * r * 0.5).toFixed(1)}px)`
      if (p < 1) raf = requestAnimationFrame(f)
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <>
      <div className="topb"><button className="ib" data-go={S.from.onway && !['onway', 'bump', 'checkin', 'rate'].includes(S.from.onway) ? S.from.onway : 'chat'} data-how="l" aria-label="Back"><Ic p={I.back} /></button><div className="grow" /><button className="ib num" style={{ color: 'var(--street)', fontSize: 11 }} data-go="safety" aria-label="SOS">SOS</button></div>
      <div className="scroll"><div className="pad col" style={{ gap: 12, paddingBottom: 24 }}>
        <div className="col" style={{ gap: 6 }}>
          <span className="eyebrow num">{t('meetPoint')} · {time}–{end}</span>
          <h1 className="h1" id="away">{t('owHead', { place: meet })}</h1>
          {pending
            ? <p className="lead" id="owPending" style={{ color: 'var(--anchan2)', display: 'flex', gap: 8, alignItems: 'center' }}><span className="live" />{t('waitHost', { host: h })}</p>
            : <p className="lead" id="hint">{t('owWait', { host: h, time })}</p>}
        </div>
        <div className="glass card col" id="owPlace" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <Ic p={I.pin} s={20} />
            <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
              <b id="owPlaceName">{meet}</b>
              {addr ? <span className="small" id="owAddr" style={{ lineHeight: 1.45 }}>{addr}</span> : <span className="small" id="owArea">{area}</span>}
              {hint && <span className="small" id="owHint" style={{ lineHeight: 1.45, color: 'var(--gold2)' }}>{hint}</span>}
            </span>
          </div>
          {(meetTh || addrTh) && (
            <div className="small" id="owPlaceTh" style={{ lineHeight: 1.5, padding: '8px 10px', borderRadius: 12, background: 'rgba(255,255,255,.06)' }}>
              <span style={{ color: 'var(--ink2)' }}>{t('owDriver')}:</span>{' '}
              <b lang="th" style={{ color: '#fff' }}>{[meetTh, addrTh].filter(Boolean).join(' · ')}</b>
            </div>
          )}
          <a className="btn ghost" id="owMaps" href={maps} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}><Ic p={I.pin} s={16} />{t('mpMaps')}</a>
        </div>
        {pending && <span className="small" id="owPendingNote" style={{ lineHeight: 1.5 }}>{t('owPendingNote', { host: h })} {t('owPendingCancel', { host: h })}</span>}
        <div className="glass card col" id="owPlan" style={{ gap: 10 }}>
          <span className="eyebrow">{t('owPlanT')}</span>
          <ol className="col" style={{ gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
            <li className="row small" style={{ gap: 10, alignItems: 'baseline', lineHeight: 1.45 }}><b className="num" style={{ flex: 'none', minWidth: 46 }}>{time}</b><span>{t('planMeet', { host: h, place: meet })}</span></li>
            <li className="row small" style={{ gap: 10, alignItems: 'baseline', lineHeight: 1.45 }}><b className="num" style={{ flex: 'none', minWidth: 46 }} aria-hidden="true">·</b><span>{payHost > 0 ? t('planPay', { host: h, amt: baht(payHost) }) : t('ckPayNone', { host: h })}</span></li>
            <li className="row small" style={{ gap: 10, alignItems: 'baseline', lineHeight: 1.45 }}><b className="num" style={{ flex: 'none', minWidth: 46 }}>{end}</b><span>{t('planEnd', { act: aTitle(d.a) })}</span></li>
          </ol>
        </div>
        <div className="rule2"><Ic p={I.shield} s={18} /><span>{t('s2')}</span></div>
        <div className="radarbox" style={{ height: 150 }} aria-hidden="true"><span className="sweep" />{[60, 120, 180, 240].map((sz) => <span key={sz} className="rr" style={{ width: sz, height: sz }} />)}<span className="you" /><span className="hdot" id="hd" ref={hd}><span>{ini(h)}</span></span></div>
      </div></div>
      <div className="footer dock">
        <div className="chips" style={{ justifyContent: 'center', flexWrap: 'wrap', overflow: 'visible' }}>
          <button className="chip" id="late" style={{ fontSize: 12.5, height: 34 }} onClick={() => { setLate(true); tick(0.6, 0.07) }}><Ic p={I.clock} s={15} />{t('late')}</button>
          {!pending && <button className="chip" id="nophone" data-go="bump" data-how="f" style={{ fontSize: 12.5, height: 'auto', minHeight: 34, whiteSpace: 'normal', textAlign: 'left' }} onClick={() => { S.code = true }}><Ic p={I.lock} s={15} />{t('noPhone')}</button>}
        </div>
        <TripShareButton />
        {pending
          ? <button className="btn gold" id="here" disabled>{t('owCheckinLater')}</button>
          : <button className="btn gold ready" id="here" data-go="bump" data-how="f" onClick={() => { S.code = false }}>{t('bumpNow')}</button>}
      </div>
      <LateSheet open={late} onClose={() => setLate(false)} onPick={(mm) => { void api.runningLate(rpcBookingId(d.b), mm).catch(() => {}); update((s) => { s.late = mm }); setLate(false); toast(t('lateSent', { host: h, m: mm })); bell(0.2, 1319) }} />
    </>
  )
}

/* ---------- bump ---------- */
interface Coin { x: number; y: number; vx: number; vy: number; r: number; rot: number; vr: number; age: number; a: number; T?: [number, number] }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; age: number; c: string }
interface Wave { r: number; a: number; c: string; d?: number }

function Bump() {
  useS()
  const d = dayOf()
  const { host: h, place, payHost, ref } = d
  const fxRef = useRef<HTMLCanvasElement>(null)
  const holdRef = useRef<HTMLButtonElement>(null)
  const cinRef = useRef<HTMLInputElement>(null)
  const contactRef = useRef<() => boolean>(() => false)
  const [burst, setBurst] = useState(false)
  const [kring, setKring] = useState(false)
  const [rc, setRc] = useState(false)
  const [cp, setCp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [codeErr, setCodeErr] = useState(false)
  const code = guestCode(ref)
  const expected = hostCode(ref)

  useEffect(() => {
    const fx = fxRef.current!, fc = fx.getContext('2d')!, hold = holdRef.current!
    const r0 = (fx.parentElement || fx).getBoundingClientRect()
    const W = r0.width, H = r0.height, DPR = Math.min(2, devicePixelRatio || 1)
    fx.width = W * DPR; fx.height = H * DPR
    const R0 = Math.min(W * 0.16, 80), CX = W / 2, CY = H * 0.45
    let prog = 0, phase: 'idle' | 'burst' | 'done' = 'idle', flash = 0, shake = 0, contactAt = 0
    let coins: Coin[] = [], sparks: Spark[] = [], waves: Wave[] = []
    const m = Math.max(W, H)
    const dust = Array.from({ length: RM ? 40 : 150 }, () => ({ a: rand(0, 6.283), r: rand(R0, m * 0.75), s: rand(0.6, 2), sp: rand(0.03, 0.12) * (Math.random() < 0.5 ? -1 : 1), c: pick(['#7381FF', '#3446FF', '#FFD067', '#E8EBFF']) }))
    const sep = (p: number) => R0 * (0.62 + (1 - ease(p)) * 1.0)
    const circle = (x: number, y: number, r: number) => { fc.beginPath(); fc.arc(x, y, Math.max(0, r), 0, Math.PI * 2) }
    const tms: ReturnType<typeof setTimeout>[] = []

    function contact(now: number) {
      phase = 'burst'; prog = 1; contactAt = now; bell(0.6); buzz([35, 40, 90]); flash = 1
      waves.push({ r: R0 * 0.4, a: 1, c: '#9B5CFF' }, { r: R0 * 0.2, a: 1, c: '#FFD067', d: 0.12 }, { r: R0 * 0.1, a: 0.8, c: '#7381FF', d: 0.24 })
      for (let i = 0; i < (RM ? 30 : 120); i++) { const an = rand(0, 6.283), sp = rand(220, 720); coins.push({ x: CX, y: CY, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 260, r: rand(5, 10.5), rot: rand(0, 6.283), vr: rand(-14, 14), age: 0, a: 1 }) }
      for (let i = 0; i < (RM ? 20 : 80); i++) { const an = rand(0, 6.283), sp = rand(300, 900); sparks.push({ x: CX, y: CY, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: rand(0.4, 0.9), age: 0, c: pick(['#7381FF', '#9B5CFF', '#FFFFFF', '#FFD067']) }) }
      setBurst(true)
      tms.push(setTimeout(() => setKring(true), 260))
      tms.push(setTimeout(() => { setRc(true); bell(0.18, 1760) }, 1250))
    }
    contactRef.current = () => { if (phase === 'burst' || phase === 'done') return false; contact(performance.now()); return true }

    // check-in is a normal tap (see onTap); the canvas only animates
    hold.style.setProperty('--p', '0')

    let raf = 0, last = performance.now()
    const you = t('you')
    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; const tt = now / 1000
      shake = Math.max(0, shake - dt * 20)
      fc.setTransform(DPR, 0, 0, DPR, 0, 0); fc.fillStyle = '#05060D'; fc.fillRect(0, 0, W, H)
      const neb = fc.createRadialGradient(CX, CY, 0, CX, CY, m * 0.6)
      neb.addColorStop(0, `rgba(155,92,255,${0.14 + prog * 0.22 + flash * 0.3})`); neb.addColorStop(0.45, `rgba(52,70,255,${0.06 + prog * 0.08})`); neb.addColorStop(1, 'rgba(5,6,13,0)')
      fc.fillStyle = neb; fc.fillRect(0, 0, W, H)
      fc.translate((Math.random() * 2 - 1) * shake, (Math.random() * 2 - 1) * shake)
      for (const d of dust) {
        d.a += d.sp * dt * (1 + prog * 6); if (d.r < R0 * 0.3) d.r = rand(m * 0.5, m * 0.8)
        fc.globalAlpha = 0.25 + prog * 0.5; fc.fillStyle = d.c; fc.fillRect(CX + Math.cos(d.a) * d.r, CY + Math.sin(d.a) * d.r * 0.8, d.s, d.s)
      }
      fc.globalAlpha = 1
      const s = sep(prog), ax = CX - s, bx = CX + s, lw = R0 * 0.17, br = phase === 'idle' ? Math.sin(tt * 2.4) * 1.5 : 0
      fc.lineWidth = lw; fc.shadowBlur = 28 + prog * 20; fc.shadowColor = '#3446FF'; fc.strokeStyle = '#7381FF'; circle(ax - br, CY, R0); fc.stroke()
      fc.shadowColor = '#FFB21E'; fc.strokeStyle = '#FFB21E'; circle(bx + br, CY, R0); fc.stroke(); fc.shadowBlur = 0
      if (2 * s < 2 * R0 + lw) {
        // violet only inside the lens where the two rings overlap
        fc.save(); circle(ax, CY, R0 + lw / 2); fc.clip(); fc.strokeStyle = '#9B5CFF'; fc.lineWidth = lw; circle(bx, CY, R0); fc.stroke()
        fc.globalAlpha = 0.16 + flash * 0.7; fc.fillStyle = '#9B5CFF'; circle(bx, CY, R0); fc.fill(); fc.restore()
        fc.save(); circle(bx, CY, R0 + lw / 2); fc.clip(); fc.strokeStyle = '#9B5CFF'; fc.lineWidth = lw; circle(ax, CY, R0); fc.stroke(); fc.restore()
      }
      fc.font = '600 13px "Plus Jakarta Sans","Noto Sans Thai","Noto Sans",sans-serif'; fc.textAlign = 'center'; fc.fillStyle = '#9AA0BF'
      fc.fillText(you, ax, CY + R0 + lw + 20); fc.fillText(h, bx, CY + R0 + lw + 20)
      for (const w of waves) {
        if (w.d && w.d > 0) { w.d -= dt; continue }
        w.r += dt * R0 * 6; w.a -= dt * 1.3
        if (w.a > 0) { fc.globalAlpha = w.a; fc.strokeStyle = w.c; fc.lineWidth = 3 + w.a * 5; circle(CX, CY, w.r); fc.stroke() }
      }
      waves = waves.filter((w) => w.a > 0); fc.globalAlpha = 1
      for (const p of sparks) {
        p.age += dt; p.vx *= 0.93; p.vy *= 0.93; p.x += p.vx * dt; p.y += p.vy * dt; const k = 1 - p.age / p.life; if (k <= 0) continue
        fc.globalAlpha = k; fc.strokeStyle = p.c; fc.lineWidth = 2; fc.beginPath(); fc.moveTo(p.x, p.y); fc.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); fc.stroke()
      }
      sparks = sparks.filter((p) => p.age < p.life); fc.globalAlpha = 1
      for (const c of coins) {
        c.age += dt; c.rot += c.vr * dt
        if (c.age < 0.9) { c.vy += 900 * dt; c.vx *= 0.99 } else {
          // sparks settle into the middle, where the two rings meet
          const Tg = c.T || [CX, CY]; c.vx += (Tg[0] - c.x) * 14 * dt; c.vy += (Tg[1] - c.y) * 14 * dt; c.vx *= 0.9; c.vy *= 0.9
          if (Math.hypot(Tg[0] - c.x, Tg[1] - c.y) < R0 * 0.7) c.a -= dt * 4
        }
        c.x += c.vx * dt; c.y += c.vy * dt; if (c.a <= 0) continue
        const cs = Math.cos(c.rot), rx = Math.max(0.8, c.r * Math.abs(cs))
        fc.globalAlpha = Math.max(0, c.a); fc.fillStyle = cs > 0 ? '#FFD067' : '#E39C14'; fc.beginPath(); fc.ellipse(c.x, c.y, rx, c.r, 0, 0, Math.PI * 2); fc.fill(); fc.strokeStyle = '#FFB21E'; fc.lineWidth = 1; fc.stroke()
      }
      coins = coins.filter((c) => c.a > 0 && c.y < H + 80); fc.globalAlpha = 1
      if (flash > 0) {
        fc.setTransform(DPR, 0, 0, DPR, 0, 0)
        const fl = fc.createRadialGradient(CX, CY, 0, CX, CY, m * 0.7)
        fl.addColorStop(0, `rgba(255,255,255,${flash * 0.85})`); fl.addColorStop(0.25, `rgba(155,92,255,${flash * 0.55})`); fl.addColorStop(1, 'rgba(155,92,255,0)')
        fc.fillStyle = fl; fc.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * 2.6)
      }
      if (phase === 'burst' && now - contactAt > 1400) phase = 'done'
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    let codeTm: ReturnType<typeof setTimeout> | undefined
    if (S.code) codeTm = setTimeout(() => { S.code = false; setCp(true) }, 450)
    return () => {
      cancelAnimationFrame(raf); clearTimeout(codeTm); tms.forEach(clearTimeout)
    }
  }, [h])

  useEffect(() => {
    if (!cp) return
    tick(0.6, 0.07)
    const tm = setTimeout(() => cinRef.current?.focus(), 300)
    return () => clearTimeout(tm)
  }, [cp])

  /** Mark this booking checked in (never "paid": only the host confirms receipt, on the host's phone). */
  const markIn = () => {
    update((st) => {
      st.met = true
      const b = dayBooking()
      if (b) b.ticket_status = 'used'
    })
  }
  /** Ask the server (live) or the preview stand-in whether check-in is complete. */
  const tryCheckin = async (typed?: string): Promise<'ok' | 'wait' | 'bad'> => {
    if (previewOnly()) {
      // no backend at all (preview build): this phone stands in for the server
      if (typed !== undefined && typed !== expected) return 'bad'
      return 'ok'
    }
    if (!live()) { toast(t('authErr')); return 'wait' }   // live build but not signed in: never check in locally
    // the server checks the guest is within 100 m of the meeting point: send this phone's real position (never a made-up one)
    const here = await herePosition()
    if (!here && typed === undefined) { toast(t('ckNoLoc', { host: h })); setCp(true); return 'wait' }
    try {
      const r = await api.bump(rpcBookingId(dayBooking()), here?.lat ?? null, here?.lng ?? null, typed)
      return r === 'released' ? 'ok' : 'wait'
    } catch (e) {
      if (typed !== undefined) return 'bad'
      toast(t((e instanceof ApiError && ERR_KEYS[e.code]) || 'authErr'))
      return 'wait'
    }
  }
  const onTap = async () => {
    if (busy || burst) return
    ac(); tick(0.8, 0.06); buzz(15)
    setBusy(true)
    const r = await tryCheckin()
    setBusy(false)
    if (r === 'ok') { setWaiting(false); markIn(); contactRef.current() } else setWaiting(true)
  }
  const onCode = async (e: FormEvent<HTMLInputElement>) => {
    const el = e.currentTarget, v = el.value.replace(/\D/g, '')
    el.value = v
    setCodeErr(false)
    if (v.length !== 6) return
    const r = await tryCheckin(v)
    if (r === 'bad') { setCodeErr(true); buzz([20, 40, 20]); el.value = ''; return }
    if (r === 'wait') { setWaiting(true); setCp(false); return }
    markIn(); contactRef.current(); toast(t('codeOk')); setCp(false)
  }

  return (
    <>
      <canvas className="fxc" id="fx" ref={fxRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true" />
      <div className="topb"><button className="ib" data-go="onway" data-how="l" aria-label="Back"><Ic p={I.back} /></button><span className="small">{h} · {place}</span></div>
      <div className={`btop ${burst ? 'gone' : ''}`} id="btop"><span className="eyebrow">{t('meetPoint')}</span><h2 className="h1" style={{ fontSize: 28 }}>{t('holdTitle', { host: h })}</h2><p className="lead">{t('holdSub', { host: h })}</p></div>
      <div className={`kring ${kring ? 'show' : ''}`} id="kring" aria-live="polite">กริ๊ง!</div>
      <div className="holdwrap" id="hw" hidden={burst}>
        <button className="hold" id="hold" ref={holdRef} aria-label={t('holdTitle', { host: h })} disabled={busy} onClick={() => void onTap()}><span>{busy ? <span className="spin" /> : t('holdBtn')}</span></button>
        {waiting && <p className="small" id="bwait" aria-live="polite" style={{ textAlign: 'center', padding: '0 30px', margin: 0, color: 'var(--gold2)' }}>{t('ckWaitOther', { host: h })}</p>}
        <p className="small" style={{ textAlign: 'center', padding: '0 30px', margin: 0 }}>{t('holdNote', { host: h })}</p>
        <button className="chip" id="ucode" style={{ alignSelf: 'center' }} onClick={() => setCp(true)}><Ic p={I.lock} s={15} />{t('noPhone')}</button>
      </div>
      <div className="bsheet glass" id="cpanel" hidden={!cp} style={{ zIndex: 30 }}>
        <div className="handle" />
        <b style={{ fontSize: 18 }}>{t('codeTitle', { host: h })}</b>
        <span className="num" style={{ fontSize: 40, letterSpacing: '.18em', color: 'var(--gold2)', textAlign: 'center' }}>{code.replace(/(\d{3})(\d{3})/, '$1 $2')}</span>
        <span className="small">{t('codeSub', { host: h })}</span>
        <label className="inp glass" style={{ height: 52 }}><input id="cin" ref={cinRef} inputMode="numeric" maxLength={6} placeholder="••• •••" aria-label={t('codeTitle', { host: h })} aria-invalid={codeErr} style={{ fontSize: 22, letterSpacing: '.3em', textAlign: 'center' }} onInput={(e) => void onCode(e)} /></label>
        {codeErr && <span className="small" id="cerr" role="alert" style={{ color: 'var(--street)' }}>{t('codeBad', { host: h })}</span>}
        {previewOnly() && <span className="small" id="cprev" style={{ color: 'var(--ink2)' }}>{t('codePreview', { host: h, code: expected.replace(/(\d{3})(\d{3})/, '$1 $2') })}</span>}
      </div>
      <div className="receipt" id="rc" hidden={!rc}>
        <div className="paid glass"><span className="ok"><Ic p={I.check} s={26} sw={2.6} /></span><div className="col grow"><b id="rcin">{t('ckInDone', { host: h })}</b><span className="small">{aTitle(d.a)} · {place}</span></div></div>
        <span className="small" style={{ textAlign: 'center', display: 'flex', gap: 6, justifyContent: 'center' }}><Ic p={I.shield} s={14} />{t('s2')}</span>
        <span className="small" style={{ textAlign: 'center', display: 'flex', gap: 6, justifyContent: 'center' }}>{t('protect')}</span>
        <button className="btn gold" id="rnextpay" data-go="checkin" data-how="f">{payHost > 0 ? t('ckNextPay', { host: h }) + ' · ' + baht(payHost) : t('done')}</button>
      </div>
    </>
  )
}

/* ---------- rate ---------- */
// Tips: only in person or by the host's own QR. No in-app tip payment.

function Rate() {
  useS()
  const d = dayOf()
  const { host: h, b: bk } = d
  const ended = activityEnded(bk, d.a)
  const [n, setN] = useState(0)
  const [shim, setShim] = useState<number[]>([])
  const [liked, setLiked] = useState<Record<string, boolean>>({})
  const tm = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => {
    const L = tm.current
    for (let i = 0; i < 5; i++) {
      L.push(setTimeout(() => { setShim((x) => [...x, i]); tick(0.4 + i * 0.12, 0.06) }, 300 + i * 90))
      L.push(setTimeout(() => setShim((x) => x.filter((y) => y !== i)), 900 + i * 60))
    }
    return () => L.forEach(clearTimeout)
  }, [])
  const rate = (k: number) => {
    tm.current.forEach(clearTimeout); setShim([])
    if ((k >= 4) !== (n >= 4) || n === 0) setLiked({})
    setN(k); S.stars = k; tick(0.8, 0.1)
  }
  const keys = n >= 4 ? ['like1', 'like2', 'like3', 'like4'] : ['bad1', 'bad2', 'bad3', 'bad4']
  if (!ended) return (
    // rating opens only after the activity: never "How was it?" before it has happened
    <>
      <div className="topb"><button className="ib" data-go="trips" data-how="l" aria-label="Back"><Ic p={I.back} /></button><div className="grow" /></div>
      <div className="scroll"><div className="pad col rise" style={{ alignItems: 'center', textAlign: 'center', gap: 14, paddingBottom: 40 }}>
        <div style={{ paddingTop: 10 }}><Av ch={ini(h)} s={92} /></div>
        <h1 className="h2" id="rateLater">{bk ? t('rateLater', { host: h, end: d.end }) : t('noUp')}</h1>
        {bk && <span className="small">{t('rateLaterSub')}</span>}
        <span className="small">{t('tipHow', { host: h })}</span>
        <button className="btn gold" id="rateBack" data-go="trips" data-how="f">{t('t_trips')}</button>
      </div></div>
    </>
  )
  return (
    <>
      <div className="topb"><div className="grow" /><button className="ib" data-go="trips" data-how="f" aria-label="Close"><Ic p={I.close} /></button></div>
      <div className="scroll"><div className="pad col rise" style={{ alignItems: 'center', textAlign: 'center', gap: 14, paddingBottom: 40 }}>
        <div style={{ paddingTop: 10 }}><Av ch={ini(h)} s={92} /></div>
        <h1 className="h1">{t('rateQ')}</h1>
        <div className="stars" id="stars">{[1, 2, 3, 4, 5].map((i) => (
          <button key={i} data-s={i} aria-label={`${i} / 5`} className={i <= n || shim.includes(i - 1) ? 'on' : ''} onClick={() => rate(i)}><svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: I.star }} /></button>
        ))}</div>
        <div className="chips" style={{ justifyContent: 'center' }} id="likes" hidden={!n}>
          {keys.map((k) => <button key={k} className={`chip ${liked[k] ? 'on' : ''}`} aria-pressed={!!liked[k]} onClick={() => { setLiked((x) => ({ ...x, [k]: !x[k] })); tick(0.6, 0.06) }}>{t(k)}</button>)}
        </div>
        <label className="inp glass" style={{ width: '100%', height: 'auto', minHeight: 52, padding: '10px 14px' }}><textarea id="pnote" rows={2} placeholder={t('privNote', { host: h })} aria-label={t('privNote', { host: h })} style={{ width: '100%', background: 'none', border: 0, color: '#fff', font: 'inherit', resize: 'none', outline: 'none' }} /></label>
        <p className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}><Ic p={I.lock} s={13} />{t('rateSub', { host: h })}</p>
        <span className="small">{t('reviewWait', { host: h })}</span>
        <div className="glass card col" style={{ width: '100%', textAlign: 'left', gap: 10 }}>
          <b id="tq">{t('tipQ', { host: h })}</b>
          <span className="small" id="tiphow">{t('tipHow', { host: h })}</span>
        </div>
        <button className="btn ghost" id="rnext" onClick={() => { toast(t('againToday', { n: 2 })); go('book', 'b') }}>{t('nextAct')}</button>
        <span className="small">{t('againToday', { n: 1 })}</span>
        <button className="btn gold" id="rdone" data-go="trips" data-how="f" disabled={!n} onClick={() => { const noteEl = document.getElementById('pnote') as HTMLTextAreaElement | null; if (bk) update(() => { bk.done = true }); void api.rate(rpcBookingId(bk), n, Object.keys(liked).filter((k) => liked[k]), noteEl?.value || '').catch(() => {}) }}>{n ? t('done') : t('rateFirst')}</button>
      </div></div>
    </>
  )
}

register(
  { id: 'onway', flow: 't', title: 'On the way', C: OnWay },
  { id: 'bump', flow: 't', title: 'The bump', C: Bump },
  { id: 'rate', flow: 't', title: 'Rate & next', C: Rate },
)
