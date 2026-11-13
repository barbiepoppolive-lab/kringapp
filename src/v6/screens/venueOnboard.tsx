/* /#venue-onboard · 30-second self-serve venue sign-up (locked 29 Oct, three bands), and /#venue-home, the
   venue's own page on this phone (status, chosen terms, record a table bill).
   - Follows the app language (t('vo_*'), t('vh_*')).
   - Category picks the band: café/dessert/casual = Band 1 (fixed guest discount, venue pays Kring nothing);
     restaurant/rooftop/studio = Band 2, experience = Band 3 (15% guest discount, 10% of the full bill to Kring,
     first month free). Rates fixed 6 months.
   - Direct-POS: the venue charges guests at its own till. Kring never collects the venue's money.
   - Submits as 'pending'. Staff check the Maps link + shopfront photo before switching the venue on. */
import { useState } from 'react'
import { register, go } from '../core/router'
import { S, update, useS } from '../core/store'
import { t, baht, dayFmt } from '../core/data'
import { submitVenueApplication, TERMS_VERSION } from '../core/account'
import {
  BAND1_TIERS, CATEGORY_BAND, RATE_FIXED_MONTHS, rateFixedUntil, validateVenueApplication,
  type Band1Tier, type VenueApplicationError, type VenueCategory,
} from '../core/venueBands'
import { myVenue, type MyVenue } from './venueBill'
import { I, Ic } from '../ui/kit'

const CATS: VenueCategory[] = ['cafe', 'dessert', 'casual', 'restaurant', 'rooftop', 'studio', 'experience']

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#141828', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 10,
  padding: '10px 12px', color: '#fff', fontSize: 15, boxSizing: 'border-box',
}

