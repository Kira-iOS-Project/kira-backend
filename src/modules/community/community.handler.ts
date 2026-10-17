import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import type {
  acceptRulesRoute,
  getGroupRoute,
  getProductRoute,
  joinGroupRoute,
  listGroupsRoute,
  listProductsRoute,
  reportGroupRoute,
} from './community.routes.ts';
import {
  acceptRules,
  getGroup,
  getProduct,
  joinGroup,
  listGroups,
  listProducts,
  reportGroup,
} from './community.service.ts';

export const listGroupsHandler: RouteHandler<typeof listGroupsRoute, AppEnv> = async (c) => {
  return c.json(await listGroups(c.req.valid('query')), 200);
};

export const getGroupHandler: RouteHandler<typeof getGroupRoute, AppEnv> = async (c) => {
  return c.json(await getGroup(c.get('userId'), c.req.valid('param').id), 200);
};

export const acceptRulesHandler: RouteHandler<typeof acceptRulesRoute, AppEnv> = async (c) => {
  await acceptRules(c.get('userId'), c.req.valid('json').version);
  return c.body(null, 204);
};

export const joinGroupHandler: RouteHandler<typeof joinGroupRoute, AppEnv> = async (c) => {
  return c.json(await joinGroup(c.get('userId'), c.req.valid('param').id), 200);
};

export const reportGroupHandler: RouteHandler<typeof reportGroupRoute, AppEnv> = async (c) => {
  const { id } = c.req.valid('param');
  return c.json(await reportGroup(c.get('userId'), id, c.req.valid('json')), 201);
};

export const listProductsHandler: RouteHandler<typeof listProductsRoute, AppEnv> = async (c) => {
  return c.json(await listProducts(c.req.valid('query')), 200);
};

export const getProductHandler: RouteHandler<typeof getProductRoute, AppEnv> = async (c) => {
  return c.json(await getProduct(c.req.valid('param').id), 200);
};
