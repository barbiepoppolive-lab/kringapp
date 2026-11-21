/**
 * Admin "Growth" screen (0113 kr8_admin_growth): pure helpers, unit-tested in growthLogic.test.ts.
 * The database returns raw first-visit referrer hosts; sourceOf() groups them into the friendly names the founder reads.
 */
export type GrowthDays = 1 | 7 | 30;
export type GrowthSourceRow = { host: string | null; ref: string | null; visitors: number };
export type GrowthRef = { ref: string; visitors: number; joined: number; reels: number; member_no: number | null; member_name: string | null };
export type GrowthSource2Key = 'google' | 'ai' | 'instagram' | 'tiktok' | 'facebook' | 'line' | 'invite' | 'pich' | 'reel' | 'ask' | 'install' | 'link' | 'other' | 'direct';
export type GrowthSource2 = { key: GrowthSource2Key; visitors: number; details: { d: string; n: number; name: string | null; no: number | null }[] };
/** 0193 channel names (English only, admin) and what a row means when tapped */
export const SOURCE2: Record<GrowthSource2Key, { label: string; means: string }> = {
  google: { label: 'Google', means: 'came from a Google search or the Google app' },
  ai: { label: 'ChatGPT / AI', means: 'came from an AI answer (ChatGPT, Perplexity, Gemini, Copilot, Claude)' },
  instagram: { label: 'Instagram', means: 'came from Instagram' },
  tiktok: { label: 'TikTok', means: 'came from TikTok' },
  facebook: { label: 'Facebook', means: 'came from Facebook or Messenger' },
  line: { label: 'LINE', means: 'came from LINE' },
  invite: { label: 'Member invite links', means: 'opened a member\'s invite link (?ref=k…)' },
  pich: { label: 'Pich', means: 'opened Pich\'s link (?ref=pich)' },
  reel: { label: 'Reel share links', means: 'opened a shared Reel link (/r/…)' },
  ask: { label: 'Ask BKK pages', means: 'came in from a public Ask BKK question page (/q/…)' },
  install: { label: 'Install button', means: 'came through an Install / Get the app button' },
  link: { label: 'Other links', means: 'opened another ?ref= link (recruiters, posters, partners)' },
  other: { label: 'Other sites', means: 'came from another website' },
  direct: { label: 'Direct', means: 'no site was passed on (typed link, home-screen app, many in-app browsers)' },
};
export type Growth = {
  days: GrowthDays; from: string; to: string; now: string;
  visitors: number; visitors_prev: number; visits: number; returning: number;
  signins: number; cards: number; first_reels: number; app_installs: number; share_opens: number | null;
  funnel: { signed_in: number; card: number; reel: number; new_visitors?: number };
  sources: GrowthSourceRow[];
  /** 0193: phones whose first-ever visit is in the period (never signed in / installed app) · real members whose app opened */
  new_visitors?: number; member_opens?: number;
  /** 0193: one fixed channel list with the detail behind each row */
  sources2?: GrowthSource2[];
  refs: GrowthRef[];
  countries: { country: string | null; visitors: number }[];
  series: { t: string | number; visitors: number }[];
};

export function isGrowth(x: unknown): x is Growth {
  const g = x as Growth;
  return !!g && typeof g === 'object' && typeof g.visitors === 'number' && typeof g.visits === 'number' && !!g.funnel
    && Array.isArray(g.sources) && Array.isArray(g.refs) && Array.isArray(g.countries) && Array.isArray(g.series);
}

export type SourceKey = 'direct' | 'line' | 'google' | 'facebook' | 'instagram' | 'tiktok' | 'kring' | 'links' | 'other';
export const SOURCE_LABEL: Record<SourceKey, string> = {
  direct: 'Direct / in-app', line: 'LINE', google: 'Google', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok',
  kring: 'Kring site', links: 'Shared links (?ref=)', other: 'Other',
};
const SOURCE_ORDER: SourceKey[] = ['direct', 'line', 'google', 'facebook', 'instagram', 'tiktok', 'kring', 'links', 'other'];

/** "?ref=" words that name a channel, not a person (kept in step with 0056 / 0113). */
const CHANNEL_REF: Record<string, SourceKey> = {
  ig: 'instagram', insta: 'instagram', instagram: 'instagram', tt: 'tiktok', tiktok: 'tiktok', fb: 'facebook', facebook: 'facebook',
  line: 'line', google: 'google', direct: 'direct', '(none)': 'direct',
};

