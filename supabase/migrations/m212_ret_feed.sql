-- m212_ret_feed (25 Nov 2026): Feed retention push, feed part.
--   1. kr8_feed_new_faces(p_hours)  — "New in Bangkok 👋" row: a member's FIRST approved Reel (and first Ask answer) for 24 h.
--   2. kr8_feed_vote_cards(p_limit) — Ask BKK questions for the vote cards between Reels (questions the viewer has not
--                                     answered or voted on yet, with their top 3 answers).
--   3. kr8_feed_vote(p_answer)      — one-tap pick on a vote card = the existing ▲ upvote (kr8_ask_vote, unchanged), then
--                                     the truthful "how many picked the same" numbers.
-- Additive only: three new functions, no table, no change to any existing function. Votes earn no Rings (no trigger on
-- kr8_ask_votes awards any; ghosts and mirror accounts are still refused by the existing guards on kr8_ask_votes).
-- Rollback: m212_ret_feed_UNDO.sql
begin;

-- Member photos are ~38 KB data URLs, so only the answer tiles of the row carry one (max 6); Reel tiles show the poster.
-- 1 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.kr8_feed_new_faces(p_hours int default 24)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); h int; reels jsonb; ans jsonb;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  h := least(greatest(coalesce(p_hours, 24), 1), 168);
  -- first approved Reel of each member; it counts as new for h hours from its approval
  with firsts as (
    select distinct on (p.author) p.id, p.author, p.created_at, coalesce(p.reviewed_at, p.created_at) appr, p.poster_path, p.video_path,
           p.body, p.likes_count, p.feed_off
    from public.kr8_posts p
    where p.kind = 'reel' and p.status = 'approved' and not coalesce(p.hidden, false)
    order by p.author, p.created_at, p.id
  )
  select coalesce(jsonb_agg(x.j order by x.appr desc), '[]'::jsonb) into reels
  from (
    select f.appr, jsonb_build_object('k', 'reel', 'id', f.id, 'author_id', f.author, 'name', m.first_name,
             'poster_path', f.poster_path, 'video_path', f.video_path, 'body', f.body,
             'likes', coalesce(f.likes_count, 0), 'mine', f.author = uid, 'verified', coalesce(m.verified, false),
             'liked', exists (select 1 from public.kr8_post_likes l where l.post_id = f.id and l.user_id = uid),
             'saved', exists (select 1 from public.kr8_post_saves s where s.post_id = f.id and s.user_id = uid),
             'at', f.appr) j
    from firsts f join public.kr8_members m on m.user_id = f.author
    where f.appr > now() - make_interval(hours => h)
      and not coalesce(f.feed_off, false)
      and not coalesce(m.ghost, false) and not public.kr8_is_team(f.author)
      and not public.kr8_minor_held(f.author)
      and not public.kr8_is_blocked(uid, f.author)
      and not exists (select 1 from public.kr8_post_hidden hh where hh.user_id = uid and hh.post_id = f.id)
      and not exists (select 1 from public.kr8_reports r where r.post_id = f.id and r.handled_at is null)
    order by f.appr desc
    limit 15
  ) x;

  -- first Ask BKK answer of each member (text only; a photo-only answer may still be waiting for its check)
  with firsts as (
    select distinct on (a.author) a.id, a.post_id, a.author, a.body, a.created_at, a.hidden
    from public.kr8_ask_answers a
    order by a.author, a.created_at, a.id
  )
  select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb) into ans
  from (
    select f.created_at, jsonb_build_object('k', 'ans', 'id', f.id, 'post_id', f.post_id, 'author_id', f.author,
             'name', m.first_name, 'photo', nullif(m.photo, ''), 'body', left(f.body, 140), 'mine', f.author = uid,
             'verified', coalesce(m.verified, false), 'at', f.created_at) j
    from firsts f join public.kr8_members m on m.user_id = f.author
    where f.created_at > now() - make_interval(hours => h)
      and not f.hidden and btrim(coalesce(f.body, '')) <> ''
      and not coalesce(m.ghost, false) and not public.kr8_is_team(f.author)
      and not public.kr8_minor_held(f.author)
      and public.kr8_ask_a_ok(uid, f.id) and public.kr8_ask_q_ok(uid, f.post_id)
      -- one tile per person: someone who also has a new Reel shows with the Reel
      and not exists (select 1 from jsonb_array_elements(reels) r where (r->>'author_id')::uuid = f.author)
    order by f.created_at desc
    limit 6
  ) x;

  return jsonb_build_object('hours', h, 'items', reels || ans);
