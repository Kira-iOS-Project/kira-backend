import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import type { applyRoute, scholarshipRoute, withdrawRoute } from './scholarship.routes.ts';
import { apply, getScholarship, withdraw } from './scholarship.service.ts';

export const scholarshipHandler: RouteHandler<typeof scholarshipRoute, AppEnv> = async (c) => {
  return c.json(await getScholarship(c.get('userId')), 200);
};

export const applyHandler: RouteHandler<typeof applyRoute, AppEnv> = async (c) => {
  return c.json(await apply(c.get('userId'), c.req.valid('json')), 201);
};

export const withdrawHandler: RouteHandler<typeof withdrawRoute, AppEnv> = async (c) => {
  await withdraw(c.get('userId'));
  return c.body(null, 204);
};
