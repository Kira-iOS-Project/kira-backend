import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import { recordPayment } from './payoff.payment.service.ts';
import { createPlan, getActivePlan, setPlanFocus } from './payoff.plan.service.ts';
import type {
  createPlanRoute,
  getActivePlanRoute,
  recordPaymentRoute,
  setFocusRoute,
  simulatePayoffRoute,
} from './payoff.routes.ts';
import { simulatePayoff } from './payoff.service.ts';

export const simulatePayoffHandler: RouteHandler<typeof simulatePayoffRoute, AppEnv> = async (
  c,
) => {
  return c.json(await simulatePayoff(c.get('userId'), c.req.valid('json')), 200);
};

export const createPlanHandler: RouteHandler<typeof createPlanRoute, AppEnv> = async (c) => {
  return c.json(await createPlan(c.get('userId'), c.req.valid('json')), 201);
};

export const getActivePlanHandler: RouteHandler<typeof getActivePlanRoute, AppEnv> = async (c) => {
  return c.json(await getActivePlan(c.get('userId')), 200);
};

export const setFocusHandler: RouteHandler<typeof setFocusRoute, AppEnv> = async (c) => {
  const { focusDebtId } = c.req.valid('json');
  return c.json(await setPlanFocus(c.get('userId'), focusDebtId), 200);
};

export const recordPaymentHandler: RouteHandler<typeof recordPaymentRoute, AppEnv> = async (c) => {
  const { amount } = c.req.valid('json');
  return c.json(await recordPayment(c.get('userId'), c.req.valid('param').id, amount), 200);
};
