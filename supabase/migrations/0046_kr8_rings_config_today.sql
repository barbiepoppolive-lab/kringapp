-- 0046 · Rings: one config table for every earn value and cap; "Today" rules (check-in + streak, react to 3 Reels);
-- Reel with a place +100 max 3 a week; friend reward only after the friend's first Reel (+300, friend +100 welcome);
-- 50-likes rule off; claims with no stock are HELD (Rings reserved, code goes out by itself when stock is added);
-- admin stock view. (CoS / founder direction 14 Nov 15:33.) Only touches objects created in 0044, plus new ones.
--
-- UNDO: drop function kr8_checkin, kr8_rings_rules, kr8_rcfg, kr8_rings_try_friend, kr8_react_trg, kr8_admin_reward_stock;
--       drop trigger kr8_react_trg on kr8_post_likes; drop table kr8_rings_config; then re-run the 0044 versions of the replaced functions.

begin;

create table if not exists public.kr8_rings_config (
  key text primary key,
  value integer not null,
  note text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.kr8_rings_config enable row level security;
revoke all on public.kr8_rings_config from anon, authenticated;
insert into public.kr8_rings_config (key, value, note) values
  ('rings_per_baht', 10, '10 Rings = ฿1'),
  ('checkin', 5, 'daily check-in (open the app)'),
  ('streak_days', 7, 'streak length for the bonus'),
  ('streak_bonus', 50, 'bonus on every full streak'),
  ('react_goal', 3, 'Reels to react to in a day'),
  ('react', 10, 'Rings for reacting to react_goal Reels today'),
  ('reel_place', 100, 'approved Reel with at least one place'),
  ('reel_place_week_cap', 3, 'max Reel-with-place rewards per week'),
  ('likes_50', 0, '0 = off (dropped 14 Nov)'),
  ('friend', 300, 'friend joined with your link, made a card and posted a first Reel'),
  ('friend_welcome', 100, 'the friend gets this welcome'),
  ('weekly_1', 5000, 'weekly #1'), ('weekly_2', 3000, 'weekly #2'), ('weekly_3', 2000, 'weekly #3'), ('weekly_4_10', 500, 'weekly #4–10'),
  ('claims_per_day', 3, 'claims per member per Bangkok day')
on conflict (key) do nothing;

create or replace function public.kr8_rcfg(k text, dflt int default 0) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select value from public.kr8_rings_config where key = k), dflt)
$$;
-- the app reads the numbers it shows from here (no code edit needed to change them)
create or replace function public.kr8_rings_rules() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.kr8_rings_config
$$;

-- new reasons
alter table public.kr8_rings_ledger drop constraint if exists kr8_rings_ledger_reason_check;
alter table public.kr8_rings_ledger add constraint kr8_rings_ledger_reason_check check (reason in
  ('reel_place', 'likes_50', 'friend_join', 'friend_welcome', 'checkin', 'streak', 'react3', 'weekly_top', 'reel_removed', 'claim'));
create or replace function public.kr8_rings_earn_reason(r text) returns boolean language sql immutable as $$
  select r in ('reel_place', 'likes_50', 'friend_join', 'friend_welcome', 'checkin', 'streak', 'react3', 'reel_removed')
$$;
drop index if exists public.kr8_reward_claims_one_pending;   -- held claims reserve Rings now; a member may hold more than one

-- Reel with a place: +reel_place, max reel_place_week_cap per Bangkok week
create or replace function public.kr8_rings_try_reel(p_post uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare a uuid; v int := public.kr8_rcfg('reel_place', 100); cap int := public.kr8_rcfg('reel_place_week_cap', 3);
begin
  select author into a from public.kr8_posts where id = p_post and kind = 'reel' and status = 'approved' and not hidden;
  if a is null or v <= 0 or not exists (select 1 from public.kr8_post_places where post_id = p_post) then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('kr8_rings:' || a::text));
  if exists (select 1 from public.kr8_rings_ledger where member_id = a and reason = 'reel_place' and ref_id = p_post::text) then return 0; end if;
  if (select count(*) from public.kr8_rings_ledger where member_id = a and reason = 'reel_place' and created_at >= public.kr8_week_start(now())) >= cap then return 0; end if;
  insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (a, v, 'reel_place', p_post::text) on conflict do nothing;
  return v;
