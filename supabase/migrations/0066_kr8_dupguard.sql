-- 0066 · One person, one account (16 Nov 2026). Prize protection after member Joob's 2nd account (2nd phone, same Wi-Fi,
--        selfie on the same bed) liked + saved her 1st account's Reel and claimed a 2nd ฿100 Founding Local prize.
--
-- ADDITIVE + RE-RUNNABLE. Written, NOT applied. Nothing is dropped except the old 3-argument kr8_claim_prize, which is
-- replaced by a 4-argument one whose new argument has a default (old app builds that send 3 named arguments keep working).
--
-- What it adds
--   A. Face print: kr8_face_prints (admin-only, members can never read it). A 128-number face code from face-api's
--      face_recognition_model (the same model the phone already uses to compare the selfie with the profile photo).
--      Saved at the face check (kr8_save_face_print), at claim time, and from old selfies by the admin page
--      ("Compute face prints", kr8_admin_save_face_print). Every new print is compared with every other member's prints.
--      THRESHOLDS (euclidean distance between two 128-d face-api descriptors; 0 = identical photo):
--        face_same_max  = 500 (0.50): two accounts at or under this are linked as "same face" (admin checks by eye).
--                         face-api's own "same person" cut-off is 0.60; 0.50 is stricter so look-alike friends are rarely
--                         linked (this model puts different East/South-East Asian faces closer together than the
--                         0.6 default assumes), while the same face photographed twice is usually 0.25-0.45.
--        face_self_max  = 600 (0.60): the fresh claim-time face must be this close to the account's own print, else the
--                         claim is held. More lenient on purpose (different light / phone), so the real owner passes.
--      Both live in kr8_rings_config (thousandths) and can be tuned without a deploy.
--   B. Claim-time face check: kr8_claim_prize(p_prize, p_brand, p_device, p_face). No face, no print, or a face that
--      doesn't match the account's print → the claim is HELD (the member just sees "Your code is on the way").
--   E. Linked accounts: kr8_account_links (admin-only): same face / same device / same network (claims) / same LINE.
--      kr8_reel_scores ignores likes, saves and share-opens between linked accounts (silent; members are not told).
--      The admin can mark a pair "not the same person" (dismissed links count again).
--   Duplicate hold: a claim from an account linked to another account that already has a prize or claim is HELD.
--      Founder alert email (+ push) says why, with both selfies; admin Pay (kr8_admin_release_claim) / Refuse
--      (kr8_admin_refuse_claim). Hold reasons live in kr8_claim_holds (admin-only), never on the member's own claim row.
--   Admin "Same person?": kr8_admin_dup_overview (clusters are built in the admin page), kr8_admin_dup_resolve
--      (keep oldest · hide others · move Reels to oldest · not the same person).
--   C. claim_needs_line (default 0 = off): a claim needs a LINE link (kr8_line_links). Off until the founder turns it on.
--   F. Weekly prizes open for claiming only after "Approve week" (kr8_admin_approve_week) or weekly_review_hours (24)
--      after the week closed. kr8_admin_week_review shows the top 8 with flags.
--   Alert wording: kr8_claim_notify now sends held + reason + the other member + the TrueMoney payout % from the DB, so
--      the email no longer says "no code in stock" / "a ฿75 code" for a claim held by these rules.
--
-- UNDO (safe; the member app only reads kr8_my_rewards' extra fields when present):
--   put back kr8_claim_prize(uuid,text,text), kr8_my_rewards, kr8_reel_scores, kr8_close_week, kr8_claim_notify from 0063/0047;
--   drop function kr8_claim_prize(uuid,text,text,real[]); drop the kr8_face_* / kr8_*link* / kr8_admin_dup_* / week review functions;
--   drop table kr8_claim_holds, kr8_account_links, kr8_face_prints; delete from kr8_rings_config where key in
--   ('claim_needs_line','weekly_review_hours','face_same_max','face_self_max','claim_face_check').

-- ───────────── switches ─────────────
insert into public.kr8_rings_config (key, value, note) values
  ('claim_needs_line', 0, '1 = a prize claim needs LINE linked to the account (0066)'),
  ('weekly_review_hours', 24, 'weekly prizes open for claiming this many hours after the week closes, or when the founder presses Approve week (0066)'),
  ('face_same_max', 500, 'two accounts whose face prints are this close (thousandths of face-api distance) are linked as the same face (0066)'),
  ('face_self_max', 600, 'the claim-time face must be this close to the account''s own face print, else the claim is held (0066)'),
  ('claim_face_check', 1, '1 = the app asks for a 3-second face check before a claim (0066)')
on conflict (key) do nothing;

-- ───────────── tables (admin-only: RLS on, no policies, no grants) ─────────────
create table if not exists public.kr8_face_prints (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  descriptor real[] not null,
  source text not null,
  verification_id uuid,
  created_at timestamptz not null default now(),
  constraint kr8_face_prints_len check (array_length(descriptor, 1) = 128 and array_ndims(descriptor) = 1),
  constraint kr8_face_prints_source check (source in ('verify', 'selfie', 'claim'))
);
create index if not exists kr8_face_prints_user on public.kr8_face_prints (user_id, created_at desc);
create unique index if not exists kr8_face_prints_selfie_once on public.kr8_face_prints (verification_id) where source = 'selfie';
alter table public.kr8_face_prints enable row level security;
revoke all on public.kr8_face_prints from public, anon, authenticated;
revoke all on sequence public.kr8_face_prints_id_seq from public, anon, authenticated;

create table if not exists public.kr8_account_links (
  a uuid not null references auth.users(id) on delete cascade,
  b uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  detail jsonb not null default '{}'::jsonb,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  dismissed_at timestamptz,
  dismissed_by uuid,
  primary key (a, b, reason),
  constraint kr8_account_links_order check (a < b),
  constraint kr8_account_links_reason check (reason in ('face', 'device', 'network', 'line'))
);
create index if not exists kr8_account_links_b on public.kr8_account_links (b);
alter table public.kr8_account_links enable row level security;
revoke all on public.kr8_account_links from public, anon, authenticated;

create table if not exists public.kr8_claim_holds (
  claim_id uuid primary key references public.kr8_reward_claims(id) on delete cascade,
  reason text not null,
  detail jsonb not null default '{}'::jsonb,
  face_dist real,
  created_at timestamptz not null default now(),
  decided text,
  decided_at timestamptz,
  decided_by uuid,
  decide_note text,
  constraint kr8_claim_holds_reason check (reason in ('linked', 'face_mismatch', 'no_print', 'no_face')),
  constraint kr8_claim_holds_decided check (decided is null or decided in ('paid', 'refused', 'returned'))
);
alter table public.kr8_claim_holds enable row level security;
revoke all on public.kr8_claim_holds from public, anon, authenticated;

alter table public.kr8_verifications add column if not exists print_note text;
alter table public.kr8_week_closed add column if not exists approved_at timestamptz;
alter table public.kr8_week_closed add column if not exists approved_by uuid;
alter table public.kr8_prizes add column if not exists cancel_reason text;
alter table public.kr8_prizes add column if not exists cancelled_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'kr8_prizes_status_check' and pg_get_constraintdef(oid) like '%cancelled%') then
    alter table public.kr8_prizes drop constraint if exists kr8_prizes_status_check;
    alter table public.kr8_prizes add constraint kr8_prizes_status_check check (status in ('won', 'claimed', 'cancelled'));
  end if;
