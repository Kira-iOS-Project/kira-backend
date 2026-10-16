import { describe, expect, test } from 'bun:test';
import {
  DEBT_KIND,
  DEBT_PAYMENT_STATUS,
  FOCUS,
  PROTECTION,
} from '../../../lib/constants/profile.ts';
import { STEP_KIND } from '../../../lib/constants/score.ts';
import { stepsFor } from '../score.steps.ts';
import { debt, DINDA, input } from './helpers.ts';

const kinds = (steps: ReturnType<typeof stepsFor>) => steps.map((step) => step.kind);

describe('stepsFor', () => {
  test("gives Dinda KiraScore's three steps with their estimated gains", () => {
    expect(stepsFor(DINDA, FOCUS.trackSpending)).toEqual([
      {
        kind: STEP_KIND.payOffDebt,
        debtName: 'Paylater A',
        remaining: 420_000,
        estimatedGain: 4,
      },
      {
        kind: STEP_KIND.buildEmergencyFund,
        currentAmount: 4_800_000,
        targetAmount: 12_600_000,
        targetMultiple: 3,
        estimatedGain: 4,
      },
      {
        kind: STEP_KIND.raiseSavings,
        currentAmount: 600_000,
        targetAmount: 750_000,
        targetPercent: 10,
        estimatedGain: 5,
      },
    ]);
  });

  test('builds the fund to 1× first, then to the target once past half of it', () => {
    const [first] = stepsFor(input({ debts: [], emergencyFund: 3_360_000 }), FOCUS.trackSpending);
    expect(first).toMatchObject({ targetMultiple: 1, targetAmount: 4_200_000 });
    const [later] = stepsFor(input({ debts: [], emergencyFund: 13_000_000 }), FOCUS.trackSpending);
    expect(later).toMatchObject({ targetMultiple: 6, targetAmount: 25_200_000 });
  });

  test('suggests protection, then 20% savings, then lighter instalments and debt', () => {
    const steps = stepsFor(
      input({
        emergencyFund: 25_200_000,
        protections: [PROTECTION.bpjsHealth],
        monthlySavings: 900_000,
        debts: [
          debt({ kind: DEBT_KIND.vehicle, monthlyInstalment: 2_400_000, remaining: 50_000_000 }),
        ],
      }),
      FOCUS.trackSpending,
    );

    expect(kinds(steps)).toEqual([
      STEP_KIND.addProtection,
      STEP_KIND.raiseSavings,
      STEP_KIND.lowerInstalments,
    ]);
    expect(steps[1]).toMatchObject({ targetPercent: 20, targetAmount: 1_500_000 });
    expect(steps[2]).toMatchObject({ targetPercent: 30, targetAmount: 2_250_000 });
  });

  test('aims instalments and debt below the strict top bounds of 10% and 20%', () => {
    const steps = stepsFor(
      input({
        emergencyFund: 25_200_000,
        monthlySavings: 1_500_000,
        debts: [
          debt({ kind: DEBT_KIND.vehicle, monthlyInstalment: 900_000, remaining: 20_000_000 }),
        ],
      }),
      FOCUS.trackSpending,
    );

    expect(steps).toEqual([
      {
        kind: STEP_KIND.lowerInstalments,
        currentAmount: 900_000,
        targetPercent: 10,
        targetAmount: 749_999,
        estimatedGain: 3,
      },
      {
        kind: STEP_KIND.lowerDebtToAsset,
        currentAmount: 20_000_000,
        targetPercent: 20,
        targetAmount: 13_019_999,
        estimatedGain: 4,
      },
    ]);
  });

  test('aims a heavy debt load at the next bound down', () => {
    const [step] = stepsFor(
      input({
        emergencyFund: 25_200_000,
        monthlySavings: 1_500_000,
        income: null,
        debts: [debt({ kind: DEBT_KIND.mortgage, remaining: 60_000_000, monthlyInstalment: 0 })],
      }),
      FOCUS.trackSpending,
    );
    expect(step).toMatchObject({ kind: STEP_KIND.lowerDebtToAsset, targetPercent: 70 });
  });

  test('has nothing to suggest when every indicator is at 100', () => {
    const healthy = input({ debts: [], emergencyFund: 25_200_000, monthlySavings: 1_500_000 });
    expect(stepsFor(healthy, FOCUS.trackSpending)).toEqual([]);
    expect(
      stepsFor(input({ ...healthy, essential: null, income: null }), FOCUS.trackSpending),
    ).toEqual([]);
  });

  test('puts relief for the heaviest online loan first for the debt-free focus', () => {
    const debts = [
      debt(),
      debt({ kind: DEBT_KIND.onlineLoan, name: 'Pinjol A', monthlyInstalment: 300_000 }),
      debt({
        kind: DEBT_KIND.onlineLoan,
        name: 'Pinjol B',
        remaining: 3_000_000,
        monthlyInstalment: 900_000,
        paymentStatus: DEBT_PAYMENT_STATUS.late,
      }),
    ];
    const [first] = stepsFor(input({ debts }), FOCUS.debtFree);

    expect(first).toMatchObject({
      kind: STEP_KIND.seekRelief,
      debtName: 'Pinjol B',
      remaining: 3_000_000,
    });
    expect(first?.estimatedGain).toBeGreaterThan(0);
    expect(kinds(stepsFor(input({ debts: [debt()] }), FOCUS.debtFree))[0]).toBe(
      STEP_KIND.payOffDebt,
    );
  });
});
