/**
 * One log line when a request starts and one when it ends, each carrying the correlation id that
 * `requestId()` set and that also goes out as the `X-Request-Id` header (AGENTS.md Rule 40). The
 * path is logged without its query string, which can carry a token.
 */

import { factory } from '../lib/server/factory.ts';
import { logger } from '../lib/server/logger.ts';

export const requestLogger = factory.createMiddleware(async (c, next) => {
  const { method, path } = c.req;
  const requestId = c.get('requestId');
  const start = performance.now();

  logger.info({ requestId, method, path }, 'Request started');
  await next();
  logger.info(
    {
      requestId,
      method,
      path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - start),
    },
    'Request completed',
  );
});
