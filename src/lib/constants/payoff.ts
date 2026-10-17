/**
 * The words of a debt payoff plan (SKR-03 Rencana Pelunasan): the two orders a plan can follow, and
 * how far a simulation looks ahead. The request schema, the engine and the response all spell them
 * from here.
 */

/** Snowball pays the smallest balance first; avalanche pays the highest interest rate first. */
export const PAYOFF_METHOD = {
  snowball: 'snowball',
  avalanche: 'avalanche',
} as const;

/** A simulation stops after this many months (the tenor ceiling of a debt account, 50 years). */
export const MAX_PAYOFF_MONTHS = 600;

/** The tag of an account on Rencanaku: Sedang dilunasi, Berikutnya, Jalan terus. */
export const PAYOFF_ACCOUNT_STATUS = {
  inProgress: 'in_progress',
  next: 'next',
  ongoing: 'ongoing',
} as const;
