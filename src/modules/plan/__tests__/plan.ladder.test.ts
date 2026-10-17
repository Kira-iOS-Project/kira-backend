/**
 * Tangga Keuanganmu from the score engine's facts, and the calculators' prefill. The board persona
 * (Rencana): one paylater being paid, an emergency fund of 1,1× essential spending against 6×, both
 * BPJS active — rung 1 current, 2 ahead, 3 done, 4 ahead.
 */

import { describe, expect, test } from 'bun:test';
import { LADDER_STATUS, PLAN_LADDER_STEP } from '../../../lib/constants/plan.ts';
import {
  DEBT_KIND,
  DEBT_PAYMENT_STATUS,
  MARITAL_STATUS,
  PROTECTION,
} from '../../../lib/constants/profile.ts';
import type { ScoreInput } from '../../score/index.ts';
import { ladderOf, prefillOf, type LadderDeps } from '../plan.ladder.ts';
import type { LadderRepository } from '../plan.ladder.repository.ts';

const PAYLATER: ScoreInput['debts'][number] = {
  kind: DEBT_KIND.paylater,
  name: 'Paylater A',
  remaining: 420_000,
  monthlyInstalment: 210_000,
  paymentStatus: DEBT_PAYMENT_STATUS.onTime,
};

const DINDA: ScoreInput = {
  income: 7_500_000,
  essential: 4_200_000,
  emergencyFund: 4_800_000,
  monthlySavings: 600_000,
  otherAssets: 0,
  propertyAssets: 0,
  dependents: 0,
  maritalStatus: MARITAL_STATUS.single,
  protections: [PROTECTION.bpjsHealth, PROTECTION.bpjsEmployment],
  debts: [PAYLATER],
};

const NOW = new Date('2026-10-17T05:00:00.000Z');

function deps(input: ScoreInput | null, months: { month: string; total: number }[] = []) {
  const ranges: unknown[] = [];
  const repository: LadderRepository = {
    essentialByMonth: async (_userId, from, to) => {
      ranges.push([from.toISOString(), to.toISOString()]);
      return months;
    },
  };
  const options: LadderDeps = {
    scoreInput: async () => input,
    payingNow: async () => ({ id: 'debt-a', name: 'Paylater A' }),
    repository,
    now: () => NOW,
  };
  return { options, ranges };
}

describe('ladderOf', () => {
  test('the board persona: paying Paylater A, 1,1× of 6×, protected, investing ahead', async () => {
    const ladder = await ladderOf('user-1', deps(DINDA).options);

    const { done, current, todo } = LADDER_STATUS;
    expect(ladder.map((step) => [step.step, step.key, step.status])).toEqual([
      [1, PLAN_LADDER_STEP.payOffDebt, current],
      [2, PLAN_LADDER_STEP.emergencyFund, todo],
      [3, PLAN_LADDER_STEP.protection, done],
      [4, PLAN_LADDER_STEP.invest, todo],
    ]);
    expect(ladder[0]?.detail).toMatchObject({ debtName: 'Paylater A', amount: 420_000 });
    expect(ladder[1]?.detail).toMatchObject({
      amount: 4_800_000,
      target: 25_200_000,
      multiple: 1.1,
      targetMultiple: 6,
    });
    expect(ladder[2]?.detail).toMatchObject({ health: true, incomeCover: true });
  });

  test('every rung met: 1–3 done and investing becomes the current one', async () => {
    const free = { ...DINDA, debts: [], emergencyFund: 25_200_000 };
    const ladder = await ladderOf('user-1', deps(free).options);

    expect(ladder.map((step) => step.status)).toEqual(['done', 'done', 'done', 'current']);
    expect(ladder[0]?.detail).toMatchObject({ debtName: null, amount: 0 });
  });

  test('no protection and no essential figure: rung 2 current, no multiple', async () => {
    const bare = { ...DINDA, debts: [], essential: null, protections: [] };
    const ladder = await ladderOf('user-1', deps(bare).options);

    expect(ladder.map((step) => step.status)).toEqual(['done', 'current', 'todo', 'todo']);
    expect(ladder[1]?.detail.multiple).toBeNull();
    expect(ladder[2]?.detail).toMatchObject({ health: false, incomeCover: false });
  });

  test('before the health check every rung is ahead, with no detail', async () => {
    const ladder = await ladderOf('user-1', deps(null).options);

    expect(ladder.map((step) => step.status)).toEqual(['todo', 'todo', 'todo', 'todo']);
    expect(ladder[0]?.detail.amount).toBeNull();
  });
});

describe('prefillOf', () => {
  test('averages the essential spending of the months that have any, from three whole months', async () => {
    const months = [
      { month: '2026-07', total: 4_000_000 },
      { month: '2026-08', total: 0 },
      { month: '2026-09', total: 4_400_001 },
    ];
    const { options, ranges } = deps(DINDA, months);

    expect(await prefillOf('user-1', options)).toEqual({
      essentialExpense: 4_200_001,
      emergencyFund: 4_800_000,
      married: false,
      dependants: 0,
      monthlyIncome: 7_500_000,
    });
    /** 1 July to 1 October 2026, WIB midnight. */
    expect(ranges).toEqual([['2026-06-30T17:00:00.000Z', '2026-09-30T17:00:00.000Z']]);
  });

  test('reads the clock itself when none is given', async () => {
    const { options } = deps(DINDA);
    const { now: _now, ...withoutClock } = options;
    expect((await prefillOf('user-1', withoutClock)).essentialExpense).toBe(4_200_000);
  });

  test("falls back to the health check's figure, and knows nothing before it", async () => {
    expect((await prefillOf('user-1', deps(DINDA).options)).essentialExpense).toBe(4_200_000);
    const married = { ...DINDA, maritalStatus: MARITAL_STATUS.married, dependents: 2 };
    expect(await prefillOf('user-1', deps(married).options)).toMatchObject({
      married: true,
      dependants: 2,
    });
    expect(await prefillOf('user-1', deps(null).options)).toEqual({
      essentialExpense: null,
      emergencyFund: null,
      married: null,
      dependants: null,
      monthlyIncome: null,
    });
    const unsaid = { ...DINDA, maritalStatus: null };
    expect((await prefillOf('user-1', deps(unsaid).options)).married).toBeNull();
  });
});
