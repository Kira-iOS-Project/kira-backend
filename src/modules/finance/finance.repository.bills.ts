/**
 * Tagihan & Cicilan's data access (AGENTS.md Rules 4 and 10): the person's bills with the
 * remaining tenor of the debt each instalment belongs to, and the last Rencanaku payment of each
 * debt. Every query is scoped to the owner; a linked debt is checked to be theirs before it is
 * stored.
 */

import { and, asc, eq, max } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { bills, debtAccounts, debtPayments } from '../../db/schema/schema.ts';
import { BILL_LIST_LIMIT } from '../../lib/constants/ung.ts';
import { expenseCategorySchema } from '../../lib/money/money.schema.ts';
import type { CreateBillBody } from './finance.bills.schema.ts';

export type BillRow = Omit<CreateBillBody, 'debtId'> & {
  id: string;
  debtId: string | null;
  lastPaidOn: string | null;
  remainingTenorMonths: number | null;
  createdAt: Date;
};

type Stored = Omit<BillRow, 'id' | 'remainingTenorMonths' | 'createdAt'>;
export type BillPatch = { [K in keyof Stored]?: Stored[K] | undefined };

export type BillRepository = {
  /** Oldest first; the service sorts by due date. */
  listBills(userId: string): Promise<BillRow[]>;
  findBill(userId: string, id: string): Promise<BillRow | null>;
  insertBill(userId: string, bill: CreateBillBody): Promise<BillRow>;
  updateBill(userId: string, id: string, patch: BillPatch): Promise<boolean>;
  deleteBill(userId: string, id: string): Promise<boolean>;
  ownsDebt(userId: string, debtId: string): Promise<boolean>;
  /** Each of the person's debts with a payment, and when its last one was made. */
  lastDebtPayments(userId: string): Promise<{ debtId: string; paidAt: Date }[]>;
};

const billColumns = {
  id: bills.id,
  name: bills.name,
  category: bills.category,
  amount: bills.amount,
  isEstimate: bills.isEstimate,
  repeats: bills.repeats,
  dueOn: bills.dueOn,
  lastPaidOn: bills.lastPaidOn,
  debtId: bills.debtId,
  remainingTenorMonths: debtAccounts.remainingTenorMonths,
  createdAt: bills.createdAt,
};

/** A selected row with its category narrowed: a bill's is always an expense category. */
function billRowOf<T extends { category: string }>(row: T) {
  return { ...row, category: expenseCategorySchema.parse(row.category) };
}

export function createBillRepository(client: PostgresJsDatabase = db): BillRepository {
  const select = () =>
    client
      .select(billColumns)
      .from(bills)
      .leftJoin(debtAccounts, eq(debtAccounts.id, bills.debtId));

  async function findBill(userId: string, id: string): Promise<BillRow | null> {
    const [row] = await select()
      .where(and(eq(bills.userId, userId), eq(bills.id, id)))
      .limit(1);
    return row ? billRowOf(row) : null;
  }

  return {
    async listBills(userId) {
      const rows = await select()
        .where(eq(bills.userId, userId))
        .orderBy(asc(bills.createdAt), asc(bills.id))
        .limit(BILL_LIST_LIMIT);
      return rows.map(billRowOf);
    },

    findBill,

    async insertBill(userId, bill) {
      const [row] = await client
        .insert(bills)
        .values({ userId, ...bill })
        .returning({ id: bills.id });
      const stored = row ? await findBill(userId, row.id) : null;
      if (!stored) throw new Error('The inserted bill could not be read back.');
      return stored;
    },

    async updateBill(userId, id, patch) {
      const rows = await client
        .update(bills)
        .set(patch)
        .where(and(eq(bills.userId, userId), eq(bills.id, id)))
        .returning({ id: bills.id });
      return rows.length > 0;
    },

    async deleteBill(userId, id) {
      const rows = await client
        .delete(bills)
        .where(and(eq(bills.userId, userId), eq(bills.id, id)))
        .returning({ id: bills.id });
      return rows.length > 0;
    },

    async ownsDebt(userId, debtId) {
      const rows = await client
        .select({ id: debtAccounts.id })
        .from(debtAccounts)
        .where(and(eq(debtAccounts.userId, userId), eq(debtAccounts.id, debtId)))
        .limit(1);
      return rows.length > 0;
    },

    async lastDebtPayments(userId) {
      const rows = await client
        .select({ debtId: debtPayments.debtId, paidAt: max(debtPayments.paidAt) })
        .from(debtPayments)
        .where(eq(debtPayments.userId, userId))
        .groupBy(debtPayments.debtId)
        .limit(BILL_LIST_LIMIT);
      return rows.flatMap(({ debtId, paidAt }) => (paidAt ? [{ debtId, paidAt }] : []));
    },
  };
}

export const billRepository = createBillRepository();
