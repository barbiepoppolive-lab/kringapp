-- Face threshold calibration (0124). READS ONLY: it builds one TEMP table (gone at the end) and ends with ROLLBACK,
-- so no real table is written. (Postgres refuses temp tables in a read-only transaction, hence plain BEGIN.)
--
-- Run on live (pick one):
--   psql "$LIVE_DB_URL" -f tools/fakefinder/face_calibrate.sql            (prints every section)
--   Supabase SQL editor: paste the whole file → Run. The editor shows only the LAST result = section 7 (everything as one JSON).
--
-- What it measures: every pair of face-api face codes (kr8_face_prints), split by the kind of pair
--   vv    = face check vs face check (verify / selfie / backfill-selfie)
--   cc    = card photo vs card photo
--   cv    = card photo vs face check
--   claim = any pair that includes a claim-time face code
-- and by what we KNOW about the pair:
--   self        two codes of the SAME account (the same person: the "same" side of the scale)
--   linked      different accounts the team or the robots already linked as one person (non-dismissed 'device' link, or an
--               SFace 'face' link, or one of the two is a ghost) — usually the same person
--   not_same    different accounts the founder marked "not the same person" (dismissed link) — known DIFFERENT people
--   other       every other pair of different accounts (almost all different people)
-- Lower distance = more alike. Pick per kind: face_same_max_* under the lowest 'other' / 'not_same' distance (with a margin),
-- face_maybe_max_* around the low end of 'other' (p01-p02). Then:
--   update kr8_rings_config set value = <thousandths> where key = 'face_same_max_vv';   (… _cc, _cv, face_maybe_max_*)
begin;
set local statement_timeout = '120s';

create temp table _cal on commit drop as
with p as (
  select f.id, f.user_id, f.source, f.descriptor,
         case when f.source = 'claim' then 'claim' when f.source in ('card', 'backfill-card') then 'c' else 'v' end k
  from public.kr8_face_prints f
)
select a.id ida, b.id idb, a.user_id ua, b.user_id ub, a.source sa, b.source sb,
       case when 'claim' in (a.k, b.k) then 'claim' when a.k = 'v' and b.k = 'v' then 'vv' when a.k = 'c' and b.k = 'c' then 'cc' else 'cv' end kind,
       case when a.user_id = b.user_id then 'self'
            when exists (select 1 from public.kr8_account_links l where l.a = least(a.user_id, b.user_id) and l.b = greatest(a.user_id, b.user_id)
                           and l.dismissed_at is null and (l.reason = 'device' or (l.reason = 'face' and l.detail ? 'sface_sim'))) then 'linked'
            when exists (select 1 from public.kr8_members g where g.user_id in (a.user_id, b.user_id) and g.ghost) then 'linked'
            when exists (select 1 from public.kr8_account_links l where l.a = least(a.user_id, b.user_id) and l.b = greatest(a.user_id, b.user_id)
                           and l.dismissed_at is not null and not (l.detail ? '0124')) then 'not_same'
            else 'other' end label,
       public.kr8_face_dist(a.descriptor, b.descriptor) d
from p a join p b on a.id < b.id;

-- 1 · distribution per kind of pair and label
select kind, label, count(*) pairs,
       round(min(d)::numeric, 3) min,
       round(percentile_cont(0.01) within group (order by d)::numeric, 3) p01,
       round(percentile_cont(0.05) within group (order by d)::numeric, 3) p05,
       round(percentile_cont(0.10) within group (order by d)::numeric, 3) p10,
       round(percentile_cont(0.25) within group (order by d)::numeric, 3) p25,
       round(percentile_cont(0.50) within group (order by d)::numeric, 3) median,
       round(percentile_cont(0.90) within group (order by d)::numeric, 3) p90,
       round(max(d)::numeric, 3) max
from _cal group by kind, label order by kind, label;

-- 2 · histogram (0.05 wide, 0.20 → 0.80) per kind: how many pairs of each label in each band
select kind, to_char(floor(d * 20) / 20, 'FM0.00') || '–' || to_char(floor(d * 20) / 20 + 0.05, 'FM0.00') band,
       count(*) filter (where label = 'self') self, count(*) filter (where label = 'linked') linked,
       count(*) filter (where label = 'not_same') not_same, count(*) filter (where label = 'other') other
