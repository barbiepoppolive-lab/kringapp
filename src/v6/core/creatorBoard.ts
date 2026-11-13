/**
 * A-18 · Creator Board (5th Leaderboard), Referral Link Fee Waiver, Spark Ads Flow & LINE OA Reel Delivery
 *
 * Pool split (funded from the 30% pool):
 * - Top Hosts:             30
 * - Meetups:               25
 * - Travellers' Favourite: 15
 * - Rising:                10
 * - Creator:               20
 *
 * Creator score formula (counts from PRE-REGISTRATION):
 *   score = postsMade (+1 per platform: tiktok, instagram_reels, lemon8)
 *         + Math.floor(verifiedViews / 1000) (+1 per 1,000 verified views with public count + screenshot)
 *         + referralBookingsOrPreRegs * 5 (+5 per booking/pre-registration via ?ref=H-<id>)
 *
 * Board shows rank and score ONLY — never baht.
 */

export const LEADERBOARD_POOL_SPLIT = {
  topHosts: 30,
  meetups: 25,
  travellersFavourite: 15,
  rising: 10,
  creator: 20,
} as const;

export type ReelPlatform = 'tiktok' | 'instagram_reels' | 'lemon8';

export interface VerifiedPostSubmission {
  platform: ReelPlatform;
  postUrl: string;
  publicViewCount: number;
  screenshotProofUrl: string;
  verifiedByStaff: boolean;
}

export interface CreatorBoardEntry {
  hostId: string;
  firstNameTh: string;
  firstNameEn: string;
  neighbourhoodTh: string;
  neighbourhoodEn: string;
  preRegisteredAt: string;
  idCheckPassed: boolean;
  posts: VerifiedPostSubmission[];
  referralPreRegsAndBookings: number;
  baseMeetupsCompleted: number;
  sparkAdsAuth?: {
    tiktokSparkCode?: string;
    metaPartnershipPermissionGranted?: boolean;
    submittedAt?: string;
    boostApprovedByFounder?: boolean;
  };
}

export interface RankedCreatorRow {
  rank: number;
  hostId: string;
  firstNameTh: string;
  firstNameEn: string;
  neighbourhoodTh: string;
  neighbourhoodEn: string;
  platformsPostedCount: number;
  verifiedViewsTotal: number;
  referralCount: number;
  score: number;
  rewardLabelTh: string;
  rewardLabelEn: string;
}

/**
 * Compute a host's Creator Board score:
 * +1 per platform posted, +1 per 1,000 verified views (requires screenshotProofUrl + verifiedByStaff),
 * +5 per referral booking/pre-registration via ?ref=H-<id>.
 * Counts from pre-registration once ID check is passed.
 */
export function computeCreatorScore(entry: CreatorBoardEntry): {
  platformsPostedCount: number;
  verifiedViewsTotal: number;
  viewPoints: number;
  referralPoints: number;
  score: number;
} {
  if (!entry.idCheckPassed) {
    return {
      platformsPostedCount: 0,
      verifiedViewsTotal: 0,
      viewPoints: 0,
      referralPoints: 0,
      score: 0,
    };
  }

  const distinctPlatforms = new Set<ReelPlatform>();
  let verifiedViewsTotal = 0;

  for (const p of entry.posts || []) {
    if (p.postUrl) {
      distinctPlatforms.add(p.platform);
    }
    if (p.verifiedByStaff && p.screenshotProofUrl && p.publicViewCount > 0) {
      verifiedViewsTotal += p.publicViewCount;
    }
  }

  const platformsPostedCount = distinctPlatforms.size;
  const viewPoints = Math.floor(verifiedViewsTotal / 1000);
  const referralPoints = Math.max(0, entry.referralPreRegsAndBookings) * 5;
  const score = platformsPostedCount + viewPoints + referralPoints;

  return {
    platformsPostedCount,
    verifiedViewsTotal,
    viewPoints,
    referralPoints,
    score,
  };
}

/**
 * Referral link behaviour for Meetups board:
 * Bookings via H-<id> credit the host's Meetups board ×1.5 for that booking.
 */
export function computeMeetupsBoardScore(opts: {
  regularMeetups: number;
  referredMeetups: number;
}): number {
  return Math.max(0, opts.regularMeetups) * 1 + Math.max(0, opts.referredMeetups) * 1.5;
}

const STICKY_REF_STORAGE_KEY = 'kr6_sticky_ref';
const STICKY_TX_STORAGE_KEY = 'kr6_sticky_tx_id';
const PARTNER_RECON_STORAGE_KEY = 'kr6_partner_recon_log';

