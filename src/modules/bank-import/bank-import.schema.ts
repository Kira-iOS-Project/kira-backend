import { z } from '@hono/zod-openapi';
import { TRANSACTION_TYPE } from '../../lib/constants/money.ts';
import {
  CATEGORY_MISMATCH,
  categoryFitsType,
  MAX_AMOUNT,
  transactionCategorySchema,
  transactionTypeSchema,
} from '../../lib/money/money.schema.ts';

const MAX_ROWS = 3000;

export const createImportBodySchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    fileSize: z.number().int().min(1).max(10_000_000),
    /** Parsed from the CSV on the device; the file itself never reaches the server. */
    rows: z
      .array(
        z
          .object({
            date: z.iso.date(),
            description: z.string().trim().min(1).max(255),
            /** Signed whole rupiah: negative is money out. */
            amount: z
              .number()
              .int()
              .min(-MAX_AMOUNT)
              .max(MAX_AMOUNT)
              .refine((amount) => amount !== 0, { message: 'An amount cannot be zero.' }),
            category: transactionCategorySchema,
          })
          .refine(
            (row) =>
              categoryFitsType(
                row.amount < 0 ? TRANSACTION_TYPE.expense : TRANSACTION_TYPE.income,
                row.category,
              ),
            CATEGORY_MISMATCH,
          ),
      )
      .min(1)
      .max(MAX_ROWS),
  })
  .openapi('BankImportInput');

export const importRowSchema = z
  .object({
    id: z.uuid(),
    date: z.iso.date(),
    description: z.string(),
    /** Always positive; `type` says which way it went. */
    amount: z.number().int(),
    type: transactionTypeSchema,
    category: transactionCategorySchema,
    /** Same WIB date, amount and type as a transaction already recorded ("Mungkin Dobel"). */
    isDuplicate: z.boolean(),
  })
  .openapi('BankImportRow');

export const importSchema = z
  .object({
    id: z.uuid(),
    rowCount: z.number().int(),
    dateFrom: z.iso.date(),
    dateTo: z.iso.date(),
    rows: z.array(importRowSchema),
  })
  .openapi('BankImport');

export const commitImportBodySchema = z
  .object({
    /** The rows to save, with the category chosen in review; the others are skipped. */
    rows: z.array(z.object({ id: z.uuid(), category: transactionCategorySchema })).max(MAX_ROWS),
  })
  .openapi('BankImportCommit');

export const importResultSchema = z
  .object({ savedCount: z.number().int(), skippedCount: z.number().int() })
  .openapi('BankImportResult');

export const importIdParamSchema = z.object({ id: z.uuid() });

export type CreateImportBody = z.infer<typeof createImportBodySchema>;
export type BankImport = z.infer<typeof importSchema>;
export type CommitImportBody = z.infer<typeof commitImportBodySchema>;
export type ImportResult = z.infer<typeof importResultSchema>;
