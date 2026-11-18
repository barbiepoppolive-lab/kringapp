/**
 * errfix-1 (18 Nov): "63 app errors in the last 24 hours" on the Morning brief.
 *  - 0108: the brief counts real failures from real members only (not the phone activity log, ghost accounts or "Don't allow").
 *  - #68: a lost picked file sent the member back to "Pick a clip" (it used to resend a dead file → six 400s in a row).
 *  - storage's own reason is kept for the log; a ghost account is told before anything is uploaded.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readable, ReelError, storageWhy } from './v5Reel';

const m0099 = readFileSync('supabase/migrations/0099_kr8_autopilot2_m2.sql', 'utf8');
const m0108 = readFileSync('supabase/migrations/0108_kr8_brief_real_errors.sql', 'utf8');
const app = readFileSync('src/v8/KringAppV8.tsx', 'utf8');
const fnOf = (sql: string) => {
  const i = sql.indexOf('create or replace function public.kr8_admin_morning_brief');
  return sql.slice(i, sql.indexOf('end $$;', i) + 7);
};

describe('0108 Morning brief counts real errors only', () => {
  const fn = fnOf(m0108);
  it('uses the error filter and the real-member filter', () => {
    expect(fn).toContain('public.kr8_client_event_is_error(e.kind, e.code)');
    expect(fn).toMatch(/kr8_admin_v2_kind\(e\.user_id\) in \('real', 'nocard'\)/);
    expect(fn).not.toMatch(/kr8_client_events e where e\.created_at >= t24;/);
  });
  it('changes nothing else in the 0099 body (only the errors lines)', () => {
    const a = fnOf(m0099).split('\n');
    const b = fn.split('\n');
    const added = b.filter((l) => !a.includes(l));
    const removed = a.filter((l) => !b.includes(l));
    expect(removed.length).toBe(4);   // the count, the detail line, the red rule line, the jsonb errors line
    expect(added.every((l) => /err_people|kr8_client_event_is_error|kr8_admin_v2_kind\(e\.user_id\)|0108|from public\.kr8_client_events e$|where e\.created_at >= t24$/.test(l))).toBe(true);
  });
  it('the error rule: *_fail and trim fail count; activity, GHOST and NotAllowedError do not', () => {
    const rule = m0108.slice(m0108.indexOf('create or replace function public.kr8_client_event_is_error'), m0108.indexOf('revoke all on function public.kr8_client_event_is_error'));
    expect(rule).toContain("when p_kind = 'reel_trim' then coalesce(p_code, '') like 'fail:%'");
    expect(rule).toContain("when p_kind !~ '_fail$' then false");
    expect(rule).toContain("'GHOST'");
    expect(rule).toContain("'NotAllowedError'");
    expect(rule).toMatch(/immutable/);
  });
});

describe('Reel upload fixes', () => {
  it('a file that reads back empty or short asks to choose it again', async () => {
    const f = new File([new Uint8Array(10)], 'a.mp4', { type: 'video/mp4' });
    Object.defineProperty(f, 'arrayBuffer', { value: async () => new ArrayBuffer(0) });
    await expect(readable(f)).rejects.toMatchObject({ code: 'REPICK' });
    const g = new File([new Uint8Array(10)], 'b.mp4', { type: 'video/mp4' });
    Object.defineProperty(g, 'arrayBuffer', { value: async () => new ArrayBuffer(4) });
    await expect(readable(g)).rejects.toBeInstanceOf(ReelError);
  });
  it('a file that cannot be read asks to choose it again; a good file passes', async () => {
    const f = new File([new Uint8Array(10)], 'a.mp4', { type: 'video/mp4' });
    Object.defineProperty(f, 'arrayBuffer', { value: async () => { throw new Error('NotReadableError'); } });
    await expect(readable(f)).rejects.toMatchObject({ code: 'REPICK' });
    const ok = await readable(new File([new Uint8Array(10)], 'c.mp4', { type: 'video/mp4' }));
    expect(ok.size).toBe(10);
  });
  it('storageWhy keeps storage’s own reason, short', () => {
    expect(storageWhy('{"statusCode":"413","error":"Payload too large","message":"The object exceeded the maximum allowed size"}')).toBe('413 Payload too large The object exceeded the maximum allowed size'.slice(0, 80));
    expect(storageWhy('{"statusCode":"400","error":"InvalidJWT","message":"exp claim timestamp check failed"}')).toContain('InvalidJWT');
    expect(storageWhy('')).toBeUndefined();
    expect(storageWhy('<html>bad gateway</html>')).toBe('<html>bad gateway</html>');
  });
  it('REPICK goes back to "Pick a clip" instead of offering Retry on the dead file', () => {
    const i = app.indexOf("e instanceof ReelError && e.code === 'REPICK'");
    expect(i).toBeGreaterThan(0);
    const block = app.slice(i, i + 900);
    expect(block).toContain('setReelInfo(null)');
    expect(block).toContain('reelWorkRef.current = {}');
    expect(block).toContain("setReelStage('idle')");
  });
  it('a ghost account is told before anything is prepared or uploaded', () => {
    const p = app.indexOf('const publishReel = async');
    const g = app.indexOf('if (v5Ghost) { setReelProblem(', p);
    expect(g).toBeGreaterThan(p);
    expect(g).toBeLessThan(app.indexOf('prepareReel(reelInfo', p));
  });
});

describe('claim face TIMEOUT says why', async () => {
  const { countSeen, timeoutWhy } = await import('./V5ClaimFace');
  it('counts found / centred / near / straight frames and the best hold', () => {
    const s = { n: 0, found: 0, centered: 0, near: 0, straight: 0, best: 0 };
    countSeen(s, { found: false, yaw: 0.5, ear: 0, size: 0, centered: false }, 0);
    countSeen(s, { found: true, yaw: 0.5, ear: 0.3, size: 0.1, centered: true }, 0);
    countSeen(s, { found: true, yaw: 0.52, ear: 0.3, size: 0.2, centered: true }, 1200);
    expect(timeoutWhy(s, { videoWidth: 640, videoHeight: 480 })).toBe('n3 f2 c2 near1 st2 best1200ms 640x480');
    expect(timeoutWhy(s, null).length).toBeLessThanOrEqual(300);
  });
  it('the TIMEOUT log sends that detail', () => {
    expect(readFileSync('src/v8/V5ClaimFace.tsx', 'utf8')).toContain("v5LogClient('claim_face_fail', 'TIMEOUT', timeoutWhy(seen, v))");
  });
});
