-- 0193 (21 Nov, founder Fix 7): clean Growth numbers.
-- 1. Test traffic is marked when it is saved: link_visits.is_test and kr8_share_opens.is_test, and every older row was marked by the
--    same rules (kr8_lv_is_test). A visit is TEST when: its phone id starts zztest (automated browsers); its ref is test* / qa* / zz* /
--    perf / demo / k99999; it came from localhost, *.pages.dev, bartest or the /app-preview/ pages; its browser is a robot, headless,
--    Playwright, Puppeteer or a link preview; or its country is US or IN (our own testing and the founder in India); plus the older
--    Growth rules (known QA phone models). A phone that was ever marked test is test for every visit.
--    Admin phones never count (the app skips the counter on a phone that opened the admin, kr8_admin_view); admin, team, mirror and
--    test accounts never count as members. A share open is TEST when the opener or the Reel's author is a test card, it is a robot,
--    or it comes from US / IN.
-- 2. new_visitors = phones whose first-ever visit is in the period and that never opened Kring signed in / as the installed app
--    (link_visits.member, sent by the app counter from 21 Nov); member_opens = real members whose app reported in (kr8_client_events).
--    funnel.new_visitors is the funnel start.
-- 3. sources2 = one fixed channel list (Google, ChatGPT / AI, Instagram, TikTok, Facebook, LINE, invite links k…, Pich, Reel share
--    links, Ask BKK pages, install button, other links, other sites, Direct) with the detail behind each (link_visits.via from the app).
-- 4. kr8_feed (the signed-out fallback) never shows test or paused cards' posts.
-- UNDO: 0193_growth_clean_UNDO.sql
begin;
alter table public.link_visits add column if not exists is_test boolean not null default false;
alter table public.link_visits add column if not exists member boolean not null default false;
alter table public.link_visits add column if not exists via text check (via is null or via in ('reel', 'ask', 'install'));
grant insert (member, via) on public.link_visits to anon, authenticated;
create index if not exists link_visits_sid on public.link_visits (session_id);

create or replace function public.kr8_lv_is_test(p_ref text, p_ua text, p_sid text, p_referrer text, p_country text, p_path text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p_sid, '') like 'zztest%'
      or coalesce(lower(p_ref), '') ~ '^(test|zz|qa)' or coalesce(lower(p_ref), '') in ('perf', 'demo', 'k99999')
      or coalesce(lower(p_referrer), '') ~ '(^|//)(localhost|127\.0\.0\.1|0\.0\.0\.0)|\.pages\.dev|^(https?://)?bartest'
      or coalesce(p_path, '') ~ '^/app-preview'
      or coalesce(p_ua, '') ~* '(bot|crawl|spider|headless|playwright|puppeteer|lighthouse|bingpreview|link preview|python|curl|wget|google-safety|googleother|facebookexternalhit|facebot|meta-externalagent|whatsapp|twitterbot|telegrambot|slackbot|discordbot|go-http-client|axios|undici|node-fetch|153\.0\.8010\.12|149\.0\.7827\.55|moto g power \(2022\))'
      or upper(coalesce(p_country, '')) in ('US', 'IN')
$$;

create or replace function public.link_visits_fill()
 returns trigger language plpgsql set search_path to 'public', 'pg_temp'
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
  -- 0193: test traffic is marked here (the same rules Growth uses); a phone that was ever test stays test
  new.is_test := public.kr8_lv_is_test(new.ref, new.user_agent, new.session_id, new.referrer, new.country, new.path)
    or (new.session_id is not null and exists (select 1 from public.link_visits x where x.session_id = new.session_id and x.is_test));
  return new;
end $function$;

update public.link_visits set is_test = public.kr8_lv_is_test(ref, user_agent, session_id, referrer, country, path);
update public.link_visits v set is_test = true
 where not v.is_test and v.session_id in (select session_id from public.link_visits where is_test and session_id is not null);

alter table public.kr8_share_opens add column if not exists is_test boolean not null default false;
create or replace function public.kr8_open_is_test_trg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare au uuid;
begin
  select author into au from public.kr8_posts where id = new.post_id;
  new.is_test := coalesce(public.kr8_is_test_member(au), false)
              or (new.opener is not null and public.kr8_is_test_member(new.opener))
              or coalesce(new.ua, '') ~* '(bot|crawl|spider|headless|playwright|puppeteer|lighthouse|python|curl|wget|facebookexternalhit|whatsapp)'
              or upper(coalesce(new.country, '')) in ('US', 'IN');
  return new;
