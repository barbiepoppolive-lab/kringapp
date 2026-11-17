-- 0102 · Kring Autopilot v2 — M5: Protect Robot (flags, never auto-ban, >=3 reports auto-hide undoable, feeds kr8_trust)
--
-- ADDITIVE & RE-RUNNABLE (idempotent). Built on live-base (8a29fdb) + 0098..0101.
-- Implements:
--   1. Protection flags table public.kr8_protect_flags (RLS on, admin-only, NEVER auto-bans):
--      - 'link_tries'     : repeated blocked web-link tries in chat (kr8_link_tries >= 3 in 7d or >= 5 total)
--      - 'scam_chat'      : money / scam / crypto / gambling / LINE-ID hunting phrases in chat (kr8_chat_scam_reason)
--      - 'shared_signals' : same face / device / Wi-Fi as another member (kr8_account_links + kr8_face_decisions)
--      - 'ring_farming'   : pairs that mainly like/save each other's Reels (>=3 given, >=80% to partner, >=2 mutual)
--   2. Post reports >= 3 -> auto-hide post (sets hidden = true without firing member push, logged in kr8_robot_log with
--      lossless Undo 'unhide_post', raises amber alert so founder decides). Defaults to DRY-RUN ('protect' mode = 'dry_run').
--   3. Feeds public.kr8_trust(uuid) additively on top of live-base 0095:
--      - Preserves 100% of founder rules (ZERO Rings guard; shared Wi-Fi alone = 0, -10 only alongside another warning sign).
--      - Adds -25 for active non-dismissed 'scam_chat' flag and -15 for active non-dismissed 'ring_farming' flag.
--   4. Admin RPCs: public.kr8_admin_protect_overview() and public.kr8_admin_protect_dismiss(uuid, text).
--
-- UNDO:
--   begin;
--   do $$ begin
--     if exists (select 1 from pg_extension where extname = 'pg_cron') then
--       perform cron.unschedule(jobid) from cron.job where jobname = 'kr8_protect';
--     end if;
--   end $$;
--   delete from public.kr8_heartbeat where job = 'kr8_protect';
--   delete from public.kr8_robot_alerts where robot = 'protect' and dedupe_key like 'protect:%';
--   drop function if exists public.kr8_admin_protect_dismiss(uuid, text);
--   drop function if exists public.kr8_admin_protect_overview();
--   drop function if exists public.kr8_robot_protect_run();
--   drop function if exists public.kr8_chat_scam_reason(text);
--   drop table if exists public.kr8_protect_flags;
--   -- Re-run live-base 0095's kr8_trust(uuid) to revert the additive scam_chat / ring_farming lines.
--   commit;

begin;

-- ───────────────────────── 1. Protection flags table & robot registration ─────────────────────────
create table if not exists public.kr8_protect_flags (
  user_id      uuid not null references auth.users(id) on delete cascade,
  flag_key     text not null check (flag_key in ('link_tries', 'scam_chat', 'shared_signals', 'ring_farming')),
  severity     text not null default 'amber' check (severity in ('red', 'amber', 'grey')),
  summary      text not null,
  detail       jsonb not null default '{}'::jsonb,
  first_at     timestamptz not null default now(),
  last_at      timestamptz not null default now(),
  dismissed_at timestamptz,
  dismissed_by uuid,
  primary key (user_id, flag_key)
);
create index if not exists kr8_protect_flags_active_idx
  on public.kr8_protect_flags (severity, last_at desc)
  where dismissed_at is null;

alter table public.kr8_protect_flags enable row level security;
revoke all on public.kr8_protect_flags from public, anon, authenticated;

-- Keep protect defaulting to dry_run (never force ON; preserve founder choice if already changed)
insert into public.kr8_robot (name, title, note, mode, daily_cap, schedule)
values (
  'protect',
  'Protect',
  'Flags blocked-link tries, scam/money/LINE-hunting chat, shared face/device/Wi-Fi, Ring farming, and auto-hides posts at >=3 reports (never auto-bans).',
  'dry_run',
  50,
  '*/15 * * * *'
)
on conflict (name) do update
   set title    = excluded.title,
       note     = excluded.note,
       schedule = excluded.schedule;

