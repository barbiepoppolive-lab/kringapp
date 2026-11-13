/* Host mode (same app): Verify, Today, Requests, Create, Creator, Earnings.
   Host screens follow the app language (t('h6_*') keys). Thai copy uses the host's own polite particle
   ({p} = ค่ะ / ครับ, from the host's own gender; nothing for "x" / not set).
   Money rule: guests pay the host directly at the meeting place, after check-in, by the host's own QR or cash.
   Kring never holds, collects, transfers or pays out activity money: no balance, no payouts, no fees, no gifts. */
import { bookingRef, guestCode, hostCode as dayHostCode } from '../core/dayof'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { S, update, useS } from '../core/store'
import { t, baht, ph, ini, dayFmt, rand, pick, LN, ACTS, aTitle, giveLaunchBack, type Act } from '../core/data'
import type { Booking } from '../core/store'
import { register, go, toast, needAccount, hasAccount } from '../core/router'
import { bell, tick, chime, buzz } from '../core/sound'
import { nameBlocked } from '../core/guard'
import { openHostChat, guestName, SAMPLE_GUESTS } from '../core/chatLinks'
const CHAT_IC = '<path d="M4 5h16v11H9l-5 4z"/>'
import { becomeHost, saveProfile, getUserId } from '../core/account'
import { submitHostActivityForReview } from '../core/liveActivities'
import { configured, currentUser } from '../core/auth'
import { HOST_PLACES, PARTNER_VENUES, searchHostPlaces, type HostPlace } from '../core/hostPlaces'
import { FIXTURE_CREATOR_BOARD_ENTRIES, rankCreatorBoard } from '../core/creatorBoard'
import { APPROVED_ACTIVITY_TEMPLATES, isTempleGuidingBlocked, isTempleGuidingDesc } from '../core/ticketsAndRails'
import { I, Ic, Rings, Av, Tabs, TTh, Sheet } from '../ui/kit'

/* ---------- helpers: the host's OWN data only ---------- */
/** Polite particles for the signed-in host (their own gender): p = ค่ะ/ครับ, n = นะคะ/นะครับ, q = คะ/ครับ. */
const kp = () => (S.gender === 'f' ? { p: 'ค่ะ', n: 'นะคะ', q: 'คะ' } : S.gender === 'm' ? { p: 'ครับ', n: 'นะครับ', q: 'ครับ' } : { p: '', n: '', q: '' })
/** Host string in the app language. */
const h = (k: string, v: Record<string, string | number> = {}): string => thSpace(t('h6_' + k, { ...kp(), ...v }).replace(/ +([.,!?])/g, '$1').trim())
/** Thai text: a space between Thai and Latin letters ("รับคำขอของ Lin", "คุณ Nicha"). */
const thSpace = (x: string): string => (S.lang === 'th' ? x.replace(/([\u0E00-\u0E7F])([A-Za-z])/g, '$1 $2').replace(/([A-Za-z])([\u0E00-\u0E7F])/g, '$1 $2') : x)
const Chk = ({ s = 22 }: { s?: number }) => <Ic p={I.check} s={s} sw={3} />
/** Values that came from the old demo profile (another host's details). Never shown as this host's own. */
const DEMO_RE = /nicha|KSHOP-TH-TAG30|test_kring/i
const own = (v?: string | null): string => (v && !DEMO_RE.test(v.trim()) ? v.trim() : '')
/* One-time clean-up: an old demo profile (another host's shop QR + its sample number) is never this host's own. */
try {
  if (DEMO_RE.test(S.prof.merchant_qr || '')) {
    S.prof.merchant_qr = ''
    if (S.prof.promptpay_personal === '0812345678') S.prof.promptpay_personal = ''
    if (S.prof.promptpay === '0812345678') S.prof.promptpay = ''
  }
} catch { /* ignore */ }
const myName = (): string => (S.prof.name || '').trim()
const myActs = (): string[] => S.myActs.filter((x) => x && x.trim())
const myAct = (): string => myActs()[myActs().length - 1] || ''
/** Phone typed at sign-up (live mode), as a Thai PromptPay number (0XXXXXXXXX). */
const signupPhone = (): string => {
  const p = (currentUser()?.phone || '').replace(/\D/g, '')
  if (/^66\d{9}$/.test(p)) return '0' + p.slice(2)
  return /^0\d{9}$/.test(p) ? p : ''
}
/** The host's referral code: made once (from the account id when there is one) and kept on this phone. */
const hostCode = (): string => {
  if (S.hostRefCode && /^H-[a-z0-9]{6}$/.test(S.hostRefCode)) return S.hostRefCode
  const id = (getUserId() || '').replace(/-/g, '').toLowerCase().slice(0, 6)
  const code = 'H-' + (/^[a-z0-9]{6}$/.test(id) ? id : Math.random().toString(36).slice(2, 8).padEnd(6, '0'))
  S.hostRefCode = code // never changes after this
  queueMicrotask(() => update())
  return code
}
/** Small stable hash for the host's activity id. */
const hash6 = (v: string): string => { let x = 2166136261; for (let i = 0; i < v.length; i++) { x ^= v.charCodeAt(i); x = Math.imul(x, 16777619) } return (x >>> 0).toString(36).slice(0, 6) }
/** Stable id for one of the host's own activities (used in shared links). */
const hostActId = (title: string): string => 'h' + hostCode().slice(2) + '-' + hash6(title.trim().toLowerCase())
/** Link that opens the host's activity in the app and credits the host's code. */
const actLink = (title: string): string => `https://kringapp.com/app/#detail?act=${hostActId(title)}&ref=${hostCode()}`
const refLink = (title = myAct()): string => (title ? actLink(title) : `https://kringapp.com/app/?ref=${hostCode()}`)
const ppValid = (v: string): boolean => /^(\d{10}|\d{13})$/.test(v.replace(/\D/g, ''))
/** The host's one saved PromptPay number (same value on Verify, Create and Earnings). */
const myPP = (): string => own(S.prof.promptpay_personal) || own(S.prof.promptpay)
const hasPayQr = (): boolean => ppValid(myPP()) || !!own(S.prof.merchant_qr)
const ticketFor = (price: number): number => (price <= 1200 ? 199 : price <= 1800 ? 299 : 499)

/** Extra title guard for host listings: gender-restricted and sexual titles (on top of core nameBlocked). */
const GENDER_ONLY_RE = /\b(girls?|ladies|lady|women|woman|females?|boys?|men|males?)\s*(only| ?เท่านั้น)|\bonly\s*(girls?|ladies|women|females?|boys?|men|males?)\b|no\s*(men|guys|boys|girls|women)\b|ผู้หญิงเท่านั้น|เฉพาะผู้หญิง|เฉพาะสาว|สาว\s*ๆ|สาวๆ|ผู้ชายเท่านั้น|เฉพาะผู้ชาย|只限女|仅限女|女生专|여자만|여성\s*전용|только\s*(девушк|женщин|мужчин)|wanita\s*sahaja|perempuan\s*sahaja/i
const ADULT_RE = /\bsex|sexual|nude|naked|\bxxx\b|\b18\s*\+|adults?\s*only|hook\s*-?\s*up|one\s*night|drinks?\s*(and|&|n)\s*fun|fun\s*night|party\s*night|cuddle|kiss|flirt|romance|romantic|lonely|single\s*(guys|men|ladies|girls)|เซ็กส์|เซ็ก|โป๊|ทางเพศ|ขายตัว|หาคู่|หาเพื่อน|เพื่อนเที่ยว|เดท|เดต|คืนนี้สนุก|ดื่มสนุก/i
type TitleIssue = null | 'empty' | 'gender' | 'adult' | 'temple' | 'activity'
/** Checks the activity title only. Meeting places come from Kring's own list of public places, so a place
    name can never block Next. */
function titleIssue(v: string): TitleIssue {
  if (!v.trim()) return 'empty'
  if (GENDER_ONLY_RE.test(v)) return 'gender'
  if (ADULT_RE.test(v)) return 'adult'
  if (isTempleGuidingBlocked(v)) return 'temple'
  if (nameBlocked(v)) return 'activity'
  return null
}

/** "Share to LINE" for the host's activity (LINE's public share URL; opens LINE or the LINE web page). */
function ShareLine({ title, id = 'share-line' }: { title: string; id?: string }) {
  const text = `${h('share_text', { title })} ${actLink(title)}`
  return (
    <a className="btn ghost" id={id} href={'https://line.me/R/share?text=' + encodeURIComponent(text)} target="_blank" rel="noopener noreferrer"
      style={{ textDecoration: 'none', color: '#4CD39A', borderColor: 'rgba(76,211,154,.45)' }} onClick={() => tick(0.6, 0.05)}>
      {h('share_line')}
    </a>
  )
}

/** Save the host's payment details once, in one place (store + server). */
const savePayQr = (pp: string, shop: string) => {
  const d = pp.replace(/\D/g, '')
  update((st) => {
    st.prof.promptpay_personal = d
    st.prof.promptpay = d
    st.prof.merchant_qr = shop.trim()
    st.prof.stripe_payment_link = own(st.prof.stripe_payment_link)
  })
  saveProfile({ promptpay: d }).catch(() => undefined)
}
const fmtPP = (v: string): string => (v.length === 10 ? `${v.slice(0, 3)} ${v.slice(3, 6)} ${v.slice(6)}` : v.length === 13 ? `${v[0]} ${v.slice(1, 5)} ${v.slice(5, 10)} ${v.slice(10, 12)} ${v[12]}` : v)

/** PromptPay number: shows the saved number (with "Change"), or an input that saves as soon as the number is valid. */
function PpField({ id = 'promptpay-personal-input' }: { id?: string }) {
  useS()
  const saved = myPP()
  const [edit, setEdit] = useState(() => !ppValid(saved))
  // nothing saved yet: suggest the sign-up phone (saved only when the host confirms it)
  const [pp, setPp] = useState(() => saved || signupPhone())
  const bad = !!pp && !ppValid(pp)
  const isSaved = ppValid(pp) && pp === myPP()
  const onPp = (raw: string) => {
    const d = raw.replace(/\D/g, '').slice(0, 13)
    setPp(d)
    if (ppValid(d)) savePayQr(d, own(S.prof.merchant_qr))
  }
  if (!edit && ppValid(saved)) {
    return (
      <div className="row" id={id + '-saved'} style={{ gap: 8, alignItems: 'center' }}>
        <span className="ok" style={{ width: 26, height: 26 }}><Chk s={14} /></span>
        <span className="col grow" style={{ gap: 0 }}><span className="small">{h('qr_pp_saved')}</span><b className="num">{fmtPP(saved)}</b></span>
        <button type="button" className="chip" id={id + '-change'} style={{ height: 32 }} onClick={() => { setPp(saved); setEdit(true) }}>{h('qr_change')}</button>
      </div>
    )
  }
  return (
    <>
      <label className="col" style={{ gap: 4 }}>
        <span className="small">{h('qr_pp')}</span>
        <input className="tin" id={id} inputMode="numeric" maxLength={13} value={pp} placeholder="08X XXX XXXX" aria-label="PromptPay"
          onChange={(e) => onPp(e.target.value)} />
      </label>
      {bad && <div className="guard" role="status">{h('qr_pp_bad')}</div>}
      {isSaved && <span className="small" id={id + '-ok'} style={{ color: '#4CD39A' }}>{h('qr_pp_saved')} ✓</span>}
      {ppValid(pp) && !isSaved && <button type="button" className="chip" id={id + '-use'} style={{ height: 34, alignSelf: 'flex-start' }} onClick={() => savePayQr(pp, own(S.prof.merchant_qr))}>{h('qr_use', { n: fmtPP(pp) })}</button>}
      {pp.length === 13 && <div className="guard" role="status" id={id + '-idwarn'}>{h('qr_pp_idwarn')}</div>}
    </>
  )
}

