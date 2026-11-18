-- 0108 · Morning brief "errors 24h" counts real problems only (18 Nov 2026, errfix-1).
--
-- WHY: the brief showed "63 app errors in the last 24 hours". 0099 counted EVERY row of kr8_client_events, but that table is also
-- the phone's activity log: 44 of the 66 rows on 18 Nov 09:38 IST were normal events (reel_open = someone opened the Reel picker,
-- reel_trim open/done = used the trim step). Another 7 came from the two ghosted duplicate accounts (#53, #58) being refused on
-- purpose, 1 was a member saying "no" to the camera, 2 were the face check switching to its simple mode (not a failure).
-- Real failures from real members that day: 12 rows from 4 members.
--
-- WHAT: ADDITIVE & RE-RUNNABLE (create or replace only, no table changes).
--   1. kr8_client_event_is_error(kind, code): true for real failures only.
--        counts:  *_fail kinds (reel_pick_fail, reel_publish_fail, verify_fail, verify_live_fail, verify_simple_fail,
--                 claim_face_fail, ...) and reel_trim 'fail:...'
--        skips:   activity (reel_open, reel_trim open/done/back, verify_simple, verify_tracker_switch),
--                 GHOST (account blocked on purpose), NotAllowedError (the member tapped "Don't allow" on the camera)
--   2. kr8_admin_morning_brief = 0099's body (identical to live, prosrc md5 1410a961… checked 18 Nov) with ONLY these changes:
--        err_client counts kr8_client_event_is_error rows from real members (kr8_admin_v2_kind real/nocard, like the other tiles),
--        new err_people (how many members), shown in the detail line and as errors.client_people_24h; the tile turns red when
--        3+ members hit an error (was: 10+ rows, which one member re-tapping Retry could reach alone).
--   The Problems page (kr8_admin_client_events) is NOT changed: it still lists every row.
--
-- UNDO: re-run the kr8_admin_morning_brief block of 0099_kr8_autopilot2_m2.sql; drop function public.kr8_client_event_is_error(text, text);

create or replace function public.kr8_client_event_is_error(p_kind text, p_code text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_kind is null then false
    when p_kind = 'reel_trim' then coalesce(p_code, '') like 'fail:%'
    when p_kind !~ '_fail$' then false
    when coalesce(p_code, '') = 'GHOST' or coalesce(p_code, '') like 'KR8_GHOST%' then false
    when coalesce(p_code, '') = 'NotAllowedError' then false
    else true
  end
$$;
revoke all on function public.kr8_client_event_is_error(text, text) from public;
grant execute on function public.kr8_client_event_is_error(text, text) to authenticated;

create or replace function public.kr8_admin_morning_brief(p_include_test boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d0 timestamptz := ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
  t24 timestamptz := now() - interval '24 hours';
  t7d timestamptz := now() - interval '7 days';
  real_total int := 0;
  real_today int := 0;
  fc_today int := 0;
  fc_pass int := 0;
  fc_waiting int := 0;
  fc_refused int := 0;
  reels_today int := 0;
  reels_waiting int := 0;
  reels_live int := 0;
  asks_today int := 0;
  held_n int := 0;
  held_thb int := 0;
  avail_codes int := 0;
  burn_7d int := 0;
  daily_burn numeric := 0;
  days_left numeric := null;
  err_client int := 0;
  err_people int := 0;
  err_outbox int := 0;
  err_robot int := 0;
  err_total int := 0;
  stale_hb int := 0;
  open_reports int := 0;
  robot_today int := 0;
  all_alerts jsonb := '[]'::jsonb;
  top3 jsonb := '[]'::jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  -- 1. Real members (strictly real count via kr8_admin_v2_kind = 'real', NEVER member_no)
  select count(*) filter (where public.kr8_admin_v2_kind(m.user_id) = 'real')::int,
         count(*) filter (where public.kr8_admin_v2_kind(m.user_id) = 'real' and m.created_at >= d0)::int
    into real_total, real_today
  from public.kr8_members m;

  -- 2. Face checks
  select count(*) filter (where v.created_at >= d0)::int,
         count(*) filter (where v.created_at >= d0 and v.status = 'approved')::int,
         count(*) filter (where v.status = 'pending')::int,
         count(*) filter (where v.created_at >= d0 and v.status = 'rejected')::int
    into fc_today, fc_pass, fc_waiting, fc_refused
  from public.kr8_verifications v
  where p_include_test or public.kr8_admin_v2_kind(v.user_id) in ('real', 'nocard');

  -- 3. Posts (Reels + Ask a Thai)
  select count(*) filter (where p.kind = 'reel' and p.created_at >= d0)::int,
         count(*) filter (where p.kind = 'reel' and p.status = 'pending' and not p.hidden)::int,
         count(*) filter (where p.kind = 'reel' and p.status = 'approved' and not p.hidden)::int,
         count(*) filter (where p.kind <> 'reel' and p.created_at >= d0)::int
    into reels_today, reels_waiting, reels_live, asks_today
  from public.kr8_posts p
  where p_include_test or public.kr8_admin_v2_kind(p.author) = 'real';

  -- 4. Held payouts (฿)
  select count(*)::int, coalesce(sum(c.amount_thb), 0)::int
    into held_n, held_thb
  from public.kr8_reward_claims c
  where c.held and c.status = 'pending' and (p_include_test or not c.is_test);

  -- 5. Voucher stock & 7-day burn rate -> DAYS LEFT
  select count(*)::int into avail_codes
  from public.kr8_reward_codes k
  where k.status = 'available' and (p_include_test or not k.is_test);

  select count(*)::int into burn_7d
  from public.kr8_reward_claims c
  where c.status = 'assigned'
    and (p_include_test or not c.is_test)
    and coalesce(c.assigned_at, c.created_at) >= t7d;

  daily_burn := round((burn_7d::numeric / 7.0), 2);
  if avail_codes = 0 then
    days_left := 0;
  elsif burn_7d > 0 then
    days_left := round((avail_codes::numeric / (burn_7d::numeric / 7.0)), 1);
  else
    days_left := null;
  end if;

  -- 6. Errors in last 24h (client phone errors + failed outbox alerts + failed robot heartbeats)
  if to_regclass('public.kr8_client_events') is not null then
    -- 0108: only real failures (kr8_client_event_is_error), only real members (same rule as the rest of the brief)
    select count(*)::int, count(distinct e.user_id)::int into err_client, err_people
    from public.kr8_client_events e
    where e.created_at >= t24
      and public.kr8_client_event_is_error(e.kind, e.code)
      and (p_include_test or e.user_id is null or public.kr8_admin_v2_kind(e.user_id) in ('real', 'nocard'));
  end if;
  if to_regclass('public.kr8_outbox') is not null then
    select count(*)::int into err_outbox from public.kr8_outbox o where o.created_at >= t24 and o.last_error is not null;
  end if;
  select count(*)::int into err_robot
  from public.kr8_robot r
  where r.last_ok = false and r.last_run >= t24;

  err_total := err_client + err_outbox + err_robot;

  select count(*)::int into stale_hb
  from public.kr8_heartbeat h
  where (h.last_beat is not null and h.last_beat < now() - make_interval(secs => greatest(h.every_sec * 2, 1200)))
     or h.last_ok = false;

  select count(*)::int into open_reports from public.kr8_reports rp where rp.handled_at is null;
  select count(*)::int into robot_today from public.kr8_robot_log l where l.at >= d0;

  -- 7. Unified prioritised Alert Centre list (stored robot alerts + live synthesized signals without duplicate keys)
  with stored as (
    select
      a.id::text as id,
      a.dedupe_key,
      a.robot,
      a.severity,
      a.title,
      a.body,
      a.href,
      a.last_at as at,
      false as synthetic
    from public.kr8_robot_alerts a
    where a.cleared_at is null
  ),
  synth as (
    select 'syn:hb'::text as id, 'sys:heartbeat_stale'::text as dedupe_key, 'health_watch'::text as robot, 'red'::text as severity,
           (stale_hb || ' robot heartbeat' || case when stale_hb = 1 then ' is' else 's are' end || ' late or failing')::text as title,
           'Open Autopilot to check pg_cron schedule and run a health pulse.'::text as body,
           '#autopilot'::text as href, now() as at, true as synthetic
    where stale_hb > 0
    union all
    select 'syn:stock_low', 'sys:voucher_stock_low', 'self_fix',
           case when avail_codes <= 2 then 'red' else 'amber' end,
           'Voucher stock low: ' || avail_codes || ' code' || case when avail_codes = 1 then '' else 's' end || ' left'
             || case when days_left is not null then ' (~' || days_left || 'd left)' else '' end,
           'Top up TrueMoney / Grab codes before winners claim.',
           '#codes', now(), true
    where avail_codes <= 5
    union all
    select 'syn:held', 'sys:held_claims', 'protect', 'amber',
           held_n || ' held payout' || case when held_n = 1 then '' else 's' end || ' (฿' || held_thb || ') waiting for your tap',
           'Money Robot scored each held claim — tap Pay or Refuse below.',
           '#inbox', now(), true
    where held_n > 0
    union all
    select 'syn:reports', 'sys:open_reports', 'protect', 'amber',
           open_reports || ' open member report' || case when open_reports = 1 then '' else 's' end || ' waiting',
           'Check reported Reels or members and decide.',
           '#q/reports', now(), true
    where open_reports > 0
    union all
    select 'syn:errors', 'sys:errors_24h', 'health_watch',
           case when err_robot > 0 or err_people >= 3 then 'red' else 'amber' end,
           err_total || ' error' || case when err_total = 1 then '' else 's' end || ' logged in the last 24 hours',
           err_client || ' phone error(s) from ' || err_people || ' member(s) · ' || err_outbox || ' outbox error(s) · ' || err_robot || ' robot error(s).',
           '#problems', now(), true
    where err_total > 0
    union all
    select 'syn:fyi', 'sys:robot_activity_today', 'self_fix', 'grey',
           robot_today || ' robot log entr' || case when robot_today = 1 then 'y' else 'ies' end || ' recorded today',
           'Tap to review switches, dry-runs, and Undo buttons.',
           '#autopilot', now(), true
    where robot_today > 0
  ),
  combined as (
    select * from stored
    union all
    select y.* from synth y where not exists (select 1 from stored s where s.dedupe_key = y.dedupe_key)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'dedupe_key', c.dedupe_key,
    'robot', c.robot,
    'severity', c.severity,
    'title', c.title,
    'body', c.body,
    'href', c.href,
    'at', c.at,
    'synthetic', c.synthetic
  ) order by
    case c.severity when 'red' then 1 when 'amber' then 2 else 3 end,
    c.at desc
  ), '[]'::jsonb) into all_alerts
  from combined c;

  -- 8. "3 things that need you" (red & amber items first, plus pending face checks / Reels if slots remain)
  with candidates as (
    select
      x ->> 'severity' as severity,
      x ->> 'title' as title,
      x ->> 'body' as sub,
      x ->> 'href' as href,
      1 as prio,
      ord
    from jsonb_array_elements(all_alerts) with ordinality as t(x, ord)
    where (x ->> 'severity') in ('red', 'amber')
    union all
    select 'amber', fc_waiting || ' face check' || case when fc_waiting = 1 then '' else 's' end || ' waiting for your eye',
           'Unclear instant check — approve or reject.', '#inbox', 2, 100
    where fc_waiting > 0
    union all
    select 'amber', reels_waiting || ' Reel' || case when reels_waiting = 1 then '' else 's' end || ' waiting for approval',
           'Watch and approve in one tap.', '#inbox', 3, 200
    where reels_waiting > 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'severity', c.severity,
    'title', c.title,
    'sub', c.sub,
    'href', c.href
  ) order by c.prio, c.ord), '[]'::jsonb)
  into top3
  from (select * from candidates order by prio, ord limit 3) c;

  return jsonb_build_object(
    'at', now(),
    'day_start', d0,
    'alerts', all_alerts,
    'brief', jsonb_build_object(
      'new_members', jsonb_build_object('today', real_today, 'total', real_total),
      'face_checks', jsonb_build_object('today', fc_today, 'pass', fc_pass, 'waiting', fc_waiting, 'refused', fc_refused),
      'posts', jsonb_build_object('reels_today', reels_today, 'reels_waiting', reels_waiting, 'reels_live', reels_live, 'asks_today', asks_today),
      'held_payouts', jsonb_build_object('count', held_n, 'thb', held_thb),
      'voucher_stock', jsonb_build_object('available', avail_codes, 'burn_7d', burn_7d, 'daily_burn', daily_burn, 'days_left', days_left),
      'errors', jsonb_build_object('client_24h', err_client, 'client_people_24h', err_people, 'outbox_failed_24h', err_outbox, 'robot_failed_24h', err_robot, 'total', err_total),
      'top3_needs_you', top3
    )
  );
end $$;
