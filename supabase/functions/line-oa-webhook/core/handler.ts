// Webhook orchestration: signature → OA → lead → stage machine/LLM → guard → mode → Reply API → store.
// All I/O is injected (store, fetch, clock) so Node tests can drive it end-to-end.
import type { BotSettings } from './config.ts'
import type { LineWebhookEvent, Lead, OaConfig, OutMessage, TurnSource } from './types.ts'
import type { Store } from './store.ts'
import type { FetchLike } from './llm.ts'
import { resolveOa, timingSafeEqualStr } from './signature.ts'
import { decide, allowedLlmStageUpdate, sanitizeLlmFields, type Decision, type Inbound } from './stateMachine.ts'
import { buildMessages, buildSystemPrompt, generateLlmReply } from './llm.ts'
import { checkOutbound, safeTemplate } from './guardrail.ts'
import { SIGN_OFF, agentAck, hostVideoRequest } from './templates.ts'
import { applyVoice } from './voice.ts'
import { hostMediaDecision } from './media.ts'
import { detectLang, redactSensitiveNumbers, sanitizeInbound } from './text.ts'
import { getProfileName, replyMessages } from './line.ts'
import { randomCode } from './codes.ts'
import { runFollowups, type FollowupReport } from './followups.ts'
import { LEGACY_OA_BASIC_ID, llmProvider } from './config.ts'
import { handleAgentNote, handleAgentQueue, handleAgentReply } from './agent.ts'

export interface WebhookDeps {
  oas: OaConfig[]
  store: Store
  settings: BotSettings
  fetchImpl: FetchLike
  now?: () => Date
  newCode?: (prefix: 'S' | 'C') => string
}

export interface EventResult {
  userId: string
  oa: string
  handled: boolean
  skipped?: string
  reason?: string
  stage?: string
  replyText?: string
  draftText?: string
  sentViaLineApi?: boolean
  intent?: string
  mode?: string
  source?: TurnSource
  tag?: string
}

export const ACK_COOLDOWN_MS = 10 * 60_000

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export function toInbound(ev: LineWebhookEvent): Inbound | null {
  if (ev.type === 'follow') return { kind: 'follow' }
  if (ev.type === 'unfollow') return { kind: 'unfollow' }
  if (ev.type === 'postback') return { kind: 'text', text: sanitizeInbound(ev.postback?.data || '') }
  if (ev.type !== 'message') return null
  const m = ev.message
  if (m?.type === 'text') return { kind: 'text', text: sanitizeInbound(m.text || '') }
  if ((m?.type === 'video' || m?.type === 'image') && m.id) {
    return { kind: 'media', mediaType: m.type, messageId: m.id, external: m.contentProvider?.type === 'external', text: '' }
  }
  if (m?.type === 'location') {
    const address = sanitizeInbound([m.title, m.address].filter(Boolean).join(' ')).slice(0, 200)
    return { kind: 'location', text: address, address }
  }
  return { kind: 'other', text: '' }
}

function inboundLogText(ev: LineWebhookEvent, inb: Inbound): string {
  if (inb.kind === 'follow') return '[Followed Kring LINE Official Account]'
  if (inb.kind === 'unfollow') return '[Unfollowed / blocked]'
  if (inb.kind === 'other' || inb.kind === 'media') return `[LINE ${ev.message?.type || 'media'} message id=${ev.message?.id || ''}]`
  if (ev.type === 'postback') return `[Postback: ${inb.text}]`
  return inb.text
}

function guardAll(msgs: OutMessage[]): string[] {
  const v: string[] = []
  for (const m of msgs) {
    v.push(...checkOutbound(m.text).violations)
    for (const q of m.quickReplies || []) {
      v.push(...checkOutbound(q.label).violations.map((x) => `qr_label:${x}`))
      v.push(...checkOutbound(q.text).violations.map((x) => `qr_text:${x}`))
      if (q.label.length > 20) v.push('qr_label_too_long')
    }
  }
  return v
}

