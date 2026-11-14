-- 0044 · Card + linking, Rings rewards, weekly ranking, place tagging (feat/card-rewards-rank-places, 14 Nov 2026)
-- ADDITIVE ONLY: new columns on kr8_members (tiktok_handle, member_no), new tables, new RPCs, new triggers.
-- No existing column is dropped or altered; no existing RPC is replaced. kr8_set_ig_handle / kr8_create_reel keep working.
--
-- UNDO (in this order; destroys Rings / claims / places data):
--   drop trigger if exists kr8_rings_post_trg on public.kr8_posts; drop trigger if exists kr8_rings_ref_trg on public.kr8_members;
--   drop trigger if exists kr8_post_places_rings on public.kr8_post_places; drop trigger if exists kr8_codes_fill on public.kr8_reward_codes;
--   drop trigger if exists kr8_claim_notify on public.kr8_reward_claims;
--   drop table if exists public.kr8_reward_claims, public.kr8_reward_codes, public.kr8_rings_ledger, public.kr8_post_places, public.kr8_places cascade;
--   drop function if exists <every kr8_* function created below>;
--   alter table public.kr8_members drop column if exists tiktok_handle, drop column if exists member_no; drop sequence if exists public.kr8_member_no_seq;

begin;

-- ───────────────────────── 1. member number (#00412) + TikTok handle ─────────────────────────
alter table public.kr8_members add column if not exists tiktok_handle text;
alter table public.kr8_members add column if not exists member_no integer;
with o as (
  select user_id, row_number() over (order by created_at, user_id) + coalesce((select max(member_no) from public.kr8_members), 0) as n
  from public.kr8_members where member_no is null
)
update public.kr8_members m set member_no = o.n from o where o.user_id = m.user_id;
create sequence if not exists public.kr8_member_no_seq;
select case when (select max(member_no) from public.kr8_members) is null then setval('public.kr8_member_no_seq', 1, false)
            else setval('public.kr8_member_no_seq', (select max(member_no) from public.kr8_members), true) end;
alter table public.kr8_members alter column member_no set default nextval('public.kr8_member_no_seq');
create unique index if not exists kr8_members_member_no_key on public.kr8_members(member_no);

-- TikTok: same rules as kr8_set_ig_handle. Accepts "@name", "name" or a pasted tiktok.com/@name link.
create or replace function public.kr8_set_tiktok_handle(p_handle text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v text := btrim(coalesce(p_handle, ''));
begin
  if auth.uid() is null then raise exception 'KR8_SIGN_IN'; end if;
  v := regexp_replace(v, '^(https?://)?((www|m|vm)\.)?tiktok\.com/', '', 'i');
  v := lower(nullif(btrim(split_part(split_part(regexp_replace(v, '^@', ''), '?', 1), '/', 1), ' '), ''));
  if v is not null and v !~ '^[a-z0-9_.]{2,24}$' then raise exception 'KR8_BAD_HANDLE'; end if;
  update public.kr8_members set tiktok_handle = v, updated_at = now() where user_id = auth.uid();
  if not found then raise exception 'KR8_NO_CARD'; end if;
  return v;
end $$;

-- Name behind a member invite code "k00412" (the sign-in sheet says "Mint invited you"). First names are public on the feed.
create or replace function public.kr8_ref_name(p_code text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select m.first_name from public.kr8_members m
  where lower(coalesce(p_code, '')) ~ '^k[0-9]{5,7}$' and m.member_no = substring(lower(p_code) from 2)::int
$$;

-- ───────────────────────── 2. places ─────────────────────────
create table if not exists public.kr8_places (
  id uuid primary key default gen_random_uuid(),
  name_en text not null check (length(btrim(name_en)) between 1 and 80),
  name_th text check (name_th is null or length(name_th) <= 80),
  aliases text not null default '',                       -- other spellings for search ("Talad Noi", "Taladnoi")
  area text not null default 'Bangkok',                   -- district shown under the name
  kr_area text not null default 'Bangkok',                -- one of kr8_area_ok(): becomes the Reel's area pin
  lat double precision not null check (lat between 13.45 and 14.05),
  lng double precision not null check (lng between 100.25 and 100.95),
  photo_url text check (photo_url is null or photo_url ~ '^(https://|/app/media/places/[a-z0-9-]+\.jpg$)'),
  photo_credit text,
  google_place_id text,
  osm_ref text unique,
  source text not null default 'seed' check (source in ('seed', 'photon', 'admin')),
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists kr8_places_name_spot on public.kr8_places (lower(name_en), round(lat::numeric, 3), round(lng::numeric, 3));
alter table public.kr8_places enable row level security;
revoke all on public.kr8_places from anon, authenticated;

create table if not exists public.kr8_post_places (
  post_id uuid not null references public.kr8_posts(id) on delete cascade,
  place_id uuid not null references public.kr8_places(id) on delete cascade,
  position smallint not null check (position in (1, 2)),
  created_at timestamptz not null default now(),
  primary key (post_id, position),
  unique (post_id, place_id)
);
create index if not exists kr8_post_places_place on public.kr8_post_places(place_id);
alter table public.kr8_post_places enable row level security;
revoke all on public.kr8_post_places from anon, authenticated;

create or replace function public.kr8_dist_m(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(power(sin(radians(b_lat - a_lat) / 2), 2)
         + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2)))
$$;
create or replace function public.kr8_norm(t text) returns text language sql immutable as $$
  select regexp_replace(lower(coalesce(t, '')), '[^a-z0-9ก-๙]+', '', 'g')
$$;

-- members "here now" at a place: active "I'm here now" (2 h) on a Reel tagged there
create or replace function public.kr8_place_here_n(p_place uuid) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select count(distinct po.author)::int from public.kr8_post_places pp join public.kr8_posts po on po.id = pp.post_id
  where pp.place_id = p_place and po.here_until > now() and not po.hidden
$$;

-- Search: this table first (EN / TH / other spellings, word starts, then distance from the phone if it shared it)
create or replace function public.kr8_places_search(p_q text default null, p_lat double precision default null, p_lng double precision default null, p_limit int default 20)
returns table(id uuid, name_en text, name_th text, area text, kr_area text, lat double precision, lng double precision, photo_url text, dist_m int, reels int, here_now int)
language sql stable security definer set search_path = public, pg_temp as $$
  with q as (select public.kr8_norm(p_q) as s, lower(btrim(coalesce(p_q, ''))) as raw),
  hit as (
    select p.*, q.s, q.raw,
           case when q.s = '' then 0
                when public.kr8_norm(p.name_en) like q.s || '%' or public.kr8_norm(p.name_th) like q.s || '%' then 1
                when public.kr8_norm(p.name_en || ' ' || coalesce(p.name_th, '') || ' ' || p.aliases) like '%' || q.s || '%' then 2
                when not exists (select 1 from regexp_split_to_table(q.raw, '\s+') w where w <> ''
                                   and not (lower(p.name_en || ' ' || p.aliases || ' ' || p.area) ~ ('(^|[^a-z0-9])' || regexp_replace(w, '[^a-z0-9ก-๙]', '', 'g')))
                                   and position(w in coalesce(p.name_th, '')) = 0) then 3
                else 9 end as score
    from public.kr8_places p, q
  )
  select h.id, h.name_en, h.name_th, h.area, h.kr_area, h.lat, h.lng, h.photo_url,
         case when p_lat is null or p_lng is null then null else round(public.kr8_dist_m(p_lat, p_lng, h.lat, h.lng))::int end,
         (select count(*)::int from public.kr8_post_places pp join public.kr8_posts po on po.id = pp.post_id
            where pp.place_id = h.id and not po.hidden and po.status = 'approved'),
         public.kr8_place_here_n(h.id)
  from hit h
  where h.score < 9
  order by h.score, case when p_lat is null then 0 else public.kr8_dist_m(p_lat, p_lng, h.lat, h.lng) end, h.name_en
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

-- A place picked from the free Photon geocoder is saved here (Bangkok only, signed-in members with a card)
create or replace function public.kr8_add_place(p_name_en text, p_name_th text, p_area text, p_lat double precision, p_lng double precision, p_osm_ref text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); pid uuid; n int; v_ref text := nullif(left(btrim(coalesce(p_osm_ref, '')), 40), '');
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if v_ref is not null and v_ref !~ '^[NWR][0-9]{1,15}$' then raise exception 'KR8_BAD_PLACE'; end if;
  if p_lat is null or p_lng is null or p_lat not between 13.45 and 14.05 or p_lng not between 100.25 and 100.95 then raise exception 'KR8_BAD_PLACE'; end if;
  if not public.kr8_text_ok(p_name_en, 80) or (nullif(p_name_th, '') is not null and not public.kr8_text_ok(p_name_th, 80)) then raise exception 'KR8_BAD_PLACE'; end if;
  if v_ref is not null then
    select id into pid from public.kr8_places where osm_ref = v_ref;
    if pid is not null then return pid; end if;
  end if;
  select id into pid from public.kr8_places where lower(name_en) = lower(btrim(p_name_en)) and public.kr8_dist_m(lat, lng, p_lat, p_lng) < 150 limit 1;
  if pid is not null then return pid; end if;
  select count(*) into n from public.kr8_places where created_by = uid and created_at > now() - interval '1 day';
  if n >= 20 then raise exception 'KR8_SLOW_DOWN'; end if;
  insert into public.kr8_places (name_en, name_th, area, kr_area, lat, lng, osm_ref, source, created_by)
  values (btrim(p_name_en), nullif(btrim(coalesce(p_name_th, '')), ''), coalesce(nullif(left(btrim(coalesce(p_area, '')), 40), ''), 'Bangkok'),
          'Bangkok', p_lat, p_lng, v_ref, 'photon', uid)
  on conflict do nothing
  returning id into pid;
  if pid is null then select id into pid from public.kr8_places where osm_ref = v_ref or (lower(name_en) = lower(btrim(p_name_en)) and public.kr8_dist_m(lat, lng, p_lat, p_lng) < 150) limit 1; end if;
  return pid;
end $$;

-- ───────────────────────── 3. Rings ledger (append-only) ─────────────────────────
create table if not exists public.kr8_rings_ledger (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.kr8_members(user_id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in ('reel_place', 'likes_50', 'friend_join', 'weekly_top', 'reel_removed', 'claim')),
  ref_id text not null,
  created_at timestamptz not null default now(),
  unique (member_id, reason, ref_id)
);
create index if not exists kr8_rings_ledger_member on public.kr8_rings_ledger(member_id, created_at);
create index if not exists kr8_rings_ledger_week on public.kr8_rings_ledger(created_at);
alter table public.kr8_rings_ledger enable row level security;
revoke all on public.kr8_rings_ledger from anon, authenticated;

-- append-only: rows are never changed; they only go away with the member's own account deletion (FK cascade)
create or replace function public.kr8_rings_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then raise exception 'KR8_LEDGER_APPEND_ONLY'; end if;
  if exists (select 1 from public.kr8_members where user_id = old.member_id) then raise exception 'KR8_LEDGER_APPEND_ONLY'; end if;
  return old;
end $$;
drop trigger if exists kr8_rings_append_only on public.kr8_rings_ledger;
create trigger kr8_rings_append_only before update or delete on public.kr8_rings_ledger for each row execute function public.kr8_rings_append_only();

create or replace function public.kr8_bkk_day_start(t timestamptz default now()) returns timestamptz language sql stable as $$
  select (date_trunc('day', t at time zone 'Asia/Bangkok')) at time zone 'Asia/Bangkok'
$$;
create or replace function public.kr8_week_start(t timestamptz default now()) returns timestamptz language sql stable as $$
  select (date_trunc('week', t at time zone 'Asia/Bangkok')) at time zone 'Asia/Bangkok'
$$;
-- Rings that count for levels and the weekly league (claims and weekly prizes never count towards the league)
create or replace function public.kr8_rings_earn_reason(r text) returns boolean language sql immutable as $$
  select r in ('reel_place', 'likes_50', 'friend_join', 'reel_removed')
$$;
-- Levels from lifetime Rings: 0 / 1,000 / 3,000 / 8,000 / 20,000
create or replace function public.kr8_rings_level(p_lifetime int) returns int language sql immutable as $$
  select case when p_lifetime >= 20000 then 5 when p_lifetime >= 8000 then 4 when p_lifetime >= 3000 then 3 when p_lifetime >= 1000 then 2 else 1 end
$$;
create or replace function public.kr8_rings_totals(p_user uuid)
returns table(balance int, lifetime int, week int) language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(delta), 0)::int,
         coalesce(sum(delta) filter (where reason <> 'claim'), 0)::int,
         coalesce(sum(delta) filter (where public.kr8_rings_earn_reason(reason) and created_at >= public.kr8_week_start(now())), 0)::int
  from public.kr8_rings_ledger where member_id = p_user
$$;

-- +200 for an approved Reel with ≥1 place tagged, max one per Bangkok day per member
create or replace function public.kr8_rings_try_reel(p_post uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare a uuid;
begin
  select author into a from public.kr8_posts where id = p_post and kind = 'reel' and status = 'approved' and not hidden;
  if a is null or not exists (select 1 from public.kr8_post_places where post_id = p_post) then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('kr8_rings:' || a::text));
  if exists (select 1 from public.kr8_rings_ledger where member_id = a and reason = 'reel_place'
             and (ref_id = p_post::text or created_at >= public.kr8_bkk_day_start(now()))) then return 0; end if;
  insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (a, 200, 'reel_place', p_post::text) on conflict do nothing;
  return 200;
end $$;

-- Reel approved / hidden / likes crossing 50. Never blocks a like or a review.
create or replace function public.kr8_rings_post_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare back int;
begin
  if new.kind <> 'reel' then return new; end if;
  begin
    if new.status = 'approved' and not new.hidden and (old.status is distinct from 'approved' or old.hidden) then
      perform public.kr8_rings_try_reel(new.id);
    end if;
    if new.likes_count >= 50 and coalesce(old.likes_count, 0) < 50 and new.status = 'approved' and not new.hidden then
      insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (new.author, 100, 'likes_50', new.id::text) on conflict do nothing;
    end if;
    if (new.hidden and not old.hidden) or (new.status = 'hidden' and old.status is distinct from 'hidden') then
      select coalesce(sum(delta), 0) into back from public.kr8_rings_ledger
        where member_id = new.author and ref_id = new.id::text and reason in ('reel_place', 'likes_50');
      if back > 0 then
        insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (new.author, -back, 'reel_removed', new.id::text) on conflict do nothing;
      end if;
    end if;
  exception when others then
    raise warning 'kr8_rings_post_trg: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists kr8_rings_post_trg on public.kr8_posts;
create trigger kr8_rings_post_trg after update of status, hidden, likes_count on public.kr8_posts
  for each row execute function public.kr8_rings_post_trg();

create or replace function public.kr8_post_places_rings() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin perform public.kr8_rings_try_reel(new.post_id); exception when others then raise warning 'kr8_post_places_rings: %', sqlerrm; end;
  return new;
end $$;
drop trigger if exists kr8_post_places_rings on public.kr8_post_places;
create trigger kr8_post_places_rings after insert on public.kr8_post_places for each row execute function public.kr8_post_places_rings();

-- +300 when a friend joins with your link (?ref=k00412) and makes their card (kr8_set_ref only works with a card)
create or replace function public.kr8_rings_ref_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r uuid;
begin
  if old.ref_code is null and new.ref_code ~ '^k[0-9]{5,7}$' then
    begin
      select user_id into r from public.kr8_members where member_no = substring(new.ref_code from 2)::int;
      if r is not null and r <> new.user_id then
        insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (r, 300, 'friend_join', new.user_id::text) on conflict do nothing;
      end if;
    exception when others then raise warning 'kr8_rings_ref_trg: %', sqlerrm;
    end;
  end if;
  return new;
end $$;
drop trigger if exists kr8_rings_ref_trg on public.kr8_members;
create trigger kr8_rings_ref_trg after update of ref_code on public.kr8_members for each row execute function public.kr8_rings_ref_trg();

-- ───────────────────────── 4. Reels with places (new RPC; kr8_create_reel stays as it is) ─────────────────────────
create or replace function public.kr8_create_reel_v2(p_video_path text, p_poster_path text, p_duration_ms integer, p_width integer, p_height integer,
  p_area text, p_body text default null, p_here boolean default false, p_place_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb; pid uuid; n int := 0; got int := 0;
begin
  if p_place_ids is not null and (select count(distinct x) from unnest(p_place_ids) x) > 2 then raise exception 'KR8_TOO_MANY_PLACES'; end if;
  r := public.kr8_create_reel(p_video_path, p_poster_path, p_duration_ms, p_width, p_height, p_area, p_body, p_here);
  pid := (r->>'id')::uuid;
  if p_place_ids is not null and cardinality(p_place_ids) > 0 then
    insert into public.kr8_post_places (post_id, place_id, position)
    select pid, x.id, row_number() over (order by x.ord)::smallint
    from (select distinct on (u.id) u.id, u.ord from unnest(p_place_ids) with ordinality u(id, ord)
          join public.kr8_places pl on pl.id = u.id order by u.id, u.ord) x;
    get diagnostics n = row_count;
  end if;
  select coalesce(sum(delta), 0) into got from public.kr8_rings_ledger where reason = 'reel_place' and ref_id = pid::text;
  return r || jsonb_build_object('places', n, 'rings', got);
end $$;

-- Places + TikTok for feed Reels (one call per feed load)
create or replace function public.kr8_feed_extras(p_posts uuid[])
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'post_id', p.id, 'tiktok', m.tiktok_handle,
    'places', coalesce((select jsonb_agg(jsonb_build_object('id', pl.id, 'name_en', pl.name_en, 'name_th', pl.name_th, 'photo_url', pl.photo_url,
                                                     'area', pl.area, 'here_now', public.kr8_place_here_n(pl.id)) order by pp.position)
                        from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id where pp.post_id = p.id), '[]'::jsonb))), '[]'::jsonb)
  from public.kr8_posts p join public.kr8_members m on m.user_id = p.author
  where p.id = any ((coalesce(p_posts, '{}'::uuid[]))[1:100]) and not p.hidden
    and (p.status = 'approved' or p.author = auth.uid())
