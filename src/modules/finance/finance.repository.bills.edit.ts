import { and, eq, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { debtAccounts, recurringBills } from '../../db/schema/schema.ts';
import type { UpdateBillBody } from './finance.bills.schema.ts';
import type { FinanceRepository } from './finance.repository.types.ts';
import { billColumns, billRow, billScheduleColumns } from './finance.repository.bills.shared.ts';

type BillEditRepository = Pick<FinanceRepository, 'getBill' | 'updateBill'>;

export function createBillEditRepository(client: PostgresJsDatabase = db): BillEditRepository {
  return {
    async getBill(userId, id) {
      const [row] = await client
        .select(billColumns)
        .from(recurringBills)
        .leftJoin(
          debtAccounts,
          and(
            eq(debtAccounts.id, recurringBills.linkedDebtAccountId),
            eq(debtAccounts.userId, userId),
          ),
        )
        .where(
          and(
            eq(recurringBills.userId, userId),
            eq(recurringBills.id, id),
            isNull(recurringBills.archivedAt),
          ),
        )
        .limit(1);
      return row ? billRow(row) : null;
    },

    async updateBill(userId, id, body: UpdateBillBody) {
      return client.transaction(async (tx) => {
        const [existing] = await tx
          .select(billScheduleColumns)
          .from(recurringBills)
          .where(
            and(
              eq(recurringBills.userId, userId),
              eq(recurringBills.id, id),
              isNull(recurringBills.archivedAt),
            ),
          )
          .for('update')
          .limit(1);
        if (!existing) return null;

        const linkedDebtAccountId =
          body.linkedDebtAccountId === undefined
            ? existing.linkedDebtAccountId
            : body.linkedDebtAccountId;
        let linkedDebtName: string | null = null;
        let installmentsTotal = existing.installmentsTotal;
        let installmentsRemaining = existing.installmentsRemaining;
        if (linkedDebtAccountId) {
          const [debt] = await tx
            .select({ name: debtAccounts.name, tenor: debtAccounts.remainingTenorMonths })
            .from(debtAccounts)
            .where(and(eq(debtAccounts.id, linkedDebtAccountId), eq(debtAccounts.userId, userId)))
            .for('update')
            .limit(1);
          if (!debt) return null;
          linkedDebtName = debt.name;
          if (linkedDebtAccountId !== existing.linkedDebtAccountId) {
            installmentsTotal = debt.tenor;
            installmentsRemaining = debt.tenor;
          }
        } else {
          installmentsTotal = null;
          installmentsRemaining = null;
        }

        const [updated] = await tx
          .update(recurringBills)
          .set({
            name: body.name ?? existing.name,
            amount: body.amount ?? existing.amount,
            category: body.category ?? existing.category,
            nextDueDate: body.nextDueDate ?? existing.nextDueDate,
            repeatInterval: body.repeatInterval ?? existing.repeatInterval,
            linkedDebtAccountId,
            installmentsTotal,
            installmentsRemaining,
          })
          .where(
            and(
              eq(recurringBills.userId, userId),
              eq(recurringBills.id, id),
              isNull(recurringBills.archivedAt),
            ),
          )
          .returning(billScheduleColumns);
        return updated ? billRow({ ...updated, linkedDebtName }) : null;
      });
    },
  };
}

type BillDeleteRepository = Pick<FinanceRepository, 'deleteBill'>;

export function createBillDeleteRepository(client: PostgresJsDatabase = db): BillDeleteRepository {
  return {
    async deleteBill(userId, id) {
      const [archived] = await client
        .update(recurringBills)
        .set({ archivedAt: new Date() })
        .where(
          and(
            eq(recurringBills.userId, userId),
            eq(recurringBills.id, id),
            isNull(recurringBills.archivedAt),
          ),
        )
        .returning({ id: recurringBills.id });
      return archived !== undefined;
    },
  };
}
