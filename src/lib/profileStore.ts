/** UX-P8 · Local profile from the step-by-step onboarding (no backend yet; a real profile row is a stop-point). */
import type { HostType } from '../components/meet/MeetFeed'

export type Gender = 'woman' | 'man' | 'nonbinary' | 'na'
export interface ChonProfile {
  v: 1
  name: string
  gender: Gender
  referralCode?: string
  prefs: HostType[]
  city: 'Bangkok' | 'Pattaya'
  arrival?: string
  district?: string
  langs: string[]
  photo?: string
  emergency?: string
  notifications: boolean
  sounds: boolean
  completedAt: string
}
export const PROFILE_KEY = 'chon_profile_v1'

export function readProfile(): ChonProfile | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as ChonProfile
    return p && p.v === 1 ? p : null
  } catch {
    return null
  }
}
export function writeProfile(p: ChonProfile): void {
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
    window.dispatchEvent(new CustomEvent('chon:profile-updated', { detail: p }))
  } catch {
    // ignore
  }
}

/**
 * Fix #1 (Opus Spec): True ONLY when the signed-in traveller's own profile identifies as a woman ('woman').
 * Hidden for 'man', 'nonbinary', 'na', or unset profiles.
 */
export function isFemaleTravellerProfile(profile?: ChonProfile | null): boolean {
  const p = profile !== undefined ? profile : readProfile()
  return p?.gender === 'woman'
}

export function setProfileGender(gender: Gender): ChonProfile {
  const existing = readProfile()
  const next: ChonProfile = existing
    ? { ...existing, gender }
    : {
        v: 1,
        name: '',
        gender,
        prefs: ['food', 'cafe'],
        city: 'Bangkok',
        langs: ['en'],
        notifications: true,
        sounds: true,
        completedAt: new Date().toISOString(),
      }
  writeProfile(next)
  return next
}
/** Presets by account type: a LINE host account and a Google traveller account start from different defaults, all editable. */
export function presetFor(role: string, provider: string, displayName?: string): Omit<ChonProfile, 'completedAt'> {
  const host = role === 'host' || provider === 'line'
  return {
    v: 1,
    name: displayName ?? '',
    gender: host ? 'woman' : 'man',
    prefs: host ? ['food', 'cafe'] : ['food', 'rooftop'],
    city: 'Bangkok',
    arrival: host ? undefined : 'tonight',
    district: host ? 'Thonglor' : undefined,
    langs: host ? ['th', 'en'] : ['en'],
    notifications: true,
    sounds: true,
  }
}

/* ------------------------------------------------------------------------------------------------------------------
 * KRING VISUAL V2 · profile photos (≤ 6). The first photo is the MAIN one and is mirrored into `ChonProfile.photo`
 * (header / cards / chats read that). Each photo keeps its own light + crop (zoom, focus) — "Edit" changes those, the
 * original pixels stay. Stored per device; a real upload to storage is a backend stop-point (TODO Argon).
 * ---------------------------------------------------------------------------------------------------------------- */
export const PHOTOS_KEY = 'kring_profile_photos_v1'
export const PHOTOS_EVENT = 'kring:profile-photos'
export const MAX_PHOTOS = 6

export interface ProfilePhoto {
  id: string
  /** data: URL (downscaled JPEG) or a remote URL */
  src: string
  /** brightness, 0.7–1.4 (1 = as taken) */
  light: number
  /** zoom for the crop, 1–2 */
  zoom: number
  /** focus point for the crop, 0–100 % */
  x: number
  y: number
}

function newId(): string {
  return `ph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function readPhotos(): ProfilePhoto[] {
  try {
    const raw = window.localStorage.getItem(PHOTOS_KEY)
    const v = raw ? (JSON.parse(raw) as unknown) : null
    if (Array.isArray(v)) return (v as ProfilePhoto[]).filter((p) => p && typeof p.src === 'string').slice(0, MAX_PHOTOS)
    // first run: adopt the onboarding photo as the main one
    const one = readProfile()?.photo
    return one ? [{ id: 'ph-main', src: one, light: 1, zoom: 1, x: 50, y: 50 }] : []
  } catch {
    return []
  }
}

/** Save the list (≤ 6); the first is the main photo and becomes `profile.photo`. Returns false if storage is full. */
export function writePhotos(list: ProfilePhoto[]): boolean {
  const next = list.slice(0, MAX_PHOTOS)
  try {
    window.localStorage.setItem(PHOTOS_KEY, JSON.stringify(next))
  } catch {
    return false
  }
  const p = readProfile()
  const main = next[0]?.src
  if (p && p.photo !== main) writeProfile({ ...p, photo: main })
  window.dispatchEvent(new CustomEvent(PHOTOS_EVENT, { detail: next }))
  return true
}

export function addPhoto(src: string): ProfilePhoto[] | null {
  const cur = readPhotos()
  if (cur.length >= MAX_PHOTOS) return null
  const next = [...cur, { id: newId(), src, light: 1, zoom: 1, x: 50, y: 50 }]
  return writePhotos(next) ? next : null
}
export function updatePhoto(id: string, patch: Partial<Omit<ProfilePhoto, 'id' | 'src'>>): ProfilePhoto[] {
  const next = readPhotos().map((p) => (p.id === id ? { ...p, ...patch } : p))
  writePhotos(next)
  return next
}
export function makeMainPhoto(id: string): ProfilePhoto[] {
  const cur = readPhotos()
  const hit = cur.find((p) => p.id === id)
  if (!hit) return cur
  const next = [hit, ...cur.filter((p) => p.id !== id)]
  writePhotos(next)
  return next
}
export function removePhoto(id: string): ProfilePhoto[] {
  const next = readPhotos().filter((p) => p.id !== id)
  writePhotos(next)
  return next
}

/** CSS for a photo's light + crop (object-position + scale; pixels untouched). */
export function photoStyle(p: Pick<ProfilePhoto, 'light' | 'zoom' | 'x' | 'y'>): { filter?: string; transform?: string; objectPosition: string; transformOrigin: string } {
  return {
    filter: p.light !== 1 ? `brightness(${p.light})` : undefined,
    transform: p.zoom !== 1 ? `scale(${p.zoom})` : undefined,
    objectPosition: `${p.x}% ${p.y}%`,
    transformOrigin: `${p.x}% ${p.y}%`,
  }
}

/** Read a picked file, downscale to ≤ 900 px JPEG so six fit in local storage. */
export function fileToPhotoSrc(file: File, max = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error('read'))
    r.onload = () => {
      const url = String(r.result)
      const img = new Image()
      img.onerror = () => resolve(url)
      img.onload = () => {
        try {
          const k = Math.min(1, max / Math.max(img.width, img.height))
          const c = document.createElement('canvas')
          c.width = Math.round(img.width * k)
          c.height = Math.round(img.height * k)
          const ctx = c.getContext('2d')
          if (!ctx) return resolve(url)
          ctx.drawImage(img, 0, 0, c.width, c.height)
          resolve(c.toDataURL('image/jpeg', 0.82))
        } catch {
          resolve(url)
        }
      }
      img.src = url
    }
    r.readAsDataURL(file)
  })
}

