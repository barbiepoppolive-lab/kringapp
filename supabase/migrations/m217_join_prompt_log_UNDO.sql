-- UNDO m217: kr8_log_client back to members only (body as before 25 Nov), anon loses execute.
CREATE OR REPLACE FUNCTION public.kr8_log_client(p_kind text, p_code text DEFAULT NULL::text, p_detail text DEFAULT NULL::text, p_ua text DEFAULT NULL::text, p_did text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); ip text; d text := nullif(left(btrim(coalesce(p_did, '')), 64), '');
begin
  if uid is null or p_kind is null or p_kind !~ '^[a-z_]{2,30}$' then return; end if;
  if (select count(*) from public.kr8_client_events where user_id = uid and created_at > now() - interval '1 hour') >= 60 then return; end if;
  if d is not null and d !~ '^[A-Za-z0-9-]{16,64}$' then d := null; end if;
  begin ip := public.kr8_caller_ip_hash(); exception when others then ip := null; end;   -- live-only helper; never blocks the log
  insert into public.kr8_client_events (user_id, kind, code, detail, ua, did, ip_hash)
  values (uid, p_kind, left(p_code, 60), left(p_detail, 300), left(p_ua, 160), d, ip);
end $function$;
revoke execute on function public.kr8_log_client(text,text,text,text,text) from public, anon;
grant execute on function public.kr8_log_client(text,text,text,text,text) to authenticated;
