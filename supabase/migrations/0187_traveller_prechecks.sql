-- 0187 · Automatic pre-checks for traveller-tag requests (founder approved 21 Nov 2026).
--
-- When a member files "I'm a traveller" (kr8_request_traveller → a new kr8_traveller_requests row), the face robot
-- (Edge Function face-check-aws, action 'traveller_scan', robot key from Vault 'face_robot_key') runs ONCE:
--   1. OCR of the passport photo (AWS Textract, Rekognition DetectText as fallback) → passport machine-readable zone (MRZ)?
--      none → "Not a passport photo page"
--   2. nationality / issuing state from the MRZ: THA → "Thai passport"
--   3. AWS CompareFaces: passport face vs the member's face-check selfie (or the card photo when the selfie is gone)
--   4. passport names vs the card first name (soft: Thai nicknames often differ → "check")
-- The outcome goes into kr8_traveller_checks: suggestion PASS / FAIL / CHECK + the matching refuse reason.
-- NOTHING IS DECIDED AUTOMATICALLY: the founder still taps Approve / Refuse on the admin card. The passport photo is still
-- deleted at the decision (0138, unchanged).
-- PRIVACY: no MRZ text, no passport number, no birth date, no passport name is stored: only the nationality / issuing codes,
-- pass/fail flags, the face similarity and the name-match RESULT.
-- COST: one OCR call + one CompareFaces call per request (≈ US$0.0025); a request is checked once (one retry after an AWS error).
--
-- ADDITIVE and RE-RUNNABLE. New: table kr8_traveller_checks, functions kr8_traveller_check_todo / _record (service only),
-- kr8_traveller_check_kick (trigger + 5-min cron safety net), kr8_admin_traveller_checks (admin). No existing function changes.
-- UNDO: 0187_traveller_prechecks_UNDO.sql
begin;

create table if not exists public.kr8_traveller_checks (
  request_id   uuid primary key references public.kr8_traveller_requests(id) on delete cascade,
  user_id      uuid not null,
  state        text not null default 'running' check (state in ('running', 'done', 'error')),
  attempts     int  not null default 1,
  started_at   timestamptz not null default now(),
  checked_at   timestamptz,
  ocr          text check (ocr is null or ocr in ('textract', 'rekognition')),
  mrz_found    boolean,
  mrz_valid    boolean,                                   -- check digits add up (no number stored)
  issuing      text check (issuing is null or issuing ~ '^[A-Z]{2,3}$'),
  nationality  text check (nationality is null or nationality ~ '^[A-Z]{2,3}$'),
  is_thai      boolean,
  face_ref     text check (face_ref is null or face_ref in ('selfie', 'card', 'none')),
  face_result  text check (face_result is null or face_result in ('ok', 'unsure', 'different', 'no_face_passport', 'no_reference', 'skipped', 'error')),
  face_sim     numeric(4,1) check (face_sim is null or face_sim between 0 and 100),
  name_result  text check (name_result is null or name_result in ('match', 'close', 'differs', 'thai_script', 'unknown')),
  suggestion   text check (suggestion is null or suggestion in ('pass', 'fail', 'check')),
  fail_code    text check (fail_code is null or fail_code in ('not_passport', 'thai', 'photo')),
  errors       text[] not null default '{}',
  aws_calls    int not null default 0
);
create index if not exists kr8_traveller_checks_state on public.kr8_traveller_checks (state, started_at);
alter table public.kr8_traveller_checks enable row level security;
revoke all on public.kr8_traveller_checks from public, anon, authenticated;

/** robot: claim up to p_limit pending requests that have no check yet (or one errored / stuck try, at most 2 tries in all).
 *  The claim is the insert itself, so two robot runs can never check the same request twice. */
