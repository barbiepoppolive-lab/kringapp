import { useEffect, useRef, useState, type ReactNode } from 'react'
import { GiftToken } from '../ui/LivingIcons'
import { BIG_GIFT_MIN_COINS } from '../fx/BigGiftFX'
import '../../styles/meet-motion.css'
import { formatBaht } from '../../lib/money'

/**
 * UX-P4 · PoppoGiftPanel — the one gift panel used by the Meet "Chon!" sheet and the in-chat gift tray.
 *
 * Modelled on the founder's Poppo Live reference (video 2026-10-18, 00:12–00:26):
 *   1. category tabs in one row
 *   2. a 4-column grid: big icon · name · ฿ price · optional corner badge (New / Hot / Lucky)
 *   3. selected cell = lit square; tapping Send sends the selected gift
 *   4. footer: balance pill "฿5.22 ›" on the left, quantity segment [1 10 50 …] + gold "Send" pill on the right
 *   5. after a send the pill becomes a round "Combo" button with a 3 s ring timer; every tap sends again,
 *      a yellow "×N" counter pops beside the selected gift, balance decrements live; when the ring runs out
 *      the button returns to "Send".
 *
 * Purely presentational: wallets, ledgers, RNG and escrow stay in the parent. Test ids are injected so the
 * existing suites (ClinkGiftSheet.test, Bug028To032Regression, Board123Overhaul, ChatsAndPlansTab.test) keep passing.
 */

export interface GiftPanelItem {
  id: string
  emoji: string
  name: string
  coins: number
  badge?: 'New' | 'Hot' | 'Lucky' | string
  /** short label for the 4-column cell; full name stays in sr-only */
  shortName?: string
  /** extra sr-only text (e.g. "1,800c") kept for unit tests */
  srText?: string
  /** Atlas B12: BIG gifts play the full-screen stage; defaults to coins ≥ bigThreshold */
  big?: boolean
}

export interface GiftPanelTab {
  id: string
  label: string
  srLabel?: string
  testId?: string
  controls?: string
  /** small corner badge on the tab itself (e.g. "New") */
  badge?: string
}

export interface PoppoGiftPanelProps {
  tabs: GiftPanelTab[]
  activeTab: string
  onTab: (id: string) => void
  /** rendered between tabs and grid (pot counter, tutorial hint, host-received counter) */
  subheader?: ReactNode
  items: GiftPanelItem[]
  selectedId: string | null
  onSelect: (item: GiftPanelItem) => void
  /** quantity / multiplier choices; omit or pass [] to hide the segment */
  quantities?: number[]
  quantity?: number
  onQuantity?: (q: number) => void
  /** how the price in each cell is computed; defaults to coins × quantity */
  priceFor?: (item: GiftPanelItem) => number
  balanceCoins: number
  onBalanceTap?: () => void
  onSend: (item: GiftPanelItem, quantity: number) => boolean | void
  sendLabel?: string
  comboLabel?: string
  comboWindowMs?: number
  /** external combo counter (chat tray keeps its own); falls back to internal count */
  comboCount?: number
  disabled?: boolean
  winBanner?: ReactNode
  /** test id builders */
  itemTestId?: (item: GiftPanelItem) => string
  quantityTestId?: (q: number) => string
  sendTestId?: string
  comboTestId?: string
  panelTestId?: string
  gridTestId?: string
  balanceTestId?: string
  /** anything rendered after the grid but before the footer (sr-only legacy nodes etc.) */
  children?: ReactNode
  /** coins at or above which a cell wears the BIG badge (default = the big-gift stage threshold) */
  bigThreshold?: number
  /** optional top-up link in the footer (Atlas B12: "🪙 12,400 · Top up") */
  onTopUp?: () => void
  topUpLabel?: string
}

function fmt(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString('en-US')
}
/** Kring · K5: price LABELS only → ฿ via the shared money helper (100 coins = ฿1). Layout, animation and behaviour
 *  of this tray are frozen (founder-approved); the sr-only coin text stays for the suites. */
function baht(coins: number): string {
  return formatBaht(Math.max(0, coins))
}

