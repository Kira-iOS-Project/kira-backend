/**
 * The server process: validate the environment, bring the schema up to date, serve, and shut
 * down in order on SIGINT or SIGTERM.
 */

/** First, so a bad environment stops the process before anything reads it. */
import { env } from './env.ts';
import { app } from './app.ts';
import { client } from './db/client/index.ts';
import { runMigrations } from './db/client/migrate.ts';
import { logger } from './lib/server/logger.ts';
import { mountApiDocs } from './lib/server/openapi.ts';
import { createScheduler } from './lib/server/scheduler.ts';
import { createShutdown } from './lib/server/shutdown.ts';
import { syncCommunityCatalog } from './modules/community/index.ts';
import { scheduledJobs } from './modules/jobs/index.ts';

if (env.DATABASE_URL === undefined) {
  logger.fatal('DATABASE_URL is not set: the server cannot start without its database');
  process.exit(1);
}

/** The schema the code expects exists before the first request: a failed migration stops the
   boot, and the platform keeps the previous container serving. */
logger.info({ migrations: await runMigrations(env.DATABASE_URL) }, 'Migrations checked');

/** The groups and products the Kira team curates, written from the code (no admin UI yet). */
logger.info({ community: await syncCommunityCatalog() }, 'Community catalog synced');

mountApiDocs(app, env.DOCS_ENABLED);

const server = Bun.serve({ port: env.PORT, fetch: app.fetch });
logger.info({ port: server.port, docs: env.DOCS_ENABLED }, 'Kira API listening');

/** Renewal reminders, subscription periods, Beasiswa Kira reviews and code cleanup, hourly. */
const scheduler = createScheduler(scheduledJobs, { logger });
if (env.JOBS_ENABLED) scheduler.start();
logger.info({ jobs: env.JOBS_ENABLED }, 'Scheduler checked');

const requestShutdown = createShutdown(
  [
    { name: 'scheduler', run: () => scheduler.stop() },
    { name: 'http', run: () => server.stop(true) },
    { name: 'postgres', run: () => client.end({ timeout: 5 }) },
  ],
  { logger, forceExitMs: env.SHUTDOWN_FORCE_EXIT_MS },
);

process.on('SIGINT', () => void requestShutdown('SIGINT', 0));
process.on('SIGTERM', () => void requestShutdown('SIGTERM', 0));
