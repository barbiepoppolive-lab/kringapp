/**
 * Chon! (ชน) — Automated Affiliate, Partner & Payout Configuration Engine
 * Covers MOD1-17 (Affiliate Rebates), MOD1-18 (Gift & Voucher Marketplace),
 * MOD1-20 (Cheapest-in-Bangkok Net Price Engine), D-018 (Dodo MCC 4722 + Wise PromptPay), and R-002.
 */

export const COINS_PER_THB = 100 as const;

/**
 * Live Activated Production Affiliate & Partner Credentials for https://kringapp.com
 * - Travelpayouts: Marker ID 589675 (Token NTg5Njc1, Script https://emrldtp.com/NTg5Njc1.js?t=589675, partnerships@kringapp.com)
 * - Involve Asia: Affiliate ID 1105164 (User ID 1426038, Profile KringBangkok, Property Kring Bangkok Locals)
 * - Welcome Pickups: Property ID 45846 (Submission GUID 044091b9-521d-4dbc-99bb-3c6162af50b7)
 */
export const LIVE_TRAVELPAYOUTS_MARKER_ID = '589675' as const;
export const LIVE_INVOLVE_ASIA_AFF_ID = '1105164' as const;
export const LIVE_WELCOME_PICKUPS_PROPERTY_ID = '45846' as const;

export type AffiliateNetworkId =
  | 'TRAVELPAYOUTS'
  | 'INVOLVE_ASIA'
  | 'DIRECT_SELF_SERVE';

export type PartnerId =
  // Travelpayouts Instant Connect
  | 'GETTRANSFER'
  | 'KIWITAXI'
  | 'KLOOK'
  | 'AIRALO'
  | 'BOOKING_COM'
  | 'YESIM'
  | 'EKTA'
  // Involve Asia Individual
  | 'GOWABI'
  | 'HDMALL'
  | 'AGODA'
  | 'SHOPEE'
  | 'LAZADA'
  | 'SEVEN_ELEVEN_ALL_ONLINE'
  // Direct Self-Serve Partners
  | 'WELCOME_PICKUPS'
  | 'VIATOR_PARTNER'
  | 'FOREVER_FLORIST_TH'
  | 'GRABGIFTS_TH'
  | 'TRUEMONEY_ANGPAO_711'
  | 'TICKET2ATTRACTION'
  | 'NAMS_TAXI_FLEET'
  | 'MUVMI'
  | 'WISE_CPA';

export type NetworkPayoutMethod =
  | 'PAYPAL_ZERO_FEE'
  | 'LOCAL_BANK_TRANSFER_2_FREE_PER_MONTH'
  | 'DIRECT_BANK_OR_ZERO_FEE_WALLET';

export interface AffiliateNetworkConfig {
  networkId: AffiliateNetworkId;
  displayName: string;
  accountType: 'INDIVIDUAL';
  declaredCategory: 'Travel & Local Concierge / City Guide';
  lockedPayoutMethod: NetworkPayoutMethod;
  blockedPayoutMethods: string[];
  minPayoutDescription: string;
  payoutFeePct: 0;
  signupUrl: string;
}

export interface PartnerVerticalConfig {
  partnerId: PartnerId;
  displayName: string;
  networkId: AffiliateNetworkId;
  category:
    | 'AIRPORT_TRANSFER_RIDE'
    | 'ACTIVITIES_ESIM_HOTEL'
    | 'BEAUTY_SALON_CLINIC'
    | 'ECOMMERCE_CONVENIENCE'
    | 'GIFT_VOUCHER_FLOWERS';
  defaultCommissionPct: number;
  defaultHangoutVoucherThb: number;
  baseDestinationUrl: string;
  subIdParamName: string;
  markerParamName?: string;
  zeroMarkupGuarantee: boolean;
  notes: string;
}

export const AFFILIATE_NETWORKS: Record<AffiliateNetworkId, AffiliateNetworkConfig> = {
  TRAVELPAYOUTS: {
    networkId: 'TRAVELPAYOUTS',
    displayName: 'Travelpayouts (Instant Connect)',
    accountType: 'INDIVIDUAL',
    declaredCategory: 'Travel & Local Concierge / City Guide',
    lockedPayoutMethod: 'PAYPAL_ZERO_FEE',
    blockedPayoutMethods: [],
    minPayoutDescription: '$50 USD min, 0% fee via PayPal',
    payoutFeePct: 0,
    signupUrl: 'https://app.travelpayouts.com',
  },
  INVOLVE_ASIA: {
    networkId: 'INVOLVE_ASIA',
    displayName: 'Involve Asia (SEA Super-Aggregator)',
    accountType: 'INDIVIDUAL',
    declaredCategory: 'Travel & Local Concierge / City Guide',
    lockedPayoutMethod: 'LOCAL_BANK_TRANSFER_2_FREE_PER_MONTH',
    blockedPayoutMethods: ['PAYPAL_5_PCT_FEE_TRAP'],
    minPayoutDescription: '~฿310 THB (40 MYR) min, 0% fee (2 free local bank wires/month; PayPal 5% fee blocked)',
    payoutFeePct: 0,
    signupUrl: 'https://app.involve.asia',
  },
  DIRECT_SELF_SERVE: {
    networkId: 'DIRECT_SELF_SERVE',
    displayName: 'Direct Self-Serve Partners (Zero-Paperwork)',
    accountType: 'INDIVIDUAL',
    declaredCategory: 'Travel & Local Concierge / City Guide',
    lockedPayoutMethod: 'DIRECT_BANK_OR_ZERO_FEE_WALLET',
    blockedPayoutMethods: [],
    minPayoutDescription: '฿0 fee direct settlement / instant digital code issuance',
    payoutFeePct: 0,
    signupUrl: 'https://partnerresources.viator.com',
  },
};

export const PARTNER_VERTICALS: Record<PartnerId, PartnerVerticalConfig> = {
  // Travelpayouts
  GETTRANSFER: {
    partnerId: 'GETTRANSFER',
    displayName: 'GetTransfer VIP Airport & City Rides',
    networkId: 'TRAVELPAYOUTS',
    category: 'AIRPORT_TRANSFER_RIDE',
    defaultCommissionPct: 9,
    defaultHangoutVoucherThb: 200,
    baseDestinationUrl: 'https://gettransfer.com/en',
    subIdParamName: 'sub_id',
    markerParamName: 'marker',
    zeroMarkupGuarantee: true,
    notes: 'Instant Connect via Travelpayouts; VIP Arrival & Safe Ride Home.',
  },
  KIWITAXI: {
    partnerId: 'KIWITAXI',
    displayName: 'Kiwitaxi Fixed-Fare Airport Transfers',
    networkId: 'TRAVELPAYOUTS',
    category: 'AIRPORT_TRANSFER_RIDE',
    defaultCommissionPct: 10,
    defaultHangoutVoucherThb: 200,
    baseDestinationUrl: 'https://kiwitaxi.com',
    subIdParamName: 'sub_id',
    markerParamName: 'marker',
    zeroMarkupGuarantee: true,
    notes: 'Instant Connect via Travelpayouts; fixed BKK/DMK airport pricing.',
  },
  KLOOK: {
    partnerId: 'KLOOK',
    displayName: 'Klook Bangkok Dining, Rooftops & Attractions',
    networkId: 'TRAVELPAYOUTS',
    category: 'ACTIVITIES_ESIM_HOTEL',
    defaultCommissionPct: 5,
    defaultHangoutVoucherThb: 0,
    baseDestinationUrl: 'https://www.klook.com/en-US/city/4-bangkok-things-to-do/',
    subIdParamName: 'sub_id',
    markerParamName: 'marker',
    zeroMarkupGuarantee: true,
    notes: 'Plain affiliate link only (rebateAllowed: false per Travelpayouts coupon/incentive policy). Commission funds Kring Venue Deals.',
  },
  AIRALO: {
    partnerId: 'AIRALO',
    displayName: 'Airalo Thailand 5G eSIM',
    networkId: 'TRAVELPAYOUTS',
    category: 'ACTIVITIES_ESIM_HOTEL',
    defaultCommissionPct: 12,
    defaultHangoutVoucherThb: 100,
    baseDestinationUrl: 'https://www.airalo.com/thailand-esim',
    subIdParamName: 'sub_id',
    markerParamName: 'marker',
    zeroMarkupGuarantee: true,
    notes: 'Explicitly welcomes cashback/coupon partners (12% affiliate / 20-35% net white-label).',
  },
  BOOKING_COM: {
    partnerId: 'BOOKING_COM',
    displayName: 'Booking.com Bangkok Boutique & 5-Star Stays',
    networkId: 'TRAVELPAYOUTS',
    category: 'ACTIVITIES_ESIM_HOTEL',
    defaultCommissionPct: 4,
    defaultHangoutVoucherThb: 0,
    baseDestinationUrl: 'https://www.booking.com/city/th/bangkok.html',
    subIdParamName: 'sub_id',
    markerParamName: 'marker',
    zeroMarkupGuarantee: true,
    notes: 'Plain editorial link only (rebateAllowed: false per Travelpayouts Booking.com terms).',
  },
  YESIM: {
    partnerId: 'YESIM',
    displayName: 'Yesim Thailand 5G Tourist eSIM (High-Margin 15–20%)',
    networkId: 'TRAVELPAYOUTS',
    category: 'ACTIVITIES_ESIM_HOTEL',
    defaultCommissionPct: 18,
    defaultHangoutVoucherThb: 100,
    baseDestinationUrl: 'https://yesim.app/country/thailand/',
    subIdParamName: 'sub_id',
    markerParamName: 'marker',
    zeroMarkupGuarantee: true,
    notes: '15–20% Travelpayouts / direct commission on 8d & 15d Thailand 5G eSIM plans.',
  },
  EKTA: {
    partnerId: 'EKTA',
    displayName: 'EKTA Thailand Tourist Medical & Travel Insurance',
    networkId: 'TRAVELPAYOUTS',
    category: 'ACTIVITIES_ESIM_HOTEL',
    defaultCommissionPct: 22,
    defaultHangoutVoucherThb: 150,
    baseDestinationUrl: 'https://ektatraveling.com',
    subIdParamName: 'sub_id',
    markerParamName: 'marker',
    zeroMarkupGuarantee: true,
    notes: '20–25% Travelpayouts Instant Connect commission on tourist travel & medical cover.',
  },

  // Involve Asia
  GOWABI: {
    partnerId: 'GOWABI',
    displayName: 'GoWabi Bangkok Nails, Lashes, Hair & Day Spa',
    networkId: 'INVOLVE_ASIA',
    category: 'BEAUTY_SALON_CLINIC',
    defaultCommissionPct: 8,
    defaultHangoutVoucherThb: 0,
    baseDestinationUrl: 'https://www.gowabi.com/en',
    subIdParamName: 'sub_id',
    markerParamName: 'aff_id',
    zeroMarkupGuarantee: true,
    notes: 'rateVerified: false until read from Involve Asia #1105164 dashboard; wording stays strictly "spa" (never "massage").',
  },
  HDMALL: {
    partnerId: 'HDMALL',
    displayName: 'HDmall Health Check, Dental & Wellness Clinics (Health & Wellness Shelf)',
    networkId: 'INVOLVE_ASIA',
    category: 'BEAUTY_SALON_CLINIC',
    defaultCommissionPct: 10,
    defaultHangoutVoucherThb: 0,
    baseDestinationUrl: 'https://hdmall.co.th',
    subIdParamName: 'sub_id',
    markerParamName: 'aff_id',
    zeroMarkupGuarantee: true,
    notes: 'rateVerified: false until read from Involve Asia #1105164 dashboard; separate "Health & wellness" shelf, never in activities.',
  },
  AGODA: {
    partnerId: 'AGODA',
    displayName: 'Agoda Bangkok Hotels & Staycations',
    networkId: 'INVOLVE_ASIA',
    category: 'ACTIVITIES_ESIM_HOTEL',
    defaultCommissionPct: 5,
    defaultHangoutVoucherThb: 0,
    baseDestinationUrl: 'https://www.agoda.com/city/bangkok-th.html',
    subIdParamName: 'sub_id',
    markerParamName: 'aff_id',
    zeroMarkupGuarantee: true,
    notes: 'Plain editorial link only (rebateAllowed: false per Agoda Section 4.11 anti-e-money/cashback clause).',
  },
  SHOPEE: {
    partnerId: 'SHOPEE',
    displayName: 'Shopee Thailand Lifestyle & Fashion',
    networkId: 'INVOLVE_ASIA',
    category: 'ECOMMERCE_CONVENIENCE',
    defaultCommissionPct: 6,
    defaultHangoutVoucherThb: 100,
    baseDestinationUrl: 'https://shopee.co.th',
    subIdParamName: 'sub_id',
    markerParamName: 'aff_id',
    zeroMarkupGuarantee: true,
    notes: 'Involve Asia Shopee Thailand affiliate tracking.',
  },
  LAZADA: {
    partnerId: 'LAZADA',
    displayName: 'Lazada Thailand LazMall Brand Perks',
    networkId: 'INVOLVE_ASIA',
    category: 'ECOMMERCE_CONVENIENCE',
    defaultCommissionPct: 7,
    defaultHangoutVoucherThb: 100,
    baseDestinationUrl: 'https://www.lazada.co.th',
    subIdParamName: 'sub_id',
    markerParamName: 'aff_id',
    zeroMarkupGuarantee: true,
    notes: 'Involve Asia Lazada Thailand affiliate tracking.',
  },
  SEVEN_ELEVEN_ALL_ONLINE: {
    partnerId: 'SEVEN_ELEVEN_ALL_ONLINE',
    displayName: '7-Eleven ALL ONLINE Thailand',
    networkId: 'INVOLVE_ASIA',
    category: 'ECOMMERCE_CONVENIENCE',
    defaultCommissionPct: 4,
    defaultHangoutVoucherThb: 100,
    baseDestinationUrl: 'https://www.allonline.7eleven.co.th',
    subIdParamName: 'sub_id',
    markerParamName: 'aff_id',
    zeroMarkupGuarantee: true,
    notes: 'Involve Asia 7-Eleven ALL ONLINE convenience & daily care.',
  },

  // Direct Self-Serve Partners
  WELCOME_PICKUPS: {
    partnerId: 'WELCOME_PICKUPS',
    displayName: 'Welcome Pickups Bangkok & Pattaya English-Speaking Airport Transfers',
    networkId: 'DIRECT_SELF_SERVE',
    category: 'AIRPORT_TRANSFER_RIDE',
    defaultCommissionPct: 10,
    defaultHangoutVoucherThb: 200,
    baseDestinationUrl: 'https://www.welcomepickups.com/bangkok/',
    subIdParamName: 'sub_id',
    markerParamName: 'property_id',
    zeroMarkupGuarantee: true,
    notes: 'Direct Welcome Pickups Affiliate Property ID 45846 (GUID 044091b9-521d-4dbc-99bb-3c6162af50b7).',
  },
  VIATOR_PARTNER: {
    partnerId: 'VIATOR_PARTNER',
    displayName: 'Viator Bangkok Private Tours & Dinner Cruises',
    networkId: 'DIRECT_SELF_SERVE',
    category: 'ACTIVITIES_ESIM_HOTEL',
    defaultCommissionPct: 8,
    defaultHangoutVoucherThb: 200,
    baseDestinationUrl: 'https://www.viator.com/Bangkok/d343-ttd',
    subIdParamName: 'sub_id',
    markerParamName: 'pid',
    zeroMarkupGuarantee: true,
    notes: '8% direct commission via partnerresources.viator.com (weekly PayPal payout).',
  },
  FOREVER_FLORIST_TH: {
    partnerId: 'FOREVER_FLORIST_TH',
    displayName: 'Forever Florist Thailand (2h Bangkok Red Roses Delivery)',
    networkId: 'DIRECT_SELF_SERVE',
    category: 'GIFT_VOUCHER_FLOWERS',
    defaultCommissionPct: 15,
    defaultHangoutVoucherThb: 200,
    baseDestinationUrl: 'https://www.forever-florist-thailand.com',
    subIdParamName: 'sub_id',
    markerParamName: 'aff',
    zeroMarkupGuarantee: true,
    notes: '15–20% affiliate rebate + 2-hour express flower delivery across Bangkok.',
  },
  GRABGIFTS_TH: {
    partnerId: 'GRABGIFTS_TH',
    displayName: 'GrabGifts Thailand (Ride & Food Digital Vouchers)',
    networkId: 'DIRECT_SELF_SERVE',
    category: 'GIFT_VOUCHER_FLOWERS',
    defaultCommissionPct: 0,
    defaultHangoutVoucherThb: 100,
    baseDestinationUrl: 'https://gifts.grab.com/th',
    subIdParamName: 'sub_id',
    zeroMarkupGuarantee: true,
    notes: '฿0 markup self-serve digital Grab ride & food vouchers via gifts.grab.com.',
  },
  TRUEMONEY_ANGPAO_711: {
    partnerId: 'TRUEMONEY_ANGPAO_711',
    displayName: 'TrueMoney 7-Eleven Angpao / M-Coupon',
    networkId: 'DIRECT_SELF_SERVE',
    category: 'GIFT_VOUCHER_FLOWERS',
    defaultCommissionPct: 0,
    defaultHangoutVoucherThb: 100,
    baseDestinationUrl: 'https://gift.truemoney.com',
    subIdParamName: 'sub_id',
    zeroMarkupGuarantee: true,
    notes: '฿0 fee instant TrueMoney Angpao / 7-Eleven digital M-Coupon.',
  },
  TICKET2ATTRACTION: {
    partnerId: 'TICKET2ATTRACTION',
    displayName: 'Ticket2Attraction Thailand (Held Pending Rate Verification)',
    networkId: 'DIRECT_SELF_SERVE',
    category: 'ACTIVITIES_ESIM_HOTEL',
    defaultCommissionPct: 12,
    defaultHangoutVoucherThb: 0,
    baseDestinationUrl: 'https://www.ticket2attraction.com',
    subIdParamName: 'sub_id',
    markerParamName: 'ref',
    zeroMarkupGuarantee: true,
    notes: 'rateVerified: false — hidden until founder screenshots agent terms and one dated gate-vs-portal price pair.',
  },
  NAMS_TAXI_FLEET: {
    partnerId: 'NAMS_TAXI_FLEET',
    displayName: 'Nam’s Taxi Lady Drivers & Thai Private Fleet (Airport & Pattaya)',
    networkId: 'DIRECT_SELF_SERVE',
    category: 'AIRPORT_TRANSFER_RIDE',
    defaultCommissionPct: 16,
    defaultHangoutVoucherThb: 200,
    baseDestinationUrl: 'https://www.namstaxiladydrivers.com',
    subIdParamName: 'sub_id',
    markerParamName: 'ref',
    zeroMarkupGuarantee: true,
    notes: '15–20% direct Thai fleet referral commission on fixed-fare BKK Airport & Pattaya private cars.',
  },
  MUVMI: {
    partnerId: 'MUVMI',
    displayName: 'MuvMi Electric Tuk-Tuk On-Demand Hop Pass',
    networkId: 'DIRECT_SELF_SERVE',
    category: 'AIRPORT_TRANSFER_RIDE',
    defaultCommissionPct: 18,
    defaultHangoutVoucherThb: 100,
    baseDestinationUrl: 'https://muvmi.co',
    subIdParamName: 'sub_id',
    markerParamName: 'ref',
    zeroMarkupGuarantee: true,
    notes: '15–20% direct EV Tuk-Tuk tourist hop pass margin across Sukhumvit, Silom, Ari, and Rattanakosin.',
  },
  WISE_CPA: {
    partnerId: 'WISE_CPA',
    displayName: 'Wise Multi-Currency Card & Zero-Spread THB Transfer CPA',
    networkId: 'DIRECT_SELF_SERVE',
    category: 'GIFT_VOUCHER_FLOWERS',
    defaultCommissionPct: 25,
    defaultHangoutVoucherThb: 220,
    baseDestinationUrl: 'https://wise.com/invite',
    subIdParamName: 'sub_id',
    markerParamName: 'utm_campaign',
    zeroMarkupGuarantee: true,
    notes: '฿400–฿600 CPA referral bounty when a traveller activates a Wise card or fee-free THB transfer to dodge the ฿220 Thai ATM fee.',
  },
};

