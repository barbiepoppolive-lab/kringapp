-- 0103 · Kring Autopilot v2 — M6: Growth Nudges (DRY-RUN ONLY, shows what WOULD be sent + TH/EN copy for founder approval)
--
-- ADDITIVE & RE-RUNNABLE (idempotent). Built on live-base (8a29fdb) + 0098..0102.
-- HARD RULE: Strictly DRY-RUN only — ZERO push notifications, ZERO emails, ZERO chat messages are ever sent to members.
-- Implements:
--   1. SQL banned-word guard public.kr8_member_copy_clean(text) enforcing zero banned words across all Thai + English
--      member-facing copy (meet, guide, tour, host, creator, review/reviews, hidden gem, alcohol, gift, wallet, credit,
--      lucky, draw, temple/temples, coins, launch, truemoney, %, ลุ้น, ไกด์, ทัวร์, รีวิว, เหล้า, วัด, นัดเจอ, เดท, ไปด้วยกัน).
--   2. Table public.kr8_growth_nudge_templates (RLS on, admin-only, CHECK constraint enforcing kr8_member_copy_clean)
--      seeded with natural Bangkok Thai + English copy for all 4 cohorts + founder approval flag.
--   3. DB trigger locking kr8_robot('growth_nudges') out of mode = 'on' until explicitly unlocked in a future migration.
--   4. Preview & daily pg_cron DRY-RUN logger:
--      - public.kr8_growth_nudges_compute()
--      - public.kr8_robot_growth_nudges_run()  (scheduled daily 08:45 IST = 03:15 UTC, logs dry_run = true only)
--      - public.kr8_admin_growth_nudges_preview()
--      - public.kr8_admin_growth_nudge_approve(text, boolean)
--
-- UNDO:
--   begin;
--   do $$ begin
--     if exists (select 1 from pg_extension where extname = 'pg_cron') then
--       perform cron.unschedule(jobid) from cron.job where jobname = 'kr8_growth_nudges';
--     end if;
--   end $$;
--   delete from public.kr8_heartbeat where job = 'kr8_growth_nudges';
--   drop trigger if exists kr8_growth_nudges_lock_trg on public.kr8_robot;
--   drop function if exists public.kr8_growth_nudges_lock_fn();
--   drop function if exists public.kr8_admin_growth_nudge_approve(text, boolean);
--   drop function if exists public.kr8_admin_growth_nudges_preview();
--   drop function if exists public.kr8_robot_growth_nudges_run();
--   drop function if exists public.kr8_growth_nudges_compute();
--   drop table if exists public.kr8_growth_nudge_templates;
--   drop function if exists public.kr8_member_copy_clean(text);
--   commit;

begin;

-- ───────────────────────── 1. Banned-word guard for member-facing copy ─────────────────────────
create or replace function public.kr8_member_copy_clean(p_text text)
returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
declare
  raw text := coalesce(p_text, '');
  lo  text := lower(raw);
begin
  if btrim(raw) = '' then
    return false;
  end if;

  -- English banned words (whole words / phrases) + '%'
  if position('%' in raw) > 0 then
    return false;
  end if;

  if lo ~ '\m(meet|meets|meeting|meetup|guide|guides|guided|tour|tours|host|hosts|hosted|hosting|creator|creators|review|reviews|alcohol|gift|gifts|wallet|wallets|credit|credits|lucky|draw|draws|temple|temples|coin|coins|launch|truemoney)\M'
     or lo ~ 'hidden\s+gems?' then
    return false;
  end if;

  -- Thai banned words
  if raw ~ '(ลุ้น|ไกด์|ทัวร์|รีวิว|เหล้า|เบียร์|แอลกอฮอล์|วัด|นัดเจอ|เดท|ไปด้วยกัน|เหรียญ|กระเป๋าเงิน|ของขวัญ)' then
    return false;
  end if;

  return true;
end $$;
revoke all on function public.kr8_member_copy_clean(text) from public, anon, authenticated;

-- ───────────────────────── 2. Bilingual templates table & DRY-RUN DB lock ─────────────────────────
create table if not exists public.kr8_growth_nudge_templates (
  cohort_key          text primary key check (cohort_key in ('card_incomplete_24h', 'face_unverified_24h', 'dormant_7d', 'weekly_winners_post')),
  ord                 int not null default 1,
  label               text not null,
  title_th            text not null,
  title_en            text not null,
  body_th             text not null,
  body_en             text not null,
  approved_by_founder boolean not null default false,
  approved_at         timestamptz,
  updated_at          timestamptz not null default now(),
  constraint kr8_growth_nudge_copy_clean_chk check (
    public.kr8_member_copy_clean(title_th)
    and public.kr8_member_copy_clean(title_en)
    and public.kr8_member_copy_clean(body_th)
    and public.kr8_member_copy_clean(body_en)
  )
);
alter table public.kr8_growth_nudge_templates enable row level security;
revoke all on public.kr8_growth_nudge_templates from public, anon, authenticated;