end $$;
revoke all on function public.kr8_open_is_test_trg() from public, anon, authenticated;
drop trigger if exists kr8_open_is_test on public.kr8_share_opens;
create trigger kr8_open_is_test before insert or update of opener on public.kr8_share_opens for each row execute function public.kr8_open_is_test_trg();
update public.kr8_share_opens o set is_test = true
 where coalesce(public.kr8_is_test_member((select p.author from public.kr8_posts p where p.id = o.post_id)), false)
    or (o.opener is not null and public.kr8_is_test_member(o.opener))
    or coalesce(o.ua, '') ~* '(bot|crawl|spider|headless|playwright|puppeteer|lighthouse|python|curl|wget|facebookexternalhit|whatsapp)'
    or upper(coalesce(o.country, '')) in ('US', 'IN');

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
     where is_test   -- 0193: marked at insert (kr8_lv_is_test): the rules below plus qa* refs and preview pages
        or sid like 'zztest%'
        or ua ~* '(bot|crawl|spider|headless|playwright|puppeteer|lighthouse|bingpreview|skypeuripreview|link preview|python|curl|wget|google-safety|googleother|bitdiscovery|censys|zgrab|netfront/3|facebookexternalhit|facebot|meta-externalagent|whatsapp|twitterbot|telegrambot|slackbot|discordbot|line-poker|vkshare|pinterest|go-http-client|axios|undici|node-fetch|153\.0\.8010\.12|149\.0\.7827\.55|moto g power \(2022\))'
        or (ua ~ 'iPhone OS 1[56]_0' and ua ~ 'Version/2[67]\.')
        or (country in ('US', 'IE', 'SE') and ua ~ 'Windows NT 10\.0.*Chrome/139\.0\.0\.0')
        or raw_host ~ '^(localhost|127\.0\.0\.1|0\.0\.0\.0)'
        or raw_host ~ '\.pages\.dev$'
        or raw_host ~ '^bartest'
        or ref ~ '^(test|zz|qa)'
        or ref in ('perf', 'demo')
        or country in ('US', 'IN')
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
                             and coalesce(upper(o.country), '') not in ('US', 'IN')
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

CREATE OR REPLACE FUNCTION public.kr8_feed(p_area text DEFAULT NULL::text, p_limit integer DEFAULT 40)
 RETURNS TABLE(id uuid, kind text, area text, body text, photo text, event_id text, here boolean, created_at timestamp with time zone, author_id uuid, author_name text, author_photo text, author_langs text[], author_who text, mine boolean, answers jsonb, video_path text, poster_path text, duration_ms integer, reel_status text, likes integer, liked boolean, saved boolean, views integer, ig_handle text, venue_id text, venue_name text, venue_name_th text, deal_id text, deal_en text, deal_th text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select p.id, p.kind, p.area, p.body, p.photo, p.event_id, coalesce(p.here_until > now(), false), p.created_at,
         case when auth.uid() is null then null else p.author end,
         m.first_name,
         case when auth.uid() is null then null else m.photo end,
         m.langs, m.who, p.author = auth.uid(),
         coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'body', a.body, 'name', am.first_name, 'who', am.who,
                                                       'photo', case when auth.uid() is null then null else am.photo end)
                                    order by a.created_at)
                   from public.kr8_answers a join public.kr8_members am on am.user_id = a.author
                   where a.post_id = p.id and (auth.uid() is null or not public.kr8_is_blocked(auth.uid(), a.author))), '[]'::jsonb),
         p.video_path, p.poster_path, p.duration_ms, case when p.kind = 'reel' then p.status end,
         p.likes_count,
         exists (select 1 from public.kr8_post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
         exists (select 1 from public.kr8_post_saves s where s.post_id = p.id and s.user_id = auth.uid()),
         case when p.author = auth.uid() or adm.yes then p.views_count end,   -- views: creator + team only
         m.ig_handle,
         v.id, v.name, v.name_th, t.id, t.deal_en, t.deal_th
  from public.kr8_posts p join public.kr8_members m on m.user_id = p.author
  cross join (select public.kr8_is_admin() as yes) adm
  left join public.kr8_venues v on v.id = p.venue_id and v.status = 'live'
  left join lateral (select t.id, t.deal_en, t.deal_th from public.kr8_treats t
                     where t.venue_id = v.id and t.active and (t.ends_at is null or t.ends_at > now())
                     order by t.created_at desc limit 1) t on true
  where not p.hidden
    and (p.kind <> 'reel' or p.status = 'approved' or (p.status = 'pending' and p.author = auth.uid()))
    and (p.kind <> 'reel' or not coalesce(p.feed_off, false) or p.author = auth.uid())   -- 0147 Hide from feed
    and (p.author = auth.uid() or not public.kr8_minor_held(p.author))   -- 0151
    and (p.author = auth.uid() or (not coalesce(m.ghost, false) and not public.kr8_is_test_member(p.author)))   -- 0193: never test / paused cards (signed-out fallback too)
    and p.kind <> 'ask'   -- 0057: questions live in kr8_ask_feed; without this they would push Reels out of the 40-row feed
    and p.created_at > now() - interval '14 days'
    and (p_area is null or p.area = p_area)
    and (auth.uid() is null or not public.kr8_is_blocked(auth.uid(), p.author))
    and (auth.uid() is null or not exists (select 1 from public.kr8_post_hidden h where h.user_id = auth.uid() and h.post_id = p.id))
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100)
$function$;

commit;
