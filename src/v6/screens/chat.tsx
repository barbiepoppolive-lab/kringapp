/* Chat with the host: scripted host messages, translation of incoming messages, attachments, voice, search,
   meeting point, block and report. One conversation per activity/host (S.chats[actId]), kept across reloads.
   Red lines kept: contact details masked, only allow-listed links preview, sexual/solicitation messages are not sent,
   no payments of any kind in chat (no gifts, no tips). */
import { useEffect, useMemo, useRef, useState, type ReactNode, type MouseEvent as RME, type ChangeEvent } from 'react'
import { S, update, useS, type Booking } from '../core/store'
import { meetMapsUrl, meetName, meetNameTh, meetAddress } from '../core/places'
import { t, act, ACTS, bTime, dayFmt, ini, dietWord, aTitle, hostName, baht, ph, caseNo, type Act } from '../core/data'
import { loadLiveActivities } from '../core/liveActivities'
import { register, go, toast, needAccount, hasAccount } from '../core/router'
import { api } from '../core/api'
import { bell, buzz, tick } from '../core/sound'
import { maskTxt, OFFAPP, PREPAY, linkInfo, isSolicitation, isAbusive, isAroundKring } from '../core/guard'
import { CHAT_DRAFT, chatTarget, chatBooking, isBlocked, openChat, SAMPLE_GUESTS, hostReq, guestName, acceptedGuests, guestChatKey, hostChatTarget, openHostChat } from '../core/chatLinks'
import { detectMessageLang, translateChatMessage, translateMaskedSync } from '../core/translate'
import { searchAllowedPublicPlaces, type CandidatePlace } from '../core/placesFilter'
import { I, Ic, Av, Sheet, Tabs } from '../ui/kit'

/* ---------- helpers ---------- */
const MORE = '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'
/** The booking a chat is about (the next upcoming live one; see chatBooking for a specific reference). */
export const bookingFor = (id: string): Booking | undefined => chatBooking(id)
const hostKey = (id: string): string => 'host:' + id
export const isBlockedHost = (id: string): boolean => {
  const a = ACTS.find((x) => x.id === id)
  return S.blocked.some((b) => b.id === hostKey(id)) || (!!a && isBlocked(a.host))
}
/** Google Maps search link for the meeting point (coordinates when the booking has them). */
const mapsUrl = (a: Act, b?: Booking): string => meetMapsUrl(a, b)
const sameDay = (d: Date): boolean => new Date(d).toDateString() === new Date().toDateString()
/** Object URLs of photos/videos picked in this page session (older ones die on reload and are dropped). */
const SESSION_BLOBS = new Set<string>()
/** visually hidden, read by screen readers (who said each message) */
const SR = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const
const nowT = (): string => new Date().toTimeString().slice(0, 5)
const Meta = ({ at }: { at: string }) => <span className="mmeta">{at} <i>✓✓</i></span>

const MAP_BG = `<rect width="240" height="120" fill="#0B0F2A"/>
  <g stroke="rgba(255,255,255,.07)" stroke-width="7" fill="none"><path d="M0 30H240M0 100H240M40 0V120M150 0V120M200 0V120"/><path d="M0 60L240 20" stroke-width="4"/></g>
  <path d="M-10 92C40 74 74 104 122 86S204 58 252 72" stroke="#1C2A78" stroke-width="15" fill="none"/>`
const MAP_LIVE = `<circle cx="120" cy="58" r="10" fill="#3446FF" opacity=".35"><animate attributeName="r" values="8;26;8" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values=".45;0;.45" dur="2s" repeatCount="indefinite"/></circle><circle cx="120" cy="58" r="8" fill="#7381FF" stroke="#fff" stroke-width="3"/>`
const MAP_PIN = `<ellipse cx="120" cy="74" rx="9" ry="3" fill="rgba(0,0,0,.4)"/><path d="M120 74c-9-11-14-18-14-25a14 14 0 0 1 28 0c0 7-5 14-14 25z" fill="#FFB21E" stroke="#FFD067" stroke-width="2"/><circle cx="120" cy="49" r="5" fill="#05060D"/>`
const MapSVG = ({ live }: { live: boolean }) => <svg viewBox="0 0 240 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MAP_BG + (live ? MAP_LIVE : MAP_PIN) }} />

/* Sent items live in S.chats[actId] as JSON (structured, never raw HTML, so user text can't become markup). */
type X = (
  | { k: 'text'; t: string; tr?: string; srcLang?: string; l?: string; at: string }
  | { k: 'photo'; src: string; at: string }
  | { k: 'album'; list: string[]; at: string }
  | { k: 'video'; src: string; poster: string; dur: string; at: string }
  | { k: 'voice'; sec: number; at: string }
  | { k: 'place'; live: boolean; a: string; at: string }
  | { k: 'proposed_place'; place_id: string; name: string; nameTh?: string; district: string; lat: number; lng: number; hours: string; accepted?: boolean; at: string }
  | { k: 'link'; raw: string; at: string }
  | { k: 'act'; id: string; at: string }
) & {
  /** sent before there was a booking (a question before booking): shown above the host's booking messages */
  pre?: boolean
}
const parseX = (s: string): X | null => { try { return JSON.parse(s) as X } catch { return null } }
const deadUrl = (u: string): boolean => u.startsWith('blob:') && !SESSION_BLOBS.has(u)
/** Photos/videos whose local object URL no longer exists (after a reload). */
const deadBlob = (x: X | null): boolean =>
  !!x && ((x.k === 'photo' && deadUrl(x.src)) || (x.k === 'video' && deadUrl(x.src)) || (x.k === 'album' && x.list.some(deadUrl)))

const RECENT: [string, number][] = [['yaowarat-food', 0], ['night-market', 1], ['wat-arun-temple', 0], ['chao-phraya-sunset', 1], ['thai-tea-fruit', 0], ['flower-market', 0], ['cafe-desserts', 0]]
const OPTS: [string, string, string][] = [['aPhoto', I.image, '#3446FF'], ['aCamera', I.camera, '#5B67FF'], ['aVideo', I.video, '#E39C14'], ['aVoice', I.mic, '#FFB21E'], ['aLoc', I.loc, '#3446FF'], ['aMeet', I.pin, '#E39C14'], ['aAct', I.ticket, '#5B67FF'], ['aLink', I.link, '#FFB21E']]

interface View { src: string; vid: string; isVideo: boolean }
interface Live { after: number; key: string; kind: 'cash' | 'pay' | 'solicit' | 'abuse' | 'around' }
interface Srch { open: boolean; q: string; f: string; hits: string[]; dim: Set<string>; hi: number }
const S0: Srch = { open: false, q: '', f: 'all', hits: [], dim: new Set(), hi: -1 }
/** Unsent text kept while the guest signs up to send a question (per conversation, this page session). */
const DRAFT = CHAT_DRAFT
/** Messages that are never sent: sexual/solicitation, insults, booking or paying around Kring. */
const stopKind = (v: string): 'solicit' | 'abuse' | 'around' | null =>
  isSolicitation(v) ? 'solicit' : isAbusive(v) ? 'abuse' : isAroundKring(v) ? 'around' : null

