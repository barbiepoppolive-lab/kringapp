/**
 * OPUS-A6: Persisted "🌙 Tonight Mode" theme.
 *
 * Before this module the toggle in ⚙️ Settings only flipped `html.tonight-mode` in memory, so a reload,
 * PWA relaunch or tab switch on iOS silently reverted to Daylight and the `<meta name="theme-color">`
 * (status bar / PWA chrome) never followed the page. All storage access is wrapped — Safari private
 * mode and the vitest jsdom environment both throw or return nothing here.
 */

export type ChonThemeMode = 'daylight' | 'tonight'

export const THEME_STORAGE_KEY = 'chon_theme_v1'
export const TONIGHT_CLASS = 'tonight-mode'

const THEME_COLOR: Record<ChonThemeMode, string> = {
  daylight: '#FFFFFF',
  tonight: '#08090A',
}

export function readStoredTheme(): ChonThemeMode | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    return raw === 'tonight' || raw === 'daylight' ? raw : null
  } catch {
    return null
  }
}

export function getActiveTheme(): ChonThemeMode {
  if (typeof document === 'undefined') return 'tonight'
  return document.documentElement.classList.contains(TONIGHT_CLASS) ? 'tonight' : 'daylight'
}

/** Applies the theme to <html>, the PWA theme-color meta and (optionally) persists it. */
export function applyTheme(mode: ChonThemeMode, persist = true): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle(TONIGHT_CLASS, mode === 'tonight')
  document.documentElement.style.colorScheme = mode === 'tonight' ? 'dark' : 'light'
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = THEME_COLOR[mode]
  if (!persist) return
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // Private mode / quota — the in-memory class is still applied.
  }
}

/** Call once before the first React render so the default Tonight Velvet (or stored) theme paints immediately. */
export function bootstrapTheme(): ChonThemeMode {
  // UX-P7 · founder decision D4: dark (Tonight) only at launch. Stored 'daylight' is ignored until month 2.
  const DARK_ONLY_LAUNCH = true
  const stored = DARK_ONLY_LAUNCH ? null : readStoredTheme()
  const mode: ChonThemeMode = stored ?? 'tonight'
  applyTheme(mode, false)
  return mode
}
