-- 0067 · Prize records survive account deletion, and Founding Local is once per person (16 Nov 2026, 50-user audit P0-1 / P0-2).
--
-- ADDITIVE + RE-RUNNABLE. Written, NOT applied. Needs 0066 (kr8_face_prints, kr8_face_dist, kr8_link_add, kr8_is_team).
--   P0-2: deleting an account used to delete that member's kr8_prizes and kr8_reward_claims rows (FK on delete cascade),
--         so nobody could see which code went where. Now: the FKs are "on delete set null", and before the account goes
--         the rows get a copy of the member number + one-way hashes of the email and LINE id (no name, no email).
--         The reward code row already keeps assigned_to (no FK), so "which code went where" stays answerable.
--   P0-1: kr8_founding_try refuses a 2nd Founding Local for the same person: same email hash, same LINE hash, or a face
--         print within face_same_max of a Founding winner's print (also of a deleted account; those prints are kept in
--         kr8_prize_faces for one year, only for members who had a prize). Team accounts (kr8_team_accounts) never get one.
--   Hash = sha256('kr8-id|' || lower(trim(value))); the same value always gives the same hash, the hash can't be turned back.
--
-- UNDO: drop trigger kr8_prize_trail_users on auth.users; drop trigger kr8_prize_trail_members on public.kr8_members;
--   drop trigger kr8_prize_ids on public.kr8_prizes; put back kr8_founding_try from 0047;
--   (the FKs can be put back to "on delete cascade" only after deleting rows whose member_id is null).

-- ───────────── columns ─────────────
alter table public.kr8_prizes add column if not exists member_no_copy int;
alter table public.kr8_prizes add column if not exists email_hash text;
alter table public.kr8_prizes add column if not exists line_hash text;
alter table public.kr8_prizes add column if not exists member_deleted_at timestamptz;
alter table public.kr8_reward_claims add column if not exists member_no_copy int;
alter table public.kr8_reward_claims add column if not exists email_hash text;
alter table public.kr8_reward_claims add column if not exists member_deleted_at timestamptz;
alter table public.kr8_prizes alter column member_id drop not null;
alter table public.kr8_reward_claims alter column member_id drop not null;
create index if not exists kr8_prizes_email_hash on public.kr8_prizes (email_hash) where email_hash is not null;
create index if not exists kr8_prizes_line_hash on public.kr8_prizes (line_hash) where line_hash is not null;

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'kr8_prizes_member_id_fkey' and confdeltype = 'c') then
    alter table public.kr8_prizes drop constraint kr8_prizes_member_id_fkey;
    alter table public.kr8_prizes add constraint kr8_prizes_member_id_fkey foreign key (member_id) references public.kr8_members(user_id) on delete set null;
  end if;
  if exists (select 1 from pg_constraint where conname = 'kr8_reward_claims_member_id_fkey' and confdeltype = 'c') then
    alter table public.kr8_reward_claims drop constraint kr8_reward_claims_member_id_fkey;
    alter table public.kr8_reward_claims add constraint kr8_reward_claims_member_id_fkey foreign key (member_id) references public.kr8_members(user_id) on delete set null;
  end if;
end $$;

