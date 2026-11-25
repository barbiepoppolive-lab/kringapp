-- m213 (25 Nov 2026) retention data layer. ADDITIVE ONLY: new tables, new functions, new config keys, new cron jobs.
-- No existing function is replaced here. m213b replaces kr8_my_activity (Ask BKK reply lines, gated by config
-- activity_ask_reply_on, default 0, so the live app sees exactly what it saw before). Exact old text: m213_RESTORE_my_activity.sql.
--
--   1. Sessions:  kr8_sessions + kr8_session_beat(p_sid)  (app sends one beat every 30 s while visible)
--                 kr8_admin_first_sessions(p_days)        (per signup day: signups, tracked, stayed 5+ min, median first session)
--   2. Come-back summary (OFF: line_digest_on = 0): kr8_digest_prefs, kr8_digest_log, kr8_digest_counts, kr8_digest_preview,
--                 kr8_digest_run (cron 19:30 Bangkok), email via edge function kr8-digest-mail (Brevo, hello@kringapp.com)
--   3. Tonight's question + answer streak: kr8_tonight_q, kr8_admin_set_tonight, kr8_tonight_pick (cron 20:00 Bangkok),
--                 kr8_tonight_question(), kr8_answer_streak(p_uid)

-- ───────────────────────── config (all new keys; nothing switched on) ─────────────────────────
insert into public.kr8_rings_config (key, value, note) values
  ('line_digest_on', 0, 'm213: evening come-back summary (19:30 Bangkok). 1 = send, 0 = off'),
  ('digest_email_max', 150, 'm213: max summary emails per evening (Brevo free plan = 300 emails a day in total)'),
  ('digest_line_month_cap', 450, 'm213: summary never uses LINE once this month''s LINE pushes reach this (OA free quota 500)'),
  ('digest_quiet_hours', 6, 'm213: skip members active in the last N hours'),
  ('activity_ask_reply_on', 0, 'm213: Ask BKK replies in the in-app Activity list. Turn on only with the app build that knows ask_reply'),
  ('tonight_q_on', 1, 'm213: 20:00 Bangkok auto-picks tonight''s Ask BKK question when the admin has not picked one')
on conflict (key) do nothing;

-- ───────────────────────── 1. sessions ─────────────────────────
create table if not exists public.kr8_sessions (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  sid          text not null,                       -- random id the app makes per page load
  started_at   timestamptz not null default now(),
  last_beat_at timestamptz not null default now(),
  seconds      integer not null default 0,          -- visible seconds (gaps over 90 s, e.g. tab hidden, are not counted)
  beats        integer not null default 1
);
create index if not exists kr8_sessions_user_idx on public.kr8_sessions (user_id, last_beat_at desc);
create index if not exists kr8_sessions_started_idx on public.kr8_sessions (started_at);
alter table public.kr8_sessions enable row level security;
revoke all on public.kr8_sessions from anon, authenticated;

create or replace function public.kr8_session_beat(p_sid text)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare uid uuid := auth.uid(); r record; gap numeric;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if p_sid is null or p_sid !~ '^[A-Za-z0-9-]{8,40}$' then return; end if;
  select id, last_beat_at into r from public.kr8_sessions where user_id = uid and sid = p_sid order by id desc limit 1;
  if r.id is null or r.last_beat_at < now() - interval '30 minutes' then
    -- at most 30 new session rows per member per hour (a misbehaving client cannot flood the table)
    if (select count(*) from public.kr8_sessions where user_id = uid and started_at > now() - interval '1 hour') >= 30 then return; end if;
    insert into public.kr8_sessions (user_id, sid) values (uid, p_sid);
    return;
  end if;
  gap := extract(epoch from (now() - r.last_beat_at));
  if gap < 20 then return; end if;                    -- server-side rate limit: one write per 20 s per session
  update public.kr8_sessions
     set last_beat_at = now(), beats = beats + 1, seconds = seconds + case when gap <= 90 then round(gap)::int else 0 end
   where id = r.id;
