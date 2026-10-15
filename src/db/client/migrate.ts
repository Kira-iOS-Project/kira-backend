/**
 * Applies pending migrations before the server starts (`src/index.ts`), over a connection of its
 * own and never the app pool.
 *
 * The pool carries the request-sized `statement_timeout`, which Postgres would apply to every
 * migration statement too: an index build or a backfill that runs longer would be cancelled and
 * the run rolled back. This is the one place `{ max: 1 }` is right, and the connection sets no
 * timeout. Until the first table exists there is no migration journal, and nothing to apply.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const MIGRATIONS_FOLDER = './src/db/migrations';

/** Lib: runMigrations
 * Applies every migration the journal lists and the database lacks; `none` when there is no
 * journal yet. The connection is closed whether or not they applied.
 *
 * @param url - The database to migrate.
 */
export async function runMigrations(url: string): Promise<'applied' | 'none'> {
  if (!existsSync(join(MIGRATIONS_FOLDER, 'meta/_journal.json'))) return 'none';
  const connection = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await migrate(drizzle(connection), { migrationsFolder: MIGRATIONS_FOLDER });
    return 'applied';
  } finally {
    await connection.end();
  }
}