/** Shrink the shopfront photo on the phone so the upload stays small (≤ ~200 KB). */
async function photoToJpegB64(file: File): Promise<string> {
  const url = await new Promise<string>((res, rej) => {
    const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url
  })
  const scale = Math.min(1, 960 / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  let q = 0.8, out = c.toDataURL('image/jpeg', q)
  while (out.length > 270_000 && q > 0.35) { q -= 0.15; out = c.toDataURL('image/jpeg', q) }
  return out.replace(/^data:image\/jpeg;base64,/, '')
}

function refFromHash(): string {
  const q = (location.hash.split('?')[1] || '')
  return new URLSearchParams(q).get('ref')?.trim() || ''
}

const linkBtn: React.CSSProperties = { color: 'var(--gold2)', textDecoration: 'underline', background: 'none', border: 0, padding: 0, font: 'inherit', textAlign: 'left' }

export function VenueOnboardScreen() {
  useS()
  const [venueName, setVenueName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [lineId, setLineId] = useState('')
  const [phone, setPhone] = useState('')
  const [category, setCategory] = useState<VenueCategory | ''>('')
  const [tier, setTier] = useState<Band1Tier | null>(null)
  const [city, setCity] = useState<'Bangkok' | 'Pattaya' | ''>('Bangkok')
  const [district, setDistrict] = useState('')
  const [mapsUrl, setMapsUrl] = useState('')
  const [photoB64, setPhotoB64] = useState('')
  const [referral, setReferral] = useState(refFromHash())
  const [accepted, setAccepted] = useState(false)
  const [errors, setErrors] = useState<VenueApplicationError[]>([])
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState('')
  const [showTerms, setShowTerms] = useState(false)
  /** the café's own 6-digit staff PIN: staff type it before recording a Kring table bill */

  const band = category ? CATEGORY_BAND[category] : null

  async function onPhoto(f: File | undefined) {
    if (!f) return
    setServerError('')
    try { setPhotoB64(await photoToJpegB64(f)) } catch { setPhotoB64(''); setServerError(t('vo_photo_bad')) }
  }

  async function submit() {
    setServerError('')
    const errs = validateVenueApplication({
      venueName, ownerName, lineId, phone, category, band1Tier: tier, city, district, mapsUrl,
      hasShopfrontPhoto: !!photoB64, referralHostCode: referral, acceptedTerms: accepted,
    })
    setErrors(errs)
    // Staff PIN is now made on the server at approval (0023) and sent to the owner; the form no longer asks for one.
    if (errs.length) return
    setBusy(true)
    const r = await submitVenueApplication({
      p_venue_name: venueName.trim(),
      p_owner_name: ownerName.trim(),
      p_line_id: lineId.trim() || null,
      p_phone: phone.trim() || null,
      p_category: category,
      p_band1_discount_thb: band === 1 && tier ? tier.discountThb : null,
      p_band1_min_bill_thb: band === 1 && tier ? tier.minBillThb : null,
      p_city: city,
      p_district: district.trim() || null,
      p_maps_url: mapsUrl.trim(),
      p_photo_jpeg_b64: photoB64,
      p_referral_host_code: referral.trim() || null,
      p_terms_version: TERMS_VERSION,
    })
    setBusy(false)
    if (r.ok) {
      const v: MyVenue = {
        id: r.id || 'pending-' + Date.now().toString(36), name: venueName.trim(), category: category as string, band: band || 1,
        discountThb: band === 1 && tier ? tier.discountThb : null, minBillThb: band === 1 && tier ? tier.minBillThb : null,
        sentAt: new Date().toISOString(), status: 'pending',
      }
      update((st) => { st.myVenue = v as unknown as Record<string, unknown> })
      go('venue-home', 'f')
    } else setServerError(r.error.includes('ALREADY_APPLIED') ? t('vo_s_dup') : r.error.includes('RATE_LIMIT') ? t('vo_s_rate') : t('vo_s_fail'))
  }

  const has = (e: VenueApplicationError) => errors.includes(e)
  const err = (e: VenueApplicationError) => has(e) && <span className="small" style={{ color: '#ff7a7a' }}>{t('vo_e_' + e)}</span>

  return (
    <>
      <div className="topb"><button className="ib" data-go={S.from['venue-onboard'] || 'venue-home'} data-how="l" aria-label={t('backW')}><Ic p={I.back} /></button><div className="grow" /></div>
      <div className="scroll"><div className="col" id="vo-form" style={{ gap: 14, padding: 16, paddingBottom: 60 }}>
        <div className="col" style={{ gap: 4 }}>
          <h1 className="h2" style={{ margin: 0 }}>{t('vo_title')}</h1>
          <span className="small">{t('vo_sub')}</span>
        </div>

        <div className="card col" id="vo-plain-box" style={{ gap: 6, padding: 12, border: '1px solid rgba(255,208,103,.45)' }}>
          <b>{t('vo_plain')}</b>
          <span className="small">{t('vo_plain_sub')}</span>
        </div>

        <label className="col" style={{ gap: 4 }}>{t('vo_name')}
          <input id="vo-venue-name" style={inputStyle} value={venueName} maxLength={120} onChange={(e) => setVenueName(e.target.value)} />
          {err('venueName')}
        </label>
        <label className="col" style={{ gap: 4 }}>{t('vo_owner')}
          <input id="vo-owner-name" style={inputStyle} value={ownerName} maxLength={80} onChange={(e) => setOwnerName(e.target.value)} />
          {err('ownerName')}
        </label>
        <div className="row" style={{ gap: 8 }}>
          <label className="col" style={{ gap: 4, flex: 1 }}>LINE ID
            <input id="vo-line" style={inputStyle} value={lineId} onChange={(e) => setLineId(e.target.value)} placeholder="@yourshop" />
          </label>
          <label className="col" style={{ gap: 4, flex: 1 }}>{t('vo_phone')}
            <input id="vo-phone" style={inputStyle} value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} placeholder="+66" />
          </label>
        </div>
        {err('contact')}

        <div className="col" style={{ gap: 6 }}>
          <span>{t('vo_kind')}</span>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }} id="vo-categories">
            {CATS.map((c) => (
              <button key={c} type="button" id={`vo-cat-${c}`} className={`chip ${category === c ? 'on' : ''}`} style={{ height: 'auto', minHeight: 40, padding: '8px 12px', whiteSpace: 'normal' }}
                onClick={() => { setCategory(c); if (CATEGORY_BAND[c] !== 1) setTier(null) }}>
                {t('vo_c_' + c)}
              </button>
            ))}
          </div>
          {err('category')}
        </div>

        {band === 1 && (
          <div className="card col" id="vo-band1" style={{ gap: 6, padding: 12 }}>
            <b>{t('vo_b1_t')}</b>
            <span className="small">{t('vo_b1_sub')}</span>
            <span className="small" id="vo-b1-why">{t('vo_b1_why')}</span>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {BAND1_TIERS.map((x) => {
                const on = tier?.discountThb === x.discountThb && tier?.minBillThb === x.minBillThb
                return (
                  <button key={x.discountThb} type="button" id={`vo-tier-${x.discountThb}`} className={`chip ${on ? 'on' : ''}`} style={{ height: 'auto', minHeight: 40, padding: '8px 12px', whiteSpace: 'normal' }} onClick={() => setTier(x)}>
                    {t('vo_tier', { d: baht(x.discountThb), min: baht(x.minBillThb) })}
                  </button>
                )
              })}
            </div>
            {err('band1Tier')}
          </div>
        )}
        {(band === 2 || band === 3) && (
          <div className="card col" id="vo-band23" style={{ gap: 4, padding: 12 }}>
            <b>{t('vo_b23_t')}</b>
            <span className="small">{t('vo_b23_sub')}</span>
            {band === 3 && <span className="small">{t('vo_b3')}</span>}
          </div>
        )}
        {band && <span className="small" id="vo-rate-lock">{t('vo_lock', { n: RATE_FIXED_MONTHS })}</span>}

        <div className="col" style={{ gap: 6 }}>
          <span>{t('vo_city')}</span>
          <div className="row" style={{ gap: 6 }}>
            {(['Bangkok', 'Pattaya'] as const).map((c) => (
              <button key={c} type="button" id={`vo-city-${c}`} className={`chip ${city === c ? 'on' : ''}`} style={{ minHeight: 40 }} onClick={() => setCity(c)}>
                {t(c === 'Bangkok' ? 'vo_bkk' : 'vo_pty')}
              </button>
            ))}
          </div>
          {err('city')}
        </div>
        <label className="col" style={{ gap: 4 }}>{t('vo_area')}
          <input id="vo-district" style={inputStyle} value={district} maxLength={60} onChange={(e) => setDistrict(e.target.value)} placeholder="Ari, Samyan…" />
        </label>
        <label className="col" style={{ gap: 4 }}>{t('vo_maps')}
          <input id="vo-maps" style={inputStyle} value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} placeholder="https://maps.app.goo.gl/…" />
          {err('mapsUrl')}
        </label>
        <div className="col" style={{ gap: 6 }}>{t('vo_photo')}
          <label className="chip" htmlFor="vo-photo" style={{ alignSelf: 'flex-start', minHeight: 40, cursor: 'pointer' }}><Ic p={I.camera} s={16} />{t('vo_photo_btn')}</label>
          <input id="vo-photo" type="file" accept="image/*" capture="environment" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onChange={(e) => onPhoto(e.target.files?.[0])} />
          {photoB64
            ? <span className="row small" id="vo-photo-ok" style={{ gap: 10, alignItems: 'center' }}><img src={'data:image/jpeg;base64,' + photoB64} alt="" style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 8 }} />{t('vo_photo_ok')}</span>
            : <span className="small">{t('vo_photo_none')}</span>}
          {err('photo')}
        </div>
        <label className="col" style={{ gap: 4 }}>{t('vo_ref')}
          <input id="vo-ref" style={inputStyle} value={referral} maxLength={40} onChange={(e) => setReferral(e.target.value)} />
          {err('referral')}
        </label>

        <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <input id="vo-terms" type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span className="small">{t('vo_agree')}</span>
        </label>
        <button type="button" id="vo-terms-link" className="small" onClick={() => setShowTerms((x) => !x)} style={linkBtn}>{t('vo_terms_link')}</button>
        {showTerms && (
          <div className="card col" id="vo-terms-summary" style={{ gap: 6, padding: 12 }}>
            <b>{t('vo_terms_t')}</b>
            {[1, 2, 3, 4, 5].map((n) => <span key={n} className="small">{n}. {t('vo_t' + n, { n: RATE_FIXED_MONTHS })}</span>)}
          </div>
        )}
        {err('terms')}

        {serverError && <div className="card" id="vo-error" style={{ padding: 10, color: '#ff7a7a' }}>{serverError}</div>}
        <button type="button" className="btn gold" id="vo-submit" disabled={busy} onClick={submit}>{busy ? t('vo_sending') : t('vo_send')}</button>
      </div></div>
    </>
  )
}

