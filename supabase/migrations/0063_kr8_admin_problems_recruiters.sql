-- 0063 · Admin "Problems" log + "Recruiters" credit (16 Nov 2026). Written, NOT applied.
--
-- ADDITIVE ONLY. Nothing is dropped, renamed or changed in shape; kr8_members is not touched (ref_code is never written).
--   · 2 new tables (RLS on, no policies, no grants: only the functions below read or write them):
--       kr8_ref_credits     one row per member credited by hand to a recruiter code (current state)
--       kr8_ref_credit_log  append-only audit: who credited / removed which code for which member, and when
--   · 4 new admin-only functions (each refuses with KR8_ADMIN_ONLY unless kr8_is_admin()):
--       kr8_admin_problem_log(p_hours, p_include_test)   funnel per Bangkok day, failures by kind+code, user agents, latest 50 rows
--       kr8_admin_recruiters(p_include_test)             one row per recruiter code (link OR hand credit) + members without a code + audit
--       kr8_admin_credit_ref(p_user, p_ref)              credit a member who joined without a ref link (refused if ref_code is set)
--       kr8_admin_uncredit_ref(p_user)                   remove a hand credit (kept in the audit log)
-- Credit lives in its own table (not a kr8_members column) so no member-facing function can ever show who credited whom.
-- Recruiter totals count ref_code OR credited code. Existing functions (kr8_admin_attribution, checklist, rewards) are unchanged:
-- they still count ref_code only.
--
-- UNDO (safe at any time; the live app never reads any of this):
--   drop function if exists public.kr8_admin_problem_log(int, boolean), public.kr8_admin_recruiters(boolean),
--     public.kr8_admin_credit_ref(uuid, text), public.kr8_admin_uncredit_ref(uuid);
--   drop table if exists public.kr8_ref_credit_log, public.kr8_ref_credits;

begin;

-- ───────────────────────── recruiter credit tables ─────────────────────────
create table if not exists public.kr8_ref_credits (
  user_id uuid primary key references public.kr8_members(user_id) on delete cascade,
  ref_code text not null check (ref_code ~ '^[a-z0-9][a-z0-9_-]{1,29}$'),
  credited_by uuid,
  credited_by_email text,
  credited_at timestamptz not null default now()
);
alter table public.kr8_ref_credits enable row level security;   -- no policies

create table if not exists public.kr8_ref_credit_log (
  id bigserial primary key,
  user_id uuid not null,
  action text not null check (action in ('credit', 'remove')),
  ref_code text,
  prev_code text,
  by_user uuid,
  by_email text,
  at timestamptz not null default now()
);
create index if not exists kr8_ref_credit_log_at on public.kr8_ref_credit_log (at desc);
alter table public.kr8_ref_credit_log enable row level security;   -- no policies

