/**
 * Rencana's goals (REN-02 to REN-05): what the person saves for, with the inputs and the figures
 * the app's calculators computed, and each deposit marked against it. The server keeps what the
 * device computed and checks its ranges; one emergency fund per person.
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { GOAL_AMOUNT_MAX, GOAL_KIND, GOAL_NAME_MAX } from '../../lib/constants/plan.ts';
import { users } from './accounts.ts';
import { moment, timestamps } from './columns.ts';

export const goalKindEnum = pgEnum('goal_kind', enumValues(GOAL_KIND));

/** A calculator's inputs as the app sent them, by name: amounts, rates, years, choices. */
export type GoalInputs = Record<string, number | string | boolean>;

export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    kind: goalKindEnum('kind').notNull(),
    name: varchar('name', { length: GOAL_NAME_MAX }).notNull(),
    inputs: jsonb('inputs').$type<GoalInputs>().notNull(),
    /** What was already saved when the goal was made ("Tabungan saat ini"), whole rupiah. */
    initialAmount: bigint('initial_amount', { mode: 'number' }).notNull(),
    monthlyDeposit: bigint('monthly_deposit', { mode: 'number' }).notNull(),
    targetAmount: bigint('target_amount', { mode: 'number' }).notNull(),
    targetDate: date('target_date', { mode: 'string' }).notNull(),
    /** "Jadikan Pos Budget": recorded now; the Budget screens that read it come later. */
    inBudget: boolean('in_budget').default(false).notNull(),
    /**
     * Set on the emergency fund only, so the unique index allows one per person. A column of its
     * own, never a predicate on the enum, which a migration cannot use in the transaction adding it.
     */
    emergencyOwner: uuid('emergency_owner'),
    ...timestamps,
  },
  (table) => [
    index('goals_user_idx').on(table.userId),
    uniqueIndex('goals_emergency_owner_idx').on(table.emergencyOwner),
    check(
      'goals_amounts_check',
      sql`${table.initialAmount} between 0 and ${sql.raw(String(GOAL_AMOUNT_MAX))} and ${table.monthlyDeposit} between 0 and ${sql.raw(String(GOAL_AMOUNT_MAX))} and ${table.targetAmount} between 1 and ${sql.raw(String(GOAL_AMOUNT_MAX))}`,
    ),
  ],
);

export const goalDeposits = pgTable(
  'goal_deposits',
  {
    /** The app's id for the deposit, so a retried request stores it once. */
    id: uuid('id').primaryKey(),
    goalId: uuid('goal_id')
      .references(() => goals.id, { onDelete: 'cascade' })
      .notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    /** The WIB day the money was put aside. */
    depositedOn: date('deposited_on', { mode: 'string' }).notNull(),
    createdAt: moment('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('goal_deposits_goal_idx').on(table.goalId, table.depositedOn),
    check(
      'goal_deposits_amount_check',
      sql`${table.amount} between 1 and ${sql.raw(String(GOAL_AMOUNT_MAX))}`,
    ),
  ],
);
