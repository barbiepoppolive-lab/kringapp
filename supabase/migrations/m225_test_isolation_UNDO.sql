-- m225 UNDO: the 7 functions back to their 26 Nov bodies; the helper goes.
begin;
CREATE OR REPLACE FUNCTION public.kr8_feed_order(p_area text DEFAULT NULL::text, p_seed text DEFAULT NULL::text)
 RETURNS TABLE(post_id uuid, pos integer, score numeric, why text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  uid uuid := auth.uid();
  vkey text := case when auth.uid() is null then null else 'u:' || replace(auth.uid()::text, '-', '') end;
  seed text := coalesce(nullif(p_seed, ''), coalesce(auth.uid()::text, 'guest') || ':' || (now() at time zone 'Asia/Bangkok')::date::text);
  on_ int := public.kr8_rcfg('feed_ranked_on', 1);
  win int := greatest(public.kr8_rcfg('feed_window_days', 30), 1);
  hl numeric := greatest(public.kr8_rcfg('feed_half_life_h', 36), 1);
  alpha numeric := greatest(public.kr8_rcfg('feed_prior_views', 20), 1);
  ex_views int := public.kr8_rcfg('feed_explore_views', 25);
  ex_hours int := public.kr8_rcfg('feed_explore_hours', 72);
  ex_every int := public.kr8_rcfg('feed_explore_every', 4);
  w_like numeric := public.kr8_rcfg('like', 1);
  w_save numeric := public.kr8_rcfg('save', 3);
  w_open numeric := public.kr8_rcfg('open', 5);
  mult numeric := public.kr8_rcfg('traveller_mult', 2);
  trav_ver int := public.kr8_rcfg('traveller_mult_needs_verified', 1);
  cap int := public.kr8_rcfg('opens_day_cap', 30);
  boff numeric := public.kr8_rcfg('feed_boardoff_pct', 60) / 100.0;
  rep numeric := public.kr8_rcfg('feed_reported_pct', 50) / 100.0;
  rep_drop int := greatest(public.kr8_rcfg('feed_report_drop', 2), 1);
  dupe numeric := public.kr8_rcfg('feed_dupe_pct', 70) / 100.0;
  v_seen numeric := public.kr8_rcfg('feed_seen_pct', 35) / 100.0;
  areab numeric := public.kr8_rcfg('feed_area_pct', 115) / 100.0;
  jit numeric := public.kr8_rcfg('feed_jitter_pct', 15) / 100.0;
  a_max int := greatest(public.kr8_rcfg('feed_author_per10', 2), 1);
  f_max int := greatest(public.kr8_rcfg('feed_food_per10', 2), 1);
  fq_on int := public.kr8_rcfg('fq_on', 1);
  fq_un numeric := public.kr8_rcfg('fq_unscored_pct', 90) / 100.0;
  c record;
  ids uuid[]; aus uuid[]; ars text[]; foods boolean[]; exps boolean[]; vws int[]; scs numeric[]; whys text[]; pend boolean[];
  placed boolean[];
  out_ids uuid[] := '{}'; out_aus uuid[] := '{}'; out_ars text[] := '{}'; out_food boolean[] := '{}';
  n int; i int; slot int; pick int; lvl int; best int; prev_au uuid; prev_ar text; prev_food boolean;
  a_cnt int; f_cnt int; lo int; note text;
begin
  -- 1-4 in one read-only query (PostgREST runs stable calls read-only, so no temp tables):
  --   candidates with kr8_feed's filters unchanged + the two guest rules, engagement, reports, flags, the feed average, scores.
  ids := '{}'; aus := '{}'; ars := '{}'; foods := '{}'; exps := '{}'; vws := '{}'; scs := '{}'; whys := '{}'; pend := '{}';
  for c in
    with base as (
      select p.id, p.author, p.area, p.created_at, coalesce(p.views_count, 0) views, coalesce(p.board_off, false) board_off, p.kind pkind,
             (select q.score from public.kr8_reel_quality q where q.post_id = p.id) qscore,
             (p.kind = 'reel' and p.status = 'pending') pending,
             (coalesce(p.body, '') || ' ' || coalesce((select string_agg(coalesce(pl.name_en, '') || ' ' || coalesce(pl.name_th, ''), ' ')
                                                      from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id
                                                      where pp.post_id = p.id), ''))
               ~* '(street ?food|food|foodie|eat|eating|lunch|dinner|breakfast|brunch|dessert|noodle|restaurant|buffet|mookata|bbq|shabu|ramen|sushi|ของกิน|อาหาร|กิน|อร่อย|ขนม|ก๋วยเตี๋ยว|ส้มตำ|บุฟเฟ่ต์|ชาบู|หมูกระทะ|มื้อ)' food,
             -- engagement: the board's weights; traveller 2×; never the author's own, the Kring Team's or a linked duplicate account's
             (select coalesce(sum(case when lm.who = 'traveller' and (lm.verified or trav_ver = 0) then w_like * mult else w_like end), 0)
                from public.kr8_post_likes l join public.kr8_members lm on lm.user_id = l.user_id
               where l.post_id = p.id and l.user_id <> p.author and not public.kr8_is_team(l.user_id) and not public.kr8_linked(l.user_id, p.author))
           + (select coalesce(sum(case when sm.who = 'traveller' and (sm.verified or trav_ver = 0) then w_save * mult else w_save end), 0)
                from public.kr8_post_saves s join public.kr8_members sm on sm.user_id = s.user_id
               where s.post_id = p.id and s.user_id <> p.author and not public.kr8_is_team(s.user_id) and not public.kr8_linked(s.user_id, p.author))
           + w_open * (select coalesce(sum(least(d.n, cap)), 0) from (
                select count(*) n from public.kr8_share_opens o
                 where o.post_id = p.id and o.ok and o.opener is distinct from p.author
                   and (o.opener is null or not public.kr8_linked(o.opener, p.author))
                 group by o.bkk_date) d) e,
             (select count(distinct r.reporter) from public.kr8_reports r where r.post_id = p.id and r.handled_at is null and r.reporter <> p.author)::int reps,
             exists (select 1 from public.kr8_account_links l where (l.a = p.author or l.b = p.author) and l.dismissed_at is null and l.reason in ('face', 'device')) dup,
             (vkey is not null and exists (select 1 from public.kr8_post_views v where v.post_id = p.id and v.viewer_key = vkey)) seen,
             (uid is not null and p.area is not null and p.area <> 'Bangkok' and exists (
               select 1 from public.kr8_posts q where q.area = p.area and q.id <> p.id and q.created_at > now() - interval '60 days'
                 and (exists (select 1 from public.kr8_post_likes l where l.post_id = q.id and l.user_id = uid)
                   or exists (select 1 from public.kr8_post_saves s where s.post_id = q.id and s.user_id = uid)))) liked_area
      from public.kr8_posts p join public.kr8_members m on m.user_id = p.author
      where not p.hidden
        and (p.kind <> 'reel' or p.status = 'approved' or (p.status = 'pending' and p.author = uid))
        and p.kind <> 'ask'
        and (p.kind <> 'reel' or not coalesce(p.feed_off, false) or p.author = uid)   -- 0147 Hide from feed
        and (p.author = uid or not public.kr8_minor_held(p.author))   -- 0151 possible under 18: out of public feeds
        and p.created_at > now() - make_interval(days => win)
        and (p_area is null or p.area = p_area)
        and (uid is null or not public.kr8_is_blocked(uid, p.author))
        and (uid is null or not exists (select 1 from public.kr8_post_hidden h where h.user_id = uid and h.post_id = p.id))
        and (uid is not null or not (coalesce(m.ghost, false) or public.kr8_is_team(p.author)))   -- guests: no ghosts, no Kring Team
    ),
    kept as (select * from base where pending or reps < rep_drop),   -- 2+ open reports from different members: out until handled
    avg as (select least(greatest(coalesce(case when sum(views) > 0 then sum(e) / sum(views) end, 0.1), 0.02), 2) mu from kept),
    s as (
      select k.*,
             least(greatest(((k.e + alpha * avg.mu) / (k.views + alpha)) / avg.mu, 0.25), 4) q,
             power(0.5, greatest(extract(epoch from now() - k.created_at) / 3600.0, 0) / hl) fr,
             (case when k.board_off then boff else 1 end) * (case when k.reps > 0 then rep else 1 end) * (case when k.dup then dupe else 1 end) dm,
             (case when k.seen then v_seen else 1 end) * (case when k.liked_area then areab else 1 end) ps,
             -- 0151 quality multiplier: score 50 = ×1.0, 100 = ×1.6, 0 = ×0.4; not read yet ×0.9
             (case when fq_on = 0 or k.pkind <> 'reel' then 1 when k.qscore is null then fq_un else 0.4 + k.qscore * 0.012 end) qm,
             1 + jit * (2 * (('x' || substr(md5(seed || ':' || k.id::text), 1, 8))::bit(32)::bigint::numeric / 4294967296.0) - 1) jt
      from kept k cross join avg)
    select s.*, (s.q * s.fr * s.dm * s.ps * s.jt * s.qm)::numeric sc from s
    order by s.pending desc, case when on_ = 0 then extract(epoch from s.created_at) else s.q * s.fr * s.dm * s.ps * s.jt * s.qm end desc, s.id
  loop
    ids := ids || c.id; aus := aus || c.author; ars := ars || coalesce(c.area, ''); foods := foods || c.food; pend := pend || c.pending;
    exps := exps || (not c.pending and coalesce(c.qscore, 50) >= 40 and c.views < ex_views and c.created_at > now() - make_interval(hours => ex_hours));
    vws := vws || c.views; scs := scs || round(c.sc, 4);
    whys := whys || (format('quality %s (pts %s / %s views) × fresh %s (%sh old)', round(c.q, 2), round(c.e, 1), c.views, round(c.fr, 2),
                            round(extract(epoch from now() - c.created_at) / 3600.0))
                     || case when c.board_off then ' · Feed-only ×' || boff else '' end
                     || case when c.reps > 0 then ' · open report ×' || rep else '' end
                     || case when c.dup then ' · duplicate-flag ×' || dupe else '' end
                     || case when c.seen then ' · already watched ×' || v_seen else '' end
                     || case when c.liked_area then ' · your area ×' || areab else '' end
                     || case when c.food then ' · food' else '' end
                     || case when c.qscore is not null then ' · quality ' || c.qscore || '/100 ×' || round(c.qm, 2) when c.pkind = 'reel' then ' · quality not read yet ×' || round(c.qm, 2) else '' end);
  end loop;
  n := coalesce(array_length(ids, 1), 0);
  if n = 0 then return; end if;

  if on_ = 0 then   -- kill switch: newest first, no re-order (own pending still first, as before)
    for i in 1..n loop post_id := ids[i]; pos := i; score := scs[i]; why := 'newest first (ranking off)'; return next; end loop;
    return;
  end if;

  -- 5. re-order: test slots for new Reels, author / food / area variety. Level 0 = every rule; each level drops one rule,
  --    so the feed is never shorter than the candidate list.
  placed := array_fill(false, array[n]);
  for slot in 1..n loop
    pick := null; note := null;
    prev_au := case when slot > 1 then out_aus[slot - 1] end;
    prev_ar := case when slot > 1 then out_ars[slot - 1] end;
    prev_food := case when slot > 1 then out_food[slot - 1] else false end;
    lo := greatest(slot - 9, 1);
    -- own pending Reels first (they were at the top of kr8_feed too)
    for i in 1..n loop
      if not placed[i] and pend[i] then pick := i; note := 'your Reel waiting for approval'; exit; end if;
    end loop;
    -- test slot: least-viewed untested Reel (ties: the higher score), not by the author just above
    if pick is null and ex_every > 0 and slot >= 3 and (slot - 3) % ex_every = 0 then
      best := null;
      for i in 1..n loop
        if not placed[i] and exps[i] and aus[i] is distinct from prev_au and not (foods[i] and prev_food) and (best is null or vws[i] < vws[best]) then best := i; end if;
      end loop;
      if best is not null then pick := best; note := format('test slot for a new Reel (%s views)', vws[best]); end if;
    end if;
    if pick is null then
      for lvl in 0..3 loop
        for i in 1..n loop
          continue when placed[i];
          if lvl < 3 and aus[i] is not distinct from prev_au then continue; end if;
          if lvl < 2 then
            select count(*) into a_cnt from generate_subscripts(out_aus, 1) j where j >= lo and out_aus[j] = aus[i];
            if a_cnt >= a_max then continue; end if;
            if foods[i] then
              select count(*) into f_cnt from generate_subscripts(out_food, 1) j where j >= lo and out_food[j];
              if f_cnt >= f_max or prev_food then continue; end if;
            end if;
          end if;
          if lvl < 1 and ars[i] <> '' and ars[i] <> 'Bangkok' and ars[i] = prev_ar then continue; end if;
          pick := i;
          note := case lvl when 0 then 'best score' when 1 then 'best score (same area as above: no other choice)'
                           when 2 then 'best score (variety rules relaxed: no other choice)' else 'only Reels left are by the same author' end;
          exit;
        end loop;
        exit when pick is not null;
      end loop;
    end if;
    placed[pick] := true;
    out_ids := out_ids || ids[pick]; out_aus := out_aus || aus[pick]; out_ars := out_ars || ars[pick]; out_food := out_food || foods[pick];
    post_id := ids[pick]; pos := slot; score := scs[pick]; why := note || ' — ' || whys[pick];
    return next;
  end loop;
end $function$;

CREATE OR REPLACE FUNCTION public.kr8_people(p_limit integer DEFAULT 60)
 RETURNS TABLE(user_id uuid, first_name text, photo text, langs text[], bio text, area text, who text, here boolean, verified boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select m.user_id, m.first_name, m.photo, m.langs, m.bio, m.area, m.who,
         coalesce(m.here_until > now(), false), m.verified
  from public.kr8_members m
  cross join (select auth.uid() is not null and public.kr8_is_admin() as yes) adm          -- 0077
  where auth.uid() is not null
    and (exists (select 1 from public.kr8_members me where me.user_id = auth.uid()) or adm.yes)
    and m.user_id is distinct from auth.uid()
    and not public.kr8_is_blocked(auth.uid(), m.user_id)
    -- m210: an unchecked member is listed (verified = false → no ✓)
    and public.kr8_fake_level(m.user_id) <> 'red'                                          /*fake0124*/
    and (adm.yes or not public.kr8_minor_held(m.user_id))                                  -- 0151
    and (adm.yes or m.photo_check is distinct from 'no_face')                              -- 0162
    and (adm.yes or not coalesce(m.ghost, false))                                          -- m206: ghosts are not people
  order by public.kr8_people_score(m.user_id) desc, m.updated_at desc                      -- 0151
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
$function$;

CREATE OR REPLACE FUNCTION public.kr8_feed_new_faces(p_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); h int; reels jsonb; ans jsonb;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  h := least(greatest(coalesce(p_hours, 24), 1), 168);
  -- first approved Reel of each member; it counts as new for h hours from its approval
  with firsts as (
    select distinct on (p.author) p.id, p.author, p.created_at, coalesce(p.reviewed_at, p.created_at) appr, p.poster_path, p.video_path,
           p.body, p.likes_count, p.feed_off
    from public.kr8_posts p
    where p.kind = 'reel' and p.status = 'approved' and not coalesce(p.hidden, false)
    order by p.author, p.created_at, p.id
  )
  select coalesce(jsonb_agg(x.j order by x.appr desc), '[]'::jsonb) into reels
  from (
    select f.appr, jsonb_build_object('k', 'reel', 'id', f.id, 'author_id', f.author, 'name', m.first_name,
             'photo', nullif(m.photo, ''), 'poster_path', f.poster_path, 'video_path', f.video_path, 'body', f.body,
             'likes', coalesce(f.likes_count, 0), 'mine', f.author = uid, 'verified', coalesce(m.verified, false),
             'liked', exists (select 1 from public.kr8_post_likes l where l.post_id = f.id and l.user_id = uid),
             'saved', exists (select 1 from public.kr8_post_saves s where s.post_id = f.id and s.user_id = uid),
             'at', f.appr) j
    from firsts f join public.kr8_members m on m.user_id = f.author
    where f.appr > now() - make_interval(hours => h)
      and not coalesce(f.feed_off, false)
      and not coalesce(m.ghost, false) and not public.kr8_is_team(f.author)
      and not public.kr8_minor_held(f.author)
      and not public.kr8_is_blocked(uid, f.author)
      and not exists (select 1 from public.kr8_post_hidden hh where hh.user_id = uid and hh.post_id = f.id)
      and not exists (select 1 from public.kr8_reports r where r.post_id = f.id and r.handled_at is null)
    order by f.appr desc
    limit 15
  ) x;

  -- first Ask BKK answer of each member (text only; a photo-only answer may still be waiting for its check)
  with firsts as (
    select distinct on (a.author) a.id, a.post_id, a.author, a.body, a.created_at, a.hidden
    from public.kr8_ask_answers a
    order by a.author, a.created_at, a.id
  )
  select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb) into ans
  from (
    select f.created_at, jsonb_build_object('k', 'ans', 'id', f.id, 'post_id', f.post_id, 'author_id', f.author,
             'name', m.first_name, 'photo', nullif(m.photo, ''), 'body', left(f.body, 140), 'mine', f.author = uid,
             'verified', coalesce(m.verified, false), 'at', f.created_at) j
    from firsts f join public.kr8_members m on m.user_id = f.author
    where f.created_at > now() - make_interval(hours => h)
      and not f.hidden and btrim(coalesce(f.body, '')) <> ''
      and not coalesce(m.ghost, false) and not public.kr8_is_team(f.author)
      and not public.kr8_minor_held(f.author)
      and public.kr8_ask_a_ok(uid, f.id) and public.kr8_ask_q_ok(uid, f.post_id)
      -- one tile per person: someone who also has a new Reel shows with the Reel
      and not exists (select 1 from jsonb_array_elements(reels) r where (r->>'author_id')::uuid = f.author)
    order by f.created_at desc
    limit 6
  ) x;

  return jsonb_build_object('hours', h, 'items', reels || ans);
end $function$;

CREATE OR REPLACE FUNCTION public.kr8_ask_q_ok(p_viewer uuid, p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.kr8_posts p
    where p.id = p_id and p.kind = 'ask' and not coalesce(p.hidden, false) and coalesce(p.status::text, 'approved') not in ('hidden', 'rejected', 'pending')
      and (p_viewer is null or (not public.kr8_is_blocked(p_viewer, p.author)
           and not exists (select 1 from public.kr8_post_hidden h where h.user_id = p_viewer and h.post_id = p.id))))
$function$;

CREATE OR REPLACE FUNCTION public.kr8_ask_a_ok(p_viewer uuid, p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.kr8_ask_answers a
    where a.id = p_id and not a.hidden
      and (btrim(a.body) <> '' or a.media_check = 'ok' or a.author = p_viewer)   -- 0185: photo-only reply waits for its check
      and (p_viewer is null or (not public.kr8_is_blocked(p_viewer, a.author)
           and not exists (select 1 from public.kr8_ask_answer_hidden h where h.user_id = p_viewer and h.answer_id = a.id))))
$function$;

CREATE OR REPLACE FUNCTION public.kr8_place_page(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.kr8_onb_alike(p_kind text DEFAULT 'any'::text, p_ref text DEFAULT NULL::text, p_limit integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); v_day date; v_post uuid; n_av int; lim int := greatest(1, least(coalesce(p_limit, 12), 20)); r jsonb;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if p_kind is null or p_kind not in ('any', 'vote', 'ask') then raise exception 'KR8_BAD_INPUT'; end if;
  if p_ref is not null and length(p_ref) > 40 then raise exception 'KR8_BAD_INPUT'; end if;
  begin
    if p_kind = 'vote' and p_ref is not null then v_day := p_ref::date; end if;
    if p_kind = 'ask' and p_ref is not null then v_post := p_ref::uuid; end if;
  exception when others then raise exception 'KR8_BAD_INPUT';
  end;
  if not exists (select 1 from public.kr8_members where user_id = uid) then return jsonb_build_object('eligible', false, 'answers', 0, 'people', '[]'::jsonb); end if;
  select (select count(*) from public.kr8_ask_answers a where a.author = uid and a.parent_id is null and not coalesce(a.hidden, false))
       + (select count(*) from public.kr8_task_vote_picks v where v.member_id = uid) into n_av;
  if n_av < 2 or public.kr8_face_gate(uid) then
    return jsonb_build_object('eligible', false, 'answers', n_av, 'people', '[]'::jsonb);
  end if;
  with my_votes as (
    select v.day, v.pick from public.kr8_task_vote_picks v
     where v.member_id = uid and p_kind in ('any', 'vote') and (v_day is null or v.day = v_day)
  ), my_asks as (
    select distinct a.post_id from public.kr8_ask_answers a
     where a.author = uid and a.parent_id is null and not coalesce(a.hidden, false)
       and p_kind in ('any', 'ask') and (v_post is null or a.post_id = v_post)
  ), hits as (
    select p.member_id as who, 'v' as k, p.day::text as ref from public.kr8_task_vote_picks p
      join my_votes v on v.day = p.day and v.pick = p.pick
     where p.member_id <> uid
    union
    select a.author, 'a', a.post_id::text from public.kr8_ask_answers a
      join my_asks q on q.post_id = a.post_id
     where a.author <> uid and a.parent_id is null and not coalesce(a.hidden, false)
  ), agg as (
    select who, count(*) filter (where k = 'v')::int as nv, count(*) filter (where k = 'a')::int as na from hits group by who
  ), pick as (
    select m.user_id, m.first_name, m.photo, coalesce(m.verified, false) as verified, agg.nv, agg.na, m.last_active_at
      from agg join public.kr8_members m on m.user_id = agg.who
     where not coalesce(m.ghost, false)
       and not public.kr8_face_gate(m.user_id)   -- m216: unchecked members can vote now; never offered for Follow
       and not public.kr8_is_blocked(uid, m.user_id)
       and not exists (select 1 from public.kr8_follows f where f.follower = uid and f.followee = m.user_id)
     order by coalesce(m.verified, false) desc, agg.nv + agg.na desc, m.last_active_at desc nulls last
     limit lim
  )
  select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'first_name', first_name, 'photo', photo, 'verified', verified,
                                               'same_votes', nv, 'same_questions', na)
                            order by verified desc, nv + na desc, last_active_at desc nulls last), '[]'::jsonb)
    into r from pick;
  return jsonb_build_object('eligible', true, 'answers', n_av, 'people', r);
end $function$;
drop function if exists public.kr8_test_hidden(uuid, uuid);
commit;