end $$;

-- Friend reward: the friend joined with your link (?ref=k00412), has a card AND an approved first Reel → you +friend, they +friend_welcome
create or replace function public.kr8_rings_try_friend(p_member uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.kr8_members; r uuid; n int := 0;
begin
  select * into m from public.kr8_members where user_id = p_member;
  if m.user_id is null or coalesce(m.ref_code, '') !~ '^k[0-9]{5,7}$' then return 0; end if;
  if not exists (select 1 from public.kr8_posts where author = p_member and kind = 'reel' and status = 'approved' and not hidden) then return 0; end if;
  select user_id into r from public.kr8_members where member_no = substring(m.ref_code from 2)::int;
  if r is null or r = p_member then return 0; end if;
  if public.kr8_rcfg('friend', 300) > 0 then
    insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (r, public.kr8_rcfg('friend', 300), 'friend_join', p_member::text) on conflict do nothing;
    get diagnostics n = row_count;
  end if;
  if public.kr8_rcfg('friend_welcome', 100) > 0 then
    insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (p_member, public.kr8_rcfg('friend_welcome', 100), 'friend_welcome', r::text) on conflict do nothing;
  end if;
  return n;
end $$;

create or replace function public.kr8_rings_ref_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.ref_code is null and new.ref_code ~ '^k[0-9]{5,7}$' then
    begin perform public.kr8_rings_try_friend(new.user_id); exception when others then raise warning 'kr8_rings_ref_trg: %', sqlerrm; end;
  end if;
  return new;
end $$;

create or replace function public.kr8_rings_post_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare back int; l50 int := public.kr8_rcfg('likes_50', 0);
begin
  if new.kind <> 'reel' then return new; end if;
  begin
    if new.status = 'approved' and not new.hidden and (old.status is distinct from 'approved' or old.hidden) then
      perform public.kr8_rings_try_reel(new.id);
      perform public.kr8_rings_try_friend(new.author);
    end if;
    if l50 > 0 and new.likes_count >= 50 and coalesce(old.likes_count, 0) < 50 and new.status = 'approved' and not new.hidden then
      insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (new.author, l50, 'likes_50', new.id::text) on conflict do nothing;
    end if;
    if (new.hidden and not old.hidden) or (new.status = 'hidden' and old.status is distinct from 'hidden') then
      select coalesce(sum(delta), 0) into back from public.kr8_rings_ledger
        where member_id = new.author and ref_id = new.id::text and reason in ('reel_place', 'likes_50');
      if back > 0 then
        insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (new.author, -back, 'reel_removed', new.id::text) on conflict do nothing;
      end if;
    end if;
  exception when others then
    raise warning 'kr8_rings_post_trg: %', sqlerrm;
  end;
  return new;
end $$;

-- React to react_goal Reels today → +react (once per Bangkok day). Never blocks a like.
create or replace function public.kr8_react_trg() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int; v int := public.kr8_rcfg('react', 10); d0 timestamptz := public.kr8_bkk_day_start(now());
begin
  begin
    if v > 0 and exists (select 1 from public.kr8_members where user_id = new.user_id) then
      select count(*) into n from public.kr8_post_likes where user_id = new.user_id and created_at >= d0;
      if n >= public.kr8_rcfg('react_goal', 3) then
        insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id)
        values (new.user_id, v, 'react3', 'day:' || to_char(d0 at time zone 'Asia/Bangkok', 'YYYY-MM-DD')) on conflict do nothing;
      end if;
    end if;
  exception when others then raise warning 'kr8_react_trg: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists kr8_react_trg on public.kr8_post_likes;
create trigger kr8_react_trg after insert on public.kr8_post_likes for each row execute function public.kr8_react_trg();

