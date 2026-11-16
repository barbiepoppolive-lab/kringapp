// T-301 round 2 (17 Nov): face models never crash a phone whose WebGL can't compile shaders (T301-001 / T301-032).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { pickFaceBackend } from './v5Face';

const fakeTf = (glWorks: boolean) => {
  let backend = '';
  return {
    get backend() { return backend; },
    setBackend: vi.fn(async (b: string) => { backend = b; return true; }),
    ready: vi.fn(async () => undefined),
    tidy: <T,>(f: () => T) => f(),
    scalar: (n: number) => ({ add: () => ({ dataSync: () => { if (!glWorks && backend === 'webgl') throw new Error('Failed to compile fragment shader.'); return [n + 1]; } }) }),
  };
};

describe('face backend', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });
  it('no WebGL on the device: CPU, no shader error', async () => {
    const tf = fakeTf(false);
    expect(await pickFaceBackend(tf)).toBe('cpu');
    expect(tf.backend).toBe('cpu');
  });
  it('a device marked broken before goes straight to CPU', async () => {
    localStorage.setItem('kr8_face_nogl', '1');
    const tf = fakeTf(true);
    expect(await pickFaceBackend(tf)).toBe('cpu');
    expect(tf.setBackend).not.toHaveBeenCalledWith('webgl');
  });
});