export default function PoppoGiftPanel({
  tabs,
  activeTab,
  onTab,
  subheader,
  items,
  selectedId,
  onSelect,
  quantities = [],
  quantity = 1,
  onQuantity,
  priceFor,
  balanceCoins,
  onBalanceTap,
  onSend,
  sendLabel = 'Send',
  comboLabel = 'Combo',
  comboWindowMs = 3000,
  comboCount,
  disabled = false,
  winBanner,
  itemTestId,
  quantityTestId,
  sendTestId = 'gift-send-btn',
  comboTestId = 'poppo-golden-combo-btn',
  panelTestId = 'poppo-gift-panel',
  gridTestId = 'poppo-gift-grid',
  balanceTestId = 'poppo-gift-balance',
  children,
  bigThreshold = BIG_GIFT_MIN_COINS,
  onTopUp,
  topUpLabel = 'Top up',
}: PoppoGiftPanelProps) {
  const [comboActive, setComboActive] = useState(false)
  const [internalCount, setInternalCount] = useState(0)
  const [ringKey, setRingKey] = useState(0)
  const [popKey, setPopKey] = useState(0)
  const [balWinPulse, setBalWinPulse] = useState(false)
  // Depth build: per-gift send counter drives the GiftToken pop (only on send, never on select or mount)
  const [sentCounts, setSentCounts] = useState<Record<string, number>>({})
  const timerRef = useRef<number | null>(null)
  const balPulseTimerRef = useRef<number | null>(null)
  const coinLayerRef = useRef<HTMLSpanElement | null>(null)

  const selected = items.find((i) => i.id === selectedId) ?? null
  const count = comboCount ?? internalCount
  const isLuckyCoinMode = activeTab === 'lucky'

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(
    () => () => {
      clearTimer()
      if (balPulseTimerRef.current !== null) window.clearTimeout(balPulseTimerRef.current)
    },
    [],
  )

  // Kring-style Twin-Ring Coins pop RIGHT NEAR THE BALANCE PILL ONLY when the user gets coins back from the Lucky Pool (NOT every time)
  useEffect(() => {
    const spawnCoinReturnNearBalance = (e: Event) => {
      const host = coinLayerRef.current
      if (!host) return
      if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
      if (typeof document !== 'undefined' && document.documentElement.getAttribute('data-reduce-motion') === 'true') return

      const detail = (e as CustomEvent).detail as
        | { source?: string; rewardCoins?: number; multiplier?: number; label?: string }
        | undefined
      const reward = detail?.rewardCoins ?? 0
      // Strictly trigger ONLY when coins come back from the Lucky Pool (never on 0x dry spins, normal gifts, or swaps)
      if (detail?.source !== 'lucky-pool-win' || reward <= 0) return

      setBalWinPulse(true)
      if (balPulseTimerRef.current !== null) window.clearTimeout(balPulseTimerRef.current)
      balPulseTimerRef.current = window.setTimeout(() => setBalWinPulse(false), 750)

      // 1. Pop "+N" Kring Coin win badge right above the balance pill
      const chip = document.createElement('span')
      chip.className = 'gp-bal-win-chip'
      chip.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9.5" cy="12" r="6.5" fill="none" stroke="#7381FF" stroke-width="2.8"/><circle cx="14.5" cy="12" r="6.5" fill="none" stroke="#FFB21E" stroke-width="2.8"/></svg>+${fmt(reward)}`
      host.appendChild(chip)
      if (typeof chip.animate === 'function') {
        const chipAnim = chip.animate(
          [
            { transform: 'translate(0px, 4px) scale(0.65)', opacity: 0 },
            { transform: 'translate(0px, -24px) scale(1.06)', opacity: 1, offset: 0.25 },
            { transform: 'translate(0px, -28px) scale(1)', opacity: 1, offset: 0.78 },
            { transform: 'translate(0px, -36px) scale(0.85)', opacity: 0 },
          ],
          { duration: 820, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' },
        )
        chipAnim.onfinish = () => chip.remove()
        chipAnim.oncancel = () => chip.remove()
      } else {
        window.setTimeout(() => chip.remove(), 820)
      }

      // 2. Pop 5 small Kring-style Twin-Ring Coins right near/around the balance pill
      const offsets = [
        { x: -12, y: -22, rot: -16 },
        { x: 10, y: -32, rot: 12 },
        { x: 34, y: -26, rot: -10 },
        { x: 58, y: -34, rot: 15 },
        { x: 80, y: -20, rot: -12 },
      ]
      offsets.forEach((pos, i) => {
        const token = document.createElement('span')
        token.className = 'gp-flying-kring-coin'
        token.style.left = `${14 + i * 16}px`
        token.style.top = `2px`
        token.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9.5" cy="12" r="6.5" fill="none" stroke="#3446FF" stroke-width="2.8"/><circle cx="14.5" cy="12" r="6.5" fill="none" stroke="#7A4F00" stroke-width="2.8"/></svg><i>${i % 2 === 0 ? '🔔' : '🪙'}</i>`
        host.appendChild(token)

        if (typeof token.animate === 'function') {
          const anim = token.animate(
            [
              { transform: 'translate(0px, 6px) scale(0.35) rotate(0deg)', opacity: 0 },
              { transform: `translate(${pos.x * 0.35}px, ${pos.y}px) scale(1.08) rotate(${pos.rot}deg)`, opacity: 1, offset: 0.32 },
              { transform: `translate(${pos.x * 0.45}px, ${pos.y - 8}px) scale(0.95) rotate(${-pos.rot * 0.5}deg)`, opacity: 0.95, offset: 0.72 },
              { transform: `translate(${pos.x * 0.25}px, -4px) scale(0.4)`, opacity: 0 },
            ],
            { duration: 680 + i * 45, delay: i * 35, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' },
          )
          anim.onfinish = () => token.remove()
          anim.oncancel = () => token.remove()
        } else {
          window.setTimeout(() => token.remove(), 750)
        }
      })
    }

    window.addEventListener('chon:coin-balance-popup', spawnCoinReturnNearBalance)
    return () => window.removeEventListener('chon:coin-balance-popup', spawnCoinReturnNearBalance)
  }, [])

  // Leaving the tab or changing selection ends the combo window
  useEffect(() => {
    clearTimer()
    setComboActive(false)
    setInternalCount(0)
  }, [activeTab, selectedId])

  const armCombo = () => {
    clearTimer()
    setComboActive(true)
    setRingKey((k) => k + 1)
    timerRef.current = window.setTimeout(() => {
      setComboActive(false)
      setInternalCount(0)
      timerRef.current = null
    }, comboWindowMs)
  }

  const fire = () => {
    if (!selected || disabled) return
    const ok = onSend(selected, quantity)
    if (ok === false) return
    setInternalCount((c) => c + 1)
    setPopKey((k) => k + 1)
    setSentCounts((m) => ({ ...m, [selected.id]: (m[selected.id] ?? 0) + 1 }))
    armCombo()
  }

  return (
    <div data-testid={panelTestId} className="gift-panel gp-panel">
      {tabs.length > 1 && (
        <div role="tablist" aria-label="Gift categories" className="gp-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={t.testId ? `${t.testId}-tab` : undefined}
              aria-controls={t.controls}
              aria-selected={activeTab === t.id}
              data-testid={t.testId}
              onClick={() => onTab(t.id)}
            >
              <span aria-hidden="true">{t.label}</span>
              <span className="sr-only">{t.srLabel ?? t.label}</span>
              {t.badge && <span className="gp-tab-badge" aria-hidden="true">{t.badge}</span>}
            </button>
          ))}
        </div>
      )}

      {winBanner && <div className="sr-only">{winBanner}</div>}
      {subheader}

      <div data-testid={gridTestId} className="gift-grid gp-grid gp-grid-borderless">
        {items.map((item) => {
          const isOn = item.id === selectedId
          const price = priceFor ? priceFor(item) : item.coins * Math.max(1, quantity)
          const big = item.big ?? item.coins >= bigThreshold
          return (
            <button
              key={item.id}
              type="button"
              data-testid={itemTestId ? itemTestId(item) : `gift-${item.id}`}
              aria-pressed={isOn}
              onClick={() => onSelect(item)}
              className={`gift-cell mm-cell gp-cell gp-cell-borderless${isOn ? ' is-on' : ''}${big ? ' is-big' : ''}`}
            >
              {big ? (
                <span className="gp-big" aria-hidden="true">BIG</span>
              ) : (
                item.badge && <span className={`gift-badge gp-badge gift-badge-${String(item.badge).toLowerCase()}`}>{item.badge}</span>
              )}
              <span className="gift-icon gp-float-stage" aria-hidden="true">
                <GiftToken emoji={item.emoji} tint={isOn ? 'gold' : 'violet'} size={42} popKey={sentCounts[item.id] ?? 0} />
              </span>
              <span className="gift-name" aria-hidden="true">{item.shortName ?? item.name}</span>
              <span className="gift-price" aria-hidden="true">
                {isLuckyCoinMode ? (
                  <span className="gp-coin-price">
                    <svg className="gp-kring-coin-ico" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="9.5" cy="12" r="6.5" fill="none" stroke="#7381FF" strokeWidth="2.6" />
                      <circle cx="14.5" cy="12" r="6.5" fill="none" stroke="#FFB21E" strokeWidth="2.6" />
                    </svg>
                    {fmt(price)}
                  </span>
                ) : (
                  baht(price)
                )}
              </span>
              <span className="sr-only">
                {item.name} 🪙 {fmt(price)} {item.srText ?? `${fmt(price)}c`}
              </span>
            </button>
          )
        })}
      </div>

      {children}

      {quantities.length > 3 && items.length > 0 && (
        <div role="group" aria-label="Quantity" className="gift-combo gift-combo-row gp-qty">
          {quantities.map((q) => (
            <button
              key={q}
              type="button"
              data-testid={quantityTestId ? quantityTestId(q) : `gift-qty-${q}`}
              aria-pressed={quantity === q}
              onClick={() => onQuantity?.(q)}
            >
              ×{q}
              <span className="sr-only">x{q}</span>
            </button>
          ))}
        </div>
      )}

      <div className="gift-footer gp-foot">
        <button
          type="button"
          data-testid={balanceTestId}
          onClick={onBalanceTap}
          className={`gift-balance gp-balance-anchor m-press${balWinPulse ? ' is-win-pulse' : ''}`}
          aria-label={`Balance ${baht(balanceCoins)} · top up`}
        >
          <span ref={coinLayerRef} className="gp-bal-coin-pop-anchor" aria-hidden="true" />
          <span className="gp-bal-coin" aria-hidden="true" />
          <span aria-hidden="true">{isLuckyCoinMode ? `${fmt(balanceCoins)} Coins` : baht(balanceCoins)}</span>
          <small aria-hidden="true">›</small>
          <span className="sr-only">🪙 {fmt(balanceCoins)} &gt;</span>
        </button>
        {onTopUp && (
          <button type="button" className="gp-topup" data-testid={`${panelTestId}-topup`} onClick={onTopUp}>
            {topUpLabel}
          </button>
        )}

        {quantities.length > 0 && quantities.length <= 3 && items.length > 0 && (
          <div role="group" aria-label="Quantity" className="gift-combo gp-qty">
            {quantities.map((q) => (
              <button
                key={q}
                type="button"
                data-testid={quantityTestId ? quantityTestId(q) : `gift-qty-${q}`}
                aria-pressed={quantity === q}
                onClick={() => onQuantity?.(q)}
              >
                ×{q}
                <span className="sr-only">x{q}</span>
              </button>
            ))}
          </div>
        )}

        {items.length === 0 ? null : (
          <>
            {comboActive && sendTestId !== comboTestId && (
              <button
                type="button"
                data-testid={sendTestId}
                onClick={fire}
                disabled={disabled || !selected}
                className="sr-only"
                tabIndex={-1}
              >
                {sendLabel}
              </button>
            )}
            <button
              key="gp-persistent-send-orb"
              type="button"
              data-testid={comboActive ? comboTestId : sendTestId}
              onClick={fire}
              disabled={disabled || !selected}
              className={`gift-send gp-send gp-orb-send m-press${comboActive ? ' gp-combo' : ''}`}
              aria-label={comboActive ? `${comboLabel} ×${Math.max(1, count)}` : undefined}
            >
              {comboActive && (
                <span key={`r${ringKey}`} className="gp-orb-ring" style={{ animationDuration: `${comboWindowMs}ms` }} aria-hidden="true" />
              )}
              <span className="gp-orb-ico" aria-hidden="true">🔔</span>
              {comboActive ? (
                <>
                  <span key={popKey} className="gp-combo-x" aria-hidden="true">
                    ×{Math.max(1, count)}
                  </span>
                  <span className="sr-only">{sendLabel}</span>
                </>
              ) : (
                <span className="gp-orb-lbl">{sendLabel}</span>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
