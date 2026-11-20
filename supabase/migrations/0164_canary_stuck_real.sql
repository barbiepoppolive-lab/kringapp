-- 0164 (20 Nov): the 5-minute canary's "members stuck" alert fired falsely at 12:05 IST: #23, #152 and #307 each had ONE normal
-- face-check retry with DIFFERENT reasons (eyes_closed, many_faces, turn_right_missing) and two of them passed seconds later;
-- #307 was a second account of #23 (same face). Now a member only counts as stuck on a step when they failed it at least twice
-- in the last 30 min AND have not since passed it (face check passed / verified / got a "review" result such as a same-face
-- second account). Grouped by step + reason so the alert names the real reason. Test members are ignored.
create or replace function public.kr8_canary_watch(p_since timestamptz) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'new_members', coalesce((select jsonb_agg(jsonb_build_object('no', m.member_no, 'name', m.first_name, 'at', m.created_at) order by m.created_at)
        from public.kr8_members m
       where m.created_at > greatest(p_since, now() - interval '1 day') and not coalesce(m.ghost, false) and not public.kr8_is_team(m.user_id)), '[]'::jsonb),
    'members_total', (select count(*) from public.kr8_members m where not coalesce(m.ghost, false) and not public.kr8_is_team(m.user_id)),
    'stuck', coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'code', x.code, 'users', x.users, 'nos', x.nos) order by x.users desc) from (
        select f.kind, f.code, count(*) as users, array_agg(f.member_no order by f.member_no) filter (where f.member_no is not null) as nos
          from (
            select e.kind, coalesce(e.code, '') as code, e.user_id, max(m.member_no) as member_no, max(e.created_at) as last_fail
              from public.kr8_client_events e left join public.kr8_members m on m.user_id = e.user_id
             where e.created_at > now() - interval '30 minutes'
               and (e.kind like '%fail%' or e.kind in ('card_photo_no', 'verify_aws_retry'))
               and e.user_id is not null
               and not public.kr8_is_test_member(e.user_id)
             group by e.kind, coalesce(e.code, ''), e.user_id
            having count(*) >= 2) f
         where not (f.kind like 'verify%' and (
                 exists (select 1 from public.kr8_members v where v.user_id = f.user_id and v.verified)
              or exists (select 1 from public.kr8_face_decisions d where d.user_id = f.user_id
                           and d.decision in ('pass', 'review') and d.created_at > f.last_fail - interval '5 minutes')))
         group by f.kind, f.code
        having count(*) >= 3) x), '[]'::jsonb),
    'now', now())
$$;
revoke all on function public.kr8_canary_watch(timestamptz) from public, anon, authenticated;
grant execute on function public.kr8_canary_watch(timestamptz) to service_role;