/** The host's own payment QR details (PromptPay number + optional shop QR ID), shown to guests at check-in. */
function PayQrFields() {
  useS()
  const [shop, setShop] = useState(() => own(S.prof.merchant_qr))
  return (
    <div className="glass card col" id="host-payqr-card" style={{ gap: 10, padding: 14 }}>
      <b>{h('qr_title')}</b>
      <span className="small">{h('qr_sub')}</span>
      <PpField />
      <label className="col" style={{ gap: 4 }}>
        <span className="small">{h('qr_shop')}</span>
        <input className="tin" id="merchant-qr-input" value={shop} maxLength={60}
          onChange={(e) => setShop(e.target.value)} onBlur={() => { if (shop.trim() !== own(S.prof.merchant_qr)) savePayQr(myPP(), shop) }} />
      </label>
      <span className="small">{h('qr_cash')}</span>
    </div>
  )
}

/** Card shown in place of a host action until the person has a Kring account (name, contact, terms). */
function NeedAccount({ back }: { back: string }) {
  return (
    <div className="glass card col" id="host-need-account" style={{ gap: 10, border: '1px solid rgba(255,208,103,.45)' }}>
      <b style={{ fontSize: 16 }}>{h('acc_t')}</b>
      <span className="small">{h('acc_sub')}</span>
      <button className="btn gold" id="host-need-account-btn" onClick={() => { toast(h('acc_t'), 'info'); needAccount(back) }}>{h('acc_btn')}</button>
    </div>
  )
}

/* ---------- guest requests: the host's answers, kept on this phone ---------- */
type ReqAns = 'acc' | 'dec' | 'no'
interface ReqRec { st: ReqAns; name: string; when: string; time: string; title: string; key?: string }
const REQ_IDS = ['r0', 'r1', 'r2']
const reqRecs = (): Record<string, ReqRec> => (S.hostReqs || {}) as Record<string, ReqRec>
/** r0 is the guest booking on this phone: its answer belongs to that booking (a new booking is a new request). */
const mainBk = (): Booking | undefined => S.bookings.filter((x) => x.kind === 'act' && x.status !== 'cancelled').slice(-1)[0]
const mainKey = (): string => { const b = mainBk(); return b ? `${b.act}|${new Date(b.date).toISOString().slice(0, 10)}|${b.time}` : 'none' }
const reqAnswer = (id: string): ReqAns | null => {
  const rec = reqRecs()[id]
  if (id === 'r0') return S.req || (rec && rec.key === mainKey() ? rec.st : null)
  return rec?.st || null
}
const openReqN = (): number => REQ_IDS.filter((id) => !reqAnswer(id)).length
/** The guest of the main request (the booking on this phone). Their name is kept as first seen, so it never
    changes with the host's app language (Emma stays Emma). */
interface G0 { name: string; code: string; key: string }
const guest0 = (): G0 => {
  const key = mainKey()
  const g = (S.hostReqs || {})._g0 as G0 | undefined
  if (g && g.key === key && g.name) return g
  const ng: G0 = { name: guestName('r0'), code: SAMPLE_GUESTS.r0?.code || 'EN', key }
  queueMicrotask(() => update((st) => { st.hostReqs = { ...(st.hostReqs || {}), _g0: ng } }))
  return ng
}

/* ---------- the host's published activity: schedule and settings, kept on this phone ---------- */
interface ActSet { cat: string; desc: string; cover: string; place: { th: string; en: string }; dur: number; times: string[]; days: boolean[]; perSlot: number; price?: number; free?: boolean; status?: 'review' | 'live' }
const DEF_DAYS = Array.from({ length: 7 }, (_, i) => i >= 4) // Monday first: Fri, Sat, Sun
const actSet = (title = myAct()): Partial<ActSet> | null => { const m = (S.hostActs || {})[title]; return m && typeof m === 'object' ? (m as Partial<ActSet>) : null }
const schedOf = (title = myAct()): { times: string[]; days: boolean[]; perSlot: number } => {
  const a = actSet(title)
  return {
    times: Array.isArray(a?.times) && a!.times.length ? [...a!.times].sort() : ['18:00'],
    days: Array.isArray(a?.days) && a!.days.length === 7 && a!.days.some(Boolean) ? a!.days : DEF_DAYS,
    perSlot: Math.max(1, Math.min(6, Math.round(Number(a?.perSlot) || 1))),
  }
}
const dKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const slotKey = (d: Date, time: string): string => dKey(new Date(d)) + '|' + time
/** The host's own open start times in the next two weeks (from tomorrow), soonest first. */
const openSlots = (title = myAct(), days = 14): { when: Date; time: string }[] => {
  const sc = schedOf(title)
  const out: { when: Date; time: string }[] = []
  for (let i = 1; i <= days; i++) {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + i)
    if (!sc.days[(d.getDay() + 6) % 7]) continue
    for (const tm of sc.times) out.push({ when: new Date(d), time: tm })
  }
  return out
}
/** Requests the host already accepted for this start time (other than `except`). */
const acceptedAt = (key: string, except: string): ReqRec[] =>
  REQ_IDS.filter((id) => id !== except && reqAnswer(id) === 'acc').map((id) => reqRecs()[id]).filter((r) => !!r && slotKey(new Date(r.when), r.time) === key)

/* ---------- shared host top bar ---------- */
function HostTop({ active }: { active: string }) {
  useS()
  const nav = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const hn = nav.current?.querySelector<HTMLElement>('.on')
    if (hn && nav.current) nav.current.scrollLeft = Math.max(0, hn.offsetLeft - 60)
  }, [active])
  const reqN = myActs().length && !S.away ? openReqN() : 0
  const items: [string, string, number?][] = [['htoday', h('nav_today')], ['hreq', h('nav_req'), reqN], ['hcreate', h('nav_create')], ['hcreator', h('nav_creator')], ['hearn', h('nav_earn')], ['hverify', h('nav_verify')]]
  return (
    <>
      <div className="topb" style={{ paddingBottom: 6 }}>
        <span className="hpill"><Rings w={26} />{t('hostMode')}</span><div className="grow" />
        <button className="chip" data-go="me" data-how="f" data-hostoff="1" style={{ height: 36 }}><Ic p={I.back} s={14} />{h('nav_guest')}</button>
      </div>
      <div className="hnav" ref={nav}>
        {items.map(([id, l, b]) => (
          <button key={id} className={`chip ${id === active ? 'on' : ''}`} data-go={id} data-how="f" aria-current={id === active ? 'page' : undefined}>{l}{b ? <span className="cnt">{b}</span> : null}</button>
        ))}
      </div>
    </>
  )
}

/* ---------- hverify ---------- */
const FACE: [string, number][] = [['look', 0], ['left', -28], ['right', 28], ['smile', 0]]
type Cam = 'off' | 'asking' | 'on' | 'done' | 'denied' | 'none'
function HVerify() {
  const s = useS()
  const [consent, setConsent] = useState(false)
  const [idPhoto, setIdPhoto] = useState(false)
  const [cam, setCam] = useState<Cam>('off')
  const [i, setI] = useState(0)
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const iv = useRef<ReturnType<typeof setInterval> | null>(null)
  const idInput = useRef<HTMLInputElement>(null)
  const profPhotoInput = useRef<HTMLInputElement>(null)
  const hasProfPhoto = !!s.prof.hostPhoto
  const onPickProfPhoto = async (file?: File) => {
    if (!file) return
    try {
      const dataUrl = await coverToJpeg(file)
      update((st) => { st.prof.hostPhoto = dataUrl })
      tick(0.7, 0.06)
      toast(h('hv_photo_saved'))
    } catch { /* ignore */ }
  }
  const stopCam = () => {
    if (iv.current) { clearInterval(iv.current); iv.current = null }
    stream.current?.getTracks().forEach((x) => x.stop()); stream.current = null
  }
  useEffect(() => () => stopCam(), [])
  useEffect(() => {
    if (cam !== 'on' || !video.current || !stream.current) return
    video.current.srcObject = stream.current
    void video.current.play().catch(() => undefined)
  }, [cam])
  const onConsent = (on: boolean) => {
    setConsent(on)
    if (!on) { stopCam(); if (cam === 'on' || cam === 'asking') setCam('off'); setI(0) }
  }
  const pickId = () => { if (!consent) { toast(h('hv_need_consent')); return } idInput.current?.click() }
  const startFace = async () => {
    if (!consent) { toast(h('hv_need_consent')); return }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) { setCam('none'); return }
    setCam('asking')
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
    } catch { setCam('denied'); return }
    setI(0); setCam('on')
    let n = 0
    iv.current = setInterval(() => {
      n++
      if (n >= FACE.length) { stopCam(); setCam('done'); chime(); buzz([20, 30, 20]); return }
      setI(n); tick(0.4 + n * 0.1, 0.08)
    }, 1600)
  }
  const faceDone = cam === 'done'
  const both = idPhoto && faceDone
  const pr = !consent ? h('hv_tick_first') : cam === 'on' ? h('hv_p_' + FACE[i][0]) : cam === 'asking' ? h('hv_asking') : faceDone ? h('hv_face_done') : cam === 'denied' ? h('hv_denied') : cam === 'none' ? h('hv_nocam') : h('hv_ready')
  const pinOk = ppValid(myPP())
  const submitted = !!s.prof.idSubmittedAt
  const acct = hasAccount()
  /** back to the activity being created (its draft is kept), otherwise Today */
  const after = () => (S.hostDraft ? 'hcreate' : 'htoday')
  const finish = () => {
    if (!pinOk || !both) return
    if (needAccount('hverify')) return
    update((st) => { st.prof.idSubmittedAt = new Date().toISOString() })
    becomeHost().catch(() => undefined)
    toast(h('hv_sent'))
    go(after(), 'f')
  }
  const prog = cam === 'on' ? i / FACE.length : faceDone ? 1 : 0
  return (
    <>
      <HostTop active="hverify" />
      <div className="scroll"><div className="pad col" style={{ gap: 12, paddingBottom: 110 }}>
        <h1 className="h2">{h('hv_title')}</h1>
        {submitted && <div className="glass card row" id="hv-submitted" style={{ gap: 10 }}><span className="ok"><Chk /></span><span className="grow small">{s.prof.idVerified ? h('hv_verified') : h('hv_pending')}</span></div>}
        {!acct && !submitted && <NeedAccount back="hverify" />}
        {acct && !submitted && <>
        <div className="selfie">
          {cam === 'on' && <video ref={video} id="hv-video" playsInline muted style={{ position: 'absolute', inset: 10, width: 180, height: 180, borderRadius: '50%', objectFit: 'cover', transform: 'scaleX(-1)' }} />}
          <svg viewBox="0 0 200 200" width="200" height="200" className="ringp" aria-hidden="true" style={{ position: 'relative' }}><circle cx="100" cy="100" r="90" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="8" /><circle className="pg2" cx="100" cy="100" r="90" fill="none" stroke={faceDone ? '#4CD39A' : '#7381FF'} strokeWidth="8" strokeLinecap="round" strokeDasharray="566" style={{ strokeDashoffset: 566 * (1 - prog) }} /></svg>
          {cam !== 'on' && <svg viewBox="0 0 200 200" width="200" height="200" style={{ position: 'absolute', inset: 0 }} aria-hidden="true"><g className="facesil"><ellipse cx="100" cy="88" rx="40" ry="50" fill="rgba(115,129,255,.1)" stroke="rgba(201,205,230,.5)" strokeWidth="2" strokeDasharray="5 6" /><path d="M46 184c9-28 31-40 54-40s45 12 54 40" fill="none" stroke="rgba(201,205,230,.35)" strokeWidth="2" strokeDasharray="5 6" /></g></svg>}
        </div>
        <div style={{ textAlign: 'center' }} aria-live="polite" id="hv-prompt"><b style={{ fontSize: 18 }}>{pr}</b></div>

        <div className="glass card col" id="pdpa-biometric-consent-card" style={{ gap: 8, padding: 14, border: '1px solid rgba(115, 129, 255, 0.4)' }}>
          <span className="eyebrow" style={{ color: '#FFD067' }}>{h('hv_consent_t')}</span>
          <label className="row small" style={{ alignItems: 'flex-start', gap: 10 }}>
            <span className="sw" style={{ marginTop: 2, flex: 'none' }}>
              <input type="checkbox" id="cons" aria-label={h('hv_consent_t')} checked={consent} onChange={(e) => onConsent(e.target.checked)} />
              <i />
            </span>
            <span id="hv-consent-text">{h('hv_consent')}</span>
          </label>
          <span className="small" id="jit-verify-camera-note">{h('hv_cam_note')}</span>
        </div>

        <div className="glass card col" style={{ gap: 12 }} id="hv-steps">
          <div className={`vstep ${idPhoto ? 'ok' : ''}`} id="hv-step-id"><i>{idPhoto ? <Chk s={14} /> : null}</i><span className="grow">{h('hv_id')}</span>
            {!idPhoto && <button type="button" className="chip" id="hv-id-btn" style={{ height: 32, fontSize: 12.5 }} disabled={!consent} onClick={pickId}>{h('hv_id_btn')}</button>}
            <input ref={idInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { if (e.target.files?.[0]) { setIdPhoto(true); tick(0.7, 0.06) } }} />
          </div>
          <div className={`vstep ${faceDone ? 'ok' : cam === 'on' || cam === 'asking' ? 'now' : ''}`} id="hv-step-face"><i>{faceDone ? <Chk s={14} /> : null}</i><span className="grow">{h('hv_face')}</span>
            {!faceDone && cam !== 'on' && cam !== 'asking' && <button type="button" className="chip" id="hv-face-btn" style={{ height: 32, fontSize: 12.5 }} disabled={!consent} onClick={() => void startFace()}>{h('hv_face_btn')}</button>}
          </div>
          <div className={`vstep ${hasProfPhoto ? 'ok' : ''}`} id="hv-step-photo">
            <i>{hasProfPhoto ? <Chk s={14} /> : null}</i>
            <span className="grow">
              {h('hv_photo')}
              <span className="small" style={{ display: 'block' }}>{h('hv_photo_sub')}</span>
            </span>
            <button type="button" className="chip" id="hv-photo-btn" disabled={!consent} style={{ height: 32, fontSize: 12.5 }} onClick={() => profPhotoInput.current?.click()}>
              {hasProfPhoto ? h('hv_photo_change') : h('hv_photo_btn')}
            </button>
            <input ref={profPhotoInput} type="file" accept="image/*" hidden onChange={(e) => void onPickProfPhoto(e.target.files?.[0])} />
          </div>
          <div className="vstep" id="hv-step-bg"><i /><span className="grow">{h('hv_bg')}{submitted ? <span className="small" style={{ display: 'block' }}>{h('hv_bg_wait')}</span> : null}</span></div>
          <div className="vstep"><i /><span className="grow">{h('hv_train')}</span></div>
        </div>

        {both && (
          <div className="glass card col" id="ppay" style={{ gap: 10 }}>
            <b>{h('qr_title')}</b>
            <PpField id="ppin" />
            <span className="small">{h('hv_pp_note')}</span>
            <button className="btn gold" id="vdone" disabled={!pinOk} onClick={finish}>{h('hv_send')}</button>
          </div>
        )}
        </>}
        <button type="button" className="btn ghost" id="verify-later-fallback-btn" style={{ height: 40, fontSize: 13 }}
          onClick={() => { stopCam(); if (!submitted) toast(h('hv_later_t')); go(after(), 'f') }}>{submitted ? (S.hostDraft ? h('hv_back_create') : h('back_today')) : h('hv_later')}</button>
      </div></div>
      <Tabs active="me" host />
    </>
  )
}

