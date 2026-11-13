// Guardrail on EVERY outbound text (templates, LLM, follow-ups). Pure.
import { foldDigits } from './text.ts'

export const MAX_OUTBOUND_CHARS = 700
export const ALLOWED_BAHT = new Set([0, 150, 200, 450, 650, 1200, 1500, 2000, 199, 299, 499, 590])
export const ALLOWED_PERCENT = new Set([0, 100])
export const ALLOWED_URL_HOSTS = ['kringapp.com', 'line.me']

export const SAFE_TEMPLATE_TH = 'ขอบคุณค่ะ ทีมงานจะตอบกลับเร็วๆ นี้นะคะ 🙏'
export const SAFE_TEMPLATE_EN = 'Thank you! Our team will reply soon 🙏'

// English never-words: whole-word, case-insensitive.
const NEVER_EN: Array<[string, RegExp]> = [
  ['traveller meetup', /\btravell?ers?\s+meet-?ups?\b/i],
  ['Bangkok Locals', /\bbangkok\s+locals\b/i],
  ['meet locals', /\bmeet(?:ing)?\s+(?:the\s+)?locals\b/i],
  ['match', /\bmatch(?:es|ed|ing)?\b/i],
  ['date', /\bdat(?:e|es|ing)\b/i],
  ['girls', /\bgirls?\b/i],
  ['companion', /\bcompanions?(?:ship)?\b/i],
  ['free to meet', /\bfree\s+to\s+meet\b/i],
  ['gift', /\bgifts?\b/i],
  ['wallet', /\bwallets?\b/i],
  ['coins', /\bcoins?\b/i],
  ['credit', /\bcredits?\b/i],
  ['escrow', /\bescrow\b/i],
  ['seller of record', /\bseller\s+of\s+record\b/i],
  ['passive income', /\bpassive\s+income\b/i],
  ['per hour', /\bper\s+hour\b|\/\s*hour\b|\/\s*hr\b/i],
  ['pretty', /\bpretty\b/i],
  ['cute', /\bcute\b/i],
  ['service fee', /\bservice\s+fees?\b/i],
]

// Thai never-words: substring (Thai has no word boundaries).
const NEVER_TH: Array<[string, RegExp]> = [
  ['เพื่อนเที่ยว', /เพื่อน\s*เที่ยว/],
  ['หาเพื่อน', /หา\s*เพื่อน/],
  ['ไม่มีใครไปด้วย', /ไม่มีใคร\s*ไป\s*ด้วย/],
  ['สาวๆ', /สาว\s*ๆ|สาวสาว/],
  ['หาคู่', /หา\s*คู่/],
  ['เดท', /เดท|เดต(?!า)/],
  ['พริตตี้', /พริตตี้|พริตตี/],
  // "any language" equivalents of English never-words
  ['per hour (th)', /ต่อ\s*ชั่วโมง|ชั่วโมงละ|ชม\.?\s*ละ/],
  ['match (th)', /แมตช์|แมทช์|แม็ตช์/],
  ['companion (th)', /เพื่อน\s*คู่\s*ใจ|คู่หู\s*เที่ยว/],
  ['escrow (th)', /เอสโครว์|บัญชีพัก\s*เงิน/],
  ['wallet/coins/credit (th)', /วอลเล็ท|วอลเลต|กระเป๋า\s*เงิน\s*ดิจิทัล|เหรียญ\s*kring|เครดิต/],
]
// Legit Thai words that contain "เดท"/"เดต" and must not trip the rule.
const TH_ALLOW = /อั[ปพ]เด[ทต]|อัพเดท|อัปเดต/g

export interface GuardResult {
  ok: boolean
  violations: string[]
}

function parseAmount(s: string): number {
  return Number(String(s).replace(/,/g, ''))
}

