/**
 * Reel checks on admin Reel cards (19 Nov 2026, 0145 / 0147 / 0148).
 * - "⚠️ Looks copied from TikTok (watermark 'TikTok')": AWS read another app's watermark on the Reel (audit or the 10-min robot).
 * - The clean-up suggestion (blurry, very dark, filmed at home, food only…) next to a one-tap Hide from feed / Show in feed.
 * Nothing is hidden automatically: the founder taps. Before 0147 is on the database the calls fail and the cards look as before.
 */
export interface ReelCheck {
  post_id: string; copied: boolean; copy_kind: 'app_watermark' | 'stock_watermark' | 'ai_watermark' | 'handle_only' | null;
  watermark: string | null; verdict: 'KEEP_IN_FEED' | 'SUGGEST_FEED_OFF' | null; reasons: string[] | null;
  feed_off: boolean; feed_off_reason: string | null; checked_at?: string | null;
  /** 0150 Feed quality bot: 0–100, its suggestion and whether the author is held as possibly under 18 */
  score?: number | null; suggest?: 'feed' | 'profile' | 'not_yet' | null; author_held?: boolean | null;
}
type Rpc = <T>(fn: string, args?: Record<string, unknown>) => Promise<T>;

const APPS: [RegExp, string][] = [
  [/tiktok|ติ๊กต็อก|ติ๊กต๊อก/i, 'TikTok'], [/capcut/i, 'CapCut'], [/douyin|抖音/i, 'Douyin'], [/kuaishou|快手/i, 'Kuaishou'],
  [/likee/i, 'Likee'], [/instagram/i, 'Instagram'], [/lemon8/i, 'Lemon8'],
];
/** Which app a watermark text belongs to ('TikTok' for "ل TikTok"); 'another app' when it is not one we know. */
export function appOf(watermark: string | null | undefined): string {
  const w = watermark || '';
  return APPS.find(([re]) => re.test(w))?.[1] || 'another app';
}
const clip = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 40);

/** The red line on the card, or null when nothing was found. Plain English (the admin is all English). */
export function copyLabel(c: Pick<ReelCheck, 'copied' | 'copy_kind' | 'watermark'> | null | undefined): string | null {
  if (!c || !c.copied) return null;
  const w = clip(c.watermark);
  switch (c.copy_kind) {
    case 'app_watermark': return `⚠️ Looks copied from ${appOf(w)} (watermark '${w}')`;
    case 'stock_watermark': return `⚠️ Stock video, not filmed by them (watermark '${w}')`;
    case 'ai_watermark': return `⚠️ AI-made video (watermark '${w}')`;
    case 'handle_only': return `Shows someone's @name ('${w}') — check it is their own`;
    default: return w ? `⚠️ Looks copied (watermark '${w}')` : '⚠️ Looks copied';
  }
}

export const SUGGEST_WORD: Record<'feed' | 'profile' | 'not_yet', string> = { feed: 'Feed', profile: 'Profile only', not_yet: 'Not yet' };

/** 0150: "Autopilot 34/100 · suggests Profile only · too dark, no person on camera" (null before the bot has read the Reel). */
export function botLabel(c: Pick<ReelCheck, 'score' | 'suggest' | 'reasons'> | null | undefined): string | null {
  if (!c || !c.suggest || c.score == null) return null;
  const why = (c.reasons || []).slice(0, 3).join(', ');
  return `Autopilot ${c.score}/100 · suggests ${SUGGEST_WORD[c.suggest]}${why ? ` · ${why}` : ''}`;
}

/** The feed line: hidden from feed (and why), or the clean-up suggestion, or null. */
export function feedLabel(c: Pick<ReelCheck, 'feed_off' | 'feed_off_reason' | 'verdict' | 'reasons'> & Partial<Pick<ReelCheck, 'score' | 'suggest'>> | null | undefined): string | null {
  if (!c) return null;
  if (c.feed_off) return `Profile only${c.feed_off_reason ? ` · ${c.feed_off_reason}` : ''} (not in the public feed; profile, Rings and saves unchanged)`;
  const bot = botLabel(c);
  if (bot) return bot;
  if (c.verdict === 'SUGGEST_FEED_OFF') {
    const why = (c.reasons || []).filter((r) => r !== 'no place tagged').slice(0, 3).join(', ');
    return `Suggest: hide from feed${why ? ` · ${why}` : ''}`;
  }
  return null;
}

/** Short reason saved with a Hide from feed tap: the suggestion's main reasons, else "Founder's choice". */
export function feedOffReason(c: Pick<ReelCheck, 'reasons' | 'copied' | 'copy_kind' | 'watermark'> | null | undefined): string {
  const r = (c?.reasons || []).filter((x) => x !== 'no place tagged' && x !== 'no person seen').slice(0, 2);
  if (r.length) return r.join(', ').slice(0, 200);
  const l = copyLabel(c ? { copied: c.copied, copy_kind: c.copy_kind, watermark: c.watermark } : null);
  return l ? l.replace(/^⚠️\s*/, '').slice(0, 200) : "Founder's choice";
}

/** Loads the checks for these Reels (empty map before 0147 or on any error: cards render as before). */
export async function loadReelChecks(rpc: Rpc, ids: string[]): Promise<Map<string, ReelCheck>> {
  const want = [...new Set(ids.filter(Boolean))];
  if (!want.length) return new Map();
  try {
    const rows = await rpc<ReelCheck[]>('kr8_admin_reel_checks', { p_ids: want });
    return new Map((Array.isArray(rows) ? rows : []).map((r) => [r.post_id, r]));
  } catch { return new Map(); }
}

/** One tap: Hide from feed (off = true) / Show in feed (off = false). */
export const setReelFeed = (rpc: Rpc, id: string, off: boolean, reason?: string) =>
  rpc<{ id: string; feed_off: boolean; reason: string | null }>('kr8_admin_reel_feed', { p_reel: id, p_off: off, p_reason: off ? reason ?? null : null });
