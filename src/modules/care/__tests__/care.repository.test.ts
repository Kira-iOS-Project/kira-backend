import { describe, expect, test } from 'bun:test';
import {
  CARE_SIGNAL_LEVEL,
  CARE_SIGNAL_SOURCE,
  CHECK_IN_STATUS,
} from '../../../lib/constants/care.ts';
import { DEBT_KIND } from '../../../lib/constants/profile.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createCareRepository } from '../care.repository.ts';
import { CHECK_IN_ID, NOW, USER_ID } from './helpers.ts';

const at = NOW.toISOString();

describe('createCareRepository', () => {
  test('records a signal without any text', async () => {
    const fake = createFakeDb();
    await createCareRepository(fake.db).recordSignal(USER_ID, {
      level: CARE_SIGNAL_LEVEL.concern,
      source: CARE_SIGNAL_SOURCE.checkIn,
    });
    expect(fake.queries[0]?.sql).toStartWith('insert into "care_signals"');
    expect(fake.queries[0]?.params).toEqual([
      USER_ID,
      CARE_SIGNAL_LEVEL.concern,
      CARE_SIGNAL_SOURCE.checkIn,
    ]);
  });

  test('cancels the pending check-in and schedules the new one in one transaction', async () => {
    const fake = createFakeDb(inOrder([], [{ id: CHECK_IN_ID, dueAt: at }]));
    const row = await createCareRepository(fake.db).scheduleCheckIn(USER_ID, NOW);
    expect(row).toEqual({ id: CHECK_IN_ID, dueAt: NOW });
    expect(fake.queries[0]?.sql).toStartWith('update "care_check_ins" set "status"');
    expect(fake.queries[0]?.params).toContain(CHECK_IN_STATUS.scheduled);
    expect(fake.queries[1]?.sql).toStartWith('insert into "care_check_ins"');
  });

  test('fails loudly when the insert returns nothing', async () => {
    const fake = createFakeDb();
    await expect(createCareRepository(fake.db).scheduleCheckIn(USER_ID, NOW)).rejects.toThrow(
      'not stored',
    );
    await expect(createCareRepository(fake.db).saveSafetyPlan(USER_ID, 'v1.a.b')).rejects.toThrow(
      'not stored',
    );
  });

  test('cancels and marks seen only the person’s own check-in', async () => {
    const fake = createFakeDb(inOrder([{ id: CHECK_IN_ID }], [], [{ id: CHECK_IN_ID }], []));
    const repository = createCareRepository(fake.db);
    expect(await repository.cancelCheckIn(USER_ID, CHECK_IN_ID)).toBe(true);
    expect(await repository.cancelCheckIn(USER_ID, CHECK_IN_ID)).toBe(false);
    expect(await repository.markCheckInSeen(USER_ID, CHECK_IN_ID, NOW)).toBe(true);
    expect(await repository.markCheckInSeen(USER_ID, CHECK_IN_ID, NOW)).toBe(false);
    expect(fake.queries[0]?.params).toEqual(expect.arrayContaining([USER_ID, CHECK_IN_ID]));
    expect(fake.queries[2]?.sql).toContain('coalesce("care_check_ins"."seen_at"');
  });

  test('finds the due check-in and lists the history', async () => {
    const history = {
      id: CHECK_IN_ID,
      dueAt: at,
      status: CHECK_IN_STATUS.seen,
      seenAt: at,
      createdAt: at,
    };
    const fake = createFakeDb(inOrder([{ id: CHECK_IN_ID, dueAt: at }], [], [history]));
    const repository = createCareRepository(fake.db);
    expect(await repository.findDueCheckIn(USER_ID, NOW)).toEqual({ id: CHECK_IN_ID, dueAt: NOW });
    expect(await repository.findDueCheckIn(USER_ID, NOW)).toBeNull();
    expect(await repository.listCheckIns(USER_ID)).toEqual([
      { id: CHECK_IN_ID, dueAt: NOW, status: CHECK_IN_STATUS.seen, seenAt: NOW, createdAt: NOW },
    ]);
    expect(fake.queries[0]?.sql).toContain('"care_check_ins"."due_at" <= ');
  });

  test('turns Mode Darurat Utang on once and reads it', async () => {
    const fake = createFakeDb(inOrder([{ activatedAt: at }], [], [{ activatedAt: at }], []));
    const repository = createCareRepository(fake.db);
    expect(await repository.activateDebtEmergency(USER_ID, NOW)).toEqual(NOW);
    expect(await repository.activateDebtEmergency(USER_ID, NOW)).toBeNull();
    expect(await repository.findDebtEmergency(USER_ID)).toEqual(NOW);
    expect(await repository.findDebtEmergency(USER_ID)).toBeNull();
    expect(fake.queries[0]?.sql).toContain('coalesce("users"."debt_emergency_mode_used_at"');
  });

  test('lists the debts not paid off', async () => {
    const debt = {
      id: 'd1',
      name: 'Kredivo',
      kind: DEBT_KIND.paylater,
      remaining: 1_200_000,
      monthlyInstalment: 300_000,
    };
    const fake = createFakeDb(inOrder([debt]));
    expect(await createCareRepository(fake.db).listDebts(USER_ID)).toEqual([debt]);
    expect(fake.queries[0]?.sql).toContain('"paid_off_at" is null');
  });

  test('reads and upserts the sealed plan', async () => {
    const fake = createFakeDb(
      inOrder([], [{ sealed: 'v1.a.b', updatedAt: at }], [{ sealed: 'v1.a.b', updatedAt: at }]),
    );
    const repository = createCareRepository(fake.db);
    expect(await repository.findSafetyPlan(USER_ID)).toBeNull();
    expect(await repository.findSafetyPlan(USER_ID)).toEqual({ sealed: 'v1.a.b', updatedAt: NOW });
    expect(await repository.saveSafetyPlan(USER_ID, 'v1.a.b')).toEqual({
      sealed: 'v1.a.b',
      updatedAt: NOW,
    });
    expect(fake.queries[2]?.sql).toContain('on conflict ("user_id") do update');
  });
});
