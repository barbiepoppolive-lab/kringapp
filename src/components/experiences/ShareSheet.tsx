import { useEffect, useMemo, useRef, useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { triggerHaptic } from '../../lib/haptics'
import { playKring } from '../../lib/sfx'
import { markIdVerified, readPresence, upsertListing, useIdVerified } from '../../context/presence'
import { recordAttributedHostVerification } from '../../lib/attribution'
import {
  EXPERIENCES,
  GROUPS,
  MIN_TRIP_FEE,
  experiencePhoto,
  isAllowedListingText,
  isPublicPlace,
  kringPriceRange,
  primaryAudience,
  readListingDetails,
  saveListingDetail,
  shortTitle,
  shortTitleTh,
  useCity,
  venueIn,
  type Experience,
  type ExperienceGroupId,
} from '../../lib/experiences'
/** same as ExperiencesTab OPEN_EXPERIENCE_EVENT (string here: no import cycle) */
const OPEN_EXPERIENCE_EVENT = 'kring:open-experience'
import './experiences.css'

/**
 * Kring T3 · "＋ Share something you love" — anyone can share, there is no Local mode.
 *
 *   (0  Verify your ID — only while the account has no ID check; the same demo check as Me › Verify your ID)
 *    1  What   — name it, pick a kind and the closest catalogue experience, a photo, languages
 *    2  Where  — where you meet (public places / licensed businesses only) and usual times
 *    3  Trip fee — guided by Kring Price, "Live now?" → Publish
 *
 * Publishing goes through the one listing path: presence `writePresence({ setup: true, experiences, live })`; the extra
 * words (her name for it, photo, area, times, languages) are saved with `saveListingDetail` (lib/experiences). Nothing
 * here ever states a split or a percentage — the trip fee is what the guest pays, that's all.
 *
 * Rendered by ExperiencesTab (entry at the top of the list). Me can render it too: <ShareSheet open onClose language />.
 */
export interface ShareSheetProps {
  open: boolean
  onClose: () => void
  language?: string
  /** start from a catalogue experience (e.g. "Share this too" on a page) */
  initialExperienceId?: string
}

type Step = 'verify' | 'what' | 'where' | 'fee' | 'done'
type KindId = ExperienceGroupId | 'twoway'
type IdStep = 'doc' | 'scan' | 'face' | 'done'

const LANGS: Array<{ id: string; label: string }> = [
  { id: 'th', label: 'ไทย' },
  { id: 'en', label: 'English' },
  { id: 'zh', label: '中文' },
  { id: 'ja', label: '日本語' },
  { id: 'ko', label: '한국어' },
]
const TIMES: Array<{ id: string; en: string; th: string }> = [
  { id: 'sat', en: 'Sat', th: 'ส.' },
  { id: 'sun', en: 'Sun', th: 'อา.' },
  { id: 'weekday-eve', en: 'Weekday eve', th: 'เย็นวันธรรมดา' },
  { id: 'morning', en: 'Mornings', th: 'ช่วงเช้า' },
  { id: 'afternoon', en: 'Afternoons', th: 'ช่วงบ่าย' },
]
const baht = (n: number) => `฿${n.toLocaleString('en-US')}`

function signedIn(): boolean {
  try {
    const raw = window.localStorage.getItem('chon_auth_session_v1') ?? window.sessionStorage.getItem('chon_auth_session_v1')
    return Boolean(raw && (JSON.parse(raw) as { userId?: string }).userId)
  } catch {
    return false
  }
}
function profileLangs(): string[] {
  try {
    const p = JSON.parse(window.localStorage.getItem('chon_profile_v1') ?? 'null') as { langs?: string[] } | null
    return p?.langs?.length ? p.langs : ['th', 'en']
  } catch {
    return ['th', 'en']
  }
}

/** words in common between what she typed and a catalogue title (both languages) */
function score(q: string, e: Experience): number {
  const words = q.toLowerCase().split(/[^a-z0-9฀-๿]+/).filter((w) => w.length > 2)
  if (!words.length) return 0
  const hay = `${e.title} ${e.titleTh} ${e.venueEn}`.toLowerCase()
  return words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0)
}

