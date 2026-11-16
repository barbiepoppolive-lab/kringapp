-- 0059 push: run on a SCRATCH database after the stub below + 0059. Every line prints PASS/FAIL.
-- Stub (scratch only, never on the live project):
--   roles anon/authenticated/service_role; schemas auth, vault, net; auth.users(id, email); auth.uid() = current_setting('t.uid');
--   vault.decrypted_secrets(name, decrypted_secret); net.http_post(...) logs into net.calls; kr8_members(user_id, first_name, member_no);
--   kr8_verifications(id, user_id, status); kr8_reward_claims(id, member_id, status); kr8_posts(id, author, kind, status, hidden);
--   kr8_is_admin() = current_setting('t.admin') = '1'.
\set QUIET on
create or replace function pg_temp.ok(c boolean, n text) returns text language sql as $$ select (case when c then 'PASS ' else 'FAIL ' end) || n $$;
\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'
\set K 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'
select set_config('t.admin', '0', false);

-- member A subscribes (FCM endpoint)
select set_config('t.uid', :'A', false);
select pg_temp.ok((kr8_push_subscribe('https://fcm.googleapis.com/fcm/send/abc:def', :'K', 'tBHItJI5svbpez7KI4CCXg', 'Mozilla/5.0 Android')->>'ok')::boolean, 'member subscribes');
select pg_temp.ok((select count(*) from kr8_push_subs where user_id = :'A') = 1, 'row stored for A');
select pg_temp.ok((kr8_push_subscribe('https://fcm.googleapis.com/fcm/send/abc:def', :'K', 'tBHItJI5svbpez7KI4CCXg')->>'ok')::boolean
  and (select count(*) from kr8_push_subs) = 1, 'same phone again → same row (no duplicate)');
