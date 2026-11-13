/* Screen router for Kring v6: one screen at a time with the prototype's slide/fade transitions,
   a "came from" map for honest Back buttons, and delegated data-go / data-toast / data-heart clicks. */
import { useEffect, useRef, useState, type FC, type MouseEvent } from 'react'
import { S, update, useS, type Lang } from './store'
import { t, L, ACTS } from './data'
import { ac, bell, buzz, tick } from './sound'
import { I, Ic } from '../ui/kit'

export type How = 'r' | 'l' | 'b' | 'f'
/** tk: optional strings key for the screen's accessible name in the viewer's language (title stays the English fallback) */
export interface ScreenDef { id: string; flow: 't' | 'h'; title: string; tk?: string; C: FC }
export const SCREENS: ScreenDef[] = []
export function register(...defs: ScreenDef[]): void { for (const d of defs) if (!SCREENS.some((s) => s.id === d.id)) SCREENS.push(d) }

interface Layer { key: number; id: string; cls: string }
let setLayers: ((f: (l: Layer[]) => Layer[]) => void) | null = null
let curId: string | null = null
let keySeq = 0
const FROM: Record<How, string> = { r: 'from-r', l: 'from-l', b: 'from-b', f: 'fade' }
const TO: Record<How, string> = { r: 'to-l', l: 'to-r', b: 'to-f', f: 'to-f' }

export function currentScreen(): string | null { return curId }

/* Sign-up is asked only when the traveller wants to book (App Store guideline 5.1.1(v)): browsing is open. */
const GATED = new Set(['book'])
let afterSignup: { id: string; how: How } | null = null
/** Signed in and accepted the terms + 20+ check. */
export const hasAccount = (): boolean => !!(S.signedIn && S.prof.termsAt)
/** Host actions (verify, publish, accept a guest) need an account too: sends the person to sign-up and back
    to `id` afterwards. Returns true when it redirected. */
export function needAccount(id: string, how: How = 'f'): boolean {
  if (hasAccount() || !SCREENS.some((x) => x.id === 'signup')) return false
  afterSignup = { id, how }
  go('signup', 'r')
  return true
}
/** Where to go after sign-up finishes (the screen that asked for it), once. */
export function takeAfterSignup(): { id: string; how: How } | null { const a = afterSignup; afterSignup = null; return a }

/* Per-screen document.title + focus on the new screen's heading (screen readers hear where they are). */
function announce(key: number, focus = true): void {
  setTimeout(() => {
    const sec = document.querySelector<HTMLElement>(`section.scr[data-k="${key}"]`)
    if (!sec) return
    const h = sec.querySelector<HTMLElement>('h1, h2, [data-title]')
    const name = (h?.textContent || '').trim() || sec.getAttribute('aria-label') || ''
    try { document.title = name ? name + ' · กริ๊ง! Kring' : 'กริ๊ง! Kring' } catch { /* ignore */ }
    if (!focus) return
    const target = h || sec
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
    const ae = document.activeElement as HTMLElement | null
    // keep focus if the person is already typing inside the new screen
    if (ae && sec.contains(ae) && ae !== document.body) return
    try { target.focus({ preventScroll: true }) } catch { /* ignore */ }
  }, 80)
}

/** Navigate. how: r = forward, l = back, b = from bottom, f = fade. force re-mounts the same screen. */
export function go(id: string, how: How = 'r', force = false): void {
  if (GATED.has(id) && !hasAccount() && SCREENS.some((x) => x.id === 'signup')) {
    afterSignup = { id, how } // the sign-up screen explains why (signWhy) and comes back here after
    id = 'signup'; how = 'r'
  }
  const sc = SCREENS.find((s) => s.id === id)
  if (!sc || !setLayers) return
  if (curId === id && !force) return
  // coming back from sign-up (it asked for an account on the way) keeps where the person really came from, so Back never opens sign-up again
  if (curId && how !== 'l' && curId !== id && !force && !(curId === 'signup' && S.from[id])) S.from[id] = curId
  if (sc.flow === 'h') S.host = true
  else if (id !== 'me') S.host = false
  // only a just-shown "done" toast may follow the person to the next screen; errors and notes ("code sent") never do
  if (toastKind !== 'ok' || performance.now() - toastAt > 700) hideToast()
  const lang = S.lang
  document.documentElement.lang = ({ en: 'en', zh: 'zh-Hans', ko: 'ko', hi: 'hi', ru: 'ru', ms: 'ms', th: 'th' } as Record<string, string>)[lang]
  const first = curId === null
  curId = id
  const key = ++keySeq
  setLayers((ls) => [
    ...ls.filter((l) => !l.cls.startsWith('to-')).map((l) => ({ ...l, cls: TO[how] })),
    { key, id, cls: first ? '' : FROM[how] },
  ])
  requestAnimationFrame(() => requestAnimationFrame(() => setLayers?.((ls) => ls.map((l) => (l.key === key && (l.cls.startsWith('from-') || l.cls === 'fade') ? { ...l, cls: '' } : l)))))
  setTimeout(() => setLayers?.((ls) => ls.filter((l) => l.key === key || !l.cls.startsWith('to-'))), 650)
  if (!first) announce(key)
  else announce(key, false) // first load: title only, focus stays at the top of the page
  try {
    const rawHash = location.hash.slice(1)
    const hashBase = rawHash.split('?')[0]
    if (hashBase !== id) history.replaceState(null, '', '#' + id)
  } catch { /* ignore */ }
  update()
}

export function setLang(k: Lang): void {
  update((s) => { s.lang = k })
  if (curId) go(curId, 'f', true)
}

