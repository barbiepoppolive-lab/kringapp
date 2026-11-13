// deno-lint-ignore-file require-await
// Persistence port + two adapters: Supabase PostgREST (service role) and in-memory (tests / no-DB fallback).
import type { Lead, LeadPatch, LeadRole, ScoutResultRow, ScoutRow, Turn, TurnKind } from './types.ts'
import type { FetchLike } from './llm.ts'

export interface LeadUpdate extends LeadPatch {
  notes?: Record<string, unknown>
}

export interface Store {
  getLead(oaBasicId: string, lineUserId: string): Promise<Lead | null>
  createLead(init: { oa_basic_id: string; line_user_id: string; role: LeadRole; lang?: 'th' | 'en' }): Promise<{ lead: Lead; created: boolean }>
  updateLead(id: string, patch: LeadUpdate): Promise<void>
  /** Returns inserted=false when line_event_id was already stored (LINE redelivery). */
  addTurn(turn: Turn & { oa_basic_id: string }): Promise<{ inserted: boolean }>
  recentTurns(leadId: string, n: number): Promise<Turn[]>
  codeExists(code: string): Promise<boolean>
  createScout(row: ScoutRow): Promise<void>
  addScoutResult(row: ScoutResultRow): Promise<void>
  listFollowupCandidates(lastOutboundBeforeIso: string, limit: number): Promise<Lead[]>
  countTurns(filter: CountFilter): Promise<number>
  getLeadById(id: string): Promise<Lead | null>
  /** needs_human && !opted_out && !paused, oldest flagged first. */
  listAgentQueue(limit: number): Promise<Lead[]>
  agentCounts(todayStartIso: string): Promise<AgentCounts>
  insertLegacyMessages(rows: Record<string, unknown>[]): Promise<void>
  /** Upload to Supabase Storage (private bucket), upsert. */
  uploadObject(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<{ ok: boolean; status: number }>
}

export interface CountFilter {
  kind: TurnKind | TurnKind[]
  direction: 'out' | 'draft' | 'in'
  sinceIso: string
  oaBasicId?: string
}

export interface AgentCounts {
  needs_human: number
  total_leads: number
  by_stage: Record<string, number>
  scouts_by_status: Record<string, number>
  today_inbound: number
}

const kinds = (k: TurnKind | TurnKind[]) => (Array.isArray(k) ? k : [k])
const flaggedKey = (l: Lead) => String(l.notes?.flagged_at || l.updated_at || '')
export const isAgentQueued = (l: Lead) => l.notes?.needs_human === true && !l.opted_out && l.notes?.paused !== true

const nowIso = () => new Date().toISOString()

export function blankLead(init: { id: string; oa_basic_id: string; line_user_id: string; role: LeadRole; lang?: 'th' | 'en' }): Lead {
  const ts = nowIso()
  return {
    id: init.id,
    oa_basic_id: init.oa_basic_id,
    line_user_id: init.line_user_id,
    role: init.role,
    stage: init.role === 'scout' ? 'apply' : 'new',
    display_name: null,
    lang: init.lang || 'th',
    zone: null,
    activity_idea: null,
    availability: null,
    scout_code: null,
    ref_code: null,
    consent_at: null,
    opted_out: false,
    last_inbound_at: null,
    last_outbound_at: null,
    followups_sent: 0,
    notes: {},
    created_at: ts,
    updated_at: ts,
  }
}

// ------------------------------------------------------------------ in-memory
export class MemoryStore implements Store {
  leads: Lead[] = []
  turns: Array<Turn & { oa_basic_id: string }> = []
  scouts: ScoutRow[] = []
  scoutResults: ScoutResultRow[] = []
  legacy: Record<string, unknown>[] = []
  objects: Record<string, { bytes: Uint8Array; contentType: string }> = {}
  failUploads = false
  private seq = 0

