/**
 * The in-process scheduler runs routine jobs now and once an hour, and runs deadline jobs at their
 * nextRunAt instant. One replica runs it (`JOBS_ENABLED`); each job also takes its own Postgres
 * advisory lock (src/modules/jobs), so a duplicate run during a deploy skips instead of repeating.
 *
 * A job that throws is logged and the next one still runs. A tick that arrives while the previous
 * run is still going is skipped rather than stacked.
 */

import type { Logger } from 'pino';

export type ScheduledJob = {
  name: string;
  run: (now: Date) => Promise<unknown>;
  nextRunAt?: (now: Date) => Date;
};

/** The clock the scheduler ticks on: it calls back every `ms` until the returned stop is called.
   Tests pass their own and fire it by hand. */
export type SchedulerTimer = (callback: () => void, ms: number) => () => void;
export type SchedulerTimeout = (callback: () => void, ms: number) => () => void;

type SchedulerDeps = {
  logger: Pick<Logger, 'info' | 'error'>;
  intervalMs?: number;
  timer?: SchedulerTimer;
  timeout?: SchedulerTimeout;
  now?: () => Date;
};

export const HOUR_MS = 60 * 60 * 1000;

const realTimer: SchedulerTimer = (callback, ms) => {
  const handle = setInterval(callback, ms);
  return () => clearInterval(handle);
};
const realTimeout: SchedulerTimeout = (callback, ms) => {
  const handle = setTimeout(callback, ms);
  return () => clearTimeout(handle);
};

/** Lib: createScheduler
 * `start()` runs routine jobs now and every `intervalMs`, and arms deadline jobs. `stop()` ends all
 * timers; `runOnce()` runs every job once and resolves when every job has settled.
 */
export function createScheduler(jobs: readonly ScheduledJob[], deps: SchedulerDeps) {
  const {
    logger,
    intervalMs = HOUR_MS,
    timer = realTimer,
    timeout = realTimeout,
    now = () => new Date(),
  } = deps;
  let running = false;
  let cancel: (() => void) | null = null;
  let started = false;
  const scheduledCancels = new Map<ScheduledJob, () => void>();

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

  async function runRoutineJobs(): Promise<void> {
    if (running) return;
    running = true;
    try {
      await jobs
        .filter((job) => job.nextRunAt === undefined)
        .reduce(async (previous, job) => {
          await previous;
          await runJob(job);
        }, Promise.resolve());
    } finally {
      running = false;
    }
  }

  function schedule(job: ScheduledJob): void {
    if (!started || !job.nextRunAt) return;
    const current = now();
    const target = job.nextRunAt(current);
    const stopTimer = timeout(
      () => {
        scheduledCancels.delete(job);
        void runAndReschedule(job);
      },
      Math.max(0, target.getTime() - current.getTime()),
    );
    scheduledCancels.set(job, stopTimer);
  }

  async function runAndReschedule(job: ScheduledJob): Promise<void> {
    await runJob(job);
    schedule(job);
  }

  return {
    runOnce,
    start(): void {
      if (started) return;
      started = true;
      cancel = timer(() => void runRoutineJobs(), intervalMs);
      for (const job of jobs) schedule(job);
      void runRoutineJobs();
    },
    stop(): void {
      if (!started) return;
      started = false;
      cancel?.();
      cancel = null;
      for (const stopTimer of scheduledCancels.values()) stopTimer();
      scheduledCancels.clear();
    },
  };
}
