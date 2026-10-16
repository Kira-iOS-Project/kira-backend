import { describe, expect, test } from 'bun:test';
import {
  DEBT_KIND,
  DEBT_PAYMENT_STATUS,
  MARITAL_STATUS,
  PROTECTION,
} from '../../../lib/constants/profile.ts';
import { INDICATOR, INDICATOR_GROUP, SCORE_BAND } from '../../../lib/constants/score.ts';
import { bandOf, factsOf, pointsOf, scoreOf, targetMultipleOf } from '../score.engine.ts';
import { evaluate } from '../score.measure.ts';
import { debt, DINDA, input } from './helpers.ts';

const pointsFor = (overrides: Parameters<typeof input>[0]) => pointsOf(factsOf(input(overrides)));

describe('the board example', () => {
  test('scores Dinda 66 with the points, groups and measures of KiraScore', () => {
    const result = evaluate(DINDA);

    expect(result.points).toEqual({
      [INDICATOR.emergencyFund]: 50,
      [INDICATOR.savingsRatio]: 45,
      [INDICATOR.instalmentRatio]: 70,
      [INDICATOR.consumerDebt]: 50,
      [INDICATOR.debtToAsset]: 80,
      [INDICATOR.protection]: 100,
    });
    expect(result.score).toBe(66);
    expect(result.band).toBe(SCORE_BAND.coping);
    expect(result.cappedByConsumerDebt).toBe(false);
    expect(result.groups).toEqual([
      { group: INDICATOR_GROUP.save, points: 48, band: SCORE_BAND.coping },
      { group: INDICATOR_GROUP.debt, points: 67, band: SCORE_BAND.coping },
      { group: INDICATOR_GROUP.protect, points: 100, band: SCORE_BAND.healthy },
    ]);
    expect(result.indicators.map((item) => item.measure)).toEqual([
      {
        ratio: 1.1,
        liquid: 4_800_000,
        essential: 4_200_000,
        targetMultiple: 6,
        targetAmount: 25_200_000,
      },
      { percent: 8, monthlySavings: 600_000, income: 7_500_000 },
      { percent: 18, monthlyInstalments: 1_350_000, income: 7_500_000 },
      { platforms: 2, anyLate: false, anyOverdue: false },
      { percent: 32, totalDebt: 14_310_000, totalAssets: 44_700_000 },
      { health: true, income: true },
    ]);
    expect(result.indicators[0]).toMatchObject({
      key: INDICATOR.emergencyFund,
      group: INDICATOR_GROUP.save,
      band: SCORE_BAND.coping,
    });
  });

  test('rounds HasilCekAwal 61,7 up to 62', () => {
    expect(scoreOf({ ...pointsOf(factsOf(DINDA)), [INDICATOR.emergencyFund]: 25 })).toBe(62);
  });
});

describe('emergency fund', () => {
  test('targets 6× single, 9× married, plus 3× per dependent, at most 15×', () => {
    expect(targetMultipleOf({ maritalStatus: null, dependents: 0 })).toBe(6);
    expect(targetMultipleOf({ maritalStatus: MARITAL_STATUS.married, dependents: 1 })).toBe(12);
    expect(targetMultipleOf({ maritalStatus: MARITAL_STATUS.married, dependents: 3 })).toBe(15);
  });

  test.each([
    [25_200_000, 100],
    [12_600_000, 75],
    [4_200_000, 50],
    [2_100_000, 25],
    [2_099_999, 0],
  ])('%p against 4,2 juta essential scores %p', (emergencyFund, points) => {
    expect(pointsFor({ emergencyFund })[INDICATOR.emergencyFund]).toBe(points);
  });

  test('scores 0 when essential spending was skipped', () => {
    expect(pointsFor({ essential: null })[INDICATOR.emergencyFund]).toBe(0);
    expect(evaluate(input({ essential: null })).indicators[0]?.measure).toMatchObject({ ratio: 0 });
  });
});

describe('savings ratio', () => {
  test.each([
    [1_500_000, 100],
    [750_000, 75],
    [375_000, 45],
    [75_000, 25],
    [74_999, 0],
  ])('%p of 7,5 juta scores %p', (monthlySavings, points) => {
    expect(pointsFor({ monthlySavings })[INDICATOR.savingsRatio]).toBe(points);
  });

  test('scores 0 without an income, shown as 0%', () => {
    expect(pointsFor({ income: null })[INDICATOR.savingsRatio]).toBe(0);
    expect(evaluate(input({ income: null })).indicators[1]?.measure).toMatchObject({ percent: 0 });
  });
});