  async getLead(oa: string, uid: string) {
    const l = this.leads.find((x) => x.oa_basic_id === oa && x.line_user_id === uid)
    return l ? structuredClone(l) : null
  }
  async createLead(init: { oa_basic_id: string; line_user_id: string; role: LeadRole; lang?: 'th' | 'en' }) {
    const existing = await this.getLead(init.oa_basic_id, init.line_user_id)
    if (existing) return { lead: existing, created: false }
    const lead = blankLead({ id: `lead-${++this.seq}`, ...init })
    this.leads.push(lead)
    return { lead: structuredClone(lead), created: true }
  }
  async updateLead(id: string, patch: LeadUpdate) {
    const l = this.leads.find((x) => x.id === id)
    if (!l) return
    const { notes, ...rest } = patch
    Object.assign(l, rest, { updated_at: nowIso() })
    if (notes) l.notes = { ...l.notes, ...notes }
  }
  async addTurn(turn: Turn & { oa_basic_id: string }) {
    if (turn.line_event_id && this.turns.some((t) => t.line_event_id === turn.line_event_id)) return { inserted: false }
    this.turns.push({ ...turn, id: `turn-${++this.seq}`, created_at: turn.created_at || nowIso() })
    return { inserted: true }
  }
  async recentTurns(leadId: string, n: number) {
    return this.turns.filter((t) => t.lead_id === leadId).slice(-n)
  }
  async codeExists(code: string) {
    return this.scouts.some((s) => s.scout_code === code) || this.leads.some((l) => l.ref_code === code)
  }
  async createScout(row: ScoutRow) {
    if (this.scouts.some((s) => s.scout_code === row.scout_code)) throw new Error('duplicate scout_code')
    this.scouts.push({ ...row, created_at: nowIso() })
  }
  async addScoutResult(row: ScoutResultRow) {
    if (this.scoutResults.some((r) => r.scout_code === row.scout_code && r.kind === row.kind && r.lead_id === row.lead_id)) return
    this.scoutResults.push({ verified: false, paid: false, verified_at: null, ...row })
  }
  async listFollowupCandidates(before: string, limit: number) {
    return this.leads
      .filter((l) => !l.opted_out && l.followups_sent < 2 && l.consent_at && l.last_outbound_at && l.last_outbound_at < before)
      .sort((a, b) => String(a.last_outbound_at).localeCompare(String(b.last_outbound_at)))
      .slice(0, limit)
      .map((l) => structuredClone(l))
  }
  async getLeadById(id: string) {
    const l = this.leads.find((x) => x.id === id)
    return l ? structuredClone(l) : null
  }
  async listAgentQueue(limit: number) {
    return this.leads
      .filter(isAgentQueued)
      .sort((a, b) => flaggedKey(a).localeCompare(flaggedKey(b)))
      .slice(0, limit)
      .map((l) => structuredClone(l))
  }
  async agentCounts(todayStartIso: string): Promise<AgentCounts> {
    const by_stage: Record<string, number> = {}
    for (const l of this.leads) by_stage[l.stage] = (by_stage[l.stage] || 0) + 1
    const scouts_by_status: Record<string, number> = {}
    for (const sc of this.scouts) scouts_by_status[sc.status] = (scouts_by_status[sc.status] || 0) + 1
    return {
      needs_human: this.leads.filter(isAgentQueued).length,
      total_leads: this.leads.length,
      by_stage,
      scouts_by_status,
      today_inbound: this.turns.filter((t) => t.direction === 'in' && String(t.created_at) >= todayStartIso).length,
    }
  }
  async countTurns(f: CountFilter) {
    return this.turns.filter(
      (t) => kinds(f.kind).includes(t.kind as TurnKind) && t.direction === f.direction && String(t.created_at) >= f.sinceIso && (!f.oaBasicId || t.oa_basic_id === f.oaBasicId),
    ).length
  }
  async insertLegacyMessages(rows: Record<string, unknown>[]) {
    this.legacy.push(...rows)
  }
  async uploadObject(bucket: string, path: string, bytes: Uint8Array, contentType: string) {
    if (this.failUploads) return { ok: false, status: 500 }
    this.objects[`${bucket}/${path}`] = { bytes, contentType }
    return { ok: true, status: 200 }
  }
}

// ------------------------------------------------------------------ Supabase PostgREST
export class SupabaseRestStore implements Store {
  private base: string
  private storageBase: string
  constructor(
    url: string,
    private key: string,
    private fetchImpl: FetchLike = fetch,
  ) {
    this.base = `${url.replace(/\/$/, '')}/rest/v1`
    this.storageBase = `${url.replace(/\/$/, '')}/storage/v1/object`
  }

