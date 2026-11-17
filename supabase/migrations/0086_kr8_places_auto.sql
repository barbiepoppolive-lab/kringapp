-- 0086 · Member-typed places decide themselves (17 Nov 2026). Founder: "can't you automate that? I don't want to waste my energy there".
--
-- Before: a place typed by a member (no map match) was saved 'pending' with a Bangkok-centre pin and sat in admin → Needs you
-- ("N new places from members: fix the name, then approve"). On 17 Nov all 3 were real places outside Bangkok, approved by hand.
--
-- Now, at the moment the member taps "Add" (kr8_member_add_place, same arguments and return type as 0054/0072):
--   1. the name is cleaned          kr8_place_clean: trim, collapse spaces, drop URLs / hashtags / emoji, max 80 characters
--   2. junk is refused silently     kr8_place_junk: phone numbers, URLs, LINE ids, rude or sexual words (Thai + English),
--                                   all-emoji / no letters, under 2 characters, or a term in kr8_place_banned.
--                                   Saved as 'rejected' (so admin can undo); the member sees the usual "Place added",
--                                   and the Reel keeps no place (trigger kr8_post_places_skip_rejected drops the tag).
--   3. duplicates are linked        kr8_place_match: same normalised name / alias, or pg_trgm similarity ≥ 0.8 (Thai + English),
--                                   numbers must agree ("rama 2" ≠ "rama 3"); the existing live place is returned, nothing new is made
--   4. everything else goes live    status 'live' at once, coords_rough true, no admin step
-- In the background (pg_cron 'kr8_places_geocode', every 10 minutes, pg_net — no edge function, no secrets):
--   rough live places are looked up by name in Thailand: Photon (komoot) first, then Nominatim (max 1 request per run).
--   A confident match sets the real lat/lng, osm_ref, area ('Outside Bangkok' or the district), outside_bkk (outside the
--   Bangkok box 13.45–14.05 / 100.25–100.95) and coords_rough false. No match → stays live as a text-only tag.
-- Every automatic decision is written to kr8_admin_actions_log (place_auto_reject / place_auto_link / place_auto_live /
-- place_geo_found / place_geo_miss); admin → Handled automatically shows them, admin → More → Places can hide / restore.
--
-- Schema changes (all additive, re-runnable):
--   pg_trgm extension (schema extensions)
--   kr8_places lat/lng checks widened from the Bangkok box to the Thailand box (5.6–20.5 / 97.3–105.7), so places found
--     outside Bangkok can carry their real pin. Every existing row already fits.
--   new tables kr8_place_banned (extra banned terms) and kr8_place_geo (geocoding state per place); RLS on, no policies
--   kr8_admin_v2_activity: body of 0082 + place auto actions marked automatic with the place name
-- Any 'pending' typed places left are set live (there were none on 17 Nov).
--
-- UNDO: select cron.unschedule('kr8_places_geocode'); drop trigger kr8_post_places_skip_rejected on public.kr8_post_places;
--       re-run kr8_member_add_place from 0072 and kr8_admin_v2_activity from 0082. The tables / functions can stay.
begin;

create extension if not exists pg_trgm with schema extensions;

-- ─────────── Thailand box for pins (was the Bangkok box) ───────────
alter table public.kr8_places drop constraint if exists kr8_places_lat_check;
alter table public.kr8_places drop constraint if exists kr8_places_lng_check;
alter table public.kr8_places add constraint kr8_places_lat_check check (lat between 5.6 and 20.5);
alter table public.kr8_places add constraint kr8_places_lng_check check (lng between 97.3 and 105.7);

create or replace function public.kr8_in_bkk(p_lat double precision, p_lng double precision) returns boolean
language sql immutable as $$ select p_lat between 13.45 and 14.05 and p_lng between 100.25 and 100.95 $$;
create or replace function public.kr8_in_th(p_lat double precision, p_lng double precision) returns boolean
language sql immutable as $$ select p_lat between 5.6 and 20.5 and p_lng between 97.3 and 105.7 $$;

