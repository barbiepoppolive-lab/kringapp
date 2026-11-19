\set ON_ERROR_STOP 1
create temp table res (n serial, name text, ok boolean);
create or replace function pg_temp.chk(name text, ok boolean) returns void language sql as $$ insert into res (name, ok) values (name, coalesce(ok, false)) $$;
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222'), ('33333333-3333-3333-3333-333333333333'), ('44444444-4444-4444-4444-444444444444');
-- ghost / demo row seeded with no member signed in: allowed and left alone
insert into public.kr8_members (user_id, first_name, who, ghost) values ('44444444-4444-4444-4444-444444444444', 'Yui demo', 'traveller', true);
select pg_temp.chk('seed (no member) may write traveller', (select who from kr8_members where first_name = 'Yui demo') = 'traveller');

-- member A signs in
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select pg_temp.chk('new card asking traveller saves as local', public.kr8_save_card_who('traveller') = 'local');
select pg_temp.chk('edit card asking traveller stays local', public.kr8_save_card_who('traveller') = 'local');
update kr8_members set who = 'traveller' where user_id = auth.uid();
select pg_temp.chk('direct update to traveller blocked', (select who from kr8_members where user_id = auth.uid()) = 'local');
select pg_temp.chk('my_traveller: no request', (public.kr8_my_traveller() -> 'request') = 'null'::jsonb);
-- bad paths
do $$ begin perform public.kr8_request_traveller('22222222-2222-2222-2222-222222222222/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg'); perform pg_temp.chk('other folder refused', false);
  exception when others then perform pg_temp.chk('other folder refused', sqlerrm = 'KR8_BAD_FILE'); end $$;
do $$ begin perform public.kr8_request_traveller('11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg'); perform pg_temp.chk('missing file refused', false);
  exception when others then perform pg_temp.chk('missing file refused', sqlerrm = 'KR8_BAD_FILE'); end $$;
insert into storage.objects (bucket_id, name) values ('kr8-passport', '11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg'),
  ('kr8-passport', '11111111-1111-1111-1111-111111111111/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg');