export interface StickyReferralAttribution {
  refCode: string | null;
  txId: string | null;
  isTagthaiAffiliate: boolean;
  isHostReferral: boolean;
  hostId: string | null;
}

/**
 * Capture ?ref= and ?tx_id= from window.location.search or window.location.hash
 * and persist in localStorage so navigating across screens never drops attribution.
 */
export function captureAndGetStickyRef(searchOverride?: string): StickyReferralAttribution {
  let rawRef = '';
  let rawTx = '';
  try {
    const searchPart =
      searchOverride !== undefined
        ? searchOverride
        : typeof window !== 'undefined'
          ? window.location.search
          : '';
    const hashQuery =
      typeof window !== 'undefined' && window.location.hash.includes('?')
        ? '?' + window.location.hash.split('?').slice(1).join('?')
        : '';
    const p1 = new URLSearchParams(searchPart || '');
    const p2 = new URLSearchParams(hashQuery || '');
    rawRef = (p1.get('ref') || p2.get('ref') || '').trim();
    rawTx = (p1.get('tx_id') || p2.get('tx_id') || p1.get('tid') || p2.get('tid') || '').trim();

    if (typeof window !== 'undefined' && window.localStorage) {
      if (rawRef) {
        window.localStorage.setItem(STICKY_REF_STORAGE_KEY, rawRef);
      } else {
        rawRef = (window.localStorage.getItem(STICKY_REF_STORAGE_KEY) || '').trim();
      }
      if (rawTx) {
        window.localStorage.setItem(STICKY_TX_STORAGE_KEY, rawTx);
      } else {
        rawTx = (window.localStorage.getItem(STICKY_TX_STORAGE_KEY) || '').trim();
      }
      if (!rawTx && /^tagthai/i.test(rawRef)) {
        rawTx = 'TT-' + Date.now().toString(36).toUpperCase();
        window.localStorage.setItem(STICKY_TX_STORAGE_KEY, rawTx);
      }
    }
  } catch {
    /* ignore storage errors */
  }

  const hostMatch = rawRef.match(/^H-([A-Za-z0-9_-]+)$/i);
  const isTagthaiAffiliate = /^tagthai/i.test(rawRef);

  return {
    refCode: rawRef || null,
    txId: rawTx || null,
    isTagthaiAffiliate,
    isHostReferral: !!hostMatch,
    hostId: hostMatch ? hostMatch[1] : null,
  };
}

export interface PartnerReconRow {
  txId: string;
  bookingId: string;
  partnerRef: string;
  activityTitle: string;
  ticketTier: string;
  ticketPriceThb: number;
  affiliateRatePct: number;
  affiliateCommissionThb: number;
  hostPayAtPlaceThb: number;
  status: 'confirmed' | 'completed';
  createdAt: string;
}

export const DEFAULT_TAGTHAI_RECON_SAMPLE: PartnerReconRow[] = [
  {
    txId: 'TT-KR6-88410',
    bookingId: 'KR-BK-901',
    partnerRef: 'tagthai',
    activityTitle: 'Song Wat Specialty Coffee & Shophouse Art Walk',
    ticketTier: 'Standard Booking Ticket',
    ticketPriceThb: 199,
    affiliateRatePct: 15,
    affiliateCommissionThb: 29.85,
    hostPayAtPlaceThb: 800,
    status: 'completed',
    createdAt: '2026-10-29T07:30:00Z',
  },
  {
    txId: 'TT-KR6-88411',
    bookingId: 'KR-BK-902',
    partnerRef: 'tagthai',
    activityTitle: 'Ratchaprasong Evening Walk & Hidden Alley Bite Crawl',
    ticketTier: 'Standard Booking Ticket',
    ticketPriceThb: 199,
    affiliateRatePct: 15,
    affiliateCommissionThb: 29.85,
    hostPayAtPlaceThb: 800,
    status: 'confirmed',
    createdAt: '2026-10-29T08:15:00Z',
  },
  {
    txId: 'TT-KR6-88412',
    bookingId: 'KR-BK-903',
    partnerRef: 'tagthai',
    activityTitle: 'Tha Tien & Chao Phraya Sunset Photo Walk',
    ticketTier: 'Standard Booking Ticket',
    ticketPriceThb: 199,
    affiliateRatePct: 15,
    affiliateCommissionThb: 29.85,
    hostPayAtPlaceThb: 900,
    status: 'confirmed',
    createdAt: '2026-10-29T09:00:00Z',
  },
];

