-- m213c (25 Nov 2026): the evening summary's LINE path moves to OA @194hsqbc ("Kring! Café · กริ๊ง!"), the OA under the same
-- LINE provider as Kring's LINE Login (the flagship @266jjwqh reaches 0 members). Still SWITCHED OFF (line_digest_on = 0).
--   * Friendship is confirmed per member by a free profile lookup (sends nothing) with the @194hsqbc token, done by the
--     edge function kr8-digest-mail /line-check (secret LINE_194_TOKEN), cached on kr8_push_line (friend, friend_checked_at).
--     Cron 18:45 Bangkok refreshes anything older than 3 days. The same call stores the OA's monthly quota use.
--   * Channel order: web push (app dings) → email (real address) → LINE (confirmed friend + quota room).
--     So LINE is the main channel for LINE-login members (no real email); email stays for everyone else.
--   * Monthly hard stop: LINE room = min(push_line_cap, digest_line_month_cap, OA limit − 50) − max(this month's LINE outbox,
--     the OA's own usage count). The run also stops LINE once that room is used up.
--   * Additive: 3 new columns on kr8_push_line (the push worker does not read them), new functions, one new cron job.
--     kr8_digest_preview / kr8_digest_run (both new in m213) are replaced; UNDO: m213c_digest_line_194_UNDO.sql.
-- The existing push worker (kringapp.com/api/push) already sends LINE with the @194hsqbc token (see report 25 Nov).

alter table public.kr8_push_line
  add column if not exists friend boolean,
  add column if not exists friend_http integer,
  add column if not exists friend_checked_at timestamptz;

update public.kr8_rings_config set note = 'm213c: summary LINE cap per month (OA @194hsqbc, free quota 500; also capped at OA limit − 50)'
 where key = 'digest_line_month_cap';

/** Edge function only: LINE user ids of linked members whose friendship with @194hsqbc is unknown or older than 3 days. */
create or replace function public.kr8_line_check_claim(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if auth.uid() is not null or not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return coalesce((select jsonb_agg(s) from (
    select distinct l.line_sub s from public.kr8_line_links l
      left join public.kr8_push_line p on p.line_sub = l.line_sub
     where l.line_sub ~ '^U[0-9a-f]{32}$' and (p.friend_checked_at is null or p.friend_checked_at < now() - interval '3 days')
     limit greatest(1, least(coalesce(p_limit, 100), 300))) x), '[]'::jsonb);
end $$;
revoke execute on function public.kr8_line_check_claim(integer) from public, anon, authenticated;
grant execute on function public.kr8_line_check_claim(integer) to service_role;

/** Edge function only: [{sub, http}] (200 = friend, 404 = not a friend / blocked) and the OA quota {limit, used}. */
create or replace function public.kr8_line_check_done(p_results jsonb, p_quota jsonb default null)
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare x jsonb; n int := 0;
begin
  if auth.uid() is not null or not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) limit 300 loop
    continue when coalesce(x ->> 'sub', '') !~ '^U[0-9a-f]{32}$' or (x ->> 'http') not in ('200', '404');
    insert into public.kr8_push_line (line_sub, friend, friend_http, friend_checked_at)
    values (x ->> 'sub', (x ->> 'http') = '200', (x ->> 'http')::int, now())
    on conflict (line_sub) do update set friend = excluded.friend, friend_http = excluded.friend_http, friend_checked_at = now();
    n := n + 1;
  end loop;
  if p_quota is not null and (p_quota ->> 'limit') ~ '^\d{1,6}$' and (p_quota ->> 'used') ~ '^\d{1,6}$' then
    insert into public.kr8_autopilot_kv (key, val)
    values ('line_quota_194hsqbc', jsonb_build_object('limit', (p_quota ->> 'limit')::int, 'used', (p_quota ->> 'used')::int,
            'month', to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM'), 'at', now())::text)
    on conflict (key) do update set val = excluded.val, updated_at = now();
  end if;
  return n;
end $$;
revoke execute on function public.kr8_line_check_done(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.kr8_line_check_done(jsonb, jsonb) to service_role;

/** LINE messages the summary may still use this month (≥ 0). */
create or replace function public.kr8_digest_line_room()
returns integer language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare q jsonb; used_outbox int; used_oa int := 0; cap int;
begin
  used_outbox := (select count(*)::int from public.kr8_push_outbox o where o.channel = 'line' and o.state in ('queued', 'sent')
                    and o.created_at >= date_trunc('month', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok');
  cap := least(public.kr8_rcfg('push_line_cap', 0), public.kr8_rcfg('digest_line_month_cap', 450));
  begin q := (select val::jsonb from public.kr8_autopilot_kv where key = 'line_quota_194hsqbc'); exception when others then q := null; end;
  if q is null or q ->> 'month' is distinct from to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM') then
    cap := least(cap, 450);                       -- no fresh OA count: assume the free 500 and keep 50 spare
  else
    cap := least(cap, (q ->> 'limit')::int - 50);
    used_oa := (q ->> 'used')::int;
  end if;
  return greatest(0, cap - greatest(used_outbox, used_oa));
end $$;
revoke execute on function public.kr8_digest_line_room() from public, anon, authenticated;

drop function if exists public.kr8_digest_preview(integer);
/** Who would get a summary right now, by which channel, and the exact words. Admin only; changes nothing. */
create or replace function public.kr8_digest_preview(p_limit integer default 200)
returns table(member_no integer, first_name text, user_id uuid, channel text, likes integer, replies integer, follows integer,
              last_seen timestamptz, subject text, body text, url text, why_skip text, has_email boolean, line_friend boolean)
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
#variable_conflict use_column
declare d date := public.kr8_bkk_day(); room int := public.kr8_digest_line_room();
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return query
  with mem as (
    select m.user_id, m.member_no, m.first_name, public.kr8_last_seen(m.user_id) ls, public.kr8_digest_counts(m.user_id) c,
      -- LINE-login members carry a made-up <id>@users.kringapp.com address: never mail those
      exists (select 1 from auth.users u where u.id = m.user_id and u.email is not null and u.email_confirmed_at is not null
                and u.email !~* '@users\.kringapp\.com$')
        and not exists (select 1 from public.kr8_digest_prefs p where p.user_id = m.user_id and p.email_off_at is not null) em,
      exists (select 1 from public.kr8_line_links ll join public.kr8_push_line x on x.line_sub = ll.line_sub
               where ll.user_id = m.user_id and x.friend and x.friend_checked_at > now() - interval '30 days') lf
    from public.kr8_members m
    where public.kr8_is_real_member(m.user_id) and not public.kr8_minor_held(m.user_id)),
  ch as (
    select mem.*,
      case when exists (select 1 from public.kr8_push_subs s where s.user_id = mem.user_id) then 'web'
           when mem.em then 'email'
           when mem.lf and room > 0 then 'line'
      end chan
    from mem)
  select ch.member_no, ch.first_name, ch.user_id, ch.chan, (ch.c ->> 'likes')::int, (ch.c ->> 'replies')::int, (ch.c ->> 'follows')::int, ch.ls,
         t ->> 'subject', t ->> 'body', t ->> 'url',
         case when (ch.c ->> 'likes')::int + (ch.c ->> 'replies')::int + (ch.c ->> 'follows')::int = 0 then 'nothing new'
              when ch.ls > now() - make_interval(hours => public.kr8_rcfg('digest_quiet_hours', 6)) then 'active recently'
              when exists (select 1 from public.kr8_digest_log l where l.user_id = ch.user_id and l.day = d) then 'already today'
              when ch.chan is null and ch.lf then 'LINE quota full'
              when ch.chan is null then 'no channel'
         end,
         ch.em, ch.lf
  from ch cross join lateral (select public.kr8_digest_text(ch.c) t) x
  order by 12 nulls first, ch.member_no
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
end $$;
revoke execute on function public.kr8_digest_preview(integer) from public, anon;
grant execute on function public.kr8_digest_preview(integer) to authenticated;

/** The evening run (cron 19:30 Bangkok). Hard switch: line_digest_on. One summary per member per Bangkok day.
 *  m213c: LINE stops for the night once the month's LINE room is used up. */
create or replace function public.kr8_digest_run(p_force boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare r record; d date := public.kr8_bkk_day(); n_web int := 0; n_line int := 0; n_mail int := 0; q jsonb; res jsonb;
        mail_max int := public.kr8_rcfg('digest_email_max', 150); em text; mid bigint; room int;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;   -- cron runs as postgres (admin); members never
  if public.kr8_rcfg('line_digest_on', 0) <> 1 and not coalesce(p_force, false) then return jsonb_build_object('skipped', 'switch off'); end if;
  if coalesce(p_force, false) and public.kr8_rcfg('line_digest_on', 0) <> 1 then raise exception 'KR8_DIGEST_OFF'; end if;   -- force never bypasses the switch
  perform pg_advisory_xact_lock(hashtext('kr8_digest_run'));
  room := public.kr8_digest_line_room();
  for r in select * from public.kr8_digest_preview(1000) p where p.why_skip is null loop
    if r.channel = 'email' then
      if n_mail >= mail_max then continue; end if;
      select u.email into em from auth.users u where u.id = r.user_id;
      insert into public.kr8_digest_prefs (user_id) values (r.user_id) on conflict do nothing;
      insert into public.kr8_digest_log (user_id, day, channel, likes, replies, follows, subject, body, url, to_email)
      values (r.user_id, d, 'email', r.likes, r.replies, r.follows, r.subject, r.body, r.url, em) on conflict (user_id, day) do nothing;
      if found then n_mail := n_mail + 1; end if;
    else
      if r.channel = 'line' and n_line >= room then continue; end if;   -- monthly hard stop (≥ 50 messages always left spare)
      insert into public.kr8_digest_log (user_id, day, channel, likes, replies, follows, subject, body, url, state)
      values (r.user_id, d, r.channel, r.likes, r.replies, r.follows, r.subject, r.body, r.url, 'pushed') on conflict (user_id, day) do nothing;
      if not found then continue; end if;
      -- the existing ding pipeline (kr8_push_queue → kr8_push_outbox → kringapp.com/api/push, LINE via @194hsqbc), which also enforces push_line_cap
      q := public.kr8_push_queue('admin', r.user_id, false, 'กริ๊ง! · มีเรื่องใหม่รอคุณอยู่', left(r.body, 240), r.url,
                                 md5('digest:' || d::text || ':' || r.user_id::text)::uuid, r.channel = 'line');
      mid := (q ->> 'msg')::bigint;
      update public.kr8_digest_log set msg_id = mid, sent_at = now() where user_id = r.user_id and day = d;
      if r.channel = 'web' then n_web := n_web + 1; else n_line := n_line + 1; end if;
    end if;
  end loop;
  if n_mail > 0 then perform public.kr8_digest_mail_kick(); end if;
  res := jsonb_build_object('day', d, 'web', n_web, 'line', n_line, 'email', n_mail, 'line_room_before', room, 'at', now());
  insert into public.kr8_autopilot_kv (key, val) values ('digest_last_run', res::text)
    on conflict (key) do update set val = excluded.val, updated_at = now();
  return res;
end $$;
revoke execute on function public.kr8_digest_run(boolean) from public, anon, authenticated;

/** Poke kr8-digest-mail /line-check (friendship + quota refresh; LINE profile lookups are free and send nothing). */
create or replace function public.kr8_line_check_kick()
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'notify_hook_secret' limit 1;
  if k is null then return; end if;
  perform net.http_post(url := 'https://pedxoxpammnyfnizljyj.supabase.co/functions/v1/kr8-digest-mail/line-check',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', k), body := '{}'::jsonb, timeout_milliseconds := 60000);
exception when others then return;
end $$;
revoke execute on function public.kr8_line_check_kick() from public, anon, authenticated;

select cron.schedule('kr8_line_friend_check', '45 11 * * *', 'select public.kr8_line_check_kick()');   -- 18:45 Bangkok
