import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import {
  acceptRulesHandler,
  getGroupHandler,
  getProductHandler,
  joinGroupHandler,
  listGroupsHandler,
  listProductsHandler,
  reportGroupHandler,
} from './community.handler.ts';
import {
  groupDetailSchema,
  groupIdParamsSchema,
  groupsQuerySchema,
  groupsResponseSchema,
  joinResponseSchema,
  productDetailSchema,
  productIdParamsSchema,
  productsQuerySchema,
  productsResponseSchema,
  reportBodySchema,
  reportResponseSchema,
  rulesConsentBodySchema,
} from './community.schema.ts';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const common = { tags: ['Community'], security: [{ bearerAuth: [] }] };

export const listGroupsRoute = createRoute({
  ...common,
  method: 'get',
  path: '/community/groups',
  operationId: 'listCommunityGroups',
  summary: 'The curated groups, in curation order (Komunitas)',
  request: { query: groupsQuerySchema },
  responses: {
    200: { ...json(groupsResponseSchema), description: 'Categories and active groups' },
    ...errorResponses(401, 422),
  },
});

export const getGroupRoute = createRoute({
  ...common,
  method: 'get',
  path: '/community/groups/{id}',
  operationId: 'getCommunityGroup',
  summary: 'A group, its admin and rules (Detail Grup)',
  request: { params: groupIdParamsSchema },
  responses: {
    200: { ...json(groupDetailSchema), description: 'The group' },
    ...errorResponses(401, 404, 422),
  },
});

export const acceptRulesRoute = createRoute({
  ...common,
  method: 'post',
  path: '/community/rules/consent',
  operationId: 'acceptCommunityRules',
  summary: 'Accept the current community rules (Aturan Komunitas)',
  request: { body: { ...json(rulesConsentBodySchema), required: true } },
  responses: { 204: { description: 'Accepted' }, ...errorResponses(401, 422) },
});

export const joinGroupRoute = createRoute({
  ...common,
  method: 'post',
  path: '/community/groups/{id}/join',
  operationId: 'joinCommunityGroup',
  summary: 'The verified invite link (Membuka Tautan Keluar)',
  description: 'Needs the current community rules accepted; records that the invite was opened.',
  request: { params: groupIdParamsSchema },
  responses: {
    200: { ...json(joinResponseSchema), description: 'The invite' },
    ...errorResponses(401, 404, 409, 422),
  },
});

export const reportGroupRoute = createRoute({
  ...common,
  method: 'post',
  path: '/community/groups/{id}/reports',
  operationId: 'reportCommunityGroup',
  summary: 'Report a group (Laporkan Grup)',
  description:
    'One open report a person per group. Reports from five people within 24 hours take the group ' +
    'down until the team reviews it.',
  request: { params: groupIdParamsSchema, body: { ...json(reportBodySchema), required: true } },
  responses: {
    201: { ...json(reportResponseSchema), description: 'The report' },
    ...errorResponses(401, 404, 409, 422),
  },
});

export const listProductsRoute = createRoute({
  ...common,
  method: 'get',
  path: '/community/products',
  operationId: 'listCommunityProducts',
  summary: 'The curated Etalase products',
  request: { query: productsQuerySchema },
  responses: {
    200: { ...json(productsResponseSchema), description: 'Active products' },
    ...errorResponses(401, 422),
  },
});

export const getProductRoute = createRoute({
  ...common,
  method: 'get',
  path: '/community/products/{id}',
  operationId: 'getCommunityProduct',
  summary: 'A product and its seller (Detail Produk)',
  request: { params: productIdParamsSchema },
  responses: {
    200: { ...json(productDetailSchema), description: 'The product' },
    ...errorResponses(401, 404, 422),
  },
});

/** Mounted at /api beside other routers, so the gate names its own paths instead of `*`. */
export const communityRouter = createRouter();
for (const path of ['/community', '/community/*']) {
  communityRouter.use(path, requireSession);
}
communityRouter.openapi(listGroupsRoute, listGroupsHandler);
communityRouter.openapi(getGroupRoute, getGroupHandler);
communityRouter.openapi(acceptRulesRoute, acceptRulesHandler);
communityRouter.openapi(joinGroupRoute, joinGroupHandler);
communityRouter.openapi(reportGroupRoute, reportGroupHandler);
communityRouter.openapi(listProductsRoute, listProductsHandler);
communityRouter.openapi(getProductRoute, getProductHandler);
