/**
 * The home module's data access (AGENTS.md Rules 4 and 10): the account and the health-check
 * amounts Beranda shows, transaction totals over a window, the weekly-summary consent and the
 * debt accounts' totals.
 */

import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import {
  consents,
  debtAccounts,
  financialProfiles,
  transactions,
  users,
} from '../../db/schema/schema.ts';
import { CONSENT_PURPOSE } from '../../lib/constants/consents.ts';
import { TRANSACTION_TYPE } from '../../lib/constants/money.ts';
import type { FOCUS } from '../../lib/constants/profile.ts';
import type { Payday } from '../../lib/time/wib.ts';

export type HomeAccount = {
  displayName: string;
  hideBalances: boolean;
  focus: (typeof FOCUS)[keyof typeof FOCUS];
  payday: Payday;
  healthCheckDone: boolean;
  income: number | null;
  essential: number | null;
  emergencyFund: number | null;
};

export type Totals = { income: number; expense: number; count: number };

export type HomeRepository = {
  findAccount(userId: string): Promise<HomeAccount | null>;
  hasTransactions(userId: string): Promise<boolean>;
  /** Income, expenses and how many transactions occurred in [from, to). */
  totalsBetween(userId: string, from: Date, to: Date): Promise<Totals>;
  weeklySummaryEnabled(userId: string): Promise<boolean>;
  debtTotals(userId: string): Promise<{ original: number; remaining: number }>;
};

function sumOf(type: (typeof TRANSACTION_TYPE)[keyof typeof TRANSACTION_TYPE]) {
  return sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = ${type}), 0)`.mapWith(
    Number,
  );
}

export function createHomeRepository(client: PostgresJsDatabase = db): HomeRepository {
  return {
    async findAccount(userId) {
      const [row] = await client
        .select({
          displayName: users.displayName,
          hideBalances: users.hideBalances,
          focus: users.focus,
          paydayDay: users.paydayDay,
          paydayEndOfMonth: users.paydayEndOfMonth,
          completedAt: financialProfiles.completedAt,
          income: financialProfiles.netMonthlyIncome,
          essential: financialProfiles.essentialMonthlyExpenses,
          emergencyFund: financialProfiles.emergencyFund,
        })
        .from(users)
        .leftJoin(financialProfiles, eq(financialProfiles.userId, users.id))
        .where(eq(users.id, userId))
        .limit(1);
      if (!row) return null;
      const { paydayDay, paydayEndOfMonth, completedAt, ...account } = row;
      return {
        ...account,
        payday: { day: paydayDay, endOfMonth: paydayEndOfMonth },
        healthCheckDone: completedAt !== null,
      };
    },

    async hasTransactions(userId) {
      const rows = await client
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.userId, userId))
        .limit(1);
      return rows.length > 0;
    },

    async totalsBetween(userId, from, to) {
      const [row] = await client
        .select({
          income: sumOf(TRANSACTION_TYPE.income),
          expense: sumOf(TRANSACTION_TYPE.expense),
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            gte(transactions.occurredAt, from),
            lt(transactions.occurredAt, to),
          ),
        );
      return row ?? { income: 0, expense: 0, count: 0 };
    },

    async weeklySummaryEnabled(userId) {
      const [row] = await client
        .select({ granted: consents.granted })
        .from(consents)
        .where(
          and(eq(consents.userId, userId), eq(consents.purpose, CONSENT_PURPOSE.weeklySummary)),
        )
        .orderBy(desc(consents.decidedAt))
        .limit(1);
      return row?.granted ?? false;
    },

    async debtTotals(userId) {
      const [row] = await client
        .select({
          original: sql<number>`coalesce(sum(${debtAccounts.originalAmount}), 0)`.mapWith(Number),
          remaining: sql<number>`coalesce(sum(${debtAccounts.remainingAmount}), 0)`.mapWith(Number),
        })
        .from(debtAccounts)
        .where(eq(debtAccounts.userId, userId));
      return row ?? { original: 0, remaining: 0 };
    },
  };
}

export const homeRepository = createHomeRepository();
