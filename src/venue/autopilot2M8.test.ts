import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { reconcileSelfTestAlert, summarizeSelfTestRun, type SelfTestStep } from './autopilotLogic';

describe('T-380 M8: Nightly Self-Test (local journey summary, red alert on failure, zero secrets in script)', () => {
  it('summarizes journey steps, raises a RED alert when any step fails, and auto-clears when all steps pass', () => {
    const failingSteps: SelfTestStep[] = [
      { step: 'sign_in_test4', ok: true, ms: 180 },
      { step: 'member_feed', ok: true, ms: 420 },
      { step: 'member_people', ok: false, ms: 900, error: 'People tab timeout' },
    ];
    const failSum = summarizeSelfTestRun(failingSteps, 1500);
    expect(failSum.ok).toBe(false);
    expect(failSum.passed).toBe(2);
    expect(failSum.total).toBe(3);

    const r1 = reconcileSelfTestAlert([], failingSteps, 1500, '2026-11-18T04:00:00Z');
    expect(r1.raised).toBe(true);
    expect(r1.alerts[0].severity).toBe('red');
    expect(r1.alerts[0].dedupe_key).toBe('selftest:nightly');

    const passingSteps: SelfTestStep[] = [
      { step: 'sign_in_test4', ok: true, ms: 160 },
      { step: 'member_feed', ok: true, ms: 390 },
      { step: 'member_people', ok: true, ms: 210 },
      { step: 'member_board', ok: true, ms: 240 },
      { step: 'admin_today_morning_brief', ok: true, ms: 380 },
      { step: 'admin_needs_you_alert_centre', ok: true, ms: 320 },
      { step: 'admin_autopilot_panel', ok: true, ms: 350 },
    ];
    const r2 = reconcileSelfTestAlert(r1.alerts, passingSteps, 2050, '2026-11-18T04:15:00Z');
    expect(r2.cleared).toBe(true);
    expect(r2.alerts).toHaveLength(0);
  });

  it('keeps tools/autopilot_selftest.mjs strictly local and free of hardcoded secrets or live URLs', () => {
    const script = fs.readFileSync('tools/autopilot_selftest.mjs', 'utf8');
    // Must contain route guard blocking live DB and Cloudflare pages
    expect(script).toContain('pedxoxpammnyfnizljyj');
    expect(script).toContain('.pages.dev');
    expect(script).toContain('route.abort()');
    // Must NOT hardcode any Supabase JWT anon key or member password
    expect(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}/.test(script)).toBe(false);
    expect(/Kring[0-9a-f]{6,}/i.test(script)).toBe(false);
  });
});
