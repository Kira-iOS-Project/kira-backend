/**
 * GET /api/home through the real app, with the score module's own reads answered by the shared
 * Postgres double: a new person who took the health check and has no transaction yet.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { HOME_VARIANT } from '../../../lib/constants/home.ts';
import { FOCUS } from '../../../lib/constants/profile.ts';
import type { FakeQuery, FakeRow } from '../../../test/fake-postgres.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';

beforeEach(() => resetExternalMocks());

function newcomer(query: FakeQuery): FakeRow[] {
  if (query.sql.includes('"display_name"')) {
    return [
      {
        displayName: 'Dinda',
        hideBalances: false,
        focus: FOCUS.trackSpending,
        paydayDay: 25,
        paydayEndOfMonth: false,
        completedAt: new Date().toISOString(),
        income: 7_500_000,
        essential: 4_200_000,
        emergencyFund: 3_360_000,
      },
    ];
  }
  if (query.sql.includes('left join "financial_profiles"')) {
    return [
      {
        focus: FOCUS.trackSpending,
        paydayDay: 25,
        paydayEndOfMonth: false,
        completedAt: new Date().toISOString(),
        income: 7_500_000,
        essential: 4_200_000,
        emergencyFund: 3_360_000,
        monthlySavings: 600_000,
        otherAssets: null,
        propertyAssets: null,
        dependents: 0,
        maritalStatus: null,
        protections: '{}',
      },
    ];
  }
  if (query.sql.includes('count('))
    return [{ count: 1, latestInPeriodAt: new Date().toISOString() }];
  return [];
}

describe('GET /api/home', () => {
  test('answers 401 without a session', async () => {
    expect((await app.request('/api/home')).status).toBe(401);
  });

  test('answers the first-steps layout with the score from the health check', async () => {
    dbControl.respond = signedIn(newcomer);
    const res = await app.request('/api/home', { headers: AUTH_HEADER });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.variant).toBe(HOME_VARIANT.firstSteps);
    expect(body.score).toMatchObject({ isInitial: true, delta: null });
    expect(body.checklist).toMatchObject({ healthCheck: true, paydaySet: true });
  });
});
