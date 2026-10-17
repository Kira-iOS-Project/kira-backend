import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import type { listWalletsRoute } from './finance.routes.accounts.ts';
import { listWallets } from './finance.accounts.service.ts';

export const listWalletsHandler: RouteHandler<typeof listWalletsRoute, AppEnv> = async (c) =>
  c.json(await listWallets(c.get('userId')), 200);
