/**
 * The bank-import module's data access (AGENTS.md Rules 4 and 10): an import and its rows, the
 * transactions it could duplicate, and saving the reviewed rows once.
 */

import { and, asc, eq, gte, isNull, lt } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { bankImportRows, bankImports, transactions } from '../../db/schema/schema.ts';
import type { TransactionCategory, TransactionType } from '../../lib/money/money.schema.ts';

type NewImport = typeof bankImports.$inferInsert & { id: string };
type NewImportRow = typeof bankImportRows.$inferInsert & { id: string };
type NewTransaction = typeof transactions.$inferInsert;

export type ImportRow = {
  id: string;
  occurredOn: string;
  description: string;
  type: TransactionType;
  amount: number;
  category: TransactionCategory;
};

export type ImportState = {
  committedAt: Date | null;
  savedCount: number | null;
  skippedCount: number | null;
};

export type BankImportRepository = {
  /** What the person recorded in [from, to), to spot rows already there. */
  findRecorded(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<{ occurredAt: Date; type: TransactionType; amount: number }[]>;
  create(input: { bankImport: NewImport; rows: NewImportRow[] }): Promise<void>;
  findImport(userId: string, id: string): Promise<ImportState | null>;
  findRows(importId: string): Promise<ImportRow[]>;
  /** False when the import was already committed. */
  commit(input: {
    userId: string;
    importId: string;
    savedCount: number;
    skippedCount: number;
    now: Date;
    transactions: NewTransaction[];
  }): Promise<boolean>;
};

/** Three months of a busy account; a file holds at most 3000 rows. */
const RECORDED_CEILING = 10_000;
const ROW_CEILING = 3000;

export function createBankImportRepository(client: PostgresJsDatabase = db): BankImportRepository {
  return {
    findRecorded: (userId, from, to) =>
      client
        .select({
          occurredAt: transactions.occurredAt,
          type: transactions.type,
          amount: transactions.amount,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            gte(transactions.occurredAt, from),
            lt(transactions.occurredAt, to),
          ),
        )
        .limit(RECORDED_CEILING),

    async create({ bankImport, rows }) {
      await client.transaction(async (tx) => {
        await tx.insert(bankImports).values(bankImport);
        await tx.insert(bankImportRows).values(rows);
      });
    },

    async findImport(userId, id) {
      const [row] = await client
        .select({
          committedAt: bankImports.committedAt,
          savedCount: bankImports.savedCount,
          skippedCount: bankImports.skippedCount,
        })
        .from(bankImports)
        .where(and(eq(bankImports.userId, userId), eq(bankImports.id, id)))
        .limit(1);
      return row ?? null;
    },

    findRows: (importId) =>
      client
        .select({
          id: bankImportRows.id,
          occurredOn: bankImportRows.occurredOn,
          description: bankImportRows.description,
          type: bankImportRows.type,
          amount: bankImportRows.amount,
          category: bankImportRows.category,
        })
        .from(bankImportRows)
        .where(eq(bankImportRows.importId, importId))
        .orderBy(asc(bankImportRows.rowIndex))
        .limit(ROW_CEILING),

    commit({ userId, importId, savedCount, skippedCount, now, transactions: rows }) {
      return client.transaction(async (tx) => {
        const [claimed] = await tx
          .update(bankImports)
          .set({ committedAt: now, savedCount, skippedCount })
          .where(
            and(
              eq(bankImports.id, importId),
              eq(bankImports.userId, userId),
              isNull(bankImports.committedAt),
            ),
          )
          .returning({ id: bankImports.id });
        if (!claimed) return false;
        if (rows.length > 0) await tx.insert(transactions).values(rows);
        return true;
      });
    },
  };
}

export const bankImportRepository = createBankImportRepository();
