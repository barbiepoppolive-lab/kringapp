-- Dry run on today's real data: who would win at 23:59 Bangkok. Ends with an exception, so nothing is written.
do $t$
declare r jsonb; nm jsonb; d0 date := public.kr8_bkk_day(now());
begin
  r := public.kr8_daily_bonus_pick(d0, false, now());
  select jsonb_agg(jsonb_build_object('member_no', m.member_no, 'name', m.first_name, 'rings_today', x.rings, 'at_bkk', x.last_at at time zone 'Asia/Bangkok',
                   'ok', coalesce(m.verified,false) and not public.kr8_is_team(x.member_id) and not public.kr8_is_test_member(x.member_id)) order by x.rings desc, x.last_at)
    into nm from public.kr8_day_rings(d0, false, now()) x join public.kr8_members m on m.user_id = x.member_id;
  raise exception 'RESULT %', jsonb_build_object('now_bkk', now() at time zone 'Asia/Bangkok', 'pick', r, 'today_all', nm,
    'names', (select jsonb_object_agg(m.user_id, m.member_no || ' ' || m.first_name) from public.kr8_members m
               where m.user_id::text in (select e->>'member_id' from jsonb_array_elements(r->'top') e union select r->'climber'->>'member_id')));
end $t$;
