import { z } from '@hono/zod-openapi';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { BILL_KIND, BILL_REPEAT_INTERVAL } from '../../lib/constants/ung.ts';
import { amountSchema, expenseCategorySchema } from '../../lib/money/money.schema.ts';

const date = z.iso.date();

export const billSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(enumValues(BILL_KIND)),
    name: z.string(),
    amount: z.number().int().min(1),
    category: expenseCategorySchema,
    nextDueDate: date,
    repeatInterval: z.enum(enumValues(BILL_REPEAT_INTERVAL)),
    installmentsTotal: z.number().int().nullable(),
    installmentsRemaining: z.number().int().nullable(),
    linkedDebtAccountId: z.uuid().nullable(),
    linkedDebtName: z.string().nullable(),
    dueSoon: z.boolean(),
    paidThisPeriod: z.boolean(),
  })
  .openapi('Bill');

export const billListSchema = z.object({ items: z.array(billSchema) }).openapi('BillList');

export const createBillBodySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    amount: amountSchema,
    category: expenseCategorySchema,
    nextDueDate: date,
    repeatInterval: z.enum(enumValues(BILL_REPEAT_INTERVAL)),
    installmentsTotal: z.number().int().min(1).max(600).optional(),
    installmentsRemaining: z.number().int().min(0).max(600).optional(),
    linkedDebtAccountId: z.uuid().nullable().optional(),
    clientId: z.uuid(),
  })
  .superRefine((body, context) => {
    const hasTotal = body.installmentsTotal !== undefined;
    const hasRemaining = body.installmentsRemaining !== undefined;
    if (hasTotal !== hasRemaining || (hasTotal && !body.linkedDebtAccountId)) {
      context.addIssue({
        code: 'custom',
        path: ['installmentsTotal'],
        message: 'Installment counts are only valid together for a linked debt account.',
      });
    }
    if (
      body.installmentsTotal !== undefined &&
      body.installmentsRemaining !== undefined &&
      body.installmentsRemaining > body.installmentsTotal
    ) {
      context.addIssue({
        code: 'custom',
        path: ['installmentsRemaining'],
        message: 'Remaining installments cannot exceed the total.',
      });
    }
  })
  .openapi('CreateBillInput');

export type CreateBillBody = z.infer<typeof createBillBodySchema>;