/**
 * Validates that Involve Asia never selects the 5% PayPal payout fee trap.
 */
export function assertZeroFeeNetworkPayout(
  networkId: AffiliateNetworkId,
  proposedPayoutMethod: string
): NetworkPayoutMethod {
  const network = AFFILIATE_NETWORKS[networkId];
  if (
    networkId === 'INVOLVE_ASIA' &&
    proposedPayoutMethod.toUpperCase().includes('PAYPAL')
  ) {
    throw new Error(
      'INVOLVE_ASIA_PAYPAL_FEE_TRAP_BLOCKED: Involve Asia charges a 5% fee on PayPal withdrawals. Use LOCAL_BANK_TRANSFER_2_FREE_PER_MONTH (0% fee, ~฿310 / MYR 40 min).'
    );
  }
  return network.lockedPayoutMethod;
}

export interface BuildTrackedAffiliateUrlParams {
  partnerId: PartnerId;
  destinationUrl?: string;
  userId: string;
  dealId: string;
  markerOrAffId?: string;
}

export interface TrackedAffiliateUrlResult {
  partnerId: PartnerId;
  networkId: AffiliateNetworkId;
  subId: string;
  trackedUrl: string;
  coinsPerThb: typeof COINS_PER_THB;
}

/**
 * Builds a deterministic tracked deep link with `sub_id = chon_${userId}_${dealId}`
 * and enforces the locked `100 coins = ฿1 THB` (`coins_per_thb = 100`) exchange rate.
 */
export function buildTrackedAffiliateUrl(
  params: BuildTrackedAffiliateUrlParams
): TrackedAffiliateUrlResult {
  const partner = PARTNER_VERTICALS[params.partnerId];
  if (!partner) {
    throw new Error(`Unknown partnerId: ${String(params.partnerId)}`);
  }

  const cleanUserId = params.userId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanDealId = params.dealId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanUserId || !cleanDealId) {
    throw new Error('userId and dealId are required to build a tracked sub_id');
  }

  const subId = `chon_${cleanUserId}_${cleanDealId}`;
  const rawUrl = params.destinationUrl?.trim() || partner.baseDestinationUrl;
  const url = new URL(rawUrl);

  url.searchParams.set(partner.subIdParamName, subId);
  const resolvedMarkerOrAffId =
    params.markerOrAffId?.trim() ||
    (partner.networkId === 'TRAVELPAYOUTS'
      ? LIVE_TRAVELPAYOUTS_MARKER_ID
      : partner.networkId === 'INVOLVE_ASIA'
        ? LIVE_INVOLVE_ASIA_AFF_ID
        : partner.partnerId === 'WELCOME_PICKUPS'
          ? LIVE_WELCOME_PICKUPS_PROPERTY_ID
          : undefined);
  if (resolvedMarkerOrAffId && partner.markerParamName) {
    url.searchParams.set(partner.markerParamName, resolvedMarkerOrAffId);
  }
  url.searchParams.set('utm_source', 'chon_bkk');
  url.searchParams.set('coins_per_thb', String(COINS_PER_THB));

  return {
    partnerId: partner.partnerId,
    networkId: partner.networkId,
    subId,
    trackedUrl: url.toString(),
    coinsPerThb: COINS_PER_THB,
  };
}

export interface CheapestNetPriceInput {
  officialPriceThb: number;
  partnerDiscountedPriceThb: number;
  affiliateCommissionPct: number;
  hangoutVoucherThb: number;
}

export interface CheapestNetPriceBreakdown {
  officialPriceThb: number;
  partnerDiscountedPriceThb: number;
  totalAffiliateCommissionThb: number;
  userCoinRebateThb: number;
  userCoinRebateCoins: number;
  chonPlatformProfitThb: number;
  hangoutVoucherThb: number;
  effectiveNetPriceThb: number;
  totalSavingsVsOfficialThb: number;
  isCheaperThanOfficial: boolean;
  coinsPerThb: typeof COINS_PER_THB;
}

/**
 * MOD1-20 Cheapest-in-Bangkok Net Price Calculator:
 * Splits affiliate commission 50/50 (50% instant 🪙 Coin Rebate at 100 🪙 = ฿1 + 50% Chon! cash profit)
 * and stacks a 🥂 Tonight's Hangout Fee Voucher (฿100–฿250) so effectiveNetPriceThb < officialPriceThb.
 */
export function calculateCheapestNetPriceBreakdown(
  input: CheapestNetPriceInput
): CheapestNetPriceBreakdown {
  const {
    officialPriceThb,
    partnerDiscountedPriceThb,
    affiliateCommissionPct,
    hangoutVoucherThb,
  } = input;

  if (officialPriceThb <= 0 || partnerDiscountedPriceThb <= 0) {
    throw new Error('Prices must be positive THB amounts');
  }
  if (partnerDiscountedPriceThb > officialPriceThb) {
    throw new Error('partnerDiscountedPriceThb cannot exceed officialPriceThb');
  }
  if (affiliateCommissionPct < 0 || affiliateCommissionPct > 50) {
    throw new Error('affiliateCommissionPct must be between 0 and 50');
  }
  if (hangoutVoucherThb < 100 || hangoutVoucherThb > 250) {
    throw new Error(
      'hangoutVoucherThb must be between ฿100 and ฿250 per Tonight\'s Hangout Fee Voucher rules'
    );
  }

  const totalAffiliateCommissionThb = Number(
    ((partnerDiscountedPriceThb * affiliateCommissionPct) / 100).toFixed(2)
  );
  const userCoinRebateThb = Number((totalAffiliateCommissionThb * 0.5).toFixed(2));
  const chonPlatformProfitThb = Number(
    (totalAffiliateCommissionThb - userCoinRebateThb).toFixed(2)
  );
  const userCoinRebateCoins = Math.round(userCoinRebateThb * COINS_PER_THB);

  const effectiveNetPriceThb = Math.max(
    0,
    Number(
      (
        partnerDiscountedPriceThb -
        userCoinRebateThb -
        hangoutVoucherThb
      ).toFixed(2)
    )
  );

  const totalSavingsVsOfficialThb = Number(
    (officialPriceThb - effectiveNetPriceThb).toFixed(2)
  );
  const isCheaperThanOfficial = effectiveNetPriceThb < officialPriceThb;

  if (!isCheaperThanOfficial) {
    throw new Error('Effective net price must be strictly cheaper than official price');
  }

  return {
    officialPriceThb,
    partnerDiscountedPriceThb,
    totalAffiliateCommissionThb,
    userCoinRebateThb,
    userCoinRebateCoins,
    chonPlatformProfitThb,
    hangoutVoucherThb,
    effectiveNetPriceThb,
    totalSavingsVsOfficialThb,
    isCheaperThanOfficial,
    coinsPerThb: COINS_PER_THB,
  };
}

export interface DodoOutingPassCheckoutInput {
  userId: string;
  packThb: number;
  addHolidayVipPass490?: boolean;
}

export interface DodoOutingPassCheckoutPayload {
  merchantOfRecord: 'DODO_PAYMENTS';
  mccCode: '4722';
  productTitle: 'Chon! — Curated Bangkok Social & Culinary Outing Pass';
  productCategory: 'travel_and_local_concierge';
  currency: 'THB';
  basePackThb: number;
  holidayVipPassThb: number;
  totalChargeThb: number;
  baseCoinsCredited: number;
  coinsPerThb: typeof COINS_PER_THB;
  metadata: {
    user_id: string;
    mcc: '4722';
    holiday_vip_72h_pass: boolean;
    coins_per_thb: typeof COINS_PER_THB;
  };
}

const FORBIDDEN_CHECKOUT_WORDS = [
  'auction',
  'bid',
  'escort',
  'dating',
  'girl',
  'pimp',
  'bet',
  'gamble',
];

/**
 * D-018 Dodo Payments Merchant of Record Checkout Builder:
 * Strictly framed under MCC 4722 ("Chon! — Curated Bangkok Social & Culinary Outing Pass")
 * with zero dating or auction vocabulary.
 */
export function buildDodoOutingPassCheckoutPayload(
  input: DodoOutingPassCheckoutInput
): DodoOutingPassCheckoutPayload {
  if (!input.userId || !input.userId.trim()) {
    throw new Error('userId is required for Dodo checkout payload');
  }
  if (input.packThb < 100) {
    throw new Error('Minimum Outing Pass pack is ฿100 THB');
  }

  const productTitle =
    'Chon! — Curated Bangkok Social & Culinary Outing Pass' as const;
  const lowerTitle = productTitle.toLowerCase();
  for (const forbidden of FORBIDDEN_CHECKOUT_WORDS) {
    if (lowerTitle.includes(forbidden)) {
      throw new Error(`Red Line violation: forbidden word "${forbidden}" in checkout`);
    }
  }

  const holidayVipPassThb = input.addHolidayVipPass490 ? 490 : 0;
  const totalChargeThb = input.packThb + holidayVipPassThb;
  const baseCoinsCredited = Math.round(input.packThb * COINS_PER_THB);

  return {
    merchantOfRecord: 'DODO_PAYMENTS',
    mccCode: '4722',
    productTitle,
    productCategory: 'travel_and_local_concierge',
    currency: 'THB',
    basePackThb: input.packThb,
    holidayVipPassThb,
    totalChargeThb,
    baseCoinsCredited,
    coinsPerThb: COINS_PER_THB,
    metadata: {
      user_id: input.userId.trim(),
      mcc: '4722',
      holiday_vip_72h_pass: Boolean(input.addHolidayVipPass490),
      coins_per_thb: COINS_PER_THB,
    },
  };
}

export interface WisePromptPayTransferInput {
  hostName: string;
  promptPayPhone: string;
  amountThb: number;
  referenceId: string;
}

export interface WisePromptPayTransferPayload {
  endpoint: 'POST /v1/transfers';
  targetCurrency: 'THB';
  amountThb: number;
  customerTransactionId: string;
  recipient: {
    accountHolderName: string;
    currency: 'THB';
    type: 'promptpay';
    details: {
      promptpayType: 'PHONE';
      phoneNumber: string;
    };
  };
  transferDetails: {
    reference: string;
    transferPurpose: 'verification.transfers.purpose.pay.for.goods.or.services';
  };
  estimatedSettlementSeconds: 5;
}

/**
 * D-018 / R-002 Automated 5-Second Thai Host Payout Builder:
 * Builds the Wise REST API (`POST /v1/transfers`, `type: "promptpay"`, `promptpayType: "PHONE"`)
 * payload for instant 24/7 Baht payouts to a Thai mobile number (`08x` / `09x` / `06x` normalized to `+66` or `0x`).
 */