-- ─────────── 1. clean ───────────
create or replace function public.kr8_place_clean(t text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare s text := coalesce(t, ''); s2 text; cut int;
begin
  s := regexp_replace(s, '(https?://|www\.)\S*', ' ', 'gi');
  s := regexp_replace(s, '\S+\.(com|net|org|co|me|ly|io|th|app|link|page|gg|to)(/\S*)?(\s|$)', ' ', 'gi');
  s2 := regexp_replace(s, '#\S+', ' ', 'g');                       -- hashtags go; a name that was only hashtags keeps its words
  if public.kr8_norm(s2) = '' then s2 := replace(s, '#', ' '); end if;
  s := s2;
  -- letters (Latin, accents, Thai, Japanese, Chinese, Korean), digits, spaces and light punctuation stay; emoji, symbols, zero-width go
  s := regexp_replace(s, '[^A-Za-z0-9À-ɏ̀-ͯḀ-ỿ฀-๿぀-ヿ一-鿿가-힯 &''().,/:+@-]', ' ', 'g');
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'));
  s := regexp_replace(s, '^[ &''.,/:+@-]+|[ &''.,/:+@(-]+$', '', 'g');
  s := regexp_replace(s, '\(\s*\)', '', 'g');
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'));
  if length(s) > 80 then
    s := left(s, 80); cut := length(s) - position(' ' in reverse(s));
    if position(' ' in s) > 0 and cut >= 40 then s := left(s, cut); end if;
    s := btrim(s);
  end if;
  return s;
end $$;

-- ─────────── 2. junk ───────────
create table if not exists public.kr8_place_banned (term text primary key check (length(btrim(term)) between 2 and 60), added_at timestamptz not null default now());
alter table public.kr8_place_banned enable row level security;
insert into public.kr8_place_banned (term) values
  ('happy ending'), ('sideline'), ('ไซด์ไลน์'), ('อาบอบนวด'), ('onlyfans'), ('telegram'), ('whatsapp'), ('wechat'),
  ('casino'), ('คาสิโน'), ('กาสิโน'), ('บาคาร่า'), ('baccarat'), ('สล็อต'), ('pg slot'), ('slot online'), ('เว็บตรง'), ('แทงบอล'), ('ufabet'), ('betflix'),
  ('หวยออนไลน์'), ('เงินกู้'), ('กู้เงิน'), ('crypto'), ('usdt')
on conflict do nothing;
delete from public.kr8_place_banned where term in ('test', 'ทดสอบ', 'asdf', 'qwerty', 'loan', 'slot') and added_at < now() - interval '1 second';   -- an earlier draft had these (too broad)

-- Returns why a typed name is junk (null = fine). raw = what the member typed, clean = kr8_place_clean(raw).
create or replace function public.kr8_place_junk(p_raw text, p_clean text default null) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare raw text := translate(coalesce(p_raw, ''), '๐๑๒๓๔๕๖๗๘๙', '0123456789'); c text := coalesce(p_clean, public.kr8_place_clean(p_raw)); lo text;
begin
  lo := lower(raw);
  if raw ~ '(\+?66|(^|[^0-9])0)[ .-]?[689]([ .-]?[0-9]){8}' or raw ~ '[0-9]([ .()-]?[0-9]){8,}' then return 'phone'; end if;
  if lo ~ '(https?://|www\.|line\.me|lin\.ee|bit\.ly|\m[a-z0-9-]+\.(com|net|org|co|me|ly|io|th|app|link|page|gg|to)\M)' then return 'url'; end if;
  if lo ~ '(\mline\s*(id)?\s*[:：=]|\mline\s*id\M|\mid\s*line\M|ไลน์\s*(ไอดี|id|[:：@])|ไอดีไลน์|แอดไลน์|ทักไลน์|^\s*@[a-z0-9_.-]{3,}\s*$|@[a-z0-9_.-]*[0-9]{2,})' then return 'line_id'; end if;
  if length(c) < 2 then return 'too_short'; end if;
  if c !~ '[A-Za-zÀ-ɏḀ-ỿก-ฮ぀-ヿ一-鿿가-힯]' then return 'no_letters'; end if;
  if lo ~ '\m(fuck\w*|f\*ck|shit\w*|bitch\w*|cunt|dick|cock|pussy|porn\w*|sex|sexy|xxx|nude|naked|boobs?|tits?|anal|blowjob|horny|slut|whore|escort|hooker|milf|rape|nigg\w*|fag|faggot|asshole|bastard|cum|jerk ?off|wank\w*)\M'
     or raw ~ '(เย็ด|เหี้ย|ควย|หี(?!บ)|แตด|สัส|ระยำ|จัญไร|อีดอก|อีตัว|กะหรี่|โป๊(?!ะ)|ลามก|ร่วมเพศ|ขายตัว|ชักว่าว|เงี่ยน|น้ำแตก|ส้นตีน|มึง)' then return 'rude'; end if;
  if lower(c) ~ '^(test|testing|tester|ทดสอบ|asdf\w*|qwerty|none|nothing|ไม่มี|ไม่รู้|no place|n ?/ ?a|xxx+|(.)\2{2,})$' then return 'placeholder'; end if;
  -- Latin terms match whole words ("test" ≠ "Latest Recipe"); Thai terms match anywhere (Thai has no spaces)
  if exists (select 1 from public.kr8_place_banned b
             where case when lower(b.term) ~ '^[a-z0-9 ]+$' then lo ~ ('\m' || lower(b.term) || '\M') else position(lower(b.term) in lo) > 0 end) then return 'banned'; end if;
  return null;
end $$;

-- ─────────── 3. duplicate of a live place ───────────
-- Best live place whose name / Thai name / alias matches: same normalised text, or trigram similarity ≥ 0.8 with the same digits.
-- With a real pin from the member, a place more than 3 km away is not the same place (chains: "Starbucks" in Ari ≠ Silom).
-- lower case, words kept apart by single spaces (trigram similarity is kinder on whole words: "roaster" vs "roasters")
create or replace function public.kr8_norm_sp(t text) returns text
language sql immutable as $$ select btrim(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9ก-๙]+', ' ', 'g')) $$;

create or replace function public.kr8_place_match(p_name text, p_lat double precision default null, p_lng double precision default null) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  with q as (select public.kr8_norm(p_name) s, public.kr8_norm_sp(p_name) sp, regexp_replace(public.kr8_norm(p_name), '[^0-9]', '', 'g') d),
  names as (
    select p.id, p.added_how, p.created_at, p.lat, p.lng, p.coords_rough, public.kr8_norm(a.n) n, public.kr8_norm_sp(a.n) nsp
    from public.kr8_places p
    cross join lateral (select p.name_en union all select p.name_th union all select regexp_split_to_table(coalesce(p.aliases, ''), '\s*[,;|\n]\s*')) a(n)
    where p.status = 'live' and a.n is not null and btrim(a.n) <> ''
  ),
  scored as (
    select x.*, case when x.n = q.s then 1.0
                     when length(q.s) >= 4 and length(x.n) >= 4 and regexp_replace(x.n, '[^0-9]', '', 'g') = q.d
                       then greatest(extensions.similarity(x.n, q.s), extensions.similarity(x.nsp, q.sp))
                     else 0 end as sim
    from names x, q where q.s <> ''
  )
  select id from scored
  where sim >= 0.8
    and (p_lat is null or p_lng is null or coords_rough or public.kr8_dist_m(p_lat, p_lng, lat, lng) < 3000)
  order by sim desc, (added_how is null) desc, created_at
  limit 1
$$;

create or replace function public.kr8_place_log(p_action text, p_detail jsonb) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.kr8_admin_actions_log (action, detail) values (p_action, p_detail)
$$;

-- ─────────── 4. the member adds a place (same arguments / return type as 0054, 0072) ───────────
create or replace function public.kr8_member_add_place(p_name text, p_area text default 'Bangkok', p_maps_url text default null,
  p_lat double precision default null, p_lng double precision default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid(); v_name text := public.kr8_place_clean(p_name); v_junk text; v_dupe uuid; v_no int;
  v_area text := case when public.kr8_area_ok(btrim(coalesce(p_area, ''))) then btrim(p_area) else 'Bangkok' end;
  v_url text := nullif(btrim(coalesce(p_maps_url, '')), ''); v_lat double precision; v_lng double precision; v_rough boolean := false;
  v_out boolean; n int; n_new int; r public.kr8_places;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select member_no into v_no from public.kr8_members where user_id = uid;
  if not found then raise exception 'KR8_NO_CARD'; end if;
  if v_url is not null and (length(v_url) > 300 or v_url !~ '^https://([a-z0-9-]+\.)*(google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl|g\.co)/') then v_url := null; end if;
  select count(*) into n from public.kr8_places where created_by = uid and added_how = 'typed' and created_at > now() - interval '1 day';
  select count(*) into n_new from public.kr8_places where created_by = uid and added_how = 'typed' and status <> 'rejected' and created_at > now() - interval '1 day';

  -- junk: saved as rejected (admin can restore), never shown, and the Reel keeps no place
  v_junk := public.kr8_place_junk(p_name, v_name);
  if v_junk is not null then
    if n >= 20 then raise exception 'KR8_SLOW_DOWN'; end if;
    select c.lat, c.lng into v_lat, v_lng from public.kr8_area_centre('Bangkok') c;
    insert into public.kr8_places (name_en, area, kr_area, lat, lng, source, created_by, status, added_how, coords_rough, reviewed_at)
    values (coalesce(nullif(left(v_name, 80), ''), nullif(left(btrim(coalesce(p_name, '')), 80), ''), '·'), v_area, v_area, v_lat, v_lng,
            'photon', uid, 'rejected', 'typed', true, now())
    on conflict do nothing returning * into r;
    if r.id is null then
      select * into r from public.kr8_places p where lower(p.name_en) = lower(coalesce(nullif(left(v_name, 80), ''), nullif(left(btrim(coalesce(p_name, '')), 80), ''), '·'))
        and round(p.lat::numeric, 3) = round(v_lat::numeric, 3) and round(p.lng::numeric, 3) = round(v_lng::numeric, 3) limit 1;
    end if;
    perform public.kr8_place_log('place_auto_reject', jsonb_build_object('place_id', r.id, 'name', left(coalesce(p_name, ''), 120), 'reason', v_junk, 'by', uid, 'no', v_no));
    return jsonb_build_object('id', r.id, 'name_en', r.name_en, 'name_th', r.name_th, 'area', r.area, 'kr_area', r.kr_area,
                              'lat', r.lat, 'lng', r.lng, 'photo_url', r.photo_url, 'status', 'rejected', 'existing', false, 'outside_bkk', r.outside_bkk);
  end if;

  -- a real pin (Google Maps link) anywhere in Thailand is kept
  if p_lat is not null and p_lng is not null and public.kr8_in_th(p_lat, p_lng) then
    v_lat := p_lat; v_lng := p_lng; v_out := not public.kr8_in_bkk(p_lat, p_lng);
  else
    v_out := public.kr8_place_outside(v_name, null, null);
    select c.lat, c.lng into v_lat, v_lng from public.kr8_area_centre(case when v_out then 'Bangkok' else v_area end) c; v_rough := true;
  end if;

  -- duplicate of a live place → that place
  v_dupe := public.kr8_place_match(v_name, case when v_rough then null else v_lat end, case when v_rough then null else v_lng end);
  if v_dupe is not null then
    select * into r from public.kr8_places where id = v_dupe;
    perform public.kr8_place_log('place_auto_link', jsonb_build_object('place_id', r.id, 'name', left(coalesce(p_name, ''), 120), 'into', r.name_en, 'by', uid, 'no', v_no));
    return jsonb_build_object('id', r.id, 'name_en', r.name_en, 'name_th', r.name_th, 'area', r.area, 'kr_area', r.kr_area,
                              'lat', r.lat, 'lng', r.lng, 'photo_url', r.photo_url, 'status', r.status, 'existing', true, 'outside_bkk', r.outside_bkk);
  end if;

  if n_new >= 5 then raise exception 'KR8_SLOW_DOWN'; end if;
  insert into public.kr8_places (name_en, name_th, area, kr_area, lat, lng, source, created_by, status, added_how, maps_url, coords_rough, outside_bkk, reviewed_at)
  values (v_name, case when v_name ~ '[ก-๙]' then v_name end, case when v_out then 'Outside Bangkok' else v_area end, case when v_out then 'Bangkok' else v_area end,
          v_lat, v_lng, 'photon', uid, 'live', 'typed', v_url, v_rough, v_out, now())
  on conflict do nothing
  returning * into r;
  if r.id is null then   -- same name at the same rounded pin (kr8_places_name_spot): reuse it
    select * into r from public.kr8_places p where lower(p.name_en) = lower(v_name)
      and round(p.lat::numeric, 3) = round(v_lat::numeric, 3) and round(p.lng::numeric, 3) = round(v_lng::numeric, 3) limit 1;
    if r.status = 'rejected' then   -- an earlier junk / hidden row with this exact name: the member's Reel keeps no place
      return jsonb_build_object('id', r.id, 'name_en', r.name_en, 'name_th', r.name_th, 'area', r.area, 'kr_area', r.kr_area,
                                'lat', r.lat, 'lng', r.lng, 'photo_url', r.photo_url, 'status', 'rejected', 'existing', true, 'outside_bkk', r.outside_bkk);
    end if;
  else
    perform public.kr8_place_log('place_auto_live', jsonb_build_object('place_id', r.id, 'name', r.name_en, 'outside', r.outside_bkk, 'rough', r.coords_rough, 'by', uid, 'no', v_no));
  end if;
  return jsonb_build_object('id', r.id, 'name_en', r.name_en, 'name_th', r.name_th, 'area', r.area, 'kr_area', r.kr_area,
                            'lat', r.lat, 'lng', r.lng, 'photo_url', r.photo_url, 'status', r.status, 'existing', false, 'outside_bkk', r.outside_bkk);
end $$;
revoke all on function public.kr8_member_add_place(text, text, text, double precision, double precision) from public, anon;
grant execute on function public.kr8_member_add_place(text, text, text, double precision, double precision) to authenticated;

-- A refused (junk / hidden) place never sticks to a Reel: the tag is dropped silently, the Reel posts without it.
create or replace function public.kr8_post_places_skip_rejected() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.kr8_places p where p.id = new.place_id and p.status = 'rejected') then return null; end if;
  return new;
end $$;
drop trigger if exists kr8_post_places_skip_rejected on public.kr8_post_places;
create trigger kr8_post_places_skip_rejected before insert on public.kr8_post_places for each row execute function public.kr8_post_places_skip_rejected();

-- ─────────── background geocoding (pg_cron + pg_net) ───────────
create table if not exists public.kr8_place_geo (
  place_id uuid primary key references public.kr8_places(id) on delete cascade,
  state text not null default 'new' check (state in ('new', 'asked', 'retry', 'need_nominatim', 'found', 'not_found', 'conflict')),
  provider text check (provider in ('photon', 'nominatim')),
  req_id bigint, asked_at timestamptz, errors int not null default 0, tries int not null default 0,
  result jsonb, updated_at timestamptz not null default now());
alter table public.kr8_place_geo enable row level security;

-- Provider replies → one shape: [{name, names[], lat, lng, ref, district}]
create or replace function public.kr8_geo_cands(p_provider text, p_body jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(c), '[]'::jsonb) from (
    select jsonb_build_object('name', f -> 'properties' ->> 'name',
             'names', jsonb_build_array(f -> 'properties' ->> 'name'),
             'lat', (f -> 'geometry' -> 'coordinates' ->> 1)::double precision, 'lng', (f -> 'geometry' -> 'coordinates' ->> 0)::double precision,
             'ref', case when f -> 'properties' ->> 'osm_type' in ('N', 'W', 'R') and f -> 'properties' ->> 'osm_id' is not null
                         then (f -> 'properties' ->> 'osm_type') || (f -> 'properties' ->> 'osm_id') end,
             'district', coalesce(f -> 'properties' ->> 'district', f -> 'properties' ->> 'locality'), 'key', f -> 'properties' ->> 'osm_key') c
    from jsonb_array_elements(case when p_provider = 'photon' and jsonb_typeof(p_body -> 'features') = 'array' then p_body -> 'features' else '[]'::jsonb end) f
    where coalesce(f -> 'properties' ->> 'countrycode', 'TH') = 'TH' and f -> 'properties' ->> 'name' is not null
    union all
    select jsonb_build_object('name', coalesce(nullif(e ->> 'name', ''), e -> 'namedetails' ->> 'name'),
             'names', coalesce((select jsonb_agg(v) from jsonb_each_text(case when jsonb_typeof(e -> 'namedetails') = 'object' then e -> 'namedetails' else '{}'::jsonb end) t(k, v)
                                  where k in ('name', 'name:th', 'name:en', 'alt_name', 'official_name', 'short_name')), '[]'::jsonb) || jsonb_build_array(e ->> 'name'),
             'lat', (e ->> 'lat')::double precision, 'lng', (e ->> 'lon')::double precision,
             'ref', case e ->> 'osm_type' when 'node' then 'N' when 'way' then 'W' when 'relation' then 'R' end || (e ->> 'osm_id'),
             'district', coalesce(e -> 'address' ->> 'city_district', e -> 'address' ->> 'suburb', e -> 'address' ->> 'district'), 'key', e ->> 'category') c
    from jsonb_array_elements(case when p_provider = 'nominatim' and jsonb_typeof(p_body) = 'array' then p_body else '[]'::jsonb end) e
    where coalesce(e -> 'address' ->> 'country_code', 'th') = 'th' and coalesce(nullif(e ->> 'name', ''), e -> 'namedetails' ->> 'name') is not null
  ) z
$$;

-- "จังหวัดนครศรีธรรมราช", "เทศบาลนครนครศรีธรรมราช", "Kanchanaburi Province" → the bare place name
create or replace function public.kr8_geo_strip(t text) returns text
language sql immutable as $$
  select btrim(regexp_replace(regexp_replace(coalesce(t, ''), '^\s*(จังหวัด|อำเภอ|เทศบาลนคร|เทศบาลเมือง|เทศบาลตำบล|ตำบล|เขต|แขวง)\s*', ''),
                              '\s+(Province|District|Subdistrict|City Municipality|Town Municipality|Municipality|City)\s*$', '', 'i'))
$$;

-- Best confident candidate, or null. Name must match (trigram ≥ 0.65 on normalised names, or one contains the other and the
-- shorter is ≥ 70% of the longer). A name that doesn't say "outside Bangkok" only takes an outside pin on a near-exact match (≥ 0.95); numbers in the names must agree.
-- Near-exact names win first ("นครศรีธรรมราช" = the city, not a Bangkok restaurant called "ข้าวแกงปักษ์ใต้ นครศรีธรรมราช"),
-- then Bangkok-vs-outside as the name suggests, then the place itself before a bus stop / road named after it.
create or replace function public.kr8_geo_best(p_name text, p_cands jsonb) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  with q as (select public.kr8_norm(p_name) s, regexp_replace(public.kr8_norm(p_name), '[^0-9]', '', 'g') d, public.kr8_place_outside(p_name, null, null) hint_out),
  c as (
    select x.c, (x.c ->> 'lat')::double precision lat, (x.c ->> 'lng')::double precision lng,
           (select max(case when public.kr8_norm(n) = q.s then 1.0
                            when regexp_replace(public.kr8_norm(n), '[^0-9]', '', 'g') <> q.d then 0   -- numbers must agree ("Central Park 2" ≠ "Central Park")
                            when length(q.s) >= 3 and length(public.kr8_norm(n)) >= 3
                                 and (position(q.s in public.kr8_norm(n)) > 0 or position(public.kr8_norm(n) in q.s) > 0)
                                 and least(length(q.s), length(public.kr8_norm(n)))::numeric / greatest(length(q.s), length(public.kr8_norm(n))) >= 0.7
                              then greatest(extensions.similarity(public.kr8_norm(n), q.s),
                                            0.5 + 0.5 * least(length(q.s), length(public.kr8_norm(n)))::numeric / greatest(length(q.s), length(public.kr8_norm(n))))
                            else extensions.similarity(public.kr8_norm(n), q.s) end)
              from jsonb_array_elements_text(coalesce(x.c -> 'names', '[]'::jsonb)) n0, lateral (values (n0), (public.kr8_geo_strip(n0))) v(n) where n <> '') sim, q.hint_out
    from jsonb_array_elements(coalesce(p_cands, '[]'::jsonb)) x(c), q where q.s <> ''
  )
  select c.c || jsonb_build_object('conf', round(c.sim::numeric, 3), 'outside', not public.kr8_in_bkk(c.lat, c.lng))
  from c
  where c.lat is not null and c.lng is not null and public.kr8_in_th(c.lat, c.lng) and c.sim >= 0.65
    and (c.hint_out or public.kr8_in_bkk(c.lat, c.lng) or c.sim >= 0.95)
  order by (c.sim >= 0.9) desc, (public.kr8_in_bkk(c.lat, c.lng) = not c.hint_out) desc,
           (coalesce(c.c ->> 'key', '') in ('highway', 'railway', 'public_transport')) asc, c.sim desc   -- the place itself before its bus stop
  limit 1
$$;

-- Apply one provider reply to one place. Returns the new kr8_place_geo state.
create or replace function public.kr8_place_geo_apply(p_place uuid, p_provider text, p_body jsonb) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.kr8_places; best jsonb; v_lat double precision; v_lng double precision; v_out boolean; v_area text; v_ref text; st text;
begin
  select * into p from public.kr8_places where id = p_place;
  if p.id is null or p.status <> 'live' or not p.coords_rough then
    update public.kr8_place_geo set state = 'found', req_id = null, updated_at = now() where place_id = p_place; return 'found';
  end if;
  best := public.kr8_geo_best(p.name_en, public.kr8_geo_cands(p_provider, p_body));
  if best is null and p.name_th is not null and p.name_th <> p.name_en then best := public.kr8_geo_best(p.name_th, public.kr8_geo_cands(p_provider, p_body)); end if;
  if best is null then
    st := case when p_provider = 'photon' then 'need_nominatim' else 'not_found' end;
    update public.kr8_place_geo set state = st, provider = p_provider, req_id = null, tries = tries + 1, updated_at = now() where place_id = p_place;
    if st = 'not_found' then perform public.kr8_place_log('place_geo_miss', jsonb_build_object('place_id', p.id, 'name', p.name_en)); end if;
    return st;
  end if;
  v_lat := (best ->> 'lat')::double precision; v_lng := (best ->> 'lng')::double precision; v_out := not public.kr8_in_bkk(v_lat, v_lng);
  v_ref := best ->> 'ref';
  if v_ref is not null and exists (select 1 from public.kr8_places where osm_ref = v_ref and id <> p.id) then v_ref := null; end if;
  v_area := case when v_out then 'Outside Bangkok'
                 -- an English district name only (the app translates English area names; a Thai one would show untranslated)
                 when p.area in ('Bangkok', 'Outside Bangkok') and coalesce(best ->> 'district', '') ~ '^[A-Za-z][A-Za-z .''-]+$'
                      and nullif(btrim(regexp_replace(coalesce(best ->> 'district', ''), '^(เขต|แขวง)\s*|\s+(District|Subdistrict)$', '', 'g')), '') is not null
                   then left(btrim(regexp_replace(best ->> 'district', '^(เขต|แขวง)\s*|\s+(District|Subdistrict)$', '', 'g')), 40)
                 else p.area end;
  begin
    update public.kr8_places set lat = v_lat, lng = v_lng, coords_rough = false, outside_bkk = v_out, area = v_area,
                                 osm_ref = coalesce(osm_ref, v_ref)
    where id = p.id;
  exception when unique_violation then
    update public.kr8_place_geo set state = 'conflict', provider = p_provider, req_id = null, result = best, updated_at = now() where place_id = p_place;
    perform public.kr8_place_log('place_geo_miss', jsonb_build_object('place_id', p.id, 'name', p.name_en, 'reason', 'same name already pinned there'));
    return 'conflict';
  end;
  update public.kr8_place_geo set state = 'found', provider = p_provider, req_id = null, tries = tries + 1, result = best, updated_at = now() where place_id = p_place;
  perform public.kr8_place_log('place_geo_found', jsonb_build_object('place_id', p.id, 'name', p.name_en, 'via', p_provider, 'match', best ->> 'name',
    'conf', best -> 'conf', 'lat', v_lat, 'lng', v_lng, 'outside', v_out, 'was_outside', p.outside_bkk, 'area', v_area));
  return 'found';
end $$;

-- Every 10 minutes: read last run's replies, then ask about up to p_photon (2) places on Photon and p_nomi (1) on Nominatim
-- (gentle on both public services; Nominatim policy: ≤ 1 request a second, identifying User-Agent).
create or replace function public.kr8_places_geocode_tick(p_photon int default 2, p_nomi int default 1) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare g record; resp record; body jsonb; done int := 0; sent int := 0; rid bigint;
  ua jsonb := jsonb_build_object('User-Agent', 'KringApp/1.0 (+https://kringapp.com; places geocoder)', 'Accept-Language', 'th,en');
begin
  -- 1. replies
  for g in select * from public.kr8_place_geo where state = 'asked' and req_id is not null loop
    select r.status_code, r.content, r.timed_out, r.error_msg into resp from net._http_response r where r.id = g.req_id;
    if not found then
      if g.asked_at < now() - interval '30 minutes' then   -- reply lost
        update public.kr8_place_geo set errors = case when provider = 'photon' and errors >= 1 then 0 else errors + 1 end, req_id = null, updated_at = now(),
          state = case when provider = 'photon' and errors >= 1 then 'need_nominatim' when provider = 'nominatim' and errors >= 3 then 'not_found' else 'retry' end
        where place_id = g.place_id;
      end if;
      continue;
    end if;
    if coalesce(resp.timed_out, false) or resp.status_code is distinct from 200 then   -- busy / timed out: Photon twice, then Nominatim; Nominatim 4 times
      update public.kr8_place_geo set errors = case when provider = 'photon' and errors >= 1 then 0 else errors + 1 end, req_id = null, updated_at = now(),
        state = case when provider = 'photon' and errors >= 1 then 'need_nominatim' when provider = 'nominatim' and errors >= 3 then 'not_found' else 'retry' end
      where place_id = g.place_id;
      continue;
    end if;
    begin body := resp.content::jsonb; exception when others then body := '[]'::jsonb; end;
    perform public.kr8_place_geo_apply(g.place_id, g.provider, body);
    done := done + 1;
  end loop;

  -- 2. new rough live places join the queue
  insert into public.kr8_place_geo (place_id)
  select p.id from public.kr8_places p where p.status = 'live' and p.coords_rough
  on conflict (place_id) do nothing;

  -- 3. ask
  for g in select q.place_id, p.name_en from public.kr8_place_geo q join public.kr8_places p on p.id = q.place_id
           where p.status = 'live' and p.coords_rough and (q.state = 'new' or (q.state = 'retry' and coalesce(q.provider, 'photon') = 'photon'))
           order by q.updated_at limit greatest(p_photon, 0) loop
    rid := net.http_get('https://photon.komoot.io/api/',
             jsonb_build_object('q', g.name_en, 'lat', '13.75', 'lon', '100.5', 'limit', '6', 'bbox', '97.3,5.6,105.7,20.5',
                                'lang', case when g.name_en ~ '[ก-๙]' then 'default' else 'en' end), ua, 10000);   -- 'default' = the local (Thai) name, so Thai names compare with Thai
    update public.kr8_place_geo set state = 'asked', provider = 'photon', req_id = rid, asked_at = now(), updated_at = now() where place_id = g.place_id;
    sent := sent + 1;
  end loop;
  for g in select q.place_id, p.name_en from public.kr8_place_geo q join public.kr8_places p on p.id = q.place_id
           where p.status = 'live' and p.coords_rough and (q.state = 'need_nominatim' or (q.state = 'retry' and q.provider = 'nominatim'))
           order by q.updated_at limit greatest(p_nomi, 0) loop
    rid := net.http_get('https://nominatim.openstreetmap.org/search',
             jsonb_build_object('q', g.name_en, 'countrycodes', 'th', 'format', 'jsonv2', 'limit', '5', 'addressdetails', '1', 'namedetails', '1'), ua, 10000);
    update public.kr8_place_geo set state = 'asked', provider = 'nominatim', req_id = rid, asked_at = now(), updated_at = now() where place_id = g.place_id;
    sent := sent + 1;
  end loop;
  return jsonb_build_object('read', done, 'asked', sent);
end $$;

revoke all on function public.kr8_place_junk(text, text) from public, anon;
revoke all on function public.kr8_place_match(text, double precision, double precision) from public, anon;
revoke all on function public.kr8_place_log(text, jsonb) from public, anon, authenticated;
revoke all on function public.kr8_post_places_skip_rejected() from public, anon, authenticated;
revoke all on function public.kr8_place_geo_apply(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.kr8_places_geocode_tick(int, int) from public, anon, authenticated;
grant execute on function public.kr8_place_clean(text) to authenticated;
grant execute on function public.kr8_norm_sp(text) to authenticated;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'kr8_places_geocode') then perform cron.unschedule('kr8_places_geocode'); end if;
  perform cron.schedule('kr8_places_geocode', '*/10 * * * *', 'select public.kr8_places_geocode_tick()');
end $$;

-- ─────────── admin: what happened automatically · browse · hide / restore ───────────
create or replace function public.kr8_admin_places_auto(p_days int default 7) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return coalesce((select jsonb_agg(x order by x ->> 'at' desc) from (
    select jsonb_build_object('at', g.at, 'action', g.action, 'place_id', g.detail ->> 'place_id', 'name', g.detail ->> 'name', 'reason', g.detail ->> 'reason',
             'into', g.detail ->> 'into', 'outside', (g.detail ->> 'outside')::boolean, 'area', g.detail ->> 'area', 'no', (g.detail ->> 'no')::int,
             'status', p.status, 'now_name', p.name_en) x
    from public.kr8_admin_actions_log g left join public.kr8_places p on p.id::text = g.detail ->> 'place_id'
    where g.action in ('place_auto_reject', 'place_auto_link', 'place_auto_live', 'place_geo_found', 'place_geo_miss')
      and g.at > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 60))
    order by g.at desc limit 300) z), '[]'::jsonb);
