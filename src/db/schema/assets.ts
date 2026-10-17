/**
 * Portofolio Manual (REN-10, REN-11): the assets a person records by hand, each with its value on
 * the day they last looked. Their total stands in for the health check's "Emas, saham, dan simpanan
 * lain" in the Utang terhadap Aset indicator.
 */

import { bigint, check, date, index, pgEnum, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { ASSET_CLASS, ASSET_NAME_MAX, ASSET_VALUE_MAX } from '../../lib/constants/asset.ts';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { users } from './accounts.ts';
import { timestamps } from './columns.ts';

export const assetClassEnum = pgEnum('asset_class', enumValues(ASSET_CLASS));

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    assetClass: assetClassEnum('asset_class').notNull(),
    name: varchar('name', { length: ASSET_NAME_MAX }).notNull(),
    /** Whole rupiah, like every amount Kira keeps. */
    value: bigint('value', { mode: 'number' }).notNull(),
    /** The WIB day the value was read ("Tanggal"). */
    valuedOn: date('valued_on', { mode: 'string' }).notNull(),
    ...timestamps,
  },
  (table) => [
    index('assets_user_idx').on(table.userId),
    check(
      'assets_value_check',
      sql`${table.value} between 1 and ${sql.raw(String(ASSET_VALUE_MAX))}`,
    ),
  ],
);
