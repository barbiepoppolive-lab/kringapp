-- m219 (26 Nov 2026) Retention 10, features 1 + 5: two new daily tasks and the "Bangkok at 5" row.
--   1. Welcome new Locals: up to 3 approved Feed Reels from members who joined ≤7 days ago, posted ≤48 h ago, with <5 likes
--      (fewest first, one per newcomer). Picked ONCE per member per Bangkok day (kr8_task_welcome_picks). Liking all of today's picks completes
--      it: 1 Ring per picked Reel (max 3).
--   5. Bangkok at 5: 17:00–19:00 Bangkok a member can mark the Reel they just posted as their 5pm clip (kr8_b5_clips). It is
--      a normal Reel: the founder approves it in the normal queue (Feed / Profile only / Hide). Approved clips show in a
--      "Bangkok at 5" row for 24 h. Task: today's 5pm clip approved → +1 Ring.
--   Both tasks are face-check only (like every task) and clipped so a day's task Rings never pass today's maximum
--   (post + ask + vote + watch + bonus = 12): kr8_task_cap_left.
--   New functions only; kr8_tasks_today / kr8_task_claim / kr8_task_done are NOT changed (the live app counts their rows).
--   No push, no LINE, no email.
-- Rollback: m219_welcome_b5_UNDO.sql
begin;

create table if not exists public.kr8_task_welcome_picks (
  member_id uuid not null references public.kr8_members(user_id) on delete cascade,
  day date not null,
  post_ids uuid[] not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  primary key (member_id, day)
);
alter table public.kr8_task_welcome_picks enable row level security;
revoke all on public.kr8_task_welcome_picks from public, anon, authenticated;

create table if not exists public.kr8_b5_clips (
  post_id uuid primary key references public.kr8_posts(id) on delete cascade,
  author uuid not null references public.kr8_members(user_id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  unique (author, day)
);
create index if not exists kr8_b5_clips_day on public.kr8_b5_clips (day);
alter table public.kr8_b5_clips enable row level security;
revoke all on public.kr8_b5_clips from public, anon, authenticated;

insert into public.kr8_rings_config (key, value) values ('task_welcome_max', 3), ('task_b5', 1), ('b5_hour', 17), ('b5_hours_open', 2)
  on conflict (key) do nothing;

-- today's task maximum (the same sum kr8_tasks_today shows as "max") minus what the member already has today
create or replace function public.kr8_task_cap_left(p_uid uuid, p_day date)
 returns integer language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select greatest(0, public.kr8_rcfg('task_post', 5) + public.kr8_rcfg('task_ask', 3) + public.kr8_rcfg('task_vote', 1)
                   + public.kr8_rcfg('task_watch', 1) + public.kr8_rcfg('task_bonus', 2)
                   - coalesce((select sum(l.delta)::int from public.kr8_rings_ledger l
                                where l.member_id = p_uid and l.reason = 'task' and l.ref_id like p_day::text || ':%'), 0))
$function$;
revoke execute on function public.kr8_task_cap_left(uuid, date) from public, anon, authenticated;

-- a Reel another member may be shown publicly to p_viewer (shared by the welcome pool and the 5pm row)
create or replace function public.kr8_r10_reel_ok(p_viewer uuid, p_post uuid)
 returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.kr8_posts p join public.kr8_members m on m.user_id = p.author
     where p.id = p_post and p.kind = 'reel' and p.status = 'approved' and not coalesce(p.hidden, false)
       and not coalesce(m.ghost, false) and not public.kr8_is_team(p.author) and not public.kr8_minor_held(p.author)
       and public.kr8_is_test_member(p.author) = public.kr8_is_test_member(p_viewer)
       and (p.author = p_viewer or not exists (select 1 from public.kr8_blocks b
              where (b.blocker = p_viewer and b.blocked = p.author) or (b.blocker = p.author and b.blocked = p_viewer)))
       and not exists (select 1 from public.kr8_post_hidden h where h.user_id = p_viewer and h.post_id = p.id)
       and not exists (select 1 from public.kr8_reports r where r.post_id = p.id and r.handled_at is null))
