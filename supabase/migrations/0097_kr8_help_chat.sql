-- 0097 · Kring Helper → "Talk to the team" (founder, 18 Nov 2026: Help design "B · Chat-first", promise "the team replies within 1 hour").
-- ADDITIVE + RE-RUNNABLE. No table or function is dropped; kr8_face_gate_trg keeps its name, arguments and every old rule.
--
--   (a) Face gate (0093): a member's thread / messages WITH a Kring Team account are never stopped by KR8_VERIFY_FIRST
--       (new members need help most). Every other thread, message, post and answer is gated exactly as before.
--   (b) One-message rule: kr8_help_open opens (or re-opens) the member ↔ team thread as 'open', so the member can keep writing.
--   (c) Link block (0090) stays: kr8_help_open refuses links (KR8_NO_LINKS) like kr8_send_message; members' later messages go
--       through kr8_send_message unchanged.
--   kr8_help_open(p_question)          member: open my thread with the Kring Team; first message "[Help] <my question>"; returns thread id
--   kr8_admin_help_cases()             admin: one case per member whose last message to the team is unanswered (question, waiting since)
--   kr8_admin_team_reply(p_member, p_body)  admin: reply in that member's thread AS the Kring Team account
--   kr8_help_events + kr8_help_event(...)   FAQ usage log (insert-only for members), kr8_admin_help_stats(p_days) admin read
--
-- UNDO (in this order):
--   drop function if exists public.kr8_admin_help_stats(integer), public.kr8_help_event(text, text, text, text),
--     public.kr8_admin_team_reply(uuid, text), public.kr8_admin_help_cases(), public.kr8_help_open(text), public.kr8_help_team_id(),
--     public.kr8_is_team_thread(uuid);
--   drop table if exists public.kr8_help_events;
--   re-run kr8_face_gate_trg() from 0093 (body: the single "if auth.uid() is not null and not kr8_is_admin() and kr8_face_gate(...)" check).
begin;

-- ───────────── helpers ─────────────
-- the one team account that answers Help (the live "Kring Team" card first, else the oldest team account)
create or replace function public.kr8_help_team_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select t.user_id from public.kr8_team_accounts t
  order by (t.user_id = 'fd5cca36-9be2-4dde-9d7d-2dd9c898deaa'::uuid) desc, t.added_at, t.user_id
  limit 1
$$;
revoke all on function public.kr8_help_team_id() from public, anon, authenticated;

create or replace function public.kr8_is_team_thread(p_thread uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.kr8_threads t where t.id = p_thread and (public.kr8_is_team(t.user_a) or public.kr8_is_team(t.user_b)))
$$;
revoke all on function public.kr8_is_team_thread(uuid) from public, anon, authenticated;

-- ───────────── (a) face gate: 0093 body + the Kring Team exemption for chat ─────────────
create or replace function public.kr8_face_gate_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb;
begin
  if auth.uid() is not null and not public.kr8_is_admin() and public.kr8_face_gate(auth.uid()) then
    -- 0097: a chat with the Kring Team is always allowed (Help → "Talk to the team"); nothing else changes
    r := to_jsonb(new);
    if tg_table_name = 'kr8_threads'
       and (public.kr8_is_team(nullif(r ->> 'user_a', '')::uuid) or public.kr8_is_team(nullif(r ->> 'user_b', '')::uuid)) then
      return new;
    end if;
    if tg_table_name = 'kr8_messages' and public.kr8_is_team_thread(nullif(r ->> 'thread_id', '')::uuid) then
      return new;
    end if;
    raise exception 'KR8_VERIFY_FIRST';
  end if;
  return new;
end $$;

-- ───────────── FAQ usage log ─────────────
create table if not exists public.kr8_help_events (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('shown', 'up', 'not_quite', 'team', 'no_match')),
  faq text check (faq is null or faq ~ '^[a-z0-9_-]{1,40}$'),
  query text check (query is null or length(query) <= 200),
  lang text check (lang is null or lang ~ '^[a-z]{2}$'),
  created_at timestamptz not null default now()
);
create index if not exists kr8_help_events_at on public.kr8_help_events (created_at desc);
create index if not exists kr8_help_events_user on public.kr8_help_events (user_id, created_at desc);
alter table public.kr8_help_events enable row level security;
revoke all on public.kr8_help_events from public, anon, authenticated;
revoke all on sequence public.kr8_help_events_id_seq from public, anon, authenticated;

