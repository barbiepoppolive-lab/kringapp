/**
 * Kring brand constants (founder-approved rename Chonn! → Kring, 21 Oct). Internal ids/storage keys keep "chon".
 * Store name "Kring · Bangkok Locals"; Thai กริ๊ง. Words and microcopy live in src/lib/lexicon.ts.
 */
export const BRAND_NAME = 'Kring'
export const BRAND_NAME_TH = 'กริ๊ง'
export const BRAND_STORE_NAME = 'Kring · Bangkok Locals'
export const BRAND_TAGLINE = { en: 'Real locals. Fair prices.', th: 'เที่ยวกับโลคอลตัวจริง ในราคากันเอง', zh: '真本地人 · 公道价' }
export const BRAND_SIGNOFF = { en: "Kring! Let's Go!", th: 'แตะกริ๊ง! ไปกันเลย!', zh: 'Kring! 走起!' }
/** Anchan & Marigold — mirrors src/design/tokens.json (night theme) for places that cannot read CSS vars (canvas, meta). */
export const BRAND_COLORS = {
  anchan: '#3446FF',
  anchanNeon: '#7381FF',
  anchanLime: '#9B5CFF',
  marigold: '#FFB21E',
  jasmine: '#FFF6E6',
  night: '#0A0B1E',
  tourist: '#FF2A40',
} as const
