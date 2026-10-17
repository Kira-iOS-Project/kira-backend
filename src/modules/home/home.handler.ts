import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import type { getHomeRoute } from './home.routes.ts';
import { getHome } from './home.service.ts';

export const getHomeHandler: RouteHandler<typeof getHomeRoute, AppEnv> = async (c) => {
  return c.json(await getHome(c.get('userId')), 200);
};
