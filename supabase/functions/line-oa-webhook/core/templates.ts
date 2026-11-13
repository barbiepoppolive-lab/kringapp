// Locked-playbook templates (Thai + English). Every string here must pass checkOutbound();
// tests/templates.test.ts enforces that for all templates.
import type { Lang, OutMessage, QuickReply } from './types.ts'
import { shortEcho } from './text.ts'

export const SIGN_OFF = '— Barbie · Kring'
export const SIGNUP_BASE = 'https://kringapp.com/app/#hverify?ref='

export function signupLink(ref: string | null | undefined): string {
  const r = ref && /^[SC]-[A-Z0-9]{4}$/.test(ref) ? ref : 'oa'
  return `${SIGNUP_BASE}${r}`
}

const qr = (pairs: Array<[string, string]>): QuickReply[] => pairs.map(([label, text]) => ({ label, text }))

type L<T> = { th: T; en: T }
const pick = <T>(lang: Lang, v: L<T>): T => (lang === 'en' ? v.en : v.th)

// ---------------------------------------------------------------- quick replies
export const QR = {
  host: (lang: Lang) =>
    pick(lang, {
      th: qr([['สนใจเป็นโฮสต์', 'สนใจเป็นโฮสต์'], ['ขอรายละเอียด', 'ขอรายละเอียด'], ['ไม่สนใจ', 'ไม่สนใจ']]),
      en: qr([['I want to host', 'I want to host'], ['Send details', 'Send details'], ['Not interested', 'Not interested']]),
    }),
  sup: (lang: Lang) =>
    pick(lang, {
      th: qr([['สนใจเป็นคอนเนคเตอร์', 'สนใจเป็นคอนเนคเตอร์'], ['ขอรายละเอียด', 'ขอรายละเอียด'], ['ไม่สนใจ', 'ไม่สนใจ']]),
      en: qr([['Be a connector', 'I want to be a connector'], ['Send details', 'Send details'], ['Not interested', 'Not interested']]),
    }),
  general: (lang: Lang, scout: boolean) => {
    const base = pick(lang, {
      th: [['อยากจองกิจกรรม', 'อยากจองกิจกรรม'], ['อยากเป็นโฮสต์', 'อยากเป็นโฮสต์'], ['เป็นคอนเนคเตอร์', 'สนใจเป็นคอนเนคเตอร์']] as Array<[string, string]>,
      en: [['Book an activity', 'I want to book an activity'], ['I want to host', 'I want to host'], ['Be a connector', 'I want to be a connector']] as Array<[string, string]>,
    })
    if (scout) base.push(pick(lang, { th: ['สมัครสเก๊าต์', 'สมัครสเก๊าต์'], en: ['Apply as scout', 'Apply as scout'] }))
    return qr(base)
  },
  venue: (lang: Lang) =>
    pick(lang, {
      th: qr([['สนใจร่วมเป็นร้าน', 'สนใจร่วมเป็นร้าน'], ['คุยกับแอดมิน', 'ขอคุยกับแอดมิน'], ['ไม่สนใจ', 'ไม่สนใจ']]),
      en: qr([['Venue partner', 'Interested as a venue'], ['Talk to admin', 'Talk to admin'], ['Not interested', 'Not interested']]),
    }),
  pitchClose: (lang: Lang) =>
    pick(lang, {
      th: qr([['สมัครเลย', 'สมัครเลย'], ['มีคำถาม', 'มีคำถามค่ะ'], ['ไม่สนใจ', 'ไม่สนใจ']]),
      en: qr([['Sign me up', 'Sign me up'], ['I have a question', 'I have a question'], ['Not interested', 'Not interested']]),
    }),
  supCode: (lang: Lang) =>
    pick(lang, {
      th: qr([['รับรหัสเลย', 'รับรหัสเลย'], ['มีคำถาม', 'มีคำถามค่ะ'], ['ไม่สนใจ', 'ไม่สนใจ']]),
      en: qr([['Get my code', 'Get my code'], ['I have a question', 'I have a question'], ['Not interested', 'Not interested']]),
    }),
  noReferral: (lang: Lang) =>
    pick(lang, { th: qr([['ไม่มีค่ะ', 'ไม่มี']]), en: qr([['No code', 'No']]) }),
}

