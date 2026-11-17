/**
 * Kring Autopilot M1+ pure logic & types (rebased onto live-base 8a29fdb, 18 Nov 2026).
 * Admin text is strictly plain English. Money, bans, and claim refusals never auto-execute.
 */
import { buildInbox, money, peopleCounts, type InboxItem, type Snapshot, type Trust } from './adminV2Logic';

export type RobotMode = 'off' | 'dry_run' | 'on';

export interface RobotRow {
  name: string;
  title: string;
  note: string;
  schedule: string;
  mode: RobotMode;
  effective_mode?: RobotMode;
  daily_cap: number;
  today_actions: number;
  today_dry_runs: number;
  last_run: string | null;
  last_ok: boolean | null;
  last_note: string | null;
  updated_at?: string | null;
  dry_run_only?: boolean;
}

export interface HeartbeatRow {
  job: string;
  every_sec: number;
  last_beat: string | null;
  last_ok: boolean;
  stale: boolean;
  missing: boolean;
  detail: Record<string, unknown> | null;
}

export interface RobotLogRow {
  id: number;
  robot: string;
  action: string;
  target: string | null;
  detail: Record<string, unknown> | null;
  can_undo: boolean;
  undone_at: string | null;
  dry_run: boolean;
  at: string;
}

export interface CronJobRow {
  jobname: string;
  schedule: string;
  active: boolean;
}

export interface AutopilotState {
  at: string;
  day_start: string;
  paused: boolean;
  pg_cron_available: boolean;
  cron_jobs: CronJobRow[];
  robots: RobotRow[];
  heartbeats: HeartbeatRow[];
  logs: RobotLogRow[];
  fallback?: boolean;
}

export const DEFAULT_ROBOTS: Omit<RobotRow, 'today_actions' | 'today_dry_runs' | 'last_run' | 'last_ok' | 'last_note'>[] = [
  {
    name: 'health_watch',
    title: 'Health watch',
    note: 'Checks DB, auth, storage buckets, RPC speed (<2s), face check, code stock (>5), quotas, and cron heartbeats every 15 min.',
    schedule: '*/15 * * * *',
    mode: 'dry_run',
    daily_cap: 96,
  },
  {
    name: 'self_fix',
    title: 'Self-fix',
    note: 'Expires stale pending threads, cleans 24h+ orphan uploads, retries queued PDPA selfie deletions, warns when codes <= 5.',
    schedule: '*/30 * * * *',
    mode: 'dry_run',
    daily_cap: 50,
  },
  {
    name: 'protect',
    title: 'Protect & flags',
    note: 'Flags scam phrases, link tries, shared face/device/Wi-Fi, Ring farming; auto-hides posts at 3+ reports for your decision.',
    schedule: '*/15 * * * *',
    mode: 'dry_run',
    daily_cap: 100,
  },
  {
    name: 'dup_robot',
    title: 'Duplicate guard (new)',
    note: 'Live guard for NEW cases: hides newer account on >=0.60 face match to an older account or shared claim phone (undoable).',
    schedule: 'event-driven',
    mode: 'on',
    daily_cap: 25,
  },
  {
    name: 'dup_sweep',
    title: 'Duplicate past sweep',
    note: 'Sweep of PAST data (0095): DRY-RUN previews who would be hidden until switched ON.',
    schedule: 'manual',
    mode: 'dry_run',
    daily_cap: 50,
  },
  {
    name: 'growth_nudges',
    title: 'Growth nudges',
    note: 'DRY-RUN previews of incomplete-card, unverified-24h, dormant-7d, and weekly winners copy (Thai + English) for approval.',
    schedule: '15 3 * * *',
    mode: 'dry_run',
    daily_cap: 40,
    dry_run_only: true,
  },
  {
    name: 'ai_helper',
    title: 'AI wording slot',
    note: 'Optional OpenRouter free helper for Morning Brief wording, error plain-English notes, and caption drafts (no member data).',
    schedule: 'on-demand',
    mode: 'off',
    daily_cap: 30,
  },
  {
    name: 'nightly_selftest',
    title: 'Nightly self-test',
    note: 'Playwright core journey check on local build (Feed, People, Board, Admin Today/Needs you/Autopilot).',
    schedule: '30 21 * * *',
    mode: 'dry_run',
    daily_cap: 10,
  },
];

export function isAutopilotState(x: unknown): x is AutopilotState {
  const s = x as AutopilotState | null;
  return !!s && typeof s === 'object' && typeof s.paused === 'boolean' && Array.isArray(s.robots) && Array.isArray(s.logs);
}

export function fallbackAutopilotState(snap?: Snapshot | null): AutopilotState {
  const now = new Date().toISOString();
  const dayStart = snap?.day_start || now;
  return {
    at: now,
    day_start: dayStart,
    paused: false,
    pg_cron_available: false,
    cron_jobs: [],
    robots: DEFAULT_ROBOTS.map((r) => ({
      ...r,
      effective_mode: r.mode,
      today_actions: 0,
      today_dry_runs: 0,
      last_run: null,
      last_ok: null,
      last_note: null,
    })),
    heartbeats: [
      { job: 'kr8_autopilot_heartbeat', every_sec: 900, last_beat: null, last_ok: true, stale: false, missing: true, detail: { note: 'Awaiting SQL 0098' } },
    ],
    logs: [],
    fallback: true,
  };
}