end $$;

create or replace function public.kr8_admin_places_list(p_filter text default 'members', p_q text default null, p_limit int default 200) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return coalesce((select jsonb_agg(x order by x ->> 'created_at' desc) from (
    select jsonb_build_object('id', p.id, 'name_en', p.name_en, 'name_th', p.name_th, 'area', p.area, 'status', p.status, 'added_how', p.added_how,
             'outside_bkk', p.outside_bkk, 'coords_rough', p.coords_rough, 'osm_ref', p.osm_ref, 'lat', p.lat, 'lng', p.lng, 'created_at', p.created_at,
             'by_no', m.member_no, 'by_name', m.first_name, 'geo', q.state,
             'reels', (select count(*)::int from public.kr8_post_places pp where pp.place_id = p.id),
             'auto', (select g.action || coalesce(':' || (g.detail ->> 'reason'), '') from public.kr8_admin_actions_log g
                       where g.detail ->> 'place_id' = p.id::text and g.action like 'place\_auto\_%' order by g.at desc limit 1)) x
    from public.kr8_places p left join public.kr8_members m on m.user_id = p.created_by left join public.kr8_place_geo q on q.place_id = p.id
    where case coalesce(p_filter, 'members') when 'members' then p.added_how = 'typed' when 'hidden' then p.status = 'rejected' else true end
      and (nullif(btrim(coalesce(p_q, '')), '') is null or p.name_en ilike '%' || btrim(p_q) || '%' or coalesce(p.name_th, '') ilike '%' || btrim(p_q) || '%')
    order by p.created_at desc limit least(greatest(coalesce(p_limit, 200), 1), 500)) z), '[]'::jsonb);
