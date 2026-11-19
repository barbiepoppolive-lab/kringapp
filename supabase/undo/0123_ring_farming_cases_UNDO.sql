-- UNDO for 0123 (Ring-farming check): puts the three patched lines back (board, breakdown, prize claim), then drops the new functions.
-- The two tables (kr8_farm_decisions, kr8_farm_log) are KEPT so the founder's decision history is not lost; drop them by hand if wanted.
begin;

create or replace function pg_temp.kr8_unpatch_fn(p_sig text, p_old text, p_new text) returns text language plpgsql as $$
declare f regprocedure := to_regprocedure(p_sig); def text;
begin
  if f is null then return 'missing'; end if;
  def := pg_get_functiondef(f);
  if position(p_old in def) = 0 then raise notice '0123 undo: % was not patched', p_sig; return 'clean'; end if;
  execute replace(def, p_old, p_new);
  raise notice '0123 undo: % restored', p_sig;
  return 'restored';
end $$;

select pg_temp.kr8_unpatch_fn('public.kr8_week_board(timestamptz, boolean)', 'public.kr8_reel_scores_adj(', 'public.kr8_reel_scores(');
select pg_temp.kr8_unpatch_fn('public.kr8_score_breakdown(uuid)', 'public.kr8_reel_scores_adj(', 'public.kr8_reel_scores(');
select pg_temp.kr8_unpatch_fn('public.kr8_claim_prize(uuid, text, text, real[], text)',
  E'  if public.kr8_farm_prize_held(uid, pz.week, pz.kind) then review := array_append(review, ''ring_farming''); end if;   -- 0123: Hold prize (Ring-farming check)\n', '');

drop function if exists public.kr8_admin_farming_decide(uuid, text, uuid[], text);
drop function if exists public.kr8_admin_farming_cases();
drop function if exists public.kr8_reel_scores_adj(timestamptz, timestamptz, timestamptz, boolean, uuid);
drop function if exists public.kr8_farm_minus(timestamptz, boolean);
drop function if exists public.kr8_farm_rings_if(timestamptz, uuid, text, uuid[]);
drop function if exists public.kr8_farm_cut(timestamptz, boolean, uuid, text, uuid[]);
drop function if exists public.kr8_farm_prize_held(uuid, date, text);

commit;
