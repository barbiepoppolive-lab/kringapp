-- 0124 Fake Finder test (throwaway / LOCAL DB only; everything rolls back). Prints PASS lines; any failure raises.
-- Run: tools/fakefinder/run_local_test.sh  (stub schema → 0124 → this file)
begin;
create or replace function pg_temp.ok(c boolean, m text) returns void language plpgsql as $$
begin if coalesce(c, false) then raise notice 'PASS %', m; else raise exception 'FAIL %', m; end if; end $$;
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
-- a person's face code: seed = the person, d = small shift (face-api distance between vec(s,0) and vec(s,d) = d * sqrt(128))
create or replace function pg_temp.vec(s int, d real) returns real[] language sql as $$
  select array_agg((sin(s * 7.3 + i * 1.7) * 0.08 + d)::real order by i) from generate_series(1, 128) i $$;
create or replace function pg_temp.u(n int) returns uuid language sql as $$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.lvl(n int) returns text language sql as $$ select public.kr8_fake_level(pg_temp.u(n)) $$;
create or replace function pg_temp.codes(n int) returns text[] language sql as $$
  select coalesce(array_agg(x ->> 'code' order by x ->> 'code'), '{}') from public.kr8_fake_scores s, jsonb_array_elements(s.reasons) x where s.user_id = pg_temp.u(n) $$;

-- people
insert into auth.users (id, email) select pg_temp.u(n), 'm' || n || '@x.test' from unnest(array[201,202,203,204,205,210,211,212,213,214,215,220,230,231,240,241,256,264,266,298,302,900]) n;
update auth.users set email = 'boss@kringapp.com' where id = pg_temp.u(900);
insert into public.kr8_admin_emails values ('boss@kringapp.com');
insert into public.kr8_members (user_id, member_no, first_name, photo, verified, ref_code, created_at, last_active_at, who)
select pg_temp.u(n), n, 'M' || n, 'p/' || n || '.jpg', v, r, c, la, 'local' from (values
  (201, true,  null,     now() - interval '5 days', now()),
  (202, false, null,     now() - interval '4 days', now()),
  (203, true,  null,     now() - interval '3 days', now()),
  (204, true,  null,     now() - interval '3 days' + interval '2 hours', now()),
  (205, true,  null,     now() - interval '3 days', now()),
  (210, true,  null,     now() - interval '10 days', now()),
  (211, true,  'k00210', now() - interval '30 hours', now() - interval '30 hours' + interval '5 minutes'),
  (212, false, 'k00210', now() - interval '29 hours', now() - interval '29 hours' + interval '5 minutes'),
  (213, false, 'k00210', now() - interval '28 hours', now() - interval '28 hours' + interval '5 minutes'),
  (214, false, 'k00210', now() - interval '27 hours', now() - interval '27 hours' + interval '5 minutes'),
  (215, false, 'k00210', now() - interval '26 hours', now() - interval '26 hours' + interval '5 minutes'),
  (220, false, null,     now() - interval '6 days', now()),
  (230, true,  null,     now() - interval '6 days', now()),
  (231, true,  null,     now() - interval '6 days', now()),
  (240, true,  null,     now() - interval '9 days', now()),
  (241, true,  null,     now() - interval '9 days', now()),
  (256, true,  null,     now() - interval '8 days', now()),
  (264, true,  null,     now() - interval '8 days', now()),
  (266, true,  null,     now() - interval '8 days', now()),
  (298, true,  null,     now() - interval '2 days', now()),
  (302, false, null,     now() - interval '1 day',  now())
) t(n, v, r, c, la);

-- Reels on a Bangkok place
insert into public.kr8_places (id) values (pg_temp.u(5000));
insert into public.kr8_posts (id, author, created_at) select pg_temp.u(n), pg_temp.u(a), now() - interval '12 days' from (values
  (1001, 210), (1002, 210), (1101, 230), (1102, 230), (1103, 230), (1201, 231), (1202, 231), (1203, 231), (1401, 240), (1402, 240), (1403, 240)) t(n, a);
insert into public.kr8_post_places select id, pg_temp.u(5000) from public.kr8_posts;

