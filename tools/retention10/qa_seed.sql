-- Retention 10 QA seed (test accounts only: emails qa-r10-*@example.com → kr8_is_test_member = true; never on the real board).
-- Ploy (viewer, joined 1 day ago) · Mint (3 days, Reel 10 h ago, opening question, bestie with Ploy) · Fah (2 days, Reel 5 h ago +
-- a 5pm clip) · Bee (joined 20 days ago, Reel 3 days ago, a 5pm clip). Undo: qa_unseed.sql.
begin;
alter table public.kr8_members disable trigger kr8_notify_founder_member;   -- no "new member" ping to the founder for QA accounts
with u as (select id, split_part(split_part(email, '@', 1), '-', 3) k from auth.users where email like 'qa-r10-%@example.com'),
src as (select member_no, photo from public.kr8_members where member_no in (1, 2, 8, 9))
insert into public.kr8_members (user_id, first_name, photo, langs, bio, area, who, age_ok_at, verified, created_at, updated_at, terms_accepted_at, terms_version, ghost)
select u.id,
       case u.k when 'ploy' then 'Ploy' when 'mint' then 'Mint' when 'fah' then 'Fah' else 'Bee' end,
       (select photo from src where member_no = case u.k when 'ploy' then 1 when 'mint' then 2 when 'fah' then 9 else 8 end),
       array['TH', 'EN'], '',
       case u.k when 'ploy' then 'Ari' when 'mint' then 'Ari' when 'fah' then 'Ratchada' else 'Silom' end, 'local', now(), true,
       now() - case u.k when 'ploy' then interval '1 day' when 'mint' then interval '3 days' when 'fah' then interval '2 days' else interval '20 days' end,
       now(), now(), (select terms_version from public.kr8_members where terms_version is not null order by terms_accepted_at desc nulls last limit 1), false
  from u
on conflict (user_id) do nothing;
alter table public.kr8_members enable trigger kr8_notify_founder_member;

-- Reels (demo files of the old demo accounts)
create temp table _q on commit drop as select split_part(split_part(email, '@', 1), '-', 3) k, id from auth.users where email like 'qa-r10-%@example.com';
alter table public.kr8_posts disable trigger kr8_rings_post_trg;   -- no founding seat / place Rings for QA posts
alter table public.kr8_posts disable trigger kr8_invite_reel_trg;
insert into public.kr8_posts (id, author, kind, area, body, video_path, poster_path, duration_ms, width, height, status, reviewed_at, created_at, hidden, feed_off, feed_off_reason, feed_off_at)
values
 ('7a10a000-0000-4000-8000-000000000001', (select id from _q where k = 'mint'), 'reel', 'Ari', 'Quiet café morning in Ari',
  '11111111-1111-4111-8111-000000000002/3670e009-c72f-5795-8481-930752ccf1de.mp4', '11111111-1111-4111-8111-000000000002/6845c4d5-cb04-4d17-b581-e0ec7b907c63.jpg', 12000, 720, 1280,
  'approved', now() - interval '9 hours', now() - interval '10 hours', false, false, null, null),
 ('7a10a000-0000-4000-8000-000000000002', (select id from _q where k = 'fah'), 'reel', 'Bangkok', 'Night market lights',
  '11111111-1111-4111-8111-000000000009/239b48bf-b829-5f11-960d-8c6c83504367.mp4', '11111111-1111-4111-8111-000000000009/239b48bf-b829-5f11-960d-8c6c83504367.jpg', 12000, 720, 1280,
  'approved', now() - interval '4 hours', now() - interval '5 hours', false, false, null, null),
 ('7a10a000-0000-4000-8000-000000000003', (select id from _q where k = 'fah'), 'reel', 'Bangkok', '5pm by the canal',
  '11111111-1111-4111-8111-000000000004/f6338575-7b5b-537c-825f-af4129a82bbb.mp4', '11111111-1111-4111-8111-000000000004/a3c0fa6f-23c8-4b1d-a15b-3b4ff33e4a38.jpg', 10000, 720, 1280,
  'approved', now() - interval '50 minutes', now() - interval '1 hour', false, true, 'q:noperson', now()),
 ('7a10a000-0000-4000-8000-000000000004', (select id from _q where k = 'bee'), 'reel', 'Silom', 'Rooftop sunset in Silom',
  '11111111-1111-4111-8111-000000000007/5e2ce0d6-8bbb-5838-8740-5535ea8d87a3.mp4', '11111111-1111-4111-8111-000000000007/6c75fc1e-fd3b-4dc2-9f63-004cdb0da870.jpg', 14000, 720, 1280,
  'approved', now() - interval '3 days' + interval '1 hour', now() - interval '3 days' + interval '1 hour', false, false, null, null),
 ('7a10a000-0000-4000-8000-000000000005', (select id from _q where k = 'ploy'), 'reel', 'Siam', 'Siam Square at night',
  '11111111-1111-4111-8111-000000000008/15895572-7901-5bf9-a17a-f02553e2d387.mp4', '11111111-1111-4111-8111-000000000008/a288a84c-9ce6-4ca1-bae4-3113ffca40eb.jpg', 11000, 720, 1280,
  'approved', now() - interval '19 hours', now() - interval '20 hours', false, true, 'q:noperson', now() - interval '19 hours'),
 ('7a10a000-0000-4000-8000-000000000006', (select id from _q where k = 'bee'), 'reel', 'Silom', '5pm on Silom road',
  '11111111-1111-4111-8111-000000000003/ea76a274-21c4-5410-8d11-3c45f44b2228.mp4', '11111111-1111-4111-8111-000000000003/ea76a274-21c4-5410-8d11-3c45f44b2228.jpg', 10000, 720, 1280,
  'approved', now() - interval '40 minutes', now() - interval '45 minutes', false, false, null, null)
