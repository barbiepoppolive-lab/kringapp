-- 0138 · Traveller tag needs a passport check (founder decision 19 Nov 2026). WRITTEN, NOT APPLIED.
--
-- Why: a verified traveller's like / save counts ×2 (kr8_reel_scores, traveller_mult), and members were picking
-- "Visiting Bangkok" on their own card to farm Rings. All real traveller cards were reset to 'local' by hand on 19 Nov.
-- From now on only the Kring team can make a card a traveller, after looking at ONE photo of the passport photo page.
--
-- ADDITIVE and RE-RUNNABLE. Nothing is dropped or renamed; no existing function changes shape or body.
--   · new table  kr8_traveller_requests (one row per request; RLS on, no member access: reads / writes through functions)
--   · new PRIVATE bucket kr8-passport: a member may only UPLOAD into <own user id>/…; nobody but kr8_is_admin() can read or
--     delete (same idea as kr8-verify). No passport NUMBER is stored anywhere: only the photo.
--     The photo is queued for deletion THE MOMENT the team decides (approve or refuse); a request nobody decided within 30
--     days expires and its photo goes too; an upload that never became a request is removed after a day. Never shown to members.
--   · guard   kr8_traveller_guard_trg  BEFORE INSERT / UPDATE OF who ON kr8_members: a member's own write (kr8_save_card, an old
--     app build, a direct update) can never turn who into 'traveller'. The value quietly stays what it was ('local' for a new
--     card), so old app builds still save the card. Allowed only when
--       (a) the row was already 'traveller' (real travellers such as #68 Iceman, ghost / demo rows: left exactly as they are).
--           kr8_save_card is an INSERT … ON CONFLICT DO UPDATE, so the INSERT step also looks at the existing row — otherwise
--           a traveller editing their card would quietly drop to 'local'.
--       (b) the change comes from kr8_admin_traveller_decide (session flag kr8.traveller_set AND the caller is an admin), or
--       (c) there is no signed-in member at all (SQL editor, service role, cron seeding demo / ghost rows).
--     Moving back to 'local' is always allowed, and sticks (an old approval never turns the tag back on by itself).
--   · member  kr8_request_traveller(path), kr8_my_traveller()
--   · admin   kr8_admin_traveller_requests(status), kr8_admin_traveller_decide(id, approve, reason_code, note) (kr8_is_admin()),
--             kr8_admin_passport_files_due(), kr8_admin_mark_passports_deleted(ids)   (same pattern as the kr8-verify selfies)
--   · kr8_passport_cleanup_kick(): right after every decision / replaced photo AND nightly (pg_cron 'kr8_passport_cleanup',
--     20:23 UTC): kr8_passport_expire() queues what is due in kr8_storage_trash and the kr8-cleanup edge function removes
--     the files (kr8_service_passport_trash / _done). The admin page's "remove old files" step removes them too (same as selfies).
--   · account deleted → the request row goes (FK cascade) and its file is queued in kr8_storage_trash (AFTER DELETE trigger).
--   · member notified on the decision through the existing push outbox (kr8_push_queue kind 'admin'; never blocks the decision).
--
-- ORDER: apply this, then deploy the app build with the "I'm a traveller" screen and the admin "Traveller check" card,
-- then (optional) redeploy supabase/functions/kr8-cleanup so the nightly job also removes passport files without the admin page.
-- Old app builds keep working: their "Visiting Bangkok" button just no longer changes anything on the server.
--
-- UNDO (safe at any time):
--   begin;
--   drop trigger if exists kr8_traveller_guard on public.kr8_members;
--   drop trigger if exists kr8_traveller_req_gone on public.kr8_traveller_requests;
--   do $$ begin if exists (select 1 from pg_extension where extname = 'pg_cron') then
--     perform cron.unschedule(jobid) from cron.job where jobname = 'kr8_passport_cleanup'; end if; end $$;
--   drop function if exists public.kr8_traveller_guard_trg(), public.kr8_traveller_req_gone_trg(), public.kr8_request_traveller(text),
--     public.kr8_my_traveller(), public.kr8_admin_traveller_requests(text), public.kr8_admin_traveller_decide(uuid, boolean, text, text),
--     public.kr8_admin_passport_files_due(), public.kr8_admin_mark_passports_deleted(uuid[]), public.kr8_passport_expire(),
--     public.kr8_passport_cleanup_kick(), public.kr8_service_passport_trash(), public.kr8_service_passport_trash_done(uuid[]);
--   drop policy if exists kr8_passport_upload on storage.objects; drop policy if exists kr8_passport_admin_read on storage.objects;
--   drop policy if exists kr8_passport_admin_delete on storage.objects;
--   -- remove the files first (admin page "remove old files" or Storage UI), then: delete from storage.buckets where id = 'kr8-passport';
--   drop table if exists public.kr8_traveller_requests;
--   commit;
--   (Cards already approved stay who = 'traveller'; set them back with: update public.kr8_members set who = 'local' where …)

begin;

-- ───────────── 1. requests ─────────────
create table if not exists public.kr8_traveller_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  passport_path   text,                                   -- <user id>/<uuid>.jpg in kr8-passport; null once the file is gone
  status          text not null default 'pending' check (status in ('pending', 'approved', 'refused', 'replaced', 'expired')),
  reason_code     text check (reason_code is null or reason_code in ('unclear', 'not_passport', 'thai', 'name', 'photo', 'other')),
  reason_note     text check (reason_note is null or length(reason_note) <= 200),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  decided_by      uuid,
  file_deleted_at timestamptz
);
create index if not exists kr8_traveller_requests_user on public.kr8_traveller_requests (user_id, created_at desc);
create index if not exists kr8_traveller_requests_open on public.kr8_traveller_requests (created_at) where status = 'pending';
create unique index if not exists kr8_traveller_requests_one_open on public.kr8_traveller_requests (user_id) where status = 'pending';
alter table public.kr8_traveller_requests drop constraint if exists kr8_traveller_requests_status_check;
alter table public.kr8_traveller_requests add constraint kr8_traveller_requests_status_check
  check (status in ('pending', 'approved', 'refused', 'replaced', 'expired'));
