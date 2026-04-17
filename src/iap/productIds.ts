/**
 * Consumable product IDs — must match App Store Connect + Google Play Console
 * and `IAP_PRODUCT_CREDITS_JSON` on your sync server (same keys).
 */
export const GUIDANCE_CREDIT_PACKS = [
  { sku: 'com.aperture.mobile.credits_10', credits: 10 },
  { sku: 'com.aperture.mobile.credits_25', credits: 25 },
  { sku: 'com.aperture.mobile.credits_60', credits: 60 },
] as const;

export const GUIDANCE_IAP_SKUS = GUIDANCE_CREDIT_PACKS.map((p) => p.sku);
