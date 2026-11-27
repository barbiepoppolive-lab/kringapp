/** Live calls for Card + Rings + Ranking + Places (migration 0044). Every Ring is decided on the server. */
import { v5Client, V5Error, v5ErrCode } from './v5Live';
import { sharedRead } from './rpcShare';
import { kr8DeviceId } from './deviceId';
import { areaCentre, BKK_BBOX, inBangkok, type Brand, type GapState } from './kxLogic';
import type { ReelReady, UploadedReel } from './v5Reel';

function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  return sharedRead(fn, args, () => rpcRaw<T>(fn, args));   // K-006: identical reads a few seconds apart share one request
}
async function rpcRaw<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new V5Error('OFFLINE');
  const c = await v5Client();
  let res;
  try { res = await c.rpc(fn, args); } catch (e) { throw new V5Error(v5ErrCode(e)); }
  if (res.error) throw new V5Error(v5ErrCode(res.error));
  return res.data as T;
}

// ───────────── 0078: "Show my Reels on the web" (off until the member says yes; public pages on kringapp.com) ─────────────
export interface KxWebReels { on: boolean | null; asked: boolean; has_reel: boolean }
export const kxWebReelsGet = () => rpc<KxWebReels | null>('kr8_web_reels_get');
export const kxSetWebReels = (on: boolean) => rpc<boolean>('kr8_set_web_reels', { p_on: on });

// ───────────── card ─────────────
export interface KxCardExtras { member_no: number | null; ig_handle: string | null; tiktok_handle: string | null; lifetime: number; level: number; week: number;
  week_rank?: number | null; founding_no?: number | null; founding_left?: number | null; founding_thb?: number; has_reel?: boolean | null; prizes?: number | null;
  /** proposal 0114 (not live yet): a name-style code like NAT44; absent → the app shows K00037 */
  vanity_code?: string | null }
export const kxCardExtras = (user?: string | null) => rpc<KxCardExtras>('kr8_card_extras', { p_user: user || null });
export const kxSetTiktok = (h: string) => rpc<string | null>('kr8_set_tiktok_handle', { p_handle: h });
export const kxRefName = (code: string) => rpc<string | null>('kr8_ref_name', { p_code: code });
/** 27 Nov (m238): the inviter's first name + card photo for the invite welcome card (verified, visible adults only; else null). */
export const kxRefCard = (code: string) => rpc<{ name: string; photo: string | null } | null>('kr8_ref_card', { p_code: code });

// ───────────── the next step (pinned row) ─────────────
export interface KxGap { state: GapState; rank: number | null; rings: number; floor: number; prize_now: number;
  target: { rank: number; need: number; prize: number; open: boolean } | null;
  above: { rank: number; name: string; need: number } | null; behind: { rank: number; diff: number } | null; top10_need: number | null }

// ───────────── rewards ─────────────
export interface KxPrize { id: string; kind: 'weekly' | 'founding'; week: string | null; rank: number | null; founding_no: number | null; amount: number; rings: number | null;
  status: 'won' | 'claimed'; claim_id: string | null; created_at: string;
  /** 0066: a weekly prize waiting for the founder's check opens at this time (null = claimable now) */
  opens_at?: string | null }
export interface KxClaim { id: string; brand: Brand; amount: number; status: 'assigned' | 'pending'; value: number | null; code: string | null;
  activation_url: string | null; used_at: string | null; created_at: string; assigned_at: string | null;
  kind: 'weekly' | 'founding' | null; week: string | null; rank: number | null; founding_no: number | null }
export interface KxRewards { week: number; rank: number | null; lifetime: number; level: number; gap: KxGap | null; ends_at: string; member_no: number | null;
  founding_no: number | null; founding_left: number; floor: number; rules?: Record<string, number>; ladder: number[]; streak: number; checked_in_today: boolean;
  prizes: KxPrize[]; claims: KxClaim[];
  /** 0066 (absent before the migration) */
  line_linked?: boolean; claim_needs_line?: boolean; claim_face_check?: boolean }
export const kxMyRewards = () => rpc<KxRewards>('kr8_my_rewards');
export const kxRules = () => rpc<Record<string, number>>('kr8_rings_rules');
export interface KxWeekResult { week: string; rank: number; rings: number; reel: string | null; prize: { id: string; amount: number; status: 'won' | 'claimed' } | null; line_need: number | null; line_prize: number }
export interface KxCheckin { added: number; streak: number; bonus: number; ready: { id: string; brand: Brand; amount: number; assigned_at: string }[]; prizes?: number; result?: KxWeekResult | null }
export const kxCheckin = () => rpc<KxCheckin>('kr8_checkin');
/** 22 Nov: last closed week's Top 3 for the everyone-celebration (null when no week has closed yet). */
export interface KxTop3 { week: string; top: { rank: number; name: string; photo: string | null; rings: number }[] }
export const kxTop3 = () => rpc<KxTop3 | null>('kr8_last_week_top3');
export type KxClaimResult = { status: 'assigned'; claim_id: string; brand: Brand; amount: number; value: number; code: string; activation_url: string | null }
  | { status: 'pending'; claim_id: string; brand: Brand; amount: number; value?: number };