alter table public.kr8_traveller_requests enable row level security;
revoke all on public.kr8_traveller_requests from public, anon, authenticated;

-- ───────────── 2. private bucket ─────────────
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('kr8-passport', 'kr8-passport', false, 3145728, array['image/jpeg'])
    on conflict (id) do nothing;
  end if;
  if to_regclass('storage.objects') is not null then
    begin
      if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'kr8_passport_upload') then
        create policy kr8_passport_upload on storage.objects for insert to authenticated
          with check (bucket_id = 'kr8-passport' and (storage.foldername(name))[1] = auth.uid()::text and public.kr8_has_card());
      end if;
      if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'kr8_passport_admin_read') then
        create policy kr8_passport_admin_read on storage.objects for select to authenticated
          using (bucket_id = 'kr8-passport' and public.kr8_is_admin());
      end if;
      if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'kr8_passport_admin_delete') then
        create policy kr8_passport_admin_delete on storage.objects for delete to authenticated
          using (bucket_id = 'kr8-passport' and public.kr8_is_admin());
      end if;
    exception when insufficient_privilege then
      raise warning '0138: storage policies need the dashboard owner; add kr8_passport_upload / _admin_read / _admin_delete there';
    end;
  end if;
end $$;

-- ───────────── 3. guard on kr8_members.who ─────────────
create or replace function public.kr8_traveller_guard_trg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.who is distinct from 'traveller' then return new; end if;                          -- 'local' is always fine
  if tg_op = 'UPDATE' and old.who = 'traveller' then return new; end if;                      -- unchanged (#68, ghost / demo / approved)
  -- kr8_save_card upserts: the INSERT step must keep an existing traveller (else ON CONFLICT writes excluded.who = 'local')
  if tg_op = 'INSERT' and exists (select 1 from public.kr8_members m where m.user_id = new.user_id and m.who = 'traveller') then return new; end if;
  if coalesce(current_setting('kr8.traveller_set', true), '') = '1' and public.kr8_is_admin() then return new; end if;  -- the team's decision
  if auth.uid() is null then return new; end if;                                              -- no member signed in: SQL / service / cron
  new.who := case when tg_op = 'UPDATE' then coalesce(old.who, 'local') else 'local' end;
  return new;
end $$;
revoke all on function public.kr8_traveller_guard_trg() from public, anon, authenticated;
drop trigger if exists kr8_traveller_guard on public.kr8_members;
create trigger kr8_traveller_guard before insert or update of who on public.kr8_members
  for each row execute function public.kr8_traveller_guard_trg();

-- a deleted account (or a removed row) never leaves its passport file behind
create or replace function public.kr8_traveller_req_gone_trg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.passport_path is not null and old.file_deleted_at is null then
    insert into public.kr8_storage_trash (bucket, name, user_id) values ('kr8-passport', old.passport_path, null) on conflict (bucket, name) do nothing;
  end if;
  return old;
exception when others then return old;
end $$;
revoke all on function public.kr8_traveller_req_gone_trg() from public, anon, authenticated;
drop trigger if exists kr8_traveller_req_gone on public.kr8_traveller_requests;
create trigger kr8_traveller_req_gone after delete on public.kr8_traveller_requests
  for each row execute function public.kr8_traveller_req_gone_trg();

-- ───────────── 4. member ─────────────
/** The member's traveller state: who on the card + the latest request (null when none). */
create or replace function public.kr8_my_traveller()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); w text; r public.kr8_traveller_requests;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select m.who into w from public.kr8_members m where m.user_id = uid;
  select * into r from public.kr8_traveller_requests t where t.user_id = uid and t.status <> 'replaced' order by t.created_at desc limit 1;
  return jsonb_build_object('who', coalesce(w, 'local'),
    'request', case when r.id is null then null else jsonb_build_object('id', r.id, 'status', r.status, 'reason_code', r.reason_code,
      'reason_note', case when r.reason_code = 'other' then r.reason_note else null end, 'at', r.created_at, 'decided_at', r.decided_at) end);
