-- m226 (26 Nov 2026) Daily photo (founder-approved). One photo a Bangkok day, live on the member's profile at once; the founder taps
-- Feed in the admin queue to put it on the main feed (full-screen photo card between Reels; the live app already draws these).
--   · kr8_create_photo(photo data-URL JPEG ≤ 400 KB, area, caption, place) — face-checked members, 1 a day, kind 'photo',
--     status approved, feed_off = true (profile only) until promoted.
--   · feed rules: feed_off now applies to photos too (kr8_feed, kr8_feed_order), so nothing unreviewed reaches the main feed.
--   · daily task "Post a photo or Reel": a photo today completes it; photo-only day pays task_photo = 3, an approved Reel 5 (as before).
--     One claim a day (unchanged). Photo likes earn no board Rings (the board counts Reels only) — the +3 is the photo's Rings.
--   · kr8_admin_photos / kr8_admin_photo_review(post, 'feed' | 'profile' | 'hide', reason): Hide = rule break, takes back that day's
--     photo-rate task Rings (one −3 ledger row) when no Reel was posted that day.
--   · kr8_member_photos(user): the profile grid's photos (blocks / test / minors / ghosts as everywhere).
-- Rollback: m226_daily_photo_UNDO.sql
begin;
insert into public.kr8_rings_config (key, value) values ('task_photo', 3) on conflict (key) do nothing;

create or replace function public.kr8_create_photo(p_photo text, p_area text default null, p_body text default null, p_place uuid default null)
 returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); m public.kr8_members; pid uuid; d date := public.kr8_bkk_day(); b text := nullif(btrim(coalesce(p_body, '')), '');
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into m from public.kr8_members where user_id = uid;
  if m.user_id is null then raise exception 'KR8_NO_CARD'; end if;
  if not coalesce(m.verified, false) or coalesce(m.ghost, false) then raise exception 'KR8_VERIFY_FIRST'; end if;
  if p_photo is null or p_photo !~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$' or length(p_photo) > 560000 or length(p_photo) < 4000 then raise exception 'KR8_BAD_PHOTO'; end if;
  if b is not null and not public.kr8_text_ok(b, 140) then raise exception 'KR8_BAD_TEXT'; end if;
  if not public.kr8_area_ok(coalesce(p_area, 'Bangkok')) then raise exception 'KR8_BAD_AREA'; end if;
  perform pg_advisory_xact_lock(hashtext('kr8_photo:' || uid::text));
  if exists (select 1 from public.kr8_posts x where x.author = uid and x.kind = 'photo' and not x.hidden and (x.created_at at time zone 'Asia/Bangkok')::date = d) then
    raise exception 'KR8_PHOTO_DAY';
  end if;
  insert into public.kr8_posts (author, kind, area, body, photo, status, feed_off, feed_off_reason, feed_off_at)
  values (uid, 'photo', coalesce(p_area, 'Bangkok'), coalesce(b, ''), p_photo, 'approved', true, null, now())
  returning id into pid;
  if p_place is not null and exists (select 1 from public.kr8_places where id = p_place) then
    insert into public.kr8_post_places (post_id, place_id, position) values (pid, p_place, 1) on conflict do nothing;
  end if;
  return pid;
end $function$;
revoke execute on function public.kr8_create_photo(text, text, text, uuid) from public, anon;
grant execute on function public.kr8_create_photo(text, text, text, uuid) to authenticated;

create or replace function public.kr8_member_photos(p_user uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if p_user <> uid and (public.kr8_is_blocked(uid, p_user) or public.kr8_test_hidden(uid, p_user) or public.kr8_minor_held(p_user)) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'photo', p.photo, 'body', p.body, 'at', p.created_at, 'likes', p.likes_count,
           'feed', not coalesce(p.feed_off, false), 'reason', case when p_user = uid and p.feed_off_reason like 'q:%' then substr(p.feed_off_reason, 3) end,
           'place', (select jsonb_build_object('en', pl.name_en, 'th', pl.name_th) from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id where pp.post_id = p.id limit 1))
           order by p.created_at desc)
     from (select * from public.kr8_posts p where p.author = p_user and p.kind = 'photo' and not p.hidden and p.status = 'approved' order by p.created_at desc limit 30) p), '[]'::jsonb);
end $function$;
revoke execute on function public.kr8_member_photos(uuid) from public, anon;
grant execute on function public.kr8_member_photos(uuid) to authenticated;

