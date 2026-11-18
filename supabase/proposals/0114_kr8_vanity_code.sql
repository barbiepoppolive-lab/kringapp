-- PROPOSAL ONLY (board-1, 18 Nov) — NOT applied, NOT in supabase/migrations. Review, then copy to migrations/0114_… to ship.
-- Name-style member codes, e.g. NAT44, that a friend can read off a story and type (TikTok allows no links).
--
-- Design: the vanity code is only a friendlier NAME for the existing invite code. Everything that credits invites keeps using
-- kr8_members.ref_code in the k00037 form (0109 / 0111 triggers and kr8_invite_* functions are untouched): a BEFORE trigger turns a
-- vanity code into the k-code the moment it is stored. Members without a usable Latin first name (e.g. Thai-script only) keep k00037.
--
-- Format: 2–6 uppercase Latin letters from the first name + 1–4 digits (member_no % 100, widened on a clash), e.g. NAT44, MINT7, PLOY37.
-- Case-insensitive on input (nat44 = NAT44). Reserved words are skipped.

alter table public.kr8_members add column if not exists vanity_code text;
alter table public.kr8_members drop constraint if exists kr8_members_vanity_code_fmt;
alter table public.kr8_members add constraint kr8_members_vanity_code_fmt check (vanity_code is null or vanity_code ~ '^[A-Z]{2,6}[0-9]{1,4}$');
create unique index if not exists kr8_members_vanity_code_uq on public.kr8_members (vanity_code) where vanity_code is not null;

-- k00037 or NAT44 → the canonical k-code ('' when unknown). Read-only, safe to call from the app and the website.
create or replace function public.kr8_ref_resolve(p_code text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when lower(btrim(coalesce(p_code, ''))) ~ '^k[0-9]{5,7}$' then lower(btrim(p_code))
    when upper(btrim(coalesce(p_code, ''))) ~ '^[A-Z]{2,6}[0-9]{1,4}$' then coalesce(
      (select 'k' || lpad(m.member_no::text, 5, '0') from public.kr8_members m where m.vanity_code = upper(btrim(p_code))), '')
    else '' end
$$;
revoke all on function public.kr8_ref_resolve(text) from public;
grant execute on function public.kr8_ref_resolve(text) to anon, authenticated;

-- "Mint invited you" works with either code
create or replace function public.kr8_ref_name(p_code text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select m.first_name from public.kr8_members m
  where public.kr8_ref_resolve(p_code) <> '' and m.member_no = substring(public.kr8_ref_resolve(p_code) from 2)::int
$$;

-- kr8_set_ref may receive NAT44: store the k-code so every existing credit rule keeps working unchanged
create or replace function public.kr8_ref_code_canon() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.ref_code is not null and new.ref_code !~ '^k[0-9]{5,7}$' then
    new.ref_code := nullif(public.kr8_ref_resolve(new.ref_code), '');
  end if;
  return new;
end $$;
drop trigger if exists kr8_ref_code_canon_trg on public.kr8_members;
create trigger kr8_ref_code_canon_trg before insert or update of ref_code on public.kr8_members
  for each row execute function public.kr8_ref_code_canon();

-- Make (or keep) a member's vanity code. Latin letters of the first name, else NULL (the app then shows K00037).
create or replace function public.kr8_vanity_assign(p_user uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare m record; base text; c text; n int; w int;
begin
  select user_id, first_name, member_no, vanity_code into m from public.kr8_members where user_id = p_user;
  if m.user_id is null or m.member_no is null then return null; end if;
  if m.vanity_code is not null then return m.vanity_code; end if;
  base := left(upper(regexp_replace(coalesce(m.first_name, ''), '[^A-Za-z]', '', 'g')), 6);
  if length(base) < 2 or base in ('KRING', 'ADMIN', 'TEST', 'SEX', 'FUCK', 'SHIT', 'NAZI') then return null; end if;
  foreach w in array array[100, 1000, 10000] loop
    n := m.member_no % w;
    c := base || n::text;
    if c ~ '^[A-Z]{2,6}[0-9]{1,4}$' and not exists (select 1 from public.kr8_members where vanity_code = c) then
      update public.kr8_members set vanity_code = c where user_id = p_user and vanity_code is null;
      return c;
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.kr8_vanity_assign(uuid) from public, anon, authenticated;   -- server / admin only

-- the member's own code for the app (kr8_card_extras gains vanity_code in the same release: add `'vanity_code', m.vanity_code`)
create or replace function public.kr8_my_vanity_code() returns text
language sql volatile security definer set search_path = public, pg_temp as $$
  select coalesce(m.vanity_code, public.kr8_vanity_assign(auth.uid())) from public.kr8_members m where m.user_id = auth.uid()
$$;
grant execute on function public.kr8_my_vanity_code() to authenticated;

-- one-time backfill (run by hand after review): select public.kr8_vanity_assign(user_id) from public.kr8_members where vanity_code is null;
