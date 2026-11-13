import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ShareSheet from '../experiences/ShareSheet'
import { useAuth, useHosting } from '../../context/AuthContext'
import { markIdVerified, startLocalSetup, useIdVerified, usePresence, writePresence, type ListedExperience } from '../../context/presence'
import { CITIES, EXPERIENCES, toCity } from '../../lib/experiences'
import { useHomeCity } from '../../lib/homeCity'
import { EDIT_PROFILE_EVENT } from '../../lib/selfGuard'
import { formatBahtValue } from '../../lib/money'
import { realName } from '../vip/walletKit'
import { usePlanStore } from '../../lib/planStore'
import { guestMoneyRows, whenLabel } from '../wallet/bookingMoney'
import ShareChips from '../ui/ShareChips'
import { myShareLink } from '../../lib/identity'
import '../../styles/wallet.css'
import { useLanguage } from '../../i18n/LanguageContext'
import { LANGUAGE_OPTIONS } from '../../i18n/translations'
import { triggerHaptic } from '../../lib/haptics'
import { t } from '../../lib/lexicon'
import { MAX_PHOTOS, PHOTOS_EVENT, addPhoto, fileToPhotoSrc, makeMainPhoto, photoStyle, readPhotos, readProfile, removePhoto, setProfileGender, updatePhoto, type Gender, type ProfilePhoto } from '../../lib/profileStore'
import { playKringChime, setSfxEnabled, sfxEnabled } from '../../lib/sfx'
import { openGuide } from '../../lib/guideContent'
import { showIsland } from '../ui/TopIsland'
import '../../styles/shell.css'

/**
 * My profile (round-3 R2 + R4, round-2 A6).
 *
 *  • KRING T3 · one app: no role switch. Identity row with the ✓ Local badge once the ID check is done; Home city
 *    (lib/homeCity). Live / Paused is per listing and lives in Me › Your experiences (each with its own switch and the
 *    Liquid-light Go Live bump) — not here. Hosting = has listings (AuthContext.useHosting).
 *  • Hosting only: the venue setting "Guests may suggest another venue: Yes (default) / No", payouts, share your page.
 *  • Settings: This device (signed in since …, Stay signed in switch), notifications, language, sound, wallet PIN,
 *    help & safety, privacy, and "Log out of this device" (asks once: "Log out" / "Stay signed in").
 */
/** 'pause' and 'role' are kept in the type for old callers (App's `kring:open-roles`); both now open nothing. */
type SheetName = 'pause' | 'golive' | 'role' | 'logout' | 'privacy' | 'verify' | 'experience' | 'preview' | 'photo' | 'photoEdit' | null
export type MyProfileSheet = SheetName

/** T3 · open My profile on a given sheet (Me › Your experiences → 'verify' when a listing needs the ID check). */
let pendingSheet: SheetName = null
export const PROFILE_SHEET_EVENT = 'kring:profile-sheet'
export function openMyProfile(sheet: SheetName = null): void {
  if (typeof window === 'undefined') return
  pendingSheet = sheet
  window.dispatchEvent(new CustomEvent(EDIT_PROFILE_EVENT))
  // already open → switch sheet in place
  window.dispatchEvent(new CustomEvent(PROFILE_SHEET_EVENT, { detail: { sheet } }))
}
const usable = (s: SheetName): SheetName => (s === 'role' || s === 'pause' ? null : s)

function fmtDate(iso: string | undefined, lang: string): string {
  const d = iso ? new Date(iso) : new Date()
  if (Number.isNaN(d.getTime())) return ''
  try {
    return d.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short' })
  } catch {
    return d.toDateString()
  }
}

