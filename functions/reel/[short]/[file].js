// kringapp.com/reel/<short>/poster.jpg | video.mp4 : poster and video of a PUBLIC Reel only (member said yes to the web).
// The storage path never leaves the server. See _lib/webreels.js mediaHandler.
import { mediaHandler } from '../../_lib/webreels.js';
export const onRequest = (ctx) => mediaHandler(ctx);