/** The venue's own page on this phone: what it signed up for, its status, and the table-bill page. */
function VenueHome() {
  useS()
  const v = myVenue()
  const until = v ? dayFmt(new Date(rateFixedUntil(new Date(v.sentAt))), { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  const fresh = !!v && Date.now() - new Date(v.sentAt).getTime() < 10 * 60 * 1000
  return (
    <>
      <div className="topb"><div className="grow" /></div>
      <div className="scroll"><div className="col" id="vh" style={{ gap: 14, padding: 16, paddingBottom: 60 }}>
        <h1 className="h2" style={{ margin: 0 }}>{t('vh_title')}</h1>
        {v ? (
          <>
            {fresh && <div className="card row" id="vo-done" style={{ gap: 10, padding: 12, border: '1px solid rgba(76,211,154,.5)' }}><span className="ok"><Ic p={I.check} s={20} sw={3} /></span><b className="grow">{t('vh_thanks')}</b></div>}
            <div className="glass card col" id="vh-venue" style={{ gap: 8, padding: 14 }}>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><b className="grow" style={{ fontSize: 17 }}>{v.name}</b><span className="small" id="vh-status" style={{ padding: '3px 10px', borderRadius: 999, border: '1px solid rgba(255,208,103,.5)', color: 'var(--gold2)' }}>{v.status === 'active' ? t('vh_active') : t('vb_pending')}</span></div>
              <span className="small">{t('vo_c_' + v.category)}</span>
              <span id="vh-terms">{v.band === 1 && v.discountThb && v.minBillThb ? t('vh_terms_b1', { d: baht(v.discountThb), min: baht(v.minBillThb) }) : t('vh_terms_b23')}</span>
              <span className="small" id="vh-lock">{t('vh_lock', { n: RATE_FIXED_MONTHS, d: until })}</span>
            </div>
            {v.status !== 'active' && <div className="card small" id="vh-next" style={{ padding: 12, lineHeight: 1.6, background: 'var(--glass2)', border: '1px solid var(--line)' }}>{t('vh_next')}</div>}
          </>
        ) : (
          <span className="small" id="vh-none">{t('vh_none')}</span>
        )}
        <a className="btn gold" id="vh-bill" href={`${import.meta.env.BASE_URL}staff.html`}>{t('vh_bill')}</a>
        <button type="button" className="btn ghost" id="vh-new" data-go="venue-onboard">{v ? t('vh_new') : t('vh_signup')}</button>
      </div></div>
    </>
  )
}

register(
  { id: 'venue-onboard', flow: 't', title: 'Venue sign-up', C: VenueOnboardScreen },
  { id: 'venueOnboard', flow: 't', title: 'Venue sign-up', C: VenueOnboardScreen },
  { id: 'venue-home', flow: 't', title: 'Your venue', C: VenueHome },
)
export default VenueOnboardScreen
