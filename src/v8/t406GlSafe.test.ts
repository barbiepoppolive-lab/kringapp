import { describe, expect, it, vi } from 'vitest';
vi.mock('./v5Live', () => ({ v5LogClient: vi.fn() }));
import { glSafe, isGlError } from './v5Face';

const fakeApi = () => {
  let backend = 'webgl';
  const tf = { getBackend: () => backend, setBackend: vi.fn(async (b: string) => { backend = b; return true; }), ready: vi.fn(async () => undefined) };
  return { api: { tf } as never, tf, now: () => backend };
};

describe('T-406 face check never freezes on a broken phone GPU', () => {
  it('a shader LINK error (Sentry KRING-WEB-5) moves the check to CPU and retries once', async () => {
    const { api, now } = fakeApi();
    let calls = 0;
    const r = await glSafe(api, async () => { calls++; if (now() === 'webgl') throw new Error('Failed to link vertex and fragment shaders.'); return 'ok'; });
    expect(r).toBe('ok'); expect(calls).toBe(2); expect(now()).toBe('cpu');
  });
  it('recognises GL errors, not ordinary ones', () => {
    expect(isGlError(new Error('Failed to link vertex and fragment shaders.'))).toBe(true);
    expect(isGlError(new Error('IMAGE'))).toBe(false);
  });
  it('a first WebGL detect that hangs > 6 s switches to CPU instead of waiting forever', async () => {
    vi.useFakeTimers();
    const { api, now } = fakeApi();
    const p = glSafe(api, () => (now() === 'webgl' ? new Promise<string>(() => undefined) : Promise.resolve('cpu-ok')));
    await vi.advanceTimersByTimeAsync(6100);
    await expect(p).resolves.toBe('cpu-ok');
    vi.useRealTimers();
  });
});