export function modeLabel(m: RobotMode): string {
  if (m === 'on') return 'ON';
  if (m === 'dry_run') return 'DRY-RUN';
  return 'OFF';
}

export function modeTone(m: RobotMode, paused = false): 'g' | 'a' | 'r' | 'k' {
  if (paused) return 'r';
  if (m === 'on') return 'g';
  if (m === 'dry_run') return 'a';
  return 'k';
}

export function scheduleWords(sched: string): string {
  if (sched === '*/15 * * * *') return 'Every 15 min';
  if (sched === '*/30 * * * *') return 'Every 30 min';
  if (sched === '15 3 * * *') return 'Daily 08:45 IST';
  if (sched === '30 21 * * *') return 'Nightly 03:00 IST';
  if (sched === 'event-driven') return 'On face check / claim';
  if (sched === 'manual') return 'Manual / on demand';
  if (sched === 'on-demand') return 'On demand only';
  return sched;
}

export function heartbeatSummary(st: AutopilotState): { ok: boolean; tone: 'g' | 'a' | 'r'; headline: string; staleJobs: string[] } {
  if (st.paused) {
    return { ok: true, tone: 'r', headline: 'All robots paused by kill switch', staleJobs: [] };
  }
  const stale = st.heartbeats.filter((h) => h.stale || h.last_ok === false).map((h) => h.job);
  if (stale.length > 0) {
    return {
      ok: false,
      tone: 'r',
      headline: `${stale.length} scheduled heartbeat${stale.length === 1 ? '' : 's'} late or failing: ${stale.join(', ')}`,
      staleJobs: stale,
    };
  }
  if (!st.pg_cron_available) {
    return {
      ok: true,
      tone: 'a',
      headline: st.fallback
        ? 'Autopilot SQL 0098 pending on database — showing safe DRY-RUN defaults'
        : 'pg_cron not detected — SQL robot functions ready for external schedule trigger',
      staleJobs: [],
    };
  }
  const activeJobs = st.cron_jobs.filter((j) => j.active).length;
  return {
    ok: true,
    tone: 'g',
    headline: `pg_cron active (${activeJobs} scheduled job${activeJobs === 1 ? '' : 's'}) · heartbeats healthy`,
    staleJobs: [],
  };
}

export function formatRobotLogLine(l: RobotLogRow): string {
  const act = l.action.replace(/_/g, ' ');
  const tgt = l.target ? ` · ${l.target}` : '';
  const note = l.detail && typeof l.detail.note === 'string' && l.detail.note ? ` — ${l.detail.note}` : '';
  return `${l.robot}: ${act}${tgt}${note}`;
}

export function capStatus(r: RobotRow): { text: string; nearCap: boolean; atCap: boolean } {
  const used = r.mode === 'dry_run' ? r.today_dry_runs : r.today_actions;
  const atCap = r.daily_cap > 0 && used >= r.daily_cap;
  const nearCap = !atCap && r.daily_cap > 0 && used >= Math.ceil(r.daily_cap * 0.8);
  const suffix = r.mode === 'dry_run' ? 'dry-runs today' : 'actions today';
  const extra = r.mode !== 'dry_run' && r.today_dry_runs > 0 ? ` (+${r.today_dry_runs} dry-run)` : '';
  return {
    text: `${used} / ${r.daily_cap} ${suffix}${extra}`,
    nearCap,
    atCap,
  };
}

// ───────── M2 (0099): Alert Centre + Morning Brief ─────────
export type AlertSeverity = 'red' | 'amber' | 'grey';

export interface RobotAlert {
  id: string;
  dedupe_key: string;
  robot: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  href: string;
  at: string;
  detail?: Record<string, unknown>;
  synthetic?: boolean;
}

export interface MorningBriefItem {
  severity: AlertSeverity;
  title: string;
  sub: string;
  href: string;
}

export interface MorningBriefData {
  at: string;
  day_start: string;
  alerts: RobotAlert[];
  brief: {
    /** Real member count only — NEVER member_no */
    new_members: { today: number; total: number };
    face_checks: { today: number; pass: number; waiting: number; refused: number };
    posts: { reels_today: number; reels_waiting: number; reels_live: number; asks_today: number };
    held_payouts: { count: number; thb: number };
    voucher_stock: { available: number; burn_7d: number; daily_burn: number; days_left: number | null };
    errors: { client_24h: number; outbox_failed_24h: number; robot_failed_24h: number; total: number };
    top3_needs_you: MorningBriefItem[];
  };
}

export function isMorningBriefData(x: unknown): x is MorningBriefData {
  const m = x as MorningBriefData | null;
  return !!m && typeof m === 'object' && Array.isArray(m.alerts) && !!m.brief && !!m.brief.new_members && !!m.brief.voucher_stock;
}

const SEV_ORDER: Record<AlertSeverity, number> = { red: 1, amber: 2, grey: 3 };

export function sortRobotAlerts(alerts: RobotAlert[]): RobotAlert[] {
  return [...alerts].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || Date.parse(b.at) - Date.parse(a.at));
}

export function severityMeta(sev: AlertSeverity): { label: string; tone: 'r' | 'a' | 'k' } {
  if (sev === 'red') return { label: 'Broken', tone: 'r' };
  if (sev === 'amber') return { label: 'Needs decision', tone: 'a' };
  return { label: 'FYI', tone: 'k' };
}