export function findBahtAmounts(text: string): number[] {
  const t = foldDigits(text)
  const out: number[] = []
  const NUM = '(\\d[\\d,]*(?:\\.\\d+)?)'
  const RANGE = `(?:\\s*[-–—~]\\s*(?:฿|thb\\s*)?\\s*${NUM})?`
  const pre = new RegExp(`(?:฿|\\bthb\\b)\\s*${NUM}${RANGE}`, 'gi')
  const post = new RegExp(`${NUM}${RANGE}\\s*(?:บาท|baht\\b|thb\\b|bht\\b|\\.-)`, 'gi')
  for (const re of [pre, post]) {
    let m: RegExpExecArray | null
    while ((m = re.exec(t))) {
      out.push(parseAmount(m[1]))
      if (m[2]) out.push(parseAmount(m[2]))
    }
  }
  return out
}

export function findPercentages(text: string): number[] {
  const t = foldDigits(text)
  const out: number[] = []
  const re = /(\d+(?:[.,]\d+)?)\s*(?:%|เปอร์เซ็นต์|เปอร์เซ็น|percent\b|per\s*cent\b)/gi
  const re2 = /ร้อยละ\s*(\d+(?:[.,]\d+)?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) out.push(Number(m[1].replace(',', '.')))
  while ((m = re2.exec(t))) out.push(Number(m[1].replace(',', '.')))
  return out
}

function hostAllowed(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  return ALLOWED_URL_HOSTS.some((a) => h === a || h.endsWith(`.${a}`))
}

const TLDS = 'com|net|org|co|io|me|app|th|ly|gl|link|info|biz|xyz|site|online|shop|to|cc|us|uk|asia|ee|ai|gg|page|dev|tv|in|sg|club'

export function findUrlHosts(text: string): string[] {
  const hosts: string[] = []
  let rest = String(text || '')
  const urlRe = /\b(?:https?:\/\/|hxxps?:\/\/)[^\s<>"'）)]+/gi
  rest = rest.replace(urlRe, (u) => {
    try {
      hosts.push(new URL(u.replace(/^hxxp/i, 'http')).hostname)
    } catch {
      hosts.push(u)
    }
    return ' '
  })
  const bare = new RegExp(`(?<![@\\w.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLDS})\\b`, 'gi')
  let m: RegExpExecArray | null
  while ((m = bare.exec(rest))) hosts.push(m[0])
  // email addresses: flag their domain too
  const email = new RegExp(`[\\w.+-]+@((?:[a-z0-9-]+\\.)+(?:${TLDS}))\\b`, 'gi')
  while ((m = email.exec(rest))) hosts.push(`email:${m[1]}`)
  return hosts
}

export function checkOutbound(text: string): GuardResult {
  const violations: string[] = []
  const raw = String(text ?? '')
  if (!raw.trim()) violations.push('empty')
  if (raw.length > MAX_OUTBOUND_CHARS) violations.push(`too_long:${raw.length}>${MAX_OUTBOUND_CHARS}`)

  for (const [word, re] of NEVER_EN) if (re.test(raw)) violations.push(`never_word:${word}`)
  const thai = raw.replace(TH_ALLOW, ' ')
  for (const [word, re] of NEVER_TH) if (re.test(thai)) violations.push(`never_word:${word}`)
  if (/\b80\s*%/.test(foldDigits(raw))) violations.push('banned:80%')

  for (const p of findPercentages(raw)) if (!ALLOWED_PERCENT.has(p)) violations.push(`percent_not_allowed:${p}%`)
  for (const b of findBahtAmounts(raw)) if (!ALLOWED_BAHT.has(b)) violations.push(`baht_not_allowed:${b}`)
  for (const h of findUrlHosts(raw)) {
    if (h.startsWith('email:')) violations.push(`email_not_allowed:${h.slice(6)}`)
    else if (!hostAllowed(h)) violations.push(`url_not_allowed:${h}`)
  }
  return { ok: violations.length === 0, violations: Array.from(new Set(violations)) }
}

export function safeTemplate(lang: 'th' | 'en'): string {
  return lang === 'en' ? SAFE_TEMPLATE_EN : SAFE_TEMPLATE_TH
}
