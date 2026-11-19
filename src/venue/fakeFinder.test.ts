// 0124 Fake Finder admin data hook (no screen).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';

const calls: { fn: string; args: Record<string, unknown> }[] = [];
let reply: unknown = null;
vi.mock('./shared', async (orig) => ({
  ...(await orig<typeof import('./shared')>()),
  rpc: vi.fn(async (fn: string, args: Record<string, unknown> = {}) => { calls.push({ fn, args }); return reply; }),
}));

import { decideFake, fakeHeadline, fetchFakeList, patchesMissing, runFakeFinder, sortFake, type FakeMember } from './fakeFinder';
import { REVIEW_LABEL } from './dupAdmin';

const m = (o: Partial<FakeMember>): FakeMember => ({ user_id: 'u', member_no: 1, first_name: 'A', photo: null, verified: false, ghost: false,
  joined_at: '', last_active_at: null, score: 0, level: 'green', effective: 'green', groups: 0, reasons: [], override: null, cleared_at: null,
  updated_at: '', held_claims: 0, linked: [], ...o });

describe('fakeFinder data hook', () => {
  beforeEach(() => { calls.length = 0; reply = null; });
  it('reads the list', async () => {
    reply = { at: 'now', effects_on: true, robot_on: true, last_run: null, patches: { kr8_people: 'patched' }, members: [] };
    const l = await fetchFakeList();
    expect(calls[0]).toEqual({ fn: 'kr8_admin_fake_list', args: {} });
    expect(l.patches.kr8_people).toBe('patched');
  });
  it('a reply of the wrong shape is an error, not an empty list', async () => {
    reply = [];
    await expect(fetchFakeList()).rejects.toThrow('BAD_REPLY');
  });
  it('sends the decision', async () => {
    reply = { ok: true, level: 'green', ghost: false };
    await decideFake('u-202', 'clear');
    expect(calls[0]).toEqual({ fn: 'kr8_admin_fake_decide', args: { p_user: 'u-202', p_decision: 'clear' } });
    await runFakeFinder();
    expect(calls[1].fn).toBe('kr8_admin_fake_run');
  });
  it('patch status: anything not patched/already must be done by hand', () => {
    expect(patchesMissing({ patches: { kr8_people: 'patched', kr8_reel_scores: 'already', kr8_claim_prize: 'anchor 1 found 0 times: held :=' } }))
      .toEqual(['kr8_claim_prize']);
  });
  it('headline + order (red first, then score)', () => {
    const a = m({ user_id: 'a', member_no: 5, effective: 'amber', score: 50 });
    const b = m({ user_id: 'b', member_no: 9, effective: 'red', score: 70, reasons: [{ code: 'face_match', points: 40, group: 'face', text: 'Face looks the same as #3 Bee', with: [] }] });
    const c = m({ user_id: 'c', member_no: 2, effective: 'red', score: 90 });
    expect(sortFake([a, b, c]).map((x) => x.user_id)).toEqual(['c', 'b', 'a']);
    expect(fakeHeadline(b)).toBe('#9 A · red 70 · Face looks the same as #3 Bee');
  });
  it('a held claim says why in plain words', () => {
    expect(REVIEW_LABEL.fake_red).toMatch(/Fake Finder/);
  });
  it('the migration has the 15 checks the codes name', () => {
    const sql = fs.readFileSync('supabase/migrations/0124_fake_finder.sql', 'utf8');
    for (const c of ['face_match', 'face_check_lookalike', 'photo_ai', 'photo_mismatch', 'same_device', 'same_network_join', 'bot_browser',
      'join_like_leave', 'one_target', 'clone_pattern', 'mutual_pair', 'no_return', 'burst_booster', 'chain_root', 'chain_member']) expect(sql).toContain(`'${c}'`);
  });
});