function legacyThreadId(oa: OaConfig, userId: string, lead: Lead): string {
  const prefix = lead.role === 'scout' ? 'applicant_line_' : 'line_'
  return oa.basicId === LEGACY_OA_BASIC_ID ? `${prefix}${userId}` : `${prefix}${oa.basicId}_${userId}`
}

function legacyStage(lead: Lead, isFollow: boolean): string {
  if (lead.stage === 'won') return 'live'
  if (['close', 'onboarding', 'applied'].includes(lead.stage)) return 'signed'
  return isFollow ? 'contacted' : 'replied'
}

export async function processEvent(ev: LineWebhookEvent, oa: OaConfig, deps: WebhookDeps): Promise<EventResult> {
  const now = deps.now ? deps.now() : new Date()
  const nowIso = now.toISOString()
  const userId = ev.source?.userId || ''
  const base: EventResult = { userId: userId || 'unknown_line_user', oa: oa.basicId, handled: false }
  if (ev.source?.type && ev.source.type !== 'user') return { ...base, skipped: 'non_user_source' }
  if (!userId) return { ...base, skipped: 'no_user_id' }
  const inbound = toInbound(ev)
  if (!inbound) return { ...base, skipped: `unsupported_event:${ev.type}` }

  // ---- lead
  const existing = await deps.store.getLead(oa.basicId, userId)
  const { lead: loaded, created } = existing
    ? { lead: existing, created: false }
    : await deps.store.createLead({ oa_basic_id: oa.basicId, line_user_id: userId, role: oa.role })

  // ---- inbound turn (dedup on webhookEventId)
  const logText = redactSensitiveNumbers(inboundLogText(ev, inbound))
  const ins = await deps.store.addTurn({
    lead_id: loaded.id,
    oa_basic_id: oa.basicId,
    direction: 'in',
    text: logText,
    source: 'human',
    kind: 'inbound',
    line_event_id: ev.webhookEventId || null,
    created_at: new Date(ev.timestamp || now.getTime()).toISOString(),
  })
  if (!ins.inserted) return { ...base, skipped: 'duplicate_event' }

  const inboundText = 'text' in inbound ? inbound.text : ''
  const pre: Partial<Lead> = { lang: detectLang(inboundText, loaded.lang) }
  if (inbound.kind !== 'follow' && inbound.kind !== 'unfollow') pre.last_inbound_at = nowIso
  if (!loaded.consent_at && inbound.kind !== 'unfollow') pre.consent_at = nowIso
  if (created && !loaded.display_name && oa.accessToken) {
    const name = await getProfileName(deps.fetchImpl, oa.accessToken, userId)
    if (name) pre.display_name = name
  }
  let lead: Lead = { ...loaded, ...pre }

  // ---- decide (retry if a generated code collides)
  const gen = deps.newCode || ((p: 'S' | 'C') => randomCode(p))
  let decision: Decision | null = null
  if (inbound.kind === 'media' && lead.role === 'host' && !lead.opted_out) {
    decision = await hostMediaDecision(lead, inbound, oa, deps, nowIso)
  }
  for (let i = 0; i < 4 && !decision; i++) {
    const used: { code: string | null } = { code: null }
    const d = decide(lead, inbound, {
      oa,
      isNewLead: created,
      newCode: (p) => (used.code = gen(p)),
    })
    if (used.code && (await deps.store.codeExists(used.code))) continue
    decision = d
    break
  }
  if (!decision) {
    decision = { messages: [{ text: safeTemplate(lead.lang) }], patch: {}, notes: { needs_human: true, code_generation_failed: true }, reason: 'code_collision' }
  }

  const patch = { ...decision.patch }
  const notes: Record<string, unknown> = { ...decision.notes }
  let messages = decision.messages
  let source: TurnSource = 'template'

  // ---- free text order: state machine → FAQ intent (inside decide) → LLM provider → instant ack + agent queue
  const ackAndFlag = () => {
    // Acknowledge immediately (never wait), at most once per 10 minutes per lead; the agent answers via /agent-reply.
    const lastAck = Date.parse(String(lead.notes.last_ack_at || ''))
    if (Number.isFinite(lastAck) && now.getTime() - lastAck < ACK_COOLDOWN_MS) {
      messages = []
    } else {
      messages = [agentAck(lead.lang)]
      notes.last_ack_at = nowIso
    }
    notes.needs_human = true
    source = 'template'
  }
  const provider = llmProvider(deps.settings)
  if (decision.llm && !provider) {
    ackAndFlag()
  } else if (decision.llm && provider) {
    const working: Lead = { ...lead, ...patch, notes: { ...lead.notes, ...notes } }
    const turns = await deps.store.recentTurns(lead.id, 11)
    const outcome = await generateLlmReply({
      provider,
      apiKey: provider === 'anthropic' ? deps.settings.anthropicApiKey : deps.settings.geminiApiKey,
      model: provider === 'anthropic' ? deps.settings.claudeModel : deps.settings.geminiModel,
      system: buildSystemPrompt(working, oa, decision.llm.pending),
      messages: buildMessages(turns, logText, 10),
      timeoutMs: deps.settings.llmTimeoutMs,
      fetchImpl: deps.fetchImpl,
    })
    notes.last_llm_provider = provider
    if (outcome.ok) {
      messages = [{ text: outcome.parsed.reply }]
      source = 'llm'
      const st = allowedLlmStageUpdate(working, outcome.parsed.stage_update)
      if (st) patch.stage = st
      const f = sanitizeLlmFields(outcome.parsed.fields)
      if (f.scout_code && working.scout_code) delete f.scout_code
      for (const k of Object.keys(f) as Array<keyof typeof f>) if (!(working as any)[k]) (patch as any)[k] = f[k]
      if (outcome.parsed.needs_human) notes.needs_human = true
    } else {
      ackAndFlag()
      notes.last_llm_error = outcome.reason
      if (outcome.lastViolations) notes.guard_violations = outcome.lastViolations
    }
  }
  if (decision.intent) notes.last_intent = decision.intent

  // Host video request: once, whenever a host reaches close/onboarding by any path (template, LLM).
  const reachedStage = patch.stage || lead.stage
  if ((lead.role === 'host' || patch.role === 'host') && (reachedStage === 'close' || reachedStage === 'onboarding') && messages.length && !lead.notes.video_requested && !notes.video_requested) {
    messages = [...messages, hostVideoRequest(lead.lang)].slice(0, 5)
    notes.video_requested = true
  }

  // ---- brand voice (female polite Thai) on every outbound text, then the guardrail
  messages = applyVoice(messages)
  if (messages.length) {
    const v = guardAll(messages)
    if (v.length) {
      messages = [{ text: safeTemplate(lead.lang) }]
      notes.needs_human = true
      notes.guard_violations = v
      source = 'template'
    }
  }

  // ---- sign-off on the very first outbound message only
  if (messages.length && !lead.last_outbound_at && !lead.notes.signed_off) {
    const last = messages[messages.length - 1]
    const signed = `${last.text}\n${SIGN_OFF}`
    if (checkOutbound(signed).ok) {
      messages = [...messages.slice(0, -1), { ...last, text: signed }]
      notes.signed_off = true
    }
  }

  // ---- flag bookkeeping for the agent queue
  if (notes.needs_human === true) {
    const alreadyFlagged = lead.notes.needs_human === true && typeof lead.notes.flagged_at === 'string'
    if (!alreadyFlagged) notes.flagged_at = nowIso
    if (inboundText) {
      const prev = alreadyFlagged && typeof lead.notes.pending_question === 'string' ? lead.notes.pending_question : ''
      const joined = prev ? `${prev}\n${logText}` : logText
      notes.pending_question = joined.length > 1500 ? joined.slice(-1500) : joined
    }
  }

  // ---- mode
  const mode = deps.settings.mode
  let toSend = messages
  let drafts: OutMessage[] = []
  if (mode === 'shadow' && messages.length && !decision.exemptFromShadow) {
    drafts = messages
    toSend = [{ text: safeTemplate(lead.lang) }]
    notes.needs_human = true
    notes.has_draft = true
  }

  // ---- send (Reply API only — free)
  let sent = false
  if (toSend.length && !decision.silent) {
    if (ev.replyToken) {
      const r = await replyMessages(deps.fetchImpl, oa.accessToken, ev.replyToken, toSend)
      sent = r.ok
      if (!r.ok) {
        notes.needs_human = true
        notes.reply_failed_status = r.status
      }
    } else {
      notes.needs_human = true
    }
  }

  // ---- persist turns
  for (const m of drafts) {
    await deps.store.addTurn({ lead_id: lead.id, oa_basic_id: oa.basicId, direction: 'draft', text: m.text, source, kind: 'reply', intent: decision.intent || null })
  }
  if (!decision.silent) {
    for (const m of toSend) {
      await deps.store.addTurn({
        lead_id: lead.id,
        oa_basic_id: oa.basicId,
        direction: sent ? 'out' : 'draft',
        text: m.text,
        source: drafts.length ? 'template' : source,
        kind: 'reply',
        intent: decision.intent || null,
      })
    }
  }

  // ---- update lead
  const update: Record<string, unknown> = { ...pre, ...patch }
  if (sent) update.last_outbound_at = nowIso
  await deps.store.updateLead(lead.id, { ...(update as any), notes })
  lead = { ...lead, ...patch, notes: { ...lead.notes, ...notes } }

  // ---- side effects: scout row, scout result
  if (decision.createScout) {
    try {
      await deps.store.createScout({
        scout_code: decision.createScout.scout_code,
        line_user_id: userId,
        nickname: decision.createScout.nickname || lead.display_name,
        zone: decision.createScout.zone,
        status: 'applicant',
      })
    } catch (e) {
      await deps.store.updateLead(lead.id, { notes: { needs_human: true, scout_insert_error: String((e as Error).message || e).slice(0, 200) } })
    }
  }
  if (decision.scoutResult && lead.scout_code) {
    try {
      await deps.store.addScoutResult({ scout_code: lead.scout_code, kind: decision.scoutResult.kind, lead_id: lead.id, verified: false, paid: false })
    } catch {
      /* non-fatal */
    }
  }

  // ---- mirror into kr6_oa_messages for the Control Room console (legacy W1 behaviour)
  try {
    const thread = legacyThreadId(oa, userId, lead)
    const owes = lead.opted_out ? 'none' : notes.needs_human || lead.notes.paused ? 'us' : 'them'
    const stage = legacyStage(lead, inbound.kind === 'follow')
    const createdIn = new Date(ev.timestamp || now.getTime()).toISOString()
    const rows: Record<string, unknown>[] = [
      {
        channel: 'line_oa',
        external_thread_id: thread,
        sender_handle: userId,
        direction: 'inbound',
        message_text: logText.slice(0, 4000),
        owes_reply: owes,
        stage,
        raw_payload: {
          event: { type: ev.type, timestamp: ev.timestamp, webhookEventId: ev.webhookEventId, message_type: ev.message?.type },
          oa_basic_id: oa.basicId,
          partner_type: lead.role === 'scout' ? 'applicant' : lead.role,
          channel: 'line',
          bot_stage: lead.stage,
          ...(lead.role === 'scout' ? { tag: 'applicant_field' } : {}),
        },
        created_at: createdIn,
      },
    ]
    const outRows = [...drafts.map((m) => ({ m, dir: 'draft' })), ...(decision.silent ? [] : toSend.map((m) => ({ m, dir: sent ? 'outbound' : 'draft' })))]
    outRows.forEach(({ m, dir }, i) =>
      rows.push({
        channel: 'line_oa',
        external_thread_id: thread,
        sender_handle: 'kring_line_oa_auto',
        direction: dir,
        message_text: m.text.slice(0, 4000),
        owes_reply: owes,
        stage,
        raw_payload: { oa_basic_id: oa.basicId, auto_reply: true, source, mode, reason: decision!.reason, intent: decision!.intent || null, sent_via_line_api: sent && dir === 'outbound' },
        created_at: new Date(new Date(createdIn).getTime() + 1000 + i).toISOString(),
      }),
    )
    await deps.store.insertLegacyMessages(rows)
  } catch {
    /* console mirror is best-effort */
  }

  return {
    ...base,
    handled: true,
    reason: decision.reason,
    stage: lead.stage,
    replyText: toSend.map((m) => m.text).join('\n\n') || undefined,
    draftText: drafts.length ? drafts.map((m) => m.text).join('\n\n') : undefined,
    sentViaLineApi: sent,
    intent: decision.intent,
    mode,
    source,
    tag: lead.role === 'scout' ? 'applicant_field' : undefined,
  }
}

