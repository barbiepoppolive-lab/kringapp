-- 0070 · Fixes from the 50-user audit, 16 Nov 2026 (P0-3, P1-1, P2-3, P2-11). WRITTEN, NOT APPLIED.
-- Apply after 0065 (and after 0066 / 0067 from the dupguard branch if those go first: nothing here touches their objects).
-- ADDITIVE + RE-RUNNABLE: one new column, three new functions, five functions redefined with the SAME arguments and return types
-- (kr8_delete_me, kr8_save_card, kr8_report, kr8_member_reels, kr8_my_activity, kr8_admin_member_list), so the live app keeps
-- working before and after the new app build.
--
--   P0-3  Deleting your own card must never delete an ADMIN / staff / Kring Team sign-in (the 16 Nov lock-out).
--         kr8_delete_me2() returns {kept_sign_in}. For an admin email (kr8_admin_emails), a kr6_staff member or a
--         kr8_team_accounts row (0066), only the member card and the member's own content go; auth.users, the LINE link and
--         everything the admin did as admin (reviews, approvals) stay. Everyone else: unchanged (whole account deleted).
--         kr8_delete_me() (the old name) now runs the same code.
--   P1-1  A NEW card must carry an uploaded photo (a data:image JPEG/PNG/WebP of at least 1,500 characters, or a file in Kring's
--         own storage). A LINE / other https link or no photo is refused with KR8_PHOTO_NEEDED. Existing members are untouched:
--         they can still save their card without sending a photo (the saved one is kept).
--         New column kr8_members.photo_check ('ok' | 'unchecked'): the phone reports whether its face check ran
--         (kr8_note_photo_check). 'unchecked' cards are flagged in the admin Members list so someone can look by eye.
--   P2-3  Hiding a Reel with a note: the member now sees their hidden Reel on their own grid with the reason
--         (kr8_member_reels, own reels only), an Activity line "Your Reel was hidden · <reason>" (kr8_my_activity), and a
--         phone ding with the reason (trigger kr8_push_reel_hidden → the 0059 ding queue, app notification only, no LINE).
--   P2-11 One open report per reporter per person (and per post / chat): repeats are ignored instead of piling up.
--
-- UNDO: re-run kr8_delete_me / kr8_save_card from 0062, kr8_report from 0022, kr8_member_reels from 0048, kr8_my_activity from 0030,
--       kr8_admin_member_list from 0053; drop function kr8_delete_me2(), kr8_note_photo_check(boolean), kr8_is_protected_login(uuid);
--       drop trigger kr8_push_reel_hidden on kr8_posts; drop function kr8_push_on_reel_hidden(); drop function kr8_admin_member_who(uuid[]);
--       alter table kr8_members drop column photo_check.
begin;

-- ───────────── P0-3: admin / staff / team sign-ins survive "Delete account" ─────────────
create or replace function public.kr8_is_protected_login(p uuid) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r boolean := false;
begin
  if p is null then return false; end if;
  select exists (select 1 from auth.users u join public.kr8_admin_emails a on a.email = lower(u.email) where u.id = p) into r;
  if not r and to_regclass('public.kr6_staff') is not null then
    execute 'select exists (select 1 from public.kr6_staff where user_id = $1)' into r using p;
  end if;
  if not r and to_regclass('public.kr8_team_accounts') is not null then
    execute 'select exists (select 1 from public.kr8_team_accounts where user_id = $1)' into r using p;
  end if;
  return coalesce(r, false);
end $$;
revoke all on function public.kr8_is_protected_login(uuid) from public, anon, authenticated;

create or replace function public.kr8_delete_me2() returns jsonb
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare uid uuid := auth.uid(); fk record;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  -- files are not removed by deleting rows: queue every file in this member's folders for the admin page to remove (as 0062)
  insert into public.kr8_storage_trash (bucket, name, user_id)
  select o.bucket_id, o.name, uid from storage.objects o
  where o.bucket_id in ('kr8-verify', 'kr8-reels', 'kr8-ask') and split_part(o.name, '/', 1) = uid::text
  on conflict do nothing;

  if not public.kr8_is_protected_login(uid) then
    delete from auth.users where id = uid;                       -- a normal member: everything goes, as before
    return jsonb_build_object('kept_sign_in', false);
  end if;

  -- admin / staff / team: delete what "delete the sign-in" would have cascaded to, member content only (kr8_* tables,
  -- ON DELETE CASCADE links to auth.users), but keep the sign-in, its LINE link, and the admin's own review trail
  -- (those columns are ON DELETE SET NULL and stay pointing at the admin, who still exists).
  for fk in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and cardinality(c.conkey) = 1 and c.confdeltype = 'c'
      and c.connamespace = 'public'::regnamespace
      and c.conrelid::regclass::text like 'kr8\_%'
      and c.conrelid::regclass::text not in ('kr8_members', 'kr8_line_links')
  loop
    execute format('delete from %s where %I = $1', fk.tbl, fk.col) using uid;
  end loop;
  delete from public.kr8_members where user_id = uid;            -- its own ON DELETE CASCADE children go with it
  return jsonb_build_object('kept_sign_in', true);
