-- 0137 Reel video watch test (throwaway / LOCAL DB only; everything rolls back). Prints PASS lines; any failure raises.
-- Run: tools/robots/run_local_test.sh
begin;
create or replace function pg_temp.ok(c boolean, m text) returns void language plpgsql as $$
begin if coalesce(c, false) then raise notice 'PASS %', m; else raise exception 'FAIL %', m; end if; end $$;
create or replace function pg_temp.u(n int) returns uuid language sql as $$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
insert into public.kr8_members values (pg_temp.u(1), 24, 'Joob'), (pg_temp.u(2), 30, 'Mint');
insert into public.kr8_posts (id, author, video_path, status, created_at) values
  (pg_temp.u(11), pg_temp.u(1), 'a/gone.mp4', 'approved', now() - interval '2 days'),    -- approved, video deleted
  (pg_temp.u(12), pg_temp.u(2), 'b/here.mp4', 'approved', now() - interval '2 days'),    -- approved, video present
  (pg_temp.u(13), pg_temp.u(2), 'b/new.mp4',  'approved', now() - interval '5 minutes'), -- just posted: upload may still be landing
  (pg_temp.u(14), pg_temp.u(2), 'b/pend.mp4', 'pending',  now() - interval '2 days');    -- not approved: not judged
insert into storage.objects (bucket_id, name) values ('kr8-reels', 'b/here.mp4'), ('kr8-verify', 'a/gone.mp4');

-- dry run: alert only
update public.kr8_robot set mode = 'dry_run' where name = 'reel_file_watch';
select pg_temp.ok((public.kr8_reel_file_watch_run() ->> 'found')::int = 1 and not (select hidden from public.kr8_posts where id = pg_temp.u(11)),
  '1 dry run: 1 Reel without a video found, nothing hidden');
select pg_temp.ok((select severity = 'red' and title like '%#24 Joob%' and body like '%Dry run%' from public.kr8_robot_alerts where dedupe_key = 'reel_gone:' || pg_temp.u(11)),
  '2 red admin alert names #24 Joob');
-- on: hidden, off the board, logged with undo
update public.kr8_robot set mode = 'on' where name = 'reel_file_watch';
select pg_temp.ok((public.kr8_reel_file_watch_run() ->> 'hidden')::int = 1, '3 on: 1 Reel hidden');
select pg_temp.ok((select hidden and board_off and board_off_reason = 'video_missing' from public.kr8_posts where id = pg_temp.u(11)), '4 the Reel is hidden and off the board');
select pg_temp.ok((select not hidden from public.kr8_posts where id = pg_temp.u(12)) and (select not hidden from public.kr8_posts where id = pg_temp.u(13))
  and (select not hidden from public.kr8_posts where id = pg_temp.u(14)), '5 Reels with a video, just-posted and pending Reels are untouched');
select pg_temp.ok((select count(*) = 1 from public.kr8_robot_log where robot = 'reel_file_watch' and action = 'hid_reel_video_missing' and undo ->> 'sql' like '%hidden = false%'),
  '6 the hide is logged with its undo');
select pg_temp.ok((select body like '%was hidden%' and cleared_at is null from public.kr8_robot_alerts where dedupe_key = 'reel_gone:' || pg_temp.u(11)), '7 alert says it was hidden');
select pg_temp.ok((public.kr8_reel_file_watch_run() ->> 'found')::int = 0, '8 next run: nothing left to do (no repeat alerts)');
update public.kr8_robot set mode = 'off' where name = 'reel_file_watch';
update public.kr8_posts set hidden = false where id = pg_temp.u(11);
select pg_temp.ok((public.kr8_reel_file_watch_run() ->> 'found')::int = 0 and not (select hidden from public.kr8_posts where id = pg_temp.u(11)), '9 off: does nothing');
rollback;
