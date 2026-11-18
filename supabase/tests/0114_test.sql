-- 0114 test (throwaway / TEST DB only; everything rolls back). Prints PASS lines; any failure raises.
-- Checks the Day view and the Day by day table use EXACTLY the Growth definitions (kr8_admin_growth_core).
begin;
create or replace function pg_temp.ok(c boolean, m text) returns void language plpgsql as $$
begin if coalesce(c, false) then raise notice 'PASS %', m; else raise exception 'FAIL %', m; end if; end $$;
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create temp table t0 as select (now() at time zone 'Asia/Bangkok')::date as today,
  greatest(((now() at time zone 'Asia/Bangkok')::date)::timestamp at time zone 'Asia/Bangkok', now() - interval '1 minute') as at;
create temp table y0 as select (today - 1)::timestamp at time zone 'Asia/Bangkok' + interval '10 hours' as at from t0;

delete from public.link_visits;
insert into auth.users (id, email, created_at) values ('00000000-0000-4000-8000-0000000014a0', 'admin-0114@kring.test', now() - interval '30 days') on conflict (id) do nothing;
insert into public.kr6_staff (user_id, role) values ('00000000-0000-4000-8000-0000000014a0', 'admin') on conflict do nothing;
select pg_temp.as_user('00000000-0000-4000-8000-0000000014a0');
create temp table b as select public.kr8_admin_growth_day((select today from t0)) as btd, public.kr8_admin_growth_day((select today - 1 from t0)) as byd;

insert into auth.users (id, email, created_at) values
  ('00000000-0000-4000-8000-0000000014b1', 'y1-0114@kring.test', (select at from y0)),
  ('00000000-0000-4000-8000-0000000014b2', 'y2-0114@kring.test', (select at from y0)),
  ('00000000-0000-4000-8000-0000000014b3', 't1-0114@kring.test', now())
on conflict (id) do nothing;
insert into public.kr8_members (user_id, member_no, first_name, created_at) values
  ('00000000-0000-4000-8000-0000000014b1', 914101, 'Yday', (select at from y0) + interval '5 minutes'),
  ('00000000-0000-4000-8000-0000000014b3', 914103, 'Tday', now())
on conflict (user_id) do nothing;
insert into public.kr8_posts (author, kind, status, created_at) values ('00000000-0000-4000-8000-0000000014b1', 'reel', 'approved', now());
insert into public.link_visits (session_id, referrer, country, user_agent, created_at) select s, h, 'TH', 'Mozilla/5.0 (iPhone)', at from (values
  ('h14a', null, (select at from y0)), ('h14a', null, (select at from t0)),          -- yesterday and today: came back today
  ('h14b', 'line.me', (select at from y0)), ('h14c', 'www.google.com', (select at from y0)),
  ('h14d', null, (select at from t0)), ('zztesth14e', null, (select at from y0))) v(s, h, at);

-- 1. admin only; the core is not callable from the app
select pg_temp.as_user('00000000-0000-4000-8000-0000000014b1');
do $$ begin perform public.kr8_admin_growth_day(current_date); raise exception 'FAIL 1a member read a day'; exception when others then
  if sqlerrm like 'FAIL%' then raise; end if; raise notice 'PASS 1a day view refused for a member (%)', sqlerrm; end $$;
do $$ begin perform public.kr8_admin_growth_daily(current_date - 6, current_date); raise exception 'FAIL 1b member read the table'; exception when others then
  if sqlerrm like 'FAIL%' then raise; end if; raise notice 'PASS 1b day-by-day refused for a member (%)', sqlerrm; end $$;
select pg_temp.ok(not has_function_privilege('authenticated', 'public.kr8_admin_growth_core(date, date)', 'execute'), '1c core not executable by the app');
select pg_temp.as_user('00000000-0000-4000-8000-0000000014a0');

create temp table g as select public.kr8_admin_growth(1) as g1, public.kr8_admin_growth(7) as g7,
  public.kr8_admin_growth_day((select today from t0)) as td, public.kr8_admin_growth_day((select today - 1 from t0)) as yd,
  public.kr8_admin_growth_daily((select today - 6 from t0), (select today from t0)) as tbl;

-- 2. the Day view for today IS the Today view
select pg_temp.ok((select (td - 'now' - 'day' - 'is_today') = (g1 - 'now') from g), '2a Day view of today = Today view (every field)');
select pg_temp.ok((select (td ->> 'is_today')::boolean and (yd ->> 'is_today')::boolean = false from g), '2b is_today flag');

-- 3. a past day: only that day's rows, compared with the day before, full 24-hour line
select pg_temp.ok((select (yd->>'visitors')::int - (b.byd->>'visitors')::int = 3 from g, b), '3a yesterday +3 visitors (a, b, c; test phone left out)');
select pg_temp.ok((select (td->>'visitors')::int - (b.btd->>'visitors')::int = 2 and (td->>'returning')::int - (b.btd->>'returning')::int = 1 from g, b), '3b today +2 visitors, +1 came back (a)');
select pg_temp.ok((select (yd->>'signins')::int - (b.byd->>'signins')::int = 2 and (yd->>'cards')::int - (b.byd->>'cards')::int = 1 from g, b), '3c yesterday +2 sign-ins, +1 card');
select pg_temp.ok((select (yd->>'first_reels')::int = (b.byd->>'first_reels')::int from g, b), '3d a Reel posted today is not a first Reel of yesterday');
select pg_temp.ok((select (yd#>>'{funnel,reel}')::int - (b.byd#>>'{funnel,reel}')::int = 1 from g, b), '3e funnel follows yesterday''s sign-ins to now (posted today)');
select pg_temp.ok((select jsonb_array_length(yd->'series') = 24 from g), '3f a past day shows all 24 hours');
select pg_temp.ok((select (yd->>'from') = (yd->>'to') and (yd->>'days')::int = 1 from g), '3g one-day period');

-- 4. the table: newest first, each row = that day's Day view
select pg_temp.ok((select jsonb_array_length(tbl) = 7 and (tbl->0->>'day')::date = (select today from t0) and (tbl->6->>'day')::date = (select today - 6 from t0) from g), '4a 7 rows, newest first');
select pg_temp.ok((select (tbl->1->>'visitors') = (yd->>'visitors') and (tbl->1->>'returning') = (yd->>'returning') and (tbl->1->>'signins') = (yd->>'signins')
  and (tbl->1->>'cards') = (yd->>'cards') and (tbl->1->>'first_reels') = (yd->>'first_reels') from g), '4b table row = Day view numbers');
select pg_temp.ok((select (select sum((r->>'signins')::int) from jsonb_array_elements(tbl) r) = (g7->>'signins')::int from g), '4c daily sign-ins add up to the 7-day number');
select pg_temp.ok((select (select sum((r->>'first_reels')::int) from jsonb_array_elements(tbl) r) = (g7->>'first_reels')::int from g), '4d daily first Reels add up to the 7-day number');

-- 5. limits
select pg_temp.ok((select (public.kr8_admin_growth_day((select today + 5 from t0))->>'day')::date = (select today from t0)), '5a a future day shows today');
select pg_temp.ok(jsonb_array_length(public.kr8_admin_growth_daily((select today - 400 from t0), (select today from t0))) = 92, '5b table capped at 92 days');
select pg_temp.ok(public.kr8_admin_growth_daily((select today from t0), (select today - 3 from t0)) = '[]'::jsonb, '5c empty range gives no rows');
rollback;
