// Anthropic Messages API client + prompt building + defensive JSON parsing.
import type { Lead, OaConfig, Turn } from './types.ts'
import { checkOutbound } from './guardrail.ts'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
export const ANTHROPIC_VERSION = '2023-06-01'

export const PLAYBOOK = `
FACTS (use only these; never invent numbers, dates, features or promises):
- Kring (กริ๊ง!, kringapp.com) is an activity-booking app in Bangkok (Pattaya later). Guests book a named 90-minute activity (café walk, photo walk, workshop, board games, market/food walk) with an ID-verified local host, always at a public place. Launch: "November" (never give a specific date).
- HOSTS: keep 100% of their own price; Kring takes 0% from hosts. The guest pays the host directly at check-in (PromptPay QR or cash) at the meeting place; Kring never holds host money. Typical host price ฿650–฿1,200 per 90-min session; the host sets it. Max 2 guests per booking. Free to join, no fee, no deposit. Public daytime/early-evening venues only; no nightlife or grey work. Guests pre-book with a ticket so there are fewer no-shows. Sign-up: ID check + profile photo + one activity + one weekly time slot.
- SUP / COORDINATORS: ฿300 when their first host verifies and publishes a first slot, then +฿100 per further host (no cap); +฿200 when that host's first real guest checks in; milestones 10 hosts +฿1,000, 25 hosts +฿3,000. Paid to an account in their own name within 48h of review; payout details go ONLY in the freelance contract, NEVER ask for PromptPay/bank/ID numbers in chat. Not direct sales, no fees. No multi-level: only people they bring themselves.
- SCOUTS / AMBASSADORS (Bangkok, 20+): same per-result pay as coordinators; applications via LINE @266jjwqh.
- GUESTS (Thai and foreign): book a named 90-min ACTIVITY with an ID-verified host, public places only, check-in at the meeting point, max 2 people per booking. The host sets the activity price and is paid directly at the meeting point. Kring sells a booking ticket ฿199 / ฿299 / ฿499 or a 7-Day Pass ฿590; the first ticket is free for new users. The app works in 7 languages: Thai, English, Chinese, Korean, Hindi, Russian, Malay. Before launch, guests join a waitlist in this chat and are told when a host in their area is live.
- GUEST FRAMING: it is always about the ACTIVITY. Never frame Kring as finding friends, company, a date or someone to go out with.

OBJECTION ANSWERS:
- Scam fear → it's free; we never ask for money, OTP or bank account numbers; guest money goes straight to the host; official site kringapp.com.
- No time → one slot a week is enough; pause anytime.
- Fees later? → 0% for founding hosts.
- Who are the guests? → ID-verified, public places only, the host sees the booking first.
- "Send details" → a 4-line summary + one question.

HARD RULES:
- Never use these words/phrases in any language: traveller meetup, Bangkok Locals, meet locals, match, date, girls, companion, free to meet, gift, wallet, coins, credit, escrow, seller of record, passive income, per hour, service fee, เพื่อนเที่ยว, หาเพื่อน, สาวๆ, หาคู่, เดท, พริตตี้, pretty, cute.
- Never comment on looks, gender or age (only say "20+" where relevant).
- Only these baht amounts may appear: 0, 150, 200, 450, 650, 1,200, 1,500, 2,000, 199, 299, 499, 590. Only the percentages 100% and 0%.
- Only links on kringapp.com or line.me. The host sign-up link is https://kringapp.com/app/#hverify?ref=<code> — do not invent other paths.
- Never promise phone calls or meetings; everything happens in this LINE chat. Never ask for bank account numbers, OTPs or ID numbers (a PromptPay phone number is OK).
- If you don't know, say Barbie will answer in this chat and set needs_human.

VOICE: you are Barbie, a woman. In Thai ALWAYS use the female polite particles ค่ะ / คะ / นะคะ and refer to yourself as เรา or Barbie. NEVER use ครับ, คับ, ผม or กระผม.
TONE: natural polite Bangkok Thai (ค่ะ/นะคะ), short LINE-style (max 4 short lines), one question at a time, emoji sparingly (🙏 ✨). If the user writes English, reply in English. No sign-off.
`.trim()

