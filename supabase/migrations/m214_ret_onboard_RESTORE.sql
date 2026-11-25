-- RESTORE: kr8_profile exactly as it was live on 25 Nov 2026 before m214 (same as m211). Run inside begin/commit.
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
                   limit 1)
  ) into r;
  return r;
end $function$

;
