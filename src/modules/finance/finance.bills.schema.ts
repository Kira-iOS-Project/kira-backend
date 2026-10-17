import { z } from '@hono/zod-openapi';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { BILL_KIND, BILL_REPEAT_INTERVAL } from '../../lib/constants/ung.ts';
import { expenseCategorySchema } from '../../lib/money/money.schema.ts';

const date = z.iso.date();

const billSchema = z
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
