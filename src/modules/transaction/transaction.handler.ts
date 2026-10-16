import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import { undoBatch } from '../draft-batch/index.ts';
import { listTransactions, summarizeTransactions } from './transaction.list.service.ts';
import type {
  createTransactionRoute,
  deleteTransactionRoute,
  getTransactionRoute,
  listTransactionsRoute,
  summarizeTransactionsRoute,
  undoBatchRoute,
  updateTransactionRoute,
} from './transaction.routes.ts';
import {
  createManual,
  deleteTransaction,
  getTransaction,
  updateTransaction,
} from './transaction.service.ts';

export const createTransactionHandler: RouteHandler<typeof createTransactionRoute, AppEnv> = async (
  c,
) => {
  return c.json(await createManual(c.get('userId'), c.req.valid('json')), 201);
};

export const listTransactionsHandler: RouteHandler<typeof listTransactionsRoute, AppEnv> = async (
  c,
) => {
  return c.json(await listTransactions(c.get('userId'), c.req.valid('query')), 200);
};

export const summarizeTransactionsHandler: RouteHandler<
  typeof summarizeTransactionsRoute,
  AppEnv
> = async (c) => {
  return c.json(await summarizeTransactions(c.get('userId'), c.req.valid('query')), 200);
};

export const getTransactionHandler: RouteHandler<typeof getTransactionRoute, AppEnv> = async (
  c,
) => {
  return c.json(await getTransaction(c.get('userId'), c.req.valid('param').id), 200);
};

export const updateTransactionHandler: RouteHandler<typeof updateTransactionRoute, AppEnv> = async (
  c,
) => {
  const { id } = c.req.valid('param');
  return c.json(await updateTransaction(c.get('userId'), id, c.req.valid('json')), 200);
};

export const deleteTransactionHandler: RouteHandler<typeof deleteTransactionRoute, AppEnv> = async (
  c,
) => {
  await deleteTransaction(c.get('userId'), c.req.valid('param').id);
  return c.body(null, 204);
};

export const undoBatchHandler: RouteHandler<typeof undoBatchRoute, AppEnv> = async (c) => {
  return c.json(await undoBatch(c.get('userId'), c.req.valid('param').batchId), 200);
};