-- ───────────────────────── Problems ─────────────────────────
-- "picked" is inferred: a clip got past the checks when the phone logged reel_trim open/done/fail, a publish failure,
-- or a Reel was posted. A short clip that was picked and then abandoned before Post leaves no trace, so it is a lower bound.
create or replace function public.kr8_admin_problem_log(p_hours int default 24, p_include_test boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  since timestamptz := now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 24), 24 * 90)));
  r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  with ev as (
    select e.*, (e.created_at at time zone 'Asia/Bangkok')::date as d,
           (e.kind in ('reel_pick_fail', 'reel_publish_fail', 'verify_fail', 'verify_cam_fail')
            or (e.kind = 'reel_trim' and coalesce(e.code, '') like 'fail:%')
            or e.kind not in ('reel_open', 'reel_trim', 'reel_pick_fail', 'reel_publish_fail', 'verify_fail', 'verify_cam_fail')) as is_fail
    from public.kr8_client_events e
    where e.created_at > since
      and (p_include_test or e.user_id is null or not public.kr8_is_test_member(e.user_id))
  ),
  posted as (
    select p.author as user_id, (p.created_at at time zone 'Asia/Bangkok')::date as d
    from public.kr8_posts p
    where p.kind = 'reel' and p.created_at > since
      and (p_include_test or not public.kr8_is_test_member(p.author))
  ),
  picks as (
    select user_id, d from ev
     where kind = 'reel_publish_fail' or (kind = 'reel_trim' and (code in ('open', 'done') or coalesce(code, '') like 'fail:%'))
    union all
    select user_id, d from posted
  ),
  days as (select d from ev union select d from posted)
  select jsonb_build_object(
    'since', since,
    'hours', greatest(1, least(coalesce(p_hours, 24), 24 * 90)),
    'totals', jsonb_build_object(
      'opened', (select count(distinct user_id) from ev where kind = 'reel_open')::int,
      'opens', (select count(*) from ev where kind = 'reel_open')::int,
      'pick_failed', (select count(distinct user_id) from ev where kind = 'reel_pick_fail')::int,
      'picked', (select count(distinct user_id) from picks)::int,
      'posted', (select count(distinct user_id) from posted)::int,
      'reels', (select count(*) from posted)::int,
      'failures', (select count(*) from ev where is_fail)::int,
      'failed_people', (select count(distinct user_id) from ev where is_fail)::int),
    'days', coalesce((select jsonb_agg(jsonb_build_object(
        'day', x.d,
        'opened', (select count(distinct user_id) from ev where kind = 'reel_open' and ev.d = x.d),
        'opens', (select count(*) from ev where kind = 'reel_open' and ev.d = x.d),
        'pick_failed', (select count(distinct user_id) from ev where kind = 'reel_pick_fail' and ev.d = x.d),
        'picked', (select count(distinct user_id) from picks where picks.d = x.d),
        'posted', (select count(distinct user_id) from posted where posted.d = x.d),
        'reels', (select count(*) from posted where posted.d = x.d)) order by x.d desc) from days x), '[]'::jsonb),
    'groups', coalesce((select jsonb_agg(g order by (g ->> 'n')::int desc, g ->> 'last_at' desc) from (
        select jsonb_build_object('kind', kind, 'code', code, 'n', count(*), 'people', count(distinct user_id),
                                  'last_at', max(created_at), 'details', (array_agg(distinct left(detail, 80)) filter (where detail is not null))[1:3]) as g
        from ev where is_fail group by kind, code) s), '[]'::jsonb),
    'agents', coalesce((select jsonb_agg(jsonb_build_object('ua', ua, 'n', n, 'fails', f, 'people', pp)) from (
        select ua, count(*) as n, count(*) filter (where is_fail) as f, count(distinct user_id) as pp
        from ev group by ua order by count(*) filter (where is_fail) desc, count(*) desc limit 60) a), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('at', l.created_at, 'member_no', m.member_no, 'first_name', m.first_name,
        'kind', l.kind, 'code', l.code, 'detail', l.detail, 'ua', l.ua, 'fail', l.is_fail) order by l.created_at desc)
      from (select * from ev where kind <> 'reel_open' order by created_at desc limit 50) l
      left join public.kr8_members m on m.user_id = l.user_id), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.kr8_admin_problem_log(int, boolean) from public, anon;
grant execute on function public.kr8_admin_problem_log(int, boolean) to authenticated;