end $$;
revoke execute on function public.kr8_session_beat(text) from public, anon;
grant execute on function public.kr8_session_beat(text) to authenticated;

-- Per signup day (Bangkok): first session = the member's earliest session that started between 2 h before and 24 h after the card.
-- Members who joined before tracking began have no such session and count as not tracked.
create or replace function public.kr8_admin_first_sessions(p_days integer default 14)
returns table(day date, signups integer, tracked integer, stayed_5m integer, pct_5m numeric, median_first_secs integer, avg_first_secs integer)
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
#variable_conflict use_column
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return query
  with m as (
    select mm.user_id, mm.created_at, public.kr8_bkk_day(mm.created_at) d
    from public.kr8_members mm
    where mm.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 14), 90)))
      and public.kr8_is_real_member(mm.user_id)),
  f as (
    select m.user_id, m.d,
      (select s.seconds from public.kr8_sessions s
        where s.user_id = m.user_id and s.started_at between m.created_at - interval '2 hours' and m.created_at + interval '24 hours'
        order by s.started_at limit 1) secs
    from m)
  select f.d, count(*)::int, count(f.secs)::int, count(*) filter (where f.secs >= 300)::int,
         case when count(f.secs) = 0 then null else round(100.0 * count(*) filter (where f.secs >= 300) / count(f.secs), 1) end,
         (percentile_cont(0.5) within group (order by f.secs))::int, avg(f.secs)::int
  from f group by f.d order by f.d desc;
end $$;
revoke execute on function public.kr8_admin_first_sessions(integer) from public, anon;
grant execute on function public.kr8_admin_first_sessions(integer) to authenticated;

-- ───────────────────────── 2. come-back summary ─────────────────────────
create table if not exists public.kr8_digest_prefs (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  token        text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  email_off_at timestamptz,                          -- set by the one-click unsubscribe
  off_via      text,
  created_at   timestamptz not null default now()
);
alter table public.kr8_digest_prefs enable row level security;
revoke all on public.kr8_digest_prefs from anon, authenticated;

