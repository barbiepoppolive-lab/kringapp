-- 0054 · Members can add a place that isn't on Kring yet (15 Nov 2026, member #16: "กูกินจุ" / "Gukinju" found nothing).
--
-- What was wrong: search itself worked (Thai and English, any part of the name), but the place was simply not in
-- kr8_places (66 rows: 63 seeded + 3 added from the Photon map search), and Photon/OpenStreetMap doesn't know it either.
-- There was no way for the member to add it, so the Reel could not be tagged.
--
-- ADDITIVE ONLY. New columns (with defaults, so every existing row stays exactly as it is and stays visible),
-- new functions, and one function body re-created with the SAME name, arguments and return type
-- (kr8_places_search: now also hides other members' not-yet-approved places, and matches with ILIKE '%q%').
-- Nothing is dropped or renamed. No table, policy or trigger is removed.
--
-- New:
--   kr8_places.status        'live' (default, every existing row) | 'pending' (typed in by a member, waiting for admin) | 'rejected'
--   kr8_places.added_how     null (old rows) | 'typed' (member typed the name)
--   kr8_places.maps_url      optional Google Maps link the member pasted
--   kr8_places.coords_rough  true when the pin is only the area centre (no link with coordinates was given)
--   kr8_places.reviewed_at / reviewed_by
--   kr8_places_search2(q, lat, lng, limit)        same as kr8_places_search + status column; pending rows only for the member who added them
--   kr8_member_add_place(name, area, maps_url, lat, lng) → jsonb   creates a pending place, usable on that member's Reel right away
--   kr8_admin_places_pending()                    admin list (pending first, then recently reviewed)
--   kr8_admin_place_review(id, action, …)         approve (optionally fixing names / area / pin) or reject
-- Note: kr8_places.source has a check (seed | photon | admin), so typed places use source 'photon' (= "added by a member
-- from the app", as before) with added_how = 'typed'. The check constraint is not touched.
--
-- UNDO (only if nothing uses them yet):
--   drop function if exists public.kr8_places_search2(text, double precision, double precision, int);
--   drop function if exists public.kr8_member_add_place(text, text, text, double precision, double precision);
--   drop function if exists public.kr8_admin_places_pending();
--   drop function if exists public.kr8_admin_place_review(uuid, text, text, text, text, double precision, double precision);
--   re-run the kr8_places_search body from 0044; the new columns can stay (they have defaults).

begin;

alter table public.kr8_places add column if not exists status text not null default 'live';
alter table public.kr8_places add column if not exists added_how text;
alter table public.kr8_places add column if not exists maps_url text;
alter table public.kr8_places add column if not exists coords_rough boolean not null default false;
alter table public.kr8_places add column if not exists reviewed_at timestamptz;
alter table public.kr8_places add column if not exists reviewed_by uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'kr8_places_status_chk') then
    alter table public.kr8_places add constraint kr8_places_status_chk check (status in ('live', 'pending', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'kr8_places_maps_url_chk') then
    alter table public.kr8_places add constraint kr8_places_maps_url_chk check (maps_url is null or (length(maps_url) <= 300 and maps_url ~ '^https://'));
  end if;
end $$;
create index if not exists kr8_places_pending on public.kr8_places (created_at desc) where status = 'pending';

-- centre of each Reel area (used as a rough pin when the member gives no map link)
create or replace function public.kr8_area_centre(a text, out lat double precision, out lng double precision)
language sql immutable as $$
  select coalesce(c.lat, 13.7563), coalesce(c.lng, 100.5018)
  from (select 1) one left join (values
    ('Bangkok', 13.7563, 100.5018), ('Ari', 13.7797, 100.5446), ('Siam', 13.7456, 100.5341), ('Thonglor', 13.7325, 100.5830),
    ('Talad Noi', 13.7322, 100.5137), ('Yaowarat', 13.7400, 100.5096), ('Silom', 13.7286, 100.5340), ('Sukhumvit', 13.7380, 100.5600),
    ('Chinatown', 13.7405, 100.5100), ('Riverside', 13.7230, 100.5140), ('Sathorn', 13.7190, 100.5290), ('Ratchada', 13.7660, 100.5740),
    ('Chatuchak', 13.7999, 100.5500), ('Bang Rak', 13.7300, 100.5240), ('Ekkamai', 13.7200, 100.5850), ('Phrom Phong', 13.7305, 100.5697),
    ('Old Town', 13.7520, 100.4940)
  ) c(name, lat, lng) on c.name = $1
$$;

create or replace function public.kr8_places_search2(p_q text default null, p_lat double precision default null, p_lng double precision default null, p_limit int default 20)
returns table(id uuid, name_en text, name_th text, area text, kr_area text, lat double precision, lng double precision, photo_url text, dist_m int, reels int, here_now int, status text)
language sql stable security definer set search_path = public, pg_temp as $$
  with q as (
    select public.kr8_norm(p_q) as s,
           lower(btrim(coalesce(p_q, ''))) as raw,
           '%' || regexp_replace(btrim(coalesce(p_q, '')), '([\\%_])', '\\\1', 'g') || '%' as pat
  ),
  vis as (
    select p.* from public.kr8_places p
    where p.status = 'live' or (p.status = 'pending' and p.created_by = auth.uid())
  ),
  hit as (
    select p.*, q.s, q.raw,
           case when q.raw = '' then 0
                when lower(p.name_en) = q.raw or p.name_th = btrim(p_q) then 0
                when public.kr8_norm(p.name_en) like q.s || '%' or public.kr8_norm(p.name_th) like q.s || '%' then 1
                when p.name_en ilike q.pat or coalesce(p.name_th, '') ilike q.pat or p.aliases ilike q.pat then 2
                when q.s <> '' and public.kr8_norm(p.name_en || ' ' || coalesce(p.name_th, '') || ' ' || p.aliases) like '%' || q.s || '%' then 2
                when not exists (select 1 from regexp_split_to_table(q.raw, '\s+') w where w <> ''
                                   and not (lower(p.name_en || ' ' || p.aliases || ' ' || p.area) ~ ('(^|[^a-z0-9])' || regexp_replace(w, '[^a-z0-9ก-๙]', '', 'g')))
                                   and position(w in coalesce(p.name_th, '')) = 0) then 3
                else 9 end as score
    from vis p, q
  )
  select h.id, h.name_en, h.name_th, h.area, h.kr_area, h.lat, h.lng, h.photo_url,
         case when p_lat is null or p_lng is null then null else round(public.kr8_dist_m(p_lat, p_lng, h.lat, h.lng))::int end,
         (select count(*)::int from public.kr8_post_places pp join public.kr8_posts po on po.id = pp.post_id
            where pp.place_id = h.id and not po.hidden and po.status = 'approved'),
         public.kr8_place_here_n(h.id),
         h.status
  from hit h
  where h.score < 9
  order by h.score, case when p_lat is null then 0 else public.kr8_dist_m(p_lat, p_lng, h.lat, h.lng) end, h.name_en
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

-- Same name / arguments / return type as 0044. Changes: ILIKE '%q%' on name_en, name_th and aliases (Thai has no spaces,
-- so any part of the name matches); other members' pending or rejected places are hidden.
create or replace function public.kr8_places_search(p_q text default null, p_lat double precision default null, p_lng double precision default null, p_limit int default 20)
returns table(id uuid, name_en text, name_th text, area text, kr_area text, lat double precision, lng double precision, photo_url text, dist_m int, reels int, here_now int)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id, s.name_en, s.name_th, s.area, s.kr_area, s.lat, s.lng, s.photo_url, s.dist_m, s.reels, s.here_now
  from public.kr8_places_search2(p_q, p_lat, p_lng, p_limit) s
$$;

-- A member types a place name that isn't on Kring: it is created as 'pending', tagged on their Reel right away,
-- and shows in admin → Places to approve. Same name in the same area (live, or pending by anyone) → that row is reused.
create or replace function public.kr8_member_add_place(p_name text, p_area text default 'Bangkok', p_maps_url text default null,
  p_lat double precision default null, p_lng double precision default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid(); v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_area text := case when public.kr8_area_ok(btrim(coalesce(p_area, ''))) then btrim(p_area) else 'Bangkok' end;
  v_url text := nullif(btrim(coalesce(p_maps_url, '')), ''); v_lat double precision; v_lng double precision; v_rough boolean := false;
  v_thai boolean; n int; r public.kr8_places;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if length(v_name) < 2 or length(v_name) > 80 or not public.kr8_text_ok(v_name, 80) then raise exception 'KR8_BAD_PLACE'; end if;
  if v_url is not null and (length(v_url) > 300 or v_url !~ '^https://([a-z0-9-]+\.)*(google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl|g\.co)/') then v_url := null; end if;
  if p_lat is not null and p_lng is not null and p_lat between 13.45 and 14.05 and p_lng between 100.25 and 100.95 then
    v_lat := p_lat; v_lng := p_lng;
  else
    select c.lat, c.lng into v_lat, v_lng from public.kr8_area_centre(v_area) c; v_rough := true;
  end if;
  v_thai := v_name ~ '[ก-๙]';

  select * into r from public.kr8_places p
  where p.status in ('live', 'pending')
    and (lower(p.name_en) = lower(v_name) or p.name_th = v_name)
    and (p.kr_area = v_area or public.kr8_dist_m(p.lat, p.lng, v_lat, v_lng) < 3000)
  order by (p.status = 'live') desc, p.created_at limit 1;
  if found then
    return jsonb_build_object('id', r.id, 'name_en', r.name_en, 'name_th', r.name_th, 'area', r.area, 'kr_area', r.kr_area,
                              'lat', r.lat, 'lng', r.lng, 'photo_url', r.photo_url, 'status', r.status, 'existing', true);
  end if;

  select count(*) into n from public.kr8_places where created_by = uid and added_how = 'typed' and created_at > now() - interval '1 day';
  if n >= 5 then raise exception 'KR8_SLOW_DOWN'; end if;

  insert into public.kr8_places (name_en, name_th, area, kr_area, lat, lng, source, created_by, status, added_how, maps_url, coords_rough)
  values (v_name, case when v_thai then v_name end, v_area, v_area, v_lat, v_lng, 'photon', uid, 'pending', 'typed', v_url, v_rough)
  on conflict do nothing
  returning * into r;
  if r.id is null then   -- same name at the same rounded pin (kr8_places_name_spot): reuse it
    select * into r from public.kr8_places p where lower(p.name_en) = lower(v_name)
      and round(p.lat::numeric, 3) = round(v_lat::numeric, 3) and round(p.lng::numeric, 3) = round(v_lng::numeric, 3) limit 1;
  end if;
  return jsonb_build_object('id', r.id, 'name_en', r.name_en, 'name_th', r.name_th, 'area', r.area, 'kr_area', r.kr_area,
                            'lat', r.lat, 'lng', r.lng, 'photo_url', r.photo_url, 'status', r.status, 'existing', false);
end $$;

-- Admin: places members typed in (pending first), who added them and how many Reels use them.
create or replace function public.kr8_admin_places_pending()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  select coalesce(jsonb_agg(x order by (x->>'status') = 'pending' desc, x->>'created_at' desc), '[]'::jsonb) into r from (
    select jsonb_build_object('id', p.id, 'name_en', p.name_en, 'name_th', p.name_th, 'area', p.area, 'kr_area', p.kr_area,
             'lat', p.lat, 'lng', p.lng, 'maps_url', p.maps_url, 'coords_rough', p.coords_rough, 'status', p.status,
             'created_at', p.created_at, 'reviewed_at', p.reviewed_at,
             'by_name', m.first_name, 'by_no', m.member_no,
             'reels', (select count(*)::int from public.kr8_post_places pp where pp.place_id = p.id)) as x
    from public.kr8_places p left join public.kr8_members m on m.user_id = p.created_by
    where p.added_how = 'typed' and (p.status = 'pending' or p.reviewed_at > now() - interval '14 days')
    limit 300
  ) t;
  return r;
end $$;

-- Admin: approve (optionally fixing the names, area and pin) or reject. Rejected places disappear from search;
-- Reels already tagged keep the tag (the admin can fix the name instead of rejecting).
create or replace function public.kr8_admin_place_review(p_id uuid, p_action text, p_name_en text default null, p_name_th text default null,
  p_area text default null, p_lat double precision default null, p_lng double precision default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.kr8_places;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'KR8_BAD_ACTION'; end if;
  update public.kr8_places p set
    status = case when p_action = 'approve' then 'live' else 'rejected' end,
    name_en = coalesce(nullif(btrim(coalesce(p_name_en, '')), ''), p.name_en),
    name_th = case when p_name_th is null then p.name_th else nullif(btrim(p_name_th), '') end,
    kr_area = case when p_area is not null and public.kr8_area_ok(p_area) then p_area else p.kr_area end,
    area = case when p_area is not null and public.kr8_area_ok(p_area) then p_area else p.area end,
    lat = case when p_lat between 13.45 and 14.05 and p_lng between 100.25 and 100.95 then p_lat else p.lat end,
    lng = case when p_lat between 13.45 and 14.05 and p_lng between 100.25 and 100.95 then p_lng else p.lng end,
    coords_rough = case when p_lat between 13.45 and 14.05 and p_lng between 100.25 and 100.95 then false else p.coords_rough end,
    reviewed_at = now(), reviewed_by = auth.uid()
  where p.id = p_id
  returning * into r;
  if r.id is null then raise exception 'KR8_NO_PLACE'; end if;
  return jsonb_build_object('id', r.id, 'status', r.status, 'name_en', r.name_en, 'name_th', r.name_th, 'kr_area', r.kr_area);
end $$;

revoke all on function public.kr8_area_centre(text) from public, anon;
revoke all on function public.kr8_places_search2(text, double precision, double precision, int) from public;
revoke all on function public.kr8_member_add_place(text, text, text, double precision, double precision) from public, anon;
revoke all on function public.kr8_admin_places_pending() from public, anon;
revoke all on function public.kr8_admin_place_review(uuid, text, text, text, text, double precision, double precision) from public, anon;
grant execute on function public.kr8_places_search2(text, double precision, double precision, int) to anon, authenticated;
grant execute on function public.kr8_member_add_place(text, text, text, double precision, double precision) to authenticated;
grant execute on function public.kr8_admin_places_pending() to authenticated;
grant execute on function public.kr8_admin_place_review(uuid, text, text, text, text, double precision, double precision) to authenticated;
grant execute on function public.kr8_area_centre(text) to authenticated;

commit;
