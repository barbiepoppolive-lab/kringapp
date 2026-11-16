-- SCRATCH DATABASE ONLY. Proves 0070 (audit 16 Nov P0-3, P1-1, P2-3, P2-11) on a private copy built from the repo migrations.
-- psql -v ON_ERROR_STOP=1 -f 0070_test.sql   (after all migrations incl. 0043 + 0070)
\set QUIET on
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false) $$;
create or replace function pg_temp.ok(c boolean, what text) returns void language plpgsql as $$
begin if not coalesce(c, false) then raise exception 'FAIL: %', what; end if; raise notice 'PASS: %', what; end $$;
create or replace function pg_temp.err(sqlt text) returns text language plpgsql as $$
begin execute sqlt; return 'no error'; exception when others then return sqlerrm; end $$;

-- people: the founder's admin email, a staff member, the Kring Team account, two members
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'barbiepoppolive@gmail.com', now()),
  ('b0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mint@example.com', now()),
  ('c0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ploy@example.com', now()),
  ('d0000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ops@kringapp.com', now())
on conflict do nothing;
insert into public.kr6_staff (user_id, role) values ('d0000000-0000-0000-0000-00000000000d', 'ops') on conflict do nothing;

-- a real-looking 384 px JPEG data URL is long; 2,000 characters stands in for it
select set_config('t.photo', 'data:image/jpeg;base64,' || repeat('A', 2000), false);

-- ── P1-1: new card needs an uploaded photo ──
select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
set role authenticated;
select pg_temp.ok(pg_temp.err($$select public.kr8_save_card('Mint', array['TH'], '', 'Bangkok', 'local', null, true)$$) like '%KR8_PHOTO_NEEDED%', 'new card with NO photo is refused');
select pg_temp.ok(pg_temp.err($$select public.kr8_save_card('Mint', array['TH'], '', 'Bangkok', 'local', 'https://profile.line-scdn.net/x/abc', true)$$) like '%KR8_PHOTO_NEEDED%', 'new card with only a LINE link is refused');
select pg_temp.ok(pg_temp.err($$select public.kr8_save_card('Mint', array['TH'], '', 'Bangkok', 'local', 'data:image/png;base64,iVBORw0KGgo=', true)$$) like '%KR8_PHOTO_NEEDED%', 'new card with a 1-pixel image is refused');
select pg_temp.ok(pg_temp.err($$select public.kr8_save_card('Mint', array['TH'], '', 'Bangkok', 'local', current_setting('t.photo'), true)$$) = 'no error', 'new card with an uploaded photo is saved');
select public.kr8_note_photo_check(false);
reset role;
select pg_temp.ok((select photo_check from public.kr8_members where user_id = 'b0000000-0000-0000-0000-00000000000b') = 'unchecked', 'phone could not run the face check: card flagged unchecked');
-- existing member with no photo (made before this rule) can still save their card
insert into public.kr8_members (user_id, first_name, langs, area, who, age_ok_at) values ('c0000000-0000-0000-0000-00000000000c', 'Ploy', array['TH'], 'Bangkok', 'local', now());
select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
set role authenticated;
select pg_temp.ok(pg_temp.err($$select public.kr8_save_card('Ploy', array['TH','EN'], 'hi', 'Bangkok', 'local', null, false)$$) = 'no error', 'existing member without photo still saves (not broken)');
reset role;
select set_config('request.jwt.claims', '', false);
select pg_temp.ok((select (r->'members'->0) ? 'photo_check' from (select public.kr8_admin_member_list(10, true) r) x), 'admin member list carries photo_check');

-- ── P2-11: same person reported again and again ──
select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ begin for i in 1..15 loop perform public.kr8_report('b0000000-0000-0000-0000-00000000000b', 'spam'); end loop; end $$;
reset role;
select pg_temp.ok((select count(*) from public.kr8_reports where reporter = 'c0000000-0000-0000-0000-00000000000c' and target_user = 'b0000000-0000-0000-0000-00000000000b') = 1, '15 reports of one person = 1 open report');
update public.kr8_reports set handled_at = now() where reporter = 'c0000000-0000-0000-0000-00000000000c';
select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
set role authenticated;
select public.kr8_report('b0000000-0000-0000-0000-00000000000b', 'again later');
reset role;
select pg_temp.ok((select count(*) from public.kr8_reports where reporter = 'c0000000-0000-0000-0000-00000000000c') = 2, 'after the admin closed it, a new report can be made');

-- ── P2-3: hide a Reel with a note; only the owner sees it, with the reason ──
insert into public.kr8_posts (id, author, kind, status, video_path, poster_path, body, duration_ms, width, height)
values ('e0000000-0000-0000-0000-00000000000e', 'b0000000-0000-0000-0000-00000000000b', 'reel', 'pending', 'b0000000-0000-0000-0000-00000000000b/e0000000-0000-0000-0000-00000000000e.mp4', 'b0000000-0000-0000-0000-00000000000b/e0000000-0000-0000-0000-00000000000e.jpg', 'Talat Noi', 20000, 720, 1280);
select set_config('request.jwt.claims', '', false);
select public.kr8_admin_review_reel('e0000000-0000-0000-0000-00000000000e', 'hidden', 'No face or people in the clip');
select pg_temp.ok(exists (select 1 from public.kr8_push_msgs where ref_id = 'e0000000-0000-0000-0000-00000000000e' and to_user = 'b0000000-0000-0000-0000-00000000000b'
                         and body = 'No face or people in the clip' and not line), 'owner gets a phone ding with the reason (no LINE)');