end $function$;
revoke execute on function public.kr8_feed_new_faces(int) from public, anon;
grant execute on function public.kr8_feed_new_faces(int) to authenticated;

-- 2 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.kr8_feed_vote_cards(p_limit int default 6)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); n int; out_ jsonb;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  n := least(greatest(coalesce(p_limit, 6), 1), 12);
  select coalesce(jsonb_agg(q.j order by q.created_at desc), '[]'::jsonb) into out_
  from (
    select p.created_at, jsonb_build_object(
             'id', p.id, 'body', p.body, 'details', p.ask_details, 'official', public.kr8_is_team(p.author), 'at', p.created_at,
             'answers', (select count(*) from public.kr8_ask_answers a where a.post_id = p.id and a.parent_id is null and public.kr8_ask_a_ok(uid, a.id)),
             'voters', (select count(distinct v.user_id) from public.kr8_ask_votes v join public.kr8_ask_answers a on a.id = v.target_id
                         where v.target_kind = 'a' and v.value = 1 and a.post_id = p.id and a.parent_id is null),
             'top', (select jsonb_agg(t.j order by t.score desc, t.created_at) from (
                       select a.score, a.created_at, jsonb_build_object('id', a.id, 'body', left(a.body, 180), 'score', a.score,
                                'name', case when public.kr8_is_team(a.author) then 'Kring Team' else am.first_name end) j
                       from public.kr8_ask_answers a join public.kr8_members am on am.user_id = a.author
                       where a.post_id = p.id and a.parent_id is null and btrim(coalesce(a.body, '')) <> '' and a.author <> uid
                         and public.kr8_ask_a_ok(uid, a.id)
                       order by a.score desc, a.created_at
                       limit 3) t)) j
    from public.kr8_posts p
    where p.kind = 'ask' and public.kr8_ask_q_ok(uid, p.id)
      -- skip what this member already took part in: answered, or voted on the question or any of its answers
      and not exists (select 1 from public.kr8_ask_answers a where a.post_id = p.id and a.author = uid)
      and not exists (select 1 from public.kr8_ask_votes v where v.user_id = uid and v.target_kind = 'q' and v.target_id = p.id)
      and not exists (select 1 from public.kr8_ask_votes v join public.kr8_ask_answers a on a.id = v.target_id
                      where v.user_id = uid and v.target_kind = 'a' and a.post_id = p.id)
      -- a vote needs a real choice: at least 2 answers from other members
      and (select count(*) from public.kr8_ask_answers a where a.post_id = p.id and a.parent_id is null and a.author <> uid
             and btrim(coalesce(a.body, '')) <> '' and public.kr8_ask_a_ok(uid, a.id)) >= 2
    order by p.created_at desc
    limit n
  ) q;
  return out_;
end $function$;
revoke execute on function public.kr8_feed_vote_cards(int) from public, anon;
grant execute on function public.kr8_feed_vote_cards(int) to authenticated;

-- 3 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- The pick is the ordinary ▲ upvote: kr8_ask_vote keeps every check it has (sign-in, member card, blocks, hidden, value range,
-- double-tap lock). Then: how many OTHER members ▲'d any top-level answer on this question, and how many of them ▲'d this one.
create or replace function public.kr8_feed_vote(p_answer uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); v_post uuid; v_par uuid; others int; same int;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if p_answer is null then raise exception 'KR8_BAD_VOTE'; end if;
  select post_id, parent_id into v_post, v_par from public.kr8_ask_answers where id = p_answer;
  if v_post is null or v_par is not null then raise exception 'KR8_NOT_FOUND'; end if;
  perform public.kr8_ask_vote('a', p_answer, 1);
  select count(distinct v.user_id) into others
    from public.kr8_ask_votes v join public.kr8_ask_answers a on a.id = v.target_id
   where v.target_kind = 'a' and v.value = 1 and a.post_id = v_post and a.parent_id is null and v.user_id <> uid;
  select count(distinct v.user_id) into same
    from public.kr8_ask_votes v
   where v.target_kind = 'a' and v.value = 1 and v.target_id = p_answer and v.user_id <> uid;
  return jsonb_build_object('others', others, 'same', same,
    -- a percentage only from 10 other voters (the This or That rule, 24 Nov); below that the app says the count in words
    'pct', case when others >= 10 then round(100.0 * same / others)::int end);
end $function$;
revoke execute on function public.kr8_feed_vote(uuid) from public, anon;
grant execute on function public.kr8_feed_vote(uuid) to authenticated;

commit;
