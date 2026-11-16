-- 0071 · Face check: keep "no blink was seen" instead of writing blink = true (audit 16 Nov P2-5). WRITTEN, NOT APPLIED.
-- ADDITIVE + RE-RUNNABLE: kr8_request_verification redefined with the SAME arguments and return type (0031 body + 2 lines).
--
-- Before: the phone's 12-second fallback (a live face looked at the camera, no clean blink) sent blink = true, and the server
-- always stored blink = true, so the admin could not tell a real blink from a still photo held to the camera.
-- Now: the phone sends blink = false + blink_fallback = true; the server accepts that (the team still looks at every selfie),
-- and stores both, so the admin Face check card shows "No blink seen" in red.
--
-- ORDER: apply this BEFORE the new app build (the new app sends blink = false on the fallback; the old server refused that).
-- The old app keeps working (it sends blink = true, stored as before).
-- UNDO: re-run kr8_request_verification from 0031_kr8_face_verify.sql.
begin;

create or replace function public.kr8_request_verification(p_selfie_path text, p_consent_version text, p_check jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); n int; vid uuid; v_check jsonb;
        v_blink boolean := coalesce((p_check ->> 'blink')::boolean, false);
        v_fallback boolean := coalesce((p_check ->> 'blink_fallback')::boolean, false);
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if exists (select 1 from public.kr8_members where user_id = uid and verified) then raise exception 'KR8_ALREADY_VERIFIED'; end if;
  if p_consent_version is null or p_consent_version !~ '^[a-z0-9-]{3,40}$' then raise exception 'KR8_CONSENT_REQUIRED'; end if;
  if p_selfie_path is null or split_part(p_selfie_path, '/', 1) <> uid::text or p_selfie_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' then raise exception 'KR8_BAD_SELFIE'; end if;
  if to_regclass('storage.objects') is not null and not exists (select 1 from storage.objects where bucket_id = 'kr8-verify' and name = p_selfie_path) then
    raise exception 'KR8_BAD_SELFIE';
  end if;
  -- the live check must have passed on the phone (the team still looks at every selfie);
  -- the blink step passes with a real blink OR the 12-s facing-the-camera fallback, which is stored as "no blink seen"
  if coalesce((p_check ->> 'straight')::boolean, false) is not true or coalesce((p_check ->> 'left')::boolean, false) is not true
     or coalesce((p_check ->> 'right')::boolean, false) is not true or not (v_blink or v_fallback) then
    raise exception 'KR8_LIVE_CHECK';
  end if;
  select count(*) into n from public.kr8_verifications where user_id = uid and created_at > now() - interval '1 day';
  if n >= 3 then raise exception 'KR8_SLOW_DOWN'; end if;
  -- keep only the known result fields (no face measurements)
  v_check := jsonb_build_object('straight', true, 'left', true, 'right', true, 'blink', v_blink and not v_fallback,
                                'blink_fallback', v_fallback and not v_blink,
                                'match', case when jsonb_typeof(p_check -> 'match') = 'number' then round((p_check ->> 'match')::numeric, 3) end,
                                'device', left(coalesce(p_check ->> 'device', ''), 60));
  update public.kr8_verifications set status = 'rejected', reject_reason = 'replaced by a new check', reviewed_at = now()
   where user_id = uid and status = 'pending';
  insert into public.kr8_verifications (user_id, selfie_path, consent_version, live_check) values (uid, p_selfie_path, p_consent_version, v_check)
  returning id into vid;
  return vid;
end $$;

commit;
