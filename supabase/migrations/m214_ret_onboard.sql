-- m214 (25 Nov 2026) retention push, first-visit + friends part (branch ret-onboard).
--   1 · 'bangkok_local' badge: awarded when a member has answered 1 Ask BKK question, liked 3 Reels (not their own) and
--       posted their first clip. A tag only: no Rings, no score, nothing that can be farmed for prizes.
--   2 · kr8_onb_state(): the first-visit steps for the signed-in member (and awards the tag once all three are done).
--   3 · kr8_onb_alike(kind, ref, limit): members who answered like me (same vote / same question), for Follow.
--   4 · kr8_onb_answer_streak(uid) + 'streak' on kr8_profile (consecutive Bangkok days with an answer or a vote).
-- Additive only: one widened CHECK, three new functions, one new field on kr8_profile (old apps ignore it).
-- Rollback: m214_ret_onboard_UNDO.sql (kr8_profile goes back to m214_ret_onboard_RESTORE.sql).
begin;

-- 1 · allow the new badge (Founding Local stays as it was)
alter table public.kr8_member_badges drop constraint if exists kr8_member_badges_badge_check;
alter table public.kr8_member_badges add constraint kr8_member_badges_badge_check check (badge in ('founding_local', 'bangkok_local'));

-- 4a · the streak, read-only. Ask answers count when top-level and not hidden; votes are This-or-That picks.
--      Counts back from the newest active day; it is still alive if that day is today or yesterday (Bangkok).
create or replace function public.kr8_onb_answer_streak(p_user uuid)
 returns integer
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  with days as (
    select distinct public.kr8_bkk_day(a.created_at) as d from public.kr8_ask_answers a
     where a.author = p_user and a.parent_id is null and not coalesce(a.hidden, false)
    union
    select p.day from public.kr8_task_vote_picks p where p.member_id = p_user
  ),
  g as (select d, d - (row_number() over (order by d))::int as grp from days),
  mx as (select max(d) as d from g)
  select case when (select d from mx) >= public.kr8_bkk_day() - 1
              then (select count(*)::int from g where grp = (select g2.grp from g g2 where g2.d = (select d from mx)))
              else 0 end
$function$;
revoke execute on function public.kr8_onb_answer_streak(uuid) from public, anon, authenticated;

-- 2 · first-visit steps for the caller
create or replace function public.kr8_onb_state()
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); m public.kr8_members; n_ask int; n_like int; n_clip int; n_av int; ok boolean; has boolean;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into m from public.kr8_members where user_id = uid;
  if m.user_id is null then return jsonb_build_object('on', false); end if;
  select count(*) into n_ask from public.kr8_ask_answers a
   where a.author = uid and a.parent_id is null and not coalesce(a.hidden, false);
  select count(*) into n_like from public.kr8_post_likes l join public.kr8_posts p on p.id = l.post_id
   where l.user_id = uid and p.kind = 'reel' and p.author is distinct from uid;
  select count(*) into n_clip from public.kr8_posts p where p.author = uid and p.kind = 'reel' and not coalesce(p.hidden, false);
  select n_ask + count(*) into n_av from public.kr8_task_vote_picks v where v.member_id = uid;
  ok := n_ask >= 1 and n_like >= 3 and n_clip >= 1;
  if ok and not coalesce(m.ghost, false) then
    insert into public.kr8_member_badges (user_id, badge) values (uid, 'bangkok_local') on conflict do nothing;
  end if;
  has := exists (select 1 from public.kr8_member_badges b where b.user_id = uid and b.badge = 'bangkok_local');
  return jsonb_build_object(
    'on', true,
    'new', m.created_at > now() - interval '3 days',          -- the app shows the steps only in the first 3 days
    'ends_at', m.created_at + interval '3 days',
    'ask', n_ask >= 1, 'likes', least(n_like, 3), 'clip', n_clip >= 1,
    'done', ok, 'badge', has,
    'answers', n_av,                                          -- Ask answers + votes (the "answered like you" list needs 2)
    'streak', public.kr8_onb_answer_streak(uid));
