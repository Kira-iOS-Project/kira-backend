/**
 * The meta module's business rules: no `Context`, no HTTP, no query. Data access comes from the
 * module's repository, injected as a default parameter (AGENTS.md Rules 4 and 7), so a test passes
 * a plain object instead of a database.
 */

import { logger } from '../../lib/server/logger.ts';
import { HealthCheckFailedError } from './meta.errors.ts';
import { type MetaRepository, metaRepository } from './meta.repository.ts';
import type { HealthResponse } from './meta.schema.ts';

/**
 * Resolves with a healthy report, or throws `HealthCheckFailedError` (503) when Postgres does not
 * answer; the handler needs no try/catch, the error reaches `app.onError`.
 */
export async function getHealthReport(
  deps: { repository?: MetaRepository } = {},
): Promise<HealthResponse> {
  const repository = deps.repository ?? metaRepository;
  try {
    await repository.ping();
  } catch (err) {
    logger.error({ err }, 'Database health check failed');
    throw new HealthCheckFailedError({ database: 'unhealthy' });
  }
  return { status: 'ok', database: 'healthy' };
}
