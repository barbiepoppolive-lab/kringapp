-- 0113 test (throwaway / TEST DB only; everything rolls back). Prints PASS lines; any failure raises.
-- Phones: a = today via LINE, came back from yesterday; b = today from Google; c = today via ?ref=pich (no referrer);
--         d = today twice (two refs) via Facebook; e = automated test phone (zztest); f = localhost; g = pages.dev preview;
--         h = ?ref=test1; i = headless robot; j = pwa-install only; k = 3 days ago via Instagram (7-day period only).
-- People: R1 signed in + card via pich + Reel today; R2 signed in + card (k00100 invite) today; R3 signed in, no card;
--         T test card; G ghost card; A admin sign-in; M100 an older real member #100 (the inviter).
begin;
create or replace function pg_temp.ok(c boolean, m text) returns void language plpgsql as $$
begin if coalesce(c, false) then raise notice 'PASS %', m; else raise exception 'FAIL %', m; end if; end $$;
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create temp table t0 as select greatest(((now() at time zone 'Asia/Bangkok')::date)::timestamp at time zone 'Asia/Bangkok', now() - interval '1 minute') as at;

-- start from an empty counter inside this transaction (TEST may already hold rows)
delete from public.link_visits;
insert into auth.users (id, email, created_at) values ('00000000-0000-4000-8000-0000000013a0', 'admin-0113@kring.test', now() - interval '30 days') on conflict (id) do nothing;
insert into public.kr6_staff (user_id, role) values ('00000000-0000-4000-8000-0000000013a0', 'admin') on conflict do nothing;
-- people already on TEST today are the baseline; the checks below count only what this test adds
select pg_temp.as_user('00000000-0000-4000-8000-0000000013a0');
create temp table g0 as select public.kr8_admin_growth(1) as j;
insert into auth.users (id, email, created_at) values
  ('00000000-0000-4000-8000-0000000013a0', 'admin-0113@kring.test', now() - interval '30 days'),
  ('00000000-0000-4000-8000-0000000013b1', 'r1-0113@kring.test', now()),
  ('00000000-0000-4000-8000-0000000013b2', 'r2-0113@kring.test', now()),
  ('00000000-0000-4000-8000-0000000013b3', 'r3-0113@kring.test', now()),
  ('00000000-0000-4000-8000-0000000013b4', 't-0113@kring.test', now()),
  ('00000000-0000-4000-8000-0000000013b5', 'g-0113@kring.test', now()),
  ('00000000-0000-4000-8000-0000000013b6', 'admin2-0113@kring.test', now()),
  ('00000000-0000-4000-8000-0000000013c0', 'm100-0113@kring.test', now() - interval '20 days')
on conflict (id) do nothing;
insert into public.kr6_staff (user_id, role) values ('00000000-0000-4000-8000-0000000013a0', 'admin'), ('00000000-0000-4000-8000-0000000013b6', 'admin') on conflict do nothing;
insert into public.kr8_members (user_id, member_no, first_name, ref_code, ghost, created_at) values
  ('00000000-0000-4000-8000-0000000013c0', 913100, 'Inviter', null, false, now() - interval '20 days'),
  ('00000000-0000-4000-8000-0000000013b1', 913101, 'Ploy', 'pich', false, now()),
  ('00000000-0000-4000-8000-0000000013b2', 913102, 'Ton', 'k913100', false, now()),
  ('00000000-0000-4000-8000-0000000013b4', 913104, 'Tester', 'pich', false, now()),
  ('00000000-0000-4000-8000-0000000013b5', 913105, 'Ghosty', 'pich', true, now())
on conflict (user_id) do nothing;
insert into public.kr8_posts (author, kind, status, created_at) values
  ('00000000-0000-4000-8000-0000000013b1', 'reel', 'approved', now()),
  ('00000000-0000-4000-8000-0000000013b4', 'reel', 'approved', now()),
  ('00000000-0000-4000-8000-0000000013c0', 'reel', 'approved', now() - interval '19 days'),
  ('00000000-0000-4000-8000-0000000013c0', 'reel', 'approved', now());   -- not a FIRST Reel
insert into public.link_visits (session_id, ref, referrer, country, user_agent, created_at) select s, r, h, c, coalesce(ua, 'Mozilla/5.0 (iPhone)'), at from (values
  ('g13a', null, 'jp.naver.line.android', 'TH', null, (select at from t0)),
  ('g13a', null, null, 'TH', null, (select at from t0) - interval '1 day'),
  ('g13b', null, 'www.google.com', 'TH', null, (select at from t0)),
  ('g13c', 'pich', null, 'TH', null, (select at from t0)),
  ('g13d', 'k913100', 'm.facebook.com', 'IN', null, (select at from t0)),
  ('g13d', 'pich', 'l.facebook.com', 'IN', null, (select at from t0) + interval '10 seconds'),
  ('zztestg13e', null, null, 'US', null, (select at from t0)),
  ('g13f', null, 'localhost:5173', 'TH', null, (select at from t0)),
  ('g13g', null, 'abc123.kring.pages.dev', 'TH', null, (select at from t0)),
  ('g13h', 'test1', null, 'TH', null, (select at from t0)),
  ('g13i', null, null, 'US', 'Mozilla/5.0 HeadlessChrome', (select at from t0)),
  ('g13j', 'pwa-install', null, 'TH', null, (select at from t0)),
  ('g13k', null, 'instagram.com', 'TH', null, (select at from t0) - interval '3 days')
) v(s, r, h, c, ua, at);

