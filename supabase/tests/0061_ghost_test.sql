-- 0061 ghost mode: run on a SCRATCH database only (never the live project), after the repo's migrations 0022…0060 + 0061
-- on a Supabase look-alike stub (roles, auth.users, auth.uid() from request.jwt.claim.sub, vault/net/cron stubs) and a
-- scratch kr8_is_test_member. Every check prints PASS/FAIL. Seeds its own members; touches nothing else.
\set QUIET on
\pset tuples_only on
create or replace function pg_temp.ok(c boolean, n text) returns text language sql as $$ select (case when c then 'PASS ' else 'FAIL ' end) || n $$;
create or replace function pg_temp.err(q text) returns text language plpgsql as $$ begin execute q; return 'no error'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.as_(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', coalesce(u, ''), false); $$;
\set G '0a000000-0000-4000-8000-00000000000a'
\set B '0b000000-0000-4000-8000-00000000000b'
\set C '0c000000-0000-4000-8000-00000000000c'
\set R '0d000000-0000-4000-8000-00000000000d'
\set PL '0e000000-0000-4000-8000-00000000000e'
\set O '0f000000-0000-4000-8000-00000000000f'

begin;   -- everything below is rolled back at the end
-- seed (as the database owner: no caller = admin)
select pg_temp.as_(null);
insert into auth.users (id, email, email_confirmed_at) values (:'G', 'ghost-founder@example.test', now()), (:'B', 'b@example.test', now()), (:'C', 'c@example.test', now());
insert into public.kr8_admin_emails (email) values ('ghost-founder@example.test');
insert into public.kr8_members (user_id, first_name, photo, langs, who, age_ok_at) values
  (:'G', 'Delta', 'https://x/g.jpg', '{EN}', 'traveller', now()), (:'B', 'Ploy', 'https://x/b.jpg', '{TH}', 'local', now()), (:'C', 'Ton', 'https://x/c.jpg', '{TH}', 'local', now());
insert into public.kr8_places (id, name_en, lat, lng) values (:'PL', 'Talat Noi', 13.73, 100.51);
insert into public.kr8_posts (id, author, kind, status, poster_path, video_path, duration_ms, width, height)
  values (:'R', :'B', 'reel', 'approved', :'B' || '/' || :'R' || '.jpg', :'B' || '/' || :'R' || '.mp4', 12000, 720, 1280);
insert into public.kr8_post_places (post_id, place_id, position) values (:'R', :'PL', 1);
-- before ghost mode: Delta follows Ploy and likes her Reel (normal member)
select pg_temp.as_(:'G');
select pg_temp.ok(pg_temp.err(format('select public.kr8_follow(%L)', :'B')) = 'no error', 'before: Delta follows Ploy');
select pg_temp.ok((public.kr8_toggle_like(:'R') ->> 'liked')::boolean, 'before: Delta likes Ploy''s Reel');
select pg_temp.ok(exists (select 1 from public.kr8_people() where user_id = :'G') = false and (select count(*) from public.kr8_people()) = 2, 'Delta sees 2 people');
select pg_temp.as_(:'B');
select pg_temp.ok(exists (select 1 from public.kr8_people() where user_id = :'G'), 'before: Ploy sees Delta in People');
select pg_temp.ok(exists (select 1 from public.kr8_follow_list(:'B', 'followers') where user_id = :'G'), 'before: Delta is in Ploy''s followers');

-- who can switch it
select pg_temp.ok(pg_temp.err(format('select public.kr8_admin_set_ghost(true, %L)', :'G')) = 'KR8_ADMIN_ONLY', 'a normal member cannot switch ghost mode');
update public.kr8_members set ghost = true where user_id = :'B';
select pg_temp.ok(not (select ghost from public.kr8_members where user_id = :'B'), 'a plain update of the row cannot set ghost');
select pg_temp.ok(not public.kr8_my_ghost(), 'Ploy: kr8_my_ghost = false');
select pg_temp.as_(:'G');
select pg_temp.ok((public.kr8_admin_ghost_me() ->> 'ghost')::boolean = false and (public.kr8_admin_ghost_me() ->> 'first_name') = 'Delta', 'admin sees own card, ghost off');
select public.kr8_set_here(true);
select pg_temp.ok((public.kr8_admin_set_ghost(true) ->> 'ghost')::boolean, 'admin switches ghost mode on for own card');
select pg_temp.ok(public.kr8_my_ghost(), 'Delta: kr8_my_ghost = true');
select pg_temp.ok((select here_until from public.kr8_members where user_id = :'G') is null, 'switching on ends "I''m here"');

-- presence never moves
select public.kr8_touch();
select public.kr8_set_here(true);
select pg_temp.ok((select last_active_at is null and here_until is null from public.kr8_members where user_id = :'G'), 'ghost: kr8_touch / kr8_set_here leave no online / here');

-- actions others would notice: refused, nothing stored
select pg_temp.ok(pg_temp.err(format('select public.kr8_toggle_like(%L)', :'R')) in ('no error', 'KR8_GHOST'), 'unlike is allowed (removes the old like)');
select pg_temp.ok(pg_temp.err(format('select public.kr8_toggle_like(%L)', :'R')) = 'KR8_GHOST', 'ghost like refused');
select pg_temp.ok((select likes_count from public.kr8_posts where id = :'R') = 0 and not exists (select 1 from public.kr8_post_likes where user_id = :'G'), 'no like stored, count not raised');
select pg_temp.ok(pg_temp.err(format('select public.kr8_toggle_save(%L)', :'R')) = 'KR8_GHOST', 'ghost save refused');
select pg_temp.ok(pg_temp.err(format('select public.kr8_follow(%L)', :'C')) = 'KR8_GHOST', 'ghost follow refused');
select pg_temp.ok(pg_temp.err(format('select public.kr8_send_hello(%L, %L)', :'C', 'hi')) = 'KR8_GHOST', 'ghost hello refused');
select pg_temp.ok(not exists (select 1 from public.kr8_threads where opened_by = :'G'), 'no chat opened');
select pg_temp.ok(pg_temp.err('select public.kr8_create_post(''reel'', ''Bangkok'', ''x'', null, null, false)') <> 'no error'
                  and not exists (select 1 from public.kr8_posts where author = :'G'), 'ghost cannot post');
select pg_temp.ok(public.kr8_log_reel_view(:'R') = false, 'ghost Reel view returns false');
select pg_temp.ok((select views_count from public.kr8_posts where id = :'R') = 0 and (select count(*) from public.kr8_post_views where post_id = :'R') = 0, 'ghost Reel view not logged, views_count not raised');
select pg_temp.ok(public.kr8_log_reel_share(:'R', 'copy') = false, 'ghost share returns false');
select pg_temp.ok((select shares_count from public.kr8_posts where id = :'R') = 0 and not exists (select 1 from public.kr8_post_shares), 'ghost share not logged');
-- a share-link open stored by /r, then claimed by the ghost's app
select pg_temp.as_(null);
insert into public.kr8_share_opens (id, post_id, bkk_date, session, device, source, ok) values (:'O', :'R', current_date, 'sess-0000000000000001', repeat('a', 32), 'line', true);
select pg_temp.as_(:'G');
select pg_temp.ok(public.kr8_share_open_seen(:'O'), 'the ghost''s app claims the open');
select pg_temp.ok((select not ok and why = 'ghost' from public.kr8_share_opens where id = :'O'), 'ghost share-open stops counting (ok = false, why = ghost)');
select pg_temp.ok(coalesce((select opens from public.kr8_reel_scores('-infinity', 'infinity', 'infinity', false) where post_id = :'R'), 0) = 0, 'Ploy''s score gets no opens from the ghost');

-- the ghost still sees everything
select pg_temp.ok((select count(*) from public.kr8_people()) = 2, 'ghost still sees People (2)');
select pg_temp.ok((public.kr8_profile(:'B') ->> 'first_name') = 'Ploy', 'ghost opens a profile');
select pg_temp.ok(exists (select 1 from public.kr8_feed('Bangkok', 20) f where f.id = :'R'), 'ghost sees the Reel in the feed');
select pg_temp.ok(public.kr8_reel_open(:'R') = :'B'::uuid, 'ghost opens the Reel');

-- nobody else sees the ghost
select pg_temp.as_(:'B');
select pg_temp.ok(not exists (select 1 from public.kr8_people() where user_id = :'G') and exists (select 1 from public.kr8_people() where user_id = :'C'), 'Ploy: People / nearby / online list has no ghost');
select pg_temp.ok(pg_temp.err(format('select public.kr8_profile(%L)', :'G')) = 'KR8_NO_PERSON', 'Ploy: ghost profile = person not available');
select pg_temp.ok(not exists (select 1 from public.kr8_follow_list(:'B', 'followers') where user_id = :'G'), 'Ploy: followers list has no ghost (old follow hidden)');
select pg_temp.ok(((public.kr8_profile(:'B') ->> 'followers')::int) >= 0, 'Ploy: own profile still opens');
select pg_temp.ok(not exists (select 1 from public.kr8_my_activity(50) where actor_id = :'G'), 'Ploy: Activity has no ghost follow / like');
select pg_temp.ok(not (public.kr8_tag_candidates('', 30)::text like '%' || :'G' || '%'), 'Ploy: tag / search list has no ghost');
select pg_temp.ok(pg_temp.err(format('select public.kr8_send_hello(%L, %L)', :'G', 'hi')) = 'KR8_BLOCKED', 'Ploy cannot say hi to the ghost');
select pg_temp.ok(pg_temp.err(format('select public.kr8_follow(%L)', :'G')) <> 'no error', 'Ploy cannot follow the ghost');
select pg_temp.ok(not public.kr8_my_ghost(), 'Ploy cannot read anyone''s ghost flag (only her own)');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.kr8_is_ghost(uuid)', 'execute'), 'kr8_is_ghost(any member) is not callable by members');
-- a normal member still logs views
select pg_temp.as_(:'C');
select pg_temp.ok(public.kr8_log_reel_view(:'R'), 'a normal member''s view is logged');
select pg_temp.ok((select views_count from public.kr8_posts where id = :'R') = 1, 'and counts');
select pg_temp.ok((public.kr8_toggle_like(:'R') ->> 'liked')::boolean, 'a normal member''s like still works');

-- off again: back to normal
select pg_temp.as_(:'G');
select pg_temp.ok(not (public.kr8_admin_set_ghost(false) ->> 'ghost')::boolean, 'admin switches ghost mode off');
select public.kr8_touch();
select pg_temp.ok((select last_active_at is not null from public.kr8_members where user_id = :'G'), 'off: online again');
select pg_temp.as_(:'B');
select pg_temp.ok(exists (select 1 from public.kr8_people() where user_id = :'G'), 'off: Ploy sees Delta again');
select pg_temp.as_(null);
rollback;
