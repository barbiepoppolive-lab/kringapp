-- 0072 · Places outside Bangkok (17 Nov 2026). WRITTEN, NOT APPLIED.
-- What was wrong: a member could type any place name (kr8_member_add_place, 0054) and it was saved as a Bangkok place
-- (rough pin = Bangkok centre). Hua Hin and Ratchaburi clips were tagged that way and counted on the weekly prize board.
--
-- Now:
--   kr8_places.outside_bkk  new column, default false (every existing row unchanged except the two fixed below)
--   kr8_place_outside(name, lat, lng)  true when lat/lng are given and fall outside the Bangkok box (13.45–14.05 / 100.25–100.95);
--                           without lat/lng: true when the name has another province / resort town in it (Thai or English list)
--                           and no Bangkok word (กรุงเทพ, Ari, Silom, …)
--   kr8_member_add_place    same arguments and return type as 0054; an outside place is saved with area 'Outside Bangkok',
--                           outside_bkk = true (kr_area stays 'Bangkok' because the Reel area pin must be a kr8_area_ok() value;
--                           the pin stays the rough area centre because kr8_places.lat/lng are checked to the Bangkok box)
--   kr8_reel_scores         body of 0066 + one line: a Reel counts on the weekly board only if it has at least one place that is NOT
--                           outside Bangkok. Outside-only Reels still show in the feed (kr8_feed is not touched).
--   data fix (idempotent)   'Wat Huay Mongkol, Hua Hin' (ca94deb0…) and 'สวนผึ้ง ราชบุรี' (491eaddf…) → outside Bangkok.
-- Apply after 0071. RE-RUNNABLE. Nothing is dropped or renamed.
--
-- UNDO: re-run kr8_reel_scores from 0066 and kr8_member_add_place from 0054; drop function kr8_place_outside(text, double precision,
--       double precision); update kr8_places set outside_bkk = false; the column can stay (default false).
begin;

alter table public.kr8_places add column if not exists outside_bkk boolean not null default false;

create or replace function public.kr8_place_outside(p_name text, p_lat double precision default null, p_lng double precision default null)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_lat is not null and p_lng is not null then not (p_lat between 13.45 and 14.05 and p_lng between 100.25 and 100.95)
    -- a Bangkok word in the name wins ("ข้าวซอยเชียงใหม่ อารีย์", "Chiang Mai Kitchen Silom" are Bangkok places)
    when coalesce(p_name, '') ~ '(กรุงเทพ|กทม|อารีย์|สีลม|สุขุมวิท|ทองหล่อ|เอกมัย|สยาม|สาทร|เยาวราช|จตุจักร|รัชดา|บางรัก|พร้อมพงษ์|อโศก|อ่อนนุช|ลาดพร้าว|บางนา|ราชเทวี|ปทุมวัน|พระนคร|ธนบุรี|ตลาดน้อย)'
      or lower(coalesce(p_name, '')) ~ '\m(bangkok|bkk|ari|silom|sukhumvit|thong ?lor?|ekkamai|siam|sathorn|yaowarat|chatuchak|ratchada|bang rak|phrom phong|asoke?|on nut|lat phrao|bang na|ratchathewi|pathum ?wan|phra nakhon|thon ?buri|talad noi)\M' then false
    else
      -- Thai has no spaces between words, so Thai names match anywhere; words that are also everyday Thai (เลย, ปาย, น่าน) are left out
      coalesce(p_name, '') ~ '(หัวหิน|ประจวบ|ชะอำ|ราชบุรี|สวนผึ้ง|ดำเนินสะดวก|เพชรบุรี|พัทยา|ชลบุรี|บางแสน|ศรีราชา|สัตหีบ|เกาะล้าน|ระยอง|เสม็ด|จันทบุรี|ตราด|เกาะช้าง|เชียงใหม่|เชียงราย|แม่ฮ่องสอน|ลำปาง|ลำพูน|สุโขทัย|เชียงคาน|ภูเก็ต|กระบี่|พังงา|เขาหลัก|สมุย|พะงัน|เกาะเต่า|สุราษฎร์|หาดใหญ่|สงขลา|ตรัง|สตูล|หลีเป๊ะ|ระนอง|ชุมพร|อยุธยา|ลพบุรี|สระบุรี|นครนายก|นครปฐม|กาญจนบุรี|สุพรรณบุรี|อัมพวา|สมุทรสงคราม|แม่กลอง|ฉะเชิงเทรา|เขาใหญ่|ปากช่อง|โคราช|นครราชสีมา|ขอนแก่น|อุดรธานี|หนองคาย|อุบลราชธานี|บุรีรัมย์)'
      or lower(coalesce(p_name, '')) ~ ('\m(hua ?hin|prachuap|cha[ -]?am|ratchaburi|suan ?ph(ue|u)e?ng|damnoen saduak|phetchaburi|pattaya|chon ?buri|bang ?saen|si ?racha|sri ?racha|sattahip|ko?h? larn|rayong|ko?h? samet|chanthaburi|trat|ko?h? chang|chiang ?mai|chiang ?rai|mae hong son|lampang|lamphun|sukhothai|chiang khan|phuket|krabi|ao nang|railay|phi ?phi|ko?h? lanta|phang ?-?nga|khao lak|samui|phangan|ko?h? tao|surat thani|hat ?yai|songkhla|satun|lipe|ranong|chumphon|ayutt?hay?a|lop ?buri|saraburi|nakhon nayok|nakhon pathom|kanchanaburi|suphan ?buri|amphawa|samut songkhram|mae ?klong|chachoengsao|khao yai|pak chong|korat|nakhon ratchasima|khon kaen|udon thani|nong khai|ubon ratchathani|buri ?ram)\M')
  end