$function$;
revoke execute on function public.kr8_r10_reel_ok(uuid, uuid) from public, anon, authenticated;

create or replace function public.kr8_r10_reel_json(p_viewer uuid, p_post uuid)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object('id', p.id, 'author_id', p.author, 'name', m.first_name, 'verified', coalesce(m.verified, false),
           'poster_path', p.poster_path, 'video_path', p.video_path, 'body', p.body, 'at', p.created_at,
           'likes', (select count(*)::int from public.kr8_post_likes l where l.post_id = p.id),
           'liked', exists (select 1 from public.kr8_post_likes l where l.post_id = p.id and l.user_id = p_viewer),
           'saved', exists (select 1 from public.kr8_post_saves s where s.post_id = p.id and s.user_id = p_viewer),
           'mine', p.author = p_viewer,
           'place', (select jsonb_build_object('en', pl.name_en, 'th', pl.name_th) from public.kr8_post_places pp
                       join public.kr8_places pl on pl.id = pp.place_id where pp.post_id = p.id order by pp.position limit 1))
    from public.kr8_posts p join public.kr8_members m on m.user_id = p.author where p.id = p_post
$function$;
revoke execute on function public.kr8_r10_reel_json(uuid, uuid) from public, anon, authenticated;

-- 1 ── the welcome pool: fewest likes first, then the oldest (closest to its 48 h end)
create or replace function public.kr8_task_welcome_pool(p_uid uuid, p_n int)
 returns uuid[] language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  -- one Reel per newcomer (their least-liked one), then fewest likes first
  select coalesce(array_agg(y.id order by y.n, y.created_at), '{}'::uuid[]) from (
    select x.id, x.n, x.created_at from (
      select distinct on (p.author) p.id, p.created_at, (select count(*) from public.kr8_post_likes l where l.post_id = p.id) n
        from public.kr8_posts p join public.kr8_members m on m.user_id = p.author
       where p.kind = 'reel' and p.status = 'approved' and not coalesce(p.hidden, false) and not coalesce(p.feed_off, false)
         and p.created_at > now() - interval '48 hours' and m.created_at > now() - interval '7 days'
         and p.author <> p_uid and not public.kr8_linked(p_uid, p.author)
         and public.kr8_r10_reel_ok(p_uid, p.id)
         and not exists (select 1 from public.kr8_post_likes l where l.post_id = p.id and l.user_id = p_uid)
         and (select count(*) from public.kr8_post_likes l where l.post_id = p.id) < 5
       order by p.author, 3, p.created_at) x
     order by x.n, x.created_at
     limit greatest(1, least(coalesce(p_n, 3), 3))) y
$function$;
revoke execute on function public.kr8_task_welcome_pool(uuid, int) from public, anon, authenticated;

create or replace function public.kr8_b5_open(t timestamptz default now())
 returns boolean language sql stable set search_path to 'public', 'pg_temp'
as $function$
  select extract(hour from t at time zone 'Asia/Bangkok') >= public.kr8_rcfg('b5_hour', 17)
     and extract(hour from t at time zone 'Asia/Bangkok') < public.kr8_rcfg('b5_hour', 17) + public.kr8_rcfg('b5_hours_open', 2)
$function$;

