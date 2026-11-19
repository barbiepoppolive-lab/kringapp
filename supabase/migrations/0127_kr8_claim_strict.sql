CREATE OR REPLACE FUNCTION public.kr8_claim_prize(p_prize uuid, p_brand text, p_device text DEFAULT NULL::text, p_face real[] DEFAULT NULL::real[], p_selfie text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); pz public.kr8_prizes; c public.kr8_reward_codes; cl public.kr8_reward_claims; cid uuid := gen_random_uuid();
        dev text := nullif(left(btrim(coalesce(p_device, '')), 64), ''); held boolean := false;
        ip text := public.kr8_caller_ip_hash(); unk text := encode(extensions.digest('kr8-ip-salt|unknown', 'sha256'), 'hex');
        face_ok boolean := public.kr8_face_ok(p_face); self_d float8; why text; others jsonb; flags jsonb; mismatch boolean := false;
        review_on boolean := public.kr8_rcfg('claim_face_review', 1) = 1; photo text; trust_d float8; review text[] := '{}';
        has_sface_verified boolean := false;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if p_brand is null or not (p_brand in ('grab', 'truemoney') or (p_brand = 'shopeepay' and public.kr8_rcfg('shopeepay_on', 0) = 1)) then raise exception 'KR8_BAD_REWARD'; end if;
  perform pg_advisory_xact_lock(hashtext('kr8_rings:' || uid::text));
  select * into pz from public.kr8_prizes where id = p_prize and member_id = uid for update;
  if pz.id is null or pz.status = 'cancelled' then raise exception 'KR8_NO_PRIZE'; end if;
  if pz.status = 'claimed' then
    select * into cl from public.kr8_reward_claims where id = pz.claim_id;
    select * into c from public.kr8_reward_codes where id = cl.code_id;
    return jsonb_build_object('status', cl.status, 'claim_id', cl.id, 'brand', cl.brand, 'amount', cl.amount_thb, 'again', true,
      'value', coalesce(cl.value_thb, public.kr8_reward_value(cl.brand, cl.amount_thb)), 'code', c.code, 'activation_url', c.activation_url);
  end if;
  if pz.kind = 'weekly' and now() < public.kr8_week_open_at(pz.week, pz.is_test) then raise exception 'KR8_WEEK_REVIEW'; end if;
  if public.kr8_rcfg('claim_needs_line', 0) = 1 and not exists (select 1 from public.kr8_line_links where user_id = uid) then raise exception 'KR8_NEED_LINE'; end if;
  -- 19 Nov founder: a prize needs a PASSED face check (a check still with the team is not enough) and an approved Reel
  if public.kr8_rcfg('claim_needs_verified', 1) = 1
     and not exists (select 1 from public.kr8_members where user_id = uid and coalesce(verified, false)) then
    if exists (select 1 from public.kr8_verifications where user_id = uid and status = 'pending') then raise exception 'KR8_VERIFY_PENDING'; end if;
    raise exception 'KR8_VERIFY_FIRST';
  end if;
  if not exists (select 1 from public.kr8_posts where author = uid and kind = 'reel' and status = 'approved' and not hidden) then
    raise exception 'KR8_NEED_REEL';
  end if;
  if dev is null then raise exception 'KR8_DEVICE'; end if;
  if exists (select 1 from public.kr8_reward_claims where device = dev and member_id <> uid and created_at > now() - interval '30 days') then
    raise exception 'KR8_ONE_ACCOUNT';
  end if;

  -- T-398 [A-03]: accept synchronous SFace / founder-approved simple_check when background face-api print has not landed yet
  select exists (
    select 1 from public.kr8_members m
     where m.user_id = uid and coalesce(m.verified, false)
       and (
         (to_regclass('public.kr8_face_vectors') is not null and exists (
           select 1 from public.kr8_face_vectors fv where fv.user_id = uid and fv.source = 'check'
         ))
         or exists (
           select 1 from public.kr8_verifications v where v.user_id = uid and v.status = 'approved'
         )
       )
  ) into has_sface_verified;
  -- 19 Nov: a member already verified (approved face check) can claim without a second face scan
  if not face_ok and not has_sface_verified and public.kr8_rcfg('claim_face_check', 1) = 1 then raise exception 'KR8_FACE_NEEDED'; end if;
  if face_ok then
    select min(public.kr8_face_dist(p_face, f.descriptor)) into trust_d
      from public.kr8_face_prints f join public.kr8_verifications v on v.id = f.verification_id
     where f.user_id = uid and f.source in ('verify', 'selfie', 'backfill-selfie') and v.user_id = uid and v.status = 'approved';
  end if;


  if face_ok and (select count(*) from public.kr8_face_prints where user_id = uid and created_at > now() - interval '1 day') < 10 then
    select min(public.kr8_face_dist(p_face, f.descriptor)) into self_d from public.kr8_face_prints f where f.user_id = uid;
    insert into public.kr8_face_prints (user_id, descriptor, source) values (uid, p_face, 'claim');
    perform public.kr8_face_match_links(uid);
  end if;

  if public.kr8_claim_photo_ok(uid, p_selfie) then photo := p_selfie; end if;
  if review_on and public.kr8_rcfg('claim_face_check', 1) = 1 then
    if photo is null and public.kr8_rcfg('claim_needs_photo', 0) = 1 then review := array_append(review, 'no_photo'); end if;
    if trust_d is null and not has_sface_verified then review := array_append(review, 'no_verified_print');
    elsif trust_d is not null and trust_d > public.kr8_rcfg('face_claim_ok', 450) / 1000.0 then review := array_append(review, 'face_far');
    elsif trust_d is not null and trust_d < public.kr8_rcfg('face_replay_min', 60) / 1000.0 then review := array_append(review, 'face_copy');
    end if;
  end if;

  -- T-398 [A-03]: Wave safety switch — hold every real voucher claim so founder approves 100% of payouts by hand
  if not pz.is_test and public.kr8_rcfg('claim_always_hold', 1) = 1 then
    review := array_append(review, 'manual_wave_hold');
  end if;

  for others in select to_jsonb(x.member_id) from (
      select distinct member_id from public.kr8_reward_claims where member_id <> uid and device = dev) x loop
    perform public.kr8_link_add(uid, (others #>> '{}')::uuid, 'device', jsonb_build_object('where', 'claims'));
  end loop;
  if ip <> unk then
    for others in select to_jsonb(x.member_id) from (
        select distinct member_id from public.kr8_reward_claims where member_id <> uid and ip_hash = ip and created_at > now() - interval '30 days') x loop
      perform public.kr8_link_add(uid, (others #>> '{}')::uuid, 'network', jsonb_build_object('where', 'claims'));
    end loop;
  end if;
  perform public.kr8_refresh_links(uid);

  select jsonb_agg(jsonb_build_object('user_id', o.u, 'first_name', m.first_name, 'member_no', m.member_no, 'reasons', o.reasons,
                   'face_dist', o.face_dist) order by m.member_no)
    into others
    from (select case when l.a = uid then l.b else l.a end u, jsonb_agg(l.reason order by l.reason) reasons,
                 min((l.detail ->> 'dist')::float8) face_dist
          from public.kr8_account_links l where (l.a = uid or l.b = uid) and l.dismissed_at is null and l.reason in ('face', 'device') group by 1) o
    join public.kr8_members m on m.user_id = o.u
   where exists (select 1 from public.kr8_reward_claims x where x.member_id = o.u and x.status <> 'cancelled')
      or exists (select 1 from public.kr8_prizes x where x.member_id = o.u and x.status <> 'cancelled');
  if public.kr8_farm_prize_held(uid, pz.week, pz.kind) then review := array_append(review, 'ring_farming'); end if;   -- 0123: Hold prize (Ring-farming check)
  if public.kr8_fake_level(uid) = 'red' then review := array_append(review, 'fake_red'); end if;   /*fake0124*/
  held := others is not null or cardinality(review) > 0;

  select jsonb_agg(jsonb_build_object('user_id', o.u, 'first_name', m.first_name, 'member_no', m.member_no, 'reasons', o.reasons) order by m.member_no)
    into flags
    from (select case when l.a = uid then l.b else l.a end u, jsonb_agg(l.reason order by l.reason) reasons
          from public.kr8_account_links l where (l.a = uid or l.b = uid) and l.dismissed_at is null and l.reason in ('network', 'line') group by 1) o
    join public.kr8_members m on m.user_id = o.u;
  mismatch := face_ok and self_d is not null and self_d > public.kr8_rcfg('face_self_max', 600) / 1000.0;
  why := case when others is not null then 'linked' when cardinality(review) > 0 then 'review' when flags is not null or mismatch then 'flag' end;

  if not held then
    select * into c from public.kr8_reward_codes
      where brand = p_brand and amount_thb = pz.amount_thb and status = 'available' and is_test = pz.is_test
        and (expires_on is null or expires_on >= current_date)
      order by added_at, id limit 1 for update skip locked;
  end if;
  if why is not null then
    insert into public.kr8_claim_holds (claim_id, reason, detail, face_dist)
    values (cid, why, jsonb_build_object('others', coalesce(others, '[]'::jsonb), 'flags', coalesce(flags, '[]'::jsonb), 'face_mismatch', mismatch,
                                         'self_dist', round(self_d::numeric, 3), 'first_print', face_ok and self_d is null,
                                         'review', to_jsonb(review), 'verified_dist', round(trust_d::numeric, 3), 'claim_photo', photo),
            coalesce(trust_d, self_d));
  end if;
  insert into public.kr8_reward_claims (id, member_id, brand, amount_thb, rings, status, code_id, device, ip_hash, is_test, assigned_at, prize_id, held, face_photo)
  values (cid, uid, p_brand, pz.amount_thb, 0, case when c.id is null then 'pending' else 'assigned' end, c.id, dev, ip, pz.is_test,
          case when c.id is null then null else now() end, pz.id, held, photo);
  update public.kr8_prizes set status = 'claimed', claim_id = cid, claimed_at = now() where id = pz.id;
  if c.id is null then
    return jsonb_build_object('status', 'pending', 'claim_id', cid, 'brand', p_brand, 'amount', pz.amount_thb,
      'value', public.kr8_reward_value(p_brand, pz.amount_thb));
  end if;
  update public.kr8_reward_codes set status = 'assigned', assigned_to = uid, assigned_at = now(), claim_id = cid where id = c.id;
  return jsonb_build_object('status', 'assigned', 'claim_id', cid, 'brand', p_brand, 'amount', pz.amount_thb, 'value', public.kr8_reward_value(p_brand, pz.amount_thb),
                            'code', c.code, 'activation_url', c.activation_url);
end $function$
;
