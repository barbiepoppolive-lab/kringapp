/**
 * Kring Dodo Payments Catalog Configuration (Rail 5 — Zero Local Thai MoR)
 * Provisioned on Dodo Business: bus_0NqTx66opKbSWMslrJNEa ("Kring App" · DODOPAY_KRINGAPP)
 * Environment: test_mode (https://test.dodopayments.com)
 *
 * Security Note: Never expose DODO_PAYMENTS_API_KEY or DODO_PAYMENTS_WEBHOOK_KEY in client code.
 * Client components only reference public product_id (pdt_*) identifiers and server-created checkout_url sessions.
 */

export type KringDodoProductSku =
  | 'KRING_EXPERIENCE_PASS_750'
  | 'KRING_EXPERIENCE_PASS_1200'
  | 'KRING_EXPERIENCE_PASS_1600'
  | 'KRING_B2B_VENUE_PIN_1990_MO'
  | 'KRING_B2B_FEATURED_SLOT_3990_MO'
  | 'KRING_DEAL_VOUCHER_PACK';

export interface KringDodoProductConfig {
  sku: KringDodoProductSku;
  productId: string;
  name: string;
  billingModel: 'one_time_price' | 'recurring_price';
  taxCategory: 'digital_products' | 'saas';
  usdCents: number;
  thbBaseAmount: number;
  thbServiceFee: number;
  thbTotalAmount: number;
  inrApproxAmount: number;
  trialPeriodDays?: number;
}

export const KRING_DODO_BUSINESS_ID = 'bus_0NqTx66opKbSWMslrJNEa' as const;
export const KRING_DODO_STATEMENT_DESCRIPTOR = 'DODOPAY_KRINGAPP' as const;
export const KRING_DODO_WEBHOOK_ENDPOINT = 'https://kringapp.com/api/webhooks/dodo' as const;
export const KRING_DODO_WEBHOOK_ID = 'ep_3LAmniNLWlNh4N0NfJNSyvgawN9' as const;
export const KRING_DODO_TEST_CHECKOUT_URL = 'https://test.checkout.dodopayments.com/session/cks_0NqU0YxPlcAm3L0vwMCPt' as const;
export const KRING_DODO_TEST_SESSION_ID = 'cks_0NqU0YxPlcAm3L0vwMCPt' as const;

export const KRING_DODO_CATALOG: Record<KringDodoProductSku, KringDodoProductConfig> = {
  KRING_EXPERIENCE_PASS_750: {
    sku: 'KRING_EXPERIENCE_PASS_750',
    productId: 'pdt_0NqU0YTgQV6SlWgiYuzBi',
    name: 'Kring Local Experience Booking Pass (฿750 + ฿25 Fee)',
    billingModel: 'one_time_price',
    taxCategory: 'digital_products',
    usdCents: 2299,
    thbBaseAmount: 750,
    thbServiceFee: 25,
    thbTotalAmount: 775,
    inrApproxAmount: 1950,
  },
  KRING_EXPERIENCE_PASS_1200: {
    sku: 'KRING_EXPERIENCE_PASS_1200',
    productId: 'pdt_0NqU0YXtp22QEzxcTqn76',
    name: 'Kring Golden-Hour & Food Walk Booking Pass (฿1,200 + ฿25 Fee)',
    billingModel: 'one_time_price',
    taxCategory: 'digital_products',
    usdCents: 3599,
    thbBaseAmount: 1200,
    thbServiceFee: 25,
    thbTotalAmount: 1225,
    inrApproxAmount: 3090,
  },
  KRING_EXPERIENCE_PASS_1600: {
    sku: 'KRING_EXPERIENCE_PASS_1600',
    productId: 'pdt_0NqU0YbOcrbkdhD8PWvqg',
    name: 'Kring Rooftop & Night Market Experience Pass (฿1,600 + ฿25 Fee)',
    billingModel: 'one_time_price',
    taxCategory: 'digital_products',
    usdCents: 4799,
    thbBaseAmount: 1600,
    thbServiceFee: 25,
    thbTotalAmount: 1625,
    inrApproxAmount: 4090,
  },
  KRING_B2B_VENUE_PIN_1990_MO: {
    sku: 'KRING_B2B_VENUE_PIN_1990_MO',
    productId: 'pdt_0NqU0YfwRAmkE1B9Rk0ZQ',
    name: 'Kring Verified Safe Meeting Point Pin (฿1,990/mo · 30-Day Free Trial)',
    billingModel: 'recurring_price',
    taxCategory: 'saas',
    usdCents: 5899,
    thbBaseAmount: 1990,
    thbServiceFee: 0,
    thbTotalAmount: 1990,
    inrApproxAmount: 4990,
    trialPeriodDays: 30,
  },
  KRING_B2B_FEATURED_SLOT_3990_MO: {
    sku: 'KRING_B2B_FEATURED_SLOT_3990_MO',
    productId: 'pdt_0NqU0YjuhmvXSInm5b26a',
    name: 'Kring #1 Featured Tourist Deal Slot (฿3,990/mo)',
    billingModel: 'recurring_price',
    taxCategory: 'saas',
    usdCents: 11799,
    thbBaseAmount: 3990,
    thbServiceFee: 0,
    thbTotalAmount: 3990,
    inrApproxAmount: 9990,
  },
  KRING_DEAL_VOUCHER_PACK: {
    sku: 'KRING_DEAL_VOUCHER_PACK',
    productId: 'pdt_0NqU0YmU5U995FcTifFZR',
    name: 'Kring Instant Gold-Foil QR Tourist Deal Voucher',
    billingModel: 'one_time_price',
    taxCategory: 'digital_products',
    usdCents: 2999,
    thbBaseAmount: 1000,
    thbServiceFee: 0,
    thbTotalAmount: 1000,
    inrApproxAmount: 2499,
  },
};

export function getDodoProductByThbTier(thbBaseAmount: number): KringDodoProductConfig {
  if (thbBaseAmount >= 1600) return KRING_DODO_CATALOG.KRING_EXPERIENCE_PASS_1600;
  if (thbBaseAmount >= 1200) return KRING_DODO_CATALOG.KRING_EXPERIENCE_PASS_1200;
  return KRING_DODO_CATALOG.KRING_EXPERIENCE_PASS_750;
}
