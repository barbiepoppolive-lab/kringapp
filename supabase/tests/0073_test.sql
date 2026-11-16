-- 0073 (Kring Team = sender only). SCRATCH DATABASE ONLY: a private Postgres with 0001…0067 + 0043, 0070–0073.
--   psql -X -q -v ON_ERROR_STOP=1 -f supabase/tests/0073_test.sql      (raises on the first FAIL; everything is rolled back)
-- request.path is what PostgREST sets on every API call; here it is set by hand to play each call.
\set QUIET on
begin;
create or replace function pg_temp.ok(c boolean, what text) returns void language plpgsql as $$
begin if not coalesce(c, false) then raise exception 'FAIL: %', what; end if; raise notice 'PASS: %', what; end $$;
create or replace function pg_temp.call(u uuid, path text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true), set_config('request.path', path, true) $$;

insert into auth.users (id, email) values ('fd5cca36-9be2-4dde-9d7d-2dd9c898deaa', 'team@kringapp.com'), ('73000000-0000-4000-8000-000000000001', 'm73@example.com'),
  ('73000000-0000-4000-8000-000000000002', 'n73@example.com') on conflict do nothing;
insert into public.kr8_team_accounts (user_id, note) values ('fd5cca36-9be2-4dde-9d7d-2dd9c898deaa', 'Kring Team') on conflict do nothing;
insert into public.kr8_members (user_id, first_name, photo, langs, area, who, age_ok_at, created_at) values
  ('fd5cca36-9be2-4dde-9d7d-2dd9c898deaa', 'Kring Team', 'https://x/k.jpg', '{TH,EN}', 'Bangkok', 'local', now(), now()),
  ('73000000-0000-4000-8000-000000000001', 'Mai', 'https://x/m.jpg', '{TH}', 'Bangkok', 'local', now(), now()),
  ('73000000-0000-4000-8000-000000000002', 'Noon', 'https://x/n.jpg', '{TH}', 'Bangkok', 'local', now(), now()) on conflict do nothing;
-- the team opened a chat with Mai (user_a < user_b)
insert into public.kr8_threads (id, user_a, user_b, opened_by, status) values
  ('73000000-0000-4000-8000-0000000000c1', '73000000-0000-4000-8000-000000000001', 'fd5cca36-9be2-4dde-9d7d-2dd9c898deaa', 'fd5cca36-9be2-4dde-9d7d-2dd9c898deaa', 'pending');
insert into public.kr8_messages (thread_id, sender, body) values ('73000000-0000-4000-8000-0000000000c1', 'fd5cca36-9be2-4dde-9d7d-2dd9c898deaa', 'Welcome to Kring!');

-- browsing: People, profile, a new hello → hidden
select pg_temp.call('73000000-0000-4000-8000-000000000001', '/rpc/kr8_people');
set local role authenticated;
select pg_temp.ok(not exists (select 1 from public.kr8_people(200) p where p.user_id = 'fd5cca36-9be2-4dde-9d7d-2dd9c898deaa'), 'People list: no Kring Team card');
select pg_temp.ok(exists (select 1 from public.kr8_people(200) p where p.user_id = '73000000-0000-4000-8000-000000000002'), 'People list: other members still show');
select pg_temp.ok(public.kr8_is_blocked('73000000-0000-4000-8000-000000000001', 'fd5cca36-9be2-4dde-9d7d-2dd9c898deaa'), 'the gate hides the team from a member');
reset role;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return 'no error'; exception when others then return sqlerrm; end $$;
select pg_temp.call('73000000-0000-4000-8000-000000000001', '/rpc/kr8_profile');
set local role authenticated;
select pg_temp.ok(coalesce(pg_temp.err($q$select public.kr8_profile('fd5cca36-9be2-4dde-9d7d-2dd9c898deaa')$q$), '') <> 'no error'
  or public.kr8_profile('fd5cca36-9be2-4dde-9d7d-2dd9c898deaa') is null, 'profile: no member profile for the Kring Team');
select pg_temp.ok(pg_temp.err($q$select public.kr8_send_hello('fd5cca36-9be2-4dde-9d7d-2dd9c898deaa', 'hi')$q$) <> 'no error', 'a member cannot start a new hello to the Kring Team');
reset role;

-- chats: the thread the team opened still shows, opens, and Mai can reply
select pg_temp.call('73000000-0000-4000-8000-000000000001', '/rpc/kr8_inbox');
set local role authenticated;
select pg_temp.ok(exists (select 1 from public.kr8_inbox() i where i.other_id = 'fd5cca36-9be2-4dde-9d7d-2dd9c898deaa'), 'inbox: the Kring Team chat shows');
reset role;
select pg_temp.call('73000000-0000-4000-8000-000000000001', '/rpc/kr8_thread_messages');
set local role authenticated;
select pg_temp.ok((select count(*) = 1 from public.kr8_thread_messages('73000000-0000-4000-8000-0000000000c1', 0)), 'thread: the team''s message opens');
reset role;
select pg_temp.call('73000000-0000-4000-8000-000000000001', '/rpc/kr8_send_message');
set local role authenticated;
select pg_temp.ok(public.kr8_send_message('73000000-0000-4000-8000-0000000000c1', 'Thank you!') is not null, 'Mai can reply to the Kring Team');
reset role;
select pg_temp.call('73000000-0000-4000-8000-000000000001', '');
set local role authenticated;
select pg_temp.ok((select count(*) = 2 from public.kr8_messages where thread_id = '73000000-0000-4000-8000-0000000000c1'), 'Realtime / table read (no API path): both messages readable');
reset role;

-- the team itself still sees members (it is the sender)
select pg_temp.call('fd5cca36-9be2-4dde-9d7d-2dd9c898deaa', '/rpc/kr8_people');
select pg_temp.ok(not public.kr8_is_blocked('fd5cca36-9be2-4dde-9d7d-2dd9c898deaa', '73000000-0000-4000-8000-000000000001'), 'the team account is not blocked from members');

-- Ask a Thai author card + app list of team ids + admin count
select pg_temp.ok((select public.kr8_ask_person('fd5cca36-9be2-4dde-9d7d-2dd9c898deaa') = '{"name": "Kring Team", "photo": null, "local": false, "official": true}'::jsonb), 'Ask a Thai: Kring Team · official, not Thai Local');
select pg_temp.ok((select (public.kr8_ask_person('73000000-0000-4000-8000-000000000001') ->> 'local')::boolean), 'Ask a Thai: members unchanged');
select pg_temp.call('73000000-0000-4000-8000-000000000001', '/rpc/kr8_team_ids');
set local role authenticated;
select pg_temp.ok(public.kr8_team_ids() = array['fd5cca36-9be2-4dde-9d7d-2dd9c898deaa']::uuid[], 'kr8_team_ids lists the team account');
reset role;
-- blocks and ghost mode still work through the same gate
insert into public.kr8_blocks (blocker, blocked) values ('73000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000002');
select pg_temp.call('73000000-0000-4000-8000-000000000001', '/rpc/kr8_people');
select pg_temp.ok(public.kr8_is_blocked('73000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000002'), 'ordinary blocks still hide');
rollback;