  async uploadObject(bucket: string, path: string, bytes: Uint8Array, contentType: string) {
    const key = path.split('/').map(encodeURIComponent).join('/')
    try {
      const r = await this.fetchImpl(`${this.storageBase}/${encodeURIComponent(bucket)}/${key}`, {
        method: 'POST',
        headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': contentType, 'x-upsert': 'true' },
        body: bytes as unknown as BodyInit,
      })
      return { ok: r.ok, status: r.status }
    } catch {
      return { ok: false, status: 0 }
    }
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json', ...extra }
  }

  private async req(path: string, init: RequestInit & { prefer?: string } = {}): Promise<Response> {
    const { prefer, ...rest } = init
    const r = await this.fetchImpl(`${this.base}/${path}`, {
      ...rest,
      headers: this.headers(prefer ? { Prefer: prefer } : {}),
    })
    if (!r.ok && r.status !== 409) {
      const body = await r.text().catch(() => '')
      throw new Error(`supabase ${init.method || 'GET'} ${path.split('?')[0]} -> ${r.status} ${body.slice(0, 200)}`)
    }
    return r
  }

  async getLead(oa: string, uid: string): Promise<Lead | null> {
    const r = await this.req(
      `kr7_line_leads?oa_basic_id=eq.${encodeURIComponent(oa)}&line_user_id=eq.${encodeURIComponent(uid)}&select=*&limit=1`,
    )
    const rows = (await r.json()) as Lead[]
    return rows[0] ? normaliseLead(rows[0]) : null
  }

  async createLead(init: { oa_basic_id: string; line_user_id: string; role: LeadRole; lang?: 'th' | 'en' }) {
    const r = await this.req('kr7_line_leads?on_conflict=oa_basic_id,line_user_id', {
      method: 'POST',
      prefer: 'return=representation,resolution=ignore-duplicates',
      body: JSON.stringify({
        oa_basic_id: init.oa_basic_id,
        line_user_id: init.line_user_id,
        role: init.role,
        stage: init.role === 'scout' ? 'apply' : 'new',
        lang: init.lang || 'th',
      }),
    })
    const rows = r.status === 409 ? [] : ((await r.json()) as Lead[])
    if (rows[0]) return { lead: normaliseLead(rows[0]), created: true }
    const existing = await this.getLead(init.oa_basic_id, init.line_user_id)
    if (!existing) throw new Error('lead upsert failed')
    return { lead: existing, created: false }
  }

