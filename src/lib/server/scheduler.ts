/**
 * The in-process scheduler: every hour it runs the scheduled jobs (renewal reminders, subscription
 * periods, Beasiswa Kira reviews, auth code cleanup) one after another. One replica runs it
 * (`JOBS_ENABLED`); each job also takes its own Postgres advisory lock (src/modules/jobs), so a run
 * that overlaps another process's during a deploy skips the job instead of repeating it.
 *
 * A job that throws is logged and the next one still runs. A tick that arrives while the previous
 * run is still going is skipped rather than stacked.
 */

import type { Logger } from 'pino';

export type ScheduledJob = { name: string; run: (now: Date) => Promise<unknown> };

/** The clock the scheduler ticks on: it calls back every `ms` until the returned stop is called.
   Tests pass their own and fire it by hand. */
export type SchedulerTimer = (callback: () => void, ms: number) => () => void;

type SchedulerDeps = {
  logger: Pick<Logger, 'info' | 'error'>;
  intervalMs?: number;
  timer?: SchedulerTimer;
  now?: () => Date;
};

export const HOUR_MS = 60 * 60 * 1000;

const realTimer: SchedulerTimer = (callback, ms) => {
  const handle = setInterval(callback, ms);
  return () => clearInterval(handle);
};

/** Lib: createScheduler
 * `start()` runs the jobs now and then every `intervalMs`; `stop()` ends the ticking; `runOnce()`
 * is one run, resolved when every job has settled.
 */
export function createScheduler(jobs: readonly ScheduledJob[], deps: SchedulerDeps) {
  const { logger, intervalMs = HOUR_MS, timer = realTimer, now = () => new Date() } = deps;
  let running = false;
  let cancel: (() => void) | null = null;

  async function runJob(job: ScheduledJob): Promise<void> {
    try {
      const result = await job.run(now());
      logger.info({ job: job.name, result }, 'Scheduled job finished');
    } catch (err) {
      logger.error({ err, job: job.name }, 'Scheduled job failed');
    }
  }

  async function runOnce(): Promise<void> {
    if (running) return;
    running = true;
    try {
      await jobs.reduce(async (previous, job) => {
        await previous;
        await runJob(job);
      }, Promise.resolve());
    } finally {
      running = false;
    }
  }

  return {
    runOnce,
    start(): void {
      if (cancel !== null) return;
      cancel = timer(() => void runOnce(), intervalMs);
      void runOnce();
    },
    stop(): void {
      if (cancel === null) return;
      cancel();
      cancel = null;
    },
  };
}
