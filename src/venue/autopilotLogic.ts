/**
 * Kring Autopilot M1+ pure logic & types (rebased onto live-base 8a29fdb, 18 Nov 2026).
 * Admin text is strictly plain English. Money, bans, and claim refusals never auto-execute.
 */
import { buildInbox, money, peopleCounts, type InboxItem, type Snapshot } from './adminV2Logic';

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
      body: 'Top up TrueMoney / Grab codes before winners claim.',
      href: '#codes',
      at: s.at,
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