export function buildWisePromptPayTransferPayload(
  input: WisePromptPayTransferInput
): WisePromptPayTransferPayload {
  const cleanName = input.hostName.trim();
  if (!cleanName) {
    throw new Error('hostName is required for Wise PromptPay payout');
  }
  if (input.amountThb <= 0) {
    throw new Error('amountThb must be greater than 0');
  }
  const cleanRef = input.referenceId.trim();
  if (!cleanRef) {
    throw new Error('referenceId (idempotency key) is required');
  }

  const digitsOnly = input.promptPayPhone.replace(/[\s-]/g, '');
  const thaiPhoneRegex = /^(?:0[689]\d{8}|\+66[689]\d{8})$/;
  if (!thaiPhoneRegex.test(digitsOnly)) {
    throw new Error(
      `Invalid Thai PromptPay mobile number "${input.promptPayPhone}". Must be a 10-digit Thai mobile starting with 06, 08, or 09 (or +666/+668/+669).`
    );
  }

  const normalizedLocalPhone = digitsOnly.startsWith('+66')
    ? `0${digitsOnly.slice(3)}`
    : digitsOnly;

  return {
    endpoint: 'POST /v1/transfers',
    targetCurrency: 'THB',
    amountThb: Number(input.amountThb.toFixed(2)),
    customerTransactionId: cleanRef,
    recipient: {
      accountHolderName: cleanName,
      currency: 'THB',
      type: 'promptpay',
      details: {
        promptpayType: 'PHONE',
        phoneNumber: normalizedLocalPhone,
      },
    },
    transferDetails: {
      reference: `Chon! Host Payout ${cleanRef}`.slice(0, 35),
      transferPurpose:
        'verification.transfers.purpose.pay.for.goods.or.services',
    },
    estimatedSettlementSeconds: 5,
  };
}

/**
 * ============================================================================
 * LOCAL THAI PAYMENT GATEWAY INTEGRATION ENGINE & REGISTRY (Fable Decision #1)
 * ============================================================================
 * Covers Bank of Thailand (BOT) licensed local Thai PSPs for:
 * 1. Inbound Guest Top-Ups (PromptPay QR, TrueMoney Wallet, K PLUS/SCB Easy, Cards, Alipay/WeChat Pay)
 * 2. Outbound Licensed B2C Host Payouts (Automated PromptPay Disbursement API)
 */

export type LocalThaiPspId =
  | 'OMISE_OPN_TH'
  | 'TWO_C_TWO_P_TH'
  | 'GB_PRIME_PAY_TH'
  | 'CHILLPAY_TH'
  | 'PAYSOLUTIONS_TH';

export type ThaiPaymentMethodCode =
  | 'PROMPTPAY_QR'
  | 'TRUEMONEY_WALLET'
  | 'THAI_MOBILE_BANKING_APP'
  | 'CREDIT_DEBIT_CARD_3DS'
  | 'ALIPAY_WECHAT_TOURIST';

export interface LocalThaiPspSpec {
  pspId: LocalThaiPspId;
  displayName: string;
  botLicensed: true;
  acceptsThaiIndividualWithEcomCert: boolean;
  acceptsThaiCompanyLtd: boolean;
  acceptsForeignEntityDirect: boolean;
  supportsAutomatedPromptPayPayoutApi: boolean;
  promptPayFeePct: number;
  cardFeePct: number;
  trueMoneyFeePct: number;
  payoutFeeThbPerTransfer: number;
  approvalTimelineDays: string;
  pros: string[];
  cons: string[];
  requiredDocuments: string[];
  docsUrl: string;
}

export const LOCAL_THAI_PAYMENT_FIRMS: Record<LocalThaiPspId, LocalThaiPspSpec> = {
  OMISE_OPN_TH: {
    pspId: 'OMISE_OPN_TH',
    displayName: 'Opn Payments (formerly Omise Thailand)',
    botLicensed: true,
    acceptsThaiIndividualWithEcomCert: false,
    acceptsThaiCompanyLtd: true,
    acceptsForeignEntityDirect: false,
    supportsAutomatedPromptPayPayoutApi: true,
    promptPayFeePct: 1.65,
    cardFeePct: 3.65,
    trueMoneyFeePct: 2.35,
    payoutFeeThbPerTransfer: 15,
    approvalTimelineDays: '3–7 business days (Instant Free Sandbox)',
    pros: [
      'Cleanest developer REST API & webhooks in Thailand (Stripe-like DX)',
      'Supports instant PromptPay QR (1.65%), TrueMoney, K PLUS/SCB Easy, Apple Pay, Google Pay, and 3DS2 Cards',
      'Built-in Mass PromptPay Payout / Transfer API (`POST /transfers`) for paying Thai Hosts legally from corporate balance',
      'Instant self-serve Test Mode sandbox with zero documents required to build & test',
    ],
    cons: [
      'Requires a registered Thai Company Limited (DBD) or Japan/Singapore entity to activate Live Keys',
      'Strict underwriting against adult/escort or unlicensed gambling — must present Loyalty Cashback Mode (Mode A) & public venue concierges',
    ],
    requiredDocuments: [
      'DBD Company Affidavit (หนังสือรับรองบริษัท) issued within 6 months',
      'Shareholder List (บอจ.5 / BOJ.5) showing >=25% ultimate beneficial owners',
      'Vat Certificate (ภพ.20 / PP.20) if VAT-registered, or Company Tax ID card',
      'Director Passport (foreigner) or Thai National ID card (signed certified true copy)',
      'Corporate Thai Bank Book / Statement (KBANK, SCB, BBL, or Krungsri) matching company name',
      'Live website/PWA URL showing Terms of Service, Refund Policy, PDPA Privacy Policy, and Clear THB Pricing',
    ],
    docsUrl: 'https://docs.opn.ooo',
  },
  TWO_C_TWO_P_TH: {
    pspId: 'TWO_C_TWO_P_TH',
    displayName: '2C2P Thailand (Enterprise & Tourist Super-Gateway)',
    botLicensed: true,
    acceptsThaiIndividualWithEcomCert: false,
    acceptsThaiCompanyLtd: true,
    acceptsForeignEntityDirect: true,
    supportsAutomatedPromptPayPayoutApi: true,
    promptPayFeePct: 1.5,
    cardFeePct: 3.25,
    trueMoneyFeePct: 2.2,
    payoutFeeThbPerTransfer: 12,
    approvalTimelineDays: '7–15 business days',
    pros: [
      'Lowest enterprise PromptPay (1.50%) & Card fees + Dynamic Currency Conversion (DCC) for foreign tourists',
      'Native support for Alipay+, WeChat Pay, GrabPay, TrueMoney, and 1-2-3 Cash (7-Eleven counter pay)',
      'Can onboard Singapore / Hong Kong regional holding entities alongside Thai Co., Ltd.',
      'Full B2C PromptPay Payout / EasyBills API for instant Host withdrawals',
    ],
    cons: [
      'Heavier enterprise onboarding paperwork and longer compliance review (7–15 days)',
      'May require a security deposit or monthly minimum volume for custom payout APIs',
    ],
    requiredDocuments: [
      'DBD Company Affidavit (หนังสือรับรองบริษัท < 6 months) + Memorandum of Association (บอจ.2)',
      'Shareholder List (บอจ.5)',
      'Director Passport / Thai National ID + House Registration (ทะเบียนบ้าน for Thai director)',
      'Corporate Bank Passbook first page + 3–6 months bank statements',
      'Office photos (exterior building sign + interior workspace) or BOI/Virtual Office lease agreement',
    ],
    docsUrl: 'https://developer.2c2p.com',
  },
  GB_PRIME_PAY_TH: {
    pspId: 'GB_PRIME_PAY_TH',
    displayName: 'GB Prime Pay (Globalintech Thailand — SME & Individual Friendly)',
    botLicensed: true,
    acceptsThaiIndividualWithEcomCert: true,
    acceptsThaiCompanyLtd: true,
    acceptsForeignEntityDirect: false,
    supportsAutomatedPromptPayPayoutApi: true,
    promptPayFeePct: 1.5,
    cardFeePct: 3.65,
    trueMoneyFeePct: 2.5,
    payoutFeeThbPerTransfer: 15,
    approvalTimelineDays: '3–5 business days',
    pros: [
      'Accepts both Thai Companies AND Thai Individual / Sole Proprietors (บุคคลธรรมดา) with a DBD e-Commerce Certificate',
      'Real-time PromptPay QR webhook confirmation in < 2 seconds',
      'Supports PromptPay QR, TrueMoney Wallet, ShopeePay, WeChat Pay, Alipay, and 3DS Credit Cards',
    ],
    cons: [
      'Individual account option requires a Thai citizen partner/co-founder (Thai National ID + DBD ทะเบียนพาณิชย์อิเล็กทรอนิกส์)',
      'API documentation is less polished than Opn/Omise, though webhook integration is straightforward',
    ],
    requiredDocuments: [
      'For Individual Route: Thai National ID + House Registration (ทะเบียนบ้าน) + DBD e-Commerce Registration (ใบทะเบียนพาณิชย์อิเล็กทรอนิกส์) + Thai Savings Bank Book',
      'For Corporate Route: DBD Affidavit (< 6 months) + BOJ.5 + Director ID/Passport + Corporate Bank Book',
      'Live PWA/Website showing clear product/service catalog in THB and contact details',
    ],
    docsUrl: 'https://doc.gbprimepay.com',
  },
  CHILLPAY_TH: {
    pspId: 'CHILLPAY_TH',
    displayName: 'ChillPay Thailand (PraIn FinTech — BOT Licensed)',
    botLicensed: true,
    acceptsThaiIndividualWithEcomCert: true,
    acceptsThaiCompanyLtd: true,
    acceptsForeignEntityDirect: false,
    supportsAutomatedPromptPayPayoutApi: true,
    promptPayFeePct: 1.5,
    cardFeePct: 3.5,
    trueMoneyFeePct: 2.3,
    payoutFeeThbPerTransfer: 15,
    approvalTimelineDays: '3–5 business days',
    pros: [
      'Supports direct mobile banking app switches (K PLUS, SCB Easy, Krungthai NEXT, Bualuang mBanking, KMA)',
      'Accepts both Ordinary Persons (บุคคลธรรมดา) and Juristic Persons (นิติบุคคล)',
      'Strong Chinese/Asian tourist wallet support (Alipay, WeChat Pay, UnionPay)',
    ],
    cons: [
      'Small one-time entrance/setup fee on certain SME packages (often waived during promos)',
      'Ordinary person route requires a Thai bank account and e-Commerce registration',
    ],
    requiredDocuments: [
      'Ordinary Person: Thai ID + House Registration + Thai Bank Book + e-Commerce Registration / Store URL',
      'Juristic Person: DBD Affidavit (< 6 months) + PP.20 + Director ID/Passport + Corporate Bank Book',
    ],
    docsUrl: 'https://www.chillpay.co',
  },
  PAYSOLUTIONS_TH: {
    pspId: 'PAYSOLUTIONS_TH',
    displayName: 'PaySolutions Thailand (THAIEPAY — Fastest SME Onboarding)',
    botLicensed: true,
    acceptsThaiIndividualWithEcomCert: true,
    acceptsThaiCompanyLtd: true,
    acceptsForeignEntityDirect: false,
    supportsAutomatedPromptPayPayoutApi: false,
    promptPayFeePct: 1.75,
    cardFeePct: 3.75,
    trueMoneyFeePct: 2.8,
    payoutFeeThbPerTransfer: 20,
    approvalTimelineDays: '1–3 business days',
    pros: [
      'Fastest approval in Thailand (1–3 days) for Individuals/Freelancers and SMEs',
      'Supports PromptPay QR, International Cards, Alipay, WeChat Pay, and TrueMoney',
    ],
    cons: [
      'Slightly higher transaction fees (3.75% cards) and basic annual maintenance fee on some tiers',
      'Does not offer a full automated real-time B2C PromptPay disbursement API like Opn or 2C2P',
    ],
    requiredDocuments: [
      'Individual/Freelancer: ID Card / Passport + Thai Bank Passbook + Live Website/App URL',
      'Corporate: DBD Affidavit + Director ID/Passport + Corporate Bank Passbook',
    ],
    docsUrl: 'https://www.paysolutions.asia',
  },
};

export interface LocalThaiPspChargeInput {
  pspId: LocalThaiPspId;
  userId: string;
  packThb: number;
  paymentMethod: ThaiPaymentMethodCode;
  honestMccCategory?: '5815_DIGITAL_SOCIAL_MEDIA' | '7299_SOCIAL_CONCIERGE_SERVICES';
}

export interface LocalThaiPspChargePayload {
  pspId: LocalThaiPspId;
  botLicensed: true;
  paymentMethod: ThaiPaymentMethodCode;
  honestMccCategory: '5815_DIGITAL_SOCIAL_MEDIA' | '7299_SOCIAL_CONCIERGE_SERVICES';
  currency: 'THB';
  amountSatang: number;
  amountThb: number;
  creditedBaseCoins: number;
  settlementReserveClass: 'NON_CARD_INSTANT_TH' | 'CARD_INTERNATIONAL_OR_MOR';
  usdtRailEnabledInThailand: false;
  webhookMetadata: {
    user_id: string;
    psp_id: LocalThaiPspId;
    payment_method: ThaiPaymentMethodCode;
    coins_per_thb: typeof COINS_PER_THB;
    card_reserve_policy: 'ZERO_HOLD_PROMPTPAY' | 'HOLD_14_TO_30D_PLUS_10PCT_90D';
  };
}

/**
 * Fable Decision #1 Compliant Local Thai Payment Gateway Charge Builder:
 * - Uses honest MCC categorization (`5815_DIGITAL_SOCIAL_MEDIA` or `7299_SOCIAL_CONCIERGE_SERVICES`).
 * - Marks `PROMPTPAY_QR`, `TRUEMONEY_WALLET`, `THAI_MOBILE_BANKING_APP`, and `ALIPAY_WECHAT_TOURIST`
 *   as `NON_CARD_INSTANT_TH` (0-day chargeback reserve -> Host can cash out in 60 seconds).
 * - Marks `CREDIT_DEBIT_CARD_3DS` as `CARD_INTERNATIONAL_OR_MOR` (14–30 day reserve + 10% 90-day rolling reserve).
 * - Hard-locks `usdtRailEnabledInThailand: false` per BOT/SEC April 2022 rule.
 */
export function buildLocalThaiPspChargePayload(
  input: LocalThaiPspChargeInput
): LocalThaiPspChargePayload {
  const spec = LOCAL_THAI_PAYMENT_FIRMS[input.pspId];
  if (!spec) {
    throw new Error(`Unsupported Local Thai PSP: ${String(input.pspId)}`);
  }
  if (!input.userId || !input.userId.trim()) {
    throw new Error('userId is required for Local Thai PSP charge');
  }
  if (input.packThb < 100) {
    throw new Error('Minimum top-up pack is ฿100 THB');
  }

  const isCard = input.paymentMethod === 'CREDIT_DEBIT_CARD_3DS';
  const settlementReserveClass = isCard
    ? 'CARD_INTERNATIONAL_OR_MOR'
    : 'NON_CARD_INSTANT_TH';

  const honestMccCategory =
    input.honestMccCategory ?? '5815_DIGITAL_SOCIAL_MEDIA';

  return {
    pspId: spec.pspId,
    botLicensed: true,
    paymentMethod: input.paymentMethod,
    honestMccCategory,
    currency: 'THB',
    amountSatang: Math.round(input.packThb * 100),
    amountThb: input.packThb,
    creditedBaseCoins: Math.round(input.packThb * COINS_PER_THB),
    settlementReserveClass,
    usdtRailEnabledInThailand: false,
    webhookMetadata: {
      user_id: input.userId.trim(),
      psp_id: spec.pspId,
      payment_method: input.paymentMethod,
      coins_per_thb: COINS_PER_THB,
      card_reserve_policy: isCard
        ? 'HOLD_14_TO_30D_PLUS_10PCT_90D'
        : 'ZERO_HOLD_PROMPTPAY',
    },
  };
}

/**
 * ============================================================================
 * DAY-1 INDIAN SOLE PROP (UDYAM-BR-34-0067891) SANDBOX & LIVE PAYMENT / VOUCHER
 * REGISTRY & S2S PAYLOAD BUILDERS (Dodo + Tazapay + Reloadly + Zendit)
 * ============================================================================
 *IMPORTANT: Never embed secret keys in client bundles; all secret keys are read
 * strictly from server environment variables (`process.env.*` / `Deno.env.get(...)`)
 * inside Supabase Edge Functions (`/functions/v1/payment-webhook` & `/functions/v1/payout-dispatch`).
 * Only public/non-secret workspace identifiers and env-var key names are exported here.
 */

