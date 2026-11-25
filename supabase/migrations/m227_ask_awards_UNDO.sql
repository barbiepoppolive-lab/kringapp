-- m227 UNDO: stop the 20:00 job, board / lifetime / fair-play back to before awards, award functions dropped. Ledger rows
-- 'ask_award' already written stay (append-only) and stop counting once the board function is restored; the widened reason check
-- stays (harmless). The award table is kept as the record (drop it by hand if wanted).
begin;
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
commit;
