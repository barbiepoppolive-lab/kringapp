/* 16 Nov perf 2: screens that are not the feed (Rewards, Ranking, Verify, Ticket) are separate downloads. Each one brings its own
 * Suspense (nothing else on screen blinks), and all of them are fetched quietly once the feed is up, so opening one is instant. */
import React, { Suspense, lazy } from 'react';

const loaders: (() => Promise<unknown>)[] = [];
export function lazyPart<P extends object>(load: () => Promise<React.ComponentType<P>>): React.FC<P> {
  let p: Promise<{ default: React.ComponentType<P> }> | null = null;
  const get = () => (p ||= load().then((c) => ({ default: c })).catch((e) => { p = null; throw e; }));
  loaders.push(get);
  const Lazy = lazy(get) as unknown as React.ComponentType<P>;
  const Part: React.FC<P> = (props) => (
    <Suspense fallback={null}>
      <Lazy {...props} />
    </Suspense>
  );
  return Part;
}
/** Fetch every lazy screen in the background (called when the phone is idle after the feed shows). */
export function prefetchParts(): void {
  for (const l of loaders) void l().catch(() => undefined);
}