end $$;

-- ───────────── helpers ─────────────
create or replace function public.kr8_face_dist(x real[], y real[]) returns double precision
language sql immutable parallel safe set search_path = public, pg_temp as $$
  select sqrt(sum((u - v)::double precision * (u - v)::double precision)) from unnest(x, y) as t(u, v)
$$;

/** a valid face-api descriptor: 128 finite numbers in (-1, 1), not all zero */
create or replace function public.kr8_face_ok(d real[]) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select d is not null and array_ndims(d) = 1 and array_length(d, 1) = 128
     and not exists (select 1 from unnest(d) v where v is null or v = 'NaN'::real or v <= -1 or v >= 1)
     and exists (select 1 from unnest(d) v where v <> 0)
$$;

create or replace function public.kr8_linked(x uuid, y uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select x is not null and y is not null and x <> y and exists (
    select 1 from public.kr8_account_links l where l.a = least(x, y) and l.b = greatest(x, y) and l.dismissed_at is null)
$$;

create or replace function public.kr8_link_add(x uuid, y uuid, p_reason text, p_detail jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if x is null or y is null or x = y then return; end if;
  if not exists (select 1 from auth.users where id = x) or not exists (select 1 from auth.users where id = y) then return; end if;
  insert into public.kr8_account_links (a, b, reason, detail) values (least(x, y), greatest(x, y), p_reason, coalesce(p_detail, '{}'::jsonb))
  on conflict (a, b, reason) do update set last_at = now(),
    detail = case when p_reason = 'face' and (excluded.detail ->> 'dist')::float8 < coalesce((kr8_account_links.detail ->> 'dist')::float8, 9)
                  then excluded.detail else kr8_account_links.detail end;
end $$;

/** compare this member's prints with everyone else's; link the ones under face_same_max */
create or replace function public.kr8_face_match_links(p_user uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n int := 0; mx float8 := public.kr8_rcfg('face_same_max', 500) / 1000.0;
begin
  for r in
    select o.user_id, min(public.kr8_face_dist(m.descriptor, o.descriptor)) d
    from public.kr8_face_prints m join public.kr8_face_prints o on o.user_id <> m.user_id
    where m.user_id = p_user group by o.user_id
  loop
    if r.d <= mx then perform public.kr8_link_add(p_user, r.user_id, 'face', jsonb_build_object('dist', round(r.d::numeric, 3))); n := n + 1; end if;
  end loop;
  return n;
end $$;

/** device + network links from what is already stored (reward claims, share opens). p_user null = everyone. */
create or replace function public.kr8_refresh_links(p_user uuid default null) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n int := 0; unk text := encode(extensions.digest('kr8-ip-salt|unknown', 'sha256'), 'hex');
begin
  -- same phone (the app's own device id) on two accounts' claims
  for r in select distinct x.member_id u1, y.member_id u2, x.device from public.kr8_reward_claims x join public.kr8_reward_claims y
             on y.device = x.device and y.member_id <> x.member_id
           where x.device is not null and (p_user is null or x.member_id = p_user) loop
    perform public.kr8_link_add(r.u1, r.u2, 'device', jsonb_build_object('where', 'claims')); n := n + 1;
  end loop;
  -- same phone opening share links while signed in as two accounts
  for r in select distinct x.opener u1, y.opener u2 from public.kr8_share_opens x join public.kr8_share_opens y
             on y.device = x.device and y.opener <> x.opener
           where x.opener is not null and (p_user is null or x.opener = p_user) loop
    perform public.kr8_link_add(r.u1, r.u2, 'device', jsonb_build_object('where', 'share opens')); n := n + 1;
  end loop;
  -- same network on two accounts' claims within 30 days of each other
  for r in select distinct x.member_id u1, y.member_id u2 from public.kr8_reward_claims x join public.kr8_reward_claims y
             on y.ip_hash = x.ip_hash and y.member_id <> x.member_id and abs(extract(epoch from y.created_at - x.created_at)) < 30 * 86400
           where x.ip_hash is not null and x.ip_hash <> unk and (p_user is null or x.member_id = p_user) loop
    perform public.kr8_link_add(r.u1, r.u2, 'network', jsonb_build_object('where', 'claims')); n := n + 1;
  end loop;
  return n;
end $$;

/** when a weekly prize can be claimed: Approve week, or weekly_review_hours after the close, whichever comes first */
create or replace function public.kr8_week_open_at(p_week date, p_test boolean) returns timestamptz
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select least(coalesce(c.approved_at, 'infinity'::timestamptz), c.closed_at + make_interval(hours => public.kr8_rcfg('weekly_review_hours', 24)))
                   from public.kr8_week_closed c where c.week = p_week and c.is_test = p_test), now())
$$;

revoke all on function public.kr8_face_dist(real[], real[]), public.kr8_face_ok(real[]), public.kr8_linked(uuid, uuid),
  public.kr8_link_add(uuid, uuid, text, jsonb), public.kr8_face_match_links(uuid), public.kr8_refresh_links(uuid),
  public.kr8_week_open_at(date, boolean) from public, anon, authenticated;

-- ───────────── A. face prints ─────────────
/** the member's phone sends the face code right after the face check (consent face-2026-11-17). Returns nothing about matches. */
create or replace function public.kr8_save_face_print(p_desc real[]) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if not public.kr8_face_ok(p_desc) then raise exception 'KR8_BAD_FACE'; end if;
  -- only after a face check with the consent that mentions the face code
  if not exists (select 1 from public.kr8_verifications v where v.user_id = uid and v.created_at > now() - interval '1 hour'
                 and v.consent_version >= 'face-2026-11-17') then raise exception 'KR8_CONSENT_REQUIRED'; end if;
  if (select count(*) from public.kr8_face_prints where user_id = uid and created_at > now() - interval '1 day') >= 10 then raise exception 'KR8_SLOW_DOWN'; end if;
  insert into public.kr8_face_prints (user_id, descriptor, source, verification_id)
  values (uid, p_desc, 'verify', (select v.id from public.kr8_verifications v where v.user_id = uid order by v.created_at desc limit 1));
  perform public.kr8_face_match_links(uid);
  return true;
end $$;
revoke all on function public.kr8_save_face_print(real[]) from public, anon;
grant execute on function public.kr8_save_face_print(real[]) to authenticated;

/** admin page backfill: selfies still on file (approved or waiting) without a print from the selfie itself */
create or replace function public.kr8_admin_face_todo() returns table (id uuid, user_id uuid, first_name text, member_no int, status text, selfie_path text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return query
    select v.id, v.user_id, m.first_name, m.member_no, v.status, v.selfie_path, v.created_at
    from public.kr8_verifications v join public.kr8_members m on m.user_id = v.user_id
    where v.selfie_path is not null and v.selfie_deleted_at is null and v.status in ('approved', 'pending') and v.print_note is null
      and not exists (select 1 from public.kr8_face_prints f where f.verification_id = v.id and f.source = 'selfie')
    order by v.created_at asc limit 500;
end $$;
revoke all on function public.kr8_admin_face_todo() from public, anon;
grant execute on function public.kr8_admin_face_todo() to authenticated;

/** p_desc null = no clear face found in that selfie (noted, so it is not tried again) */
create or replace function public.kr8_admin_save_face_print(p_verification uuid, p_desc real[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.kr8_verifications; n int;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  select * into v from public.kr8_verifications where id = p_verification;
  if v.id is null then raise exception 'KR8_NO_VERIFICATION'; end if;
  if p_desc is null then
    update public.kr8_verifications set print_note = 'noface' where id = v.id;
    return jsonb_build_object('saved', false, 'links', 0);
  end if;
  if not public.kr8_face_ok(p_desc) then raise exception 'KR8_BAD_FACE'; end if;
  insert into public.kr8_face_prints (user_id, descriptor, source, verification_id) values (v.user_id, p_desc, 'selfie', v.id)
  on conflict (verification_id) where source = 'selfie' do update set descriptor = excluded.descriptor, created_at = now();
  n := public.kr8_face_match_links(v.user_id);
  return jsonb_build_object('saved', true, 'links', n);
end $$;
revoke all on function public.kr8_admin_save_face_print(uuid, real[]) from public, anon;
grant execute on function public.kr8_admin_save_face_print(uuid, real[]) to authenticated;

/** line-auth (service role only): the LINE account a member tried to link is already another Kring account */
create or replace function public.kr8_note_line_taken(p_user uuid, p_other uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.kr8_link_add(p_user, p_other, 'line', jsonb_build_object('where', 'LINE link'));
end $$;
revoke all on function public.kr8_note_line_taken(uuid, uuid) from public, anon, authenticated;
grant execute on function public.kr8_note_line_taken(uuid, uuid) to service_role;

-- ───────────── B + C + F + duplicate hold: the claim ─────────────
drop function if exists public.kr8_claim_prize(uuid, text, text);
create or replace function public.kr8_claim_prize(p_prize uuid, p_brand text, p_device text default null, p_face real[] default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); pz public.kr8_prizes; c public.kr8_reward_codes; cl public.kr8_reward_claims; cid uuid := gen_random_uuid();
        dev text := nullif(left(btrim(coalesce(p_device, '')), 64), ''); held boolean := false;
        ip text := public.kr8_caller_ip_hash(); unk text := encode(extensions.digest('kr8-ip-salt|unknown', 'sha256'), 'hex');
        face_ok boolean := public.kr8_face_ok(p_face); self_d float8; why text; others jsonb;
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

  -- B: the fresh face from the claim screen, compared with the account's own print (face check or selfie)
  if face_ok and (select count(*) from public.kr8_face_prints where user_id = uid and created_at > now() - interval '1 day') < 10 then
    select min(public.kr8_face_dist(p_face, f.descriptor)) into self_d from public.kr8_face_prints f where f.user_id = uid and f.source in ('verify', 'selfie');
    insert into public.kr8_face_prints (user_id, descriptor, source) values (uid, p_face, 'claim');
    perform public.kr8_face_match_links(uid);
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

  -- duplicate hold: linked to an account that already has a prize or a claim
  select jsonb_agg(jsonb_build_object('user_id', o.u, 'first_name', m.first_name, 'member_no', m.member_no, 'reasons', o.reasons,
                   'face_dist', o.face_dist) order by m.member_no)
    into others
    from (select case when l.a = uid then l.b else l.a end u, jsonb_agg(l.reason order by l.reason) reasons,
                 min((l.detail ->> 'dist')::float8) face_dist
          from public.kr8_account_links l where (l.a = uid or l.b = uid) and l.dismissed_at is null group by 1) o
    join public.kr8_members m on m.user_id = o.u
   where exists (select 1 from public.kr8_reward_claims x where x.member_id = o.u and x.status <> 'cancelled')
      or exists (select 1 from public.kr8_prizes x where x.member_id = o.u and x.status <> 'cancelled');
  why := case when others is not null then 'linked'
              when not face_ok and public.kr8_rcfg('claim_face_check', 1) = 1 then 'no_face'
              when face_ok and self_d is null then 'no_print'
              when face_ok and self_d > public.kr8_rcfg('face_self_max', 600) / 1000.0 then 'face_mismatch' end;
  held := why is not null;

  if not held then
    select * into c from public.kr8_reward_codes
      where brand = p_brand and amount_thb = pz.amount_thb and status = 'available' and is_test = pz.is_test
      order by added_at, id limit 1 for update skip locked;
  end if;
  insert into public.kr8_reward_claims (id, member_id, brand, amount_thb, rings, status, code_id, device, ip_hash, is_test, assigned_at, prize_id, held)
  values (cid, uid, p_brand, pz.amount_thb, 0, case when c.id is null then 'pending' else 'assigned' end, c.id, dev, ip, pz.is_test,
          case when c.id is null then null else now() end, pz.id, held);
  if held then
    insert into public.kr8_claim_holds (claim_id, reason, detail, face_dist)
    values (cid, why, jsonb_build_object('others', coalesce(others, '[]'::jsonb), 'self_dist', round(self_d::numeric, 3), 'face_sent', face_ok), self_d);
  end if;
  update public.kr8_prizes set status = 'claimed', claim_id = cid, claimed_at = now() where id = pz.id;
  if c.id is null then      -- held, or no code of that exact amount in stock: "your code is on the way"
    return jsonb_build_object('status', 'pending', 'claim_id', cid, 'brand', p_brand, 'amount', pz.amount_thb,
      'value', public.kr8_reward_value(p_brand, pz.amount_thb));
  end if;
  update public.kr8_reward_codes set status = 'assigned', assigned_to = uid, assigned_at = now(), claim_id = cid where id = c.id;
  return jsonb_build_object('status', 'assigned', 'claim_id', cid, 'brand', p_brand, 'amount', pz.amount_thb, 'value', public.kr8_reward_value(p_brand, pz.amount_thb),
                            'code', c.code, 'activation_url', c.activation_url);
end $$;
revoke all on function public.kr8_claim_prize(uuid, text, text, real[]) from public, anon;
grant execute on function public.kr8_claim_prize(uuid, text, text, real[]) to authenticated;

-- ───────────── Pay / Refuse ─────────────
create or replace function public.kr8_admin_release_claim(p_claim uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  update public.kr8_reward_claims set held = false where id = p_claim and held and status = 'pending';
  if not found then raise exception 'KR8_NO_CLAIM'; end if;
  update public.kr8_claim_holds set decided = 'paid', decided_at = now(), decided_by = auth.uid() where claim_id = p_claim;
  perform public.kr8_fill_pending_claims();
  return (select jsonb_build_object('id', id, 'status', status) from public.kr8_reward_claims where id = p_claim);
end $$;
revoke all on function public.kr8_admin_release_claim(uuid) from public, anon;
grant execute on function public.kr8_admin_release_claim(uuid) to authenticated;

/** Refuse a held (or waiting) claim. p_return = true: the prize goes back to "won" (the member can claim again later);
    false: the prize is cancelled with the reason (one person, one account). A code already handed out is never taken back here. */
create or replace function public.kr8_admin_refuse_claim(p_claim uuid, p_reason text, p_return boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare cl public.kr8_reward_claims; why text := left(btrim(coalesce(p_reason, '')), 200);
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if length(why) < 3 then raise exception 'KR8_REASON_REQUIRED'; end if;
  select * into cl from public.kr8_reward_claims where id = p_claim for update;
  if cl.id is null or cl.status <> 'pending' then raise exception 'KR8_NO_CLAIM'; end if;
  update public.kr8_reward_claims set status = 'cancelled', held = false where id = cl.id;
  insert into public.kr8_claim_holds (claim_id, reason, detail) values (cl.id, 'linked', '{}'::jsonb) on conflict (claim_id) do nothing;
  update public.kr8_claim_holds set decided = case when coalesce(p_return, false) then 'returned' else 'refused' end, decided_at = now(),
         decided_by = auth.uid(), decide_note = why where claim_id = cl.id;
  if cl.prize_id is not null then
    if coalesce(p_return, false) then
      update public.kr8_prizes set status = 'won', claim_id = null, claimed_at = null where id = cl.prize_id;
    else
      update public.kr8_prizes set status = 'cancelled', cancel_reason = why, cancelled_at = now() where id = cl.prize_id;
    end if;
  end if;
  return jsonb_build_object('id', cl.id, 'status', 'cancelled', 'prize', case when coalesce(p_return, false) then 'won' else 'cancelled' end);
end $$;
revoke all on function public.kr8_admin_refuse_claim(uuid, text, boolean) from public, anon;
grant execute on function public.kr8_admin_refuse_claim(uuid, text, boolean) to authenticated;

-- ───────────── admin "Same person?" ─────────────
create or replace function public.kr8_admin_dup_overview() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare ids uuid[];
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  perform public.kr8_refresh_links(null);
  select array_agg(distinct u) into ids from (
    select a u from public.kr8_account_links union select b from public.kr8_account_links
    union select c.member_id from public.kr8_reward_claims c where c.held and c.status = 'pending') z;
  ids := coalesce(ids, '{}');
  return jsonb_build_object(
    'links', coalesce((select jsonb_agg(jsonb_build_object('a', l.a, 'b', l.b, 'reason', l.reason, 'detail', l.detail, 'first_at', l.first_at,
                         'dismissed', l.dismissed_at is not null) order by l.first_at) from public.kr8_account_links l), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'member_no', m.member_no, 'first_name', m.first_name, 'photo', m.photo, 'joined_at', m.created_at,
        'verified', m.verified, 'ghost', m.ghost, 'is_test', public.kr8_is_test_member(m.user_id),
        'line', exists (select 1 from public.kr8_line_links k where k.user_id = m.user_id),
        'prints', (select count(*) from public.kr8_face_prints f where f.user_id = m.user_id),
        'selfie_path', (select v.selfie_path from public.kr8_verifications v where v.user_id = m.user_id and v.selfie_deleted_at is null and v.selfie_path is not null
                        order by (v.status = 'approved') desc, v.created_at desc limit 1),
        'reels', (select count(*) from public.kr8_posts p where p.author = m.user_id and p.kind = 'reel' and p.status = 'approved' and not p.hidden),
        'prizes', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'amount', p.amount_thb, 'status', p.status, 'week', p.week, 'rank', p.rank,
                     'founding_no', p.founding_no)) from public.kr8_prizes p where p.member_id = m.user_id), '[]'::jsonb)
      ) order by m.created_at) from public.kr8_members m where m.user_id = any (ids)), '[]'::jsonb),
    'held', coalesce((select jsonb_agg(jsonb_build_object('claim_id', c.id, 'user_id', c.member_id, 'brand', c.brand, 'amount', c.amount_thb, 'created_at', c.created_at,
                     'reason', coalesce(h.reason, 'linked'), 'detail', coalesce(h.detail, '{}'::jsonb), 'face_dist', h.face_dist,
                     'prize_kind', p.kind, 'founding_no', p.founding_no, 'week', p.week, 'rank', p.rank) order by c.created_at)
               from public.kr8_reward_claims c left join public.kr8_claim_holds h on h.claim_id = c.id left join public.kr8_prizes p on p.id = c.prize_id
               where c.held and c.status = 'pending'), '[]'::jsonb),
    -- likes / saves between linked accounts (the Rings they would have given; already not counted)
    'mutual', coalesce((select jsonb_agg(jsonb_build_object('from', x.u, 'to', x.author, 'likes', x.likes, 'saves', x.saves)) from (
        select l.u, p.author, count(*) filter (where l.k = 'like') likes, count(*) filter (where l.k = 'save') saves
        from (select user_id u, post_id, 'like' k from public.kr8_post_likes union all select user_id, post_id, 'save' from public.kr8_post_saves) l
        join public.kr8_posts p on p.id = l.post_id
        where l.u = any (ids) and p.author = any (ids) and l.u <> p.author and public.kr8_linked(l.u, p.author)
        group by 1, 2) x), '[]'::jsonb));
end $$;
revoke all on function public.kr8_admin_dup_overview() from public, anon;
grant execute on function public.kr8_admin_dup_overview() to authenticated;

/** p_action: 'not_same' (dismiss the links between them) · 'move_reels' (the others' Reels → p_keep) ·
    'hide' (others: ghost + Reels hidden + unclaimed prizes cancelled + waiting claims refused, reason "one person, one account") */
create or replace function public.kr8_admin_dup_resolve(p_keep uuid, p_others uuid[], p_action text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare o uuid; n int := 0; k int; cl record; why text := 'One person, one account: kept the oldest account';
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_keep is null or p_others is null or cardinality(p_others) = 0 or p_keep = any (p_others) then raise exception 'KR8_NO_PERSON'; end if;
  if not exists (select 1 from public.kr8_members where user_id = p_keep) then raise exception 'KR8_NO_PERSON'; end if;
  if p_action = 'not_same' then
    update public.kr8_account_links set dismissed_at = now(), dismissed_by = auth.uid()
     where dismissed_at is null and a = any (p_others || p_keep) and b = any (p_others || p_keep);
    get diagnostics n = row_count;
  elsif p_action = 'move_reels' then
    update public.kr8_posts set author = p_keep where author = any (p_others) and kind = 'reel';
    get diagnostics n = row_count;
  elsif p_action = 'hide' then
    foreach o in array p_others loop
      continue when not exists (select 1 from public.kr8_members where user_id = o);
      perform public.kr8_admin_set_ghost(true, o);
      update public.kr8_posts set hidden = true where author = o and not hidden;
      update public.kr8_prizes set status = 'cancelled', cancel_reason = why, cancelled_at = now() where member_id = o and status = 'won';
      for cl in select id from public.kr8_reward_claims where member_id = o and status = 'pending' loop
        perform public.kr8_admin_refuse_claim(cl.id, why, false);
      end loop;
      n := n + 1;
    end loop;
  else
    raise exception 'KR8_BAD_ACTION';
  end if;
  return jsonb_build_object('action', p_action, 'n', n);
end $$;
revoke all on function public.kr8_admin_dup_resolve(uuid, uuid[], text) from public, anon;
grant execute on function public.kr8_admin_dup_resolve(uuid, uuid[], text) to authenticated;

-- ───────────── F. weekly review ─────────────
create or replace function public.kr8_admin_week_review(p_week date default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare wk date;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  perform public.kr8_refresh_links(null);
  wk := coalesce(p_week, (select max(week) from public.kr8_week_closed where not is_test));
  if wk is null then return jsonb_build_object('week', null, 'rows', '[]'::jsonb); end if;
  return (select jsonb_build_object('week', wk, 'closed_at', c.closed_at, 'approved_at', c.approved_at, 'opens_at', public.kr8_week_open_at(wk, false),
    'weeks', (select jsonb_agg(jsonb_build_object('week', x.week, 'approved', x.approved_at is not null) order by x.week desc) from (
              select * from public.kr8_week_closed where not is_test order by week desc limit 6) x),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', r.rank, 'user_id', r.member_id, 'first_name', m.first_name, 'member_no', m.member_no,
              'photo', m.photo, 'rings', r.rings, 'joined_at', m.created_at, 'verified', m.verified, 'line', exists (select 1 from public.kr8_line_links k where k.user_id = r.member_id),
              'prints', (select count(*) from public.kr8_face_prints f where f.user_id = r.member_id and f.source in ('verify', 'selfie')),
              'prize', (select jsonb_build_object('id', p.id, 'amount', p.amount_thb, 'status', p.status) from public.kr8_prizes p
                        where p.member_id = r.member_id and p.kind = 'weekly' and p.week = wk and not p.is_test),
              'links', coalesce((select jsonb_agg(jsonb_build_object('other', case when l.a = r.member_id then l.b else l.a end, 'reason', l.reason,
                        'other_name', (select first_name from public.kr8_members where user_id = case when l.a = r.member_id then l.b else l.a end),
                        'other_no', (select member_no from public.kr8_members where user_id = case when l.a = r.member_id then l.b else l.a end)))
                        from public.kr8_account_links l where (l.a = r.member_id or l.b = r.member_id) and l.dismissed_at is null), '[]'::jsonb))
              order by r.rank) from public.kr8_week_results r join public.kr8_members m on m.user_id = r.member_id
              where r.week = wk and not r.is_test and r.rank <= greatest(public.kr8_paid_ranks(), 8)), '[]'::jsonb))
    from public.kr8_week_closed c where c.week = wk and not c.is_test);
