import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import { createBill, deleteBill, listBills, updateBill } from './finance.bills.service.ts';
import type {
  createBillRoute,
  deleteBillRoute,
  listBillsRoute,
  updateBillRoute,
} from './finance.routes.bills.ts';

export const listBillsHandler: RouteHandler<typeof listBillsRoute, AppEnv> = async (c) =>
  c.json(await listBills(c.get('userId')), 200);

export const createBillHandler: RouteHandler<typeof createBillRoute, AppEnv> = async (c) =>
  c.json(await createBill(c.get('userId'), c.req.valid('json')), 201);

export const updateBillHandler: RouteHandler<typeof updateBillRoute, AppEnv> = async (c) =>
  c.json(await updateBill(c.get('userId'), c.req.valid('param').id, c.req.valid('json')), 200);

export const deleteBillHandler: RouteHandler<typeof deleteBillRoute, AppEnv> = async (c) => {
  await deleteBill(c.get('userId'), c.req.valid('param').id);
  return c.body(null, 204);
};
