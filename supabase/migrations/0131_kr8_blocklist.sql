-- 0131 · Blocklist of identities that took a prize and deleted their account (founder 19 Nov 2026).
-- hard = same email / LINE login / phone-device as a deleted prize winner → that person can't claim a prize again (KR8_ONE_ACCOUNT)
-- soft = same network (IP) → never blocks (Thai mobile networks share IPs); the claim waits for the founder with a red alert.
-- Every match at sign-up raises one red alert so the founder sees re-joiners at once.
begin;
create table if not exists public.kr8_blocklist (
  id bigserial primary key,
  kind text not null check (kind in ('email', 'line', 'device', 'ip')),
  value text not null,
  strength text not null check (strength in ('hard', 'soft')),
  reason text not null default 'deleted_after_prize',
  source_no int,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 year',
  unique (kind, value)
);
alter table public.kr8_blocklist enable row level security;
revoke all on public.kr8_blocklist from anon, authenticated;

-- backfill: the members who received a prize and then deleted their account (#50, #78, #106)
insert into public.kr8_blocklist (kind, value, strength, source_no, created_at)
select k, v, s, no, coalesce(del, now()) from (
  select 'email' k, c.email_hash v, 'hard' s, c.member_no_copy no, c.member_deleted_at del from public.kr8_reward_claims c where c.member_deleted_at is not null and c.email_hash is not null
  union all select 'device', c.device, 'hard', c.member_no_copy, c.member_deleted_at from public.kr8_reward_claims c where c.member_deleted_at is not null and c.device is not null
  union all select 'ip', c.ip_hash, 'soft', c.member_no_copy, c.member_deleted_at from public.kr8_reward_claims c where c.member_deleted_at is not null and c.ip_hash is not null
  union all select 'line', p.line_hash, 'hard', p.founding_no, null from public.kr8_prizes p where p.member_id is null and p.line_hash is not null
  union all select 'email', p.email_hash, 'hard', null, null from public.kr8_prizes p where p.member_id is null and p.email_hash is not null
) x where v is not null and v <> ''
on conflict (kind, value) do nothing;
update public.kr8_blocklist b set source_no = c.member_no_copy from public.kr8_reward_claims c
 where b.source_no is null and b.kind = 'email' and c.email_hash = b.value and c.member_deleted_at is not null;

-- from now on: when a prize winner deletes their account, their identifiers go on the list (before the account is gone)
create or replace function public.kr8_blocklist_on_delete() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare no int;
begin
  if not (exists (select 1 from public.kr8_prizes p where p.member_id = old.id and p.status <> 'cancelled')
          or exists (select 1 from public.kr8_reward_claims c where c.member_id = old.id and c.status <> 'cancelled')) then
    return old;
  end if;
  select member_no into no from public.kr8_members where user_id = old.id;
  insert into public.kr8_blocklist (kind, value, strength, source_no)
  select k, v, s, no from (
    select 'email' k, public.kr8_id_hash(old.email) v, 'hard' s
    union all select 'line', public.kr8_line_hash_of(old.id), 'hard'
    union all select distinct 'device', c.device, 'hard' from public.kr8_reward_claims c where c.member_id = old.id
    union all select distinct 'device', e.did, 'hard' from public.kr8_client_events e where e.user_id = old.id and e.did is not null
    union all select distinct 'ip', c.ip_hash, 'soft' from public.kr8_reward_claims c where c.member_id = old.id
    union all select distinct 'ip', e.ip_hash, 'soft' from public.kr8_client_events e where e.user_id = old.id and e.ip_hash is not null
  ) x where v is not null and v <> ''
  on conflict (kind, value) do update set expires_at = greatest(public.kr8_blocklist.expires_at, excluded.expires_at);
  return old;
exception when others then
  raise warning 'kr8_blocklist_on_delete: %', sqlerrm;   -- never block a deletion
  return old;
end $$;
drop trigger if exists kr8_blocklist_users on auth.users;
create trigger kr8_blocklist_users before delete on auth.users for each row execute function public.kr8_blocklist_on_delete();

-- what a member matches (hard first); used at sign-up and at prize claim
create or replace function public.kr8_blocklist_hit(p_user uuid, p_device text default null, p_ip text default null) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select (select jsonb_build_object('kind', b.kind, 'strength', b.strength, 'source_no', b.source_no) from public.kr8_blocklist b
           where b.expires_at > now() and (
                 (b.kind = 'email' and b.value = public.kr8_email_hash_of(p_user))
              or (b.kind = 'line' and b.value = public.kr8_line_hash_of(p_user))
              or (b.kind = 'device' and (b.value = p_device or b.value in (select e.did from public.kr8_client_events e where e.user_id = p_user and e.did is not null)))
              or (b.kind = 'ip' and (b.value = p_ip or b.value in (select e.ip_hash from public.kr8_client_events e where e.user_id = p_user and e.ip_hash is not null))))
           order by (b.strength = 'hard') desc limit 1)
$$;
revoke all on function public.kr8_blocklist_hit(uuid, text, text) from public, anon, authenticated;

-- sign-up: a new card that matches → one red alert (nothing blocked yet; the claim is where it bites)
create or replace function public.kr8_blocklist_signup_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare h jsonb;
begin
  h := public.kr8_blocklist_hit(new.user_id);
  if h is not null then
    perform public.kr8_alert_raise(p_key => 'rejoin:' || new.user_id::text, p_robot => 'protect', p_severity => 'red',
      p_title => format('Re-joined? New #%s matches deleted prize winner #%s (same %s)', new.member_no, coalesce(h ->> 'source_no', '?'),
                        case h ->> 'kind' when 'email' then 'email' when 'line' then 'LINE login' when 'device' then 'phone' else 'network' end),
      p_body => case when h ->> 'strength' = 'hard' then 'This person cannot claim a prize (blocked automatically).' else 'Same network only: a prize claim will wait for you.' end,
      p_href => '#inbox', p_detail => jsonb_build_object('user_id', new.user_id, 'hit', h));
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists kr8_blocklist_signup on public.kr8_members;
create trigger kr8_blocklist_signup after insert on public.kr8_members for each row execute function public.kr8_blocklist_signup_trg();
commit;
