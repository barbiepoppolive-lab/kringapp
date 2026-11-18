-- Throwaway LOCAL database only: the smallest copy of the live tables/functions that 0113 reads, so 0113 + its test can run
-- without touching live or TEST. Bodies follow 0043 / 0066 / 0082 / 0110; kr8_is_admin is a stand-in (live-only function).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, created_at timestamptz not null default now());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid $$;
create table if not exists public.kr6_staff (user_id uuid primary key, role text not null default 'ops');
create table if not exists public.kr8_admin_emails (email text primary key);
create table if not exists public.kr8_team_accounts (user_id uuid primary key);
create table if not exists public.kr8_mirror_accounts (user_id uuid primary key);
create table if not exists public.kr8_members (user_id uuid primary key, member_no int, first_name text, ref_code text, src_code text,
  ghost boolean not null default false, verified boolean not null default false, created_at timestamptz not null default now());
create table if not exists public.kr8_ref_credits (user_id uuid primary key, ref_code text not null, credited_by_email text, credited_at timestamptz default now());
create table if not exists public.kr8_posts (id uuid primary key default gen_random_uuid(), author uuid, kind text not null default 'reel',
  status text not null default 'pending', hidden boolean default false, created_at timestamptz not null default now());
create table if not exists public.kr8_share_opens (id uuid primary key default gen_random_uuid(), post_id uuid, bkk_date date not null default ((now() at time zone 'Asia/Bangkok')::date),
  session text not null default 's', device text not null default 'd', referrer text, ua text, country text, source text not null default 'other', ok boolean not null);
create table if not exists public.link_visits (id bigserial primary key, ref text, path text, referrer text, session_id text, country text, user_agent text,
  created_at timestamptz not null default now());
create or replace function public.kr8_is_admin() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.kr6_staff s where s.user_id = auth.uid() and s.role = 'admin')
      or exists (select 1 from auth.users u join public.kr8_admin_emails a on a.email = lower(u.email) where u.id = auth.uid()) $$;
create or replace function public.kr8_is_test_member(p_user uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select m.first_name ilike '%test%' or lower(coalesce(m.ref_code, '')) in ('test1', 'perf', 'demo')
      or lower(coalesce(m.src_code, '')) in ('test1', 'perf', 'demo')
      or exists (select 1 from auth.users u where u.id = m.user_id and lower(coalesce(u.email, '')) like 'demo-%@kringapp.com')
    from public.kr8_members m where m.user_id = p_user), false) $$;
create or replace function public.kr8_is_team(p uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p is not null and exists (select 1 from public.kr8_team_accounts t where t.user_id = p) $$;
create or replace function public.kr8_is_mirror(p uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p is not null and exists (select 1 from public.kr8_mirror_accounts x where x.user_id = p) $$;
create or replace function public.kr8_admin_v2_kind(p uuid) returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when not exists (select 1 from public.kr8_members m where m.user_id = p) then
      case when exists (select 1 from public.kr6_staff s where s.user_id = p and s.role = 'admin')
             or exists (select 1 from auth.users u join public.kr8_admin_emails a on a.email = lower(u.email) where u.id = p)
           then 'admin' else 'nocard' end
    when public.kr8_is_team(p) then 'team'
    when public.kr8_is_test_member(p) then 'test'
    when exists (select 1 from public.kr8_members g where g.user_id = p and g.ghost) then 'ghost'
    else 'real' end $$;
