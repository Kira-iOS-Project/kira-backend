import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { createRouter } from '../../lib/server/factory.ts';
import { PLAN_FEATURE } from '../../lib/constants/plans.ts';
import { requireSession } from '../auth/index.ts';
import { planFeatureGate } from '../usage/index.ts';
import {
  getIndicatorHandler,
  getScoreHandler,
  getScoreHistoryHandler,
  saveHealthCheckHandler,
} from './score.handler.ts';
import {
  healthCheckBodySchema,
  indicatorDetailSchema,
  indicatorParamsSchema,
  scoreHistoryQuerySchema,
  scoreHistorySchema,
  scoreReportSchema,
} from './score.schema.ts';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const secured = { tags: ['Score'], security: [{ bearerAuth: [] }] };

export const saveHealthCheckRoute = createRoute({
  ...secured,
  method: 'put',
  path: '/',
  operationId: 'saveHealthCheck',
  summary: 'Save the health check',
  description:
    'Stores the six quiz steps, replaces the debt accounts, sets the payday and returns the first Kira Score.',
  request: { body: { ...json(healthCheckBodySchema), required: true } },
  responses: {
    200: { ...json(scoreReportSchema), description: 'The Kira Score of these answers' },
    ...errorResponses(401, 404, 422),
  },
});

export const getScoreRoute = createRoute({
  ...secured,
  method: 'get',
  path: '/',
  operationId: 'getScore',
  summary: 'The Kira Score',
  description: 'Six indicators, three groups, the band and up to three priority steps.',
  responses: {
    200: { ...json(scoreReportSchema), description: 'The current Kira Score' },
    ...errorResponses(401, 404),
  },
});

export const getIndicatorRoute = createRoute({
  ...secured,
  method: 'get',
  path: '/indicators/{key}',
  operationId: 'getScoreIndicator',
  summary: 'One indicator in detail',
  description: 'Its scoring ladder in rupiah, the next rung and the milestones of its ribbon.',
  request: { params: indicatorParamsSchema },
  responses: {
    200: { ...json(indicatorDetailSchema), description: 'The indicator' },
    ...errorResponses(401, 404, 422),
  },
});

export const getScoreHistoryRoute = createRoute({
  ...secured,
  method: 'get',
  path: '/history',
  operationId: 'getScoreHistory',
  summary: 'Riwayat Kira Score',
  description:
    'The score now against last month, a point per month (taken on the 25th, WIB, and at the first health check) and the indicators that changed. Kira Plus only: other plans get 403 PLAN_FEATURE_UNAVAILABLE.',
  request: { query: scoreHistoryQuerySchema },
  responses: {
    200: { ...json(scoreHistorySchema), description: 'The score history over the range' },
    ...errorResponses(401, 403, 404, 422),
  },
});

/** Mounted at /api/health-check. */
export const healthCheckRouter = createRouter();
healthCheckRouter.use('*', requireSession);
healthCheckRouter.openapi(saveHealthCheckRoute, saveHealthCheckHandler);

/** Mounted at /api/score. */
export const scoreRouter = createRouter();
scoreRouter.use('*', requireSession);
scoreRouter.use('/history', planFeatureGate(PLAN_FEATURE.scoreHistory));
scoreRouter.openapi(getScoreRoute, getScoreHandler);
scoreRouter.openapi(getScoreHistoryRoute, getScoreHistoryHandler);
scoreRouter.openapi(getIndicatorRoute, getIndicatorHandler);
