-- 0087 · Admin People tab sort + step chips (17 Nov 2026).
--
-- READ-ONLY and ADDITIVE: one new admin-only function, nothing dropped, renamed or written.
--   · kr8_admin_v2_people_extra()  rides next to kr8_admin_v2_snapshot (0082) and adds, per card:
--       real_photo  = a real uploaded photo: a base64 data URL longer than 200 chars whose photo_check is ok (or older cards: not set)
--       step inputs = latest Reel (status / note), Founding + weekly prizes still "won", open claims, latest face check status
--     plus the "Removed" list (ghost = demo + duplicates, and test cards), the admin sign-ins without a card,
--     and one set of counts that the People header AND the Today tab both read.
-- Kring Team (kr8_is_team) is never a member, never removed, never counted.
--
-- UNDO: drop function public.kr8_admin_v2_people_extra();

begin;

create or replace function public.kr8_admin_v2_people_extra()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  with k as materialized (
    select m.user_id, public.kr8_admin_v2_kind(m.user_id) as kind, m.member_no, m.first_name, m.created_at, m.ghost,
           coalesce(m.photo like 'data:image/%' and length(m.photo) > 200 and coalesce(m.photo_check, 'ok') = 'ok', false) as real_photo   -- no photo = false, never null
    from public.kr8_members m
  ),
  nocard as materialized (
    select u.id as user_id, public.kr8_admin_v2_kind(u.id) as kind, u.created_at, u.email
    from auth.users u where not exists (select 1 from public.kr8_members m where m.user_id = u.id)
  )
  select jsonb_build_object(
    'counts', jsonb_build_object(
        'members', (select count(*) from k where kind = 'real'),
        'with_photo', (select count(*) from k where kind = 'real' and real_photo),
        'no_photo', (select count(*) from k where kind = 'real' and not real_photo),
        'nocard', (select count(*) from nocard where kind in ('nocard', 'admin')),
        'removed', (select count(*) from k where kind in ('ghost', 'test')),
        'team', (select count(*) from k where kind = 'team')),
    'rows', coalesce((select jsonb_object_agg(k.user_id, jsonb_build_object(
        'real_photo', k.real_photo,
        'reel', (select jsonb_build_object('status', case when x.hidden or x.status = 'hidden' then 'hidden' else x.status end,
                   'note', case when x.hidden or x.status = 'hidden' then x.review_note end, 'at', x.created_at)
                 from public.kr8_posts x where x.author = k.user_id and x.kind = 'reel' order by x.created_at desc limit 1),
        'won', coalesce((select jsonb_agg(jsonb_build_object('kind', z.kind, 'amount', z.amount_thb, 'status', z.status))
                 from public.kr8_prizes z where z.member_id = k.user_id and z.status = 'won' and not z.is_test), '[]'::jsonb),
        'open_claims', (select count(*) from public.kr8_reward_claims c where c.member_id = k.user_id and c.status = 'pending' and not c.is_test),
        'check', (select v.status from public.kr8_verifications v where v.user_id = k.user_id order by v.created_at desc limit 1)))
      from k where k.kind = 'real'), '{}'::jsonb),
    'removed', coalesce((select jsonb_agg(jsonb_build_object('user_id', k.user_id, 'no', k.member_no, 'name', k.first_name, 'joined_at', k.created_at,
        'why', case when k.kind = 'test' then 'demo' when k.ghost then 'removed' else k.kind end) order by k.created_at desc)
      from k where k.kind in ('ghost', 'test')), '[]'::jsonb),
    'admins', coalesce((select jsonb_agg(jsonb_build_object('user_id', n.user_id, 'joined_at', n.created_at,
        'email_hint', left(split_part(n.email, '@', 1), 2) || '…@' || split_part(n.email, '@', 2)) order by n.created_at desc)
      from nocard n where n.kind = 'admin'), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.kr8_admin_v2_people_extra() from public, anon;
grant execute on function public.kr8_admin_v2_people_extra() to authenticated;

commit;
