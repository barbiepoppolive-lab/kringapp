-- 0081 · Instant, in-house face check: the app decides on its own (17 Nov 2026). Founder: "seamless real-person check like
--        Bumble / Tinder", "no paid vendor, as strong as possible", "only true grey-zone cases come to me".
--
-- WRITTEN, NOT APPLIED. ADDITIVE + RE-RUNNABLE. Needs 0031, 0066, 0075, 0076 and the pgvector extension (Supabase: built in).
--
-- THE PHONE (all on-device, nothing paid): MediaPipe Face Landmarker guides a ~5-second live check (look straight · turn left /
--   right in a random order · blink, the same face tracked throughout). Then onnxruntime-web runs, on 3 frames of that check:
--     YuNet (OpenCV Zoo, MIT) face + 5 points → SFace int8 (OpenCV Zoo, Apache-2.0) 128-number embedding (cosine similarity)
--     MiniFASNetV2 + V1SE (minivision Silent-Face-Anti-Spoofing, Apache-2.0) real-face score on every frame
--   and the card photo's SFace embedding. The phone sends: the frontal selfie (private bucket, team-only, 30-day delete),
--   the selfie embedding, the card-photo embedding and the step results. It never sends "verified".
--
-- THE SERVER decides (kr8_verify_instant), re-computing every similarity itself from the embeddings, and logs it with the reason
--   in kr8_face_decisions (admin "Face auto-decisions"):
--     block   selfie cosine >= verify_block_min (0.60) to the face-CHECK embedding of another, OLDER account
--             → not verified, stored as rejected "This face is already on another Kring account", 0066 'face' link written
--               (prize claims held). The member sees a friendly message + contact; never the other account.
--     review  → the Face checks queue (live_check.review has the reasons):
--               looks_like_other_account  0.50 <= cosine < 0.60 to another account's face check, or >= 0.50 to another
--                                         member's CARD photo (a card photo never blocks: it may be a stolen photo)
--               same_face_newer_account   >= 0.60 to a NEWER account (this one may be the original)
--               borderline_match          selfie vs own card photo below verify_match_ok (0.45)
--               no_card_face              no card-photo embedding
--               liveness_doubt            the phone's doubt flag (anti-spoof < 0.80 on a frame, or frames less alike than usual)
--               auto_off                  switch verify_auto_on = 0
--     pass    → kr8_members.verified = true at once (the ✓ shows instantly).
--     fail    → the live check failed on the phone (no turn / blink in time, face lost or swapped, photo or screen, or the
--               selfie clearly isn't the card photo): only the decision row is kept (no photo, no embedding). Friendly retry.
--   Max verify_tries_day (3) decisions per member per 24 h. A member who already passed the new check gets "pass" again.
--
-- CALIBRATION (17 Nov, SFace int8 run by ONNX Runtime = the phone's runtime, parity with the phone's code 0.997-0.999):
--   LFW test pairs: 3,120 same-person + 4,650 different-person pairs (+ the app's 12 demo people × 5 photos).
--     cosine >= 0.363 (OpenCV default "same"): 1.81 % of different people match, 2.2 % of same-person pairs missed
--     cosine >= 0.45: 0.11 % (5 of 4,650) different people match, 5.1 % missed
--     cosine >= 0.50: 0 of 4,650 different people match, 9.7 % missed
--     cosine >= 0.60: 0 of 4,650 different people match, 30.5 % missed (LFW same-person photos are years apart; two selfies of
--                     the same person in the same week score far higher: demo same-person minimum 0.87, median 0.94)
--   Highest score between DIFFERENT people anywhere: 0.471 (two different young Thai women in the demo set, "Eyes"-style
--   look-alikes; the 3 Thai women: 0.442 / 0.469 / 0.471). So: block >= 0.60, founder >= 0.50, own card photo pass >= 0.45.
--
-- COVERAGE: SFace embeddings are new, so NO member has one yet (the old face-api codes are a different model and cannot be
--   compared). kr8_my_face_status() tells the phone to ask each member ONCE to do the new check; old ✓ badges keep working until
--   then; prize claims already need a fresh face check (0075 holds claims without an approved face-check print, and the new check
--   still saves that older code in the background so 0075 keeps working). kr8_admin_face_coverage() has the counts.
--
-- CONSENT: unchanged rules. The phone sends face-2026-11-17d (17c wording + "result right away" + "compared with other members'
--   face codes"); anything older than 17c is refused. Stored: the frontal selfie (deleted 30 days after the decision, now ALSO by
--   the nightly kr8_cleanup_kick) and the embeddings (deleted with the account: FK on delete cascade).
--
-- TRUST (honest limit): the embeddings and the anti-spoof scores are computed on the phone; a script could send made-up numbers.
--   Mitigations: the server recomputes every similarity, made-up vectors must still be unit-length, a made-up vector is still
--   compared with every member, the selfie photo is stored for the founder's look, every decision is logged, and
--   verify_auto_on = 0 sends everything back to hand review.
--
-- ORDER: apply BEFORE the new app build. Old app builds keep using kr8_request_verification (queue, as before).
-- UNDO: update kr8_rings_config set value = 0 where key = 'verify_auto_on' (instant passes stop).
--   Full: drop function kr8_verify_instant(text, text, jsonb, real[], real[]), kr8_my_face_status(), kr8_admin_face_decisions(int),
--   kr8_admin_face_coverage(), kr8_verify_selfies_expire(), kr8_vec_ok(real[]), kr8_face_has_new_check(uuid),
--   kr8_face_live_clean(jsonb); re-run kr8_cleanup_kick from 0075; drop table kr8_face_decisions, kr8_face_vectors.

begin;

create extension if not exists vector with schema extensions;

insert into public.kr8_rings_config (key, value, note) values
  ('verify_auto_on', 1, '1 = the instant face check decides on its own (pass / review / block); 0 = every check waits for the founder (0081)'),
  ('verify_match_ok', 450, 'SFace cosine (thousandths) selfie vs own card photo at least this = match; below = founder checks (0081)'),
  ('verify_block_min', 600, 'SFace cosine to an OLDER account''s face check at least this = second account, blocked (0081)'),
  ('verify_review_min', 500, 'SFace cosine to another account at least this = founder checks (0081)'),
  ('verify_tries_day', 3, 'instant face checks per member per 24 h (0081)'),
  ('verify_live_max_ms', 25000, 'the turn + blink part of the live check must finish within this many ms on the phone (0081)'),
  ('verify_real_min', 500, 'MiniFASNet real-face score (thousandths) every checked frame must reach (0081)')
on conflict (key) do nothing;

-- ───────────── SFace embeddings (team-only; members can never read them) ─────────────
create table if not exists public.kr8_face_vectors (
  id              bigserial primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  emb             extensions.vector(128) not null,
  model           text not null default 'sface-2021dec-int8',
  source          text not null check (source in ('check', 'card')),
  verification_id uuid references public.kr8_verifications(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists kr8_face_vectors_user on public.kr8_face_vectors (user_id, source);
create index if not exists kr8_face_vectors_hnsw on public.kr8_face_vectors using hnsw (emb extensions.vector_cosine_ops);
alter table public.kr8_face_vectors enable row level security;
revoke all on public.kr8_face_vectors from public, anon, authenticated;

/** a usable embedding: 128 finite numbers, unit length (the phone L2-normalises) */
create or replace function public.kr8_vec_ok(v real[]) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select v is not null and array_length(v, 1) = 128 and array_ndims(v) = 1
     and not exists (select 1 from unnest(v) x where x is null or x = 'NaN'::real or x = 'Infinity'::real or x = '-Infinity'::real)
     and abs(sqrt((select sum(x::float8 * x::float8) from unnest(v) x)) - 1) < 0.02
$$;

-- ───────────── the admin log of every automatic decision ─────────────
create table if not exists public.kr8_face_decisions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  verification_id uuid references public.kr8_verifications(id) on delete set null,
  decision        text not null check (decision in ('pass', 'review', 'block', 'fail')),
  reasons         text[] not null default '{}',
  match           numeric,          -- SFace cosine, selfie vs own card photo (server-computed)
  dup_sim         numeric,          -- SFace cosine to the most similar other account
  dup_user        uuid,             -- no FK: the log survives the other account's deletion
  dup_source      text,
  was_verified    boolean not null default false,
  live            jsonb not null default '{}'::jsonb,   -- step results + timing from the phone (no face measurements)
  created_at      timestamptz not null default now()
);
create index if not exists kr8_face_decisions_user on public.kr8_face_decisions (user_id, created_at desc);
create index if not exists kr8_face_decisions_at on public.kr8_face_decisions (created_at desc);
alter table public.kr8_face_decisions enable row level security;
revoke all on public.kr8_face_decisions from public, anon, authenticated;

-- only the known step / timing fields from the phone, never face measurements
create or replace function public.kr8_face_live_clean(p jsonb) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'live', coalesce((p ->> 'live')::boolean, false),
    'straight', coalesce((p ->> 'straight')::boolean, false), 'left', coalesce((p ->> 'left')::boolean, false),
    'right', coalesce((p ->> 'right')::boolean, false), 'blink', coalesce((p ->> 'blink')::boolean, false),
    'order', case when p ->> 'order' in ('left-right', 'right-left') then p ->> 'order' end,
    'ms', case when jsonb_typeof(p -> 'ms') = 'number' then least(greatest((p ->> 'ms')::numeric, 0), 600000)::int end,
    'engine', case when p ->> 'engine' in ('mediapipe', 'faceapi') then p ->> 'engine' end,
    'same', case when jsonb_typeof(p -> 'same') = 'number' then round((p ->> 'same')::numeric, 3) end,
    'real', case when jsonb_typeof(p -> 'real') = 'number' then round((p ->> 'real')::numeric, 3) end,
    'frames', case when jsonb_typeof(p -> 'frames') = 'number' then least(greatest((p ->> 'frames')::int, 0), 20) end,
    'match', case when jsonb_typeof(p -> 'match') = 'number' then round((p ->> 'match')::numeric, 3) end,
    'doubt', case when (p ->> 'doubt')::boolean then true end,
    'fail', case when p ->> 'fail' in ('timeout', 'lost', 'noface', 'swap', 'mismatch', 'still', 'spoof') then p ->> 'fail' end,
    'device', left(coalesce(p ->> 'device', ''), 60)))
$$;

/** does this member have an SFace embedding from an APPROVED new face check? */
create or replace function public.kr8_face_has_new_check(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.kr8_face_vectors f join public.kr8_verifications v on v.id = f.verification_id
                  where f.user_id = p_user and v.user_id = p_user and f.source = 'check' and v.status = 'approved')
$$;
revoke all on function public.kr8_face_live_clean(jsonb), public.kr8_face_has_new_check(uuid), public.kr8_vec_ok(real[]) from public, anon, authenticated;

-- ───────────── the member's phone: the instant check ─────────────
drop function if exists public.kr8_verify_instant(text, text, jsonb, real[]);
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
  if p_selfie_path is null then
    insert into public.kr8_face_decisions (user_id, decision, reasons, match, was_verified, live)
    values (uid, 'fail', array[coalesce(live ->> 'fail', 'timeout')], (live ->> 'match')::numeric, me.verified, live);
    return jsonb_build_object('result', 'fail', 'reasons', to_jsonb(array[coalesce(live ->> 'fail', 'timeout')]), 'verified', me.verified,
                              'tries_left', greatest(tries - n - 1, 0));
  end if;

  if split_part(p_selfie_path, '/', 1) <> uid::text or p_selfie_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' then raise exception 'KR8_BAD_SELFIE'; end if;
  if to_regclass('storage.objects') is not null and not exists (select 1 from storage.objects where bucket_id = 'kr8-verify' and name = p_selfie_path) then
    raise exception 'KR8_BAD_SELFIE';
  end if;
  if not public.kr8_vec_ok(p_emb) then raise exception 'KR8_BAD_FACE'; end if;

  -- the live check must have passed on the phone, within the time limit, with every frame scored real
  if not ((live ->> 'live')::boolean and (live ->> 'straight')::boolean and (live ->> 'left')::boolean and (live ->> 'right')::boolean
          and (live ->> 'blink')::boolean and coalesce((live ->> 'ms')::int, 999999) <= public.kr8_rcfg('verify_live_max_ms', 25000)
          and coalesce((live ->> 'frames')::int, 0) >= 3 and coalesce((live ->> 'real')::float8, 0) >= public.kr8_rcfg('verify_real_min', 500) / 1000.0) then
    if to_regclass('public.kr8_storage_trash') is not null then
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

/** the phone: does this member still need the new check? (the app asks each member once) */
create or replace function public.kr8_my_face_status() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v boolean; n int;
begin
  if uid is null then return null; end if;
  select verified into v from public.kr8_members where user_id = uid;
  if not found then return null; end if;
  select count(*) into n from public.kr8_face_decisions where user_id = uid and created_at > now() - interval '1 day';
  return jsonb_build_object('verified', v, 'new_check', public.kr8_face_has_new_check(uid),
    'pending', exists (select 1 from public.kr8_verifications where user_id = uid and status = 'pending'),
    'blocked', exists (select 1 from public.kr8_face_decisions where user_id = uid and decision = 'block' and created_at > now() - interval '30 days')
               and not v,
    'tries_left', greatest(public.kr8_rcfg('verify_tries_day', 3) - n, 0));
end $$;
revoke all on function public.kr8_my_face_status() from public, anon;
grant execute on function public.kr8_my_face_status() to authenticated;

-- ───────────── admin: the log + coverage ─────────────
create or replace function public.kr8_admin_face_decisions(p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return coalesce((select jsonb_agg(x order by x.created_at desc) from (
    select d.id, d.created_at, d.decision, d.reasons, d.match, d.dup_sim, d.dup_source, d.was_verified, d.verification_id,
           d.live ->> 'engine' engine, d.live ->> 'ms' ms, d.live ->> 'device' device,
           d.user_id, m.member_no, m.first_name, m.photo, o.member_no dup_member_no, o.first_name dup_name
      from public.kr8_face_decisions d left join public.kr8_members m on m.user_id = d.user_id
      left join public.kr8_members o on o.user_id = d.dup_user
     order by d.created_at desc limit greatest(1, least(coalesce(p_limit, 100), 500))) x), '[]'::jsonb);
end $$;

create or replace function public.kr8_admin_face_coverage() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return (select jsonb_build_object(
    'members', count(*),
    'new_check', count(*) filter (where public.kr8_face_has_new_check(m.user_id)),
    'comparable', count(*) filter (where exists (select 1 from public.kr8_face_vectors f where f.user_id = m.user_id and f.source = 'check')),
    'card_only', count(*) filter (where exists (select 1 from public.kr8_face_vectors f where f.user_id = m.user_id and f.source = 'card')
                                     and not exists (select 1 from public.kr8_face_vectors f where f.user_id = m.user_id and f.source = 'check')),
    'none', count(*) filter (where not exists (select 1 from public.kr8_face_vectors f where f.user_id = m.user_id)),
    'verified', count(*) filter (where m.verified),
    'verified_not_comparable', count(*) filter (where m.verified and not exists (select 1 from public.kr8_face_vectors f where f.user_id = m.user_id and f.source = 'check')),
    'old_faceapi_codes', count(*) filter (where exists (select 1 from public.kr8_face_prints f where f.user_id = m.user_id)))
    from public.kr8_members m where not public.kr8_is_team(m.user_id));
end $$;
revoke all on function public.kr8_admin_face_decisions(int), public.kr8_admin_face_coverage() from public, anon;
grant execute on function public.kr8_admin_face_decisions(int), public.kr8_admin_face_coverage() to authenticated;

-- ───────────── 30-day selfie deletion without the founder opening Face checks ─────────────
/** selfies decided more than 30 days ago → queued for removal (kr8-cleanup removes the files). Returns how many. */
create or replace function public.kr8_verify_selfies_expire() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if to_regclass('public.kr8_storage_trash') is null then return 0; end if;
  insert into public.kr8_storage_trash (bucket, name, user_id)
  select 'kr8-verify', v.selfie_path, v.user_id from public.kr8_verifications v
   where v.selfie_path is not null and v.selfie_deleted_at is null and v.reviewed_at < now() - interval '30 days'
  on conflict (bucket, name) do nothing;
  update public.kr8_verifications set selfie_deleted_at = now(), selfie_path = null
   where selfie_path is not null and selfie_deleted_at is null and reviewed_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.kr8_verify_selfies_expire() from public, anon, authenticated;

-- 0075 body + the line for face-check selfies
create or replace function public.kr8_cleanup_kick() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int := 0; k text;
begin
  n := public.kr8_claim_photos_expire();
  n := n + public.kr8_verify_selfies_expire();
  select decrypted_secret into k from vault.decrypted_secrets where name = 'notify_hook_secret' limit 1;
  if k is not null and exists (select 1 from public.kr8_storage_trash where bucket = 'kr8-verify' and removed_at is null) then
    perform net.http_post(
      url := 'https://pedxoxpammnyfnizljyj.supabase.co/functions/v1/kr8-cleanup',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', k),
      body := '{"job":"verify_trash"}'::jsonb, timeout_milliseconds := 30000);
  end if;
  return n;
exception when others then
  return n;
end $$;
revoke all on function public.kr8_cleanup_kick() from public, anon, authenticated;

commit;
