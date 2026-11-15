-- 0052 · "Site visits" on the admin To-do screen (15 Nov 2026).
--
-- ADDITIVE: one new admin-only function. No table, view, trigger, policy or existing function is touched.
-- Reads public.link_visits (one row per tab session per ?ref=) and public.kr8_members (counts only, no names).
--
-- What counts as a visitor: one distinct session_id, Bangkok day, with these left out:
--   · robots and tools: user_agent matching bot|crawl|spider|headless|playwright|lighthouse|preview|python|curl
--   · our own automated tests: session ids starting with 'zztest' (the visit counter on the site and in /app/
--     writes that prefix when the browser is driven by automation, i.e. navigator.webdriver is true;
--     the table only allows a-z0-9 in session_id, so the marker is letters only)
--   · rows with no session id
-- United States is shown on its own, because most of it is our own cloud testing (normal-looking phones on US servers).
--
-- UNDO: drop function if exists public.kr8_admin_site_visits();

create or replace function public.kr8_admin_site_visits()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  today date := (now() at time zone 'Asia/Bangkok')::date;
  r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  with v as (
    select (created_at at time zone 'Asia/Bangkok')::date as day,
           session_id,
           coalesce(nullif(ref, ''), 'direct') as src,
           case when upper(country) = 'TH' then 'th' when upper(country) = 'US' then 'us' else 'other' end as zone
    from public.link_visits
    where created_at >= ((today - 6)::timestamp at time zone 'Asia/Bangkok')
      and session_id is not null
      and session_id not like 'zztest%'
      and coalesce(user_agent, '') !~* '(bot|crawl|spider|headless|playwright|lighthouse|preview|python|curl)'
  ),
  -- one row per visitor per day (a visitor that came through two links in a day is still one visitor)
  s as (
    select day, session_id, min(zone) as zone, min(src) as src from v group by day, session_id
  ),
  days as (select generate_series(today - 6, today, interval '1 day')::date as day),
  per_day as (
    select d.day,
           count(s.session_id)::int as visitors,
           count(s.session_id) filter (where s.zone = 'th')::int as th,
           count(s.session_id) filter (where s.zone = 'other')::int as other,
           count(s.session_id) filter (where s.zone = 'us')::int as us
    from days d left join s on s.day = d.day group by d.day
  ),
  signups as (
    select (created_at at time zone 'Asia/Bangkok')::date as day, count(*)::int as n
    from public.kr8_members
    where created_at >= ((today - 6)::timestamp at time zone 'Asia/Bangkok') and not public.kr8_is_test_member(user_id)
    group by 1
  ),
  src_today as (
    select src, count(*)::int as visitors from s where day = today and zone <> 'us' group by src order by 2 desc, 1 limit 3
  ),
  src_week as (
    select src, count(*)::int as visitors from s where zone <> 'us' group by src order by 2 desc, 1 limit 3
  )
  select jsonb_build_object(
    'today', (select jsonb_build_object('visitors', p.visitors, 'th', p.th, 'other', p.other, 'us', p.us,
                'signups', coalesce((select n from signups where day = today), 0)) from per_day p where p.day = today),
    'week', (select jsonb_build_object('visitors', coalesce(sum(visitors), 0)::int, 'th', coalesce(sum(th), 0)::int,
                'other', coalesce(sum(other), 0)::int, 'us', coalesce(sum(us), 0)::int,
                'signups', coalesce((select sum(n) from signups), 0)::int) from per_day),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', p.day, 'visitors', p.visitors, 'th', p.th, 'other', p.other, 'us', p.us,
                'signups', coalesce(g.n, 0)) order by p.day desc), '[]'::jsonb)
             from per_day p left join signups g on g.day = p.day),
    'sources_today', (select coalesce(jsonb_agg(jsonb_build_object('ref', src, 'visitors', visitors) order by visitors desc, src), '[]'::jsonb) from src_today),
    'sources_week', (select coalesce(jsonb_agg(jsonb_build_object('ref', src, 'visitors', visitors) order by visitors desc, src), '[]'::jsonb) from src_week)
  ) into r;
  return r;
end $$;

revoke all on function public.kr8_admin_site_visits() from public, anon;
grant execute on function public.kr8_admin_site_visits() to authenticated;
