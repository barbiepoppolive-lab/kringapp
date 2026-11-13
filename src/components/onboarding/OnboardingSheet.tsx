import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { HostType } from '../meet/MeetFeed'
import { presetFor, writeProfile, type ChonProfile } from '../../lib/profileStore'
import { isGenericName } from '../../lib/identity'
import { kringHaptic, triggerHaptic } from '../../lib/haptics'
import { t } from '../../lib/lexicon'
import { KringBump } from '../ui/KringMark'
import { VerifiedCheck } from '../ui/LivingIcons'
import '../../styles/deep-motion.css'
import '../../styles/shell.css'

/**
 * Kring · the ≤ 1-minute start (round-2 A1). Sign-in and the two promises (20+ · public & kind) happen before this
 * sheet (LoginSheet + AgeGateModal); this sheet is the rest — NO role question:
 *   step 0  name + photo   "What should locals call you?" (name pre-filled from the sign-in; photo optional)
 *   step 1  3 interest taps nine tiles; it moves on by itself after the third tap (skippable)
 *   step 2  done           "You're in, Sarah" · the rings bump · "Done in 0:42" · three picks from the interests
 * A timer pill shows the budget. Panes turn like cube faces (38° on Y, spring.default); tiles pop with spring.bouncy.
 * Hosting is one line at the end (KRING T3, no modes): "＋ Share something you love" in Experiences. Writes `chon_profile_v1` (prefs feed the
 * Experiences filters) and `kring_interests_v1`. A reload resumes at the saved step (draft, 24 h).
 */

const DRAFT_KEY = 'chon_onboarding_draft_v1'
export const INTERESTS_KEY = 'kring_interests_v1'
const TOTAL = 3

interface OnboardingDraft {
  v: 1
  who: string
  step: number
  p: Omit<ChonProfile, 'completedAt'>
  picks?: string[]
  at: number
  startedAt?: number
}
function readDraft(who: string): OnboardingDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Partial<OnboardingDraft>
    if (!d || d.v !== 1 || d.who !== who || typeof d.step !== 'number' || !d.p || typeof d.p !== 'object') return null
    if (typeof d.at !== 'number' || Date.now() - d.at > 24 * 3600_000) return null
    return d as OnboardingDraft
  } catch {
    return null
  }
}
function writeDraft(d: OnboardingDraft): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
  } catch {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, p: { ...d.p, photo: undefined } }))
    } catch {
      // storage blocked → a reload simply starts over
    }
  }
}
function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY)
  } catch {
    // ignore
  }
}

/** The nine interest tiles (EN · TH), the Experiences filter they feed, and the pick we show on the done screen. */
export const INTERESTS: ReadonlyArray<{ id: string; emoji: string; en: string; th: string; hostType: HostType; pick: { en: string; th: string } }> = [
  { id: 'food', emoji: '🍜', en: 'Thai food', th: 'อาหารไทย', hostType: 'food', pick: { en: 'Yaowarat street-food walk', th: 'เดินกินเยาวราช' } },
  { id: 'temples', emoji: '🛕', en: 'Temples', th: 'วัด', hostType: 'culture', pick: { en: 'Temple & café morning', th: 'ไหว้พระ แวะคาเฟ่' } },
  { id: 'spa', emoji: '💆', en: 'Spa day', th: 'สปา', hostType: 'salon', pick: { en: 'Herbal spa afternoon · licensed spa', th: 'สปาสมุนไพร · สปามีใบอนุญาต' } },
  { id: 'muaythai', emoji: '🥊', en: 'Muay Thai', th: 'มวยไทย', hostType: 'experience', pick: { en: 'Muay Thai class · 90 min', th: 'คลาสมวยไทย 90 นาที' } },
  { id: 'markets', emoji: '🛍️', en: 'Markets', th: 'ตลาด', hostType: 'shopping', pick: { en: 'Chatuchak market morning', th: 'เดินจตุจักรตอนเช้า' } },
  { id: 'photo', emoji: '📸', en: 'Photo walks', th: 'เดินถ่ายรูป', hostType: 'experience', pick: { en: 'Old Town photo walk', th: 'เดินถ่ายรูปเมืองเก่า' } },
  { id: 'islands', emoji: '🏝️', en: 'Islands', th: 'เกาะ', hostType: 'experience', pick: { en: 'Koh Larn island day', th: 'เที่ยวเกาะล้านทั้งวัน' } },
  { id: 'music', emoji: '🎶', en: 'Live music', th: 'ดนตรีสด', hostType: 'cafe', pick: { en: 'Live-music café evening', th: 'คาเฟ่ดนตรีสดตอนเย็น' } },
  { id: 'cooking', emoji: '🍳', en: 'Cooking', th: 'ทำอาหาร', hostType: 'experience', pick: { en: 'Thai cooking class', th: 'คลาสทำอาหารไทย' } },
]
const DEFAULT_PICKS = ['food', 'islands', 'spa']

