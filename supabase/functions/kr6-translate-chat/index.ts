// Supabase Edge Function: kr6-translate-chat
// Translates Kring v6 chat messages across all 7 supported languages (en, th, zh, ko, hi, ru, ms).
// RED LINE #4 ENFORCED: Masks phone numbers, LINE/WeChat/Kakao/WhatsApp/IG handles, emails, and
// non-allowlisted links BEFORE translation so raw PII never reaches any external translation API.

export type KringLang = 'en' | 'th' | 'zh' | 'ko' | 'hi' | 'ru' | 'ms'

const SUPPORTED_LANGS: readonly KringLang[] = ['en', 'th', 'zh', 'ko', 'hi', 'ru', 'ms']

const LANG_NAMES: Record<KringLang, string> = {
  en: 'English',
  th: 'Thai (polite ค่ะ/ครับ tone)',
  zh: 'Simplified Chinese (zh-Hans)',
  ko: 'Korean',
  hi: 'Hindi',
  ru: 'Russian',
  ms: 'Malay',
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const APPS_PATTERN =
  'line|wechat|weixin|vx|kakao|kakaotalk|whatsapp|wa|telegram|tg|ig|insta|instagram|fb|facebook|messenger|zalo|viber|vk|upi|id|snap|snapchat|qq'

function isSafeUrl(raw: string): boolean {
  try {
    const u = new URL(/^https?:/i.test(raw) ? raw : 'https://' + raw.replace(/^www\./i, ''))
    const h = u.hostname.replace(/^www\./, '').toLowerCase()
    const maps =
      /^maps\.(google\.[a-z.]+|app\.goo\.gl)$/.test(h) ||
      ((/(^|\.)google\.[a-z.]+$/.test(h) || h === 'goo.gl') && u.pathname.startsWith('/maps'))
    return maps || /(^|\.)(kring\.app|kringapp\.com|go\.th|tourismthailand\.org|wikipedia\.org)$/.test(h)
  } catch {
    return false
  }
}

/**
 * Red Line #4: Permanently masks phone numbers, emails, messaging handles, and unsafe URLs
 * BEFORE any translation step runs.
 */
export function maskBeforeTranslate(v: string): { maskedText: string; wasMasked: boolean } {
  let m = v
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '••••')
    .replace(/(https?:\/\/|www\.)\S+/gi, (x) => (isSafeUrl(x) ? x : '••••'))
    .replace(/\b(t\.me|wa\.me|line\.me|lin\.ee|instagram\.com|fb\.me|m\.me|vk\.com|qr\.kakao\.com)\/?\S*/gi, '••••')
  m = m.replace(
    new RegExp('(^|[^a-z0-9_])(' + APPS_PATTERN + ')(\\s*(id|号|號)?\\s*[:：@=]?\\s*)([^\\s,，。]{3,})', 'gi'),
    (_x, p, a, sep) => p + a + sep + '••••',
  )
  m = m.replace(
    /(微信号?|微信|v信|카톡|카카오톡?|아이디|ไลน์|ไอดี|ไอจี|เฟซ|วอทส์แอป|วอตส์แอป|телеграм|телега|ватсап|вотсап)(\s*[:：@=]?\s*)([^\s,，。]{3,})/g,
    (_x, a, sep) => a + sep + '••••',
  )
  m = m
    .replace(/\+?[\d๐-๙][\d๐-๙\s-]{6,}[\d๐-๙]/g, (x) =>
      /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(x.trim()) ? x : '•••• ••••',
    )
    .replace(/[零〇一二三四五六七八九壹贰叁肆伍陆柒捌玖]{7,}/g, '•••• ••••')
    .replace(/\b((zero|oh|one|two|three|four|five|six|seven|eight|nine)[\s-]*){7,}/gi, '•••• •••• ')
    .replace(/@[\w.]{3,}/g, '@••••')

  return { maskedText: m, wasMasked: m !== v }
}

