-- m222 (26 Nov 2026) Retention 10, feature 8: Bestie streak.
--   Two members who follow each other (both face-verified) start a shared streak: invite → accept. A streak day = a Bangkok
--   day on which BOTH claimed at least one daily task (kr8_rings_ledger reason 'task', ref 'YYYY-MM-DD:<task>'). Computed on
--   read, no job. A missed day breaks it (count 0, "start again"). Nudge = one in-app nudge per sender per pair per day.
--   No Rings for the streak. Max 3 active/pending per member. Profiles show it; the partner's name only if neither member keeps
--   their lists private.
-- New tables + functions only. Rollback: m222_bestie_streak_UNDO.sql
begin;

create table if not exists public.kr8_besties (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references public.kr8_members(user_id) on delete cascade,
  b uuid not null references public.kr8_members(user_id) on delete cascade,
  inviter uuid not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'ended')),
  created_at timestamptz not null default now(),
  started_on date,
  ended_at timestamptz,
  check (a < b)
);
create unique index if not exists kr8_besties_live on public.kr8_besties (a, b) where status in ('pending', 'active');
create index if not exists kr8_besties_b on public.kr8_besties (b);
alter table public.kr8_besties enable row level security;
revoke all on public.kr8_besties from public, anon, authenticated;

create table if not exists public.kr8_bestie_nudges (
  bestie_id uuid not null references public.kr8_besties(id) on delete cascade,
  sender uuid not null,
  day date not null,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (bestie_id, sender, day)
);
alter table public.kr8_bestie_nudges enable row level security;
revoke all on public.kr8_bestie_nudges from public, anon, authenticated;

-- the days on which this member claimed at least one task
create or replace function public.kr8_task_days_of(p_uid uuid, p_from date)
 returns setof date language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select distinct split_part(l.ref_id, ':', 1)::date from public.kr8_rings_ledger l
   where l.member_id = p_uid and l.reason = 'task' and l.ref_id ~ '^\d{4}-\d{2}-\d{2}:' and split_part(l.ref_id, ':', 1)::date >= p_from
$function$;
revoke execute on function public.kr8_task_days_of(uuid, date) from public, anon, authenticated;

-- count = consecutive both-days ending today (or yesterday while today is still open); alive = nothing missed yet
create or replace function public.kr8_bestie_count(p_a uuid, p_b uuid, p_since date)
 returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  with d0 as (select public.kr8_bkk_day() today),
  both_ as (select x from public.kr8_task_days_of(p_a, p_since) x intersect select y from public.kr8_task_days_of(p_b, p_since) y),
  anc as (select case when exists (select 1 from both_, d0 where x = d0.today) then d0.today
                      when exists (select 1 from both_, d0 where x = d0.today - 1) then d0.today - 1 end anchor from d0),
  run as (select count(*)::int n from (select x, row_number() over (order by x desc) rn from both_, anc where x <= anc.anchor) z, anc
           where anc.anchor - z.x = z.rn - 1)
  select jsonb_build_object('count', case when anc.anchor is null then 0 else run.n end,
    'alive', anc.anchor is not null or p_since >= d0.today - 1,
    'me_today', exists (select 1 from public.kr8_task_days_of(p_a, d0.today) q where q = d0.today),
    'them_today', exists (select 1 from public.kr8_task_days_of(p_b, d0.today) q where q = d0.today))
  from anc, run, d0
$function$;
revoke execute on function public.kr8_bestie_count(uuid, uuid, date) from public, anon, authenticated;

create or replace function public.kr8_bestie_pair_ok(x uuid, y uuid)
 returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select x is not null and y is not null and x <> y
     and exists (select 1 from public.kr8_members m where m.user_id = x and coalesce(m.verified, false) and not coalesce(m.ghost, false))
     and exists (select 1 from public.kr8_members m where m.user_id = y and coalesce(m.verified, false) and not coalesce(m.ghost, false))
     and not public.kr8_is_team(x) and not public.kr8_is_team(y) and not public.kr8_minor_held(x) and not public.kr8_minor_held(y)
     and public.kr8_is_test_member(x) = public.kr8_is_test_member(y)
     and exists (select 1 from public.kr8_follows f where f.follower = x and f.followee = y)
     and exists (select 1 from public.kr8_follows f where f.follower = y and f.followee = x)
     and not exists (select 1 from public.kr8_blocks b where (b.blocker = x and b.blocked = y) or (b.blocker = y and b.blocked = x))
     and not public.kr8_linked(x, y)
$function$;
revoke execute on function public.kr8_bestie_pair_ok(uuid, uuid) from public, anon, authenticated;

create or replace function public.kr8_bestie_invite(p_user uuid)
 returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); id_ uuid;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not public.kr8_bestie_pair_ok(uid, p_user) then raise exception 'KR8_BESTIE_NEEDS_MUTUAL'; end if;
  perform pg_advisory_xact_lock(hashtext('kr8_bestie:' || least(uid, p_user)::text || greatest(uid, p_user)::text));
  if exists (select 1 from public.kr8_besties where a = least(uid, p_user) and b = greatest(uid, p_user) and status in ('pending', 'active')) then
    raise exception 'KR8_BESTIE_EXISTS';
  end if;
  if (select count(*) from public.kr8_besties where uid in (a, b) and status in ('pending', 'active')) >= 3
     or (select count(*) from public.kr8_besties where p_user in (a, b) and status in ('pending', 'active')) >= 3 then
    raise exception 'KR8_BESTIE_FULL';
  end if;
  insert into public.kr8_besties (a, b, inviter) values (least(uid, p_user), greatest(uid, p_user), uid) returning id into id_;
  return id_;
