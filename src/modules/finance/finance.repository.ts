import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { createAccountFinanceRepository } from './finance.repository.accounts.ts';
import type { FinanceRepository } from './finance.repository.types.ts';

export type { FinanceRepository } from './finance.repository.types.ts';

export function createFinanceRepository(client: PostgresJsDatabase = db): FinanceRepository {
  return { ...createAccountFinanceRepository(client) };
}

export const financeRepository = createFinanceRepository();
