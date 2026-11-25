-- m224 (26 Nov 2026) Retention 10, feature 10: Newcomers league + "Rising Local" tag.
--   kr8_newcomers_board(): the weekly board (kr8_week_board_fast: the 1-minute cache, same Rings and rules — face-verified only,
--   no ghosts / minors / bans) filtered to members whose card was made this week (Monday 00:00 → Sunday 23:59 Bangkok,
--   kr8_week_start). Rank among them + "N Rings to #k". No new load: it reads the existing cache.
--   kr8_newcomers_close(): after a week closes, the top 3 newcomers of that week with at least 1 Ring get the 'rising_local'
--   badge (kr8_member_badges; last week's removed first) for the next week; kept in kr8_newcomer_results. No cash, no prize rows.
--   Job: Monday 00:07 Bangkok (Sun 17:07 UTC), after kr8_close_week (00:01).
-- Rollback: m224_newcomers_league_UNDO.sql
begin;

create table if not exists public.kr8_newcomer_results (
  week date not null, is_test boolean not null, rank int not null, member_id uuid not null references public.kr8_members(user_id) on delete cascade,
  rings int not null, created_at timestamptz not null default now(),
  primary key (week, is_test, rank)
);
alter table public.kr8_newcomer_results enable row level security;
revoke all on public.kr8_newcomer_results from public, anon, authenticated;

create or replace function public.kr8_newcomers_board(p_limit int default 10)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); t boolean; w0 timestamptz := public.kr8_week_start(now()); rows_ jsonb; me jsonb; mine_new boolean;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  t := public.kr8_is_test_member(uid);
  mine_new := exists (select 1 from public.kr8_members where user_id = uid and created_at >= w0);
  with b as (select x.member_id, x.rings, x.rk from public.kr8_week_board_fast(w0, t) x),
  n as (select b.member_id, b.rings, (row_number() over (order by b.rk))::int nr, m.first_name, nullif(m.photo, '') photo
          from b join public.kr8_members m on m.user_id = b.member_id
         where m.created_at >= w0 and not public.kr8_is_team(m.user_id)
           and (m.user_id = uid or not exists (select 1 from public.kr8_blocks k where (k.blocker = uid and k.blocked = m.user_id) or (k.blocker = m.user_id and k.blocked = uid))))
  select coalesce((select jsonb_agg(jsonb_build_object('rank', nr, 'user_id', member_id, 'first_name', first_name, 'photo', photo, 'rings', rings, 'me', member_id = uid) order by nr)
                     from n where nr <= least(greatest(coalesce(p_limit, 10), 3), 20)), '[]'::jsonb),
         (select jsonb_build_object('rank', a.nr, 'rings', a.rings,
                   'next', (select jsonb_build_object('rank', u.nr, 'need', u.rings - a.rings + 1) from n u where u.nr = a.nr - 1))
            from n a where a.member_id = uid)
    into rows_, me;
  return jsonb_build_object('week_start', w0, 'ends_at', w0 + interval '7 days', 'mine_new', mine_new, 'top', 3, 'rows', rows_, 'me', me);
end $function$;
revoke execute on function public.kr8_newcomers_board(int) from public, anon;
grant execute on function public.kr8_newcomers_board(int) to authenticated;

create or replace function public.kr8_newcomers_close(p_test boolean default false)
 returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare w0 timestamptz := public.kr8_week_start(now()) - interval '7 days'; wk date; n int;
begin
  wk := (w0 at time zone 'Asia/Bangkok')::date;
  perform pg_advisory_xact_lock(hashtext('kr8_newcomers_close:' || wk::text || p_test::text));
  if not exists (select 1 from public.kr8_newcomer_results where week = wk and is_test = p_test) then
    insert into public.kr8_newcomer_results (week, is_test, rank, member_id, rings)
    select wk, p_test, x.nr, x.member_id, x.rings from (
      select b.member_id, b.rings, (row_number() over (order by b.rk))::int nr
        from public.kr8_week_board(w0, p_test) b join public.kr8_members m on m.user_id = b.member_id
       where m.created_at >= w0 and m.created_at < w0 + interval '7 days' and b.rings >= 1 and not public.kr8_is_team(m.user_id)) x
     where x.nr <= 3;
  end if;
  -- the tag is for the week after: last week's holders lose it first
  delete from public.kr8_member_badges b where b.badge = 'rising_local' and public.kr8_is_test_member(b.user_id) = p_test;
  insert into public.kr8_member_badges (user_id, badge)
    select r.member_id, 'rising_local' from public.kr8_newcomer_results r where r.week = wk and r.is_test = p_test
  on conflict do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('week', wk, 'test', p_test, 'tagged', n);
end $function$;
revoke execute on function public.kr8_newcomers_close(boolean) from public, anon, authenticated;

select public.kr8_schedule_job('kr8_newcomers_close', '7 17 * * 0', 'select public.kr8_newcomers_close(false); select public.kr8_newcomers_close(true);');

commit;
