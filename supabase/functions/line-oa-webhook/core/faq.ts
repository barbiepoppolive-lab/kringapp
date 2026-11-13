// FAQ intent layer: instant fixed answers for common questions (Thai + English).
// Keyword/regex scoring → best intent; answers use ONLY the locked playbook facts.
// The stage machine appends the next-step question (≤4 lines total) — see stateMachine.ts faqDecision().
import type { Lang, LeadRole } from './types.ts'
import { foldDigits } from './text.ts'

export type FaqIntent =
  | 'trust'
  | 'payment'
  | 'fees'
  | 'price'
  | 'activities'
  | 'guests_safety'
  | 'time'
  | 'location'
  | 'launch'
  | 'id_check'
  | 'age'
  | 'no_show'
  | 'signup'
  | 'company'
  | 'sup_pay'
  | 'scout_pay'
  | 'booking'
  | 'languages'
  | 'group_size'
  | 'free'

type Pattern = [RegExp, number]

/** Higher weight = more specific. Score ≥ FAQ_THRESHOLD wins; ties go to the earlier intent. */
export const FAQ_PATTERNS: Record<FaqIntent, Pattern[]> = {
  trust: [
    [/หลอก|มิจฉา|มิจ|โกง|แก๊งค์?|scam|fraud|\bfake\b/i, 3],
    [/เชื่อได้(ไหม|มั้ย|มัย|เหรอ|หรอ)?|น่าเชื่อถือ|ไว้ใจได้|\blegit\b|trust(worthy)?|\breal\b\??$|is (this|it) real/i, 3],
    [/จริง(ไหม|มั้ย|มัย|เหรอ|หรอ|รึเปล่า|หรือเปล่า)/, 2],
  ],
  payment: [
    [/ได้เงิน(ยังไง|อย่างไร|เมื่อไ(ห)?ร่|ตอนไหน|ทางไหน)|รับเงิน(ยังไง|อย่างไร|ตอนไหน|ทางไหน)?|จ่าย(เงิน)?(ยังไง|อย่างไร|ตอนไหน|ทางไหน)/, 3],
    [/โอน(เงิน)?/, 2],
    [/get paid|how (do|will) i (get )?paid|\bpayment\b|\bpaid\b|pay (me|out)|payout/i, 3],
  ],
  fees: [
    [/หัก\s*(กี่|เท่าไ|%|เปอร์|\d+\s*(%|เปอร์))|ค่าธรรมเนียม|ค่าสมัคร|ค่าคอม|ค่าแรกเข้า|ค่ามัดจำ|มัดจำ|เสียเงิน(ไหม|มั้ย|มัย|อะไร|ด้วย)?|ต้องจ่าย(อะไร|เงิน)?(ไหม|มั้ย|มัย)|ค่าใช้จ่าย/, 3],
    [/\bfees?\b|commission|\bcut\b|deposit|do i (have to|need to) pay|cost to join/i, 3],
  ],
  free: [
    [/ฟรี(ไหม|มั้ย|มัย|เหรอ|หรอ|จริง|หรือเปล่า|รึเปล่า)|ฟรีป่าว/, 3],
    [/is it free|free\?|for free|cost anything/i, 3],
  ],
  price: [
    [/ตั้งราคา|ราคา(เท่าไ|ประมาณ|ยังไง|เอง)|คิดราคา|ราคาเท่าไหร่|ควรตั้ง/, 3],
    [/\bprice\b|pricing|how much (should|can|do) i charge|set (my|the) price|charge guests/i, 3],
    [/ราคา/, 1],
  ],
  activities: [
    [/(ทำ|จัด)อะไร(ได้)?บ้าง|ทำอะไร|กิจกรรม(แบบ|อะไร)(ไหน|บ้าง)?|จัดกิจกรรมอะไร|ต้องทำอะไร/, 3],
    [/what (kind of )?activit|which activit|what (do|would|can) i (do|run|host)|what can i host/i, 3],
  ],
  guests_safety: [
    [/ลูกค้า(เป็น)?ใคร|ผู้จอง(เป็น)?ใคร|ใครจอง|ใครมาจอง|ใครเป็นคนจอง|แขก(เป็น)?ใคร/, 3],
    [/ปลอดภัย|อันตราย|น่ากลัว/, 3],
    [/ผู้ชาย|ผู้หญิง/, 2],
    [/\bsafe(ty)?\b|dangerous|who (are|is) the (guests?|customers?)|who books|who will book/i, 3],
  ],
  time: [
    [/ต้องว่าง(กี่|ทุก|บ่อย)|ไม่ค่อยว่าง|ไม่มีเวลา|ไม่ว่าง|เวลาน้อย|ทำงานประจำ|กี่ชั่วโมง|ใช้เวลา(นาน|กี่)/, 3],
    [/\bbusy\b|no time|how (much|many) (time|hours|days)|full[- ]time job|part[- ]time/i, 3],
    [/เวลา/, 1],
  ],
  location: [
    [/จุดนัด|นัด(เจอ|กัน)?(ที่ไหน|ตรงไหน)|ที่ไหน|ตรงไหน|สถานที่|โซน(ไหน|อะไร)บ้าง/, 2],
    [/\bwhere\b|meeting (point|place)|location/i, 2],
  ],
  launch: [
    [/เปิด(ตัว|ใช้|ให้บริการ)?(เมื่อไ(ห)?ร่|วันไหน|ตอนไหน)|เริ่ม(ได้)?(เมื่อไ(ห)?ร่|วันไหน|ตอนไหน)|เปิดแล้ว(หรือยัง|ยัง)/, 3],
    [/when (do(es)? (it|you|kring) )?(launch|start|open)|launch date|is it live|when can i start/i, 3],
    [/\bwhen\b/i, 1],
  ],
  id_check: [
    [/บัตรประชาชน|ยืนยันตัวตน|ยืนยันบัตร|ทำไมต้อง(ใช้|ส่ง)?บัตร|ส่งบัตร|สแกนบัตร|ใช้บัตร/, 3],
    [/\bID\b|id card|identity|verification|verify/i, 2],
  ],
  age: [
    [/อายุ|นักศึกษา|นักเรียน|เด็กมหาลัย|ม\.ปลาย/, 3],
    [/\bage\b|how old|student|years old/i, 3],
  ],
  no_show: [
    [/เบี้ยว|ไม่มา(ตามนัด)?|เทนัด|ยกเลิก(ได้|ยังไง|การจอง|นัด)|ผู้จองยกเลิก|ถ้า(เขา|ลูกค้า|ผู้จอง)?ยกเลิก/, 3],
    [/no[- ]show|cancel|doesn'?t (show|come)|stood up/i, 3],
  ],
  signup: [
    [/สมัคร(ยังไง|อย่างไร|ได้(ที่ไหน|ยังไง)|ที่ไหน|ตรงไหน)|ลงทะเบียน(ยังไง|ที่ไหน)?|เริ่มยังไง|ขั้นตอน(การ)?สมัคร/, 3],
    [/how (do i|to|can i) (join|sign ?up|register|apply|start)|sign[- ]?up link|where (do i|to) (sign|register)/i, 3],
  ],
  company: [
    [/บริษัท|ใครทำ|ใครเป็นเจ้าของ|ทีมงาน(เป็น)?ใคร|คุณ(เป็น)?ใคร|เว็บ(ไซต์)?|แอป(อะไร|ชื่ออะไร)|kring (คือ|คืออะไร)|กริ๊ง(คือ|คืออะไร)/i, 3],
    [/company|who (are|is) (you|behind|kring)|website|what is kring|who made/i, 3],
  ],
  sup_pay: [
    [/(คอนเนคเตอร์|คอนเน็กเตอร์|connector|sup\b|ซัพ)\S*\s*(ได้|รับ)?(เงิน|ค่า|เท่าไ)/i, 4],
    [/ค่าแนะนำ|ชวน(คน|เพื่อน|โฮสต์)\S*\s*ได้(เงิน|เท่าไ)|ค่าชวน|referral (pay|fee|bonus|reward)|how much (do|does) (a )?(connector|sup)/i, 4],
  ],
  booking: [
    [/จอง(ยังไง|ได้ยังไง|อย่างไร|ได้ที่ไหน|ตรงไหน)|ใช้งาน(ยังไง|อย่างไร)|ขั้นตอน(การ)?จอง|การจองเป็นยังไง/, 3],
    [/how (do i|to|can i) book|how does (booking|it) work|how do bookings work|booking process/i, 3],
  ],
  languages: [
    [/ภาษา|ต่างชาติ|ฝรั่ง|อังกฤษ|ภาษาจีน|เกาหลี|รัสเซีย|ฮินดี|มาเลย์/, 3],
    [/language|english|chinese|korean|hindi|russian|malay|foreigner|tourist/i, 3],
  ],
  group_size: [
    [/กี่คน|หลายคน|ไปกัน\s*\d|มากัน\s*\d|\d+\s*คนได้|พาเพื่อน(ไป|มา)/, 3],
    [/how many (people|guests|of us)|group of|bring (friends|a friend|my friends)|max(imum)? (people|guests)/i, 3],
  ],
  scout_pay: [
    [/(สเก๊าต์|สเก๊าท์|สเกาต์|scout)\S*\s*(ได้|รับ)?(เงิน|ค่า|เท่าไ)|ค่าจ้างสเก๊าต์|scout pay/i, 4],
  ],
}

export const FAQ_THRESHOLD = 2
const QUESTION_HINT = /[?？]|ไหม|มั้ย|มัย|เหรอ|หรอ|ยังไง|อย่างไร|เท่าไ|กี่|ทำไม|หรือเปล่า|รึเปล่า|\b(what|how|why|who|when|where|is|are|can|do|does)\b/i

export interface FaqMatch {
  intent: FaqIntent
  score: number
}

/** Best-scoring intent, or null when nothing reaches the threshold. */
export function matchIntent(text: string): FaqMatch | null {
  const t = foldDigits(String(text || '')).trim()
  if (!t) return null
  const bonus = QUESTION_HINT.test(t) ? 1 : 0
  let best: FaqMatch | null = null
  for (const intent of Object.keys(FAQ_PATTERNS) as FaqIntent[]) {
    let score = 0
    for (const [re, w] of FAQ_PATTERNS[intent]) if (re.test(t)) score += w
    if (score === 0) continue
    score += bonus
    if (score >= FAQ_THRESHOLD && (!best || score > best.score)) best = { intent, score }
  }
  return best
}

type Group = 'host' | 'sup' | 'scout' | 'guest'
export function roleGroup(role: LeadRole): Group | null {
  if (role === 'guest') return 'guest'
  if (role === 'sup') return 'sup'
  if (role === 'scout') return 'scout'
  if (role === 'host' || role === 'general') return 'host'
  return null // venue: no locked venue facts
}

type Lines = { th: string[]; en: string[] }

const SUP_PAY: Lines = {
  th: ['฿300 เมื่อโฮสต์คนแรกของคุณยืนยันตัวตนและเปิดรอบแรก จากนั้น +฿100 ต่อโฮสต์ ไม่จำกัดจำนวน', '+฿200 เมื่อโฮสต์คนนั้นมีผู้จองเช็กอินจริงครั้งแรก โอนเข้าบัญชีชื่อตัวเองภายใน 48 ชม. หลังตรวจผล', 'ไม่มีระบบหลายชั้น นับเฉพาะคนที่คุณชวนเองค่ะ'],
  en: ['฿300 when your first host verifies and publishes a first slot, then +฿100 per host, no cap', '+฿200 when that host\'s first real guest checks in; paid to an account in your own name within 48h of review', 'No multi-level: only people you bring yourself count.'],
}

/**
 * Fixed answers (≤3 lines). A missing entry for a role group means "no locked fact" → no FAQ answer,
 * so the message falls through to the LLM / agent.
 */
export const FAQ_ANSWERS: Partial<Record<FaqIntent, Partial<Record<Group, Lines>>>> = {
  trust: {
    host: {
      th: ['เข้าใจเลยค่ะ 🙏 Kring สมัครฟรี และไม่เคยขอเงิน OTP หรือเลขบัญชีธนาคาร', 'ผู้จองจ่ายเงินให้โฮสต์โดยตรง Kring ไม่ถือเงินของโฮสต์', 'เว็บไซต์ทางการคือ kringapp.com ค่ะ'],
      en: ['Totally fair to ask 🙏 Kring is free to join and never asks for money, OTPs or bank account numbers.', 'Guests pay the host directly; Kring never holds host money.', 'Our official site is kringapp.com.'],
    },
    sup: {
      th: ['เข้าใจเลยค่ะ 🙏 เป็นผู้ประสานงานฟรี เราไม่เคยขอเงิน OTP หรือเลขบัญชีธนาคาร', 'โอนค่าตอบแทนเข้าบัญชีชื่อตัวเอง ข้อมูลรับเงินกรอกในสัญญาเท่านั้น ไม่ส่งทางแชต', 'เว็บไซต์ทางการคือ kringapp.com ค่ะ'],
      en: ['Fair question 🙏 Being a connector is free; we never ask for money, OTPs or bank account numbers.', 'Results are paid to an account in your own name; payout details go only in the contract, never in chat.', 'Our official site is kringapp.com.'],
    },
    scout: {
      th: ['เข้าใจเลยค่ะ 🙏 สมัครฟรี เราไม่เคยขอเงิน OTP หรือเลขบัญชีธนาคาร', 'โอนค่าตอบแทนเข้าบัญชีชื่อตัวเอง ข้อมูลรับเงินกรอกในสัญญาเท่านั้น ไม่ส่งทางแชต', 'เว็บไซต์ทางการคือ kringapp.com ค่ะ'],
      en: ['Fair question 🙏 Applying is free; we never ask for money, OTPs or bank account numbers.', 'Results are paid to an account in your own name; payout details go only in the contract, never in chat.', 'Our official site is kringapp.com.'],
    },
  },
  payment: {
    host: {
      th: ['ผู้จองจ่ายให้คุณโดยตรงตอนเช็กอินที่จุดนัด ผ่าน PromptPay QR หรือเงินสดค่ะ', 'คุณได้รับ 100% ของราคาที่ตั้ง Kring ไม่ถือเงินของโฮสต์'],
      en: ['Guests pay you directly at check-in at the meeting place, by PromptPay QR or cash.', 'You keep 100% of your price; Kring never holds host money.'],
    },
    sup: SUP_PAY,
    scout: SUP_PAY,
  },
  fees: {
    host: {
      th: ['ไม่มีค่าธรรมเนียมค่ะ Kring เก็บ 0% จากโฮสต์ คุณได้รับ 100%', 'สมัครฟรี ไม่มีค่าสมัคร ไม่มีมัดจำ', 'โฮสต์รุ่นแรก (founding hosts) 0% ค่ะ'],
      en: ['No fees: Kring takes 0% from hosts, you keep 100%.', 'Free to join, no sign-up fee, no deposit.', 'Founding hosts stay at 0%.'],
    },
    sup: {
      th: ['ไม่มีค่าใช้จ่ายค่ะ เป็นผู้ประสานงานฟรี และเราไม่เคยขอเงินจากคุณ', 'คุณได้รับเงินตามผลงานผ่าน PromptPay ทุกวัน'],
      en: ['Nothing to pay: being a connector is free and we never ask you for money.', 'You get paid per result by PromptPay, daily.'],
    },
    scout: {
      th: ['ไม่มีค่าใช้จ่ายค่ะ สมัครฟรี และเราไม่เคยขอเงินจากคุณ', 'คุณได้รับเงินตามผลงานผ่าน PromptPay ทุกวัน'],
      en: ['Nothing to pay: applying is free and we never ask you for money.', 'You get paid per result by PromptPay, daily.'],
    },
  },
  price: {
    host: {
      th: ['โฮสต์ตั้งราคาเองค่ะ ปกติ ฿650–฿1,200 ต่อกิจกรรม 90 นาที', 'ได้รับเต็ม 100% ผู้จองไม่เกิน 2 คนต่อการจอง'],
      en: ['You set your own price, usually ฿650–฿1,200 per 90-min session.', 'You keep 100%; max 2 guests per booking.'],
    },
  },
  activities: {
    host: {
      th: ['เป็นกิจกรรม 90 นาทีที่ตั้งชื่อชัดเจนค่ะ เช่น เดินคาเฟ่ / ถ่ายรูป / เวิร์กช็อป / บอร์ดเกม / เดินตลาด–ของกิน', 'นัดในที่สาธารณะช่วงกลางวันถึงหัวค่ำเท่านั้น'],
      en: ['A named 90-min activity, e.g. café walk / photo walk / workshop / board games / market or food walk.', 'Always at a public place, daytime to early evening.'],
    },
    sup: {
      th: ['คอนเนคเตอร์ชวนคนที่รู้จักมาเป็นโฮสต์ Kring และชวนคาเฟ่/สถานที่มาร่วมค่ะ', 'ได้เงินตามผลงาน นับเฉพาะคนที่คุณชวนเอง'],
      en: ['Connectors invite people they know to become Kring hosts, and cafés/venues to join.', 'Paid per result; only people you bring yourself count.'],
    },
    scout: {
      th: ['สเก๊าต์ลงพื้นที่ในกรุงเทพฯ ชวนโฮสต์และคาเฟ่/สถานที่มาร่วม Kring ค่ะ', 'ค่าตอบแทนตามผลงาน: ฿300 เมื่อโฮสต์คนแรกเปิดรอบแรก แล้ว +฿100 ต่อโฮสต์'],
      en: ['Scouts work on the ground in Bangkok, inviting hosts and cafés/venues to join Kring.', 'Paid on results: ฿300 for your first host, then +฿100 per host.'],
    },
  },
  guests_safety: {
    host: {
      th: ['ผู้จองทุกคนยืนยันตัวตนค่ะ และนัดในที่สาธารณะเท่านั้น', 'โฮสต์เห็นรายละเอียดการจองก่อนทุกครั้ง ผู้จองไม่เกิน 2 คนต่อการจอง', 'ไม่มีสถานบันเทิงยามค่ำคืนค่ะ'],
      en: ['Every guest is ID-verified, and you always meet at a public place.', 'You see each booking first; max 2 guests per booking.', 'No nightlife venues.'],
    },
  },
  time: {
    host: {
      th: ['แค่เปิดเวลาว่าง 1 ช่วงต่อสัปดาห์ก็พอค่ะ กิจกรรมครั้งละ 90 นาที', 'พักได้ทุกเมื่อค่ะ'],
      en: ['One weekly time slot is enough; each activity is 90 minutes.', 'You can pause anytime.'],
    },
  },
  location: {
    host: {
      th: ['นัดในที่สาธารณะในกรุงเทพฯ เช่น คาเฟ่ ตลาด ช่วงกลางวันถึงหัวค่ำค่ะ', 'ผู้จองจ่ายโฮสต์ที่จุดนัดตอนเช็กอิน (พัทยาจะตามมาทีหลัง)'],
      en: ['Public places in Bangkok, like cafés or markets, daytime to early evening.', 'Guests pay the host at the meeting place at check-in (Pattaya comes later).'],
    },
  },
  launch: {
    host: {
      th: ['Kring เปิดตัวเดือนพฤศจิกายนนี้ค่ะ ✨', 'สมัครเป็นโฮสต์และตั้งกิจกรรมไว้ได้เลย'],
      en: ['Kring launches in November ✨', 'You can sign up and set up your activity now.'],
    },
    sup: {
      th: ['Kring เปิดตัวเดือนพฤศจิกายนนี้ค่ะ ✨', 'รับรหัสแนะนำแล้วเริ่มชวนโฮสต์ได้เลย'],
      en: ['Kring launches in November ✨', 'You can get your referral code and start inviting hosts now.'],
    },
    scout: {
      th: ['Kring เปิดตัวเดือนพฤศจิกายนนี้ค่ะ ✨', 'ทีมงานจะตอบใบสมัครในแชทนี้ภายใน 24 ชม.'],
      en: ['Kring launches in November ✨', 'We reply to applications in this chat within 24h.'],
    },
  },
  id_check: {
    host: {
      th: ['โฮสต์ทุกคนบน Kring ยืนยันตัวตนค่ะ ผู้จองจึงมั่นใจได้', 'สมัคร = ยืนยันบัตร + รูปโปรไฟล์ + 1 กิจกรรม + เวลาว่าง 1 ช่วงต่อสัปดาห์', 'เราไม่เคยขอ OTP หรือเลขบัญชีธนาคารค่ะ'],
      en: ['Every host on Kring is ID-verified, so guests can book with confidence.', 'Sign-up = ID check + profile photo + one activity + one weekly slot.', 'We never ask for OTPs or bank account numbers.'],
    },
    sup: {
      th: ['โฮสต์ทุกคนบน Kring ต้องยืนยันตัวตนค่ะ', 'ผลงานนับเมื่อโฮสต์ยืนยันตัวตน + เผยแพร่กิจกรรม + เวลาว่างรายสัปดาห์', 'เราไม่เคยขอ OTP หรือเลขบัญชีธนาคารค่ะ'],
      en: ['Every host on Kring must be ID-verified.', 'A result counts once the host is ID verified + activity published + weekly slot.', 'We never ask for OTPs or bank account numbers.'],
    },
  },
  age: {
    scout: {
      th: ['สเก๊าต์ต้องอายุ 20+ ค่ะ'],
      en: ['Scouts must be 20+.'],
    },
  },
  no_show: {
    host: {
      th: ['ผู้จองจองล่วงหน้าด้วยตั๋ว จึงเบี้ยวนัดน้อยลงค่ะ', 'โฮสต์เห็นการจองก่อน และพักรับจองได้ทุกเมื่อ'],
      en: ['Guests pre-book with a ticket, so there are fewer no-shows.', 'You see each booking first and can pause anytime.'],
    },
  },
  company: {
    host: {
      th: ['Kring (กริ๊ง!) คือแอปจองกิจกรรม 90 นาทีในกรุงเทพฯ ค่ะ เปิดตัวเดือนพฤศจิกายน', 'เว็บไซต์ทางการ: kringapp.com · แชทนี้ดูแลโดย Barbie'],
      en: ['Kring is a Bangkok app for booking 90-min activities, launching in November.', 'Official site: kringapp.com · this chat is run by Barbie.'],
    },
  },
  sup_pay: { host: SUP_PAY, sup: SUP_PAY, scout: SUP_PAY },
  scout_pay: {
    host: {
      th: ['ทีม Kring (20+) ค่าตอบแทนตามผลงาน: ฿300 เมื่อโฮสต์คนแรกเปิดรอบแรก แล้ว +฿100 ต่อโฮสต์', 'โอนเข้าบัญชีชื่อตัวเองภายใน 48 ชม. หลังตรวจผล', 'สมัครที่ LINE https://line.me/R/ti/p/@266jjwqh ค่ะ'],
      en: ['Kring team members (20+) are paid on results: ฿300 for your first host, then +฿100 per host.', 'Paid to an account in your own name within 48h of review.', 'Apply via LINE: https://line.me/R/ti/p/@266jjwqh'],
    },
    scout: {
      th: ['ค่าตอบแทนตามผลงาน: ฿300 เมื่อโฮสต์คนแรกเปิดรอบแรก แล้ว +฿100 ต่อโฮสต์', 'โอนเข้าบัญชีชื่อตัวเองภายใน 48 ชม. หลังตรวจผลค่ะ'],
      en: ['Paid on results: ฿300 for your first host, then +฿100 per host.', 'Paid to an account in your own name within 48h of review.'],
    },
  },
}
// scouts asking about the sup scheme get the same answer
FAQ_ANSWERS.scout_pay!.sup = FAQ_ANSWERS.scout_pay!.host
// "is it free?" for supply roles = their fees answer
FAQ_ANSWERS.free = { host: FAQ_ANSWERS.fees!.host, sup: FAQ_ANSWERS.fees!.sup, scout: FAQ_ANSWERS.fees!.scout }
FAQ_ANSWERS.group_size = {
  host: { th: ['ผู้จองไม่เกิน 2 คนต่อการจองค่ะ'], en: ['Max 2 guests per booking.'] },
}
// company / website: same generic answer for guests
FAQ_ANSWERS.company!.guest = FAQ_ANSWERS.company!.host

// ---------------------------------------------------------------- guest answers (locked facts only)
const TICKETS_TH = 'ตั๋วจองของ Kring ฿199 / ฿299 / ฿499 หรือ 7-Day Pass ฿590'
const TICKETS_EN = 'Kring booking tickets are ฿199 / ฿299 / ฿499, or a 7-Day Pass for ฿590.'
const GUEST: Partial<Record<FaqIntent, Lines>> = {
  booking: {
    th: ['เลือกกิจกรรม 90 นาทีที่ตั้งชื่อชัดเจน กับโฮสต์ที่ยืนยันตัวตนแล้ว แล้วจองล่วงหน้าด้วยตั๋วในแอปค่ะ', 'นัดเจอในที่สาธารณะเท่านั้น และเช็กอินที่จุดนัด', 'จองได้ไม่เกิน 2 คนต่อการจอง'],
    en: ['Pick a named 90-min activity with an ID-verified host and pre-book it with a ticket in the app.', 'You only ever meet at a public place and check in at the meeting point.', 'Max 2 people per booking.'],
  },
  price: {
    th: ['ค่ากิจกรรมโฮสต์เป็นคนตั้งค่ะ (ปกติ ฿650–฿1,200 ต่อ 90 นาที) จ่ายให้โฮสต์โดยตรงที่จุดนัด', TICKETS_TH],
    en: ['The host sets the activity price (usually ฿650–฿1,200 per 90 min), paid to the host at the meeting point.', TICKETS_EN],
  },
  fees: {
    th: ['ค่ากิจกรรมจ่ายให้โฮสต์โดยตรงที่จุดนัดค่ะ', TICKETS_TH],
    en: ['The activity price is paid to the host directly at the meeting point.', TICKETS_EN],
  },
  free: {
    th: ['ตั๋วใบแรกฟรีสำหรับผู้ใช้ใหม่ค่ะ ✨', `หลังจากนั้น${TICKETS_TH}`, 'ค่ากิจกรรมจ่ายให้โฮสต์โดยตรงที่จุดนัด'],
    en: ['Your first ticket is free as a new user ✨', 'After that, booking tickets are ฿199 / ฿299 / ฿499, or a 7-Day Pass for ฿590.', 'The activity price is paid to the host at the meeting point.'],
  },
  payment: {
    th: ['ค่ากิจกรรมจ่ายให้โฮสต์โดยตรงที่จุดนัดตอนเช็กอินค่ะ (PromptPay QR หรือเงินสด)', 'ตั๋วจองซื้อในแอป Kring'],
    en: ['You pay the host directly at check-in at the meeting point (PromptPay QR or cash).', 'Booking tickets are bought in the Kring app.'],
  },
  guests_safety: {
    th: ['โฮสต์ทุกคนยืนยันตัวตนแล้วค่ะ', 'นัดในที่สาธารณะเท่านั้น และเช็กอินที่จุดนัด', 'ไม่มีสถานบันเทิงยามค่ำคืน'],
    en: ['Every host is ID-verified.', 'You only meet at public places and check in at the meeting point.', 'No nightlife venues.'],
  },
  activities: {
    th: ['กิจกรรม 90 นาทีที่ตั้งชื่อชัดเจนค่ะ เช่น เดินคาเฟ่ / ถ่ายรูป / เวิร์กช็อป / บอร์ดเกม / เดินตลาด–ของกิน', 'ทำกับโฮสต์ที่ยืนยันตัวตนแล้ว ในที่สาธารณะช่วงกลางวันถึงหัวค่ำ'],
    en: ['Named 90-min activities, e.g. café walk / photo walk / workshop / board games / market or food walk.', 'With an ID-verified host, at public places, daytime to early evening.'],
  },
  time: {
    th: ['แต่ละกิจกรรมใช้เวลา 90 นาทีค่ะ', 'เลือกช่วงเวลาที่โฮสต์เปิดไว้ได้เลย'],
    en: ['Each activity is 90 minutes.', 'Pick one of the time slots the host has opened.'],
  },
  location: {
    th: ['นัดที่สถานที่สาธารณะในกรุงเทพฯ เช่น คาเฟ่ ตลาด ค่ะ', 'เช็กอินที่จุดนัด (พัทยาจะตามมาทีหลัง)'],
    en: ['Public places in Bangkok, like cafés or markets.', 'You check in at the meeting point (Pattaya comes later).'],
  },
  launch: {
    th: ['Kring เปิดเดือนพฤศจิกายนนี้ค่ะ ✨', 'ลงชื่อรอไว้ แล้วเราจะแจ้งในแชทนี้เมื่อมีโฮสต์ย่านที่คุณเลือก'],
    en: ['Kring launches in November ✨', "Join the waitlist and we'll tell you here as soon as there's a host in your area."],
  },
  languages: {
    th: ['ได้เลยค่ะ แอป Kring ใช้ได้ 7 ภาษา: ไทย อังกฤษ จีน เกาหลี ฮินดี รัสเซีย มาเลย์'],
    en: ['Yes, the Kring app works in 7 languages: Thai, English, Chinese, Korean, Hindi, Russian and Malay.'],
  },
  group_size: {
    th: ['จองได้ไม่เกิน 2 คนต่อการจองค่ะ'],
    en: ['Each booking is for max 2 people.'],
  },
  trust: {
    th: ['เข้าใจเลยค่ะ 🙏 Kring ไม่เคยขอ OTP หรือเลขบัญชีธนาคาร', 'ค่ากิจกรรมจ่ายให้โฮสต์โดยตรงที่จุดนัด และโฮสต์ทุกคนยืนยันตัวตน', 'เว็บไซต์ทางการคือ kringapp.com ค่ะ'],
    en: ['Fair question 🙏 Kring never asks for OTPs or bank account numbers.', 'You pay the host directly at the meeting point, and every host is ID-verified.', 'Our official site is kringapp.com.'],
  },
  id_check: {
    th: ['โฮสต์ทุกคนบน Kring ยืนยันตัวตนค่ะ เพื่อให้ผู้จองมั่นใจ', 'เราไม่เคยขอ OTP หรือเลขบัญชีธนาคารค่ะ'],
    en: ['Every host on Kring is ID-verified, so you can book with confidence.', 'We never ask for OTPs or bank account numbers.'],
  },
}
for (const [intent, lines] of Object.entries(GUEST) as Array<[FaqIntent, Lines]>) {
  FAQ_ANSWERS[intent] = { ...(FAQ_ANSWERS[intent] || {}), guest: lines }
}


/** Answer lines for (intent, role) or null if the playbook has no locked fact for it. */
export function faqAnswer(intent: FaqIntent, role: LeadRole, lang: Lang): string[] | null {
  const g = roleGroup(role)
  if (!g) return null
  if (intent === 'signup') return [] // handled by the stage machine (sends the real sign-up flow)
  const a = FAQ_ANSWERS[intent]?.[g]
  return a ? (lang === 'en' ? a.en : a.th) : null
}
