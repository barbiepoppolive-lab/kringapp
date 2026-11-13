/* Account data for Kring v6: profile, settings, terms + 20+, blocks, data export, account deletion.
   Live: reads/writes through the 0011 functions and column grants (supabase/migrations/0011_kring_v6_accounts_security.sql).
   Preview (no Supabase keys or not signed in): the same calls keep everything in the app state on this phone. */
import { S, update, resetStateOnSignOut, EMPTY_PROFILE, type Diet, type Lang, type Notify, type Profile } from './store'
import { configured, currentUser, accessToken, forget } from './auth'

const env = (import.meta.env ?? {}) as Record<string, string | undefined>
const URL_ = env.VITE_SUPABASE_URL?.trim() || ''
const ANON = env.VITE_SUPABASE_ANON_KEY?.trim() || ''
export const TERMS_VERSION = '2026-10-25'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type { Notify, Profile }
const EMPTY = EMPTY_PROFILE

export const isLive = (): boolean => configured() && !!currentUser()

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: ANON, Authorization: `Bearer ${accessToken()}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  if (!r.ok) {
    const j = await r.json().catch(() => ({})) as { message?: string; code?: string }
    const rawMsg = String(j.message || j.code || r.status)
    const codeMatch = rawMsg.match(/\b([A-Za-z0-9_]{6,})\b/)
    throw new Error(codeMatch ? codeMatch[1] : rawMsg)
  }
  const txt = await r.text()
  return (txt ? JSON.parse(txt) : null) as T
}
const rpc = <T>(fn: string, args: Record<string, unknown> = {}) => rest<T>(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })

interface Row {
  display_name: string; lang: Lang; gender: 'f' | 'm' | 'x' | null; home_country: string | null; languages: string[]; bio: string | null
  food: Diet[]; notify: Notify; emergency_name: string | null; emergency_phone: string | null; promptpay_ref: string | null
  away: boolean; id_verified: boolean; is_host: boolean; terms_accepted_at: string | null
}
function fromRow(r: Row): void {
  update((s) => {
    s.prof = {
      name: r.display_name, country: r.home_country || '', languages: r.languages || [], bio: r.bio || '',
      notify: { ...EMPTY.notify, ...(r.notify || {}) }, emName: r.emergency_name || '', emPhone: r.emergency_phone || '',
      promptpay: r.promptpay_ref || '', idVerified: r.id_verified, isHost: r.is_host, termsAt: r.terms_accepted_at,
      // kept on this phone: a used launch ticket stays used (the profile row has no such column), so "first ticket free" never comes back
      ...(s.prof.usedLaunchTicket ? { usedLaunchTicket: true } : {}),
    }
    if (r.gender === 'f' || r.gender === 'm') s.gender = r.gender
    if (Array.isArray(r.food)) s.diet = r.food
    s.away = r.away
    s.signedIn = true
  })
}

/** After sign-in: load my profile, creating it the first time (name from the sign-in provider or the email). */
export async function loadProfile(): Promise<void> {
  if (!isLive()) return
  let row = await rpc<Row | null>('kr6_my_profile')
  if (!row) {
    const u = currentUser()!
    const name = (S.prof.name || u.name || (u.email || '').split('@')[0] || 'Traveller').slice(0, 40)
    await rest('kr6_profiles', { method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: u.id, display_name: name, lang: S.lang, gender: S.gender, food: S.diet }) })
    row = await rpc<Row | null>('kr6_my_profile')
  }
  if (row) fromRow(row)
}

export interface ProfilePatch { name?: string; country?: string; languages?: string[]; bio?: string; notify?: Notify
  emName?: string; emPhone?: string; promptpay?: string; away?: boolean; gender?: 'f' | 'm' | 'x' | null; diet?: Diet[]; lang?: Lang }

/** Save changed fields. Throws a short code (e.g. "bio_check") if the server refuses. */
export async function saveProfile(p: ProfilePatch): Promise<void> {
  if (isLive()) {
    const body: Record<string, unknown> = {}
    if (p.name !== undefined) body.display_name = p.name.trim().slice(0, 40)
    if (p.country !== undefined) body.home_country = p.country || null
    if (p.languages !== undefined) body.languages = p.languages
    if (p.bio !== undefined) body.bio = p.bio.trim() || null
    if (p.notify !== undefined) body.notify = p.notify
    if (p.emName !== undefined) body.emergency_name = p.emName.trim() || null
    if (p.emPhone !== undefined) body.emergency_phone = p.emPhone.trim() || null
    if (p.promptpay !== undefined) body.promptpay_ref = p.promptpay.replace(/\D/g, '') || null
    if (p.away !== undefined) body.away = p.away
    if (p.gender !== undefined) body.gender = p.gender
    if (p.diet !== undefined) body.food = p.diet
    if (p.lang !== undefined) body.lang = p.lang
    await rest(`kr6_profiles?user_id=eq.${currentUser()!.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) })
  }
  update((s) => {
    const { gender, diet, away, lang, ...rest_ } = p
    s.prof = { ...s.prof, ...rest_, ...(p.promptpay !== undefined ? { promptpay: p.promptpay.replace(/\D/g, '') } : {}) }
    if (gender !== undefined) s.gender = gender
    if (diet !== undefined) s.diet = diet
    if (away !== undefined) s.away = away
    if (lang !== undefined) s.lang = lang
  })
}

