/**
 * Rencana (Flow 6, REN): the goals a person saves for, the four steps of Tangga Keuanganmu, the
 * risk profiles of Kenali Profil Risikomu and the emergency fund's milestones. The app turns each
 * into its Indonesian words; a word another vocabulary already owns is spelled from there (one
 * home per identifier).
 */

import { COMMUNITY_REPORT_REASON } from './community.ts';
import { MICRO_TARGET } from './home.ts';
import { EXPENSE_CATEGORY } from './money.ts';
import { DEBT_KIND } from './profile.ts';
import { INDICATOR, STEP_KIND } from './score.ts';

/** Tujuan Baru's kinds, in the board's order; one emergency fund per person. */
export const GOAL_KIND = {
  emergencyFund: INDICATOR.emergencyFund,
  houseDp: 'house_dp',
  education: EXPENSE_CATEGORY.education,
  wedding: 'wedding',
  retirement: 'retirement',
  vehicle: DEBT_KIND.vehicle,
  goods: 'goods',
  other: COMMUNITY_REPORT_REASON.other,
} as const;

/** Tangga Keuanganmu: utang mahal, dana darurat, proteksi, investasi. */
export const PLAN_LADDER_STEP = {
  payOffDebt: STEP_KIND.payOffDebt,
  emergencyFund: INDICATOR.emergencyFund,
  protection: 'protection',
  invest: 'invest',
} as const;

/** Where a step stands: Sudah Aman, Sedang Berjalan, or still ahead. */
export const LADDER_STATUS = {
  done: 'done',
  current: 'current',
  todo: 'todo',
} as const;

/** Hasil Risiko's three profiles. */
export const RISK_PROFILE = {
  conservative: 'conservative',
  moderate: 'moderate',
  aggressive: 'aggressive',
} as const;

/** Kenali Profil Risikomu: five questions of four options, answered by 0-based index. */
export const RISK_QUESTION_COUNT = 5;
export const RISK_OPTION_COUNT = 4;

/** The emergency fund's milestones: 1 minggu, 1 bulan, 3× and the target. */
export const EMERGENCY_MILESTONE = {
  oneWeek: MICRO_TARGET.oneWeek,
  oneMonth: MICRO_TARGET.oneMonth,
  threeMonths: 'three_months',
  target: 'target',
} as const;

/** "Nama Tujuan": at most this many characters. */
export const GOAL_NAME_MAX = 60;

/** Any rupiah amount of a goal or a deposit: Rp999.999.999.999 at most. */
export const GOAL_AMOUNT_MAX = 999_999_999_999;