from _cal where d < 0.80 group by kind, floor(d * 20) order by kind, floor(d * 20);

-- 3 · the 25 closest pairs of DIFFERENT accounts per kind (check these photos by eye in admin)
select * from (
  select kind, label, round(d::numeric, 3) dist, ma.member_no a_no, ma.first_name a_name, sa a_source, mb.member_no b_no, mb.first_name b_name, sb b_source,
         row_number() over (partition by kind order by d) rn
  from _cal c left join public.kr8_members ma on ma.user_id = c.ua left join public.kr8_members mb on mb.user_id = c.ub
  where label <> 'self') x
where rn <= 25 order by kind, dist;

-- 4 · the farthest "same account" pairs per kind (how far apart one person's own codes can be)
select * from (
  select kind, round(d::numeric, 3) dist, m.member_no, m.first_name, sa, sb, row_number() over (partition by kind order by d desc) rn
  from _cal c left join public.kr8_members m on m.user_id = c.ua where label = 'self') x
where rn <= 10 order by kind, dist desc;

-- 5 · suggestion per kind: same_max = 0.03 under the closest pair of different accounts (other / not_same), never above
--     the old 0.50; maybe_max = p02 of the other pairs. 'self_caught' = share of same-account pairs the suggested same_max catches.
with diff as (select kind, min(d) dmin, percentile_cont(0.02) within group (order by d) p02 from _cal where label in ('other', 'not_same') group by kind),
     sug as (select kind, greatest(0, least(0.50, floor((dmin - 0.03) * 100) / 100)) same_max, floor(p02 * 100) / 100 maybe_max from diff)
select s.kind, s.same_max suggested_same_max, s.maybe_max suggested_maybe_max,
       round(100.0 * (select count(*) from _cal c where c.kind = s.kind and c.label = 'self' and c.d <= s.same_max)
             / nullif((select count(*) from _cal c where c.kind = s.kind and c.label = 'self'), 0), 1) self_caught_pct,
       (select count(*) from _cal c where c.kind = s.kind and c.label in ('other', 'not_same') and c.d <= s.maybe_max) other_flagged_as_maybe
from sug s order by s.kind;

-- 6 · current settings
select key, value, note from public.kr8_rings_config where key like 'face\_%' escape '\' order by key;

-- 7 · everything in one JSON (for the Supabase SQL editor, which shows only the last result)
select jsonb_build_object(
  'at', now(),
  'distribution', (select jsonb_agg(to_jsonb(x) order by x.kind, x.label) from (
      select kind, label, count(*) pairs, round(min(d)::numeric, 3) min,
             round(percentile_cont(0.01) within group (order by d)::numeric, 3) p01, round(percentile_cont(0.05) within group (order by d)::numeric, 3) p05,
             round(percentile_cont(0.50) within group (order by d)::numeric, 3) median, round(max(d)::numeric, 3) max
      from _cal group by kind, label) x),
  'closest_different', (select jsonb_agg(to_jsonb(x) order by x.kind, x.dist) from (
      select * from (select kind, label, round(d::numeric, 3) dist, ma.member_no a_no, sa, mb.member_no b_no, sb, row_number() over (partition by kind order by d) rn
                     from _cal c left join public.kr8_members ma on ma.user_id = c.ua left join public.kr8_members mb on mb.user_id = c.ub where label <> 'self') y
      where rn <= 15) x),
  'farthest_self', (select jsonb_agg(to_jsonb(x) order by x.kind, x.dist desc) from (
      select * from (select kind, round(d::numeric, 3) dist, m.member_no, sa, sb, row_number() over (partition by kind order by d desc) rn
                     from _cal c left join public.kr8_members m on m.user_id = c.ua where label = 'self') y where rn <= 5) x),
  'suggested', (select jsonb_agg(jsonb_build_object('kind', kind, 'same_max', greatest(0, least(0.50, floor((dmin - 0.03) * 100) / 100)), 'maybe_max', floor(p02 * 100) / 100))
      from (select kind, min(d) dmin, percentile_cont(0.02) within group (order by d) p02 from _cal where label in ('other', 'not_same') group by kind) z),
  'settings', (select jsonb_object_agg(key, value) from public.kr8_rings_config where key like 'face\_%' escape '\'));

rollback;
