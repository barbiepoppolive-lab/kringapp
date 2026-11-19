-- 0148 (19 Nov 2026, applied 19 Nov late with 0150): the two robot checks, automatic.
-- 0150 note: the copied-Reel read now runs inside Feed quality (face-check-aws quality_scan, every 5 min); the separate
-- 10-min job below is not scheduled any more (0150 unschedules it).
-- Needs 0145 (kr8_reel_copy_checks), 0146 (kr8_age_checks) and the face-check-aws deploy with copyscan.ts.
-- Founder rules: no auto-hiding of Reels, no account closing. The robots only RECORD and raise an admin alert.
--
-- 1. Copied Reels: every 10 min pg_cron → face-check-aws { action: 'reel_copy_scan' } with the x-kring-robot header
--    (FACE_ROBOT_KEY, the same robot path as backfill / sweep). The function takes up to 10 Reels from kr8_reel_copy_todo
--    (pending Reels of the last 3 days with no check yet), reads the poster + the two scan frames the app uploads
--    (<video>.s1.jpg middle, .s2.jpg end; older app versions: poster only) with AWS DetectText, and writes
--    kr8_reel_copy_record. A copied Reel gets an amber alert; the Reel review card shows "⚠️ Looks copied from TikTok
--    (watermark 'TikTok')". Deno cannot run ffmpeg, so frames come from the phone (it already draws the poster).
--    Cost: ≤ 3 DetectText calls per Reel ≈ US$0.003.
-- 2. Under-18: on every face check that passes (or goes to review) face-check-aws already runs DetectFaces on the straight
--    frame; it now asks for AGE_RANGE too (no extra call, no extra cost) and writes kr8_age_check_record. LIKELY_MINOR →
--    red alert for the founder (he decides; nothing is closed).
--
-- Setup once (founder / CTO): store the robot key in Vault —
--   select vault.create_secret('<the FACE_ROBOT_KEY value>', 'face_robot_key');
-- Without it the cron job does nothing.

-- the two robots (their alerts need a kr8_robot row). Mode 'on' = record + alert; neither ever hides or closes anything.
insert into public.kr8_robot (name, title, note, schedule, mode, daily_cap) values
  ('reel_copy_scan', 'Copied-Reel check', 'Part of Feed quality: AWS reads the poster + 2 frames of each new Reel; a TikTok / CapCut / stock / AI watermark is shown on the review card and raises an amber alert. Never hides a Reel.',
   'with Feed quality', 'on', 200),
  ('age_check', 'Under-18 check', 'On every face check: AWS age range of the straight frame. Likely under 18 (top of range < 20) raises a red alert. Never closes an account.',
   'on face check', 'on', 200)
on conflict (name) do update set title = excluded.title, note = excluded.note, schedule = excluded.schedule;

create or replace function public.kr8_reel_copy_todo(p_limit int default 10)
returns table(id uuid, video_path text, poster_path text)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, p.video_path, p.poster_path
    from public.kr8_posts p
   where p.kind = 'reel' and p.status = 'pending'
     and p.created_at > now() - interval '3 days'
     and p.created_at < now() - interval '1 minute'          -- the scan frames land just after the video
     and not exists (select 1 from public.kr8_reel_copy_checks c where c.post_id = p.id)
   order by p.created_at
   limit least(greatest(coalesce(p_limit, 10), 1), 20)
$$;
revoke all on function public.kr8_reel_copy_todo(int) from public, anon, authenticated;

create or replace function public.kr8_reel_copy_record(p_post uuid, p_copied boolean, p_kind text, p_watermark text, p_app text,
                                                       p_evidence jsonb, p_frames int)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare m record;
