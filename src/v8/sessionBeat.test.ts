import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BEAT_MS, newSid, startSessionBeat } from './sessionBeat';
import { parsePushLink } from './push';
import { restoredTab } from './tabMemory';

function fakeDoc(state: 'visible' | 'hidden') {
  const ls: (() => void)[] = [];
  const d = { visibilityState: state, addEventListener: (_: string, f: () => void) => ls.push(f), removeEventListener: () => undefined };
  return { d: d as unknown as Document, set: (s: 'visible' | 'hidden') => { (d as { visibilityState: string }).visibilityState = s; ls.forEach((f) => f()); } };
}

describe('m213 session beat', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('beats at once and every 30 s while visible', () => {
    const send = vi.fn(async () => undefined);
    const { d } = fakeDoc('visible');
    const stop = startSessionBeat(send, d);
    expect(send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(BEAT_MS * 3);
    expect(send).toHaveBeenCalledTimes(4);
    stop();
    vi.advanceTimersByTime(BEAT_MS * 3);
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('pauses while hidden and beats again when back', () => {
    const send = vi.fn(async () => undefined);
    const f = fakeDoc('visible');
    startSessionBeat(send, f.d);
    f.set('hidden');
    vi.advanceTimersByTime(BEAT_MS * 4);
    expect(send).toHaveBeenCalledTimes(1);
    f.set('visible');
    expect(send).toHaveBeenCalledTimes(2);
    f.set('hidden'); f.set('visible');   // a quick flip does not double up
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('session ids are what the server accepts', () => {
    for (let i = 0; i < 20; i++) expect(newSid()).toMatch(/^[A-Za-z0-9-]{8,40}$/);
  });
});

describe('m213 deep links', () => {
  const q = '6e097a3a-cf82-40a6-a3ae-cde8dab7bb1d';
  it('a ding / summary link with ?ask= opens that question on the Feed', () => {
    expect(parsePushLink(`/app/?ask=${q}`)).toEqual({ ask: q, tab: 'feed' });
    expect(parsePushLink('/app/?ask=not-a-uuid')).toEqual({});
  });
  it('?ask= wins over the remembered tab', () => {
    expect(restoredTab(`?ask=${q}`)).toBeNull();
  });
});
