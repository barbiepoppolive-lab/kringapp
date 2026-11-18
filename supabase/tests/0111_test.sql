-- 0111 test (throwaway / TEST DB only; everything rolls back). Prints PASS lines; any failure raises.
-- Members: I = inviter #100 (verified), F = friend #101 (NOT verified, joined with ?ref=k00100), P = pending check #102,
--          V = verified #103 with a trusted print, G = ghost #104, X = test account #105 (ref=k00100).
begin;
create or replace function pg_temp.ok(c boolean, m text) returns void language plpgsql as $$
begin if coalesce(c, false) then raise notice 'PASS %', m; else raise exception 'FAIL %', m; end if; end $$;
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create or replace function pg_temp.face(v real) returns real[] language sql as $$ select array_fill(v, array[128]) $$;

insert into public.kr8_members (user_id, member_no, first_name, verified, ghost, ref_code, created_at, is_test) values
  ('00000000-0000-4000-8000-000000000100', 100, 'Inviter', true,  false, null,      now() - interval '5 days', false),
  ('00000000-0000-4000-8000-000000000101', 101, 'Friend',  false, false, 'k00100',  now(), false),
  ('00000000-0000-4000-8000-000000000102', 102, 'Pending', false, false, null,      now(), false),
  ('00000000-0000-4000-8000-000000000103', 103, 'Verified',true,  false, null,      now(), false),
  ('00000000-0000-4000-8000-000000000104', 104, 'Ghost',   false, true,  'k00100',  now(), false),
  ('00000000-0000-4000-8000-000000000105', 105, 'Tester',  false, false, 'k00100',  now(), true)
on conflict (user_id) do update set verified = excluded.verified, ghost = excluded.ghost, ref_code = excluded.ref_code, is_test = excluded.is_test;
insert into public.kr8_verifications (user_id, status) values ('00000000-0000-4000-8000-000000000102', 'pending');
with v as (insert into public.kr8_verifications (user_id, status) values ('00000000-0000-4000-8000-000000000103', 'approved') returning id)
insert into public.kr8_face_prints (user_id, descriptor, source, verification_id) select '00000000-0000-4000-8000-000000000103', pg_temp.face(0.10), 'verify', id from v;
insert into public.kr8_prizes (id, member_id) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000102'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000103');
insert into public.kr8_reward_codes (brand, amount_thb, code) values ('grab', 100, 'GRAB-1'), ('grab', 100, 'GRAB-2'), ('grab', 100, 'GRAB-3');

-- 1. the unverified member is no longer gated: hidden nowhere, can post / say hi / chat / answer
select pg_temp.ok(not public.kr8_face_gate('00000000-0000-4000-8000-000000000101'), '1a face gate off for an unverified new member');
select pg_temp.as_user('00000000-0000-4000-8000-000000000100');
select pg_temp.ok(exists (select 1 from public.kr8_people(60) where user_id = '00000000-0000-4000-8000-000000000101'), '1b unverified member shows in People');
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
insert into public.kr8_posts (author, kind, status) values ('00000000-0000-4000-8000-000000000101', 'reel', 'pending');
insert into public.kr8_threads (user_a, user_b) values ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000100');
insert into public.kr8_messages (sender, body) values ('00000000-0000-4000-8000-000000000101', 'hi');
insert into public.kr8_answers (author) values ('00000000-0000-4000-8000-000000000101');
insert into public.kr8_ask_answers (author) values ('00000000-0000-4000-8000-000000000101');
select pg_temp.ok(true, '1c unverified member posted a Reel, said hi, chatted and answered (no KR8_VERIFY_FIRST)');
-- the switch brings the 0093 rule back
update public.kr8_rings_config set value = 1 where key = 'face_gate_on';
insert into public.kr8_rings_config (key, value) values ('face_gate_on', 1) on conflict (key) do update set value = 1;
select pg_temp.ok(public.kr8_face_gate('00000000-0000-4000-8000-000000000101'), '1d switch face_gate_on = 1 restores the 0093 gate');
do $$ begin
  insert into public.kr8_messages (sender, body) values ('00000000-0000-4000-8000-000000000101', 'gated');
  raise exception 'FAIL 1e gate did not fire';
exception when others then if sqlerrm <> 'KR8_VERIFY_FIRST' then raise; end if; raise notice 'PASS 1e switch on: KR8_VERIFY_FIRST again'; end $$;
update public.kr8_rings_config set value = 0 where key = 'face_gate_on';

-- 2. prize claim needs the face check
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
do $$ begin
  perform public.kr8_claim_prize('00000000-0000-4000-8000-0000000000a1', 'grab', 'dev-101', pg_temp.face(0.10));
  raise exception 'FAIL 2a unverified claim went through';
