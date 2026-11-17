-- 0105 · Help → founder email (18 Nov 2026). The Kring Helper promises "the team replies within 1 hour", so every new
-- member message in a Help thread (member ↔ Kring Team, opened by kr8_help_open with "[Help] <question>") emails the founder.
--
-- REUSES the existing founder-alert route, nothing new or paid:
--   DB trigger → pg_net net.http_post → edge function notify-new-member (Brevo, sender hello@kringapp.com → founder inbox)
--   with the vault secret 'notify_hook_secret' — exactly like kr8_face_alert (0076) and kr8_claim_notify (0044).
--   notify-new-member gets a new branch for table 'kr8_help_message' (same commit). Until that function is redeployed,
--   the live function answers "ignored" and nothing breaks.
-- Also queues an admin push (same as 0076) when kr8_push_queue exists.
--
-- Rules: member messages only (never the team's replies); only threads with the Kring Team that carry a "[Help]" message;
--        test/demo members send nothing; kill switch kr8_rings_config key 'help_email_on' (1 = on, 0 = off);
--        an alert NEVER blocks or slows the member's message (errors are swallowed, pg_net is async).
-- ADDITIVE + RE-RUNNABLE.
--
-- UNDO (in this order):
--   drop trigger if exists kr8_help_email_alert on public.kr8_messages;
--   drop function if exists public.kr8_help_email_alert_trg();
begin;

create or replace function public.kr8_help_email_alert_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare t record; mem record; k text; a record; q text; n int; since timestamptz;
begin
  if public.kr8_rcfg('help_email_on', 1) <> 1 then return new; end if;
  select * into t from public.kr8_threads where id = new.thread_id;
  if t.id is null then return new; end if;
  -- member ↔ Kring Team only, written by the member (not the team)
  if not (public.kr8_is_team(t.user_a) or public.kr8_is_team(t.user_b)) then return new; end if;
  if public.kr8_is_team(t.user_a) and public.kr8_is_team(t.user_b) then return new; end if;
  if public.kr8_is_team(new.sender) then return new; end if;
  -- tagged Help: this message, or an earlier member message in this thread, starts with [Help]
  if new.body not like '[Help]%' and not exists (
       select 1 from public.kr8_messages x where x.thread_id = new.thread_id and x.sender = new.sender and x.body like '[Help]%') then
    return new;
  end if;
  if public.kr8_is_test_member(new.sender) then return new; end if;

  select member_no, first_name, coalesce(verified, false) as verified into mem from public.kr8_members where user_id = new.sender;
  q := btrim(regexp_replace(new.body, '^\[Help\]\s*', ''));
  -- messages waiting since the team's last reply (this one included)
  select count(*)::int, min(x.created_at) into n, since from public.kr8_messages x
   where x.thread_id = new.thread_id and x.sender = new.sender
     and x.id > coalesce((select max(y.id) from public.kr8_messages y where y.thread_id = new.thread_id and y.sender <> new.sender), 0);

  if to_regprocedure('public.kr8_push_queue(text,uuid,boolean,text,text,text,uuid,boolean)') is not null then
    for a in select u.id from auth.users u join public.kr8_admin_emails e on e.email = lower(u.email) loop
      perform public.kr8_push_queue('admin', a.id, false,
        'Help · ' || coalesce(mem.first_name, 'member') || ' #' || coalesce(mem.member_no::text, '?'),
        left(coalesce(nullif(q, ''), 'Talk to the team') || ' · reply within 1 hour', 240), '/app/admin.html#inbox', null, false);
    end loop;
  end if;

  select decrypted_secret into k from vault.decrypted_secrets where name = 'notify_hook_secret' limit 1;
  if k is not null then
    perform net.http_post(
      url := 'https://pedxoxpammnyfnizljyj.supabase.co/functions/v1/notify-new-member',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', k),
      body := jsonb_build_object('table', 'kr8_help_message', 'record', jsonb_build_object(
        'message_id', new.id, 'thread_id', new.thread_id, 'body', left(coalesce(nullif(q, ''), 'Talk to the team'), 500),
        'first', new.body like '[Help]%', 'member_no', mem.member_no, 'first_name', mem.first_name, 'verified', mem.verified,
        'unanswered', n, 'waiting_since', since, 'created_at', new.created_at)),
      timeout_milliseconds := 10000);
  end if;
  return new;
exception when others then
  return new;   -- an alert never blocks a member's message
end $$;
revoke all on function public.kr8_help_email_alert_trg() from public, anon, authenticated;

drop trigger if exists kr8_help_email_alert on public.kr8_messages;
create trigger kr8_help_email_alert after insert on public.kr8_messages
  for each row execute function public.kr8_help_email_alert_trg();

commit;