/** a phone photo → a small JPEG data URL (longest side 480 px) so it fits on the device */
function shrinkPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, 480 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      const ctx = c.getContext('2d')
      if (!ctx) return reject(new Error('no canvas'))
      ctx.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.72))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('bad image'))
    }
    img.src = url
  })
}

export default function ShareSheet({ open, onClose, language = 'en', initialExperienceId }: ShareSheetProps) {
  const th = language === 'th'
  const verified = useIdVerified()
  void verified
  const [city] = useCity()
  const [step, setStep] = useState<Step>('what')
  const [idStep, setIdStep] = useState<IdStep>('doc')
  const [idDoc, setIdDoc] = useState<'thai-id' | 'passport'>('thai-id')
  const [pdpaConsent, setPdpaConsent] = useState(false)

  const start = EXPERIENCES.find((e) => e.id === initialExperienceId)
  const [name, setName] = useState(start ? (th ? shortTitleTh(start) : shortTitle(start)) : '')
  const [kind, setKind] = useState<KindId | null>(start ? (start.twoWay ? 'twoway' : start.group) : null)
  const [pickId, setPickId] = useState<string | null>(start?.id ?? null)
  const [photo, setPhoto] = useState('')
  const [photoErr, setPhotoErr] = useState(false)
  const [langs, setLangs] = useState<string[]>(() => profileLangs())
  const [area, setArea] = useState(start ? (th ? venueIn(start, city).th : venueIn(start, city).en) : '')
  const [areaTouched, setAreaTouched] = useState(false)
  const [times, setTimes] = useState<string[]>(['sat', 'sun'])
  const [fee, setFee] = useState(start?.fromThb ?? 500)
  const [freeTwoWay, setFreeTwoWay] = useState(false)
  const [tatLicence, setTatLicence] = useState('')
  const [liveNow, setLiveNow] = useState(true)
  const [published, setPublished] = useState<{ id: string; live: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const pick = EXPERIENCES.find((e) => e.id === pickId) ?? null

  // the demo ID check runs on its own: scan → face → verified (the real check waits for the ID partner here)
  useEffect(() => {
    if (step !== 'verify' || idStep === 'doc' || idStep === 'done') return
    const t = window.setTimeout(() => {
      if (idStep === 'scan') setIdStep('face')
      else {
        markIdVerified()
        recordAttributedHostVerification()
        triggerHaptic('success')
        setIdStep('done')
      }
    }, idStep === 'scan' ? 1400 : 1200)
    return () => window.clearTimeout(t)
  }, [step, idStep])

  const kinds: Array<{ id: KindId; label: string; emoji: string }> = useMemo(() => {
    const here = EXPERIENCES.filter((e) => e.city.includes(city))
    return [
      ...GROUPS.filter((g) => here.some((e) => e.group === g.id && !e.twoWay)).map((g) => ({
        id: g.id as KindId,
        label: th ? g.th : g.en.split(' ')[0].replace('&', '').trim(),
        emoji: g.emoji,
      })),
      { id: 'twoway' as KindId, label: th ? 'แลกเปลี่ยนกัน' : 'Two-way', emoji: '⇄' },
    ]
  }, [city, th])

  const matches = useMemo(() => {
    const here = EXPERIENCES.filter((e) => e.city.includes(city))
    const inKind = kind === 'twoway' ? here.filter((e) => e.twoWay) : kind ? here.filter((e) => e.group === kind && !e.twoWay) : here
    const q = name.trim()
    const ranked = inKind
      .map((e) => ({ e, s: score(q, e) }))
      .filter((x) => kind || x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.e)
    const out = ranked.slice(0, 4)
    if (pick && !out.some((e) => e.id === pick.id)) out.unshift(pick)
    return out
  }, [city, kind, name, pick])

  const choose = (e: Experience) => {
    triggerHaptic('select')
    setPickId(e.id)
    if (!name.trim()) setName(th ? shortTitleTh(e) : shortTitle(e))
    if (!areaTouched) setArea(th ? venueIn(e, city).th : venueIn(e, city).en)
    const already = readPresence().experiences?.find((x) => x.id === e.id)
    setFee(Math.max(MIN_TRIP_FEE, already?.priceThb ?? e.fromThb))
    const d = readListingDetails()[e.id]
    if (d) {
      if (d.photo) setPhoto(d.photo)
      if (d.times?.length) setTimes(d.times)
    }
  }

  const nameOk = isAllowedListingText(name)
  const areaOk = isPublicPlace(area)
  const range = pick ? kringPriceRange(pick) : null
  const steps: Step[] = ['what', 'where', 'fee']
  const at = steps.indexOf(step)
  const go = (s: Step) => {
    triggerHaptic('select')
    setStep(s)
  }

  const publish = () => {
    if (!pick) return
    const own = name.trim()
    const aud = primaryAudience(pick, th)
    const effectivePrice = pick.twoWay && freeTwoWay ? 0 : Math.max(MIN_TRIP_FEE, fee)
    // the one listing path (W4 presence): per-listing Live / Paused; guests see it only after the ID check
    const after = upsertListing({
      id: pick.id,
      priceThb: effectivePrice,
      live: liveNow,
      title: own || shortTitle(pick),
      titleTh: own || shortTitleTh(pick),
      area: area.trim(),
      photo: photo || undefined,
      tag: aud === 'twoway' ? 'two-way' : aud === 'weekend' ? 'thais' : 'travellers',
    })
    // the words presence doesn't keep (usual times, languages) + her name / area for her Local card
    saveListingDetail({
      id: pick.id,
      name: own || shortTitle(pick),
      area: area.trim(),
      times,
      langs,
      tatLicence: tatLicence.trim() || undefined,
    })
    const isLive = liveNow && after.live
    triggerHaptic('success')
    if (isLive) playKring('golive')
    setPublished({ id: pick.id, live: isLive })
    setStep('done')
  }

  const title = th ? 'แชร์สิ่งที่คุณรัก' : 'Share something you love'
  const footer = (() => {
    if (step === 'verify') {
      if (idStep !== 'done') return null
      return (
        <button type="button" className="kx-cta kf-press" data-testid="share-verified-next" onClick={() => go('what')}>
          {th ? 'ต่อไป: จะแชร์อะไร' : 'Next: what you’ll share'}
        </button>
      )
    }
    if (step === 'done') {
      return (
        <div className="kx-sh-foot">
          <button
            type="button"
            className="kx-cta is-quiet kf-press"
            data-testid="share-see"
            onClick={() => {
              const id = published?.id
              onClose()
              if (id) window.setTimeout(() => window.dispatchEvent(new CustomEvent(OPEN_EXPERIENCE_EVENT, { detail: { id } })), 60)
            }}
          >
            {th ? 'ดูหน้าทริป' : 'See it'}
          </button>
          <button type="button" className="kx-cta kf-press" data-testid="share-done" onClick={onClose}>
            {th ? 'เสร็จ' : 'Done'}
          </button>
        </div>
      )
    }
    const next = step === 'what' ? 'where' : step === 'where' ? 'fee' : null
    const can = step === 'what' ? Boolean(pick) && nameOk : step === 'where' ? areaOk : Boolean(pick)
    return (
      <div className="kx-sh-foot">
        {at > 0 && (
          <button type="button" className="kx-cta is-quiet kf-press" data-testid="share-back" onClick={() => go(steps[at - 1])}>
            {th ? 'ย้อนกลับ' : 'Back'}
          </button>
        )}
        {next ? (
          <button
            type="button"
            className="kx-cta kf-press"
            data-testid="share-next"
            disabled={!can}
            onClick={() => {
              if (step === 'where') setAreaTouched(true)
              if (can) go(next)
              else triggerHaptic('error')
            }}
          >
            {th ? 'ต่อไป' : 'Next'}
          </button>
        ) : (
          <button type="button" className="kx-cta kf-press" data-testid="share-publish" disabled={!can} onClick={publish}>
            {liveNow ? (th ? 'เผยแพร่ · ออนไลน์เลย' : 'Publish · go Live') : th ? 'บันทึก · พักไว้ก่อน' : 'Save · Paused'}
          </button>
        )}
      </div>
    )
  })()

  return (
    <Sheet
      open={open}
      onClose={onClose}
      initialDetent="92%"
      testId="share-sheet"
      ariaLabel={title}
      title={title}
      bodyClassName="kx-fs kx-sh"
      footer={footer}
    >
      {step !== 'verify' && step !== 'done' && (
        <div className="kx-sh-bar" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={at + 1} aria-label={th ? `ขั้นที่ ${at + 1} จาก 3` : `Step ${at + 1} of 3`}>
          {steps.map((s, i) => (
            <i key={s} data-on={i <= at} />
          ))}
        </div>
      )}

      {step === 'verify' && (
        <div className="kx-sh-step" data-testid="share-step-verify" data-id-step={idStep}>
          <p className="kx-slab">{th ? 'ก่อนแชร์ · ครั้งเดียว' : 'Before you share · once'}</p>
          <h3 className="kx-sh-h">{th ? 'ยืนยันตัวตน' : 'Verify your ID'}</h3>
          {!signedIn() ? (
            <>
              <p className="kx-explain">{th ? 'เข้าสู่ระบบก่อน แล้วแชร์ได้เลย' : 'Sign in first, then you can share.'}</p>
              <button type="button" className="kx-cta kf-press" style={{ marginTop: 12 }} data-testid="share-signin" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('chon:open-login-sheet')) }}>
                {th ? 'เข้าสู่ระบบ' : 'Sign in'}
              </button>
            </>
          ) : idStep === 'doc' ? (
            <>
              <p className="kx-explain">
                {th
                  ? 'ใครก็แชร์ได้ แต่จะยังไม่ออนไลน์จนกว่าจะยืนยันตัวตน แล้วเครื่องหมาย ✓ โลคอล จะขึ้นบนโปรไฟล์ แขกเห็นแค่ ✓ ไม่เห็นเลขบัตร'
                  : 'Anyone can share. Nothing goes live until your ID is checked — then the ✓ Local badge shows on your profile. Guests see the ✓ only, never your ID number.'}
              </p>
              <div className="kx-chips" role="radiogroup" aria-label={th ? 'เอกสาร' : 'Document'} style={{ marginTop: 14 }}>
                {(['thai-id', 'passport'] as const).map((d) => (
                  <button key={d} type="button" role="radio" aria-checked={idDoc === d} className="kx-chip kf-press" onClick={() => setIdDoc(d)}>
                    {d === 'thai-id' ? (th ? 'บัตรประชาชน' : 'Thai ID card') : th ? 'พาสปอร์ต' : 'Passport'}
                  </button>
                ))}
              </div>
              <label className="kx-fine" data-testid="pdpa-biometric-notice" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={pdpaConsent}
                  onChange={(e) => setPdpaConsent(e.target.checked)}
                  data-testid="pdpa-biometric-consent"
                  style={{ marginTop: 2 }}
                />
                <span>
                  {th
                    ? 'ยินยอมให้ Kring (ผู้ควบคุมข้อมูล) เทียบภาพเซลฟี่กับรูปในบัตรแบบ 1:1 เพื่อยืนยันตัวตน ภาพต้นฉบับจะถูกลบทันทีหลังตรวจ เก็บไว้เฉพาะสถานะ ✓ ถอนความยินยอมได้ที่ privacy@kringapp.com'
                    : 'I consent to Kring (Data Controller) matching my selfie to my ID photo for 1:1 verification. Raw biometric photos are deleted immediately after matching; only the ✓ status is retained. Withdraw anytime at privacy@kringapp.com.'}
                </span>
              </label>
              <button
                type="button"
                className="kx-cta kf-press kx-sh-block"
                data-testid="share-id-start"
                disabled={!pdpaConsent}
                onClick={() => {
                  try {
                    window.localStorage.setItem('kring_pdpa_biometric_consent_v1', new Date().toISOString())
                  } catch {
                    /* ignore */
                  }
                  triggerHaptic('select')
                  setIdStep('scan')
                }}
              >
                {th ? 'สแกนเอกสาร · 2 นาที' : 'Scan my document · 2 min'}
              </button>
              <button
                type="button"
                className="kx-cta is-quiet kf-press kx-sh-block"
                data-testid="share-templates-first"
                style={{ marginTop: 8 }}
                onClick={() => {
                  triggerHaptic('select')
                  setStep('what')
                }}
              >
                {th ? '⚡ เลือกเทมเพลต 10 วินาทีก่อน (ยืนยันก่อนรับงานแรก)' : '⚡ Pick a <10s Template First (Verify before 1st booking)'}
              </button>
              <p className="kx-fine">{th ? 'เดโม: จำลองการตรวจ ระบบจริงใช้พาร์ทเนอร์ตรวจตัวตน' : 'Demo: a simulated check — the real one runs with our ID partner.'}</p>
            </>
          ) : (
            <>
              <div className={`kx-sh-scan is-${idStep}`} aria-hidden="true">
                <span className="kx-sh-card" />
                <span className="kx-sh-face" />
                <span className="kx-sh-ok">✓</span>
              </div>
              <p className="kx-sh-status" role="status" aria-live="polite" data-testid="share-id-status">
                {idStep === 'scan'
                  ? th ? 'กำลังอ่านเอกสาร…' : 'Reading your document…'
                  : idStep === 'face'
                    ? th ? 'เทียบใบหน้ากับรูปในเอกสาร…' : 'Matching your face to the photo…'
                    : th ? 'ยืนยันตัวตนแล้ว ✓ · ตอนนี้คุณเป็นโลคอล' : 'You’re verified ✓ · the Local badge is on your profile'}
              </p>
            </>
          )}
        </div>
      )}

      {step === 'what' && (
        <div className="kx-sh-step" data-testid="share-step-what">
          {/* Kring v3.0: <10s 1-Tap High-Earning Templates */}
          <div className="mb-3 p-2.5 rounded-2xl c-surface-1 border c-line" data-testid="share-quick-templates">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-extrabold">{th ? '⚡ เทมเพลตยอดนิยม (<10 วินาที)' : '⚡ <10s Quick Templates (80%→85% to You)'}</span>
              <span className="text-xs font-bold text-emerald-500">{th ? '+฿500 การันตีทริปแรก' : '+฿500 1st-Trip Guarantee'}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: th ? '📸 คาเฟ่อารีย์ · ฿750' : '📸 Ari Café Walk · ฿750', fee: 750, titleEn: 'Ari Specialty Café & Camera Walk', titleTh: 'เดินเล่นคาเฟ่อารีย์ & ถ่ายรูป' },
                { label: th ? '🏮 เยาวราชกลางคืน · ฿1,200' : '🏮 Night Market · ฿1,200', fee: 1200, titleEn: 'Yaowarat Street Food & Night Walk', titleTh: 'สตรีทฟู้ดเยาวราชยามค่ำ' },
                { label: th ? '🌇 รูฟท็อปริมน้ำ · ฿1,600' : '🌇 Sunset Rooftop · ฿1,600', fee: 1600, titleEn: 'Chao Phraya Sunset Rooftop Dining', titleTh: 'ดินเนอร์รูฟท็อปชมพระอาทิตย์ตก' },
                { label: th ? '🏝️ ทริปเต็มวัน · ฿3,000' : '🏝️ Day Escape · ฿3,000', fee: 3000, titleEn: 'Full-Day Market & Island Escape', titleTh: 'ทริปตลาดและเกาะเต็มวัน' },
              ].map((tpl, idx) => (
                <button
                  key={idx}
                  type="button"
                  data-testid={`share-tpl-${idx}`}
                  onClick={() => {
                    triggerHaptic('select')
                    setName(th ? tpl.titleTh : tpl.titleEn)
                    setFee(tpl.fee)
                    if (!pickId && EXPERIENCES[0]) setPickId(EXPERIENCES[0].id)
                  }}
                  className="p-2 rounded-xl text-left text-xs font-bold c-surface-2 hover:bg-amber-400/20 border c-line transition"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>

          <label className="kx-slab" htmlFor="kx-sh-name">{th ? 'อยากแชร์อะไร?' : 'What do you want to share?'}</label>
          <input
            id="kx-sh-name"
            className="kx-sh-input"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder={th ? 'คาเฟ่ฮอปปิ้งอารีย์' : 'Café hop in Ari'}
            data-testid="share-name"
            autoComplete="off"
          />
          {!nameOk && (
            <p className="kx-fine is-warn" role="alert" data-testid="share-name-warn">
              {th ? 'ไม่อนุญาตให้โปรโมทเครื่องดื่มแอลกอฮอล์หรือบริการนำเที่ยวที่ไม่มีใบอนุญาต' : 'No alcohol promotions or unlicensed tour-guide claims allowed.'}
            </p>
          )}
          <p className="kx-slab">{th ? 'ประเภท' : 'Kind'}</p>
          <div className="kx-chips kx-sh-row" role="radiogroup" aria-label={th ? 'ประเภท' : 'Kind'}>
            {kinds.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={kind === k.id}
               
                className="kx-chip kf-press"
                data-testid={`share-kind-${k.id}`}
                onClick={() => { triggerHaptic('select'); setKind(kind === k.id ? null : k.id) }}
              >
                <span aria-hidden="true">{k.emoji}</span>
                {k.label}
              </button>
            ))}
          </div>
          <p className="kx-slab">{th ? 'ใกล้เคียงที่สุด' : 'Closest match'}</p>
          {matches.length === 0 ? (
            <p className="kx-fine">{th ? 'เลือกประเภทด้านบน แล้วเลือกทริปที่ใกล้ที่สุด' : 'Pick a kind above, then the experience closest to yours.'}</p>
          ) : (
            <ul className="kx-rows" role="radiogroup" aria-label={th ? 'ทริปที่ใกล้เคียง' : 'Closest experience'} data-testid="share-matches">
              {matches.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={pickId === e.id}
                    className={`kx-row m-press${pickId === e.id ? ' is-on' : ''}`}
                    data-testid={`share-pick-${e.id}`}
                    onClick={() => choose(e)}
                  >
                    <span className="kx-art kx-art-sm" data-group={e.group} aria-hidden="true">
                      <span className="kx-art-glyph">{e.emoji}</span>
                    </span>
                    <span className="kx-row-main">
                      <b>{th ? shortTitleTh(e) : shortTitle(e)}</b>
                      <small>{th ? venueIn(e, city).th : venueIn(e, city).en}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="kx-slab">{th ? 'รูป' : 'Photo'}</p>
          <div className="kx-sh-photo">
            <span className="kx-sh-thumb" aria-hidden="true">
              {pick || photo ? <img src={photo || (pick ? experiencePhoto(pick) : '')} alt="" /> : <span>📷</span>}
            </span>
            <button type="button" className="kx-quiet kf-press kx-sh-44" data-testid="share-photo-btn" onClick={() => fileRef.current?.click()}>
              {photo ? (th ? 'เปลี่ยนรูป' : 'Change photo') : th ? 'ใส่รูปของคุณ' : 'Add your photo'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              data-testid="share-photo-input"
              onChange={(ev) => {
                const f = ev.target.files?.[0]
                if (!f) return
                shrinkPhoto(f)
                  .then((d) => { setPhoto(d); setPhotoErr(false) })
                  .catch(() => setPhotoErr(true))
              }}
            />
          </div>
          {photoErr && <p className="kx-fine" role="alert">{th ? 'เปิดรูปนี้ไม่ได้ ลองรูปอื่น' : 'That photo didn’t open — try another.'}</p>}
          <p className="kx-slab">{th ? 'ฉันพูด' : 'I speak'}</p>
          <div className="kx-chips" role="group" aria-label={th ? 'ภาษา' : 'Languages'}>
            {LANGS.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={langs.includes(l.id)}
               
                className="kx-chip kf-press"
                onClick={() => setLangs((cur) => (cur.includes(l.id) ? (cur.length > 1 ? cur.filter((x) => x !== l.id) : cur) : [...cur, l.id]))}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'where' && pick && (
        <div className="kx-sh-step" data-testid="share-step-where">
          <label className="kx-slab" htmlFor="kx-sh-area">{th ? 'จุดนัดพบ' : 'Where you meet'}</label>
          <input
            id="kx-sh-area"
            className="kx-sh-input"
            value={area}
            maxLength={80}
            onChange={(e) => { setArea(e.target.value); setAreaTouched(true) }}
            placeholder={th ? 'BTS อารีย์ ทางออก 3' : 'Ari BTS · exit 3'}
            data-testid="share-area"
            aria-invalid={areaTouched && !areaOk}
            aria-describedby="kx-sh-area-note"
            autoComplete="off"
          />
          <div className="kx-chips-x" style={{ marginTop: 8 }}>
            {[venueIn(pick, city)].map((v) => (
              <button key={v.en} type="button" className="kx-mini m-press" onClick={() => { setArea(th ? v.th : v.en); setAreaTouched(true) }}>
                {th ? v.th : v.en}
              </button>
            ))}
          </div>
          <p id="kx-sh-area-note" className={`kx-explain${areaTouched && !areaOk ? ' is-warn' : ''}`} role={areaTouched && !areaOk ? 'alert' : undefined} data-testid="share-area-note">
            {areaTouched && !areaOk
              ? th ? 'นัดที่สาธารณะหรือธุรกิจที่มีใบอนุญาตเท่านั้น ไม่ใช่บ้าน คอนโด หรือห้องพัก' : 'Public places or licensed businesses only — never a home, condo or hotel room.'
              : th ? 'ที่สาธารณะเท่านั้น: คาเฟ่ ตลาด สวน สถานี หรือธุรกิจที่มีใบอนุญาต' : 'Public places only: a café, market, park, station or a licensed business.'}
          </p>
          <p className="kx-slab">{th ? 'เวลาที่สะดวก' : 'Usual times'}</p>
          <div className="kx-chips" role="group" aria-label={th ? 'เวลาที่สะดวก' : 'Usual times'}>
            {TIMES.map((tm) => (
              <button
                key={tm.id}
                type="button"
                aria-pressed={times.includes(tm.id)}
               
                className="kx-chip kf-press"
                onClick={() => setTimes((cur) => (cur.includes(tm.id) ? cur.filter((x) => x !== tm.id) : [...cur, tm.id]))}
              >
                {th ? tm.th : tm.en}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'fee' && pick && (
        <div className="kx-sh-step" data-testid="share-step-fee">
          <p className="kx-slab">{th ? 'ค่าทริป' : 'Trip fee'} · <span lang="th">ค่าทริป</span></p>
          <div className="kx-sh-fee" role="group" aria-label={th ? 'ค่าทริป' : 'Trip fee'}>
            <button type="button" className="m-press" aria-label={th ? 'ลดค่าทริป' : 'Lower trip fee'} data-testid="share-fee-minus" disabled={freeTwoWay || fee <= MIN_TRIP_FEE} onClick={() => setFee((f) => Math.max(MIN_TRIP_FEE, f - 50))}>−</button>
            <b data-testid="share-fee" aria-live="polite">{freeTwoWay ? (th ? '฿0 · แลกเปลี่ยนฟรี' : '฿0 · Free exchange') : baht(fee)}</b>
            <button type="button" className="m-press" aria-label={th ? 'เพิ่มค่าทริป' : 'Raise trip fee'} data-testid="share-fee-plus" disabled={freeTwoWay || fee >= 20000} onClick={() => setFee((f) => Math.min(20000, f + 50))}>+</button>
          </div>
          {pick.twoWay && (
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                role="switch"
                aria-checked={freeTwoWay}
                className="kx-chip kf-press"
                data-testid="share-free-twoway-toggle"
                onClick={() => { triggerHaptic('select'); setFreeTwoWay((v) => !v) }}
              >
                {th ? '⇄ แลกเปลี่ยนกันฟรี · ฿0 (ไม่ต้องมีใบอนุญาตทำงาน)' : '⇄ Free two-way exchange · ฿0 (no work permit needed)'}
              </button>
            </div>
          )}
          {range && !freeTwoWay && (
            <p className="kx-sh-kp" data-testid="share-kring-price">
              {th ? `ราคากริ๊งสำหรับ${shortTitleTh(pick)}: ` : `Kring Price for ${shortTitle(pick).toLowerCase()}: `}
              <b>{baht(range[0])}–{baht(range[1])}</b>
            </p>
          )}
          <p className="kx-fine">
            {freeTwoWay
              ? th ? 'แลกเปลี่ยนภาษาหรือทักษะกันที่ที่สาธารณะ ไม่มีค่าทริป' : 'Two-way skill or language exchange at a public place — no trip fee charged.'
              : th ? 'แขกจ่ายเท่านี้ เก็บไว้กับกริ๊งจนเจอกันแล้วกริ๊ง!' : 'This is what your guest pays. Kring holds it until you both go กริ๊ง! at the meeting point.'}
          </p>
          <input
            className="kx-sh-input"
            style={{ marginTop: 8 }}
            value={tatLicence}
            maxLength={32}
            onChange={(e) => setTatLicence(e.target.value)}
            placeholder={th ? 'เลขใบอนุญาตมัคคุเทศก์ ททท. (ถ้ามี · ไม่บังคับสำหรับเพื่อนร่วมกิจกรรม)' : 'Optional: TAT guide licence # (activity companions need none)'}
            data-testid="share-tat-licence"
            autoComplete="off"
          />
          <button
            type="button"
            role="switch"
            aria-checked={liveNow}
            className="kx-sh-live kf-press"
            data-testid="share-live"
            onClick={() => { triggerHaptic('select'); setLiveNow((v) => !v) }}
          >
            <span className="kx-sh-live-t">
              <b>{th ? 'ออนไลน์เลยไหม?' : 'Live now?'}</b>
              <small>{liveNow ? (th ? 'แขกในเมืองนี้เห็นและจองได้ทันที' : 'Guests in this city can find and book it now') : th ? 'บันทึกไว้ ซ่อนไว้ก่อน' : 'Saved and hidden until you go Live'}</small>
            </span>
            <span className="kx-sh-sw" aria-hidden="true"><i /></span>
          </button>
          {pick.twoWay ? (
            <p className="kx-fine" data-testid="share-twoway-note">
              {th
                ? 'ไม่ใช่คนไทย? ทริปที่เก็บเงินต้องมีสิทธิ์ทำงานที่ถูกต้อง หรือเปลี่ยนเป็นแลกเปลี่ยนกันแทน'
                : 'Not Thai? Paid listings need the right work permission — or keep it a two-way exchange.'}
            </p>
          ) : (
            <p className="kx-fine" data-testid="share-host-attestation">
              {th
                ? 'เฉพาะพลเมืองไทยสำหรับทริปมีค่าใช้จ่าย · กิจกรรมเป็นเพื่อนร่วมทริป ไม่ใช่บริการนำเที่ยวตามกฎหมาย'
                : 'Paid listings are for Thai nationals only · peer activity companion, not unlicensed tour guiding.'}
            </p>
          )}
        </div>
      )}

      {step === 'done' && published && pick && (
        <div className="kx-sh-step kx-sh-donebox" data-testid="share-step-done" role="status">
          <span className="kx-sh-check" aria-hidden="true">✓</span>
          <h3 className="kx-sh-h">{th ? `คุณกำลังแชร์ “${name.trim() || shortTitleTh(pick)}”` : `You’re sharing “${name.trim() || shortTitle(pick)}”`}</h3>
          <p className="kx-explain">
            {published.live
              ? th ? 'ออนไลน์แล้ว · แขกในเมืองนี้เห็นทริปของคุณ คำขอจะเข้ามาในแชท' : 'Live · guests in this city can see it. Requests arrive in Chats.'
              : th ? 'บันทึกแล้ว · พักไว้ เปิดออนไลน์ได้ที่ ฉัน › ทริปของคุณ' : 'Saved · Paused. Go Live any time from Me › Your experiences.'}
          </p>
        </div>
      )}
    </Sheet>
  )
}

/** The subtle glass entry at the top of Experiences (and in Me): "＋ Share something you love · Anyone can · 3 steps". */
export function ShareEntry({ language = 'en', onOpen, compact = false }: { language?: string; onOpen: () => void; compact?: boolean }) {
  const th = language === 'th'
  return (
    <button
      type="button"
      className={`kx-share kf-press${compact ? ' is-compact' : ''}`}
      data-testid="share-entry"
      onClick={() => { triggerHaptic('tap'); onOpen() }}
    >
      <span className="kx-share-plus" aria-hidden="true">＋</span>
      <span className="kx-share-t">
        <b>{th ? 'แชร์สิ่งที่คุณรัก' : 'Share something you love'}</b>
        {!compact && <small>{th ? 'ใครก็แชร์ได้ · 3 ขั้นตอน' : 'Anyone can · 3 steps'}</small>}
      </span>
      <svg className="kx-share-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
    </button>
  )
}
