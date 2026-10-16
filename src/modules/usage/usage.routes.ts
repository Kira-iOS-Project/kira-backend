import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { createRouter } from '../../lib/server/factory.ts';
import { usageSchema } from '../../lib/usage/usage.schema.ts';
import { requireSession } from '../auth/index.ts';
import { getUsageHandler } from './usage.handler.ts';

export const getUsageRoute = createRoute({
  method: 'get',
  path: '/',
  operationId: 'getUsage',
  tags: ['Catat'],
  summary: 'This period’s quota usage',
  description:
    'AI messages, receipts and voice seconds used against the plan, and the date they reset.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { content: { 'application/json': { schema: usageSchema } }, description: 'The usage' },
    ...errorResponses(401),
  },
});

export const usageRouter = createRouter();
usageRouter.use('*', requireSession);
usageRouter.openapi(getUsageRoute, getUsageHandler);
