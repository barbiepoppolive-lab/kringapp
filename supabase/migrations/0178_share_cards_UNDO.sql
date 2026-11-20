drop function if exists public.kr8_share_card(text, text);
drop function if exists public.kr8_profile_card(uuid, text);
-- bucket kr8-og: empty it in Storage, then: delete from storage.buckets where id = 'kr8-og';
