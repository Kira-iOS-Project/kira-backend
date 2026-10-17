import { z } from '@hono/zod-openapi';
import { expenseCategorySchema } from '../../lib/money/money.schema.ts';

const date = z.iso.date().openapi({ example: '2026-10-15' });

export const weeklySummarySchema = z
  .object({
    period: z.object({ from: date, to: date }),
    totals: z.object({
      expense: z.number().int(),
      income: z.number().int(),
      net: z.number().int(),
    }),
    previous: z.object({
      expense: z.number().int(),
      income: z.number().int(),
      net: z.number().int(),
    }),
    days: z
      .array(z.object({ date, expense: z.number().int(), income: z.number().int() }))
      .length(7),
    topCategories: z
      .array(z.object({ category: expenseCategorySchema, amount: z.number().int() }))
      .max(4),
    note: z.string().nullable(),
  })
  .openapi('WeeklySummary');

function isThursday(week: string) {
  return new Date(`${week}T00:00:00Z`).getUTCDay() === 4;
}

export const weeklySummaryQuerySchema = z
  .object({ week: date })
  .refine(({ week }) => isThursday(week), {
    path: ['week'],
    message: 'A weekly summary starts on Thursday.',
  })
  .openapi('WeeklySummaryQuery');