-- ───────────────────────── 2. Pure chat scam / money / LINE-ID hunting detector ─────────────────────────
create or replace function public.kr8_chat_scam_reason(p_body text)
returns text language plpgsql immutable set search_path = public, pg_temp as $$
declare
  raw text := translate(coalesce(p_body, ''), '๐๑๒๓๔๕๖๗๘๙', '0123456789');
  lo  text := lower(raw);
begin
  if btrim(raw) = '' then
    return null;
  end if;

  -- 1. Money requests / bank transfer / remittance scams (English + Thai)
  if lo ~ '\m(send\s+(me\s+)?money|wire\s+money|transfer\s+money|western\s+union|moneygram|lend\s+me\s+money|need\s+money\s+urgently|bank\s+account\s+number)\M'
     or raw ~ '(โอนเงิน|ยืมเงิน|ร้อนเงิน|ขอเงินหน่อย|ช่วยโอน|โอนให้หน่อย|เลขบัญชี|พร้อมเพย์\s*[0-9]{8,})' then
    return 'money_request';
  end if;

  -- 2. Crypto / guaranteed-profit / gambling solicitation
  if lo ~ '\m(usdt|crypto\s+invest\w*|bitcoin\s+profit|forex\s+signal\w*|guaranteed\s+profit|whatsapp\s+me|telegram\s+me)\M'
     or raw ~ '(ชวนลงทุน|เทรดหุ้นกำไร|เว็บพนัน|บาคาร่า|สล็อตเว็บตรง|ปั่นบาคาร่า|หวยออนไลน์)' then
    return 'crypto_or_gambling';
  end if;

  -- 3. Off-platform LINE ID hunting
  if lo ~ '(\mline\s*(id)?\s*[:：=]|\mline\s*id\M|\mid\s*line\M|\madd\s+(my\s+)?line\M)'
     or raw ~ '(แอดไลน์|ทักไลน์|ไอดีไลน์|ไลน์ไอดี|ขอไลน์หน่อย)' then
    return 'line_hunting';
  end if;

  return null;
end $$;
revoke all on function public.kr8_chat_scam_reason(text) from public, anon, authenticated;

-- ───────────────────────── 3. Extend kr8_admin_robot_undo with unhide_ask_answer ─────────────────────────
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
           review_note = coalesce(l.undo ->> 'prev_note', review_note)
     where id = (l.undo ->> 'post_id')::uuid;
  elsif ukind = 'unhide_ask_answer' and (l.undo ->> 'answer_id') is not null and to_regclass('public.kr8_ask_answers') is not null then
    update public.kr8_ask_answers
       set hidden = coalesce((l.undo ->> 'prev_hidden')::boolean, false)
     where id = (l.undo ->> 'answer_id')::uuid;
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

