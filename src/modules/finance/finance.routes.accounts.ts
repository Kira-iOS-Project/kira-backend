import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { walletListSchema } from './finance.accounts.schema.ts';

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
