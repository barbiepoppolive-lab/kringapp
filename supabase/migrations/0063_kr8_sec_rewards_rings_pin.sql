-- 0063 · SECURITY AUDIT 16 Nov (findings C1 part 2, H2, M2). WRITTEN, NOT APPLIED. FOUNDER DECISION NEEDED on the two numbers below.
-- Same function names, arguments and return types as before.
--   H2  likes / saves only count from cards older than liker_min_age_hours (default 72 h) or verified cards, and the 2x traveller
--       bonus only from verified cards (traveller_mult_needs_verified = 1). Both are rows in kr8_rings_config (0 / 0 = old rules).
--   H2  kr8_claim_prize: a claim with no device id is refused; a claim from the same network as another member's claim in the last
--       30 days is HELD (status pending, held = true, no code) for the founder: kr8_admin_release_claim(id) lets it through.
--   M2  café PIN: wrong guesses are counted per network (changing the device id no longer resets them), and a phone that has
--       entered the right PIN before keeps working while the café-wide lock is on (an outsider can no longer lock staff out).
--   C1  share-open farming is fixed in functions/r/[id].js (one counted open per network per Reel per day): see the report.
-- UNDO: re-run the bodies from 0047 / 0051 / 0035 (git show 088aa59:…); delete the two kr8_rings_config rows; drop kr8_staff_trusted.
begin;

insert into public.kr8_rings_config (key, value, note) values
  ('liker_min_age_hours', 72, 'FOUNDER DECISION (security 16 Nov): likes/saves count only from cards at least this many hours old, or verified (0 = any)'),
  ('traveller_mult_needs_verified', 1, 'FOUNDER DECISION (security 16 Nov): 1 = the traveller 2x counts only from verified cards')
on conflict (key) do nothing;

alter table public.kr8_reward_claims add column if not exists held boolean not null default false;

create table if not exists public.kr8_staff_trusted (
  venue_id text not null references public.kr8_venues(id) on delete cascade, device text not null, last_ok_at timestamptz not null default now(),
  primary key (venue_id, device));
