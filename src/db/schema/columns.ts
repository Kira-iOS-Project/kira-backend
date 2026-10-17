/**
 * Column bundles every table shares. `mode: 'date'` skips the string round trip on each read;
 * precision 3 is millisecond accuracy, with the time zone kept.
 */

import { timestamp } from 'drizzle-orm/pg-core';

/** A moment in time: a timestamp with time zone at millisecond precision. */
export function moment(name: string) {
  return timestamp(name, { mode: 'date', precision: 3, withTimezone: true });
}

/** The created and updated pair: spread it in (`...timestamps`) instead of retyping it. */
export const timestamps = {
  createdAt: moment('created_at').defaultNow().notNull(),
  updatedAt: moment('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
};
