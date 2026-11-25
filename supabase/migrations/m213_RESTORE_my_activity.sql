-- m213: exact live definition of kr8_my_activity before m213b (saved 25 Nov 2026). Run this to restore it.
CREATE OR REPLACE FUNCTION public.kr8_my_activity(p_limit integer DEFAULT 50)
 RETURNS TABLE(kind text, at timestamp with time zone, actor_id uuid, actor_name text, actor_photo text, post_id uuid, poster_path text, n integer, rank integer, prize text, i_follow boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  return query
  select * from (
    -- someone followed me
    select 'follow'::text, f.created_at, f.follower, m.first_name, m.photo, null::uuid, null::text, 1, null::int, null::text,
           exists (select 1 from public.kr8_follows x where x.follower = uid and x.followee = f.follower)
    from public.kr8_follows f join public.kr8_members m on m.user_id = f.follower
    where f.followee = uid and not public.kr8_is_blocked(uid, f.follower)
    union all
    -- likes on my Reels, one line per Reel per Bangkok day: latest liker + how many
    select 'like', max(l.created_at), (array_agg(l.user_id order by l.created_at desc))[1],
           (array_agg(m.first_name order by l.created_at desc))[1], (array_agg(m.photo order by l.created_at desc))[1],
           p.id, p.poster_path, count(*)::int, null, null, null
    from public.kr8_post_likes l join public.kr8_posts p on p.id = l.post_id join public.kr8_members m on m.user_id = l.user_id
    where p.author = uid and not public.kr8_is_blocked(uid, l.user_id)
    group by p.id, p.poster_path, (l.created_at at time zone 'Asia/Bangkok')::date
    union all
    -- 0189: comments on my Reels, one line per Reel per Bangkok day: latest commenter + how many (never my own comments;
    -- 0191: never a reply to me, which has its own line below)
    select 'comment', max(c.created_at), (array_agg(c.author order by c.created_at desc))[1],
           (array_agg(m.first_name order by c.created_at desc))[1], (array_agg(m.photo order by c.created_at desc))[1],
           p.id, p.poster_path, count(*)::int, null, left((array_agg(c.body order by c.created_at desc))[1], 80), null
    from public.kr8_reel_comments c join public.kr8_posts p on p.id = c.post_id join public.kr8_members m on m.user_id = c.author
    where p.author = uid and c.author <> uid and c.reply_to is distinct from uid and public.kr8_comment_shown(c.id)
    group by p.id, p.poster_path, (c.created_at at time zone 'Asia/Bangkok')::date
    union all
    -- 0191: replies to my comments, one line per Reel per Bangkok day; rank = 1 marks "replied to your comment"
    select 'comment', max(c.created_at), (array_agg(c.author order by c.created_at desc))[1],
           (array_agg(m.first_name order by c.created_at desc))[1], (array_agg(m.photo order by c.created_at desc))[1],
           p.id, p.poster_path, count(*)::int, 1, left((array_agg(c.body order by c.created_at desc))[1], 80), null
    from public.kr8_reel_comments c join public.kr8_posts p on p.id = c.post_id join public.kr8_members m on m.user_id = c.author
    where c.reply_to = uid and c.author <> uid and public.kr8_comment_shown(c.id)
    group by p.id, p.poster_path, (c.created_at at time zone 'Asia/Bangkok')::date
    union all
    -- 0182: at most ONE friend-verify line per Bangkok day: an unverified member liked one of my board-v2 Reels
    select 'friend_verify', max(l.created_at) + interval '1 second', (array_agg(l.user_id order by l.created_at desc))[1],
           (array_agg(m.first_name order by l.created_at desc))[1], (array_agg(m.photo order by l.created_at desc))[1],
           (array_agg(p.id order by l.created_at desc))[1], (array_agg(p.poster_path order by l.created_at desc))[1],
           count(distinct l.user_id)::int, null, null, null
    from public.kr8_post_likes l join public.kr8_posts p on p.id = l.post_id join public.kr8_members m on m.user_id = l.user_id
    where p.author = uid and l.user_id <> uid and public.kr8_rcfg('friend_verify_nudge_on', 1) = 1
      and not coalesce(m.verified, false) and not coalesce(m.ghost, false) and not public.kr8_is_team(l.user_id)
      and not public.kr8_is_blocked(uid, l.user_id) and not public.kr8_linked(l.user_id, uid)
      and (p.created_at >= to_timestamp(public.kr8_rcfg('board_v2_from', 2147483647)) or public.kr8_is_test_member(uid))
    group by (l.created_at at time zone 'Asia/Bangkok')::date
    union all
    -- Top 5 gifts won (old manual awards)
    select 'gift', a.awarded_at, null, null, null, p.id, p.poster_path, 1, a.rank, a.prize, null
    from public.kr8_reel_awards a join public.kr8_posts p on p.id = a.reel_id where p.author = uid
    union all
    -- my Reel was approved by the team
    select 'approved', p.reviewed_at, null, null, null, p.id, p.poster_path, 1, null, null, null
    from public.kr8_posts p where p.author = uid and p.kind = 'reel' and p.status = 'approved' and p.reviewed_at is not null and not p.hidden
    union all
    -- my Reel was hidden by the team (audit P2-3): the reason travels in "prize"
    select 'hidden', p.reviewed_at, null, null, null, p.id, p.poster_path, 1, null, p.review_note, null
    from public.kr8_posts p where p.author = uid and p.kind = 'reel' and p.status = 'hidden' and p.reviewed_at is not null
  ) a
  order by 2 desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end $function$;
