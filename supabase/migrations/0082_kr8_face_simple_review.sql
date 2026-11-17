-- 0082 · Face check, simple path (17 Nov 2026). Real-phone bug: in some phone browsers (in-app browsers, the phone maker's own
--        browser) the camera works but the on-phone face engine cannot run (no WebAssembly SIMD / no WebGL / the models never
--        load), and the member was stuck. The phone now takes ONE selfie and sends it straight to the founder's Face checks queue
--        ("We're checking"). Nothing is decided automatically: no ✓ without the founder's look.
--
-- WRITTEN, NOT APPLIED. ADDITIVE + RE-RUNNABLE. Needs 0031 (kr8_verifications) and 0081 (kr8_face_decisions).
-- HONEST LIMIT: no live check ran and no face code exists, so the duplicate-face search does not run for these; the queue row says
--   so (live_check.simple = true, review = ["simple_check"]) and the founder decides by eye.
-- ORDER: apply BEFORE the app build that calls kr8_verify_simple. Without it the phone shows "the face check could not start".
-- UNDO: drop function public.kr8_verify_simple(text, text, jsonb);

begin;

create or replace function public.kr8_verify_simple(p_selfie_path text, p_consent_version text, p_check jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); me record; n int; vid uuid; tries int := public.kr8_rcfg('verify_tries_day', 3);
        why text := case when p_check ->> 'why' in ('no_wasm', 'no_simd', 'no_webgl', 'model_timeout', 'engine_fail') then p_check ->> 'why' else 'engine_fail' end;
        chk jsonb;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select user_id, verified into me from public.kr8_members where user_id = uid;
  if me.user_id is null then raise exception 'KR8_NO_CARD'; end if;
  if p_consent_version is null or p_consent_version !~ '^face-[0-9]{4}-[0-9]{2}-[0-9]{2}[a-z]?$' or p_consent_version < 'face-2026-11-17c' then
    raise exception 'KR8_CONSENT_REQUIRED';
  end if;
  perform pg_advisory_xact_lock(hashtext('kr8_verify:' || uid::text));
  if me.verified then return jsonb_build_object('result', 'pass', 'again', true, 'verified', true); end if;
  select count(*) into n from public.kr8_face_decisions where user_id = uid and created_at > now() - interval '1 day';
  if n >= tries then raise exception 'KR8_SLOW_DOWN'; end if;
  if p_selfie_path is null or split_part(p_selfie_path, '/', 1) <> uid::text or p_selfie_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' then
    raise exception 'KR8_BAD_SELFIE';
  end if;
  if to_regclass('storage.objects') is not null and not exists (select 1 from storage.objects where bucket_id = 'kr8-verify' and name = p_selfie_path) then
    raise exception 'KR8_BAD_SELFIE';
  end if;
  chk := jsonb_build_object('simple', true, 'why', why, 'live', false, 'straight', false, 'left', false, 'right', false, 'blink', false,
                            'device', left(coalesce(p_check ->> 'device', ''), 60), 'auto', 'review', 'review', '["simple_check"]'::jsonb);
  update public.kr8_verifications set status = 'rejected', reject_reason = 'replaced by a new check', reviewed_at = now()
   where user_id = uid and status = 'pending';
  insert into public.kr8_verifications (user_id, selfie_path, consent_version, live_check, status)
  values (uid, p_selfie_path, p_consent_version, chk, 'pending') returning id into vid;
  insert into public.kr8_face_decisions (user_id, verification_id, decision, reasons, was_verified, live)
  values (uid, vid, 'review', array['simple_check'], me.verified, chk);
  return jsonb_build_object('result', 'review', 'reasons', '["simple_check"]'::jsonb, 'verified', me.verified, 'tries_left', greatest(tries - n - 1, 0));
end $$;
revoke all on function public.kr8_verify_simple(text, text, jsonb) from public, anon;
grant execute on function public.kr8_verify_simple(text, text, jsonb) to authenticated;

commit;
