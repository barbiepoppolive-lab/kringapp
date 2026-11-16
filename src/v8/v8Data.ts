
export type V8FeedType = 'photo' | 'ask' | 'deal';

export interface V8Answer {
  who: string;
  av: string;
  txt: string;
}

export interface V8FeedItem {
  id: string;
  type: V8FeedType;
  img?: string;
  av?: string;
  name?: string;
  langs?: string;
  area?: string;
  here?: boolean;
  hereExpiresAt?: number;
  cap?: string;
  hiCount?: number;
  bestOfWeek?: boolean;
  /** Reels (0024): signed video + poster links; reelPending = only the author sees it until approved */
  video?: string;
  poster?: string;
  reelPending?: boolean;
  /** Reel social (0026): likes for everyone; views only for the Kring Local who posted it; ig = Instagram handle; place = tagged partner venue + its deal */
  likes?: number;
  liked?: boolean;
  saved?: boolean;
  views?: number;
  ig?: string;
  place?: { venueId: string; name: string; nameTh?: string; dealId?: string; dealEn?: string; dealTh?: string };
  // Ask a Thai card fields
  q?: string;
  asker?: string;
  answers?: V8Answer[];
  // Deal card fields
  venue?: string;
  title?: string;
  now?: number;
  was?: number;
  claimed?: number;
  dealId?: string;
}

export interface V8StorySlide {
  img: string;
  who: string;
  av: string;
  cap: string;
  time: string;
  expiresAtMidnight: boolean;
}

export interface V8Person {
  id: string;
  name: string;
  langs: string;
  langCodes: string[];
  who: 'local' | 'traveller';
  online: boolean;
  verified: boolean;
  img: string;
  hook: string;
  tags: string;
  area?: string;
  here?: boolean;
}

export interface V8Deal {
  id: string;
  cat: 'coffee' | 'food' | 'classes' | 'fun';
  tag: string;
  title: string;
  venue: string;
  area: string;
  now: number;
  was: number;
  claimed: number;
  leftCount?: number;
  validWindow?: string;
  img: string;
  code: string;
  /** Real partner venues (0023): the venue's own deal words, hours, Maps link and photos. No prices invented. */
  dealEn?: string;
  dealTh?: string;
  hoursEn?: string;
  hoursTh?: string;
  mapsUrl?: string;
  photos?: string[];
  venueTh?: string;
  /** ISO time the claimed code stops working (24 h after claim). */
  expiresAt?: string;
}

export interface V8HelloRequest {
  id: string;
  name: string;
  meta: string;
  img: string;
  msg: string;
  verified: boolean;
  /** 0073: sent by the Kring Team account (official, sender only) */
  official?: boolean;
}

export interface V8ChatMessage {
  id: string;
  sender: 'them' | 'me';
  text: string;
  translation?: string;
  createdAt: string;
}

export interface V8ChatThread {
  id: string;
  personId: string;
  name: string;
  avatar: string;
  langs: string;
  verified: boolean;
  /** 0073: the Kring Team account (official, sender only): logo, "Official · ทางการ" badge, no member profile */
  official?: boolean;
  lastPreview: string;
  timeLabel: string;
  unread: boolean;
  plan?: {
    title: string;
    venue: string;
    area: string;
    time: string;
  };
  dealInvite?: {
    dealId: string;
    title: string;
    price: number;
    wasPrice: number;
    venue: string;
    joined?: boolean;
  };
  messages: V8ChatMessage[];
}

export interface V8Weather {
  tempC: number;
  feelsLikeC: number;
  rainProbAfternoon: number;
  conditionLabel: string;
  conditionIcon: string;
  localPickTitle: string;
  localPickDesc: string;
  localPickDealId: string;
  rainTip: string;
  updatedAt: string;
  source: 'open-meteo' | 'fallback';
}

export interface V8CurrencyInfo {
  code: 'INR' | 'USD' | 'CNY' | 'EUR' | 'JPY' | 'KRW';
  symbol: string;
  rateFromThb: number;
}

export const CURRENCY_RATES: Record<V8CurrencyInfo['code'], V8CurrencyInfo> = {
  INR: { code: 'INR', symbol: '₹', rateFromThb: 2.45 },
  USD: { code: 'USD', symbol: '$', rateFromThb: 0.029 },
  CNY: { code: 'CNY', symbol: '¥', rateFromThb: 0.21 },
  EUR: { code: 'EUR', symbol: '€', rateFromThb: 0.027 },
  JPY: { code: 'JPY', symbol: '¥', rateFromThb: 4.45 },
  KRW: { code: 'KRW', symbol: '₩', rateFromThb: 40.2 },
};

