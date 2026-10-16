import { z } from '@hono/zod-openapi';
import { chatMessageSchema } from '../../lib/chat/chat-message.ts';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { TRANSACTION_SOURCE } from '../../lib/constants/money.ts';
import {
  amountSchema,
  CATEGORY_MISMATCH,
  categoryFitsType,
  transactionCategorySchema,
  transactionTypeSchema,
} from '../../lib/money/money.schema.ts';
import { cursorParamSchema, limitParamSchema } from '../../lib/pagination/cursor.ts';
import { daysBetween } from '../../lib/time/wib.ts';

/** A summary covers at most a year of days. */
const MAX_SUMMARY_DAYS = 366;

const nameSchema = z.string().trim().min(1).max(80);
const noteSchema = z.string().trim().max(280);

export const transactionSchema = z
  .object({
    id: z.uuid(),
    type: transactionTypeSchema,
    amount: z.number().int(),
    category: transactionCategorySchema,
    name: z.string(),
    occurredAt: z.iso.datetime(),
    note: z.string().nullable(),
    /** Riwayat's row subtitle: dari chat, manual, struk, impor. */
    source: z.enum(enumValues(TRANSACTION_SOURCE)),
    sourceMessageId: z.uuid().nullable(),
  })
  .openapi('Transaction');

export const transactionDetailSchema = transactionSchema
  .extend({
    /** The quote on Detail Transaksi with the part read into this transaction (CAT-08). */
    sourceMessage: z
      .object({
        id: z.uuid(),
        body: z.string().nullable(),
        createdAt: z.iso.datetime(),
        spanStart: z.number().int().nullable(),
        spanEnd: z.number().int().nullable(),
      })
      .nullable(),
  })
  .openapi('TransactionDetail');

export const createTransactionBodySchema = z
  .object({
    /** Chosen by the app, so Coba Lagi never saves twice (CAT-04c). */
    clientId: z.uuid(),
    type: transactionTypeSchema,
    amount: amountSchema,
    category: transactionCategorySchema,
    name: nameSchema,
    occurredAt: z.iso.datetime({ offset: true }),
    note: noteSchema.optional(),
  })
  .refine((body) => categoryFitsType(body.type, body.category), CATEGORY_MISMATCH)
  .openapi('ManualTransactionInput');

export const manualSavedResponseSchema = z
  .object({ transaction: transactionSchema, message: chatMessageSchema })
  .openapi('ManualTransactionSaved');

export const listTransactionsQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  type: transactionTypeSchema.optional(),
  category: transactionCategorySchema.optional(),
  /** Searches the transaction names. */
  q: z.string().trim().min(1).max(80).optional(),
  cursor: cursorParamSchema.optional(),
  limit: limitParamSchema(100),
});

export const transactionPageSchema = z
  .object({ items: z.array(transactionSchema), nextCursor: z.string().nullable() })
  .openapi('TransactionPage');

export const summaryQuerySchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine(({ from, to }) => to >= from && daysBetween(from, to) < MAX_SUMMARY_DAYS, {
    path: ['to'],
    message: 'The range must run forward and cover at most a year.',
  });

export const transactionSummarySchema = z
  .object({
    expense: z.number().int(),
    income: z.number().int(),
    /** Only the days that hold a transaction, oldest first. */
    days: z.array(
      z.object({ date: z.iso.date(), expense: z.number().int(), income: z.number().int() }),
    ),
  })
  .openapi('TransactionSummary');

/** A category from the other list also turns the transaction the other way. */
export const updateTransactionBodySchema = z
  .object({
    name: nameSchema.optional(),
    amount: amountSchema.optional(),
    category: transactionCategorySchema.optional(),
    occurredAt: z.iso.datetime({ offset: true }).optional(),
    note: noteSchema.nullable().optional(),
  })
  .openapi('TransactionUpdate');

export const transactionIdParamSchema = z.object({ id: z.uuid() });
export const batchIdParamSchema = z.object({ batchId: z.uuid() });

export type Transaction = z.infer<typeof transactionSchema>;
export type TransactionDetail = z.infer<typeof transactionDetailSchema>;
export type CreateTransactionBody = z.infer<typeof createTransactionBodySchema>;
export type ManualSavedResponse = z.infer<typeof manualSavedResponseSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
export type TransactionPage = z.infer<typeof transactionPageSchema>;
export type TransactionSummary = z.infer<typeof transactionSummarySchema>;
export type UpdateTransactionBody = z.infer<typeof updateTransactionBodySchema>;
