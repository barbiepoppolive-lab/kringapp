select cron.unschedule('kr8_device_links');
drop function if exists public.kr8_device_links_kick();
drop function if exists public.kr8_device_link_settle(uuid, uuid, numeric, text);
drop function if exists public.kr8_second_account_warning(uuid, int);
drop function if exists public.kr8_device_links_todo(int);
-- (prize bans / dismissals the robot already made stay; list them with: select * from kr8_account_links where detail ? 'robot')
