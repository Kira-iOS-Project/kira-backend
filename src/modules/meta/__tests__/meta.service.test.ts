import { describe, expect, test } from 'bun:test';
import { HealthCheckFailedError } from '../meta.errors.ts';
import { getHealthReport } from '../meta.service.ts';
import { createDbMock } from './helpers.ts';

describe('getHealthReport', () => {
  test('resolves ok when the database answers', async () => {
    expect(await getHealthReport({ db: createDbMock() })).toEqual({
      status: 'ok',
      database: 'healthy',
    });
  });

  test('throws a 503 HealthCheckFailedError when the database does not', async () => {
    const db = createDbMock({
      execute: async () => {
        throw new Error('connection refused');
      },
    });

    const failure = await getHealthReport({ db }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HealthCheckFailedError);
    expect(failure).toMatchObject({ statusCode: 503, code: 'META_HEALTH_UNHEALTHY' });
  });
});
