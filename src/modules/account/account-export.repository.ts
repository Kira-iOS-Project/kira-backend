/**
 * The emailed export's cooldown (AKN-05, Rule 24): one conditional UPDATE decides and records the
 * send at once, so a burst of taps emails the history once.
 */

import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { users } from '../../db/schema/schema.ts';

export type ExportEmailClaims = {
  /** Records a send at `now` unless one was recorded after `since`; false when it was. */
  claim(userId: string, now: Date, since: Date): Promise<boolean>;
  /** Gives back a claim made at `at` whose email did not go out. */
  release(userId: string, at: Date): Promise<void>;
};

export function createExportEmailClaims(client: PostgresJsDatabase = db): ExportEmailClaims {
  return {
    async claim(userId, now, since) {
      const rows = await client
        .update(users)
        .set({ exportEmailedAt: now })
        .where(
          and(eq(users.id, userId), or(isNull(users.exportEmailedAt), lt(users.exportEmailedAt, since))),
        )
        .returning({ id: users.id });
      return rows.length > 0;
    },

    async release(userId, at) {
      await client
        .update(users)
        .set({ exportEmailedAt: null })
        .where(and(eq(users.id, userId), eq(users.exportEmailedAt, at)));
    },
  };
}

export const exportEmailClaims = createExportEmailClaims();
