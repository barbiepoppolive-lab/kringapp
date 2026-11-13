import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import BkkPulseTab from '../components/pulse/BkkPulseTab'
import { FLOOR_PRICES, PLAN_ADDON_THB, floorForAffiliate } from '../components/pulse/floorPrices'
import { AFFILIATE_DEALS } from '../components/pulse/AffiliateTripleStackSection'
import {
  KRING_PRICE_ITEMS,
  PRICE_RULES,
  guessKind,
  heroFor,
  itemsIn,
  parseAmount,
  rangeLabel,
  ruleFor,
  saveOf,
  showsTouristGap,
  gaugeAngleForTimes,
  timesLabel,
  verdictFor,
} from '../components/price/priceData'
import { KRING_CITY_KEY } from '../components/price/useKringCity'
import { BANNED_WORDS } from '../lib/lexicon'
import { recordTripSaving, tripSavedTotal } from '../lib/tripSavings'

/** K4 · Kring Price (was BKK Pulse): data honesty, Price Check verdicts, city switch, savings, "?" sheet. */

beforeEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('Kring Price data · honest by design', () => {
  it('every tourist price has a real, dated source and is above the Kring price', () => {
    for (const i of KRING_PRICE_ITEMS) {
      expect(i.touristSource.url, i.id).toMatch(/^https:\/\//)
      expect(i.touristSource.published, i.id).toMatch(/^\d{4}-\d{2}(-\d{2})?$/)
      expect(i.touristSource.checked, i.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(i.touristThb, i.id).toBeGreaterThan(i.kringThb)
      expect(saveOf(i)).toBe(i.touristThb - i.kringThb)
    }
    for (const r of PRICE_RULES) {
      expect(r.sources.length, r.id).toBeGreaterThan(0)
      r.sources.forEach((s) => expect(s.url).toMatch(/^https:\/\//))
    }
  })

  it('"cheapest elsewhere" and the Kring price come from the one floor table (same numbers as the trip savings)', () => {
    const car = KRING_PRICE_ITEMS.find((i) => i.id === 'airport-car')!
    expect(car.kringThb).toBe(FLOOR_PRICES['cab:airport'].oursThb)
    expect(car.elsewhere?.thb).toBe(FLOOR_PRICES['cab:airport'].floorThb)
    const esim = KRING_PRICE_ITEMS.find((i) => i.id === 'tourist-esim')!
    expect(esim.kringThb).toBe(FLOOR_PRICES['esim:8d'].oursThb)
  })

  it('each city has its own hero and rows', () => {
    expect(heroFor('bangkok').id).toBe('airport-car')
    expect(heroFor('pattaya').id).toBe('bangkok-pattaya-car')
    expect(itemsIn('pattaya').every((i) => i.cities.includes('pattaya'))).toBe(true)
    expect(itemsIn('bangkok')[0].id).toBe('airport-car')
  })
})

describe('Price Check · verdicts', () => {
  it('reads the amount from a pasted quote', () => {
    expect(parseAmount('Taxi airport → Sukhumvit ฿1,500 no meter')).toBe(1500)
    expect(parseAmount('Sukhumvit 11 to Silom, driver wants 400 baht')).toBe(400)
    expect(parseAmount('ทัวร์เกาะล้าน 1,800 บาท/คน')).toBe(1800)
    expect(parseAmount('1.5k for the boat')).toBe(1500)
    expect(parseAmount('how much is a taxi?')).toBeNull()
  })

  it('picks the chip from the words', () => {
    expect(guessKind('Taxi airport → Sukhumvit ฿1,500', 'bangkok')).toBe('taxi')
    expect(guessKind('Koh Larn tour ฿1,800 per person, speedboat', 'pattaya')).toBe('boat')
    expect(guessKind('tuk tuk 400', 'bangkok')).toBe('tuk')
    expect(guessKind('Thai massage 2h 1200', 'bangkok')).toBe('massage')
  })

  it('Bangkok airport taxi ฿1,500 → "4× too high · usual ฿300–400"', () => {
    const q = 'Taxi airport → Sukhumvit ฿1,500 no meter'
    const rule = ruleFor('taxi', q, 'bangkok')!
    expect(rule.id).toBe('taxi-airport')
    const v = verdictFor(1500, rule, q)
    expect(v.tone).toBe('bad')
    expect(timesLabel(v.times)).toBe('4×')
    expect(rangeLabel(v.lo, v.hi)).toBe('฿300–400')
    expect(v.angle).toBeGreaterThan(100) // in the red
  })

  it('Pattaya Koh Larn speedboat ฿1,800 (one way) → "8×" against the usual ฿150–300 seat, and a massage scales by the hour', () => {
    const q = 'Koh Larn speedboat ฿1,800 per person, one way'
    const v = verdictFor(1800, ruleFor('boat', q, 'pattaya')!, q)
    expect(rangeLabel(v.lo, v.hi)).toBe('฿150–300')
    expect(timesLabel(v.times)).toBe('8×')
    const m = 'Thai massage 2 hours 700'
    const vm = verdictFor(700, ruleFor('massage', m, 'bangkok')!, m)
    expect([vm.lo, vm.hi]).toEqual([600, 1000])
    expect(vm.tone).toBe('ok')
  })
})

describe('Kring Price tab', () => {
  it('Price Check: type a quote → gauge verdict → "Book ours ฿665" opens the ride flow', async () => {
    render(<BkkPulseTab />)
    const tab = screen.getByTestId('kring-price')
    // V2 · Price Check lives behind the quiet "Got a different quote? Check it ›" line
    fireEvent.click(within(tab).getByTestId('pulse-tool-scam-check'))
    const input = within(tab).getByTestId('scam-ai-custom-input')
    fireEvent.change(input, { target: { value: 'Taxi airport → Sukhumvit ฿1,500 no meter' } })
    await act(async () => {
      fireEvent.click(within(tab).getByTestId('scam-ai-check-btn'))
      await new Promise((r) => setTimeout(r, 5))
    })
    const verdict = within(tab).getByTestId('scam-ai-custom-verdict')
    expect(verdict).toHaveTextContent('4× too high')
    expect(verdict).toHaveTextContent('usual ฿300–400')
    expect(verdict).toHaveTextContent('metered taxi + ฿50 airport fee + tolls')
    const book = within(verdict).getByTestId('scam-book-fixed-btn')
    expect(book).toHaveTextContent('Book ours ฿665')
    fireEvent.click(book)
    expect(screen.getByTestId('interactive-booking-modal')).toHaveAttribute('aria-label', 'Ride booking')
  })

  it('the verdict has a 9:16 share card with Share / Save / Copy link', async () => {
    render(<BkkPulseTab />)
    const tab = screen.getByTestId('kring-price')
    fireEvent.click(within(tab).getByTestId('pulse-tool-scam-check'))
    fireEvent.change(within(tab).getByTestId('scam-ai-custom-input'), { target: { value: 'Taxi airport ฿1500' } })
    await act(async () => {
      fireEvent.click(within(tab).getByTestId('scam-ai-check-btn'))
      await new Promise((r) => setTimeout(r, 5))
    })
    fireEvent.click(screen.getByTestId('kp-share-verdict'))
    const card = screen.getByTestId('kp-verdict-card')
    expect(card).toHaveTextContent('4× TOO HIGH')
    expect(card).toHaveTextContent('kringapp.com/check')
    expect(screen.getByTestId('kp-share-native')).toBeInTheDocument()
    expect(screen.getByTestId('kp-share-save')).toBeInTheDocument()
    // FIX3 · founder — LINE, WeChat and 小红书 as plain chips (F4's ShareChips)
    expect(screen.getByTestId('kp-share-line')).toBeInTheDocument()
    expect(screen.getByTestId('kp-share-wechat')).toHaveTextContent(/WeChat/)
    expect(screen.getByTestId('kp-share-xhs')).toHaveTextContent('小红书')
    expect(screen.getByTestId('kp-share-copy')).toBeInTheDocument()
  })

  it('V2 · photo card: "Street price ฿1,100 → Kring ฿665" (street price struck); tap → save, cheapest elsewhere with a date, source', () => {
    render(<BkkPulseTab />)
    const card = screen.getByTestId('kp-row-airport-car')
    expect(card).toHaveTextContent('Street price')
    expect(card).toHaveTextContent('฿1,100')
    expect(card).toHaveTextContent('฿665')
    expect(within(card).getByText('฿1,100').tagName).toBe('S')
    fireEvent.click(card)
    const sheet = screen.getByTestId('kp-detail-sheet')
    expect(within(sheet).getByTestId('kp-row-save-airport-car')).toHaveTextContent('Save ฿435 vs street price')
    expect(within(sheet).getByTestId('kp-detail-elsewhere')).toHaveTextContent(/Cheapest elsewhere ฿700 · Klook app · checked 20 Oct/)
    expect(sheet).toHaveTextContent('The Thailand Life')
    fireEvent.click(within(sheet).getByTestId('kp-detail-book'))
    expect(screen.getByTestId('interactive-booking-modal')).toHaveAttribute('aria-label', 'Ride booking')
  })

  it('Bangkok · Pattaya switch swaps the board and is remembered on the device', () => {
    render(<BkkPulseTab />)
    fireEvent.click(screen.getByTestId('kp-city-pattaya'))
    expect(screen.getByTestId('kp-city-pattaya')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('kp-row-bangkok-pattaya-car')).toHaveTextContent('฿2,000')
    expect(screen.getByTestId('kp-row-bangkok-pattaya-car')).toHaveTextContent('฿1,285')
    expect(window.localStorage.getItem(KRING_CITY_KEY)).toBe('pattaya')
    expect(screen.queryByTestId('kp-row-muay-thai-ringside')).toBeNull()
  })

  it('"You saved ฿X this trip" is pinned and is the Wallet number (useTripSaved)', () => {
    recordTripSaving('esim', FLOOR_PRICES['esim:8d'].floorThb, 185)
    render(<BkkPulseTab />)
    const strip = screen.getByTestId('pulse-savings-hero')
    expect(strip).toHaveTextContent(`You saved ฿${tripSavedTotal(false)} this trip`)
    expect(strip).toHaveTextContent('1 booking')
  })

  it('the "?" sheet says it is the same price for every passport, with the dated sources', () => {
    render(<BkkPulseTab />)
    fireEvent.click(screen.getByTestId('kp-help-btn'))
    const sheet = screen.getByTestId('kp-help-sheet')
    expect(sheet).toHaveTextContent('Same for every passport')
    expect(sheet).toHaveTextContent('ราคาเดียวกันทุกคน ไม่ว่าจะมาจากไหน')
    expect(within(sheet).getByTestId('kp-help-stamp')).toHaveTextContent('CHECKED 21 OCT · BANGKOK')
    expect(sheet).toHaveTextContent('Muay Thai Stadiums')
  })

  it('honest rows render every city item; no "Thai price" framing and no banned words on the tab', () => {
    render(<BkkPulseTab />)
    for (const i of itemsIn('bangkok')) expect(screen.getByTestId(`kp-row-${i.id}`)).toBeInTheDocument()
    const text = screen.getByTestId('kring-price').textContent ?? ''
    expect(text).not.toMatch(/what Thais pay|Thai price|ราคาคนไทย/i)
    for (const w of BANNED_WORDS) expect(text.toLowerCase()).not.toContain(w.toLowerCase())
    expect(text).not.toMatch(/coin/i)
  })

  it('keeps the tool tiles: Price Check, Rides, eSIM, Bundles, driver card and hold-1155', () => {
    render(<BkkPulseTab />)
    fireEvent.click(screen.getByTestId('kp-tool-esim'))
    expect(screen.getByTestId('interactive-booking-modal')).toHaveAttribute('aria-label', 'Tourist eSIM')
    fireEvent.click(screen.getByRole('button', { name: 'Close booking modal' }))
    fireEvent.click(screen.getByTestId('pulse-bundle-row'))
    expect(screen.getByTestId('bundle-sheet')).toBeInTheDocument()
    expect(screen.getByTestId('pulse-tool-taxi-card')).toBeInTheDocument()
    expect(screen.getByTestId('pulse-tool-1155')).toBeInTheDocument()
  })

  it('the ride boarding pass has a QR mode', () => {
    render(<BkkPulseTab />)
    fireEvent.click(screen.getByTestId('pulse-tool-ride'))
    fireEvent.click(screen.getByTestId('uber-confirm-pickup-btn'))
    const pass = screen.getByTestId('confirmed-boarding-pass-visual')
    expect(pass).toHaveTextContent('kring')
    const flip = screen.getByTestId('boarding-pass-qr-btn')
    expect(flip).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(flip)
    expect(flip).toHaveAttribute('aria-pressed', 'true')
    expect(pass.className).toContain('is-qr')
    expect(screen.getByTestId('boarding-pass-qr')).toBeInTheDocument()
  })
})

describe('KRING FIX1 · F3 — the tourist gap is only claimed where a source states it', () => {
  it('the Thai massage row (a converted hotel-spa range) shows no strike and no "Save" chip; the others do, labelled "vs tourist price"', () => {
    const massage = KRING_PRICE_ITEMS.find((i) => i.id === 'thai-massage-60')!
    expect(showsTouristGap(massage)).toBe(false)
    render(<BkkPulseTab />)
    expect(screen.queryByTestId('kp-row-save-thai-massage-60')).toBeNull()
    expect(within(screen.getByTestId('kp-row-thai-massage-60')).queryByText('฿1,300')).toBeNull()
    fireEvent.click(screen.getByTestId('kp-row-muay-thai-ringside'))
    expect(screen.getByTestId('kp-row-save-muay-thai-ringside')).toHaveTextContent('Save ฿780 vs street price')
  })

  it('the Koh Larn Price Check is the speedboat FARE; the Kring offer is the island DAY from ฿1,500 — never ฿650', () => {
    const r = ruleFor('boat', 'Koh Larn speedboat 1800', 'pattaya')!
    expect(r.reason.en).toMatch(/speedboat fare \(one way\)/i)
    expect(r.kring?.title.en).toBe('Koh Larn island day with a local')
    expect(r.kring?.thb).toBe(1500)
  })
})

describe('KRING FIX2 · F3 · Wei 7/8', () => {
  it('the gauge marks 2× and 3× where the verdict maps them, so "3× too high" reads between 3× and 4×+', () => {
    const v = verdictFor(400, ruleFor('tuk', 'Tuk-tuk Grand Palace to Khao San 400 baht', 'bangkok')!, 'Tuk-tuk Grand Palace to Khao San 400 baht')
    expect(timesLabel(v.times)).toBe('3×')
    expect(v.angle).toBeGreaterThan(gaugeAngleForTimes(3))
    expect(v.angle).toBeLessThan(gaugeAngleForTimes(4))
  })

  it('no "You saved ฿0 · 1 booking": with nothing saved there is no strip at all (V2 · no clutter); the count is of bookings below street price', () => {
    render(<BkkPulseTab />)
    expect(screen.queryByTestId('pulse-savings-hero')).toBeNull()
    expect(screen.getByTestId('kring-price')).not.toHaveTextContent('You saved ฿0')
    expect(screen.queryByTestId('pulse-savings-baseline')).toBeNull()
  })

  it('carries founder-approved Zero-Loss bonusCoins on FLOOR_PRICES, KRING_PRICE_ITEMS, and affiliate deals', () => {
    expect(FLOOR_PRICES['esim:8d']).toMatchObject({ floorThb: 195, oursThb: 185, walkInThb: 499, bonusCoins: 5_000 })
    expect(FLOOR_PRICES['esim:15d']).toMatchObject({ floorThb: 349, oursThb: 329, walkInThb: 699, bonusCoins: 8_000 })
    expect(FLOOR_PRICES['cab:airport']).toMatchObject({ floorThb: 700, oursThb: 665, walkInThb: 1200, bonusCoins: 15_000 })
    expect(FLOOR_PRICES['ride:airport:xl']).toMatchObject({ floorThb: 990, oursThb: 930, walkInThb: 1500, bonusCoins: 20_000 })
    expect(FLOOR_PRICES['ride:pattaya:comfort']).toMatchObject({ floorThb: 1350, oursThb: 1285, walkInThb: 2000, bonusCoins: 30_000 })
    expect(FLOOR_PRICES['ride:pattaya:xl']).toMatchObject({ floorThb: 1990, oursThb: 1850, walkInThb: 2600, bonusCoins: 35_000 })
    expect(FLOOR_PRICES['ride:city:comfort']).toMatchObject({ floorThb: 220, oursThb: 199, walkInThb: 350, bonusCoins: 3_000 })
    expect(FLOOR_PRICES['ride:city:xl']).toMatchObject({ floorThb: 320, oursThb: 295, walkInThb: 450, bonusCoins: 5_000 })
    expect(FLOOR_PRICES['ride:city:tuk']).toMatchObject({ floorThb: 200, oursThb: 165, walkInThb: 300, bonusCoins: 3_000 })
    expect(FLOOR_PRICES.bag).toMatchObject({ floorThb: 120, oursThb: 105, walkInThb: 200, bonusCoins: 3_000 })
    expect(FLOOR_PRICES.spa).toMatchObject({ floorThb: 400, oursThb: 385, walkInThb: 600, bonusCoins: 10_000 })
    expect(FLOOR_PRICES.pharm).toMatchObject({ floorThb: 990, oursThb: 940, walkInThb: 1200, bonusCoins: 15_000 })
    expect(FLOOR_PRICES.hotel).toMatchObject({ floorThb: 1590, oursThb: 1550, walkInThb: 2200, bonusCoins: 20_000 })
    expect(FLOOR_PRICES.flower).toMatchObject({ floorThb: 320, oursThb: 289, walkInThb: 400, bonusCoins: 5_000 })
    expect(FLOOR_PRICES.table).toMatchObject({ floorThb: 300, oursThb: 0, walkInThb: 600, bonusCoins: 0 })
    expect(FLOOR_PRICES.late).toMatchObject({ floorThb: 190, oursThb: 175, walkInThb: 300, bonusCoins: 3_000 })
    expect(FLOOR_PRICES['aff:wise-revolut']).toMatchObject({ floorThb: 220, oursThb: 0, walkInThb: 220, bonusCoins: 5_000 })
    expect(PLAN_ADDON_THB).toEqual({ cab: 199, cabXl: 295, table: 500 })

    const byId = Object.fromEntries(KRING_PRICE_ITEMS.map((i) => [i.id, i]))
    expect(byId['airport-car'].bonusCoins).toBe(15_000)
    expect(byId['muay-thai-ringside'].bonusCoins).toBe(25_000)
    expect(byId['thai-massage-60'].bonusCoins).toBe(10_000)
    expect(byId['tourist-esim'].bonusCoins).toBe(5_000)
    expect(byId['bangkok-pattaya-car'].bonusCoins).toBe(30_000)

    const esimDeal = AFFILIATE_DEALS.find((d) => d.id === 'esim-199')!
    const bagDeal = AFFILIATE_DEALS.find((d) => d.id === 'bag-drop-88')!
    const pharmDeal = AFFILIATE_DEALS.find((d) => d.id === 'prep-pharmacy')!
    expect(floorForAffiliate(esimDeal).oursThb).toBe(185)
    expect(floorForAffiliate(bagDeal).oursThb).toBe(105)
    expect(floorForAffiliate(pharmDeal).oursThb).toBe(940)
  })
})

