-- 0057 Ask a Thai: run on a SCRATCH database only (never the live project), after the migrations up to 0060 (+ optional 0061) + 0057,
-- on the same Supabase look-alike stub as 0061_ghost_test.sql. Every check prints PASS/FAIL (SKIP when 0061 is not there).
-- Seeds its own members; everything is rolled back at the end.
\set QUIET on
\pset tuples_only on
create or replace function pg_temp.ok(c boolean, n text) returns text language sql as $$ select (case when c then 'PASS ' else 'FAIL ' end) || n $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return 'no error'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.as_(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', coalesce(u, ''), false); $$;
create or replace function pg_temp.val(q text) returns text language plpgsql as $$ declare r text; begin execute q into r; return r; end $$;
\set A 'a1000000-0000-4000-8000-0000000000a1'
\set B 'b1000000-0000-4000-8000-0000000000b1'
\set N 'c1000000-0000-4000-8000-0000000000c1'
\set G 'd1000000-0000-4000-8000-0000000000d1'

begin;
select pg_temp.as_(null);
insert into auth.users (id, email, email_confirmed_at) values (:'A', 'ask-a@example.test', now()), (:'B', 'ask-b@example.test', now()),
  (:'N', 'ask-n@example.test', now()), (:'G', 'ask-g@example.test', now());
insert into public.kr8_members (user_id, first_name, photo, langs, who, age_ok_at) values
  (:'A', 'Maya', 'https://x/a.jpg', '{EN}', 'traveller', now()), (:'B', 'Ploy', 'https://x/b.jpg', '{TH}', 'local', now()),
  (:'G', 'Delta', 'https://x/g.jpg', '{EN}', 'traveller', now());
insert into storage.objects (bucket_id, name, owner, metadata) values
  ('kr8-ask', :'A' || '/aaaaaaaa-0000-4000-8000-000000000001.gif', :'A', '{"mimetype":"image/gif","size":120000}'),
  ('kr8-ask', :'A' || '/aaaaaaaa-0000-4000-8000-000000000002.jpg', :'A', '{"mimetype":"image/gif","size":120000}');

-- ask
select pg_temp.as_(:'A');
create temp table t (k text primary key, v uuid);
grant all on t to public;
select pg_temp.ok(pg_temp.err($$insert into t values ('q', public.kr8_ask_create('Best quiet cafe to work near Ari?', 'Wifi + plugs', 'Bangkok', null, null))$$) = 'no error', 'member with card asks');
select pg_temp.ok((select status from public.kr8_posts where id = (select v from t where k = 'q')) = 'approved', 'question is approved, not pending');
select pg_temp.ok((select kind = 'ask' and ask_score = 1 and ask_details = 'Wifi + plugs' from public.kr8_posts where id = (select v from t where k = 'q')), 'kind ask, score 1, details stored');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_create('GIF?', null, 'Bangkok', '$$ || :'A' || $$/aaaaaaaa-0000-4000-8000-000000000001.gif', 'gif')$$) = 'no error', 'own GIF upload accepted');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_create('Fake photo', null, 'Bangkok', '$$ || :'A' || $$/aaaaaaaa-0000-4000-8000-000000000002.jpg', 'photo')$$) = 'KR8_BAD_FILE', 'GIF claimed as photo refused');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_create('Not mine', null, 'Bangkok', '$$ || :'B' || $$/aaaaaaaa-0000-4000-8000-000000000001.gif', 'gif')$$) = 'KR8_BAD_FILE', 'someone else''s file refused');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_create('hi', null, 'Bangkok', null, null)$$) = 'KR8_BAD_TEXT', 'too short refused');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_create('Somewhere strange?', null, 'Atlantis', null, null)$$) = 'KR8_BAD_AREA', 'unknown area refused (kr8_create_post checks)');
select pg_temp.as_(:'N');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_create('No card here?', null, 'Bangkok', null, null)$$) = 'KR8_NO_CARD', 'no card: cannot ask');
select pg_temp.as_(null);
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_create('Signed out?', null, 'Bangkok', null, null)$$) = 'KR8_SIGN_IN', 'signed out: cannot ask');

-- read (visitor)
select pg_temp.ok(jsonb_array_length(public.kr8_ask_feed(null, 20) -> 'items') = 2, 'visitor sees both questions');
select pg_temp.ok((select count(*) from jsonb_each(public.kr8_ask_feed(null, 20) -> 'people') e where e.value ->> 'name' = 'Maya') = 1, 'people map carries the asker once (stand-in key for visitors)');
select pg_temp.ok(not exists (select 1 from public.kr8_feed() f where f.id = (select v from t where k = 'q')), 'question is not in the Reels feed');

