/**
 * Kring LINE OA webhook + closer bot (Supabase Edge Function, Deno).
 *
 * Extends the W1 single-OA webhook (@266jjwqh) to multi-OA routing:
 *   @304ikyuf host · @806oxwvj sup · @194hsqbc venue · @266jjwqh general + scout applications · @825eyKYW general
 *
 * Security invariants (unchanged from W1):
 * - Zero hardcoded secrets: LINE_OAS_JSON (or legacy LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN),
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, FOLLOWUP_CRON_SECRET come from env only.
 * - x-line-signature verified via Web Crypto HMAC-SHA256 over the raw body with the matching OA's secret.
 * - Every inbound event is still mirrored into public.kr6_oa_messages for the Control Room console.
 *
 * Core logic lives in ./core/*.ts (pure, Node-testable). This file wires env → deps and keeps the
 * legacy exports (constants, classifiers, verifyLineSignature, handleLineWebhookRequest) stable.
 */

// deno-lint-ignore-file no-explicit-any
import { getEnv, parseOaConfigs, parseSettings } from './core/config.ts'
import { handleWebhook, type WebhookDeps } from './core/handler.ts'
import { runFollowups as runFollowupsCore, type FollowupReport } from './core/followups.ts'
import { MemoryStore, SupabaseRestStore, type Store } from './core/store.ts'

export { verifyLineSignature, resolveOa, computeLineSignature } from './core/signature.ts'
export type { LineWebhookEvent } from './core/types.ts'
export { decide } from './core/stateMachine.ts'
export { checkOutbound } from './core/guardrail.ts'
export { selectFollowups, followupDue, inSendWindow } from './core/followups.ts'
export { handleWebhook, processEvent } from './core/handler.ts'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve?: (handler: (req: Request) => Promise<Response> | Response) => void
}

// ------------------------------------------------------------------ legacy W1 exports (kept verbatim)
export const LINE_OA_BASIC_ID = '@266jjwqh'
export const LINE_OA_ADD_FRIEND_URL = 'https://line.me/R/ti/p/@266jjwqh'

/**
 * Legacy 4-questions-at-once field reply. Kept for existing imports/tests; NOT sent any more —
 * "ภาคสนาม" now starts the one-question-at-a-time scout application (core/stateMachine.ts).
 */
export const FIELD_APPLICANT_AUTO_REPLY_TH = [
  'สวัสดีค่ะ ขอบคุณที่สนใจร่วมทีม Kring (LINE OA: @266jjwqh) ค่ะ 🙏',
  'รบกวนพิมพ์ข้อมูลสั้นๆ 4 ข้อนี้ตอบกลับมาได้เลยนะคะ:',
  '(a) ย่านในกรุงเทพฯ ที่สะดวก (เช่น อารีย์ / สามย่าน–บรรทัดทอง / ทรงวาด / พญาไท)',
  '(b) วันและช่วงเวลาที่สะดวก',
  '(c) ประสบการณ์งาน PC / BA / อีเวนต์ หรือประสานงานสั้นๆ',
  '(d) คนรอบตัวคุณมีงานอดิเรกอะไรบ้าง (เช่น กาแฟ ถ่ายรูป บอร์ดเกม งานฝีมือ)',
  'ไม่มีค่าสมัคร ไม่ใช่งานขายตรง และเราไม่ขอเลขบัญชี เบอร์พร้อมเพย์ หรือบัตรทางแชตค่ะ — Barbie · Kring (@266jjwqh)',
].join('\n')

/**
 * Legacy team-lead reply. Kept for existing imports; NOT sent — it contains amounts outside the
 * locked playbook (e.g. 30.-) and fails the guardrail. SUP keywords now route to the Sup connector pitch.
 */