export function buildSystemPrompt(lead: Lead, oa: OaConfig, pending: string | null): string {
  const facts = {
    oa: oa.basicId,
    oa_role: oa.role,
    lead_role: lead.role,
    stage: lead.stage,
    lang: lead.lang,
    zone: lead.zone,
    activity_idea: lead.activity_idea,
    availability: lead.availability,
    scout_code: lead.scout_code,
    ref_code: lead.ref_code,
  }
  const allowedStages =
    lead.role === 'host'
      ? 'qualify | pitch | onboarding | won | lost'
      : lead.role === 'sup'
        ? 'pitch | won | lost'
        : '(none)' // scouts and guests: stages are set by the fixed flow only
  return [
    'You are Barbie from Kring, replying in a LINE Official Account chat to a prospective partner. Your job: answer their question or objection honestly using the playbook, then move them one step forward.',
    PLAYBOOK,
    `LEAD (JSON): ${JSON.stringify(facts)}`,
    pending
      ? `After answering, end by asking exactly this pending question (translate if replying in English): "${pending}"`
      : 'End with at most one short question that moves them forward.',
    `OUTPUT: return ONLY one JSON object, no markdown, no prose outside it:
{"reply": "<the LINE message text>", "stage_update": "<optional: ${allowedStages}>", "fields": {"zone"?: string, "activity_idea"?: string, "availability"?: string}, "needs_human"?: boolean}
Only include fields the user clearly stated. The reply must be under 500 characters.`,
  ].join('\n\n')
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Last N turns → alternating user/assistant messages ending with the current inbound text. */
export function buildMessages(turns: Turn[], inboundText: string, max = 10): ChatMessage[] {
  const recent = turns.filter((t) => t.direction === 'in' || t.direction === 'out').slice(-max)
  const msgs: ChatMessage[] = []
  for (const t of recent) {
    const role = t.direction === 'in' ? 'user' : 'assistant'
    const last = msgs[msgs.length - 1]
    if (last && last.role === role) last.content += `\n${t.text}`
    else msgs.push({ role, content: t.text })
  }
  // The current inbound may already be the last stored turn.
  const last = msgs[msgs.length - 1]
  if (!(last && last.role === 'user' && last.content.endsWith(inboundText))) {
    if (last && last.role === 'user') last.content += `\n${inboundText}`
    else msgs.push({ role: 'user', content: inboundText })
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift()
  if (msgs.length === 0) msgs.push({ role: 'user', content: inboundText || '(no text)' })
  return msgs
}

export interface LlmParsed {
  reply: string
  stage_update?: string
  fields?: Record<string, unknown>
  needs_human?: boolean
}

/** Defensive: strips code fences, finds the first balanced JSON object, validates types. */
export function parseLlmJson(text: unknown): LlmParsed | null {
  if (typeof text !== 'string') return null
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
  const start = s.indexOf('{')
  if (start < 0) return null
  // find matching closing brace, respecting strings
  let depth = 0
  let inStr = false
  let esc = false
  let end = -1
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) return null
  s = s.slice(start, end + 1)
  let obj: any
  try {
    obj = JSON.parse(s)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  if (typeof obj.reply !== 'string' || !obj.reply.trim()) return null
  const out: LlmParsed = { reply: obj.reply.trim() }
  if (typeof obj.stage_update === 'string' && obj.stage_update.trim()) out.stage_update = obj.stage_update.trim()
  if (obj.fields && typeof obj.fields === 'object' && !Array.isArray(obj.fields)) out.fields = obj.fields
  if (obj.needs_human === true) out.needs_human = true
  return out
}

export type LlmProvider = 'anthropic' | 'gemini'
export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash'

export interface ClaudeCallOpts {
  /** Defaults to 'anthropic'. */
  provider?: LlmProvider
  apiKey: string
  model: string
  system: string
  messages: ChatMessage[]
  timeoutMs: number
  fetchImpl: FetchLike
  maxTokens?: number
}

export type ClaudeCallResult = { ok: true; text: string } | { ok: false; error: string }

/** Runs `fn` with an AbortSignal and a hard timeout (also covers fetch impls that ignore the signal). */
async function withTimeout(timeoutMs: number, fn: (signal: AbortSignal) => Promise<ClaudeCallResult>): Promise<ClaudeCallResult> {
  const ctrl = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<ClaudeCallResult>((resolve) => {
    timer = setTimeout(() => {
      ctrl.abort()
      resolve({ ok: false, error: 'timeout' })
    }, timeoutMs)
  })
  const call = (async (): Promise<ClaudeCallResult> => {
    try {
      return await fn(ctrl.signal)
    } catch (e) {
      return { ok: false, error: (e as Error)?.name === 'AbortError' ? 'timeout' : 'network_error' }
    }
  })()
  try {
    return await Promise.race([call, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function callClaude(o: ClaudeCallOpts): Promise<ClaudeCallResult> {
  if (!o.apiKey) return Promise.resolve({ ok: false, error: 'missing_api_key' })
  return withTimeout(o.timeoutMs, async (signal) => {
    const resp = await o.fetchImpl(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': o.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: o.model, max_tokens: o.maxTokens ?? 600, system: o.system, messages: o.messages }),
      signal,
    })
    if (!resp.ok) return { ok: false, error: `http_${resp.status}` }
    const data: any = await resp.json().catch(() => null)
    const text = Array.isArray(data?.content)
      ? data.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('')
      : ''
    return text ? { ok: true, text } : { ok: false, error: 'empty_response' }
  })
}

/** No key in the URL: Gemini keys (e.g. "AQ.…") go in the x-goog-api-key header so they never reach logs. */
export function geminiUrl(model: string): string {
  return `${GEMINI_BASE}/${encodeURIComponent(model || GEMINI_DEFAULT_MODEL)}:generateContent`
}

/** Google AI Studio (Gemini) generateContent with the same system prompt + JSON contract. */
export function callGemini(o: ClaudeCallOpts): Promise<ClaudeCallResult> {
  if (!o.apiKey) return Promise.resolve({ ok: false, error: 'missing_api_key' })
  const model = o.model || GEMINI_DEFAULT_MODEL
  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
    maxOutputTokens: o.maxTokens ?? 800,
    temperature: 0.4,
  }
  // Flash models: disable "thinking" so replies stay well inside the 8 s budget.
  if (/flash/i.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 }
  return withTimeout(o.timeoutMs, async (signal) => {
    const resp = await o.fetchImpl(geminiUrl(model), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': o.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: o.system }] },
        contents: o.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig,
      }),
      signal,
    })
    if (!resp.ok) return { ok: false, error: `http_${resp.status}` }
    const data: any = await resp.json().catch(() => null)
    const parts = data?.candidates?.[0]?.content?.parts
    const text = Array.isArray(parts) ? parts.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('') : ''
    return text ? { ok: true, text } : { ok: false, error: data?.promptFeedback?.blockReason ? 'blocked' : 'empty_response' }
  })
}

export function callModel(o: ClaudeCallOpts): Promise<ClaudeCallResult> {
  return o.provider === 'gemini' ? callGemini(o) : callClaude(o)
}

export type LlmOutcome =
  | { ok: true; parsed: LlmParsed; attempts: number }
  | { ok: false; reason: string; attempts: number; lastViolations?: string[] }

/** Call → parse → guard; on guard failure regenerate once stating the violation. */
export async function generateLlmReply(o: Omit<ClaudeCallOpts, 'messages'> & { messages: ChatMessage[] }): Promise<LlmOutcome> {
  const first = await callModel(o)
  if (!first.ok) return { ok: false, reason: `llm_${first.error}`, attempts: 1 }
  const p1 = parseLlmJson(first.text)
  if (!p1) return { ok: false, reason: 'llm_unparseable', attempts: 1 }
  const g1 = checkOutbound(p1.reply)
  if (g1.ok) return { ok: true, parsed: p1, attempts: 1 }

  const retryMsgs: ChatMessage[] = [
    ...o.messages,
    { role: 'assistant', content: first.text },
    {
      role: 'user',
      content: `SYSTEM CHECK (not from the lead): your reply was rejected by the guardrail for: ${g1.violations.join(', ')}. Rewrite it following every HARD RULE. Return only the JSON object.`,
    },
  ]
  const second = await callModel({ ...o, messages: retryMsgs })
  if (!second.ok) return { ok: false, reason: `llm_retry_${second.error}`, attempts: 2, lastViolations: g1.violations }
  const p2 = parseLlmJson(second.text)
  if (!p2) return { ok: false, reason: 'llm_retry_unparseable', attempts: 2, lastViolations: g1.violations }
  const g2 = checkOutbound(p2.reply)
  if (g2.ok) return { ok: true, parsed: p2, attempts: 2 }
  return { ok: false, reason: 'llm_guard_failed_twice', attempts: 2, lastViolations: g2.violations }
}
