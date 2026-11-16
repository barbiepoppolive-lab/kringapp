-- 0062 · SECURITY AUDIT 16 Nov (findings H1, M1, M3, L1). WRITTEN, NOT APPLIED. Apply on top of 0060 (and 0061 if shipped).
-- Same function names, arguments and return types as before, so the live app keeps working before and after.
--   H1  kr8_profile: a signed-out caller no longer gets "online" or "I'm here" (a blocked person could sign out and watch them).
--   M1  kr8_save_card: a card photo can only be an uploaded image or a LINE / Kring-storage https link (no tracking pixels on
--       other sites); a new card defaults to who = 'local' (was 'traveller', which doubles that account's likes and saves).
--   M3  delete account: every file in the member's kr8-verify / kr8-reels / kr8-ask folders is queued in kr8_storage_trash.
--       Selfie files are handed to the existing admin "remove old selfies" step (kr8_admin_verify_files_due / _mark_selfies_deleted);
--       Reel / Ask files come back from kr8_admin_storage_trash (the admin page needs a 6-line change to remove them; see report).
--       Unreviewed selfies are now also removed 30 days after upload (they were kept forever).
--   L1  legacy views / config no longer readable by visitors or members.
-- UNDO: re-run the function bodies from 0047 / 0048 / 0031 / 0050 (git show 088aa59:supabase/migrations/...); drop table kr8_storage_trash.
begin;

create table if not exists public.kr8_storage_trash (
  id uuid primary key default gen_random_uuid(),
  bucket text not null, name text not null, user_id uuid, queued_at timestamptz not null default now(), removed_at timestamptz,
  unique (bucket, name)
);
alter table public.kr8_storage_trash enable row level security;
revoke all on public.kr8_storage_trash from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.kr8_profile(p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); tgt uuid := coalesce(p_user, auth.uid()); m public.kr8_members; r jsonb;
begin
  if tgt is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into m from public.kr8_members where user_id = tgt;
  if m.user_id is null or (uid is not null and tgt <> uid and public.kr8_is_blocked(uid, tgt)) then raise exception 'KR8_NO_PERSON'; end if;
  select jsonb_build_object(
    'user_id', m.user_id, 'first_name', m.first_name,
    'photo', case when uid is null then null else m.photo end,
    'langs', m.langs, 'bio', m.bio, 'area', m.area, 'who', m.who, 'verified', m.verified, 'ig_handle', m.ig_handle,
    'interests', m.interests, 'member_no', 'KR ' || lpad(((('x' || substr(md5(m.user_id::text), 1, 8))::bit(32)::bigint % 9000) + 1000)::text, 4, '0'),
    'online', case when uid is null then null else coalesce(m.last_active_at > now() - interval '5 minutes', false) end,
    'here', case when uid is null then null else coalesce(m.here_until > now(), false) end,
    'mine', uid is not null and tgt = uid,
    'level', public.kr8_level_of(tgt),
    'followers', (select count(*) from public.kr8_follows f where f.followee = tgt),
    'following', (select count(*) from public.kr8_follows f where f.follower = tgt),
    'likes', (select coalesce(sum(p.likes_count), 0) from public.kr8_posts p where p.author = tgt and p.kind = 'reel' and not p.hidden),
    'gifts', (select count(*) from public.kr8_reel_awards a join public.kr8_posts p on p.id = a.reel_id where p.author = tgt),
    'i_follow', uid is not null and exists (select 1 from public.kr8_follows f where f.follower = uid and f.followee = tgt),
    'follows_me', uid is not null and exists (select 1 from public.kr8_follows f where f.follower = tgt and f.followee = uid),
    'reels', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'poster_path', p.poster_path, 'likes', p.likes_count,
                                                           'status', p.status) order by p.created_at desc)
                       from (select * from public.kr8_posts p where p.author = tgt and p.kind = 'reel' and not p.hidden
                               and (p.status = 'approved' or (uid is not null and tgt = uid))
                             order by p.created_at desc limit 12) p), '[]'::jsonb)
  ) into r;
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.kr8_save_card(p_first_name text, p_langs text[], p_bio text, p_area text, p_who text, p_photo text DEFAULT NULL::text, p_age_ok boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); existed boolean;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select exists(select 1 from public.kr8_members where user_id = uid) into existed;
  if not existed and not coalesce(p_age_ok, false) then raise exception 'KR8_AGE_CONFIRM'; end if;
  if not public.kr8_text_ok(p_first_name, 30) then raise exception 'KR8_BAD_NAME'; end if;
  if coalesce(p_bio, '') <> '' and not public.kr8_text_ok(p_bio, 80) then raise exception 'KR8_BAD_BIO'; end if;
  if p_langs is null or cardinality(p_langs) not between 1 and 6
     or not (select array(select distinct upper(x) from unnest(p_langs) x)) <@ array['TH','EN','ZH','HI','JA','KO','FR','DE','ES','RU','MS','ID','VI','AR']
     then raise exception 'KR8_BAD_LANGS'; end if;
  if not public.kr8_area_ok(coalesce(p_area, 'Bangkok')) then raise exception 'KR8_BAD_AREA'; end if;
  if coalesce(p_who, 'local') not in ('local','traveller') then raise exception 'KR8_BAD_WHO'; end if;
  if nullif(p_photo, '') is not null and (p_photo !~ '^(data:image/(jpeg|png|webp);base64,|https://(profile\.line-scdn\.net|obs\.line-scdn\.net|pedxoxpammnyfnizljyj\.supabase\.co)/)' or length(p_photo) > 120000)
     then raise exception 'KR8_BAD_PHOTO'; end if;
  insert into public.kr8_members (user_id, first_name, langs, bio, area, who, photo, age_ok_at)
  values (uid, btrim(p_first_name), (select array(select distinct upper(x) from unnest(p_langs) x)), coalesce(btrim(p_bio), ''),
          coalesce(p_area, 'Bangkok'), coalesce(p_who, 'local'), nullif(p_photo, ''), now())
  on conflict (user_id) do update set
    first_name = excluded.first_name, langs = excluded.langs, bio = excluded.bio, area = excluded.area, who = excluded.who,
    photo = coalesce(excluded.photo, public.kr8_members.photo), updated_at = now();
  return public.kr8_me();
