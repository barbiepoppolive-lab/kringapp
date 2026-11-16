-- 0076 · Duplicate faces caught automatically (17 Nov 2026). WRITTEN, NOT APPLIED.
--
-- WHAT WAS MISSED: member #53 "Pom" (2nd account of #30 "Pom Thanatp") sent two face checks; the founder caught it by eye.
--   0066 compares a new face code with every OTHER member's face code, but members verified before 0066 (#24, #30, …) had
--   no face code stored, so there was nothing to compare with. Card photos never got a face code at all.
--   (17 Nov backfill, done by hand on the live DB: face codes from the stored selfies of #24, #30, #53 were added with
--   source 'selfie', and the #30 ↔ #53 'face' link was written; distance 0.496 selfie vs selfie, 0.486 #53 card vs #30 selfie.)
--
-- WHAT THIS ADDS
--   1. Face codes from CARD PHOTOS (source 'card'; 'backfill-card' / 'backfill-selfie' for admin backfills). The phone already
--      runs face-api on the card photo (checkProfilePhoto); it now also sends the photo's face code (kr8_save_card_print).
--      One card code per member (a new photo replaces the old code). The admin page can also write codes for any member
--      (kr8_admin_save_face_print): on Approve of a face check that has no code yet, and the "Backfill face codes" button.
--   2. Two strengths of match (measured on the live members, 17 Nov: the true duplicate #30 ↔ #53 was 0.49–0.50, but three
--      pairs of clearly DIFFERENT women were 0.45–0.46 card photo vs card photo — face-api is weak on similar-looking faces
--      and on posed / filtered card photos):
--        'face'       = LINK (as 0066: no Rings between them, claims held). Only face-check vs face-check (selfie, verify,
--                       claim) at or under face_same_max (0.50).
--        'face_maybe' = FLAG ONLY (admin banner + alert; never holds a claim, never removes Rings). Any pair with a card
--                       photo at or under face_card_max (0.50), and face-check pairs between face_same_max and
--                       face_maybe_max (0.55).
--      kr8_linked() is unchanged (it only counts 'face' and 'device'), so a look-alike flag can never cost a member a prize.
--   3. A new face check is compared with ALL face codes (card + selfie) right away. If it looks like another member, the
--      founder gets a push ("Face check looks like #30 Pom Thanatp · 0.49") and an email (notify-new-member, table
--      'kr8_face_lookalike'), and the admin Face check card shows a red / amber banner (kr8_admin_verify_lookalikes).
--
-- PRIVACY (founder to confirm before applying): card-photo face codes are new processing of members' faces. The card photo is
--   already public to members, but the Privacy notice should say a face code is made from the card photo too, to keep
--   one person, one account (team-only, deleted with the account). Switch: card_print_on (1 = on). 0 = the server ignores
--   card codes from phones (admin backfill still works).
--
-- ADDITIVE + RE-RUNNABLE. Widens two check constraints, adds 4 config rows and 5 functions, re-creates kr8_face_match_links
-- and kr8_save_face_print with the SAME arguments and return types. Works with or without 0075 (0075 only trusts
-- source 'verify' / 'selfie' prints with an APPROVED verification for claims; card prints are never trusted there).
-- UNDO: re-run kr8_face_match_links + kr8_save_face_print from 0066; drop function kr8_save_card_print(real[]),
--   kr8_admin_save_face_print(uuid, real[], text, uuid), kr8_admin_verify_lookalikes(uuid[]), kr8_face_nearest(uuid, int),
--   kr8_face_alert(uuid, text); delete from kr8_account_links where reason = 'face_maybe'; the wider constraints can stay.

begin;

insert into public.kr8_rings_config (key, value, note) values
  ('face_card_max', 500, 'a card photo face code this close (thousandths) to another member''s code raises a "looks alike" FLAG (0076)'),
  ('face_maybe_max', 550, 'two face-check codes between face_same_max and this raise a "looks alike" FLAG, not a link (0076)'),
  ('card_print_on', 1, '1 = phones send a face code made from the card photo (0076)'),
  ('face_alert_on', 1, '1 = founder push + email when a new face check looks like another member (0076)')
on conflict (key) do nothing;

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'kr8_face_prints_source' and pg_get_constraintdef(oid) not like '%backfill-card%') then
    alter table public.kr8_face_prints drop constraint kr8_face_prints_source;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'kr8_face_prints_source') then
    alter table public.kr8_face_prints add constraint kr8_face_prints_source
      check (source in ('verify', 'selfie', 'claim', 'card', 'backfill-card', 'backfill-selfie'));
  end if;
  if exists (select 1 from pg_constraint where conname = 'kr8_account_links_reason' and pg_get_constraintdef(oid) not like '%face_maybe%') then
    alter table public.kr8_account_links drop constraint kr8_account_links_reason;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'kr8_account_links_reason') then
    alter table public.kr8_account_links add constraint kr8_account_links_reason check (reason in ('face', 'face_maybe', 'device', 'network', 'line'));
  end if;
