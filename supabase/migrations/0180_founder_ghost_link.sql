-- 0180 · Founder ghost bookmark (20 Nov 2026): kringapp.com/app/?me=ghost (or kringapp.com/ghost) is a PERMANENT link the founder
--        keeps on his phone. The link itself grants nothing:
--   · already signed in as #117 on that browser → the app opens on the Feed (ghost mode is already on for #117, 0061)
--   · otherwise the app asks the Edge Function `founder-ghost` to email #117 a sign-in code (Supabase auth /otp,
--     create_user false). The function looks the address up here, server-side; the app never sees it.
--     The code is typed into that same browser, so the sign-in stays on the device the bookmark lives on (persistent session).
--
-- ADDITIVE ONLY: one new table (no client access at all) and two new functions. Nothing existing changes.
--   kr8_founder_ghost_gate(kind)  service_role only. 'send' max 3 per 24 h, 'verify' max 10 per 24 h (each call is logged
--                                 first, so a burst cannot get past the limit). Returns #117's auth email, never to a browser.
--   kr8_am_founder()              signed-in only: true when the caller IS #117. Says nothing about anyone else.
-- UNDO: 0180_founder_ghost_link_UNDO.sql

begin;

create table if not exists public.kr8_founder_ghost_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('send', 'verify'))
);
create index if not exists kr8_founder_ghost_log_at on public.kr8_founder_ghost_log (kind, at desc);
alter table public.kr8_founder_ghost_log enable row level security;
revoke all on table public.kr8_founder_ghost_log from public, anon, authenticated;
revoke all on sequence public.kr8_founder_ghost_log_id_seq from public, anon, authenticated;

create or replace function public.kr8_founder_ghost_gate(p_kind text)
returns text language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  n int;
  e text;
begin
  if p_kind is null or p_kind not in ('send', 'verify') then raise exception 'KR8_BAD'; end if;
  perform pg_advisory_xact_lock(117117);   -- one at a time, so three quick taps can never become four emails
  select count(*) into n from public.kr8_founder_ghost_log where kind = p_kind and at > now() - interval '24 hours';
  if n >= (case p_kind when 'send' then 3 else 10 end) then raise exception 'KR8_LIMIT'; end if;
  select u.email into e
    from public.kr8_members m join auth.users u on u.id = m.user_id
   where m.member_no = 117 and m.ghost
   limit 1;
  if e is null or e = '' then raise exception 'KR8_NO_FOUNDER'; end if;
  insert into public.kr8_founder_ghost_log (kind) values (p_kind);
  return e;
end $$;
revoke all on function public.kr8_founder_ghost_gate(text) from public, anon, authenticated;
grant execute on function public.kr8_founder_ghost_gate(text) to service_role;

create or replace function public.kr8_am_founder()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null
     and exists (select 1 from public.kr8_members m where m.member_no = 117 and m.user_id = auth.uid())
$$;
revoke all on function public.kr8_am_founder() from public, anon;
grant execute on function public.kr8_am_founder() to authenticated;

commit;
