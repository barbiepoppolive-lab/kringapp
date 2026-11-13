/* Host identity (area E): the host block on #detail and a simple host profile sheet (name, woman/man host, languages,
   hosting since, what Kring checked, sample reviews, story highlights, report/block). Used by #detail (booking.tsx) and the Locals pane (explore.tsx). */
import { browseDiet } from './explore'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { S, update, useS } from '../core/store'
import { t, hostName, ini, aTitle, ph, dayFmt, SL, tRange, bTime, type Act } from '../core/data'
import { factsOf, factsLine } from '../core/actFacts'
import { configured } from '../core/auth'
import { hostInfo, friendApplies, langName, MYLANG, type HostInfo } from '../core/hosts'
import { go, toast } from '../core/router'
import { getHostHighlights, removeHostHighlight, areStoryRepliesOff, setStoryRepliesOff, amHost, MINE } from '../core/stories'
import { I, Ic, Av, Sheet } from '../ui/kit'

const CSS = `
.hprow{display:flex;align-items:center;gap:12px;text-align:left;background:#0F1226;border:0;border-radius:18px;padding:14px;color:inherit;width:100%}
.hprow .hn{font-size:16px;font-weight:600;color:#EEF0FA}
.hprow .hsub{font-size:13px;color:#9AA0BF;margin-top:2px}
.hgchip{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 9px;border-radius:999px;font-size:12px;font-weight:600;background:#0F1226;color:#C9CDE6}
.hrevl{background:none;border:0;padding:0;color:#FFD067;font-weight:600;font-size:13.5px;min-height:32px;text-align:left}
.hnote{font-size:14px;line-height:1.5;color:#C9CDE6}
.hpsheet{max-height:86%;overflow-y:auto}
.hpchk{display:flex;flex-direction:column;gap:6px}
.hpchk span{display:flex;gap:8px;align-items:center;font-size:14px}
.hpchk span i{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:rgba(76,211,154,.18);color:#4CD39A;flex:none}
.hprev{display:flex;flex-direction:column;gap:4px;padding:12px 14px;border-radius:14px;background:#0F1226;border:0}
.hprev .st{color:#FFD067;letter-spacing:1px;font-size:12px}
.hplangs{display:flex;flex-wrap:wrap;gap:6px}
.hplangs span{height:28px;display:inline-flex;align-items:center;padding:0 10px;border-radius:999px;background:#0F1226;border:0;font-size:13px;font-weight:500;color:#C9CDE6}
.hplangs span.me{background:#EEF0FA;color:#05060D;font-weight:600}
.hslots{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.afacts{display:flex;flex-direction:column;gap:8px}
.afacts .afl{font-size:14px;font-weight:600;line-height:1.45}
.afacts .inc.no i{background:rgba(255,255,255,.08);color:var(--mute)}
.hp-hl-row{display:flex;gap:12px;overflow-x:auto;scrollbar-width:none;padding:4px 0;flex:none}
.hp-hl-row::-webkit-scrollbar{display:none}
.hp-hl-item{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;width:62px;flex:none;background:none;border:0;padding:0;color:inherit;cursor:pointer}
.hp-hl-ring{width:54px;height:54px;border-radius:50%;border:1.5px solid rgba(255,255,255,.22);padding:3px;display:grid;place-items:center}
.hp-hl-ring img{width:46px;height:46px;border-radius:50%;object-fit:cover;display:block}
.hp-hl-cap{font-size:11px;color:#9AA0BF;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`

/** The host's avatar: portrait photo when the host uploaded one, otherwise neutral #1B1F36 circle with initial. */
export const HostAv = ({ a, s }: { a: Act; s: number }) => {
  const h = hostInfo(a)
  // host-only controls show on the host's OWN profile, whichever screen they came from (not on other hosts' profiles)
  const customPhoto = isOwnProfile(a) && S.prof.hostPhoto ? S.prof.hostPhoto : undefined
  return <Av ch={ini(hostName(a))} s={s} photo={customPhoto || (h.photo ? ph(h.photo) : undefined)} />
}
/** "Woman host" / "Man host" */
/** This phone's host is looking at their OWN profile (host-only controls show). */
const isOwnProfile = (a: Act): boolean => {
  const me = (S.prof.name || '').trim().toLowerCase()
  return amHost() && !!me && (a.host.toLowerCase() === me || a.hostTh === S.prof.name?.trim())
}
/** The guest's diet: from their profile, or the diet filter they picked while browsing before sign-up. */
const wants = (d: 'jain' | 'halal' | 'veg'): boolean => S.diet.includes(d) || browseDiet().includes(d)
export const genderWord = (h: HostInfo): string => t(h.g === 'f' ? 'hostF' : 'hostM')
const sinceTxt = (h: HostInfo): string => {
  const [y, m] = h.since.split('-').map(Number), d = new Date(y, (m || 1) - 1, 15)
  // Russian "Хост с …" needs the genitive month (июля, not июль): format with the day, then drop it
  if (S.lang === 'ru') return dayFmt(d, { day: 'numeric', month: 'long', year: 'numeric' }).replace(/^\d+\s+/, '')
  return dayFmt(d, { month: 'long', year: 'numeric' })
}
const CHECK: Record<HostInfo['checks'][number], string> = { id: 'verified', face: 'vf_face', phone: 'vf_phone', place: 'vf_place' }

