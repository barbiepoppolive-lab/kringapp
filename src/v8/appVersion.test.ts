import { describe, expect, it } from 'vitest';
import { latestRelease, versionAction } from './appVersion';

describe('J1 · stale app refresh', () => {
  it('same or unknown version: nothing', () => {
    expect(versionAction('a', 'a', true, false)).toBe('none');
    expect(versionAction('a', null, true, false)).toBe('none');
    expect(versionAction('dev', 'b', true, false)).toBe('none');
  });
  it('new version: reload when coming back with nothing in progress, otherwise the chip', () => {
    expect(versionAction('a', 'b', true, false)).toBe('reload');
    expect(versionAction('a', 'b', true, true)).toBe('chip');      // mid-upload / typing / claim
    expect(versionAction('a', 'b', false, false)).toBe('chip');    // in use (30-min check)
  });
  it('reads version.json without the cache', async () => {
    let opts: RequestInit | undefined;
    const f = (async (_u: string, o?: RequestInit) => { opts = o; return new Response('{"v":"kring-web@x"}'); }) as unknown as typeof fetch;
    expect(await latestRelease('/app/', f)).toBe('kring-web@x');
    expect(opts?.cache).toBe('no-store');
    expect(await latestRelease('/app/', (async () => { throw new Error('offline'); }) as unknown as typeof fetch)).toBeNull();
  });
});