exception when others then if sqlerrm <> 'KR8_VERIFY_FIRST' then raise; end if; raise notice 'PASS 2a unverified member: claim → KR8_VERIFY_FIRST'; end $$;
select pg_temp.ok((select status from public.kr8_prizes where id = '00000000-0000-4000-8000-0000000000a1') = 'won', '2b the prize stays won (claim later)');
select pg_temp.ok(not exists (select 1 from public.kr8_reward_claims where member_id = '00000000-0000-4000-8000-000000000101'), '2c no claim row, no code handed out');
-- a check waiting for the team: the claim goes in, held (no trusted print yet)
select pg_temp.as_user('00000000-0000-4000-8000-000000000102');
select pg_temp.ok((public.kr8_claim_prize('00000000-0000-4000-8000-0000000000a2', 'grab', 'dev-102', pg_temp.face(0.10)) ->> 'status') = 'pending', '2d pending check: claim accepted and held');
select pg_temp.ok((select reason from public.kr8_claim_holds h join public.kr8_reward_claims c on c.id = h.claim_id where c.member_id = '00000000-0000-4000-8000-000000000102') = 'review', '2e held for review (no verified print)');
-- verified + close face + NO photo: paid at once (the 0092/0075 no_photo bug is gone)
select pg_temp.as_user('00000000-0000-4000-8000-000000000103');
select pg_temp.ok((public.kr8_claim_prize('00000000-0000-4000-8000-0000000000a3', 'grab', 'dev-103', pg_temp.face(0.12)) ->> 'status') = 'assigned', '2f verified, close face, no claim photo → code assigned (no_photo no longer holds)');
-- still held when the face is far from the verified print
update public.kr8_prizes set status = 'won', claim_id = null where id = '00000000-0000-4000-8000-0000000000a3';
delete from public.kr8_reward_claims where member_id = '00000000-0000-4000-8000-000000000103';
select pg_temp.ok((public.kr8_claim_prize('00000000-0000-4000-8000-0000000000a3', 'grab', 'dev-103', pg_temp.face(0.30)) ->> 'status') = 'pending', '2g verified but a different face → held');
select pg_temp.ok((select h.detail -> 'review' from public.kr8_claim_holds h join public.kr8_reward_claims c on c.id = h.claim_id where c.member_id = '00000000-0000-4000-8000-000000000103') = '["face_far"]'::jsonb, '2h hold reason face_far only (no no_photo)');
-- switch claim_needs_photo = 1 brings no_photo back
update public.kr8_rings_config set value = 1 where key = 'claim_needs_photo';
update public.kr8_prizes set status = 'won', claim_id = null where id = '00000000-0000-4000-8000-0000000000a3';
delete from public.kr8_claim_holds; delete from public.kr8_reward_claims where member_id = '00000000-0000-4000-8000-000000000103';
select pg_temp.ok((public.kr8_claim_prize('00000000-0000-4000-8000-0000000000a3', 'grab', 'dev-103', pg_temp.face(0.12)) ->> 'status') = 'pending', '2i switch claim_needs_photo = 1: no photo → held again');
update public.kr8_rings_config set value = 0 where key = 'claim_needs_photo';
-- a member with no face code at all is still sent to the face check (0066 rule) once verified
update public.kr8_prizes set status = 'won', claim_id = null where id = '00000000-0000-4000-8000-0000000000a3';
do $$ begin
  perform public.kr8_claim_prize('00000000-0000-4000-8000-0000000000a3', 'grab', 'dev-103', null);
  raise exception 'FAIL 2j claim without the 3-second face';
exception when others then if sqlerrm <> 'KR8_FACE_NEEDED' then raise; end if; raise notice 'PASS 2j verified member still needs the 3-second claim face'; end $$;

