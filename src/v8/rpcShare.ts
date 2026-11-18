/**
 * K-006 (18 Nov): on start (and when the Board opens) the same read calls went out 2-5 times at once from different screens
 * (kr8_weekly_ranking, kr8_member_reels, kr8_treats_live, kr8_people, kr8_rings_rules). Identical read calls made within a few
 * seconds of each other now share ONE request and its answer. Any other call (a like, a post, a claim, a check-in…) may change
 * what the reads return, so it clears everything shared; a failed read is never kept.
 */
import { ADMIN_VIEW_READS } from './adminView';

const SHARE_MS = 4000;
/** read-only calls whose answers may be shared for a few seconds */
export const SHARED_READS: ReadonlySet<string> = new Set([
  'kr8_weekly_ranking', 'kr8_member_reels', 'kr8_rings_rules', 'kr8_seats_left', 'kr8_treats_live', 'kr8_people',
]);
const memo = new Map<string, { at: number; p: Promise<unknown> }>();

export function sharedRead<T>(fn: string, args: Record<string, unknown>, run: () => Promise<T>): Promise<T> {
  if (!SHARED_READS.has(fn)) {
    if (!ADMIN_VIEW_READS.has(fn) && fn !== 'kr8_seats_left') memo.clear();   // a write: the shared answers may be out of date
    return run();
  }
  const key = fn + '\u0000' + JSON.stringify(args);
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < SHARE_MS) return hit.p as Promise<T>;
  const p = run();
  memo.set(key, { at: Date.now(), p });
  p.catch(() => { if (memo.get(key)?.p === p) memo.delete(key); });
  return p;
}

/** a write that does not go through rpc() (e.g. a table insert) can clear the shared answers itself; also used by tests */
export function clearSharedReads(): void { memo.clear(); }
