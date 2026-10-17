/**
 * The payoff module's data access (AGENTS.md Rules 4 and 10): the open debt accounts a plan is
 * simulated from.
 */

import { and, eq, gt, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { debtAccounts } from '../../db/schema/schema.ts';
import type { DEBT_KIND } from '../../lib/constants/profile.ts';

type Values<T> = T[keyof T];

/** An open debt account with something left to pay. */
export type OpenDebt = {
  id: string;
  kind: Values<typeof DEBT_KIND>;
  name: string;
  remaining: number;
  monthlyInstalment: number;
  annualInterestRate: number | null;
  dueDay: number | null;
};

/** At most this many accounts are read: the quiz accepts twenty. */
const DEBT_LIMIT = 50;

export type PayoffRepository = {
  listOpenDebts(userId: string): Promise<OpenDebt[]>;
};

export function createPayoffRepository(client: PostgresJsDatabase = db): PayoffRepository {
  return {
    listOpenDebts(userId) {
      return client
        .select({
          id: debtAccounts.id,
          kind: debtAccounts.kind,
          name: debtAccounts.name,
          remaining: debtAccounts.remainingAmount,
          monthlyInstalment: debtAccounts.monthlyInstalment,
          annualInterestRate: debtAccounts.annualInterestRate,
          dueDay: debtAccounts.dueDay,
        })
        .from(debtAccounts)
        .where(
          and(
            eq(debtAccounts.userId, userId),
            isNull(debtAccounts.paidOffAt),
            gt(debtAccounts.remainingAmount, 0),
          ),
        )
        .orderBy(debtAccounts.createdAt, debtAccounts.id)
        .limit(DEBT_LIMIT);
    },
  };
}

export const payoffRepository = createPayoffRepository();
