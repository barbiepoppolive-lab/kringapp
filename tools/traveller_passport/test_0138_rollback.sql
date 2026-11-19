-- 0138 traveller tag: one BEGIN … ROLLBACK test. Leaves nothing behind.
-- Run on a throwaway copy, never on live:  psql -d t -f stub.sql; psql -d t -f ../../supabase/migrations/0138_kr8_traveller_passport.sql;
--                                          psql -d t -v ON_ERROR_STOP=1 -f test_0138_rollback.sql
-- (On a Supabase staging copy instead of the stub: give user A2 an admin row in kr6_staff inside the transaction; test.admin is the stub's switch.)
-- Shows: member asks → pending · a non-admin cannot approve · admin approves → traveller · photo queued for deletion at the decision
--        · a pre-0138 traveller (#68-style, no request row) keeps the tag when saving the card · a member can't make themselves traveller.
\set ON_ERROR_STOP 1
begin;

insert into auth.users values ('a1a1a1a1-0000-0000-0000-000000000001'), ('a2a2a2a2-0000-0000-0000-000000000002'), ('a6a6a6a6-0000-0000-0000-000000000068');
-- seeded with nobody signed in (like the live rows): a real traveller from before 0138
insert into public.kr8_members (user_id, first_name, who, verified, member_no) values ('a6a6a6a6-0000-0000-0000-000000000068', 'Iceman', 'traveller', true, 68);

-- 1. member A1 makes a card asking for traveller → stays local
select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ begin
  if public.kr8_save_card('Anna', array['EN'], '', 'Bangkok', 'traveller', null, true) ->> 'who' <> 'local' then raise exception 'FAIL: member made themselves traveller'; end if;
  update public.kr8_members set who = 'traveller' where user_id = auth.uid();
  if (select who from public.kr8_members where user_id = auth.uid()) <> 'local' then raise exception 'FAIL: direct update made traveller'; end if;
  raise notice 'PASS 1: a member cannot make themselves traveller';
end $$;

-- 2. A1 sends a passport photo → pending
insert into storage.objects (bucket_id, name) values ('kr8-passport', 'a1a1a1a1-0000-0000-0000-000000000001/11111111-2222-3333-4444-555555555555.jpg');
do $$ begin
  if public.kr8_request_traveller('a1a1a1a1-0000-0000-0000-000000000001/11111111-2222-3333-4444-555555555555.jpg') #>> '{request,status}' <> 'pending' then raise exception 'FAIL: not pending'; end if;
  if (select who from public.kr8_members where user_id = auth.uid()) <> 'local' then raise exception 'FAIL: pending already traveller'; end if;
  raise notice 'PASS 2: request → pending, card still local';
end $$;

-- 3. the member (not an admin) tries to approve their own request → refused
do $$ begin
  perform public.kr8_admin_traveller_decide((select id from public.kr8_traveller_requests where user_id = auth.uid() and status = 'pending'), true);
  raise exception 'FAIL: non-admin approved';
exception when others then
  if sqlerrm <> 'KR8_ADMIN_ONLY' then raise; end if;
  raise notice 'PASS 3: non-admin cannot approve (KR8_ADMIN_ONLY)';
end $$;
do $$ begin
  perform set_config('kr8.traveller_set', '1', true);   -- forging the decision flag does not help either
  update public.kr8_members set who = 'traveller' where user_id = auth.uid();
  perform set_config('kr8.traveller_set', '', true);
  if (select who from public.kr8_members where user_id = auth.uid()) <> 'local' then raise exception 'FAIL: forged flag made traveller'; end if;
  raise notice 'PASS 3b: a forged session flag is ignored for non-admins';
end $$;

-- 4. admin A2 approves → traveller; photo queued for deletion at once
select set_config('request.jwt.claim.sub', 'a2a2a2a2-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"a2a2a2a2-0000-0000-0000-000000000002","role":"authenticated"}', true);
select set_config('test.admin', '1', true);
do $$ declare rid uuid := (select id from public.kr8_traveller_requests where user_id = 'a1a1a1a1-0000-0000-0000-000000000001' and status = 'pending');
begin
  if (select count(*) from public.kr8_admin_traveller_requests('pending') x where x.id = rid) <> 1 then raise exception 'FAIL: admin does not see the case'; end if;
  if public.kr8_admin_traveller_decide(rid, true) ->> 'status' <> 'approved' then raise exception 'FAIL: approve'; end if;
  if (select who from public.kr8_members where user_id = 'a1a1a1a1-0000-0000-0000-000000000001') <> 'traveller' then raise exception 'FAIL: not traveller after approve'; end if;
  if (select passport_path from public.kr8_traveller_requests where id = rid) is not null then raise exception 'FAIL: photo path kept after decision'; end if;
  if not exists (select 1 from public.kr8_storage_trash where bucket = 'kr8-passport' and name like 'a1a1a1a1%' and removed_at is null) then raise exception 'FAIL: photo not queued'; end if;
  raise notice 'PASS 4: admin approves → traveller; passport photo queued for deletion at the decision';
end $$;
select set_config('test.admin', '', true);

-- 5. the approved member and #68 keep the tag when they save their card (kr8_save_card is an upsert)
select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ begin
  if public.kr8_save_card('Anna', array['EN'], 'hi', 'Bangkok', 'traveller') ->> 'who' <> 'traveller' then raise exception 'FAIL: approved member lost the tag'; end if;
  raise notice 'PASS 5a: approved member keeps traveller on card save';
end $$;
select set_config('request.jwt.claim.sub', 'a6a6a6a6-0000-0000-0000-000000000068', true);
select set_config('request.jwt.claims', '{"sub":"a6a6a6a6-0000-0000-0000-000000000068","role":"authenticated"}', true);
do $$ begin
  if public.kr8_save_card('Iceman', array['EN'], '', 'Bangkok', 'traveller') ->> 'who' <> 'traveller' then raise exception 'FAIL: #68 lost the tag'; end if;
  if public.kr8_my_traveller() ->> 'who' <> 'traveller' then raise exception 'FAIL: #68 state'; end if;
  raise notice 'PASS 5b: #68-style existing traveller keeps the tag';
end $$;

rollback;
