/* Kring v6 7-Language Automatic Chat Translation Engine (en, th, zh, ko, hi, ru, ms).
   - Red Line #4: Always runs maskTxt() BEFORE any translation so phone numbers, LINE IDs,
     IG handles, and non-allowlisted links are masked ('••••') before leaving the client.
   - Brand Rule: Never translates "กริ๊ง!" or "Kring".
   - Calls Supabase Edge Function `/functions/v1/kr6-translate-chat` when configured and falls back
     to instant 7-language phrase/clause translation offline or in local mode. */

import { maskTxt } from './guard'
import { accessToken } from './auth'
import type { Lang } from './store'

export const KRING_SUPPORTED_CHAT_LANGS: readonly Lang[] = ['en', 'th', 'zh', 'ko', 'hi', 'ru', 'ms']

export interface ChatTranslationResult {
  maskedOriginal: string
  translatedText: string
  sourceLang: Lang
  targetLang: Lang
  wasMasked: boolean
}

interface PhraseEntry {
  match: RegExp
  translations: Record<Lang, string>
}

const PHRASEBOOK_7LANG: readonly PhraseEntry[] = [
  {
    match: /^(ฉันถึงแล้ว|ถึงแล้วค่ะ|ถึงแล้วครับ|i('m| am) here|arrived|我到了|도착했어요|मैं पहुँच गया|я на месте|saya dah sampai)[!.ค่ะครับ\s]*$/i,
    translations: {
      en: "I've arrived at the meeting point!",
      th: 'ถึงจุดนัดพบแล้วค่ะ',
      zh: '我已经到达集合点了！',
      ko: '만남 장소에 도착했어요!',
      hi: 'मैं मीटिंग पॉइंट पर पहुँच गया हूँ!',
      ru: 'Я уже на месте встречи!',
      ms: 'Saya sudah sampai di tempat pertemuan!',
    },
  },
  {
    match: /^(กำลังไป|ใกล้ถึงแล้ว|on my way|be there in (\d+) min(ute)?s?|馬上到|马上到|가는 중이에요|मैं रास्ते में हूँ|я уже иду|dalam perjalanan).*$/i,
    translations: {
      en: 'On my way — see you at the public meeting point soon!',
      th: 'กำลังเดินทางไปนะคะ เจอกันที่จุดนัดพบค่ะ',
      zh: '正在路上，一会儿在公共集合点见！',
      ko: '가는 중이에요 — 곧 만남 장소에서 봬요!',
      hi: 'मैं रास्ते में हूँ — जल्द ही मीटिंग पॉइंट पर मिलते हैं!',
      ru: 'Я в пути — скоро увидимся на месте встречи!',
      ms: 'Saya dalam perjalanan — jumpa di tempat pertemuan sebentar lagi!',
    },
  },
  {
    match: /^(ไม่ทานเผ็ด|เผ็ดน้อย|no spicy|not spicy|less spicy|不要辣|微辣|안 맵게 해주세요|तीखा मत करना|не острое|taknak pedas).*$/i,
    translations: {
      en: 'Not spicy please (mild only).',
      th: 'ขอแบบไม่เผ็ดนะคะ (เผ็ดน้อย)',
      zh: '请不要太辣（微辣即可）。',
      ko: '맵지 않게 부탁드려요 (순한 맛).',
      hi: 'कृपया तीखा कम रखें (हल्का मसाला)।',
      ru: 'Пожалуйста, не острое.',
      ms: 'Tolong jangan pedas (kurang pedas sahaja).',
    },
  },
  {
    match: /^(เจอกันที่ทางออก\s*1|meet at exit 1|exit 1|1号出口见|1번 출구에서 만나요|गेट 1 पर मिलते हैं|встречаемся у выхода 1|jumpa di pintu keluar 1).*$/i,
    translations: {
      en: "Let's meet right by Exit 1.",
      th: 'เจอกันตรงทางออก 1 นะคะ',
      zh: '我们在 1 号出口旁边见。',
      ko: '1번 출구 바로 앞에서 만나요.',
      hi: 'एग्जिट 1 के पास मिलते हैं।',
      ru: 'Встречаемся прямо у выхода 1.',
      ms: 'Mari kita jumpa betul-betul di Pintu Keluar 1.',
    },
  },
  {
    match: /^(ขอบคุณ(มาก)?(ค่ะ|ครับ)?|thank you( so much)?|thanks|谢谢|감사합니다|धन्यवाद|спасибо|terima kasih)[!.\s]*$/i,
    translations: {
      en: 'Thank you so much!',
      th: 'ขอบคุณมากนะคะ',
      zh: '非常感谢！',
      ko: '정말 감사합니다!',
      hi: 'बहुत-बहुत धन्यवाद!',
      ru: 'Большое спасибо!',
      ms: 'Terima kasih banyak!',
    },
  },
]

const CLAUSE_MAP: ReadonlyArray<{
  pattern: RegExp
  replace: Record<Lang, string>
}> = [
  {
    pattern: /เจอกันที่|meet at|在.*见|에서 만나요|पर मिलते हैं|встречаемся у|jumpa di/gi,
    replace: {
      en: 'Meet at',
      th: 'เจอกันที่',
      zh: '集合地点：',
      ko: '만남 장소:',
      hi: 'मिलने का स्थान:',
      ru: 'Встреча у',
      ms: 'Jumpa di',
    },
  },
  {
    pattern: /สวัสดี(ค่ะ|ครับ)?|hello|hi\b|你好|안녕하세요|नमस्ते|привет|здравствуйте|helo|hai\b/gi,
    replace: {
      en: 'Hello',
      th: 'สวัสดีค่ะ',
      zh: '你好',
      ko: '안녕하세요',
      hi: 'नमस्ते',
      ru: 'Привет',
      ms: 'Hai',
    },
  },
]

export function detectMessageLang(text: string): Lang {
  if (/[\u0E00-\u0E7F]/.test(text)) return 'th'
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko'
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh'
  if (/[\u0900-\u097F]/.test(text)) return 'hi'
  if (/[\u0400-\u04FF]/.test(text)) return 'ru'
  if (/\b(saya|jumpa|terima kasih|pedas|tempat|jalan)\b/i.test(text)) return 'ms'
  return 'en'
}

/** Times, prices and other numbers in a message ("18:30", "฿500", "exit 1"). */
const numTokens = (s: string): string[] => s.match(/\d+(?:[:.,]\d+)*/g) || []
/** A translation may never change or drop a time or a number: every number in the source must appear unchanged. */
export function keepsNumbers(src: string, out: string): boolean {
  const have = numTokens(out)
  return numTokens(src).every((n) => have.includes(n))
}

function protectBrand(text: string): { safe: string; restore: (s: string) => string } {
  const safe = text.replace(/กริ๊ง!/g, '__KRING_TH__').replace(/\bKring\b/g, '__KRING_EN__')
  return {
    safe,
    restore: (s: string) => s.replace(/__KRING_TH__/g, 'กริ๊ง!').replace(/__KRING_EN__/g, 'Kring'),
  }
}

/**
 * Synchronous deterministic 7-language translator used for instant UI rendering and offline fallback.
 * Expects already-masked text (`maskTxt(raw)`).
 */
export function translateMaskedSync(maskedText: string, targetLang: Lang, sourceLang?: Lang): string {
  const trimmed = maskedText.trim()
  if (!trimmed) return maskedText
  const detected = sourceLang || detectMessageLang(trimmed)
  if (detected === targetLang) return maskedText

  const { safe, restore } = protectBrand(trimmed)

  for (const entry of PHRASEBOOK_7LANG) {
    if (entry.match.test(safe)) {
      const out = restore(entry.translations[targetLang])
      // A fixed phrase that would drop a time or number ("be there in 10 min") is not used.
      if (keepsNumbers(trimmed, out)) return out
      break
    }
  }

  let out = safe
  let matchedClause = false
  for (const clause of CLAUSE_MAP) {
    if (clause.pattern.test(out)) {
      matchedClause = true
      out = out.replace(clause.pattern, clause.replace[targetLang])
    }
  }
  if (matchedClause) {
    return restore(out)
  }

  // Fallback tag for arbitrary free-text when offline so all 7 languages render cleanly
  const prefixByLang: Record<Lang, string> = {
    en: '[EN] ',
    th: '[แปลไทย] ',
    zh: '[中文翻译] ',
    ko: '[한국어 번역] ',
    hi: '[हिन्दी अनुवाद] ',
    ru: '[Перевод RU] ',
    ms: '[Terjemahan MS] ',
  }
  return restore(`${prefixByLang[targetLang]}${out}`)
}

/**
 * Masks contact details FIRST (Red Line #4), then translates into `targetLang` via the
 * Supabase Edge Function (`kr6-translate-chat`) with automatic synchronous fallback.
 */
export async function translateChatMessage(
  rawText: string,
  targetLang: Lang,
  sourceLang?: Lang,
): Promise<ChatTranslationResult> {
  const maskedOriginal = maskTxt(rawText)
  const wasMasked = maskedOriginal !== rawText
  const srcLang = sourceLang || detectMessageLang(maskedOriginal)

  if (srcLang === targetLang) {
    return {
      maskedOriginal,
      translatedText: maskedOriginal,
      sourceLang: srcLang,
      targetLang,
      wasMasked,
    }
  }

  const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {})
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim() || ''
  const supabaseAnon = env.VITE_SUPABASE_ANON_KEY?.trim() || ''

  const userJwt = accessToken()
  if (supabaseUrl && supabaseAnon && userJwt && typeof fetch === 'function') {
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/kr6-translate-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnon,
          Authorization: `Bearer ${userJwt}`,
        },
        body: JSON.stringify({
          text: maskedOriginal,
          sourceLang: srcLang,
          targetLang,
        }),
      })
      if (resp.ok) {
        const data = (await resp.json().catch(() => null)) as { translatedText?: string } | null
        if (data?.translatedText && keepsNumbers(maskedOriginal, data.translatedText)) {
          return {
            maskedOriginal,
            translatedText: maskTxt(data.translatedText),
            sourceLang: srcLang,
            targetLang,
            wasMasked,
          }
        }
      }
    } catch {
      // Fall through to deterministic synchronous 7-language translation
    }
  }

  return {
    maskedOriginal,
    translatedText: translateMaskedSync(maskedOriginal, targetLang, srcLang),
    sourceLang: srcLang,
    targetLang,
    wasMasked,
  }
}
