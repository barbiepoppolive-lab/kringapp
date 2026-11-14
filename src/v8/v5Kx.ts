/** Live calls for Card + Rings + Ranking + Places (migration 0044). Every Ring is decided on the server. */
import { v5Client, V5Error, v5ErrCode } from './v5Live';
import { BKK_BBOX, inBangkok, type Brand, type GapState } from './kxLogic';
import type { ReelReady, UploadedReel } from './v5Reel';

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new V5Error('OFFLINE');
  const c = await v5Client();
  let res;
  try { res = await c.rpc(fn, args); } catch (e) { throw new V5Error(v5ErrCode(e)); }
  if (res.error) throw new V5Error(v5ErrCode(res.error));
  return res.data as T;
}

// ───────────── card ─────────────
export interface KxCardExtras { member_no: number | null; ig_handle: string | null; tiktok_handle: string | null; lifetime: number; level: number; week: number;
  week_rank?: number | null; founding_no?: number | null; founding_left?: number | null; founding_thb?: number; has_reel?: boolean | null; prizes?: number | null }
export const kxCardExtras = (user?: string | null) => rpc<KxCardExtras>('kr8_card_extras', { p_user: user || null });
export const kxSetTiktok = (h: string) => rpc<string | null>('kr8_set_tiktok_handle', { p_handle: h });
export const kxRefName = (code: string) => rpc<string | null>('kr8_ref_name', { p_code: code });

// ───────────── the next step (pinned row) ─────────────
export interface KxGap { state: GapState; rank: number | null; rings: number; floor: number; prize_now: number;
  target: { rank: number; need: number; prize: number; open: boolean } | null;
  above: { rank: number; name: string; need: number } | null; behind: { rank: number; diff: number } | null; top10_need: number | null }

// ───────────── rewards ─────────────
export interface KxPrize { id: string; kind: 'weekly' | 'founding'; week: string | null; rank: number | null; founding_no: number | null; amount: number; rings: number | null;
  status: 'won' | 'claimed'; claim_id: string | null; created_at: string }
export interface KxClaim { id: string; brand: Brand; amount: number; status: 'assigned' | 'pending'; value: number | null; code: string | null;
  activation_url: string | null; used_at: string | null; created_at: string; assigned_at: string | null;
  kind: 'weekly' | 'founding' | null; week: string | null; rank: number | null; founding_no: number | null }
export interface KxRewards { week: number; rank: number | null; lifetime: number; level: number; gap: KxGap | null; ends_at: string; member_no: number | null;
  founding_no: number | null; founding_left: number; floor: number; rules?: Record<string, number>; ladder: number[]; streak: number; checked_in_today: boolean;
  prizes: KxPrize[]; claims: KxClaim[] }
export const kxMyRewards = () => rpc<KxRewards>('kr8_my_rewards');
export const kxRules = () => rpc<Record<string, number>>('kr8_rings_rules');
export interface KxWeekResult { week: string; rank: number; rings: number; reel: string | null; prize: { id: string; amount: number; status: 'won' | 'claimed' } | null; line_need: number | null; line_prize: number }
export interface KxCheckin { added: number; streak: number; bonus: number; ready: { id: string; brand: Brand; amount: number; assigned_at: string }[]; prizes?: number; result?: KxWeekResult | null }
export const kxCheckin = () => rpc<KxCheckin>('kr8_checkin');
export type KxClaimResult = { status: 'assigned'; claim_id: string; brand: Brand; amount: number; value: number; code: string; activation_url: string | null }
  | { status: 'pending'; claim_id: string; brand: Brand; amount: number; value?: number };
function deviceId(): string {
  try {
    let d = localStorage.getItem('kr8_device');
    if (!d || !/^[A-Za-z0-9-]{16,64}$/.test(d)) { d = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}abcdef`).slice(0, 40); localStorage.setItem('kr8_device', d); }
    return d;
  } catch { return ''; }
}
/** One tap: the prize the member won, on the app they pick. The server decides everything. */
export const kxClaimPrize = (prize: string, brand: Brand) => rpc<KxClaimResult>('kr8_claim_prize', { p_prize: prize, p_brand: brand, p_device: deviceId() || null });
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
export interface KxMathReel { post_id: string; posted_at: string; poster_path: string | null; place: string | null; place_th: string | null;
  l_local: number; l_trav: number; s_local: number; s_trav: number; opens: number; score: number }
export interface KxBreakdown { user_id: string; first_name: string; is_me: boolean; rings: number; rank: number | null; more: number;
  weights: { like: number; save: number; open: number; mult: number; cap: number; best: number }; reels: KxMathReel[] }
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

// ───────────── saved Reels ─────────────
export interface KxSavedReel { id: string; poster_path: string; video_path: string; likes: number; name: string; saved_at: string }
export const kxSavedReels = () => rpc<KxSavedReel[]>('kr8_my_saved_reels', { p_limit: 60 });

// ───────────── places ─────────────
export interface KxPlace { id: string; name_en: string; name_th: string | null; area: string; kr_area?: string; lat?: number; lng?: number; photo_url: string | null;
  dist_m?: number | null; reels?: number; here_now?: number; source?: 'kring' | 'photon'; osm_ref?: string }
export const kxSearchPlaces = (q: string, lat: number | null, lng: number | null, limit = 20) =>
  rpc<KxPlace[]>('kr8_places_search', { p_q: q || null, p_lat: lat, p_lng: lng, p_limit: limit });
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
