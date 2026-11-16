-- 0058 (16 Nov): phone-side failures we could not see before (Reel pick/upload, face check). Additive only.
create table if not exists public.kr8_client_events (
  id bigserial primary key,
  user_id uuid,
  kind text not null,
  code text,
  detail text,
  ua text,
  created_at timestamptz not null default now()
);
create index if not exists kr8_client_events_at on public.kr8_client_events (created_at desc);
alter table public.kr8_client_events enable row level security;   -- no policies: only the functions below touch it

create or replace function public.kr8_log_client(p_kind text, p_code text default null, p_detail text default null, p_ua text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null or p_kind is null or p_kind !~ '^[a-z_]{2,30}$' then return; end if;
  if (select count(*) from public.kr8_client_events where user_id = uid and created_at > now() - interval '1 hour') >= 60 then return; end if;
  insert into public.kr8_client_events (user_id, kind, code, detail, ua)
  values (uid, p_kind, left(p_code, 60), left(p_detail, 300), left(p_ua, 160));
end $$;
revoke all on function public.kr8_log_client(text, text, text, text) from public;
grant execute on function public.kr8_log_client(text, text, text, text) to authenticated;

create or replace function public.kr8_admin_client_events(p_days int default 7)
returns table (at timestamptz, member_no int, first_name text, kind text, code text, detail text, ua text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return query select e.created_at, m.member_no, m.first_name, e.kind, e.code, e.detail, e.ua
    from public.kr8_client_events e left join public.kr8_members m on m.user_id = e.user_id
   where e.created_at > now() - make_interval(days => greatest(1, least(p_days, 90)))
   order by e.created_at desc limit 500;
end $$;
revoke all on function public.kr8_admin_client_events(int) from public;
grant execute on function public.kr8_admin_client_events(int) to authenticated;