insert into public.kr8_growth_nudge_templates (cohort_key, ord, label, title_th, title_en, body_th, body_en)
values
  (
    'card_incomplete_24h',
    1,
    'Card incomplete after 24 h',
    'เติมการ์ดโปรไฟล์ให้ครบใน 30 วินาที',
    'Finish your profile card in 30 seconds',
    'เพิ่มรูปจริงกับแนะนำตัวสั้นๆ เพื่อให้เพื่อนสมาชิกในกรุงเทพฯ เห็นโพสต์และคลิปของคุณบนฟีดได้เต็มที่',
    'Add a real photo and a short bio line so people in Bangkok can see your posts and Reels on the feed.'
  ),
  (
    'face_unverified_24h',
    2,
    'New member not face-checked after 24 h',
    'ยืนยันใบหน้า 3 วินาที เปิดการมองเห็นบนฟีด',
    '3-second face check to appear on the feed',
    'แตะตรวจใบหน้าจากกล้องมือถือเพียงครั้งเดียว ระบบเช็กเฉพาะรหัสตัวเลขบนเครื่อง เพื่อให้โปรไฟล์และรีลของคุณแสดงบนกระดานประจำสัปดาห์',
    'Complete a quick 3-second camera check once (your selfie stays on your phone) so your card and Reels appear on the feed and weekly board.'
  ),
  (
    'dormant_7d',
    3,
    'Dormant 7 days',
    'สัปดาห์นี้เพื่อนๆ แชร์มุมอร่อยเพียบเลย',
    'Fresh Bangkok spots on the feed this week',
    'แวะดูรีลใหม่จากคนในย่านอารีย์ ทองหล่อ และตลาดน้อย หรือลงคลิปสั้นปักหมุดร้านโปรดของคุณเพื่อสะสมแต้ม Rings ประจำสัปดาห์',
    'See new Reels from locals around Ari, Thonglor, and Talad Noi — or drop a short clip with a place pin to earn weekly Rings.'
  ),
  (
    'weekly_winners_post',
    4,
    'Weekly board winners post draft',
    'ประกาศผลอันดับกระดานประจำสัปดาห์ Kring!',
    'This week''s Kring board leaders are in!',
    'ยินดีกับอันดับบนกระดานประจำสัปดาห์นี้ ({leaders}) ที่แบ่งปันคลิปมุมดีๆ ในไทย! สัปดาห์ใหม่เริ่มนับแต้ม Rings แล้ว ลงรีลพร้อมปักหมุดสถานที่ได้เลย',
    'Big shout-out to this week''s top board spots ({leaders}) for sharing authentic clips across Thailand! The new week''s Rings board is open — post a Reel with a place tag to climb.'
  )
on conflict (cohort_key) do update
   set ord      = excluded.ord,
       label    = excluded.label,
       title_th = excluded.title_th,
       title_en = excluded.title_en,
       body_th  = excluded.body_th,
       body_en  = excluded.body_en;

-- Hard DB trigger: growth_nudges cannot be switched to 'on' in M6 (DRY-RUN or OFF only)
create or replace function public.kr8_growth_nudges_lock_fn()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.name = 'growth_nudges' and new.mode = 'on' then
    raise exception 'KR8_DRY_RUN_ONLY';
  end if;
  return new;
end $$;
drop trigger if exists kr8_growth_nudges_lock_trg on public.kr8_robot;
create trigger kr8_growth_nudges_lock_trg
  before insert or update on public.kr8_robot
  for each row execute function public.kr8_growth_nudges_lock_fn();

insert into public.kr8_robot (name, title, note, mode, daily_cap, schedule)
values (
  'growth_nudges',
  'Growth nudges (DRY-RUN)',
  'DRY-RUN preview only: incomplete card >24h, unverified >24h, dormant 7d, and weekly winners post draft (TH+EN for founder approval).',
  'dry_run',
  200,
  '15 3 * * *'
)
on conflict (name) do update
   set title    = excluded.title,
       note     = excluded.note,
       mode     = case when public.kr8_robot.mode = 'on' then 'dry_run' else public.kr8_robot.mode end,
       schedule = excluded.schedule;

-- ───────────────────────── 3. Pure cohort preview calculator (ZERO sends!) ─────────────────────────
create or replace function public.kr8_growth_nudges_compute()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  c1_count int := 0;
  c1_nos   int[] := '{}';
  c2_count int := 0;
  c2_nos   int[] := '{}';
  c3_count int := 0;
  c3_nos   int[] := '{}';
  c4_nos   int[] := '{}';
  leaders_txt text;
  w0 timestamptz := public.kr8_week_start(now());
  t1 public.kr8_growth_nudge_templates;
  t2 public.kr8_growth_nudge_templates;
  t3 public.kr8_growth_nudge_templates;
  t4 public.kr8_growth_nudge_templates;
