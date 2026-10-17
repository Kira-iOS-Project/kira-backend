import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import type { searchLegalityRoute } from './legality.routes.ts';
import { searchLegality } from './legality.service.ts';

export const searchLegalityHandler: RouteHandler<typeof searchLegalityRoute, AppEnv> = async (
  c,
) => {
  return c.json(searchLegality(c.req.valid('query').q), 200);
};