-- the two extra task rows, for the new app only
create or replace function public.kr8_task_extra()
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); d date := public.kr8_bkk_day(); m public.kr8_members; pk public.kr8_task_welcome_picks; ids uuid[];
        vis uuid[]; w jsonb := null; b jsonb; c public.kr8_b5_clips; cs text; left_ int;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into m from public.kr8_members where user_id = uid;
  if m.user_id is null then raise exception 'KR8_NO_CARD'; end if;
  if public.kr8_rcfg('tasks_on', 1) <> 1 then return jsonb_build_object('on', false); end if;
  if not coalesce(m.verified, false) or coalesce(m.ghost, false) then return jsonb_build_object('on', true, 'gated', true); end if;
  left_ := public.kr8_task_cap_left(uid, d);
  -- 1: picked once a day; an empty pool is tried again on the next open
  select * into pk from public.kr8_task_welcome_picks where member_id = uid and day = d;
  if pk.member_id is null then
    ids := public.kr8_task_welcome_pool(uid, public.kr8_rcfg('task_welcome_max', 3));
    if cardinality(ids) > 0 then
      insert into public.kr8_task_welcome_picks (member_id, day, post_ids) values (uid, d, ids) on conflict do nothing;
      select * into pk from public.kr8_task_welcome_picks where member_id = uid and day = d;
    end if;
  end if;
  if pk.member_id is not null then
    select coalesce(array_agg(x order by o), '{}'::uuid[]) into vis from unnest(pk.post_ids) with ordinality u(x, o)
     where public.kr8_r10_reel_ok(uid, x);
    if cardinality(vis) > 0 or pk.claimed_at is not null then
      w := jsonb_build_object('id', 'welcome', 'goal', cardinality(vis),
        'rings', least(cardinality(vis), public.kr8_rcfg('task_welcome_max', 3)),
        'liked', (select count(*) from unnest(vis) x where exists (select 1 from public.kr8_post_likes l where l.post_id = x and l.user_id = uid)),
        'done', cardinality(vis) > 0 and not exists (select 1 from unnest(vis) x where not exists (select 1 from public.kr8_post_likes l where l.post_id = x and l.user_id = uid)),
        'claimed', pk.claimed_at is not null,
        'reels', coalesce((select jsonb_agg(public.kr8_r10_reel_json(uid, x) order by o) from unnest(vis) with ordinality u(x, o)), '[]'::jsonb));
    end if;
  end if;
  -- 5
  select * into c from public.kr8_b5_clips where author = uid and day = d;
  select case when p.id is null then null when p.hidden or p.status = 'hidden' then 'hidden' else p.status end into cs
    from public.kr8_posts p where p.id = c.post_id;
  b := jsonb_build_object('id', 'b5', 'rings', public.kr8_rcfg('task_b5', 1), 'open', public.kr8_b5_open(),
    'opens_at', ((d::timestamp + make_interval(hours => public.kr8_rcfg('b5_hour', 17))) at time zone 'Asia/Bangkok'),
    'closes_at', ((d::timestamp + make_interval(hours => public.kr8_rcfg('b5_hour', 17) + public.kr8_rcfg('b5_hours_open', 2))) at time zone 'Asia/Bangkok'),
    'clip', c.post_id, 'status', cs, 'done', cs = 'approved', 'claimed', c.claimed_at is not null);
  return jsonb_build_object('on', true, 'gated', false, 'day', d, 'cap_left', left_, 'welcome', w, 'b5', b);
end $function$;
revoke execute on function public.kr8_task_extra() from public, anon;
grant execute on function public.kr8_task_extra() to authenticated;

