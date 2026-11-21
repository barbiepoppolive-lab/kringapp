-- 0194 (21 Nov, founder correction to 0193): visits from the US and India COUNT again (real travellers and future users come
-- from both). Instead, the phones of the founder, admins, the Kring Team and QA / test accounts are left out:
--   · kr8_staff_devices: a phone's visit id (kr_vid) is recorded when an admin opens the admin page, or when a team / test account
--     opens the app (kr8_staff_device, called by the app; for everyone else it does nothing). Every visit of that phone, past and
--     future, is marked test.
--   · the other test rules stay: zztest phones (automated browsers), refs test* / qa* / zz* / perf / demo / k99999, localhost /
--     *.pages.dev / bartest / app-preview, robots / headless / Playwright / link previews, known QA phone models.
--   · share opens: test when the opener or the Reel's author is a test card, or a robot (no country rule).
-- All older rows are marked again by these rules. UNDO: 0194_growth_no_country_UNDO.sql (back to 0193).
begin;
create table if not exists public.kr8_staff_devices (
  vid text primary key check (vid ~ '^[a-z0-9]{4,40}$'),
  user_id uuid,
  why text not null,
  created_at timestamptz not null default now()
);
alter table public.kr8_staff_devices enable row level security;
revoke all on public.kr8_staff_devices from anon, authenticated;

create or replace function public.kr8_lv_is_test(p_ref text, p_ua text, p_sid text, p_referrer text, p_country text, p_path text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p_sid, '') like 'zztest%'
      or coalesce(lower(p_ref), '') ~ '^(test|zz|qa)' or coalesce(lower(p_ref), '') in ('perf', 'demo', 'k99999')
      or coalesce(lower(p_referrer), '') ~ '(^|//)(localhost|127\.0\.0\.1|0\.0\.0\.0)|\.pages\.dev|^(https?://)?bartest'
      or coalesce(p_path, '') ~ '^/app-preview'
      or coalesce(p_ua, '') ~* '(bot|crawl|spider|headless|playwright|puppeteer|lighthouse|bingpreview|link preview|python|curl|wget|google-safety|googleother|facebookexternalhit|facebot|meta-externalagent|whatsapp|twitterbot|telegrambot|slackbot|discordbot|go-http-client|axios|undici|node-fetch|153\.0\.8010\.12|149\.0\.7827\.55|moto g power \(2022\))'
$$;

create or replace function public.link_visits_fill()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare h json;
begin
  new.created_at := now();
  new.ref := lower(new.ref);
  begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then h := null; end;
  if h is not null then
    new.user_agent := left(coalesce(h->>'user-agent', new.user_agent), 160);
    new.country := case when upper(h->>'cf-ipcountry') ~ '^[A-Z]{2}$' then upper(h->>'cf-ipcountry') else null end;
  else
    new.user_agent := left(new.user_agent, 160);
  end if;
  -- 0193/0194: test traffic is marked here; a phone that was ever test, or belongs to the founder / an admin / the team / QA, stays test
  new.is_test := public.kr8_lv_is_test(new.ref, new.user_agent, new.session_id, new.referrer, new.country, new.path)
    or (new.session_id is not null and (exists (select 1 from public.kr8_staff_devices d where d.vid = new.session_id)
        or exists (select 1 from public.link_visits x where x.session_id = new.session_id and x.is_test)));
  return new;
end $function$;

-- the app / admin page reports this phone's visit id; only admins, the Kring Team and test / QA cards are recorded
create or replace function public.kr8_staff_device(p_vid text)
returns boolean language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); v_why text;
begin
  if uid is null or coalesce(p_vid, '') !~ '^[a-z0-9]{4,40}$' then return false; end if;
  v_why := case when public.kr8_is_admin() then 'admin' when public.kr8_is_team(uid) then 'team'
                when public.kr8_is_test_member(uid) then 'test' end;
  if v_why is null then return false; end if;
  insert into public.kr8_staff_devices (vid, user_id, why) values (p_vid, uid, v_why) on conflict (vid) do nothing;
  update public.link_visits set is_test = true where session_id = p_vid and not is_test;
  return true;
end $$;
revoke all on function public.kr8_staff_device(text) from public, anon;
grant execute on function public.kr8_staff_device(text) to authenticated;