/* ---------- host-side day-of: check in the guest, confirm "Received ฿X", mark a no-show ----------
   Same booking fields and codes as the guest side (core/dayof.ts in area B): ticket_status 'used' = checked in,
   confirmed_by 'host' + settled_at = the host received the activity price at the place,
   status 'cancelled' + cancelled_reason 'guest_no_show' + guest_strike_issued = the guest didn't come.
   The ref and code helpers come from core/dayof.ts so both phones always agree. */
const bkRef = (b: Booking, a: Act): string => bookingRef(b, a)
const guestSix = (ref: string): string => guestCode(ref)
const bkAct = (b: Booking): Act => ACTS.find((x) => x.id === b.act) || ACTS[0]
/** What the guest pays the host at the place (same rule as dayOf().payHost). */
const bkPay = (b: Booking): number => { const a = bkAct(b); return a.isVolunteer || a.price === 0 ? 0 : Math.max(200, a.price) }
const bkStart = (b: Booking): Date => { const d = new Date(b.date); const [hh, mm] = (b.time || '00:00').split(':').map(Number); d.setHours(hh || 0, mm || 0, 0, 0); return d }
/** Bookings the host acts on (preview: the bookings on this phone). Cancelled and finished ones are left out. */
const hostBookings = (): Booking[] => S.bookings.filter((b) => b.kind === 'act' && b.status !== 'cancelled' && !b.done)
/** Payments the host confirmed with "Received ฿X ✓" (the Earnings record). */
const receivedRecords = (): Booking[] => S.bookings.filter((b) => b.kind === 'act' && b.confirmed_by === 'host' && !!b.settled_at)

function HostBookingCard({ b, onLate, onCant }: { b: Booking; onLate: () => void; onCant: () => void }) {
  useS()
  const a = bkAct(b)
  const ref = bkRef(b, a)
  const pay = bkPay(b)
  const guest = guest0().name
  const checkedIn = b.ticket_status === 'used'
  const received = b.confirmed_by === 'host' && !!b.settled_at
  const [codeOpen, setCodeOpen] = useState(false)
  const [code, setCode] = useState('')
  const [bad, setBad] = useState(false)
  const [noShowAsk, setNoShowAsk] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(iv) }, [])
  const noShowAt = bkStart(b).getTime() + 15 * 60 * 1000
  const canNoShow = !checkedIn && now >= noShowAt
  const mut = (f: (x: Booking) => void) => update((st) => { const x = st.bookings.find((y) => y === b || (y.kind === 'act' && y.act === b.act && y.time === b.time && new Date(y.date).getTime() === new Date(b.date).getTime())); if (x) f(x) })
  const checkIn = () => {
    if (code.replace(/\D/g, '') !== guestSix(ref)) { setBad(true); buzz([40, 40, 40]); return }
    mut((x) => { x.ticket_status = 'used' }); update((st) => { st.met = true })
    setCodeOpen(false); setBad(false); chime(); toast(h('hb_in_done', { name: guest }))
  }
  const receive = () => { mut((x) => { x.confirmed_by = 'host'; x.settled_at = new Date().toISOString() }); chime(); buzz([20, 30, 60]); toast(h('hb_rcv_done', { amt: baht(pay) })) }
  const noShow = () => { mut((x) => { x.status = 'cancelled'; x.cancelled_reason = 'guest_no_show'; x.guest_strike_issued = true }); setNoShowAsk(false); toast(h('hb_noshow_done')) }
  return (
    <div className="glass card col" id="ht-booking" style={{ gap: 10 }}>
      <div className="row"><span className="chip goldc" style={{ height: 28, fontSize: 12 }}>{dayFmt(new Date(b.date), { weekday: 'short', day: 'numeric', month: 'short' })} · {b.time}</span><div className="grow" /><span className="small num">{ref}</span></div>
      <div className="row"><Av ch={ini(guest)} s={46} /><div className="col grow"><b>{guest} · {aTitle(a)}</b><span className="small">{h('hb_people', { n: b.guests || 1 })} · {h('ht_translate')}</span></div></div>
      <button className="chip" id="hb-chat" style={{ alignSelf: 'flex-start' }} onClick={() => openHostChat('r0')}><Ic p={CHAT_IC} s={14} />{h('hb_msg', { name: guestName('r0') })}</button>
      <div className="row small" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span className={`pill ${checkedIn ? 'gold' : ''}`} id="hb-status-in">{checkedIn ? h('hb_st_in') : h('hb_st_wait')}</span>
        {checkedIn && <span className={`pill ${received ? 'gold' : ''}`} id="hb-status-paid">{received ? h('hb_st_paid', { amt: baht(pay) }) : pay ? h('hb_st_due', { amt: baht(pay) }) : h('hb_st_vol')}</span>}
      </div>
      {!checkedIn && (
        <>
          <button className="btn gold" id="hb-checkin-btn" onClick={() => { setCodeOpen((x) => !x); tick(0.6, 0.05) }}>{h('hb_checkin')}</button>
          {codeOpen && (
            <div className="col" id="hb-code-box" style={{ gap: 8 }}>
              <span className="small">{h('hb_my_code')}</span>
              <b className="num" id="hb-host-code" style={{ fontSize: 28, letterSpacing: 4, color: 'var(--gold2)' }}>{dayHostCode(ref)}</b>
              <label className="small" htmlFor="hb-guest-code">{h('hb_guest_code')}</label>
              <div className="row" style={{ gap: 8 }}>
                <input className="tin num" id="hb-guest-code" inputMode="numeric" maxLength={6} value={code} style={{ flex: 1, letterSpacing: 4 }}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setBad(false) }} />
                <button className="btn gold" id="hb-code-ok" style={{ flex: 'none', width: 96 }} disabled={code.length !== 6} onClick={checkIn}>{h('hb_ok')}</button>
              </div>
              {bad && <div className="guard" role="status" id="hb-code-bad">{h('hb_code_bad', { name: guest })}</div>}
            </div>
          )}
          {canNoShow ? (
            noShowAsk ? (
              <div className="row" style={{ gap: 8 }}>
                <button className="btn ghost" style={{ flex: 1 }} onClick={() => setNoShowAsk(false)}>{h('hc_back')}</button>
                <button className="btn ghost" id="hb-noshow-ok" style={{ flex: 1.4, color: '#FF7A7A', borderColor: 'rgba(255,122,122,.5)' }} onClick={noShow}>{h('hb_noshow_ok')}</button>
              </div>
            ) : <button className="btn ghost" id="hb-noshow-btn" onClick={() => setNoShowAsk(true)}>{h('hb_noshow')}</button>
          ) : <span className="small" id="hb-noshow-later">{h('hb_noshow_when', { t: dayFmt(new Date(noShowAt), { hour: '2-digit', minute: '2-digit' }) })}</span>}
          <div className="row" style={{ gap: 8 }}><button className="chip" id="hlate" onClick={onLate}><Ic p={I.clock} s={14} />{h('ht_late')}</button><button className="chip" id="hcant" onClick={onCant}>{h('ht_cant')}</button></div>
        </>
      )}
      {checkedIn && !received && pay > 0 && (
        <>
          <span className="small">{h('hb_rcv_sub', { amt: baht(pay) })}</span>
          <button className="btn gold" id="hb-received-btn" onClick={receive}>{h('hb_received', { amt: baht(pay) })}</button>
        </>
      )}
    </div>
  )
}

