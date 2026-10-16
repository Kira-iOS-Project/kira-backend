/**
 * The one home of the Hono context type and of router creation.
 *
 * `AppEnv` carries the context variables every route shares. Nothing outside this file calls
 * `new OpenAPIHono()` or `new Hono()`: `app.ts` and every module's `<name>.routes.ts` go through
 * `createRouter()`, so the 422 `defaultHook` and the context type are the same everywhere.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { createFactory } from 'hono/factory';
import type { RequestIdVariables } from 'hono/request-id';
import { validationHook } from '../errors/problem.ts';

export type AppEnv = {
  /** `userId` and `sessionId` are set by the auth module's `requireSession` on every protected
     router; the sign-in routes run without it and never read them. */
  Variables: RequestIdVariables & { userId: string; sessionId: string };
};

/** Typed middleware: `factory.createMiddleware()` instead of `createMiddleware<AppEnv>()`. */
export const factory = createFactory<AppEnv>();

/** Every router, the app's own included. */
export function createRouter() {
  return new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
}
