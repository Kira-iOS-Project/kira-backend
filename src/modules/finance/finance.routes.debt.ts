import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { debtDetailSchema, debtIdParamSchema } from './finance.debt.schema.ts';

export const getDebtRoute = createRoute({
  tags: ['Finance'],
  security: [{ bearerAuth: [] }],
  method: 'get',
  path: '/debts/{id}',
  operationId: 'getDebt',
  summary: 'Detail Utang',
  description:
    "One debt account: what is paid, the next due date, its payments newest first, and the payoff engine's next step with the Kira Score estimate.",
  request: { params: debtIdParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: debtDetailSchema } },
      description: 'The account',
    },
    ...errorResponses(401, 404, 422),
  },
});
