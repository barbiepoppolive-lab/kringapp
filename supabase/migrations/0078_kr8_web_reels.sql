-- 0078 (17 Nov 2026, founder-approved SEO item A): members' Reels on public kringapp.com pages (/reel/<short>, /bangkok/<area>/).
--
-- PRIVACY (Thai PDPA): the Terms/Privacy only said posts are "visible to other users" and "shown in the app", so showing a Reel to
-- anyone on the open web needs the member's own yes. New column kr8_members.web_reels: NULL = never asked (= OFF), true = yes,
-- false = no. The app asks once with a one-tap card (members with an approved Reel) and keeps a switch in Settings.
--
-- A Reel is on the web only when ALL of these hold: kind 'reel', approved, not hidden, not "Feed only" (board_off: AI-made / not own
-- footage / repost), has a poster, author said yes (web_reels), author not ghost, not Kring Team, not a test member, author still has
-- a card with a photo and a first name (deleted accounts have no kr8_members row, so they drop out by themselves).
--
-- What the web may read (kr8_web_reels, callable with the public anon key): the share short id, first name (first word only), the
-- caption, area and place names, date, duration and size. NEVER user ids, member_no, emails, handles, storage paths or coordinates.
-- The storage path of the poster/video is only given to the website function (kr8_web_reel_media), which proves itself with the same
-- vault secret as /r/ (share_open_key).
--
-- ADDITIVE + RE-RUNNABLE. Nothing existing is changed.
-- UNDO: drop function kr8_web_reels(text[], text, int), kr8_web_reel_media(text, text), kr8_web_public_post(uuid),
--       kr8_web_reels_get(), kr8_set_web_reels(boolean); alter table kr8_members drop column web_reels, drop column web_reels_at;
begin;

alter table public.kr8_members add column if not exists web_reels boolean;
alter table public.kr8_members add column if not exists web_reels_at timestamptz;

-- the one rule for "this Reel may be on the open web"
create or replace function public.kr8_web_public_post(p_post uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.kr8_posts p join public.kr8_members m on m.user_id = p.author
    where p.id = p_post and p.kind = 'reel' and p.status = 'approved' and not p.hidden and not coalesce(p.board_off, false)
      and coalesce(p.poster_path, '') <> ''
      and m.web_reels is true and not coalesce(m.ghost, false)
      and coalesce(m.photo, '') <> '' and btrim(coalesce(m.first_name, '')) <> ''
      and not public.kr8_is_team(p.author) and not public.kr8_is_test_member(p.author))
$$;
revoke all on function public.kr8_web_public_post(uuid) from public, anon, authenticated;

-- public list / one Reel. p_areas = kr8_places.kr_area names (null = all Bangkok areas), p_short = one Reel by its share id.
create or replace function public.kr8_web_reels(p_areas text[] default null, p_short text default null, p_limit int default 24)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare lim int := greatest(1, least(coalesce(p_limit, 24), 1000));
        s text := lower(btrim(coalesce(p_short, '')));
        r jsonb;
begin
  if s <> '' and s !~ '^[a-z0-9]{6,10}$' then return '[]'::jsonb; end if;
  with c as (
    select p.id, p.body, p.created_at, p.duration_ms, p.width, p.height, p.area as post_area, m.first_name,
           pl.name_en, pl.name_th, coalesce(nullif(pl.kr_area, ''), nullif(pl.area, ''), nullif(p.area, ''), 'Bangkok') as area,
           coalesce(pl.outside_bkk, false) as outside
    from public.kr8_posts p
    join public.kr8_members m on m.user_id = p.author
    left join lateral (select pl.* from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id
                       where pp.post_id = p.id order by pp.position limit 1) pl on true
    where p.kind = 'reel' and p.status = 'approved' and not p.hidden
      and (s = '' or p.id = (select l.post_id from public.kr8_reel_links l where l.short = s))
      and public.kr8_web_public_post(p.id)
  ), f as (
    select * from c
    where (s <> '' or not outside)
      and (p_areas is null or area = any (p_areas))
    order by created_at desc limit lim
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'short', public.kr8_reel_share_link(f.id),
      'name', left(split_part(btrim(f.first_name), ' ', 1), 24),
      'caption', left(btrim(regexp_replace(coalesce(f.body, ''), '@[A-Za-z0-9._]+', '', 'g')), 600),
      'area', f.area, 'place_en', f.name_en, 'place_th', f.name_th,
      'at', f.created_at, 'dur', f.duration_ms, 'w', f.width, 'h', f.height, 'outside', f.outside)
      order by f.created_at desc), '[]'::jsonb)
  into r from f;
  return r;
end $$;
revoke all on function public.kr8_web_reels(text[], text, int) from public;
grant execute on function public.kr8_web_reels(text[], text, int) to anon, authenticated;

-- for the website function only (vault secret): where the poster / video of a PUBLIC Reel is stored
create or replace function public.kr8_web_reel_media(p_short text, p_key text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare k text; pid uuid; r jsonb;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'share_open_key' limit 1;
  if k is null or p_key is null or p_key <> k then raise exception 'KR8_FORBIDDEN'; end if;
  select post_id into pid from public.kr8_reel_links where short = lower(coalesce(p_short, ''));
  if pid is null or not public.kr8_web_public_post(pid) then return null; end if;
  select jsonb_build_object('poster', p.poster_path, 'video', p.video_path) into r from public.kr8_posts p where p.id = pid;
  return r;
end $$;
revoke all on function public.kr8_web_reel_media(text, text) from public;
grant execute on function public.kr8_web_reel_media(text, text) to anon;

-- the member's own switch
create or replace function public.kr8_web_reels_get() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('on', m.web_reels, 'asked', m.web_reels is not null,
    'has_reel', exists (select 1 from public.kr8_posts p where p.author = m.user_id and p.kind = 'reel' and p.status = 'approved' and not p.hidden))
  from public.kr8_members m where m.user_id = auth.uid()
$$;
revoke all on function public.kr8_web_reels_get() from public, anon;
grant execute on function public.kr8_web_reels_get() to authenticated;

create or replace function public.kr8_set_web_reels(p_on boolean) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'KR8_SIGN_IN'; end if;
  update public.kr8_members set web_reels = coalesce(p_on, false), web_reels_at = now() where user_id = auth.uid();
  return coalesce(p_on, false);
end $$;
revoke all on function public.kr8_set_web_reels(boolean) from public, anon;
grant execute on function public.kr8_set_web_reels(boolean) to authenticated;

commit;
