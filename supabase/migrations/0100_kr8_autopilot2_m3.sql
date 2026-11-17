-- 0100_kr8_autopilot2_m3 · Kring Autopilot M3 Health Watch (18 Nov 2026)
--
-- GOAL:
--   Every 15 minutes check all 8 vital signs:
--     1) DB reachable
--     2) Auth working
--     3) Storage buckets reachable
--     4) Key RPCs answer < 2 s (< 2000 ms)
--     5) Face-check function alive (kr8_verify_instant + pgvector)
--     6) Voucher stock > 5
--     7) Supabase free-tier quotas (DB size vs 500 MB, storage size vs 1024 MB)
--     8) Cron heartbeats fresh
--   Raises a RED alert in kr8_robot_alerts when any check fails (mode = 'on'), and AUTO-CLEARS it the moment it recovers.
--   Written for kring-test (extensions.vector; live swaps extensions.vector -> public.vector).
--
-- UNDO:
--   do $$ begin
--     if to_regclass('cron.job') is not null then
--       if exists (select 1 from cron.job where jobname = 'kr8_health_watch') then
--         perform cron.unschedule('kr8_health_watch');
--       end if;
--     end if;
--   exception when others then null; end $$;
--   delete from public.kr8_rings_config where key in ('health_rpc_max_ms','health_min_vouchers','quota_db_limit_mb','quota_storage_limit_mb');
--   drop function if exists public.kr8_admin_health_watch(boolean, jsonb);
--   drop function if exists public.kr8_robot_health_watch_run(jsonb);
--   drop function if exists public.kr8_robot_health_watch_run();
--   drop function if exists public.kr8_health_evaluate(jsonb);
--   drop table if exists public.kr8_health_latest;

begin;

insert into public.kr8_rings_config (key, value, note) values
  ('health_rpc_max_ms',      2000, 'Max allowed latency (ms) for key RPCs in M3 health_watch before red alert (0100)'),
  ('health_min_vouchers',       5, 'Voucher stock must be strictly greater than this (> 5) else red alert (0100)'),
  ('quota_db_limit_mb',       500, 'Supabase free-tier DB size limit in MB; red alert at >= 90% (0100)'),
  ('quota_storage_limit_mb', 1024, 'Supabase free-tier storage size limit in MB; red alert at >= 90% (0100)')
on conflict (key) do nothing;

create table if not exists public.kr8_health_latest (
  key        text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  ord        int not null default 0,
  title      text not null,
  ok         boolean not null,
  summary    text not null,
  ms         int,
  detail     jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);
alter table public.kr8_health_latest enable row level security;
revoke all on public.kr8_health_latest from public, anon, authenticated;

