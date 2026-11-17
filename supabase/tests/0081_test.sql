-- 0081 (instant face check). SCRATCH POSTGRES ONLY, never the live project. Self-contained: run on an EMPTY database:
--   createdb f81 && psql -X -q -d f81 -v ON_ERROR_STOP=0 -f supabase/tests/0081_test.sql | grep -E 'PASS|FAIL'
-- Needs pgvector on the scratch server. Stand-ins as in 0076_test.sql, then 0076 + 0081 (0081 twice: re-runnable).
-- Embeddings are made-up unit vectors with an exact cosine: mix(a, b, c) has cosine c with axis a.
-- It creates small stand-ins for the Supabase pieces 0076 uses (auth.users, vault, net.http_post, push queue, 0066 tables),
-- applies 0076 twice (re-runnable), then checks: face check vs face check ≤ 0.50 = LINK; any pair with a card photo = FLAG only;
-- the strongest kind of match wins in kr8_face_nearest; founder push + email; admin banner data; one card code per member.
\set QUIET on
\pset tuples_only on
\pset format unaligned
create extension if not exists pgcrypto;
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create schema if not exists auth; create schema if not exists vault; create schema if not exists net; create schema if not exists extensions;
do $$ begin create role authenticated; exception when others then null; end $$;
do $$ begin create role anon; exception when others then null; end $$;
do $$ begin create role service_role; exception when others then null; end $$;
create table auth.users (id uuid primary key, email text, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid $$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
create table public.kr8_members (user_id uuid primary key references auth.users(id), member_no int, first_name text, photo text, verified boolean default false, ghost boolean default false, created_at timestamptz default now(), updated_at timestamptz);
create table public.kr8_verifications (id uuid primary key default gen_random_uuid(), user_id uuid, selfie_path text, selfie_deleted_at timestamptz, consent_version text, status text default 'pending', created_at timestamptz default now(), live_check jsonb not null default '{}', reject_reason text, reviewed_at timestamptz, reviewed_by uuid);
create unique index on public.kr8_verifications (user_id) where status = 'pending';
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
create schema if not exists storage; create table storage.objects (bucket_id text, name text);
create table public.kr8_storage_trash (id uuid primary key default gen_random_uuid(), bucket text, name text, user_id uuid, queued_at timestamptz default now(), removed_at timestamptz, unique (bucket, name));
create function public.kr8_claim_photos_expire() returns int language sql as $$ select 0 $$;
-- 0066 pieces used by 0076
create table public.kr8_face_prints (id bigserial primary key, user_id uuid not null references auth.users(id) on delete cascade, descriptor real[] not null, source text not null, verification_id uuid, created_at timestamptz not null default now(),
  constraint kr8_face_prints_source check (source in ('verify', 'selfie', 'claim')));
create table public.kr8_account_links (a uuid not null, b uuid not null, reason text not null, detail jsonb not null default '{}', first_at timestamptz default now(), last_at timestamptz default now(), dismissed_at timestamptz, dismissed_by uuid,
  primary key (a,b,reason), constraint kr8_account_links_order check (a < b), constraint kr8_account_links_reason check (reason in ('face','device','network','line')));
create function public.kr8_face_dist(x real[], y real[]) returns double precision language sql immutable as $$ select sqrt(sum((u - v)::double precision * (u - v)::double precision)) from unnest(x, y) as t(u, v) $$;
create function public.kr8_face_ok(d real[]) returns boolean language sql immutable as $$ select d is not null and array_length(d,1)=128 $$;
create function public.kr8_linked(x uuid, y uuid) returns boolean language sql stable as $$ select exists (select 1 from public.kr8_account_links l where l.a=least(x,y) and l.b=greatest(x,y) and l.dismissed_at is null and l.reason in ('face','device')) $$;
\i supabase/migrations/0076_kr8_face_dupes.sql
\i supabase/migrations/0081_kr8_instant_face_check.sql
\i supabase/migrations/0081_kr8_instant_face_check.sql
create or replace function pg_temp.ok(c boolean, n text) returns text language sql as $$ select (case when c then 'PASS ' else 'FAIL ' end) || n $$;
grant usage on schema public to authenticated;
create or replace function pg_temp.mix(a int, b int, c float8) returns real[] language sql as $$
  select array_agg((case when i = a then c when i = b then sqrt(1 - c * c) else 0 end)::real order by i) from generate_series(1, 128) i $$;
create or replace function pg_temp.ax(a int) returns real[] language sql as $$ select pg_temp.mix(a, a + 1, 1) $$;
create or replace function pg_temp.u(g int) returns uuid language sql as $$ select ('00000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid $$;
create or replace function pg_temp.sp(g int, k int) returns text language sql as $$ select pg_temp.u(g)::text || '/' || ('00000000-0000-4000-8000-0000000001' || lpad(k::text, 2, '0')) || '.jpg' $$;
insert into auth.users (id, email, created_at) select pg_temp.u(g), null, now() - (100 - g) * interval '1 day' from generate_series(20, 29) g;
insert into auth.users (id, email) values (pg_temp.u(99), 'boss@x');
insert into public.kr8_admin_emails values ('boss@x');
insert into public.kr8_members (user_id, member_no, first_name, photo) select pg_temp.u(g), g, 'M' || g, 'data:x' from generate_series(20, 29) g;
-- #20: older member, approved new check (axis 1)
insert into public.kr8_verifications (id, user_id, consent_version, status) values ('00000000-0000-4000-8000-0000000000a0', pg_temp.u(20), 'face-2026-11-17d', 'approved');
insert into public.kr8_face_vectors (user_id, emb, source, verification_id) values (pg_temp.u(20), pg_temp.ax(1)::extensions.vector, 'check', '00000000-0000-4000-8000-0000000000a0');
-- #27 (newer than #26): a face check on axis 7 · #28: a CARD photo on axis 8 · #25: old ✓ (10 Nov), nothing comparable
insert into public.kr8_face_vectors (user_id, emb, source) values (pg_temp.u(27), pg_temp.ax(7)::extensions.vector, 'check'), (pg_temp.u(28), pg_temp.ax(8)::extensions.vector, 'card');
update public.kr8_members set verified = true where user_id = pg_temp.u(25);

create or replace function pg_temp.go(g int, k int, chk jsonb, e real[], card real[] default null, sel boolean default true) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  if sel then insert into storage.objects values ('kr8-verify', pg_temp.sp(g, k)); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(g))::text, true);
  set local role authenticated;
  r := public.kr8_verify_instant(case when sel then pg_temp.sp(g, k) end, 'face-2026-11-17d', chk, e, card);
  reset role;
  return r;
