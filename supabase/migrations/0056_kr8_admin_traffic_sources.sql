-- 0056 · "Where visitors come from" on the admin Site visits sheet (16 Nov 2026).
-- (Asked for as 0053; numbers 0053-0055 were already taken by other migrations, so this is the next free number.)
--
-- ADDITIVE: one new admin-only function. No table, view, trigger, policy or existing function is touched.
-- Reads public.link_visits and public.kr8_members (counts only, no names). Same rules as 0052:
--   · one visitor = one distinct session_id per Bangkok day; robots/tools and 'zztest%' sessions are left out
--   · United States is not counted in the channels (most of it is our own cloud testing); it is returned separately as 'us'
--
-- Each visitor-session is put in ONE channel, first match wins:
--   1. the ?ref= / ?src= value when it is a channel word: ig|insta|instagram, tt|tiktok, x|twitter, yt|youtube, fb|facebook,
--      line, google, reddit, chatgpt|ai
--   2. the referrer host: instagram.com, tiktok.com, t.co/x.com/twitter.com, google.*, youtube.com/youtu.be, facebook.com/fb.com,
--      line.me, reddit.com, chatgpt.com/chat.openai.com/perplexity.ai/gemini.google.com/claude.ai (AI assistants),
--      bing/duckduckgo (Other search); any other host = Other websites (top 5 hosts returned). Our own host is ignored.
--   3. any other ?ref= / ?src= code (pich, nattham, nattham-<place>, member codes) = Member & partner links
--   4. otherwise Direct.
-- 'codes' lists every non-channel code with its visitors (all sessions that carried the code, even if a site referred them) and sign-ups.
-- Sign-ups come from kr8_members (test members left out): code = ref_code (recruiter, first touch), else src_code; a channel word
-- there counts in that channel, any other code in Member & partner links, none = Direct.
--
-- Returns { today|week|month: { channels:[{key,label,visitors,signups}], us, codes:[{code,visitors,signups}], hosts:[{host,visitors}] } }
--
-- UNDO: drop function if exists public.kr8_admin_traffic_sources(int);