export const KRING_PRODUCTION_SERVER_IP = '206.84.230.119' as const;
export const KRING_UDYAM_REGISTRATION_NO = 'UDYAM-BR-34-0067891' as const;

export interface Day1ProviderEndpointConfig {
  providerId:
    | 'DODO_PAYMENTS'
    | 'TAZAPAY_TH'
    | 'RELOADLY_VOUCHERS'
    | 'ZENDIT_IDT_TH'
    | 'BROLEXY_UAB_TH'
    | 'CHIMONEY_GLOBAL';
  displayName: string;
  registeredAccountEmail: string;
  workspaceOrPublicId: string;
  sandboxBaseUrl: string;
  productionBaseUrl: string;
  serverEnvVarNames: {
    apiKeyEnv: string;
    apiSecretEnv?: string;
    webhookSecretEnv?: string;
  };
  ipWhitelisted: typeof KRING_PRODUCTION_SERVER_IP;
  supportedCapabilities: string[];
}

export const DAY1_PAYMENT_AND_VOUCHER_PROVIDERS: Record<
  Day1ProviderEndpointConfig['providerId'],
  Day1ProviderEndpointConfig
> = {
  DODO_PAYMENTS: {
    providerId: 'DODO_PAYMENTS',
    displayName: 'Dodo Payments (Merchant of Record — Global Cards, Apple/Google Pay & PromptPay QR Beta)',
    registeredAccountEmail: 'ops@kringapp.com',
    workspaceOrPublicId: 'KRING (app.dodopayments.com)',
    sandboxBaseUrl: 'https://test.dodopayments.com',
    productionBaseUrl: 'https://live.dodopayments.com',
    serverEnvVarNames: {
      apiKeyEnv: 'DODO_PAYMENTS_API_KEY',
      webhookSecretEnv: 'DODO_PAYMENTS_WEBHOOK_SECRET',
    },
    ipWhitelisted: KRING_PRODUCTION_SERVER_IP,
    supportedCapabilities: [
      'Global Tourist Visa/Mastercard/Amex Checkout (Min ฿500)',
      'Apple Pay & Google Pay 1-Tap Checkout (฿999 Arrival Starter Pack)',
      'Thailand PromptPay QR Beta Checkout',
      'Weekly T+7 Indian Sole Prop Settlement with Automatic e-FIRA (Purpose Code P0802)',
    ],
  },
  TAZAPAY_TH: {
    providerId: 'TAZAPAY_TH',
    displayName: 'Tazapay Bangkok (Native THB PromptPay QR Pay-In & Local THB PromptPay Host Payouts)',
    registeredAccountEmail: 'ops@kringapp.com',
    workspaceOrPublicId: 'pk_test_ioVZXXJhYzBnL2xkPlaH',
    sandboxBaseUrl: 'https://service-sandbox.tazapay.com/v3',
    productionBaseUrl: 'https://service.tazapay.com/v3',
    serverEnvVarNames: {
      apiKeyEnv: 'TAZAPAY_API_KEY',
      apiSecretEnv: 'TAZAPAY_API_SECRET',
      webhookSecretEnv: 'TAZAPAY_WEBHOOK_SECRET',
    },
    ipWhitelisted: KRING_PRODUCTION_SERVER_IP,
    supportedCapabilities: [
      'Dynamic Thailand PromptPay QR Pay-In (Min ฿100 — 0-Day Chargeback Reserve)',
      'Multi-Currency THB Collection Balance (Zero Double FX Conversion)',
      'Automated Daily Local THB PromptPay & Thai Bank Host Payouts (≥฿300)',
    ],
  },
  RELOADLY_VOUCHERS: {
    providerId: 'RELOADLY_VOUCHERS',
    displayName: 'Reloadly ($0-Deposit Pay-As-You-Go Thailand Gift Cards, Gaming Pins & eSIM Data API)',
    registeredAccountEmail: 'partnerships@kringapp.com',
    workspaceOrPublicId: 'Cl0gXDg9hwOf0rhsBaAtPI78gK9zembl',
    sandboxBaseUrl: 'https://giftcards-sandbox.reloadly.com',
    productionBaseUrl: 'https://giftcards.reloadly.com',
    serverEnvVarNames: {
      apiKeyEnv: 'RELOADLY_CLIENT_ID',
      apiSecretEnv: 'RELOADLY_CLIENT_SECRET',
      webhookSecretEnv: 'RELOADLY_WEBHOOK_SECRET',
    },
    ipWhitelisted: KRING_PRODUCTION_SERVER_IP,
    supportedCapabilities: [
      'Instant Thailand Digital Gift Cards & Brand Vouchers ($0 Minimum Deposit)',
      'Rule 9 Tier-2 Instant ฿0-Fee Voucher Cashouts (฿100–฿299)',
      'Thailand AIS/DTAC/True Data Bundles & Mobile Top-Ups',
    ],
  },
  ZENDIT_IDT_TH: {
    providerId: 'ZENDIT_IDT_TH',
    displayName: 'Zendit by IDT Corp (NYSE: IDT — S2S THB 100–5,000 Wholesale Brand Vouchers & eSIM API)',
    registeredAccountEmail: 'ops@kringapp.com',
    workspaceOrPublicId: '6adb4905df218aef76908ebe',
    sandboxBaseUrl: 'https://api.zendit.io/v1',
    productionBaseUrl: 'https://api.zendit.io/v1',
    serverEnvVarNames: {
      apiKeyEnv: 'ZENDIT_API_KEY',
      webhookSecretEnv: 'ZENDIT_SHIELDWALL_WEBHOOK_SECRET',
    },
    ipWhitelisted: KRING_PRODUCTION_SERVER_IP,
    supportedCapabilities: [
      'S2S Wholesale THB Digital Gift Cards & e-Vouchers (฿100 to ฿5,000)',
      'Positive B2B Wholesale Discount Margin on Grab, Shopee, Lazada, Lotus’s, Big C, Starbucks, TrueMoney',
      'USD Wire or USDT/USDC Stablecoin Float Funding (IP 206.84.230.119 Whitelisted in Sandbox & Production)',
    ],
  },
  BROLEXY_UAB_TH: {
    providerId: 'BROLEXY_UAB_TH',
    displayName: 'Brolexy UAB (Direct Wholesale Thailand Gift Card & Brand Voucher API — Grab, ShopeePay, Lazada, Starbucks, Lotus’s)',
    registeredAccountEmail: 'ops@kringapp.com',
    workspaceOrPublicId: '4f972cee6a5dc903df44801e5a05fb4d800cf561c9402b120566b2f691938647',
    sandboxBaseUrl: 'https://dev.brolexy.com/api',
    productionBaseUrl: 'https://app.brolexy.com/api',
    serverEnvVarNames: {
      apiKeyEnv: 'BROLEXY_API_PUBLIC_KEY',
      apiSecretEnv: 'BROLEXY_API_SECRET_KEY',
      webhookSecretEnv: 'BROLEXY_TOTP_SEED',
    },
    ipWhitelisted: KRING_PRODUCTION_SERVER_IP,
    supportedCapabilities: [
      'Sandbox API & Dashboard Active (User: kringapp.api.user, Public Key: 4f972cee...)',
      'Wholesale Thailand Digital Vouchers (+3% to +10% B2B Rebate on Grab, ShopeePay, Starbucks, Lotus’s, Big C)',
      'Rule 9 Tier-2 Instant ฿0-Fee Voucher Cashout Rail (฿100–฿299)',
    ],
  },
  CHIMONEY_GLOBAL: {
    providerId: 'CHIMONEY_GLOBAL',
    displayName: 'Chimoney (Verified Organisation KRING — Global Multi-Rail Payouts, Gift Cards & Airtime API)',
    registeredAccountEmail: 'partnerships@kringapp.com',
    workspaceOrPublicId: 'KRING (dash.chimoney.io)',
    sandboxBaseUrl: 'https://api-v2-sandbox.chimoney.io/v0.2',
    productionBaseUrl: 'https://api.chimoney.io/v0.2',
    serverEnvVarNames: {
      apiKeyEnv: 'CHIMONEY_API_KEY',
      webhookSecretEnv: 'CHIMONEY_WEBHOOK_SECRET',
    },
    ipWhitelisted: KRING_PRODUCTION_SERVER_IP,
    supportedCapabilities: [
      'Verified Business Organisation KRING on dash.chimoney.io',
      'Instant Global Gift Card, Airtime & Multi-Currency Payout Links',
    ],
  },
};

export interface TazapayPromptPayCheckoutInput {
  userId: string;
  customerName: string;
  customerEmail: string;
  amountThb: number;
  referenceId: string;
  description?: string;
}

export interface TazapayPromptPayCheckoutPayload {
  endpoint: '/v3/checkout';
  method: 'POST';
  invoice_currency: 'THB';
  amount: number;
  customer_details: {
    name: string;
    email: string;
    country: 'TH';
  };
  payment_methods: ['promptpay_th'];
  transaction_description: string;
  reference_id: string;
  metadata: {
    user_id: string;
    coins_credited: number;
    coins_per_thb: typeof COINS_PER_THB;
    reserve_policy: 'ZERO_HOLD_PROMPTPAY';
  };
}

/**
 * Builds a Tazapay v3 Checkout Session payload locked to Thailand PromptPay QR (`promptpay_th`)
 * with 0-day chargeback reserve and honest Kring · Bangkok Locals cultural experience framing.
 */
export function buildTazapayPromptPayCheckoutPayload(
  input: TazapayPromptPayCheckoutInput
): TazapayPromptPayCheckoutPayload {
  if (!input.userId || !input.userId.trim()) {
    throw new Error('userId is required for Tazapay PromptPay checkout');
  }
  if (!Number.isFinite(input.amountThb) || input.amountThb < 100) {
    throw new Error('Minimum Tazapay PromptPay QR top-up is ฿100 THB');
  }
  const cleanDescription =
    input.description?.trim() ||
    'Kring · Bangkok Locals — Cultural Experience & Group Outing Pass';
  const lowerDesc = cleanDescription.toLowerCase();
  for (const forbidden of FORBIDDEN_CHECKOUT_WORDS) {
    if (lowerDesc.includes(forbidden)) {
      throw new Error(`Red Line violation: forbidden word "${forbidden}" in checkout`);
    }
  }

  const roundedThb = Math.round(input.amountThb * 100) / 100;

  return {
    endpoint: '/v3/checkout',
    method: 'POST',
    invoice_currency: 'THB',
    amount: roundedThb,
    customer_details: {
      name: input.customerName.trim() || 'Kring Member',
      email: input.customerEmail.trim() || 'member@kringapp.com',
      country: 'TH',
    },
    payment_methods: ['promptpay_th'],
    transaction_description: cleanDescription,
    reference_id: input.referenceId.trim(),
    metadata: {
      user_id: input.userId.trim(),
      coins_credited: Math.round(roundedThb * COINS_PER_THB),
      coins_per_thb: COINS_PER_THB,
      reserve_policy: 'ZERO_HOLD_PROMPTPAY',
    },
  };
}

export type ZenditThailandBrandSku =
  | 'GRAB_TH'
  | 'GRABGIFTS_TH'
  | 'GRABFOOD_TH'
  | 'GRABMART_TH'
  | 'GRABEXPRESS_TH'
  | 'SHOPEE_TH'
  | 'LAZADA_TH'
  | 'LOTUSS_TH'
  | 'BIGC_TH'
  | 'STARBUCKS_TH'
  | 'RAZERGOLD_TH'
  | 'DECATHLON_TH'
  | 'AUNTIEANNE_TH'
  | 'COLDSTONECREAMERY_TH'
  | 'TRUEMONEY_TH'
  | 'AIS_ESIM_TH'
  | 'DTAC_TOPUP_TH'
  | 'DTAC_DATA_BUNDLE_TH'
  | 'TRUEMOVE_TOPUP_TH'
  | 'TRUEMOVE_DATA_BUNDLE_TH';

export interface ZenditVoucherPurchaseInput {
  transactionId: string;
  userId: string;
  brandSku: ZenditThailandBrandSku;
  denominationThb: number;
  wholesaleDiscountPct?: number;
  recipientEmail?: string;
  recipientPhoneTh?: string;
}

export interface ZenditVoucherPurchasePayload {
  workspaceId: typeof DAY1_PAYMENT_AND_VOUCHER_PROVIDERS.ZENDIT_IDT_TH.workspaceOrPublicId;
  whitelistedServerIp: typeof KRING_PRODUCTION_SERVER_IP;
  endpoint: '/v1/vouchers/transactions';
  method: 'POST';
  body: {
    transactionId: string;
    offerId: string;
    value: {
      type: 'PRICE';
      currency: 'THB';
      amount: number;
    };
    fields: Array<{ key: string; value: string }>;
  };
  accounting: {
    faceValueThb: number;
    coinsDeducted: number;
    hostCashoutFeeThb: 0;
    wholesaleDiscountPct: number;
    platformWholesaleSpreadThb: number;
  };
}

/**
 * Builds an S2S Zendit (`/v1/vouchers/transactions`) THB digital voucher purchase request
 * for ฿100–฿5,000 instant brand voucher cashouts (`CashOutSheet.tsx` Rule 9 Tier 2) or `ราคากริ๊ง` perks.
 * Enforces ฿0 fee to the Thai Local while capturing the B2B wholesale discount spread for Kring.
 */
export function buildZenditThbVoucherPurchasePayload(
  input: ZenditVoucherPurchaseInput
): ZenditVoucherPurchasePayload {
  if (!input.transactionId || !input.transactionId.trim()) {
    throw new Error('transactionId (idempotency key) is required for Zendit S2S purchase');
  }
  if (!input.userId || !input.userId.trim()) {
    throw new Error('userId is required for Zendit voucher purchase');
  }
  if (
    !Number.isFinite(input.denominationThb) ||
    input.denominationThb < 100 ||
    input.denominationThb > 5000
  ) {
    throw new Error(
      'Zendit THB voucher denomination must be between ฿100 and ฿5,000 THB'
    );
  }

  const discountPct = input.wholesaleDiscountPct ?? 4.5;
  if (discountPct < 0 || discountPct > 30) {
    throw new Error('Wholesale discount percentage must be between 0% and 30%');
  }

  const faceValueThb = Math.round(input.denominationThb);
  const offerId = `${input.brandSku}_${faceValueThb}_THB`;
  const spreadThb = Math.round(faceValueThb * (discountPct / 100) * 100) / 100;

  const fields: Array<{ key: string; value: string }> = [
    {
      key: 'recipientEmail',
      value: input.recipientEmail?.trim() || 'ops@kringapp.com',
    },
  ];
  if (input.recipientPhoneTh?.trim()) {
    fields.push({
      key: 'recipientPhone',
      value: input.recipientPhoneTh.trim(),
    });
  }

  return {
    workspaceId: DAY1_PAYMENT_AND_VOUCHER_PROVIDERS.ZENDIT_IDT_TH.workspaceOrPublicId,
    whitelistedServerIp: KRING_PRODUCTION_SERVER_IP,
    endpoint: '/v1/vouchers/transactions',
    method: 'POST',
    body: {
      transactionId: input.transactionId.trim(),
      offerId,
      value: {
        type: 'PRICE',
        currency: 'THB',
        amount: faceValueThb,
      },
      fields,
    },
    accounting: {
      faceValueThb,
      coinsDeducted: faceValueThb * COINS_PER_THB,
      hostCashoutFeeThb: 0,
      wholesaleDiscountPct: discountPct,
      platformWholesaleSpreadThb: spreadThb,
    },
  };
}

