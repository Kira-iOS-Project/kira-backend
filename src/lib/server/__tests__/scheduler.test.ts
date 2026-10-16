import { describe, expect, test } from 'bun:test';
import { createScheduler, HOUR_MS, type ScheduledJob, type SchedulerTimer } from '../scheduler.ts';

const NOW = new Date('2026-10-16T05:00:00.000Z');

function createHarness(jobs: ScheduledJob[]) {
  const logged: { level: string; payload: unknown }[] = [];
  const ticks: { callback: () => void; ms: number; stopped: boolean }[] = [];
  const timer: SchedulerTimer = (callback, ms) => {
    const tick = { callback, ms, stopped: false };
    ticks.push(tick);
    return () => {
      tick.stopped = true;
    };
  };
  const scheduler = createScheduler(jobs, {
    logger: {
      info: (payload: unknown) => logged.push({ level: 'info', payload }),
      error: (payload: unknown) => logged.push({ level: 'error', payload }),
    } as never,
    timer,
    now: () => NOW,
  });
  return { scheduler, logged, ticks };
}

describe('createScheduler', () => {
  test('runs the jobs in order with the current time, and keeps going after a failure', async () => {
    const order: string[] = [];
    const { scheduler, logged } = createHarness([
      {
        name: 'first',
        run: async (now) => {
          order.push(`first ${now.toISOString()}`);
          throw new Error('boom');
        },
      },
      { name: 'second', run: async () => order.push('second') },
    ]);

    await scheduler.runOnce();

    expect(order).toEqual([`first ${NOW.toISOString()}`, 'second']);
    expect(logged.map((entry) => entry.level)).toEqual(['error', 'info']);
  });

  test('skips a run while the previous one is still going', async () => {
    let release = () => undefined as void;
    let runs = 0;
    const { scheduler } = createHarness([
      {
        name: 'slow',
        run: () => {
          runs += 1;
          return new Promise<void>((resolve) => {
            release = resolve;
          });
        },
      },
    ]);

    const first = scheduler.runOnce();
    await scheduler.runOnce();
    release();
    await first;

    expect(runs).toBe(1);
  });

  test('starts once, ticks every hour, and stops', async () => {
    let runs = 0;
    const { scheduler, ticks } = createHarness([{ name: 'count', run: async () => (runs += 1) }]);

    scheduler.start();
    scheduler.start();
    await Bun.sleep(0);
    ticks[0]?.callback();
    await Bun.sleep(0);
    scheduler.stop();
    scheduler.stop();

    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.ms).toBe(HOUR_MS);
    expect(ticks[0]?.stopped).toBe(true);
    expect(runs).toBe(2);
  });

  test('ticks on the real clock by default', async () => {
    let runs = 0;
    const scheduler = createScheduler([{ name: 'count', run: async () => (runs += 1) }], {
      logger: { info: () => undefined, error: () => undefined } as never,
      intervalMs: 5,
    });

    scheduler.start();
    await Bun.sleep(30);
    scheduler.stop();

    expect(runs).toBeGreaterThan(1);
  });
});