function readInterests(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(INTERESTS_KEY) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export default function OnboardingSheet({ role, provider, displayName, language = 'en', onDone }: { role: string; provider: string; displayName?: string; language?: string; onDone: () => void }) {
  const L = language === 'th' ? 'th' : 'en'
  const th = L === 'th'
  // KRING FIX1 · never pre-fill a placeholder (e.g. Demo Traveler) as the person's name — they type their real one
  const base = useMemo(() => presetFor(role, provider, isGenericName(displayName) ? '' : displayName), [role, provider, displayName])
  const who = `${role}|${provider}|${displayName ?? ''}`
  const draft = useMemo(() => (typeof window === 'undefined' ? null : readDraft(who)), [who])
  const [step, setStep] = useState(() => Math.min(TOTAL - 1, Math.max(0, draft?.step ?? 0)))
  const [dir, setDir] = useState<'next' | 'prev'>('next')
  const [p, setP] = useState<Omit<ChonProfile, 'completedAt'>>(() => (draft ? { ...base, ...draft.p } : base))
  const [picks, setPicks] = useState<string[]>(() => draft?.picks ?? (typeof window === 'undefined' ? [] : readInterests()))
  const [startedAt] = useState<number>(() => draft?.startedAt ?? Date.now())
  const [now, setNow] = useState(() => Date.now())
  const [doneAt, setDoneAt] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const advanceRef = useRef<number | null>(null)

  useEffect(() => {
    writeDraft({ v: 1, who, step, p, picks, at: Date.now(), startedAt })
  }, [who, step, p, picks, startedAt])
  useEffect(() => {
    if (doneAt) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [doneAt])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
      if (advanceRef.current) window.clearTimeout(advanceRef.current)
    }
  }, [])
  useEffect(() => {
    if (step === TOTAL - 1 && !doneAt) setDoneAt(Date.now())
  }, [step, doneAt])

  const set = <K extends keyof ChonProfile>(k: K, v: ChonProfile[K]) => setP((prev) => ({ ...prev, [k]: v }))
  const go = (n: number) => {
    setDir(n > step ? 'next' : 'prev')
    setStep(Math.max(0, Math.min(TOTAL - 1, n)))
  }
  const finish = () => {
    const chosen = picks.length ? picks : []
    const prefs = Array.from(new Set(chosen.map((id) => INTERESTS.find((i) => i.id === id)?.hostType).filter((x): x is HostType => !!x)))
    writeProfile({ ...p, prefs: prefs.length ? prefs : p.prefs, completedAt: new Date().toISOString() })
    try {
      window.localStorage.setItem(INTERESTS_KEY, JSON.stringify(chosen))
    } catch {
      // ignore
    }
    clearDraft()
    triggerHaptic('success')
    onDone()
  }
  const next = () => {
    triggerHaptic('select')
    if (step < TOTAL - 1) go(step + 1)
    else finish()
  }
  const togglePick = (id: string) => {
    triggerHaptic('select')
    setPicks((prev) => {
      const nextPicks = prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 3 ? [...prev.slice(1), id] : [...prev, id]
      if (advanceRef.current) window.clearTimeout(advanceRef.current)
      if (nextPicks.length === 3 && !prev.includes(id)) advanceRef.current = window.setTimeout(() => go(2), 650)
      return nextPicks
    })
  }

  const elapsed = Math.max(0, Math.round(((doneAt ?? now) - startedAt) / 1000))
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`
  const firstName = (p.name || displayName || '').trim().split(' ')[0]
  const shownPicks = (picks.length ? [...picks, ...DEFAULT_PICKS.filter((d) => !picks.includes(d))] : DEFAULT_PICKS).slice(0, 3)

  const body = (
    <div className={`sh-onb-step dm-onb kr-onb-pane is-${dir}`} key={step} data-testid={`onboarding-step-${step}`}>
      {step === 0 && (
        <>
          <h2 className="sh-onb-title kr-onb-title" id="sh-onb-title">{t('ob.name.title', L)}</h2>
          <div className="kr-onb-photo">
            <button type="button" className={`sh-photo m-press${p.photo ? ' has-photo' : ''}`} data-testid="onboarding-photo-btn" onClick={() => fileRef.current?.click()} aria-label={th ? 'เลือกรูป' : 'Choose a photo'}>
              {p.photo ? <img src={p.photo} alt="" /> : <span aria-hidden="true">📷</span>}
              {!p.photo && <span className="kr-onb-plus" aria-hidden="true">+</span>}
              {p.photo && <span className="dm-onb-vcheck" data-testid="onboarding-photo-verified"><VerifiedCheck key={p.photo.length} size={30} draw="always" label={th ? 'มีรูปแล้ว' : 'Photo added'} /></span>}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" data-testid="onboarding-photo-input" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => typeof r.result === 'string' && set('photo', r.result); r.readAsDataURL(f) }} />
          </div>
          <label className="sh-mono" htmlFor="onb-name">{t('ob.name.ph', L)}{provider === 'line' ? (th ? ' · จาก LINE' : ' · filled from LINE') : ''}</label>
          <span className="sh-input-wrap">
            <input id="onb-name" value={p.name} onChange={(e) => set('name', e.target.value)} placeholder={th ? 'เช่น พลอย' : 'e.g. Sarah'} data-testid="onboarding-name" autoComplete="given-name" />
          </span>
          <p className="kr-onb-note">🔒 {th ? 'โชว์แค่ชื่อเล่นกับรูป ข้อมูลติดต่อถูกซ่อนไว้' : 'Only your first name and photo are shown. Your contact details stay hidden.'}</p>
        </>
      )}

      {step === 1 && (
        <>
          <h2 className="sh-onb-title kr-onb-title" id="sh-onb-title">{t('ob.interests.title', L)}</h2>
          <p className="sh-onb-sub">
            <b className="kr-onb-count">{picks.length}</b> {th ? 'จาก 3 · เราจะโชว์เรื่องพวกนี้ก่อน' : "of 3 · we'll show these first"}
          </p>
          <div className="kr-tiles">
            {INTERESTS.map((it, i) => {
              const on = picks.includes(it.id)
              return (
                <button
                  key={it.id}
                  type="button"
                  aria-pressed={on}
                  data-testid={`onboarding-pref-${it.id}`}
                  className="kr-tile"
                  style={{ ['--i' as string]: i }}
                  onClick={() => togglePick(it.id)}
                >
                  <span className="kr-tile-emo" aria-hidden="true">{it.emoji}</span>
                  <span lang={th ? 'th' : undefined}>{th ? it.th : it.en}</span>
                  {on && <span className="kr-tile-tick" aria-hidden="true">✓</span>}
                </button>
              )
            })}
          </div>
          <button type="button" className="sh-link kr-onb-skiplink" onClick={() => { triggerHaptic('tap'); go(2) }}>
            {th ? 'ข้าม · เปลี่ยนได้ทุกเมื่อ' : 'Skip · you can change these any time'}
          </button>
        </>
      )}

      {step === 2 && (
        <div className="kr-onb-done">
          <div className="kr-onb-burst" aria-hidden="true">
            <KringBump playOnMount width={150} lens="hold" onContact={() => kringHaptic('golive')} />
            <i className="kr-ripple" />
            <i className="kr-ripple is-2" />
          </div>
          <h2 className="sh-onb-title kr-onb-title" id="sh-onb-title">
            {th ? `เรียบร้อย${firstName ? ` ${firstName}` : ''}` : `You're in${firstName ? `, ${firstName}` : ''}`}
          </h2>
          <p className="sh-onb-sub">
            {th ? <>เสร็จใน <b className="kr-onb-count">{clock}</b> · เลือกมาให้แล้ว:</> : <>Done in <b className="kr-onb-count">{clock}</b>. Picked for you:</>}
          </p>
          <ul className="kr-picks">
            {shownPicks.map((id, i) => {
              const it = INTERESTS.find((x) => x.id === id) ?? INTERESTS[0]
              return (
                <li key={id} style={{ ['--i' as string]: i }}>
                  <span aria-hidden="true">{it.emoji}</span>
                  <span lang={th ? 'th' : undefined}>{th ? it.pick.th : it.pick.en}</span>
                </li>
              )
            })}
          </ul>
          <p className="kr-onb-note">{th ? 'อยากพาเที่ยว? กด “＋ แชร์สิ่งที่คุณรัก” ในหน้าประสบการณ์' : 'Want to show people around? Tap “＋ Share something you love” in Experiences'}</p>
        </div>
      )}
    </div>
  )

  if (typeof document === 'undefined') return null
  const last = step === TOTAL - 1
  return createPortal(
    <div className="sh-onb kr-onb" role="dialog" aria-modal="true" aria-label={th ? 'เริ่มใช้กริ๊ง' : 'Start Kring'} data-testid="onboarding-sheet">
      <div className="sh-onb-head">
        <div className="sh-onb-row">
          <span className="kr-timer" aria-label={th ? `ผ่านไป ${clock}` : `${clock} elapsed`}>
            <span aria-hidden="true">⏱</span> {clock}
          </span>
          <span className="sh-mono">{t('ob.step', L, { n: step + 1, total: TOTAL })}</span>
          {!last ? (
            <button type="button" className="sh-onb-skip" data-testid="onboarding-skip" onClick={() => { triggerHaptic('tap'); go(step + 1) }}>
              {t('cta.skip', L)}
            </button>
          ) : (
            <span className="sh-onb-skip" aria-hidden="true" style={{ visibility: 'hidden' }}>·</span>
          )}
        </div>
        <div className="sh-onb-bars" aria-hidden="true">{Array.from({ length: TOTAL }).map((_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
      </div>
      <div className="sh-onb-body kr-onb-body">{body}</div>
      <div className="sh-onb-foot">
        {step === 1 && (
          <button type="button" className="sh-btn sh-btn-ghost" onClick={() => { triggerHaptic('tap'); go(0) }}>{th ? 'กลับ' : 'Back'}</button>
        )}
        <button type="button" className="sh-btn sh-btn-gold" data-testid="onboarding-next" onClick={next}>
          {last
            ? th ? 'เริ่มเที่ยวเลย' : 'Start exploring'
            : step === 1
              ? picks.length > 0
                ? th ? `ต่อไป · เลือก ${picks.length}` : `Next · ${picks.length} picked`
                : th ? 'ต่อไป' : 'Next'
              : t('cta.next', L)}
        </button>
      </div>
    </div>,
    document.body,
  )
}
