-- 0171 (20 Nov, founder): DAILY TASKS. Additive: new tables + RPCs, 'task' added to the Rings ledger, task Rings on the weekly board.
-- Tasks (Bangkok day, resets 00:00): ask (+3) answer 1 Ask a Thai · vote (+1) quick vote · watch (+1) 3 Reels to the end · open (+1) daily check-in.
-- 'say' (Say it in Thai) is "coming soon" (not doable). Max 6 Rings a day. Only face-verified members can CLAIM (others get KR8_TASK_FACE).
-- Everything is checked on the server; the app only asks. Kill switch: kr8_rings_config tasks_on (1 = on).

insert into public.kr8_rings_config (key, value) values
  ('tasks_on', 1), ('task_ask', 3), ('task_vote', 1), ('task_watch', 1), ('task_open', 1), ('task_ask_min_chars', 15), ('task_watch_goal', 3)
on conflict (key) do nothing;

-- the Rings ledger accepts 'task' (ref_id = 'YYYY-MM-DD:<task>', unique per member → one claim per task per day)
alter table public.kr8_rings_ledger drop constraint kr8_rings_ledger_reason_check;
alter table public.kr8_rings_ledger add constraint kr8_rings_ledger_reason_check check (reason = any (array[
  'reel_place','likes_50','friend_join','friend_welcome','checkin','streak','react3','weekly_top','reel_removed','claim','invite','invite_welcome','task']));

create or replace function public.kr8_bkk_day(t timestamptz default now()) returns date language sql stable
as $$ select (t at time zone 'Asia/Bangkok')::date $$;

-- daily state (done flags for tasks whose proof isn't elsewhere)
create table if not exists public.kr8_task_days (
  member_id uuid not null references public.kr8_members(user_id) on delete cascade,
  day date not null,
  opened_at timestamptz,
  primary key (member_id, day)
);
alter table public.kr8_task_days enable row level security;

-- quick votes: one per Bangkok day
create table if not exists public.kr8_task_votes (
  day date primary key,
  kind text not null check (kind in ('pair', 'price')),
  q_en text not null, q_th text not null,
  a_en text not null, a_th text not null, a_img text,
  b_en text not null, b_th text not null, b_img text,
  c_en text, c_th text,
  img text
);
alter table public.kr8_task_votes enable row level security;

create table if not exists public.kr8_task_vote_picks (
  day date not null references public.kr8_task_votes(day) on delete cascade,
  member_id uuid not null references public.kr8_members(user_id) on delete cascade,
  pick text not null check (pick in ('a', 'b', 'c')),
  at timestamptz not null default now(),
  primary key (day, member_id)
);
alter table public.kr8_task_vote_picks enable row level security;

-- watched Reels: start → end; 'end' only counts if the time since 'start' is ≥ 90% of the Reel's length
create table if not exists public.kr8_task_watch (
  member_id uuid not null references public.kr8_members(user_id) on delete cascade,
  day date not null,
  post_id uuid not null references public.kr8_posts(id) on delete cascade,
  started_at timestamptz not null default now(),
  done_at timestamptz,
  primary key (member_id, day, post_id)
);
alter table public.kr8_task_watch enable row level security;

-- one question to answer today (newest visible Ask a Thai question this member hasn't answered and didn't ask)
create or replace function public.kr8_task_ask_pick(p_uid uuid) returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object('id', p.id, 'body', left(p.body, 140))
  from public.kr8_posts p
  where p.kind = 'ask' and not coalesce(p.hidden, false) and p.author <> p_uid
    and not exists (select 1 from public.kr8_members g where g.user_id = p.author and coalesce(g.ghost, false))
    and not exists (select 1 from public.kr8_ask_answers a where a.post_id = p.id and a.author = p_uid)
  order by p.created_at desc limit 1
$$;

-- ask task is DONE when today (Bangkok) the member wrote a visible top-level answer ≥ N chars that isn't a copy of anyone else's answer
create or replace function public.kr8_task_ask_done(p_uid uuid, p_day date) returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.kr8_ask_answers a
    where a.author = p_uid and a.parent_id is null and not coalesce(a.hidden, false)
      and public.kr8_bkk_day(a.created_at) = p_day
      and char_length(btrim(coalesce(a.body, ''))) >= public.kr8_rcfg('task_ask_min_chars', 15)
      and not exists (select 1 from public.kr8_ask_answers o where o.id <> a.id and o.author <> p_uid
                        and lower(regexp_replace(btrim(o.body), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(a.body), '\s+', ' ', 'g'))))