-- Daily check-in (the app calls it when a member with a card opens it). +checkin once a day; +streak_bonus on every full streak.
-- Also returns held claims that got their code (the app tells the member once).
create or replace function public.kr8_checkin() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); d date := (now() at time zone 'Asia/Bangkok')::date; added int := 0; streak int := 0; bonus int := 0; len int := public.kr8_rcfg('streak_days', 7);
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if public.kr8_rcfg('checkin', 5) > 0 then
    insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (uid, public.kr8_rcfg('checkin', 5), 'checkin', 'day:' || d) on conflict do nothing;
    get diagnostics added = row_count;
  end if;
  -- consecutive days ending today
  with days as (select distinct substring(ref_id from 5)::date dd from public.kr8_rings_ledger where member_id = uid and reason = 'checkin' and ref_id like 'day:%'),
       g as (select dd, dd - (row_number() over (order by dd))::int grp from days)
  select count(*) into streak from g where grp = (select grp from g where dd = d);
  if added > 0 and len > 0 and streak > 0 and streak % len = 0 and public.kr8_rcfg('streak_bonus', 50) > 0 then
    insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (uid, public.kr8_rcfg('streak_bonus', 50), 'streak', 'streak:' || d) on conflict do nothing;
    get diagnostics bonus = row_count;
  end if;
  return jsonb_build_object('added', case when added > 0 then public.kr8_rcfg('checkin', 5) else 0 end, 'streak', streak, 'streak_len', len,
    'bonus', case when bonus > 0 then public.kr8_rcfg('streak_bonus', 50) else 0 end,
    'ready', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'brand', brand, 'amount', amount_thb, 'assigned_at', assigned_at))
                       from public.kr8_reward_claims where member_id = uid and status = 'assigned' and assigned_at > created_at + interval '1 minute'
                         and assigned_at > now() - interval '7 days'), '[]'::jsonb));
end $$;

-- Claim: Rings are always taken (reserved) at once. No stock → HELD; the code goes out by itself when stock is added.
create or replace function public.kr8_claim_reward(p_amount int, p_brand text, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); need int; bal int; c public.kr8_reward_codes; cid uuid := gen_random_uuid(); test boolean;
        dev text := nullif(left(btrim(coalesce(p_device, '')), 64), '');
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  if not exists (select 1 from public.kr8_members where user_id = uid) then raise exception 'KR8_NO_CARD'; end if;
  if p_amount is null or p_amount not in (100, 300, 500) or p_brand is null or p_brand not in ('grab', 'shopeepay', 'truemoney') then raise exception 'KR8_BAD_REWARD'; end if;
  need := p_amount * public.kr8_rcfg('rings_per_baht', 10);
  perform pg_advisory_xact_lock(hashtext('kr8_rings:' || uid::text));
  test := public.kr8_is_test_member(uid);
  if dev is not null and exists (select 1 from public.kr8_reward_claims where device = dev and member_id <> uid and created_at > now() - interval '30 days') then
    raise exception 'KR8_ONE_ACCOUNT';
  end if;
  if (select count(*) from public.kr8_reward_claims where member_id = uid and created_at >= public.kr8_bkk_day_start(now())) >= public.kr8_rcfg('claims_per_day', 3) then raise exception 'KR8_SLOW_DOWN'; end if;
  select balance into bal from public.kr8_rings_totals(uid);
  if bal < need then raise exception 'KR8_LOW_BALANCE'; end if;
  select * into c from public.kr8_reward_codes
    where brand = p_brand and amount_thb = p_amount and status = 'available' and is_test = test
    order by added_at, id limit 1 for update skip locked;
  insert into public.kr8_reward_claims (id, member_id, brand, amount_thb, rings, status, code_id, device, ip_hash, is_test, assigned_at)
  values (cid, uid, p_brand, p_amount, need, case when c.id is null then 'pending' else 'assigned' end, c.id, dev, public.kr8_caller_ip_hash(), test,
          case when c.id is null then null else now() end);
  insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (uid, -need, 'claim', cid::text);
  if c.id is null then
    return jsonb_build_object('status', 'pending', 'claim_id', cid, 'brand', p_brand, 'amount', p_amount, 'rings', need);
  end if;
  update public.kr8_reward_codes set status = 'assigned', assigned_to = uid, assigned_at = now(), claim_id = cid where id = c.id;
  return jsonb_build_object('status', 'assigned', 'claim_id', cid, 'brand', p_brand, 'amount', p_amount, 'value', c.value_thb,
                            'code', c.code, 'activation_url', c.activation_url, 'rings', need);