-- ───────────────────────── Evaluate all 8 Health Watch checks safely ─────────────────────────
create or replace function public.kr8_health_evaluate(p_client_probe jsonb default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  t0 timestamptz;
  ms_db int := 0;
  ok_db boolean := true;
  sum_db text := '';
  cnt_members int := 0;

  ms_auth int := 0;
  ok_auth boolean := true;
  sum_auth text := '';
  cnt_users int := 0;

  ms_st int := 0;
  ok_st boolean := true;
  sum_st text := '';
  buckets_found int := 0;
  missing_buckets text[] := '{}';

  ms_rpc int := 0;
  client_rpc_ms int := coalesce((p_client_probe ->> 'rpc_ms')::int, 0);
  max_rpc_ms int := public.kr8_rcfg('health_rpc_max_ms', 2000);
  ok_rpc boolean := true;
  sum_rpc text := '';

  ms_face int := 0;
  ok_face boolean := true;
  sum_face text := '';
  vec_dist float8 := 0;

  avail_vouchers int := 0;
  min_vouchers int := public.kr8_rcfg('health_min_vouchers', 5);
  ok_vouchers boolean := true;
  sum_vouchers text := '';

  db_mb numeric := 0;
  st_mb numeric := 0;
  db_lim numeric := greatest(public.kr8_rcfg('quota_db_limit_mb', 500), 1);
  st_lim numeric := greatest(public.kr8_rcfg('quota_storage_limit_mb', 1024), 1);
  db_pct int := 0;
  st_pct int := 0;
  ok_quotas boolean := true;
  sum_quotas text := '';

  stale_jobs text[] := '{}';
  ok_hb boolean := true;
  sum_hb text := '';
begin
  -- 1) DB reachable
  t0 := clock_timestamp();
  begin
    select count(*)::int into cnt_members from public.kr8_members;
    ms_db := greatest(0, round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int);
    ok_db := true;
    sum_db := 'Postgres OK (' || ms_db || ' ms · ' || cnt_members || ' member rows)';
  exception when others then
    ms_db := greatest(0, round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int);
    ok_db := false;
    sum_db := 'DB check error: ' || left(sqlerrm, 120);
  end;

  -- 2) Auth working
  t0 := clock_timestamp();
  begin
    select count(*)::int into cnt_users from auth.users;
    ms_auth := greatest(0, round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int);
    if (p_client_probe ? 'auth_ok') and not coalesce((p_client_probe ->> 'auth_ok')::boolean, true) then
      ok_auth := false;
      sum_auth := 'Client auth session check failed';
    else
      ok_auth := true;
      sum_auth := 'auth.users reachable (' || cnt_users || ' accounts · ' || ms_auth || ' ms)';
    end if;
  exception when others then
    ms_auth := greatest(0, round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int);
    ok_auth := false;
    sum_auth := 'Auth schema error: ' || left(sqlerrm, 120);
  end;

  -- 3) Storage buckets reachable
  t0 := clock_timestamp();
  begin
    if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
      ok_st := false;
      sum_st := 'storage.buckets / storage.objects missing';
    else
      select count(*)::int into buckets_found from storage.buckets;
      select array_agg(req) into missing_buckets
      from unnest(array['kr8-reels', 'kr8-verify', 'kr8-ask']) req
      where not exists (select 1 from storage.buckets b where b.id = req);

      missing_buckets := coalesce(missing_buckets, '{}');
      ms_st := greatest(0, round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int);

      if cardinality(missing_buckets) > 0 then
        ok_st := false;
        sum_st := 'Missing storage bucket(s): ' || array_to_string(missing_buckets, ', ');
      elsif (p_client_probe ? 'storage_ok') and not coalesce((p_client_probe ->> 'storage_ok')::boolean, true) then
        ok_st := false;
        sum_st := 'Storage HTTP endpoint check failed';
      else
        ok_st := true;
        sum_st := buckets_found || ' storage buckets reachable (' || ms_st || ' ms)';
      end if;
    end if;
  exception when others then
    ok_st := false;
    sum_st := 'Storage check error: ' || left(sqlerrm, 120);
  end;

  -- 4) Key RPCs answer < 2 s (< 2000 ms)
  t0 := clock_timestamp();
  begin
    perform public.kr8_week_board(public.kr8_week_start(now()), false);
    if to_regprocedure('public.kr8_weekly_ranking(text)') is not null then
      perform public.kr8_weekly_ranking('all');
    end if;
    if to_regprocedure('public.kr8_recent_claims(integer)') is not null then
      perform public.kr8_recent_claims(10);
    end if;
    ms_rpc := greatest(0, round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int);
    ms_rpc := greatest(ms_rpc, client_rpc_ms);
    ok_rpc := ms_rpc < max_rpc_ms;
    sum_rpc := case when ok_rpc
      then 'Key RPCs answered in ' || ms_rpc || ' ms (< ' || max_rpc_ms || ' ms limit)'
      else 'Key RPCs slow: ' || ms_rpc || ' ms (limit ' || max_rpc_ms || ' ms)'
    end;
  exception when others then
    ms_rpc := greatest(0, round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int);
    ok_rpc := false;
    sum_rpc := 'Key RPC error: ' || left(sqlerrm, 120);
  end;

  -- 5) Face-check function alive
  t0 := clock_timestamp();
  begin
    if to_regprocedure('public.kr8_verify_instant(text,text,jsonb,real[],real[])') is null then
      ok_face := false;
      sum_face := 'kr8_verify_instant RPC is missing';
    elsif to_regclass('public.kr8_face_vectors') is null or to_regclass('public.kr8_face_decisions') is null then
      ok_face := false;
      sum_face := 'kr8_face_vectors / kr8_face_decisions table missing';
    else
      select ('[1,0,0]'::extensions.vector operator(extensions.<=>) '[1,0,0]'::extensions.vector) into vec_dist;
      ms_face := greatest(0, round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int);
      ok_face := coalesce(vec_dist, 99) < 0.001;
      sum_face := 'kr8_verify_instant + pgvector alive (' || ms_face || ' ms)';
    end if;
  exception when others then
    ok_face := false;
    sum_face := 'Face-check health error: ' || left(sqlerrm, 120);
  end;

  -- 6) Voucher stock > 5
  begin
    select count(*)::int into avail_vouchers
    from public.kr8_reward_codes k
    where k.status = 'available' and not k.is_test;
    ok_vouchers := avail_vouchers > min_vouchers;
    sum_vouchers := case when ok_vouchers
      then avail_vouchers || ' vouchers available (> ' || min_vouchers || ' threshold)'
      else 'LOW STOCK: only ' || avail_vouchers || ' voucher(s) left (needs > ' || min_vouchers || ')'
    end;
  exception when others then
    ok_vouchers := false;
    sum_vouchers := 'Voucher stock query failed: ' || left(sqlerrm, 120);
  end;

  -- 7) Supabase free-tier quotas (DB size & storage size vs limits)
  begin
    db_mb := round((pg_database_size(current_database())::numeric / 1048576.0), 1);
    if to_regclass('storage.objects') is not null then
      select round((coalesce(sum(coalesce((o.metadata ->> 'size')::bigint, 0)), 0)::numeric / 1048576.0), 1)
        into st_mb
      from storage.objects o;
    end if;
    db_pct := round((db_mb / db_lim) * 100)::int;
    st_pct := round((st_mb / st_lim) * 100)::int;
    ok_quotas := db_pct < 90 and st_pct < 90;
    sum_quotas := 'DB ' || db_mb || '/' || db_lim || ' MB (' || db_pct || '%) · Storage ' || st_mb || '/' || st_lim || ' MB (' || st_pct || '%)';
  exception when others then
    ok_quotas := false;
    sum_quotas := 'Quota check error: ' || left(sqlerrm, 120);
  end;

  -- 8) Cron heartbeats fresh
  begin
    select coalesce(array_agg(h.job order by h.job), '{}') into stale_jobs
    from public.kr8_heartbeat h
    left join public.kr8_robot r on r.name = h.job
    where not public.kr8_autopilot_paused()
      and coalesce(r.mode, 'on') <> 'off'
      and (
        h.last_ok = false
        or (h.last_beat is not null and h.last_beat < now() - make_interval(secs => greatest(h.every_sec * 2, 1800)))
        or (h.job = 'kr8_autopilot_heartbeat' and h.last_beat is null)
      );
    ok_hb := cardinality(stale_jobs) = 0;
    sum_hb := case when ok_hb
      then 'All active heartbeats fresh'
      else 'Stale or failed heartbeat(s): ' || array_to_string(stale_jobs, ', ')
    end;
  exception when others then
    ok_hb := false;
    sum_hb := 'Heartbeat check error: ' || left(sqlerrm, 120);
  end;

  return jsonb_build_array(
    jsonb_build_object('key', 'db',            'ord', 1, 'title', 'DB reachable',             'ok', ok_db,       'summary', sum_db,       'ms', ms_db,   'detail', jsonb_build_object('members', cnt_members)),
    jsonb_build_object('key', 'auth',          'ord', 2, 'title', 'Auth working',             'ok', ok_auth,     'summary', sum_auth,     'ms', ms_auth, 'detail', jsonb_build_object('users', cnt_users)),
    jsonb_build_object('key', 'storage',       'ord', 3, 'title', 'Storage buckets reachable','ok', ok_st,       'summary', sum_st,       'ms', ms_st,   'detail', jsonb_build_object('buckets', buckets_found, 'missing', missing_buckets)),
    jsonb_build_object('key', 'rpc_speed',     'ord', 4, 'title', 'Key RPCs < 2 s',           'ok', ok_rpc,      'summary', sum_rpc,      'ms', ms_rpc,  'detail', jsonb_build_object('limit_ms', max_rpc_ms)),
    jsonb_build_object('key', 'face_check',    'ord', 5, 'title', 'Face-check alive',         'ok', ok_face,     'summary', sum_face,     'ms', ms_face, 'detail', '{}'::jsonb),
    jsonb_build_object('key', 'voucher_stock', 'ord', 6, 'title', 'Voucher stock > 5',        'ok', ok_vouchers, 'summary', sum_vouchers, 'ms', null,    'detail', jsonb_build_object('available', avail_vouchers, 'min', min_vouchers)),
    jsonb_build_object('key', 'quotas',        'ord', 7, 'title', 'Free-tier quotas',         'ok', ok_quotas,   'summary', sum_quotas,   'ms', null,    'detail', jsonb_build_object('db_mb', db_mb, 'db_limit_mb', db_lim, 'db_pct', db_pct, 'storage_mb', st_mb, 'storage_limit_mb', st_lim, 'storage_pct', st_pct)),
    jsonb_build_object('key', 'heartbeats',    'ord', 8, 'title', 'Cron heartbeats fresh',    'ok', ok_hb,       'summary', sum_hb,       'ms', null,    'detail', jsonb_build_object('stale_jobs', stale_jobs))
  );
