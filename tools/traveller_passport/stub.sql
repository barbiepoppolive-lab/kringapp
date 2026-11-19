-- 0138 SQL checks on a throwaway local Postgres (NOT the live DB): createdb t; psql -d t -f stub.sql; psql -d t -f ../../supabase/migrations/0138_kr8_traveller_passport.sql (twice = re-run); psql -d t -f checks.sql → all pass
-- minimal stand-in for the live schema pieces 0138 touches
do $$ begin create role anon; exception when duplicate_object then null; end $$; do $$ begin create role authenticated; exception when duplicate_object then null; end $$; do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema auth; create schema storage;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, created_at timestamptz default now());
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create table public.kr8_members (user_id uuid primary key references auth.users(id) on delete cascade, first_name text, who text not null default 'local' check (who in ('local','traveller')),
  verified boolean default false, member_no int, photo text, ghost boolean not null default false, here_until timestamptz, updated_at timestamptz default now());
create function public.kr8_has_card() returns boolean language sql stable as $$ select exists (select 1 from public.kr8_members where user_id = auth.uid()) $$;
create table public.kr8_storage_trash (id uuid primary key default gen_random_uuid(), bucket text not null, name text not null, user_id uuid,
  queued_at timestamptz not null default now(), removed_at timestamptz, unique (bucket, name));
create function public.kr8_is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.admin', true), '') = '1' $$;
create table public.push_log (kind text, to_user uuid, title text, body text, url text, ref uuid);
create function public.kr8_push_queue(p_kind text, p_user uuid, p_all boolean, p_title text, p_body text, p_url text, p_ref uuid, p_line boolean default true)
returns jsonb language plpgsql as $$ begin insert into public.push_log values (p_kind, p_user, p_title, p_body, p_url, p_ref); return '{}'::jsonb; end $$;
-- the card save path as on live (0070 body, trimmed to the who part)
create function public.kr8_save_card_who(p_who text) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); w text;
begin
  insert into public.kr8_members (user_id, first_name, who) values (uid, 'X', coalesce(p_who, 'local'))
  on conflict (user_id) do update set who = excluded.who, updated_at = now() returning who into w;
  return w;
end $$;
-- same signature and the same INSERT … ON CONFLICT DO UPDATE SET who = excluded.who as live kr8_save_card (checks trimmed)
create function public.kr8_save_card(p_first_name text, p_langs text[], p_bio text, p_area text, p_who text, p_photo text default null, p_age_ok boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); w text;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if coalesce(p_who, 'local') not in ('local','traveller') then raise exception 'KR8_BAD_WHO'; end if;
  insert into public.kr8_members (user_id, first_name, who) values (uid, btrim(p_first_name), coalesce(p_who, 'local'))
  on conflict (user_id) do update set first_name = excluded.first_name, who = excluded.who, updated_at = now() returning who into w;
  return jsonb_build_object('who', w);
end $$;
