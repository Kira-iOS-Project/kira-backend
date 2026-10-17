/** User-owned wallet accounts for UNG. */

import { sql } from 'drizzle-orm';
import { bigint, check, index, pgEnum, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { WALLET_TYPE } from '../../lib/constants/ung.ts';
import { MAX_AMOUNT } from '../../lib/money/money.schema.ts';
import { users } from './accounts.ts';
import { timestamps } from './columns.ts';

export const walletTypeEnum = pgEnum('wallet_type', enumValues(WALLET_TYPE));

export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 60 }).notNull(),
    type: walletTypeEnum('type').notNull(),
    openingBalance: bigint('opening_balance', { mode: 'number' }).notNull(),
    ...timestamps,
  },
  (table) => [
    index('wallets_user_created_idx').on(table.userId, table.createdAt.desc()),
    check(
      'wallets_opening_balance_check',
      sql`${table.openingBalance} between 0 and ${sql.raw(String(MAX_AMOUNT))}`,
    ),
  ],
);
