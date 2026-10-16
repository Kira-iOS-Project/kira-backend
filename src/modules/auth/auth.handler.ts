import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import type {
  refreshRoute,
  requestCodeRoute,
  signOutRoute,
  verifyCodeRoute,
} from './auth.routes.ts';
import { refreshSession, requestCode, signOut, verifyCode } from './auth.service.ts';
import { clientIp } from './auth.tokens.ts';

export const requestCodeHandler: RouteHandler<typeof requestCodeRoute, AppEnv> = async (c) => {
  const { email } = c.req.valid('json');
  const result = await requestCode({ email, ip: clientIp((name) => c.req.header(name)) });
  return c.json(result, 202);
};

export const verifyCodeHandler: RouteHandler<typeof verifyCodeRoute, AppEnv> = async (c) => {
  const ip = clientIp((name) => c.req.header(name));
  return c.json(await verifyCode({ ...c.req.valid('json'), ip }), 200);
};

export const refreshHandler: RouteHandler<typeof refreshRoute, AppEnv> = async (c) => {
  return c.json(await refreshSession(c.req.valid('json').refreshToken), 200);
};

export const signOutHandler: RouteHandler<typeof signOutRoute, AppEnv> = async (c) => {
  await signOut(c.get('sessionId'));
  return c.body(null, 204);
};