begin
  select * into t1 from public.kr8_growth_nudge_templates where cohort_key = 'card_incomplete_24h';
  select * into t2 from public.kr8_growth_nudge_templates where cohort_key = 'face_unverified_24h';
  select * into t3 from public.kr8_growth_nudge_templates where cohort_key = 'dormant_7d';
  select * into t4 from public.kr8_growth_nudge_templates where cohort_key = 'weekly_winners_post';

  -- Cohort 1: Card incomplete after 24 h (real/nocard signups >24h ago missing card, real photo, or bio)
  with cand as (
    select u.id as user_id, m.member_no, u.created_at
      from auth.users u
      left join public.kr8_members m on m.user_id = u.id
     where u.created_at < now() - interval '24 hours'
       and public.kr8_admin_v2_kind(u.id) in ('real', 'nocard')
       and (
         m.user_id is null
         or not coalesce(m.photo like 'data:image/%' and length(m.photo) > 200 and coalesce(m.photo_check, 'ok') = 'ok', false)
         or btrim(coalesce(m.bio, '')) = ''
       )
     order by u.created_at desc
  )
  select count(*)::int,
         coalesce(array(select c.member_no from cand c where c.member_no is not null limit 8), '{}'::int[])
    into c1_count, c1_nos
    from cand;

  -- Cohort 2: New member not face-checked after 24 h (real card >24h old, not verified, no pending verification)
  with cand as (
    select m.user_id, m.member_no, m.created_at
      from public.kr8_members m
     where m.created_at < now() - interval '24 hours'
       and public.kr8_admin_v2_kind(m.user_id) = 'real'
       and not coalesce(m.verified, false)
       and not exists (
         select 1 from public.kr8_verifications v where v.user_id = m.user_id and v.status = 'pending'
       )
     order by m.created_at desc
  )
  select count(*)::int,
         coalesce(array(select c.member_no from cand c where c.member_no is not null limit 8), '{}'::int[])
    into c2_count, c2_nos
    from cand;

  -- Cohort 3: Dormant 7 days (real member whose last activity was >7 days ago)
  with cand as (
    select m.user_id, m.member_no, coalesce(m.last_active_at, m.updated_at, m.created_at) as seen_at
      from public.kr8_members m
     where public.kr8_admin_v2_kind(m.user_id) = 'real'
       and coalesce(m.last_active_at, m.updated_at, m.created_at) < now() - interval '7 days'
     order by seen_at asc
  )
  select count(*)::int,
         coalesce(array(select c.member_no from cand c where c.member_no is not null limit 8), '{}'::int[])
    into c3_count, c3_nos
    from cand;

  -- Cohort 4: Weekly board winners post draft (top 3 real board rows)
  select string_agg(format('#%s (%s Rings)', b.rk, b.rings), ' · ' order by b.rk),
         coalesce(array_agg(m.member_no order by b.rk) filter (where m.member_no is not null), '{}'::int[])
    into leaders_txt, c4_nos
    from (select * from public.kr8_week_board(w0, false) order by rk asc limit 3) b
    left join public.kr8_members m on m.user_id = b.member_id;

  leaders_txt := coalesce(nullif(leaders_txt, ''), '#1–#3 on this week''s board');

  return jsonb_build_array(
    jsonb_build_object(
      'key', t1.cohort_key,
      'label', t1.label,
      'would_send_count', c1_count,
      'sample_nos', to_jsonb(c1_nos),
      'title_th', t1.title_th,
      'title_en', t1.title_en,
      'body_th', t1.body_th,
      'body_en', t1.body_en,
      'approved_by_founder', t1.approved_by_founder
    ),
    jsonb_build_object(
      'key', t2.cohort_key,
      'label', t2.label,
      'would_send_count', c2_count,
      'sample_nos', to_jsonb(c2_nos),
      'title_th', t2.title_th,
      'title_en', t2.title_en,
      'body_th', t2.body_th,
      'body_en', t2.body_en,
      'approved_by_founder', t2.approved_by_founder
    ),
    jsonb_build_object(
      'key', t3.cohort_key,
      'label', t3.label,
      'would_send_count', c3_count,
      'sample_nos', to_jsonb(c3_nos),
      'title_th', t3.title_th,
      'title_en', t3.title_en,
      'body_th', t3.body_th,
      'body_en', t3.body_en,
      'approved_by_founder', t3.approved_by_founder
    ),
    jsonb_build_object(
      'key', t4.cohort_key,
      'label', t4.label,
      'would_send_count', 1,
      'sample_nos', to_jsonb(c4_nos),
      'title_th', t4.title_th,
      'title_en', t4.title_en,
      'body_th', replace(t4.body_th, '{leaders}', leaders_txt),
      'body_en', replace(t4.body_en, '{leaders}', leaders_txt),
      'approved_by_founder', t4.approved_by_founder
    )
  );
