import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import {
  cancelHandler,
  changePaymentMethodHandler,
  checkoutHandler,
  giftHandler,
  invoicesHandler,
  plansHandler,
  subscriptionHandler,
} from './billing.handler.ts';
import {
  checkoutBodySchema,
  giftBodySchema,
  giftResponseSchema,
  invoicesResponseSchema,
  paymentMethodBodySchema,
  plansResponseSchema,
  subscriptionSchema,
} from './billing.schema.ts';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const common = { tags: ['Billing'], security: [{ bearerAuth: [] }] };

export const plansRoute = createRoute({
  ...common,
  method: 'get',
  path: '/plans',
  operationId: 'listPlans',
  summary: 'The plans, their prices and quotas, and the current one',
  responses: {
    200: { ...json(plansResponseSchema), description: 'Paket Kira' },
    ...errorResponses(401),
  },
});

export const checkoutRoute = createRoute({
  ...common,
  method: 'post',
  path: '/billing/checkout',
  operationId: 'checkout',
  summary: 'Buy a plan (simulated: nothing is charged)',
  description: 'Activates the plan now, replacing any active one, and writes an invoice.',
  request: { body: { ...json(checkoutBodySchema), required: true } },
  responses: {
    200: { ...json(subscriptionSchema), description: 'The new subscription' },
    ...errorResponses(401, 422),
  },
});

export const subscriptionRoute = createRoute({
  ...common,
  method: 'get',
  path: '/subscription',
  operationId: 'getSubscription',
  summary: 'The active subscription and this quota period’s usage',
  responses: {
    200: { ...json(subscriptionSchema), description: 'Langganan' },
    ...errorResponses(401, 404),
  },
});

export const cancelRoute = createRoute({
  ...common,
  method: 'post',
  path: '/subscription/cancel',
  operationId: 'cancelSubscription',
  summary: 'Cancel at the end of the current period',
  responses: {
    200: { ...json(subscriptionSchema), description: 'Cancelled at period end' },
    ...errorResponses(401, 404, 409),
  },
});

export const changePaymentMethodRoute = createRoute({
  ...common,
  method: 'put',
  path: '/subscription/payment-method',
  operationId: 'changePaymentMethod',
  summary: 'Choose how the subscription is paid',
  request: { body: { ...json(paymentMethodBodySchema), required: true } },
  responses: {
    200: { ...json(subscriptionSchema), description: 'The updated subscription' },
    ...errorResponses(401, 404, 409, 422),
  },
});

export const invoicesRoute = createRoute({
  ...common,
  method: 'get',
  path: '/billing/invoices',
  operationId: 'listInvoices',
  summary: 'The latest 50 invoices, newest first',
  responses: {
    200: { ...json(invoicesResponseSchema), description: 'Riwayat Tagihan' },
    ...errorResponses(401),
  },
});

export const giftRoute = createRoute({
  ...common,
  method: 'post',
  path: '/billing/gifts',
  operationId: 'giftMonths',
  summary: 'Traktir Kira: buy months of Kira Plus for Beasiswa Kira (simulated)',
  request: { body: { ...json(giftBodySchema), required: true } },
  responses: {
    201: { ...json(giftResponseSchema), description: 'The gift' },
    ...errorResponses(401, 422),
  },
});

/** Mounted at /api beside other routers, so the gate names its own paths instead of `*`. */
export const billingRouter = createRouter();
for (const path of ['/plans', '/billing/*', '/subscription', '/subscription/*']) {
  billingRouter.use(path, requireSession);
}
billingRouter.openapi(plansRoute, plansHandler);
billingRouter.openapi(checkoutRoute, checkoutHandler);
billingRouter.openapi(subscriptionRoute, subscriptionHandler);
billingRouter.openapi(cancelRoute, cancelHandler);
billingRouter.openapi(changePaymentMethodRoute, changePaymentMethodHandler);
billingRouter.openapi(invoicesRoute, invoicesHandler);
billingRouter.openapi(giftRoute, giftHandler);