create table if not exists public.kr8_digest_log (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        date not null,                          -- Bangkok day; one summary per member per day
  channel    text not null check (channel in ('email', 'web', 'line')),
  likes      integer not null default 0,
  replies    integer not null default 0,
  follows    integer not null default 0,
  since      timestamptz,
  subject    text,
  body       text,
  url        text,
  to_email   text,
  state      text not null default 'queued' check (state in ('queued', 'sent', 'failed', 'pushed')),
  http       integer,
  tries      integer not null default 0,
  msg_id     bigint,                                 -- kr8_push_msgs id for web / LINE
  claimed_at timestamptz,
  sent_at    timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
create index if not exists kr8_digest_log_q_idx on public.kr8_digest_log (state, channel) where state = 'queued';
alter table public.kr8_digest_log enable row level security;
revoke all on public.kr8_digest_log from anon, authenticated;

-- LINE reach (25 Nov finding): a LINE push answering HTTP 200 does NOT prove the member is a friend of the OA (LINE accepts pushes
-- to non-friends silently). A line_sub counts as reachable only when the OA's profile lookup for it succeeded (tools/line_reach_check.py).
create table if not exists public.kr8_line_oa_reach (
  line_sub   text primary key check (line_sub ~ '^U[0-9a-f]{32}$'),
  ok         boolean not null,
  http       integer,
  checked_at timestamptz not null default now()
);
alter table public.kr8_line_oa_reach enable row level security;
revoke all on public.kr8_line_oa_reach from anon, authenticated;

/** Last time the member was in the app: kr8_touch, a session beat or any client event. */
create or replace function public.kr8_last_seen(p_uid uuid)
returns timestamptz language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select greatest(
    (select m.last_active_at from public.kr8_members m where m.user_id = p_uid),
    (select max(s.last_beat_at) from public.kr8_sessions s where s.user_id = p_uid),
    (select max(e.created_at) from public.kr8_client_events e where e.user_id = p_uid))
$$;
revoke execute on function public.kr8_last_seen(uuid) from public, anon, authenticated;

/** New things on the member's stuff since max(last visit, last summary, 7 days ago). Truthful counts only. */
create or replace function public.kr8_digest_counts(p_uid uuid)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  with s as (select greatest(coalesce(public.kr8_last_seen(p_uid), '-infinity'::timestamptz),
                             coalesce((select max(l.created_at) from public.kr8_digest_log l where l.user_id = p_uid), '-infinity'::timestamptz),
                             now() - interval '7 days') since),
  lk as (select l.post_id, count(*)::int n from public.kr8_post_likes l join public.kr8_posts p on p.id = l.post_id, s
          where p.author = p_uid and p.kind = 'reel' and not coalesce(p.hidden, false) and l.user_id <> p_uid and l.created_at > s.since
            and not public.kr8_is_blocked(p_uid, l.user_id)
          group by l.post_id),
  rp as (select a.post_id, count(*)::int n, max(r.created_at) at from public.kr8_ask_answers r join public.kr8_ask_answers a on a.id = r.parent_id, s
          where a.author = p_uid and r.author <> p_uid and not coalesce(r.hidden, false) and r.created_at > s.since
            and not public.kr8_is_blocked(p_uid, r.author)
          group by a.post_id),
  fo as (select count(*)::int n from public.kr8_follows f, s
          where f.followee = p_uid and f.created_at > s.since and not public.kr8_is_blocked(p_uid, f.follower))
  select jsonb_build_object(
    'since', (select since from s),
    'likes', coalesce((select sum(n) from lk), 0)::int,
    'like_post', (select post_id from lk order by n desc, post_id limit 1),
    'replies', coalesce((select sum(n) from rp), 0)::int,
    'reply_post', (select post_id from rp order by at desc limit 1),
    'follows', (select n from fo))
$$;
revoke execute on function public.kr8_digest_counts(uuid) from public, anon, authenticated;

/** The Thai text for one summary (members see one language; the summary is Thai only). */
create or replace function public.kr8_digest_text(c jsonb)
returns jsonb language sql immutable set search_path to 'public', 'pg_temp' as $$
  with v as (select (c ->> 'likes')::int lk, (c ->> 'replies')::int rp, (c ->> 'follows')::int fo),
  l as (select array_remove(array[
      case when rp > 0 then 'มี ' || rp || ' ข้อความตอบกลับคำตอบของคุณใน Ask BKK' end,
      case when lk > 0 then 'รีลของคุณได้ ' || lk || ' ไลก์ใหม่' end,
      case when fo > 0 then 'มีผู้ติดตามใหม่ ' || fo || ' คน' end], null) a from v)
  select jsonb_build_object(
    'title', 'กริ๊ง! · มีเรื่องใหม่รอคุณอยู่',
    'subject', (select a[1] from l),
    'lines', (select to_jsonb(a) from l),
    'body', (select array_to_string(a, E'\n') from l) || E'\n' || 'แตะเพื่อเปิดดูในกริ๊ง!',
    'url', case when (c ->> 'replies')::int > 0 and c ->> 'reply_post' is not null then '/app/?ask=' || (c ->> 'reply_post')
                when (c ->> 'likes')::int > 0 and c ->> 'like_post' is not null then '/app/?reel=' || (c ->> 'like_post')
                else '/app/?tab=me' end)
$$;
revoke execute on function public.kr8_digest_text(jsonb) from public, anon, authenticated;

/** Who would get a summary right now, by which channel, and the exact words. Admin only; changes nothing. */
create or replace function public.kr8_digest_preview(p_limit integer default 200)
returns table(member_no integer, first_name text, user_id uuid, channel text, likes integer, replies integer, follows integer,
              last_seen timestamptz, subject text, body text, url text, why_skip text)
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
#variable_conflict use_column
declare d date := public.kr8_bkk_day(); line_used int; line_cap int;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  line_used := (select count(*)::int from public.kr8_push_outbox o where o.channel = 'line' and o.state in ('queued', 'sent')
                  and o.created_at >= date_trunc('month', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok');
  line_cap := least(public.kr8_rcfg('push_line_cap', 0), public.kr8_rcfg('digest_line_month_cap', 450));
  return query
  with mem as (
    select m.user_id, m.member_no, m.first_name, public.kr8_last_seen(m.user_id) ls, public.kr8_digest_counts(m.user_id) c
    from public.kr8_members m
    where public.kr8_is_real_member(m.user_id) and not public.kr8_minor_held(m.user_id)),
  ch as (
    select mem.*,
      case when exists (select 1 from public.kr8_push_subs s where s.user_id = mem.user_id) then 'web'
           when line_used < line_cap and exists (
                  select 1 from public.kr8_line_links ll join public.kr8_line_oa_reach x on x.line_sub = ll.line_sub
                   where ll.user_id = mem.user_id and x.ok and x.checked_at > now() - interval '30 days') then 'line'
           -- LINE-login members carry a made-up <id>@users.kringapp.com address: never mail those
           when exists (select 1 from auth.users u where u.id = mem.user_id and u.email is not null and u.email_confirmed_at is not null
                          and u.email !~* '@users\.kringapp\.com$')
                and not exists (select 1 from public.kr8_digest_prefs p where p.user_id = mem.user_id and p.email_off_at is not null) then 'email'
      end chan
    from mem)
  select ch.member_no, ch.first_name, ch.user_id, ch.chan, (ch.c ->> 'likes')::int, (ch.c ->> 'replies')::int, (ch.c ->> 'follows')::int, ch.ls,
         t ->> 'subject', t ->> 'body', t ->> 'url',
         case when (ch.c ->> 'likes')::int + (ch.c ->> 'replies')::int + (ch.c ->> 'follows')::int = 0 then 'nothing new'
              when ch.ls > now() - make_interval(hours => public.kr8_rcfg('digest_quiet_hours', 6)) then 'active recently'
              when exists (select 1 from public.kr8_digest_log l where l.user_id = ch.user_id and l.day = d) then 'already today'
              when ch.chan is null then 'no channel'
         end
  from ch cross join lateral (select public.kr8_digest_text(ch.c) t) x
  order by 12 nulls first, ch.member_no
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
end $$;
revoke execute on function public.kr8_digest_preview(integer) from public, anon;
grant execute on function public.kr8_digest_preview(integer) to authenticated;

/** Poke the email sender (edge function kr8-digest-mail) when summary emails are waiting. */
create or replace function public.kr8_digest_mail_kick()
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare k text;
begin
  if public.kr8_rcfg('line_digest_on', 0) <> 1 then return; end if;
  if not exists (select 1 from public.kr8_digest_log where state = 'queued' and channel = 'email' and tries < 3) then return; end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'notify_hook_secret' limit 1;
  if k is null then return; end if;
  perform net.http_post(url := 'https://pedxoxpammnyfnizljyj.supabase.co/functions/v1/kr8-digest-mail/send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', k), body := '{}'::jsonb, timeout_milliseconds := 60000);
exception when others then return;
end $$;
revoke execute on function public.kr8_digest_mail_kick() from public, anon, authenticated;

/** The evening run (cron 19:30 Bangkok). Hard switch: line_digest_on. One summary per member per Bangkok day. */
create or replace function public.kr8_digest_run(p_force boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare r record; d date := public.kr8_bkk_day(); n_web int := 0; n_line int := 0; n_mail int := 0; q jsonb; res jsonb;
        mail_max int := public.kr8_rcfg('digest_email_max', 150); em text; mid bigint;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;   -- cron runs as postgres (admin); members never
  if public.kr8_rcfg('line_digest_on', 0) <> 1 and not coalesce(p_force, false) then return jsonb_build_object('skipped', 'switch off'); end if;
  if coalesce(p_force, false) and public.kr8_rcfg('line_digest_on', 0) <> 1 then raise exception 'KR8_DIGEST_OFF'; end if;   -- force never bypasses the switch
  perform pg_advisory_xact_lock(hashtext('kr8_digest_run'));
  for r in select * from public.kr8_digest_preview(1000) p where p.why_skip is null loop
    if r.channel = 'email' then
      if n_mail >= mail_max then continue; end if;
      select u.email into em from auth.users u where u.id = r.user_id;
      insert into public.kr8_digest_prefs (user_id) values (r.user_id) on conflict do nothing;
      insert into public.kr8_digest_log (user_id, day, channel, likes, replies, follows, subject, body, url, to_email)
      values (r.user_id, d, 'email', r.likes, r.replies, r.follows, r.subject, r.body, r.url, em) on conflict (user_id, day) do nothing;
      if found then n_mail := n_mail + 1; end if;
    else
      insert into public.kr8_digest_log (user_id, day, channel, likes, replies, follows, subject, body, url, state)
      values (r.user_id, d, r.channel, r.likes, r.replies, r.follows, r.subject, r.body, r.url, 'pushed') on conflict (user_id, day) do nothing;
      if not found then continue; end if;
      -- the existing ding pipeline (kr8_push_queue → kr8_push_outbox → kringapp.com/api/push), which also enforces push_line_cap
      q := public.kr8_push_queue('admin', r.user_id, false, 'กริ๊ง! · มีเรื่องใหม่รอคุณอยู่', left(r.body, 240), r.url,
                                 md5('digest:' || d::text || ':' || r.user_id::text)::uuid, r.channel = 'line');
      mid := (q ->> 'msg')::bigint;
      update public.kr8_digest_log set msg_id = mid, sent_at = now() where user_id = r.user_id and day = d;
      if r.channel = 'web' then n_web := n_web + 1; else n_line := n_line + 1; end if;
    end if;
  end loop;
  if n_mail > 0 then perform public.kr8_digest_mail_kick(); end if;
  res := jsonb_build_object('day', d, 'web', n_web, 'line', n_line, 'email', n_mail, 'at', now());
  insert into public.kr8_autopilot_kv (key, val) values ('digest_last_run', res::text)
    on conflict (key) do update set val = excluded.val, updated_at = now();
  return res;
end $$;
revoke execute on function public.kr8_digest_run(boolean) from public, anon, authenticated;

/** Edge function kr8-digest-mail (service role only): take up to N waiting emails. */
create or replace function public.kr8_digest_mail_claim(p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare r jsonb;
begin
  if auth.uid() is not null or not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if public.kr8_rcfg('line_digest_on', 0) <> 1 then return '[]'::jsonb; end if;   -- switched off = nothing leaves, even if rows wait
  with c as (
    select l.id from public.kr8_digest_log l
     where l.state = 'queued' and l.channel = 'email' and l.tries < 3 and (l.claimed_at is null or l.claimed_at < now() - interval '5 minutes')
       and l.day = public.kr8_bkk_day()                                 -- yesterday's leftovers are never sent late
       and not exists (select 1 from public.kr8_digest_prefs p where p.user_id = l.user_id and p.email_off_at is not null)
     order by l.id limit greatest(1, least(coalesce(p_limit, 25), 50)) for update skip locked),
  u as (update public.kr8_digest_log l set claimed_at = now(), tries = l.tries + 1 from c where l.id = c.id
        returning l.id, l.user_id, l.to_email, l.subject, l.body, l.url)
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'to', u.to_email, 'subject', u.subject, 'body', u.body, 'url', u.url,
           'token', (select p.token from public.kr8_digest_prefs p where p.user_id = u.user_id))), '[]'::jsonb) into r from u;
  return r;
end $$;
revoke execute on function public.kr8_digest_mail_claim(integer) from public, anon, authenticated;
grant execute on function public.kr8_digest_mail_claim(integer) to service_role;

create or replace function public.kr8_digest_mail_done(p_results jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare x jsonb;
begin
  if auth.uid() is not null or not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) limit 100 loop
    update public.kr8_digest_log
       set http = (x ->> 'http')::int,
           state = case when (x ->> 'http')::int between 200 and 299 then 'sent' when tries >= 3 then 'failed' else 'queued' end,
           sent_at = case when (x ->> 'http')::int between 200 and 299 then now() end,
           last_error = left(x ->> 'error', 300)
     where id = (x ->> 'id')::bigint and state = 'queued';
  end loop;
  return jsonb_build_object('more', exists (select 1 from public.kr8_digest_log where state = 'queued' and channel = 'email' and tries < 3
                                             and day = public.kr8_bkk_day() and (claimed_at is null or claimed_at < now() - interval '5 minutes')));
end $$;
revoke execute on function public.kr8_digest_mail_done(jsonb) from public, anon, authenticated;
grant execute on function public.kr8_digest_mail_done(jsonb) to service_role;

/** One-click unsubscribe (edge function only; the 64-hex token in the email is the proof). */
create or replace function public.kr8_digest_unsub(p_token text, p_via text default 'link')
returns boolean language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if auth.uid() is not null or not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return false; end if;
  update public.kr8_digest_prefs set email_off_at = coalesce(email_off_at, now()), off_via = left(coalesce(p_via, 'link'), 20)
   where token = p_token;
  return found;
end $$;
revoke execute on function public.kr8_digest_unsub(text, text) from public, anon, authenticated;
grant execute on function public.kr8_digest_unsub(text, text) to service_role;

-- ───────────────────────── 3. tonight's question + answer streak ─────────────────────────
create table if not exists public.kr8_tonight_q (
  day       date primary key,                        -- Bangkok day; the question goes up at 20:00
  post_id   uuid not null references public.kr8_posts(id) on delete cascade,
  picked_by text not null default 'auto' check (picked_by in ('auto', 'admin')),
  picked_at timestamptz not null default now()
);
alter table public.kr8_tonight_q enable row level security;
revoke all on public.kr8_tonight_q from anon, authenticated;

create or replace function public.kr8_admin_set_tonight(p_post uuid, p_day date default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare d date := coalesce(p_day, public.kr8_bkk_day());
begin
  if auth.uid() is null and not public.kr8_is_admin() then raise exception 'KR8_SIGN_IN'; end if;
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if d < public.kr8_bkk_day() or d > public.kr8_bkk_day() + 14 then raise exception 'KR8_BAD_DAY'; end if;
  if not public.kr8_ask_q_ok(null, p_post) then raise exception 'KR8_NOT_FOUND'; end if;
  insert into public.kr8_tonight_q (day, post_id, picked_by) values (d, p_post, 'admin')
    on conflict (day) do update set post_id = excluded.post_id, picked_by = 'admin', picked_at = now();
  return jsonb_build_object('day', d, 'post_id', p_post);
end $$;
revoke execute on function public.kr8_admin_set_tonight(uuid, date) from public, anon;
grant execute on function public.kr8_admin_set_tonight(uuid, date) to authenticated;

/** Cron 20:00 Bangkok: when nobody picked today's question, take the newest approved Ask BKK question not used in the last 14 days. */
create or replace function public.kr8_tonight_pick()
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare d date := public.kr8_bkk_day(); pid uuid;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if public.kr8_rcfg('tonight_q_on', 1) <> 1 then return jsonb_build_object('skipped', 'switch off'); end if;
  if exists (select 1 from public.kr8_tonight_q where day = d) then return jsonb_build_object('skipped', 'already picked'); end if;
  select p.id into pid from public.kr8_posts p
   where p.kind = 'ask' and public.kr8_ask_q_ok(null, p.id)
     and not exists (select 1 from public.kr8_members g where g.user_id = p.author and (coalesce(g.ghost, false) or public.kr8_is_test_member(g.user_id)))
     and not exists (select 1 from public.kr8_tonight_q t where t.post_id = p.id and t.day > d - 14)
   order by p.created_at desc limit 1;
  if pid is null then return jsonb_build_object('skipped', 'no question'); end if;
  insert into public.kr8_tonight_q (day, post_id, picked_by) values (d, pid, 'auto') on conflict (day) do nothing;
  return jsonb_build_object('day', d, 'post_id', pid);
end $$;
revoke execute on function public.kr8_tonight_pick() from public, anon, authenticated;

/** What the app shows: today's question from 20:00 Bangkok, before that yesterday's. null when there is none. */
create or replace function public.kr8_tonight_question()
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare uid uuid := auth.uid(); t record;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select q.day, q.post_id into t from public.kr8_tonight_q q
   where q.day < public.kr8_bkk_day()
      or (q.day = public.kr8_bkk_day() and (now() at time zone 'Asia/Bangkok')::time >= time '20:00')
   order by q.day desc limit 1;
  if t.post_id is null or t.day < public.kr8_bkk_day() - 1 or not public.kr8_ask_q_ok(uid, t.post_id) then return null; end if;
  return (select jsonb_build_object(
      'day', t.day, 'post_id', p.id, 'body', left(p.body, 300), 'details', left(coalesce(p.ask_details, ''), 300),
      'answers', (select count(*)::int from public.kr8_ask_answers a where a.post_id = p.id and a.parent_id is null and not coalesce(a.hidden, false)),
      'answered', exists (select 1 from public.kr8_ask_answers a where a.post_id = p.id and a.author = uid),
      'url', '/app/?ask=' || p.id)
    from public.kr8_posts p where p.id = t.post_id);
end $$;
revoke execute on function public.kr8_tonight_question() from public, anon;
grant execute on function public.kr8_tonight_question() to authenticated;

/** Consecutive Bangkok days with at least one Ask BKK answer/reply or vote. The streak stays alive through today until midnight. */
create or replace function public.kr8_answer_streak(p_uid uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare uid uuid := coalesce(p_uid, auth.uid()); today date := public.kr8_bkk_day(); r jsonb;
begin
  if auth.uid() is null and not public.kr8_is_admin() then raise exception 'KR8_SIGN_IN'; end if;
  -- another member's streak is readable (answers are public), never across a block
  if p_uid is not null and p_uid is distinct from auth.uid() and not public.kr8_is_admin()
     and public.kr8_is_blocked(auth.uid(), p_uid) then raise exception 'KR8_NOT_FOUND'; end if;
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  with days as (
    select public.kr8_bkk_day(a.created_at) d from public.kr8_ask_answers a where a.author = uid and not coalesce(a.hidden, false)
    union
    select public.kr8_bkk_day(v.created_at) from public.kr8_ask_votes v where v.user_id = uid and v.value <> 0),
  g as (select d, d - (row_number() over (order by d))::int grp from days),
  runs as (select grp, count(*)::int n, max(d) last_d from g group by grp)
  select jsonb_build_object(
    'current', coalesce((select n from runs where last_d >= today - 1 order by last_d desc limit 1), 0),
    'best', coalesce((select max(n) from runs), 0),
    'today', exists (select 1 from days where d = today),
    'last_day', (select max(d) from days),
    'week', (select jsonb_agg(exists (select 1 from days where d = today - k) order by k desc) from generate_series(0, 6) k),
    'through', today) into r;
  return r;
end $$;
revoke execute on function public.kr8_answer_streak(uuid) from public, anon;
grant execute on function public.kr8_answer_streak(uuid) to authenticated;

-- ───────────────────────── cron (the digest job does nothing while line_digest_on = 0) ─────────────────────────
select cron.schedule('kr8_digest_evening', '30 12 * * *', 'select public.kr8_digest_run()');          -- 19:30 Bangkok
select cron.schedule('kr8_digest_mail_retry', '*/10 12-14 * * *', 'select public.kr8_digest_mail_kick()');   -- 19:00–21:59 Bangkok
select cron.schedule('kr8_tonight_pick', '0 13 * * *', 'select public.kr8_tonight_pick()');           -- 20:00 Bangkok
