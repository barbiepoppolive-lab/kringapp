-- 0074 (17 Nov): per-Reel "Feed only" flag. Founder: AI-made Reels stay in the feed but never count on the weekly board.
-- Additive: one column (default false = nothing changes) + kr8_reel_scores = body of 0072 + one line.
begin;
alter table public.kr8_posts add column if not exists board_off boolean not null default false;
alter table public.kr8_posts add column if not exists board_off_reason text;
create or replace function public.kr8_reel_scores(p_from timestamptz, p_to timestamptz, p_until timestamptz, p_test boolean, p_author uuid default null)
returns table (post_id uuid, author uuid, posted_at timestamptz, l_local int, l_trav int, s_local int, s_trav int, opens int, score int)
language sql stable security definer set search_path = public, pg_temp as $$
  with cfg as (select public.kr8_rcfg('like', 1) w_like, public.kr8_rcfg('save', 3) w_save, public.kr8_rcfg('open', 5) w_open,
                      public.kr8_rcfg('traveller_mult', 2) mult, public.kr8_rcfg('opens_day_cap', 30) cap),
  reels as (
    select p.id, p.author, p.created_at
    from public.kr8_posts p
    where p.kind = 'reel' and p.status = 'approved' and not p.hidden
      and p.created_at >= p_from and p.created_at < p_to
      and (p_author is null or p.author = p_author)
      and not p.board_off   -- 0074: admin "Feed only" (AI-made, not own footage, repost): stays in the feed, never on the board
      and exists (select 1 from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id   -- 0072: at least one Bangkok place
                  where pp.post_id = p.id and not pl.outside_bkk)
      and exists (select 1 from public.kr8_members am where am.user_id = p.author)
      and public.kr8_is_test_member(p.author) = p_test
      and not public.kr8_is_team(p.author)
  ),
  ppl as (   -- members whose likes and saves count
    select m.user_id, (m.who = 'traveller' and (m.verified or public.kr8_rcfg('traveller_mult_needs_verified', 1) = 0)) as trav
    from public.kr8_members m
    where coalesce(m.photo, '') <> '' and btrim(coalesce(m.first_name, '')) <> '' and public.kr8_is_test_member(m.user_id) = p_test and not public.kr8_is_team(m.user_id)
      and (m.verified or m.created_at < now() - make_interval(hours => public.kr8_rcfg('liker_min_age_hours', 72)))
  ),
  lk as (
    select r.id, count(*) filter (where not c.trav)::int a, count(*) filter (where c.trav)::int b
    from reels r join public.kr8_post_likes l on l.post_id = r.id and l.user_id <> r.author and l.created_at < p_until
    join ppl c on c.user_id = l.user_id
    where not public.kr8_linked(l.user_id, r.author)
    group by r.id
  ),
  sv as (
    select r.id, count(*) filter (where not c.trav)::int a, count(*) filter (where c.trav)::int b
    from reels r join public.kr8_post_saves s on s.post_id = r.id and s.user_id <> r.author and s.created_at < p_until
    join ppl c on c.user_id = s.user_id
    where not public.kr8_linked(s.user_id, r.author)
    group by r.id
  ),
  od as (
    select r.id, o.bkk_date, count(*)::int n
    from reels r join public.kr8_share_opens o on o.post_id = r.id and o.ok and o.created_at < p_until
    where o.opener is distinct from r.author
      and (o.opener is null or not public.kr8_linked(o.opener, r.author))
      and not exists (select 1 from public.kr8_share_opens mine where mine.opener = r.author and (mine.session = o.session or mine.device = o.device))
    group by r.id, o.bkk_date
  ),
  op as (select od.id, sum(least(od.n, cfg.cap))::int n from od, cfg group by od.id)
  select r.id, r.author, r.created_at,
         coalesce(lk.a, 0), coalesce(lk.b, 0), coalesce(sv.a, 0), coalesce(sv.b, 0), coalesce(op.n, 0),
         (coalesce(lk.a, 0) * cfg.w_like + coalesce(lk.b, 0) * cfg.w_like * cfg.mult
          + coalesce(sv.a, 0) * cfg.w_save + coalesce(sv.b, 0) * cfg.w_save * cfg.mult
          + coalesce(op.n, 0) * cfg.w_open)::int
  from reels r cross join cfg left join lk on lk.id = r.id left join sv on sv.id = r.id left join op on op.id = r.id
$$;
revoke all on function public.kr8_reel_scores(timestamptz, timestamptz, timestamptz, boolean, uuid) from public, anon, authenticated;

commit;
