import { describe, expect, it } from 'vitest';
import {
  AFFILIATE_NETWORKS,
  COINS_PER_THB,
  DAY1_PAYMENT_AND_VOUCHER_PROVIDERS,
  DESIGN_B_PRIORITY_THAI_SELLERS,
  KRING_PRODUCTION_SERVER_IP,
  KRING_UDYAM_REGISTRATION_NO,
  LIVE_INVOLVE_ASIA_AFF_ID,
  LIVE_TRAVELPAYOUTS_MARKER_ID,
  LIVE_WELCOME_PICKUPS_PROPERTY_ID,
  LOCAL_THAI_PAYMENT_FIRMS,
  PARTNER_VERTICALS,
  assertDesignBPaidBookingImmutableSeller,
  assertZeroFeeNetworkPayout,
  buildBrolexyOrderRequestPayload,
  buildDesignBBumpPayoutInstruction,
  buildDodoOutingPassCheckoutPayload,
  buildLocalThaiPspChargePayload,
  buildTazapayPromptPayCheckoutPayload,
  buildTrackedAffiliateUrl,
  buildWisePromptPayTransferPayload,
  buildZenditThbVoucherPurchasePayload,
  calculateCheapestNetPriceBreakdown,
  selectDesignBSellerPartnerForBooking,
} from './chonAffiliatePartnerEngine';

