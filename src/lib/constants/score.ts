/**
 * The Kira Score's vocabulary: the three bands, the six indicators and their three groups, and the
 * kinds of step the engine recommends. The engine, the score tables and the API schemas share
 * these spellings; the app turns each into its Indonesian words.
 */

import { BILLING_PERIOD } from './plans.ts';

/** Rentan 0–39, Bertahan 40–79, Sehat 80–100. */
export const SCORE_BAND = {
  vulnerable: 'vulnerable',
  coping: 'coping',
  healthy: 'healthy',
} as const;

export const INDICATOR = {
  emergencyFund: 'emergency_fund',
  savingsRatio: 'savings_ratio',
  instalmentRatio: 'instalment_ratio',
  consumerDebt: 'consumer_debt',
  debtToAsset: 'debt_to_asset',
  protection: 'protection_cover',
} as const;

/** The three sub-scores of HasilCekAwal: Tabung, Utang, Lindungi. */
export const INDICATOR_GROUP = {
  save: 'save_group',
  debt: 'debt_group',
  protect: 'protect_group',
} as const;

/** A priority step (Tiga Langkah Prioritas, Langkah Berikutnya on Beranda). */
export const STEP_KIND = {
  payOffDebt: 'pay_off_debt',
  seekRelief: 'seek_relief',
  buildEmergencyFund: 'build_emergency_fund',
  addProtection: 'add_protection',
  raiseSavings: 'raise_savings',
  lowerInstalments: 'lower_instalments',
  lowerDebtToAsset: 'lower_debt_to_asset',
} as const;

/** Why a score snapshot was taken. */
export const SNAPSHOT_REASON = {
  healthCheck: 'health_check',
  recompute: 'recompute',
  /**
   * Riwayat Kira Score's monthly point, taken on the 25th (WIB). The word is the billing period's
   * (one home per identifier); the two enums only share its spelling.
   */
  monthly: BILLING_PERIOD.monthly,
} as const;

/** The day of the month (WIB) Riwayat Kira Score takes its monthly snapshot. */
export const MONTHLY_SNAPSHOT_DAY = 25;

/** Riwayat Kira Score's two ranges: 6 Bulan and 1 Tahun, in months. */
export const SCORE_HISTORY_RANGE = {
  sixMonths: '6m',
  oneYear: '1y',
} as const;