end $$;
revoke all on function public.kr8_admin_week_review(date) from public, anon;
grant execute on function public.kr8_admin_week_review(date) to authenticated;

create or replace function public.kr8_admin_approve_week(p_week date) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  update public.kr8_week_closed set approved_at = coalesce(approved_at, now()), approved_by = coalesce(approved_by, auth.uid())
   where week = p_week and not is_test;
  if not found then raise exception 'KR8_WEEK_OPEN'; end if;
  return jsonb_build_object('week', p_week, 'opens_at', public.kr8_week_open_at(p_week, false));
end $$;
revoke all on function public.kr8_admin_approve_week(date) from public, anon;
grant execute on function public.kr8_admin_approve_week(date) to authenticated;

-- ───────────── team accounts (e.g. the live "Kring Team" card): never on boards, never a prize ─────────────
create table if not exists public.kr8_team_accounts (user_id uuid primary key references auth.users(id) on delete cascade, note text, added_at timestamptz not null default now());
alter table public.kr8_team_accounts enable row level security;
revoke all on public.kr8_team_accounts from public, anon, authenticated;
create or replace function public.kr8_is_team(p uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p is not null and exists (select 1 from public.kr8_team_accounts t where t.user_id = p)
$$;
revoke all on function public.kr8_is_team(uuid) from public, anon, authenticated;

-- ───────────── E. Rings ignore linked accounts (body of 0063 + "not linked" and "not team" lines) ─────────────
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
      and exists (select 1 from public.kr8_post_places pp where pp.post_id = p.id)
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
$$;
revoke all on function public.kr8_reel_scores(timestamptz, timestamptz, timestamptz, boolean, uuid) from public, anon, authenticated;

-- week close refreshes device / network links first, so the final board already leaves linked likes out (body of 0047 + 1 line)
create or replace function public.kr8_close_week(p_week date default null, p_test boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare w0 timestamptz; wk date; n_rank int := 0; n_prize int := 0; posters int; flr int := public.kr8_rcfg('min_rings_for_paid_seat', 25);
        first_run boolean := false;
begin
  w0 := case when p_week is null then public.kr8_week_start(now()) - interval '7 days' else (p_week::timestamp at time zone 'Asia/Bangkok') end;
  if extract(isodow from (w0 at time zone 'Asia/Bangkok')) <> 1 then raise exception 'KR8_NOT_MONDAY'; end if;
  if now() < w0 + interval '7 days' then raise exception 'KR8_WEEK_OPEN'; end if;
  wk := (w0 at time zone 'Asia/Bangkok')::date;
  perform pg_advisory_xact_lock(hashtext('kr8_close_week:' || wk::text || ':' || p_test::text));
  if not exists (select 1 from public.kr8_week_closed where week = wk and is_test = p_test) then
    first_run := true;
    perform public.kr8_refresh_links(null);
    posters := public.kr8_week_posters(w0, p_test);
    insert into public.kr8_week_closed (week, is_test, posters) values (wk, p_test, posters);
    insert into public.kr8_week_results (week, is_test, rank, member_id, rings, reels)
    select wk, p_test, b.rk, b.member_id, b.rings, b.reels
    from public.kr8_week_board(w0, p_test) b where b.rk <= greatest(public.kr8_rcfg('board_size', 10), public.kr8_paid_ranks());
    if posters >= public.kr8_rcfg('min_posters_for_payout', 0) then
      insert into public.kr8_prizes (member_id, kind, week, rank, amount_thb, rings, is_test)
      select r.member_id, 'weekly', wk, r.rank, public.kr8_prize_for(r.rank), r.rings, p_test
      from public.kr8_week_results r
      where r.week = wk and r.is_test = p_test and public.kr8_prize_for(r.rank) > 0 and r.rings >= flr
      on conflict do nothing;
      get diagnostics n_prize = row_count;
    end if;
  end if;
  select count(*) into n_rank from public.kr8_week_results where week = wk and is_test = p_test;
  return jsonb_build_object('week', wk, 'first_run', first_run, 'ranked', n_rank, 'prizes_created', n_prize,
    'posters', (select c.posters from public.kr8_week_closed c where c.week = wk and c.is_test = p_test),
    'prizes_total', (select count(*) from public.kr8_prizes where kind = 'weekly' and week = wk and is_test = p_test));
end $$;
revoke all on function public.kr8_close_week(date, boolean) from public, anon, authenticated;

-- ───────────── member rewards: + line_linked, claim_needs_line, claim_face_check, prize opens_at; cancelled prizes hidden ─────────────
create or replace function public.kr8_my_rewards() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); t boolean; mr record; w0 timestamptz := public.kr8_week_start(now()); d date := (now() at time zone 'Asia/Bangkok')::date; r jsonb;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  t := public.kr8_is_test_member(uid);
  select * into mr from public.kr8_member_rings(uid);
  select jsonb_build_object(
    'week', mr.week, 'rank', mr.week_rank, 'lifetime', mr.lifetime, 'level', public.kr8_rings_level(mr.lifetime),
    'gap', public.kr8_rank_gap(w0, t, uid), 'ends_at', w0 + interval '7 days',
    'member_no', (select member_no from public.kr8_members where user_id = uid),
    'founding_no', (select founding_no from public.kr8_prizes where member_id = uid and kind = 'founding' and status <> 'cancelled'),
    'founding_left', greatest(0, public.kr8_rcfg('founding_slots', 50) - (select count(*)::int from public.kr8_prizes where kind = 'founding' and is_test = t)),
    'floor', public.kr8_rcfg('min_rings_for_paid_seat', 25),
    'rules', public.kr8_rings_rules(),
    'ladder', (select jsonb_agg(public.kr8_prize_for(g) order by g) from generate_series(1, greatest(public.kr8_rcfg('board_size', 10), 3)) g),
    'streak', public.kr8_streak(uid),
    'checked_in_today', exists (select 1 from public.kr8_checkins where member_id = uid and day = d),
    'line_linked', exists (select 1 from public.kr8_line_links where user_id = uid),
    'claim_needs_line', public.kr8_rcfg('claim_needs_line', 0) = 1,
    'claim_face_check', public.kr8_rcfg('claim_face_check', 1) = 1,
    'prizes', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'week', p.week, 'rank', p.rank, 'founding_no', p.founding_no,
                 'amount', p.amount_thb, 'rings', p.rings, 'status', p.status, 'claim_id', p.claim_id, 'created_at', p.created_at,
                 'opens_at', case when p.kind = 'weekly' and p.status = 'won' and public.kr8_week_open_at(p.week, p.is_test) > now() then public.kr8_week_open_at(p.week, p.is_test) end)
                 order by (p.status = 'won') desc, p.created_at desc)
               from public.kr8_prizes p where p.member_id = uid and p.status <> 'cancelled'), '[]'::jsonb),
    'claims', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'brand', c.brand, 'amount', c.amount_thb, 'status', c.status,
                 'value', coalesce(c.value_thb, public.kr8_reward_value(c.brand, c.amount_thb)),
                 'code', k.code, 'activation_url', k.activation_url, 'used_at', c.used_at, 'created_at', c.created_at, 'assigned_at', c.assigned_at,
                 'kind', p.kind, 'week', p.week, 'rank', p.rank, 'founding_no', p.founding_no)
                 order by c.created_at desc)
               from public.kr8_reward_claims c left join public.kr8_reward_codes k on k.id = c.code_id and k.assigned_to = uid
               left join public.kr8_prizes p on p.id = c.prize_id
               where c.member_id = uid and c.status <> 'cancelled'), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.kr8_my_rewards() from public, anon;
