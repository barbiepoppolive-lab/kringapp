-- Throwaway LOCAL database only (tools/growth/stub_schema.sql + 0113): realistic Kring-sized numbers for the Growth screenshots.
-- ~1,200 visits over 30 days, most in the last week; ~70 sign-ins, ~55 cards, ~20 first Reels. Deterministic (setseed).
select setseed(0.113);
truncate public.kr8_share_opens, public.link_visits, public.kr8_posts, public.kr8_members, public.kr8_ref_credits, auth.users, public.kr6_staff cascade;
insert into auth.users (id, email, created_at) values ('00000000-0000-4000-8000-00000000ad00', 'admin@kring.local', now() - interval '60 days');
insert into public.kr6_staff values ('00000000-0000-4000-8000-00000000ad00', 'admin');
-- phones: 900 phones, each with a home referrer / ref / country
create temp table phones as
select i, 'p' || lpad(i::text, 5, '0') as sid,
  (array[null,null,null,null,null,null,null,null,null,'liff.line.me','line.me','jp.naver.line.android','jp.naver.line.android','line.me',
         'www.google.com','www.google.co.th','m.facebook.com','l.facebook.com','www.facebook.com','l.instagram.com','com.instagram.android','www.instagram.com',
         'www.tiktok.com','kringapp.com','kringapp.com','www.bing.com','t.co','localhost:5173','abc.kring.pages.dev'])[1 + floor(random() * 29)::int] as host,
  (array[null,null,null,null,null,null,null,'pich','pich','nattham','nattham','nattham-silom','k00012','k00031','k00044','ig','tiktok','test1','zz1','hostel-stand'])[1 + floor(random() * 20)::int] as ref,
  (array['TH','TH','TH','TH','TH','TH','TH','TH','TH','TH','TH','TH','IN','IN','US','SG','MY','JP','GB','DE','KR','AU',null])[1 + floor(random() * 23)::int] as country,
  power(random(), 2.2) * 30 as age_days
from generate_series(1, 900) i;
insert into public.link_visits (session_id, ref, referrer, country, user_agent, path, created_at)
select sid, ref, host, country, case when i % 97 = 0 then 'Mozilla/5.0 HeadlessChrome' else 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)' end, '/app/',
       now() - make_interval(secs => age_days * 86400) from phones;
-- ~30% come back 1-3 more times on later days (no referrer: home-screen / typed)
insert into public.link_visits (session_id, ref, referrer, country, user_agent, path, created_at)
select sid, null, null, country, 'Mozilla/5.0 (iPhone)', '/app/', now() - make_interval(secs => greatest(0, age_days - 1 - k) * 86400 * random())
from phones, generate_series(1, 3) k where random() < 0.13 and age_days > 1;
insert into public.link_visits (session_id, ref, referrer, country, path, created_at)
select sid, 'pwa-install', null, country, '/app/', now() - make_interval(secs => age_days * 86400 * 0.9) from phones where random() < 0.04;
-- people: 80 sign-ins, ~70% make a card, ~35% of cards post a Reel
create temp table ppl as
select i, ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as uid, power(random(), 1.8) * 30 as age_days,
  (array['Mint','Ton','Ploy','Aom','Nat','Fern','Bank','Pim','Beam','Ice','Gift','Kwan','Earth','Mook','Prae','Tae'])[1 + (i % 16)] as name,
  (array[null,null,null,'pich','pich','nattham','nattham','k00012','k00031','hostel-stand',null,'k00044'])[1 + floor(random() * 12)::int] as ref,
  random() as r1, random() as r2
from generate_series(1, 80) i;
insert into auth.users (id, email, created_at) select uid, 'm' || i || '@kring.local', now() - make_interval(secs => age_days * 86400) from ppl;
insert into public.kr8_members (user_id, member_no, first_name, ref_code, created_at)
select uid, i, name, ref, now() - make_interval(secs => greatest(0, age_days * 86400 - 600)) from ppl where r1 < 0.72;
-- the three inviters behind k00012 / k00031 / k00044 (older members)
delete from public.kr8_members where member_no in (12, 31, 44);
insert into auth.users (id, email, created_at) values ('00000000-0000-4000-8000-0000000a0012', 'mint@kring.local', now() - interval '40 days'),
  ('00000000-0000-4000-8000-0000000a0031', 'nat@kring.local', now() - interval '40 days'), ('00000000-0000-4000-8000-0000000a0044', 'ploy@kring.local', now() - interval '40 days');
insert into public.kr8_members (user_id, member_no, first_name, created_at) values ('00000000-0000-4000-8000-0000000a0012', 12, 'Mint', now() - interval '40 days'),
  ('00000000-0000-4000-8000-0000000a0031', 31, 'Nat', now() - interval '40 days'), ('00000000-0000-4000-8000-0000000a0044', 44, 'Ploy', now() - interval '40 days');
insert into public.kr8_posts (author, kind, status, created_at)
select uid, 'reel', 'approved', now() - make_interval(secs => greatest(0, age_days * 86400 - 3600 * 5)) from ppl where r1 < 0.72 and r2 < 0.38;
insert into public.kr8_share_opens (bkk_date, ok) select (now() at time zone 'Asia/Bangkok')::date - (floor(random() * 7))::int, true from generate_series(1, 64);
