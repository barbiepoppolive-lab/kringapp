/* Partner café table bill (/#venue-bill?v=<meeting_place_id>&b=<booking ref or id>). No app, POS or tablet needed.
   Follows the app language (t('vb_*')).
   1. The café picks itself (or scans its counter QR). A café that just signed up shows as "Pending approval":
      no discount until Kring switches it on.
   2. The cashier checks the guest's Kring booking code (KR-123456, typed or scanned) against a Kring booking for
      today. The discount applies only to a checked booking.
   3. The cashier types the table total; the screen shows what to collect at the café's own till.
   Kring never takes the money. Kring's commission is never shown here. Band 1 cafés pay Kring nothing, so they
   see no statement line. The server is the authority (it recomputes discount and fee on insert).
   Two till rules (this phone enforces them; the server must enforce them too, see NOTES_D):
   - a café is unlocked with its own 6-digit staff PIN (set at sign-up) before any bill is recorded for it;
   - a Kring booking code gives one table bill, once: after "Confirm table bill" the code is marked used and a
     second use anywhere is refused ("already used at {venue}, {time}"). */
import { useEffect, useRef, useState } from 'react'
import { S, update, useS, type Booking } from '../core/store'
import { t, ACTS, aTitle, baht, caseNo, dayFmt } from '../core/data'
import { register, go, toast } from '../core/router'
import { api } from '../core/api'
import { getUserId } from '../core/account'
import { configured } from '../core/auth'
import { bookingRef } from '../core/dayof'
import { bell, buzz, tick } from '../core/sound'
import { I, Ic } from '../ui/kit'
import { computeTableBill, isBand1Tier, type VenueTerms } from '../core/venueBands'
import { MEETING_PLACE_PRESETS, type MeetingPlacePreset } from '../core/hostPlaces'

export { MEETING_PLACE_PRESETS, type MeetingPlacePreset }
export type TableBillEntryMode = 'venue_qr' | 'host_counter_confirm'

export interface RecordedTableBill {
  id: string
  meetingPlaceId: string
  bookingId: string | null
  hostId: string | null
  guestId: string | null
  meetingPlaceNameEn: string
  meetingPlaceNameTh: string
  activityTitle: string
  hostName: string
  guestName: string
  billAmountThb: number
  guestDiscountThb: number
  chargeThb: number
  enteredBy: TableBillEntryMode
  recordedAtIso: string
  statementPeriod: string
}

/** The venue sign-up sent from this phone (screens/venueOnboard.tsx writes it). */
export interface MyVenue {
  id: string
  name: string
  category: string
  band: 1 | 2 | 3
  discountThb?: number | null
  minBillThb?: number | null
  sentAt: string
  status: 'pending' | 'active'
  /** hash of the café's 6-digit staff PIN (never the PIN itself) */
  pinHash?: string
}

