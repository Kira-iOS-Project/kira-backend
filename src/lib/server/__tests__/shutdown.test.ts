import { describe, expect, spyOn, test } from 'bun:test';
import pino from 'pino';
import { createShutdown, type ShutdownStep } from '../shutdown.ts';

function createHarness(steps: readonly ShutdownStep[]) {
  const exits: number[] = [];
  const warnings: unknown[] = [];
  const timers: Array<{ callback: () => void; ms: number; unrefed: boolean }> = [];

  const requestShutdown = createShutdown(steps, {
    logger: {
      info: () => undefined,
      warn: (payload: unknown) => {
        warnings.push(payload);
      },
      error: () => undefined,
    } as never,
    forceExitMs: 8_000,
    exit: (code) => {
      exits.push(code);
    },
    setTimer: (callback, ms) => {
      const timer = { callback, ms, unrefed: false };
      timers.push(timer);
      return {
        unref: () => {
          timer.unrefed = true;
        },
      };
    },
  });

  return { requestShutdown, exits, warnings, timers };
}

describe('createShutdown', () => {
  test('runs every step in order and exits with the requested code', async () => {
    const order: string[] = [];
    const { requestShutdown, exits } = createHarness([
      { name: 'http', run: () => order.push('http') },
      { name: 'postgres', run: async () => order.push('postgres') },
    ]);

    await requestShutdown('SIGTERM', 0);

    expect(order).toEqual(['http', 'postgres']);
    expect(exits).toEqual([0]);
  });

  test('ignores every request after the first', async () => {
    let runs = 0;
    const { requestShutdown, exits } = createHarness([{ name: 'http', run: () => runs++ }]);

    await Promise.all([requestShutdown('SIGINT', 0), requestShutdown('SIGTERM', 1)]);

    expect(runs).toBe(1);
    expect(exits).toEqual([0]);
  });

  test('logs a failing step and still runs the rest', async () => {
    const order: string[] = [];
    const { requestShutdown, exits, warnings } = createHarness([
      {
        name: 'http',
        run: () => {
          throw new Error('already stopped');
        },
      },
      { name: 'postgres', run: () => order.push('postgres') },
    ]);

    await requestShutdown('SIGTERM', 0);

    expect(order).toEqual(['postgres']);
    expect(warnings).toHaveLength(1);
    expect(exits).toEqual([0]);
  });

  test('arms an unref’d force-exit timer that exits with 1 when a step hangs', () => {
    const { requestShutdown, exits, timers } = createHarness([
      { name: 'postgres', run: () => new Promise(() => undefined) },
    ]);

    void requestShutdown('SIGTERM', 0);

    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBe(8_000);
    expect(timers[0]?.unrefed).toBe(true);
    expect(exits).toEqual([]);

    timers[0]?.callback();

    expect(exits).toEqual([1]);
  });

  test('exits through process.exit and a real timer when neither is injected', async () => {
    /** The defaults are what production runs. `process.exit` is intercepted and thrown out of; the
       real timer is unref'd and far off, so it never fires here. */
    const codes: unknown[] = [];
    const exit = spyOn(process, 'exit').mockImplementation((code) => {
      codes.push(code);
      throw new Error('process.exit');
    });
    try {
      const requestShutdown = createShutdown([], {
        logger: pino({ enabled: false }),
        forceExitMs: 600_000,
      });

      await expect(requestShutdown('SIGTERM', 0)).rejects.toThrow('process.exit');
      expect(codes).toEqual([0]);
    } finally {
      exit.mockRestore();
    }
  });
});
