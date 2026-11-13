// Agent API: the founder's scheduled Claude agent polls the queue and answers via Push.
//   POST …/agent-queue  → flagged leads + last turns + counts
//   POST …/agent-reply  → guarded Push reply (optionally with a forward stage move)
//   POST …/agent-note   → append to notes.agent_log (nothing sent)
// All routes require header x-agent-secret == AGENT_SECRET (503 if unset, 401 if wrong).
import type { BotSettings } from './config.ts'
import type { Lead, OaConfig, OutMessage, QuickReply } from './types.ts'
import { PUSH_KINDS } from './types.ts'
import type { Store } from './store.ts'
import type { FetchLike } from './llm.ts'
import { timingSafeEqualStr } from './signature.ts'
import { checkOutbound } from './guardrail.ts'
import { allowedLlmStageUpdate, sanitizeLlmFields } from './stateMachine.ts'
import { hostClose, hostVideoRequest } from './templates.ts'
import { pushMessages } from './line.ts'
import { femalePoliteTh } from './voice.ts'
import { bangkokDayStartIso, bangkokMonthStartIso } from './followups.ts'
import { LEGACY_OA_BASIC_ID } from './config.ts'

export interface AgentDeps {
  oas: OaConfig[]
  store: Store
  settings: BotSettings
  fetchImpl: FetchLike
  now?: () => Date
}

