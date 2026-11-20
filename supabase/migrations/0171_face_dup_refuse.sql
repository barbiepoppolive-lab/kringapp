-- 0171 (20 Nov 2026, founder): a duplicate face is REFUSED automatically — no founder review card.
--   "Henceforth if anyone makes a duplicate account again, don't ask me. Based on AWS straightaway refuse them with a warning,
--    with an option 'Submit account check request' sent to Kring in one tap. Once that comes, show me in the admin tab along with
--    the reason why it was refused, with a one-tap message to that profile."
-- * kr8_face_aws_record: same face as another member (AWS ≥ face_aws_dup_min, the only review reason) → decision 'block':
--   verification rejected, member stays unverified, all-prizes ban, one-time warning (kr8_system_notice), refusal row; the
--   look-alike link is kept for history but dismissed at once (no "Same person?" card), no amber alert.
--   The founder's approvals (kr8_dup_ok) let that pair pass on the next check.
-- * kr8_account_check_request(note): the member's one-tap "Ask Kring to check my account" (1 open request per member).
-- * kr8_admin_account_checks() / kr8_admin_account_check_decide(id, 'approve'|'keep'): the admin "Account checks" cards.
-- UNDO: 0171_face_dup_refuse_UNDO.sql (restores the 0161 kr8_face_aws_record, drops the new objects).

create table if not exists public.kr8_dup_refusals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  other_user uuid,
  other_no int,
  other_name text,
  sim numeric,
  gone_winner boolean not null default false,
  verification_id uuid,
  selfie_path text,
  created_at timestamptz not null default now()
);
create index if not exists kr8_dup_refusals_user on public.kr8_dup_refusals (user_id, created_at desc);
alter table public.kr8_dup_refusals enable row level security;

create table if not exists public.kr8_account_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  refusal_id uuid references public.kr8_dup_refusals (id) on delete set null,
  other_user uuid,
  other_no int,
  sim numeric,
  note text check (note is null or length(note) <= 300),
  status text not null default 'open' check (status in ('open', 'approved', 'kept')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  log jsonb not null default '[]'::jsonb
);
create unique index if not exists kr8_account_checks_one_open on public.kr8_account_checks (user_id) where status = 'open';
alter table public.kr8_account_checks enable row level security;

create table if not exists public.kr8_dup_ok (
  user_id uuid not null,
  other_user uuid not null,
  approved_at timestamptz not null default now(),
  approved_by uuid,
  primary key (user_id, other_user)
);
alter table public.kr8_dup_ok enable row level security;

