-- 0111_kr8_face_later.sql  (18 Nov 2026) · "Do it later": the face check is needed ONLY to claim a prize.
--
-- Why (founder, 18 Nov): 21 real members made a card but only 7 passed the face check; Thai members find a face scan scary
-- (feels like a bank / government app). Decision:
--   1. The face check stays in sign-up (right after the card photo) but can be skipped ("Do it later" / "ไว้ทีหลัง").
--   2. Without it a member can do EVERYTHING else: be seen in People / Feed / board, post Reels, answer, say hi, chat.
--      → kr8_face_gate() (0093) now answers false unless the switch face_gate_on = 1. Its five insert triggers (posts, threads,
--        messages, answers, ask answers), the 0097 Kring Team exception and kr8_people() all call it, so they all open up with
--        no other change. Ghost / test / blocked / hidden members stay out exactly as before (those rules never used the gate).
--   3. A prize claim (kr8_claim_prize, body = 0075, the latest) now REQUIRES the face check: not verified and no check waiting
--      for the team → KR8_VERIFY_FIRST (the app opens the 5-second check; old builds already open it on that code). Switch:
--      claim_needs_verified (1 = on). Every other 0075 / 0066 guard is unchanged: 3-second claim face, trusted print distance,
--      replay copy, same face / same phone holds, one phone one account, LINE switch, week review.
--      Bug fix (Argon): since 0092 the app sends no claim photo, so 0075 held EVERY claim as 'no_photo'. 'no_photo' now counts
--      only when the switch claim_needs_photo = 1 (default 0, matching the 0092 phone-only decision).
--   4. Invite Rings (0109): +invite Rings for BOTH people now come when the invited friend's FIRST REEL IS APPROVED
--      (kr8_posts kind 'reel', status 'approved', not hidden: the same "Posted" rule as admin Recruiters, which freelancers are
--      paid on), not when the friend passes the face check. Daily cap (invite_day_cap), kill switch (invite = 0), once per pair,
--      no self-invite, no circle, no ghost / test, no same-face / same-phone accounts: all unchanged (kr8_invite_pair_ok).
--      Invite Rings already given under 0109 (friend verified) keep counting. New trigger on kr8_posts; the kr8_members trigger
--      now fires on a ref_code change only. One-time catch-up: friends who joined from 18 Nov (the invite launch) and already
--      have an approved Reel are credited now (same cap and checks).
--   Duplicate protection is untouched: dup robot, face vectors / prints, account links and claim holds work for everyone who
--   does verify. Nothing hides a member just for not being verified.
--
-- Function bodies are based on the LATEST migration that defines each one: kr8_face_gate 0093, kr8_claim_prize 0075,
-- kr8_invite_pair_ok / kr8_invite_try / kr8_invite_trg 0109. Nothing from 0109 board math or 0110 (view as member) is touched.
-- ADDITIVE + RE-RUNNABLE. No table, column or function is dropped.
-- ORDER: apply this first, then deploy the new app build. Both orders are safe: an OLD build still asks unverified members
--        for the check before posting (its own copy of the gate) until it reloads; at a claim it already opens the check on
--        KR8_VERIFY_FIRST. The NEW build on the OLD database would let members try to post and get the old "verify first" answer.
-- UNDO: supabase/undo/0111_kr8_face_later_UNDO.sql.  Quick switches without UNDO:
--   update kr8_rings_config set value = 1 where key = 'face_gate_on';          -- back to "face check required to be seen"
--   update kr8_rings_config set value = 0 where key = 'claim_needs_verified';  -- claims no longer require the check

begin;

insert into public.kr8_rings_config (key, value, note) values
  ('face_gate_on', 0, '1 = 0093 rule: unverified new members are hidden from People and cannot post / chat; 0 = face check only for prize claims (0111)'),
  ('claim_needs_verified', 1, '1 = a prize claim needs a passed face check (or one waiting for the team), else KR8_VERIFY_FIRST (0111)'),
  ('claim_needs_photo', 0, '1 = a claim with no claim photo is held as no_photo (0075); 0 = the face code is enough (0092 phone-only, 0111)')
on conflict (key) do nothing;

