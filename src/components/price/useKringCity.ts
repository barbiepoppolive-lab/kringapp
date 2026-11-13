import type { KringCity } from './priceData'
import { CITY_EVENT, CITY_KEY, getCity, useCity } from '../../lib/experiences'

/**
 * K4 · the Bangkok · Pattaya switch — integration: ONE app-wide city store, owned by `lib/experiences.ts`
 * (`useCity`). Experiences and Kring Price read and write the same value, key `kring_city_v1`, event `kring:city`
 * with detail `{ city }`. These names stay as thin aliases so K4's code and tests keep working.
 */
export const KRING_CITY_KEY = CITY_KEY
export const KRING_CITY_EVENT = CITY_EVENT

export function readKringCity(): KringCity {
  return getCity()
}

export function useKringCity(): [KringCity, (c: KringCity) => void] {
  return useCity()
}
