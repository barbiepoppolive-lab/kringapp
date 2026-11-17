-- 0098_kr8_autopilot2_m1 · Kring Autopilot M1 Foundation (rebased onto live-base 8a29fdb, 18 Nov 2026)
--
-- GOAL:
--   Permanent autopilot foundation so every robot has:
--     (a) an ON / DRY-RUN / OFF mode switch in admin (default OFF or DRY-RUN; live dup_robot stays ON for new cases, dup_sweep stays DRY-RUN),
--     (b) every action written to kr8_robot_log with structured undo jsonb where possible,
--     (c) a daily_cap enforced server-side before any live action,
--     (d) a global "Pause all robots" kill switch, and
--     (e) server-side scheduling via pg_cron (when available) writing to kr8_heartbeat so a missing heartbeat raises an alert.
--
-- CO-EXISTENCE WITH LIVE-BASE 0095/0096/0097 (CoS NOTE 00:40 IST):
--   - Does NOT touch kr8_trust or kr8_reel_scores (live already has the founder's approved versions).
--   - Does NOT set dup_robot_on = 0 (dup_robot stays ON for new cases; dup_sweep stays DRY-RUN / dup_sweep_on = 0).
--   - kr8_admin_v2_snapshot starts from the exact live-base 0095 body and only adds an additive 'autopilot' field.
--
-- UNDO:
--   do $$ begin
--     if to_regclass('cron.job') is not null then
--       if exists (select 1 from cron.job where jobname = 'kr8_autopilot_heartbeat') then
--         perform cron.unschedule('kr8_autopilot_heartbeat');
--       end if;
--     end if;
--   exception when others then null; end $$;
--   delete from public.kr8_rings_config where key = 'autopilot_paused';
--   drop function if exists public.kr8_admin_robot_run_now(text);
--   drop function if exists public.kr8_admin_robot_undo(bigint);
--   drop function if exists public.kr8_admin_pause_all_robots(boolean);
--   drop function if exists public.kr8_admin_robot_set(text, text, integer);
--   drop function if exists public.kr8_admin_autopilot_state(integer);
--   drop function if exists public.kr8_autopilot_heartbeat_tick();
--   drop function if exists public.kr8_schedule_job(text, text, text);
--   drop function if exists public.kr8_robot_record(text, text, text, jsonb, jsonb, boolean);
--   drop function if exists public.kr8_robot_beat(text, boolean, jsonb, integer);
--   drop function if exists public.kr8_robot_can_act(text);
--   drop function if exists public.kr8_robot_mode(text);
--   drop function if exists public.kr8_autopilot_paused();
--   drop table if exists public.kr8_robot_log;
--   drop table if exists public.kr8_heartbeat;
--   drop table if exists public.kr8_robot;
--   -- and re-run kr8_admin_v2_snapshot from 0095_kr8_autopilot1.sql to drop the additive 'autopilot' snapshot field.

begin;

-- ───────────────────────── Global kill switch ─────────────────────────
insert into public.kr8_rings_config (key, value, note) values
  ('autopilot_paused', 0, '1 = Pause all robots kill switch active; all scheduled/automatic robots halt (0098 M1)')
on conflict (key) do nothing;

-- ───────────────────────── Core Autopilot Tables ─────────────────────────
create table if not exists public.kr8_robot (
  name       text primary key check (name ~ '^[a-z0-9_]{2,40}$'),
  title      text not null,
  note       text not null default '',
  schedule   text not null default 'manual',
  mode       text not null default 'dry_run' check (mode in ('on', 'off', 'dry_run')),
  daily_cap  int not null default 50 check (daily_cap between 0 and 10000),
  last_run   timestamptz,
  last_ok    boolean,
  last_note  text,
  updated_at timestamptz not null default now()
);
alter table public.kr8_robot enable row level security;
revoke all on public.kr8_robot from public, anon, authenticated;

create table if not exists public.kr8_robot_log (
  id         bigint generated always as identity primary key,
  robot      text not null references public.kr8_robot(name) on update cascade on delete cascade,
  action     text not null check (length(btrim(action)) between 1 and 80),
  target     text,
  detail     jsonb not null default '{}'::jsonb,
  undo       jsonb,
  undone_at  timestamptz,
  undone_by  uuid,
  dry_run    boolean not null default false,
  at         timestamptz not null default now()
);
create index if not exists kr8_robot_log_at_idx on public.kr8_robot_log (at desc);
create index if not exists kr8_robot_log_robot_at_idx on public.kr8_robot_log (robot, at desc);
alter table public.kr8_robot_log enable row level security;
revoke all on public.kr8_robot_log from public, anon, authenticated;

create table if not exists public.kr8_heartbeat (
  job        text primary key check (job ~ '^[a-z0-9_]{2,50}$'),
  every_sec  int not null default 900 check (every_sec between 30 and 604800),
  last_beat  timestamptz,
  last_ok    boolean not null default true,
  detail     jsonb not null default '{}'::jsonb
);
alter table public.kr8_heartbeat enable row level security;
revoke all on public.kr8_heartbeat from public, anon, authenticated;

-- ───────────────────────── Seed Robots & Heartbeats ─────────────────────────
-- Note: dup_robot reflects live dup_robot_on (ON for NEW duplicate cases); dup_sweep reflects dup_sweep_on = 0 (DRY-RUN on past data).
-- Every new T-380 robot defaults strictly to DRY-RUN or OFF.
insert into public.kr8_robot (name, title, note, schedule, mode, daily_cap) values
  ('health_watch',     'Health watch',          'Checks DB, auth, storage buckets, RPC speed (<2s), face check, code stock (>5), quotas, and cron heartbeats every 15 min.', '*/15 * * * *', 'dry_run', 96),
  ('self_fix',         'Self-fix',              'Expires stale pending threads, cleans 24h+ orphan uploads, retries queued PDPA selfie deletions, warns when codes <= 5.', '*/30 * * * *', 'dry_run', 50),
  ('protect',          'Protect & flags',       'Flags scam phrases, link tries, shared face/device/Wi-Fi, Ring farming; auto-hides posts at 3+ reports for your decision.', '*/15 * * * *', 'dry_run', 100),
  ('dup_robot',        'Duplicate guard (new)', 'Live guard for NEW cases: hides newer account on >=0.60 face match to an older account or shared claim phone (undoable).', 'event-driven', case when public.kr8_rcfg('dup_robot_on', 1) = 1 then 'on' else 'off' end, 25),
  ('dup_sweep',        'Duplicate past sweep',  'Sweep of PAST data (0095): DRY-RUN previews who would be hidden until switched ON.', 'manual', case when public.kr8_rcfg('dup_sweep_on', 0) = 1 then 'on' else 'dry_run' end, 50),
  ('growth_nudges',    'Growth nudges',         'DRY-RUN previews of incomplete-card, unverified-24h, dormant-7d, and weekly winners copy (Thai + English) for approval.', '15 3 * * *',   'dry_run', 40),
  ('ai_helper',        'AI wording slot',       'Optional OpenRouter free helper for Morning Brief wording, error plain-English notes, and caption drafts (no member data).', 'on-demand',    'off',     30),
  ('nightly_selftest', 'Nightly self-test',     'Playwright core journey check on local build (Feed, People, Board, Admin Today/Needs you/Autopilot).', '30 21 * * *',  'dry_run', 10)
on conflict (name) do update set
  title    = excluded.title,
  note     = excluded.note,
  schedule = excluded.schedule;

insert into public.kr8_heartbeat (job, every_sec, last_beat, last_ok, detail) values
  ('kr8_autopilot_heartbeat', 900,   now(), true, jsonb_build_object('note', 'Autopilot foundation pulse')),
  ('health_watch',            900,   null,  true, jsonb_build_object('note', 'Waiting for first 15m run')),
  ('self_fix',                1800,  null,  true, jsonb_build_object('note', 'Waiting for first 30m run')),
  ('protect',                 900,   null,  true, jsonb_build_object('note', 'Waiting for first 15m run')),
  ('growth_nudges',           86400, null,  true, jsonb_build_object('note', 'Waiting for daily dry-run')),
  ('nightly_selftest',        86400, null,  true, jsonb_build_object('note', 'Waiting for nightly self-test'))
on conflict (job) do nothing;

-- ───────────────────────── Internal Helper Functions ─────────────────────────
create or replace function public.kr8_autopilot_paused()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.kr8_rcfg('autopilot_paused', 0) = 1
$$;
revoke all on function public.kr8_autopilot_paused() from public, anon, authenticated;

create or replace function public.kr8_robot_mode(p_robot text)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m text;
begin
  if public.kr8_autopilot_paused() then return 'off'; end if;
  select r.mode into m from public.kr8_robot r where r.name = p_robot;
  return coalesce(m, 'off');
end $$;
revoke all on function public.kr8_robot_mode(text) from public, anon, authenticated;

create or replace function public.kr8_robot_can_act(p_robot text)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r public.kr8_robot;
  d0 timestamptz := ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
  used int := 0;
begin
  if public.kr8_autopilot_paused() then return 'off'; end if;
  select * into r from public.kr8_robot where name = p_robot;
  if r.name is null or r.mode = 'off' then return 'off'; end if;
  if r.mode = 'dry_run' then
    select count(*)::int into used from public.kr8_robot_log l where l.robot = p_robot and l.at >= d0;
    if used >= greatest(r.daily_cap, 1) then return 'capped'; end if;
    return 'dry_run';
  end if;
  select count(*)::int into used from public.kr8_robot_log l where l.robot = p_robot and not l.dry_run and l.at >= d0;
  if used >= r.daily_cap then return 'capped'; end if;
  return 'on';
end $$;
revoke all on function public.kr8_robot_can_act(text) from public, anon, authenticated;

create or replace function public.kr8_robot_beat(
  p_job text,
  p_ok boolean default true,
  p_detail jsonb default '{}'::jsonb,
  p_every_sec int default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.kr8_heartbeat (job, every_sec, last_beat, last_ok, detail)
  values (p_job, coalesce(p_every_sec, 900), now(), coalesce(p_ok, true), coalesce(p_detail, '{}'::jsonb))
  on conflict (job) do update set
    every_sec = coalesce(p_every_sec, public.kr8_heartbeat.every_sec),
    last_beat = now(),
    last_ok   = coalesce(p_ok, true),
    detail    = coalesce(p_detail, '{}'::jsonb);

  update public.kr8_robot
     set last_run  = now(),
         last_ok   = coalesce(p_ok, true),
         last_note = coalesce(p_detail ->> 'note', last_note)
   where name = p_job;
end $$;
revoke all on function public.kr8_robot_beat(text, boolean, jsonb, integer) from public, anon, authenticated;

create or replace function public.kr8_robot_record(
  p_robot text,
  p_action text,
  p_target text default null,
  p_detail jsonb default '{}'::jsonb,
  p_undo jsonb default null,
  p_dry_run boolean default false
)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare lid bigint;
begin
  insert into public.kr8_robot_log (robot, action, target, detail, undo, dry_run)
  values (p_robot, left(btrim(p_action), 80), left(p_target, 120), coalesce(p_detail, '{}'::jsonb), p_undo, coalesce(p_dry_run, false))
  returning id into lid;

  update public.kr8_robot
     set last_run = now(),
         last_ok  = coalesce(last_ok, true)
   where name = p_robot;

  return lid;
end $$;
revoke all on function public.kr8_robot_record(text, text, text, jsonb, jsonb, boolean) from public, anon, authenticated;

create or replace function public.kr8_schedule_job(p_job text, p_cron text, p_sql text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if to_regclass('cron.job') is null then return false; end if;
  begin
    if exists (select 1 from cron.job where jobname = p_job) then
      perform cron.unschedule(p_job);
    end if;
    perform cron.schedule(p_job, p_cron, p_sql);
    return true;
  exception when others then
    return false;
  end;
end $$;
revoke all on function public.kr8_schedule_job(text, text, text) from public, anon, authenticated;

create or replace function public.kr8_autopilot_heartbeat_tick()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare paused boolean := public.kr8_autopilot_paused();
begin
  perform public.kr8_robot_beat(
    'kr8_autopilot_heartbeat',
    true,
    jsonb_build_object('paused', paused, 'note', case when paused then 'Paused by founder' else 'Autopilot pulse OK' end),
    900
  );
  return jsonb_build_object('ok', true, 'paused', paused, 'at', now());
end $$;
revoke all on function public.kr8_autopilot_heartbeat_tick() from public, anon, authenticated;

select public.kr8_schedule_job('kr8_autopilot_heartbeat', '*/15 * * * *', 'select public.kr8_autopilot_heartbeat_tick()');

-- ───────────────────────── Admin RPCs (strict kr8_is_admin() gate) ─────────────────────────
create or replace function public.kr8_admin_autopilot_state(p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d0 timestamptz := ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
  lim int := least(greatest(coalesce(p_limit, 100), 1), 300);
  has_cron boolean := to_regclass('cron.job') is not null;
  cron_rows jsonb := '[]'::jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  if has_cron then
    begin
      execute $q$
        select coalesce(jsonb_agg(jsonb_build_object(
          'jobname', j.jobname,
          'schedule', j.schedule,
          'active', j.active
        ) order by j.jobname), '[]'::jsonb)
        from cron.job j
        where j.jobname like 'kr8\_%'
      $q$ into cron_rows;
    exception when others then
      cron_rows := '[]'::jsonb;
    end;
  end if;

  return jsonb_build_object(
    'at', now(),
    'day_start', d0,
    'paused', public.kr8_autopilot_paused(),
    'pg_cron_available', has_cron,
    'cron_jobs', cron_rows,
    'robots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', r.name,
        'title', r.title,
        'note', r.note,
        'schedule', r.schedule,
        'mode', r.mode,
        'effective_mode', case when public.kr8_autopilot_paused() then 'off' else r.mode end,
        'daily_cap', r.daily_cap,
        'today_actions', (select count(*)::int from public.kr8_robot_log l where l.robot = r.name and not l.dry_run and l.at >= d0),
        'today_dry_runs', (select count(*)::int from public.kr8_robot_log l where l.robot = r.name and l.dry_run and l.at >= d0),
        'last_run', r.last_run,
        'last_ok', r.last_ok,
        'last_note', r.last_note,
        'updated_at', r.updated_at
      ) order by array_position(array[
        'health_watch','self_fix','protect','dup_robot','dup_sweep','growth_nudges','ai_helper','nightly_selftest'
      ], r.name) nulls last, r.name)
      from public.kr8_robot r
    ), '[]'::jsonb),
    'heartbeats', coalesce((
      select jsonb_agg(jsonb_build_object(
        'job', h.job,
        'every_sec', h.every_sec,
        'last_beat', h.last_beat,
        'last_ok', h.last_ok,
        'stale', (h.last_beat is not null and h.last_beat < now() - make_interval(secs => greatest(h.every_sec * 2, 1200))),
        'missing', h.last_beat is null,
        'detail', h.detail
      ) order by h.job)
      from public.kr8_heartbeat h
    ), '[]'::jsonb),
    'logs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'robot', l.robot,
        'action', l.action,
        'target', l.target,
        'detail', l.detail,
        'can_undo', (l.undo is not null and l.undone_at is null and not l.dry_run),
        'undone_at', l.undone_at,
        'dry_run', l.dry_run,
        'at', l.at
      ) order by l.at desc, l.id desc)
      from (select * from public.kr8_robot_log order by at desc, id desc limit lim) l
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.kr8_admin_autopilot_state(integer) from public, anon;
grant execute on function public.kr8_admin_autopilot_state(integer) to authenticated;

