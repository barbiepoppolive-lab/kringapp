-- 0101 · Kring Autopilot v2 — M4: Self-Fix Robot (safe only, logged, undoable, default DRY-RUN)
--
-- ADDITIVE & RE-RUNNABLE (idempotent). Built on live-base (8a29fdb) + 0098 M1 + 0099 M2 + 0100 M3.
-- Implements:
--   1. Safe-only Self-Fix robot (public.kr8_robot_self_fix_run, scheduled every 30 min via pg_cron, default DRY-RUN):
--      a) Expire stale pending chat threads (>14d unanswered -> 'expired', undoable via reopen_thread),
--         clean expired 3-min handoff tokens (>1h past expires_at), clear expired here_until badges (>1h old, undoable),
--         and raise amber reminders for stale undecided claim holds (>24h — NEVER auto-pays or auto-refuses!).
--      b) Clean orphan storage files (>24h old in kr8-reels / kr8-verify / kr8-ask with no referencing row in
--         kr8_posts, kr8_ask_answers, kr8_verifications, kr8_reward_claims, kr8_members, or kr8_storage_trash ->
--         queued into kr8_storage_trash, undoable via unqueue_trash).
--      c) Re-run / reconcile queued PDPA deletions (0092 / 0062 / 0075) without touching live URLs, and ALWAYS raise
--         a RED alert ('selffix:pdpa_late') when any PDPA selfie/file deletion is overdue (>12h for kr8-verify, >24h other),
--         auto-clearing when overdue count returns to 0.
--      d) Restock warning at <= 5 available vouchers ('selffix:voucher_restock') carrying the supplier buy link + #codes,
--         auto-clearing when stock > 5.
--      e) Retry stuck jobs: kr8_place_geo stuck in 'asked' >30m -> 'retry' (undoable), kr8_push_outbox stuck claimed >15m ->
--         claimed_at = null (undoable).
--   2. Extends public.kr8_admin_robot_undo(bigint) with restore_place_geo, restore_push_claim, and restore_here_until.
--   3. Admin RPCs: public.kr8_admin_self_fix_status() and public.kr8_admin_set_voucher_buy_url(text).
--
-- UNDO:
--   begin;
--   do $$ begin
--     if exists (select 1 from pg_extension where extname = 'pg_cron') then
--       perform cron.unschedule(jobid) from cron.job where jobname = 'kr8_self_fix';
--     end if;
--   end $$;
--   delete from public.kr8_heartbeat where job = 'kr8_self_fix';
--   delete from public.kr8_robot_alerts where robot = 'self_fix';
--   drop function if exists public.kr8_admin_set_voucher_buy_url(text);
--   drop function if exists public.kr8_admin_self_fix_status();
--   drop function if exists public.kr8_robot_self_fix_run();
--   drop function if exists public.kr8_storage_file_is_referenced(text, text);
--   drop table if exists public.kr8_autopilot_kv;
--   -- Re-run 0098's kr8_admin_robot_undo if reverting undo extensions.
--   commit;

begin;

-- ───────────────────────── 1. Safe schema & policy helpers ─────────────────────────
do $$ declare
  cname text;
  cdef text;
begin
  if to_regclass('public.kr8_threads') is not null then
    select c.conname, pg_get_constraintdef(c.oid)
      into cname, cdef
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
     where c.conrelid = 'public.kr8_threads'::regclass
       and c.contype = 'c'
       and a.attname = 'status'
     limit 1;
    if cname is not null and cdef not like '%expired%' then
      execute format('alter table public.kr8_threads drop constraint %I', cname);
      alter table public.kr8_threads
        add constraint kr8_threads_status_check check (status in ('pending', 'open', 'expired', 'closed'));
    end if;
  end if;
end $$;

do $$ begin
  if to_regclass('storage.objects') is not null
     and not exists (
       select 1 from pg_policies
        where schemaname = 'storage' and tablename = 'objects' and policyname = 'kr8_admin_trash_delete'
     ) then
    begin
      create policy kr8_admin_trash_delete on storage.objects
        for delete to authenticated
        using (bucket_id in ('kr8-verify', 'kr8-reels', 'kr8-ask') and public.kr8_is_admin());
    exception when insufficient_privilege then
      null;
    end;
  end if;
end $$;

create table if not exists public.kr8_autopilot_kv (
  key        text primary key check (key ~ '^[a-z0-9_]{2,60}$'),
  val        text not null,
  updated_at timestamptz not null default now()
);
alter table public.kr8_autopilot_kv enable row level security;
revoke all on public.kr8_autopilot_kv from public, anon, authenticated;

