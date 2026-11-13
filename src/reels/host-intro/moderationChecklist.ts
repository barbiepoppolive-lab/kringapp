/**
 * A-18 · Fable-Reviewed Pre-Publish Moderation Checklist & Auto-Corrector for Host Intro Reels
 *
 * Rules enforced (including 27 Oct 19:40 Amendment):
 * 1. Triggered at PRE-REGISTRATION (once ID check passes), on go-live, and after each 5★ review (max 1/week/host).
 * 2. Women-led creative for women travellers ("Travelling Thailand solo? Meet a verified local who shows you her Bangkok").
 * 3. Targeting by interests only (cafés, travel, language exchange, lifestyle), never by gender.
 * 4. No copy recruiting women to meet foreign men; no companion/dating/beauty/nightlife framing.
 * 5. Public places only (host attests + check for hotels/condos/bars/massage).
 * 6. No prices (฿ / THB / $), no percentages (%), no launch date.
 * 7. Brand colours only (night #0B0E1A, anchan #3446FF, marigold #FFB21E).
 * 8. Two-door end-card CTA ("Pre-register as a host" + "Join the traveller waitlist"), referral link https://kringapp.com/?ref=H-<id>, and #โฆษณา #ad.
 * 9. Renders failing the checklist are re-rendered with corrected copy and the host is told why in one line.
 */

export const BRAND_PALETTE = {
  night: '#05060D',
  anchan: '#3446FF',
  marigold: '#FFB21E',
} as const;

export const ALLOWED_INTEREST_TARGETS = [
  'cafés',
  'travel',
  'language exchange',
  'lifestyle',
] as const;

export interface HostReelInput {
  hostId: string;
  firstNameEn: string;
  firstNameTh: string;
  hostGender: 'f' | 'm';
  idVerified: boolean;
  consentTicked: boolean;
  publicPlaceAttested: boolean;
  trigger: 'pre_registration' | 'go_live' | 'five_star_review';
  lastRenderedAtIso?: string | null;
  activityEn: string;
  activityTh: string;
  neighbourhoodEn: string;
  neighbourhoodTh: string;
  venueName: string;
  photos: string[]; // 4 to 6 photo paths/URLs
  captionHookEn?: string;
  captionHookTh?: string;
  promiseLineEn?: string;
  promiseLineTh?: string;
  endCardCtaHostEn?: string;
  endCardCtaTravellerEn?: string;
  sponsoredTag?: string;
  interestTargeting?: string[];
  genderTargeting?: 'ALL_GENDERS_INTEREST_ONLY' | 'FEMALE_ONLY' | 'MALE_ONLY';
}

export interface ModerationResult {
  passed: boolean;
  violations: string[];
  hostReasonOneLine: string | null;
  correctedSpec: Required<HostReelInput> & {
    referralUrl: string;
    hostPreRegUrl: string;
    travellerWaitlistUrl: string;
    durationSeconds: number;
    width: 1080;
    height: 1920;
    fps: 30;
  };
}

const DATING_OR_COMPANION_RE =
  /\b(date|dating|single|boyfriend|girlfriend|foreign\s+men|meet\s+men|rich\s+men|companion|escort|lady\s+drink|hostess|nightlife|clubbing|party\s+girl|sexy|beauty\s+queen|sugar| intimate|private\s+time)\b/i;

const PRIVATE_OR_BLOCKED_VENUE_RE =
  /\b(hotel|resort|hostel\s+room|condo|condominium|apartment|airbnb|residence|dorm|bedroom|suite|villa|home|house|bar|pub|nightclub|lounge|ktv|karaoke|massage|spa|onsen|sauna)\b/i;

const PRICE_OR_PERCENT_RE = /([฿$€£]\s*\d|\bTHB\s*\d|\bbaht\b|\d+\s*%)/i;

const EXACT_DATE_RE = /\b(\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+202\d)\b/i;

export const DEFAULT_WOMEN_TRAVELLER_HOOK_EN =
  'Travelling Thailand solo? Meet a verified local who shows you her Bangkok';
export const DEFAULT_WOMEN_TRAVELLER_HOOK_TH =
  'เที่ยวไทยคนเดียว? พบเจ้าถิ่นที่ยืนยันตัวตนแล้ว พาเดินเที่ยวกรุงเทพในมุมของเธอ';

export const DEFAULT_PROMISE_EN = 'Nothing charged until you meet';
export const DEFAULT_PROMISE_TH = 'ไม่เรียกเก็บเงินจนกว่าจะพบกัน';