end $$;

/** "I'm a traveller": the photo was uploaded to kr8-passport/<my id>/<uuid>.jpg; this files the request for the team.
 *  A new photo while one is still waiting replaces it (the old file is queued for deletion at once). 3 a day at most. */
create or replace function public.kr8_request_traveller(p_path text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); m public.kr8_members; prev public.kr8_traveller_requests;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into m from public.kr8_members where user_id = uid;
  if m.user_id is null then raise exception 'KR8_NO_CARD'; end if;
  if m.who = 'traveller' then raise exception 'KR8_ALREADY_TRAVELLER'; end if;
  if p_path is null or p_path !~ ('^' || uid::text || '/[0-9a-f-]{36}\.jpg$') then raise exception 'KR8_BAD_FILE'; end if;
  if to_regclass('storage.objects') is not null
     and not exists (select 1 from storage.objects o where o.bucket_id = 'kr8-passport' and o.name = p_path) then
    raise exception 'KR8_BAD_FILE';
  end if;
  if (select count(*) from public.kr8_traveller_requests t where t.user_id = uid and t.created_at > now() - interval '24 hours') >= 3 then
    raise exception 'KR8_SLOW_DOWN';
  end if;
  for prev in select * from public.kr8_traveller_requests t where t.user_id = uid and t.status = 'pending' for update loop
    if prev.passport_path is not null then
      insert into public.kr8_storage_trash (bucket, name, user_id) values ('kr8-passport', prev.passport_path, uid) on conflict (bucket, name) do nothing;
    end if;
    update public.kr8_traveller_requests set status = 'replaced', decided_at = now(), passport_path = null, file_deleted_at = now() where id = prev.id;
  end loop;
  insert into public.kr8_traveller_requests (user_id, passport_path) values (uid, p_path);
  perform public.kr8_passport_cleanup_kick();   -- a replaced photo goes at once (never raises)
  return public.kr8_my_traveller();
end $$;

