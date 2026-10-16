import { z } from '@hono/zod-openapi';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { HOME_VARIANT, MICRO_TARGET } from '../../lib/constants/home.ts';
import { SCORE_BAND } from '../../lib/constants/score.ts';
import { stepSchema } from '../score/index.ts';

const rupiah = z.number().int().min(0);
const date = z.iso.date().openapi({ example: '2026-10-16' });

export const homeSchema = z
  .object({
    variant: z.enum(enumValues(HOME_VARIANT)),
    today: date,
    displayName: z.string(),
    hideBalances: z.boolean(),
    /** The payday period today falls in ("gajian 10 hari lagi"). */
    period: z
      .object({ start: date, end: date, nextPayday: date, daysUntilPayday: z.number().int() })
      .openapi('PaydayPeriod'),
    /** Sisa uang (overview only). */
    money: z
      .object({
        income: rupiah,
        spent: rupiah,
        remaining: rupiah,
        perDay: rupiah,
        spentPercent: z.number().int(),
      })
      .nullable(),
    /** Langkah Berikutnya: the engine's first step. */
    step: stepSchema.nullable(),
    stepPosition: z.object({ index: z.number().int(), total: z.number().int() }).nullable(),
    score: z
      .object({
        score: z.number().int(),
        band: z.enum(enumValues(SCORE_BAND)),
        delta: z.number().int().nullable(),
        isInitial: z.boolean(),
      })
      .nullable(),
    /** Ringkasan Mingguan Siap: the seven days before today. */
    weeklySummary: z.object({ from: date, to: date }).nullable(),
    /** Langkah Awal (first steps only). */
    checklist: z
      .object({
        healthCheck: z.boolean(),
        firstTransaction: z.boolean(),
        walletAdded: z.boolean(),
        paydaySet: z.boolean(),
      })
      .nullable(),
    /** Rencana bebas utang (debt plan only). */
    debtPlan: z
      .object({ paidOff: rupiah, total: rupiah, remaining: rupiah, percent: z.number().int() })
      .nullable(),
    /** Target mikro (debt plan only): a week of essential spending, then a month. */
    microTarget: z
      .object({ kind: z.enum(enumValues(MICRO_TARGET)), current: rupiah, target: rupiah })
      .nullable(),
  })
  .openapi('Home');

export type Home = z.infer<typeof homeSchema>;