export function formatTravellerCurrency(
  thb: number,
  currency: V8CurrencyInfo['code'] = 'INR'
): string {
  const info = CURRENCY_RATES[currency] || CURRENCY_RATES.INR;
  const val = thb * info.rateFromThb;
  if (info.code === 'USD' || info.code === 'EUR') {
    return `≈ ${info.symbol}${val.toFixed(2)}`;
  }
  return `≈ ${info.symbol}${Math.round(val).toLocaleString('en-US')}`;
}

/** polish #2: a member with no photo gets their initial on a soft gradient (never the Kring rings, which read as a fake account). */
export function initialAvatar(name: string | null | undefined): string {
  const ch = (Array.from((name || '').trim())[0] || '?').toUpperCase();
  let h = 0;
  for (const c of name || '?') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pairs = [['#5B6CFF', '#2A2C6E'], ['#FF4FA3', '#5B2A6E'], ['#6EE7A8', '#1E5B4B'], ['#FFB547', '#6E3A1E'], ['#3FD0FF', '#1E3F6E']];
  const [a, b] = pairs[h % pairs.length];
  const esc = ch.replace(/[<&>"']/g, '');
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><text x="48" y="62" text-anchor="middle" font-family="Noto Sans Thai, Arial, sans-serif" font-size="44" font-weight="700" fill="#fff">${esc}</text></svg>`);
}

/** Neutral placeholder (no person, no venue) used when a real row has no photo. */
export const NEUTRAL_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#171520"/><stop offset="1" stop-color="#2A2C6E"/></linearGradient></defs><rect width="120" height="160" fill="url(#g)"/><circle cx="52" cy="80" r="16" fill="none" stroke="#5B6CFF" stroke-width="4"/><circle cx="68" cy="80" r="16" fill="none" stroke="#FF4FA3" stroke-width="4"/></svg>'
  );

export function isDemoOrDevEnvironment(): boolean {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    // A-12: on the real site (live accounts on) a shared ?demo=1 link must not show example people
    const liveBuild = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_AUTH_LIVE === '1';
    const realHost = /(^|\.)kringapp\.com$/i.test(window.location.hostname);
    if (params.get('demo') === '1') return !(liveBuild && realHost);
    if (params.get('prod') === '1') return false;
  }
  return false;
}

/** Shown until the live Open-Meteo reading arrives (or if it fails): no invented temperature. */
export const DEFAULT_WEATHER: V8Weather = {
  tempC: NaN,
  feelsLikeC: NaN,
  rainProbAfternoon: NaN,
  conditionLabel: 'Bangkok weather is loading',
  conditionIcon: '☀',
  localPickTitle: 'Stay cool between neighbourhoods',
  localPickDesc:
    'Bangkok afternoons are hot. Plan indoor or shaded stops for the middle of the day and use the covered BTS skywalks around Siam and Chit Lom.',
  localPickDealId: '',
  rainTip: 'Tropical showers are usually short — the covered BTS skywalks around Siam keep you dry.',
  updatedAt: 'Live reading unavailable',
  source: 'fallback',
};

/** T-301 (T301-007): the Weather sheet's words in the member's language. The English lines above stay the keys (v5Strings TH +
 *  zh/ja/ko/hi files); the numbers are put back in here, so a Thai screen never shows an English sentence. */
export function weatherText(w: V8Weather, L: (en: string) => string, Lf: (en: string, a: string, b?: string) => string) {
  const live = w.source === 'open-meteo' && Number.isFinite(w.tempC);
  const rain = Number.isFinite(w.rainProbAfternoon) ? String(w.rainProbAfternoon) : '';
  const rainy = live && w.localPickTitle === 'Rain plan: stay under the skywalk';
  return {
    feels: Number.isFinite(w.feelsLikeC) ? `${Lf('Feels like {0}°', String(w.feelsLikeC))} · ` : '',
    label: L(w.conditionLabel),
    title: L(w.localPickTitle),
    desc: !live ? L(w.localPickDesc)
      : rainy ? Lf('Afternoon rain chance is {0}%. The covered BTS skywalks around Siam and Chit Lom link the malls and the art centre, so you can keep exploring dry.', rain)
      : Lf('Warm {0}°C afternoon (feels like {1}°C). Plan shaded or indoor stops for midday and save the walking for after 4pm.', String(w.tempC), String(w.feelsLikeC)),
    tip: live && rain ? Lf('{0}% chance of afternoon rain — the covered BTS skywalks around Siam keep you dry.', rain)
      : L('Tropical showers are usually short — the covered BTS skywalks around Siam keep you dry.'),
  };
}

export async function fetchBangkokWeather(): Promise<V8Weather> {
  try {
    const url =
      'https://api.open-meteo.com/v1/forecast?latitude=13.7563&longitude=100.5018&current=temperature_2m,apparent_temperature,precipitation,weather_code&hourly=precipitation_probability&timezone=Asia%2FBangkok&forecast_days=1';
    const res = await fetch(url);
    if (!res.ok) return DEFAULT_WEATHER;
    const data = await res.json();
    const tempC = Math.round(data?.current?.temperature_2m ?? NaN);
    if (!Number.isFinite(tempC)) return DEFAULT_WEATHER;
    const feelsLikeC = Math.round(data?.current?.apparent_temperature ?? NaN);
    const code = Number(data?.current?.weather_code ?? 1);
    const probs: number[] = Array.isArray(data?.hourly?.precipitation_probability)
      ? data.hourly.precipitation_probability.slice(13, 19)
      : [];
    const rainProbAfternoon = probs.length ? Math.max(...probs) : 0;

    const isRainy = code >= 51 || rainProbAfternoon >= 60;
    const conditionIcon = isRainy ? '🌦' : code >= 2 ? '⛅' : '☀';
    const conditionLabel = isRainy
      ? 'Tropical shower likely this afternoon'
      : code >= 2
      ? 'Partly cloudy in Bangkok'
      : 'Sunny & warm in Bangkok';

    const localPickTitle = isRainy
      ? 'Rain plan: stay under the skywalk'
      : 'Find shade before 3pm';
    const localPickDesc = isRainy
      ? `Afternoon rain chance is ${rainProbAfternoon}%. The covered BTS skywalks around Siam and Chit Lom link the malls and the art centre, so you can keep exploring dry.`
      : `Warm ${tempC}°C afternoon (feels like ${feelsLikeC}°C). Plan shaded or indoor stops for midday and save the walking for after 4pm.`;

    return {
      tempC,
      feelsLikeC,
      rainProbAfternoon,
      conditionLabel,
      conditionIcon,
      localPickTitle,
      localPickDesc,
      localPickDealId: '',
      rainTip: `${rainProbAfternoon}% chance of afternoon rain — the covered BTS skywalks around Siam keep you dry.`,
      updatedAt: 'Live · Open-Meteo Bangkok',
      source: 'open-meteo',
    };
  } catch {
    return DEFAULT_WEATHER;
  }
}

/**
 * First-message safety guard:
 * Blocks external links, phone numbers, LINE IDs, and social handles in the first stranger hello.
 */
export function validateFirstHelloMessage(text: string): {
  valid: boolean;
  reason?: string;
} {
  const trimmed = text.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Write a short friendly hello first.' };
  }
  if (/https?:\/\/|www\.|\.com\b|\.net\b|\.me\b/i.test(trimmed)) {
    return {
      valid: false,
      reason: 'Links are blocked in a first hello. Keep your first message inside Kring.',
    };
  }
  if (/(?:\+?\d[\d\s\-()]{6,}\d)/.test(trimmed)) {
    return {
      valid: false,
      reason: 'Phone numbers are blocked in a first hello for everyone’s safety.',
    };
  }
  if (/\b(line\s*id|whatsapp|telegram|wechat|insta|ig\s*:|@[\w.]{3,})/i.test(trimmed)) {
    return {
      valid: false,
      reason: 'LINE IDs and external handles are blocked in the first message. Chat opens once they reply.',
    };
  }
  return { valid: true };
}

export interface V8OfflineQueueItem {
  id: string;
  kind: 'hello' | 'ask' | 'post';
  payload: Record<string, string>;
  createdAt: number;
}

const OFFLINE_QUEUE_KEY = 'kr8_offline_queue';

export function getOfflineQueue(): V8OfflineQueueItem[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineAction(
  kind: V8OfflineQueueItem['kind'],
  payload: Record<string, string>
): V8OfflineQueueItem[] {
  const current = getOfflineQueue();
  const next: V8OfflineQueueItem[] = [
    ...current,
    {
      id: `oq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind,
      payload,
      createdAt: Date.now(),
    },
  ];
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
  return next;
}

