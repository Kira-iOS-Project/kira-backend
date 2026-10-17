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

type BillRepository = Pick<FinanceRepository, 'listBills' | 'createBill'>;

const billScheduleColumns = {
  id: recurringBills.id,
  name: recurringBills.name,
  amount: recurringBills.amount,
  category: recurringBills.category,
  nextDueDate: recurringBills.nextDueDate,
  repeatInterval: recurringBills.repeatInterval,
  installmentsTotal: recurringBills.installmentsTotal,
  installmentsRemaining: recurringBills.installmentsRemaining,
  linkedDebtAccountId: recurringBills.linkedDebtAccountId,
};

const billColumns = {
  ...billScheduleColumns,
  linkedDebtName: debtAccounts.name,
};

type DatabaseBillRow = Omit<BillRow, 'paidThisPeriod' | 'category'> & { category: string };

function billRow(row: DatabaseBillRow): BillRow {
  return {
    ...row,
    category: expenseCategorySchema.parse(row.category),
    paidThisPeriod: false,
  };
}

export function createBillRepository(client: PostgresJsDatabase = db): BillRepository {
  return {
    async listBills(userId, periodStart) {
      const [rows, paidBills, paidDebts] = await Promise.all([
        client
          .select({
            ...billColumns,
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
        Object.assign(billRow(row), {
          paidThisPeriod: row.linkedDebtAccountId
            ? paidDebtIds.has(row.linkedDebtAccountId)
            : paidBillIds.has(row.id),
        }),
      );
    },

    async createBill(userId, body) {
      return client.transaction(async (tx) => {
        const [existing] = await tx
          .select(billColumns)
          .from(recurringBills)
          .leftJoin(
            debtAccounts,
            and(
              eq(debtAccounts.id, recurringBills.linkedDebtAccountId),
              eq(debtAccounts.userId, userId),
            ),
          )
          .where(and(eq(recurringBills.userId, userId), eq(recurringBills.clientId, body.clientId)))
          .limit(1);
        if (existing) return billRow(existing);

        const linkedDebtAccountId = body.linkedDebtAccountId ?? null;
        let linkedDebtName: string | null = null;
        let installmentsTotal = body.installmentsTotal ?? null;
        let installmentsRemaining = body.installmentsRemaining ?? null;
        if (linkedDebtAccountId) {
          const [debt] = await tx
            .select({
              id: debtAccounts.id,
              name: debtAccounts.name,
              tenor: debtAccounts.remainingTenorMonths,
            })
            .from(debtAccounts)
            .where(and(eq(debtAccounts.id, linkedDebtAccountId), eq(debtAccounts.userId, userId)))
            .for('update')
            .limit(1);
          if (!debt) return null;
          linkedDebtName = debt.name;
          installmentsTotal ??= debt.tenor;
          installmentsRemaining ??= debt.tenor;
        }

        const [created] = await tx
          .insert(recurringBills)
          .values({
            userId,
            clientId: body.clientId,
            linkedDebtAccountId,
            name: body.name,
            amount: body.amount,
            category: body.category,
            nextDueDate: body.nextDueDate,
            repeatInterval: body.repeatInterval,
            installmentsTotal,
            installmentsRemaining,
          })
          .onConflictDoNothing({ target: [recurringBills.userId, recurringBills.clientId] })
          .returning(billScheduleColumns);
        if (created) return billRow({ ...created, linkedDebtName });

        const [raced] = await tx
          .select(billColumns)
          .from(recurringBills)
          .leftJoin(
            debtAccounts,
            and(
              eq(debtAccounts.id, recurringBills.linkedDebtAccountId),
              eq(debtAccounts.userId, userId),
            ),
          )
          .where(and(eq(recurringBills.userId, userId), eq(recurringBills.clientId, body.clientId)))
          .limit(1);
        return raced ? billRow(raced) : null;
      });
    },
  };
}

export const billRepository = createBillRepository();
