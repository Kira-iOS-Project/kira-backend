import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import { simulatePayoffHandler } from './payoff.handler.ts';
import { payoffPlanSchema, simulatePayoffBodySchema } from './payoff.schema.ts';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });

export const simulatePayoffRoute = createRoute({
  method: 'post',
  path: '/simulate',
  operationId: 'simulatePayoff',
  tags: ['Payoff'],
  security: [{ bearerAuth: [] }],
  summary: 'Simulate a debt payoff plan',
  description:
    'Orders the consumer debts by snowball or avalanche and returns the month and interest of each, set against the other method. Nothing is saved.',
  request: { body: { ...json(simulatePayoffBodySchema), required: true } },
  responses: {
    200: { ...json(payoffPlanSchema), description: 'The simulated plan' },
    ...errorResponses(400, 401, 422),
  },
});

/** Mounted at /api/payoff. */
export const payoffRouter = createRouter();
payoffRouter.use('*', requireSession);
payoffRouter.openapi(simulatePayoffRoute, simulatePayoffHandler);
