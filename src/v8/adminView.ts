/**
 * Admin view (17 Nov, founder): kringapp.com/app/?admin=1 opens the whole app for an admin sign-in that has no member card.
 *
 *   · ?admin=1 is remembered on this phone (localStorage kr8_admin_view) until "Exit admin view" (or ?admin=0).
 *   · The server decides who is an admin (kr8_admin_view_ok, 0077). A non-admin who opens ?admin=1 gets nothing extra:
 *     the flag is cleared and the app behaves exactly as before.
 *   · Read-only and invisible: while it is on, every database call that writes, logs or counts is stopped here, before it
 *     leaves the phone (allow-list of read calls below). The server refuses the same writes for a card-less admin too (0077).
 */

const KEY = 'kr8_admin_view';

/** Read-only database calls the admin view may make. Everything else (likes, saves, hellos, views, opens, touch, logs…) is refused. */
export const ADMIN_VIEW_READS: ReadonlySet<string> = new Set([
  'kr8_admin_view_ok', 'kr8_is_admin', 'kr8_admin_reels',
  'kr8_me', 'kr8_people', 'kr8_profile', 'kr8_feed', 'kr8_feed_ranked', 'kr8_feed_extras', 'kr8_member_reels', 'kr8_reel_people', 'kr8_reel_awards_list',
  'kr8_follow_list', 'kr8_place_page', 'kr8_places_search', 'kr8_places_search2', 'kr8_tag_places', 'kr8_recent_places',
  'kr8_ask_feed', 'kr8_ask_thread', 'kr8_inbox', 'kr8_thread_messages', 'kr8_thread_translations',
  'kr8_weekly_ranking', 'kr8_top10', 'kr8_score_breakdown', 'kr8_rings_rules', 'kr8_reward_start', 'kr8_recent_claims',
  'kr8_treats_live', 'kr8_listings_live', 'kr8_stand_info', 'kr8_team_ids', 'kr8_gender_shown', 'kr8_card_extras',
  'kr8_my_rewards', 'kr8_my_saves', 'kr8_my_saved_reels', 'kr8_my_activity', 'kr8_my_blocks', 'kr8_my_ghost',
  'kr8_coach_state', 'kr8_social_status', 'kr8_reel_comments', 'kr8_comment_counts', 'kr8_ref_name', 'kr8_card_print_ok', 'kr8_am_founder',
]);

/**
 * 18 Nov "View as member" (admin → More): the admin page frames the app with ?mirror=1 and gives it its own in-memory storage
 * (index.html sets window.__kr8Mirror). The app looks exactly like a member's (no admin pill, no read-only banner), but the same
 * guard stops every write before it leaves the phone. The server refuses the mirror's writes too (0110).
 */
export const MIRROR_EXTRA_READS: ReadonlySet<string> = new Set([
  'kr8_seats_left', 'kr8_my_face_status', 'kr8_my_verification', 'kr8_my_verify_files', 'kr8_my_reel_files', 'kr8_ask_thread',
  'kr8_promo_get', 'kr8_web_reels_get', 'kr8_tag_candidates', 'kr8_my_invites',
]);
export function mirrorActive(): boolean {
  try { return typeof window !== 'undefined' && !!(window as unknown as { __kr8Mirror?: unknown }).__kr8Mirror; } catch { return false; }
}
/** The mirror's persona ('visitor' | 'newmember' | 'member'), or null outside the View-as-member frame. */
export function mirrorPersona(): string | null {
  if (!mirrorActive()) return null;
  return String((window as unknown as { __kr8Mirror: { persona?: string } }).__kr8Mirror.persona || 'visitor');
}

let active = false;