// ---------------------------------------------------------------- greetings
export function greeting(role: 'host' | 'sup' | 'venue' | 'general', lang: Lang, scoutEnabled = false): OutMessage[] {
  switch (role) {
    case 'host':
      return [
        {
          text: pick(lang, {
            th: 'สวัสดีค่ะ ขอบคุณที่แอด Kring (กริ๊ง!) ✨\nแอปจองกิจกรรม 90 นาทีในกรุงเทพฯ เปิดตัวเดือนพฤศจิกายนนี้\nโฮสต์ตั้งราคาเอง ได้รับ 100% สมัครฟรีค่ะ\nสนใจเป็นโฮสต์ไหมคะ?',
            en: 'Hi, thanks for adding Kring ✨\nA Bangkok app for booking 90-min activities, launching in November.\nHosts set their own price and keep 100%. Free to join.\nWould you like to host?',
          }),
          quickReplies: QR.host(lang),
        },
      ]
    case 'sup':
      return [
        {
          text: pick(lang, {
            th: 'สวัสดีค่ะ ขอบคุณที่แอด Kring (กริ๊ง!) ✨\nคอนเนคเตอร์ชวนคนที่รู้จักมาเป็นโฮสต์ แล้วรับเงินตามผลงานค่ะ\nสนใจฟังรายละเอียดไหมคะ?',
            en: 'Hi, thanks for adding Kring ✨\nConnectors invite people they know to become hosts and get paid per verified result.\nWant the details?',
          }),
          quickReplies: QR.sup(lang),
        },
      ]
    case 'venue':
      return [
        {
          text: pick(lang, {
            th: 'สวัสดีค่ะ ขอบคุณที่แอด Kring (กริ๊ง!) ✨\nแอปจองกิจกรรมในกรุงเทพฯ ที่นัดเจอกันในที่สาธารณะ เช่น คาเฟ่\nถ้าเป็นเจ้าของร้าน/ทีมงานร้าน พิมพ์บอกชื่อร้านได้เลยค่ะ',
            en: 'Hi, thanks for adding Kring ✨\nA Bangkok activity app where every booking meets at a public place, like a café.\nIf you run a venue, just type its name here.',
          }),
          quickReplies: QR.venue(lang),
        },
      ]
    default:
      return [
        {
          text: pick(lang, {
            th: 'สวัสดีค่ะ ขอบคุณที่แอด Kring (กริ๊ง!) ✨\nแอปจองกิจกรรม 90 นาทีกับโฮสต์ที่ยืนยันตัวตนแล้ว ในกรุงเทพฯ\nเปิดตัวเดือนพฤศจิกายนนี้ สนใจเรื่องไหนคะ?',
            en: 'Hi, thanks for adding Kring ✨\nBook a 90-min activity in Bangkok with an ID-verified host.\nLaunching in November. What are you interested in?',
          }),
          quickReplies: QR.general(lang, scoutEnabled),
        },
      ]
  }
}

// ---------------------------------------------------------------- host flow
export type HostStep = 'zone' | 'activity' | 'availability' | 'scout'

export function hostQuestion(step: HostStep, lang: Lang): OutMessage {
  switch (step) {
    case 'zone':
      return { text: pick(lang, { th: 'สะดวกจัดกิจกรรมโซนไหนของกรุงเทพฯ คะ? (เช่น อารีย์ / สยาม / ทองหล่อ)', en: 'Which area of Bangkok suits you? (e.g. Ari / Siam / Thonglor)' }) }
    case 'activity':
      return { text: pick(lang, { th: 'อยากจัดกิจกรรมแบบไหนคะ? (เช่น เดินคาเฟ่ / ถ่ายรูป / เวิร์กช็อป / บอร์ดเกม / เดินตลาด)', en: 'What activity would you run? (e.g. café walk / photo walk / workshop / board games / market walk)' }) }
    case 'availability':
      return { text: pick(lang, { th: 'สะดวกวันไหน ช่วงเวลาไหนบ้างคะ? (แค่ 1 ช่วงต่อสัปดาห์ก็ได้ค่ะ)', en: 'Which days and times work for you? (One slot a week is enough.)' }) }
    case 'scout':
      return {
        text: pick(lang, { th: 'มีคนแนะนำมาไหมคะ? ถ้ามีรหัส S-xxxx พิมพ์ได้เลยค่ะ', en: 'Did someone refer you? If you have an S-xxxx code, type it here.' }),
        quickReplies: QR.noReferral(lang),
      }
  }
}