insert into public.kr8_autopilot_kv (key, val)
values ('voucher_buy_url', 'https://www.seagm.com/truemoney-wallet-thailand')
on conflict (key) do nothing;

insert into public.kr8_rings_config (key, value, note) values
  ('pdpa_delete_sla_hours', 12, 'Hours before a queued kr8-verify PDPA deletion raises a red alert (0101 M4)'),
  ('stale_thread_days', 14, 'Days before an unanswered pending chat thread is expired by self_fix (0101 M4)'),
  ('orphan_file_hours', 24, 'Hours before an unreferenced upload in storage is queued as orphan trash (0101 M4)'),
  ('voucher_restock_warn', 5, 'Warn with restock buy link when available vouchers <= this number (0101 M4)')
on conflict (key) do nothing;

-- Ensure self_fix defaults to dry_run (never force ON; preserve founder choice if already set)
insert into public.kr8_robot (name, title, note, mode, daily_cap, schedule)
values (
  'self_fix',
  'Self-fix',
  'Expires stale pending threads, queues >24h orphan storage files, watches PDPA deletion SLA, warns at <=5 vouchers, retries stuck jobs.',
  'dry_run',
  100,
  '*/30 * * * *'
)
on conflict (name) do update
   set title    = excluded.title,
       note     = excluded.note,
       schedule = excluded.schedule;

