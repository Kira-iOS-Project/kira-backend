/** Budget per Kategori (GET) and Atur Budget's Simpan Budget (PUT) at /api/budgets/current. */

import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { budgetSchema, saveBudgetBodySchema } from './finance.budget.schema.ts';

const secured = { tags: ['Finance'], security: [{ bearerAuth: [] }] };
const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });

export const currentBudgetRoute = createRoute({
  ...secured,
  method: 'get',
  path: '/budgets/current',
  operationId: 'getCurrentBudget',
  summary: 'Budget per Kategori: this payday period',
  description:
    "The payday period (Beranda's), income left, each category's limit and spending, the last three periods' averages and the Dana Darurat pos from Rencana.",
  responses: {
    200: { ...json(budgetSchema), description: 'The current budget' },
    ...errorResponses(401),
  },
});

export const saveBudgetRoute = createRoute({
  ...secured,
  method: 'put',
  path: '/budgets/current',
  operationId: 'saveCurrentBudget',
  summary: 'Simpan Budget: the limits per category and the payday',
  description:
    'Replaces the limits (each category at most once) and sets the payday Beranda also follows; answers the budget afterwards.',
  request: { body: { ...json(saveBudgetBodySchema), required: true } },
  responses: {
    200: { ...json(budgetSchema), description: 'The budget after saving' },
    ...errorResponses(401, 422),
  },
});
