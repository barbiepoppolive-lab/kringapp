-- 0191 (21 Nov, founder): REPLIES on Reel comments, Instagram-style. One level only: a reply to a reply attaches to the same top
-- comment and names (@) the person it answers. Same rules as comments (0189): face-checked only, the same server filter, the same
-- 20-a-day / 10-second / no-repeat limits (replies count toward the 20), no Rings, the Reel's creator deletes any reply on their Reel,
-- authors delete their own, 2+ verified reports hide it, and deleting (or hiding) a top comment hides its replies.
-- Activity: the person replied to gets "X replied to your comment" (a 'comment' row with rank = 1, so an older app still shows a
-- sensible "commented" line); the Reel's creator keeps the "X commented on your Reel" line as now (never twice for the same reply).
-- kr8_reel_comments keeps its shape: items = top comments (older apps show exactly what they showed before); each item now also
-- carries replies [...] and nrep. n counts top comments + visible replies.
-- Additive: two columns, one index, one new function (kr8_comment_reply), six functions replaced. UNDO: 0191_reel_comment_replies_UNDO.sql
begin;

alter table public.kr8_reel_comments add column if not exists parent_id uuid references public.kr8_reel_comments(id) on delete cascade;
alter table public.kr8_reel_comments add column if not exists reply_to uuid references public.kr8_members(user_id) on delete set null;
create index if not exists kr8_reel_comments_parent on public.kr8_reel_comments (parent_id, created_at) where parent_id is not null;

-- one comment row is shown to this viewer: not deleted / hidden, author visible, not reported by me, and for a reply the same holds for its top comment
create or replace function public.kr8_comment_shown(p_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.kr8_reel_comments c
    where c.id = p_id and c.deleted_at is null and not c.hidden and public.kr8_comment_author_ok(c.author)
      and not exists (select 1 from public.kr8_reel_comment_reports r where r.comment_id = c.id and r.reporter = auth.uid())
      and (c.parent_id is null or exists (select 1 from public.kr8_reel_comments t
            where t.id = c.parent_id and t.deleted_at is null and not t.hidden and public.kr8_comment_author_ok(t.author)
              and not exists (select 1 from public.kr8_reel_comment_reports r2 where r2.comment_id = t.id and r2.reporter = auth.uid()))))
$$;
revoke all on function public.kr8_comment_shown(uuid) from public, anon, authenticated;

create or replace function public.kr8_comment_count(p_post uuid)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from public.kr8_reel_comments c where c.post_id = p_post and public.kr8_comment_shown(c.id)
$$;
revoke all on function public.kr8_comment_count(uuid) from public, anon, authenticated;

-- one comment as the app shows it (reply: parent_id + to_name = the first name of the person answered, never an @handle in the text)
create or replace function public.kr8_comment_json(c public.kr8_reel_comments)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', c.id, 'author_id', c.author, 'body', c.body, 'at', c.created_at, 'mine', c.author = auth.uid(),
           'parent_id', c.parent_id,
           'to_id', case when c.reply_to is not null and public.kr8_comment_author_ok(c.reply_to) then c.reply_to end,
           'to_name', case when c.reply_to is not null and public.kr8_comment_author_ok(c.reply_to) then (public.kr8_ask_person(c.reply_to) ->> 'name') end)
      || jsonb_build_object('name', pp ->> 'name', 'photo', pp ->> 'photo', 'official', coalesce((pp ->> 'official')::boolean, false))
  from (select public.kr8_ask_person(c.author) pp) a
$$;
revoke all on function public.kr8_comment_json(public.kr8_reel_comments) from public, anon, authenticated;