describe('chonAffiliatePartnerEngine (MOD1-17, MOD1-18, MOD1-20, D-018, R-002)', () => {
  it('locks 100 coins = ฿1 THB across all partner and checkout flows', () => {
    expect(COINS_PER_THB).toBe(100);
  });

  it('configures Travelpayouts, Involve Asia, and Direct Self-Serve verticals with zero-fee payouts', () => {
    expect(AFFILIATE_NETWORKS.TRAVELPAYOUTS.lockedPayoutMethod).toBe('PAYPAL_ZERO_FEE');
    expect(AFFILIATE_NETWORKS.INVOLVE_ASIA.lockedPayoutMethod).toBe(
      'LOCAL_BANK_TRANSFER_2_FREE_PER_MONTH'
    );
    expect(AFFILIATE_NETWORKS.INVOLVE_ASIA.blockedPayoutMethods).toContain(
      'PAYPAL_5_PCT_FEE_TRAP'
    );

    // Check required partners exist
    expect(PARTNER_VERTICALS.GETTRANSFER.networkId).toBe('TRAVELPAYOUTS');
    expect(PARTNER_VERTICALS.KIWITAXI.networkId).toBe('TRAVELPAYOUTS');
    expect(PARTNER_VERTICALS.KLOOK.networkId).toBe('TRAVELPAYOUTS');
    expect(PARTNER_VERTICALS.AIRALO.networkId).toBe('TRAVELPAYOUTS');
    expect(PARTNER_VERTICALS.BOOKING_COM.networkId).toBe('TRAVELPAYOUTS');
    expect(PARTNER_VERTICALS.YESIM.networkId).toBe('TRAVELPAYOUTS');
    expect(PARTNER_VERTICALS.EKTA.networkId).toBe('TRAVELPAYOUTS');

    expect(PARTNER_VERTICALS.GOWABI.networkId).toBe('INVOLVE_ASIA');
    expect(PARTNER_VERTICALS.HDMALL.networkId).toBe('INVOLVE_ASIA');
    expect(PARTNER_VERTICALS.AGODA.networkId).toBe('INVOLVE_ASIA');
    expect(PARTNER_VERTICALS.SHOPEE.networkId).toBe('INVOLVE_ASIA');
    expect(PARTNER_VERTICALS.LAZADA.networkId).toBe('INVOLVE_ASIA');
    expect(PARTNER_VERTICALS.SEVEN_ELEVEN_ALL_ONLINE.networkId).toBe('INVOLVE_ASIA');

    expect(PARTNER_VERTICALS.VIATOR_PARTNER.networkId).toBe('DIRECT_SELF_SERVE');
    expect(PARTNER_VERTICALS.FOREVER_FLORIST_TH.networkId).toBe('DIRECT_SELF_SERVE');
    expect(PARTNER_VERTICALS.GRABGIFTS_TH.zeroMarkupGuarantee).toBe(true);
    expect(PARTNER_VERTICALS.TRUEMONEY_ANGPAO_711.zeroMarkupGuarantee).toBe(true);
    expect(PARTNER_VERTICALS.TICKET2ATTRACTION.networkId).toBe('DIRECT_SELF_SERVE');
    expect(PARTNER_VERTICALS.NAMS_TAXI_FLEET.networkId).toBe('DIRECT_SELF_SERVE');
    expect(PARTNER_VERTICALS.MUVMI.networkId).toBe('DIRECT_SELF_SERVE');
    expect(PARTNER_VERTICALS.WISE_CPA.networkId).toBe('DIRECT_SELF_SERVE');
  });

  it('guards against the Involve Asia 5% PayPal payout fee trap', () => {
    expect(() =>
      assertZeroFeeNetworkPayout('INVOLVE_ASIA', 'PayPal Express')
    ).toThrow(/INVOLVE_ASIA_PAYPAL_FEE_TRAP_BLOCKED/);

    expect(
      assertZeroFeeNetworkPayout('INVOLVE_ASIA', 'LOCAL_BANK_TRANSFER_2_FREE_PER_MONTH')
    ).toBe('LOCAL_BANK_TRANSFER_2_FREE_PER_MONTH');

    expect(assertZeroFeeNetworkPayout('TRAVELPAYOUTS', 'PayPal')).toBe(
      'PAYPAL_ZERO_FEE'
    );
  });

  it('builds tracked affiliate URLs with sub_id = chon_${userId}_${dealId} and coins_per_thb = 100', () => {
    const res = buildTrackedAffiliateUrl({
      partnerId: 'GOWABI',
      userId: 'usr_888',
      dealId: 'lash_thonglor_01',
      markerOrAffId: 'ia_chon_99',
    });

    expect(res.subId).toBe('chon_usr_888_lash_thonglor_01');
    expect(res.coinsPerThb).toBe(100);
    const parsed = new URL(res.trackedUrl);
    expect(parsed.searchParams.get('sub_id')).toBe('chon_usr_888_lash_thonglor_01');
    expect(parsed.searchParams.get('aff_id')).toBe('ia_chon_99');
    expect(parsed.searchParams.get('coins_per_thb')).toBe('100');
  });

  it('automatically injects live production credentials (marker=589675, aff_id=1105164, property_id=45846) when markerOrAffId is omitted', () => {
    expect(LIVE_TRAVELPAYOUTS_MARKER_ID).toBe('589675');
    expect(LIVE_INVOLVE_ASIA_AFF_ID).toBe('1105164');
    expect(LIVE_WELCOME_PICKUPS_PROPERTY_ID).toBe('45846');

    for (const tpPartner of ['KIWITAXI', 'GETTRANSFER', 'KLOOK', 'AIRALO'] as const) {
      const res = buildTrackedAffiliateUrl({
        partnerId: tpPartner,
        userId: 'usr_live_01',
        dealId: 'deal_tp_01',
      });
      const parsed = new URL(res.trackedUrl);
      expect(parsed.searchParams.get('marker')).toBe('589675');
    }

    for (const iaPartner of ['GOWABI', 'HDMALL', 'AGODA', 'SHOPEE', 'LAZADA'] as const) {
      const res = buildTrackedAffiliateUrl({
        partnerId: iaPartner,
        userId: 'usr_live_02',
        dealId: 'deal_ia_02',
      });
      const parsed = new URL(res.trackedUrl);
      expect(parsed.searchParams.get('aff_id')).toBe('1105164');
    }

    const wpRes = buildTrackedAffiliateUrl({
      partnerId: 'WELCOME_PICKUPS',
      userId: 'usr_live_03',
      dealId: 'deal_wp_03',
    });
    const wpParsed = new URL(wpRes.trackedUrl);
    expect(wpParsed.searchParams.get('property_id')).toBe('45846');
    expect(wpParsed.searchParams.get('sub_id')).toBe('chon_usr_live_03_deal_wp_03');
  });

  it('calculates the 50/50 commission split + Hangout Voucher and proves effectiveNetPriceThb < officialPriceThb', () => {
    const breakdown = calculateCheapestNetPriceBreakdown({
      officialPriceThb: 1200,
      partnerDiscountedPriceThb: 1000,
      affiliateCommissionPct: 10, // ฿100 total commission -> ฿50 user rebate (5,000 🪙) + ฿50 Chon! profit
      hangoutVoucherThb: 150,
    });

    expect(breakdown.totalAffiliateCommissionThb).toBe(100);
    expect(breakdown.userCoinRebateThb).toBe(50);
    expect(breakdown.userCoinRebateCoins).toBe(5000); // 50 THB * 100 🪙/THB
    expect(breakdown.chonPlatformProfitThb).toBe(50);
    expect(breakdown.hangoutVoucherThb).toBe(150);
    expect(breakdown.effectiveNetPriceThb).toBe(800); // 1000 - 50 - 150
    expect(breakdown.totalSavingsVsOfficialThb).toBe(400); // 1200 - 800
    expect(breakdown.isCheaperThanOfficial).toBe(true);
  });

  it('builds Dodo Payments checkout payload strictly under MCC 4722 with 72h Holiday VIP Pass upsell', () => {
    const payload = buildDodoOutingPassCheckoutPayload({
      userId: 'guest_bkk_42',
      packThb: 1500,
      addHolidayVipPass490: true,
    });

    expect(payload.merchantOfRecord).toBe('DODO_PAYMENTS');
    expect(payload.mccCode).toBe('4722');
    expect(payload.productTitle).toBe(
      'Chon! — Curated Bangkok Social & Culinary Outing Pass'
    );
    expect(payload.basePackThb).toBe(1500);
    expect(payload.holidayVipPassThb).toBe(490);
    expect(payload.totalChargeThb).toBe(1990);
    expect(payload.baseCoinsCredited).toBe(150000); // 1,500 THB * 100 🪙
    expect(payload.metadata.holiday_vip_72h_pass).toBe(true);
  });

  it('builds Wise PromptPay transfer payload for 08x/09x/+66 Thai host phone numbers and rejects invalid numbers', () => {
    const transfer = buildWisePromptPayTransferPayload({
      hostName: 'Nicha S.',
      promptPayPhone: '081-234-5678',
      amountThb: 2450.5,
      referenceId: 'payout_drop_901',
    });

    expect(transfer.endpoint).toBe('POST /v1/transfers');
    expect(transfer.recipient.type).toBe('promptpay');
    expect(transfer.recipient.details.promptpayType).toBe('PHONE');
    expect(transfer.recipient.details.phoneNumber).toBe('0812345678');
    expect(transfer.amountThb).toBe(2450.5);
    expect(transfer.estimatedSettlementSeconds).toBe(5);

    // Also normalizes +668x to 08x
    const plus66 = buildWisePromptPayTransferPayload({
      hostName: 'Ploy K.',
      promptPayPhone: '+66891112222',
      amountThb: 1200,
      referenceId: 'payout_drop_902',
    });
    expect(plus66.recipient.details.phoneNumber).toBe('0891112222');

    // Rejects landline or malformed numbers
    expect(() =>
      buildWisePromptPayTransferPayload({
        hostName: 'Invalid Host',
        promptPayPhone: '021234567',
        amountThb: 500,
        referenceId: 'payout_bad_01',
      })
    ).toThrow(/Invalid Thai PromptPay mobile number/);
  });

  it('configures BOT-licensed Local Thai Payment Firms (Opn/Omise, 2C2P, GB Prime Pay, ChillPay, PaySolutions) with honest MCC and card vs PromptPay reserve rules', () => {
    expect(Object.keys(LOCAL_THAI_PAYMENT_FIRMS)).toEqual([
      'OMISE_OPN_TH',
      'TWO_C_TWO_P_TH',
      'GB_PRIME_PAY_TH',
      'CHILLPAY_TH',
      'PAYSOLUTIONS_TH',
    ]);
    expect(LOCAL_THAI_PAYMENT_FIRMS.GB_PRIME_PAY_TH.acceptsThaiIndividualWithEcomCert).toBe(true);
    expect(LOCAL_THAI_PAYMENT_FIRMS.OMISE_OPN_TH.supportsAutomatedPromptPayPayoutApi).toBe(true);

    const promptPayCharge = buildLocalThaiPspChargePayload({
      pspId: 'OMISE_OPN_TH',
      userId: 'usr_thai_01',
      packThb: 1000,
      paymentMethod: 'PROMPTPAY_QR',
    });
    expect(promptPayCharge.botLicensed).toBe(true);
    expect(promptPayCharge.settlementReserveClass).toBe('NON_CARD_INSTANT_TH');
    expect(promptPayCharge.usdtRailEnabledInThailand).toBe(false);
    expect(promptPayCharge.webhookMetadata.card_reserve_policy).toBe('ZERO_HOLD_PROMPTPAY');

    const cardCharge = buildLocalThaiPspChargePayload({
      pspId: 'TWO_C_TWO_P_TH',
      userId: 'usr_tourist_02',
      packThb: 2500,
      paymentMethod: 'CREDIT_DEBIT_CARD_3DS',
    });
    expect(cardCharge.settlementReserveClass).toBe('CARD_INTERNATIONAL_OR_MOR');
    expect(cardCharge.webhookMetadata.card_reserve_policy).toBe(
      'HOLD_14_TO_30D_PLUS_10PCT_90D'
    );
  });

  it('registers Day-1 Indian Sole Prop (UDYAM-BR-34-0067891) payment & voucher providers without exposing secrets in client code', () => {
    expect(KRING_PRODUCTION_SERVER_IP).toBe('206.84.230.119');
    expect(KRING_UDYAM_REGISTRATION_NO).toBe('UDYAM-BR-34-0067891');
    expect(DAY1_PAYMENT_AND_VOUCHER_PROVIDERS.DODO_PAYMENTS.serverEnvVarNames.apiKeyEnv).toBe(
      'DODO_PAYMENTS_API_KEY'
    );
    expect(DAY1_PAYMENT_AND_VOUCHER_PROVIDERS.TAZAPAY_TH.workspaceOrPublicId).toBe(
      'pk_test_ioVZXXJhYzBnL2xkPlaH'
    );
    expect(DAY1_PAYMENT_AND_VOUCHER_PROVIDERS.RELOADLY_VOUCHERS.workspaceOrPublicId).toBe(
      'Cl0gXDg9hwOf0rhsBaAtPI78gK9zembl'
    );
    expect(DAY1_PAYMENT_AND_VOUCHER_PROVIDERS.ZENDIT_IDT_TH.workspaceOrPublicId).toBe(
      '6adb4905df218aef76908ebe'
    );
    expect(DAY1_PAYMENT_AND_VOUCHER_PROVIDERS.BROLEXY_UAB_TH.workspaceOrPublicId).toBe(
      '4f972cee6a5dc903df44801e5a05fb4d800cf561c9402b120566b2f691938647'
    );
    expect(DAY1_PAYMENT_AND_VOUCHER_PROVIDERS.CHIMONEY_GLOBAL.workspaceOrPublicId).toBe(
      'KRING (dash.chimoney.io)'
    );
  });

  it('builds Tazapay v3 PromptPay QR checkout payload with 0-day reserve and 100 coins/THB', () => {
    const payload = buildTazapayPromptPayCheckoutPayload({
      userId: 'usr_thai_local_88',
      customerName: 'Nong Ploy',
      customerEmail: 'ploy@kringapp.com',
      amountThb: 500,
      referenceId: 'kring_topup_88',
    });

    expect(payload.endpoint).toBe('/v3/checkout');
    expect(payload.invoice_currency).toBe('THB');
    expect(payload.amount).toBe(500);
    expect(payload.payment_methods).toEqual(['promptpay_th']);
    expect(payload.metadata.coins_credited).toBe(50_000);
    expect(payload.metadata.reserve_policy).toBe('ZERO_HOLD_PROMPTPAY');
  });

  it('builds Zendit S2S THB voucher purchase payload (฿100–฿5,000) with ฿0 host fee and positive B2B wholesale spread', () => {
    const voucher = buildZenditThbVoucherPurchasePayload({
      transactionId: 'zendit_idem_001',
      userId: 'host_bkk_19',
      brandSku: 'GRAB_TH',
      denominationThb: 250,
      wholesaleDiscountPct: 6,
      recipientEmail: 'host19@kringapp.com',
      recipientPhoneTh: '+66812345678',
    });

    expect(voucher.workspaceId).toBe('6adb4905df218aef76908ebe');
    expect(voucher.whitelistedServerIp).toBe('206.84.230.119');
    expect(voucher.body.offerId).toBe('GRAB_TH_250_THB');
    expect(voucher.body.value.amount).toBe(250);
    expect(voucher.accounting.coinsDeducted).toBe(25_000);
    expect(voucher.accounting.hostCashoutFeeThb).toBe(0);
    expect(voucher.accounting.platformWholesaleSpreadThb).toBe(15);

    expect(() =>
      buildZenditThbVoucherPurchasePayload({
        transactionId: 'zendit_idem_002',
        userId: 'host_bkk_19',
        brandSku: 'SHOPEE_TH',
        denominationThb: 50,
      })
    ).toThrow(/between ฿100 and ฿5,000/i);
  });

  it('builds Brolexy S2S order payload with exact concatenated HMAC message string (${time}${productID}${quantity})', () => {
    const order = buildBrolexyOrderRequestPayload({
      accountId: 1,
      productId: 12,
      quantity: 2,
      referenceId: 'kringBrolexyOrder001',
      unixTimeSec: 1710000000,
    });

    expect(order.endpoint).toBe('/order');
    expect(order.headers.publicKey).toBe(
      '4f972cee6a5dc903df44801e5a05fb4d800cf561c9402b120566b2f691938647'
    );
    expect(order.headers.messageToSign).toBe('1710000000122');
    expect(order.body.referenceID).toBe('kringBrolexyOrder001');
  });

  it('implements Fable Design B multi-partner Seller-of-Record routing, automatic failover, Rule 6 immutability, and Bump payout instruction', () => {
    expect(DESIGN_B_PRIORITY_THAI_SELLERS.EXPIQUE_BKK.publishedLicenceNo).toBe('14/01576');
    expect(DESIGN_B_PRIORITY_THAI_SELLERS.PATTAYA_CITY_TOUR_PTY.publishedLicenceNo).toBe('14/03236');
    expect(DESIGN_B_PRIORITY_THAI_SELLERS.BANGKOK_FOOD_TOURS_BKK.licenceType).toBe('11_GENERAL');

    // Primary healthy -> selects EXPIQUE_BKK
    const route1 = selectDesignBSellerPartnerForBooking({
      city: 'BANGKOK',
      bookingPriceThb: 1000,
      primaryHealth: {
        partnerId: 'EXPIQUE_BKK',
        licenceType: '14_INBOUND',
        daysSinceRegistryCheck: 15,
        insuranceActive: true,
        hostRecipientVerifiedInPsp: true,
        pausedByPartner: false,
        pspErrorsLast5Min: 0,
        failedTransfersLast1Hour: 0,
        currentDailyBookings: 10,
        dailyBookingCap: 50,
        currentDailyFloatThb: 20_000,
        dailyFloatCapThb: 100_000,
      },
      backupHealth: {
        partnerId: 'BANGKOK_FOOD_TOURS_BKK',
        licenceType: '11_GENERAL',
        daysSinceRegistryCheck: 10,
        insuranceActive: true,
        hostRecipientVerifiedInPsp: true,
        pausedByPartner: false,
        pspErrorsLast5Min: 0,
        failedTransfersLast1Hour: 0,
        currentDailyBookings: 5,
        dailyBookingCap: 60,
        currentDailyFloatThb: 10_000,
        dailyFloatCapThb: 120_000,
      },
    });
    expect(route1.selectedPartnerId).toBe('EXPIQUE_BKK');
    expect(route1.usedBackupFailover).toBe(false);
    expect(route1.kringHoldsFunds).toBe(false);
    expect(route1.checkoutSellerDisclosureEn).toContain('Sold by Expique Co., Ltd., TAT/DoT lic. 14/01576');

    // Primary DOWN (3 PSP errors in 5m) -> automatically fails over to BANGKOK_FOOD_TOURS_BKK
    const route2 = selectDesignBSellerPartnerForBooking({
      city: 'BANGKOK',
      bookingPriceThb: 1000,
      primaryHealth: {
        partnerId: 'EXPIQUE_BKK',
        licenceType: '14_INBOUND',
        daysSinceRegistryCheck: 15,
        insuranceActive: true,
        hostRecipientVerifiedInPsp: true,
        pausedByPartner: false,
        pspErrorsLast5Min: 3,
        failedTransfersLast1Hour: 0,
        currentDailyBookings: 10,
        dailyBookingCap: 50,
        currentDailyFloatThb: 20_000,
        dailyFloatCapThb: 100_000,
      },
      backupHealth: {
        partnerId: 'BANGKOK_FOOD_TOURS_BKK',
        licenceType: '11_GENERAL',
        daysSinceRegistryCheck: 10,
        insuranceActive: true,
        hostRecipientVerifiedInPsp: true,
        pausedByPartner: false,
        pspErrorsLast5Min: 0,
        failedTransfersLast1Hour: 0,
        currentDailyBookings: 5,
        dailyBookingCap: 60,
        currentDailyFloatThb: 10_000,
        dailyFloatCapThb: 120_000,
      },
    });
    expect(route2.selectedPartnerId).toBe('BANGKOK_FOOD_TOURS_BKK');
    expect(route2.usedBackupFailover).toBe(true);

    // Rule 6: Paid bookings cannot be moved silently across partners
    expect(() =>
      assertDesignBPaidBookingImmutableSeller({
        bookingId: 'bkg_901',
        paidToPartnerId: 'EXPIQUE_BKK',
        requestedPayoutPartnerId: 'BANGKOK_FOOD_TOURS_BKK',
      })
    ).toThrow(/Rule 6 violation/i);

    // Step 8 Bump payout instruction (80% host = ฿800, 3% WHT = ฿24, net transfer = ฿776, kringTouchesFunds = false)
    const instruction = buildDesignBBumpPayoutInstruction({
      bookingId: 'bkg_901',
      principalPartnerId: 'EXPIQUE_BKK',
      hostRecipientId: 'rcpt_opn_host_77',
      bumpTokenSignedByBothDevices: 'sig_devA_devB_valid_bump',
      retailPriceThb: 1000,
      partnerMarginPct: 5,
      kringInvoiceFeePct: 15,
    });
    expect(instruction.hostGrossShareThb).toBe(800);
    expect(instruction.withholdingTax3PctThb).toBe(24);
    expect(instruction.hostNetTransferThb).toBe(776);
    expect(instruction.partnerMarginThb).toBe(50);
    expect(instruction.kringMonthlyInvoiceFeeThb).toBe(150);
    expect(instruction.kringTouchesFunds).toBe(false);
  });

  it('verifies Kring v3.0 / v4.0 5 Cross-Border Payment Rails (+ Dodo, Brolexy, Skydo) and 20% Licensed Tour Partner Booking Fee splits (KIJSIRAVEJ, Co van Kessel, Pimdee, Silom Thai Cooking)', async () => {
    const {
      KRING_V3_FIVE_CROSS_BORDER_RAILS,
      KRING_V3_LICENSED_TOUR_PARTNERS,
      calculateKringLicensedPartnerBookingFeeSplit,
    } = await import('./chonAffiliatePartnerEngine');

    expect(Object.keys(KRING_V3_FIVE_CROSS_BORDER_RAILS)).toEqual([
      'TAZAPAY_ESCROW_PRIMARY',
      'TRANSFI_FIAT_BACKUP_1',
      'TWO_C_TWO_P_ANTOM_BACKUP_2',
      'RAPYD_APAC_BACKUP_3A',
      'NIUM_INDIA_SG_BACKUP_3B',
      'DODO_PASS_COINS_LIVE',
      'BROLEXY_VOUCHERS_LIVE',
      'SKYDO_LUT_P0802_SETTLEMENT',
    ]);

    for (const rail of Object.values(KRING_V3_FIVE_CROSS_BORDER_RAILS)) {
      expect(rail.zeroMorCompliant).toBe(true);
      expect(rail.zeroCryptoInThailand).toBe(true);
    }

    expect(KRING_V3_LICENSED_TOUR_PARTNERS.KIJSIRAVEJ_14_03556.tatLicenseNo).toBe('14/03556');
    expect(KRING_V3_LICENSED_TOUR_PARTNERS.CO_VAN_KESSEL_11_10279.tatLicenseNo).toBe('11/10279');
    expect(KRING_V3_LICENSED_TOUR_PARTNERS.PIMDEE_11_12394.tatLicenseNo).toBe('11/12394');

    const kijsiravejSplit = calculateKringLicensedPartnerBookingFeeSplit({
      partnerId: 'KIJSIRAVEJ_14_03556',
      totalPackagePriceThb: 1200,
    });
    expect(kijsiravejSplit.payNowToKringThb).toBe(240);
    expect(kijsiravejSplit.payAtVenueDirectThb).toBe(960);
    expect(kijsiravejSplit.disclosureEn).toBe(
      'Pay 20% booking fee now to Kring · rest at the venue'
    );
    expect(kijsiravejSplit.exampleSummaryEn).toBe(
      'Pay ฿240 now to Kring · ฿960 at the venue'
    );
  });

  it('wires official Dodo Payments Antigravity plugin spec (providers/antigravity: Checkout Sessions, Static Payment Links, Standard Webhooks & MCP serverUrl)', async () => {
    const {
      DODO_ANTIGRAVITY_MCP_SERVERS,
      resolveDodoPaymentsEnvironment,
      buildDodoCheckoutSessionRequest,
      buildDodoStaticPaymentLink,
      verifyAndParseDodoStandardWebhook,
    } = await import('./chonAffiliatePartnerEngine');

    // 1. MCP Server config uses serverUrl per providers/antigravity/mcp_config.json
    expect(DODO_ANTIGRAVITY_MCP_SERVERS['dodopayments-api'].serverUrl).toBe(
      'https://mcp.dodopayments.com/mcp'
    );
    expect(DODO_ANTIGRAVITY_MCP_SERVERS['dodo-knowledge'].serverUrl).toBe(
      'https://knowledge.dodopayments.com/mcp'
    );

    // 2. Environment defaults safely to test_mode and never uses api.dodopayments.com
    const defaultEnv = resolveDodoPaymentsEnvironment(undefined, 'dodo_test_abc123');
    expect(defaultEnv.environment).toBe('test_mode');
    expect(defaultEnv.apiBaseUrl).toBe('https://test.dodopayments.com');
    expect(defaultEnv.staticCheckoutHostUrl).toBe('https://test.checkout.dodopayments.com');
    expect(defaultEnv.keyMatchesEnvironment).toBe(true);

    const liveEnv = resolveDodoPaymentsEnvironment('live_mode', 'dodo_live_xyz789');
    expect(liveEnv.environment).toBe('live_mode');
    expect(liveEnv.apiBaseUrl).toBe('https://live.dodopayments.com');
    expect(liveEnv.staticCheckoutHostUrl).toBe('https://checkout.dodopayments.com');
    expect(liveEnv.keyMatchesEnvironment).toBe(true);

    // 3. Checkout Session Request (client.checkoutSessions.create)
    const sessionReq = buildDodoCheckoutSessionRequest({
      productId: 'pdt_kring_song_wat_walk',
      quantity: 1,
      customerEmail: 'arjun@mumbai.in',
      customerName: 'Arjun Sharma',
      bookingId: 'bk_001',
      activityId: 'act_song_wat',
      hostId: 'host_ploy',
      activityFeeThb: 950,
      billingCurrency: 'THB',
      discountCodes: ['KRINGWELCOME'],
    });
    expect(sessionReq.product_cart).toEqual([{ product_id: 'pdt_kring_song_wat_walk', quantity: 1 }]);
    expect(sessionReq.return_url).toBe('https://kringapp.com/checkout/success');
    expect(sessionReq.metadata.activity_fee_thb).toBe('950');
    expect(sessionReq.metadata.service_fee_thb).toBe('25');
    expect(sessionReq.metadata.total_charged_thb).toBe('975');
    expect(sessionReq.metadata.purpose_code).toBe('P0802');
    expect(sessionReq.feature_flags?.allow_discount_code).toBe(true);

    // 4. Static Payment Link (test vs live host)
    const testLink = buildDodoStaticPaymentLink({
      productId: 'pdt_kring_song_wat_walk',
      environment: 'test_mode',
      email: 'arjun@mumbai.in',
      paymentCurrency: 'THB',
      metadata: { bookingId: 'bk_001', serviceFeeThb: 25 },
    });
    expect(testLink).toContain('https://test.checkout.dodopayments.com/buy/pdt_kring_song_wat_walk?');
    expect(testLink).toContain('metadata_bookingId=bk_001');
    expect(testLink).toContain('metadata_serviceFeeThb=25');

    // 5. Standard Webhooks verification on raw body + webhook-id idempotency
    const seenIds = new Set<string>();
    const rawBody = JSON.stringify({
      business_id: 'bus_kring_01',
      type: 'payment.succeeded',
      timestamp: '2026-10-25T05:00:00Z',
      data: {
        payload_type: 'Payment',
        payment_id: 'pay_dodo_999',
        status: 'succeeded',
        total_amount: 97500,
        currency: 'THB',
        metadata: { booking_id: 'bk_001', service_fee_thb: '25' },
      },
    });

    const firstVerify = verifyAndParseDodoStandardWebhook({
      rawBody,
      headers: {
        'webhook-id': 'evt_dodo_001',
        'webhook-signature': 'v1,valid_base64_sig',
        'webhook-timestamp': '1792904400',
      },
      expectedSignature: 'v1,valid_base64_sig',
      seenWebhookIds: seenIds,
      nowUnixSeconds: 1792904410,
    });
    expect(firstVerify.verified).toBe(true);
    expect(firstVerify.duplicate).toBe(false);
    expect(firstVerify.event?.type).toBe('payment.succeeded');
    expect(firstVerify.event?.data.payment_id).toBe('pay_dodo_999');

    // Duplicate delivery with same webhook-id is skipped idempotently
    const secondVerify = verifyAndParseDodoStandardWebhook({
      rawBody,
      headers: {
        'webhook-id': 'evt_dodo_001',
        'webhook-signature': 'v1,valid_base64_sig',
        'webhook-timestamp': '1792904400',
      },
      expectedSignature: 'v1,valid_base64_sig',
      seenWebhookIds: seenIds,
      nowUnixSeconds: 1792904415,
    });
    expect(secondVerify.verified).toBe(true);
    expect(secondVerify.duplicate).toBe(true);
    expect(secondVerify.event).toBeNull();
  });

  it('wires server-side iApp Technology Thai Host <30s eKYC helper (IAPP_API_KEY, PDPA consent, 20+ age gate, zero VITE_ exposure)', async () => {
    const {
      IAPP_THAI_ID_OCR_V35_ENDPOINT,
      IAPP_FACE_COMPARISON_V2_ENDPOINT,
      buildIAppThaiHostEkycRequest,
    } = await import('./chonAffiliatePartnerEngine');

    const ocrReq = buildIAppThaiHostEkycRequest({
      serverEnv: { IAPP_API_KEY: 'iapp_server_only_secret_key_74chars_placeholder' },
      hostId: 'host_ploy_01',
      pdpaConsent: true,
      declaredAgeYears: 23,
      promptPayDisplayName: '  Ploy   Srisuwan ',
      checkType: 'THAI_ID_OCR_FRONT',
    });
    expect(ocrReq.endpointUrl).toBe(IAPP_THAI_ID_OCR_V35_ENDPOINT);
    expect(ocrReq.headers.apikey.length).toBeGreaterThanOrEqual(16);
    expect(ocrReq.headers['X-Kring-Pdpa-Retention']).toBe('MAX_1_YEAR_OR_IMMEDIATE_ON_DELETE');
    expect(ocrReq.pdpaCompliant).toBe(true);
    expect(ocrReq.zeroClientKeyExposure).toBe(true);
    expect(ocrReq.promptPayNameNormalized).toBe('Ploy Srisuwan');

    const faceReq = buildIAppThaiHostEkycRequest({
      serverEnv: { IAPP_API_KEY_DEFAULT: 'iapp_fallback_server_secret_key_74chars' },
      hostId: 'host_ploy_01',
      pdpaConsent: true,
      declaredAgeYears: 20,
      promptPayDisplayName: 'Ploy Srisuwan',
      checkType: 'FACE_AND_LIVENESS_MATCH',
    });
    expect(faceReq.endpointUrl).toBe(IAPP_FACE_COMPARISON_V2_ENDPOINT);

    // Rejects VITE_ client env exposure, unchecked PDPA consent, or <20 age
    expect(() =>
      buildIAppThaiHostEkycRequest({
        serverEnv: {
          IAPP_API_KEY: 'iapp_server_only_secret_key_74chars_placeholder',
          VITE_IAPP_API_KEY: 'leaked_to_client',
        },
        hostId: 'host_ploy_01',
        pdpaConsent: true,
        declaredAgeYears: 22,
        promptPayDisplayName: 'Ploy Srisuwan',
        checkType: 'THAI_ID_OCR_FRONT',
      })
    ).toThrow(/SECURITY_VIOLATION/);

    expect(() =>
      buildIAppThaiHostEkycRequest({
        serverEnv: { IAPP_API_KEY: 'iapp_server_only_secret_key_74chars_placeholder' },
        hostId: 'host_ploy_01',
        pdpaConsent: false,
        declaredAgeYears: 22,
        promptPayDisplayName: 'Ploy Srisuwan',
        checkType: 'THAI_ID_OCR_FRONT',
      })
    ).toThrow(/PDPA_CONSENT_REQUIRED/);
  });
});