export interface BrolexyOrderInput {
  accountId?: number;
  productId: number;
  quantity: number;
  referenceId: string;
  unixTimeSec: number;
}

export interface BrolexyOrderPayload {
  endpoint: '/order';
  method: 'POST';
  headers: {
    publicKey: typeof DAY1_PAYMENT_AND_VOUCHER_PROVIDERS.BROLEXY_UAB_TH.workspaceOrPublicId;
    time: string;
    messageToSign: string;
    signatureSpec: 'base64(hex(HmacSHA256(secretKey, messageToSign)))';
  };
  body: {
    accountID: number;
    productID: number;
    quantity: number;
    referenceID: string;
  };
}

/**
 * Builds a Brolexy S2S Gift Card Order request (`POST /order` on `https://dev.brolexy.com/api` or `https://app.brolexy.com/api`).
 * Per `https://dev.brolexy.com/docs/` (verified live against order `api_6adb7332a1d40419635864`),
 * the message to sign for `/order` is `${time}${productID}${quantity}` (concatenated without dots),
 * and the signature is `base64(hex(HmacSHA256(secretKey, message)))`.
 */
export function buildBrolexyOrderRequestPayload(
  input: BrolexyOrderInput
): BrolexyOrderPayload {
  if (!Number.isInteger(input.productId) || input.productId <= 0) {
    throw new Error('Brolexy productId must be a positive integer');
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0 || input.quantity > 50) {
    throw new Error('Brolexy quantity must be an integer between 1 and 50');
  }
  const cleanRef = (input.referenceId || '').trim();
  if (!/^[A-Za-z0-9]{1,64}$/.test(cleanRef)) {
    throw new Error(
      'Brolexy referenceID must be 1–64 alphanumeric characters (A-Z, a-z, 0-9)'
    );
  }
  const timeStr = String(Math.floor(input.unixTimeSec));
  const messageToSign = `${timeStr}${input.productId}${input.quantity}`;

  return {
    endpoint: '/order',
    method: 'POST',
    headers: {
      publicKey: DAY1_PAYMENT_AND_VOUCHER_PROVIDERS.BROLEXY_UAB_TH.workspaceOrPublicId,
      time: timeStr,
      messageToSign,
      signatureSpec: 'base64(hex(HmacSHA256(secretKey, messageToSign)))',
    },
    body: {
      accountID: input.accountId ?? 1,
      productID: input.productId,
      quantity: input.quantity,
      referenceID: cleanRef,
    },
  };
}

/**
 * ============================================================================
 * DESIGN B — LICENSED THAI SELLER-OF-RECORD PARTNER MODEL & FAILOVER ROUTER
 * (`tickets/partners/PARTNER_MODEL.md` & `tickets/partners/PARTNER_SHORTLIST.md`)
 * ============================================================================
 * - Partner (Thai licensed company, DoT type 11/ general or 14/ inbound): sells the
 *   experience to the traveller as Principal, collects payment into its own PSP
 *   merchant account (MoF Clause 2.3(1) "own business" exemption), engages the
 *   Thai Host as its subcontractor, and pays the Host automatically upon a valid
 *   two-phone `กริ๊ง! Bump`.
 * - Kring: provides the app, listings, marketing, and signed Bump confirmation,
 *   and invoices the Partner for a technology & marketing fee. Kring never holds
 *   traveller or host funds.
 */

export type DesignBSellerPartnerId =
  | 'EXPIQUE_BKK'
  | 'PATTAYA_CITY_TOUR_PTY'
  | 'BANGKOK_VANGUARDS_BKK'
  | 'GOOD_TRIPS_PTY'
  | 'BANGKOK_FOOD_TOURS_BKK';

export type DotLicencePrefixType = '11_GENERAL' | '14_INBOUND' | '12_DOMESTIC_ONLY' | '13_SPECIFIC_AREA_ONLY';

export interface DesignBSellerPartnerConfig {
  partnerId: DesignBSellerPartnerId;
  legalOrBrandName: string;
  cityScope: Array<'BANGKOK' | 'PATTAYA'>;
  publishedLicenceNo: string;
  licenceType: '11_GENERAL' | '14_INBOUND';
  contactEmailOrLine: string;
  contactPhone: string;
  defaultDailyBookingCap: number;
  defaultDailyFloatCapThb: number;
  kringNeverHoldsFundsGuarantee: true;
}

export const DESIGN_B_PRIORITY_THAI_SELLERS: Record<
  DesignBSellerPartnerId,
  DesignBSellerPartnerConfig
> = {
  EXPIQUE_BKK: {
    partnerId: 'EXPIQUE_BKK',
    legalOrBrandName: 'Expique Co., Ltd.',
    cityScope: ['BANGKOK'],
    publishedLicenceNo: '14/01576',
    licenceType: '14_INBOUND',
    contactEmailOrLine: 'hello@expique.com',
    contactPhone: '+66 85 873 3308',
    defaultDailyBookingCap: 50,
    defaultDailyFloatCapThb: 100_000,
    kringNeverHoldsFundsGuarantee: true,
  },
  PATTAYA_CITY_TOUR_PTY: {
    partnerId: 'PATTAYA_CITY_TOUR_PTY',
    legalOrBrandName: 'Pattaya City Tour Co., Ltd.',
    cityScope: ['PATTAYA'],
    publishedLicenceNo: '14/03236',
    licenceType: '14_INBOUND',
    contactEmailOrLine: 'booking@pattayacitytourcoltd.com',
    contactPhone: '+66 62 743 0007',
    defaultDailyBookingCap: 50,
    defaultDailyFloatCapThb: 100_000,
    kringNeverHoldsFundsGuarantee: true,
  },
  BANGKOK_VANGUARDS_BKK: {
    partnerId: 'BANGKOK_VANGUARDS_BKK',
    legalOrBrandName: 'bangkokvanguards, Ltd.',
    cityScope: ['BANGKOK'],
    publishedLicenceNo: '14/02515',
    licenceType: '14_INBOUND',
    contactEmailOrLine: 'hello@bangkokvanguards.com',
    contactPhone: '+66 85 833 9218',
    defaultDailyBookingCap: 40,
    defaultDailyFloatCapThb: 80_000,
    kringNeverHoldsFundsGuarantee: true,
  },
  GOOD_TRIPS_PTY: {
    partnerId: 'GOOD_TRIPS_PTY',
    legalOrBrandName: 'Good Trips (Thailand) Co., Ltd.',
    cityScope: ['PATTAYA'],
    publishedLicenceNo: '14/02648',
    licenceType: '14_INBOUND',
    contactEmailOrLine: 'thailandtouragency@gmail.com / LINE @583gchza',
    contactPhone: '+66 82 546 5941',
    defaultDailyBookingCap: 40,
    defaultDailyFloatCapThb: 80_000,
    kringNeverHoldsFundsGuarantee: true,
  },
  BANGKOK_FOOD_TOURS_BKK: {
    partnerId: 'BANGKOK_FOOD_TOURS_BKK',
    legalOrBrandName: 'Bangkok Food Tours',
    cityScope: ['BANGKOK'],
    publishedLicenceNo: '11/08848',
    licenceType: '11_GENERAL',
    contactEmailOrLine: 'info@bangkokfoodtours.com',
    contactPhone: '+66 95 943 9222',
    defaultDailyBookingCap: 60,
    defaultDailyFloatCapThb: 120_000,
    kringNeverHoldsFundsGuarantee: true,
  },
};

export interface DesignBPartnerRuntimeHealth {
  partnerId: DesignBSellerPartnerId;
  licenceType: DotLicencePrefixType;
  daysSinceRegistryCheck: number;
  insuranceActive: boolean;
  hostRecipientVerifiedInPsp: boolean;
  pausedByPartner: boolean;
  pspErrorsLast5Min: number;
  failedTransfersLast1Hour: number;
  currentDailyBookings: number;
  dailyBookingCap: number;
  currentDailyFloatThb: number;
  dailyFloatCapThb: number;
}

export interface DesignBRoutingDecision {
  selectedPartnerId: DesignBSellerPartnerId;
  usedBackupFailover: boolean;
  checkoutSellerDisclosureEn: string;
  checkoutSellerDisclosureTh: string;
  kringHoldsFunds: false;
}

/**
 * Evaluates whether a Seller-of-Record partner is healthy and eligible for a new booking
 * per `tickets/partners/PARTNER_MODEL.md` Section 2 (Rules 1, 3, and 5):
 * - Licence must be `11_GENERAL` or `14_INBOUND` (never `12_` or `13_`), checked within 90 days.
 * - Insurance active & host verified as a PSP recipient.
 * - Not paused, `< 3` PSP errors in 5m, `< 2` failed transfers in 1h.
 * - Below `90%` of daily booking cap and daily float cap.
 */
export function isDesignBPartnerHealthyAndEligible(
  health: DesignBPartnerRuntimeHealth,
  bookingPriceThb: number
): boolean {
  if (
    health.licenceType !== '11_GENERAL' &&
    health.licenceType !== '14_INBOUND'
  ) {
    return false;
  }
  if (health.daysSinceRegistryCheck > 90 || health.daysSinceRegistryCheck < 0) {
    return false;
  }
  if (!health.insuranceActive || !health.hostRecipientVerifiedInPsp) {
    return false;
  }
  if (health.pausedByPartner) {
    return false;
  }
  if (health.pspErrorsLast5Min >= 3 || health.failedTransfersLast1Hour >= 2) {
    return false;
  }
  if (health.currentDailyBookings >= health.dailyBookingCap * 0.9) {
    return false;
  }
  if (health.currentDailyFloatThb + bookingPriceThb > health.dailyFloatCapThb * 0.9) {
    return false;
  }
  return true;
}

/**
 * Selects the Primary or Backup licensed Thai Seller-of-Record partner at checkout time
 * (`tickets/partners/PARTNER_MODEL.md` Section 2, Rules 2–5).
 */
export function selectDesignBSellerPartnerForBooking(params: {
  city: 'BANGKOK' | 'PATTAYA';
  bookingPriceThb: number;
  primaryHealth: DesignBPartnerRuntimeHealth;
  backupHealth: DesignBPartnerRuntimeHealth;
}): DesignBRoutingDecision {
  const primarySpec = DESIGN_B_PRIORITY_THAI_SELLERS[params.primaryHealth.partnerId];
  const backupSpec = DESIGN_B_PRIORITY_THAI_SELLERS[params.backupHealth.partnerId];

  const primaryOk =
    primarySpec.cityScope.includes(params.city) &&
    isDesignBPartnerHealthyAndEligible(params.primaryHealth, params.bookingPriceThb);

  if (primaryOk) {
    return {
      selectedPartnerId: primarySpec.partnerId,
      usedBackupFailover: false,
      checkoutSellerDisclosureEn: `Sold by ${primarySpec.legalOrBrandName}, TAT/DoT lic. ${primarySpec.publishedLicenceNo}`,
      checkoutSellerDisclosureTh: `จัดจำหน่ายโดย ${primarySpec.legalOrBrandName} ใบอนุญาตนำเที่ยวเลขที่ ${primarySpec.publishedLicenceNo}`,
      kringHoldsFunds: false,
    };
  }

  const backupOk =
    backupSpec.cityScope.includes(params.city) &&
    isDesignBPartnerHealthyAndEligible(params.backupHealth, params.bookingPriceThb);

  if (backupOk) {
    return {
      selectedPartnerId: backupSpec.partnerId,
      usedBackupFailover: true,
      checkoutSellerDisclosureEn: `Sold by ${backupSpec.legalOrBrandName}, TAT/DoT lic. ${backupSpec.publishedLicenceNo}`,
      checkoutSellerDisclosureTh: `จัดจำหน่ายโดย ${backupSpec.legalOrBrandName} ใบอนุญาตนำเที่ยวเลขที่ ${backupSpec.publishedLicenceNo}`,
      kringHoldsFunds: false,
    };
  }

  throw new Error(
    `No healthy eligible Design B Seller-of-Record partner available in ${params.city}`
  );
}

/**
 * Enforces `PARTNER_MODEL.md` Section 2 Rule 6:
 * "Existing bookings are never moved silently. A booking already paid to Partner A
 * stays Partner A's sale, because A is the principal. Never move funds from A's account to B's."
 */
export function assertDesignBPaidBookingImmutableSeller(params: {
  bookingId: string;
  paidToPartnerId: DesignBSellerPartnerId;
  requestedPayoutPartnerId: DesignBSellerPartnerId;
}): true {
  if (params.paidToPartnerId !== params.requestedPayoutPartnerId) {
    throw new Error(
      `Design B Rule 6 violation on booking ${params.bookingId}: paid booking belongs to principal ${params.paidToPartnerId} and cannot be silently moved to ${params.requestedPayoutPartnerId}`
    );
  }
  return true;
}

export interface DesignBBumpPayoutInstruction {
  bookingId: string;
  principalPartnerId: DesignBSellerPartnerId;
  hostRecipientId: string;
  bumpTokenSignedByBothDevices: string;
  retailPriceThb: number;
  hostGrossShareThb: number;
  withholdingTax3PctThb: number;
  hostNetTransferThb: number;
  partnerMarginThb: number;
  kringMonthlyInvoiceFeeThb: number;
  kringTouchesFunds: false;
}

/**
 * Builds the Step 8 Payout Instruction (`PARTNER_MODEL.md` §3 & §7) sent by Kring's backend
 * to the Partner's scoped PSP rules engine after a valid two-phone `กริ๊ง! Bump`.
 * Kring never touches the traveller's or host's funds; the Partner's PSP transfers
 * the subcontractor payout directly to the Host and deducts 3% WHT (`50 Tawi`).
 */
export function buildDesignBBumpPayoutInstruction(input: {
  bookingId: string;
  principalPartnerId: DesignBSellerPartnerId;
  hostRecipientId: string;
  bumpTokenSignedByBothDevices: string;
  retailPriceThb: number;
  partnerMarginPct?: number;
  kringInvoiceFeePct?: number;
  applyThaiWht3Pct?: boolean;
}): DesignBBumpPayoutInstruction {
  if (!input.bumpTokenSignedByBothDevices || !input.bumpTokenSignedByBothDevices.trim()) {
    throw new Error('Signed two-device bump token is required to trigger Partner payout');
  }
  if (!Number.isFinite(input.retailPriceThb) || input.retailPriceThb < 300) {
    throw new Error('Retail booking price must be at least ฿300 THB');
  }

  const retail = Math.round(input.retailPriceThb * 100) / 100;
  const partnerPct = input.partnerMarginPct ?? 5;
  const kringPct = input.kringInvoiceFeePct ?? 15;
  const hostPct = 100 - partnerPct - kringPct;
  if (hostPct <= 0 || partnerPct < 0 || kringPct < 0) {
    throw new Error('Invalid Design B commercial split percentages');
  }

  const hostGrossShareThb = Math.round(retail * (hostPct / 100) * 100) / 100;
  const applyWht = input.applyThaiWht3Pct ?? true;
  const withholdingTax3PctThb = applyWht
    ? Math.round(hostGrossShareThb * 0.03 * 100) / 100
    : 0;
  const hostNetTransferThb =
    Math.round((hostGrossShareThb - withholdingTax3PctThb) * 100) / 100;
  const partnerMarginThb = Math.round(retail * (partnerPct / 100) * 100) / 100;
  const kringMonthlyInvoiceFeeThb = Math.round(retail * (kringPct / 100) * 100) / 100;

  return {
    bookingId: input.bookingId.trim(),
    principalPartnerId: input.principalPartnerId,
    hostRecipientId: input.hostRecipientId.trim(),
    bumpTokenSignedByBothDevices: input.bumpTokenSignedByBothDevices.trim(),
    retailPriceThb: retail,
    hostGrossShareThb,
    withholdingTax3PctThb,
    hostNetTransferThb,
    partnerMarginThb,
    kringMonthlyInvoiceFeeThb,
    kringTouchesFunds: false,
  };
}

