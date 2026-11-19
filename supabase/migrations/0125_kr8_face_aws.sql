-- 0125 · Face check on the server with AWS Rekognition (19 Nov 2026). Built, NOT switched on.
--
-- Why: the on-phone check downloads ~38 MB of face models; on Thai mobile data + mid phones it times out and falls back to the
-- founder's manual review. New route: the phone sends 3 small JPEG frames (straight · left · right) to the edge function
-- face-check-aws, which asks Rekognition (ap-southeast-1) and writes the result here with the SAME side effects as
-- kr8_verify_instant (0095): kr8_verifications row, kr8_face_decisions line, kr8_members.verified, kr8_account_links 'face',
-- the daily tries (verify_tries_day) and the 30-day selfie deletion (reviewed_at + selfie_path, kr8_admin_verify_files_due).
--
-- Differences from kr8_verify_instant, on purpose (founder rule: "look-alike → founder decides"):
--   · a face ≥ face_aws_dup_min (95) like ANOTHER member is never blocked / ghosted automatically: pending + link + founder alert.
--   · the straight selfie is always kept (private kr8-verify bucket, deleted ~30 days after the decision) so the founder can compare.
--
-- WRITTEN, NOT APPLIED. ADDITIVE + RE-RUNNABLE (create table if not exists, create or replace, on conflict do nothing).
-- Needs 0046 (kr8_rings_config / kr8_rcfg), 0066 (kr8_link_add), 0081 (kr8_face_decisions), 0099 (kr8_alert_raise; optional).
-- SWITCH: update public.kr8_rings_config set value = 1, updated_at = now() where key = 'face_aws_on';   (0 = back to the phone check)
-- UNDO:
--   update public.kr8_rings_config set value = 0 where key = 'face_aws_on';
--   drop function if exists public.kr8_face_aws_gate(uuid, text), public.kr8_face_aws_record(uuid, text, text, text, text[], jsonb, numeric, uuid, numeric),
--     public.kr8_face_aws_index_info(uuid), public.kr8_face_aws_face_add(uuid, text, text, uuid), public.kr8_face_aws_backfill_todo(integer),
--     public.kr8_face_aws_stale(integer), public.kr8_face_aws_forgot(text[]);
--   drop table if exists public.kr8_face_aws_calls, public.kr8_face_aws_faces;
--   delete from public.kr8_rings_config where key in ('face_aws_on', 'face_aws_hour', 'face_aws_card_min', 'face_aws_dup_min');
--   and re-run the 0081 kr8_face_has_new_check (vectors only).

begin;

insert into public.kr8_rings_config (key, value, note) values
  ('face_aws_on', 0, '1 = face check on the server (AWS Rekognition, edge function face-check-aws); 0 = the on-phone check'),
  ('face_aws_hour', 20, 'max server face checks per member per hour'),
  ('face_aws_card_min', 80, 'AWS similarity selfie vs own card photo needed for an automatic ✓ (0-100)'),
  ('face_aws_dup_min', 95, 'AWS similarity to ANOTHER member that sends the check to the founder as a look-alike (0-100)')
on conflict (key) do nothing;

