import { describe, expect, test } from 'bun:test';
import { CONSENT_PURPOSE, PRIVACY_POLICY_VERSION } from '../../../lib/constants/consents.ts';
import {
  EXPENSE_CATEGORY,
  TRANSACTION_SOURCE,
  TRANSACTION_TYPE,
} from '../../../lib/constants/money.ts';
import type { EmailMessage } from '../../../lib/email/resend.ts';
import { ExportEmailFailedError, ExportEmailRateLimitedError } from '../account.errors.ts';
import {
  EXPORT_EMAIL_COOLDOWN_MS,
  emailExport,
  exportData,
  getConsents,
  updateConsents,
} from '../account.service.ts';
import { createAccountRepositoryMock, NOW, USER_ID } from './helpers.ts';

const now = () => NOW;
const EXPORT_ROW = {
  occurredAt: NOW,
  type: TRANSACTION_TYPE.expense,
  category: EXPENSE_CATEGORY.food,
  name: 'Nasi Padang',
  amount: 25_000,
  source: TRANSACTION_SOURCE.manual,
  note: null,
};

describe('consents', () => {
  test('reads the decision in force per purpose, core always granted', async () => {
    const repository = createAccountRepositoryMock({
      latestConsents: async () => [
        { purpose: CONSENT_PURPOSE.core, granted: true, decidedAt: NOW },
        { purpose: CONSENT_PURPOSE.aiProcessing, granted: true, decidedAt: NOW },
      ],
    });

    expect(await getConsents(USER_ID, { repository })).toEqual({
      policyVersion: PRIVACY_POLICY_VERSION,
      items: [
        { purpose: CONSENT_PURPOSE.core, granted: true, decidedAt: NOW.toISOString() },
        { purpose: CONSENT_PURPOSE.aiProcessing, granted: true, decidedAt: NOW.toISOString() },
        { purpose: CONSENT_PURPOSE.weeklySummary, granted: false, decidedAt: null },
      ],
    });
  });

  test('records both toggles at the same moment, then answers the state', async () => {
    const recorded: unknown[] = [];
    const repository = createAccountRepositoryMock({
      recordConsents: async (...args) => {
        recorded.push(args);
      },
    });

    const result = await updateConsents(
      USER_ID,
      { aiProcessing: false, weeklySummary: true },
      { repository, now },
    );

    expect(recorded).toEqual([
      [
        USER_ID,
        [
          { purpose: CONSENT_PURPOSE.aiProcessing, granted: false },
          { purpose: CONSENT_PURPOSE.weeklySummary, granted: true },
        ],
        NOW,
      ],
    ]);
    expect(result.items).toHaveLength(3);
  });

  test('answers the state after recording', async () => {
    const result = await updateConsents(
      USER_ID,
      { aiProcessing: true, weeklySummary: true },
      { repository: createAccountRepositoryMock(), now },
    );

    expect(result.policyVersion).toBe(PRIVACY_POLICY_VERSION);
  });
});

describe('the data export', () => {
  test('builds the CSV with a dated file name', async () => {
    const repository = createAccountRepositoryMock({ listExportRows: async () => [EXPORT_ROW] });

    const { fileName, csv } = await exportData(USER_ID, { repository, now });

    expect(fileName).toBe('kira-data-2026-10-16.csv');
    expect(csv).toContain('Nasi Padang,25000');
  });

  test('writes the other modules’ blocks after the transactions', async () => {
    const repository = createAccountRepositoryMock({ listExportRows: async () => [EXPORT_ROW] });
    const exportSections = async (userId: string) => [
      {
        title: `Komunitas · ${userId}`,
        header: ['Tanggal', 'Grup'],
        rows: [['2026-10-16', 'A, B']],
      },
    ];

    const { csv } = await exportData(USER_ID, { repository, now, exportSections });

    expect(csv.split('\r\n').slice(-5)).toEqual([
      '',
      `Komunitas · ${USER_ID}`,
      'Tanggal,Grup',
      '2026-10-16,"A, B"',
      '',
    ]);
  });

  test('emails the CSV as an attachment to the account address', async () => {
    const sent: EmailMessage[] = [];
    const repository = createAccountRepositoryMock({ listExportRows: async () => [EXPORT_ROW] });

    await emailExport(USER_ID, {
      repository,
      now,
      send: async (message) => void sent.push(message),
      exportClaims: claims(),
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('dinda@email.com');
    expect(sent[0]?.attachments?.[0]?.filename).toBe('kira-data-2026-10-16.csv');
  });

  test('answers 503 when Resend refuses', async () => {
    const send = async () => {
      throw new Error('Resend answered 500');
    };

    const released: Date[] = [];
    const exportClaims = {
      ...claims(),
      release: async (_userId: string, at: Date) => void released.push(at),
    };

    await expect(
      emailExport(USER_ID, { repository: createAccountRepositoryMock(), now, send, exportClaims }),
    ).rejects.toBeInstanceOf(ExportEmailFailedError);
    expect(released).toEqual([NOW]);
  });

  test('answers 429 when an export went out in the last ten minutes, and sends nothing', async () => {
    const sent: EmailMessage[] = [];
    const since: Date[] = [];
    const exportClaims = {
      ...claims(),
      claim: async (_userId: string, _now: Date, after: Date) => {
        since.push(after);
        return false;
      },
    };

    await expect(
      emailExport(USER_ID, {
        repository: createAccountRepositoryMock(),
        now,
        send: async (message) => void sent.push(message),
        exportClaims,
      }),
    ).rejects.toBeInstanceOf(ExportEmailRateLimitedError);
    expect(sent).toEqual([]);
    expect(since).toEqual([new Date(NOW.getTime() - EXPORT_EMAIL_COOLDOWN_MS)]);
  });
});

/** Export claims that always allow a send and keep nothing. */
function claims() {
  return { claim: async () => true, release: async () => undefined };
}
