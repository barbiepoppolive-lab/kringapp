-- m220 UNDO. Reels already set profile-only by the new button keep feed_off = true with reason 'q:<key>' (the old admin
-- "Move to Feed" button still flips them back one by one).
begin;
drop function if exists public.kr8_my_profile_only();
drop function if exists public.kr8_admin_reel_profile_only(uuid, text);
drop function if exists public.kr8_profile_only_reasons();
drop function if exists public.kr8_onb_follow_suggest(int);
commit;
