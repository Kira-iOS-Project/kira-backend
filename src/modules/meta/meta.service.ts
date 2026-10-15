/**
 * The meta module's logic: no `Context`, no HTTP. The database comes in as a default parameter
 * (AGENTS.md Rule 7), so a test passes a plain object instead of a connection.
 */

import { sql } from 'drizzle-orm';
import { db } from '../../db/client/index.ts';
import { logger } from '../../lib/server/logger.ts';
import { HealthCheckFailedError } from './meta.errors.ts';
import type { HealthResponse } from './meta.schema.ts';

/** The one call the check needs from Drizzle's client, narrow so a test can stand in for it. */
export type DbLike = { execute(query: unknown): Promise<unknown> };

/**
 * Resolves with a healthy report, or throws `HealthCheckFailedError` (503) when Postgres does not
 * answer; the handler needs no try/catch, the error reaches `app.onError`.
 */
export async function getHealthReport(deps: { db?: DbLike } = {}): Promise<HealthResponse> {
  const dbClient = deps.db ?? db;
  try {
    await dbClient.execute(sql`SELECT 1`);
  } catch (err) {
    logger.error({ err }, 'Database health check failed');
    throw new HealthCheckFailedError({ database: 'unhealthy' });
  }
  return { status: 'ok', database: 'healthy' };
}