-- ───────────────────────── Recruiters ─────────────────────────
create or replace function public.kr8_admin_recruiters(p_include_test boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;

  with m as (
    select m.user_id, m.member_no, m.first_name, m.created_at, nullif(btrim(m.src_code), '') as src_code, coalesce(m.verified, false) as verified,
           nullif(lower(btrim(m.ref_code)), '') as link_code, c.ref_code as credit_code, c.credited_by_email, c.credited_at,
           coalesce(nullif(lower(btrim(m.ref_code)), ''), c.ref_code) as code
    from public.kr8_members m left join public.kr8_ref_credits c on c.user_id = m.user_id
    where p_include_test or not public.kr8_is_test_member(m.user_id)
  ),
  reels as (
    select p.author, count(*)::int as approved
    from public.kr8_posts p
    where p.kind = 'reel' and p.status = 'approved' and not coalesce(p.hidden, false)
    group by p.author
  ),
  mm as (select m.*, coalesce(r.approved, 0) as approved from m left join reels r on r.author = m.user_id),
  person as (
    select mm.*, jsonb_build_object('user_id', user_id, 'member_no', member_no, 'first_name', first_name, 'joined_at', created_at,
      'src_code', src_code, 'verified', verified, 'approved_reels', approved,
      'how', case when link_code is not null then 'link' when credit_code is not null then 'credited' else 'none' end,
      'credited_by', credited_by_email, 'credited_at', credited_at) as j
    from mm
  )
  select jsonb_build_object(
    'codes', coalesce((select jsonb_agg(x order by (x ->> 'signups')::int desc, x ->> 'code') from (
        select jsonb_build_object('code', code,
          'signups', count(*), 'via_link', count(*) filter (where link_code is not null), 'credited', count(*) filter (where link_code is null),
          'posted', count(*) filter (where approved > 0), 'verified', count(*) filter (where verified),
          'members', jsonb_agg(j order by created_at desc)) as x
        from person where code is not null group by code) s), '[]'::jsonb),
    'no_code', coalesce((select jsonb_agg(j order by created_at desc) from person where code is null), '[]'::jsonb),
    'log', coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'action', l.action, 'ref_code', l.ref_code, 'prev_code', l.prev_code,
        'by', l.by_email, 'member_no', mb.member_no, 'first_name', mb.first_name) order by l.at desc, l.id desc)
      from (select * from public.kr8_ref_credit_log order by at desc, id desc limit 30) l left join public.kr8_members mb on mb.user_id = l.user_id), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.kr8_admin_recruiters(boolean) from public, anon;
grant execute on function public.kr8_admin_recruiters(boolean) to authenticated;

create or replace function public.kr8_admin_credit_ref(p_user uuid, p_ref text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  code text := lower(btrim(coalesce(p_ref, '')));
  link text;
  prev text;
  who uuid := auth.uid();
  mail text;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  if code !~ '^[a-z0-9][a-z0-9_-]{1,29}$' then raise exception 'KR8_BAD_REF'; end if;
  select nullif(btrim(m.ref_code), '') into link from public.kr8_members m where m.user_id = p_user for update;
  if not found then raise exception 'KR8_NO_MEMBER'; end if;
  if link is not null then raise exception 'KR8_HAS_REF'; end if;   -- joined with a link: that code stays, never overwritten
  select u.email into mail from auth.users u where u.id = who;
  select c.ref_code into prev from public.kr8_ref_credits c where c.user_id = p_user;
  insert into public.kr8_ref_credits (user_id, ref_code, credited_by, credited_by_email, credited_at)
  values (p_user, code, who, mail, now())
  on conflict (user_id) do update set ref_code = excluded.ref_code, credited_by = excluded.credited_by,
    credited_by_email = excluded.credited_by_email, credited_at = excluded.credited_at;
  insert into public.kr8_ref_credit_log (user_id, action, ref_code, prev_code, by_user, by_email) values (p_user, 'credit', code, prev, who, mail);
  return jsonb_build_object('user_id', p_user, 'ref_code', code, 'prev_code', prev, 'credited_by', mail, 'credited_at', now());
end $$;
revoke all on function public.kr8_admin_credit_ref(uuid, text) from public, anon;
grant execute on function public.kr8_admin_credit_ref(uuid, text) to authenticated;

create or replace function public.kr8_admin_uncredit_ref(p_user uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prev text;
  who uuid := auth.uid();
  mail text;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  delete from public.kr8_ref_credits where user_id = p_user returning ref_code into prev;
  if prev is null then return false; end if;
  select u.email into mail from auth.users u where u.id = who;
  insert into public.kr8_ref_credit_log (user_id, action, ref_code, prev_code, by_user, by_email) values (p_user, 'remove', null, prev, who, mail);
  return true;
end $$;
revoke all on function public.kr8_admin_uncredit_ref(uuid) from public, anon;
grant execute on function public.kr8_admin_uncredit_ref(uuid) to authenticated;

commit;
