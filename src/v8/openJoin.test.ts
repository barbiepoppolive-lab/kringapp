// 25 Nov open onboarding: the face-check prompt names what the member reached for, one language at a time,
// and the likes prompt fires after the 5th like at most 3 times, 3+ days apart.
import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { openInviteLine, unvCopy, unvLikeShown, unvLikeTick, unvWhy } from './V5Unverified';

const THAI = /[฀-๿]/;
describe('open onboarding prompts', () => {
  it('names the thing they reached for, English only in English and Thai only in Thai', () => {
    for (const why of ['people', 'hi', 'chat', 'post', 'ask', 'answer', 'task', 'likes', 'me'] as const) {
      const en = unvCopy('en', why, { views: 14, likes: 9 });
      const th = unvCopy('th', why, { views: 14, likes: 9 });
      expect(en.title && en.body).toBeTruthy();
      expect(THAI.test(en.title + en.body)).toBe(false);
      expect(THAI.test(th.title)).toBe(true);
      expect(/[A-Za-z]{4,}/.test(th.title + th.body.replace(/กริ๊ง!/g, ''))).toBe(false);
      expect(en.body).not.toMatch(/warning|banned|suspend|fake/i);
    }
    expect(unvCopy('en', 'likes', { views: 14, likes: 9 }).body).toContain('liked 9 clips');
    expect(unvCopy('en', 'likes', { views: 14, likes: 9 }).title).toBe('Get your ✓');
    expect(unvCopy('en', 'me').title).toBe('Get your ✓');
    expect(unvCopy('th', 'likes', { views: 14, likes: 9 }).body).toContain('กดใจไปแล้ว 9 คลิป');
    for (const why of ['hi', 'people', 'likes', 'me'] as const) expect(unvCopy('en', why).body).not.toMatch(/hidden|can’t see you|Everyone (on Kring|you see|here) has/);
    expect(unvCopy('en', 'post').body).toMatch(/5-second/);
    expect(unvCopy('zh', 'post').title).toBe(unvCopy('en', 'post').title);
  });
  it('unknown reasons fall back to People', () => {
    expect(unvWhy('post')).toBe('post');
    expect(unvWhy(undefined)).toBe('people');
    expect(unvWhy('<script>')).toBe('people');
  });
  it('the invite nudge says friends can join without the face check and the +10 still needs it', () => {
    expect(openInviteLine('en')).toMatch(/no face check to start/);
    expect(openInviteLine('en')).toMatch(/\+10 when they do it/);
    expect(THAI.test(openInviteLine('th'))).toBe(true);
  });
});

describe('likes prompt timing', () => {
  beforeEach(() => localStorage.clear());
  it('due on the 5th like, then not again for 3 days, and never more than 3 times', () => {
    const t0 = Date.parse('2026-11-25T05:00:00Z');
    for (let i = 1; i <= 4; i++) expect(unvLikeTick('u1', t0).due).toBe(false);
    expect(unvLikeTick('u1', t0).due).toBe(true);
    unvLikeShown('u1', t0);
    expect(unvLikeTick('u1', t0 + 864e5).due).toBe(false);
    expect(unvLikeTick('u1', t0 + 4 * 864e5).due).toBe(true);
    unvLikeShown('u1', t0 + 4 * 864e5);
    expect(unvLikeTick('u1', t0 + 8 * 864e5).due).toBe(true);
    unvLikeShown('u1', t0 + 8 * 864e5);
    expect(unvLikeTick('u1', t0 + 30 * 864e5).due).toBe(false);
    expect(unvLikeTick('u2', t0).due).toBe(false);
  });
});

describe('server files', () => {
  const go = fs.readFileSync('supabase/migrations/m209_open_join_GO.sql', 'utf8');
  const add = fs.readFileSync('supabase/migrations/m208_open_join_stats.sql', 'utf8');
  it('m208 is additive and locked down', () => {
    expect(add).toMatch(/revoke execute on function public\.kr8_my_unv_stats\(\) from public, anon;/);
    expect(add).toMatch(/if uid is null then raise exception/);
    expect(add).not.toMatch(/kr8_rings_ledger|alter table|drop /i);
  });
  it('m209 (APPLY ON GO) pays an invite only on a passed face check and keeps the economy numbers', () => {
    expect(go).toMatch(/APPLY ON GO/);
    expect(go).toMatch(/not coalesce\(f\.verified, false\)/);
    expect(go).not.toMatch(/kr8_invite_first_reel/);
    expect(go).toMatch(/kr8_rcfg\('invite', 10\)/);
    expect(go).toMatch(/kr8_rcfg\('invite_day_cap', 20\)/);
    expect(go.replace(/^--.*$/gm, '')).not.toMatch(/liker_min_age_hours|v2_unv_day_cap|min_rings_for_paid_seat/);
    expect(go).toMatch(/revoke all on function public\.kr8_invite_try\(uuid\) from public, anon, authenticated/);
    expect(go.replace(/^--.*$/gm, '')).not.toMatch(/kr8_face_gate|open_join_on/);
  });
  it('m210 (APPLY ON GO) lists unchecked members but keeps their own actions and receiving gated', () => {
    const vis = fs.readFileSync('supabase/migrations/m210_unverified_visible_GO.sql', 'utf8');
    const code = vis.replace(/^--.*$/gm, '');
    expect(vis).toMatch(/APPLY ON GO/);
    expect(code).not.toMatch(/not public\.kr8_face_gate\(m\.user_id\)/);
    expect(code).toMatch(/if public\.kr8_face_gate\(uid\) then raise exception 'KR8_VERIFY_FIRST'/);
    expect(code).not.toMatch(/kr8_send_hello|kr8_send_message|kr8_face_gate_trg|kr8_rings_ledger/);
    expect(code.match(/kr8_rings_config[^;]*;/g)).toEqual(["kr8_rings_config set value = 0, updated_at = now() where key = 'face_gate_after_no';"]);
    expect(code).not.toMatch(/ <> auth\.uid\(\)|<> uid/);
    for (const f of ['kr8_people(integer)', 'kr8_follow(uuid)', 'kr8_follow_list(uuid, text)', 'kr8_tag_candidates(text, integer)'])
      expect(code).toContain(`revoke execute on function public.${f} from public, anon;`);
  });
});
