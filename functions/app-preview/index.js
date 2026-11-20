// /app-preview/ only (not every asset): a shared profile link shows that member's picture card to link-preview robots. See _lib/profilelink.js.
import { profileCard } from '../_lib/profilelink.js';
export const onRequestGet = (ctx) => profileCard(ctx);