end $$;
-- one card code per member is kept (a new photo replaces it); lookups by source
create index if not exists kr8_face_prints_source_idx on public.kr8_face_prints (source, user_id);

-- a face code that came from a live face check (not a card photo)
create or replace function public.kr8_face_is_check(p_source text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p_source in ('verify', 'selfie', 'claim', 'backfill-selfie')
$$;

/** the closest other members to this member's face codes (all sources), nearest first. Team-only. */
create or replace function public.kr8_face_nearest(p_user uuid, p_limit int default 3)
returns table (user_id uuid, member_no int, first_name text, verified boolean, dist double precision, mine_source text, their_source text, strength text)
language sql stable security definer set search_path = public, pg_temp as $$
  with pairs as (
    select o.user_id, public.kr8_face_dist(m.descriptor, o.descriptor) d, m.source ms, o.source os
    from public.kr8_face_prints m join public.kr8_face_prints o on o.user_id <> m.user_id
    where m.user_id = p_user
  ), rated as (   -- strength per pair: a face-check pair at 0.496 ("same") beats a card pair at 0.486 ("maybe")
    select p.*, case when public.kr8_face_is_check(p.ms) and public.kr8_face_is_check(p.os) and p.d <= public.kr8_rcfg('face_same_max', 500) / 1000.0 then 'same'
                     when public.kr8_face_is_check(p.ms) and public.kr8_face_is_check(p.os) and p.d <= public.kr8_rcfg('face_maybe_max', 550) / 1000.0 then 'maybe'
                     when p.d <= public.kr8_rcfg('face_card_max', 500) / 1000.0 then 'maybe'
                     else 'no' end s
    from pairs p
  ), best as (
    select distinct on (r.user_id) r.user_id, r.d, r.ms, r.os, r.s from rated r
    order by r.user_id, case r.s when 'same' then 0 when 'maybe' then 1 else 2 end, r.d
  )
  select b.user_id, mb.member_no::int, mb.first_name, mb.verified, round(b.d::numeric, 3)::float8, b.ms, b.os, b.s
  from best b join public.kr8_members mb on mb.user_id = b.user_id
  where not public.kr8_is_team(b.user_id)
  order by case b.s when 'same' then 0 when 'maybe' then 1 else 2 end, b.d
  limit greatest(1, least(coalesce(p_limit, 3), 20))
$$;

/** 0066 body, now source-aware: face check vs face check ≤ face_same_max → 'face' LINK (as before);
    anything else close enough → 'face_maybe' FLAG (pairs with a card photo, or face checks up to face_maybe_max). */
create or replace function public.kr8_face_match_links(p_user uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n int := 0; same_max float8 := public.kr8_rcfg('face_same_max', 500) / 1000.0;
        maybe_max float8 := public.kr8_rcfg('face_maybe_max', 550) / 1000.0; card_max float8 := public.kr8_rcfg('face_card_max', 500) / 1000.0;
begin
  for r in
    select o.user_id,
           min(public.kr8_face_dist(m.descriptor, o.descriptor)) filter (where public.kr8_face_is_check(m.source) and public.kr8_face_is_check(o.source)) d_check,
           min(public.kr8_face_dist(m.descriptor, o.descriptor)) d_any
    from public.kr8_face_prints m join public.kr8_face_prints o on o.user_id <> m.user_id
    where m.user_id = p_user group by o.user_id
  loop
    if r.d_check is not null and r.d_check <= same_max then
      perform public.kr8_link_add(p_user, r.user_id, 'face', jsonb_build_object('dist', round(r.d_check::numeric, 3), 'sources', 'face check vs face check'));
      n := n + 1;
    elsif (r.d_check is not null and r.d_check <= maybe_max) or r.d_any <= card_max then
      perform public.kr8_link_add(p_user, r.user_id, 'face_maybe', jsonb_build_object('dist', round(least(coalesce(r.d_check, 9), r.d_any)::numeric, 3),
        'sources', case when r.d_check is not null and r.d_check <= r.d_any + 1e-9 then 'face check vs face check' else 'with a card photo' end));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- kr8_link_add keeps the closest distance for 'face' only (0066); do the same for 'face_maybe'
create or replace function public.kr8_link_add(x uuid, y uuid, p_reason text, p_detail jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if x is null or y is null or x = y then return; end if;
  if not exists (select 1 from auth.users where id = x) or not exists (select 1 from auth.users where id = y) then return; end if;
  insert into public.kr8_account_links (a, b, reason, detail) values (least(x, y), greatest(x, y), p_reason, coalesce(p_detail, '{}'::jsonb))
  on conflict (a, b, reason) do update set last_at = now(),
    detail = case when p_reason in ('face', 'face_maybe') and (excluded.detail ->> 'dist')::float8 < coalesce((kr8_account_links.detail ->> 'dist')::float8, 9)
                  then excluded.detail else kr8_account_links.detail end;
end $$;

/** founder push + email when this member's newest face code looks like another member. Never raises. */
create or replace function public.kr8_face_alert(p_user uuid, p_what text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare n record; me record; k text; a record; t text;
begin
  if public.kr8_rcfg('face_alert_on', 1) <> 1 or public.kr8_is_test_member(p_user) then return; end if;
  select * into n from public.kr8_face_nearest(p_user, 1) f where f.strength in ('same', 'maybe');
  if n.user_id is null then return; end if;
  select member_no, first_name into me from public.kr8_members where user_id = p_user;
  t := format('%s #%s looks like %s #%s · %s', coalesce(me.first_name, 'member'), coalesce(me.member_no::text, '?'),
              coalesce(n.first_name, 'member'), coalesce(n.member_no::text, '?'), to_char(n.dist, 'FM0.00'));
  if to_regprocedure('public.kr8_push_queue(text,uuid,boolean,text,text,text,uuid,boolean)') is not null then
    for a in select u.id from auth.users u join public.kr8_admin_emails e on e.email = lower(u.email) loop
      perform public.kr8_push_queue('admin', a.id, false,
        case when n.strength = 'same' then 'Same person? · ' else 'Looks alike? · ' end || p_what, left(t || '. Check before approving.', 240),
        '/app/admin.html#q/faces', null, false);
    end loop;
  end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'notify_hook_secret' limit 1;
  if k is not null then
    perform net.http_post(
      url := 'https://pedxoxpammnyfnizljyj.supabase.co/functions/v1/notify-new-member',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', k),
      body := jsonb_build_object('table', 'kr8_face_lookalike', 'record', jsonb_build_object(
        'what', p_what, 'strength', n.strength, 'dist', n.dist, 'sources', n.mine_source || ' vs ' || n.their_source,
        'member_no', me.member_no, 'first_name', me.first_name, 'other_no', n.member_no, 'other_name', n.first_name, 'other_verified', n.verified)),
      timeout_milliseconds := 10000);
  end if;
exception when others then
  return;   -- an alert never blocks a face check
end $$;

revoke all on function public.kr8_face_is_check(text), public.kr8_face_nearest(uuid, int), public.kr8_face_match_links(uuid),
  public.kr8_link_add(uuid, uuid, text, jsonb), public.kr8_face_alert(uuid, text) from public, anon, authenticated;

-- ───────────── the member's phone: face check code (0066 body + alert) ─────────────
create or replace function public.kr8_save_face_print(p_desc real[]) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if not public.kr8_face_ok(p_desc) then raise exception 'KR8_BAD_FACE'; end if;
  if not exists (select 1 from public.kr8_verifications v where v.user_id = uid and v.created_at > now() - interval '1 hour'
                 and v.consent_version >= 'face-2026-11-17') then raise exception 'KR8_CONSENT_REQUIRED'; end if;
  if (select count(*) from public.kr8_face_prints where user_id = uid and created_at > now() - interval '1 day') >= 10 then raise exception 'KR8_SLOW_DOWN'; end if;
  insert into public.kr8_face_prints (user_id, descriptor, source, verification_id)
  values (uid, p_desc, 'verify', (select v.id from public.kr8_verifications v where v.user_id = uid order by v.created_at desc limit 1));
  perform public.kr8_face_match_links(uid);
  perform public.kr8_face_alert(uid, 'face check');
  return true;
end $$;
revoke all on function public.kr8_save_face_print(real[]) from public, anon;
grant execute on function public.kr8_save_face_print(real[]) to authenticated;

-- ───────────── the member's phone: card photo code ─────────────
/** the face code of the member's CURRENT card photo (the phone already runs face-api on it). One per member: replaces the
    older card code. Card codes only ever raise a "looks alike" flag (never a link / hold). Returns false when switched off. */
create or replace function public.kr8_save_card_print(p_desc real[]) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if public.kr8_rcfg('card_print_on', 1) <> 1 then return false; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid and coalesce(photo, '') <> '') then raise exception 'KR8_NO_CARD'; end if;
  if not public.kr8_face_ok(p_desc) then raise exception 'KR8_BAD_FACE'; end if;
  if (select count(*) from public.kr8_face_prints where user_id = uid and source = 'card' and created_at > now() - interval '1 day') >= 10 then raise exception 'KR8_SLOW_DOWN'; end if;
  delete from public.kr8_face_prints where user_id = uid and source = 'card';
  insert into public.kr8_face_prints (user_id, descriptor, source) values (uid, p_desc, 'card');
  perform public.kr8_face_match_links(uid);
  perform public.kr8_face_alert(uid, 'card photo');
  return true;
end $$;
revoke all on function public.kr8_save_card_print(real[]) from public, anon;
grant execute on function public.kr8_save_card_print(real[]) to authenticated;

-- ───────────── admin: write a code for any member (Approve without a code, Backfill button) ─────────────
/** p_source: 'selfie' (the verification selfie; p_verification required, replaces nothing), 'backfill-card' (card photo;
    replaces the member's older backfill-card code). Returns the closest other members after linking. */
create or replace function public.kr8_admin_save_face_print(p_user uuid, p_desc real[], p_source text, p_verification uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if not exists (select 1 from public.kr8_members where user_id = p_user) then raise exception 'KR8_NO_PERSON'; end if;
  if not public.kr8_face_ok(p_desc) then raise exception 'KR8_BAD_FACE'; end if;
  if p_source = 'selfie' then
    if p_verification is null or not exists (select 1 from public.kr8_verifications where id = p_verification and user_id = p_user) then raise exception 'KR8_NO_VERIFICATION'; end if;
    if not exists (select 1 from public.kr8_face_prints where verification_id = p_verification and source in ('selfie', 'verify', 'backfill-selfie')) then
      insert into public.kr8_face_prints (user_id, descriptor, source, verification_id) values (p_user, p_desc, 'selfie', p_verification);
    end if;
  elsif p_source = 'backfill-card' then
    delete from public.kr8_face_prints where user_id = p_user and source = 'backfill-card';
    insert into public.kr8_face_prints (user_id, descriptor, source) values (p_user, p_desc, 'backfill-card');
  else
    raise exception 'KR8_BAD_SOURCE';
  end if;
  perform public.kr8_face_match_links(p_user);
  return coalesce((select jsonb_agg(to_jsonb(f)) from public.kr8_face_nearest(p_user, 3) f where f.strength <> 'no'), '[]'::jsonb);
end $$;
revoke all on function public.kr8_admin_save_face_print(uuid, real[], text, uuid) from public, anon;
grant execute on function public.kr8_admin_save_face_print(uuid, real[], text, uuid) to authenticated;

/** the admin Face check card banner: for each verification, the closest other members ("Looks like #30 Pom Thanatp · 0.49").
    Also says whether that verification already has a face code (has_print) so the admin page can make one on Approve. */
create or replace function public.kr8_admin_verify_lookalikes(p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return coalesce((select jsonb_object_agg(v.id, jsonb_build_object(
      'has_print', exists (select 1 from public.kr8_face_prints f where f.verification_id = v.id),
      'matches', coalesce((select jsonb_agg(jsonb_build_object('user_id', n.user_id, 'member_no', n.member_no, 'first_name', n.first_name, 'verified', n.verified,
                   'dist', n.dist, 'strength', n.strength, 'sources', n.mine_source || ' vs ' || n.their_source) order by (n.strength = 'same') desc, n.dist)
                 from public.kr8_face_nearest(v.user_id, 3) n where n.strength <> 'no'), '[]'::jsonb)))
    from public.kr8_verifications v where v.id = any (coalesce(p_ids, '{}'))), '{}'::jsonb);
end $$;
revoke all on function public.kr8_admin_verify_lookalikes(uuid[]) from public, anon;
grant execute on function public.kr8_admin_verify_lookalikes(uuid[]) to authenticated;

/** the admin "Backfill face codes" button: members with a card photo or a stored selfie that has no code yet */
create or replace function public.kr8_admin_face_backfill_todo() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return jsonb_build_object(
    'cards', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'member_no', m.member_no, 'photo', m.photo) order by m.member_no)
               from public.kr8_members m
               where coalesce(m.photo, '') <> '' and not public.kr8_is_test_member(m.user_id) and not public.kr8_is_team(m.user_id)
                 and not exists (select 1 from public.kr8_face_prints f where f.user_id = m.user_id and f.source in ('card', 'backfill-card'))), '[]'::jsonb),
    'selfies', coalesce((select jsonb_agg(jsonb_build_object('user_id', v.user_id, 'verification_id', v.id, 'selfie_path', v.selfie_path) order by v.created_at)
               from public.kr8_verifications v
               where v.selfie_path is not null and v.selfie_deleted_at is null
                 and not exists (select 1 from public.kr8_face_prints f where f.verification_id = v.id)), '[]'::jsonb));
end $$;
revoke all on function public.kr8_admin_face_backfill_todo() from public, anon;
grant execute on function public.kr8_admin_face_backfill_todo() to authenticated;

commit;
