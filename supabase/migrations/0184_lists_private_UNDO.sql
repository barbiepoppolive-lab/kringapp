-- UNDO 0184: lists are public again (no setting, no guard).
begin;
CREATE OR REPLACE FUNCTION public.kr8_follow_list(p_user uuid, p_kind text)
 RETURNS TABLE(user_id uuid, first_name text, photo text, ig_handle text, who text, verified boolean, i_follow boolean, follows_me boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if p_kind not in ('followers', 'following') then raise exception 'KR8_BAD_KIND'; end if;
  if p_user <> uid and public.kr8_is_blocked(uid, p_user) then raise exception 'KR8_NO_PERSON'; end if;
  return query
    select m.user_id, m.first_name, m.photo, m.ig_handle, m.who, m.verified,
           exists (select 1 from public.kr8_follows x where x.follower = uid and x.followee = m.user_id),
           exists (select 1 from public.kr8_follows x where x.follower = m.user_id and x.followee = uid)
    from public.kr8_follows f
    join public.kr8_members m on m.user_id = case when p_kind = 'followers' then f.follower else f.followee end
    where (case when p_kind = 'followers' then f.followee else f.follower end) = p_user
      and not public.kr8_is_blocked(uid, m.user_id)
    order by f.created_at desc
    limit 500;
end $function$;

CREATE OR REPLACE FUNCTION public.kr8_profile(p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); tgt uuid := coalesce(p_user, auth.uid()); m public.kr8_members; r jsonb;
begin
  if tgt is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into m from public.kr8_members where user_id = tgt;
  if m.user_id is null or (uid is not null and tgt <> uid and public.kr8_is_blocked(uid, tgt)) then raise exception 'KR8_NO_PERSON'; end if;
  select jsonb_build_object(
    'user_id', m.user_id, 'first_name', m.first_name,
    'photo', case when uid is null then null else m.photo end,
    'langs', m.langs, 'bio', m.bio, 'area', m.area, 'who', m.who, 'verified', m.verified, 'ig_handle', m.ig_handle,
    'interests', m.interests, 'member_no', 'KR ' || lpad(((('x' || substr(md5(m.user_id::text), 1, 8))::bit(32)::bigint % 9000) + 1000)::text, 4, '0'),
    'online', case when uid is null then null else coalesce(m.last_active_at > now() - interval '5 minutes', false) end,
    'here', case when uid is null then null else coalesce(m.here_until > now(), false) end,
    'mine', uid is not null and tgt = uid,
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
                             order by p.created_at desc limit 12) p), '[]'::jsonb)
  ) into r;
  return r;
end $function$;

drop function if exists public.kr8_set_lists_private(boolean);
alter table public.kr8_members drop column if exists lists_private;
commit;
