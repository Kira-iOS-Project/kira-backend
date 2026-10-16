/**
 * Kira Peduli's request and response shapes (CONTRACT-KOM-PED "Care"). The API sends codes and
 * English notes only; the app shows the board's Indonesian words from its String Catalog.
 */

import { z } from '@hono/zod-openapi';
import {
  CARE_CONTACT_KEY,
  CARE_SIGNAL_LEVEL,
  CARE_SIGNAL_SOURCE,
  CHECK_IN_DELAY_HOURS,
} from '../../lib/constants/care.ts';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { DEBT_KIND } from '../../lib/constants/profile.ts';

export const careContactSchema = z
  .object({
    key: z.enum(enumValues(CARE_CONTACT_KEY)),
    name: z.string(),
    /** What `tel:` dials ("119", "157"); null for a contact reached on the web only. */
    phone: z.string().nullable(),
    /** Dialled after the number (Healing119 is 119 extension 8). */
    extension: z.string().nullable(),
    /** The number `https://wa.me/` opens, as dialled in Indonesia ("081157157157"). */
    whatsapp: z.string().nullable(),
    url: z.url().nullable(),
    note: z.string(),
  })
  .openapi('CareContact');

export const careContactsSchema = z
  .object({
    /** The day the team last called every number: re-checked monthly. */
    verifiedOn: z.iso.date(),
    contacts: z.array(careContactSchema),
  })
  .openapi('CareContacts');

export const careSignalBodySchema = z
  .object({
    level: z.enum(enumValues(CARE_SIGNAL_LEVEL)),
    source: z.enum(enumValues(CARE_SIGNAL_SOURCE)),
  })
  .openapi('CareSignal');

const [day, twoDays, threeDays] = CHECK_IN_DELAY_HOURS;

export const scheduleCheckInBodySchema = z
  .object({
    afterHours: z.union([z.literal(day), z.literal(twoDays), z.literal(threeDays)]),
  })
  .openapi('ScheduleCheckIn');

export const checkInSchema = z.object({ id: z.uuid(), dueAt: z.iso.datetime() }).openapi('CheckIn');

export const dueCheckInSchema = z
  .object({ checkIn: checkInSchema.nullable() })
  .openapi('DueCheckIn');

export const checkInParamsSchema = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }),
});

export const debtEmergencySchema = z
  .object({ activatedAt: z.iso.datetime() })
  .openapi('DebtEmergency');

export const debtSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    kind: z.enum(enumValues(DEBT_KIND)),
    remaining: z.number().int(),
    monthlyInstalment: z.number().int(),
  })
  .openapi('Debt');

export const debtsSchema = z.object({ debts: z.array(debtSchema) }).openapi('Debts');

export type CareContacts = z.infer<typeof careContactsSchema>;
export type CareContact = z.infer<typeof careContactSchema>;
export type CareSignalBody = z.infer<typeof careSignalBodySchema>;
export type CheckIn = z.infer<typeof checkInSchema>;
export type Debt = z.infer<typeof debtSchema>;
