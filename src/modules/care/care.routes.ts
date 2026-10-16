/**
 * Kira Peduli's routes (CONTRACT-KOM-PED "Care"), mounted at /api: the contacts, crisis signals,
 * check-ins, Mode Darurat Utang, the health check's debts and the safety plan.
 */

import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import {
  cancelCheckInRoute,
  dueCheckInRoute,
  markCheckInSeenRoute,
  scheduleCheckInRoute,
} from './care.check-ins.routes.ts';
import * as handle from './care.handler.ts';
import { safetyPlanBodySchema, safetyPlanSchema } from './care.safety-plan.schema.ts';
import { careContactsSchema, careSignalBodySchema, debtEmergencySchema, debtsSchema } from './care.schema.ts';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const common = { tags: ['Care'], security: [{ bearerAuth: [] }] };

export const contactsRoute = createRoute({
  ...common,
  method: 'get',
  path: '/care/contacts',
  operationId: 'listCareContacts',
  summary: 'The verified crisis contacts, re-checked monthly',
  responses: { 200: { ...json(careContactsSchema), description: 'Contacts' }, ...errorResponses(401) },
});

export const signalRoute = createRoute({
  ...common,
  method: 'post',
  path: '/care/signals',
  operationId: 'recordCareSignal',
  summary: 'Record that the device detected a crisis signal (never the words)',
  request: { body: { ...json(careSignalBodySchema), required: true } },
  responses: { 204: { description: 'Recorded' }, ...errorResponses(401, 422) },
});

export const debtEmergencyRoute = createRoute({
  ...common,
  method: 'put',
  path: '/care/debt-emergency',
  operationId: 'activateDebtEmergency',
  summary: 'Turn Mode Darurat Utang on (idempotent, keeps the first time)',
  responses: { 200: { ...json(debtEmergencySchema), description: 'Active' }, ...errorResponses(401) },
});

export const debtsRoute = createRoute({
  method: 'get',
  path: '/debts',
  tags: ['Score'],
  security: [{ bearerAuth: [] }],
  operationId: 'listDebts',
  summary: 'The health check’s debts that are not paid off',
  responses: { 200: { ...json(debtsSchema), description: 'Debts' }, ...errorResponses(401) },
});

export const getSafetyPlanRoute = createRoute({
  ...common,
  method: 'get',
  path: '/care/safety-plan',
  operationId: 'getSafetyPlan',
  summary: 'The person’s safety plan',
  responses: {
    200: { ...json(safetyPlanSchema), description: 'The safety plan' },
    ...errorResponses(401, 404),
  },
});

export const saveSafetyPlanRoute = createRoute({
  ...common,
  method: 'put',
  path: '/care/safety-plan',
  operationId: 'saveSafetyPlan',
  summary: 'Write the whole safety plan (encrypted at rest)',
  request: { body: { ...json(safetyPlanBodySchema), required: true } },
  responses: {
    200: { ...json(safetyPlanSchema), description: 'The saved plan' },
    ...errorResponses(401, 422),
  },
});

/** Mounted at /api beside other routers, so the gate names its own paths instead of `*`. */
export const careRouter = createRouter();
for (const path of ['/care', '/care/*', '/debts']) {
  careRouter.use(path, requireSession);
}
careRouter.openapi(contactsRoute, handle.contacts);
careRouter.openapi(signalRoute, handle.signal);
careRouter.openapi(scheduleCheckInRoute, handle.scheduleCheckIn);
careRouter.openapi(dueCheckInRoute, handle.dueCheckIn);
careRouter.openapi(cancelCheckInRoute, handle.cancelCheckIn);
careRouter.openapi(markCheckInSeenRoute, handle.markCheckInSeen);
careRouter.openapi(debtEmergencyRoute, handle.debtEmergency);
careRouter.openapi(debtsRoute, handle.debts);
careRouter.openapi(getSafetyPlanRoute, handle.getSafetyPlan);
careRouter.openapi(saveSafetyPlanRoute, handle.saveSafetyPlan);