end $function$;
revoke execute on function public.kr8_bestie_invite(uuid) from public, anon;
grant execute on function public.kr8_bestie_invite(uuid) to authenticated;

-- p_action: 'accept' | 'decline' (invitee) · 'end' (either) · 'restart' (either, a broken active streak starts again today)
create or replace function public.kr8_bestie_act(p_id uuid, p_action text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); s public.kr8_besties;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into s from public.kr8_besties where id = p_id and uid in (a, b) for update;
  if s.id is null then raise exception 'KR8_NOT_FOUND'; end if;
  if p_action = 'accept' then
    if s.status <> 'pending' or s.inviter = uid then raise exception 'KR8_BESTIE_BAD'; end if;
    if not public.kr8_bestie_pair_ok(s.a, s.b) then raise exception 'KR8_BESTIE_NEEDS_MUTUAL'; end if;
    update public.kr8_besties set status = 'active', started_on = public.kr8_bkk_day() where id = p_id;
  elsif p_action in ('decline', 'end') then
    if s.status = 'ended' then return public.kr8_bestie_state(); end if;
    update public.kr8_besties set status = 'ended', ended_at = now() where id = p_id;
  elsif p_action = 'restart' then
    if s.status <> 'active' then raise exception 'KR8_BESTIE_BAD'; end if;
    update public.kr8_besties set started_on = public.kr8_bkk_day() where id = p_id;
  else raise exception 'KR8_BESTIE_BAD'; end if;
  return public.kr8_bestie_state();
end $function$;
revoke execute on function public.kr8_bestie_act(uuid, text) from public, anon;
grant execute on function public.kr8_bestie_act(uuid, text) to authenticated;

create or replace function public.kr8_bestie_nudge(p_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_besties where id = p_id and uid in (a, b) and status = 'active') then raise exception 'KR8_NOT_FOUND'; end if;
  insert into public.kr8_bestie_nudges (bestie_id, sender, day) values (p_id, uid, public.kr8_bkk_day()) on conflict do nothing;
  return public.kr8_bestie_state();
end $function$;
revoke execute on function public.kr8_bestie_nudge(uuid) from public, anon;
grant execute on function public.kr8_bestie_nudge(uuid) to authenticated;

create or replace function public.kr8_bestie_seen()
 returns void language sql security definer set search_path to 'public', 'pg_temp'
as $function$
  update public.kr8_bestie_nudges n set seen_at = now()
    from public.kr8_besties s
   where n.bestie_id = s.id and auth.uid() in (s.a, s.b) and n.sender <> auth.uid() and n.seen_at is null
$function$;
revoke execute on function public.kr8_bestie_seen() from public, anon;
grant execute on function public.kr8_bestie_seen() to authenticated;

create or replace function public.kr8_bestie_state()
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); d date := public.kr8_bkk_day();
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  return jsonb_build_object('day', d, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'status', s.status, 'mine_invite', s.inviter = uid,
             'partner', jsonb_build_object('user_id', o.user_id, 'first_name', o.first_name, 'photo', nullif(o.photo, '')),
             'started_on', s.started_on,
             'streak', case when s.status = 'active' then public.kr8_bestie_count(uid, o.user_id, s.started_on) end,
             'nudged_me', exists (select 1 from public.kr8_bestie_nudges n where n.bestie_id = s.id and n.sender <> uid and n.day = d),
             'nudge_new', exists (select 1 from public.kr8_bestie_nudges n where n.bestie_id = s.id and n.sender <> uid and n.day = d and n.seen_at is null),
             'i_nudged', exists (select 1 from public.kr8_bestie_nudges n where n.bestie_id = s.id and n.sender = uid and n.day = d))
           order by (s.status = 'active') desc, s.created_at)
      from public.kr8_besties s join public.kr8_members o on o.user_id = case when s.a = uid then s.b else s.a end
     where uid in (s.a, s.b) and s.status in ('pending', 'active')
       and not exists (select 1 from public.kr8_blocks b where (b.blocker = uid and b.blocked = o.user_id) or (b.blocker = o.user_id and b.blocked = uid))
       and not coalesce(o.ghost, false)), '[]'::jsonb));
end $function$;
revoke execute on function public.kr8_bestie_state() from public, anon;
grant execute on function public.kr8_bestie_state() to authenticated;

-- the profile line: active streaks with a count; the partner's name only if neither keeps their lists private
create or replace function public.kr8_bestie_of(p_user uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); m public.kr8_members;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into m from public.kr8_members where user_id = p_user;
  if m.user_id is null or (p_user <> uid and public.kr8_is_blocked(uid, p_user)) then raise exception 'KR8_NO_PERSON'; end if;
  return coalesce((
    select jsonb_agg(x.j order by (x.j->>'count')::int desc) from (
      select jsonb_build_object('count', (c->>'count')::int,
               'partner', case when not coalesce(m.lists_private, false) and not coalesce(o.lists_private, false)
                                    and (uid in (s.a, s.b) or not public.kr8_is_blocked(uid, o.user_id))
                               then jsonb_build_object('user_id', o.user_id, 'first_name', o.first_name) end) j
        from public.kr8_besties s
        join public.kr8_members o on o.user_id = case when s.a = p_user then s.b else s.a end
        cross join lateral public.kr8_bestie_count(p_user, o.user_id, s.started_on) c
       where p_user in (s.a, s.b) and s.status = 'active' and not coalesce(o.ghost, false)
         and (c->>'count')::int > 0) x), '[]'::jsonb);
end $function$;
revoke execute on function public.kr8_bestie_of(uuid) from public, anon;
grant execute on function public.kr8_bestie_of(uuid) to authenticated;

commit;