end $$;
revoke all on function public.kr8_delete_me2() from public, anon;
grant execute on function public.kr8_delete_me2() to authenticated;

create or replace function public.kr8_delete_me() returns void
language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  perform public.kr8_delete_me2();
end $$;

-- ───────────── P1-1: a new card needs an uploaded photo (server side, not only on the phone) ─────────────
alter table public.kr8_members add column if not exists photo_check text check (photo_check in ('ok', 'unchecked'));

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
  -- audit P1-1: a brand-new card must come with a photo the member uploaded (the phone has face-checked it).
  -- 1,500 characters ≈ 1 KB of image: a real 384 px card photo is 10–110 KB, a 1×1 pixel is under 200.
  if not existed and not (coalesce(p_photo, '') ~ '^(data:image/(jpeg|png|webp);base64,|https://pedxoxpammnyfnizljyj\.supabase\.co/storage/)'
                          and length(p_photo) >= 1500)
     then raise exception 'KR8_PHOTO_NEEDED'; end if;
  insert into public.kr8_members (user_id, first_name, langs, bio, area, who, photo, age_ok_at)
  values (uid, btrim(p_first_name), (select array(select distinct upper(x) from unnest(p_langs) x)), coalesce(btrim(p_bio), ''),
          coalesce(p_area, 'Bangkok'), coalesce(p_who, 'local'), nullif(p_photo, ''), now())
  on conflict (user_id) do update set
    first_name = excluded.first_name, langs = excluded.langs, bio = excluded.bio, area = excluded.area, who = excluded.who,
    photo = coalesce(excluded.photo, public.kr8_members.photo),
    -- a new photo needs a new check result (sent right after by kr8_note_photo_check)
    photo_check = case when excluded.photo is not null and excluded.photo is distinct from public.kr8_members.photo then null else public.kr8_members.photo_check end,
    updated_at = now();
  return public.kr8_me();
end $function$;

-- The phone says whether its face check ran on the card photo it just saved ('ok') or could not run ('unchecked': old phone,
-- face model did not load). Admin Members shows 'unchecked' cards with a flag so someone can look by eye.
create or replace function public.kr8_note_photo_check(p_ok boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'KR8_SIGN_IN'; end if;
  update public.kr8_members set photo_check = case when coalesce(p_ok, false) then 'ok' else 'unchecked' end where user_id = auth.uid();
  if not found then raise exception 'KR8_NO_CARD'; end if;
end $$;
revoke all on function public.kr8_note_photo_check(boolean) from public, anon;
grant execute on function public.kr8_note_photo_check(boolean) to authenticated;

-- 0053 body + 'photo_check'
create or replace function public.kr8_admin_member_list(p_limit int default 100, p_include_test boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  with m as (
    select m.*, public.kr8_is_test_member(m.user_id) as is_test
    from public.kr8_members m
  ),
  shown as (
    select * from m where p_include_test or not is_test
  ),
  reels as (
    select p.author,
           count(*) filter (where p.status = 'approved' and not coalesce(p.hidden, false))::int as approved,
           count(*) filter (where p.status = 'pending' and not coalesce(p.hidden, false))::int as waiting,
           count(*) filter (where p.status = 'hidden' or coalesce(p.hidden, false))::int as hidden
    from public.kr8_posts p
    where p.kind = 'reel' and p.author in (select user_id from shown)
    group by p.author
  ),
  page as (
    select * from shown order by created_at desc nulls last limit greatest(1, least(coalesce(p_limit, 100), 500))
  )
  select jsonb_build_object(
    'total', (select count(*)::int from shown),
    'test_hidden', case when p_include_test then 0 else (select count(*)::int from m where is_test) end,
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', s.user_id,
        'member_no', s.member_no,
        'first_name', s.first_name,
        'photo', nullif(s.photo, ''),
        'joined_at', s.created_at,
        'ref_code', nullif(s.ref_code, ''),
        'src_code', nullif(s.src_code, ''),
        'who', s.who,
        'area', s.area,
        'langs', to_jsonb(s.langs),
        'gender', s.gender,
        'show_gender', coalesce(s.show_gender, false),
        'ig_handle', nullif(s.ig_handle, ''),
        'tiktok_handle', nullif(s.tiktok_handle, ''),
        'bio', nullif(s.bio, ''),
        'interests', to_jsonb(s.interests),
        'verified', coalesce(s.verified, false),
        'age_ok', s.age_ok_at is not null,
        'terms_ok', s.terms_accepted_at is not null,
        'last_active_at', s.last_active_at,
        'reels_approved', coalesce(r.approved, 0),
        'reels_waiting', coalesce(r.waiting, 0),
        'reels_hidden', coalesce(r.hidden, 0),
        'card_complete', coalesce(s.photo, '') <> '' and btrim(coalesce(s.first_name, '')) <> '' and btrim(coalesce(s.area, '')) <> '',
        'photo_check', s.photo_check,
        'is_test', s.is_test
      ) order by s.created_at desc nulls last)
      from page s left join reels r on r.author = s.user_id), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- ───────────── P2-11: one open report per reporter per person / post / chat ─────────────
