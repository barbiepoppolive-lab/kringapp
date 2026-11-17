/** 0085 ranked feed: the app asks kr8_feed_ranked with one seed per session, keeps the server's order, and falls back to the
 *  old newest-first kr8_feed when the ranked call is missing or fails. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ calls: [] as { fn: string; args: Record<string, unknown> }[], rankedFails: false }));
const row = (id: string, author: string) => ({ id, kind: 'plan', area: 'Bangkok', body: id, photo: null, event_id: null, here: false, created_at: '',
  author_id: null, author_name: author, author_photo: null, author_langs: ['TH'], author_who: 'local', mine: false, answers: [] });
const RANKED = [row('c0000000-0000-4000-8000-000000000003', 'C'), row('a0000000-0000-4000-8000-000000000001', 'A'), row('b0000000-0000-4000-8000-000000000002', 'B')];
const NEWEST = [row('a0000000-0000-4000-8000-000000000001', 'A'), row('b0000000-0000-4000-8000-000000000002', 'B')];
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.calls.push({ fn, args });
      if (fn === 'kr8_feed_ranked') return db.rankedFails ? { data: null, error: { message: 'Could not find the function public.kr8_feed_ranked' } } : { data: RANKED, error: null };
      if (fn === 'kr8_feed') return { data: NEWEST, error: null };
      return { data: null, error: null };
    },
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  }),
}));

describe('ranked feed (0085)', () => {
  beforeEach(async () => {
    db.calls.length = 0;
    db.rankedFails = false;
    sessionStorage.clear();
    (await import('./v5Live'))._resetFeedSeed();
  });

  it('asks kr8_feed_ranked with a session seed and keeps the server order', async () => {
    const { v5FeedRows } = await import('./v5Live');
    const rows = await v5FeedRows();
    expect(rows.map((r) => r.author_name)).toEqual(['C', 'A', 'B']);
    const call = db.calls.find((c) => c.fn === 'kr8_feed_ranked');
    expect(call?.args).toMatchObject({ p_area: null, p_limit: 60, p_offset: 0 });
    expect(String(call?.args.p_seed)).toMatch(/^[a-z0-9]{8,}$/);
    expect(db.calls.some((c) => c.fn === 'kr8_feed')).toBe(false);
  });

  it('keeps one seed for the whole session (stable order while scrolling), a new one for a new session', async () => {
    const live = await import('./v5Live');
    const a = live.v5FeedSeed();
    expect(live.v5FeedSeed()).toBe(a);
    live._resetFeedSeed();
    expect(live.v5FeedSeed()).toBe(a);   // same tab session: read back from sessionStorage
    sessionStorage.clear();
    live._resetFeedSeed();
    expect(live.v5FeedSeed()).not.toBe(a);
  });

  it('falls back to the old newest-first kr8_feed when the ranked call fails', async () => {
    db.rankedFails = true;
    const { v5FeedRows } = await import('./v5Live');
    const rows = await v5FeedRows();
    expect(rows.map((r) => r.author_name)).toEqual(['A', 'B']);
    expect(db.calls.map((c) => c.fn)).toContain('kr8_feed');
  });

  it('the admin view may read the ranked feed (read-only call)', async () => {
    const { ADMIN_VIEW_READS } = await import('./adminView');
    expect(ADMIN_VIEW_READS.has('kr8_feed_ranked')).toBe(true);
  });
});