/** the phone id prize claims send (0124: shared with client events, see deviceId.ts) */
function deviceId(): string { return kr8DeviceId(); }
/** One tap: the prize the member won, on the app they pick. The server decides everything. */
export const kxClaimPrize = (prize: string, brand: Brand, face?: Float32Array | number[] | null, selfie?: string | null) =>
  rpc<KxClaimResult>('kr8_claim_prize', { p_prize: prize, p_brand: brand, p_device: deviceId() || null, p_face: face ? Array.from(face, (x) => Math.round(x * 1e6) / 1e6) : null,
    // 0075: the claim photo (path in the private kr8-verify bucket); the server holds the claim for the founder without it
    ...(selfie ? { p_selfie: selfie } : {}) });
export const kxMarkUsed = (claim: string, used: boolean) => rpc<boolean>('kr8_mark_reward_used', { p_claim: claim, p_used: used });
export interface KxRecent { first_name: string; photo: string | null; brand: Brand; amount: number; value: number; at: string }
export const kxRecentClaims = (n = 8) => rpc<KxRecent[]>('kr8_recent_claims', { p_limit: n });

// ───────────── ranking ─────────────
export type KxScope = 'all' | 'area' | 'friends';
export interface KxRankRow { rank: number; all_rank: number; rings: number; prize: number; paid: boolean; needs: number | null; to_line: number | null; is_new?: boolean;
  user_id: string; first_name: string; photo: string | null; area: string; move: number | null; is_me: boolean }
export interface KxRanking { week_start: string; ends_at: string; scope: KxScope; area: string | null; total: number; paid_ranks: number; floor: number; posters: number;
  min_posters: number; payout_on: boolean; open_seats: number; prizes: number[]; rows: KxRankRow[];
  me: { rank: number; all_rank: number; rings: number; prize: number; move: number | null } | null; gap: KxGap | null;
  mine: { pending: number; live: number; no_place: number } | null }
export const kxRanking = (scope: KxScope) => rpc<KxRanking>('kr8_weekly_ranking', { p_scope: scope });
/** 0096: Founding Local paid seats left (of 50) — one integer, null when Founding Local is off. Never voucher stock. */
export const kxSeatsLeft = () => rpc<number | null>('kr8_seats_left');
export interface KxMathReel { post_id: string; posted_at: string; poster_path: string | null; place: string | null; place_th: string | null;
  l_local: number; l_trav: number; s_local: number; s_trav: number; opens: number; score: number }
export interface KxBreakdown { user_id: string; first_name: string; is_me: boolean; rings: number; rank: number | null; more: number; invites?: number;
  weights: { like: number; save: number; open: number; mult: number; cap: number; best: number }; reels: KxMathReel[] }
/** 0109: friends who joined with my link and passed the face check (Me line). null when signed out or the server is older. */
export const kxMyInvites = () => rpc<{ friends: number; rings: number; x: number } | null>('kr8_my_invites');
export const kxBreakdown = (user: string) => rpc<KxBreakdown>('kr8_score_breakdown', { p_user: user });

// ───────────── share link (/r/<short>) ─────────────
const shortCache = new Map<string, string>();
/** https://kringapp.com/r/<short> (same host as the app, so previews work too). Opens are logged by the website before it sends people to the Reel. */
export async function kxShareLink(post: string): Promise<string> {
  let s = shortCache.get(post);
  if (!s) { s = await rpc<string>('kr8_reel_share_link', { p_post: post }); if (s) shortCache.set(post, s); }
  return `${location.origin}/r/${s}`;
}
export const kxShareLinkCached = (post: string) => (shortCache.has(post) ? `${location.origin}/r/${shortCache.get(post)}` : null);
export const kxShareOpenSeen = (open: string) => rpc<boolean>('kr8_share_open_seen', { p_open: open }).catch(() => false);
/** 0182: how many members without a face check liked my Reel (board v2) → the friend-verify line in My Reel stats */
export const kxReelUnvLikes = (post: string) => rpc<number>('kr8_reel_unv_likes', { p_post: post }).then((n) => Number(n) || 0).catch(() => 0);

