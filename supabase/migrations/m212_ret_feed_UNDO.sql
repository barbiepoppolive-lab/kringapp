-- m212_ret_feed UNDO: drops the three new functions. Nothing else was changed by m212.
-- (Votes members cast through kr8_feed_vote are ordinary kr8_ask_votes rows and stay, like any ▲ upvote.)
begin;
drop function if exists public.kr8_feed_vote(uuid);
drop function if exists public.kr8_feed_vote_cards(int);
drop function if exists public.kr8_feed_new_faces(int);
commit;
