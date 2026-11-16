-- 0063 Problems + Recruiters: run on a SCRATCH database only (never the live project), after 0063_stub.sql, 0058 and 0063.
-- Every check prints PASS/FAIL. Seeds its own rows inside a transaction that is rolled back.
\set QUIET on
\pset tuples_only on
create or replace function pg_temp.ok(c boolean, n text) returns text language sql as $$ select (case when c then 'PASS ' else 'FAIL ' end) || n $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return 'no error'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.as_(u text, adm boolean) returns void language sql as $$
  select set_config('t.uid', coalesce(u, ''), false), set_config('t.admin', case when adm then '1' else '0' end, false); $$;
\set A '0a000000-0000-4000-8000-00000000000a'
\set P '0b000000-0000-4000-8000-00000000000b'
\set N '0c000000-0000-4000-8000-00000000000c'
\set S '0d000000-0000-4000-8000-00000000000d'
\set T '0e000000-0000-4000-8000-00000000000e'
\set Q '0f000000-0000-4000-8000-00000000000f'

begin;
select pg_temp.as_(null, true);
insert into auth.users (id, email) values (:'A', 'admin@example.test'), (:'P', 'p@x'), (:'N', 'n@x'), (:'S', 's@x'), (:'T', 't@x'), (:'Q', 'q@x');
insert into public.kr8_members (user_id, first_name, member_no, ref_code, src_code, verified, created_at) values
  (:'A', 'Admin', 1, null, null, false, now() - interval '9 days'),
  (:'P', 'Ploy', 20, 'pich', null, true, now() - interval '2 days'),
  (:'N', 'Nok', 21, null, 'pwa', true, now() - interval '1 day'),
  (:'S', 'Som', 22, '  ', null, false, now() - interval '3 hours'),
  (:'T', 'Test Tom', 23, null, null, false, now()),
  (:'Q', 'Kai', 24, 'Pich', null, false, now());
insert into public.kr8_posts (author, kind, status, hidden, created_at) values
  (:'P', 'reel', 'approved', false, now() - interval '1 hour'),
  (:'N', 'reel', 'approved', false, now() - interval '30 hours'),
  (:'Q', 'reel', 'approved', true, now() - interval '2 hours'),
  (:'S', 'photo', 'approved', false, now());
insert into public.kr8_client_events (user_id, kind, code, detail, ua, created_at) values
  (:'P', 'reel_open', 'place', null, 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) Mobile/15E148 Safari Line/26.17.0 LIFF', now() - interval '2 hours'),
  (:'P', 'reel_open', 'feed', null, 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) Mobile/15E148 Safari Line/26.17.0 LIFF', now() - interval '90 minutes'),
  (:'S', 'reel_open', 'place', null, 'Mozilla/5.0 (Linux; Android 15; SM-S721B; wv) Chrome/157 Mobile', now() - interval '3 hours'),
  (:'S', 'reel_trim', 'open', '75s 34MB inapp', 'Mozilla/5.0 (Linux; Android 15; SM-S721B; wv) Chrome/157 Mobile', now() - interval '170 minutes'),
  (:'S', 'reel_publish_fail', 'UPLOAD:0', 'video/mp4 6.7MB', 'Mozilla/5.0 (Linux; Android 15; SM-S721B; wv) Chrome/157 Mobile', now() - interval '160 minutes'),
  (:'S', 'reel_publish_fail', 'UPLOAD:0', 'video/mp4 6.7MB', 'Mozilla/5.0 (Linux; Android 15; SM-S721B; wv) Chrome/157 Mobile', now() - interval '150 minutes'),
  (:'N', 'reel_pick_fail', 'TOO_LONG', 'video/mp4 34MB', 'Mozilla/5.0 (Linux; Android 10; K) SamsungBrowser/30.0 Chrome/143 Mobile', now() - interval '5 hours'),
  (:'N', 'verify_cam_fail', 'NotAllowedError', null, 'Mozilla/5.0 (Linux; Android 10; K) SamsungBrowser/30.0 Chrome/143 Mobile', now() - interval '3 days'),
  (:'T', 'reel_pick_fail', 'HEVC', null, 'x', now() - interval '1 hour');

