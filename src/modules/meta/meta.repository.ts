/**
 * The meta module's data access: the only file of the module that imports Drizzle or the database
 * client (AGENTS.md Rule 4). The service depends on `MetaRepository`, the port; the object
 * `createMetaRepository` returns is its Drizzle adapter, built over a client a test can replace.
 */

import { sql } from 'drizzle-orm';
import { db } from '../../db/client/index.ts';

/** The one call this repository needs from Drizzle's client, narrow so a test can stand in for it. */
export type DbLike = { execute(query: unknown): Promise<unknown> };

/** What the service may ask of the database, and nothing more. */
export type MetaRepository = {
  /** Resolves when PostgreSQL answers `SELECT 1`; rejects with the driver's error when it does not. */
  ping(): Promise<void>;
};

export function createMetaRepository(client: DbLike = db): MetaRepository {
  return {
    async ping() {
      await client.execute(sql`SELECT 1`);
    },
  };
}

/** The instance the service uses unless a test passes its own. */
export const metaRepository = createMetaRepository();
