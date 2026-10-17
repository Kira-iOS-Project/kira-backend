/**
 * The plan routes through the real app, the session gate, request validation, the real error
 * mapper and the shared Postgres double answering by statement.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { EMERGENCY_MILESTONE, GOAL_KIND } from '../../../lib/constants/plan.ts';
import type { FakeQuery, FakeRow } from '../../../test/fake-postgres.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';
import { DEPOSIT_ID, GOAL_ID, goalDbRow } from './helpers.ts';

beforeEach(() => resetExternalMocks());

function send(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const reads = (query: FakeQuery) => query.sql.startsWith('select');
/** Answers every read of "goals" with Dinda's emergency fund. */
const withGoal = (query: FakeQuery): FakeRow[] =>
  reads(query) && query.sql.includes('from "goals"') ? [goalDbRow()] : [];

const EMERGENCY = {
  kind: GOAL_KIND.emergencyFund,
  name: 'Dana Darurat',
  inputs: { essentialExpense: 4_200_000, married: false, dependants: 0 },
  initialAmount: 4_800_000,
  monthlyDeposit: 650_000,
  targetAmount: 25_200_000,
  targetDate: '2029-04-25',
};

describe('GET /api/plan', () => {
  test('answers 401 without a session', async () => {
    expect((await app.request('/api/plan')).status).toBe(401);
  });

  test('answers the ladder, the goals, the risk profile and the prefill', async () => {
    dbControl.respond = signedIn(withGoal);
    const res = await send('GET', '/api/plan');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ladder).toHaveLength(4);
    expect(body.goals.map((goal: { id: string }) => goal.id)).toEqual([GOAL_ID]);
    expect(body.prefill).toMatchObject({ monthlyIncome: null });
  });
});

describe('GET /api/goals', () => {
  test('answers the goals', async () => {
    dbControl.respond = signedIn(withGoal);
    const res = await send('GET', '/api/goals');
    expect(res.status).toBe(200);
    expect((await res.json()).goals[0]).toMatchObject({ id: GOAL_ID, savedAmount: 4_800_000 });
  });
});

describe('POST /api/goals', () => {
  test('answers 201 with the saved goal', async () => {
    dbControl.respond = signedIn((query) =>
      query.sql.startsWith('insert into "goals"') ? [{ id: GOAL_ID }] : withGoal(query),
    );
    const res = await send('POST', '/api/goals', EMERGENCY);
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe(GOAL_ID);
  });

  test('answers 409 GOAL_EMERGENCY_EXISTS for a second emergency fund', async () => {
    dbControl.respond = signedIn((query) => {
      if (query.sql.startsWith('insert into "goals"')) {
        throw Object.assign(new Error('duplicate key'), {
          code: '23505',
          constraint_name: 'goals_emergency_owner_idx',
        });
      }
      return [];
    });
    const res = await send('POST', '/api/goals', EMERGENCY);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('GOAL_EMERGENCY_EXISTS');
  });

  test.each([
    ['a blank name', { name: ' ' }],
    ['a target of 0', { targetAmount: 0 }],
    ['a target over Rp999.999.999.999', { targetAmount: 1_000_000_000_000 }],
    ['a target date in the past', { targetDate: '2020-01-01' }],
    ['an unknown kind', { kind: 'holiday' }],
    ['an emergency fund without its essential spending', { inputs: { married: false } }],
  ])('refuses %s with a 422', async (_, change) => {
    dbControl.respond = signedIn();
    const res = await send('POST', '/api/goals', { ...EMERGENCY, ...change });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('VALIDATION_FAILED');
  });
});