-- face codes. A: #201 / #202 the same person (0.28, face check vs face check)
insert into public.kr8_face_prints (user_id, descriptor, source) values
  (pg_temp.u(201), pg_temp.vec(1, 0), 'verify'), (pg_temp.u(202), pg_temp.vec(1, 0.025), 'verify'),
-- B: the #98 bug. #298's face check is 0.47-0.50 from three DIFFERENT women (#256, #264, #266); her real 2nd account #302 is 0.37 card vs card
  (pg_temp.u(298), pg_temp.vec(9, 0), 'verify'), (pg_temp.u(256), pg_temp.vec(9, 0.042), 'verify'),
  (pg_temp.u(264), pg_temp.vec(9, 0.043), 'verify'), (pg_temp.u(266), pg_temp.vec(9, -0.044), 'verify'),
  (pg_temp.u(298), pg_temp.vec(9, 0.01), 'card'), (pg_temp.u(302), pg_temp.vec(9, 0.043), 'card');
-- #256 already won a Founding Local; the old rule had linked #298 ↔ #256 as 'face'
insert into public.kr8_prizes (member_id, kind, founding_no, amount_thb) values (pg_temp.u(256), 'founding', 1, 100);
insert into public.kr8_posts (author, created_at) values (pg_temp.u(298), now() - interval '1 day');
insert into public.kr8_account_links (a, b, reason, detail) values (least(pg_temp.u(298), pg_temp.u(256)), greatest(pg_temp.u(298), pg_temp.u(256)), 'face', '{"dist": 0.48}');

-- 0. the old rule refused #98 (sanity: the distances really are under the old 0.50)
select pg_temp.ok((select min(public.kr8_face_dist(a.descriptor, b.descriptor)) from public.kr8_face_prints a, public.kr8_face_prints b
                    where a.user_id = pg_temp.u(298) and b.user_id = pg_temp.u(256) and a.source = 'verify') between 0.45 and 0.50, '0a #298 vs #256 is 0.45-0.50 (old rule = same person)');

-- 1. per-source strengths
select pg_temp.ok(public.kr8_face_strength('verify', 'verify', 0.30) = 'same', '1a face check vs face check 0.30 = same');
select pg_temp.ok(public.kr8_face_strength('verify', 'claim', 0.48) = 'maybe', '1b face check vs claim 0.48 = maybe (was same)');
select pg_temp.ok(public.kr8_face_strength('card', 'card', 0.20) = 'maybe', '1c card vs card is never same, only maybe');
select pg_temp.ok(public.kr8_face_strength('card', 'verify', 0.46) = 'no', '1d card vs face check 0.46 = no');
select pg_temp.ok((select strength from public.kr8_face_nearest(pg_temp.u(298), 5) where user_id = pg_temp.u(256)) = 'maybe', '1e #298 vs #256 now maybe');
select pg_temp.ok((select strength from public.kr8_face_nearest(pg_temp.u(298), 5) where user_id = pg_temp.u(302)) = 'maybe', '1f #298 vs her 2nd account #302 (card 0.37) maybe');
select pg_temp.ok((select strength from public.kr8_face_nearest(pg_temp.u(201), 5) where user_id = pg_temp.u(202)) = 'same', '1g #201 vs #202 same');
update public.kr8_rings_config set value = 300 where key = 'face_same_max_cc';
select pg_temp.ok(public.kr8_face_strength('card', 'card', 0.20) = 'same', '1h thresholds are live config (cc same 0.30)');
update public.kr8_rings_config set value = 0 where key = 'face_same_max_cc';
select public.kr8_face_match_links(pg_temp.u(298));
select public.kr8_face_match_links(pg_temp.u(201));
select pg_temp.ok(exists (select 1 from public.kr8_account_links where reason = 'face_maybe' and pg_temp.u(298) in (a, b) and pg_temp.u(264) in (a, b))
                  and not exists (select 1 from public.kr8_account_links where reason = 'face' and pg_temp.u(298) in (a, b) and pg_temp.u(264) in (a, b)),
                  '1i look-alike = face_maybe flag only, no face link');
select pg_temp.ok(public.kr8_linked(pg_temp.u(201), pg_temp.u(202)), '1j same face = face link');