/** Terms + 20+ at sign-up. The server refuses without the age confirmation. */
export async function acceptTerms(age20: boolean): Promise<void> {
  if (!age20) throw new Error('AGE_20_REQUIRED')
  if (isLive()) await rpc('kr6_accept_terms', { p_version: TERMS_VERSION, p_age_20_plus: true })
  update((s) => { s.prof = { ...s.prof, termsAt: new Date().toISOString() } })
}

export async function becomeHost(): Promise<void> {
  if (isLive()) await rpc('kr6_become_host')
  update((s) => { s.prof = { ...s.prof, isHost: true } })
}

export interface Blocked { id: string; name: string }
export async function listBlocked(): Promise<Blocked[]> {
  if (!isLive()) return S.blocked
  const rows = await rest<{ blocked_id: string }[]>('kr6_blocks?select=blocked_id')
  const validIds = rows.map((r) => r.blocked_id).filter((id) => UUID_RE.test(id))
  if (!validIds.length) return []
  const names = await rest<{ user_id: string; display_name: string }[]>(
    `kr6_profiles?select=user_id,display_name&user_id=in.(${validIds.join(',')})`)
  return validIds.map((id) => ({ id, name: names.find((n) => n.user_id === id)?.display_name || '—' }))
}
export async function unblock(id: string): Promise<void> {
  if (!UUID_RE.test(id) && isLive()) throw new Error('INVALID_USER_ID')
  if (isLive()) await rest(`kr6_blocks?blocked_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
  update((s) => { s.blocked = s.blocked.filter((b) => b.id !== id) })
}

/** Download my data as a JSON file (Thai PDPA right of access). Returns the file name. */
export async function exportData(): Promise<string> {
  const data = isLive()
    ? await rpc<unknown>('kr6_export_my_data')
    : { exported_at: new Date().toISOString(), preview: true, profile: S.prof, gender: S.gender, food: S.diet, lang: S.lang, bookings: S.bookings }
  const name = `kring-my-data-${new Date().toISOString().slice(0, 10)}.json`
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return name
}

/** Delete the account for good: server wipes the profile, cancels future bookings with a full refund, removes the sign-in. */
export async function deleteAccount(): Promise<void> {
  if (isLive()) { await rpc('kr6_delete_my_account'); forget() }
  resetStateOnSignOut()
}

/** Resolve the signed-in user's UUID from the active Supabase session or JWT sub claim. */
export function getUserId(fallbackJwt?: string): string | null {
  const u = currentUser()
  if (u?.id && UUID_RE.test(u.id)) return u.id
  const tok = fallbackJwt || accessToken()
  if (tok && tok.split('.').length === 3) {
    try {
      const payloadB64 = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
      const decoded = JSON.parse(atob(payloadB64)) as { sub?: string }
      if (decoded.sub && UUID_RE.test(decoded.sub)) return decoded.sub
    } catch {
      /* ignore malformed token */
    }
  }
  return null
}

export interface RecordTableBillInput {
  meeting_place_id: string
  booking_id?: string | null
  host_id?: string | null
  guest_id?: string | null
  bill_amount_thb: number
  entered_by: 'venue_qr' | 'host_counter_confirm'
}

export interface RecordTableBillResult {
  ok: boolean
  error?: string
  row?: Record<string, unknown> | null
}

/** Record a Meeting Place Table Bill in public.kr6_venue_table_bills (0014 RLS-compliant: includes host_id / guest_id / booking_id, never sets staff_confirmed client-side). */
export async function recordTableBill(opts: RecordTableBillInput, bearerOverride?: string): Promise<RecordTableBillResult> {
  const amount = Math.round(Number(opts.bill_amount_thb) || 0)
  if (!opts.meeting_place_id || amount <= 0 || amount > 50000) {
    return { ok: false, error: 'Table Bill must be between ฿1 and ฿50,000' }
  }

  const tok = bearerOverride || accessToken()
  const uid = getUserId(tok)
  const isHost = Boolean(S.prof?.isHost || S.host)
  const resolvedHostId = opts.host_id !== undefined ? opts.host_id : (isHost ? uid : null)
  const resolvedGuestId = opts.guest_id !== undefined ? opts.guest_id : (!isHost ? uid : null)

  const payload = {
    meeting_place_id: opts.meeting_place_id,
    booking_id: opts.booking_id || null,
    host_id: resolvedHostId,
    guest_id: resolvedGuestId,
    bill_amount_thb: amount,
    entered_by: opts.entered_by,
  }

  if (!URL_ || !ANON || !tok) {
    return {
      ok: true,
      row: {
        ...payload,
        staff_confirmed: opts.entered_by === 'venue_qr',
      },
    }
  }

  try {
    const r = await fetch(
      `${URL_}/rest/v1/kr6_venue_table_bills?select=id,meeting_place_id,booking_id,host_id,guest_id,bill_amount_thb,guest_discount_thb,charged_thb,entered_by,staff_confirmed,created_at`,
      {
        method: 'POST',
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${tok}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(payload),
      },
    )
    if (!r.ok) {
      const errJson = (await r.json().catch(() => ({}))) as { message?: string; details?: string; code?: string }
      const errMsg = String(errJson.message || errJson.details || errJson.code || `HTTP ${r.status}`)
      return { ok: false, error: errMsg }
    }
    const rows = (await r.json().catch(() => null)) as Record<string, unknown>[] | null
    return { ok: true, row: Array.isArray(rows) ? rows[0] ?? null : null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export interface PublicMeetingPlaceRow {
  id: string
  slug: string
  name_en: string
  name_th: string | null
  category: string
  city: string
  district: string | null
  avg_item_price_thb: number | null
  band?: number | null
  band1_discount_thb?: number | null
  band1_min_bill_thb?: number | null
  guest_discount_rate?: number | null
}

/** Fetch a live Meeting Place from public.kr6_public_meeting_places by UUID or slug. */
export async function fetchMeetingPlace(idOrSlug: string): Promise<PublicMeetingPlaceRow | null> {
  const clean = (idOrSlug || '').trim()
  if (!clean || !URL_ || !ANON) return null
  const filter = UUID_RE.test(clean) ? `id=eq.${encodeURIComponent(clean)}` : `slug=eq.${encodeURIComponent(clean)}`
  try {
    const headers: Record<string, string> = { apikey: ANON }
    const tok = accessToken()
    if (tok) headers.Authorization = `Bearer ${tok}`
    const r = await fetch(`${URL_}/rest/v1/kr6_public_meeting_places?${filter}&limit=1`, { headers })
    if (!r.ok) return null
    const rows = (await r.json().catch(() => [])) as PublicMeetingPlaceRow[]
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null
  } catch {
    return null
  }
}

/* ── Venue self-serve onboarding (0016 · kr6_submit_venue_application) ──
   Callable signed-out (venue owners rarely have a Kring account). The server
   validates, de-duplicates by Maps link, rate-limits, and stores status 'pending'.
   Nothing is switched on until staff review it. */
export interface VenueApplicationPayload {
  p_venue_name: string
  p_owner_name: string
  p_line_id: string | null
  p_phone: string | null
  p_category: string
  p_band1_discount_thb: number | null
  p_band1_min_bill_thb: number | null
  p_city: string
  p_district: string | null
  p_maps_url: string
  p_photo_jpeg_b64: string
  p_referral_host_code: string | null
  p_terms_version: string
}

export async function submitVenueApplication(
  payload: VenueApplicationPayload,
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  if (!URL_ || !ANON) return { ok: true, id: null } // offline demo build
  const tok = accessToken() || ANON
  try {
    const r = await fetch(`${URL_}/rest/v1/rpc/kr6_submit_venue_application`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = (await r.json().catch(() => null)) as unknown
    if (!r.ok) {
      const msg = String((body as { message?: string } | null)?.message || `HTTP ${r.status}`)
      return { ok: false, error: msg }
    }
    return { ok: true, id: typeof body === 'string' ? body : null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/* ── Venue media consent (#venue-consent?biz=<code> · 0021 · PDPA minimal, IP-free) ── */
export const VENUE_CONSENT_TEXT_VERSION = '2026-11-05-v1'
export const VENUE_MEDIA_BUCKET = 'venue-media'
export const MAX_VENUE_MEDIA_FILES = 8

export interface VenueMediaConsentRecord {
  id: string
  biz_code: string
  venue_name: string | null
  contact: string | null
  consent_text_version: string
  consented_at: string
  media_paths: string[]
}

export function sanitizeBizCode(raw: string): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function buildVenueMediaBucketPath(bizCode: string, fileName: string, index = 0): string {
  const biz = sanitizeBizCode(bizCode) || 'venue'
  const cleanName = (fileName || `clip-${index + 1}.jpg`)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .slice(-60)
  return `${VENUE_MEDIA_BUCKET}/${biz}/${ index + 1 }_${cleanName}`
}

export interface SubmitVenueMediaConsentInput {
  bizCode: string
  venueName?: string
  contact?: string
  files?: File[]
  consentTextVersion?: string
}

export async function submitVenueMediaConsent(
  input: SubmitVenueMediaConsentInput,
): Promise<{ ok: true; record: VenueMediaConsentRecord } | { ok: false; error: string }> {
  const biz_code = sanitizeBizCode(input.bizCode)
  if (!biz_code) {
    return { ok: false, error: 'INVALID_BIZ_CODE' }
  }
  const files = Array.isArray(input.files) ? input.files : []
  if (files.length > MAX_VENUE_MEDIA_FILES) {
    return { ok: false, error: 'MAX_8_FILES_EXCEEDED' }
  }

  const consent_text_version = (input.consentTextVersion || VENUE_CONSENT_TEXT_VERSION).trim()
  const consented_at = new Date().toISOString()
  const venue_name = (input.venueName || '').trim().slice(0, 120) || null
  const contact = (input.contact || '').trim().slice(0, 160) || null
  const media_paths = files.map((f, i) => buildVenueMediaBucketPath(biz_code, f.name, i))

  const isTestEnv = env.MODE === 'test' || Boolean((globalThis as Record<string, unknown>).__vitest_worker__)

  if (URL_ && ANON && !isTestEnv) {
    const tok = accessToken() || ANON
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        const objectKey = media_paths[i].replace(/^venue-media\//, '')
        const up = await fetch(`${URL_}/storage/v1/object/${VENUE_MEDIA_BUCKET}/${objectKey}`, {
          method: 'POST',
          headers: {
            apikey: ANON,
            Authorization: `Bearer ${tok}`,
            'Content-Type': f.type || 'application/octet-stream',
            'x-upsert': 'true',
          },
          body: f,
        })
        if (!up.ok) {
          const msg = await up.text().catch(() => `HTTP ${up.status}`)
          if (!/Bucket not found/i.test(msg)) {
            return { ok: false, error: `UPLOAD_FAILED: ${msg}` }
          }
        }
      }

      const r = await fetch(`${URL_}/rest/v1/rpc/kr6_submit_venue_media_consent`, {
        method: 'POST',
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${tok}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_biz_code: biz_code,
          p_consent_text_version: consent_text_version,
          p_venue_name: venue_name,
          p_contact: contact,
          p_media_paths: media_paths,
        }),
      })
      if (r.ok) {
        const resJson = (await r.json().catch(() => null)) as Partial<VenueMediaConsentRecord> | null
        const record: VenueMediaConsentRecord = {
          id: String(resJson?.id || `vc-${Date.now().toString(36)}`),
          biz_code,
          venue_name,
          contact,
          consent_text_version,
          consented_at: String(resJson?.consented_at || consented_at),
          media_paths,
        }
        saveLocalVenueConsent(record)
        return { ok: true, record }
      }
      const body = (await r.json().catch(() => null)) as { message?: string } | null
      const errMsg = String(body?.message || `HTTP ${r.status}`)
      if (!/schema cache|Could not find the function/i.test(errMsg)) {
        return { ok: false, error: errMsg }
      }
    } catch {
      /* fall through to local store when offline or undeployed */
    }
  }

  // Offline / preview build: store IP-free PDPA-minimal record locally
  const record: VenueMediaConsentRecord = {
    id: `vc-${Date.now().toString(36)}`,
    biz_code,
    venue_name,
    contact,
    consent_text_version,
    consented_at,
    media_paths,
  }
  saveLocalVenueConsent(record)
  return { ok: true, record }
}

function saveLocalVenueConsent(record: VenueMediaConsentRecord): void {
  try {
    const key = 'kr6_venue_consents'
    const prev = JSON.parse(localStorage.getItem(key) || '[]') as VenueMediaConsentRecord[]
    const next = [record, ...prev.filter((x) => x.biz_code !== record.biz_code)].slice(0, 50)
    localStorage.setItem(key, JSON.stringify(next))
  } catch {
    /* ignore storage errors */
  }
}

export function getSavedVenueConsents(): VenueMediaConsentRecord[] {
  try {
    return JSON.parse(localStorage.getItem('kr6_venue_consents') || '[]') as VenueMediaConsentRecord[]
  } catch {
    return []
  }
}

