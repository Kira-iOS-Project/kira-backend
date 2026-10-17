/**
 * The composition root: middleware, the error handler and the route mounts. No route and no
 * database access lives here; each module brings its own router.
 */

import { bodyLimit } from 'hono/body-limit';
import { serveStatic } from 'hono/bun';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { timeout } from 'hono/timeout';
import { env } from './env.ts';
import { handleAppError, handleNotFound } from './lib/errors/problem.ts';
import { createRouter } from './lib/server/factory.ts';
import { requestLogger } from './middlewares/logger.middleware.ts';
import { accountRouter } from './modules/account/index.ts';
import { assetRouter } from './modules/asset/index.ts';
import { authRouter } from './modules/auth/index.ts';
import { bankImportRouter } from './modules/bank-import/index.ts';
import { billingRouter } from './modules/billing/index.ts';
import { careRouter } from './modules/care/index.ts';
import { chatRouter } from './modules/chat/index.ts';
import { communityRouter } from './modules/community/index.ts';
import { homeRouter } from './modules/home/index.ts';
import { metaApp } from './modules/meta/index.ts';
import { scholarshipRouter } from './modules/scholarship/index.ts';
import { debtRouter, payoffRouter } from './modules/payoff/index.ts';
import { planRouter } from './modules/plan/index.ts';
import { healthCheckRouter, scoreRouter } from './modules/score/index.ts';
import { transactionRouter } from './modules/transaction/index.ts';
import { usageRouter } from './modules/usage/index.ts';

export const app = createRouter();

/** ── Middleware ───────────────────────────────────────────────────────────
   The order is part of the contract (AGENTS.md Rules 39 to 41, .claude/rules/backend/hono.md):

     requestId      first, so every log line below can be correlated
     secureHeaders  before any response body can be produced
     cors           an allowlist; a disallowed origin gets no CORS headers
     requestLogger  correlation exists by now, so the log line carries it

   Then the request budget on /api/*, cheapest rejection first:

     bodyLimit      refuse an oversized body before reading it
     timeout        cap the handler's total time (a 504 problem) */
app.use('*', requestId());
app.use('*', secureHeaders());
app.use('*', cors({ origin: env.CORS_ORIGINS, exposeHeaders: ['X-Request-Id'], maxAge: 600 }));
app.use('*', requestLogger);

/** bodyLimit's own error is a plain-text 413; a message-only HTTPException keeps it problem+json. */
app.use(
  '/api/*',
  bodyLimit({
    maxSize: env.BODY_LIMIT_BYTES,
    onError: () => {
      throw new HTTPException(413, { message: 'Request body is too large.' });
    },
  }),
);
app.use('/api/*', timeout(env.REQUEST_TIMEOUT_MS));

/** ── Errors ───────────────────────────────────────────────────────────────
   Every thrown error, the 413 and the 504 above included, becomes problem+json here. */
app.onError(handleAppError);
app.notFound(handleNotFound);

/** ── Routes ───────────────────────────────────────────────────────────────
   The health check sits at /, outside the /api budget, so it answers whatever that budget says.
   Feature modules mount under /api. The images the emails show (src/lib/email/layout.ts) are
   files under public/email/, served outside /api the same way. */
app.route('/', metaApp);
app.get('/email/*', serveStatic({ root: './public' }));
app.route('/api/auth', authRouter);
app.route('/api/me', accountRouter);
app.route('/api/health-check', healthCheckRouter);
app.route('/api/score', scoreRouter);
app.route('/api/payoff', payoffRouter);
app.route('/api/debts', debtRouter);
app.route('/api/assets', assetRouter);
app.route('/api/home', homeRouter);
app.route('/api', billingRouter);
app.route('/api', scholarshipRouter);
app.route('/api', communityRouter);
app.route('/api', careRouter);
app.route('/api', planRouter);
app.route('/api/usage', usageRouter);
app.route('/api/chat', chatRouter);
app.route('/api/transactions', transactionRouter);
app.route('/api/imports', bankImportRouter);

/** Protected routes declare `security: [{ bearerAuth: [] }]`; this names the scheme they use. */
app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
});
