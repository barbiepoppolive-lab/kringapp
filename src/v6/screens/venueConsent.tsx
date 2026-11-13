/* /#venue-consent?biz=<code> · One-page venue photo/video consent form (OPUS-NIGHT-03-CONSENT-PAGE).
   - Thai first with English under every line.
   - Exact English consent line:
     "Kring may use photos/videos of [venue] in the Kring app and on Kring social accounts, always with your name and tag. Ask us any time and we remove it."
   - One big button "ยินยอม / I agree" + optional upload of up to 8 photos/clips + LINE/email field.
   - Stores: biz_code, consent_text_version, consented_at, ip-free (PDPA minimal), files to storage bucket venue-media/<biz>. */
import { useEffect, useState } from 'react'
import { register } from '../core/router'
import { S, useS } from '../core/store'
import { HOST_PLACES, PARTNER_VENUES } from '../core/hostPlaces'
import {
  MAX_VENUE_MEDIA_FILES,
  VENUE_CONSENT_TEXT_VERSION,
  buildVenueMediaBucketPath,
  sanitizeBizCode,
  submitVenueMediaConsent,
  type VenueMediaConsentRecord,
} from '../core/account'
import { I, Ic } from '../ui/kit'

const KNOWN_VENUE_NAMES: Record<string, string> = {
  'roots-bkk': 'Roots Coffee',
  'sarnies-bkk': 'Sarnies Bangkok',
  'wallflowers-cafe': 'Wallflowers Café',
  'haab-bkk': 'HAAB Banthat Thong',
  'jeh-o-chula': 'Jeh O Chula',
  'baannai-bkk': 'Baannai The Reminiscence',
  'rva-river-cafe': 'Riva Arun Bangkok',
  'hong-sieng-kong': 'Hong Sieng Kong',
}

function parseConsentQuery(): { biz: string; name: string } {
  const q = location.hash.split('?')[1] || ''
  const sp = new URLSearchParams(q)
  const rawBiz = sp.get('biz')?.trim() || ''
  const rawName = sp.get('name')?.trim() || ''
  const biz = sanitizeBizCode(rawBiz)
  let name = rawName
  if (!name && biz) {
    if (KNOWN_VENUE_NAMES[biz]) {
      name = KNOWN_VENUE_NAMES[biz]
    } else {
      const place = [...PARTNER_VENUES, ...HOST_PLACES].find((p) => p.id.toLowerCase() === biz || p.id.replace(/^v-/, '').toLowerCase() === biz || p.en.toLowerCase().replace(/[^a-z0-9]+/g, '-') === biz)
      if (place) name = place.en
      else {
        name = biz
          .split(/[-_]+/)
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
      }
    }
  }
  return { biz, name }
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#141828',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 12,
  padding: '11px 14px',
  color: '#fff',
  fontSize: 15,
  boxSizing: 'border-box',
}

function BiLine({
  th,
  en,
  id,
  thStyle,
  enStyle,
}: {
  th: string
  en: string
  id?: string
  thStyle?: React.CSSProperties
  enStyle?: React.CSSProperties
}) {
  return (
    <div className="col" id={id} style={{ gap: 2 }}>
      <span lang="th" style={{ fontWeight: 600, color: '#fff', lineHeight: 1.45, ...thStyle }}>{th}</span>
      <span lang="en" className="small" style={{ color: 'rgba(255,255,255,0.74)', lineHeight: 1.45, ...enStyle }}>{en}</span>
    </div>
  )
}

