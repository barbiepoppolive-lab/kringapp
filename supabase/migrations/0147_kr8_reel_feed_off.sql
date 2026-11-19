-- 0147 (19 Nov 2026): "Hide from feed" for Reels (founder: the public feed shows only good Reels; Reel control stays with him).
-- Additive. kr8_posts.feed_off = the Reel stays approved and keeps everything else (the member's profile grid, Rings / ranking,
-- saved lists, its share link) but is left out of the PUBLIC feeds only:
--   kr8_feed (newest-first feed) · kr8_feed_order (the ranked member + visitor feed behind kr8_feed_ranked and /feed0) ·
--   kr8_web_reels (the kringapp.com landing / guest Reels, but not a single Reel opened by its share link).
-- The author still sees their own Reel in the feed (no "my Reel vanished" support chats). Nothing is hidden automatically:
-- only the founder's one tap in admin (kr8_admin_reel_feed) sets it. The 19 Nov clean-up list (kr8_reel_copy_checks.verdict)
-- is a suggestion shown next to the button.
-- The three feed functions are patched in place (one added line each, read from the live definition) so nothing else in
-- them changes; each patch must apply exactly once or the migration stops.

alter table public.kr8_posts add column if not exists feed_off boolean not null default false;
alter table public.kr8_posts add column if not exists feed_off_reason text;
alter table public.kr8_posts add column if not exists feed_off_at timestamptz;
alter table public.kr8_posts add column if not exists feed_off_by uuid;

do $do$
declare
  src text; nsrc text;
  -- {function, anchor (must occur once), text inserted BEFORE the anchor}
  patches text[][] := array[
    array['public.kr8_feed(text,integer)',
          'and p.kind <> ''ask''   -- 0057',
          'and (p.kind <> ''reel'' or not coalesce(p.feed_off, false) or p.author = auth.uid())   -- 0147 Hide from feed' || chr(10) || '    '],
    array['public.kr8_feed_order(text,text)',
          'and p.created_at > now() - make_interval(days => win)',
          'and (p.kind <> ''reel'' or not coalesce(p.feed_off, false) or p.author = uid)   -- 0147 Hide from feed' || chr(10) || '        '],
    array['public.kr8_web_reels(text[],text,integer)',
          'and public.kr8_web_public_post(p.id)',
          'and (s <> '''' or not coalesce(p.feed_off, false))   -- 0147 Hide from feed (a share link still opens it)' || chr(10) || '      ']
  ];
  i int;
begin
  for i in 1 .. array_length(patches, 1) loop
    src := pg_get_functiondef(patches[i][1]::regprocedure);
    if position('0147 Hide from feed' in src) > 0 then continue; end if;   -- already patched
    if (length(src) - length(replace(src, patches[i][2], ''))) / length(patches[i][2]) <> 1 then
      raise exception '0147: anchor not found exactly once in %', patches[i][1];
    end if;
    nsrc := replace(src, patches[i][2], patches[i][3] || patches[i][2]);
    execute nsrc;
  end loop;
end
$do$;

-- One tap in admin: Hide from feed / Show in feed. Admin only. Returns the new state.
create or replace function public.kr8_admin_reel_feed(p_reel uuid, p_off boolean, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  update public.kr8_posts
     set feed_off = coalesce(p_off, false),
         feed_off_reason = case when coalesce(p_off, false) then nullif(left(btrim(coalesce(p_reason, '')), 200), '') end,
         feed_off_at = now(), feed_off_by = auth.uid()
   where id = p_reel and kind = 'reel'
  returning id, feed_off, feed_off_reason into r;
  if r.id is null then raise exception 'KR8_NOT_FOUND'; end if;
  return jsonb_build_object('id', r.id, 'feed_off', r.feed_off, 'reason', r.feed_off_reason);
end $$;
revoke all on function public.kr8_admin_reel_feed(uuid, boolean, text) from public, anon;
grant execute on function public.kr8_admin_reel_feed(uuid, boolean, text) to authenticated;

-- Admin Reel cards: the robot / audit check (0145) + the feed state, for the given Reels. Admin only, read-only.
create or replace function public.kr8_admin_reel_checks(p_ids uuid[])
returns table(post_id uuid, copied boolean, copy_kind text, watermark text, verdict text, reasons text[], feed_off boolean, feed_off_reason text, checked_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.kr8_is_admin() then raise exception 'KR8_ADMIN_ONLY'; end if;
  return query
    select p.id, coalesce(c.copied, false), c.copy_kind, c.watermark, c.verdict, coalesce(c.reasons, '{}'), coalesce(p.feed_off, false), p.feed_off_reason, c.checked_at
      from public.kr8_posts p left join public.kr8_reel_copy_checks c on c.post_id = p.id
     where p.id = any (coalesce(p_ids, '{}')) and p.kind = 'reel'
     limit 500;
end $$;
revoke all on function public.kr8_admin_reel_checks(uuid[]) from public, anon;
grant execute on function public.kr8_admin_reel_checks(uuid[]) to authenticated;