$$;

-- Place page: hero, names, Reels count, here now (+ faces for members), Top / Recent Reels
create or replace function public.kr8_place_page(p_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with pl as (select * from public.kr8_places where id = p_id),
  rl as (
    select po.id, po.poster_path, po.video_path, po.likes_count, po.created_at, po.here_until, po.author, m.first_name, m.photo
    from public.kr8_post_places pp join public.kr8_posts po on po.id = pp.post_id join public.kr8_members m on m.user_id = po.author
    where pp.place_id = p_id and not po.hidden and po.kind = 'reel' and po.status = 'approved'
      and (auth.uid() is null or not public.kr8_is_blocked(auth.uid(), po.author))
  )
  select case when not exists (select 1 from pl) then null else jsonb_build_object(
    'place', (select jsonb_build_object('id', id, 'name_en', name_en, 'name_th', name_th, 'area', area, 'kr_area', kr_area, 'lat', lat, 'lng', lng,
                                        'photo_url', photo_url, 'photo_credit', photo_credit) from pl),
    'reels_count', (select count(*) from rl),
    'here_now', public.kr8_place_here_n(p_id),
    'faces', case when auth.uid() is null then '[]'::jsonb else coalesce((select jsonb_agg(f.photo) from (
               select distinct on (author) author, photo from rl where here_until > now() and photo is not null order by author, created_at desc limit 4) f), '[]'::jsonb) end,
    'top', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'poster_path', poster_path, 'video_path', video_path, 'likes', likes_count, 'name', first_name) order by likes_count desc, created_at desc)
                     from (select * from rl order by likes_count desc, created_at desc limit 18) t), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'poster_path', poster_path, 'video_path', video_path, 'likes', likes_count, 'name', first_name) order by created_at desc)
                        from (select * from rl order by created_at desc limit 18) t), '[]'::jsonb)
  ) end