exception when others then
  reset role;
  return jsonb_build_object('error', sqlerrm);
end $$;
\set L '{"live":true,"straight":true,"left":true,"right":true,"blink":true,"order":"right-left","ms":5200,"engine":"mediapipe","same":0.9,"real":0.97,"frames":3,"match":0.8,"device":"Android"}'

-- pass: a new face, matches its own card photo (cosine 0.80 computed by the server)
select pg_temp.ok((pg_temp.go(21, 1, :'L', pg_temp.ax(2), pg_temp.mix(2, 70, 0.8)) ->> 'result') = 'pass', 'clear face → pass');
select pg_temp.ok((select verified from public.kr8_members where user_id = pg_temp.u(21)), 'pass → ✓ at once');
select pg_temp.ok((select status = 'approved' and reviewed_at is not null from public.kr8_verifications where user_id = pg_temp.u(21)), 'pass → approved (30-day photo clock starts)');
select pg_temp.ok(public.kr8_face_has_new_check(pg_temp.u(21)), 'pass → member counts as covered');
select pg_temp.ok((select match = 0.8 and decision = 'pass' from public.kr8_face_decisions where user_id = pg_temp.u(21)), 'pass logged with the server''s own match 0.80');
select pg_temp.ok((select count(*) = 2 from public.kr8_face_vectors where user_id = pg_temp.u(21)), 'check + card embeddings stored');
select pg_temp.ok((pg_temp.go(21, 2, :'L', pg_temp.ax(2), pg_temp.ax(2)) ->> 'again')::boolean, 'already passed → pass again, nothing new');
-- the phone cannot fake the match: it says 0.9 but the card embedding says 0.30
select pg_temp.ok((pg_temp.go(24, 1, jsonb_set(:'L'::jsonb, '{match}', '0.9'), pg_temp.ax(4), pg_temp.mix(4, 77, 0.3)) -> 'reasons') ? 'borderline_match', 'server recomputes the card match (phone said 0.9, real 0.30 → founder)');