-- 2. old links: list, then downgrade (logged, undoable)
select pg_temp.ok((public.kr8_face_relink_0124(false) ->> 'count')::int = 1, '2a relink dry run lists the old #298 ↔ #256 face link');
select pg_temp.ok(public.kr8_linked(pg_temp.u(298), pg_temp.u(256)), '2b dry run changed nothing');
select public.kr8_face_relink_0124(true);
select pg_temp.ok(not public.kr8_linked(pg_temp.u(298), pg_temp.u(256)), '2c applied: no longer linked');
select pg_temp.ok(exists (select 1 from public.kr8_account_links where reason = 'face_maybe' and pg_temp.u(298) in (a, b) and pg_temp.u(256) in (a, b)), '2d …now a face_maybe flag');
select pg_temp.ok(exists (select 1 from public.kr8_fake_log where action = 'relink'), '2e logged');

-- 3. Founding Local: #98 no longer refused for a look-alike; a SAME face still is
select pg_temp.ok(public.kr8_founding_try(pg_temp.u(298)) is not null, '3a #298 gets her Founding Local (look-alike ≠ same person)');
insert into public.kr8_posts (author, created_at) values (pg_temp.u(202), now() - interval '1 day');
insert into public.kr8_prizes (member_id, kind, founding_no, amount_thb) values (pg_temp.u(201), 'founding', 9, 100);
select pg_temp.ok(public.kr8_founding_try(pg_temp.u(202)) is null, '3b #202 (same face as winner #201) still refused');

-- activity
-- device: #202 on #201's phone (app device id)
insert into public.kr8_client_events (user_id, kind, did, ua, created_at) values
  (pg_temp.u(201), 'device_seen', 'did-aaaaaaaaaaaaaaaa', 'Mozilla/5.0 (iPhone)', now() - interval '1 day'),
  (pg_temp.u(202), 'device_seen', 'did-aaaaaaaaaaaaaaaa', 'Mozilla/5.0 (iPhone)', now() - interval '1 day'),
-- network: #203 and #204 same Wi-Fi + same phone model, joined 2 h apart (alone = 15 = green)
  (pg_temp.u(203), 'device_seen', 'did-bbbbbbbbbbbbbbb1', 'Mozilla/5.0 (Linux; Android 14; SM-A546E)', now()),
  (pg_temp.u(204), 'device_seen', 'did-bbbbbbbbbbbbbbb2', 'Mozilla/5.0 (Linux; Android 14; SM-A546E)', now()),
