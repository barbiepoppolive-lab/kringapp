-- UNDO for 0109_kr8_invite_rings.sql (18 Nov 2026). Run as ONE block. Puts back the board / math / lifetime exactly as before 0109
-- (bodies copied from 0094_kr8_board_show_all.sql and 0047_kr8_locked_rings_prizes_share.sql), removes the invite trigger and functions.
-- Ledger rows with reason invite / invite_welcome are KEPT (append-only history); after this they count nowhere.
-- Tried on the TEST database inside a rolled-back transaction on 18 Nov 2026 (audit).
begin;
drop trigger if exists kr8_invite_trg on public.kr8_members;
drop function if exists public.kr8_invite_trg();
drop function if exists public.kr8_invite_try(uuid);
drop function if exists public.kr8_my_invites();

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

create or replace function public.kr8_score_breakdown(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); w0 timestamptz := public.kr8_week_start(now()); m public.kr8_members; t boolean; best int := greatest(public.kr8_rcfg('best_reels', 2), 1); r jsonb;
begin
  select * into m from public.kr8_members where user_id = p_user;
  if m.user_id is null or (uid is not null and uid <> p_user and public.kr8_is_blocked(uid, p_user)) then raise exception 'KR8_NO_PERSON'; end if;
  t := public.kr8_is_test_member(p_user);
  with s as (select x.*, row_number() over (order by x.score desc, x.posted_at asc, x.post_id) n
             from public.kr8_reel_scores(w0, w0 + interval '7 days', w0 + interval '7 days', t, p_user) x where x.score > 0)
  select jsonb_build_object(
    'user_id', p_user, 'first_name', m.first_name, 'is_me', uid = p_user,
    'rings', coalesce((select sum(score) from s where n <= best), 0),
    'rank', (select rk from public.kr8_week_board(w0, t) where member_id = p_user),
    'weights', jsonb_build_object('like', public.kr8_rcfg('like', 1), 'save', public.kr8_rcfg('save', 3), 'open', public.kr8_rcfg('open', 5),
                                  'mult', public.kr8_rcfg('traveller_mult', 2), 'cap', public.kr8_rcfg('opens_day_cap', 30), 'best', best),
    'more', (select count(*) from s where n > best),
    'reels', coalesce((select jsonb_agg(jsonb_build_object('post_id', s.post_id, 'posted_at', s.posted_at, 'poster_path', p.poster_path,
                 'place', (select pl.name_en from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id where pp.post_id = s.post_id order by pp.position limit 1),
                 'place_th', (select pl.name_th from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id where pp.post_id = s.post_id order by pp.position limit 1),
                 'l_local', s.l_local, 'l_trav', s.l_trav, 's_local', s.s_local, 's_trav', s.s_trav, 'opens', s.opens, 'score', s.score) order by s.n)
               from s join public.kr8_posts p on p.id = s.post_id where s.n <= best), '[]'::jsonb))
  into r;
  return r;
end $$;

create or replace function public.kr8_member_rings(p_user uuid)
returns table(lifetime int, week int, week_rank int) language sql stable security definer set search_path = public, pg_temp as $$
  with t as (select public.kr8_is_test_member(p_user) v)
  select coalesce((select sum(s.score)::int from t, public.kr8_reel_scores('-infinity', 'infinity', 'infinity', t.v, p_user) s), 0),
         coalesce((select b.rings from t, public.kr8_week_board(public.kr8_week_start(now()), t.v) b where b.member_id = p_user), 0),
         (select b.rk from t, public.kr8_week_board(public.kr8_week_start(now()), t.v) b where b.member_id = p_user)
$$;

drop function if exists public.kr8_invite_rings(uuid, timestamptz, timestamptz);
drop function if exists public.kr8_invite_pair_ok(uuid, uuid);
create or replace function public.kr8_rings_earn_reason(r text) returns boolean language sql immutable as $$
  select r in ('reel_place', 'likes_50', 'friend_join', 'friend_welcome', 'checkin', 'streak', 'react3', 'reel_removed')
$$;
delete from public.kr8_rings_config where key in ('invite', 'invite_day_cap');
-- the reason check keeps 'invite' / 'invite_welcome' allowed, so the kept history rows stay valid
commit;
