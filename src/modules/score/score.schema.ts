import { z } from '@hono/zod-openapi';
import { enumValues } from '../../lib/constants/enum-values.ts';
import {
  DEBT_KIND,
  MARITAL_STATUS,
  MAX_ANNUAL_INTEREST_RATE,
  PROTECTION,
} from '../../lib/constants/profile.ts';
import {
  INDICATOR,
  INDICATOR_GROUP,
  SCORE_BAND,
  SCORE_HISTORY_RANGE,
  STEP_KIND,
} from '../../lib/constants/score.ts';

const rupiah = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
/** A skipped answer: the app leaves the key out, which reads as null. */
const optionalRupiah = rupiah.nullable().default(null);
const date = z.iso.date().openapi({ example: '2026-10-25' });

const paydaySchema = z
  .object({
    day: z.number().int().min(1).max(31).nullable().default(null),
    endOfMonth: z.boolean(),
  })
  .openapi('Payday');

const debtSchema = z
  .object({
    kind: z.enum(enumValues(DEBT_KIND)),
    name: z.string().trim().min(1).max(60),
    remaining: rupiah,
    monthlyInstalment: rupiah,
    remainingTenorMonths: z.number().int().min(0).max(600).nullable().default(null),
    /** Bunga per tahun in percent, as the lender states it; the app leaves it out when unknown. */
    annualInterestRate: z.number().min(0).max(MAX_ANNUAL_INTEREST_RATE).nullable().default(null),
    /** Tanggal jatuh tempo, the day of the month; the app leaves it out when unknown. */
    dueDay: z.number().int().min(1).max(31).nullable().default(null),
  })
  .openapi('HealthCheckDebt');

/** The six quiz steps' answers; a skipped amount is null. */
export const healthCheckBodySchema = z
  .object({
    netMonthlyIncome: optionalRupiah,
    payday: paydaySchema,
    essentialMonthlyExpenses: optionalRupiah,
    debts: z.array(debtSchema).max(20),
    emergencyFund: optionalRupiah,
    monthlySavings: optionalRupiah,
    otherAssets: optionalRupiah,
    propertyAssets: optionalRupiah,
    /** 3 stands for "3 Orang atau Lebih". */
    dependents: z.number().int().min(0).max(3),
    maritalStatus: z.enum(enumValues(MARITAL_STATUS)).nullable().default(null),
    protections: z.array(z.enum(enumValues(PROTECTION))).max(4),
  })
  .openapi('HealthCheck');

const indicatorKeySchema = z.enum(enumValues(INDICATOR));
const bandSchema = z.enum(enumValues(SCORE_BAND));

const measureSchema = z
  .union([
    z.object({
      ratio: z.number(),
      liquid: rupiah,
      essential: rupiah,
      targetMultiple: z.number(),
      targetAmount: rupiah,
    }),
    z.object({ percent: z.number().int(), monthlySavings: rupiah, income: rupiah }),
    z.object({ percent: z.number().int(), monthlyInstalments: rupiah, income: rupiah }),
    z.object({ platforms: z.number().int(), anyLate: z.boolean(), anyOverdue: z.boolean() }),
    z.object({ percent: z.number().int(), totalDebt: rupiah, totalAssets: rupiah }),
    z.object({ health: z.boolean(), income: z.boolean() }),
  ])
  .openapi('IndicatorMeasure');

const indicatorSchema = z
  .object({
    key: indicatorKeySchema,
    group: z.enum(enumValues(INDICATOR_GROUP)),
    points: z.number().int(),
    band: bandSchema,
    measure: measureSchema,
  })
  .openapi('Indicator');

export const stepSchema = z
  .object({
    kind: z.enum(enumValues(STEP_KIND)),
    /** Score points the step is estimated to add. */
    estimatedGain: z.number().int(),
    debtName: z.string().optional(),
    remaining: rupiah.optional(),
    currentAmount: rupiah.optional(),
    targetAmount: rupiah.optional(),
    targetMultiple: z.number().optional(),
    targetPercent: z.number().int().optional(),
  })
  .openapi('Step');

export const scoreReportSchema = z
  .object({
    score: z.number().int(),
    band: bandSchema,
    /** Against the latest score from before this payday period; null when there is none. */
    delta: z.number().int().nullable(),
    /** Only the first health check has been scored ("dari cek awal"). */
    isInitial: z.boolean(),
    computedAt: z.iso.datetime(),
    /** "Skor dicek lagi otomatis setiap gajian": the next payday. */
    nextCheckOn: date,
    groups: z.array(
      z.object({
        group: z.enum(enumValues(INDICATOR_GROUP)),
        points: z.number().int(),
        band: bandSchema,
      }),
    ),
    indicators: z.array(indicatorSchema),
    steps: z.array(stepSchema).max(3),
    /** Consumer debt scores 0, which holds the band at Rentan. */
    cappedByConsumerDebt: z.boolean(),
  })
  .openapi('ScoreReport');

export const indicatorDetailSchema = indicatorSchema
  .extend({
    ladder: z.array(
      z.object({
        points: z.number().int(),
        lower: z.number().nullable(),
        upper: z.number().nullable(),
        amountLower: rupiah.nullable(),
        amountUpper: rupiah.nullable(),
        isCurrent: z.boolean(),
      }),
    ),
    nextRung: z
      .object({
        points: z.number().int(),
        amountNeeded: rupiah.nullable(),
        scoreFrom: z.number().int(),
        scoreTo: z.number().int(),
      })
      .nullable(),
    milestones: z.array(z.object({ at: rupiah, label: z.string() })),
  })
  .openapi('IndicatorDetail');

export const indicatorParamsSchema = z.object({
  key: indicatorKeySchema.openapi({ param: { name: 'key', in: 'path' } }),
});

const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .openapi({ example: '2026-09' });

export const scoreHistoryQuerySchema = z.object({
  range: z
    .enum(enumValues(SCORE_HISTORY_RANGE))
    .default(SCORE_HISTORY_RANGE.sixMonths)
    .openapi({ param: { name: 'range', in: 'query' } }),
});

/** Riwayat Kira Score (SKR-07, SKR-07b): the score now, the monthly points and what changed. */
export const scoreHistorySchema = z
  .object({
    current: z.object({
      score: z.number().int(),
      band: bandSchema,
      /** Against the latest monthly point before this month; null when there is none. */
      deltaFromPrevious: z.number().int().nullable(),
      /** That point's month; null when there is none. */
      previousMonth: month.nullable(),
    }),
    /** One per month in the range, oldest first: the 25th's snapshot, or the first health check's. */
    points: z.array(z.object({ month, score: z.number().int() })),
    /** The indicators whose points moved since `previousMonth`, in the score's order. */
    changes: z.array(
      z.object({
        indicator: indicatorKeySchema,
        /** The figure then ("0,8×"); null when that snapshot predates the figures being kept. */
        fromLabel: z.string().nullable(),
        toLabel: z.string(),
        fromPoints: z.number().int(),
        toPoints: z.number().int(),
      }),
    ),
    /** The indicators that did not move; 0 when there is no earlier month to compare with. */
    unchangedCount: z.number().int(),
  })
  .openapi('ScoreHistory');

export type HealthCheckBody = z.infer<typeof healthCheckBodySchema>;
export type ScoreHistory = z.infer<typeof scoreHistorySchema>;
export type ScoreReport = z.infer<typeof scoreReportSchema>;
export type IndicatorDetail = z.infer<typeof indicatorDetailSchema>;