-- ───────────────────────── 4. Feed kr8_trust(uuid) additively on top of live-base 0095 ─────────────────────────
-- Preserves 100% of live-base 0095 rules (NO Rings guard; shared Wi-Fi alone = 0, -10 only with another warning sign)
-- and adds active non-dismissed M5 flags: -25 scam_chat, -15 ring_farming.
create or replace function public.kr8_trust(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  m public.kr8_members;
  joined timestamptz;
  score int := 50;
  items jsonb := '[]'::jsonb;
  real_ph boolean := false;
  has_reel boolean := false;
  v_status text;
  same_no int;
  alike_no int;
  dev_no int;
  shared_wifi boolean := false;
  first_claim timestamptz;
  fast_claim boolean := false;
  total_lk int := 0;
  young_lk int := 0;
  link_tries int := 0;
  has_scam boolean := false;
  scam_kind text;
  has_farm boolean := false;
  farm_partner int;
  unk text := encode(extensions.digest('kr8-ip-salt|unknown', 'sha256'), 'hex');
begin
  if p_user is null then
    return jsonb_build_object('score', 0, 'reasons', '[]'::jsonb);
  end if;

  select * into m from public.kr8_members where user_id = p_user;
  select coalesce(m.created_at, u.created_at) into joined from auth.users u where u.id = p_user;
  joined := coalesce(joined, m.created_at, now());

  if m.user_id is null then
    return jsonb_build_object('score', 25, 'reasons', jsonb_build_array('−25 no member card yet'));
  end if;

  -- +30 face verified (or -20 if latest verification was refused)
  if coalesce(m.verified, false) then
    score := score + 30;
    items := items || jsonb_build_array(jsonb_build_object('w', 30, 't', '+30 face verified'));
  else
    select v.status into v_status from public.kr8_verifications v where v.user_id = p_user order by v.created_at desc limit 1;
    if v_status = 'rejected' then
      score := score - 20;
      items := items || jsonb_build_array(jsonb_build_object('w', 20, 't', '−20 face check refused'));
    end if;
  end if;

  -- +10 real photo (same rule as 0087)
  real_ph := coalesce(m.photo like 'data:image/%' and length(m.photo) > 200 and coalesce(m.photo_check, 'ok') = 'ok', false);
  if real_ph then
    score := score + 10;
    items := items || jsonb_build_array(jsonb_build_object('w', 10, 't', '+10 real photo'));
  end if;

  -- +10 approved Reel
  select exists (
    select 1 from public.kr8_posts p
    where p.author = p_user and p.kind = 'reel' and p.status = 'approved' and not p.hidden and not p.board_off
  ) into has_reel;
  if has_reel then
    score := score + 10;
    items := items || jsonb_build_array(jsonb_build_object('w', 10, 't', '+10 approved Reel'));
  end if;

  -- -40 same face as #N (dup_sim >= 0.60 or face-api dist < 0.40, not dismissed) / -20 borderline look-alike
  select om.member_no into same_no
  from (
    select case when l.a = p_user then l.b else l.a end as other_id
    from public.kr8_account_links l
    where (l.a = p_user or l.b = p_user) and l.dismissed_at is null and l.reason = 'face'
      and (coalesce((l.detail ->> 'sface_sim')::float8, 0) >= 0.60
           or ((l.detail ->> 'dist') is not null and (l.detail ->> 'dist')::float8 < 0.40))
    union
    select d.dup_user as other_id
    from public.kr8_face_decisions d
    where d.user_id = p_user and d.dup_user is not null and d.dup_user <> p_user and coalesce(d.dup_sim, 0) >= 0.60
      and not exists (
        select 1 from public.kr8_account_links dl
        where dl.a = least(p_user, d.dup_user) and dl.b = greatest(p_user, d.dup_user) and dl.dismissed_at is not null
      )
  ) s
  join public.kr8_members om on om.user_id = s.other_id
  order by om.member_no asc nulls last limit 1;

  if same_no is not null then
    score := score - 40;
    items := items || jsonb_build_array(jsonb_build_object('w', 40, 't', '−40 same face as #' || same_no));
  else
    select om.member_no into alike_no
    from public.kr8_account_links l
    join public.kr8_members om on om.user_id = (case when l.a = p_user then l.b else l.a end)
    where (l.a = p_user or l.b = p_user) and l.dismissed_at is null and l.reason = 'face'
    order by om.member_no asc nulls last limit 1;
    if alike_no is not null then
      score := score - 20;
      items := items || jsonb_build_array(jsonb_build_object('w', 20, 't', '−20 looks like #' || alike_no));
    end if;
  end if;

  -- -35 same phone as #N, else track shared Wi-Fi
  select om.member_no into dev_no
  from public.kr8_account_links l
  join public.kr8_members om on om.user_id = (case when l.a = p_user then l.b else l.a end)
  where (l.a = p_user or l.b = p_user) and l.dismissed_at is null and l.reason = 'device'
  order by om.member_no asc nulls last limit 1;

  if dev_no is not null then
    score := score - 35;
    items := items || jsonb_build_array(jsonb_build_object('w', 35, 't', '−35 same phone as #' || dev_no));
  else
    select (
      exists (
        select 1 from public.kr8_account_links l
        where (l.a = p_user or l.b = p_user) and l.dismissed_at is null and l.reason = 'network'
      )
      or exists (
        select 1 from public.kr8_reward_claims c1
        join public.kr8_reward_claims c2 on c2.member_id <> c1.member_id
          and ((c1.ip_hash is not null and c1.ip_hash <> unk and c1.ip_hash = c2.ip_hash)
               or (c1.device is not null and c1.device = c2.device))
        where c1.member_id = p_user and not c1.is_test and not c2.is_test
      )
    ) into shared_wifi;
  end if;

  -- -20 claimed within 15 min of joining
  select min(c.created_at) into first_claim
  from public.kr8_reward_claims c
  where c.member_id = p_user and not c.is_test;
  if first_claim is not null and first_claim <= joined + interval '15 minutes' then
    fast_claim := true;
    score := score - 20;
    items := items || jsonb_build_array(jsonb_build_object('w', 20, 't', '−20 claimed within 15 min of joining'));
  end if;

  -- -15 likes mostly from accounts <24h old
  select count(*)::int,
         count(*) filter (where l.created_at < lm.created_at + interval '24 hours')::int
    into total_lk, young_lk
  from public.kr8_posts p
  join public.kr8_post_likes l on l.post_id = p.id and l.user_id <> p_user
  join public.kr8_members lm on lm.user_id = l.user_id
  where p.author = p_user and p.kind = 'reel' and not p.hidden;
  if total_lk >= 3 and young_lk * 2 > total_lk then
    score := score - 15;
    items := items || jsonb_build_array(jsonb_build_object('w', 15, 't', '−15 likes mostly from accounts <24h old'));
  end if;

  -- -10 repeated blocked link tries in chat (0090 / 0102 M5)
  if to_regclass('public.kr8_link_tries') is not null then
    select count(*)::int into link_tries from public.kr8_link_tries where user_id = p_user;
    if link_tries >= 2 and not exists (
      select 1 from public.kr8_protect_flags pf
       where pf.user_id = p_user and pf.flag_key = 'link_tries' and pf.dismissed_at is not null
    ) then
      score := score - 10;
      items := items || jsonb_build_array(jsonb_build_object('w', 10, 't', '−10 tried sending web links in chat (' || link_tries || 'x)'));
    end if;
  end if;

  -- 0102 M5: -25 money / scam / LINE-ID hunting phrase in chat (unless dismissed by founder)
  if to_regclass('public.kr8_protect_flags') is not null then
    select true, coalesce(pf.detail ->> 'reason', 'scam_chat')
      into has_scam, scam_kind
      from public.kr8_protect_flags pf
     where pf.user_id = p_user and pf.flag_key = 'scam_chat' and pf.dismissed_at is null
     limit 1;
    if coalesce(has_scam, false) then
      score := score - 25;
      items := items || jsonb_build_array(jsonb_build_object(
        'w', 25,
        't', case scam_kind
               when 'money_request' then '−25 money request phrase in chat'
               when 'crypto_or_gambling' then '−25 crypto / gambling phrase in chat'
               else '−25 LINE-ID hunting phrase in chat'
             end
      ));
    end if;

    -- 0102 M5: -15 mutual Ring-farming pair (unless dismissed by founder)
    select true, (pf.detail ->> 'partner_no')::int
      into has_farm, farm_partner
      from public.kr8_protect_flags pf
     where pf.user_id = p_user and pf.flag_key = 'ring_farming' and pf.dismissed_at is null
     limit 1;
    if coalesce(has_farm, false) then
      score := score - 15;
      items := items || jsonb_build_array(jsonb_build_object(
        'w', 15,
        't', '−15 Ring farming pair' || coalesce(' with #' || farm_partner::text, '')
      ));
    end if;
  end if;

  -- -10 same Wi-Fi as a claimer: ONLY with another warning sign; alone it counts 0 (founder 18 Nov)
  if shared_wifi and (same_no is not null or alike_no is not null or link_tries >= 2 or fast_claim or coalesce(has_scam, false) or coalesce(has_farm, false)) then
    score := score - 10;
    items := items || jsonb_build_array(jsonb_build_object('w', 10, 't', '−10 same Wi-Fi as a claimer'));
  end if;

  score := least(100, greatest(0, score));
  return jsonb_build_object(
    'score', score,
    'reasons', coalesce((
      select jsonb_agg(x -> 't' order by (x ->> 'w')::int desc)
      from jsonb_array_elements(items) x
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.kr8_trust(uuid) from public, anon, authenticated;

-- ───────────────────────── 5. Protect runner (15-min pg_cron + manual trigger) ─────────────────────────
create or replace function public.kr8_robot_protect_run()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  rmode text;
  unk text := encode(extensions.digest('kr8-ip-salt|unknown', 'sha256'), 'hex');
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

  -- ── 1. Repeated blocked-link tries (kr8_link_tries >= 3 in 7d or >= 5 total) ──
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
        rec.user_id,
        'link_tries',
        case when rec.tries_7d >= 6 then 'red' else 'amber' end,
        format('%s blocked web-link attempt(s) in 7d (%s total)', rec.tries_7d, rec.tries_all),
        jsonb_build_object('tries_7d', rec.tries_7d, 'tries_total', rec.tries_all, 'latest_at', rec.latest_at),
        rec.latest_at
      )
      on conflict (user_id, flag_key) do update
         set severity     = excluded.severity,
             summary      = excluded.summary,
             detail       = excluded.detail,
             last_at      = excluded.last_at,
             dismissed_at = case
                              when kr8_protect_flags.dismissed_at is not null and excluded.last_at > kr8_protect_flags.dismissed_at
                              then null
                              else kr8_protect_flags.dismissed_at
                            end;
    end loop;
  end if;

  -- ── 2. Money / scam / LINE-ID hunting phrases in chat (last 14 days, never auto-ban!) ──
  if to_regclass('public.kr8_messages') is not null then
    for rec in
      with hits as (
        select msg.sender as user_id,
               public.kr8_chat_scam_reason(msg.body) as reason,
               msg.created_at
          from public.kr8_messages msg
          join public.kr8_members m on m.user_id = msg.sender
         where msg.created_at > now() - interval '14 days'
           and not public.kr8_is_test_member(msg.sender)
           and not public.kr8_is_team(msg.sender)
      )
      select h.user_id,
             count(*)::int as hit_count,
             (array_agg(h.reason order by (case h.reason when 'money_request' then 1 when 'crypto_or_gambling' then 2 else 3 end), h.created_at desc))[1] as top_reason,
             max(h.created_at) as latest_at
        from hits h
       where h.reason is not null
       group by h.user_id
    loop
      n_scam := n_scam + 1;
      insert into public.kr8_protect_flags (user_id, flag_key, severity, summary, detail, last_at)
      values (
        rec.user_id,
        'scam_chat',
        case when rec.top_reason in ('money_request', 'crypto_or_gambling') then 'red' else 'amber' end,
        format('%s (%s message%s in 14d)', replace(rec.top_reason, '_', ' '), rec.hit_count, case when rec.hit_count = 1 then '' else 's' end),
        jsonb_build_object('reason', rec.top_reason, 'hits_14d', rec.hit_count, 'latest_at', rec.latest_at),
        rec.latest_at
      )
      on conflict (user_id, flag_key) do update
         set severity     = excluded.severity,
             summary      = excluded.summary,
             detail       = excluded.detail,
             last_at      = excluded.last_at,
             dismissed_at = case
                              when kr8_protect_flags.dismissed_at is not null and excluded.last_at > kr8_protect_flags.dismissed_at
                              then null
                              else kr8_protect_flags.dismissed_at
                            end;
    end loop;
  end if;

  -- ── 3. Shared face / device / Wi-Fi signals across members ──
  for rec in
    with links as (
      select u.uid as user_id,
             array_agg(distinct l.reason order by l.reason) as reasons,
             count(distinct u.other_id)::int as peers,
             max(l.last_at) as latest_at
        from public.kr8_account_links l
        cross join lateral (
          values (l.a, l.b), (l.b, l.a)
        ) u(uid, other_id)
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
      rec.user_id,
      'shared_signals',
      case when 'face' = any(rec.reasons) or 'device' = any(rec.reasons) then 'amber' else 'grey' end,
      format('Shared %s with %s other account(s)', array_to_string(rec.reasons, ' / '), rec.peers),
      jsonb_build_object('reasons', to_jsonb(rec.reasons), 'peers', rec.peers, 'latest_at', rec.latest_at),
      coalesce(rec.latest_at, now())
    )
    on conflict (user_id, flag_key) do update
       set severity = excluded.severity,
           summary  = excluded.summary,
           detail   = excluded.detail,
           last_at  = excluded.last_at;
  end loop;

  -- ── 4. Ring farming detector (pairs that mainly like/save each other's Reels) ──
  for rec in
    with interactions as (
      select l.user_id as giver, p.author as receiver, l.created_at
        from public.kr8_post_likes l
        join public.kr8_posts p on p.id = l.post_id
       where p.kind = 'reel' and not p.hidden and l.user_id <> p.author
      union all
      select s.user_id as giver, p.author as receiver, s.created_at
        from public.kr8_post_saves s
        join public.kr8_posts p on p.id = s.post_id
       where p.kind = 'reel' and not p.hidden and s.user_id <> p.author
    ),
    totals as (
      select giver, count(*)::int as total_given
        from interactions
       group by giver
      having count(*) >= 3
    ),
    pairs as (
      select i.giver, i.receiver, count(*)::int as pair_given, max(i.created_at) as latest_at
        from interactions i
       group by i.giver, i.receiver
    )
    select p1.giver as user_id,
           p1.receiver as partner_id,
           om.member_no as partner_no,
           p1.pair_given,
           t1.total_given,
           p2.pair_given as partner_back,
           greatest(p1.latest_at, p2.latest_at) as latest_at
      from pairs p1
      join totals t1 on t1.giver = p1.giver
      join pairs p2 on p2.giver = p1.receiver and p2.receiver = p1.giver
      join public.kr8_members m on m.user_id = p1.giver
      join public.kr8_members om on om.user_id = p1.receiver
     where p1.pair_given >= 3
       and p2.pair_given >= 2
       and (p1.pair_given::numeric / greatest(t1.total_given, 1)) >= 0.80
       and not public.kr8_is_test_member(p1.giver)
       and not public.kr8_is_team(p1.giver)
  loop
    n_farm := n_farm + 1;
    insert into public.kr8_protect_flags (user_id, flag_key, severity, summary, detail, last_at)
    values (
      rec.user_id,
      'ring_farming',
      'amber',
      format('%s/%s Reel likes+saves went to #%s (%s back)', rec.pair_given, rec.total_given, coalesce(rec.partner_no::text, '?'), rec.partner_back),
      jsonb_build_object(
        'partner_id', rec.partner_id,
        'partner_no', rec.partner_no,
        'given_to_partner', rec.pair_given,
        'total_given', rec.total_given,
        'received_from_partner', rec.partner_back
      ),
      rec.latest_at
    )
    on conflict (user_id, flag_key) do update
       set severity     = excluded.severity,
           summary      = excluded.summary,
           detail       = excluded.detail,
           last_at      = excluded.last_at,
           dismissed_at = case
                            when kr8_protect_flags.dismissed_at is not null and excluded.last_at > kr8_protect_flags.dismissed_at
                            then null
                            else kr8_protect_flags.dismissed_at
                          end;
  end loop;

  -- ── 5. Reports >= 3 -> auto-hide post (logged, undoable via unhide_post) + founder decides ──
  for rec in
    select p.id as post_id,
           p.author,
           p.kind,
           p.status,
           p.hidden,
           p.review_note,
           m.member_no,
           count(distinct r.reporter)::int as reporters
      from public.kr8_reports r
      join public.kr8_posts p on p.id = r.post_id
      left join public.kr8_members m on m.user_id = p.author
     where r.post_id is not null
       and r.handled_at is null
     group by p.id, p.author, p.kind, p.status, p.hidden, p.review_note, m.member_no
    having count(distinct r.reporter) >= 3
  loop
    open_rep_posts := open_rep_posts + 1;

    if not coalesce(rec.hidden, false) then
      gate := public.kr8_robot_can_act('protect');
      if gate = 'act' then
        -- Set hidden = true ONLY (never status = 'hidden' with review_note, so 0070 push trigger does not message the member)
        update public.kr8_posts set hidden = true where id = rec.post_id and not coalesce(hidden, false);
        if found then
          n_hidden := n_hidden + 1;
          perform public.kr8_robot_record(
            'protect',
            'auto_hide_reported_post',
            'post:' || left(rec.post_id::text, 8),
            jsonb_build_object(
              'post_id', rec.post_id,
              'author_no', rec.member_no,
              'reporters', rec.reporters,
              'note', format('Auto-hid %s by #%s after %s distinct reports (founder decides final action)', rec.kind, coalesce(rec.member_no::text, '?'), rec.reporters)
            ),
            jsonb_build_object(
              'kind', 'unhide_post',
              'post_id', rec.post_id,
              'prev_hidden', false,
              'prev_status', rec.status,
              'prev_note', rec.review_note
            ),
            false
          );
        end if;
      elsif gate = 'dry_run' then
        if not exists (
          select 1 from public.kr8_robot_log l
           where l.robot = 'protect'
             and l.action = 'would_hide_reported_post'
             and l.detail ->> 'post_id' = rec.post_id::text
             and l.at >= public.kr8_bkk_day_start(now())
        ) then
          n_hidden := n_hidden + 1;
          perform public.kr8_robot_record(
            'protect',
            'would_hide_reported_post',
            'post:' || left(rec.post_id::text, 8),
            jsonb_build_object(
              'post_id', rec.post_id,
              'author_no', rec.member_no,
              'reporters', rec.reporters,
              'note', format('Would auto-hide %s by #%s (%s reports)', rec.kind, coalesce(rec.member_no::text, '?'), rec.reporters)
            ),
            null,
            true
          );
        end if;
      end if;
    elsif not exists (
      select 1 from public.kr8_robot_log l
       where l.robot = 'protect'
         and l.action = 'auto_hide_reported_post'
         and l.detail ->> 'post_id' = rec.post_id::text
    ) and rmode = 'on' then
      -- Post was hidden at insert-time by 0070 trigger; record Undo entry so founder can unhide in 1 tap from Autopilot too
      perform public.kr8_robot_record(
        'protect',
        'auto_hide_reported_post',
        'post:' || left(rec.post_id::text, 8),
        jsonb_build_object(
          'post_id', rec.post_id,
          'author_no', rec.member_no,
          'reporters', rec.reporters,
          'note', format('Post by #%s hidden at %s reports — awaiting founder review', coalesce(rec.member_no::text, '?'), rec.reporters)
        ),
        jsonb_build_object(
          'kind', 'unhide_post',
          'post_id', rec.post_id,
          'prev_hidden', false,
          'prev_status', rec.status,
          'prev_note', rec.review_note
        ),
        false
      );
    end if;
  end loop;

  -- ── 6. Reconcile founder alerts in Alert Centre (NEVER auto-bans!) ──
  select count(*)::int into active_scam
    from public.kr8_protect_flags
   where flag_key = 'scam_chat' and dismissed_at is null;

  select count(*)::int into active_farm
    from public.kr8_protect_flags
   where flag_key = 'ring_farming' and dismissed_at is null;

  if active_scam > 0 then
    perform public.kr8_alert_raise(
      'protect:scam_chat',
      'protect',
      'amber',
      active_scam || ' member(s) flagged for money / scam / LINE-hunting chat',
      'Robots never auto-ban. Review flagged account(s) in Autopilot or People and decide.',
      jsonb_build_object('flagged_members', active_scam),
      '#autopilot'
    );
  else
    perform public.kr8_alert_clear('protect:scam_chat');
  end if;

  if active_farm > 0 then
    perform public.kr8_alert_raise(
      'protect:ring_farming',
      'protect',
      'amber',
      active_farm || ' member(s) in mutual Ring-farming pairs',
      'Trust score adjusted (-15). Review pair activity before weekly prize approval.',
      jsonb_build_object('flagged_members', active_farm),
      '#autopilot'
    );
  else
    perform public.kr8_alert_clear('protect:ring_farming');
  end if;

  if open_rep_posts > 0 then
    perform public.kr8_alert_raise(
      'protect:reported_posts',
      'protect',
      'amber',
      open_rep_posts || ' post(s) reached >= 3 reports · founder decision needed',
      'Post auto-hidden (undoable in Autopilot). Review in Needs you to restore or keep hidden.',
      jsonb_build_object('posts', open_rep_posts),
      '#inbox'
    );
  else
    perform public.kr8_alert_clear('protect:reported_posts');
  end if;

  update public.kr8_robot
     set last_run  = now(),
         last_ok   = true,
         last_note = format(
           '%s · scam %s · links %s · farm %s · >=3 rep %s',
           upper(rmode), active_scam, n_links, active_farm, open_rep_posts
         )
   where name = 'protect';

  insert into public.kr8_heartbeat (job, every_sec, last_beat, last_ok, detail)
  values (
    'kr8_protect',
    900,
    now(),
    true,
    jsonb_build_object('mode', rmode, 'scam_chat', active_scam, 'ring_farming', active_farm, 'reported_posts', open_rep_posts)
  )
  on conflict (job) do update
     set every_sec = excluded.every_sec,
         last_beat = excluded.last_beat,
         last_ok   = excluded.last_ok,
         detail    = excluded.detail;

  return jsonb_build_object(
    'at', now(),
    'mode', rmode,
    'link_tries_flagged', n_links,
    'scam_chat_flagged', active_scam,
    'shared_signals_flagged', n_shared,
    'ring_farming_flagged', active_farm,
    'reported_posts_3plus', open_rep_posts,
    'posts_hidden_now', n_hidden
  );
end $$;
revoke all on function public.kr8_robot_protect_run() from public, anon, authenticated;

-- ───────────────────────── 6. Admin RPCs for Protect overview & Dismiss ─────────────────────────
create or replace function public.kr8_admin_protect_overview()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  return jsonb_build_object(
    'at', now(),
    'mode', public.kr8_robot_mode('protect'),
    'counts', jsonb_build_object(
      'scam_chat', (select count(*)::int from public.kr8_protect_flags where flag_key = 'scam_chat' and dismissed_at is null),
      'link_tries', (select count(*)::int from public.kr8_protect_flags where flag_key = 'link_tries' and dismissed_at is null),
      'ring_farming', (select count(*)::int from public.kr8_protect_flags where flag_key = 'ring_farming' and dismissed_at is null),
      'shared_signals', (select count(*)::int from public.kr8_protect_flags where flag_key = 'shared_signals' and dismissed_at is null),
      'reported_posts_3plus', (
        select count(*)::int from (
          select r.post_id
            from public.kr8_reports r
           where r.post_id is not null and r.handled_at is null
           group by r.post_id
          having count(distinct r.reporter) >= 3
        ) z
      )
    ),
    'flags', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', pf.user_id,
        'member_no', m.member_no,
        'name', m.first_name,
        'flag_key', pf.flag_key,
        'severity', pf.severity,
        'summary', pf.summary,
        'detail', pf.detail,
        'last_at', pf.last_at,
        'trust', public.kr8_trust(pf.user_id)
      ) order by
        (case pf.severity when 'red' then 1 when 'amber' then 2 else 3 end),
        pf.last_at desc)
      from (
        select * from public.kr8_protect_flags
         where dismissed_at is null
         order by (case severity when 'red' then 1 when 'amber' then 2 else 3 end), last_at desc
         limit 60
      ) pf
      left join public.kr8_members m on m.user_id = pf.user_id
    ), '[]'::jsonb),
    'reported_posts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'post_id', p.id,
        'author_id', p.author,
        'member_no', m.member_no,
        'name', m.first_name,
        'kind', p.kind,
        'hidden', coalesce(p.hidden, false),
        'reporters', z.reporters,
        'latest_at', z.latest_at
      ) order by z.latest_at desc)
      from (
        select r.post_id, count(distinct r.reporter)::int as reporters, max(r.created_at) as latest_at
          from public.kr8_reports r
         where r.post_id is not null and r.handled_at is null
         group by r.post_id
        having count(distinct r.reporter) >= 3
      ) z
      join public.kr8_posts p on p.id = z.post_id
      left join public.kr8_members m on m.user_id = p.author
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.kr8_admin_protect_overview() from public, anon;
grant execute on function public.kr8_admin_protect_overview() to authenticated;

