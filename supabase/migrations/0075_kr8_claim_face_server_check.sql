-- 0075 · Prize claims stop trusting the phone's face code on its own (Argon audit T-301, finding T301-001, P0, 17 Nov 2026).
--
-- THE HOLE (0066): kr8_claim_prize took the 128-number face code (p_face) that the PHONE computed, and
--   (a) a member with no face print yet: "this face becomes the print" and the claim was paid at once;
--   (b) the comparison was against ANY earlier print of the account, including prints written by earlier claims
--       (source 'claim'), which the same script controls.
--   So a script could POST any 128 numbers (Argon used a sine wave) and get a code with no camera and no alert.
--   The server cannot compute a face code itself (there is no face model in Postgres), so it can never fully trust p_face.
--
-- THE FIX (smallest safe one):
--   1. A claim now carries ONE photo frame from the 3-second check (p_selfie): the phone uploads it to the private
--      kr8-verify bucket (same folder rule as the Get-verified selfie: <user id>/<uuid>.jpg; members can't read it back,
--      only admins). The server checks the file really exists, belongs to this member, is fresh (15 min) and was not used
--      by another claim.
--   2. The face code is compared ONLY with the member's TRUSTED print: a print saved by the Get-verified check whose
--      verification the team APPROVED (kr8_face_prints.source in ('verify','selfie','backfill-selfie' from 0076) + kr8_verifications.status = 'approved').
--      Prints written by claims never count as the reference any more.
--   3. The claim is paid automatically only when ALL of these hold:
--        photo frame OK · a trusted print exists · distance between face_replay_min (0.06) and face_claim_ok (0.45).
--      Otherwise it is HELD for the founder (reason 'review', with the list of reasons), the code is NOT handed out, and the
--      founder gets the held-claim alert (email + push, "Prize claim held · face check"). Admin "Same person?" shows the
--      claim photo next to the verified selfie: Pay or Refuse, as for 0066 holds.
--      face_replay_min: a real new camera frame never gives (almost) the same 128 numbers as the stored print; a code
--      that is a near copy of the print is a replay, so it is held too.
--   4. Old app builds (no p_selfie) keep working: their claims are simply held for review, never refused.
--   Switch: claim_face_review (1 = on). 0 = back to 0066 behaviour (no hold for missing photo / print / distance).
--
-- What this does NOT do: prove the photo frame and the face code came from the same moment. A member who passed the team's
-- verification could still send made-up numbers close to their own print. That person is verified (the team saw their face)
-- and the claim photo is stored for a look later, so the duplicate-account abuse (a 2nd account claiming) is closed: the 2nd
-- account has no approved print → held.
--
-- ADDITIVE + RE-RUNNABLE. Replaces kr8_claim_prize(uuid,text,text,real[]) with a 5-argument one (new p_selfie has a default,
-- so old builds that send 4 named arguments still reach it; the 4-argument one is dropped so PostgREST never sees two).
-- Adds: column kr8_reward_claims.face_photo, reason 'review' on kr8_claim_holds, 3 config rows, kr8_admin_held_count().
-- kr8_claim_notify: same body as 0066 + push title for 'review' + claim photo path in the alert.
--
-- 17 Nov (founder): CLAIM PHOTOS ARE KEPT 30 DAYS FOR THE KRING TEAM'S CHECK, THEN DELETED.
--   Nightly pg_cron job 'kr8_claim_photo_cleanup' (20:17 UTC = 03:17 Bangkok) runs kr8_cleanup_kick(): claim photos older than
--   30 days are queued in kr8_storage_trash (kr8_reward_claims.face_photo_deleted_at is set) and the edge function kr8-cleanup
--   removes the files with the Storage API (Postgres may not delete Storage files itself). Fallback: the admin page's selfie
--   clean-up already removes every queued kr8-verify file (kr8_admin_verify_files_due includes kr8_storage_trash).
-- ORDER: apply BEFORE the new app build (the new app sends p_selfie; the old server would refuse an unknown argument).
-- UNDO: re-run kr8_claim_prize + kr8_claim_notify from 0066 (and drop function kr8_claim_prize(uuid,text,text,real[],text),
--       kr8_admin_held_count()); the column, config rows and the wider check constraint can stay.

begin;

