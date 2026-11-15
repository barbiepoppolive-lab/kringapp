-- 0053 · "All members" list with photos on the admin Members tab (15 Nov 2026).
--
-- UNDO: drop function if exists public.kr8_admin_member_list(int, boolean);
--
-- ADDITIVE: one new admin-only function. No table, view, trigger, policy or existing function is touched.
-- Reads public.kr8_members and public.kr8_posts (Reels link to members by kr8_posts.author, kind = 'reel').
-- photo is stored inline on the member row (a data:image/...;base64 URL or an https:// URL), so it is returned as is;
-- the browser shows it directly, no storage signing needed.
-- Test/demo members (public.kr8_is_test_member: first name with "test", join code test1/perf/demo,
-- demo-…@kringapp.com email) are left out unless p_include_test is true.
-- Reel counts: approved = status approved and not hidden; waiting = status pending and not hidden;
-- hidden = status hidden or the hidden flag set.

create or replace function public.kr8_admin_member_list(p_limit int default 100, p_include_test boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  with m as (
    select m.*, public.kr8_is_test_member(m.user_id) as is_test
    from public.kr8_members m
  ),
  shown as (
    select * from m where p_include_test or not is_test
  ),
  reels as (
    select p.author,
           count(*) filter (where p.status = 'approved' and not coalesce(p.hidden, false))::int as approved,
           count(*) filter (where p.status = 'pending' and not coalesce(p.hidden, false))::int as waiting,
           count(*) filter (where p.status = 'hidden' or coalesce(p.hidden, false))::int as hidden
    from public.kr8_posts p
    where p.kind = 'reel' and p.author in (select user_id from shown)
    group by p.author
  ),
  page as (
    select * from shown order by created_at desc nulls last limit greatest(1, least(coalesce(p_limit, 100), 500))
  )
  select jsonb_build_object(
    'total', (select count(*)::int from shown),
    'test_hidden', case when p_include_test then 0 else (select count(*)::int from m where is_test) end,
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', s.user_id,
        'member_no', s.member_no,
        'first_name', s.first_name,
        'photo', nullif(s.photo, ''),
        'joined_at', s.created_at,
        'ref_code', nullif(s.ref_code, ''),
        'src_code', nullif(s.src_code, ''),
        'who', s.who,
        'area', s.area,
        'langs', to_jsonb(s.langs),
        'gender', s.gender,
        'show_gender', coalesce(s.show_gender, false),
        'ig_handle', nullif(s.ig_handle, ''),
        'tiktok_handle', nullif(s.tiktok_handle, ''),
        'bio', nullif(s.bio, ''),
        'interests', to_jsonb(s.interests),
        'verified', coalesce(s.verified, false),
        'age_ok', s.age_ok_at is not null,
        'terms_ok', s.terms_accepted_at is not null,
        'last_active_at', s.last_active_at,
        'reels_approved', coalesce(r.approved, 0),
        'reels_waiting', coalesce(r.waiting, 0),
        'reels_hidden', coalesce(r.hidden, 0),
        'card_complete', coalesce(s.photo, '') <> '' and btrim(coalesce(s.first_name, '')) <> '' and btrim(coalesce(s.area, '')) <> '',
        'is_test', s.is_test
      ) order by s.created_at desc nulls last)
      from page s left join reels r on r.author = s.user_id), '[]'::jsonb)
  ) into r;
  return r;
end $$;

revoke all on function public.kr8_admin_member_list(int, boolean) from public, anon;
grant execute on function public.kr8_admin_member_list(int, boolean) to authenticated;