create or replace function public.kr8_task_extra_claim(p_task text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); d date := public.kr8_bkk_day(); x jsonb; n int;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if public.kr8_rcfg('tasks_on', 1) <> 1 then raise exception 'KR8_TASKS_OFF'; end if;
  if p_task not in ('welcome', 'b5') then raise exception 'KR8_TASK_BAD'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid and coalesce(verified, false) and not coalesce(ghost, false)) then
    raise exception 'KR8_TASK_FACE';
  end if;
  perform pg_advisory_xact_lock(hashtext('kr8_task_extra:' || uid::text));
  x := public.kr8_task_extra();
  if p_task = 'welcome' then
    if x->'welcome' is null or jsonb_typeof(x->'welcome') = 'null' or not (x->'welcome'->>'done')::boolean then raise exception 'KR8_TASK_NOT_DONE'; end if;
    if (x->'welcome'->>'claimed')::boolean then return x; end if;
    n := least((x->'welcome'->>'rings')::int, public.kr8_task_cap_left(uid, d));
    if n > 0 then
      insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (uid, n, 'task', d::text || ':welcome')
        on conflict (member_id, reason, ref_id) do nothing;
    end if;
    update public.kr8_task_welcome_picks set claimed_at = now() where member_id = uid and day = d and claimed_at is null;
  else
    if not coalesce((x->'b5'->>'done')::boolean, false) then raise exception 'KR8_TASK_NOT_DONE'; end if;
    if (x->'b5'->>'claimed')::boolean then return x; end if;
    n := least(public.kr8_rcfg('task_b5', 1), public.kr8_task_cap_left(uid, d));
    if n > 0 then
      insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (uid, n, 'task', d::text || ':b5')
        on conflict (member_id, reason, ref_id) do nothing;
    end if;
    update public.kr8_b5_clips set claimed_at = now() where author = uid and day = d and claimed_at is null;
  end if;
  return public.kr8_task_extra();
end $function$;
revoke execute on function public.kr8_task_extra_claim(text) from public, anon;
grant execute on function public.kr8_task_extra_claim(text) to authenticated;

-- 5 ── mark the Reel just posted as today's 5pm clip (inside the window, own fresh Reel, one per day)
create or replace function public.kr8_b5_mark(p_post uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); p public.kr8_posts; d date := public.kr8_bkk_day();
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into p from public.kr8_posts where id = p_post;
  if p.id is null or p.author is distinct from uid or p.kind <> 'reel' then raise exception 'KR8_NOT_FOUND'; end if;
  if p.created_at < now() - interval '30 minutes' then raise exception 'KR8_B5_LATE'; end if;
  -- the camera may have opened inside the window and the upload finished a little after it
  if not (public.kr8_b5_open(now()) or public.kr8_b5_open(now() - interval '20 minutes')) then raise exception 'KR8_B5_CLOSED'; end if;
  insert into public.kr8_b5_clips (post_id, author, day) values (p.id, uid, d) on conflict do nothing;
  if not found then raise exception 'KR8_B5_DONE'; end if;
  return jsonb_build_object('post_id', p.id, 'day', d);
end $function$;
revoke execute on function public.kr8_b5_mark(uuid) from public, anon;
grant execute on function public.kr8_b5_mark(uuid) to authenticated;

-- the row: approved 5pm clips of the last 24 h (only approved ones, so nothing unreviewed is ever shown)
create or replace function public.kr8_b5_row()
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); d date := public.kr8_bkk_day(); items jsonb;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select coalesce(jsonb_agg(public.kr8_r10_reel_json(uid, c.post_id) || jsonb_build_object('day', c.day) order by (c.author = uid) desc, c.created_at desc), '[]'::jsonb)
    into items
    from (select c.* from public.kr8_b5_clips c join public.kr8_posts p on p.id = c.post_id
           where p.created_at > now() - interval '24 hours' and public.kr8_r10_reel_ok(uid, c.post_id)
           order by c.created_at desc limit 30) c;
  return jsonb_build_object('day', d, 'open', public.kr8_b5_open(),
    'n_today', (select count(*) from jsonb_array_elements(items) i where (i->>'day')::date = d),
    'n', jsonb_array_length(items), 'items', items);
end $function$;
revoke execute on function public.kr8_b5_row() from public, anon;
grant execute on function public.kr8_b5_row() to authenticated;

-- admin: which of these Reels are 5pm clips (the queue label)
create or replace function public.kr8_admin_b5_ids(p_ids uuid[])
 returns uuid[] language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return coalesce((select array_agg(post_id) from public.kr8_b5_clips where post_id = any (coalesce(p_ids, '{}'))), '{}');
end $function$;
revoke execute on function public.kr8_admin_b5_ids(uuid[]) from public, anon;
grant execute on function public.kr8_admin_b5_ids(uuid[]) to authenticated;

commit;
