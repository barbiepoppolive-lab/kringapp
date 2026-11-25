-- UNDO m213: removes everything m213 added. Run m213b_activity_ask_reply_UNDO.sql first if m213b was applied.
-- The edge function kr8-digest-mail (supabase/functions/kr8-digest-mail) can stay: with these functions gone it does nothing. Delete it in the Supabase dashboard if wanted.
select cron.unschedule(jobid) from cron.job where jobname in ('kr8_digest_evening', 'kr8_digest_mail_retry', 'kr8_tonight_pick');

drop function if exists public.kr8_answer_streak(uuid);
drop function if exists public.kr8_tonight_question();
drop function if exists public.kr8_tonight_pick();
drop function if exists public.kr8_admin_set_tonight(uuid, date);
drop table if exists public.kr8_tonight_q;

drop function if exists public.kr8_digest_unsub(text, text);
drop function if exists public.kr8_digest_mail_done(jsonb);
drop function if exists public.kr8_digest_mail_claim(integer);
drop function if exists public.kr8_digest_run(boolean);
drop function if exists public.kr8_digest_mail_kick();
drop function if exists public.kr8_digest_preview(integer);
drop function if exists public.kr8_digest_text(jsonb);
drop function if exists public.kr8_digest_counts(uuid);
drop function if exists public.kr8_last_seen(uuid);
drop table if exists public.kr8_digest_log;
drop table if exists public.kr8_digest_prefs;
drop table if exists public.kr8_line_oa_reach;

drop function if exists public.kr8_admin_first_sessions(integer);
drop function if exists public.kr8_session_beat(text);
drop table if exists public.kr8_sessions;

delete from public.kr8_rings_config where key in ('line_digest_on', 'digest_email_max', 'digest_line_month_cap', 'digest_quiet_hours',
  'activity_ask_reply_on', 'tonight_q_on');
delete from public.kr8_autopilot_kv where key = 'digest_last_run';