export const TEAM_LEAD_APPLICANT_AUTO_REPLY_TH = [
  'สวัสดีค่ะ ขอบคุณที่สนใจสมัครตำแหน่ง SUP / หัวหน้าทีมประสานงานพาร์ทไทม์ (450.-/วัน + คอมฯ 30.-/เคส + โบนัส 2,000.- · ทดลองงาน 5 วัน การันตี BG 1,500.-) ค่ะ 🙏',
  'รบกวนพิมพ์ตอบข้อมูลสั้นๆ 5 ข้อนี้ในแชทนี้ได้เลยนะคะ:',
  '1) ชื่อเล่น / อายุ (ยืนยัน 20 ปีขึ้นไป) / เบอร์โทรติดต่อ',
  '2) โซน กทม. ที่คุ้นเคยที่สุด (อารีย์ / ทองหล่อ–เอกมัย / เจริญกรุง–ตลาดน้อย / สามย่าน–สยาม)',
  '3) เคยเป็น Sup / แอดมินดูแลกลุ่ม LINE / หรือดูแลชมรมอะไร และมีทีมงานกี่คนคะ',
  '4) หากเริ่มทดลองงาน 5 วันพรุ่งนี้ สามารถชวนเพื่อนหรือน้องๆ ในทีมมาร่วมเป็น Scout วันแรกได้ประมาณกี่คนคะ',
  '5) พิมพ์ภาษาอังกฤษสั้นๆ 1–2 ประโยค แนะนำตัวเองหรือสรุปงานตัวอย่างถึงเจ้าของโปรเจกต์ค่ะ (Write 1–2 short lines in English)',
  'เมื่อส่งครบแล้ว ทีมงานจะคัดเลือกและติดต่อกลับภายใน 24 ชม. ค่ะ 🙏',
].join('\n')

/** Venue Reply Library (D-066). Kept for imports; templates stay approved:false and are not auto-sent. */
export type VenueIntent = 'follow' | 'interested' | 'fee' | 'how' | 'stop' | 'handoff'
export const VENUE_REPLY_LIBRARY: Record<VenueIntent, { approved: boolean; textTh: string }> = {
  follow: {
    approved: false,
    textTh: [
      'สวัสดีค่ะ ขอบคุณที่แอด Kring · กริ๊ง! (กิจกรรม 90 นาที สำหรับทุกคน) ค่ะ 🙏',
      'ถ้าเป็นเจ้าของร้าน/ทีมงานร้าน พิมพ์ "สนใจ" ได้เลยค่ะ แล้วเราจะส่งลิงก์ตั้งค่าหน้าร้านให้ (ใช้เวลา 60 วินาที ค่าธรรมเนียมแอป 0%)',
    ].join('\n'),
  },
  interested: {
    approved: false,
    textTh: [
      'ขอบคุณมากค่ะ 🙏 ตั้งค่าหน้าร้านได้ 3 ขั้นตอน:',
      '1) เปิดลิงก์ https://kringapp.com/app/#venue-onboard',
      '2) ใส่ชื่อร้าน และเลือกส่วนลดสำหรับลูกค้า Kring (เช่น ฿200 เมื่อทานครบ ฿600)',
      '3) ยืนยันเบอร์ร้าน แล้วหน้าร้านจะขึ้นในแอปหลังทีมงานตรวจสอบค่ะ',
      'ลูกค้าจ่ายที่เคาน์เตอร์ร้านโดยตรง ไม่ต้องมีเครื่อง POS แคชเชียร์แค่เช็กรหัส Kring ของลูกค้าค่ะ',
    ].join('\n'),
  },
  fee: {
    approved: false,
    textTh: [
      'ค่าธรรมเนียมแอปสำหรับร้าน 0% ค่ะ ไม่มีค่าสมัคร ไม่มีค่ารายเดือน',
      'ลูกค้าจ่ายค่าอาหาร/เครื่องดื่มที่เคาน์เตอร์ร้านโดยตรง (Thai QR / บัตร / เงินสด) Kring ไม่รับเงินแทนร้านค่ะ',
      'ร้านแค่ให้ส่วนลดที่เลือกเองกับลูกค้า Kring และล็อกเงื่อนไขไว้ 6 เดือนค่ะ',
    ].join('\n'),
  },
  how: {
    approved: false,
    textTh: [
      'วิธีใช้งานง่ายมากค่ะ: ลูกค้า Kring มาที่ร้านกับโฮสต์คนไทย (ไม่เกิน 2 ท่านต่อการจอง) แล้วแสดงรหัส Kring ในแอป',
      'แคชเชียร์เช็กรหัส ใส่ส่วนลดที่ร้านตั้งไว้ แล้วรับเงินตามปกติค่ะ ไม่ต้องติดตั้งเครื่องหรือแอปเพิ่ม',
    ].join('\n'),
  },
  stop: {
    approved: false,
    textTh: 'รับทราบค่ะ เราได้นำร้านออกจากรายชื่อติดต่อแล้ว และจะไม่ส่งข้อความเรื่องนี้อีก ขอบคุณมากค่ะ 🙏',
  },
  handoff: {
    approved: false,
    textTh: 'ขอบคุณค่ะ 🙏 ได้รับข้อความแล้ว Barbie จะตอบกลับภายในวันนี้ค่ะ',
  },
}

