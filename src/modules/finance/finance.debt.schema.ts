/**
 * Detail Utang (UNG-03, board DetailUtang): one debt account with what is paid, the next due date,
 * its payments, and the payoff engine's next step. Integer rupiah, WIB days; the app words "10 Hari
 * Lagi" and "tinggal dua cicilan lagi" from these numbers.
 */

import { z } from '@hono/zod-openapi';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { DEBT_KIND } from '../../lib/constants/profile.ts';

const day = z.iso.date().openapi({ example: '2026-10-25' });

export const debtIdParamSchema = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }),
});

export const debtDetailSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    kind: z.enum(enumValues(DEBT_KIND)),
    remaining: z.number().int(),
    /** The amount owed when the account was recorded. */
    totalAmount: z.number().int(),
    paidAmount: z.number().int(),
    /** Payments marked so far; null with no fixed number of instalments. */
    instalmentsPaid: z.number().int().nullable(),
    /** Those plus the remaining tenor; null when the tenor is unknown. */
    instalmentsTotal: z.number().int().nullable(),
    monthlyInstalment: z.number().int(),
    /** The next time the due day comes round, today included; null without a due day. */
    dueDate: day.nullable(),
    /** Newest first; `number` counts from the first payment. */
    payments: z.array(
      z.object({
        id: z.uuid(),
        number: z.number().int(),
        amount: z.number().int(),
        paidOn: day,
        /** Paid on or before that month's due day (always true without a due day). */
        onTime: z.boolean(),
      }),
    ),
    /** "Lunasi Bulan Ini"; null when it is not a consumer account in the payoff order or the next instalment already clears it. */
    nextStep: z
      .object({
        priority: z.number().int(),
        priorityOf: z.number().int(),
        /** Added to the next instalment, it clears the account. */
        extraAmount: z.number().int(),
        payOn: day.nullable(),
        monthsEarlier: z.number().int(),
        /** Null before the health check. */
        scoreBefore: z.number().int().nullable(),
        scoreAfter: z.number().int().nullable(),
      })
      .nullable(),
  })
  .openapi('DebtDetail');

export type DebtDetail = z.infer<typeof debtDetailSchema>;