$$;

create or replace function public.kr8_task_watch_n(p_uid uuid, p_day date) returns int language sql stable security definer set search_path to 'public', 'pg_temp'
as $$ select count(*)::int from public.kr8_task_watch w where w.member_id = p_uid and w.day = p_day and w.done_at is not null $$;

create or replace function public.kr8_task_done(p_uid uuid, p_day date, p_task text) returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select case p_task
    when 'ask' then public.kr8_task_ask_done(p_uid, p_day)
    when 'vote' then exists (select 1 from public.kr8_task_vote_picks v where v.member_id = p_uid and v.day = p_day)
    when 'watch' then public.kr8_task_watch_n(p_uid, p_day) >= public.kr8_rcfg('task_watch_goal', 3)
    when 'open' then exists (select 1 from public.kr8_task_days d where d.member_id = p_uid and d.day = p_day and d.opened_at is not null)
    else false end
$$;

create or replace function public.kr8_task_rings(p_task text) returns int language sql stable security definer set search_path to 'public', 'pg_temp'
as $$ select case p_task when 'ask' then public.kr8_rcfg('task_ask', 3) when 'vote' then public.kr8_rcfg('task_vote', 1)
                         when 'watch' then public.kr8_rcfg('task_watch', 1) when 'open' then public.kr8_rcfg('task_open', 1) else 0 end $$;

-- the whole tasks panel for the signed-in member; also records today's check-in ('open' task)
create or replace function public.kr8_tasks_today() returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare uid uuid := auth.uid(); d date := public.kr8_bkk_day(); ver boolean; v public.kr8_task_votes; vp text; tot int; votes jsonb;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if public.kr8_rcfg('tasks_on', 1) <> 1 then return jsonb_build_object('on', false); end if;
  insert into public.kr8_task_days (member_id, day, opened_at) values (uid, d, now())
    on conflict (member_id, day) do update set opened_at = coalesce(public.kr8_task_days.opened_at, excluded.opened_at);
  select coalesce(m.verified, false) into ver from public.kr8_members m where m.user_id = uid;
  select * into v from public.kr8_task_votes where day = d;
  select pick into vp from public.kr8_task_vote_picks where day = d and member_id = uid;
  if vp is not null then
    select count(*) into tot from public.kr8_task_vote_picks where day = d;
    select jsonb_object_agg(k, round(100.0 * n / greatest(tot, 1))) into votes
      from (select pick k, count(*) n from public.kr8_task_vote_picks where day = d group by pick) x;
  end if;
  return jsonb_build_object(
    'on', true, 'day', d,
    'resets_at', ((d + 1)::timestamp at time zone 'Asia/Bangkok'),
    'verified', ver,
    'max', public.kr8_rcfg('task_ask', 3) + public.kr8_rcfg('task_vote', 1) + public.kr8_rcfg('task_watch', 1) + public.kr8_rcfg('task_open', 1),
    'rings_today', coalesce((select sum(delta)::int from public.kr8_rings_ledger where member_id = uid and reason = 'task' and ref_id like d::text || ':%'), 0),
    'streak', (select jsonb_agg(exists (select 1 from public.kr8_rings_ledger l where l.member_id = uid and l.reason = 'task' and l.ref_id like (d - g)::text || ':%')
                                order by g desc) from generate_series(0, 6) g),
    'tasks', jsonb_build_array(
      jsonb_build_object('id', 'ask', 'rings', public.kr8_task_rings('ask'), 'done', public.kr8_task_done(uid, d, 'ask'),
        'claimed', exists (select 1 from public.kr8_rings_ledger where member_id = uid and reason = 'task' and ref_id = d::text || ':ask'),
        'question', public.kr8_task_ask_pick(uid), 'min_chars', public.kr8_rcfg('task_ask_min_chars', 15)),
      jsonb_build_object('id', 'say', 'rings', 2, 'soon', true),
      jsonb_build_object('id', 'vote', 'rings', public.kr8_task_rings('vote'), 'done', vp is not null,
        'claimed', exists (select 1 from public.kr8_rings_ledger where member_id = uid and reason = 'task' and ref_id = d::text || ':vote'),
        'vote', case when v.day is null then null else jsonb_build_object('kind', v.kind, 'q_en', v.q_en, 'q_th', v.q_th,
                  'a_en', v.a_en, 'a_th', v.a_th, 'a_img', v.a_img, 'b_en', v.b_en, 'b_th', v.b_th, 'b_img', v.b_img,
                  'c_en', v.c_en, 'c_th', v.c_th, 'img', v.img, 'pick', vp, 'pct', votes) end),
      jsonb_build_object('id', 'watch', 'rings', public.kr8_task_rings('watch'), 'progress', least(public.kr8_task_watch_n(uid, d), public.kr8_rcfg('task_watch_goal', 3)),
        'goal', public.kr8_rcfg('task_watch_goal', 3), 'done', public.kr8_task_done(uid, d, 'watch'),
        'claimed', exists (select 1 from public.kr8_rings_ledger where member_id = uid and reason = 'task' and ref_id = d::text || ':watch')),
      jsonb_build_object('id', 'open', 'rings', public.kr8_task_rings('open'), 'done', true,
        'claimed', exists (select 1 from public.kr8_rings_ledger where member_id = uid and reason = 'task' and ref_id = d::text || ':open'))
    ));