export function VenueConsentScreen() {
  useS()
  const initial = parseConsentQuery()
  const [bizCode, setBizCode] = useState(initial.biz || 'demo-venue')
  const [venueName, setVenueName] = useState(initial.name || 'Demo Venue Bangkok')
  const [contact, setContact] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [fileError, setFileError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [savedRecord, setSavedRecord] = useState<VenueMediaConsentRecord | null>(null)

  useEffect(() => {
    const syncFromHash = () => {
      const parsed = parseConsentQuery()
      if (parsed.biz) setBizCode(parsed.biz)
      if (parsed.name) setVenueName(parsed.name)
    }
    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [])

  const displayVenue = venueName.trim() || bizCode.trim() || '[venue]'

  function onSelectFiles(fileList: FileList | null) {
    setFileError('')
    setError('')
    if (!fileList || fileList.length === 0) return
    const incoming = Array.from(fileList)
    const combined = [...files, ...incoming]
    if (combined.length > MAX_VENUE_MEDIA_FILES) {
      setFileError('อัปโหลดได้สูงสุด 8 ไฟล์ / Maximum 8 photos or video clips allowed.')
      setFiles(combined.slice(0, MAX_VENUE_MEDIA_FILES))
      return
    }
    setFiles(combined)
  }

  function removeFile(idx: number) {
    setFileError('')
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleAgree() {
    setError('')
    setFileError('')
    const cleanBiz = sanitizeBizCode(bizCode || venueName)
    if (!cleanBiz) {
      setError('กรุณาระบุรหัสร้านหรือชื่อร้าน / Please enter your venue code or name.')
      return
    }
    setBusy(true)
    const res = await submitVenueMediaConsent({
      bizCode: cleanBiz,
      venueName: displayVenue,
      contact,
      files,
      consentTextVersion: VENUE_CONSENT_TEXT_VERSION,
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setSavedRecord(res.record)
  }

  return (
    <>
      <div className="topb">
        <button className="ib" data-go={S.from['venue-consent'] || 'venue-home'} data-how="l" aria-label="ย้อนกลับ / Back">
          <Ic p={I.back} />
        </button>
        <div className="col" style={{ gap: 0 }}>
          <b style={{ fontSize: 14, color: 'var(--gold2)' }}>กริ๊ง! พาร์ทเนอร์ร้านค้า</b>
          <span className="small" style={{ fontSize: 11 }}>Kring! Venue Partner</span>
        </div>
        <div className="grow" />
        <span
          id="vc-biz-pill"
          className="small"
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            background: 'rgba(255,208,103,0.14)',
            border: '1px solid rgba(255,208,103,0.45)',
            color: 'var(--gold2)',
            fontFamily: 'monospace',
          }}
        >
          biz={sanitizeBizCode(bizCode) || 'venue'}
        </span>
      </div>

      <div className="scroll">
        <div className="col" id="vc-page" style={{ gap: 14, padding: 16, paddingBottom: 64 }}>
          <div className="col" style={{ gap: 4 }}>
            <h1 className="h2" id="vc-title-th" style={{ margin: 0, lineHeight: 1.3 }}>
              คำยินยอมการใช้ภาพและวิดีโอของร้าน
            </h1>
            <span id="vc-title-en" className="small" style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)' }}>
              Photo &amp; video permission for {displayVenue}
            </span>
          </div>

          {/* Core bilingual consent box (Thai first, exact English sentence below) */}
          <div
            className="card col"
            id="vc-consent-box"
            style={{
              gap: 10,
              padding: 16,
              background: 'rgba(255, 208, 103, 0.08)',
              border: '1.5px solid rgba(255, 208, 103, 0.55)',
              borderRadius: 16,
            }}
          >
            <p
              id="vc-consent-th"
              lang="th"
              style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.6, color: '#fff' }}
            >
              Kring ขออนุญาตใช้ภาพถ่ายและวิดีโอของ {displayVenue} ในแอป Kring และช่องทางโซเชียลของ Kring โดยจะระบุชื่อร้านและแท็กร้านของคุณเสมอ หากต้องการให้นำออก แจ้งเราได้ทุกเมื่อและเราจะลบออกทันที
            </p>
            <p
              id="vc-consent-en"
              lang="en"
              style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.88)' }}
            >
              Kring may use photos/videos of {displayVenue} in the Kring app and on Kring social accounts, always with your name and tag. Ask us any time and we remove it.
            </p>
          </div>

          {/* Venue name / code preview & edit if needed */}
          <label className="col" style={{ gap: 6 }} htmlFor="vc-venue-name">
            <BiLine
              th="ชื่อร้านของคุณ (แสดงในเครดิตและแท็ก)"
              en="Your venue name (shown in credit and tag)"
            />
            <input
              id="vc-venue-name"
              style={inputStyle}
              value={venueName}
              maxLength={120}
              onChange={(e) => setVenueName(e.target.value)}
              placeholder="เช่น Roots Coffee / Sarnies Bangkok"
            />
          </label>

          {/* Optional upload of up to 8 photos/clips */}
          <div className="card col" id="vc-upload-card" style={{ gap: 10, padding: 14 }}>
            <BiLine
              th="อัปโหลดรูปภาพหรือคลิปวิดีโอของร้าน (ไม่บังคับ · สูงสุด 8 ไฟล์)"
              en="Upload up to 8 photos or video clips of your venue (optional)"
            />
            <label
              htmlFor="vc-files"
              className="chip"
              style={{
                alignSelf: 'flex-start',
                minHeight: 42,
                padding: '8px 14px',
                cursor: 'pointer',
                gap: 8,
                border: '1px dashed rgba(255,208,103,0.6)',
              }}
            >
              <Ic p={I.camera} s={18} />
              <div className="col" style={{ gap: 0, textAlign: 'left' }}>
                <b style={{ fontSize: 13 }}>เลือกรูปภาพ / คลิปวิดีโอ ({files.length}/{MAX_VENUE_MEDIA_FILES})</b>
                <span style={{ fontSize: 11, opacity: 0.8 }}>Choose photos / clips ({files.length}/{MAX_VENUE_MEDIA_FILES})</span>
              </div>
            </label>
            <input
              id="vc-files"
              type="file"
              accept="image/*,video/*"
              multiple
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
              onChange={(e) => onSelectFiles(e.target.files)}
            />

            {files.length > 0 && (
              <div className="col" id="vc-file-list" style={{ gap: 6 }}>
                {files.map((f, i) => {
                  const bucketPath = buildVenueMediaBucketPath(bizCode, f.name, i)
                  return (
                    <div
                      key={`${f.name}-${i}`}
                      className="row small"
                      style={{
                        gap: 8,
                        alignItems: 'center',
                        padding: '6px 10px',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.06)',
                      }}
                    >
                      <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {i + 1}. {f.name} <span style={{ opacity: 0.65 }}>({bucketPath})</span>
                      </span>
                      <button
                        type="button"
                        className="small"
                        onClick={() => removeFile(i)}
                        style={{ background: 'none', border: 0, color: '#ff8a8a', cursor: 'pointer', padding: '2px 6px' }}
                        aria-label={`ลบไฟล์ ${f.name} / Remove ${f.name}`}
                      >
                        ลบ / Remove
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {fileError && (
              <span id="vc-file-error" className="small" style={{ color: '#ff7a7a' }}>
                {fileError}
              </span>
            )}
          </div>

          {/* Optional LINE / email field */}
          <label className="col" style={{ gap: 6 }} htmlFor="vc-contact">
            <BiLine
              th="LINE ID หรืออีเมลของร้าน (ไม่บังคับ)"
              en="Your venue LINE ID or email (optional)"
            />
            <input
              id="vc-contact"
              style={inputStyle}
              value={contact}
              maxLength={160}
              onChange={(e) => setContact(e.target.value)}
              placeholder="@yourvenue หรือ email@venue.com / @yourvenue or email@venue.com"
            />
          </label>

          {/* PDPA minimal IP-free notice */}
          <BiLine
            id="vc-pdpa-note"
            th="คุ้มครองข้อมูลส่วนบุคคล (PDPA): ระบบบันทึกเฉพาะรหัสร้าน เวอร์ชันคำยินยอม เวลาที่กดยินยอม และไฟล์ที่อัปโหลด โดยไม่เก็บหมายเลข IP"
            en="PDPA minimal & IP-free: we store only biz_code, consent_text_version, consented_at, and files in venue-media/<biz> (no IP address stored)."
            thStyle={{ fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.72)' }}
            enStyle={{ fontSize: 11.5, color: 'rgba(255,255,255,0.58)' }}
          />

          {error && (
            <div className="card" id="vc-error" style={{ padding: 10, color: '#ff7a7a' }}>
              {error}
            </div>
          )}

          {/* One big button: ยินยอม / I agree */}
          <button
            type="button"
            className="btn gold"
            id="vc-agree"
            disabled={busy}
            onClick={handleAgree}
            style={{
              minHeight: 56,
              fontSize: 18,
              fontWeight: 700,
              borderRadius: 14,
              letterSpacing: 0.2,
            }}
          >
            {busy ? 'กำลังบันทึก… / Saving…' : 'ยินยอม / I agree'}
          </button>

          {savedRecord && (
            <div
              className="card col"
              id="vc-done"
              role="status"
              style={{
                gap: 8,
                padding: 14,
                border: '1.5px solid rgba(76, 211, 154, 0.65)',
                background: 'rgba(76, 211, 154, 0.1)',
                borderRadius: 14,
              }}
            >
              <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                <span className="ok"><Ic p={I.check} s={20} sw={3} /></span>
                <BiLine
                  th={`บันทึกคำยินยอมของ ${displayVenue} เรียบร้อยแล้ว ขอบคุณค่ะ!`}
                  en={`Consent saved for ${displayVenue}. Thank you!`}
                />
              </div>
              <div className="col small" style={{ gap: 2, fontFamily: 'monospace', fontSize: 12, opacity: 0.88 }}>
                <span>biz_code: {savedRecord.biz_code}</span>
                <span>consent_text_version: {savedRecord.consent_text_version}</span>
                <span>consented_at: {savedRecord.consented_at}</span>
                <span>bucket: venue-media/{savedRecord.biz_code} ({savedRecord.media_paths.length} files)</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

register(
  { id: 'venue-consent', flow: 't', title: 'Venue media consent', C: VenueConsentScreen },
  { id: 'venueConsent', flow: 't', title: 'Venue media consent', C: VenueConsentScreen },
)

export default VenueConsentScreen
