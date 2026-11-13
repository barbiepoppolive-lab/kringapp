import { useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { triggerHaptic } from '../../lib/haptics'
import { t as lex } from '../../lib/lexicon'
import { CITIES, GROUPS, useCity, type City, type ExperienceGroupId } from '../../lib/experiences'
import './experiences.css'

/**
 * KRING VISUAL V2 · "Find a local" — the Locals filter sheet (P3 · Locals filter B, founder-approved).
 *
 *   City · Who (Any · Woman · Man · Trans woman — never the word "local", never a dating framing; the choice is never
 *   shown to locals) · Speaks (languages, not countries) · Age (bands, not exact ages) · Interests (emojis) ·
 *   Live now · Verified only (on by default) · Area — then Reset and a gold "Show N locals" that counts live.
 *
 * The sheet edits a draft; "Show N locals" applies it. `countFor(draft)` gives the live count.
 * Pure helpers below (`matchesLocalsFilter`, `localsFilterCount`) keep the filter logic testable and in one place.
 */
export type LocalsWho = 'any' | 'w' | 'm' | 'tw'
export interface LocalsFilter {
  who: LocalsWho
  speaks: string[]
  /** decade bands: 20 · 30 · 40 · 50 (= 50+) */
  ages: number[]
  groups: ExperienceGroupId[]
  live: boolean
  verified: boolean
  /** area labels (English) as shown on the local's profile */
  areas: string[]
}
export const LOCALS_FILTER_DEFAULT: LocalsFilter = { who: 'any', speaks: [], ages: [], groups: [], live: false, verified: true, areas: [] }

/** a local as the filter sees them */
export interface FilterableLocal {
  gender?: 'women' | 'men' | 'ladyboy'
  age?: number
  langs: string[]
  groups: ExperienceGroupId[]
  live: boolean
  verified: boolean
  area: string
}

export const SPEAKS: ReadonlyArray<{ id: string; label: string; match: string[] }> = [
  { id: 'en', label: 'English', match: ['english'] },
  { id: 'zh', label: '中文', match: ['中文', 'chinese', 'mandarin'] },
  { id: 'ja', label: '日本語', match: ['日本語', 'japanese'] },
  { id: 'ko', label: '한국어', match: ['한국어', 'korean'] },
  { id: 'ru', label: 'Русский', match: ['русский', 'russian'] },
  { id: 'de', label: 'Deutsch', match: ['deutsch', 'german'] },
  { id: 'fr', label: 'Français', match: ['français', 'french'] },
]
const WHO_GENDER: Record<Exclude<LocalsWho, 'any'>, FilterableLocal['gender']> = { w: 'women', m: 'men', tw: 'ladyboy' }

export function matchesLocalsFilter(f: LocalsFilter, l: FilterableLocal): boolean {
  if (f.who !== 'any' && l.gender !== WHO_GENDER[f.who]) return false
  if (f.speaks.length) {
    const langs = l.langs.map((x) => x.toLowerCase())
    const ok = f.speaks.some((id) => SPEAKS.find((s) => s.id === id)?.match.some((m) => langs.includes(m.toLowerCase())))
    if (!ok) return false
  }
  if (f.ages.length) {
    if (!l.age) return false
    const band = l.age >= 50 ? 50 : Math.floor(l.age / 10) * 10
    if (!f.ages.includes(band)) return false
  }
  if (f.groups.length && !f.groups.some((g) => l.groups.includes(g))) return false
  if (f.live && !l.live) return false
  if (f.verified && !l.verified) return false
  if (f.areas.length && !f.areas.includes(l.area)) return false
  return true
}

/** how many filters differ from the defaults (the number on the floating filter button) */
export function localsFilterCount(f: LocalsFilter): number {
  return (
    (f.who !== 'any' ? 1 : 0) +
    f.speaks.length +
    f.ages.length +
    f.groups.length +
    (f.live ? 1 : 0) +
    (f.verified !== LOCALS_FILTER_DEFAULT.verified ? 1 : 0) +
    f.areas.length
  )
}

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

export interface LocalsFilterSheetProps {
  open: boolean
  value: LocalsFilter
  language?: string
  /** area chips for the current city: [english label, thai label] */
  areas: Array<{ en: string; th: string }>
  /** live count for a draft (in the current city) */
  countFor: (f: LocalsFilter) => number
  onApply: (f: LocalsFilter) => void
  onClose: () => void
}

export default function LocalsFilterSheet({ open, value, language = 'en', areas, countFor, onApply, onClose }: LocalsFilterSheetProps) {
  const th = language === 'th'
  const [d, setD] = useState<LocalsFilter>(value)
  const [city, setCity] = useCity()
  const set = (patch: Partial<LocalsFilter>) => {
    triggerHaptic('select')
    setD((x) => ({ ...x, ...patch }))
  }
  if (!open) return null
  const n = countFor(d)
  const who: Array<[LocalsWho, string]> = [
    ['any', lex('who.any', language)],
    ['w', lex('who.woman', language)],
    ['m', lex('who.man', language)],
    ['tw', lex('who.transwoman', language)],
  ]
  const chip = (on: boolean, label: string, onClick: () => void, testId?: string, aria?: string) => (
    <button key={testId ?? label} type="button" aria-pressed={on} aria-label={aria} data-testid={testId} className="kf-press" onClick={onClick}>
      {label}
    </button>
  )
  return (
    <Sheet
      open
      onClose={onClose}
      initialDetent="92%"
      testId="locals-filter-sheet"
      ariaLabel={th ? 'หาโลคอล' : 'Find a local'}
      title={th ? 'หาโลคอล' : 'Find a local'}
      footer={
        <div className="kx-lf-foot">
          <button type="button" className="kx-lf-reset kf-press" data-testid="locals-filter-reset" onClick={() => set({ ...LOCALS_FILTER_DEFAULT })}>
            {th ? 'ล้าง' : 'Reset'}
          </button>
          <button
            type="button"
            className="kx-cta kf-press"
            data-testid="locals-filter-show"
            disabled={n === 0}
            onClick={() => {
              triggerHaptic('success')
              onApply(d)
            }}
          >
            {n === 0 ? (th ? 'ไม่มีโลคอลที่ตรง' : 'No locals match') : th ? `ดูโลคอล ${n} คน` : `Show ${n} local${n === 1 ? '' : 's'}`}
          </button>
        </div>
      }
    >
      <div className="kx-lf">
        <p className="kx-slab">{th ? 'เมือง' : 'City'}</p>
        <div className="kx-city" role="radiogroup" aria-label={th ? 'เมือง' : 'City'} data-on={city}>
          <span className="kx-city-thumb" aria-hidden="true" />
          {CITIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={city === c.id}
              data-testid={`locals-city-${c.id}`}
              onClick={() => {
                if (c.id === city) return
                triggerHaptic('select')
                setCity(c.id as City)
                setD((x) => ({ ...x, areas: [] }))
              }}
            >
              {th ? c.th : c.en}
            </button>
          ))}
        </div>

        <p className="kx-slab">{lex('who.title', language)}</p>
        <div className="kx-lf-chips" role="group" aria-label={th ? 'ใคร' : 'Who'}>
          {who.map(([id, label]) => chip(d.who === id, label, () => set({ who: id }), `locals-who-${id}`))}
        </div>
        <p className="kx-lf-hint">
          {th
            ? 'นักเดินทางหญิงหลายคนสบายใจกับโลคอลผู้หญิงมากกว่า ตัวเลือกนี้ไม่แสดงให้โลคอลเห็น'
            : 'Many solo women travellers prefer a woman. Your choice is never shown to locals.'}
        </p>

        <p className="kx-slab">{th ? 'พูดภาษา' : 'Speaks'}</p>
        <div className="kx-lf-chips" role="group" aria-label={th ? 'พูดภาษา' : 'Speaks'}>
          {SPEAKS.map((s) => chip(d.speaks.includes(s.id), s.label, () => set({ speaks: toggle(d.speaks, s.id) }), `locals-speaks-${s.id}`))}
        </div>

        <p className="kx-slab">{th ? 'อายุ' : 'Age'}</p>
        <div className="kx-lf-chips" role="group" aria-label={th ? 'อายุ' : 'Age'}>
          {[20, 30, 40, 50].map((a) => chip(d.ages.includes(a), a === 50 ? '50+' : `${a}s`, () => set({ ages: toggle(d.ages, a) }), `locals-age-${a}`))}
        </div>

        <p className="kx-slab">{th ? 'ความสนใจ' : 'Interests'}</p>
        <div className="kx-lf-chips is-emo" role="group" aria-label={th ? 'ความสนใจ' : 'Interests'}>
          {GROUPS.filter((g) => !g.pattayaOnly || city === 'pattaya').map((g) =>
            chip(d.groups.includes(g.id), g.emoji, () => set({ groups: toggle(d.groups, g.id) }), `locals-interest-${g.id}`, th ? g.th : g.en),
          )}
        </div>

        <div className="kx-lf-row">
          <span>
            {th ? 'ออนไลน์อยู่' : 'Live now'}
            <small>{th ? 'เจอได้วันนี้' : 'Can meet today'}</small>
          </span>
          <button type="button" role="switch" className="kx-sw" aria-checked={d.live} aria-label={th ? 'เฉพาะที่ออนไลน์' : 'Live now only'} data-testid="locals-live-switch" onClick={() => set({ live: !d.live })} />
        </div>
        <div className="kx-lf-row">
          <span>
            {th ? 'ยืนยันตัวตนแล้วเท่านั้น' : 'Verified only'}
            <small>{th ? 'กริ๊งตรวจบัตรแล้ว' : 'ID checked by Kring'}</small>
          </span>
          <button type="button" role="switch" className="kx-sw" aria-checked={d.verified} aria-label={th ? 'เฉพาะที่ยืนยันตัวตน' : 'Verified only'} data-testid="locals-verified-switch" onClick={() => set({ verified: !d.verified })} />
        </div>

        {areas.length > 0 && (
          <>
            <p className="kx-slab">{th ? 'ย่าน' : 'Area'}</p>
            <div className="kx-lf-chips" role="group" aria-label={th ? 'ย่าน' : 'Area'}>
              {areas.map((a) => chip(d.areas.includes(a.en), th ? a.th : a.en, () => set({ areas: toggle(d.areas, a.en) })))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}