export function hostSummary(lang: Lang): OutMessage {
  return {
    text: pick(lang, {
      th: 'Kring คือแอปจองกิจกรรม 90 นาทีในกรุงเทพฯ เปิดตัวเดือนพฤศจิกายนค่ะ ✨\nโฮสต์ตั้งราคาเอง (ปกติ ฿650–฿1,200) ได้รับ 100% Kring เก็บ 0%\nผู้จองจ่ายโฮสต์โดยตรงตอนเช็กอิน (PromptPay QR หรือเงินสด)\nสมัครฟรี ไม่มีมัดจำ นัดในที่สาธารณะเท่านั้น ผู้จองไม่เกิน 2 คน',
      en: 'Kring is a Bangkok app for booking 90-min activities, launching in November ✨\nHosts set their price (usually ฿650–฿1,200) and keep 100%; Kring takes 0%.\nGuests pay the host directly at check-in (PromptPay QR or cash).\nFree to join, no deposit, public places only, max 2 guests per booking.',
    }),
  }
}

export function hostAck(lang: Lang): string {
  return pick(lang, { th: 'ยินดีมากค่ะ ✨ ขอถามสั้นๆ ทีละข้อนะคะ', en: "Great ✨ A few quick questions, one at a time." })
}

export function hostNightlifeNote(lang: Lang): OutMessage {
  return {
    text: pick(lang, {
      th: 'Kring รับเฉพาะกิจกรรมในที่สาธารณะช่วงกลางวันถึงหัวค่ำค่ะ ไม่รับสถานบันเทิงยามค่ำคืน 🙏\nมีกิจกรรมแบบอื่นที่อยากจัดไหมคะ? (เช่น เดินคาเฟ่ / ถ่ายรูป / เวิร์กช็อป)',
      en: 'Kring only allows public daytime and early-evening activities, no nightlife 🙏\nIs there another activity you would like to run? (e.g. café walk / photo walk / workshop)',
    }),
  }
}

export function hostPitch(lang: Lang, zone: string | null, activity: string | null): OutMessage[] {
  const z = shortEcho(zone)
  const a = shortEcho(activity)
  const personal = z && a
    ? pick(lang, { th: `• ${a} โซน${z} ครั้งละ 90 นาที ผู้จองไม่เกิน 2 คน`, en: `• ${a} in ${z}, 90 minutes, max 2 guests` })
    : pick(lang, { th: '• กิจกรรมของคุณ ครั้งละ 90 นาที ผู้จองไม่เกิน 2 คน', en: '• Your activity, 90 minutes, max 2 guests' })
  return [
    {
      text: [
        pick(lang, { th: 'สรุปข้อเสนอสำหรับคุณค่ะ ✨', en: 'Here is the offer ✨' }),
        personal,
        pick(lang, { th: '• ตั้งราคาเอง ได้รับ 100% (Kring เก็บ 0%) ผู้จองจ่ายคุณตรงตอนเช็กอิน', en: '• You set the price and keep 100% (Kring takes 0%); guests pay you at check-in' }),
        pick(lang, { th: '• สมัครฟรี ไม่มีมัดจำ ผู้จองจองล่วงหน้าด้วยตั๋ว จึงเบี้ยวนัดน้อยลง', en: '• Free to join, no deposit; guests pre-book with a ticket, so fewer no-shows' }),
      ].join('\n'),
    },
    { text: pick(lang, { th: 'พร้อมสมัครเลยไหมคะ?', en: 'Ready to sign up?' }), quickReplies: QR.pitchClose(lang) },
  ]
}

/** Generic pitch without user echo (used if the echo trips the guard). */
export function hostPitchGeneric(lang: Lang): OutMessage[] {
  return hostPitch(lang, null, null)
}

export function hostClose(lang: Lang, ref: string | null): OutMessage[] {
  return [
    {
      text: pick(lang, {
        th: `เยี่ยมเลยค่ะ ✨ สมัครได้ที่ลิงก์นี้นะคะ\n${signupLink(ref)}`,
        en: `Wonderful ✨ Sign up here:\n${signupLink(ref)}`,
      }),
    },
    {
      text: pick(lang, {
        th: '3 ขั้นตอน:\n1) ยืนยันบัตรประชาชน + รูปโปรไฟล์\n2) เพิ่ม 1 กิจกรรม (ตั้งราคาเอง)\n3) เลือกเวลาว่าง 1 ช่วงต่อสัปดาห์ ติดตรงไหนถามในแชทนี้ได้เลยค่ะ',
        en: '3 steps:\n1) ID check + profile photo\n2) Add one activity (you set the price)\n3) Pick one weekly time slot. Stuck anywhere? Ask me here.',
      }),
    },
  ]
}