/** Languages the host speaks; the viewer's own language is marked. */
function Langs({ a }: { a: Act }) {
  return <div className="hplangs">{a.langs.map((c) => <span key={c} className={c === MYLANG[S.lang] ? 'me' : ''}>{langName(c)}</span>)}</div>
}

/** Host profile sheet. `onSee` shows a "See the activity" button (Locals pane). */
export function HostSheet({ a, open, onClose, onSee }: { a: Act; open: boolean; onClose: () => void; onSee?: () => void }) {
  useS()
  const h = hostInfo(a), name = hostName(a)
  const revs = configured() ? [] : h.reviews
  const highlights = getHostHighlights(a.id)
  const photoRef = useRef<HTMLInputElement>(null)
  // a new address (back button, a typed #screen) closes the host sheet instead of leaving it over the next screen
  useEffect(() => {
    if (!open) return
    const f = () => onClose()
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [open, onClose])
  const onPhotoPick = (file?: File) => {
    if (!file) return
    const r = new FileReader()
    r.onload = () => {
      update((st) => { st.prof.hostPhoto = String(r.result) })
      toast(t('h6_hv_photo_saved'))
    }
    r.readAsDataURL(file)
  }
  return (
    <Sheet open={open} onClose={onClose} label={t('hpTitle', { host: name })} className="hpsheet">
      <style>{CSS}</style>
      <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
        <HostAv a={a} s={64} />
        <div className="col grow" style={{ gap: 4 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{name}</h2>
          <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span className="hgchip">{genderWord(h)}</span>
            {a.rev > 0 ? <span className="small">★ {a.rating} · {t('reviews', { n: a.rev })}</span> : null}
          </span>
          <span className="small">{t('hostSince', { d: sinceTxt(h) })}</span>
        </div>
        <button
          type="button"
          className="ib"
          id="hp-more-report"
          aria-label={t('reportAct', { a: name })}
          style={{ width: 38, height: 38, background: '#0F1226' }}
          onClick={() => {
            update((st) => { st.act = a.id })
            onClose()
            go('report', 'b')
          }}
        >
          <Ic p={I.flag} s={16} />
        </button>
      </div>
      {highlights.length > 0 && (
        <>
          <span className="eyebrow">{t('stHighlights')}</span>
          <div className="hp-hl-row" id="hp-highlights">
            {highlights.map((st, idx) => (
              <div key={st.id} className="hp-hl-item">
                <button
                  type="button"
                  style={{ background: 'none', border: 0, padding: 0, color: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                  onClick={() => {
                    onClose()
                    update((s0) => { s0.storyHost = a.id; s0.storyIdx = idx })
                    go('story', 'f')
                  }}
                >
                  <span className="hp-hl-ring"><img src={st.mediaUrl} alt="" /></span>
                  <span className="hp-hl-cap">{st.caption || name}</span>
                </button>
                {isOwnProfile(a) && (
                  <button
                    type="button"
                    aria-label={t('stRemoveHighlight')}
                    style={{ position: 'absolute', top: -2, right: 2, width: 20, height: 20, borderRadius: '50%', background: '#05060D', color: '#EEF0FA', border: 0, fontSize: 11, display: 'grid', placeItems: 'center' }}
                    onClick={() => removeHostHighlight(st.id)}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {isOwnProfile(a) && (
        <div className="col" style={{ gap: 8, padding: '10px 12px', borderRadius: 14, background: '#0F1226' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small" style={{ color: '#EEF0FA' }}>{t('h6_hv_photo')}</span>
            <button type="button" className="chip" id="hp-change-photo" style={{ height: 32, fontSize: 12.5 }} onClick={() => photoRef.current?.click()}>{t('h6_hv_photo_change')}</button>
            <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => onPhotoPick(e.target.files?.[0])} />
          </div>
          {h.g === 'f' && (
            <label className="row" style={{ justifyContent: 'space-between', cursor: 'pointer' }}>
              <span className="small" style={{ color: '#EEF0FA' }}>{t('stRepliesToggle')}</span>
              <span className="sw">
                <input
                  type="checkbox"
                  id="hp-story-replies-off"
                  checked={areStoryRepliesOff(MINE)}
                  onChange={(e) => setStoryRepliesOff(MINE, e.target.checked)}
                />
                <i />
              </span>
            </label>
          )}
        </div>
      )}
      <span className="eyebrow">{t('hpLangs')}</span>
      <Langs a={a} />
      <span className="eyebrow">{t('hpVerified')}</span>
      <div className="hpchk">{h.checks.map((c) => <span key={c}><i><Ic p={I.check} s={13} sw={3} /></i>{t(CHECK[c])}</span>)}</div>
      <span className="eyebrow">{t('hpReviews')}</span>
      {revs.length ? (
        <>
          {revs.map((r, i) => (
            <div key={i} className="hprev">
              <span className="row" style={{ gap: 8 }}><b style={{ fontSize: 14, fontWeight: 600 }}>{r.by}</b><span className="small">{r.from} · {sinceTxt({ ...h, since: r.when })}</span><span className="grow" /><span className="st" aria-label={`${r.stars}/5`}>{'★'.repeat(r.stars)}</span></span>
              <span lang={r.lang} style={{ fontSize: 14, lineHeight: 1.45 }}>{r.text}</span>
            </div>
          ))}
          <span className="small">{t('hpRevNote')}</span>
        </>
      ) : <span className="small">{t('hpNoRev')}</span>}
      {onSee && <button type="button" className="btn gold" onClick={onSee}>{t('hpSeeAct')} · {aTitle(a)}</button>}
    </Sheet>
  )
}

/** Host block at the top of #detail: #0F1226 host card, equal-width 44px start time buttons, and plain 14px diet text. */
export function DetailHost({ a }: { a: Act; time?: string }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const h = hostInfo(a), name = hostName(a)
  // the sheet belongs to the whole screen (above the sticky price bar), not to the scrolling body
  const screen = open ? wrap.current?.closest('section.scr') || null : null
  const vol = !!a.isVolunteer || a.price === 0
  return (
    <>
      <style>{CSS}</style>
      <div className="col" style={{ gap: 16 }} ref={wrap}>
        <button type="button" className="d-host-card" id="detail-host" aria-haspopup="dialog" aria-label={t('hpOpen', { host: name })} onClick={() => setOpen(true)}>
          <HostAv a={a} s={48} />
          <span className="col grow" style={{ gap: 2 }}>
            <span className="hn">{t('hostedBy', { host: name })}</span>
            <span className="hsub">
              <span id="detail-host-gender">{genderWord(h)}</span> · {t('idVerifiedShort')}{a.rev > 0 ? <> · <span id="detail-reviews">★ {a.rating} ({a.rev})</span></> : null}
              {vol && <span id="detail-volunteer-badge" style={{ color: '#FFD067', marginLeft: 4 }}>· {t('volBadge')}</span>}
            </span>
          </span>
          <Ic p={I.chev} s={18} />
        </button>
        <Slots a={a} />
        {(a.veg || a.halal || a.jain) && (
          <div className="hnote" id="detail-diet-note">
            {/* the note that matches the guest's own diet first (Jain guest sees the Jain note even when the class is also halal) */}
            {wants('jain') && a.jain ? t('jainNote') : wants('halal') && a.halal ? t('halalNote') : a.halal ? t('halalNote') : a.jain ? t('jainNote') : t('dietPlainNote', { host: name })}
          </div>
        )}
        {friendApplies(a) && <div className="hnote" style={{ color: '#9AA0BF', fontSize: 13 }}>{t('friendNote')}</div>}
      </div>
      {open && (screen ? createPortal(<HostSheet a={a} open onClose={() => setOpen(false)} />, screen) : <HostSheet a={a} open onClose={() => setOpen(false)} />)}
    </>
  )
}

/** Every start time of the activity on #detail (3 equal-width 44px buttons). Tapping one picks it for Book & pay. */
function Slots({ a }: { a: Act }) {
  const s = useS()
  const slots = SL(a)
  const cur = s.time && s.timeAct === a.id ? s.time : (slots[1] || slots[0] || null)
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="col" style={{ gap: 2 }}>
        <span id="detail-times-l" style={{ fontSize: 15, fontWeight: 600, color: '#EEF0FA' }}>{t('pickStartTime')}</span>
        <span className="small">{ s.time && s.timeAct === a.id ? t('dTimePicked', { t: tRange(a, bTime()) }) : t('chooseDayNext') }</span>
      </div>
      <div className="d-slots" id="detail-times" role="group" aria-labelledby="detail-times-l">
        {slots.map((x) => (
          <button key={x} type="button" className={`num ${cur === x ? 'on' : ''}`} aria-pressed={cur === x} data-slot={x}
            onClick={() => update((st) => { st.time = x; st.timeAct = a.id })}>{x}</button>
        ))}
      </div>
    </div>
  )
}

/** Walking distance, stairs, pace, and what the host price includes and does not include (food, drinks, tickets). */
export function ActFacts({ a }: { a: Act }) {
  const f = factsOf(a)
  const row = (k: string, yes: boolean) => <div key={k} className={`inc ${yes ? '' : 'no'}`}><i><Ic p={yes ? I.check : I.close} s={14} sw={3} /></i>{t(k)}</div>
  return (
    <div className="afacts" id="detail-facts">
      <style>{CSS}</style>
      <span className="eyebrow">{t('afHead')}</span>
      {f ? (
        <>
          <span className="afl" id="detail-walk">{factsLine(f)}</span>
          <span className="eyebrow" style={{ marginTop: 4 }}>{t('afInc', { host: hostName(a) })}</span>
          {f.inc.map((k) => row(k, true))}
          <span className="eyebrow" style={{ marginTop: 4 }}>{t('afNotInc')}</span>
          {f.notInc.map((k) => row(k, false))}
        </>
      ) : <span className="small">{t('afAsk', { host: hostName(a) })}</span>}
    </div>
  )
}
