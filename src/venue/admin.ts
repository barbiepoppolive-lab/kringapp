/**
 * Kring admin: kringapp.com/app/admin.html (admins only; checked again on the server by kr8_is_admin()).
 * Admin v2 (13 Nov): phone-first, English only. The UI lives in adminApp.ts; the venue helpers in adminHelpers.ts.
 * Every RPC, parameter, storage bucket and edge function is unchanged from v1.
 */
import '../lib/sentry';   // also installs the stale-chunk guard (lib/chunkGuard.ts) before anything else runs
import { installChunkGuard } from '../lib/chunkGuard';
import { start } from './adminApp';

export { lineMessage, splitTreat, standLink } from './adminHelpers';

installChunkGuard();   // stale admin tab after a deploy: reload once (max 1 per 60 s); no-op if already installed
start();