-- ───────────── read (same shape as 0189 + replies / nrep per top comment) ─────────────
create or replace function public.kr8_reel_comments(p_post uuid, p_limit int default 60)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v_author uuid; v_items jsonb; v_n int; v_block text;
begin
  v_author := public.kr8_comment_reel(p_post);
  if v_author is null then return jsonb_build_object('post_id', p_post, 'n', 0, 'off', false, 'can', 'no_reel', 'creator', false, 'items', '[]'::jsonb); end if;
  v_n := public.kr8_comment_count(p_post);
  select coalesce(jsonb_agg(x order by (x ->> 'at')), '[]'::jsonb) into v_items from (
    select public.kr8_comment_json(c) || jsonb_build_object(
             'replies', coalesce((select jsonb_agg(public.kr8_comment_json(r) order by r.created_at)
                                  from (select * from public.kr8_reel_comments r0 where r0.parent_id = c.id and public.kr8_comment_shown(r0.id)
                                        order by r0.created_at limit 50) r), '[]'::jsonb),
             'nrep', (select count(*)::int from public.kr8_reel_comments r1 where r1.parent_id = c.id and public.kr8_comment_shown(r1.id))) x
    from public.kr8_reel_comments c
    where c.post_id = p_post and c.parent_id is null and public.kr8_comment_shown(c.id)
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
  select coalesce(jsonb_agg(jsonb_build_object('post_id', p.id, 'n', public.kr8_comment_count(p.id),
      'off', exists (select 1 from public.kr8_reel_comments_off o where o.post_id = p.id))), '[]'::jsonb)
  from public.kr8_posts p
  where p.id = any ((coalesce(p_posts, '{}'::uuid[]))[1:100]) and p.kind = 'reel' and not p.hidden and p.status = 'approved'
$$;

-- ───────────── write: one path for comments and replies ─────────────
create or replace function public.kr8_comment_post(p_post uuid, p_body text, p_parent uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v_block text; v_reason text; v_body text; v_last timestamptz; v_day int; v_id uuid;
        v_root uuid; v_to uuid; par record; rw public.kr8_reel_comments;
begin
  v_block := public.kr8_comment_block(p_post);
  if v_block is not null then return jsonb_build_object('ok', false, 'reason', v_block); end if;
  if p_parent is not null then
    select * into par from public.kr8_reel_comments where id = p_parent;
    if not found or par.post_id <> p_post or not public.kr8_comment_shown(p_parent) then return jsonb_build_object('ok', false, 'reason', 'gone'); end if;
    v_root := coalesce(par.parent_id, par.id);   -- one level: a reply to a reply joins the same top comment
    v_to := par.author;
    if exists (select 1 from public.kr8_blocks b where (b.blocker = uid and b.blocked = v_to) or (b.blocker = v_to and b.blocked = uid)) then
      return jsonb_build_object('ok', false, 'reason', 'gone');   -- a real block either way (who is visible is already checked above)
    end if;
  end if;
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
  insert into public.kr8_reel_comments (post_id, author, body, parent_id, reply_to) values (p_post, uid, v_body, v_root, v_to) returning * into rw;
  return jsonb_build_object('ok', true, 'n', public.kr8_comment_count(p_post), 'comment', public.kr8_comment_json(rw));
end $$;
revoke all on function public.kr8_comment_post(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.kr8_comment_add(p_post uuid, p_body text)
returns jsonb language sql volatile security definer set search_path = public, pg_temp as $$
  select public.kr8_comment_post(p_post, p_body, null)
$$;

-- reply to a comment (or to a reply: it joins the same top comment). Same answers as kr8_comment_add, plus reason 'gone'.
create or replace function public.kr8_comment_reply(p_comment uuid, p_body text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_post uuid;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'signin'); end if;
  select post_id into v_post from public.kr8_reel_comments where id = p_comment;
  if v_post is null then return jsonb_build_object('ok', false, 'reason', 'gone'); end if;
  return public.kr8_comment_post(v_post, p_body, p_comment);
end $$;
revoke all on function public.kr8_comment_add(uuid, text) from public, anon;
revoke all on function public.kr8_comment_reply(uuid, text) from public, anon;
grant execute on function public.kr8_comment_add(uuid, text) to authenticated;
grant execute on function public.kr8_comment_reply(uuid, text) to authenticated;
grant execute on function public.kr8_reel_comments(uuid, int) to anon, authenticated;
grant execute on function public.kr8_comment_counts(uuid[]) to anon, authenticated;

-- ───────────── Activity ─────────────
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

commit;