  async updateLead(id: string, patch: LeadUpdate) {
    const { notes, ...rest } = patch
    const body: Record<string, unknown> = { ...rest }
    if (notes) {
      // read-modify-write merge of notes jsonb
      const r = await this.req(`kr7_line_leads?id=eq.${encodeURIComponent(id)}&select=notes`)
      const rows = (await r.json()) as Array<{ notes: Record<string, unknown> }>
      body.notes = { ...(rows[0]?.notes || {}), ...notes }
    }
    if (Object.keys(body).length === 0) return
    await this.req(`kr7_line_leads?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', prefer: 'return=minimal', body: JSON.stringify(body) })
  }

  async addTurn(turn: Turn & { oa_basic_id: string }) {
    const body = {
      lead_id: turn.lead_id,
      oa_basic_id: turn.oa_basic_id,
      direction: turn.direction,
      text: turn.text.slice(0, 4000),
      source: turn.source,
      kind: turn.kind || 'reply',
      line_event_id: turn.line_event_id || null,
      intent: turn.intent || null,
    }
    const path = turn.line_event_id ? 'kr7_line_turns?on_conflict=line_event_id' : 'kr7_line_turns'
    const r = await this.req(path, {
      method: 'POST',
      prefer: turn.line_event_id ? 'return=representation,resolution=ignore-duplicates' : 'return=minimal',
      body: JSON.stringify(body),
    })
    if (r.status === 409) return { inserted: false }
    if (turn.line_event_id) {
      const rows = (await r.json()) as unknown[]
      return { inserted: rows.length > 0 }
    }
    return { inserted: true }
  }

  async recentTurns(leadId: string, n: number): Promise<Turn[]> {
    const r = await this.req(`kr7_line_turns?lead_id=eq.${encodeURIComponent(leadId)}&select=*&order=created_at.desc&limit=${n}`)
    const rows = (await r.json()) as Turn[]
    return rows.reverse()
  }

  async codeExists(code: string) {
    const c = encodeURIComponent(code)
    const [a, b] = await Promise.all([
      this.req(`kr7_scouts?scout_code=eq.${c}&select=scout_code&limit=1`).then((r) => r.json()),
      this.req(`kr7_line_leads?ref_code=eq.${c}&select=id&limit=1`).then((r) => r.json()),
    ])
    return (a as unknown[]).length > 0 || (b as unknown[]).length > 0
  }

  async createScout(row: ScoutRow) {
    const r = await this.req('kr7_scouts', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(row) })
    if (r.status === 409) throw new Error('duplicate scout_code')
  }

  async addScoutResult(row: ScoutResultRow) {
    await this.req('kr7_scout_results?on_conflict=scout_code,kind,lead_id', {
      method: 'POST',
      prefer: 'return=minimal,resolution=ignore-duplicates',
      body: JSON.stringify(row),
    })
  }

  async listFollowupCandidates(before: string, limit: number) {
    const q = [
      'opted_out=eq.false',
      'followups_sent=lt.2',
      'consent_at=not.is.null',
      `last_outbound_at=lt.${encodeURIComponent(before)}`,
      'order=last_outbound_at.asc',
      `limit=${limit}`,
      'select=*',
    ].join('&')
    const r = await this.req(`kr7_line_leads?${q}`)
    return ((await r.json()) as Lead[]).map(normaliseLead)
  }

  async getLeadById(id: string): Promise<Lead | null> {
    const r = await this.req(`kr7_line_leads?id=eq.${encodeURIComponent(id)}&select=*&limit=1`)
    const rows = (await r.json()) as Lead[]
    return rows[0] ? normaliseLead(rows[0]) : null
  }

  async listAgentQueue(limit: number): Promise<Lead[]> {
    const q = [
      'notes->>needs_human=eq.true',
      'opted_out=eq.false',
      'or=(notes->>paused.is.null,notes->>paused.neq.true)',
      'order=notes->>flagged_at.asc.nullslast,updated_at.asc',
      `limit=${limit}`,
      'select=*',
    ].join('&')
    const r = await this.req(`kr7_line_leads?${q}`)
    return ((await r.json()) as Lead[]).map(normaliseLead)
  }

  async agentCounts(todayStartIso: string): Promise<AgentCounts> {
    const r = await this.req('rpc/kr7_agent_counts', { method: 'POST', body: JSON.stringify({ p_since: todayStartIso }) })
    const j = (await r.json()) as AgentCounts
    return {
      needs_human: Number(j?.needs_human || 0),
      total_leads: Number(j?.total_leads || 0),
      by_stage: j?.by_stage || {},
      scouts_by_status: j?.scouts_by_status || {},
      today_inbound: Number(j?.today_inbound || 0),
    }
  }

  async countTurns(f: CountFilter) {
    const q = [
      `kind=in.(${kinds(f.kind).join(',')})`,
      `direction=eq.${f.direction}`,
      `created_at=gte.${encodeURIComponent(f.sinceIso)}`,
      ...(f.oaBasicId ? [`oa_basic_id=eq.${encodeURIComponent(f.oaBasicId)}`] : []),
      'select=id',
      'limit=1',
    ].join('&')
    const r = await this.req(`kr7_line_turns?${q}`, { prefer: 'count=exact' })
    const range = r.headers.get('content-range') || ''
    const total = Number(range.split('/')[1])
    return Number.isFinite(total) ? total : 0
  }

  async insertLegacyMessages(rows: Record<string, unknown>[]) {
    if (!rows.length) return
    await this.req('kr6_oa_messages', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify(rows) })
  }
}

function normaliseLead(l: Lead): Lead {
  return { ...l, notes: (l.notes && typeof l.notes === 'object' ? l.notes : {}) as Record<string, unknown>, followups_sent: Number(l.followups_sent || 0) }
}
