/**
 * Autopilot · Feed quality (0150, 19 Nov 2026) — the extra block under the robot's card on the Autopilot page.
 * The bot scores every Reel and profile photo and orders the feeds. It never moves a Reel: the founder decides Feed vs
 * Profile only. This block lists the approved Reels where the bot disagrees with where they are now (one tap to follow it)
 * and the members kept out of public feeds as possibly under 18 (one tap: Clear, they are an adult). English only.
 */
import { el } from './shared';
import { setReelFeed, SUGGEST_WORD } from './reelChecks';

type Rpc = <T>(fn: string, args?: Record<string, unknown>) => Promise<T>;
export interface FqDisagree { post_id: string; member_no: number | null; name: string; score: number | null; suggest: 'feed' | 'profile' | 'not_yet'; in_feed: boolean; reasons: string[] }
export interface FqHeld { user_id: string; member_no: number | null; name: string; reason: string; since: string }
export interface FqSummary {
  reels_scored: number; reels_waiting: number; people_scored: number; suggest: Record<string, number> | null;
  disagree: FqDisagree[]; held: FqHeld[]; last_run: string | null; last_scan: string | null;
}

/** "41 Reels scored · 0 waiting · 56 photos · Feed 30 · Profile only 10 · Not yet 11" */
export function fqHeadline(s: FqSummary): string {
  const g = s.suggest || {};
  return [`${s.reels_scored} Reels scored`, `${s.reels_waiting} waiting`, `${s.people_scored} photos`,
    `Feed ${g.feed || 0}`, `Profile only ${g.profile || 0}`, `Not yet ${g.not_yet || 0}`].join(' · ');
}

/** One line per disagreement: "#152 Wan · 30/100 · in the Feed, bot says Not yet · too dark" */
export function fqLine(d: FqDisagree): string {
  const where = d.in_feed ? 'in the Feed' : 'Profile only';
  const why = (d.reasons || []).slice(0, 2).join(', ');
  return `#${d.member_no ?? '?'} ${d.name} · ${d.score ?? '–'}/100 · ${where}, bot says ${SUGGEST_WORD[d.suggest]}${why ? ` · ${why}` : ''}`;
}

export function feedQualityBlock(rpc: Rpc, toast: (m: string) => void): HTMLElement {
  const box = el('div', { class: 'ap-fq', id: 'apFeedQuality', style: 'margin-top:10px;display:grid;gap:8px' }, el('small', { class: 'dim' }, 'Loading Feed quality…'));
  const load = async () => {
    let s: FqSummary;
    try { s = await rpc<FqSummary>('kr8_admin_feed_quality'); } catch (e) { box.replaceChildren(el('small', { class: 'dim' }, `Feed quality: ${(e as Error).message}`)); return; }
    const rows = (s.disagree || []).map((d) => {
      const toFeed = d.suggest === 'feed';
      const b = el('button', { type: 'button', class: 'ap-mini-btn', id: `fqMove-${d.post_id}` }, toFeed ? 'Move to Feed' : 'Profile only') as HTMLButtonElement;
      b.onclick = async () => {
        b.disabled = true;
        try { await setReelFeed(rpc, d.post_id, !toFeed, toFeed ? undefined : (d.reasons || []).slice(0, 2).join(', ') || 'Autopilot suggestion'); toast(toFeed ? 'In the Feed' : 'Profile only · not in the public feed'); await load(); }
        catch (e) { b.disabled = false; toast((e as Error).message); }
      };
      return el('div', { class: 'row', 'data-fq': d.post_id, style: 'gap:8px;align-items:center' }, el('span', { class: 'grow', style: 'font-size:13px' }, fqLine(d)), b);
    });
    const held = (s.held || []).map((h) => {
      const b = el('button', { type: 'button', class: 'ap-mini-btn', id: `fqClear-${h.user_id}` }, 'Clear · adult') as HTMLButtonElement;
      b.onclick = async () => {
        b.disabled = true;
        try { await rpc('kr8_admin_minor_clear', { p_user: h.user_id }); toast(`#${h.member_no ?? '?'} is back in the public feeds`); await load(); }
        catch (e) { b.disabled = false; toast((e as Error).message); }
      };
      return el('div', { class: 'row', 'data-held': h.user_id, style: 'gap:8px;align-items:center' },
        el('span', { class: 'grow', style: 'font-size:13px' }, `#${h.member_no ?? '?'} ${h.name} · ${h.reason}`), b);
    });
    box.replaceChildren(
      el('b', { style: 'font-size:13px' }, fqHeadline(s)),
      el('small', { class: 'dim' }, 'You decide Feed or Profile only on every Reel. The bot orders the feed by quality and suggests.'),
      rows.length ? el('div', { style: 'display:grid;gap:6px' }, el('b', { style: 'font-size:13px' }, `Approved Reels where the bot disagrees · ${rows.length}`), ...rows)
        : el('small', {}, 'Every approved Reel is where the bot would put it.'),
      held.length ? el('div', { style: 'display:grid;gap:6px' }, el('b', { style: 'font-size:13px' }, `May be under 18 · out of public feeds · ${held.length}`),
        el('small', { class: 'dim' }, 'They still see their own Reels and profile. Nothing was sent to them. Look at their photo; tap Clear if they are an adult.'), ...held)
        : el('small', {}, 'Nobody is held as possibly under 18.'));
  };
  void load();
  return box;
}