begin
  insert into public.kr8_reel_copy_checks (post_id, copied, copy_kind, watermark, evidence, reasons, source)
  values (p_post, coalesce(p_copied, false), p_kind, left(p_watermark, 80), coalesce(p_evidence, '[]'::jsonb),
          case when coalesce(p_copied, false) then array[format('watermark ''%s''', left(p_watermark, 40))] else '{}' end
            || case when coalesce(p_frames, 0) = 0 then array['no frame could be read'] else '{}' end,
          'auto')
  on conflict (post_id) do update set checked_at = now(), copied = excluded.copied, copy_kind = excluded.copy_kind,
    watermark = excluded.watermark, evidence = excluded.evidence, reasons = excluded.reasons, source = 'auto';
  if coalesce(p_copied, false) and p_kind in ('app_watermark', 'stock_watermark', 'ai_watermark') then
    select mm.member_no, mm.first_name into m from public.kr8_posts p join public.kr8_members mm on mm.user_id = p.author where p.id = p_post;
    perform public.kr8_alert_raise('reel_copied:' || p_post, 'reel_copy_scan', 'amber',
      format('Reel looks copied · #%s %s', coalesce(m.member_no::text, '?'), coalesce(m.first_name, '')),
      format('AWS read ''%s'' on this waiting Reel (%s). Watch it before you approve: it may be a clip from %s, not filmed by them. Nothing was hidden.',
             left(p_watermark, 40), replace(coalesce(p_kind, ''), '_', ' '), coalesce(p_app, 'another app or a stock site')),
      '#q/reels',
      jsonb_build_object('post_id', p_post, 'member_no', m.member_no, 'watermark', p_watermark, 'kind', p_kind));
  end if;
end $$;
revoke all on function public.kr8_reel_copy_record(uuid, boolean, text, text, text, jsonb, int) from public, anon, authenticated;

create or replace function public.kr8_age_check_record(p_user uuid, p_low int, p_high int, p_source text default 'check')
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v text; m record;
begin
  if p_user is null or p_low is null or p_high is null then return null; end if;
  v := case when p_high < 20 then 'LIKELY_MINOR' when p_low < 18 and p_high < 24 then 'CHECK' else 'OK' end;
  select member_no, first_name into m from public.kr8_members where user_id = p_user;
  -- keep the most cautious reading: a worse verdict wins, on a tie the younger top of range
  insert into public.kr8_age_checks as a (user_id, member_no, low, high, source, verdict, readings)
  values (p_user, m.member_no, p_low, p_high, p_source, v, jsonb_build_object(p_source, jsonb_build_object('Low', p_low, 'High', p_high)))
  on conflict (user_id) do update set member_no = excluded.member_no, checked_at = now(), readings = a.readings || excluded.readings,
    (low, high, source, verdict) = (
      select x.low, x.high, x.source, x.verdict from (values
        (a.low, a.high, a.source, a.verdict, case a.verdict when 'LIKELY_MINOR' then 3 when 'CHECK' then 2 when 'OK' then 1 else 0 end),
        (excluded.low, excluded.high, excluded.source, excluded.verdict, case excluded.verdict when 'LIKELY_MINOR' then 3 when 'CHECK' then 2 when 'OK' then 1 else 0 end)
      ) x(low, high, source, verdict, sev)
      order by x.sev desc, x.high asc nulls last limit 1);
  if v = 'LIKELY_MINOR' then
    perform public.kr8_alert_raise('age_minor:' || p_user, 'age_check', 'red',
      format('May be under 18 · #%s %s', coalesce(m.member_no::text, '?'), coalesce(m.first_name, '')),
      format('Their face check looks %s–%s years old to AWS (it often reads young on filtered photos). Look at the selfie and decide. Nothing was closed.', p_low, p_high),
      '#q/faces',
      jsonb_build_object('user_id', p_user, 'member_no', m.member_no, 'low', p_low, 'high', p_high));
  end if;
  return v;
end $$;
revoke all on function public.kr8_age_check_record(uuid, int, int, text) from public, anon, authenticated;

-- every 10 minutes (only when the robot key is in Vault)
create or replace function public.kr8_reel_copy_scan_kick()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare k text;
begin
  if not exists (select 1 from public.kr8_posts p where p.kind = 'reel' and p.status = 'pending' and p.created_at > now() - interval '3 days'
                   and not exists (select 1 from public.kr8_reel_copy_checks c where c.post_id = p.id)) then return; end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'face_robot_key' limit 1;
  if k is null or length(k) < 32 then return; end if;
  perform net.http_post(
    url := 'https://pedxoxpammnyfnizljyj.supabase.co/functions/v1/face-check-aws',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kring-robot', k),
    body := '{"action":"reel_copy_scan","limit":10}'::jsonb,
    timeout_milliseconds := 60000);
exception when others then null;
end $$;
revoke all on function public.kr8_reel_copy_scan_kick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'kr8_reel_copy_scan';
select cron.schedule('kr8_reel_copy_scan', '*/10 * * * *', 'select public.kr8_reel_copy_scan_kick()');
