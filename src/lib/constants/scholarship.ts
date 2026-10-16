/**
 * Beasiswa Kira (AKN-09, AKN-10): the situations a person can name and the states of an
 * application. Kira Plus free for three months, extendable to six, for Mode Darurat Utang users,
 * funded by Traktir Kira.
 */

/** Apa yang Sedang Kamu Hadapi? */
export const SCHOLARSHIP_SITUATION = {
  instalmentsPilingUp: 'instalments_piling_up',
  chasedByLender: 'chased_by_lender',
  incomeStopped: 'income_stopped',
  medicalCosts: 'medical_costs',
  otherHardship: 'other_hardship',
} as const;

export const APPLICATION_STATUS = {
  inReview: 'in_review',
  waitlisted: 'waitlisted',
  accepted: 'accepted',
  withdrawn: 'withdrawn',
} as const;

/** Why Ajukan Beasiswa is closed (Syarat on BeasiswaKira). */
export const INELIGIBLE_REASON = {
  hasPaidPlan: 'has_paid_plan',
  hasScholarship: 'has_scholarship',
  hasOpenApplication: 'has_open_application',
  /** Beasiswa Kira is for people who have opened Mode Darurat Utang (AKN-09 Syarat). */
  debtEmergencyNotUsed: 'debt_emergency_not_used',
} as const;

/** Ajukan Beasiswa's story, at most, in characters (grapheme clusters). */
export const SCHOLARSHIP_STORY_MAX = 1000;

/** The partial unique index that allows one open (in review or waitlisted) application a person. */
export const OPEN_APPLICATION_INDEX = 'scholarship_applications_one_open_idx';