$$;
grant execute on function public.kr8_place_outside(text, double precision, double precision) to authenticated;

-- Same arguments / return type as 0054. Changes: outside places get area 'Outside Bangkok' + outside_bkk; the reply says outside_bkk.
create or replace function public.kr8_member_add_place(p_name text, p_area text default 'Bangkok', p_maps_url text default null,
  p_lat double precision default null, p_lng double precision default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid(); v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_area text := case when public.kr8_area_ok(btrim(coalesce(p_area, ''))) then btrim(p_area) else 'Bangkok' end;
  v_url text := nullif(btrim(coalesce(p_maps_url, '')), ''); v_lat double precision; v_lng double precision; v_rough boolean := false;
  v_thai boolean; v_out boolean; n int; r public.kr8_places;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if length(v_name) < 2 or length(v_name) > 80 or not public.kr8_text_ok(v_name, 80) then raise exception 'KR8_BAD_PLACE'; end if;
  if v_url is not null and (length(v_url) > 300 or v_url !~ '^https://([a-z0-9-]+\.)*(google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl|g\.co)/') then v_url := null; end if;
  v_out := public.kr8_place_outside(v_name, p_lat, p_lng);
  if not v_out and p_lat is not null and p_lng is not null then
    v_lat := p_lat; v_lng := p_lng;
  else
    select c.lat, c.lng into v_lat, v_lng from public.kr8_area_centre(case when v_out then 'Bangkok' else v_area end) c; v_rough := true;
  end if;
  v_thai := v_name ~ '[ก-๙]';

  select * into r from public.kr8_places p
  where p.status in ('live', 'pending')
    and (lower(p.name_en) = lower(v_name) or p.name_th = v_name)
    and (p.outside_bkk = v_out)
    and (v_out or p.kr_area = v_area or public.kr8_dist_m(p.lat, p.lng, v_lat, v_lng) < 3000)
  order by (p.status = 'live') desc, p.created_at limit 1;
  if found then
    return jsonb_build_object('id', r.id, 'name_en', r.name_en, 'name_th', r.name_th, 'area', r.area, 'kr_area', r.kr_area,
                              'lat', r.lat, 'lng', r.lng, 'photo_url', r.photo_url, 'status', r.status, 'existing', true, 'outside_bkk', r.outside_bkk);
  end if;

  select count(*) into n from public.kr8_places where created_by = uid and added_how = 'typed' and created_at > now() - interval '1 day';
  if n >= 5 then raise exception 'KR8_SLOW_DOWN'; end if;

  insert into public.kr8_places (name_en, name_th, area, kr_area, lat, lng, source, created_by, status, added_how, maps_url, coords_rough, outside_bkk)
  values (v_name, case when v_thai then v_name end, case when v_out then 'Outside Bangkok' else v_area end, case when v_out then 'Bangkok' else v_area end,
          v_lat, v_lng, 'photon', uid, 'pending', 'typed', v_url, v_rough, v_out)
  on conflict do nothing
  returning * into r;
  if r.id is null then   -- same name at the same rounded pin (kr8_places_name_spot): reuse it
    select * into r from public.kr8_places p where lower(p.name_en) = lower(v_name)
      and round(p.lat::numeric, 3) = round(v_lat::numeric, 3) and round(p.lng::numeric, 3) = round(v_lng::numeric, 3) limit 1;
  end if;
  return jsonb_build_object('id', r.id, 'name_en', r.name_en, 'name_th', r.name_th, 'area', r.area, 'kr_area', r.kr_area,
                            'lat', r.lat, 'lng', r.lng, 'photo_url', r.photo_url, 'status', r.status, 'existing', false, 'outside_bkk', r.outside_bkk);
end $$;
revoke all on function public.kr8_member_add_place(text, text, text, double precision, double precision) from public, anon;
grant execute on function public.kr8_member_add_place(text, text, text, double precision, double precision) to authenticated;

-- Weekly board: body of 0066 (dupguard: linked accounts, Kring Team excluded) + "at least one Bangkok place"
create or replace function public.kr8_reel_scores(p_from timestamptz, p_to timestamptz, p_until timestamptz, p_test boolean, p_author uuid default null)
returns table (post_id uuid, author uuid, posted_at timestamptz, l_local int, l_trav int, s_local int, s_trav int, opens int, score int)
language sql stable security definer set search_path = public, pg_temp as $$
  with cfg as (select public.kr8_rcfg('like', 1) w_like, public.kr8_rcfg('save', 3) w_save, public.kr8_rcfg('open', 5) w_open,
                      public.kr8_rcfg('traveller_mult', 2) mult, public.kr8_rcfg('opens_day_cap', 30) cap),
  reels as (
    select p.id, p.author, p.created_at
    from public.kr8_posts p
    where p.kind = 'reel' and p.status = 'approved' and not p.hidden
      and p.created_at >= p_from and p.created_at < p_to
      and (p_author is null or p.author = p_author)
      and exists (select 1 from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id   -- 0072: at least one Bangkok place
                  where pp.post_id = p.id and not pl.outside_bkk)
      and exists (select 1 from public.kr8_members am where am.user_id = p.author)
      and public.kr8_is_test_member(p.author) = p_test
      and not public.kr8_is_team(p.author)
  ),
  ppl as (   -- members whose likes and saves count
    select m.user_id, (m.who = 'traveller' and (m.verified or public.kr8_rcfg('traveller_mult_needs_verified', 1) = 0)) as trav
    from public.kr8_members m
    where coalesce(m.photo, '') <> '' and btrim(coalesce(m.first_name, '')) <> '' and public.kr8_is_test_member(m.user_id) = p_test and not public.kr8_is_team(m.user_id)
      and (m.verified or m.created_at < now() - make_interval(hours => public.kr8_rcfg('liker_min_age_hours', 72)))
  ),
  lk as (
    select r.id, count(*) filter (where not c.trav)::int a, count(*) filter (where c.trav)::int b
    from reels r join public.kr8_post_likes l on l.post_id = r.id and l.user_id <> r.author and l.created_at < p_until
    join ppl c on c.user_id = l.user_id
    where not public.kr8_linked(l.user_id, r.author)
    group by r.id
  ),
  sv as (
    select r.id, count(*) filter (where not c.trav)::int a, count(*) filter (where c.trav)::int b
    from reels r join public.kr8_post_saves s on s.post_id = r.id and s.user_id <> r.author and s.created_at < p_until
    join ppl c on c.user_id = s.user_id
    where not public.kr8_linked(s.user_id, r.author)
    group by r.id
  ),
  od as (
    select r.id, o.bkk_date, count(*)::int n
    from reels r join public.kr8_share_opens o on o.post_id = r.id and o.ok and o.created_at < p_until
    where o.opener is distinct from r.author
      and (o.opener is null or not public.kr8_linked(o.opener, r.author))
      and not exists (select 1 from public.kr8_share_opens mine where mine.opener = r.author and (mine.session = o.session or mine.device = o.device))
    group by r.id, o.bkk_date
  ),
  op as (select od.id, sum(least(od.n, cfg.cap))::int n from od, cfg group by od.id)
  select r.id, r.author, r.created_at,
         coalesce(lk.a, 0), coalesce(lk.b, 0), coalesce(sv.a, 0), coalesce(sv.b, 0), coalesce(op.n, 0),
         (coalesce(lk.a, 0) * cfg.w_like + coalesce(lk.b, 0) * cfg.w_like * cfg.mult
          + coalesce(sv.a, 0) * cfg.w_save + coalesce(sv.b, 0) * cfg.w_save * cfg.mult
          + coalesce(op.n, 0) * cfg.w_open)::int
  from reels r cross join cfg left join lk on lk.id = r.id left join sv on sv.id = r.id left join op on op.id = r.id
$$;
revoke all on function public.kr8_reel_scores(timestamptz, timestamptz, timestamptz, boolean, uuid) from public, anon, authenticated;

-- The two live places members re-tagged from Hua Hin / Ratchaburi (ids from a read-only search of live, 17 Nov). Matched by id AND name,
-- so on any other database (or after a rename) this changes nothing.
update public.kr8_places set outside_bkk = true, area = 'Outside Bangkok'
where ((id = 'ca94deb0-6e19-48fe-bbd5-61dba97ebc3d' and name_en = 'Wat Huay Mongkol, Hua Hin')
    or (id = '491eaddf-5af3-426f-a9dd-1ffffe4cb64a' and name_en = 'สวนผึ้ง ราชบุรี'))
  and (not outside_bkk or area <> 'Outside Bangkok');

commit;
