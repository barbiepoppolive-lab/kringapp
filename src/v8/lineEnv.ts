// Build-time values for LINE Login (T-205), in their own module so tests can swap them.
/** Public LINE Login channel ID (it is in every authorize URL); empty = LINE button hidden. */
export const lineChannel = (): string => import.meta.env.VITE_LINE_CHANNEL_ID || '';
export const appBase = (): string => (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
