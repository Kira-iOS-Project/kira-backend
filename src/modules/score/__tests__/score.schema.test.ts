/**
 * The iOS client leaves a nil answer's key out of the body instead of sending null, so every
 * skippable field of the health check must read a missing key as null.
 */

import { describe, expect, test } from 'bun:test';
import { DEBT_KIND } from '../../../lib/constants/profile.ts';
import { healthCheckBodySchema } from '../score.schema.ts';

describe('healthCheckBodySchema', () => {
  test('reads every skipped answer, sent as a missing key, as null', () => {
    const parsed = healthCheckBodySchema.parse({
      payday: { endOfMonth: true },
      debts: [
        {
          kind: DEBT_KIND.paylater,
          name: 'Paylater A',
          remaining: 420_000,
          monthlyInstalment: 210_000,
        },
      ],
      dependents: 0,
      protections: [],
    });

    expect(parsed).toMatchObject({
      netMonthlyIncome: null,
      essentialMonthlyExpenses: null,
      emergencyFund: null,
      monthlySavings: null,
      otherAssets: null,
      propertyAssets: null,
      maritalStatus: null,
      payday: { day: null, endOfMonth: true },
    });
    expect(parsed.debts[0]?.remainingTenorMonths).toBeNull();
  });
});
