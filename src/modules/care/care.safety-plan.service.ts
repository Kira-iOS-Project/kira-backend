/**
 * Rencana Keselamatanku (PED-10): read and written whole, sealed before it reaches the database
 * and opened only for its person. The key comes from AUTH_SECRET (care.crypto.ts).
 */

import { env } from '../../env.ts';
import { deriveSafetyPlanKey, open, seal } from './care.crypto.ts';
import { CareSafetyPlanNotFoundError } from './care.errors.ts';
import { type CareRepository, careRepository, type SealedPlanRow } from './care.repository.ts';
import type { SafetyPlan, SafetyPlanBody } from './care.safety-plan.schema.ts';

export type SafetyPlanDeps = { repository?: CareRepository; key?: Promise<CryptoKey> };

/** The key, derived once per process. */
let defaultKey: Promise<CryptoKey> | undefined;
function safetyPlanKey(deps: SafetyPlanDeps): Promise<CryptoKey> {
  if (deps.key) return deps.key;
  defaultKey ??= deriveSafetyPlanKey(env.AUTH_SECRET);
  return defaultKey;
}

/** The five sections of a stored plan, in the order the screen asks them. */
function sections(body: SafetyPlanBody): SafetyPlanBody {
  return {
    warningSigns: body.warningSigns,
    calmingThings: body.calmingThings,
    people: body.people.map(({ name, phone }) => ({ name, phone })),
    professionals: body.professionals.map(({ name, phone }) => ({ name, phone })),
    safePlace: body.safePlace,
  };
}

/** The plan inside a stored row. */
export async function openPlan(row: SealedPlanRow, key: CryptoKey): Promise<SafetyPlan> {
  const body: SafetyPlanBody = JSON.parse(await open(key, row.sealed));
  return { ...sections(body), updatedAt: row.updatedAt.toISOString() };
}

export async function getSafetyPlan(userId: string, deps: SafetyPlanDeps = {}): Promise<SafetyPlan> {
  const repository = deps.repository ?? careRepository;
  const row = await repository.findSafetyPlan(userId);
  if (row === null) throw new CareSafetyPlanNotFoundError();
  return openPlan(row, await safetyPlanKey(deps));
}

export async function saveSafetyPlan(
  userId: string,
  body: SafetyPlanBody,
  deps: SafetyPlanDeps = {},
): Promise<SafetyPlan> {
  const repository = deps.repository ?? careRepository;
  const key = await safetyPlanKey(deps);
  const plan = sections(body);
  const row = await repository.saveSafetyPlan(userId, await seal(key, JSON.stringify(plan)));
  return { ...plan, updatedAt: row.updatedAt.toISOString() };
}

/** The key the export opens plans with: the same one, so an export reads what was stored. */
export function exportKey(): Promise<CryptoKey> {
  return safetyPlanKey({});
}
