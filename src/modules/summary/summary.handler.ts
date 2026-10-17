import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import type { getWeeklySummaryRoute } from './summary.routes.ts';
import { getWeeklySummary } from './summary.service.ts';

export const getWeeklySummaryHandler: RouteHandler<typeof getWeeklySummaryRoute, AppEnv> = async (
  c,
) => {
  return c.json(await getWeeklySummary(c.get('userId'), c.req.valid('query')), 200);
};
