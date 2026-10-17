import { z } from '@hono/zod-openapi';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { PAYOFF_ACCOUNT_STATUS, PAYOFF_METHOD } from '../../lib/constants/payoff.ts';
import { DEBT_KIND, MAX_ANNUAL_INTEREST_RATE } from '../../lib/constants/profile.ts';

const rupiah = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const methodSchema = z.enum(enumValues(PAYOFF_METHOD));

export const createPlanBodySchema = z
  .object({ method: methodSchema, extraPayment: rupiah.default(0) })
  .openapi('CreatePayoffPlan');

export const setFocusBodySchema = z.object({ focusDebtId: z.uuid() }).openapi('SetPayoffFocus');

export const debtParamsSchema = z.object({ id: z.uuid() });

export const paymentBodySchema = z
  .object({ amount: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) })
  .openapi('RecordDebtPayment');

const accountSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(enumValues(DEBT_KIND)),
    name: z.string(),
    remaining: rupiah,
    original: rupiah,
    /** Paid so far over the balance when the account was added, 0 to 100. */
    progressPercent: z.number().int().min(0).max(100),
    monthlyInstalment: rupiah,
    annualInterestRate: z.number().min(0).max(MAX_ANNUAL_INTEREST_RATE).nullable(),
    dueDay: z.number().int().min(1).max(31).nullable(),
    /** Sedang dilunasi, Berikutnya or Jalan terus. */
    status: z.enum(enumValues(PAYOFF_ACCOUNT_STATUS)),
    /**
     * The month it is paid off (`YYYY-MM`, WIB) under the plan; for Jalan terus debt, when its own
     * instalments finish. Null when the engine finds no month in time.
     */
    payoffMonth: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .nullable(),
    /** The due date of that last payment (`YYYY-MM-DD`, WIB); null without a due day. */
    payoffDate: z.iso.date().nullable(),
    /** For Berikutnya: the month the plan's extra reaches it (`YYYY-MM`); null otherwise. */
    startMonth: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .nullable(),
  })
  .openapi('PayoffPlanAccount');

const nextPaymentSchema = z
  .object({
    debtId: z.uuid(),
    name: z.string(),
    /** What to pay this time: `instalment` + `extra`. */
    amount: rupiah,
    /** The account's instalment, or what is left when that is less (Cicilan). */
    instalment: rupiah,
    /** The plan's extra payment, as much of it as the account still needs (Tambahan). */
    extra: rupiah,
    /** The next due date (`YYYY-MM-DD`, WIB); null when the account has no due day. */
    dueDate: z.iso.date().nullable(),
    daysLeft: z.number().int().min(0).nullable(),
  })
  .openapi('PayoffNextPayment');

export const activePlanSchema = z
  .object({
    id: z.uuid(),
    method: methodSchema,
    extraPayment: rupiah,
    startedAt: z.iso.datetime(),
    /** The consumer accounts in the plan's order, then the debts the plan leaves alone. */
    accounts: z.array(accountSchema),
    nextPayment: nextPaymentSchema.nullable(),
  })
  .openapi('PayoffActivePlan');

const scoreEstimateSchema = z
  .object({
    before: z.number().int(),
    after: z.number().int(),
    consumerDebtBefore: z.number().int(),
    consumerDebtAfter: z.number().int(),
  })
  .openapi('PayoffScoreEstimate');

export const paymentResultSchema = z
  .object({
    debtId: z.uuid(),
    paid: rupiah,
    remaining: rupiah,
    progressPercent: z.number().int().min(0).max(100),
    /** True only for the payment that settled the account: show the celebration once. */
    paidOff: z.boolean(),
    /** The account the plan moves to next; null when the plan has no other account (or no plan). */
    nextAccount: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    /** The score the engine expects once this account is gone; null unless the account was paid off. */
    scoreEstimate: scoreEstimateSchema.nullable(),
  })
  .openapi('DebtPaymentResult');

export type CreatePlanBody = z.infer<typeof createPlanBodySchema>;
export type ActivePlan = z.infer<typeof activePlanSchema>;
export type PaymentResult = z.infer<typeof paymentResultSchema>;
