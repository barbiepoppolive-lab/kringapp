-- 0175 UNDO: kr8_send_hello / kr8_send_message exactly as before 20 Nov
CREATE OR REPLACE FUNCTION public.kr8_send_hello(p_to uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); a uuid; b uuid; tid uuid; n int;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if p_to is null or p_to = uid or not exists (select 1 from public.kr8_members where user_id = p_to) then raise exception 'KR8_NO_PERSON'; end if;
  if public.kr8_is_blocked(uid, p_to) then raise exception 'KR8_BLOCKED'; end if;
  if not public.kr8_text_ok(p_body, 280) then raise exception 'KR8_BAD_TEXT'; end if;
  a := least(uid, p_to); b := greatest(uid, p_to);
  perform pg_advisory_xact_lock(hashtext(a::text || b::text));
  select id into tid from public.kr8_threads where user_a = a and user_b = b;
  if tid is not null then
    -- they said hi first: tell me to reply in Messages instead of "you already said hi"
    if exists (select 1 from public.kr8_threads where id = tid and opened_by <> uid) then raise exception 'KR8_THEY_SAID_HI'; end if;
    raise exception 'KR8_ALREADY_SAID_HI';
  end if;
  perform pg_advisory_xact_lock(hashtext('hello-' || uid::text));
  select count(*) into n from public.kr8_threads
   where opened_by = uid and created_at > date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  if n >= 15 then raise exception 'KR8_DAILY_LIMIT'; end if;
  insert into public.kr8_threads (user_a, user_b, opened_by) values (a, b, uid) returning id into tid;
  insert into public.kr8_messages (thread_id, sender, body) values (tid, uid, btrim(p_body));
  return tid;
end $function$
;

CREATE OR REPLACE FUNCTION public.kr8_send_message(p_thread uuid, p_body text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); t public.kr8_threads; mid bigint; n int;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into t from public.kr8_threads where id = p_thread for update;
  if t.id is null or uid not in (t.user_a, t.user_b) then raise exception 'KR8_NO_THREAD'; end if;
  if public.kr8_is_blocked(t.user_a, t.user_b) then raise exception 'KR8_BLOCKED'; end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 500 then raise exception 'KR8_BAD_TEXT'; end if;
  if public.kr8_has_web_link(p_body) and not public.kr8_is_admin() then raise exception 'KR8_NO_LINKS'; end if;
  if t.status = 'pending' then
    if t.opened_by = uid then raise exception 'KR8_ONE_MESSAGE_RULE'; end if;
    update public.kr8_threads set status = 'open' where id = t.id;
  end if;
  select count(*) into n from public.kr8_messages where sender = uid and created_at > now() - interval '1 day';
  if n >= 500 then raise exception 'KR8_SLOW_DOWN'; end if;
  insert into public.kr8_messages (thread_id, sender, body) values (t.id, uid, btrim(p_body)) returning id into mid;
  update public.kr8_threads set last_at = now() where id = t.id;
  return mid;
end $function$
;
