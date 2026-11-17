-- 0092 · Phone-only selfie (17 Nov 2026, founder: smooth onboarding + a clear way through Thai PDPA worries).
-- The face check sends ONLY the face code (128 numbers) and the check results. The selfie photo stays on the phone when the
-- robot passes or blocks; it is uploaded only when the case is unclear ("need_photo"), after the member agrees on screen.
-- Also: kr8_forget_my_face() — a member can delete their face code and face-check photos any time (PDPA withdrawal of consent);
-- and the selfies already stored for automatic passes are queued for deletion now.
-- Written for kring-test (pgvector in schema "extensions"); the live copy swaps extensions.vector → public.vector.
-- UNDO: re-run 0081's kr8_verify_instant; drop function kr8_forget_my_face().

create or replace function public.kr8_verify_instant(p_selfie_path text, p_consent_version text, p_check jsonb, p_emb real[] default null, p_card_emb real[] default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); me record; n int; vid uuid; live jsonb := public.kr8_face_live_clean(coalesce(p_check, '{}'::jsonb));
        reasons text[] := '{}'; decision text; m float8; e extensions.vector; card extensions.vector; chk record; crd record; best record;
        tries int := public.kr8_rcfg('verify_tries_day', 3);
        block_min float8 := public.kr8_rcfg('verify_block_min', 600) / 1000.0; review_min float8 := public.kr8_rcfg('verify_review_min', 500) / 1000.0;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select mb.user_id, mb.verified, u.created_at joined into me
    from public.kr8_members mb join auth.users u on u.id = mb.user_id where mb.user_id = uid;
  if me.user_id is null then raise exception 'KR8_NO_CARD'; end if;
  if p_consent_version is null or p_consent_version !~ '^face-[0-9]{4}-[0-9]{2}-[0-9]{2}[a-z]?$' or p_consent_version < 'face-2026-11-17c' then
    raise exception 'KR8_CONSENT_REQUIRED';
  end if;
  perform pg_advisory_xact_lock(hashtext('kr8_verify:' || uid::text));
  if me.verified and public.kr8_face_has_new_check(uid) then
    return jsonb_build_object('result', 'pass', 'again', true, 'verified', true);
  end if;
  select count(*) into n from public.kr8_face_decisions where user_id = uid and created_at > now() - interval '1 day';
  if n >= tries then raise exception 'KR8_SLOW_DOWN'; end if;

  -- ── fail on the phone: only the decision row is kept (no photo, no embedding)
  -- 0092: a photo is no longer sent up front; "fail" = the phone's live check did not pass, or no face code came with it
  if not coalesce((live ->> 'live')::boolean, false) or not public.kr8_vec_ok(p_emb) then
    if p_selfie_path is not null and to_regclass('public.kr8_storage_trash') is not null then
      insert into public.kr8_storage_trash (bucket, name, user_id) values ('kr8-verify', p_selfie_path, uid) on conflict (bucket, name) do nothing;
    end if;
    insert into public.kr8_face_decisions (user_id, decision, reasons, match, was_verified, live)
    values (uid, 'fail', array[coalesce(live ->> 'fail', 'timeout')], (live ->> 'match')::numeric, me.verified, live);
    return jsonb_build_object('result', 'fail', 'reasons', to_jsonb(array[coalesce(live ->> 'fail', 'timeout')]), 'verified', me.verified,
                              'tries_left', greatest(tries - n - 1, 0));
  end if;

  if p_selfie_path is not null then
    if split_part(p_selfie_path, '/', 1) <> uid::text or p_selfie_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' then raise exception 'KR8_BAD_SELFIE'; end if;
    if to_regclass('storage.objects') is not null and not exists (select 1 from storage.objects where bucket_id = 'kr8-verify' and name = p_selfie_path) then
      raise exception 'KR8_BAD_SELFIE';
    end if;
  end if;
  if not public.kr8_vec_ok(p_emb) then raise exception 'KR8_BAD_FACE'; end if;

  -- the live check must have passed on the phone, within the time limit, with every frame scored real
  if not ((live ->> 'live')::boolean and (live ->> 'straight')::boolean and (live ->> 'left')::boolean and (live ->> 'right')::boolean
          and (live ->> 'blink')::boolean and coalesce((live ->> 'ms')::int, 999999) <= public.kr8_rcfg('verify_live_max_ms', 25000)
          and coalesce((live ->> 'frames')::int, 0) >= 3 and coalesce((live ->> 'real')::float8, 0) >= public.kr8_rcfg('verify_real_min', 500) / 1000.0) then
    if p_selfie_path is not null and to_regclass('public.kr8_storage_trash') is not null then
      insert into public.kr8_storage_trash (bucket, name, user_id) values ('kr8-verify', p_selfie_path, uid) on conflict (bucket, name) do nothing;
    end if;
    insert into public.kr8_face_decisions (user_id, decision, reasons, was_verified, live) values (uid, 'fail', array['live_check'], me.verified, live);
    return jsonb_build_object('result', 'fail', 'reasons', '["live_check"]'::jsonb, 'verified', me.verified, 'tries_left', greatest(tries - n - 1, 0));
  end if;

  e := p_emb::extensions.vector;
  -- selfie vs own card photo: computed HERE from the two embeddings (the phone's own number is only logged)
  if public.kr8_vec_ok(p_card_emb) then
    card := p_card_emb::extensions.vector;
    m := 1 - (e operator(extensions.<=>) card);
    delete from public.kr8_face_vectors where user_id = uid and source = 'card';
    insert into public.kr8_face_vectors (user_id, emb, source) values (uid, card, 'card');
  end if;

  -- 1:N: the most similar OTHER member, face checks (can block) and card photos (founder only)
  select f.user_id, 1 - (f.emb operator(extensions.<=>) e) sim, u.created_at < me.joined older into chk
    from public.kr8_face_vectors f join auth.users u on u.id = f.user_id join public.kr8_members mb on mb.user_id = f.user_id
   where f.user_id <> uid and f.source = 'check' and not public.kr8_is_team(f.user_id)
   order by f.emb operator(extensions.<=>) e limit 1;
  select f.user_id, 1 - (f.emb operator(extensions.<=>) e) sim into crd
    from public.kr8_face_vectors f join public.kr8_members mb on mb.user_id = f.user_id
   where f.user_id <> uid and f.source = 'card' and not public.kr8_is_team(f.user_id)
   order by f.emb operator(extensions.<=>) e limit 1;

  if chk.sim is not null and chk.sim >= block_min and chk.older then
    decision := 'block'; reasons := array['same_face_other_account'];
  else
    if chk.sim is not null and chk.sim >= block_min then reasons := array_append(reasons, 'same_face_newer_account');
    elsif (chk.sim is not null and chk.sim >= review_min) or (crd.sim is not null and crd.sim >= review_min) then reasons := array_append(reasons, 'looks_like_other_account');
    end if;
    if m is null then reasons := array_append(reasons, 'no_card_face');
    elsif m < public.kr8_rcfg('verify_match_ok', 450) / 1000.0 then reasons := array_append(reasons, 'borderline_match');
    end if;
    if (live ->> 'doubt')::boolean then reasons := array_append(reasons, 'liveness_doubt'); end if;
    if public.kr8_rcfg('verify_auto_on', 1) <> 1 then reasons := array_append(reasons, 'auto_off'); end if;
    decision := case when cardinality(reasons) > 0 then 'review' else 'pass' end;
  end if;
  select * into best from (select chk.user_id u, chk.sim s, 'check'::text src union all select crd.user_id, crd.sim, 'card') x
   where x.s is not null order by x.s desc limit 1;

  -- 0092: only an unclear case needs a photo for a person to look at; pass and block are decided from the face code alone,
  -- so the selfie photo never leaves the phone for them. Nothing is stored and no try is used until the photo comes.
  if decision = 'review' and p_selfie_path is null then
    return jsonb_build_object('result', 'need_photo', 'reasons', to_jsonb(reasons), 'verified', me.verified, 'tries_left', greatest(tries - n, 0));
  end if;
  update public.kr8_verifications set status = 'rejected', reject_reason = 'replaced by a new check', reviewed_at = now()
   where user_id = uid and status = 'pending';
  insert into public.kr8_verifications (user_id, selfie_path, consent_version, live_check, status, reject_reason, reviewed_at)
  values (uid, p_selfie_path, p_consent_version,
          live || jsonb_build_object('straight', true, 'left', true, 'right', true, 'blink', true, 'match', round(m::numeric, 3), 'model', 'sface-2021dec-int8',
                                     'auto', decision, 'review', to_jsonb(reasons), 'dup_sim', round(best.s::numeric, 3)),
          case decision when 'pass' then 'approved' when 'block' then 'rejected' else 'pending' end,
          case when decision = 'block' then 'This face is already on another Kring account' end,
          case when decision in ('pass', 'block') then now() end)
  returning id into vid;
  insert into public.kr8_face_vectors (user_id, emb, source, verification_id) values (uid, e, 'check', vid);
  if decision = 'pass' then
    update public.kr8_members set verified = true, updated_at = now() where user_id = uid;
  elsif decision = 'block' then
    update public.kr8_members set verified = false, updated_at = now() where user_id = uid;
    perform public.kr8_link_add(uid, chk.user_id, 'face', jsonb_build_object('sface_sim', round(chk.sim::numeric, 3), 'sources', 'face check vs face check (SFace)'));
  end if;
  insert into public.kr8_face_decisions (user_id, verification_id, decision, reasons, match, dup_sim, dup_user, dup_source, was_verified, live)
  values (uid, vid, decision, reasons, round(m::numeric, 3), round(best.s::numeric, 3), best.u, best.src, me.verified, live);
  return jsonb_build_object('result', decision, 'reasons', to_jsonb(reasons),
                            'verified', case decision when 'pass' then true when 'block' then false else me.verified end,
                            'tries_left', greatest(tries - n - 1, 0));
end $$;
revoke all on function public.kr8_verify_instant(text, text, jsonb, real[], real[]) from public, anon;
grant execute on function public.kr8_verify_instant(text, text, jsonb, real[], real[]) to authenticated;

create or replace function public.kr8_forget_my_face() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); n int := 0;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if to_regclass('public.kr8_storage_trash') is not null then
    insert into public.kr8_storage_trash (bucket, name, user_id)
    select 'kr8-verify', v.selfie_path, uid from public.kr8_verifications v
     where v.user_id = uid and v.selfie_path is not null and v.selfie_deleted_at is null
    on conflict (bucket, name) do nothing;
  end if;
  update public.kr8_verifications set selfie_deleted_at = coalesce(selfie_deleted_at, now()) where user_id = uid and selfie_path is not null;
  delete from public.kr8_face_vectors where user_id = uid;
  get diagnostics n = row_count;
  update public.kr8_members set verified = false, updated_at = now() where user_id = uid and verified;
  insert into public.kr8_admin_actions_log (action, detail) values ('face_forget', jsonb_build_object('user', uid, 'codes', n));
  return jsonb_build_object('forgotten', true, 'codes', n);
end $$;
revoke all on function public.kr8_forget_my_face() from public, anon;
grant execute on function public.kr8_forget_my_face() to authenticated;

-- selfies already stored for automatic passes: no person needs them, so they go now (the nightly cleanup removes the files)
do $$ begin
  if to_regclass('public.kr8_storage_trash') is not null then
    insert into public.kr8_storage_trash (bucket, name, user_id)
    select 'kr8-verify', v.selfie_path, v.user_id from public.kr8_verifications v
     where v.status = 'approved' and v.live_check ->> 'auto' = 'pass' and v.selfie_path is not null and v.selfie_deleted_at is null
    on conflict (bucket, name) do nothing;
  end if;
end $$;