describe('instalment ratio', () => {
  const withInstalment = (monthlyInstalment: number) =>
    pointsFor({ debts: [debt({ kind: DEBT_KIND.vehicle, monthlyInstalment })] })[
      INDICATOR.instalmentRatio
    ];

  test.each([
    [749_999, 100],
    [750_000, 85],
    [1_125_000, 85],
    [2_250_000, 70],
    [3_000_000, 40],
    [3_000_001, 0],
  ])('%p of 7,5 juta scores %p', (instalment, points) => {
    expect(withInstalment(instalment)).toBe(points);
  });

  test('scores 100 without debts and 0 with debts but no income', () => {
    expect(pointsFor({ debts: [] })[INDICATOR.instalmentRatio]).toBe(100);
    expect(pointsFor({ income: null })[INDICATOR.instalmentRatio]).toBe(0);
  });
});

describe('consumer debt', () => {
  const consumer = (debts: ReturnType<typeof debt>[]) =>
    pointsFor({ debts })[INDICATOR.consumerDebt];

  test('counts open paylater, online loans and credit cards, not productive debt', () => {
    expect(consumer([])).toBe(100);
    expect(consumer([debt({ kind: DEBT_KIND.mortgage })])).toBe(100);
    expect(consumer([debt()])).toBe(75);
    expect(consumer([debt(), debt({ kind: DEBT_KIND.onlineLoan })])).toBe(50);
    expect(consumer([debt(), debt(), debt({ kind: DEBT_KIND.creditCard })])).toBe(50);
    expect(consumer([debt(), debt(), debt(), debt()])).toBe(25);
  });

  test('scores lateness 25 and arrears 0, which caps the band at Rentan', () => {
    expect(consumer([debt({ paymentStatus: DEBT_PAYMENT_STATUS.late })])).toBe(25);
    const overdue = input({ debts: [debt({ paymentStatus: DEBT_PAYMENT_STATUS.overdue })] });
    expect(pointsOf(factsOf(overdue))[INDICATOR.consumerDebt]).toBe(0);
    const result = evaluate(overdue);
    expect(bandOf(result.score)).toBe(SCORE_BAND.coping);
    expect(result.band).toBe(SCORE_BAND.vulnerable);
    expect(result.cappedByConsumerDebt).toBe(true);
  });
});

describe('debt to assets', () => {
  const withDebt = (remaining: number) =>
    pointsFor({ debts: [debt({ kind: DEBT_KIND.vehicle, remaining })] })[INDICATOR.debtToAsset];

  test.each([
    [8_939_999, 100],
    [8_940_000, 80],
    [17_880_000, 80],
    [22_350_000, 50],
    [31_290_000, 25],
    [31_290_001, 0],
  ])('%p against 44,7 juta scores %p', (remaining, points) => {
    expect(withDebt(remaining)).toBe(points);
  });

  test('scores 100 without debt and 0 with debt but no assets', () => {
    expect(pointsFor({ debts: [] })[INDICATOR.debtToAsset]).toBe(100);
    const bare = { emergencyFund: null, otherAssets: null, propertyAssets: null };
    expect(pointsFor(bare)[INDICATOR.debtToAsset]).toBe(0);
    expect(evaluate(input(bare)).indicators[4]?.measure).toMatchObject({ percent: 0 });
  });
});

describe('protection', () => {
  test('counts health cover and income cover, 50 each', () => {
    expect(pointsFor({ protections: [] })[INDICATOR.protection]).toBe(0);
    expect(pointsFor({ protections: [PROTECTION.privateHealth] })[INDICATOR.protection]).toBe(50);
    expect(pointsFor({ protections: [PROTECTION.lifeInsurance] })[INDICATOR.protection]).toBe(50);
  });
});

describe('bands', () => {
  test('Rentan to 39, Bertahan to 79, Sehat from 80', () => {
    expect([0, 39, 40, 79, 80, 100].map(bandOf)).toEqual([
      SCORE_BAND.vulnerable,
      SCORE_BAND.vulnerable,
      SCORE_BAND.coping,
      SCORE_BAND.coping,
      SCORE_BAND.healthy,
      SCORE_BAND.healthy,
    ]);
  });
});
