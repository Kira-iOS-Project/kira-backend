import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import type { getIndicatorRoute, getScoreRoute, saveHealthCheckRoute } from './score.routes.ts';
import { getIndicatorDetail, getScoreReport, saveHealthCheck } from './score.service.ts';

export const saveHealthCheckHandler: RouteHandler<typeof saveHealthCheckRoute, AppEnv> = async (
  c,
) => {
  return c.json(await saveHealthCheck(c.get('userId'), c.req.valid('json')), 200);
};

export const getScoreHandler: RouteHandler<typeof getScoreRoute, AppEnv> = async (c) => {
  return c.json(await getScoreReport(c.get('userId')), 200);
};

export const getIndicatorHandler: RouteHandler<typeof getIndicatorRoute, AppEnv> = async (c) => {
  return c.json(await getIndicatorDetail(c.get('userId'), c.req.valid('param').key), 200);
};
