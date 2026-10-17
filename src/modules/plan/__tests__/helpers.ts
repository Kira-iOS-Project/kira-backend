/**
 * Fixtures for the plan module: Dinda's emergency fund from the DetailTujuan board (pokok
 * Rp4.200.000, target 6× Rp25.200.000 by April 2029, Rp4.800.000 already saved, Rp650.000 a
 * month) and a repository double.
 */

import { app } from '../../../app.ts';
import { GOAL_KIND } from '../../../lib/constants/plan.ts';
import { AUTH_HEADER } from '../../../test/session.ts';
import type { GoalRepository, GoalRow } from '../plan.goal.repository.ts';

export const GOAL_ID = '5a1c2e3f-4b5d-4e6f-8a7b-9c0d1e2f3a4b';
export const DEPOSIT_ID = '6b2d3f40-5c6e-4f70-9b8c-0d1e2f3a4b5c';
const CREATED_AT = new Date('2026-07-01T03:00:00.000Z');

export function goalRow(overrides: Partial<GoalRow> = {}): GoalRow {
  return {
    id: GOAL_ID,
    kind: GOAL_KIND.emergencyFund,
    name: 'Dana Darurat',
    inputs: { essentialExpense: 4_200_000, married: false, dependants: 0, returnRate: 4 },
    initialAmount: 4_800_000,
    monthlyDeposit: 650_000,
    targetAmount: 25_200_000,
    targetDate: '2029-04-25',
    inBudget: false,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    savedAmount: 4_800_000,
    ...overrides,
  };
}

/** The same goal as the database double answers it: the select's column order, ISO times. */
export function goalDbRow(overrides: Partial<GoalRow> = {}) {
  const row = goalRow(overrides);
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createGoalRepositoryMock(overrides: Partial<GoalRepository> = {}): GoalRepository {
  return {
    listGoals: async () => [goalRow()],
    findGoal: async () => goalRow(),
    insertGoal: async () => goalRow(),
    updateGoal: async () => true,
    deleteGoal: async () => true,
    listDeposits: async () => [],
    listAllDeposits: async () => [],
    insertDeposit: async (deposit) => deposit,
    ...overrides,
  };
}

/** A request to the app as the signed-in test person. */
export function send(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Dinda's emergency fund as Tujuan Baru sends it. */
export const EMERGENCY = {
  kind: GOAL_KIND.emergencyFund,
  name: 'Dana Darurat',
  inputs: { essentialExpense: 4_200_000, married: false, dependants: 0 },
  initialAmount: 4_800_000,
  monthlyDeposit: 650_000,
  targetAmount: 25_200_000,
  targetDate: '2029-04-25',
};
