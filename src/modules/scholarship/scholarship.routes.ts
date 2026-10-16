import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import { applyHandler, scholarshipHandler, withdrawHandler } from './scholarship.handler.ts';
import {
  applicationSchema,
  applyBodySchema,
  scholarshipResponseSchema,
} from './scholarship.schema.ts';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const common = { tags: ['Scholarship'], security: [{ bearerAuth: [] }] };

export const scholarshipRoute = createRoute({
  ...common,
  method: 'get',
  path: '/scholarship',
  operationId: 'getScholarship',
  summary: 'Eligibility, this month’s quota and the current application',
  responses: {
    200: { ...json(scholarshipResponseSchema), description: 'Beasiswa Kira' },
    ...errorResponses(401),
  },
});

export const applyRoute = createRoute({
  ...common,
  method: 'post',
  path: '/scholarship/applications',
  operationId: 'applyForScholarship',
  summary: 'Apply for Beasiswa Kira (review is simulated)',
  description: 'In review, or waitlisted when this month’s quota is used up.',
  request: { body: { ...json(applyBodySchema), required: true } },
  responses: {
    201: { ...json(applicationSchema), description: 'The application' },
    ...errorResponses(401, 409, 422),
  },
});

export const withdrawRoute = createRoute({
  ...common,
  method: 'delete',
  path: '/scholarship/applications/current',
  operationId: 'withdrawScholarshipApplication',
  summary: 'Withdraw the open application',
  responses: {
    204: { description: 'Withdrawn' },
    ...errorResponses(401, 404),
  },
});

/** Mounted at /api beside other routers, so the gate names its own paths instead of `*`. */
export const scholarshipRouter = createRouter();
for (const path of ['/scholarship', '/scholarship/*']) {
  scholarshipRouter.use(path, requireSession);
}
scholarshipRouter.openapi(scholarshipRoute, scholarshipHandler);
scholarshipRouter.openapi(applyRoute, applyHandler);
scholarshipRouter.openapi(withdrawRoute, withdrawHandler);
