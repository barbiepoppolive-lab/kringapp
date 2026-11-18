-- UNDO for 0114 v2: restores kr8_admin_growth(int) exactly as it was live before 0114 (T-399 fix, applied 18 Nov 16:43 IST)
-- and drops the three 0114 functions.
begin;
drop function if exists public.kr8_admin_growth_daily(date, date);
drop function if exists public.kr8_admin_growth_day(date);
CREATE OR REPLACE FUNCTION public.kr8_admin_growth(p_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  n_days int := case when p_days <= 1 then 1 when p_days <= 7 then 7 else 30 end;
  today date := (now() at time zone 'Asia/Bangkok')::date;
  d_from date;
  d_prev date;
  t_from timestamptz;
  t_prev timestamptz;
  min_day date;
  has_prev boolean;
  r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  d_from := today - (n_days - 1);
  d_prev := d_from - n_days;
  t_from := d_from::timestamp at time zone 'Asia/Bangkok';
  t_prev := d_prev::timestamp at time zone 'Asia/Bangkok';

  select min((v.created_at at time zone 'Asia/Bangkok')::date)
    into min_day
    from public.link_visits v;
  has_prev := min_day is not null and d_prev >= min_day;

  with all_norm as materialized (
    select v.id,
           v.session_id as sid,
           v.created_at as at,
           (v.created_at at time zone 'Asia/Bangkok')::date as day,
           nullif(lower(btrim(coalesce(v.ref, ''))), '') as ref,
           nullif(regexp_replace(regexp_replace(lower(btrim(coalesce(v.referrer, ''))), '^[a-z-]+://', ''), '[/:].*$', ''), '') as raw_host,
           nullif(upper(btrim(coalesce(v.country, ''))), '') as country,
           coalesce(v.user_agent, '') as ua
      from public.link_visits v
     where v.session_id is not null
  ),
  -- Any session_id that EVER exhibited bot, Playwright device-emulation, preview-scanner, test-ref,
  -- US cloud-runner (0052/0056), or IN founder-device traffic is excluded across both window and lookback.
  noisy as materialized (
    select distinct sid
      from all_norm
     where sid like 'zztest%'
        or ua ~* '(bot|crawl|spider|headless|playwright|puppeteer|lighthouse|preview|python|curl|wget|google-safety|googleother|bitdiscovery|censys|zgrab|netfront/3|facebookexternalhit|facebot|meta-externalagent|whatsapp|twitterbot|telegrambot|slackbot|discordbot|line-poker|vkshare|pinterest|go-http-client|axios|undici|node-fetch|153\.0\.8010\.12|149\.0\.7827\.55|moto g power \(2022\))'
        or (ua ~ 'iPhone OS 1[56]_0' and ua ~ 'Version/2[67]\.')
        or (country in ('US', 'IE', 'SE') and ua ~ 'Windows NT 10\.0.*Chrome/139\.0\.0\.0')
        or raw_host ~ '^(localhost|127\.0\.0\.1|0\.0\.0\.0)'
        or raw_host ~ '\.pages\.dev$'
        or raw_host ~ '^bartest'
        or ref ~ '^(test|zz)'
        or ref in ('perf', 'demo')
        or country in ('US', 'IN')
  ),
  clean_all as materialized (
    select a.id, a.sid, a.at, a.day, a.ref,
           -- Strip self-referrals (kringapp.com), Google OAuth bounce, and temp-mail host
           case
             when a.raw_host is null then null
             when a.raw_host ~ '(^|\.)kringapp\.com$' then null
             when a.raw_host in ('accounts.google.com', 'inetmail.cloud') then null
             else a.raw_host
           end as host,
           a.country
      from all_norm a
     where not exists (select 1 from noisy n where n.sid = a.sid)
  ),
  clean as materialized (
    select * from clean_all where at >= t_prev
  ),
  vis as materialized (
    select * from clean where at >= t_from and coalesce(ref, '') <> 'pwa-install'
  ),
  prev as (
    select case when has_prev then
      (select count(distinct sid)::int
         from clean
        where at >= t_prev
          and at < t_prev + (now() - t_from)
          and at < t_from
          and coalesce(ref, '') <> 'pwa-install')
      else null end as n
  ),
  per_sid as (
    select sid,
           count(distinct day)::int as visits,
           count(*)::int as raw_hits,
           max(day) as last_day
      from vis
     group by sid
  ),
  returning_sids as (
    select p.sid
      from per_sid p
      join (
        select c.sid, min(c.day) as first_day
          from clean_all c
         where c.sid in (select sid from per_sid)
           and coalesce(c.ref, '') <> 'pwa-install'
         group by c.sid
      ) f on f.sid = p.sid
     where f.first_day < p.last_day
  ),
  -- Best attribution per visitor in period: prioritize channel ?ref=, then recruiter/member ?ref=, then external host, else Direct
  ranked_visit as (
    select sid, host, ref, at, id,
           case
             when ref is not null and ref not in ('direct', '(none)')
                  and ref ~ '^(ig|insta|instagram|tt|tiktok|x|twitter|yt|youtube|fb|facebook|line|google|reddit|chatgpt|ai)$' then 1
             when ref is not null and ref not in ('direct', '(none)') then 2
             when host is not null then 3
             else 4
           end as prio
      from vis
  ),
  first_visit as (
    select distinct on (sid)
           sid,
           -- Preserve non-empty ?ref= instead of wiping it when host is present; only fall back to host when ref is empty
           case when prio in (1, 2) then null else host end as host,
           case when prio in (1, 2) then ref else null end as ref
      from ranked_visit
     order by sid, prio, at, id
  ),
  last_country as (
    select distinct on (sid) sid, country
      from vis
     order by sid, (country is null), at desc, id desc
  ),
  -- People (confirmed sign-ins only; cardless test/demo emails excluded)
  acc as materialized (
    select u.id as uid,
           u.created_at as at,
           public.kr8_admin_v2_kind(u.id) as kind
      from auth.users u
     where u.created_at >= t_from
       and (u.last_sign_in_at is not null or u.email_confirmed_at is not null)
       and lower(coalesce(u.email, '')) !~ '(test|^demo-.*@kringapp\.com$)'
  ),
  signins as (
    select a.uid
      from acc a
     where a.kind in ('real', 'nocard')
       and not coalesce(public.kr8_is_mirror(a.uid), false)
  ),
  real_m as materialized (
    select m.user_id as uid,
           m.member_no,
           m.first_name,
           m.created_at as at,
           (m.photo is not null and btrim(m.photo) <> '') as has_photo,
           coalesce(
             nullif(lower(btrim(m.ref_code)), ''),
             (select lower(c.ref_code) from public.kr8_ref_credits c where c.user_id = m.user_id)
           ) as code
      from public.kr8_members m
     where public.kr8_admin_v2_kind(m.user_id) = 'real'
       and not coalesce(public.kr8_is_mirror(m.user_id), false)
  ),
  -- Approved, visible video Reels only (matches 0065 kr8_admin_recruiters and 0111 kr8_invite_first_reel)
  first_reel as materialized (
    select p.author as uid, min(p.created_at) as at
      from public.kr8_posts p
     where p.kind = 'reel'
       and p.status = 'approved'
       and not coalesce(p.hidden, false)
       and p.video_path is not null
     group by p.author
  ),
  pending_first_reel as (
    select count(distinct p.author)::int as n
      from public.kr8_posts p
      join real_m m on m.uid = p.author
     where p.kind = 'reel'
       and p.status = 'pending'
       and not coalesce(p.hidden, false)
       and p.created_at >= t_from
       and not exists (select 1 from first_reel f where f.uid = p.author)
  ),
  cards as (
    select * from real_m where at >= t_from
  ),
  -- Recruiter links (clean visitors + period joins + approved Reels + all-time totals)
  ref_vis as (
    select ref, count(distinct sid)::int as visitors
      from vis
     where ref is not null
       and ref !~ '^(ig|insta|instagram|tt|tiktok|x|twitter|yt|youtube|fb|facebook|line|google|reddit|chatgpt|ai|direct|\(none\))$'
     group by ref
  ),
  ref_join as (
    select m.code as ref,
           count(*) filter (where m.at >= t_from)::int as joined,
           count(f.uid) filter (where m.at >= t_from)::int as reels,
           count(f.uid) filter (where f.at >= t_from)::int as reels_in_period,
           count(*)::int as joined_total,
           count(f.uid)::int as reels_total
      from real_m m
      left join first_reel f on f.uid = m.uid
     where m.code is not null
       and m.code !~ '^(test|zz)'
       and m.code not in ('perf', 'demo', 'pwa-install')
       and m.code !~ '^(ig|insta|instagram|tt|tiktok|x|twitter|yt|youtube|fb|facebook|line|google|reddit|chatgpt|ai|direct|\(none\))$'
     group by m.code
  ),
  refs as (
    select coalesce(a.ref, b.ref) as ref,
           coalesce(a.visitors, 0) as visitors,
           coalesce(b.joined, 0) as joined,
           coalesce(b.reels, 0) as reels,
           coalesce(b.reels_in_period, 0) as reels_in_period,
           coalesce(b.joined_total, 0) as joined_total,
           coalesce(b.reels_total, 0) as reels_total
      from ref_vis a
      full join ref_join b on a.ref = b.ref
     where coalesce(a.visitors, 0) > 0 or coalesce(b.joined, 0) > 0 or coalesce(b.reels_in_period, 0) > 0
  ),
  days as (
    select g::date as day from generate_series(d_from, today, interval '1 day') g
  )
  select jsonb_build_object(
    'days', n_days,
    'from', d_from,
    'to', today,
    'now', now(),
    'tracking_since', min_day,
    'has_prev_window', has_prev,
    'visitors', (select count(*)::int from per_sid),
    'visitors_prev', (select n from prev),
    'visits', (select coalesce(sum(visits), 0)::int from per_sid),
    'page_loads', (select coalesce(sum(raw_hits), 0)::int from per_sid),
    'returning', (select count(*)::int from returning_sids),
    'signins', (select count(*)::int from signins),
    'cards', (select count(*)::int from cards),
    'cards_with_photo', (select count(*) filter (where has_photo)::int from cards),
    'first_reels', (select count(*)::int from first_reel f join real_m m on m.uid = f.uid where f.at >= t_from),
    'pending_reels', (select n from pending_first_reel),
    'app_installs', (select count(distinct sid)::int from clean where at >= t_from and ref = 'pwa-install'),
    'excluded_noise', (select count(distinct sid)::int from all_norm a where a.at >= t_from and coalesce(a.ref, '') <> 'pwa-install' and exists (select 1 from noisy n where n.sid = a.sid)),
    'share_opens', case when to_regclass('public.kr8_share_opens') is null then null
                        else (
                          select count(*)::int
                            from public.kr8_share_opens o
                            join public.kr8_posts p on p.id = o.post_id
                            join real_m m on m.uid = p.author
                           where o.ok
                             and o.bkk_date >= d_from
                             and p.kind = 'reel'
                             and p.status = 'approved'
                             and not coalesce(p.hidden, false)
                             and o.opener is distinct from p.author
                             and coalesce(upper(o.country), '') not in ('US', 'IN')
                        ) end,
    'funnel', jsonb_build_object(
      'signed_in', (select count(*)::int from signins),
      'card', (select count(*)::int from signins s join real_m m on m.uid = s.uid),
      'reel', (select count(*)::int from signins s join real_m m on m.uid = s.uid join first_reel f on f.uid = s.uid)
    ),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('host', x.host, 'ref', x.ref, 'visitors', x.n) order by x.n desc, x.host nulls first)
        from (select host, ref, count(*)::int as n from first_visit group by 1, 2) x
    ), '[]'::jsonb),
    'refs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ref', rf.ref,
               'visitors', rf.visitors,
               'joined', rf.joined,
               'reels', rf.reels,
               'reels_in_period', rf.reels_in_period,
               'joined_total', rf.joined_total,
               'reels_total', rf.reels_total,
               'member_no', mb.member_no,
               'member_name', mb.first_name
             ) order by rf.joined desc, rf.visitors desc, rf.ref)
        from refs rf
        left join public.kr8_members mb
          on mb.member_no = (case when rf.ref ~ '^k0*[0-9]{1,7}$' then nullif(regexp_replace(rf.ref, '^k0*', ''), '')::int end)
         and not coalesce(mb.ghost, false)
    ), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object('country', c.country, 'visitors', c.n) order by c.n desc, c.country nulls last)
        from (select country, count(*)::int as n from last_country group by country order by 2 desc, 1 nulls last limit 8) c
    ), '[]'::jsonb),
    'series', case when n_days = 1 then
        (select jsonb_agg(jsonb_build_object('t', h, 'visitors',
            (select count(distinct sid)::int from vis where extract(hour from at at time zone 'Asia/Bangkok')::int = h)) order by h)
         from generate_series(0, extract(hour from now() at time zone 'Asia/Bangkok')::int) h)
      else
        (select jsonb_agg(jsonb_build_object('t', d.day, 'visitors',
            (select count(distinct sid)::int from vis where vis.day = d.day)) order by d.day)
         from days d) end
  ) into r;

  return r;
end $function$;
revoke all on function public.kr8_admin_growth(integer) from public, anon;
grant execute on function public.kr8_admin_growth(integer) to authenticated;
drop function if exists public.kr8_admin_growth_core(date, date);
commit;
