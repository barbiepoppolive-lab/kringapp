import type { ChangeEvent } from 'react'

/**
 * UX-P5 · Founder rule 1 — editable venue everywhere.
 * One text input that accepts any public venue name OR a pasted Google Maps share link,
 * a visible "🗺️ Google Maps ↗" button beside it, an editable time, optional quick-fill pills,
 * and the public-venue guard message. Test ids are injected so existing suites keep passing.
 */

// Host is anchored: `google.evil.io/maps` must NOT pass. Accepts maps.app.goo.gl, goo.gl/maps, g.co/kgs,
// google.com/maps, maps.google.com, google.co.th/maps, google.de/maps …
export const GOOGLE_MAPS_LINK_RE =
  /^(?:https?:\/\/)?(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|(?:www\.|maps\.)?google\.(?:com|co\.[a-z]{2}|[a-z]{2})\/maps)(?:[/?#]|$)/i

/** Hostname of a pasted link, for display ("maps.app.goo.gl") — never hides the real target */
export function linkHost(value: string): string {
  try {
    return new URL(value.trim().startsWith('http') ? value.trim() : `https://${value.trim()}`).hostname
  } catch {
    return ''
  }
}

export function isGoogleMapsLink(value: string): boolean {
  return GOOGLE_MAPS_LINK_RE.test(value.trim())
}

export function googleMapsSearchUrl(query: string): string {
  const q = query.trim()
  if (isGoogleMapsLink(q)) return q.startsWith('http') ? q : `https://${q}`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q || 'night market Bangkok')}`
}

/** Display label for a value that may be a Maps link */
export function venueDisplayLabel(value: string): string {
  return isGoogleMapsLink(value) ? `📍 Maps pin · ${linkHost(value)}` : value
}

export interface VenueFieldProps {
  value: string
  onChange: (next: string) => void
  time?: string
  onTimeChange?: (next: string) => void
  placeholder?: string
  timePlaceholder?: string
  inputId: string
  inputTestId: string
  timeInputId?: string
  timeTestId?: string
  mapsTestId?: string
  quickFills?: string[]
  quickFillTestIdPrefix?: string
  isPublic?: (value: string) => boolean
  language?: string
  compact?: boolean
}

export default function VenueField({
  value,
  onChange,
  time,
  onTimeChange,
  placeholder,
  timePlaceholder = '20:30',
  inputId,
  inputTestId,
  timeInputId,
  timeTestId,
  mapsTestId = 'open-google-maps-search-btn',
  quickFills = [],
  quickFillTestIdPrefix,
  isPublic,
  language = 'en',
  compact = false,
}: VenueFieldProps) {
  const blocked = isPublic ? value.trim().length > 0 && !isPublic(value) : false
  const showTime = typeof time === 'string' && typeof onTimeChange === 'function'
  return (
    <div className="flex flex-col gap-1.5" data-testid={`${inputTestId}-field`}>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          id={inputId}
          name={inputId}
          data-testid={inputTestId}
          value={value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          onFocus={(e) => {
            // Overnight U1/360 suggestion: keep the field and its quick-fill pills above a tall software keyboard
            try {
              const r = e.currentTarget.getBoundingClientRect()
              const vh = window.visualViewport?.height ?? window.innerHeight
              // only a really visible field (not a collapsed sr-only twin) may scroll, and never sideways
              if (r.width > 40 && r.bottom > vh * 0.6) e.currentTarget.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
            } catch {
              // jsdom / old WebView without scrollIntoView options
            }
          }}
          placeholder={
            placeholder ??
            (language === 'th'
              ? 'พิมพ์ชื่อร้าน หรือวางลิงก์ Google Maps'
              : language === 'zh'
                ? '输入场所名或粘贴 Google 地图链接'
                : 'Type any public venue or paste a Google Maps link')
          }
          aria-label="Venue name or Google Maps link"
          autoComplete="off"
          className="ux-input"
          style={{ flex: 1, minWidth: 0, height: compact ? 40 : 44, minHeight: compact ? 40 : 44 }}
        />
        {showTime && (
          <input
            type="text"
            id={timeInputId ?? `${inputId}-time`}
            name={timeInputId ?? `${inputId}-time`}
            data-testid={timeTestId ?? `${inputTestId}-time`}
            value={time}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onTimeChange?.(e.target.value)}
            placeholder={timePlaceholder}
            aria-label="Time"
            inputMode="text"
            pattern="[0-9]{1,2}[:.][0-9]{2}"
            className="ux-input tabular-nums"
            style={{ width: 84, flex: 'none', textAlign: 'center', height: compact ? 40 : 44, minHeight: compact ? 40 : 44 }}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <a
          href={googleMapsSearchUrl(value)}
          target="_blank"
          rel="noreferrer"
          data-testid={mapsTestId}
          className="ux-pill ux-pill-line m-press"
          style={{ textDecoration: 'none' }}
        >
          <span aria-hidden="true">🗺️ Google Maps ↗</span>
          <span className="sr-only">📍 ▾ Maps {value}</span>
        </a>
        {isGoogleMapsLink(value) && <span className="ux-chip ux-chip-green">📍 {linkHost(value)} OK</span>}
        {quickFills.map((spot) => (
          <button
            key={spot}
            type="button"
            data-testid={quickFillTestIdPrefix ? `${quickFillTestIdPrefix}-${spot.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined}
            onClick={() => onChange(spot)}
            aria-pressed={value === spot}
            className={`ux-pill m-press${value === spot ? ' ux-pill-on' : ''}`}
            style={{ height: 32, minHeight: 32, fontSize: 12.5 }}
          >
            {spot}
          </button>
        ))}
      </div>
      {blocked && (
        <p role="alert" className="ux-meta" style={{ color: 'var(--danger-text)' }}>
          {language === 'th'
            ? '🛡️ นัดได้เฉพาะสถานที่สาธารณะหรือธุรกิจที่มีใบอนุญาต (ร้านอาหาร คาเฟ่ ตลาด สปา) ห้องพัก/คอนโดไม่ได้'
            : '🛡️ Public venues or licensed businesses only (restaurants, cafés, markets, licensed spas). Private rooms, condos and hotel rooms are not allowed.'}
        </p>
      )}
    </div>
  )
}
