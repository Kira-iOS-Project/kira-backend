/** The check-in routes (PED-05, PED-06): schedule, cancel, the one that is due, and seen. */

import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import {
  checkInParamsSchema,
  checkInSchema,
  dueCheckInSchema,
  scheduleCheckInBodySchema,
} from './care.schema.ts';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const common = { tags: ['Care'], security: [{ bearerAuth: [] }] };

export const scheduleCheckInRoute = createRoute({
  ...common,
  method: 'post',
  path: '/care/check-ins',
  operationId: 'scheduleCheckIn',
  summary: 'Schedule a check-in shown in Catat after 24, 48 or 72 hours',
  description:
    'Replaces any check-in still pending. Nothing is pushed: the app shows it when opened.',
  request: { body: { ...json(scheduleCheckInBodySchema), required: true } },
  responses: {
    201: { ...json(checkInSchema), description: 'The scheduled check-in' },
    ...errorResponses(401, 422),
  },
});

export const cancelCheckInRoute = createRoute({
  ...common,
  method: 'delete',
  path: '/care/check-ins/{id}',
  operationId: 'cancelCheckIn',
  summary: 'Cancel a pending check-in',
  request: { params: checkInParamsSchema },
  responses: { 204: { description: 'Cancelled' }, ...errorResponses(401, 404, 422) },
});

export const dueCheckInRoute = createRoute({
  ...common,
  method: 'get',
  path: '/care/check-ins/due',
  operationId: 'getDueCheckIn',
  summary: 'The pending check-in whose time has come, or null',
  responses: {
    200: { ...json(dueCheckInSchema), description: 'The due check-in' },
    ...errorResponses(401),
  },
});

export const markCheckInSeenRoute = createRoute({
  ...common,
  method: 'post',
  path: '/care/check-ins/{id}/seen',
  operationId: 'markCheckInSeen',
  summary: 'Mark a check-in shown in Catat',
  request: { params: checkInParamsSchema },
  responses: { 204: { description: 'Seen' }, ...errorResponses(401, 404, 422) },
});
