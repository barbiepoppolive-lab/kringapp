-- 0113_kr8_admin_growth.sql  (18 Nov 2026) · the admin "Growth" screen, now the page admin opens on.
-- (0112 is left for the age 18+ change that is being made at the same time on another branch.)
--
-- ADDITIVE and READ-ONLY: one new admin-only function. No table, view, trigger, policy or existing function is touched.
--
--   public.kr8_admin_growth(p_days int default 7) → jsonb for ONE period: 1 = today (Bangkok day), 7 = last 7 days, 30 = last 30 days.
--
-- Visitors come from public.link_visits (the site/app counter: one row per phone per Bangkok day per ?ref=, phone id = session_id).
--   · Visitor  = one distinct session_id (an anonymous phone id kept in the browser). Visits = rows.
--   · Returning visitor = a visitor of this period who was also seen on an EARLIER Bangkok day (any time before), so it works for Today too.
--   · Noise left out (every row of such a phone in the period): robots / headless browsers, zztest% phones (automated tests),
--     referrer localhost* / 127.0.0.1 / *.pages.dev previews / bartest*, internal refs test* / perf / demo / zz*.
--     Admin and "View as member" never write a row (the counter skips ?admin=1 / ?mirror=1 / kr8_admin_view).
--   · ref 'pwa-install' is an install event, not a landing: it is not a visit and is returned separately as app_installs.
-- Sources: the referrer host of the visitor's FIRST visit in the period (+ its ?ref= when the referrer is empty), returned raw as
--   {host, ref, visitors}; the app groups them into Direct / LINE / Google / Facebook / Instagram / TikTok / Kring site / Other
--   (src/venue/growthLogic.ts sourceOf, unit-tested).
-- Members: same "real" rule as the rest of admin v2 (kr8_admin_v2_kind: not test, not Kring Team, not ghost) and not a mirror account.
--   · New sign-ins = auth.users created in the period whose kind is real or nocard (admins, test, team, ghost left out).
--   · New cards    = real member cards created in the period.
--   · First Reels  = real members whose FIRST Reel (kr8_posts kind 'reel', any status) was posted in the period.
--   · Funnel (one group of people): new sign-ins of the period → of them, made a card → of them, posted a Reel.
-- Recruiter links: every non-internal ?ref= code that is not a channel word (ig, tiktok, line …). Visitors = phones that came with it
--   in the period. Joined = real members who joined in the period with that code (kr8_members.ref_code, else a manual credit in
--   kr8_ref_credits, 0063). Posted a Reel = of those, how many posted a Reel. A sign-in without a card cannot carry a code (the code is
--   saved on the card), so there is no per-link sign-in count. Member invite codes (k00184) come back with that member's number and name.
--
-- UNDO: supabase/undo/0113_kr8_admin_growth_UNDO.sql  (drop function if exists public.kr8_admin_growth(int);)

begin;

