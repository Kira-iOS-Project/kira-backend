import { describe, expect, test } from 'bun:test';
import { RISK_PROFILE } from '../../../lib/constants/plan.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createRiskRepository } from '../plan.risk.repository.ts';

const AT = '2026-10-17T05:00:00.000Z';
const ROW = { answers: [1, 1, 1, 0, 1], profile: RISK_PROFILE.moderate, updatedAt: AT };

describe('createRiskRepository', () => {
  test('finds the person’s profile, or none', async () => {
    const fake = createFakeDb(inOrder([ROW], []));
    const repository = createRiskRepository(fake.db);

    expect(await repository.find('user-1')).toEqual({ ...ROW, updatedAt: new Date(AT) });
    expect(await repository.find('user-1')).toBeNull();
    expect(fake.queries[0]?.sql).toContain('from "risk_profiles"');
  });

  test('saves over an earlier quiz in one upsert', async () => {
    const fake = createFakeDb(inOrder([ROW]));
    const saved = await createRiskRepository(fake.db).save('user-1', [1, 1, 1, 0, 1], 'moderate');

    expect(saved.profile).toBe(RISK_PROFILE.moderate);
    expect(fake.queries[0]?.sql).toContain('insert into "risk_profiles"');
    expect(fake.queries[0]?.sql).toContain('on conflict ("user_id") do update');
  });

  test('fails loudly when the upsert returns no row', async () => {
    const fake = createFakeDb(inOrder([]));
    await expect(
      createRiskRepository(fake.db).save('user-1', [0, 0, 0, 0, 0], 'conservative'),
    ).rejects.toThrow('The risk profile was not stored');
  });
});