$$;

-- ───────────────────────── 5. Card extras (#member number, TikTok, level from lifetime Rings) ─────────────────────────
create or replace function public.kr8_card_extras(p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); tgt uuid := coalesce(p_user, auth.uid()); m public.kr8_members; t record;
begin
  if tgt is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into m from public.kr8_members where user_id = tgt;
  if m.user_id is null or (uid is not null and tgt <> uid and public.kr8_is_blocked(uid, tgt)) then raise exception 'KR8_NO_PERSON'; end if;
  select * into t from public.kr8_rings_totals(tgt);
  return jsonb_build_object('member_no', m.member_no, 'ig_handle', m.ig_handle, 'tiktok_handle', m.tiktok_handle,
    'lifetime', t.lifetime, 'level', public.kr8_rings_level(t.lifetime), 'week', t.week,
    'balance', case when uid = tgt then t.balance end);
end $$;

-- ───────────────────────── 6. Weekly league (Mon 00:00 – Sun 23:59 Bangkok) ─────────────────────────
create or replace function public.kr8_week_scores(p_w0 timestamptz)
returns table(member_id uuid, rings int, last_at timestamptz) language sql stable security definer set search_path = public, pg_temp as $$
  select l.member_id, sum(l.delta)::int, max(l.created_at)
  from public.kr8_rings_ledger l
  where l.created_at >= p_w0 and l.created_at < p_w0 + interval '7 days' and public.kr8_rings_earn_reason(l.reason)
  group by l.member_id having sum(l.delta) > 0
$$;
-- order: Rings this week ↓, then whoever reached that total first, then the older member number
create or replace function public.kr8_week_ranked(p_w0 timestamptz, p_scope text, p_uid uuid)
returns table(member_id uuid, rings int, rk int) language sql stable security definer set search_path = public, pg_temp as $$
  with my as (select area from public.kr8_members where user_id = p_uid)
  select s.member_id, s.rings, (row_number() over (order by s.rings desc, s.last_at asc, m.member_no asc))::int
  from public.kr8_week_scores(p_w0) s join public.kr8_members m on m.user_id = s.member_id
  where (p_scope = 'all'
         or (p_scope = 'area' and m.area = (select area from my))
         or (p_scope = 'friends' and (s.member_id = p_uid or exists (select 1 from public.kr8_follows f where f.follower = p_uid and f.followee = s.member_id))))
    and (p_uid is null or s.member_id = p_uid or not public.kr8_is_blocked(p_uid, s.member_id))
$$;

create or replace function public.kr8_weekly_ranking(p_scope text default 'all')
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); w0 timestamptz := public.kr8_week_start(now()); r jsonb;
begin
  if p_scope not in ('all', 'area', 'friends') then raise exception 'KR8_BAD_SCOPE'; end if;
  if p_scope <> 'all' and uid is null then raise exception 'KR8_SIGN_IN'; end if;
  with cur as (select * from public.kr8_week_ranked(w0, p_scope, uid)),
       prev as (select * from public.kr8_week_ranked(w0 - interval '7 days', p_scope, uid)),
       rws as (
         select c.rk, c.rings, c.member_id, m.first_name, case when uid is null then null else m.photo end as photo, m.area,
                p.rk as prev_rk, c.member_id = uid as is_me
         from cur c join public.kr8_members m on m.user_id = c.member_id left join prev p on p.member_id = c.member_id)
  select jsonb_build_object(
    'week_start', w0, 'ends_at', w0 + interval '7 days', 'scope', p_scope,
    'area', (select area from public.kr8_members where user_id = uid),
    'total', (select count(*) from rws),
    'tenth', (select rings from rws where rk = 10),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', rk, 'rings', rings, 'user_id', member_id, 'first_name', first_name, 'photo', photo,
                       'area', area, 'move', case when prev_rk is null then null else prev_rk - rk end, 'is_me', is_me) order by rk)
                      from rws where rk <= 25), '[]'::jsonb),
    'me', (select jsonb_build_object('rank', rk, 'rings', rings, 'move', case when prev_rk is null then null else prev_rk - rk end) from rws where is_me))
  into r;
  return r;
