/**
 * The app's one real connection pool (AGENTS.md Rules 17 and 38).
 *
 * `{ max: 1 }` belongs only to `migrate.ts`, where migrations run one statement after another on a
 * connection of their own. Here the pool is sized from the environment, and the two timeouts are
 * what keep one stuck query or one forgotten transaction from holding a connection forever.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../../env.ts';
import { SERVICE_NAME } from '../../lib/constants/service.ts';

/** postgres.js opens no connection before the first query, so the pool is built even where
   DATABASE_URL is unset: the unit tests replace this module, and the OpenAPI export never queries. */
export const client = postgres(env.DATABASE_URL ?? '', {
  max: env.DB_POOL_MAX,
  idle_timeout: 30 /** seconds: release idle connections back to Postgres */,
  connect_timeout: 10 /** seconds: fail fast instead of hanging a request */,
  max_lifetime: 60 * 30 /** seconds: recycle connections so pooled state cannot rot */,
  prepare: env.DB_PREPARE,
  connection: {
    application_name: SERVICE_NAME,
    statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
    idle_in_transaction_session_timeout: 30_000,
  },
});

export const db = drizzle(client);
