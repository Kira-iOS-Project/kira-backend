/**
 * The Drizzle schema: the source of truth for every table (AGENTS.md §D).
 *
 * No table yet. The first one lands with the feature that needs it: declare it here, then run
 * `bun run db:generate` and commit the generated migration beside it (never edit one by hand).
 * Every column a query filters, sorts or joins on gets its index in the same change (Rule 32).
 */

import { timestamp } from 'drizzle-orm/pg-core';

/**
 * The created and updated pair every table carries: spread it in (`...timestamps`) instead of
 * retyping it. `mode: 'date'` skips the string round trip on each read; precision 3 is
 * millisecond accuracy, with the time zone kept.
 */
export const timestamps = {
  createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', precision: 3, withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
};
