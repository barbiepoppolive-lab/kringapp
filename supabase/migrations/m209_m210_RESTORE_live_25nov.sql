-- RESTORE: live definitions captured 25 Nov 2026 before m209/m210 (pg_get_functiondef). Run with tools/kq.py -f.

begin;

CREATE OR REPLACE FUNCTION public.kr8_follow(p_user uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if p_user = uid then raise exception 'KR8_SELF'; end if;
  if not exists (select 1 from public.kr8_members where user_id = p_user) or public.kr8_is_blocked(uid, p_user) then raise exception 'KR8_NO_PERSON'; end if;
  -- m207: a follow shows the follower's name and photo in the other member's Activity
  if public.kr8_face_gate(uid) then raise exception 'KR8_VERIFY_FIRST'; end if;
  if public.kr8_face_gate(p_user) and not public.kr8_is_admin() then raise exception 'KR8_NO_PERSON'; end if;
  select count(*) into n from public.kr8_follows where follower = uid and created_at > now() - interval '1 day';
  if n >= 200 then raise exception 'KR8_SLOW_DOWN'; end if;
  insert into public.kr8_follows (follower, followee) values (uid, p_user) on conflict do nothing;
  return true;
end $function$;

revoke execute on function public.kr8_follow(p_user uuid) from public, anon;
grant execute on function public.kr8_follow(p_user uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.kr8_follow_list(p_user uuid, p_kind text)
 RETURNS TABLE(user_id uuid, first_name text, photo text, ig_handle text, who text, verified boolean, i_follow boolean, follows_me boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); gated boolean;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if p_kind not in ('followers', 'following') then raise exception 'KR8_BAD_KIND'; end if;
  if p_user <> uid and public.kr8_is_blocked(uid, p_user) then raise exception 'KR8_NO_PERSON'; end if;
  -- 0184: a private list is shown only to its owner and to the admin
  if p_user <> uid and not public.kr8_is_admin()
     and coalesce((select m.lists_private from public.kr8_members m where m.user_id = p_user), false)
  then raise exception 'KR8_LIST_PRIVATE'; end if;
  gated := public.kr8_face_gate(uid);   -- m207
  return query
    select m.user_id, m.first_name, m.photo, case when gated then null else m.ig_handle end, m.who, m.verified,
           exists (select 1 from public.kr8_follows x where x.follower = uid and x.followee = m.user_id),
           exists (select 1 from public.kr8_follows x where x.follower = m.user_id and x.followee = uid)
      from public.kr8_follows f
      join public.kr8_members m on m.user_id = case when p_kind = 'followers' then f.follower else f.followee end
     where (case when p_kind = 'followers' then f.followee else f.follower end) = p_user
       and not public.kr8_is_blocked(uid, m.user_id)
       and (not coalesce(m.ghost, false) or public.kr8_is_admin())                          -- m206
       -- m207: an unchecked account is not a face in anyone's list
       and (not public.kr8_face_gate(m.user_id) or public.kr8_is_admin() or m.user_id = uid)
     order by f.created_at desc
     limit 500;
end $function$;

revoke execute on function public.kr8_follow_list(p_user uuid, p_kind text) from public, anon;
grant execute on function public.kr8_follow_list(p_user uuid, p_kind text) to authenticated;

CREATE OR REPLACE FUNCTION public.kr8_invite_try(p_friend uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  f public.kr8_members;
  inv uuid;
  x int := public.kr8_rcfg('invite', 10);
  cap int := public.kr8_rcfg('invite_day_cap', 20);
  join_day_start timestamptz;
  n int := 0;
  w int := 0;
begin
  if x <= 0 then return 0; end if;
  select * into f from public.kr8_members where user_id = p_friend;
  if f.user_id is null or not (public.kr8_invite_first_reel(p_friend) or coalesce(f.verified, false))   /* 19 Nov founder: an approved Reel OR a passed face check */ or lower(coalesce(f.ref_code, '')) !~ '^k0*[0-9]{1,7}$' then
    return 0;
  end if;
  select user_id into inv from public.kr8_members where member_no = substring(lower(f.ref_code) from 2)::int;
  if not coalesce(public.kr8_invite_pair_ok(inv, p_friend), false) then return 0; end if;

  perform pg_advisory_xact_lock(hashtext('kr8_invite:' || inv::text));

  -- T-398 [A-11 + B-17]: always grant the invited friend's welcome Rings once qualified,
  -- and measure inviter's daily cap by the friend's Bangkok join day (never penalising Monday batch Reel approvals!)
  insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id)
  values (p_friend, x, 'invite_welcome', inv::text)
  on conflict do nothing;
  get diagnostics w = row_count;

  if exists (select 1 from public.kr8_rings_ledger where member_id = inv and reason = 'invite' and ref_id = p_friend::text) then
    return case when w > 0 then x else 0 end;
  end if;

  join_day_start := public.kr8_bkk_day_start(coalesce(f.created_at, now()));
  if (
    select count(*)
      from public.kr8_rings_ledger l
      left join public.kr8_members fm on fm.user_id::text = l.ref_id
     where l.member_id = inv
       and l.reason = 'invite'
       and coalesce(fm.created_at, l.created_at) >= join_day_start
       and coalesce(fm.created_at, l.created_at) < join_day_start + interval '1 day'
  ) >= greatest(cap, 0) then
    return case when w > 0 then x else 0 end;
  end if;

  insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id)
  values (inv, x, 'invite', p_friend::text)
  on conflict do nothing;
  get diagnostics n = row_count;
  return case when greatest(n, w) > 0 then x else 0 end;
end $function$;

revoke all on function public.kr8_invite_try(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.kr8_people(p_limit integer DEFAULT 60)
 RETURNS TABLE(user_id uuid, first_name text, photo text, langs text[], bio text, area text, who text, here boolean, verified boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select m.user_id, m.first_name, m.photo, m.langs, m.bio, m.area, m.who,
         coalesce(m.here_until > now(), false), m.verified
  from public.kr8_members m
  cross join (select auth.uid() is not null and public.kr8_is_admin() as yes) adm          -- 0077
  where (exists (select 1 from public.kr8_members me where me.user_id = auth.uid()) or adm.yes)
    and m.user_id <> auth.uid()
    and not public.kr8_is_blocked(auth.uid(), m.user_id)
    and not public.kr8_face_gate(m.user_id)
    and public.kr8_fake_level(m.user_id) <> 'red'                                          /*fake0124*/
    and (adm.yes or not public.kr8_minor_held(m.user_id))                                  -- 0151
    and (adm.yes or m.photo_check is distinct from 'no_face')                              -- 0162
    and (adm.yes or not coalesce(m.ghost, false))                                          -- m206: ghosts are not people
  order by public.kr8_people_score(m.user_id) desc, m.updated_at desc                      -- 0151
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
$function$;

revoke execute on function public.kr8_people(p_limit integer) from public, anon;
grant execute on function public.kr8_people(p_limit integer) to authenticated;

CREATE OR REPLACE FUNCTION public.kr8_tag_candidates(p_q text DEFAULT NULL::text, p_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); q text := lower(btrim(coalesce(p_q, ''))); t boolean; r jsonb; gated boolean;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  t := public.kr8_is_test_member(uid);
  gated := public.kr8_face_gate(uid);   -- m207
  select coalesce(jsonb_agg(jsonb_build_object('user_id', x.user_id, 'first_name', x.first_name, 'photo', x.photo,
                                               'who', x.who, 'area', x.area,
                                               'ig_handle', case when gated then null else x.ig_handle end)
                            order by x.f desc, x.last_active_at desc nulls last), '[]'::jsonb)
    into r
    from (select m.user_id, m.first_name, m.photo, m.who, m.area, m.ig_handle, m.last_active_at,
                 exists (select 1 from public.kr8_follows f where f.follower = uid and f.followee = m.user_id) f
            from public.kr8_members m
           where m.user_id <> uid
             and btrim(coalesce(m.first_name, '')) <> ''
             and coalesce(m.photo, '') <> ''
             and public.kr8_is_test_member(m.user_id) = t
             and not public.kr8_is_blocked(uid, m.user_id)
             and not coalesce(m.ghost, false)                                              -- m206: a ghost cannot be tagged
             and not public.kr8_face_gate(m.user_id)                                       -- m207: an unchecked account cannot be tagged
             and (q = '' or lower(m.first_name) like '%' || replace(replace(q, '%', ''), '_', '') || '%'
                         or lower(coalesce(m.ig_handle, '')) like '%' || replace(replace(q, '%', ''), '_', '') || '%')
           order by 7 desc nulls last
           limit least(greatest(coalesce(p_limit, 30), 1), 60)) x;
  return r;
end $function$;

revoke execute on function public.kr8_tag_candidates(p_q text, p_limit integer) from public, anon;
grant execute on function public.kr8_tag_candidates(p_q text, p_limit integer) to authenticated;

commit;
