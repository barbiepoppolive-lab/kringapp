import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { prefersReducedMotion } from '../../design/motion'
import { triggerHaptic } from '../../lib/haptics'
import { t, type Lang } from '../../lib/lexicon'

/**
 * KRING VISUAL V2 · header parts (owner V1). The header itself lives in App.tsx:
 *   two-ring logo (no wordmark) · ฿ balance pill · gift.  On Me: no logo, no gift — the pill grows into the Kring card.
 *
 * The gift opens the rewards sheet (V4: rewardsModel.openRewards / useRewardsReady); the pill ↔ Me card morph is V4's
 * pillMorph.ts, which measures the pill by [data-kr-pill] (the pill stays mounted, hidden, on Me).
 */

const TIP_KEY = 'kring_gift_tip_v1'

const GiftIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3.5" y="8" width="17" height="4" rx="1.3" />
    <rect x="5" y="12" width="14" height="8" rx="1.5" />
    <path d="M12 8v12M12 8C10 4 6.5 4 6.5 6.2S9.5 8 12 8zm0 0c2-4 5.5-4 5.5-1.8S14.5 8 12 8z" />
  </svg>
)

/**
 * The header gift (P3 "Promo entry = B"): the gold dot shows ONLY when something is ready to claim; the very first
 * time, one small wiggle and a one-line tip "Rewards live here · 1 ready" — never again. Tap → the rewards sheet.
 */
export function HeaderGift({ language, ready, onOpen }: { language: Lang; ready: number; onOpen: () => void }) {
  const [tip, setTip] = useState(false)
  const [wiggle, setWiggle] = useState(false)
  useEffect(() => {
    if (ready <= 0) return
    let seen = true
    try {
      seen = localStorage.getItem(TIP_KEY) === '1'
    } catch {
      seen = true
    }
    if (seen) return
    try {
      localStorage.setItem(TIP_KEY, '1')
    } catch {
      /* ignore */
    }
    setTip(true)
    if (!prefersReducedMotion()) setWiggle(true)
    const a = window.setTimeout(() => setWiggle(false), 950)
    const b = window.setTimeout(() => setTip(false), 5200)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
  }, [ready])
  const open = () => {
    triggerHaptic('tap')
    setTip(false)
    onOpen()
  }
  return (
    <span className="kh-gift" style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className={`kh-ib${wiggle ? ' is-wiggle' : ''}`}
        data-testid="header-gift"
        aria-label={ready > 0 ? `${t('rewards.open', 'en')} · ${ready} ready` : t('rewards.open', 'en')}
        onClick={open}
        style={{ width: 'auto', padding: '0 10px', gap: '5px', display: 'inline-flex', alignItems: 'center' }}
      >
        <GiftIcon />
        <span aria-hidden="true" style={{ fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}>
          {language === 'th' ? 'รางวัล' : 'Rewards'}
        </span>
        {ready > 0 && <span className="kh-nd" aria-hidden="true" />}
      </button>
      {tip && (
        <button type="button" className="kh-tip" onClick={open} lang={language === 'th' ? 'th' : undefined}>
          {t('rewards.tip', language, { n: String(ready) })}
        </button>
      )}
    </span>
  )
}

/** The ฿ pill's menu: cash (pays bookings) · promo (gifts & extras) · held — always separate — and Top up. */
export function BalanceMenu({
  anchor,
  language,
  cash,
  promo,
  held,
  onTopUp,
  onClose,
}: {
  anchor: HTMLElement | null
  language: Lang
  cash: string
  promo: string
  held: string
  onTopUp: () => void
  onClose: () => void
}) {
  const r = anchor?.getBoundingClientRect()
  const top = r ? Math.round(r.bottom + 6) : 60
  const right = r ? Math.max(8, Math.round(window.innerWidth - r.right)) : 10
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const L = language
  return createPortal(
    <>
      <div className="kh-menu-scrim" onClick={onClose} aria-hidden="true" />
      <div className="kh-menu" role="dialog" aria-label={t('bal.title', 'en')} data-testid="header-balance-menu" style={{ top, right }}>
        <div className="kh-menu-hd">{t('bal.title', L)}</div>
        <div className="kh-menu-row">{t('bal.cash', L)}<b>{cash}</b></div>
        <div className="kh-menu-row">{t('bal.promo', L)}<b className="is-promo">{promo}</b></div>
        <div className="kh-menu-row">{t('bal.held', L)}<b className="is-held">{held}</b></div>
        <p className="kh-menu-note">{t('bal.note', L)}</p>
        <button type="button" className="kh-menu-go" data-testid="header-balance-topup" onClick={onTopUp}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          {t('bal.topup', L)}
        </button>
      </div>
    </>,
    document.body,
  )
}