-- ───────────── 5. admin ─────────────
create or replace function public.kr8_admin_traveller_requests(p_status text default 'pending')
returns table (id uuid, user_id uuid, member_no int, first_name text, who text, verified boolean, passport_path text, status text,
               reason_code text, reason_note text, created_at timestamptz, decided_at timestamptz, file_deleted_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return query
    select r.id, r.user_id, m.member_no::int, m.first_name, m.who, coalesce(m.verified, false), r.passport_path, r.status,
           r.reason_code, r.reason_note, r.created_at, r.decided_at, r.file_deleted_at
      from public.kr8_traveller_requests r left join public.kr8_members m on m.user_id = r.user_id
     where (p_status is null or p_status = 'all' or r.status = p_status)
     order by r.created_at
     limit 200;
end $$;

/** Approve → the card becomes who = 'traveller'. Refuse → a reason the member sees (code, plus a short note for 'other'). */
create or replace function public.kr8_admin_traveller_decide(p_id uuid, p_approve boolean, p_reason_code text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.kr8_traveller_requests; code text := nullif(btrim(coalesce(p_reason_code, '')), ''); note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_approve is null then raise exception 'KR8_BAD_DECISION'; end if;
  select * into r from public.kr8_traveller_requests where id = p_id for update;
  if r.id is null then raise exception 'KR8_NO_REQUEST'; end if;
  if r.status <> 'pending' then raise exception 'KR8_ALREADY_DECIDED'; end if;
  if not p_approve then
    if code is null or code not in ('unclear', 'not_passport', 'thai', 'name', 'photo', 'other') then raise exception 'KR8_NEED_REASON'; end if;
    if code = 'other' and note is null then raise exception 'KR8_NEED_REASON'; end if;
    if note is not null and length(note) > 200 then raise exception 'KR8_BAD_TEXT'; end if;
  end if;
  -- the passport photo is not needed once the team has decided: queued for deletion now, removed by kr8-cleanup right after
  if r.passport_path is not null then
    insert into public.kr8_storage_trash (bucket, name, user_id) values ('kr8-passport', r.passport_path, r.user_id) on conflict (bucket, name) do nothing;
  end if;
  update public.kr8_traveller_requests
     set status = case when p_approve then 'approved' else 'refused' end, decided_at = now(), decided_by = auth.uid(),
         reason_code = case when p_approve then null else code end, reason_note = case when p_approve then null else note end,
         passport_path = null, file_deleted_at = case when r.passport_path is not null then now() else file_deleted_at end
   where id = r.id;
  if p_approve then
    perform set_config('kr8.traveller_set', '1', true);
    update public.kr8_members set who = 'traveller', updated_at = now() where user_id = r.user_id;
    perform set_config('kr8.traveller_set', '', true);
  end if;
  -- the member's ding (English: the traveller tag is for non-Thai passports); never blocks the decision
  begin
    perform public.kr8_push_queue('admin', r.user_id, false,
      case when p_approve then 'You’re a verified traveller ✈' else 'Your traveller check' end,
      case when p_approve then 'Your likes and saves on Kring now count double.' else 'We couldn’t approve it this time. Open Kring to see why.' end,
      '/app/?tab=me&open=traveller', r.id, true);
  exception when others then null;
  end;
  perform public.kr8_passport_cleanup_kick();   -- remove the photo now, not tonight (never raises)
  return jsonb_build_object('ok', true, 'id', r.id, 'user_id', r.user_id, 'status', case when p_approve then 'approved' else 'refused' end);
end $$;

-- ───────────── 6. deletion: at the decision; 30 days for an undecided request; a day for an orphan upload ─────────────
create or replace function public.kr8_admin_passport_files_due()
returns table (id uuid, passport_path text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  perform public.kr8_passport_expire();
  return query select t.id, t.name from public.kr8_storage_trash t where t.bucket = 'kr8-passport' and t.removed_at is null;
end $$;

create or replace function public.kr8_admin_mark_passports_deleted(p_ids uuid[])
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare k int;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  update public.kr8_storage_trash set removed_at = now() where id = any (coalesce(p_ids, '{}')) and bucket = 'kr8-passport' and removed_at is null;
  get diagnostics k = row_count;
  return k;
end $$;

/** Queues every passport file that must go: (1) a decided request still holding a path (safety net), (2) a request nobody
 *  decided within 30 days (→ 'expired'; the member can send a new photo), (3) a file in the bucket older than a day that no
 *  request points to (upload finished, request never filed). Returns how many it queued. */
create or replace function public.kr8_passport_expire()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare n int := 0; k int := 0;
begin
  insert into public.kr8_storage_trash (bucket, name, user_id)
  select 'kr8-passport', r.passport_path, r.user_id from public.kr8_traveller_requests r
   where r.passport_path is not null and (r.status <> 'pending' or r.created_at < now() - interval '30 days')
  on conflict (bucket, name) do nothing;
  update public.kr8_traveller_requests
     set status = case when status = 'pending' then 'expired' else status end,
         decided_at = coalesce(decided_at, now()), file_deleted_at = now(), passport_path = null
   where passport_path is not null and (status <> 'pending' or created_at < now() - interval '30 days');
  get diagnostics n = row_count;
  if to_regclass('storage.objects') is not null then
    insert into public.kr8_storage_trash (bucket, name, user_id)
    select 'kr8-passport', o.name, null from storage.objects o
     where o.bucket_id = 'kr8-passport' and o.created_at < now() - interval '1 day'
       and not exists (select 1 from public.kr8_traveller_requests r where r.passport_path = o.name)
    on conflict (bucket, name) do nothing;
    get diagnostics k = row_count;
  end if;
  return n + k;
end $$;

/** for the kr8-cleanup edge function only (service key) */
create or replace function public.kr8_service_passport_trash() returns table (id uuid, name text)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.id, t.name from public.kr8_storage_trash t where t.bucket = 'kr8-passport' and t.removed_at is null order by t.queued_at limit 200
$$;
create or replace function public.kr8_service_passport_trash_done(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  update public.kr8_storage_trash set removed_at = now() where id = any (coalesce(p_ids, '{}')) and bucket = 'kr8-passport' and removed_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

/** the nightly job: queue what is due, then ask kr8-cleanup to remove the files. Never raises. */
create or replace function public.kr8_passport_cleanup_kick() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int := 0; k text;
begin
  n := public.kr8_passport_expire();
  if to_regclass('vault.decrypted_secrets') is not null then
    select decrypted_secret into k from vault.decrypted_secrets where name = 'notify_hook_secret' limit 1;
  end if;
  if k is not null and exists (select 1 from public.kr8_storage_trash where bucket = 'kr8-passport' and removed_at is null) then
    perform net.http_post(
      url := 'https://pedxoxpammnyfnizljyj.supabase.co/functions/v1/kr8-cleanup',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', k),
      body := '{"job":"passport_trash"}'::jsonb, timeout_milliseconds := 30000);
  end if;
  return n;
exception when others then
  return n;
end $$;

-- ───────────── 7. grants ─────────────
revoke all on function public.kr8_my_traveller(), public.kr8_request_traveller(text) from public, anon;
grant execute on function public.kr8_my_traveller(), public.kr8_request_traveller(text) to authenticated;
revoke all on function public.kr8_admin_traveller_requests(text), public.kr8_admin_traveller_decide(uuid, boolean, text, text),
  public.kr8_admin_passport_files_due(), public.kr8_admin_mark_passports_deleted(uuid[]) from public, anon;
grant execute on function public.kr8_admin_traveller_requests(text), public.kr8_admin_traveller_decide(uuid, boolean, text, text),
  public.kr8_admin_passport_files_due(), public.kr8_admin_mark_passports_deleted(uuid[]) to authenticated;
revoke all on function public.kr8_passport_expire(), public.kr8_passport_cleanup_kick(),
  public.kr8_service_passport_trash(), public.kr8_service_passport_trash_done(uuid[]) from public, anon, authenticated;
grant execute on function public.kr8_service_passport_trash(), public.kr8_service_passport_trash_done(uuid[]) to service_role;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'kr8_passport_cleanup';
    perform cron.schedule('kr8_passport_cleanup', '23 20 * * *', 'select public.kr8_passport_cleanup_kick()');
  end if;
end $$;

commit;