-- 1. admin only
select pg_temp.as_user('00000000-0000-4000-8000-0000000013b1');
do $$ begin perform public.kr8_admin_growth(1); raise exception 'FAIL 1 a member could read growth'; exception when others then
  if sqlerrm like 'FAIL%' then raise; end if; raise notice 'PASS 1 non-admin is refused (%)', sqlerrm; end $$;
select pg_temp.as_user('00000000-0000-4000-8000-0000000013a0');
create temp table g1 as select public.kr8_admin_growth(1) as j;
create temp table g7 as select public.kr8_admin_growth(7) as j;

-- 2. visitors / visits / returning, noise and installs left out
select pg_temp.ok((select (j->>'visitors')::int = 4 from g1), '2a today: 4 visitors (a b c d; test, localhost, pages.dev, test1, robot, install left out)');
select pg_temp.ok((select (j->>'visits')::int = 5 from g1), '2b today: 5 visits (d came twice)');
select pg_temp.ok((select (j->>'returning')::int = 1 from g1), '2c today: 1 returning visitor (a was here yesterday)');
select pg_temp.ok((select (j->>'app_installs')::int = 1 from g1), '2d install counted separately');
select pg_temp.ok((select (j->>'visitors')::int = 5 from g7), '2e 7 days: 5 visitors (k from 3 days ago)');
select pg_temp.ok((select jsonb_array_length(j->'series') = extract(hour from now() at time zone 'Asia/Bangkok')::int + 1 from g1) and (select jsonb_array_length(j->'series') = 7 from g7), '2f series: hours so far today, 7 days');
select pg_temp.ok((select sum((x->>'visitors')::int) = 6 from g7, jsonb_array_elements(j->'series') x), '2g daily line: 6 visitor-days (a counted yesterday and today)');

-- 3. people: test / ghost / admin left out; first Reel only once
select pg_temp.ok((select (g1.j->>'signins')::int - (g0.j->>'signins')::int = 3 from g1, g0), '3a 3 new sign-ins (R1 R2 R3; test, ghost, admin left out)');
select pg_temp.ok((select (g1.j->>'cards')::int - (g0.j->>'cards')::int = 2 from g1, g0), '3b 2 new real cards');
select pg_temp.ok((select (g1.j->>'first_reels')::int - (g0.j->>'first_reels')::int = 1 from g1, g0), '3c 1 first Reel (Ploy; the inviter''s 2nd Reel and the test Reel do not count)');
select pg_temp.ok((select (g1.j#>>'{funnel,signed_in}')::int - (g0.j#>>'{funnel,signed_in}')::int = 3 and (g1.j#>>'{funnel,card}')::int - (g0.j#>>'{funnel,card}')::int = 2
  and (g1.j#>>'{funnel,reel}')::int - (g0.j#>>'{funnel,reel}')::int = 1 from g1, g0), '3d funnel 3 → 2 → 1');

-- 4. sources raw (first visit of each phone) and recruiter links
select pg_temp.ok((select count(*) = 4 from g1, jsonb_array_elements(j->'sources') x), '4a 4 first-visit source rows today');
select pg_temp.ok((select (x->>'host') = 'm.facebook.com' from g1, jsonb_array_elements(j->'sources') x where x->>'host' like '%facebook%'), '4b d is counted from its FIRST visit (m.facebook.com)');
select pg_temp.ok((select x->>'ref' = 'pich' from g1, jsonb_array_elements(j->'sources') x where x->>'host' is null and x->>'ref' is not null), '4c empty referrer keeps its ?ref=');
select pg_temp.ok((select (x->>'visitors')::int = 2 and (x->>'joined')::int - coalesce((select (y->>'joined')::int from g0, jsonb_array_elements(g0.j->'refs') y where y->>'ref' = 'pich'), 0) = 1 from g1, jsonb_array_elements(g1.j->'refs') x where x->>'ref' = 'pich'),
  '4d pich: 2 visitors, 1 joined (test + ghost left out), 1 posted a Reel');
select pg_temp.ok((select (x->>'member_no')::int = 913100 and x->>'member_name' = 'Inviter' and (x->>'joined')::int = 1 from g1, jsonb_array_elements(j->'refs') x where x->>'ref' = 'k913100'),
  '4e member invite code carries the inviter''s number and name');
select pg_temp.ok((select not exists (select 1 from g1, jsonb_array_elements(j->'refs') x where x->>'ref' in ('test1', 'pwa-install'))), '4f internal refs hidden');
select pg_temp.ok((select (x->>'visitors')::int = 3 from g1, jsonb_array_elements(j->'countries') x where x->>'country' = 'TH')
  and (select not exists (select 1 from g1, jsonb_array_elements(j->'countries') x where x->>'country' = 'US')), '4g countries: TH 3, no US (only noise came from US)');

rollback;