-- block: cosine 0.70 to OLDER #20's face check
select pg_temp.ok((pg_temp.go(22, 1, :'L', pg_temp.mix(1, 71, 0.7), pg_temp.mix(1, 71, 0.7)) ->> 'result') = 'block', '≥0.60 to an older account → block');
select pg_temp.ok(not (select verified from public.kr8_members where user_id = pg_temp.u(22)), 'block → not verified');
select pg_temp.ok(public.kr8_linked(pg_temp.u(20), pg_temp.u(22)), 'block → face link (prize claims held)');
select pg_temp.ok((select reject_reason = 'This face is already on another Kring account' from public.kr8_verifications where user_id = pg_temp.u(22)), 'block reason stored');
select pg_temp.ok((select dup_user = pg_temp.u(20) and dup_sim = 0.7 and 'same_face_other_account' = any (reasons) from public.kr8_face_decisions where user_id = pg_temp.u(22)), 'block logged: #20 at 0.70');
select pg_temp.ok(not (pg_temp.go(22, 9, :'L', pg_temp.mix(1, 71, 0.7), null)::text like '%M20%'), 'the member never sees the other account');

-- grey: 0.55 → founder
select pg_temp.ok((pg_temp.go(23, 1, :'L', pg_temp.mix(1, 72, 0.55), pg_temp.mix(1, 72, 0.55)) -> 'reasons') ? 'looks_like_other_account', '0.50–0.60 → founder queue');
select pg_temp.ok((select status = 'pending' and live_check -> 'review' ? 'looks_like_other_account' from public.kr8_verifications where user_id = pg_temp.u(23)), 'queue item carries the reason');
-- Eyes-style look-alike (different Thai women measured at 0.44–0.47): not a duplicate
insert into auth.users (id, created_at) values (pg_temp.u(30), now()); insert into public.kr8_members (user_id, member_no, first_name) values (pg_temp.u(30), 30, 'M30');
select pg_temp.ok((pg_temp.go(30, 1, :'L', pg_temp.mix(1, 73, 0.471), pg_temp.mix(1, 73, 0.471)) ->> 'result') = 'pass', 'look-alike at 0.471 (closest different people measured) → not a duplicate → pass');
-- newer account: #26 is OLDER than #27 → founder, not block
select pg_temp.ok((pg_temp.go(26, 1, :'L', pg_temp.mix(7, 74, 0.7), pg_temp.mix(7, 74, 0.7)) -> 'reasons') ? 'same_face_newer_account', '≥0.60 to a NEWER account → founder, not block');
-- another member's CARD photo identical → founder only
select pg_temp.ok((pg_temp.go(29, 1, :'L', pg_temp.ax(8), pg_temp.ax(8)) ->> 'result') = 'review', 'another member''s card photo → founder only, never block');

-- no card face; doubt; old ✓ kept
select pg_temp.ok((pg_temp.go(25, 1, :'L', pg_temp.ax(5), null) -> 'reasons') ? 'no_card_face', 'no card embedding → founder');
select pg_temp.ok((select verified from public.kr8_members where user_id = pg_temp.u(25)), 'old ✓ kept while the founder looks');

-- fail path: no selfie, nothing stored; 3 a day
select pg_temp.ok((pg_temp.go(28, 0, '{"live":false,"fail":"spoof"}', null, null, false) ->> 'result') = 'fail', 'photo / screen → fail');
select pg_temp.ok(not exists (select 1 from public.kr8_verifications where user_id = pg_temp.u(28)) and (select count(*) = 1 from public.kr8_face_vectors where user_id = pg_temp.u(28)), 'fail stores no photo and no embedding');
select pg_temp.ok((pg_temp.go(28, 0, '{"live":false,"fail":"timeout"}', null, null, false) ->> 'tries_left') = '1', 'tries left counts down');
select pg_temp.ok((pg_temp.go(28, 0, '{"live":false,"fail":"still"}', null, null, false) ->> 'tries_left') = '0', '3rd try today');
select pg_temp.ok((pg_temp.go(28, 0, '{"live":false}', null, null, false) ->> 'error') like '%KR8_SLOW_DOWN%', '4th try today refused');
-- a script: says live but only 2 frames / low anti-spoof → fail, photo queued for deletion
select pg_temp.ok((pg_temp.go(27, 1, jsonb_set(:'L'::jsonb, '{real}', '0.2'), pg_temp.ax(7), null) ->> 'result') = 'fail', 'anti-spoof below 0.50 → fail even if the phone says live');
select pg_temp.ok(exists (select 1 from public.kr8_storage_trash where user_id = pg_temp.u(27)), '… and its photo is queued for deletion');
select pg_temp.ok((pg_temp.go(27, 2, :'L', array_fill(0.5::real, array[128]), null) ->> 'error') like '%KR8_BAD_FACE%', 'a made-up non-unit vector is refused');
-- consent
do $$ begin perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(27))::text, false);
  perform public.kr8_verify_instant(pg_temp.sp(27, 3), 'face-2026-11-10', '{}', pg_temp.ax(7)); raise exception 'no error';