export function getPartnerReconRows(partnerFilter = 'tagthai'): PartnerReconRow[] {
  let stored: PartnerReconRow[] = [];
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(PARTNER_RECON_STORAGE_KEY);
      if (raw) stored = JSON.parse(raw);
    }
  } catch {
    /* ignore */
  }
  const merged = [...stored, ...DEFAULT_TAGTHAI_RECON_SAMPLE];
  if (!partnerFilter) return merged;
  return merged.filter((r) => r.partnerRef.toLowerCase().includes(partnerFilter.toLowerCase()));
}

export function recordPartnerReconBooking(row: PartnerReconRow): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(PARTNER_RECON_STORAGE_KEY);
      const list: PartnerReconRow[] = raw ? JSON.parse(raw) : [];
      list.unshift(row);
      window.localStorage.setItem(PARTNER_RECON_STORAGE_KEY, JSON.stringify(list.slice(0, 100)));
    }
  } catch {
    /* ignore */
  }
}

/**
 * Parse ?ref=H-<id> from URL search string (or sticky localStorage fallback)
 * and determine whether traveller gets the fee waiver.
 */
export function parseHostReferralLink(searchStr: string): {
  isHostReferral: boolean;
  hostId: string | null;
  travellerBannerEn: string | null;
  travellerBannerTh: string | null;
  meetupsBoardMultiplier: number;
} {
  const params = new URLSearchParams(searchStr || '');
  let raw = (params.get('ref') || '').trim();
  if (!raw && searchStr === (typeof window !== 'undefined' ? window.location.search : '')) {
    const sticky = captureAndGetStickyRef(searchStr);
    raw = sticky.refCode || '';
  }
  const m = raw.match(/^H-([A-Za-z0-9_-]+)$/i);
  if (!m) {
    return {
      isHostReferral: false,
      hostId: null,
      travellerBannerEn: null,
      travellerBannerTh: null,
      meetupsBoardMultiplier: 1.0,
    };
  }
  return {
    isHostReferral: true,
    hostId: m[1],
    travellerBannerEn: 'No Kring fee on this booking',
    travellerBannerTh: 'ฟรีค่าธรรมเนียมกริ๊ง! สำหรับการจองผ่านลิงก์โฮสต์นี้',
    meetupsBoardMultiplier: 1.5,
  };
}

/**
 * Rank Creator Board entries (shows rank and score only — never baht).
 */
export function rankCreatorBoard(entries: CreatorBoardEntry[]): RankedCreatorRow[] {
  const scored = entries.map((e) => {
    const s = computeCreatorScore(e);
    return {
      hostId: e.hostId,
      firstNameTh: e.firstNameTh,
      firstNameEn: e.firstNameEn,
      neighbourhoodTh: e.neighbourhoodTh,
      neighbourhoodEn: e.neighbourhoodEn,
      platformsPostedCount: s.platformsPostedCount,
      verifiedViewsTotal: s.verifiedViewsTotal,
      referralCount: e.referralPreRegsAndBookings,
      score: s.score,
    };
  });

  scored.sort((a, b) => b.score - a.score || b.referralCount - a.referralCount);

  return scored.map((row, idx) => ({
    rank: idx + 1,
    ...row,
    rewardLabelTh: 'รับสิทธิพิเศษพาร์ทเนอร์ (สปา · คาเฟ่ · คลินิก)',
    rewardLabelEn: 'Partner perks reward (never shown in baht)',
  }));
}

/**
 * Build LINE Official Account (LINE OA) delivery message with one-tap posting instructions
 * for TikTok, Instagram Reels, and Lemon8, plus 30-day private Supabase bucket storage metadata.
 */
