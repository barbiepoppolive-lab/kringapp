-- 0085 (17 Nov, founder: "in the feed pls optimise the order of feed wrt engagement or quality"): a ranked Reels feed.
--
-- WHAT: kr8_feed_ranked(p_area, p_limit, p_offset, p_seed) returns exactly the rows and columns of kr8_feed (+ rank), in a
--   ranked order instead of newest-first. kr8_feed itself is NOT touched: it stays the fallback (the app and /feed0 call it
--   when kr8_feed_ranked is missing or fails), and kr8_rings_config 'feed_ranked_on' = 0 turns the ranking off (newest first).
--
-- HOW (built for a small network — tens to hundreds of Reels, so no machine learning; see FEED_RANKING_17NOV.md):
--   score = quality × freshness × demotions × personal × jitter, then a re-order pass for variety and for new Reels.
--   · quality   = engagement per view, Bayesian-smoothed towards the feed average (likes + 3×saves + 5×share-link opens, the
--                 board's public weights; traveller likes/saves 2×; the author's own and duplicate-account engagement never
--                 counts; opens capped per day like the board). 2 likes on 3 views is pulled back to "about average".
--   · freshness = halves every feed_half_life_h hours (36).
--   · demotions = admin "Feed only" (board_off) ×60%, open reports ×50% (2+ different reporters: left out until handled),
--                 author flagged as a likely duplicate account ×70%.
--   · personal  = signed-in only: a Reel this member already watched ×35% (moves down, never removed); a Reel from an area
--                 whose Reels they liked or saved ×115%.
--   · jitter    = ±15% from a hash of (seed, post): the same seed gives the same order (stable scrolling and paging), a new
--                 app session gets a slightly different mix.
--   · re-order  = never the same author twice in a row, at most 2 per author and 2 food Reels in any 10 in a row, no two food
--                 Reels back to back, prefer a different area than the Reel above; slots 3, 7, 11 … are kept for a new
--                 untested Reel (under feed_explore_views views, under feed_explore_hours old, no open report), least-viewed first — the
--                 TikTok-style test batch, so every new Reel gets seen early. A member's own pending Reel stays on top for them.
-- Filters are kr8_feed's, unchanged (hidden, approved / own pending, no 'ask', area, kr8_is_blocked incl. ghosts + Kring Team,
--   per-member "hide this post"), plus: signed-out visitors also never get ghost or Kring Team Reels.
-- Window: feed_window_days (30; kr8_feed uses 14) — the founder wants the feed full, and freshness already sinks old Reels.
--
-- UNDO: drop function public.kr8_feed_ranked(text, int, int, text); drop function public.kr8_feed_order(text, text);
--       delete from public.kr8_rings_config where key like 'feed\_%';

insert into public.kr8_rings_config (key, value, note) values
  ('feed_ranked_on', 1, 'feed: 1 = ranked order, 0 = newest first'),
  ('feed_window_days', 30, 'feed: Reels younger than this many days'),
  ('feed_half_life_h', 36, 'feed: freshness halves every N hours'),
  ('feed_prior_views', 20, 'feed: Bayesian prior strength (views) pulling small samples to the average'),
  ('feed_explore_views', 25, 'feed: a Reel under this many views is "untested"'),
  ('feed_explore_hours', 72, 'feed: untested Reels younger than this get test slots'),
  ('feed_explore_every', 4, 'feed: every Nth slot (3, 7, 11 … when 4) goes to an untested Reel; 0 = off'),
  ('feed_boardoff_pct', 60, 'feed: score % for admin "Feed only" (board_off) Reels'),
  ('feed_reported_pct', 50, 'feed: score % for a Reel with an open (unhandled) report'),
  ('feed_report_drop', 2, 'feed: open reports from this many different members leave the Reel out until handled'),
  ('feed_dupe_pct', 70, 'feed: score % when the author is flagged as a likely duplicate account'),
  ('feed_seen_pct', 35, 'feed: score % for a Reel this member already watched'),
  ('feed_area_pct', 115, 'feed: score % for Reels from an area this member liked/saved before'),
  ('feed_jitter_pct', 15, 'feed: ± random % per session (same seed = same order)'),
  ('feed_author_per10', 2, 'feed: max Reels by one author in any 10 in a row'),
  ('feed_food_per10', 2, 'feed: max food Reels in any 10 in a row (never two back to back)')
on conflict (key) do nothing;

