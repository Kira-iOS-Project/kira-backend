import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import type {
  cancelRoute,
  changePaymentMethodRoute,
  checkoutRoute,
  giftRoute,
  invoicesRoute,
  plansRoute,
  subscriptionRoute,
} from './billing.routes.ts';
import {
  cancelSubscription,
  changePaymentMethod,
  checkout,
  getSubscription,
  giftMonths,
  listInvoices,
  listPlans,
} from './billing.service.ts';

export const plansHandler: RouteHandler<typeof plansRoute, AppEnv> = async (c) => {
  return c.json(await listPlans(c.get('userId')), 200);
};

export const checkoutHandler: RouteHandler<typeof checkoutRoute, AppEnv> = async (c) => {
  return c.json(await checkout(c.get('userId'), c.req.valid('json')), 200);
};

export const subscriptionHandler: RouteHandler<typeof subscriptionRoute, AppEnv> = async (c) => {
  return c.json(await getSubscription(c.get('userId')), 200);
};

export const cancelHandler: RouteHandler<typeof cancelRoute, AppEnv> = async (c) => {
  return c.json(await cancelSubscription(c.get('userId')), 200);
};

export const changePaymentMethodHandler: RouteHandler<
  typeof changePaymentMethodRoute,
  AppEnv
> = async (c) => {
  const { paymentMethod } = c.req.valid('json');
  return c.json(await changePaymentMethod(c.get('userId'), paymentMethod), 200);
};

export const invoicesHandler: RouteHandler<typeof invoicesRoute, AppEnv> = async (c) => {
  return c.json(await listInvoices(c.get('userId')), 200);
};

export const giftHandler: RouteHandler<typeof giftRoute, AppEnv> = async (c) => {
  return c.json(await giftMonths(c.get('userId'), c.req.valid('json')), 201);
};
