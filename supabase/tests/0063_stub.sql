-- SCRATCH DATABASE ONLY: the minimum of Supabase + Kring that 0063 needs, so 0063_test.sql can run on a local Postgres.
-- psql -v ON_ERROR_STOP=1 -f 0063_stub.sql -f ../migrations/0058_kr8_client_events.sql -f ../migrations/0063_kr8_admin_problems_recruiters.sql -f 0063_test.sql
do $$ begin create role anon; exception when others then null; end $$;
do $$ begin create role authenticated; exception when others then null; end $$;
create schema if not exists auth;
grant usage on schema public, auth to anon, authenticated;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true), '')::uuid $$;
grant execute on function auth.uid() to public;
create table if not exists public.kr8_members (user_id uuid primary key references auth.users(id), first_name text, member_no int,
  ref_code text, src_code text, verified boolean default false, created_at timestamptz default now());
create table if not exists public.kr8_posts (id uuid primary key default gen_random_uuid(), author uuid, kind text, status text,
  hidden boolean default false, created_at timestamptz default now());
create or replace function public.kr8_is_admin() returns boolean language sql stable as $$ select current_setting('t.admin', true) = '1' $$;
create or replace function public.kr8_is_test_member(p_user uuid) returns boolean language sql stable as $$
  select coalesce((select m.first_name ilike '%test%' from public.kr8_members m where m.user_id = p_user), false) $$;
