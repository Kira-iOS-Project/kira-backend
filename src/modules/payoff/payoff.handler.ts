import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import { simulatePayoff } from './payoff.service.ts';
import type { simulatePayoffRoute } from './payoff.routes.ts';

export const simulatePayoffHandler: RouteHandler<typeof simulatePayoffRoute, AppEnv> = async (
  c,
) => {
  return c.json(await simulatePayoff(c.get('userId'), c.req.valid('json')), 200);
};
