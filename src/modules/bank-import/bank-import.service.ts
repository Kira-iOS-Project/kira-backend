/**
 * Impor Mutasi (CAT-11, CAT-12), a Kira Plus feature: the device parses the bank CSV, the server
 * checks the range, flags rows that look already recorded, keeps the rows for review, and saves the
 * chosen ones once. A second commit answers the first one's result.
 */

import { TRANSACTION_SOURCE, TRANSACTION_TYPE } from '../../lib/constants/money.ts';
import { typeOfCategory } from '../../lib/money/money.schema.ts';
import { addDays, daysBetween, wibDate, wibStartOfDay } from '../../lib/time/wib.ts';
import { currentPlanUsage, type PlanUsage, requireVoiceAndImport } from '../usage/index.ts';
import {
  ImportNotFoundError,
  ImportRangeTooLongError,
  ImportRowUnknownError,
} from './bank-import.errors.ts';
import {
  type BankImportRepository,
  bankImportRepository,
  type ImportState,
} from './bank-import.repository.ts';
import type {
  BankImport,
  CommitImportBody,
  CreateImportBody,
  ImportResult,
} from './bank-import.schema.ts';

/** "Batas 3 bulan per file". */
const MAX_IMPORT_DAYS = 92;

type ImportDeps = {
  repository?: BankImportRepository;
  planUsage?: (userId: string) => Promise<PlanUsage>;
  now?: () => Date;
  newId?: () => string;
};

function resolve(deps: ImportDeps) {
  return {
    repository: deps.repository ?? bankImportRepository,
    planUsage: deps.planUsage ?? ((userId: string) => currentPlanUsage(userId)),
    now: deps.now?.() ?? new Date(),
    newId: deps.newId ?? (() => crypto.randomUUID()),
  };
}

const keyOf = (date: string, type: string, amount: number) => `${date}|${type}|${amount}`;

export async function createImport(
  userId: string,
  body: CreateImportBody,
  deps: ImportDeps = {},
): Promise<BankImport> {
  const { repository, planUsage, newId } = resolve(deps);
  requireVoiceAndImport((await planUsage(userId)).plan, TRANSACTION_SOURCE.bankImport);
  const dates = body.rows.map((row) => row.date).toSorted();
  const dateFrom = dates[0] ?? '';
  const dateTo = dates.at(-1) ?? dateFrom;
  const days = daysBetween(dateFrom, dateTo) + 1;
  if (days > MAX_IMPORT_DAYS) throw new ImportRangeTooLongError(days);
  const recorded = await repository.findRecorded(
    userId,
    wibStartOfDay(dateFrom),
    wibStartOfDay(addDays(dateTo, 1)),
  );
  const seen = new Set(recorded.map((row) => keyOf(wibDate(row.occurredAt), row.type, row.amount)));
  const importId = newId();
  const rows = body.rows.map((row, rowIndex) => {
    const type = row.amount < 0 ? TRANSACTION_TYPE.expense : TRANSACTION_TYPE.income;
    const amount = Math.abs(row.amount);
    return {
      id: newId(),
      importId,
      rowIndex,
      occurredOn: row.date,
      description: row.description,
      type,
      amount,
      category: row.category,
      isDuplicate: seen.has(keyOf(row.date, type, amount)),
    };
  });
  await repository.create({
    bankImport: {
      id: importId,
      userId,
      fileName: body.fileName,
      fileSize: body.fileSize,
      rowCount: rows.length,
      dateFrom,
      dateTo,
    },
    rows,
  });
  return {
    id: importId,
    rowCount: rows.length,
    dateFrom,
    dateTo,
    rows: rows.map(({ id, occurredOn, description, amount, type, category, isDuplicate }) => ({
      id,
      date: occurredOn,
      description,
      amount,
      type,
      category,
      isDuplicate,
    })),
  };
}

const resultOf = (state: ImportState): ImportResult => ({
  savedCount: state.savedCount ?? 0,
  skippedCount: state.skippedCount ?? 0,
});

/** Saves the chosen rows as transactions, atomically and once. */
export async function commitImport(
  userId: string,
  importId: string,
  body: CommitImportBody,
  deps: ImportDeps = {},
): Promise<ImportResult> {
  const { repository, now } = resolve(deps);
  const state = await repository.findImport(userId, importId);
  if (!state) throw new ImportNotFoundError();
  if (state.committedAt) return resultOf(state);
  const rows = new Map((await repository.findRows(importId)).map((row) => [row.id, row]));
  const chosen = new Map(body.rows.map((row) => [row.id, row.category]));
  const transactions = [...chosen].map(([id, category]) => {
    const row = rows.get(id);
    if (!row) throw new ImportRowUnknownError();
    if (typeOfCategory(category) !== row.type) throw new ImportRowUnknownError('category type');
    return {
      userId,
      type: row.type,
      amount: row.amount,
      category,
      name: row.description.slice(0, 80),
      occurredAt: wibStartOfDay(row.occurredOn),
      source: TRANSACTION_SOURCE.bankImport,
      importId,
    };
  });
  const result = { savedCount: transactions.length, skippedCount: rows.size - transactions.length };
  if (await repository.commit({ userId, importId, ...result, now, transactions })) return result;
  const settled = await repository.findImport(userId, importId);
  return resultOf(settled ?? state);
}