/** Clean a referrer to a bare host: "https://M.Facebook.com/x" → "m.facebook.com", "android-app://jp.naver.line.android" → "jp.naver.line.android". */
export function hostOf(referrer: string | null | undefined): string {
  return String(referrer || '').trim().toLowerCase().replace(/^[a-z-]+:\/\//, '').replace(/[/:?#].*$/, '');
}

/** One visitor's first referrer host (+ its ?ref= when the referrer is empty) → the friendly group. */
export function sourceOf(referrer: string | null | undefined, ref?: string | null): SourceKey {
  const h = hostOf(referrer);
  if (!h) {
    const r = String(ref || '').trim().toLowerCase();
    if (!r) return 'direct';
    return CHANNEL_REF[r] || 'links';
  }
  if (/(^|\.)line\.me$/.test(h) || /^jp\.naver\.line/.test(h) || /(^|\.)naver\.line/.test(h)) return 'line';
  if (/(^|\.)google\.[a-z.]+$/.test(h) || /^com\.google\.android\.(googlequicksearchbox|gm)/.test(h)) return 'google';
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(h) || /^com\.facebook\./.test(h)) return 'facebook';
  if (/(^|\.)instagram\.com$/.test(h) || /^com\.instagram\./.test(h)) return 'instagram';
  if (/(^|\.)tiktok\.com$/.test(h) || /^(com\.zhiliaoapp\.musically|com\.ss\.android\.ugc)/.test(h)) return 'tiktok';
  if (/(^|\.)kringapp\.com$/.test(h)) return 'kring';
  return 'other';
}

/** Noise the database already drops; mirrored here so a stray row never shows as a source. */
export function isNoiseHost(referrer: string | null | undefined): boolean {
  const h = hostOf(referrer);
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(h) || /\.pages\.dev$/.test(h) || /^bartest/.test(h);
}
/** Internal ?ref= codes: tests, demo, perf, zz… (and the install event, which is shown on its own). */
export const isInternalRef = (ref: string | null | undefined) => /^(test|zz)/.test(String(ref || '').toLowerCase()) || ['perf', 'demo', 'pwa-install'].includes(String(ref || '').toLowerCase());

export type SourceLine = { key: SourceKey; label: string; visitors: number; share: number; hosts: string[] };
/** Group raw rows; biggest first, empty groups left out. share = 0–100 (whole numbers). hosts = the top "Other" hosts for the ⓘ. */
export function groupSources(rows: GrowthSourceRow[]): SourceLine[] {
  const by = new Map<SourceKey, { n: number; hosts: Map<string, number> }>();
  for (const r of rows) {
    if (isNoiseHost(r.host) || (!r.host && isInternalRef(r.ref))) continue;
    const k = sourceOf(r.host, r.ref);
    const g = by.get(k) || { n: 0, hosts: new Map() };
    g.n += r.visitors || 0;
    if (r.host) g.hosts.set(hostOf(r.host), (g.hosts.get(hostOf(r.host)) || 0) + (r.visitors || 0));
    by.set(k, g);
  }
  const total = [...by.values()].reduce((a, g) => a + g.n, 0);
  return [...by.entries()].filter(([, g]) => g.n > 0)
    .map(([key, g]) => ({ key, label: SOURCE_LABEL[key], visitors: g.n, share: total ? Math.round((g.n / total) * 100) : 0,
      hosts: [...g.hosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([h]) => h) }))
    .sort((a, b) => b.visitors - a.visitors || SOURCE_ORDER.indexOf(a.key) - SOURCE_ORDER.indexOf(b.key));
}

/** Step-to-step percent: "—" when the step before is 0. */
export const stepPct = (n: number, of: number): string => (of > 0 ? `${Math.round((n / of) * 100)}%` : '—');
/** "+25% vs last 7 days" / "−10% …" / "" when there is nothing to compare. A past single day (Day view) compares with "the day before". */
export function trendWords(now: number, before: number, days: GrowthDays, pastDay = false): string {
  if (!before) return '';
  const p = Math.round(((now - before) / before) * 100);
  const span = days === 1 ? (pastDay ? 'the day before' : 'same time yesterday') : `previous ${days} days`;
  return p === 0 ? `same as ${span}` : `${p > 0 ? '+' : '−'}${Math.abs(p)}% vs ${span}`;
}

