// Deterministic brand-voice filter: Barbie is female-polite in Thai.
// Runs on EVERY outbound text (templates, FAQ, LLM, agent, follow-ups) before the guardrail.
//   ครับ → ค่ะ (คะ in questions), นะครับ → นะคะ, ครับผม → ค่ะ
//   pronoun ผม / กระผม → เรา   (but not ผม = hair: ทำผม, ตัดผม, ผมยาว …)
import type { OutMessage } from './types.ts'

// "ผม" meaning hair: preceded/followed by these words.
const HAIR_BEFORE = /(ทำ|ตัด|สระ|ย้อม|ดัด|หวี|ไดร์|ไดร์ฟ|เส้น|ทรง|สี|ร้านทำ|เกล้า|มัด|ถัก|ปิด|ไว้|ยาวถึง|เส้น)$/
const HAIR_AFTER = /^(ยาว|สั้น|หงอก|ร่วง|เปีย|หยิก|ตรง|ม้า|สี|ทรง|บาง|หนา|เผ้า|ดำ|แห้ง)/

function questionContext(after: string): boolean {
  return /^\s*[?？]/.test(after)
}

export function femalePoliteTh(input: string): string {
  let s = String(input ?? '')
  if (!/ครับ|คับ|ผม/.test(s)) return s
  s = s.replace(/ครับผม/g, 'ค่ะ')
  s = s.replace(/นะครับ/g, 'นะคะ')
  // ครับ before a question mark, or after a question word → คะ; otherwise ค่ะ
  s = s.replace(/(ไหม|มั้ย|มัย|หรือเปล่า|รึเปล่า|เหรอ|หรอ|ยังไง|อะไร|ไหน|เท่าไหร่|เท่าไร|กี่|ใคร|ทำไม|เมื่อไหร่|หรือยัง|บ้าง)\s*ครับ/g, '$1คะ')
  s = s.replace(/ครับ(?=\s*[?？])/g, 'คะ')
  s = s.replace(/ครับ/g, 'ค่ะ')
  // informal "คับ" as a particle (end of clause only, to avoid words like คับแคบ)
  s = s.replace(/คับ(?=\s*($|[\s.!?？🙏✨]))/g, (_m, _g, off: number, whole: string) => (questionContext(whole.slice(off + 3)) ? 'คะ' : 'ค่ะ'))
  // pronouns
  s = s.replace(/กระผม/g, 'เรา')
  s = s.replace(/ผม/g, (m, off: number, whole: string) => {
    const before = whole.slice(0, off)
    const after = whole.slice(off + m.length)
    if (HAIR_BEFORE.test(before) || HAIR_AFTER.test(after)) return m
    return 'เรา'
  })
  return s
}

export function applyVoice(msgs: OutMessage[]): OutMessage[] {
  return msgs.map((m) => ({
    ...m,
    text: femalePoliteTh(m.text),
    ...(m.quickReplies ? { quickReplies: m.quickReplies.map((q) => ({ label: femalePoliteTh(q.label), text: femalePoliteTh(q.text) })) } : {}),
  }))
}
