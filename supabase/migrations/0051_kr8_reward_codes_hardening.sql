-- 0051 · Reward codes hardening (15 Nov 2026, reward-code audit before the first real TrueMoney links are loaded).
-- ADDITIVE ONLY: new indexes, one new check, one new guard trigger, one new nullable column, two execute grants narrowed.
-- No existing function, table or column is changed or dropped. The live build calls none of this.
--
-- UNDO:
--   drop trigger if exists kr8_reward_codes_guard on public.kr8_reward_codes;
--   drop function if exists public.kr8_reward_codes_guard_trg();
--   alter table public.kr8_reward_codes drop constraint if exists kr8_reward_codes_state_check;
--   drop index if exists public.kr8_reward_claims_code_once; drop index if exists public.kr8_reward_codes_claim_once;
--   alter table public.kr8_reward_codes drop column if exists expires_on;
--   grant execute on function public.kr8_admin_add_reward_codes(text, integer, text[], text, boolean) to anon;
--   grant execute on function public.kr8_mark_reward_used(uuid, boolean) to anon;

-- 1. One code can pay one claim only, and one claim can hold one code only (the database refuses anything else).
create unique index if not exists kr8_reward_claims_code_once on public.kr8_reward_claims (code_id) where code_id is not null;
create unique index if not exists kr8_reward_codes_claim_once on public.kr8_reward_codes (claim_id) where claim_id is not null;

-- 2. A code is either fully free or fully given: never "available" with an owner, never "assigned" without one.
alter table public.kr8_reward_codes drop constraint if exists kr8_reward_codes_state_check;
alter table public.kr8_reward_codes add constraint kr8_reward_codes_state_check check (
  (status = 'available' and assigned_to is null and claim_id is null and assigned_at is null)
  or (status = 'assigned' and assigned_to is not null and claim_id is not null and assigned_at is not null));

-- 3. Guard on every change to a code row, whoever makes it (function, admin, SQL editor):
--    · a code that was given stays given: it can never go back into stock or move to another member or claim;
--    · the code text, brand, amount and test flag of a given code can never change;
--    · a code can only be given to a claim that exists and matches it: same member, brand, amount and test flag
--      (a TEST member can never be handed a real code, a real member never a test code).
create or replace function public.kr8_reward_codes_guard_trg() returns trigger
language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  if old.status = 'assigned' then
    if new.status is distinct from 'assigned' or new.assigned_to is distinct from old.assigned_to or new.claim_id is distinct from old.claim_id
       or new.code is distinct from old.code or new.brand is distinct from old.brand or new.amount_thb is distinct from old.amount_thb
       or new.is_test is distinct from old.is_test then
      raise exception 'KR8_CODE_LOCKED';
    end if;
    return new;
  end if;
  if new.status = 'assigned' then
    if not exists (select 1 from public.kr8_reward_claims c
                   where c.id = new.claim_id and c.member_id = new.assigned_to and c.brand = new.brand
                     and c.amount_thb = new.amount_thb and c.is_test = new.is_test and c.status <> 'cancelled'
                     and (c.code_id is null or c.code_id = new.id)) then
      raise exception 'KR8_CODE_MISMATCH';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.kr8_reward_codes_guard_trg() from public, anon, authenticated;
drop trigger if exists kr8_reward_codes_guard on public.kr8_reward_codes;
create trigger kr8_reward_codes_guard before update on public.kr8_reward_codes
  for each row execute function public.kr8_reward_codes_guard_trg();

-- 4. Expiry date of a voucher (TrueMoney links bought 15 Nov 2026 expire 15 May 2027). A record only: nothing reads it yet.
alter table public.kr8_reward_codes add column if not exists expires_on date;
comment on column public.kr8_reward_codes.expires_on is 'Last day the voucher can be redeemed. Record only (0051); the claim functions do not read it yet.';

-- 5. A signed-out visitor has no reason to reach these two functions at all (they already refused; now they are not reachable).
revoke execute on function public.kr8_admin_add_reward_codes(text, integer, text[], text, boolean) from public, anon;
grant execute on function public.kr8_admin_add_reward_codes(text, integer, text[], text, boolean) to authenticated, service_role;
revoke execute on function public.kr8_mark_reward_used(uuid, boolean) from public, anon;
grant execute on function public.kr8_mark_reward_used(uuid, boolean) to authenticated, service_role;
