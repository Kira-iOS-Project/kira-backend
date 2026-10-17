import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import { createAssetHandler, listAssetsHandler, updateAssetHandler } from './asset.handler.ts';
import {
  assetIdParamSchema,
  assetSchema,
  createAssetBodySchema,
  portfolioSchema,
  updateAssetBodySchema,
} from './asset.schema.ts';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const common = { tags: ['Rencana'], security: [{ bearerAuth: [] }] };

export const listAssetsRoute = createRoute({
  ...common,
  method: 'get',
  path: '/',
  operationId: 'listAssets',
  summary: 'Portofolio Manual',
  description: 'The assets, newest value first, their total, and Utang terhadap Aset with them.',
  responses: {
    200: { ...json(portfolioSchema), description: 'The portfolio' },
    ...errorResponses(401),
  },
});

export const createAssetRoute = createRoute({
  ...common,
  method: 'post',
  path: '/',
  operationId: 'createAsset',
  summary: 'Tambah Aset',
  description: 'The score reads the new total on its next request.',
  request: { body: { ...json(createAssetBodySchema), required: true } },
  responses: {
    201: { ...json(assetSchema), description: 'Saved' },
    ...errorResponses(401, 422),
  },
});

export const updateAssetRoute = createRoute({
  ...common,
  method: 'patch',
  path: '/{id}',
  operationId: 'updateAsset',
  summary: 'Change an asset',
  request: {
    params: assetIdParamSchema,
    body: { ...json(updateAssetBodySchema), required: true },
  },
  responses: {
    200: { ...json(assetSchema), description: 'The changed asset' },
    ...errorResponses(401, 404, 422),
  },
});

export const assetRouter = createRouter();
assetRouter.use('*', requireSession);
assetRouter.openapi(listAssetsRoute, listAssetsHandler);
assetRouter.openapi(createAssetRoute, createAssetHandler);
assetRouter.openapi(updateAssetRoute, updateAssetHandler);