// ───────────── saved Reels ─────────────
export interface KxSavedReel { id: string; poster_path: string; video_path: string; likes: number; name: string; saved_at: string }
export const kxSavedReels = () => rpc<KxSavedReel[]>('kr8_my_saved_reels', { p_limit: 60 });

// ───────────── places ─────────────
export interface KxPlace { id: string; name_en: string; name_th: string | null; area: string; kr_area?: string; lat?: number; lng?: number; photo_url: string | null;
  dist_m?: number | null; reels?: number; here_now?: number; source?: 'kring' | 'photon'; osm_ref?: string; status?: 'live' | 'pending' | 'rejected';
  /** 0072: typed place outside Bangkok (area 'Outside Bangkok'); its Reels don't count on the weekly board */ outside_bkk?: boolean }
/** kr8_places_search2 (0054: also returns the member's own pending places); falls back to kr8_places_search before 0054 is applied. */
export const kxSearchPlaces = (q: string, lat: number | null, lng: number | null, limit = 20) => {
  const args = { p_q: q || null, p_lat: lat, p_lng: lng, p_limit: limit };
  return rpc<KxPlace[]>('kr8_places_search2', args).catch((e) => {
    if (e instanceof V5Error && e.code === 'OFFLINE') throw e;
    return rpc<KxPlace[]>('kr8_places_search', args);
  });
};
/**
 * The member adds a place Kring doesn't know (0054 kr8_member_add_place: pending, admin approves).
 * Before 0054 is applied the older kr8_add_place is used (same rules, area-centre pin), so the button works either way.
 */
export async function kxMemberAddPlace(name: string, area: string, mapsUrl: string, at: { lat: number; lng: number } | null): Promise<KxPlace> {
  try {
    return await rpc<KxPlace>('kr8_member_add_place', { p_name: name, p_area: area, p_maps_url: mapsUrl || null, p_lat: at?.lat ?? null, p_lng: at?.lng ?? null });
  } catch (e) {
    const code = e instanceof V5Error ? e.code : '';
    if (['OFFLINE', 'SIGN_IN', 'NO_CARD', 'BAD_PLACE', 'SLOW_DOWN'].includes(code)) throw e;
    const c = at || areaCentre(area);
    const thai = /[\u0E00-\u0E7F]/.test(name);
    const id = await rpc<string>('kr8_add_place', { p_name_en: name, p_name_th: thai ? name : null, p_area: area, p_lat: c.lat, p_lng: c.lng, p_osm_ref: null });
    return { id, name_en: name, name_th: thai ? name : null, area, kr_area: 'Bangkok', lat: c.lat, lng: c.lng, photo_url: null, status: 'live' };
  }
}
export const kxAddPlace = (p: KxPlace) => rpc<string>('kr8_add_place', { p_name_en: p.name_en, p_name_th: p.name_th, p_area: p.area, p_lat: p.lat, p_lng: p.lng, p_osm_ref: p.osm_ref || null });
export interface KxPlacePage { place: { id: string; name_en: string; name_th: string | null; area: string; kr_area: string; lat: number; lng: number; photo_url: string | null; photo_credit: string | null };
  reels_count: number; here_now: number; faces: string[]; top: KxPlaceReel[]; recent: KxPlaceReel[] }
