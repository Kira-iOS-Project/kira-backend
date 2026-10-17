import type { RouteConfig, RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import type {
  cancelCheckInRoute,
  dueCheckInRoute,
  markCheckInSeenRoute,
  scheduleCheckInRoute,
} from './care.check-ins.routes.ts';
import type {
  contactsRoute,
  debtEmergencyRoute,
  debtsRoute,
  getSafetyPlanRoute,
  saveSafetyPlanRoute,
  signalRoute,
} from './care.routes.ts';
import * as plan from './care.safety-plan.service.ts';
import * as care from './care.service.ts';

type Handler<R extends RouteConfig> = RouteHandler<R, AppEnv>;

export const contacts: Handler<typeof contactsRoute> = (c) => c.json(care.listContacts(), 200);

export const signal: Handler<typeof signalRoute> = async (c) => {
  await care.recordSignal(c.get('userId'), c.req.valid('json'));
  return c.body(null, 204);
};

export const scheduleCheckIn: Handler<typeof scheduleCheckInRoute> = async (c) => {
  return c.json(await care.scheduleCheckIn(c.get('userId'), c.req.valid('json').afterHours), 201);
};

export const dueCheckIn: Handler<typeof dueCheckInRoute> = async (c) => {
  return c.json(await care.dueCheckIn(c.get('userId')), 200);
};

export const cancelCheckIn: Handler<typeof cancelCheckInRoute> = async (c) => {
  await care.cancelCheckIn(c.get('userId'), c.req.valid('param').id);
  return c.body(null, 204);
};

export const markCheckInSeen: Handler<typeof markCheckInSeenRoute> = async (c) => {
  await care.markCheckInSeen(c.get('userId'), c.req.valid('param').id);
  return c.body(null, 204);
};

export const debtEmergency: Handler<typeof debtEmergencyRoute> = async (c) => {
  return c.json(await care.activateDebtEmergency(c.get('userId')), 200);
};

export const debts: Handler<typeof debtsRoute> = async (c) => {
  return c.json(await care.listDebts(c.get('userId')), 200);
};

export const getSafetyPlan: Handler<typeof getSafetyPlanRoute> = async (c) => {
  return c.json(await plan.getSafetyPlan(c.get('userId')), 200);
};

export const saveSafetyPlan: Handler<typeof saveSafetyPlanRoute> = async (c) => {
  return c.json(await plan.saveSafetyPlan(c.get('userId'), c.req.valid('json')), 200);
};
