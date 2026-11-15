-- 0048 · go-live build (15 Nov 2026): tag people on a Reel, member profile grid, one-time coach marks,
--        Reels bucket can no longer be listed by strangers, weekly close scheduled.
--
-- ADDITIVE ONLY. Nothing the live build (kringapp f71183d + 0047) calls is dropped, renamed or changed in shape:
--   · 2 new tables (kr8_post_people, kr8_member_coach), 9 new functions, 1 new cron job
--   · 1 storage policy narrowed (kr8_reels_read): signing/reading an APPROVED Reel file is unchanged (that is all the live
--     feed does, through createSignedUrls); LISTING the bucket is now refused unless you are the owner of the folder or an admin
--   · kr8_claim_notify: search_path gains pg_temp (same body)
--
-- UNDO (safe at any time, the old app never reads these):
--   select cron.unschedule('kr8_close_week');
--   alter policy kr8_reels_read on storage.objects using ((bucket_id = 'kr8-reels') and (((storage.foldername(name))[1] = (auth.uid())::text) or public.kr8_is_admin() or public.kr8_reel_file_visible(name)));
--   drop function if exists public.kr8_reel_tag_people(uuid, uuid[]), public.kr8_reel_people(uuid[]), public.kr8_tag_candidates(text, int),
--     public.kr8_member_reels(uuid, int), public.kr8_coach_state(), public.kr8_coach_seen(text), public.kr8_coach_reset(),
--     public.kr8_post_is_visible(uuid), public.kr8_post_is_mine(uuid);
--   drop table if exists public.kr8_post_people, public.kr8_member_coach;

-- ───────────────────────── 1. people tagged on a Reel ─────────────────────────
create table if not exists public.kr8_post_people (
  post_id    uuid not null references public.kr8_posts(id) on delete cascade,
  user_id    uuid not null references public.kr8_members(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists kr8_post_people_user_idx on public.kr8_post_people (user_id);
alter table public.kr8_post_people enable row level security;

create or replace function public.kr8_post_is_visible(p_post uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.kr8_posts p where p.id = p_post
                 and ((p.status = 'approved' and not p.hidden) or p.author = auth.uid()))
$$;
create or replace function public.kr8_post_is_mine(p_post uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists (select 1 from public.kr8_posts p where p.id = p_post and p.author = auth.uid())
$$;
revoke all on function public.kr8_post_is_visible(uuid), public.kr8_post_is_mine(uuid) from public;
grant execute on function public.kr8_post_is_visible(uuid), public.kr8_post_is_mine(uuid) to anon, authenticated;

drop policy if exists kr8_post_people_read on public.kr8_post_people;
create policy kr8_post_people_read on public.kr8_post_people for select to anon, authenticated
  using (public.kr8_post_is_visible(post_id));
drop policy if exists kr8_post_people_owner_insert on public.kr8_post_people;
create policy kr8_post_people_owner_insert on public.kr8_post_people for insert to authenticated
  with check (public.kr8_post_is_mine(post_id) and user_id <> auth.uid());
drop policy if exists kr8_post_people_owner_delete on public.kr8_post_people;
create policy kr8_post_people_owner_delete on public.kr8_post_people for delete to authenticated
  using (public.kr8_post_is_mine(post_id) or user_id = auth.uid());   -- a tagged member can remove their own tag
revoke all on public.kr8_post_people from public, anon, authenticated;
grant select on public.kr8_post_people to anon, authenticated;
grant insert, delete on public.kr8_post_people to authenticated;

-- Owner sets the tagged members of one of their Reels (replaces the list; at most 5; members with a finished card only).
create or replace function public.kr8_reel_tag_people(p_post uuid, p_users uuid[])
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_posts where id = p_post and author = uid and kind = 'reel') then raise exception 'KR8_NOT_YOURS'; end if;
  delete from public.kr8_post_people where post_id = p_post;
  insert into public.kr8_post_people (post_id, user_id)
  select p_post, m.user_id
  from (select distinct u from unnest(coalesce(p_users, '{}'::uuid[])) u limit 5) x
  join public.kr8_members m on m.user_id = x.u
  where m.user_id <> uid and btrim(coalesce(m.first_name, '')) <> '' and coalesce(m.photo, '') <> ''
    and not public.kr8_is_blocked(uid, m.user_id)
    and public.kr8_is_test_member(m.user_id) = public.kr8_is_test_member(uid)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- "with @name" for a set of Reels the viewer may see
create or replace function public.kr8_reel_people(p_posts uuid[])
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('post_id', x.post_id, 'people', x.people)), '[]'::jsonb)
  from (select pp.post_id, jsonb_agg(jsonb_build_object('user_id', m.user_id, 'first_name', m.first_name, 'photo', m.photo) order by pp.created_at, m.first_name) people
        from public.kr8_post_people pp
        join public.kr8_posts p on p.id = pp.post_id
        join public.kr8_members m on m.user_id = pp.user_id
        where pp.post_id = any ((coalesce(p_posts, '{}'::uuid[]))[1:100])
          and ((p.status = 'approved' and not p.hidden) or p.author = auth.uid())
          and (auth.uid() is null or not public.kr8_is_blocked(auth.uid(), m.user_id))
        group by pp.post_id) x