export function computeVoucherRunway(available: number, burn7d: number): {
  available: number;
  burn_7d: number;
  daily_burn: number;
  days_left: number | null;
  headline: string;
  sub: string;
  hot: boolean;
} {
  const av = Math.max(0, Math.round(available));
  const b7 = Math.max(0, Math.round(burn7d));
  const daily = Math.round((b7 / 7) * 100) / 100;
  const daysLeft = av === 0 ? 0 : b7 > 0 ? Math.round((av / (b7 / 7)) * 10) / 10 : null;
  const headline = daysLeft === null ? 'Steady' : `${daysLeft}d left`;
  const sub = b7 > 0 ? `${av} left · ${b7} used / 7d` : `${av} left · 0 used / 7d`;
  const hot = av <= 5 || (daysLeft !== null && daysLeft < 3);
  return { available: av, burn_7d: b7, daily_burn: daily, days_left: daysLeft, headline, sub, hot };
}

export function synthesizeMorningBrief(
  s: Snapshot,
  inbox: { items: InboxItem[] } = buildInbox(s),
): MorningBriefData {
  const nowMs = Date.parse(s.at) || Date.now();
  const d0 = Date.parse(s.day_start);
  const t24 = nowMs - 24 * 3600_000;
  const t7d = nowMs - 7 * 86400_000;

  const pc = peopleCounts(s);
  const realPeople = s.people.filter((p) => p.kind === 'real');

  const checksToday = realPeople.filter((p) => p.check && Date.parse(p.check.at) >= d0);
  const fcPass = checksToday.filter((p) => p.check?.status === 'approved').length;
  const fcRefused = checksToday.filter((p) => p.check?.status === 'rejected').length;
  const fcWaiting = s.pending.checks.length;

  const reelsWaiting = s.pending.reels.length;
  const reelsWaitingToday = s.pending.reels.filter((r) => Date.parse(r.at) >= d0).length;
  const reelsLive = realPeople.reduce((n, p) => n + (p.reels?.live || 0), 0);

  const m = money(s);
  const burn7d = s.claims.filter(
    (c) => !c.is_test && c.status === 'assigned' && Date.parse(c.assigned_at || c.created_at) >= t7d,
  ).length;
  const runway = computeVoucherRunway(m.available, burn7d);

  const outboxErr24h = s.alerts.filter((a) => !!a.error && Date.parse(a.at) >= t24).length;

  const alerts: RobotAlert[] = [];
  if (m.available <= 5) {
    alerts.push({
      id: 'syn:stock_low',
      dedupe_key: 'sys:voucher_stock_low',
      robot: 'self_fix',
      severity: m.available <= 2 ? 'red' : 'amber',
      title: `Voucher stock low: ${m.available} code${m.available === 1 ? '' : 's'} left${runway.days_left !== null ? ` (~${runway.days_left}d left)` : ''}`,
      body: `Buy codes (${DEFAULT_VOUCHER_BUY_URL}) and paste into Codes before winners claim.`,
      href: '#codes',
      at: s.at,
      detail: { available: m.available, buy_url: DEFAULT_VOUCHER_BUY_URL, paste_hash: '#codes' },
      synthetic: true,
    });
  }
  if (outboxErr24h > 0) {
    alerts.push({
      id: 'syn:errors',
      dedupe_key: 'sys:errors_24h',
      robot: 'health_watch',
      severity: outboxErr24h >= 5 ? 'red' : 'amber',
      title: `${outboxErr24h} system alert error${outboxErr24h === 1 ? '' : 's'} in the last 24h`,
      body: 'Check Problems & outbox delivery.',
      href: '#problems',
      at: s.at,
      synthetic: true,
    });
  }
  if (m.heldN > 0) {
    alerts.push({
      id: 'syn:held',
      dedupe_key: 'sys:held_claims',
      robot: 'protect',
      severity: 'amber',
      title: `${m.heldN} held payout${m.heldN === 1 ? '' : 's'} (฿${m.heldThb}) waiting for your tap`,
      body: 'Money Robot scored each held claim — tap Pay or Refuse below.',
      href: '#inbox',
      at: s.at,
      synthetic: true,
    });
  }
  if (s.pending.reports > 0) {
    alerts.push({
      id: 'syn:reports',
      dedupe_key: 'sys:open_reports',
      robot: 'protect',
      severity: 'amber',
      title: `${s.pending.reports} open member report${s.pending.reports === 1 ? '' : 's'} waiting`,
      body: 'Check reported Reels or members and decide.',
      href: '#q/reports',
      at: s.at,
      synthetic: true,
    });
  }
  const dupsToday = (s.dups_auto || []).filter((d) => !d.preview && !d.undone && d.ghost && Date.parse(d.at) >= d0).length;
  if (dupsToday > 0) {
    alerts.push({
      id: 'syn:dups',
      dedupe_key: 'sys:dups_today',
      robot: 'dup_robot',
      severity: 'grey',
      title: `${dupsToday} duplicate account${dupsToday === 1 ? '' : 's'} handled automatically today`,
      body: 'Kept oldest account and voided weekly Rings (tap Undo any time).',
      href: '#auto',
      at: s.at,
      synthetic: true,
    });
  }

  const sortedAlerts = sortRobotAlerts(alerts);

  const top3: MorningBriefItem[] = sortedAlerts
    .filter((a) => a.severity === 'red' || a.severity === 'amber')
    .map((a) => ({ severity: a.severity, title: a.title, sub: a.body, href: a.href }));

  for (const item of inbox.items) {
    if (top3.length >= 3) break;
    if (item.kind === 'held' && top3.some((t) => t.title.includes('held payout'))) continue;
    if (item.kind === 'reports' && top3.some((t) => t.title.includes('report'))) continue;
    top3.push({
      severity: 'amber',
      title: item.title,
      sub: item.why,
      href: '#inbox',
    });
  }

  return {
    at: s.at,
    day_start: s.day_start,
    alerts: sortedAlerts,
    brief: {
      new_members: { today: pc.today, total: pc.members },
      face_checks: { today: checksToday.length, pass: fcPass, waiting: fcWaiting, refused: fcRefused },
      posts: { reels_today: reelsWaitingToday, reels_waiting: reelsWaiting, reels_live: reelsLive, asks_today: 0 },
      held_payouts: { count: m.heldN, thb: m.heldThb },
      voucher_stock: {
        available: runway.available,
        burn_7d: runway.burn_7d,
        daily_burn: runway.daily_burn,
        days_left: runway.days_left,
      },
      errors: { client_24h: 0, outbox_failed_24h: outboxErr24h, robot_failed_24h: 0, total: outboxErr24h },
      top3_needs_you: top3.slice(0, 3),
    },
  };
}

