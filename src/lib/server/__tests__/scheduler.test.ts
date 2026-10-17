import { describe, expect, test } from 'bun:test';
import {
  createScheduler,
  HOUR_MS,
  type ScheduledJob,
  type SchedulerTimeout,
  type SchedulerTimer,
} from '../scheduler.ts';
import { nextThursdayAt0600Wib } from '../../time/wib.ts';

const NOW = new Date('2026-10-16T05:00:00.000Z');

function createHarness(jobs: ScheduledJob[], now: () => Date = () => NOW) {
  const logged: { level: string; payload: unknown }[] = [];
  const ticks: { callback: () => void; ms: number; stopped: boolean }[] = [];
  const timeouts: { callback: () => void; ms: number; stopped: boolean }[] = [];
  const timer: SchedulerTimer = (callback, ms) => {
    const tick = { callback, ms, stopped: false };
    ticks.push(tick);
    return () => {
      tick.stopped = true;
    };
  };
  const timeout: SchedulerTimeout = (callback, ms) => {
    const timeoutEntry = { callback, ms, stopped: false };
    timeouts.push(timeoutEntry);
    return () => {
      timeoutEntry.stopped = true;
    };
  };
  const scheduler = createScheduler(jobs, {
    logger: {
      info: (payload: unknown) => logged.push({ level: 'info', payload }),
      error: (payload: unknown) => logged.push({ level: 'error', payload }),
    } as never,
    timer,
    timeout,
    now,
  });
  return { scheduler, logged, ticks, timeouts };
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

  test('runs one-shot jobs at their deadline, reschedules them, and cancels the next deadline', async () => {
    let clock = new Date('2026-10-14T22:00:00.000Z');
    const seen: Date[] = [];
    const { scheduler, timeouts, ticks } = createHarness(
      [
        {
          name: 'weekly-summary',
          run: async (now) => seen.push(now),
          nextRunAt: nextThursdayAt0600Wib,
        },
      ],
      () => clock,
    );

    scheduler.start();
    await Bun.sleep(0);
    expect(timeouts[0]?.ms).toBe(60 * 60 * 1000);
    expect(seen).toEqual([]);
    ticks[0]?.callback();
    await Bun.sleep(0);
    expect(seen).toEqual([]);

    clock = new Date('2026-10-14T23:00:00.000Z');
    timeouts[0]?.callback();
    await Bun.sleep(0);
    expect(seen).toEqual([clock]);
    expect(timeouts[1]?.ms).toBe(7 * 24 * 60 * 60 * 1000);

    scheduler.stop();
    expect(timeouts[1]?.stopped).toBe(true);
  });

  test('uses the real one-shot timeout and cancels the future reschedule', async () => {
    let scheduled = 0;
    let runs = 0;
    const clock = new Date('2026-10-14T22:00:00.000Z');
    const ticks: { stopped: boolean }[] = [];
    const scheduler = createScheduler(
      [
        {
          name: 'weekly-summary',
          run: async () => (runs += 1),
          nextRunAt: (now) => (scheduled++ === 0 ? now : new Date(now.getTime() + 60_000)),
        },
      ],
      {
        logger: { info: () => undefined, error: () => undefined } as never,
        timer: () => {
          const tick = { stopped: false };
          ticks.push(tick);
          return () => {
            tick.stopped = true;
          };
        },
        now: () => clock,
      },
    );

    scheduler.start();
    await Bun.sleep(5);
    scheduler.stop();
    expect(runs).toBe(1);
    expect(ticks[0]?.stopped).toBe(true);
  });
});
