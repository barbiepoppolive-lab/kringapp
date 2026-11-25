-- m221 (26 Nov 2026) Retention 10, feature 6: profile question opens the chat (Bumble "Opening Moves" idea).
--   kr8_members.open_q (≤80, the bio checker refuses phone numbers / handles / links) + open_q_on.
--   kr8_set_open_q(q, on) · kr8_open_q_of(user) · kr8_open_q_answer(to, answer): the ONLY way to start a NEW chat with a member
--   who has it on; the first message is the question quoted + the answer (reads right in every app version).
--   kr8_send_hello: one new refusal KR8_ANSWER_FIRST, only for a member with the question on (nobody can switch it on before
--   the new app ships). Existing chats, the Kring Team and admin replies are unaffected. The old qa_q / qa_answer stay as they are.
-- Rollback: m221_open_question_UNDO.sql
begin;

alter table public.kr8_members add column if not exists open_q text;
alter table public.kr8_members add column if not exists open_q_on boolean not null default false;

create or replace function public.kr8_set_open_q(p_q text, p_on boolean)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); q text := nullif(btrim(regexp_replace(coalesce(p_q, ''), '\s+', ' ', 'g')), '');
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if q is not null and not public.kr8_bio_ok(q) then raise exception 'KR8_BAD_BIO'; end if;
  if coalesce(p_on, false) and q is null then raise exception 'KR8_BAD_QA'; end if;
  update public.kr8_members set open_q = q, open_q_on = coalesce(p_on, false) and q is not null, updated_at = now() where user_id = uid;
  return jsonb_build_object('q', q, 'on', coalesce(p_on, false) and q is not null);
end $function$;
revoke execute on function public.kr8_set_open_q(text, boolean) from public, anon;
grant execute on function public.kr8_set_open_q(text, boolean) to authenticated;

-- what the app needs before showing Say hi: is there a question to answer, and is there already a chat
create or replace function public.kr8_open_q_of(p_user uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); m public.kr8_members;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into m from public.kr8_members where user_id = p_user;
  if m.user_id is null or (p_user <> uid and public.kr8_is_blocked(uid, p_user)) then raise exception 'KR8_NO_PERSON'; end if;
  return jsonb_build_object('user_id', m.user_id,
    'on', coalesce(m.open_q_on, false) and btrim(coalesce(m.open_q, '')) <> '',
    'q', case when p_user = uid or (coalesce(m.open_q_on, false)) then m.open_q end,
    'thread', (select t.id from public.kr8_threads t where t.user_a = least(uid, p_user) and t.user_b = greatest(uid, p_user)));
end $function$;
revoke execute on function public.kr8_open_q_of(uuid) from public, anon;
grant execute on function public.kr8_open_q_of(uuid) to authenticated;

create or replace function public.kr8_open_q_answer(p_to uuid, p_answer text)
 returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); a uuid; b uuid; tid uuid; n int; q text;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if p_to is null or p_to = uid or not exists (select 1 from public.kr8_members where user_id = p_to) then raise exception 'KR8_NO_PERSON'; end if;
  if public.kr8_is_blocked(uid, p_to) then raise exception 'KR8_BLOCKED'; end if;
  if public.kr8_face_gate(uid) then raise exception 'KR8_VERIFY_FIRST'; end if;
  if public.kr8_face_gate(p_to) then raise exception 'KR8_NO_PERSON'; end if;
  select open_q into q from public.kr8_members where user_id = p_to and coalesce(open_q_on, false) and btrim(coalesce(open_q, '')) <> '';
  if q is null then raise exception 'KR8_NO_QUESTION'; end if;
  if not public.kr8_text_ok(p_answer, 280) then raise exception 'KR8_BAD_TEXT'; end if;
  a := least(uid, p_to); b := greatest(uid, p_to);
  perform pg_advisory_xact_lock(hashtext(a::text || b::text));
  select id into tid from public.kr8_threads where user_a = a and user_b = b;
  if tid is not null then
    if exists (select 1 from public.kr8_threads where id = tid and opened_by <> uid) then raise exception 'KR8_THEY_SAID_HI'; end if;
    raise exception 'KR8_ALREADY_SAID_HI';
  end if;
  perform pg_advisory_xact_lock(hashtext('hello-' || uid::text));
  select count(*) into n from public.kr8_threads
   where opened_by = uid and created_at > date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  if n >= 15 then raise exception 'KR8_DAILY_LIMIT'; end if;
  insert into public.kr8_threads (user_a, user_b, opened_by) values (a, b, uid) returning id into tid;
  insert into public.kr8_messages (thread_id, sender, body) values (tid, uid, left('“' || q || '”' || E'\n' || btrim(p_answer), 400));
  return tid;
end $function$;
revoke execute on function public.kr8_open_q_answer(uuid, text) from public, anon;
grant execute on function public.kr8_open_q_answer(uuid, text) to authenticated;

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
  -- m221: a member with a profile question on can only be reached first by answering it (kr8_open_q_answer)
  if not public.kr8_is_admin() and not public.kr8_is_team(uid) and exists (select 1 from public.kr8_members q
       where q.user_id = p_to and coalesce(q.open_q_on, false) and btrim(coalesce(q.open_q, '')) <> '') then
    raise exception 'KR8_ANSWER_FIRST';
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