select pg_temp.chk('request filed → pending', public.kr8_request_traveller('11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg') #>> '{request,status}' = 'pending');
select pg_temp.chk('pending does not unlock traveller', public.kr8_save_card_who('traveller') = 'local');
select pg_temp.chk('second photo replaces the first', public.kr8_request_traveller('11111111-1111-1111-1111-111111111111/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg') #>> '{request,status}' = 'pending');
select pg_temp.chk('one pending row only', (select count(*) from kr8_traveller_requests where status = 'pending') = 1);
select pg_temp.chk('replaced file queued for deletion', exists (select 1 from kr8_storage_trash where bucket = 'kr8-passport' and name like '%aaaaaaaa%'));
-- not admin
do $$ begin perform public.kr8_admin_traveller_requests(); perform pg_temp.chk('member cannot list', false);
  exception when others then perform pg_temp.chk('member cannot list', sqlerrm = 'KR8_ADMIN_ONLY'); end $$;
do $$ begin perform public.kr8_admin_traveller_decide((select id from kr8_traveller_requests where status = 'pending'), true); perform pg_temp.chk('member cannot decide', false);
  exception when others then perform pg_temp.chk('member cannot decide', sqlerrm = 'KR8_ADMIN_ONLY'); end $$;
do $$ begin perform public.kr8_admin_passport_files_due(); perform pg_temp.chk('member cannot see due files', false);
  exception when others then perform pg_temp.chk('member cannot see due files', sqlerrm = 'KR8_ADMIN_ONLY'); end $$;

-- admin (signed in as member C)
insert into kr8_members (user_id, first_name) values ('33333333-3333-3333-3333-333333333333', 'Admin');
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
select set_config('test.admin', '1', false);
select pg_temp.chk('admin lists 1 pending', (select count(*) from public.kr8_admin_traveller_requests()) = 1);
do $$ begin perform public.kr8_admin_traveller_decide((select id from kr8_traveller_requests where status = 'pending'), false); perform pg_temp.chk('refuse needs a reason', false);
  exception when others then perform pg_temp.chk('refuse needs a reason', sqlerrm = 'KR8_NEED_REASON'); end $$;
do $$ begin perform public.kr8_admin_traveller_decide((select id from kr8_traveller_requests where status = 'pending'), false, 'other', ''); perform pg_temp.chk('other needs a note', false);
  exception when others then perform pg_temp.chk('other needs a note', sqlerrm = 'KR8_NEED_REASON'); end $$;
select pg_temp.chk('approve', public.kr8_admin_traveller_decide((select id from kr8_traveller_requests where status = 'pending'), true) ->> 'status' = 'approved');
select pg_temp.chk('card is traveller after approve', (select who from kr8_members where user_id = '11111111-1111-1111-1111-111111111111') = 'traveller');
select pg_temp.chk('flag reset after decide', coalesce(current_setting('kr8.traveller_set', true), '') = '');
select pg_temp.chk('member dinged once', (select count(*) from push_log where to_user = '11111111-1111-1111-1111-111111111111') = 1);
do $$ begin perform public.kr8_admin_traveller_decide((select id from kr8_traveller_requests where status = 'approved'), false, 'unclear'); perform pg_temp.chk('no double decision', false);
  exception when others then perform pg_temp.chk('no double decision', sqlerrm = 'KR8_ALREADY_DECIDED'); end $$;
select pg_temp.chk('admin own card cannot self-set traveller', public.kr8_save_card_who('traveller') = 'local');

-- approved member keeps it on card saves; may go back to local, and that sticks
select set_config('test.admin', '', false);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select pg_temp.chk('approved: card save keeps traveller', public.kr8_save_card_who('traveller') = 'traveller');
select pg_temp.chk('my_traveller says traveller', public.kr8_my_traveller() ->> 'who' = 'traveller');
do $$ begin perform public.kr8_request_traveller('11111111-1111-1111-1111-111111111111/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg'); perform pg_temp.chk('already traveller refused', false);
  exception when others then perform pg_temp.chk('already traveller refused', sqlerrm = 'KR8_ALREADY_TRAVELLER'); end $$;
select pg_temp.chk('back to local allowed', public.kr8_save_card_who('local') = 'local');
select pg_temp.chk('back to local sticks (old approval does not turn it on again)', public.kr8_save_card_who('traveller') = 'local');
-- a real traveller from before 0138 (#68 Iceman: no request row) edits the card through the real upsert: keeps the tag
select set_config('request.jwt.claim.sub', '', false);
insert into auth.users values ('68686868-6868-6868-6868-686868686868');
insert into public.kr8_members (user_id, first_name, who, verified, member_no) values ('68686868-6868-6868-6868-686868686868', 'Iceman', 'traveller', true, 68);
select set_config('request.jwt.claim.sub', '68686868-6868-6868-6868-686868686868', false);
select pg_temp.chk('#68 card save (upsert) keeps traveller', public.kr8_save_card('Iceman', array['EN'], '', 'Bangkok', 'traveller') ->> 'who' = 'traveller');
select pg_temp.chk('#68 old-build save with local is his own choice', true);

-- member B: refused with a reason
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select public.kr8_save_card_who('local');
insert into storage.objects (bucket_id, name) values ('kr8-passport', '22222222-2222-2222-2222-222222222222/cccccccc-cccc-cccc-cccc-cccccccccccc.jpg');
select public.kr8_request_traveller('22222222-2222-2222-2222-222222222222/cccccccc-cccc-cccc-cccc-cccccccccccc.jpg');
select set_config('test.admin', '1', false);
select pg_temp.chk('refuse thai', public.kr8_admin_traveller_decide((select id from kr8_traveller_requests where status = 'pending'), false, 'thai') ->> 'status' = 'refused');
select set_config('test.admin', '', false);
select pg_temp.chk('B still local', (select who from kr8_members where user_id = auth.uid()) = 'local');
select pg_temp.chk('B sees reason code', public.kr8_my_traveller() #>> '{request,reason_code}' = 'thai');
-- rate limit: 3 a day
insert into storage.objects (bucket_id, name) values ('kr8-passport', '22222222-2222-2222-2222-222222222222/dddddddd-dddd-dddd-dddd-dddddddddddd.jpg'),
  ('kr8-passport', '22222222-2222-2222-2222-222222222222/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee.jpg'), ('kr8-passport', '22222222-2222-2222-2222-222222222222/ffffffff-ffff-ffff-ffff-ffffffffffff.jpg');
select public.kr8_request_traveller('22222222-2222-2222-2222-222222222222/dddddddd-dddd-dddd-dddd-dddddddddddd.jpg');
select public.kr8_request_traveller('22222222-2222-2222-2222-222222222222/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee.jpg');
do $$ begin perform public.kr8_request_traveller('22222222-2222-2222-2222-222222222222/ffffffff-ffff-ffff-ffff-ffffffffffff.jpg'); perform pg_temp.chk('4th request in 24 h refused', false);
  exception when others then perform pg_temp.chk('4th request in 24 h refused', sqlerrm = 'KR8_SLOW_DOWN'); end $$;

-- deletion: at the decision, 30 days for an undecided request, a day for an orphan upload
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.chk('decided requests forget the photo at once', not exists (select 1 from kr8_traveller_requests where status in ('approved', 'refused') and passport_path is not null));
select pg_temp.chk('decided photos queued at once', (select count(*) from kr8_storage_trash where bucket = 'kr8-passport' and (name like '%bbbbbbbb%' or name like '%cccccccc%')) = 2);
update kr8_traveller_requests set created_at = now() - interval '31 days' where status = 'pending';
update storage.objects set created_at = now() - interval '2 days' where name like '%ffffffff%';
select pg_temp.chk('nightly expire: old pending + orphan upload', public.kr8_passport_expire() = 2);
select pg_temp.chk('old pending → expired, path gone', (select count(*) from kr8_traveller_requests where status = 'expired' and passport_path is null) = 1);
select pg_temp.chk('orphan upload queued', exists (select 1 from kr8_storage_trash where name like '%ffffffff%'));
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
select set_config('test.admin', '1', false);
select pg_temp.chk('admin due list = the trash queue', (select count(*) from public.kr8_admin_passport_files_due()) = (select count(*) from kr8_storage_trash where bucket = 'kr8-passport' and removed_at is null));
select pg_temp.chk('ghost/demo row untouched', (select who from kr8_members where first_name = 'Yui demo') = 'traveller');
select set_config('test.admin', '', false);
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.chk('kick never raises', public.kr8_passport_cleanup_kick() = 0);
select pg_temp.chk('service trash list', (select count(*) from public.kr8_service_passport_trash()) >= 4);
select pg_temp.chk('service done', public.kr8_service_passport_trash_done(array(select id from public.kr8_service_passport_trash())) >= 4);
-- account deleted: pending file queued
update kr8_traveller_requests set passport_path = '22222222-2222-2222-2222-222222222222/99999999-9999-9999-9999-999999999999.jpg', file_deleted_at = null where status = 'expired';
delete from auth.users where id = '22222222-2222-2222-2222-222222222222';
select pg_temp.chk('deleted account: its file queued', exists (select 1 from kr8_storage_trash where name like '%99999999%' and removed_at is null));
select pg_temp.chk('no passport numbers column', not exists (select 1 from information_schema.columns where table_name = 'kr8_traveller_requests' and column_name ~ 'number|passport_no'));
select n, name, ok from res order by n;
select count(*) filter (where ok) || '/' || count(*) as passed from res;