/* ---------- htoday ---------- */
function HToday() {
  const s = useS()
  const k = kp()
  const name = myName()
  const title = myAct()
  const dLong = dayFmt(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const [sh, setSh] = useState<null | 'late' | 'cant'>(null)
  const [cantFor, setCantFor] = useState<string | null>(null)
  const open = (x: 'late' | 'cant', reqId: string | null = null) => { setSh(x); setCantFor(reqId); tick(0.6, 0.07) }
  const cant = () => {
    setSh(null)
    if (cantFor) update((st) => { const r = (st.hostReqs || {}) as Record<string, ReqRec>; if (r[cantFor]) r[cantFor] = { ...r[cantFor], st: 'no' }; st.hostReqs = { ...r } })
    else update((st) => { st.req = null; const r = (st.hostReqs || {}) as Record<string, ReqRec>; if (r.r0) st.hostReqs = { ...r, r0: { ...r.r0, st: 'no' } }; const bk = st.bookings.find((x) => x.kind === 'act' && x.status !== 'cancelled'); if (bk) bk.status = 'cancelled' })
    toast(h('ht_cant_done'))
    go('htoday', 'f', true)
  }
  const verified = s.prof.idVerified, submitted = !!s.prof.idSubmittedAt
  const hasQr = hasPayQr()
  const guest = guest0().name
  const r0 = reqRecs().r0
  const bks = hostBookings().sort((x, y) => bkStart(x).getTime() - bkStart(y).getTime())
  /** other guests the host accepted on Requests (kept on this phone), soonest first */
  const mainAcc = reqAnswer('r0') === 'acc'
  const accepted = Object.entries(reqRecs()).filter(([id, r]) => id !== 'r0' && r.st === 'acc').map(([id, r]) => ({ id, ...r }))
    .sort((x, y) => new Date(x.when).getTime() - new Date(y.when).getTime())
  const waiting = openReqN()
  const steps: { id: string; label: string; done: boolean; go: string; note?: string }[] = [
    { id: 'verify', label: h('ht_step_verify'), done: verified, go: 'hverify', note: !verified && submitted ? h('hv_pending') : undefined },
    { id: 'create', label: h('ht_step_create'), done: !!title, go: 'hcreate' },
    { id: 'qr', label: h('ht_step_qr'), done: hasQr, go: 'hearn' },
  ]
  return (
    <>
      <HostTop active="htoday" />
      <div className="scroll"><div className="pad col rise" style={{ gap: 14, paddingBottom: 110 }}>
        <div className="row"><div className="col grow"><span className="small">{dLong}</span><h1 className="h2" id="ht-hello">{name ? h('ht_hello_n', { name }) : h('ht_hello')}</h1></div>{name ? <Av ch={ini(name)} s={44} photo={s.prof.hostPhoto} /> : null}</div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn gold" id="ht-post-story" data-go="story-create" data-how="f" style={{ flex: 1, height: 44, fontSize: 14 }}>
            + {t('stPostStory')}
          </button>
          <button type="button" className="chip" id="ht-profile-photo-btn" data-go="hverify" data-how="f" style={{ height: 44, padding: '0 14px', fontSize: 13 }}>
            {s.prof.hostPhoto ? h('hv_photo_change') : h('hv_photo_btn')}
          </button>
        </div>
        <label className="glass card row" style={{ gap: 10 }}><span className="grow">{t('hAway')}</span>
          <span className="sw"><input type="checkbox" id="away" checked={s.away} aria-label="away" onChange={(e) => { const v = e.target.checked; update((st) => { st.away = v }); toast(v ? h('ht_away_on') : h('ht_away_off')) }} /><i /></span></label>

        {!title ? (
          <div className="glass card col" id="ht-empty" style={{ gap: 10 }}>
            <b style={{ fontSize: 16 }}>{h('ht_empty_t')}</b>
            <span className="small">{h('ht_empty_sub')}</span>
            {steps.map((x, i) => (
              <button key={x.id} type="button" className="place" data-go={x.go} data-how="f" id={`ht-step-${x.id}`} style={{ width: '100%' }}>
                <i>{x.done ? <Chk s={16} /> : <b>{i + 1}</b>}</i>
                <span className="col grow"><b>{x.label}</b>{x.note ? <span className="small">{x.note}</span> : null}</span><Ic p={I.chev} s={16} />
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="glass card col" id="ht-myact" style={{ gap: 8 }}>
              <span className="eyebrow">{h('ht_myact')}</span>
              <b style={{ fontSize: 16 }}>{title}</b>
              <span className="small">{verified ? h('ht_live_note') : h('ht_review_note')}</span>
              <ShareLine title={title} id="ht-share-line" />
            </div>
            {!hasQr && <button type="button" className="glass card row" data-go="hearn" data-how="f" style={{ gap: 10, textAlign: 'left' }}><span className="grow">{h('ht_step_qr')}</span><Ic p={I.chev} s={16} /></button>}
            {waiting > 0 && !s.away && (
              <button className="glass card row" id="ht-req-link" data-go="hreq" data-how="f" style={{ gap: 10, textAlign: 'left' }}><span className="live" />
                <span className="grow">{h('ht_req_wait_n', { n: waiting })}</span><Ic p={I.chev} s={16} /></button>
            )}
            {bks.length > 0 && <span className="eyebrow" id="ht-bookings-h">{h('hb_title')}</span>}
            {bks.map((b, i) => <HostBookingCard key={i} b={b} onLate={() => open('late')} onCant={() => open('cant')} />)}
            {!bks.length && mainAcc && (
              <div className="glass card col" style={{ gap: 10 }}>
                <div className="row"><span className="eyebrow grow">{h('ht_next')}</span><span className="chip goldc" style={{ height: 28, fontSize: 12 }}>{dayFmt(new Date(r0?.when || s.dayDate), { weekday: 'short', day: 'numeric', month: 'short' })} · {r0?.time || s.time || '18:00'}</span></div>
                <div className="row"><Av ch={ini(guest)} s={46} /><div className="col grow"><b>{guest} · {title}</b><span className="small">{h('hr_acc_short')} · {h('ht_translate')}</span></div></div>
                <button className="chip" id="ht-chat-r0" style={{ alignSelf: 'flex-start' }} onClick={() => openHostChat('r0')}><Ic p={CHAT_IC} s={14} />{h('hb_msg', { name: guest })}</button>
                <div className="row" style={{ gap: 8 }}><button className="chip" id="hlate" onClick={() => open('late')}><Ic p={I.clock} s={14} />{h('ht_late')}</button><button className="chip" id="hcant" onClick={() => open('cant')}>{h('ht_cant')}</button></div>
              </div>
            )}
            {accepted.map((r) => (
              <div key={r.id} className="glass card col" id={'ht-acc-' + r.id} style={{ gap: 10 }}>
                <div className="row"><span className="eyebrow grow">{h('ht_next')}</span><span className="chip goldc" style={{ height: 28, fontSize: 12 }}>{dayFmt(new Date(r.when), { weekday: 'short', day: 'numeric', month: 'short' })} · {r.time}</span></div>
                <div className="row"><Av ch={ini(r.name)} s={46} /><div className="col grow"><b>{r.name} · {r.title}</b><span className="small">{h('hr_acc_short')} · {h('ht_translate')}</span></div></div>
                <button className="chip" id={'ht-chat-' + r.id} style={{ alignSelf: 'flex-start' }} onClick={() => openHostChat(r.id)}><Ic p={CHAT_IC} s={14} />{h('hb_msg', { name: guestName(r.id) })}</button>
                <div className="row" style={{ gap: 8 }}><button className="chip" onClick={() => open('late')}><Ic p={I.clock} s={14} />{h('ht_late')}</button><button className="chip" onClick={() => open('cant', r.id)}>{h('ht_cant')}</button></div>
              </div>
            ))}
          </>
        )}
        <div className="card promise" id="ht-money"><span style={{ flex: 'none' }}><Rings w={36} /></span><span style={{ fontSize: 14.5, lineHeight: 1.55 }}>{h('money_line')}</span></div>
      </div></div>
      <Sheet open={sh === 'late'} onClose={() => setSh(null)}>
        <b style={{ fontSize: 18 }}>{h('ht_late_q')}</b>
        <div className="chips">{[5, 10, 15, 20].map((m) => <button key={m} className="chip num" data-m={m} onClick={() => { setSh(null); toast(h('ht_late_sent')); update((st) => { st.late = m }) }}>{h('ht_min', { m })}</button>)}</div>
        <span className="small">{h('ht_late_rule')}</span>
      </Sheet>
      <Sheet open={sh === 'cant'} onClose={() => setSh(null)}>
        <b style={{ fontSize: 18 }}>{h('ht_cant_q', { q: k.q })}</b>
        <div className="chips">{['rain', 'sick', 'emerg'].map((x, i) => <button key={x} className="chip" data-c={i} onClick={cant}>{h('ht_cant_' + x)}</button>)}</div>
        <span className="small">{h('ht_cant_rule')}</span>
      </Sheet>
      <Tabs active="me" host />
    </>
  )
}

/* ---------- hreq ---------- */
interface Rq { id: string; name: string; code: string; note: string; when: Date; time: string; reply: string; main: boolean }
type Slot = { when: Date; time: string }
function HReq() {
  const s = useS()
  const title = myAct()
  const name = myName()
  const g0 = guest0()
  const sc = schedOf(title)
  const reqs: Rq[] = useMemo(() => {
    const rec = reqRecs()
    const slots = openSlots(title)
    const bk = mainBk()
    const saved = (id: string): Slot | null => (rec[id] && (id !== 'r0' || rec[id].key === mainKey()) ? { when: new Date(rec[id].when), time: rec[id].time } : null)
    // sample times come from the host's own days and start times
    const w0: Slot = saved('r0') || (bk ? { when: new Date(bk.date), time: bk.time || sc.times[0] } : slots[0] || { when: new Date(s.dayDate || new Date()), time: sc.times[0] })
    const k0 = slotKey(w0.when, w0.time)
    const w1: Slot = saved('r1') || slots.find((x) => dKey(x.when) !== dKey(w0.when)) || slots.find((x) => slotKey(x.when, x.time) !== k0) || w0
    // the third sample asks for the same time as the first one, so the host sees what a taken time looks like
    const w2: Slot = saved('r2') || w0
    // sample notes fit the host's own category: food questions only for food activities (Muay Thai gets a training note, etc.)
    const cat = String(actSet(title)?.cat || 'eat')
    const food = cat === 'eat' || cat === 'market' || cat === 'cook'
    const n0 = food ? h('hr_note0') : h('hr_note0_' + (['muay', 'river', 'games'].includes(cat) ? cat : 'games'))
    const n2 = food ? h('hr_note2') : h('hr_note2_gen')
    // every guest keeps the same name in every app language (the host must recognise them at the place)
    return [
      { id: 'r0', name: g0.name, code: g0.code, note: n0, when: w0.when, time: w0.time, reply: '15:00', main: true },
      { id: 'r1', name: rec.r1?.name || 'Lin', code: 'ZH', note: h('hr_note1'), when: w1.when, time: w1.time, reply: '15:00', main: false },
      { id: 'r2', name: rec.r2?.name || 'Arjun', code: 'HI', note: n2, when: w2.when, time: w2.time, reply: '15:00', main: false },
    ]
  }, [s.lang, s.dayDate, s.hostReqs, s.hostActs, s.bookings, title, g0.name, g0.code]) // eslint-disable-line react-hooks/exhaustive-deps
  // open the first request still waiting for an answer
  const [cur, setCur] = useState(() => Math.max(0, REQ_IDS.findIndex((id) => !reqAnswer(id))))
  const [cardIn, setCardIn] = useState(false)
  const [alt, setAlt] = useState(false)
  const [accd, setAccd] = useState<string | null>(null)
  const r = reqs[cur]
  const slotLabel = (x: Slot) => dayFmt(x.when, { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + x.time
  /** guests already accepted for the same start time as request q */
  const takenBy = (q: Rq) => acceptedAt(slotKey(q.when, q.time), q.id)
  const isFull = (q: Rq) => takenBy(q).length >= sc.perSlot
  /** other times to offer: only the host's own days and start times, never a full one or the asked time */
  const alts: Slot[] = useMemo(() => openSlots(title)
    .filter((x) => slotKey(x.when, x.time) !== slotKey(r.when, r.time) && acceptedAt(slotKey(x.when, x.time), r.id).length < sc.perSlot)
    .slice(0, 4), [title, r, sc.perSlot, s.hostReqs]) // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState<boolean[]>([])
  useEffect(() => { if (!title) return; const tm = setTimeout(() => { setCardIn(true); bell(0.3); buzz([20, 40, 20]) }, 450); return () => clearTimeout(tm) }, [title])
  const preview = `${t('altTimes', { host: name || t('hostMode') })} ${alts.filter((_, i) => sel[i]).map(slotLabel).join(' · ') || '—'}`
  /** Save the answer for this request (every request, not only the top one). */
  const setR = (v: ReqAns) => {
    const key = r.main ? mainKey() : undefined
    update((st) => { st.hostReqs = { ...((st.hostReqs || {}) as Record<string, ReqRec>), [r.id]: { st: v, name: r.name, when: r.when.toISOString(), time: r.time, title, key } } })
  }
  const openAlt = () => { setSel(alts.map(() => false)); setAlt(true); tick(0.5, 0.08) }
  const accept = () => {
    if (needAccount('hreq')) return
    if (isFull(r)) { buzz([40, 40, 40]); document.getElementById('req-clash')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return } // never two bookings over the limit for one time
    if (r.main) update((st) => { st.req = 'acc'; const bk = st.bookings.find((x) => x.kind === 'act' && x.status === 'pending'); if (bk) bk.status = 'confirmed' })
    setR('acc'); setAccd(r.name); chime(); buzz([30, 40, 60])
  }
  const nope = () => {
    if (r.main) update((st) => { st.req = 'no'; const bk = st.bookings.find((x) => x.kind === 'act' && x.status === 'pending'); if (bk) { giveLaunchBack(bk); bk.status = 'cancelled' } })
    setAlt(false); setR('no'); bell(0.2, 1319)
  }
  const send = () => { if (needAccount('hreq')) return; if (r.main) update((st) => { st.req = 'dec' }); setAlt(false); setR('dec'); bell(0.25, 1568) }
  const openReq = (i: number) => { setCur(i); setSel([]); tick(0.6, 0.06); document.getElementById('req')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const langName = (code: string) => (LN[code] ? LN[code][s.lang] : code)
  const mainDone = reqAnswer(r.id)
  const full = !mainDone && isFull(r)
  const clashNames = takenBy(r).map((x) => x.name).join(', ')
  return (
    <>
      <HostTop active="hreq" />
      <div className="scroll"><div className="pad col" style={{ gap: 12, paddingBottom: 110 }}>
        {!title ? (
          <div className="glass card col" id="hr-empty" style={{ gap: 10 }}>
            <b style={{ fontSize: 16 }}>{h('hr_empty_t')}</b>
            <span className="small">{h('hr_empty_sub')}</span>
            <button className="btn gold" data-go="hcreate" data-how="f">{h('ht_step_create')}</button>
          </div>
        ) : (
          <>
            {!s.prof.idVerified && <div className="card small" id="hr-sample-note" style={{ background: 'var(--glass2)', border: '1px solid rgba(255,208,103,.35)', lineHeight: 1.6 }}>{h('hr_sample')}</div>}
            <div className={`req glass card col ${cardIn ? 'in' : ''}`} id="req" style={{ gap: 12 }}>
              {mainDone ? (
                <>
                  <div className="row" id="req-done"><span className="ok"><Chk /></span><span className="grow">{mainDone === 'acc' ? h('hr_acc_done', { name: r.name }) : mainDone === 'no' ? h('hr_no_done', { name: r.name }) : h('hr_dec_done', { name: r.name })}</span></div>
                  {mainDone === 'acc' && <button className="chip" id="req-chat" style={{ alignSelf: 'flex-start' }} onClick={() => openHostChat(r.id)}><Ic p={CHAT_IC} s={14} />{h('hb_msg', { name: guestName(r.id) })}</button>}
                </>
              ) : (
                <>
                  <div className="row"><span className="eyebrow grow">{h('hr_new')}</span><span className="small">{h('hr_reply_by', { d: dayFmt(r.when, { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + r.reply })}</span></div>
                  <div className="row">
                    <Av ch={ini(r.name)} s={46} />
                    <div className="col grow">
                      <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <b id="req-guest-name">{r.name}</b>
                        <span className="pill th" id="guest-age-badge" style={{ fontSize: 11.5, padding: '2px 8px' }}>{h('hr_age')}</span>
                      </div>
                      <span className="small">{h('hr_speaks', { l: langName(r.code) })}</span>
                    </div>
                  </div>
                  <div className="quote">“{r.note}”</div>
                  <div className="col" style={{ gap: 0 }}>
                    <div className="line"><span>{h('hr_act')}</span><span>{title}</span></div>
                    <div className="line"><span>{h('hr_when')}</span><span>{dayFmt(r.when, { weekday: 'short', day: 'numeric', month: 'short' })} · {r.time}{full ? <span className="pill" id="req-slot-taken" style={{ marginLeft: 6, fontSize: 11.5, padding: '2px 8px', color: '#FF7A7A', borderColor: 'rgba(255,122,122,.5)' }}>{h('hr_slot_taken')}</span> : null}</span></div>
                    <div className="line"><span>{h('hr_people')}</span><span>{r.main ? s.guests : 1}</span></div>
                  </div>
                  {full ? (
                    <div className="guard" role="alert" id="req-clash" style={{ lineHeight: 1.55 }}>
                      <b>{h('hr_clash', { name: clashNames, when: slotLabel(r) })}</b><br />{h('hr_clash_sub', { name: r.name })}
                    </div>
                  ) : (
                    <div className="row" style={{ padding: '12px 14px', borderRadius: 16, background: 'rgba(255,178,30,.08)', border: '1px solid rgba(255,208,103,.3)' }}>
                      <span className="small grow">{h('hr_pay')}</span></div>
                  )}
                  {full
                    ? <button className="btn gold" id="dec" style={{ height: 50 }} onClick={openAlt}>{h('hr_other')}</button>
                    : <div className="row"><button className="btn ghost" id="dec" style={{ flex: 1 }} onClick={openAlt}>{h('hr_other')}</button><button className="btn gold" id="acc" style={{ flex: 1.4, height: 50 }} onClick={accept}>{h('hr_accept', { name: r.name })}</button></div>}
                </>
              )}
            </div>
            <span className="eyebrow">{h('hr_others')}</span>
            {reqs.map((o, i) => (i === cur ? null : (
              <button key={o.id} className="rmini" data-om={i} style={{ textAlign: 'left', width: '100%' }} onClick={() => openReq(i)}>
                <Av ch={ini(o.name)} s={40} />
                <div className="col grow"><b>{o.name} · {title}</b><span className="small">{dayFmt(o.when, { weekday: 'short' })} {o.time} · {h('hr_speaks', { l: langName(o.code) })}</span>
                  {reqAnswer(o.id) ? <span className="small" style={{ color: '#4CD39A' }}>{h('hr_answered')}</span> : isFull(o) ? <span className="small" style={{ color: '#FF7A7A' }}>{h('hr_slot_taken')}</span> : null}</div>
                <Ic p={I.chev} s={16} />
              </button>
            )))}
            <div className="card small" style={{ background: 'var(--glass2)', border: '1px solid var(--line)', lineHeight: 1.6 }}>{h('hr_norush')}</div>
          </>
        )}
      </div></div>
      <Sheet open={alt} onClose={() => setAlt(false)}>
        <b style={{ fontSize: 18 }}>{h('hr_offer_t')}</b>
        <span className="small">{h('hr_offer_own')}</span>
        {alts.length ? (
          <div className="chips" id="alts">{alts.map((x, i) => <button key={slotKey(x.when, x.time)} className={`chip num ${sel[i] ? 'on' : ''}`} aria-pressed={!!sel[i]} onClick={() => { setSel((a) => alts.map((_, j) => (j === i ? !a[j] : !!a[j]))); tick(0.6, 0.06) }}>{slotLabel(x)}</button>)}</div>
        ) : <div className="guard" role="status" id="alts-none">{h('hr_offer_none')}</div>}
        <span className="small">{h('hr_offer_pv', { name: r.name })}</span>
        <div className="quote" id="altpv" style={{ borderLeftColor: 'var(--anchan2)' }}>{preview}</div>
        <button className="btn gold" id="send" disabled={!sel.some(Boolean)} onClick={send}>{h('hr_send')}</button>
        <button className="btn ghost" id="nope" onClick={nope}>{h('hr_decline')}</button>
      </Sheet>
      {accd && (
        <div className="donev" id="accd"><svg className="chk" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" /><path d="M38 62l15 15 30-32" /></svg>
          <b style={{ fontSize: 24 }}>{h('hr_acc_t')}</b>
          <span className="small">{h('hr_acc_sub', { name: accd })}</span>
          <button className="btn ghost" style={{ width: 220 }} onClick={() => setAccd(null)}>{h('hr_back_req')}</button>
          <button className="btn ghost" data-go="htoday" data-how="f" style={{ width: 220 }}>{h('back_today')}</button></div>
      )}
      <Tabs active="me" host />
    </>
  )
}

/* ---------- hcreate ---------- */
const CATS = ['eat', 'market', 'muay', 'cook', 'river', 'games']
const IMG: Record<string, string> = { eat: 'yaowarat-food', market: 'flower-market', muay: 'muay-thai', cook: 'cooking-class', river: 'canal-longtail', games: 'cafe-desserts' }
const PLACE_IC: Record<string, string> = { arts: I.shield, venue: I.users }
/** Templates shown to hosts (the cinema one is left out: a dark cinema is not an open public meeting place). */
const TEMPLATES = APPROVED_ACTIVITY_TEMPLATES.filter((x) => x.id !== 'tpl_movie_cafe').map((x) => (x.id === 'tpl_board_game' ? { ...x, cat: 'games' } : x))
const DUR = ['1.5', '2', '3', '4'], SLT = ['06:00', '09:00', '13:00', '16:00', '18:00', '19:30']
/** Any start time in 15-minute steps, 06:00 to 22:00 (e.g. 18:30). */
const QUARTERS = Array.from({ length: 65 }, (_, i) => { const m = 360 + i * 15; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` })
const MAX_SLOT = 6
/** The activity being created, kept in the store so tabs, ID verification and reloads never lose it. */
interface Draft { st: number; name: string; cat: string; desc: string; cover: string; place: { th: string; en: string }; dur: number; times: string[]; days: boolean[]; perSlot: number; price: number; lastPaidPrice: number; isVolunteer: boolean; bringFriend: boolean }
const freshDraft = (): Draft => {
  const T0 = TEMPLATES[0]
  return {
    st: 1, name: '', cat: T0.cat, desc: '', cover: '', place: { th: T0.defaultPlaceTh, en: T0.defaultPlaceEn }, dur: 1,
    times: ['18:00'], days: Array.from({ length: 7 }, (_, i) => i >= 4), perSlot: 1,
    price: T0.suggestedPriceThb, lastPaidPrice: 800, isVolunteer: !!S.prof.is_volunteer, bringFriend: S.prof.bring_friend_first_3 ?? false,
  }
}
/** Shrink the cover photo on the phone (≤ 800 px JPEG) so the preview and the saved draft stay small. */
async function coverToJpeg(file: File): Promise<string> {
  const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file) })
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
  const k = Math.min(1, 800 / Math.max(img.width, img.height))
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.72)
}
const loadDraft = (): Draft => {
  const d = S.hostDraft as (Partial<Draft> & { slots?: boolean[] }) | null | undefined
  const f = freshDraft()
  if (!d || typeof d !== 'object') return f
  // older drafts kept fixed slots as on/off flags
  const oldTimes = Array.isArray(d.slots) && d.slots.length === SLT.length ? SLT.filter((_, i) => d.slots![i]) : null
  const { slots: _old, ...rest } = d
  void _old
  return {
    ...f, ...rest,
    st: d.st === 2 || d.st === 3 ? d.st : 1,
    desc: typeof d.desc === 'string' ? d.desc : '',
    cover: typeof d.cover === 'string' && d.cover.startsWith('data:image/') ? d.cover : '',
    place: d.place && typeof d.place.th === 'string' && typeof d.place.en === 'string' ? d.place : f.place,
    times: Array.isArray(d.times) ? d.times.filter((x) => QUARTERS.includes(x)) : oldTimes || f.times,
    days: Array.isArray(d.days) && d.days.length === 7 ? d.days : f.days,
    perSlot: Math.max(1, Math.min(MAX_SLOT, Math.round(Number(d.perSlot) || 1))),
  }
}
function HCreate() {
  const s = useS()
  const th = s.lang === 'th'
  const [d0] = useState(loadDraft)
  const fresh = useRef(JSON.stringify(freshDraft()))
  const [st, setSt] = useState(d0.st)
  const [name, setName] = useState(d0.name)
  const [cat, setCat] = useState<string>(d0.cat)
  const [place, setPlace] = useState<{ th: string; en: string }>(d0.place)
  const [dur, setDur] = useState(d0.dur)
  const [times, setTimes] = useState<string[]>(d0.times)
  const [desc, setDesc] = useState(d0.desc)
  const [cover, setCover] = useState(d0.cover)
  const [perSlot, setPerSlot] = useState(d0.perSlot)
  const [days, setDays] = useState(d0.days)
  const [isVolunteer, setIsVolunteer] = useState<boolean>(d0.isVolunteer)
  const [bringFriendFirst3, setBringFriendFirst3] = useState<boolean>(d0.bringFriend)
  const [price, setPrice] = useState(d0.price)
  const [lastPaidPrice, setLastPaidPrice] = useState(d0.lastPaidPrice)
  const [tried, setTried] = useState(false)
  const [plTab, setPlTab] = useState<'public' | 'venue'>(() => (PARTNER_VENUES.some((p) => p.th === d0.place.th) ? 'venue' : 'public'))
  const [plQ, setPlQ] = useState('')
  const [pub, setPub] = useState<null | { bg: string; x: string; y: string; r: string }[]>(null)
  const pv = useRef<HTMLDivElement>(null), sc = useRef<HTMLDivElement>(null)
  // keep the draft in the store on every change (only once the host changed something)
  useEffect(() => {
    if (pub) return
    const d: Draft = { st, name, cat, desc, cover, place, dur, times, days, perSlot, price, lastPaidPrice, isVolunteer, bringFriend: bringFriendFirst3 }
    const j = JSON.stringify(d)
    if (j === fresh.current && !S.hostDraft) return
    if (JSON.stringify(S.hostDraft || null) === j) return
    update((x) => { x.hostDraft = d as unknown as Record<string, unknown> })
  }, [st, name, cat, desc, cover, place, dur, times, days, perSlot, price, lastPaidPrice, isVolunteer, bringFriendFirst3, pub])
  const v = name.trim()
  const placeLabel = th ? place.th : place.en
  const issue = titleIssue(v)
  /** the description gets the same gender-only and adult checks as the title */
  const descIssue: TitleIssue = !desc.trim() ? null : GENDER_ONLY_RE.test(desc) ? 'gender' : ADULT_RE.test(desc) ? 'adult' : isTempleGuidingDesc(desc) ? 'temple' : null
  const descText = descIssue === 'gender' ? h('hc_err_gender') : descIssue === 'adult' ? h('hc_err_adult') : descIssue === 'temple' ? h('hc_err_temple_desc') : ''
  const noTime = !times.length || !days.some(Boolean)
  const verified = s.prof.idVerified, submitted = !!s.prof.idSubmittedAt
  const needQr = !hasPayQr()
  // where the PromptPay card sits on step 3 is decided when the step opens, so it does not jump while the host types
  const qrFirst = useMemo(() => !hasPayQr(), [st]) // eslint-disable-line react-hooks/exhaustive-deps
  const effectivePrice = isVolunteer ? 0 : price
  const dayNames = useMemo(() => Array.from({ length: 7 }, (_, i) => dayFmt(new Date(2024, 0, 1 + i), { weekday: 'short' })), [s.lang])
  const flash = () => { const e = pv.current; if (!e) return; e.classList.add('flash'); setTimeout(() => e.classList.remove('flash'), 400) }
  const toStep = (n: number) => { setSt(n); sc.current?.scrollTo({ top: 0, behavior: 'smooth' }) }
  const b1 = ((800 - 200) / 2300) * 100, b2 = ((1500 - 200) / 2300) * 100
  const toggleVolunteer = (checked: boolean) => {
    setIsVolunteer(checked)
    if (checked) { if (price > 0) setLastPaidPrice(price); setPrice(0) } else setPrice(Math.max(200, lastPaidPrice || 800))
    update((st0) => { st0.prof.is_volunteer = checked })
    flash()
  }
  const toggleBringFriend = (checked: boolean) => { setBringFriendFirst3(checked); update((st0) => { st0.prof.bring_friend_first_3 = checked }); flash() }
  const hasProfPhoto = !!s.prof.hostPhoto
  const canPublish = !issue && !descIssue && !noTime && !needQr && hasProfPhoto && (verified || submitted)
  const issueText = issue === 'empty' ? h('hc_err_empty') : issue === 'gender' ? h('hc_err_gender') : issue === 'adult' ? h('hc_err_adult') : issue === 'temple' ? h('hc_err_temple') : issue === 'activity' ? h('hc_err_activity') : ''
  /** Why Next / Send can't go on, shown right above the button (never a silent grey button). */
  // step 1: the reason sits right under the name field at the top; Next stays tappable and scrolls back to it
  const why = st === 1
    ? ''
    : st === 2
      ? (!place.th ? h('hc_pl_pick') : noTime ? h('hc_need_time') : '')
      : issue ? issueText : descIssue ? descText : noTime ? h('hc_need_time') : needQr ? h('hc_need_qr') : !hasProfPhoto ? h('hc_photo_first') : !verified && !submitted ? h('hc_verify_first') : ''
  const blocked = st === 1 ? false : st === 2 ? !place.th || noTime : !canPublish
  const next = () => {
    setTried(true)
    if (issue || descIssue) { toStep(1); buzz([30, 30, 30]); setTimeout(() => document.getElementById(issue ? 'tin' : 'hc-desc')?.focus(), 350); return }
    if (st < 3) { toStep(st + 1); setTried(false); tick(0.7, 0.08); return }
    if (!canPublish) return
    if (needAccount('hcreate')) return
    const pickedPlace = [...HOST_PLACES, ...PARTNER_VENUES].find((p) => p.th === place.th)
    update((st0) => {
      st0.myActs.push(v)
      // the activity's own settings: Requests offers only these days and times, and keeps to the bookings-at-once limit
      st0.hostActs = { ...(st0.hostActs || {}), [v]: { cat, desc: desc.trim(), cover, place, dur, times: [...times].sort(), days, perSlot, price: isVolunteer ? 0 : price, free: !!isVolunteer, status: 'review' } satisfies ActSet }
      st0.prof.is_volunteer = isVolunteer
      st0.prof.bring_friend_first_3 = bringFriendFirst3
      st0.hostDraft = null
    })
    void submitHostActivityForReview({
      title: v,
      category: cat,
      placeTh: place.th,
      placeEn: place.en,
      placeKind: pickedPlace?.kind,
      durationHours: parseFloat(DUR[dur] || '1.5'),
      priceThb: isVolunteer ? 0 : price,
      startTimes: [...times].sort(),
      days,
      isVolunteer,
      bringFriendFirst3,
    })
    chime()
    setPub(Array.from({ length: 40 }, () => ({ bg: pick(['#FFB21E', '#FFD067', '#7381FF', '#3446FF']), x: rand(-170, 170).toFixed(0) + 'px', y: rand(-260, 180).toFixed(0) + 'px', r: rand(-360, 360).toFixed(0) + 'deg' })))
  }
  const tog = (set: (f: (a: boolean[]) => boolean[]) => void, i: number) => { set((a) => a.map((x, j) => (j === i ? !x : x))); tick(0.6, 0.05) }
  const togTime = (x: string) => { setTimes((a) => (a.includes(x) ? a.filter((y) => y !== x) : [...a, x].sort())); tick(0.6, 0.05) }
  const timeChips = [...new Set([...SLT, ...times])].sort()
  const onCover = async (f: File | undefined) => { if (!f) return; try { setCover(await coverToJpeg(f)); flash(); tick(0.7, 0.06) } catch { toast(h('hc_cover_bad')) } }
  const plList = searchHostPlaces(plTab === 'venue' ? PARTNER_VENUES : HOST_PLACES, plQ)
  const pickPlace = (p: HostPlace) => { setPlace({ th: p.th, en: p.en }); flash(); tick(0.6, 0.06) }
  const inviteVenue = () => { go('venue-onboard', 'r'); try { history.replaceState(null, '', '#venue-onboard?ref=' + hostCode()) } catch { /* ignore */ } }
  const listed = [...HOST_PLACES, ...PARTNER_VENUES].some((p) => p.th === place.th)
  return (
    <>
      <HostTop active="hcreate" />
      <div className="scroll" ref={sc} style={{ overflowX: 'hidden' }}><div className="pad col" style={{ gap: 14, paddingBottom: 24, minWidth: 0 }}>
        <div className="steps3">{[h('hc_s1'), h('hc_s2'), h('hc_s3')].map((x, i) => <div key={i} className={i + 1 < st ? 'done' : i + 1 === st ? 'on' : ''}><i />{i + 1} {x}</div>)}</div>
        <div className="pv" ref={pv}>
          <span className="pimg"><img key={cover ? 'cover' : cat} src={cover || ph(IMG[cat] || 'yaowarat-food')} alt="" className="kb" /></span>
          <div className="col" style={{ padding: 12, gap: 4, minWidth: 0 }}>
            <b style={{ fontSize: 16, overflowWrap: 'anywhere' }}>{v || '—'}</b>
            <span className="small">{placeLabel}</span>
            {times.length > 0 && <span className="small num" id="pv-when">{[...times].sort().join(' · ')} · {h('hc_slot_n_t')}: {perSlot}</span>}
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="num" id="pv-price-badge" style={{ color: 'var(--gold2)', fontWeight: 700 }}>{isVolunteer ? h('hc_vol_badge') : baht(effectivePrice)}</span>
              {bringFriendFirst3 && <span className="pill gold" id="pv-bring-friend-pill" style={{ fontSize: 11, padding: '2px 8px' }}>{h('hc_friend_pill')}</span>}
            </div>
          </div>
        </div>
        {st === 1 && (
          <div className="col stp" style={{ gap: 12, minWidth: 0 }}>
            <label className="small" htmlFor="tin">{h('hc_name')}</label>
            <input className="tin" id="tin" value={name} maxLength={60} autoComplete="off" onChange={(e) => { setName(e.target.value); flash() }} />
            {(issue && issue !== 'empty') || (issue === 'empty' && tried) ? <div className="guard" id="activity-guard-msg" role="status">{issueText}</div> : null}
            <span className="eyebrow">{h('hc_tpl')}</span>
            <span className="small" id="hc-rule-note">{h('hc_rule_note')}</span>
            <div className="chips" id="d056-templates" style={{ flexWrap: 'wrap', minWidth: 0 }}>
              {TEMPLATES.map((tpl) => (
                <button key={tpl.id} type="button" data-tpl={tpl.id}
                  className={`chip ${name === tpl.titleTh || name === tpl.titleEn ? 'on' : ''}`}
                  style={{ height: 'auto', padding: '7px 11px', fontSize: 12.5, whiteSpace: 'normal', textAlign: 'left', maxWidth: '100%' }}
                  onClick={() => { setName(th ? tpl.titleTh : tpl.titleEn); setCat(tpl.cat); setPlace({ th: tpl.defaultPlaceTh, en: tpl.defaultPlaceEn }); if (!isVolunteer) setPrice(tpl.suggestedPriceThb); flash(); tick(0.6, 0.05) }}>
                  {th ? tpl.titleTh : tpl.titleEn}
                </button>
              ))}
            </div>
            <div className="chips">{CATS.map((c) => <button key={c} className={`chip ${c === cat ? 'on' : ''}`} data-c={c} onClick={() => { setCat(c); flash(); tick(0.6, 0.06) }}>{t('c_' + c)}</button>)}</div>
            <label className="small" htmlFor="hc-desc">{h('hc_desc')}</label>
            <textarea className="tin" id="hc-desc" rows={4} maxLength={600} value={desc} placeholder={h('hc_desc_ph')}
              style={{ height: 'auto', minHeight: 104, padding: '10px 12px', lineHeight: 1.5, resize: 'vertical', fontSize: 15 }} onChange={(e) => setDesc(e.target.value)} />
            <div className="row small" style={{ justifyContent: 'space-between' }}><span>{h('hc_desc_sub')}</span><span className="num">{desc.length}/600</span></div>
            {descIssue && <div className="guard" id="hc-desc-guard" role="status">{descText}</div>}
            <span className="small">{h('hc_cover')}</span>
            <div className="row" id="hc-cover-row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {cover && <img src={cover} alt="" id="hc-cover-img" style={{ width: 84, height: 60, objectFit: 'cover', borderRadius: 10 }} />}
              <label className="chip" htmlFor="hc-cover" style={{ minHeight: 40, cursor: 'pointer' }}><Ic p={I.camera} s={16} />{cover ? h('hc_cover_change') : h('hc_cover_btn')}</label>
              {cover && <button type="button" className="chip" id="hc-cover-remove" style={{ minHeight: 40 }} onClick={() => { setCover(''); flash() }}>{h('hc_cover_remove')}</button>}
              <input id="hc-cover" type="file" accept="image/*" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onChange={(e) => { void onCover(e.target.files?.[0]); e.target.value = '' }} />
            </div>
            <span className="small">{h('hc_cover_note')}</span>
            <label className="glass card row" id="bring-friend-card" style={{ gap: 10, padding: 12 }}>
              <span className="col grow" style={{ gap: 2 }}><b>{h('hc_friend')}</b><span className="small">{h('hc_friend_sub')}</span></span>
              <span className="sw"><input type="checkbox" id="bring-friend-toggle" checked={bringFriendFirst3} onChange={(e) => toggleBringFriend(e.target.checked)} /><i /></span>
            </label>
            <label className="glass card row" id="volunteer-host-card" style={{ gap: 10, padding: 12 }}>
              <span className="col grow" style={{ gap: 2 }}><b>{h('hc_vol')}</b><span className="small">{h('hc_vol_sub')}</span></span>
              <span className="sw"><input type="checkbox" id="volunteer-host-toggle" checked={isVolunteer} onChange={(e) => toggleVolunteer(e.target.checked)} /><i /></span>
            </label>
          </div>
        )}
        {st === 2 && (
          <div className="col stp" style={{ gap: 10 }}>
            <span className="eyebrow">{h('hc_where')}</span>
            <div className="chips" id="hc-place-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={plTab === 'public'} className={`chip ${plTab === 'public' ? 'on' : ''}`} id="hc-pl-public" onClick={() => { setPlTab('public'); tick(0.6, 0.05) }}>{h('hc_pl_public')}</button>
              <button type="button" role="tab" aria-selected={plTab === 'venue'} className={`chip ${plTab === 'venue' ? 'on' : ''}`} id="hc-pl-venue" onClick={() => { setPlTab('venue'); tick(0.6, 0.05) }}>{h('hc_pl_venue')}</button>
            </div>
            <label className="inp glass" style={{ height: 46 }}><Ic p={I.search} s={16} />&nbsp;
              <input id="hc-place-search" type="search" value={plQ} placeholder={h('hc_pl_search')} aria-label={h('hc_pl_search')} onChange={(e) => setPlQ(e.target.value)} /></label>
            {!listed && place.th && <div className="place on"><i><Ic p={I.pin} s={18} /></i><span className="col grow"><b>{placeLabel}</b></span></div>}
            <div className="col" id="hc-place-list" style={{ gap: 8, maxHeight: 340, overflowY: 'auto' }}>
              {plList.map((p) => (
                <button key={p.id} type="button" className={`place ${p.th === place.th ? 'on' : ''}`} data-p={p.th} data-place={p.id} aria-pressed={p.th === place.th} onClick={() => pickPlace(p)}>
                  <i><Ic p={PLACE_IC[p.kind] || I.pin} s={18} /></i><span className="col grow"><b>{th ? p.th : p.en}</b><span className="small">{h('hc_pk_' + p.kind)} · {th ? p.areaTh : p.area}</span></span></button>
              ))}
              {!plList.length && <span className="small" id="hc-place-none">{h('hc_pl_none')}</span>}
            </div>
            {plTab === 'venue' && (
              <div className="col" style={{ gap: 6 }}>
                <span className="small">{h('hc_pl_venue_note')}</span>
                <button type="button" className="btn ghost" id="hc-invite-venue" style={{ height: 40, fontSize: 13 }} onClick={inviteVenue}>{h('hc_invite_venue')}</button>
              </div>
            )}
            <span className="small">{h('hc_where_note')}</span>
            <span className="eyebrow">{h('hc_dur')}</span>
            <div className="chips">{DUR.map((x, i) => <button key={x} className={`chip ${i === dur ? 'on' : ''}`} onClick={() => { setDur(i); tick(0.6, 0.05) }}>{t('hrs', { h: x })}</button>)}</div>
            <span className="eyebrow">{h('hc_times')}</span>
            <div className="chips" id="hc-times">{timeChips.map((x) => <button key={x} className={`chip num ${times.includes(x) ? 'on' : ''}`} aria-pressed={times.includes(x)} onClick={() => togTime(x)}>{x}</button>)}</div>
            <label className="row small" style={{ gap: 8, alignItems: 'center' }}>{h('hc_time_add')}
              <select className="tin num" id="hc-time-add" value="" style={{ height: 40, width: 110, fontSize: 15 }}
                onChange={(e) => { const x = e.target.value; if (x && !times.includes(x)) togTime(x) }}>
                <option value="">--:--</option>
                {QUARTERS.map((q) => <option key={q} value={q} disabled={times.includes(q)}>{q}</option>)}
              </select>
            </label>
            <span className="eyebrow">{h('hc_days')}</span>
            <div className="chips">{dayNames.map((x, i) => <button key={i} className={`chip ${days[i] ? 'on' : ''}`} aria-pressed={days[i]} onClick={() => tog(setDays, i)}>{x}</button>)}</div>
            <div className="glass card col" id="hc-slots-card" style={{ gap: 8, padding: 12 }}>
              <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                <b className="grow">{h('hc_slot_n_t')}</b>
                <button type="button" className="chip num" id="hc-slot-minus" aria-label="−" style={{ width: 40, justifyContent: 'center' }} disabled={perSlot <= 1} onClick={() => { setPerSlot((n) => Math.max(1, n - 1)); tick(0.5, 0.05) }}>−</button>
                <b className="num" id="hc-slot-n" style={{ minWidth: 22, textAlign: 'center', fontSize: 18 }}>{perSlot}</b>
                <button type="button" className="chip num" id="hc-slot-plus" aria-label="+" style={{ width: 40, justifyContent: 'center' }} disabled={perSlot >= MAX_SLOT} onClick={() => { setPerSlot((n) => Math.min(MAX_SLOT, n + 1)); tick(0.7, 0.05) }}>+</button>
              </div>
              <span className="small" id="hc-slot-sub">{h('hc_slot_n_sub', { n: perSlot })}</span>
              <span className="small">{h('hc_max2')}</span>
            </div>
          </div>
        )}
        {st === 3 && (
          <div className="col stp" style={{ gap: 12 }}>
            {/* no PromptPay yet: the field comes first, so it is never under the Submit button */}
            {qrFirst && <PayQrFields />}
            <div className="row">
              <span className="small grow">{h('hc_price')}</span>
              <span className="num" id="step3-price-display" style={{ fontSize: 24, color: 'var(--gold2)' }}>{isVolunteer ? h('hc_vol_badge') : baht(effectivePrice)}</span>
            </div>
            {!isVolunteer && (
              <>
                <input type="range" className="rng" id="host-price-slider" min={200} max={2500} step={50} value={price} aria-label="Price" onChange={(e) => setPrice(+e.target.value)}
                  style={{ background: `linear-gradient(90deg,rgba(255,255,255,.12) 0 ${b1}%,rgba(255,178,30,.45) ${b1}% ${b2}%,rgba(255,255,255,.12) ${b2}% 100%)` }} />
                <div className="row small" style={{ justifyContent: 'space-between' }}><span>฿200</span><span style={{ color: 'var(--gold2)' }}>{h('hc_reco')}</span><span>฿2,500</span></div>
                <label className="row small" style={{ gap: 8, alignItems: 'center' }}>{h('hc_type_price')}
                  <input className="tin num" id="host-price-input" inputMode="numeric" style={{ height: 40, width: 110, fontSize: 16 }} value={price || ''}
                    onChange={(e) => setPrice(Math.min(2500, +e.target.value.replace(/\D/g, '') || 0))} onBlur={() => setPrice((x) => Math.max(200, Math.min(2500, x)))} />
                </label>
              </>
            )}
            <div className="glass card col" style={{ gap: 0 }} id="hc-money">
              <div className="line"><span>{h('hc_you_get')}</span><span className="num" style={{ color: 'var(--gold2)' }}>{baht(effectivePrice)}</span></div>
              <div className="line"><span>{h('hc_ticket')}</span><span className="num">{baht(ticketFor(effectivePrice))}</span></div>
              <span className="small" style={{ paddingTop: 6 }}>{h('hc_ticket_sub', { t: baht(ticketFor(effectivePrice)) })}</span>
            </div>
            {!qrFirst && <PayQrFields />}
            {!hasProfPhoto && (
              <div className="glass card col" id="hc-photo-warn" style={{ gap: 8 }}>
                <b>{h('hv_photo')}</b>
                <span className="small">{h('hv_photo_sub')}</span>
                <label className="btn ghost" id="hc-photo-upload-btn" style={{ height: 40, cursor: 'pointer' }}>
                  {h('hv_photo_btn')}
                  <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void coverToJpeg(f).then((u) => { update((st0) => { st0.prof.hostPhoto = u }); toast(h('hv_photo_saved')) }) }} />
                </label>
              </div>
            )}
            {!verified && (
              <div className="glass card col" id="hc-verify-warn" style={{ gap: 8, border: '1px solid rgba(255,208,103,.45)' }}>
                <b>{submitted ? h('hc_verify_pending') : h('hc_verify_first')}</b>
                {!submitted && <button className="btn ghost" id="hc-verify-now" style={{ height: 40 }} onClick={() => { if (!needAccount('hverify')) go('hverify', 'f') }}>{h('hc_verify_now')}</button>}
              </div>
            )}
          </div>
        )}
      </div></div>
      <div className="footer dock hc-foot" style={{ paddingBottom: 12, flexDirection: 'column', gap: 8 }}>
        {why && <div className="guard" role="status" id="hc-why" style={{ margin: 0, padding: '8px 12px', fontSize: 13.5, background: '#1E1806' }}>{why}</div>}
        <div className="row" style={{ gap: 10, width: '100%' }}>
          {st > 1 && <button className="btn ghost" id="bk" style={{ flex: 1 }} onClick={() => toStep(st - 1)}>{h('hc_back')}</button>}
          <button className="btn gold" id="nx" style={{ flex: 2 }} disabled={blocked} aria-describedby={why ? 'hc-why' : undefined} onClick={next}>{st === 3 ? (verified ? h('hc_publish') : h('hc_submit')) : h('hc_next')}</button>
        </div>
      </div>
      {pub && (
        <div className="donev" id="pub"><div className="confetti">{pub.map((c, i) => <i key={i} style={{ background: c.bg, ['--x' as string]: c.x, ['--y' as string]: c.y, ['--r' as string]: c.r } as CSSProperties} />)}</div>
          <svg className="chk" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" /><path d="M38 62l15 15 30-32" /></svg>
          <b style={{ fontSize: 24 }}>{h('hc_sent_t')}</b>
          <span className="small">{verified ? h('hc_sent_sub') : h('hc_sent_sub_id')}</span>
          <div style={{ width: 240 }}><ShareLine title={v} id="pub-share-line" /></div>
          <button className="btn ghost" data-go="htoday" data-how="f" style={{ width: 240 }}>{h('back_today')}</button></div>
      )}
      <Tabs active="me" host />
    </>
  )
}

/* ---------- hearn: a record of what guests paid the host (no balance, no payouts, no fees) ---------- */
function HEarn() {
  useS()
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000
  const recs = receivedRecords().sort((x, y) => String(y.settled_at).localeCompare(String(x.settled_at)))
  const week = recs.filter((b) => new Date(b.settled_at!).getTime() >= weekAgo).reduce((n, b) => n + bkPay(b), 0)
  return (
    <>
      <HostTop active="hearn" />
      <div className="scroll"><div className="pad col rise" style={{ gap: 14, paddingBottom: 130 }}>
        <h1 className="h2">{h('he_title')}</h1>
        <div className="glass card col" id="he-record" style={{ gap: 6 }}>
          <span className="small">{h('he_week')}</span>
          <span className="num huge" id="he-week-total" style={{ color: 'var(--gold2)' }}>{baht(week)}</span>
          {!recs.length && <span className="small" id="he-empty">{h('he_none')}</span>}
          {recs.map((b, i) => (
            <div key={i} className="line" data-rec={i}><span>{dayFmt(new Date(b.settled_at!), { weekday: 'short', day: 'numeric', month: 'short' })} · {aTitle(bkAct(b))}</span><span className="num">{baht(bkPay(b))}</span></div>
          ))}
          {recs.length > 0 && <span className="small">{h('he_rec_note')}</span>}
        </div>
        <div className="card promise" id="he-money"><span style={{ flex: 'none' }}><Rings w={36} /></span><span style={{ fontSize: 14, lineHeight: 1.55 }}>{h('he_how')}</span></div>
        <PayQrFields />
        <p className="small">{h('he_tax')}</p>
      </div></div>
      <Tabs active="me" host />
    </>
  )
}

/* ---------- claim (?claim=<token> | ?biz=<token> — Section 15 Outreach Brain v7) ---------- */
interface ClaimPayload {
  card_id?: string
  variant?: 'H1_THAI_WARM' | 'H2_BILINGUAL_CREATOR' | 'B1_VENUE_DEAL'
  kind?: 'host' | 'venue' | 'creator' | 'community'
  first_name?: string
  company_name?: string
  category?: string
  place_code?: string
  place_th?: string
  place_en?: string
  city?: string
  payload?: {
    activity_title_th?: string
    activity_title_en?: string
    price_thb?: number
    host_payout_thb?: number
    offer_summary_th?: string
  }
}

function ClaimScreen() {
  useS()
  const k = kp()
  const params = new URLSearchParams(location.search)
  const rawToken = (params.get('claim') || params.get('biz') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)
  const isBiz = !!params.get('biz')
  const [data, setData] = useState<ClaimPayload>({
    variant: isBiz ? 'B1_VENUE_DEAL' : 'H1_THAI_WARM',
    kind: isBiz ? 'venue' : 'host',
    place_th: 'อารีย์',
    place_en: 'Ari',
    city: 'bangkok',
    payload: {
      activity_title_th: isBiz ? 'ดีลพิเศษสำหรับลูกค้า Kring' : 'เดินเล่นคาเฟ่และถ่ายรูปย่านอารีย์',
      activity_title_en: isBiz ? 'Kring guest deal' : 'Ari Cafe Hop & Photo Walk',
      price_thb: 800,
    },
  })

  useEffect(() => {
    if (!rawToken || rawToken.length < 16 || !configured()) return
    const env = (import.meta.env ?? {}) as Record<string, string | undefined>
    const url = env.VITE_SUPABASE_URL?.trim() || ''
    const anon = env.VITE_SUPABASE_ANON_KEY?.trim() || ''
    if (!url || !anon) return
    fetch(`${url}/rest/v1/rpc/ob_resolve_claim_token`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: rawToken }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((res: ClaimPayload | null) => {
        if (res && typeof res === 'object') setData((prev) => ({ ...prev, ...res }))
      })
      .catch(() => undefined)
  }, [rawToken])

  const actTitle = data.payload?.activity_title_th || 'เดินเล่นคาเฟ่และถ่ายรูปย่านอารีย์'
  const price = data.payload?.price_thb || 800
  const placeTh = data.place_th || 'อารีย์'

  return (
    <>
      <HostTop active="hcreate" />
      <div className="scroll">
        <div className="pad col rise" style={{ gap: 14, paddingBottom: 120 }}>
          <div className="glass card col" style={{ gap: 12, border: '1px solid rgba(255,208,103,.35)' }}>
            <div className="row" style={{ gap: 10 }}>
              <Rings w={42} />
              <div className="col grow">
                <b className="th" style={{ fontSize: 18 }}>Kring · กริ๊ง!</b>
                <span className="small th">กิจกรรมกับโฮสต์ที่ยืนยันตัวตนแล้ว · Activities with verified hosts</span>
              </div>
              <span className="chip goldc th" style={{ height: 28, fontSize: 11.5 }}>คำเชิญโฮสต์</span>
            </div>

            <h1 className="h2 th" style={{ margin: '4px 0 0' }}>
              <TTh th={`เปลี่ยนวันว่างแถว${placeTh} ให้เป็นทริปสนุกๆ ในสไตล์คุณ${k.p}`} en={`Turn your free time around ${data.place_en || 'Ari'} into an activity you enjoy`} />
            </h1>

            <div className="glass card col th" style={{ gap: 6, background: 'rgba(255,178,30,.09)', border: '1px solid rgba(255,208,103,.28)' }}>
              <span className="small">ตัวอย่างทริปที่ตั้งไว้ให้คุณ (แก้ไขได้ทุกช่อง)</span>
              <b style={{ fontSize: 17 }}>{actTitle} · ย่าน{placeTh}</b>
              <span style={{ color: 'var(--gold2)', fontWeight: 700, fontSize: 18 }}>ราคากิจกรรม ฿{price.toLocaleString('en-US')} ผู้ร่วมทริปจ่ายให้คุณโดยตรงที่จุดนัดพบ</span>
              <span className="small" style={{ color: 'var(--ink2)' }}>จ่ายหลังเช็กอิน ผ่าน QR พร้อมเพย์ของคุณหรือเงินสด กริ๊งไม่ถือเงินของคุณ</span>
            </div>

            <div className="col th" style={{ gap: 8 }}>
              <b>ข้อดีของการเป็นโฮสต์บน Kring</b>
              <div className="srow"><i><Chk s={16} /></i><span>ตั้งราคาและวันว่างเองได้ รับเฉพาะทริปที่อยากไป</span></div>
              <div className="srow"><i><Chk s={16} /></i><span>นัดเจอเฉพาะที่สาธารณะที่มีชื่อชัดเจน ยืนยันตัวตนก่อนเริ่ม</span></div>
              <div className="srow"><i><Chk s={16} /></i><span>ผู้ร่วมทริปจ่ายค่ากิจกรรมให้คุณเองที่จุดนัดพบ ด้วย QR ของคุณหรือเงินสด</span></div>
              <div className="srow"><i><Chk s={16} /></i><span>แชตแปลภาษาอัตโนมัติในแอป ไม่ต้องให้เบอร์โทรหรือ LINE ส่วนตัว</span></div>
            </div>

            <button className="btn gold th" id="claimGo" onClick={() => { bell(0.35); go('hcreate', 'r') }}>
              <TTh th="ตั้งค่าทริปของฉันใน 60 วินาที" en="Customize my activity in 60 seconds" />
            </button>
          </div>
        </div>
      </div>
      <Tabs active="me" host />
    </>
  )
}

/* ---------- hcreator: the host's own intro ad + creator board ---------- */
function HCreator() {
  const s = useS()
  const [sparkModal, setSparkModal] = useState(false)
  const [sparkCode, setSparkCode] = useState('')
  const [metaPerm, setMetaPerm] = useState(false)
  const [sparkSaved, setSparkSaved] = useState(false)
  const rankedCreators = useMemo(() => rankCreatorBoard(FIXTURE_CREATOR_BOARD_ENTRIES), [])
  const title = myAct()
  const name = myName()
  const code = hostCode()
  const submitSpark = () => {
    if (!sparkCode.trim() && !metaPerm) return
    setSparkSaved(true); setSparkModal(false); chime(); toast(t('savedT'))
  }
  const copyLink = () => { try { void navigator.clipboard.writeText(refLink()).catch(() => undefined) } catch { /* ignore */ } toast(h('hcr_copied')) }
  return (
    <>
      <HostTop active="hcreator" />
      <div className="scroll">
        <div className="pad col rise" style={{ gap: 14, paddingBottom: 120 }}>
          <h1 className="h2">{h('hcr_title')}</h1>
          <div className="glass card col" id="host-auto-reel-card" style={{ gap: 10 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <b style={{ fontSize: 16 }}>{h('hcr_ad_t')}</b>
              <span className="pill gold num">#ad</span>
            </div>
            {!title ? (
              <>
                <span className="small" id="hcr-empty">{h('hcr_need_act')}</span>
                <button className="btn gold" data-go="hcreate" data-how="f">{h('ht_step_create')}</button>
              </>
            ) : (
              <>
                <span className="small">{h('hcr_ad_sub')}</span>
                <div id="hcr-ad" style={{ background: '#0B0E1A', border: '1px solid rgba(52, 70, 255, 0.45)', borderRadius: 14, padding: 12 }}>
                  <div style={{ color: '#FFB21E', fontWeight: 700, fontSize: 14 }}>{name ? h('hcr_ad_l1_n', { title, name }) : h('hcr_ad_l1', { title })}</div>
                  <div style={{ fontSize: 12.5, marginTop: 4 }}>{h('hcr_ad_l2', { t: baht(199) })}</div>
                  <div className="small num" style={{ marginTop: 6, color: 'var(--anchan2)' }}>{h('hcr_code', { code })}</div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn ghost" id="hcr-copy" style={{ flex: 1 }} onClick={copyLink}>{h('hcr_copy')}</button>
                  <div style={{ flex: 1 }}><ShareLine title={title} id="hcr-share-line" /></div>
                </div>
                <span className="small">{h('hcr_score')}</span>
                <button className="btn gold" id="let-kring-boost-btn" onClick={() => { setSparkModal(true); tick(0.7, 0.07) }}>{h('hcr_boost')}</button>
                {sparkSaved && <span className="small" id="spark-saved-note" style={{ color: '#4CD39A' }}>{h('hcr_boost_saved')}</span>}
              </>
            )}
          </div>

          <div className="glass card col" id="creator-board-card" style={{ gap: 10 }}>
            <b style={{ fontSize: 16 }}>{h('hcr_board')}</b>
            <span className="small">{h('hcr_board_sub')}</span>
            {rankedCreators.map((r) => (
              <div key={r.hostId} className="row" style={{ justifyContent: 'space-between', padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.04)' }}>
                <div className="col">
                  <b>#{r.rank} · {s.lang === 'th' ? r.firstNameTh : r.firstNameEn}</b>
                  <span className="small">{h('hcr_row', { p: r.platformsPostedCount, v: r.verifiedViewsTotal.toLocaleString('en-US'), r: r.referralCount })}</span>
                </div>
                <span className="pill gold num" style={{ fontWeight: 700, whiteSpace: 'nowrap', flex: 'none' }}>{h('hcr_pts', { n: r.score })}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Sheet open={sparkModal} onClose={() => setSparkModal(false)}>
        <b style={{ fontSize: 18 }}>{h('hcr_boost')}</b>
        <span className="small">{h('hcr_boost_sub')}</span>
        <label className="inp glass" style={{ height: 48 }}>
          <input id="spark-code-input" placeholder="TikTok Spark Ads" value={sparkCode} onChange={(e) => setSparkCode(e.target.value)} />
        </label>
        <label className="row small" style={{ gap: 10, alignItems: 'center' }}>
          <input type="checkbox" id="meta-partnership-checkbox" checked={metaPerm} onChange={(e) => setMetaPerm(e.target.checked)} />
          <span>{h('hcr_meta')}</span>
        </label>
        <button className="btn gold" id="spark-submit-btn" onClick={submitSpark}>{h('hcr_boost_save')}</button>
      </Sheet>
      <Tabs active="me" host />
    </>
  )
}

register(
  { id: 'hverify', flow: 'h', title: 'Host · Verify', C: HVerify },
  { id: 'htoday', flow: 'h', title: 'Host · Today', C: HToday },
  { id: 'hreq', flow: 'h', title: 'Host · Requests', C: HReq },
  { id: 'hcreate', flow: 'h', title: 'Host · Create activity', C: HCreate },
  { id: 'hcreator', flow: 'h', title: 'Host · Creator Board & Reel', C: HCreator },
  { id: 'hearn', flow: 'h', title: 'Host · Earnings', C: HEarn },
  { id: 'claim', flow: 'h', title: 'Host · Claim Invite', C: ClaimScreen },
)