export function hostLinkAgain(lang: Lang, ref: string | null): OutMessage {
  return { text: pick(lang, { th: `ลิงก์สมัครค่ะ 🙏\n${signupLink(ref)}`, en: `Here is your sign-up link 🙏\n${signupLink(ref)}` }) }
}

export function hostOnboarded(lang: Lang): OutMessage {
  return {
    text: pick(lang, {
      th: 'ขอบคุณมากค่ะ ✨ ทีมงานจะตรวจข้อมูลให้นะคะ\nมีคำถามเรื่องตั้งกิจกรรมหรือราคา พิมพ์ในแชทนี้ได้เลยค่ะ',
      en: "Thank you ✨ Our team will review your profile.\nAny questions about your activity or price, just ask here.",
    }),
  }
}

// ---------------------------------------------------------------- sup flow
export function supPitch(lang: Lang): OutMessage[] {
  return [
    {
      text: pick(lang, {
        th: 'ผู้ประสานงาน (Sup) ชวนคนที่รู้จักซึ่งมีงานอดิเรกจริง อายุ 20+ มาเปิดกิจกรรมบน Kring ค่ะ ✨\n฿300 เมื่อโฮสต์คนแรกของคุณยืนยันตัวตนและเปิดรอบแรก จากนั้น +฿100 ต่อโฮสต์ ไม่จำกัดจำนวน\n+฿200 เมื่อโฮสต์คนนั้นมีผู้จองเช็กอินจริงครั้งแรก · ครบ 10 โฮสต์ +฿1,000 · 25 โฮสต์ +฿3,000\nโอนพร้อมเพย์เข้าบัญชีชื่อตัวเองภายใน 48 ชม. หลังตรวจผล ไม่ใช่งานขายตรง ไม่มีค่าสมัคร',
        en: 'Coordinators (Sup) invite people they know with a real hobby, 20+, to host on Kring ✨\n฿300 when your first host verifies and publishes a first slot, then +฿100 per host, no cap\n+฿200 when that host\'s first real guest checks in · 10 hosts +฿1,000 · 25 hosts +฿3,000\nPaid to an account in your own name within 48h of review. Not direct sales, no fees.',
      }),
    },
    {
      text: pick(lang, {
        th: 'ไม่มีระบบหลายชั้น นับเฉพาะคนที่คุณชวนเองค่ะ\nรับรหัสแนะนำส่วนตัวเลยไหมคะ?',
        en: 'No multi-level: only people you bring yourself count.\nShall I give you your personal referral code?',
      }),
      quickReplies: QR.supCode(lang),
    },
  ]
}

export function supCode(lang: Lang, code: string): OutMessage[] {
  return [
    {
      text: pick(lang, {
        th: `รหัสแนะนำของคุณ: ${code} ✨\nลิงก์ส่งให้คนที่อยากเป็นโฮสต์:\n${signupLink(code)}`,
        en: `Your referral code: ${code} ✨\nLink to send to future hosts:\n${signupLink(code)}`,
      }),
    },
    {
      text: pick(lang, {
        th: 'วิธีนับผลงาน:\nโฮสต์ต้องสมัครผ่านลิงก์หรือใส่รหัสนี้\nทีมงานตรวจผลแล้วโอนเข้าบัญชีชื่อตัวเองภายใน 48 ชม. ค่ะ',
        en: 'How results are verified:\nHosts must sign up via your link or enter this code.\nWe review results and pay to an account in your own name within 48h.',
      }),
    },
    { text: supAskPromptPay(lang).text },
  ]
}

export function supAskPromptPay(lang: Lang): OutMessage {
  return {
    text: pick(lang, {
      th: 'ข้อมูลรับเงินกรอกในสัญญาฟรีแลนซ์เท่านั้นนะคะ เราไม่ขอเลขบัญชีหรือเบอร์พร้อมเพย์ทางแชตค่ะ 🙏 เริ่มส่งลิงก์ให้คนที่รู้จักได้เลยค่ะ',
      en: 'Payout details go only in the freelance contract; we never ask for account or PromptPay numbers in chat 🙏 You can start sharing your link now.',
    }),
  }
}

