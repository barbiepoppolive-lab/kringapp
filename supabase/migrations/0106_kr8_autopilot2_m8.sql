-- 0105 · Kring Autopilot v2 — M8: Nightly Self-Test Recorder & Alert Reconciler
--
-- ADDITIVE & RE-RUNNABLE (idempotent). Built on live-base (8a29fdb) + 0098..0104.
-- Implements:
--   1. Admin RPC public.kr8_admin_record_selftest(p_ok, p_steps, p_ms) called by tools/autopilot_selftest.mjs:
--      - Writes pass/fail into public.kr8_robot_log (robot = 'nightly_selftest')
--      - Updates kr8_robot ('nightly_selftest') and kr8_heartbeat ('kr8_nightly_selftest')
--      - Raises RED alert 'selftest:nightly' when p_ok = false, and auto-clears it when p_ok = true.
--   2. Admin RPC public.kr8_admin_latest_selftest() returning the latest nightly_selftest run from kr8_robot_log.
--
-- UNDO:
--   begin;
--   delete from public.kr8_heartbeat where job = 'kr8_nightly_selftest';
--   delete from public.kr8_robot_alerts where dedupe_key = 'selftest:nightly';
--   drop function if exists public.kr8_admin_latest_selftest();
--   drop function if exists public.kr8_admin_record_selftest(boolean, jsonb, integer);
--   commit;

begin;

insert into public.kr8_robot (name, title, note, mode, daily_cap, schedule)
values (
  'nightly_selftest',
  'Nightly self-test',
  'Playwright local test-copy core journey (test4 Feed/People/Board + admin Today/Needs you/Autopilot) writing pass/fail to kr8_robot_log.',
  'dry_run',
  10,
  '30 21 * * *'
)
on conflict (name) do update
   set title    = excluded.title,
       note     = excluded.note,
       schedule = excluded.schedule;

insert into public.kr8_heartbeat (job, every_sec, last_beat, last_ok, detail)
values ('kr8_nightly_selftest', 86400, now(), true, '{"note":"0105 M8 registered"}'::jsonb)
on conflict (job) do nothing;

create or replace function public.kr8_admin_record_selftest(
  p_ok boolean,
  p_steps jsonb default '[]'::jsonb,
  p_ms int default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  rmode text := public.kr8_robot_mode('nightly_selftest');
  steps_arr jsonb := case when jsonb_typeof(p_steps) = 'array' then p_steps else '[]'::jsonb end;
  step_total int := jsonb_array_length(steps_arr);
  step_pass int := 0;
  s jsonb;
  lid bigint;
  note_txt text;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  for s in select * from jsonb_array_elements(steps_arr) loop
    if coalesce((s ->> 'ok')::boolean, false) then
      step_pass := step_pass + 1;
    end if;
  end loop;

  note_txt := format(
    '%s · %s/%s journey steps passed%s',
    case when coalesce(p_ok, false) then 'PASS' else 'FAIL' end,
    step_pass,
    step_total,
    case when p_ms is not null then ' (' || p_ms || ' ms)' else '' end
  );

  lid := public.kr8_robot_record(
    'nightly_selftest',
    case when coalesce(p_ok, false) then 'selftest_pass' else 'selftest_fail' end,
    'local-test-copy',
    jsonb_build_object(
      'ok', coalesce(p_ok, false),
      'steps_passed', step_pass,
      'steps_total', step_total,
      'ms', p_ms,
      'steps', steps_arr,
      'note', note_txt
    ),
    null,
    rmode <> 'on'
  );

  update public.kr8_robot
     set last_run  = now(),
         last_ok   = coalesce(p_ok, false),
         last_note = note_txt
   where name = 'nightly_selftest';

  insert into public.kr8_heartbeat (job, every_sec, last_beat, last_ok, detail)
  values (
    'kr8_nightly_selftest',
    86400,
    now(),
    coalesce(p_ok, false),
    jsonb_build_object('ok', coalesce(p_ok, false), 'steps_passed', step_pass, 'steps_total', step_total, 'ms', p_ms)
  )
  on conflict (job) do update
     set every_sec = excluded.every_sec,
         last_beat = excluded.last_beat,
         last_ok   = excluded.last_ok,
         detail    = excluded.detail;

  if not coalesce(p_ok, false) then
    perform public.kr8_alert_raise(
      'selftest:nightly',
      'nightly_selftest',
      'red',
      'Nightly self-test FAILED (' || step_pass || '/' || step_total || ' steps)',
      'Core test-copy journey failed on local self-test. Inspect kr8_robot_log in Autopilot.',
      jsonb_build_object('log_id', lid, 'steps', steps_arr, 'ms', p_ms),
      '#autopilot'
    );
  else
    perform public.kr8_alert_clear('selftest:nightly');
  end if;

  return jsonb_build_object(
    'ok', coalesce(p_ok, false),
    'log_id', lid,
    'steps_passed', step_pass,
    'steps_total', step_total,
    'ms', p_ms,
    'at', now()
  );
end $$;
revoke all on function public.kr8_admin_record_selftest(boolean, jsonb, integer) from public, anon;
grant execute on function public.kr8_admin_record_selftest(boolean, jsonb, integer) to authenticated;

create or replace function public.kr8_admin_latest_selftest()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  l public.kr8_robot_log;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  select * into l
    from public.kr8_robot_log
   where robot = 'nightly_selftest'
   order by at desc, id desc
   limit 1;
  if l.id is null then
    return jsonb_build_object('has_run', false);
  end if;
  return jsonb_build_object(
    'has_run', true,
    'id', l.id,
    'action', l.action,
    'detail', l.detail,
    'dry_run', l.dry_run,
    'at', l.at
  );
end $$;
revoke all on function public.kr8_admin_latest_selftest() from public, anon;
grant execute on function public.kr8_admin_latest_selftest() to authenticated;

commit;
