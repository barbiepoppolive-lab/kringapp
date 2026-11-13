/* Shared UI pieces for Kring v6: icons, rings, avatar, tab bar, header, sheet, Thai gloss text. */
import { useEffect, useRef, type CSSProperties, type ReactNode, type KeyboardEvent as RKeyboardEvent } from 'react'
import { tick } from '../core/sound'
import { S, update } from '../core/store'
import { t } from '../core/data'

export const I: Record<string, string> = {
  back: '<path d="M15 5l-7 7 7 7"/>', close: '<path d="M6 6l12 12M18 6L6 18"/>', heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>', check: '<path d="M5 12l4 4 10-10"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>', lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', gift: '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M4 13h16M12 9v11M12 9c-2-4-6-4-6-1s6 1 6 1zM12 9c2-4 6-4 6-1s-6 1-6 1z"/>',
  send: '<path d="M4 12l16-8-6 16-3-7z"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c.8-3.5 3.2-5 6-5s5.2 1.5 6 5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c1.6.6 2.6 2 3 5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>', star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  cash: '<rect x="3" y="7" width="18" height="10" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M3 4l18 16"/>', id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 16c.6-1.6 1.9-2.4 3.5-2.4s2.9.8 3.5 2.4M15 10h4M15 13h3"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>', flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', filter: '<path d="M4 6h16M7 12h10M10 18h4"/>', chev: '<path d="M9 5l7 7-7 7"/>', up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>',
  sim: '<path d="M7 3h7l4 4v14H7z"/><rect x="9.5" y="11" width="6" height="6" rx="1"/>', car: '<path d="M4 16v-4l2-5h12l2 5v4z"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/><path d="M4 12h16"/>',
  bag: '<rect x="5" y="8" width="14" height="12" rx="2"/><path d="M9 8V5h6v3M9 20v1M15 20v1"/>', film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  ticket: '<path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z"/>', invite: '<circle cx="10" cy="8" r="4"/><path d="M2 21c1-4 4.5-6 8-6"/><path d="M18 14v6M15 17h6"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10l5-3v10l-5-3z"/>', mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  link: '<path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1"/><path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/>', loc: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/>',
}
/** SVG string (for places that build HTML strings, e.g. chat bubbles kept in history). */
export const SV = (p: string, w = 20, extra = ''): string => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${p}</svg>`
/** Icon component. `p` = path markup from I. */
export function Ic({ p, s = 20, sw = 2, style }: { p: string; s?: number; sw?: number; style?: CSSProperties }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style} dangerouslySetInnerHTML={{ __html: p }} />
}
export function Rings({ w = 40 }: { w?: number }) {
  return <svg width={w} height={w * 0.6} viewBox="0 0 40 24" aria-hidden="true"><circle cx="14" cy="12" r="9" fill="none" stroke="#7381FF" strokeWidth="3" /><circle cx="26" cy="12" r="9" fill="none" stroke="#FFB21E" strokeWidth="3" /></svg>
}
export const RINGS = (w = 40): string => `<svg width="${w}" height="${w * 0.6}" viewBox="0 0 40 24" aria-hidden="true"><circle cx="14" cy="12" r="9" fill="none" stroke="#7381FF" stroke-width="3"/><circle cx="26" cy="12" r="9" fill="none" stroke="#FFB21E" stroke-width="3"/></svg>`
/** Round avatar: the person's photo when there is one, otherwise their initial on a neutral #1B1F36 circle with #C9CDE6 text (R7 spec: no coloured gradients, no gold ring). */
export function Av({ ch, s = 46, gold = false, photo, tone: _tone }: { ch: string; s?: number; gold?: boolean; photo?: string; tone?: [string, string] }) {
  void _tone; void gold
  const st = { ['--s' as string]: `${s}px` } as CSSProperties
  if (photo) return <span className="av" style={{ ...st, overflow: 'hidden', padding: 0 }}><img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /></span>
  return <span className="av" style={st}>{ch}</span>
}
export const av = (ch: string, s = 46, gold = false): string => {
  void gold
  const safe = String(ch).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
  return `<span class="av" style="--s:${s}px">${safe}</span>`
}
/** Thai text with an optional English gloss line. */
export function TTh({ th, en }: { th: ReactNode; en: string }) {
  return <>{th}<span className="gl">{en}</span></>
}
export const Html = ({ h, as = 'span', className, style }: { h: string; as?: 'span' | 'div' | 'b' | 'p'; className?: string; style?: CSSProperties }) => {
  const Tag = as
  return <Tag className={className} style={style} dangerouslySetInnerHTML={{ __html: h }} />
}

const TICON: Record<string, string> = {
  explore: '<circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" />',
  deals: '<path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z"/><path d="M14 8v10" stroke-dasharray="2 2.5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>',
}
/** Bottom tab bar (R7 locked spec: #0A0C18 with 1px rgba(255,255,255,.08) top line, active #FFD067 600, inactive #9AA0BF 500). */
export function Tabs({ active, host = false }: { active: string; host?: boolean }) {
  const items: [string, string, string][] = [['explore', 't_explore', 'experiences'], ['deals', 't_deals', 'tours'], ['chat', 't_chats', 'chats'], ['user', 't_me', 'me']]
  const HL = ['สำรวจ', 'ดีล', 'แชท', 'ฉัน']
  const i = ({ experiences: 0, locals: 0, tours: 1, packages: 1, vouchers: 1, chat: 2, chats: 2, me: 3 } as Record<string, number>)[active] ?? 3
  S.lastTab = i
  return (
    <nav className="tabs" data-tab={i} aria-label="Kring">
      {items.map((x, j) => (
        <button key={x[0]} className={`${j === i ? 'on' : ''} ${host && S.lang === 'th' ? 'th' : ''}`} data-go={x[2]} data-how="f" aria-current={j === i ? 'page' : undefined} data-hostoff={host && x[2] === 'me' ? '1' : undefined}>
          <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: TICON[x[0]] }} />{host && S.lang === 'th' ? HL[j] : t(x[1])}
        </button>
      ))}
    </nav>
  )
}
/** Explore header (R7 locked spec Section 2): used ONLY on Experiences & Locals.
 *  3D/4D animated Kring logo + small BKK | PTY city toggle + language globe button. */
export function Head() {
  useEffect(() => {
    const syncVis = () => document.documentElement.classList.toggle('kr-paused', document.hidden)
    syncVis()
    document.addEventListener('visibilitychange', syncVis)
    return () => document.removeEventListener('visibilitychange', syncVis)
  }, [])
  const city = S.city || 'bkk'
  const setCity = (c: 'bkk' | 'pty') => { update((s) => { s.city = c }); tick(0.55, 0.05) }
  return (
    <header className="xhead">
      <div className="kr-logo" aria-label="Kring · กริ๊ง!">
        <span className="kr-mark" aria-hidden="true">
          <i className="kr-ring kr-a" />
          <i className="kr-ring kr-b" />
        </span>
        <span className="kr-word" lang="th">กริ๊ง!</span>
      </div>
      <div className="grow" />
      <div className="city-seg" role="group" aria-label={t('cityToggle')}>
        <button type="button" className={city === 'bkk' ? 'on' : ''} aria-pressed={city === 'bkk'} data-city="bkk" onClick={() => setCity('bkk')}>{t('cityBkkShort')}</button>
        <button type="button" className={city === 'pty' ? 'on' : ''} aria-pressed={city === 'pty'} data-city="pty" onClick={() => setCity('pty')}>{t('cityPtyShort')}</button>
      </div>
      <button type="button" className="icon-btn" data-go="lang" data-how="b" aria-label={t('langTitle')}>
        <Ic p={I.globe} s={20} sw={1.8} />
      </button>
    </header>
  )
}
/** Bottom sheet with scrim. Render inside a screen. Escape closes it; focus moves into it and back when it closes. */
export function Sheet({ open, onClose, children, style, className = '', label }: { open: boolean; onClose: () => void; children: ReactNode; style?: CSSProperties; className?: string; label?: string }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    tick(0.6, 0.07)
    const prev = document.activeElement as HTMLElement | null
    const f = box.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    try { (f || box.current)?.focus({ preventScroll: true }) } catch { /* ignore */ }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !box.current) return
      // keep keyboard focus inside the open sheet
      const fs = Array.from(box.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'))
      if (!fs.length) return
      const first = fs[0], last = fs[fs.length - 1], ae = document.activeElement as HTMLElement | null
      if (e.shiftKey && (ae === first || !box.current.contains(ae))) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (ae === last || !box.current.contains(ae))) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); try { prev?.focus({ preventScroll: true }) } catch { /* ignore */ } }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div ref={box} tabIndex={-1} className={`bsheet glass ${className}`} style={style} role="dialog" aria-modal="true" aria-label={label}><div className="handle" />{children}</div>
    </>
  )
}

/** Toggle chip: selected state is exposed as aria-pressed (never colour alone). */
export function Chip({ on, onClick, children, className = '', style, ...rest }: { on: boolean; onClick: () => void; children: ReactNode; className?: string; style?: CSSProperties } & Record<`data-${string}`, string | undefined>) {
  return <button type="button" className={`chip ${on ? 'on' : ''} ${className}`} aria-pressed={on} onClick={onClick} style={style} {...rest}>{children}</button>
}

/** Single-choice chip group (dates, times, payment, "I am"): radio semantics, arrow keys move the choice. */
export function Choice<V extends string | number>({ label, value, options, onChange, className = 'chips', chipClass = '', id }: {
  label: string; value: V | null; options: { v: V; label: ReactNode; lang?: string }[]; onChange: (v: V) => void; className?: string; chipClass?: string; id?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const onKey = (e: RKeyboardEvent) => {
    const k = e.key
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(k)) return
    e.preventDefault()
    const i = Math.max(0, options.findIndex((o) => o.v === value))
    const n = (i + (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1) + options.length) % options.length
    onChange(options[n].v)
    requestAnimationFrame(() => ref.current?.querySelectorAll<HTMLElement>('[role="radio"]')[n]?.focus())
  }
  const sel = options.findIndex((o) => o.v === value)
  return (
    <div ref={ref} className={className} role="radiogroup" aria-label={label} id={id} onKeyDown={onKey}>
      {options.map((o, i) => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={o.v === value} tabIndex={(sel < 0 ? i === 0 : i === sel) ? 0 : -1}
          lang={o.lang} className={`chip ${chipClass} ${o.v === value ? 'on' : ''}`} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  )
}
