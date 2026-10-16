import { z } from '@hono/zod-openapi';
import { CONSENT_PURPOSE } from '../../lib/constants/consents.ts';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { EXPENSE_CATEGORY, INCOME_CATEGORY } from '../../lib/constants/money.ts';
import { PLAN, SUBSCRIPTION_SOURCE } from '../../lib/constants/plans.ts';
import { FOCUS } from '../../lib/constants/profile.ts';
import { usageSchema } from '../../lib/usage/usage.schema.ts';

/** What a person types to confirm Hapus Akun dan Data (AKN-05), compared trimmed and upper-cased. */
export const DELETION_CONFIRMATION = 'HAPUS';

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .openapi({ example: '2026-10-16' });
const instant = z.iso.datetime();

/** Inline rather than a named component: the health check (Score) sends the same shape. */
const paydaySchema = z.object({
  /** A day of the month, or null while it has not been answered. */
  day: z.number().int().min(1).max(31).nullable(),
  endOfMonth: z.boolean(),
});

export const meSchema = z
  .object({
    id: z.uuid(),
    email: z.string(),
    displayName: z.string(),
    focus: z.enum(enumValues(FOCUS)),
    payday: paydaySchema,
    hideBalances: z.boolean(),
    /** Persetujuan Data was given; false means onboarding is not finished. */
    consented: z.boolean(),
    healthCheckCompleted: z.boolean(),
    plan: z.object({
      id: z.enum(enumValues(PLAN)),
      source: z.enum(enumValues(SUBSCRIPTION_SOURCE)).nullable(),
      renewsOn: date.nullable(),
    }),
    usage: usageSchema,
    period: z.object({
      start: date,
      end: date,
      nextPayday: date,
      daysUntilPayday: z.number().int(),
    }),
    lastCategories: z.object({
      expense: z.enum(enumValues(EXPENSE_CATEGORY)).nullable(),
      income: z.enum(enumValues(INCOME_CATEGORY)).nullable(),
    }),
    debtAccountCount: z.number().int(),
    aiEnabled: z.boolean(),
    weeklySummaryEnabled: z.boolean(),
  })
  .openapi('Me');

export const updateMeBodySchema = z
  .object({
    focus: z.enum(enumValues(FOCUS)).optional(),
    hideBalances: z.boolean().optional(),
    payday: paydaySchema.optional(),
  })
  .openapi('MeUpdate');

export const consentsSchema = z
  .object({
    policyVersion: z.string(),
    items: z.array(
      z.object({
        purpose: z.enum(enumValues(CONSENT_PURPOSE)),
        granted: z.boolean(),
        decidedAt: instant.nullable(),
      }),
    ),
  })
  .openapi('Consents');

export const updateConsentsBodySchema = z
  .object({ aiProcessing: z.boolean(), weeklySummary: z.boolean() })
  .openapi('ConsentsUpdate');

export const deletionBodySchema = z
  .object({
    confirmation: z
      .string()
      .max(20)
      .refine((value) => value.trim().toUpperCase() === DELETION_CONFIRMATION)
      .openapi({ example: DELETION_CONFIRMATION }),
  })
  .openapi('AccountDeletion');

export const csvSchema = z.string().openapi({ format: 'binary' });

export type Me = z.infer<typeof meSchema>;
export type MeUpdate = z.infer<typeof updateMeBodySchema>;
export type Consents = z.infer<typeof consentsSchema>;
export type ConsentsUpdate = z.infer<typeof updateConsentsBodySchema>;
