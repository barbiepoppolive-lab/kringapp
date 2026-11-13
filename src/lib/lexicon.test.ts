import { describe, expect, it } from 'vitest'
import { BANNED_WORDS, EXTENSION_WORDS, LEXICON, both, hasKey, t } from './lexicon'
import { GUIDES, GUIDES_TH, HOST_GUIDES, HOST_GUIDES_TH } from './guideContent'
import { HELP } from './helpContent'
import { SPRING, springCurve } from '../design/motion'

describe('Kring lexicon', () => {
  it('returns the locked EN / TH words', () => {
    expect(t('brand', 'en')).toBe('Kring')
    expect(t('brand', 'th')).toBe('กริ๊ง')
    expect(t('book', 'th')).toBe('จอง')
    // KRING FIX1 · Ploy: the guest's money is already held, it moves at the กริ๊ง!
    expect(t('held', 'th')).toBe('เงินแขกพักไว้แล้ว โอนให้ตอนกริ๊ง')
    expect(t('released', 'th')).toBe('โอนแล้ว')
    expect(t('live', 'th')).toBe('ออนไลน์อยู่')
    expect(t('paused', 'en')).toBe('Paused')
    expect(t('paused', 'th')).toBe('พักไว้ก่อน')
    expect(t('pinned', 'en')).toBe('Pinned 📌')
    expect(t('suggest.change', 'th')).toBe('ขอเปลี่ยน')
    expect(t('kring.price', 'th')).toBe('ราคากริ๊ง')
    expect(t('wallet', 'th')).toBe('กระเป๋า')
    // KRING FIX1 · Ploy: Thai Live/Paused words, and the traveller role is ผู้จอง (not นักท่องเที่ยว) for Thais
    expect(t('live.you', 'th')).toBe('ออนไลน์อยู่')
    expect(t('paused.you', 'th')).toBe('พักไว้ก่อน')
    expect(t('role.guest', 'th')).toBe('ผู้จอง')
    expect(t('private', 'th', { name: 'Sarah' })).toBe('ส่วนตัว · เห็นแค่คุณกับ Sarah')
    // Wei · one name for the action: Book
    expect(t('make.offer', 'en')).toBe('Book')
    expect(t('offer', 'en')).toBe('Book')
  })

  it('fills placeholders, falls back to EN and returns unknown keys as-is', () => {
    expect(t('mc.bookWith', 'en', { name: 'Mint', price: '฿1,200' })).toBe('Book with Mint · ฿1,200')
    expect(t('sticker.thanks', 'th', { p: 'ค่ะ' })).toBe('ขอบคุณค่ะ 🙏')
    expect(t('sticker.thanks', 'th')).toBe('ขอบคุณ 🙏')
    expect(t('book', 'ko')).toBe('Book')
    expect(t('tab.wallet', 'zh')).toBe('钱包')
    expect(t('no.such.key', 'th')).toBe('no.such.key')
    expect(hasKey('brand')).toBe(true)
    expect(both('tab.experiences')).toBe('Experiences · ประสบการณ์')
  })

  it('never uses alcohol, dating or "unlive" words in user-facing copy', () => {
    const values = Object.values(LEXICON).flatMap((e) => [e.en, e.th, (e as { zh?: string }).zh ?? ''])
    for (const v of values) for (const w of BANNED_WORDS) expect(v.toLowerCase()).not.toContain(w.toLowerCase())
    expect(values.join(' ')).not.toMatch(/🥂|coins?\b/i)
    // no "host" wording (the role is Local) in the lexicon — except KRING T3's founder-approved Chats tag
    // "You’re hosting" and its "Hosting" filter (the activity, never a role)
    const T3_ACTIVITY = new Set(['tag.hosting', 'filter.hosting'])
    const roleValues = Object.entries(LEXICON)
      .filter(([k]) => !T3_ACTIVITY.has(k))
      .flatMap(([, e]) => [e.en, e.th, (e as { zh?: string }).zh ?? ''])
    expect(roleValues.join(' ')).not.toMatch(/\bhost(s|ing)?\b/i)
  })
})

describe('KRING FIX2 · no paid hourly extensions', () => {
  it('no lexicon, guide or help copy offers "+1 hour" / ต่อเวลา — a time change is Suggest a change', () => {
    const lex = Object.values(LEXICON).flatMap((e) => [e.en, e.th, (e as { zh?: string }).zh ?? ''])
    const guides = [GUIDES, GUIDES_TH, HOST_GUIDES, HOST_GUIDES_TH].flatMap((set) => Object.values(set).filter(Boolean))
    const text = [lex.join(' '), JSON.stringify(guides), JSON.stringify(HELP)].join(' ').toLowerCase()
    for (const w of EXTENSION_WORDS) expect(text, w).not.toContain(w.toLowerCase())
    expect(hasKey('extend')).toBe(false)
    expect(GUIDES.extend.topic).toBe('Change the time')
    expect(GUIDES_TH.extend.pages[0].line).toContain('ขอเปลี่ยน')
  })
  it('Ploy: Go Live reads เปิดรับจอง in Thai', () => {
    expect(t('go.live', 'th')).toBe('เปิดรับจอง')
    expect(t('cta.golive', 'th')).toBe('เปิดรับจอง')
  })
})

