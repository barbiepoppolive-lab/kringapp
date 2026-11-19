-- 0134 · Facts for the Help helper (founder 19 Nov 2026): the helper reads the member's real state before it writes,
-- and safe answers can be sent automatically (help_ai_autosend = 1). Service role only.
begin;
insert into public.kr8_rings_config (key, value, note) values
  ('help_ai_autosend', 1, '1 = the Help helper sends safe answers (rules, how-to, status) by itself; money decisions, refusals, warnings and fraud always wait for the founder')
on conflict (key) do nothing;

create or replace function public.kr8_help_facts(p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'member_no', m.member_no, 'first_name', m.first_name, 'joined', m.created_at,
    'face_check', case when coalesce(m.verified, false) then 'passed'
                       when exists (select 1 from public.kr8_verifications v where v.user_id = m.user_id and v.status = 'pending') then 'waiting_for_team'
                       else 'not_done' end,
    'reels', jsonb_build_object(
       'approved', (select count(*) from public.kr8_posts p where p.author = m.user_id and p.kind = 'reel' and p.status = 'approved' and not p.hidden),
       'waiting', (select count(*) from public.kr8_posts p where p.author = m.user_id and p.kind = 'reel' and p.status = 'pending'),
       'hidden', (select count(*) from public.kr8_posts p where p.author = m.user_id and p.kind = 'reel' and (p.hidden or p.status = 'hidden'))),
    'prizes', coalesce((select jsonb_agg(jsonb_build_object('kind', z.kind, 'amount_thb', z.amount_thb, 'status', z.status,
                         'claim', (select jsonb_build_object('status', c.status, 'held', c.held,
                                     'waiting_reason', case when c.held then coalesce((select h.reason from public.kr8_claim_holds h where h.claim_id = c.id and h.decided_at is null limit 1), 'team_check') end)
                                   from public.kr8_reward_claims c where c.id = z.claim_id)))
                       from public.kr8_prizes z where z.member_id = m.user_id and z.status <> 'cancelled'), '[]'::jsonb),
    'this_week', jsonb_build_object('rings', (public.kr8_score_breakdown(m.user_id) ->> 'rings')::int, 'rank', (public.kr8_score_breakdown(m.user_id) ->> 'rank')::int),
    'founding_seats_left', public.kr8_seats_left(),
    'do_not_autosend', public.kr8_blocklist_hit(m.user_id) is not null
       or exists (select 1 from public.kr8_account_links l where (l.a = m.user_id or l.b = m.user_id) and l.dismissed_at is null and l.reason in ('face', 'device'))
  )
  from public.kr8_members m where m.user_id = p_user
$$;
revoke all on function public.kr8_help_facts(uuid) from public, anon, authenticated;
grant execute on function public.kr8_help_facts(uuid) to service_role;
grant execute on function public.kr8_system_notice(uuid, text, text) to service_role;
commit;
