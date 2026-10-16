import { describe, expect, test } from 'bun:test';
import {
  EXPENSE_CATEGORY,
  INCOME_CATEGORY,
  TRANSACTION_SOURCE,
  TRANSACTION_TYPE,
} from '../../../lib/constants/money.ts';
import { PLAN, SUBSCRIPTION_SOURCE, SUBSCRIPTION_STATUS } from '../../../lib/constants/plans.ts';
import { activePlanOf, usageOf } from '../../../lib/usage/plan-usage.ts';
import type { BankImportRepository } from '../bank-import.repository.ts';
import { commitImport, createImport } from '../bank-import.service.ts';
import {
  createBankImportRepositoryMock,
  createImportRowMock,
  IMPORT_BODY,
  IMPORT_ID,
  NOW,
  OTHER_ROW_ID,
  ROW_ID,
} from './helpers.ts';

function planUsage(plus: boolean) {
  const plan = activePlanOf(
    plus
      ? [
          {
            plan: PLAN.plus,
            source: SUBSCRIPTION_SOURCE.purchase,
            status: SUBSCRIPTION_STATUS.active,
            currentPeriodStart: NOW,
            currentPeriodEnd: NOW,
          },
        ]
      : [],
  );
  const period = { start: '2026-10-01', resetsOn: '2026-11-01' };
  return async () => ({ plan, period, usage: usageOf(null, plan.id, period.resetsOn) });
}

let ids = 0;
const newId = () => `9d0e1f2a-0000-4000-8000-${String(++ids).padStart(12, '0')}`;

