-- 0168 (20 Nov, founder: "Why there's no photo … How should I decide?"): a "same phone" link (reason 'device') is never a
-- decision card for the founder. The face robot (face-check-aws action 'device_links', every 5 min) compares the two card
-- photos with AWS CompareFaces and settles the link here:
--   clearly different faces (< 80%)  → link dismissed with a note (friends sharing a phone);
--   same face (>= 95%)               → second-account rule: the newer account gets an all-prizes ban + one polite warning;
--   no clear face / 80–95%           → stays a quiet flag on the member (no card).

create or replace function public.kr8_device_links_todo(p_limit int default 10)
returns table(a uuid, b uuid, photo_a text, photo_b text)
language sql stable security definer set search_path = public, pg_temp as $$
  select l.a, l.b, ma.photo, mb.photo
    from public.kr8_account_links l
    join public.kr8_members ma on ma.user_id = l.a
    join public.kr8_members mb on mb.user_id = l.b
   where l.reason = 'device' and l.dismissed_at is null
     and not (coalesce(l.detail, '{}'::jsonb) ? 'robot')
   order by l.first_at desc
   limit greatest(1, least(p_limit, 25))
$$;
revoke all on function public.kr8_device_links_todo(int) from public, anon, authenticated;

create or replace function public.kr8_second_account_warning(p_member uuid, p_other_no int)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- once per member
  if exists (select 1 from public.kr8_messages x join public.kr8_threads t on t.id = x.thread_id
              where p_member in (t.user_a, t.user_b) and x.sender is distinct from p_member and public.kr8_is_team(x.sender)
                and x.body like 'แจ้งจากทีม Kring 🙏' || E'\n' || 'ระบบพบว่าบัญชีนี้เป็นของคนเดียวกับ%') then return null; end if;
  return public.kr8_system_notice(p_member,
$t$แจ้งจากทีม Kring 🙏
ระบบพบว่าบัญชีนี้เป็นของคนเดียวกับอีกบัญชีหนึ่งบน Kring (ใบหน้าเดียวกัน ใช้โทรศัพท์เครื่องเดียวกัน)
ที่ Kring หนึ่งคนใช้ได้หนึ่งบัญชี บัญชีนี้จึงไม่สามารถรับรางวัลได้ครับ
กรุณาใช้บัญชีเดิมของคุณบัญชีเดียวนะครับ ถ้าคิดว่าระบบเข้าใจผิด ตอบกลับข้อความนี้ได้เลยครับ$t$,
$e$A note from the Kring team 🙏
Our system found that this account belongs to the same person as another Kring account (same face, same phone).
On Kring, one person can have one account, so this account can't receive prizes.
Please keep using just your original account. If you think this is a mistake, reply to this message.$e$);
end $$;
revoke all on function public.kr8_second_account_warning(uuid, int) from public, anon, authenticated;

create or replace function public.kr8_device_link_settle(p_a uuid, p_b uuid, p_sim numeric, p_note text default null)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare older uuid; newer uuid; older_no int; newer_no int; verdict text;
begin
  select x.user_id into older from public.kr8_members x where x.user_id in (p_a, p_b) order by x.created_at asc limit 1;
  newer := case when older = p_a then p_b else p_a end;
  select member_no into older_no from public.kr8_members where user_id = older;
  select member_no into newer_no from public.kr8_members where user_id = newer;
  verdict := case when p_sim is null then 'no_face' when p_sim < 80 then 'different' when p_sim >= 95 then 'same' else 'unclear' end;
  update public.kr8_account_links l
     set detail = coalesce(l.detail, '{}'::jsonb) || jsonb_build_object('robot', verdict, 'aws_sim', p_sim, 'robot_at', now(), 'robot_note', p_note),
         dismissed_at = case when verdict in ('different', 'same') then now() else l.dismissed_at end
   where l.a = least(p_a, p_b) and l.b = greatest(p_a, p_b) and l.reason = 'device';
  if verdict = 'same' and not public.kr8_is_team(newer) then
    insert into public.kr8_prize_bans(user_id, member_no, reason, scope)
    values (newer, newer_no, format('Same face as #%s on the same phone (AWS %s%%) — second account', older_no, round(p_sim)), 'all')
    on conflict (user_id) do nothing;
    perform public.kr8_second_account_warning(newer, older_no);
  end if;
  return verdict;
end $$;
revoke all on function public.kr8_device_link_settle(uuid, uuid, numeric, text) from public, anon, authenticated;

create or replace function public.kr8_device_links_kick() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare k text;
begin
  if public.kr8_autopilot_paused() then return; end if;
  if not exists (select 1 from public.kr8_device_links_todo(1)) then return; end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'face_robot_key' limit 1;
  if k is null or length(k) < 32 then return; end if;
  perform net.http_post(
    url := 'https://pedxoxpammnyfnizljyj.supabase.co/functions/v1/face-check-aws',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kring-robot', k),
    body := '{"action":"device_links","limit":10}'::jsonb,
    timeout_milliseconds := 120000);
exception when others then null;
end $$;
revoke all on function public.kr8_device_links_kick() from public, anon, authenticated;

select cron.schedule('kr8_device_links', '3-59/5 * * * *', 'select public.kr8_device_links_kick()');