export function invalidPhone(lang: Lang): OutMessage {
  return {
    text: pick(lang, {
      th: 'ไม่ต้องส่งเลขบัญชี เบอร์พร้อมเพย์ หรือเลขบัตรทางแชตนะคะ 🙏 ข้อมูลรับเงินกรอกในสัญญาเท่านั้นค่ะ',
      en: 'Please don\'t send account, PromptPay or ID numbers in chat 🙏 Payout details go only in the contract.',
    }),
  }
}

export function supReady(lang: Lang, code: string): OutMessage {
  return {
    text: pick(lang, {
      th: `ได้รับเบอร์ PromptPay แล้วค่ะ ขอบคุณนะคะ 🙏\nเริ่มส่งลิงก์ที่มีรหัส ${code} ให้คนที่รู้จักได้เลยค่ะ`,
      en: `Got your PromptPay number, thank you 🙏\nStart sharing your link with code ${code}.`,
    }),
  }
}

export function supCodeAgain(lang: Lang, code: string): OutMessage {
  return { text: pick(lang, { th: `รหัสของคุณ: ${code}\n${signupLink(code)}`, en: `Your code: ${code}\n${signupLink(code)}` }) }
}

// ---------------------------------------------------------------- scout application
export type ScoutStep = 'zone' | 'availability' | 'experience' | 'hobbies'

export function scoutIntro(lang: Lang): OutMessage {
  return {
    text: pick(lang, {
      th: 'ขอบคุณที่สนใจร่วมทีม Kring ค่ะ 🙏\nสำหรับผู้ที่อายุ 20+ ค่าตอบแทนตามผลงาน: ฿300 เมื่อโฮสต์คนแรกของคุณเปิดรอบแรก จากนั้น +฿100 ต่อโฮสต์ และ +฿200 เมื่อโฮสต์มีผู้จองเช็กอินจริงครั้งแรก\nไม่ใช่งานขายตรง ไม่มีค่าสมัคร และเราไม่ขอเลขบัญชีหรือบัตรทางแชตค่ะ\nขอถามทีละข้อนะคะ',
      en: 'Thanks for wanting to join the Kring team 🙏\n20+ only, paid on results: ฿300 when your first host publishes a first slot, then +฿100 per host, +฿200 when that host\'s first real guest checks in.\nNot direct sales, no fees, and we never ask for bank or ID details in chat.\nOne question at a time:',
    }),
  }
}

export function scoutQuestion(step: ScoutStep, lang: Lang): OutMessage {
  switch (step) {
    case 'zone':
      return { text: pick(lang, { th: '1/4 สะดวกลงพื้นที่โซนไหนของกรุงเทพฯ คะ?', en: '1/4 Which Bangkok area can you cover?' }) }
    case 'availability':
      return { text: pick(lang, { th: '2/4 สะดวกวันไหน ช่วงเวลาไหนบ้างคะ?', en: '2/4 Which days and times are you available?' }) }
    case 'experience':
      return { text: pick(lang, { th: '3/4 เคยทำงาน PC / BA / อีเวนต์ หรือติดต่อร้านค้าไหมคะ? เล่าสั้นๆ ได้เลยค่ะ', en: '3/4 Any experience with PC / BA / events or talking to shops? A short line is fine.' }) }
    case 'hobbies':
      return {
        text: pick(lang, {
          th: '4/4 คนรอบตัวคุณมีงานอดิเรกอะไรบ้างคะ (เช่น กาแฟ ถ่ายรูป บอร์ดเกม งานฝีมือ)?',
          en: '4/4 What hobbies do people around you have (e.g. coffee, photography, board games, crafts)?',
        }),
      }
  }
}

export function scoutSubmitted(lang: Lang, code: string): OutMessage {
  return {
    text: pick(lang, {
      th: `ได้รับใบสมัครแล้วค่ะ 🙏\nรหัสสเก๊าต์ของคุณ: ${code}\nทีมงานจะตอบกลับในแชทนี้ภายใน 24 ชม. นะคะ (ข้อมูลรับเงินกรอกในสัญญาเท่านั้น ไม่ส่งทางแชตค่ะ)`,
      en: `Application received 🙏\nYour scout code: ${code}\nWe will reply in this chat within 24h.`,
    }),
  }
}

