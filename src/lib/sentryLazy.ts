/**
 * K-006 (18 Nov): the member app loads Sentry (about 80 KB gzip) after the first screen instead of in the eager vendor chunk.
 * Same rule as lib/sentry.ts: errors are only sent from the live site. Errors that happen before Sentry has loaded are kept
 * here and sent as soon as it is ready, so nothing from the first seconds is lost.
 */
import { chunkReloadPending, isChunkError } from './chunkGuard';

const onLive = typeof location !== 'undefined' && /(^|\.)kringapp\.com$/.test(location.hostname);

export function startSentryLater(): void {
  if (!onLive || typeof window === 'undefined') return;
  const early: unknown[] = [];
  const keep = (x: unknown) => !(chunkReloadPending() && isChunkError(x));
  const onError = (e: ErrorEvent) => { if (early.length < 20 && keep(e.error ?? e.message)) early.push(e.error ?? e.message); };
  const onReject = (e: PromiseRejectionEvent) => { if (early.length < 20 && keep(e.reason)) early.push(e.reason); };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onReject);
  const load = () => {
    import('./sentry')
      .then(({ Sentry }) => {
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onReject);
        for (const x of early.splice(0)) if (keep(x)) Sentry.captureException(x);
      })
      .catch(() => undefined);
  };
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  const later = () => { if (w.requestIdleCallback) w.requestIdleCallback(load, { timeout: 4000 }); else window.setTimeout(load, 1500); };
  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later, { once: true });
}
