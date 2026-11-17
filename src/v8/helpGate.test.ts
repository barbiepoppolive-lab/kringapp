import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** 0097: the face-gate exemption is ONLY for chats with the Kring Team; everything else stays gated. */
const sql = readFileSync('supabase/migrations/0097_kr8_help_chat.sql', 'utf8');
const trg = sql.slice(sql.indexOf('create or replace function public.kr8_face_gate_trg()'), sql.indexOf('end $$;', sql.indexOf('create or replace function public.kr8_face_gate_trg()')));

describe('0097 face gate exemption', () => {
  it('keeps the 0093 check and still raises KR8_VERIFY_FIRST', () => {
    expect(trg).toContain('public.kr8_face_gate(auth.uid())');
    expect(trg).toContain("raise exception 'KR8_VERIFY_FIRST'");
  });
  it('exempts only threads / messages where one side is a Kring Team account', () => {
    const returns = trg.split('return new;').length - 1;
    expect(returns).toBe(3);   // team thread, team message, not gated
    expect(trg).toMatch(/tg_table_name = 'kr8_threads'\s+and \(public\.kr8_is_team\(/);
    expect(trg).toMatch(/tg_table_name = 'kr8_messages' and public\.kr8_is_team_thread\(/);
    expect(trg).not.toMatch(/kr8_posts|kr8_answers|kr8_ask_answers/);
  });
  it('opens the help thread as open, keeps the link block, and is admin-only for cases and team replies', () => {
    expect(sql).toMatch(/values \(a, b, uid, 'open'\)/);
    expect(sql).toMatch(/kr8_has_web_link\(q\) then raise exception 'KR8_NO_LINKS'/);
    for (const fn of ['kr8_admin_help_cases', 'kr8_admin_team_reply', 'kr8_admin_help_stats']) {
      const body = sql.slice(sql.indexOf(`function public.${fn}(`));
      expect(body.slice(0, 600)).toContain("if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'");
    }
    expect(sql).toContain('revoke all on public.kr8_help_events from public, anon, authenticated');
    expect(sql).toMatch(/UNDO/);
  });
});