do $$ begin perform kr8_push_subscribe('https://evil.example/collect', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg'); raise notice 'FAIL any host accepted';
  exception when others then raise notice 'PASS non-push-service host refused (%)', sqlerrm; end $$;
do $$ begin perform kr8_push_subscribe('http://fcm.googleapis.com/x', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg'); raise notice 'FAIL http accepted';
  exception when others then raise notice 'PASS plain http refused (%)', sqlerrm; end $$;
do $$ begin perform kr8_push_subscribe('https://fcm.googleapis.com/fcm/send/x', 'short', 'tBHItJI5svbpez7KI4CCXg'); raise notice 'FAIL bad key accepted';
  exception when others then raise notice 'PASS bad p256dh refused (%)', sqlerrm; end $$;
select pg_temp.ok((kr8_push_subscribe('https://web.push.apple.com/QGx-iPhone', :'K', 'tBHItJI5svbpez7KI4CCXg')->>'ok')::boolean, 'iPhone (Apple) endpoint accepted');
-- signed out
select set_config('t.uid', '', false);
do $$ begin perform kr8_push_subscribe('https://fcm.googleapis.com/fcm/send/zz', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg'); raise notice 'FAIL signed-out subscribe';
  exception when others then raise notice 'PASS signed-out subscribe refused'; end $$;
-- B cannot remove A's phone
select set_config('t.uid', :'B', false);
select pg_temp.ok(not kr8_push_unsubscribe('https://web.push.apple.com/QGx-iPhone') and (select count(*) from kr8_push_subs where user_id = :'A') = 2, 'another member cannot remove A''s phone');
-- members cannot write the table directly
set role authenticated;
do $$ begin insert into kr8_push_subs (user_id, endpoint, p256dh, auth) values ('22222222-2222-2222-2222-222222222222', 'https://fcm.googleapis.com/x', 'a', 'b'); raise notice 'FAIL direct insert';
  exception when others then raise notice 'PASS direct insert refused'; end $$;
select pg_temp.ok((select count(*) from kr8_push_subs) = 0, 'B reads none of A''s rows (RLS)');
do $$ begin perform kr8_push_claim(10); raise notice 'FAIL member can claim'; exception when others then raise notice 'PASS claim is service-role only'; end $$;
do $$ begin perform kr8_push_queue('admin', null, true, 't', 'b', null, null); raise notice 'FAIL member can queue'; exception when others then raise notice 'PASS queue is internal'; end $$;
reset role;
select set_config('t.uid', :'A', false);
set role authenticated;
select pg_temp.ok((select count(*) from kr8_push_subs) = 2, 'A reads own rows');
reset role;

-- automatic: face check approved → 1 msg, 2 outbox rows (A has 2 phones), 1 poke
delete from net.calls;
insert into kr8_verifications (id, user_id, status) values ('aaaaaaaa-0000-0000-0000-000000000001', :'A', 'pending');
update kr8_verifications set status = 'approved' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.ok((select count(*) from kr8_push_msgs where kind = 'verified' and to_user = :'A' and url = '/app/?tab=me') = 1, 'verified → ding queued');
select pg_temp.ok((select count(*) from kr8_push_outbox o join kr8_push_msgs m on m.id = o.msg_id where m.kind = 'verified') = 2, 'one row per phone');
select pg_temp.ok((select count(*) from net.calls where url = 'https://kringapp.com/api/push' and headers->>'x-push-secret' = 'test-secret') = 1, 'endpoint poked with the vault secret');
update kr8_verifications set status = 'approved' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.ok((select count(*) from kr8_push_msgs where kind = 'verified') = 1, 'no second ding for the same approval');
-- reward: assigned at once → no ding; pending → assigned → ding
insert into kr8_reward_claims (id, member_id, status) values ('bbbbbbbb-0000-0000-0000-000000000001', :'A', 'assigned'), ('bbbbbbbb-0000-0000-0000-000000000002', :'A', 'pending');
update kr8_reward_claims set status = 'assigned' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.ok((select count(*) from kr8_push_msgs where kind = 'reward') = 1 and (select ref_id from kr8_push_msgs where kind = 'reward') = 'bbbbbbbb-0000-0000-0000-000000000002', 'held reward gets its code → ding (instant claim: none)');
-- reel approved by the team → ding with deep link; hidden → none
insert into kr8_posts (id, author, kind, status) values ('cccccccc-0000-0000-0000-000000000001', :'A', 'reel', 'pending'), ('cccccccc-0000-0000-0000-000000000002', :'A', 'reel', 'pending');
update kr8_posts set status = 'approved' where id = 'cccccccc-0000-0000-0000-000000000001';
update kr8_posts set status = 'hidden', hidden = true where id = 'cccccccc-0000-0000-0000-000000000002';
select pg_temp.ok((select url from kr8_push_msgs where kind = 'reel') = '/app/?reel=cccccccc-0000-0000-0000-000000000001' and (select count(*) from kr8_push_msgs where kind = 'reel') = 1, 'reel approved → ding with its link; hidden → none');
-- a member with no phone: queued msg, 0 rows, no poke
delete from net.calls;
insert into kr8_verifications (id, user_id, status) values ('aaaaaaaa-0000-0000-0000-000000000002', :'B', 'pending');
update kr8_verifications set status = 'approved' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select pg_temp.ok((select phones from kr8_push_msgs where ref_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 0 and (select count(*) from net.calls) = 0, 'member without dings: nothing sent, no poke');
-- the review never breaks: break the queue and approve again
alter table kr8_push_msgs rename to kr8_push_msgs_x;
insert into kr8_verifications (id, user_id, status) values ('aaaaaaaa-0000-0000-0000-000000000003', :'B', 'pending');
update kr8_verifications set status = 'approved' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
select pg_temp.ok((select status from kr8_verifications where id = 'aaaaaaaa-0000-0000-0000-000000000003') = 'approved', 'push failure never blocks an approval');
alter table kr8_push_msgs_x rename to kr8_push_msgs;

-- admin send
select set_config('t.uid', :'B', false);
do $$ begin perform kr8_admin_push_send(16, false, 'x', 'y', null); raise notice 'FAIL non-admin send'; exception when others then raise notice 'PASS admin only (%)', sqlerrm; end $$;
select set_config('t.admin', '1', false);
select pg_temp.ok((kr8_admin_push_send(16, false, 'สวัสดี · Hello', 'ทดสอบ\nTest', '/app/?tab=me')->>'phones')::int = 2, 'admin → member #16 (A): 2 phones');
select pg_temp.ok((kr8_admin_push_send(null, true, 'All', 'Everyone', null)->>'phones')::int = 2, 'admin → all: every phone');
do $$ begin perform kr8_admin_push_send(16, true, 'x', 'y', null); raise notice 'FAIL both targets'; exception when others then raise notice 'PASS member no + all refused (%)', sqlerrm; end $$;
do $$ begin perform kr8_admin_push_send(99999, false, 'x', 'y', null); raise notice 'FAIL unknown member'; exception when others then raise notice 'PASS unknown member no (%)', sqlerrm; end $$;
do $$ begin perform kr8_admin_push_send(16, false, 'x', 'y', 'https://evil.example'); raise notice 'FAIL outside link'; exception when others then raise notice 'PASS link must be inside the app (%)', sqlerrm; end $$;
do $$ begin perform kr8_admin_push_send(16, false, '', 'y', null); raise notice 'FAIL empty title'; exception when others then raise notice 'PASS empty title refused (%)', sqlerrm; end $$;
select pg_temp.ok((kr8_admin_push_stats()->>'phones')::int = 2 and jsonb_array_length(kr8_admin_push_stats()->'recent') >= 4, 'admin stats');

-- sender: claim → done
select count(*) as queued_n from kr8_push_outbox where state = 'queued' \gset
set role service_role;
select pg_temp.ok(jsonb_array_length(kr8_push_claim(3)) = 3, 'claim takes a batch of 3');
select pg_temp.ok(jsonb_array_length(kr8_push_claim(50)) = :queued_n - 3, 'claimed rows are not handed out twice');
reset role;
delete from net.calls;
-- one sent, one gone (410), one retry, one permanent failure
with c as (select id, sub_id, row_number() over (order by id) n from kr8_push_outbox where state = 'queued' order by id limit 4)
select kr8_push_done(jsonb_agg(jsonb_build_object('id', id, 'result', (array['sent', 'retry', 'failed', 'sent'])[n], 'http', (array[201, 503, 400, 201])[n]))) from c \g /dev/null
select pg_temp.ok((select count(*) from kr8_push_outbox where state = 'sent') = 2 and (select count(*) from kr8_push_outbox where state = 'failed') = 1, 'sent / failed recorded');
select pg_temp.ok((select count(*) from kr8_push_outbox where state = 'queued' and http = 503) = 1, 'retry stays queued');
select pg_temp.ok((select count(*) from kr8_push_subs where last_ok_at is not null) >= 1, 'last_ok_at set on a sent push');
select id as gone_sub from kr8_push_subs where endpoint like 'https://web.push.apple.com/%' \gset
select kr8_push_done(jsonb_build_array(jsonb_build_object('id', (select id from kr8_push_outbox where state = 'queued' and sub_id = :gone_sub order by id limit 1), 'result', 'gone', 'http', 410))) \g /dev/null
select pg_temp.ok(not exists (select 1 from kr8_push_subs where id = :gone_sub), '410 → expired subscription deleted');
select pg_temp.ok((select count(*) from kr8_push_outbox where state = 'queued' and sub_id is null) >= 0, 'rows for a deleted phone lose their sub');
set role service_role;
select kr8_push_claim(50) \g /dev/null
reset role;
select pg_temp.ok((select count(*) from kr8_push_outbox where state = 'queued' and sub_id is null) = 0, 'claim closes rows whose phone is gone');
-- unsubscribe by the owner
select set_config('t.uid', :'A', false);
select kr8_push_unsubscribe('https://fcm.googleapis.com/fcm/send/abc:def') as unsub \gset
select pg_temp.ok(:'unsub'::boolean and (select count(*) from kr8_push_subs) = 0, 'member turns dings off → row deleted');