end $$;
revoke all on function public.kr8_growth_nudges_compute() from public, anon, authenticated;

-- ───────────────────────── 4. Daily DRY-RUN runner + Admin RPCs ─────────────────────────
create or replace function public.kr8_robot_growth_nudges_run()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  rmode text;
  cohorts jsonb;
  c jsonb;
  total_would int := 0;
begin
  if public.kr8_autopilot_paused() then
    return jsonb_build_object('skipped', 'paused', 'sent_count', 0, 'at', now());
  end if;

  rmode := public.kr8_robot_mode('growth_nudges');
  if rmode = 'off' then
    return jsonb_build_object('skipped', 'off', 'sent_count', 0, 'at', now());
  end if;

  cohorts := public.kr8_growth_nudges_compute();

  for c in select * from jsonb_array_elements(cohorts) loop
    total_would := total_would + coalesce((c ->> 'would_send_count')::int, 0);
  end loop;

  perform public.kr8_robot_record(
    'growth_nudges',
    'would_send_growth_nudges',
    '4 cohorts',
    jsonb_build_object(
      'sent_count', 0,
      'would_send_total', total_would,
      'note', format('DRY-RUN preview: would nudge %s recipient(s) across 4 cohorts (0 sent)', total_would)
    ),
    null,
    true
  );

  update public.kr8_robot
     set last_run  = now(),
         last_ok   = true,
         last_note = format('DRY-RUN · would reach %s across 4 cohorts · 0 sent', total_would)
   where name = 'growth_nudges';

  insert into public.kr8_heartbeat (job, every_sec, last_beat, last_ok, detail)
  values (
    'kr8_growth_nudges',
    86400,
    now(),
    true,
    jsonb_build_object('mode', 'dry_run', 'sent_count', 0, 'would_send_total', total_would)
  )
  on conflict (job) do update
     set every_sec = excluded.every_sec,
         last_beat = excluded.last_beat,
         last_ok   = excluded.last_ok,
         detail    = excluded.detail;

  return jsonb_build_object(
    'at', now(),
    'mode', 'dry_run',
    'dry_run_locked', true,
    'sent_count', 0,
    'would_send_total', total_would,
    'cohorts', cohorts
  );
end $$;
revoke all on function public.kr8_robot_growth_nudges_run() from public, anon, authenticated;

create or replace function public.kr8_admin_growth_nudges_preview()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  cohorts jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  cohorts := public.kr8_growth_nudges_compute();
  return jsonb_build_object(
    'at', now(),
    'mode', public.kr8_robot_mode('growth_nudges'),
    'dry_run_locked', true,
    'sent_count', 0,
    'cohorts', cohorts
  );
end $$;
revoke all on function public.kr8_admin_growth_nudges_preview() from public, anon;
grant execute on function public.kr8_admin_growth_nudges_preview() to authenticated;

create or replace function public.kr8_admin_growth_nudge_approve(p_cohort_key text, p_approved boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  update public.kr8_growth_nudge_templates
     set approved_by_founder = coalesce(p_approved, false),
         approved_at         = case when coalesce(p_approved, false) then now() else null end,
         updated_at          = now()
   where cohort_key = p_cohort_key;
  if not found then raise exception 'KR8_BAD_ACTION'; end if;

  insert into public.kr8_admin_actions_log (action, detail)
  values (
    'growth_nudge_copy_review',
    jsonb_build_object('cohort_key', p_cohort_key, 'approved', coalesce(p_approved, false), 'by', auth.uid())
  );

  return jsonb_build_object('ok', true, 'cohort_key', p_cohort_key, 'approved_by_founder', coalesce(p_approved, false));
end $$;
revoke all on function public.kr8_admin_growth_nudge_approve(text, boolean) from public, anon;
grant execute on function public.kr8_admin_growth_nudge_approve(text, boolean) to authenticated;

-- ───────────────────────── 5. Schedule daily pg_cron job (08:45 IST = 03:15 UTC) ─────────────────────────
insert into public.kr8_heartbeat (job, every_sec, last_beat, last_ok, detail)
values ('kr8_growth_nudges', 86400, now(), true, '{"note":"0103 M6 registered (DRY-RUN only)"}'::jsonb)
on conflict (job) do nothing;

do $$ begin
  perform public.kr8_schedule_job(
    'kr8_growth_nudges',
    '15 3 * * *',
    'select public.kr8_robot_growth_nudges_run()'
  );
end $$;

commit;