const Chev = () => (
  <svg className="kr-row-chev" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

export default function MyProfile({ onClose, initialSheet = null }: { onClose: () => void; initialSheet?: SheetName }) {
  const { session, logOutDevice, staySignedIn, setStaySignedIn } = useAuth()
  const hosting = useHosting()
  const [homeCity, setHomeCity] = useHomeCity()
  const { language, setLanguage } = useLanguage()
  const L = language === 'th' ? 'th' : 'en'
  const presence = usePresence()
  const plans = usePlanStore()
  const [sheet, setSheet] = useState<SheetName>(() => {
    const p = pendingSheet
    pendingSheet = null
    return usable(initialSheet) ?? usable(p)
  })
  useEffect(() => {
    const on = (e: Event) => {
      pendingSheet = null
      const s = usable((e as CustomEvent<{ sheet?: SheetName }>).detail?.sheet ?? null)
      if (s === 'verify') setIdStep(isIdVerifiedNow() ? 'done' : 'doc')
      setSheet(s)
    }
    window.addEventListener(PROFILE_SHEET_EVENT, on)
    return () => window.removeEventListener(PROFILE_SHEET_EVENT, on)
  }, [])
  const [venueDraft, setVenueDraft] = useState(presence.guestsMaySuggestVenue)
  const [sound, setSound] = useState(() => sfxEnabled())
  const verified = useIdVerified()
  const verifiedRef = useRef(verified)
  verifiedRef.current = verified
  const isIdVerifiedNow = () => verifiedRef.current
  // the ID check flow: pick a document → scan → face match → ✓ (demo / preview: simulated, the real one is the ID partner)
  const [idStep, setIdStep] = useState<'doc' | 'scan' | 'face' | 'done'>('doc')
  const [idDoc, setIdDoc] = useState<'thai-id' | 'passport'>('thai-id')
  const [expPick, setExpPick] = useState<Record<string, number>>({})
  // KRING VISUAL V2 · photos (≤ 6, persisted by profileStore)
  const [photos, setPhotos] = useState<ProfilePhoto[]>(() => (typeof window === 'undefined' ? [] : readPhotos()))
  const [photoId, setPhotoId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    const on = () => setPhotos(readPhotos())
    window.addEventListener(PHOTOS_EVENT, on)
    return () => window.removeEventListener(PHOTOS_EVENT, on)
  }, [])
  const [profile, setProfileState] = useState(() => {
    try {
      return readProfile()
    } catch {
      return null
    }
  })
  useEffect(() => {
    const on = () => setProfileState(readProfile())
    window.addEventListener('chon:profile-updated', on)
    return () => window.removeEventListener('chon:profile-updated', on)
  }, [])

  // Escape closes the top-most layer (sheet first, then the page)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (sheet) setSheet(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, onClose])

  // KRING FIX1 · Ploy 2: a Local account that never went through the checks is Paused until it has (no auto-Live)
  const role0 = session?.role
  useEffect(() => {
    if (role0 === 'host' && !presence.setup) startLocalSetup()
  }, [role0, presence.setup])

  // the scan → face → done steps run on their own (a real check would wait for the ID partner here)
  useEffect(() => {
    if (sheet !== 'verify' || idStep === 'doc' || idStep === 'done') return
    const t = window.setTimeout(() => {
      if (idStep === 'scan') setIdStep('face')
      else {
        markIdVerified()
        triggerHaptic('success')
        setIdStep('done')
      }
    }, idStep === 'scan' ? 1400 : 1200)
    return () => window.clearTimeout(t)
  }, [sheet, idStep])

  if (!session) return null
  const role = session.role
  const isLocal = hosting
  const live = presence.live
  const name = realName(profile?.name || session.displayName) || (L === 'th' ? 'คุณ' : 'You')
  const first = name.split(' ')[0]
  const homeId = homeCity ?? toCity(profile?.city)
  const city = homeId === 'pattaya' ? t('city.pattaya', L) : t('city.bangkok', L)
  // KRING FIX2 · Ploy: "speaks …" in the UI language (Thai mode is Thai), a Local always speaks Thai
  const langCodes = Array.from(new Set([...(role === 'host' || L === 'th' ? ['th'] : []), ...(profile?.langs?.length ? profile.langs : ['en'])]))
  const langs = `${L === 'th' ? 'พูดได้' : 'Speaks'} ${langCodes
    .map((c) => ({ en: 'English', th: L === 'th' ? 'ไทย' : 'Thai', zh: '中文', ru: 'Русский', hi: 'हिन्दी', ko: '한국어' } as Record<string, string>)[c] ?? c)
    .slice(0, 3)
    .join(' · ')}`
  const bookingRows = guestMoneyRows(plans).filter((r) => r.kind === 'booking')
  const myBookings = bookingRows.length

  const listed = presence.experiences ?? []
  const listedFirst = listed[0] ? EXPERIENCES.find((e) => e.id === listed[0].id) : undefined
  const openVerify = () => {
    triggerHaptic('select')
    setIdStep(verified ? 'done' : 'doc')
    setSheet('verify')
  }
  const [shareOpen, setShareOpen] = useState(false)
  const openExperience = () => {
    triggerHaptic('select')
    // T3 · the share flow (W2) takes it when it is mounted; the catalogue picker below is the fallback
    // T3 · the 3-step "Share something you love" sheet opens right here (Experiences may be hidden under My profile)
    setSheet(null)
    setShareOpen(true)
  }
  const saveExperiences = () => {
    // keep each listing's own fields (Live / Paused, photo, title) and every shared (non-catalogue) listing
    const catalogueIds = new Set(catalogue.map((e) => e.id))
    const keep = listed.filter((x) => !catalogueIds.has(x.id))
    const picked: ListedExperience[] = Object.entries(expPick).map(([id, priceThb]) => ({ ...(listed.find((x) => x.id === id) ?? {}), id, priceThb }))
    writePresence({ setup: true, experiences: [...keep, ...picked] })
    triggerHaptic('success')
    setSheet(null)
  }

  const city0 = homeId
  const catalogue = EXPERIENCES.filter((e) => e.city.includes(city0) && !e.online).sort((a, b) => Number(Boolean(b.onboardFirst)) - Number(Boolean(a.onboardFirst)))

  const mainPhoto = photos[0]
  const pickedPhoto = photos.find((p) => p.id === photoId) ?? null
  const previewCard = (
    <div className="kr-preview-wrap">
      <div className="kr-card kr-preview" data-testid="profile-preview">
        <span className="kr-preview-face" aria-hidden="true">{mainPhoto ? <img src={mainPhoto.src} alt="" style={photoStyle(mainPhoto)} /> : first.slice(0, 1).toUpperCase()}</span>
        <span className="kr-preview-body">
          <b>
            {first}
            {verified ? <span className="pf5-lb"> ✓ {L === 'th' ? 'โลคอล' : 'Local'}</span> : null}
          </b>
          <small>
            {isLocal
              ? listedFirst
                ? `${L === 'th' ? listedFirst.titleTh : listedFirst.title} · ${L === 'th' ? 'เริ่ม' : 'from'} ${formatBahtValue(listed[0].priceThb)}`
                : L === 'th' ? 'ยังไม่มีทริป' : 'No experience listed yet'
              : L === 'th' ? 'ยังไม่ได้แชร์ประสบการณ์' : 'Nothing shared yet'}
          </small>
          <small>{city}</small>
        </span>
        {isLocal ? (
          <span className={`kr-chip${live ? '' : ' is-off'}`} data-testid="profile-preview-state">
            <i aria-hidden="true" />
            {live ? (L === 'th' ? 'รับคำขอจองได้' : 'Taking requests') : L === 'th' ? 'ซ่อนอยู่' : 'Hidden'}
          </span>
        ) : null}
      </div>
    </div>
  )

  const sheetNode = sheet && (
    <div className="sh-scrim" onClick={() => setSheet(null)} data-scrollable-overlay="true">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kr-sheet-title"
        className="sh-sheet kr-sheet"
        onClick={(e) => e.stopPropagation()}
        data-testid={`profile-sheet-${sheet}`}
      >
        <span className="sh-grab" aria-hidden="true" />
        {sheet === 'golive' && (
          <>
            <h3 id="kr-sheet-title" className="sh-sheet-title">{t('venue.suggest', L)}</h3>
            <p className="sh-sheet-line">{t('golive.q', L)}</p>
            <div className="kr-choice" role="group" aria-label={t('venue.suggest', 'en')}>
              <button type="button" aria-pressed={venueDraft} data-testid="golive-venue-yes" onClick={() => { triggerHaptic('select'); setVenueDraft(true) }}>{t('golive.yes', L)}</button>
              <button type="button" aria-pressed={!venueDraft} data-testid="golive-venue-no" onClick={() => { triggerHaptic('select'); setVenueDraft(false) }}>
                {/* Ploy: she never set "a venue" — the fixed place is her experience's own meeting point */}
                {L === 'th' ? 'ไม่ได้ · ใช้จุดนัดในทริปของฉัน' : 'No · keep my meeting point'}
              </button>
            </div>
            <p className="kr-note">{t('golive.note', L)}</p>
            <button type="button" className="sh-btn sh-btn-gold sh-btn-block" style={{ marginTop: 16 }} data-testid="golive-save" onClick={() => { writePresence({ guestsMaySuggestVenue: venueDraft }); setSheet(null) }}>
              {t('cta.done', L)}
            </button>
          </>
        )}
        {sheet === 'verify' && (
          <div className="kr-id-check" data-testid="id-check" data-step={idStep}>
            <h3 id="kr-sheet-title" className="sh-sheet-title">{L === 'th' ? 'ยืนยันตัวตน' : 'Verify your ID'}</h3>
            {idStep === 'doc' ? (
              <>
                <p className="sh-sheet-line">
                  {L === 'th' ? 'ครั้งเดียว แล้วมีป้าย ✓ โลคอล บนโปรไฟล์ แขกไม่เห็นเลขบัตร' : 'Once. Then the ✓ Local badge sits on your profile — guests never see your ID number.'}
                </p>
                <div className="kr-choice" role="group" aria-label={L === 'th' ? 'เอกสาร' : 'Document'}>
                  <button type="button" aria-pressed={idDoc === 'thai-id'} onClick={() => setIdDoc('thai-id')}>{L === 'th' ? 'บัตรประชาชน' : 'Thai ID card'}</button>
                  <button type="button" aria-pressed={idDoc === 'passport'} onClick={() => setIdDoc('passport')}>{L === 'th' ? 'พาสปอร์ต' : 'Passport'}</button>
                </div>
                <button type="button" className="sh-btn sh-btn-gold sh-btn-block" style={{ marginTop: 16 }} data-testid="id-check-start" onClick={() => { triggerHaptic('select'); setIdStep('scan') }}>
                  {L === 'th' ? 'สแกนเอกสาร' : 'Scan my document'}
                </button>
                <p className="kr-note">{session.isDemoMode ? (L === 'th' ? 'เดโม: จำลองการตรวจ ระบบจริงใช้พาร์ทเนอร์ตรวจตัวตน' : 'Demo: a simulated check — the real one runs with our ID partner.') : L === 'th' ? 'ข้อมูลถูกเข้ารหัสและลบรูปดิบหลังตรวจเสร็จ' : 'Encrypted; the raw photos are deleted after the check.'}</p>
              </>
            ) : (
              <>
                <div className={`kr-scan is-${idStep}`} aria-hidden="true">
                  <span className="kr-scan-card" />
                  <span className="kr-scan-face" />
                  <span className="kr-scan-line" />
                  <span className="kr-scan-ok">✓</span>
                </div>
                <p className="sh-sheet-line" role="status" aria-live="polite" data-testid="id-check-status">
                  {idStep === 'scan'
                    ? L === 'th' ? 'กำลังอ่านเอกสาร…' : 'Reading your document…'
                    : idStep === 'face'
                      ? L === 'th' ? 'เทียบใบหน้ากับรูปในเอกสาร…' : 'Matching your face to the photo…'
                      : L === 'th' ? 'ยืนยันตัวตนแล้ว ✓' : 'You’re verified ✓'}
                </p>
                {idStep === 'done' ? (
                  <button
                    type="button"
                    className="sh-btn sh-btn-gold sh-btn-block"
                    style={{ marginTop: 12 }}
                    data-testid="id-check-done"
                    onClick={() => setSheet(null)}
                  >
                    {t('cta.done', L)}
                  </button>
                ) : null}
              </>
            )}
          </div>
        )}
        {sheet === 'experience' && (
          <>
            <h3 id="kr-sheet-title" className="sh-sheet-title">{L === 'th' ? 'ทริปที่คุณพาเที่ยว' : 'Experiences you host'}</h3>
            <p className="sh-sheet-line">{L === 'th' ? 'เลือกอย่างน้อย 1 ทริป ตั้งราคาเริ่มต้นของคุณเองได้' : 'Pick at least one and set your own “from” price. Public places and licensed venues only.'}</p>
            <ul className="kr-exp-list" data-testid="experience-picker">
              {catalogue.map((e) => {
                const on = e.id in expPick
                const price = expPick[e.id] ?? e.fromThb
                return (
                  <li key={e.id} className={on ? 'is-on' : ''}>
                    <button
                      type="button"
                      className="kr-exp-pick"
                      aria-pressed={on}
                      data-testid={`experience-pick-${e.id}`}
                      onClick={() => {
                        triggerHaptic('select')
                        setExpPick((cur) => {
                          const next = { ...cur }
                          if (on) delete next[e.id]
                          else next[e.id] = e.fromThb
                          return next
                        })
                      }}
                    >
                      <span aria-hidden="true">{e.emoji}</span>
                      <span>
                        <b>{L === 'th' ? e.titleTh : e.title}</b>
                        <small>{L === 'th' ? e.venueTh : e.venueEn}</small>
                      </span>
                    </button>
                    {on ? (
                      <span className="kr-exp-price" role="group" aria-label={L === 'th' ? 'ราคาเริ่มต้น' : 'From price'}>
                        <button type="button" aria-label="−฿100" onClick={() => setExpPick((c) => ({ ...c, [e.id]: Math.max(300, price - 100) }))}>−</button>
                        <b>{formatBahtValue(price)}</b>
                        <button type="button" aria-label="+฿100" onClick={() => setExpPick((c) => ({ ...c, [e.id]: price + 100 }))}>+</button>
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
            <button type="button" className="sh-btn sh-btn-gold sh-btn-block kr-exp-save" data-testid="experience-save" disabled={!Object.keys(expPick).length} onClick={saveExperiences}>
              {Object.keys(expPick).length
                ? L === 'th' ? `บันทึก ${Object.keys(expPick).length} ทริป` : `Save ${Object.keys(expPick).length} ${Object.keys(expPick).length === 1 ? 'experience' : 'experiences'}`
                : L === 'th' ? 'เลือกอย่างน้อย 1 ทริป' : 'Pick at least one'}
            </button>
          </>
        )}
        {sheet === 'logout' && (
          <>
            <h3 id="kr-sheet-title" className="sh-sheet-title">{t('logout.title', L)}</h3>
            <p className="sh-sheet-line">{t('logout.body', L)}</p>
            <div className="kr-pair">
              <button
                type="button"
                className="sh-btn sh-btn-ghost"
                data-testid="profile-logout-confirm"
                onClick={() => {
                  setSheet(null)
                  onClose()
                  logOutDevice()
                  showIsland({ text: t('mc.loggedOut', L), tone: 'neutral', ms: 2600 })
                }}
              >
                {t('logout.cta', L)}
              </button>
              <button type="button" className="sh-btn sh-btn-gold" onClick={() => setSheet(null)}>{t('stay.signedin', L)}</button>
            </div>
          </>
        )}
        {sheet === 'preview' && (
          <>
            <h3 id="kr-sheet-title" className="sh-sheet-title">{t('profile.see', L)}</h3>
            {previewCard}
            <button type="button" className="sh-btn sh-btn-gold sh-btn-block" style={{ marginTop: 16 }} onClick={() => setSheet(null)}>{t('cta.done', L)}</button>
          </>
        )}
        {sheet === 'photo' && pickedPhoto && (
          <>
            <h3 id="kr-sheet-title" className="sh-sheet-title">{L === 'th' ? 'แก้ไขรูป' : 'Edit photo'}</h3>
            <ul className="pf5-menu">
              <li>
                <button type="button" data-testid="profile-photo-edit" onClick={() => setSheet('photoEdit')}>
                  <span aria-hidden="true">✎</span>
                  {L === 'th' ? 'แก้ไข · ครอปและแสง' : 'Edit · crop & light'}
                </button>
              </li>
              {photos[0]?.id !== pickedPhoto.id ? (
                <li>
                  <button
                    type="button"
                    data-testid="profile-photo-main"
                    onClick={() => {
                      setPhotos(makeMainPhoto(pickedPhoto.id))
                      triggerHaptic('success')
                      setSheet(null)
                      showIsland({ text: L === 'th' ? 'ตั้งเป็นรูปหลักแล้ว' : 'Main photo set', tone: 'green', icon: '✓', ms: 2000 })
                    }}
                  >
                    <span aria-hidden="true">★</span>
                    {L === 'th' ? 'ตั้งเป็นรูปหลัก' : 'Make main photo'}
                  </button>
                </li>
              ) : null}
              <li>
                <button
                  type="button"
                  className="is-danger"
                  data-testid="profile-photo-remove"
                  onClick={() => {
                    setPhotos(removePhoto(pickedPhoto.id))
                    triggerHaptic('heavy', { sound: false })
                    setSheet(null)
                    showIsland({ text: L === 'th' ? 'ลบรูปแล้ว' : 'Photo removed', tone: 'neutral', ms: 2000 })
                  }}
                >
                  <span aria-hidden="true">🗑</span>
                  {L === 'th' ? 'ลบ' : 'Remove'}
                </button>
              </li>
            </ul>
          </>
        )}
        {sheet === 'photoEdit' && pickedPhoto && (
          <>
            <h3 id="kr-sheet-title" className="sh-sheet-title">{L === 'th' ? 'ครอปและแสง' : 'Crop & light'}</h3>
            <div className="pf5-edit" aria-hidden="true">
              <img src={pickedPhoto.src} alt="" style={photoStyle(pickedPhoto)} />
            </div>
            {(
              [
                ['light', L === 'th' ? 'แสง' : 'Light', 0.7, 1.4, 0.05],
                ['zoom', L === 'th' ? 'ซูม' : 'Zoom', 1, 2, 0.05],
                ['x', L === 'th' ? 'ซ้าย–ขวา' : 'Left–right', 0, 100, 1],
                ['y', L === 'th' ? 'บน–ล่าง' : 'Up–down', 0, 100, 1],
              ] as const
            ).map(([k, label, min, max, step]) => (
              <label key={k} className="pf5-slider">
                <span>{label}</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={pickedPhoto[k]}
                  data-testid={`profile-photo-${k}`}
                  onChange={(e) => setPhotos(updatePhoto(pickedPhoto.id, { [k]: Number(e.currentTarget.value) }))}
                />
              </label>
            ))}
            <div className="kr-pair">
              <button type="button" className="sh-btn sh-btn-ghost" onClick={() => setPhotos(updatePhoto(pickedPhoto.id, { light: 1, zoom: 1, x: 50, y: 50 }))}>
                {L === 'th' ? 'รีเซ็ต' : 'Reset'}
              </button>
              <button type="button" className="sh-btn sh-btn-gold" data-testid="profile-photo-save" onClick={() => setSheet(null)}>{t('cta.done', L)}</button>
            </div>
          </>
        )}
        {sheet === 'privacy' && (
          <>
            <h3 id="kr-sheet-title" className="sh-sheet-title">🔒 {t('privacy', L)}</h3>
            <ul className="kr-bul kr-read-th" lang={L}>
              <li><span aria-hidden="true">👥</span><span>{L === 'th' ? 'การจองเห็นได้แค่แขกกับโลคอลเท่านั้น' : 'A booking is visible only to the guest and the local.'}</span></li>
              <li><span aria-hidden="true">🏢</span><span>{L === 'th' ? 'เอเจนซีเห็นแค่ยอดรวม ไม่เห็นว่าใคร ที่ไหน เมื่อไหร่ ราคา หรือแชท' : 'Agencies see totals only — never who, where, when, the price or the chat.'}</span></li>
              <li><span aria-hidden="true">🛟</span><span>{L === 'th' ? 'ทีมความปลอดภัยกริ๊งเปิดดูการจองได้เฉพาะเมื่อมีการกด SOS หรือรายงานเท่านั้น' : 'Kring’s safety team opens a booking only after an SOS or a report.'}</span></li>
              <li><span aria-hidden="true">🙈</span><span>{L === 'th' ? 'เบอร์โทรและช่องทางติดต่อถูกซ่อนในแชท' : 'Phone numbers and contact handles stay masked in chat.'}</span></li>
            </ul>
            <button type="button" className="sh-btn sh-btn-gold sh-btn-block" style={{ marginTop: 16 }} onClick={() => setSheet(null)}>{t('cta.done', L)}</button>
          </>
        )}
      </div>
    </div>
  )

  const page = (
    <div
      className="kr-pf pf5"
      role="dialog"
      aria-modal="true"
      aria-label={t('profile.title', 'en')}
      data-testid="my-profile"
      data-scrollable-overlay="true"
    >
      <div className="kr-pf-top">
        <button type="button" className="kr-back" aria-label="Close my profile" data-testid="my-profile-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h2>{t('profile.title', L)}</h2>
        <button
          type="button"
          className="pf5-eye kf-press"
          data-testid="profile-preview-open"
          aria-label={L === 'th' ? 'ดูแบบที่แขกเห็น' : 'Preview: how guests see you'}
          onClick={() => {
            triggerHaptic('select')
            setSheet('preview')
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
        </button>
      </div>

      <div className="kr-pf-scroll">
        {/* identity: photo · name · ✓ after the ID check */}
        <div className="kr-id pf5-id">
          <span className="kr-id-face" aria-hidden="true">{mainPhoto ? <img src={mainPhoto.src} alt="" style={photoStyle(mainPhoto)} /> : first.slice(0, 1).toUpperCase()}</span>
          <div className="kr-id-body">
            <div className="kr-id-name">
              <span>{first}</span>
              {verified ? (
                <span className="pf5-badge is-ok is-local" data-testid="profile-verified-badge">✓ {L === 'th' ? 'โลคอล' : 'Local'}</span>
              ) : (
                <span className="pf5-badge" data-testid="profile-unverified-badge">{L === 'th' ? 'ยังไม่ยืนยันตัวตน' : 'ID not checked'}</span>
              )}
            </div>
            <p className="kr-id-sub">
              {city} · {langs}
            </p>
          </div>
        </div>

        {/* photos: ≤ 6, a + tile, tap → Edit · Make main · Remove */}
        <div className="pf5-phhd">
          <b>{L === 'th' ? 'รูปภาพ' : 'Photos'}</b>
          <span data-testid="profile-photo-count">
            {photos.length} / {MAX_PHOTOS}
            {photos.length ? (L === 'th' ? ' · แตะเพื่อแก้ไข' : ' · tap to edit') : ''}
          </span>
        </div>
        <div className="pf5-grid kf-stagger" data-testid="profile-photos">
          {photos.map((ph, i) => (
            <button
              key={ph.id}
              type="button"
              className="pf5-ph kf-press"
              data-testid={`profile-photo-${i}`}
              aria-label={`${L === 'th' ? 'รูปที่' : 'Photo'} ${i + 1}${i === 0 ? (L === 'th' ? ' · รูปหลัก' : ' · main') : ''} — ${L === 'th' ? 'แก้ไข' : 'edit'}`}
              onClick={() => {
                triggerHaptic('select')
                setPhotoId(ph.id)
                setSheet('photo')
              }}
            >
              <img src={ph.src} alt="" style={photoStyle(ph)} draggable={false} />
              {i === 0 ? <span className="pf5-main">{L === 'th' ? 'หลัก' : 'Main'}</span> : null}
            </button>
          ))}
          {photos.length < MAX_PHOTOS ? (
            <button type="button" className="pf5-add kf-press" data-testid="profile-photo-add" onClick={() => fileRef.current?.click()}>
              <span aria-hidden="true">＋</span>
              {L === 'th' ? 'เพิ่ม' : 'Add'}
            </button>
          ) : null}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          data-testid="profile-photo-input"
          onChange={async (e) => {
            const f = e.currentTarget.files?.[0]
            e.currentTarget.value = ''
            if (!f) return
            try {
              const src = await fileToPhotoSrc(f)
              const next = addPhoto(src)
              if (next) {
                setPhotos(next)
                triggerHaptic('success')
                showIsland({ text: next.length === 1 ? (L === 'th' ? 'เพิ่มรูปหลักแล้ว' : 'Main photo added') : L === 'th' ? 'เพิ่มรูปแล้ว' : 'Photo added', tone: 'green', icon: '✓', ms: 2200 })
              } else showIsland({ text: L === 'th' ? 'เพิ่มไม่ได้ · เต็ม 6 รูปหรือพื้นที่เต็ม' : 'Couldn’t add · 6 photos max or storage full', tone: 'neutral', ms: 2600 })
            } catch {
              showIsland({ text: L === 'th' ? 'เปิดรูปนี้ไม่ได้' : 'Couldn’t open that photo', tone: 'neutral', ms: 2400 })
            }
          }}
        />

        {/* the steps that matter, as rows */}
        <ul className="kr-rows pf5-rows">
          {!verified ? (
            <li>
              <button type="button" className="kr-row pf5-prow" data-testid="profile-verify-id" onClick={openVerify}>
                <span className="kr-row-ico" aria-hidden="true">🪪</span>
                <span className="kr-row-body">
                  <b>{L === 'th' ? 'ยืนยันตัวตน' : 'Verify your ID'}</b>
                  <small>{L === 'th' ? 'บัตรประชาชนหรือพาสปอร์ต + เซลฟี่ · ~1 นาที' : 'Thai ID or passport + a selfie · ~1 min'}</small>
                </span>
                <span className="pf5-go">{L === 'th' ? 'ยืนยัน' : 'Verify'}</span>
              </button>
            </li>
          ) : null}
          {isLocal ? (
            <>
              <li>
                <button type="button" className="kr-row pf5-prow" data-testid="profile-list-experience" onClick={openExperience}>
                  <span className="kr-row-ico" aria-hidden="true">🗂️</span>
                  <span className="kr-row-body">
                    <b>{L === 'th' ? 'ประสบการณ์ของคุณ' : 'Your experiences'}</b>
                    <small>
                      {listed.length
                        ? L === 'th' ? `ลงไว้ ${listed.length} ทริป · เปิด/พักแต่ละทริปได้ในหน้าฉัน` : `${listed.length} listed · Live / Paused for each in Me`
                        : L === 'th' ? 'อย่างน้อย 1 ทริป เช่น เดินกินเยาวราช' : 'At least one, e.g. a Yaowarat street-food walk'}
                    </small>
                  </span>
                  {listed.length ? <Chev /> : <span className="pf5-go">{L === 'th' ? 'เพิ่ม' : 'Add'}</span>}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="kr-row pf5-prow"
                  data-testid="profile-payouts"
                  onClick={() => {
                    onClose()
                    window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'vip' } }))
                  }}
                >
                  <span className="kr-row-ico" aria-hidden="true">🏦</span>
                  <span className="kr-row-body">
                    <b>{L === 'th' ? 'การรับเงิน' : 'Payouts'}</b>
                    <small>{L === 'th' ? 'หลังกริ๊ง!ทุกครั้ง · พร้อมเพย์' : 'After each Kring! · PromptPay'}</small>
                  </span>
                  <Chev />
                </button>
              </li>
            </>
          ) : null}
        </ul>

        {isLocal && live ? (
          // KRING FIX3 · founder: share your page — LINE · WeChat · 小红书 (F4's helper; native share first when present)
          <div className="kr-share-mine" data-testid="profile-share">
            <p className="sh-mono kr-sec" style={{ margin: '12px 0 6px' }}>{L === 'th' ? 'แชร์หน้าของคุณ' : 'Share your page'}</p>
            <ShareChips
              text={L === 'th' ? `เที่ยวกับ ${first} บนกริ๊ง · โลคอลตัวจริง ราคาแฟร์` : `Explore Bangkok with ${first} on Kring · a real local, fair prices`}
              url={myShareLink()}
              lang={language}
              testIdPrefix="profile-share"
            />
          </div>
        ) : null}

        {isLocal ? (
          <ul className="kr-rows" style={{ marginTop: 10 }}>
            <li>
              <button
                type="button"
                className="kr-row"
                data-testid="profile-venue-setting"
                onClick={() => {
                  setVenueDraft(presence.guestsMaySuggestVenue)
                  setSheet('golive')
                }}
              >
                <span className="kr-row-body">
                  <b>{t('venue.suggest', L)}</b>
                  <small>{t('venue.setting.sub', L)}</small>
                </span>
                <span className="kr-row-val is-gold">{presence.guestsMaySuggestVenue ? t('yes', L) : t('no', L)}</span>
                <Chev />
              </button>
            </li>
          </ul>
        ) : (
          <section className="pf5-quiet" data-testid="profile-hero-quiet">
            <p className="kr-hero-line">
              {// Wei 66: say what is true — no "your bookings live here" over an empty ring
                  myBookings > 0
                  ? L === 'th'
                    ? `การจอง ${myBookings} รายการ · ตั๋วอยู่ในแชท`
                    : `${myBookings} ${myBookings === 1 ? 'booking' : 'bookings'} · tickets live in Chats`
                  : L === 'th'
                    ? 'ยังไม่มีการจอง · เริ่มจากหน้าประสบการณ์'
                    : 'No bookings yet · start from Experiences'}
            </p>
            {bookingRows.length > 0 ? (
              // Wei r3: the count comes with the list — each row opens Chats, where the ticket lives
              <ul className="kr-rows kr-my-bookings" data-testid="profile-bookings" style={{ marginTop: 10, width: '100%' }}>
                {bookingRows.slice(0, 3).map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="kr-row"
                      onClick={() => {
                        onClose()
                        window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'chats' } }))
                      }}
                    >
                      <span className="kr-row-body">
                        <b>{[r.title, r.who].filter(Boolean).join(' · ')}</b>
                        <small>
                          {[
                            whenLabel(r.date, r.start, L === 'th'),
                            r.state === 'held'
                              ? L === 'th' ? 'พักเงินไว้จนเจอกัน' : 'held until you meet'
                              : r.state === 'released'
                                ? L === 'th' ? 'กริ๊ง! แล้ว' : 'met · Kring!'
                                : L === 'th' ? 'คืนเงินแล้ว' : 'refunded',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                      </span>
                      <Chev />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        )}

        {/* T3 · home city: the shell says "You're in Pattaya · locals here" when you browse another city */}
        <p className="sh-mono kr-sec">{L === 'th' ? 'ข้อมูลของคุณ' : 'About you'}</p>
        <ul className="kr-rows">
          <li>
            <div className="kr-row" style={{ cursor: 'default' }} data-testid="profile-home-city">
              <span className="kr-row-ico" aria-hidden="true">🏠</span>
              <span className="kr-row-body">
                <b>{L === 'th' ? 'เมืองที่อยู่' : 'Home city'}</b>
                <small>{L === 'th' ? 'ไปเมืองอื่นเมื่อไหร่ แอปจะโชว์โลคอลที่นั่น' : 'Away from it, Kring shows you the locals there'}</small>
              </span>
              <span className="kr-choice kr-city" role="group" aria-label={L === 'th' ? 'เมืองที่อยู่' : 'Home city'}>
                {CITIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={homeId === c.id}
                    data-testid={`profile-home-city-${c.id}`}
                    onClick={() => {
                      triggerHaptic('select')
                      setHomeCity(c.id)
                    }}
                  >
                    {L === 'th' ? c.th : c.en}
                  </button>
                ))}
              </span>
            </div>
          </li>
          <li>
            <button type="button" className="kr-row" onClick={() => window.dispatchEvent(new CustomEvent('chon:open-onboarding'))}>
              <span className="kr-row-ico" aria-hidden="true">✎</span>
              <span className="kr-row-body">
                <b>{L === 'th' ? 'แก้ไขข้อมูล' : 'Edit details'}</b>
                <small>{L === 'th' ? 'ชื่อ เมือง ภาษา' : 'Name, city, languages'}</small>
              </span>
              <Chev />
            </button>
          </li>
        </ul>

        {/* settings */}
        <p className="sh-mono kr-sec">{t('device.this', L)}</p>
        <ul className="kr-rows">
          <li>
            <div className="kr-row" style={{ cursor: 'default' }} data-testid="profile-device-row">
              <span className="kr-row-ico" aria-hidden="true">📱</span>
              <span className="kr-row-body">
                <b>{t('device.signedin', L, { date: fmtDate(session.signedInAt ?? session.ageConfirmedAt ?? undefined, L) })}</b>
                <small>{t('device.signedin.sub', L)}</small>
              </span>
              <span className="kr-dev-dot" aria-hidden="true" />
            </div>
          </li>
          <li>
            <div className="kr-row" style={{ cursor: 'default' }}>
              <span className="kr-row-ico" aria-hidden="true">🔐</span>
              <span className="kr-row-body">
                <b>{t('stay.signedin', L)}</b>
                <small>{staySignedIn ? t('session.rule', L) : t('stay.signedin.sub', L)}</small>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={staySignedIn}
                aria-label={t('stay.signedin', 'en')}
                data-testid="profile-stay-signed-in"
                className="kr-switch"
                onClick={() => {
                  triggerHaptic('select')
                  setStaySignedIn(!staySignedIn)
                }}
              />
            </div>
          </li>
        </ul>

        <p className="sh-mono kr-sec">{t('profile.settings', L)}</p>
        <ul className="kr-rows">
          <li>
            {/* All 7 supported languages in LANGUAGE_OPTIONS — one tap per language */}
            <div className="kr-row is-lang-row" style={{ cursor: 'default' }} data-testid="profile-language-row">
              <span className="kr-row-ico" aria-hidden="true">🌐</span>
              <span className="kr-row-body"><b>{t('language', L)}</b></span>
              <span className="kr-choice kr-lang" role="group" aria-label="Language">
                {LANGUAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.code}
                    type="button"
                    lang={opt.htmlLang}
                    aria-pressed={language === opt.code}
                    data-testid={`profile-language-${opt.code}`}
                    onClick={() => {
                      triggerHaptic('select')
                      setLanguage(opt.code)
                    }}
                  >
                    {opt.nativeName ?? opt.label}
                  </button>
                ))}
              </span>
            </div>
          </li>
          <li>
            <div className="kr-row" style={{ cursor: 'default' }}>
              <span className="kr-row-ico" aria-hidden="true">🔔</span>
              <span className="kr-row-body"><b>{t('sound.on', L)}</b><small>{L === 'th' ? 'กริ๊ง! · E6 → B6' : 'Kring! · E6 → B6'}</small></span>
              <button
                type="button"
                role="switch"
                aria-checked={sound}
                aria-label={t('sound.on', 'en')}
                className="kr-switch"
                onClick={() => {
                  const next = !sound
                  setSound(next)
                  setSfxEnabled(next)
                  if (next) playKringChime({ soft: true })
                }}
              />
            </div>
          </li>
          <li>
            <div className="kr-row is-lang-row" style={{ cursor: 'default' }} data-testid="profile-gender-row">
              <span className="kr-row-ico" aria-hidden="true">👤</span>
              <span className="kr-row-body">
                <b>{L === 'th' ? 'ข้อมูลโปรไฟล์ของคุณ' : 'Your profile identity'}</b>
              </span>
              <span className="kr-choice kr-lang" role="group" aria-label={L === 'th' ? 'เพศ' : 'Gender'}>
                {([
                  { id: 'woman', th: 'ผู้หญิง', en: 'Woman' },
                  { id: 'man', th: 'ผู้ชาย', en: 'Man' },
                  { id: 'nonbinary', th: 'นอนไบนารี', en: 'Non-binary' },
                  { id: 'na', th: 'ไม่ระบุ', en: 'Prefer not to say' },
                ] as { id: Gender; th: string; en: string }[]).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={profile?.gender === g.id}
                    data-testid={`profile-gender-${g.id}`}
                    onClick={() => {
                      triggerHaptic('select')
                      setProfileState(setProfileGender(g.id))
                    }}
                  >
                    {L === 'th' ? g.th : g.en}
                  </button>
                ))}
              </span>
            </div>
          </li>
          <li>
            <button type="button" className="kr-row" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'vip' } })) }}>
              <span className="kr-row-ico" aria-hidden="true">🔢</span>
              <span className="kr-row-body"><b>{t('wallet.pin', L)}</b><small>{t('wallet.pin.sub', L)}</small></span>
              <Chev />
            </button>
          </li>
        </ul>

        <p className="sh-mono kr-sec">{t('profile.account', L)}</p>
        <ul className="kr-rows">
          <li>
            <button type="button" className="kr-row" onClick={() => openGuide('safety')}>
              <span className="kr-row-ico" aria-hidden="true">🛟</span>
              <span className="kr-row-body"><b>{t('help.safety', L)}</b></span>
              <Chev />
            </button>
          </li>
          <li>
            <button type="button" className="kr-row" data-testid="profile-id-row" onClick={openVerify}>
              <span className="kr-row-ico" aria-hidden="true">🪪</span>
              <span className="kr-row-body">
                <b>{L === 'th' ? 'ยืนยันตัวตน' : 'ID check'}</b>
                <small>{verified ? (L === 'th' ? 'ยืนยันแล้ว ✓' : 'Verified ✓') : L === 'th' ? 'ยังไม่ได้ยืนยัน · ~1 นาที' : 'Not done yet · ~1 min'}</small>
              </span>
              <Chev />
            </button>
          </li>
          <li>
            <button type="button" className="kr-row" onClick={() => setSheet('privacy')}>
              <span className="kr-row-ico" aria-hidden="true">🔒</span>
              <span className="kr-row-body"><b>{t('privacy', L)}</b></span>
              <Chev />
            </button>
          </li>
          <li>
            <button type="button" className="kr-row is-danger" data-testid="profile-logout" onClick={() => setSheet('logout')}>
              <span className="kr-row-ico" aria-hidden="true">⎋</span>
              <span className="kr-row-body"><b>{t('logout', L)}</b></span>
              <Chev />
            </button>
          </li>
        </ul>
        <p className="sh-fine" style={{ marginTop: 18 }}>{t('brand.tagline', L)}</p>
      </div>
      {sheetNode}
    </div>
  )

  if (typeof document === 'undefined') return page
  return createPortal(
    <>
      {page}
      {shareOpen && <ShareSheet open language={L} onClose={() => setShareOpen(false)} />}
    </>,
    document.body,
  )
}