// ───────── M3 (0100): Health Watch (8 vital checks every 15 min + auto-clearing red alerts) ─────────
export type HealthCheckKey =
  | 'db'
  | 'auth'
  | 'storage'
  | 'rpc_speed'
  | 'face_check'
  | 'voucher_stock'
  | 'quotas'
  | 'heartbeats';

export interface HealthCheckRow {
  key: HealthCheckKey;
  ord: number;
  title: string;
  ok: boolean;
  summary: string;
  ms: number | null;
  detail: Record<string, unknown>;
  checked_at?: string;
}

export interface HealthWatchReport {
  at: string;
  mode: RobotMode;
  all_ok: boolean;
  checks: HealthCheckRow[];
}

export function isHealthWatchReport(x: unknown): x is HealthWatchReport {
  const h = x as HealthWatchReport | null;
  return !!h && typeof h === 'object' && typeof h.all_ok === 'boolean' && Array.isArray(h.checks);
}

export interface HealthEvalInput {
  dbOk?: boolean;
  dbMs?: number;
  memberRows?: number;
  authOk?: boolean;
  authMs?: number;
  storageOk?: boolean;
  storageBuckets?: number;
  missingBuckets?: string[];
  rpcMs?: number;
  rpcLimitMs?: number;
  faceCheckOk?: boolean;
  faceMs?: number;
  availableVouchers: number;
  minVouchers?: number;
  dbMb?: number;
  dbLimitMb?: number;
  storageMb?: number;
  storageLimitMb?: number;
  staleHeartbeats?: string[];
}

/** Pure evaluator mirroring 0100_kr8_autopilot2_m3.sql kr8_health_evaluate across all 8 checks. */
export function evaluateHealthChecks(inp: HealthEvalInput): HealthCheckRow[] {
  const rpcLimit = inp.rpcLimitMs ?? 2000;
  const minV = inp.minVouchers ?? 5;
  const dbLim = Math.max(1, inp.dbLimitMb ?? 500);
  const stLim = Math.max(1, inp.storageLimitMb ?? 1024);

  const dbOk = inp.dbOk !== false;
  const authOk = inp.authOk !== false;
  const missingB = inp.missingBuckets || [];
  const stOk = inp.storageOk !== false && missingB.length === 0;
  const rpcMs = inp.rpcMs ?? 45;
  const rpcOk = rpcMs < rpcLimit;
  const faceOk = inp.faceCheckOk !== false;
  const vAvail = Math.max(0, Math.round(inp.availableVouchers));
  const vOk = vAvail > minV;

  const dbMb = Math.round((inp.dbMb ?? 18.4) * 10) / 10;
  const stMb = Math.round((inp.storageMb ?? 64.2) * 10) / 10;
  const dbPct = Math.round((dbMb / dbLim) * 100);
  const stPct = Math.round((stMb / stLim) * 100);
  const quotaOk = dbPct < 90 && stPct < 90;

  const stale = inp.staleHeartbeats || [];
  const hbOk = stale.length === 0;

  return [
    {
      key: 'db',
      ord: 1,
      title: 'DB reachable',
      ok: dbOk,
      summary: dbOk ? `Postgres OK (${inp.dbMs ?? 12} ms · ${inp.memberRows ?? 0} member rows)` : 'Database unreachable or query failed',
      ms: inp.dbMs ?? 12,
      detail: { members: inp.memberRows ?? 0 },
    },
    {
      key: 'auth',
      ord: 2,
      title: 'Auth working',
      ok: authOk,
      summary: authOk ? `Auth session & users reachable (${inp.authMs ?? 18} ms)` : 'Auth session or auth.users check failed',
      ms: inp.authMs ?? 18,
      detail: {},
    },
    {
      key: 'storage',
      ord: 3,
      title: 'Storage buckets reachable',
      ok: stOk,
      summary: stOk
        ? `${inp.storageBuckets ?? 4} storage buckets reachable`
        : missingB.length
          ? `Missing storage bucket(s): ${missingB.join(', ')}`
          : 'Storage endpoint unreachable',
      ms: 20,
      detail: { missing: missingB },
    },
    {
      key: 'rpc_speed',
      ord: 4,
      title: 'Key RPCs < 2 s',
      ok: rpcOk,
      summary: rpcOk ? `Key RPCs answered in ${rpcMs} ms (< ${rpcLimit} ms limit)` : `Key RPCs slow: ${rpcMs} ms (limit ${rpcLimit} ms)`,
      ms: rpcMs,
      detail: { limit_ms: rpcLimit },
    },
    {
      key: 'face_check',
      ord: 5,
      title: 'Face-check alive',
      ok: faceOk,
      summary: faceOk ? `kr8_verify_instant + pgvector alive (${inp.faceMs ?? 9} ms)` : 'kr8_verify_instant or pgvector unavailable',
      ms: inp.faceMs ?? 9,
      detail: {},
    },
    {
      key: 'voucher_stock',
      ord: 6,
      title: 'Voucher stock > 5',
      ok: vOk,
      summary: vOk ? `${vAvail} vouchers available (> ${minV} threshold)` : `LOW STOCK: only ${vAvail} voucher(s) left (needs > ${minV})`,
      ms: null,
      detail: { available: vAvail, min: minV },
    },
    {
      key: 'quotas',
      ord: 7,
      title: 'Free-tier quotas',
      ok: quotaOk,
      summary: `DB ${dbMb}/${dbLim} MB (${dbPct}%) · Storage ${stMb}/${stLim} MB (${stPct}%)`,
      ms: null,
      detail: { db_mb: dbMb, db_limit_mb: dbLim, db_pct: dbPct, storage_mb: stMb, storage_limit_mb: stLim, storage_pct: stPct },
    },
    {
      key: 'heartbeats',
      ord: 8,
      title: 'Cron heartbeats fresh',
      ok: hbOk,
      summary: hbOk ? 'All active heartbeats fresh' : `Stale or failed heartbeat(s): ${stale.join(', ')}`,
      ms: null,
      detail: { stale_jobs: stale },
    },
  ];
}

