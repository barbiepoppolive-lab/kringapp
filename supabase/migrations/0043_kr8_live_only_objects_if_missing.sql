-- 0043 · Objects that exist on LIVE but were never saved as a migration (audit P2-10 / P2-7, 16 Nov 2026).
--
-- Live already has all three (checked 17 Nov: the live API answers "permission denied", not "not found", for each):
--   · table    public.link_visits            (site visit counter, written by /, /locals/, /partners/, /app/ via the anon key)
--   · function public.kr8_is_test_member(uuid) (keeps test/demo members away from real ones: feed, boards, prizes, admin lists)
--   · function public.kr8_admin_new_members_today() (admin To-do "New members today" line)
--
-- SAFE ON LIVE: every object is created ONLY IF IT IS MISSING. On live this file changes nothing (the live definitions stay
-- exactly as they are). It exists so a fresh copy of the repo (test databases, audits) builds a working Kring database.
-- The bodies below are reconstructions from how the later migrations and the app use them; if live differs, live wins.
-- Re-runnable.
--
-- UNDO (test databases only): drop function if exists public.kr8_admin_new_members_today(); drop function if exists
--   public.kr8_is_test_member(uuid); drop table if exists public.link_visits;

create table if not exists public.link_visits (
  id bigserial primary key,
  ref text check (ref is null or ref ~ '^[a-z0-9_-]{1,40}$'),
  path text check (path is null or length(path) <= 200),
  referrer text check (referrer is null or length(referrer) <= 200),
  session_id text check (session_id is null or session_id ~ '^[a-z0-9]{1,64}$'),
  country text,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.link_visits enable row level security;
create index if not exists link_visits_created on public.link_visits (created_at);
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'link_visits' and policyname = 'link_visits_insert') then
    create policy link_visits_insert on public.link_visits for insert to anon, authenticated with check (true);
  end if;
end $$;
revoke all on public.link_visits from anon, authenticated;
grant insert (ref, path, referrer, session_id) on public.link_visits to anon, authenticated;

do $$ begin
  if to_regprocedure('public.kr8_is_test_member(uuid)') is null then
    -- test/demo members: first name with "test", join code test1 / perf / demo, or a demo-…@kringapp.com sign-in
    execute $f$
      create function public.kr8_is_test_member(p_user uuid) returns boolean
      language sql stable security definer set search_path = public, pg_temp as $b$
        select coalesce((
          select m.first_name ilike '%test%'
              or lower(coalesce(m.ref_code, '')) in ('test1', 'perf', 'demo')
              or lower(coalesce(m.src_code, '')) in ('test1', 'perf', 'demo')
              or exists (select 1 from auth.users u where u.id = m.user_id and lower(coalesce(u.email, '')) like 'demo-%@kringapp.com')
          from public.kr8_members m where m.user_id = p_user), false)
      $b$ $f$;
    revoke all on function public.kr8_is_test_member(uuid) from public, anon, authenticated;
  end if;

  if to_regprocedure('public.kr8_admin_new_members_today()') is null then
    execute $f$
      create function public.kr8_admin_new_members_today() returns jsonb
      language plpgsql stable security definer set search_path = public, pg_temp as $b$
      declare d0 timestamptz := ((now() at time zone 'Asia/Bangkok')::date)::timestamp at time zone 'Asia/Bangkok';
      begin
        if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
        return (select jsonb_build_object(
          'real', count(*) filter (where not public.kr8_is_test_member(m.user_id)),
          'test', count(*) filter (where public.kr8_is_test_member(m.user_id)))
          from public.kr8_members m where m.created_at >= d0);
      end $b$ $f$;
    revoke all on function public.kr8_admin_new_members_today() from public, anon;
    grant execute on function public.kr8_admin_new_members_today() to authenticated;
  end if;
end $$;