export function classifyVenueIntent(text: string, eventType: string): VenueIntent {
  const t = String(text || '').toLowerCase().trim()
  if (eventType === 'follow') return 'follow'
  if (/^(ยกเลิก|ไม่สนใจ|stop|unsubscribe|ไม่ต้องส่ง)/i.test(t)) return 'stop'
  if (/(สัญญา|กฎหมาย|ร้องเรียน|คืนเงิน|โกง|ภาษี|contract|legal|refund|complain|lawyer)/i.test(t)) return 'handoff'
  if (/(ค่าธรรมเนียม|ค่าใช้จ่าย|เสียเงิน|ราคา|กี่บาท|ฟรีไหม|ฟรีมั้ย|fee|cost|price|commission|%)/i.test(t)) return 'fee'
  if (/(ยังไง|อย่างไร|ทำงาน|pos|เครื่อง|ใช้งาน|how)/i.test(t)) return 'how'
  if (/^(สนใจ|สมัคร|เข้าร่วม|ok|โอเค|ได้ค่ะ|ได้ครับ|yes|interested)/i.test(t) || /สนใจ/.test(t)) return 'interested'
  return 'handoff'
}

export function isFieldApplicantMessage(text: string): boolean {
  return /ภาคสนาม/.test(String(text || ''))
}

export function isTeamLeadApplicantMessage(text: string): boolean {
  return /^(SUP\b|SUP-[A-Z0-9]+|สมัคร\s*SUP|Team\s*Lead|หัวหน้าทีม)/i.test(String(text || '').trim())
}

// ------------------------------------------------------------------ env wiring
let cachedStore: Store | null = null
function storeFromEnv(): Store {
  if (cachedStore) return cachedStore
  const url = getEnv('SUPABASE_URL') || ''
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (url && key) cachedStore = new SupabaseRestStore(url, key, (i, init) => fetch(i, init))
  else {
    console.warn('[line-oa-webhook] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — using ephemeral in-memory store')
    cachedStore = new MemoryStore()
  }
  return cachedStore
}

export function depsFromEnv(overrides: Partial<WebhookDeps> = {}): WebhookDeps {
  return {
    oas: parseOaConfigs(getEnv),
    store: storeFromEnv(),
    settings: parseSettings(getEnv),
    fetchImpl: (i, init) => fetch(i, init),
    ...overrides,
  }
}

/** Legacy entry point (same signature as W1). */
export function handleLineWebhookRequest(req: Request): Promise<Response> {
  return handleWebhook(req, depsFromEnv())
}

/** Scheduled follow-ups (day-4 / day-9 Push). Also reachable as POST …/line-oa-webhook/followups with x-cron-secret. */
export function runFollowups(overrides: Partial<WebhookDeps> & { now?: Date } = {}): Promise<FollowupReport> {
  const { now, ...rest } = overrides
  const deps = depsFromEnv(rest)
  return runFollowupsCore({
    store: deps.store,
    oas: deps.oas,
    mode: deps.settings.mode,
    dailyCap: deps.settings.followupDailyCap,
    monthlyCapPerOa: deps.settings.followupMonthlyCapPerOa,
    fetchImpl: deps.fetchImpl,
    now,
  })
}

if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(handleLineWebhookRequest)
}
