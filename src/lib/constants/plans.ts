/**
 * Kira's plans (AKN-06): their ids, billing periods, payment methods and the subscription states,
 * plus the one table of prices and monthly quotas every module reads. Prices are whole rupiah;
 * yearly is ten months' price for twelve (owner decision, 2026-10-16).
 */

export const PLAN = {
  free: 'free',
  young: 'young',
  plus: 'plus',
} as const;

export const BILLING_PERIOD = {
  monthly: 'monthly',
  yearly: 'yearly',
} as const;

export const PAYMENT_METHOD = {
  qris: 'qris',
  appStore: 'app_store',
} as const;

/** A subscription is bought, or granted through Beasiswa Kira. */
export const SUBSCRIPTION_SOURCE = {
  purchase: 'purchase',
  scholarship: 'scholarship',
} as const;

export const SUBSCRIPTION_STATUS = {
  active: 'active',
  ended: 'ended',
} as const;

type PlanTerms = {
  monthlyPrice: number;
  yearlyPrice: number;
  aiMessages: number;
  receipts: number;
  /** Seconds of voice input a month; only Kira Plus has any. */
  voiceSeconds: number;
  /** Input suara dan impor mutasi (Paket: Kira Plus). */
  voiceAndImport: boolean;
};

/** Paket and PaketTahunan: Gratis 30/10, Muda 100/40, Plus 300/150 and 3 hours of voice. */
export const PLAN_TERMS: Readonly<Record<(typeof PLAN)[keyof typeof PLAN], PlanTerms>> = {
  free: {
    monthlyPrice: 0,
    yearlyPrice: 0,
    aiMessages: 30,
    receipts: 10,
    voiceSeconds: 0,
    voiceAndImport: false,
  },
  young: {
    monthlyPrice: 15_000,
    yearlyPrice: 150_000,
    aiMessages: 100,
    receipts: 40,
    voiceSeconds: 0,
    voiceAndImport: false,
  },
  plus: {
    monthlyPrice: 29_000,
    yearlyPrice: 290_000,
    aiMessages: 300,
    receipts: 150,
    voiceSeconds: 3 * 60 * 60,
    voiceAndImport: true,
  },
};
