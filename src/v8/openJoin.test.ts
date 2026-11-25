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
    expect(unvCopy('en', 'likes', { views: 14, likes: 9 }).body).toContain('watched 14 clips and liked 9');
    expect(unvCopy('th', 'likes', { views: 14, likes: 9 }).body).toContain('ดูมา 14 คลิป และกดใจไป 9 ครั้ง');
    // watched is never shown lower than liked
    expect(unvCopy('en', 'likes', { views: 2, likes: 6 }).body).toContain('watched 6 clips and liked 6');
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
  });
});
