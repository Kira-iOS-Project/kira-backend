/**
 * Mock builders for the care module's injected dependencies (AGENTS.md Rule 19).
 */

import { deriveSafetyPlanKey } from '../care.crypto.ts';
import type { CareRepository } from '../care.repository.ts';
import type { SafetyPlanBody } from '../care.safety-plan.schema.ts';

/** 12.41 WIB on 17 October 2026. */
export const NOW = new Date('2026-10-17T05:41:00.000Z');
export const USER_ID = '0b5c3a1e-5d4f-4c8e-9a51-6f0f2f3c7d11';
export const CHECK_IN_ID = '5f1e2d3c-4b5a-4968-8776-655443322110';

/** A key for tests, derived as the app derives its own. */
export const testKey = () => deriveSafetyPlanKey('a-test-only-secret-of-at-least-32-chars');

export function createPlan(overrides: Partial<SafetyPlanBody> = {}): SafetyPlanBody {
  return {
    warningSigns: 'Susah tidur, menarik diri',
    calmingThings: 'Jalan pagi',
    people: [{ name: 'Rina', phone: '081234567890' }],
    professionals: [{ name: 'Healing119', phone: '119' }],
    safePlace: 'Rumah ibu',
    ...overrides,
  };
}

export function createCareRepositoryMock(overrides: Partial<CareRepository> = {}): CareRepository {
  return {
    recordSignal: async () => undefined,
    scheduleCheckIn: async (_userId, dueAt) => ({ id: CHECK_IN_ID, dueAt }),
    cancelCheckIn: async () => true,
    findDueCheckIn: async () => null,
    markCheckInSeen: async () => true,
    listCheckIns: async () => [],
    activateDebtEmergency: async () => NOW,
    findDebtEmergency: async () => null,
    listDebts: async () => [],
    findSafetyPlan: async () => null,
    saveSafetyPlan: async (_userId, sealed) => ({ sealed, updatedAt: NOW }),
    ...overrides,
  };
}