/**
 * ============================================================================
 * KRING V3.0 / V4.0 ZERO-MoR 5 CROSS-BORDER PAYMENT RAILS + SKYDO SETTLEMENT
 * & LICENSED TOUR/VENUE PARTNER 20% BOOKING FEE ENGINE
 * ============================================================================
 */

export type KringV3CrossBorderRailId =
  | 'TAZAPAY_ESCROW_PRIMARY'
  | 'TRANSFI_FIAT_BACKUP_1'
  | 'TWO_C_TWO_P_ANTOM_BACKUP_2'
  | 'RAPYD_APAC_BACKUP_3A'
  | 'NIUM_INDIA_SG_BACKUP_3B'
  | 'DODO_PASS_COINS_LIVE'
  | 'BROLEXY_VOUCHERS_LIVE'
  | 'SKYDO_LUT_P0802_SETTLEMENT';

export interface KringV3CrossBorderRailSpec {
  railId: KringV3CrossBorderRailId;
  displayName: string;
  roleInV3: string;
  supportedMethods: string[];
  webhookEndpointPath: string;
  kybReadinessStatus: 'LIVE_APPROVED' | 'WEBHOOK_READY_KYB_SUBMITTED' | 'SANDBOX_ACTIVE_EVALUATION';
  zeroMorCompliant: true;
  zeroCryptoInThailand: true;
}

export const KRING_V3_FIVE_CROSS_BORDER_RAILS: Record<
  KringV3CrossBorderRailId,
  KringV3CrossBorderRailSpec
> = {
  TAZAPAY_ESCROW_PRIMARY: {
    railId: 'TAZAPAY_ESCROW_PRIMARY',
    displayName: 'Tazapay (Primary Cross-Border Marketplace Escrow)',
    roleInV3: 'Primary Cross-Border Escrow (85% local host volume) holding funds until <=100m GPS bump, paying 80%–85% THB to host and settling 20% + ฿25 to Kring.',
    supportedMethods: ['🇮🇳 UPI', '💬 WeChat Pay', '🇷🇺 TrueMoney', '🇹🇭 PromptPay', '💳 Card'],
    webhookEndpointPath: '/api/webhooks/tazapay',
    kybReadinessStatus: 'WEBHOOK_READY_KYB_SUBMITTED',
    zeroMorCompliant: true,
    zeroCryptoInThailand: true,
  },
  TRANSFI_FIAT_BACKUP_1: {
    railId: 'TRANSFI_FIAT_BACKUP_1',
    displayName: 'TransFi Fiat (Backup #1 — Pure Fiat-to-Fiat)',
    roleInV3: 'Fiat-to-Fiat Collections (UPI, PromptPay, Alipay+/WeChat, Cards) + <60s local THB PromptPay API (zero visible crypto).',
    supportedMethods: ['🇮🇳 UPI', '💬 WeChat Pay', '🇹🇭 PromptPay', '💳 Card'],
    webhookEndpointPath: '/api/webhooks/transfi',
    kybReadinessStatus: 'SANDBOX_ACTIVE_EVALUATION',
    zeroMorCompliant: true,
    zeroCryptoInThailand: true,
  },
  TWO_C_TWO_P_ANTOM_BACKUP_2: {
    railId: 'TWO_C_TWO_P_ANTOM_BACKUP_2',
    displayName: '2C2P by Antom (Backup #2 — BOT-Licensed Acquiring & easy2send)',
    roleInV3: 'BOT-Licensed Cross-Border Rail + Alipay+/WeChat Pay + TrueMoney + easy2send Mass THB Bank & e-Wallet Payouts.',
    supportedMethods: ['💬 WeChat Pay', '🇷🇺 TrueMoney', '🇹🇭 PromptPay', '💳 Card'],
    webhookEndpointPath: '/api/webhooks/2c2p-antom',
    kybReadinessStatus: 'SANDBOX_ACTIVE_EVALUATION',
    zeroMorCompliant: true,
    zeroCryptoInThailand: true,
  },
  RAPYD_APAC_BACKUP_3A: {
    railId: 'RAPYD_APAC_BACKUP_3A',
    displayName: 'Rapyd APAC (Backup #3A — Cross-Border Marketplace Split)',
    roleInV3: 'Cross-Border Marketplace Collection (PromptPay, TrueMoney, Cards) + Real-Time THB Disbursements.',
    supportedMethods: ['🇷🇺 TrueMoney', '🇹🇭 PromptPay', '💳 Card'],
    webhookEndpointPath: '/api/webhooks/rapyd',
    kybReadinessStatus: 'SANDBOX_ACTIVE_EVALUATION',
    zeroMorCompliant: true,
    zeroCryptoInThailand: true,
  },
  NIUM_INDIA_SG_BACKUP_3B: {
    railId: 'NIUM_INDIA_SG_BACKUP_3B',
    displayName: 'Nium India/SG (Backup #3B — Weekly Creator Reward THB Payouts)',
    roleInV3: 'Real-Time THB PromptPay/Bahtnet Disbursements (<1% FX spread) for Kring weekly gift creator rewards.',
    supportedMethods: ['🇹🇭 PromptPay', 'THB Bank Transfer'],
    webhookEndpointPath: '/api/webhooks/nium',
    kybReadinessStatus: 'SANDBOX_ACTIVE_EVALUATION',
    zeroMorCompliant: true,
    zeroCryptoInThailand: true,
  },
  DODO_PASS_COINS_LIVE: {
    railId: 'DODO_PASS_COINS_LIVE',
    displayName: 'Dodo Payments (Live — 20% Kring Passes & Digital Stickers)',
    roleInV3: 'Approved Merchant of Record for 20% + ฿25 Kring Reservation Passes, Starter Packs, and closed-loop Kring Stickers.',
    supportedMethods: ['🇮🇳 UPI', '💳 Card', 'Apple Pay', 'Google Pay', '🇹🇭 PromptPay'],
    webhookEndpointPath: '/api/webhooks/dodo',
    kybReadinessStatus: 'LIVE_APPROVED',
    zeroMorCompliant: true,
    zeroCryptoInThailand: true,
  },
  BROLEXY_VOUCHERS_LIVE: {
    railId: 'BROLEXY_VOUCHERS_LIVE',
    displayName: 'Brolexy UAB (Live — 100% Full-Value Brand Vouchers)',
    roleInV3: 'Instant 100% face-value Grab, Starbucks, Central, Lotus’s, Watsons vouchers to Host (Kring earns +6%–12% B2B rebate).',
    supportedMethods: ['S2S Wholesale API (/order)'],
    webhookEndpointPath: '/api/webhooks/brolexy',
    kybReadinessStatus: 'LIVE_APPROVED',
    zeroMorCompliant: true,
    zeroCryptoInThailand: true,
  },
  SKYDO_LUT_P0802_SETTLEMENT: {
    railId: 'SKYDO_LUT_P0802_SETTLEMENT',
    displayName: 'Skydo (B2B Cross-Border Settlement to India under LUT P0802)',
    roleInV3: 'Settles Kring’s 20% + ฿25 platform fee to India with automatic e-FIRA under Purpose Code P0802 (0% GST under LUT).',
    supportedMethods: ['USD / SGD / EUR / GBP B2B Settlement -> INR'],
    webhookEndpointPath: '/api/webhooks/skydo',
    kybReadinessStatus: 'LIVE_APPROVED',
    zeroMorCompliant: true,
    zeroCryptoInThailand: true,
  },
};

export type KringV3LicensedTourPartnerId =
  | 'KIJSIRAVEJ_14_03556'
  | 'CO_VAN_KESSEL_11_10279'
  | 'PIMDEE_11_12394'
  | 'SILOM_THAI_COOKING';

export interface KringV3LicensedTourPartnerSpec {
  partnerId: KringV3LicensedTourPartnerId;
  displayName: string;
  tatLicenseNo: string;
  inAppBookingFeePct: 20;
  venueDirectPayPct: 80;
  disclosureEn: 'Pay 20% booking fee now to Kring · rest at the venue';
}

export const KRING_V3_LICENSED_TOUR_PARTNERS: Record<
  KringV3LicensedTourPartnerId,
  KringV3LicensedTourPartnerSpec
> = {
  KIJSIRAVEJ_14_03556: {
    partnerId: 'KIJSIRAVEJ_14_03556',
    displayName: 'KIJSIRAVEJ Co., Ltd. (Food Adventure · 14/03556)',
    tatLicenseNo: '14/03556',
    inAppBookingFeePct: 20,
    venueDirectPayPct: 80,
    disclosureEn: 'Pay 20% booking fee now to Kring · rest at the venue',
  },
  CO_VAN_KESSEL_11_10279: {
    partnerId: 'CO_VAN_KESSEL_11_10279',
    displayName: 'Co van Kessel Bangkok Tours (11/10279)',
    tatLicenseNo: '11/10279',
    inAppBookingFeePct: 20,
    venueDirectPayPct: 80,
    disclosureEn: 'Pay 20% booking fee now to Kring · rest at the venue',
  },
  PIMDEE_11_12394: {
    partnerId: 'PIMDEE_11_12394',
    displayName: 'Pimdee Group Co., Ltd. (11/12394)',
    tatLicenseNo: '11/12394',
    inAppBookingFeePct: 20,
    venueDirectPayPct: 80,
    disclosureEn: 'Pay 20% booking fee now to Kring · rest at the venue',
  },
  SILOM_THAI_COOKING: {
    partnerId: 'SILOM_THAI_COOKING',
    displayName: 'Silom Thai Cooking School (Licensed Culinary Partner)',
    tatLicenseNo: 'VERIFIED_CULINARY_VENUE',
    inAppBookingFeePct: 20,
    venueDirectPayPct: 80,
    disclosureEn: 'Pay 20% booking fee now to Kring · rest at the venue',
  },
};

/**
 * Calculates the v3.0 Licensed Tour/Venue Partner (`15%` of volume) checkout split:
 * `Pay 20% booking fee now to Kring · rest at the venue` (`80%` paid directly by guest on arrival).
 */
export function calculateKringLicensedPartnerBookingFeeSplit(params: {
  partnerId: KringV3LicensedTourPartnerId;
  totalPackagePriceThb: number;
}): {
  partnerId: KringV3LicensedTourPartnerId;
  partnerName: string;
  tatLicenseNo: string;
  totalPackagePriceThb: number;
  payNowToKringThb: number;
  payAtVenueDirectThb: number;
  inAppBookingFeePct: 20;
  venueDirectPayPct: 80;
  disclosureEn: 'Pay 20% booking fee now to Kring · rest at the venue';
  exampleSummaryEn: string;
} {
  const spec = KRING_V3_LICENSED_TOUR_PARTNERS[params.partnerId];
  if (!spec) {
    throw new Error(`Unknown licensed tour/venue partner: ${String(params.partnerId)}`);
  }
  const price = Math.floor(params.totalPackagePriceThb);
  if (!Number.isFinite(price) || price < 300) {
    throw new Error('Partner package price must be at least ฿300 THB');
  }
  const payNowToKringThb = Math.round(price * 0.2);
  const payAtVenueDirectThb = price - payNowToKringThb;

  return {
    partnerId: spec.partnerId,
    partnerName: spec.displayName,
    tatLicenseNo: spec.tatLicenseNo,
    totalPackagePriceThb: price,
    payNowToKringThb,
    payAtVenueDirectThb,
    inAppBookingFeePct: 20,
    venueDirectPayPct: 80,
    disclosureEn: 'Pay 20% booking fee now to Kring · rest at the venue',
    exampleSummaryEn: `Pay ฿${payNowToKringThb.toLocaleString('en-US')} now to Kring · ฿${payAtVenueDirectThb.toLocaleString('en-US')} at the venue`,
  };
}

// ============================================================================
// OFFICIAL DODO PAYMENTS ANTIGRAVITY PLUGIN INTEGRATION (v6 / v3.0)
// Source: dodopayments/dodo-agent-plugin/providers/antigravity
//   - skills/dodo-best-practices/SKILL.md
//   - skills/checkout-integration/SKILL.md
//   - skills/webhook-integration/SKILL.md
// ============================================================================

export type DodoPaymentsEnvironment = 'test_mode' | 'live_mode';

export type DodoWebhookEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.processing'
  | 'payment.cancelled'
  | 'refund.succeeded'
  | 'refund.failed'
  | 'dispute.opened'
  | 'dispute.won'
  | 'dispute.lost'
  | 'payout.created'
  | 'payout.in_progress'
  | 'payout.on_hold'
  | 'payout.success'
  | 'payout.failed';

export interface DodoCheckoutSessionCreateRequest {
  product_cart: Array<{
    product_id: string;
    quantity: number;
  }>;
  customer:
    | {
        email: string;
        name?: string;
      }
    | {
        customer_id: string;
      };
  return_url: string;
  billing_currency?: 'THB' | 'INR' | 'USD' | 'EUR' | 'SGD';
  confirm?: boolean;
  discount_codes?: string[];
  feature_flags?: {
    allow_discount_code?: boolean;
  };
  metadata: Record<string, string>;
}

export interface DodoStandardWebhookHeaders {
  'webhook-id': string;
  'webhook-signature': string;
  'webhook-timestamp': string;
}

export interface DodoStandardWebhookEvent {
  business_id: string;
  type: DodoWebhookEventType | string;
  timestamp: string;
  data: {
    payload_type?: string;
    payment_id?: string;
    refund_id?: string;
    dispute_id?: string;
    payout_id?: string;
    status?: string;
    total_amount?: number;
    currency?: string;
    customer?: {
      customer_id?: string;
      email?: string;
      name?: string;
    };
    metadata?: Record<string, string>;
  };
}

export const DODO_ANTIGRAVITY_MCP_SERVERS = {
  'dodopayments-api': {
    serverUrl: 'https://mcp.dodopayments.com/mcp',
  },
  'dodo-knowledge': {
    serverUrl: 'https://knowledge.dodopayments.com/mcp',
  },
} as const;

/**
 * Resolves the official Dodo Payments environment and base URLs.
 * Per `dodo-best-practices` & `webhook-integration`:
 * - Only two real API base URLs exist: `https://live.dodopayments.com` and `https://test.dodopayments.com`
 *   (never use `api.dodopayments.com`, which has no DNS record).
 * - Narrows explicitly and defaults to `'test_mode'` if unset or misspelled so a missing env var
 *   can never accidentally hit live mode.
 */
export function resolveDodoPaymentsEnvironment(
  rawEnvironment?: string | null,
  apiKey?: string | null
): {
  environment: DodoPaymentsEnvironment;
  apiBaseUrl: 'https://live.dodopayments.com' | 'https://test.dodopayments.com';
  staticCheckoutHostUrl: 'https://checkout.dodopayments.com' | 'https://test.checkout.dodopayments.com';
  keyMatchesEnvironment: boolean;
  mcpServers: typeof DODO_ANTIGRAVITY_MCP_SERVERS;
} {
  const environment: DodoPaymentsEnvironment =
    rawEnvironment === 'live_mode' ? 'live_mode' : 'test_mode';

  const trimmedKey = (apiKey ?? '').trim();
  const keyMatchesEnvironment =
    trimmedKey.length === 0
      ? true
      : environment === 'live_mode'
        ? trimmedKey.startsWith('dodo_live_')
        : trimmedKey.startsWith('dodo_test_');

  return {
    environment,
    apiBaseUrl:
      environment === 'live_mode'
        ? 'https://live.dodopayments.com'
        : 'https://test.dodopayments.com',
    staticCheckoutHostUrl:
      environment === 'live_mode'
        ? 'https://checkout.dodopayments.com'
        : 'https://test.checkout.dodopayments.com',
    keyMatchesEnvironment,
    mcpServers: DODO_ANTIGRAVITY_MCP_SERVERS,
  };
}

