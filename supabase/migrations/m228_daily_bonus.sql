-- m228 (founder 26 Nov, variant A): daily bonus Rings on the weekly board.
--   Today's top 3 (+10/+6/+3): most board Rings earned that Bangkok day; face-checked, >= 10 that day; ties: earlier time reaching it.
--   Biggest climber (+5): largest (today - own average of the previous 7 days, 0-days count); face-checked, >= 5 today, not in top 3.
--   Board only (not under the 12/day task cap), own fair-play lines, ledger rows keyed (member, reason, 'day:YYYY-MM-DD') = never paid twice.
--   Runs 23:59 Bangkok (cron 59 16 UTC); the Sunday run lands before kr8_close_week (Mon 00:01). Switch daily_bonus_on (default 0).
--   "Rings earned that day" = board total at the end of the day minus at its start (same week, same rules), bonuses excluded.
begin;

insert into public.kr8_rings_config (key, value, note) values
  ('daily_bonus_on', 0, 'm228: daily top 3 + biggest climber bonuses for real members (test accounts always)'),
  ('daily_top_1', 10, 'm228'), ('daily_top_2', 6, 'm228'), ('daily_top_3', 3, 'm228'), ('daily_climb', 5, 'm228'),
  ('daily_top_min', 10, 'm228: min board Rings that day for the top 3'), ('daily_climb_min', 5, 'm228: min board Rings that day for the climber')
on conflict (key) do nothing;

alter table public.kr8_rings_ledger drop constraint kr8_rings_ledger_reason_check;
alter table public.kr8_rings_ledger add constraint kr8_rings_ledger_reason_check check (reason = any (array['reel_place', 'likes_50', 'friend_join',
  'friend_welcome', 'checkin', 'streak', 'react3', 'weekly_top', 'reel_removed', 'claim', 'invite', 'invite_welcome', 'task', 'ask_open', 'ask_award',
  'daily_top', 'daily_climb']::text[]));

create table if not exists public.kr8_daily_rings (day date not null, is_test boolean not null, member_id uuid not null, rings int not null,
  last_at timestamptz, primary key (day, is_test, member_id));
create table if not exists public.kr8_daily_rings_days (day date not null, is_test boolean not null, stored_at timestamptz not null default now(),
  primary key (day, is_test));
create table if not exists public.kr8_daily_bonus (day date not null, is_test boolean not null, kind text not null check (kind in ('top1', 'top2', 'top3', 'climb')),
  member_id uuid not null, rings_day int not null, avg7 numeric, bonus int not null, paid_at timestamptz not null default now(), primary key (day, is_test, kind));
create table if not exists public.kr8_daily_top_cache (is_test boolean primary key, data jsonb not null, computed_at timestamptz not null default now());
alter table public.kr8_daily_rings enable row level security;
alter table public.kr8_daily_rings_days enable row level security;
alter table public.kr8_daily_bonus enable row level security;
alter table public.kr8_daily_top_cache enable row level security;
revoke all on public.kr8_daily_rings, public.kr8_daily_rings_days, public.kr8_daily_bonus, public.kr8_daily_top_cache from anon, authenticated;

CREATE OR REPLACE FUNCTION public.kr8_week_board_at(p_w0 timestamp with time zone, p_asof timestamp with time zone, p_test boolean)
 RETURNS TABLE(member_id uuid, rings integer, rk integer, first_at timestamp with time zone, reels jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with s as (select * from public.kr8_reel_scores_adj(p_w0, p_w0 + interval '7 days', least(p_asof, p_w0 + interval '7 days'), p_test)),
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
         where l.reason in ('task', 'ask_open', 'ask_award') and l.created_at >= p_w0 and l.created_at < least(p_asof, p_w0 + interval '7 days')
           and public.kr8_is_test_member(l.member_id) = p_test
         group by l.member_id),
  u as (select coalesce(m.author, tk.author) author, coalesce(m.rings, 0) + coalesce(tk.rings, 0) rings,
               coalesce(m.first_at, tk.first_at) first_at, coalesce(m.reels, '[]'::jsonb) reels
        from m full join tk on tk.author = m.author),
  t as (select u.author, u.rings + case when p_test then 0 else public.kr8_invite_rings(u.author, p_w0, least(p_asof, p_w0 + interval '7 days')) end rings,
               u.first_at, u.reels from u)
  select t.author, t.rings, (row_number() over (order by t.rings desc, t.first_at asc, mm.member_no asc))::int, t.first_at, t.reels
  from t join public.kr8_members mm on mm.user_id = t.author
  where not public.kr8_minor_held(t.author)
    and (coalesce(mm.verified, false) or p_test)   -- m188 (founder 21 Nov): only face-verified members are on the board
    and not coalesce(mm.ghost, false)              -- m206 (founder 24 Nov): a ghost is never ranked
    and not exists (select 1 from public.kr8_prize_bans b where b.user_id = t.author and b.scope = 'all')