update public.link_visits set is_test = public.kr8_lv_is_test(ref, user_agent, session_id, referrer, country, path);
update public.link_visits v set is_test = true
 where not v.is_test and v.session_id in (select session_id from public.link_visits where is_test and session_id is not null);

create or replace function public.kr8_open_is_test_trg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare au uuid;
begin
  select author into au from public.kr8_posts where id = new.post_id;
  new.is_test := coalesce(public.kr8_is_test_member(au), false)
              or (new.opener is not null and public.kr8_is_test_member(new.opener))
              or coalesce(new.ua, '') ~* '(bot|crawl|spider|headless|playwright|puppeteer|lighthouse|python|curl|wget|facebookexternalhit|whatsapp)';
  return new;
end $$;
update public.kr8_share_opens o set is_test =
     coalesce(public.kr8_is_test_member((select p.author from public.kr8_posts p where p.id = o.post_id)), false)
  or (o.opener is not null and public.kr8_is_test_member(o.opener))
  or coalesce(o.ua, '') ~* '(bot|crawl|spider|headless|playwright|puppeteer|lighthouse|python|curl|wget|facebookexternalhit|whatsapp)';

CREATE OR REPLACE FUNCTION public.kr8_admin_growth_core(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  today date := (now() at time zone 'Asia/Bangkok')::date;
  d_from date := coalesce(least(p_from, p_to), today);
  d_to date := least(coalesce(greatest(p_from, p_to), today), today);
  n_days int := greatest(1, (d_to - d_from) + 1);
  d_prev date := d_from - n_days;
  t_from timestamptz := d_from::timestamp at time zone 'Asia/Bangkok';
  t_to timestamptz := (d_to + 1)::timestamp at time zone 'Asia/Bangkok';
  t_prev timestamptz := d_prev::timestamp at time zone 'Asia/Bangkok';
  t_prev_end timestamptz;
  max_hour int;
  min_day date;
  has_prev boolean;
  r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  -- For Today / open window ending today, compare yesterday up to the same clock offset; for closed past days, compare full days
  if d_to >= today then
    t_prev_end := least(t_from, t_prev + (now() - t_from));
    max_hour := extract(hour from now() at time zone 'Asia/Bangkok')::int;
  else
    t_prev_end := t_from;
    max_hour := 23;
  end if;

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
           coalesce(v.user_agent, '') as ua,
           coalesce(v.is_test, false) as is_test,
           coalesce(v.member, false) as member,
           coalesce(v.path, '') as path,
           v.via
      from public.link_visits v
     where v.session_id is not null
       and v.created_at < t_to
  ),
  noisy as materialized (
    select distinct sid
      from all_norm
     where is_test   -- 0193/0194: marked at insert (kr8_lv_is_test + staff / QA devices): the rules below plus qa* refs and preview pages
        or sid like 'zztest%'
        or ua ~* '(bot|crawl|spider|headless|playwright|puppeteer|lighthouse|bingpreview|skypeuripreview|link preview|python|curl|wget|google-safety|googleother|bitdiscovery|censys|zgrab|netfront/3|facebookexternalhit|facebot|meta-externalagent|whatsapp|twitterbot|telegrambot|slackbot|discordbot|line-poker|vkshare|pinterest|go-http-client|axios|undici|node-fetch|153\.0\.8010\.12|149\.0\.7827\.55|moto g power \(2022\))'
        or (ua ~ 'iPhone OS 1[56]_0' and ua ~ 'Version/2[67]\.')
        or (country in ('US', 'IE', 'SE') and ua ~ 'Windows NT 10\.0.*Chrome/139\.0\.0\.0')
        or raw_host ~ '^(localhost|127\.0\.0\.1|0\.0\.0\.0)'
        or raw_host ~ '\.pages\.dev$'
        or raw_host ~ '^bartest'
        or ref ~ '^(test|zz|qa)'
        or ref in ('perf', 'demo')
  ),
  clean_all as materialized (
    select a.id, a.sid, a.at, a.day, a.ref, a.member, a.path, a.via, a.ua,
           case
             when a.raw_host is not null
                  and a.raw_host !~ '(^|\.)kringapp\.com$'
                  and a.raw_host not in ('accounts.google.com', 'inetmail.cloud') then a.raw_host
             -- Recover in-app browser channel when Referer header was stripped by WebView and no ?ref= was present
             when a.ref is null and a.ua ~* '\mLine/' then 'line.me'
             when a.ref is null and a.ua ~* 'Instagram' then 'instagram.com'
             when a.ref is null and a.ua ~* '(FBAN|FB_IAB|FBAV)' then 'facebook.com'
             when a.ref is null and a.ua ~* '(TikTok|musical_ly|Bytedance)' then 'tiktok.com'
             else null
           end as host,
           a.country
      from all_norm a
     where not exists (select 1 from noisy n where n.sid = a.sid)
  ),
  clean as materialized (
    select * from clean_all where at >= t_prev and at < t_to
  ),
  vis as materialized (
    select * from clean where at >= t_from and at < t_to and coalesce(ref, '') <> 'pwa-install'
  ),
  prev as (
    select case when has_prev then
      (select count(distinct sid)::int
         from clean
        where at >= t_prev
          and at < t_prev_end
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
  acc as materialized (
    select u.id as uid,
           u.created_at as at,
           public.kr8_admin_v2_kind(u.id) as kind
      from auth.users u
     where u.created_at >= t_from
       and u.created_at < t_to
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
       and p.created_at < t_to
       and not exists (select 1 from first_reel f where f.uid = p.author and f.at < t_to)
  ),
  cards as (
    select * from real_m where at >= t_from and at < t_to
  ),
  ref_vis as (
    select ref, count(distinct sid)::int as visitors
      from vis
     where ref is not null
       and ref !~ '^(ig|insta|instagram|tt|tiktok|x|twitter|yt|youtube|fb|facebook|line|google|reddit|chatgpt|ai|direct|\(none\))$'
     group by ref
  ),
  ref_join as (
    select m.code as ref,
           count(*) filter (where m.at >= t_from and m.at < t_to)::int as joined,
           count(f.uid) filter (where m.at >= t_from and m.at < t_to and f.at < t_to)::int as reels,
           count(f.uid) filter (where f.at >= t_from and f.at < t_to)::int as reels_in_period,
           count(*) filter (where m.at < t_to)::int as joined_total,
           count(f.uid) filter (where m.at < t_to and f.at < t_to)::int as reels_total
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
    select g::date as day from generate_series(d_from, d_to, interval '1 day') g
  ),
  -- 0193: a NEW visitor = this phone's first-ever visit is in the period, and it never opened Kring signed in / as the installed app
  member_sids as (
    select distinct sid from clean_all where member
  ),
  new_sids as materialized (
    select p.sid from per_sid p
     where not exists (select 1 from clean_all c where c.sid = p.sid and c.at < t_from and coalesce(c.ref, '') <> 'pwa-install')
       and not exists (select 1 from member_sids m where m.sid = p.sid)
  ),
  -- members opening the app: real members (no test / team / admin / mirror) whose app reported in during the period
  member_opens as (
    select count(distinct e.user_id)::int as n
      from public.kr8_client_events e
     where e.created_at >= t_from and e.created_at < t_to and e.user_id is not null
       and public.kr8_admin_v2_kind(e.user_id) = 'real'
       and not public.kr8_is_team(e.user_id) and not coalesce(public.kr8_is_mirror(e.user_id), false)
       and not exists (select 1 from auth.users u join public.kr8_admin_emails a on a.email = lower(u.email) where u.id = e.user_id)
  ),
  -- where they came from: the first visit of each visitor in the period, one fixed list of channels
  src_visit as (
    select distinct on (c.sid) c.sid,
           case
             when c.path ~ '^/q/' or c.via = 'ask' then 'ask'
             when c.via = 'reel' then 'reel'
             when c.via = 'install' then 'install'
             when c.ref ~ '^k[0-9]{3,7}$' then 'invite'
             when c.ref = 'pich' then 'pich'
             when c.ref ~ '^(chatgpt|openai|perplexity|gemini|copilot|claude|ai)$'
                  or c.host ~ '(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|gemini\.google\.com|bard\.google\.com|copilot\.microsoft\.com|claude\.ai|you\.com|phind\.com)$' then 'ai'
             when c.ref = 'google' or c.host ~ '((^|\.)google\.[a-z.]+$|googlequicksearchbox)' then 'google'
             when c.ref ~ '^(ig|insta|instagram)$' or c.host ~ 'instagram' then 'instagram'
             when c.ref ~ '^(tt|tiktok)$' or c.host ~ '(tiktok|musical\.ly|zhiliaoapp)' then 'tiktok'
             when c.ref ~ '^(fb|facebook)$' or c.host ~ '(facebook|(^|\.)fb\.(com|me)$|messenger)' then 'facebook'
             when c.ref = 'line' or c.host ~ '((^|\.)(line\.me|lin\.ee)$|naver\.line|line\.naver)' then 'line'
             when c.ref is not null and c.ref not in ('direct', '(none)') then 'link'
             when c.host is not null then 'other'
             else 'direct'
           end as key,
           case
             when c.path ~ '^/q/' then c.path
             when c.ref is not null and c.ref not in ('direct', '(none)', 'pich') then c.ref
             else c.host
           end as detail
      from clean c
     where c.sid in (select sid from per_sid) and c.at >= t_from and c.at < t_to and coalesce(c.ref, '') <> 'pwa-install'
     order by c.sid, c.at, c.id
  ),
  src_detail as (
    select s.key, s.detail, count(*)::int as n,
           max(mb.first_name) as member_name, max(mb.member_no) as member_no
      from src_visit s
      left join public.kr8_members mb
        on mb.member_no = (case when s.key = 'invite' and s.detail ~ '^k0*[0-9]{1,7}$' then nullif(regexp_replace(s.detail, '^k0*', ''), '')::int end) and not coalesce(mb.ghost, false)
     group by s.key, s.detail
  )
  select jsonb_build_object(
    'days', n_days,
    'from', d_from,
    'to', d_to,
    'now', now(),
    'tracking_since', min_day,
    'has_prev_window', has_prev,
    'visitors', (select count(*)::int from per_sid),
    'new_visitors', (select count(*)::int from new_sids),
    'member_opens', (select n from member_opens),
    'sources2', coalesce((
      select jsonb_agg(jsonb_build_object('key', k.key, 'visitors', k.n, 'details', coalesce(k.details, '[]'::jsonb)) order by k.n desc, k.key)
        from (select key, sum(n)::int as n,
                     jsonb_agg(jsonb_build_object('d', detail, 'n', n, 'name', member_name, 'no', member_no) order by n desc, detail)
                       filter (where detail is not null) as details
                from src_detail group by key) k
    ), '[]'::jsonb),
    'visitors_prev', (select n from prev),
    'visits', (select coalesce(sum(visits), 0)::int from per_sid),
    'page_loads', (select coalesce(sum(raw_hits), 0)::int from per_sid),
    'returning', (select count(*)::int from returning_sids),
    'signins', (select count(*)::int from signins),
    'cards', (select count(*)::int from cards),
    'cards_with_photo', (select count(*) filter (where has_photo)::int from cards),
    'first_reels', (select count(*)::int from first_reel f join real_m m on m.uid = f.uid where f.at >= t_from and f.at < t_to),
    'pending_reels', (select n from pending_first_reel),
    'app_installs', (select count(distinct sid)::int from clean where at >= t_from and at < t_to and ref = 'pwa-install'),
    'excluded_noise', (select count(distinct sid)::int from all_norm a where a.at >= t_from and a.at < t_to and coalesce(a.ref, '') <> 'pwa-install' and exists (select 1 from noisy n where n.sid = a.sid)),
    'share_opens', case when to_regclass('public.kr8_share_opens') is null then null
                        else (
                          select count(*)::int
                            from public.kr8_share_opens o
                            join public.kr8_posts p on p.id = o.post_id
                            join real_m m on m.uid = p.author
                           where o.ok
                             and not coalesce(o.is_test, false)
                             and o.bkk_date >= d_from
                             and o.bkk_date <= d_to
                             and p.kind = 'reel'
                             and p.status = 'approved'
                             and not coalesce(p.hidden, false)
                             and o.opener is distinct from p.author
                        ) end,
    'funnel', jsonb_build_object(
      'new_visitors', (select count(*)::int from new_sids),
      'signed_in', (select count(*)::int from signins),
      'card', (select count(*)::int from signins s join real_m m on m.uid = s.uid and m.at < t_to),
      'reel', (select count(*)::int from signins s join real_m m on m.uid = s.uid and m.at < t_to join first_reel f on f.uid = s.uid and f.at < t_to)
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
         from generate_series(0, max_hour) h)
      else
        (select jsonb_agg(jsonb_build_object('t', d.day, 'visitors',
            (select count(distinct sid)::int from vis where vis.day = d.day)) order by d.day)
         from days d) end
  ) into r;

  return r;
end $function$;

commit;