/** Raises RED alerts for failing checks and AUTO-CLEARS existing health:* alerts when checks pass again. */
export function reconcileHealthAlerts(existing: RobotAlert[], checks: HealthCheckRow[], nowIso = new Date().toISOString()): {
  alerts: RobotAlert[];
  raised: string[];
  cleared: string[];
} {
  const byKey = new Map(existing.map((a) => [a.dedupe_key, a]));
  const raised: string[] = [];
  const cleared: string[] = [];

  for (const c of checks) {
    const dkey = `health:${c.key}`;
    if (!c.ok) {
      if (!byKey.has(dkey)) raised.push(c.key);
      byKey.set(dkey, {
        id: byKey.get(dkey)?.id || `hlth-${c.key}`,
        dedupe_key: dkey,
        robot: 'health_watch',
        severity: 'red',
        title: `Health check failed: ${c.title}`,
        body: c.summary,
        href: c.key === 'voucher_stock' ? '#codes' : '#autopilot',
        at: nowIso,
      });
    } else if (byKey.has(dkey)) {
      byKey.delete(dkey);
      cleared.push(c.key);
    }
  }

  return { alerts: sortRobotAlerts([...byKey.values()]), raised, cleared };
}

export function fallbackHealthWatch(snap?: Snapshot | null, st?: AutopilotState | null, rpcMs = 60): HealthWatchReport {
  const avail = snap ? money(snap).available : 12;
  const stale = st ? heartbeatSummary(st).staleJobs : [];
  const checks = evaluateHealthChecks({
    memberRows: snap ? snap.people.length : 0,
    rpcMs,
    availableVouchers: avail,
    staleHeartbeats: stale,
  });
  return {
    at: new Date().toISOString(),
    mode: st?.robots.find((r) => r.name === 'health_watch')?.mode || 'dry_run',
    all_ok: checks.every((c) => c.ok),
    checks,
  };
}

// ───────── M4 (0101): Self-Fix Robot (safe only, logged, undoable, default DRY-RUN) ─────────
export const DEFAULT_VOUCHER_BUY_URL = 'https://www.seagm.com/truemoney-wallet-thailand';

export interface SelfFixStatus {
  at: string;
  mode: RobotMode;
  pdpa_sla_hours: number;
  pdpa_queued: number;
  other_trash_queued: number;
  pdpa_late: number;
  oldest_queued_hours: number;
  orphan_candidates: number;
  stale_threads: number;
  stale_holds: number;
  stuck_geo: number;
  stuck_push: number;
  available_vouchers: number;
  restock_warn_at: number;
  voucher_buy_url: string;
  fallback?: boolean;
}

export interface PlannedSelfFixAction {
  action: string;
  target: string;
  dry_run: boolean;
  undo_kind: 'reopen_thread' | 'unqueue_trash' | 'restore_place_geo' | 'restore_push_claim' | null;
  count: number;
  note: string;
}

export function isSelfFixStatus(v: unknown): v is SelfFixStatus {
  const x = v as SelfFixStatus | null;
  return (
    !!x &&
    typeof x === 'object' &&
    typeof x.pdpa_late === 'number' &&
    typeof x.available_vouchers === 'number' &&
    typeof x.voucher_buy_url === 'string'
  );
}

