// kringapp.com/en/reel/<short> : the English page of one public member Reel. See _lib/webreels.js.
import { reelHandler } from '../../_lib/webreels.js';
export const onRequestGet = (ctx) => reelHandler(ctx, 'en');
export const onRequestHead = (ctx) => reelHandler(ctx, 'en');
