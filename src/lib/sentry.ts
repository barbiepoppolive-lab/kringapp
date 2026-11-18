/**
 * Error alerts (Sentry project kring-web, org barbieverse). Errors only: no tracing, no session replay, no personal data.
 * Imported first by every entry (app, admin, staff, stand, owner). `?kr8_sentry_test=1` throws one test error on purpose.
 */
import * as Sentry from '@sentry/browser';
import { chunkReloadPending, installChunkGuard, isChunkError, recentChunkReload } from './chunkGuard';

installChunkGuard();   // staff/stand/owner get the stale-chunk reload too (idempotent; app and admin install it first)

const DSN = 'https://5a1e2ea9cf9dd68ef1c5ed5610481f2d@o4511808158760960.ingest.us.sentry.io/4512406631219200';
declare const __KR8_RELEASE__: string;

const onLive = typeof location !== 'undefined' && /(^|\.)kringapp\.com$/.test(location.hostname);

if (onLive) {
  Sentry.init({
    dsn: DSN,
    release: typeof __KR8_RELEASE__ === 'string' ? __KR8_RELEASE__ : undefined,
    environment: 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    sampleRate: 1,
    maxBreadcrumbs: 30,
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
      /^AbortError/,
      /Load failed$/,          // iOS Safari network drop
      /Failed to fetch$/,      // offline / flaky 4G
    ],
    denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i, /static\.cloudflareinsights\.com/i],
    beforeSend(event, hint) {
      // stale tab after a deploy: the chunk guard is already reloading the page, so this is not a real error
      if (chunkReloadPending() && (isChunkError(hint?.originalException) || event.exception?.values?.some((v) => isChunkError(v.value)))) return null;
      // never send emails, phone numbers or sign-in codes that may sit in a message or URL
      const scrub = (s?: string) => s?.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').replace(/\+?\d[\d -]{7,}\d/g, '[number]');
      if (event.message) event.message = scrub(event.message);
      if (event.request?.url) event.request.url = event.request.url.replace(/([?&](k|code|token|access_token)=)[^&#]+/gi, '$1[x]').split('#')[0];
      event.exception?.values?.forEach((v) => { v.value = scrub(v.value); });
      return event;
    },
  });
  const reloadedAt = recentChunkReload();
  if (reloadedAt) Sentry.addBreadcrumb({ category: 'kring.chunk', level: 'info', message: 'page reloaded after a stale code chunk (old tab during a deploy)', timestamp: reloadedAt / 1000 });
  Sentry.setTag('page', location.pathname.replace(/^\/app\/?/, '') || 'app');
  // T-406: an opaque member id only (no name/email), so an error shows WHO was affected and the team can help them in Help
  try {
    const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x));
    const uid = k ? (JSON.parse(localStorage.getItem(k) || '{}')?.user?.id as string | undefined) : undefined;
    if (uid) Sentry.setUser({ id: uid });
  } catch { /* private mode */ }
  if (new URLSearchParams(location.search).get('kr8_sentry_test') === '1') {
    setTimeout(() => { throw new Error('Kring Sentry test error (safe to ignore)'); }, 1500);
  }
}

export { Sentry };