/** Hash of a café's staff PIN, salted with the café id (this phone keeps only the hash). */
export const hashPin = (venueId: string, pin: string): string => {
  let x = 2166136261
  const v = venueId + '|' + pin
  for (let i = 0; i < v.length; i++) { x ^= v.charCodeAt(i); x = Math.imul(x, 16777619) }
  return (x >>> 0).toString(36)
}
/** Preview only: each demo partner café has a fixed demo PIN (shown on screen, never in a live build). */
export const demoPin = (venueId: string): string => {
  let x = 7
  for (let i = 0; i < venueId.length; i++) x = (x * 31 + venueId.charCodeAt(i)) % 1000000
  return String(x).padStart(6, '0').replace(/^0/, '4')
}
/** A booking code already used for a table bill on this phone. */
interface CodeUse { venueId: string; venueTh: string; venueEn: string; at: string; billId: string }
const codeUses = (): Record<string, CodeUse> => (S.venueUses || {}) as Record<string, CodeUse>
const UNLOCK_KEY = 'kring-vb-unlocked'
const readUnlocked = (): string[] => { try { const v = JSON.parse(sessionStorage.getItem(UNLOCK_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [] } catch { return [] } }
const writeUnlocked = (ids: string[]): void => { try { sessionStorage.setItem(UNLOCK_KEY, JSON.stringify(ids)) } catch { /* ignore */ } }
export const myVenue = (): MyVenue | null => {
  const v = S.myVenue as MyVenue | null | undefined
  return v && typeof v === 'object' && typeof v.name === 'string' ? v : null
}

/** Parse ?v=<meeting_place_id>&b=<booking> from a QR payload, URL, hash, or search string. */
export function parseVenueBillParams(rawInput?: string): {
  meetingPlaceId: string | null
  bookingId: string | null
} {
  const sources: string[] = []
  if (rawInput && rawInput.trim()) {
    sources.push(rawInput.trim())
  } else if (typeof window !== 'undefined') {
    if (window.location.hash) sources.push(window.location.hash)
    if (window.location.search) sources.push(window.location.search)
  }

  let meetingPlaceId: string | null = null
  let bookingId: string | null = null

  for (const src of sources) {
    const qIdx = src.indexOf('?')
    const queryPart = qIdx >= 0 ? src.slice(qIdx + 1) : src.replace(/^#?venue-?bill\/?/i, '')
    const params = new URLSearchParams(queryPart)
    const v = params.get('v') || params.get('meeting_place_id') || params.get('mp')
    const b = params.get('b') || params.get('booking_id') || params.get('booking')
    if (v && !meetingPlaceId) meetingPlaceId = v.trim()
    if (b && !bookingId) bookingId = b.trim()
  }

  // Also support scanning a bare UUID or slug directly
  if (!meetingPlaceId && rawInput) {
    const clean = rawInput.trim()
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
      meetingPlaceId = clean
    } else {
      const matched = MEETING_PLACE_PRESETS.find((p) => p.slug === clean)
      if (matched) meetingPlaceId = matched.id
    }
  }

  return { meetingPlaceId, bookingId }
}

/** A Kring booking code inside typed text or a scanned QR: KR-123456 (any dash, any case). */
export function parseBookingCode(raw: string): string | null {
  const m = (raw || '').toUpperCase().match(/KR\s*-*\s*(\d{6})/)
  return m ? 'KR-' + m[1] : null
}

/** Only a listed partner café (or this phone's own pending sign-up) can record a bill. */
function resolvePlaceFromIdOrSlug(idOrSlug: string | null): MeetingPlacePreset | null {
  if (!idOrSlug) return null
  const clean = idOrSlug.trim().toLowerCase()
  return MEETING_PLACE_PRESETS.find((p) => p.id.toLowerCase() === clean || p.slug.toLowerCase() === clean) || null
}

/** Venue band terms from the public view (0016 exposes band + guest-facing discount only, never commission). */
function liveTermsFromRow(
  row: { band?: number | null; band1_discount_thb?: number | null; band1_min_bill_thb?: number | null; guest_discount_rate?: number | null },
  fallback: VenueTerms,
): VenueTerms {
  if (row.band === 1) {
    const tier = { discountThb: row.band1_discount_thb, minBillThb: row.band1_min_bill_thb }
    return { band: 1, band1: isBand1Tier(tier) ? tier : fallback.band1 ?? null }
  }
  if (row.band === 2 || row.band === 3) return { band: row.band, guestDiscountRate: row.guest_discount_rate ?? undefined }
  return fallback
}

interface BarcodeDetectorLike {
  detect(video: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>
}

const sameDay = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** Result of checking a guest's booking code. */
type BkCheck =
  | { st: 'ok'; ref: string; b: Booking | null; act: string; time: string }
  | { st: 'server'; ref: string }
  | { st: 'none' | 'cancelled' | 'place' | 'pending'; ref: string }
  | { st: 'day'; ref: string; d: string }
  | { st: 'used'; ref: string; venue: string; when: string }

/** Match the code to a Kring booking for this café and today (preview: the bookings on this phone;
    live: the server checks the code when the bill is recorded and refuses a wrong one). */
function checkBooking(ref: string, place: MeetingPlacePreset): BkCheck {
  const use = codeUses()[ref]
  if (use) {
    return { st: 'used', ref, venue: S.lang === 'th' ? use.venueTh : use.venueEn, when: dayFmt(new Date(use.at), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
  }
  if (configured()) return { st: 'server', ref }
  const today = new Date()
  const all = S.bookings.filter((b) => b.kind === 'act')
  const hit = all.find((b) => {
    const a = ACTS.find((x) => x.id === b.act) || ACTS[0]
    return (b.ref || '').toUpperCase() === ref || bookingRef(b, a) === ref
  })
  if (!hit) return { st: 'none', ref }
  if (hit.status === 'cancelled') return { st: 'cancelled', ref }
  if (hit.status === 'pending') return { st: 'pending', ref } // the host hasn't accepted it yet
  if (hit.meeting_place_id && hit.meeting_place_id !== place.id && hit.meeting_place_id !== place.slug) return { st: 'place', ref }
  const d = new Date(hit.date)
  if (!sameDay(d, today)) return { st: 'day', ref, d: dayFmt(d, { weekday: 'short', day: 'numeric', month: 'short' }) }
  const a = ACTS.find((x) => x.id === hit.act) || ACTS[0]
  return { st: 'ok', ref, b: hit, act: aTitle(a), time: hit.time }
}

function VenueBillScreen() {
  const s = useS()
  const th = s.lang === 'th'
  const mine = myVenue()
  const initialParams = parseVenueBillParams()
  // No default venue: the counter must scan its own QR (or pick its own name) so a busy cashier never keeps another café.
  const [selectedPlace, setSelectedPlace] = useState<MeetingPlacePreset | null>(() => resolvePlaceFromIdOrSlug(initialParams.meetingPlaceId))
  const [pendingSel, setPendingSel] = useState(false)
  const [codeIn, setCodeIn] = useState(() => parseBookingCode(initialParams.bookingId || '') || '')
  const [bk, setBk] = useState<BkCheck | null>(null)
  /** cafés unlocked with their staff PIN in this browser session */
  const [unlocked, setUnlocked] = useState<string[]>(readUnlocked)
  const [pinIn, setPinIn] = useState('')
  const [pinBad, setPinBad] = useState(false)

  const [billInput, setBillInput] = useState<string>('')
  /** bills recorded from this phone (kept across reloads) */
  const [billLog, setBillLog] = useState<RecordedTableBill[]>(() => (S.tableBills as RecordedTableBill[] | undefined) || [])
  const [enteredBy, setEnteredBy] = useState<TableBillEntryMode>('venue_qr')
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [recorded, setRecorded] = useState<RecordedTableBill | null>(null)

  // Camera QR scanner (café counter QR or the guest's booking QR)
  const [scannerOpen, setScannerOpen] = useState<boolean>(false)
  const [cameraStatus, setCameraStatus] = useState<string>('')
  const [qrInputFallback, setQrInputFallback] = useState<string>('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopCamera = () => {
    if (scanTimerRef.current) { clearInterval(scanTimerRef.current); scanTimerRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach((x) => x.stop()); streamRef.current = null }
  }

  const choosePlace = (p: MeetingPlacePreset | null) => {
    setSelectedPlace(p); setPendingSel(false); setBk(null); setErrorMsg(null); setPinIn(''); setPinBad(false)
  }
  const isUnlocked = !!selectedPlace && unlocked.includes(selectedPlace.id)
  /** The café's own staff PIN: this phone's own café (hash saved at sign-up) or, in the preview, a demo café's PIN.
      A live build has no other way to unlock a café on this phone (the server must check the PIN). */
  const pinOk = (p: MeetingPlacePreset, pin: string): boolean => {
    if (mine && mine.id === p.id && mine.pinHash) return hashPin(mine.id, pin) === mine.pinHash
    return !configured() && pin === demoPin(p.id)
  }
  const unlock = () => {
    if (!selectedPlace) return
    if (!pinOk(selectedPlace, pinIn)) { setPinBad(true); setPinIn(''); buzz([40, 40, 40]); return }
    const next = [...new Set([...unlocked, selectedPlace.id])]
    setUnlocked(next); writeUnlocked(next); setPinIn(''); setPinBad(false); bell(0.4, 1680)
  }
  const lock = () => { const next = unlocked.filter((x) => x !== selectedPlace?.id); setUnlocked(next); writeUnlocked(next); setBk(null) }

  const loadMeetingPlaceById = async (idOrSlug: string) => {
    const preset = resolvePlaceFromIdOrSlug(idOrSlug)
    const liveRow = await api.fetchMeetingPlace(idOrSlug)
    if (liveRow) {
      choosePlace({
        id: liveRow.id,
        slug: liveRow.slug,
        nameEn: liveRow.name_en,
        nameTh: liveRow.name_th || liveRow.name_en,
        districtEn: `${liveRow.district || liveRow.city} · ${liveRow.city}`,
        districtTh: `${liveRow.district || liveRow.city}`,
        avgTicketThb: liveRow.avg_item_price_thb || preset?.avgTicketThb || 300,
        terms: liveTermsFromRow(liveRow, preset?.terms || { band: 1, band1: { discountThb: 200, minBillThb: 600 } }),
      })
      return true
    }
    if (preset) { choosePlace(preset); return true }
    return false
  }

  useEffect(() => {
    const syncFromLocation = () => {
      const { meetingPlaceId, bookingId } = parseVenueBillParams()
      if (meetingPlaceId) void loadMeetingPlaceById(meetingPlaceId)
      const code = parseBookingCode(bookingId || '')
      if (code) setCodeIn(code)
    }
    syncFromLocation()
    window.addEventListener('hashchange', syncFromLocation)
    window.addEventListener('popstate', syncFromLocation)
    return () => {
      window.removeEventListener('hashchange', syncFromLocation)
      window.removeEventListener('popstate', syncFromLocation)
      stopCamera()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const runCheck = (raw: string, place = selectedPlace) => {
    const ref = parseBookingCode(raw)
    if (!place || !unlocked.includes(place.id)) return
    if (!ref) { setBk({ st: 'none', ref: raw.trim().toUpperCase() }); buzz([30, 30, 30]); return }
    setCodeIn(ref)
    const r = checkBooking(ref, place)
    setBk(r)
    if (r.st === 'ok' || r.st === 'server') { bell(0.4, 1680); tick(0.8, 0.06) } else buzz([30, 30, 30])
  }

  const applyScannedQrPayload = async (rawPayload: string) => {
    const code = parseBookingCode(rawPayload)
    const { meetingPlaceId } = parseVenueBillParams(rawPayload)
    if (!code && !meetingPlaceId) { setCameraStatus(t('vb_qr_bad')); return }
    stopCamera()
    setScannerOpen(false)
    setEnteredBy('venue_qr')
    setErrorMsg(null)
    if (meetingPlaceId) {
      const ok = await loadMeetingPlaceById(meetingPlaceId)
      if (!ok) { setCameraStatus(t('vb_qr_bad')); return }
      try { history.replaceState(null, '', `#venue-bill?v=${encodeURIComponent(meetingPlaceId)}`) } catch { /* ignore */ }
    }
    if (code) { setCodeIn(code); if (selectedPlace) runCheck(code) }
    bell(0.45, 1680)
    toast(t('vb_qr_ok'))
  }

  const startCameraScanner = async () => {
    setScannerOpen(true)
    setCameraStatus(t('vb_cam_asking'))
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) { setCameraStatus(t('vb_cam_none')); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}) }
      setCameraStatus(t('vb_cam_point'))
      const w = window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike }
      if (w.BarcodeDetector) {
        const detector = new w.BarcodeDetector({ formats: ['qr_code'] })
        scanTimerRef.current = setInterval(() => {
          if (!videoRef.current) return
          detector.detect(videoRef.current).then((codes) => {
            const hit = codes.find((c) => c.rawValue && c.rawValue.trim())
            if (hit?.rawValue) void applyScannedQrPayload(hit.rawValue)
          }).catch(() => {})
        }, 350)
      }
    } catch {
      setCameraStatus(t('vb_cam_blocked'))
    }
  }

  const rawBillThb = Math.round(Number(billInput.replace(/[^0-9]/g, '')) || 0)
  const tooBig = rawBillThb > 50000
  const parsedBillThb = Math.max(0, Math.min(50000, rawBillThb))
  const bkOk = !!bk && (bk.st === 'ok' || bk.st === 'server')
  const isValidBill = parsedBillThb > 0 && !tooBig && !!selectedPlace && isUnlocked && bkOk
  const terms = selectedPlace?.terms ?? { band: 1, band1: { discountThb: 200, minBillThb: 600 } }
  const breakdown = computeTableBill(terms, parsedBillThb)
  const band1 = terms.band === 1
  const dealLine = (tm: VenueTerms) => {
    if (tm.band === 1) {
      const tier = isBand1Tier(tm.band1) ? tm.band1 : { discountThb: 200, minBillThb: 600 }
      return t('vb_deal_b1', { d: baht(tier.discountThb), min: baht(tier.minBillThb) })
    }
    return t('vb_deal_pct', { pct: Math.round((tm.guestDiscountRate ?? 0.15) * 100) })
  }
  /** what still blocks Confirm, shown above the button */
  const why = !selectedPlace ? (pendingSel ? '' : t('vb_pick_place'))
    : !isUnlocked ? t('vb_need_pin')
      : !bkOk ? t('vb_need_code')
        : !parsedBillThb ? t('vb_need_amount') : '' // over ฿50,000 is already said under the amount

  const handleConfirmTableBill = async () => {
    if (!isValidBill || submitting || !selectedPlace || !bk) return
    // one table bill per Kring booking code: check again right before recording
    const used = checkBooking(bk.ref, selectedPlace)
    if (used.st === 'used') { setBk(used); buzz([40, 40, 40]); return }
    setSubmitting(true)
    setErrorMsg(null)
    tick(0.85, 0.07)

    const now = new Date()
    const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const fallbackBillId = 'TB-' + caseNo().replace(/[^A-Z0-9]/gi, '').slice(-6)
    const uid = getUserId()
    const isHost = Boolean(S.prof?.isHost || S.host)
    const hostId = isHost ? uid : null
    const guestId = !isHost ? uid : null

    try {
      const r = await api.recordTableBill({
        meeting_place_id: selectedPlace.id,
        booking_id: bk.ref,
        host_id: hostId,
        guest_id: guestId,
        bill_amount_thb: parsedBillThb,
        entered_by: enteredBy,
      })
      if (!r.ok) { setSubmitting(false); setErrorMsg(r.error || t('vb_err_sub')); return }
      const returnedId = r.row && typeof r.row.id === 'string' && r.row.id.trim() ? r.row.id : fallbackBillId
      const rec: RecordedTableBill = {
        id: returnedId,
        meetingPlaceId: selectedPlace.id,
        bookingId: bk.ref,
        hostId,
        guestId,
        meetingPlaceNameEn: selectedPlace.nameEn,
        meetingPlaceNameTh: selectedPlace.nameTh,
        activityTitle: bk.st === 'ok' ? bk.act : '',
        hostName: '',
        guestName: '',
        billAmountThb: parsedBillThb,
        guestDiscountThb: typeof r.row?.guest_discount_thb === 'number' ? (r.row.guest_discount_thb as number) : breakdown.guestDiscountThb,
        chargeThb: typeof r.row?.charged_thb === 'number' ? (r.row.charged_thb as number) : breakdown.chargeThb,
        enteredBy,
        recordedAtIso: now.toISOString(),
        statementPeriod: periodMonth,
      }
      const nextHistory = [rec, ...billLog].slice(0, 50)
      const use: CodeUse = { venueId: selectedPlace.id, venueTh: selectedPlace.nameTh, venueEn: selectedPlace.nameEn, at: now.toISOString(), billId: returnedId }
      update((st) => { (st as unknown as Record<string, unknown>).lastTableBill = rec; st.tableBills = nextHistory; st.venueUses = { ...(st.venueUses || {}), [bk.ref]: use } })
      setBillLog(nextHistory)
      setSubmitting(false)
      setRecorded(rec)
      bell(0.55, 1760)
      buzz([25, 35, 70])
      toast(t('vb_saved'))
    } catch (err) {
      setSubmitting(false)
      setErrorMsg(err instanceof Error ? err.message : String(err))
    }
  }

  const newBill = () => { setRecorded(null); setBillInput(''); setBk(null); setCodeIn('') }
  const placeName = (p: MeetingPlacePreset) => (th ? p.nameTh : p.nameEn)
  const recBand1 = recorded ? (MEETING_PLACE_PRESETS.find((p) => p.id === recorded.meetingPlaceId)?.terms.band ?? terms.band) === 1 : band1

  return (
    <>
      <div className="topb">
        <button className="ib" id="vb-back-btn" onClick={() => go(S.from['venue-bill'] || 'venue-home', 'l')} aria-label={t('backW')}><Ic p={I.back} /></button>
        <div className="col grow" style={{ gap: 1 }}>
          <b style={{ fontSize: 15 }}>{t('vb_title')}</b>
          <span className="small">{t('vb_sub')}</span>
        </div>
      </div>

      <div className="scroll pad col" style={{ gap: 14, paddingBottom: 110 }}>
        <div className="col" style={{ gap: 4 }}>
          <h1 className="h1" id="vb-heading" style={{ fontSize: 24 }}>{t('vb_h')}</h1>
          <p className="lead" style={{ fontSize: 13.5, marginTop: 2 }}>{t('vb_intro')}</p>
        </div>

        {/* 1. Your café */}
        <div className="glass card col" id="vb-entities-card" style={{ gap: 10, padding: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <span className="eyebrow" style={{ color: 'var(--gold2)' }}>1 · {t('vb_your_cafe')}</span>
            <button type="button" id="vb-open-qr-scanner-btn" className="chip on" style={{ height: 30, fontSize: 12 }}
              onClick={() => { if (scannerOpen) { stopCamera(); setScannerOpen(false) } else void startCameraScanner() }}>
              <Ic p={I.camera} s={14} />{scannerOpen ? t('vb_scan_close') : t('vb_scan')}
            </button>
          </div>

          {scannerOpen && (
            <div className="card col" id="vb-qr-scanner-box" style={{ gap: 8, padding: 12, background: 'rgba(5, 6, 13, 0.92)', border: '1px solid rgba(255, 178, 30, 0.45)' }}>
              <div className="small" id="vb-camera-jit-notice" style={{ color: 'var(--gold2)' }}>{t('vb_cam_note')}</div>
              <video ref={videoRef} id="vb-qr-video" playsInline muted style={{ width: '100%', maxHeight: 160, borderRadius: 10, background: '#05060D', objectFit: 'cover' }} />
              {cameraStatus && <span className="small" id="vb-camera-status">{cameraStatus}</span>}
              <div className="row" style={{ gap: 6 }}>
                <input id="vb-qr-url-input" className="tin" type="text" value={qrInputFallback} onChange={(e) => setQrInputFallback(e.target.value)}
                  placeholder={t('vb_qr_paste')} style={{ flex: 1, height: 40, fontSize: 13 }} />
                <button type="button" id="vb-qr-apply-btn" className="chip on" style={{ height: 40, fontSize: 12 }} disabled={!qrInputFallback.trim()} onClick={() => void applyScannedQrPayload(qrInputFallback)}>{t('vb_qr_use')}</button>
              </div>
            </div>
          )}

          <div className="chips" id="vb-meeting-place-chips">
            {MEETING_PLACE_PRESETS.map((mp) => (
              <button key={mp.id} type="button" data-mp-slug={mp.slug} data-mp-id={mp.id}
                className={`chip ${selectedPlace?.id === mp.id ? 'on' : ''}`} style={{ height: 'auto', minHeight: 32, fontSize: 12.5, whiteSpace: 'normal' }}
                onClick={() => {
                  choosePlace(mp)
                  try { history.replaceState(null, '', `#venue-bill?v=${mp.id}`) } catch { /* ignore */ }
                  tick(0.5, 0.05)
                }}>
                {placeName(mp)}
              </button>
            ))}
            {mine && (
              <button type="button" id="vb-my-venue" className={`chip ${pendingSel ? 'on' : ''}`} style={{ height: 'auto', minHeight: 32, fontSize: 12.5, whiteSpace: 'normal' }}
                onClick={() => { setSelectedPlace(null); setPendingSel(true); setBk(null); tick(0.5, 0.05) }}>
                {mine.name} · {t('vb_pending')}
              </button>
            )}
          </div>
          {pendingSel && mine && <div className="guard" role="status" id="vb-pending-note">{t('vb_pending_note', { name: mine.name })}</div>}
          {!mine && !selectedPlace && <span className="small" id="vb-not-listed">{t('vb_not_listed')} <button type="button" className="lnk" id="vb-signup-link" data-go="venue-onboard" style={{ color: 'var(--anchan2)', textDecoration: 'underline', background: 'none', border: 0, padding: 0, font: 'inherit' }}>{t('vb_signup')}</button></span>}
          {selectedPlace && (
            <div className="col" style={{ gap: 2 }}>
              <b id="vb-place-name" style={{ fontSize: 14 }}>{placeName(selectedPlace)}</b>
              <span className="small" id="vb-guest-deal">{t('vb_deal')}: <b>{dealLine(selectedPlace.terms)}</b></span>
            </div>
          )}
        </div>

        {/* staff PIN: only the café's own staff can record its bills */}
        {selectedPlace && !recorded && !isUnlocked && (
          <div className="glass card col" id="vb-pin-card" style={{ gap: 10, padding: 14 }}>
            <span className="eyebrow" style={{ color: 'var(--gold2)' }}>{t('vb_pin_t')}</span>
            <span className="small">{t('vb_pin_sub', { name: placeName(selectedPlace) })}</span>
            <div className="row" style={{ gap: 8 }}>
              <input id="vb-pin" className="tin num" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pinIn} aria-label={t('vb_pin_t')}
                onChange={(e) => { setPinIn(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinBad(false) }} onKeyDown={(e) => { if (e.key === 'Enter' && pinIn.length === 6) unlock() }}
                style={{ flex: 1, letterSpacing: 6 }} />
              <button type="button" className="btn gold" id="vb-pin-ok" style={{ flex: 'none', width: 104 }} disabled={pinIn.length !== 6} onClick={unlock}>{t('vb_pin_ok')}</button>
            </div>
            {pinBad && <div className="guard" role="alert" id="vb-pin-bad">{t('vb_pin_bad')}</div>}
            {!configured() && !(mine && mine.id === selectedPlace.id) && <span className="small" id="vb-pin-demo" style={{ color: 'var(--anchan2)' }}>{t('vb_pin_demo', { pin: demoPin(selectedPlace.id) })}</span>}
          </div>
        )}
        {selectedPlace && !recorded && isUnlocked && (
          <div className="row small" id="vb-pin-unlocked" style={{ gap: 8, alignItems: 'center', color: '#4CD39A' }}>
            <Ic p={I.check} s={14} sw={3} /><span className="grow">{t('vb_pin_on', { name: placeName(selectedPlace) })}</span>
            <button type="button" className="chip" id="vb-pin-lock" style={{ height: 30, fontSize: 12 }} onClick={lock}>{t('vb_pin_lock')}</button>
          </div>
        )}

        {/* 2. The guest's Kring booking */}
        {selectedPlace && isUnlocked && !recorded && (
          <div className="glass card col" id="vb-booking-card" style={{ gap: 10, padding: 14 }}>
            <span className="eyebrow" style={{ color: 'var(--gold2)' }}>2 · {t('vb_guest_code')}</span>
            <span className="small">{t('vb_guest_code_sub')}</span>
            <div className="row" style={{ gap: 8 }}>
              <input id="vb-booking-code" className="tin num" value={codeIn} maxLength={12} placeholder="KR-123456" autoCapitalize="characters" autoComplete="off"
                onChange={(e) => { setCodeIn(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '')); setBk(null) }} style={{ flex: 1, letterSpacing: 2 }} />
              <button type="button" className="btn gold" id="vb-check-code" style={{ flex: 'none', width: 104 }} disabled={codeIn.replace(/\D/g, '').length < 6} onClick={() => runCheck(codeIn)}>{t('vb_check')}</button>
            </div>
            {bk && bk.st === 'ok' && <div className="row small" id="vb-bk-ok" style={{ gap: 8, color: '#4CD39A' }}><span className="ok" style={{ width: 24, height: 24 }}><Ic p={I.check} s={14} sw={3} /></span><span>{t('vb_bk_ok', { ref: bk.ref, act: bk.act, time: bk.time })}</span></div>}
            {bk && bk.st === 'server' && <div className="small" id="vb-bk-server" style={{ color: 'var(--gold2)' }}>{t('vb_bk_server', { ref: bk.ref })}</div>}
            {bk && bk.st === 'none' && <div className="guard" role="alert" id="vb-bk-none">{t('vb_bk_none')}</div>}
            {bk && bk.st === 'cancelled' && <div className="guard" role="alert" id="vb-bk-cancel">{t('vb_bk_cancel')}</div>}
            {bk && bk.st === 'place' && <div className="guard" role="alert" id="vb-bk-place">{t('vb_bk_place')}</div>}
            {bk && bk.st === 'day' && <div className="guard" role="alert" id="vb-bk-day">{t('vb_bk_day', { d: bk.d })}</div>}
            {bk && bk.st === 'pending' && <div className="guard" role="alert" id="vb-bk-pending">{t('vb_bk_pending')}</div>}
            {bk && bk.st === 'used' && <div className="guard" role="alert" id="vb-bk-used">{t('vb_bk_used', { venue: bk.venue, time: bk.when })}</div>}
          </div>
        )}

        {errorMsg && (
          <div className="card col" id="vb-error-banner" role="alert" style={{ gap: 4, padding: 12, border: '1px solid rgba(255, 92, 92, 0.65)', background: 'rgba(60, 14, 20, 0.92)', color: '#FFD2D2' }}>
            <b style={{ fontSize: 13.5, color: '#FF7A7A' }}>{t('vb_err')}</b>
            <span className="small">{t('vb_err_sub')}</span>
          </div>
        )}

        {/* 3. Table total */}
        {selectedPlace && isUnlocked && !recorded && (
          <div className="card col" id="vb-form-card" style={{ gap: 12, padding: 16 }}>
            <div className="col" style={{ gap: 6 }}>
              <label htmlFor="vb-amount-input" style={{ fontWeight: 700, fontSize: 15 }}>3 · {t('vb_amount')}</label>
              <div className="row" style={{ background: '#141828', border: '1px solid rgba(255, 208, 103, 0.45)', borderRadius: 14, padding: '10px 14px', alignItems: 'center', gap: 8 }}>
                <span className="num" style={{ fontSize: 24, fontWeight: 800, color: 'var(--gold2)' }}>฿</span>
                <input id="vb-amount-input" type="text" inputMode="numeric" pattern="[0-9]*" value={billInput}
                  onChange={(e) => { setBillInput(e.target.value.replace(/\D/g, '').slice(0, 6)); setErrorMsg(null) }}
                  placeholder="0" style={{ background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 24, fontWeight: 800, width: '100%' }} />
              </div>
              <div className="chips" id="vb-amount-presets">
                {[270, 400, 800, 1200, 1800].map((amt) => (
                  <button key={amt} type="button" data-preset-thb={amt} className={`chip num ${parsedBillThb === amt ? 'on' : ''}`} style={{ height: 30, fontSize: 12.5 }}
                    onClick={() => { setBillInput(String(amt)); setErrorMsg(null); tick(0.6, 0.05) }}>{baht(amt)}</button>
                ))}
              </div>
            </div>

            {tooBig && <span className="small" id="vb-too-big" style={{ color: '#ff7a7a' }}>{t('vb_too_big')}</span>}
            {parsedBillThb > 0 && !tooBig && (
              <div className="card col" id="vb-charge-box" style={{ gap: 4, padding: 12, border: '1px solid rgba(255,178,30,0.45)' }}>
                {!bkOk ? (
                  <span className="small" id="vb-disc-wait">{t('vb_disc_wait')}</span>
                ) : breakdown.guestDiscountThb > 0 ? (
                  <span className="small num" id="vb-discount-line">{t('vb_disc', { amt: baht(breakdown.guestDiscountThb) })}</span>
                ) : (
                  !breakdown.qualifies && <span className="small num" id="vb-shortfall-line">{t('vb_short', { amt: baht(breakdown.shortfallThb) })}</span>
                )}
                <b className="num" id="vb-charge-amount" style={{ fontSize: 22, color: 'var(--gold2)' }}>{t('vb_collect', { amt: baht(bkOk ? breakdown.chargeThb : parsedBillThb) })}</b>
                <span className="small">{t('vb_till')}</span>
              </div>
            )}

          </div>
        )}

        {!recorded && (
          <div className="col" style={{ gap: 8 }}>
            {why && <div className="small" id="vb-why" role="status" style={{ color: 'var(--gold2)' }}>{why}</div>}
            <button type="button" className="btn gold" id="vb-confirm-btn" disabled={!isValidBill || submitting} onClick={() => void handleConfirmTableBill()}>
              {submitting ? t('vb_recording') : isValidBill ? t('vb_confirm_full', { bill: baht(parsedBillThb), pay: baht(breakdown.chargeThb) }) : t('vb_confirm')}
            </button>
          </div>
        )}

        {recorded && (
          <div className="card col" id="vb-confirmed-card" style={{ gap: 12, padding: 18, border: '1px solid rgba(76, 211, 154, 0.5)', background: 'rgba(20, 28, 38, 0.92)' }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <span className="pill gold" id="vb-recorded-badge" style={{ background: 'rgba(76, 211, 154, 0.18)', color: '#4CD39A', borderColor: 'rgba(76,211,154,0.4)' }}>✓ {t('vb_done_badge')}</span>
              <span className="small num" id="vb-record-id">{t('vb_ref', { id: recorded.id })}</span>
            </div>
            <div className="col" style={{ gap: 2 }}>
              <b style={{ fontSize: 22 }} id="vb-confirmed-amount">{t('vb_done_amt', { amt: baht(recorded.billAmountThb) })}</b>
              <span className="small num" id="vb-confirmed-charge">{recorded.guestDiscountThb > 0 ? t('vb_done_paid_disc', { pay: baht(recorded.chargeThb), d: baht(recorded.guestDiscountThb) }) : t('vb_done_paid', { pay: baht(recorded.chargeThb) })}</span>
            </div>
            <div className="glass card col" style={{ gap: 6, padding: 12, fontSize: 13 }}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}><span className="small">{t('vb_r_place')}</span><b style={{ textAlign: 'right' }}>{th ? recorded.meetingPlaceNameTh : recorded.meetingPlaceNameEn}</b></div>
              {recorded.bookingId && <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}><span className="small">{t('vb_r_booking')}</span><b className="num">{recorded.bookingId}</b></div>}
              {recorded.activityTitle && <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}><span className="small">{t('vb_r_act')}</span><b style={{ textAlign: 'right' }}>{recorded.activityTitle}</b></div>}
              {recBand1
                ? <span className="small" id="vb-b1-nothing">{t('vb_b1_nothing')}</span>
                : <div className="row" style={{ justifyContent: 'space-between', gap: 8 }} id="vb-statement-row"><span className="small">{t('vb_r_stmt')}</span><b className="num">{recorded.statementPeriod}</b></div>}
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn ghost" id="vb-new-bill-btn" style={{ flex: 1 }} onClick={newBill}>{t('vb_new')}</button>
              <button type="button" className="btn gold" id="vb-done-btn" style={{ flex: 1 }} onClick={() => { newBill(); go('venue-home', 'f') }}>{t('vb_done')}</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

register(
  { id: 'venue-bill', flow: 't', title: 'Table bill', C: VenueBillScreen },
  { id: 'venueBill', flow: 't', title: 'Table bill', C: VenueBillScreen },
)
export default VenueBillScreen
