/**
 * The three Beranda layouts: first steps for a person with no transaction yet (BRD-02), the
 * overview (BRD-01) and the debt plan for the Keluar dari Utang focus (BRD-03).
 */
export const HOME_VARIANT = {
  firstSteps: 'first_steps',
  overview: 'overview',
  debtPlan: 'debt_plan',
} as const;

/** Target mikro (BRD-03): a week of essential spending first, then a month. */
export const MICRO_TARGET = {
  oneWeek: 'one_week',
  oneMonth: 'one_month',
} as const;
