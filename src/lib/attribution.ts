/**
 * Fable P1.8 · Channel, Venue & Creator Attribution Tracker (`?src=`).
 * Captures `?src=`, `?utm_source=`, `?venue=`, and `?creator=` at first visit/sign-up,
 * persists the attribution source in `kring_attribution_v1`, and maintains per-source
 * funnel telemetry (`signUps`, `verifiedHosts`, `completedBumps`) so CAC per completed
 * bump can be measured across L1–L5 and T1–T6 channels.
 */

export const ATTRIBUTION_STORAGE_KEY = 'kring_attribution_v1';
export const ATTRIBUTION_FUNNEL_KEY = 'kring_attribution_funnel_v1';

export interface AttributionRecord {
  src: string;
  channel?: string;
  venue?: string;
  creator?: string;
  firstSeenAt: string;
  landingPath: string;
}

export interface SourceFunnelRow {
  src: string;
  visits: number;
  signUps: number;
  verifiedHosts: number;
  completedBumps: number;
  lastEventAt: string;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readAttribution(): AttributionRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    return safeParse<AttributionRecord | null>(
      window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY),
      null
    );
  } catch {
    return null;
  }
}

export function readFunnelBySource(): Record<string, SourceFunnelRow> {
  if (typeof window === 'undefined') return {};
  try {
    return safeParse<Record<string, SourceFunnelRow>>(
      window.localStorage.getItem(ATTRIBUTION_FUNNEL_KEY),
      {}
    );
  } catch {
    return {};
  }
}

function bumpFunnelMetric(
  src: string,
  field: 'visits' | 'signUps' | 'verifiedHosts' | 'completedBumps'
): void {
  if (typeof window === 'undefined' || !src) return;
  try {
    const all = readFunnelBySource();
    const cur: SourceFunnelRow = all[src] ?? {
      src,
      visits: 0,
      signUps: 0,
      verifiedHosts: 0,
      completedBumps: 0,
      lastEventAt: new Date().toISOString(),
    };
    cur[field] += 1;
    cur.lastEventAt = new Date().toISOString();
    all[src] = cur;
    window.localStorage.setItem(ATTRIBUTION_FUNNEL_KEY, JSON.stringify(all));
  } catch {
    /* ignore storage errors */
  }
}

/**
 * Captures `?src=`, `?utm_source=`, `?venue=`, or `?creator=` from the current URL.
 * First-touch attribution wins unless `overwrite` is true.
 */
export function captureAttributionFromUrl(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  overwrite: boolean = false
): AttributionRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = readAttribution();
    const params = new URLSearchParams(search);
    const rawSrc =
      params.get('src') ||
      params.get('utm_source') ||
      params.get('venue') ||
      params.get('creator') ||
      '';
    const cleanSrc = rawSrc.trim().replace(/[^a-zA-Z0-9_.:@-]/g, '').slice(0, 64);
    if (!cleanSrc) return existing;

    if (existing && !overwrite) {
      return existing;
    }

    const record: AttributionRecord = {
      src: cleanSrc,
      channel: params.get('utm_medium')?.trim().slice(0, 40) || undefined,
      venue: params.get('venue')?.trim().slice(0, 40) || undefined,
      creator: params.get('creator')?.trim().slice(0, 40) || undefined,
      firstSeenAt: new Date().toISOString(),
      landingPath: window.location.pathname || '/',
    };
    window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(record));
    bumpFunnelMetric(cleanSrc, 'visits');
    return record;
  } catch {
    return null;
  }
}

export function recordAttributedSignUp(explicitSrc?: string): void {
  const src = explicitSrc || readAttribution()?.src || 'organic';
  bumpFunnelMetric(src, 'signUps');
}

export function recordAttributedHostVerification(explicitSrc?: string): void {
  const src = explicitSrc || readAttribution()?.src || 'organic';
  bumpFunnelMetric(src, 'verifiedHosts');
}

export function recordAttributedBump(explicitSrc?: string): void {
  const src = explicitSrc || readAttribution()?.src || 'organic';
  bumpFunnelMetric(src, 'completedBumps');
}
