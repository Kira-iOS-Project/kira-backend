import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import { searchLegalityHandler } from './legality.handler.ts';
import { legalityQuerySchema, legalitySearchSchema } from './legality.schema.ts';

export const searchLegalityRoute = createRoute({
  method: 'get',
  path: '/legality',
  operationId: 'searchLegality',
  tags: ['Rencana'],
  security: [{ bearerAuth: [] }],
  summary: 'Cek Legalitas',
  description:
    "Searches OJK's list of licensed fintech lenders by app, company or web address, every word of q matching. An empty result means only that the name is not in this list; Kira does not judge legality. The query is not stored, and the request log keeps the path without it.",
  request: { query: legalityQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: legalitySearchSchema } },
      description: 'Matches',
    },
    ...errorResponses(401, 422),
  },
});

/** Mounted at /api beside other routers, so the gate names its own path instead of `*`. */
export const legalityRouter = createRouter();
legalityRouter.use('/legality', requireSession);
legalityRouter.openapi(searchLegalityRoute, searchLegalityHandler);