exception when others then perform set_config('kr8.t', sqlerrm, false); end $$;
select pg_temp.ok(current_setting('kr8.t') like '%KR8_CONSENT_REQUIRED%', 'old consent refused');
-- auto off
update public.kr8_rings_config set value = 0 where key = 'verify_auto_on';
insert into auth.users (id, created_at) values (pg_temp.u(31), now()); insert into public.kr8_members (user_id, member_no, first_name) values (pg_temp.u(31), 31, 'M31');
select pg_temp.ok((pg_temp.go(31, 1, :'L', pg_temp.ax(31), pg_temp.ax(31)) -> 'reasons') ? 'auto_off', 'switch off → everything to the founder');
update public.kr8_rings_config set value = 1 where key = 'verify_auto_on';

-- the phone's status
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000025"}';
set role authenticated;
select pg_temp.ok((select (x ->> 'verified')::boolean and not (x ->> 'new_check')::boolean from (select public.kr8_my_face_status() x) q), 'old ✓ member: still asked for the new check');
reset role;
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000021"}';
set role authenticated;
select pg_temp.ok((select (x ->> 'new_check')::boolean from (select public.kr8_my_face_status() x) q), 'passed member: done');
do $$ begin perform public.kr8_admin_face_decisions(10); raise exception 'no error'; exception when others then perform set_config('kr8.t', sqlerrm, false); end $$;
reset role;
select pg_temp.ok(current_setting('kr8.t') like '%KR8_ADMIN_ONLY%', 'members cannot read the log');
set role authenticated;
do $$ begin perform count(*) from public.kr8_face_vectors; raise exception 'no error'; exception when others then perform set_config('kr8.t', sqlerrm, false); end $$;
reset role;
select pg_temp.ok(current_setting('kr8.t') like '%permission denied%', 'embeddings closed to members');
set role authenticated;
do $$ begin insert into public.kr8_face_vectors (user_id, emb, source) values ('00000000-0000-4000-8000-000000000021', array_fill(0::real, array[128])::extensions.vector, 'check'); raise exception 'no error';
exception when others then perform set_config('kr8.t', sqlerrm, false); end $$;
reset role;
select pg_temp.ok(current_setting('kr8.t') like '%permission denied%', 'members cannot write embeddings directly');
-- admin
set request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000099"}';
select pg_temp.ok((select jsonb_array_length(public.kr8_admin_face_decisions(100)) >= 12), 'admin log lists every decision');
select pg_temp.ok((select x -> 0 ? 'dup_sim' from (select public.kr8_admin_face_decisions(1) x) q), 'admin log row has the similarity');
select pg_temp.ok((select (x ->> 'members')::int = 12 from (select public.kr8_admin_face_coverage() x) q), 'coverage counts');
select public.kr8_admin_face_coverage()::text as coverage;
-- 30-day deletion by the nightly job
update public.kr8_verifications set reviewed_at = now() - interval '31 days' where user_id = pg_temp.u(21);
select pg_temp.ok(public.kr8_cleanup_kick() >= 1, 'nightly job expires old selfies');
select pg_temp.ok(exists (select 1 from public.kr8_storage_trash where user_id = pg_temp.u(21)), 'selfie queued for deletion after 30 days');
select pg_temp.ok((select selfie_path is null and selfie_deleted_at is not null from public.kr8_verifications where user_id = pg_temp.u(21)), 'selfie marked deleted');
