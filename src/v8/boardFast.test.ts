// 28 Nov (m252): the board opens from the last saved copy and reads the lite board (photos kept apart).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const calls: string[] = [];
let liteFails = false;
vi.mock('./v5Live', async (orig) => ({
  ...(await orig<typeof import('./v5Live')>()),
  v5Client: async () => ({ rpc: async (fn: string) => {
    calls.push(fn);
    if (fn === 'kr8_weekly_ranking_lite' && liteFails) return { data: null, error: { message: 'Could not find the function public.kr8_weekly_ranking_lite' } };
    return { data: { fn, rows: [] }, error: null };
  } }),
}));

const board = (end: string) => ({ week_start: '', ends_at: end, scope: 'all', area: null, total: 1, paid_ranks: 8, floor: 25, posters: 1, min_posters: 0,
  payout_on: true, open_seats: 7, prizes: [], me: null, gap: null, mine: null,
  rows: [{ rank: 1, all_rank: 1, rings: 40, prize: 1500, paid: true, needs: null, to_line: null, user_id: 'a', first_name: 'A', photo: 'data:image/jpeg;base64,' + 'x'.repeat(5000), area: 'Ari', move: null, is_me: false }] });

describe('board cache (kxBoardSave / kxBoardPeek)', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); calls.length = 0; liteFails = false; });
  it('gives the saved board back to the same member only, while its week is open, without inline photos', async () => {
    const { kxBoardSave, kxBoardPeek } = await import('./v5Kx');
    const future = new Date(Date.now() + 86_400_000).toISOString();
    kxBoardSave('me', board(future) as never);
    expect(kxBoardPeek('me')?.rows[0].rings).toBe(40);
    expect(kxBoardPeek('me')?.rows[0].photo).toBeNull();
    expect(kxBoardPeek('other')).toBeNull();
    expect(localStorage.getItem('kr8_board_last_v1')!.length).toBeLessThan(2000);
    kxBoardSave('me', board(new Date(Date.now() - 1000).toISOString()) as never);
    expect(kxBoardPeek('me')).toBeNull();   // a closed week is never shown as this week's board
  });
  it('reads the lite board, and the full board when the server has no lite one yet', async () => {
    const { kxRankingLite } = await import('./v5Kx');
    expect(((await kxRankingLite('all')) as unknown as { fn: string }).fn).toBe('kr8_weekly_ranking_lite');
    vi.resetModules(); liteFails = true; calls.length = 0;
    const m = await import('./v5Kx');
    expect(((await m.kxRankingLite('all')) as unknown as { fn: string }).fn).toBe('kr8_weekly_ranking');
    expect(calls).toEqual(['kr8_weekly_ranking_lite', 'kr8_weekly_ranking']);
  });
});

describe('Me orb (28 Nov)', () => {
  const css = readFileSync('src/v8/ret10.css', 'utf8');
  it('animates with transforms/opacity only, pauses off screen, stills with reduce motion', () => {
    const kf = css.match(/@keyframes r10Orb\w+ \{[\s\S]*?\}\s*\}/g) || [];
    expect(kf.length).toBe(3);
    for (const k of kf) expect(k.replace(/transform|opacity|translate3d|rotate[XY]?|scaleX/g, '')).not.toMatch(/(width|height|top|left|box-shadow|filter|background)\s*:/);
    expect(css).toMatch(/\[data-still="1"\][^{]*\{ animation-play-state: paused; \}/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.v8-app-root \.r10-orb :is\(\.r10-orbhl, \.r10-orbrg, \.r10-orbsh\) \{ animation: none; \}/);
  });
  it('My prizes sits below the orb label (no overlap)', () => {
    expect(css).toMatch(/\.kme \.r10-myp\.me \{[^}]*\+ 137px/);
  });
});
