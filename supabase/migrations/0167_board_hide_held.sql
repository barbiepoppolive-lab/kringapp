CREATE OR REPLACE FUNCTION public.kr8_week_board(p_w0 timestamp with time zone, p_test boolean)
 RETURNS TABLE(member_id uuid, rings integer, rk integer, first_at timestamp with time zone, reels jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with s as (select * from public.kr8_reel_scores_adj(p_w0, p_w0 + interval '7 days', p_w0 + interval '7 days', p_test)),
  r as (select s.*, row_number() over (partition by s.author order by s.score desc, s.posted_at asc, s.post_id) n from s),
  -- 0094: a member whose best Reel has 0 Rings still shows (their best = earliest Reel this week); a 0-Ring Reel never fills a 2nd/3rd best slot
  m as (select r.author, sum(r.score)::int rings, min(r.posted_at) filter (where r.n = 1) first_at, jsonb_agg(r.post_id order by r.n) reels
        from r where r.n <= greatest(public.kr8_rcfg('best_reels', 2), 1) and (r.n = 1 or r.score > 0) group by r.author),
  -- 0109: + invite Rings earned this week (test boards never get any: kr8_invite_pair_ok excludes test accounts)
  t as (select m.author, m.rings + case when p_test then 0 else public.kr8_invite_rings(m.author, p_w0, p_w0 + interval '7 days') end rings,
               m.first_at, m.reels from m)
  select t.author, t.rings, (row_number() over (order by t.rings desc, t.first_at asc, mm.member_no asc))::int, t.first_at, t.reels
  from t join public.kr8_members mm on mm.user_id = t.author
  -- 0167 (20 Nov): anyone on the under-18 / child-photo hold or with an all-prizes ban is off the public board (ranks shift up)
  where not public.kr8_minor_held(t.author)
    and not exists (select 1 from public.kr8_prize_bans b where b.user_id = t.author and b.scope = 'all')
$function$;