/** Recruiter link name: member invite codes (k00184) read "#184 Mint's invite". */
export function refLabel(r: Pick<GrowthRef, 'ref' | 'member_no' | 'member_name'>): string {
  if (/^k0*\d{1,7}$/.test(r.ref)) {
    const no = r.member_no ?? Number(r.ref.replace(/^k0*/, ''));
    return r.member_name ? `${r.member_name} #${no} · invite` : `Member #${no} · invite`;
  }
  return r.ref;
}
/** Recruiter rows to show: internal codes hidden, people who brought someone first. */
export const visibleRefs = (refs: GrowthRef[]) => refs.filter((r) => !isInternalRef(r.ref) && (r.visitors > 0 || r.joined > 0))
  .sort((a, b) => b.joined - a.joined || b.reels - a.reels || b.visitors - a.visitors || a.ref.localeCompare(b.ref));

const COUNTRY: Record<string, string> = {
  TH: 'Thailand', IN: 'India', US: 'United States', GB: 'United Kingdom', SG: 'Singapore', MY: 'Malaysia', JP: 'Japan', CN: 'China', KR: 'South Korea',
  AU: 'Australia', DE: 'Germany', FR: 'France', NL: 'Netherlands', VN: 'Vietnam', ID: 'Indonesia', PH: 'Philippines', HK: 'Hong Kong', TW: 'Taiwan',
  LA: 'Laos', MM: 'Myanmar', KH: 'Cambodia', AE: 'UAE', CA: 'Canada', RU: 'Russia', IT: 'Italy', ES: 'Spain', SE: 'Sweden', IL: 'Israel',
};
export const countryName = (c: string | null) => (c ? COUNTRY[c.toUpperCase()] || c.toUpperCase() : 'Unknown');
/** Flag emoji from a 2-letter code ("" when unknown). */
export const flag = (c: string | null) => (c && /^[A-Za-z]{2}$/.test(c) ? String.fromCodePoint(...[...c.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : '');

/** Sparkline: an SVG path ("M0,40 L…") over w×h for the values, with a little top/bottom room. */
export function sparkPath(vals: number[], w = 320, h = 64): { line: string; area: string; max: number } {
  const max = Math.max(1, ...vals);
  if (!vals.length) return { line: '', area: '', max };
  const step = vals.length > 1 ? w / (vals.length - 1) : 0;
  const y = (v: number) => +(h - 4 - (v / max) * (h - 12)).toFixed(1);
  const pts = vals.map((v, i) => `${+(i * step).toFixed(1)},${y(v)}`);
  const line = 'M' + pts.join(' L');
  return { line, area: `${line} L${+((vals.length - 1) * step).toFixed(1)},${h} L0,${h} Z`, max };
}
/** Label under the sparkline ends: "12 Nov" … "18 Nov", or "00:00" … "23:00" for Today. */
export function seriesEnds(s: Growth['series'], days: GrowthDays): [string, string] {
  if (!s.length) return ['', ''];
  const f = (t: string | number) => days === 1 ? `${String(t).padStart(2, '0')}:00`
    : new Date(String(t) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return [f(s[0].t), f(s[s.length - 1].t)];
}

// ───────── 0114: Day view + Day by day table ─────────
export type GrowthDay = Growth & { day: string; is_today: boolean };
export type GrowthDailyRow = { day: string; visitors: number; visits: number; returning: number; signins: number; cards: number; first_reels: number };
export const isGrowthDay = (x: unknown): x is GrowthDay => isGrowth(x) && typeof (x as GrowthDay).day === 'string';
export const isGrowthDaily = (x: unknown): x is GrowthDailyRow[] =>
  Array.isArray(x) && x.every((r) => r && typeof r.day === 'string' && typeof r.visitors === 'number' && typeof r.signins === 'number');
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDay = (d: string | null | undefined): d is string => {
  if (!d || !ISO.test(d)) return false;
  const t = Date.parse(d + 'T00:00:00Z');
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;   // 2026-02-31 is not a day
};
/** Today's Bangkok date, "2026-11-18" (Bangkok is UTC+7 all year). */
export const bkkToday = (now = Date.now()) => new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
/** "2026-11-18" ± n days. */
export const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
/** "Tue 18 Nov" (the Day view title and the table rows). */
export const dayName = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
/** Keep a picked day inside [first, today]; anything else (bad text, future) becomes today. */
export function clampDay(d: string | null | undefined, today: string, first = '2026-11-12'): string {
  if (!isIsoDay(d) || d > today) return today;
  return d < first ? first : d;
}
/** Range for the Day by day table of a 7 / 30 day view, ending today. */
export const dailyRange = (days: 7 | 30, today: string): [string, string] => [addDays(today, -(days - 1)), today];
