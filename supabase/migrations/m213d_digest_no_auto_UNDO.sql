-- UNDO m213d: the m213c preview and the m213 mail claim, exactly as before.
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

create or replace function public.kr8_digest_mail_claim(p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare r jsonb;
begin
  if auth.uid() is not null or not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if public.kr8_rcfg('line_digest_on', 0) <> 1 then return '[]'::jsonb; end if;   -- switched off = nothing leaves, even if rows wait
  with c as (
    select l.id from public.kr8_digest_log l
     where l.state = 'queued' and l.channel = 'email' and l.tries < 3 and (l.claimed_at is null or l.claimed_at < now() - interval '5 minutes')
       and l.day = public.kr8_bkk_day()                                 -- yesterday's leftovers are never sent late
       and not exists (select 1 from public.kr8_digest_prefs p where p.user_id = l.user_id and p.email_off_at is not null)
     order by l.id limit greatest(1, least(coalesce(p_limit, 25), 50)) for update skip locked),
  u as (update public.kr8_digest_log l set claimed_at = now(), tries = l.tries + 1 from c where l.id = c.id
        returning l.id, l.user_id, l.to_email, l.subject, l.body, l.url)
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'to', u.to_email, 'subject', u.subject, 'body', u.body, 'url', u.url,
           'token', (select p.token from public.kr8_digest_prefs p where p.user_id = u.user_id))), '[]'::jsonb) into r from u;
  return r;
end $$;
revoke execute on function public.kr8_digest_mail_claim(integer) from public, anon, authenticated;
grant execute on function public.kr8_digest_mail_claim(integer) to service_role;
