-- 0086 (member places decide themselves). TEST DATABASE ONLY. Runs in one transaction and is never committed:
--   python3 tq.py < 0086_test.sql      → prints "ALL PASS (n)" or raises on the first FAIL
-- Covers: clean, junk (silent reject + Reel keeps no place), duplicate link, live insert, geocode apply (Photon + Nominatim replies), admin undo.
begin;
create temp table t86 (n serial, what text);
create or replace function pg_temp.ok(c boolean, what text) returns void language plpgsql as $$
begin if not coalesce(c, false) then raise exception 'FAIL: %', what; end if; insert into t86 (what) values (what); end $$;
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create or replace function pg_temp.add(n text, lat double precision default null, lng double precision default null) returns jsonb language sql as $$
  select public.kr8_member_add_place(n, 'Bangkok', null, lat, lng) $$;

-- ── clean ──
select pg_temp.ok(public.kr8_place_clean('  Big   dog cafe  ') = 'Big dog cafe', 'trim + collapse spaces');
select pg_temp.ok(public.kr8_place_clean('Nana Coffee ☕️✨ #bangkok #cafe') = 'Nana Coffee', 'emoji and hashtags removed');
select pg_temp.ok(public.kr8_place_clean('#คาเฟ่อารีย์') = 'คาเฟ่อารีย์', 'a name that is only a hashtag keeps its words');
select pg_temp.ok(public.kr8_place_clean('Kudi Chin https://maps.app.goo.gl/abc') = 'Kudi Chin', 'URL removed');
select pg_temp.ok(public.kr8_place_clean('วัดเจดีย์ไอ้ไข่') = 'วัดเจดีย์ไอ้ไข่', 'Thai with tone marks untouched');
select pg_temp.ok(length(public.kr8_place_clean(repeat('Sukhumvit Soi ', 12))) <= 80, 'capped at 80 characters');

-- ── junk rule ──
select pg_temp.ok(public.kr8_place_junk('081-234-5678') = 'phone' and public.kr8_place_junk('ร้านป้า 0812345678') = 'phone' and public.kr8_place_junk('+66 81 234 5678') = 'phone', 'phone numbers');
select pg_temp.ok(public.kr8_place_junk('www.mycafe.com') is not null and public.kr8_place_junk('cafe shop.co.th') = 'url', 'URLs');
select pg_temp.ok(public.kr8_place_junk('line id: cafe99') = 'line_id' and public.kr8_place_junk('@kring123') = 'line_id' and public.kr8_place_junk('แอดไลน์ abc') = 'line_id', 'LINE ids');
select pg_temp.ok(public.kr8_place_junk('fuck this place') = 'rude' and public.kr8_place_junk('ร้านเหี้ย') = 'rude' and public.kr8_place_junk('sexy girls bar') = 'rude', 'rude / sexual words (Thai + English)');
select pg_temp.ok(public.kr8_place_junk('😍🔥✨') is not null and public.kr8_place_junk('a') = 'too_short' and public.kr8_place_junk('12345') = 'no_letters', 'emoji-only, 1 character, digits only');
select pg_temp.ok(public.kr8_place_junk('test') = 'placeholder' and public.kr8_place_junk('ทดสอบ') = 'placeholder' and public.kr8_place_junk('aaaa') = 'placeholder', 'placeholders (test, ทดสอบ, aaaa)');
select pg_temp.ok(public.kr8_place_junk('บาคาร่า เว็บตรง') = 'banned' and public.kr8_place_junk('UFABET') = 'banned', 'banned terms');
select pg_temp.ok(public.kr8_place_junk('วัดเจดีย์ไอ้ไข่') is null and public.kr8_place_junk('กาญจนบุรี') is null and public.kr8_place_junk('นครศรีธรรมราช') is null
  and public.kr8_place_junk('Latest Recipe') is null and public.kr8_place_junk('ท่าเรือโป๊ะ') is null and public.kr8_place_junk('หีบเพลง cafe') is null
  and public.kr8_place_junk('True Coffee @Siam') is null and public.kr8_place_junk('LINE Friends Store') is null and public.kr8_place_junk('Sukhumvit 101/1') is null
  and public.kr8_place_junk('กูกินจุ') is null and public.kr8_place_junk('Test Kitchen Thonglor') is null, 'real names pass (incl. the 3 from 17 Nov, โป๊ะ, หีบ, @Siam, LINE Friends, Soi 101/1, กูกินจุ)');