-- gate
select pg_temp.as_(:'P', false);
select pg_temp.ok(pg_temp.err('select public.kr8_admin_problem_log(24)') = 'KR8_ADMIN_ONLY', 'problem log: member refused');
select pg_temp.ok(pg_temp.err('select public.kr8_admin_recruiters()') = 'KR8_ADMIN_ONLY', 'recruiters: member refused');
select pg_temp.ok(pg_temp.err(format('select public.kr8_admin_credit_ref(%L, ''pich'')', :'N')) = 'KR8_ADMIN_ONLY', 'credit: member refused');
select pg_temp.ok(pg_temp.err(format('select public.kr8_admin_uncredit_ref(%L)', :'N')) = 'KR8_ADMIN_ONLY', 'uncredit: member refused');
select pg_temp.ok(not has_table_privilege('authenticated', 'public.kr8_ref_credits', 'select') and not has_table_privilege('authenticated', 'public.kr8_ref_credit_log', 'select'),
  'credit tables: no direct read for members');
select pg_temp.ok(not has_function_privilege('anon', 'public.kr8_admin_recruiters(boolean)', 'execute'), 'anon cannot call recruiters');

-- problem log, 24 h
select pg_temp.as_(:'A', true);
create temp table pl as select public.kr8_admin_problem_log(24) j;
select pg_temp.ok((select (j #>> '{totals,opened}')::int = 2 and (j #>> '{totals,opens}')::int = 3 from pl), '24 h: 2 people opened the Reel screen, 3 opens');
select pg_temp.ok((select (j #>> '{totals,picked}')::int from pl) = 3, '24 h: picked = Som (trim/publish) + Ploy + Kai (posted) = 3');
select pg_temp.ok((select (j #>> '{totals,posted}')::int = 2 and (j #>> '{totals,reels}')::int = 2 from pl), '24 h: 2 posted (Nok''s 30 h Reel and the photo not counted)');
select pg_temp.ok((select (j #>> '{totals,pick_failed}')::int from pl) = 1, '24 h: test member Tom left out by default');
select pg_temp.ok((select (j #>> '{totals,failures}')::int from pl) = 3, '24 h: 3 failures (2 upload + 1 too long); the 3-day camera fail is outside');
select pg_temp.ok((select g ->> 'code' = 'UPLOAD:0' and (g ->> 'n')::int = 2 and (g ->> 'people')::int = 1 from pl, jsonb_array_elements(j -> 'groups') with ordinality t(g, i) where i = 1),
  'groups: UPLOAD:0 first, 2 times, 1 person');
select pg_temp.ok((select jsonb_array_length(j -> 'rows') from pl) = 4, 'rows: reel_open left out of the latest list (4 rows)');
select pg_temp.ok((select (j -> 'rows' -> 0 ->> 'first_name') = 'Som' and (j -> 'rows' -> 0 ->> 'member_no')::int = 22 from pl), 'rows: newest first with name and member no');
select pg_temp.ok((select bool_or((a ->> 'fails')::int = 2 and a ->> 'ua' like '%SM-S721B%') from pl, jsonb_array_elements(j -> 'agents') a), 'agents: Samsung in-app ua has 2 fails');
select pg_temp.ok((select jsonb_array_length(j -> 'days') >= 1 from pl), 'days: at least one Bangkok day');
-- 7 days + test members
select pg_temp.ok((select (public.kr8_admin_problem_log(168) #>> '{totals,failures}')::int) = 4, '7 d: the camera fail is counted (4)');
select pg_temp.ok((select (public.kr8_admin_problem_log(168) #>> '{totals,posted}')::int) = 3, '7 d: Nok''s Reel counted (3 posted)');
select pg_temp.ok((select (public.kr8_admin_problem_log(24, true) #>> '{totals,pick_failed}')::int) = 2, 'include test: Tom''s HEVC counted');
select pg_temp.ok((select (public.kr8_admin_problem_log(99999) ->> 'hours')::int) = 2160, 'hours capped at 90 days');

-- recruiters before any credit
create temp table rc as select public.kr8_admin_recruiters() j;
select pg_temp.ok((select jsonb_array_length(j -> 'codes') from rc) = 1, 'one code (pich; Pich lower-cased into it)');
select pg_temp.ok((select (c ->> 'signups')::int = 2 and (c ->> 'via_link')::int = 2 and (c ->> 'posted')::int = 1 and (c ->> 'verified')::int = 1
                   from rc, jsonb_array_elements(j -> 'codes') c where c ->> 'code' = 'pich'), 'pich: 2 sign-ups, 1 posted (Kai''s Reel is hidden), 1 verified');
select pg_temp.ok((select count(*) from rc, jsonb_array_elements(j -> 'no_code') x) = 3, 'no code: Admin, Nok, Som (blank ref) = 3; test Tom left out');

-- credit
select pg_temp.ok(pg_temp.err(format('select public.kr8_admin_credit_ref(%L, ''pich'')', :'P')) = 'KR8_HAS_REF', 'cannot credit someone who joined with a link');
select pg_temp.ok(pg_temp.err(format('select public.kr8_admin_credit_ref(%L, ''bad code!'')', :'N')) = 'KR8_BAD_REF', 'bad code refused');
select pg_temp.ok(pg_temp.err(format('select public.kr8_admin_credit_ref(%L, ''pich'')', gen_random_uuid())) = 'KR8_NO_MEMBER', 'unknown member refused');
select pg_temp.ok((public.kr8_admin_credit_ref(:'N', ' Pich ') ->> 'ref_code') = 'pich', 'Nok credited to pich (trimmed, lower case)');
select pg_temp.ok((public.kr8_admin_credit_ref(:'S', 'nattham') ->> 'credited_by') = 'admin@example.test', 'Som credited to nattham, by admin email');
select pg_temp.ok((select ref_code is null from public.kr8_members where user_id = :'N'), 'ref_code never written');
select pg_temp.ok((public.kr8_admin_credit_ref(:'S', 'pich') ->> 'prev_code') = 'nattham', 're-credit Som to pich keeps the old code in the log');
create temp table rc2 as select public.kr8_admin_recruiters() j;
select pg_temp.ok((select (c ->> 'signups')::int = 4 and (c ->> 'credited')::int = 2 and (c ->> 'posted')::int = 2 and (c ->> 'verified')::int = 2
                   from rc2, jsonb_array_elements(j -> 'codes') c where c ->> 'code' = 'pich'), 'pich now 4 (2 link + 2 credited), 2 posted, 2 verified');
select pg_temp.ok((select count(*) from rc2, jsonb_array_elements(j -> 'no_code') x) = 1, 'only Admin left without a code');
select pg_temp.ok((select m ->> 'how' = 'credited' and m ->> 'credited_by' = 'admin@example.test' and m ->> 'credited_at' is not null
                   from rc2, jsonb_array_elements(j -> 'codes') c, jsonb_array_elements(c -> 'members') m where m ->> 'first_name' = 'Nok'), 'member row shows credited, by whom, when');
select pg_temp.ok((select jsonb_array_length(j -> 'log') = 3 and j -> 'log' -> 0 ->> 'prev_code' = 'nattham' and j -> 'log' -> 0 ->> 'by' = 'admin@example.test' from rc2), 'audit log: 3 entries, newest first');
-- remove
select pg_temp.ok(public.kr8_admin_uncredit_ref(:'S'), 'remove Som''s credit');
select pg_temp.ok(not public.kr8_admin_uncredit_ref(:'S'), 'second remove: nothing to remove');
select pg_temp.ok((select count(*) from public.kr8_ref_credit_log where user_id = :'S') = 3, 'audit keeps credit, re-credit and remove');
select pg_temp.ok((select (c ->> 'signups')::int from jsonb_array_elements(public.kr8_admin_recruiters() -> 'codes') c where c ->> 'code' = 'pich') = 3, 'pich back to 3');
rollback;
