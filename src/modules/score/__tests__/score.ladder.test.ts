import { describe, expect, test } from 'bun:test';
import { DEBT_KIND } from '../../../lib/constants/profile.ts';
import { INDICATOR } from '../../../lib/constants/score.ts';
import { factsOf, pointsOf, type ScoreInput } from '../score.engine.ts';
import { ladderOf } from '../score.ladder.ts';
import { debt, DINDA, input } from './helpers.ts';

function detail(key: Parameters<typeof ladderOf>[0], answers: ScoreInput = DINDA) {
  const facts = factsOf(answers);
  return ladderOf(key, facts, pointsOf(facts));
}

const amounts = (result: ReturnType<typeof detail>) =>
  result.ladder.map((rung) => [rung.points, rung.amountLower, rung.amountUpper]);

describe('ladderOf', () => {
  test('writes the emergency-fund ladder of DetailIndikator in rupiah', () => {
    const result = detail(INDICATOR.emergencyFund);

    expect(amounts(result)).toEqual([
      [100, 25_200_000, null],
      [75, 12_600_000, 25_200_000],
      [50, 4_200_000, 12_600_000],
      [25, 2_100_000, 4_200_000],
      [0, null, 2_100_000],
    ]);
    expect(result.ladder.filter((rung) => rung.isCurrent).map((rung) => rung.points)).toEqual([50]);
    expect(result.nextRung).toEqual({
      points: 75,
      amountNeeded: 7_800_000,
      scoreFrom: 66,
      scoreTo: 70,
    });
    expect(result.milestones).toEqual([
      { at: 4_200_000, label: '1×' },
      { at: 12_600_000, label: '3×' },
      { at: 25_200_000, label: '6×' },
    ]);
  });

  test('labels a half-target milestone with a decimal comma', () => {
    const result = detail(INDICATOR.emergencyFund, input({ dependents: 3 }));
    expect(result.milestones.map((milestone) => milestone.label)).toEqual(['1×', '7,5×', '15×']);
  });

  test('writes the savings ladder of DetailIndikatorMenabung', () => {
    const result = detail(INDICATOR.savingsRatio);

    expect(amounts(result)).toEqual([
      [100, 1_500_000, null],
      [75, 750_000, 1_500_000],
      [45, 375_000, 750_000],
      [25, 75_000, 375_000],
      [0, null, 75_000],
    ]);
    expect(result.nextRung).toEqual({
      points: 75,
      amountNeeded: 150_000,
      scoreFrom: 66,
      scoreTo: 71,
    });
    expect(result.milestones).toEqual([
      { at: 750_000, label: '10%' },
      { at: 1_500_000, label: '20%' },
    ]);
  });

  test('writes the instalment ladder of DetailIndikatorCicilan', () => {
    const result = detail(INDICATOR.instalmentRatio);

    expect(amounts(result)).toEqual([
      [100, null, 750_000],
      [85, 750_000, 1_125_000],
      [70, 1_125_000, 2_250_000],
      [40, 2_250_000, 3_000_000],
      [0, 3_000_000, null],
    ]);
    expect(result.nextRung).toEqual({
      points: 85,
      amountNeeded: 225_000,
      scoreFrom: 66,
      scoreTo: 68,
    });
    expect(result.milestones.map((milestone) => milestone.at)).toEqual([1_125_000, 2_250_000]);
  });

  test('writes the debt-to-asset ladder of DetailIndikatorAset, strict at the top', () => {
    const result = detail(INDICATOR.debtToAsset);

    expect(amounts(result)[1]).toEqual([80, 8_940_000, 17_880_000]);
    expect(result.nextRung).toEqual({
      points: 100,
      amountNeeded: 5_370_001,
      scoreFrom: 66,
      scoreTo: 69,
    });
    expect(result.milestones).toEqual([
      { at: 11_175_000, label: '25%' },
      { at: 22_350_000, label: '50%' },
    ]);
  });

  test('cuts a falling ratio to an inclusive bound below the top', () => {
    const heavy = input({
      debts: [debt({ kind: DEBT_KIND.vehicle, monthlyInstalment: 2_400_000 })],
    });
    expect(detail(INDICATOR.instalmentRatio, heavy).nextRung?.amountNeeded).toBe(150_000);
  });

  test('gives the state ladders no bounds and no amounts', () => {
    const consumer = detail(INDICATOR.consumerDebt);
    expect(consumer.ladder.map((rung) => rung.points)).toEqual([100, 75, 50, 25, 0]);
    expect(consumer.ladder[2]).toEqual({
      points: 50,
      lower: null,
      upper: null,
      amountLower: null,
      amountUpper: null,
      isCurrent: true,
    });
    expect(consumer.nextRung).toMatchObject({ points: 75, amountNeeded: null, scoreTo: 70 });
    expect(consumer.milestones).toEqual([]);

    const protection = detail(INDICATOR.protection);
    expect(protection.ladder.map((rung) => rung.points)).toEqual([100, 50, 0]);
    expect(protection.nextRung).toBeNull();
  });

  test('leaves amounts out when the base was skipped', () => {
    const skipped = input({ essential: null, income: null });
    const fund = detail(INDICATOR.emergencyFund, skipped);
    expect(fund.ladder.every((rung) => rung.amountLower === null)).toBe(true);
    expect(fund.nextRung).toMatchObject({ points: 25, amountNeeded: null });
    expect(fund.milestones).toEqual([]);
    expect(detail(INDICATOR.savingsRatio, skipped).milestones).toEqual([]);
  });
});
