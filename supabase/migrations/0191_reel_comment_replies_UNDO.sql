-- UNDO 0191: back to 0189 exactly. Replies are soft-deleted first (they would otherwise turn into top comments), then the
-- reply columns and helper functions go; kr8_reel_comments / kr8_comment_counts / kr8_comment_add / kr8_my_activity are the 0189 text.
begin;
update public.kr8_reel_comments set deleted_at = coalesce(deleted_at, now()) where parent_id is not null;
drop function if exists public.kr8_comment_reply(uuid, text);
create or replace function public.kr8_reel_comments(p_post uuid, p_limit int default 60)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v_author uuid; v_items jsonb; v_n int; v_block text;
begin
  v_author := public.kr8_comment_reel(p_post);
  if v_author is null then return jsonb_build_object('post_id', p_post, 'n', 0, 'off', false, 'can', 'no_reel', 'creator', false, 'items', '[]'::jsonb); end if;
  select count(*)::int into v_n from public.kr8_reel_comments c
   where c.post_id = p_post and c.deleted_at is null and not c.hidden and public.kr8_comment_author_ok(c.author)
     and not exists (select 1 from public.kr8_reel_comment_reports r where r.comment_id = c.id and r.reporter = uid);
  select coalesce(jsonb_agg(x order by (x ->> 'at')), '[]'::jsonb) into v_items from (
    select jsonb_build_object('id', c.id, 'author_id', c.author, 'body', c.body, 'at', c.created_at, 'mine', c.author = uid)
           || jsonb_build_object('name', pp ->> 'name', 'photo', pp ->> 'photo', 'official', coalesce((pp ->> 'official')::boolean, false)) x
    from public.kr8_reel_comments c
    cross join lateral (select public.kr8_ask_person(c.author) pp) a
    where c.post_id = p_post and c.deleted_at is null and not c.hidden and public.kr8_comment_author_ok(c.author)
      and not exists (select 1 from public.kr8_reel_comment_reports r where r.comment_id = c.id and r.reporter = uid)
    order by c.created_at desc
    limit least(greatest(coalesce(p_limit, 60), 1), 100)
  ) q;
  v_block := public.kr8_comment_block(p_post);
  return jsonb_build_object('post_id', p_post, 'n', v_n,
    'off', exists (select 1 from public.kr8_reel_comments_off o where o.post_id = p_post),
    'can', coalesce(v_block, 'ok'), 'creator', uid is not null and v_author = uid, 'items', v_items);
end $$;

create or replace function public.kr8_comment_counts(p_posts uuid[])
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('post_id', p.id,
      'n', (select count(*) from public.kr8_reel_comments c
             where c.post_id = p.id and c.deleted_at is null and not c.hidden and public.kr8_comment_author_ok(c.author)
               and not exists (select 1 from public.kr8_reel_comment_reports r where r.comment_id = c.id and r.reporter = auth.uid())),
      'off', exists (select 1 from public.kr8_reel_comments_off o where o.post_id = p.id))), '[]'::jsonb)
  from public.kr8_posts p
  where p.id = any ((coalesce(p_posts, '{}'::uuid[]))[1:100]) and p.kind = 'reel' and not p.hidden and p.status = 'approved'
$$;

create or replace function public.kr8_comment_add(p_post uuid, p_body text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v_block text; v_reason text; v_body text; v_last timestamptz; v_day int; v_id uuid; v_at timestamptz; pp jsonb;
begin
  v_block := public.kr8_comment_block(p_post);
  if v_block is not null then return jsonb_build_object('ok', false, 'reason', v_block); end if;
  v_body := btrim(regexp_replace(coalesce(p_body, ''), '\s*\n\s*\n[\s\n]*', E'\n\n', 'g'));
  v_reason := public.kr8_comment_reason(v_body);
  if v_reason is not null then return jsonb_build_object('ok', false, 'reason', v_reason); end if;
  perform pg_advisory_xact_lock(hashtext('kr8_comment:' || uid::text));
  select max(created_at) into v_last from public.kr8_reel_comments where author = uid;
  if v_last is not null and v_last > now() - interval '10 seconds' then return jsonb_build_object('ok', false, 'reason', 'slow'); end if;
  select count(*)::int into v_day from public.kr8_reel_comments
   where author = uid and created_at >= (date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok');
  if v_day >= 20 then return jsonb_build_object('ok', false, 'reason', 'daily'); end if;
  if exists (select 1 from public.kr8_reel_comments where author = uid and post_id = p_post and lower(body) = lower(v_body)
              and deleted_at is null and created_at > now() - interval '1 day') then
    return jsonb_build_object('ok', false, 'reason', 'repeat');
  end if;
  insert into public.kr8_reel_comments (post_id, author, body) values (p_post, uid, v_body) returning id, created_at into v_id, v_at;
  pp := public.kr8_ask_person(uid);
  return jsonb_build_object('ok', true, 'n', (select count(*) from public.kr8_reel_comments c where c.post_id = p_post and c.deleted_at is null
                                                  and not c.hidden and public.kr8_comment_author_ok(c.author)),
    'comment', jsonb_build_object('id', v_id, 'author_id', uid, 'body', v_body, 'at', v_at, 'mine', true,
      'name', pp ->> 'name', 'photo', pp ->> 'photo', 'official', coalesce((pp ->> 'official')::boolean, false)));
end $$;

create or replace function public.kr8_my_activity(p_limit integer default 50)
 returns table(kind text, at timestamp with time zone, actor_id uuid, actor_name text, actor_photo text, post_id uuid, poster_path text, n integer, rank integer, prize text, i_follow boolean)
 language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
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
    -- 0189: comments on my Reels, one line per Reel per Bangkok day: latest commenter + how many (never my own comments)
    select 'comment', max(c.created_at), (array_agg(c.author order by c.created_at desc))[1],
           (array_agg(m.first_name order by c.created_at desc))[1], (array_agg(m.photo order by c.created_at desc))[1],
           p.id, p.poster_path, count(*)::int, null, left((array_agg(c.body order by c.created_at desc))[1], 80), null
    from public.kr8_reel_comments c join public.kr8_posts p on p.id = c.post_id join public.kr8_members m on m.user_id = c.author
    where p.author = uid and c.author <> uid and c.deleted_at is null and not c.hidden and public.kr8_comment_author_ok(c.author)
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

drop function if exists public.kr8_comment_post(uuid, text, uuid);
drop function if exists public.kr8_comment_json(public.kr8_reel_comments);
drop function if exists public.kr8_comment_count(uuid);
drop function if exists public.kr8_comment_shown(uuid);
drop index if exists public.kr8_reel_comments_parent;
alter table public.kr8_reel_comments drop column if exists reply_to;
alter table public.kr8_reel_comments drop column if exists parent_id;
revoke all on function public.kr8_comment_add(uuid, text) from public, anon;
grant execute on function public.kr8_reel_comments(uuid, int) to anon, authenticated;
grant execute on function public.kr8_comment_counts(uuid[]) to anon, authenticated;
grant execute on function public.kr8_comment_add(uuid, text) to authenticated;
commit;
