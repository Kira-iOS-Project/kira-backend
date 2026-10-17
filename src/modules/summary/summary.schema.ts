/**
 * Ringkasan Mingguan (UNG-08, KIR-42): numbers only; the app writes every sentence from them.
 */

import { z } from '@hono/zod-openapi';
import { expenseCategorySchema } from '../../lib/money/money.schema.ts';

const rupiah = z.number().int();

export const weeklySummaryQuerySchema = z.object({
  /** The week's last WIB day; today when absent. */
  end: z.iso.date().optional(),
});

export const weeklySummarySchema = z
  .object({
    /** The week's first WIB day: six days before `end`. */
    start: z.iso.date(),
    end: z.iso.date(),
    /** Expenses in the week. */
    total: rupiah,
    /** Expenses in the seven days before it. */
    previousTotal: rupiah,
    /** Each of the seven days, oldest first; a day without spending is 0. */
    days: z.array(z.object({ date: z.iso.date(), expense: rupiah })),
    /** Every expense category with spending in the week, largest first. */
    categories: z.array(z.object({ category: expenseCategorySchema, amount: rupiah })),
    /** The budget of the payday period `end` falls in, and what it has spent; null without a budget. */
    budget: z
      .object({ amount: rupiah, spent: rupiah, periodStart: z.iso.date(), periodEnd: z.iso.date() })
      .nullable(),
  })
  .openapi('WeeklySummary');

export type WeeklySummary = z.infer<typeof weeklySummarySchema>;