/* ---------- toast ---------- */
/** ok = something worked (green check) · err = something needs fixing (warning, never the green check) · info = neutral note */
export type ToastKind = 'ok' | 'err' | 'info'
let toastAt = 0
let toastKind: ToastKind = 'ok'
let toastTimer: ReturnType<typeof setTimeout> | undefined
interface TSt { msg: string; on: boolean; kind: ToastKind }
let setToastState: ((v: TSt) => void) | null = null
export function toast(msg: string, kind: ToastKind = 'ok'): void {
  toastAt = performance.now()
  toastKind = kind
  clearTimeout(clearTimer)
  setToastState?.({ msg, on: true, kind })
  clearTimeout(toastTimer)
  toastTimer = setTimeout(hideToast, kind === 'err' ? 3600 : 2600)
}
let clearTimer: ReturnType<typeof setTimeout> | undefined
/** Fade the toast out, then drop its text so an old message never lingers in the page (screen readers, later screens). */
function hideToast(): void {
  clearTimeout(toastTimer)
  setToastState?.({ msg: lastMsg, on: false, kind: toastKind })
  clearTimeout(clearTimer)
  clearTimer = setTimeout(() => { if (performance.now() - toastAt > 400) setToastState?.({ msg: '', on: false, kind: toastKind }) }, 450)
}
let lastMsg = ''
const WARN = '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>'
const INFO = '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'
function ToastHost() {
  const [st, set] = useState<TSt>({ msg: '', on: false, kind: 'ok' })
  useEffect(() => { setToastState = (v) => { lastMsg = v.msg; set(v) }; return () => { setToastState = null } }, [])
  return (
    <div className={`toast glass ${st.on ? 'in' : ''}`} role={st.kind === 'err' ? 'alert' : 'status'} aria-hidden={!st.on} data-kind={st.kind} style={{ zIndex: 95 }}>
      {st.kind === 'ok'
        ? <span className="ok"><Ic p={I.check} s={22} sw={3} /></span>
        : <span style={{ width: 34, height: 34, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', color: st.kind === 'err' ? '#1A1203' : '#fff', background: st.kind === 'err' ? 'var(--gold, #FFB21E)' : 'rgba(115,129,255,.35)' }}><Ic p={st.kind === 'err' ? WARN : INFO} s={20} sw={2.4} /></span>}
      <b className="grow">{st.msg}</b>
    </div>
  )
}

/* ---------- stage ---------- */
function Screen({ id, cls, k }: { id: string; cls: string; k: number }) {
  const sc = SCREENS.find((s) => s.id === id)!
  const C = sc.C
  const leaving = cls.startsWith('to-')
  return <section className={`scr ${cls}`} data-k={k} aria-label={sc.tk ? t(sc.tk) : sc.title} aria-hidden={leaving || undefined} {...(leaving ? { inert: '' } : {})} style={leaving ? { pointerEvents: 'none' } : undefined}><C /></section>
}

export function Stage({ start }: { start: string }) {
  const s = useS()
  const [layers, set] = useState<Layer[]>([])
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setLayers = set
    const parseHashScreen = () => location.hash.slice(1).split('?')[0]
    let h = parseHashScreen()
    // shared activity links: #detail?act=<id> opens that activity; an id this app doesn't know never shows another one
    try {
      const a = new URLSearchParams(location.hash.split('?')[1] || '').get('act')
      if (a && h === 'detail') { if (ACTS.some((x) => x.id === a)) S.act = a; else h = 'experiences' }
    } catch { /* ignore */ }
    go(SCREENS.some((x) => x.id === h) ? h : start, 'f')
    const onHash = () => {
      const h2 = parseHashScreen()
      if (SCREENS.some((x) => x.id === h2)) {
        if (h2 !== curId) go(h2, 'f')
        else update()
      }
    }
    window.addEventListener('hashchange', onHash)
    const w = window as unknown as Record<string, unknown>
    w.KR_GO = go; w.KR_SETLANG = setLang; w.KR_S = S
    return () => { window.removeEventListener('hashchange', onHash); set([]); setLayers = null; curId = null }
  }, [start])

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    ac()
    const tg = e.target as HTMLElement
    const hb = tg.closest<HTMLElement>('[data-heart]')
    if (hb) {
      e.stopPropagation()
      const id = hb.dataset.heart!
      update((st) => { st.saved[id] = !st.saved[id] })
      if (S.saved[id]) { toast(t('savedT')); tick(0.9, 0.08); buzz(8) } else tick(0.4, 0.05)
      return
    }
    const tb = tg.closest<HTMLElement>('[data-toast]')
    if (tb) {
      const k = tb.dataset.toast!
      if (k === 'inviteCopied') {
        const slug = (S.prof.name || '').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'friend'
        try { void navigator.clipboard.writeText('https://kringapp.com/i/' + slug).catch(() => {}) } catch { /* ignore */ }
      }
      toast(k === 'savedList' ? t('savedT') + ' · ' + Object.values(S.saved).filter(Boolean).length : t(k))
      tick(0.8, 0.06)
      return
    }
    const sl = tg.closest<HTMLElement>('[data-setlang]')
    if (sl && L[sl.dataset.setlang as Lang]) { bell(0.15, 1975); setLang(sl.dataset.setlang as Lang); return }
    const b = tg.closest<HTMLElement>('[data-go]')
    if (b && !(b as HTMLButtonElement).disabled) {
      if (b.dataset.hostoff) S.host = false
      if (b.dataset.ching) bell(0.45); else tick(0.6, 0.05)
      go(b.dataset.go!, (b.dataset.how as How) || 'r')
    }
  }
  return (
    <div className="kr" ref={root} data-lang={s.lang} data-ts={s.ts} onClick={onClick}>
      {layers.map((l) => <Screen key={l.key} k={l.key} id={l.id} cls={l.cls} />)}
      <ToastHost />
    </div>
  )
}