/**
 * Pure M4 alert reconciliation:
 * - PDPA deletion requests MUST finish on time; raises RED 'selffix:pdpa_late' whenever pdpa_late > 0, auto-clears at 0.
 * - Restock warning at <= restock_warn_at (default 5) with supplier buy link + #codes, auto-clears when > restock_warn_at.
 * - Stale held claims (>24h) get an amber reminder ONLY — NEVER auto-pays or auto-refuses.
 */
export function reconcileSelfFixAlerts(
  existing: RobotAlert[],
  status: SelfFixStatus,
  nowIso = new Date().toISOString(),
): {
  alerts: RobotAlert[];
  raised: string[];
  cleared: string[];
} {
  const byKey = new Map(existing.map((a) => [a.dedupe_key, a]));
  const raised: string[] = [];
  const cleared: string[] = [];

  const upsert = (dkey: string, next: Omit<RobotAlert, 'id' | 'dedupe_key' | 'at'>) => {
    const prev = byKey.get(dkey);
    if (!prev) raised.push(dkey);
    byKey.set(dkey, {
      id: prev?.id || `sf-${dkey.replace(/[^a-z0-9]/gi, '-')}`,
      dedupe_key: dkey,
      at: nowIso,
      ...next,
    });
  };
  const clear = (dkey: string) => {
    if (byKey.has(dkey)) {
      byKey.delete(dkey);
      cleared.push(dkey);
    }
  };

  if (status.pdpa_late > 0) {
    upsert('selffix:pdpa_late', {
      robot: 'self_fix',
      severity: 'red',
      title: `PDPA file deletion overdue · ${status.pdpa_late} file(s) waiting`,
      body: `Queued selfie / account-deletion file(s) older than ${status.pdpa_sla_hours}h SLA (oldest ${status.oldest_queued_hours}h). Open Autopilot and tap Flush queued deletions.`,
      href: '#autopilot',
      detail: {
        overdue: status.pdpa_late,
        verify_queued: status.pdpa_queued,
        oldest_hours: status.oldest_queued_hours,
        sla_hours: status.pdpa_sla_hours,
      },
    });
  } else {
    clear('selffix:pdpa_late');
  }

  const buyUrl = status.voucher_buy_url || DEFAULT_VOUCHER_BUY_URL;
  if (status.available_vouchers <= status.restock_warn_at) {
    upsert('selffix:voucher_restock', {
      robot: 'self_fix',
      severity: status.available_vouchers <= 2 ? 'red' : 'amber',
      title: `Restock vouchers · ${status.available_vouchers} left (threshold <= ${status.restock_warn_at})`,
      body: `Buy TrueMoney / Grab codes (${buyUrl}) and paste them into Codes before rewards pause.`,
      href: '#codes',
      detail: {
        available: status.available_vouchers,
        threshold: status.restock_warn_at,
        buy_url: buyUrl,
        paste_hash: '#codes',
      },
    });
  } else {
    clear('selffix:voucher_restock');
  }

  if (status.stale_holds > 0) {
    upsert('selffix:stale_holds', {
      robot: 'self_fix',
      severity: 'amber',
      title: `${status.stale_holds} held payout(s) waiting > 24h for your tap`,
      body: 'Robots never auto-pay or auto-refuse held claims. Review robot verdict in Needs you.',
      href: '#inbox',
      detail: { stale_holds: status.stale_holds },
    });
  } else {
    clear('selffix:stale_holds');
  }

  return { alerts: sortRobotAlerts([...byKey.values()]), raised, cleared };
}

/**
 * Pure M4 safe-action planner:
 * - Respects OFF, DRY-RUN, and ON + daily_cap.
 * - NEVER touches held payouts or bans.
 * - Every applied action carries a lossless undo_kind.
 */
export function planSelfFixRun(
  status: SelfFixStatus,
  mode: RobotMode = status.mode,
  dailyCap = 100,
  usedToday = 0,
): {
  skipped: boolean;
  actions: PlannedSelfFixAction[];
  capReached: boolean;
} {
  if (mode === 'off') {
    return { skipped: true, actions: [], capReached: false };
  }

  let budget = mode === 'on' ? Math.max(0, dailyCap - usedToday) : Number.POSITIVE_INFINITY;
  let capReached = mode === 'on' && budget === 0;
  const isDry = mode === 'dry_run';
  const actions: PlannedSelfFixAction[] = [];

  const take = (
    available: number,
    onAction: string,
    dryAction: string,
    target: string,
    undoKind: PlannedSelfFixAction['undo_kind'],
    noteBase: string,
  ) => {
    if (available <= 0) return;
    if (!isDry && budget <= 0) {
      capReached = true;
      return;
    }
    const count = isDry ? available : Math.min(available, budget);
    if (!isDry) {
      budget -= count;
      if (available > count) capReached = true;
    }
    actions.push({
      action: isDry ? dryAction : onAction,
      target,
      dry_run: isDry,
      undo_kind: isDry ? null : undoKind,
      count,
      note: isDry ? `Would handle ${count} ${noteBase}` : `Handled ${count} ${noteBase}`,
    });
  };

  take(status.stale_threads, 'expire_stale_thread', 'would_expire_stale_thread', 'kr8_threads', 'reopen_thread', 'stale pending thread(s) >14d');
  take(status.orphan_candidates, 'queue_orphan_file', 'would_queue_orphan_file', 'storage.objects', 'unqueue_trash', 'orphan upload(s) >24h');
  take(status.stuck_geo, 'retry_stuck_place_geo', 'would_retry_stuck_place_geo', 'kr8_place_geo', 'restore_place_geo', 'stuck place geocode job(s) >30m');
  take(status.stuck_push, 'retry_stuck_push_outbox', 'would_retry_stuck_push_outbox', 'kr8_push_outbox', 'restore_push_claim', 'stuck push outbox claim(s) >15m');

  return { skipped: false, actions, capReached };
}

