import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import {
  createPlanHandler,
  getActivePlanHandler,
  recordPaymentHandler,
  setFocusHandler,
  simulatePayoffHandler,
} from './payoff.handler.ts';
import {
  activePlanSchema,
  createPlanBodySchema,
  debtParamsSchema,
  paymentBodySchema,
  paymentResultSchema,
  setFocusBodySchema,
} from './payoff.plan.schema.ts';
import { payoffPlanSchema, simulatePayoffBodySchema } from './payoff.schema.ts';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const secured = { tags: ['Payoff'], security: [{ bearerAuth: [] }] };

export const simulatePayoffRoute = createRoute({
  ...secured,
  method: 'post',
  path: '/simulate',
  operationId: 'simulatePayoff',
  summary: 'Simulate a debt payoff plan',
  description:
    'Orders the consumer debts by snowball or avalanche and returns the month and interest of each, set against the other method. Nothing is saved.',
  request: { body: { ...json(simulatePayoffBodySchema), required: true } },
  responses: {
    200: { ...json(payoffPlanSchema), description: 'The simulated plan' },
    ...errorResponses(400, 401, 422),
  },
});

export const createPlanRoute = createRoute({
  ...secured,
  method: 'post',
  path: '/plans',
  operationId: 'createPayoffPlan',
  summary: 'Make this the plan (Jadikan Rencanaku)',
  description:
    'Ends the active plan, if any, and starts one on the first consumer account of the method. The extra payment may not exceed the money left this payday period.',
  request: { body: { ...json(createPlanBodySchema), required: true } },
  responses: {
    201: { ...json(activePlanSchema), description: 'The new active plan' },
    ...errorResponses(400, 401, 422),
  },
});

export const getActivePlanRoute = createRoute({
  ...secured,
  method: 'get',
  path: '/plans/active',
  operationId: 'getActivePayoffPlan',
  summary: 'Rencanaku',
  description:
    'The active plan: every account with its progress and tag, and the next payment with the days left.',
  responses: {
    200: { ...json(activePlanSchema), description: 'The active plan' },
    ...errorResponses(401, 404),
  },
});

export const setFocusRoute = createRoute({
  ...secured,
  method: 'patch',
  path: '/plans/active',
  operationId: 'setPayoffFocus',
  summary: 'Move the plan to another account',
  description:
    'Moves the focus of the active plan to an open consumer account ("Lanjut ke Paylater B").',
  request: { body: { ...json(setFocusBodySchema), required: true } },
  responses: {
    200: { ...json(activePlanSchema), description: 'The plan with its new focus' },
    ...errorResponses(401, 404, 422),
  },
});

export const recordPaymentRoute = createRoute({
  ...secured,
  method: 'post',
  path: '/{id}/payments',
  operationId: 'recordDebtPayment',
  summary: 'Mark a payment (Tandai Sudah Bayar)',
  description:
    'Records a payment against an open debt account. When it settles the account the response says so once, with the score the engine expects and the account the plan moves to next. A repeat of the same paymentId (double tap, retry) answers 409 PAYOFF_PAYMENT_ALREADY_RECORDED: the payment is already saved.',
  request: { params: debtParamsSchema, body: { ...json(paymentBodySchema), required: true } },
  responses: {
    200: { ...json(paymentResultSchema), description: 'The account after the payment' },
    ...errorResponses(400, 401, 404, 409, 422),
  },
});

/** Mounted at /api/payoff. */
export const payoffRouter = createRouter();
payoffRouter.use('*', requireSession);
payoffRouter.openapi(simulatePayoffRoute, simulatePayoffHandler);
payoffRouter.openapi(createPlanRoute, createPlanHandler);
payoffRouter.openapi(getActivePlanRoute, getActivePlanHandler);
payoffRouter.openapi(setFocusRoute, setFocusHandler);

/** Mounted at /api/debts. */
export const debtRouter = createRouter();
debtRouter.use('*', requireSession);
debtRouter.openapi(recordPaymentRoute, recordPaymentHandler);
