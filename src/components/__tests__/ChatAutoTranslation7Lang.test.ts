import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  KRING_SUPPORTED_CHAT_LANGS,
  detectMessageLang,
  translateMaskedSync,
  translateChatMessage,
} from '../../v6/core/translate'
import { maskBeforeTranslate, handleTranslateRequest } from '../../../supabase/functions/kr6-translate-chat/index'

describe('7-Language Automatic Chat Translation (Red Line #4 Pre-Translation Masking + Edge Function)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('supports all 7 Kring languages (en, th, zh, ko, hi, ru, ms) and detects scripts accurately', () => {
    expect(KRING_SUPPORTED_CHAT_LANGS).toEqual(['en', 'th', 'zh', 'ko', 'hi', 'ru', 'ms'])
    expect(detectMessageLang('สวัสดีค่ะ เจอกันที่ทางออก 1')).toBe('th')
    expect(detectMessageLang('我已经到达集合点了')).toBe('zh')
    expect(detectMessageLang('만남 장소에 도착했어요')).toBe('ko')
    expect(detectMessageLang('मैं मीटिंग पॉइंट पर पहुँच गया हूँ')).toBe('hi')
    expect(detectMessageLang('Я уже на месте встречи')).toBe('ru')
    expect(detectMessageLang('Saya sudah sampai di tempat pertemuan')).toBe('ms')
    expect(detectMessageLang("I'm here at Exit 1")).toBe('en')
  })

  it('enforces Red Line #4: masks phone numbers, LINE IDs, IG handles, and unsafe links BEFORE translation', async () => {
    const rawWithPii = 'สวัสดีค่ะ add my line: ploy1234 or call +66 89 123 4567 or @ploy_ig https://scam.example.com'
    const edgeMasked = maskBeforeTranslate(rawWithPii)

    expect(edgeMasked.wasMasked).toBe(true)
    expect(edgeMasked.maskedText).not.toContain('ploy1234')
    expect(edgeMasked.maskedText).not.toContain('89 123 4567')
    expect(edgeMasked.maskedText).not.toContain('@ploy_ig')
    expect(edgeMasked.maskedText).not.toContain('scam.example.com')
    expect(edgeMasked.maskedText).toContain('••••')

    const clientRes = await translateChatMessage(rawWithPii, 'en')
    expect(clientRes.wasMasked).toBe(true)
    expect(clientRes.maskedOriginal).not.toContain('ploy1234')
    expect(clientRes.maskedOriginal).not.toContain('89 123 4567')
    expect(clientRes.translatedText).not.toContain('ploy1234')
    expect(clientRes.translatedText).not.toContain('89 123 4567')
  })

  it('translates meetup, arrival, and dietary phrases across all 7 languages while preserving กริ๊ง! and Kring', () => {
    for (const lang of KRING_SUPPORTED_CHAT_LANGS) {
      const out = translateMaskedSync('ถึงแล้วค่ะ', lang, 'th')
      expect(out.length).toBeGreaterThan(2)
      if (lang !== 'th') {
        expect(out).not.toBe('ถึงแล้วค่ะ')
      }
    }

    expect(translateMaskedSync('ไม่ทานเผ็ด', 'en', 'th')).toBe('Not spicy please (mild only).')
    expect(translateMaskedSync('Not spicy please', 'th', 'en')).toBe('ขอแบบไม่เผ็ดนะคะ (เผ็ดน้อย)')
    expect(translateMaskedSync('Not spicy please', 'zh', 'en')).toContain('辣')
    expect(translateMaskedSync('Not spicy please', 'ko', 'en')).toContain('맵지')
    expect(translateMaskedSync('Not spicy please', 'hi', 'en')).toContain('तीखा')
    expect(translateMaskedSync('Not spicy please', 'ru', 'en')).toContain('острое')
    expect(translateMaskedSync('Not spicy please', 'ms', 'en')).toContain('pedas')

    // Brand tokens กริ๊ง! and Kring are never corrupted
    const brandMsg = translateMaskedSync('สวัสดีค่ะ กริ๊ง! Kring Wat Mangkon', 'en', 'th')
    expect(brandMsg).toContain('กริ๊ง!')
    expect(brandMsg).toContain('Kring')
  })

  it('handles Edge Function POST requests and masks PII before invoking external translation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([[['Hello, meet at Exit 1 ••••', 'สวัสดีค่ะ เจอกันที่ทางออก 1 ••••']]]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const req = new Request('https://pedxoxpammnyfnizljyj.supabase.co/functions/v1/kr6-translate-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'สวัสดีค่ะ เจอกันที่ทางออก 1 line: secretline99',
        targetLang: 'en',
      }),
    })

    const res = await handleTranslateRequest(req)
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      maskedText: string
      translatedText: string
      wasMasked: boolean
    }

    expect(json.wasMasked).toBe(true)
    expect(json.maskedText).not.toContain('secretline99')
    expect(json.translatedText).not.toContain('secretline99')
    // Verify the outbound fetch query had secretline99 stripped before leaving the Edge Function
    expect(String(fetchSpy.mock.calls[0]?.[0] || '')).not.toContain('secretline99')
  })
})
