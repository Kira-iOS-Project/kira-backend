import { ServiceUnavailableError } from '../../lib/errors/errors.ts';

/**
 * Thrown by `meta.service.ts` when a dependency check fails. The client gets a generic sentence;
 * which dependency failed goes to the log line only.
 */
export class HealthCheckFailedError extends ServiceUnavailableError {
  constructor(report: { database: string }) {
    super(
      'One or more dependencies are unhealthy.',
      `database=${report.database}`,
      'META_HEALTH_UNHEALTHY',
    );
  }
}
