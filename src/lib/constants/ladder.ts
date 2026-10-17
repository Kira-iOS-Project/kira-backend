/**
 * What the calculators' prefill (REN-02) reads from the ledger: the categories that count as
 * pengeluaran pokok and how many months the average spans. The ladder's steps and states live in
 * lib/constants/plan.ts.
 */

import { EXPENSE_CATEGORY } from './money.ts';

/**
 * Our decision (approved by the coordinator; the boards and the contract name no categories): the
 * expense categories that count as pengeluaran pokok for the calculators' prefill: food,
 * transport, bills, household, health, education and insurance. Instalments and savings deposits
 * are not spending; coffee, shopping and entertainment are not essential.
 */
export const ESSENTIAL_EXPENSE_CATEGORIES = [
  EXPENSE_CATEGORY.food,
  EXPENSE_CATEGORY.transport,
  EXPENSE_CATEGORY.bills,
  EXPENSE_CATEGORY.household,
  EXPENSE_CATEGORY.health,
  EXPENSE_CATEGORY.education,
  EXPENSE_CATEGORY.insurance,
] as const;

/**
 * Our decision too (approved): pengeluaran pokok is the average of this many whole WIB months
 * before the current one, over the months that have any essential spending.
 */
export const PREFILL_MONTHS = 3;