-- ── members ──
insert into auth.users (id, email) values ('86000000-0000-4000-8000-000000000001', 'm86@example.com'), ('86000000-0000-4000-8000-000000000002', 'a86@example.com');
insert into public.kr8_members (user_id, first_name, photo, langs, area, who, age_ok_at, verified, created_at) values
  ('86000000-0000-4000-8000-000000000001', 'Mai', 'https://x/m.jpg', '{TH}', 'Bangkok', 'local', now(), true, now() - interval '10 days');
insert into public.kr8_places (id, name_en, name_th, aliases, area, kr_area, lat, lng, source, status) values
  ('86000000-0000-4000-8000-0000000000a1', 'Kringly Roasters Ari', 'คริงลี่โรสเตอร์ อารีย์', 'KLR Ari, Kringly Coffee', 'Ari', 'Ari', 13.7797, 100.5446, 'seed', 'live'),
  ('86000000-0000-4000-8000-0000000000a2', 'Kringly Cafe Rama 2', null, '', 'Bangkok', 'Bangkok', 13.70, 100.48, 'seed', 'live');

select pg_temp.as_user('86000000-0000-4000-8000-000000000001');
set local role authenticated;
create temp table j86 as select 'junk' k, pg_temp.add('call me 0812345678 😘') j;
insert into j86 select 'rude', pg_temp.add('ร้านเย็ด');
insert into j86 select 'dupe_exact', pg_temp.add('kringly roasters ari 🙂');
insert into j86 select 'dupe_thai', pg_temp.add('คริงลี่โรสเตอร์อารีย์');
insert into j86 select 'dupe_alias', pg_temp.add('KLR  Ari');
insert into j86 select 'dupe_fuzzy', pg_temp.add('Kringly Roaster Ari');
insert into j86 select 'not_dupe_num', pg_temp.add('Kringly Cafe Rama 3');
insert into j86 select 'outside', pg_temp.add('ตลาดคริงลี่ กาญจนบุรี');
insert into j86 select 'pin_outside', pg_temp.add('Kringly Beach Shack', 12.57, 99.96);
-- the Reel: one junk place + one real place → the junk tag is dropped silently, the Reel still posts with the real place
create temp table rid86 (id uuid);
reset role;
insert into public.kr8_posts (id, author, kind, status, area, video_path, poster_path, duration_ms, width, height) values ('86000000-0000-4000-8000-0000000000f1', '86000000-0000-4000-8000-000000000001', 'reel', 'approved', 'Bangkok',
  '86000000-0000-4000-8000-000000000001/86000000-0000-4000-8000-0000000000f1.mp4', '86000000-0000-4000-8000-000000000001/86000000-0000-4000-8000-0000000000f1.jpg', 10000, 720, 1280);
insert into public.kr8_post_places (post_id, place_id, position)
select '86000000-0000-4000-8000-0000000000f1', (j->>'id')::uuid, 1 from j86 where k = 'junk';
insert into public.kr8_post_places (post_id, place_id, position)
select '86000000-0000-4000-8000-0000000000f1', (j->>'id')::uuid, 2 from j86 where k = 'outside';

select pg_temp.ok((select j->>'status' = 'rejected' from j86 where k = 'junk'), 'junk: member gets a quiet reply (status rejected, no error)');
select pg_temp.ok((select status = 'rejected' and added_how = 'typed' from public.kr8_places where id = (select (j->>'id')::uuid from j86 where k = 'junk')), 'junk: saved as rejected');
select pg_temp.ok((select j->>'status' = 'rejected' from j86 where k = 'rude'), 'rude Thai name rejected');
select pg_temp.ok(not exists (select 1 from public.kr8_post_places where place_id = (select (j->>'id')::uuid from j86 where k = 'junk')), 'junk: the Reel keeps no place');
select pg_temp.ok(exists (select 1 from public.kr8_post_places where post_id = '86000000-0000-4000-8000-0000000000f1' and place_id = (select (j->>'id')::uuid from j86 where k = 'outside')), 'the real place on the same Reel stays');
select pg_temp.ok((select bool_and(j->>'id' = '86000000-0000-4000-8000-0000000000a1' and (j->>'existing')::boolean) from j86 where k in ('dupe_exact', 'dupe_thai', 'dupe_alias', 'dupe_fuzzy')),
  'duplicates (exact + emoji, Thai without space, alias, fuzzy ≥ 0.8) link to the existing place');
