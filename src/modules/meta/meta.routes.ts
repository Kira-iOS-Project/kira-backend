import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { createRouter } from '../../lib/server/factory.ts';
import { healthHandler } from './meta.handler.ts';
import { healthResponseSchema } from './meta.schema.ts';

export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  operationId: 'getHealth',
  tags: ['Meta'],
  summary: 'Health check',
  description: 'Whether the server is up and its database answers.',
  responses: {
    200: {
      content: { 'application/json': { schema: healthResponseSchema } },
      description: 'The server and its database answer',
    },
    /** The route reads no input, so no 422; 503 is HealthCheckFailedError. */
    ...errorResponses(503),
  },
});

export const metaApp = createRouter();
metaApp.openapi(healthRoute, healthHandler);