export interface KxPlaceReel { id: string; poster_path: string; video_path: string; likes: number; name: string }
export const kxPlacePage = (id: string) => rpc<KxPlacePage | null>('kr8_place_page', { p_id: id });
export interface KxFeedExtra { post_id: string; tiktok: string | null; places: { id: string; name_en: string; name_th: string | null; photo_url: string | null; area: string; here_now: number }[] }
export const kxFeedExtras = (ids: string[]) => (ids.length ? rpc<KxFeedExtra[]>('kr8_feed_extras', { p_posts: ids.slice(0, 100) }) : Promise.resolve([] as KxFeedExtra[]));
/** "/app/media/places/x.jpg" → same-site URL (works on previews too); https URLs as they are. */
export const placePhoto = (u: string | null | undefined) => (!u ? '' : /^https:\/\//.test(u) ? u : u.startsWith('/app/media/places/') ? `${(import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/app/'}media/places/${u.split('/').pop()}` : '');

interface PhotonFeature { properties: { osm_type?: string; osm_id?: number; name?: string; district?: string; locality?: string; city?: string; street?: string }; geometry: { coordinates: [number, number] } }
/** Free fallback: the public Photon geocoder, Bangkok box only, called from the phone. */
export async function kxPhoton(q: string, lat?: number | null, lng?: number | null): Promise<KxPlace[]> {
  if (q.trim().length < 2) return [];
  const u = new URL('https://photon.komoot.io/api/');
  u.searchParams.set('q', q.trim());
  u.searchParams.set('lat', String(lat ?? 13.75));
  u.searchParams.set('lon', String(lng ?? 100.5));
  u.searchParams.set('limit', '8');
  u.searchParams.set('lang', 'en');
  u.searchParams.set('bbox', `${BKK_BBOX.minLng},${BKK_BBOX.minLat},${BKK_BBOX.maxLng},${BKK_BBOX.maxLat}`);
  const r = await fetch(u.toString());
  if (!r.ok) return [];
  const j = (await r.json()) as { features?: PhotonFeature[] };
  const seen = new Set<string>();
  return (j.features || []).flatMap((f) => {
    const [x, y] = f.geometry.coordinates;
    const name = (f.properties.name || '').trim();
    if (!name || !inBangkok(y, x)) return [];
    const key = name.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    const ref = f.properties.osm_type && f.properties.osm_id ? `${f.properties.osm_type}${f.properties.osm_id}` : undefined;
    return [{ id: `photon:${ref || key}`, name_en: name.slice(0, 80), name_th: null, area: (f.properties.district || f.properties.locality || f.properties.city || 'Bangkok').slice(0, 40),
      lat: y, lng: x, photo_url: null, source: 'photon' as const, osm_ref: ref }];
  });
}

// ───────────── Reels with places (new RPC; old clients keep using kr8_create_reel) ─────────────
export async function kxCreateReel(u: UploadedReel, r: ReelReady, area: string, body: string, here: boolean, placeIds: string[]):
  Promise<{ id: string; status: 'pending' | 'approved'; places: number; rings: number }> {
  return rpc('kr8_create_reel_v2', {
    p_video_path: u.videoPath, p_poster_path: u.posterPath, p_duration_ms: r.durationMs, p_width: r.width, p_height: r.height,
    p_area: area, p_body: body || null, p_here: here, p_place_ids: placeIds.length ? placeIds.slice(0, 2) : null,
  });
}

// ───────────── go-live build (0048): profile grid, tagged people, coach marks ─────────────
export interface KxGridReel { id: string; poster_path: string; video_path: string; body: string | null; created_at: string; status: 'approved' | 'pending' | 'hidden';
  /** own hidden Reel only (0070): the team's reason */ note?: string | null;
  likes: number; saves: number; this_week: boolean; rings: number; place: { id: string; name_en: string; name_th: string | null } | null; liked: boolean; saved: boolean }
export interface KxMemberReels { user_id: string; mine: boolean; best: string | null; reels: KxGridReel[] }
export const kxMemberReels = (user: string) => rpc<KxMemberReels>('kr8_member_reels', { p_user: user, p_limit: 60 });
export interface KxTagPerson { user_id: string; first_name: string; photo: string | null; who?: 'local' | 'traveller'; area?: string; ig_handle?: string | null }
export const kxTagCandidates = (q: string) => rpc<KxTagPerson[]>('kr8_tag_candidates', { p_q: q || null, p_limit: 30 });
export const kxTagPeople = (post: string, users: string[]) => rpc<number>('kr8_reel_tag_people', { p_post: post, p_users: users.slice(0, 5) });
export const kxReelPeople = (ids: string[]) =>
  (ids.length ? rpc<{ post_id: string; people: KxTagPerson[] }[]>('kr8_reel_people', { p_posts: ids.slice(0, 100) }) : Promise.resolve([] as { post_id: string; people: KxTagPerson[] }[]));
export const kxCoachState = () => rpc<string[]>('kr8_coach_state');
export const kxCoachSeen = (key: string) => rpc<boolean>('kr8_coach_seen', { p_key: key }).catch(() => false);
export const kxCoachReset = () => rpc<number>('kr8_coach_reset').catch(() => 0);

// ───────────── optional gender on the card (0050) ─────────────
/** 0070: did the phone's face check run on the card photo just saved? false = it could not (old phone / model not loaded); admin looks by eye. */
export const kxNotePhotoCheck = (ok: boolean) => rpc<void>('kr8_note_photo_check', { p_ok: ok });
export const kxSetGender = (gender: string | null, show: boolean) => rpc<{ gender: 'male' | 'female' | 'kathoey' | null; show_gender: boolean }>('kr8_set_gender', { p_gender: gender, p_show: show });
/** Someone's gender, only if they chose to show it on their card (otherwise null). */
export const kxGenderShown = (user: string) => rpc<string | null>('kr8_gender_shown', { p_user: user }).catch(() => null);
