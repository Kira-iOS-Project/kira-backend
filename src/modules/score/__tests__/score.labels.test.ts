import { describe, expect, test } from 'bun:test';
import { INDICATOR } from '../../../lib/constants/score.ts';
import { PROTECTION } from '../../../lib/constants/profile.ts';
import { labelsOf } from '../score.labels.ts';
import { evaluate } from '../score.measure.ts';
import { DINDA, input } from './helpers.ts';

describe('labelsOf', () => {
  test("writes Dinda's figures as the boards do", () => {
    expect(labelsOf(evaluate(DINDA))).toEqual({
      [INDICATOR.emergencyFund]: '1,1×',
      [INDICATOR.savingsRatio]: '8%',
      [INDICATOR.instalmentRatio]: '18%',
      [INDICATOR.consumerDebt]: '2 platform',
      [INDICATOR.debtToAsset]: '32%',
      [INDICATOR.protection]: '2 dari 2',
    });
  });

  test('counts the covers held and writes a whole ratio with its decimal', () => {
    const labels = labelsOf(
      evaluate(input({ protections: [PROTECTION.bpjsHealth], emergencyFund: 8_400_000 })),
    );
    expect(labels[INDICATOR.protection]).toBe('1 dari 2');
    expect(labels[INDICATOR.emergencyFund]).toBe('2,0×');
  });
});
