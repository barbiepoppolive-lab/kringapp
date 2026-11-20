-- UNDO 0164: restore the 0135 version of kr8_canary_watch.
create or replace function public.kr8_canary_watch(p_since timestamptz) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'new_members', coalesce((select jsonb_agg(jsonb_build_object('no', m.member_no, 'name', m.first_name, 'at', m.created_at) order by m.created_at)
        from public.kr8_members m
       where m.created_at > greatest(p_since, now() - interval '1 day') and not coalesce(m.ghost, false) and not public.kr8_is_team(m.user_id)), '[]'::jsonb),
    'members_total', (select count(*) from public.kr8_members m where not coalesce(m.ghost, false) and not public.kr8_is_team(m.user_id)),
    'stuck', coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'code', x.code, 'users', x.users, 'nos', x.nos) order by x.users desc) from (
        select e.kind, max(e.code) as code, count(distinct e.user_id) as users, array_agg(distinct m.member_no) filter (where m.member_no is not null) as nos
          from public.kr8_client_events e left join public.kr8_members m on m.user_id = e.user_id
         where e.created_at > now() - interval '30 minutes'
           and (e.kind like '%fail%' or e.kind in ('card_photo_no', 'verify_aws_retry'))
         group by e.kind having count(distinct e.user_id) >= 3) x), '[]'::jsonb),
    'now', now())
$$;
revoke all on function public.kr8_canary_watch(timestamptz) from public, anon, authenticated;
grant execute on function public.kr8_canary_watch(timestamptz) to service_role;
