// Day-4 / day-9 follow-ups via Push API. Selection is pure; runFollowups wires store + LINE.
import { PUSH_KINDS, type BotMode, type Lead, type OaConfig } from './types.ts'
import type { Store } from './store.ts'
import type { FetchLike } from './llm.ts'
import { checkOutbound } from './guardrail.ts'
import { followupText } from './templates.ts'
import { pushMessages } from './line.ts'
import { femalePoliteTh } from './voice.ts'

const DAY = 86_400_000
const BKK_OFFSET = 7 * 3_600_000 // Asia/Bangkok, no DST

export const WINDOW_START_MIN = 9 * 60 + 30 // 09:30
export const WINDOW_END_MIN = 20 * 60 // 20:00 (exclusive)

export function bangkokMinutes(now: Date): number {
  const t = new Date(now.getTime() + BKK_OFFSET)
  return t.getUTCHours() * 60 + t.getUTCMinutes()
}

export function inSendWindow(now: Date): boolean {
  const m = bangkokMinutes(now)
  return m >= WINDOW_START_MIN && m < WINDOW_END_MIN
}

/** UTC ISO of 00:00 Asia/Bangkok for the day containing `now`. */
export function bangkokDayStartIso(now: Date): string {
  const t = new Date(now.getTime() + BKK_OFFSET)
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - BKK_OFFSET).toISOString()
}

export function bangkokMonthStartIso(now: Date): string {
  const t = new Date(now.getTime() + BKK_OFFSET)
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) - BKK_OFFSET).toISOString()
}

export const FOLLOWUP_STAGES: Record<string, string[]> = {
  host: ['new', 'qualify', 'pitch', 'close'],
  sup: ['new', 'pitch', 'close'],
  scout: ['apply'],
  general: ['new'],
  venue: [],
  guest: [], // guests only get a message when we choose to (launch / host in their area)
}

/** Which follow-up (1 = day-4, 2 = day-9) is due for this lead now, if any. */
export function followupDue(lead: Lead, now: Date): 1 | 2 | null {
  if (lead.opted_out || lead.notes?.paused) return null
  if (!lead.consent_at || !lead.last_outbound_at) return null
  if (!(FOLLOWUP_STAGES[lead.role] || []).includes(lead.stage)) return null
  if ((lead.followups_sent || 0) >= 2) return null
  const lastOut = Date.parse(lead.last_outbound_at)
  if (!Number.isFinite(lastOut)) return null
  // "no reply": nothing inbound since our last message
  if (lead.last_inbound_at && Date.parse(lead.last_inbound_at) >= lastOut) return null
  const t = now.getTime()
  if ((lead.followups_sent || 0) === 0) return t - lastOut >= 4 * DAY ? 1 : null
  const anchorRaw = lead.notes?.followup_anchor_at
  const anchor = typeof anchorRaw === 'string' && Number.isFinite(Date.parse(anchorRaw)) ? Date.parse(anchorRaw) : lastOut - 4 * DAY
  return t - anchor >= 9 * DAY && t - lastOut >= 2 * DAY ? 2 : null
}

export interface FollowupPick {
  lead: Lead
  n: 1 | 2
}

/**
 * Pure selection: time window, due-ness, global daily cap and per-OA monthly cap.
 * `sentToday` = follow-ups already pushed today (Bangkok); `sentThisMonthByOa` = per-OA pushes this month.
 */
export function selectFollowups(
  leads: Lead[],
  now: Date,
  opts: { dailyCap: number; sentToday: number; monthlyCapPerOa?: number; sentThisMonthByOa?: Record<string, number>; knownOas?: string[] },
): FollowupPick[] {
  if (!inSendWindow(now)) return []
  let remaining = Math.max(0, opts.dailyCap - opts.sentToday)
  const monthly = { ...(opts.sentThisMonthByOa || {}) }
  const picks: FollowupPick[] = []
  const sorted = [...leads].sort((a, b) => String(a.last_outbound_at).localeCompare(String(b.last_outbound_at)))
  for (const lead of sorted) {
    if (remaining <= 0) break
    if (opts.knownOas && !opts.knownOas.includes(lead.oa_basic_id)) continue
    const n = followupDue(lead, now)
    if (!n) continue
    if (opts.monthlyCapPerOa !== undefined && (monthly[lead.oa_basic_id] || 0) >= opts.monthlyCapPerOa) continue
    picks.push({ lead, n })
    monthly[lead.oa_basic_id] = (monthly[lead.oa_basic_id] || 0) + 1
    remaining--
  }
  return picks
}

