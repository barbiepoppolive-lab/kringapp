/**
 * 0124 Fake Finder: one random id per phone/browser, kept in localStorage 'kr8_did'. It is the SAME value as the older
 * 'kr8_device' key that prize claims and Reel views already send, so the team can see when two accounts use one phone.
 * It is sent with every client event (kr8_log_client p_did) and once a day as 'device_seen'. Never anything personal.
 * No storage (private mode, blocked site data) → '' (callers then send nothing, exactly as before).
 */
export const DID_KEY = 'kr8_did';
export const OLD_DEVICE_KEY = 'kr8_device';
const DID_OK = /^[A-Za-z0-9-]{16,64}$/;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): Store | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const id = c?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}abcdef`;
  return id.slice(0, 40);
}

/** this phone's id (created once). Keeps 'kr8_did' and 'kr8_device' equal so claims and events carry the same id. */
export function kr8DeviceId(store: Store | null = defaultStore()): string {
  if (!store) return '';
  try {
    const did = store.getItem(DID_KEY);
    const old = store.getItem(OLD_DEVICE_KEY);
    const id = did && DID_OK.test(did) ? did : old && DID_OK.test(old) ? old : newId();
    if (did !== id) store.setItem(DID_KEY, id);
    if (old !== id) store.setItem(OLD_DEVICE_KEY, id);
    return id;
  } catch { return ''; }
}

/** Bangkok calendar day (UTC+7), e.g. '2026-11-19' */
export function bkkDay(now: number = Date.now()): string {
  return new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
}

/** true once per Bangkok day per member on this phone (and remembers it); false when storage is missing */
export function deviceSeenDue(uid: string, now: number = Date.now(), store: Store | null = defaultStore()): boolean {
  if (!store || !uid) return false;
  try {
    const key = `kr8_did_seen_${uid}`;
    const day = bkkDay(now);
    if (store.getItem(key) === day) return false;
    store.setItem(key, day);
    return true;
  } catch { return false; }
}
