-- Throwaway LOCAL database only: the smallest copy of the live tables/functions 0136 + 0137 read, so their tests run without
-- touching live. kr8_robot / kr8_robot_log / kr8_heartbeat / kr8_robot_alerts and their helpers are copied from 0098 / 0099.
-- Run: tools/robots/run_local_test.sh
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists vault;
create schema if not exists storage;
create table vault.secrets (name text primary key, secret text);
create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;
insert into vault.secrets values ('share_open_key', 'testkey');
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);

create table public.kr8_rings_config (key text primary key, value int not null, note text);
create or replace function public.kr8_rcfg(k text, dflt int default 0) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select value from public.kr8_rings_config where key = k), dflt) $$;
create table public.kr8_members (user_id uuid primary key, member_no int, first_name text);
create table public.kr8_posts (id uuid primary key default gen_random_uuid(), author uuid, kind text not null default 'reel',
  area text, body text, status text not null default 'approved', hidden boolean not null default false,
  board_off boolean not null default false, board_off_reason text, video_path text, created_at timestamptz not null default now());
create table public.kr8_reel_links (short text primary key, post_id uuid not null unique);
create table public.kr8_share_opens (id uuid primary key default gen_random_uuid(), post_id uuid not null,
  bkk_date date not null default ((now() at time zone 'Asia/Bangkok')::date), session text not null, device text not null,
  referrer text, ua text, country text, source text not null default 'other', ok boolean not null, why text, opener uuid,
  created_at timestamptz not null default now());

-- 0098 / 0099 (bodies as in the repo)
create table public.kr8_robot (name text primary key, title text not null, note text not null default '', schedule text not null default 'manual',
  mode text not null default 'dry_run' check (mode in ('on', 'off', 'dry_run')), daily_cap int not null default 50,
  last_run timestamptz, last_ok boolean, last_note text, updated_at timestamptz not null default now());
create table public.kr8_robot_log (id bigint generated always as identity primary key, robot text not null references public.kr8_robot(name),
  action text not null, target text, detail jsonb not null default '{}'::jsonb, undo jsonb, undone_at timestamptz, undone_by uuid,
  dry_run boolean not null default false, at timestamptz not null default now());
create table public.kr8_heartbeat (job text primary key, every_sec int not null default 900, last_beat timestamptz,
  last_ok boolean not null default true, detail jsonb not null default '{}'::jsonb);
create table public.kr8_robot_alerts (id uuid primary key default gen_random_uuid(), dedupe_key text not null unique,
  robot text not null references public.kr8_robot(name), severity text not null, title text not null, body text not null default '',
  href text not null default '#inbox', detail jsonb not null default '{}'::jsonb, first_at timestamptz not null default now(),
  last_at timestamptz not null default now(), cleared_at timestamptz, cleared_by text);
create or replace function public.kr8_robot_can_act(p_robot text) returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.kr8_robot; used int := 0; d0 timestamptz := ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
begin
  if public.kr8_rcfg('autopilot_paused', 0) = 1 then return 'off'; end if;
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
create or replace function public.kr8_robot_beat(p_job text, p_ok boolean default true, p_detail jsonb default '{}'::jsonb, p_every_sec int default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.kr8_heartbeat (job, every_sec, last_beat, last_ok, detail) values (p_job, coalesce(p_every_sec, 900), now(), coalesce(p_ok, true), coalesce(p_detail, '{}'))
  on conflict (job) do update set last_beat = now(), last_ok = coalesce(p_ok, true), detail = coalesce(p_detail, '{}');
  update public.kr8_robot set last_run = now(), last_ok = coalesce(p_ok, true), last_note = coalesce(p_detail ->> 'note', last_note) where name = p_job;
end $$;
create or replace function public.kr8_robot_record(p_robot text, p_action text, p_target text default null, p_detail jsonb default '{}'::jsonb,
  p_undo jsonb default null, p_dry_run boolean default false) returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare lid bigint;
begin
  insert into public.kr8_robot_log (robot, action, target, detail, undo, dry_run)
  values (p_robot, left(btrim(p_action), 80), left(p_target, 120), coalesce(p_detail, '{}'), p_undo, coalesce(p_dry_run, false)) returning id into lid;
  return lid;
end $$;
create or replace function public.kr8_alert_raise(p_key text, p_robot text, p_severity text, p_title text, p_body text default '',
  p_href text default '#inbox', p_detail jsonb default '{}'::jsonb) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare aid uuid;
begin
  insert into public.kr8_robot_alerts (dedupe_key, robot, severity, title, body, href, detail)
  values (left(btrim(p_key), 120), p_robot, p_severity, left(btrim(p_title), 160), left(coalesce(p_body, ''), 500), p_href, coalesce(p_detail, '{}'))
  on conflict (dedupe_key) do update set title = excluded.title, body = excluded.body, detail = excluded.detail, last_at = now(), cleared_at = null
  returning id into aid;
  return aid;
end $$;
create or replace function public.kr8_schedule_job(p_job text, p_cron text, p_sql text) returns boolean language sql as $$ select false $$;
