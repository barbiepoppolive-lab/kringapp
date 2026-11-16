-- 0060 (16 Nov, founder "fix top 10"): the old Top 10 (likes + 2*saves + 3*shares + views/10, any day/week) disagreed with the
-- real weekly ranking (Rings: kr8_week_board, the one that pays). kr8_top10 now returns the real board for every period, so every
-- rank a member sees anywhere in the app is the same number. Same signature and columns; 'points' = Rings; 'prize' left empty
-- (prizes are shown by the Ranking screen with the 25-Ring floor). Old body: see 0026/0044 history.
create or replace function public.kr8_top10(p_period text default 'today', p_area text default null)
returns table(rank integer, reel_id uuid, user_id uuid, first_name text, photo text, area text, body text, venue_name text,
              poster_path text, points integer, prize text, is_me boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if p_period not in ('today', 'week', 'area') then raise exception 'KR8_BAD_PERIOD'; end if;
  return query
    with b as (
      select wb.rk::int as rk, wb.member_id, wb.rings::int as rings, (wb.reels->>0)::uuid as rid
      from public.kr8_week_board(public.kr8_week_start(now()), false) wb
    ), f as (
      select b.*, p.area as parea, p.body as pbody, p.poster_path as pposter, p.venue_id
      from b left join public.kr8_posts p on p.id = b.rid
      where (p_period <> 'area' or p.area = p_area)
        and (uid is null or not public.kr8_is_blocked(uid, b.member_id))
    ), r as (
      select f.*, (case when p_period = 'area' then row_number() over (order by f.rk) else f.rk end)::int as nr from f
    )
    select r.nr, r.rid, r.member_id, m.first_name, case when uid is null then null else m.photo end, r.parea, left(r.pbody, 60),
           v.name, r.pposter, r.rings, null::text, r.member_id = uid
    from r join public.kr8_members m on m.user_id = r.member_id
    left join public.kr8_venues v on v.id = r.venue_id
    where r.nr <= 10
    order by r.nr;
end $$;
