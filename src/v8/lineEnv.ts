// Build-time values for LINE Login (T-205) and LIFF, in their own module so tests can swap them.
/** Public LINE Login channel ID (it is in every authorize URL); empty = LINE button hidden. */
export const lineChannel = (): string => import.meta.env.VITE_LINE_CHANNEL_ID || '';
export const appBase = (): string => (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
/** Public LIFF ID ("<channel id>-<8 chars>", from the LIFF tab of the LINE Login channel); empty = LIFF off, nothing changes. */
export const liffId = (): string => import.meta.env.VITE_LIFF_ID || '';
export const liffOn = (): boolean => /^\d{6,12}-[A-Za-z0-9]{4,16}$/.test(liffId());
/** The one place the share link is built: https://liff.line.me/<LIFF_ID>?ref=<ref> opens the LINE app on Kring. '' when LIFF is off. */
export function liffUrl(ref?: string | null, id: string = liffId()): string {
  if (!/^\d{6,12}-[A-Za-z0-9]{4,16}$/.test(id)) return '';
  const r = (ref || '').toLowerCase();
  return `https://liff.line.me/${id}${/^[a-z0-9_-]{3,40}$/.test(r) ? `?ref=${encodeURIComponent(r)}` : ''}`;
}
