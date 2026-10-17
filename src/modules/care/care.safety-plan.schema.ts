/**
 * Rencana Keselamatanku (PED-10, PED-10c): five sections, every one optional. Stored only sealed
 * (care.crypto.ts), never in analytics, deleted with the account.
 */

import { z } from '@hono/zod-openapi';

/** The most text one answer holds. */
export const SAFETY_PLAN_TEXT_MAX = 500;
/** The most people, and the most professionals, a plan names. */
const SAFETY_PLAN_PEOPLE_MAX = 3;

const answer = z.string().max(SAFETY_PLAN_TEXT_MAX);

const personSchema = z
  .object({
    name: z.string().max(SAFETY_PLAN_TEXT_MAX),
    phone: z.string().max(SAFETY_PLAN_TEXT_MAX),
  })
  .openapi('SafetyPlanPerson');

export const safetyPlanBodySchema = z
  .object({
    warningSigns: answer,
    calmingThings: answer,
    people: z.array(personSchema).max(SAFETY_PLAN_PEOPLE_MAX),
    professionals: z.array(personSchema).max(SAFETY_PLAN_PEOPLE_MAX),
    safePlace: answer,
  })
  .openapi('SafetyPlanInput');

export const safetyPlanSchema = safetyPlanBodySchema
  .extend({ updatedAt: z.iso.datetime() })
  .openapi('SafetyPlan');

export type SafetyPlanBody = z.infer<typeof safetyPlanBodySchema>;
export type SafetyPlan = z.infer<typeof safetyPlanSchema>;
