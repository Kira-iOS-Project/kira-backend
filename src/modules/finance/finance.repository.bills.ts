import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { createBillCreateRepository } from './finance.repository.bills.create.ts';
import {
  createBillDeleteRepository,
  createBillEditRepository,
} from './finance.repository.bills.edit.ts';
import { createBillListRepository } from './finance.repository.bills.list.ts';
import type { FinanceRepository } from './finance.repository.types.ts';

type BillRepository = Pick<
  FinanceRepository,
  'listBills' | 'createBill' | 'getBill' | 'updateBill' | 'deleteBill'
>;

export function createBillRepository(client: PostgresJsDatabase = db): BillRepository {
  return {
    ...createBillListRepository(client),
    ...createBillCreateRepository(client),
    ...createBillEditRepository(client),
    ...createBillDeleteRepository(client),
  };
}

export const billRepository = createBillRepository();
