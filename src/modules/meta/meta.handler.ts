import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import type { healthRoute } from './meta.routes.ts';
import { getHealthReport } from './meta.service.ts';

export const healthHandler: RouteHandler<typeof healthRoute, AppEnv> = async (c) => {
  const report = await getHealthReport();
  return c.json(report, 200);
};