-- The order only (ids, positions, scores, reasons). Internal: not callable by members (scores and view counts stay private).
create or replace function public.kr8_feed_order(p_area text default null, p_seed text default null)
returns table (post_id uuid, pos int, score numeric, why text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
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
      select p.id, p.author, p.area, p.created_at, coalesce(p.views_count, 0) views, coalesce(p.board_off, false) board_off,
             (p.kind = 'reel' and p.status = 'pending') pending,
             (coalesce(p.body, '') || ' ' || coalesce((select string_agg(coalesce(pl.name_en, '') || ' ' || coalesce(pl.name_th, ''), ' ')
                                                      from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id
                                                      where pp.post_id = p.id), ''))
               ~* '(\m(street ?food|foods?|foodie|eats?|eating|lunch|dinner|breakfast|brunch|desserts?|noodles?|restaurants?|buffet|mookata|bbq|shabu|ramen|sushi)\M|ของกิน|อาหาร|กิน|อร่อย|ขนม|ก๋วยเตี๋ยว|ส้มตำ|บุฟเฟ่ต์|ชาบู|หมูกระทะ|มื้อ)' food,   -- food words (EN whole words, TH)
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
             1 + jit * (2 * (('x' || substr(md5(seed || ':' || k.id::text), 1, 8))::bit(32)::bigint::numeric / 4294967296.0) - 1) jt
      from kept k cross join avg)
    select s.*, (s.q * s.fr * s.dm * s.ps * s.jt)::numeric sc from s
    order by s.pending desc, case when on_ = 0 then extract(epoch from s.created_at) else s.q * s.fr * s.dm * s.ps * s.jt end desc, s.id
  loop
    ids := ids || c.id; aus := aus || c.author; ars := ars || coalesce(c.area, ''); foods := foods || c.food; pend := pend || c.pending;
    exps := exps || (not c.pending and c.reps = 0 and c.views < ex_views and c.created_at > now() - make_interval(hours => ex_hours));
    vws := vws || c.views; scs := scs || round(c.sc, 4);
    whys := whys || (format('quality %s (pts %s / %s views) × fresh %s (%sh old)', round(c.q, 2), round(c.e, 1), c.views, round(c.fr, 2),
                            round(extract(epoch from now() - c.created_at) / 3600.0))
                     || case when c.board_off then ' · Feed-only ×' || round(boff, 2) else '' end
                     || case when c.reps > 0 then ' · open report ×' || round(rep, 2) else '' end
                     || case when c.dup then ' · duplicate-flag ×' || round(dupe, 2) else '' end
                     || case when c.seen then ' · already watched ×' || round(v_seen, 2) else '' end
                     || case when c.liked_area then ' · your area ×' || round(areab, 2) else '' end
                     || case when c.food then ' · food' else '' end);
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
    -- test slot: least-viewed untested Reel (ties: the higher score), same author and food rules as below
    if pick is null and ex_every > 0 and slot >= 3 and (slot - 3) % ex_every = 0 then
      best := null;
      select count(*) into f_cnt from generate_subscripts(out_food, 1) j where j >= lo and out_food[j];
      for i in 1..n loop
        continue when placed[i] or not exps[i] or aus[i] is not distinct from prev_au;
        continue when foods[i] and (prev_food or f_cnt >= f_max);   -- same food rules as every other slot
        select count(*) into a_cnt from generate_subscripts(out_aus, 1) j where j >= lo and out_aus[j] = aus[i];
        continue when a_cnt >= a_max;
        if best is null or vws[i] < vws[best] then best := i; end if;
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
end $$;
revoke all on function public.kr8_feed_order(text, text) from public, anon, authenticated;

-- The feed the app calls: kr8_feed's exact columns (+ rank), in the ranked order. Paging: p_offset with the same p_seed.
create or replace function public.kr8_feed_ranked(p_area text default null, p_limit int default 40, p_offset int default 0, p_seed text default null)
returns table (id uuid, kind text, area text, body text, photo text, event_id text, here boolean, created_at timestamptz, author_id uuid,
  author_name text, author_photo text, author_langs text[], author_who text, mine boolean, answers jsonb, video_path text, poster_path text,
  duration_ms integer, reel_status text, likes integer, liked boolean, saved boolean, views integer, ig_handle text, venue_id text,
  venue_name text, venue_name_th text, deal_id text, deal_en text, deal_th text, rank integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, p.kind, p.area, p.body, p.photo, p.event_id, coalesce(p.here_until > now(), false), p.created_at,
         case when auth.uid() is null then null else p.author end,
         m.first_name,
         case when auth.uid() is null then null else m.photo end,
         m.langs, m.who, p.author = auth.uid(),
         coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'body', a.body, 'name', am.first_name, 'who', am.who,
                                                       'photo', case when auth.uid() is null then null else am.photo end)
                                    order by a.created_at)
                   from public.kr8_answers a join public.kr8_members am on am.user_id = a.author
                   where a.post_id = p.id and (auth.uid() is null or not public.kr8_is_blocked(auth.uid(), a.author))), '[]'::jsonb),
         p.video_path, p.poster_path, p.duration_ms, case when p.kind = 'reel' then p.status end,
         p.likes_count,
         exists (select 1 from public.kr8_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
         exists (select 1 from public.kr8_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
         case when p.author = auth.uid() or adm.yes then p.views_count end,   -- views: creator + team only
         m.ig_handle,
         v.id, v.name, v.name_th, t.id, t.deal_en, t.deal_th,
         o.pos
  from public.kr8_feed_order(p_area, p_seed) o
  join public.kr8_posts p on p.id = o.post_id
  join public.kr8_members m on m.user_id = p.author
  cross join (select public.kr8_is_admin() as yes) adm
  left join public.kr8_venues v on v.id = p.venue_id and v.status = 'live'
  left join lateral (select t.id, t.deal_en, t.deal_th from public.kr8_treats t
                     where t.venue_id = v.id and t.active and (t.ends_at is null or t.ends_at > now())
                     order by t.created_at desc limit 1) t on true
  order by o.pos
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 40), 1), 100)
$$;
revoke all on function public.kr8_feed_ranked(text, int, int, text) from public;
grant execute on function public.kr8_feed_ranked(text, int, int, text) to anon, authenticated;
