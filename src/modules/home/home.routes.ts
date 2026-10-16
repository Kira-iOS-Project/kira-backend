import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import { getHomeHandler } from './home.handler.ts';
import { homeSchema } from './home.schema.ts';

export const getHomeRoute = createRoute({
  method: 'get',
  path: '/',
  operationId: 'getHome',
  tags: ['Home'],
  summary: 'Beranda',
  description:
    'The layout to show (first steps, overview or debt plan) and its numbers: money left this payday period, the next step, the Kira Score, the checklist, the debt plan and the micro target.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: { content: { 'application/json': { schema: homeSchema } }, description: 'Beranda' },
    ...errorResponses(401),
  },
});

/** Mounted at /api/home. */
export const homeRouter = createRouter();
homeRouter.use('*', requireSession);
homeRouter.openapi(getHomeRoute, getHomeHandler);