create or replace function public.kr8_admin_growth(p_days int default 7)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  n_days int := case when p_days <= 1 then 1 when p_days <= 7 then 7 else 30 end;
  today date := (now() at time zone 'Asia/Bangkok')::date;
  d_from date;
  t_from timestamptz;
  t_prev timestamptz;
  r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  d_from := today - (n_days - 1);
  t_from := d_from::timestamp at time zone 'Asia/Bangkok';
  t_prev := (d_from - n_days)::timestamp at time zone 'Asia/Bangkok';

  with raw as materialized (
    select v.session_id as sid, v.created_at as at, (v.created_at at time zone 'Asia/Bangkok')::date as day,
           nullif(lower(btrim(coalesce(v.ref, ''))), '') as ref,
           nullif(regexp_replace(regexp_replace(lower(btrim(coalesce(v.referrer, ''))), '^[a-z-]+://', ''), '[/:].*$', ''), '') as host,
           nullif(upper(btrim(coalesce(v.country, ''))), '') as country,
           coalesce(v.user_agent, '') as ua
    from public.link_visits v
    where v.created_at >= t_prev and v.session_id is not null
  ),
  noisy as (   -- a phone with ANY noise row in the window is left out completely
    select distinct sid from raw
    where sid like 'zztest%'
       or ua ~* '(bot|crawl|spider|headless|playwright|puppeteer|lighthouse|preview|python|curl|wget)'
       or host ~ '^(localhost|127\.0\.0\.1|0\.0\.0\.0)' or host ~ '\.pages\.dev$' or host ~ '^bartest'
       or ref ~ '^(test|zz)' or ref in ('perf', 'demo')
  ),
  clean as materialized (select raw.* from raw where not exists (select 1 from noisy n where n.sid = raw.sid)),
  vis as materialized (select * from clean where at >= t_from and coalesce(ref, '') <> 'pwa-install'),
  -- the period before, cut at the same point (Today 2 pm is compared with yesterday up to 2 pm)
  prev as (select count(distinct sid)::int as n from clean where at < t_prev + (now() - t_from) and at < t_from and coalesce(ref, '') <> 'pwa-install'),
  per_sid as (
    select sid, count(*)::int as visits, max(day) as last_day from vis group by sid
  ),
  returning_sids as (   -- seen on an earlier Bangkok day than their latest visit in the period (looks back over all history)
    select p.sid from per_sid p
    join (select o.session_id, min((o.created_at at time zone 'Asia/Bangkok')::date) as first_day
          from public.link_visits o
          where o.session_id in (select sid from per_sid) and coalesce(o.ref, '') <> 'pwa-install'
          group by o.session_id) f on f.session_id = p.sid
    where f.first_day < p.last_day
  ),
  first_visit as (
    select distinct on (sid) sid, host, ref from vis order by sid, at
  ),
  last_country as (
    select distinct on (sid) sid, country from vis order by sid, (country is null), at desc
  ),
  -- people
  acc as materialized (
    select u.id as uid, u.created_at as at, public.kr8_admin_v2_kind(u.id) as kind
    from auth.users u where u.created_at >= t_from
  ),
  signins as (
    select a.uid from acc a where a.kind in ('real', 'nocard') and not coalesce(public.kr8_is_mirror(a.uid), false)
  ),
  real_m as materialized (
    select m.user_id as uid, m.member_no, m.first_name, m.created_at as at,
           coalesce(nullif(lower(btrim(m.ref_code)), ''), (select lower(c.ref_code) from public.kr8_ref_credits c where c.user_id = m.user_id)) as code
    from public.kr8_members m
    where public.kr8_admin_v2_kind(m.user_id) = 'real' and not coalesce(public.kr8_is_mirror(m.user_id), false)
  ),
  first_reel as materialized (
    select p.author as uid, min(p.created_at) as at from public.kr8_posts p where p.kind = 'reel' group by p.author
  ),
  cards as (select * from real_m where at >= t_from),
  -- recruiter links
  ref_vis as (
    select ref, count(distinct sid)::int as visitors from vis
    where ref is not null and ref !~ '^(ig|insta|instagram|tt|tiktok|x|twitter|yt|youtube|fb|facebook|line|google|reddit|chatgpt|ai|direct|\(none\))$'
    group by ref
  ),
  ref_join as (
    select c.code as ref, count(*)::int as joined, count(f.uid)::int as reels
    from cards c left join first_reel f on f.uid = c.uid
    where c.code is not null and c.code !~ '^(test|zz)' and c.code not in ('perf', 'demo', 'pwa-install')
      and c.code !~ '^(ig|insta|instagram|tt|tiktok|x|twitter|yt|youtube|fb|facebook|line|google|reddit|chatgpt|ai|direct|\(none\))$'
    group by c.code
  ),
  refs as (
    select coalesce(a.ref, b.ref) as ref, coalesce(a.visitors, 0) as visitors, coalesce(b.joined, 0) as joined, coalesce(b.reels, 0) as reels
    from ref_vis a full join ref_join b on a.ref = b.ref
  ),
  days as (
    select g::date as day from generate_series(d_from, today, interval '1 day') g
  )
  select jsonb_build_object(
    'days', n_days,
    'from', d_from,
    'to', today,
    'now', now(),
    'visitors', (select count(*)::int from per_sid),
    'visitors_prev', (select n from prev),
    'visits', (select coalesce(sum(visits), 0)::int from per_sid),
    'returning', (select count(*)::int from returning_sids),
    'signins', (select count(*)::int from signins),
    'cards', (select count(*)::int from cards),
    'first_reels', (select count(*)::int from first_reel f join real_m m on m.uid = f.uid where f.at >= t_from),
    'app_installs', (select count(distinct sid)::int from clean where at >= t_from and ref = 'pwa-install'),
    'share_opens', case when to_regclass('public.kr8_share_opens') is null then null
                        else (select count(*)::int from public.kr8_share_opens o where o.ok and o.bkk_date >= d_from) end,
    'funnel', jsonb_build_object(
      'signed_in', (select count(*)::int from signins),
      'card', (select count(*)::int from signins s join real_m m on m.uid = s.uid),
      'reel', (select count(*)::int from signins s join real_m m on m.uid = s.uid join first_reel f on f.uid = s.uid)),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('host', x.host, 'ref', x.ref, 'visitors', x.n) order by x.n desc, x.host nulls first)
        from (select host, case when host is null then ref end as ref, count(*)::int as n
              from first_visit group by 1, 2) x), '[]'::jsonb),
    'refs', coalesce((select jsonb_agg(jsonb_build_object('ref', rf.ref, 'visitors', rf.visitors, 'joined', rf.joined, 'reels', rf.reels,
          'member_no', mb.member_no, 'member_name', mb.first_name)
        order by rf.joined desc, rf.visitors desc, rf.ref)
        from refs rf
        left join public.kr8_members mb on mb.member_no = (case when rf.ref ~ '^k0*[0-9]{1,7}$' then nullif(regexp_replace(rf.ref, '^k0*', ''), '')::int end)), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(jsonb_build_object('country', c.country, 'visitors', c.n) order by c.n desc, c.country nulls last)
        from (select country, count(*)::int as n from last_country group by country order by 2 desc, 1 nulls last limit 8) c), '[]'::jsonb),
    'series', case when n_days = 1 then
        (select jsonb_agg(jsonb_build_object('t', h, 'visitors',
            (select count(distinct sid)::int from vis where extract(hour from at at time zone 'Asia/Bangkok')::int = h)) order by h)
         from generate_series(0, extract(hour from now() at time zone 'Asia/Bangkok')::int) h)   -- up to this hour (no fake drop to 0)
      else
        (select jsonb_agg(jsonb_build_object('t', d.day, 'visitors', (select count(distinct sid)::int from vis where vis.day = d.day)) order by d.day)
         from days d) end
  ) into r;
  return r;
end $$;

revoke all on function public.kr8_admin_growth(int) from public, anon;
grant execute on function public.kr8_admin_growth(int) to authenticated;

commit;
