-- 0094_kr8_board_show_all.sql  (17 Nov 2026)
-- Weekly board shows EVERY member with an approved, visible Reel this week, 0-Ring ones included,
-- ranked after everyone with Rings (same tie rule: earlier post first, then member no).
-- Same filters as before: kr8_reel_scores (approved, not hidden, not board_off/AI, Bangkok place, real members only,
-- no test/team). Prizes unchanged: kr8_close_week pays only kr8_prize_for(rank) > 0 AND rings >= min_rings_for_paid_seat (25),
-- and 0-Ring rows rank below every member with Rings, so they can't push a Ring-holder out of a prize rank.
-- kr8_weekly_ranking: rows list every board member (was capped at board_size 10). Prize ladder still board_size.
-- Re-runnable (create or replace, same signatures, grants kept).
-- UNDO: run the two original definitions in the comment block at the bottom.

CREATE OR REPLACE FUNCTION public.kr8_week_board(p_w0 timestamp with time zone, p_test boolean)
 RETURNS TABLE(member_id uuid, rings integer, rk integer, first_at timestamp with time zone, reels jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with s as (select * from public.kr8_reel_scores(p_w0, p_w0 + interval '7 days', p_w0 + interval '7 days', p_test)),
  r as (select s.*, row_number() over (partition by s.author order by s.score desc, s.posted_at asc, s.post_id) n from s),
  -- 0094: a member whose best Reel has 0 Rings still shows (their best = earliest Reel this week); a 0-Ring Reel never fills a 2nd/3rd best slot
  m as (select r.author, sum(r.score)::int rings, min(r.posted_at) filter (where r.n = 1) first_at, jsonb_agg(r.post_id order by r.n) reels
        from r where r.n <= greatest(public.kr8_rcfg('best_reels', 2), 1) and (r.n = 1 or r.score > 0) group by r.author)
  select m.author, m.rings, (row_number() over (order by m.rings desc, m.first_at asc, mm.member_no asc))::int, m.first_at, m.reels
  from m join public.kr8_members mm on mm.user_id = m.author
$function$;

CREATE OR REPLACE FUNCTION public.kr8_weekly_ranking(p_scope text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); w0 timestamptz := public.kr8_week_start(now()); r jsonb; t boolean; top int := greatest(public.kr8_rcfg('board_size', 10), 3);
        paid int := public.kr8_paid_ranks(); flr int := public.kr8_rcfg('min_rings_for_paid_seat', 25); posters int; minp int := public.kr8_rcfg('min_posters_for_payout', 0);
begin
  if p_scope not in ('all', 'area', 'friends') then raise exception 'KR8_BAD_SCOPE'; end if;
  if p_scope <> 'all' and uid is null then raise exception 'KR8_SIGN_IN'; end if;
  t := uid is not null and public.kr8_is_test_member(uid);
  posters := public.kr8_week_posters(w0, t);
  with allb as materialized (select * from public.kr8_week_board(w0, t)),
       my as (select area from public.kr8_members where user_id = uid),
       line as (select rings from allb where rk = paid),
       cur as (select b.*, m.first_name, m.photo, m.area, m.created_at as joined
               from allb b join public.kr8_members m on m.user_id = b.member_id
               where (p_scope = 'all'
                      or (p_scope = 'area' and m.area = (select area from my))
                      or (p_scope = 'friends' and (b.member_id = uid or exists (select 1 from public.kr8_follows f where f.follower = uid and f.followee = b.member_id))))
                 and (uid is null or b.member_id = uid or not public.kr8_is_blocked(uid, b.member_id))),
       rws as (select c.*, (row_number() over (order by c.rk))::int as srk from cur c),
       prev as (select member_id, rank from public.kr8_week_results where week = ((w0 - interval '7 days') at time zone 'Asia/Bangkok')::date and is_test = t)
  select jsonb_build_object(
    'week_start', w0, 'ends_at', w0 + interval '7 days', 'scope', p_scope,
    'area', (select area from my),
    'total', (select count(*) from rws),
    'paid_ranks', paid, 'floor', flr, 'posters', posters, 'min_posters', minp, 'payout_on', posters >= minp,
    'open_seats', greatest(0, paid - (select count(*)::int from allb)),
    'prizes', (select jsonb_agg(public.kr8_prize_for(g) order by g) from generate_series(1, top) g),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', x.srk, 'all_rank', x.rk, 'rings', x.rings, 'prize', public.kr8_prize_for(x.rk),
                       'paid', (x.rk <= paid and x.rings >= flr and public.kr8_prize_for(x.rk) > 0),
                       'needs', case when x.rk <= paid and x.rings < flr then flr end,
                       'to_line', case when x.rk > paid then greatest(1, coalesce((select rings from line), 0) - x.rings + 1, flr - x.rings) end,
                       'is_new', x.joined >= w0,
                       'user_id', x.member_id, 'first_name', x.first_name, 'photo', case when uid is null then null else x.photo end,
                       'area', x.area, 'move', (select p.rank - x.rk from prev p where p.member_id = x.member_id), 'is_me', x.member_id = uid) order by x.srk)
                      from rws x), '[]'::jsonb),   -- 0094: every member on the board, not only the top 10
    'me', (select jsonb_build_object('rank', x.srk, 'all_rank', x.rk, 'rings', x.rings, 'prize', public.kr8_prize_for(x.rk),
                                     'move', (select p.rank - x.rk from prev p where p.member_id = x.member_id)) from rws x where x.member_id = uid),
    'gap', public.kr8_rank_gap(w0, t, uid),
    'mine', case when uid is null then null else (select jsonb_build_object(
              'pending', count(*) filter (where p.status = 'pending'),
              'live', count(*) filter (where p.status = 'approved' and exists (select 1 from public.kr8_post_places pp where pp.post_id = p.id)),
              'no_place', count(*) filter (where p.status = 'approved' and not exists (select 1 from public.kr8_post_places pp where pp.post_id = p.id)))
            from public.kr8_posts p where p.author = uid and p.kind = 'reel' and not p.hidden and p.created_at >= w0) end)
  into r;
  return r;
