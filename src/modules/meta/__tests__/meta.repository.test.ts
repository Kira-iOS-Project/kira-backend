import { describe, expect, test } from 'bun:test';
import { createMetaRepository } from '../meta.repository.ts';
import { createDbMock } from './helpers.ts';

describe('createMetaRepository', () => {
  test('ping resolves when the database answers', async () => {
    const repository = createMetaRepository(createDbMock());

    expect(await repository.ping()).toBeUndefined();
  });

  test('ping sends exactly one query', async () => {
    const queries: unknown[] = [];
    const repository = createMetaRepository(
      createDbMock({
        execute: async (query) => {
          queries.push(query);
          return undefined;
        },
      }),
    );

    await repository.ping();

    expect(queries).toHaveLength(1);
  });

  test("ping rejects with the driver's error when the database does not answer", async () => {
    const repository = createMetaRepository(
      createDbMock({
        execute: async () => {
          throw new Error('connection refused');
        },
      }),
    );

    await expect(repository.ping()).rejects.toThrow('connection refused');
  });
});