insert into public.kr8_rings_config (key, value, note) values
  ('claim_face_review', 1, '1 = a claim is paid automatically only with a claim photo + an approved verified face print + a close face; else held for review (0075)'),
  ('face_claim_ok', 450, 'claim face code must be at most this far (thousandths) from the member''s approved verified print to be paid automatically (0075)'),
  ('face_replay_min', 60, 'a claim face code closer than this (thousandths) to the stored print is a copy, not a new camera frame: held (0075)')
on conflict (key) do nothing;

alter table public.kr8_reward_claims add column if not exists face_photo text;
create unique index if not exists kr8_reward_claims_face_photo on public.kr8_reward_claims (face_photo) where face_photo is not null;

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'kr8_claim_holds_reason' and pg_get_constraintdef(oid) not like '%review%') then
    alter table public.kr8_claim_holds drop constraint kr8_claim_holds_reason;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'kr8_claim_holds_reason') then
    alter table public.kr8_claim_holds add constraint kr8_claim_holds_reason check (reason in ('linked', 'flag', 'review'));
  end if;
end $$;

/** the claim photo frame: <uid>/<uuid>.jpg in kr8-verify, uploaded by this member in the last 15 minutes, not used by another claim */
create or replace function public.kr8_claim_photo_ok(p_uid uuid, p_path text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_uid is not null and p_path is not null
     and split_part(p_path, '/', 1) = p_uid::text and p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
     and exists (select 1 from storage.objects o where o.bucket_id = 'kr8-verify' and o.name = p_path
                   and (o.owner = p_uid or o.owner_id = p_uid::text) and o.created_at > now() - interval '15 minutes'
                   and coalesce((o.metadata ->> 'size')::bigint, 1) between 1 and 5000000)
     and not exists (select 1 from public.kr8_reward_claims c where c.face_photo = p_path)
     and not exists (select 1 from public.kr8_verifications v where v.selfie_path = p_path)
$$;
revoke all on function public.kr8_claim_photo_ok(uuid, text) from public, anon, authenticated;

drop function if exists public.kr8_claim_prize(uuid, text, text, real[]);
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
    if photo is null then review := array_append(review, 'no_photo'); end if;
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

/** admin To do: claims waiting for the founder (held), real members only */
create or replace function public.kr8_admin_held_count() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return (select jsonb_build_object('held', count(*), 'review', count(*) filter (where h.reason = 'review'),
                                    'linked', count(*) filter (where coalesce(h.reason, 'linked') = 'linked'), 'oldest', min(c.created_at))
            from public.kr8_reward_claims c left join public.kr8_claim_holds h on h.claim_id = c.id
           where c.held and c.status = 'pending' and not c.is_test);
end $$;
revoke all on function public.kr8_admin_held_count() from public, anon;
grant execute on function public.kr8_admin_held_count() to authenticated;

-- founder alert: body of 0066 + "face check" push title for reason 'review' + the claim photo path (the email function signs it)
create or replace function public.kr8_claim_notify() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare k text; pz public.kr8_prizes; h public.kr8_claim_holds; others jsonb; a record;
begin
  select * into pz from public.kr8_prizes where id = new.prize_id;
  select * into h from public.kr8_claim_holds where claim_id = new.id;
  if new.held then
    others := coalesce(h.detail -> 'others', (select jsonb_agg(jsonb_build_object('user_id', x.member_id, 'first_name', m.first_name, 'member_no', m.member_no,
                 'reasons', jsonb_build_array('network')))
               from (select distinct member_id from public.kr8_reward_claims where ip_hash = new.ip_hash and member_id <> new.member_id) x
               join public.kr8_members m on m.user_id = x.member_id));
    others := (select jsonb_agg(o || jsonb_build_object('selfie_path', (select v.selfie_path from public.kr8_verifications v
                 where v.user_id = (o ->> 'user_id')::uuid and v.selfie_path is not null and v.selfie_deleted_at is null order by v.created_at desc limit 1)))
               from jsonb_array_elements(coalesce(others, '[]'::jsonb)) o);
  end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'notify_hook_secret' limit 1;
  perform net.http_post(
    url := 'https://pedxoxpammnyfnizljyj.supabase.co/functions/v1/notify-reward',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', k),
    body := jsonb_build_object('type', 'INSERT', 'table', 'kr8_reward_claims',
      'record', jsonb_build_object('id', new.id, 'brand', new.brand, 'amount_thb', new.amount_thb, 'rings', new.rings, 'status', new.status,
                                   'is_test', new.is_test, 'created_at', new.created_at, 'held', new.held,
                                   'hold_reason', case when new.held then coalesce(h.reason, 'linked') end,
                                   'review', h.detail -> 'review', 'claim_photo', new.face_photo,
                                   'face_dist', h.face_dist, 'others', others,
                                   'flags', h.detail -> 'flags', 'face_mismatch', coalesce((h.detail ->> 'face_mismatch')::boolean, false),
                                   'selfie_path', (select v.selfie_path from public.kr8_verifications v where v.user_id = new.member_id and v.selfie_path is not null
                                                   and v.selfie_deleted_at is null order by v.created_at desc limit 1),
                                   'payout_pct', public.kr8_rcfg('truemoney_payout_pct', 100),
                                   'prize_kind', pz.kind, 'prize_week', pz.week, 'prize_rank', pz.rank, 'founding_no', pz.founding_no,
                                   'first_name', (select first_name from public.kr8_members where user_id = new.member_id),
                                   'member_no', (select member_no from public.kr8_members where user_id = new.member_id)),
      'stock', (select coalesce(jsonb_object_agg(brand || '_' || amount_thb, n), '{}'::jsonb) from (
                  select brand, amount_thb, count(*) n from public.kr8_reward_codes where status = 'available' and not is_test group by 1, 2) s)),
    timeout_milliseconds := 10000);
  if new.held and not new.is_test then
    for a in select u.id from auth.users u join public.kr8_admin_emails e on e.email = lower(u.email) loop
      perform public.kr8_push_queue('admin', a.id, false,
        case when h.reason = 'review' then 'Prize claim held · face check' else 'Prize claim held · same person?' end,
        left(format('%s #%s claimed ฿%s. %s Check before paying.', (select first_name from public.kr8_members where user_id = new.member_id),
          (select member_no from public.kr8_members where user_id = new.member_id), new.amount_thb,
          case when others is not null and jsonb_array_length(others) > 0 then format('Linked to %s #%s.', others -> 0 ->> 'first_name', others -> 0 ->> 'member_no')
               when h.reason = 'review' then 'Face check needs your eye (' || coalesce((select string_agg(x, ', ') from jsonb_array_elements_text(h.detail -> 'review') x), 'review') || ').'
               else 'Same person as another account?' end), 240),
        '/app/admin.html#dups', new.id, false);
    end loop;
  end if;
  return new;
exception when others then
  return new;   -- never block a claim
end $$;


-- ───────────── 17 Nov: claim photos kept 30 days, then deleted ─────────────
alter table public.kr8_reward_claims add column if not exists face_photo_deleted_at timestamptz;

/** claim photos older than 30 days → queued for removal (kr8-cleanup / admin page remove the files). Returns how many. */
create or replace function public.kr8_claim_photos_expire() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  insert into public.kr8_storage_trash (bucket, name, user_id)
  select 'kr8-verify', c.face_photo, c.member_id from public.kr8_reward_claims c
   where c.face_photo is not null and c.face_photo_deleted_at is null and c.created_at < now() - interval '30 days'
  on conflict (bucket, name) do nothing;
  update public.kr8_reward_claims set face_photo_deleted_at = now()
   where face_photo is not null and face_photo_deleted_at is null and created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;

/** for the kr8-cleanup edge function only (service key): queued kr8-verify files not removed yet */
create or replace function public.kr8_service_verify_trash() returns table (id uuid, name text)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.id, t.name from public.kr8_storage_trash t where t.bucket = 'kr8-verify' and t.removed_at is null order by t.queued_at limit 200
$$;
create or replace function public.kr8_service_verify_trash_done(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  update public.kr8_storage_trash set removed_at = now() where id = any (coalesce(p_ids, '{}')) and bucket = 'kr8-verify' and removed_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

/** the nightly job: queue what is due, then ask kr8-cleanup to remove the files. Never raises. */
create or replace function public.kr8_cleanup_kick() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int := 0; k text;
begin
  n := public.kr8_claim_photos_expire();
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

revoke all on function public.kr8_claim_photos_expire(), public.kr8_cleanup_kick() from public, anon, authenticated;
revoke all on function public.kr8_service_verify_trash(), public.kr8_service_verify_trash_done(uuid[]) from public, anon, authenticated;
grant execute on function public.kr8_service_verify_trash(), public.kr8_service_verify_trash_done(uuid[]) to service_role;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'kr8_claim_photo_cleanup';
    perform cron.schedule('kr8_claim_photo_cleanup', '17 20 * * *', 'select public.kr8_cleanup_kick()');
  end if;
end $$;

commit;
