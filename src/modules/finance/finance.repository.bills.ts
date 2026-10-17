import { and, asc, eq, gte, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import {
  billPayments,
  debtAccounts,
  debtPayments,
  recurringBills,
} from '../../db/schema/schema.ts';
import { expenseCategorySchema } from '../../lib/money/money.schema.ts';
import { wibStartOfDay } from '../../lib/time/wib.ts';
import type { BillRow, FinanceRepository } from './finance.repository.types.ts';

type BillRepository = Pick<FinanceRepository, 'listBills'>;

export function createBillRepository(client: PostgresJsDatabase = db): BillRepository {
  return {
    async listBills(userId, periodStart) {
      const [rows, paidBills, paidDebts] = await Promise.all([
        client
          .select({
            id: recurringBills.id,
            name: recurringBills.name,
            amount: recurringBills.amount,
            category: recurringBills.category,
            nextDueDate: recurringBills.nextDueDate,
            repeatInterval: recurringBills.repeatInterval,
            installmentsTotal: recurringBills.installmentsTotal,
            installmentsRemaining: recurringBills.installmentsRemaining,
            linkedDebtAccountId: recurringBills.linkedDebtAccountId,
            linkedDebtName: debtAccounts.name,
          })
          .from(recurringBills)
          .leftJoin(
            debtAccounts,
            and(
              eq(debtAccounts.id, recurringBills.linkedDebtAccountId),
              eq(debtAccounts.userId, userId),
            ),
          )
          .where(and(eq(recurringBills.userId, userId), isNull(recurringBills.archivedAt)))
          .orderBy(asc(recurringBills.nextDueDate), asc(recurringBills.id))
          .limit(100),
        client
          .select({ billId: billPayments.billId })
          .from(billPayments)
          .where(and(eq(billPayments.userId, userId), eq(billPayments.periodStart, periodStart)))
          .limit(500),
        client
          .select({ debtId: debtPayments.debtId })
          .from(debtPayments)
          .where(
            and(
              eq(debtPayments.userId, userId),
              gte(debtPayments.paidAt, wibStartOfDay(periodStart)),
            ),
          )
          .limit(500),
      ]);
      const paidBillIds = new Set(paidBills.map((row) => row.billId));
      const paidDebtIds = new Set(paidDebts.map((row) => row.debtId));
      return rows.map((row): BillRow =>
        Object.assign(row, {
          category: expenseCategorySchema.parse(row.category),
          paidThisPeriod: row.linkedDebtAccountId
            ? paidDebtIds.has(row.linkedDebtAccountId)
            : paidBillIds.has(row.id),
        }),
      );
    },
  };
}

export const billRepository = createBillRepository();
