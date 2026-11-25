-- Retention 10 combined re-audit (read-only: everything inside is rolled back)
begin;
create temp table _out (k text, v json) on commit drop;
-- 1. fair play = board, every ranked real member (viewer: a real verified member)
select set_config('request.jwt.claims', json_build_object('sub', (select m.user_id from public.kr8_members m where m.verified and not m.ghost and not public.kr8_is_test_member(m.user_id) and not public.kr8_is_team(m.user_id) order by m.last_active_at desc nulls last limit 1), 'role', 'authenticated')::text, true);
create temp table _fp on commit drop as
  select b.rk, b.rings board, (f->>'rings')::int fp,
         (f->'likes_verified'->>'rings')::int + (f->'likes_newer'->>'rings')::int + (f->'saves'->>'rings')::int + (f->'opens'->>'rings')::int
         + (f->>'rules_adjust')::int + (f->>'tasks')::int + (f->>'ask_opens')::int + coalesce((f->>'ask_awards')::int, 0) + (f->>'invites')::int + (f->>'lag')::int parts,
         (f->>'lag')::int lag, (f->>'invites_shown')::boolean inv_shown, (f->>'invites')::int inv, m.member_no
    from public.kr8_week_board_cache b join public.kr8_members m on m.user_id = b.member_id
    cross join lateral (select public.kr8_fair_play(b.member_id) f) z where not b.is_test;
insert into _out select 'recon', json_build_object('n', count(*), 'mismatch', count(*) filter (where board <> fp or fp <> parts), 'lag_nonzero', count(*) filter (where lag <> 0),
   'pich', (select json_build_object('inv', inv, 'inv_shown', inv_shown, 'board', board, 'parts', parts) from _fp where member_no = 14)) from _fp;
-- 2. caps: task Rings per member per day never above 12 (real members, this week)
insert into _out select 'caps', json_build_object('max_task_day', (select max(s) from (select member_id, split_part(ref_id, ':', 1) d, sum(delta) s from public.kr8_rings_ledger
   where reason = 'task' and created_at >= public.kr8_week_start(now()) group by 1, 2) x),
   'award_per_member_week_max', (select coalesce(max(n), 0) from (select member_id, count(*) n from public.kr8_ask_awards where not is_test group by 1) y));
-- 3. photo hide takes back the photo-rate Rings (test photo; rolled back)
select set_config('request.jwt.claims', '', true);
select public.kr8_admin_photo_review((select id from public.kr8_posts where kind = 'photo' order by created_at desc limit 1), 'hide', 'test');
insert into _out select 'hide_revoke', json_build_object('undo_row', (select delta from public.kr8_rings_ledger where reason = 'task' and ref_id like '%:post_undo' order by id desc limit 1));
-- 4. UNDO dry-run (all, newest first) inside this transaction
-- ==== m227_ask_awards_UNDO
-- m227 UNDO: stop the 20:00 job, board / lifetime / fair-play back to before awards, award functions dropped. Ledger rows
-- 'ask_award' already written stay (append-only) and stop counting once the board function is restored; the widened reason check
-- stays (harmless). The award table is kept as the record (drop it by hand if wanted).