describe('Kring motion tokens', () => {
  it('samples real springs into CSS linear() curves that end at 1', () => {
    const c = springCurve(1400, 40)
    expect(c.startsWith('linear(0, ')).toBe(true)
    expect(c.endsWith(', 1)')).toBe(true)
    // bouncy overshoots, snap does not
    const peak = (css: string) => Math.max(...css.slice(7, -1).split(',').map(Number))
    expect(peak(SPRING.bouncy.css)).toBeGreaterThan(1.05)
    expect(peak(SPRING.snap.css)).toBeLessThanOrEqual(1.001)
    expect(SPRING.bouncy.ms).toBe(640)
  })
})

describe('KRING VISUAL V2 · approved renames', () => {
  it('uses the founder words: Trip fee, Street price → Kring price, Earn reward 555, Trans woman, Me', () => {
    expect(t('trip.fee', 'en')).toBe('Trip fee')
    expect(t('trip.fee', 'th')).toBe('ค่าทริป')
    expect(t('price.streetToKring', 'en')).toBe('Street price → Kring price')
    expect(t('price.streetToKring', 'th')).toBe('ราคาทั่วไป → ราคากริ๊ง')
    expect(t('tourist.price', 'en')).toBe('Street price')
    expect(t('rewards.title', 'en')).toBe('Earn reward 555')
    expect(t('rewards.upto', 'en')).toBe('Up to ฿555 a month')
    expect(t('who.transwoman', 'en')).toBe('Trans woman')
    expect(t('who.transwoman', 'th')).toBe('สาวประเภทสอง')
    expect(t('tab.me', 'en')).toBe('Me')
    expect(t('card.accepted', 'en', { amount: '฿1,200' })).toBe('Accepted · ฿1,200 held')
  })
  it('never says tip / ทิป for money, never "ladyboy", and the Who options never say "local"', () => {
    const values = Object.values(LEXICON).flatMap((e) => [e.en, e.th, (e as { zh?: string }).zh ?? ''])
    for (const v of values) {
      expect(v).not.toMatch(/\btips?\b/i)
      expect(v).not.toContain('ทิป')
      expect(v.toLowerCase()).not.toContain('ladyboy')
    }
    for (const k of ['who.woman', 'who.man', 'who.transwoman', 'who.any'] as const) {
      expect(t(k, 'en').toLowerCase()).not.toContain('local')
      expect(t(k, 'th')).not.toContain('โลคอล')
    }
  })
})

describe('KRING T3 · one app, never advertise the share', () => {
  it('no lexicon, guide or help copy mentions a percentage share (80%) or a role switch', () => {
    const lex = Object.values(LEXICON).flatMap((e) => [e.en, e.th, (e as { zh?: string }).zh ?? ''])
    const guides = [GUIDES, GUIDES_TH, HOST_GUIDES, HOST_GUIDES_TH].flatMap((set) => Object.values(set).filter(Boolean))
    const text = [lex.join(' '), JSON.stringify(guides), JSON.stringify(HELP)].join(' ')
    expect(text).not.toMatch(/80\s*%|80\s*เปอร์|๘๐/)
    expect(text).not.toMatch(/Switch (to )?(Traveller|Local|Agency)|three roles|สามบทบาท|สลับเป็น(โลคอล|ผู้จอง)/)
  })
  it('has the T3 words: city-aware banner, Share something you love, joining / hosting tags, ✓ Local', () => {
    expect(t('city.here', 'en', { city: 'Pattaya' })).toBe('You’re in Pattaya · locals here')
    expect(t('city.here', 'th', { city: 'พัทยา' })).toBe('คุณอยู่พัทยา · โลคอลที่นี่')
    expect(t('city.home.see', 'th', { home: 'กรุงเทพฯ' })).toBe('ดูกรุงเทพฯแทน')
    expect(t('share.love', 'en')).toBe('＋ Share something you love')
    expect(t('tag.joining', 'en')).toBe('You’re joining')
    expect(t('tag.hosting', 'en')).toBe('You’re hosting')
    expect(t('badge.local', 'en')).toBe('✓ Local')
    expect(t('both.kring', 'th')).toBe('คุณทั้งคู่ กริ๊ง! แล้ว')
    expect(t('group.each', 'th', { price: '฿400' })).toBe('คนละ ฿400')
  })
})
