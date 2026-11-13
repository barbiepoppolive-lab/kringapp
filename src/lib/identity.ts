/**
 * KRING FIX1 · cross-cutting truth 3 — real names everywhere.
 *
 * The signed-in person's name comes from their profile (onboarding step 0) first, then the session's displayName —
 * but never a placeholder such as "Demo Traveler", "Traveller" or "Local". Share links are built from that name
 * (kring.app/@ploy), never "@demo".
 */
import { readProfile } from './profileStore'

const AUTH_KEY = 'chon_auth_session_v1'

/** Placeholder account names that must never be shown as a person's name. */
const GENERIC = /^(demo|apple|google|line|kring)?\s*(traveler|traveller|tourist|explorer|local|host|agency|user|guest|account)?$/i

export function isGenericName(name?: string | null): boolean {
  const n = (name ?? '').trim()
  return !n || GENERIC.test(n) || /^demo\b/i.test(n)
}

function sessionName(): string {
  try {
    const raw = window.localStorage.getItem(AUTH_KEY) ?? window.sessionStorage.getItem(AUTH_KEY)
    const s = raw ? (JSON.parse(raw) as { displayName?: string }) : null
    return (s?.displayName ?? '').trim()
  } catch {
    return ''
  }
}

/** The signed-in person's real first-name-first display name, or '' when we genuinely don't know it yet. */
export function myDisplayName(): string {
  let profile = ''
  try {
    profile = (readProfile()?.name ?? '').trim()
  } catch {
    profile = ''
  }
  if (!isGenericName(profile)) return profile
  const s = sessionName()
  return isGenericName(s) ? '' : s
}

/**
 * A name fit to print on screen. `self` = this is the signed-in person (fall back to their profile name, then
 * "You"/"คุณ"); for anyone else a placeholder becomes "Your guest"/"แขกของคุณ" or "Your local"/"โลคอลของคุณ".
 */
export function shownName(name: string | undefined | null, opts: { self?: boolean; th?: boolean; role?: 'guest' | 'local' } = {}): string {
  const n = (name ?? '').trim()
  if (opts.self) {
    const me = myDisplayName()
    if (me) return me
    if (!isGenericName(n)) return n
    return opts.th ? 'คุณ' : 'You'
  }
  if (!isGenericName(n)) return n
  if (opts.role === 'local') return opts.th ? 'โลคอลของคุณ' : 'Your local'
  return opts.th ? 'แขกของคุณ' : 'Your guest'
}

/* KRING FIX2 · Ploy: a Thai handle in a URL breaks in LINE (kring.app/@พลอย) — romanise it the way Thai nicknames are
   usually written (พลอย → ploy, ขวัญ → kwan, มิ้นท์ → min). Approximate on purpose: it only has to be a readable, ASCII,
   stable handle. */
const TH_INITIAL: Record<string, string> = {
  ก: 'k', ข: 'k', ฃ: 'k', ค: 'k', ฅ: 'k', ฆ: 'k', ง: 'ng', จ: 'j', ฉ: 'ch', ช: 'ch', ซ: 's', ฌ: 'ch', ญ: 'y', ฎ: 'd', ฏ: 't',
  ฐ: 't', ฑ: 't', ฒ: 't', ณ: 'n', ด: 'd', ต: 't', ถ: 't', ท: 't', ธ: 't', น: 'n', บ: 'b', ป: 'p', ผ: 'p', ฝ: 'f', พ: 'p',
  ฟ: 'f', ภ: 'p', ม: 'm', ย: 'y', ร: 'r', ฤ: 'rue', ล: 'l', ฦ: 'lue', ว: 'w', ศ: 's', ษ: 's', ส: 's', ห: 'h', ฬ: 'l', อ: 'o', ฮ: 'h',
}
const TH_FINAL: Record<string, string> = { ญ: 'n', ณ: 'n', ร: 'n', ล: 'n', ฬ: 'n', ด: 't', ต: 't', ท: 't', ธ: 't', ถ: 't', จ: 't', ช: 't', ซ: 't', ศ: 't', ษ: 't', ส: 't', บ: 'p', ป: 'p', พ: 'p', ภ: 'p', ฟ: 'p', ก: 'k', ข: 'k', ค: 'k', ฆ: 'k' }
const TH_VOWEL: Record<string, string> = { 'ะ': 'a', 'ั': 'a', 'า': 'a', 'ำ': 'am', 'ิ': 'i', 'ี': 'i', 'ึ': 'ue', 'ื': 'ue', 'ุ': 'u', 'ู': 'u', 'เ': 'e', 'แ': 'ae', 'โ': 'o', 'ใ': 'ai', 'ไ': 'ai' }
const TH_LEADING = new Set(['เ', 'แ', 'โ', 'ใ', 'ไ'])

function romaniseThai(word: string): string {
  // drop silent letters (a consonant carrying ์) and tone / repeat marks
  const chars = [...word.replace(/[\u0E00-\u0E7F]\u0E4C/g, '').replace(/[\u0E47-\u0E4B\u0E4D\u0E46]/g, '')]
  // leading vowels are written before the consonant they follow in speech
  for (let i = 0; i < chars.length - 1; i++) {
    if (TH_LEADING.has(chars[i]) && TH_INITIAL[chars[i + 1]]) {
      ;[chars[i], chars[i + 1]] = [chars[i + 1], chars[i]]
      i++
    }
  }
  return chars
    .map((c, i) => {
      if (c === 'อ' && TH_VOWEL[chars[i + 1]]) return '' // a silent carrier before a vowel (เอ → e)
      if (i === chars.length - 1 && i > 0 && TH_FINAL[c]) return TH_FINAL[c]
      return TH_INITIAL[c] ?? TH_VOWEL[c] ?? (/[a-z0-9_.]/i.test(c) ? c : '')
    })
    .join('')
}

/** 'Ploy Srisuk' → 'ploy' · 'พลอย' → 'ploy' (ASCII only — Thai paths break in LINE) · '' → '' */
export function handleFromName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? ''
  return romaniseThai(first.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''))
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 24)
}

/** kringapp.com/@<handle> from the signed-in person's real name ('' handle → kringapp.com, no fake @demo). */
export function myShareLink(): string {
  const h = handleFromName(myDisplayName())
  return h ? `kringapp.com/@${h}` : 'kringapp.com'
}
