import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import type { getUsageRoute } from './usage.routes.ts';
import { getUsage } from './usage.service.ts';

export const getUsageHandler: RouteHandler<typeof getUsageRoute, AppEnv> = async (c) => {
  return c.json(await getUsage(c.get('userId')), 200);
};
