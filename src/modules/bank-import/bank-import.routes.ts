import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import { commitImportHandler, createImportHandler } from './bank-import.handler.ts';
import {
  commitImportBodySchema,
  createImportBodySchema,
  importIdParamSchema,
  importResultSchema,
  importSchema,
} from './bank-import.schema.ts';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const common = { tags: ['Catat'], security: [{ bearerAuth: [] }] };

export const createImportRoute = createRoute({
  ...common,
  method: 'post',
  path: '/',
  operationId: 'createBankImport',
  summary: 'Keep a parsed bank statement for review (Kira Plus)',
  description: 'At most three months per file; rows already recorded are flagged `isDuplicate`.',
  request: { body: { ...json(createImportBodySchema), required: true } },
  responses: {
    201: { ...json(importSchema), description: 'The rows to review' },
    ...errorResponses(400, 401, 403, 422),
  },
});

export const commitImportRoute = createRoute({
  ...common,
  method: 'post',
  path: '/{id}/commit',
  operationId: 'commitBankImport',
  summary: 'Save the reviewed rows',
  description: 'Atomic and idempotent: a second commit answers the first one’s counts.',
  request: {
    params: importIdParamSchema,
    body: { ...json(commitImportBodySchema), required: true },
  },
  responses: {
    200: { ...json(importResultSchema), description: 'Saved and skipped counts' },
    ...errorResponses(400, 401, 404, 422),
  },
});

export const bankImportRouter = createRouter();
bankImportRouter.use('*', requireSession);
bankImportRouter.openapi(createImportRoute, createImportHandler);
bankImportRouter.openapi(commitImportRoute, commitImportHandler);