create or replace function public.kr8_admin_traffic_sources(p_days int default 7)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  today date := (now() at time zone 'Asia/Bangkok')::date;
  r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  with v0 as (
    select (created_at at time zone 'Asia/Bangkok')::date as day, session_id, created_at,
           case when upper(country) = 'TH' then 'th' when upper(country) = 'US' then 'us' else 'other' end as zone,
           nullif(nullif(nullif(lower(ref), ''), 'direct'), '(none)') as rv,
           nullif(regexp_replace(lower(coalesce(referrer, '')), '^(www\.|m\.)', ''), '') as host0
    from public.link_visits
    where created_at >= ((today - 29)::timestamp at time zone 'Asia/Bangkok')
      and session_id is not null
      and session_id not like 'zztest%'
      and coalesce(user_agent, '') !~* '(bot|crawl|spider|headless|playwright|lighthouse|preview|python|curl)'
  ),
  v1 as (
    select *, case when host0 ~ '(^|\.)kringapp\.com$' then null else host0 end as host from v0
  ),
  v2 as (
    select *,
      case rv when 'ig' then 'instagram' when 'insta' then 'instagram' when 'instagram' then 'instagram'
              when 'tt' then 'tiktok' when 'tiktok' then 'tiktok' when 'x' then 'x' when 'twitter' then 'x'
              when 'yt' then 'youtube' when 'youtube' then 'youtube' when 'fb' then 'facebook' when 'facebook' then 'facebook'
              when 'line' then 'line' when 'google' then 'google' when 'reddit' then 'reddit'
              when 'chatgpt' then 'ai' when 'ai' then 'ai' end as ref_ch,
      case when host is null then null
           -- Android apps send their package name as the referrer (in-app browsers)
           when host ~ '(naver\.line|^jp\.naver)' then 'line'
           when host ~ '^com\.instagram\.' then 'instagram'
           when host ~ '^(com\.zhiliaoapp\.musically|com\.ss\.android\.ugc)' then 'tiktok'
           when host ~ '^com\.(facebook|facebook\.katana|facebook\.orca)' then 'facebook'
           when host ~ '^com\.twitter\.android' then 'x'
           when host ~ '^com\.google\.android\.(googlequicksearchbox|gm)' then 'google'
           when host ~ '^com\.reddit\.' then 'reddit'
           when host ~ '(^|\.)instagram\.com$' then 'instagram'
           when host ~ '(^|\.)tiktok\.com$' then 'tiktok'
           when host ~ '^(t\.co|(.+\.)?(x|twitter)\.com)$' then 'x'
           when host ~ '^(chatgpt\.com|chat\.openai\.com|gemini\.google\.com|claude\.ai|copilot\.microsoft\.com)$' or host ~ '(^|\.)perplexity\.ai$' then 'ai'
           when host ~ '(^|\.)google\.[a-z.]+$' then 'google'
           when host ~ '(^|\.)(youtube\.com|youtu\.be)$' then 'youtube'
           when host ~ '(^|\.)(facebook\.com|fb\.com|fb\.me)$' then 'facebook'
           when host ~ '(^|\.)line\.me$' then 'line'
           when host ~ '(^|\.)(reddit\.com|redd\.it)$' then 'reddit'
           when host ~ '(^|\.)(bing\.com|duckduckgo\.com)$' then 'other_search'
           else 'other_sites' end as host_ch
    from v1
  ),
  v3 as (
    select *, coalesce(ref_ch, host_ch, case when rv is not null then 'member_links' end, 'direct') as ch,
           case when ref_ch is not null then 1 when host_ch is not null then 2 when rv is not null then 3 else 4 end as prio,
           min(zone) over (partition by day, session_id) as zone_day
    from v2
  ),
  -- one row per visitor per day: the best-matching row of that visitor's day
  s as (
    select distinct on (day, session_id) day, session_id, ch, zone_day as zone,
           case when ch = 'other_sites' then host end as host
    from v3 order by day, session_id, prio, created_at
  ),
  -- every visitor-day that carried a non-channel code (counted once per code)
  c as (
    select distinct day, session_id, rv as code, min(zone) over (partition by day, session_id) as zone
    from v3 where rv is not null and ref_ch is null
  ),
  m as (
    select (created_at at time zone 'Asia/Bangkok')::date as day,
           coalesce(nullif(lower(ref_code), ''), nullif(lower(src_code), '')) as code
    from public.kr8_members
    where created_at >= ((today - 29)::timestamp at time zone 'Asia/Bangkok') and not public.kr8_is_test_member(user_id)
  ),
  m2 as (
    select day, code,
      case code when 'ig' then 'instagram' when 'insta' then 'instagram' when 'instagram' then 'instagram'
                when 'tt' then 'tiktok' when 'tiktok' then 'tiktok' when 'x' then 'x' when 'twitter' then 'x'
                when 'yt' then 'youtube' when 'youtube' then 'youtube' when 'fb' then 'facebook' when 'facebook' then 'facebook'
                when 'line' then 'line' when 'google' then 'google' when 'reddit' then 'reddit'
                when 'chatgpt' then 'ai' when 'ai' then 'ai'
                when 'direct' then 'direct' when '(none)' then 'direct'
                else case when code is null then 'direct' else 'member_links' end end as ch
    from m
  ),
  chans(key, label, ord) as (values
    ('instagram', 'Instagram', 1), ('tiktok', 'TikTok', 2), ('x', 'X', 3), ('google', 'Google', 4), ('youtube', 'YouTube', 5),
    ('facebook', 'Facebook', 6), ('line', 'LINE', 7), ('reddit', 'Reddit', 8), ('ai', 'AI assistants', 9),
    ('other_search', 'Other search', 10), ('other_sites', 'Other websites', 11), ('member_links', 'Member & partner links', 12), ('direct', 'Direct', 13)),
  per(name, from_day) as (values ('today', today), ('week', today - 6), ('month', today - 29))
  select jsonb_object_agg(per.name, jsonb_build_object(
    'channels', (select jsonb_agg(jsonb_build_object('key', cn.key, 'label', cn.label,
        'visitors', (select count(*)::int from s where s.ch = cn.key and s.zone <> 'us' and s.day >= per.from_day),
        'signups', (select count(*)::int from m2 where m2.ch = cn.key and m2.day >= per.from_day)) order by cn.ord) from chans cn),
    'us', (select count(*)::int from s where s.zone = 'us' and s.day >= per.from_day),
    'codes', (select coalesce(jsonb_agg(jsonb_build_object('code', x.code, 'visitors', x.visitors, 'signups', x.signups)
                order by x.visitors desc, x.signups desc, x.code), '[]'::jsonb)
              from (select coalesce(a.code, b.code) as code, coalesce(a.n, 0) as visitors, coalesce(b.n, 0) as signups
                    from (select code, count(*)::int as n from c where zone <> 'us' and day >= per.from_day group by code) a
                    full join (select code, count(*)::int as n from m2 where ch = 'member_links' and day >= per.from_day group by code) b on a.code = b.code) x),
    'hosts', (select coalesce(jsonb_agg(jsonb_build_object('host', h.host, 'visitors', h.n) order by h.n desc, h.host), '[]'::jsonb)
              from (select host, count(*)::int as n from s where ch = 'other_sites' and zone <> 'us' and day >= per.from_day
                    group by host order by 2 desc, 1 limit 5) h)
  )) into r
  from per;
  return r;
end $$;

revoke all on function public.kr8_admin_traffic_sources(int) from public, anon;
grant execute on function public.kr8_admin_traffic_sources(int) to authenticated;
