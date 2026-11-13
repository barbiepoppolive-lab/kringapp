/* Live activities & real reviews bridge for Kring v6 (OPUS-DEMO-LISTINGS-001).
   Rules:
   - Production builds NEVER show hardcoded demo ACTS (Nicha, Beam, Mint, tour-style items, or fake 4.9 / 128 ratings).
   - Explore, Saved, and Chat read published activities (`status = 'live'` and `approved_at IS NOT NULL`) of verified hosts
     (`id_verified = true` and `is_host = true`) from `public.kr6_activities` + `public.kr6_profiles`, with real ratings
     computed only from `public.kr6_reviews`.
   - When a host publishes an activity in `HCreate`, it writes to `public.kr6_activities` with `status = 'review'`
     (enforced both client-side and by the `kr6_activity_guard` trigger in 0011) so it stays pending review until approved. */

import { S, update } from './store'
import { ACTS, type Act } from './data'
import { configured, accessToken } from './auth'
import { getUserId, becomeHost, isLive } from './account'
import { HOST_PLACES, PARTNER_VENUES, type HostPlaceKind } from './hostPlaces'

const env = (import.meta.env ?? {}) as Record<string, string | undefined>
const URL_ = env.VITE_SUPABASE_URL?.trim() || ''
const ANON = env.VITE_SUPABASE_ANON_KEY?.trim() || ''

export interface DbActivityRow {
  id: string
  host_id: string
  title: string
  category: string
  place_name: string
  place_kind: 'station' | 'pier' | 'park' | 'partner_venue' | 'public_square'
  meet_lat: number
  meet_lng: number
  duration_min: number
  price_thb: number
  partner_fee_thb?: number
  start_times: string[]
  days: number[]
  status: 'review' | 'live' | 'paused'
  created_at?: string
  approved_at?: string | null
  is_volunteer?: boolean
  bring_friend_first_3?: boolean
}

export interface DbVerifiedHostRow {
  user_id: string
  display_name: string
  lang?: string
  is_host: boolean
  host_level?: number
  id_verified: boolean
  photo_url?: string | null
  languages?: string[]
  bio?: string | null
  away?: boolean
  bring_friend_first_3?: boolean
  created_at?: string
}

export interface DbReviewRow {
  booking_id: string
  activity_id?: string
  stars: number
  tags?: string[]
  host_reply?: string | null
  visible_at?: string
  created_at?: string
}

const CAT_FALLBACK_IMG: Record<string, string> = {
  eat: 'cafe-desserts',
  market: 'flower-market',
  muay: 'muay-thai',
  cook: 'cooking-class',
  river: 'cycling-park',
  temple: 'wat-arun-temple',
  games: 'cafe-desserts',
}

/** Map a UI HostPlaceKind to the 5 allowed Postgres `kr6_activities.place_kind` values. */
export function toDbPlaceKind(kind?: HostPlaceKind | string): DbActivityRow['place_kind'] {
  if (kind === 'station') return 'station'
  if (kind === 'pier') return 'pier'
  if (kind === 'park') return 'park'
  if (kind === 'venue' || kind === 'partner_venue') return 'partner_venue'
  return 'public_square'
}

/** Map a UI category (`games` etc.) to the allowed Postgres `kr6_activities.category` values. */
export function toDbCategory(cat: string): string {
  if (['eat', 'market', 'temple', 'muay', 'cook', 'river'].includes(cat)) return cat
  return 'eat'
}

/** Convert Monday-first boolean[7] (`Mon=0..Sun=6`) to Postgres SMALLINT[] (`0=Sun..6=Sat`). */
export function toDbDays(days: boolean[]): number[] {
  const out: number[] = []
  for (let i = 0; i < 7; i++) {
    if (days[i]) out.push((i + 1) % 7)
  }
  return out.length ? out : [5, 6, 0]
}

/** Normalize Postgres `TIME[]` strings (`"18:00:00"` -> `"18:00"`). */
export function normalizeStartTimes(times?: string[] | null): string[] {
  if (!Array.isArray(times) || !times.length) return ['18:00']
  return times.map((t) => String(t).slice(0, 5)).filter((t) => /^\d{2}:\d{2}$/.test(t))
}

