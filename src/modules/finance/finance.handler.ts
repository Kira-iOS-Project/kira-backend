import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import type { listWalletsRoute } from './finance.routes.accounts.ts';
import type {
  createBillRoute,
  getBillRoute,
  listBillsRoute,
  updateBillRoute,
} from './finance.routes.bills.ts';
import { listWallets } from './finance.accounts.service.ts';
import { createBill, getBill, listBills, updateBill } from './finance.bills.service.ts';
import type { currentBudgetRoute } from './finance.routes.budget.ts';
import type { currentBudgetEditRoute, updateCurrentBudgetRoute } from './finance.routes.budget.ts';
import {
  getCurrentBudget,
  getCurrentBudgetEdit,
  updateCurrentBudget,
} from './finance.budget.service.ts';

export const listWalletsHandler: RouteHandler<typeof listWalletsRoute, AppEnv> = async (c) =>
  c.json(await listWallets(c.get('userId')), 200);

export const listBillsHandler: RouteHandler<typeof listBillsRoute, AppEnv> = async (c) =>
  c.json(await listBills(c.get('userId')), 200);

export const createBillHandler: RouteHandler<typeof createBillRoute, AppEnv> = async (c) =>
  c.json(await createBill(c.get('userId'), c.req.valid('json')), 201);

export const getBillHandler: RouteHandler<typeof getBillRoute, AppEnv> = async (c) =>
  c.json(await getBill(c.get('userId'), c.req.valid('param').id), 200);

export const updateBillHandler: RouteHandler<typeof updateBillRoute, AppEnv> = async (c) =>
  c.json(await updateBill(c.get('userId'), c.req.valid('param').id, c.req.valid('json')), 200);

export const currentBudgetHandler: RouteHandler<typeof currentBudgetRoute, AppEnv> = async (c) =>
  c.json(await getCurrentBudget(c.get('userId')), 200);

export const currentBudgetEditHandler: RouteHandler<typeof currentBudgetEditRoute, AppEnv> = async (
  c,
) => c.json(await getCurrentBudgetEdit(c.get('userId')), 200);

export const updateCurrentBudgetHandler: RouteHandler<
  typeof updateCurrentBudgetRoute,
  AppEnv
> = async (c) => c.json(await updateCurrentBudget(c.get('userId'), c.req.valid('json')), 200);
