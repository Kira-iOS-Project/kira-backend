import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { budgetSchema } from './finance.budget.schema.ts';

export const currentBudgetRoute = createRoute({
  tags: ['Finance'],
  security: [{ bearerAuth: [] }],
  method: 'get',
  path: '/budgets/current',
  operationId: 'getCurrentBudget',
  summary: 'Current budget and adjusted payday',
  responses: {
    200: {
      description: 'Current budget, spending, goal posts and adjusted payday period',
      content: { 'application/json': { schema: budgetSchema } },
    },
    ...errorResponses(401),
  },
});
