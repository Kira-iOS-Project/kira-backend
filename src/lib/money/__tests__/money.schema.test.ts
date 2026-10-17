import { describe, expect, test } from 'bun:test';
import { EXPENSE_CATEGORY, INCOME_CATEGORY, TRANSACTION_TYPE } from '../../constants/money.ts';
import {
  amountSchema,
  categoryFitsType,
  expenseCategorySchema,
  MAX_AMOUNT,
  typeOfCategory,
} from '../money.schema.ts';

describe('typeOfCategory', () => {
  test('reads the direction from the category list it belongs to', () => {
    expect(typeOfCategory(INCOME_CATEGORY.salary)).toBe(TRANSACTION_TYPE.income);
    expect(typeOfCategory(EXPENSE_CATEGORY.transport)).toBe(TRANSACTION_TYPE.expense);
  });

  test('says whether a category fits a type', () => {
    expect(categoryFitsType(TRANSACTION_TYPE.expense, EXPENSE_CATEGORY.food)).toBe(true);
    expect(categoryFitsType(TRANSACTION_TYPE.expense, INCOME_CATEGORY.bonus)).toBe(false);
  });
});

describe('amountSchema', () => {
  test('takes whole rupiah from Rp1 up to the ceiling', () => {
    expect(amountSchema.safeParse(1).success).toBe(true);
    expect(amountSchema.safeParse(MAX_AMOUNT + 1).success).toBe(false);
    expect(amountSchema.safeParse(0).success).toBe(false);
    expect(amountSchema.safeParse(1.5).success).toBe(false);
  });

  test('keeps income categories out of the expense list', () => {
    expect(expenseCategorySchema.safeParse(INCOME_CATEGORY.salary).success).toBe(false);
  });
});