select cron.unschedule('kr8_ask_awards') where exists (select 1 from cron.job where jobname = 'kr8_ask_awards');
CREATE OR REPLACE FUNCTION public.kr8_week_board(p_w0 timestamp with time zone, p_test boolean)
 RETURNS TABLE(member_id uuid, rings integer, rk integer, first_at timestamp with time zone, reels jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with s as (select * from public.kr8_reel_scores_adj(p_w0, p_w0 + interval '7 days', p_w0 + interval '7 days', p_test)),
  r as (select s.*, row_number() over (partition by s.author order by s.score desc, s.posted_at asc, s.post_id) n,
               row_number() over (partition by s.author, (s.posted_at at time zone 'Asia/Bangkok')::date
                                  order by s.score desc, s.posted_at asc, s.post_id) dn
          from s),
  m as (select r.author, sum(r.score)::int rings, min(r.posted_at) filter (where r.n = 1) first_at, jsonb_agg(r.post_id order by r.n) reels
        from r
        where case when public.kr8_board_v2(p_w0) then r.dn = 1 and (r.n = 1 or r.score > 0)
                   else r.n <= greatest(public.kr8_rcfg('best_reels', 2), 1) and (r.n = 1 or r.score > 0) end
        group by r.author),
  tk as (select l.member_id author, sum(l.delta)::int rings, min(l.created_at) first_at
         from public.kr8_rings_ledger l
         where l.reason in ('task', 'ask_open') and l.created_at >= p_w0 and l.created_at < p_w0 + interval '7 days'
           and public.kr8_is_test_member(l.member_id) = p_test
         group by l.member_id),
  u as (select coalesce(m.author, tk.author) author, coalesce(m.rings, 0) + coalesce(tk.rings, 0) rings,
               coalesce(m.first_at, tk.first_at) first_at, coalesce(m.reels, '[]'::jsonb) reels
        from m full join tk on tk.author = m.author),
  t as (select u.author, u.rings + case when p_test then 0 else public.kr8_invite_rings(u.author, p_w0, p_w0 + interval '7 days') end rings,
               u.first_at, u.reels from u)
  select t.author, t.rings, (row_number() over (order by t.rings desc, t.first_at asc, mm.member_no asc))::int, t.first_at, t.reels
  from t join public.kr8_members mm on mm.user_id = t.author
  where not public.kr8_minor_held(t.author)
    and (coalesce(mm.verified, false) or p_test)   -- m188 (founder 21 Nov): only face-verified members are on the board
    and not coalesce(mm.ghost, false)              -- m206 (founder 24 Nov): a ghost is never ranked
    and not exists (select 1 from public.kr8_prize_bans b where b.user_id = t.author and b.scope = 'all')
$function$;

CREATE OR REPLACE FUNCTION public.kr8_task_rings_in(p_user uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ select coalesce(sum(l.delta), 0)::int from public.kr8_rings_ledger l
      where l.member_id = p_user and l.reason in ('task', 'ask_open') and l.created_at >= p_from and l.created_at < p_to $function$;

CREATE OR REPLACE FUNCTION public.kr8_fair_play(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); m public.kr8_members; t boolean; w0 timestamptz := public.kr8_week_start(now()); w1 timestamptz;
        meta record; until_ timestamptz; v2 boolean; best int; b_r int; b_rk int; on_board boolean := false;
        wl int := public.kr8_rcfg('like', 1); ws int := public.kr8_rcfg('save', 3); wo int := public.kr8_rcfg('open', 5);
        mult int := public.kr8_rcfg('traveller_mult', 2);
        reels jsonb; ids uuid[]; sc int; vloc int; ltrav int; lloc int; sloc int; strav int; opn int;
        r_lv int; r_ln int; r_sv int; r_op int; tsk int; askop int; inv int; paid boolean; likers_v jsonb; likers_n jsonb;
        src jsonb; notc jsonb; v_cand int; days jsonb; more int;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into m from public.kr8_members where user_id = p_user;
  if m.user_id is null or (uid <> p_user and public.kr8_is_blocked(uid, p_user)) or public.kr8_is_team(p_user) then raise exception 'KR8_NO_PERSON'; end if;
  t := public.kr8_is_test_member(p_user);
  w1 := w0 + interval '7 days';
  v2 := public.kr8_board_v2(w0);
  best := greatest(public.kr8_rcfg('best_reels', 2), 1);
  paid := public.kr8_is_paid_recruiter(p_user);
  select c.w0, c.computed_at into meta from public.kr8_week_board_cache_meta c where c.is_test = t;
  if meta.w0 = w0 and meta.computed_at > now() - interval '3 minutes' then
    until_ := meta.computed_at;
    select c.rings, c.rk into b_r, b_rk from public.kr8_week_board_cache c where c.is_test = t and c.member_id = p_user;
  else
    until_ := now();
    select b.rings, b.rk into b_r, b_rk from public.kr8_week_board(w0, t) b where b.member_id = p_user;
  end if;
  on_board := b_r is not null;

  -- the board's Reels for this member (same selection as kr8_week_board)
  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into reels from (
    with s as (select * from public.kr8_reel_scores_adj(w0, w1, until_, t, p_user)),
    r as (select s.*, row_number() over (order by s.score desc, s.posted_at asc, s.post_id) n,
                 row_number() over (partition by (s.posted_at at time zone 'Asia/Bangkok')::date order by s.score desc, s.posted_at asc, s.post_id) dn
            from s)
    select r.post_id, r.posted_at, r.l_local, r.l_trav, r.s_local, r.s_trav, r.opens, r.score from r
     where case when v2 then r.dn = 1 and (r.n = 1 or r.score > 0) else r.n <= best and (r.n = 1 or r.score > 0) end) q;
  select coalesce(array_agg(f.post_id), '{}'), coalesce(sum(f.score), 0)::int, coalesce(sum(f.l_local), 0)::int, coalesce(sum(f.l_trav), 0)::int,
         coalesce(sum(f.s_local), 0)::int, coalesce(sum(f.s_trav), 0)::int, coalesce(sum(f.opens), 0)::int
    into ids, sc, lloc, ltrav, sloc, strav, opn
    from jsonb_to_recordset(reels) f(post_id uuid, posted_at timestamptz, l_local int, l_trav int, s_local int, s_trav int, opens int, score int);
  select count(*)::int into more from public.kr8_reel_scores_adj(w0, w1, until_, t, p_user) x where not (x.post_id = any (ids));

  -- likers that counted: face-verified (same conditions as kr8_reel_scores 'ok2') and newer (unverified, capped 2 a day)
  with lk as (
    select l.user_id, lm.first_name, lm.lists_private, coalesce(lm.verified, false) ver,
           (lm.who = 'traveller' and coalesce(lm.verified, false)) trav, count(*)::int n
      from public.kr8_post_likes l join public.kr8_posts p on p.id = l.post_id join public.kr8_members lm on lm.user_id = l.user_id
     where l.post_id = any (ids) and l.user_id <> p.author and l.created_at < until_
       and coalesce(lm.photo, '') <> '' and btrim(coalesce(lm.first_name, '')) <> '' and public.kr8_is_test_member(lm.user_id) = t
       and not public.kr8_is_team(lm.user_id) and not coalesce(lm.ghost, false) and public.kr8_fake_counts(lm.user_id)
       and not public.kr8_minor_held(lm.user_id) and not exists (select 1 from public.kr8_prize_bans b where b.user_id = lm.user_id and b.scope = 'all')
       and not public.kr8_linked(l.user_id, p.author)
     group by 1, 2, 3, 4, 5)
  select coalesce(sum(n) filter (where ver and not trav), 0)::int,
         coalesce(jsonb_agg(jsonb_build_object('user_id', case when hide then null else user_id end, 'name', case when hide then null else first_name end,
                   'n', n, 'visitor', trav) order by n desc, first_name) filter (where ver), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('user_id', case when hide then null else user_id end, 'name', case when hide then null else first_name end,
                   'n', n) order by n desc, first_name) filter (where not ver), '[]'::jsonb)
    into vloc, likers_v, likers_n
    from (select lk.*, (coalesce(lk.lists_private, false) or (lk.user_id <> uid and public.kr8_is_blocked(uid, lk.user_id))) hide from lk) z;

  r_lv := vloc * wl + ltrav * wl * mult;
  r_ln := greatest(lloc - vloc, 0);
  r_sv := sloc * ws + strav * ws * mult;
  r_op := opn * wo;

  -- link opens from outside: counted ones by app, then what did not count and why (counts only)
  with o as (
    select x.*, p.author,
           (x.ok and x.opener is distinct from p.author and (x.opener is null or public.kr8_fake_counts(x.opener))
             and (x.opener is null or not public.kr8_linked(x.opener, p.author))
             and not exists (select 1 from public.kr8_share_opens mine where mine.opener = p.author and (mine.session = x.session or mine.device = x.device))) cand
      from public.kr8_share_opens x join public.kr8_posts p on p.id = x.post_id
     where x.post_id = any (ids) and x.created_at < until_)
  select coalesce((select jsonb_object_agg(k, n) from (select case when source in ('facebook', 'instagram', 'tiktok', 'line') then source else 'other' end k, count(*)::int n
                     from o where cand group by 1) q), '{}'::jsonb),
         coalesce((select count(*)::int from o where cand), 0),
         coalesce((select jsonb_object_agg(k, n) from (select case when ok then 'same_phone'
                                                                 when why in ('robot', 'line', 'repeat', 'own', 'pending') then why else 'other' end k, count(*)::int n
                     from o where not cand group by 1) q), '{}'::jsonb)
    into src, v_cand, notc;

  tsk := coalesce((select sum(l.delta)::int from public.kr8_rings_ledger l where l.member_id = p_user and l.reason = 'task'
                     and l.created_at >= w0 and l.created_at < least(w1, until_)), 0);
  askop := coalesce((select sum(l.delta)::int from public.kr8_rings_ledger l where l.member_id = p_user and l.reason = 'ask_open'
                     and l.created_at >= w0 and l.created_at < least(w1, until_)), 0);
  inv := case when t then 0 else public.kr8_invite_rings(p_user, w0, least(w1, until_)) end;

  select jsonb_agg(jsonb_build_object('day', dd::date,
           'reels', coalesce((select sum(f.score)::int from jsonb_to_recordset(reels) f(posted_at timestamptz, score int)
                               where (f.posted_at at time zone 'Asia/Bangkok')::date = dd::date), 0),
           'tasks', coalesce((select sum(l.delta)::int from public.kr8_rings_ledger l where l.member_id = p_user and l.reason in ('task', 'ask_open')
                               and l.created_at >= greatest(w0, (dd::timestamp at time zone 'Asia/Bangkok'))
                               and l.created_at < least(until_, ((dd + interval '1 day')::timestamp at time zone 'Asia/Bangkok'))), 0),
           'invites', case when t then 0 else public.kr8_invite_rings(p_user, (dd::timestamp at time zone 'Asia/Bangkok'),
                                                               least(until_, ((dd + interval '1 day')::timestamp at time zone 'Asia/Bangkok'))) end)
           order by dd)
    into days
    from generate_series((w0 at time zone 'Asia/Bangkok')::date, (w0 at time zone 'Asia/Bangkok')::date + 6, interval '1 day') dd
   where dd::date <= public.kr8_bkk_day();

  return jsonb_build_object(
    'user_id', p_user, 'first_name', m.first_name, 'is_me', uid = p_user, 'week_start', w0, 'as_of', until_,
    'on_board', on_board, 'rings', coalesce(b_r, sc + tsk + askop + inv), 'rank', b_rk,
    'reels_total', sc, 'reel_count', cardinality(ids), 'more_reels', more,
    'likes_verified', jsonb_build_object('n', vloc + ltrav, 'visitors', ltrav, 'rings', r_lv, 'who', likers_v),
    'likes_newer', jsonb_build_object('n', r_ln, 'rings', r_ln, 'who', likers_n, 'day_cap', public.kr8_rcfg('v2_unv_day_cap', 2)),
    'saves', jsonb_build_object('n', sloc + strav, 'rings', r_sv),
    'opens', jsonb_build_object('n', opn, 'rings', r_op, 'by_app', src, 'over_cap', greatest(v_cand - opn, 0), 'not_counted', notc,
                                'day_cap', public.kr8_rcfg('v2_opens_day_cap', 10)),
    'rules_adjust', sc - (r_lv + r_ln + r_sv + r_op),
    'tasks', tsk, 'ask_opens', askop,
    'invites', inv, 'invites_shown', not paid,
    'lag', case when b_r is null then 0 else b_r - (sc + tsk + askop + inv) end,
    'weights', jsonb_build_object('like', wl, 'save', ws, 'open', wo, 'mult', mult),
    'days', coalesce(days, '[]'::jsonb));
end $function$;

drop function if exists public.kr8_ask_awards_recent();
drop function if exists public.kr8_ask_awards_run(boolean, date);
drop function if exists public.kr8_award_linked(uuid, uuid);

-- ==== m226_daily_photo_UNDO
-- m226 UNDO: feed / task functions back to their 26 Nov bodies; photo functions dropped. Photo posts already made stay in kr8_posts
-- (to remove them from view: update kr8_posts set hidden = true where kind = 'photo'). Ledger rows stay (append-only).

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
    and (p.kind <> 'reel' or not coalesce(p.feed_off, false) or p.author = auth.uid())   -- 0147 Hide from feed
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
        and (p.kind <> 'reel' or not coalesce(p.feed_off, false) or p.author = uid)   -- 0147 Hide from feed
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
    when 'post' then exists (select 1 from public.kr8_posts x where x.author = p_uid and x.kind = 'reel' and x.status = 'approved' and not coalesce(x.hidden, false)
                             and (x.created_at at time zone 'Asia/Bangkok')::date = p_day)
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
  insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (uid, n, 'task', d::text || ':' || p_task)
    on conflict (member_id, reason, ref_id) do nothing;
  return public.kr8_tasks_today();
end $function$;

drop function if exists public.kr8_admin_photo_review(uuid, text, text);
drop function if exists public.kr8_admin_photos();
drop function if exists public.kr8_member_photos(uuid);
drop function if exists public.kr8_create_photo(text, text, text, uuid);
delete from public.kr8_rings_config where key = 'task_photo';

-- ==== m225_test_isolation_UNDO
-- m225 UNDO: the 7 functions back to their 26 Nov bodies; the helper goes.

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

-- ==== m224_newcomers_league_UNDO
-- m224 UNDO: stop the weekly job, remove the Rising Local tags and the league functions.

select cron.unschedule('kr8_newcomers_close') where exists (select 1 from cron.job where jobname = 'kr8_newcomers_close');
delete from public.kr8_member_badges where badge = 'rising_local';
drop function if exists public.kr8_newcomers_close(boolean);
drop function if exists public.kr8_newcomers_board(int);
drop table if exists public.kr8_newcomer_results;

-- ==== m223_fair_play_UNDO
-- m223 UNDO

drop function if exists public.kr8_fair_play(uuid);

-- ==== m222_bestie_streak_UNDO
-- m222 UNDO: drop the bestie streak (no Rings were ever attached to it).

drop function if exists public.kr8_bestie_of(uuid);
drop function if exists public.kr8_bestie_state();
drop function if exists public.kr8_bestie_seen();
drop function if exists public.kr8_bestie_nudge(uuid);
drop function if exists public.kr8_bestie_act(uuid, text);
drop function if exists public.kr8_bestie_invite(uuid);
drop function if exists public.kr8_bestie_pair_ok(uuid, uuid);
drop function if exists public.kr8_bestie_count(uuid, uuid, date);
drop function if exists public.kr8_task_days_of(uuid, date);
drop table if exists public.kr8_bestie_nudges;
drop table if exists public.kr8_besties;

-- ==== m221_open_question_UNDO
-- m221 UNDO: kr8_send_hello back to its 25 Nov body; the new functions go; the two columns stay (harmless, nothing reads them).
-- To remove them too: alter table public.kr8_members drop column open_q, drop column open_q_on;

drop function if exists public.kr8_open_q_answer(uuid, text);
drop function if exists public.kr8_open_q_of(uuid);
drop function if exists public.kr8_set_open_q(text, boolean);
CREATE OR REPLACE FUNCTION public.kr8_send_hello(p_to uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); a uuid; b uuid; tid uuid; n int;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if p_to is null or p_to = uid or not exists (select 1 from public.kr8_members where user_id = p_to) then raise exception 'KR8_NO_PERSON'; end if;
  if public.kr8_is_blocked(uid, p_to) then raise exception 'KR8_BLOCKED'; end if;
  -- 0175: no new chat before the face check (same rule as kr8_face_gate; the Kring Team can always be reached)
  if public.kr8_face_gate(uid) and not public.kr8_is_team(p_to) then raise exception 'KR8_VERIFY_FIRST'; end if;
  -- m207: the receiving half. An unchecked account cannot be contacted at all. KR8_NO_PERSON, not a
  -- "they have not verified" message, so a uuid picked up elsewhere cannot be used to test who exists.
  if not public.kr8_is_admin() and not public.kr8_is_team(uid) and public.kr8_face_gate(p_to) then raise exception 'KR8_NO_PERSON'; end if;
  if not public.kr8_text_ok(p_body, 280) then raise exception 'KR8_BAD_TEXT'; end if;
  a := least(uid, p_to); b := greatest(uid, p_to);
  perform pg_advisory_xact_lock(hashtext(a::text || b::text));
  select id into tid from public.kr8_threads where user_a = a and user_b = b;
  if tid is not null then
    -- they said hi first: tell me to reply in Messages instead of "you already said hi"
    if exists (select 1 from public.kr8_threads where id = tid and opened_by <> uid) then raise exception 'KR8_THEY_SAID_HI'; end if;
    raise exception 'KR8_ALREADY_SAID_HI';
  end if;
  perform pg_advisory_xact_lock(hashtext('hello-' || uid::text));
  select count(*) into n from public.kr8_threads
   where opened_by = uid and created_at > date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
  if n >= 15 then raise exception 'KR8_DAILY_LIMIT'; end if;
  insert into public.kr8_threads (user_a, user_b, opened_by) values (a, b, uid) returning id into tid;
  insert into public.kr8_messages (thread_id, sender, body) values (tid, uid, btrim(p_body));
  return tid;
end $function$;

-- ==== m220_follow3_profile_only_UNDO
-- m220 UNDO. Reels already set profile-only by the new button keep feed_off = true with reason 'q:<key>' (the old admin
-- "Move to Feed" button still flips them back one by one).

drop function if exists public.kr8_my_profile_only();
drop function if exists public.kr8_admin_reel_profile_only(uuid, text);
drop function if exists public.kr8_profile_only_reasons();
drop function if exists public.kr8_onb_follow_suggest(int);

-- ==== m219_welcome_b5_UNDO
-- m219 UNDO: drop the Welcome / Bangkok at 5 functions and tables. Ledger rows already written ('task', 'YYYY-MM-DD:welcome' /
-- ':b5') stay (append-only ledger) and keep counting as task Rings on the board, like any claimed task.

drop function if exists public.kr8_admin_b5_ids(uuid[]);
drop function if exists public.kr8_b5_row();
drop function if exists public.kr8_b5_mark(uuid);
drop function if exists public.kr8_task_extra_claim(text);
drop function if exists public.kr8_task_extra();
drop function if exists public.kr8_b5_open(timestamptz);
drop function if exists public.kr8_task_welcome_pool(uuid, int);
drop function if exists public.kr8_r10_reel_json(uuid, uuid);
drop function if exists public.kr8_r10_reel_ok(uuid, uuid);
drop function if exists public.kr8_task_cap_left(uuid, date);
drop table if exists public.kr8_b5_clips;
drop table if exists public.kr8_task_welcome_picks;
delete from public.kr8_rings_config where key in ('task_welcome_max', 'task_b5', 'b5_hour', 'b5_hours_open');

-- ==== m218_paid_recruiter_honorary_founding_UNDO
-- m218 UNDO: restore the 25 Nov bodies of kr8_invite_rings, kr8_my_invites, kr8_card_extras, kr8_founding_try,
-- kr8_notyet_founding_open; drop the m218 tables + helpers.

CREATE OR REPLACE FUNCTION public.kr8_invite_rings(p_user uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(sum(l.delta), 0)::int from public.kr8_rings_ledger l
  where l.member_id = p_user and l.reason in ('invite', 'invite_welcome') and l.created_at >= p_from and l.created_at < p_to
    and l.ref_id ~ '^[0-9a-f-]{36}$'
    and case when l.reason = 'invite' then public.kr8_invite_pair_ok(l.member_id, l.ref_id::uuid)
             else public.kr8_invite_pair_ok(l.ref_id::uuid, l.member_id) end
$function$


;

CREATE OR REPLACE FUNCTION public.kr8_my_invites()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when auth.uid() is null then null else jsonb_build_object(
    'friends', (select count(*)::int from public.kr8_rings_ledger l where l.member_id = auth.uid() and l.reason = 'invite'
                  and l.ref_id ~ '^[0-9a-f-]{36}$' and public.kr8_invite_pair_ok(l.member_id, l.ref_id::uuid)),
    'rings', public.kr8_invite_rings(auth.uid(), '-infinity', 'infinity'),
    'x', public.kr8_rcfg('invite', 10)) end
$function$


;

CREATE OR REPLACE FUNCTION public.kr8_card_extras(p_user uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); tgt uuid := coalesce(p_user, auth.uid()); m public.kr8_members; t record; gated boolean;
begin
  if tgt is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into m from public.kr8_members where user_id = tgt;
  if m.user_id is null or (uid is not null and tgt <> uid and public.kr8_is_blocked(uid, tgt)) then raise exception 'KR8_NO_PERSON'; end if;
  select * into t from public.kr8_member_rings(tgt);
  gated := public.kr8_face_gate(uid) and tgt is distinct from uid;   -- m207: no socials for an unchecked viewer
  return jsonb_build_object('member_no', m.member_no,
    'ig_handle', case when gated then null else m.ig_handle end,
    'tiktok_handle', case when gated then null else m.tiktok_handle end,
    'lifetime', t.lifetime, 'level', public.kr8_rings_level(t.lifetime), 'week', t.week, 'week_rank', t.week_rank,
    'founding_no', (select founding_no from public.kr8_prizes where member_id = tgt and kind = 'founding'),
    'founding_left', case when uid = tgt and public.kr8_rcfg('founding_on', 1) = 1 then greatest(0, public.kr8_rcfg('founding_slots', 50)
        - (select count(*)::int from public.kr8_prizes where kind = 'founding' and is_test = public.kr8_is_test_member(tgt) and status <> 'cancelled')) end,
    'founding_thb', public.kr8_rcfg('founding_thb', 100),
    'has_reel', case when uid = tgt then exists (select 1 from public.kr8_posts where author = tgt and kind = 'reel' and not hidden) end,
    'prizes', case when uid = tgt then (select count(*) from public.kr8_prizes where member_id = tgt and status = 'won') end);
end $function$


;

CREATE OR REPLACE FUNCTION public.kr8_founding_try(p_member uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare t boolean; n int; amt int := public.kr8_rcfg('founding_thb', 100); eh text; lh text; mx float8 := public.kr8_rcfg('face_same_max', 500) / 1000.0; o record;
begin
  if public.kr8_rcfg('founding_on', 1) <> 1 or amt <= 0 then return null; end if;
  if not exists (select 1 from public.kr8_members where user_id = p_member) then return null; end if;
  if public.kr8_is_team(p_member) then return null; end if;
  if exists (select 1 from public.kr8_prizes where member_id = p_member and kind = 'founding') then return null; end if;
  if not exists (select 1 from public.kr8_posts where author = p_member and kind = 'reel' and status = 'approved' and not hidden) then return null; end if;
  -- same person as an earlier Founding Local (also a deleted account): same email, same LINE, or same face
  eh := public.kr8_email_hash_of(p_member); lh := public.kr8_line_hash_of(p_member);
  if exists (select 1 from public.kr8_prizes x where x.kind = 'founding' and x.member_id is distinct from p_member
             and ((eh is not null and x.email_hash = eh) or (lh is not null and x.line_hash = lh))) then return null; end if;
  for o in select x.member_id from public.kr8_prizes x where x.kind = 'founding' and x.member_id is not null and x.member_id <> p_member
             and x.status <> 'cancelled'
             and exists (select 1 from public.kr8_face_prints a join public.kr8_face_prints b on b.user_id = x.member_id
                         where a.user_id = p_member and public.kr8_face_strength(a.source, b.source, public.kr8_face_dist(a.descriptor, b.descriptor)) = 'same'   /*fake0124*/) loop
    perform public.kr8_link_add(p_member, o.member_id, 'face', jsonb_build_object('where', 'founding check'));
    return null;
  end loop;
  if exists (select 1 from public.kr8_face_prints a join public.kr8_prize_faces k on k.kept_at > now() - interval '1 year'
             where a.user_id = p_member and public.kr8_face_strength(a.source, 'verify', public.kr8_face_dist(a.descriptor, k.descriptor)) = 'same') then return null; end if;
  t := public.kr8_is_test_member(p_member);
  perform pg_advisory_xact_lock(hashtext('kr8_founding:' || t::text));
  select coalesce(max(founding_no), 0) + 1 into n from public.kr8_prizes where kind = 'founding' and is_test = t;
  if n > public.kr8_rcfg('founding_slots', 50) then return null; end if;
  insert into public.kr8_prizes (member_id, kind, founding_no, amount_thb, is_test) values (p_member, 'founding', n, amt, t) on conflict do nothing;
  if not found then return null; end if;
  return n;
end $function$


;

CREATE OR REPLACE FUNCTION public.kr8_notyet_founding_open(p_member uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.kr8_rcfg('founding_on', 1) = 1 and public.kr8_rcfg('founding_thb', 100) > 0
     and not public.kr8_is_team(p_member)
     and not exists (select 1 from public.kr8_prizes where member_id = p_member and kind = 'founding')
     and (select coalesce(max(founding_no), 0) from public.kr8_prizes
           where kind = 'founding' and is_test = public.kr8_is_test_member(p_member)) < public.kr8_rcfg('founding_slots', 50)
$function$


;

drop function if exists public.kr8_is_paid_recruiter(uuid);
drop function if exists public.kr8_honorary_founding_no(uuid);
drop table if exists public.kr8_paid_recruiters;
drop table if exists public.kr8_honorary_founding;


insert into _out select 'undo', json_build_object('undo_ok', true,
  'gone', (select count(*) from pg_proc where proname in ('kr8_fair_play','kr8_task_extra','kr8_create_photo','kr8_test_hidden','kr8_ask_awards_run','kr8_bestie_state','kr8_open_q_answer','kr8_newcomers_board','kr8_is_paid_recruiter')),
  'board_after_undo', (select count(*) from public.kr8_week_board(public.kr8_week_start(now()), false)));
select json_object_agg(k, v) r from _out;
rollback;