export function askAway(lang: Lang): OutMessage {
  return { text: pick(lang, { th: 'ได้เลยค่ะ พิมพ์คำถามมาในแชทนี้ได้เลยนะคะ 🙏', en: 'Of course, type your question here 🙏' }) }
}

/** Immediate acknowledgement when no LLM is configured; the scheduled Claude agent answers later. */
export function agentAck(lang: Lang): OutMessage {
  return { text: pick(lang, { th: 'ขอบคุณค่ะ 🙏 ได้รับข้อความแล้ว เดี๋ยวตอบกลับในแชทนี้นะคะ', en: "Thank you 🙏 Got your message, we'll reply in this chat shortly." }) }
}

// ---------------------------------------------------------------- guest waitlist
export type GuestStep = 'activity' | 'area' | 'when' | 'size'

export function guestIntro(lang: Lang): OutMessage {
  return {
    text: pick(lang, {
      th: 'ยินดีค่ะ ✨ Kring คือแอปจองกิจกรรม 90 นาทีกับโฮสต์ในกรุงเทพฯ ที่ยืนยันตัวตนแล้ว นัดในที่สาธารณะเท่านั้น\nเปิดเดือนพฤศจิกายน ลงชื่อรอไว้ได้เลย ขอถามทีละข้อนะคะ',
      en: 'Lovely ✨ Kring lets you book a 90-min activity in Bangkok with an ID-verified host, always at a public place.\nWe launch in November; join the waitlist with a few quick questions.',
    }),
  }
}

export function guestQuestion(step: GuestStep, lang: Lang): OutMessage {
  switch (step) {
    case 'activity':
      return {
        text: pick(lang, { th: 'อยากทำกิจกรรมแบบไหนคะ?', en: 'What would you like to do?' }),
        quickReplies: pick(lang, {
          th: qr([['เดินคาเฟ่', 'เดินคาเฟ่'], ['ถ่ายรูปกับช่างภาพ', 'ถ่ายรูปกับช่างภาพ'], ['เดินตลาด-ของกิน', 'เดินตลาด-ของกิน'], ['เวิร์กช็อป', 'เวิร์กช็อป'], ['บอร์ดเกม', 'บอร์ดเกม'], ['อื่นๆ', 'อื่นๆ']]),
          en: qr([['Café walk', 'Café walk'], ['Photo walk', 'Photo walk with a photographer'], ['Market/food walk', 'Market/food walk'], ['Workshop', 'Workshop'], ['Board games', 'Board games'], ['Other', 'Other']]),
        }),
      }
    case 'area':
      return {
        text: pick(lang, { th: 'สะดวกย่านไหนของกรุงเทพฯ คะ? (เช่น อารีย์ / สยาม / ทองหล่อ)', en: 'Which area of Bangkok? (e.g. Ari / Siam / Thonglor)' }),
        quickReplies: pick(lang, { th: qr([['ยังไม่แน่ใจ', 'ยังไม่แน่ใจ']]), en: qr([['Not sure yet', 'Not sure yet']]) }),
      }
    case 'when':
      return {
        text: pick(lang, { th: 'สะดวกช่วงไหนคะ?', en: 'When suits you?' }),
        quickReplies: pick(lang, {
          th: qr([['เสาร์-อาทิตย์', 'เสาร์-อาทิตย์'], ['วันธรรมดาเย็น', 'วันธรรมดาเย็น'], ['ยังไม่แน่ใจ', 'ยังไม่แน่ใจ']]),
          en: qr([['Weekend', 'Weekend'], ['Weekday evening', 'Weekday evening'], ['Not sure yet', 'Not sure yet']]),
        }),
      }
    case 'size':
      return {
        text: pick(lang, { th: 'มากันกี่คนคะ? (1–2 คน)', en: 'How many people? (1–2)' }),
        quickReplies: pick(lang, { th: qr([['1 คน', '1 คน'], ['2 คน', '2 คน']]), en: qr([['1 person', '1 person'], ['2 people', '2 people']]) }),
      }
  }
}

export function guestOtherPrompt(lang: Lang): OutMessage {
  return { text: pick(lang, { th: 'พิมพ์บอกกิจกรรมที่อยากทำได้เลยค่ะ ✨', en: 'Just type the activity you have in mind ✨' }) }
}