end $$;

create or replace function public.kr8_task_vote(p_pick text) returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare uid uuid := auth.uid(); d date := public.kr8_bkk_day(); v public.kr8_task_votes;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into v from public.kr8_task_votes where day = d;
  if v.day is null then raise exception 'KR8_TASK_NO_VOTE'; end if;
  if p_pick not in ('a', 'b', 'c') or (p_pick = 'c' and v.c_en is null) then raise exception 'KR8_TASK_BAD_PICK'; end if;
  insert into public.kr8_task_vote_picks (day, member_id, pick) values (d, uid, p_pick) on conflict (day, member_id) do nothing;
  return public.kr8_tasks_today();
end $$;

-- p_phase 'start' when a Reel begins, 'end' when it reaches its end; 'end' counts only if ≥ 90% of its length really passed
create or replace function public.kr8_task_watch(p_post uuid, p_phase text) returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare uid uuid := auth.uid(); d date := public.kr8_bkk_day(); p public.kr8_posts; st timestamptz; need interval;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into p from public.kr8_posts where id = p_post;
  if p.id is null or p.kind <> 'reel' or p.status <> 'approved' or coalesce(p.hidden, false) or p.author = uid then
    return jsonb_build_object('counted', false, 'progress', public.kr8_task_watch_n(uid, d));
  end if;
  if p_phase = 'start' then
    insert into public.kr8_task_watch (member_id, day, post_id) values (uid, d, p_post)
      on conflict (member_id, day, post_id) do update set started_at = case when public.kr8_task_watch.done_at is null then now() else public.kr8_task_watch.started_at end;
  elsif p_phase = 'end' then
    select started_at into st from public.kr8_task_watch where member_id = uid and day = d and post_id = p_post and done_at is null;
    need := make_interval(secs => greatest(coalesce(p.duration_ms, 8000), 3000) * 0.9 / 1000.0);
    if st is not null and now() - st >= need then
      update public.kr8_task_watch set done_at = now() where member_id = uid and day = d and post_id = p_post;
    end if;
  else
    raise exception 'KR8_BAD_PHASE';
  end if;
  return jsonb_build_object('counted', exists (select 1 from public.kr8_task_watch where member_id = uid and day = d and post_id = p_post and done_at is not null),
                            'progress', public.kr8_task_watch_n(uid, d), 'goal', public.kr8_rcfg('task_watch_goal', 3));
end $$;

