-- m217 (25 Nov 2026, join-prompt test build): signed-out visitors who open a shared Reel can log ONE kind of event,
-- 'join_prompt' (shown / line / google / close), so the join sheet's funnel is measurable. Everything else stays members-only.
-- Anon rows: user_id null, device id required, capped at 12 per device and 40 per IP hash per hour. Additive; UNDO restores the members-only body.
CREATE OR REPLACE FUNCTION public.kr8_log_client(p_kind text, p_code text DEFAULT NULL::text, p_detail text DEFAULT NULL::text, p_ua text DEFAULT NULL::text, p_did text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); ip text; d text := nullif(left(btrim(coalesce(p_did, '')), 64), '');
begin
  if p_kind is null or p_kind !~ '^[a-z_]{2,30}$' then return; end if;
  if d is not null and d !~ '^[A-Za-z0-9-]{16,64}$' then d := null; end if;
  begin ip := public.kr8_caller_ip_hash(); exception when others then ip := null; end;   -- live-only helper; never blocks the log
  if uid is null then
    -- m217: visitors (not signed in) may only log the join sheet, with a device id, a few times an hour
    if p_kind <> 'join_prompt' or d is null or coalesce(p_code, '') !~ '^[a-z_]{2,20}$' then return; end if;
    if (select count(*) from public.kr8_client_events where user_id is null and did = d and created_at > now() - interval '1 hour') >= 12 then return; end if;
    if ip is not null and (select count(*) from public.kr8_client_events where user_id is null and kind = 'join_prompt' and ip_hash = ip and created_at > now() - interval '1 hour') >= 40 then return; end if;
    insert into public.kr8_client_events (user_id, kind, code, detail, ua, did, ip_hash)
    values (null, p_kind, left(p_code, 20), left(p_detail, 120), left(p_ua, 160), d, ip);
    return;
  end if;
  if (select count(*) from public.kr8_client_events where user_id = uid and created_at > now() - interval '1 hour') >= 60 then return; end if;
  insert into public.kr8_client_events (user_id, kind, code, detail, ua, did, ip_hash)
  values (uid, p_kind, left(p_code, 60), left(p_detail, 300), left(p_ua, 160), d, ip);
end $function$;
revoke execute on function public.kr8_log_client(text,text,text,text,text) from public;
grant execute on function public.kr8_log_client(text,text,text,text,text) to anon, authenticated;
