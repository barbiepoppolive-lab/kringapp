-- 0130 · Keep the face of prize winners for 1 year after they delete their account (founder 19 Nov 2026).
-- Why: three members claimed ฿100 and then deleted their accounts. If one comes back with a new email/phone, the AWS face
-- search must still find them, so a second prize is never paid automatically (the check goes to the founder, red alert).
-- What: the AWS face row of a deleted member who received a prize stays (keep_until = deleted + 1 year, member no/name copied);
-- the sweep skips it until then. Only for duplicate-prize checks (Terms §8). Everyone else: deleted as before.
-- UNDO: drop trigger kr8_face_keep_users on auth.users; drop function public.kr8_face_keep_trg();
--       alter table public.kr8_face_aws_faces drop column keep_until, drop column member_no_copy, drop column first_name_copy;
--       and re-run 0125's kr8_face_aws_stale + kr8_face_aws_record.
begin;
alter table public.kr8_face_aws_faces add column if not exists keep_until timestamptz;
alter table public.kr8_face_aws_faces add column if not exists member_no_copy int;
alter table public.kr8_face_aws_faces add column if not exists first_name_copy text;

create or replace function public.kr8_face_keep_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.kr8_prizes p where p.member_id = old.id and p.status <> 'cancelled')
     or exists (select 1 from public.kr8_reward_claims c where c.member_id = old.id and c.status <> 'cancelled') then
    update public.kr8_face_aws_faces f set keep_until = now() + interval '1 year',
           member_no_copy = (select member_no from public.kr8_members where user_id = old.id),
           first_name_copy = (select first_name from public.kr8_members where user_id = old.id)
     where f.user_id = old.id;
  end if;
  return old;
exception when others then
  raise warning 'kr8_face_keep_trg: %', sqlerrm;   -- never block an account deletion
  return old;
end $$;
drop trigger if exists kr8_face_keep_users on auth.users;
create trigger kr8_face_keep_users before delete on auth.users for each row execute function public.kr8_face_keep_trg();

create or replace function public.kr8_face_aws_stale(p_limit integer default 1000) returns text[]
language sql stable security definer set search_path = public, pg_temp as $fn$
  select coalesce(array_agg(f.face_id), '{}') from (
    select f.face_id from public.kr8_face_aws_faces f left join public.kr8_members mb on mb.user_id = f.user_id
     where (mb.user_id is null or not coalesce(mb.verified, false))
       and not (mb.user_id is null and f.keep_until is not null and f.keep_until > now())   -- 0130: deleted prize winner, kept 1 year
     limit least(greatest(coalesce(p_limit, 1000), 1), 4096)) f
$fn$;

create or replace function public.kr8_face_aws_record(p_user uuid, p_selfie_path text, p_consent text, p_decision text, p_reasons text[],
  p_live jsonb, p_card_sim numeric, p_dup_user uuid, p_dup_sim numeric) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare me record; other record; n int; vid uuid; tries int := public.kr8_rcfg('verify_tries_day', 3);
        reasons text[] := coalesce(p_reasons, '{}'); live jsonb; dup_min numeric := public.kr8_rcfg('face_aws_dup_min', 95);
        is_dup boolean := p_dup_user is not null and coalesce(p_dup_sim, 0) >= dup_min; gone_winner boolean := false;
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
    -- 0130: the look-alike is a DELETED account that received a prize (face kept 1 year to stop re-claims)
    if other.member_no is null then
      select f.member_no_copy as member_no, f.first_name_copy as first_name into other from public.kr8_face_aws_faces f
       where f.user_id = p_dup_user and f.keep_until > now() order by f.created_at desc limit 1;
      gone_winner := other.member_no is not null;
    end if;
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
    begin   -- 0130: a deleted account can't be linked (it no longer exists); the alert below still names it
      if not gone_winner then
        perform public.kr8_link_add(p_user, p_dup_user, 'face', jsonb_build_object('aws_sim', p_dup_sim, 'sources', 'face check vs face (AWS Rekognition)'));
      end if;
    exception when others then raise warning 'kr8_face_aws_record link: %', sqlerrm; end;
    begin   -- an alert error must never break the member's face check
      perform public.kr8_alert_raise(
        p_key => 'face_aws:' || vid::text, p_robot => 'protect', p_severity => case when gone_winner then 'red' else 'amber' end,
        p_title => case when gone_winner then format('Re-joined? #%s has the face of deleted prize winner #%s', coalesce(me.member_no::text, '?'), coalesce(other.member_no::text, '?'))
                        else format('Look-alike: #%s and #%s', coalesce(me.member_no::text, '?'), coalesce(other.member_no::text, '?')) end,
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
commit;