create or replace function public.kr8_help_event(p_kind text, p_faq text default null, p_query text default null, p_lang text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if p_kind not in ('shown', 'up', 'not_quite', 'team', 'no_match') then raise exception 'KR8_BAD_KIND'; end if;
  select count(*) into n from public.kr8_help_events where user_id = uid and created_at > now() - interval '1 day';
  if n >= 300 then return; end if;   -- quietly stop logging a runaway client
  insert into public.kr8_help_events (user_id, kind, faq, query, lang)
  values (uid, p_kind,
          case when p_faq ~ '^[a-z0-9_-]{1,40}$' then p_faq end,
          nullif(left(btrim(regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g')), 200), ''),
          case when lower(p_lang) ~ '^[a-z]{2}$' then lower(p_lang) end);
end $$;
revoke all on function public.kr8_help_event(text, text, text, text) from public, anon;
grant execute on function public.kr8_help_event(text, text, text, text) to authenticated;

create or replace function public.kr8_admin_help_stats(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return jsonb_build_object(
    'faqs', coalesce((select jsonb_agg(x order by (x ->> 'not_quite')::int desc, (x ->> 'shown')::int desc) from (
      select jsonb_build_object('faq', faq,
        'shown', count(*) filter (where kind = 'shown'), 'up', count(*) filter (where kind = 'up'),
        'not_quite', count(*) filter (where kind = 'not_quite'), 'team', count(*) filter (where kind = 'team')) as x
      from public.kr8_help_events
      where faq is not null and created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
      group by faq) s), '[]'::jsonb),
    'no_match', coalesce((select jsonb_agg(jsonb_build_object('query', query, 'at', created_at) order by created_at desc) from (
      select query, created_at from public.kr8_help_events
      where kind in ('no_match', 'team') and faq is null and query is not null
        and created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
      order by created_at desc limit 50) q), '[]'::jsonb));
end $$;
revoke all on function public.kr8_admin_help_stats(integer) from public, anon;
grant execute on function public.kr8_admin_help_stats(integer) to authenticated;

-- ───────────── (b)(c) member: open my thread with the Kring Team ─────────────
create or replace function public.kr8_help_open(p_question text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); team uuid := public.kr8_help_team_id(); a uuid; b uuid; tid uuid; q text; v_body text; n int;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if team is null then raise exception 'KR8_NO_TEAM'; end if;
  if public.kr8_is_team(uid) then raise exception 'KR8_NO_PERSON'; end if;
  q := left(btrim(regexp_replace(coalesce(p_question, ''), '\s+', ' ', 'g')), 480);
  if public.kr8_has_web_link(q) then raise exception 'KR8_NO_LINKS'; end if;            -- (c) 0090 link block stays
  v_body := '[Help] ' || coalesce(nullif(q, ''), 'Talk to the team');
  a := least(uid, team); b := greatest(uid, team);
  perform pg_advisory_xact_lock(hashtext(a::text || b::text));
  select count(*) into n from public.kr8_messages m join public.kr8_threads t on t.id = m.thread_id
   where m.sender = uid and t.user_a = a and t.user_b = b and m.created_at > now() - interval '1 day';
  if n >= 30 then raise exception 'KR8_SLOW_DOWN'; end if;
  select id into tid from public.kr8_threads where user_a = a and user_b = b;
  if tid is null then
    insert into public.kr8_threads (user_a, user_b, opened_by, status) values (a, b, uid, 'open') returning id into tid;   -- (b) open, not pending
  else
    update public.kr8_threads set status = 'open' where id = tid and status <> 'open';
  end if;
  -- a double tap within 10 minutes with the same question is sent once
  if not exists (select 1 from public.kr8_messages where thread_id = tid and sender = uid and kr8_messages.body = v_body
                   and created_at > now() - interval '10 minutes'
                   and id = (select max(id) from public.kr8_messages where thread_id = tid)) then
    insert into public.kr8_messages (thread_id, sender, body) values (tid, uid, v_body);
  end if;
  update public.kr8_threads set last_at = now() where id = tid;
  insert into public.kr8_help_events (user_id, kind, query) values (uid, 'team', nullif(left(q, 200), ''));
  return tid;
end $$;
revoke all on function public.kr8_help_open(text) from public, anon;
grant execute on function public.kr8_help_open(text) to authenticated;

-- ───────────── founder: Help cases (one per member, last message unanswered) ─────────────
create or replace function public.kr8_admin_help_cases()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return coalesce((select jsonb_agg(c order by (c ->> 'waiting_since')) from (
    select jsonb_build_object(
      'thread_id', t.id, 'member', mem.uid, 'member_no', m.member_no, 'name', m.first_name, 'photo', nullif(m.photo, ''),
      'verified', coalesce(m.verified, false), 'test', public.kr8_is_test_member(mem.uid),
      'waiting_since', w.first_at, 'last_at', w.last_at, 'unanswered', w.n,
      'question', w.first_body, 'messages', w.bodies,
      'history', coalesce((select jsonb_agg(jsonb_build_object('from', case when h.sender = mem.uid then 'member' else 'team' end, 'body', h.body, 'at', h.created_at) order by h.id)
                             from (select * from public.kr8_messages hm where hm.thread_id = t.id order by hm.id desc limit 8) h), '[]'::jsonb)) as c
    from public.kr8_threads t
    cross join lateral (select case when public.kr8_is_team(t.user_a) then t.user_b else t.user_a end as uid) mem
    join public.kr8_members m on m.user_id = mem.uid
    cross join lateral (
      select min(x.created_at) as first_at, max(x.created_at) as last_at, count(*)::int as n,
             (array_agg(x.body order by x.id))[1] as first_body,
             jsonb_agg(x.body order by x.id) as bodies
      from public.kr8_messages x
      where x.thread_id = t.id and x.sender = mem.uid
        and x.id > coalesce((select max(y.id) from public.kr8_messages y where y.thread_id = t.id and y.sender <> mem.uid), 0)) w
    where (public.kr8_is_team(t.user_a) or public.kr8_is_team(t.user_b))
      and not (public.kr8_is_team(t.user_a) and public.kr8_is_team(t.user_b))
      and w.n > 0) s), '[]'::jsonb);
end $$;
revoke all on function public.kr8_admin_help_cases() from public, anon;
grant execute on function public.kr8_admin_help_cases() to authenticated;

-- ───────────── founder: reply AS the Kring Team ─────────────
create or replace function public.kr8_admin_team_reply(p_member uuid, p_body text)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare team uuid := public.kr8_help_team_id(); a uuid; b uuid; tid uuid; mid bigint;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if team is null then raise exception 'KR8_NO_TEAM'; end if;
  if p_member is null or public.kr8_is_team(p_member) or not exists (select 1 from public.kr8_members where user_id = p_member) then raise exception 'KR8_NO_PERSON'; end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 500 then raise exception 'KR8_BAD_TEXT'; end if;
  a := least(p_member, team); b := greatest(p_member, team);
  perform pg_advisory_xact_lock(hashtext(a::text || b::text));
  -- the thread the member wrote in (any team account), else the main team account's thread, else a new open one
  select t.id into tid from public.kr8_threads t
   where p_member in (t.user_a, t.user_b) and (public.kr8_is_team(t.user_a) or public.kr8_is_team(t.user_b))
   order by (t.user_a = a and t.user_b = b) desc, t.last_at desc limit 1;
  if tid is null then
    insert into public.kr8_threads (user_a, user_b, opened_by, status) values (a, b, team, 'open') returning id into tid;
  else
    update public.kr8_threads set status = 'open' where id = tid and status <> 'open';
  end if;
  insert into public.kr8_messages (thread_id, sender, body)
  values (tid, (select case when public.kr8_is_team(t.user_a) then t.user_a else t.user_b end from public.kr8_threads t where t.id = tid), btrim(p_body))
  returning id into mid;
  update public.kr8_threads set last_at = now() where id = tid;
  return mid;
end $$;
revoke all on function public.kr8_admin_team_reply(uuid, text) from public, anon;
grant execute on function public.kr8_admin_team_reply(uuid, text) to authenticated;

commit;