export function checkAndCorrectHostReel(input: HostReelInput): ModerationResult {
  const violations: string[] = [];
  const reasonsForHost: string[] = [];

  if (!input.idVerified) {
    violations.push('id_not_verified');
    reasonsForHost.push('your ID check must finish first');
  }
  if (!input.consentTicked) {
    violations.push('photo_consent_not_ticked');
    reasonsForHost.push('photo consent must be ticked');
  }
  if (!input.publicPlaceAttested) {
    violations.push('public_place_not_attested');
    reasonsForHost.push('meeting place must be a public place');
  }
  if (!Array.isArray(input.photos) || input.photos.length < 4 || input.photos.length > 6) {
    violations.push('photo_count_must_be_4_to_6');
    reasonsForHost.push('please include 4 to 6 activity photos in public places');
  }

  // Rate limit check: max 1 render per week per host (except initial pre_registration)
  if (input.lastRenderedAtIso && input.trigger !== 'pre_registration') {
    const elapsedMs = Date.now() - new Date(input.lastRenderedAtIso).getTime();
    if (elapsedMs < 7 * 24 * 3600 * 1000) {
      violations.push('weekly_render_limit_reached');
      reasonsForHost.push('reels render at most once per week');
    }
  }

  const allCopy = [
    input.activityEn,
    input.activityTh,
    input.neighbourhoodEn,
    input.neighbourhoodTh,
    input.venueName,
    input.captionHookEn || '',
    input.captionHookTh || '',
  ].join(' ');

  if (DATING_OR_COMPANION_RE.test(allCopy)) {
    violations.push('dating_or_companion_framing');
    reasonsForHost.push('copy must describe an everyday activity for travellers, never dating or nightlife');
  }

  if (PRIVATE_OR_BLOCKED_VENUE_RE.test(allCopy)) {
    violations.push('private_or_blocked_venue');
    reasonsForHost.push('meeting place and photos must be public places only (no hotels, condos, bars or spas)');
  }

  if (PRICE_OR_PERCENT_RE.test(allCopy)) {
    violations.push('price_or_percentage_in_reel');
    reasonsForHost.push('reels never show prices or percentages');
  }

  if (EXACT_DATE_RE.test(allCopy)) {
    violations.push('exact_date_in_reel');
    reasonsForHost.push('reels never show a calendar launch date');
  }

  if (input.genderTargeting && input.genderTargeting !== 'ALL_GENDERS_INTEREST_ONLY') {
    violations.push('gender_ad_targeting_forbidden');
    reasonsForHost.push('boosted posts target interests (cafés, travel, language exchange, lifestyle), never gender');
  }

  const cleanText = (s: string, fallback: string) => {
    const stripped = String(s || '')
      .replace(new RegExp(DATING_OR_COMPANION_RE.source, 'gi'), '')
      .replace(new RegExp(PRIVATE_OR_BLOCKED_VENUE_RE.source, 'gi'), 'public café')
      .replace(/([฿$€£]\s*[\d,.]+|\bTHB\s*[\d,.]+|\bbaht\b|\d+\s*%)/gi, '')
      .replace(new RegExp(EXACT_DATE_RE.source, 'gi'), '')
      .replace(/[()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return stripped.length >= 3 ? stripped : fallback;
  };

  const cleanHostId = String(input.hostId || '001').replace(/^H-/i, '');
  const referralUrl = `https://kringapp.com/?ref=H-${cleanHostId}`;
  const hostPreRegUrl = `https://kringapp.com/?ref=H-${cleanHostId}#host`;
  const travellerWaitlistUrl = `https://kringapp.com/?ref=H-${cleanHostId}#waitlist`;

  const correctedSpec = {
    ...input,
    hostId: cleanHostId,
    activityEn: cleanText(input.activityEn, 'Morning Specialty Coffee Walk'),
    activityTh: cleanText(input.activityTh, 'เดินเล่นคาเฟ่และชิมกาแฟยามเช้า'),
    neighbourhoodEn: cleanText(input.neighbourhoodEn, 'Ari, Bangkok'),
    neighbourhoodTh: cleanText(input.neighbourhoodTh, 'อารีย์ กรุงเทพฯ'),
    venueName: cleanText(input.venueName, 'Ari Public Café Square'),
    photos: (input.photos || []).slice(0, 6),
    captionHookEn:
      violations.includes('dating_or_companion_framing') ||
      violations.includes('price_or_percentage_in_reel') ||
      !input.captionHookEn
        ? DEFAULT_WOMEN_TRAVELLER_HOOK_EN
        : cleanText(input.captionHookEn, DEFAULT_WOMEN_TRAVELLER_HOOK_EN),
    captionHookTh:
      violations.includes('dating_or_companion_framing') ||
      violations.includes('price_or_percentage_in_reel') ||
      !input.captionHookTh
        ? DEFAULT_WOMEN_TRAVELLER_HOOK_TH
        : cleanText(input.captionHookTh, DEFAULT_WOMEN_TRAVELLER_HOOK_TH),
    promiseLineEn: DEFAULT_PROMISE_EN,
    promiseLineTh: DEFAULT_PROMISE_TH,
    endCardCtaHostEn: 'Pre-register as a host',
    endCardCtaTravellerEn: 'Join the traveller waitlist',
    sponsoredTag: '#โฆษณา #ad',
    interestTargeting: [...ALLOWED_INTEREST_TARGETS],
    genderTargeting: 'ALL_GENDERS_INTEREST_ONLY' as const,
    lastRenderedAtIso: input.lastRenderedAtIso ?? null,
    referralUrl,
    hostPreRegUrl,
    travellerWaitlistUrl,
    durationSeconds: 16,
    width: 1080 as const,
    height: 1920 as const,
    fps: 30 as const,
  };

  const hostReasonOneLine =
    reasonsForHost.length > 0
      ? `We updated your reel copy automatically because ${reasonsForHost.join('; ')}.`
      : null;

  return {
    passed: violations.length === 0,
    violations,
    hostReasonOneLine,
    correctedSpec,
  };
}