$function$
;

-- Rings each member earned on Bangkok day p_day (up to p_asof), with the time of their last counting event (ties: earlier wins)
CREATE OR REPLACE FUNCTION public.kr8_day_rings(p_day date, p_test boolean, p_asof timestamptz DEFAULT NULL)
 RETURNS TABLE(member_id uuid, rings integer, last_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  with b as (select (p_day::timestamp at time zone 'Asia/Bangkok') d0, ((p_day + 1)::timestamp at time zone 'Asia/Bangkok') d1),
  w as (select b.d0, b.d1, least(coalesce(p_asof, b.d1), b.d1) a1, public.kr8_week_start(b.d0) w0 from b),
  e as (select x.member_id, x.rings from w, public.kr8_week_board_at(w.w0, w.a1, p_test) x),
  s as (select x.member_id, x.rings from w, public.kr8_week_board_at(w.w0, w.d0, p_test) x where w.d0 > w.w0),
  d as (select e.member_id, e.rings - coalesce(s.rings, 0) rings from e left join s on s.member_id = e.member_id)
  select d.member_id, d.rings::int,
         (select max(q.t) from w, lateral (
            select max(l.created_at) t from public.kr8_post_likes l join public.kr8_posts p on p.id = l.post_id
             where p.author = d.member_id and p.kind = 'reel' and p.created_at >= w.w0 and l.created_at >= w.d0 and l.created_at < w.a1 and l.user_id <> d.member_id
            union all
            select max(sv.created_at) from public.kr8_post_saves sv join public.kr8_posts p on p.id = sv.post_id
             where p.author = d.member_id and p.kind = 'reel' and p.created_at >= w.w0 and sv.created_at >= w.d0 and sv.created_at < w.a1 and sv.user_id <> d.member_id
            union all
            select max(o.created_at) from public.kr8_share_opens o join public.kr8_posts p on p.id = o.post_id
             where p.author = d.member_id and p.created_at >= w.w0 and o.ok and o.created_at >= w.d0 and o.created_at < w.a1
            union all
            select max(l.created_at) from public.kr8_rings_ledger l
             where l.member_id = d.member_id and l.reason not in ('daily_top', 'daily_climb') and l.created_at >= w.d0 and l.created_at < w.a1) q)
  from d where d.rings > 0
$function$;

-- a finished day's Rings, stored once (the climber's 7-day average reads these)
CREATE OR REPLACE FUNCTION public.kr8_day_rings_kept(p_day date, p_test boolean)
 RETURNS TABLE(member_id uuid, rings integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_day < public.kr8_bkk_day() and not exists (select 1 from public.kr8_daily_rings_days k where k.day = p_day and k.is_test = p_test) then
    insert into public.kr8_daily_rings (day, is_test, member_id, rings, last_at)
      select p_day, p_test, x.member_id, x.rings, x.last_at from public.kr8_day_rings(p_day, p_test) x on conflict do nothing;
    insert into public.kr8_daily_rings_days (day, is_test) values (p_day, p_test) on conflict do nothing;
  end if;
  if exists (select 1 from public.kr8_daily_rings_days k where k.day = p_day and k.is_test = p_test) then
    return query select r.member_id, r.rings from public.kr8_daily_rings r where r.day = p_day and r.is_test = p_test;
  else
    return query select x.member_id, x.rings from public.kr8_day_rings(p_day, p_test) x;
  end if;
end $function$;

-- who wins day p_day (as of p_asof): top 3 and the biggest climber. No writes except the 7-day history store.
CREATE OR REPLACE FUNCTION public.kr8_daily_bonus_pick(p_day date, p_test boolean, p_asof timestamptz DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare top jsonb; cl jsonb; mn int := public.kr8_rcfg('daily_top_min', 10); cmn int := public.kr8_rcfg('daily_climb_min', 5);
begin
  create temp table if not exists _dr (member_id uuid primary key, rings int, last_at timestamptz, member_no int, ok boolean) on commit drop;
  truncate _dr;
  insert into _dr select x.member_id, x.rings, x.last_at, m.member_no,
         coalesce(m.verified, false) and not coalesce(m.ghost, false) and not public.kr8_is_team(x.member_id)
         and public.kr8_is_test_member(x.member_id) = p_test and not public.kr8_minor_held(x.member_id)
    from public.kr8_day_rings(p_day, p_test, p_asof) x join public.kr8_members m on m.user_id = x.member_id;
  select coalesce(jsonb_agg(jsonb_build_object('rank', q.rk, 'member_id', q.member_id, 'rings', q.rings, 'at', q.last_at,
                                               'bonus', public.kr8_rcfg('daily_top_' || q.rk, 0)) order by q.rk), '[]'::jsonb)
    into top
    from (select d.*, row_number() over (order by d.rings desc, d.last_at asc nulls last, d.member_no asc) rk
            from _dr d where d.ok and d.rings >= mn) q where q.rk <= 3;
  -- climber: today minus own average of the 7 days before (0-days count as 0)
  select jsonb_build_object('member_id', c.member_id, 'rings', c.rings, 'avg7', round(c.avg7, 1), 'diff', round(c.rings - c.avg7, 1),
                            'at', c.last_at, 'bonus', public.kr8_rcfg('daily_climb', 5))
    into cl
    from (select d.member_id, d.rings, d.last_at, d.member_no,
                 coalesce((select sum(h.rings) from generate_series(1, 7) g(i), lateral public.kr8_day_rings_kept(p_day - g.i, p_test) h
                            where h.member_id = d.member_id), 0) / 7.0 avg7
            from _dr d where d.ok and d.rings >= cmn
             and not exists (select 1 from jsonb_array_elements(top) t where (t->>'member_id')::uuid = d.member_id)) c
   where c.rings - c.avg7 > 0
   order by c.rings - c.avg7 desc, c.last_at asc nulls last, c.member_no asc limit 1;
  return jsonb_build_object('day', p_day, 'top', top, 'climber', cl);
end $function$;

-- pay day p_day (default: today, Bangkok). Real members only while daily_bonus_on = 1. A paid day is never paid again.
CREATE OR REPLACE FUNCTION public.kr8_daily_bonus_run(p_test boolean, p_day date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare d date := coalesce(p_day, public.kr8_bkk_day()); d1 timestamptz; at_ timestamptz; pk jsonb; x jsonb; n int := 0;
begin
  if not p_test and public.kr8_rcfg('daily_bonus_on', 0) <> 1 then return jsonb_build_object('skipped', 'off'); end if;
  if d > public.kr8_bkk_day() then return jsonb_build_object('skipped', 'future'); end if;
  perform pg_advisory_xact_lock(hashtext('kr8_daily_bonus:' || p_test::text));
  if exists (select 1 from public.kr8_daily_bonus b where b.day = d and b.is_test = p_test)
     or exists (select 1 from public.kr8_rings_ledger l where l.reason in ('daily_top', 'daily_climb') and l.ref_id = 'day:' || d
                and public.kr8_is_test_member(l.member_id) = p_test) then
    return jsonb_build_object('skipped', 'done', 'day', d);
  end if;
  d1 := ((d + 1)::timestamp at time zone 'Asia/Bangkok');
  at_ := least(now() - interval '1 second', d1 - interval '1 second');   -- inside day d, so inside its week (Sunday lands before the close); before the board refresh that follows
  pk := public.kr8_daily_bonus_pick(d, p_test, at_);
  for x in select * from jsonb_array_elements(pk->'top') loop
    insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id, created_at)
      values ((x->>'member_id')::uuid, (x->>'bonus')::int, 'daily_top', 'day:' || d, at_) on conflict do nothing;
    insert into public.kr8_daily_bonus (day, is_test, kind, member_id, rings_day, bonus, paid_at)
      values (d, p_test, 'top' || (x->>'rank'), (x->>'member_id')::uuid, (x->>'rings')::int, (x->>'bonus')::int, at_) on conflict do nothing;
    n := n + 1;
  end loop;
  if pk->'climber' is not null and jsonb_typeof(pk->'climber') = 'object' then
    x := pk->'climber';
    insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id, created_at)
      values ((x->>'member_id')::uuid, (x->>'bonus')::int, 'daily_climb', 'day:' || d, at_) on conflict do nothing;
    insert into public.kr8_daily_bonus (day, is_test, kind, member_id, rings_day, avg7, bonus, paid_at)
      values (d, p_test, 'climb', (x->>'member_id')::uuid, (x->>'rings')::int, (x->>'avg7')::numeric, (x->>'bonus')::int, at_) on conflict do nothing;
    n := n + 1;
  end if;
  return jsonb_build_object('day', d, 'paid', n, 'pick', pk);
end $function$;

-- the board strip: refreshed with the board cache, at most every 5 minutes
CREATE OR REPLACE FUNCTION public.kr8_daily_top_refresh(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare t boolean; d date := public.kr8_bkk_day(); pk jsonb; st text; wd date; any_today boolean; out jsonb := '{}'::jsonb;
begin
  foreach t in array array[false, true] loop
    if not p_force and exists (select 1 from public.kr8_daily_top_cache c where c.is_test = t and c.computed_at > now() - interval '5 minutes') then continue; end if;
    if not t and public.kr8_rcfg('daily_bonus_on', 0) <> 1 then
      insert into public.kr8_daily_top_cache (is_test, data, computed_at) values (t, jsonb_build_object('on', false), now())
        on conflict (is_test) do update set data = excluded.data, computed_at = excluded.computed_at;
      continue;
    end if;
    if exists (select 1 from public.kr8_daily_bonus b where b.day = d and b.is_test = t) then
      st := 'won'; wd := d;   -- after 23:59: tonight's winners
    else
      select exists (select 1 from public.kr8_day_rings(d, t) x) into any_today;
      if not any_today and exists (select 1 from public.kr8_daily_bonus b where b.day = d - 1 and b.is_test = t) then st := 'won'; wd := d - 1;
      else st := 'live'; wd := d; end if;
    end if;
    if st = 'won' then
      pk := jsonb_build_object('day', wd,
        'top', coalesce((select jsonb_agg(jsonb_build_object('rank', substr(b.kind, 4)::int, 'member_id', b.member_id, 'rings', b.rings_day, 'bonus', b.bonus)
                                order by b.kind) from public.kr8_daily_bonus b where b.day = wd and b.is_test = t and b.kind like 'top%'), '[]'::jsonb),
        'climber', (select jsonb_build_object('member_id', b.member_id, 'rings', b.rings_day, 'bonus', b.bonus)
                      from public.kr8_daily_bonus b where b.day = wd and b.is_test = t and b.kind = 'climb'));
    else
      pk := public.kr8_daily_bonus_pick(d, t, now());
    end if;
    insert into public.kr8_daily_top_cache (is_test, data, computed_at)
      values (t, pk || jsonb_build_object('on', true, 'state', st, 'min', public.kr8_rcfg('daily_top_min', 10)), now())
      on conflict (is_test) do update set data = excluded.data, computed_at = excluded.computed_at;
    out := out || jsonb_build_object(case when t then 'test' else 'live' end, st);
  end loop;
  return out;
end $function$;

-- members: today's strip (names and photos added at read time; blocked people and the team never shown)
CREATE OR REPLACE FUNCTION public.kr8_daily_top()
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
declare uid uuid := auth.uid(); t boolean; c jsonb; who jsonb;
begin
  t := uid is not null and public.kr8_is_test_member(uid);
  select x.data into c from public.kr8_daily_top_cache x where x.is_test = t;
  if c is null or not coalesce((c->>'on')::boolean, false) then return jsonb_build_object('on', false); end if;
  select coalesce(jsonb_object_agg(m.user_id, jsonb_build_object('first_name', m.first_name, 'photo', case when uid is null then null else m.photo end,
                                                                  'me', m.user_id = uid)), '{}'::jsonb)
    into who from public.kr8_members m
   where m.user_id in (select (e->>'member_id')::uuid from jsonb_array_elements(coalesce(c->'top', '[]'::jsonb)) e
                       union select (c->'climber'->>'member_id')::uuid where jsonb_typeof(c->'climber') = 'object')
     and (uid is null or not public.kr8_is_blocked(uid, m.user_id));
  return c || jsonb_build_object('who', who,
    'bonus', jsonb_build_array(public.kr8_rcfg('daily_top_1', 10), public.kr8_rcfg('daily_top_2', 6), public.kr8_rcfg('daily_top_3', 3)),
    'climb', public.kr8_rcfg('daily_climb', 5));
end $function$;

revoke execute on function public.kr8_week_board_at(timestamptz, timestamptz, boolean), public.kr8_day_rings(date, boolean, timestamptz),
  public.kr8_day_rings_kept(date, boolean), public.kr8_daily_bonus_pick(date, boolean, timestamptz), public.kr8_daily_bonus_run(boolean, date),
  public.kr8_daily_top_refresh(boolean) from public, anon, authenticated;
grant execute on function public.kr8_daily_top() to anon, authenticated;

-- board, lifetime and fair play count the bonuses
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
         where l.reason in ('task', 'ask_open', 'ask_award', 'daily_top', 'daily_climb') and l.created_at >= p_w0 and l.created_at < p_w0 + interval '7 days'
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
$function$
;

CREATE OR REPLACE FUNCTION public.kr8_task_rings_in(p_user uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ select coalesce(sum(l.delta), 0)::int from public.kr8_rings_ledger l
      where l.member_id = p_user and l.reason in ('task', 'ask_open', 'ask_award', 'daily_top', 'daily_climb') and l.created_at >= p_from and l.created_at < p_to $function$
;

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
        r_lv int; r_ln int; award int; dtop int; dclimb int; r_sv int; r_op int; tsk int; askop int; inv int; paid boolean; likers_v jsonb; likers_n jsonb;
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
  award := coalesce((select sum(l.delta)::int from public.kr8_rings_ledger l where l.member_id = p_user and l.reason = 'ask_award'
                     and l.created_at >= w0 and l.created_at < least(w1, until_)), 0);
  -- m228: daily bonuses (Today's top 3 / Biggest climber), their own lines
  dtop := coalesce((select sum(l.delta)::int from public.kr8_rings_ledger l where l.member_id = p_user and l.reason = 'daily_top'
                     and l.created_at >= w0 and l.created_at < least(w1, until_)), 0);
  dclimb := coalesce((select sum(l.delta)::int from public.kr8_rings_ledger l where l.member_id = p_user and l.reason = 'daily_climb'
                     and l.created_at >= w0 and l.created_at < least(w1, until_)), 0);
  inv := case when t then 0 else public.kr8_invite_rings(p_user, w0, least(w1, until_)) end;

  select jsonb_agg(jsonb_build_object('day', dd::date,
           'reels', coalesce((select sum(f.score)::int from jsonb_to_recordset(reels) f(posted_at timestamptz, score int)
                               where (f.posted_at at time zone 'Asia/Bangkok')::date = dd::date), 0),
           'tasks', coalesce((select sum(l.delta)::int from public.kr8_rings_ledger l where l.member_id = p_user and l.reason in ('task', 'ask_open', 'ask_award')
                               and l.created_at >= greatest(w0, (dd::timestamp at time zone 'Asia/Bangkok'))
                               and l.created_at < least(until_, ((dd + interval '1 day')::timestamp at time zone 'Asia/Bangkok'))), 0),
           'bonus', coalesce((select sum(l.delta)::int from public.kr8_rings_ledger l where l.member_id = p_user and l.reason in ('daily_top', 'daily_climb')
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
    'on_board', on_board, 'rings', coalesce(b_r, sc + tsk + askop + award + dtop + dclimb + inv), 'rank', b_rk,
    'reels_total', sc, 'reel_count', cardinality(ids), 'more_reels', more,
    'likes_verified', jsonb_build_object('n', vloc + ltrav, 'visitors', ltrav, 'rings', r_lv, 'who', likers_v),
    'likes_newer', jsonb_build_object('n', r_ln, 'rings', r_ln, 'who', likers_n, 'day_cap', public.kr8_rcfg('v2_unv_day_cap', 2)),
    'saves', jsonb_build_object('n', sloc + strav, 'rings', r_sv),
    'opens', jsonb_build_object('n', opn, 'rings', r_op, 'by_app', src, 'over_cap', greatest(v_cand - opn, 0), 'not_counted', notc,
                                'day_cap', public.kr8_rcfg('v2_opens_day_cap', 10)),
    'rules_adjust', sc - (r_lv + r_ln + r_sv + r_op),
    'tasks', tsk, 'ask_opens', askop, 'ask_awards', award, 'daily_top', dtop, 'daily_climb', dclimb,
    'invites', inv, 'invites_shown', not paid,
    'lag', case when b_r is null then 0 else b_r - (sc + tsk + askop + award + dtop + dclimb + inv) end,
    'weights', jsonb_build_object('like', wl, 'save', ws, 'open', wo, 'mult', mult),
    'days', coalesce(days, '[]'::jsonb));
end $function$
;

select cron.schedule('kr8_daily_bonus', '59 16 * * *', $c$select public.kr8_daily_bonus_run(false); select public.kr8_daily_bonus_run(true); select public.kr8_week_board_refresh(); select public.kr8_daily_top_refresh(true);$c$);
select cron.schedule('kr8_daily_top', '*/5 * * * *', $c$select public.kr8_daily_top_refresh()$c$);

commit;