end $function$;

CREATE OR REPLACE FUNCTION public.kr8_admin_verify_files_due()
 RETURNS TABLE(id uuid, selfie_path text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return query select v.id, v.selfie_path from public.kr8_verifications v
               where v.selfie_path is not null and v.selfie_deleted_at is null
                 and coalesce(v.reviewed_at, v.created_at) < now() - interval '30 days'
               union all
               select t.id, t.name from public.kr8_storage_trash t where t.bucket = 'kr8-verify' and t.removed_at is null;
end $function$;

CREATE OR REPLACE FUNCTION public.kr8_admin_mark_selfies_deleted(p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n int;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  update public.kr8_verifications set selfie_deleted_at = now(), selfie_path = null
   where id = any(p_ids) and selfie_deleted_at is null and coalesce(reviewed_at, created_at) < now() - interval '30 days';
  get diagnostics n = row_count;
  update public.kr8_storage_trash set removed_at = now() where id = any(p_ids) and bucket = 'kr8-verify' and removed_at is null;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.kr8_delete_me()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  -- files are not removed by deleting rows: queue every file in this member's folders for the admin page to remove
  insert into public.kr8_storage_trash (bucket, name, user_id)
  select o.bucket_id, o.name, uid from storage.objects o
  where o.bucket_id in ('kr8-verify', 'kr8-reels', 'kr8-ask') and split_part(o.name, '/', 1) = uid::text
  on conflict do nothing;
  delete from auth.users where id = uid;
end $function$;

create or replace function public.kr8_admin_storage_trash()
returns table(id uuid, bucket text, name text) language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return query select t.id, t.bucket, t.name from public.kr8_storage_trash t where t.removed_at is null and t.bucket <> 'kr8-verify' order by t.queued_at limit 500;
end $$;
create or replace function public.kr8_admin_storage_trash_done(p_ids uuid[])
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  update public.kr8_storage_trash set removed_at = now() where id = any(p_ids) and removed_at is null;
  get diagnostics n = row_count; return n;
end $$;
revoke all on function public.kr8_admin_storage_trash() from public, anon;
revoke all on function public.kr8_admin_storage_trash_done(uuid[]) from public, anon;
grant execute on function public.kr8_admin_storage_trash() to authenticated;
grant execute on function public.kr8_admin_storage_trash_done(uuid[]) to authenticated;

-- L1: legacy (Chon / kr6 / outreach) objects nobody's app reads any more
do $$ declare o text; begin
  foreach o in array array['ob_lead_snapshot', 'public_host_cards', 'kr6_host_live_activities', 'config'] loop
    if to_regclass('public.' || o) is not null then execute format('revoke all on public.%I from anon, authenticated', o); end if;
  end loop;
  if to_regclass('public.ob_lead_snapshot') is not null then execute 'alter view public.ob_lead_snapshot set (security_invoker = true)'; end if;
end $$;

commit;
