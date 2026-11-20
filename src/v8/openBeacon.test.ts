import { describe, expect, it, vi } from 'vitest';
import { afterVisible, openIdFrom } from './openBeacon';

function fakeDoc(state: 'visible' | 'hidden') {
  const ls: (() => void)[] = [];
  const d = { visibilityState: state, addEventListener: (_: string, f: () => void) => ls.push(f), removeEventListener: () => undefined,
    set(s: 'visible' | 'hidden') { d.visibilityState = s; ls.forEach((f) => f()); } };
  return d;
}

describe('0182 share-open beacon', () => {
  it('reads only a uuid open id', () => {
    expect(openIdFrom('?reel=x&so=0f0e0d0c-0b0a-4908-8706-050403020100')).toBe('0f0e0d0c-0b0a-4908-8706-050403020100');
    expect(openIdFrom('?so=<script>')).toBeNull();
    expect(openIdFrom('')).toBeNull();
  });
  it('fires once after 2 s of visible time, not while hidden', () => {
    vi.useFakeTimers();
    let t = 0; const now = () => t;
    const d = fakeDoc('hidden'); const send = vi.fn();
    afterVisible(d as unknown as Document, 2000, send, now);
    t += 5000; vi.advanceTimersByTime(5000); expect(send).not.toHaveBeenCalled();
    d.set('visible'); t += 1000; vi.advanceTimersByTime(1000); expect(send).not.toHaveBeenCalled();
    d.set('hidden'); t += 9000; vi.advanceTimersByTime(9000); expect(send).not.toHaveBeenCalled();
    d.set('visible'); t += 1000; vi.advanceTimersByTime(1000); expect(send).toHaveBeenCalledTimes(1);
    t += 5000; vi.advanceTimersByTime(5000); expect(send).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
