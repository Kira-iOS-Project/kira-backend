import { z } from '@hono/zod-openapi';
import { INDICATOR } from '../../lib/constants/score.ts';
import { expenseCategorySchema } from '../../lib/money/money.schema.ts';

const date = z.iso.date().openapi({ example: '2026-10-17' });
const paydayChoiceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('day'), day: z.number().int().min(1).max(31) }),
  z.object({ type: z.literal('endOfMonth') }),
]);
const budgetAllocationSchema = z.object({
  category: expenseCategorySchema,
  amount: z.number().int().min(0).max(10_000_000_000_000),
});

const budgetGoalPostSchema = z.object({
  category: z.literal(INDICATOR.emergencyFund),
  name: z.string(),
  currentAmount: z.number().int().min(0),
  targetAmount: z.number().int().min(0),
  milestones: z.array(
    z.object({ amount: z.number().int().min(0), label: z.string(), reached: z.boolean() }),
  ),
});

export const budgetSchema = z
  .object({
    configured: z.boolean(),
    income: z.number().int().min(0),
    remaining: z.number().int(),
    allocations: z.array(
      z.object({
        category: expenseCategorySchema,
        amount: z.number().int().min(0),
        spent: z.number().int().min(0),
        nearLimit: z.boolean(),
      }),
    ),
    totalAllocated: z.number().int().min(0),
    overAllocated: z.boolean(),
    goalPosts: z.array(budgetGoalPostSchema),
    payday: z.object({
      requested: paydayChoiceSchema,
      adjustedDate: date,
      periodStart: date,
      periodEnd: date,
      nextPayday: date,
      daysUntilPayday: z.number().int(),
    }),
  })
  .openapi('CurrentBudget');

export type PaydayChoice = z.infer<typeof paydayChoiceSchema>;
export type BudgetAllocationInput = z.infer<typeof budgetAllocationSchema>;
