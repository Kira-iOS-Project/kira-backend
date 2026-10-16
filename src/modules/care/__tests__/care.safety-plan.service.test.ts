import { describe, expect, test } from 'bun:test';
import { open } from '../care.crypto.ts';
import { CareSafetyPlanNotFoundError } from '../care.errors.ts';
import { exportKey, getSafetyPlan, saveSafetyPlan } from '../care.safety-plan.service.ts';
import { createCareRepositoryMock, createPlan, NOW, testKey, USER_ID } from './helpers.ts';

describe('safety plan service', () => {
  test('stores only the sealed plan and answers it in the clear with its time', async () => {
    const stored: string[] = [];
    const repository = createCareRepositoryMock({
      saveSafetyPlan: async (_userId, sealed) => {
        stored.push(sealed);
        return { sealed, updatedAt: NOW };
      },
    });
    const key = testKey();
    const extra = { ...createPlan(), people: [{ name: 'Rina', phone: '0812', note: 'dropped' }] };

    const saved = await saveSafetyPlan(USER_ID, extra, { repository, key });

    expect(saved).toEqual({
      ...createPlan({ people: [{ name: 'Rina', phone: '0812' }] }),
      updatedAt: NOW.toISOString(),
    });
    expect(stored[0]).not.toContain('Rumah ibu');
    expect(JSON.parse(await open(await key, stored[0] ?? ''))).toEqual(
      createPlan({ people: [{ name: 'Rina', phone: '0812' }] }),
    );
  });

  test('reads back what it sealed, or answers CARE_SAFETY_PLAN_NOT_FOUND', async () => {
    let row: { sealed: string; updatedAt: Date } | null = null;
    const repository = createCareRepositoryMock({
      saveSafetyPlan: async (_userId, sealed) => (row = { sealed, updatedAt: NOW }),
      findSafetyPlan: async () => row,
    });
    const key = testKey();

    await expect(getSafetyPlan(USER_ID, { repository, key })).rejects.toBeInstanceOf(
      CareSafetyPlanNotFoundError,
    );
    await saveSafetyPlan(USER_ID, createPlan(), { repository, key });
    expect(await getSafetyPlan(USER_ID, { repository, key })).toEqual({
      ...createPlan(),
      updatedAt: NOW.toISOString(),
    });
  });

  test('derives the process key once from AUTH_SECRET', async () => {
    const repository = createCareRepositoryMock();
    const saved = await saveSafetyPlan(USER_ID, createPlan(), { repository });
    expect(saved.updatedAt).toBe(NOW.toISOString());
    expect(await exportKey()).toBe(await exportKey());
  });

  test('answers CARE_SAFETY_PLAN_NOT_FOUND for a plan sealed under another key', async () => {
    const repository = createCareRepositoryMock({
      findSafetyPlan: async () => ({ sealed: 'v1.a.b', updatedAt: NOW }),
    });
    await expect(getSafetyPlan(USER_ID, { repository, key: testKey() })).rejects.toBeInstanceOf(
      CareSafetyPlanNotFoundError,
    );
  });
});
