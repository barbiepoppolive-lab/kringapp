import { describe, expect, it } from 'vitest'
import { COINS_PER_BAHT, formatBaht, formatBahtValue, formatCashPromo, formatPromo, toBaht, toCoins } from './money'

describe('K5 · money display helpers (baht only, ledger stays in coins)', () => {
  it('converts coins ↔ baht without float noise', () => {
    expect(COINS_PER_BAHT).toBe(100)
    expect(toBaht(123_450)).toBe(1234.5)
    expect(toBaht(1)).toBe(0.01)
    expect(toCoins(12.34)).toBe(1234)
    expect(toBaht(Number.NaN)).toBe(0)
  })

  it('formats coins as baht: whole baht plain, satang only when present', () => {
    expect(formatBaht(100_000)).toBe('฿1,000')
    expect(formatBaht(123_450)).toBe('฿1,234.50')
    expect(formatBaht(100_000, { decimals: true })).toBe('฿1,000.00')
    expect(formatBaht(123_456, { decimals: false })).toBe('฿1,235')
    expect(formatBaht(0)).toBe('฿0')
  })

  it('signs, compacts and drops the symbol on request', () => {
    expect(formatBahtValue(500, { signed: true })).toBe('+฿500')
    expect(formatBahtValue(-1200)).toBe('−฿1,200')
    expect(formatBahtValue(9400, { compact: true })).toBe('฿9.4k')
    expect(formatBahtValue(1_250_000, { compact: true })).toBe('฿1.3M')
    expect(formatBahtValue(999, { compact: true })).toBe('฿999')
    expect(formatBahtValue(42, { symbol: false })).toBe('42')
  })

  it('writes the wallet line "฿cash · ฿promo" with no coins anywhere', () => {
    expect(formatPromo(80_000)).toBe('฿800 promo')
    const line = formatCashPromo(20_000, 80_000)
    expect(line).toBe('฿200 cash · ฿800 promo')
    expect(line).not.toMatch(/coin|🪙/i)
  })
})
