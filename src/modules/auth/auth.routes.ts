import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { createRouter } from '../../lib/server/factory.ts';
import {
  refreshHandler,
  requestCodeHandler,
  signOutHandler,
  verifyCodeHandler,
} from './auth.handler.ts';
import { requireSession } from './auth.middleware.ts';
import {
  codeRequestedResponseSchema,
  refreshBodySchema,
  requestCodeBodySchema,
  sessionTokensResponseSchema,
  signedInResponseSchema,
  verifyCodeBodySchema,
} from './auth.schema.ts';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });

export const requestCodeRoute = createRoute({
  method: 'post',
  path: '/code',
  operationId: 'requestSignInCode',
  tags: ['Auth'],
  summary: 'Email a sign-in code',
  description:
    'Sends a six-digit code to the address through Resend, retiring any earlier one. Answers the same whether or not the address has an account.',
  request: { body: { ...json(requestCodeBodySchema), required: true } },
  responses: {
    202: { ...json(codeRequestedResponseSchema), description: 'The code is on its way' },
    ...errorResponses(422, 429, 503),
  },
});

export const verifyCodeRoute = createRoute({
  method: 'post',
  path: '/verify',
  operationId: 'verifySignInCode',
  tags: ['Auth'],
  summary: 'Sign in with the code',
  description: 'Checks the code and opens a session, creating the account on a first sign-in.',
  request: { body: { ...json(verifyCodeBodySchema), required: true } },
  responses: {
    200: { ...json(signedInResponseSchema), description: 'Signed in' },
    ...errorResponses(400, 422, 429),
  },
});

export const refreshRoute = createRoute({
  method: 'post',
  path: '/refresh',
  operationId: 'refreshSession',
  tags: ['Auth'],
  summary: 'Trade a refresh token for a new pair',
  request: { body: { ...json(refreshBodySchema), required: true } },
  responses: {
    200: { ...json(sessionTokensResponseSchema), description: 'A new token pair' },
    ...errorResponses(401, 422),
  },
});

export const signOutRoute = createRoute({
  method: 'post',
  path: '/sign-out',
  operationId: 'signOut',
  tags: ['Auth'],
  summary: 'End this session',
  security: [{ bearerAuth: [] }],
  responses: {
    204: { description: 'Signed out' },
    ...errorResponses(401),
  },
});

export const authRouter = createRouter();
authRouter.use('/sign-out', requireSession);
authRouter.openapi(requestCodeRoute, requestCodeHandler);
authRouter.openapi(verifyCodeRoute, verifyCodeHandler);
authRouter.openapi(refreshRoute, refreshHandler);
authRouter.openapi(signOutRoute, signOutHandler);
