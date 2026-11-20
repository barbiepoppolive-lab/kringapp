-- 0176 (20 Nov): data for the 1200x630 share-link picture cards (kringapp.com/og/r/<short>.png and /og/u/<id>.png).
-- Server-only: both need the share_open_key (same guard as kr8_share_open / kr8_web_reel_media), so the public can't list anything.
create or replace function public.kr8_share_card(p_short text, p_key text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare k text; r jsonb;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'share_open_key' limit 1;
  -- the kr8-og edge function calls with the service role; kringapp.com functions pass the share_open_key
  if coalesce(auth.role(), '') <> 'service_role' and (k is null or p_key is null or p_key <> k) then raise exception 'KR8_FORBIDDEN'; end if;
  select jsonb_build_object('name', left(split_part(btrim(m.first_name), ' ', 1), 24), 'poster', p.poster_path,
           'area', coalesce(nullif(pl.kr_area, ''), nullif(pl.area, ''), nullif(p.area, ''), 'Bangkok'),
           'place_en', pl.name_en, 'place_th', pl.name_th)
    into r
  from public.kr8_reel_links l
  join public.kr8_posts p on p.id = l.post_id
  join public.kr8_members m on m.user_id = p.author
  left join lateral (select pl.* from public.kr8_post_places pp join public.kr8_places pl on pl.id = pp.place_id
                     where pp.post_id = p.id order by pp.position limit 1) pl on true
  where l.short = lower(coalesce(p_short, '')) and p.kind = 'reel' and p.status = 'approved' and not p.hidden
    and coalesce(p.poster_path, '') <> '' and not coalesce(m.ghost, false)
    and not public.kr8_is_test_member(p.author) and not public.kr8_minor_held(p.author);
  return r;
end $$;

create or replace function public.kr8_profile_card(p_user uuid, p_key text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare k text; r jsonb;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'share_open_key' limit 1;
  -- the kr8-og edge function calls with the service role; kringapp.com functions pass the share_open_key
  if coalesce(auth.role(), '') <> 'service_role' and (k is null or p_key is null or p_key <> k) then raise exception 'KR8_FORBIDDEN'; end if;
  -- the same members People shows: face-verified, real photo, not hidden / test / team / possible under 18
  select jsonb_build_object('name', left(split_part(btrim(m.first_name), ' ', 1), 24), 'photo', m.photo, 'area', coalesce(nullif(m.area, ''), 'Bangkok'))
    into r
  from public.kr8_members m
  where m.user_id = p_user and m.verified and not coalesce(m.ghost, false) and coalesce(m.photo, '') <> ''
    and m.photo_check is distinct from 'no_face'
    and not public.kr8_is_test_member(m.user_id) and not public.kr8_is_team(m.user_id) and not public.kr8_minor_held(m.user_id);
  return r;
end $$;

revoke all on function public.kr8_share_card(text, text) from public;
revoke all on function public.kr8_profile_card(uuid, text) from public;
grant execute on function public.kr8_share_card(text, text) to anon, authenticated;
grant execute on function public.kr8_profile_card(uuid, text) to anon, authenticated;

-- public bucket for the rendered cards (written by the kr8-og edge function with the service role only)
insert into storage.buckets (id, name, public) values ('kr8-og', 'kr8-og', true) on conflict (id) do nothing;