/** Pure mapper: join `kr6_activities` (`status='live'`), verified `kr6_profiles` (`id_verified=true`), and real `kr6_reviews`. */
export function mapLiveActivities(
  activities: DbActivityRow[],
  hosts: DbVerifiedHostRow[],
  reviews: DbReviewRow[] = [],
  bookingToActivity: Record<string, string> = {},
): Act[] {
  const verifiedHosts = new Map<string, DbVerifiedHostRow>()
  for (const h of hosts) {
    if (h && h.id_verified === true && h.is_host === true && !h.away) {
      verifiedHosts.set(h.user_id, h)
    }
  }

  const ratingsByAct = new Map<string, { sum: number; count: number }>()
  for (const r of reviews) {
    const actId = r.activity_id || bookingToActivity[r.booking_id]
    if (!actId || typeof r.stars !== 'number' || r.stars < 1 || r.stars > 5) continue
    const cur = ratingsByAct.get(actId) || { sum: 0, count: 0 }
    cur.sum += r.stars
    cur.count += 1
    ratingsByAct.set(actId, cur)
  }

  const out: Act[] = []
  for (const row of activities) {
    if (!row || row.status !== 'live' || !row.approved_at) continue
    const host = verifiedHosts.get(row.host_id)
    if (!host) continue

    const revAgg = ratingsByAct.get(row.id)
    const revCount = revAgg ? revAgg.count : 0
    const avgRating = revCount > 0 ? Math.round((revAgg!.sum / revCount) * 10) / 10 : 0
    const slots = normalizeStartTimes(row.start_times)
    const knownPlace = [...HOST_PLACES, ...PARTNER_VENUES].find(
      (p) => p.th === row.place_name || p.en === row.place_name,
    )
    const langs = Array.isArray(host.languages) && host.languages.length
      ? host.languages.map((l) => l.toUpperCase())
      : ['TH', 'EN']

    out.push({
      id: row.id,
      cat: row.category || 'eat',
      th: row.title,
      titleEn: row.title,
      img: CAT_FALLBACK_IMG[row.category] || 'cafe-desserts',
      host: host.display_name,
      hostTh: host.display_name,
      f: 0,
      price: row.is_volunteer ? 0 : Math.max(0, Number(row.price_thb) || 0),
      street: 0,
      h: Math.max(1, Math.round(((Number(row.duration_min) || 90) / 60) * 10) / 10),
      rating: avgRating,
      rev: revCount,
      place: knownPlace ? knownPlace.en : row.place_name,
      placeTh: knownPlace ? knownPlace.th : row.place_name,
      langs,
      isVolunteer: !!row.is_volunteer || Number(row.price_thb) === 0,
      bringFriendFirst3: !!(row.bring_friend_first_3 ?? host.bring_friend_first_3),
      slots,
      liveArea: knownPlace ? knownPlace.area.split(' · ')[0] : 'Bangkok',
      liveAreaTh: knownPlace ? knownPlace.areaTh.split(' · ')[0] : 'กรุงเทพฯ',
      liveStartTime: slots[0] || '18:00',
      liveSpotsLeft: 2,
      meetLat: Number(row.meet_lat) || 13.75,
      meetLng: Number(row.meet_lng) || 100.52,
      hostPhotoUrl: host.photo_url || undefined,
    })
  }
  return out
}

let loadedOnce = false
let loadingPromise: Promise<Act[]> | null = null

