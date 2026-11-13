/* "Add Kring to your Home Screen" hint.
   - Never on a first visit: shown only after the traveller's first booking.
   - Never inside the iOS/Android app or an already-installed web app.
   - Only on the tab screens, sitting just above the tab bar; the screen's scroll area gets extra room so nothing hides under it.
     Never on screens with a bottom action bar (Continue, Request to book, Pay, chat composer).
   - Closing it (44×44 ×) is remembered on this phone. No store badges or cross-promotion.
   - Chrome/Android: one tap opens the browser's own install prompt. iOS Safari: one line on how to add it. */
import { useEffect, useState } from 'react'
import { useS } from '../core/store'
import { t } from '../core/data'
import { currentScreen } from '../core/router'
import { tick } from '../core/sound'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const KEY = 'kring-pwa-hint-closed'
/** Screens with the bottom tab bar and no action bar of their own. */
const SAFE = new Set(['experiences', 'locals', 'tours', 'vouchers', 'me'])
const H = 64 // banner height
const ABOVE_TABS = 14 + 66 + 8 // tab bar bottom + height + gap

function readClosed(): boolean { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
function writeClosed(): void { try { localStorage.setItem(KEY, '1') } catch { /* private mode: closed for this session only */ } }

/** Inside the native app shell, or already installed: never show. */
function inApp(): boolean {
  try {
    const w = window as unknown as { Capacitor?: unknown; ReactNativeWebView?: unknown; webkit?: { messageHandlers?: unknown } }
    if (w.Capacitor || w.ReactNativeWebView) return true
    if (/KringApp/i.test(navigator.userAgent)) return true
    if ((navigator as unknown as { standalone?: boolean }).standalone) return true
    if (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches) return true
  } catch { /* ignore */ }
  return false
}
const isIos = (): boolean => { try { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) } catch { return false } }

export function InstallPwaBanner() {
  const s = useS() // re-render on screen changes and bookings
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [closed, setClosed] = useState<boolean>(readClosed)
  const [installed, setInstalled] = useState<boolean>(inApp)

  useEffect(() => {
    const onBip = (e: Event) => { e.preventDefault(); setPrompt(e as BeforeInstallPromptEvent) }
    const onInstalled = () => { setInstalled(true); setPrompt(null) }
    window.addEventListener('beforeinstallprompt', onBip)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onBip); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  const scr = currentScreen() || ''
  const ios = isIos()
  const show = !closed && !installed && s.bookings.length > 0 && SAFE.has(scr) && (!!prompt || ios)

  // reserve room so the last card / button can scroll clear of the banner
  useEffect(() => {
    const root = document.documentElement
    if (show) root.setAttribute('data-pwa-hint', '1'); else root.removeAttribute('data-pwa-hint')
    return () => root.removeAttribute('data-pwa-hint')
  }, [show])

  if (!show) return null

  const close = () => { writeClosed(); setClosed(true); tick(0.4, 0.05) }
  const install = async () => {
    tick(0.75, 0.06)
    if (!prompt) return
    try {
      await prompt.prompt()
      const c = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' as const }))
      if (c.outcome === 'accepted') setInstalled(true)
    } catch { /* ignore */ }
    setPrompt(null)
  }

  return (
    <>
      <style>{`html[data-pwa-hint] .kr .pane,html[data-pwa-hint] .kr .cscroll,html[data-pwa-hint] .kr .scroll,html[data-pwa-hint] .kr .vlist{padding-bottom:${ABOVE_TABS + H + 40}px!important}`}</style>
      <div
        id="pwa-install-banner"
        role="region"
        aria-label={t('pwaTitle')}
        style={{
          position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: `calc(${ABOVE_TABS}px + env(safe-area-inset-bottom, 0px))`,
          width: 'min(calc(100vw - 28px), 452px)', minHeight: H, zIndex: 45, boxSizing: 'border-box',
          background: 'rgba(11, 14, 26, 0.96)', border: '1px solid rgba(115, 129, 255, 0.38)', borderRadius: 18,
          padding: '8px 4px 8px 12px', boxShadow: '0 10px 28px rgba(0, 0, 0, 0.55)', color: '#F5F6FA',
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 9, flex: 'none', background: 'linear-gradient(135deg, #3446FF, #FFB21E)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13, color: '#05060D' }}>K</span>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <b style={{ fontSize: 13.5, lineHeight: 1.25 }}>{t('pwaTitle')}</b>
          <span style={{ fontSize: 12, color: '#B4B9D6', lineHeight: 1.3 }}>{prompt ? t('pwaSub') : t('pwaIos')}</span>
        </span>
        {prompt && (
          <button type="button" id="pwa-install-btn" onClick={() => void install()}
            style={{ flex: 'none', minHeight: 44, padding: '0 14px', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, #FFB21E, #FFD067)', color: '#05060D', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            {t('pwaAdd')}
          </button>
        )}
        <button type="button" id="pwa-dismiss-btn" aria-label={t('pwaClose')} onClick={close}
          style={{ flex: 'none', width: 44, height: 44, display: 'grid', placeItems: 'center', background: 'transparent', border: 'none', color: '#C9CDE6', fontSize: 22, lineHeight: 1, cursor: 'pointer', borderRadius: 12 }}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </>
  )
}

export default InstallPwaBanner
