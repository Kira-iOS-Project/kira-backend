import { describe, expect, test } from 'bun:test';
import { HealthCheckFailedError } from '../meta.errors.ts';
import { getHealthReport } from '../meta.service.ts';
import { createMetaRepositoryMock } from './helpers.ts';

describe('getHealthReport', () => {
  test('resolves ok when the repository reaches the database', async () => {
    expect(await getHealthReport({ repository: createMetaRepositoryMock() })).toEqual({
      status: 'ok',
      database: 'healthy',
    });
  });

  test('throws a 503 HealthCheckFailedError when the repository cannot', async () => {
    const repository = createMetaRepositoryMock({
      ping: async () => {
        throw new Error('connection refused');
      },
    });

    const failure = await getHealthReport({ repository }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HealthCheckFailedError);
    expect(failure).toMatchObject({ statusCode: 503, code: 'META_HEALTH_UNHEALTHY' });
  });
});
