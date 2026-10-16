/**
 * `requireSession`: the gate every protected router puts in front of its routes. It resolves the
 * bearer token to its session and sets `userId` and `sessionId` on the context, or answers 401.
 */

import { factory } from '../../lib/server/factory.ts';
import { authenticate } from './auth.service.ts';

export const requireSession = factory.createMiddleware(async (c, next) => {
  const { userId, sessionId } = await authenticate(c.req.header('authorization'));
  c.set('userId', userId);
  c.set('sessionId', sessionId);
  await next();
});
