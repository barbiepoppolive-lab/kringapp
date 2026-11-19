-- 0141 (19 Nov, NOT applied yet): admin clean-up. Read-only admin RPC for the real AWS look-alikes, so Needs you shows
-- "Faces look alike · 86% (AWS)" (member ↔ member) instead of the retired on-phone face links, and each held claim's reasons
-- ("Looks like #X, who already got a prize (AWS 86%)"). kr8_face_lookalikes has RLS on with no policy, so the page cannot read it.
-- The admin page falls back safely before this is applied (old face links are dropped client-side; AWS links show without a %).
create or replace function public.kr8_admin_aws_lookalikes()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare lo numeric := public.kr8_rcfg('claim_lookalike_min', 80);
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return jsonb_build_object(
    'pairs', coalesce((
      select jsonb_agg(jsonb_build_object('a', x.a, 'b', x.b, 'sim', x.sim, 'at', x.at,
               'a_no', ma.member_no, 'a_name', ma.first_name, 'b_no', mb.member_no, 'b_name', mb.first_name,
               'a_prize', exists (select 1 from public.kr8_reward_claims c where c.member_id = x.a and c.status <> 'cancelled'),
               'b_prize', exists (select 1 from public.kr8_reward_claims c where c.member_id = x.b and c.status <> 'cancelled')) order by x.at desc)
      from (select least(a, b) a, greatest(a, b) b, max(sim) sim, max(at) at from (
              select la.a, la.b, la.sim, la.at from public.kr8_face_lookalikes la where la.sim >= lo
              union all
              select l.a, l.b, (l.detail ->> 'aws_sim')::numeric, l.first_at from public.kr8_account_links l
               where l.reason = 'face' and l.dismissed_at is null and l.detail ? 'aws_sim') u
            group by 1, 2) x
      join public.kr8_members ma on ma.user_id = x.a
      join public.kr8_members mb on mb.user_id = x.b
      where not exists (select 1 from public.kr8_account_links d where least(d.a, d.b) = x.a and greatest(d.a, d.b) = x.b
                          and d.reason = 'face' and d.dismissed_at is not null)), '[]'::jsonb),
    'holds', coalesce((
      select jsonb_agg(jsonb_build_object('claim_id', h.claim_id, 'review', coalesce(h.detail -> 'review', '[]'::jsonb),
               'watch_no', wm.member_no, 'watch_name', wm.first_name))
      from public.kr8_claim_holds h
      join public.kr8_reward_claims c on c.id = h.claim_id
      -- 'watched_invite_group': the watched inviter at the top of this member's invite chain (same walk as kr8_in_watched_chain, 4 steps)
      left join lateral (
        with recursive up(code, depth) as (
          select 'k' || lpad(me.member_no::text, 5, '0'), 0 from public.kr8_members me where me.user_id = c.member_id
          union all
          select r.ref_code, up.depth + 1 from up join public.kr8_members r on r.member_no = substr(up.code, 2)::int
           where up.code ~ '^k[0-9]{5}$' and up.depth < 4 and r.ref_code is not null)
        select m.member_no, m.first_name from up join public.kr8_watched_refs w on w.ref_code = up.code
          join public.kr8_members m on up.code ~ '^k[0-9]{5}$' and m.member_no = substr(up.code, 2)::int
         order by up.depth limit 1) wm on true
      where h.decided is null), '[]'::jsonb));
end $$;
revoke all on function public.kr8_admin_aws_lookalikes() from public, anon;
grant execute on function public.kr8_admin_aws_lookalikes() to authenticated;
