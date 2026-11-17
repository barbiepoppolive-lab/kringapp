-- 0079 (17 Nov 2026, founder decision): members agree that Kring may feature their posts in Kring's own promotion.
--
-- Terms §4 (version member-2026-11-17) now lets Kring use members' posts, Reels, captions, first name, area and profile photo to
-- promote Kring on its own channels and ads. New members tick an explicit "I agree…" box when they make their card; existing
-- members see a one-time "We updated our Terms" dialog. Nobody is locked out for not agreeing: their content is simply never used.
--
-- PRIVACY (Thai PDPA s.19): consent for marketing use must be clear, recorded and withdrawable. So:
--   * every agreement / switch change is a row in kr8_terms_log (member, terms version, what, where, time). Insert-only for the
--     member (own rows, no update/delete), readable by admins only.
--   * kr8_members.promo_ok: NULL = never agreed (= NOT used), true = may feature, false = turned off. Agreeing to the Terms turns it
--     on only if the member never turned it off before (a "no" is never overwritten by a later Terms update).
--   * kr8_promo_ok_members (view, SQL editor only) and kr8_admin_promo_members() (admins in the app) list who may be featured RIGHT
--     NOW. Check it before using any clip. Ghost-mode, Kring Team and test members are left out.
--
-- ADDITIVE + RE-RUNNABLE. Nothing existing is changed (kr8_accept_terms stays for older app builds).
-- UNDO: drop view kr8_promo_ok_members; drop function kr8_agree_terms(text, text), kr8_set_promo(boolean), kr8_promo_get(),
--       kr8_admin_promo_members(), kr8_promo_terms_min(); drop table kr8_terms_log; alter table kr8_members drop column promo_ok,
--       drop column promo_ok_at;
begin;

alter table public.kr8_members add column if not exists promo_ok boolean;
alter table public.kr8_members add column if not exists promo_ok_at timestamptz;

create table if not exists public.kr8_terms_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null check (terms_version ~ '^[a-z0-9-]{3,40}$'),
  kind text not null check (kind in ('agree', 'promo_on', 'promo_off')),
  promo boolean not null,
  source text not null check (source in ('signup', 'update', 'settings')),
  at timestamptz not null default now()
);
create index if not exists kr8_terms_log_user on public.kr8_terms_log (user_id, at desc);
alter table public.kr8_terms_log enable row level security;
revoke all on public.kr8_terms_log from public, anon, authenticated;
-- the member may only ADD their own rows (time is always the server's); never read back others, never change or delete
grant insert (user_id, terms_version, kind, promo, source) on public.kr8_terms_log to authenticated;
grant select on public.kr8_terms_log to authenticated;
drop policy if exists kr8_terms_log_ins on public.kr8_terms_log;
create policy kr8_terms_log_ins on public.kr8_terms_log for insert to authenticated with check (user_id = auth.uid());
drop policy if exists kr8_terms_log_admin on public.kr8_terms_log;
create policy kr8_terms_log_admin on public.kr8_terms_log for select to authenticated using (public.kr8_is_admin());

-- the first Terms version that includes the promotion clause
create or replace function public.kr8_promo_terms_min() returns text language sql immutable as $$ select 'member-2026-11-17'::text $$;

-- agree to the Terms (new card checkbox / update dialog / Settings). Same effect as kr8_accept_terms + the log + promo on.
create or replace function public.kr8_agree_terms(p_version text, p_source text default 'update') returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare t timestamptz; was boolean; promo boolean;
begin
  if auth.uid() is null then raise exception 'KR8_SIGN_IN'; end if;
  if p_version is null or p_version !~ '^[a-z0-9-]{3,40}$' then raise exception 'KR8_BAD_VERSION'; end if;
  if coalesce(p_source, '') not in ('signup', 'update', 'settings') then raise exception 'KR8_BAD_SOURCE'; end if;
  select m.promo_ok into was from public.kr8_members m where m.user_id = auth.uid() for update;
  if not found then raise exception 'KR8_NO_CARD'; end if;
  -- the clause only exists from member-2026-11-17 on; an older version never switches promotion on
  promo := case when was is false then false when p_version >= public.kr8_promo_terms_min() then true else was end;
  update public.kr8_members
     set terms_accepted_at = case when terms_version is distinct from p_version or terms_accepted_at is null then now() else terms_accepted_at end,
         terms_version = p_version,
         promo_ok = promo,
         promo_ok_at = case when promo is distinct from was then now() else promo_ok_at end
   where user_id = auth.uid()
  returning terms_accepted_at into t;
  insert into public.kr8_terms_log (user_id, terms_version, kind, promo, source) values (auth.uid(), p_version, 'agree', coalesce(promo, false), p_source);
  return t;
end $$;
revoke all on function public.kr8_agree_terms(text, text) from public, anon;
grant execute on function public.kr8_agree_terms(text, text) to authenticated;

-- the member's own Settings switch. Turning ON needs the new Terms first (the app opens the dialog); OFF always works.
create or replace function public.kr8_set_promo(p_on boolean) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v text; on_ boolean := coalesce(p_on, false);
begin
  if auth.uid() is null then raise exception 'KR8_SIGN_IN'; end if;
  select m.terms_version into v from public.kr8_members m where m.user_id = auth.uid() for update;
  if not found then raise exception 'KR8_NO_CARD'; end if;
  if on_ and (v is null or v < public.kr8_promo_terms_min()) then raise exception 'KR8_TERMS'; end if;
  update public.kr8_members set promo_ok = on_, promo_ok_at = now() where user_id = auth.uid();
  insert into public.kr8_terms_log (user_id, terms_version, kind, promo, source)
    values (auth.uid(), coalesce(v, 'none'), case when on_ then 'promo_on' else 'promo_off' end, on_, 'settings');
  return on_;
end $$;
revoke all on function public.kr8_set_promo(boolean) from public, anon;
grant execute on function public.kr8_set_promo(boolean) to authenticated;

create or replace function public.kr8_promo_get() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('on', m.promo_ok, 'terms_version', m.terms_version) from public.kr8_members m where m.user_id = auth.uid()
$$;
revoke all on function public.kr8_promo_get() from public, anon;
grant execute on function public.kr8_promo_get() to authenticated;

-- WHO MAY BE FEATURED RIGHT NOW (founder / Reel makers: check before using any clip). SQL editor only: no app/web access.
create or replace view public.kr8_promo_ok_members as
  select m.member_no, left(split_part(btrim(m.first_name), ' ', 1), 24) as first_name, m.area, m.ig_handle, m.tiktok_handle,
         m.promo_ok_at as promo_on_since, m.terms_version, m.terms_accepted_at,
         (select count(*) from public.kr8_posts p where p.author = m.user_id and p.status = 'approved' and not p.hidden) as approved_posts,
         m.user_id
  from public.kr8_members m
  where m.promo_ok is true and m.terms_version >= public.kr8_promo_terms_min()
    and not coalesce(m.ghost, false) and not public.kr8_is_team(m.user_id) and not public.kr8_is_test_member(m.user_id);
revoke all on public.kr8_promo_ok_members from public, anon, authenticated;

-- the same list for admins inside the app / admin page
create or replace function public.kr8_admin_promo_members() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r jsonb;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_FORBIDDEN'; end if;
  select coalesce(jsonb_agg(to_jsonb(v) - 'user_id' order by v.member_no), '[]'::jsonb) into r from public.kr8_promo_ok_members v;
  return r;
end $$;
revoke all on function public.kr8_admin_promo_members() from public, anon;
grant execute on function public.kr8_admin_promo_members() to authenticated;

commit;
