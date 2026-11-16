-- 0064 Ask a Thai safety (audit H3): run on a SCRATCH database only (never the live project), after migrations up to 0065
-- (incl. 0057 + 0061 + 0064) on the same Supabase look-alike stub as 0061_ghost_test.sql. Every check prints PASS/FAIL.
-- Seeds its own members; everything is rolled back at the end.
\set QUIET on
\pset tuples_only on
create or replace function pg_temp.ok(c boolean, n text) returns text language sql as $$ select (case when c then 'PASS ' else 'FAIL ' end) || n $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return 'no error'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.as_(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', coalesce(u, ''), false); $$;
\set A 'a2000000-0000-4000-8000-0000000000a2'
\set B 'b2000000-0000-4000-8000-0000000000b2'
\set C 'c2000000-0000-4000-8000-0000000000c2'
\set D 'd2000000-0000-4000-8000-0000000000d2'
\set E 'e2000000-0000-4000-8000-0000000000e2'
\set M 'f2000000-0000-4000-8000-0000000000f2'

begin;
select pg_temp.as_(null);
insert into auth.users (id, email, email_confirmed_at) values (:'A', 'safe-a@example.test', now()), (:'B', 'safe-b@example.test', now()),
  (:'C', 'safe-c@example.test', now()), (:'D', 'safe-d@example.test', now()), (:'E', 'safe-e@example.test', now()), (:'M', 'safe-admin@example.test', now());
insert into public.kr8_admin_emails (email) values ('safe-admin@example.test');
insert into public.kr8_members (user_id, first_name, photo, langs, who, age_ok_at) values
  (:'A', 'Maya', 'https://x/a.jpg', '{EN}', 'traveller', now()), (:'B', 'Bank', 'https://x/b.jpg', '{TH}', 'local', now()),
  (:'C', 'Ploy', 'https://x/c.jpg', '{TH}', 'local', now()), (:'D', 'Dao', 'https://x/d.jpg', '{TH}', 'local', now()),
  (:'E', 'Eve', 'https://x/e.jpg', '{EN}', 'traveller', now()), (:'M', 'Admin', 'https://x/m.jpg', '{EN}', 'local', now());
insert into storage.objects (bucket_id, name, owner, metadata) values
  ('kr8-ask', :'C' || '/aaaaaaaa-0000-4000-8000-0000000000c1.jpg', :'C', '{"mimetype":"image/jpeg","size":120000}');
create temp table t (k text primary key, v uuid);
grant all on t to public;

-- C asks (with a photo), A and B each ask, then answers: A and B answer C's question, B replies to A, C replies to B
select pg_temp.as_(:'C');
insert into t values ('qc', public.kr8_ask_create('Quiet café near Ari?', null, 'Bangkok', :'C' || '/aaaaaaaa-0000-4000-8000-0000000000c1.jpg', 'photo'));
select pg_temp.as_(:'A');
insert into t values ('qa', public.kr8_ask_create('Night market on Sunday?', null, 'Bangkok', null, null));
insert into t values ('aa', public.kr8_ask_answer((select v from t where k = 'qc'), null, 'Try the one by the station', null, null));
select pg_temp.as_(:'B');
insert into t values ('qb', public.kr8_ask_create('Best noodle spot in Bang Rak?', null, 'Bangkok', null, null));
insert into t values ('ab', public.kr8_ask_answer((select v from t where k = 'qc'), null, 'Kaizen on Soi 7', null, null));
insert into t values ('rba', public.kr8_ask_answer((select v from t where k = 'qc'), (select v from t where k = 'aa'), 'Agree with Maya', null, null));
select pg_temp.ok(public.kr8_ask_vote('a', (select v from t where k = 'ab'), 1) = 1, 'B''s upvote on own answer is a no-op change');
select pg_temp.as_(:'C');
insert into t values ('rcb', public.kr8_ask_answer((select v from t where k = 'qc'), (select v from t where k = 'ab'), 'Thanks Bank', null, null));

-- ───── blocks: A blocks B. Checked both ways. ─────
select pg_temp.as_(null);
insert into public.kr8_blocks (blocker, blocked) values (:'A', :'B');

select pg_temp.as_(:'A');   -- the blocker
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.kr8_ask_feed() -> 'items') i where (i ->> 'id')::uuid = (select v from t where k = 'qb')), 'A: B''s question not in the feed');
select pg_temp.ok(public.kr8_ask_thread((select v from t where k = 'qb')) is null, 'A: B''s question thread is empty');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.kr8_ask_thread((select v from t where k = 'qc')) -> 'answers') x
  where (x ->> 'id')::uuid in ((select v from t where k = 'ab'), (select v from t where k = 'rba'), (select v from t where k = 'rcb'))), 'A: B''s answer, B''s reply and the replies under B''s answer are gone from C''s thread');
