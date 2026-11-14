/**
 * Kring admin: kringapp.com/app/admin.html (admins only; checked again on the server by kr8_is_admin()).
 * Admin v2 (13 Nov): phone-first, English only. The UI lives in adminApp.ts; the venue helpers in adminHelpers.ts.
 * Every RPC, parameter, storage bucket and edge function is unchanged from v1.
 */
import '../lib/sentry';
import { start } from './adminApp';

export { lineMessage, splitTreat, standLink } from './adminHelpers';

start();