describe('GET /api/goals/{id}', () => {
  test('answers the goal with its deposits and milestones', async () => {
    dbControl.respond = signedIn(withGoal);
    const res = await send('GET', `/api/goals/${GOAL_ID}`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.deposits).toEqual([]);
    expect(body.milestones.map((milestone: { key: string }) => milestone.key)).toEqual(
      Object.values(EMERGENCY_MILESTONE),
    );
  });

  test('answers 404 GOAL_NOT_FOUND for a goal that is not theirs', async () => {
    dbControl.respond = signedIn();
    const res = await send('GET', `/api/goals/${GOAL_ID}`);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('GOAL_NOT_FOUND');
  });

  test('refuses an id that is not a uuid with a 422', async () => {
    dbControl.respond = signedIn();
    expect((await send('GET', '/api/goals/abc')).status).toBe(422);
  });
});

describe('PATCH /api/goals/{id}', () => {
  test('answers the changed goal', async () => {
    dbControl.respond = signedIn((query) =>
      query.sql.startsWith('update "goals"') ? [{ id: GOAL_ID }] : withGoal(query),
    );
    const res = await send('PATCH', `/api/goals/${GOAL_ID}`, { monthlyDeposit: 700_000 });
    expect(res.status).toBe(200);
  });

  test('answers 404 GOAL_NOT_FOUND for an unknown goal', async () => {
    dbControl.respond = signedIn();
    const res = await send('PATCH', `/api/goals/${GOAL_ID}`, { monthlyDeposit: 700_000 });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('GOAL_NOT_FOUND');
  });

  test('refuses an empty change with a 422', async () => {
    dbControl.respond = signedIn();
    expect((await send('PATCH', `/api/goals/${GOAL_ID}`, {})).status).toBe(422);
  });
});

describe('POST /api/goals/{id}/deposits', () => {
  const deposit = { depositId: DEPOSIT_ID, amount: 650_000, depositedOn: '2026-09-25' };
  /** The deposit read back by its id; the goal's own read also sums deposits, so it is excluded. */
  const stored = (goalId: string) => (query: FakeQuery) =>
    reads(query) &&
    query.sql.includes('from "goal_deposits"') &&
    !query.sql.includes('from "goals"')
      ? [{ id: DEPOSIT_ID, goalId, amount: 650_000, depositedOn: '2026-09-25' }]
      : withGoal(query);

  test('answers 201 with the deposit, the same for a retry of its id', async () => {
    dbControl.respond = signedIn(stored(GOAL_ID));
    const res = await send('POST', `/api/goals/${GOAL_ID}/deposits`, deposit);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      id: DEPOSIT_ID,
      amount: 650_000,
      depositedOn: '2026-09-25',
    });
  });

  test('answers 409 GOAL_DEPOSIT_CONFLICT for an id used on another goal', async () => {
    dbControl.respond = signedIn(stored('7c3e4051-6d7f-4081-8c9d-1e2f3a4b5c6d'));
    const res = await send('POST', `/api/goals/${GOAL_ID}/deposits`, deposit);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('GOAL_DEPOSIT_CONFLICT');
  });

  test('answers 404 GOAL_NOT_FOUND for an unknown goal', async () => {
    dbControl.respond = signedIn();
    const res = await send('POST', `/api/goals/${GOAL_ID}/deposits`, deposit);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('GOAL_NOT_FOUND');
  });

  test.each([
    ['an amount of 0', { amount: 0 }],
    ['a day in the future', { depositedOn: '2999-01-01' }],
    ['a deposit id that is not a uuid', { depositId: 'x' }],
  ])('refuses %s with a 422', async (_, change) => {
    dbControl.respond = signedIn();
    const res = await send('POST', `/api/goals/${GOAL_ID}/deposits`, { ...deposit, ...change });
    expect(res.status).toBe(422);
  });
});

describe('/api/risk-profile', () => {
  test('answers 401 without a session', async () => {
    expect((await app.request('/api/risk-profile')).status).toBe(401);
  });

  test('refuses four answers, or an option past the fourth, with a 422', async () => {
    dbControl.respond = signedIn();
    expect((await send('PUT', '/api/risk-profile', { answers: [0, 1, 2, 3] })).status).toBe(422);
    expect((await send('PUT', '/api/risk-profile', { answers: [0, 1, 2, 3, 4] })).status).toBe(422);
  });
});