function store(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/**
 * Read once when the app starts: ?admin=1 turns the wish on (and is removed from the address bar), ?admin=0 turns it off.
 * Returns true when this phone wants the admin view. It is only switched on after the server says the sign-in is an admin.
 */
export function adminViewWanted(loc: { search: string; pathname: string; hash: string } | null = typeof location !== 'undefined' ? location : null): boolean {
  const s = store();
  try {
    if (loc) {
      const q = new URLSearchParams(loc.search);
      const v = q.get('admin');
      if (v === '1' || v === '0') {
        if (v === '1') s?.setItem(KEY, '1'); else s?.removeItem(KEY);
        q.delete('admin');
        const rest = q.toString();
        if (typeof history !== 'undefined' && loc === (typeof location !== 'undefined' ? location : null)) {
          history.replaceState(history.state, '', loc.pathname + (rest ? '?' + rest : '') + loc.hash);
        }
        if (v === '1') return true;
      }
    }
    return s?.getItem(KEY) === '1';
  } catch { return false; }
}

/** Switched on (server said admin) or off (not an admin / Exit). Off also forgets the wish on this phone. */
export function setAdminViewActive(on: boolean): void {
  active = on;
  if (!on) { try { store()?.removeItem(KEY); } catch { /* private mode */ } }
}

export function adminViewActive(): boolean {
  return active;
}

/** True when this call must not leave the phone (admin view on and the call is not a read). */
export function adminViewBlocks(fn: string): boolean {
  if (mirrorActive()) return !ADMIN_VIEW_READS.has(fn) && !MIRROR_EXTRA_READS.has(fn);
  return active && !ADMIN_VIEW_READS.has(fn);
}

/** The error a stopped call returns (the app shows "Admin view · read-only"). */
export const ADMIN_VIEW_ERR = 'KR8_ADMIN_VIEW';

/** Sheets that would make a card, post, say hi, claim or log something: never opened in the admin view. */
export const ADMIN_VIEW_NO_SHEETS: ReadonlySet<string> = new Set([
  'v5card', 'post', 'hi', 'claim', 'claimed', 'redeem', 'verify', 'reelNudge', 'notifprompt', 'locationprompt', 'interests',
  'review', 'ticket', 'mycode', 'passport', 'choose', 'follow', 'blocked', 'pdpa', 'story',
]);

/** Admin pages next to the app (/app/admin.html). */
export function adminPanelHref(base = '/app/'): string {
  return base.replace(/\/?$/, '/') + 'admin.html';
}

/**
 * Wraps a Supabase client so the admin view can never write: rpc() for a non-read call resolves to an error without any network
 * request, and storage uploads are refused. When the admin view is off the client behaves exactly as before.
 */
export function guardClient<C extends { rpc: (...a: never[]) => unknown; storage?: unknown }>(c: C): C {
  const g = c as unknown as { rpc: (fn: string, args?: unknown, opts?: unknown) => unknown; storage?: { from: (b: string) => Record<string, unknown> }; __kr8Guarded?: boolean };
  if (g.__kr8Guarded) return c;
  g.__kr8Guarded = true;
  const rpc = g.rpc.bind(c);
  g.rpc = (fn: string, args?: unknown, opts?: unknown) => (adminViewBlocks(fn) ? blockedBuilder() : rpc(fn, args, opts));
  const st = g.storage;
  if (st && typeof st.from === 'function') {
    const from = st.from.bind(st);
    st.from = (b: string) => {
      const o = from(b);
      if (!o || typeof o !== 'object') return o;
      return new Proxy(o, {
        get(t, k, r) {
          const v = Reflect.get(t, k, r);
          if ((active || mirrorActive()) && (k === 'upload' || k === 'update' || k === 'remove' || k === 'move' || k === 'copy') && typeof v === 'function') {
            return async () => ({ data: null, error: { message: ADMIN_VIEW_ERR } });
          }
          return typeof v === 'function' ? v.bind(t) : v;
        },
      });
    };
  }
  return c;
}

/** A stand-in for PostgREST's builder: awaitable, .select() / .single() chain to itself, always { error: KR8_ADMIN_VIEW }. */
function blockedBuilder() {
  const res = { data: null, error: { message: ADMIN_VIEW_ERR, code: 'KR8_ADMIN_VIEW' }, count: null, status: 403, statusText: 'admin view' };
  const b: Record<string, unknown> = {
    then: (ok?: (v: typeof res) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(res).then(ok, bad),
    catch: (bad?: (e: unknown) => unknown) => Promise.resolve(res).catch(bad),
    finally: (f?: () => void) => Promise.resolve(res).finally(f),
  };
  for (const k of ['select', 'single', 'maybeSingle', 'limit', 'order', 'eq', 'abortSignal']) b[k] = () => b;
  return b;
}
