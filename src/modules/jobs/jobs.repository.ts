/**
 * The housekeeping job's data access: sign-in codes past any use (AGENTS.md Rules 4 and 10).
 */

import { lt } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { authCodes } from '../../db/schema/schema.ts';

export type JobsRepository = {
  /** Deletes the codes created before `before`; returns how many. */
  deleteAuthCodesCreatedBefore(before: Date): Promise<number>;
};

export function createJobsRepository(client: PostgresJsDatabase = db): JobsRepository {
  return {
    async deleteAuthCodesCreatedBefore(before) {
      const rows = await client
        .delete(authCodes)
        .where(lt(authCodes.createdAt, before))
        .returning({ id: authCodes.id });
      return rows.length;
    },
  };
}

export const jobsRepository = createJobsRepository();