export function guestActivityRedirect(lang: Lang): OutMessage {
  return {
    text: pick(lang, {
      th: 'Kring เป็นการจองกิจกรรม 90 นาทีในที่สาธารณะค่ะ เช่น เดินคาเฟ่ ถ่ายรูป เวิร์กช็อป 🙏\nอยากทำกิจกรรมแบบไหนคะ?',
      en: 'Kring is about booking a 90-min activity at a public place, like a café walk, photo walk or workshop 🙏\nWhich activity would you like?',
    }),
    quickReplies: guestQuestion('activity', lang).quickReplies,
  }
}

export function guestSizeLimit(lang: Lang): OutMessage {
  return {
    text: pick(lang, { th: 'จองได้ไม่เกิน 2 คนต่อการจองนะคะ 🙏\nมากันกี่คนคะ? (1–2 คน)', en: 'Each booking is for max 2 people 🙏\nHow many people? (1–2)' }),
    quickReplies: guestQuestion('size', lang).quickReplies,
  }
}

export function guestWaitlisted(lang: Lang): OutMessage {
  return {
    text: pick(lang, {
      th: 'ลงชื่อรอไว้แล้วค่ะ ✨ Kring เปิดเดือนพฤศจิกายน จะแจ้งในแชทนี้เมื่อมีโฮสต์ย่านที่คุณเลือกนะคะ',
      en: "You're on the waitlist ✨ Kring launches in November; we'll tell you in this chat as soon as there's a host in your area.",
    }),
  }
}

export function guestAlreadyWaitlisted(lang: Lang): OutMessage {
  return {
    text: pick(lang, {
      th: 'คุณลงชื่อรอไว้แล้วค่ะ ✨ จะแจ้งในแชทนี้เมื่อมีโฮสต์ย่านที่คุณเลือกนะคะ\nมีอะไรอยากถามเพิ่มไหมคะ?',
      en: "You're already on the waitlist ✨ we'll tell you here as soon as there's a host in your area.\nAnything else you'd like to ask?",
    }),
  }
}

// ---------------------------------------------------------------- host video / photo
export function hostVideoRequest(lang: Lang): OutMessage {
  return {
    text: pick(lang, {
      th: "อีกนิดนะคะ 🎥 ถ่ายวิดีโอสั้น 15–20 วินาทีจากมือถือ โชว์กิจกรรมที่คุณจะพาทำ (คาเฟ่ ซอย มุมถ่ายรูป ของที่ทำ) แล้วส่งในแชทนี้ได้เลยค่ะ ใช้เป็นวิดีโอโปรไฟล์ของคุณ และ Kring จะนำไปโปรโมตโฮสต์ในโซเชียลของ Kring ด้วย (ถ้าไม่สะดวกให้ใช้โปรโมต พิมพ์ 'ไม่โปรโมต' ได้เลยค่ะ)",
      en: "One more thing 🎥 Film a short 15–20 second phone video showing the activity you'll run (the café, the street, photo spots, what you make) and send it here. It becomes your profile video, and Kring will also use it to promote hosts on Kring's social media (if you'd rather not, just type 'no promo').",
    }),
  }
}

export function mediaReceived(kind: 'video' | 'image', lang: Lang): OutMessage {
  return kind === 'video'
    ? { text: pick(lang, { th: 'ได้รับวิดีโอแล้วค่ะ ขอบคุณมากนะคะ ✨', en: 'Got your video, thank you so much ✨' }) }
    : { text: pick(lang, { th: 'ได้รับรูปแล้วค่ะ ขอบคุณมากนะคะ ✨', en: 'Got your photo, thank you so much ✨' }) }
}

export function mediaTooLarge(lang: Lang): OutMessage {
  return { text: pick(lang, { th: 'ไฟล์ใหญ่เกิน 50 MB ค่ะ รบกวนส่งคลิปสั้นลง (15–20 วินาที) นะคะ 🙏', en: 'That file is over 50 MB 🙏 Please send a shorter clip (15–20 seconds).' }) }
}

export function noPromoAck(lang: Lang): OutMessage {
  return {
    text: pick(lang, {
      th: 'รับทราบค่ะ 🙏 จะใช้วิดีโอเป็นโปรไฟล์ของคุณเท่านั้น ไม่นำไปโปรโมตในโซเชียลนะคะ',
      en: "Noted 🙏 We'll use your video for your profile only, not for social media promotion.",
    }),
  }
}