export function buildLineOaReelDeliveryPayload(opts: {
  hostId: string;
  firstNameTh: string;
  firstNameEn: string;
  signedVideoUrl: string;
  storageBucketPath: string;
}) {
  const refUrl = `https://kringapp.com/?ref=H-${opts.hostId}`;
  const expiresAtIso = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

  return {
    channel: 'LINE_OA',
    recipientHostId: opts.hostId,
    storagePolicy: {
      bucket: 'host-reels-private',
      objectPath: opts.storageBucketPath,
      visibility: 'private',
      retentionDays: 30,
      expiresAtIso,
    },
    messages: [
      {
        type: 'video',
        originalContentUrl: opts.signedVideoUrl,
        previewImageUrl: opts.signedVideoUrl.replace(/\.(mp4|webm)$/i, '-endcard.png'),
      },
      {
        type: 'text',
        text: [
          `คลิปแนะนำตัวโฮสต์ของคุณ${opts.firstNameTh}พร้อมแล้วค่ะ! 🎬`,
          `Your pre-launch host reel is ready (${opts.firstNameEn})!`,
          ``,
          `วิธีโพสต์ใน 1 แตะ (รับคะแนนบอร์ดครีเอเตอร์ตั้งแต่ช่วงลงทะเบียนล่วงหน้า):`,
          `• TikTok / IG Reels / Lemon8 (+1 คะแนนต่อแพลตฟอร์ม)`,
          `• ทุก 1,000 วิวที่ยืนยันด้วยภาพแคปหน้าจอ (+1 คะแนน)`,
          `• เพื่อนสมัครโฮสต์หรือนักท่องเที่ยวลงชื่อผ่านลิงก์ของคุณ (+5 คะแนน และจองครั้งแรกฟรีค่าธรรมเนียมกริ๊ง!)`,
          ``,
          `ลิงก์ประจำตัวของคุณ: ${refUrl}`,
          `แฮชแท็กที่ต้องใส่: #โฆษณา #ad #KringThailand`,
          `(ไฟล์วิดีโอนี้เก็บในระบบส่วนตัว 30 วัน)`,
        ].join('\n'),
      },
    ],
  };
}

export const FIXTURE_CREATOR_BOARD_ENTRIES: CreatorBoardEntry[] = [
  {
    hostId: 'nicha-ari',
    firstNameTh: 'ณิชา',
    firstNameEn: 'Nicha',
    neighbourhoodTh: 'อารีย์',
    neighbourhoodEn: 'Ari',
    preRegisteredAt: '2026-10-27T10:00:00Z',
    idCheckPassed: true,
    posts: [
      {
        platform: 'tiktok',
        postUrl: 'https://www.tiktok.com/@nicha.ari/video/7430001',
        publicViewCount: 6400,
        screenshotProofUrl: 'tickets/_xfer/reels/nicha-ari-views.png',
        verifiedByStaff: true,
      },
      {
        platform: 'instagram_reels',
        postUrl: 'https://www.instagram.com/reel/C9nicha01/',
        publicViewCount: 2800,
        screenshotProofUrl: 'tickets/_xfer/reels/nicha-ari-ig.png',
        verifiedByStaff: true,
      },
      {
        platform: 'lemon8',
        postUrl: 'https://s.lemon8-app.com/nicha-ari',
        publicViewCount: 1900,
        screenshotProofUrl: 'tickets/_xfer/reels/nicha-ari-lemon8.png',
        verifiedByStaff: true,
      },
    ],
    referralPreRegsAndBookings: 4,
    baseMeetupsCompleted: 6,
    sparkAdsAuth: {
      tiktokSparkCode: 'SPARK-TH-NICHA-88219',
      metaPartnershipPermissionGranted: true,
      submittedAt: '2026-10-27T12:00:00Z',
      boostApprovedByFounder: true,
    },
  },
  {
    hostId: 'fah-taladnoi',
    firstNameTh: 'ฟ้า',
    firstNameEn: 'Fah',
    neighbourhoodTh: 'ตลาดน้อย',
    neighbourhoodEn: 'Talad Noi',
    preRegisteredAt: '2026-10-27T10:30:00Z',
    idCheckPassed: true,
    posts: [
      {
        platform: 'tiktok',
        postUrl: 'https://www.tiktok.com/@fah.craft/video/7430002',
        publicViewCount: 4200,
        screenshotProofUrl: 'tickets/_xfer/reels/fah-taladnoi-views.png',
        verifiedByStaff: true,
      },
      {
        platform: 'lemon8',
        postUrl: 'https://s.lemon8-app.com/fah-taladnoi',
        publicViewCount: 3100,
        screenshotProofUrl: 'tickets/_xfer/reels/fah-taladnoi-lemon8.png',
        verifiedByStaff: true,
      },
    ],
    referralPreRegsAndBookings: 3,
    baseMeetupsCompleted: 4,
  },
  {
    hostId: 'mint-lumpini',
    firstNameTh: 'มิ้นท์',
    firstNameEn: 'Mint',
    neighbourhoodTh: 'สวนลุมพินี',
    neighbourhoodEn: 'Lumpini',
    preRegisteredAt: '2026-10-27T11:00:00Z',
    idCheckPassed: true,
    posts: [
      {
        platform: 'tiktok',
        postUrl: 'https://www.tiktok.com/@mint.run/video/7430003',
        publicViewCount: 3500,
        screenshotProofUrl: 'tickets/_xfer/reels/mint-lumpini-views.png',
        verifiedByStaff: true,
      },
    ],
    referralPreRegsAndBookings: 2,
    baseMeetupsCompleted: 3,
  },
];
