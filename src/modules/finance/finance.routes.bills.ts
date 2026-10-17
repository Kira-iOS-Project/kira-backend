import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { billListSchema } from './finance.bills.schema.ts';

export const listBillsRoute = createRoute({
  tags: ['Finance'],
  security: [{ bearerAuth: [] }],
  method: 'get',
  path: '/bills',
  operationId: 'listBills',
  summary: 'Recurring bills and debt installments by due date',
  responses: {
    200: {
      description: 'Owner bills and debt installments with due and payment status',
      content: { 'application/json': { schema: billListSchema } },
    },
    ...errorResponses(401),
  },
});
