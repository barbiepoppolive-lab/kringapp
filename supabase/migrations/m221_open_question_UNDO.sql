-- m221 UNDO: kr8_send_hello back to its 25 Nov body; the new functions go; the two columns stay (harmless, nothing reads them).
-- To remove them too: alter table public.kr8_members drop column open_q, drop column open_q_on;
begin;
drop function if exists public.kr8_open_q_answer(uuid, text);
drop function if exists public.kr8_open_q_of(uuid);
drop function if exists public.kr8_set_open_q(text, boolean);
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
  -- 0175: no new chat before the face check (same rule as kr8_face_gate; the Kring Team can always be reached)
  if public.kr8_face_gate(uid) and not public.kr8_is_team(p_to) then raise exception 'KR8_VERIFY_FIRST'; end if;
  -- m207: the receiving half. An unchecked account cannot be contacted at all. KR8_NO_PERSON, not a
  -- "they have not verified" message, so a uuid picked up elsewhere cannot be used to test who exists.
  if not public.kr8_is_admin() and not public.kr8_is_team(uid) and public.kr8_face_gate(p_to) then raise exception 'KR8_NO_PERSON'; end if;
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
end $function$;
commit;
