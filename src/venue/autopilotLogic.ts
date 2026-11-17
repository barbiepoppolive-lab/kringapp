/**
 * Kring Autopilot M1+ pure logic & types (rebased onto live-base 8a29fdb, 18 Nov 2026).
 * Admin text is strictly plain English. Money, bans, and claim refusals never auto-execute.
 */
import type { Snapshot } from './adminV2Logic';

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
