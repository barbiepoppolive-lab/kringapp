import { describe, expect, it } from 'vitest';
import { CHUNK_RELOAD_KEY, isChunkError, makeReloadOnce } from './chunkGuard';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

describe('stale chunk guard', () => {
  it('recognises the Chrome, Safari, Firefox and webpack-style messages', () => {
    expect(isChunkError(new TypeError('Failed to fetch dynamically imported module: https://kringapp.com/app/assets/supabase-BaocL5h7.js'))).toBe(true);
    expect(isChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkError('error loading dynamically imported module')).toBe(true);
    expect(isChunkError({ name: 'ChunkLoadError', message: 'x' })).toBe(true);
    expect(isChunkError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkError(null)).toBe(false);
  });
  it('reloads once, then not again within 60 s (no loop), then again after 60 s', () => {
    let t = 1_000_000; let reloads = 0; const s = mem();
    const deps = { now: () => t, store: () => s, reload: () => { reloads++; } };
    expect(makeReloadOnce(deps)()).toBe(true);
    expect(reloads).toBe(1);
    expect(s.getItem(CHUNK_RELOAD_KEY)).toBe(String(t));
    // the reloaded page (fresh guard, same tab storage) fails again 5 s later: no second reload
    t += 5_000;
    const second = makeReloadOnce(deps);
    expect(second()).toBe(false);
    expect(reloads).toBe(1);
    t += 60_000;
    expect(second()).toBe(true);
    expect(reloads).toBe(2);
  });
  it('several errors on one page trigger a single reload', () => {
    let reloads = 0; const once = makeReloadOnce({ now: () => 5, store: () => mem(), reload: () => { reloads++; } });
    once(); once(); once();
    expect(reloads).toBe(1);
    expect(once.reloading()).toBe(true);
  });
  it('blocked storage: still reloads once, the in-memory flag stops a loop', () => {
    let t = 1_000_000; let reloads = 0;
    const bad = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
    const deps = { now: () => t, store: () => bad, reload: () => { reloads++; } };
    const once = makeReloadOnce(deps);
    expect(once()).toBe(true);
    expect(reloads).toBe(1);
    const throwing = makeReloadOnce({ ...deps, store: () => { throw new Error('no storage'); } });
    expect(throwing()).toBe(true);
    t += 1000;
    expect(throwing()).toBe(true);   // same page: already reloading, no second reload call
    expect(reloads).toBe(2);
  });
});
