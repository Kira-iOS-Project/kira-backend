import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { debtAccounts, recurringBills } from '../../db/schema/schema.ts';
import type { CreateBillBody } from './finance.bills.schema.ts';
import type { FinanceRepository } from './finance.repository.types.ts';
import { billColumns, billRow, billScheduleColumns } from './finance.repository.bills.shared.ts';

type BillCreateRepository = Pick<FinanceRepository, 'createBill'>;

export function createBillCreateRepository(client: PostgresJsDatabase = db): BillCreateRepository {
  return {
    async createBill(userId, body: CreateBillBody) {
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
