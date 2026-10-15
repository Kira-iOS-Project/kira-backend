/**
 * An ordered, single-shot process shutdown.
 *
 * SIGINT and SIGTERM can arrive together; only the first request runs, so nothing is closed twice.
 * A step that throws is logged and skipped rather than aborting the rest, and a step that never
 * settles is cut off by the force-exit timer: closing a client whose server is already gone is
 * exactly when a close call hangs.
 */

import type { Logger } from 'pino';

export interface ShutdownStep {
  name: string;
  run: () => unknown;
}

interface Timer {
  unref?: () => unknown;
}

interface ShutdownDeps {
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  forceExitMs: number;
  exit?: (code: number) => void;
  setTimer?: (callback: () => void, ms: number) => Timer;
}

/** The exit code of a shutdown that had to be cut off: whatever was asked for did not finish. */
const FORCED_EXIT_CODE = 1;

/** Lib: createShutdown
 * Returns `requestShutdown(reason, code)`, which runs `steps` in order and then exits with `code`.
 */
export function createShutdown(
  steps: readonly ShutdownStep[],
  {
    logger,
    forceExitMs,
    exit = (code) => process.exit(code),
    setTimer = (callback, ms) => setTimeout(callback, ms),
  }: ShutdownDeps,
) {
  let started = false;

  /** One after another, not concurrently: the server stops taking requests before the pool its
     handlers use is closed. */
  async function runInOrder([step, ...rest]: readonly ShutdownStep[]): Promise<void> {
    if (!step) return;
    try {
      await step.run();
    } catch (error) {
      logger.warn({ err: error, step: step.name }, 'Shutdown step failed, continuing');
    }
    await runInOrder(rest);
  }

  return async function requestShutdown(reason: string, code: number): Promise<void> {
    if (started) return;
    started = true;
    logger.info({ reason, code }, 'Shutting down');

    /** Unref'd, so the timer alone never keeps a finished process alive. */
    setTimer(() => {
      logger.error({ reason, forceExitMs }, 'Shutdown did not finish in time, forcing exit');
      exit(FORCED_EXIT_CODE);
    }, forceExitMs).unref?.();

    await runInOrder(steps);
    exit(code);
  };
}