/** Load published activities of verified hosts from `kr6_activities` + `kr6_profiles` + `kr6_reviews` into `ACTS`. */
export async function loadLiveActivities(force = false): Promise<Act[]> {
  if (!configured() || !URL_ || !ANON) return ACTS
  if (loadedOnce && !force) return ACTS
  if (loadingPromise && !force) return loadingPromise

  loadingPromise = (async () => {
    try {
      const headers: Record<string, string> = {
        apikey: ANON,
        Authorization: `Bearer ${accessToken() || ANON}`,
      }
      const actRes = await fetch(
        `${URL_}/rest/v1/kr6_activities?select=id,host_id,title,category,place_name,place_kind,meet_lat,meet_lng,duration_min,price_thb,partner_fee_thb,start_times,days,status,approved_at,is_volunteer,bring_friend_first_3&status=eq.live&approved_at=not.is.null&order=approved_at.desc`,
        { headers },
      )
      if (!actRes.ok) return ACTS
      const actRows = ((await actRes.json()) || []) as DbActivityRow[]
      if (!actRows.length) {
        ACTS.splice(0, ACTS.length)
        loadedOnce = true
        update()
        return ACTS
      }

      const hostIds = [...new Set(actRows.map((r) => r.host_id).filter(Boolean))]
      const profRes = await fetch(
        `${URL_}/rest/v1/kr6_profiles?select=user_id,display_name,lang,is_host,host_level,id_verified,photo_url,languages,bio,away,bring_friend_first_3,created_at&id_verified=eq.true&is_host=eq.true&user_id=in.(${hostIds.join(',')})`,
        { headers },
      )
      const hostRows = profRes.ok ? (((await profRes.json()) || []) as DbVerifiedHostRow[]) : []

      const revRes = await fetch(
        `${URL_}/rest/v1/kr6_reviews?select=booking_id,stars,tags,host_reply,visible_at,created_at`,
        { headers },
      )
      const revRows = revRes.ok ? (((await revRes.json()) || []) as DbReviewRow[]) : []

      const liveActs = mapLiveActivities(actRows, hostRows, revRows)
      ACTS.splice(0, ACTS.length, ...liveActs)
      loadedOnce = true
      update()
      return ACTS
    } catch {
      return ACTS
    } finally {
      loadingPromise = null
    }
  })()

  return loadingPromise
}

export interface SubmitHostActivityInput {
  title: string
  category: string
  placeTh: string
  placeEn: string
  placeKind?: HostPlaceKind | string
  meetLat?: number
  meetLng?: number
  durationHours: number
  priceThb: number
  startTimes: string[]
  days: boolean[]
  isVolunteer: boolean
  bringFriendFirst3: boolean
}

export interface SubmitHostActivityResult {
  ok: boolean
  status: 'review'
  id?: string
  error?: string
}

/** Build the exact row payload written to `public.kr6_activities` when a host submits an activity.
    Note: status is always `'review'` (pending staff review, not live until approved). */
export function buildHostActivityInsertPayload(
  input: SubmitHostActivityInput,
  hostId: string,
): Record<string, unknown> {
  const durationMin = Math.max(60, Math.min(480, Math.round((Number(input.durationHours) || 1.5) * 60)))
  const isVol = !!input.isVolunteer || Number(input.priceThb) === 0
  const priceThb = isVol ? 0 : Math.max(200, Math.min(3000, Math.round(Number(input.priceThb) || 800)))
  const startTimes = normalizeStartTimes(input.startTimes).slice(0, 8)
  const dbDays = toDbDays(input.days)

  return {
    host_id: hostId,
    title: input.title.trim(),
    category: toDbCategory(input.category),
    place_name: (input.placeTh || input.placeEn || '').trim(),
    place_kind: toDbPlaceKind(input.placeKind),
    meet_lat: Number.isFinite(input.meetLat) ? input.meetLat : 13.75,
    meet_lng: Number.isFinite(input.meetLng) ? input.meetLng : 100.52,
    duration_min: durationMin,
    price_thb: priceThb,
    start_times: startTimes,
    days: dbDays,
    status: 'review',
    is_volunteer: isVol,
    bring_friend_first_3: !!input.bringFriendFirst3,
  }
}

/** Submit a host's newly created activity to `public.kr6_activities` with status `'review'` (pending approval). */
export async function submitHostActivityForReview(
  input: SubmitHostActivityInput,
): Promise<SubmitHostActivityResult> {
  const uid = getUserId()
  if (!isLive() || !URL_ || !ANON || !uid) {
    return { ok: true, status: 'review' }
  }

  try {
    if (!S.prof.isHost) {
      await becomeHost().catch(() => undefined)
    }
    const payload = buildHostActivityInsertPayload(input, uid)
    const r = await fetch(
      `${URL_}/rest/v1/kr6_activities?select=id,status,approved_at`,
      {
        method: 'POST',
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${accessToken()}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(payload),
      },
    )
    if (!r.ok) {
      const err = (await r.json().catch(() => ({}))) as { message?: string; code?: string }
      return { ok: false, status: 'review', error: String(err.message || err.code || r.status) }
    }
    const rows = ((await r.json().catch(() => [])) || []) as { id?: string; status?: string }[]
    const first = rows[0]
    return {
      ok: true,
      status: 'review',
      id: first?.id,
    }
  } catch (e) {
    return { ok: false, status: 'review', error: e instanceof Error ? e.message : String(e) }
  }
}