export function fallbackSelfFixStatus(snap?: Snapshot | null, st?: AutopilotState | null): SelfFixStatus {
  const avail = snap ? money(snap).available : 12;
  const nowMs = snap ? Date.parse(snap.at) || Date.now() : Date.now();
  const staleHolds = snap
    ? snap.claims.filter((c) => !c.is_test && c.held && c.status === 'pending' && !c.decided && nowMs - Date.parse(c.created_at) > 24 * 3600_000).length
    : 0;
  return {
    at: new Date().toISOString(),
    mode: st?.robots.find((r) => r.name === 'self_fix')?.mode || 'dry_run',
    pdpa_sla_hours: 12,
    pdpa_queued: 0,
    other_trash_queued: 0,
    pdpa_late: 0,
    oldest_queued_hours: 0,
    orphan_candidates: 0,
    stale_threads: 0,
    stale_holds: staleHolds,
    stuck_geo: 0,
    stuck_push: 0,
    available_vouchers: avail,
    restock_warn_at: 5,
    voucher_buy_url: DEFAULT_VOUCHER_BUY_URL,
    fallback: true,
  };
}

// ───────── M5 (0102): Protect Robot (flags, never auto-ban, >=3 reports auto-hide undoable, feeds kr8_trust) ─────────
export type ProtectFlagKey = 'link_tries' | 'scam_chat' | 'shared_signals' | 'ring_farming';
export type ScamChatReason = 'money_request' | 'crypto_or_gambling' | 'line_hunting';

export interface ProtectFlagRow {
  user_id: string;
  member_no: number | null;
  name: string | null;
  flag_key: ProtectFlagKey;
  severity: AlertSeverity;
  summary: string;
  detail: Record<string, unknown>;
  last_at: string;
  trust?: Trust | null;
}

export interface ProtectReportedPost {
  post_id: string;
  author_id: string;
  member_no: number | null;
  name: string | null;
  kind: string;
  hidden: boolean;
  reporters: number;
  latest_at: string;
}

export interface ProtectOverview {
  at: string;
  mode: RobotMode;
  counts: {
    scam_chat: number;
    link_tries: number;
    ring_farming: number;
    shared_signals: number;
    reported_posts_3plus: number;
  };
  flags: ProtectFlagRow[];
  reported_posts: ProtectReportedPost[];
  fallback?: boolean;
}

export function isProtectOverview(v: unknown): v is ProtectOverview {
  const x = v as ProtectOverview | null;
  return !!x && typeof x === 'object' && !!x.counts && Array.isArray(x.flags) && Array.isArray(x.reported_posts);
}

const THAI_DIGITS: Record<string, string> = {
  '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4',
  '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9',
};

/** Pure detector mirroring SQL kr8_chat_scam_reason(text). Never auto-bans — flags for founder. */
export function detectChatScamPhrase(body: string): ScamChatReason | null {
  const raw = (body || '').replace(/[๐-๙]/g, (d) => THAI_DIGITS[d] || d);
  if (!raw.trim()) return null;
  const lo = raw.toLowerCase();

  if (
    /\b(send\s+(me\s+)?money|wire\s+money|transfer\s+money|western\s+union|moneygram|lend\s+me\s+money|need\s+money\s+urgently|bank\s+account\s+number)\b/.test(lo) ||
    /(โอนเงิน|ยืมเงิน|ร้อนเงิน|ขอเงินหน่อย|ช่วยโอน|โอนให้หน่อย|เลขบัญชี|พร้อมเพย์\s*[0-9]{8,})/.test(raw)
  ) {
    return 'money_request';
  }

  if (
    /\b(usdt|crypto\s+invest\w*|bitcoin\s+profit|forex\s+signal\w*|guaranteed\s+profit|whatsapp\s+me|telegram\s+me)\b/.test(lo) ||
    /(ชวนลงทุน|เทรดหุ้นกำไร|เว็บพนัน|บาคาร่า|สล็อตเว็บตรง|ปั่นบาคาร่า|หวยออนไลน์)/.test(raw)
  ) {
    return 'crypto_or_gambling';
  }

  if (
    /(\bline\s*(id)?\s*[:：=]|\bline\s*id\b|\bid\s*line\b|\badd\s+(my\s+)?line\b)/.test(lo) ||
    /(แอดไลน์|ทักไลน์|ไอดีไลน์|ไลน์ไอดี|ขอไลน์หน่อย)/.test(raw)
  ) {
    return 'line_hunting';
  }

  return null;
}