$$;

-- Members the signed-in member can tag (name search; people they follow first)
create or replace function public.kr8_tag_candidates(p_q text default null, p_limit int default 30)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); q text := lower(btrim(coalesce(p_q, ''))); t boolean; r jsonb;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  t := public.kr8_is_test_member(uid);
  select coalesce(jsonb_agg(jsonb_build_object('user_id', x.user_id, 'first_name', x.first_name, 'photo', x.photo, 'who', x.who, 'area', x.area,
                                               'ig_handle', x.ig_handle) order by x.f desc, x.last_active_at desc nulls last), '[]'::jsonb)
  into r
  from (select m.user_id, m.first_name, m.photo, m.who, m.area, m.ig_handle, m.last_active_at,
               exists (select 1 from public.kr8_follows f where f.follower = uid and f.followee = m.user_id) f
        from public.kr8_members m
        where m.user_id <> uid and btrim(coalesce(m.first_name, '')) <> '' and coalesce(m.photo, '') <> ''
          and public.kr8_is_test_member(m.user_id) = t
          and not public.kr8_is_blocked(uid, m.user_id)
          and (q = '' or lower(m.first_name) like '%' || replace(replace(q, '%', ''), '_', '') || '%'
               or lower(coalesce(m.ig_handle, '')) like '%' || replace(replace(q, '%', ''), '_', '') || '%')
        order by 7 desc nulls last
        limit least(greatest(coalesce(p_limit, 30), 1), 60)) x;
  return r;
end $$;

-- ───────────────────────── 2. member profile grid ─────────────────────────
-- A member's Reels for the 3-column grid and the full-screen player. Strangers get approved Reels only; the owner also gets
-- their own Reels still in review. Rings are the public score of each Reel (same math as the board).
create or replace function public.kr8_member_reels(p_user uuid, p_limit int default 60)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); w0 timestamptz := public.kr8_week_start(now()); t boolean; r jsonb;
begin
  if p_user is null or not exists (select 1 from public.kr8_members where user_id = p_user) then raise exception 'KR8_NO_PERSON'; end if;
  if uid is not null and uid <> p_user and public.kr8_is_blocked(uid, p_user) then raise exception 'KR8_NO_PERSON'; end if;
  t := public.kr8_is_test_member(p_user);
  with sc as (select x.post_id, x.score from public.kr8_reel_scores('2020-01-01'::timestamptz, w0 + interval '7 days', w0 + interval '7 days', t, p_user) x),
  rows as (
    select p.id, p.poster_path, p.video_path, p.body, p.created_at, p.status, p.likes_count, p.saves_count,
           p.created_at >= w0 as this_week, coalesce(sc.score, 0) as rings,
           (select jsonb_build_object('id', pl.id, 'name_en', pl.name_en, 'name_th', pl.name_th)
              from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id where pp.post_id = p.id order by pp.position limit 1) as place,
           uid is not null and exists (select 1 from public.kr8_post_likes l where l.post_id = p.id and l.user_id = uid) as liked,
           uid is not null and exists (select 1 from public.kr8_post_saves s where s.post_id = p.id and s.user_id = uid) as saved
    from public.kr8_posts p left join sc on sc.post_id = p.id
    where p.author = p_user and p.kind = 'reel' and not p.hidden and p.video_path is not null
      and (p.status = 'approved' or (uid = p_user and p.status = 'pending'))
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 60), 1), 120))
  select jsonb_build_object(
    'user_id', p_user, 'mine', uid = p_user,
    'best', (select id from rows where this_week and status = 'approved' order by rings desc, created_at asc limit 1),
    'reels', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'poster_path', poster_path, 'video_path', video_path, 'body', body, 'created_at', created_at,
                 'status', status, 'likes', likes_count, 'saves', saves_count, 'this_week', this_week, 'rings', rings, 'place', place,
                 'liked', liked, 'saved', saved) order by created_at desc) from rows), '[]'::jsonb))
  into r;
  return r;
