// kringapp.com/en/bangkok/ and /en/bangkok/<area>/ : English twin of functions/bangkok/[[path]].js.
import { areaHandler } from '../../_lib/webreels.js';
export const onRequest = (ctx) => areaHandler(ctx, 'en');