end $$;

-- New stock fills held claims, oldest first (Rings were already reserved)
create or replace function public.kr8_fill_pending_claims() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare p record; c public.kr8_reward_codes; n int := 0;
begin
  for p in select * from public.kr8_reward_claims where status = 'pending' order by created_at limit 500 for update skip locked loop
    c := null;
    select * into c from public.kr8_reward_codes where brand = p.brand and amount_thb = p.amount_thb and status = 'available' and is_test = p.is_test
      order by added_at, id limit 1 for update skip locked;
    if c.id is null then continue; end if;
    update public.kr8_reward_codes set status = 'assigned', assigned_to = p.member_id, assigned_at = now(), claim_id = p.id where id = c.id;
    update public.kr8_reward_claims set status = 'assigned', code_id = c.id, assigned_at = now() where id = p.id;
    -- held before 0046 (nothing reserved then): take the Rings now
    if not exists (select 1 from public.kr8_rings_ledger where member_id = p.member_id and reason = 'claim' and ref_id = p.id::text) then
      insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id) values (p.member_id, -p.rings, 'claim', p.id::text) on conflict do nothing;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Weekly prizes from the config
create or replace function public.kr8_close_week(p_week date default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare w0 timestamptz; n int;
begin
  w0 := case when p_week is null then public.kr8_week_start(now() - interval '1 hour') else (p_week::timestamp at time zone 'Asia/Bangkok') end;
  if extract(isodow from (w0 at time zone 'Asia/Bangkok')) <> 1 then raise exception 'KR8_NOT_MONDAY'; end if;
  if now() < w0 + interval '7 days' - interval '2 minutes' then raise exception 'KR8_WEEK_OPEN'; end if;
  with s as (
    select sc.member_id, (row_number() over (order by sc.rings desc, sc.last_at asc, m.member_no asc))::int as rk
    from public.kr8_week_scores(w0) sc join public.kr8_members m on m.user_id = sc.member_id
    where not public.kr8_is_test_member(sc.member_id))
  insert into public.kr8_rings_ledger (member_id, delta, reason, ref_id)
  select member_id, case rk when 1 then public.kr8_rcfg('weekly_1', 5000) when 2 then public.kr8_rcfg('weekly_2', 3000) when 3 then public.kr8_rcfg('weekly_3', 2000)
                            else public.kr8_rcfg('weekly_4_10', 500) end, 'weekly_top', 'week:' || to_char(w0 at time zone 'Asia/Bangkok', 'YYYY-MM-DD')
  from s where rk <= 10
  on conflict do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('week', to_char(w0 at time zone 'Asia/Bangkok', 'YYYY-MM-DD'), 'paid', n);
end $$;

-- Rewards screen data: balance, "Today" (check-in streak, reacts, Reels this week), invite count, claims, earned, the rules
create or replace function public.kr8_my_rewards()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); t record; r jsonb; d date := (now() at time zone 'Asia/Bangkok')::date; streak int;
begin
  if uid is null then raise exception 'KR8_SIGN_IN'; end if;
  select * into t from public.kr8_rings_totals(uid);
  with days as (select distinct substring(ref_id from 5)::date dd from public.kr8_rings_ledger where member_id = uid and reason = 'checkin' and ref_id like 'day:%'),
       g as (select dd, dd - (row_number() over (order by dd))::int grp from days)
  select count(*) into streak from g where grp = (select grp from g where dd = (select max(dd) from days)) and (select max(dd) from days) >= d - 1;
  select jsonb_build_object(
    'balance', t.balance, 'lifetime', t.lifetime, 'week', t.week, 'level', public.kr8_rings_level(t.lifetime),
    'member_no', (select member_no from public.kr8_members where user_id = uid),
    'rules', public.kr8_rings_rules(),
    'checked_in_today', exists (select 1 from public.kr8_rings_ledger where member_id = uid and reason = 'checkin' and ref_id = 'day:' || d),
    'streak', coalesce(streak, 0),
    'reacts_today', (select count(*) from public.kr8_post_likes where user_id = uid and created_at >= public.kr8_bkk_day_start(now())),
    'react_done', exists (select 1 from public.kr8_rings_ledger where member_id = uid and reason = 'react3' and ref_id = 'day:' || d),
    'reel_place_week', (select count(*) from public.kr8_rings_ledger where member_id = uid and reason = 'reel_place' and created_at >= public.kr8_week_start(now())),
    'reel_place_today', exists (select 1 from public.kr8_rings_ledger where member_id = uid and reason = 'reel_place' and created_at >= public.kr8_bkk_day_start(now())),
    'best_likes', 0,
    'friends', (select count(*) from public.kr8_rings_ledger where member_id = uid and reason = 'friend_join'),
    'claims', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'brand', c.brand, 'amount', c.amount_thb, 'rings', c.rings, 'status', c.status,
                 'value', k.value_thb, 'code', k.code, 'activation_url', k.activation_url, 'used_at', c.used_at, 'created_at', c.created_at, 'assigned_at', c.assigned_at)
                 order by c.created_at desc)
               from public.kr8_reward_claims c left join public.kr8_reward_codes k on k.id = c.code_id and k.assigned_to = uid
               where c.member_id = uid and c.status <> 'cancelled'), '[]'::jsonb),
    'earned', coalesce((select jsonb_agg(e order by (e->>'at') desc) from (
               select jsonb_build_object('reason', l.reason, 'delta', l.delta, 'at', l.created_at,
                 'detail', case l.reason
                   when 'reel_place' then (select pl.name_en from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id
                                           where pp.post_id::text = l.ref_id order by pp.position limit 1)
                   when 'friend_join' then (select first_name from public.kr8_members where user_id::text = l.ref_id)
                   when 'weekly_top' then substring(l.ref_id from 6)
                   else null end,
                 'detail_th', case when l.reason = 'reel_place' then (select pl.name_th from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id
                                           where pp.post_id::text = l.ref_id order by pp.position limit 1) end) as e
               from public.kr8_rings_ledger l where l.member_id = uid and l.reason <> 'claim' order by l.created_at desc limit 40) z), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Admin: stock per brand / amount, held claims waiting, codes given in the last 7 days
create or replace function public.kr8_admin_reward_stock()
returns table(brand text, amount_thb int, available int, held int, given_7d int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return query
    select b.brand, a.amount::int,
      (select count(*)::int from public.kr8_reward_codes k where k.brand = b.brand and k.amount_thb = a.amount and k.status = 'available' and not k.is_test),
      (select count(*)::int from public.kr8_reward_claims c where c.brand = b.brand and c.amount_thb = a.amount and c.status = 'pending' and not c.is_test),
      (select count(*)::int from public.kr8_reward_claims c where c.brand = b.brand and c.amount_thb = a.amount and c.status = 'assigned' and not c.is_test and c.assigned_at > now() - interval '7 days')
    from (values ('grab'), ('shopeepay'), ('truemoney')) b(brand) cross join (values (100), (300), (500)) a(amount)
    order by 1, 2;
end $$;

revoke execute on function public.kr8_rings_try_friend(uuid) from public, anon, authenticated;
revoke execute on function public.kr8_react_trg() from public, anon, authenticated;
revoke execute on function public.kr8_rings_try_reel(uuid) from public, anon, authenticated;
revoke execute on function public.kr8_fill_pending_claims() from public, anon, authenticated;
revoke execute on function public.kr8_close_week(date) from public, anon, authenticated;
grant execute on function public.kr8_close_week(date) to service_role;
revoke execute on function public.kr8_checkin(), public.kr8_admin_reward_stock() from public, anon;
grant execute on function public.kr8_checkin(), public.kr8_admin_reward_stock() to authenticated;
grant execute on function public.kr8_rings_rules() to anon, authenticated;
revoke execute on function public.kr8_rcfg(text, int) from public, anon, authenticated;

commit;