/**
 * Builds a canonical `client.checkoutSessions.create(...)` payload per `skills/checkout-integration/SKILL.md`.
 * - Replaces deprecated dynamic payment links (`POST /payments`).
 * - Attaches Kring v6 / v3.0 booking metadata (`activity_fee_thb`, `service_fee_thb = '25'`, `total_charged_thb`, `purpose_code = 'P0802'`).
 * - Note: `return_url` is a browser UI hint only; booking hold/entitlement is granted strictly on verified `payment.succeeded` webhook.
 */
export function buildDodoCheckoutSessionRequest(params: {
  productId: string;
  quantity?: number;
  customerEmail?: string;
  customerName?: string;
  existingCustomerId?: string;
  bookingId: string;
  activityId: string;
  hostId: string;
  activityFeeThb: number;
  serviceFeeThb?: number;
  returnUrl?: string;
  billingCurrency?: 'THB' | 'INR' | 'USD' | 'EUR' | 'SGD';
  confirmInline?: boolean;
  discountCodes?: string[];
}): DodoCheckoutSessionCreateRequest {
  const productId = params.productId.trim();
  if (!productId.startsWith('pdt_')) {
    throw new Error('Dodo productId must start with "pdt_"');
  }
  const quantity = Math.max(1, Math.floor(params.quantity ?? 1));
  const activityFeeThb = Math.floor(params.activityFeeThb);
  if (!Number.isFinite(activityFeeThb) || activityFeeThb < 200 || activityFeeThb > 3_000) {
    throw new Error('Kring activityFeeThb must be between ฿200 and ฿3,000 THB');
  }
  const serviceFeeThb = params.serviceFeeThb ?? 25;
  if (serviceFeeThb !== 25) {
    throw new Error('Kring flat service fee must be exactly ฿25 THB');
  }
  const totalChargedThb = activityFeeThb + serviceFeeThb;

  const customer = params.existingCustomerId
    ? { customer_id: params.existingCustomerId.trim() }
    : {
        email: (params.customerEmail ?? '').trim(),
        ...(params.customerName ? { name: params.customerName.trim() } : {}),
      };

  if ('email' in customer && !customer.email.includes('@')) {
    throw new Error('Valid customerEmail or existingCustomerId is required for Dodo Checkout Session');
  }

  const discountCodes = params.discountCodes?.slice(0, 20);

  return {
    product_cart: [{ product_id: productId, quantity }],
    customer,
    return_url: params.returnUrl ?? 'https://kringapp.com/checkout/success',
    ...(params.billingCurrency ? { billing_currency: params.billingCurrency } : {}),
    ...(params.confirmInline ? { confirm: true } : {}),
    ...(discountCodes && discountCodes.length > 0
      ? {
          discount_codes: discountCodes,
          feature_flags: { allow_discount_code: true },
        }
      : {}),
    metadata: {
      booking_id: params.bookingId,
      activity_id: params.activityId,
      host_id: params.hostId,
      activity_fee_thb: String(activityFeeThb),
      service_fee_thb: '25',
      total_charged_thb: String(totalChargedThb),
      purpose_code: 'P0802',
      kring_architecture: 'v6_zero_mor_escrow',
    },
  };
}

/**
 * Builds an official Dodo Static Payment Link (`skills/checkout-integration/SKILL.md`):
 * - Live host: `https://checkout.dodopayments.com/buy/{productId}`
 * - Test host: `https://test.checkout.dodopayments.com/buy/{productId}`
 * - Appends supported query parameters (`quantity`, `redirect_url`, `email`, `fullName`, `paymentCurrency`, `metadata_*`).
 */
export function buildDodoStaticPaymentLink(params: {
  productId: string;
  environment?: DodoPaymentsEnvironment;
  quantity?: number;
  redirectUrl?: string;
  email?: string;
  fullName?: string;
  paymentCurrency?: 'THB' | 'INR' | 'USD' | 'EUR' | 'SGD';
  metadata?: Record<string, string | number>;
}): string {
  const productId = params.productId.trim();
  if (!productId.startsWith('pdt_')) {
    throw new Error('Dodo productId must start with "pdt_"');
  }
  const { staticCheckoutHostUrl } = resolveDodoPaymentsEnvironment(params.environment ?? 'test_mode');
  const query = new URLSearchParams();

  if (params.quantity && params.quantity > 1) {
    query.set('quantity', String(Math.floor(params.quantity)));
  }
  if (params.redirectUrl) {
    query.set('redirect_url', params.redirectUrl);
  }
  if (params.email) {
    query.set('email', params.email);
  }
  if (params.fullName) {
    query.set('fullName', params.fullName);
  }
  if (params.paymentCurrency) {
    query.set('paymentCurrency', params.paymentCurrency);
  }
  if (params.metadata) {
    for (const [key, val] of Object.entries(params.metadata)) {
      query.set(`metadata_${key}`, String(val));
    }
  }

  const qs = query.toString();
  return `${staticCheckoutHostUrl}/buy/${encodeURIComponent(productId)}${qs ? `?${qs}` : ''}`;
}

/**
 * Deterministic Standard Webhooks (`webhook-id`, `webhook-signature`, `webhook-timestamp`) verifier
 * and parser for Dodo Payments (`skills/webhook-integration/SKILL.md`).
 * - Requires the raw unparsed JSON string (`rawBody`).
 * - Enforces replay window (`maxAgeSeconds = 300`) and `webhook-id` idempotency.
 */
export function verifyAndParseDodoStandardWebhook(params: {
  rawBody: string;
  headers: Partial<DodoStandardWebhookHeaders>;
  expectedSignature?: string;
  seenWebhookIds?: Set<string>;
  nowUnixSeconds?: number;
  maxAgeSeconds?: number;
}): {
  verified: boolean;
  duplicate: boolean;
  webhookId: string;
  event: DodoStandardWebhookEvent | null;
  errorReason: string | null;
} {
  const webhookId = (params.headers['webhook-id'] ?? '').trim();
  const webhookSignature = (params.headers['webhook-signature'] ?? '').trim();
  const webhookTimestampStr = (params.headers['webhook-timestamp'] ?? '').trim();

  if (!webhookId || !webhookSignature || !webhookTimestampStr) {
    return {
      verified: false,
      duplicate: false,
      webhookId,
      event: null,
      errorReason: 'MISSING_STANDARD_WEBHOOK_HEADERS',
    };
  }

  if (!webhookSignature.startsWith('v1,')) {
    return {
      verified: false,
      duplicate: false,
      webhookId,
      event: null,
      errorReason: 'INVALID_WEBHOOK_SIGNATURE_VERSION',
    };
  }

  if (params.expectedSignature && webhookSignature !== params.expectedSignature) {
    return {
      verified: false,
      duplicate: false,
      webhookId,
      event: null,
      errorReason: 'SIGNATURE_MISMATCH',
    };
  }

  const timestampSec = Number(webhookTimestampStr);
  const nowSec = params.nowUnixSeconds ?? Math.floor(Date.now() / 1000);
  const maxAge = params.maxAgeSeconds ?? 300;
  if (!Number.isFinite(timestampSec) || Math.abs(nowSec - timestampSec) > maxAge) {
    return {
      verified: false,
      duplicate: false,
      webhookId,
      event: null,
      errorReason: 'WEBHOOK_TIMESTAMP_OUT_OF_TOLERANCE',
    };
  }

  if (params.seenWebhookIds?.has(webhookId)) {
    return {
      verified: true,
      duplicate: true,
      webhookId,
      event: null,
      errorReason: null,
    };
  }

  try {
    const parsed = JSON.parse(params.rawBody) as DodoStandardWebhookEvent;
    if (!parsed || typeof parsed !== 'object' || !parsed.type || !parsed.business_id) {
      return {
        verified: false,
        duplicate: false,
        webhookId,
        event: null,
        errorReason: 'MALFORMED_DODO_EVENT_PAYLOAD',
      };
    }
    params.seenWebhookIds?.add(webhookId);
    return {
      verified: true,
      duplicate: false,
      webhookId,
      event: parsed,
      errorReason: null,
    };
  } catch {
    return {
      verified: false,
      duplicate: false,
      webhookId,
      event: null,
      errorReason: 'INVALID_RAW_JSON_BODY',
    };
  }
}

// ============================================================================
// SERVER-SIDE THAI HOST <30s eKYC HELPER (iApp Technology — `IAPP_API_KEY`)
// Endpoints:
//   - Thai ID OCR v3.5: https://api.iapp.co.th/thai-national-id-card/v3.5/front
//   - Face & Passive Liveness v2: https://api.iapp.co.th/face-verification/v2/face_comparison
// Security Invariant:
//   - `IAPP_API_KEY` / `IAPP_API_KEY_DEFAULT` is read strictly server-side (Edge Function / Node);
//     never exposed via `VITE_*` client environment variables.
// ============================================================================

export const IAPP_THAI_ID_OCR_V35_ENDPOINT =
  'https://api.iapp.co.th/thai-national-id-card/v3.5/front' as const;
export const IAPP_FACE_COMPARISON_V2_ENDPOINT =
  'https://api.iapp.co.th/face-verification/v2/face_comparison' as const;

export function buildIAppThaiHostEkycRequest(params: {
  serverEnv: Record<string, string | undefined>;
  hostId: string;
  pdpaConsent: boolean;
  declaredAgeYears: number;
  promptPayDisplayName: string;
  checkType: 'THAI_ID_OCR_FRONT' | 'FACE_AND_LIVENESS_MATCH';
}): {
  endpointUrl: string;
  headers: {
    apikey: string;
    'X-Kring-Host-Id': string;
    'X-Kring-Pdpa-Retention': 'MAX_1_YEAR_OR_IMMEDIATE_ON_DELETE';
  };
  pdpaCompliant: true;
  zeroClientKeyExposure: true;
  promptPayNameNormalized: string;
} {
  // Block any accidental VITE_ client environment variable leak
  if ('VITE_IAPP_API_KEY' in params.serverEnv && params.serverEnv.VITE_IAPP_API_KEY) {
    throw new Error('SECURITY_VIOLATION: IAPP_API_KEY must never be exposed in VITE_ client env');
  }

  if (params.pdpaConsent !== true) {
    throw new Error('PDPA_CONSENT_REQUIRED: Host must explicitly tick PDPA biometric consent before eKYC');
  }

  if (!Number.isFinite(params.declaredAgeYears) || params.declaredAgeYears < 20) {
    throw new Error('AGE_20_PLUS_REQUIRED: Thai host must be 20+ years old');
  }

  const rawKey = (params.serverEnv.IAPP_API_KEY ?? params.serverEnv.IAPP_API_KEY_DEFAULT ?? '').trim();
  if (rawKey.length < 16) {
    throw new Error('MISSING_SERVER_IAPP_API_KEY: Set IAPP_API_KEY in server/.env.local secrets');
  }

  const promptPayNameNormalized = params.promptPayDisplayName.trim().replace(/\s+/g, ' ');
  if (promptPayNameNormalized.length < 2) {
    throw new Error('PROMPTPAY_NAME_REQUIRED: Host PromptPay account name is required for 1:1 match');
  }

  return {
    endpointUrl:
      params.checkType === 'THAI_ID_OCR_FRONT'
        ? IAPP_THAI_ID_OCR_V35_ENDPOINT
        : IAPP_FACE_COMPARISON_V2_ENDPOINT,
    headers: {
      apikey: rawKey,
      'X-Kring-Host-Id': params.hostId.trim(),
      'X-Kring-Pdpa-Retention': 'MAX_1_YEAR_OR_IMMEDIATE_ON_DELETE',
    },
    pdpaCompliant: true,
    zeroClientKeyExposure: true,
    promptPayNameNormalized,
  };
}

// ============================================================================
// SOLO-FOUNDER 100% AUTOMATED COUPON & VOUCHER ENGINE ("A YES" LOCK-IN)
// ============================================================================

export type SoloFounderDealKind = 'FIXED_PRICE_TICKET_OR_SET' | 'OPEN_BILL_CASHIER_COUPON';

export const KILLED_LOW_INTENT_SKU_KEYWORDS = [
  'cooking school',
  'cooking class',
  'bespoke tailor',
  'dental',
  'iv clinic',
  'pharmacy',
] as const;

export function isHighIntentAllowedDealText(text: string): boolean {
  const lower = text.toLowerCase();
  return !KILLED_LOW_INTENT_SKU_KEYWORDS.some((killed) => lower.includes(killed));
}

export interface SoloFounderCouponEvaluationInput {
  mode: 'WITH_LOCAL_HOST' | 'SOLO';
  dealKind: SoloFounderDealKind;
  fullTicketPriceThb?: number;
  isThaiLocalPhoneOrLang: boolean;
  soloOpenBillCouponsUsedCount: number;
  hasActive7DayUnlimitedCouponPass: boolean;
  selectedOpenBillUnlockOption?: 'SINGLE_49_THB' | 'PASS_7D_199_THB';
}

export interface SoloFounderCouponEvaluationResult {
  payNowToKringThb: number;
  payAtVenueDirectThb: number;
  touristNetSavingsThb: number;
  discountPct: 15 | 20;
  isFreeHookApplied: boolean;
  showThaiHostConversionBanner: boolean;
  thaiHostConversionBannerText?: string;
  voucherHeadlineEn: string;
  voucherHeadlineTh: string;
  autoCreditShieldBadgeEn: string;
  openBillUpsellOptions?: {
    singleUnlockThb: 49;
    sevenDayUnlimitedPassThb: 199;
    freeWithLocalHostHint: string;
  };
}