create or replace function public.kr8_admin_protect_dismiss(p_user uuid, p_flag_key text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_user is null or p_flag_key is null then raise exception 'KR8_BAD_ACTION'; end if;

  update public.kr8_protect_flags
     set dismissed_at = now(),
         dismissed_by = auth.uid()
   where user_id = p_user and flag_key = p_flag_key;

  insert into public.kr8_admin_actions_log (action, detail)
  values ('protect_flag_dismissed', jsonb_build_object('user_id', p_user, 'flag_key', p_flag_key, 'by', auth.uid()));

  if not exists (select 1 from public.kr8_protect_flags where flag_key = 'scam_chat' and dismissed_at is null) then
    perform public.kr8_alert_clear('protect:scam_chat');
  end if;
  if not exists (select 1 from public.kr8_protect_flags where flag_key = 'ring_farming' and dismissed_at is null) then
    perform public.kr8_alert_clear('protect:ring_farming');
  end if;

  return jsonb_build_object('ok', true, 'user_id', p_user, 'flag_key', p_flag_key);
end $$;
revoke all on function public.kr8_admin_protect_dismiss(uuid, text) from public, anon;
grant execute on function public.kr8_admin_protect_dismiss(uuid, text) to authenticated;

-- ───────────────────────── 7. Schedule 15-min pg_cron job ─────────────────────────
insert into public.kr8_heartbeat (job, every_sec, last_beat, last_ok, detail)
values ('kr8_protect', 900, now(), true, '{"note":"0102 M5 registered"}'::jsonb)
on conflict (job) do nothing;

do $$ begin
  perform public.kr8_schedule_job(
    'kr8_protect',
    '*/15 * * * *',
    'select public.kr8_robot_protect_run()'
  );
end $$;

commit;
