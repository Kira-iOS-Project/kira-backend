import { describe, expect, test } from 'bun:test';
import {
  CARE_CONTACT_KEY,
  CARE_SIGNAL_LEVEL,
  CARE_SIGNAL_SOURCE,
} from '../../../lib/constants/care.ts';
import { DEBT_KIND } from '../../../lib/constants/profile.ts';
import { CareCheckInNotFoundError } from '../care.errors.ts';
import {
  activateDebtEmergency,
  cancelCheckIn,
  dueCheckIn,
  listContacts,
  listDebts,
  markCheckInSeen,
  recordSignal,
  scheduleCheckIn,
} from '../care.service.ts';
import { CHECK_IN_ID, createCareRepositoryMock, NOW, USER_ID } from './helpers.ts';

const now = () => NOW;

describe('care service', () => {
  test('lists the contacts with the configured line, and from the environment by default', () => {
    const configured = listContacts({
      kiraLine: { phone: '0211500000', whatsapp: '081100000000' },
    });
    expect(configured.contacts.map((contact) => contact.key)).toContain(CARE_CONTACT_KEY.kiraCare);
    expect(listContacts().contacts.map((contact) => contact.key)).not.toContain(
      CARE_CONTACT_KEY.kiraCare,
    );
  });

  test('records a signal with its level and source only', async () => {
    const recorded: unknown[] = [];
    const repository = createCareRepositoryMock({
      recordSignal: async (...args) => void recorded.push(args),
    });
    const signal = { level: CARE_SIGNAL_LEVEL.danger, source: CARE_SIGNAL_SOURCE.chat };

    await recordSignal(USER_ID, signal, { repository });

    expect(recorded).toEqual([[USER_ID, signal]]);
  });

  test('schedules a check-in the chosen hours from now', async () => {
    const checkIn = await scheduleCheckIn(USER_ID, 48, {
      repository: createCareRepositoryMock(),
      now,
    });
    expect(checkIn).toEqual({ id: CHECK_IN_ID, dueAt: '2026-10-19T05:41:00.000Z' });
  });

  test('cancels and marks seen, or answers CARE_CHECK_IN_NOT_FOUND', async () => {
    const found = createCareRepositoryMock();
    const missing = createCareRepositoryMock({
      cancelCheckIn: async () => false,
      markCheckInSeen: async () => false,
    });

    await cancelCheckIn(USER_ID, CHECK_IN_ID, { repository: found });
    await markCheckInSeen(USER_ID, CHECK_IN_ID, { repository: found, now });
    await expect(
      cancelCheckIn(USER_ID, CHECK_IN_ID, { repository: missing }),
    ).rejects.toBeInstanceOf(CareCheckInNotFoundError);
    await expect(
      markCheckInSeen(USER_ID, CHECK_IN_ID, { repository: missing }),
    ).rejects.toBeInstanceOf(CareCheckInNotFoundError);
  });

  test('answers the due check-in, or null', async () => {
    const due = createCareRepositoryMock({
      findDueCheckIn: async () => ({ id: CHECK_IN_ID, dueAt: NOW }),
    });
    expect(await dueCheckIn(USER_ID, { repository: due, now })).toEqual({
      checkIn: { id: CHECK_IN_ID, dueAt: NOW.toISOString() },
    });
    expect(await dueCheckIn(USER_ID, { repository: createCareRepositoryMock() })).toEqual({
      checkIn: null,
    });
  });

  test('turns Mode Darurat Utang on, keeping the first time, or now for a vanished account', async () => {
    const first = new Date('2026-10-01T00:00:00.000Z');
    const kept = createCareRepositoryMock({ activateDebtEmergency: async () => first });
    const gone = createCareRepositoryMock({ activateDebtEmergency: async () => null });

    expect(await activateDebtEmergency(USER_ID, { repository: kept, now })).toEqual({
      activatedAt: first.toISOString(),
    });
    expect(await activateDebtEmergency(USER_ID, { repository: gone, now })).toEqual({
      activatedAt: NOW.toISOString(),
    });
  });

  test('lists the open debts', async () => {
    const debt = {
      id: 'd1',
      name: 'Kredivo',
      kind: DEBT_KIND.paylater,
      remaining: 1_200_000,
      monthlyInstalment: 300_000,
    };
    const repository = createCareRepositoryMock({ listDebts: async () => [debt] });
    expect(await listDebts(USER_ID, { repository })).toEqual({ debts: [debt] });
  });
});