-- ───────────────────────── 2. Reference check for storage files ─────────────────────────
create or replace function public.kr8_storage_file_is_referenced(p_bucket text, p_name text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_bucket is null or p_name is null or btrim(p_name) = '' then
    return true;
  end if;

  if to_regclass('public.kr8_storage_trash') is not null then
    if exists (select 1 from public.kr8_storage_trash t where t.bucket = p_bucket and t.name = p_name) then
      return true;
    end if;
  end if;

  if p_bucket = 'kr8-reels' then
    if exists (
      select 1 from public.kr8_posts p
       where p.video_path = p_name
          or p.poster_path = p_name
          or (p.photo is not null and position(p_name in p.photo) > 0)
    ) then
      return true;
    end if;
  elsif p_bucket = 'kr8-verify' then
    if exists (select 1 from public.kr8_verifications v where v.selfie_path = p_name) then
      return true;
    end if;
    if to_regclass('public.kr8_reward_claims') is not null then
      if exists (select 1 from public.kr8_reward_claims c where c.face_photo = p_name) then
        return true;
      end if;
    end if;
  elsif p_bucket = 'kr8-ask' then
    if exists (select 1 from public.kr8_posts p where p.ask_media_path = p_name) then
      return true;
    end if;
    if to_regclass('public.kr8_ask_answers') is not null then
      if exists (select 1 from public.kr8_ask_answers a where a.media_path = p_name) then
        return true;
      end if;
    end if;
  end if;

  if exists (
    select 1 from public.kr8_members m
     where m.photo is not null and position(p_name in m.photo) > 0
  ) then
    return true;
  end if;

  return false;
end $$;
revoke all on function public.kr8_storage_file_is_referenced(text, text) from public, anon, authenticated;

-- ───────────────────────── 3. Extend kr8_admin_robot_undo for M4 safe actions ─────────────────────────
create or replace function public.kr8_admin_robot_undo(p_log_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l public.kr8_robot_log;
  ukind text;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  select * into l from public.kr8_robot_log where id = p_log_id for update;
  if l.id is null then raise exception 'KR8_BAD_ACTION'; end if;
  if l.undone_at is not null then
    return jsonb_build_object('ok', true, 'id', l.id, 'already_undone', true);
  end if;
  if l.undo is null or l.dry_run then raise exception 'KR8_NOTHING_TO_UNDO'; end if;

  ukind := coalesce(l.undo ->> 'kind', '');

  if ukind = 'dup_ghost' and (l.undo ->> 'dup_id') is not null then
    perform public.kr8_admin_dup_auto_undo((l.undo ->> 'dup_id')::uuid, 'undo');
  elsif ukind = 'unhide_post' and (l.undo ->> 'post_id') is not null then
    update public.kr8_posts
       set hidden      = coalesce((l.undo ->> 'prev_hidden')::boolean, false),
           status      = coalesce(l.undo ->> 'prev_status', status),
           review_note = l.undo ->> 'prev_note'
     where id = (l.undo ->> 'post_id')::uuid;
  elsif ukind = 'reopen_thread' and (l.undo ->> 'thread_id') is not null then
    update public.kr8_threads
       set status = coalesce(l.undo ->> 'prev_status', 'pending')
     where id = (l.undo ->> 'thread_id')::uuid;
  elsif ukind = 'unqueue_trash' and (l.undo ->> 'trash_id') is not null then
    delete from public.kr8_storage_trash
     where id = (l.undo ->> 'trash_id')::uuid and removed_at is null;
  elsif ukind = 'restore_robot_mode' and (l.undo ->> 'robot') is not null then
    update public.kr8_robot
       set mode = coalesce(l.undo ->> 'prev_mode', 'dry_run'), updated_at = now()
     where name = (l.undo ->> 'robot');
  elsif ukind = 'restore_place_geo' and (l.undo ->> 'place_id') is not null then
    update public.kr8_place_geo
       set state = coalesce(l.undo ->> 'prev_state', 'asked'), updated_at = now()
     where place_id = (l.undo ->> 'place_id')::uuid;
  elsif ukind = 'restore_push_claim' and (l.undo ->> 'outbox_id') is not null then
    update public.kr8_push_outbox
       set claimed_at = nullif(l.undo ->> 'prev_claimed_at', '')::timestamptz
     where id = (l.undo ->> 'outbox_id')::bigint and state = 'queued';
  elsif ukind = 'restore_here_until' and (l.undo ->> 'user_id') is not null then
    update public.kr8_members
       set here_until = nullif(l.undo ->> 'prev_here_until', '')::timestamptz
     where user_id = (l.undo ->> 'user_id')::uuid;
  elsif ukind = 'noop' then
    null;
  else
    raise exception 'KR8_NOTHING_TO_UNDO';
  end if;

  update public.kr8_robot_log
     set undone_at = now(),
         undone_by = auth.uid()
   where id = l.id;

  insert into public.kr8_admin_actions_log (action, detail)
  values ('robot_action_undone', jsonb_build_object('log_id', l.id, 'robot', l.robot, 'action', l.action, 'kind', ukind, 'by', auth.uid()));

  return jsonb_build_object('ok', true, 'id', l.id, 'kind', ukind);
end $$;
revoke all on function public.kr8_admin_robot_undo(bigint) from public, anon;
grant execute on function public.kr8_admin_robot_undo(bigint) to authenticated;

-- ───────────────────────── 4. Self-Fix runner (30-min pg_cron + manual trigger) ─────────────────────────
create or replace function public.kr8_robot_self_fix_run()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  rmode text;
  sla_h int := greatest(1, public.kr8_rcfg('pdpa_delete_sla_hours', 12));
  stale_d int := greatest(3, public.kr8_rcfg('stale_thread_days', 14));
  orphan_h int := greatest(12, public.kr8_rcfg('orphan_file_hours', 24));
  warn_v int := greatest(1, public.kr8_rcfg('voucher_restock_warn', 5));
  buy_url text := coalesce(
    (select val from public.kr8_autopilot_kv where key = 'voucher_buy_url'),
    'https://www.seagm.com/truemoney-wallet-thailand'
  );

  has_storage boolean := to_regclass('storage.objects') is not null;
  reconciled_trash int := 0;
  due_30d_selfies int := 0;
  due_30d_claims int := 0;
  pdpa_queued int := 0;
  pdpa_late int := 0;
  oldest_pdpa_h numeric := 0;

  v_avail int := 0;
  stale_holds int := 0;

  n_threads int := 0;
  n_orphans int := 0;
  n_handoffs int := 0;
  n_here int := 0;
  n_geo int := 0;
  n_push int := 0;

  rec record;
  gate text;
  tid uuid;
  note_txt text;
begin
  if public.kr8_autopilot_paused() then
    return jsonb_build_object('skipped', 'paused', 'at', now());
  end if;

  rmode := public.kr8_robot_mode('self_fix');
  if rmode = 'off' then
    return jsonb_build_object('skipped', 'off', 'at', now());
  end if;

  -- ── A. PDPA deletion reconciliation & SLA alert (0092 / 0062 / 0075) ──
  -- 1) If storage files were already deleted via Storage API, mark their trash rows removed immediately.
  if has_storage and to_regclass('public.kr8_storage_trash') is not null then
    if rmode = 'on' then
      update public.kr8_storage_trash t
         set removed_at = now()
       where t.removed_at is null
         and not exists (
           select 1 from storage.objects o where o.bucket_id = t.bucket and o.name = t.name
         );
      get diagnostics reconciled_trash = row_count;

      update public.kr8_verifications v
         set selfie_deleted_at = coalesce(v.selfie_deleted_at, now()),
             selfie_path = null
       where v.selfie_path is not null
         and v.selfie_deleted_at is null
         and coalesce(v.reviewed_at, v.created_at) < now() - interval '30 days'
         and not exists (
           select 1 from storage.objects o where o.bucket_id = 'kr8-verify' and o.name = v.selfie_path
         );
    else
      select count(*)::int into reconciled_trash
        from public.kr8_storage_trash t
       where t.removed_at is null
         and not exists (
           select 1 from storage.objects o where o.bucket_id = t.bucket and o.name = t.name
         );
    end if;
  end if;

  -- 2) Queue 30-day expired verification & claim selfies into kr8_storage_trash (never touches live URLs).
  select count(*)::int into due_30d_selfies
    from public.kr8_verifications v
   where v.selfie_path is not null
     and v.selfie_deleted_at is null
     and coalesce(v.reviewed_at, v.created_at) < now() - interval '30 days'
     and not exists (
       select 1 from public.kr8_storage_trash t where t.bucket = 'kr8-verify' and t.name = v.selfie_path
     );

  if to_regclass('public.kr8_reward_claims') is not null then
    select count(*)::int into due_30d_claims
      from public.kr8_reward_claims c
     where c.face_photo is not null
       and c.face_photo_deleted_at is null
       and c.created_at < now() - interval '30 days';
  end if;

  if (due_30d_selfies > 0 or due_30d_claims > 0) and to_regclass('public.kr8_storage_trash') is not null then
    gate := public.kr8_robot_can_act('self_fix');
    if gate = 'act' then
      insert into public.kr8_storage_trash (bucket, name, user_id)
      select 'kr8-verify', v.selfie_path, v.user_id
        from public.kr8_verifications v
       where v.selfie_path is not null
         and v.selfie_deleted_at is null
         and coalesce(v.reviewed_at, v.created_at) < now() - interval '30 days'
      on conflict (bucket, name) do nothing;

      if due_30d_claims > 0 and to_regprocedure('public.kr8_claim_photos_expire()') is not null then
        perform public.kr8_claim_photos_expire();
      end if;

      perform public.kr8_robot_record(
        'self_fix',
        'queue_30d_pdpa_selfies',
        'kr8-verify',
        jsonb_build_object('selfies', due_30d_selfies, 'claim_photos', due_30d_claims, 'note', (due_30d_selfies + due_30d_claims) || ' 30d selfie(s) queued for deletion'),
        null,
        false
      );
    elsif gate = 'dry_run' then
      perform public.kr8_robot_record(
        'self_fix',
        'would_queue_30d_pdpa_selfies',
        'kr8-verify',
        jsonb_build_object('selfies', due_30d_selfies, 'claim_photos', due_30d_claims, 'note', 'Would queue ' || (due_30d_selfies + due_30d_claims) || ' 30d selfie(s) for deletion'),
        null,
        true
      );
    end if;
  end if;

  -- 3) Check PDPA deletion SLA: alert RED whenever any queued deletion is late!
  if to_regclass('public.kr8_storage_trash') is not null then
    select
      count(*) filter (where t.bucket = 'kr8-verify')::int,
      count(*) filter (
        where (t.bucket = 'kr8-verify' and t.queued_at < now() - make_interval(hours => sla_h))
           or (t.bucket <> 'kr8-verify' and t.queued_at < now() - interval '24 hours')
      )::int,
      coalesce(round((extract(epoch from (now() - min(t.queued_at))) / 3600.0)::numeric, 1), 0)
      into pdpa_queued, pdpa_late, oldest_pdpa_h
      from public.kr8_storage_trash t
     where t.removed_at is null
       and (not has_storage or exists (
         select 1 from storage.objects o where o.bucket_id = t.bucket and o.name = t.name
       ));
  end if;

  if pdpa_late > 0 then
    perform public.kr8_alert_raise(
      'selffix:pdpa_late',
      'self_fix',
      'red',
      'PDPA file deletion overdue · ' || pdpa_late || ' file(s) waiting',
      'Queued selfie / account-deletion file(s) older than ' || sla_h || 'h SLA (oldest ' || oldest_pdpa_h || 'h). Open Autopilot and tap Flush queued storage deletions.',
      jsonb_build_object('overdue', pdpa_late, 'verify_queued', pdpa_queued, 'oldest_hours', oldest_pdpa_h, 'sla_hours', sla_h),
      '#autopilot'
    );
  else
    perform public.kr8_alert_clear('selffix:pdpa_late');
  end if;

  -- ── B. Voucher restock warning at <= 5 with buy link ──
  select count(*)::int into v_avail
    from public.kr8_reward_codes k
   where k.status = 'available' and not k.is_test;

  if v_avail <= warn_v then
    perform public.kr8_alert_raise(
      'selffix:voucher_restock',
      'self_fix',
      case when v_avail <= 2 then 'red' else 'amber' end,
      'Restock vouchers · ' || v_avail || ' left (threshold <= ' || warn_v || ')',
      'Buy TrueMoney / Grab codes (' || buy_url || ') and paste them into Codes before rewards pause.',
      jsonb_build_object('available', v_avail, 'threshold', warn_v, 'buy_url', buy_url, 'paste_hash', '#codes'),
      '#codes'
    );
  else
    perform public.kr8_alert_clear('selffix:voucher_restock');
  end if;

  -- ── C. Stale held claims reminder (NEVER moves money or refuses!) ──
  select count(*)::int into stale_holds
    from public.kr8_claim_holds h
    join public.kr8_reward_claims c on c.id = h.claim_id
   where h.decided is null
     and c.status = 'pending'
     and not c.is_test
     and c.created_at < now() - interval '24 hours';

  if stale_holds > 0 then
    perform public.kr8_alert_raise(
      'selffix:stale_holds',
      'self_fix',
      'amber',
      stale_holds || ' held payout(s) waiting > 24h for your tap',
      'Robots never auto-pay or auto-refuse held claims. Review robot verdict in Needs you.',
      jsonb_build_object('stale_holds', stale_holds),
      '#inbox'
    );
  else
    perform public.kr8_alert_clear('selffix:stale_holds');
  end if;

  -- ── D. Safe Fix 1: Expire unanswered pending chat threads (> stale_d days) ──
  for rec in
    select t.id, t.status, t.last_at
      from public.kr8_threads t
     where t.status = 'pending'
       and t.last_at < now() - make_interval(days => stale_d)
     order by t.last_at asc
     limit 25
  loop
    gate := public.kr8_robot_can_act('self_fix');
    if gate = 'act' then
      update public.kr8_threads set status = 'expired' where id = rec.id and status = 'pending';
      if found then
        n_threads := n_threads + 1;
        perform public.kr8_robot_record(
          'self_fix',
          'expire_stale_thread',
          'thread:' || left(rec.id::text, 8),
          jsonb_build_object('thread_id', rec.id, 'last_at', rec.last_at, 'days_limit', stale_d, 'note', 'Unanswered >' || stale_d || 'd'),
          jsonb_build_object('kind', 'reopen_thread', 'thread_id', rec.id, 'prev_status', 'pending'),
          false
        );
      end if;
    elsif gate = 'dry_run' then
      n_threads := n_threads + 1;
      perform public.kr8_robot_record(
        'self_fix',
        'would_expire_stale_thread',
        'thread:' || left(rec.id::text, 8),
        jsonb_build_object('thread_id', rec.id, 'last_at', rec.last_at, 'note', 'Would expire unanswered pending thread >' || stale_d || 'd'),
        null,
        true
      );
    else
      exit;
    end if;
  end loop;

  -- Clean expired 3-minute sign-in handoff tokens (>1h past expiry) & stale here_until badges (>1h expired)
  if to_regclass('public.kr8_handoff') is not null then
    select count(*)::int into n_handoffs from public.kr8_handoff where expires_at < now() - interval '1 hour';
    if n_handoffs > 0 then
      gate := public.kr8_robot_can_act('self_fix');
      if gate = 'act' then
        delete from public.kr8_handoff where expires_at < now() - interval '1 hour';
        get diagnostics n_handoffs = row_count;
        perform public.kr8_robot_record(
          'self_fix',
          'purge_expired_handoffs',
          'kr8_handoff',
          jsonb_build_object('deleted', n_handoffs, 'note', 'Removed ' || n_handoffs || ' expired sign-in handoff token(s)'),
          jsonb_build_object('kind', 'noop'),
          false
        );
      elsif gate = 'dry_run' then
        perform public.kr8_robot_record(
          'self_fix',
          'would_purge_expired_handoffs',
          'kr8_handoff',
          jsonb_build_object('candidates', n_handoffs, 'note', 'Would remove ' || n_handoffs || ' expired handoff token(s)'),
          null,
          true
        );
      end if;
    end if;
  end if;

  for rec in
    select m.user_id, m.member_no, m.here_until
      from public.kr8_members m
     where m.here_until is not null
       and m.here_until < now() - interval '1 hour'
     limit 25
  loop
    gate := public.kr8_robot_can_act('self_fix');
    if gate = 'act' then
      update public.kr8_members set here_until = null where user_id = rec.user_id;
      n_here := n_here + 1;
      perform public.kr8_robot_record(
        'self_fix',
        'clear_expired_here_badge',
        '#' || coalesce(rec.member_no::text, '?'),
        jsonb_build_object('user_id', rec.user_id, 'expired_at', rec.here_until, 'note', 'Cleared expired here_until presence'),
        jsonb_build_object('kind', 'restore_here_until', 'user_id', rec.user_id, 'prev_here_until', rec.here_until),
        false
      );
    elsif gate = 'dry_run' then
      n_here := n_here + 1;
      perform public.kr8_robot_record(
        'self_fix',
        'would_clear_expired_here_badge',
        '#' || coalesce(rec.member_no::text, '?'),
        jsonb_build_object('user_id', rec.user_id, 'expired_at', rec.here_until, 'note', 'Would clear expired here_until presence'),
        null,
        true
      );
    else
      exit;
    end if;
  end loop;

  -- ── E. Safe Fix 2: Clean orphan storage uploads (> orphan_h hours old, no DB row) ──
  if has_storage and to_regclass('public.kr8_storage_trash') is not null then
    for rec in
      select o.bucket_id, o.name, o.created_at,
             case when split_part(o.name, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(o.name, '/', 1)::uuid else null end as owner_uid
        from storage.objects o
       where o.bucket_id in ('kr8-reels', 'kr8-verify', 'kr8-ask')
         and o.created_at < now() - make_interval(hours => orphan_h)
         and not public.kr8_storage_file_is_referenced(o.bucket_id, o.name)
       order by o.created_at asc
       limit 25
    loop
      gate := public.kr8_robot_can_act('self_fix');
      if gate = 'act' then
        insert into public.kr8_storage_trash (bucket, name, user_id)
        values (rec.bucket_id, rec.name, rec.owner_uid)
        on conflict (bucket, name) do nothing
        returning id into tid;

        if tid is not null then
          n_orphans := n_orphans + 1;
          perform public.kr8_robot_record(
            'self_fix',
            'queue_orphan_file',
            rec.bucket_id || '/' || right(rec.name, 20),
            jsonb_build_object('bucket', rec.bucket_id, 'name', rec.name, 'uploaded_at', rec.created_at, 'note', 'Orphan upload >' || orphan_h || 'h queued to trash'),
            jsonb_build_object('kind', 'unqueue_trash', 'trash_id', tid),
            false
          );
        end if;
      elsif gate = 'dry_run' then
        n_orphans := n_orphans + 1;
        perform public.kr8_robot_record(
          'self_fix',
          'would_queue_orphan_file',
          rec.bucket_id || '/' || right(rec.name, 20),
          jsonb_build_object('bucket', rec.bucket_id, 'name', rec.name, 'uploaded_at', rec.created_at, 'note', 'Would queue >' || orphan_h || 'h orphan upload'),
          null,
          true
        );
      else
        exit;
      end if;
    end loop;
  end if;

  -- ── F. Safe Fix 3: Retry stuck background jobs (place geocoding & push outbox claims) ──
  if to_regclass('public.kr8_place_geo') is not null then
    for rec in
      select g.place_id, g.state, g.asked_at, g.tries
        from public.kr8_place_geo g
       where g.state = 'asked'
         and g.asked_at < now() - interval '30 minutes'
         and g.tries < 5
       order by g.asked_at asc
       limit 20
    loop
      gate := public.kr8_robot_can_act('self_fix');
      if gate = 'act' then
        update public.kr8_place_geo set state = 'retry', updated_at = now() where place_id = rec.place_id and state = 'asked';
        if found then
          n_geo := n_geo + 1;
          perform public.kr8_robot_record(
            'self_fix',
            'retry_stuck_place_geo',
            'place:' || left(rec.place_id::text, 8),
            jsonb_build_object('place_id', rec.place_id, 'asked_at', rec.asked_at, 'tries', rec.tries, 'note', 'Reset stuck geocode request (>30m) to retry'),
            jsonb_build_object('kind', 'restore_place_geo', 'place_id', rec.place_id, 'prev_state', 'asked'),
            false
          );
        end if;
      elsif gate = 'dry_run' then
        n_geo := n_geo + 1;
        perform public.kr8_robot_record(
          'self_fix',
          'would_retry_stuck_place_geo',
          'place:' || left(rec.place_id::text, 8),
          jsonb_build_object('place_id', rec.place_id, 'asked_at', rec.asked_at, 'note', 'Would reset stuck geocode request (>30m) to retry'),
          null,
          true
        );
      else
        exit;
      end if;
    end loop;
  end if;

  if to_regclass('public.kr8_push_outbox') is not null then
    for rec in
      select o.id, o.claimed_at, o.tries
        from public.kr8_push_outbox o
       where o.state = 'queued'
         and o.claimed_at is not null
         and o.claimed_at < now() - interval '15 minutes'
         and o.tries < 5
       order by o.claimed_at asc
       limit 25
    loop
      gate := public.kr8_robot_can_act('self_fix');
      if gate = 'act' then
        update public.kr8_push_outbox set claimed_at = null where id = rec.id and state = 'queued';
        if found then
          n_push := n_push + 1;
          perform public.kr8_robot_record(
            'self_fix',
            'retry_stuck_push_outbox',
            'push:' || rec.id::text,
            jsonb_build_object('outbox_id', rec.id, 'claimed_at', rec.claimed_at, 'tries', rec.tries, 'note', 'Released stuck push claim (>15m) for retry'),
            jsonb_build_object('kind', 'restore_push_claim', 'outbox_id', rec.id, 'prev_claimed_at', rec.claimed_at),
            false
          );
        end if;
      elsif gate = 'dry_run' then
        n_push := n_push + 1;
        perform public.kr8_robot_record(
          'self_fix',
          'would_retry_stuck_push_outbox',
          'push:' || rec.id::text,
          jsonb_build_object('outbox_id', rec.id, 'claimed_at', rec.claimed_at, 'note', 'Would release stuck push claim (>15m)'),
          null,
          true
        );
      else
        exit;
      end if;
    end loop;
  end if;

  note_txt := format(
    '%s · PDPA late %s · stock %s · threads %s · orphans %s · stuck %s',
    upper(rmode),
    pdpa_late,
    v_avail,
    n_threads,
    n_orphans,
    (n_geo + n_push)
  );

  update public.kr8_robot
     set last_run  = now(),
         last_ok   = true,
         last_note = note_txt
   where name = 'self_fix';

  insert into public.kr8_heartbeat (job, every_sec, last_beat, last_ok, detail)
  values (
    'kr8_self_fix',
    1800,
    now(),
    true,
    jsonb_build_object(
      'mode', rmode,
      'pdpa_late', pdpa_late,
      'vouchers', v_avail,
      'threads', n_threads,
      'orphans', n_orphans,
      'stuck_jobs', n_geo + n_push
    )
  )
  on conflict (job) do update
     set every_sec = excluded.every_sec,
         last_beat = excluded.last_beat,
         last_ok   = excluded.last_ok,
         detail    = excluded.detail;

  return jsonb_build_object(
    'at', now(),
    'mode', rmode,
    'pdpa_queued', pdpa_queued,
    'pdpa_late', pdpa_late,
    'reconciled_trash', reconciled_trash,
    'available_vouchers', v_avail,
    'voucher_buy_url', buy_url,
    'stale_holds', stale_holds,
    'threads_handled', n_threads,
    'orphans_handled', n_orphans,
    'handoffs_handled', n_handoffs,
    'here_cleared', n_here,
    'stuck_geo_retried', n_geo,
    'stuck_push_retried', n_push
  );
end $$;
revoke all on function public.kr8_robot_self_fix_run() from public, anon, authenticated;

-- ───────────────────────── 5. Admin RPCs for Self-Fix & Restock Link ─────────────────────────
create or replace function public.kr8_admin_self_fix_status()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  sla_h int := greatest(1, public.kr8_rcfg('pdpa_delete_sla_hours', 12));
  stale_d int := greatest(3, public.kr8_rcfg('stale_thread_days', 14));
  orphan_h int := greatest(12, public.kr8_rcfg('orphan_file_hours', 24));
  warn_v int := greatest(1, public.kr8_rcfg('voucher_restock_warn', 5));
  has_storage boolean := to_regclass('storage.objects') is not null;
  pdpa_queued int := 0;
  other_queued int := 0;
  pdpa_late int := 0;
  oldest_h numeric := 0;
  orphans int := 0;
  stuck_geo int := 0;
  stuck_push int := 0;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  if to_regclass('public.kr8_storage_trash') is not null then
    select
      count(*) filter (where t.bucket = 'kr8-verify')::int,
      count(*) filter (where t.bucket <> 'kr8-verify')::int,
      count(*) filter (
        where (t.bucket = 'kr8-verify' and t.queued_at < now() - make_interval(hours => sla_h))
           or (t.bucket <> 'kr8-verify' and t.queued_at < now() - interval '24 hours')
      )::int,
      coalesce(round((extract(epoch from (now() - min(t.queued_at))) / 3600.0)::numeric, 1), 0)
      into pdpa_queued, other_queued, pdpa_late, oldest_h
      from public.kr8_storage_trash t
     where t.removed_at is null
       and (not has_storage or exists (
         select 1 from storage.objects o where o.bucket_id = t.bucket and o.name = t.name
       ));
  end if;

  if has_storage then
    select count(*)::int into orphans
      from storage.objects o
     where o.bucket_id in ('kr8-reels', 'kr8-verify', 'kr8-ask')
       and o.created_at < now() - make_interval(hours => orphan_h)
       and not public.kr8_storage_file_is_referenced(o.bucket_id, o.name);
  end if;

  if to_regclass('public.kr8_place_geo') is not null then
    select count(*)::int into stuck_geo
      from public.kr8_place_geo g
     where g.state = 'asked' and g.asked_at < now() - interval '30 minutes' and g.tries < 5;
  end if;

  if to_regclass('public.kr8_push_outbox') is not null then
    select count(*)::int into stuck_push
      from public.kr8_push_outbox o
     where o.state = 'queued' and o.claimed_at is not null and o.claimed_at < now() - interval '15 minutes' and o.tries < 5;
  end if;

  return jsonb_build_object(
    'at', now(),
    'mode', public.kr8_robot_mode('self_fix'),
    'pdpa_sla_hours', sla_h,
    'pdpa_queued', pdpa_queued,
    'other_trash_queued', other_queued,
    'pdpa_late', pdpa_late,
    'oldest_queued_hours', oldest_h,
    'orphan_candidates', orphans,
    'stale_threads', (
      select count(*)::int from public.kr8_threads t
       where t.status = 'pending' and t.last_at < now() - make_interval(days => stale_d)
    ),
    'stale_holds', (
      select count(*)::int from public.kr8_claim_holds h
      join public.kr8_reward_claims c on c.id = h.claim_id
       where h.decided is null and c.status = 'pending' and not c.is_test and c.created_at < now() - interval '24 hours'
    ),
    'stuck_geo', stuck_geo,
    'stuck_push', stuck_push,
    'available_vouchers', (select count(*)::int from public.kr8_reward_codes k where k.status = 'available' and not k.is_test),
    'restock_warn_at', warn_v,
    'voucher_buy_url', coalesce(
      (select val from public.kr8_autopilot_kv where key = 'voucher_buy_url'),
      'https://www.seagm.com/truemoney-wallet-thailand'
    )
  );
end $$;
revoke all on function public.kr8_admin_self_fix_status() from public, anon;
grant execute on function public.kr8_admin_self_fix_status() to authenticated;

create or replace function public.kr8_admin_set_voucher_buy_url(p_url text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare u text := btrim(coalesce(p_url, ''));
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if u !~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(/.*)?$' or length(u) > 300 then
    raise exception 'KR8_BAD_ACTION';
  end if;
  insert into public.kr8_autopilot_kv (key, val, updated_at)
  values ('voucher_buy_url', u, now())
  on conflict (key) do update set val = excluded.val, updated_at = now();
  return jsonb_build_object('voucher_buy_url', u, 'updated_at', now());
end $$;
revoke all on function public.kr8_admin_set_voucher_buy_url(text) from public, anon;
grant execute on function public.kr8_admin_set_voucher_buy_url(text) to authenticated;

-- ───────────────────────── 6. Schedule 30-min pg_cron job ─────────────────────────
insert into public.kr8_heartbeat (job, every_sec, last_beat, last_ok, detail)
values ('kr8_self_fix', 1800, now(), true, '{"note":"0101 M4 registered"}'::jsonb)
on conflict (job) do nothing;

do $$ begin
  perform public.kr8_schedule_job(
    'kr8_self_fix',
    '*/30 * * * *',
    'select public.kr8_robot_self_fix_run()'
  );
end $$;

commit;
