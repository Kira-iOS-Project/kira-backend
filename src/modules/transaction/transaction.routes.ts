import { createRoute } from '@hono/zod-openapi';
import { chatMessageSchema } from '../../lib/chat/chat-message.ts';
import { errorResponses } from '../../lib/errors/problem.ts';
import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import {
  createTransactionHandler,
  deleteTransactionHandler,
  getTransactionHandler,
  listTransactionsHandler,
  summarizeTransactionsHandler,
  undoBatchHandler,
  updateTransactionHandler,
} from './transaction.handler.ts';
import {
  batchIdParamSchema,
  createTransactionBodySchema,
  listTransactionsQuerySchema,
  manualSavedResponseSchema,
  summaryQuerySchema,
  transactionDetailSchema,
  transactionIdParamSchema,
  transactionPageSchema,
  transactionSchema,
  transactionSummarySchema,
  updateTransactionBodySchema,
} from './transaction.schema.ts';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const common = { tags: ['Catat'], security: [{ bearerAuth: [] }] };

export const createTransactionRoute = createRoute({
  ...common,
  method: 'post',
  path: '/',
  operationId: 'createTransaction',
  summary: 'Save a manual entry (Catat Manual)',
  description: 'Spends no quota and adds Kira’s note to the chat. Idempotent on `clientId`.',
  request: { body: { ...json(createTransactionBodySchema), required: true } },
  responses: {
    201: { ...json(manualSavedResponseSchema), description: 'Saved' },
    ...errorResponses(401, 422),
  },
});

export const listTransactionsRoute = createRoute({
  ...common,
  method: 'get',
  path: '/',
  operationId: 'listTransactions',
  summary: 'Riwayat Transaksi, newest first',
  request: { query: listTransactionsQuerySchema },
  responses: {
    200: { ...json(transactionPageSchema), description: 'A page of transactions' },
    ...errorResponses(401, 422),
  },
});

export const summarizeTransactionsRoute = createRoute({
  ...common,
  method: 'get',
  path: '/summary',
  operationId: 'summarizeTransactions',
  summary: 'Totals out and in for a range of days',
  request: { query: summaryQuerySchema },
  responses: {
    200: { ...json(transactionSummarySchema), description: 'The totals' },
    ...errorResponses(401, 422),
  },
});

export const undoBatchRoute = createRoute({
  ...common,
  method: 'delete',
  path: '/batches/{batchId}',
  operationId: 'undoTransactionBatch',
  summary: 'Urungkan a chat save',
  description: 'Within 30 seconds of the save: deletes its transactions and puts the drafts back.',
  request: { params: batchIdParamSchema },
  responses: {
    200: { ...json(chatMessageSchema), description: 'The reply with its drafts pending again' },
    ...errorResponses(401, 404, 409, 422),
  },
});

export const getTransactionRoute = createRoute({
  ...common,
  method: 'get',
  path: '/{id}',
  operationId: 'getTransaction',
  summary: 'Detail Transaksi',
  request: { params: transactionIdParamSchema },
  responses: {
    200: { ...json(transactionDetailSchema), description: 'The transaction and its source' },
    ...errorResponses(401, 404, 422),
  },
});

export const updateTransactionRoute = createRoute({
  ...common,
  method: 'patch',
  path: '/{id}',
  operationId: 'updateTransaction',
  summary: 'Edit a transaction',
  request: {
    params: transactionIdParamSchema,
    body: { ...json(updateTransactionBodySchema), required: true },
  },
  responses: {
    200: { ...json(transactionSchema), description: 'The edited transaction' },
    ...errorResponses(401, 404, 422),
  },
});

export const deleteTransactionRoute = createRoute({
  ...common,
  method: 'delete',
  path: '/{id}',
  operationId: 'deleteTransaction',
  summary: 'Delete a transaction',
  request: { params: transactionIdParamSchema },
  responses: { 204: { description: 'Deleted' }, ...errorResponses(401, 404, 422) },
});

export const transactionRouter = createRouter();
transactionRouter.use('*', requireSession);
transactionRouter.openapi(createTransactionRoute, createTransactionHandler);
transactionRouter.openapi(listTransactionsRoute, listTransactionsHandler);
transactionRouter.openapi(summarizeTransactionsRoute, summarizeTransactionsHandler);
transactionRouter.openapi(undoBatchRoute, undoBatchHandler);
transactionRouter.openapi(getTransactionRoute, getTransactionHandler);
transactionRouter.openapi(updateTransactionRoute, updateTransactionHandler);
transactionRouter.openapi(deleteTransactionRoute, deleteTransactionHandler);
