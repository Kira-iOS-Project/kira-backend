import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import type {
  createDebtRoute,
  createWalletRoute,
  getDebtRoute,
  listWalletsRoute,
} from './finance.routes.accounts.ts';
import { createDebt, createWallet, listWallets } from './finance.accounts.service.ts';
import { getDebtDetail } from './finance.accounts.detail.service.ts';

export const listWalletsHandler: RouteHandler<typeof listWalletsRoute, AppEnv> = async (c) =>
  c.json(await listWallets(c.get('userId')), 200);

export const createWalletHandler: RouteHandler<typeof createWalletRoute, AppEnv> = async (c) =>
  c.json(await createWallet(c.get('userId'), c.req.valid('json')), 201);

export const createDebtHandler: RouteHandler<typeof createDebtRoute, AppEnv> = async (c) =>
  c.json(await createDebt(c.get('userId'), c.req.valid('json')), 201);

export const getDebtHandler: RouteHandler<typeof getDebtRoute, AppEnv> = async (c) =>
  c.json(await getDebtDetail(c.get('userId'), c.req.valid('param').id), 200);