end $$;

-- Weekly prizes, paid once per week (idempotent). Test members never get paid. Run at Sun 23:59 Bangkok or later.
-- p_week = that week's Monday (Bangkok). Default: the week that contains (now − 1 hour), so 23:59 Sun and 00:01 Mon both close the week just ending.
create or replace function public.kr8_close_week(p_week date default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare w0 timestamptz; n int;
begin
  w0 := case when p_week is null then public.kr8_week_start(now() - interval '1 hour') else (p_week::timestamp at time zone 'Asia/Bangkok') end;
  if extract(isodow from (w0 at time zone 'Asia/Bangkok')) <> 1 then raise exception 'KR8_NOT_MONDAY'; end if;
  if now() < w0 + interval '7 days' - interval '2 minutes' then raise exception 'KR8_WEEK_OPEN'; end if;
  with s as (
    select sc.member_id, (row_number() over (order by sc.rings desc, sc.last_at asc, m.member_no asc))::int as rk
    from public.kr8_week_scores(w0) sc join public.kr8_members m on m.user_id = sc.member_id
    where not public.kr8_is_test_member(sc.member_id))
  insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id)
  select member_id, case rk when 1 then 5000 when 2 then 3000 when 3 then 2000 else 500 end, 'weekly_top',
         'week:' || to_char(w0 at time zone 'Asia/Bangkok', 'YYYY-MM-DD')
  from s where rk <= 10
  on conflict do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('week', to_char(w0 at time zone 'Asia/Bangkok', 'YYYY-MM-DD'), 'paid', n);
