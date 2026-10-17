/**
 * The words of a person's financial profile, from the health-check quiz (ONB-09 to ONB-12): what
 * they want to fix first, their marital status, the protections they hold and the kinds of debt
 * they carry. The database enums, the request schemas and the score engine all spell them from
 * here.
 */

/** Pilih Fokus (ONB-09): which Beranda a person starts on. */
export const FOCUS = {
  trackSpending: 'track_spending',
  debtFree: 'debt_free',
} as const;

/** Status Pernikahan (ONB-12): sets the emergency-fund target, 6× single and 9× married. */
export const MARITAL_STATUS = {
  single: 'single',
  married: 'married',
} as const;

/**
 * Perlindungan yang Kamu Punya (ONB-12). The protection indicator counts health cover (BPJS
 * Kesehatan or private health insurance) and income cover (BPJS Ketenagakerjaan or life insurance).
 */
export const PROTECTION = {
  bpjsHealth: 'bpjs_health',
  bpjsEmployment: 'bpjs_employment',
  lifeInsurance: 'life_insurance',
  privateHealth: 'private_health',
} as const;

/**
 * Jenis utang (ONB-11). Paylater, online loans and credit cards are consumer debt; a vehicle
 * instalment, a mortgage and a family loan are not (DetailIndikatorKonsumtif: "Cicilan motor
 * termasuk utang produktif").
 */
export const DEBT_KIND = {
  paylater: 'paylater',
  onlineLoan: 'online_loan',
  creditCard: 'credit_card',
  vehicle: 'vehicle',
  mortgage: 'mortgage',
  familyLoan: 'family_loan',
} as const;

/** Whether a debt account is paid on time; the consumer-debt indicator reads it. */
export const DEBT_PAYMENT_STATUS = {
  onTime: 'on_time',
  late: 'late',
  overdue: 'overdue',
} as const;

/**
 * The highest annual interest rate a debt account may carry, in percent. Online loans are the
 * dearest, near 110% a year at the regulator's daily cap; anything above this is a typing slip.
 */
export const MAX_ANNUAL_INTEREST_RATE = 300;
