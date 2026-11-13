// Text helpers: normalisation, language detection, keyword intents. Pure.
import type { Lang } from './types.ts'

/** Fold Thai (๐-๙) and full-width (０-９) digits to ASCII so rules can't be dodged. */
export function foldDigits(s: string): string {
  return String(s || '')
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
    .replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10))
    .replace(/％/g, '%')
}

export function sanitizeInbound(raw: string): string {
  return String(raw || '').split('\u0000').join('').trim().slice(0, 4000)
}

const THAI_RE = /[฀-๿]/
const LATIN_RE = /[A-Za-z]/

/** English only if the text has Latin letters and no Thai; otherwise keep previous. */
export function detectLang(text: string, previous: Lang = 'th'): Lang {
  const t = String(text || '')
  if (THAI_RE.test(t)) return 'th'
  // Codes like "S-AB12" alone shouldn't flip language.
  const stripped = t.replace(/\b[SC]-[A-Z0-9]{4}\b/gi, '')
  if (LATIN_RE.test(stripped) && stripped.replace(/[^A-Za-z]/g, '').length >= 2) return 'en'
  return previous
}

const POLITE_TAIL = '(?:\\s*(?:ค่ะ|คะ|ครับ|คับ|จ้า|จ้ะ|นะคะ|นะครับ|นะ|ส่ง|ข้อความ|แล้ว|please|thanks|thank you|[.!🙏]))*\\s*'

const STOP_RE = new RegExp(`^(?:stop|unsubscribe|ไม่สนใจ|หยุด|หยุดส่ง|ยกเลิก|ไม่ต้องส่ง(?:มา)?|not interested)${POLITE_TAIL}$`, 'i')
export function isStop(text: string): boolean {
  return STOP_RE.test(String(text || '').trim())
}