create or replace function public.kr8_admin_photos()
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'photo', p.photo, 'body', p.body, 'area', p.area, 'at', p.created_at,
           'author_id', p.author, 'author_name', m.first_name, 'member_no', m.member_no, 'test', public.kr8_is_test_member(p.author)) order by p.created_at)
     from public.kr8_posts p join public.kr8_members m on m.user_id = p.author
    where p.kind = 'photo' and not p.hidden and p.reviewed_at is null and p.created_at > now() - interval '7 days'
      and not public.kr8_is_test_member(p.author)), '[]'::jsonb);   -- QA test photos never reach the founder's queue
end $function$;
revoke execute on function public.kr8_admin_photos() from public, anon;
grant execute on function public.kr8_admin_photos() to authenticated;

create or replace function public.kr8_admin_photo_review(p_post uuid, p_action text, p_reason text default null)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare p public.kr8_posts; d date; paid int;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  select * into p from public.kr8_posts where id = p_post and kind = 'photo';
  if p.id is null then raise exception 'KR8_NOT_FOUND'; end if;
  if p_action = 'feed' then
    update public.kr8_posts set feed_off = false, feed_off_reason = null, feed_off_at = now(), feed_off_by = auth.uid(), reviewed_at = now(), reviewed_by = auth.uid() where id = p_post;
  elsif p_action = 'profile' then
    if p_reason is not null and not (p_reason = any (public.kr8_profile_only_reasons())) then raise exception 'KR8_BAD_REASON'; end if;
    update public.kr8_posts set feed_off = true, feed_off_reason = case when p_reason is not null then 'q:' || p_reason end, feed_off_at = now(), feed_off_by = auth.uid(),
           reviewed_at = now(), reviewed_by = auth.uid() where id = p_post;
  elsif p_action = 'hide' then
    update public.kr8_posts set status = 'hidden', hidden = true, review_note = nullif(left(btrim(coalesce(p_reason, '')), 200), ''), reviewed_at = now(), reviewed_by = auth.uid() where id = p_post;
    -- a rule-break photo does not keep its task Rings (only when that day's post claim was at the photo rate)
    d := (p.created_at at time zone 'Asia/Bangkok')::date;
    select delta into paid from public.kr8_rings_ledger where member_id = p.author and reason = 'task' and ref_id = d::text || ':post';
    if paid is not null and paid = public.kr8_rcfg('task_photo', 3) then
      insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (p.author, -paid, 'task', d::text || ':post_undo') on conflict do nothing;
    end if;
  else raise exception 'KR8_BAD_ACTION'; end if;
  return jsonb_build_object('id', p_post, 'action', p_action);
end $function$;
revoke execute on function public.kr8_admin_photo_review(uuid, text, text) from public, anon;
grant execute on function public.kr8_admin_photo_review(uuid, text, text) to authenticated;

CREATE OR REPLACE FUNCTION public.kr8_feed(p_area text DEFAULT NULL::text, p_limit integer DEFAULT 40)
 RETURNS TABLE(id uuid, kind text, area text, body text, photo text, event_id text, here boolean, created_at timestamp with time zone, author_id uuid, author_name text, author_photo text, author_langs text[], author_who text, mine boolean, answers jsonb, video_path text, poster_path text, duration_ms integer, reel_status text, likes integer, liked boolean, saved boolean, views integer, ig_handle text, venue_id text, venue_name text, venue_name_th text, deal_id text, deal_en text, deal_th text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
         case when public.kr8_face_gate(auth.uid()) then null else m.ig_handle end,   -- m207
         v.id, v.name, v.name_th, t.id, t.deal_en, t.deal_th
  from public.kr8_posts p join public.kr8_members m on m.user_id = p.author
  cross join (select public.kr8_is_admin() as yes) adm
  left join public.kr8_venues v on v.id = p.venue_id and v.status = 'live'
  left join lateral (select t.id, t.deal_en, t.deal_th from public.kr8_treats t
                     where t.venue_id = v.id and t.active and (t.ends_at is null or t.ends_at > now())
                     order by t.created_at desc limit 1) t on true
  where not p.hidden
    and (p.kind <> 'reel' or p.status = 'approved' or (p.status = 'pending' and p.author = auth.uid()))
    and (p.kind not in ('reel', 'photo') or not coalesce(p.feed_off, false) or p.author = auth.uid())   -- m226: a photo is on the feed only after the founder taps Feed   -- 0147 Hide from feed
    and (p.author = auth.uid() or not public.kr8_minor_held(p.author))   -- 0151
    and (p.author = auth.uid() or (not coalesce(m.ghost, false) and not public.kr8_is_test_member(p.author)))   -- 0193: never test / paused cards (signed-out fallback too)
    and p.kind <> 'ask'   -- 0057: questions live in kr8_ask_feed; without this they would push Reels out of the 40-row feed
    and p.created_at > now() - interval '14 days'
    and (p_area is null or p.area = p_area)
    and (auth.uid() is null or not public.kr8_is_blocked(auth.uid(), p.author))
    and (auth.uid() is null or not exists (select 1 from public.kr8_post_hidden h where h.user_id = auth.uid() and h.post_id = p.id))
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100)
$function$;

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
        and (p.kind not in ('reel', 'photo') or not coalesce(p.feed_off, false) or p.author = uid)   -- m226: a photo is on the feed only after the founder taps Feed   -- 0147 Hide from feed
        and (p.author = uid or not public.kr8_minor_held(p.author))   -- 0151 possible under 18: out of public feeds
        and p.created_at > now() - make_interval(days => win)
        and (p_area is null or p.area = p_area)
        and (uid is null or not public.kr8_is_blocked(uid, p.author))
        and (uid is null or not exists (select 1 from public.kr8_post_hidden h where h.user_id = uid and h.post_id = p.id))
        and (uid is not null or not (coalesce(m.ghost, false) or public.kr8_is_team(p.author)))   -- guests: no ghosts, no Kring Team
        and not public.kr8_test_hidden(uid, p.author)   -- m225: test accounts only reach test accounts
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

CREATE OR REPLACE FUNCTION public.kr8_task_done(p_uid uuid, p_day date, p_task text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case p_task
    when 'ask' then public.kr8_task_ask_done(p_uid, p_day)
    when 'vote' then exists (select 1 from public.kr8_task_vote_picks v where v.member_id = p_uid and v.day = p_day)
    when 'watch' then public.kr8_task_watch_n(p_uid, p_day) >= public.kr8_rcfg('task_watch_goal', 3)
    when 'open' then exists (select 1 from public.kr8_task_days d where d.member_id = p_uid and d.day = p_day and d.opened_at is not null)
    when 'post' then exists (select 1 from public.kr8_posts x where x.author = p_uid and x.kind in ('reel', 'photo') and x.status = 'approved' and not coalesce(x.hidden, false)
                             and (x.created_at at time zone 'Asia/Bangkok')::date = p_day)   -- m226: a photo counts too (+3, a Reel +5)
    when 'bonus' then (select count(distinct split_part(l.ref_id, ':', 2)) from public.kr8_rings_ledger l where l.member_id = p_uid and l.reason = 'task'
                       and l.ref_id in (p_day::text || ':post', p_day::text || ':ask', p_day::text || ':vote', p_day::text || ':watch')) = 4
    else false end
$function$;

CREATE OR REPLACE FUNCTION public.kr8_task_claim(p_task text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); d date := public.kr8_bkk_day(); n int; ver boolean;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if public.kr8_rcfg('tasks_on', 1) <> 1 then raise exception 'KR8_TASKS_OFF'; end if;
  if p_task not in ('post', 'ask', 'vote', 'watch', 'bonus', 'open') then raise exception 'KR8_TASK_BAD'; end if;
  select coalesce(m.verified, false) into ver from public.kr8_members m where m.user_id = uid;
  if not coalesce(ver, false) then raise exception 'KR8_TASK_FACE'; end if;
  if p_task = 'open' then perform public.kr8_tasks_today(); end if;
  if not public.kr8_task_done(uid, d, p_task) then raise exception 'KR8_TASK_NOT_DONE'; end if;
  n := public.kr8_task_rings(p_task);
  -- m226: a photo-only day pays the photo rate (task_photo, 3); an approved Reel the Reel rate
  if p_task = 'post' and not exists (select 1 from public.kr8_posts x where x.author = uid and x.kind = 'reel' and x.status = 'approved' and not coalesce(x.hidden, false)
                                       and (x.created_at at time zone 'Asia/Bangkok')::date = d) then
    n := public.kr8_rcfg('task_photo', 3);
  end if;
  insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (uid, n, 'task', d::text || ':' || p_task)
    on conflict (member_id, reason, ref_id) do nothing;
  return public.kr8_tasks_today();
end $function$;
commit;
