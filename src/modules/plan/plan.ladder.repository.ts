/**
 * What the calculators' prefill reads from the ledger (AGENTS.md Rules 4 and 10): the essential
 * spending recorded in each WIB month of a range, for the average pengeluaran pokok.
 */

import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { transactions } from '../../db/schema/schema.ts';
import { ESSENTIAL_EXPENSE_CATEGORIES } from '../../lib/constants/ladder.ts';
import { TRANSACTION_TYPE } from '../../lib/constants/money.ts';

type MonthTotal = { month: string; total: number };

export type LadderRepository = {
  /** Essential spending per WIB month (`YYYY-MM`) from `from` up to, not including, `to`. */
  essentialByMonth(userId: string, from: Date, to: Date): Promise<MonthTotal[]>;
};

const WIB_MONTH = sql<string>`to_char(${transactions.occurredAt} at time zone 'Asia/Jakarta', 'YYYY-MM')`;

export function createLadderRepository(client: PostgresJsDatabase = db): LadderRepository {
  return {
    essentialByMonth(userId, from, to) {
      return client
        .select({
          month: WIB_MONTH,
          total: sql<number>`sum(${transactions.amount})`.mapWith(Number),
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.type, TRANSACTION_TYPE.expense),
            inArray(transactions.category, [...ESSENTIAL_EXPENSE_CATEGORIES]),
            gte(transactions.occurredAt, from),
            lt(transactions.occurredAt, to),
          ),
        )
        .groupBy(WIB_MONTH);
    },
  };
}

export const ladderRepository = createLadderRepository();
