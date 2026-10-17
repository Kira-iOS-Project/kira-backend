/**
 * The shapes of Tagihan & Cicilan (UNG-06) and Tambah / Ubah Tagihan (UNG-07, UNG-07c): a bill
 * as the app shows it, with its next due date worked out in WIB, the list grouped into the
 * board's sections, and the fields the sheet sends. Amounts are whole rupiah.
 */

import { z } from '@hono/zod-openapi';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { BILL_GROUP, BILL_KIND, BILL_NAME_MAX, BILL_REPEAT } from '../../lib/constants/ung.ts';
import { amountSchema, expenseCategorySchema } from '../../lib/money/money.schema.ts';
import { wibDate } from '../../lib/time/wib.ts';

const day = z.iso.date().openapi({ example: '2026-10-22' });
/** A WIB day, never after today. */
const pastDay = z.iso
  .date()
  .refine((value) => value <= wibDate(new Date()), { message: 'The date cannot be in the future' });

export const billSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    kind: z.enum(enumValues(BILL_KIND)),
    category: expenseCategorySchema,
    amount: z.number().int(),
    /** "Perkiraan". */
    isEstimate: z.boolean(),
    repeats: z.enum(enumValues(BILL_REPEAT)),
    dueOn: day,
    /** "Tiap Tanggal 22". */
    dueDay: z.number().int().min(1).max(31),
    /** Null only for a one-off bill already paid. */
    nextDueOn: day.nullable(),
    /** WIB days until nextDueOn; negative when it is overdue. */
    daysUntil: z.number().int().nullable(),
    debtId: z.uuid().nullable(),
    /** The linked debt account's remaining tenor ("14 Bulan Lagi"). */
    remainingInstalments: z.number().int().nullable(),
    /** Paid since the previous due date: marked here, or a Rencanaku payment of the linked debt. */
    paidThisPeriod: z.boolean(),
    lastPaidOn: day.nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi('Bill');

export const billListSchema = z
  .object({
    /** "6 tagihan berulang": the monthly and yearly bills. */
    count: z.number().int(),
    /** "per bulan": monthly amounts plus a twelfth of each yearly one, rounded. */
    monthlyTotal: z.number().int(),
    /** Only the groups with a bill, each sorted by nextDueOn. */
    sections: z.array(
      z.object({ group: z.enum(enumValues(BILL_GROUP)), bills: z.array(billSchema) }),
    ),
  })
  .openapi('BillList');

const billFields = {
  name: z.string().trim().min(1).max(BILL_NAME_MAX),
  amount: amountSchema,
  isEstimate: z.boolean(),
  category: expenseCategorySchema,
  repeats: z.enum(enumValues(BILL_REPEAT)),
  dueOn: day,
  /** "Ini Cicilan Utang": one of the person's debt accounts, or null. */
  debtId: z.uuid().nullable(),
};

export const createBillBodySchema = z
  .object({
    ...billFields,
    isEstimate: billFields.isEstimate.default(false),
    debtId: billFields.debtId.default(null),
  })
  .openapi('CreateBill');

/** Any of the bill's fields, and Tandai Sudah Dibayar (null takes it back). */
export const updateBillBodySchema = z
  .object({ ...billFields, paidOn: pastDay.nullable() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Change at least one field' })
  .openapi('UpdateBill');

export const billIdParamSchema = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }),
});

export type Bill = z.infer<typeof billSchema>;
export type BillList = z.infer<typeof billListSchema>;
export type CreateBillBody = z.infer<typeof createBillBodySchema>;
export type UpdateBillBody = z.infer<typeof updateBillBodySchema>;
