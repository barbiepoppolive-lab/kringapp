-- m210 (25 Nov, founder decision: "Unverified profile let them be, just they won't have tick marked on their profile and as such
-- their activity and rings giving ability is automatically restricted.") — APPLY ON GO, together with the face-gate app build.
-- Not applied: it changes what live members see. Today (m207) an unchecked account above #68 is left out of People, follow lists
-- and tagging, and cannot be followed.
-- After this file:
--   · kr8_people, kr8_follow_list, kr8_tag_candidates: unchecked members are listed like everyone else (verified = false, so no ✓).
--     Every other filter stays: blocked, ghost, Fake Finder red, under-18 hold, no-face card photo, test/real split.
--   · kr8_follow: an unchecked member can be followed. Following someone still needs your own face check (unchanged).
--   · face_gate_after_no 68 → 0 (founder: the 6 old unchecked members #68 and below follow the same rule as everyone else:
--     visible, no ✓, and their own posting / chat / say hi / tasks wait for the face check like any new member).
-- What does NOT change (their own activity stays gated, receiving stays closed):
--   · kr8_face_gate and its trigger: an unchecked member still cannot post, answer, say hi, chat, follow or do tasks.
--   · kr8_send_hello / kr8_send_message / kr8_face_gate_trg: nobody can open a chat with an unchecked member (the nudge copy says
--     "so people can say hi to you"). Socials stay hidden from an unchecked viewer (m207).
--   · No Rings or weekly ranking rule changes.
-- UNDO: m210_unverified_visible_GO_UNDO.sql (back to the m207 definitions)
begin;

create or replace function public.kr8_people(p_limit integer default 60)
 returns table(user_id uuid, first_name text, photo text, langs text[], bio text, area text, who text, here boolean, verified boolean)
 language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select m.user_id, m.first_name, m.photo, m.langs, m.bio, m.area, m.who,
         coalesce(m.here_until > now(), false), m.verified
  from public.kr8_members m
  cross join (select auth.uid() is not null and public.kr8_is_admin() as yes) adm          -- 0077
  where auth.uid() is not null
    and (exists (select 1 from public.kr8_members me where me.user_id = auth.uid()) or adm.yes)
    and m.user_id is distinct from auth.uid()
    and not public.kr8_is_blocked(auth.uid(), m.user_id)
    -- m210: an unchecked member is listed (verified = false → no ✓)
    and public.kr8_fake_level(m.user_id) <> 'red'                                          /*fake0124*/
    and (adm.yes or not public.kr8_minor_held(m.user_id))                                  -- 0151
    and (adm.yes or m.photo_check is distinct from 'no_face')                              -- 0162
    and (adm.yes or not coalesce(m.ghost, false))                                          -- m206: ghosts are not people
  order by public.kr8_people_score(m.user_id) desc, m.updated_at desc                      -- 0151
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
$function$;
revoke execute on function public.kr8_people(integer) from public, anon;
grant execute on function public.kr8_people(integer) to authenticated;

create or replace function public.kr8_follow(p_user uuid)
 returns boolean language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if p_user is not distinct from uid then raise exception 'KR8_SELF'; end if;
  if not exists (select 1 from public.kr8_members where user_id = p_user) or public.kr8_is_blocked(uid, p_user) then raise exception 'KR8_NO_PERSON'; end if;
  -- m207: a follow shows the follower's name and photo in the other member's Activity, so the follower needs the face check
  if public.kr8_face_gate(uid) then raise exception 'KR8_VERIFY_FIRST'; end if;
  -- m210: an unchecked member can be followed (they are visible, just without the ✓)
  select count(*) into n from public.kr8_follows where follower = uid and created_at > now() - interval '1 day';
  if n >= 200 then raise exception 'KR8_SLOW_DOWN'; end if;
  insert into public.kr8_follows (follower, followee) values (uid, p_user) on conflict do nothing;
  return true;
end $function$;
revoke execute on function public.kr8_follow(uuid) from public, anon;
grant execute on function public.kr8_follow(uuid) to authenticated;

create or replace function public.kr8_follow_list(p_user uuid, p_kind text)
 returns table(user_id uuid, first_name text, photo text, ig_handle text, who text, verified boolean, i_follow boolean, follows_me boolean)
 language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
declare uid uuid := auth.uid(); gated boolean;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if p_kind not in ('followers', 'following') then raise exception 'KR8_BAD_KIND'; end if;
  if p_user is distinct from uid and public.kr8_is_blocked(uid, p_user) then raise exception 'KR8_NO_PERSON'; end if;
  -- 0184: a private list is shown only to its owner and to the admin
  if p_user is distinct from uid and not public.kr8_is_admin()
     and coalesce((select m.lists_private from public.kr8_members m where m.user_id = p_user), false)
  then raise exception 'KR8_LIST_PRIVATE'; end if;
  gated := public.kr8_face_gate(uid);   -- m207: no socials for an unchecked viewer
  return query
    select m.user_id, m.first_name, m.photo, case when gated then null else m.ig_handle end, m.who, m.verified,
           exists (select 1 from public.kr8_follows x where x.follower = uid and x.followee = m.user_id),
           exists (select 1 from public.kr8_follows x where x.follower = m.user_id and x.followee = uid)
      from public.kr8_follows f
      join public.kr8_members m on m.user_id = case when p_kind = 'followers' then f.follower else f.followee end
     where (case when p_kind = 'followers' then f.followee else f.follower end) = p_user
       and not public.kr8_is_blocked(uid, m.user_id)
       and (not coalesce(m.ghost, false) or public.kr8_is_admin())                          -- m206
       -- m210: unchecked members are listed (verified = false → no ✓)
     order by f.created_at desc
     limit 500;
end $function$;
revoke execute on function public.kr8_follow_list(uuid, text) from public, anon;
grant execute on function public.kr8_follow_list(uuid, text) to authenticated;

create or replace function public.kr8_tag_candidates(p_q text default null::text, p_limit integer default 30)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
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
           where m.user_id is distinct from uid
             and btrim(coalesce(m.first_name, '')) <> ''
             and coalesce(m.photo, '') <> ''
             and public.kr8_is_test_member(m.user_id) = t
             and not public.kr8_is_blocked(uid, m.user_id)
             and not coalesce(m.ghost, false)                                              -- m206: a ghost cannot be tagged
             and not public.kr8_minor_held(m.user_id)                                      -- m210: an under-18 hold is never taggable
             -- m210: an unchecked member can be tagged (visible, no ✓)
             and (q = '' or lower(m.first_name) like '%' || replace(replace(q, '%', ''), '_', '') || '%'
                         or lower(coalesce(m.ig_handle, '')) like '%' || replace(replace(q, '%', ''), '_', '') || '%')
           order by 7 desc nulls last
           limit least(greatest(coalesce(p_limit, 30), 1), 60)) x;
  return r;
end $function$;
revoke execute on function public.kr8_tag_candidates(text, integer) from public, anon;
grant execute on function public.kr8_tag_candidates(text, integer) to authenticated;

update public.kr8_rings_config set value = 0, updated_at = now() where key = 'face_gate_after_no';

commit;
