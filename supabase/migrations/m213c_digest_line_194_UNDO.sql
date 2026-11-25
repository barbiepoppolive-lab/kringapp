-- UNDO m213c: back to the m213 LINE path (flagship reach table), m213 preview + run. Run as postgres.
select cron.unschedule(jobid) from cron.job where jobname = 'kr8_line_friend_check';
drop function if exists public.kr8_line_check_kick();
drop function if exists public.kr8_line_check_done(jsonb, jsonb);
drop function if exists public.kr8_line_check_claim(integer);
drop function if exists public.kr8_digest_preview(integer);
create or replace function public.kr8_digest_preview(p_limit integer default 200)
returns table(member_no integer, first_name text, user_id uuid, channel text, likes integer, replies integer, follows integer,
              last_seen timestamptz, subject text, body text, url text, why_skip text)
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
#variable_conflict use_column
declare d date := public.kr8_bkk_day(); line_used int; line_cap int;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  line_used := (select count(*)::int from public.kr8_push_outbox o where o.channel = 'line' and o.state in ('queued', 'sent')
                  and o.created_at >= date_trunc('month', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok');
  line_cap := least(public.kr8_rcfg('push_line_cap', 0), public.kr8_rcfg('digest_line_month_cap', 450));
  return query
  with mem as (
    select m.user_id, m.member_no, m.first_name, public.kr8_last_seen(m.user_id) ls, public.kr8_digest_counts(m.user_id) c
    from public.kr8_members m
    where public.kr8_is_real_member(m.user_id) and not public.kr8_minor_held(m.user_id)),
  ch as (
    select mem.*,
      case when exists (select 1 from public.kr8_push_subs s where s.user_id = mem.user_id) then 'web'
           when line_used < line_cap and exists (
                  select 1 from public.kr8_line_links ll join public.kr8_line_oa_reach x on x.line_sub = ll.line_sub
                   where ll.user_id = mem.user_id and x.ok and x.checked_at > now() - interval '30 days') then 'line'
           -- LINE-login members carry a made-up <id>@users.kringapp.com address: never mail those
           when exists (select 1 from auth.users u where u.id = mem.user_id and u.email is not null and u.email_confirmed_at is not null
                          and u.email !~* '@users\.kringapp\.com$')
                and not exists (select 1 from public.kr8_digest_prefs p where p.user_id = mem.user_id and p.email_off_at is not null) then 'email'
      end chan
    from mem)
  select ch.member_no, ch.first_name, ch.user_id, ch.chan, (ch.c ->> 'likes')::int, (ch.c ->> 'replies')::int, (ch.c ->> 'follows')::int, ch.ls,
         t ->> 'subject', t ->> 'body', t ->> 'url',
         case when (ch.c ->> 'likes')::int + (ch.c ->> 'replies')::int + (ch.c ->> 'follows')::int = 0 then 'nothing new'
              when ch.ls > now() - make_interval(hours => public.kr8_rcfg('digest_quiet_hours', 6)) then 'active recently'
              when exists (select 1 from public.kr8_digest_log l where l.user_id = ch.user_id and l.day = d) then 'already today'
              when ch.chan is null then 'no channel'
         end
  from ch cross join lateral (select public.kr8_digest_text(ch.c) t) x
  order by 12 nulls first, ch.member_no
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
end $$;
revoke execute on function public.kr8_digest_preview(integer) from public, anon;
grant execute on function public.kr8_digest_preview(integer) to authenticated;

/** The evening run (cron 19:30 Bangkok). Hard switch: line_digest_on. One summary per member per Bangkok day. */
create or replace function public.kr8_digest_run(p_force boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare r record; d date := public.kr8_bkk_day(); n_web int := 0; n_line int := 0; n_mail int := 0; q jsonb; res jsonb;
        mail_max int := public.kr8_rcfg('digest_email_max', 150); em text; mid bigint;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;   -- cron runs as postgres (admin); members never
  if public.kr8_rcfg('line_digest_on', 0) <> 1 and not coalesce(p_force, false) then return jsonb_build_object('skipped', 'switch off'); end if;
  if coalesce(p_force, false) and public.kr8_rcfg('line_digest_on', 0) <> 1 then raise exception 'KR8_DIGEST_OFF'; end if;   -- force never bypasses the switch
  perform pg_advisory_xact_lock(hashtext('kr8_digest_run'));
  for r in select * from public.kr8_digest_preview(1000) p where p.why_skip is null loop
    if r.channel = 'email' then
      if n_mail >= mail_max then continue; end if;
      select u.email into em from auth.users u where u.id = r.user_id;
      insert into public.kr8_digest_prefs (user_id) values (r.user_id) on conflict do nothing;
      insert into public.kr8_digest_log (user_id, day, channel, likes, replies, follows, subject, body, url, to_email)
      values (r.user_id, d, 'email', r.likes, r.replies, r.follows, r.subject, r.body, r.url, em) on conflict (user_id, day) do nothing;
      if found then n_mail := n_mail + 1; end if;
    else
      insert into public.kr8_digest_log (user_id, day, channel, likes, replies, follows, subject, body, url, state)
      values (r.user_id, d, r.channel, r.likes, r.replies, r.follows, r.subject, r.body, r.url, 'pushed') on conflict (user_id, day) do nothing;
      if not found then continue; end if;
      -- the existing ding pipeline (kr8_push_queue → kr8_push_outbox → kringapp.com/api/push), which also enforces push_line_cap
      q := public.kr8_push_queue('admin', r.user_id, false, 'กริ๊ง! · มีเรื่องใหม่รอคุณอยู่', left(r.body, 240), r.url,
                                 md5('digest:' || d::text || ':' || r.user_id::text)::uuid, r.channel = 'line');
      mid := (q ->> 'msg')::bigint;
      update public.kr8_digest_log set msg_id = mid, sent_at = now() where user_id = r.user_id and day = d;
      if r.channel = 'web' then n_web := n_web + 1; else n_line := n_line + 1; end if;
    end if;
  end loop;
  if n_mail > 0 then perform public.kr8_digest_mail_kick(); end if;
  res := jsonb_build_object('day', d, 'web', n_web, 'line', n_line, 'email', n_mail, 'at', now());
  insert into public.kr8_autopilot_kv (key, val) values ('digest_last_run', res::text)
    on conflict (key) do update set val = excluded.val, updated_at = now();
  return res;
end $$;
revoke execute on function public.kr8_digest_run(boolean) from public, anon, authenticated;

drop function if exists public.kr8_digest_line_room();
alter table public.kr8_push_line drop column if exists friend, drop column if exists friend_http, drop column if exists friend_checked_at;
delete from public.kr8_autopilot_kv where key = 'line_quota_194hsqbc';
update public.kr8_rings_config set note = 'm213: summary never uses LINE once this month''s LINE pushes reach this (OA free quota 500)' where key = 'digest_line_month_cap';
