import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import {
  addGoalDeposit,
  createGoal,
  deleteGoal,
  getGoalDetail,
  listGoalSummaries,
  updateGoal,
} from './plan.goal.service.ts';
import { getRiskProfile, saveRiskProfile } from './plan.risk.ts';
import type {
  addGoalDepositRoute,
  createGoalRoute,
  deleteGoalRoute,
  getGoalRoute,
  getPlanRoute,
  getRiskProfileRoute,
  listGoalsRoute,
  saveRiskProfileRoute,
  updateGoalRoute,
} from './plan.routes.ts';
import { getPlan } from './plan.service.ts';

export const getPlanHandler: RouteHandler<typeof getPlanRoute, AppEnv> = async (c) => {
  return c.json(await getPlan(c.get('userId')), 200);
};

export const listGoalsHandler: RouteHandler<typeof listGoalsRoute, AppEnv> = async (c) => {
  return c.json({ goals: await listGoalSummaries(c.get('userId')) }, 200);
};

export const createGoalHandler: RouteHandler<typeof createGoalRoute, AppEnv> = async (c) => {
  return c.json(await createGoal(c.get('userId'), c.req.valid('json')), 201);
};

export const getGoalHandler: RouteHandler<typeof getGoalRoute, AppEnv> = async (c) => {
  return c.json(await getGoalDetail(c.get('userId'), c.req.valid('param').id), 200);
};

export const updateGoalHandler: RouteHandler<typeof updateGoalRoute, AppEnv> = async (c) => {
  const { id } = c.req.valid('param');
  return c.json(await updateGoal(c.get('userId'), id, c.req.valid('json')), 200);
};

export const deleteGoalHandler: RouteHandler<typeof deleteGoalRoute, AppEnv> = async (c) => {
  await deleteGoal(c.get('userId'), c.req.valid('param').id);
  return c.body(null, 204);
};

export const addGoalDepositHandler: RouteHandler<typeof addGoalDepositRoute, AppEnv> = async (
  c,
) => {
  const { id } = c.req.valid('param');
  return c.json(await addGoalDeposit(c.get('userId'), id, c.req.valid('json')), 201);
};

export const saveRiskProfileHandler: RouteHandler<typeof saveRiskProfileRoute, AppEnv> = async (
  c,
) => {
  return c.json(await saveRiskProfile(c.get('userId'), c.req.valid('json').answers), 200);
};

export const getRiskProfileHandler: RouteHandler<typeof getRiskProfileRoute, AppEnv> = async (
  c,
) => {
  return c.json(await getRiskProfile(c.get('userId')), 200);
};