end $$;

-- ───────────────────────── 7. Rewards: code stock, claims ─────────────────────────
create table if not exists public.kr8_reward_codes (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('grab', 'shopeepay', 'truemoney')),
  amount_thb int not null check (amount_thb in (100, 300, 500)),
  value_thb int generated always as (case when brand = 'truemoney' then amount_thb * 3 / 4 else amount_thb end) stored,
  code text not null check (length(code) between 4 and 200),
  activation_url text check (activation_url is null or activation_url ~ '^https://'),
  status text not null default 'available' check (status in ('available', 'assigned')),
  is_test boolean not null default false,
  assigned_to uuid,
  assigned_at timestamptz,
  claim_id uuid,
  added_at timestamptz not null default now(),
  unique (brand, code)
);
create index if not exists kr8_reward_codes_pick on public.kr8_reward_codes(brand, amount_thb, is_test, added_at) where status = 'available';
alter table public.kr8_reward_codes enable row level security;
revoke all on public.kr8_reward_codes from anon, authenticated;
grant select on public.kr8_reward_codes to authenticated;
drop policy if exists kr8_reward_codes_owner on public.kr8_reward_codes;
create policy kr8_reward_codes_owner on public.kr8_reward_codes for select to authenticated using (assigned_to = auth.uid());