const RESTART_RE = /^(?:start|เริ่มใหม่|สนใจ(?:ค่ะ|ครับ|เป็นโฮสต์)?|i'?m interested|interested)[\s.!]*$/i
export function isRestart(text: string): boolean {
  return RESTART_RE.test(String(text || '').trim())
}

const HUMAN_RE = /(คุยกับคน|ขอคุยกับแอดมิน|คุยกับแอดมิน|ขอคุยกับคน|ขอสายแอดมิน|ติดต่อแอดมิน|talk to (?:a )?(?:human|person|real person|admin)|speak to (?:a )?(?:human|person|admin)|real person)/i
export function isHumanRequest(text: string): boolean {
  return HUMAN_RE.test(String(text || ''))
}

export function isDetailsRequest(text: string): boolean {
  return /(ขอ(?:รายละเอียด|ข้อมูล)|รายละเอียด|send (?:me )?(?:the )?details|more (?:info|details)|tell me more|^details\b|^info\b)/i.test(String(text || ''))
}

/** Pure interest / affirmative (button presses and short yeses). */
export function isAffirmative(text: string): boolean {
  const t = String(text || '').trim()
  return /^(?:สนใจ|สนใจเป็นโฮสต์|อยากเป็นโฮสต์|สมัคร|สมัครเลย|สมัครโฮสต์|ok|okay|โอเค|ได้|ได้เลย|ได้ค่ะ|ได้ครับ|yes|yep|sure|เอา|เอาเลย|ตกลง|พร้อม|พร้อมสมัคร|รับรหัส|รับรหัสเลย|get my code|sign me up|sign up|i want to host|become a host|interested|let'?s go|i'?m in)(?:\s*(?:ค่ะ|คะ|ครับ|คับ|จ้า|เลย|นะคะ|!|\.))*\s*$/i.test(t)
}

export function isHostChoice(text: string): boolean {
  return /(สนใจเป็นโฮสต์|อยากเป็นโฮสต์|เป็นโฮสต์|สมัครโฮสต์|become a host|i want to host|be a host|hosting)/i.test(String(text || ''))
}

export function isSupChoice(text: string): boolean {
  return /(คอนเนคเตอร์|คอนเน็กเตอร์|connector|^sup\b|sup-[a-z0-9]+|สมัคร\s*sup|team\s*lead|หัวหน้าทีม|ชวนโฮสต์)/i.test(String(text || '').trim())
}

/** Strong guest intent: switches any lead (any stage) into the guest waitlist flow. */
export function isGuestStrongIntent(text: string): boolean {
  return /(อยากจองกิจกรรม|อยากจอง|จองยังไง|จองได้ยังไง|หาคนพา|ช่างภาพพาเดิน|how (do i|to|can i) book|book an activity|i want to book|want to book)/i.test(String(text || ''))
}
/** Weak guest intent: only for leads who haven't chosen a role yet (general/venue or stage new). */
export function isGuestWeakIntent(text: string): boolean {
  return /(อยากไป|\bbook(ing)?\b)/i.test(String(text || ''))
}

/** Companionship / dating framing — Kring guests book an ACTIVITY, never a person. */
export function isCompanionshipRequest(text: string): boolean {
  return /(หาเพื่อน|เพื่อนเที่ยว|ไม่มีใครไปด้วย|เพื่อนคุย|หาคู่|เดท|แฟน|companion|\bdate\b|dating|girlfriend|boyfriend|someone to hang out)/i.test(String(text || ''))
}

export function isNoPromo(text: string): boolean {
  return /(ไม่โปรโมต|ไม่โปรโมท|ไม่ต้องโปรโมต|no promo|don'?t promote|do not promote)/i.test(String(text || ''))
}

/** Guest party size → 1 | 2 | n (>2) | null. */
export function parsePartySize(text: string): number | null {
  const t = foldDigits(String(text || '')).trim().toLowerCase()
  if (/คนเดียว|^หนึ่ง|^1\b|^1\s*คน|just me|only me|\bone\b|solo|alone/.test(t)) return 1
  if (/^สอง|^2\b|^2\s*คน|\btwo\b|สองคน|2 people|couple of us/.test(t)) return 2
  const m = t.match(/(\d+)\s*(คน|people|persons?|pax)?/)
  if (m) return Number(m[1])
  if (/สาม|สี่|ห้า|หลายคน|three|four|five|group/.test(t)) return 3
  return null
}

/** Strong scout keywords switch a lead into the scout application on a scout-enabled OA. */
export function isScoutStrongKeyword(text: string): boolean {
  return /(ภาคสนาม|สเก๊าต์|สเก๊าท์|สเกาต์|scout)/i.test(String(text || ''))
}
/** Bare "สมัคร" only counts as a scout application when the lead hasn't chosen a role. */
export function isScoutWeakKeyword(text: string): boolean {
  return /สมัคร|apply/i.test(String(text || ''))
}

export function isDoneSignup(text: string): boolean {
  return /(สมัครแล้ว|สมัครเสร็จ|เสร็จแล้ว|ทำแล้ว|ลงทะเบียนแล้ว|เรียบร้อยแล้ว|^done\b|signed up|finished|completed)/i.test(String(text || ''))
}

export function isLinkRequest(text: string): boolean {
  return /(ลิงก์|ลิ้ง|ลิงค์|link|รหัส(?:ของ|แนะนำ)?|my code|code)/i.test(String(text || ''))
}

export function isNoAnswer(text: string): boolean {
  return /^(?:ไม่มี|ไม่มีค่ะ|ไม่มีครับ|ไม่|no|none|nope|ไม่มีคนแนะนำ|มาเอง)/i.test(String(text || '').trim())
}

/** Questions and objections go to the LLM instead of being stored as answers. */
export function isQuestionOrObjection(text: string): boolean {
  const t = String(text || '')
  return /[?？]|ไหม|มั้ย|มัย(?:คะ|ครับ)?$|หรือเปล่า|รึเปล่า|หรือไม่|เหรอ|หรอ|ยังไง|อย่างไร|เท่าไ(?:ห)?ร่|กี่บาท|ทำไม|อะไรบ้าง|แบบไหน|ได้ยังไง|โกง|หลอก|มิจฉา|ปลอม|scam|fake|ค่าธรรมเนียม|ค่าสมัคร|เสียเงิน|ไม่มีเวลา|ไม่ว่าง|ปลอดภัย|ใครบ้าง|\b(?:what|how|why|who|when|where|is it|can i|do i|does|are you|fee|fees|safe|busy|no time)\b/i.test(t)
}

const NIGHTLIFE_RE = /(ผับ|บาร์|bar\b|club|คลับ|นวด|massage|คาราโอเกะ|karaoke|โรงแรม|hotel|ห้องพัก|ดื่มเหล้า|เหล้า|nightlife|after\s*party|สปา|spa\b|ห้องส่วนตัว|private room)/i
export function isNightlifeOrPrivate(text: string): boolean {
  return NIGHTLIFE_RE.test(String(text || ''))
}

export function extractReferralCode(text: string): string | null {
  const m = foldDigits(String(text || '')).match(/\b([SC])\s*-\s*([A-Z0-9]{4})\b/i)
  return m ? `${m[1].toUpperCase()}-${m[2].toUpperCase()}` : null
}

/** Thai mobile number (PromptPay). Returns normalised 10-digit or null. */
export function extractPromptPayPhone(text: string): string | null {
  const t = foldDigits(String(text || '')).replace(/\+66\s*/g, '0')
  const digits = t.replace(/[\s-]/g, '')
  const m = digits.match(/(?<!\d)0[689]\d{8}(?!\d)/)
  return m ? m[0] : null
}

export function containsDigitRun(text: string, min = 6): boolean {
  return new RegExp(`\\d{${min},}`).test(foldDigits(String(text || '')).replace(/[\s-]/g, ''))
}

/** Redact long digit runs (bank accounts, ID numbers, OTPs) before storage; keeps valid mobiles. */
export function redactSensitiveNumbers(text: string): string {
  return foldDigits(String(text || '')).replace(/\d[\d\s-]{7,}\d/g, (run) => {
    const compact = run.replace(/[\s-]/g, '')
    if (/^0[689]\d{8}$/.test(compact)) return run
    if (compact.length < 8) return run
    return '[redacted-number]'
  })
}

/** Short, safe echo of user-provided text inside templates. */
export function shortEcho(text: string | null | undefined, max = 40): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}