create or replace function public.kr8_admin_robot_set(
  p_name text,
  p_mode text,
  p_daily_cap int default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.kr8_robot;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_mode not in ('on', 'off', 'dry_run') then raise exception 'KR8_BAD_ACTION'; end if;
  if p_daily_cap is not null and (p_daily_cap < 0 or p_daily_cap > 10000) then raise exception 'KR8_BAD_ACTION'; end if;
  if p_name = 'growth_nudges' and p_mode = 'on' then
    raise exception 'KR8_DRY_RUN_ONLY';
  end if;

  update public.kr8_robot
     set mode       = p_mode,
         daily_cap  = coalesce(p_daily_cap, daily_cap),
         updated_at = now()
   where name = p_name
   returning * into r;

  if r.name is null then raise exception 'KR8_BAD_ACTION'; end if;

  if p_name = 'dup_robot' then
    insert into public.kr8_rings_config (key, value, note)
    values ('dup_robot_on', case when p_mode = 'on' and not public.kr8_autopilot_paused() then 1 else 0 end, 'synced from kr8_robot dup_robot (0098)')
    on conflict (key) do update set value = excluded.value;
  elsif p_name = 'dup_sweep' then
    insert into public.kr8_rings_config (key, value, note)
    values ('dup_sweep_on', case when p_mode = 'on' and not public.kr8_autopilot_paused() then 1 else 0 end, 'synced from kr8_robot dup_sweep (0098)')
    on conflict (key) do update set value = excluded.value;
  end if;

  insert into public.kr8_admin_actions_log (action, detail)
  values ('robot_mode_set', jsonb_build_object('robot', r.name, 'mode', r.mode, 'daily_cap', r.daily_cap, 'by', auth.uid()));

  return jsonb_build_object('name', r.name, 'mode', r.mode, 'daily_cap', r.daily_cap, 'updated_at', r.updated_at);
end $$;
revoke all on function public.kr8_admin_robot_set(text, text, integer) from public, anon;
grant execute on function public.kr8_admin_robot_set(text, text, integer) to authenticated;

create or replace function public.kr8_admin_pause_all_robots(p_pause boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v int := case when coalesce(p_pause, true) then 1 else 0 end;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  insert into public.kr8_rings_config (key, value, note)
  values ('autopilot_paused', v, '1 = Pause all robots kill switch active (0098 M1)')
  on conflict (key) do update set value = excluded.value;

  if v = 1 then
    update public.kr8_rings_config set value = 0 where key in ('dup_robot_on', 'dup_sweep_on');
  else
    update public.kr8_rings_config set value = case when (select mode from public.kr8_robot where name = 'dup_robot') = 'on' then 1 else 0 end where key = 'dup_robot_on';
    update public.kr8_rings_config set value = case when (select mode from public.kr8_robot where name = 'dup_sweep') = 'on' then 1 else 0 end where key = 'dup_sweep_on';
  end if;

  insert into public.kr8_admin_actions_log (action, detail)
  values (case when v = 1 then 'autopilot_paused' else 'autopilot_resumed' end, jsonb_build_object('paused', v = 1, 'by', auth.uid()));

  return jsonb_build_object('paused', v = 1, 'at', now());
end $$;
revoke all on function public.kr8_admin_pause_all_robots(boolean) from public, anon;
grant execute on function public.kr8_admin_pause_all_robots(boolean) to authenticated;

create or replace function public.kr8_admin_robot_undo(p_log_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l public.kr8_robot_log;
  ukind text;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  select * into l from public.kr8_robot_log where id = p_log_id for update;
  if l.id is null then raise exception 'KR8_BAD_ACTION'; end if;
  if l.undone_at is not null then
    return jsonb_build_object('ok', true, 'id', l.id, 'already_undone', true);
  end if;
  if l.undo is null or l.dry_run then raise exception 'KR8_NOTHING_TO_UNDO'; end if;

  ukind := coalesce(l.undo ->> 'kind', '');

  if ukind = 'dup_ghost' and (l.undo ->> 'dup_id') is not null then
    perform public.kr8_admin_dup_auto_undo((l.undo ->> 'dup_id')::uuid, 'undo');
  elsif ukind = 'unhide_post' and (l.undo ->> 'post_id') is not null then
    update public.kr8_posts
       set hidden      = coalesce((l.undo ->> 'prev_hidden')::boolean, false),
           status      = coalesce(l.undo ->> 'prev_status', status),
           review_note = l.undo ->> 'prev_note'
     where id = (l.undo ->> 'post_id')::uuid;
  elsif ukind = 'reopen_thread' and (l.undo ->> 'thread_id') is not null then
    update public.kr8_threads
       set status = coalesce(l.undo ->> 'prev_status', 'pending')
     where id = (l.undo ->> 'thread_id')::uuid;
  elsif ukind = 'unqueue_trash' and (l.undo ->> 'trash_id') is not null then
    delete from public.kr8_storage_trash
     where id = (l.undo ->> 'trash_id')::uuid and removed_at is null;
  elsif ukind = 'restore_robot_mode' and (l.undo ->> 'robot') is not null then
    update public.kr8_robot
       set mode = coalesce(l.undo ->> 'prev_mode', 'dry_run'), updated_at = now()
     where name = (l.undo ->> 'robot');
  elsif ukind = 'noop' then
    null;
  else
    raise exception 'KR8_NOTHING_TO_UNDO';
  end if;

  update public.kr8_robot_log
     set undone_at = now(),
         undone_by = auth.uid()
   where id = l.id;

  insert into public.kr8_admin_actions_log (action, detail)
  values ('robot_action_undone', jsonb_build_object('log_id', l.id, 'robot', l.robot, 'action', l.action, 'kind', ukind, 'by', auth.uid()));

  return jsonb_build_object('ok', true, 'id', l.id, 'kind', ukind);
end $$;
revoke all on function public.kr8_admin_robot_undo(bigint) from public, anon;
grant execute on function public.kr8_admin_robot_undo(bigint) to authenticated;

create or replace function public.kr8_admin_robot_run_now(p_name text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.kr8_robot;
  gate text;
  lid bigint;
  res jsonb;
  swept int := 0;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  select * into r from public.kr8_robot where name = p_name;
  if r.name is null then raise exception 'KR8_BAD_ACTION'; end if;

  if public.kr8_autopilot_paused() then
    raise exception 'KR8_AUTOPILOT_PAUSED';
  end if;

  if p_name = 'dup_sweep' and to_regprocedure('public.kr8_dup_robot_sweep()') is not null then
    swept := public.kr8_dup_robot_sweep();
    perform public.kr8_robot_beat('dup_sweep', true, jsonb_build_object('note', 'Sweep checked ' || swept || ' case(s)'));
    lid := public.kr8_robot_record('dup_sweep', 'run_past_sweep', 'past_data', jsonb_build_object('count', swept, 'dry_run', r.mode <> 'on'), null, r.mode <> 'on');
    return jsonb_build_object('ok', true, 'robot', 'dup_sweep', 'count', swept, 'log_id', lid);
  elsif p_name = 'health_watch' and to_regprocedure('public.kr8_robot_health_watch_run()') is not null then
    execute 'select public.kr8_robot_health_watch_run()' into res;
    return res;
  elsif p_name = 'self_fix' and to_regprocedure('public.kr8_robot_self_fix_run()') is not null then
    execute 'select public.kr8_robot_self_fix_run()' into res;
    return res;
  elsif p_name = 'protect' and to_regprocedure('public.kr8_robot_protect_run()') is not null then
    execute 'select public.kr8_robot_protect_run()' into res;
    return res;
  elsif p_name = 'growth_nudges' and to_regprocedure('public.kr8_robot_growth_nudges_run()') is not null then
    execute 'select public.kr8_robot_growth_nudges_run()' into res;
    return res;
  end if;

  gate := public.kr8_robot_can_act(p_name);
  perform public.kr8_robot_beat(p_name, true, jsonb_build_object('note', 'Manual pulse (' || gate || ')'));
  lid := public.kr8_robot_record(
    p_name,
    'manual_pulse',
    p_name,
    jsonb_build_object('gate', gate, 'mode', r.mode, 'note', 'Checked from Autopilot panel'),
    case when gate = 'on' then jsonb_build_object('kind', 'noop') else null end,
    gate <> 'on'
  );
  return jsonb_build_object('ok', true, 'robot', p_name, 'gate', gate, 'log_id', lid);
end $$;
revoke all on function public.kr8_admin_robot_run_now(text) from public, anon;
grant execute on function public.kr8_admin_robot_run_now(text) to authenticated;

-- ───────────────────────── kr8_admin_v2_snapshot: exact live-base 0095 body + additive 'autopilot' field ─────────────────────────
create or replace function public.kr8_admin_v2_snapshot(p_include_test boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d0 timestamptz := ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
  w0 timestamptz := public.kr8_week_start(now());
  r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  with acc as materialized (
    select u.id as user_id, public.kr8_admin_v2_kind(u.id) as kind, u.created_at as auth_at, u.email
    from auth.users u
    union all
    select m.user_id, public.kr8_admin_v2_kind(m.user_id), m.created_at, null
    from public.kr8_members m where not exists (select 1 from auth.users u where u.id = m.user_id)
  ),
  shown as materialized (select * from acc where p_include_test or kind in ('real', 'nocard')),
  lk as materialized (
    select l.a, l.b, l.reason, l.detail, l.first_at from public.kr8_account_links l
    where l.dismissed_at is null and l.a in (select user_id from shown) and l.b in (select user_id from shown)
  ),
  cl as materialized (
    select c.*, h.reason as hold_reason, h.decided, h.decided_at, h.face_dist, h.detail as hold_detail
    from public.kr8_reward_claims c left join public.kr8_claim_holds h on h.claim_id = c.id
    where (p_include_test or not c.is_test) and (c.member_id is null or c.member_id in (select user_id from shown))
  ),
  board as materialized (select b.* from public.kr8_week_board(w0, false) b),
  sc as materialized (
    select s.author, sum(s.l_local + s.l_trav)::int as likes, sum(s.s_local + s.s_trav)::int as saves, sum(s.opens)::int as opens, sum(s.score)::int as score
    from public.kr8_reel_scores(w0, w0 + interval '7 days', now(), false) s group by s.author
  ),
  ver as materialized (
    select distinct on (v.user_id) v.user_id, v.id, v.status, v.created_at, v.live_check ->> 'auto' as auto, v.reject_reason,
           case when v.selfie_deleted_at is null then v.selfie_path end as selfie_path
    from public.kr8_verifications v order by v.user_id, v.created_at desc
  ),
  ppl as (
    select a.user_id, a.kind, m.member_no, coalesce(m.first_name, '') as first_name, m.who, m.area, coalesce(m.created_at, a.auth_at) as joined_at,
           m.last_active_at, nullif(m.ref_code, '') as ref_code, nullif(m.src_code, '') as src_code, coalesce(m.verified, false) as verified,
           m.ig_handle, m.tiktok_handle, (m.photo is not null and m.photo <> '') as has_photo, m.photo_check,
           case when m.user_id is null and a.email is not null then left(split_part(a.email, '@', 1), 2) || '…@' || split_part(a.email, '@', 2) end as email_hint,
           exists (select 1 from public.kr8_line_links k where k.user_id = a.user_id) as line
    from shown a left join public.kr8_members m on m.user_id = a.user_id
  )
  select jsonb_build_object(
    'at', now(), 'day_start', d0, 'week_start', w0, 'include_test', p_include_test,
    'counts', (select jsonb_build_object(
        'real', count(*) filter (where kind = 'real'),
        'real_today', count(*) filter (where kind = 'real' and m.created_at >= d0),
        'test', count(*) filter (where kind = 'test'), 'team', count(*) filter (where kind = 'team'),
        'ghost', count(*) filter (where kind = 'ghost'), 'admin', count(*) filter (where kind = 'admin'),
        'nocard', count(*) filter (where kind = 'nocard'))
        from acc a left join public.kr8_members m on m.user_id = a.user_id),
    'people', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', p.user_id, 'kind', p.kind, 'no', p.member_no, 'name', p.first_name, 'who', p.who, 'area', p.area,
        'joined_at', p.joined_at, 'last_active_at', p.last_active_at, 'ref', p.ref_code, 'src', p.src_code, 'verified', p.verified,
        'ig', p.ig_handle, 'tt', p.tiktok_handle, 'has_photo', p.has_photo, 'photo_check', p.photo_check, 'email_hint', p.email_hint, 'line', p.line,
        'trust', case when p.kind in ('nocard', 'admin', 'team') then null else public.kr8_trust(p.user_id) end,
        'check', (select jsonb_build_object('id', v.id, 'status', v.status, 'at', v.created_at, 'auto', v.auto, 'reason', v.reject_reason, 'selfie_path', v.selfie_path) from ver v where v.user_id = p.user_id),
        'reels', (select jsonb_build_object(
                    'live', count(*) filter (where x.status = 'approved' and not x.hidden),
                    'waiting', count(*) filter (where x.status = 'pending' and not x.hidden),
                    'hidden', count(*) filter (where x.status = 'hidden' or x.hidden),
                    'board_off', count(*) filter (where x.board_off and x.status = 'approved' and not x.hidden),
                    'board_off_reason', max(x.board_off_reason))
                  from public.kr8_posts x where x.author = p.user_id and x.kind = 'reel'),
        'claims', (select jsonb_build_object('n', count(*), 'paid', count(*) filter (where c.status = 'assigned'),
                    'held', count(*) filter (where c.held and c.status = 'pending'), 'thb', coalesce(sum(c.amount_thb) filter (where c.status = 'assigned'), 0),
                    'first_at', min(c.created_at))
                   from cl c where c.member_id = p.user_id),
        'links', coalesce((select jsonb_agg(jsonb_build_object('user_id', o.user_id, 'no', om.member_no, 'name', om.first_name, 'reason', l.reason,
                    'dist', (l.detail ->> 'dist')::real, 'sface_sim', (l.detail ->> 'sface_sim')::real, 'at', l.first_at) order by l.first_at)
                  from lk l cross join lateral (select case when l.a = p.user_id then l.b else l.a end as user_id) o
                  left join public.kr8_members om on om.user_id = o.user_id
                  where p.user_id in (l.a, l.b)), '[]'::jsonb),
        'shared_net', (select count(distinct c2.member_id) from cl c1 join cl c2 on c2.member_id <> c1.member_id
                        and ((c1.ip_hash is not null and c1.ip_hash = c2.ip_hash) or (c1.device is not null and c1.device = c2.device))
                       where c1.member_id = p.user_id),
        'refs', (select count(*) from public.kr8_members r where p.member_no is not null and lower(coalesce(r.ref_code, '')) ~ ('^k0*' || p.member_no || '$')),
        'board', (select jsonb_build_object('rank', b.rk, 'rings', b.rings) from board b where b.member_id = p.user_id),
        'score', (select jsonb_build_object('likes', s.likes, 'saves', s.saves, 'opens', s.opens, 'score', s.score) from sc s where s.author = p.user_id)
      ) order by p.joined_at desc) from ppl p), '[]'::jsonb),
    'claims', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'user_id', c.member_id, 'no', coalesce(m.member_no, c.member_no_copy), 'name', m.first_name, 'brand', c.brand, 'amount', c.amount_thb,
        'status', c.status, 'held', c.held, 'used', c.used_at is not null, 'created_at', c.created_at, 'assigned_at', c.assigned_at, 'is_test', c.is_test,
        'hold_reason', c.hold_reason, 'decided', c.decided, 'decided_at', c.decided_at, 'face_dist', c.face_dist,
        'hold_others', c.hold_detail -> 'others', 'joined_at', m.created_at,
        'prize', (select jsonb_build_object('kind', z.kind, 'week', z.week, 'rank', z.rank) from public.kr8_prizes z where z.id = c.prize_id)
      ) order by c.created_at desc) from cl c left join public.kr8_members m on m.user_id = c.member_id), '[]'::jsonb),
    'codes', coalesce((select jsonb_agg(jsonb_build_object('brand', k.brand, 'amount', k.amount_thb, 'available', k.av, 'assigned', k.asg, 'used', k.used) order by k.brand, k.amount_thb desc)
        from (select brand, amount_thb, count(*) filter (where status = 'available')::int av, count(*) filter (where status = 'assigned')::int asg,
                     count(*) filter (where status not in ('available', 'assigned'))::int used
              from public.kr8_reward_codes where p_include_test or not is_test group by 1, 2) k), '[]'::jsonb),
    'board', jsonb_build_object('week_start', w0, 'paid_ranks', public.kr8_paid_ranks(), 'floor', public.kr8_rcfg('min_rings_for_paid_seat', 25),
        'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', b.rk, 'user_id', b.member_id, 'rings', b.rings, 'prize', public.kr8_prize_for(b.rk),
                     'likes', s.likes, 'saves', s.saves, 'opens', s.opens, 'is_new', m.created_at >= w0, 'no', m.member_no, 'name', m.first_name) order by b.rk)
                   from board b left join sc s on s.author = b.member_id left join public.kr8_members m on m.user_id = b.member_id where b.rk <= 20), '[]'::jsonb)),
    'pending', jsonb_build_object(
        'reels', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'user_id', x.author, 'at', x.created_at, 'poster_path', x.poster_path, 'video_path', x.video_path, 'body', left(x.body, 140)) order by x.created_at)
                   from public.kr8_posts x where x.kind = 'reel' and x.status = 'pending' and not x.hidden and x.author in (select user_id from shown)), '[]'::jsonb),
        'checks', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'user_id', v.user_id, 'at', v.created_at, 'auto', v.live_check ->> 'auto',
                     'review', v.live_check -> 'review', 'selfie_path', v.selfie_path) order by v.created_at)
                   from public.kr8_verifications v where v.status = 'pending' and v.user_id in (select user_id from shown)), '[]'::jsonb),
        'reports', (select count(*) from public.kr8_reports t where t.handled_at is null),
        'places', (select count(*) from public.kr8_places pl where pl.status = 'pending')),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object('kind', o.kind, 'subject', o.subject, 'at', o.created_at, 'sent', o.sent_at is not null, 'error', o.last_error) order by o.created_at desc)
        from (select * from public.kr8_outbox order by created_at desc limit 20) o), '[]'::jsonb),
    'dups_auto', public.kr8_admin_dups_auto(14),
    'autopilot', jsonb_build_object(
        'paused', public.kr8_autopilot_paused(),
        'actions_today', (select count(*)::int from public.kr8_robot_log l where not l.dry_run and l.at >= d0),
        'dry_runs_today', (select count(*)::int from public.kr8_robot_log l where l.dry_run and l.at >= d0),
        'stale_heartbeats', (select count(*)::int from public.kr8_heartbeat h
                              where (h.last_beat is not null and h.last_beat < now() - make_interval(secs => greatest(h.every_sec * 2, 1200)))
                                 or h.last_ok = false))
  ) into r;
  return r;
end $$;
revoke all on function public.kr8_admin_v2_snapshot(boolean) from public, anon;
grant execute on function public.kr8_admin_v2_snapshot(boolean) to authenticated;

commit;
