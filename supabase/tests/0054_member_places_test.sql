-- Run on a scratch database after 0044 (places part), 0045 and 0054 (see stub in the commit message). Every line prints PASS/FAIL.
\set QUIET on
create or replace function pg_temp.ok(c boolean, n text) returns text language sql as $$ select (case when c then 'PASS ' else 'FAIL ' end) || n $$;
select set_config('t.uid', '', false);
select pg_temp.ok((select count(*) from kr8_places_search('ตลาดน้อย')) >= 1, 'Thai search finds Talat Noi');
select pg_temp.ok((select count(*) from kr8_places_search('าดน้')) >= 1, 'Thai middle-of-word search');
select pg_temp.ok((select count(*) from kr8_places_search('LHONG')) >= 1, 'English, any case');
select pg_temp.ok((select count(*) from kr8_places_search('ong 19')) >= 1, 'English partial with a space');
select pg_temp.ok((select count(*) from kr8_places_search('qq%zz')) = 0, '% in the query is not a wildcard');
select pg_temp.ok((select count(*) from kr8_places_search('กูกินจุ')) = 0, 'กูกินจุ not on Kring before');
-- signed out cannot add
select set_config('t.uid', '', false);
do $$ begin perform kr8_member_add_place('กูกินจุ'); raise notice 'FAIL signed-out add'; exception when others then raise notice 'PASS signed-out add refused (%)', sqlerrm; end $$;
-- member #16 adds it
select set_config('t.uid', '11111111-1111-1111-1111-111111111111', false);
select pg_temp.ok((kr8_member_add_place('กูกินจุ', 'Ari', 'https://maps.app.goo.gl/abc', null, null)->>'status') = 'pending', 'member adds กูกินจุ as pending');
select pg_temp.ok((select coords_rough and kr_area = 'Ari' and name_th = 'กูกินจุ' and maps_url like 'https://maps.app%' from kr8_places where name_en = 'กูกินจุ'), 'area centre pin, Thai name kept, link kept');
select pg_temp.ok((select count(*) from kr8_places_search2('กูกิน') where status = 'pending') = 1, 'the member who added it finds it (partial Thai)');
select pg_temp.ok((kr8_member_add_place('กูกินจุ', 'Ari')->>'existing')::boolean, 'same name again → same row');
select pg_temp.ok((kr8_member_add_place('Gukinju', 'Bangkok', null, 13.8, 100.55)->>'lat')::float = 13.8, 'English name with exact pin');
select pg_temp.ok((kr8_member_add_place('Bad', 'Nowhere', 'javascript:alert(1)')->>'kr_area') = 'Bangkok', 'unknown area → Bangkok, bad link dropped');
select pg_temp.ok((select maps_url is null from kr8_places where name_en = 'Bad'), 'bad link not stored');
do $$ begin perform kr8_member_add_place('x'); raise notice 'FAIL 1-char name'; exception when others then raise notice 'PASS 1-char name refused (%)', sqlerrm; end $$;
do $$ begin perform kr8_member_add_place('see https://spam.example'); raise notice 'FAIL link as name'; exception when others then raise notice 'PASS link as name refused (%)', sqlerrm; end $$;
-- someone else does not see it
select set_config('t.uid', '22222222-2222-2222-2222-222222222222', false);
select pg_temp.ok((select count(*) from kr8_places_search('กูกินจุ')) = 0, 'other members do not see a pending place');
do $$ begin perform kr8_admin_places_pending(); raise notice 'FAIL member reads admin list'; exception when others then raise notice 'PASS admin list is admin-only'; end $$;
-- admin approves
select set_config('t.admin', '1', false);
select pg_temp.ok(jsonb_array_length(kr8_admin_places_pending()) = 3, 'admin sees the 3 typed places');
select pg_temp.ok((kr8_admin_place_review((select id from kr8_places where name_en = 'กูกินจุ'), 'approve', 'Gukinju', 'กูกินจุ', 'Ari', 13.781, 100.546)->>'status') = 'live', 'admin approves with English name + exact pin');
select pg_temp.ok((kr8_admin_place_review((select id from kr8_places where name_en = 'Bad'), 'reject')->>'status') = 'rejected', 'admin rejects');
select set_config('t.admin', '', false);
select pg_temp.ok((select count(*) from kr8_places_search('กูกินจุ')) = 1 and (select count(*) from kr8_places_search('gukin')) >= 1, 'after approval everyone finds it in Thai and English');
select pg_temp.ok((select count(*) from kr8_places_search('Bad')) = 0, 'rejected place hidden');
select pg_temp.ok((select count(*) from kr8_places where status = 'live' and added_how is null) = 63, 'seeded rows untouched and live');