export function clearOfflineQueue(): void {
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch {
    // ignore
  }
}

// Live project (public publishable key, safe to ship). The old pscq… project is gone.
const SUPABASE_URL = 'https://pedxoxpammnyfnizljyj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_SaAf7mILfPPpCeAEvj79bA_Vz8JnCBN';

export async function submitWaitlistEmail(email: string): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/kr6_waitlist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        source: 'app_v9_signin_sheet',
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
// kr6_profiles is private until sign-in ships (V5); kr6_deals does not exist yet.
// Skip those calls so production boots with zero failed requests.
const PEOPLE_LIVE = false;
const DEALS_LIVE = false;
// kr6_activities needs the signed-in role too; no public reads until V5 sign-in.
const FEED_LIVE = false;

export async function fetchRealPeopleFromSupabase(): Promise<V8Person[]> {
  if (!PEOPLE_LIVE) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/kr6_profiles?deleted_at=is.null&select=*&order=created_at.desc&limit=30`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r: Record<string, unknown>) => typeof r.name === 'string' && r.name.trim().length > 0)
      .map((r: Record<string, unknown>) => {
        const rawLangs = Array.isArray(r.langs)
          ? (r.langs as string[])
          : ['TH', 'EN'];
        const langCodes = rawLangs.map((l) => String(l).toUpperCase());
        return {
          id: String(r.id || `u-${Math.random()}`),
          name: String(r.name),
          langs: langCodes.join(' · '),
          langCodes,
          who: r.role === 'traveller' ? 'traveller' : 'local',
          online: r.online === true,
          // Never show "verified" unless the row says the member really passed verification.
          verified: r.verified === true,
          img:
            typeof r.photo === 'string' && r.photo.length > 5
              ? r.photo
              : NEUTRAL_IMG,
          hook: typeof r.bio === 'string' ? r.bio.trim() : '',
          tags: typeof r.tags === 'string' ? r.tags : '',
          area: typeof r.area === 'string' && r.area.trim() ? r.area.trim() : undefined,
          here: r.here_now === true,
        } satisfies V8Person;
      });
  } catch {
    return [];
  }
}

export async function fetchRealFeedFromSupabase(): Promise<V8FeedItem[]> {
  if (!FEED_LIVE && typeof window !== 'undefined' && !('vi' in globalThis)) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/kr6_activities?select=*&order=created_at.desc&limit=20`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r: Record<string, unknown>) => typeof r.title === 'string' && r.title.trim().length > 0)
      .map((r: Record<string, unknown>) => ({
        id: String(r.id || `post-${Math.random()}`),
        type: 'photo' as const,
        img:
          typeof r.photo === 'string' && r.photo.length > 5
            ? r.photo
            : NEUTRAL_IMG,
        av:
          typeof r.host_photo === 'string' && r.host_photo.length > 5
            ? r.host_photo
            : NEUTRAL_IMG,
        name: String(r.host_name || 'Kring member'),
        langs: '',
        area: typeof r.area === 'string' ? r.area : undefined,
        here: false,
        cap: String(r.title),
        hiCount: 0,
      }));
  } catch {
    return [];
  }
}

