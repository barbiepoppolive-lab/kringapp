// kringapp.com/reel/<short> : the public, indexable page of one member Reel (Thai). English: /en/reel/<short>. See _lib/webreels.js.
import { reelHandler } from '../_lib/webreels.js';
export const onRequestGet = (ctx) => reelHandler(ctx, 'th');
export const onRequestHead = (ctx) => reelHandler(ctx, 'th');