/* ---------- screen ---------- */
function Chat() {
  const s = useS()
  useEffect(() => { void loadLiveActivities() }, [])
  const A2 = act(), id = A2.id, h = hostName(A2), tr = s.lang !== 'th'
  const target = chatTarget()
  /* the booking this chat was opened for (Held/Trips pass its reference); none = a question before booking */
  const bk = chatBooking(id, target.ref)
  const ask = !bk
  const when = bk?.time || bTime()
  const d = bk?.date || s.dayDate || new Date()
  const dayS = dayFmt(d, { weekday: 'short', day: 'numeric', month: 'short' })
  const pending = !!bk && bk.status !== 'confirmed'
  const blocked = isBlockedHost(id)
  const food = ['eat', 'night'].includes(id)
  const pp = A2.f ? 'ค่ะ' : 'ครับ', pn = A2.f ? 'นะคะ' : 'นะครับ', pq = A2.f ? 'คะ' : 'ครับ'
  // the meeting point (for the cooking class: the BTS skywalk where the host picks guests up), never the old place line
  const placeTh = meetNameTh(A2, bk) || meetName(A2, bk), placeName = meetName(A2, bk)
  /* The host's opening messages: name, place and time always come from this booking's host. */
  /* Before the host confirms, the greeting never says "see you at …"; before a booking it invites questions. */
  const M1th = ask
    ? `สวัสดี${pp} ${A2.hostTh}เอง${pn} อยากถามอะไรเกี่ยวกับกิจกรรมนี้ก่อนจอง ถามได้เลย${pn}`
    : pending
      ? `สวัสดี${pp} ${A2.hostTh}เอง${pn} ได้รับคำขอของคุณสำหรับ ${dayS} เวลา ${when} แล้ว จะยืนยันในแอปเร็ว ๆ นี้${pp}`
      : `สวัสดี${pp} ${A2.hostTh}เอง${pn} เจอกันที่ ${placeTh} ตอน ${when} ${pp}`
  /* the pre-booking greeting, kept above questions the guest sent before booking */
  const M0th = `สวัสดี${pp} ${A2.hostTh}เอง${pn} อยากถามอะไรเกี่ยวกับกิจกรรมนี้ก่อนจอง ถามได้เลย${pn}`
  const T0 = s.lang === 'th' ? M0th : t('chAskHi', { host: h })
  const M2th = food ? `มาท้องว่าง ๆ ${pn} เลือกร้านตามที่คุณทานได้ไว้แล้ว ทานเผ็ดได้ไหม${pq}` : `รอเจอ${pn} มีอะไรอยากถามก่อนเจอกันไหม${pq}`
  const T1 = s.lang === 'th' ? M1th
    : ask ? t('chAskHi', { host: h })
      : pending ? t('chHiWait', { host: h, day: dayS, time: when })
        : t('chHi', { host: h, place: placeName, time: when })
  const T2 = s.lang === 'th' ? M2th : food ? t('m2') : t('m2g')
  const back = s.from.chat === 'held' ? 'held' : s.from.chat && !['onway', 'bump', 'chat'].includes(s.from.chat) ? s.from.chat : 'chats'

  const scRef = useRef<HTMLDivElement>(null)
  const msgsRef = useRef<HTMLDivElement>(null)
  const inpRef = useRef<HTMLInputElement>(null)
  const qRef = useRef<HTMLInputElement>(null)
  const linRef = useRef<HTMLInputElement>(null)
  const fpick = useRef<HTMLInputElement>(null), fcam = useRef<HTMLInputElement>(null), fvid = useRef<HTMLInputElement>(null)
  const rtmRef = useRef<HTMLElement>(null), rwvRef = useRef<HTMLSpanElement>(null)
  const tm = useRef<ReturnType<typeof setTimeout>[]>([])
  const riv = useRef<ReturnType<typeof setInterval> | null>(null)
  const rt0 = useRef(0)
  const recOn = useRef(false)

  const [shown, setShown] = useState(0)
  const [orig, setOrig] = useState<Record<number, boolean>>({})
  const [val, setVal] = useState(() => DRAFT[id] || '')
  const [rec, setRec] = useState(false)
  const [live, setLive] = useState<Live[]>([])
  const [view, setView] = useState<View | null>(null)
  const [att, setAtt] = useState(false)
  const [picked, setPicked] = useState<number[]>([])
  const [amode, setAmode] = useState<'' | 'act' | 'link'>('')
  const [lbad, setLbad] = useState(false)
  const [sr, setSr] = useState<Srch>(S0)
  const [placeSheet, setPlaceSheet] = useState(false)
  const [placeQ, setPlaceQ] = useState('')
  const [mpSheet, setMpSheet] = useState(false)
  const [menu, setMenu] = useState(false)
  const [blockQ, setBlockQ] = useState(false)
  const [rep, setRep] = useState(false)
  const [rr, setRr] = useState('')
  const [rd, setRd] = useState('')

  const placeSearch = useMemo(() => searchAllowedPublicPlaces(placeQ), [placeQ])

  /* this conversation's sent items */
  const items = s.chats[id] || []
  const push = (st: typeof S, x: X) => { (st.chats[id] = st.chats[id] || []).push(JSON.stringify(ask ? { ...x, pre: true } : x)) }

  /* drop photos/videos whose local file is gone after a reload */
  useEffect(() => {
    const l = S.chats[id]
    if (l && l.some((x) => deadBlob(parseX(x)))) update((st) => { st.chats[id] = (st.chats[id] || []).filter((x) => !deadBlob(parseX(x))) })
  }, [id])

  const sendProposedPlace = (p: CandidatePlace) => {
    setPlaceSheet(false)
    setPlaceQ('')
    add({ k: 'proposed_place', place_id: p.place_id, name: p.name, nameTh: p.nameTh, district: p.district, lat: p.lat, lng: p.lng, hours: p.hours, accepted: false, at: nowT() })
  }

  const acceptProposedPlace = (idx: number, x: Extract<X, { k: 'proposed_place' }>) => {
    update((st) => {
      const l = st.chats[id]
      if (l) l[idx] = JSON.stringify({ ...x, accepted: true } satisfies X)
      const b = chatBooking(id, target.ref)
      if (b) {
        b.meeting_place_id = x.place_id
        b.meeting_lat = x.lat
        b.meeting_lng = x.lng
        b.meeting_name = S.lang === 'th' && x.nameTh ? x.nameTh : x.name
      }
    })
    bell(0.3, 1760)
    buzz(15)
  }

  /* scripted host messages, revealed one by one */
  const hasDiet = s.diet.length > 0
  const kindsRef = useRef<('l' | 'o')[]>(['o', ...(hasDiet ? ['o' as const] : []), 'l', 'l', 'o'])
  useEffect(() => {
    const kinds = kindsRef.current
    let i = 0
    const next = () => { if (i >= kinds.length) return; const l = kinds[i++] === 'l'; setShown(i); if (l) tick(0.55, 0.06); tm.current.push(setTimeout(next, l ? 800 : 400)) }
    tm.current.push(setTimeout(next, 300))
    const timers = tm.current
    return () => { timers.forEach(clearTimeout); timers.length = 0; if (riv.current) clearInterval(riv.current) }
  }, [])

  const cls = (k: string, base: string): string => base + (sr.dim.has(k) ? ' dim' : '') + (sr.hits[sr.hi] === k ? ' cur' : '')
  const pre = (i: number) => (i >= shown ? ' pre' : '')
  const scrollEnd = () => { const sc = scRef.current; sc?.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' }) }

  /* add a sent item */
  const add = (x: X) => {
    if (isBlockedHost(id)) return
    update((st) => push(st, x))
    tm.current.push(setTimeout(scrollEnd, 40)); bell(0.12, 1760); buzz(8)
  }

  /* voice recording */
  const recStop = () => { recOn.current = false; if (riv.current) clearInterval(riv.current); riv.current = null; setRec(false) }
  const recSend = () => { const sec = Math.max(1, Math.round((performance.now() - rt0.current) / 1000)); recStop(); add({ k: 'voice', sec: Math.min(59, sec), at: nowT() }) }
  const recStart = () => {
    recOn.current = true; setRec(true); rt0.current = performance.now(); if (rwvRef.current) rwvRef.current.innerHTML = ''; if (rtmRef.current) rtmRef.current.textContent = '0:00'
    tick(0.9, 0.08); buzz(15)
    riv.current = setInterval(() => {
      const sec = Math.floor((performance.now() - rt0.current) / 1000)
      if (rtmRef.current) rtmRef.current.textContent = `0:${String(Math.min(59, sec)).padStart(2, '0')}`
      const rw = rwvRef.current
      if (rw) { const b = document.createElement('i'); b.style.height = (4 + Math.random() * 20).toFixed(0) + 'px'; rw.appendChild(b); if (rw.children.length > 60) rw.firstElementChild?.remove() }
      if (sec >= 59 && recOn.current) recSend()
    }, 120)
  }

  /* send button: voice / text */
  const onSend = () => {
    const v = val.trim()
    if (isBlockedHost(id)) return
    if (recOn.current) { recSend(); return }
    if (!v) { recStart(); return }
    const after = (S.chats[id]?.length || 0) - 1
    /* sexual / solicitation messages and insults are never sent: the text stays in the box and a warning shows */
    const stop: Live['kind'] | null = stopKind(v)
    if (stop) {
      setLive((l) => [...l.filter((n) => n.kind !== 'solicit' && n.kind !== 'abuse' && n.kind !== 'around'), { after, key: 's' + Date.now(), kind: stop }])
      buzz([20, 60, 20])
      tm.current.push(setTimeout(scrollEnd, 40))
      return
    }
    /* a question to a host needs an account (name, a way to reach you, 20+ check); the text waits in the box */
    if (ask && !hasAccount()) { DRAFT[id] = val; if (needAccount('chat')) return }
    delete DRAFT[id]
    setVal('')
    /* earlier messages count: once an app was named ("my kakao…"), a later bare ID is hidden too */
    const hist = (S.chats[id] || []).map(parseX).filter((x): x is Extract<X, { k: 'text' }> => !!x && x.k === 'text').map((x) => x.t)
    const masked = maskTxt(v, hist), pay = PREPAY.test(v), cash = !pay && OFFAPP.test(v)
    const lk = (masked.match(/(https?:\/\/|www\.)\S+|maps\.app\.goo\.gl\/\S+/i) || [])[0]
    const li = lk ? linkInfo(lk) : null
    const idx = S.chats[id]?.length || 0
    const srcLang = detectMessageLang(masked)
    /* what the host reads (Thai); only the host's side uses this, the sender always sees what they typed */
    const targetForHost = srcLang === 'th' ? (s.lang === 'th' ? 'en' : s.lang) : 'th'
    const syncTr = translateMaskedSync(masked, targetForHost, srcLang)
    const at = nowT()
    update((st) => push(st, { k: 'text', t: masked, tr: syncTr, srcLang, l: li && li.safe ? lk : undefined, at }))
    void translateChatMessage(masked, targetForHost, srcLang).then((res) => {
      if (res.translatedText && res.translatedText !== syncTr) {
        update((st) => {
          const l = st.chats[id]
          const cur = parseX(l?.[idx] || '')
          if (l && cur && cur.k === 'text') l[idx] = JSON.stringify({ ...cur, tr: res.translatedText } satisfies X)
        })
      }
    })
    const notes: Live[] = []
    if (pay) notes.push({ after: idx, key: 'p' + idx, kind: 'pay' })
    if (cash) notes.push({ after: idx, key: 'c' + idx, kind: 'cash' })
    setLive((l) => [...l.filter((n) => n.kind !== 'solicit' && n.kind !== 'abuse' && n.kind !== 'around'), ...notes])
    tm.current.push(setTimeout(scrollEnd, 40)); tick(0.7, 0.06)
  }

  /* files */
  const files = (list: FileList) => {
    const imgs: string[] = [], vids: string[] = []
    Array.from(list).forEach((f) => { const u = URL.createObjectURL(f); SESSION_BLOBS.add(u); (f.type.startsWith('video') ? vids : imgs).push(u) })
    if (imgs.length > 1) add({ k: 'album', list: imgs, at: nowT() }); else if (imgs.length) add({ k: 'photo', src: imgs[0], at: nowT() })
    vids.forEach((u) => add({ k: 'video', src: u, poster: '', dur: '0:' + String(8 + Math.floor(Math.random() * 40)).padStart(2, '0'), at: nowT() }))
  }
  const onFile = (e: ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files.length) files(e.target.files); e.target.value = '' }

  /* block / report */
  const doBlock = () => {
    update((st) => { if (!st.blocked.some((b) => b.id === hostKey(id))) st.blocked.push({ id: hostKey(id), name: h }) })
    setBlockQ(false); setMenu(false)
    toast(t('chBlockedT', { host: h })); buzz(15)
  }
  const doUnblock = () => { update((st) => { st.blocked = st.blocked.filter((b) => b.id !== hostKey(id)) }); setMenu(false); tick(0.6, 0.06) }
  const sendReport = () => {
    if (!rr) return
    void api.report(id, rr, rd.trim()).catch(() => {})
    setRep(false); setRr(''); setRd('')
    toast(t('repCase', { n: caseNo() })); bell(0.2, 1568)
  }

  /* attach sheet */
  const openAtt = () => { setPicked([]); setAmode(''); setLbad(false); setAtt(true); tick(0.6, 0.07) }
  const closeAtt = () => setAtt(false)
  const togglePick = (i: number) => {
    const p = picked.includes(i) ? picked.filter((x) => x !== i) : picked.concat(i)
    setPicked(p); tick(0.5 + p.length * 0.05, 0.05)
  }
  const sendPicked = () => {
    const ph2 = picked.filter((i) => !RECENT[i][1]).map((i) => ph(RECENT[i][0])), vd = picked.filter((i) => RECENT[i][1])
    closeAtt()
    if (ph2.length > 1) add({ k: 'album', list: ph2, at: nowT() }); else if (ph2.length) add({ k: 'photo', src: ph2[0], at: nowT() })
    vd.forEach((i) => add({ k: 'video', src: '', poster: ph(RECENT[i][0]), dur: '0:' + (12 + i * 7), at: nowT() }))
  }
  const onOpt = (k: string) => {
    tick(0.7, 0.06)
    if (k === 'aPhoto') { closeAtt(); fpick.current?.click() } else if (k === 'aCamera') { closeAtt(); fcam.current?.click() } else if (k === 'aVideo') { closeAtt(); fvid.current?.click() }
    else if (k === 'aVoice') { closeAtt(); recStart() } else if (k === 'aLoc') { closeAtt(); add({ k: 'place', live: true, a: id, at: nowT() }) } else if (k === 'aMeet') { closeAtt(); add({ k: 'place', live: false, a: id, at: nowT() }) }
    else if (k === 'aAct') { setAmode('act') } else if (k === 'aLink') { setAmode('link'); setLbad(false); tm.current.push(setTimeout(() => linRef.current?.focus(), 50)) }
  }
  const sendLink = () => {
    const v = linRef.current?.value.trim() || ''
    if (!v) return
    const li = linkInfo(v)
    if (li && li.safe) { closeAtt(); add({ k: 'link', raw: v, at: nowT() }) } else { setLbad(true); buzz([10, 30, 10]) }
  }

  /* viewer + voice playback + activity card */
  const openView = (e: RME<HTMLElement>, src: string, vid = '', isVideo = false) => { e.stopPropagation(); setView({ src, vid, isVideo }); tick(0.6, 0.06) }
  const playVoice = (e: RME<HTMLButtonElement>, sec: number) => {
    const vp = e.currentTarget, bars = Array.from(vp.parentElement!.querySelectorAll<HTMLElement>('.wave i'))
    const dur = sec * 1000, t0 = performance.now(); vp.textContent = '❚❚'
    const f = (n: number) => { const p = Math.min(1, (n - t0) / Math.min(dur, 6000)); bars.forEach((b, i) => b.classList.toggle('on', i / bars.length < p)); if (p < 1 && vp.isConnected) requestAnimationFrame(f); else { vp.textContent = '▶'; bars.forEach((b) => b.classList.remove('on')) } }
    f(t0)
  }

  /* search */
  const run = (q: string, f: string) => {
    const box = msgsRef.current; if (!box) return
    const ss = q.trim().toLowerCase(), hits: string[] = [], dim = new Set<string>()
    box.querySelectorAll<HTMLElement>(':scope > .bub, :scope > .mm').forEach((x) => {
      const k = x.dataset.k || 'text', key = x.dataset.key || ''
      const ok = (f === 'all' || k === f) && (!ss || (x.innerText + ' ' + (x.dataset.q || '')).toLowerCase().includes(ss))
      if (!ok && (ss || f !== 'all')) dim.add(key)
      if (ok && (ss || f !== 'all')) hits.push(key)
    })
    setSr((o) => ({ ...o, q, f, hits, dim, hi: hits.length - 1 }))
  }
  const curKey = sr.hits[sr.hi]
  useEffect(() => {
    if (!curKey) return
    const x = msgsRef.current?.querySelector<HTMLElement>(`[data-key="${curKey}"]`), sc = scRef.current
    if (x && sc) sc.scrollTo({ top: Math.max(0, x.offsetTop - sc.clientHeight / 2), behavior: 'smooth' })
  }, [curKey, sr.hi])
  const srN = sr.q.trim() || sr.f !== 'all' ? (sr.hits.length ? `${sr.hi + 1} / ${sr.hits.length}` : t('noMatch')) : ''
  const srMove = (dlt: number) => { if (sr.hits.length) setSr((o) => ({ ...o, hi: (o.hi + dlt + o.hits.length) % o.hits.length })) }

  /* render one sent item */
  const renderX = (x: X, i: number): ReactNode => {
    const k = 'x' + i
    if (x.k === 'text') {
      const li = x.l ? linkInfo(x.l) : null
      /* the sender's own message: always exactly what they typed, never labelled as a translation */
      return (
        <>
          <div className={cls(k, 'bub r')} data-key={k} data-q={x.t.replace(/"/g, '')}>
            <span className="sr-only" style={SR}>{t('you')}: </span><span>{x.t}</span>
            {x.t.includes('••••') && <span className="tr" style={{ cursor: 'default' }}><Ic p={I.shield} s={12} /><span>{t('chHid')}</span></span>}
          </div>
          {li && li.safe && linkCard(k + 'l', x.l!, x.at)}
        </>
      )
    }
    if (x.k === 'photo') return <div className={cls(k, 'mm r')} data-key={k} data-k="media" data-q="photo"><button className="mph" onClick={(e) => openView(e, x.src)}><img src={x.src} alt="" /></button><Meta at={x.at} /></div>
    if (x.k === 'album') return (
      <div className={cls(k, 'mm r')} data-key={k} data-k="media" data-q="photo"><div className="alb">{x.list.slice(0, 4).map((u, j) => (
        <button key={j} className="mph0" onClick={(e) => openView(e, u)}><img src={u} alt="" />{j === 3 && x.list.length > 4 && <span className="more4">+{x.list.length - 4}</span>}</button>))}</div><Meta at={x.at} /></div>
    )
    if (x.k === 'video') return (
      <div className={cls(k, 'mm r')} data-key={k} data-k="media" data-q="video"><button className="mph" onClick={(e) => openView(e, x.poster, x.src, true)}>
        {x.poster ? <img src={x.poster} alt="" /> : <video src={x.src} muted preload="metadata" />}<span className="play">▶</span><span className="dur">{x.dur}</span></button><Meta at={x.at} /></div>
    )
    if (x.k === 'voice') return (
      <div className={cls(k, 'bub r vmsg')} data-key={k} data-k="media" data-q={`voice ${t('voiceMsg')}`}>
        <button className="vplay" aria-label={t('voiceMsg')} onClick={(e) => playVoice(e, x.sec)}>▶</button>
        <span className="wave">{Array.from({ length: 26 }, (_, j) => <i key={j} style={{ height: (6 + Math.abs(Math.sin(j * 1.7 + x.sec)) * 18).toFixed(0) + 'px' }} />)}</span>
        <span className="small" style={{ color: '#fff' }}>0:{String(x.sec).padStart(2, '0')}</span></div>
    )
    if (x.k === 'place') {
      const a = ACTS.find((y) => y.id === x.a) || A2
      const b = bookingFor(a.id)
      return (
        <div className={cls(k, 'mm r')} data-key={k} data-k="place" data-q={`${x.live ? t('liveLoc') : meetName(a, b)} ${meetNameTh(a, b)} ${meetAddress(a, b)}`}>
          <div className="mapc"><MapSVG live={x.live} /><div className="mcap"><b>{x.live ? t('liveLoc') : meetName(a, b)}</b><span className="small">{x.live ? t('liveUntil') : [meetAddress(a, b), b?.time || when].filter(Boolean).join(' · ')}</span></div>
            <a className="chip" href={mapsUrl(a, b)} target="_blank" rel="noopener noreferrer"><Ic p={I.pin} s={14} />{t('directions')}</a></div><Meta at={x.at} /></div>
      )
    }
    if (x.k === 'proposed_place') {
      const dispName = s.lang === 'th' && x.nameTh ? x.nameTh : x.name
      return (
        <div className={cls(k, 'mm r')} data-key={k} data-k="place" data-q={`${x.name} ${x.nameTh || ''} ${x.district}`}>
          <div className="mapc" id={`prop-place-${i}`}>
            <MapSVG live={false} />
            <div className="mcap">
              <b>{dispName}</b>
              <span className="small">{x.district} · {x.hours}</span>
            </div>
            {x.accepted ? (
              <span className="pill gold" id="accepted-place-pill">
                <Ic p={I.check} s={13} /> {t('placeAccepted')}
              </span>
            ) : (
              <button className="btn gold" id="accept-place-btn" style={{ height: 36, fontSize: 13, padding: '0 14px', width: 'auto' }} onClick={() => acceptProposedPlace(i, x)}>
                {t('acceptPlace')}
              </button>
            )}
          </div>
          <Meta at={x.at} />
        </div>
      )
    }
    if (x.k === 'link') return linkCard(k, x.raw, x.at)
    if (x.k === 'act') {
      const a = ACTS.find((y) => y.id === x.id); if (!a) return null
      return (
        <div className={cls(k, 'mm r')} data-key={k} data-k="link" data-q={`${aTitle(a)} ${a.th} ${hostName(a)}`}>
          <button className="lnk actc" onClick={() => { S.act = a.id; go('detail', 'r') }}><img src={ph(a.img)} alt="" />
            <span className="col" style={{ minWidth: 0, gap: 2 }}><b>{aTitle(a)}</b><span className="small">{hostName(a)} · {baht(a.price)}</span><span className="small" style={{ color: 'var(--gold2)' }}>kring.app</span></span></button><Meta at={x.at} /></div>
      )
    }
    return null
  }
  function linkCard(k: string, raw: string, at: string): ReactNode {
    const i = linkInfo(raw); if (!i || !i.safe) return null
    return (
      <div className={cls(k, 'mm r')} data-key={k} data-k="link" data-q={`${i.h} ${i.title}`}>
        <a className="lnk" href={i.u.href} target="_blank" rel="noopener noreferrer"><span className="lfav">{i.maps ? <Ic p={I.pin} s={20} /> : i.title[0]}</span>
          <span className="col" style={{ minWidth: 0, gap: 2 }}><b>{i.title}</b><span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.h}{i.u.pathname.length > 1 ? i.u.pathname.slice(0, 24) : ''}</span></span></a><Meta at={at} /></div>
    )
  }
  const liveNode = (n: Live): ReactNode => {
    if (n.kind === 'solicit') return <div key={n.key} className="sys" id="solicit-warn" role="alert" style={{ color: 'var(--street, #FF6B6B)' }}><Ic p={I.flag} s={14} /><span>{t('chNoSend')}</span></div>
    if (n.kind === 'around') return <div key={n.key} className="sys" id="around-warn" role="alert" style={{ color: 'var(--street, #FF6B6B)' }}><Ic p={I.flag} s={14} /><span>{t('chAround')}</span></div>
    if (n.kind === 'abuse') return <div key={n.key} className="sys" id="abuse-warn" role="alert" style={{ color: 'var(--street, #FF6B6B)' }}><Ic p={I.flag} s={14} /><span>{t('chAbuse')}</span></div>
    if (n.kind === 'pay') return <div key={n.key} className="sys" id="pay-warn" role="note" style={{ color: 'var(--gold2)' }}><Ic p={I.shield} s={14} /><span>{t('s2')}</span></div>
    return <div key={n.key} className="sys" style={{ color: 'var(--gold2)' }}><Ic p={I.shield} s={14} /><span>{t('cashNudge')}</span></div>
  }

  /* scripted (incoming) host bubbles: written in Thai, shown translated with a "Translated from Thai" toggle */
  let pi = 0
  const bub = (txt: string, th: string, n: number) => {
    const on = !!orig[n], k = 'p' + n, ix = pi++
    return (
      <div className={cls(k, 'bub l') + pre(ix)} data-key={k}><span className="sr-only" style={SR}>{h}: </span><span className={`tx ${on ? 'th' : ''}`} lang={on ? 'th' : undefined}>{on ? th : txt}</span>
        {tr && <button className="tr" onClick={() => setOrig((o) => ({ ...o, [n]: !on }))}><Ic p={I.globe} s={12} /><span>{on ? `ภาษาไทย · ${t('showTr')}` : `${t('translated')} · ${t('showOrig')}`}</span></button>}</div>
    )
  }
  const xs = items.map(parseX)
  const row = (i: number): ReactNode => { const x = xs[i]; return <FragmentKey key={i}>{x && renderX(x, i)}{live.filter((n) => n.after === i).map(liveNode)}</FragmentKey> }
  const allIx = xs.map((_, i) => i)
  /* after booking: the pre-booking questions first, then the host's booking messages, then the rest */
  const early = ask ? [] : allIx.filter((i) => xs[i]?.pre)
  const later = ask ? allIx : allIx.filter((i) => !xs[i]?.pre)
  const hasMic = !val.trim() && !rec
  const onDay = sameDay(d) && bk?.status === 'confirmed'

  return (
    <>
      <div className="topb"><button className="ib" data-go={back} data-how="l" aria-label={t('backW')}><Ic p={I.back} /></button><span style={{ position: 'relative' }}><Av ch={ini(h)} s={42} />{!blocked && <i className="online" />}</span>
        <div className="col" style={{ minWidth: 0 }}><b>{h}</b><span className="badge"><Ic p={I.check} s={12} sw={3} />{t('verified')}</span></div><div className="grow" />
        <button className="ib" id="csearch" aria-label={t('searchChat')} onClick={() => { setSr((o) => ({ ...o, open: true })); tm.current.push(setTimeout(() => qRef.current?.focus(), 60)); tick(0.6, 0.06) }}><Ic p={I.search} /></button>
        <button className="ib" id="cmore" aria-label={t('chMore')} aria-haspopup="dialog" onClick={() => setMenu(true)}><Ic p={MORE} /></button></div>

      <div className="csrch" id="csp" hidden={!sr.open}>
        <div className="row" style={{ gap: 8 }}><button className="ib" id="csx" aria-label={t('cancelX')} onClick={() => setSr(S0)}><Ic p={I.back} /></button>
          <label className="inp glass" style={{ flex: 1 }}><Ic p={I.search} s={16} />&nbsp;<input id="csq" ref={qRef} type="search" placeholder={t('searchChat')} aria-label={t('searchChat')} autoComplete="off" value={sr.q} onChange={(e) => run(e.target.value, sr.f)} /></label></div>
        <div className="row" style={{ gap: 8 }}>
          <div className="chips" id="csf" style={{ flex: 1 }}>{[['all', 'fAll'], ['media', 'fMedia'], ['link', 'fLinks'], ['place', 'fPlaces']].map(([k, l]) => (
            <button key={k} className={`chip ${sr.f === k ? 'on' : ''}`} data-f={k} style={{ height: 32, fontSize: 12.5 }} onClick={() => { tick(0.5, 0.05); run(sr.q, k) }}>{t(l)}</button>))}</div>
          <span className="small num" id="csn">{srN}</span>
          <button className="ib" id="csu" aria-label="up" style={{ width: 34, height: 34 }} onClick={() => srMove(-1)}><Ic p={I.up} s={16} /></button>
          <button className="ib" id="csd" aria-label="down" style={{ width: 34, height: 34 }} onClick={() => srMove(1)}><Ic p={I.down} s={16} /></button></div>
      </div>

      <div style={{ padding: '0 14px 6px' }}>
        <button className="pinned glass" id="pinned-place" style={{ width: '100%', margin: 0 }} onClick={() => { setMpSheet(true); tick(0.6, 0.06) }}><span style={{ color: 'var(--gold2)' }}><Ic p={I.pin} s={22} /></span>
          <span className="col grow" style={{ minWidth: 0 }}><b style={{ fontSize: 14 }} id="pinned-place-name">{placeName}</b><span className="small" id="pinned-when">{ask ? `${t('chAskHead')} · ${t('meetPoint')}` : `${dayS} · ${when} · ${t('meetPoint')}`}</span></span>
          <span style={{ color: 'var(--gold2)' }}><Ic p={I.chev} s={20} /></span></button>
      </div>

      <div className="scroll" id="sc" ref={scRef}><div className="pad msgs" id="msgs" ref={msgsRef} aria-live="polite" style={{ paddingTop: 12 }}>
        {ask && <div className={'sys' + pre(pi++)} id="ask-note"><Ic p={I.shield} s={14} /><span>{t('chAskHead')} · {t('keepIn')}</span></div>}
        {hasDiet && <div className={'sys' + pre(pi++)}><span>{t('dietShared', { host: h, d: s.diet.map(dietWord).join(', ') })}</span></div>}
        {early.length > 0 ? (
          <>
            {/* questions sent before booking stay above the host's later booking messages (time order) */}
            {bub(T0, M0th, 0)}
            <div className={'sys' + pre(pi++)}><span>{t('masked')}</span></div>
            {early.map(row)}
            {bub(T1, M1th, 1)}{!ask && !pending && bub(T2, M2th, 2)}
          </>
        ) : (
          <>
            {bub(T1, M1th, 1)}{!ask && !pending && bub(T2, M2th, 2)}
            <div className={'sys' + pre(pi++)}><span>{t('masked')}</span></div>
          </>
        )}
        {live.filter((n) => n.after < 0).map(liveNode)}
        {later.map(row)}
        {/* asking a host needs an account: said before the guest presses send (the text waits in the box) */}
        {ask && !hasAccount() && !blocked && <div className="sys" id="ask-sign-note"><Ic p={I.lock} s={14} /><span>{t('chAskSign', { host: h })}</span></div>}
      </div></div>

      <input type="file" id="fpick" ref={fpick} accept="image/*,video/*" multiple hidden onChange={onFile} />
      <input type="file" id="fcam" ref={fcam} accept="image/*" capture="environment" hidden onChange={onFile} />
      <input type="file" id="fvid" ref={fvid} accept="video/*" hidden onChange={onFile} />

      {blocked ? (
        <div className="inbar" id="blocked-bar"><span className="small grow">{t('chBlockedNote', { host: h })}</span>
          <button className="chip" id="unblock-btn" style={{ height: 40 }} onClick={doUnblock}>{t('unblock')}</button></div>
      ) : (
        <div className="inbar">
          <button className="ib" id="att" aria-label={t('attach')} onClick={openAtt}><Ic p={I.plus} /></button>
          <label className="inp glass"><input id="cmsg" ref={inpRef} type="text" enterKeyHint="send" placeholder={t('msgPh')} aria-label={t('msgPh')} value={val} onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (val.trim()) onSend() } }} />
            <button className="camb" id="cam" aria-label={t('aCamera')} onClick={(e) => { e.preventDefault(); fcam.current?.click() }}><Ic p={I.camera} s={19} /></button></label>
          <button className="ib" id="csend" aria-label={hasMic ? t('aVoice') : t('send')} style={{ background: 'var(--anchan)', borderColor: 'var(--anchan2)' }} onClick={onSend}>{hasMic ? <Ic p={I.mic} s={19} /> : <Ic p={I.send} s={18} />}</button>
          <div className="recbar" id="recb" hidden={!rec}><span className="rdot" /><b className="num" id="rtm" ref={rtmRef} style={{ fontSize: 14 }}>0:00</b><span className="rwave" id="rwv" ref={rwvRef} />
            <button className="chip" id="rcx" style={{ height: 30, fontSize: 12 }} onClick={(e) => { e.stopPropagation(); recStop(); tick(0.4, 0.05) }}>{t('cancelX')}</button></div>
        </div>
      )}

      <Sheet open={att} onClose={closeAtt}>
        <div className="row"><b style={{ fontSize: 18 }} className="grow">{t('attach')}</b>
          <button className="btn gold" id="rsend2" hidden={!picked.length} style={{ width: 'auto', height: 40, padding: '0 16px', fontSize: 14 }} onClick={sendPicked}>{`${t('send')} · ${picked.length}`}</button></div>
        <span className="eyebrow">{t('recent')}</span>
        <div className="recent">{RECENT.map(([n, v], i) => { const k = picked.indexOf(i); return (
          <button key={n} data-rp={i} aria-label={n} className={k >= 0 ? 'on' : ''} onClick={() => togglePick(i)}><img src={ph(n)} alt="" />{v ? <span className="vb">▶ 0:{12 + i * 7}</span> : null}<span className="ck">{k >= 0 ? k + 1 : ''}</span></button>) })}</div>
        <div className="agrid">{OPTS.map(([k, ic, c], i) => (
          <button key={k} data-a={k} onClick={() => onOpt(k)}><i style={{ background: `linear-gradient(145deg,${c},${c}cc)`, animationDelay: `${i * 0.04}s`, ...(c[1] === 'F' || c[1] === 'E' ? { color: '#05060D' } : {}) }}><Ic p={ic} s={24} /></i><span>{t(k)}</span></button>))}</div>
        <div className="linkrow" id="lrow" hidden={amode !== 'link'}><label className="inp glass" style={{ flex: 1 }}><input id="lin" ref={linRef} type="url" placeholder={t('linkPh')} aria-label={t('linkPh')} autoComplete="off" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendLink() } }} /></label>
          <button className="ib" id="lgo" style={{ background: 'var(--anchan)', borderColor: 'var(--anchan2)' }} onClick={sendLink}><Ic p={I.send} s={18} /></button></div>
        <span className="small" id="lnote" hidden={amode !== 'link'} style={lbad ? { color: 'var(--gold2)' } : undefined}>{lbad ? t('linkHidden') : t('linkOk')}</span>
        <div className="recent" id="arow" hidden={amode !== 'act'}>{ACTS.filter((a) => a.id !== id).map((a) => (
          <button key={a.id} data-sa={a.id} style={{ width: 110, height: 'auto', display: 'flex', flexDirection: 'column', background: 'none', textAlign: 'left', gap: 4 }} onClick={() => { closeAtt(); add({ k: 'act', id: a.id, at: nowT() }) }}>
            <img src={ph(a.img)} alt="" style={{ height: 70, borderRadius: 14 }} /><span className="small" style={{ color: '#fff', lineHeight: 1.25 }}>{aTitle(a)}</span></button>))}</div>
        <span className="small" style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}><Ic p={I.shield} s={14} />{t('photoScan')}</span>
      </Sheet>

      {view && (
        <div className="lbox" onClick={(e) => { if (!(e.target as HTMLElement).closest('video')) setView(null) }}>
          <button className="ib" aria-label={t('cancelX')}><Ic p={I.close} /></button>
          {view.vid ? <video src={view.vid} controls autoPlay playsInline /> : <img src={view.src} alt="" className={view.isVideo ? 'kb' : ''} />}
          {view.isVideo && !view.vid && <span className="play" style={{ position: 'static', margin: 0 }}>▶</span>}
        </div>
      )}

      {/* meeting point: details + map link. Check-in itself only opens on the day (never jumps to the check-in screen early). */}
      <Sheet open={mpSheet} onClose={() => setMpSheet(false)}>
        <span className="eyebrow">{t('meetPoint')}</span>
        <div className="mapc" style={{ margin: 0 }}><MapSVG live={false} /><div className="mcap"><b id="mp-name">{placeName}</b>{meetAddress(A2, bk) && <span className="small" id="mp-addr">{meetAddress(A2, bk)}</span>}<span className="small">{ask ? t('chAskHead') : `${dayS} · ${when}`}</span></div></div>
        <a className="btn gold" id="mp-maps" style={{ textDecoration: 'none' }} href={mapsUrl(A2, bk)} target="_blank" rel="noopener noreferrer"><Ic p={I.pin} s={18} />{t('mpMaps')}</a>
        {ask && <button className="btn ghost" id="mp-book" data-go="book" data-how="b">{t('request')}</button>}
        {onDay
          ? <button className="btn ghost" id="mp-checkin" onClick={() => { setMpSheet(false); go('onway') }}>{t('mpCheckin')}</button>
          : <span className="small" id="mp-day" style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}><Ic p={I.clock} s={14} />{t('mpDay')}</span>}
        {!blocked && <button className="btn ghost" id="suggest-place-btn" onClick={() => { setMpSheet(false); setPlaceQ(''); setPlaceSheet(true); tick(0.6, 0.06) }}><Ic p={I.pin} s={16} />{t('suggestPlace')}</button>}
      </Sheet>

      {/* header menu */}
      <Sheet open={menu} onClose={() => setMenu(false)}>
        <b style={{ fontSize: 18 }}>{h}</b>
        <div className="col" style={{ gap: 8 }}>
          {!blocked && <button className="mrow" id="menu-suggest" onClick={() => { setMenu(false); setPlaceQ(''); setPlaceSheet(true) }}><Ic p={I.pin} s={20} /><span className="grow">{t('suggestPlace')}</span></button>}
          <button className="mrow" id="menu-safety" data-go="safety"><Ic p={I.shield} s={20} /><span className="grow">{t('safety')}</span></button>
          <button className="mrow" id="menu-report" onClick={() => { setMenu(false); setRr(''); setRd(''); setRep(true) }}><Ic p={I.flag} s={20} /><span className="grow">{t('chReport', { host: h })}</span></button>
          {blocked
            ? <button className="mrow" id="menu-unblock" onClick={doUnblock}><Ic p={I.lock} s={20} /><span className="grow">{t('unblock')}</span></button>
            : <button className="mrow" id="menu-block" style={{ color: 'var(--street, #FF6B6B)' }} onClick={() => { setMenu(false); setBlockQ(true) }}><Ic p={I.lock} s={20} /><span className="grow">{t('chBlock', { host: h })}</span></button>}
        </div>
      </Sheet>

      <Sheet open={blockQ} onClose={() => setBlockQ(false)}>
        <b style={{ fontSize: 18 }}>{t('chBlockQ', { host: h })}</b>
        <span className="small">{t('chBlockSub', { host: h })}</span>
        <button className="btn gold" id="block-confirm" onClick={doBlock}>{t('chBlock', { host: h })}</button>
        <button className="btn ghost" onClick={() => setBlockQ(false)}>{t('cancelX')}</button>
      </Sheet>

      <Sheet open={rep} onClose={() => setRep(false)}>
        <b style={{ fontSize: 18 }}>{t('chReport', { host: h })}</b>
        <span className="eyebrow">{t('reportQ')}</span>
        <div className="chips" id="crchips" style={{ flexWrap: 'wrap' }}>{['repHarass', 'repSexual', 'repPayEarly', 'rep3'].map((k) => (
          <button key={k} className={`chip ${rr === k ? 'on' : ''}`} aria-pressed={rr === k} data-r={k} onClick={() => setRr(k)}>{t(k)}</button>))}</div>
        <label className="inp glass" style={{ height: 'auto', minHeight: 52, padding: '10px 14px' }}><textarea rows={2} value={rd} onChange={(e) => setRd(e.target.value)} placeholder={t('repDetail')} aria-label={t('repDetail')} style={{ width: '100%', background: 'none', border: 0, color: '#fff', font: 'inherit', resize: 'none', outline: 'none' }} /></label>
        <button className="btn gold" id="crsend" disabled={!rr} onClick={sendReport}>{t('send')}</button>
        {!blocked && <button className="btn ghost" onClick={() => { setRep(false); setBlockQ(true) }}>{t('chBlock', { host: h })}</button>}
      </Sheet>

      <Sheet open={placeSheet} onClose={() => setPlaceSheet(false)}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <b style={{ fontSize: 18 }}>{t('suggestPlace')}</b>
          <span className="pill gold num" id="place-picker-radius-pill">{t('chCk100')}</span>
        </div>
        <label className="inp glass" style={{ width: '100%' }}>
          <Ic p={I.search} s={16} />&nbsp;
          <input id="place-search-inp" type="search" placeholder={t('searchPublicPlacePh')} aria-label={t('searchPublicPlacePh')} value={placeQ} onChange={(e) => setPlaceQ(e.target.value)} />
        </label>
        {(placeSearch.blockedMatch || placeSearch.templeInteriorBlocked) && (
          <div className="sys" id="place-blocked-msg" style={{ color: 'var(--gold2)' }}>
            <Ic p={I.shield} s={14} />
            <span>{t('placeNotAllowed')}</span>
          </div>
        )}
        <div className="col" style={{ gap: 8, maxHeight: 240, overflowY: 'auto' }}>
          {placeSearch.allowed.map((p) => (
            <button key={p.place_id} data-place-id={p.place_id} className="card col" style={{ padding: '10px 12px', textAlign: 'left', gap: 4 }} onClick={() => sendProposedPlace(p)}>
              <div className="row" style={{ alignItems: 'center', gap: 10 }}>
                <Ic p={I.pin} s={18} />
                <span className="col grow" style={{ gap: 2 }}>
                  <b>{s.lang === 'th' && p.nameTh ? p.nameTh : p.name}</b>
                  <span className="small">{p.district} · {p.hours} · {t('chCk100')}</span>
                </span>
              </div>
              {p.landmarkOnlyNoGuiding && (
                <div className="small" data-temple-landmark-note="1" style={{ color: 'var(--gold2)', fontSize: 11.5, paddingLeft: 28 }}>
                  {t('ckNoGuidingNote')}
                </div>
              )}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  )
}
const FragmentKey = ({ children }: { children: ReactNode }) => <>{children}</>

/* ---------- host side: the host messages a guest they accepted (#hchat?g=<request id>) ----------
   The guest's name stays exactly as the guest wrote it. The guest's request message is shown first (translated into
   the host's language by Kring), then what the host sends. Same red lines as the guest chat: contact details masked,
   sexual/solicitation messages, insults and booking around Kring are not sent. */
function HostChat() {
  const s = useS()
  const g = hostChatTarget()
  const key = guestChatKey(g)
  const rec = hostReq(g)
  const name = guestName(g)
  const sg = SAMPLE_GUESTS[g]
  const kp = s.gender === 'f' ? { p: 'ค่ะ', n: 'นะคะ', q: 'คะ' } : s.gender === 'm' ? { p: 'ครับ', n: 'นะครับ', q: 'ครับ' } : { p: '', n: '', q: '' }
  const hh = (k: string, v: Record<string, string | number> = {}): string => t('h6_' + k, { ...kp, ...v }).replace(/ +([.,!?])/g, '$1').trim()
  const note = sg ? hh(sg.note.replace(/^h6_/, '')) : ''
  /* the first guest's booking may exist only as a booking on this phone (no saved request answer yet) */
  const bk0 = !rec?.when && g === 'r0' ? s.bookings.find((x) => x.kind === 'act' && x.status !== 'cancelled' && !x.done) : undefined
  const a0 = bk0 ? ACTS.find((x) => x.id === bk0.act) : undefined
  const wd = rec?.when || bk0?.date, wt = rec?.time || bk0?.time
  const whenS = wd ? `${dayFmt(new Date(wd), { weekday: 'short', day: 'numeric', month: 'short' })}${wt ? ' · ' + wt : ''}` : ''
  const back = s.from.hchat && !['hchat', 'signup'].includes(s.from.hchat) ? s.from.hchat : 'htoday'
  const [val, setVal] = useState('')
  const [live, setLive] = useState<Live[]>([])
  const scRef = useRef<HTMLDivElement>(null)
  const items = (s.chats[key] || []).map(parseX)
  const scrollEnd = () => { const sc = scRef.current; sc?.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' }) }
  const onSend = () => {
    const v = val.trim()
    if (!v) return
    const after = (S.chats[key]?.length || 0) - 1
    const stop = stopKind(v)
    if (stop) {
      setLive((l) => [...l.filter((n) => n.kind !== 'solicit' && n.kind !== 'abuse' && n.kind !== 'around'), { after, key: 's' + Date.now(), kind: stop }])
      buzz([20, 60, 20]); setTimeout(scrollEnd, 40)
      return
    }
    setVal('')
    const hist = (S.chats[key] || []).map(parseX).filter((x): x is Extract<X, { k: 'text' }> => !!x && x.k === 'text').map((x) => x.t)
    const masked = maskTxt(v, hist), pay = PREPAY.test(v), cash = !pay && OFFAPP.test(v)
    const idx = S.chats[key]?.length || 0
    update((st) => { (st.chats[key] = st.chats[key] || []).push(JSON.stringify({ k: 'text', t: masked, srcLang: detectMessageLang(masked), at: nowT() } satisfies X)) })
    const notes: Live[] = []
    if (pay) notes.push({ after: idx, key: 'p' + idx, kind: 'pay' })
    if (cash) notes.push({ after: idx, key: 'c' + idx, kind: 'cash' })
    setLive((l) => [...l.filter((n) => n.kind !== 'solicit' && n.kind !== 'abuse' && n.kind !== 'around'), ...notes])
    setTimeout(scrollEnd, 40); bell(0.12, 1760); buzz(8)
  }
  const warn = (n: Live): ReactNode => {
    const k = n.kind === 'solicit' ? 'chNoSend' : n.kind === 'abuse' ? 'chAbuse' : n.kind === 'around' ? 'chAround' : n.kind === 'pay' ? 's2' : 'cashNudge'
    const red = n.kind === 'solicit' || n.kind === 'abuse' || n.kind === 'around'
    return <div key={n.key} className="sys" id={red ? 'hchat-stop' : 'hchat-note'} role={red ? 'alert' : 'note'} style={{ color: red ? 'var(--street, #FF6B6B)' : 'var(--gold2)' }}><Ic p={red ? I.flag : I.shield} s={14} /><span>{t(k)}</span></div>
  }
  return (
    <>
      <div className="topb"><button className="ib" data-go={back} data-how="l" aria-label={t('backW')}><Ic p={I.back} /></button><Av ch={ini(name)} s={42} />
        <div className="col grow" style={{ minWidth: 0 }}><b id="hchat-name">{name}</b><span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[rec?.title || (a0 ? aTitle(a0) : ''), whenS].filter(Boolean).join(' · ')}</span></div></div>
      <div className="scroll" ref={scRef}><div className="pad msgs" id="hchat-msgs" aria-live="polite">
        <div className="sys"><span>{t('masked')}</span></div>
        {note && (
          <div className="bub l" id="hchat-req"><span className="sr-only" style={SR}>{name}: </span><span className="tx">{note}</span>
            <span className="tr" style={{ cursor: 'default' }}><Ic p={I.globe} s={12} /><span>{hh('hch_req', { name })}</span></span></div>
        )}
        {live.filter((n) => n.after < 0).map(warn)}
        {items.map((x, i) => (
          <FragmentKey key={i}>
            {x && x.k === 'text' && (
              <div className="bub r"><span className="sr-only" style={SR}>{t('you')}: </span><span>{x.t}</span>
                {x.t.includes('••••') && <span className="tr" style={{ cursor: 'default' }}><Ic p={I.shield} s={12} /><span>{t('chHid')}</span></span>}</div>
            )}
            {live.filter((n) => n.after === i).map(warn)}
          </FragmentKey>
        ))}
        <div className="sys" id="hchat-tr"><Ic p={I.globe} s={14} /><span>{hh('hch_tr', { name })}</span></div>
      </div></div>
      <div className="inbar">
        <label className="inp glass" style={{ flex: 1 }}><input id="hchat-in" type="text" enterKeyHint="send" placeholder={t('msgPh')} aria-label={t('msgPh')} value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSend() } }} /></label>
        <button className="ib" id="hchat-send" aria-label={t('send')} disabled={!val.trim()} style={{ background: 'var(--anchan)', borderColor: 'var(--anchan2)' }} onClick={onSend}><Ic p={I.send} s={18} /></button>
      </div>
    </>
  )
}