end $function$;


-- ===== UNDO (original definitions before 0094) =====
-- CREATE OR REPLACE FUNCTION public.kr8_week_board(p_w0 timestamp with time zone, p_test boolean)
--  RETURNS TABLE(member_id uuid, rings integer, rk integer, first_at timestamp with time zone, reels jsonb)
--  LANGUAGE sql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
--   with s as (select * from public.kr8_reel_scores(p_w0, p_w0 + interval '7 days', p_w0 + interval '7 days', p_test)),
--   r as (select s.*, row_number() over (partition by s.author order by s.score desc, s.posted_at asc, s.post_id) n from s where s.score > 0),
--   m as (select r.author, sum(r.score)::int rings, min(r.posted_at) filter (where r.n = 1) first_at, jsonb_agg(r.post_id order by r.n) reels
--         from r where r.n <= greatest(public.kr8_rcfg('best_reels', 2), 1) group by r.author)
--   select m.author, m.rings, (row_number() over (order by m.rings desc, m.first_at asc, mm.member_no asc))::int, m.first_at, m.reels
--   from m join public.kr8_members mm on mm.user_id = m.author
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.kr8_weekly_ranking(p_scope text DEFAULT 'all'::text)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- declare uid uuid := auth.uid(); w0 timestamptz := public.kr8_week_start(now()); r jsonb; t boolean; top int := greatest(public.kr8_rcfg('board_size', 10), 3);
--         paid int := public.kr8_paid_ranks(); flr int := public.kr8_rcfg('min_rings_for_paid_seat', 25); posters int; minp int := public.kr8_rcfg('min_posters_for_payout', 0);
-- begin
--   if p_scope not in ('all', 'area', 'friends') then raise exception 'KR8_BAD_SCOPE'; end if;
--   if p_scope <> 'all' and uid is null then raise exception 'KR8_SIGN_IN'; end if;
--   t := uid is not null and public.kr8_is_test_member(uid);
--   posters := public.kr8_week_posters(w0, t);
--   with allb as materialized (select * from public.kr8_week_board(w0, t)),
--        my as (select area from public.kr8_members where user_id = uid),
--        line as (select rings from allb where rk = paid),
--        cur as (select b.*, m.first_name, m.photo, m.area, m.created_at as joined
--                from allb b join public.kr8_members m on m.user_id = b.member_id
--                where (p_scope = 'all'
--                       or (p_scope = 'area' and m.area = (select area from my))
--                       or (p_scope = 'friends' and (b.member_id = uid or exists (select 1 from public.kr8_follows f where f.follower = uid and f.followee = b.member_id))))
--                  and (uid is null or b.member_id = uid or not public.kr8_is_blocked(uid, b.member_id))),
--        rws as (select c.*, (row_number() over (order by c.rk))::int as srk from cur c),
--        prev as (select member_id, rank from public.kr8_week_results where week = ((w0 - interval '7 days') at time zone 'Asia/Bangkok')::date and is_test = t)
--   select jsonb_build_object(
--     'week_start', w0, 'ends_at', w0 + interval '7 days', 'scope', p_scope,
--     'area', (select area from my),
--     'total', (select count(*) from rws),
--     'paid_ranks', paid, 'floor', flr, 'posters', posters, 'min_posters', minp, 'payout_on', posters >= minp,
--     'open_seats', greatest(0, paid - (select count(*)::int from allb)),
--     'prizes', (select jsonb_agg(public.kr8_prize_for(g) order by g) from generate_series(1, top) g),
--     'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', x.srk, 'all_rank', x.rk, 'rings', x.rings, 'prize', public.kr8_prize_for(x.rk),
--                        'paid', (x.rk <= paid and x.rings >= flr and public.kr8_prize_for(x.rk) > 0),
--                        'needs', case when x.rk <= paid and x.rings < flr then flr end,
--                        'to_line', case when x.rk > paid then greatest(1, coalesce((select rings from line), 0) - x.rings + 1, flr - x.rings) end,
--                        'is_new', x.joined >= w0,
--                        'user_id', x.member_id, 'first_name', x.first_name, 'photo', case when uid is null then null else x.photo end,
--                        'area', x.area, 'move', (select p.rank - x.rk from prev p where p.member_id = x.member_id), 'is_me', x.member_id = uid) order by x.srk)
--                       from rws x where x.srk <= top), '[]'::jsonb),
--     'me', (select jsonb_build_object('rank', x.srk, 'all_rank', x.rk, 'rings', x.rings, 'prize', public.kr8_prize_for(x.rk),
--                                      'move', (select p.rank - x.rk from prev p where p.member_id = x.member_id)) from rws x where x.member_id = uid),
--     'gap', public.kr8_rank_gap(w0, t, uid),
--     'mine', case when uid is null then null else (select jsonb_build_object(
--               'pending', count(*) filter (where p.status = 'pending'),
--               'live', count(*) filter (where p.status = 'approved' and exists (select 1 from public.kr8_post_places pp where pp.post_id = p.id)),
--               'no_place', count(*) filter (where p.status = 'approved' and not exists (select 1 from public.kr8_post_places pp where pp.post_id = p.id)))
--             from public.kr8_posts p where p.author = uid and p.kind = 'reel' and not p.hidden and p.created_at >= w0) end)
--   into r;
--   return r;
-- end $function$;
