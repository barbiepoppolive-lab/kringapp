-- 0076 (duplicate faces). SCRATCH POSTGRES ONLY, never the live project. Self-contained: run on an EMPTY database:
--   createdb facet && psql -X -q -d facet -v ON_ERROR_STOP=0 -f supabase/tests/0076_test.sql | grep -E 'PASS|FAIL'
-- It creates small stand-ins for the Supabase pieces 0076 uses (auth.users, vault, net.http_post, push queue, 0066 tables),
-- applies 0076 twice (re-runnable), then checks: face check vs face check ≤ 0.50 = LINK; any pair with a card photo = FLAG only;
-- the strongest kind of match wins in kr8_face_nearest; founder push + email; admin banner data; one card code per member.
\set QUIET on
\pset tuples_only on
\pset format unaligned
create extension if not exists pgcrypto;
create schema if not exists auth; create schema if not exists vault; create schema if not exists net; create schema if not exists extensions;
do $$ begin create role authenticated; exception when others then null; end $$;
do $$ begin create role anon; exception when others then null; end $$;
do $$ begin create role service_role; exception when others then null; end $$;
create table auth.users (id uuid primary key, email text, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid $$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
create table public.kr8_members (user_id uuid primary key references auth.users(id), member_no int, first_name text, photo text, verified boolean default false, ghost boolean default false, created_at timestamptz default now());
create table public.kr8_verifications (id uuid primary key default gen_random_uuid(), user_id uuid, selfie_path text, selfie_deleted_at timestamptz, consent_version text, status text default 'pending', created_at timestamptz default now());
create table public.kr8_rings_config (key text primary key, value int, note text);
create function public.kr8_rcfg(k text, d int) returns int language sql stable as $$ select coalesce((select value from public.kr8_rings_config where key=k), d) $$;
create function public.kr8_is_test_member(p uuid) returns boolean language sql stable as $$ select false $$;
create table public.kr8_team_accounts (user_id uuid primary key);
create function public.kr8_is_team(p uuid) returns boolean language sql stable as $$ select exists (select 1 from public.kr8_team_accounts where user_id=p) $$;
create table public.kr8_admin_emails (email text);
create function public.kr8_is_admin() returns boolean language sql stable as $$ select exists (select 1 from auth.users u join public.kr8_admin_emails e on e.email=u.email where u.id=auth.uid()) $$;
create table public.push_log (who uuid, title text, body text);
create function public.kr8_push_queue(a text, u uuid, b boolean, t text, body text, url text, ref uuid, c boolean) returns void language sql as $$ insert into public.push_log values (u, t, body) $$;
create view vault.decrypted_secrets as select 'notify_hook_secret'::text name, 'x'::text decrypted_secret;
create table public.http_log (url text, body jsonb);
create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int) returns bigint language sql as $$ insert into public.http_log values (url, body) returning 1::bigint $$;
-- 0066 pieces used by 0076
create table public.kr8_face_prints (id bigserial primary key, user_id uuid not null references auth.users(id) on delete cascade, descriptor real[] not null, source text not null, verification_id uuid, created_at timestamptz not null default now(),
  constraint kr8_face_prints_source check (source in ('verify', 'selfie', 'claim')));
create table public.kr8_account_links (a uuid not null, b uuid not null, reason text not null, detail jsonb not null default '{}', first_at timestamptz default now(), last_at timestamptz default now(), dismissed_at timestamptz, dismissed_by uuid,
  primary key (a,b,reason), constraint kr8_account_links_order check (a < b), constraint kr8_account_links_reason check (reason in ('face','device','network','line')));
create function public.kr8_face_dist(x real[], y real[]) returns double precision language sql immutable as $$ select sqrt(sum((u - v)::double precision * (u - v)::double precision)) from unnest(x, y) as t(u, v) $$;
create function public.kr8_face_ok(d real[]) returns boolean language sql immutable as $$ select d is not null and array_length(d,1)=128 $$;
create function public.kr8_linked(x uuid, y uuid) returns boolean language sql stable as $$ select exists (select 1 from public.kr8_account_links l where l.a=least(x,y) and l.b=greatest(x,y) and l.dismissed_at is null and l.reason in ('face','device')) $$;
\i supabase/migrations/0076_kr8_face_dupes.sql
\i supabase/migrations/0076_kr8_face_dupes.sql
create or replace function pg_temp.ok(c boolean, n text) returns text language sql as $$ select (case when c then 'PASS ' else 'FAIL ' end) || n $$;
-- a fake face code: seed = the person; d moves it exactly d away (along the first number)
create or replace function pg_temp.face(seed int, d real default 0) returns real[] language sql as $$
  select array_agg(((('x' || substr(md5(seed || ':' || i), 1, 8))::bit(32)::int / 2147483648.0) * 0.09 + case when i = 1 then d else 0 end)::real order by i) from generate_series(1, 128) i $$;
