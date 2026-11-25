CREATE OR REPLACE FUNCTION public.kr8_help_ai_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  t record;
  k text;
  v_cnt int;
  v_cap int;
begin
  if public.kr8_rcfg('help_ai_on', 1) <> 1 then return new; end if;
  select * into t from public.kr8_threads where id = new.thread_id;
  if t.id is null then return new; end if;
  if not (public.kr8_is_team(t.user_a) or public.kr8_is_team(t.user_b)) then return new; end if;
  if public.kr8_is_team(t.user_a) and public.kr8_is_team(t.user_b) then return new; end if;
  if public.kr8_is_team(new.sender) then return new; end if;
  if public.kr8_is_test_member(new.sender) then return new; end if;

  v_cap := greatest(1, least(coalesce(public.kr8_rcfg('help_ai_daily_cap', 300), 300), 1000));
  select count(*)::int into v_cnt from public.kr8_help_ai where created_at > now() - interval '24 hours';
  if v_cnt >= v_cap then return new; end if;

  select decrypted_secret into k from vault.decrypted_secrets where name = 'notify_hook_secret' limit 1;
  if k is not null then
    perform net.http_post(
      url := 'https://pedxoxpammnyfnizljyj.supabase.co/functions/v1/kr8-help-ai',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', k),
      body := jsonb_build_object(
        'message_id', new.id,
        'thread_id', new.thread_id,
        'sender', new.sender
      ),
      timeout_milliseconds := 25000
    );
  end if;
  return new;
exception when others then
  return new; -- never block or slow down member chat
end $function$
;
drop table if exists public.kr8_help_no_auto;