end $$;

-- hide: the place leaves search and every Reel (the Reels are remembered); restore: back to live, tags put back where there is room.
create or replace function public.kr8_admin_place_undo(p_id uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.kr8_places; posts jsonb; n int := 0;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if p_action not in ('hide', 'restore') then raise exception 'KR8_BAD_ACTION'; end if;
  select * into r from public.kr8_places where id = p_id;
  if r.id is null then raise exception 'KR8_NO_PLACE'; end if;
  if p_action = 'hide' then
    select coalesce(jsonb_agg(post_id), '[]'::jsonb) into posts from public.kr8_post_places where place_id = p_id;
    delete from public.kr8_post_places where place_id = p_id;
    update public.kr8_places set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid() where id = p_id;
    insert into public.kr8_admin_actions_log (action, detail) values ('place_hidden', jsonb_build_object('place_id', p_id, 'name', r.name_en, 'posts', posts));
    n := jsonb_array_length(posts);
  else
    update public.kr8_places set status = 'live', reviewed_at = now(), reviewed_by = auth.uid() where id = p_id;
    select g.detail -> 'posts' into posts from public.kr8_admin_actions_log g where g.action = 'place_hidden' and g.detail ->> 'place_id' = p_id::text order by g.at desc limit 1;
    insert into public.kr8_post_places (post_id, place_id, position)
    select x.pid, p_id, (select coalesce(max(pp.position), 0) + 1 from public.kr8_post_places pp where pp.post_id = x.pid)::smallint
    from (select (v #>> '{}')::uuid pid from jsonb_array_elements(coalesce(posts, '[]'::jsonb)) v) x
    where exists (select 1 from public.kr8_posts po where po.id = x.pid)
      and (select count(*) from public.kr8_post_places pp where pp.post_id = x.pid) < 2
    on conflict do nothing;
    get diagnostics n = row_count;
    insert into public.kr8_admin_actions_log (action, detail) values ('place_restored', jsonb_build_object('place_id', p_id, 'name', r.name_en, 'retagged', n));
  end if;
  return jsonb_build_object('id', p_id, 'status', case when p_action = 'hide' then 'rejected' else 'live' end, 'reels', n);
end $$;

revoke all on function public.kr8_admin_places_auto(int) from public, anon;
revoke all on function public.kr8_admin_places_list(text, text, int) from public, anon;
revoke all on function public.kr8_admin_place_undo(uuid, text) from public, anon;
grant execute on function public.kr8_admin_places_auto(int) to authenticated;
grant execute on function public.kr8_admin_places_list(text, text, int) to authenticated;
grant execute on function public.kr8_admin_place_undo(uuid, text) to authenticated;

-- ─────────── activity log: body of 0082, place auto actions shown as automatic with the place name ───────────
create or replace function public.kr8_admin_v2_activity(p_limit integer default 150, p_include_test boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare n int := least(greatest(coalesce(p_limit, 150), 1), 500);
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return coalesce((select jsonb_agg(e order by (e ->> 'at') desc) from (
    select jsonb_build_object('at', x.at, 'kind', x.kind, 'auto', x.auto, 'user_id', x.uid, 'no', m.member_no, 'name', m.first_name, 'text', x.txt, 'other_no', x.other_no) e
    from (
      select m0.created_at at, 'signup' kind, true auto, m0.user_id uid, coalesce('via ' || nullif(m0.ref_code, ''), 'no referrer') txt, null::int other_no from public.kr8_members m0
      union all select p.created_at, 'reel', true, p.author, 'posted a Reel', null from public.kr8_posts p where p.kind = 'reel'
      union all select p.reviewed_at, 'reel_review', p.reviewed_by is not null, p.author, 'Reel ' || case when p.hidden or p.status = 'hidden' then 'hidden' else p.status end
                  || coalesce(' · ' || nullif(p.review_note, ''), ''), null from public.kr8_posts p where p.kind = 'reel' and p.reviewed_at is not null
      union all select v.created_at, 'check', true, v.user_id, 'face check sent' || coalesce(' · auto ' || (v.live_check ->> 'auto'), ''), null from public.kr8_verifications v
      union all select v.reviewed_at, 'check_done', v.reviewed_by is null, v.user_id, 'face check ' || v.status || coalesce(' · ' || left(split_part(v.reject_reason, E'\n', 1), 60), ''), null
                  from public.kr8_verifications v where v.reviewed_at is not null
      union all select c.created_at, 'claim', true, c.member_id, '฿' || c.amount_thb || ' ' || c.brand || ' claim · ' || case when c.held and c.status = 'pending' then 'held' else c.status end, null
                  from public.kr8_reward_claims c where p_include_test or not c.is_test
      union all select h.decided_at, 'hold_decided', false, c.member_id, 'held claim ' || coalesce(h.decided, 'decided'), null
                  from public.kr8_claim_holds h join public.kr8_reward_claims c on c.id = h.claim_id where h.decided_at is not null
      union all select l.first_at, 'link', true, l.a, 'looks like / linked to (' || l.reason || ')', (select member_no from public.kr8_members where user_id = l.b) from public.kr8_account_links l
      union all select l.dismissed_at, 'link_dismissed', false, l.a, 'marked "different people"', (select member_no from public.kr8_members where user_id = l.b) from public.kr8_account_links l where l.dismissed_at is not null
      union all select g.at, case when g.action like 'place\_%' then 'place' else 'admin' end, g.action like 'place\_auto\_%' or g.action like 'place\_geo\_%', null,
                  replace(g.action, '_', ' ') || case when g.action like 'place\_%' then coalesce(' · ' || left(g.detail ->> 'name', 60), '') || coalesce(' (' || (g.detail ->> 'reason') || ')', '') else '' end, null
                  from public.kr8_admin_actions_log g
    ) x left join public.kr8_members m on m.user_id = x.uid
    where x.at is not null and (p_include_test or x.uid is null or public.kr8_admin_v2_kind(x.uid) in ('real', 'nocard'))
    order by x.at desc limit n) z), '[]'::jsonb);
end $$;
revoke all on function public.kr8_admin_v2_activity(integer, boolean) from public, anon;
grant execute on function public.kr8_admin_v2_activity(integer, boolean) to authenticated;

-- ─────────── anything still waiting goes live (none on 17 Nov) ───────────
with w as (update public.kr8_places set status = 'live', reviewed_at = now() where status = 'pending' returning id, name_en, outside_bkk, coords_rough)
insert into public.kr8_admin_actions_log (action, detail)
select 'place_auto_live', jsonb_build_object('place_id', w.id, 'name', w.name_en, 'outside', w.outside_bkk, 'rough', w.coords_rough, 'reason', 'was waiting') from w;

commit;
