import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  capStatus,
  fallbackAutopilotState,
  formatRobotLogLine,
  heartbeatSummary,
  type AutopilotState,
} from './autopilotLogic';

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

function makeMockState(overrides: Partial<AutopilotState> = {}): AutopilotState {
  const base = fallbackAutopilotState();
  return {
    ...base,
    fallback: false,
    pg_cron_available: true,
    cron_jobs: [{ jobname: 'kr8_autopilot_heartbeat', schedule: '*/15 * * * *', active: true }],
    heartbeats: [
      {
        job: 'kr8_autopilot_heartbeat',
        every_sec: 900,
        last_beat: new Date().toISOString(),
        last_ok: true,
        stale: false,
        missing: false,
        detail: { note: 'Autopilot pulse OK' },
      },
    ],
    robots: base.robots.map((r) =>
      r.name === 'self_fix'
        ? { ...r, mode: 'on', effective_mode: 'on', today_actions: 3, last_run: new Date().toISOString(), last_ok: true, last_note: 'Cleaned 3 stale threads' }
        : r,
    ),
    logs: [
      {
        id: 501,
        robot: 'self_fix',
        action: 'expire_stale_thread',
        target: 'thread:abc-123',
        detail: { note: 'Pending >14 days without reply' },
        can_undo: true,
        undone_at: null,
        dry_run: false,
        at: new Date().toISOString(),
      },
      {
        id: 502,
        robot: 'growth_nudges',
        action: 'preview_incomplete_card',
        target: '#42',
        detail: { note: 'Would nudge after 24h without photo' },
        can_undo: false,
        undone_at: null,
        dry_run: true,
        at: new Date().toISOString(),
      },
    ],
    ...overrides,
  };
}

let currentState = makeMockState();

vi.mock('./shared', async () => {
  const actual = await vi.importActual<typeof import('./shared')>('./shared');
  return {
    ...actual,
    rpc: vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push({ fn, args });
      if (fn === 'kr8_admin_autopilot_state') return currentState;
      if (fn === 'kr8_admin_robot_set') {
        currentState = {
          ...currentState,
          robots: currentState.robots.map((r) =>
            r.name === args.p_name
              ? { ...r, mode: (args.p_mode as typeof r.mode) || r.mode, daily_cap: typeof args.p_daily_cap === 'number' ? args.p_daily_cap : r.daily_cap }
              : r,
          ),
        };
        return { ok: true };
      }
      if (fn === 'kr8_admin_pause_all_robots') {
        currentState = { ...currentState, paused: Boolean(args.p_pause) };
        return { paused: currentState.paused };
      }
      if (fn === 'kr8_admin_robot_undo') {
        currentState = {
          ...currentState,
          logs: currentState.logs.map((l) => (l.id === args.p_log_id ? { ...l, can_undo: false, undone_at: new Date().toISOString() } : l)),
        };
        return { ok: true };
      }
      if (fn === 'kr8_admin_robot_run_now') return { ok: true };
      return {};
    }),
  };
});

describe('T-380 M1R Foundation (rebased onto live-base 8a29fdb)', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    currentState = makeMockState();
    document.body.innerHTML = '<main id="app"></main>';
  });

  it('keeps dup_robot ON for new cases, dup_sweep DRY-RUN for past data, and all new T-380 robots OFF/DRY-RUN by default', () => {
    const def = fallbackAutopilotState();
    const dupNew = def.robots.find((r) => r.name === 'dup_robot');
    const dupSweep = def.robots.find((r) => r.name === 'dup_sweep');
    expect(dupNew?.mode).toBe('on');
    expect(dupSweep?.mode).toBe('dry_run');
    expect(def.robots.some((r) => r.name === 'rings_guard')).toBe(false);
    expect(def.robots.filter((r) => r.name !== 'dup_robot').every((r) => r.mode === 'dry_run' || r.mode === 'off')).toBe(true);

    const healthy = heartbeatSummary(makeMockState());
    expect(healthy.ok).toBe(true);
    expect(healthy.tone).toBe('g');

    const stale = heartbeatSummary(
      makeMockState({
        heartbeats: [{ job: 'health_watch', every_sec: 900, last_beat: '2026-11-17T00:00:00Z', last_ok: true, stale: true, missing: false, detail: null }],
      }),
    );
    expect(stale.ok).toBe(false);
    expect(stale.tone).toBe('r');

    const rNear = { ...def.robots[0], mode: 'on' as const, daily_cap: 10, today_actions: 8, today_dry_runs: 2 };
    expect(capStatus(rNear).nearCap).toBe(true);
    expect(formatRobotLogLine(currentState.logs[0])).toContain('self_fix: expire stale thread');
  });

  it('renders More -> Autopilot (#autopilot) with 8 robots, switches, daily cap, Undo, and Pause all kill switch', async () => {
    const { v2Route, v2Flush } = await import('./adminV2');
    expect(v2Route('autopilot')).toBe(true);
    await vi.waitFor(() => expect(document.querySelectorAll('.ap-robot').length).toBe(8));

    const gnOn = document.getElementById('apMode-growth_nudges-on') as HTMLButtonElement;
    expect(gnOn.disabled).toBe(true);

    (document.getElementById('apMode-health_watch-on') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(rpcCalls.some((c) => c.fn === 'kr8_admin_robot_set' && c.args.p_name === 'health_watch' && c.args.p_mode === 'on')).toBe(true));

    const capIn = document.getElementById('apCap-self_fix') as HTMLInputElement;
    capIn.value = '75';
    (document.getElementById('apCapSave-self_fix') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(rpcCalls.some((c) => c.fn === 'kr8_admin_robot_set' && c.args.p_name === 'self_fix' && c.args.p_daily_cap === 75)).toBe(true));

    (document.getElementById('apUndo-501') as HTMLButtonElement).click();
    v2Flush();
    await vi.waitFor(() => expect(rpcCalls.some((c) => c.fn === 'kr8_admin_robot_undo' && c.args.p_log_id === 501)).toBe(true));

    (document.getElementById('apKillBtn') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.getElementById('apKillSwitch')?.textContent).toContain('All robots are PAUSED'));
  });
});