/* ---------- Chats tab: one conversation per booked activity/host ---------- */
function Chats() {
  const s = useS()
  useEffect(() => { void loadLiveActivities() }, [])
  const ids: string[] = []
  for (const b of [...s.bookings].reverse()) if (b.kind === 'act' && b.act && b.status !== 'cancelled' && !ids.includes(b.act)) ids.push(b.act)
  for (const k of Object.keys(s.chats || {})) if (s.chats[k]?.length && !ids.includes(k)) ids.push(k)
  const rows = ids.map((x) => ACTS.find((a) => a.id === x)).filter((a): a is Act => !!a)
  /* hosts also see the guests they accepted (round 3: a host must be able to answer a guest) */
  const guests = s.myActs.some((x) => x && x.trim()) ? acceptedGuests() : []
  const open = (a: Act) => openChat(a.id, bookingFor(a.id)?.ref, !bookingFor(a.id))
  const lastText = (a: Act): string => {
    const l = s.chats[a.id] || []
    for (let i = l.length - 1; i >= 0; i--) { const x = parseX(l[i]); if (x && x.k === 'text') return x.t }
    return ''
  }
  return (
    <>
      <div className="topb"><h1 className="h2 grow">{t('t_chats')}</h1></div>
      <div className="scroll"><div className="pad col rise" id="chat-list" style={{ gap: 10, paddingBottom: 110 }}>
        {guests.length > 0 && <span className="eyebrow" id="chats-guests-h">{t('h6_hch_list')}</span>}
        {guests.map((g) => (
          <button key={g.id} className="glass card row" data-hchat={g.id} style={{ gap: 12, textAlign: 'left', width: '100%' }} onClick={() => openHostChat(g.id)}>
            <Av ch={ini(g.name)} s={46} />
            <span className="col grow" style={{ minWidth: 0, gap: 2 }}>
              <b>{g.name}</b>
              <span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[g.title, g.when ? dayFmt(new Date(g.when), { weekday: 'short', day: 'numeric', month: 'short' }) + (g.time ? ' · ' + g.time : '') : ''].filter(Boolean).join(' · ')}</span>
            </span>
            <Ic p={I.chev} s={18} />
          </button>
        ))}
        {guests.length > 0 && rows.length > 0 && <span className="eyebrow">{t('t_chats')}</span>}
        {rows.length === 0 && guests.length === 0 && (
          <div className="glass card col" id="chats-empty" style={{ gap: 12, alignItems: 'flex-start' }}>
            <span>{t('chNone')}</span>
            <button className="btn gold" data-go="experiences" data-how="f">{t('t_exp')}</button>
          </div>
        )}
        {rows.map((a) => {
          const b = bookingFor(a.id), hn = hostName(a), bl = isBlockedHost(a.id), last = lastText(a)
          return (
            <button key={a.id} className="glass card row" data-chat={a.id} style={{ gap: 12, textAlign: 'left', width: '100%' }} onClick={() => open(a)}>
              <Av ch={ini(hn)} s={46} />
              <span className="col grow" style={{ minWidth: 0, gap: 2 }}>
                <span className="row" style={{ gap: 6 }}><b>{hn}</b>{bl && <span className="chip" style={{ height: 22, fontSize: 11, padding: '0 8px' }}>{t('chBlockedTag')}</span>}</span>
                <span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{aTitle(a)}</span>
                <span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink2)' }}>
                  {last || (b ? `${dayFmt(b.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${b.time}` : t('chAskHead'))}
                </span>
              </span>
              <Ic p={I.chev} s={18} />
            </button>
          )
        })}
      </div></div>
      <Tabs active="chats" />
    </>
  )
}

register({ id: 'chat', flow: 't', title: 'Chat', C: Chat }, { id: 'chats', flow: 't', title: 'Chats', C: Chats }, { id: 'hchat', flow: 'h', title: 'Chat', C: HostChat })
