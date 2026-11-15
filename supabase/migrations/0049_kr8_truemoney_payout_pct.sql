-- 0049 · TrueMoney payout share comes from config (founder, 15 Nov 2026).
--
-- Today the only TrueMoney stock we can buy is the cash-card type, which loses 25% on top-up, so a ฿100 prize lands as ฿75.
-- If the Thai tester confirms the voucher lands at full value, ONE update flips the whole app (claim sheet, ticket, history, rules):
--     update public.kr8_rings_config set value = 100, updated_at = now() where key = 'truemoney_payout_pct';
-- and back:  ... set value = 75 ...
--
-- ADDITIVE: 1 config row, 1 nullable column (kr8_reward_claims.value_thb: what that claim was worth when it was made, so old claims
-- never change when the share is flipped), 1 function, 1 trigger. kr8_claim_prize / kr8_my_rewards / kr8_recent_claims keep their
-- names, arguments and answer shape: only the "× 3 / 4" inside them now reads the config. The old generated column
-- kr8_reward_codes.value_thb is left as it is and no longer read.
--
-- UNDO: drop trigger kr8_reward_claims_value on public.kr8_reward_claims; then re-run section 6 and 9 of 0047 (kr8_claim_prize,
--       kr8_my_rewards) and kr8_recent_claims from 0044; the column and the config row can stay.

insert into public.kr8_rings_config (key, value, note)
values ('truemoney_payout_pct', 75, 'Share of a prize that lands when it is taken as TrueMoney. 75 = cash-card stock that loses 25% on top-up. Set 100 when the voucher lands at full value.')
on conflict (key) do nothing;

create or replace function public.kr8_reward_value(p_brand text, p_amount int)
returns int language sql stable security definer set search_path = public, pg_temp as $$
  select case when p_brand = 'truemoney'
              then (p_amount * least(greatest(public.kr8_rcfg('truemoney_payout_pct', 75), 1), 100)) / 100
              else p_amount end
$$;
revoke all on function public.kr8_reward_value(text, int) from public;
grant execute on function public.kr8_reward_value(text, int) to anon, authenticated;

alter table public.kr8_reward_claims add column if not exists value_thb int;
-- claims made before today were all at the old fixed rule (TrueMoney 75%, others full)
update public.kr8_reward_claims set value_thb = case when brand = 'truemoney' then amount_thb * 3 / 4 else amount_thb end where value_thb is null;

create or replace function public.kr8_reward_claims_value_trg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.value_thb is null then new.value_thb := public.kr8_reward_value(new.brand, new.amount_thb); end if;
  return new;
end $$;
drop trigger if exists kr8_reward_claims_value on public.kr8_reward_claims;
create trigger kr8_reward_claims_value before insert on public.kr8_reward_claims
  for each row execute function public.kr8_reward_claims_value_trg();

-- Same three functions, same shape: swap the hard-coded "× 3 / 4" for the config. Fails loudly (and changes nothing) if a body is not what 0047 left.
do $$
declare d text; n text;
begin
  -- kr8_claim_prize
  d := pg_get_functiondef('public.kr8_claim_prize(uuid, text, text)'::regprocedure);
  n := replace(d, 'case when cl.brand = ''truemoney'' then cl.amount_thb * 3 / 4 else cl.amount_thb end', 'coalesce(cl.value_thb, public.kr8_reward_value(cl.brand, cl.amount_thb))');
  n := replace(n, 'case when p_brand = ''truemoney'' then pz.amount_thb * 3 / 4 else pz.amount_thb end', 'public.kr8_reward_value(p_brand, pz.amount_thb)');
  n := replace(n, '''value'', c.value_thb,', '''value'', public.kr8_reward_value(p_brand, pz.amount_thb),');
  if n like '%3 / 4%' or n like '%c.value_thb%' then raise exception '0049: kr8_claim_prize body not as expected'; end if;
  if n <> d then execute n; end if;
  -- kr8_my_rewards
  d := pg_get_functiondef('public.kr8_my_rewards()'::regprocedure);
  n := replace(d, 'coalesce(k.value_thb, case when c.brand = ''truemoney'' then c.amount_thb * 3 / 4 else c.amount_thb end)', 'coalesce(c.value_thb, public.kr8_reward_value(c.brand, c.amount_thb))');
  if n like '%3 / 4%' then raise exception '0049: kr8_my_rewards body not as expected'; end if;
  if n <> d then execute n; end if;
  -- kr8_recent_claims
  d := pg_get_functiondef('public.kr8_recent_claims(integer)'::regprocedure);
  n := replace(d, 'case when c.brand = ''truemoney'' then c.amount_thb * 3 / 4 else c.amount_thb end', 'coalesce(c.value_thb, public.kr8_reward_value(c.brand, c.amount_thb))');
  if n like '%3 / 4%' then raise exception '0049: kr8_recent_claims body not as expected'; end if;
  if n <> d then execute n; end if;
end $$;
