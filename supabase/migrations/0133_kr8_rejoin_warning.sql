-- 0133 · Automatic strict warning from the Kring Team to a re-joined prize winner (founder 19 Nov 2026).
begin;
create or replace function public.kr8_system_notice(p_member uuid, p_body text, p_body_en text) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare team uuid := public.kr8_help_team_id(); a uuid; b uuid; tid uuid; mid bigint;
begin
  if team is null or p_member is null or not exists (select 1 from public.kr8_members where user_id = p_member) then return null; end if;
  a := least(p_member, team); b := greatest(p_member, team);
  select t.id into tid from public.kr8_threads t
   where p_member in (t.user_a, t.user_b) and (public.kr8_is_team(t.user_a) or public.kr8_is_team(t.user_b))
   order by (t.user_a = a and t.user_b = b) desc, t.last_at desc limit 1;
  if tid is null then
    insert into public.kr8_threads (user_a, user_b, opened_by, status) values (a, b, team, 'open') returning id into tid;
  end if;
  insert into public.kr8_messages (thread_id, sender, body)
  values (tid, (select case when public.kr8_is_team(t.user_a) then t.user_a else t.user_b end from public.kr8_threads t where t.id = tid), btrim(p_body))
  returning id into mid;
  update public.kr8_threads set last_at = now() where id = tid;
  insert into public.kr8_help_ai(message_id, translation_en, model, created_at) values (mid, left(p_body_en, 1000), 'system', now())
  on conflict (message_id) do update set translation_en = excluded.translation_en;
  return mid;
end $$;
revoke all on function public.kr8_system_notice(uuid, text, text) from public, anon, authenticated;

create or replace function public.kr8_rejoin_warning(p_member uuid) returns bigint
language sql security definer set search_path = public, pg_temp as $$
  select public.kr8_system_notice(p_member,
$t$แจ้งจากระบบ Kring ⚠️
ระบบตรวจพบว่าบัญชีนี้ใช้ข้อมูลเดียวกัน (อีเมล / LINE / โทรศัพท์) กับบัญชีที่เคยรับรางวัลแล้วลบบัญชีไป
ตามกติกา "หนึ่งคน หนึ่งบัญชี" บัญชีนี้จึงไม่สามารถรับรางวัลได้
หากพบการสร้างบัญชีซ้ำอีก บัญชีจะถูกระงับถาวร
ถ้าคิดว่าระบบเข้าใจผิด ตอบกลับข้อความนี้ได้เลยครับ$t$,
$e$A note from Kring ⚠️
Our system found that this account uses the same details (email / LINE / phone) as an account that received a prize and was then deleted.
Under our "one person, one account" rule, this account can't receive prizes.
Creating more duplicate accounts will lead to a permanent ban.
If you think this is a mistake, reply to this message.$e$)
$$;
revoke all on function public.kr8_rejoin_warning(uuid) from public, anon, authenticated;

-- sign-up: hard match → red alert (0131) + the warning, once
create or replace function public.kr8_blocklist_signup_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare h jsonb;
begin
  h := public.kr8_blocklist_hit(new.user_id);
  if h is not null then
    perform public.kr8_alert_raise(p_key => 'rejoin:' || new.user_id::text, p_robot => 'protect', p_severity => 'red',
      p_title => format('Re-joined? New #%s matches deleted prize winner #%s (same %s)', new.member_no, coalesce(h ->> 'source_no', '?'),
                        case h ->> 'kind' when 'email' then 'email' when 'line' then 'LINE login' when 'device' then 'phone' else 'network' end),
      p_body => case when h ->> 'strength' = 'hard' then 'Blocked from prizes automatically and warned in the Help chat.' else 'Same network only: a prize claim will wait for you. No warning sent.' end,
      p_href => '#inbox', p_detail => jsonb_build_object('user_id', new.user_id, 'hit', h));
    if h ->> 'strength' = 'hard' then perform public.kr8_rejoin_warning(new.user_id); end if;
  end if;
  return new;
exception when others then return new;
end $$;
commit;