/**
 * Protects brand tokens ("กริ๊ง!", "Kring") from being altered by machine translation.
 */
function protectBrandTokens(text: string): { tokenized: string; restore: (out: string) => string } {
  const tokenized = text.replace(/กริ๊ง!/g, '__KRING_TH__').replace(/\bKring\b/g, '__KRING_EN__')
  return {
    tokenized,
    restore: (out: string) => out.replace(/__KRING_TH__/g, 'กริ๊ง!').replace(/__KRING_EN__/g, 'Kring'),
  }
}

async function translateViaGemini(
  maskedText: string,
  targetLang: KringLang,
  apiKey: string,
): Promise<string | null> {
  const { tokenized, restore } = protectBrandTokens(maskedText)
  const prompt = [
    `Translate the following activity-meetup chat message into ${LANG_NAMES[targetLang]}.`,
    `Rules:`,
    `1. Keep placeholders like ••••, •••• ••••, @••••, __KRING_TH__, and __KRING_EN__ unchanged.`,
    `2. Keep proper Thai place names (e.g. Wat Mangkon, Yaowarat, Pak Khlong Talat, Talat Noi) recognizable.`,
    `3. Return ONLY the translated text with no quotes or commentary.`,
    `Message: ${tokenized}`,
  ].join('\n')

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
      }),
    },
  )
  if (!resp.ok) return null
  const data = (await resp.json().catch(() => null)) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  } | null
  const rawOut = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  return rawOut ? restore(rawOut) : null
}

async function translateViaGoogleGtx(maskedText: string, targetLang: KringLang): Promise<string | null> {
  const { tokenized, restore } = protectBrandTokens(maskedText)
  const tl = targetLang === 'zh' ? 'zh-CN' : targetLang
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(tokenized)}`
  const resp = await fetch(url)
  if (!resp.ok) return null
  const json = (await resp.json().catch(() => null)) as unknown
  if (!Array.isArray(json) || !Array.isArray(json[0])) return null
  const joined = (json[0] as Array<[string]>).map((seg) => seg?.[0] || '').join('').trim()
  return joined ? restore(joined) : null
}

declare const Deno:
  | {
      env?: { get(key: string): string | undefined }
      serve?: (handler: (req: Request) => Promise<Response> | Response) => void
    }
  | undefined

export async function handleTranslateRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const body = (await req.json().catch(() => null)) as {
    text?: string
    sourceLang?: string
    targetLang?: string
  } | null

  const rawText = typeof body?.text === 'string' ? body.text.trim() : ''
  const targetLang = (body?.targetLang || 'en') as KringLang

  if (!rawText || !SUPPORTED_LANGS.includes(targetLang)) {
    return new Response(JSON.stringify({ error: 'INVALID_INPUT' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // 1. Mask contact details BEFORE any translation
  const { maskedText, wasMasked } = maskBeforeTranslate(rawText)

  // 2. Try Gemini Flash if GEMINI_API_KEY is configured, then fall back to Google GTX
  const geminiKey = typeof Deno !== 'undefined' ? Deno?.env?.get('GEMINI_API_KEY') : undefined
  let translatedText: string | null = null
  let provider: 'gemini-2.5-flash' | 'google-gtx' | 'passthrough' = 'passthrough'

  if (geminiKey) {
    translatedText = await translateViaGemini(maskedText, targetLang, geminiKey).catch(() => null)
    if (translatedText) provider = 'gemini-2.5-flash'
  }
  if (!translatedText) {
    translatedText = await translateViaGoogleGtx(maskedText, targetLang).catch(() => null)
    if (translatedText) provider = 'google-gtx'
  }

  return new Response(
    JSON.stringify({
      maskedText,
      translatedText: translatedText || maskedText,
      targetLang,
      wasMasked,
      provider,
    }),
    {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    },
  )
}

if (typeof Deno !== 'undefined' && typeof Deno?.serve === 'function') {
  Deno.serve(handleTranslateRequest)
}