-- robot browser
  (pg_temp.u(205), 'device_seen', 'did-ccccccccccccccc1', 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0', now()),
  (pg_temp.u(220), 'device_seen', 'did-ccccccccccccccc2', 'Mozilla/5.0 (Linux; Android 9; BlueStacks)', now());
update public.kr8_client_events set ip_hash = 'net-1' where user_id in (pg_temp.u(203), pg_temp.u(204));
-- booster ring: #211-#215 joined on #210's link within 6 h, each liked + saved #210's two Reels within 10 min, then nothing
insert into public.kr8_post_likes (user_id, post_id, created_at)
select pg_temp.u(f), pg_temp.u(p), m.created_at + interval '3 minutes' from unnest(array[211,212,213,214,215]) f, unnest(array[1001,1002]) p
  join public.kr8_members m on true where m.user_id = pg_temp.u(f);
-- #220: 4 of 4 likes to #240 (one target) + emulator → amber
insert into public.kr8_post_likes (user_id, post_id, created_at) select pg_temp.u(220), pg_temp.u(p), now() - interval '2 days' from unnest(array[1401,1402,1403]) p;
insert into public.kr8_post_saves (user_id, post_id, created_at) values (pg_temp.u(220), pg_temp.u(1401), now() - interval '2 days');
-- #230 ↔ #231 swap likes
insert into public.kr8_post_likes (user_id, post_id, created_at) select pg_temp.u(230), pg_temp.u(p), now() - interval '3 days' from unnest(array[1201,1202,1203]) p;
insert into public.kr8_post_likes (user_id, post_id, created_at) select pg_temp.u(231), pg_temp.u(p), now() - interval '3 days' from unnest(array[1101,1102,1103]) p;
-- #202 (red later) and #241 (green, verified) like #240's Reel
insert into public.kr8_post_likes (user_id, post_id, created_at) values (pg_temp.u(202), pg_temp.u(1401), now() - interval '2 days'),
  (pg_temp.u(241), pg_temp.u(1401), now() - interval '2 days');
-- a burst on the founder's own link alone: 6 joins in 2 h, real behaviour → 0 points
insert into auth.users (id, email) select pg_temp.u(n), 'b' || n || '@x.test' from generate_series(601, 606) n;
insert into public.kr8_members (user_id, member_no, first_name, photo, ref_code, created_at)
select pg_temp.u(n), n, 'B' || n, 'p.jpg', 'pich', now() - interval '3 hours' + (n - 600) * interval '15 minutes' from generate_series(601, 606) n;

-- 4. run
select pg_temp.ok((public.kr8_fake_score_run() ->> 'ok')::boolean, '4a robot runs');
select pg_temp.ok(pg_temp.lvl(202) = 'red' and pg_temp.codes(202) @> array['face_match', 'same_device'], '4b #202 red: same face + same phone (2 independent checks)');
select pg_temp.ok(pg_temp.lvl(201) = 'red', '4c #201 red too (same face + same phone as #202) — the founder decides which is real');
select pg_temp.ok(pg_temp.lvl(203) = 'green' and pg_temp.codes(203) = array['same_network_join'], '4d same Wi-Fi + phone model alone = green (15)');
select pg_temp.ok(pg_temp.lvl(205) = 'green' and pg_temp.codes(205) = array['bot_browser'], '4e robot browser alone = green (20)');
select pg_temp.ok(pg_temp.lvl(211) = 'red' and pg_temp.codes(211) @> array['burst_booster', 'chain_member', 'clone_pattern', 'join_like_leave', 'one_target'],
                  '4f booster ring member red (burst + chain + clone + join-like-leave + one target)');
select pg_temp.ok((select reasons::text like '%who invited them%' from public.kr8_fake_scores where user_id = pg_temp.u(212)), '4g reason says "who invited them"');
select pg_temp.ok(pg_temp.codes(210) = array['chain_root'] and pg_temp.lvl(210) = 'green', '4h the ring''s root: chain_root (25) only = green');
select pg_temp.ok(pg_temp.lvl(220) = 'amber' and pg_temp.codes(220) = array['bot_browser', 'one_target'], '4i one target + emulator = amber');
select pg_temp.ok(pg_temp.lvl(230) = 'amber' and pg_temp.codes(230) = array['mutual_pair', 'one_target'], '4j like-swapping pair = amber');
select pg_temp.ok(pg_temp.lvl(298) = 'green' and pg_temp.codes(298) = array['face_match'], '4k #298 (look-alikes only) green, flagged 20');
select pg_temp.ok(pg_temp.lvl(601) = 'green' and pg_temp.codes(601) = '{}', '4l a burst of joins alone = 0 points (growth is good)');
select pg_temp.ok((select level from public.kr8_fake_scores where user_id = pg_temp.u(241)) = 'green', '4m normal member green');
-- red needs 2 independent kinds: same face only (score capped at amber)
update public.kr8_rings_config set value = 30 where key = 'fake_red_min';
select public.kr8_fake_score_run();
select pg_temp.ok(pg_temp.lvl(298) = 'green' and pg_temp.lvl(220) = 'red', '4n lower red_min: 2-kind #220 turns red…');
insert into public.kr8_face_prints (user_id, descriptor, source) values (pg_temp.u(203), pg_temp.vec(30, 0), 'verify'), (pg_temp.u(205), pg_temp.vec(30, 0.02), 'verify');
select public.kr8_fake_score_run();
select pg_temp.ok((select score from public.kr8_fake_scores where user_id = pg_temp.u(205)) >= 30 and pg_temp.lvl(205) = 'red', '4o …face + robot browser = 2 kinds = red');
delete from public.kr8_face_prints where user_id in (pg_temp.u(203), pg_temp.u(205));
update public.kr8_rings_config set value = 61 where key = 'fake_red_min';
select public.kr8_fake_score_run();

-- every Reel on a Bangkok place
insert into public.kr8_post_places select id, pg_temp.u(5000) from public.kr8_posts p where not exists (select 1 from public.kr8_post_places pp where pp.post_id = p.id);

-- 5. alert
select pg_temp.ok(exists (select 1 from public.kr8_robot_alerts where dedupe_key = 'fake:' || pg_temp.u(202) and cleared_at is null and severity = 'red'
                          and body like '%Face looks the same as #201%'), '5a red alert fake:<user> with reasons');
select pg_temp.ok(not exists (select 1 from public.kr8_robot_alerts where dedupe_key = 'fake:' || pg_temp.u(220) and cleared_at is null), '5b amber: no alert (cleared when it left red)');

-- 6. effects: board / Rings
select pg_temp.ok((select l_local from public.kr8_reel_scores(now() - interval '30 days', now(), now(), false) where post_id = pg_temp.u(1401)) = 1,
                  '6a #240''s Reel: only #241''s like counts (red #202 and amber-unverified #220 do not)');
select pg_temp.ok(not exists (select 1 from public.kr8_reel_scores(now() - interval '30 days', now(), now(), false) where author = pg_temp.u(202)), '6b no red author on the board');
update public.kr8_members set verified = true where user_id = pg_temp.u(220);
select pg_temp.ok((select l_local + s_local from public.kr8_reel_scores(now() - interval '30 days', now(), now(), false) where post_id = pg_temp.u(1401)) = 3,
                  '6c amber #220 verified → their like + save count again');
update public.kr8_members set verified = false where user_id = pg_temp.u(220);
select pg_temp.ok((select sum(l_local) from public.kr8_reel_scores(now() - interval '30 days', now(), now(), false) where author = pg_temp.u(210)) = 0,
                  '6d the booster ring''s likes give #210 nothing');
-- People
select pg_temp.as_user(pg_temp.u(241));
select pg_temp.ok(not exists (select 1 from public.kr8_people(200) where user_id = pg_temp.u(202)), '6e red hidden from People');
select pg_temp.ok(exists (select 1 from public.kr8_people(200) where user_id = pg_temp.u(220)), '6f amber still in People');
-- claims
select pg_temp.as_user(pg_temp.u(202));
select pg_temp.ok((public.kr8_claim_prize(gen_random_uuid(), 'grab', 'dev') -> 'review') ? 'fake_red', '6g red claim held (fake_red)');
select pg_temp.as_user(pg_temp.u(241));
select pg_temp.ok(not (public.kr8_claim_prize(gen_random_uuid(), 'grab', 'dev') ->> 'held')::boolean, '6h green claim not held');
-- master switch
update public.kr8_rings_config set value = 0 where key = 'fake_effects_on';
select pg_temp.ok(pg_temp.lvl(202) = 'green' and exists (select 1 from public.kr8_people(200) where user_id = pg_temp.u(202)), '6i fake_effects_on = 0 turns every effect off');
update public.kr8_rings_config set value = 1 where key = 'fake_effects_on';

-- 7. admin
do $$ begin perform public.kr8_admin_fake_list(); raise exception 'FAIL 7a'; exception when others then
  if sqlerrm <> 'KR8_ADMIN_ONLY' then raise; end if; raise notice 'PASS 7a members cannot read the list'; end $$;
select pg_temp.as_user(pg_temp.u(900));
select pg_temp.ok((select count(*) from jsonb_array_elements(public.kr8_admin_fake_list() -> 'members') x where x ->> 'effective' = 'red') >= 7, '7b list has the red members');
select pg_temp.ok((select x -> 'linked' from jsonb_array_elements(public.kr8_admin_fake_list() -> 'members') x where x ->> 'user_id' = pg_temp.u(202)::text)::text like '%' || pg_temp.u(201) || '%',
                  '7c list shows #202''s linked account #201');
select pg_temp.ok((select jsonb_agg(v) from jsonb_each_text(public.kr8_admin_fake_list() -> 'patches') t(k, v)) <@ '["patched","already"]'::jsonb
                  and (select count(*) from jsonb_object_keys(public.kr8_admin_fake_list() -> 'patches')) = 4, '7d all 4 live patches applied');
select public.kr8_admin_fake_decide(pg_temp.u(202), 'clear');
select pg_temp.ok(pg_temp.lvl(202) = 'green', '7e Clear → green');
select pg_temp.ok(not exists (select 1 from public.kr8_robot_alerts where dedupe_key = 'fake:' || pg_temp.u(202) and cleared_at is null), '7f Clear closes the alert');
select public.kr8_fake_score_run();
select pg_temp.ok(pg_temp.lvl(202) = 'green', '7g re-run with the same evidence: stays cleared');
insert into public.kr8_photo_ai (user_id, verdict, reason, photo) values (pg_temp.u(202), 'fake', 'AI-made face', 'p/202.jpg');
select public.kr8_fake_score_run();
select pg_temp.ok(pg_temp.lvl(202) = 'red' and exists (select 1 from public.kr8_fake_log where action = 'reflag' and user_id = pg_temp.u(202)), '7h NEW evidence (AI photo) → red again, logged');
select public.kr8_admin_fake_decide(pg_temp.u(203), 'keep_red');
select pg_temp.ok(pg_temp.lvl(203) = 'red', '7i Keep red wins over a green score');
select public.kr8_admin_fake_decide(pg_temp.u(203), 'reset');
select pg_temp.ok(pg_temp.lvl(203) = 'green', '7j Reset = back to the robot''s level');
select public.kr8_admin_fake_decide(pg_temp.u(211), 'ghost');
select pg_temp.ok((select ghost from public.kr8_members where user_id = pg_temp.u(211)), '7k Ghost uses ghost_set (trigger let it through)');
update public.kr8_members set ghost = false where user_id = pg_temp.u(211);
select pg_temp.ok((select ghost from public.kr8_members where user_id = pg_temp.u(211)), '7l …and a plain update still cannot unghost');
select pg_temp.ok((select count(*) from public.kr8_fake_log where action in ('clear', 'keep_red', 'reset', 'ghost')) = 4, '7m every decision logged');
do $$ begin perform public.kr8_admin_fake_decide(pg_temp.u(211), 'delete'); raise exception 'FAIL 7n'; exception when others then
  if sqlerrm <> 'KR8_BAD_DECISION' then raise; end if; raise notice 'PASS 7n no other decisions (nothing is deleted)'; end $$;
select pg_temp.ok((select count(*) from public.kr8_members) = 27, '7o nobody deleted');

-- 8. device id logger
select pg_temp.as_user(pg_temp.u(241));
select set_config('t.ip', 'iphash-1', true);
select public.kr8_log_client('device_seen', null, null, 'UA', 'abcdefgh-1234-5678-9abc');
select public.kr8_log_client(p_kind => 'face_fail', p_code => 'X', p_detail => null, p_ua => 'UA');   -- an old app build (4 named arguments)
select public.kr8_log_client('device_seen', null, null, 'UA', 'bad id!');
select pg_temp.ok((select array_agg(coalesce(did, '-') order by id) from public.kr8_client_events where user_id = pg_temp.u(241)) = array['abcdefgh-1234-5678-9abc', '-', '-'],
                  '8a device id stored; old 4-argument call works; a bad id is dropped');
select pg_temp.ok((select bool_and(ip_hash = 'iphash-1') from public.kr8_client_events where user_id = pg_temp.u(241)), '8b network hash stored');
select pg_temp.ok(exists (select 1 from public.kr8_heartbeat where job = 'cron:kr8_fake_finder' and detail ->> 'cron' = '7-59/15 * * * *'), '8c scheduled every 15 min');

-- 9. a live body that differs from the repo: the patch changes nothing and says why
create function public.kr8_tmp_drift() returns int language sql as $$ select 1 $$;
select pg_temp.ok(public.kr8_fake_patch('public.kr8_tmp_drift()', array['select 2', 'select 3 /*fake0124*/']) like 'anchor 1 found 0 times%'
                  and public.kr8_tmp_drift() = 1, '9a missing anchor → not patched, body untouched, logged');
select pg_temp.ok(public.kr8_fake_patch('public.kr8_nope()', array['a', 'b']) = 'missing', '9b missing function → missing');

rollback;
