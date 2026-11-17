-- UNDO for 0095 Autopilot Step 1. Re-runnable. Test copy: extensions.vector. Live copy: public.vector.
begin;

-- 1. robots off
update public.kr8_rings_config set value = 0 where key in ('dup_robot_on', 'dup_sweep_on');

-- 2. un-hide everyone the Duplicate Robot hid and has not been undone yet (restores this week's Reels + Rings, marks pair "different people")
do $$
declare g record; keep_id uuid; dup_id uuid;
begin
  if to_regclass('public.kr8_admin_actions_log') is null then return; end if;
  for g in
    select distinct on (detail ->> 'dup') detail, at from public.kr8_admin_actions_log
    where action = 'dup_auto_ghost' order by detail ->> 'dup', at desc
  loop
    dup_id := (g.detail ->> 'dup')::uuid; keep_id := nullif(g.detail ->> 'keep', '')::uuid;
    continue when exists (select 1 from public.kr8_admin_actions_log u where u.action = 'dup_auto_undo' and u.detail ->> 'dup' = dup_id::text and u.at > g.at);
    perform set_config('kr8.ghost_set', '1', true);
    update public.kr8_members set ghost = false where user_id = dup_id;
    perform set_config('kr8.ghost_set', '', true);
    update public.kr8_posts set board_off = false, board_off_reason = null
     where author = dup_id and board_off_reason = 'auto_dup'
       and id in (select (v #>> '{}')::uuid from jsonb_array_elements(coalesce(g.detail -> 'posts', '[]'::jsonb)) v);
    delete from public.kr8_rings_ledger where member_id = dup_id and reason = 'reel_removed' and ref_id = 'dup_auto:' || (g.detail ->> 'week');
    if keep_id is not null then
      update public.kr8_account_links set dismissed_at = now()
       where a = least(keep_id, dup_id) and b = greatest(keep_id, dup_id) and dismissed_at is null;
    end if;
    insert into public.kr8_admin_actions_log (action, detail) values ('dup_auto_undo', jsonb_build_object('dup', dup_id, 'keep', keep_id, 'by', 'undo_0095'));
  end loop;
end $$;
delete from public.kr8_admin_actions_log where action = 'dup_auto_preview';

-- 3. pre-0095 function bodies (copied from kring-test before 0095 was applied; same as 0074 / 0082 / 0086 / 0092)
CREATE OR REPLACE FUNCTION public.kr8_reel_scores(p_from timestamp with time zone, p_to timestamp with time zone, p_until timestamp with time zone, p_test boolean, p_author uuid DEFAULT NULL::uuid)
 RETURNS TABLE(post_id uuid, author uuid, posted_at timestamp with time zone, l_local integer, l_trav integer, s_local integer, s_trav integer, opens integer, score integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      and exists (select 1 from public.kr8_members am where am.user_id = p.author)
      and public.kr8_is_test_member(p.author) = p_test
      and not public.kr8_is_team(p.author)
  ),
  ppl as (   -- members whose likes and saves count
    select m.user_id, (m.who = 'traveller' and (m.verified or public.kr8_rcfg('traveller_mult_needs_verified', 1) = 0)) as trav
    from public.kr8_members m
    where coalesce(m.photo, '') <> '' and btrim(coalesce(m.first_name, '')) <> '' and public.kr8_is_test_member(m.user_id) = p_test and not public.kr8_is_team(m.user_id)
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
$function$;

CREATE OR REPLACE FUNCTION public.kr8_verify_instant(p_selfie_path text, p_consent_version text, p_check jsonb, p_emb real[] DEFAULT NULL::real[], p_card_emb real[] DEFAULT NULL::real[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.kr8_admin_v2_snapshot(p_include_test boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  d0 timestamptz := ((now() at time zone 'Asia/Kolkata')::date)::timestamp at time zone 'Asia/Kolkata';
  w0 timestamptz := public.kr8_week_start(now());
  r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  with acc as materialized (
    select u.id as user_id, public.kr8_admin_v2_kind(u.id) as kind, u.created_at as auth_at, u.email
    from auth.users u
    union all   -- a card whose sign-in is gone (deleted login) still shows
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
    select distinct on (v.user_id) v.user_id, v.id, v.status, v.created_at, v.live_check ->> 'auto' as auto, v.reject_reason
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
        'check', (select jsonb_build_object('id', v.id, 'status', v.status, 'at', v.created_at, 'auto', v.auto, 'reason', v.reject_reason) from ver v where v.user_id = p.user_id),
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
                    'dist', (l.detail ->> 'dist')::real, 'at', l.first_at) order by l.first_at)
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
        from (select * from public.kr8_outbox order by created_at desc limit 20) o), '[]'::jsonb)
  ) into r;
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.kr8_admin_v2_member(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare m public.kr8_members; w0 timestamptz := public.kr8_week_start(now()); r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  select * into m from public.kr8_members where user_id = p_user;
  select jsonb_build_object(
    'user_id', p_user, 'kind', public.kr8_admin_v2_kind(p_user),
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
end $function$;

CREATE OR REPLACE FUNCTION public.kr8_admin_v2_activity(p_limit integer DEFAULT 150, p_include_test boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      union all select g.at, case when g.action like 'place\_%' then 'place' else 'admin' end, g.action like 'place\_auto\_%' or g.action like 'place\_geo\_%', null,
                  replace(g.action, '_', ' ') || case when g.action like 'place\_%' then coalesce(' · ' || left(g.detail ->> 'name', 60), '') || coalesce(' (' || (g.detail ->> 'reason') || ')', '') else '' end, null
                  from public.kr8_admin_actions_log g
    ) x left join public.kr8_members m on m.user_id = x.uid
    where x.at is not null and (p_include_test or x.uid is null or public.kr8_admin_v2_kind(x.uid) in ('real', 'nocard'))
    order by x.at desc limit n) z), '[]'::jsonb);
end $function$;

revoke all on function public.kr8_reel_scores(timestamptz, timestamptz, timestamptz, boolean, uuid) from public, anon, authenticated;
revoke all on function public.kr8_verify_instant(text, text, jsonb, real[], real[]) from public, anon;
grant execute on function public.kr8_verify_instant(text, text, jsonb, real[], real[]) to authenticated;

-- 4. drop the 0095 pieces
drop trigger if exists kr8_dup_robot_claim on public.kr8_reward_claims;
drop function if exists public.kr8_dup_robot_claim_trg();
drop function if exists public.kr8_dup_robot_sweep();
drop function if exists public.kr8_admin_dup_auto_undo(uuid, text);
drop function if exists public.kr8_admin_dups_auto(integer);
drop function if exists public.kr8_dup_robot_ghost(uuid, uuid, text, numeric, boolean);
drop function if exists public.kr8_dup_robot_ghost(uuid, uuid, text, numeric);
drop function if exists public.kr8_board_ignored_rings(timestamptz, boolean, uuid);
drop function if exists public.kr8_liker_guard_ok(uuid);
drop function if exists public.kr8_trust(uuid);
drop function if exists public.kr8_is_admin_uid(uuid);
delete from public.kr8_rings_config where key in ('dup_robot_on', 'dup_sweep_on', 'rings_guard_on', 'rings_guard_min_trust');

commit;
