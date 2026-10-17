import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import {
  createDebtBodySchema,
  debtCreateResponseSchema,
  debtDetailSchema,
  debtParamsSchema,
  createWalletBodySchema,
  walletCreateResponseSchema,
  walletListSchema,
} from './finance.accounts.schema.ts';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const protectedRoute = { tags: ['Finance'], security: [{ bearerAuth: [] }] };

export const listWalletsRoute = createRoute({
  ...protectedRoute,
  method: 'get',
  path: '/wallets',
  operationId: 'listWallets',
  summary: 'Wallets and total held balance',
  responses: {
    200: { ...json(walletListSchema), description: 'Owned wallets' },
    ...errorResponses(401),
  },
});

export const createWalletRoute = createRoute({
  ...protectedRoute,
  method: 'post',
  path: '/wallets',
  operationId: 'createWallet',
  summary: 'Add a wallet or a debt account',
  request: { body: { ...json(createWalletBodySchema), required: true } },
  responses: {
    201: { ...json(walletCreateResponseSchema), description: 'Created wallet or debt account' },
    ...errorResponses(401, 422),
  },
});

export const createDebtRoute = createRoute({
  ...protectedRoute,
  method: 'post',
  path: '/debts',
  operationId: 'createDebt',
  summary: 'Add a debt account',
  request: { body: { ...json(createDebtBodySchema), required: true } },
  responses: {
    201: { ...json(debtCreateResponseSchema), description: 'Created debt account' },
    ...errorResponses(401, 422),
  },
});

export const getDebtRoute = createRoute({
  ...protectedRoute,
  method: 'get',
  path: '/debts/{id}',
  operationId: 'getDebtDetail',
  summary: 'Debt account detail and installment history',
  request: { params: debtParamsSchema },
  responses: {
    200: { ...json(debtDetailSchema), description: 'Owned debt account detail' },
    ...errorResponses(401, 404),
  },
});