create or replace function public.kr8_traveller_check_todo(p_limit int default 5)
returns table (request_id uuid, user_id uuid, passport_path text, first_name text, photo text, selfie_path text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  for r in
    select t.id, t.user_id from public.kr8_traveller_requests t
      left join public.kr8_traveller_checks c on c.request_id = t.id
     where t.status = 'pending' and t.passport_path is not null and t.created_at > now() - interval '3 days'
       and (c.request_id is null
            or (c.attempts < 2 and (c.state = 'error' or (c.state = 'running' and c.started_at < now() - interval '10 minutes'))))
     order by t.created_at limit greatest(1, least(coalesce(p_limit, 5), 10))
     for update of t skip locked
  loop
    insert into public.kr8_traveller_checks (request_id, user_id) values (r.id, r.user_id)
    on conflict on constraint kr8_traveller_checks_pkey do update
      set state = 'running', attempts = kr8_traveller_checks.attempts + 1, started_at = now(), errors = '{}'
      where kr8_traveller_checks.attempts < 2 and kr8_traveller_checks.state <> 'done';
    if found then
      return query
        select t.id, t.user_id, t.passport_path, m.first_name, m.photo,
               (select v.selfie_path from public.kr8_verifications v
                 where v.user_id = t.user_id and v.status = 'approved' and v.selfie_path is not null and v.selfie_deleted_at is null
                 order by coalesce(v.reviewed_at, v.created_at) desc limit 1)
          from public.kr8_traveller_requests t left join public.kr8_members m on m.user_id = t.user_id
         where t.id = r.id;
    end if;
  end loop;
end $$;

/** robot: save the outcome. Only whitelisted fields are kept (no MRZ / number / names ever reach the database). */
create or replace function public.kr8_traveller_check_record(p_request uuid, p_res jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare e text[];
begin
  select coalesce(array_agg(left(x, 40)), '{}') into e from jsonb_array_elements_text(coalesce(p_res->'errors', '[]'::jsonb)) x;
  update public.kr8_traveller_checks set
    state       = case when p_res->>'suggestion' is null then 'error' else 'done' end,
    checked_at  = now(),
    ocr         = p_res->>'ocr',
    mrz_found   = (p_res->>'mrz_found')::boolean,
    mrz_valid   = (p_res->>'mrz_valid')::boolean,
    issuing     = nullif(p_res->>'issuing', ''),
    nationality = nullif(p_res->>'nationality', ''),
    is_thai     = (p_res->>'is_thai')::boolean,
    face_ref    = p_res->>'face_ref',
    face_result = p_res->>'face_result',
    face_sim    = (p_res->>'face_sim')::numeric,
    name_result = p_res->>'name_result',
    suggestion  = p_res->>'suggestion',
    fail_code   = nullif(p_res->>'fail_code', ''),
    errors      = e,
    aws_calls   = aws_calls + coalesce((p_res->>'aws_calls')::int, 0)
  where request_id = p_request;
end $$;

/** wake the robot (async pg_net, never blocks or breaks the member's request). Only when something is waiting. */
create or replace function public.kr8_traveller_check_kick() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare k text;
begin
  if not exists (select 1 from public.kr8_traveller_requests t left join public.kr8_traveller_checks c on c.request_id = t.id
                  where t.status = 'pending' and t.passport_path is not null and t.created_at > now() - interval '3 days'
                    and (c.request_id is null or (c.attempts < 2 and (c.state = 'error' or (c.state = 'running' and c.started_at < now() - interval '10 minutes'))))) then
    return;
  end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'face_robot_key' limit 1;
  if k is null or length(k) < 32 then return; end if;
  perform net.http_post(
    url := 'https://pedxoxpammnyfnizljyj.supabase.co/functions/v1/face-check-aws',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kring-robot', k),
    body := '{"action":"traveller_scan","limit":5}'::jsonb,
    timeout_milliseconds := 60000);
exception when others then null;
end $$;

create or replace function public.kr8_traveller_check_on_new() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'pending' and new.passport_path is not null then perform public.kr8_traveller_check_kick(); end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists kr8_traveller_check_new on public.kr8_traveller_requests;
create trigger kr8_traveller_check_new after insert on public.kr8_traveller_requests
  for each row execute function public.kr8_traveller_check_on_new();

/** admin card: the checks of the given requests (all pending ones when null) */
create or replace function public.kr8_admin_traveller_checks(p_ids uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('request_id', c.request_id, 'state', c.state, 'checked_at', c.checked_at, 'mrz_found', c.mrz_found,
      'mrz_valid', c.mrz_valid, 'issuing', c.issuing, 'nationality', c.nationality, 'is_thai', c.is_thai, 'face_ref', c.face_ref,
      'face_result', c.face_result, 'face_sim', c.face_sim, 'name_result', c.name_result, 'suggestion', c.suggestion,
      'fail_code', c.fail_code, 'errors', to_jsonb(c.errors), 'attempts', c.attempts))
      from public.kr8_traveller_checks c join public.kr8_traveller_requests t on t.id = c.request_id
     where (p_ids is null and t.status = 'pending') or c.request_id = any (p_ids)), '[]'::jsonb);
end $$;

revoke all on function public.kr8_traveller_check_todo(int), public.kr8_traveller_check_record(uuid, jsonb), public.kr8_traveller_check_kick(),
  public.kr8_traveller_check_on_new() from public, anon, authenticated;
grant execute on function public.kr8_traveller_check_todo(int), public.kr8_traveller_check_record(uuid, jsonb) to service_role;
revoke all on function public.kr8_admin_traveller_checks(uuid[]) from public, anon;
grant execute on function public.kr8_admin_traveller_checks(uuid[]) to authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'kr8_traveller_checks';
    perform cron.schedule('kr8_traveller_checks', '4-59/5 * * * *', 'select public.kr8_traveller_check_kick()');
  end if;
end $$;

commit;