export interface FollowupDeps {
  store: Store
  oas: OaConfig[]
  mode: BotMode
  dailyCap: number
  monthlyCapPerOa: number
  fetchImpl: FetchLike
  now?: Date
}

export interface FollowupReport {
  inWindow: boolean
  candidates: number
  sent: number
  drafted: number
  failed: number
  skipped: Array<{ leadId: string; reason: string }>
}

export async function runFollowups(deps: FollowupDeps): Promise<FollowupReport> {
  const now = deps.now || new Date()
  const report: FollowupReport = { inWindow: inSendWindow(now), candidates: 0, sent: 0, drafted: 0, failed: 0, skipped: [] }
  if (!report.inWindow) return report

  const sentToday = await deps.store.countTurns({ kind: 'followup', direction: 'out', sinceIso: bangkokDayStartIso(now) })
  if (sentToday >= deps.dailyCap) return report

  const monthStart = bangkokMonthStartIso(now)
  const sentThisMonthByOa: Record<string, number> = {}
  for (const oa of deps.oas) {
    sentThisMonthByOa[oa.basicId] = await deps.store.countTurns({ kind: PUSH_KINDS, direction: 'out', sinceIso: monthStart, oaBasicId: oa.basicId })
  }

  const candidates = await deps.store.listFollowupCandidates(new Date(now.getTime() - 2 * DAY).toISOString(), 500)
  report.candidates = candidates.length
  const picks = selectFollowups(candidates, now, {
    dailyCap: deps.dailyCap,
    sentToday,
    monthlyCapPerOa: deps.monthlyCapPerOa,
    sentThisMonthByOa,
    knownOas: deps.oas.map((o) => o.basicId),
  })

  for (const { lead, n } of picks) {
    const oa = deps.oas.find((o) => o.basicId === lead.oa_basic_id)
    if (!oa) continue
    const text = femalePoliteTh(followupText(lead.role, lead.stage, n, lead.lang, lead.role === 'sup' ? lead.ref_code : lead.scout_code))
    const g = checkOutbound(text)
    if (!g.ok) {
      report.skipped.push({ leadId: lead.id, reason: `guard:${g.violations.join(',')}` })
      await deps.store.updateLead(lead.id, { notes: { needs_human: true, followup_guard_failed: g.violations } })
      continue
    }
    if (deps.mode === 'shadow') {
      if (lead.notes?.followup_draft_n === n) {
        report.skipped.push({ leadId: lead.id, reason: 'draft_exists' })
        continue
      }
      await deps.store.addTurn({ lead_id: lead.id, oa_basic_id: lead.oa_basic_id, direction: 'draft', text, source: 'template', kind: 'followup' })
      await deps.store.updateLead(lead.id, { notes: { followup_draft_n: n, needs_human: true } })
      report.drafted++
      continue
    }
    const retryKey = crypto.randomUUID()
    const res = await pushMessages(deps.fetchImpl, oa.accessToken, lead.line_user_id, [{ text }], retryKey)
    if (!res.ok) {
      report.failed++
      report.skipped.push({ leadId: lead.id, reason: `push_failed:${res.status}` })
      continue
    }
    const ts = now.toISOString()
    await deps.store.addTurn({ lead_id: lead.id, oa_basic_id: lead.oa_basic_id, direction: 'out', text, source: 'template', kind: 'followup', created_at: ts })
    await deps.store.updateLead(lead.id, {
      followups_sent: (lead.followups_sent || 0) + 1,
      last_outbound_at: ts,
      notes: n === 1 ? { followup_anchor_at: lead.last_outbound_at } : {},
    })
    report.sent++
  }
  return report
}