end $function$;
revoke execute on function public.kr8_onb_state() from public, anon;
grant execute on function public.kr8_onb_state() to authenticated, service_role;

-- 3 · "People who answered like you". p_kind: 'any' (People tab), 'vote' (p_ref = the vote day, YYYY-MM-DD) or
--     'ask' (p_ref = the Ask question id). Only after 2+ answers/votes; never self, ghosts, blocked, hidden team, or people
--     already followed; an unchecked (face-gated) viewer gets nothing, same as the People wall. Verified first.
create or replace function public.kr8_onb_alike(p_kind text default 'any', p_ref text default null, p_limit integer default 12)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); v_day date; v_post uuid; n_av int; lim int := greatest(1, least(coalesce(p_limit, 12), 20)); r jsonb;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if p_kind is null or p_kind not in ('any', 'vote', 'ask') then raise exception 'KR8_BAD_INPUT'; end if;
  if p_ref is not null and length(p_ref) > 40 then raise exception 'KR8_BAD_INPUT'; end if;
  begin
    if p_kind = 'vote' and p_ref is not null then v_day := p_ref::date; end if;
    if p_kind = 'ask' and p_ref is not null then v_post := p_ref::uuid; end if;
  exception when others then raise exception 'KR8_BAD_INPUT';
  end;
  if not exists (select 1 from public.kr8_members where user_id = uid) then return jsonb_build_object('eligible', false, 'answers', 0, 'people', '[]'::jsonb); end if;
  select (select count(*) from public.kr8_ask_answers a where a.author = uid and a.parent_id is null and not coalesce(a.hidden, false))
       + (select count(*) from public.kr8_task_vote_picks v where v.member_id = uid) into n_av;
  if n_av < 2 or public.kr8_face_gate(uid) then
    return jsonb_build_object('eligible', false, 'answers', n_av, 'people', '[]'::jsonb);
  end if;
  with my_votes as (
    select v.day, v.pick from public.kr8_task_vote_picks v
     where v.member_id = uid and p_kind in ('any', 'vote') and (v_day is null or v.day = v_day)
  ), my_asks as (
    select distinct a.post_id from public.kr8_ask_answers a
     where a.author = uid and a.parent_id is null and not coalesce(a.hidden, false)
       and p_kind in ('any', 'ask') and (v_post is null or a.post_id = v_post)
  ), hits as (
    select p.member_id as who, 'v' as k, p.day::text as ref from public.kr8_task_vote_picks p
      join my_votes v on v.day = p.day and v.pick = p.pick
     where p.member_id <> uid
    union
    select a.author, 'a', a.post_id::text from public.kr8_ask_answers a
      join my_asks q on q.post_id = a.post_id
     where a.author <> uid and a.parent_id is null and not coalesce(a.hidden, false)
  ), agg as (
    select who, count(*) filter (where k = 'v')::int as nv, count(*) filter (where k = 'a')::int as na from hits group by who
  ), pick as (
    select m.user_id, m.first_name, m.photo, coalesce(m.verified, false) as verified, agg.nv, agg.na, m.last_active_at
      from agg join public.kr8_members m on m.user_id = agg.who
     where not coalesce(m.ghost, false)
       and not public.kr8_is_blocked(uid, m.user_id)
       and not exists (select 1 from public.kr8_follows f where f.follower = uid and f.followee = m.user_id)
     order by coalesce(m.verified, false) desc, agg.nv + agg.na desc, m.last_active_at desc nulls last
     limit lim
  )
  select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'first_name', first_name, 'photo', photo, 'verified', verified,
                                               'same_votes', nv, 'same_questions', na)
                            order by verified desc, nv + na desc, last_active_at desc nulls last), '[]'::jsonb)
    into r from pick;
  return jsonb_build_object('eligible', true, 'answers', n_av, 'people', r);
