-- m229 (26 Nov): daily bonus safety for the Sunday close.
--   1) kr8_daily_bonus_run with no day pays the Bangkok day of (now - 3 min), so a cron run that starts late (after midnight) still pays the right day.
--   2) kr8_close_week cron (Mon 00:01 Bangkok) first runs Sunday's daily bonus (no-op if already paid or switched off), so the bonus is always inside the week before the board closes.
begin;
CREATE OR REPLACE FUNCTION public.kr8_daily_bonus_run(p_test boolean, p_day date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare d date := coalesce(p_day, public.kr8_bkk_day(now() - interval '3 minutes')); d1 timestamptz; at_ timestamptz; pk jsonb; x jsonb; n int := 0;
begin
  if not p_test and public.kr8_rcfg('daily_bonus_on', 0) <> 1 then return jsonb_build_object('skipped', 'off'); end if;
  if d > public.kr8_bkk_day() then return jsonb_build_object('skipped', 'future'); end if;
  perform pg_advisory_xact_lock(hashtext('kr8_daily_bonus:' || p_test::text));
  if exists (select 1 from public.kr8_daily_bonus b where b.day = d and b.is_test = p_test)
     or exists (select 1 from public.kr8_rings_ledger l where l.reason in ('daily_top', 'daily_climb') and l.ref_id = 'day:' || d
                and public.kr8_is_test_member(l.member_id) = p_test) then
    return jsonb_build_object('skipped', 'done', 'day', d);
  end if;
  d1 := ((d + 1)::timestamp at time zone 'Asia/Bangkok');
  at_ := least(now() - interval '1 second', d1 - interval '1 second');   -- inside day d, so inside its week (Sunday lands before the close); before the board refresh that follows
  pk := public.kr8_daily_bonus_pick(d, p_test, at_);
  for x in select * from jsonb_array_elements(pk->'top') loop
    insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id, created_at)
      values ((x->>'member_id')::uuid, (x->>'bonus')::int, 'daily_top', 'day:' || d, at_) on conflict do nothing;
    insert into public.kr8_daily_bonus (day, is_test, kind, member_id, rings_day, bonus, paid_at)
      values (d, p_test, 'top' || (x->>'rank'), (x->>'member_id')::uuid, (x->>'rings')::int, (x->>'bonus')::int, at_) on conflict do nothing;
    n := n + 1;
  end loop;
  if pk->'climber' is not null and jsonb_typeof(pk->'climber') = 'object' then
    x := pk->'climber';
    insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id, created_at)
      values ((x->>'member_id')::uuid, (x->>'bonus')::int, 'daily_climb', 'day:' || d, at_) on conflict do nothing;
    insert into public.kr8_daily_bonus (day, is_test, kind, member_id, rings_day, avg7, bonus, paid_at)
      values (d, p_test, 'climb', (x->>'member_id')::uuid, (x->>'rings')::int, (x->>'avg7')::numeric, (x->>'bonus')::int, at_) on conflict do nothing;
    n := n + 1;
  end if;
  return jsonb_build_object('day', d, 'paid', n, 'pick', pk);
end $function$;

revoke execute on function public.kr8_daily_bonus_run(boolean, date) from public, anon, authenticated;
select cron.unschedule('kr8_close_week');
select cron.schedule('kr8_close_week', '1 17 * * 0', $c$select public.kr8_daily_bonus_run(false, public.kr8_bkk_day(now()) - 1); select public.kr8_daily_bonus_run(true, public.kr8_bkk_day(now()) - 1); select public.kr8_close_week()$c$);
commit;
