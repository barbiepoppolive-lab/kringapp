-- 0085 (ranked feed). TEST DATABASE ONLY. One DO block: it ends by raising 'ALL 0085 CHECKS PASSED', so everything it made
-- (members, Reels, likes, config changes, and hiding every other post so only these Reels are ranked) is rolled back.
-- A failing check raises 'FAIL: …' instead.
do $t$
declare
  u uuid[] := array(select ('85000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid from generate_series(1, 30) g);
  r uuid[] := '{}';
  ord uuid[]; ord2 uuid[]; pg1 uuid[]; pg2 uuid[]; allp uuid[]; f1 uuid[]; f2 uuid[];
  sc1 numeric; sc2 numeric; n int; i int; w text; e text;
begin
  -- members 1..30: 1-8 posters, 9-28 likers (25-28 travellers, verified), 29 ghost (set in step 9), 30 Kring Team
  insert into auth.users (id, email) select x, 't85_' || left(x::text, 8) || substr(x::text, 35) || '@example.com' from unnest(u) x;
  insert into public.kr8_members (user_id, first_name, photo, langs, area, who, age_ok_at, created_at, verified)
  select u[g], 'T85 ' || g, 'https://x/' || g || '.jpg', '{TH}', 'Bangkok', case when g between 25 and 28 then 'traveller' else 'local' end,
         now(), now() - interval '30 days', g between 25 and 28
  from generate_series(1, 30) g;
  insert into public.kr8_team_accounts (user_id) values (u[30]) on conflict do nothing;

  -- only this test's Reels are in the feed; fixed knobs (no jitter, no test slots) for the score checks
  update public.kr8_posts set hidden = true where not hidden;
  insert into public.kr8_rings_config (key, value) values ('feed_jitter_pct', 0), ('feed_explore_every', 0), ('feed_ranked_on', 1)
  on conflict (key) do update set value = excluded.value;
  perform set_config('request.path', '/rpc/kr8_feed_ranked', true);
  perform set_config('request.jwt.claims', '{}', true);

  create function pg_temp.mk(au uuid, ar text, body text, age_h numeric, views int, st text default 'approved') returns uuid
  language sql as $f$
    insert into public.kr8_posts (author, kind, area, body, status, video_path, poster_path, duration_ms, width, height, created_at, views_count)
    values (au, 'reel', ar, body, st, au || '/' || gen_random_uuid() || '.mp4', au || '/' || gen_random_uuid() || '.jpg', 15000, 720, 1280,
            now() - make_interval(secs => (age_h * 3600)::double precision), views) returning id
  $f$;
  create function pg_temp.likes(p uuid, n int, first int default 9) returns void language sql as $f$
    insert into public.kr8_post_likes (post_id, user_id)
    select p, ('85000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid from generate_series(first, first + n - 1) g
  $f$;
  create function pg_temp.sc(p uuid) returns numeric language sql as $f$ select score from public.kr8_feed_order(null, 's') where post_id = p $f$;
  create function pg_temp.ids(seed text) returns uuid[] language sql as $f$ select array_agg(post_id order by pos) from public.kr8_feed_order(null, seed) $f$;

  -- 1. Bayesian: 2 likes on 3 views (raw 67%) is pulled towards the average (under 2× the average, not 3-6×) and does NOT
  --    beat 30 likes on 100 views (raw 30%), which has much more proof
  r[1] := pg_temp.mk(u[1], 'Ari', 'temple walk', 1, 3);    perform pg_temp.likes(r[1], 2);
  r[2] := pg_temp.mk(u[2], 'Siam', 'night ride', 1, 100);  perform pg_temp.likes(r[2], 20);   -- 16 locals + 4 travellers ×2 = 24 pts
  insert into public.kr8_post_saves (post_id, user_id) values (r[2], u[9]), (r[2], u[10]);         -- + 2 saves ×3 = 30 pts
  r[3] := pg_temp.mk(u[3], 'Silom', 'park', 1, 60);
  if pg_temp.sc(r[2]) <= pg_temp.sc(r[1]) then raise exception 'FAIL: 2/3 views outranks 30/100 (% vs %)', pg_temp.sc(r[1]), pg_temp.sc(r[2]); end if;
  if pg_temp.sc(r[1]) >= 2 then raise exception 'FAIL: 2/3 views not pulled to the average (%)', pg_temp.sc(r[1]); end if;

  -- 2. freshness: the same Reel 72 h old scores lower than 1 h old
  r[4] := pg_temp.mk(u[4], 'Bangkok', 'market', 72, 60);
  if pg_temp.sc(r[4]) >= pg_temp.sc(r[3]) then raise exception 'FAIL: older Reel not lower'; end if;
  if abs(pg_temp.sc(r[4]) / pg_temp.sc(r[3]) - power(0.5, 71 / 36.0)) > 0.02 then raise exception 'FAIL: half-life 36 h'; end if;

  -- 3. traveller likes count 2×, the author's own like and a linked duplicate account's like never count
  r[5] := pg_temp.mk(u[5], 'Bangkok', 'mall', 1, 40);  perform pg_temp.likes(r[5], 2, 25);      -- 2 travellers → 4 pts
  insert into public.kr8_post_likes (post_id, user_id) values (r[5], u[5]), (r[5], u[9]);         -- own + a linked account
  insert into public.kr8_account_links (a, b, reason) values (least(u[5], u[9]), greatest(u[5], u[9]), 'device');
  select why into w from public.kr8_feed_order(null, 's') where post_id = r[5];
  if w not like '%pts 4.0 / 40 views%' then raise exception 'FAIL: traveller 2× / own / linked (%)', w; end if;

  -- 4. demotions: Feed only ×0.6, one open report ×0.5, handled report no effect, two reporters → out, duplicate flag ×0.7
  sc1 := pg_temp.sc(r[3]);
  update public.kr8_posts set board_off = true where id = r[3];
  if abs(pg_temp.sc(r[3]) / sc1 - 0.6) > 0.001 then raise exception 'FAIL: board_off ×0.6'; end if;
  update public.kr8_posts set board_off = false where id = r[3];
  insert into public.kr8_reports (reporter, post_id, reason, category, handled_at) values (u[10], r[3], 'spam', 'spam', now());
  if abs(pg_temp.sc(r[3]) / sc1 - 1) > 0.001 then raise exception 'FAIL: handled report still demotes'; end if;
  insert into public.kr8_reports (reporter, post_id, reason, category) values (u[11], r[3], 'wrong_place', 'wrong_place');
  if abs(pg_temp.sc(r[3]) / sc1 - 0.5) > 0.001 then raise exception 'FAIL: open report ×0.5'; end if;
  insert into public.kr8_reports (reporter, post_id, reason, category) values (u[12], r[3], 'spam', 'spam');
  if r[3] = any (pg_temp.ids('s')) then raise exception 'FAIL: 2 open reports should leave it out'; end if;
  delete from public.kr8_reports where post_id = r[3];
  insert into public.kr8_account_links (a, b, reason) values (least(u[3], u[24]), greatest(u[3], u[24]), 'face');
  if abs(pg_temp.sc(r[3]) / sc1 - 0.7) > 0.001 then raise exception 'FAIL: duplicate flag ×0.7'; end if;
  update public.kr8_account_links set dismissed_at = now() where reason = 'face';
  if abs(pg_temp.sc(r[3]) / sc1 - 1) > 0.001 then raise exception 'FAIL: dismissed flag still demotes'; end if;

  -- 5. variety: author 6 posts 5 strong Reels → never twice in a row, at most 2 in any 10 while others exist
  for i in 1..5 loop r[10 + i] := pg_temp.mk(u[6], 'Bangkok', 'strong ' || i, 0.5, 30); perform pg_temp.likes(r[10 + i], 12); end loop;
  for i in 1..6 loop r[20 + i] := pg_temp.mk(u[(i % 4) + 1], 'Bangkok', 'filler ' || i, 2, 30); end loop;
  ord := pg_temp.ids('s');
  for i in 2..array_length(ord, 1) loop
    if (select author from public.kr8_posts where id = ord[i]) = (select author from public.kr8_posts where id = ord[i - 1])
       and exists (select 1 from unnest(ord[i:]) x join public.kr8_posts q on q.id = x where q.author <> (select author from public.kr8_posts where id = ord[i]))
    then raise exception 'FAIL: same author twice in a row at %', i; end if;
  end loop;
  select count(*) into n from unnest(ord[1:10]) x join public.kr8_posts q on q.id = x where q.author = u[6];
  if n > 2 then raise exception 'FAIL: % Reels by one author in the top 10', n; end if;

  -- 6. food: 4 strong food Reels → no two back to back, at most 2 in the top 10
  for i in 1..4 loop r[30 + i] := pg_temp.mk(u[7 + (i % 2)], 'Bangkok', 'อร่อยมาก street food ' || i, 0.2, 30); perform pg_temp.likes(r[30 + i], 14); end loop;
  ord := pg_temp.ids('s');
  select count(*) into n from unnest(ord[1:10]) x join public.kr8_posts q on q.id = x where q.body like '%street food%';
  if n > 2 then raise exception 'FAIL: % food Reels in the top 10', n; end if;
  if n < 1 then raise exception 'FAIL: food should still be in the top 10 (1-2 stories)'; end if;
  for i in 2..10 loop
    if (select body like '%street food%' from public.kr8_posts where id = ord[i]) and (select body like '%street food%' from public.kr8_posts where id = ord[i - 1])
    then raise exception 'FAIL: two food Reels back to back at %', i; end if;
  end loop;

  -- 7. test slot: a brand-new 0-view Reel with the weakest score gets slot 3
  update public.kr8_rings_config set value = 4 where key = 'feed_explore_every';
  update public.kr8_posts set views_count = 40 where id = any (r) and views_count < 25;   -- everything else is "tested"
  r[40] := pg_temp.mk(u[2], 'Bangkok', 'brand new', 0.1, 0);
  update public.kr8_posts set board_off = true where id = r[40];                           -- weakest score on purpose
  ord := pg_temp.ids('s');
  if ord[3] <> r[40] then raise exception 'FAIL: new Reel not in test slot 3 (at %)', array_position(ord, r[40]); end if;
  update public.kr8_rings_config set value = 0 where key = 'feed_explore_every';

  -- 8. deterministic per seed, jitter changes the mix between seeds; paging with the same seed joins up
  update public.kr8_rings_config set value = 15 where key = 'feed_jitter_pct';
  if pg_temp.ids('seed-A') is distinct from pg_temp.ids('seed-A') then raise exception 'FAIL: same seed, different order'; end if;
  if not exists (select 1 from generate_series(1, 20) g where pg_temp.ids('seed-' || g) is distinct from pg_temp.ids('seed-A'))
  then raise exception 'FAIL: seeds never change the mix'; end if;
  select array_agg(id order by rank) into pg1 from public.kr8_feed_ranked(null, 5, 0, 'seed-A');
  select array_agg(id order by rank) into pg2 from public.kr8_feed_ranked(null, 5, 5, 'seed-A');
  select array_agg(id order by rank) into allp from public.kr8_feed_ranked(null, 10, 0, 'seed-A');
  if pg1 || pg2 is distinct from allp then raise exception 'FAIL: paging does not join up'; end if;

  -- 9. guests: same Reels as kr8_feed (14 days) minus ghosts and Kring Team; signed in: blocks, "hide", own pending on top
  r[50] := pg_temp.mk(u[29], 'Bangkok', 'ghost reel', 1, 10);     -- posted first: a ghost cannot post (KR8_GHOST)
  perform set_config('kr8.ghost_set', '1', true);                  -- the ghost guard trigger only lets ghost change with this set
  update public.kr8_members set ghost = true where user_id = u[29];
  r[51] := pg_temp.mk(u[30], 'Bangkok', 'team reel', 1, 10);
  r[52] := pg_temp.mk(u[1], 'Bangkok', 'pending', 0.1, 0, 'pending');
  r[53] := pg_temp.mk(u[2], 'Bangkok', 'hidden', 0.1, 0);  update public.kr8_posts set hidden = true where id = r[53];
  r[54] := pg_temp.mk(u[3], 'Bangkok', 'old', 20 * 24, 0);
  update public.kr8_rings_config set value = 14 where key = 'feed_window_days';
  select array_agg(id order by id) into f1 from public.kr8_feed(null, 100) where author_name not in ('T85 29', 'T85 30');
  select array_agg(id order by id) into f2 from public.kr8_feed_ranked(null, 100, 0, 'x');
  if f1 is distinct from f2 then raise exception 'FAIL: guest feed rows differ from kr8_feed'; end if;
  if r[50] = any (f2) or r[51] = any (f2) or r[52] = any (f2) or r[53] = any (f2) or r[54] = any (f2) then raise exception 'FAIL: guest sees ghost/team/pending/hidden/old'; end if;
  update public.kr8_rings_config set value = 30 where key = 'feed_window_days';
  if not r[54] = any (pg_temp.ids('x')) then raise exception 'FAIL: 30-day window'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', u[1], 'role', 'authenticated')::text, true);
  insert into public.kr8_blocks (blocker, blocked) values (u[1], u[2]);
  insert into public.kr8_post_hidden (user_id, post_id) values (u[1], r[3]);
  select array_agg(id order by rank) into f2 from public.kr8_feed_ranked(null, 100, 0, 'x');
  if f2[1] <> r[52] then raise exception 'FAIL: own pending Reel not first'; end if;
  if exists (select 1 from unnest(f2) x join public.kr8_posts q on q.id = x where q.author in (u[2], u[29], u[30]) or q.id = r[3])
  then raise exception 'FAIL: member sees blocked / ghost / team / hidden-by-me'; end if;

  -- 10. already watched ×0.35 for that member only
  update public.kr8_rings_config set value = 0 where key = 'feed_jitter_pct';
  sc1 := pg_temp.sc(r[4]);
  insert into public.kr8_post_views (post_id, viewer_key) values (r[4], 'u:' || replace(u[1]::text, '-', ''));
  sc2 := pg_temp.sc(r[4]);
  if abs(sc2 / sc1 - 0.35) > 0.001 then raise exception 'FAIL: watched ×0.35 (% → %)', sc1, sc2; end if;

  -- 11. kill switch: newest first
  update public.kr8_rings_config set value = 0 where key = 'feed_ranked_on';
  select array_agg(id order by rank) into f2 from public.kr8_feed_ranked(null, 100, 0, 'x');
  select array_agg(id order by created_at desc) into f1 from public.kr8_feed_ranked(null, 100, 0, 'x') where id <> r[52];
  if f2[2:] is distinct from f1 then raise exception 'FAIL: ranking off is not newest first'; end if;

  -- 12. members and guests cannot call the internal order (scores, view counts)
  execute 'set local role authenticated';
  begin perform public.kr8_feed_order(null, null); e := 'member read kr8_feed_order'; exception when insufficient_privilege then e := null; end;
  if e is not null then raise exception 'FAIL: %', e; end if;
  perform 1 from public.kr8_feed_ranked(null, 5, 0, null);
  execute 'reset role';

  raise exception 'ALL 0085 CHECKS PASSED';
end $t$;
