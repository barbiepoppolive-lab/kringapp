-- Proves no test-account content reaches real members: every member read is run as a real verified member and as a visitor;
-- each result is searched for any test account id or any post id by a test account. Read-only (rolled back).
begin;
create temp table _tid on commit drop as select m.user_id id from public.kr8_members m where public.kr8_is_test_member(m.user_id);
create temp table _tpost on commit drop as select p.id from public.kr8_posts p join _tid on _tid.id = p.author;
create temp table _res (who text, fn text, leak int, n int) on commit drop;
create or replace function pg_temp.leak(t text) returns int language sql as
  $$ select (select count(*) from _tid where position(_tid.id::text in coalesce(t,'')) > 0)::int + (select count(*) from _tpost where position(_tpost.id::text in coalesce(t,'')) > 0)::int $$;
do $$
declare who text; uid uuid; t text; fns text[] := array[
  'select json_agg(x)::text from public.kr8_feed(null, 100) x',
  'select json_agg(x)::text from public.kr8_feed_ranked(null, 100, 0, ''leakcheck'') x',
  'select json_agg(x)::text from public.kr8_people(200) x',
  'select public.kr8_feed_new_faces(168)::text',
  'select public.kr8_ask_feed(null, 100)::text',
  'select public.kr8_feed_vote_cards(12)::text',
  'select json_agg(x)::text from public.kr8_week_board(public.kr8_week_start(now()), false) x',
  'select json_agg(x)::text from public.kr8_top10(''week'', null) x',
  'select public.kr8_weekly_ranking(''all'')::text',
  'select public.kr8_web_reels(null, null, 100)::text',
  'select public.kr8_task_extra()::text',
  'select public.kr8_b5_row()::text',
  'select public.kr8_newcomers_board(20)::text',
  'select public.kr8_onb_follow_suggest(8)::text',
  'select public.kr8_onb_alike(''any'', null, 20)::text',
  'select public.kr8_tag_candidates('''', 50)::text',
  'select public.kr8_place_page(''fce6c1dc-5480-47ed-905b-1f9c8c248829'')::text',
  'select public.kr8_place_page(''b4b23bef-36b0-4011-b73b-64d68e1fdd02'')::text'];
  f text;
begin
  foreach who in array array['member', 'visitor'] loop
    uid := case when who = 'member' then (select m.user_id from public.kr8_members m where m.verified and not m.ghost and not public.kr8_is_test_member(m.user_id)
                                            and not public.kr8_is_team(m.user_id) and not public.kr8_is_admin_uid(m.user_id) order by m.last_active_at desc nulls last limit 1) end;
    perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'role', 'authenticated')::text end, true);
    foreach f in array fns loop
      begin execute f into t; insert into _res values (who, split_part(split_part(f, 'public.', 2), '(', 1), pg_temp.leak(t), length(coalesce(t,'')));
      exception when others then insert into _res values (who, split_part(split_part(f, 'public.', 2), '(', 1), null, -1); end;
    end loop;
  end loop;
end $$;
select json_build_object('test_accounts', (select count(*) from _tid), 'test_posts', (select count(*) from _tpost),
  'leaks', coalesce((select json_agg(r) from _res r where r.leak > 0), '[]'::json),
  'ran', (select json_agg(json_build_object('who', who, 'fn', fn, 'bytes', n)) from _res)) r;
rollback;
