/**
 * The score routes through the real app: the session gate, request validation, the real error
 * mapper and the shared Postgres double answering by statement.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { FOCUS, MARITAL_STATUS } from '../../../lib/constants/profile.ts';
import { INDICATOR } from '../../../lib/constants/score.ts';
import type { FakeQuery, FakeRow } from '../../../test/fake-postgres.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';
import { DINDA_ANSWERS, DINDA_DEBTS, NOW } from './helpers.ts';

beforeEach(() => resetExternalMocks());

const STATE = {
  focus: FOCUS.trackSpending,
  paydayDay: 25,
  paydayEndOfMonth: false,
  completedAt: NOW.toISOString(),
  ...DINDA_ANSWERS,
  protections: `{${DINDA_ANSWERS.protections.join(',')}}`,
};

/** Answers the score module's reads for a person who has taken the health check. */
function scored(query: FakeQuery): FakeRow[] {
  if (query.sql.includes('left join "financial_profiles"')) return [STATE];
  if (query.sql.includes('from "debt_accounts"')) return DINDA_DEBTS;
  if (query.sql.includes('count(')) return [{ count: 1, latestInPeriodAt: NOW.toISOString() }];
  return [];
}

function request(path: string, init: RequestInit = {}) {
  return app.request(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
  });
}

describe('GET /api/score', () => {
  test('answers 401 without a session', async () => {
    const res = await app.request('/api/score');
    expect(res.status).toBe(401);
  });

  test('answers 404 SCORE_NOT_AVAILABLE before the health check', async () => {
    dbControl.respond = signedIn();
    const res = await request('/api/score');

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('SCORE_NOT_AVAILABLE');
  });

  test('answers the report', async () => {
    dbControl.respond = signedIn(scored);
    const res = await request('/api/score');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.score).toBe(66);
    expect(body.steps).toHaveLength(3);
  });
});

describe('GET /api/score/indicators/{key}', () => {
  test('answers the indicator detail', async () => {
    dbControl.respond = signedIn(scored);
    const res = await request(`/api/score/indicators/${INDICATOR.debtToAsset}`);

    expect(res.status).toBe(200);
    expect((await res.json()).nextRung.points).toBe(100);
  });

  test('refuses an unknown indicator with a 422', async () => {
    dbControl.respond = signedIn(scored);
    expect((await request('/api/score/indicators/mood')).status).toBe(422);
  });
});

describe('PUT /api/health-check', () => {
  const body = {
    netMonthlyIncome: 7_500_000,
    payday: { day: 25, endOfMonth: false },
    essentialMonthlyExpenses: 4_200_000,
    debts: [],
    emergencyFund: 4_800_000,
    monthlySavings: 600_000,
    otherAssets: null,
    propertyAssets: null,
    dependents: 0,
    maritalStatus: MARITAL_STATUS.single,
    protections: [],
  };

  test('saves the answers and answers the score', async () => {
    dbControl.respond = signedIn(scored);
    const res = await request('/api/health-check', { method: 'PUT', body: JSON.stringify(body) });

    expect(res.status).toBe(200);
    expect((await res.json()).score).toBe(66);
    expect(
      dbControl.queries.some((query) => query.sql.startsWith('insert into "financial_profiles"')),
    ).toBe(true);
  });

  test('refuses more than three dependents with a 422', async () => {
    dbControl.respond = signedIn(scored);
    const res = await request('/api/health-check', {
      method: 'PUT',
      body: JSON.stringify({ ...body, dependents: 4 }),
    });
    expect(res.status).toBe(422);
  });
});
