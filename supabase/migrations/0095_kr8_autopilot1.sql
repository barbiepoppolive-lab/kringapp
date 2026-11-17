-- 0095 · Autopilot Step 1 (17 Nov 2026): Money Robot recommendations, Member Trust Score (0–100),
--        Duplicate Robot (automatic, silent, undoable), Today Robot Report, and Rings Guard.
--
-- FOUNDER'S RULES:
--   1) Robots do the work, but FINAL MONEY DECISIONS COME TO THE FOUNDER in the admin panel (one tap, Undo toast).
--      Held claims are NEVER auto-paid or auto-refused here: Money Robot gives recommendations + top 3 reasons only.
--   2) Duplicates (SFace dup_sim >= 0.60 to an OLDER account, or same claim device as another claimer) and fake Rings
--      (likes/saves from members with trust < 30 or accounts < 24 h old) are handled automatically, silently, and undoably.
--      0.50–0.60 look-alikes stay founder decisions.
--   3) Members are never told why something was refused. Admin text is plain English only.
--
-- ADDITIVE + RE-RUNNABLE. Written for kring-test (pgvector in schema "extensions"; live converts extensions.vector -> public.vector).
--
-- UNDO: run supabase/undo/0095_kr8_autopilot1_UNDO.sql (re-runnable; test copy uses extensions.vector, live copy public.vector).
--   It switches the robots off, un-hides everyone the Duplicate Robot hid (restoring their Reels/Rings), clears the preview list,
--   puts back the pre-0095 bodies of kr8_reel_scores, kr8_verify_instant, kr8_admin_v2_snapshot/_member/_activity,
--   then drops the 0095 functions and trigger.
--
-- 18 Nov changes (founder): Rings guard removed (likes/saves from new or low-trust accounts earn normal Rings);
--   shared Wi-Fi is −10 and only next to another warning sign; the sweep of past data is a DRY RUN until dup_sweep_on = 1.

begin;

insert into public.kr8_rings_config (key, value, note) values
  ('dup_robot_on', 1, '1 = duplicate robot ghosts newer account when dup_sim >= 0.60 to an older account or same claim device (0095)'),
  ('dup_sweep_on', 0, '0 = the duplicate robot''s sweep of PAST data only previews who it would hide; 1 = it hides them (run select public.kr8_dup_robot_sweep(); after switching) (0095)')
on conflict (key) do nothing;

