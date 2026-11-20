-- 0179 (20 Nov 2026, night): Autopilot audit after the revamp. Every robot now acts on tonight's rules.
-- Stale before -> now:
--  1. Reel auto-approve robot (0174) was set to start approving "trusted" members' Reels on Mon 23 Nov.
--     Rule: the founder approves EVERY Reel by hand -> autoapprove_on = 0 (robot stays off; its 5-min timer does nothing).
--  2. Alerts were raised for QA/test accounts and the Kring Team account (e.g. struggle / minor / copied-Reel cards).
--     -> kr8_alert_raise skips them (kr8_alert_about_test, 0176 definition), open ones are cleared, the brief filters them.
--  3. Morning brief: "approve to unlock Founding prizes", "payouts waiting for your tap", "face checks waiting for your eye"
--     and a ฿100-only stock line. Founding is full, payouts / face checks / look-alikes are automatic -> removed / reworded.
--  4. Self-fix: "Robots never auto-pay ... tap Pay or Refuse" (24 h) -> claim robot is late after 1 h, no tap needed;
--     "approving first Reels unlocks Founding prizes" -> "you approve every Reel"; voucher restock counted ฿100 TrueMoney
--     only -> real demand per prize amount (won + waiting + this week's paid ranks with 25+ Rings in the last 24 h).
--     New: This or that queue alert (< tot_queue_min_days = 3 days left) and an alert for open account-check appeals.
--  5. Protect: Ring-farming / scam counts included QA/team flags and said "check before approving payouts" -> fixed.
--  6. Farming cases Rings estimate used the old board scoring in Board v2 weeks -> v2: unverified saves add 0,
--     unverified accounts under 24 h ignored. Also fixed a live crash: a ref_code like 'Rich' broke the whole screen.
--  7. Weekend push waves 2 and 3 (founder approved the 3-wave campaign): kr8_push_wave_send(w) recomputes ranks at send
--     time, keeps the 12 h chat de-dup + push ref de-dup, sends once, runs only on its own Bangkok date, switch push_waves_on.
--     pg_cron: Sat 21 Nov 10:00 Bangkok (03:00 UTC) and Sun 22 Nov 18:00 Bangkok (11:00 UTC).
--     English texts said "ริง" (Thai) by mistake -> "Rings".
--  8. 9am brief to the founder's phone (ntfy) from the cloud: kr8_brief_due() / kr8_brief_mark(), called by the
--     kring-deploy-canary worker (it holds the ntfy topic) between 09:00 and 12:00 Bangkok, once a day.
-- UNDO: 0179_autopilot_rules_1120_UNDO.sql

-- config
insert into public.kr8_rings_config (key, value, note) values
  ('autoapprove_on', 0, '0179: 0 = founder approves every Reel by hand (Reel auto-approve robot off)'),
  ('tot_queue_min_days', 3, '0179: alert when This or that has fewer than this many days of questions queued'),
  ('push_waves_on', 1, '0179: 1 = weekend push waves 2 and 3 send at their scheduled time; 0 = they skip')
on conflict (key) do update set value = excluded.value, note = excluded.note, updated_at = now();

-- QA/test/team alert filter
create or replace function public.kr8_alert_about_test(p_key text, p_detail jsonb)
 returns boolean language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare s text; u uuid; mn int;
begin
  for s in select (regexp_matches(coalesce(p_key, ''), '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g'))[1]
           union all select p_detail ->> 'user_id' union all select p_detail ->> 'post_id' loop
    begin u := s::uuid; exception when others then u := null; end;
    continue when u is null;
    if exists (select 1 from public.kr8_members m where m.user_id = u) then
      if public.kr8_is_test_member(u) or public.kr8_is_team(u) then return true; end if;
    elsif exists (select 1 from public.kr8_posts p where p.id = u and (public.kr8_is_test_member(p.author) or public.kr8_is_team(p.author))) then
      return true;
    end if;
  end loop;
  begin mn := nullif(p_detail ->> 'member_no', '')::int; exception when others then mn := null; end;
  if mn is not null and exists (select 1 from public.kr8_members m where m.member_no = mn
       and (public.kr8_is_test_member(m.user_id) or public.kr8_is_team(m.user_id))) then return true; end if;
  return false;
end $$;
revoke all on function public.kr8_alert_about_test(text, jsonb) from public, anon;
grant execute on function public.kr8_alert_about_test(text, jsonb) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.kr8_alert_raise(p_key text, p_robot text, p_severity text, p_title text, p_body text DEFAULT ''::text, p_href text DEFAULT '#inbox'::text, p_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare aid uuid;
begin
  -- 0179: QA/test accounts and the Kring Team account never alert the founder (0176 real-member rule)
  if public.kr8_alert_about_test(p_key, p_detail) then return null; end if;
  if p_severity not in ('red', 'amber', 'grey') then
    raise exception 'KR8_BAD_SEVERITY';
  end if;

  insert into public.kr8_robot_alerts (dedupe_key, robot, severity, title, body, href, detail, first_at, last_at, cleared_at, cleared_by)
  values (
    left(btrim(p_key), 120),
    p_robot,
    p_severity,
    left(btrim(p_title), 160),
    left(coalesce(p_body, ''), 500),
    coalesce(nullif(btrim(p_href), ''), '#inbox'),
    coalesce(p_detail, '{}'::jsonb),
    now(),
    now(),
    null,
    null
  )
  on conflict (dedupe_key) do update set
    robot      = excluded.robot,
    severity   = excluded.severity,
    title      = excluded.title,
    body       = excluded.body,
    href       = excluded.href,
    detail     = excluded.detail,
    last_at    = now(),
    first_at   = case when public.kr8_robot_alerts.cleared_at is not null then now() else public.kr8_robot_alerts.first_at end,
    cleared_at = null,
    cleared_by = null
  returning id into aid;

  return aid;
end $function$;

CREATE OR REPLACE FUNCTION public.kr8_robot_protect_run()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  rmode text;
  d0 timestamptz := ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
  w0 timestamptz := public.kr8_week_start(now());
  near_week_close boolean := now() >= (w0 + interval '7 days' - interval '6 hours');
  rec record;
  gate text;

  n_links int := 0;
  n_scam int := 0;
  n_shared int := 0;
  n_farm int := 0;
  n_hidden int := 0;
  open_rep_posts int := 0;
  active_scam int := 0;
  active_farm int := 0;
begin
  if public.kr8_autopilot_paused() then
    return jsonb_build_object('skipped', 'paused', 'at', now());
  end if;

  rmode := public.kr8_robot_mode('protect');
  if rmode = 'off' then
    return jsonb_build_object('skipped', 'off', 'at', now());
  end if;

  -- 1. Repeated blocked-link tries
  if to_regclass('public.kr8_link_tries') is not null then
    for rec in
      select lt.user_id,
             count(*) filter (where lt.at > now() - interval '7 days')::int as tries_7d,
             count(*)::int as tries_all,
             max(lt.at) as latest_at
        from public.kr8_link_tries lt
        join public.kr8_members m on m.user_id = lt.user_id
       where not public.kr8_is_test_member(lt.user_id)
         and not public.kr8_is_team(lt.user_id)
       group by lt.user_id
      having count(*) filter (where lt.at > now() - interval '7 days') >= 3
          or count(*) >= 5
    loop
      n_links := n_links + 1;
      insert into public.kr8_protect_flags (user_id, flag_key, severity, summary, detail, last_at)
      values (
        rec.user_id, 'link_tries',
        case when rec.tries_7d >= 6 then 'red' else 'amber' end,
        format('%s blocked web-link attempt(s) in 7d (%s total)', rec.tries_7d, rec.tries_all),
        jsonb_build_object('tries_7d', rec.tries_7d, 'tries_total', rec.tries_all, 'latest_at', rec.latest_at),
        rec.latest_at
      )
      on conflict (user_id, flag_key) do update
         set severity = excluded.severity, summary = excluded.summary, detail = excluded.detail, last_at = excluded.last_at,
             dismissed_at = case when kr8_protect_flags.dismissed_at is not null and excluded.last_at > kr8_protect_flags.dismissed_at then null else kr8_protect_flags.dismissed_at end;
    end loop;
  end if;

  -- 2. Money / scam / LINE-ID hunting phrases in chat
  if to_regclass('public.kr8_messages') is not null then
    for rec in
      with hits as (
        select msg.sender as user_id, public.kr8_chat_scam_reason(msg.body) as reason, msg.created_at
          from public.kr8_messages msg
          join public.kr8_members m on m.user_id = msg.sender
         where msg.created_at > now() - interval '14 days'
           and not public.kr8_is_test_member(msg.sender)
           and not public.kr8_is_team(msg.sender)
      )
      select h.user_id, count(*)::int as hit_count,
             (array_agg(h.reason order by (case h.reason when 'money_request' then 1 when 'crypto_or_gambling' then 2 else 3 end), h.created_at desc))[1] as top_reason,
             max(h.created_at) as latest_at
        from hits h where h.reason is not null group by h.user_id
    loop
      n_scam := n_scam + 1;
      insert into public.kr8_protect_flags (user_id, flag_key, severity, summary, detail, last_at)
      values (
        rec.user_id, 'scam_chat',
        case when rec.top_reason in ('money_request', 'crypto_or_gambling') then 'red' else 'amber' end,
        format('%s (%s message%s in 14d)', replace(rec.top_reason, '_', ' '), rec.hit_count, case when rec.hit_count = 1 then '' else 's' end),
        jsonb_build_object('reason', rec.top_reason, 'hits_14d', rec.hit_count, 'latest_at', rec.latest_at),
        rec.latest_at
      )
      on conflict (user_id, flag_key) do update
         set severity = excluded.severity, summary = excluded.summary, detail = excluded.detail, last_at = excluded.last_at,
             dismissed_at = case when kr8_protect_flags.dismissed_at is not null and excluded.last_at > kr8_protect_flags.dismissed_at then null else kr8_protect_flags.dismissed_at end;
    end loop;
  end if;

  -- 3. Shared face / device / Wi-Fi signals across members
  for rec in
    with links as (
      select u.uid as user_id,
             array_agg(distinct l.reason order by l.reason) as reasons,
             count(distinct u.other_id)::int as peers,
             max(l.last_at) as latest_at
        from public.kr8_account_links l
        cross join lateral (values (l.a, l.b), (l.b, l.a)) u(uid, other_id)
        join public.kr8_members m on m.user_id = u.uid
       where l.dismissed_at is null
         and not public.kr8_is_test_member(u.uid)
         and not public.kr8_is_team(u.uid)
       group by u.uid
    )
    select * from links
  loop
    n_shared := n_shared + 1;
    insert into public.kr8_protect_flags (user_id, flag_key, severity, summary, detail, last_at)
    values (
      rec.user_id, 'shared_signals',
      case when 'face' = any(rec.reasons) or 'device' = any(rec.reasons) then 'amber' else 'grey' end,
      format('Shared %s with %s other account(s)', array_to_string(rec.reasons, ' / '), rec.peers),
      jsonb_build_object('reasons', to_jsonb(rec.reasons), 'peers', rec.peers, 'latest_at', rec.latest_at),
      coalesce(rec.latest_at, now())
    )
    on conflict (user_id, flag_key) do update
       set severity = excluded.severity, summary = excluded.summary, detail = excluded.detail, last_at = excluded.last_at;
  end loop;

  -- 4a. Mutual pair Ring farming
  for rec in
    with interactions as (
      select l.user_id as giver, p.author as receiver, l.created_at
        from public.kr8_post_likes l join public.kr8_posts p on p.id = l.post_id
       where p.kind = 'reel' and not p.hidden and l.user_id <> p.author
      union all
      select s.user_id as giver, p.author as receiver, s.created_at
        from public.kr8_post_saves s join public.kr8_posts p on p.id = s.post_id
       where p.kind = 'reel' and not p.hidden and s.user_id <> p.author
    ),
    totals as (select giver, count(*)::int as total_given from interactions group by giver having count(*) >= 3),
    pairs as (select i.giver, i.receiver, count(*)::int as pair_given, max(i.created_at) as latest_at from interactions i group by i.giver, i.receiver)
    select p1.giver as user_id, p1.receiver as partner_id, om.member_no as partner_no, p1.pair_given, t1.total_given, p2.pair_given as partner_back, greatest(p1.latest_at, p2.latest_at) as latest_at
      from pairs p1
      join totals t1 on t1.giver = p1.giver
      join pairs p2 on p2.giver = p1.receiver and p2.receiver = p1.giver
      join public.kr8_members m on m.user_id = p1.giver
      join public.kr8_members om on om.user_id = p1.receiver
     where p1.pair_given >= 3 and p2.pair_given >= 2
       and (p1.pair_given::numeric / greatest(t1.total_given, 1)) >= 0.80
       and not public.kr8_is_test_member(p1.giver) and not public.kr8_is_team(p1.giver)
  loop
    n_farm := n_farm + 1;
    insert into public.kr8_protect_flags (user_id, flag_key, severity, summary, detail, last_at)
    values (
      rec.user_id, 'ring_farming', 'amber',
      format('%s/%s Reel likes+saves went to #%s (%s back)', rec.pair_given, rec.total_given, coalesce(rec.partner_no::text, '?'), rec.partner_back),
      jsonb_build_object('partner_id', rec.partner_id, 'partner_no', rec.partner_no, 'given_to_partner', rec.pair_given, 'total_given', rec.total_given, 'received_from_partner', rec.partner_back),
      rec.latest_at
    )
    on conflict (user_id, flag_key) do update
       set severity = excluded.severity, summary = excluded.summary, detail = excluded.detail, last_at = excluded.last_at,
           dismissed_at = case when kr8_protect_flags.dismissed_at is not null and excluded.last_at > kr8_protect_flags.dismissed_at then null else kr8_protect_flags.dismissed_at end;
  end loop;

  -- 4b. T-398 [A-13 + B-13]: Anonymous share-open Ring farming (`>= 20` anon opens with `< 2` verified likes/saves)
  --     and same-`ref_code` cohort inbreeding (`>= 75%` of `>= 5` Reel interactions from same recruiter link)
  if to_regclass('public.kr8_share_opens') is not null then
    for rec in
      select p.author as user_id,
             count(*) filter (where o.opener is null)::int as anon_opens,
             max(o.created_at) as latest_at,
             (select count(*)::int from public.kr8_post_likes lk join public.kr8_members lm on lm.user_id = lk.user_id
               where lk.post_id = p.id and lk.user_id <> p.author and coalesce(lm.verified, false)) as ver_likes
        from public.kr8_posts p
        join public.kr8_share_opens o on o.post_id = p.id and o.ok and o.created_at >= w0
       where p.kind = 'reel' and not coalesce(p.hidden, false)
         and not public.kr8_is_test_member(p.author) and not public.kr8_is_team(p.author)
       group by p.id, p.author
      having count(*) filter (where o.opener is null) >= 20
    loop
      if rec.ver_likes < 2 then
        n_farm := n_farm + 1;
        insert into public.kr8_protect_flags (user_id, flag_key, severity, summary, detail, last_at)
        values (
          rec.user_id, 'ring_farming', 'amber',
          format('%s anonymous share-link opens with %s verified likes this week', rec.anon_opens, rec.ver_likes),
          jsonb_build_object('mode', 'share_open_spike', 'anon_opens', rec.anon_opens, 'verified_likes', rec.ver_likes),
          rec.latest_at
        )
        on conflict (user_id, flag_key) do update
           set severity = excluded.severity, summary = excluded.summary, detail = excluded.detail, last_at = excluded.last_at,
               dismissed_at = case when kr8_protect_flags.dismissed_at is not null and excluded.last_at > kr8_protect_flags.dismissed_at then null else kr8_protect_flags.dismissed_at end;
      end if;
    end loop;
  end if;

  for rec in
    with rx as (
      select p.author, l.user_id as giver, l.created_at
        from public.kr8_post_likes l join public.kr8_posts p on p.id = l.post_id
       where p.kind = 'reel' and not coalesce(p.hidden, false) and l.user_id <> p.author and l.created_at >= w0
      union all
      select p.author, s.user_id as giver, s.created_at
        from public.kr8_post_saves s join public.kr8_posts p on p.id = s.post_id
       where p.kind = 'reel' and not coalesce(p.hidden, false) and s.user_id <> p.author and s.created_at >= w0
    )
    select rx.author as user_id,
           count(*)::int as total_in,
           count(*) filter (where lower(coalesce(gm.ref_code, '')) = lower(coalesce(am.ref_code, '')) and coalesce(am.ref_code, '') <> '')::int as same_ref_in,
           max(rx.created_at) as latest_at,
           am.ref_code
      from rx
      join public.kr8_members am on am.user_id = rx.author
      join public.kr8_members gm on gm.user_id = rx.giver
     where not public.kr8_is_test_member(rx.author) and not public.kr8_is_team(rx.author)
     group by rx.author, am.ref_code
    having count(*) >= 5
       and (count(*) filter (where lower(coalesce(gm.ref_code, '')) = lower(coalesce(am.ref_code, '')) and coalesce(am.ref_code, '') <> '')::numeric / count(*)) >= 0.75
  loop
    n_farm := n_farm + 1;
    insert into public.kr8_protect_flags (user_id, flag_key, severity, summary, detail, last_at)
    values (
      rec.user_id, 'ring_farming', 'amber',
      format('%s/%s inbound Reel likes+saves came from same invite cohort (%s)', rec.same_ref_in, rec.total_in, coalesce(rec.ref_code, '?')),
      jsonb_build_object('mode', 'cohort_inbreeding', 'ref_code', rec.ref_code, 'same_ref_in', rec.same_ref_in, 'total_in', rec.total_in),
      rec.latest_at
    )
    on conflict (user_id, flag_key) do update
       set severity = excluded.severity, summary = excluded.summary, detail = excluded.detail, last_at = excluded.last_at,
           dismissed_at = case when kr8_protect_flags.dismissed_at is not null and excluded.last_at > kr8_protect_flags.dismissed_at then null else kr8_protect_flags.dismissed_at end;
  end loop;

  -- 5. T-398 [C-3.2 + A-16]: Anti-brigading `>= 3` reports auto-hide (require >=3 credible reporters & protect Sunday Top-10 near close)
  for rec in
    select p.id as post_id, p.author, p.kind, p.status, p.hidden, p.review_note, m.member_no,
           count(distinct r.reporter)::int as reporters,
           count(distinct r.reporter) filter (where coalesce(rm.verified, false) or rm.created_at < now() - interval '24 hours')::int as credible_reporters,
           exists (select 1 from public.kr8_week_board(w0, false) b where b.member_id = p.author and b.rk <= 10) as is_top10
      from public.kr8_reports r
      join public.kr8_posts p on p.id = r.post_id
      left join public.kr8_members m on m.user_id = p.author
      left join public.kr8_members rm on rm.user_id = r.reporter
     where r.post_id is not null and r.handled_at is null
       and not coalesce(rm.ghost, false)
     group by p.id, p.author, p.kind, p.status, p.hidden, p.review_note, m.member_no
    having count(distinct r.reporter) >= 3
  loop
    open_rep_posts := open_rep_posts + 1;

    if not coalesce(rec.hidden, false) and rec.credible_reporters >= 3 and not (near_week_close and rec.is_top10) then
      gate := public.kr8_robot_can_act('protect');
      if gate = 'on' then
        update public.kr8_posts set hidden = true where id = rec.post_id and not coalesce(hidden, false);
        if found then
          n_hidden := n_hidden + 1;
          perform public.kr8_robot_record(
            'protect', 'auto_hide_reported_post', 'post:' || left(rec.post_id::text, 8),
            jsonb_build_object('post_id', rec.post_id, 'author_no', rec.member_no, 'reporters', rec.reporters, 'credible_reporters', rec.credible_reporters,
                               'note', format('Auto-hid %s by #%s after %s credible reports (founder decides final action)', rec.kind, coalesce(rec.member_no::text, '?'), rec.credible_reporters)),
            jsonb_build_object('kind', 'unhide_post', 'post_id', rec.post_id, 'prev_hidden', false, 'prev_status', rec.status, 'prev_note', rec.review_note),
            false
          );
        end if;
      elsif gate = 'dry_run' then
        -- T-398 [A-16]: align dedupe to IST `d0` matching `kr8_robot_can_act`
        if not exists (
          select 1 from public.kr8_robot_log l
           where l.robot = 'protect' and l.action = 'would_hide_reported_post'
             and l.detail ->> 'post_id' = rec.post_id::text and l.at >= d0
        ) then
          n_hidden := n_hidden + 1;
          perform public.kr8_robot_record(
            'protect', 'would_hide_reported_post', 'post:' || left(rec.post_id::text, 8),
            jsonb_build_object('post_id', rec.post_id, 'author_no', rec.member_no, 'reporters', rec.reporters,
                               'note', format('Would auto-hide %s by #%s (%s credible reports)', rec.kind, coalesce(rec.member_no::text, '?'), rec.credible_reporters)),
            null, true
          );
        end if;
      end if;
    elsif coalesce(rec.hidden, false) and not exists (
      select 1 from public.kr8_robot_log l
       where l.robot = 'protect' and l.action = 'auto_hide_reported_post' and l.detail ->> 'post_id' = rec.post_id::text
    ) and rmode = 'on' then
      perform public.kr8_robot_record(
        'protect', 'auto_hide_reported_post', 'post:' || left(rec.post_id::text, 8),
        jsonb_build_object('post_id', rec.post_id, 'author_no', rec.member_no, 'reporters', rec.reporters,
                           'note', format('Post by #%s hidden at %s reports — awaiting founder review', coalesce(rec.member_no::text, '?'), rec.reporters)),
        jsonb_build_object('kind', 'unhide_post', 'post_id', rec.post_id, 'prev_hidden', false, 'prev_status', rec.status, 'prev_note', rec.review_note),
        false
      );
    end if;
  end loop;

  -- 6. Reconcile founder alerts in Alert Centre
  select count(*)::int into active_scam from public.kr8_protect_flags where flag_key = 'scam_chat' and dismissed_at is null
    and not public.kr8_is_test_member(user_id) and not public.kr8_is_team(user_id);   -- 0179
  select count(*)::int into active_farm from public.kr8_protect_flags where flag_key = 'ring_farming' and dismissed_at is null
    and not public.kr8_is_test_member(user_id) and not public.kr8_is_team(user_id);   -- 0179

  if active_scam > 0 then
    perform public.kr8_alert_raise('protect:scam_chat', 'protect', 'amber',
      active_scam || ' member(s) flagged for money / scam / LINE-hunting chat',
      'Robots never auto-ban. Check flagged account(s) in Autopilot or People and decide.',
      '#autopilot', jsonb_build_object('flagged_members', active_scam));
  else
    perform public.kr8_alert_clear('protect:scam_chat');
  end if;

  if active_farm > 0 then
    perform public.kr8_alert_raise('protect:ring_farming', 'protect', 'amber',
      active_farm || ' member(s) flagged for Ring-farming or share-link spikes',
      'Tap to see who and why. Prizes still pay automatically; the claim robot refuses an account whose fake-engagement check is red.',
      '#autopilot', jsonb_build_object('flagged_members', active_farm));
  else
    perform public.kr8_alert_clear('protect:ring_farming');
  end if;

  if open_rep_posts > 0 then
    perform public.kr8_alert_raise('protect:reported_posts', 'protect', 'amber',
      open_rep_posts || ' post(s) reached 3+ reports · your decision needed',
      'Check reported post(s) in Needs you to restore or keep hidden.',
      '#inbox', jsonb_build_object('posts', open_rep_posts));
  else
    perform public.kr8_alert_clear('protect:reported_posts');
  end if;

  update public.kr8_robot
     set last_run = now(), last_ok = true,
         last_note = format('%s · scam %s · links %s · farm %s · 3+ rep %s', upper(rmode), active_scam, n_links, active_farm, open_rep_posts)
   where name = 'protect';

  insert into public.kr8_heartbeat (job, every_sec, last_beat, last_ok, detail)
  values ('kr8_protect', 900, now(), true, jsonb_build_object('mode', rmode, 'scam_chat', active_scam, 'ring_farming', active_farm, 'reported_posts', open_rep_posts))
  on conflict (job) do update set every_sec = excluded.every_sec, last_beat = excluded.last_beat, last_ok = excluded.last_ok, detail = excluded.detail;

  return jsonb_build_object(
    'at', now(), 'mode', rmode, 'link_tries_flagged', n_links, 'scam_chat_flagged', active_scam,
    'shared_signals_flagged', n_shared, 'ring_farming_flagged', active_farm,
    'reported_posts_3plus', open_rep_posts, 'posts_hidden_now', n_hidden
  );
end $function$;

CREATE OR REPLACE FUNCTION public.kr8_robot_self_fix_run()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  rmode text;
  d0 timestamptz := ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
  sla_h int := greatest(1, public.kr8_rcfg('pdpa_delete_sla_hours', 30));
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
  trash_other_late int := 0;
  oldest_pdpa_h numeric := 0;

  v_avail int := 0;
  tm100_avail int := 0;
  unstocked_pending int := 0;
  unstocked_thb int := 0;
  committed_100 int := 0;
  stale_holds int := 0;

  help_late int := 0;
  reels_2h int := 0;
  reels_6h int := 0;
  faces_2h int := 0;
  unused_handoffs_6h int := 0;
  used_handoffs_6h int := 0;

  n_threads int := 0;
  n_orphans int := 0;
  n_handoffs int := 0;
  n_here int := 0;
  n_geo int := 0;
  n_push int := 0;
  short_txt text := '';
  short_n int := 0;
  w_end timestamptz := public.kr8_week_start(now()) + interval '7 days';
  tot_days int := 0;
  tot_min int := greatest(1, public.kr8_rcfg('tot_queue_min_days', 3));
  open_checks int := 0;

  rec record;
  gate text;
  tid uuid;
  tgt text;
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
         and v.status <> 'pending'
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

  -- T-398 [A-06]: never trash unreviewed pending verification selfies (`v.status <> 'pending'`)
  select count(*)::int into due_30d_selfies
    from public.kr8_verifications v
   where v.selfie_path is not null
     and v.selfie_deleted_at is null
     and v.status <> 'pending'
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
    if gate = 'on' then
      insert into public.kr8_storage_trash (bucket, name, user_id)
      select 'kr8-verify', v.selfie_path, v.user_id
        from public.kr8_verifications v
       where v.selfie_path is not null
         and v.selfie_deleted_at is null
         and v.status <> 'pending'
         and coalesce(v.reviewed_at, v.created_at) < now() - interval '30 days'
      on conflict (bucket, name) do nothing;

      update public.kr8_verifications v
         set selfie_deleted_at = now()
       where v.selfie_path is not null
         and v.selfie_deleted_at is null
         and v.status <> 'pending'
         and coalesce(v.reviewed_at, v.created_at) < now() - interval '30 days';

      if due_30d_claims > 0 and to_regprocedure('public.kr8_claim_photos_expire()') is not null then
        perform public.kr8_claim_photos_expire();
      end if;

      perform public.kr8_robot_record(
        'self_fix', 'queue_30d_pdpa_selfies', 'kr8-verify',
        jsonb_build_object('selfies', due_30d_selfies, 'claim_photos', due_30d_claims, 'note', (due_30d_selfies + due_30d_claims) || ' 30d selfie(s) queued for deletion'),
        null, false
      );
    elsif gate = 'dry_run' and not exists (
      select 1 from public.kr8_robot_log l
       where l.robot = 'self_fix' and l.action = 'would_queue_30d_pdpa_selfies' and l.at >= d0
    ) then
      perform public.kr8_robot_record(
        'self_fix', 'would_queue_30d_pdpa_selfies', 'kr8-verify',
        jsonb_build_object('selfies', due_30d_selfies, 'claim_photos', due_30d_claims, 'note', 'Would queue ' || (due_30d_selfies + due_30d_claims) || ' 30d selfie(s) for deletion'),
        null, true
      );
    end if;
  end if;

  -- T-398 [A-06 + B-07]: separate biometric `kr8-verify` PDPA SLA from general storage trash (`kr8-reels`/`kr8-ask`)
  if to_regclass('public.kr8_storage_trash') is not null then
    select
      count(*) filter (where t.bucket = 'kr8-verify')::int,
      count(*) filter (where t.bucket = 'kr8-verify' and t.queued_at < now() - make_interval(hours => sla_h))::int,
      count(*) filter (where t.bucket <> 'kr8-verify' and t.queued_at < now() - interval '48 hours')::int,
      coalesce(round((extract(epoch from (now() - min(t.queued_at) filter (where t.bucket = 'kr8-verify'))) / 3600.0)::numeric, 1), 0)
      into pdpa_queued, pdpa_late, trash_other_late, oldest_pdpa_h
      from public.kr8_storage_trash t
     where t.removed_at is null
       and (not has_storage or exists (
         select 1 from storage.objects o where o.bucket_id = t.bucket and o.name = t.name
       ));

    if rmode = 'on' and (pdpa_queued > 0 or trash_other_late > 0) and to_regprocedure('public.kr8_cleanup_kick()') is not null then
      perform public.kr8_cleanup_kick();
    end if;
  end if;

  if pdpa_late > 0 then
    perform public.kr8_alert_raise(
      'selffix:pdpa_late',
      'self_fix',
      'red',
      'PDPA selfie deletion overdue · ' || pdpa_late || ' file(s) waiting',
      'Queued verification selfie(s) older than ' || sla_h || 'h SLA (oldest ' || oldest_pdpa_h || 'h). Open Autopilot and tap Delete queued files now.',
      '#autopilot',
      jsonb_build_object('overdue', pdpa_late, 'verify_queued', pdpa_queued, 'oldest_hours', oldest_pdpa_h, 'sla_hours', sla_h)
    );
  else
    perform public.kr8_alert_clear('selffix:pdpa_late');
  end if;

  if trash_other_late > 0 then
    perform public.kr8_alert_raise(
      'selffix:storage_trash',
      'self_fix',
      'amber',
      trash_other_late || ' leftover media upload(s) queued > 48h in storage trash',
      'Non-biometric Reel/Ask uploads waiting for storage cleanup.',
      '#autopilot',
      jsonb_build_object('trash_other_late', trash_other_late)
    );
  else
    perform public.kr8_alert_clear('selffix:storage_trash');
  end if;

  -- ── B. Voucher stock (`truemoney ฿100` + Committed Demand) & Out-of-Stock Black-Hole Guard ──
  select count(*)::int,
         count(*) filter (where k.brand = 'truemoney' and k.amount_thb = 100 and (k.expires_on is null or k.expires_on >= current_date))::int
    into v_avail, tm100_avail
    from public.kr8_reward_codes k
   where k.status = 'available' and not k.is_test;

  select count(*)::int, coalesce(sum(c.amount_thb), 0)::int
    into unstocked_pending, unstocked_thb
    from public.kr8_reward_claims c
   where c.status = 'pending' and not c.held and not c.is_test;

  select unstocked_pending
         + (select count(*)::int from public.kr8_reward_claims c where c.status = 'pending' and c.held and not c.is_test and c.amount_thb = 100)
         + (select count(*)::int from public.kr8_prizes p where p.status = 'won' and not p.is_test and p.amount_thb = 100)
    into committed_100;

  if unstocked_pending > 0 then
    perform public.kr8_alert_raise(
      'selffix:pending_no_stock',
      'self_fix',
      'red',
      unstocked_pending || ' approved claim(s) (฿' || unstocked_thb || ') waiting for voucher codes',
      'Voucher stock ran out mid-claim. Paste fresh codes into Codes so waiting members receive their reward.',
      '#codes',
      jsonb_build_object('unstocked_pending', unstocked_pending, 'unstocked_thb', unstocked_thb, 'truemoney_100_available', tm100_avail)
    );
  else
    perform public.kr8_alert_clear('selffix:pending_no_stock');
  end if;

  -- 0179: demand = prizes won but not claimed + claims waiting + (last 24 h of the week) this week's paid ranks with 25+ Rings
  with dem as (
    select p.amount_thb a, count(*)::int n from public.kr8_prizes p where p.status = 'won' and not p.is_test group by 1
    union all
    select c.amount_thb, count(*)::int from public.kr8_reward_claims c where c.status = 'pending' and not c.is_test group by 1
    union all
    select public.kr8_prize_for(b.rk), count(*)::int from public.kr8_week_board(public.kr8_week_start(now()), false) b
     where now() >= w_end - interval '24 hours' and b.rk <= public.kr8_paid_ranks()
       and b.rings >= public.kr8_rcfg('min_rings_for_paid_seat', 25) and public.kr8_prize_for(b.rk) > 0
     group by 1),
  d as (select a, sum(n)::int need from dem where a > 0 group by a),
  s as (select k.amount_thb a, count(*)::int have from public.kr8_reward_codes k
         where k.status = 'available' and not k.is_test and (k.expires_on is null or k.expires_on >= current_date) group by 1)
  select coalesce(string_agg('฿' || to_char(d.a, 'FM9,999') || ' × ' || (d.need - coalesce(s.have, 0)), ', ' order by d.a desc)
                    filter (where d.need > coalesce(s.have, 0)), ''),
         coalesce(sum(greatest(d.need - coalesce(s.have, 0), 0)), 0)::int
    into short_txt, short_n
    from d left join s using (a);

  if short_n > 0 then
    perform public.kr8_alert_raise(
      'selffix:voucher_restock',
      'self_fix',
      case when unstocked_pending > 0 then 'red' else 'amber' end,
      'Buy voucher codes: ' || short_txt,
      'Prizes are paid automatically from these codes (Grab or TrueMoney voucher). Buy them (' || buy_url || ') and paste them into Codes.',
      '#codes',
      jsonb_build_object('short', short_txt, 'short_n', short_n, 'available', v_avail, 'buy_url', buy_url, 'paste_hash', '#codes')
    );
  else
    perform public.kr8_alert_clear('selffix:voucher_restock');
  end if;

  -- ── C. Stale held claims + Help 1h SLA + Reel/Face Review Queue SLAs ──
  select count(*)::int into stale_holds
    from public.kr8_claim_holds h
    join public.kr8_reward_claims c on c.id = h.claim_id
   where h.decided is null
     and c.status = 'pending'
     and not c.is_test
     and c.created_at < now() - interval '1 hour';   -- 0179: the claim robot decides held claims within 2 minutes

  if stale_holds > 0 then
    perform public.kr8_alert_raise(
      'selffix:stale_holds', 'self_fix', 'amber',
      stale_holds || ' held prize claim(s) not decided after 1 hour',
      'The claim robot normally pays or refuses a held claim within 2 minutes, so it is late. Open Autopilot and tap Run now on Claim decider.',
      '#autopilot', jsonb_build_object('stale_holds', stale_holds)
    );
  else
    perform public.kr8_alert_clear('selffix:stale_holds');
  end if;

  -- T-398 [B-10]: 1-hour Help reply promise (`> 45m` unanswered -> RED)
  if to_regclass('public.kr8_messages') is not null and to_regclass('public.kr8_threads') is not null then
    select count(*)::int into help_late
      from public.kr8_threads t
     where (public.kr8_is_team(t.user_a) or public.kr8_is_team(t.user_b))
       and not (public.kr8_is_team(t.user_a) and public.kr8_is_team(t.user_b))
       and exists (
         select 1 from public.kr8_messages m1
          where m1.thread_id = t.id
            and not public.kr8_is_team(m1.sender)
            and not public.kr8_is_test_member(m1.sender)
            and m1.body like '[Help]%'
       )
       and exists (
         select 1 from public.kr8_messages m2
          where m2.thread_id = t.id
            and not public.kr8_is_team(m2.sender)
            and not public.kr8_is_test_member(m2.sender)
            and not public.kr8_is_ack(m2.body)
            and m2.id > public.kr8_help_closed_upto(t.id)
            and m2.created_at < now() - interval '45 minutes'
            and m2.created_at > now() - interval '48 hours'
            and not exists (
              select 1 from public.kr8_messages reply
               where reply.thread_id = t.id
                 and public.kr8_is_team(reply.sender)
                 and reply.created_at > m2.created_at
            )
       );
  end if;

  if help_late > 0 then
    perform public.kr8_alert_raise(
      'selffix:help_sla', 'self_fix', 'red',
      help_late || ' member Help chat(s) waiting > 45 min (1-hour promise)',
      'Open Help in Needs you and send a quick reply before the 1-hour promise expires.',
      '#inbox', jsonb_build_object('help_late', help_late)
    );
  else
    perform public.kr8_alert_clear('selffix:help_sla');
  end if;

  -- T-398 [B-10]: Pending Reel & Face-check review queue SLA (`> 2h` amber, `> 6h` red)
  select count(*) filter (where p.created_at < now() - interval '2 hours')::int,
         count(*) filter (where p.created_at < now() - interval '6 hours')::int
    into reels_2h, reels_6h
    from public.kr8_posts p
   where p.kind = 'reel' and p.status = 'pending' and not coalesce(p.hidden, false)
     and public.kr8_admin_v2_kind(p.author) = 'real';

  select count(*)::int into faces_2h
    from public.kr8_verifications v
   where v.status = 'pending'
     and v.created_at < now() - interval '2 hours'
     and public.kr8_admin_v2_kind(v.user_id) in ('real', 'nocard');

  if (reels_2h + faces_2h) > 0 then
    perform public.kr8_alert_raise(
      'selffix:review_sla', 'self_fix',
      case when reels_6h > 0 then 'red' else 'amber' end,
      (reels_2h + faces_2h) || ' item(s) waiting > 2h for approval (' || reels_2h || ' Reels · ' || faces_2h || ' faces)',
      'You approve every Reel by hand: open Needs you.' || case when faces_2h > 0 then ' ' || faces_2h || ' face check(s) did not decide automatically; the robot retries them every 2 minutes.' else '' end,
      '#inbox', jsonb_build_object('reels_2h', reels_2h, 'reels_6h', reels_6h, 'faces_2h', faces_2h)
    );
  else
    perform public.kr8_alert_clear('selffix:review_sla');
  end if;

  -- 0179: This or that is posted only by Kring: keep the next days queued (alert under tot_queue_min_days days)
  if to_regclass('public.kr8_task_votes') is not null then
    select coalesce(min(g), 31)::int into tot_days from generate_series(0, 30) g
     where not exists (select 1 from public.kr8_task_votes v where v.day = public.kr8_bkk_day() + g);
    if public.kr8_rcfg('tasks_on', 1) = 1 and tot_days < tot_min then
      perform public.kr8_alert_raise('selffix:tot_queue', 'self_fix', case when tot_days <= 1 then 'red' else 'amber' end,
        'This or that: questions left for only ' || tot_days || ' day' || case when tot_days = 1 then '' else 's' end,
        'Members get no daily vote when the queue runs out. Add the next days'' questions (Kring posts them, members only vote).',
        '#autopilot', jsonb_build_object('days_left', tot_days, 'min_days', tot_min));
    else
      perform public.kr8_alert_clear('selffix:tot_queue');
    end if;
  end if;

  -- 0179: appeals from refused duplicate faces ("Ask Kring to check my account") show in admin with the reason
  if to_regclass('public.kr8_account_checks') is not null then
    select count(*)::int into open_checks from public.kr8_account_checks c
     where c.status = 'open' and not public.kr8_is_test_member(c.user_id);
    if open_checks > 0 then
      perform public.kr8_alert_raise('selffix:account_checks', 'self_fix', 'amber',
        open_checks || ' account check request' || case when open_checks = 1 then '' else 's' end || ' (duplicate face refused)',
        'Each card shows why the face check was refused, both faces, and a one-tap message to that member.',
        '#inbox/check', jsonb_build_object('open', open_checks));
    else
      perform public.kr8_alert_clear('selffix:account_checks');
    end if;
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
    tgt := 'thread:' || left(rec.id::text, 8);
    gate := public.kr8_robot_can_act('self_fix');
    if gate = 'on' then
      update public.kr8_threads set status = 'expired' where id = rec.id and status = 'pending';
      if found then
        n_threads := n_threads + 1;
        perform public.kr8_robot_record(
          'self_fix', 'expire_stale_thread', tgt,
          jsonb_build_object('thread_id', rec.id, 'last_at', rec.last_at, 'days_limit', stale_d, 'note', 'Unanswered >' || stale_d || 'd'),
          jsonb_build_object('kind', 'reopen_thread', 'thread_id', rec.id, 'prev_status', 'pending'),
          false
        );
      end if;
    elsif gate = 'dry_run' then
      n_threads := n_threads + 1;
      if not exists (select 1 from public.kr8_robot_log l where l.robot = 'self_fix' and l.action = 'would_expire_stale_thread' and l.target = tgt and l.at >= d0) then
        perform public.kr8_robot_record(
          'self_fix', 'would_expire_stale_thread', tgt,
          jsonb_build_object('thread_id', rec.id, 'last_at', rec.last_at, 'note', 'Would expire unanswered pending thread >' || stale_d || 'd'),
          null, true
        );
      end if;
    else
      exit;
    end if;
  end loop;

  -- Check broken handoffs BEFORE purging expired `kr8_handoff` tokens (`B-11`)
  if to_regclass('public.kr8_handoff') is not null then
    select count(*) filter (where used_at is null and expires_at < now() and created_at > now() - interval '6 hours')::int,
           count(*) filter (where used_at is not null and created_at > now() - interval '6 hours')::int
      into unused_handoffs_6h, used_handoffs_6h
      from public.kr8_handoff;

    if unused_handoffs_6h >= 5 and used_handoffs_6h = 0 then
      perform public.kr8_alert_raise(
        'selffix:handoff_broken', 'self_fix', 'amber',
        unused_handoffs_6h || ' browser handoff link(s) expired unused in 6h (0 succeeded)',
        'Members tapping Open in Chrome from LINE/IG may be hitting a broken /api/handoff route.',
        '#problems', jsonb_build_object('unused_6h', unused_handoffs_6h, 'used_6h', used_handoffs_6h)
      );
    else
      perform public.kr8_alert_clear('selffix:handoff_broken');
    end if;

    select count(*)::int into n_handoffs from public.kr8_handoff where expires_at < now() - interval '1 hour';
    if n_handoffs > 0 then
      gate := public.kr8_robot_can_act('self_fix');
      if gate = 'on' then
        delete from public.kr8_handoff where expires_at < now() - interval '1 hour';
        get diagnostics n_handoffs = row_count;
        perform public.kr8_robot_record(
          'self_fix', 'purge_expired_handoffs', 'kr8_handoff',
          jsonb_build_object('deleted', n_handoffs, 'note', 'Removed ' || n_handoffs || ' expired sign-in handoff token(s)'),
          jsonb_build_object('kind', 'noop'), false
        );
      elsif gate = 'dry_run' and not exists (
        select 1 from public.kr8_robot_log l where l.robot = 'self_fix' and l.action = 'would_purge_expired_handoffs' and l.at >= d0
      ) then
        perform public.kr8_robot_record(
          'self_fix', 'would_purge_expired_handoffs', 'kr8_handoff',
          jsonb_build_object('candidates', n_handoffs, 'note', 'Would remove ' || n_handoffs || ' expired handoff token(s)'),
          null, true
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
    tgt := '#' || coalesce(rec.member_no::text, '?');
    gate := public.kr8_robot_can_act('self_fix');
    if gate = 'on' then
      update public.kr8_members set here_until = null where user_id = rec.user_id;
      n_here := n_here + 1;
      perform public.kr8_robot_record(
        'self_fix', 'clear_expired_here_badge', tgt,
        jsonb_build_object('user_id', rec.user_id, 'expired_at', rec.here_until, 'note', 'Cleared expired here_until presence'),
        jsonb_build_object('kind', 'restore_here_until', 'user_id', rec.user_id, 'prev_here_until', rec.here_until),
        false
      );
    elsif gate = 'dry_run' then
      n_here := n_here + 1;
      if not exists (select 1 from public.kr8_robot_log l where l.robot = 'self_fix' and l.action = 'would_clear_expired_here_badge' and l.target = tgt and l.at >= d0) then
        perform public.kr8_robot_record(
          'self_fix', 'would_clear_expired_here_badge', tgt,
          jsonb_build_object('user_id', rec.user_id, 'expired_at', rec.here_until, 'note', 'Would clear expired here_until presence'),
          null, true
        );
      end if;
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
      tgt := rec.bucket_id || '/' || right(rec.name, 20);
      gate := public.kr8_robot_can_act('self_fix');
      if gate = 'on' then
        insert into public.kr8_storage_trash (bucket, name, user_id)
        values (rec.bucket_id, rec.name, rec.owner_uid)
        on conflict (bucket, name) do nothing
        returning id into tid;

        if tid is not null then
          n_orphans := n_orphans + 1;
          perform public.kr8_robot_record(
            'self_fix', 'queue_orphan_file', tgt,
            jsonb_build_object('bucket', rec.bucket_id, 'name', rec.name, 'uploaded_at', rec.created_at, 'note', 'Orphan upload >' || orphan_h || 'h queued to trash'),
            jsonb_build_object('kind', 'unqueue_trash', 'trash_id', tid),
            false
          );
        end if;
      elsif gate = 'dry_run' then
        n_orphans := n_orphans + 1;
        -- T-398 [A-07]: deduplicate per target per day so 25 orphans never burn daily_cap=50 in 1 hour!
        if not exists (select 1 from public.kr8_robot_log l where l.robot = 'self_fix' and l.action = 'would_queue_orphan_file' and l.target = tgt and l.at >= d0) then
          perform public.kr8_robot_record(
            'self_fix', 'would_queue_orphan_file', tgt,
            jsonb_build_object('bucket', rec.bucket_id, 'name', rec.name, 'uploaded_at', rec.created_at, 'note', 'Would queue >' || orphan_h || 'h orphan upload'),
            null, true
          );
        end if;
      else
        exit;
      end if;
    end loop;
  end if;

  -- ── F. Safe Fix 3: Retry stuck background jobs (place geocoding & push outbox claims) + 14d bloat prune ──
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
      tgt := 'place:' || left(rec.place_id::text, 8);
      gate := public.kr8_robot_can_act('self_fix');
      if gate = 'on' then
        update public.kr8_place_geo set state = 'retry', updated_at = now() where place_id = rec.place_id and state = 'asked';
        if found then
          n_geo := n_geo + 1;
          perform public.kr8_robot_record(
            'self_fix', 'retry_stuck_place_geo', tgt,
            jsonb_build_object('place_id', rec.place_id, 'asked_at', rec.asked_at, 'tries', rec.tries, 'note', 'Reset stuck geocode request (>30m) to retry'),
            jsonb_build_object('kind', 'restore_place_geo', 'place_id', rec.place_id, 'prev_state', 'asked'),
            false
          );
        end if;
      elsif gate = 'dry_run' then
        n_geo := n_geo + 1;
        if not exists (select 1 from public.kr8_robot_log l where l.robot = 'self_fix' and l.action = 'would_retry_stuck_place_geo' and l.target = tgt and l.at >= d0) then
          perform public.kr8_robot_record(
            'self_fix', 'would_retry_stuck_place_geo', tgt,
            jsonb_build_object('place_id', rec.place_id, 'asked_at', rec.asked_at, 'note', 'Would reset stuck geocode request (>30m) to retry'),
            null, true
          );
        end if;
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
      tgt := 'push:' || rec.id::text;
      gate := public.kr8_robot_can_act('self_fix');
      if gate = 'on' then
        update public.kr8_push_outbox set claimed_at = null where id = rec.id and state = 'queued';
        if found then
          n_push := n_push + 1;
          perform public.kr8_robot_record(
            'self_fix', 'retry_stuck_push_outbox', tgt,
            jsonb_build_object('outbox_id', rec.id, 'claimed_at', rec.claimed_at, 'tries', rec.tries, 'note', 'Released stuck push claim (>15m) for retry'),
            jsonb_build_object('kind', 'restore_push_claim', 'outbox_id', rec.id, 'prev_claimed_at', rec.claimed_at),
            false
          );
        end if;
      elsif gate = 'dry_run' then
        n_push := n_push + 1;
        if not exists (select 1 from public.kr8_robot_log l where l.robot = 'self_fix' and l.action = 'would_retry_stuck_push_outbox' and l.target = tgt and l.at >= d0) then
          perform public.kr8_robot_record(
            'self_fix', 'would_retry_stuck_push_outbox', tgt,
            jsonb_build_object('outbox_id', rec.id, 'claimed_at', rec.claimed_at, 'note', 'Would release stuck push claim (>15m)'),
            null, true
          );
        end if;
      else
        exit;
      end if;
    end loop;
  end if;

  -- T-398 [B-14]: Prune >14d cron & dry-run log bloat safely when ON
  if rmode = 'on' then
    begin
      delete from public.kr8_robot_log where dry_run and at < now() - interval '14 days';
      if to_regclass('cron.job_run_details') is not null then
        execute 'delete from cron.job_run_details where start_time < now() - interval ''14 days''';
      end if;
    exception when others then
      null;
    end;
  end if;

  note_txt := format(
    '%s · PDPA late %s · codes %s (short %s) · This or that %s days · threads %s · orphans %s · stuck %s',
    upper(rmode), pdpa_late, v_avail, short_n, tot_days, n_threads, n_orphans, (n_geo + n_push)
  );

  update public.kr8_robot
     set last_run  = now(),
         last_ok   = true,
         last_note = note_txt
   where name = 'self_fix';

  insert into public.kr8_heartbeat (job, every_sec, last_beat, last_ok, detail)
  values (
    'kr8_self_fix', 1800, now(), true,
    jsonb_build_object(
      'mode', rmode, 'pdpa_late', pdpa_late, 'vouchers', v_avail, 'truemoney_100', tm100_avail,
      'unstocked_pending', unstocked_pending, 'threads', n_threads, 'orphans', n_orphans, 'stuck_jobs', n_geo + n_push
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
    'truemoney_100_available', tm100_avail,
    'unstocked_pending', unstocked_pending,
    'help_sla_overdue', help_late,
    'reels_waiting_2h', reels_2h,
    'voucher_buy_url', buy_url,
    'stale_holds', stale_holds,
    'threads_handled', n_threads,
    'orphans_handled', n_orphans,
    'handoffs_handled', n_handoffs,
    'here_cleared', n_here,
    'stuck_geo_retried', n_geo,
    'stuck_push_retried', n_push
  );
end $function$;

CREATE OR REPLACE FUNCTION public.kr8_admin_morning_brief(p_include_test boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  reels_waiting_2h int := 0;
  reels_live int := 0;
  asks_today int := 0;
  held_n int := 0;
  held_thb int := 0;
  unstocked_n int := 0;
  unstocked_thb int := 0;
  avail_codes int := 0;
  tm100_avail int := 0;
  committed_100 int := 0;
  burn_7d int := 0;
  burn_24h int := 0;
  daily_burn numeric := 0;
  eff_burn numeric := 0;
  net_avail int := 0;
  days_left numeric := null;
  help_late int := 0;
  err_client int := 0;
  err_people int := 0;
  err_outbox int := 0;
  err_robot int := 0;
  err_cron int := 0;
  cron_fail_names text := '';
  err_total int := 0;
  stale_hb int := 0;
  open_reports int := 0;
  all_alerts jsonb := '[]'::jsonb;
  top3 jsonb := '[]'::jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  -- 1. Real members (pre-filtered via single scan)
  with mk as (
    select m.user_id, m.created_at, public.kr8_admin_v2_kind(m.user_id) as kind
      from public.kr8_members m
  )
  select count(*) filter (where kind = 'real')::int,
         count(*) filter (where kind = 'real' and created_at >= d0)::int
    into real_total, real_today
  from mk;

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
         count(*) filter (where p.kind = 'reel' and p.status = 'pending' and not p.hidden and p.created_at < now() - interval '2 hours')::int,
         count(*) filter (where p.kind = 'reel' and p.status = 'approved' and not p.hidden)::int,
         count(*) filter (where p.kind <> 'reel' and p.created_at >= d0)::int
    into reels_today, reels_waiting, reels_waiting_2h, reels_live, asks_today
  from public.kr8_posts p
  where p_include_test or public.kr8_admin_v2_kind(p.author) = 'real';

  -- 4. Held payouts + Unheld Out-of-Stock pending claims (`A-04`)
  select count(*) filter (where c.held)::int,
         coalesce(sum(c.amount_thb) filter (where c.held), 0)::int,
         count(*) filter (where not c.held)::int,
         coalesce(sum(c.amount_thb) filter (where not c.held), 0)::int
    into held_n, held_thb, unstocked_n, unstocked_thb
  from public.kr8_reward_claims c
  where c.status = 'pending' and (p_include_test or not c.is_test);

  -- 5. Voucher stock & Committed-Demand Burn (`B-04` + `B-05`, preserving exact existing JSON keys)
  select count(*)::int,
         count(*) filter (where k.brand = 'truemoney' and k.amount_thb = 100 and (k.expires_on is null or k.expires_on >= current_date))::int
    into avail_codes, tm100_avail
  from public.kr8_reward_codes k
  where k.status = 'available' and (p_include_test or not k.is_test);

  select unstocked_n
         + (select count(*)::int from public.kr8_prizes p where p.status = 'won' and (p_include_test or not p.is_test) and p.amount_thb = 100)
    into committed_100;

  select count(*)::int,
         count(*) filter (where coalesce(c.assigned_at, c.created_at) >= t24)::int
    into burn_7d, burn_24h
  from public.kr8_reward_claims c
  where c.status = 'assigned'
    and (p_include_test or not c.is_test)
    and coalesce(c.assigned_at, c.created_at) >= t7d;

  daily_burn := round((burn_7d::numeric / 7.0), 2);
  eff_burn := greatest(burn_24h::numeric, burn_7d::numeric / 7.0);
  net_avail := greatest(0, avail_codes - unstocked_n);

  if net_avail = 0 or unstocked_n > 0 then
    days_left := 0;
  elsif eff_burn > 0 then
    days_left := round((net_avail::numeric / eff_burn), 1);
  else
    days_left := null;
  end if;

  -- Help 1h SLA check (`> 45m` unanswered)
  if to_regclass('public.kr8_messages') is not null and to_regclass('public.kr8_threads') is not null then
    select count(*)::int into help_late
      from public.kr8_threads t
     where (public.kr8_is_team(t.user_a) or public.kr8_is_team(t.user_b))
       and not (public.kr8_is_team(t.user_a) and public.kr8_is_team(t.user_b))
       and exists (select 1 from public.kr8_messages m1 where m1.thread_id = t.id and not public.kr8_is_team(m1.sender) and not public.kr8_is_test_member(m1.sender) and m1.body like '[Help]%')
       and exists (
         select 1 from public.kr8_messages m2
          where m2.thread_id = t.id and not public.kr8_is_team(m2.sender) and not public.kr8_is_test_member(m2.sender)
            and m2.created_at < now() - interval '45 minutes' and m2.created_at > now() - interval '48 hours'
            and not exists (select 1 from public.kr8_messages r where r.thread_id = t.id and public.kr8_is_team(r.sender) and r.created_at > m2.created_at)
       );
  end if;

  -- 6. Errors in last 24h (0108 `kr8_client_event_is_error` preserved intact!)
  if to_regclass('public.kr8_client_events') is not null then
    select count(*)::int, count(distinct coalesce(e.user_id::text, 'anon:' || coalesce(e.code, '?')))::int
      into err_client, err_people
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
  where r.last_ok = false and r.last_run >= t24 and r.mode <> 'off' and not public.kr8_autopilot_paused();

  -- T-398 [A-09]: respect paused & mode <> 'off', exclude concurrent 'running' rows, include kring-line-followups
  if not public.kr8_autopilot_paused() and to_regclass('cron.job_run_details') is not null and to_regclass('cron.job') is not null then
    begin
      execute $q$
        select count(*)::int, coalesce(string_agg(s.jobname, ', ' order by s.jobname), '')
        from (
          select distinct on (j.jobid) j.jobname, d.status, d.end_time
          from cron.job j
          join cron.job_run_details d on d.jobid = j.jobid
          left join public.kr8_robot r0 on r0.name = regexp_replace(j.jobname, '^kr8_', '')
          where j.active
            and (j.jobname like 'kr8\_%' or j.jobname = 'kring-line-followups')
            and coalesce(r0.mode, 'on') <> 'off'
            and d.status <> 'running'
            and d.start_time > now() - interval '48 hours'
          order by j.jobid, d.start_time desc
        ) s
        left join public.kr8_robot r on r.name = regexp_replace(s.jobname, '^kr8_', '')
        where s.status = 'failed'
          and (r.last_run is null or s.end_time > r.last_run)
      $q$ into err_cron, cron_fail_names;
    exception when others then
      err_cron := 0;
      cron_fail_names := '';
    end;
  end if;
  err_robot := err_robot + err_cron;
  err_total := err_client + err_outbox + err_robot;

  select count(*)::int into stale_hb
  from public.kr8_heartbeat h
  left join public.kr8_robot r on r.name = regexp_replace(h.job, '^kr8_', '')
  where not public.kr8_autopilot_paused()
    and h.job not in ('health_watch', 'kr8_health_watch')
    and not (h.job in ('kr8_nightly_selftest', 'nightly_selftest') and coalesce(r.mode, 'dry_run') <> 'on')
    and coalesce(r.mode, 'on') <> 'off'
    and (
      (h.last_beat is not null and h.last_beat < now() - make_interval(secs => greatest(h.every_sec * 2, 1800)))
      or h.last_ok = false
    );

  select count(*)::int into open_reports from public.kr8_reports rp where rp.handled_at is null;

  -- 7. Unified prioritised Alert Centre list (`syn:fyi` daily grey spam removed per B-12 / C-7.2)
  with stored as (
    select a.id::text as id, a.dedupe_key, a.robot, a.severity, a.title, a.body, a.href, a.last_at as at, false as synthetic
    from public.kr8_robot_alerts a
    where a.cleared_at is null
      and not public.kr8_alert_about_test(a.dedupe_key, a.detail)   -- 0179: QA/test accounts never alert
  ),
  synth as (
    select 'syn:pending_no_stock'::text as id, 'selffix:pending_no_stock'::text as dedupe_key, 'self_fix'::text as robot, 'red'::text as severity,
           (unstocked_n || ' approved claim' || case when unstocked_n = 1 then '' else 's' end || ' (฿' || unstocked_thb || ') waiting for codes')::text as title,
           'Voucher stock ran out — paste fresh codes into Codes now.'::text as body,
           '#codes'::text as href, now() as at, true as synthetic
    where unstocked_n > 0
    union all
    select 'syn:help_sla', 'selffix:help_sla', 'self_fix', 'red',
           help_late || ' member Help chat' || case when help_late = 1 then '' else 's' end || ' waiting > 45 min',
           'Reply in Needs you before the 1-hour Help promise expires.',
           '#inbox', now(), true
    where help_late > 0
    union all
    select 'syn:cron_fail', 'sys:cron_failed', 'self_fix', 'red',
           ('Automatic timer stopped: ' || cron_fail_names)::text,
           'A scheduled background job stopped with an error. Open Autopilot for details.',
           '#autopilot', now(), true
    where err_cron > 0
    union all
    select 'syn:hb', 'sys:heartbeat_stale', 'health_watch', 'red',
           (stale_hb || ' automatic timer' || case when stale_hb = 1 then ' is' else 's are' end || ' late')::text,
           'Open Autopilot and tap Run checks to verify robot status.',
           '#autopilot', now(), true
    where stale_hb > 0

    -- 0179: the old ฿100-only stock line is gone (Founding is full); self_fix raises 'Buy voucher codes' from real prize demand
    union all
    select 'syn:errors', 'sys:errors_24h', 'health_watch',
           case when err_robot > 0 or err_people >= 3 then 'red' else 'amber' end,
           err_total || ' error' || case when err_total = 1 then '' else 's' end || ' on phones or timers (24h)',
           err_client || ' on phones (' || err_people || ' people) · ' || err_outbox || ' delivery · ' || err_robot || ' timer.',
           '#problems', now(), true
    where err_total > 0
  ),
  combined as (
    select * from stored
    union all
    select y.* from synth y where not exists (select 1 from stored s where s.dedupe_key = y.dedupe_key)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'dedupe_key', c.dedupe_key, 'robot', c.robot, 'severity', c.severity,
    'title', c.title, 'body', c.body, 'href', c.href, 'at', c.at, 'synthetic', c.synthetic
  ) order by
    case c.severity when 'red' then 1 when 'amber' then 2 else 3 end,
    c.at desc
  ), '[]'::jsonb) into all_alerts
  from combined c;

  -- 8. "3 things that need you" (RED outages & human-blocking queues FIRST!)
  with candidates as (
    select x ->> 'severity' as severity, x ->> 'title' as title, x ->> 'body' as sub, x ->> 'href' as href, 1 as prio, ord
    from jsonb_array_elements(all_alerts) with ordinality as t(x, ord)
    where (x ->> 'severity') = 'red'

    -- 0179: payouts are automatic (claim robot); a late one shows as the self_fix 'not decided after 1 hour' alert
    union all
    select 'amber', reels_waiting || ' Reel' || case when reels_waiting = 1 then '' else 's' end || ' waiting for approval',
           'You approve every Reel by hand. Approved Reels count on the weekly board.', '#inbox', 2, 20
    where reels_waiting > 0

    -- 0179: face checks and look-alikes are decided automatically (duplicate face = refused with a one-tap appeal)
    union all
    select x ->> 'severity', x ->> 'title', x ->> 'body', x ->> 'href', 3, 100 + ord
    from jsonb_array_elements(all_alerts) with ordinality as t(x, ord)
    where (x ->> 'severity') = 'amber'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'severity', c.severity, 'title', c.title, 'sub', c.sub, 'href', c.href
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
      'posts', jsonb_build_object('reels_today', reels_today, 'reels_waiting', reels_waiting, 'reels_waiting_2h', reels_waiting_2h, 'reels_live', reels_live, 'asks_today', asks_today),
      'held_payouts', jsonb_build_object('count', held_n, 'thb', held_thb, 'unstocked_count', unstocked_n, 'unstocked_thb', unstocked_thb),
      'voucher_stock', jsonb_build_object('available', avail_codes, 'truemoney_100', tm100_avail, 'committed_100', committed_100, 'burn_7d', burn_7d, 'burn_24h', burn_24h, 'daily_burn', daily_burn, 'days_left', days_left),
      'errors', jsonb_build_object('client_24h', err_client, 'client_people_24h', err_people, 'outbox_failed_24h', err_outbox, 'robot_failed_24h', err_robot, 'total', err_total),
      'top3_needs_you', top3
    )
  );
end $function$;

CREATE OR REPLACE FUNCTION public.kr8_admin_farming_cases()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  w0 timestamptz := public.kr8_week_start(now());
  r jsonb;
begin
  if not coalesce(public.kr8_is_admin(), false) then raise exception 'KR8_ADMIN_ONLY'; end if;

  with cfg as (select public.kr8_rcfg('like', 1) w_like, public.kr8_rcfg('save', 3) w_save, public.kr8_rcfg('traveller_mult', 2) mult,
                      public.kr8_rcfg('liker_min_age_hours', 72) min_age),
  realm as (select m.* from public.kr8_members m where not public.kr8_is_test_member(m.user_id) and not public.kr8_is_team(m.user_id)),
  -- every like / save on a Reel this week, not on your own
  gv as (
    select 'like'::text as what, l.user_id as giver, p.author as recv, l.post_id, l.created_at
      from public.kr8_post_likes l join public.kr8_posts p on p.id = l.post_id
     where p.kind = 'reel' and l.created_at >= w0 and l.user_id <> p.author
    union all
    select 'save'::text, s.user_id, p.author, s.post_id, s.created_at
      from public.kr8_post_saves s join public.kr8_posts p on p.id = s.post_id
     where p.kind = 'reel' and s.created_at >= w0 and s.user_id <> p.author
  ),
  opn as (   -- share-link opens by a signed-in member this week
    select o.opener as giver, p.author as recv, o.post_id, o.created_at
      from public.kr8_share_opens o join public.kr8_posts p on p.id = o.post_id
     where o.opener is not null and o.opener <> p.author and o.created_at >= w0
  ),
  tot as (select giver, count(*)::int as n, count(distinct recv)::int as people from gv group by giver),
  pr as (
    select giver, recv, count(*)::int as n, count(*) filter (where what = 'like')::int as likes, count(*) filter (where what = 'save')::int as saves,
           count(distinct post_id)::int as reels, min(created_at) as first_at
      from gv group by giver, recv
  ),
  cand as (
    select pr.*, t.n as total, t.people,
           (pr.n >= 2 and pr.n::numeric / greatest(t.n, 1) >= 0.8) as by_share,
           coalesce(case when gm.ref_code ~ '^k[0-9]{5,7}$' then substring(gm.ref_code from 2)::int end = rm.member_no
              and pr.first_at < gm.created_at + interval '24 hours' and pr.n::numeric / greatest(t.n, 1) >= 0.5, false) as by_link,
           exists (select 1 from public.kr8_protect_flags f where f.user_id = pr.giver and f.flag_key = 'ring_farming' and f.dismissed_at is null
                     and f.detail ->> 'partner_id' = pr.recv::text) as by_flag
      from pr join tot t on t.giver = pr.giver
      join realm gm on gm.user_id = pr.giver
      join realm rm on rm.user_id = pr.recv
  ),
  dec as (select * from public.kr8_farm_decisions where week_start = w0),
  flagged as (
    select c.* from cand c where c.by_share or c.by_link or c.by_flag
    union   -- givers the founder already decided on stay in the case
    select c.* from cand c join dec d on d.beneficiary = c.recv and c.giver = any (d.givers)
  ),
  cases as (
    select f.recv from flagged f group by f.recv
    having count(*) filter (where f.by_share) >= 3 or count(*) filter (where f.by_link) >= 2 or bool_or(f.by_flag)
    union
    select d.beneficiary from dec d
  ),
  board as (select b.member_id, b.rings, b.rk from public.kr8_week_board(w0, false) b),
  rv as (   -- the beneficiary's board Reels this week (what counts toward Rings)
    select p.id, p.author from public.kr8_posts p join cases k on k.recv = p.author
     where p.kind = 'reel' and p.status = 'approved' and not p.hidden and not coalesce(p.board_off, false)
       and p.created_at >= w0 and p.created_at < w0 + interval '7 days'
  ),
  val as (   -- Rings each flagged giver really added (same rules as kr8_reel_scores) and what one like from them is worth
    select f.recv, f.giver,
           coalesce(sum((case when g.what = 'like' then cfg.w_like when public.kr8_board_v2(w0) and not c.ver then 0 else cfg.w_save end) * (case when c.trav then cfg.mult else 1 end))
                    filter (where g.post_id is not null and c.ok and not public.kr8_linked(f.giver, f.recv)), 0)::int as rings_from,
           max(cfg.w_like * (case when c.trav then cfg.mult else 1 end))::int as one_like
      from flagged f cross join cfg
      join lateral (select coalesce(m.photo, '') <> '' and btrim(coalesce(m.first_name, '')) <> '' and not coalesce(m.ghost, false)
                           and (case when public.kr8_board_v2(w0)   -- 0179: Board v2 ignores unverified accounts under 24 h
                                     then m.verified or m.created_at < now() - make_interval(hours => public.kr8_rcfg('v2_unv_min_age_hours', 24))
                                     else m.verified or m.created_at < now() - make_interval(hours => cfg.min_age) end) as ok,
                           coalesce(m.verified, false) as ver,
                           (m.who = 'traveller' and (m.verified or public.kr8_rcfg('traveller_mult_needs_verified', 1) = 0)) as trav
                      from public.kr8_members m where m.user_id = f.giver) c on true
      left join gv g on g.giver = f.giver and g.recv = f.recv and g.post_id in (select id from rv where rv.author = f.recv)
     group by f.recv, f.giver
  ),
  grp as (select k.recv as uid, k.recv from cases k union all select f.giver, f.recv from flagged f),
  lk as (   -- same face / phone / Wi-Fi links between people inside one case
    select k.recv, jsonb_agg(distinct jsonb_build_object('a', l.a, 'b', l.b, 'reason', l.reason)) as links
      from cases k join public.kr8_account_links l on l.dismissed_at is null
       and l.a in (select uid from grp where grp.recv = k.recv) and l.b in (select uid from grp where grp.recv = k.recv)
     group by k.recv
  )
  select jsonb_build_object(
    'week_start', w0, 'now', now(),
    'weights', (select jsonb_build_object('like', w_like, 'save', w_save, 'traveller_mult', mult) from cfg),
    'paid_ranks', public.kr8_paid_ranks(),
    'board', coalesce((select jsonb_agg(jsonb_build_object('user_id', b.member_id, 'rings', b.rings, 'rank', b.rk) order by b.rk) from board b), '[]'::jsonb),
    'cases', coalesce((select jsonb_agg(jsonb_build_object(
        'beneficiary', jsonb_build_object('user_id', m.user_id, 'no', m.member_no, 'name', m.first_name, 'joined_at', m.created_at,
                        'verified', coalesce(m.verified, false), 'rank', b.rk, 'rings', coalesce(b.rings, 0),
                        'rings_full', public.kr8_farm_rings_if(w0, k.recv, 'full', '{}'),
                        'rings_once', public.kr8_farm_rings_if(w0, k.recv, 'once', (select array_agg(f.giver) from flagged f where f.recv = k.recv)),
                        'rings_none', public.kr8_farm_rings_if(w0, k.recv, 'none', (select array_agg(f.giver) from flagged f where f.recv = k.recv))),
        'decision', (select jsonb_build_object('score_mode', d.score_mode, 'givers', to_jsonb(d.givers), 'hold', d.hold, 'note', d.note, 'at', d.decided_at)
                       from dec d where d.beneficiary = k.recv),
        'links', coalesce((select lk.links from lk where lk.recv = k.recv), '[]'::jsonb),
        'givers', coalesce((select jsonb_agg(jsonb_build_object(
            'user_id', f.giver, 'no', gm.member_no, 'name', gm.first_name, 'joined_at', gm.created_at,
            'ref_code', nullif(gm.ref_code, ''), 'src_code', nullif(gm.src_code, ''),
            'ref_no', rf.member_no, 'ref_name', rf.first_name,
            'verified', coalesce(gm.verified, false), 'has_photo', coalesce(gm.photo, '') <> '', 'ghost', coalesce(gm.ghost, false),
            'ua', (select left(e.ua, 300) from public.kr8_client_events e where e.user_id = f.giver and e.ua is not null order by e.created_at desc limit 1),
            'ua2', (select left(o.ua, 300) from public.kr8_share_opens o where o.opener = f.giver and o.ua is not null order by o.created_at desc limit 1),
            'likes', f.likes, 'saves', f.saves, 'reels', f.reels,
            'opens', (select count(*)::int from opn where opn.giver = f.giver and opn.recv = k.recv),
            'given_total', f.total, 'people', f.people,
            'others', coalesce((select jsonb_agg(jsonb_build_object('no', om.member_no, 'name', om.first_name, 'n', x.n) order by x.n desc)
                                  from (select p2.recv, p2.n from pr p2 where p2.giver = f.giver and p2.recv <> k.recv order by p2.n desc limit 3) x
                                  left join public.kr8_members om on om.user_id = x.recv), '[]'::jsonb),
            'own_reels', (select count(*)::int from public.kr8_posts p where p.author = f.giver and p.kind = 'reel' and p.status = 'approved'),
            'first_give_at', f.first_at,
            'first_give_min', greatest(0, round(extract(epoch from (f.first_at - gm.created_at)) / 60))::int,
            'by_share', f.by_share, 'by_link', f.by_link, 'by_flag', f.by_flag,
            'rings_from', coalesce(v.rings_from, 0), 'one_like', coalesce(v.one_like, 1)) order by gm.created_at)
          from flagged f join public.kr8_members gm on gm.user_id = f.giver
          left join public.kr8_members rf on rf.member_no = case when gm.ref_code ~ '^k[0-9]{5,7}$' then substring(gm.ref_code from 2)::int end
          left join val v on v.recv = f.recv and v.giver = f.giver
          where f.recv = k.recv), '[]'::jsonb))
      order by coalesce(b.rk, 9999), m.member_no)
      from cases k join public.kr8_members m on m.user_id = k.recv left join board b on b.member_id = k.recv), '[]'::jsonb)
  ) into r;
  return r;
end $function$;

-- clear open alerts that are about QA/test/team accounts (ids kept for the UNDO)
insert into public.kr8_autopilot_kv (key, val)
select 'm0179_cleared_alerts', coalesce(string_agg(a.id::text, ','), '') from public.kr8_robot_alerts a
 where a.cleared_at is null and public.kr8_alert_about_test(a.dedupe_key, a.detail)
on conflict (key) do update set val = excluded.val, updated_at = now();
update public.kr8_robot_alerts a set cleared_at = now(), cleared_by = 'auto: QA/test account (0179)'
 where a.cleared_at is null and public.kr8_alert_about_test(a.dedupe_key, a.detail);
-- the old ฿100-only restock alert is replaced by the demand-based one on the next self_fix run
select public.kr8_alert_clear('selffix:voucher_restock');

-- weekend push waves 2 and 3 (logic = push_wave2.sql / push_wave3.sql PART 1, recomputed at send time)
create or replace function public.kr8_push_wave_rows(p_wave text)
 returns setof jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $fn$
select to_jsonb(z) from (
with cfg as (
  select p_wave wave,
         public.kr8_week_start(now())                    w0,
         public.kr8_week_start(now()) + interval '7 days' ends,   -- Sun 23:59:59 Bangkok
         public.kr8_paid_ranks()                          paid,    -- 8
         public.kr8_rcfg('min_rings_for_paid_seat', 25)   flr),    -- 25
tl as (select greatest(1, ceil(extract(epoch from (c.ends - now())) / 3600))::int h from cfg c),
board as (   -- the live board, recomputed at the moment this runs
  select b.member_id, b.rings, b.rk, b.reels ->> 0 reel
  from cfg c, public.kr8_week_board(c.w0, false) b),
q as (       -- k = paid ranks already at/over the 25-Ring line; uc = prizes nobody holds yet
  select count(b.*) filter (where b.rk <= c.paid and b.rings >= c.flr)::int k,
         max(b.rings) filter (where b.rk = c.paid) line_rings, c.paid, c.flr
  from cfg c left join board b on true group by c.paid, c.flr),
txt as (
  select (select wave from cfg) wave, t.h, q.k, q.paid, q.flr, q.line_rings, (q.paid - q.k) uc,
    case when t.h >= 44 then round(t.h / 24.0)::int || ' days left' when t.h = 1 then '1 hour left' else t.h || ' hours left' end t_en,
    case when t.h >= 44 then 'เหลืออีก ' || round(t.h / 24.0)::int || ' วัน' else 'เหลืออีก ' || t.h || ' ชม.' end t_th,
    case when q.paid - q.k >= 2 then '#' || (q.k + 1) || '–#' || q.paid || ' prizes unclaimed'
         when q.paid - q.k = 1 then '#' || q.paid || ' prize unclaimed' end h_en,
    case when q.paid - q.k >= 2 then 'รางวัลอันดับ ' || (q.k + 1) || '–' || q.paid || ' ยังว่างอยู่'
         when q.paid - q.k = 1 then 'รางวัลอันดับ ' || q.paid || ' ยังว่างอยู่' end h_th,
    'Share your Reel to IG Story/TikTok: +5 Rings per friend who opens it.'::text sh_en,
    'Invite a friend: +10 Rings each when they do the face check 🚀'::text inv_en,
    'แชร์รีลลงสตอรี่ IG หรือ TikTok เพื่อนเปิดดู 1 คน = +5 ริง'::text sh_th,
    'ชวนเพื่อนสมัคร + สแกนหน้า รับ +10 ริง ทั้งคู่ครับ'::text inv_th
  from tl t, q),
mem as (     -- real members only (0176: no ghosts, Kring Team, QA/test, mirror), no minors held, no banned
  select m.user_id, m.member_no, m.first_name, coalesce(m.verified, false) verified,
         case when exists (select 1 from public.kr8_messages x where x.sender = m.user_id and x.body ~ '[ก-๙]') then 'th'
              when 'EN' = any(m.langs) and not ('TH' = any(m.langs)) then 'en'
              when 'TH' = any(m.langs) then 'th' else 'en' end lang,
         exists (select 1 from public.kr8_push_subs s where s.user_id = m.user_id) has_push,
         exists (select 1 from public.kr8_posts p where p.author = m.user_id and p.kind = 'reel' and p.status = 'approved'
                   and not p.hidden and p.created_at >= (select w0 from cfg)) live_reel
  from public.kr8_members m
  where public.kr8_is_real_member(m.user_id)
    and not public.kr8_minor_held(m.user_id)
    and not exists (select 1 from public.kr8_prize_bans x where x.user_id = m.user_id and x.scope = 'all')),
seg as (
  select mm.*, b.rk, b.rings, b.reel, pv.rings prev_rings, nx.rings next_rings,
         case when mm.verified and b.rk is not null then 'A'
              when mm.verified and not mm.live_reel then 'B'
              when not mm.verified then 'C'
              else 'skip' end seg   -- skip = verified, live Reel, but not on the board (needs a look, not a nudge)
  from mem mm
  left join board b  on b.member_id = mm.user_id
  left join board pv on pv.rk = b.rk - 1
  left join board nx on nx.rk = b.rk + 1),
calc as (
  select s.*, x.*,
    case when s.seg <> 'A' then null
         when s.rk = 1 and s.rings >= x.flr then 'top1'
         when s.rk <= x.paid and s.rings >= x.flr then 'up'
         else 'climb' end st,
    case when s.rk <= x.paid and s.rings >= x.flr and s.rk > 1 then s.rk - 1
         when x.k < x.paid then x.k + 1 else x.paid end tgt,
    case when s.rk = 1 and s.rings >= x.flr then s.rings - coalesce(s.next_rings, 0)
         when s.rk <= x.paid and s.rings >= x.flr then s.prev_rings - s.rings + 1
         when x.k < x.paid then x.flr - coalesce(s.rings, 0)
         else greatest(1, x.line_rings - coalesce(s.rings, 0) + 1) end need
  from seg s, txt x
  where s.seg <> 'skip'),
r as (
  select c.*, '฿' || to_char(public.kr8_prize_for(c.tgt), 'FM9,999') prize,
    case
      when c.st = 'top1'  then format('⏰ %s · You''re #1, Bangkok''s face of the week so far, %s Rings ahead of #2. %s %s', c.t_en, c.need, c.sh_en, c.inv_en)
      when c.st = 'up'    then format('⏰ %s · You''re #%s, just %s Rings from #%s (%s). %s %s', c.t_en, c.rk, c.need, c.tgt, '฿' || to_char(public.kr8_prize_for(c.tgt), 'FM9,999'), c.sh_en, c.inv_en)
      when c.st = 'climb' and c.tgt >= c.rk then format('⏰ %s · You''re #%s, just %s Rings from the 25-Ring line for %s. %s %s', c.t_en, c.rk, c.need, '฿' || to_char(public.kr8_prize_for(c.tgt), 'FM9,999'), c.sh_en, c.inv_en)
      when c.st = 'climb' then format('⏰ %s · %sYou''re #%s, %s Rings from #%s (%s). %s %s', c.t_en, coalesce(c.h_en || '. ', ''), c.rk, c.need, c.tgt, '฿' || to_char(public.kr8_prize_for(c.tgt), 'FM9,999'), c.sh_en, c.inv_en)
      when c.seg = 'B' and c.uc > 0 then format('%s weekly prizes still unclaimed 🎁 %s. Post 1 Reel, share it to your IG Story or TikTok: +5 Rings per friend who opens it. %s', c.uc, c.t_en, c.inv_en)
      when c.seg = 'B'    then format('The weekly board closes soon 🎁 %s. Post 1 Reel, share it to your IG Story or TikTok: +5 Rings per friend who opens it. %s', c.t_en, c.inv_en)
      when c.seg = 'C' and c.rk is not null then format('You''re #%s, but prizes need your 3-second face check ✨ %s. Do it now, then %s %s', c.rk, c.t_en, lower(left(c.sh_en, 1)) || substr(c.sh_en, 2), c.inv_en)
      when c.seg = 'C'    then format('Friends can push you up the board, but only after your 3-second face check ✨ %s. Do it now, post 1 Reel, share it to IG Story/TikTok: +5 Rings per friend''s open. %s', c.t_en, c.inv_en)
    end body_en,
    case
      when c.st = 'top1'  then format('⏰ %s · ตอนนี้คุณคือหน้าเด่นแห่งสัปดาห์ของกรุงเทพฯ นำอันดับ 2 อยู่ %s ริง %s %s', c.t_th, c.need, c.sh_th, c.inv_th)
      when c.st = 'up'    then format('⏰ %s · ตอนนี้คุณอันดับ %s อีกแค่ %s ริง ก็ขึ้นอันดับ %s (%s) %s %s', c.t_th, c.rk, c.need, c.tgt, '฿' || to_char(public.kr8_prize_for(c.tgt), 'FM9,999'), c.sh_th, c.inv_th)
      when c.st = 'climb' and c.tgt >= c.rk then format('⏰ %s · คุณอันดับ %s อีกแค่ %s ริง ก็ถึงเส้น 25 ริง รับ %s %s %s', c.t_th, c.rk, c.need, '฿' || to_char(public.kr8_prize_for(c.tgt), 'FM9,999'), c.sh_th, c.inv_th)
      when c.st = 'climb' then format('⏰ %s · %sคุณอันดับ %s อีก %s ริง ก็ขึ้นอันดับ %s (%s) %s %s', c.t_th, coalesce(c.h_th || '! ', ''), c.rk, c.need, c.tgt, '฿' || to_char(public.kr8_prize_for(c.tgt), 'FM9,999'), c.sh_th, c.inv_th)
      when c.seg = 'B' and c.uc > 0 then format('🎁 รางวัลประจำสัปดาห์ยังว่างอยู่ %s รางวัล %s! โพสต์รีล 1 คลิป แล้ว%s %s', c.uc, c.t_th, c.sh_th, c.inv_th)
      when c.seg = 'B'    then format('🎁 บอร์ดประจำสัปดาห์ใกล้ปิดแล้ว %s! โพสต์รีล 1 คลิป แล้ว%s %s', c.t_th, c.sh_th, c.inv_th)
      when c.seg = 'C' and c.rk is not null then format('✨ คุณอยู่อันดับ %s แล้ว แต่จะรับรางวัลได้ต้องสแกนหน้า 3 วินาทีก่อน %s สแกนเลย แล้ว%s %s', c.rk, c.t_th, c.sh_th, c.inv_th)
      when c.seg = 'C'    then format('✨ เพื่อนช่วยดันคุณขึ้นบอร์ดได้ แต่ต้องสแกนหน้า 3 วินาทีก่อน %s สแกนเลย แล้วโพสต์รีล 1 คลิป แชร์ลงสตอรี่ IG หรือ TikTok เพื่อนเปิดดู 1 คน = +5 ริง %s', c.t_th, c.inv_th)
    end body_th
  from calc c)
select r.wave, r.seg, coalesce(r.st, case when r.seg = 'C' and r.rk is not null then 'on_board' when r.seg = 'C' then 'no_rank' else 'no_reel' end) st,
       r.member_no, r.first_name, r.user_id, r.lang, r.rk, r.rings, r.need, r.tgt, r.has_push,
       case when r.lang = 'th' then r.body_th else r.body_en end body,
       r.body_en,
       case when r.lang = 'th' then 'กริ๊ง! · บอร์ดประจำสัปดาห์ ⏰ ' || r.t_th else 'Kring weekly board ⏰ ' || r.t_en end title,
       case when r.reel is not null then '/app/?reel=' || r.reel else '/app/?tab=me' end url,
       r.uc unclaimed, r.h
from r
) z
$fn$;
revoke all on function public.kr8_push_wave_rows(text) from public, anon, authenticated;
grant execute on function public.kr8_push_wave_rows(text) to service_role;

create or replace function public.kr8_push_wave_send(p_wave text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare w jsonb; uid uuid; n_chat int := 0; n_push int := 0; n_skip int := 0; k text := 'push_wave_sent:' || p_wave; res jsonb;
        planned date := case p_wave when 'w2' then date '2026-11-21' when 'w3' then date '2026-11-22' end;
begin
  if planned is null then raise exception 'KR8_BAD_WAVE'; end if;
  if public.kr8_rcfg('push_waves_on', 0) <> 1 then return jsonb_build_object('wave', p_wave, 'skipped', 'switch off'); end if;
  if (now() at time zone 'Asia/Bangkok')::date <> planned then return jsonb_build_object('wave', p_wave, 'skipped', 'not its day'); end if;
  if exists (select 1 from public.kr8_autopilot_kv where key = k) then return jsonb_build_object('wave', p_wave, 'skipped', 'already sent'); end if;
  insert into public.kr8_autopilot_kv (key, val) values (k, 'sending ' || now()::text);
  for w in select r from public.kr8_push_wave_rows(p_wave) r
            order by r ->> 'seg', (r ->> 'rk')::int nulls last, (r ->> 'member_no')::int loop
    uid := (w ->> 'user_id')::uuid;
    if exists (select 1 from public.kr8_messages x join public.kr8_threads t on t.id = x.thread_id
                where uid in (t.user_a, t.user_b) and public.kr8_is_team(x.sender)
                  and x.body = w ->> 'body' and x.created_at > now() - interval '12 hours') then
      n_skip := n_skip + 1; continue;
    end if;
    perform public.kr8_admin_team_reply_en(uid, w ->> 'body', w ->> 'body_en');
    n_chat := n_chat + 1;
    perform public.kr8_push_queue('admin', uid, false, w ->> 'title', w ->> 'body', w ->> 'url', md5(p_wave || ':' || uid::text)::uuid, true);
    n_push := n_push + 1;
  end loop;
  res := jsonb_build_object('wave', p_wave, 'chat', n_chat, 'push', n_push, 'skipped_12h', n_skip, 'at', now());
  update public.kr8_autopilot_kv set val = res::text, updated_at = now() where key = k;
  perform public.kr8_robot_record('growth_nudges', 'push_wave_sent', p_wave, res, null, false);
  return res;
end $$;
revoke all on function public.kr8_push_wave_send(text) from public, anon, authenticated;
grant execute on function public.kr8_push_wave_send(text) to service_role;

select cron.schedule('kr8_push_wave2', '0 3 21 11 *', $c$select public.kr8_push_wave_send('w2')$c$);   -- Sat 21 Nov 10:00 Bangkok
select cron.schedule('kr8_push_wave3', '0 11 22 11 *', $c$select public.kr8_push_wave_send('w3')$c$);  -- Sun 22 Nov 18:00 Bangkok

-- 9am brief (phone, ntfy via the cloud canary worker)
create or replace function public.kr8_brief_due(p_force boolean default false)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare d date := (now() at time zone 'Asia/Bangkok')::date; hh int := extract(hour from now() at time zone 'Asia/Bangkok')::int;
        test_now boolean := exists (select 1 from public.kr8_autopilot_kv where key = 'brief_test_now' and val = '1');
        b jsonb; br jsonb; new24 int; reels_w int; paid_n int; paid_thb int; top text; hrs int; tot_days int; needs text; red_n int; msg text;
begin
  if not p_force and not test_now then
    if hh < 9 or hh >= 12 then return null; end if;
    if exists (select 1 from public.kr8_autopilot_kv where key = 'brief_sent_day' and val = d::text) then return null; end if;
  end if;
  b := public.kr8_admin_morning_brief(false);
  br := b -> 'brief';
  select count(*)::int into new24 from public.kr8_members m where m.created_at > now() - interval '24 hours' and public.kr8_is_real_member(m.user_id);
  reels_w := coalesce((br -> 'posts' ->> 'reels_waiting')::int, 0);
  select count(*)::int, coalesce(sum(c.amount_thb), 0)::int into paid_n, paid_thb from public.kr8_reward_claims c
   where c.status = 'assigned' and not c.is_test and coalesce(c.assigned_at, c.created_at) > now() - interval '24 hours';
  select string_agg(format('#%s %s %s', x.rk, case when m.first_name ~ '[ก-๙]' then 'member ' || m.member_no || ' (Thai name)' else m.first_name || ' #' || m.member_no end, x.rings),
                    ' · ' order by x.rk) into top
    from (select * from public.kr8_week_board(public.kr8_week_start(now()), false) where rk <= 3) x join public.kr8_members m on m.user_id = x.member_id;
  hrs := greatest(0, ceil(extract(epoch from (public.kr8_week_start(now()) + interval '7 days' - now())) / 3600))::int;
  select coalesce(min(g), 31)::int into tot_days from generate_series(0, 30) g
   where not exists (select 1 from public.kr8_task_votes v where v.day = public.kr8_bkk_day() + g);
  select string_agg('• ' || (t ->> 'title'), E'\n') into needs from jsonb_array_elements(coalesce(br -> 'top3_needs_you', '[]')) t;
  select count(*)::int into red_n from jsonb_array_elements(coalesce(b -> 'alerts', '[]')) a where a ->> 'severity' = 'red';
  msg := format(E'%s new member%s in 24 h · %s real members\n%s Reel%s waiting for your approval\n%s prize%s paid automatically in 24 h (฿%s)\nBoard: %s · %s h left (25 Rings for a prize)\nThis or that: %s day%s queued',
           new24, case when new24 = 1 then '' else 's' end, coalesce(br -> 'new_members' ->> 'total', '?'),
           reels_w, case when reels_w = 1 then '' else 's' end, paid_n, case when paid_n = 1 then '' else 's' end, to_char(paid_thb, 'FM999,990'),
           coalesce(top, 'empty'), hrs, tot_days, case when tot_days = 1 then '' else 's' end)
         || case when needs is not null then E'\nNeeds you:\n' || needs else E'\nNothing needs you.' end;
  return jsonb_build_object('day', d, 'priority', case when red_n > 0 then 4 else 3 end,
    'title', case when test_now then 'Kring 9am brief (test)' else 'Kring 9am brief' end, 'message', msg);
end $$;
revoke all on function public.kr8_brief_due(boolean) from public, anon, authenticated;
grant execute on function public.kr8_brief_due(boolean) to service_role;

create or replace function public.kr8_brief_mark(p_day date)
 returns void language sql security definer set search_path to 'public', 'pg_temp' as $$
  insert into public.kr8_autopilot_kv (key, val) values ('brief_sent_day', p_day::text)
  on conflict (key) do update set val = excluded.val, updated_at = now();
  delete from public.kr8_autopilot_kv where key = 'brief_test_now';
$$;
revoke all on function public.kr8_brief_mark(date) from public, anon, authenticated;
grant execute on function public.kr8_brief_mark(date) to service_role;