select pg_temp.ok((select (i -> 'top' ->> 'id')::uuid from jsonb_array_elements(public.kr8_ask_feed() -> 'items') i where (i ->> 'id')::uuid = (select v from t where k = 'qc')) = (select v from t where k = 'aa'),
  'A: feed top answer skips B''s (higher-score) answer');
select pg_temp.ok((select (i ->> 'answers')::int from jsonb_array_elements(public.kr8_ask_feed() -> 'items') i where (i ->> 'id')::uuid = (select v from t where k = 'qc')) = 1, 'A: answer count leaves B out');
select pg_temp.ok(not (public.kr8_ask_feed()::text like '%' || :'B' || '%') and not (public.kr8_ask_thread((select v from t where k = 'qc'))::text like '%' || :'B' || '%'), 'A: B''s id appears nowhere');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_answer((select v from t where k = 'qb'), null, 'hi', null, null)$$) = 'KR8_BLOCKED', 'A cannot answer B''s question');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_answer((select v from t where k = 'qc'), (select v from t where k = 'ab'), 'hi', null, null)$$) = 'KR8_BLOCKED', 'A cannot reply to B''s answer');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_vote('q', (select v from t where k = 'qb'), -1)$$) = 'KR8_BLOCKED', 'A cannot vote on B''s question');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_vote('a', (select v from t where k = 'ab'), -1)$$) = 'KR8_BLOCKED', 'A cannot vote on B''s answer');

select pg_temp.as_(:'B');   -- the blocked person
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.kr8_ask_feed() -> 'items') i where (i ->> 'id')::uuid = (select v from t where k = 'qa')), 'B: A''s question not in the feed');
select pg_temp.ok(public.kr8_ask_thread((select v from t where k = 'qa')) is null, 'B: A''s question thread is empty');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.kr8_ask_thread((select v from t where k = 'qc')) -> 'answers') x where (x ->> 'id')::uuid = (select v from t where k = 'aa')), 'B: A''s answer gone from C''s thread');
select pg_temp.ok(not (public.kr8_ask_feed()::text like '%' || :'A' || '%'), 'B: A''s id appears nowhere in the feed');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_answer((select v from t where k = 'qa'), null, 'I know where you live', null, null)$$) = 'KR8_BLOCKED', 'B cannot answer A''s question');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_answer((select v from t where k = 'qc'), (select v from t where k = 'aa'), 'hey', null, null)$$) = 'KR8_BLOCKED', 'B cannot reply to A''s answer');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_vote('q', (select v from t where k = 'qa'), -1)$$) = 'KR8_BLOCKED', 'B cannot downvote A''s question');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_vote('a', (select v from t where k = 'aa'), -1)$$) = 'KR8_BLOCKED', 'B cannot downvote A''s answer');
select pg_temp.ok((select ask_score from public.kr8_posts where id = (select v from t where k = 'qa')) = 1 and (select score from public.kr8_ask_answers where id = (select v from t where k = 'aa')) = 1, 'A''s scores untouched');

select pg_temp.as_(:'C');   -- a third member still sees both
select pg_temp.ok((public.kr8_ask_thread((select v from t where k = 'qc')) -> 'q' ->> 'answers')::int = 4, 'C (not involved) still sees all 4 answers');
select pg_temp.as_(null);
delete from public.kr8_blocks where blocker = :'A' and blocked = :'B';
select pg_temp.as_(:'A');
select pg_temp.ok(public.kr8_ask_thread((select v from t where k = 'qb')) is not null, 'after unblock A sees B''s question again');

