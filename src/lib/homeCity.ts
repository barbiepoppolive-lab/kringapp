import { useSyncExternalStore } from 'react'
import { getCity, CITY_EVENT, CITY_KEY, type City } from './experiences'

/**
 * KRING T3 · home city — "everyone is a traveller somewhere".
 *
 * The selected city (`useCity`, kring_city_v1) is where you are browsing. The HOME city is where you live; it is only
 * used to know when you are away (the shell then shows "You're in Pattaya · locals here"). Never a mode.
 *
 *   const home = getHomeCity()            // 'bangkok' | 'pattaya' | null (unknown → never "away")
 *   setHomeCity('pattaya')                // Me › profile › Home city writes this
 *   const { away, here, home } = useAwayFromHome()
 *
 * Stored in localStorage `kring_home_city_v1`; falls back to the onboarding profile's city (chon_profile_v1.city).
 * Every change fires `kring:home-city` { city } on window.
 */
export const HOME_CITY_KEY = 'kring_home_city_v1'
export const HOME_CITY_EVENT = 'kring:home-city'

function asCity(v: unknown): City | null {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  if (s === 'bangkok' || s === 'bkk' || s === 'กรุงเทพ' || s === 'กรุงเทพฯ') return 'bangkok'
  if (s === 'pattaya' || s === 'พัทยา') return 'pattaya'
  return null
}

export function getHomeCity(): City | null {
  try {
    const v = asCity(window.localStorage.getItem(HOME_CITY_KEY))
    if (v) return v
    const p = JSON.parse(window.localStorage.getItem('chon_profile_v1') ?? 'null') as { city?: string } | null
    return asCity(p?.city)
  } catch {
    return null
  }
}

export function setHomeCity(city: City): void {
  try {
    window.localStorage.setItem(HOME_CITY_KEY, city)
  } catch {
    // storage blocked
  }
  try {
    window.dispatchEvent(new CustomEvent(HOME_CITY_EVENT, { detail: { city } }))
  } catch {
    // ignore
  }
}

function subscribe(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === HOME_CITY_KEY || e.key === CITY_KEY || e.key === 'chon_profile_v1') fn()
  }
  window.addEventListener(HOME_CITY_EVENT, fn)
  window.addEventListener(CITY_EVENT, fn)
  window.addEventListener('chon:profile-updated', fn)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(HOME_CITY_EVENT, fn)
    window.removeEventListener(CITY_EVENT, fn)
    window.removeEventListener('chon:profile-updated', fn)
    window.removeEventListener('storage', onStorage)
  }
}

export function useHomeCity(): [City | null, (c: City) => void] {
  const c = useSyncExternalStore(subscribe, getHomeCity, () => null)
  return [c, setHomeCity]
}

/** away = the selected city is known to differ from the home city (no home city → never away) */
export function awayFromHome(here: City = getCity(), home: City | null = getHomeCity()): boolean {
  return home != null && here !== home
}

const snap = () => `${getCity()}|${getHomeCity() ?? ''}`
export function useAwayFromHome(): { away: boolean; here: City; home: City | null } {
  const key = useSyncExternalStore(subscribe, snap, () => 'bangkok|')
  const [here, homeRaw] = key.split('|') as [City, string]
  const home = (homeRaw || null) as City | null
  return { away: awayFromHome(here, home), here, home }
}
