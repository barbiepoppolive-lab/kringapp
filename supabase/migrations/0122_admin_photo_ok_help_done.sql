-- 0122 · Admin one-tap buttons (19 Nov 2026): "Photo OK" and Help "No reply needed". WRITTEN, NOT APPLIED.
-- Apply AFTER tonight's live change that added public.kr8_is_ack(text) (this file stops with a clear error if it is missing).
-- ADDITIVE + RE-RUNNABLE: one new table, three new functions, two existing READ functions re-created with the same arguments and
-- return type (kr8_admin_help_threads, kr8_admin_help_thread from 0120 + the ack filter + the closed filter).
--
--   1. Photo OK   kr8_admin_photo_ok(p_user)  admin-only WRITE: kr8_members.photo_check 'unchecked' → 'ok' (the card photo is
--                 checked by eye). 'ok' already counts as a real photo everywhere (trust score 0095/0102 real_ph, card-complete
--                 nudges 0103, people sort 0087), so nothing else changes. Logged in kr8_admin_actions_log ('photo_ok').
--                 No "Not OK" function: there is no admin hide-photo / ask-for-a-new-photo flow for card photos to reuse.
--   2. No reply needed
--                 table kr8_help_closed(thread_id, closed_upto_message_id, closed_by, closed_at), one row per Kring Team chat.
--                 kr8_help_closed_upto(thread) → the closed-up-to message id (0 = never closed), for the waiting filters.
--                 kr8_admin_help_no_reply(p_member, p_thread default null) admin-only WRITE: closes the member's waiting case(s)
--                 without sending a message (closed up to the member's latest message; a NEW member message opens it again).
--                 Logged in kr8_admin_actions_log ('help_no_reply').
--                 Waiting logic now skips member messages with id <= closed_upto_message_id in:
--                   kr8_admin_help_threads()  (re-created here from 0120 + `not kr8_is_ack(x.body)` + closed filter)
--                   kr8_admin_help_thread()   (re-created here from 0120, its 'unanswered' count, same two filters)
--
--   NOT RE-CREATED HERE (patch live by hand, see the NOTE at the end of this file):
--                   kr8_admin_help_cases()     the repo copy (0097) is older than the live one (T-402 fields: unanswered_items,
--                                              suggested_reply…). Re-creating it from the repo would drop those fields.
--                   kr8_robot_self_fix_run()   the repo copy (0101) has no help-SLA part at all; the live one does.
--
-- UNDO:
--   re-run kr8_admin_help_threads / kr8_admin_help_thread from 0120 (then re-add tonight's kr8_is_ack filter by hand);
--   remove the closed filter from the hand-patched kr8_admin_help_cases / kr8_robot_self_fix_run;
--   drop function if exists public.kr8_admin_help_no_reply(uuid, uuid), public.kr8_help_closed_upto(uuid), public.kr8_admin_photo_ok(uuid);
--   drop table if exists public.kr8_help_closed;
begin;

do $$ begin
  if to_regprocedure('public.kr8_is_ack(text)') is null then
    raise exception '0122: public.kr8_is_ack(text) is missing. Apply tonight''s ack change first.';
  end if;
end $$;

-- ───────────── 1. Photo OK ─────────────
create or replace function public.kr8_admin_photo_ok(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare was text; mno int;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_user is null then raise exception 'KR8_NO_PERSON'; end if;
  select photo_check, member_no into was, mno from public.kr8_members where user_id = p_user for update;
  if not found then raise exception 'KR8_NO_PERSON'; end if;
  update public.kr8_members set photo_check = 'ok' where user_id = p_user and photo_check is distinct from 'ok';
  insert into public.kr8_admin_actions_log (action, detail)
    values ('photo_ok', jsonb_build_object('user_id', p_user, 'member_no', mno, 'was', was, 'by', auth.uid()));
  return jsonb_build_object('user_id', p_user, 'photo_check', 'ok', 'was', was);
end $$;
revoke all on function public.kr8_admin_photo_ok(uuid) from public, anon;
grant execute on function public.kr8_admin_photo_ok(uuid) to authenticated;

-- ───────────── 2. Help "No reply needed" ─────────────
create table if not exists public.kr8_help_closed (
  thread_id uuid primary key references public.kr8_threads(id) on delete cascade,
  closed_upto_message_id bigint not null,
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz not null default now()
);
alter table public.kr8_help_closed enable row level security;   -- no policies: read / written only by the functions below
revoke all on table public.kr8_help_closed from public, anon, authenticated;

create or replace function public.kr8_help_closed_upto(p_thread uuid) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select c.closed_upto_message_id from public.kr8_help_closed c where c.thread_id = p_thread), 0)::bigint
$$;
revoke all on function public.kr8_help_closed_upto(uuid) from public, anon, authenticated;

create or replace function public.kr8_admin_help_no_reply(p_member uuid, p_thread uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare t record; upto bigint; n int := 0; done jsonb := '[]'::jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_member is null then raise exception 'KR8_NO_PERSON'; end if;
  for t in
    select th.id from public.kr8_threads th
     where p_member in (th.user_a, th.user_b)
       and (public.kr8_is_team(th.user_a) or public.kr8_is_team(th.user_b))
       and not (public.kr8_is_team(th.user_a) and public.kr8_is_team(th.user_b))
       and (p_thread is null or th.id = p_thread)
  loop
    select max(x.id) into upto from public.kr8_messages x where x.thread_id = t.id and x.sender = p_member;
    continue when upto is null;
    insert into public.kr8_help_closed as c (thread_id, closed_upto_message_id, closed_by, closed_at)
      values (t.id, upto, auth.uid(), now())
    on conflict (thread_id) do update
      set closed_upto_message_id = greatest(c.closed_upto_message_id, excluded.closed_upto_message_id),
          closed_by = excluded.closed_by, closed_at = excluded.closed_at;
    n := n + 1;
    done := done || jsonb_build_object('thread_id', t.id, 'upto', upto);
  end loop;
  if p_thread is not null and n = 0 and not exists (select 1 from public.kr8_threads th where th.id = p_thread and p_member in (th.user_a, th.user_b)) then
    raise exception 'KR8_NO_THREAD';
  end if;
  insert into public.kr8_admin_actions_log (action, detail)
    values ('help_no_reply', jsonb_build_object('user_id', p_member, 'by', auth.uid(), 'threads', done));
  return jsonb_build_object('closed', n, 'threads', done);
end $$;
revoke all on function public.kr8_admin_help_no_reply(uuid, uuid) from public, anon;
grant execute on function public.kr8_admin_help_no_reply(uuid, uuid) to authenticated;

-- ───────────── waiting logic: 0120 bodies + ack filter + closed filter ─────────────
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
        and x.id > coalesce((select max(y.id) from public.kr8_messages y where y.thread_id = t.id and y.sender <> mem.uid), 0)
        and not public.kr8_is_ack(x.body)                         -- tonight: "thanks" / "ok" alone is not waiting
        and x.id > public.kr8_help_closed_upto(t.id)) w          -- 0122: closed with "No reply needed"
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
                      and x.sender = p_member and x.id > coalesce(last_team, 0)
                      and not public.kr8_is_ack(x.body)
                      and x.id > public.kr8_help_closed_upto(t.id)),
    'flags', coalesce((select jsonb_agg(jsonb_build_object('key', f.flag_key, 'severity', f.severity, 'summary', f.summary, 'at', f.last_at) order by f.last_at desc)
      from public.kr8_protect_flags f where f.user_id = p_member and f.dismissed_at is null), '[]'::jsonb));
end $$;
revoke all on function public.kr8_admin_help_thread(uuid) from public, anon;
grant execute on function public.kr8_admin_help_thread(uuid) to authenticated;

commit;

-- ═════════════ NOTE · patch by hand on the LIVE definitions (not in the repo, so not guessed here) ═════════════
-- In kr8_admin_help_cases() and in the help-SLA part of kr8_robot_self_fix_run(), wherever tonight's line
--     and not public.kr8_is_ack(x.body)
-- filters the member's unanswered messages, add right under it (use that query's thread alias in place of t):
--     and x.id > public.kr8_help_closed_upto(t.id)
-- In kr8_admin_help_cases() also keep the outer "w.n > 0" (or the equivalent) so a fully closed case drops off the list.
