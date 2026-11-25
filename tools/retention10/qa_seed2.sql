-- Retention 10 round 2 QA data (test accounts only): 2 Ask BKK answers yesterday afternoon + votes, then the test awards run for yesterday.
begin;
create temp table _q on commit drop as select split_part(split_part(email, '@', 1), '-', 3) k, id from auth.users where email like 'qa-r10-%@example.com';
create temp table _p on commit drop as select p.id from public.kr8_posts p where p.kind = 'ask' and public.kr8_is_team(p.author) and public.kr8_ask_q_ok(null, p.id) order by p.created_at desc limit 1;
insert into public.kr8_ask_answers (id, post_id, parent_id, author, body, created_at)
values ('7a10b000-0000-4000-8000-000000000001', (select id from _p), null, (select id from _q where k = 'fah'),
        'Go to the rooftop at Ari station around 5:30, it is free and the sky turns pink over the trees', ((public.kr8_bkk_day() - 1)::timestamp + interval '15 hours') at time zone 'Asia/Bangkok'),
       ('7a10b000-0000-4000-8000-000000000002', (select id from _p), null, (select id from _q where k = 'ploy'),
        'Honestly my cat picks for me, wherever she sleeps on the map is where we go that weekend 😂', ((public.kr8_bkk_day() - 1)::timestamp + interval '16 hours') at time zone 'Asia/Bangkok')
on conflict (id) do nothing;
insert into public.kr8_ask_reactions (answer_id, user_id, emoji, created_at) values
 ('7a10b000-0000-4000-8000-000000000001', (select id from _q where k = 'mint'), '❤️', ((public.kr8_bkk_day() - 1)::timestamp + interval '17 hours') at time zone 'Asia/Bangkok'),
 ('7a10b000-0000-4000-8000-000000000001', (select id from _q where k = 'bee'), '💯', ((public.kr8_bkk_day() - 1)::timestamp + interval '17 hours') at time zone 'Asia/Bangkok'),
 ('7a10b000-0000-4000-8000-000000000002', (select id from _q where k = 'bee'), '😂', ((public.kr8_bkk_day() - 1)::timestamp + interval '18 hours') at time zone 'Asia/Bangkok'),
 ('7a10b000-0000-4000-8000-000000000002', (select id from _q where k = 'fah'), '😂', ((public.kr8_bkk_day() - 1)::timestamp + interval '18 hours') at time zone 'Asia/Bangkok')
on conflict do nothing;
select public.kr8_ask_awards_run(true, public.kr8_bkk_day() - 1) r;
commit;