-- ───── signed-out visitors: no member ids, no member photos, no photo paths ─────
select pg_temp.as_(null);
select pg_temp.ok(jsonb_array_length(public.kr8_ask_feed() -> 'items') = 3, 'visitor reads the 3 questions');
select pg_temp.ok(not exists (select 1 from public.kr8_members m where public.kr8_ask_feed()::text like '%' || m.user_id::text || '%')
  and not exists (select 1 from public.kr8_members m where public.kr8_ask_thread((select v from t where k = 'qc'))::text like '%' || m.user_id::text || '%'), 'visitor: no member id anywhere (feed + thread)');
select pg_temp.ok(not (public.kr8_ask_feed()::text like '%https://x/%') and not (public.kr8_ask_thread((select v from t where k = 'qc'))::text like '%https://x/%'), 'visitor: no member photos');
select pg_temp.ok((select i ->> 'media_path' from jsonb_array_elements(public.kr8_ask_feed() -> 'items') i where (i ->> 'id')::uuid = (select v from t where k = 'qc')) is null, 'visitor: no photo path (it holds the member id)');
select pg_temp.ok((select count(*) from jsonb_each(public.kr8_ask_thread((select v from t where k = 'qc')) -> 'people') e where e.value ->> 'name' in ('Maya', 'Bank', 'Ploy')) = 3, 'visitor: names still show (stand-in keys)');
select pg_temp.ok((with r as materialized (select public.kr8_ask_thread((select v from t where k = 'qc')) j)
                   select bool_and((r.j -> 'people') ? (x ->> 'author_id')) and count(*) = 4 from r, jsonb_array_elements(r.j -> 'answers') x), 'visitor: every answer''s key is in its people map');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_vote('q', (select v from t where k = 'qc'), 1)$$) = 'KR8_SIGN_IN', 'visitor cannot vote');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_report('a', (select v from t where k = 'ab'), 'spam')$$) = 'KR8_SIGN_IN', 'visitor cannot report');
select pg_temp.as_(:'D');
select pg_temp.ok((select i ->> 'media_path' from jsonb_array_elements(public.kr8_ask_feed() -> 'items') i where (i ->> 'id')::uuid = (select v from t where k = 'qc')) is not null, 'signed-in member sees the photo');

-- ───── report an answer ─────
select pg_temp.as_(:'B');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_report('a', (select v from t where k = 'ab'), 'spam')$$) = 'KR8_OWN', 'cannot report your own answer');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_report('a', (select v from t where k = 'ab'), 'rude')$$) = 'KR8_BAD_REASON', 'unknown reason refused');
select pg_temp.as_(:'C');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_report('a', (select v from t where k = 'ab'), 'unsafe')$$) = 'no error', 'C reports B''s answer');
select pg_temp.ok((select count(*) from public.kr8_reports where ask_answer_id = (select v from t where k = 'ab') and reporter = :'C' and category = 'unsafe' and target_user = :'B'
  and reason like 'Ask a Thai answer · unsafe: “Kaizen on Soi 7”') = 1, 'report row in kr8_reports (answer id, category, quoted text)');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.kr8_ask_thread((select v from t where k = 'qc')) -> 'answers') x where (x ->> 'id')::uuid = (select v from t where k = 'ab')), 'C stops seeing it at once');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_report('a', (select v from t where k = 'ab'), 'unsafe')$$) = 'no error'
  and (select count(*) from public.kr8_reports where ask_answer_id = (select v from t where k = 'ab') and reporter = :'C') = 1, 'reporting twice adds no second row');
