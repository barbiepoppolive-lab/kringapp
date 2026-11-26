-- m230 (26 Nov 2026, r12 "How to win" hero): last closed week's paid-seat Rings (rank → rings, amount) from real weekly prizes.
-- No names, no ids: only the score each prize seat needed. Test prizes never count. Signed-in members only.
create or replace function public.kr8_last_week_seats()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_wk date; v jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  select max(p.week) into v_wk from public.kr8_prizes p where p.kind = 'weekly' and not coalesce(p.is_test, false) and p.week is not null;
  if v_wk is null then return null; end if;
  select jsonb_agg(jsonb_build_object('rank', p.rank, 'rings', p.rings, 'amount', p.amount_thb) order by p.rank) into v
    from public.kr8_prizes p
   where p.kind = 'weekly' and p.week = v_wk and not coalesce(p.is_test, false) and p.rank is not null and p.rings is not null
     and coalesce(p.status, '') <> 'cancelled';
  return jsonb_build_object('week', v_wk, 'seats', coalesce(v, '[]'::jsonb));
end $$;
revoke execute on function public.kr8_last_week_seats() from public, anon;
grant execute on function public.kr8_last_week_seats() to authenticated;