grant execute on function public.kr8_my_rewards() to authenticated;

-- ───────────── founder alert: held + why + who, payout % from the DB, both selfies (the email function signs them) ─────────────
create or replace function public.kr8_claim_notify() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare k text; pz public.kr8_prizes; h public.kr8_claim_holds; others jsonb; a record;
begin
  select * into pz from public.kr8_prizes where id = new.prize_id;
  select * into h from public.kr8_claim_holds where claim_id = new.id;
  if new.held then
    -- the network rule of 0063 also holds without a kr8_claim_holds row (older rows): name the other claimer on the same network
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
                                   'face_dist', h.face_dist, 'others', others,
                                   'selfie_path', (select v.selfie_path from public.kr8_verifications v where v.user_id = new.member_id and v.selfie_path is not null
                                                   and v.selfie_deleted_at is null order by v.created_at desc limit 1),
                                   'payout_pct', public.kr8_rcfg('truemoney_payout_pct', 100),
                                   'prize_kind', pz.kind, 'prize_week', pz.week, 'prize_rank', pz.rank, 'founding_no', pz.founding_no,
                                   'first_name', (select first_name from public.kr8_members where user_id = new.member_id),
                                   'member_no', (select member_no from public.kr8_members where user_id = new.member_id)),
      'stock', (select coalesce(jsonb_object_agg(brand || '_' || amount_thb, n), '{}'::jsonb) from (
                  select brand, amount_thb, count(*) n from public.kr8_reward_codes where status = 'available' and not is_test group by 1, 2) s)),
    timeout_milliseconds := 10000);
  -- push to the founder's phone (admins with the app installed); never for test members
  if new.held and not new.is_test then
    for a in select u.id from auth.users u join public.kr8_admin_emails e on e.email = lower(u.email) loop
      perform public.kr8_push_queue('admin', a.id, false, 'Prize claim held · same person?',
        left(format('%s #%s claimed ฿%s. %s Check before paying.', (select first_name from public.kr8_members where user_id = new.member_id),
          (select member_no from public.kr8_members where user_id = new.member_id), new.amount_thb,
          case when others is not null and jsonb_array_length(others) > 0 then format('Linked to %s #%s.', others -> 0 ->> 'first_name', others -> 0 ->> 'member_no')
               else 'Face check did not match.' end), 240),
        '/app/admin.html#dups', new.id, false);
    end loop;
  end if;
  return new;
exception when others then
  return new;   -- never block a claim
end $$;