// ---------------------------------------------------------------- system replies
export function stopConfirm(lang: Lang): OutMessage {
  return { text: pick(lang, { th: 'รับทราบค่ะ จะไม่ส่งข้อความหาอีกนะคะ ขอบคุณค่ะ 🙏', en: "Understood, we won't message you again. Thank you 🙏" }) }
}

export function humanHandoff(lang: Lang): OutMessage {
  return { text: pick(lang, { th: 'ได้เลยค่ะ Barbie จะตอบในแชทนี้นะคะ 🙏', en: 'Sure, Barbie will reply to you here in this chat 🙏' }) }
}

export function handoffAck(lang: Lang): OutMessage {
  return { text: pick(lang, { th: 'ขอบคุณค่ะ 🙏 ได้รับข้อความแล้ว Barbie จะตอบในแชทนี้นะคะ', en: 'Thank you 🙏 Message received, Barbie will reply in this chat.' }) }
}

// ---------------------------------------------------------------- follow-ups (Push API)
export function followupText(
  role: string,
  stage: string,
  n: 1 | 2,
  lang: Lang,
  ref: string | null,
): string {
  const stopHint = pick(lang, { th: 'ถ้าไม่สะดวก พิมพ์ "หยุด" ได้เลยค่ะ', en: 'Not for you? Just type "STOP".' })
  if (role === 'host' && stage === 'close') {
    return n === 1
      ? pick(lang, { th: `สวัสดีค่ะ ลิงก์สมัครโฮสต์ยังใช้ได้นะคะ ✨\n${signupLink(ref)}\n${stopHint}`, en: `Hi, your host sign-up link still works ✨\n${signupLink(ref)}\n${stopHint}` })
      : pick(lang, { th: `ข้อความสุดท้ายจากเรานะคะ 🙏 ติดขั้นตอนไหน พิมพ์ถามในแชทนี้ได้เลยค่ะ\n${signupLink(ref)}`, en: `Last note from us 🙏 Stuck on a step? Ask here anytime.\n${signupLink(ref)}` })
  }
  if (role === 'sup') {
    return n === 1
      ? pick(lang, { th: `สวัสดีค่ะ แวะมาถามต่อนะคะ ✨\nผู้ประสานงานได้ ฿300 เมื่อโฮสต์คนแรกเปิดรอบแรก แล้ว +฿100 ต่อโฮสต์\nสนใจพิมพ์ "สนใจ" ได้เลยค่ะ ${stopHint}`, en: `Hi, just checking in ✨\nCoordinators earn ฿300 when their first host publishes a first slot, then +฿100 per host.\nType "interested" to continue. ${stopHint}` })
      : pick(lang, { th: 'ข้อความสุดท้ายจากเรานะคะ 🙏 ถ้าอยากเริ่มเมื่อไหร่ พิมพ์ "สนใจ" ในแชทนี้ได้เลยค่ะ', en: 'Last note from us 🙏 Whenever you want to start, type "interested" here.' })
  }
  if (role === 'scout') {
    return n === 1
      ? pick(lang, { th: `สวัสดีค่ะ ใบสมัครสเก๊าต์ยังไม่ครบนะคะ ✨ ตอบคำถามล่าสุดในแชทนี้ได้เลยค่ะ\n${stopHint}`, en: `Hi, your scout application isn't complete yet ✨ Just answer the last question here.\n${stopHint}` })
      : pick(lang, { th: 'ข้อความสุดท้ายจากเรานะคะ 🙏 ถ้ายังสนใจ ตอบในแชทนี้ได้เลยค่ะ', en: 'Last note from us 🙏 Still interested? Reply here anytime.' })
  }
  // host (non-close) and general
  return n === 1
    ? pick(lang, { th: `สวัสดีค่ะ แวะมาถามต่อนะคะ ✨\nเป็นโฮสต์กับ Kring สมัครฟรี ได้รับ 100% ของราคาที่ตั้งเอง\nสนใจพิมพ์ "สนใจ" ได้เลยค่ะ ${stopHint}`, en: `Hi, just checking in ✨\nHosting on Kring is free and you keep 100% of your own price.\nType "interested" to continue. ${stopHint}` })
    : pick(lang, { th: 'ข้อความสุดท้ายจากเรานะคะ 🙏 Kring เปิดตัวเดือนพฤศจิกายน อยากเริ่มเมื่อไหร่ พิมพ์ "สนใจ" ได้เลยค่ะ', en: 'Last note from us 🙏 Kring launches in November. Whenever you want to start, type "interested" here.' })
}
