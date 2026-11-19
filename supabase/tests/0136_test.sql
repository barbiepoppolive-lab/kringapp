-- 0136 robot-open filter test (throwaway / LOCAL DB only; everything rolls back). Prints PASS lines; any failure raises.
-- Run: tools/robots/run_local_test.sh
begin;
create or replace function pg_temp.ok(c boolean, m text) returns void language plpgsql as $$
begin if coalesce(c, false) then raise notice 'PASS %', m; else raise exception 'FAIL %', m; end if; end $$;
create or replace function pg_temp.u(n int) returns uuid language sql as $$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
-- one open: Reel short, user agent, country, device number (same number = same phone/network), referrer
create or replace function pg_temp.open(s text, ua text, c text, dev int, ref text default null) returns jsonb language sql as $$
  select public.kr8_share_open(s, ref, ua, 'sess-' || lpad(dev::text, 16, '0'), md5('dev' || dev), c, 'testkey') $$;

insert into public.kr8_members values (pg_temp.u(1), 1, 'Ploy'), (pg_temp.u(2), 2, 'Nok');
insert into public.kr8_posts (id, author) values (pg_temp.u(11), pg_temp.u(1)), (pg_temp.u(12), pg_temp.u(1)), (pg_temp.u(21), pg_temp.u(2));
insert into public.kr8_reel_links values ('ploya1', pg_temp.u(11)), ('ployb2', pg_temp.u(12)), ('nokaa1', pg_temp.u(21));
-- an old open, stored before 0136 with a robot agent and ok = true: must stay as it is (no re-scoring mid-week)
insert into public.kr8_share_opens (post_id, session, device, ua, country, ok) values (pg_temp.u(21), 'old-session-000001', md5('old'), 'Googlebot/2.1', 'US', true);

\set thai_chrome '''Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'''
\set thai_ig '''Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 357.0.0.25.101 (iPhone15,2; iOS 18_1; th_TH; th; scale=3.00; 1179x2556; 664444338)'''

select pg_temp.ok((pg_temp.open('ploya1', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'US', 1) ->> 'ok')::boolean = false, '1 Facebook link-preview robot -> ok = false, why = robot');
select pg_temp.ok((select why from public.kr8_share_opens where device = md5('dev1')) = 'robot', '1 Facebook link-preview robot -> ok = false, why = robot (why)');
select pg_temp.ok((pg_temp.open('ploya1', :thai_chrome, 'TH', 2) ->> 'ok')::boolean, '2 Thai phone, mobile Chrome -> ok = true');
select pg_temp.ok((pg_temp.open('ploya1', :thai_ig, 'TH', 3, 'https://l.instagram.com/') ->> 'ok')::boolean, '3 Thai iPhone, Instagram in-app browser -> ok = true');
select pg_temp.ok((pg_temp.open('ploya1', 'Googlebot/2.1 (+http://www.google.com/bot.html)', 'TH', 4) ->> 'ok')::boolean = false, '4 Googlebot from a Thai address -> robot');
select pg_temp.ok((pg_temp.open('ploya1', 'Google', 'US', 5) ->> 'ok')::boolean = false, '5 bare "Google" agent -> robot');
select pg_temp.ok((pg_temp.open('ploya1', 'Chrome', 'TH', 6, 'http://www.google.com') ->> 'ok')::boolean = false, '6 bare "Chrome" agent (script, seen on #74 19 Nov) -> robot');
select pg_temp.ok((select why from public.kr8_share_opens where device = md5('dev6')) = 'robot', '6 bare "Chrome" agent (script, seen on #74 19 Nov) -> robot (why)');
select pg_temp.ok((pg_temp.open('ploya1', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36', 'TH', 7) ->> 'ok')::boolean = false, '7 HeadlessChrome / Playwright -> robot');
select pg_temp.ok((pg_temp.open('ploya1', 'python-requests/2.31', 'TH', 8) ->> 'ok')::boolean = false, '8 python-requests -> robot');
select pg_temp.ok((pg_temp.open('ploya1', 'WhatsApp/2.23.20.0', 'TH', 9) ->> 'ok')::boolean = false, '9 WhatsApp preview -> robot');
select pg_temp.ok((pg_temp.open('ploya1', 'facebookexternalhit/1.1;line-poker/1.0', 'JP', 10) ->> 'ok')::boolean = false, '10 LINE link preview (line-poker) -> robot');
select pg_temp.ok((pg_temp.open('ploya1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36', 'SG', 11) ->> 'ok')::boolean = false, '11 normal browser from Singapore (VPN / datacenter) -> robot');
select pg_temp.ok((select why from public.kr8_share_opens where device = md5('dev11')) = 'robot', '11 normal browser from Singapore (VPN / datacenter) -> robot (why)');
select pg_temp.ok((pg_temp.open('ploya1', :thai_chrome, null, 12) ->> 'ok')::boolean, '12 no country given -> not judged by country, ok = true');
select pg_temp.ok((pg_temp.open('ploya1', 'Mozilla/5.0 (Linux; Android 13; Line/13.20.1) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', 'TH', 13) ->> 'ok')::boolean = false, '13 LINE in-app browser stays why = line');
select pg_temp.ok((select why from public.kr8_share_opens where device = md5('dev13')) = 'line', '13 LINE in-app browser stays why = line (why)');
-- the same phone opens Ploy's second Reel the same day -> repeat; a different member's Reel -> counts
select pg_temp.ok((pg_temp.open('ployb2', :thai_chrome, 'TH', 2) ->> 'ok')::boolean = false, '14 same phone, same member, 2nd Reel, same day -> repeat');
select pg_temp.ok((select why from public.kr8_share_opens o where device = md5('dev2') and post_id = pg_temp.u(12)) = 'repeat', '14 same phone, same member, 2nd Reel, same day -> repeat (why)');
select pg_temp.ok((pg_temp.open('nokaa1', :thai_chrome, 'TH', 2) ->> 'ok')::boolean, '15 same phone, another member''s Reel -> ok = true');
select pg_temp.ok((pg_temp.open('ploya1', :thai_chrome, 'TH', 2) ->> 'ok')::boolean = false, '16 same phone, same Reel again -> repeat (as before)');
-- switches
update public.kr8_rings_config set value = 0 where key = 'opens_th_only';
select pg_temp.ok((pg_temp.open('ploya1', :thai_chrome, 'SG', 17) ->> 'ok')::boolean, '17 opens_th_only = 0 -> a foreign phone counts again');
update public.kr8_rings_config set value = 2 where key = 'opens_device_member_day';
select pg_temp.ok((pg_temp.open('ployb2', :thai_chrome, 'TH', 3) ->> 'ok')::boolean, '18 opens_device_member_day = 2 -> a 2nd Reel of the same member counts');
select pg_temp.ok(not public.kr8_open_is_robot('Mozilla/5.0 (Linux; Android 12; CUBOT_X30) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', 'TH'), '19 Cubot phone ("bot" in the brand) is not a robot');
select pg_temp.ok((select ok and why is null from public.kr8_share_opens where session = 'old-session-000001'), '20 opens stored before 0136 are not changed');
rollback;