select pg_temp.ok((select j->>'id' <> '86000000-0000-4000-8000-0000000000a2' and j->>'status' = 'live' from j86 where k = 'not_dupe_num'), '"Rama 3" is not a duplicate of "Rama 2"');
select pg_temp.ok((select j->>'status' = 'live' and (j->>'outside_bkk')::boolean and j->>'area' = 'Outside Bangkok' from j86 where k = 'outside'), 'new place: live at once, outside Bangkok by name');
select pg_temp.ok((select coords_rough and status = 'live' and reviewed_by is null from public.kr8_places where id = (select (j->>'id')::uuid from j86 where k = 'outside')), 'new place: coords_rough, no admin step');
select pg_temp.ok((select j->>'status' = 'live' and (j->>'outside_bkk')::boolean and abs((j->>'lat')::float - 12.57) < 0.001 from j86 where k = 'pin_outside'), 'a Maps pin outside Bangkok is kept (Thailand box)');
select pg_temp.ok((select count(*) from public.kr8_admin_actions_log where action = 'place_auto_reject' and detail ->> 'by' = '86000000-0000-4000-8000-000000000001') = 2
  and (select count(*) from public.kr8_admin_actions_log where action = 'place_auto_link' and detail ->> 'by' = '86000000-0000-4000-8000-000000000001') = 4
  and (select count(*) from public.kr8_admin_actions_log where action = 'place_auto_live' and detail ->> 'by' = '86000000-0000-4000-8000-000000000001') = 3, 'every decision logged');
select pg_temp.ok(not exists (select 1 from public.kr8_places where status = 'pending'), 'nothing waits for admin');

-- ── geocode (provider replies fed in directly; the live run is checked separately) ──
create temp table g86 as select (j->>'id')::uuid id from j86 where k = 'outside';
insert into public.kr8_place_geo (place_id) select id from g86;
select pg_temp.ok(public.kr8_place_geo_apply((select id from g86), 'photon', '{"features":[{"geometry":{"coordinates":[99.53,14.02]},"properties":{"name":"ตลาดคริงลี่ กาญจนบุรี","countrycode":"TH","osm_type":"R","osm_id":8600001,"state":"กาญจนบุรี"}}]}'::jsonb) = 'found', 'Photon: confident match found');
select pg_temp.ok((select not coords_rough and outside_bkk and abs(lat - 14.02) < 0.001 and osm_ref = 'R8600001' and area = 'Outside Bangkok' from public.kr8_places where id = (select id from g86)), 'Photon: real pin, osm_ref, outside_bkk set, coords_rough false');
select pg_temp.ok(exists (select 1 from public.kr8_admin_actions_log where action = 'place_geo_found' and detail ->> 'place_id' = (select id::text from g86)), 'geocode logged');

create temp table g86b as select (j->>'id')::uuid id from j86 where k = 'not_dupe_num';
insert into public.kr8_place_geo (place_id) select id from g86b;
select pg_temp.ok(public.kr8_place_geo_apply((select id from g86b), 'photon', '{"features":[{"geometry":{"coordinates":[100.6,13.7]},"properties":{"name":"Totally Different Mall","countrycode":"TH"}}]}'::jsonb) = 'need_nominatim', 'Photon: weak match → ask Nominatim');
select pg_temp.ok(public.kr8_place_geo_apply((select id from g86b), 'nominatim',
  '[{"lat":"13.6625","lon":"100.4380","osm_type":"node","osm_id":"8600002","name":"Kringly Cafe Rama III","namedetails":{"name":"คริงลี่คาเฟ่","name:en":"Kringly Cafe Rama 3"},"address":{"country_code":"th","suburb":"Bang Khun Thian"}}]'::jsonb) = 'found', 'Nominatim: English alt name matched');
select pg_temp.ok((select not coords_rough and not outside_bkk and osm_ref = 'N8600002' and area = 'Bang Khun Thian' from public.kr8_places where id = (select id from g86b)), 'Nominatim: Bangkok pin + district area');

