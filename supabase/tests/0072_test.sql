-- 0072 (places outside Bangkok). SCRATCH DATABASE ONLY: a private Postgres with 0001…0067 + 0043, 0070, 0071, 0072.
--   psql -X -q -v ON_ERROR_STOP=1 -f supabase/tests/0072_test.sql      (raises on the first FAIL; everything is rolled back)
\set QUIET on
begin;
create or replace function pg_temp.ok(c boolean, what text) returns void language plpgsql as $$
begin if not coalesce(c, false) then raise exception 'FAIL: %', what; end if; raise notice 'PASS: %', what; end $$;
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;

-- the rule
select pg_temp.ok(public.kr8_place_outside('Wat Huay Mongkol, Hua Hin'), 'Hua Hin (English) is outside');
select pg_temp.ok(public.kr8_place_outside('สวนผึ้ง ราชบุรี'), 'สวนผึ้ง ราชบุรี (Thai) is outside');
select pg_temp.ok(public.kr8_place_outside('Pattaya Walking Street') and public.kr8_place_outside('ตลาดน้ำอัมพวา') and public.kr8_place_outside('Old Town Phuket'), 'Pattaya / อัมพวา / Phuket are outside');
select pg_temp.ok(not public.kr8_place_outside('Kudi Chin Café') and not public.kr8_place_outside('Nana Coffee Roasters') and not public.kr8_place_outside('ร้านกาแฟ เลยตามเลย'), 'ordinary Bangkok names stay Bangkok (no false hits on Nana / เลย)');
select pg_temp.ok(not public.kr8_place_outside('ข้าวซอยเชียงใหม่ อารีย์') and not public.kr8_place_outside('Chiang Mai Kitchen Silom'), 'a Bangkok word wins: Chiang Mai food in Ari / Silom is Bangkok');
select pg_temp.ok(not public.kr8_place_outside('Pattaya Seafood', 13.74, 100.53), 'a pin inside the Bangkok box wins over the name');
select pg_temp.ok(public.kr8_place_outside('Some café', 12.57, 99.96), 'a pin outside the Bangkok box is outside');

-- a member types a Hua Hin place → saved as Outside Bangkok (kr_area stays a valid Reel pin)
insert into auth.users (id, email) values ('72000000-0000-4000-8000-000000000001', 'm72@example.com'), ('72000000-0000-4000-8000-000000000002', 'l72@example.com');
insert into public.kr8_members (user_id, first_name, photo, langs, area, who, age_ok_at, verified, created_at) values
  ('72000000-0000-4000-8000-000000000001', 'Mai', 'https://x/m.jpg', '{TH}', 'Bangkok', 'local', now(), true, now() - interval '10 days'),
  ('72000000-0000-4000-8000-000000000002', 'Lek', 'https://x/l.jpg', '{TH}', 'Bangkok', 'local', now(), true, now() - interval '10 days');
select pg_temp.as_user('72000000-0000-4000-8000-000000000001');
set local role authenticated;
create temp table r72 as select public.kr8_member_add_place('ตลาดฉัตรชัย หัวหิน', 'Ari', null, null, null) j;
create temp table b72 as select public.kr8_member_add_place('Kring Test Café Ari', 'Ari', null, null, null) j;
reset role;
select pg_temp.ok((select (j->>'area') = 'Outside Bangkok' and (j->>'kr_area') = 'Bangkok' and (j->>'outside_bkk')::boolean from r72), 'typed Hua Hin place: area Outside Bangkok, outside_bkk true');
select pg_temp.ok((select (j->>'area') = 'Ari' and not (j->>'outside_bkk')::boolean from b72), 'typed Bangkok place: area as picked, not outside');

