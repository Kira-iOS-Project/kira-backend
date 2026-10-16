/**
 * The request and response words of a transaction, shared by chat drafts, manual entries, receipts
 * and bank imports so each publishes the same OpenAPI components. The expense and income category
 * lists do not overlap, so a category alone tells which way the money went.
 */

import { z } from '@hono/zod-openapi';
import { enumValues } from '../constants/enum-values.ts';
import { EXPENSE_CATEGORY, INCOME_CATEGORY, TRANSACTION_TYPE } from '../constants/money.ts';

type Values<T> = T[keyof T];

export type TransactionType = Values<typeof TRANSACTION_TYPE>;
export type TransactionCategory = Values<typeof EXPENSE_CATEGORY> | Values<typeof INCOME_CATEGORY>;

/** Above any real entry and well inside a double's exact integers. */
export const MAX_AMOUNT = 10_000_000_000_000;

export const transactionTypeSchema = z
  .enum(enumValues(TRANSACTION_TYPE))
  .openapi('TransactionType');

export const transactionCategorySchema = z
  .enum(enumValues({ ...EXPENSE_CATEGORY, ...INCOME_CATEGORY }))
  .openapi('TransactionCategory');

export const expenseCategorySchema = z.enum(enumValues(EXPENSE_CATEGORY));

/** Whole rupiah, at least Rp1. */
export const amountSchema = z.number().int().min(1).max(MAX_AMOUNT);

const INCOME_CATEGORIES: ReadonlySet<string> = new Set(Object.values(INCOME_CATEGORY));

export function typeOfCategory(category: TransactionCategory): TransactionType {
  return INCOME_CATEGORIES.has(category) ? TRANSACTION_TYPE.income : TRANSACTION_TYPE.expense;
}

/** A refinement message for a category from the other direction's list. */
export const CATEGORY_MISMATCH = {
  path: ['category'],
  message: 'The category does not fit the type.',
};

export function categoryFitsType(type: TransactionType, category: TransactionCategory): boolean {
  return typeOfCategory(category) === type;
}