-- ───────────────────────── internal admin check for any user_id ─────────────────────────
create or replace function public.kr8_is_admin_uid(p uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p is not null and (
    exists (select 1 from public.kr6_staff s where s.user_id = p and s.role = 'admin')
    or exists (select 1 from auth.users u join public.kr8_admin_emails a on a.email = lower(u.email) where u.id = p)
  )
$$;
revoke all on function public.kr8_is_admin_uid(uuid) from public, anon, authenticated;

-- ───────────────────────── 2. TRUST SCORE 0–100 per member ─────────────────────────
create or replace function public.kr8_trust(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  m public.kr8_members;
  joined timestamptz;
  score int := 50;
  items jsonb := '[]'::jsonb;
  real_ph boolean := false;
  has_reel boolean := false;
  v_status text;
  same_no int;
  alike_no int;
  dev_no int;
  shared_wifi boolean := false;
  first_claim timestamptz;
  fast_claim boolean := false;
  total_lk int := 0;
  young_lk int := 0;
  link_tries int := 0;
  unk text := encode(extensions.digest('kr8-ip-salt|unknown', 'sha256'), 'hex');
begin
  if p_user is null then
    return jsonb_build_object('score', 0, 'reasons', '[]'::jsonb);
  end if;

  select * into m from public.kr8_members where user_id = p_user;
  select coalesce(m.created_at, u.created_at) into joined from auth.users u where u.id = p_user;
  joined := coalesce(joined, m.created_at, now());

  if m.user_id is null then
    return jsonb_build_object('score', 25, 'reasons', jsonb_build_array('−25 no member card yet'));
  end if;

  -- +30 face verified (or -20 if latest verification was refused)
  if coalesce(m.verified, false) then
    score := score + 30;
    items := items || jsonb_build_array(jsonb_build_object('w', 30, 't', '+30 face verified'));
  else
    select v.status into v_status from public.kr8_verifications v where v.user_id = p_user order by v.created_at desc limit 1;
    if v_status = 'rejected' then
      score := score - 20;
      items := items || jsonb_build_array(jsonb_build_object('w', 20, 't', '−20 face check refused'));
    end if;
  end if;

  -- +10 real photo (same rule as 0087)
  real_ph := coalesce(m.photo like 'data:image/%' and length(m.photo) > 200 and coalesce(m.photo_check, 'ok') = 'ok', false);
  if real_ph then
    score := score + 10;
    items := items || jsonb_build_array(jsonb_build_object('w', 10, 't', '+10 real photo'));
  end if;

  -- +10 approved Reel
  select exists (
    select 1 from public.kr8_posts p
    where p.author = p_user and p.kind = 'reel' and p.status = 'approved' and not p.hidden and not p.board_off
  ) into has_reel;
  if has_reel then
    score := score + 10;
    items := items || jsonb_build_array(jsonb_build_object('w', 10, 't', '+10 approved Reel'));
  end if;

  -- -40 same face as #N (dup_sim >= 0.60 or face-api dist < 0.40, not dismissed) / -20 borderline look-alike
  select om.member_no into same_no
  from (
    select case when l.a = p_user then l.b else l.a end as other_id
    from public.kr8_account_links l
    where (l.a = p_user or l.b = p_user) and l.dismissed_at is null and l.reason = 'face'
      and (coalesce((l.detail ->> 'sface_sim')::float8, 0) >= 0.60
           or ((l.detail ->> 'dist') is not null and (l.detail ->> 'dist')::float8 < 0.40))
    union
    select d.dup_user as other_id
    from public.kr8_face_decisions d
    where d.user_id = p_user and d.dup_user is not null and d.dup_user <> p_user and coalesce(d.dup_sim, 0) >= 0.60
      and not exists (
        select 1 from public.kr8_account_links dl
        where dl.a = least(p_user, d.dup_user) and dl.b = greatest(p_user, d.dup_user) and dl.dismissed_at is not null
      )
  ) s
  join public.kr8_members om on om.user_id = s.other_id
  order by om.member_no asc nulls last limit 1;

  if same_no is not null then
    score := score - 40;
    items := items || jsonb_build_array(jsonb_build_object('w', 40, 't', '−40 same face as #' || same_no));
  else
    select om.member_no into alike_no
    from public.kr8_account_links l
    join public.kr8_members om on om.user_id = (case when l.a = p_user then l.b else l.a end)
    where (l.a = p_user or l.b = p_user) and l.dismissed_at is null and l.reason = 'face'
    order by om.member_no asc nulls last limit 1;
    if alike_no is not null then
      score := score - 20;
      items := items || jsonb_build_array(jsonb_build_object('w', 20, 't', '−20 looks like #' || alike_no));
    end if;
  end if;

  -- -35 same phone as #N, else -25 same Wi-Fi as a claimer
  select om.member_no into dev_no
  from public.kr8_account_links l
  join public.kr8_members om on om.user_id = (case when l.a = p_user then l.b else l.a end)
  where (l.a = p_user or l.b = p_user) and l.dismissed_at is null and l.reason = 'device'
  order by om.member_no asc nulls last limit 1;

  if dev_no is not null then
    score := score - 35;
    items := items || jsonb_build_array(jsonb_build_object('w', 35, 't', '−35 same phone as #' || dev_no));
  else
    select (
      exists (
        select 1 from public.kr8_account_links l
        where (l.a = p_user or l.b = p_user) and l.dismissed_at is null and l.reason = 'network'
      )
      or exists (
        select 1 from public.kr8_reward_claims c1
        join public.kr8_reward_claims c2 on c2.member_id <> c1.member_id
          and ((c1.ip_hash is not null and c1.ip_hash <> unk and c1.ip_hash = c2.ip_hash)
               or (c1.device is not null and c1.device = c2.device))
        where c1.member_id = p_user and not c1.is_test and not c2.is_test
      )
    ) into shared_wifi;
    -- founder 18 Nov: shared Wi-Fi alone counts 0 (cafés, condos); it is applied further down only next to another warning sign
  end if;

  -- -20 claimed within 15 min of joining
  select min(c.created_at) into first_claim
  from public.kr8_reward_claims c
  where c.member_id = p_user and not c.is_test;
  if first_claim is not null and first_claim <= joined + interval '15 minutes' then
    fast_claim := true;
    score := score - 20;
    items := items || jsonb_build_array(jsonb_build_object('w', 20, 't', '−20 claimed within 15 min of joining'));
  end if;

  -- -15 likes mostly from accounts <24h old
  select count(*)::int,
         count(*) filter (where l.created_at < lm.created_at + interval '24 hours')::int
    into total_lk, young_lk
  from public.kr8_posts p
  join public.kr8_post_likes l on l.post_id = p.id and l.user_id <> p_user
  join public.kr8_members lm on lm.user_id = l.user_id
  where p.author = p_user and p.kind = 'reel' and not p.hidden;
  if total_lk >= 3 and young_lk * 2 > total_lk then
    score := score - 15;
    items := items || jsonb_build_array(jsonb_build_object('w', 15, 't', '−15 likes mostly from accounts <24h old'));
  end if;

  -- -10 repeated blocked link tries in chat (0090)
  if to_regclass('public.kr8_link_tries') is not null then
    select count(*)::int into link_tries from public.kr8_link_tries where user_id = p_user;
    if link_tries >= 2 then
      score := score - 10;
      items := items || jsonb_build_array(jsonb_build_object('w', 10, 't', '−10 tried sending web links in chat'));
    end if;
  end if;

  -- -10 same Wi-Fi as a claimer: ONLY with another warning sign (same face / look-alike, link tries, or claim within 15 min); alone it counts 0
  if shared_wifi and (same_no is not null or alike_no is not null or link_tries >= 2 or fast_claim) then
    score := score - 10;
    items := items || jsonb_build_array(jsonb_build_object('w', 10, 't', '−10 same Wi-Fi as a claimer'));
  end if;

  score := least(100, greatest(0, score));
  return jsonb_build_object(
    'score', score,
    'reasons', coalesce((
      select jsonb_agg(x -> 't' order by (x ->> 'w')::int desc)
      from jsonb_array_elements(items) x
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.kr8_trust(uuid) from public, anon, authenticated;

-- ───────────────────────── 3. DUPLICATE ROBOT (automatic, silent, undoable) ─────────────────────────
-- p_dry = true: change nothing, only log 'dup_auto_preview' ("would hide") for the founder to look at
drop function if exists public.kr8_dup_robot_ghost(uuid, uuid, text, numeric);
create or replace function public.kr8_dup_robot_ghost(p_a uuid, p_b uuid, p_why text, p_sim numeric default null, p_dry boolean default false)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  keep_id uuid;
  dup_id uuid;
  km public.kr8_members;
  dm public.kr8_members;
  ka timestamptz;
  da timestamptz;
  w0 timestamptz := public.kr8_week_start(now());
  posts jsonb := '[]'::jsonb;
  lvoid int := 0;
begin
  if public.kr8_rcfg('dup_robot_on', 1) <> 1 then return false; end if;
  if p_a is null or p_b is null or p_a = p_b then return false; end if;

  -- Never auto-act if the founder already dismissed this pair ("Different people" / Undo)
  if exists (
    select 1 from public.kr8_account_links l
    where l.a = least(p_a, p_b) and l.b = greatest(p_a, p_b) and l.dismissed_at is not null
  ) then
    return false;
  end if;

  select * into km from public.kr8_members where user_id = p_a;
  select * into dm from public.kr8_members where user_id = p_b;
  if km.user_id is null or dm.user_id is null then return false; end if;

  select coalesce(km.created_at, u.created_at) into ka from auth.users u where u.id = p_a;
  select coalesce(dm.created_at, u.created_at) into da from auth.users u where u.id = p_b;
  ka := coalesce(ka, km.created_at, now());
  da := coalesce(da, dm.created_at, now());

  -- Always keep the OLDEST account, ghost the NEWER account
  if ka < da or (ka = da and coalesce(km.member_no, 999999) <= coalesce(dm.member_no, 999999)) then
    keep_id := p_a; dup_id := p_b;
  else
    keep_id := p_b; dup_id := p_a;
    select * into km from public.kr8_members where user_id = keep_id;
    select * into dm from public.kr8_members where user_id = dup_id;
  end if;

  -- Never ghost team, admin, or test accounts, or an account already ghosted
  if dm.ghost or public.kr8_is_team(dup_id) or public.kr8_is_test_member(dup_id) or public.kr8_is_admin_uid(dup_id) then
    return false;
  end if;

  if p_dry then
    if not exists (select 1 from public.kr8_admin_actions_log g where g.action = 'dup_auto_preview' and g.detail ->> 'dup' = dup_id::text) then
      insert into public.kr8_admin_actions_log (action, detail)
      values ('dup_auto_preview', jsonb_build_object(
        'keep', keep_id, 'keep_no', km.member_no, 'keep_name', km.first_name,
        'dup', dup_id, 'dup_no', dm.member_no, 'dup_name', dm.first_name,
        'why', p_why, 'dup_sim', p_sim, 'posts', '[]'::jsonb, 'ledger_void', 0, 'week', w0::date::text));
    end if;
    return true;
  end if;

  -- Record the account link so Rings between them are also ignored
  perform public.kr8_link_add(
    keep_id,
    dup_id,
    case when p_why = 'same_device' then 'device' else 'face' end,
    case when p_sim is not null then jsonb_build_object('sface_sim', round(p_sim, 3), 'auto', 'dup_robot')
         else jsonb_build_object('where', 'claims', 'auto', 'dup_robot') end
  );

  -- Void newer account's Reels on this week's board (remembering post IDs for lossless Undo)
  select coalesce(jsonb_agg(p.id), '[]'::jsonb) into posts
  from public.kr8_posts p
  where p.author = dup_id and p.kind = 'reel' and not p.board_off and p.created_at >= w0;

  if jsonb_array_length(posts) > 0 then
    update public.kr8_posts
       set board_off = true, board_off_reason = 'auto_dup'
     where author = dup_id and kind = 'reel' and not board_off and created_at >= w0;
  end if;

  -- Void any positive ledger Rings earned this week (using valid 'reel_removed' reason + unique ref_id)
  select coalesce(sum(l.delta), 0)::int into lvoid
  from public.kr8_rings_ledger l
  where l.member_id = dup_id and l.created_at >= w0;

  if lvoid > 0 then
    insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id)
    values (dup_id, -lvoid, 'reel_removed', 'dup_auto:' || w0::date::text)
    on conflict (member_id, reason, ref_id) do nothing;
  else
    lvoid := 0;
  end if;

  -- Ghost the newer account silently (kr8_ghost_member_trg requires kr8.ghost_set = '1')
  perform set_config('kr8.ghost_set', '1', true);
  update public.kr8_members set ghost = true, here_until = null where user_id = dup_id;
  perform set_config('kr8.ghost_set', '', true);

  insert into public.kr8_admin_actions_log (action, detail)
  values ('dup_auto_ghost', jsonb_build_object(
    'keep', keep_id, 'keep_no', km.member_no, 'keep_name', km.first_name,
    'dup', dup_id, 'dup_no', dm.member_no, 'dup_name', dm.first_name,
    'why', p_why, 'dup_sim', p_sim, 'posts', posts, 'ledger_void', lvoid, 'week', w0::date::text
  ));

  return true;
end $$;
revoke all on function public.kr8_dup_robot_ghost(uuid, uuid, text, numeric, boolean) from public, anon, authenticated;

-- Trigger on reward claims: same device as another claimer -> keep oldest, ghost newer
create or replace function public.kr8_dup_robot_claim_trg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare other_uid uuid;
begin
  if new.member_id is null or new.device is null or new.is_test then return new; end if;
  if public.kr8_rcfg('dup_robot_on', 1) <> 1 then return new; end if;

  select c.member_id into other_uid
  from public.kr8_reward_claims c
  join public.kr8_members m on m.user_id = c.member_id
  where c.device = new.device and c.member_id <> new.member_id and c.status <> 'cancelled' and not c.is_test
  order by m.created_at asc, m.member_no asc nulls last
  limit 1;

  if other_uid is not null then
    -- a robot error must never block the member's claim
    begin
      perform public.kr8_dup_robot_ghost(other_uid, new.member_id, 'same_device', null);
    exception when others then
      raise warning 'kr8_dup_robot_claim: %', sqlerrm;
    end;
  end if;
  return new;
end $$;
revoke all on function public.kr8_dup_robot_claim_trg() from public, anon, authenticated;

drop trigger if exists kr8_dup_robot_claim on public.kr8_reward_claims;
create trigger kr8_dup_robot_claim
  after insert on public.kr8_reward_claims
  for each row execute function public.kr8_dup_robot_claim_trg();

-- Hook Duplicate Robot into kr8_verify_instant (exact 0092 body + kr8_dup_robot_ghost on block when dup_sim >= 0.60 to older account; 0.50–0.60 stays 'review')
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
  if public.kr8_vec_ok(p_card_emb) then
    card := p_card_emb::extensions.vector;
    m := 1 - (e operator(extensions.<=>) card);
    delete from public.kr8_face_vectors where user_id = uid and source = 'card';
    insert into public.kr8_face_vectors (user_id, emb, source) values (uid, card, 'card');
  end if;

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
    -- 0095: Duplicate Robot automatically ghosts the newer account + voids its Rings this week (logged + undoable)
    begin  -- a robot error must never break the member's face check
      perform public.kr8_dup_robot_ghost(chk.user_id, uid, 'same_face', round(chk.sim::numeric, 3));
    exception when others then
      raise warning 'kr8_dup_robot (verify): %', sqlerrm;
    end;
  end if;
  insert into public.kr8_face_decisions (user_id, verification_id, decision, reasons, match, dup_sim, dup_user, dup_source, was_verified, live)
  values (uid, vid, decision, reasons, round(m::numeric, 3), round(best.s::numeric, 3), best.u, best.src, me.verified, live);
  return jsonb_build_object('result', decision, 'reasons', to_jsonb(reasons),
                            'verified', case decision when 'pass' then true when 'block' then false else me.verified end,
                            'tries_left', greatest(tries - n - 1, 0));
end $$;
revoke all on function public.kr8_verify_instant(text, text, jsonb, real[], real[]) from public, anon;
grant execute on function public.kr8_verify_instant(text, text, jsonb, real[], real[]) to authenticated;

-- Admin list + Undo for Duplicate Robot actions (mirrors 0086 kr8_admin_places_auto / kr8_admin_place_undo)
create or replace function public.kr8_admin_dups_auto(p_days integer default 14)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return coalesce((
    select jsonb_agg(x order by x ->> 'at' desc)
    from (
      select distinct on (g.detail ->> 'dup')
        jsonb_build_object(
          'at', g.at,
          'dup', g.detail ->> 'dup',
          'dup_no', coalesce(dm.member_no, (g.detail ->> 'dup_no')::int),
          'dup_name', coalesce(dm.first_name, g.detail ->> 'dup_name'),
          'keep', g.detail ->> 'keep',
          'keep_no', coalesce(km.member_no, (g.detail ->> 'keep_no')::int),
          'keep_name', coalesce(km.first_name, g.detail ->> 'keep_name'),
          'why', g.detail ->> 'why',
          'preview', g.action = 'dup_auto_preview',
          'dup_sim', (g.detail ->> 'dup_sim')::numeric,
          'voided_reels', jsonb_array_length(coalesce(g.detail -> 'posts', '[]'::jsonb)),
          'ledger_void', coalesce((g.detail ->> 'ledger_void')::int, 0),
          'ghost', coalesce(dm.ghost, false),
          'undone', exists (
            select 1 from public.kr8_admin_actions_log u
            where u.action = 'dup_auto_undo' and u.detail ->> 'dup' = g.detail ->> 'dup' and u.at > g.at
          )
        ) as x
      from public.kr8_admin_actions_log g
      left join public.kr8_members dm on dm.user_id::text = g.detail ->> 'dup'
      left join public.kr8_members km on km.user_id::text = g.detail ->> 'keep'
      where (g.action = 'dup_auto_ghost' and g.at > now() - make_interval(days => least(greatest(coalesce(p_days, 14), 1), 60)))
         or g.action = 'dup_auto_preview'   -- dry-run "would hide" rows (no age limit; replaced on each sweep)
      order by g.detail ->> 'dup', (g.action = 'dup_auto_ghost') desc, g.at desc
    ) latest
    limit 200
  ), '[]'::jsonb);
end $$;
revoke all on function public.kr8_admin_dups_auto(integer) from public, anon;
grant execute on function public.kr8_admin_dups_auto(integer) to authenticated;

create or replace function public.kr8_admin_dup_auto_undo(p_dup uuid, p_action text default 'undo')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  det jsonb;
  keep_id uuid;
  posts jsonb;
  wk text;
  restored int := 0;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_dup is null then raise exception 'KR8_NO_PERSON'; end if;
  if p_action not in ('undo', 'redo') then raise exception 'KR8_BAD_ACTION'; end if;

  select g.detail into det
  from public.kr8_admin_actions_log g
  where g.action = 'dup_auto_ghost' and g.detail ->> 'dup' = p_dup::text
  order by g.at desc limit 1;

  if det is null then raise exception 'KR8_NO_PERSON'; end if;
  keep_id := nullif(det ->> 'keep', '')::uuid;

  if p_action = 'undo' then
    perform set_config('kr8.ghost_set', '1', true);
    update public.kr8_members set ghost = false where user_id = p_dup;
    perform set_config('kr8.ghost_set', '', true);

    posts := coalesce(det -> 'posts', '[]'::jsonb);
    if jsonb_array_length(posts) > 0 then
      update public.kr8_posts
         set board_off = false, board_off_reason = null
       where author = p_dup and board_off_reason = 'auto_dup'
         and id in (select (v #>> '{}')::uuid from jsonb_array_elements(posts) v);
      get diagnostics restored = row_count;
    end if;

    wk := det ->> 'week';
    if wk is not null then
      delete from public.kr8_rings_ledger
       where member_id = p_dup and reason = 'reel_removed' and ref_id = 'dup_auto:' || wk;
    end if;

    if keep_id is not null then
      update public.kr8_account_links
         set dismissed_at = now(), dismissed_by = auth.uid()
       where a = least(keep_id, p_dup) and b = greatest(keep_id, p_dup) and dismissed_at is null;
    end if;

    insert into public.kr8_admin_actions_log (action, detail)
    values ('dup_auto_undo', jsonb_build_object('dup', p_dup, 'keep', keep_id, 'restored_reels', restored));
    return jsonb_build_object('dup', p_dup, 'ghost', false, 'restored_reels', restored);
  else
    if keep_id is not null then
      update public.kr8_account_links
         set dismissed_at = null, dismissed_by = null
       where a = least(keep_id, p_dup) and b = greatest(keep_id, p_dup);
      perform public.kr8_dup_robot_ghost(keep_id, p_dup, coalesce(det ->> 'why', 'same_face'), (det ->> 'dup_sim')::numeric);
    end if;
    return jsonb_build_object('dup', p_dup, 'ghost', true);
  end if;
end $$;
revoke all on function public.kr8_admin_dup_auto_undo(uuid, text) from public, anon;
grant execute on function public.kr8_admin_dup_auto_undo(uuid, text) to authenticated;

-- ───────────────────────── 5. RINGS GUARD — REMOVED (founder, 18 Nov: every member is new right now) ─────────────────────────
-- Likes and saves from new or low-trust accounts earn normal Rings. kr8_reel_scores = the 0074 body plus ONE Duplicate-Robot rule:
-- Reels by ghosted (hidden duplicate) authors, and likes/saves BY ghosted accounts, earn no Rings. No trust or account-age guard.
drop function if exists public.kr8_board_ignored_rings(timestamptz, boolean, uuid);
drop function if exists public.kr8_liker_guard_ok(uuid);
delete from public.kr8_rings_config where key in ('rings_guard_on', 'rings_guard_min_trust');

create or replace function public.kr8_reel_scores(p_from timestamptz, p_to timestamptz, p_until timestamptz, p_test boolean, p_author uuid default null)
returns table (post_id uuid, author uuid, posted_at timestamptz, l_local int, l_trav int, s_local int, s_trav int, opens int, score int)
language sql stable security definer set search_path = public, pg_temp as $$
  with cfg as (select public.kr8_rcfg('like', 1) w_like, public.kr8_rcfg('save', 3) w_save, public.kr8_rcfg('open', 5) w_open,
                      public.kr8_rcfg('traveller_mult', 2) mult, public.kr8_rcfg('opens_day_cap', 30) cap),
  reels as (
    select p.id, p.author, p.created_at
    from public.kr8_posts p
    where p.kind = 'reel' and p.status = 'approved' and not p.hidden
      and p.created_at >= p_from and p.created_at < p_to
      and (p_author is null or p.author = p_author)
      and not p.board_off   -- 0074: admin "Feed only" (AI-made, not own footage, repost): stays in the feed, never on the board
      and exists (select 1 from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id   -- 0072: at least one Bangkok place
                  where pp.post_id = p.id and not pl.outside_bkk)
      and exists (select 1 from public.kr8_members am where am.user_id = p.author and not am.ghost)   -- 0095: hidden duplicates earn nothing
      and public.kr8_is_test_member(p.author) = p_test
      and not public.kr8_is_team(p.author)
  ),
  ppl as (   -- members whose likes and saves count
    select m.user_id, (m.who = 'traveller' and (m.verified or public.kr8_rcfg('traveller_mult_needs_verified', 1) = 0)) as trav
    from public.kr8_members m
    where coalesce(m.photo, '') <> '' and btrim(coalesce(m.first_name, '')) <> '' and public.kr8_is_test_member(m.user_id) = p_test and not public.kr8_is_team(m.user_id)
      and not m.ghost   -- 0095: a hidden duplicate's likes/saves earn nothing
      and (m.verified or m.created_at < now() - make_interval(hours => public.kr8_rcfg('liker_min_age_hours', 72)))
  ),
  lk as (
    select r.id, count(*) filter (where not c.trav)::int a, count(*) filter (where c.trav)::int b
    from reels r join public.kr8_post_likes l on l.post_id = r.id and l.user_id <> r.author and l.created_at < p_until
    join ppl c on c.user_id = l.user_id
    where not public.kr8_linked(l.user_id, r.author)
    group by r.id
  ),
  sv as (
    select r.id, count(*) filter (where not c.trav)::int a, count(*) filter (where c.trav)::int b
    from reels r join public.kr8_post_saves s on s.post_id = r.id and s.user_id <> r.author and s.created_at < p_until
    join ppl c on c.user_id = s.user_id
    where not public.kr8_linked(s.user_id, r.author)
    group by r.id
  ),
  od as (
    select r.id, o.bkk_date, count(*)::int n
    from reels r join public.kr8_share_opens o on o.post_id = r.id and o.ok and o.created_at < p_until
    where o.opener is distinct from r.author
      and (o.opener is null or not public.kr8_linked(o.opener, r.author))
      and not exists (select 1 from public.kr8_share_opens mine where mine.opener = r.author and (mine.session = o.session or mine.device = o.device))
    group by r.id, o.bkk_date
  ),
  op as (select od.id, sum(least(od.n, cfg.cap))::int n from od, cfg group by od.id)
  select r.id, r.author, r.created_at,
         coalesce(lk.a, 0), coalesce(lk.b, 0), coalesce(sv.a, 0), coalesce(sv.b, 0), coalesce(op.n, 0),
         (coalesce(lk.a, 0) * cfg.w_like + coalesce(lk.b, 0) * cfg.w_like * cfg.mult
          + coalesce(sv.a, 0) * cfg.w_save + coalesce(sv.b, 0) * cfg.w_save * cfg.mult
          + coalesce(op.n, 0) * cfg.w_open)::int
  from reels r cross join cfg left join lk on lk.id = r.id left join sv on sv.id = r.id left join op on op.id = r.id
$$;
revoke all on function public.kr8_reel_scores(timestamptz, timestamptz, timestamptz, boolean, uuid) from public, anon, authenticated;

-- ───────────────────────── Admin v2 Snapshot + Member 360 + Activity Log (additive fields only) ─────────────────────────
create or replace function public.kr8_admin_v2_snapshot(p_include_test boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d0 timestamptz := ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
  w0 timestamptz := public.kr8_week_start(now());
  r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  with acc as materialized (
    select u.id as user_id, public.kr8_admin_v2_kind(u.id) as kind, u.created_at as auth_at, u.email
    from auth.users u
    union all
    select m.user_id, public.kr8_admin_v2_kind(m.user_id), m.created_at, null
    from public.kr8_members m where not exists (select 1 from auth.users u where u.id = m.user_id)
  ),
  shown as materialized (select * from acc where p_include_test or kind in ('real', 'nocard')),
  lk as materialized (
    select l.a, l.b, l.reason, l.detail, l.first_at from public.kr8_account_links l
    where l.dismissed_at is null and l.a in (select user_id from shown) and l.b in (select user_id from shown)
  ),
  cl as materialized (
    select c.*, h.reason as hold_reason, h.decided, h.decided_at, h.face_dist, h.detail as hold_detail
    from public.kr8_reward_claims c left join public.kr8_claim_holds h on h.claim_id = c.id
    where (p_include_test or not c.is_test) and (c.member_id is null or c.member_id in (select user_id from shown))
  ),
  board as materialized (select b.* from public.kr8_week_board(w0, false) b),
  sc as materialized (
    select s.author, sum(s.l_local + s.l_trav)::int as likes, sum(s.s_local + s.s_trav)::int as saves, sum(s.opens)::int as opens, sum(s.score)::int as score
    from public.kr8_reel_scores(w0, w0 + interval '7 days', now(), false) s group by s.author
  ),
  ver as materialized (
    select distinct on (v.user_id) v.user_id, v.id, v.status, v.created_at, v.live_check ->> 'auto' as auto, v.reject_reason,
           case when v.selfie_deleted_at is null then v.selfie_path end as selfie_path
    from public.kr8_verifications v order by v.user_id, v.created_at desc
  ),
  ppl as (
    select a.user_id, a.kind, m.member_no, coalesce(m.first_name, '') as first_name, m.who, m.area, coalesce(m.created_at, a.auth_at) as joined_at,
           m.last_active_at, nullif(m.ref_code, '') as ref_code, nullif(m.src_code, '') as src_code, coalesce(m.verified, false) as verified,
           m.ig_handle, m.tiktok_handle, (m.photo is not null and m.photo <> '') as has_photo, m.photo_check,
           case when m.user_id is null and a.email is not null then left(split_part(a.email, '@', 1), 2) || '…@' || split_part(a.email, '@', 2) end as email_hint,
           exists (select 1 from public.kr8_line_links k where k.user_id = a.user_id) as line
    from shown a left join public.kr8_members m on m.user_id = a.user_id
  )
  select jsonb_build_object(
    'at', now(), 'day_start', d0, 'week_start', w0, 'include_test', p_include_test,
    'counts', (select jsonb_build_object(
        'real', count(*) filter (where kind = 'real'),
        'real_today', count(*) filter (where kind = 'real' and m.created_at >= d0),
        'test', count(*) filter (where kind = 'test'), 'team', count(*) filter (where kind = 'team'),
        'ghost', count(*) filter (where kind = 'ghost'), 'admin', count(*) filter (where kind = 'admin'),
        'nocard', count(*) filter (where kind = 'nocard'))
        from acc a left join public.kr8_members m on m.user_id = a.user_id),
    'people', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', p.user_id, 'kind', p.kind, 'no', p.member_no, 'name', p.first_name, 'who', p.who, 'area', p.area,
        'joined_at', p.joined_at, 'last_active_at', p.last_active_at, 'ref', p.ref_code, 'src', p.src_code, 'verified', p.verified,
        'ig', p.ig_handle, 'tt', p.tiktok_handle, 'has_photo', p.has_photo, 'photo_check', p.photo_check, 'email_hint', p.email_hint, 'line', p.line,
        'trust', case when p.kind in ('nocard', 'admin', 'team') then null else public.kr8_trust(p.user_id) end,
        'check', (select jsonb_build_object('id', v.id, 'status', v.status, 'at', v.created_at, 'auto', v.auto, 'reason', v.reject_reason, 'selfie_path', v.selfie_path) from ver v where v.user_id = p.user_id),
        'reels', (select jsonb_build_object(
                    'live', count(*) filter (where x.status = 'approved' and not x.hidden),
                    'waiting', count(*) filter (where x.status = 'pending' and not x.hidden),
                    'hidden', count(*) filter (where x.status = 'hidden' or x.hidden),
                    'board_off', count(*) filter (where x.board_off and x.status = 'approved' and not x.hidden),
                    'board_off_reason', max(x.board_off_reason))
                  from public.kr8_posts x where x.author = p.user_id and x.kind = 'reel'),
        'claims', (select jsonb_build_object('n', count(*), 'paid', count(*) filter (where c.status = 'assigned'),
                    'held', count(*) filter (where c.held and c.status = 'pending'), 'thb', coalesce(sum(c.amount_thb) filter (where c.status = 'assigned'), 0),
                    'first_at', min(c.created_at))
                   from cl c where c.member_id = p.user_id),
        'links', coalesce((select jsonb_agg(jsonb_build_object('user_id', o.user_id, 'no', om.member_no, 'name', om.first_name, 'reason', l.reason,
                    'dist', (l.detail ->> 'dist')::real, 'sface_sim', (l.detail ->> 'sface_sim')::real, 'at', l.first_at) order by l.first_at)
                  from lk l cross join lateral (select case when l.a = p.user_id then l.b else l.a end as user_id) o
                  left join public.kr8_members om on om.user_id = o.user_id
                  where p.user_id in (l.a, l.b)), '[]'::jsonb),
        'shared_net', (select count(distinct c2.member_id) from cl c1 join cl c2 on c2.member_id <> c1.member_id
                        and ((c1.ip_hash is not null and c1.ip_hash = c2.ip_hash) or (c1.device is not null and c1.device = c2.device))
                       where c1.member_id = p.user_id),
        'refs', (select count(*) from public.kr8_members r where p.member_no is not null and lower(coalesce(r.ref_code, '')) ~ ('^k0*' || p.member_no || '$')),
        'board', (select jsonb_build_object('rank', b.rk, 'rings', b.rings) from board b where b.member_id = p.user_id),
        'score', (select jsonb_build_object('likes', s.likes, 'saves', s.saves, 'opens', s.opens, 'score', s.score) from sc s where s.author = p.user_id)
      ) order by p.joined_at desc) from ppl p), '[]'::jsonb),
    'claims', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'user_id', c.member_id, 'no', coalesce(m.member_no, c.member_no_copy), 'name', m.first_name, 'brand', c.brand, 'amount', c.amount_thb,
        'status', c.status, 'held', c.held, 'used', c.used_at is not null, 'created_at', c.created_at, 'assigned_at', c.assigned_at, 'is_test', c.is_test,
        'hold_reason', c.hold_reason, 'decided', c.decided, 'decided_at', c.decided_at, 'face_dist', c.face_dist,
        'hold_others', c.hold_detail -> 'others', 'joined_at', m.created_at,
        'prize', (select jsonb_build_object('kind', z.kind, 'week', z.week, 'rank', z.rank) from public.kr8_prizes z where z.id = c.prize_id)
      ) order by c.created_at desc) from cl c left join public.kr8_members m on m.user_id = c.member_id), '[]'::jsonb),
    'codes', coalesce((select jsonb_agg(jsonb_build_object('brand', k.brand, 'amount', k.amount_thb, 'available', k.av, 'assigned', k.asg, 'used', k.used) order by k.brand, k.amount_thb desc)
        from (select brand, amount_thb, count(*) filter (where status = 'available')::int av, count(*) filter (where status = 'assigned')::int asg,
                     count(*) filter (where status not in ('available', 'assigned'))::int used
              from public.kr8_reward_codes where p_include_test or not is_test group by 1, 2) k), '[]'::jsonb),
    'board', jsonb_build_object('week_start', w0, 'paid_ranks', public.kr8_paid_ranks(), 'floor', public.kr8_rcfg('min_rings_for_paid_seat', 25),
        'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', b.rk, 'user_id', b.member_id, 'rings', b.rings, 'prize', public.kr8_prize_for(b.rk),
                     'likes', s.likes, 'saves', s.saves, 'opens', s.opens, 'is_new', m.created_at >= w0, 'no', m.member_no, 'name', m.first_name) order by b.rk)
                   from board b left join sc s on s.author = b.member_id left join public.kr8_members m on m.user_id = b.member_id where b.rk <= 20), '[]'::jsonb)),
    'pending', jsonb_build_object(
        'reels', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'user_id', x.author, 'at', x.created_at, 'poster_path', x.poster_path, 'video_path', x.video_path, 'body', left(x.body, 140)) order by x.created_at)
                   from public.kr8_posts x where x.kind = 'reel' and x.status = 'pending' and not x.hidden and x.author in (select user_id from shown)), '[]'::jsonb),
        'checks', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'user_id', v.user_id, 'at', v.created_at, 'auto', v.live_check ->> 'auto',
                     'review', v.live_check -> 'review', 'selfie_path', v.selfie_path) order by v.created_at)
                   from public.kr8_verifications v where v.status = 'pending' and v.user_id in (select user_id from shown)), '[]'::jsonb),
        'reports', (select count(*) from public.kr8_reports t where t.handled_at is null),
        'places', (select count(*) from public.kr8_places pl where pl.status = 'pending')),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object('kind', o.kind, 'subject', o.subject, 'at', o.created_at, 'sent', o.sent_at is not null, 'error', o.last_error) order by o.created_at desc)
        from (select * from public.kr8_outbox order by created_at desc limit 20) o), '[]'::jsonb),
    'dups_auto', public.kr8_admin_dups_auto(14)
  ) into r;
  return r;
