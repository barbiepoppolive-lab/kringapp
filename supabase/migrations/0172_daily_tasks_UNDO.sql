-- UNDO 0171 daily tasks. Task Rings already paid stay in the ledger (append-only); the restored reason check is NOT VALID so old rows are kept.
-- Turning tasks off without undoing: update kr8_rings_config set value = 0 where key = 'tasks_on';

create or replace function public.kr8_week_board(p_w0 timestamp with time zone, p_test boolean)
 RETURNS TABLE(member_id uuid, rings integer, rk integer, first_at timestamp with time zone, reels jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  with s as (select * from public.kr8_reel_scores_adj(p_w0, p_w0 + interval '7 days', p_w0 + interval '7 days', p_test)),
  r as (select s.*, row_number() over (partition by s.author order by s.score desc, s.posted_at asc, s.post_id) n from s),
  m as (select r.author, sum(r.score)::int rings, min(r.posted_at) filter (where r.n = 1) first_at, jsonb_agg(r.post_id order by r.n) reels
        from r where r.n <= greatest(public.kr8_rcfg('best_reels', 2), 1) and (r.n = 1 or r.score > 0) group by r.author),
  t as (select m.author, m.rings + case when p_test then 0 else public.kr8_invite_rings(m.author, p_w0, p_w0 + interval '7 days') end rings,
               m.first_at, m.reels from m)
  select t.author, t.rings, (row_number() over (order by t.rings desc, t.first_at asc, mm.member_no asc))::int, t.first_at, t.reels
  from t join public.kr8_members mm on mm.user_id = t.author
  where not public.kr8_minor_held(t.author)
    and not exists (select 1 from public.kr8_prize_bans b where b.user_id = t.author and b.scope = 'all')
$function$;

create or replace function public.kr8_member_rings(p_user uuid)
 RETURNS TABLE(lifetime integer, week integer, week_rank integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  with t as (select public.kr8_is_test_member(p_user) v)
  select coalesce((select sum(s.score)::int from t, public.kr8_reel_scores('-infinity', 'infinity', 'infinity', t.v, p_user) s), 0)
           + public.kr8_invite_rings(p_user, '-infinity', 'infinity'),
         coalesce((select b.rings from t, public.kr8_week_board(public.kr8_week_start(now()), t.v) b where b.member_id = p_user), 0),
         (select b.rk from t, public.kr8_week_board(public.kr8_week_start(now()), t.v) b where b.member_id = p_user)
$function$;

drop function if exists public.kr8_task_claim(text);
drop function if exists public.kr8_task_watch(uuid, text);
drop function if exists public.kr8_task_vote(text);
drop function if exists public.kr8_tasks_today();
drop function if exists public.kr8_task_rings_in(uuid, timestamptz, timestamptz);
drop function if exists public.kr8_task_rings(text);
drop function if exists public.kr8_task_done(uuid, date, text);
drop function if exists public.kr8_task_watch_n(uuid, date);
drop function if exists public.kr8_task_ask_done(uuid, date);
drop function if exists public.kr8_task_ask_pick(uuid);
drop table if exists public.kr8_task_watch;
drop table if exists public.kr8_task_vote_picks;
drop table if exists public.kr8_task_votes;
drop table if exists public.kr8_task_days;
drop function if exists public.kr8_bkk_day(timestamptz);

alter table public.kr8_rings_ledger drop constraint kr8_rings_ledger_reason_check;
alter table public.kr8_rings_ledger add constraint kr8_rings_ledger_reason_check check (reason = any (array[
  'reel_place','likes_50','friend_join','friend_welcome','checkin','streak','react3','weekly_top','reel_removed','claim','invite','invite_welcome'])) not valid;

delete from public.kr8_rings_config where key in ('tasks_on','task_ask','task_vote','task_watch','task_open','task_ask_min_chars','task_watch_goal');