export const AGENT_QUEUE_LIMIT = 30
export const AGENT_TURNS = 15
const MAX_BODY = 20_000

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export function agentAuth(req: Request, settings: BotSettings): Response | null {
  if (!settings.agentSecret) return json({ ok: false, error: 'agent_secret_not_set' }, 503)
  const given = req.headers.get('x-agent-secret') || ''
  if (!timingSafeEqualStr(given, settings.agentSecret)) return json({ ok: false, error: 'unauthorized' }, 401)
  return null
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const raw = await req.text()
  if (raw.length > MAX_BODY) return null
  if (!raw.trim()) return {}
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ stage rules
const POLITE_CLOSE_RE = /(ขอบคุณ|ไว้โอกาสหน้า|ไม่เป็นไร|ยินดี|thank|no problem|no worries|anytime|all the best|take care|good luck)/i
export function isPoliteClose(text: string): boolean {
  return POLITE_CLOSE_RE.test(String(text || ''))
}

export type AgentStageCheck = { ok: true; stage: string | null; withLink: boolean } | { ok: false; reason: string }

/**
 * Forward-only stage moves for the agent:
 * - 'won' never (verification decides that).
 * - 'lost' only when the text is a polite close.
 * - 'close' only for host leads before close; the server appends the fixed sign-up link.
 * - anything else: the same forward rules the LLM had (minus won/lost).
 */
export function checkAgentStage(lead: Lead, stage: unknown, text: string): AgentStageCheck {
  if (stage === undefined || stage === null || stage === '') return { ok: true, stage: null, withLink: false }
  if (typeof stage !== 'string') return { ok: false, reason: 'stage_not_string' }
  if (stage === lead.stage) return { ok: true, stage: null, withLink: false }
  if (stage === 'won') return { ok: false, reason: 'won_not_allowed' }
  if (stage === 'lost') {
    if (!['host', 'sup'].includes(lead.role) || ['won', 'lost'].includes(lead.stage)) return { ok: false, reason: 'lost_not_allowed_for_lead' }
    return isPoliteClose(text) ? { ok: true, stage: 'lost', withLink: false } : { ok: false, reason: 'lost_requires_polite_close' }
  }
  if (stage === 'close') {
    if (lead.role === 'host' && ['new', 'qualify', 'pitch'].includes(lead.stage)) return { ok: true, stage: 'close', withLink: true }
    return { ok: false, reason: 'close_only_for_host_before_close' }
  }
  const st = allowedLlmStageUpdate(lead, stage)
  return st ? { ok: true, stage: st, withLink: false } : { ok: false, reason: `not_forward:${lead.role}:${lead.stage}->${stage}` }
}

// ------------------------------------------------------------------ queue
export async function handleAgentQueue(req: Request, deps: AgentDeps): Promise<Response> {
  const denied = agentAuth(req, deps.settings)
  if (denied) return denied
  const now = deps.now ? deps.now() : new Date()
  const leads = await deps.store.listAgentQueue(AGENT_QUEUE_LIMIT)
  const out = []
  for (const l of leads) {
    const turns = await deps.store.recentTurns(l.id, AGENT_TURNS)
    out.push({
      id: l.id,
      oa_basic_id: l.oa_basic_id,
      role: l.role,
      stage: l.stage,
      lang: l.lang,
      display_name: l.display_name,
      zone: l.zone,
      activity_idea: l.activity_idea,
      availability: l.availability,
      scout_code: l.scout_code,
      ref_code: l.ref_code,
      followups_sent: l.followups_sent,
      last_inbound_at: l.last_inbound_at,
      last_outbound_at: l.last_outbound_at,
      notes: l.notes,
      turns: turns.map((t) => ({ direction: t.direction, text: t.text, source: t.source, created_at: t.created_at })),
    })
  }
  const counts = await deps.store.agentCounts(bangkokDayStartIso(now))
  return json({ ok: true, leads: out, counts })
}

// ------------------------------------------------------------------ reply
export async function handleAgentReply(req: Request, deps: AgentDeps): Promise<Response> {
  const denied = agentAuth(req, deps.settings)
  if (denied) return denied
  const now = deps.now ? deps.now() : new Date()
  const body = await readJson(req)
  if (!body) return json({ ok: false, error: 'invalid_json_body' }, 400)
  const leadId = typeof body.leadId === 'string' ? body.leadId : ''
  const text = femalePoliteTh(typeof body.text === 'string' ? body.text.trim() : '')
  if (!leadId || !text) return json({ ok: false, error: 'leadId_and_text_required' }, 400)

  const lead = await deps.store.getLeadById(leadId)
  if (!lead) return json({ ok: false, error: 'lead_not_found' }, 404)
  if (lead.opted_out) return json({ ok: false, error: 'lead_opted_out' }, 409)
  if (lead.notes.paused === true) return json({ ok: false, error: 'lead_paused' }, 409)
  const oa = deps.oas.find((o) => o.basicId === lead.oa_basic_id)
  if (!oa || !oa.accessToken) return json({ ok: false, error: 'oa_not_configured' }, 409)

  // quick replies
  let quickReplies: QuickReply[] | undefined
  if (body.quickReplies !== undefined) {
    const qr = body.quickReplies
    if (!Array.isArray(qr) || qr.length > 13 || !qr.every((x) => typeof x === 'string' && x.trim() && x.length <= 20)) {
      return json({ ok: false, error: 'invalid_quick_replies', detail: 'array of ≤13 non-empty labels, each ≤20 chars' }, 400)
    }
    quickReplies = qr.length ? qr.map((label: string) => ({ label: femalePoliteTh(label.trim()), text: femalePoliteTh(label.trim()) })) : undefined
  }

  // stage
  const sc = checkAgentStage(lead, body.stage, text)
  if (!sc.ok) return json({ ok: false, error: 'stage_not_allowed', reason: sc.reason }, 422)

  // messages: agent text first, then (for close) the fixed sign-up link template
  const messages: OutMessage[] = [{ text }]
  if (sc.withLink) messages.push(...hostClose(lead.lang, lead.scout_code))
  const addVideo = lead.role === 'host' && (sc.stage === 'close' || sc.stage === 'onboarding') && !lead.notes.video_requested
  if (addVideo) messages.push(hostVideoRequest(lead.lang))
  if (quickReplies) messages[messages.length - 1] = { ...messages[messages.length - 1], quickReplies }
  if (messages.length > 5) return json({ ok: false, error: 'too_many_messages' }, 400)

  // guardrail on every outbound text (incl. quick-reply labels)
  const violations: string[] = []
  for (const m of messages) {
    violations.push(...checkOutbound(m.text).violations)
    for (const q of m.quickReplies || []) violations.push(...checkOutbound(q.label).violations.map((v) => `qr_label:${v}`))
  }
  if (violations.length) return json({ ok: false, error: 'guardrail', violations: Array.from(new Set(violations)) }, 422)

  // per-OA monthly push cap (shared with follow-ups)
  const used = await deps.store.countTurns({ kind: PUSH_KINDS, direction: 'out', sinceIso: bangkokMonthStartIso(now), oaBasicId: oa.basicId })
  if (used >= deps.settings.followupMonthlyCapPerOa) {
    return json({ ok: false, error: 'monthly_push_cap_reached', used, cap: deps.settings.followupMonthlyCapPerOa }, 429)
  }

  const retryKey = typeof body.retryKey === 'string' && /^[0-9a-f-]{36}$/i.test(body.retryKey) ? body.retryKey : crypto.randomUUID()
  const res = await pushMessages(deps.fetchImpl, oa.accessToken, lead.line_user_id, messages, retryKey)
  if (!res.ok) return json({ ok: false, error: 'push_failed', status: res.status }, 502)

  const ts = now.toISOString()
  // One push = one quota unit: only the agent text is recorded as kind 'agent'; link bubbles are kind 'reply'.
  await deps.store.addTurn({ lead_id: lead.id, oa_basic_id: oa.basicId, direction: 'out', text, source: 'agent', kind: 'agent', created_at: ts })
  for (const m of messages.slice(1)) {
    await deps.store.addTurn({ lead_id: lead.id, oa_basic_id: oa.basicId, direction: 'out', text: m.text, source: 'template', kind: 'reply', created_at: ts })
  }

  const fields = sanitizeLlmFields(body.fields)
  delete fields.scout_code
  const keepFlag = body.keepFlag === true
  await deps.store.updateLead(lead.id, {
    ...fields,
    ...(sc.stage ? { stage: sc.stage } : {}),
    last_outbound_at: ts,
    notes: {
      last_agent_reply_at: ts,
      ...(addVideo ? { video_requested: true } : {}),
      ...(keepFlag ? {} : { needs_human: false, pending_question: null, flagged_at: null, has_draft: false }),
    },
  })

  if (sc.stage === 'close' && lead.scout_code) {
    try {
      await deps.store.addScoutResult({ scout_code: lead.scout_code, kind: 'host', lead_id: lead.id, verified: false, paid: false })
    } catch {
      /* non-fatal */
    }
  }

  try {
    const thread = oa.basicId === LEGACY_OA_BASIC_ID ? `${lead.role === 'scout' ? 'applicant_line_' : 'line_'}${lead.line_user_id}` : `line_${oa.basicId}_${lead.line_user_id}`
    await deps.store.insertLegacyMessages(
      messages.map((m, i) => ({
        channel: 'line_oa',
        external_thread_id: thread,
        sender_handle: 'kring_claude_agent',
        direction: 'outbound',
        message_text: m.text.slice(0, 4000),
        owes_reply: keepFlag ? 'us' : 'them',
        stage: ['close', 'onboarding', 'applied'].includes(sc.stage || lead.stage) ? 'signed' : 'replied',
        raw_payload: { oa_basic_id: oa.basicId, source: i === 0 ? 'agent' : 'template', push: true },
        created_at: new Date(now.getTime() + i).toISOString(),
      })),
    )
  } catch {
    /* best-effort */
  }

  return json({ ok: true, pushed: true, stage: sc.stage || lead.stage, stageApplied: !!sc.stage, messages: messages.length, pushesUsedThisMonth: used + 1 })
}

// ------------------------------------------------------------------ note
export async function handleAgentNote(req: Request, deps: AgentDeps): Promise<Response> {
  const denied = agentAuth(req, deps.settings)
  if (denied) return denied
  const now = deps.now ? deps.now() : new Date()
  const body = await readJson(req)
  if (!body) return json({ ok: false, error: 'invalid_json_body' }, 400)
  const leadId = typeof body.leadId === 'string' ? body.leadId : ''
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (!leadId || !note) return json({ ok: false, error: 'leadId_and_note_required' }, 400)
  if (note.length > 2000) return json({ ok: false, error: 'note_too_long' }, 400)
  const lead = await deps.store.getLeadById(leadId)
  if (!lead) return json({ ok: false, error: 'lead_not_found' }, 404)
  const prev = Array.isArray(lead.notes.agent_log) ? (lead.notes.agent_log as unknown[]) : []
  const agent_log = [...prev, { at: now.toISOString(), note }].slice(-50)
  await deps.store.updateLead(lead.id, { notes: { agent_log } })
  return json({ ok: true, entries: agent_log.length })
}