export async function handleWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method === 'GET') {
    return json({ ok: true, service: 'kring-line-oa-webhook', workstream: 'W1', fieldApplicantKeyword: 'ภาคสนาม', bot: 'closer-v1' })
  }
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const path = new URL(req.url).pathname
  if (path.endsWith('/followups')) return handleFollowupsRequest(req, deps)
  if (path.endsWith('/agent-queue')) return handleAgentQueue(req, deps)
  if (path.endsWith('/agent-reply')) return handleAgentReply(req, deps)
  if (path.endsWith('/agent-note')) return handleAgentNote(req, deps)

  if (deps.oas.length === 0) return json({ ok: false, error: 'missing_line_channel_secret_env' }, 500)

  const rawBody = await req.text()
  const res = await resolveOa(rawBody, req.headers.get('x-line-signature'), deps.oas)
  if (!res.ok) return json({ ok: false, error: 'invalid_x_line_signature' }, 401)

  let payload: { destination?: string; events?: LineWebhookEvent[] }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return json({ ok: false, error: 'invalid_json_body' }, 400)
  }

  const events = Array.isArray(payload.events) ? payload.events : []
  const results: EventResult[] = []
  for (const ev of events) {
    try {
      results.push(await processEvent(ev, res.oa, deps))
    } catch (e) {
      // DB down etc. — still answer politely if we can, and never 500 (LINE would retry/disable).
      let sent = false
      if (ev.replyToken && ev.type === 'message') {
        const r = await replyMessages(deps.fetchImpl, res.oa.accessToken, ev.replyToken, [{ text: safeTemplate('th') }])
        sent = r.ok
      }
      results.push({ userId: ev.source?.userId || 'unknown_line_user', oa: res.oa.basicId, handled: false, skipped: `error:${String((e as Error)?.message || e).slice(0, 120)}`, sentViaLineApi: sent })
    }
  }

  return json({
    ok: true,
    oa: res.oa.basicId,
    processedEvents: results.filter((r) => r.handled).length,
    autoReplies: results.filter((r) => r.handled && (r.replyText || r.draftText)),
    skipped: results.filter((r) => !r.handled).map((r) => ({ userId: r.userId, reason: r.skipped })),
  })
}

export async function handleFollowupsRequest(req: Request, deps: WebhookDeps): Promise<Response> {
  const secret = deps.settings.cronSecret
  if (!secret) return json({ ok: false, error: 'followup_cron_secret_not_set' }, 503)
  const given = req.headers.get('x-cron-secret') || ''
  if (!timingSafeEqualStr(given, secret)) return json({ ok: false, error: 'unauthorized' }, 401)
  const report: FollowupReport = await runFollowups({
    store: deps.store,
    oas: deps.oas,
    mode: deps.settings.mode,
    dailyCap: deps.settings.followupDailyCap,
    monthlyCapPerOa: deps.settings.followupMonthlyCapPerOa,
    fetchImpl: deps.fetchImpl,
    now: deps.now ? deps.now() : undefined,
  })
  return json({ ok: true, ...report })
}
