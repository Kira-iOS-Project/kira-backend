import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { resetExternalMocks } from '../../../test/preload.ts';

const billPath = '/api/bills/00000000-0000-4000-8000-000000000001';

beforeEach(() => resetExternalMocks());

describe('bill detail routes', () => {
  test('requires a session for both read and schedule updates', async () => {
    const get = await app.request(billPath);
    const patch = await app.request(billPath, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Internet baru' }),
    });

    expect(get.status).toBe(401);
    expect(patch.status).toBe(401);
  });
});