/** Pure Ring-farming pair detector: >=3 likes/saves given, >=80% to one partner, and >=2 reciprocated back. */
export function detectRingFarmingPairs(
  interactions: { giver: string; receiver: string }[],
): { userId: string; partnerId: string; givenToPartner: number; totalGiven: number; receivedBack: number }[] {
  const valid = interactions.filter((x) => x.giver && x.receiver && x.giver !== x.receiver);
  const totalByGiver = new Map<string, number>();
  const pairCount = new Map<string, number>();

  for (const x of valid) {
    totalByGiver.set(x.giver, (totalByGiver.get(x.giver) || 0) + 1);
    const k = `${x.giver}|${x.receiver}`;
    pairCount.set(k, (pairCount.get(k) || 0) + 1);
  }

  const out: { userId: string; partnerId: string; givenToPartner: number; totalGiven: number; receivedBack: number }[] = [];
  for (const [k, givenToPartner] of pairCount) {
    if (givenToPartner < 3) continue;
    const [giver, receiver] = k.split('|');
    const totalGiven = totalByGiver.get(giver) || 0;
    if (totalGiven < 3 || givenToPartner / totalGiven < 0.8) continue;
    const receivedBack = pairCount.get(`${receiver}|${giver}`) || 0;
    if (receivedBack < 2) continue;
    out.push({ userId: giver, partnerId: receiver, givenToPartner, totalGiven, receivedBack });
  }
  return out;
}

/** Pure >=3 distinct reports policy: auto-hide (logged, undoable via unhide_post) + founder decides. */
export function evaluateReportedPostAction(
  distinctReporters: number,
  alreadyHidden: boolean,
  mode: RobotMode,
): {
  reachedThreshold: boolean;
  shouldHideNow: boolean;
  dryRunPreview: boolean;
  raiseFounderAlert: boolean;
  undoKind: 'unhide_post' | null;
} {
  if (distinctReporters < 3 || mode === 'off') {
    return {
      reachedThreshold: false,
      shouldHideNow: false,
      dryRunPreview: false,
      raiseFounderAlert: false,
      undoKind: null,
    };
  }
  if (alreadyHidden) {
    return {
      reachedThreshold: true,
      shouldHideNow: false,
      dryRunPreview: false,
      raiseFounderAlert: true,
      undoKind: mode === 'on' ? 'unhide_post' : null,
    };
  }
  return {
    reachedThreshold: true,
    shouldHideNow: mode === 'on',
    dryRunPreview: mode === 'dry_run',
    raiseFounderAlert: true,
    undoKind: mode === 'on' ? 'unhide_post' : null,
  };
}

/**
 * Pure additive trust score calculator matching 0102 kr8_trust(uuid):
 * - Preserves live-base 0095 rules: ZERO Rings guard; shared Wi-Fi alone = 0 (-10 ONLY alongside another warning sign).
 * - Adds -25 for active scam_chat and -15 for active ring_farming.
 */
export function computeTrustWithProtect(
  baseScore: number,
  baseReasons: string[],
  opts: {
    hasScamChat?: boolean;
    scamReason?: ScamChatReason;
    ringFarmPartnerNo?: number | null;
    hasRingFarming?: boolean;
    sharedWifi?: boolean;
    hasExistingWarning?: boolean;
  },
): Trust {
  let score = baseScore;
  const reasons = [...baseReasons];

  if (opts.hasScamChat) {
    score -= 25;
    const label = opts.scamReason === 'money_request'
      ? '−25 money request phrase in chat'
      : opts.scamReason === 'crypto_or_gambling'
        ? '−25 crypto / gambling phrase in chat'
        : '−25 LINE-ID hunting phrase in chat';
    reasons.push(label);
  }

  if (opts.hasRingFarming) {
    score -= 15;
    reasons.push(`−15 Ring farming pair${opts.ringFarmPartnerNo != null ? ` with #${opts.ringFarmPartnerNo}` : ''}`);
  }

  const anyWarning = !!opts.hasExistingWarning || !!opts.hasScamChat || !!opts.hasRingFarming;
  if (opts.sharedWifi && anyWarning && !reasons.some((r) => r.includes('same Wi-Fi'))) {
    score -= 10;
    reasons.push('−10 same Wi-Fi as a claimer');
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
  };
}

export function flagKeyLabel(k: ProtectFlagKey): string {
  if (k === 'scam_chat') return 'Chat scam / LINE hunt';
  if (k === 'link_tries') return 'Blocked link tries';
  if (k === 'ring_farming') return 'Ring farming pair';
  return 'Shared face / device / Wi-Fi';
}

export function fallbackProtectOverview(snap?: Snapshot | null, st?: AutopilotState | null): ProtectOverview {
  const flags: ProtectFlagRow[] = [];
  if (snap) {
    for (const p of snap.people) {
      if (p.kind !== 'real') continue;
      if (p.links && p.links.length > 0) {
        const rs = [...new Set(p.links.map((l) => l.reason))];
        flags.push({
          user_id: p.user_id,
          member_no: p.no,
          name: p.name,
          flag_key: 'shared_signals',
          severity: rs.includes('face') || rs.includes('device') ? 'amber' : 'grey',
          summary: `Shared ${rs.join(' / ')} with ${p.links.length} linked account(s)`,
          detail: { reasons: rs, peers: p.links.length },
          last_at: snap.at,
          trust: p.trust || null,
        });
      }
    }
  }
  return {
    at: new Date().toISOString(),
    mode: st?.robots.find((r) => r.name === 'protect')?.mode || 'dry_run',
    counts: {
      scam_chat: 0,
      link_tries: 0,
      ring_farming: 0,
      shared_signals: flags.length,
      reported_posts_3plus: 0,
    },
    flags: flags.slice(0, 20),
    reported_posts: [],
    fallback: true,
  };
}

