import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';

beforeEach(() => resetExternalMocks());

describe('weekly summary route', () => {
  test('requires a session and returns a Thursday-Wednesday summary', async () => {
    expect((await app.request('/api/summaries/weekly?week=2026-10-15')).status).toBe(401);

    dbControl.respond = signedIn(() => []);
    const response = await app.request('/api/summaries/weekly?week=2026-10-15', {
      headers: AUTH_HEADER,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      period: { from: '2026-10-15', to: '2026-10-21' },
      totals: { expense: 0, income: 0, net: 0 },
      previous: { expense: 0, income: 0, net: 0 },
      days: Array.from({ length: 7 }, (_, offset) => ({
        date: new Date(Date.parse('2026-10-15T00:00:00Z') + offset * 86_400_000)
          .toISOString()
          .slice(0, 10),
        expense: 0,
        income: 0,
      })),
      topCategories: [],
      note: null,
    });
  });

  test('requires week to be an ISO Thursday', async () => {
    dbControl.respond = signedIn(() => []);
    const response = await app.request('/api/summaries/weekly?week=2026-10-16', {
      headers: AUTH_HEADER,
    });
    expect(response.status).toBe(422);
  });
});