end $$;
revoke all on function public.kr8_admin_v2_snapshot(boolean) from public, anon;
grant execute on function public.kr8_admin_v2_snapshot(boolean) to authenticated;

create or replace function public.kr8_admin_v2_member(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m public.kr8_members; w0 timestamptz := public.kr8_week_start(now()); r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  select * into m from public.kr8_members where user_id = p_user;
  select jsonb_build_object(
    'user_id', p_user, 'kind', public.kr8_admin_v2_kind(p_user),
    'trust', public.kr8_trust(p_user),
    'card', case when m.user_id is null then null else jsonb_build_object('no', m.member_no, 'name', m.first_name, 'photo', nullif(m.photo, ''), 'who', m.who,
            'area', m.area, 'bio', m.bio, 'langs', to_jsonb(m.langs), 'interests', to_jsonb(m.interests), 'gender', m.gender, 'show_gender', m.show_gender,
            'ig', m.ig_handle, 'tt', m.tiktok_handle, 'verified', m.verified, 'photo_check', m.photo_check, 'ref', m.ref_code, 'src', m.src_code,
            'joined_at', m.created_at, 'last_active_at', m.last_active_at, 'age_ok_at', m.age_ok_at, 'ghost', m.ghost) end,
    'email_hint', (select left(split_part(u.email, '@', 1), 2) || '…@' || split_part(u.email, '@', 2) from auth.users u where u.id = p_user),
    'signed_up_at', (select u.created_at from auth.users u where u.id = p_user),
    'last_sign_in_at', (select u.last_sign_in_at from auth.users u where u.id = p_user),
    'line', exists (select 1 from public.kr8_line_links k where k.user_id = p_user),
    'consents', jsonb_build_object('terms_version', m.terms_version, 'terms_at', m.terms_accepted_at, 'promo_ok', m.promo_ok, 'promo_at', m.promo_ok_at,
            'web_reels', m.web_reels, 'web_reels_at', m.web_reels_at,
            'log', coalesce((select jsonb_agg(jsonb_build_object('at', t.at, 'version', t.terms_version, 'kind', t.kind, 'promo', t.promo, 'source', t.source) order by t.at desc)
                    from public.kr8_terms_log t where t.user_id = p_user), '[]'::jsonb)),
    'reels', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'status', x.status, 'hidden', x.hidden, 'board_off', x.board_off, 'board_off_reason', x.board_off_reason,
            'likes', x.likes_count, 'saves', x.saves_count, 'shares', x.shares_count, 'views', x.views_count, 'at', x.created_at, 'poster_path', x.poster_path,
            'reviewed_at', x.reviewed_at, 'note', x.review_note) order by x.created_at desc)
            from public.kr8_posts x where x.author = p_user and x.kind = 'reel'), '[]'::jsonb),
    'rings_week', (select jsonb_build_object('likes', sum(s.l_local + s.l_trav), 'saves', sum(s.s_local + s.s_trav), 'opens', sum(s.opens), 'score', sum(s.score))
            from public.kr8_reel_scores(w0, w0 + interval '7 days', now(), false, p_user) s),
    'board', (select jsonb_build_object('rank', b.rk, 'rings', b.rings) from public.kr8_week_board(w0, false) b where b.member_id = p_user),
    'rings_ledger', coalesce((select jsonb_agg(jsonb_build_object('at', l.created_at, 'delta', l.delta, 'reason', l.reason) order by l.created_at desc)
            from (select * from public.kr8_rings_ledger where member_id = p_user order by created_at desc limit 40) l), '[]'::jsonb),
    'results', coalesce((select jsonb_agg(jsonb_build_object('week', w.week, 'rank', w.rank, 'rings', w.rings) order by w.week desc)
            from public.kr8_week_results w where w.member_id = p_user and not w.is_test), '[]'::jsonb),
    'claims', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'brand', c.brand, 'amount', c.amount_thb, 'status', c.status, 'held', c.held,
            'used', c.used_at is not null, 'created_at', c.created_at, 'assigned_at', c.assigned_at, 'hold_reason', h.reason, 'decided', h.decided,
            'decided_at', h.decided_at, 'decide_note', h.decide_note) order by c.created_at desc)
            from public.kr8_reward_claims c left join public.kr8_claim_holds h on h.claim_id = c.id where c.member_id = p_user), '[]'::jsonb),
    'referrals', coalesce((select jsonb_agg(jsonb_build_object('user_id', r2.user_id, 'no', r2.member_no, 'name', r2.first_name, 'joined_at', r2.created_at) order by r2.created_at desc)
            from public.kr8_members r2 where m.member_no is not null and lower(coalesce(r2.ref_code, '')) ~ ('^k0*' || m.member_no || '$')), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('user_id', o.uid, 'no', om.member_no, 'name', om.first_name, 'reason', l.reason, 'dist', (l.detail ->> 'dist')::real,
            'detail', l.detail, 'at', l.first_at, 'dismissed', l.dismissed_at is not null) order by l.first_at)
            from public.kr8_account_links l cross join lateral (select case when l.a = p_user then l.b else l.a end as uid) o
            left join public.kr8_members om on om.user_id = o.uid where p_user in (l.a, l.b)), '[]'::jsonb),
    'checks', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'status', v.status, 'auto', v.live_check ->> 'auto', 'reason', v.reject_reason,
            'at', v.created_at, 'reviewed_at', v.reviewed_at, 'by_admin', v.reviewed_by is not null) order by v.created_at desc)
            from public.kr8_verifications v where v.user_id = p_user), '[]'::jsonb),
    'admin_log', coalesce((select jsonb_agg(jsonb_build_object('at', g.at, 'action', g.action) order by g.at desc) from public.kr8_admin_actions_log g
            where g.detail::text ilike '%' || p_user::text || '%' or (m.member_no is not null and g.detail::text ~ ('#' || m.member_no || '([^0-9]|$)'))), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.kr8_admin_v2_member(uuid) from public, anon;
grant execute on function public.kr8_admin_v2_member(uuid) to authenticated;

create or replace function public.kr8_admin_v2_activity(p_limit integer default 150, p_include_test boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare n int := least(greatest(coalesce(p_limit, 150), 1), 500);
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return coalesce((select jsonb_agg(e order by (e ->> 'at') desc) from (
    select jsonb_build_object('at', x.at, 'kind', x.kind, 'auto', x.auto, 'user_id', x.uid, 'no', m.member_no, 'name', m.first_name, 'text', x.txt, 'other_no', x.other_no) e
    from (
      select m0.created_at at, 'signup' kind, true auto, m0.user_id uid, coalesce('via ' || nullif(m0.ref_code, ''), 'no referrer') txt, null::int other_no from public.kr8_members m0
      union all select p.created_at, 'reel', true, p.author, 'posted a Reel', null from public.kr8_posts p where p.kind = 'reel'
      union all select p.reviewed_at, 'reel_review', p.reviewed_by is not null, p.author, 'Reel ' || case when p.hidden or p.status = 'hidden' then 'hidden' else p.status end
                  || coalesce(' · ' || nullif(p.review_note, ''), ''), null from public.kr8_posts p where p.kind = 'reel' and p.reviewed_at is not null
      union all select v.created_at, 'check', true, v.user_id, 'face check sent' || coalesce(' · auto ' || (v.live_check ->> 'auto'), ''), null from public.kr8_verifications v
      union all select v.reviewed_at, 'check_done', v.reviewed_by is null, v.user_id, 'face check ' || v.status || coalesce(' · ' || left(split_part(v.reject_reason, E'\n', 1), 60), ''), null
                  from public.kr8_verifications v where v.reviewed_at is not null
      union all select c.created_at, 'claim', true, c.member_id, '฿' || c.amount_thb || ' ' || c.brand || ' claim · ' || case when c.held and c.status = 'pending' then 'held' else c.status end, null
                  from public.kr8_reward_claims c where p_include_test or not c.is_test
      union all select h.decided_at, 'hold_decided', false, c.member_id, 'held claim ' || coalesce(h.decided, 'decided'), null
                  from public.kr8_claim_holds h join public.kr8_reward_claims c on c.id = h.claim_id where h.decided_at is not null
      union all select l.first_at, 'link', true, l.a, 'looks like / linked to (' || l.reason || ')', (select member_no from public.kr8_members where user_id = l.b) from public.kr8_account_links l
      union all select l.dismissed_at, 'link_dismissed', false, l.a, 'marked "different people"', (select member_no from public.kr8_members where user_id = l.b) from public.kr8_account_links l where l.dismissed_at is not null
      union all select g.at,
                  case when g.action like 'place\_%' then 'place'
                       when g.action in ('dup_auto_ghost', 'dup_auto_undo') then 'trust'
                       else 'admin' end,
                  (g.action like 'place\_auto\_%' or g.action like 'place\_geo\_%' or g.action = 'dup_auto_ghost'),
                  case when g.action in ('dup_auto_ghost', 'dup_auto_undo') then nullif(g.detail ->> 'dup', '')::uuid else null end,
                  case when g.action = 'dup_auto_ghost' then 'duplicate robot ghosted account (kept #' || coalesce(g.detail ->> 'keep_no', '?') || ')'
                       when g.action = 'dup_auto_undo' then 'undid duplicate robot ghost'
                       else replace(g.action, '_', ' ') || case when g.action like 'place\_%' then coalesce(' · ' || left(g.detail ->> 'name', 60), '') || coalesce(' (' || (g.detail ->> 'reason') || ')', '') else '' end end,
                  case when g.action in ('dup_auto_ghost', 'dup_auto_undo') then nullif(g.detail ->> 'keep_no', '')::int else null end
                from public.kr8_admin_actions_log g
    ) x left join public.kr8_members m on m.user_id = x.uid
    where x.at is not null and (p_include_test or x.uid is null or public.kr8_admin_v2_kind(x.uid) in ('real', 'nocard', 'ghost'))
    order by x.at desc limit n) z), '[]'::jsonb);
end $$;
revoke all on function public.kr8_admin_v2_activity(integer, boolean) from public, anon;
grant execute on function public.kr8_admin_v2_activity(integer, boolean) to authenticated;

-- Sweep of PAST data (same-face blocks >= 0.60 to an older account, same claim phone). Re-runnable.
-- dup_sweep_on = 0 (default): DRY RUN — nobody is hidden; "would hide" rows show under "Handled automatically: preview".
-- dup_sweep_on = 1: hides them for real (each one undoable). To switch on:
--   update public.kr8_rings_config set value = 1 where key = 'dup_sweep_on'; select public.kr8_dup_robot_sweep();
create or replace function public.kr8_dup_robot_sweep()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n int := 0; dry boolean := public.kr8_rcfg('dup_sweep_on', 0) <> 1;
begin
  if public.kr8_rcfg('dup_robot_on', 1) <> 1 then return 0; end if;
  -- a fresh preview each run; once it runs for real the preview list is no longer needed
  delete from public.kr8_admin_actions_log where action = 'dup_auto_preview';
  for r in
    select distinct d.dup_user as keep_id, d.user_id as dup_id, d.dup_sim
    from public.kr8_face_decisions d
    join auth.users u_keep on u_keep.id = d.dup_user
    join auth.users u_dup on u_dup.id = d.user_id
    where d.decision = 'block' and d.dup_user is not null and d.dup_sim >= 0.60 and u_keep.created_at < u_dup.created_at
  loop
    if public.kr8_dup_robot_ghost(r.keep_id, r.dup_id, 'same_face', r.dup_sim, dry) then n := n + 1; end if;
  end loop;
  for r in
    select distinct c1.member_id as a_id, c2.member_id as b_id
    from public.kr8_reward_claims c1
    join public.kr8_reward_claims c2 on c2.device = c1.device and c2.member_id <> c1.member_id
    where c1.device is not null and not c1.is_test and not c2.is_test
      and c1.status <> 'cancelled' and c2.status <> 'cancelled'
  loop
    if public.kr8_dup_robot_ghost(r.a_id, r.b_id, 'same_device', null, dry) then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.kr8_dup_robot_sweep() from public, anon, authenticated;

select public.kr8_dup_robot_sweep();

commit;
