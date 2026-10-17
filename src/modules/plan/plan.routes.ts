import { createRoute, z } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import {
  addGoalDepositHandler,
  createGoalHandler,
  getGoalHandler,
  getPlanHandler,
  getRiskProfileHandler,
  listGoalsHandler,
  saveRiskProfileHandler,
  updateGoalHandler,
} from './plan.handler.ts';
import {
  createGoalBodySchema,
  goalDepositBodySchema,
  goalDepositSchema,
  goalDetailSchema,
  goalIdParamSchema,
  goalSchema,
  goalSummarySchema,
  planSchema,
  riskProfileBodySchema,
  riskProfileSchema,
  updateGoalBodySchema,
} from './plan.schema.ts';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const common = { tags: ['Rencana'], security: [{ bearerAuth: [] }] };

export const getPlanRoute = createRoute({
  ...common,
  method: 'get',
  path: '/plan',
  operationId: 'getPlan',
  summary: 'Rencana',
  description:
    'Tangga Keuanganmu from the Kira Score engine, the goals, the risk profile and what the calculators start from.',
  responses: {
    200: { ...json(planSchema), description: 'The plan' },
    ...errorResponses(401),
  },
});

export const listGoalsRoute = createRoute({
  ...common,
  method: 'get',
  path: '/goals',
  operationId: 'listGoals',
  summary: 'The goals',
  description: 'Every goal, the emergency fund first, then the newest.',
  responses: {
    200: { ...json(z.object({ goals: z.array(goalSummarySchema) })), description: 'The goals' },
    ...errorResponses(401),
  },
});

export const createGoalRoute = createRoute({
  ...common,
  method: 'post',
  path: '/goals',
  operationId: 'createGoal',
  summary: 'Simpan Tujuan',
  description:
    "Stores the goal as the app's calculator computed it, after checking its ranges; one emergency fund per person.",
  request: { body: { ...json(createGoalBodySchema), required: true } },
  responses: {
    201: { ...json(goalSchema), description: 'Saved' },
    ...errorResponses(401, 409, 422),
  },
});

export const getGoalRoute = createRoute({
  ...common,
  method: 'get',
  path: '/goals/{id}',
  operationId: 'getGoal',
  summary: 'Detail Tujuan',
  description: 'The goal, its deposits newest first and, for the emergency fund, its milestones.',
  request: { params: goalIdParamSchema },
  responses: {
    200: { ...json(goalDetailSchema), description: 'The goal' },
    ...errorResponses(401, 404, 422),
  },
});

export const updateGoalRoute = createRoute({
  ...common,
  method: 'patch',
  path: '/goals/{id}',
  operationId: 'updateGoal',
  summary: 'Ubah Tujuan',
  description:
    "Changes any of the goal's figures; an emergency fund's inputs must keep a positive essentialExpense (422).",
  request: {
    params: goalIdParamSchema,
    body: { ...json(updateGoalBodySchema), required: true },
  },
  responses: {
    200: { ...json(goalSchema), description: 'The changed goal' },
    ...errorResponses(401, 404, 422),
  },
});

export const addGoalDepositRoute = createRoute({
  ...common,
  method: 'post',
  path: '/goals/{id}/deposits',
  operationId: 'addGoalDeposit',
  summary: 'Tambah Setoran',
  description:
    'Records a deposit. The same depositId again on this goal answers the stored deposit as it was first recorded (whatever amount the retry carries) and adds nothing; one used on another goal is refused, and a day before the goal was made answers 422.',
  request: {
    params: goalIdParamSchema,
    body: { ...json(goalDepositBodySchema), required: true },
  },
  responses: {
    201: { ...json(goalDepositSchema), description: 'Recorded' },
    ...errorResponses(401, 404, 409, 422),
  },
});

export const saveRiskProfileRoute = createRoute({
  ...common,
  method: 'put',
  path: '/risk-profile',
  operationId: 'saveRiskProfile',
  summary: 'Kenali Profil Risikomu',
  description: "The five answers and the profile the server's fixed table gives them.",
  request: { body: { ...json(riskProfileBodySchema), required: true } },
  responses: {
    200: { ...json(riskProfileSchema), description: 'The profile' },
    ...errorResponses(401, 422),
  },
});

export const getRiskProfileRoute = createRoute({
  ...common,
  method: 'get',
  path: '/risk-profile',
  operationId: 'getRiskProfile',
  summary: 'Hasil Risiko',
  description: 'The saved profile and answers; every field null before the quiz.',
  responses: {
    200: { ...json(riskProfileSchema), description: 'The profile' },
    ...errorResponses(401),
  },
});

/** Mounted at /api beside other routers, so the gate names its own paths instead of `*`. */
export const planRouter = createRouter();
for (const path of ['/plan', '/goals', '/goals/*', '/risk-profile']) {
  planRouter.use(path, requireSession);
}
planRouter.openapi(getPlanRoute, getPlanHandler);
planRouter.openapi(listGoalsRoute, listGoalsHandler);
planRouter.openapi(createGoalRoute, createGoalHandler);
planRouter.openapi(getGoalRoute, getGoalHandler);
planRouter.openapi(updateGoalRoute, updateGoalHandler);
planRouter.openapi(addGoalDepositRoute, addGoalDepositHandler);
planRouter.openapi(saveRiskProfileRoute, saveRiskProfileHandler);
planRouter.openapi(getRiskProfileRoute, getRiskProfileHandler);