-- answer, reply, votes
select pg_temp.as_(:'B');
select pg_temp.ok(pg_temp.err($$insert into t values ('a', public.kr8_ask_answer((select v from t where k = 'q'), null, 'Ari: Kaizen, plugs everywhere 🔌', null, null))$$) = 'no error', 'Thai Local answers');
select pg_temp.ok(pg_temp.err($$insert into t values ('r', public.kr8_ask_answer((select v from t where k = 'q'), (select v from t where k = 'a'), 'Opens 8am', null, null))$$) = 'no error', 'reply to the answer');
select pg_temp.ok(pg_temp.err($$insert into t values ('rr', public.kr8_ask_answer((select v from t where k = 'q'), (select v from t where k = 'r'), 'reply to reply', null, null))$$) = 'no error', 'reply to a reply');
select pg_temp.ok((select parent_id from public.kr8_ask_answers where id = (select v from t where k = 'rr')) = (select v from t where k = 'a'), 'reply to a reply hangs under the same answer');
select pg_temp.ok(public.kr8_ask_vote('q', (select v from t where k = 'q'), 1) = 2, 'upvote: score 2');
select pg_temp.ok(public.kr8_ask_vote('q', (select v from t where k = 'q'), -1) = 0, 'switch to downvote: score 0');
select pg_temp.ok(public.kr8_ask_vote('q', (select v from t where k = 'q'), 0) = 1, 'take vote back: score 1');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_vote('q', (select v from t where k = 'q'), 2)$$) = 'KR8_BAD_VOTE', 'vote of 2 refused');
select pg_temp.as_(:'A');
select pg_temp.ok((select (i -> 'top' ->> 'id')::uuid from jsonb_array_elements(public.kr8_ask_feed(null, 20) -> 'items') i where (i ->> 'id')::uuid = (select v from t where k = 'q')) = (select v from t where k = 'a'), 'feed shows the top answer inline');
select pg_temp.ok((public.kr8_ask_thread((select v from t where k = 'q')) -> 'q' ->> 'answers')::int = 3, 'thread: 3 answers');
select pg_temp.ok((public.kr8_ask_thread((select v from t where k = 'q')) -> 'people' -> :'B' ->> 'local')::boolean, 'thread: Thai Local flag');

-- blocks
select pg_temp.as_(null);
insert into public.kr8_blocks (blocker, blocked) values (:'A', :'B');
select pg_temp.as_(:'A');
select pg_temp.ok((public.kr8_ask_thread((select v from t where k = 'q')) -> 'q' ->> 'answers')::int = 0, 'blocker no longer sees the blocked person''s answers');
select pg_temp.as_(:'B');
select pg_temp.ok(public.kr8_ask_thread((select v from t where k = 'q')) is null, 'blocked person no longer sees the question');
select pg_temp.ok(pg_temp.err($$select public.kr8_ask_answer((select v from t where k = 'q'), null, 'still here?', null, null)$$) = 'KR8_BLOCKED', 'blocked person cannot answer');
select pg_temp.as_(null);
delete from public.kr8_blocks where blocker = :'A' and blocked = :'B';

-- hidden question (3 reports / team) disappears
update public.kr8_posts set hidden = true where id = (select v from t where k = 'q');
select pg_temp.ok(public.kr8_ask_thread((select v from t where k = 'q')) is null, 'hidden question is gone for visitors');
update public.kr8_posts set hidden = false where id = (select v from t where k = 'q');

-- ghost mode (only when 0061 is on)
select case when to_regprocedure('public.kr8_admin_set_ghost(boolean, uuid)') is null then 'SKIP ghost (0061 not applied)'
  else pg_temp.ok(pg_temp.err(format('select public.kr8_admin_set_ghost(true, %L)', :'G')) = 'no error', 'ghost on for Delta') end;
select pg_temp.as_(:'G');
select case when to_regprocedure('public.kr8_admin_set_ghost(boolean, uuid)') is null then 'SKIP' else
  pg_temp.ok(pg_temp.err($$select public.kr8_ask_create('Ghost question?', null, 'Bangkok', null, null)$$) = 'KR8_GHOST', 'ghost cannot ask') end;
select case when to_regprocedure('public.kr8_admin_set_ghost(boolean, uuid)') is null then 'SKIP' else
  pg_temp.ok(pg_temp.err($$select public.kr8_ask_answer((select v from t where k = 'q'), null, 'ghost answer', null, null)$$) = 'KR8_GHOST', 'ghost cannot answer') end;
select case when to_regprocedure('public.kr8_admin_set_ghost(boolean, uuid)') is null then 'SKIP' else
  pg_temp.ok(pg_temp.err($$select public.kr8_ask_vote('q', (select v from t where k = 'q'), 1)$$) = 'KR8_GHOST', 'ghost cannot vote') end;

rollback;
