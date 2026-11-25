-- Retention 10 QA clean-up: removes the four qa-r10-*@example.com test accounts and everything they made.
begin;
create temp table _q on commit drop as select id from auth.users where email like 'qa-r10-%@example.com';
delete from public.kr8_besties where a in (select id from _q) or b in (select id from _q);
delete from public.kr8_b5_clips where author in (select id from _q);
delete from public.kr8_task_welcome_picks where member_id in (select id from _q);
delete from public.kr8_post_likes where user_id in (select id from _q) or post_id in (select id from public.kr8_posts where author in (select id from _q));
delete from public.kr8_post_places where post_id in (select id from public.kr8_posts where author in (select id from _q));
delete from public.kr8_follows where follower in (select id from _q) or followee in (select id from _q);
delete from public.kr8_messages where thread_id in (select id from public.kr8_threads where user_a in (select id from _q) or user_b in (select id from _q));
delete from public.kr8_threads where user_a in (select id from _q) or user_b in (select id from _q);
delete from public.kr8_posts where author in (select id from _q);
delete from public.kr8_member_badges where user_id in (select id from _q);
delete from public.kr8_members where user_id in (select id from _q);
delete from public.kr8_rings_ledger where member_id in (select id from _q);
delete from auth.users where id in (select id from _q);
select public.kr8_week_board_refresh();
commit;