-- ───────────── 1. face gate (0093 body, behind the switch) ─────────────
create or replace function public.kr8_face_gate(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.kr8_rcfg('face_gate_on', 0) = 1
     and exists (select 1 from public.kr8_members m
                  where m.user_id = p_user and not m.verified and not m.ghost
                    and coalesce(m.member_no, 0) > public.kr8_rcfg('face_gate_after_no', 68))
$$;
revoke all on function public.kr8_face_gate(uuid) from public;
grant execute on function public.kr8_face_gate(uuid) to authenticated;

-- ───────────── 2. prize claim (0075 body + 0111 face-check requirement + no_photo switch) ─────────────
create or replace function public.kr8_claim_prize(p_prize uuid, p_brand text, p_device text default null, p_face real[] default null, p_selfie text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); pz public.kr8_prizes; c public.kr8_reward_codes; cl public.kr8_reward_claims; cid uuid := gen_random_uuid();
        dev text := nullif(left(btrim(coalesce(p_device, '')), 64), ''); held boolean := false;
        ip text := public.kr8_caller_ip_hash(); unk text := encode(extensions.digest('kr8-ip-salt|unknown', 'sha256'), 'hex');
        face_ok boolean := public.kr8_face_ok(p_face); self_d float8; why text; others jsonb; flags jsonb; mismatch boolean := false;
        -- 0075
        review_on boolean := public.kr8_rcfg('claim_face_review', 1) = 1; photo text; trust_d float8; review text[] := '{}';
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if p_brand is null or not (p_brand in ('grab', 'truemoney') or (p_brand = 'shopeepay' and public.kr8_rcfg('shopeepay_on', 0) = 1)) then raise exception 'KR8_BAD_REWARD'; end if;
  perform pg_advisory_xact_lock(hashtext('kr8_rings:' || uid::text));
  select * into pz from public.kr8_prizes where id = p_prize and member_id = uid for update;
  if pz.id is null or pz.status = 'cancelled' then raise exception 'KR8_NO_PRIZE'; end if;
  if pz.status = 'claimed' then      -- tapped twice: same answer, nothing new
    select * into cl from public.kr8_reward_claims where id = pz.claim_id;
    select * into c from public.kr8_reward_codes where id = cl.code_id;
    return jsonb_build_object('status', cl.status, 'claim_id', cl.id, 'brand', cl.brand, 'amount', cl.amount_thb, 'again', true,
      'value', coalesce(cl.value_thb, public.kr8_reward_value(cl.brand, cl.amount_thb)), 'code', c.code, 'activation_url', c.activation_url);
  end if;
  -- F: a weekly prize opens after the founder's check (Approve week) or weekly_review_hours after the close
  if pz.kind = 'weekly' and now() < public.kr8_week_open_at(pz.week, pz.is_test) then raise exception 'KR8_WEEK_REVIEW'; end if;
  -- C: LINE linked (switch, off by default)
  if public.kr8_rcfg('claim_needs_line', 0) = 1 and not exists (select 1 from public.kr8_line_links where user_id = uid) then raise exception 'KR8_NEED_LINE'; end if;
  -- 0111 (founder 18 Nov): the face check is required ONLY to claim a prize. Verified, or a check already waiting for the team
  -- (that claim is then held as before). Anyone else is sent to the 5-second check first; the prize stays 'won', nothing is stored.
  if public.kr8_rcfg('claim_needs_verified', 1) = 1
     and not exists (select 1 from public.kr8_members where user_id = uid and coalesce(verified, false))
     and not exists (select 1 from public.kr8_verifications where user_id = uid and status = 'pending') then
    raise exception 'KR8_VERIFY_FIRST';
  end if;
  if dev is null then raise exception 'KR8_DEVICE'; end if;   -- the app always sends one; a script that leaves it out is refused
  -- one person, one account: a phone that claimed for another account in the last 30 days can't claim again
  if exists (select 1 from public.kr8_reward_claims where device = dev and member_id <> uid and created_at > now() - interval '30 days') then
    raise exception 'KR8_ONE_ACCOUNT';
  end if;

  -- B: the 3-second face is needed (the app opens the check on this error; nothing is stored)
  if not face_ok and public.kr8_rcfg('claim_face_check', 1) = 1 then raise exception 'KR8_FACE_NEEDED'; end if;
  -- 0075: the TRUSTED reference = prints from the Get-verified check that the team approved (never prints written by claims)
  if face_ok then
    select min(public.kr8_face_dist(p_face, f.descriptor)) into trust_d
      from public.kr8_face_prints f join public.kr8_verifications v on v.id = f.verification_id
     where f.user_id = uid and f.source in ('verify', 'selfie', 'backfill-selfie') and v.user_id = uid and v.status = 'approved';
  end if;
  -- compared with the account's own earlier prints (kept for the 0066 flag + same-face links between accounts)
  if face_ok and (select count(*) from public.kr8_face_prints where user_id = uid and created_at > now() - interval '1 day') < 10 then
    select min(public.kr8_face_dist(p_face, f.descriptor)) into self_d from public.kr8_face_prints f where f.user_id = uid;
    insert into public.kr8_face_prints (user_id, descriptor, source) values (uid, p_face, 'claim');
    perform public.kr8_face_match_links(uid);
  end if;
  -- 0075: the photo frame from the check, and the review reasons
  if public.kr8_claim_photo_ok(uid, p_selfie) then photo := p_selfie; end if;
  if review_on and public.kr8_rcfg('claim_face_check', 1) = 1 then
    -- 0111: since 0092 the app never uploads a claim photo (PDPA: the face code is enough), so 'no_photo' held EVERY claim.
    -- It counts again only if the switch claim_needs_photo is set back to 1.
    if photo is null and public.kr8_rcfg('claim_needs_photo', 0) = 1 then review := array_append(review, 'no_photo'); end if;
    if trust_d is null then review := array_append(review, 'no_verified_print');
    elsif trust_d > public.kr8_rcfg('face_claim_ok', 450) / 1000.0 then review := array_append(review, 'face_far');
    elsif trust_d < public.kr8_rcfg('face_replay_min', 60) / 1000.0 then review := array_append(review, 'face_copy');
    end if;
  end if;
  -- E: device + network links from this claim (the row is not stored yet) and from what is already stored
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

  -- duplicate hold: LINKED (same face / same phone) to an account that already has a prize or a claim
  select jsonb_agg(jsonb_build_object('user_id', o.u, 'first_name', m.first_name, 'member_no', m.member_no, 'reasons', o.reasons,
                   'face_dist', o.face_dist) order by m.member_no)
    into others
    from (select case when l.a = uid then l.b else l.a end u, jsonb_agg(l.reason order by l.reason) reasons,
                 min((l.detail ->> 'dist')::float8) face_dist
          from public.kr8_account_links l where (l.a = uid or l.b = uid) and l.dismissed_at is null and l.reason in ('face', 'device') group by 1) o
    join public.kr8_members m on m.user_id = o.u
   where exists (select 1 from public.kr8_reward_claims x where x.member_id = o.u and x.status <> 'cancelled')
      or exists (select 1 from public.kr8_prizes x where x.member_id = o.u and x.status <> 'cancelled');
  held := others is not null or cardinality(review) > 0;
  -- flags only (paid normally): same network as another member's claim, or a face that doesn't match this account's own print
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
      order by added_at, id limit 1 for update skip locked;
  end if;
  if why is not null then   -- written before the claim row so the founder alert (AFTER INSERT on the claim) can read it
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
  if c.id is null then      -- held (duplicate / face review), or no code of that exact amount in stock: "your code is on the way"
    return jsonb_build_object('status', 'pending', 'claim_id', cid, 'brand', p_brand, 'amount', pz.amount_thb,
      'value', public.kr8_reward_value(p_brand, pz.amount_thb));
  end if;
  update public.kr8_reward_codes set status = 'assigned', assigned_to = uid, assigned_at = now(), claim_id = cid where id = c.id;
  return jsonb_build_object('status', 'assigned', 'claim_id', cid, 'brand', p_brand, 'amount', pz.amount_thb, 'value', public.kr8_reward_value(p_brand, pz.amount_thb),
                            'code', c.code, 'activation_url', c.activation_url);
end $$;
revoke all on function public.kr8_claim_prize(uuid, text, text, real[], text) from public, anon;
grant execute on function public.kr8_claim_prize(uuid, text, text, real[], text) to authenticated;

-- ───────────── 3. invites count on the friend's first approved Reel ─────────────
-- the friend has an approved, not hidden Reel (= admin Recruiters "Posted ≥1 approved", the freelancer pay rule)
create or replace function public.kr8_invite_first_reel(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.kr8_posts p
                  where p.author = p_user and p.kind = 'reel' and p.status = 'approved' and not coalesce(p.hidden, false))
$$;

-- 0109 body; the friend now qualifies by an approved Reel (or, for Rings already given under 0109, by the face check)
create or replace function public.kr8_invite_pair_ok(p_inviter uuid, p_friend uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_inviter is not null and p_friend is not null and p_inviter <> p_friend
     and exists (select 1 from public.kr8_members f where f.user_id = p_friend and not coalesce(f.ghost, false)
                   and (public.kr8_invite_first_reel(p_friend) or coalesce(f.verified, false)))      -- 0111
     and exists (select 1 from public.kr8_members i where i.user_id = p_inviter and not coalesce(i.ghost, false))
     and not public.kr8_is_test_member(p_inviter) and not public.kr8_is_test_member(p_friend)
     -- audit 18 Nov: no circle. Two brand-new members can't "invite" each other for a second pair of Rewards: when the inviter
     -- was themselves invited by this friend first, only the first direction counts.
     and not exists (select 1 from public.kr8_members i, public.kr8_members f
                     where i.user_id = p_inviter and f.user_id = p_friend and coalesce(i.ref_code, '') ~ '^k[0-9]{5,7}$'
                       and substring(i.ref_code from 2)::int = f.member_no
                       and coalesce(i.ref_set_at, i.created_at) <= coalesce(f.ref_set_at, f.created_at))
     and not exists (select 1 from public.kr8_account_links l
                     where l.dismissed_at is null and l.reason in ('face', 'face_maybe', 'device')
                       and (l.a = p_friend or l.b = p_friend or (l.a = least(p_inviter, p_friend) and l.b = greatest(p_inviter, p_friend))))
$$;

-- 0109 body; a NEW credit needs the friend's approved Reel (the face check no longer counts for new credits)
create or replace function public.kr8_invite_try(p_friend uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare f public.kr8_members; inv uuid; x int := public.kr8_rcfg('invite', 10); cap int := public.kr8_rcfg('invite_day_cap', 20); n int := 0;
begin
  if x <= 0 then return 0; end if;
  select * into f from public.kr8_members where user_id = p_friend;
  if f.user_id is null or not public.kr8_invite_first_reel(p_friend) or coalesce(f.ref_code, '') !~ '^k[0-9]{5,7}$' then return 0; end if;   -- 0111
  select user_id into inv from public.kr8_members where member_no = substring(f.ref_code from 2)::int;
  if not coalesce(public.kr8_invite_pair_ok(inv, p_friend), false) then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('kr8_invite:' || inv::text));
  if exists (select 1 from public.kr8_rings_ledger where member_id = inv and reason = 'invite' and ref_id = p_friend::text) then return 0; end if;
  if (select count(*) from public.kr8_rings_ledger where member_id = inv and reason = 'invite'
        and created_at >= public.kr8_bkk_day_start(now())) >= greatest(cap, 0) then return 0; end if;
  insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (inv, x, 'invite', p_friend::text) on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (p_friend, x, 'invite_welcome', inv::text) on conflict do nothing;
  end if;
  return case when n > 0 then x else 0 end;
end $$;

-- members: a ref code set later (kr8_set_ref) on a friend who already has an approved Reel still counts
create or replace function public.kr8_invite_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(new.ref_code, '') ~ '^k[0-9]{5,7}$' and (tg_op = 'INSERT' or old.ref_code is distinct from new.ref_code) then
    begin perform public.kr8_invite_try(new.user_id); exception when others then raise warning 'kr8_invite_trg: %', sqlerrm; end;
  end if;
  return new;
end $$;
drop trigger if exists kr8_invite_trg on public.kr8_members;
create trigger kr8_invite_trg after insert or update of ref_code on public.kr8_members
  for each row execute function public.kr8_invite_trg();

-- posts: the moment a Reel is approved (or un-hidden), try the invite credit for its author (never blocks the approval)
create or replace function public.kr8_invite_reel_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.kind = 'reel' and new.status = 'approved' and not coalesce(new.hidden, false)
     and (tg_op = 'INSERT' or old.status is distinct from new.status or old.hidden is distinct from new.hidden) then
    begin perform public.kr8_invite_try(new.author); exception when others then raise warning 'kr8_invite_reel_trg: %', sqlerrm; end;
  end if;
  return new;
end $$;
drop trigger if exists kr8_invite_reel_trg on public.kr8_posts;
create trigger kr8_invite_reel_trg after insert or update of status, hidden on public.kr8_posts
  for each row execute function public.kr8_invite_reel_trg();

revoke all on function public.kr8_invite_first_reel(uuid) from public, anon, authenticated;
revoke all on function public.kr8_invite_pair_ok(uuid, uuid) from public, anon, authenticated;
revoke all on function public.kr8_invite_try(uuid) from public, anon, authenticated;
revoke all on function public.kr8_invite_trg() from public, anon, authenticated;
revoke all on function public.kr8_invite_reel_trg() from public, anon, authenticated;

-- one-time catch-up: friends who joined with an invite link since the invite launch (18 Nov, Bangkok) and already have an
-- approved Reel. Same checks and daily cap as always; a pair already credited is skipped.
do $$
declare r record;
begin
  for r in select m.user_id from public.kr8_members m
            where coalesce(m.ref_code, '') ~ '^k[0-9]{5,7}$' and m.created_at >= timestamptz '2026-11-18 00:00+07'
              and public.kr8_invite_first_reel(m.user_id)
            order by m.created_at loop
    begin perform public.kr8_invite_try(r.user_id); exception when others then raise warning 'kr8 0111 catch-up: %', sqlerrm; end;
  end loop;
end $$;

commit;