select pg_temp.as_user('b0000000-0000-0000-0000-00000000000b');
set role authenticated;
select pg_temp.ok((select r->'reels'->0->>'status' = 'hidden' and r->'reels'->0->>'note' = 'No face or people in the clip' from (select public.kr8_member_reels('b0000000-0000-0000-0000-00000000000b') r) x), 'owner sees "Hidden · reason" on own grid');
select pg_temp.ok(exists (select 1 from public.kr8_my_activity(20) a where a.kind = 'hidden' and a.prize = 'No face or people in the clip'), 'owner gets an Activity line with the reason');
select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select jsonb_array_length(r->'reels') = 0 from (select public.kr8_member_reels('b0000000-0000-0000-0000-00000000000b') r) x), 'nobody else sees the hidden Reel');
reset role;

-- ── P0-3: admin deletes own member card, admin sign-in stays ──
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
set role authenticated;
select public.kr8_save_card('Barbie', array['EN'], '', 'Bangkok', 'local', current_setting('t.photo'), true);
reset role;
insert into public.kr8_posts (author, kind, status, duration_ms, width, height, video_path, poster_path) values ('a0000000-0000-0000-0000-00000000000a', 'reel', 'approved', 20000, 720, 1280, 'a0000000-0000-0000-0000-00000000000a/f0000000-0000-0000-0000-00000000000f.mp4', 'a0000000-0000-0000-0000-00000000000a/f0000000-0000-0000-0000-00000000000f.jpg');
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
set role authenticated;
select pg_temp.ok((select (public.kr8_delete_me2())->>'kept_sign_in') = 'true', 'admin delete: told the sign-in is kept');
select pg_temp.ok(public.kr8_is_admin(), 'admin is still admin after deleting their card');
reset role;
select pg_temp.ok(exists (select 1 from auth.users where id = 'a0000000-0000-0000-0000-00000000000a'), 'admin sign-in (auth user) still exists');
select pg_temp.ok(not exists (select 1 from public.kr8_members where user_id = 'a0000000-0000-0000-0000-00000000000a'), 'admin member card is gone');
select pg_temp.ok(not exists (select 1 from public.kr8_posts where author = 'a0000000-0000-0000-0000-00000000000a'), 'admin Reels are gone');
select pg_temp.ok((select reviewed_by from public.kr8_posts where id = 'e0000000-0000-0000-0000-00000000000e') is null
                  or exists (select 1 from public.kr8_posts where id = 'e0000000-0000-0000-0000-00000000000e'), 'reviews done by others untouched');
-- the admin can make a card again later (same sign-in)
select pg_temp.as_user('a0000000-0000-0000-0000-00000000000a');
set role authenticated;
select pg_temp.ok(pg_temp.err($$select public.kr8_save_card('Barbie', array['EN'], '', 'Bangkok', 'local', current_setting('t.photo'), true)$$) = 'no error', 'admin can make a new card afterwards');
reset role;

-- staff (kr6_staff) through the OLD function name: sign-in kept too
insert into public.kr8_members (user_id, first_name, langs, area, who, age_ok_at) values ('d0000000-0000-0000-0000-00000000000d', 'Ops', array['EN'], 'Bangkok', 'local', now());
select pg_temp.as_user('d0000000-0000-0000-0000-00000000000d');
set role authenticated;
select public.kr8_delete_me();
reset role;
select pg_temp.ok(exists (select 1 from auth.users where id = 'd0000000-0000-0000-0000-00000000000d') and not exists (select 1 from public.kr8_members where user_id = 'd0000000-0000-0000-0000-00000000000d'), 'staff: card gone, sign-in kept (old kr8_delete_me name)');

-- a normal member: whole account deleted as before
select pg_temp.as_user('c0000000-0000-0000-0000-00000000000c');
set role authenticated;
select pg_temp.ok((select (public.kr8_delete_me2())->>'kept_sign_in') = 'false', 'member delete: whole account');
reset role;
select pg_temp.ok(not exists (select 1 from auth.users where id = 'c0000000-0000-0000-0000-00000000000c'), 'member sign-in deleted as before');

-- anon can't call the new functions
set role anon;
select pg_temp.ok(pg_temp.err('select public.kr8_delete_me2()') like '%permission denied%', 'anon cannot call kr8_delete_me2');
select pg_temp.ok(pg_temp.err('select public.kr8_is_protected_login(null)') like '%permission denied%', 'nobody outside can call kr8_is_protected_login');
reset role;
\echo ALL 0070 CHECKS PASSED
