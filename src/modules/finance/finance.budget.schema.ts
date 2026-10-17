/**
 * Budget per Kategori (UNG-04) and Atur Budget (UNG-05): what GET /budgets/current answers and what
 * PUT /budgets/current takes. The period is Beranda's (lib/time/wib.ts paydayPeriod); amounts are
 * whole rupiah.
 */

import { z } from '@hono/zod-openapi';
import { EXPENSE_CATEGORY } from '../../lib/constants/money.ts';
import { expenseCategorySchema, MAX_AMOUNT } from '../../lib/money/money.schema.ts';

const date = z.iso.date().openapi({ example: '2026-10-17' });
const rupiah = z.number().int().min(0).max(MAX_AMOUNT);

/** The same payday shape as GET /me and the health check: a day, or the end of the month. */
const paydaySchema = z.object({
  /** A day of the month, or null while it has not been answered. */
  day: z.number().int().min(1).max(31).nullable().default(null),
  endOfMonth: z.boolean(),
});

const allocationSchema = z.object({ category: expenseCategorySchema, amount: rupiah });

/** Simpan Budget: one limit per category at most, and the payday chosen on Atur Budget. */
export const saveBudgetBodySchema = z
  .object({
    allocations: z
      .array(allocationSchema)
      .max(Object.keys(EXPENSE_CATEGORY).length)
      .refine(
        (rows) => new Set(rows.map((row) => row.category)).size === rows.length,
        'Each category at most once',
      ),
    payday: paydaySchema,
  })
  .openapi('SaveBudget');

/** The Dana Darurat goal from Rencana, shown as a locked pos ("Dari Tujuanmu"). */
const goalPostSchema = z.object({
  goalId: z.uuid(),
  /** Disisihkan tiap gajian. */
  monthlyDeposit: rupiah,
  savedAmount: rupiah,
  targetAmount: rupiah,
});

export const budgetSchema = z
  .object({
    /** Whether Atur Budget was ever saved. */
    configured: z.boolean(),
    /** The health check's net monthly income ("dari gaji"). */
    income: rupiah,
    /** Income minus this period's spending; negative when spending passed it. */
    remaining: z.number().int(),
    allocations: z.array(
      allocationSchema.extend({
        spent: rupiah,
        /** At least 90% used: the board's kunyit tag with what is left. */
        nearLimit: z.boolean(),
      }),
    ),
    totalAllocated: rupiah,
    overAllocated: z.boolean(),
    /** Atur Budget's hints: the average spending per category of the last three payday periods. */
    averages: z.array(allocationSchema),
    /** The open debt accounts' instalments a month ("termasuk cicilan Rp1.350.000,00"). */
    instalmentsMonthly: rupiah,
    goalPost: goalPostSchema.nullable(),
    payday: z.object({
      requested: paydaySchema,
      periodStart: date,
      periodEnd: date,
      nextPayday: date,
      daysUntilPayday: z.number().int().min(0),
    }),
  })
  .openapi('CurrentBudget');

export type SaveBudgetBody = z.infer<typeof saveBudgetBodySchema>;
export type CurrentBudget = z.infer<typeof budgetSchema>;