create table if not exists public.kr8_reward_claims (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.kr8_members(user_id) on delete cascade,
  brand text not null check (brand in ('grab', 'shopeepay', 'truemoney')),
  amount_thb int not null check (amount_thb in (100, 300, 500)),
  rings int not null,
  status text not null check (status in ('assigned', 'pending', 'cancelled')),
  code_id uuid references public.kr8_reward_codes(id),
  device text,
  ip_hash text,
  is_test boolean not null default false,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  assigned_at timestamptz
);
create index if not exists kr8_reward_claims_member on public.kr8_reward_claims(member_id, created_at desc);
create index if not exists kr8_reward_claims_recent on public.kr8_reward_claims(assigned_at desc) where status = 'assigned';
create unique index if not exists kr8_reward_claims_one_pending on public.kr8_reward_claims(member_id, brand, amount_thb) where status = 'pending';
alter table public.kr8_reward_claims enable row level security;
revoke all on public.kr8_reward_claims from anon, authenticated;
grant select on public.kr8_reward_claims to authenticated;
drop policy if exists kr8_reward_claims_owner on public.kr8_reward_claims;
create policy kr8_reward_claims_owner on public.kr8_reward_claims for select to authenticated using (member_id = auth.uid());

-- One tap. Locks the member, checks the one-account rule and the balance, then takes the next unused code.
-- No stock: nothing is deducted; a pending claim is saved and filled automatically when codes are added.
create or replace function public.kr8_claim_reward(p_amount int, p_brand text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); need int; bal int; c public.kr8_reward_codes; cid uuid; test boolean; pend uuid;
        dev text := nullif(left(btrim(coalesce(p_device, '')), 64), '');
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if p_amount is null or p_amount not in (100, 300, 500) or p_brand is null or p_brand not in ('grab', 'shopeepay', 'truemoney') then raise exception 'KR8_BAD_REWARD'; end if;
  need := p_amount * 10;                                   -- 10 Rings = ฿1
  perform pg_advisory_xact_lock(hashtext('kr8_rings:' || uid::text));
  test := public.kr8_is_test_member(uid);
  -- one person, one account: a phone that claimed for another account in the last 30 days can't claim again
  if dev is not null and exists (select 1 from public.kr8_reward_claims where device = dev and member_id <> uid and created_at > now() - interval '30 days') then
    raise exception 'KR8_ONE_ACCOUNT';
  end if;
  if (select count(*) from public.kr8_reward_claims where member_id = uid and created_at >= public.kr8_bkk_day_start(now())) >= 3 then raise exception 'KR8_SLOW_DOWN'; end if;
  select balance into bal from public.kr8_rings_totals(uid);
  if bal < need then raise exception 'KR8_LOW_BALANCE'; end if;
  select id into pend from public.kr8_reward_claims where member_id = uid and brand = p_brand and amount_thb = p_amount and status = 'pending';
  if pend is not null then return jsonb_build_object('status', 'pending', 'claim_id', pend, 'brand', p_brand, 'amount', p_amount); end if;
  select * into c from public.kr8_reward_codes
    where brand = p_brand and amount_thb = p_amount and status = 'available' and is_test = test
    order by added_at, id limit 1 for update skip locked;
  if c.id is null then
    insert into public.kr8_reward_claims (member_id, brand, amount_thb, rings, status, device, ip_hash, is_test)
    values (uid, p_brand, p_amount, need, 'pending', dev, public.kr8_caller_ip_hash(), test) returning id into cid;
    return jsonb_build_object('status', 'pending', 'claim_id', cid, 'brand', p_brand, 'amount', p_amount);
  end if;
  cid := gen_random_uuid();
  insert into public.kr8_reward_claims (id, member_id, brand, amount_thb, rings, status, code_id, device, ip_hash, is_test, assigned_at)
  values (cid, uid, p_brand, p_amount, need, 'assigned', c.id, dev, public.kr8_caller_ip_hash(), test, now());
  update public.kr8_reward_codes set status = 'assigned', assigned_to = uid, assigned_at = now(), claim_id = cid where id = c.id;
  insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (uid, -need, 'claim', cid::text);
  return jsonb_build_object('status', 'assigned', 'claim_id', cid, 'brand', p_brand, 'amount', p_amount, 'value', c.value_thb,
                            'code', c.code, 'activation_url', c.activation_url);