CREATE OR REPLACE FUNCTION public.kr8_face_aws_record(p_user uuid, p_selfie_path text, p_consent text, p_decision text, p_reasons text[], p_live jsonb, p_card_sim numeric, p_dup_user uuid, p_dup_sim numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare me record; other record; n int; vid uuid; tries int := public.kr8_rcfg('verify_tries_day', 3);
        reasons text[] := coalesce(p_reasons, '{}'); live jsonb; dup_min numeric := public.kr8_rcfg('face_aws_dup_min', 95);
        is_dup boolean := p_dup_user is not null and coalesce(p_dup_sim, 0) >= dup_min; gone_winner boolean := false; dup_ok boolean := false;
        rid uuid; warned boolean;
begin
  if p_decision is null or p_decision not in ('pass', 'review', 'fail') then raise exception 'KR8_BAD_DECISION'; end if;
  select null::int member_no, null::text first_name into other;
  select mb.user_id, mb.verified, mb.member_no, mb.first_name into me from public.kr8_members mb where mb.user_id = p_user;
  if me.user_id is null then raise exception 'KR8_NO_CARD'; end if;
  perform pg_advisory_xact_lock(hashtext('kr8_verify:' || p_user::text));
  select count(*) into n from public.kr8_face_decisions where user_id = p_user and created_at > now() - interval '1 day';
  live := jsonb_strip_nulls(coalesce(p_live, '{}'::jsonb) || jsonb_build_object('model', 'aws-rekognition', 'engine', 'aws'));

  if p_decision = 'fail' then
    insert into public.kr8_face_decisions (user_id, decision, reasons, was_verified, live) values (p_user, 'fail', reasons, me.verified, live);
    return jsonb_build_object('result', 'fail', 'reasons', to_jsonb(reasons), 'verified', me.verified, 'tries_left', greatest(tries - n - 1, 0));
  end if;

  if p_selfie_path is null or split_part(p_selfie_path, '/', 1) <> p_user::text or p_selfie_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' then
    raise exception 'KR8_BAD_SELFIE';
  end if;
  if to_regclass('storage.objects') is not null and not exists (select 1 from storage.objects where bucket_id = 'kr8-verify' and name = p_selfie_path) then
    raise exception 'KR8_BAD_SELFIE';
  end if;
  if p_dup_user is not null then
    select mb.member_no, mb.first_name into other from public.kr8_members mb where mb.user_id = p_dup_user;
    if other.member_no is null then
      select f.member_no_copy as member_no, f.first_name_copy as first_name into other from public.kr8_face_aws_faces f
       where f.user_id = p_dup_user and f.keep_until > now() order by f.created_at desc limit 1;
      gone_winner := other.member_no is not null;
    end if;
  end if;
  -- m0161: the face belongs to the DELETED account this member's founding-only ban is tied to → the check may pass
  if is_dup and gone_winner and exists (select 1 from public.kr8_prize_bans b where b.user_id = p_user and b.scope = 'founding' and b.tied_source_no = other.member_no)
     and ((p_decision = 'pass' and cardinality(reasons) = 0) or (p_decision = 'review' and reasons = array['aws_same_face'])) then
    p_decision := 'pass'; reasons := array['own_deleted_account_ok']; dup_ok := true;
  -- 0171: the founder approved this pair as two different people (Account checks) → the check may pass
  elsif is_dup and exists (select 1 from public.kr8_dup_ok k where k.user_id = p_user and k.other_user = p_dup_user)
     and ((p_decision = 'pass' and cardinality(reasons) = 0) or (p_decision = 'review' and reasons = array['aws_same_face'])) then
    p_decision := 'pass'; reasons := array['founder_ok_different']; dup_ok := true;
  elsif p_decision = 'pass' and is_dup then p_decision := 'review'; reasons := array_append(reasons, 'aws_same_face');
  end if;
  -- 0171: a duplicate face (the only reason) is refused straight away, no founder card
  if is_dup and not dup_ok and p_decision = 'review' and reasons = array['aws_same_face'] then
    p_decision := 'block';
  end if;

  update public.kr8_verifications set status = 'rejected', reject_reason = 'replaced by a new check', reviewed_at = now()
   where user_id = p_user and status = 'pending';
  insert into public.kr8_verifications (user_id, selfie_path, consent_version, live_check, status, reviewed_at, reject_reason)
  values (p_user, p_selfie_path, p_consent,
          live || jsonb_build_object('live', true, 'straight', true, 'left', true, 'right', true, 'frames', 3,
                                     'match', round(p_card_sim / 100.0, 3), 'auto', p_decision, 'review', to_jsonb(reasons),
                                     'dup_sim', round(p_dup_sim / 100.0, 3))
               || case when p_dup_user is null then '{}'::jsonb else jsonb_build_object('aws_dup', jsonb_strip_nulls(jsonb_build_object(
                    'user_id', p_dup_user, 'member_no', other.member_no, 'first_name', other.first_name, 'sim', p_dup_sim))) end,
          case p_decision when 'pass' then 'approved' when 'block' then 'rejected' else 'pending' end,
          case when p_decision in ('pass', 'block') then now() end,
          case when p_decision = 'block' then 'Same face as another account (refused automatically)' end)
  returning id into vid;
  insert into public.kr8_face_decisions (user_id, verification_id, decision, reasons, match, dup_sim, dup_user, dup_source, was_verified, live)
  values (p_user, vid, p_decision, reasons, round(p_card_sim / 100.0, 3), round(p_dup_sim / 100.0, 3), p_dup_user,
          case when p_dup_user is not null then 'aws' end, me.verified, live);

  if p_decision = 'pass' then
    update public.kr8_members set verified = true, updated_at = now() where user_id = p_user;
  end if;

  if p_decision = 'block' then
    select exists (select 1 from public.kr8_dup_refusals r where r.user_id = p_user) into warned;
    insert into public.kr8_dup_refusals (user_id, other_user, other_no, other_name, sim, gone_winner, verification_id, selfie_path)
    values (p_user, p_dup_user, other.member_no, other.first_name, p_dup_sim, gone_winner, vid, p_selfie_path) returning id into rid;
    update public.kr8_members set verified = false, updated_at = now() where user_id = p_user and verified;
    insert into public.kr8_prize_bans (user_id, member_no, reason, scope, tied_source_no)
    values (p_user, me.member_no, format('Same face as #%s (AWS %s%%) · refused automatically', coalesce(other.member_no::text, '?'), round(p_dup_sim, 0)), 'all', null)
    on conflict (user_id) do update set scope = 'all', tied_source_no = null, reason = excluded.reason, added_at = now();
    begin   -- history only: the look-alike link exists but never becomes a founder card
      if not gone_winner then
        perform public.kr8_link_add(p_user, p_dup_user, 'face', jsonb_build_object('aws_sim', p_dup_sim, 'sources', 'face check vs face (AWS Rekognition)', 'refused', true));
        update public.kr8_account_links set dismissed_at = now()
         where dismissed_at is null and reason = 'face' and ((a = p_user and b = p_dup_user) or (a = p_dup_user and b = p_user));
      end if;
    exception when others then raise warning 'kr8_face_aws_record link: %', sqlerrm; end;
    if not warned then
      begin
        perform public.kr8_system_notice(p_user,
$t$แจ้งจากระบบ Kring ⚠️
ใบหน้านี้มีอยู่ในบัญชี Kring อีกบัญชีหนึ่งแล้วครับ
Kring ใช้กติกา "หนึ่งคน หนึ่งบัญชี" บัญชีนี้จึงยืนยันตัวตนและรับรางวัลไม่ได้
ถ้าคิดว่าระบบเข้าใจผิด กด "ขอให้ Kring ตรวจสอบบัญชี" ในหน้ายืนยันตัวตน หรือตอบกลับข้อความนี้ได้เลยครับ$t$,
$e$A note from Kring ⚠️
This face is already on another Kring account.
Kring is one person, one account, so this account can't be verified or win prizes.
If you think this is a mistake, tap "Ask Kring to check my account" on the face check screen, or reply to this message.$e$);
      exception when others then raise warning 'kr8_face_aws_record notice: %', sqlerrm; end;
    end if;
    begin
      insert into public.kr8_admin_actions_log (action, detail) values ('face_dup_refused',
        jsonb_build_object('user_id', p_user, 'member_no', me.member_no, 'other_user', p_dup_user, 'other_no', other.member_no, 'aws_sim', p_dup_sim,
                           'verification_id', vid, 'refusal_id', rid, 'warned_now', not warned));
    exception when others then null; end;
    return jsonb_build_object('result', 'block', 'reasons', to_jsonb(reasons), 'verification_id', vid, 'verified', false,
                              'tries_left', greatest(tries - n - 1, 0));
  end if;

  if is_dup and not dup_ok then
    begin
      if not gone_winner then
        perform public.kr8_link_add(p_user, p_dup_user, 'face', jsonb_build_object('aws_sim', p_dup_sim, 'sources', 'face check vs face (AWS Rekognition)'));
      end if;
    exception when others then raise warning 'kr8_face_aws_record link: %', sqlerrm; end;
    begin
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
end $function$;

-- the member's one tap: "Ask Kring to check my account"
CREATE OR REPLACE FUNCTION public.kr8_account_check_request(p_note text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); r record; cid uuid;
begin
  if uid is null then raise exception 'SIGN_IN'; end if;
  select * into r from public.kr8_dup_refusals x where x.user_id = uid order by x.created_at desc limit 1;
  if r.id is null then return jsonb_build_object('ok', false, 'code', 'NOTHING_TO_CHECK'); end if;
  if exists (select 1 from public.kr8_account_checks c where c.user_id = uid and c.status = 'open') then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_SENT');
  end if;
  insert into public.kr8_account_checks (user_id, refusal_id, other_user, other_no, sim, note, log)
  values (uid, r.id, r.other_user, r.other_no, r.sim, nullif(left(btrim(coalesce(p_note, '')), 300), ''),
          jsonb_build_array(jsonb_build_object('at', now(), 'what', 'requested')))
  returning id into cid;
  begin
    insert into public.kr8_admin_actions_log (action, detail) values ('account_check_requested', jsonb_build_object('id', cid, 'user_id', uid, 'other_no', r.other_no));
  exception when others then null; end;
  return jsonb_build_object('ok', true, 'code', 'SENT', 'id', cid);
end $function$;
revoke all on function public.kr8_account_check_request(text) from public, anon;
grant execute on function public.kr8_account_check_request(text) to authenticated;

-- admin: the open requests (and the last 7 days of decided ones) with everything the card needs
CREATE OR REPLACE FUNCTION public.kr8_admin_account_checks()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return coalesce((select jsonb_agg(row_to_json(t) order by t.status <> 'open', t.created_at desc) from (
    select c.id, c.status, c.created_at, c.decided_at, c.note, c.log,
           c.user_id, m.member_no, coalesce(m.first_name, '') as first_name, m.langs,
           c.other_user, coalesce(om.member_no, c.other_no) as other_no, coalesce(om.first_name, r.other_name, '') as other_name,
           (om.user_id is null) as other_gone, c.sim, r.created_at as refused_at, r.gone_winner,
           case when v.selfie_deleted_at is null then r.selfie_path end as selfie_path,
           (select case when ov.selfie_deleted_at is null then ov.selfie_path end from public.kr8_verifications ov
             where ov.user_id = c.other_user and ov.selfie_path is not null order by (ov.status = 'approved') desc, ov.created_at desc limit 1) as other_selfie_path,
           (select count(*) from public.kr8_dup_refusals x where x.user_id = c.user_id)::int as refusals
      from public.kr8_account_checks c
      left join public.kr8_members m on m.user_id = c.user_id
      left join public.kr8_members om on om.user_id = c.other_user
      left join public.kr8_dup_refusals r on r.id = c.refusal_id
      left join public.kr8_verifications v on v.id = r.verification_id
     where c.status = 'open' or c.decided_at > now() - interval '7 days') t), '[]'::jsonb);
end $function$;
revoke all on function public.kr8_admin_account_checks() from public, anon;
grant execute on function public.kr8_admin_account_checks() to authenticated;

-- admin: Approve (different person) → unban + the next face check may pass · Keep refused
CREATE OR REPLACE FUNCTION public.kr8_admin_account_check_decide(p_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c record; me uuid := auth.uid();
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_action not in ('approve', 'keep') then raise exception 'KR8_BAD_ACTION'; end if;
  select * into c from public.kr8_account_checks where id = p_id for update;
  if c.id is null then raise exception 'KR8_NOT_FOUND'; end if;
  update public.kr8_account_checks set status = case p_action when 'approve' then 'approved' else 'kept' end,
         decided_at = now(), decided_by = me,
         log = log || jsonb_build_array(jsonb_build_object('at', now(), 'what', p_action, 'by', me))
   where id = p_id;
  if p_action = 'approve' then
    if c.other_user is not null then
      insert into public.kr8_dup_ok (user_id, other_user, approved_by) values (c.user_id, c.other_user, me) on conflict do nothing;
    end if;
    delete from public.kr8_prize_bans where user_id = c.user_id and reason like 'Same face as #% · refused automatically';
  end if;
  insert into public.kr8_admin_actions_log (action, detail) values ('account_check_' || p_action,
    jsonb_build_object('id', p_id, 'user_id', c.user_id, 'other_user', c.other_user, 'other_no', c.other_no, 'by', me));
  return jsonb_build_object('ok', true, 'status', case p_action when 'approve' then 'approved' else 'kept' end);
end $function$;
revoke all on function public.kr8_admin_account_check_decide(uuid, text) from public, anon;
grant execute on function public.kr8_admin_account_check_decide(uuid, text) to authenticated;

-- admin: log a one-tap message sent from an Account check card (the message itself goes through kr8_admin_team_reply_en)
CREATE OR REPLACE FUNCTION public.kr8_admin_account_check_note(p_id uuid, p_en text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  update public.kr8_account_checks set log = log || jsonb_build_array(jsonb_build_object('at', now(), 'what', 'message', 'en', left(coalesce(p_en, ''), 500), 'by', auth.uid()))
   where id = p_id;
end $function$;
revoke all on function public.kr8_admin_account_check_note(uuid, text) from public, anon;
grant execute on function public.kr8_admin_account_check_note(uuid, text) to authenticated;
