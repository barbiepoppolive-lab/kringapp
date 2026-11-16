-- SCRATCH DATABASE ONLY: the minimum of Supabase + Kring that 0059 needs, so 0059_push_test.sql can run on a local Postgres.
-- psql -f 0059_push_stub.sql -f ../migrations/0059_kr8_push.sql -f 0059_push_test.sql
do $$ begin create role anon; exception when others then null; end $$;
do $$ begin create role authenticated; exception when others then null; end $$;
do $$ begin create role service_role; exception when others then null; end $$;
create schema if not exists auth; create schema if not exists vault; create schema if not exists net;
grant usage on schema public, auth to anon, authenticated, service_role;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true), '')::uuid $$;
grant execute on function auth.uid() to public;
create table if not exists vault.decrypted_secrets (name text, decrypted_secret text);
insert into vault.decrypted_secrets values ('push_hook_secret', 'test-secret');
create table if not exists net.calls (url text, headers jsonb, body jsonb, at timestamptz default now());
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language sql as $$ insert into net.calls (url, headers, body) values (url, headers, body) returning 1::bigint $$;
create table if not exists public.kr8_members (user_id uuid primary key references auth.users(id), first_name text, member_no int);
create table if not exists public.kr8_verifications (id uuid primary key, user_id uuid, status text);
create table if not exists public.kr8_reward_claims (id uuid primary key, member_id uuid, status text);
create table if not exists public.kr8_posts (id uuid primary key, author uuid, kind text, status text, hidden boolean default false);
create or replace function public.kr8_is_admin() returns boolean language sql stable as $$ select current_setting('t.admin', true) = '1' $$;
insert into auth.users values ('11111111-1111-1111-1111-111111111111', 'a@x'), ('22222222-2222-2222-2222-222222222222', 'b@x') on conflict do nothing;
insert into public.kr8_members values ('11111111-1111-1111-1111-111111111111', 'Ploy', 16), ('22222222-2222-2222-2222-222222222222', 'Ton', 17) on conflict do nothing;