end $$;

-- New stock fills waiting claims, oldest first (still checks each member's balance at that moment)
create or replace function public.kr8_fill_pending_claims() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare p record; c public.kr8_reward_codes; bal int; n int := 0;
begin
  for p in select * from public.kr8_reward_claims where status = 'pending' order by created_at limit 200 loop
    perform pg_advisory_xact_lock(hashtext('kr8_rings:' || p.member_id::text));
    select balance into bal from public.kr8_rings_totals(p.member_id);
    if bal < p.rings then
      update public.kr8_reward_claims set status = 'cancelled' where id = p.id and status = 'pending';
      continue;
    end if;
    c := null;
    select * into c from public.kr8_reward_codes where brand = p.brand and amount_thb = p.amount_thb and status = 'available' and is_test = p.is_test
      order by added_at, id limit 1 for update skip locked;
    if c.id is null then continue; end if;
    update public.kr8_reward_codes set status = 'assigned', assigned_to = p.member_id, assigned_at = now(), claim_id = p.id where id = c.id;
    update public.kr8_reward_claims set status = 'assigned', code_id = c.id, assigned_at = now() where id = p.id;
    insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (p.member_id, -p.rings, 'claim', p.id::text) on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
create or replace function public.kr8_codes_fill_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin perform public.kr8_fill_pending_claims(); exception when others then raise warning 'kr8_fill_pending_claims: %', sqlerrm; end;
  return null;
end $$;
drop trigger if exists kr8_codes_fill on public.kr8_reward_codes;
create trigger kr8_codes_fill after insert on public.kr8_reward_codes for each statement execute function public.kr8_codes_fill_trg();

-- Founder adds stock (admin only). Returns how many new codes were saved.
create or replace function public.kr8_admin_add_reward_codes(p_brand text, p_amount int, p_codes text[], p_activation_url text default null, p_test boolean default false)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  insert into public.kr8_reward_codes (brand, amount_thb, code, activation_url, is_test)
  select p_brand, p_amount, btrim(x), nullif(btrim(coalesce(p_activation_url, '')), ''), coalesce(p_test, false)
  from unnest(p_codes) x where btrim(coalesce(x, '')) <> ''
  on conflict (brand, code) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.kr8_mark_reward_used(p_claim uuid, p_used boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'KR8_SIGN_IN'; end if;
  update public.kr8_reward_claims set used_at = case when p_used then coalesce(used_at, now()) else null end
  where id = p_claim and member_id = auth.uid() and status = 'assigned';
  if not found then raise exception 'KR8_NO_CLAIM'; end if;
  return p_used;
end $$;

-- Everything the Rewards screens need, for the signed-in member only
create or replace function public.kr8_my_rewards()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); t record; r jsonb;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into t from public.kr8_rings_totals(uid);
  select jsonb_build_object(
    'balance', t.balance, 'lifetime', t.lifetime, 'week', t.week, 'level', public.kr8_rings_level(t.lifetime),
    'member_no', (select member_no from public.kr8_members where user_id = uid),
    'reel_place_today', exists (select 1 from public.kr8_rings_ledger where member_id = uid and reason = 'reel_place' and created_at >= public.kr8_bkk_day_start(now())),
    'best_likes', coalesce((select max(p.likes_count) from public.kr8_posts p where p.author = uid and p.kind = 'reel' and p.status = 'approved' and not p.hidden
                              and not exists (select 1 from public.kr8_rings_ledger l where l.member_id = uid and l.reason = 'likes_50' and l.ref_id = p.id::text)), 0),
    'friends', (select count(*) from public.kr8_rings_ledger where member_id = uid and reason = 'friend_join'),
    'claims', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'brand', c.brand, 'amount', c.amount_thb, 'rings', c.rings, 'status', c.status,
                 'value', k.value_thb, 'code', k.code, 'activation_url', k.activation_url, 'used_at', c.used_at, 'created_at', c.created_at, 'assigned_at', c.assigned_at)
                 order by c.created_at desc)
               from public.kr8_reward_claims c left join public.kr8_reward_codes k on k.id = c.code_id and k.assigned_to = uid
               where c.member_id = uid and c.status <> 'cancelled'), '[]'::jsonb),
    'earned', coalesce((select jsonb_agg(e order by (e->>'at') desc) from (
               select jsonb_build_object('reason', l.reason, 'delta', l.delta, 'at', l.created_at,
                 'detail', case l.reason
                   when 'reel_place' then (select pl.name_en from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id
                                           where pp.post_id::text = l.ref_id order by pp.position limit 1)
                   when 'friend_join' then (select first_name from public.kr8_members where user_id::text = l.ref_id)
                   when 'weekly_top' then substring(l.ref_id from 6)
                   else null end,
                 'detail_th', case when l.reason = 'reel_place' then (select pl.name_th from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id
                                           where pp.post_id::text = l.ref_id order by pp.position limit 1) end) as e
               from public.kr8_rings_ledger l where l.member_id = uid and l.reason <> 'claim' order by l.created_at desc limit 40) z), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Live feed of recent claims: first name + brand + amount + time. Never a code. Test claims only to test members.
create or replace function public.kr8_recent_claims(p_limit int default 8)
returns table(first_name text, photo text, brand text, amount int, value int, at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.first_name, case when auth.uid() is null then null else m.photo end, c.brand, c.amount_thb,
         case when c.brand = 'truemoney' then c.amount_thb * 3 / 4 else c.amount_thb end, c.assigned_at
  from public.kr8_reward_claims c join public.kr8_members m on m.user_id = c.member_id
  where c.status = 'assigned' and (not c.is_test or (auth.uid() is not null and public.kr8_is_test_member(auth.uid())))
  order by c.assigned_at desc
  limit least(greatest(coalesce(p_limit, 8), 1), 20)
$$;

-- Founder email on every claim (and "Restock <brand> ฿<amount>" when there was no code), same hook as notify-new-member
create or replace function public.kr8_claim_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'notify_hook_secret' limit 1;
  perform net.http_post(
    url := 'https://pedxoxpammnyfnizljyj.supabase.co/functions/v1/notify-reward',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', k),
    body := jsonb_build_object('type', 'INSERT', 'table', 'kr8_reward_claims',
      'record', jsonb_build_object('id', new.id, 'brand', new.brand, 'amount_thb', new.amount_thb, 'rings', new.rings, 'status', new.status,
                                   'is_test', new.is_test, 'created_at', new.created_at,
                                   'first_name', (select first_name from public.kr8_members where user_id = new.member_id),
                                   'member_no', (select member_no from public.kr8_members where user_id = new.member_id)),
      'stock', (select coalesce(jsonb_object_agg(brand || '_' || amount_thb, n), '{}'::jsonb) from (
                  select brand, amount_thb, count(*) n from public.kr8_reward_codes where status = 'available' and not is_test group by 1, 2) s)),
    timeout_milliseconds := 10000);
  return new;
exception when others then
  return new;   -- never block a claim
end $$;
drop trigger if exists kr8_claim_notify on public.kr8_reward_claims;
create trigger kr8_claim_notify after insert on public.kr8_reward_claims for each row execute function public.kr8_claim_notify();

-- ───────────────────────── 8. who may call what ─────────────────────────
-- internal helpers / trigger functions / scheduled job: not callable from the app
revoke execute on function public.kr8_rings_try_reel(uuid) from public, anon, authenticated;
revoke execute on function public.kr8_rings_post_trg() from public, anon, authenticated;
revoke execute on function public.kr8_post_places_rings() from public, anon, authenticated;
revoke execute on function public.kr8_rings_ref_trg() from public, anon, authenticated;
revoke execute on function public.kr8_rings_append_only() from public, anon, authenticated;
revoke execute on function public.kr8_fill_pending_claims() from public, anon, authenticated;
revoke execute on function public.kr8_codes_fill_trg() from public, anon, authenticated;
revoke execute on function public.kr8_claim_notify() from public, anon, authenticated;
revoke execute on function public.kr8_close_week(date) from public, anon, authenticated;
revoke execute on function public.kr8_rings_totals(uuid) from public, anon, authenticated;
revoke execute on function public.kr8_week_scores(timestamptz) from public, anon, authenticated;
revoke execute on function public.kr8_week_ranked(timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function public.kr8_close_week(date) to service_role;
-- app RPCs
grant execute on function public.kr8_set_tiktok_handle(text), public.kr8_add_place(text, text, text, double precision, double precision, text),
  public.kr8_create_reel_v2(text, text, integer, integer, integer, text, text, boolean, uuid[]), public.kr8_claim_reward(int, text, text),
  public.kr8_mark_reward_used(uuid, boolean), public.kr8_my_rewards(), public.kr8_admin_add_reward_codes(text, int, text[], text, boolean) to authenticated;
revoke execute on function public.kr8_set_tiktok_handle(text), public.kr8_add_place(text, text, text, double precision, double precision, text),
  public.kr8_create_reel_v2(text, text, integer, integer, integer, text, text, boolean, uuid[]), public.kr8_claim_reward(int, text, text),
  public.kr8_mark_reward_used(uuid, boolean), public.kr8_my_rewards(), public.kr8_admin_add_reward_codes(text, int, text[], text, boolean) from anon;
grant execute on function public.kr8_places_search(text, double precision, double precision, int), public.kr8_place_page(uuid), public.kr8_feed_extras(uuid[]),
  public.kr8_card_extras(uuid), public.kr8_weekly_ranking(text), public.kr8_recent_claims(int), public.kr8_ref_name(text) to anon, authenticated;

-- sequences: never usable from the app
revoke all on sequence public.kr8_member_no_seq from anon, authenticated;
do $$ declare q text; begin
  for q in select pg_get_serial_sequence('public.kr8_rings_ledger', 'id') loop
    if q is not null then execute format('revoke all on sequence %s from anon, authenticated', q); end if;
  end loop;
end $$;

commit;