end $$;

-- ───────────────────────── 3. one-time coach marks (kept on the account) ─────────────────────────
create table if not exists public.kr8_member_coach (
  user_id uuid not null references auth.users(id) on delete cascade,
  key     text not null check (key ~ '^[a-z0-9_]{1,24}$'),
  seen_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.kr8_member_coach enable row level security;
drop policy if exists kr8_member_coach_own on public.kr8_member_coach;
create policy kr8_member_coach_own on public.kr8_member_coach for select to authenticated using (user_id = auth.uid());
revoke all on public.kr8_member_coach from public, anon, authenticated;
grant select on public.kr8_member_coach to authenticated;

create or replace function public.kr8_coach_state()
returns text[] language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(key order by key), '{}'::text[]) from public.kr8_member_coach where user_id = auth.uid()
$$;
create or replace function public.kr8_coach_seen(p_key text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return false; end if;
  if p_key !~ '^[a-z0-9_]{1,24}$' then return false; end if;
  if (select count(*) from public.kr8_member_coach where user_id = auth.uid()) >= 40 then return false; end if;
  insert into public.kr8_member_coach (user_id, key) values (auth.uid(), p_key) on conflict do nothing;
  return true;
end $$;
create or replace function public.kr8_coach_reset()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if auth.uid() is null then return 0; end if;
  delete from public.kr8_member_coach where user_id = auth.uid();
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.kr8_reel_tag_people(uuid, uuid[]), public.kr8_reel_people(uuid[]), public.kr8_tag_candidates(text, int),
  public.kr8_member_reels(uuid, int), public.kr8_coach_state(), public.kr8_coach_seen(text), public.kr8_coach_reset() from public;
grant execute on function public.kr8_reel_people(uuid[]), public.kr8_member_reels(uuid, int) to anon, authenticated;
grant execute on function public.kr8_reel_tag_people(uuid, uuid[]), public.kr8_tag_candidates(text, int),
  public.kr8_coach_state(), public.kr8_coach_seen(text), public.kr8_coach_reset() to authenticated;

-- ───────────────────────── 4. Reels bucket: no listing for strangers ─────────────────────────
-- Before: the read policy let anyone list and sign the files of approved Reels (never pending or hidden ones: kr8_reel_file_visible
-- already checked that). Listing still exposed folder names (= account ids) and file names. Now a list / search call only returns
-- your own folder (or everything for an admin). Reading or signing one known approved file works exactly as before, so the feed of
-- both the live build and this build keeps playing.
alter policy kr8_reels_read on storage.objects
  using (
    bucket_id = 'kr8-reels'
    and (
      (storage.foldername(name))[1] = (auth.uid())::text
      or public.kr8_is_admin()
      or (public.kr8_reel_file_visible(name) and coalesce(storage.operation(), '') !~* '(list|search)')
    )
  );

-- ───────────────────────── 5. small hardening from the audit ─────────────────────────
do $$ begin
  if exists (select 1 from pg_proc where proname = 'kr8_claim_notify' and pronamespace = 'public'::regnamespace) then
    execute (select format('alter function %s set search_path = public, pg_temp', oid::regprocedure) from pg_proc
             where proname = 'kr8_claim_notify' and pronamespace = 'public'::regnamespace limit 1);
  end if;
end $$;

-- ───────────────────────── 6. weekly close: Monday 00:01 Bangkok (= Sunday 17:01 UTC) ─────────────────────────
-- kr8_close_week() is safe to run twice and refuses an open week. With no approved Reels it creates nothing.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'kr8_close_week';
    perform cron.schedule('kr8_close_week', '1 17 * * 0', 'select public.kr8_close_week()');
  end if;
end $$;
