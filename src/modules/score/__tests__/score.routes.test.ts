/**
 * The score routes through the real app: the session gate, request validation, the real error
 * mapper and the shared Postgres double answering by statement.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { FOCUS, MARITAL_STATUS } from '../../../lib/constants/profile.ts';
import { INDICATOR, SNAPSHOT_REASON } from '../../../lib/constants/score.ts';
import type { FakeQuery, FakeResponder, FakeRow } from '../../../test/fake-postgres.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, onKiraPlus, signedIn } from '../../../test/session.ts';
import { DINDA_ANSWERS, DINDA_DEBTS, NOW } from './helpers.ts';

beforeEach(() => resetExternalMocks());

/** Riwayat Skor is Kira Plus: the history tests run on it. */
const onPlus = (next?: FakeResponder) => signedIn(onKiraPlus(next));

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

describe('GET /api/score/history', () => {
  /** Last month's 25th point, one rung lower in emergency fund. */
  const SEPTEMBER = {
    reason: SNAPSHOT_REASON.monthly,
    periodStart: '2026-09-25',
    createdAt: '2026-09-24T17:00:00.000Z',
    score: 62,
    indicators: {
      [INDICATOR.emergencyFund]: 25,
      [INDICATOR.savingsRatio]: 50,
      [INDICATOR.instalmentRatio]: 75,
      [INDICATOR.consumerDebt]: 25,
      [INDICATOR.debtToAsset]: 75,
      [INDICATOR.protection]: 100,
    },
    measures: null,
  };
  /** A health check redone on 20 September, before this payday period (from 25 September). */
  const REDONE = {
    ...SEPTEMBER,
    reason: SNAPSHOT_REASON.healthCheck,
    periodStart: '2026-08-25',
    createdAt: '2026-09-20T03:00:00.000Z',
    score: 58,
  };

  /**
   * The score reads, the plotted snapshots, and the snapshot before this period: its score alone
   * for GET /score's delta, every column for the history's.
   */
  function withHistory(query: FakeQuery): FakeRow[] {
    const snapshots = query.sql.includes('from "score_snapshots"');
    if (snapshots && query.sql.includes(' desc')) {
      return query.sql.includes('"reason"') ? [REDONE] : [{ score: REDONE.score }];
    }
    if (snapshots && query.sql.includes(' asc')) {
      return query.params.includes(SNAPSHOT_REASON.monthly) ? [SEPTEMBER] : [REDONE];
    }
    return scored(query);
  }

  test('answers 401 without a session', async () => {
    const res = await app.request('/api/score/history');
    expect(res.status).toBe(401);
  });

  test('answers 404 SCORE_NOT_AVAILABLE before the health check', async () => {
    dbControl.respond = onPlus();
    const res = await request('/api/score/history');

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('SCORE_NOT_AVAILABLE');
  });

  test('refuses an unknown range with a 422', async () => {
    dbControl.respond = onPlus(scored);
    const res = await request('/api/score/history?range=2y');

    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('VALIDATION_FAILED');
  });

  test("answers the history with GET /score's delta, from the same snapshot", async () => {
    dbControl.respond = onPlus(withHistory);
    const score = await (await request('/api/score')).json();
    const res = await request('/api/score/history?range=1y');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.points).toEqual([{ month: '2026-09', score: 62 }]);
    expect(body.current.deltaFromPrevious).toBe(score.delta);
    expect(body.current.deltaFromPrevious).toBe(body.current.score - 58);
    expect(body.current.previousMonth).toBe('2026-09');
    expect(body.unchangedCount + body.changes.length).toBe(6);
  });

  test('answers 403 PLAN_FEATURE_UNAVAILABLE outside Kira Plus', async () => {
    dbControl.respond = signedIn(scored);
    const res = await app.request('/api/score/history', { headers: AUTH_HEADER });

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PLAN_FEATURE_UNAVAILABLE');
  });
});