-- face prints of prize winners whose account was deleted (only these; everyone else's go with the account)
create table if not exists public.kr8_prize_faces (
  id bigserial primary key,
  member_no_copy int,
  email_hash text,
  descriptor real[] not null,
  kept_at timestamptz not null default now()
);
alter table public.kr8_prize_faces enable row level security;
revoke all on public.kr8_prize_faces from public, anon, authenticated;
revoke all on sequence public.kr8_prize_faces_id_seq from public, anon, authenticated;

-- ───────────── helpers ─────────────
create or replace function public.kr8_id_hash(v text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when nullif(btrim(coalesce(v, '')), '') is null then null
              else encode(extensions.digest('kr8-id|' || lower(btrim(v)), 'sha256'), 'hex') end
$$;
create or replace function public.kr8_email_hash_of(p uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select public.kr8_id_hash((select u.email from auth.users u where u.id = p))
$$;
create or replace function public.kr8_line_hash_of(p uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select public.kr8_id_hash((select l.line_sub from public.kr8_line_links l where l.user_id = p))
$$;
revoke all on function public.kr8_id_hash(text), public.kr8_email_hash_of(uuid), public.kr8_line_hash_of(uuid) from public, anon, authenticated;

/** copy who-it-was (number + hashes, no name) onto the member's prize + claim rows and keep a prize winner's face prints */
create or replace function public.kr8_prize_trail(p uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare eh text := public.kr8_email_hash_of(p); lh text := public.kr8_line_hash_of(p);
        no int := (select member_no from public.kr8_members where user_id = p);
begin
  if p is null then return; end if;
  delete from public.kr8_prize_faces where kept_at < now() - interval '1 year';   -- kept one year at most
  update public.kr8_prizes set member_no_copy = coalesce(no, member_no_copy), email_hash = coalesce(eh, email_hash), line_hash = coalesce(lh, line_hash),
         member_deleted_at = now() where member_id = p;
  update public.kr8_reward_claims set member_no_copy = coalesce(no, member_no_copy), email_hash = coalesce(eh, email_hash), member_deleted_at = now()
   where member_id = p;
  if exists (select 1 from public.kr8_prizes where member_id = p) and to_regclass('public.kr8_face_prints') is not null then
    insert into public.kr8_prize_faces (member_no_copy, email_hash, descriptor)
    select no, eh, f.descriptor from public.kr8_face_prints f where f.user_id = p and f.source in ('verify', 'selfie');
  end if;
end $$;
revoke all on function public.kr8_prize_trail(uuid) from public, anon, authenticated;

create or replace function public.kr8_prize_trail_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.kr8_prize_trail(old.id);
  return old;
exception when others then return old;   -- never block a deletion
end $$;
create or replace function public.kr8_prize_trail_member_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- only when the card is deleted on its own (the auth.users trigger already ran when the whole account goes)
  if exists (select 1 from public.kr8_prizes where member_id = old.user_id and member_deleted_at is null)
     or exists (select 1 from public.kr8_reward_claims where member_id = old.user_id and member_deleted_at is null) then
    perform public.kr8_prize_trail(old.user_id);
  end if;
  return old;
exception when others then return old;
end $$;
drop trigger if exists kr8_prize_trail_users on auth.users;
create trigger kr8_prize_trail_users before delete on auth.users for each row execute function public.kr8_prize_trail_trg();
drop trigger if exists kr8_prize_trail_members on public.kr8_members;
create trigger kr8_prize_trail_members before delete on public.kr8_members for each row execute function public.kr8_prize_trail_member_trg();

/** every new prize carries the hashes from the start (so a 2nd account is caught even before any deletion) */
create or replace function public.kr8_prize_ids_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.member_id is not null then
    new.email_hash := coalesce(new.email_hash, public.kr8_email_hash_of(new.member_id));
    new.line_hash := coalesce(new.line_hash, public.kr8_line_hash_of(new.member_id));
    new.member_no_copy := coalesce(new.member_no_copy, (select member_no from public.kr8_members where user_id = new.member_id));
  end if;
  return new;
end $$;
drop trigger if exists kr8_prize_ids on public.kr8_prizes;
create trigger kr8_prize_ids before insert on public.kr8_prizes for each row execute function public.kr8_prize_ids_trg();

-- LINE linked later: the member's prizes get the LINE hash too
create or replace function public.kr8_prize_line_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.kr8_prizes set line_hash = public.kr8_id_hash(new.line_sub) where member_id = new.user_id and line_hash is null;
  return new;
exception when others then return new;
end $$;
drop trigger if exists kr8_prize_line on public.kr8_line_links;
create trigger kr8_prize_line after insert or update of user_id on public.kr8_line_links for each row execute function public.kr8_prize_line_trg();

-- the prizes that exist now
update public.kr8_prizes p set email_hash = public.kr8_email_hash_of(p.member_id) where p.email_hash is null and p.member_id is not null;
update public.kr8_prizes p set line_hash = public.kr8_line_hash_of(p.member_id) where p.line_hash is null and p.member_id is not null;
update public.kr8_prizes p set member_no_copy = m.member_no from public.kr8_members m where m.user_id = p.member_id and p.member_no_copy is null;
update public.kr8_reward_claims c set member_no_copy = m.member_no from public.kr8_members m where m.user_id = c.member_id and c.member_no_copy is null;

-- ───────────── Founding Local: once per person (body of 0047 + the same-person checks) ─────────────
create or replace function public.kr8_founding_try(p_member uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare t boolean; n int; amt int := public.kr8_rcfg('founding_thb', 100); eh text; lh text; mx float8 := public.kr8_rcfg('face_same_max', 500) / 1000.0; o record;
begin
  if public.kr8_rcfg('founding_on', 1) <> 1 or amt <= 0 then return null; end if;
  if not exists (select 1 from public.kr8_members where user_id = p_member) then return null; end if;
  if public.kr8_is_team(p_member) then return null; end if;
  if exists (select 1 from public.kr8_prizes where member_id = p_member and kind = 'founding') then return null; end if;
  if not exists (select 1 from public.kr8_posts where author = p_member and kind = 'reel' and status = 'approved' and not hidden) then return null; end if;
  -- same person as an earlier Founding Local (also a deleted account): same email, same LINE, or same face
  eh := public.kr8_email_hash_of(p_member); lh := public.kr8_line_hash_of(p_member);
  if exists (select 1 from public.kr8_prizes x where x.kind = 'founding' and x.member_id is distinct from p_member
             and ((eh is not null and x.email_hash = eh) or (lh is not null and x.line_hash = lh))) then return null; end if;
  for o in select x.member_id from public.kr8_prizes x where x.kind = 'founding' and x.member_id is not null and x.member_id <> p_member
             and x.status <> 'cancelled'
             and exists (select 1 from public.kr8_face_prints a join public.kr8_face_prints b on b.user_id = x.member_id
                         where a.user_id = p_member and public.kr8_face_dist(a.descriptor, b.descriptor) <= mx) loop
    perform public.kr8_link_add(p_member, o.member_id, 'face', jsonb_build_object('where', 'founding check'));
    return null;
  end loop;
  if exists (select 1 from public.kr8_face_prints a join public.kr8_prize_faces k on k.kept_at > now() - interval '1 year'
             where a.user_id = p_member and public.kr8_face_dist(a.descriptor, k.descriptor) <= mx) then return null; end if;
  t := public.kr8_is_test_member(p_member);
  perform pg_advisory_xact_lock(hashtext('kr8_founding:' || t::text));
  select coalesce(max(founding_no), 0) + 1 into n from public.kr8_prizes where kind = 'founding' and is_test = t;
  if n > public.kr8_rcfg('founding_slots', 50) then return null; end if;
  insert into public.kr8_prizes (member_id, kind, founding_no, amount_thb, is_test) values (p_member, 'founding', n, amt, t) on conflict do nothing;
  if not found then return null; end if;
  return n;
end $$;
revoke all on function public.kr8_founding_try(uuid) from public, anon, authenticated;