select pg_temp.as_(:'D');
select pg_temp.ok(exists (select 1 from jsonb_array_elements(public.kr8_ask_thread((select v from t where k = 'qc')) -> 'answers') x where (x ->> 'id')::uuid = (select v from t where k = 'ab')), 'others still see it after 1 report');
select public.kr8_ask_report('a', (select v from t where k = 'ab'), 'spam');
select pg_temp.as_(:'E');
select public.kr8_ask_report('a', (select v from t where k = 'ab'), 'block');
select pg_temp.ok(exists (select 1 from public.kr8_blocks where blocker = :'E' and blocked = :'B'), '"block" reason also blocks the person');
select pg_temp.ok((select hidden from public.kr8_ask_answers where id = (select v from t where k = 'ab')), '3 different reporters: answer hidden for everyone');
select pg_temp.as_(:'A');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.kr8_ask_thread((select v from t where k = 'qc')) -> 'answers') x where (x ->> 'id')::uuid = (select v from t where k = 'ab')), 'hidden answer gone for a non-reporter');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_vote('a', (select v from t where k = 'ab'), 1)$$) = 'KR8_NOT_FOUND', 'cannot vote on a hidden answer');
select pg_temp.ok(pg_temp.err(format('select public.kr8_admin_ask_answer(%L, %L)', (select id from public.kr8_reports where ask_answer_id = (select v from t where k = 'ab') limit 1), 'keep')) = 'KR8_ADMIN_ONLY', 'member cannot use the admin action');
-- admin sees it in the existing Reports tab and keeps it
select pg_temp.as_(:'M');
select pg_temp.ok((select count(*) from public.kr8_admin_reports(true, 200) r where r.reason like 'Ask a Thai answer%' and r.target_id = :'B') = 3, 'admin Reports tab lists the 3 answer reports');
select pg_temp.ok(public.kr8_admin_ask_answer((select id from public.kr8_reports where ask_answer_id = (select v from t where k = 'ab') limit 1), 'keep') = 3, 'admin Keep closes all 3');
select pg_temp.ok(not (select hidden from public.kr8_ask_answers where id = (select v from t where k = 'ab')), 'kept answer is shown again');
select pg_temp.as_(:'C');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(public.kr8_ask_thread((select v from t where k = 'qc')) -> 'answers') x where (x ->> 'id')::uuid = (select v from t where k = 'ab')), 'the reporter still does not see it');

-- ───── report a question (existing Reel report flow) ─────
select pg_temp.as_(:'D');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_report('q', (select v from t where k = 'qa'), 'spam')$$) = 'no error', 'D reports A''s question');
select pg_temp.ok((select count(*) from public.kr8_reports where post_id = (select v from t where k = 'qa') and reporter = :'D' and category = 'spam') = 1, 'question report is a normal kr8_reports post report');
select pg_temp.ok(public.kr8_ask_thread((select v from t where k = 'qa')) is null and not exists (select 1 from jsonb_array_elements(public.kr8_ask_feed() -> 'items') i where (i ->> 'id')::uuid = (select v from t where k = 'qa')), 'D stops seeing the question');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_vote('q', (select v from t where k = 'qa'), 1)$$) = 'KR8_NOT_FOUND', 'D cannot vote on a question D reported');
select pg_temp.as_(:'A');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_report('q', (select v from t where k = 'qa'), 'spam')$$) like 'KR8_OWN%', 'cannot report your own question');
select pg_temp.ok(pg_temp.err(format('select public.kr8_ask_report(%L, %L, %L)', 'q', :'A', 'spam')) = 'KR8_NOT_FOUND', 'report of a non-question refused');
select pg_temp.as_(:'M');
select pg_temp.ok((select post_kind from public.kr8_admin_reports(true, 200) r where r.post_id = (select v from t where k = 'qa') limit 1) = 'ask', 'admin Reports tab shows it as an ask post');

-- ───── grants ─────
select pg_temp.ok(not has_function_privilege('anon', 'public.kr8_ask_report(text, uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.kr8_ask_vote(text, uuid, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.kr8_ask_person(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.kr8_ask_q_ok(uuid, uuid)', 'execute')
  and not has_table_privilege('authenticated', 'public.kr8_ask_answer_hidden', 'select'), 'grants: visitors cannot write; helpers and tables closed');
select pg_temp.ok(to_regprocedure('public.kr8_ask_answer_json(public.kr8_ask_answers, uuid)') is null, 'old 2-argument helper is gone');
rollback;