alter table public.kr8_staff_trusted enable row level security;
revoke all on public.kr8_staff_trusted from public, anon, authenticated;

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
      and exists (select 1 from public.kr8_post_places pp where pp.post_id = p.id)
      and exists (select 1 from public.kr8_members am where am.user_id = p.author)
      and public.kr8_is_test_member(p.author) = p_test
  ),
  ppl as (   -- members whose likes and saves count
    select m.user_id, (m.who = 'traveller' and (m.verified or public.kr8_rcfg('traveller_mult_needs_verified', 1) = 0)) as trav
    from public.kr8_members m
    where coalesce(m.photo, '') <> '' and btrim(coalesce(m.first_name, '')) <> '' and public.kr8_is_test_member(m.user_id) = p_test
      and (m.verified or m.created_at < now() - make_interval(hours => public.kr8_rcfg('liker_min_age_hours', 72)))
  ),
  lk as (
    select r.id, count(*) filter (where not c.trav)::int a, count(*) filter (where c.trav)::int b
    from reels r join public.kr8_post_likes l on l.post_id = r.id and l.user_id <> r.author and l.created_at < p_until
    join ppl c on c.user_id = l.user_id group by r.id
  ),
  sv as (
    select r.id, count(*) filter (where not c.trav)::int a, count(*) filter (where c.trav)::int b
    from reels r join public.kr8_post_saves s on s.post_id = r.id and s.user_id <> r.author and s.created_at < p_until
    join ppl c on c.user_id = s.user_id group by r.id
  ),
  od as (
    select r.id, o.bkk_date, count(*)::int n
    from reels r join public.kr8_share_opens o on o.post_id = r.id and o.ok and o.created_at < p_until
    where o.opener is distinct from r.author
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

CREATE OR REPLACE FUNCTION public.kr8_claim_prize(p_prize uuid, p_brand text, p_device text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); pz public.kr8_prizes; c public.kr8_reward_codes; cl public.kr8_reward_claims; cid uuid := gen_random_uuid();
        dev text := nullif(left(btrim(coalesce(p_device, '')), 64), ''); held boolean := false;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if p_brand is null or not (p_brand in ('grab', 'truemoney') or (p_brand = 'shopeepay' and public.kr8_rcfg('shopeepay_on', 0) = 1)) then raise exception 'KR8_BAD_REWARD'; end if;
  perform pg_advisory_xact_lock(hashtext('kr8_rings:' || uid::text));
  select * into pz from public.kr8_prizes where id = p_prize and member_id = uid for update;
  if pz.id is null then raise exception 'KR8_NO_PRIZE'; end if;
  if pz.status = 'claimed' then      -- tapped twice: same answer, nothing new
    select * into cl from public.kr8_reward_claims where id = pz.claim_id;
    select * into c from public.kr8_reward_codes where id = cl.code_id;
    return jsonb_build_object('status', cl.status, 'claim_id', cl.id, 'brand', cl.brand, 'amount', cl.amount_thb, 'again', true,
      'value', coalesce(cl.value_thb, public.kr8_reward_value(cl.brand, cl.amount_thb)), 'code', c.code, 'activation_url', c.activation_url);
  end if;
  if dev is null then raise exception 'KR8_DEVICE'; end if;   -- the app always sends one; a script that leaves it out is refused
  -- one person, one account: a phone that claimed for another account in the last 30 days can't claim again
  if dev is not null and exists (select 1 from public.kr8_reward_claims where device = dev and member_id <> uid and created_at > now() - interval '30 days') then
    raise exception 'KR8_ONE_ACCOUNT';
  end if;
  select * into c from public.kr8_reward_codes
    where brand = p_brand and amount_thb = pz.amount_thb and status = 'available' and is_test = pz.is_test
    order by added_at, id limit 1 for update skip locked;
  -- same network as another claimer in 30 days (alt accounts): held for the founder, no code yet
  held := exists (select 1 from public.kr8_reward_claims x where x.ip_hash = public.kr8_caller_ip_hash() and x.member_id <> uid
                  and x.created_at > now() - interval '30 days' and public.kr8_caller_ip_hash() <> encode(extensions.digest('kr8-ip-salt|unknown', 'sha256'), 'hex'));
  if held then c := null; end if;
  insert into public.kr8_reward_claims (id, member_id, brand, amount_thb, rings, status, code_id, device, ip_hash, is_test, assigned_at, prize_id, held)
  values (cid, uid, p_brand, pz.amount_thb, 0, case when c.id is null then 'pending' else 'assigned' end, c.id, dev, public.kr8_caller_ip_hash(), pz.is_test,
          case when c.id is null then null else now() end, pz.id, held);
  update public.kr8_prizes set status = 'claimed', claim_id = cid, claimed_at = now() where id = pz.id;
  if c.id is null then      -- no code of that exact amount in stock: HELD; the founder is emailed; the code goes out by itself when stock is added
    return jsonb_build_object('status', 'pending', 'claim_id', cid, 'brand', p_brand, 'amount', pz.amount_thb,
      'value', public.kr8_reward_value(p_brand, pz.amount_thb));
  end if;
  update public.kr8_reward_codes set status = 'assigned', assigned_to = uid, assigned_at = now(), claim_id = cid where id = c.id;
  return jsonb_build_object('status', 'assigned', 'claim_id', cid, 'brand', p_brand, 'amount', pz.amount_thb, 'value', public.kr8_reward_value(p_brand, pz.amount_thb),
                            'code', c.code, 'activation_url', c.activation_url);
end $function$;

CREATE OR REPLACE FUNCTION public.kr8_fill_pending_claims()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare p record; c public.kr8_reward_codes; n int := 0;
begin
  for p in select * from public.kr8_reward_claims where status = 'pending' and not held order by created_at limit 500 for update skip locked loop
    c := null;
    select * into c from public.kr8_reward_codes where brand = p.brand and amount_thb = p.amount_thb and status = 'available' and is_test = p.is_test
      order by added_at, id limit 1 for update skip locked;
    if c.id is null then continue; end if;
    update public.kr8_reward_codes set status = 'assigned', assigned_to = p.member_id, assigned_at = now(), claim_id = p.id where id = c.id;
    update public.kr8_reward_claims set status = 'assigned', code_id = c.id, assigned_at = now() where id = p.id;
    n := n + 1;
  end loop;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.kr8_staff_redeem(p_venue text, p_pin text, p_code text DEFAULT NULL::text, p_device text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v public.kr8_venues; c public.kr8_claims; t public.kr8_treats; v_code text; v_dev text := left(nullif(btrim(coalesce(p_device, '')), ''), 80);
        v_key text; f public.kr8_pin_fails; v_recent int; v_first boolean; v_guests int; v_live boolean := false; v_trusted boolean := false;
begin
  select * into v from public.kr8_venues where id = lower(btrim(coalesce(p_venue, ''))) for update;
  if v.id is null or v.status <> 'live' then return jsonb_build_object('ok', false, 'error', 'NO_VENUE'); end if;
  v_key := md5(public.kr8_caller_ip_hash());   -- wrong guesses are counted per network, so changing the device id does not reset them
  v_trusted := v_dev is not null and exists (select 1 from public.kr8_staff_trusted s where s.venue_id = v.id and s.device = v_dev and s.last_ok_at > now() - interval '60 days');
  select * into f from public.kr8_pin_fails where venue_id = v.id and caller_key = v_key;

  -- café-wide stop (only after many wrong PINs from many phones) or this phone's own lock
  if v.pin_locked_until is not null and v.pin_locked_until > now() and not v_trusted then   -- the café's own phones keep working
    insert into public.kr8_redemption_log (venue_id, ok, reason, device) values (v.id, false, 'LOCKED', v_dev);
    return jsonb_build_object('ok', false, 'error', 'LOCKED', 'locked_until', v.pin_locked_until);
  end if;
  if f.locked_until is not null and f.locked_until > now() and not v_trusted then
    insert into public.kr8_redemption_log (venue_id, ok, reason, device) values (v.id, false, 'LOCKED', v_dev);
    return jsonb_build_object('ok', false, 'error', 'LOCKED', 'locked_until', f.locked_until);
  end if;

  if coalesce(p_pin, '') !~ '^[0-9]{6}$' or extensions.crypt(p_pin, v.pin_hash) <> v.pin_hash then
    insert into public.kr8_redemption_log (venue_id, ok, reason, device) values (v.id, false, 'PIN_WRONG', v_dev);
    insert into public.kr8_pin_fails as pf (venue_id, caller_key, fails, locked_until, updated_at)
    values (v.id, v_key, 1, null, now())
    on conflict (venue_id, caller_key) do update
      set fails = case when pf.locked_until is not null and pf.locked_until <= now() then 1 else least(pf.fails + 1, 5) end,
          locked_until = null, updated_at = now()
    returning * into f;
    select count(*) into v_recent from public.kr8_redemption_log
     where venue_id = v.id and reason = 'PIN_WRONG' and created_at > now() - interval '15 minutes';
    if v_recent >= 50 then
      update public.kr8_venues set pin_locked_until = now() + interval '15 minutes' where id = v.id;
    end if;
    if f.fails >= 5 then
      update public.kr8_pin_fails set fails = 0, locked_until = now() + interval '15 minutes' where venue_id = v.id and caller_key = v_key;
      return jsonb_build_object('ok', false, 'error', 'LOCKED', 'locked_until', now() + interval '15 minutes');
    end if;
    return jsonb_build_object('ok', false, 'error', 'PIN_WRONG', 'tries_left', 5 - f.fails);
  end if;
  if f.venue_id is not null then delete from public.kr8_pin_fails where venue_id = v.id and caller_key = v_key; end if;
  if v_dev is not null then
    insert into public.kr8_staff_trusted (venue_id, device, last_ok_at) values (v.id, v_dev, now())
    on conflict (venue_id, device) do update set last_ok_at = now();
  end if;

  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('ok', true, 'venue', jsonb_build_object('id', v.id, 'name', v.name, 'name_th', v.name_th));
  end if;

  v_code := upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
  if v_code ~ '^KR[0-9A-F]{8}$' then v_code := substr(v_code, 3); end if;
  v_code := 'KR-' || v_code;

  select * into c from public.kr8_claims where code = v_code for update;
  if c.id is null then
    insert into public.kr8_redemption_log (venue_id, ok, reason, code_tail, device) values (v.id, false, 'CODE_UNKNOWN', right(v_code, 4), v_dev);
    return jsonb_build_object('ok', false, 'error', 'CODE_UNKNOWN');
  end if;
  select * into t from public.kr8_treats where id = c.treat_id;
  if t.venue_id is distinct from v.id then
    insert into public.kr8_redemption_log (venue_id, claim_id, ok, reason, code_tail, device) values (v.id, c.id, false, 'CODE_OTHER_VENUE', right(v_code, 4), v_dev);
    return jsonb_build_object('ok', false, 'error', 'CODE_OTHER_VENUE');
  end if;
  if c.redeemed_at is not null then
    insert into public.kr8_redemption_log (venue_id, claim_id, ok, reason, code_tail, device) values (v.id, c.id, false, 'ALREADY_REDEEMED', right(v_code, 4), v_dev);
    return jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED', 'redeemed_at', c.redeemed_at);
  end if;
  if c.expires_at <= now() then
    insert into public.kr8_redemption_log (venue_id, claim_id, ok, reason, code_tail, device) values (v.id, c.id, false, 'EXPIRED', right(v_code, 4), v_dev);
    return jsonb_build_object('ok', false, 'error', 'EXPIRED');
  end if;

  update public.kr8_claims set redeemed_at = now(), redeemed_device = v_dev where id = c.id;
  v_first := v.first_redeemed_at is null;
  if v_first then update public.kr8_venues set first_redeemed_at = now() where id = v.id; end if;
  -- V-04: the venue counts as live (bonus trigger) on the 2nd different guest
  if v.live_confirmed_at is null then
    select count(distinct cl.user_id) into v_guests
    from public.kr8_claims cl join public.kr8_treats tr on tr.id = cl.treat_id
    where tr.venue_id = v.id and cl.redeemed_at is not null;
    if v_guests >= 2 then
      update public.kr8_venues set live_confirmed_at = now() where id = v.id;
      v_live := true;
    end if;
  end if;
  insert into public.kr8_redemption_log (venue_id, claim_id, ok, reason, code_tail, device) values (v.id, c.id, true, 'REDEEMED', right(v_code, 4), v_dev);
  return jsonb_build_object('ok', true, 'redeemed_at', now(), 'deal_en', t.deal_en, 'deal_th', t.deal_th, 'first_for_venue', v_first, 'venue_live_now', v_live);
end $function$;

create or replace function public.kr8_admin_release_claim(p_claim uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  update public.kr8_reward_claims set held = false where id = p_claim and held and status = 'pending';
  if not found then raise exception 'KR8_NO_CLAIM'; end if;
  perform public.kr8_fill_pending_claims();
  return (select jsonb_build_object('id', id, 'status', status) from public.kr8_reward_claims where id = p_claim);
end $$;
revoke all on function public.kr8_admin_release_claim(uuid) from public, anon;
grant execute on function public.kr8_admin_release_claim(uuid) to authenticated;

commit;