export async function fetchRealDealsFromSupabase(): Promise<V8Deal[]> {
  if (!DEALS_LIVE) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/kr6_deals?active=is.true&select=*&order=created_at.desc&limit=20`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows
      .filter(
        (r: Record<string, unknown>) =>
          typeof r.title === 'string' &&
          r.title.trim().length > 0 &&
          typeof r.venue_name === 'string' &&
          r.venue_name.trim().length > 0 &&
          Number.isFinite(Number(r.price_now)) &&
          r.price_now !== null
      )
      .map((r: Record<string, unknown>) => ({
        id: String(r.id || `deal-${Math.random()}`),
        cat:
          r.category === 'coffee' ||
          r.category === 'food' ||
          r.category === 'classes' ||
          r.category === 'fun'
            ? r.category
            : 'coffee',
        tag: String(r.tag || 'Partner Perk'),
        title: String(r.title),
        venue: String(r.venue_name),
        area: String(r.area || 'Bangkok'),
        now: Number(r.price_now),
        was: Number(r.price_was ?? r.price_now),
        claimed: Number(r.claimed_count ?? 0),
        leftCount: Number.isFinite(Number(r.left_count)) ? Number(r.left_count) : undefined,
        validWindow: typeof r.valid_window === 'string' ? r.valid_window : undefined,
        // Use the partner's own consented photo (0021_venue_media_consent flow)
        img:
          typeof r.consented_photo_url === 'string' && r.consented_photo_url.length > 5
            ? r.consented_photo_url
            : typeof r.photo === 'string' && r.photo.length > 5
            ? r.photo
            : NEUTRAL_IMG,
        code: typeof r.code === 'string' ? r.code : '',
      }));
  } catch {
    return [];
  }
}