describe('createImport', () => {
  test('keeps the rows for review and flags the ones already recorded', async () => {
    const created: Parameters<BankImportRepository['create']>[0][] = [];
    const repository = createBankImportRepositoryMock({
      findRecorded: async (_userId, from, to) => {
        expect([from, to]).toEqual([
          new Date('2026-09-30T17:00:00.000Z'),
          new Date('2026-10-02T17:00:00.000Z'),
        ]);
        return [
          {
            occurredAt: new Date('2026-10-02T03:00:00.000Z'),
            type: TRANSACTION_TYPE.expense,
            amount: 18_000,
          },
        ];
      },
      create: async (input) => void created.push(input),
    });

    const result = await createImport('user-1', IMPORT_BODY, {
      repository,
      planUsage: planUsage(true),
      newId,
    });

    expect(result).toMatchObject({ rowCount: 2, dateFrom: '2026-10-01', dateTo: '2026-10-02' });
    expect(result.rows[0]).toMatchObject({
      amount: 18_000,
      type: TRANSACTION_TYPE.expense,
      isDuplicate: true,
    });
    expect(result.rows[1]).toMatchObject({
      amount: 6_000_000,
      type: TRANSACTION_TYPE.income,
      isDuplicate: false,
    });
    expect(created[0]?.bankImport).toMatchObject({
      id: result.id,
      fileName: 'mutasi-oktober.csv',
      rowCount: 2,
    });
    expect(created[0]?.rows.map((row) => row.rowIndex)).toEqual([0, 1]);
  });

  test('refuses outside Kira Plus and beyond three months', async () => {
    await expect(
      createImport('user-1', IMPORT_BODY, { planUsage: planUsage(false) }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'PLAN_FEATURE_UNAVAILABLE',
    });
    const long = {
      ...IMPORT_BODY,
      rows: [
        ...IMPORT_BODY.rows,
        {
          date: '2026-07-01',
          description: 'GAJI JULI',
          amount: 1,
          category: INCOME_CATEGORY.salary,
        },
      ],
    };
    await expect(
      createImport('user-1', long, { planUsage: planUsage(true) }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'IMPORT_RANGE_TOO_LONG',
    });
  });

  test('reads the real plan, store and ids by default', async () => {
    await expect(createImport('user-1', IMPORT_BODY)).rejects.toMatchObject({ statusCode: 403 });
    const result = await createImport('user-1', IMPORT_BODY, { planUsage: planUsage(true) });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('commitImport', () => {
  const open = { committedAt: null, savedCount: null, skippedCount: null };
  const rows = [
    createImportRowMock(),
    createImportRowMock({
      id: OTHER_ROW_ID,
      description: 'X'.repeat(200),
      type: TRANSACTION_TYPE.income,
      category: INCOME_CATEGORY.salary,
    }),
  ];

  test('saves the chosen rows with their reviewed category and skips the rest', async () => {
    const commits: Parameters<BankImportRepository['commit']>[0][] = [];
    const repository = createBankImportRepositoryMock({
      findImport: async () => open,
      findRows: async () => rows,
      commit: async (input) => {
        commits.push(input);
        return true;
      },
    });

    const result = await commitImport(
      'user-1',
      IMPORT_ID,
      { rows: [{ id: OTHER_ROW_ID, category: INCOME_CATEGORY.otherIncome }] },
      { repository, now: () => NOW },
    );

    expect(result).toEqual({ savedCount: 1, skippedCount: 1 });
    expect(commits[0]?.transactions[0]).toMatchObject({
      type: TRANSACTION_TYPE.income,
      category: INCOME_CATEGORY.otherIncome,
      source: TRANSACTION_SOURCE.bankImport,
      importId: IMPORT_ID,
      occurredAt: new Date('2026-10-01T17:00:00.000Z'),
    });
    expect(commits[0]?.transactions[0]?.name).toHaveLength(80);
  });

  test('answers the stored result for a committed import, also after losing a race', async () => {
    const done = { committedAt: NOW, savedCount: 2, skippedCount: 0 };
    let reads = 0;
    let lostReads = 0;
    const racing = createBankImportRepositoryMock({
      findImport: async () => (reads++ === 0 ? open : done),
      findRows: async () => rows,
      commit: async () => false,
    });
    const lost = createBankImportRepositoryMock({
      findImport: async () => (lostReads++ === 0 ? open : null),
      commit: async () => false,
    });
    const body = { rows: [{ id: ROW_ID, category: EXPENSE_CATEGORY.transport }] };

    expect(await commitImport('user-1', IMPORT_ID, body, { repository: racing })).toEqual({
      savedCount: 2,
      skippedCount: 0,
    });
    expect(await commitImport('user-1', IMPORT_ID, body, { repository: racing })).toEqual({
      savedCount: 2,
      skippedCount: 0,
    });
    expect(await commitImport('user-1', IMPORT_ID, { rows: [] }, { repository: lost })).toEqual({
      savedCount: 0,
      skippedCount: 0,
    });
  });

  test('refuses a category that points the other way, so a debit never becomes income', async () => {
    const commits: unknown[] = [];
    const repository = createBankImportRepositoryMock({
      findImport: async () => open,
      findRows: async () => rows,
      commit: async (input) => {
        commits.push(input);
        return true;
      },
    });

    await expect(
      commitImport(
        'user-1',
        IMPORT_ID,
        { rows: [{ id: ROW_ID, category: INCOME_CATEGORY.salary }] },
        { repository },
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: 'IMPORT_ROW_UNKNOWN' });
    expect(commits).toEqual([]);
  });

  test('refuses an unknown import and an unknown row', async () => {
    await expect(commitImport('user-1', IMPORT_ID, { rows: [] })).rejects.toMatchObject({
      statusCode: 404,
      code: 'IMPORT_NOT_FOUND',
    });
    const repository = createBankImportRepositoryMock({
      findImport: async () => open,
      findRows: async () => rows,
    });
    await expect(
      commitImport(
        'user-1',
        IMPORT_ID,
        { rows: [{ id: IMPORT_ID, category: EXPENSE_CATEGORY.food }] },
        { repository },
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: 'IMPORT_ROW_UNKNOWN' });
  });
});
