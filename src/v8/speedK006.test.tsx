/* K-006 speed fix (18 Nov): first Reel video waits for its poster, identical reads share one request, face work waits for idle. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { V5ReelVideo, _resetReelMediaGate } from './V5ReelVideo';
import { clearSharedReads, sharedRead } from './rpcShare';
import { afterStartIdle } from './idle';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); clearSharedReads(); });

describe('first Reel: poster first, video after the first screen', () => {
  it('shows the poster at once and attaches the MP4 only after the poster has loaded (or 4 s)', () => {
    vi.useFakeTimers();
    vi.stubGlobal('IntersectionObserver', class { observe() { /* none */ } disconnect() { /* none */ } });
    _resetReelMediaGate(false);
    const { container } = render(<V5ReelVideo src="https://x/r.mp4" poster="https://x/p.jpg" label="Reel" first />);
    const v = () => container.querySelector('video')!;
    expect(v().getAttribute('poster')).toBe('https://x/p.jpg');
    expect((container.querySelector('.reel-bg') as HTMLElement).style.backgroundImage).toContain('https://x/p.jpg');
    expect(v().getAttribute('src')).toBeNull();
    act(() => { vi.advanceTimersByTime(4100); });   // jsdom never loads images: the 4 s fallback opens the gate
    act(() => { vi.advanceTimersByTime(100); });    // two animation frames
    expect(v().getAttribute('src')).toBe('https://x/r.mp4');
  });
});

describe('identical reads share one request', () => {
  it('two ranking calls at once → one request; a write in between → a fresh one', async () => {
    let n = 0;
    const run = () => { n++; return Promise.resolve({ n }); };
    const [a, b] = await Promise.all([sharedRead('kr8_weekly_ranking', { p_scope: 'all' }, run), sharedRead('kr8_weekly_ranking', { p_scope: 'all' }, run)]);
    expect(n).toBe(1);
    expect(a).toBe(b);
    await sharedRead('kr8_weekly_ranking', { p_scope: 'area' }, run);   // other arguments: its own request
    expect(n).toBe(2);
    await sharedRead('kr8_like', { p_post: 'x' }, () => Promise.resolve(true));   // a write clears what is shared
    await sharedRead('kr8_weekly_ranking', { p_scope: 'all' }, run);
    expect(n).toBe(3);
  });
  it('a failed read is not kept', async () => {
    let n = 0;
    const bad = () => { n++; return Promise.reject(new Error('x')); };
    await expect(sharedRead('kr8_treats_live', {}, bad)).rejects.toThrow();
    await expect(sharedRead('kr8_treats_live', {}, bad)).rejects.toThrow();
    expect(n).toBe(2);
  });
  it('calls that are not shared always go out', async () => {
    let n = 0;
    const run = () => { n++; return Promise.resolve(n); };
    await sharedRead('kr8_me', {}, run); await sharedRead('kr8_me', {}, run);
    expect(n).toBe(2);
  });
});

describe('face work waits for the first screen', () => {
  it('afterStartIdle runs after the delay and can be cancelled', () => {
    vi.useFakeTimers();
    const f = vi.fn();
    afterStartIdle(f, 5000);
    vi.advanceTimersByTime(4900);
    expect(f).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(f).toHaveBeenCalledTimes(1);
    const g = vi.fn();
    const stop = afterStartIdle(g, 5000);
    stop();
    vi.advanceTimersByTime(10000);
    expect(g).not.toHaveBeenCalled();
  });
  it('face-api is never imported by the app shell; only v5Face loads it, on demand', () => {
    const app = readFileSync('src/v8/KringAppV8.tsx', 'utf8');
    expect(app).not.toMatch(/@vladmandic\/face-api/);
    expect(app).toMatch(/afterStartIdle\(\(\) => \{ void \(async \(\) => \{\n\s+const v = src \? await checkProfilePhoto\(src\)/);
    const vite = readFileSync('vite.config.ts', 'utf8');
    expect(vite).toMatch(/node_modules\/mediabunny\/'\)\) return 'mediabunny'/);
    expect(vite).toMatch(/node_modules\/@sentry\/'\).*return 'sentry'/);
    expect(readFileSync('src/v6/main.tsx', 'utf8')).not.toMatch(/import '\.\.\/lib\/sentry'/);
  });
});