-- claim: done + face-verified + not yet claimed today → Rings into the ledger (this week's board and lifetime Rings)
create or replace function public.kr8_task_claim(p_task text) returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare uid uuid := auth.uid(); d date := public.kr8_bkk_day(); n int; ver boolean;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if public.kr8_rcfg('tasks_on', 1) <> 1 then raise exception 'KR8_TASKS_OFF'; end if;
  if p_task not in ('ask', 'vote', 'watch', 'open') then raise exception 'KR8_TASK_BAD'; end if;
  select coalesce(m.verified, false) into ver from public.kr8_members m where m.user_id = uid;
  if not coalesce(ver, false) then raise exception 'KR8_TASK_FACE'; end if;
  if p_task = 'open' then perform public.kr8_tasks_today(); end if;
  if not public.kr8_task_done(uid, d, p_task) then raise exception 'KR8_TASK_NOT_DONE'; end if;
  n := public.kr8_task_rings(p_task);
  insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (uid, n, 'task', d::text || ':' || p_task)
    on conflict (member_id, reason, ref_id) do nothing;
  return public.kr8_tasks_today();
end $$;

-- task Rings in a time window (this week / lifetime)
create or replace function public.kr8_task_rings_in(p_user uuid, p_from timestamptz, p_to timestamptz) returns int language sql stable security definer set search_path to 'public', 'pg_temp'
as $$ select coalesce(sum(l.delta), 0)::int from public.kr8_rings_ledger l
      where l.member_id = p_user and l.reason = 'task' and l.created_at >= p_from and l.created_at < p_to $$;

-- weekly board: + task Rings; a member with only task Rings this week is on the board too (founder: tasks qualify)
create or replace function public.kr8_week_board(p_w0 timestamp with time zone, p_test boolean)
 RETURNS TABLE(member_id uuid, rings integer, rk integer, first_at timestamp with time zone, reels jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  with s as (select * from public.kr8_reel_scores_adj(p_w0, p_w0 + interval '7 days', p_w0 + interval '7 days', p_test)),
  r as (select s.*, row_number() over (partition by s.author order by s.score desc, s.posted_at asc, s.post_id) n from s),
  -- 0094: a member whose best Reel has 0 Rings still shows (their best = earliest Reel this week); a 0-Ring Reel never fills a 2nd/3rd best slot
  m as (select r.author, sum(r.score)::int rings, min(r.posted_at) filter (where r.n = 1) first_at, jsonb_agg(r.post_id order by r.n) reels
        from r where r.n <= greatest(public.kr8_rcfg('best_reels', 2), 1) and (r.n = 1 or r.score > 0) group by r.author),
  -- 0171: daily-task Rings this week (test boards only see test members' task Rings)
  tk as (select l.member_id author, sum(l.delta)::int rings, min(l.created_at) first_at
         from public.kr8_rings_ledger l
         where l.reason = 'task' and l.created_at >= p_w0 and l.created_at < p_w0 + interval '7 days'
           and public.kr8_is_test_member(l.member_id) = p_test
         group by l.member_id),
  u as (select coalesce(m.author, tk.author) author, coalesce(m.rings, 0) + coalesce(tk.rings, 0) rings,
               coalesce(m.first_at, tk.first_at) first_at, coalesce(m.reels, '[]'::jsonb) reels
        from m full join tk on tk.author = m.author),
  -- 0109: + invite Rings earned this week (test boards never get any: kr8_invite_pair_ok excludes test accounts)
  t as (select u.author, u.rings + case when p_test then 0 else public.kr8_invite_rings(u.author, p_w0, p_w0 + interval '7 days') end rings,
               u.first_at, u.reels from u)
  select t.author, t.rings, (row_number() over (order by t.rings desc, t.first_at asc, mm.member_no asc))::int, t.first_at, t.reels
  from t join public.kr8_members mm on mm.user_id = t.author
  -- 0167 (20 Nov): anyone on the under-18 / child-photo hold or with an all-prizes ban is off the public board (ranks shift up)
  where not public.kr8_minor_held(t.author)
    and not exists (select 1 from public.kr8_prize_bans b where b.user_id = t.author and b.scope = 'all')
$function$;

-- lifetime Rings + task Rings
create or replace function public.kr8_member_rings(p_user uuid)
 RETURNS TABLE(lifetime integer, week integer, week_rank integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  with t as (select public.kr8_is_test_member(p_user) v)
  select coalesce((select sum(s.score)::int from t, public.kr8_reel_scores('-infinity', 'infinity', 'infinity', t.v, p_user) s), 0)
           + public.kr8_invite_rings(p_user, '-infinity', 'infinity')
           + public.kr8_task_rings_in(p_user, '-infinity', 'infinity'),
         coalesce((select b.rings from t, public.kr8_week_board(public.kr8_week_start(now()), t.v) b where b.member_id = p_user), 0),
         (select b.rk from t, public.kr8_week_board(public.kr8_week_start(now()), t.v) b where b.member_id = p_user)
$function$;

revoke all on function public.kr8_tasks_today() from public, anon;
revoke all on function public.kr8_task_vote(text) from public, anon;
revoke all on function public.kr8_task_watch(uuid, text) from public, anon;
revoke all on function public.kr8_task_claim(text) from public, anon;
grant execute on function public.kr8_tasks_today() to authenticated;
grant execute on function public.kr8_task_vote(text) to authenticated;
grant execute on function public.kr8_task_watch(uuid, text) to authenticated;
grant execute on function public.kr8_task_claim(text) to authenticated;
revoke all on function public.kr8_task_ask_pick(uuid), public.kr8_task_ask_done(uuid, date), public.kr8_task_watch_n(uuid, date),
  public.kr8_task_done(uuid, date, text), public.kr8_task_rings(text), public.kr8_task_rings_in(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- 7 days of real Bangkok quick votes (photos are in the app: /media/places/*.jpg)
insert into public.kr8_task_votes (day, kind, q_en, q_th, a_en, a_th, a_img, b_en, b_th, b_img, c_en, c_th, img) values
 ('2026-11-20', 'pair', 'Friday night: where are you going?', 'คืนวันศุกร์นี้ไปไหนดี', 'Asiatique', 'เอเชียทีค', 'asiatique-the-riverfront.jpg', 'Khao San Road', 'ถนนข้าวสาร', 'khao-san-road.jpg', null, null, null),
 ('2026-11-21', 'price', 'Tuk-tuk from Siam Square to Khao San Road for ฿300 — fair?', 'ตุ๊กตุ๊กจากสยามไปข้าวสาร 300 บาท แพงไหม', 'Cheap', 'ถูก', null, 'Fair', 'ราคาโอเค', null, 'Too much', 'แพงไป', 'siam-square.jpg'),
 ('2026-11-22', 'pair', 'Saturday morning plan?', 'เช้าวันเสาร์ไปไหนดี', 'Chatuchak Market', 'ตลาดนัดจตุจักร', 'chatuchak-weekend-market.jpg', 'Jim Thompson House', 'บ้านจิม ทอมป์สัน', 'jim-thompson-house.jpg', null, null, null),
 ('2026-11-23', 'pair', 'Sunday walk: which park?', 'เดินเล่นวันอาทิตย์ สวนไหนดี', 'Lumphini Park', 'สวนลุมพินี', 'lumphini-park.jpg', 'Benjakitti Forest Park', 'สวนป่าเบญจกิติ', 'benjakitti-forest-park.jpg', null, null, null),
 ('2026-11-24', 'price', 'Thai milk tea at a Thonglor café for ฿95 — fair?', 'ชาไทยร้านคาเฟ่ทองหล่อแก้วละ 95 บาท แพงไหม', 'Cheap', 'ถูก', null, 'Fair', 'ราคาโอเค', null, 'Too much', 'แพงไป', 'thonglor.jpg'),
 ('2026-11-25', 'pair', 'Evening street walk?', 'เดินเล่นตอนเย็นที่ไหนดี', 'Talat Phlu', 'ตลาดพลู', 'talat-phlu.jpg', 'Charoen Krung', 'เจริญกรุง', 'charoen-krung.jpg', null, null, null),
 ('2026-11-26', 'pair', 'Rainy day: which mall?', 'ฝนตก ไปห้างไหนดี', 'Siam Paragon', 'สยามพารากอน', 'siam-paragon.jpg', 'Terminal 21 Asok', 'เทอร์มินอล 21 อโศก', 'terminal-21-asok.jpg', null, null, null)
on conflict (day) do nothing;