-- 3. invites: credit on the friend's FIRST APPROVED Reel, not on the face check
select set_config('request.jwt.claims', '', true);
select pg_temp.ok(not exists (select 1 from public.kr8_rings_ledger where reason = 'invite'), '3a joining (and posting a pending Reel) gives no invite Rings');
update public.kr8_members set verified = true where user_id = '00000000-0000-4000-8000-000000000105';
select pg_temp.ok(not exists (select 1 from public.kr8_rings_ledger where reason = 'invite'), '3b a face check alone gives no invite Rings');
update public.kr8_posts set status = 'approved' where author = '00000000-0000-4000-8000-000000000101';
select pg_temp.ok((select sum(delta) from public.kr8_rings_ledger where member_id = '00000000-0000-4000-8000-000000000100' and reason = 'invite') = 10, '3c first Reel approved → inviter +10');
select pg_temp.ok((select sum(delta) from public.kr8_rings_ledger where member_id = '00000000-0000-4000-8000-000000000101' and reason = 'invite_welcome') = 10, '3d … and the unverified friend +10');
insert into public.kr8_posts (author, kind, status) values ('00000000-0000-4000-8000-000000000101', 'reel', 'approved');
select pg_temp.ok((select count(*) from public.kr8_rings_ledger where reason = 'invite') = 1, '3e a 2nd approved Reel: once per pair');
select pg_temp.ok(public.kr8_invite_pair_ok('00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000101'), '3f the pair still counts on the board');
-- ghost and test friends never count
insert into public.kr8_posts (author, kind, status) values ('00000000-0000-4000-8000-000000000104', 'reel', 'approved'), ('00000000-0000-4000-8000-000000000105', 'reel', 'approved');
select pg_temp.ok(not exists (select 1 from public.kr8_rings_ledger where reason = 'invite' and ref_id in ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000105')), '3g ghost / test friends get nothing');
-- self-invite never counts
insert into public.kr8_members (user_id, member_no, first_name, ref_code) values ('00000000-0000-4000-8000-000000000106', 106, 'Self', 'k00106');
insert into public.kr8_posts (author, kind, status) values ('00000000-0000-4000-8000-000000000106', 'reel', 'approved');
select pg_temp.ok(not exists (select 1 from public.kr8_rings_ledger where member_id = '00000000-0000-4000-8000-000000000106'), '3h self-invite gets nothing');
-- same face as another account: no credit
insert into public.kr8_members (user_id, member_no, first_name, ref_code) values ('00000000-0000-4000-8000-000000000107', 107, 'Dupe', 'k00100');
insert into public.kr8_account_links (a, b, reason) values ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000107', 'face');
insert into public.kr8_posts (author, kind, status) values ('00000000-0000-4000-8000-000000000107', 'reel', 'approved');
select pg_temp.ok(not exists (select 1 from public.kr8_rings_ledger where ref_id = '00000000-0000-4000-8000-000000000107'), '3i same-face account gets nothing');
-- a hidden Reel does not count; un-hiding it does
insert into public.kr8_members (user_id, member_no, first_name, ref_code) values ('00000000-0000-4000-8000-000000000108', 108, 'Hid', 'k00100');
insert into public.kr8_posts (id, author, kind, status, hidden) values ('00000000-0000-4000-8000-0000000000b8', '00000000-0000-4000-8000-000000000108', 'reel', 'approved', true);
select pg_temp.ok(not exists (select 1 from public.kr8_rings_ledger where ref_id = '00000000-0000-4000-8000-000000000108'), '3j a hidden Reel does not count');
update public.kr8_posts set hidden = false where id = '00000000-0000-4000-8000-0000000000b8';
select pg_temp.ok(exists (select 1 from public.kr8_rings_ledger where ref_id = '00000000-0000-4000-8000-000000000108' and reason = 'invite'), '3k un-hidden → counts');
-- daily cap and kill switch
update public.kr8_rings_config set value = 2 where key = 'invite_day_cap';
insert into public.kr8_members (user_id, member_no, first_name, ref_code) values ('00000000-0000-4000-8000-000000000109', 109, 'Cap', 'k00100');
insert into public.kr8_posts (author, kind, status) values ('00000000-0000-4000-8000-000000000109', 'reel', 'approved');
select pg_temp.ok(not exists (select 1 from public.kr8_rings_ledger where ref_id = '00000000-0000-4000-8000-000000000109'), '3l daily cap (2 today already) stops the 3rd');
update public.kr8_rings_config set value = 20 where key = 'invite_day_cap';
update public.kr8_rings_config set value = 0 where key = 'invite';
insert into public.kr8_members (user_id, member_no, first_name, ref_code) values ('00000000-0000-4000-8000-000000000110', 110, 'Off', 'k00100');
insert into public.kr8_posts (author, kind, status) values ('00000000-0000-4000-8000-000000000110', 'reel', 'approved');
select pg_temp.ok(not exists (select 1 from public.kr8_rings_ledger where ref_id = '00000000-0000-4000-8000-000000000110'), '3m kill switch invite = 0');
update public.kr8_rings_config set value = 10 where key = 'invite';
-- a ref code set AFTER the Reel was approved still counts (members trigger)
update public.kr8_members set ref_code = 'k00100' where user_id = '00000000-0000-4000-8000-000000000110' and false;
insert into public.kr8_members (user_id, member_no, first_name) values ('00000000-0000-4000-8000-000000000111', 111, 'Late');
insert into public.kr8_posts (author, kind, status) values ('00000000-0000-4000-8000-000000000111', 'reel', 'approved');
update public.kr8_members set ref_code = 'k00100' where user_id = '00000000-0000-4000-8000-000000000111';
select pg_temp.ok(exists (select 1 from public.kr8_rings_ledger where ref_id = '00000000-0000-4000-8000-000000000111' and reason = 'invite'), '3n ref code set after the approved Reel → counts');
-- an invite credited under 0109 (friend verified, no Reel) keeps counting on the board
insert into public.kr8_members (user_id, member_no, first_name, ref_code, verified) values ('00000000-0000-4000-8000-000000000112', 112, 'Old', 'k00100', true);
select pg_temp.ok(public.kr8_invite_pair_ok('00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000112'), '3o a 0109 credit (verified friend) still counts');
select pg_temp.ok(public.kr8_invite_try('00000000-0000-4000-8000-000000000112') = 0, '3p … but verified with no Reel earns no NEW credit');
rollback;
