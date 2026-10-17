import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import { getWeeklySummaryHandler } from './summary.handler.ts';
import { weeklySummaryQuerySchema, weeklySummarySchema } from './summary.schema.ts';

export const getWeeklySummaryRoute = createRoute({
  method: 'get',
  path: '/weekly',
  operationId: 'getWeeklySummary',
  tags: ['Uang'],
  summary: 'Ringkasan Mingguan',
  description:
    'The seven WIB days ending on `end` (today by default): expenses per day and per category, the week before, and the budget of the payday period. Numbers only; the app writes the sentences.',
  security: [{ bearerAuth: [] }],
  request: { query: weeklySummaryQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: weeklySummarySchema } },
      description: 'The week',
    },
    ...errorResponses(401, 422),
  },
});

/** Mounted at /api/summary. */
export const summaryRouter = createRouter();
summaryRouter.use('*', requireSession);
summaryRouter.openapi(getWeeklySummaryRoute, getWeeklySummaryHandler);
