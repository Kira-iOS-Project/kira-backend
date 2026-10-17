import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import type { createAssetRoute, listAssetsRoute, updateAssetRoute } from './asset.routes.ts';
import { createAsset, listAssets, updateAsset } from './asset.service.ts';

export const listAssetsHandler: RouteHandler<typeof listAssetsRoute, AppEnv> = async (c) => {
  return c.json(await listAssets(c.get('userId')), 200);
};

export const createAssetHandler: RouteHandler<typeof createAssetRoute, AppEnv> = async (c) => {
  return c.json(await createAsset(c.get('userId'), c.req.valid('json')), 201);
};

export const updateAssetHandler: RouteHandler<typeof updateAssetRoute, AppEnv> = async (c) => {
  const { id } = c.req.valid('param');
  return c.json(await updateAsset(c.get('userId'), id, c.req.valid('json')), 200);
};