on conflict (id) do nothing;
alter table public.kr8_posts enable trigger kr8_rings_post_trg;
alter table public.kr8_posts enable trigger kr8_invite_reel_trg;
insert into public.kr8_post_places (post_id, place_id, position)
values ('7a10a000-0000-4000-8000-000000000001', 'b4b23bef-36b0-4011-b73b-64d68e1fdd02', 1),
       ('7a10a000-0000-4000-8000-000000000002', '2063b81f-400f-4082-964b-a1d87154e4c5', 1),
       ('7a10a000-0000-4000-8000-000000000003', '58017490-f0c7-4850-83c6-3c1c715d5fe9', 1),
       ('7a10a000-0000-4000-8000-000000000004', 'fce6c1dc-5480-47ed-905b-1f9c8c248829', 1),
       ('7a10a000-0000-4000-8000-000000000005', 'fce6c1dc-5480-47ed-905b-1f9c8c248829', 1),
       ('7a10a000-0000-4000-8000-000000000006', 'fce6c1dc-5480-47ed-905b-1f9c8c248829', 1)
on conflict do nothing;
insert into public.kr8_b5_clips (post_id, author, day) values
 ('7a10a000-0000-4000-8000-000000000003', (select id from _q where k = 'fah'), public.kr8_bkk_day()),
 ('7a10a000-0000-4000-8000-000000000006', (select id from _q where k = 'bee'), public.kr8_bkk_day())
on conflict do nothing;
-- likes: Bee's Reel liked by the three newcomers; Mint's Reel by Bee; Ploy's by Bee
insert into public.kr8_post_likes (post_id, user_id, created_at) values
 ('7a10a000-0000-4000-8000-000000000004', (select id from _q where k = 'ploy'), now() - interval '20 hours'),
 ('7a10a000-0000-4000-8000-000000000004', (select id from _q where k = 'mint'), now() - interval '2 days'),
 ('7a10a000-0000-4000-8000-000000000004', (select id from _q where k = 'fah'), now() - interval '1 day'),
 ('7a10a000-0000-4000-8000-000000000001', (select id from _q where k = 'bee'), now() - interval '8 hours'),
 ('7a10a000-0000-4000-8000-000000000005', (select id from _q where k = 'bee'), now() - interval '18 hours')
on conflict do nothing;
update public.kr8_posts p set likes_count = (select count(*) from public.kr8_post_likes l where l.post_id = p.id) where p.id::text like '7a10a000-%';
-- follows: Ploy ↔ Mint (bestie), Bee → Ploy
insert into public.kr8_follows (follower, followee) values
 ((select id from _q where k = 'ploy'), (select id from _q where k = 'mint')), ((select id from _q where k = 'mint'), (select id from _q where k = 'ploy')),
 ((select id from _q where k = 'bee'), (select id from _q where k = 'ploy'))
on conflict do nothing;
-- tasks claimed (test ledger): Ploy and Mint both on the last 2 days; Mint today
insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id, created_at) values
 ((select id from _q where k = 'ploy'), 3, 'task', (public.kr8_bkk_day() - 1)::text || ':ask', now() - interval '20 hours'),
 ((select id from _q where k = 'mint'), 3, 'task', (public.kr8_bkk_day() - 1)::text || ':ask', now() - interval '21 hours'),
 ((select id from _q where k = 'mint'), 1, 'task', (public.kr8_bkk_day() - 2)::text || ':vote', now() - interval '40 hours'),
 ((select id from _q where k = 'ploy'), 1, 'task', (public.kr8_bkk_day() - 2)::text || ':vote', now() - interval '23 hours'),
 ((select id from _q where k = 'mint'), 1, 'task', public.kr8_bkk_day()::text || ':vote', now() - interval '30 minutes'),
 ((select id from _q where k = 'fah'), 1, 'task', public.kr8_bkk_day()::text || ':vote', now() - interval '40 minutes'),
 ((select id from _q where k = 'bee'), 3, 'task', (public.kr8_bkk_day() - 1)::text || ':ask', now() - interval '22 hours')
on conflict do nothing;
insert into public.kr8_besties (a, b, inviter, status, started_on)
select least(p.id, m.id), greatest(p.id, m.id), m.id, 'active', public.kr8_bkk_day() - 2 from _q p, _q m where p.k = 'ploy' and m.k = 'mint'
  and not exists (select 1 from public.kr8_besties x where x.a = least(p.id, m.id) and x.b = greatest(p.id, m.id) and x.status in ('pending', 'active'));
insert into public.kr8_bestie_nudges (bestie_id, sender, day)
select s.id, (select id from _q where k = 'mint'), public.kr8_bkk_day() from public.kr8_besties s
 where s.status = 'active' and (select id from _q where k = 'mint') in (s.a, s.b) on conflict do nothing;
update public.kr8_members set open_q = 'Best rooftop for sunset that isn’t crazy expensive?', open_q_on = true where user_id = (select id from _q where k = 'mint');
select public.kr8_week_board_refresh();
select json_build_object('members', (select count(*) from public.kr8_members m join _q on _q.id = m.user_id),
  'test', (select bool_and(public.kr8_is_test_member(id)) from _q), 'posts', (select count(*) from public.kr8_posts where id::text like '7a10a000-%')) r;
commit;