end $function$;
revoke execute on function public.kr8_onb_alike(text, text, integer) from public, anon;
grant execute on function public.kr8_onb_alike(text, text, integer) to authenticated, service_role;

-- 4b · kr8_profile: same body as m211 + 'streak'
CREATE OR REPLACE FUNCTION public.kr8_profile(p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); tgt uuid := coalesce(p_user, auth.uid()); m public.kr8_members; r jsonb; gated boolean;
begin
  if tgt is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into m from public.kr8_members where user_id = tgt;
  if m.user_id is null or (uid is not null and tgt <> uid and public.kr8_is_blocked(uid, tgt)) then raise exception 'KR8_NO_PERSON'; end if;
  gated := public.kr8_face_gate(uid);   -- m207: an unchecked viewer sees no socials, not even on their own card's screen
  select jsonb_build_object(
    'user_id', m.user_id, 'first_name', m.first_name,
    'photo', case when uid is null then null else m.photo end,
    'langs', m.langs, 'bio', m.bio, 'area', m.area, 'who', m.who, 'verified', m.verified,
    'ig_handle', case when gated and tgt <> uid then null else m.ig_handle end,
    'interests', m.interests, 'member_no', 'KR ' || lpad(((('x' || substr(md5(m.user_id::text), 1, 8))::bit(32)::bigint % 9000) + 1000)::text, 4, '0'),
    'online', case when uid is null then null else coalesce(m.last_active_at > now() - interval '5 minutes', false) end,
    'here', case when uid is null then null else coalesce(m.here_until > now(), false) end,
    'mine', uid is not null and tgt = uid,
    -- m207: the app reads this to show "you are hidden" on the member's own profile
    'gated', case when uid is not null and tgt = uid then gated end,
    'level', public.kr8_level_of(tgt),
    'followers', (select count(*) from public.kr8_follows f where f.followee = tgt),
    'following', (select count(*) from public.kr8_follows f where f.follower = tgt),
    'likes', (select coalesce(sum(p.likes_count), 0) from public.kr8_posts p where p.author = tgt and p.kind = 'reel' and not p.hidden),
    'gifts', (select count(*) from public.kr8_reel_awards a join public.kr8_posts p on p.id = a.reel_id where p.author = tgt),
    'i_follow', uid is not null and exists (select 1 from public.kr8_follows f where f.follower = uid and f.followee = tgt),
    'follows_me', uid is not null and exists (select 1 from public.kr8_follows f where f.follower = tgt and f.followee = uid),
    'reels', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'poster_path', p.poster_path, 'likes', p.likes_count,
                                                           'status', p.status) order by p.created_at desc)
                       from (select * from public.kr8_posts p where p.author = tgt and p.kind = 'reel' and not p.hidden
                               and (p.status = 'approved' or (uid is not null and tgt = uid))
                             order by p.created_at desc limit 12) p), '[]'::jsonb),
    -- 0184: the member keeps the followers / following lists to themself (the counts stay)
    'lists_private', coalesce(m.lists_private, false),
    -- 0251: profile builder step 6 (one question + the member's answer)
    'qa_q', m.qa_q, 'qa_answer', m.qa_answer,
    -- m211: profile badges
    'badges', coalesce((select jsonb_agg(b.badge order by b.granted_at) from public.kr8_member_badges b where b.user_id = tgt), '[]'::jsonb),
    'last_week', (select jsonb_build_object('rank', w.rank, 'week', w.week, 'week_no', extract(week from w.week)::int)
                    from public.kr8_week_results w
                   where w.member_id = tgt and not w.is_test and w.rank between 1 and 8
                     and w.week = (select max(x.week) from public.kr8_week_results x where not x.is_test)
                   limit 1),
    -- m214: answer streak (consecutive Bangkok days with an Ask BKK answer or a This-or-That vote); the app shows it from 2 days
    'streak', public.kr8_onb_answer_streak(tgt)
  ) into r;
  return r;
end $function$;

commit;