end $$;
revoke all on function public.kr8_health_evaluate(jsonb) from public, anon, authenticated;

-- ───────────────────────── Scheduled / Manual Health Watch Runner ─────────────────────────
create or replace function public.kr8_robot_health_watch_run(p_client_probe jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  gate text := public.kr8_robot_can_act('health_watch');
  checks jsonb;
  c jsonb;
  pass_n int := 0;
  fail_n int := 0;
  raised_n int := 0;
  cleared_n int := 0;
  fail_keys text[] := '{}';
  all_ok boolean := true;
begin
  if gate = 'off' then
    return jsonb_build_object('ok', true, 'skipped', 'off', 'at', now());
  end if;

  checks := public.kr8_health_evaluate(p_client_probe);

  for c in select * from jsonb_array_elements(checks) loop
    insert into public.kr8_health_latest (key, ord, title, ok, summary, ms, detail, checked_at)
    values (
      c ->> 'key',
      (c ->> 'ord')::int,
      c ->> 'title',
      (c ->> 'ok')::boolean,
      c ->> 'summary',
      (c ->> 'ms')::int,
      coalesce(c -> 'detail', '{}'::jsonb),
      now()
    )
    on conflict (key) do update set
      ord        = excluded.ord,
      title      = excluded.title,
      ok         = excluded.ok,
      summary    = excluded.summary,
      ms         = excluded.ms,
      detail     = excluded.detail,
      checked_at = now();

    if (c ->> 'ok')::boolean then
      pass_n := pass_n + 1;
      if gate = 'on' then
        if public.kr8_alert_clear('health:' || (c ->> 'key'), 'auto') then
          cleared_n := cleared_n + 1;
        end if;
      end if;
    else
      fail_n := fail_n + 1;
      fail_keys := array_append(fail_keys, c ->> 'key');
      if gate = 'on' then
        perform public.kr8_alert_raise(
          'health:' || (c ->> 'key'),
          'health_watch',
          'red',
          'Health check failed: ' || (c ->> 'title'),
          c ->> 'summary',
          case when (c ->> 'key') = 'voucher_stock' then '#codes' else '#autopilot' end,
          coalesce(c -> 'detail', '{}'::jsonb)
        );
        raised_n := raised_n + 1;
      end if;
    end if;
  end loop;

  all_ok := fail_n = 0;

  perform public.kr8_robot_beat(
    'health_watch',
    all_ok,
    jsonb_build_object(
      'passed', pass_n,
      'failed', fail_n,
      'note', case when all_ok then 'All 8 health checks green' else fail_n || ' failed: ' || array_to_string(fail_keys, ', ') end
    ),
    900
  );

  if gate <> 'capped' and (gate = 'dry_run' or fail_n > 0 or cleared_n > 0 or p_client_probe is not null) then
    perform public.kr8_robot_record(
      'health_watch',
      case when all_ok then 'health_sweep_ok' else 'health_alert_raised' end,
      pass_n || '/8 green',
      jsonb_build_object(
        'passed', pass_n,
        'failed', fail_n,
        'failed_keys', fail_keys,
        'alerts_raised', raised_n,
        'alerts_auto_cleared', cleared_n,
        'note', case when all_ok
          then case when cleared_n > 0 then 'All 8 green · auto-cleared ' || cleared_n || ' red alert(s)' else 'All 8 checks green' end
          else 'Failed: ' || array_to_string(fail_keys, ', ')
        end
      ),
      null,
      gate <> 'on'
    );
  end if;

  return jsonb_build_object(
    'at', now(),
    'gate', gate,
    'all_ok', all_ok,
    'passed', pass_n,
    'failed', fail_n,
    'alerts_raised', raised_n,
    'alerts_auto_cleared', cleared_n,
    'checks', checks
  );
end $$;
revoke all on function public.kr8_robot_health_watch_run(jsonb) from public, anon, authenticated;

-- 15-minute server schedule (pg_cron when available)
select public.kr8_schedule_job('kr8_health_watch', '*/15 * * * *', 'select public.kr8_robot_health_watch_run()');

-- ───────────────────────── Admin RPC for Health Watch Scorecard ─────────────────────────
create or replace function public.kr8_admin_health_watch(
  p_run boolean default false,
  p_client_probe jsonb default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  checks jsonb;
  r public.kr8_robot;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  if p_run or not exists (select 1 from public.kr8_health_latest) then
    if public.kr8_robot_mode('health_watch') <> 'off' then
      perform public.kr8_robot_health_watch_run(p_client_probe);
    else
      checks := public.kr8_health_evaluate(p_client_probe);
      return jsonb_build_object(
        'at', now(),
        'mode', 'off',
        'all_ok', not exists (select 1 from jsonb_array_elements(checks) x where not (x ->> 'ok')::boolean),
        'checks', checks
      );
    end if;
  end if;

  select * into r from public.kr8_robot where name = 'health_watch';
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', h.key,
    'ord', h.ord,
    'title', h.title,
    'ok', h.ok,
    'summary', h.summary,
    'ms', h.ms,
    'detail', h.detail,
    'checked_at', h.checked_at
  ) order by h.ord), '[]'::jsonb)
  into checks
  from public.kr8_health_latest h;

  return jsonb_build_object(
    'at', coalesce((select max(checked_at) from public.kr8_health_latest), now()),
    'mode', coalesce(r.mode, 'dry_run'),
    'all_ok', not exists (select 1 from public.kr8_health_latest h where not h.ok),
    'checks', checks
  );
end $$;
revoke all on function public.kr8_admin_health_watch(boolean, jsonb) from public, anon;
grant execute on function public.kr8_admin_health_watch(boolean, jsonb) to authenticated;

commit;