export function evaluateAutomatedSoloFounderCouponAction(
  input: SoloFounderCouponEvaluationInput
): SoloFounderCouponEvaluationResult {
  const autoCreditShieldBadgeEn =
    '🛡️ Show QR at venue counter · Kring may earn a commission.';
  const thaiBanner =
    '✨ Already at this café? Earn ฿800–฿1,280 having coffee here with a verified traveller! [Turn On Host Mode Here]';

  if (input.mode === 'WITH_LOCAL_HOST') {
    return {
      payNowToKringThb: 0,
      payAtVenueDirectThb: 0,
      touristNetSavingsThb: 0,
      discountPct: 15,
      isFreeHookApplied: true,
      showThaiHostConversionBanner: false,
      voucherHeadlineEn:
        '✅ 15% Off Venue Coupon Included FREE (฿0) with Your Local Host Meetup!',
      voucherHeadlineTh:
        '✅ ฟรีคูปองส่วนลด 15% (฿0) เมื่อนัดเจอกับโฮสต์คนไทยที่ร้านนี้!',
      autoCreditShieldBadgeEn,
    };
  }

  if (input.isThaiLocalPhoneOrLang) {
    return {
      payNowToKringThb: 0,
      payAtVenueDirectThb: 0,
      touristNetSavingsThb: 0,
      discountPct: 15,
      isFreeHookApplied: true,
      showThaiHostConversionBanner: true,
      thaiHostConversionBannerText: thaiBanner,
      voucherHeadlineEn:
        '🇹🇭 100% FREE (฿0) Local Thai Show-at-Cashier 15% Off Coupon',
      voucherHeadlineTh:
        '🇹🇭 ฟรี 100% (฿0) คูปองส่วนลด 15% โชว์ที่แคชเชียร์สำหรับคนไทย',
      autoCreditShieldBadgeEn,
    };
  }

  if (input.dealKind === 'FIXED_PRICE_TICKET_OR_SET') {
    const ticket = Math.max(100, Math.round(input.fullTicketPriceThb ?? 1000));
    const deposit10Pct = Math.round(ticket * 0.1);
    const payVenue80Pct = Math.round(ticket * 0.8);
    const save10Pct = ticket - (deposit10Pct + payVenue80Pct);

    return {
      payNowToKringThb: deposit10Pct,
      payAtVenueDirectThb: payVenue80Pct,
      touristNetSavingsThb: save10Pct,
      discountPct: 20,
      isFreeHookApplied: false,
      showThaiHostConversionBanner: false,
      voucherHeadlineEn: `✅ Paid Deposit in Kring: ฿${deposit10Pct.toLocaleString('en-US')} · Pay Only ฿${payVenue80Pct.toLocaleString('en-US')} (80%) Directly to Venue at Counter (Cash/Card) — You Save ฿${save10Pct.toLocaleString('en-US')}!`,
      voucherHeadlineTh: `✅ ชำระมัดจำในกริ๊งแล้ว: ฿${deposit10Pct.toLocaleString('en-US')} · จ่ายที่หน้าร้านเพียง ฿${payVenue80Pct.toLocaleString('en-US')} (80% เงินสด/บัตร) — ประหยัดทันที ฿${save10Pct.toLocaleString('en-US')}!`,
      autoCreditShieldBadgeEn,
    };
  }

  if (input.hasActive7DayUnlimitedCouponPass || input.soloOpenBillCouponsUsedCount === 0) {
    return {
      payNowToKringThb: 0,
      payAtVenueDirectThb: 0,
      touristNetSavingsThb: 0,
      discountPct: 15,
      isFreeHookApplied: true,
      showThaiHostConversionBanner: false,
      voucherHeadlineEn:
        '🎁 1st Solo Coupon FREE (฿0) — Show at Cashier for 15% Off Bill!',
      voucherHeadlineTh:
        '🎁 ฟรีคูปองใบแรก (฿0) — โชว์ที่แคชเชียร์รับส่วนลด 15% ทันที!',
      autoCreditShieldBadgeEn,
    };
  }

  const chosenCost =
    input.selectedOpenBillUnlockOption === 'PASS_7D_199_THB' ? 199 : 49;

  return {
    payNowToKringThb: chosenCost,
    payAtVenueDirectThb: 0,
    touristNetSavingsThb: 0,
    discountPct: 15,
    isFreeHookApplied: false,
    showThaiHostConversionBanner: false,
    voucherHeadlineEn:
      chosenCost === 199
        ? '✅ 7-Day Unlimited Thailand Coupon Pass Active (฿199) · 15% Off Bill at Cashier!'
        : '✅ Solo Coupon Unlocked (฿49) · Show at Cashier for 15% Off Bill!',
    voucherHeadlineTh:
      chosenCost === 199
        ? '✅ เปิดใช้งานพาสคูปองไม่จำกัด 7 วัน (฿199) · โชว์ที่แคชเชียร์ลด 15%!'
        : '✅ ปลดล็อกคูปองสำเร็จ (฿49) · โชว์ที่แคชเชียร์ลด 15%!',
    autoCreditShieldBadgeEn,
    openBillUpsellOptions: {
      singleUnlockThb: 49,
      sevenDayUnlimitedPassThb: 199,
      freeWithLocalHostHint:
        '💡 Or get ALL coupons 100% FREE when you book a Local Host!',
    },
  };
}

// ============================================================================
// FABLE (OPUS) FINAL DEALS SPEC (27 OCT 2026): THAI-INSIDER PORTALS MERGED
// ============================================================================

export type DealTierKind =
  | 'TIER1_NET_RATE_SINGLE_TICKET_TRANSFER_ESIM'
  | 'TIER2_REBATE_ALLOWED_AFFILIATE'
  | 'TIER2_PLAIN_LINK_NO_REBATE'
  | 'TIER3_DIRECT_VENUE_QR_COUPON'
  | 'VALUE_ONLY_OR_PUBLIC_CODE';

export type TatLicenseGateStatus =
  | 'EXEMPT_ESIM_TRANSFER_SINGLE_ATTRACTION_OR_VENUE_COUPON'
  | 'REQUIRES_LICENSED_THAI_TOUR_OPERATOR_PARTNER';

export interface FableRound2DealOffer {
  id: string;
  titleEn: string;
  titleTh: string;
  city: 'bangkok' | 'pattaya' | 'both';
  tier: DealTierKind;
  marginType: 'affiliate' | 'net_rate' | 'value_only' | 'public_code';
  tatLicenseGate: TatLicenseGateStatus;
  tatFlag: 'ticket' | 'tour' | 'n/a';
  shelf: 'activities_tickets' | 'esim_transfers' | 'spa' | 'health_wellness' | 'dining_offpeak';
  source: string;
  network: 'involve_asia' | 'travelpayouts' | 'impact' | 'awin' | 'direct' | 'none';
  publisherId: string | null;
  commission: number;
  rateVerified: boolean;
  rebateAllowed: boolean;
  rebateAmount: number;
  eligibility: 'all' | 'non_thai_card' | 'thai_phone_or_card';
  discountBasisUrl: string | null;
  discountBasisDated: string | null;
  disclosureLine: string;
  originalPrice: number | null;
  kringNetPriceThb: number | null;
  expiryDate: string | null;
  enabledForLaunch: boolean;
}

export const THAI_INSIDER_B2B_PORTALS: readonly FableRound2DealOffer[] = [
  {
    id: 'globaltix-marketplace-reseller',
    titleEn: 'GlobalTix B2B Attraction Tickets (Safari World, Nong Nooch, Sanctuary of Truth)',
    titleTh: 'บัตรสถานที่ท่องเที่ยวผ่าน GlobalTix (TA03367)',
    city: 'both',
    tier: 'TIER1_NET_RATE_SINGLE_TICKET_TRANSFER_ESIM',
    marginType: 'affiliate',
    tatLicenseGate: 'EXEMPT_ESIM_TRANSFER_SINGLE_ATTRACTION_OR_VENUE_COUPON',
    tatFlag: 'ticket',
    shelf: 'activities_tickets',
    source: 'GlobalTix (Thai TA Licence TA03367)',
    network: 'direct',
    publisherId: null,
    commission: 0,
    rateVerified: false,
    rebateAllowed: true,
    rebateAmount: 0,
    eligibility: 'all',
    discountBasisUrl: 'https://www.globaltix.com/',
    discountBasisDated: '2026-10-27',
    disclosureLine: 'Sold by GlobalTix · Kring may earn a referral fee',
    originalPrice: null,
    kringNetPriceThb: null,
    expiryDate: '2026-12-31',
    enabledForLaunch: false,
  },
  {
    id: 't2a-unverified-hold',
    titleEn: 'Ticket2Attraction Thailand Attraction Vouchers (Held Pending Rate Verification)',
    titleTh: 'เวาเชอร์สถานที่ท่องเที่ยว Ticket2Attraction (รอยืนยันเรทหน้าเว็บ)',
    city: 'both',
    tier: 'TIER2_REBATE_ALLOWED_AFFILIATE',
    marginType: 'affiliate',
    tatLicenseGate: 'EXEMPT_ESIM_TRANSFER_SINGLE_ATTRACTION_OR_VENUE_COUPON',
    tatFlag: 'ticket',
    shelf: 'activities_tickets',
    source: 'Ticket2Attraction.com',
    network: 'direct',
    publisherId: null,
    commission: 12,
    rateVerified: false,
    rebateAllowed: true,
    rebateAmount: 0,
    eligibility: 'all',
    discountBasisUrl: null,
    discountBasisDated: null,
    disclosureLine: 'Sold by Ticket2Attraction · Kring may earn a referral fee',
    originalPrice: null,
    kringNetPriceThb: null,
    expiryDate: null,
    enabledForLaunch: false,
  },
  {
    id: 'gowabi-spa-onsen-shelf',
    titleEn: 'GoWabi Bangkok & Pattaya Onsen & Day Spa Offers (Walk-in vs GoWabi Listing Price)',
    titleTh: 'ดีลออนเซ็นและสปาชั้นนำบน GoWabi',
    city: 'both',
    tier: 'TIER2_REBATE_ALLOWED_AFFILIATE',
    marginType: 'affiliate',
    tatLicenseGate: 'EXEMPT_ESIM_TRANSFER_SINGLE_ATTRACTION_OR_VENUE_COUPON',
    tatFlag: 'n/a',
    shelf: 'spa',
    source: 'GoWabi Thailand',
    network: 'involve_asia',
    publisherId: '1105164',
    commission: 8,
    rateVerified: false,
    rebateAllowed: false,
    rebateAmount: 0,
    eligibility: 'all',
    discountBasisUrl: 'https://www.gowabi.com/en',
    discountBasisDated: '2026-10-27',
    disclosureLine: 'Sold by GoWabi · Kring may earn a commission',
    originalPrice: null,
    kringNetPriceThb: null,
    expiryDate: '2026-12-31',
    enabledForLaunch: true,
  },
  {
    id: 'hdmall-health-wellness-shelf',
    titleEn: 'HDmall Health Check, Dental & Wellness Clinics (Separate Health & Wellness Shelf)',
    titleTh: 'แพ็กเกจตรวจสุขภาพและทันตกรรม HDmall (หมวดสุขภาพและเวลเนส)',
    city: 'bangkok',
    tier: 'TIER2_REBATE_ALLOWED_AFFILIATE',
    marginType: 'affiliate',
    tatLicenseGate: 'EXEMPT_ESIM_TRANSFER_SINGLE_ATTRACTION_OR_VENUE_COUPON',
    tatFlag: 'n/a',
    shelf: 'health_wellness',
    source: 'HDmall Thailand',
    network: 'involve_asia',
    publisherId: '1105164',
    commission: 10,
    rateVerified: false,
    rebateAllowed: false,
    rebateAmount: 0,
    eligibility: 'all',
    discountBasisUrl: 'https://hdmall.co.th',
    discountBasisDated: '2026-10-27',
    disclosureLine: 'Booked via HDmall · Kring may earn a commission',
    originalPrice: null,
    kringNetPriceThb: null,
    expiryDate: '2026-12-31',
    enabledForLaunch: true,
  },
  {
    id: 'eatigo-off-peak-dining-value-only',
    titleEn: 'Up to 50% Off Off-Peak Dining via Eatigo (Food Bill Only; Drinks & Set Menus Excluded)',
    titleTh: 'ส่วนลดค่าอาหารสูงสุด 50% ช่วง Off-Peak ผ่าน Eatigo',
    city: 'both',
    tier: 'VALUE_ONLY_OR_PUBLIC_CODE',
    marginType: 'value_only',
    tatLicenseGate: 'EXEMPT_ESIM_TRANSFER_SINGLE_ATTRACTION_OR_VENUE_COUPON',
    tatFlag: 'n/a',
    shelf: 'dining_offpeak',
    source: 'Eatigo Thailand',
    network: 'none',
    publisherId: null,
    commission: 0,
    rateVerified: true,
    rebateAllowed: false,
    rebateAmount: 0,
    eligibility: 'all',
    discountBasisUrl: 'https://help.eatigo.com/portal/en/kb/articles/what-does-a-reservation-on-eatigo-really-include-is-there-any-fine-print',
    discountBasisDated: '2026-10-27',
    disclosureLine: 'Free reservation via Eatigo · No commission to Kring',
    originalPrice: null,
    kringNetPriceThb: null,
    expiryDate: null,
    enabledForLaunch: true,
  },
  {
    id: 'megatix-thai-tiew-thai-window-only',
    titleEn: 'Thai Tiew Thai Hotel & Dining Voucher via Megatix (Pay ฿500, Spend ฿700 During Sale Windows)',
    titleTh: 'เวาเชอร์ไทยเที่ยวไทยบน Megatix (จ่าย ฿500 ใช้ได้ ฿700 เฉพาะช่วงงาน)',
    city: 'both',
    tier: 'VALUE_ONLY_OR_PUBLIC_CODE',
    marginType: 'value_only',
    tatLicenseGate: 'EXEMPT_ESIM_TRANSFER_SINGLE_ATTRACTION_OR_VENUE_COUPON',
    tatFlag: 'n/a',
    shelf: 'dining_offpeak',
    source: 'Megatix Thailand',
    network: 'none',
    publisherId: null,
    commission: 0,
    rateVerified: true,
    rebateAllowed: false,
    rebateAmount: 0,
    eligibility: 'all',
    discountBasisUrl: 'https://megatix.in.th/events/the-standardx-bangkok-thai-tiew-thai-73',
    discountBasisDated: '2026-10-27',
    disclosureLine: 'Sold directly by venue via Megatix Thailand',
    originalPrice: 700,
    kringNetPriceThb: 500,
    expiryDate: null,
    enabledForLaunch: false,
  },
  {
    id: 'pattaya-weekend-pack-400-off',
    titleEn: 'Pattaya Weekend Pack −฿400 (Airalo 8d eSIM + 12Go Van + Rajadamnern 2 Tickets + Welcome Pickups Return)',
    titleTh: 'แพ็กสุดสัปดาห์พัทยา ลด ฿400 (eSIM 8 วัน + รถตู้ 12Go + ราชดำเนิน 2 ที่นั่ง + รถรับส่งสนามบิน)',
    city: 'pattaya',
    tier: 'TIER2_REBATE_ALLOWED_AFFILIATE',
    marginType: 'affiliate',
    tatLicenseGate: 'EXEMPT_ESIM_TRANSFER_SINGLE_ATTRACTION_OR_VENUE_COUPON',
    tatFlag: 'ticket',
    shelf: 'esim_transfers',
    source: 'Airalo + 12Go + Rajadamnern Direct + Welcome Pickups Basket',
    network: 'travelpayouts',
    publisherId: '589675',
    commission: 11.35,
    rateVerified: true,
    rebateAllowed: true,
    rebateAmount: 400,
    eligibility: 'all',
    discountBasisUrl: 'https://www.travelpayouts.com/en/offers/airalo-partner-program/',
    discountBasisDated: '2026-10-26',
    disclosureLine: 'Kring may earn a commission',
    originalPrice: 5779,
    kringNetPriceThb: 5379,
    expiryDate: '2026-12-31',
    enabledForLaunch: true,
  },
] as const;

export const SURFACED_PUBLIC_PROMOS_BENCHMARK = [
  {
    id: 'grab-travel-pass',
    label: 'Amazing Thailand Grab Travel Pass (฿30 for up to 30% off rides, 20% airport rides)',
    code: 'IN-APP',
    eligibility: 'all',
    validFrom: '2026-04-01',
    validTo: '2026-12-31',
    url: 'https://www.grab.com/th/en/press/others/amazing-thailand-grab-travel-pass/',
    enabledForLaunch: true,
  },
  {
    id: 'mastercard-grab-airport',
    label: 'Arriving? ฿100 off your Grab from the airport with a Mastercard issued outside Thailand (1/month, quota 5,581/month)',
    code: 'MCAIRPORT',
    eligibility: 'non_thai_card',
    validFrom: '2026-09-01',
    validTo: '2027-08-31',
    url: 'https://www.grab.com/th/blog/mcairport_sep26-aug27/',
    enabledForLaunch: true,
  },
  {
    id: 'ktc-klook-13pct',
    label: 'KTC Card × Klook Thailand (Up to 13% back by redeeming KTC points)',
    code: 'KTCKLOOK',
    eligibility: 'thai_phone_or_card',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    url: 'https://www.ktc.co.th/en/promotion/travel/online-travel-agency/klook',
    enabledForLaunch: true,
  },
  {
    id: 'scb-planet-klook-held-out',
    label: 'SCB Planet × Klook (Held out: reachable page shows 2024 code SCBPLANET24 and requires Thai phone + SCB Planet card)',
    code: 'SCBPLANET12',
    eligibility: 'thai_phone_or_card',
    validFrom: null,
    validTo: null,
    url: 'https://www.scb.co.th/th/personal-banking/promotions/prepaid-card/planet-scb-klook.html',
    enabledForLaunch: false,
  },
] as const;









