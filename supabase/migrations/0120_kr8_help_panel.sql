-- 0120 · Admin "Help" panel (founder, 18 Nov 2026: "a bigger and better panel for monitoring help chats").
-- ADDITIVE + RE-RUNNABLE + READ-ONLY. Two new admin-only read functions; no table, row or existing function is changed.
--
--   kr8_admin_help_threads()          admin: EVERY member <-> Kring Team conversation (not only waiting ones), newest 300:
--                                     member card basics, last message (+ its English from kr8_help_ai.translation_en),
--                                     unanswered count, waiting_since (first unanswered member message), team_replied (ever).
--   kr8_admin_help_thread(p_member)   admin: the full conversation with one member (all their Kring Team threads, last 300
--                                     messages) with translation_en / suggested_reply / suggested_reply_en per message,
--                                     plus that member's open Protect flags (ring_farming, scam_chat, link_tries, shared_signals).
--
-- Reads kr8_help_ai (T-402 Help AI: message_id, translation_en, suggested_reply, suggested_reply_en, model). Team messages
-- sent with kr8_admin_team_reply_en keep the founder's English in kr8_help_ai.translation_en, so both sides show English.
--
-- UNDO:
--   drop function if exists public.kr8_admin_help_thread(uuid), public.kr8_admin_help_threads();
begin;

create or replace function public.kr8_admin_help_threads()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return coalesce((select jsonb_agg(c order by (c ->> 'last_at') desc) from (
    select jsonb_build_object(
      'thread_id', t.id, 'member', mem.uid, 'member_no', m.member_no, 'name', m.first_name, 'photo', nullif(m.photo, ''),
      'verified', coalesce(m.verified, false), 'test', public.kr8_is_test_member(mem.uid),
      'last_at', lm.created_at, 'last_from', case when lm.sender = mem.uid then 'member' else 'team' end,
      'last_body', left(lm.body, 300), 'last_en', left(ai.translation_en, 300),
      'unanswered', w.n, 'waiting_since', w.first_at,
      'team_replied', exists (select 1 from public.kr8_messages z where z.thread_id = t.id and z.sender <> mem.uid),
      'total', (select count(*)::int from public.kr8_messages z where z.thread_id = t.id)) as c
    from public.kr8_threads t
    cross join lateral (select case when public.kr8_is_team(t.user_a) then t.user_b else t.user_a end as uid) mem
    join public.kr8_members m on m.user_id = mem.uid
    cross join lateral (select x.id, x.sender, x.body, x.created_at from public.kr8_messages x
                        where x.thread_id = t.id order by x.id desc limit 1) lm
    left join public.kr8_help_ai ai on ai.message_id = lm.id
    cross join lateral (
      select count(*)::int as n, min(x.created_at) as first_at
      from public.kr8_messages x
      where x.thread_id = t.id and x.sender = mem.uid
        and x.id > coalesce((select max(y.id) from public.kr8_messages y where y.thread_id = t.id and y.sender <> mem.uid), 0)) w
    where (public.kr8_is_team(t.user_a) or public.kr8_is_team(t.user_b))
      and not (public.kr8_is_team(t.user_a) and public.kr8_is_team(t.user_b))
    order by lm.created_at desc
    limit 300) s), '[]'::jsonb);
end $$;
revoke all on function public.kr8_admin_help_threads() from public, anon;
grant execute on function public.kr8_admin_help_threads() to authenticated;

create or replace function public.kr8_admin_help_thread(p_member uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare last_team bigint;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_member is null then raise exception 'KR8_NO_PERSON'; end if;
  select max(x.id) into last_team
    from public.kr8_messages x join public.kr8_threads t on t.id = x.thread_id
   where p_member in (t.user_a, t.user_b) and (public.kr8_is_team(t.user_a) or public.kr8_is_team(t.user_b))
     and x.sender <> p_member;
  return jsonb_build_object(
    'member', p_member,
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
        'id', h.id, 'from', case when h.sender = p_member then 'member' else 'team' end, 'body', h.body, 'at', h.created_at,
        'translation_en', ai.translation_en, 'suggested_reply', ai.suggested_reply, 'suggested_reply_en', ai.suggested_reply_en) order by h.id)
      from (select x.* from public.kr8_messages x join public.kr8_threads t on t.id = x.thread_id
             where p_member in (t.user_a, t.user_b) and (public.kr8_is_team(t.user_a) or public.kr8_is_team(t.user_b))
               and not (public.kr8_is_team(t.user_a) and public.kr8_is_team(t.user_b))
             order by x.id desc limit 300) h
      left join public.kr8_help_ai ai on ai.message_id = h.id), '[]'::jsonb),
    'unanswered', (select count(*)::int from public.kr8_messages x join public.kr8_threads t on t.id = x.thread_id
                    where p_member in (t.user_a, t.user_b) and (public.kr8_is_team(t.user_a) or public.kr8_is_team(t.user_b))
                      and x.sender = p_member and x.id > coalesce(last_team, 0)),
    'flags', coalesce((select jsonb_agg(jsonb_build_object('key', f.flag_key, 'severity', f.severity, 'summary', f.summary, 'at', f.last_at) order by f.last_at desc)
      from public.kr8_protect_flags f where f.user_id = p_member and f.dismissed_at is null), '[]'::jsonb));
end $$;
revoke all on function public.kr8_admin_help_thread(uuid) from public, anon;
grant execute on function public.kr8_admin_help_thread(uuid) to authenticated;

commit;
