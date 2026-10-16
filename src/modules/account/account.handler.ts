import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import type {
  deleteAccountRoute,
  emailExportRoute,
  exportDataRoute,
  getConsentsRoute,
  getMeRoute,
  updateConsentsRoute,
  updateMeRoute,
} from './account.routes.ts';
import {
  deleteAccount,
  emailExport,
  exportData,
  getConsents,
  getMe,
  updateConsents,
  updateMe,
} from './account.service.ts';

export const getMeHandler: RouteHandler<typeof getMeRoute, AppEnv> = async (c) => {
  return c.json(await getMe(c.get('userId')), 200);
};

export const updateMeHandler: RouteHandler<typeof updateMeRoute, AppEnv> = async (c) => {
  return c.json(await updateMe(c.get('userId'), c.req.valid('json')), 200);
};

export const getConsentsHandler: RouteHandler<typeof getConsentsRoute, AppEnv> = async (c) => {
  return c.json(await getConsents(c.get('userId')), 200);
};

export const updateConsentsHandler: RouteHandler<typeof updateConsentsRoute, AppEnv> = async (
  c,
) => {
  return c.json(await updateConsents(c.get('userId'), c.req.valid('json')), 200);
};

export const exportDataHandler: RouteHandler<typeof exportDataRoute, AppEnv> = async (c) => {
  const { fileName, csv } = await exportData(c.get('userId'));
  return c.body(csv, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${fileName}"`,
  });
};

export const emailExportHandler: RouteHandler<typeof emailExportRoute, AppEnv> = async (c) => {
  await emailExport(c.get('userId'));
  return c.body(null, 202);
};

export const deleteAccountHandler: RouteHandler<typeof deleteAccountRoute, AppEnv> = async (c) => {
  await deleteAccount(c.get('userId'));
  return c.body(null, 204);
};