-- every call to the edge function (the per-hour limit; kept 2 days)
create table if not exists public.kr8_face_aws_calls (
  id      bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists kr8_face_aws_calls_user on public.kr8_face_aws_calls (user_id, at desc);
alter table public.kr8_face_aws_calls enable row level security;
revoke all on public.kr8_face_aws_calls from public, anon, authenticated;

-- every face stored in the Rekognition collection kring-members (ExternalImageId = user id). No FK on purpose: when an account
-- is deleted the row stays until the sweep has removed the face from AWS (PDPA: "we delete the face code with your account").
create table if not exists public.kr8_face_aws_faces (
  face_id         text primary key,
  user_id         uuid not null,
  source          text not null check (source in ('check', 'card')),
  verification_id uuid,
  created_at      timestamptz not null default now()
);
create index if not exists kr8_face_aws_faces_user on public.kr8_face_aws_faces (user_id);
alter table public.kr8_face_aws_faces enable row level security;
revoke all on public.kr8_face_aws_faces from public, anon, authenticated;

-- an approved AWS check counts as "the new check" too (otherwise the app would keep asking verified members to scan again)
create or replace function public.kr8_face_has_new_check(p_user uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.kr8_face_vectors f join public.kr8_verifications v on v.id = f.verification_id
                  where f.user_id = p_user and v.user_id = p_user and f.source = 'check' and v.status = 'approved')
      or exists (select 1 from public.kr8_verifications v
                  where v.user_id = p_user and v.status = 'approved' and v.live_check ->> 'model' = 'aws-rekognition')
$$;
revoke all on function public.kr8_face_has_new_check(uuid) from public, anon, authenticated;

-- ───────── 1. before calling AWS: switch, card, consent, limits ─────────
create or replace function public.kr8_face_aws_gate(p_user uuid, p_consent text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me record; n int; h int; tries int := public.kr8_rcfg('verify_tries_day', 3);
begin
  if p_user is null then raise exception 'KR8_SIGN_IN'; end if;
  if public.kr8_rcfg('face_aws_on', 0) <> 1 then raise exception 'KR8_FACE_AWS_OFF'; end if;
  select mb.user_id, mb.verified, mb.photo, mb.member_no into me from public.kr8_members mb where mb.user_id = p_user;
  if me.user_id is null then raise exception 'KR8_NO_CARD'; end if;
  -- the server-check consent text (photos go to AWS Singapore) starts at face-2026-11-19a
  if p_consent is null or p_consent !~ '^face-[0-9]{4}-[0-9]{2}-[0-9]{2}[a-z]?$' or p_consent < 'face-2026-11-19a' then
    raise exception 'KR8_CONSENT_REQUIRED';
  end if;
  if me.verified and public.kr8_face_has_new_check(p_user) then
    return jsonb_build_object('again', true, 'verified', true);
  end if;
  delete from public.kr8_face_aws_calls where user_id = p_user and at < now() - interval '2 days';
  select count(*) into h from public.kr8_face_aws_calls where user_id = p_user and at > now() - interval '1 hour';
  if h >= public.kr8_rcfg('face_aws_hour', 20) then raise exception 'KR8_SLOW_DOWN'; end if;
  select count(*) into n from public.kr8_face_decisions where user_id = p_user and created_at > now() - interval '1 day';
  if n >= tries then raise exception 'KR8_SLOW_DOWN'; end if;
  insert into public.kr8_face_aws_calls (user_id) values (p_user);
  return jsonb_build_object('again', false, 'verified', coalesce(me.verified, false), 'photo', me.photo, 'member_no', me.member_no,
    'tries_left', greatest(tries - n, 0), 'card_min', public.kr8_rcfg('face_aws_card_min', 80), 'dup_min', public.kr8_rcfg('face_aws_dup_min', 95),
    'auto_on', public.kr8_rcfg('verify_auto_on', 1));
end $$;

-- ───────── 2. after AWS: write the decision (mirrors kr8_verify_instant's side effects) ─────────
/** p_decision: 'pass' (✓ now) · 'review' (pending, founder) · 'fail' (retry; no row, no photo, a 'fail' line that counts as a try).
    p_card_sim / p_dup_sim are Rekognition similarities 0–100 (stored /100 in match / dup_sim, like the SFace numbers). */
create or replace function public.kr8_face_aws_record(p_user uuid, p_selfie_path text, p_consent text, p_decision text, p_reasons text[],
  p_live jsonb, p_card_sim numeric, p_dup_user uuid, p_dup_sim numeric) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me record; other record; n int; vid uuid; tries int := public.kr8_rcfg('verify_tries_day', 3);
        reasons text[] := coalesce(p_reasons, '{}'); live jsonb; dup_min numeric := public.kr8_rcfg('face_aws_dup_min', 95);
        is_dup boolean := p_dup_user is not null and coalesce(p_dup_sim, 0) >= dup_min;
begin
  if p_decision is null or p_decision not in ('pass', 'review', 'fail') then raise exception 'KR8_BAD_DECISION'; end if;
  select null::int member_no, null::text first_name into other;   -- assigned, so the look-alike fields below are safe to read
  select mb.user_id, mb.verified, mb.member_no, mb.first_name into me from public.kr8_members mb where mb.user_id = p_user;
  if me.user_id is null then raise exception 'KR8_NO_CARD'; end if;
  perform pg_advisory_xact_lock(hashtext('kr8_verify:' || p_user::text));
  select count(*) into n from public.kr8_face_decisions where user_id = p_user and created_at > now() - interval '1 day';
  live := jsonb_strip_nulls(coalesce(p_live, '{}'::jsonb) || jsonb_build_object('model', 'aws-rekognition', 'engine', 'aws'));

  if p_decision = 'fail' then
    insert into public.kr8_face_decisions (user_id, decision, reasons, was_verified, live) values (p_user, 'fail', reasons, me.verified, live);
    return jsonb_build_object('result', 'fail', 'reasons', to_jsonb(reasons), 'verified', me.verified, 'tries_left', greatest(tries - n - 1, 0));
  end if;

  -- same selfie rules as kr8_verify_instant: <user id>/<uuid>.jpg in kr8-verify, really uploaded
  if p_selfie_path is null or split_part(p_selfie_path, '/', 1) <> p_user::text or p_selfie_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' then
    raise exception 'KR8_BAD_SELFIE';
  end if;
  if to_regclass('storage.objects') is not null and not exists (select 1 from storage.objects where bucket_id = 'kr8-verify' and name = p_selfie_path) then
    raise exception 'KR8_BAD_SELFIE';
  end if;
  -- a pass can never carry a look-alike (the edge function's rule, enforced here too)
  if p_decision = 'pass' and is_dup then p_decision := 'review'; reasons := array_append(reasons, 'aws_same_face'); end if;
  if p_dup_user is not null then
    select mb.member_no, mb.first_name into other from public.kr8_members mb where mb.user_id = p_dup_user;
  end if;

  update public.kr8_verifications set status = 'rejected', reject_reason = 'replaced by a new check', reviewed_at = now()
   where user_id = p_user and status = 'pending';
  insert into public.kr8_verifications (user_id, selfie_path, consent_version, live_check, status, reviewed_at)
  values (p_user, p_selfie_path, p_consent,
          live || jsonb_build_object('live', true, 'straight', true, 'left', true, 'right', true, 'frames', 3,
                                     'match', round(p_card_sim / 100.0, 3), 'auto', p_decision, 'review', to_jsonb(reasons),
                                     'dup_sim', round(p_dup_sim / 100.0, 3))
               || case when p_dup_user is null then '{}'::jsonb else jsonb_build_object('aws_dup', jsonb_strip_nulls(jsonb_build_object(
                    'user_id', p_dup_user, 'member_no', other.member_no, 'first_name', other.first_name, 'sim', p_dup_sim))) end,
          case p_decision when 'pass' then 'approved' else 'pending' end,
          case when p_decision = 'pass' then now() end)
  returning id into vid;
  insert into public.kr8_face_decisions (user_id, verification_id, decision, reasons, match, dup_sim, dup_user, dup_source, was_verified, live)
  values (p_user, vid, p_decision, reasons, round(p_card_sim / 100.0, 3), round(p_dup_sim / 100.0, 3), p_dup_user,
          case when p_dup_user is not null then 'aws' end, me.verified, live);

  if p_decision = 'pass' then
    update public.kr8_members set verified = true, updated_at = now() where user_id = p_user;
  end if;
  if is_dup then
    perform public.kr8_link_add(p_user, p_dup_user, 'face', jsonb_build_object('aws_sim', p_dup_sim, 'sources', 'face check vs face (AWS Rekognition)'));
    begin   -- an alert error must never break the member's face check
      perform public.kr8_alert_raise(
        p_key => 'face_aws:' || vid::text, p_robot => 'protect', p_severity => 'amber',
        p_title => format('Look-alike: #%s and #%s', coalesce(me.member_no::text, '?'), coalesce(other.member_no::text, '?')),
        p_body => format('New face check from #%s %s looks like #%s %s (AWS %s%%). Nothing was blocked. Open Face checks, compare the photos and decide.',
                         coalesce(me.member_no::text, '?'), coalesce(me.first_name, ''), coalesce(other.member_no::text, '?'), coalesce(other.first_name, ''), round(p_dup_sim, 1)),
        p_href => '#faces',
        p_detail => jsonb_build_object('verification_id', vid, 'user_id', p_user, 'member_no', me.member_no, 'other_user', p_dup_user,
                                       'other_no', other.member_no, 'aws_sim', p_dup_sim));
    exception when others then
      raise warning 'kr8_face_aws_record alert: %', sqlerrm;
    end;
  end if;
  return jsonb_build_object('result', p_decision, 'reasons', to_jsonb(reasons), 'verification_id', vid,
                            'verified', case when p_decision = 'pass' then true else me.verified end,
                            'tries_left', greatest(tries - n - 1, 0));
end $$;

-- ───────── 3. collection bookkeeping (index after approve, backfill card photos, sweep) ─────────
create or replace function public.kr8_face_aws_index_info(p_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('user_id', v.user_id, 'status', v.status, 'aws', coalesce(v.live_check ->> 'model', '') = 'aws-rekognition',
                            'selfie_path', case when v.selfie_deleted_at is null then v.selfie_path end)
    from public.kr8_verifications v where v.id = p_id
$$;

create or replace function public.kr8_face_aws_face_add(p_user uuid, p_face_id text, p_source text, p_verification uuid default null) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.kr8_face_aws_faces (face_id, user_id, source, verification_id) values (p_face_id, p_user, p_source, p_verification)
  on conflict (face_id) do nothing
$$;

/** verified members (not the team) whose face is not in the collection yet: their card photo is indexed (source 'card') */
create or replace function public.kr8_face_aws_backfill_todo(p_limit integer default 25) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', x.user_id, 'photo', x.photo)), '[]'::jsonb) from (
    select mb.user_id, mb.photo from public.kr8_members mb
     where mb.verified and mb.photo is not null and not public.kr8_is_team(mb.user_id)
       and not exists (select 1 from public.kr8_face_aws_faces f where f.user_id = mb.user_id)
     order by mb.member_no nulls last limit least(greatest(coalesce(p_limit, 25), 1), 50)) x
$$;

/** faces to remove from AWS: the account is gone, or the member is no longer verified (deleted face data, rejected) */
create or replace function public.kr8_face_aws_stale(p_limit integer default 1000) returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(f.face_id), '{}') from (
    select f.face_id from public.kr8_face_aws_faces f left join public.kr8_members mb on mb.user_id = f.user_id
     where mb.user_id is null or not coalesce(mb.verified, false)
     limit least(greatest(coalesce(p_limit, 1000), 1), 4096)) f
$$;

create or replace function public.kr8_face_aws_forgot(p_face_ids text[]) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  delete from public.kr8_face_aws_faces where face_id = any (coalesce(p_face_ids, '{}'));
  get diagnostics n = row_count;
  return n;
end $$;

-- the edge function uses the service role; members and admins never call these directly
revoke all on function public.kr8_face_aws_gate(uuid, text), public.kr8_face_aws_record(uuid, text, text, text, text[], jsonb, numeric, uuid, numeric),
  public.kr8_face_aws_index_info(uuid), public.kr8_face_aws_face_add(uuid, text, text, uuid), public.kr8_face_aws_backfill_todo(integer),
  public.kr8_face_aws_stale(integer), public.kr8_face_aws_forgot(text[]) from public, anon, authenticated;
grant execute on function public.kr8_face_aws_gate(uuid, text), public.kr8_face_aws_record(uuid, text, text, text, text[], jsonb, numeric, uuid, numeric),
  public.kr8_face_aws_index_info(uuid), public.kr8_face_aws_face_add(uuid, text, text, uuid), public.kr8_face_aws_backfill_todo(integer),
  public.kr8_face_aws_stale(integer), public.kr8_face_aws_forgot(text[]) to service_role;

commit;
