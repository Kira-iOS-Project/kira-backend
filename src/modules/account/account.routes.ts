import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import {
  deleteAccountHandler,
  emailExportHandler,
  exportDataHandler,
  getConsentsHandler,
  getMeHandler,
  updateConsentsHandler,
  updateMeHandler,
} from './account.handler.ts';
import {
  consentsSchema,
  csvSchema,
  deletionBodySchema,
  meSchema,
  updateConsentsBodySchema,
  updateMeBodySchema,
} from './account.schema.ts';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const common = { tags: ['Account'], security: [{ bearerAuth: [] }] };

export const getMeRoute = createRoute({
  ...common,
  method: 'get',
  path: '/',
  operationId: 'getMe',
  summary: 'The signed-in account',
  description:
    'Identity, settings, plan and quota usage, payday period and consent flags (Profil).',
  responses: { 200: { ...json(meSchema), description: 'The account' }, ...errorResponses(401) },
});

export const updateMeRoute = createRoute({
  ...common,
  method: 'patch',
  path: '/',
  operationId: 'updateMe',
  summary: 'Change the focus, hidden balances or payday',
  request: { body: { ...json(updateMeBodySchema), required: true } },
  responses: {
    200: { ...json(meSchema), description: 'The account after the change' },
    ...errorResponses(401, 422),
  },
});

export const getConsentsRoute = createRoute({
  ...common,
  method: 'get',
  path: '/consents',
  operationId: 'getConsents',
  summary: 'The consents in force',
  responses: {
    200: { ...json(consentsSchema), description: 'One decision per purpose' },
    ...errorResponses(401),
  },
});

export const updateConsentsRoute = createRoute({
  ...common,
  method: 'put',
  path: '/consents',
  operationId: 'updateConsents',
  summary: 'Record consent decisions',
  description:
    'Appends one row per purpose under the current privacy policy. The first call also records the core purpose and finishes onboarding.',
  request: { body: { ...json(updateConsentsBodySchema), required: true } },
  responses: {
    200: { ...json(consentsSchema), description: 'The consents in force' },
    ...errorResponses(401, 422),
  },
});

export const exportDataRoute = createRoute({
  ...common,
  method: 'get',
  path: '/export',
  operationId: 'exportData',
  summary: 'Download every transaction as CSV',
  responses: {
    200: {
      content: { 'text/csv': { schema: csvSchema } },
      description: 'kira-data-YYYY-MM-DD.csv, as an attachment',
    },
    ...errorResponses(401),
  },
});

export const emailExportRoute = createRoute({
  ...common,
  method: 'post',
  path: '/export/email',
  operationId: 'emailDataExport',
  summary: 'Email the CSV export to the account address',
  responses: { 202: { description: 'The email is on its way' }, ...errorResponses(401, 429, 503) },
});

export const deleteAccountRoute = createRoute({
  ...common,
  method: 'post',
  path: '/deletion',
  operationId: 'deleteAccount',
  summary: 'Delete the account and all its data',
  description:
    'The confirmation must read HAPUS (any case). Sends the deletion notice, then removes the account, its sessions, its subscription and every record.',
  request: { body: { ...json(deletionBodySchema), required: true } },
  responses: { 204: { description: 'Deleted' }, ...errorResponses(401, 422) },
});

export const accountRouter = createRouter();
accountRouter.use('*', requireSession);
accountRouter.openapi(getMeRoute, getMeHandler);
accountRouter.openapi(updateMeRoute, updateMeHandler);
accountRouter.openapi(getConsentsRoute, getConsentsHandler);
accountRouter.openapi(updateConsentsRoute, updateConsentsHandler);
accountRouter.openapi(exportDataRoute, exportDataHandler);
accountRouter.openapi(emailExportRoute, emailExportHandler);
accountRouter.openapi(deleteAccountRoute, deleteAccountHandler);