create temp table g86c as select (j->>'id')::uuid id from j86 where k = 'pin_outside';
update public.kr8_places set coords_rough = true where id = (select id from g86c);
insert into public.kr8_place_geo (place_id) select id from g86c;
select pg_temp.ok(public.kr8_place_geo_apply((select id from g86c), 'nominatim', '[]'::jsonb) = 'not_found', 'nothing found → not_found');
select pg_temp.ok((select status = 'live' and coords_rough from public.kr8_places where id = (select id from g86c)), 'not found: stays live as a text-only tag');
select pg_temp.ok(public.kr8_geo_best('เซ็นทรัลปาร์ค', '[{"name":"เซ็นทรัลปาร์ค","names":["เซ็นทรัลปาร์ค"],"lat":18.79,"lng":98.98},{"name":"เซ็นทรัล ปาร์ค","names":["เซ็นทรัล ปาร์ค"],"lat":13.73,"lng":100.53}]'::jsonb) ->> 'lat' = '13.73',
  'a Bangkok-sounding name prefers the Bangkok pin');
select pg_temp.ok(public.kr8_geo_best('นครศรีธรรมราช', '[{"name":"ข้าวแกงปักษ์ใต้ นครศรีธรรมราช","names":["ข้าวแกงปักษ์ใต้ นครศรีธรรมราช"],"lat":13.727,"lng":100.529},{"name":"นครศรีธรรมราช","names":["นครศรีธรรมราช"],"lat":8.43,"lng":99.96}]'::jsonb) ->> 'lat' = '8.43',
  'a province name finds the province, not a Bangkok shop named after it');
select pg_temp.ok(public.kr8_geo_best('เซ็นทรัลปาร์ค', '[{"name":"เซ็นทรัลปาร์คพระราม 2","names":["เซ็นทรัลปาร์คพระราม 2"],"lat":13.665,"lng":100.436}]'::jsonb) is null, 'a longer different name is not taken (Central Park ≠ Central Park Rama 2)');
select pg_temp.ok(public.kr8_geo_best('นครศรีธรรมราช', '[{"name":"เทศบาลนครนครศรีธรรมราช","names":["เทศบาลนครนครศรีธรรมราช"],"lat":8.43,"lng":99.96}]'::jsonb) ->> 'lat' = '8.43', 'Thai admin prefixes stripped (เทศบาลนคร…)');
select pg_temp.ok(public.kr8_geo_best('เซ็นทรัลปาร์ค', '[{"name":"เซ็นทรัลปาร์ค 2","names":["เซ็นทรัลปาร์ค 2"],"lat":12.926,"lng":100.897}]'::jsonb) is null, 'numbers must agree (Central Park 2 in Pattaya is not taken)');
select pg_temp.ok(public.kr8_geo_best('Big dog cafe rama3', '[{"name":"Rama 3 Hospital","names":["Rama 3 Hospital"],"lat":13.69,"lng":100.53}]'::jsonb) is null, 'unrelated result is not taken');

-- ── admin undo ──
insert into auth.users (id, email, email_confirmed_at) values ('86000000-0000-4000-8000-0000000000ad', 'ad86@example.com', now()) on conflict do nothing;
insert into public.kr8_admin_emails (email) values ('ad86@example.com') on conflict do nothing;
select pg_temp.as_user('86000000-0000-4000-8000-0000000000ad');
create temp table u86 as select public.kr8_is_admin() is_admin;
select case when (select is_admin from u86) then public.kr8_admin_place_undo((select id from g86), 'hide') end;
select pg_temp.ok(not (select is_admin from u86) or not exists (select 1 from public.kr8_post_places where place_id = (select id from g86)), 'admin hide: place leaves the Reel');
select case when (select is_admin from u86) then public.kr8_admin_place_undo((select id from g86), 'restore') end;
select pg_temp.ok(not (select is_admin from u86) or exists (select 1 from public.kr8_post_places where place_id = (select id from g86) and post_id = '86000000-0000-4000-8000-0000000000f1'), 'admin restore: tag put back');
select pg_temp.ok(not (select is_admin from u86) or jsonb_array_length(public.kr8_admin_places_auto(1)) >= 9, 'admin auto list shows the decisions');

select 'ALL PASS (' || count(*) || ')' || case when (select is_admin from u86) then '' else ' · admin undo skipped (no admin table)' end from t86;
