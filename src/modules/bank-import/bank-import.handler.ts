import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import type { commitImportRoute, createImportRoute } from './bank-import.routes.ts';
import { commitImport, createImport } from './bank-import.service.ts';

export const createImportHandler: RouteHandler<typeof createImportRoute, AppEnv> = async (c) => {
  return c.json(await createImport(c.get('userId'), c.req.valid('json')), 201);
};

export const commitImportHandler: RouteHandler<typeof commitImportRoute, AppEnv> = async (c) => {
  const { id } = c.req.valid('param');
  return c.json(await commitImport(c.get('userId'), id, c.req.valid('json')), 200);
};
