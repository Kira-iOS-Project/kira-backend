import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { weeklySummaryQuerySchema, weeklySummarySchema } from './finance.weekly.schema.ts';

export const weeklySummaryRoute = createRoute({
  tags: ['Finance'],
  security: [{ bearerAuth: [] }],
  method: 'get',
  path: '/summaries/weekly',
  operationId: 'getWeeklySummary',
  summary: 'Weekly Thursday to Wednesday spending summary',
  request: { query: weeklySummaryQuerySchema },
  responses: {
    200: {
      description: 'The selected week, previous week, daily totals, and top expense categories',
      content: { 'application/json': { schema: weeklySummarySchema } },
    },
    ...errorResponses(401, 422),
  },
});
