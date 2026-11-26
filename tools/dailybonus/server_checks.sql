-- Daily bonus server checks (m228/m229). Everything runs in one DO block that ends by raising its results, so NOTHING is written to live.
do $t$
declare d0 date := public.kr8_bkk_day(now()); sun date; r jsonb; r2 jsonb; res jsonb := '{}'::jsonb; n int; n2 int; ok boolean; x record;
        bad jsonb := '[]'::jsonb; fp jsonb; w0 timestamptz := public.kr8_week_start(now()); b_before int; b_after int; checked int := 0; cat timestamptz;
begin
  sun := (public.kr8_week_start(now()) at time zone 'Asia/Bangkok')::date - 1;
  delete from public.kr8_daily_rings; delete from public.kr8_daily_rings_days;
  execute format($f$
  CREATE OR REPLACE FUNCTION public.kr8_day_rings(p_day date, p_test boolean, p_asof timestamptz DEFAULT NULL)
   RETURNS TABLE(member_id uuid, rings integer, last_at timestamptz) LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $b$
    select v.m::uuid, v.r, v.t::timestamptz from (values
      ('bcf5dbf1-2ce4-48dd-abc7-e87df15ef570', 50, '%1$s 01:00+07', '%1$s'::date),  -- unverified
      ('fd5cca36-9be2-4dde-9d7d-2dd9c898deaa', 40, '%1$s 01:00+07', '%1$s'::date),  -- team
      ('11111111-1111-4111-8111-000000000001', 45, '%1$s 01:00+07', '%1$s'::date),  -- test member
      ('474b8497-2bad-47d1-9b39-68ebc780f717', 30, '%1$s 10:00+07', '%1$s'::date),  -- A
      ('0a21313a-b688-43d2-87ce-2d611fc7dbed', 20, '%1$s 09:00+07', '%1$s'::date),  -- B (tie, later)
      ('8276541f-2826-4a05-89a3-e054e593dcd7', 20, '%1$s 08:00+07', '%1$s'::date),  -- C (tie, earlier)
      ('bc870ff0-21af-42a0-87de-b2c90eefe161', 15, '%1$s 07:00+07', '%1$s'::date),  -- D 4th -> climber (avg 0, +15)
      ('fe108558-66ad-4620-b844-20862b5011ef',  9, '%1$s 07:00+07', '%1$s'::date),  -- E under 10: not top 3, climber +9
      ('302eb9d3-b43f-47a4-b729-e1bc1f3cb3ed', 12, '%1$s 07:00+07', '%1$s'::date),  -- F avg 10 -> +2
      ('1627f2f0-0830-4c28-b7fd-62768f98e69b',  4, '%1$s 07:00+07', '%1$s'::date),  -- G under 5
      ('474b8497-2bad-47d1-9b39-68ebc780f717', 25, '%2$s 22:00+07', '%2$s'::date))  -- Sunday: A
      v(m, r, t, d) where not p_test and v.d = p_day
    union all
    select '302eb9d3-b43f-47a4-b729-e1bc1f3cb3ed'::uuid, 10, (p_day::text || ' 12:00+07')::timestamptz
     where not p_test and p_day between '%1$s'::date - 7 and '%1$s'::date - 1 and p_day <> '%2$s'::date
  $b$ $f$, d0, sun);

  -- 1. switch off: nothing paid
  r := public.kr8_daily_bonus_run(false, d0);
  res := res || jsonb_build_object('switch_off_skips', r->>'skipped' = 'off');
  update public.kr8_rings_config set value = 1 where key = 'daily_bonus_on';

  -- 2. qualify + ties + climber
  r := public.kr8_daily_bonus_pick(d0, false, now());
  res := res || jsonb_build_object('pick', r,
    'top1_A', r->'top'->0->>'member_id' = '474b8497-2bad-47d1-9b39-68ebc780f717',
    'tie_earlier_C_2nd', r->'top'->1->>'member_id' = '8276541f-2826-4a05-89a3-e054e593dcd7',
    'tie_later_B_3rd', r->'top'->2->>'member_id' = '0a21313a-b688-43d2-87ce-2d611fc7dbed',
    'unverified_team_test_excluded', not exists (select 1 from jsonb_array_elements(r->'top') e where e->>'member_id' in
        ('bcf5dbf1-2ce4-48dd-abc7-e87df15ef570', 'fd5cca36-9be2-4dde-9d7d-2dd9c898deaa', '11111111-1111-4111-8111-000000000001')),
    'climber_D_not_top3', r->'climber'->>'member_id' = 'bc870ff0-21af-42a0-87de-b2c90eefe161',
    'bonuses_10_6_3_5', (r->'top'->0->>'bonus')::int = 10 and (r->'top'->1->>'bonus')::int = 6 and (r->'top'->2->>'bonus')::int = 3 and (r->'climber'->>'bonus')::int = 5);

  -- 3. pay + idempotency
  r := public.kr8_daily_bonus_run(false, d0);
  select count(*) into n from public.kr8_rings_ledger where reason in ('daily_top', 'daily_climb') and ref_id = 'day:' || d0;
  r2 := public.kr8_daily_bonus_run(false, d0);
  select count(*) into n2 from public.kr8_rings_ledger where reason in ('daily_top', 'daily_climb') and ref_id = 'day:' || d0;
  res := res || jsonb_build_object('paid_4', (r->>'paid')::int = 4 and n = 4, 'rerun_skips', r2->>'skipped' = 'done', 'rerun_no_new_rows', n2 = 4,
    'sum_paid', (select sum(delta) from public.kr8_rings_ledger where reason in ('daily_top', 'daily_climb') and ref_id = 'day:' || d0));
  -- outside the task cap: bonus rows are their own reasons, the task ledger sum is untouched
  res := res || jsonb_build_object('not_task_reason', not exists (select 1 from public.kr8_rings_ledger where ref_id = 'day:' || d0 and reason = 'task'));

  -- 4. Sunday: bonus lands inside the week before it closes
  select b.rings into b_before from public.kr8_week_board(w0 - interval '7 days', false) b where b.member_id = '474b8497-2bad-47d1-9b39-68ebc780f717';
  r := public.kr8_daily_bonus_run(false, sun);
  select created_at into cat from public.kr8_rings_ledger where reason = 'daily_top' and ref_id = 'day:' || sun and member_id = '474b8497-2bad-47d1-9b39-68ebc780f717';
  select b.rings into b_after from public.kr8_week_board(w0 - interval '7 days', false) b where b.member_id = '474b8497-2bad-47d1-9b39-68ebc780f717';
  res := res || jsonb_build_object('sunday', sun, 'sunday_paid_at_bkk', cat at time zone 'Asia/Bangkok',
    'sunday_inside_old_week', cat < w0 and cat >= w0 - interval '7 days',
    'sunday_board_plus10', coalesce(b_after, 0) - coalesce(b_before, 0) = 10,
    'late_run_day_ok', public.kr8_bkk_day(((d0 + 1)::timestamp at time zone 'Asia/Bangkok') + interval '1 minute' - interval '3 minutes') = d0);

  -- 5. fair play = board for every real member on this week's board (with the bonus rows in)
  perform public.kr8_week_board_refresh();
  for x in select b.member_id, b.rings from public.kr8_week_board(w0, false) b loop
    perform set_config('request.jwt.claim.sub', x.member_id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', x.member_id, 'role', 'authenticated')::text, true);
    fp := public.kr8_fair_play(x.member_id);
    checked := checked + 1;
    if (fp->>'rings')::int <> x.rings or (fp->>'lag')::int <> 0 then
      bad := bad || jsonb_build_object('m', x.member_id, 'board', x.rings, 'fp', fp->>'rings', 'lag', fp->>'lag');
    end if;
    if x.member_id = '474b8497-2bad-47d1-9b39-68ebc780f717' then res := res || jsonb_build_object('fp_A_daily_top', fp->'daily_top'); end if;
    if x.member_id = 'bc870ff0-21af-42a0-87de-b2c90eefe161' then res := res || jsonb_build_object('fp_D_daily_climb', fp->'daily_climb'); end if;
  end loop;
  res := res || jsonb_build_object('fairplay_checked', checked, 'fairplay_mismatch', bad);
  raise exception 'RESULT %', res;
end $t$;
