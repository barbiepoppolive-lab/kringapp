-- 0160 (20 Nov): chat "unread" remembered on the server.
-- Before: kr8_inbox counted a thread as unread while it had messages newer than the member's own last reply, so a Kring Team
-- message the member read but never answered (warnings, reward notes) kept the red dot forever, and the dot meant nothing.
-- Now: opening a thread calls kr8_mark_thread_read; unread = messages from the other side newer than max(my last reply, my last read).
create table if not exists public.kr8_thread_reads (
  thread_id uuid not null references public.kr8_threads(id) on delete cascade,
  user_id uuid not null,
  read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
alter table public.kr8_thread_reads enable row level security;
revoke all on public.kr8_thread_reads from anon, authenticated;

create or replace function public.kr8_mark_thread_read(p_thread uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_threads t where t.id = p_thread and uid in (t.user_a, t.user_b)) then return; end if;
  insert into public.kr8_thread_reads (thread_id, user_id, read_at) values (p_thread, uid, now())
  on conflict (thread_id, user_id) do update set read_at = excluded.read_at;
end $$;
revoke all on function public.kr8_mark_thread_read(uuid) from public, anon;
grant execute on function public.kr8_mark_thread_read(uuid) to authenticated;

create or replace function public.kr8_inbox()
 returns table(thread_id uuid, status text, opened_by_me boolean, other_id uuid, other_name text, other_photo text, other_langs text[], other_verified boolean, other_area text, last_body text, last_sender_me boolean, last_at timestamp with time zone, unread integer)
 language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select t.id, t.status, t.opened_by = auth.uid(), o.user_id, o.first_name, o.photo, o.langs, o.verified, o.area,
         lm.body, lm.sender = auth.uid(), t.last_at,
         (select count(*)::int from public.kr8_messages mm where mm.thread_id = t.id and mm.sender <> auth.uid()
            and mm.created_at > greatest(
              coalesce((select max(m2.created_at) from public.kr8_messages m2 where m2.thread_id = t.id and m2.sender = auth.uid()), 'epoch'),
              coalesce((select r.read_at from public.kr8_thread_reads r where r.thread_id = t.id and r.user_id = auth.uid()), 'epoch')))
  from public.kr8_threads t
  join public.kr8_members o on o.user_id = case when t.user_a = auth.uid() then t.user_b else t.user_a end
  left join lateral (select body, sender from public.kr8_messages m where m.thread_id = t.id order by m.id desc limit 1) lm on true
  where auth.uid() in (t.user_a, t.user_b) and not public.kr8_is_blocked(t.user_a, t.user_b)
  order by t.last_at desc
  limit 200
$function$;