-- weekly board: an outside-only Reel scores nothing; a Bangkok Reel (or one with both) still scores; the feed row stays
insert into public.kr8_posts (id, author, kind, status, area, video_path, poster_path, duration_ms, width, height, created_at) values
  ('72000000-0000-4000-8000-0000000000a1', '72000000-0000-4000-8000-000000000001', 'reel', 'approved', 'Bangkok', '72000000-0000-4000-8000-000000000001/72000000-0000-4000-8000-0000000000a1.mp4', '72000000-0000-4000-8000-000000000001/72000000-0000-4000-8000-0000000000a1.jpg', 10000, 720, 1280, now() - interval '1 hour'),
  ('72000000-0000-4000-8000-0000000000a2', '72000000-0000-4000-8000-000000000001', 'reel', 'approved', 'Bangkok', '72000000-0000-4000-8000-000000000001/72000000-0000-4000-8000-0000000000a2.mp4', '72000000-0000-4000-8000-000000000001/72000000-0000-4000-8000-0000000000a2.jpg', 10000, 720, 1280, now() - interval '1 hour'),
  ('72000000-0000-4000-8000-0000000000a3', '72000000-0000-4000-8000-000000000001', 'reel', 'approved', 'Bangkok', '72000000-0000-4000-8000-000000000001/72000000-0000-4000-8000-0000000000a3.mp4', '72000000-0000-4000-8000-000000000001/72000000-0000-4000-8000-0000000000a3.jpg', 10000, 720, 1280, now() - interval '1 hour');
insert into public.kr8_post_places (post_id, place_id, position) values
  ('72000000-0000-4000-8000-0000000000a1', ((select j from r72)->>'id')::uuid, 1),
  ('72000000-0000-4000-8000-0000000000a2', ((select j from b72)->>'id')::uuid, 1),
  ('72000000-0000-4000-8000-0000000000a3', ((select j from r72)->>'id')::uuid, 1), ('72000000-0000-4000-8000-0000000000a3', ((select j from b72)->>'id')::uuid, 2);
insert into public.kr8_post_likes (post_id, user_id) select p, '72000000-0000-4000-8000-000000000002'::uuid
  from unnest(array['72000000-0000-4000-8000-0000000000a1', '72000000-0000-4000-8000-0000000000a2', '72000000-0000-4000-8000-0000000000a3']::uuid[]) p;
select pg_temp.ok(not exists (select 1 from public.kr8_reel_scores(now() - interval '1 day', now() + interval '1 day', now() + interval '1 day', false) where post_id = '72000000-0000-4000-8000-0000000000a1'), 'outside-only Reel is not on the weekly board');
select pg_temp.ok((select score >= 1 from public.kr8_reel_scores(now() - interval '1 day', now() + interval '1 day', now() + interval '1 day', false) where post_id = '72000000-0000-4000-8000-0000000000a2'), 'Bangkok Reel counts');
select pg_temp.ok((select score >= 1 from public.kr8_reel_scores(now() - interval '1 day', now() + interval '1 day', now() + interval '1 day', false) where post_id = '72000000-0000-4000-8000-0000000000a3'), 'Reel with a Bangkok place AND an outside place counts');
select pg_temp.ok(exists (select 1 from public.kr8_posts where id = '72000000-0000-4000-8000-0000000000a1' and status = 'approved' and not hidden), 'outside-only Reel stays approved and visible (feed is untouched)');

-- the two live places (same ids as live) → outside, matched by id AND name; re-running changes nothing more
insert into public.kr8_places (id, name_en, name_th, area, kr_area, lat, lng, source, status) values
  ('ca94deb0-6e19-48fe-bbd5-61dba97ebc3d', 'Wat Huay Mongkol, Hua Hin', 'วัดห้วยมงคง หัวหิน จ.ประจวบคีรีขันธ์', 'Prachuap Khiri Khan', 'Bangkok', 13.7563, 100.5018, 'photon', 'live'),
  ('491eaddf-5af3-426f-a9dd-1ffffe4cb64a', 'สวนผึ้ง ราชบุรี', 'สวนผึ้ง ราชบุรี', 'Bangkok', 'Bangkok', 13.7563, 100.5018, 'photon', 'live');
update public.kr8_places set outside_bkk = true, area = 'Outside Bangkok'
where ((id = 'ca94deb0-6e19-48fe-bbd5-61dba97ebc3d' and name_en = 'Wat Huay Mongkol, Hua Hin') or (id = '491eaddf-5af3-426f-a9dd-1ffffe4cb64a' and name_en = 'สวนผึ้ง ราชบุรี'))
  and (not outside_bkk or area <> 'Outside Bangkok');
select pg_temp.ok((select count(*) = 2 from public.kr8_places where outside_bkk and area = 'Outside Bangkok' and id in ('ca94deb0-6e19-48fe-bbd5-61dba97ebc3d', '491eaddf-5af3-426f-a9dd-1ffffe4cb64a')), 'the two live places are outside Bangkok');
rollback;
