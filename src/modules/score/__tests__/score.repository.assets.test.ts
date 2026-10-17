/**
 * Portofolio Manual feeding Utang terhadap Aset: once a person has assets, their total is the
 * "Emas, saham, dan simpanan lain" figure the score reads; property stays the health check's.
 */

import { describe, expect, test } from 'bun:test';
import { FOCUS, MARITAL_STATUS } from '../../../lib/constants/profile.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createScoreRepository } from '../score.repository.ts';
import { DINDA_ANSWERS, NOW } from './helpers.ts';

/** The state row with `otherAssets` as Postgres sends a sum: a numeric string. */
const stateRow = (otherAssets: string | null) => ({
  focus: FOCUS.trackSpending,
  paydayDay: 25,
  paydayEndOfMonth: false,
  completedAt: NOW.toISOString(),
  income: DINDA_ANSWERS.income,
  essential: DINDA_ANSWERS.essential,
  emergencyFund: DINDA_ANSWERS.emergencyFund,
  monthlySavings: DINDA_ANSWERS.monthlySavings,
  otherAssets,
  propertyAssets: DINDA_ANSWERS.propertyAssets,
  dependents: 0,
  maritalStatus: MARITAL_STATUS.single,
  protections: `{${DINDA_ANSWERS.protections.join(',')}}`,
});

describe('findState with a portfolio', () => {
  test('reads the assets’ total in place of the health check’s other assets', async () => {
    const fake = createFakeDb(inOrder([stateRow('25000000')], [stateRow(null)]));
    const repository = createScoreRepository(fake.db);
    const state = await repository.findState('user-1');
    expect(state?.input?.otherAssets).toBe(25_000_000);
    expect(state?.input?.propertyAssets).toBe(DINDA_ANSWERS.propertyAssets);
    expect((await repository.findState('user-1'))?.input?.otherAssets).toBeNull();
    expect(fake.queries[0]?.sql).toContain('coalesce((select sum("assets"."value") from "assets"');
    expect(fake.queries[0]?.sql).toContain('"financial_profiles"."other_assets")');
  });
});