create or replace function public.kr8_report(p_user uuid, p_reason text, p_thread uuid default null, p_post uuid default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare n int; uid uuid := auth.uid(); tgt uuid;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if p_user is null and p_post is null then raise exception 'KR8_NO_PERSON'; end if;
  tgt := coalesce(p_user, (select author from public.kr8_posts where id = p_post));
  perform pg_advisory_xact_lock(hashtext('kr8_report:' || uid::text));
  -- already reported and still open: nothing new (the admin To-do showed 16 cards for one person)
  if exists (select 1 from public.kr8_reports r
             where r.reporter = uid and r.handled_at is null and r.ask_answer_id is null
               and r.post_id is not distinct from p_post
               and (p_post is not null or (r.target_user is not distinct from tgt and r.thread_id is not distinct from p_thread)))
  then return; end if;
  select count(*) into n from public.kr8_reports where reporter = uid and created_at > now() - interval '1 day';
  if n >= 30 then raise exception 'KR8_SLOW_DOWN'; end if;
  insert into public.kr8_reports (reporter, target_user, thread_id, post_id, reason)
  values (uid, tgt, p_thread, p_post, left(coalesce(nullif(btrim(p_reason), ''), 'unspecified'), 300));
  -- Reported posts with 3+ reports from different people are hidden until the team reviews them.
  if p_post is not null then
    update public.kr8_posts set hidden = true
     where id = p_post and (select count(distinct reporter) from public.kr8_reports where post_id = p_post) >= 3;
  end if;
end $$;

-- ───────────── P2-3: the member sees a hidden Reel and why ─────────────
-- 0048 body; own grid also lists own hidden Reels with the team's note (never shown to anyone else).
create or replace function public.kr8_member_reels(p_user uuid, p_limit int default 60)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); w0 timestamptz := public.kr8_week_start(now()); t boolean; r jsonb;
begin
  if p_user is null or not exists (select 1 from public.kr8_members where user_id = p_user) then raise exception 'KR8_NO_PERSON'; end if;
  if uid is not null and uid <> p_user and public.kr8_is_blocked(uid, p_user) then raise exception 'KR8_NO_PERSON'; end if;
  t := public.kr8_is_test_member(p_user);
  with sc as (select x.post_id, x.score from public.kr8_reel_scores('2020-01-01'::timestamptz, w0 + interval '7 days', w0 + interval '7 days', t, p_user) x),
  rows as (
    select p.id, p.poster_path, p.video_path, p.body, p.created_at,
           case when p.hidden or p.status = 'hidden' then 'hidden' else p.status end as status,
           case when (p.hidden or p.status = 'hidden') and uid = p_user then p.review_note end as note,
           p.likes_count, p.saves_count,
           p.created_at >= w0 as this_week, coalesce(sc.score, 0) as rings,
           (select jsonb_build_object('id', pl.id, 'name_en', pl.name_en, 'name_th', pl.name_th)
              from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id where pp.post_id = p.id order by pp.position limit 1) as place,
           uid is not null and exists (select 1 from public.kr8_post_likes l where l.post_id = p.id and l.user_id = uid) as liked,
           uid is not null and exists (select 1 from public.kr8_post_saves s where s.post_id = p.id and s.user_id = uid) as saved
    from public.kr8_posts p left join sc on sc.post_id = p.id
    where p.author = p_user and p.kind = 'reel' and p.video_path is not null
      and ((p.status = 'approved' and not p.hidden)
           or (uid = p_user and p.status = 'pending' and not p.hidden)
           or (uid = p_user and (p.hidden or p.status = 'hidden') and p.reviewed_at is not null))
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 60), 1), 120))
  select jsonb_build_object(
    'user_id', p_user, 'mine', coalesce(uid = p_user, false),
    'best', (select id from rows where this_week and status = 'approved' order by rings desc, created_at asc limit 1),
    'reels', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'poster_path', poster_path, 'video_path', video_path, 'body', body, 'created_at', created_at,
                 'status', status, 'note', note, 'likes', likes_count, 'saves', saves_count, 'this_week', this_week, 'rings', rings, 'place', place,
                 'liked', liked, 'saved', saved) order by created_at desc) from rows), '[]'::jsonb))
  into r;
  return r;
