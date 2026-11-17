// kringapp.com/bangkok/ and /bangkok/<area>/ : the hand-written area pages get the latest public member Reels added;
// areas without a hand-written page (Ekkamai, Silom, Sukhumvit, Charoen Krung, Ratchada, Chatuchak) are built here. See _lib/webreels.js.
import { areaHandler } from '../_lib/webreels.js';
export const onRequest = (ctx) => areaHandler(ctx, 'th');
