import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import type {
  createDebtRoute,
  createWalletRoute,
  listWalletsRoute,
} from './finance.routes.accounts.ts';
import { createDebt, createWallet, listWallets } from './finance.accounts.service.ts';
import type { currentBudgetRoute, saveBudgetRoute } from './finance.routes.budget.ts';
import { getCurrentBudget, saveCurrentBudget } from './finance.budget.service.ts';

export const listWalletsHandler: RouteHandler<typeof listWalletsRoute, AppEnv> = async (c) =>
  c.json(await listWallets(c.get('userId')), 200);

export const currentBudgetHandler: RouteHandler<typeof currentBudgetRoute, AppEnv> = async (c) =>
  c.json(await getCurrentBudget(c.get('userId')), 200);

export const createWalletHandler: RouteHandler<typeof createWalletRoute, AppEnv> = async (c) =>
  c.json(await createWallet(c.get('userId'), c.req.valid('json')), 201);

export const createDebtHandler: RouteHandler<typeof createDebtRoute, AppEnv> = async (c) =>
  c.json(await createDebt(c.get('userId'), c.req.valid('json')), 201);

export const saveBudgetHandler: RouteHandler<typeof saveBudgetRoute, AppEnv> = async (c) =>
  c.json(await saveCurrentBudget(c.get('userId'), c.req.valid('json')), 200);