grant execute on function pg_temp.face(int, real) to authenticated;
grant usage on schema public to authenticated;
insert into auth.users (id, email) select ('00000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid, case when g = 99 then 'boss@x' end from unnest(array[10, 11, 12, 13, 99]) g;
insert into public.kr8_admin_emails values ('boss@x');
insert into public.kr8_members (user_id, member_no, first_name, photo) select ('00000000-0000-4000-8000-0000000000' || g)::uuid, g, 'M' || g, 'data:x' from unnest(array[10, 11, 12, 13]) g;
-- #10 verified long ago: selfie code (the 17 Nov backfill) ; #12: card code of someone else who looks alike
insert into public.kr8_face_prints (user_id, descriptor, source) values ('00000000-0000-4000-8000-000000000010', pg_temp.face(1), 'selfie');
insert into public.kr8_face_prints (user_id, descriptor, source) values ('00000000-0000-4000-8000-000000000012', pg_temp.face(1, 0.45), 'card');
insert into public.kr8_verifications (id, user_id, consent_version) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000011', 'face-2026-11-17');
select pg_temp.face(1, 0.40)::text as c11 \gset
select pg_temp.face(1, 0.49)::text as v11 \gset
-- #11 (2nd account of #10) saves a card photo, then sends a face check
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000011"}';
set role authenticated;
select pg_temp.ok(public.kr8_save_card_print(:'c11'::real[]), 'member saves card code');
select pg_temp.ok(public.kr8_save_card_print(:'c11'::real[]), 'member saves card code again');
reset role;
select pg_temp.ok((select count(*) = 1 from public.kr8_face_prints where user_id = '00000000-0000-4000-8000-000000000011' and source = 'card'), 'one card code per member');
select pg_temp.ok(not public.kr8_linked('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011')
  and exists (select 1 from public.kr8_account_links where reason = 'face_maybe' and a = '00000000-0000-4000-8000-000000000010' and b = '00000000-0000-4000-8000-000000000011'),
  'card photo 0.40 from a selfie = flag only (never a link)');
select pg_temp.ok(exists (select 1 from public.push_log where title = 'Same person? · card photo' or title = 'Looks alike? · card photo'), 'push for the card look-alike');
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000011"}';
set role authenticated;
select pg_temp.ok(public.kr8_save_face_print(:'v11'::real[]), 'member face check code saved');
reset role;
select pg_temp.ok(public.kr8_linked('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011'), 'face check 0.49 from a selfie = LINK');
select pg_temp.ok((select strength = 'same' and member_no = 10 from public.kr8_face_nearest('00000000-0000-4000-8000-000000000011', 1)), 'nearest = #10, "same" beats the closer card pair');
select pg_temp.ok(exists (select 1 from public.push_log where title = 'Same person? · face check' and body like 'M11 #11 looks like M10 #10 · 0.49%'), 'push: M11 #11 looks like M10 #10 · 0.49');
select pg_temp.ok(exists (select 1 from public.http_log where url like '%notify-new-member' and body ->> 'table' = 'kr8_face_lookalike' and body -> 'record' ->> 'other_no' = '10'), 'email hook');
select pg_temp.ok(not public.kr8_linked('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000010'), 'card vs selfie look-alike #12 never linked');
-- admin
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000099"}';
select pg_temp.ok((select x -> '00000000-0000-4000-8000-0000000000f1' -> 'matches' -> 0 ->> 'member_no' = '10' and (x -> '00000000-0000-4000-8000-0000000000f1' ->> 'has_print')::boolean
  from (select public.kr8_admin_verify_lookalikes(array['00000000-0000-4000-8000-0000000000f1'::uuid]) x) q), 'admin banner: looks like #10, has a code');
select pg_temp.ok((select public.kr8_admin_face_backfill_todo() -> 'cards' @> '[{"member_no": 13}]'), 'backfill list: #13 card has no code');
select pg_temp.face(5)::text as f13 \gset
select pg_temp.ok((select jsonb_array_length(public.kr8_admin_save_face_print('00000000-0000-4000-8000-000000000013', :'f13'::real[], 'backfill-card')) = 0), 'admin backfill-card: a new face has no look-alikes');
select pg_temp.ok(public.kr8_admin_face_backfill_todo() is not null, 'admin can list');
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000011"}';
set role authenticated;
do $$ begin perform public.kr8_admin_verify_lookalikes(null); raise exception 'no error'; exception when others then
  perform set_config('kr8.t', sqlerrm, false); end $$;
reset role;
select pg_temp.ok(current_setting('kr8.t') like '%KR8_ADMIN_ONLY%' or current_setting('kr8.t') like '%permission denied%', 'members cannot call admin RPCs');
set role authenticated;
do $$ begin perform public.kr8_face_nearest('00000000-0000-4000-8000-000000000010', 3); raise exception 'no error'; exception when others then
  perform set_config('kr8.t', sqlerrm, false); end $$;
reset role;
select pg_temp.ok(current_setting('kr8.t') like '%permission denied%', 'members cannot read look-alikes');