end $$;

-- 0030 body + "my Reel was hidden by the team" (reason in the prize column, which the app shows as text)
create or replace function public.kr8_my_activity(p_limit int default 50)
returns table (kind text, at timestamptz, actor_id uuid, actor_name text, actor_photo text, post_id uuid, poster_path text,
               n int, rank int, prize text, i_follow boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  return query
  select * from (
    -- someone followed me
    select 'follow'::text, f.created_at, f.follower, m.first_name, m.photo, null::uuid, null::text, 1, null::int, null::text,
           exists (select 1 from public.kr8_follows x where x.follower = uid and x.followee = f.follower)
    from public.kr8_follows f join public.kr8_members m on m.user_id = f.follower
    where f.followee = uid and not public.kr8_is_blocked(uid, f.follower)
    union all
    -- likes on my Reels, one line per Reel per Bangkok day: latest liker + how many
    select 'like', max(l.created_at), (array_agg(l.user_id order by l.created_at desc))[1],
           (array_agg(m.first_name order by l.created_at desc))[1], (array_agg(m.photo order by l.created_at desc))[1],
           p.id, p.poster_path, count(*)::int, null, null, null
    from public.kr8_post_likes l join public.kr8_posts p on p.id = l.post_id join public.kr8_members m on m.user_id = l.user_id
    where p.author = uid and not public.kr8_is_blocked(uid, l.user_id)
    group by p.id, p.poster_path, (l.created_at at time zone 'Asia/Bangkok')::date
    union all
    -- Top 5 gifts won (old manual awards)
    select 'gift', a.awarded_at, null, null, null, p.id, p.poster_path, 1, a.rank, a.prize, null
    from public.kr8_reel_awards a join public.kr8_posts p on p.id = a.reel_id where p.author = uid
    union all
    -- my Reel was approved by the team
    select 'approved', p.reviewed_at, null, null, null, p.id, p.poster_path, 1, null, null, null
    from public.kr8_posts p where p.author = uid and p.kind = 'reel' and p.status = 'approved' and p.reviewed_at is not null and not p.hidden
    union all
    -- my Reel was hidden by the team (audit P2-3): the reason travels in "prize"
    select 'hidden', p.reviewed_at, null, null, null, p.id, p.poster_path, 1, null, p.review_note, null
    from public.kr8_posts p where p.author = uid and p.kind = 'reel' and p.status = 'hidden' and p.reviewed_at is not null
  ) a
  order by 2 desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end $$;

-- audit P3-2: the admin Reel card said "· Kring Local" for everyone. The admin page asks for each author's own choice.
create or replace function public.kr8_admin_member_who(p_ids uuid[]) returns table (user_id uuid, who text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return query select m.user_id, m.who from public.kr8_members m where m.user_id = any((coalesce(p_ids, '{}'::uuid[]))[1:500]);
end $$;
revoke all on function public.kr8_admin_member_who(uuid[]) from public, anon;
grant execute on function public.kr8_admin_member_who(uuid[]) to authenticated;

-- the "ding": a Reel hidden by the team WITH a reason sends that reason to the member's phone (app notification only, never LINE,
-- so it costs nothing). Same queue as every other ding (0059); one per Reel.
create or replace function public.kr8_push_on_reel_hidden() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if to_regprocedure('public.kr8_push_queue(text,uuid,boolean,text,text,text,uuid,boolean)') is not null then
    perform public.kr8_push_queue('admin', new.author, false, 'รีลของคุณถูกซ่อน · Your Reel was hidden', left(new.review_note, 240),
                                  '/app/?tab=me', new.id, false);
  end if;
  return new;
exception when others then return new;      -- a ding must never block the review
end $$;
drop trigger if exists kr8_push_reel_hidden on public.kr8_posts;
create trigger kr8_push_reel_hidden after update of status on public.kr8_posts
  for each row when (new.kind = 'reel' and new.status = 'hidden' and old.status is distinct from 'hidden' and coalesce(new.review_note, '') <> '')
  execute function public.kr8_push_on_reel_hidden();

commit;
