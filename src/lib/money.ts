// K5 · Kring money display helpers.
// The ledger stays in coins internally (100 coins = ฿1, so 1 coin = ฿0.01).
// Everything the user LOOKS at is baht. These helpers are display-only: they never
// mutate balances, never mint, never round a ledger amount that is written back.

export const COINS_PER_BAHT = 100
export const BAHT = '฿'

export type BahtFormatOptions = {
  /** true → always 2 decimals; false → never; 'auto' (default) → 2 only when there are satang. */
  decimals?: boolean | 'auto'
  /** '+' prefix for positive values (ledger rows, earnings deltas). */
  signed?: boolean
  /** Compact large values: ฿12.4k, ฿1.2M (stat tiles, roster). */
  compact?: boolean
  /** Omit the ฿ symbol (e.g. when the symbol is rendered separately at a smaller size). */
  symbol?: boolean
}

function safe(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(v) ? v : 0
}

/** Coins → baht as a number (2-decimal precision, no float noise). */
export function toBaht(coins: number): number {
  return Math.round(safe(coins)) / COINS_PER_BAHT
}

/** Baht → coins (integer) — for converting user-typed baht into ledger units. */
export function toCoins(baht: number): number {
  return Math.round(safe(baht) * COINS_PER_BAHT)
}

/** Format a baht amount (already in baht). */
export function formatBahtValue(baht: number, opts: BahtFormatOptions = {}): string {
  const v = safe(baht)
  const abs = Math.abs(v)
  const sign = v < 0 ? '−' : opts.signed && v > 0 ? '+' : ''
  const sym = opts.symbol === false ? '' : BAHT
  if (opts.compact && abs >= 1000) {
    const [div, suf] = abs >= 1_000_000 ? [1_000_000, 'M'] : [1000, 'k']
    const q = abs / div
    const s = q >= 100 ? Math.round(q).toString() : (Math.round(q * 10) / 10).toString()
    return sign + sym + s + suf
  }
  const hasSatang = Math.round(abs * 100) % 100 !== 0
  const d = opts.decimals === true ? 2 : opts.decimals === false ? 0 : hasSatang ? 2 : 0
  const body = abs.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  return sign + sym + body
}

/** Format a ledger amount in coins as baht: formatBaht(123450) → "฿1,234.50". */
export function formatBaht(coins: number, opts: BahtFormatOptions = {}): string {
  // Back-compat with the stub: { decimals: false } (or omitted) used to mean "whole baht".
  const decimals = opts.decimals === undefined ? 'auto' : opts.decimals
  return formatBahtValue(toBaht(coins), { ...opts, decimals })
}

/** Promo balance label, e.g. "฿40 promo". */
export function formatPromo(coins: number): string {
  return `${formatBaht(coins)} promo`
}

/** "฿cash · ฿promo" line under the big wallet balance. */
export function formatCashPromo(cashCoins: number, promoCoins: number): string {
  return `${formatBaht(cashCoins)} cash · ${formatPromo(promoCoins)}`
}
