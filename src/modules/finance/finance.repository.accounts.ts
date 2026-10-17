import { asc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { debtAccounts, wallets } from '../../db/schema/schema.ts';
import type { FinanceRepository } from './finance.repository.types.ts';

type AccountRepository = Pick<
  FinanceRepository,
  'listWallets' | 'createWallet' | 'listDebts' | 'createDebt'
>;

export function createAccountFinanceRepository(client: PostgresJsDatabase = db): AccountRepository {
  return {
    async listWallets(userId) {
      return await client
        .select({
          id: wallets.id,
          name: wallets.name,
          type: wallets.type,
          balance: wallets.openingBalance,
          createdAt: wallets.createdAt,
        })
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .orderBy(asc(wallets.createdAt), asc(wallets.id))
        .limit(100);
    },
    async createWallet(userId, body, now) {
      const [row] = await client
        .insert(wallets)
        .values({ userId, ...body, createdAt: now, updatedAt: now })
        .returning({
          id: wallets.id,
          name: wallets.name,
          type: wallets.type,
          balance: wallets.openingBalance,
          createdAt: wallets.createdAt,
        });
      if (!row) throw new Error('Wallet insert returned no row.');
      return row;
    },
    async listDebts(userId) {
      return await client
        .select({
          id: debtAccounts.id,
          name: debtAccounts.name,
          kind: debtAccounts.kind,
          originalAmount: debtAccounts.originalAmount,
          remainingAmount: debtAccounts.remainingAmount,
          monthlyInstallment: debtAccounts.monthlyInstalment,
          remainingTenorMonths: debtAccounts.remainingTenorMonths,
          dueDay: debtAccounts.dueDay,
          paymentStatus: debtAccounts.paymentStatus,
        })
        .from(debtAccounts)
        .where(eq(debtAccounts.userId, userId))
        .orderBy(asc(debtAccounts.createdAt), asc(debtAccounts.id))
        .limit(100);
    },
    async createDebt(userId, body, now) {
      const [row] = await client
        .insert(debtAccounts)
        .values({
          userId,
          kind: body.kind,
          name: body.name,
          originalAmount: body.amount,
          remainingAmount: body.amount,
          monthlyInstalment: body.monthlyInstallment,
          remainingTenorMonths: body.remainingTenorMonths,
          dueDay: body.dueDay,
          /** Added in Dompet: a health check retake leaves it alone. */
          fromHealthCheck: false,
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          id: debtAccounts.id,
          name: debtAccounts.name,
          kind: debtAccounts.kind,
          originalAmount: debtAccounts.originalAmount,
          remainingAmount: debtAccounts.remainingAmount,
          monthlyInstallment: debtAccounts.monthlyInstalment,
          remainingTenorMonths: debtAccounts.remainingTenorMonths,
          dueDay: debtAccounts.dueDay,
          paymentStatus: debtAccounts.paymentStatus,
        });
      if (!row) throw new Error('Debt insert returned no row.');
      return row;
    },
  };
}
