import { z } from '@hono/zod-openapi';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { PAYOFF_METHOD } from '../../lib/constants/payoff.ts';
import { DEBT_KIND, MAX_ANNUAL_INTEREST_RATE } from '../../lib/constants/profile.ts';

const rupiah = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const methodSchema = z.enum(enumValues(PAYOFF_METHOD));
const month = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .openapi({ example: '2027-03' });

export const simulatePayoffBodySchema = z
  .object({
    method: methodSchema,
    /** Rupiah a month on top of the instalments; 0 when the person adds nothing. */
    extraPayment: rupiah.default(0),
  })
  .openapi('SimulatePayoff');

const accountSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(enumValues(DEBT_KIND)),
    name: z.string(),
    remaining: rupiah,
    monthlyInstalment: rupiah,
    annualInterestRate: z.number().min(0).max(MAX_ANNUAL_INTEREST_RATE).nullable(),
    dueDay: z.number().int().min(1).max(31).nullable(),
    /** 1 for the account the plan pays first. */
    position: z.number().int().min(1),
    /** Months from this one until it is paid off, this month counted as 1; null when it never is. */
    months: z.number().int().min(1).nullable(),
    /** The month it is paid off (`YYYY-MM`, WIB); null when it never is. */
    payoffMonth: month.nullable(),
    /** The due date of its last payment (`YYYY-MM-DD`, WIB); null without a due day. */
    payoffDate: z.iso.date().nullable(),
    /** What it costs in interest until then, in whole rupiah; null when it never is paid off. */
    interest: rupiah.nullable(),
  })
  .openapi('PayoffAccount');

const productiveSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(enumValues(DEBT_KIND)),
    name: z.string(),
    remaining: rupiah,
    monthlyInstalment: rupiah,
    /** When its own instalments finish (`YYYY-MM`); null when they never do in time. */
    payoffMonth: month.nullable(),
    /** The due date of that last instalment (`YYYY-MM-DD`); null without a due day. */
    payoffDate: z.iso.date().nullable(),
  })
  .openapi('PayoffProductiveDebt');

const comparisonSchema = z
  .object({
    otherMethod: methodSchema,
    /** The interest this method saves against the other; negative when the other costs less. */
    interestSaved: z.number().int().nullable(),
    /** Months later the other method pays off its first account (negative when it is sooner). */
    firstPayoffMonthsLater: z.number().int().nullable(),
  })
  .openapi('PayoffComparison');

export const payoffPlanSchema = z
  .object({
    method: methodSchema,
    extraPayment: rupiah,
    /** The most the extra payment may be: the money left in this payday period. */
    maxExtraPayment: rupiah,
    /** What the plan pays each month: every consumer-debt instalment plus the extra payment. */
    monthlyBudget: rupiah,
    /** True when an account has no interest rate, which the plan counts as 0%. */
    hasUnknownRate: z.boolean(),
    accounts: z.array(accountSchema),
    /** Mortgages, vehicle and family loans stay out of the plan. */
    productive: z.array(productiveSchema),
    totalInterest: rupiah.nullable(),
    allPaidMonths: z.number().int().min(1).nullable(),
    allPaidMonth: month.nullable(),
    comparison: comparisonSchema.nullable(),
  })
  .openapi('PayoffPlan');

export type SimulatePayoffBody = z.infer<typeof simulatePayoffBodySchema>;
export type PayoffPlan = z.infer<typeof payoffPlanSchema>;
