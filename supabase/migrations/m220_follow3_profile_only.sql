-- m220 (26 Nov 2026) Retention 10, features 3 + 4.
--   3. kr8_onb_follow_suggest(): 4 face-verified members with an approved Reel to follow in the first-visit steps
--      (same area first, then the most recently active). The follow itself is the existing kr8_follow (face check, blocks,
--      200/day) and the followed member already gets the "new follower" line in Activity (kr8_my_activity 'follow').
--   4. "Live on your profile": kr8_admin_reel_profile_only(reel, reason) = approved + profile only (feed_off) + ONE quality
--      reason key, in one tap. kr8_my_profile_only() = the member's own profile-only Reels with the reason + 2 example Reels
--      that made the main feed. Profile-only Reels keep counting for the weekly board (kr8_reel_scores ignores feed_off).
-- New functions only. Rollback: m220_follow3_profile_only_UNDO.sql
begin;

create or replace function public.kr8_onb_follow_suggest(p_limit int default 4)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); me public.kr8_members; t boolean;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into me from public.kr8_members where user_id = uid;
  if me.user_id is null then return jsonb_build_object('eligible', false); end if;
  t := public.kr8_is_test_member(uid);
  return jsonb_build_object(
    'eligible', coalesce(me.verified, false) and not coalesce(me.ghost, false),
    'following', (select count(*) from public.kr8_follows f where f.follower = uid),
    'area', me.area,
    'people', case when not coalesce(me.verified, false) then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'first_name', x.first_name, 'photo', nullif(x.photo, ''), 'area', x.area,
                                          'reels', x.reels, 'verified', true) order by x.o1 desc, x.last_active_at desc nulls last)
      from (select m.user_id, m.first_name, m.photo, m.area, m.last_active_at,
                   (m.area = me.area and coalesce(me.area, 'Bangkok') <> 'Bangkok') o1,
                   (select count(*)::int from public.kr8_posts p where p.author = m.user_id and p.kind = 'reel' and p.status = 'approved' and not p.hidden) reels
              from public.kr8_members m
             where m.user_id <> uid and coalesce(m.verified, false) and not coalesce(m.ghost, false)
               and coalesce(m.photo, '') <> '' and btrim(coalesce(m.first_name, '')) <> ''
               and not public.kr8_is_team(m.user_id) and not public.kr8_minor_held(m.user_id)
               and public.kr8_is_test_member(m.user_id) = t
               and not exists (select 1 from public.kr8_follows f where f.follower = uid and f.followee = m.user_id)
               and not exists (select 1 from public.kr8_blocks b where (b.blocker = uid and b.blocked = m.user_id) or (b.blocker = m.user_id and b.blocked = uid))
               and not public.kr8_linked(uid, m.user_id)
               and exists (select 1 from public.kr8_posts p where p.author = m.user_id and p.kind = 'reel' and p.status = 'approved' and not p.hidden)
             order by o1 desc, m.last_active_at desc nulls last
             limit least(greatest(coalesce(p_limit, 4), 1), 8)) x), '[]'::jsonb) end);
end $function$;
revoke execute on function public.kr8_onb_follow_suggest(int) from public, anon;
grant execute on function public.kr8_onb_follow_suggest(int) to authenticated;

-- the quality reasons (not rule breaks): the app shows each in the member's language
create or replace function public.kr8_profile_only_reasons()
 returns text[] language sql immutable set search_path to 'public', 'pg_temp'
as $function$ select array['dark', 'blurry', 'noperson', 'noplace', 'sideways', 'short', 'sound', 'slowstart', 'home'] $function$;

create or replace function public.kr8_admin_reel_profile_only(p_reel uuid, p_reason text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare r record;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_reason is null or not (p_reason = any (public.kr8_profile_only_reasons())) then raise exception 'KR8_BAD_REASON'; end if;
  update public.kr8_posts
     set status = 'approved', hidden = false, reviewed_by = auth.uid(), reviewed_at = now(), review_note = null,
         feed_off = true, feed_off_reason = 'q:' || p_reason, feed_off_at = now(), feed_off_by = auth.uid()
   where id = p_reel and kind = 'reel'
  returning id, status, feed_off, feed_off_reason into r;
  if r.id is null then raise exception 'KR8_NO_REEL'; end if;
  return jsonb_build_object('id', r.id, 'status', r.status, 'feed_off', r.feed_off, 'reason', r.feed_off_reason);
end $function$;
revoke execute on function public.kr8_admin_reel_profile_only(uuid, text) from public, anon;
grant execute on function public.kr8_admin_reel_profile_only(uuid, text) to authenticated;

create or replace function public.kr8_my_profile_only()
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); mine jsonb; ex jsonb;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'poster_path', p.poster_path,
           'reason', case when p.feed_off_reason like 'q:%' then substr(p.feed_off_reason, 3) end,
           'at', coalesce(p.feed_off_at, p.reviewed_at, p.created_at)) order by coalesce(p.feed_off_at, p.created_at) desc), '[]'::jsonb) into mine
    from public.kr8_posts p
   where p.author = uid and p.kind = 'reel' and p.status = 'approved' and not p.hidden and coalesce(p.feed_off, false)
     and coalesce(p.feed_off_at, p.created_at) > now() - interval '30 days';
  if jsonb_array_length(mine) = 0 then return jsonb_build_object('reels', mine, 'examples', '[]'::jsonb); end if;
  -- two Reels that made the main feed lately: most liked in 14 days, face-verified authors, never the Team / ghosts / minors
  select coalesce(jsonb_agg(public.kr8_r10_reel_json(uid, x.id) order by x.n desc), '[]'::jsonb) into ex
    from (select p.id, (select count(*) from public.kr8_post_likes l where l.post_id = p.id) n
            from public.kr8_posts p join public.kr8_members m on m.user_id = p.author
           where p.kind = 'reel' and p.status = 'approved' and not p.hidden and not coalesce(p.feed_off, false)
             and p.created_at > now() - interval '14 days' and p.author <> uid and coalesce(m.verified, false)
             and public.kr8_r10_reel_ok(uid, p.id)
           order by 2 desc, p.created_at desc limit 2) x;
  return jsonb_build_object('reels', mine, 'examples', ex);
end $function$;
revoke execute on function public.kr8_my_profile_only() from public, anon;
grant execute on function public.kr8_my_profile_only() to authenticated;

commit;
